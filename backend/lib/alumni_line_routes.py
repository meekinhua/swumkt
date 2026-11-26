"""
Alumni สายเทค — 2026-11 endpoints (registered on the existing alumni router).
============================================================================

Registered from `routes/alumni.py::get_alumni_routes`, so no change to
server.py is needed.  Contract: memory/ALUMNI_CONTRACT_2026_11.md.

No LLM is used anywhere in this module.
"""
from __future__ import annotations

import re
import uuid
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import Body, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from lib import alumni_graph as G
from lib import alumni_kinship as K
from lib.alumni_service import AlumniService, is_admin, now_iso, ago_iso
from lib.ttl_cache import async_ttl_cache

MAX_GUESSES = 3
INTEREST_KEYS = ("mentor", "guest_speaker", "judge")
AUDIENCES = ("all", "alumni", "current_student")
RSVP = ("going", "maybe", "no")

DEFAULT_BENEFITS: List[Dict[str, Any]] = [
    {"id": "research-tools", "title": "เครื่องมือวิจัยการตลาดสำหรับงานจริง",
     "description": "Conjoint, Brand Equity, Customer Journey และอื่น ๆ — ใช้ฟรีกับงานของคุณ",
     "link": "/market-research", "audience": "all", "interest_key": None, "icon": "chart", "order": 10, "active": True},
    {"id": "publications", "title": "บทความและงานวิจัยของคณาจารย์",
     "description": "อัปเดตองค์ความรู้การตลาดล่าสุดจากภาควิชา",
     "link": "/publications", "audience": "all", "interest_key": None, "icon": "book", "order": 20, "active": True},
    {"id": "people", "title": "ทำเนียบอาจารย์และผู้เชี่ยวชาญ",
     "description": "หาผู้เชี่ยวชาญที่ใช่สำหรับโปรเจกต์หรือที่ปรึกษา",
     "link": "/people", "audience": "all", "interest_key": None, "icon": "users", "order": 30, "active": True},
    {"id": "jobs", "title": "งานและการ refer จากพี่ในสาย",
     "description": "ลงประกาศงาน หรือขอ refer จากศิษย์เก่าในเครือข่าย",
     "link": "/alumni/jobs", "audience": "all", "interest_key": None, "icon": "briefcase", "order": 40, "active": True},
    {"id": "mentor", "title": "เป็นพี่เลี้ยง (Mentor) ให้น้อง",
     "description": "เปิดรับน้องปรึกษาเรื่องงาน/ฝึกงาน — กดสนใจแล้วภาควิชาจะติดต่อ",
     "link": None, "audience": "alumni", "interest_key": "mentor", "icon": "heart", "order": 50, "active": True},
    {"id": "guest-speaker", "title": "วิทยากรรับเชิญ",
     "description": "มาแชร์ประสบการณ์ในคลาสหรือกิจกรรมของภาค",
     "link": None, "audience": "alumni", "interest_key": "guest_speaker", "icon": "mic", "order": 60, "active": True},
    {"id": "judge", "title": "กรรมการตัดสินโครงการ / แข่งขัน",
     "description": "ร่วมเป็นกรรมการ pitching, case competition หรือโปรเจกต์จบ",
     "link": None, "audience": "alumni", "interest_key": "judge", "icon": "award", "order": 70, "active": True},
]


# ============================================================ models

class GhostAttach(BaseModel):
    to: Optional[str] = None                  # node id; default = me
    as_: str = Field("senior", alias="as")    # the GHOST is the senior / junior of `to`

    model_config = {"populate_by_name": True}


class GhostCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=60)
    gen: int = Field(..., ge=1, le=200)
    student_id_prefix: Optional[str] = Field(None, max_length=4)
    gender: Optional[str] = None
    attach: Optional[GhostAttach] = None
    force: bool = False                        # create even if similar ghosts exist

    @field_validator("display_name")
    @classmethod
    def _name(cls, v):
        v = re.sub(r"[\x00-\x1f\x7f]", "", v).strip()
        if not v:
            raise ValueError("ห้ามว่าง")
        if re.search(r"[@]|\d{6,}", v):
            raise ValueError("ใส่เฉพาะชื่อ/ชื่อเล่น — ห้ามใส่อีเมลหรือเบอร์โทร")
        return v

    @field_validator("student_id_prefix")
    @classmethod
    def _prefix(cls, v):
        if v in (None, ""):
            return None
        if not re.fullmatch(r"\d{1,4}", v):
            raise ValueError("รหัสขึ้นต้นใส่ได้เฉพาะตัวเลข 1–4 หลัก")
        return v


class GhostUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=60)
    gen: Optional[int] = Field(None, ge=1, le=200)
    student_id_prefix: Optional[str] = Field(None, max_length=4)
    gender: Optional[str] = None


class GhostRemove(BaseModel):
    reason: Optional[str] = Field(None, max_length=200)
    self_identify: bool = False
    do_not_readd: bool = False


class GhostInvite(BaseModel):
    clue: Optional[str] = Field(None, max_length=140)
    reveal_game: bool = True


class GhostClaim(BaseModel):
    invite_code: Optional[str] = None
    confirm_relation_ids: List[str] = []
    confirm_all: bool = False


class Decide(BaseModel):
    approve: bool


class ClaimRelation(BaseModel):
    junior_id: str
    senior_id: str


class Respond(BaseModel):
    accept: bool


class Vouch(BaseModel):
    vote: str = "yes"


class AdminDecision(BaseModel):
    decision: str


class Guess(BaseModel):
    guess: str = Field(..., min_length=1, max_length=60)


class Reveal(BaseModel):
    give_up: bool = False


class Nudge(BaseModel):
    user_id: str
    message: Optional[str] = Field(None, max_length=140)


class MeetupCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    starts_at: str = Field(..., min_length=10, max_length=40)
    place: str = Field(..., min_length=1, max_length=200)
    note: Optional[str] = Field(None, max_length=500)


class RsvpBody(BaseModel):
    response: str


class InterestsBody(BaseModel):
    mentor: Optional[bool] = None
    guest_speaker: Optional[bool] = None
    judge: Optional[bool] = None


