"""External-Agent-Ready admin operations for /dorm.

Two-lane autonomy model:
  * Lane A (Auto-execute + 1-click Undo): objective, reversible maintenance such as
    closing/reopening verified-gone external rooms, clearing false maybe_gone flags,
    updating building media/info, resolving reports on already-closed targets, or
    batch-refreshing external listings (guarded at 40% mass-close). Every mutation
    snapshots prior documents into `dorm_agent_actions` so a human admin can undo
    any action in one click.
  * Lane B (Human-in-the-Loop Proposals + 1-click Confirm): judgment calls such as
    student verification approval, closing/deleting native student posts, resolving live
    reports, moderation of mates/reviews, featuring rooms, or >40% batch closures.
    External agents queue deduplicated proposals in `dorm_admin_proposals` with
    evidence and default payloads; human admins edit inline if needed and confirm
    in one click (which also records an undoable action).
"""
from __future__ import annotations

import copy
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from lib import api_keys

ALLOWED_SNAPSHOT_COLLECTIONS = frozenset({
    "dorm_listings",
    "dorm_buildings",
    "dorm_reports",
    "dorm_verifications",
    "dorm_mates",
    "dorm_reviews",
    "dorm_gone_signals",
})

EXT_PATCH_FIELDS = frozenset({
    "price_total",
    "bedrooms",
    "bathrooms",
    "size_sqm",
    "floor",
    "furnished",
    "amenities",
    "min_contract_months",
    "deposit_months",
    "advance_months",
    "available_from",
    "ext_photos",
    "source_seen_at",
})

PRIORITY_ORDER = {"high": 0, "normal": 1, "low": 2}
TARGET_BOUND_PROPOSAL_KINDS = frozenset({
    "review_verification",
    "close_native_listing",
    "delete_listing",
    "resolve_report",
    "feature_listing",
    "moderate_mate",
    "moderate_review",
})
_HTTPS_URL = re.compile(r"^https://[^\s\"'<>]{4,600}$")
_DATE_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")


class AgentExecuteIn(BaseModel):
    action: Literal[
        "close_external_gone",
        "reopen_external",
        "clear_false_maybe_gone",
        "resolve_stale_report",
        "patch_external_listing",
        "update_building_media",
        "refresh_external_batch",
    ]
    params: Dict[str, Any] = Field(default_factory=dict)
    reason: str = Field("", max_length=300)
    dry_run: bool = False


class EvidenceItem(BaseModel):
    label: str = Field(..., min_length=1, max_length=60)
    value: str = Field(..., min_length=1, max_length=300)
    url: Optional[str] = Field(None, max_length=600)


class ProposalIn(BaseModel):
    kind: Literal[
        "review_verification",
        "close_native_listing",
        "delete_listing",
        "resolve_report",
        "feature_listing",
        "upsert_building",
        "moderate_mate",
        "moderate_review",
        "publish_digest",
        "mass_external_sync",
    ]
    priority: Literal["high", "normal", "low"] = "normal"
    title: str = Field(..., min_length=2, max_length=160)
    summary: str = Field("", max_length=600)
    target_type: Literal[
        "listing", "mate", "review", "report", "verification", "building", "digest", "batch"
    ] = "listing"
    target_id: str = Field("", max_length=80)
    evidence: List[EvidenceItem] = Field(default_factory=list, max_length=10)
    payload: Dict[str, Any] = Field(default_factory=dict)


class ProposalBatchIn(BaseModel):
    items: List[ProposalIn] = Field(..., min_length=1, max_length=50)


class ProposalConfirmIn(BaseModel):
    payload: Optional[Dict[str, Any]] = None
    note: str = Field("", max_length=300)


class ProposalRejectIn(BaseModel):
    note: str = Field("", max_length=300)


class DormKeyCreateIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=80)
    scopes: List[str] = Field(
        default_factory=lambda: ["dorm.read", "dorm.sync", "dorm.propose"]
    )
    expires_days: Optional[int] = Field(None, ge=1, le=365)
    expires_at: Optional[str] = None


async def ensure_agent_indexes(db) -> None:
    """Create indexes for proposals and reversible action logs."""
    await db.dorm_admin_proposals.create_index("id", unique=True)
    await db.dorm_admin_proposals.create_index([("status", 1), ("created_at", -1)])
    await db.dorm_admin_proposals.create_index([("kind", 1), ("target_id", 1), ("status", 1)])
    await db.dorm_agent_actions.create_index("id", unique=True)
    await db.dorm_agent_actions.create_index([("created_at", -1)])
    await db.dorm_agent_actions.create_index([("undone_at", 1), ("created_at", -1)])


def _is_human_admin(u) -> bool:
    return getattr(u, "role", None) == "admin" and getattr(u, "auth_method", None) != "api_key"


def _actor_label(u) -> str:
    if getattr(u, "auth_method", None) == "api_key":
        return getattr(u, "full_name", None) or getattr(u, "id", "api-key")
    return getattr(u, "email", None) or getattr(u, "id", "admin")


def _strip_mongo_id(doc: Optional[dict]) -> Optional[dict]:
    if doc is None:
        return None
    out = copy.deepcopy(doc)
    out.pop("_id", None)
    return out


def _format_action_row(doc: dict) -> dict:
    row = {k: v for k, v in doc.items() if k not in ("_id", "snapshots")}
    snap_n = int(doc.get("snapshot_count") or 0)
    row["snapshot_count"] = snap_n
    row["can_undo"] = bool(not doc.get("undone_at") and snap_n > 0)
    return row


