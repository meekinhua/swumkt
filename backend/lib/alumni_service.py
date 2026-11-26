"""
Alumni สายเทค — DB service layer (2026-11).
===========================================

Shared by `routes/alumni.py` (tree, legacy relation endpoints, invites) and
`lib/alumni_line_routes.py` (ghosts, vouching, chain, reveal, leaderboards,
meetups, benefits).  Holds every trust / privacy rule in one place so the
endpoints stay thin.  See memory/ALUMNI_CONTRACT_2026_11.md for the contract.

Collections touched:
  alumni_users, users                     (read; alumni_users also XP / lineage fields)
  alumni_relations                        (edges, extended in place — no migration)
  alumni_ghosts                           (placeholder members — NEW)
  alumni_vouches                          (one vote per voter per relation — NEW)
  alumni_ghost_claims                     (claim requests without invite — NEW)
  alumni_ghost_optouts                    (hashed "do not re-add me" — NEW)
  alumni_audit                            (audit trail — NEW)
  alumni_settings                         (kinship / benefits / cohort sizes — NEW)
  alumni_line_settings                    (per-line kinship overrides — NEW)
  alumni_invites, alumni_notifications, alumni_activities (existing)
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Set, Tuple

from fastapi import HTTPException
from pymongo import ReturnDocument

from lib import alumni_kinship as K
from lib import alumni_graph as G

log = logging.getLogger("alumni")

GHOST_FIELDS_PUBLIC = ("id", "display_name", "gen", "student_id_prefix", "gender", "status",
                       "created_by", "created_at")

# Per-user rate limits (rolling 24 h unless noted).  Tuned to stop scripted abuse
# while never getting in the way of a real person filling in their own line.
LIMITS = {
    "ghost_create": (10, 24),
    "claim": (20, 24),
    "vouch": (40, 24),
    "vouch_xp": (10, 24),        # only the first 10 vouches a day earn XP
    "invite": (30, 24),
    "ghost_remove_self": (3, 24),
    "ghost_claim_request": (5, 24),
    "nudge": (5, 24),
    "meetup_create": (3, 24),
}
MAX_ACTIVE_GHOSTS_PER_CREATOR = 60
CONNECT_DISTANCE = 3          # "same line" proximity for vouching / third-party claims
MAX_BFS_DEPTH = 12
COMPONENT_CAP = 400

XP_VOUCH = 3
XP_CLAIM_VOUCHED = 10


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ago_iso(hours: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()


def is_admin(user) -> bool:
    role = getattr(user, "role", None)
    role = getattr(role, "value", role)
    return str(role) == "admin"


def optout_hash(display_name: str, gen: Any) -> str:
    salt = os.environ.get("ALUMNI_OPTOUT_SALT", "swumkt-alumni-optout-v1")
    raw = f"{salt}|{G.normalize_name(display_name)}|{gen}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AlumniService:
    def __init__(self, db, award_xp: Callable[..., Awaitable], push_notification: Callable[..., Awaitable],
                 log_activity: Callable[..., Awaitable]):
        self.db = db
        self.award_xp = award_xp
        self.push_notification = push_notification
        self.log_activity = log_activity
        self._indexes_done = False

    # ------------------------------------------------------------ infra

    async def ensure_indexes(self):
        if self._indexes_done:
            return
        self._indexes_done = True
        try:
            db = self.db
            await db.alumni_ghosts.create_index("id", unique=True)
            await db.alumni_ghosts.create_index([("gen", 1), ("status", 1)])
            await db.alumni_relations.create_index("from_user_id")
            await db.alumni_relations.create_index("to_user_id")
            await db.alumni_vouches.create_index([("relation_id", 1), ("voter_id", 1)], unique=True)
            await db.alumni_audit.create_index([("target_id", 1), ("at", -1)])
            await db.alumni_invites.create_index("code")
            await db.alumni_ghost_claims.create_index([("ghost_id", 1), ("status", 1)])
        except Exception as e:  # pragma: no cover - index creation is best effort
            log.warning("[ALUMNI] index creation failed: %s", e)

    async def audit(self, actor_id: Optional[str], action: str, target_type: str, target_id: str,
                    meta: Optional[dict] = None):
        await self.db.alumni_audit.insert_one({
            "id": str(uuid.uuid4()), "at": now_iso(), "actor_id": actor_id, "action": action,
            "target_type": target_type, "target_id": target_id, "meta": meta or {},
        })

    async def rate_limit(self, key: str, user_id: str, count_coro: Optional[Callable[[], Awaitable[int]]] = None,
                         raise_error: bool = True) -> bool:
        """Rolling-window limit backed by the audit trail (one row per action)."""
        limit, hours = LIMITS[key]
        if count_coro is not None:
            n = await count_coro()
        else:
            n = await self.db.alumni_audit.count_documents({
                "actor_id": user_id, "action": f"rl:{key}", "at": {"$gte": ago_iso(hours)},
            })
        if n >= limit:
            if raise_error:
                raise HTTPException(status_code=429, detail={
                    "code": "rate_limited", "action": key,
                    "message": f"ทำรายการนี้ได้ไม่เกิน {limit} ครั้งต่อ {hours} ชั่วโมง · ลองใหม่ภายหลัง",
                })
            return False
        return True

    async def mark_rate(self, key: str, user_id: str):
        await self.db.alumni_audit.insert_one({
            "id": str(uuid.uuid4()), "at": now_iso(), "actor_id": user_id, "action": f"rl:{key}",
            "target_type": "rate", "target_id": user_id, "meta": {},
        })

    # ------------------------------------------------------------ people

    async def profile(self, user_id: str) -> Optional[dict]:
        return await self.db.alumni_users.find_one({"user_id": user_id}, {"_id": 0})

    async def require_member(self, user) -> dict:
        p = await self.profile(user.id)
        if not p:
            raise HTTPException(status_code=403, detail={
                "code": "alumni_member_required",
                "message": "ต้องลงทะเบียนสมาชิกสายเทคก่อน (ข้อมูลนี้เห็นได้เฉพาะสมาชิก)",
            })
        return p

    async def ghost(self, gid: str) -> Optional[dict]:
        return await self.db.alumni_ghosts.find_one({"id": gid}, {"_id": 0})

    async def node_exists(self, node_id: str) -> bool:
        if G.is_ghost(node_id):
            g = await self.ghost(node_id)
            return bool(g and g.get("status") == "active")
        return bool(await self.profile(node_id))

    async def nodes_meta(self, ids: Iterable[str], viewer_is_member: bool = True) -> Dict[str, dict]:
        """Batched display data for real members and ghosts (3 queries total)."""
        ids = [i for i in set(ids) if i]
        ghost_ids = [i for i in ids if G.is_ghost(i)]
        real_ids = [i for i in ids if not G.is_ghost(i)]
        out: Dict[str, dict] = {}
        if real_ids:
            profs = await self.db.alumni_users.find({"user_id": {"$in": real_ids}}, {"_id": 0}).to_list(len(real_ids) + 5)
            users = await self.db.users.find(
                {"id": {"$in": real_ids}},
                {"_id": 0, "id": 1, "full_name": 1, "profile_image": 1, "avatar_url": 1, "google_picture": 1},
            ).to_list(len(real_ids) + 5)
            umap = {u["id"]: u for u in users}
            for p in profs:
                u = umap.get(p["user_id"], {})
                out[p["user_id"]] = {
                    "user_id": p["user_id"],
                    "is_ghost": False,
                    "name": u.get("full_name") or p.get("nickname") or "",
                    "nickname": p.get("nickname"),
                    "student_id": p.get("student_id"),
                    "gen": p.get("gen"),
                    "role": p.get("role"),
                    "position": p.get("position"),
                    "company": p.get("company"),
                    "avatar_hue": p.get("avatar_hue", 210),
                    "avatar_url": u.get("avatar_url") or u.get("google_picture") or u.get("profile_image"),
                    "verified": p.get("verified", False),
                    "gender": p.get("kinship_gender"),
                }
        if ghost_ids:
            gs = await self.db.alumni_ghosts.find({"id": {"$in": ghost_ids}}, {"_id": 0}).to_list(len(ghost_ids) + 5)
            for g in gs:
                out[g["id"]] = self.ghost_node(g, viewer_is_member)
        return out

    @staticmethod
    def ghost_node(g: dict, viewer_is_member: bool = True) -> dict:
        name = g.get("display_name") if viewer_is_member else "สมาชิกที่ยังไม่ลงทะเบียน"
        hue = int(hashlib.md5(g["id"].encode()).hexdigest()[:4], 16) % 360
        return {
            "user_id": g["id"],
            "is_ghost": True,
            "ghost_status": g.get("status"),
            "name": name or "",
            "nickname": name,
            "student_id": None,
            "student_id_prefix": g.get("student_id_prefix") if viewer_is_member else None,
            "gen": g.get("gen"),
            "role": "unregistered",
            "position": None,
            "company": None,
            "avatar_hue": hue,
            "avatar_url": None,
            "verified": False,
            "gender": g.get("gender") if viewer_is_member else None,
            "created_by": g.get("created_by") if viewer_is_member else None,
        }

    # ------------------------------------------------------------ kinship

    async def kinship_global(self) -> Dict[str, Any]:
        doc = await self.db.alumni_settings.find_one({"id": "kinship"}, {"_id": 0}) or {}
        return doc.get("override") or {}

    async def vocab_for(self, path_ids: List[str]) -> Dict[str, Any]:
        """Effective vocabulary for a viewer whose upward primary path is path_ids."""
        glob = await self.kinship_global()
        ov = None
        if path_ids:
            docs = await self.db.alumni_line_settings.find(
                {"anchor_id": {"$in": list(path_ids)}}, {"_id": 0}
            ).to_list(len(path_ids) + 2)
            ov = K.nearest_override(path_ids, {d["anchor_id"]: d.get("override") for d in docs})
        return K.merge_settings(None, glob, ov)

    # ------------------------------------------------------------ graph reads

    async def edges_touching(self, node_ids: Iterable[str], side: str, statuses: Iterable[str]) -> List[dict]:
        """side='up' → edges whose junior is in node_ids (their parents);
        side='down' → edges whose senior is in node_ids (their children)."""
        node_ids = list(set(node_ids))
        if not node_ids:
            return []
        field = "from_user_id" if side == "up" else "to_user_id"
        sts = list(statuses)
        if "claimed" in sts and "pending" not in sts:
            sts.append("pending")
        return await self.db.alumni_relations.find(
            {field: {"$in": node_ids}, "kind": "take", "status": {"$in": sts}}, {"_id": 0}
        ).to_list(5000)

    async def bfs(self, root: str, direction: str, statuses: Iterable[str] = G.ESTABLISHED,
                  max_depth: int = 8, include_ghosts: bool = True) -> List[dict]:
        """Level-batched BFS: one query per level, never one per node."""
        statuses = list(statuses)
        visited = {root}
        result: List[dict] = []
        frontier = [root]
        via: Dict[str, dict] = {}
        depth = 0
        while frontier and depth < max_depth:
            edges = await self.edges_touching(frontier, direction, statuses)
            depth += 1
            nxt = []
            for e in edges:
                other = e["to_user_id"] if direction == "up" else e["from_user_id"]
                if other in visited:
                    continue
                visited.add(other)
                nxt.append(other)
                via[other] = e
                result.append({"user_id": other, "distance": depth, "relation_id": e["id"],
                               "link_status": G.normalize_status(e.get("status"))})
            frontier = nxt
        if not include_ghosts:
            result = [r for r in result if not G.is_ghost(r["user_id"])]
        return result

    async def would_cycle(self, junior: str, senior: str) -> bool:
        if junior == senior:
            return True
        seen = {senior}
        frontier = [senior]
        for _ in range(64):
            if not frontier:
                return False
            edges = await self.edges_touching(frontier, "up", G.LIVE)
            nxt = []
            for e in edges:
                p = e["to_user_id"]
                if p == junior:
                    return True
                if p not in seen:
                    seen.add(p)
                    nxt.append(p)
            if len(seen) > 20000:
                return True
            frontier = nxt
        return True  # absurdly deep — refuse

    async def reaches_up(self, start: str, target: str, skip_first: Optional[str] = None) -> bool:
        """Is `target` an ancestor of `start` (LIVE edges)?  If skip_first is
        given, the very first hop may not go directly to it (used by merge)."""
        edges0 = await self.edges_touching([start], "up", G.LIVE)
        frontier = [e["to_user_id"] for e in edges0 if e["to_user_id"] != skip_first]
        if target in frontier:
            return True
        seen = set(frontier) | {start}
        for _ in range(64):
            if not frontier:
                return False
            edges = await self.edges_touching(frontier, "up", G.LIVE)
            nxt = []
            for e in edges:
                p = e["to_user_id"]
                if p == target:
                    return True
                if p not in seen:
                    seen.add(p)
                    nxt.append(p)
            frontier = nxt
        return True

    async def primary_path_up(self, node: str, statuses: Iterable[str] = G.LIVE,
                              max_depth: int = MAX_BFS_DEPTH) -> List[Tuple[str, Optional[dict]]]:
        """[(node, None), (parent, edge), (grandparent, edge) …] following the
        primary พี่เทค at each step."""
        path: List[Tuple[str, Optional[dict]]] = [(node, None)]
        seen = {node}
        cur = node
        for _ in range(max_depth):
            edges = await self.edges_touching([cur], "up", statuses)
            e = G.pick_primary(edges)
            if not e or e["to_user_id"] in seen:
                break
            cur = e["to_user_id"]
            seen.add(cur)
            path.append((cur, e))
        return path

    async def neighborhood(self, node: str, depth: int = CONNECT_DISTANCE,
                           statuses: Iterable[str] = G.ESTABLISHED) -> Set[str]:
        """Nodes within `depth` links of `node` in any direction (mixed up/down)."""
        statuses = list(statuses)
        seen = {node}
        frontier = [node]
        for _ in range(depth):
            if not frontier:
                break
            ups = await self.edges_touching(frontier, "up", statuses)
            downs = await self.edges_touching(frontier, "down", statuses)
            nxt = []
            for e in ups:
                if e["to_user_id"] not in seen:
                    seen.add(e["to_user_id"]); nxt.append(e["to_user_id"])
            for e in downs:
                if e["from_user_id"] not in seen:
                    seen.add(e["from_user_id"]); nxt.append(e["from_user_id"])
            frontier = nxt
        return seen

    async def component(self, node: str, statuses: Iterable[str] = G.ESTABLISHED,
                        exclude_edge: Optional[str] = None, cap: int = COMPONENT_CAP) -> Tuple[List[dict], Set[str]]:
        """Weakly connected line containing `node` (bounded)."""
        statuses = list(statuses)
        seen = {node}
        frontier = [node]
        edges_by_id: Dict[str, dict] = {}
        while frontier and len(seen) < cap:
            ups = await self.edges_touching(frontier, "up", statuses)
            downs = await self.edges_touching(frontier, "down", statuses)
            nxt = []
            for e in ups + downs:
                if e["id"] == exclude_edge:
                    continue
                edges_by_id[e["id"]] = e
                for n in (e["from_user_id"], e["to_user_id"]):
                    if n not in seen:
                        seen.add(n); nxt.append(n)
            frontier = nxt
        return list(edges_by_id.values()), seen

    async def line_members(self, node: str) -> Set[str]:
        _, nodes = await self.component(node)
        return nodes

    async def gen_of(self, node_id: str) -> Optional[int]:
        if G.is_ghost(node_id):
            g = await self.ghost(node_id)
            return (g or {}).get("gen")
        return ((await self.profile(node_id)) or {}).get("gen")

    # ------------------------------------------------------------ edges: create

    async def can_claim(self, user_id: str, junior: str, senior: str) -> Tuple[bool, str]:
        """Who may assert "junior's พี่เทค is senior"?
        * either end themself;
        * a third party only if ≥1 end is a ghost AND the third party is
          connected to the other end or to the ghost (within CONNECT_DISTANCE
          over established links or links they claimed themselves, or they
          created the ghost).  Third parties can never link two real members."""
        if user_id in (junior, senior):
            return True, ""
        if not G.is_ghost(junior) and not G.is_ghost(senior):
            return False, "เชื่อมสมาชิกจริงสองคนแทนคนอื่นไม่ได้ · ให้เจ้าตัวกดเอง"
        near = await self.neighborhood(user_id, CONNECT_DISTANCE, statuses=G.ESTABLISHED)
        mine = await self.db.alumni_relations.find(
            {"created_by": user_id, "status": {"$in": list(G.LIVE)}}, {"_id": 0, "from_user_id": 1, "to_user_id": 1}
        ).to_list(1000)
        for e in mine:
            near.add(e["from_user_id"]); near.add(e["to_user_id"])
        if junior in near or senior in near:
            return True, ""
        for end in (junior, senior):
            if G.is_ghost(end):
                g = await self.ghost(end)
                if g and g.get("created_by") == user_id:
                    return True, ""
        return False, "คุณต้องอยู่ในสายเดียวกัน (ไม่เกิน 3 ทอด) กับคนใดคนหนึ่งก่อน"

    async def create_edge(self, junior: str, senior: str, claimant_id: str, source: str = "claim",
                          check_gen: bool = True, notify: bool = True) -> dict:
        if junior == senior:
            raise HTTPException(status_code=400, detail="เชื่อมกับตัวเองไม่ได้")
        for n in (junior, senior):
            if not await self.node_exists(n):
                raise HTTPException(status_code=404, detail=f"ไม่พบสมาชิก {n}")
        existing = await self.db.alumni_relations.find_one({
            "kind": "take", "status": {"$in": list(G.LIVE)},
            "$or": [{"from_user_id": junior, "to_user_id": senior},
                    {"from_user_id": senior, "to_user_id": junior}],
        }, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail={
                "code": "relation_exists", "relation_id": existing["id"],
                "message": "มีความสัมพันธ์นี้อยู่แล้ว",
            })
        if check_gen:
            jg, sg = await self.gen_of(junior), await self.gen_of(senior)
            if jg is not None and sg is not None and int(sg) >= int(jg):
                raise HTTPException(status_code=400, detail={
                    "code": "gen_order",
                    "message": f"พี่เทคต้องอยู่รุ่นก่อนน้องเทค (รุ่น {sg} ไม่ได้อยู่ก่อนรุ่น {jg})",
                })
        if await self.would_cycle(junior, senior):
            raise HTTPException(status_code=409, detail={
                "code": "cycle", "message": "เชื่อมแบบนี้จะทำให้สายวนเป็นวงกลม (คนนี้อยู่ใต้คุณในสายอยู่แล้ว)",
            })
        now = now_iso()
        rel = {
            "id": str(uuid.uuid4()),
            "from_user_id": junior,
            "to_user_id": senior,
            "from_is_ghost": G.is_ghost(junior),
            "to_is_ghost": G.is_ghost(senior),
            "kind": "take",
            "status": "claimed",
            "junior_ok": True if claimant_id == junior else None,
            "senior_ok": True if claimant_id == senior else None,
            "confirmed_by_from": claimant_id == junior,   # legacy mirror
            "confirmed_by_to": claimant_id == senior,     # legacy mirror
            "derived": False,
            "primary": True,
            "conflict": False,
            "vouch_yes": 0,
            "vouch_no": 0,
            "decided_by": None,
            "decided_at": None,
            "created_by": claimant_id,
            "source": source,
            "xp_awarded_to": [],
            "created_at": now,
            "confirmed_at": None,
        }
        status, decided = G.compute_status(rel)
        rel["status"], rel["decided_by"] = status, decided
        await self.db.alumni_relations.insert_one(dict(rel))
        await self.audit(claimant_id, "relation_claim", "relation", rel["id"],
                         {"junior": junior, "senior": senior, "source": source})
        await self.recompute_conflicts(junior)
        rel = await self.db.alumni_relations.find_one({"id": rel["id"]}, {"_id": 0})
        if notify:
            await self._notify_counterparts(rel, claimant_id)
        return rel

    async def _notify_counterparts(self, rel: dict, claimant_id: str):
        meta = await self.nodes_meta([rel["from_user_id"], rel["to_user_id"], claimant_id])
        cname = (meta.get(claimant_id) or {}).get("nickname") or "สมาชิก"
        for end, role in ((rel["to_user_id"], "senior"), (rel["from_user_id"], "junior")):
            if G.is_ghost(end) or end == claimant_id:
                continue
            other = rel["from_user_id"] if role == "senior" else rel["to_user_id"]
            oname = (meta.get(other) or {}).get("nickname") or "สมาชิก"
            if role == "senior":
                title = "🤝 มีคนบอกว่าคุณเป็นพี่เทคของเขา"
                body = f"{cname} บอกว่าคุณเป็นพี่เทคของ {oname} · กดยืนยันหรือปฏิเสธได้"
            else:
                title = "🤝 มีคนบอกว่าคุณเป็นน้องเทคของเขา"
                body = f"{cname} บอกว่า {oname} เป็นพี่เทคของคุณ · กดยืนยันหรือปฏิเสธได้"
            await self.push_notification(end, "mark_request", title, body,
                                         {"relation_id": rel["id"], "from_user_id": claimant_id})

    # ------------------------------------------------------------ edges: state

    async def recompute_conflicts(self, junior: str):
        parents = await self.db.alumni_relations.find(
            {"from_user_id": junior, "kind": "take", "status": {"$nin": list(G.DEAD)}}, {"_id": 0}
        ).to_list(200)
        flagged = G.parent_conflicts(parents)
        for e in parents:
            want = e["id"] in flagged
            if bool(e.get("conflict")) != want:
                await self.db.alumni_relations.update_one({"id": e["id"]}, {"$set": {"conflict": want}})
                e["conflict"] = want
            await self.refresh(e)

    async def refresh(self, rel: dict, actor_id: Optional[str] = None) -> dict:
        """Recompute status from facts; persist; fire transition side effects."""
        old = G.normalize_status(rel.get("status"))
        new, decided_by = G.compute_status(rel)
        if new == old and decided_by == rel.get("decided_by"):
            return rel
        update = {"status": new, "decided_by": decided_by, "decided_at": now_iso()}
        if new == "confirmed":
            update["confirmed_at"] = now_iso()
        # Compute "new level" before the edge becomes established.
        grew = None
        if new in G.ESTABLISHED and old not in G.ESTABLISHED:
            grew = await self._line_growth(rel)
        await self.db.alumni_relations.update_one({"id": rel["id"]}, {"$set": update})
        rel = {**rel, **update}
        await self.audit(actor_id, f"status:{old}->{new}", "relation", rel["id"], {"decided_by": decided_by})
        if new in G.ESTABLISHED and old not in G.ESTABLISHED:
            await self._on_established(rel, grew)
        if new == "confirmed" and old != "confirmed" and old in G.ESTABLISHED:
            await self._award_once(rel, ["from_user_id", "to_user_id"])
        return rel

    async def _award_once(self, rel: dict, ends: List[str]):
        awarded = set(rel.get("xp_awarded_to") or [])
        for f in ends:
            uid = rel.get(f)
            if not uid or G.is_ghost(uid) or uid in awarded:
                continue
            end = "junior" if f == "from_user_id" else "senior"
            if G.end_ok(rel, end) is not True:
                continue
            res = await self.db.alumni_relations.update_one(
                {"id": rel["id"], "xp_awarded_to": {"$ne": uid}}, {"$addToSet": {"xp_awarded_to": uid}})
            if res.modified_count:
                awarded.add(uid)
                await self.award_xp(uid, "relation_confirmed")
        rel["xp_awarded_to"] = list(awarded)

    async def _on_established(self, rel: dict, grew: Optional[dict]):
        await self._award_once(rel, ["from_user_id", "to_user_id"])
        claimant = rel.get("created_by")
        if claimant and claimant not in (rel["from_user_id"], rel["to_user_id"]) and not G.is_ghost(claimant):
            res = await self.db.alumni_relations.update_one(
                {"id": rel["id"], "xp_awarded_to": {"$ne": claimant}}, {"$addToSet": {"xp_awarded_to": claimant}})
            if res.modified_count:
                await self.award_xp(claimant, "claim_vouched", XP_CLAIM_VOUCHED)
        meta = await self.nodes_meta([rel["from_user_id"], rel["to_user_id"]])
        jn = (meta.get(rel["from_user_id"]) or {}).get("nickname") or "บางคน"
        sn = (meta.get(rel["to_user_id"]) or {}).get("nickname") or "บางคน"
        actor = rel["from_user_id"] if not G.is_ghost(rel["from_user_id"]) else claimant
        if actor and not G.is_ghost(actor):
            await self.log_activity(actor, "tree_extended", f"{jn} ↔ {sn} เชื่อมสายเทคแล้ว",
                                    target_id=rel["to_user_id"], meta={"relation_id": rel["id"],
                                                                       "status": rel["status"]})
        if claimant and not G.is_ghost(claimant):
            await self.push_notification(claimant, "relation_confirmed", "✅ สายเทคได้รับการยืนยันแล้ว",
                                         f"{jn} → พี่เทค {sn} ({'เจ้าตัวยืนยัน' if rel['status'] == 'confirmed' else 'เพื่อนในสายรับรอง'})",
                                         {"relation_id": rel["id"]})
        if grew and grew.get("grew"):
            await self._notify_new_level(grew)

    async def _line_growth(self, rel: dict) -> dict:
        ej, nj = await self.component(rel["from_user_id"], exclude_edge=rel["id"])
        es, ns = await self.component(rel["to_user_id"], exclude_edge=rel["id"])
        before_j = G.span(G.component_levels([(e["from_user_id"], e["to_user_id"]) for e in ej], rel["from_user_id"]))
        before_s = G.span(G.component_levels([(e["from_user_id"], e["to_user_id"]) for e in es], rel["to_user_id"]))
        all_edges = {e["id"]: e for e in ej + es}
        pairs = [(e["from_user_id"], e["to_user_id"]) for e in all_edges.values()] + [(rel["from_user_id"], rel["to_user_id"])]
        after = G.span(G.component_levels(pairs, rel["from_user_id"]))
        return {"grew": after > max(before_j, before_s), "span": after, "members": list(nj | ns)}

    async def _notify_new_level(self, grew: dict):
        members = [m for m in grew["members"] if not G.is_ghost(m)][:300]
        if not members:
            return
        now = now_iso()
        docs = [{
            "id": str(uuid.uuid4()), "user_id": m, "kind": "line_new_level",
            "title": f"🎉 สายเทคของคุณยาวขึ้นเป็น {grew['span']} รุ่นแล้ว!",
            "body": "มีรุ่นใหม่เข้ามาในสาย · ไปดูต้นไม้และชวนรุ่นถัดไปต่อเลย",
            "meta": {"span": grew["span"]}, "read": False, "created_at": now,
        } for m in members]
        await self.db.alumni_notifications.insert_many(docs)

    async def respond(self, rel_id: str, user, accept: bool) -> dict:
        """The counterpart's own answer. Always overrides crowd votes."""
        rel = await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        if rel.get("status") == "removed":
            raise HTTPException(status_code=410, detail="ความสัมพันธ์นี้ถูกลบแล้ว")
        if user.id == rel["to_user_id"]:
            key, legacy = "senior_ok", "confirmed_by_to"
        elif user.id == rel["from_user_id"]:
            key, legacy = "junior_ok", "confirmed_by_from"
        else:
            raise HTTPException(status_code=403, detail="Only the people in this relation can answer")
        if user.id == rel.get("created_by") and not accept:
            raise HTTPException(status_code=400, detail="ถ้าต้องการถอนคำอ้างของตัวเอง ให้ลบความสัมพันธ์แทน")
        await self.db.alumni_relations.update_one({"id": rel_id}, {"$set": {key: bool(accept), legacy: bool(accept)}})
        rel[key] = bool(accept)
        rel[legacy] = bool(accept)
        await self.audit(user.id, "counterpart_accept" if accept else "counterpart_reject", "relation", rel_id)
        rel = await self.refresh(rel, actor_id=user.id)
        await self.recompute_conflicts(rel["from_user_id"])
        return await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})

    async def can_vouch(self, voter_id: str, rel: dict) -> Tuple[bool, str]:
        if voter_id in (rel["from_user_id"], rel["to_user_id"]):
            return False, "คนในความสัมพันธ์ให้ตอบยืนยัน/ปฏิเสธแทนการโหวต"
        if voter_id == rel.get("created_by"):
            return False, "ผู้อ้างโหวตรับรองคำอ้างของตัวเองไม่ได้"
        voter = await self.profile(voter_id)
        if not voter:
            return False, "ต้องเป็นสมาชิกที่ลงทะเบียนแล้ว"
        gens = {await self.gen_of(rel["from_user_id"]), await self.gen_of(rel["to_user_id"])} - {None}
        if voter.get("gen") is not None and voter.get("gen") in gens:
            return True, "same_cohort"
        near = await self.neighborhood(voter_id, CONNECT_DISTANCE)
        if rel["from_user_id"] in near or rel["to_user_id"] in near:
            return True, "same_line"
        return False, "ต้องอยู่รุ่นเดียวกันหรืออยู่ในสายเดียวกัน (ไม่เกิน 3 ทอด) กับคนใดคนหนึ่ง"

    async def vouch(self, rel_id: str, voter, vote: str) -> dict:
        if vote not in ("yes", "no"):
            raise HTTPException(status_code=400, detail="vote ต้องเป็น yes หรือ no")
        rel = await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        st = G.normalize_status(rel.get("status"))
        if st in ("confirmed", "removed") or rel.get("decided_by") in ("counterpart", "admin"):
            raise HTTPException(status_code=409, detail={
                "code": "decided", "message": "เจ้าตัวหรือแอดมินตัดสินแล้ว · ไม่ต้องโหวต"})
        ok, why = await self.can_vouch(voter.id, rel)
        if not ok:
            raise HTTPException(status_code=403, detail={"code": "not_eligible", "message": why})
        prev = await self.db.alumni_vouches.find_one({"relation_id": rel_id, "voter_id": voter.id}, {"_id": 0})
        if prev and prev.get("vote") == vote:
            return {"relation": rel, "vote": vote, "changed": False}
        if not prev:
            await self.rate_limit("vouch", voter.id)
        now = now_iso()
        if prev:
            await self.db.alumni_vouches.update_one({"id": prev["id"]}, {"$set": {"vote": vote, "updated_at": now}})
        else:
            await self.db.alumni_vouches.insert_one({
                "id": str(uuid.uuid4()), "relation_id": rel_id, "voter_id": voter.id, "vote": vote,
                "basis": why, "created_at": now, "updated_at": now,
            })
            await self.mark_rate("vouch", voter.id)
            if await self.rate_limit("vouch_xp", voter.id, raise_error=False):
                await self.mark_rate("vouch_xp", voter.id)
                await self.award_xp(voter.id, "vouch", XP_VOUCH)
        await self.audit(voter.id, f"vouch_{vote}", "relation", rel_id, {"basis": why})
        rel = await self.recount(rel_id, actor_id=voter.id)
        return {"relation": rel, "vote": vote, "changed": True}

    async def recount(self, rel_id: str, actor_id: Optional[str] = None) -> dict:
        votes = await self.db.alumni_vouches.find({"relation_id": rel_id}, {"_id": 0, "vote": 1}).to_list(1000)
        yes = sum(1 for v in votes if v["vote"] == "yes")
        no = sum(1 for v in votes if v["vote"] == "no")
        await self.db.alumni_relations.update_one({"id": rel_id}, {"$set": {"vouch_yes": yes, "vouch_no": no}})
        rel = await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})
        rel = await self.refresh(rel, actor_id=actor_id)
        await self.recompute_conflicts(rel["from_user_id"])
        return await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})

    async def admin_decide(self, rel_id: str, admin, decision: str) -> dict:
        if decision not in ("confirm", "reject", "clear"):
            raise HTTPException(status_code=400, detail="decision: confirm | reject | clear")
        rel = await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        val = None if decision == "clear" else decision
        await self.db.alumni_relations.update_one({"id": rel_id}, {"$set": {"admin_decision": val}})
        rel["admin_decision"] = val
        await self.audit(admin.id, f"admin_{decision}", "relation", rel_id)
        await self.refresh(rel, actor_id=admin.id)
        await self.recompute_conflicts(rel["from_user_id"])
        return await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})

    async def delete_edge(self, rel_id: str, user) -> None:
        rel = await self.db.alumni_relations.find_one({"id": rel_id}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        ends = (rel["from_user_id"], rel["to_user_id"])
        allowed = user.id in ends or is_admin(user) or (
            user.id == rel.get("created_by") and G.normalize_status(rel.get("status")) != "confirmed")
        if not allowed:
            raise HTTPException(status_code=403, detail="Cannot delete others' relations")
        await self.db.alumni_relations.delete_one({"id": rel_id})
        await self.db.alumni_vouches.delete_many({"relation_id": rel_id})
        await self.audit(user.id, "relation_delete", "relation", rel_id,
                         {"junior": rel["from_user_id"], "senior": rel["to_user_id"], "status": rel.get("status")})
        await self.recompute_conflicts(rel["from_user_id"])

    # ------------------------------------------------------------ ghosts

    async def create_ghost(self, user, display_name: str, gen: int, student_id_prefix: Optional[str],
                           gender: Optional[str]) -> dict:
        await self.rate_limit("ghost_create", user.id)
        active = await self.db.alumni_ghosts.count_documents({"created_by": user.id, "status": "active"})
        if active >= MAX_ACTIVE_GHOSTS_PER_CREATOR:
            raise HTTPException(status_code=429, detail={"code": "too_many_ghosts",
                                                         "message": "คุณสร้างสมาชิกรอลงทะเบียนไว้มากเกินไปแล้ว"})
        if await self.db.alumni_ghost_optouts.find_one({"hash": optout_hash(display_name, gen)}):
            raise HTTPException(status_code=403, detail={
                "code": "opted_out", "message": "บุคคลนี้ขอไม่ให้เพิ่มชื่อในระบบ"})
        g = {
            "id": G.GHOST_PREFIX + uuid.uuid4().hex[:16],
            "display_name": display_name,
            "gen": gen,
            "student_id_prefix": student_id_prefix,
            "gender": K.normalize_gender(gender) if gender else None,
            "status": "active",
            "created_by": user.id,
            "created_at": now_iso(),
            "claimed_by_user_id": None,
        }
        if g["gender"] == "u":
            g["gender"] = None
        await self.db.alumni_ghosts.insert_one(dict(g))
        await self.mark_rate("ghost_create", user.id)
        await self.audit(user.id, "ghost_create", "ghost", g["id"], {"gen": gen})
        return g

    async def similar_ghosts(self, display_name: str, gen: Optional[int], limit: int = 5,
                             threshold: float = 0.6) -> List[dict]:
        q: Dict[str, Any] = {"status": "active"}
        if gen is not None:
            q["gen"] = gen
        pool = await self.db.alumni_ghosts.find(q, {"_id": 0}).to_list(2000)
        scored = []
        for g in pool:
            s = G.name_similarity(display_name, g.get("display_name"))
            if s >= threshold:
                scored.append((s, g))
        scored.sort(key=lambda x: -x[0])
        return [{**self.ghost_node(g), "similarity": s} for s, g in scored[:limit]]

    async def ghost_approvers(self, gid: str) -> Set[str]:
        """Real members allowed to approve that someone IS this ghost: the
        ghost's creator and every real member directly linked to it."""
        g = await self.ghost(gid)
        out: Set[str] = set()
        if g and g.get("created_by"):
            out.add(g["created_by"])
        edges = await self.db.alumni_relations.find(
            {"$or": [{"from_user_id": gid}, {"to_user_id": gid}], "status": {"$nin": list(G.DEAD)}},
            {"_id": 0, "from_user_id": 1, "to_user_id": 1, "created_by": 1}).to_list(500)
        for e in edges:
            for n in (e["from_user_id"], e["to_user_id"], e.get("created_by")):
                if n and not G.is_ghost(n):
                    out.add(n)
        return out

    async def remove_ghost(self, gid: str, user, reason: str, self_identify: bool, do_not_readd: bool) -> dict:
        g = await self.ghost(gid)
        if not g or g.get("status") != "active":
            raise HTTPException(status_code=404, detail="ไม่พบสมาชิกรอลงทะเบียนนี้")
        admin = is_admin(user)
        if not admin and not self_identify:
            if g.get("created_by") != user.id:
                raise HTTPException(status_code=403, detail="ลบได้เฉพาะผู้สร้าง เจ้าตัว หรือแอดมิน")
            others = await self.db.alumni_relations.count_documents({
                "$or": [{"from_user_id": gid}, {"to_user_id": gid}],
                "status": {"$nin": list(G.DEAD)}, "created_by": {"$ne": user.id}})
            if others:
                raise HTTPException(status_code=409, detail={
                    "code": "linked_by_others",
                    "message": "มีสมาชิกคนอื่นเชื่อมโยงกับชื่อนี้แล้ว · ขอให้เจ้าตัวหรือแอดมินลบแทน"})
        if self_identify and not admin:
            await self.rate_limit("ghost_remove_self", user.id)
            await self.mark_rate("ghost_remove_self", user.id)
        if do_not_readd:
            await self.db.alumni_ghost_optouts.update_one(
                {"hash": optout_hash(g.get("display_name") or "", g.get("gen"))},
                {"$setOnInsert": {"hash": optout_hash(g.get("display_name") or "", g.get("gen")),
                                  "created_at": now_iso()}}, upsert=True)
        now = now_iso()
        # PDPA erasure: scrub the identifying fields, keep an inert tombstone so
        # existing ids still resolve and the audit trail stays coherent.
        await self.db.alumni_ghosts.update_one({"id": gid}, {"$set": {
            "status": "removed", "display_name": None, "student_id_prefix": None, "gender": None,
            "removed_at": now, "removed_by": user.id,
            "removed_reason": (reason or "")[:200],
            "removed_as": "admin" if admin else ("self" if self_identify else "creator"),
        }})
        edges = await self.db.alumni_relations.find(
            {"$or": [{"from_user_id": gid}, {"to_user_id": gid}]}, {"_id": 0, "id": 1, "from_user_id": 1}).to_list(1000)
        await self.db.alumni_relations.update_many(
            {"$or": [{"from_user_id": gid}, {"to_user_id": gid}]},
            {"$set": {"status": "removed", "removed": True, "decided_at": now}})
        await self.db.alumni_invites.update_many({"ghost_id": gid, "status": {"$ne": "registered"}},
                                                 {"$set": {"status": "expired"}})
        await self.db.alumni_ghost_claims.update_many({"ghost_id": gid, "status": "pending"},
                                                      {"$set": {"status": "cancelled"}})
        for e in edges:
            if not G.is_ghost(e["from_user_id"]):
                await self.recompute_conflicts(e["from_user_id"])
        await self.audit(user.id, "ghost_remove", "ghost", gid,
                         {"as": "admin" if admin else ("self" if self_identify else "creator"),
                          "do_not_readd": do_not_readd})
        return {"ghost_id": gid, "status": "removed", "relations_removed": len(edges)}

    async def merge_ghost(self, gid: str, into: str, actor_id: str, via: str,
                          confirm_relation_ids: Optional[List[str]] = None, confirm_all: bool = False) -> dict:
        """Merge ghost `gid` into node `into` (a real member, or — admin dedupe —
        another ghost).  Order of operations makes the merge resumable and
        idempotent: lock the ghost → pre-check cycles → rewrite edges in place
        (ids kept, so vouches follow) → fold duplicates → mark claimed."""
        if gid == into or not G.is_ghost(gid):
            raise HTTPException(status_code=400, detail="merge ไม่ถูกต้อง")
        g = await self.db.alumni_ghosts.find_one_and_update(
            {"id": gid, "status": "active"},
            {"$set": {"status": "merging", "merging_into": into, "merging_at": now_iso()}},
            projection={"_id": 0}, return_document=ReturnDocument.AFTER)
        if not g:
            g = await self.ghost(gid)
            if not g:
                raise HTTPException(status_code=404, detail="ไม่พบสมาชิกรอลงทะเบียนนี้")
            if g.get("status") == "claimed" and g.get("claimed_by_user_id") == into:
                return {"ghost_id": gid, "merged_into": into, "already": True, "relations": []}
            if not (g.get("status") == "merging" and g.get("merging_into") == into):
                raise HTTPException(status_code=409, detail={
                    "code": "ghost_unavailable", "message": "ชื่อนี้ถูกยืนยันตัวตนไปแล้วหรือถูกลบแล้ว"})
        # Pre-check: merging two DAG nodes creates a cycle iff one reaches the
        # other through a path of length ≥ 2 (direct links become self-loops
        # and are dropped).
        if await self.reaches_up(into, gid, skip_first=gid) or await self.reaches_up(gid, into, skip_first=into):
            await self.db.alumni_ghosts.update_one({"id": gid}, {"$set": {"status": "active"},
                                                                 "$unset": {"merging_into": "", "merging_at": ""}})
            raise HTTPException(status_code=409, detail={
                "code": "cycle", "message": "รวมชื่อนี้ไม่ได้ เพราะจะทำให้สายวนเป็นวงกลม · ติดต่อแอดมิน"})
        edges = await self.db.alumni_relations.find(
            {"$or": [{"from_user_id": gid}, {"to_user_id": gid}]}, {"_id": 0}).to_list(2000)
        touched_juniors: Set[str] = set()
        kept_ids: List[str] = []
        for e in edges:
            j = into if e["from_user_id"] == gid else e["from_user_id"]
            s = into if e["to_user_id"] == gid else e["to_user_id"]
            if j == s:
                await self.db.alumni_relations.update_one({"id": e["id"]}, {"$set": {
                    "status": "removed", "removed": True, "removed_reason": "merge_self_loop",
                    "decided_at": now_iso()}})
                continue
            if e.get("status") in G.DEAD:
                await self.db.alumni_relations.update_one({"id": e["id"]}, {"$set": {
                    "from_user_id": j, "to_user_id": s, "from_is_ghost": G.is_ghost(j),
                    "to_is_ghost": G.is_ghost(s), "merged_from_ghost": gid}})
                continue
            dup = await self.db.alumni_relations.find_one({
                "id": {"$ne": e["id"]}, "kind": "take", "status": {"$nin": list(G.DEAD)},
                "from_user_id": j, "to_user_id": s}, {"_id": 0})
            if dup:
                # Fold e into dup: affirmations OR-ed, votes moved (one per voter).
                upd = {}
                for key, legacy in (("junior_ok", "confirmed_by_from"), ("senior_ok", "confirmed_by_to")):
                    end = "junior" if key == "junior_ok" else "senior"
                    if G.end_ok(e, end) is True and G.end_ok(dup, end) is not True:
                        upd[key] = True; upd[legacy] = True
                if upd:
                    await self.db.alumni_relations.update_one({"id": dup["id"]}, {"$set": upd})
                votes = await self.db.alumni_vouches.find({"relation_id": e["id"]}, {"_id": 0}).to_list(1000)
                for v in votes:
                    exists = await self.db.alumni_vouches.find_one({"relation_id": dup["id"], "voter_id": v["voter_id"]})
                    if exists:
                        await self.db.alumni_vouches.delete_one({"id": v["id"]})
                    else:
                        await self.db.alumni_vouches.update_one({"id": v["id"]}, {"$set": {"relation_id": dup["id"]}})
                await self.db.alumni_relations.update_one({"id": e["id"]}, {"$set": {
                    "status": "removed", "removed": True, "removed_reason": "merge_duplicate",
                    "merged_into_relation": dup["id"], "decided_at": now_iso()}})
                kept_ids.append(dup["id"])
                touched_juniors.add(j)
                continue
            await self.db.alumni_relations.update_one({"id": e["id"]}, {"$set": {
                "from_user_id": j, "to_user_id": s, "from_is_ghost": G.is_ghost(j),
                "to_is_ghost": G.is_ghost(s), "merged_from_ghost": gid}})
            kept_ids.append(e["id"])
            touched_juniors.add(j)
        # A member's own earlier votes on links they are now an end of are void.
        if not G.is_ghost(into):
            for rid in kept_ids:
                await self.db.alumni_vouches.delete_many({"relation_id": rid, "voter_id": into})
        for rid in set(kept_ids):
            await self.recount(rid, actor_id=actor_id)
        for j in touched_juniors:
            await self.recompute_conflicts(j)
        await self.db.alumni_invites.update_many({"ghost_id": gid}, {"$set": {"ghost_merged_into": into}})
        await self.db.alumni_ghost_claims.update_many({"ghost_id": gid, "status": "pending"},
                                                      {"$set": {"status": "superseded"}})
        await self.db.alumni_ghosts.update_one({"id": gid}, {"$set": {
            "status": "claimed", "claimed_by_user_id": into, "merged_at": now_iso(), "merged_via": via},
            "$unset": {"merging_into": "", "merging_at": ""}})
        await self.audit(actor_id, "ghost_merge", "ghost", gid, {"into": into, "via": via,
                                                                  "relations": sorted(set(kept_ids))})
        # Optional: the new member confirms inherited links right away.
        confirmed = []
        if not G.is_ghost(into) and (confirm_all or confirm_relation_ids):
            class _U:  # minimal user object for respond()
                id = into
                role = None
            want = set(confirm_relation_ids or [])
            for rid in set(kept_ids):
                if confirm_all or rid in want:
                    try:
                        await self.respond(rid, _U, True)
                        confirmed.append(rid)
                    except HTTPException:
                        pass
        rels = await self.db.alumni_relations.find({"id": {"$in": list(set(kept_ids))}}, {"_id": 0}).to_list(2000)
        return {"ghost_id": gid, "merged_into": into, "relations": rels, "confirmed": confirmed}