def _strip(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    return {k: v for k, v in doc.items() if k != "_id"}


def _validate_cards(cards: Any) -> List[dict]:
    if not isinstance(cards, list) or len(cards) > 40:
        raise HTTPException(status_code=400, detail="cards ต้องเป็นรายการไม่เกิน 40 ใบ")
    out = []
    seen = set()
    for i, c in enumerate(cards):
        if not isinstance(c, dict):
            raise HTTPException(status_code=400, detail=f"cards[{i}] ต้องเป็น object")
        title = str(c.get("title") or "").strip()
        if not title or len(title) > 100:
            raise HTTPException(status_code=400, detail=f"cards[{i}].title ต้องมี (≤100)")
        link = c.get("link")
        if link not in (None, ""):
            link = str(link).strip()
            if not (link.startswith("/") and not link.startswith("//")) and not link.startswith("https://"):
                raise HTTPException(status_code=400, detail=f"cards[{i}].link ต้องขึ้นต้นด้วย / หรือ https://")
        else:
            link = None
        aud = c.get("audience") or "all"
        if aud not in AUDIENCES:
            raise HTTPException(status_code=400, detail=f"cards[{i}].audience: {AUDIENCES}")
        ik = c.get("interest_key")
        if ik not in (None, *INTEREST_KEYS):
            raise HTTPException(status_code=400, detail=f"cards[{i}].interest_key: {INTEREST_KEYS}")
        cid = str(c.get("id") or uuid.uuid4().hex[:8])[:40]
        if cid in seen:
            raise HTTPException(status_code=400, detail=f"cards[{i}].id ซ้ำ")
        seen.add(cid)
        out.append({
            "id": cid, "title": title, "description": str(c.get("description") or "")[:400],
            "link": link, "audience": aud, "interest_key": ik,
            "icon": str(c.get("icon") or "")[:24] or None,
            "order": int(c.get("order") or (i + 1) * 10), "active": bool(c.get("active", True)),
        })
    return out


# ============================================================ clues

async def invite_clues(svc: AlumniService, invite: dict) -> Dict[str, Any]:
    """Clues for the เฉลยสาย game.  NEVER includes the inviter's id, name,
    nickname, avatar or company; more clues unlock after each wrong guess."""
    attempts = int(invite.get("guess_attempts") or 0)
    inv = await svc.profile(invite["inviter_id"]) or {}
    clues: List[Dict[str, Any]] = []
    if inv.get("gen") is not None:
        clues.append({"key": "gen", "label": "คนชวนอยู่รุ่น", "value": inv.get("gen")})
    if invite.get("inviter_term_for_invitee"):
        clues.append({"key": "relation", "label": "เขาเป็น … ของคุณในสายเทค",
                      "value": invite["inviter_term_for_invitee"]})
    if invite.get("clue"):
        clues.append({"key": "custom", "label": "คำใบ้จากคนชวน", "value": invite["clue"]})
    if attempts >= 1:
        role = {"alumni": "ศิษย์เก่า", "current_student": "นิสิตปัจจุบัน", "staff": "บุคลากร"}.get(inv.get("role"), "สมาชิก")
        clues.append({"key": "role", "label": "สถานะ", "value": role})
        _, members = await svc.component(invite["inviter_id"])
        clues.append({"key": "line_size", "label": "คนในสายของเขาตอนนี้", "value": len(members)})
    if attempts >= 2:
        nick = (inv.get("nickname") or "").strip()
        if nick:
            clues.append({"key": "initial", "label": "ชื่อเล่นขึ้นต้นด้วย", "value": nick[0]})
    return {"clues": clues, "guesses_left": max(0, MAX_GUESSES - attempts), "attempts": attempts}


# ============================================================ registration

def register_line_routes(router, svc: AlumniService, db, get_current_user, get_optional_user, H: Dict[str, Any]):
    """Attach all 2026-11 endpoints to `router` (prefix /alumni)."""

    async def _member(user) -> dict:
        await svc.ensure_indexes()
        return await svc.require_member(user)

    def _admin(user):
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admin only")

    async def _path_ids(user_id: str) -> List[str]:
        return [n for n, _ in await svc.primary_path_up(user_id)]

    # -------------------------------------------------------- kinship

    @router.get("/kinship/settings")
    async def kinship_settings(current_user=Depends(get_current_user)):
        glob = await svc.kinship_global()
        path = await _path_ids(current_user.id)
        mine = await db.alumni_line_settings.find_one({"anchor_id": current_user.id}, {"_id": 0})
        effective = await svc.vocab_for(path)
        return {
            "defaults": K.DEFAULT_SETTINGS,
            "global_override": glob,
            "my_line_override": (mine or {}).get("override"),
            "effective": effective,
            "ladder": K.ladder(effective),
            "notes": {
                "distance": "บวก = อยู่เหนือคุณ (รุ่นพี่), ลบ = อยู่ใต้คุณ (รุ่นน้อง) · 1 ทอด = 1 ลิงก์ ไม่ใช่จำนวนปี",
                "gender": "m = รูปชาย, f = รูปหญิง, u = ไม่ระบุ (ใช้รูปรวม เช่น ลุง/ป้าเทค)",
            },
        }

    @router.put("/kinship/settings")
    async def put_kinship_settings(payload: Dict[str, Any] = Body(...), current_user=Depends(get_current_user)):
        _admin(current_user)
        replace = bool(payload.pop("_replace", False))
        try:
            clean = K.validate_settings(payload)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        cur = {} if replace else await svc.kinship_global()
        merged = K.merge_settings({}, cur, clean) if cur else clean
        merged = {k: v for k, v in merged.items() if v not in ({}, None)} if replace else merged
        await db.alumni_settings.update_one({"id": "kinship"}, {"$set": {
            "id": "kinship", "override": merged, "updated_at": now_iso(), "updated_by": current_user.id}},
            upsert=True)
        await svc.audit(current_user.id, "kinship_settings", "settings", "kinship", {"keys": sorted(clean)})
        eff = K.merge_settings(None, merged)
        return {"global_override": merged, "effective": eff, "ladder": K.ladder(eff)}

    @router.put("/kinship/line-override")
    async def put_line_override(payload: Dict[str, Any] = Body(...), current_user=Depends(get_current_user)):
        """Anchored at the caller (applies to the caller and everyone below
        them).  Admin may pass `anchor_id`."""
        await _member(current_user)
        anchor = payload.pop("anchor_id", None) or current_user.id
        if anchor != current_user.id:
            _admin(current_user)
        try:
            clean = K.validate_settings(payload)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        await db.alumni_line_settings.update_one({"anchor_id": anchor}, {"$set": {
            "anchor_id": anchor, "override": clean, "updated_at": now_iso(), "updated_by": current_user.id}},
            upsert=True)
        await svc.audit(current_user.id, "line_override", "line", anchor, {"keys": sorted(clean)})
        eff = await svc.vocab_for(await _path_ids(anchor))
        return {"anchor_id": anchor, "override": clean, "effective": eff, "ladder": K.ladder(eff)}

    @router.delete("/kinship/line-override")
    async def delete_line_override(anchor_id: Optional[str] = None, current_user=Depends(get_current_user)):
        anchor = anchor_id or current_user.id
        if anchor != current_user.id:
            _admin(current_user)
        await db.alumni_line_settings.delete_one({"anchor_id": anchor})
        await svc.audit(current_user.id, "line_override_clear", "line", anchor)
        return {"anchor_id": anchor, "override": None}

    @router.get("/kinship/term")
    async def kinship_term(distance: int, gender: Optional[str] = None, current_user=Depends(get_current_user)):
        eff = await svc.vocab_for(await _path_ids(current_user.id))
        return K.describe(distance, gender, eff)

    # -------------------------------------------------------- ghosts

    async def _ghost_or_404(gid: str, allow_inactive: bool = False) -> dict:
        g = await svc.ghost(gid)
        if not g or (not allow_inactive and g.get("status") != "active"):
            raise HTTPException(status_code=404, detail="ไม่พบสมาชิกรอลงทะเบียนนี้")
        return g

    @router.post("/ghosts")
    async def create_ghost(data: GhostCreate, current_user=Depends(get_current_user)):
        """Add a not-yet-registered person (minimal data) and optionally link
        them to the caller (or to another node) in one step."""
        await _member(current_user)
        attach_to = (data.attach.to if data.attach else None) or current_user.id
        if data.attach and data.attach.as_ not in ("senior", "junior"):
            raise HTTPException(status_code=400, detail="attach.as ต้องเป็น senior หรือ junior")
        if not data.force:
            sims = await svc.similar_ghosts(data.display_name, data.gen)
            if sims:
                raise HTTPException(status_code=409, detail={
                    "code": "similar_ghosts",
                    "message": "มีชื่อที่คล้ายกันอยู่แล้ว · ใช้ชื่อเดิมได้ไหม? (ส่ง force=true เพื่อสร้างใหม่)",
                    "candidates": sims})
        if data.attach:
            junior, senior = (attach_to, "__new__") if data.attach.as_ == "senior" else ("__new__", attach_to)
            # Permission is checked against the existing end before creating anything.
            if attach_to != current_user.id:
                ok, why = await svc.can_claim(current_user.id, attach_to if junior != "__new__" else "g_x",
                                              attach_to if senior != "__new__" else "g_x")
                if not ok:
                    raise HTTPException(status_code=403, detail={"code": "not_connected", "message": why})
            await svc.rate_limit("claim", current_user.id)
            gen_other = await svc.gen_of(attach_to)
            if gen_other is not None:
                if data.attach.as_ == "senior" and data.gen >= gen_other:
                    raise HTTPException(status_code=400, detail={"code": "gen_order",
                                        "message": f"พี่เทคต้องอยู่รุ่นก่อนรุ่น {gen_other}"})
                if data.attach.as_ == "junior" and data.gen <= gen_other:
                    raise HTTPException(status_code=400, detail={"code": "gen_order",
                                        "message": f"น้องเทคต้องอยู่รุ่นหลังรุ่น {gen_other}"})
            if not await svc.node_exists(attach_to):
                raise HTTPException(status_code=404, detail="ไม่พบสมาชิกที่จะเชื่อม")
        g = await svc.create_ghost(current_user, data.display_name, data.gen, data.student_id_prefix, data.gender)
        rel = None
        if data.attach:
            j, s = (attach_to, g["id"]) if data.attach.as_ == "senior" else (g["id"], attach_to)
            rel = await svc.create_edge(j, s, current_user.id, source="ghost")
            await svc.mark_rate("claim", current_user.id)
        return {"ghost": svc.ghost_node(g), "relation": rel}

    @router.get("/ghost-suggestions")
    async def ghost_suggestions(current_user=Depends(get_current_user)):
        """'Is one of these you?' — active ghosts in my cohort with a similar name."""
        me = await _member(current_user)
        u = await db.users.find_one({"id": current_user.id}, {"_id": 0, "full_name": 1}) or {}
        names = [me.get("nickname"), u.get("full_name")] + (u.get("full_name") or "").split()
        pool = await db.alumni_ghosts.find({"status": "active", "gen": me.get("gen")}, {"_id": 0}).to_list(2000)
        out = []
        for g in pool:
            if g.get("created_by") == current_user.id:
                continue
            s = G.best_name_match(g.get("display_name") or "", [n for n in names if n])
            if s >= 0.6:
                out.append({**svc.ghost_node(g), "similarity": s})
        out.sort(key=lambda x: -x["similarity"])
        return {"suggestions": out[:5]}

    @router.get("/ghosts/{gid}")
    async def get_ghost(gid: str, current_user=Depends(get_current_user)):
        await _member(current_user)
        g = await _ghost_or_404(gid, allow_inactive=True)
        if g.get("status") == "removed":
            return {"ghost": {"user_id": gid, "is_ghost": True, "ghost_status": "removed"}, "relations": []}
        if g.get("status") == "claimed":
            return {"ghost": {"user_id": gid, "is_ghost": True, "ghost_status": "claimed",
                              "claimed_by_user_id": g.get("claimed_by_user_id")}, "relations": []}
        rels = await db.alumni_relations.find(
            {"$or": [{"from_user_id": gid}, {"to_user_id": gid}], "status": {"$nin": list(G.DEAD)}},
            {"_id": 0}).to_list(200)
        open_invites = await db.alumni_invites.count_documents({"ghost_id": gid, "status": {"$in": ["sent", "opened"]}})
        return {"ghost": svc.ghost_node(g), "relations": rels, "open_invites": open_invites,
                "can_edit": g.get("created_by") == current_user.id or is_admin(current_user)}

    @router.put("/ghosts/{gid}")
    async def update_ghost(gid: str, data: GhostUpdate, current_user=Depends(get_current_user)):
        await _member(current_user)
        g = await _ghost_or_404(gid)
        if g.get("created_by") != current_user.id and not is_admin(current_user):
            raise HTTPException(status_code=403, detail="แก้ไขได้เฉพาะผู้สร้างหรือแอดมิน")
        upd = {k: v for k, v in data.model_dump().items() if v is not None}
        if "display_name" in upd:
            upd["display_name"] = GhostCreate._name(upd["display_name"])
        if "student_id_prefix" in upd:
            upd["student_id_prefix"] = GhostCreate._prefix(upd["student_id_prefix"])
        if "gender" in upd:
            gg = K.normalize_gender(upd["gender"])
            upd["gender"] = None if gg == "u" else gg
        if upd:
            await db.alumni_ghosts.update_one({"id": gid}, {"$set": upd})
            await svc.audit(current_user.id, "ghost_update", "ghost", gid, {"keys": sorted(upd)})
        return {"ghost": svc.ghost_node(await svc.ghost(gid))}

    @router.post("/ghosts/{gid}/remove")
    async def remove_ghost(gid: str, data: GhostRemove, current_user=Depends(get_current_user)):
        """Remove a placeholder: creator (if nobody else linked it), the person
        themself (`self_identify`), or an admin.  Identifying fields are erased."""
        await _member(current_user)
        return await svc.remove_ghost(gid, current_user, data.reason or "", data.self_identify, data.do_not_readd)

    @router.post("/ghosts/{gid}/invite")
    async def invite_ghost(gid: str, data: GhostInvite, current_user=Depends(get_current_user)):
        """Share link for a ghost (no email / phone is taken or stored — the
        link is shared by the member, e.g. via LINE)."""
        me = await _member(current_user)
        await _ghost_or_404(gid)
        await svc.rate_limit("invite", current_user.id, count_coro=lambda: db.alumni_invites.count_documents(
            {"inviter_id": current_user.id, "sent_at": {"$gte": ago_iso(24)}}))
        inv = await H["_create_invite"](current_user, me, ghost_id=gid, clue=data.clue,
                                        reveal_game=data.reveal_game, relation_hint=None)
        return inv

    @router.get("/invites/{code}/claim-preview")
    async def invite_claim_preview(code: str, current_user=Depends(get_current_user)):
        """After login: 'นี่คือคุณใช่ไหม' — the ghost this invite was made for."""
        inv = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        if not inv:
            raise HTTPException(status_code=404, detail="Invite not found")
        if not inv.get("ghost_id"):
            return {"ghost": None}
        g = await svc.ghost(inv["ghost_id"])
        if not g or g.get("status") != "active":
            return {"ghost": None, "ghost_status": (g or {}).get("status")}
        rels = await db.alumni_relations.find(
            {"$or": [{"from_user_id": g["id"]}, {"to_user_id": g["id"]}], "status": {"$nin": list(G.DEAD)}},
            {"_id": 0}).to_list(100)
        others = [r["to_user_id"] if r["from_user_id"] == g["id"] else r["from_user_id"] for r in rels]
        meta = await svc.nodes_meta(others)
        links = []
        for r in rels:
            other = r["to_user_id"] if r["from_user_id"] == g["id"] else r["from_user_id"]
            m = meta.get(other) or {}
            links.append({"relation_id": r["id"], "status": G.normalize_status(r.get("status")),
                          "other": {"user_id": other, "nickname": m.get("nickname"), "gen": m.get("gen"),
                                    "is_ghost": m.get("is_ghost")},
                          "other_is": "senior" if r["from_user_id"] == g["id"] else "junior"})
        return {"ghost": {"id": g["id"], "display_name": g.get("display_name"), "gen": g.get("gen"),
                          "student_id_prefix": g.get("student_id_prefix")}, "links": links}

    @router.post("/ghosts/{gid}/claim")
    async def claim_ghost(gid: str, data: GhostClaim, current_user=Depends(get_current_user)):
        """'This is me'.  With the ghost's invite code → merged immediately.
        Without → a claim request a connected member (or admin) must approve."""
        me = await _member(current_user)
        g = await _ghost_or_404(gid)
        if data.invite_code:
            inv = await db.alumni_invites.find_one({"code": data.invite_code}, {"_id": 0})
            if not inv or inv.get("ghost_id") != gid:
                raise HTTPException(status_code=400, detail="รหัสเชิญไม่ตรงกับชื่อนี้")
            if inv.get("accepted_by_user_id") not in (None, current_user.id):
                raise HTTPException(status_code=403, detail="ลิงก์เชิญนี้ถูกใช้โดยคนอื่นแล้ว")
            if inv.get("inviter_id") == current_user.id:
                raise HTTPException(status_code=400, detail="ใช้ลิงก์เชิญของตัวเองไม่ได้")
            res = await svc.merge_ghost(gid, current_user.id, current_user.id, via=f"invite:{data.invite_code}",
                                        confirm_relation_ids=data.confirm_relation_ids, confirm_all=data.confirm_all)
            return {"status": "merged", **res}
        if g.get("gen") is not None and me.get("gen") is not None and g["gen"] != me["gen"]:
            raise HTTPException(status_code=400, detail={"code": "gen_mismatch",
                                "message": f"ชื่อนี้อยู่รุ่น {g['gen']} แต่คุณอยู่รุ่น {me['gen']}"})
        existing = await db.alumni_ghost_claims.find_one(
            {"ghost_id": gid, "claimant_id": current_user.id, "status": "pending"}, {"_id": 0})
        if existing:
            return {"status": "pending_approval", "claim": existing}
        await svc.rate_limit("ghost_claim_request", current_user.id)
        approvers = sorted(await svc.ghost_approvers(gid) - {current_user.id})
        claim = {"id": str(uuid.uuid4()), "ghost_id": gid, "claimant_id": current_user.id, "status": "pending",
                 "approvers": approvers, "confirm_all": data.confirm_all,
                 "confirm_relation_ids": data.confirm_relation_ids, "created_at": now_iso()}
        await db.alumni_ghost_claims.insert_one(dict(claim))
        await svc.mark_rate("ghost_claim_request", current_user.id)
        await svc.audit(current_user.id, "ghost_claim_request", "ghost", gid, {"claim_id": claim["id"]})
        nick = me.get("nickname") or "สมาชิก"
        for a in approvers[:20]:
            await H["_push_notification"](a, "ghost_claim", "🙋 มีคนบอกว่าเขาคือ " + (g.get("display_name") or "คนในสาย"),
                                          f"{nick} (รุ่น {me.get('gen')}) ขอยืนยันว่าเป็นคนนี้ · ช่วยยืนยันหน่อย",
                                          {"claim_id": claim["id"], "ghost_id": gid})
        return {"status": "pending_approval", "claim": claim, "needs_admin": not approvers}

    @router.get("/ghost-claims/pending")
    async def pending_ghost_claims(current_user=Depends(get_current_user)):
        await _member(current_user)
        q: Dict[str, Any] = {"status": "pending"}
        if not is_admin(current_user):
            q["approvers"] = current_user.id
        items = await db.alumni_ghost_claims.find(q, {"_id": 0}).sort("created_at", -1).to_list(100)
        meta = await svc.nodes_meta([i["ghost_id"] for i in items] + [i["claimant_id"] for i in items])
        for i in items:
            i["ghost"] = meta.get(i["ghost_id"])
            c = meta.get(i["claimant_id"]) or {}
            i["claimant"] = {"user_id": i["claimant_id"], "nickname": c.get("nickname"), "name": c.get("name"),
                             "gen": c.get("gen"), "avatar_url": c.get("avatar_url")}
        return {"claims": items}

    @router.post("/ghost-claims/{cid}/decide")
    async def decide_ghost_claim(cid: str, data: Decide, current_user=Depends(get_current_user)):
        await _member(current_user)
        c = await db.alumni_ghost_claims.find_one({"id": cid}, {"_id": 0})
        if not c or c.get("status") != "pending":
            raise HTTPException(status_code=404, detail="ไม่พบคำขอที่รออนุมัติ")
        allowed = is_admin(current_user) or (current_user.id in (await svc.ghost_approvers(c["ghost_id"]))
                                             and current_user.id != c["claimant_id"])
        if not allowed:
            raise HTTPException(status_code=403, detail="คุณไม่ได้เชื่อมกับชื่อนี้ จึงยืนยันแทนไม่ได้")
        await svc.audit(current_user.id, "ghost_claim_approve" if data.approve else "ghost_claim_reject",
                        "ghost", c["ghost_id"], {"claim_id": cid, "claimant": c["claimant_id"]})
        if not data.approve:
            await db.alumni_ghost_claims.update_one({"id": cid}, {"$set": {
                "status": "rejected", "decided_by": current_user.id, "decided_at": now_iso()}})
            await H["_push_notification"](c["claimant_id"], "ghost_claim_rejected", "คำขอยืนยันตัวตนไม่ผ่าน",
                                          "สมาชิกในสายยังไม่ยืนยันว่าเป็นคุณ · ลองขอให้คนชวนส่งลิงก์เชิญแทน",
                                          {"claim_id": cid})
            return {"status": "rejected"}
        await db.alumni_ghost_claims.update_one({"id": cid}, {"$set": {
            "status": "approved", "decided_by": current_user.id, "decided_at": now_iso()}})
        res = await svc.merge_ghost(c["ghost_id"], c["claimant_id"], current_user.id, via=f"claim:{cid}",
                                    confirm_relation_ids=c.get("confirm_relation_ids"),
                                    confirm_all=bool(c.get("confirm_all")))
        await H["_push_notification"](c["claimant_id"], "ghost_claim_approved", "✅ ยืนยันตัวตนสำเร็จ",
                                      "ประวัติในสายเทคถูกย้ายมาที่บัญชีของคุณแล้ว · ไปยืนยันความสัมพันธ์ได้เลย",
                                      {"claim_id": cid})
        return {"status": "merged", **res}

    @router.post("/admin/ghosts/{gid}/merge-into")
    async def admin_merge_ghost(gid: str, target_id: str = Body(..., embed=True), current_user=Depends(get_current_user)):
        """Admin dedupe: merge a ghost into another ghost or a real member."""
        _admin(current_user)
        if not await svc.node_exists(target_id):
            raise HTTPException(status_code=404, detail="target not found")
        return await svc.merge_ghost(gid, target_id, current_user.id, via="admin")

    # -------------------------------------------------------- relations (crowd)

    @router.post("/relations/claim")
    async def claim_relation(data: ClaimRelation, current_user=Depends(get_current_user)):
        """Assert 'junior's พี่เทค is senior'.  Ends may be ghosts."""
        await _member(current_user)
        ok, why = await svc.can_claim(current_user.id, data.junior_id, data.senior_id)
        if not ok:
            raise HTTPException(status_code=403, detail={"code": "not_connected", "message": why})
        await svc.rate_limit("claim", current_user.id)
        rel = await svc.create_edge(data.junior_id, data.senior_id, current_user.id, source="claim")
        await svc.mark_rate("claim", current_user.id)
        await H["_award_xp"](current_user.id, "mark_relation")
        return rel

    @router.put("/relations/{rid}/respond")
    async def respond_relation(rid: str, data: Respond, current_user=Depends(get_current_user)):
        return await svc.respond(rid, current_user, data.accept)

    @router.post("/relations/{rid}/vouch")
    async def vouch_relation(rid: str, data: Vouch, current_user=Depends(get_current_user)):
        await _member(current_user)
        return await svc.vouch(rid, current_user, data.vote)

    @router.put("/relations/{rid}/primary")
    async def set_primary(rid: str, current_user=Depends(get_current_user)):
        """The junior picks which พี่เทค is primary (used for line terms)."""
        rel = await db.alumni_relations.find_one({"id": rid}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        if rel["from_user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="เฉพาะน้องเทคเลือกพี่เทคหลักได้")
        if G.normalize_status(rel.get("status")) not in G.LIVE:
            raise HTTPException(status_code=400, detail="ความสัมพันธ์นี้ไม่ได้ใช้งานอยู่")
        await db.alumni_relations.update_many({"from_user_id": current_user.id, "kind": "take"},
                                              {"$set": {"primary_set_by_junior": False}})
        await db.alumni_relations.update_one({"id": rid}, {"$set": {"primary_set_by_junior": True, "primary": True}})
        await svc.audit(current_user.id, "set_primary", "relation", rid)
        return await db.alumni_relations.find_one({"id": rid}, {"_id": 0})

    @router.get("/relations/{rid}/history")
    async def relation_history(rid: str, current_user=Depends(get_current_user)):
        await _member(current_user)
        rel = await db.alumni_relations.find_one({"id": rid}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        votes = await db.alumni_vouches.find({"relation_id": rid}, {"_id": 0}).sort("created_at", 1).to_list(500)
        events = await db.alumni_audit.find({"target_id": rid}, {"_id": 0}).sort("at", 1).to_list(500)
        meta = await svc.nodes_meta([v["voter_id"] for v in votes] + [e["actor_id"] for e in events if e.get("actor_id")])
        for v in votes:
            v["voter"] = {"user_id": v["voter_id"], "nickname": (meta.get(v["voter_id"]) or {}).get("nickname")}
        for e in events:
            if e.get("actor_id"):
                e["actor"] = {"user_id": e["actor_id"], "nickname": (meta.get(e["actor_id"]) or {}).get("nickname")}
        return {"relation": rel, "vouches": votes, "events": events}

    @router.get("/vouch/prompts")
    async def vouch_prompts(limit: int = Query(20, ge=1, le=50), current_user=Depends(get_current_user)):
        """Open claims I am eligible to vouch on (same line ≤3 links, or same cohort)."""
        me = await _member(current_user)
        near = await svc.neighborhood(current_user.id)
        same_gen_real = await db.alumni_users.find({"gen": me.get("gen")}, {"_id": 0, "user_id": 1}).to_list(1000)
        same_gen_ghost = await db.alumni_ghosts.find({"gen": me.get("gen"), "status": "active"},
                                                     {"_id": 0, "id": 1}).to_list(1000)
        nodes = list(near | {x["user_id"] for x in same_gen_real} | {x["id"] for x in same_gen_ghost})
        nodes = [n for n in nodes if n != current_user.id] or ["__none__"]
        cands = await db.alumni_relations.find({
            "kind": "take", "status": {"$in": ["claimed", "pending", "disputed"]},
            "$or": [{"from_user_id": {"$in": nodes}}, {"to_user_id": {"$in": nodes}}],
            "from_user_id": {"$ne": current_user.id}, "to_user_id": {"$ne": current_user.id},
            "created_by": {"$ne": current_user.id},
            "decided_by": {"$nin": ["counterpart", "admin"]},
        }, {"_id": 0}).sort("created_at", -1).to_list(200)
        voted = await db.alumni_vouches.find({"voter_id": current_user.id, "relation_id": {"$in": [c["id"] for c in cands]}},
                                             {"_id": 0, "relation_id": 1}).to_list(500)
        voted_ids = {v["relation_id"] for v in voted}
        cands = [c for c in cands if c["id"] not in voted_ids]
        cands.sort(key=lambda c: (0 if G.normalize_status(c.get("status")) == "disputed" else 1, c.get("created_at", "")))
        cands = cands[:limit]
        meta = await svc.nodes_meta([c["from_user_id"] for c in cands] + [c["to_user_id"] for c in cands]
                                    + [c["created_by"] for c in cands if c.get("created_by")])
        out = []
        for c in cands:
            out.append({
                "relation": c,
                "status": G.normalize_status(c.get("status")),
                "junior": meta.get(c["from_user_id"]),
                "senior": meta.get(c["to_user_id"]),
                "claimed_by": {"user_id": c.get("created_by"),
                               "nickname": (meta.get(c.get("created_by")) or {}).get("nickname")},
                "question": f"{(meta.get(c['to_user_id']) or {}).get('nickname') or '?'} เป็นพี่เทคของ "
                            f"{(meta.get(c['from_user_id']) or {}).get('nickname') or '?'} จริงไหม?",
                "votes": {"yes": c.get("vouch_yes", 0), "no": c.get("vouch_no", 0),
                          "needed": G.VOUCH_THRESHOLD},
            })
        return {"prompts": out}

    @router.put("/admin/relations/{rid}/decide")
    async def admin_decide(rid: str, data: AdminDecision, current_user=Depends(get_current_user)):
        _admin(current_user)
        return await svc.admin_decide(rid, current_user, data.decision)

    @router.get("/admin/audit")
    async def admin_audit(target_id: Optional[str] = None, action: Optional[str] = None,
                          limit: int = Query(100, ge=1, le=500), current_user=Depends(get_current_user)):
        _admin(current_user)
        q: Dict[str, Any] = {"action": {"$not": {"$regex": "^rl:"}}}
        if target_id:
            q["target_id"] = target_id
        if action:
            q["action"] = action
        items = await db.alumni_audit.find(q, {"_id": 0}).sort("at", -1).to_list(limit)
        return {"items": items}

    # -------------------------------------------------------- chain (gaps)

    @router.get("/chain/gaps")
    async def chain_gaps(current_user=Depends(get_current_user)):
        """Next empty slots above and below me, with the right term and who is
        best placed to fill each one."""
        await _member(current_user)
        path = await svc.primary_path_up(current_user.id)
        vocab = await svc.vocab_for([n for n, _ in path])
        meta = await svc.nodes_meta([n for n, _ in path])
        up = []
        weakest = "confirmed"
        for d, (nid, edge) in enumerate(path[1:], start=1):
            m = meta.get(nid) or {}
            st = G.normalize_status(edge.get("status")) if edge else None
            if st and G.STATUS_RANK.get(st, 0) < G.STATUS_RANK.get(weakest, 0):
                weakest = st
            slot = {"distance": d, "term": K.term_for(d, m.get("gender"), vocab),
                    "state": "ghost" if m.get("is_ghost") else "registered",
                    "link_status": st, "path_status": weakest, "node": m}
            if m.get("is_ghost"):
                below = [n for n, _ in path[:d] if not G.is_ghost(n)]
                slot["action"] = "invite_ghost"
                slot["best_inviters"] = [below[-1]] if below else [current_user.id]
                slot["open_invites"] = await db.alumni_invites.count_documents(
                    {"ghost_id": nid, "status": {"$in": ["sent", "opened"]}})
            up.append(slot)
        top_id = path[-1][0]
        d = len(path)
        top_meta = meta.get(top_id) or {}
        missing_up = {
            "distance": d, "term": K.term_for(d, None, vocab), "state": "missing",
            "headline": f"{K.term_for(d, None, vocab)}ของคุณยังไม่มา",
        }
        if top_id == current_user.id:
            missing_up.update(action="add_or_invite", best_inviters=[current_user.id])
        elif top_meta.get("is_ghost"):
            missing_up.update(action="add_ghost_above", best_inviters=[current_user.id],
                              hint="เพิ่มชื่อพี่เทคของคนบนสุดไว้ก่อน แล้วชวนทีหลังได้")
        else:
            missing_up.update(action="nudge", best_inviters=[top_id, current_user.id],
                              hint=f"{top_meta.get('nickname') or 'คนบนสุด'} น่าจะรู้จักคนนี้ที่สุด · ส่งสะกิดได้")
        up.append(missing_up)
        children = await svc.edges_touching([current_user.id], "down", G.LIVE)
        cmeta = await svc.nodes_meta([c["from_user_id"] for c in children])
        down = [{"distance": -1, "term": K.term_for(-1, (cmeta.get(c["from_user_id"]) or {}).get("gender"), vocab),
                 "state": "ghost" if G.is_ghost(c["from_user_id"]) else "registered",
                 "link_status": G.normalize_status(c.get("status")), "node": cmeta.get(c["from_user_id"])}
                for c in children]
        if not children:
            down.append({"distance": -1, "term": K.term_for(-1, None, vocab), "state": "missing",
                         "headline": f"{K.term_for(-1, None, vocab)}ของคุณยังไม่มา",
                         "action": "add_or_invite", "best_inviters": [current_user.id]})
        inviter_meta = await svc.nodes_meta({i for s in up + down for i in s.get("best_inviters", [])})
        for s in up + down:
            s["best_inviters"] = [{"user_id": i, "nickname": (inviter_meta.get(i) or {}).get("nickname"),
                                   "is_me": i == current_user.id} for i in s.get("best_inviters", [])]
        return {"up": up, "down": down, "line_span_known": len(path)}

    @router.post("/chain/nudge")
    async def chain_nudge(data: Nudge, current_user=Depends(get_current_user)):
        """Ask a registered relative in my line to bring the next one in."""
        me = await _member(current_user)
        if G.is_ghost(data.user_id) or data.user_id == current_user.id:
            raise HTTPException(status_code=400, detail="สะกิดได้เฉพาะสมาชิกที่ลงทะเบียนแล้ว")
        line = await svc.neighborhood(current_user.id, depth=6, statuses=G.LIVE)
        if data.user_id not in line:
            raise HTTPException(status_code=403, detail="สะกิดได้เฉพาะคนในสายเดียวกัน")
        recent = await db.alumni_audit.count_documents({"actor_id": current_user.id, "action": "nudge",
                                                        "target_id": data.user_id, "at": {"$gte": ago_iso(72)}})
        if recent:
            raise HTTPException(status_code=429, detail={"code": "rate_limited",
                                "message": "เพิ่งสะกิดคนนี้ไปแล้ว · รอ 3 วันก่อนนะ"})
        await svc.rate_limit("nudge", current_user.id)
        await svc.mark_rate("nudge", current_user.id)
        await svc.audit(current_user.id, "nudge", "user", data.user_id)
        path = await svc.primary_path_up(data.user_id)
        vocab = await svc.vocab_for([n for n, _ in path])
        term = K.term_for(1, None, vocab)
        nick = me.get("nickname") or "น้องในสาย"
        await H["_push_notification"](data.user_id, "chain_nudge", f"👋 {nick} ขอให้ช่วยชวน{term}ของคุณเข้ามา",
                                      data.message or "สายเราจะได้ยาวขึ้นอีกรุ่น · ส่งลิงก์ทาง LINE ได้เลย",
                                      {"from_user_id": current_user.id})
        return {"message": "ส่งสะกิดแล้ว"}

    @router.get("/admin/invite-funnel")
    async def invite_funnel(current_user=Depends(get_current_user)):
        _admin(current_user)
        sent = await db.alumni_invites.count_documents({})
        opened = await db.alumni_invites.count_documents({"$or": [{"status": {"$in": ["opened", "registered"]}},
                                                                  {"opened_at": {"$ne": None}}]})
        accepted = await db.alumni_invites.count_documents({"status": "registered"})
        inviters = await db.alumni_invites.distinct("inviter_id")
        acceptors = await db.alumni_invites.distinct("accepted_by_user_id", {"status": "registered"})
        acceptors = [a for a in acceptors if a]
        next_level = len(set(acceptors) & set(inviters))
        members = await db.alumni_users.count_documents({})
        by_depth = await db.alumni_users.aggregate([
            {"$group": {"_id": {"$ifNull": ["$invite_depth", 0]}, "n": {"$sum": 1}}}, {"$sort": {"_id": 1}},
        ]).to_list(50)
        ghost_inv = await db.alumni_invites.count_documents({"ghost_id": {"$nin": [None]}})
        ghosts_claimed = await db.alumni_ghosts.count_documents({"status": "claimed"})
        ghosts_active = await db.alumni_ghosts.count_documents({"status": "active"})
        return {
            "invites_sent": sent, "invites_opened": opened, "invites_accepted": accepted,
            "open_rate": round(opened / sent, 4) if sent else 0.0,
            "conversion": round(accepted / sent, 4) if sent else 0.0,
            "inviters": len(inviters),
            "invitees_who_invited": next_level,
            "next_level_rate": round(next_level / len(acceptors), 4) if acceptors else 0.0,
            "members": members,
            # K = invites per member × conversion = accepted / members
            "k_factor": round(accepted / members, 4) if members else 0.0,
            "k_per_inviter": round(accepted / len(inviters), 4) if inviters else 0.0,
            "members_by_invite_depth": [{"depth": r["_id"], "members": r["n"]} for r in by_depth],
            "ghost_invites_sent": ghost_inv, "ghosts_claimed": ghosts_claimed, "ghosts_active": ghosts_active,
        }

    # -------------------------------------------------------- reveal game

    @router.post("/invites/{code}/guess")
    async def guess_inviter(code: str, data: Guess):
        """Public (the code is the secret).  Free-text guess of who invited me —
        answers only right/wrong, unlocks a clue per wrong guess, max 3."""
        inv = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        if not inv or inv.get("status") == "expired":
            raise HTTPException(status_code=404, detail="Invite not found")
        if not inv.get("reveal_game"):
            raise HTTPException(status_code=400, detail="ลิงก์นี้ไม่ได้เปิดเกมทายคนชวน")
        if inv.get("revealed_at"):
            return {"correct": bool(inv.get("guessed_correctly")), "revealed": True, "guesses_left": 0}
        upd = await db.alumni_invites.find_one_and_update(
            {"code": code, "revealed_at": None, "$or": [{"guess_attempts": {"$lt": MAX_GUESSES}},
                                                       {"guess_attempts": {"$exists": False}}]},
            {"$inc": {"guess_attempts": 1}}, projection={"_id": 0}, return_document=True)
        if not upd:
            return {"correct": False, "revealed": True, "guesses_left": 0}
        prof = await svc.profile(inv["inviter_id"]) or {}
        u = await db.users.find_one({"id": inv["inviter_id"]}, {"_id": 0, "full_name": 1}) or {}
        score = G.best_name_match(data.guess, [prof.get("nickname"), u.get("full_name")])
        correct = score >= 0.85
        left = max(0, MAX_GUESSES - int(upd.get("guess_attempts") or 0))
        revealed = correct or left == 0
        if revealed:
            await db.alumni_invites.update_one({"code": code}, {"$set": {
                "revealed_at": now_iso(), "guessed_correctly": correct}})
        out = {"correct": correct, "revealed": revealed, "guesses_left": left}
        if not revealed:
            out.update(await invite_clues(svc, upd))
        return out

    @router.post("/invites/{code}/reveal")
    async def reveal_inviter(code: str, data: Reveal = Body(default=Reveal())):
        """เฉลยสาย: the inviter + their line, only after the guess phase
        (a correct guess, all guesses used, or give_up=true)."""
        inv = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        if not inv or inv.get("status") == "expired":
            raise HTTPException(status_code=404, detail="Invite not found")
        if inv.get("reveal_game") and not inv.get("revealed_at"):
            if not data.give_up:
                raise HTTPException(status_code=409, detail={"code": "guess_first",
                                    "message": "ทายก่อนว่าใครชวน แล้วค่อยเฉลย!"})
            await db.alumni_invites.update_one({"code": code}, {"$set": {
                "revealed_at": now_iso(), "guessed_correctly": False, "gave_up": True}})
            inv = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        prof = await svc.profile(inv["inviter_id"])
        inviter = await H["_enrich_alumni"](dict(prof)) if prof else None
        if inviter:
            inviter.pop("email", None)
        path = await svc.primary_path_up(inv["inviter_id"], statuses=G.ESTABLISHED)
        meta = await svc.nodes_meta([n for n, _ in path], viewer_is_member=False)
        line = [{"user_id": n, "nickname": (meta.get(n) or {}).get("nickname"), "gen": (meta.get(n) or {}).get("gen"),
                 "is_ghost": G.is_ghost(n)} for n, _ in path]
        _, members = await svc.component(inv["inviter_id"])
        return {"inviter": inviter, "guessed_correctly": bool(inv.get("guessed_correctly")),
                "inviter_term_for_invitee": inv.get("inviter_term_for_invitee"),
                "line_above_inviter": line, "line_size": len(members)}

    # -------------------------------------------------------- leaderboards

    @async_ttl_cache(ttl_seconds=120)
    async def _board(db_key: int):
        edges = await db.alumni_relations.find(
            {"kind": "take", "status": {"$in": list(G.ESTABLISHED)}},
            {"_id": 0, "from_user_id": 1, "to_user_id": 1}).to_list(200000)
        lines = G.lines_from_edges([(e["from_user_id"], e["to_user_id"]) for e in edges])
        tops = [ln["line_id"] for ln in lines]
        meta = await svc.nodes_meta(tops)
        for ln in lines:
            m = meta.get(ln["line_id"]) or {}
            ln["top"] = {"user_id": ln["line_id"], "nickname": m.get("nickname"), "gen": m.get("gen"),
                         "is_ghost": m.get("is_ghost", False)}
            ln["name"] = f"สายเทคของ{m.get('nickname') or 'ไม่ทราบชื่อ'}"
        gens = await db.alumni_users.aggregate([{"$group": {"_id": "$gen", "n": {"$sum": 1}}}]).to_list(500)
        ghosts = await db.alumni_ghosts.aggregate([{"$match": {"status": "active"}},
                                                   {"$group": {"_id": "$gen", "n": {"$sum": 1}}}]).to_list(500)
        sizes_doc = await db.alumni_settings.find_one({"id": "cohort_sizes"}, {"_id": 0}) or {}
        sizes = sizes_doc.get("sizes") or {}
        gmap = {r["_id"]: r["n"] for r in ghosts}
        cohorts = []
        for r in gens:
            gen = r["_id"]
            if gen is None:
                continue
            expected = sizes.get(str(gen))
            known = r["n"] + gmap.get(gen, 0)
            denom = expected or known
            cohorts.append({"gen": gen, "registered": r["n"], "ghosts": gmap.get(gen, 0),
                            "expected": expected, "basis": "official_size" if expected else "known_members",
                            "completion": round(min(1.0, r["n"] / denom), 4) if denom else 0.0})
        cohorts.sort(key=lambda c: (-c["completion"], -c["registered"]))
        return {"lines": lines, "cohorts": cohorts, "computed_at": now_iso()}

    @router.get("/leaderboard/lines")
    async def leaderboard_lines(sort: str = Query("longest", pattern="^(longest|complete|largest)$"),
                                limit: int = Query(20, ge=1, le=100), current_user=Depends(get_current_user)):
        """Longest / most complete / largest สายเทค (members only, cached 2 min)."""
        await _member(current_user)
        data = await _board(id(db))
        lines = list(data["lines"])
        if sort == "longest":
            lines.sort(key=lambda x: (-x["span"], -x["size"], x["line_id"]))
        elif sort == "complete":
            lines = [x for x in lines if x["size"] >= 3]
            lines.sort(key=lambda x: (-x["completeness"], -x["span"], x["line_id"]))
        else:
            lines.sort(key=lambda x: (-x["size"], -x["span"], x["line_id"]))
        mine = None
        for i, ln in enumerate(lines):
            if current_user.id in ln["member_ids"]:
                mine = {"rank": i + 1, **{k: v for k, v in ln.items() if k != "member_ids"}}
                break
        top = [{"rank": i + 1, **{k: v for k, v in ln.items() if k != "member_ids"}} for i, ln in enumerate(lines[:limit])]
        return {"sort": sort, "lines": top, "my_line": mine, "computed_at": data["computed_at"]}

    @router.get("/leaderboard/cohorts")
    async def leaderboard_cohorts(current_user=Depends(get_current_user)):
        """Cohort completion meter ('รุ่น 64 มาแล้ว 43%')."""
        data = await _board(id(db))
        return {"cohorts": data["cohorts"], "computed_at": data["computed_at"]}

    @router.put("/admin/cohort-sizes")
    async def put_cohort_sizes(sizes: Dict[str, int] = Body(..., embed=True), current_user=Depends(get_current_user)):
        _admin(current_user)
        clean = {}
        for k, v in sizes.items():
            if not str(k).isdigit() or not isinstance(v, int) or v < 0 or v > 5000:
                raise HTTPException(status_code=400, detail=f"ขนาดรุ่นไม่ถูกต้อง: {k}")
            clean[str(int(k))] = v
        await db.alumni_settings.update_one({"id": "cohort_sizes"}, {"$set": {
            "id": "cohort_sizes", "sizes": clean, "updated_at": now_iso(), "updated_by": current_user.id}}, upsert=True)
        _board.cache_clear()
        return {"sizes": clean}

    # -------------------------------------------------------- meetups (เลี้ยงสาย)

    @router.post("/meetups")
    async def create_meetup(data: MeetupCreate, current_user=Depends(get_current_user)):
        me = await _member(current_user)
        await svc.rate_limit("meetup_create", current_user.id)
        members = [m for m in await svc.line_members(current_user.id) if not G.is_ghost(m)]
        doc = {"id": str(uuid.uuid4()), "title": data.title.strip(), "starts_at": data.starts_at,
               "place": data.place.strip(), "note": (data.note or "").strip() or None,
               "created_by": current_user.id, "created_at": now_iso(), "status": "scheduled",
               "line_member_ids": members, "rsvps": {current_user.id: "going"}}
        await db.alumni_meetups.insert_one(dict(doc))
        await svc.mark_rate("meetup_create", current_user.id)
        nick = me.get("nickname") or "คนในสาย"
        for m in members:
            if m != current_user.id:
                await H["_push_notification"](m, "meetup", f"🍻 {nick} ชวนเลี้ยงสาย: {doc['title']}",
                                              f"{doc['starts_at'][:16]} · {doc['place']}", {"meetup_id": doc["id"]})
        return _meetup_out(doc, current_user.id)

    def _meetup_out(doc: dict, uid: str) -> dict:
        r = doc.get("rsvps") or {}
        out = {k: v for k, v in doc.items() if k not in ("_id", "line_member_ids", "rsvps")}
        out["counts"] = {x: sum(1 for v in r.values() if v == x) for x in RSVP}
        out["my_rsvp"] = r.get(uid)
        out["is_owner"] = doc.get("created_by") == uid
        return out

    @router.get("/meetups")
    async def list_meetups(include_past: bool = False, current_user=Depends(get_current_user)):
        await _member(current_user)
        line = await svc.line_members(current_user.id)
        q: Dict[str, Any] = {"status": {"$ne": "cancelled"},
                             "$or": [{"line_member_ids": current_user.id}, {"created_by": {"$in": list(line)}}]}
        if not include_past:
            q["starts_at"] = {"$gte": now_iso()[:10]}
        items = await db.alumni_meetups.find(q, {"_id": 0}).sort("starts_at", 1).to_list(100)
        return {"meetups": [_meetup_out(m, current_user.id) for m in items]}

    async def _meetup_for(mid: str, user) -> dict:
        m = await db.alumni_meetups.find_one({"id": mid}, {"_id": 0})
        if not m:
            raise HTTPException(status_code=404, detail="ไม่พบนัดนี้")
        if user.id in (m.get("line_member_ids") or []) or is_admin(user):
            return m
        if m["created_by"] in await svc.line_members(user.id):
            return m
        raise HTTPException(status_code=403, detail="นัดนี้สำหรับคนในสายเท่านั้น")

    @router.post("/meetups/{mid}/rsvp")
    async def rsvp_meetup(mid: str, data: RsvpBody, current_user=Depends(get_current_user)):
        await _member(current_user)
        if data.response not in RSVP:
            raise HTTPException(status_code=400, detail=f"response: {RSVP}")
        m = await _meetup_for(mid, current_user)
        if m.get("status") == "cancelled":
            raise HTTPException(status_code=410, detail="นัดนี้ยกเลิกแล้ว")
        await db.alumni_meetups.update_one({"id": mid}, {"$set": {f"rsvps.{current_user.id}": data.response},
                                                         "$addToSet": {"line_member_ids": current_user.id}})
        return _meetup_out(await db.alumni_meetups.find_one({"id": mid}, {"_id": 0}), current_user.id)

    @router.post("/meetups/{mid}/cancel")
    async def cancel_meetup(mid: str, current_user=Depends(get_current_user)):
        m = await _meetup_for(mid, current_user)
        if m["created_by"] != current_user.id and not is_admin(current_user):
            raise HTTPException(status_code=403, detail="ยกเลิกได้เฉพาะผู้สร้างนัด")
        await db.alumni_meetups.update_one({"id": mid}, {"$set": {"status": "cancelled"}})
        return {"id": mid, "status": "cancelled"}

    # -------------------------------------------------------- benefits hub

    async def _cards() -> List[dict]:
        doc = await db.alumni_settings.find_one({"id": "benefits"}, {"_id": 0})
        return (doc or {}).get("cards") or [dict(c) for c in DEFAULT_BENEFITS]

    @router.get("/benefits")
    async def benefits(current_user=Depends(get_current_user)):
        me = await svc.profile(current_user.id) or {}
        role = me.get("role")
        interests = me.get("interests") or {}
        cards = []
        for c in sorted(await _cards(), key=lambda x: x.get("order", 0)):
            if not c.get("active", True):
                continue
            aud = c.get("audience", "all")
            if aud == "alumni" and role not in ("alumni", "staff") and not is_admin(current_user):
                continue
            if aud == "current_student" and role != "current_student" and not is_admin(current_user):
                continue
            c = dict(c)
            if c.get("interest_key"):
                c["my_interest"] = bool(interests.get(c["interest_key"]))
            cards.append(c)
        return {"cards": cards, "interests": {k: bool(interests.get(k)) for k in INTEREST_KEYS}}

    @router.put("/benefits")
    async def put_benefits(cards: List[Dict[str, Any]] = Body(..., embed=True), current_user=Depends(get_current_user)):
        _admin(current_user)
        clean = _validate_cards(cards)
        await db.alumni_settings.update_one({"id": "benefits"}, {"$set": {
            "id": "benefits", "cards": clean, "updated_at": now_iso(), "updated_by": current_user.id}}, upsert=True)
        return {"cards": clean}

    @router.put("/benefits/interests")
    async def put_interests(data: InterestsBody, current_user=Depends(get_current_user)):
        me = await _member(current_user)
        cur = dict(me.get("interests") or {})
        for k, v in data.model_dump().items():
            if v is not None:
                cur[k] = bool(v)
        cur["updated_at"] = now_iso()
        await db.alumni_users.update_one({"user_id": current_user.id}, {"$set": {"interests": cur}})
        return {"interests": {k: bool(cur.get(k)) for k in INTEREST_KEYS}}

    @router.get("/admin/interests")
    async def admin_interests(key: Optional[str] = None, current_user=Depends(get_current_user)):
        _admin(current_user)
        keys = [key] if key else list(INTEREST_KEYS)
        q = {"$or": [{f"interests.{k}": True} for k in keys]}
        items = await db.alumni_users.find(q, {"_id": 0, "user_id": 1, "nickname": 1, "gen": 1, "role": 1,
                                                "company": 1, "position": 1, "interests": 1}).to_list(2000)
        users = await db.users.find({"id": {"$in": [i["user_id"] for i in items]}},
                                    {"_id": 0, "id": 1, "full_name": 1, "email": 1}).to_list(2000)
        umap = {u["id"]: u for u in users}
        for i in items:
            u = umap.get(i["user_id"], {})
            i["full_name"], i["email"] = u.get("full_name"), u.get("email")
        return {"members": items}

    return {"invite_clues": lambda inv: invite_clues(svc, inv)}