def register_dorm_agent_routes(dorm_router: APIRouter, db, get_current_user, deps: Dict[str, Any]) -> Dict[str, Any]:
    """Attach external-agent admin routes to `dorm_router` and return overview helper functions."""
    _is_admin = deps["_is_admin"]
    _ensure = deps["_ensure"]
    _now = deps["_now"]
    _iso = deps["_iso"]
    plan_external_import = deps["plan_external_import"]
    per_person_of = deps["per_person_of"]
    BuildingIn = deps["BuildingIn"]
    _backfill_verified = deps["_backfill_verified"]
    _report_targets = deps["_report_targets"]
    is_listing_gone = deps["is_listing_gone"]
    EXT_TTL_DAYS = deps["EXT_TTL_DAYS"]
    GONE_REASONS = deps["GONE_REASONS"]
    _bust_cache = deps.get("_bust_cache") or (lambda: None)

    def _admin(u) -> None:
        if not _is_admin(u):
            raise HTTPException(403, "Admin only")

    def _human_admin(u) -> None:
        _admin(u)
        if getattr(u, "auth_method", None) == "api_key":
            raise HTTPException(403, "กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน (API key ทำรายการนี้ไม่ได้)")

    async def _find_listing_by_params(params: dict) -> Optional[dict]:
        lid = str(params.get("listing_id") or "").strip()
        ext_id = str(params.get("ext_id") or "").strip()
        if lid:
            return await db.dorm_listings.find_one({"id": lid}, {"_id": 0})
        if ext_id:
            return await db.dorm_listings.find_one({"ext_id": ext_id}, {"_id": 0})
        return None

    async def _snap_one(collection: str, query: dict) -> dict:
        if collection not in ALLOWED_SNAPSHOT_COLLECTIONS:
            raise ValueError(f"Unsupported snapshot collection: {collection}")
        doc = await db[collection].find_one(query, {"_id": 0})
        return {"collection": collection, "query": dict(query), "before": _strip_mongo_id(doc)}

    async def _record_action(
        action: str,
        source: str,
        title: str,
        reason: str,
        target_type: str,
        target_id: str,
        target_link: Optional[str],
        affected_count: int,
        actor: str,
        snapshots: List[dict],
        proposal_id: Optional[str] = None,
    ) -> dict:
        now_s = _iso(_now())
        doc = {
            "id": "act_" + uuid.uuid4().hex[:12],
            "action": action,
            "source": source,
            "title": title[:160],
            "reason": (reason or "")[:300],
            "target_type": target_type,
            "target_id": target_id,
            "target_link": target_link,
            "affected_count": int(affected_count),
            "actor": actor,
            "proposal_id": proposal_id,
            "snapshot_count": len(snapshots),
            "snapshots": snapshots,
            "created_at": now_s,
            "undone_at": None,
            "undone_by": None,
        }
        await db.dorm_agent_actions.insert_one(dict(doc))
        _bust_cache()
        return _format_action_row(doc)

    async def _enrich_proposals(props: List[dict]) -> List[dict]:
        if not props:
            return []
        list_ids = {p["target_id"] for p in props if p.get("target_type") == "listing" and p.get("target_id")}
        mate_ids = {p["target_id"] for p in props if p.get("target_type") == "mate" and p.get("target_id")}
        bld_slugs = {p["target_id"] for p in props if p.get("target_type") == "building" and p.get("target_id")}
        ver_uids = {p["target_id"] for p in props if p.get("target_type") == "verification" and p.get("target_id")}
        rep_ids = {p["target_id"] for p in props if p.get("target_type") == "report" and p.get("target_id")}

        lmap = {x["id"]: x async for x in db.dorm_listings.find({"id": {"$in": list(list_ids)}}, {"_id": 0, "id": 1, "title": 1, "status": 1})} if list_ids else {}
        mmap = {x["id"]: x async for x in db.dorm_mates.find({"id": {"$in": list(mate_ids)}}, {"_id": 0, "id": 1, "display_name": 1, "status": 1})} if mate_ids else {}
        bmap = {x["slug"]: x async for x in db.dorm_buildings.find({"slug": {"$in": list(bld_slugs)}}, {"_id": 0, "slug": 1, "name": 1})} if bld_slugs else {}
        vmap = {x["user_id"]: x async for x in db.dorm_verifications.find({"user_id": {"$in": list(ver_uids)}}, {"_id": 0, "user_id": 1, "status": 1, "faculty": 1})} if ver_uids else {}
        rmap = {x["id"]: x async for x in db.dorm_reports.find({"id": {"$in": list(rep_ids)}}, {"_id": 0})} if rep_ids else {}

        rep_list = list(rmap.values())
        if rep_list:
            await _report_targets(rep_list)
            rmap = {r["id"]: r for r in rep_list}

        out = []
        for p in props:
            item = {k: v for k, v in p.items() if k != "_id"}
            tt = item.get("target_type")
            tid = item.get("target_id") or ""
            link, ttitle, tstatus = None, None, None
            if tt == "listing" and tid in lmap:
                ttitle, link, tstatus = lmap[tid].get("title"), f"/dorm/rooms/{tid}", lmap[tid].get("status")
            elif tt == "mate" and tid in mmap:
                ttitle, link, tstatus = mmap[tid].get("display_name"), f"/dorm/mates?focus={tid}", mmap[tid].get("status")
            elif tt == "building" and tid in bmap:
                ttitle, link, tstatus = bmap[tid].get("name"), f"/dorm/buildings/{tid}", "active"
            elif tt == "verification" and tid in vmap:
                ttitle, tstatus = vmap[tid].get("faculty") or tid, vmap[tid].get("status")
            elif tt == "report" and tid in rmap:
                rep = rmap[tid]
                ttitle, link = rep.get("target_title"), rep.get("target_link")
                tstatus = "resolved" if rep.get("resolved") else rep.get("target_status")
            item["target_link"] = link
            item["target_title"] = ttitle
            item["target_status"] = tstatus
            out.append(item)
        out.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        out.sort(key=lambda x: PRIORITY_ORDER.get(x.get("priority") or "normal", 1))
        return out

    async def list_pending_proposals(limit: int = 100) -> List[dict]:
        rows = await db.dorm_admin_proposals.find({"status": "pending"}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return await _enrich_proposals(rows)

    async def list_recent_actions(limit: int = 30) -> List[dict]:
        rows = await db.dorm_agent_actions.find({}, {"_id": 0, "snapshots": 0}).sort("created_at", -1).to_list(limit)
        return [_format_action_row(r) for r in rows]

    # ------------------------------------------------------------------ Lane A: Auto-Execute + Undo
    async def _run_batch_refresh(raw_listings: List[dict], close_missing: bool, dry_run: bool, reason: str, actor: str) -> dict:
        existing = await db.dorm_listings.find(
            {"external": True}, {"_id": 0, "ext_id": 1, "id": 1, "status": 1, "closed_reason": 1}
        ).to_list(10000)
        plan = plan_external_import({"listings": raw_listings}, existing, _now())
        to_close = plan["close"] if close_missing else []
        active_ext = [e for e in existing if e.get("status") != "closed"]
        if close_missing and len(active_ext) >= 5 and (len(to_close) / max(1, len(active_ext))) > 0.40:
            raise HTTPException(
                409,
                f"คำสั่งนี้จะปิดห้องภายนอก {len(to_close)}/{len(active_ext)} ห้อง (เกิน 40%) "
                "ระบบกันพลาดไม่อนุญาตให้ปิดอัตโนมัติ — กรุณาส่งเป็นข้อเสนอ (mass_external_sync) ให้แอดมินยืนยัน",
            )
        summary = f"อัปเดต {len(plan['upsert'])} ห้อง" + (f", ปิดที่หาย {len(to_close)} ห้อง" if close_missing else "")
        if dry_run:
            return {
                "ok": True, "dry_run": True, "action": "refresh_external_batch",
                "summary": summary, "upserted": len(plan["upsert"]), "closed": len(to_close),
                "skipped": len(plan["skipped"]),
            }

        now_s = _iso(_now())
        snapshots: List[dict] = []
        up_ids = [d["id"] for d in plan["upsert"]]
        existing_by_id = {}
        if up_ids:
            async for cur in db.dorm_listings.find({"id": {"$in": up_ids}}, {"_id": 0}):
                existing_by_id[cur["id"]] = cur
        for doc in plan["upsert"]:
            snapshots.append({"collection": "dorm_listings", "query": {"id": doc["id"]}, "before": _strip_mongo_id(existing_by_id.get(doc["id"]))})
            on_insert = {"status": "active", "featured": False, "views": 0, "contact_reveals": 0, "reports": 0, "created_at": now_s}
            if "status" in doc:
                on_insert.pop("status", None)
            await db.dorm_listings.update_one({"ext_id": doc["ext_id"]}, {"$set": doc, "$setOnInsert": on_insert}, upsert=True)

        if to_close:
            async for cur in db.dorm_listings.find({"ext_id": {"$in": to_close}, "external": True}, {"_id": 0}):
                snapshots.append({"collection": "dorm_listings", "query": {"id": cur["id"]}, "before": _strip_mongo_id(cur)})
            await db.dorm_listings.update_many(
                {"ext_id": {"$in": to_close}, "external": True},
                {"$set": {"status": "closed", "closed_reason": "missing", "closed_by": "agent", "closed_at": now_s}},
            )

        act = await _record_action(
            action="refresh_external_batch", source="agent_auto",
            title=f"ซิงก์ห้องภายนอก ({summary})",
            reason=reason or "อัปเดตข้อมูลห้องจากเว็บต้นทาง",
            target_type="batch", target_id="external_batch", target_link="/dorm/rooms",
            affected_count=len(plan["upsert"]) + len(to_close), actor=actor, snapshots=snapshots,
        )
        return {"ok": True, "action_id": act["id"], "upserted": len(plan["upsert"]), "closed": len(to_close), "skipped": len(plan["skipped"])}

    @dorm_router.post("/admin/agent/execute")
    async def agent_execute(body: AgentExecuteIn, u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        now = _now()
        now_s = _iso(now)
        actor = _actor_label(u)
        params = body.params or {}
        action = body.action

        if action == "close_external_gone":
            x = await _find_listing_by_params(params)
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            if not x.get("external"):
                raise HTTPException(409, "ประกาศที่นิสิตลงเองต้องส่งเป็นข้อเสนอ (proposal) ให้แอดมินยืนยัน")
            if x.get("status") == "closed":
                return {"ok": True, "noop": True, "status": "closed"}
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะปิดห้องภายนอก {x['title']}", "affected_count": 1}
            snap = await _snap_one("dorm_listings", {"id": x["id"]})
            await db.dorm_listings.update_one(
                {"id": x["id"]},
                {"$set": {
                    "status": "closed", "closed_reason": "missing", "closed_by": "agent",
                    "closed_at": now_s, "maybe_gone": False, "reserved_until": None,
                    "agent_note": body.reason,
                }},
            )
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"ปิดห้องไม่ว่าง: {x['title']}", reason=body.reason or "ไม่พบห้องบนเว็บต้นทางแล้ว",
                target_type="listing", target_id=x["id"], target_link=f"/dorm/rooms/{x['id']}",
                affected_count=1, actor=actor, snapshots=[snap],
            )
            return {"ok": True, "action_id": act["id"], "status": "closed"}

        if action == "reopen_external":
            x = await _find_listing_by_params(params)
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            if not x.get("external"):
                raise HTTPException(409, "ใช้ได้เฉพาะประกาศจากเว็บภายนอก")
            if x.get("closed_reason") == "deleted":
                raise HTTPException(409, "ประกาศนี้ถูกลบไว้ กรุณาส่งเป็นข้อเสนอให้แอดมิน")
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะเปิดห้อง {x['title']} คืน", "affected_count": 1}
            snap = await _snap_one("dorm_listings", {"id": x["id"]})
            await db.dorm_listings.update_one(
                {"id": x["id"]},
                {"$set": {
                    "status": "active", "closed_reason": None, "closed_by": None, "closed_at": None,
                    "maybe_gone": False, "gone_reports": 0, "reserved_until": None,
                    "renewed_at": now_s, "expires_at": _iso(now + timedelta(days=EXT_TTL_DAYS)),
                }},
            )
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"เปิดห้องกลับ: {x['title']}", reason=body.reason or "ตรวจพบว่าห้องยังว่างอยู่บนเว็บต้นทาง",
                target_type="listing", target_id=x["id"], target_link=f"/dorm/rooms/{x['id']}",
                affected_count=1, actor=actor, snapshots=[snap],
            )
            return {"ok": True, "action_id": act["id"], "status": "active"}

        if action == "clear_false_maybe_gone":
            x = await _find_listing_by_params(params)
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            if not x.get("external"):
                raise HTTPException(409, "ใช้ได้เฉพาะประกาศจากเว็บภายนอก")
            lid = x["id"]
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะล้างธงอาจไม่ว่างของ {x['title']}", "affected_count": 1}
            snaps = [await _snap_one("dorm_listings", {"id": lid})]
            async for sig in db.dorm_gone_signals.find({"listing_id": lid}, {"_id": 0}):
                snaps.append({"collection": "dorm_gone_signals", "query": {"listing_id": sig["listing_id"], "actor_key": sig["actor_key"]}, "before": _strip_mongo_id(sig)})
            rep_q = {"target_type": "listing", "target_id": lid, "reason": {"$in": list(GONE_REASONS)}, "resolved": False}
            async for rep in db.dorm_reports.find(rep_q, {"_id": 0}):
                snaps.append({"collection": "dorm_reports", "query": {"id": rep["id"]}, "before": _strip_mongo_id(rep)})
            await db.dorm_listings.update_one({"id": lid}, {"$set": {"maybe_gone": False, "gone_reports": 0}})
            await db.dorm_gone_signals.delete_many({"listing_id": lid})
            await db.dorm_reports.update_many(rep_q, {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": actor}})
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"ล้างป้ายอาจไม่ว่าง: {x['title']}", reason=body.reason or "ตรวจสอบเว็บต้นทางแล้วยังว่างอยู่",
                target_type="listing", target_id=lid, target_link=f"/dorm/rooms/{lid}",
                affected_count=1, actor=actor, snapshots=snaps,
            )
            return {"ok": True, "action_id": act["id"]}

        if action == "resolve_stale_report":
            rid = str(params.get("report_id") or "").strip()
            rep = await db.dorm_reports.find_one({"id": rid}, {"_id": 0}) if rid else None
            if not rep:
                raise HTTPException(404, "ไม่พบรายงานนี้")
            if rep.get("resolved"):
                return {"ok": True, "noop": True, "resolved": True}
            ttype, tid = rep.get("target_type"), rep.get("target_id")
            is_stale = False
            if ttype == "listing":
                tgt = await db.dorm_listings.find_one({"id": tid}, {"_id": 0})
                is_stale = tgt is None or is_listing_gone(tgt, now_s)
            elif ttype == "mate":
                tgt = await db.dorm_mates.find_one({"id": tid}, {"_id": 0})
                is_stale = tgt is None or tgt.get("status") == "closed" or (tgt.get("expires_at") or "") <= now_s
            elif ttype == "review":
                tgt = await db.dorm_reviews.find_one({"id": tid}, {"_id": 0})
                is_stale = tgt is None
            if not is_stale:
                raise HTTPException(409, "เป้าหมายยังเปิดอยู่ กรุณาส่งเป็นข้อเสนอ (proposal) ให้แอดมินพิจารณาแทน")
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะปิดรายงานค้าง {rid}", "affected_count": 1}
            snap = await _snap_one("dorm_reports", {"id": rid})
            await db.dorm_reports.update_one({"id": rid}, {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": actor}})
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"ปิดรายงานค้าง ({rep.get('reason') or rid})", reason=body.reason or "เป้าหมายปิดหรือถูกลบไปแล้ว",
                target_type="report", target_id=rid, target_link="/dorm/admin",
                affected_count=1, actor=actor, snapshots=[snap],
            )
            return {"ok": True, "action_id": act["id"], "resolved": True}

        if action == "patch_external_listing":
            x = await _find_listing_by_params(params)
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            if not x.get("external"):
                raise HTTPException(409, "แก้ข้อมูลอัตโนมัติได้เฉพาะประกาศภายนอกเท่านั้น")
            raw_patch = params.get("patch") if isinstance(params.get("patch"), dict) else {}
            clean_patch: Dict[str, Any] = {}
            for k, v in raw_patch.items():
                if k not in EXT_PATCH_FIELDS:
                    raise HTTPException(422, f"ไม่อนุญาตให้แก้ไขฟิลด์ {k}")
                clean_patch[k] = v
            if not clean_patch:
                raise HTTPException(422, "ไม่มีข้อมูลสำหรับอัปเดต")
            if "price_total" in clean_patch:
                pt = int(clean_patch["price_total"])
                if not 500 <= pt <= 200000:
                    raise HTTPException(422, "price_total ต้องอยู่ระหว่าง 500–200000")
                clean_patch["price_total"] = pt
                clean_patch["price_per_person"] = per_person_of(pt, x.get("people_total") or 2)
            if "ext_photos" in clean_patch:
                photos = []
                for p in (clean_patch["ext_photos"] or [])[:8]:
                    if isinstance(p, dict) and _HTTPS_URL.match(p.get("url") or ""):
                        photos.append({
                            "url": p["url"],
                            "credit": str(p.get("credit") or x.get("source") or "External")[:80],
                            "source_url": p.get("source_url") if _HTTPS_URL.match(p.get("source_url") or "") else x.get("source_url"),
                        })
                clean_patch["ext_photos"] = photos
            if "source_seen_at" in clean_patch:
                sv = str(clean_patch["source_seen_at"] or "")
                if not _DATE_RE.match(sv):
                    raise HTTPException(422, "source_seen_at ต้องเป็น YYYY-MM-DD")
                seen_dt = datetime.fromisoformat(sv).replace(tzinfo=timezone.utc)
                clean_patch["renewed_at"] = _iso(seen_dt)
                clean_patch["expires_at"] = _iso(seen_dt + timedelta(days=EXT_TTL_DAYS))
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะอัปเดต {', '.join(clean_patch)} ของ {x['title']}", "affected_count": 1}
            snap = await _snap_one("dorm_listings", {"id": x["id"]})
            await db.dorm_listings.update_one({"id": x["id"]}, {"$set": clean_patch})
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"อัปเดตข้อมูลห้อง: {x['title']}", reason=body.reason or f"ปรับปรุง {', '.join(clean_patch)}",
                target_type="listing", target_id=x["id"], target_link=f"/dorm/rooms/{x['id']}",
                affected_count=1, actor=actor, snapshots=[snap],
            )
            return {"ok": True, "action_id": act["id"], "updated": list(clean_patch.keys())}

        if action == "update_building_media":
            slug = str(params.get("slug") or "").strip()
            bld = await db.dorm_buildings.find_one({"slug": slug}, {"_id": 0}) if slug else None
            if not bld:
                raise HTTPException(404, "ไม่พบตึกนี้ (หากต้องการเพิ่มตึกใหม่ กรุณาส่งเป็นข้อเสนอ upsert_building)")
            allowed = ("photos", "price_seen", "official_url", "web_review_summary", "web_review_sources")
            merged = dict(bld)
            changed = []
            for f in allowed:
                if f in params and params[f] is not None:
                    merged[f] = params[f]
                    changed.append(f)
            if not changed:
                raise HTTPException(422, "ไม่มีข้อมูลตึกสำหรับอัปเดต")
            try:
                validated = BuildingIn(**{k: v for k, v in merged.items() if k in BuildingIn.model_fields}).model_dump()
            except Exception as e:
                raise HTTPException(422, f"ข้อมูลตึกไม่ถูกต้อง: {e}")
            if body.dry_run:
                return {"ok": True, "dry_run": True, "action": action, "summary": f"จะอัปเดตตึก {bld['name']} ({', '.join(changed)})", "affected_count": 1}
            snap = await _snap_one("dorm_buildings", {"slug": slug})
            await db.dorm_buildings.update_one({"slug": slug}, {"$set": {f: validated[f] for f in changed}})
            act = await _record_action(
                action=action, source="agent_auto",
                title=f"อัปเดตสื่อ/ข้อมูลตึก: {bld['name']}", reason=body.reason or f"อัปเดต {', '.join(changed)}",
                target_type="building", target_id=slug, target_link=f"/dorm/buildings/{slug}",
                affected_count=1, actor=actor, snapshots=[snap],
            )
            return {"ok": True, "action_id": act["id"], "updated": changed}

        if action == "refresh_external_batch":
            raw_listings = params.get("listings")
            if not isinstance(raw_listings, list):
                raise HTTPException(422, "params.listings ต้องเป็น list")
            return await _run_batch_refresh(
                raw_listings, bool(params.get("close_missing", False)), body.dry_run, body.reason, actor
            )

        raise HTTPException(400, f"ไม่รู้จัก action {action}")

    @dorm_router.get("/admin/actions")
    async def list_agent_actions(
        status: Literal["all", "active", "undone"] = "all",
        limit: int = Query(50, ge=1, le=200),
        u=Depends(get_current_user),
    ):
        _admin(u)
        await _ensure()
        q: Dict[str, Any] = {}
        if status == "active":
            q["undone_at"] = None
        elif status == "undone":
            q["undone_at"] = {"$ne": None}
        rows = await db.dorm_agent_actions.find(q, {"_id": 0, "snapshots": 0}).sort("created_at", -1).to_list(limit)
        return {"items": [_format_action_row(r) for r in rows]}

    @dorm_router.post("/admin/actions/{action_id}/undo")
    async def undo_agent_action(action_id: str, u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        act = await db.dorm_agent_actions.find_one({"id": action_id}, {"_id": 0})
        if not act:
            raise HTTPException(404, "ไม่พบรายการ action นี้")
        if act.get("undone_at"):
            raise HTTPException(409, "รายการนี้ถูกย้อนกลับ (undo) ไปแล้ว")
        snaps = list(act.get("snapshots") or [])
        if not snaps:
            raise HTTPException(409, "รายการนี้ไม่มีข้อมูลสำหรับย้อนกลับ")
        for s in reversed(snaps):
            coll = s.get("collection")
            if coll not in ALLOWED_SNAPSHOT_COLLECTIONS:
                raise HTTPException(400, f"ไม่อนุญาตให้ย้อนกลับ collection {coll}")
            query = s.get("query") or {}
            before = s.get("before")
            if before is None:
                await db[coll].delete_one(query)
            else:
                doc = dict(before)
                doc.pop("_id", None)
                await db[coll].replace_one(query, doc, upsert=True)
        # If undoing a verification approval where prior state was not verified, revert backfill flags.
        if act.get("action") == "review_verification":
            uid = act.get("target_id")
            ver = await db.dorm_verifications.find_one({"user_id": uid}, {"_id": 0, "status": 1}) if uid else None
            if not ver or ver.get("status") != "verified":
                usr = await db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "auth_method": 1}) if uid else None
                email = (usr or {}).get("email", "").lower()
                google_swu = (usr or {}).get("auth_method") == "google" and (email.endswith("@swu.ac.th") or email.endswith(".swu.ac.th"))
                if not google_swu and uid:
                    await db.dorm_listings.update_many({"owner_id": uid}, {"$set": {"poster_swu_verified": False}})
                    await db.dorm_mates.update_many({"user_id": uid}, {"$set": {"swu_verified": False}})
                    await db.dorm_reviews.update_many({"user_id": uid}, {"$set": {"swu_verified": False}})
        now_s = _iso(_now())
        await db.dorm_agent_actions.update_one(
            {"id": action_id},
            {"$set": {"undone_at": now_s, "undone_by": _actor_label(u)}},
        )
        _bust_cache()
        return {"ok": True, "id": action_id, "restored": len(snaps), "undone_at": now_s}

    # ------------------------------------------------------------------ Lane B: Proposals
    async def _validate_proposal_target(p: ProposalIn) -> None:
        tid = p.target_id.strip()
        if p.kind in TARGET_BOUND_PROPOSAL_KINDS and not tid:
            raise HTTPException(422, f"ข้อเสนอประเภท {p.kind} ต้องระบุ target_id")
        if p.kind == "review_verification":
            if not await db.dorm_verifications.find_one({"user_id": tid}, {"_id": 1}):
                raise HTTPException(404, f"ไม่พบคำขอยืนยันของ {tid}")
        elif p.kind in ("close_native_listing", "delete_listing", "feature_listing"):
            if not await db.dorm_listings.find_one({"id": tid}, {"_id": 1}):
                raise HTTPException(404, f"ไม่พบประกาศ {tid}")
        elif p.kind == "resolve_report":
            if not await db.dorm_reports.find_one({"id": tid}, {"_id": 1}):
                raise HTTPException(404, f"ไม่พบรายงาน {tid}")
        elif p.kind == "moderate_mate":
            if not await db.dorm_mates.find_one({"id": tid}, {"_id": 1}):
                raise HTTPException(404, f"ไม่พบโปรไฟล์หาเมท {tid}")
        elif p.kind == "moderate_review":
            if not await db.dorm_reviews.find_one({"id": tid}, {"_id": 1}):
                raise HTTPException(404, f"ไม่พบรีวิวตึก {tid}")

    async def _upsert_proposal(p: ProposalIn, actor: str, now_s: str) -> dict:
        await _validate_proposal_target(p)
        tid = p.target_id.strip()
        ev = [e.model_dump() for e in p.evidence]
        if tid:
            existing = await db.dorm_admin_proposals.find_one(
                {"kind": p.kind, "target_id": tid, "status": "pending"}, {"_id": 0}
            )
            if existing:
                await db.dorm_admin_proposals.update_one(
                    {"id": existing["id"]},
                    {"$set": {
                        "priority": p.priority, "title": p.title, "summary": p.summary,
                        "target_type": p.target_type, "evidence": ev, "payload": p.payload,
                        "updated_at": now_s, "updated_by": actor,
                    }},
                )
                return {"ok": True, "id": existing["id"], "deduplicated": True}
        doc = {
            "id": "prop_" + uuid.uuid4().hex[:12],
            "kind": p.kind,
            "priority": p.priority,
            "title": p.title,
            "summary": p.summary,
            "target_type": p.target_type,
            "target_id": tid,
            "evidence": ev,
            "payload": p.payload,
            "status": "pending",
            "created_by": actor,
            "created_at": now_s,
            "updated_at": now_s,
            "decided_at": None,
            "decided_by": None,
            "decision_note": "",
            "action_id": None,
        }
        await db.dorm_admin_proposals.insert_one(dict(doc))
        return {"ok": True, "id": doc["id"], "deduplicated": False}

    @dorm_router.post("/admin/proposals")
    async def create_proposal(body: ProposalIn, u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        return await _upsert_proposal(body, _actor_label(u), _iso(_now()))

    @dorm_router.post("/admin/proposals/batch")
    async def create_proposals_batch(body: ProposalBatchIn, u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        actor = _actor_label(u)
        now_s = _iso(_now())
        results = []
        for item in body.items:
            results.append(await _upsert_proposal(item, actor, now_s))
        return {"ok": True, "items": results}

    @dorm_router.get("/admin/proposals")
    async def get_proposals(
        status: Literal["pending", "confirmed", "rejected", "all"] = "pending",
        limit: int = Query(100, ge=1, le=200),
        u=Depends(get_current_user),
    ):
        _admin(u)
        await _ensure()
        q = {} if status == "all" else {"status": status}
        rows = await db.dorm_admin_proposals.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
        return {"items": await _enrich_proposals(rows)}

    @dorm_router.post("/admin/proposals/{pid}/confirm")
    async def confirm_proposal(pid: str, body: Optional[ProposalConfirmIn] = None, u=Depends(get_current_user)):
        _human_admin(u)
        await _ensure()
        prop = await db.dorm_admin_proposals.find_one({"id": pid}, {"_id": 0})
        if not prop:
            raise HTTPException(404, "ไม่พบข้อเสนอนี้")
        if prop.get("status") != "pending":
            raise HTTPException(409, f"ข้อเสนอนี้ถูกจัดการไปแล้ว ({prop.get('status')})")

        body = body or ProposalConfirmIn()
        final_payload = {**(prop.get("payload") or {}), **(body.payload or {})}
        kind = prop.get("kind")
        tid = prop.get("target_id") or ""
        now = _now()
        now_s = _iso(now)
        actor = _actor_label(u)
        snaps: List[dict] = []
        res: Dict[str, Any] = {}
        act_title = prop.get("title") or kind
        tlink = f"/dorm/admin"

        if kind == "review_verification":
            action = final_payload.get("action") or "approve"
            if action not in ("approve", "reject"):
                raise HTTPException(422, "action ต้องเป็น approve หรือ reject")
            ver = await db.dorm_verifications.find_one({"user_id": tid}, {"_id": 0})
            if not ver:
                raise HTTPException(404, "ไม่พบคำขอยืนยันนี้")
            snaps.append({"collection": "dorm_verifications", "query": {"user_id": tid}, "before": _strip_mongo_id(ver)})
            reason = str(final_payload.get("reason") or "")[:200].strip()
            if action == "approve":
                await db.dorm_verifications.update_one(
                    {"user_id": tid},
                    {"$set": {"status": "verified", "verified_at": now_s, "updated_at": now_s, "reviewed_by": u.id, "reject_reason": ""}},
                )
                await _backfill_verified(tid)
                act_title = f"อนุมัติยืนยันนิสิต มศว ({ver.get('faculty') or tid})"
            else:
                await db.dorm_verifications.update_one(
                    {"user_id": tid},
                    {"$set": {"status": "rejected", "updated_at": now_s, "reviewed_by": u.id, "reject_reason": reason}},
                )
                act_title = f"ปฏิเสธยืนยันนิสิต มศว ({ver.get('faculty') or tid})"
            res = {"status": "verified" if action == "approve" else "rejected"}

        elif kind == "close_native_listing":
            x = await db.dorm_listings.find_one({"id": tid}, {"_id": 0})
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            snaps.append({"collection": "dorm_listings", "query": {"id": tid}, "before": _strip_mongo_id(x)})
            await db.dorm_listings.update_one(
                {"id": tid},
                {"$set": {
                    "status": "closed", "closed_by": "admin", "closed_reason": "admin",
                    "closed_at": now_s, "reserved_until": None, "owner_confirm_needed": False,
                }},
            )
            tlink = f"/dorm/rooms/{tid}"
            act_title = f"ปิดประกาศ: {x.get('title')}"
            res = {"status": "closed"}

        elif kind == "delete_listing":
            x = await db.dorm_listings.find_one({"id": tid}, {"_id": 0})
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            snaps.append({"collection": "dorm_listings", "query": {"id": tid}, "before": _strip_mongo_id(x)})
            if x.get("external"):
                await db.dorm_listings.update_one(
                    {"id": tid},
                    {"$set": {"status": "closed", "closed_reason": "deleted", "closed_by": "admin", "closed_at": now_s, "reserved_until": None}},
                )
            else:
                await db.dorm_listings.delete_one({"id": tid})
            tlink = "/dorm/admin"
            act_title = f"ลบประกาศ: {x.get('title')}"
            res = {"deleted": True}

        elif kind == "resolve_report":
            rep = await db.dorm_reports.find_one({"id": tid}, {"_id": 0})
            if not rep:
                raise HTTPException(404, "ไม่พบรายงานนี้")
            decision = final_payload.get("decision") or "resolve_only"
            if decision not in ("resolve_only", "close_target", "delete_target"):
                raise HTTPException(422, "decision ต้องเป็น resolve_only, close_target หรือ delete_target")
            snaps.append({"collection": "dorm_reports", "query": {"id": tid}, "before": _strip_mongo_id(rep)})
            await db.dorm_reports.update_one({"id": tid}, {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": actor}})
            rt, rtid = rep.get("target_type"), rep.get("target_id")
            if decision == "close_target" and rtid:
                if rt == "listing":
                    tgt = await db.dorm_listings.find_one({"id": rtid}, {"_id": 0})
                    if tgt:
                        snaps.append({"collection": "dorm_listings", "query": {"id": rtid}, "before": _strip_mongo_id(tgt)})
                        ch = {"status": "closed", "closed_by": "admin", "closed_at": now_s, "reserved_until": None,
                              "closed_reason": "admin"}
                        await db.dorm_listings.update_one({"id": rtid}, {"$set": ch})
                elif rt == "mate":
                    tgt = await db.dorm_mates.find_one({"id": rtid}, {"_id": 0})
                    if tgt:
                        snaps.append({"collection": "dorm_mates", "query": {"id": rtid}, "before": _strip_mongo_id(tgt)})
                        await db.dorm_mates.update_one({"id": rtid}, {"$set": {"status": "closed"}})
            elif decision == "delete_target" and rtid:
                if rt == "listing":
                    tgt = await db.dorm_listings.find_one({"id": rtid}, {"_id": 0})
                    if tgt:
                        snaps.append({"collection": "dorm_listings", "query": {"id": rtid}, "before": _strip_mongo_id(tgt)})
                        if tgt.get("external"):
                            await db.dorm_listings.update_one({"id": rtid}, {"$set": {"status": "closed", "closed_reason": "deleted", "closed_by": "admin", "closed_at": now_s}})
                        else:
                            await db.dorm_listings.delete_one({"id": rtid})
                elif rt == "mate":
                    tgt = await db.dorm_mates.find_one({"id": rtid}, {"_id": 0})
                    if tgt:
                        snaps.append({"collection": "dorm_mates", "query": {"id": rtid}, "before": _strip_mongo_id(tgt)})
                        await db.dorm_mates.delete_one({"id": rtid})
                elif rt == "review":
                    tgt = await db.dorm_reviews.find_one({"id": rtid}, {"_id": 0})
                    if tgt:
                        snaps.append({"collection": "dorm_reviews", "query": {"id": rtid}, "before": _strip_mongo_id(tgt)})
                        await db.dorm_reviews.delete_one({"id": rtid})
            res = {"resolved": True, "decision": decision}

        elif kind == "feature_listing":
            x = await db.dorm_listings.find_one({"id": tid}, {"_id": 0})
            if not x:
                raise HTTPException(404, "ไม่พบประกาศ")
            feat = bool(final_payload.get("featured", True))
            snaps.append({"collection": "dorm_listings", "query": {"id": tid}, "before": _strip_mongo_id(x)})
            await db.dorm_listings.update_one({"id": tid}, {"$set": {"featured": feat}})
            tlink = f"/dorm/rooms/{tid}"
            act_title = f"{'ปักแนะนำ' if feat else 'เลิกปักแนะนำ'}: {x.get('title')}"
            res = {"featured": feat}

        elif kind == "upsert_building":
            slug = str(final_payload.get("slug") or tid).strip()
            cur = await db.dorm_buildings.find_one({"slug": slug}, {"_id": 0})
            merged = {**(cur or {}), **final_payload, "slug": slug}
            try:
                bld_doc = BuildingIn(**{k: v for k, v in merged.items() if k in BuildingIn.model_fields}).model_dump()
            except Exception as e:
                raise HTTPException(422, f"ข้อมูลตึกไม่ถูกต้อง: {e}")
            bld_doc["source"] = (cur or {}).get("source") or "agent-proposal"
            snaps.append({"collection": "dorm_buildings", "query": {"slug": slug}, "before": _strip_mongo_id(cur)})
            await db.dorm_buildings.update_one({"slug": slug}, {"$set": bld_doc}, upsert=True)
            tlink = f"/dorm/buildings/{slug}"
            act_title = f"{'อัปเดตตึก' if cur else 'เพิ่มตึกใหม่'}: {bld_doc['name']}"
            res = {"slug": slug}

        elif kind == "moderate_mate":
            m = await db.dorm_mates.find_one({"id": tid}, {"_id": 0})
            if not m:
                raise HTTPException(404, "ไม่พบโปรไฟล์หาเมท")
            action = final_payload.get("action") or "close"
            if action not in ("close", "delete"):
                raise HTTPException(422, "action ต้องเป็น close หรือ delete")
            snaps.append({"collection": "dorm_mates", "query": {"id": tid}, "before": _strip_mongo_id(m)})
            if action == "close":
                await db.dorm_mates.update_one({"id": tid}, {"$set": {"status": "closed"}})
            else:
                await db.dorm_mates.delete_one({"id": tid})
            act_title = f"{'ปิด' if action == 'close' else 'ลบ'}โปรไฟล์หาเมท: {m.get('display_name')}"
            res = {"action": action}

        elif kind == "moderate_review":
            rv = await db.dorm_reviews.find_one({"id": tid}, {"_id": 0})
            if not rv:
                raise HTTPException(404, "ไม่พบรีวิวตึก")
            snaps.append({"collection": "dorm_reviews", "query": {"id": tid}, "before": _strip_mongo_id(rv)})
            await db.dorm_reviews.delete_one({"id": tid})
            tlink = f"/dorm/buildings/{rv.get('building_slug')}" if rv.get("building_slug") else "/dorm/admin"
            act_title = f"ลบรีวิวตึก ({rv.get('building_slug') or tid})"
            res = {"deleted": True}

        elif kind == "publish_digest":
            text = str(final_payload.get("text") or "")
            res = {"text": text}

        elif kind == "mass_external_sync":
            raw_listings = final_payload.get("listings")
            if not isinstance(raw_listings, list):
                raise HTTPException(422, "payload.listings ต้องเป็น list")
            existing = await db.dorm_listings.find(
                {"external": True}, {"_id": 0, "ext_id": 1, "id": 1, "status": 1, "closed_reason": 1}
            ).to_list(10000)
            plan = plan_external_import({"listings": raw_listings}, existing, now)
            up_ids = [d["id"] for d in plan["upsert"]]
            existing_by_id = {}
            if up_ids:
                async for cur in db.dorm_listings.find({"id": {"$in": up_ids}}, {"_id": 0}):
                    existing_by_id[cur["id"]] = cur
            for doc in plan["upsert"]:
                snaps.append({"collection": "dorm_listings", "query": {"id": doc["id"]}, "before": _strip_mongo_id(existing_by_id.get(doc["id"]))})
                on_insert = {"status": "active", "featured": False, "views": 0, "contact_reveals": 0, "reports": 0, "created_at": now_s}
                if "status" in doc:
                    on_insert.pop("status", None)
                await db.dorm_listings.update_one({"ext_id": doc["ext_id"]}, {"$set": doc, "$setOnInsert": on_insert}, upsert=True)
            if plan["close"]:
                async for cur in db.dorm_listings.find({"ext_id": {"$in": plan["close"]}, "external": True}, {"_id": 0}):
                    snaps.append({"collection": "dorm_listings", "query": {"id": cur["id"]}, "before": _strip_mongo_id(cur)})
                await db.dorm_listings.update_many(
                    {"ext_id": {"$in": plan["close"]}, "external": True},
                    {"$set": {"status": "closed", "closed_reason": "missing", "closed_by": "admin", "closed_at": now_s}},
                )
            tlink = "/dorm/rooms"
            res = {"upserted": len(plan["upsert"]), "closed": len(plan["close"]), "skipped": len(plan["skipped"])}

        act = await _record_action(
            action=kind, source="proposal_confirmed",
            title=act_title, reason=body.note or prop.get("summary") or "",
            target_type=prop.get("target_type") or "listing", target_id=tid, target_link=tlink,
            affected_count=max(1, len(snaps)) if snaps else 1, actor=actor, snapshots=snaps, proposal_id=pid,
        )
        await db.dorm_admin_proposals.update_one(
            {"id": pid},
            {"$set": {
                "status": "confirmed", "decided_at": now_s, "decided_by": actor,
                "decision_note": body.note, "final_payload": final_payload, "action_id": act["id"],
            }},
        )
        return {"ok": True, "proposal_id": pid, "action_id": act["id"], "result": res}

    @dorm_router.post("/admin/proposals/{pid}/reject")
    async def reject_proposal(pid: str, body: Optional[ProposalRejectIn] = None, u=Depends(get_current_user)):
        _human_admin(u)
        await _ensure()
        prop = await db.dorm_admin_proposals.find_one({"id": pid}, {"_id": 0, "id": 1, "status": 1})
        if not prop:
            raise HTTPException(404, "ไม่พบข้อเสนอนี้")
        if prop.get("status") != "pending":
            raise HTTPException(409, f"ข้อเสนอนี้ถูกจัดการไปแล้ว ({prop.get('status')})")
        body = body or ProposalRejectIn()
        now_s = _iso(_now())
        await db.dorm_admin_proposals.update_one(
            {"id": pid},
            {"$set": {
                "status": "rejected", "decided_at": now_s,
                "decided_by": _actor_label(u), "decision_note": body.note,
            }},
        )
        return {"ok": True, "proposal_id": pid, "status": "rejected"}

    # ------------------------------------------------------------------ External Agent Brief
    @dorm_router.get("/admin/agent/brief")
    async def agent_brief(u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        now = _now()
        now_s = _iso(now)
        stale_cutoff = _iso(now - timedelta(days=7))

        ext_rows = await db.dorm_listings.find(
            {"external": True, "status": {"$ne": "closed"}},
            {"_id": 0, "id": 1, "ext_id": 1, "title": 1, "source": 1, "source_url": 1,
             "source_seen_at": 1, "maybe_gone": 1, "gone_reports": 1, "expires_at": 1, "building_slug": 1},
        ).to_list(2000)
        ext_flagged = [x for x in ext_rows if x.get("maybe_gone")]
        ext_to_check = sorted(
            ext_rows,
            key=lambda x: (not bool(x.get("maybe_gone")), x.get("source_seen_at") or "", x.get("id") or ""),
        )[:150]

        open_reports = await db.dorm_reports.find({"resolved": False}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(200)
        await _report_targets(open_reports)
        stale_reports = [r for r in open_reports if r.get("target_status") in ("closed", "deleted")]
        live_reports = [r for r in open_reports if r.get("target_status") not in ("closed", "deleted")]

        verifs = await db.dorm_verifications.find({"status": "pending"}, {"_id": 0, "otp_hash": 0}).sort("updated_at", -1).to_list(200)
        if verifs:
            uids = [v["user_id"] for v in verifs]
            umap = {x["id"]: x async for x in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})}
            for v in verifs:
                usr = umap.get(v["user_id"]) or {}
                v["user_name"] = usr.get("full_name") or ""
                v["user_email"] = usr.get("email") or ""

        low_photo_buildings = []
        async for b in db.dorm_buildings.find({}, {"_id": 0, "slug": 1, "name": 1, "zone": 1, "photos": 1}):
            pn = len(b.get("photos") or [])
            if pn < 3:
                low_photo_buildings.append({"slug": b["slug"], "name": b["name"], "zone": b.get("zone"), "photo_count": pn})

        pending_props = await list_pending_proposals(100)
        ext_stale = sum(1 for x in ext_rows if (x.get("source_seen_at") or "") < stale_cutoff[:10])

        return {
            "generated_at": now_s,
            "summary": {
                "external_open": len(ext_rows),
                "external_maybe_gone": len(ext_flagged),
                "external_stale_7d": ext_stale,
                "native_open": await db.dorm_listings.count_documents({"external": {"$ne": True}, "status": "active", "expires_at": {"$gt": now_s}}),
                "reports_open": len(open_reports),
                "stale_reports": len(stale_reports),
                "live_reports": len(live_reports),
                "pending_verifications": len(verifs),
                "pending_proposals": len(pending_props),
                "buildings_low_photos": len(low_photo_buildings),
            },
            "work_items": {
                "external_to_check": ext_to_check,
                "stale_reports": stale_reports,
                "live_reports": live_reports,
                "pending_verifications": verifs,
                "buildings_low_photos": low_photo_buildings,
                "pending_proposals": pending_props,
            },
            "capabilities": {
                "auto_actions": [
                    "close_external_gone",
                    "reopen_external",
                    "clear_false_maybe_gone",
                    "resolve_stale_report",
                    "patch_external_listing",
                    "update_building_media",
                    "refresh_external_batch",
                ],
                "proposal_kinds": [
                    "review_verification",
                    "close_native_listing",
                    "delete_listing",
                    "resolve_report",
                    "feature_listing",
                    "upsert_building",
                    "moderate_mate",
                    "moderate_review",
                    "publish_digest",
                    "mass_external_sync",
                ],
            },
        }

    # ------------------------------------------------------------------ Scoped Dorm API Keys (human admin only)
    def _is_dorm_key(doc: dict) -> bool:
        scopes = doc.get("scopes") or []
        return any(s == api_keys.DORM_WILDCARD or str(s).startswith("dorm.") for s in scopes)

    @dorm_router.get("/admin/keys")
    async def list_dorm_keys(u=Depends(get_current_user)):
        _human_admin(u)
        rows = await db[api_keys.COLLECTION].find({}, {"_id": 0, "key_hash": 0}).sort("created_at", -1).to_list(200)
        dorm_rows = [r for r in rows if _is_dorm_key(r)]
        dorm_scopes = {k: v for k, v in api_keys.SCOPES.items() if k.startswith("dorm.")}
        return {"items": dorm_rows, "scopes": dorm_scopes, "wildcard": api_keys.DORM_WILDCARD}

    @dorm_router.post("/admin/keys")
    async def create_dorm_key(body: DormKeyCreateIn, u=Depends(get_current_user)):
        _human_admin(u)
        bad = [s for s in body.scopes if s != api_keys.DORM_WILDCARD and not str(s).startswith("dorm.")]
        if bad:
            raise HTTPException(400, f"คีย์ของ /dorm ใช้ได้เฉพาะ scope dorm.* หรือ dorm.<action> (ไม่รองรับ {', '.join(bad)})")
        try:
            scopes = api_keys.normalise_scopes(body.scopes)
        except ValueError as e:
            raise HTTPException(400, str(e))
        exp = body.expires_at
        if not exp and body.expires_days:
            exp = (_now() + timedelta(days=body.expires_days)).isoformat()
        try:
            doc, plaintext = api_keys.build_key_document(body.label, scopes, _actor_label(u), exp)
        except ValueError as e:
            raise HTTPException(400, f"expires_at: {e}")
        await db[api_keys.COLLECTION].insert_one(dict(doc))
        return {
            "key": plaintext,
            "warning": "แสดงครั้งเดียวเท่านั้น กรุณาคัดลอกเก็บไว้ตอนนี้",
            **{k: v for k, v in doc.items() if k != "key_hash"},
        }

    @dorm_router.delete("/admin/keys/{key_id}")
    async def revoke_dorm_key(key_id: str, u=Depends(get_current_user)):
        _human_admin(u)
        now_s = _iso(_now())
        res = await db[api_keys.COLLECTION].update_one(
            {"id": key_id, "revoked_at": None},
            {"$set": {"revoked_at": now_s, "revoked_by": _actor_label(u)}},
        )
        if not res.matched_count:
            raise HTTPException(404, "ไม่พบคีย์นี้ หรือถูกยกเลิกไปแล้ว")
        return {"ok": True, "revoked": key_id}

    return {
        "list_pending_proposals": list_pending_proposals,
        "list_recent_actions": list_recent_actions,
    }
