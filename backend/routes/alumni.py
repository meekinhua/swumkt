"""
Alumni Network Routes — "สายตระกูล MKT SWU"
================================================
Phase 1 MVP: Landing, Onboarding, Family Tree, Profile
- Bloodline system (พี่ take → ปู่ → ทวด → เทียด)
- 2-way confirmation for relations
- Auto-derive ancestor/descendant chains via BFS
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging

alumni_router = APIRouter(prefix="/alumni", tags=["Alumni"])


# ============ ENUMS & CONSTANTS ============

ALUMNI_ROLES = ["current_student", "alumni", "staff"]
RELATION_KINDS = ["take", "mentor", "custom"]
RELATION_STATUS = ["pending", "confirmed", "rejected"]

# Relation labels by distance (upward = ancestors)
ANCESTOR_LABELS = {
    1: "พี่ take",
    2: "ปู่",
    3: "ทวด",
    4: "เทียด",
    5: "เทียดทวด",
    6: "บรรพบุรุษ",
}
DESCENDANT_LABELS = {
    1: "น้อง take",
    2: "เหลน",
    3: "ลื่อ",
    4: "ลืบ",
    5: "ลืด",
}


def ancestor_label(dist: int) -> str:
    if dist <= 0:
        return "คุณ"
    if dist in ANCESTOR_LABELS:
        return ANCESTOR_LABELS[dist]
    return f"บรรพบุรุษ {dist} ทอด"


def descendant_label(dist: int) -> str:
    if dist <= 0:
        return "คุณ"
    if dist in DESCENDANT_LABELS:
        return DESCENDANT_LABELS[dist]
    return f"ลูกหลาน {dist} ทอด"


# ============ MODELS ============

class AlumniRegisterRequest(BaseModel):
    student_id: str
    gen: int
    nickname: Optional[str] = None
    role: str = "current_student"  # current_student | alumni | staff
    major: str = "การตลาด"
    position: Optional[str] = None
    company: Optional[str] = None
    bio: Optional[str] = None
    avatar_hue: int = 210


class AlumniProfileUpdate(BaseModel):
    nickname: Optional[str] = None
    gen: Optional[int] = None
    role: Optional[str] = None
    major: Optional[str] = None
    position: Optional[str] = None
    company: Optional[str] = None
    bio: Optional[str] = None
    avatar_hue: Optional[int] = None
    privacy_settings: Optional[Dict[str, bool]] = None


class MarkRelationRequest(BaseModel):
    to_user_id: str
    kind: str = "take"  # take | mentor | custom


class ConfirmRelationRequest(BaseModel):
    accept: bool = True


class InviteRequest(BaseModel):
    invitee_email: Optional[EmailStr] = None
    invitee_student_id: Optional[str] = None
    invitee_name: Optional[str] = None
    relation_hint: Optional[str] = None  # "น้อง take" / "พี่ take" etc.


def _default_privacy() -> Dict[str, bool]:
    return {
        "show_in_feed": True,
        "show_company_to_juniors": True,
        "allow_mystery_match": True,
        "allow_message_requests": True,
        "mask_student_id": True,
    }


def get_alumni_routes(db, get_current_user, get_optional_user, UserRole):
    """Factory function to create alumni routes with DB dependency."""

    # ============ HELPERS ============

    async def _get_alumni_profile(user_id: str) -> Optional[dict]:
        return await db.alumni_users.find_one({"user_id": user_id}, {"_id": 0})

    async def _get_user_info(user_id: str) -> Optional[dict]:
        return await db.users.find_one(
            {"id": user_id},
            {"_id": 0, "id": 1, "full_name": 1, "email": 1, "student_id": 1, "profile_image": 1},
        )

    async def _enrich_alumni(alum: dict) -> dict:
        """Attach user info (full_name, email) to alumni record."""
        if not alum:
            return alum
        user = await _get_user_info(alum["user_id"])
        if user:
            alum["name"] = user.get("full_name") or alum.get("nickname") or ""
            alum["email"] = user.get("email")
            if not alum.get("avatar_url"):
                alum["avatar_url"] = user.get("profile_image")
        return alum

    async def _confirmed_parents(user_id: str) -> List[dict]:
        """Get confirmed "พี่ take" parents (outgoing take relations)."""
        cur = db.alumni_relations.find({
            "from_user_id": user_id,
            "kind": "take",
            "status": "confirmed",
        }, {"_id": 0})
        return await cur.to_list(100)

    async def _confirmed_children(user_id: str) -> List[dict]:
        """Get users who set this user as their พี่ take."""
        cur = db.alumni_relations.find({
            "to_user_id": user_id,
            "kind": "take",
            "status": "confirmed",
        }, {"_id": 0})
        return await cur.to_list(500)

    async def _bfs_ancestors(root_user_id: str, max_depth: int = 8) -> List[dict]:
        """BFS upward — build ancestor chain (no duplicates). Returns list sorted by distance."""
        visited = {root_user_id}
        result = []
        # frontier: list of (user_id, distance)
        frontier = [(root_user_id, 0)]
        while frontier:
            nxt = []
            for uid, dist in frontier:
                if dist >= max_depth:
                    continue
                parents = await _confirmed_parents(uid)
                for rel in parents:
                    pid = rel["to_user_id"]
                    if pid in visited:
                        continue
                    visited.add(pid)
                    result.append({"user_id": pid, "distance": dist + 1})
                    nxt.append((pid, dist + 1))
            frontier = nxt
        return result

    async def _bfs_descendants(root_user_id: str, max_depth: int = 8) -> List[dict]:
        """BFS downward — build descendant chain."""
        visited = {root_user_id}
        result = []
        frontier = [(root_user_id, 0)]
        while frontier:
            nxt = []
            for uid, dist in frontier:
                if dist >= max_depth:
                    continue
                children = await _confirmed_children(uid)
                for rel in children:
                    cid = rel["from_user_id"]
                    if cid in visited:
                        continue
                    visited.add(cid)
                    result.append({"user_id": cid, "distance": dist + 1})
                    nxt.append((cid, dist + 1))
            frontier = nxt
        return result

    async def _build_tree_node(user_id: str, distance: int, direction: str) -> dict:
        """Build a display-ready tree node."""
        alum = await _get_alumni_profile(user_id)
        user = await _get_user_info(user_id)
        if not alum and not user:
            return None
        alum = alum or {}
        label = ancestor_label(distance) if direction == "up" else descendant_label(distance)
        return {
            "user_id": user_id,
            "name": (user or {}).get("full_name") or alum.get("nickname") or "",
            "nickname": alum.get("nickname"),
            "student_id": alum.get("student_id"),
            "gen": alum.get("gen"),
            "role": alum.get("role"),
            "position": alum.get("position"),
            "company": alum.get("company"),
            "avatar_hue": alum.get("avatar_hue", 210),
            "avatar_url": (user or {}).get("profile_image"),
            "verified": alum.get("verified", False),
            "distance": distance,
            "relation": label,
            "direction": direction,
        }

    # ============ PUBLIC STATS ============

    @alumni_router.get("/stats")
    async def get_public_stats():
        """Public stats for landing page (no auth required)."""
        total_users = await db.alumni_users.count_documents({})
        alumni_count = await db.alumni_users.count_documents({"role": "alumni"})
        current_count = await db.alumni_users.count_documents({"role": "current_student"})

        # Unique companies
        companies_pipeline = [
            {"$match": {"company": {"$nin": [None, ""]}}},
            {"$group": {"_id": "$company"}},
            {"$count": "count"},
        ]
        companies_result = await db.alumni_users.aggregate(companies_pipeline).to_list(1)
        companies_count = companies_result[0]["count"] if companies_result else 0

        # Total confirmed connections
        connections_count = await db.alumni_relations.count_documents({"status": "confirmed"})

        # Jobs referred (placeholder — phase 2)
        jobs_referred = 0

        # New today
        from datetime import timedelta
        today_start = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        new_today = await db.alumni_users.count_documents({"created_at": {"$gte": today_start}})

        return {
            "alumni": total_users,
            "alumni_only": alumni_count,
            "current": current_count,
            "companies": companies_count,
            "connections": connections_count,
            "jobs_referred": jobs_referred,
            "new_today": new_today,
        }

    # ============ REGISTER / ME / PROFILE ============

    @alumni_router.post("/register")
    async def register_alumni(data: AlumniRegisterRequest, current_user=Depends(get_current_user)):
        """Create alumni profile linked to existing auth user."""
        existing = await db.alumni_users.find_one({"user_id": current_user.id})
        if existing:
            raise HTTPException(status_code=400, detail="Alumni profile already exists")

        # Uniqueness on student_id
        dup = await db.alumni_users.find_one({"student_id": data.student_id})
        if dup:
            raise HTTPException(status_code=400, detail="รหัสนิสิตนี้ถูกใช้แล้ว")

        if data.role not in ALUMNI_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")

        now = datetime.now(timezone.utc).isoformat()
        profile = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "student_id": data.student_id,
            "nickname": data.nickname or current_user.full_name.split()[0],
            "gen": data.gen,
            "role": data.role,
            "major": data.major,
            "position": data.position,
            "company": data.company,
            "bio": data.bio,
            "avatar_hue": data.avatar_hue,
            "verified": False,
            "xp": 0,
            "streak_days": 0,
            "invite_count": 0,
            "badges": [],
            "privacy_settings": _default_privacy(),
            "last_active_at": now,
            "created_at": now,
            "updated_at": now,
        }
        await db.alumni_users.insert_one(profile)
        logging.info(f"[ALUMNI] Registered: {current_user.email} gen={data.gen}")
        return await _enrich_alumni(await _get_alumni_profile(current_user.id))

    @alumni_router.get("/me")
    async def get_my_profile(current_user=Depends(get_current_user)):
        """Get my alumni profile (null if not registered)."""
        alum = await _get_alumni_profile(current_user.id)
        if not alum:
            return {"registered": False, "profile": None}
        return {"registered": True, "profile": await _enrich_alumni(alum)}

    @alumni_router.put("/me")
    async def update_my_profile(data: AlumniProfileUpdate, current_user=Depends(get_current_user)):
        """Update my alumni profile."""
        alum = await _get_alumni_profile(current_user.id)
        if not alum:
            raise HTTPException(status_code=404, detail="Alumni profile not found. Register first.")

        update = {k: v for k, v in data.model_dump().items() if v is not None}
        if "role" in update and update["role"] not in ALUMNI_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        update["updated_at"] = datetime.now(timezone.utc).isoformat()

        await db.alumni_users.update_one({"user_id": current_user.id}, {"$set": update})
        return await _enrich_alumni(await _get_alumni_profile(current_user.id))

    @alumni_router.get("/profile/{user_id}")
    async def get_alumni_profile(user_id: str, current_user=Depends(get_current_user)):
        """Get another user's alumni profile."""
        alum = await _get_alumni_profile(user_id)
        if not alum:
            raise HTTPException(status_code=404, detail="Profile not found")
        return await _enrich_alumni(alum)

    # ============ SEARCH ============

    @alumni_router.get("/search")
    async def search_alumni(
        q: str = Query("", description="Search term — name, nickname, student_id"),
        gen: Optional[int] = None,
        limit: int = 20,
        current_user=Depends(get_current_user),
    ):
        """Search alumni by name/studentId/gen."""
        # Build MongoDB query
        query: Dict[str, Any] = {}
        if gen is not None:
            query["gen"] = gen

        results = []
        if q:
            # Search in alumni_users by nickname/student_id
            direct_q = {**query, "$or": [
                {"nickname": {"$regex": q, "$options": "i"}},
                {"student_id": {"$regex": q, "$options": "i"}},
            ]}
            cur = db.alumni_users.find(direct_q, {"_id": 0}).limit(limit)
            results = await cur.to_list(limit)

            # Also search by users.full_name — find matching user IDs
            users = await db.users.find(
                {"full_name": {"$regex": q, "$options": "i"}},
                {"_id": 0, "id": 1},
            ).limit(limit).to_list(limit)
            user_ids = [u["id"] for u in users]
            if user_ids:
                existing_user_ids = [r["user_id"] for r in results]
                extra_query = {**query, "user_id": {"$in": user_ids, "$nin": existing_user_ids}}
                cur2 = db.alumni_users.find(extra_query, {"_id": 0}).limit(limit)
                extra = await cur2.to_list(limit)
                # Filter dup
                seen = {r["user_id"] for r in results}
                for e in extra:
                    if e["user_id"] not in seen:
                        results.append(e)
        else:
            cur = db.alumni_users.find(query, {"_id": 0}).limit(limit)
            results = await cur.to_list(limit)

        # Enrich
        enriched = []
        for r in results[:limit]:
            enriched.append(await _enrich_alumni(r))
        return {"results": enriched, "total": len(enriched)}

    # ============ FAMILY TREE ============

    @alumni_router.get("/tree/me")
    async def my_tree(current_user=Depends(get_current_user)):
        return await _tree_for(current_user.id)

    @alumni_router.get("/tree/{user_id}")
    async def user_tree(user_id: str, current_user=Depends(get_current_user)):
        return await _tree_for(user_id)

    async def _tree_for(root_user_id: str):
        root_alum = await _get_alumni_profile(root_user_id)
        if not root_alum:
            raise HTTPException(status_code=404, detail="Profile not found")
        root_node = await _build_tree_node(root_user_id, 0, "self")
        if root_node:
            root_node["relation"] = "คุณ"

        ancestors_raw = await _bfs_ancestors(root_user_id)
        descendants_raw = await _bfs_descendants(root_user_id)

        ancestors = []
        for a in ancestors_raw:
            node = await _build_tree_node(a["user_id"], a["distance"], "up")
            if node:
                ancestors.append(node)
        ancestors.sort(key=lambda x: x["distance"])

        descendants = []
        for d in descendants_raw:
            node = await _build_tree_node(d["user_id"], d["distance"], "down")
            if node:
                descendants.append(node)
        descendants.sort(key=lambda x: x["distance"])

        return {
            "root": root_node,
            "ancestors": ancestors,
            "descendants": descendants,
            "total": 1 + len(ancestors) + len(descendants),
            "max_ancestor_gen": min([a.get("gen") for a in ancestors if a.get("gen")] or [None]) if ancestors else None,
        }

    # ============ RELATIONS (Mark / Confirm) ============

    @alumni_router.post("/relations")
    async def mark_relation(data: MarkRelationRequest, current_user=Depends(get_current_user)):
        """Mark someone as พี่ take / mentor / custom — creates PENDING relation.

        Rule: 'take' semantics => from_user (me) is taking to_user as พี่ take
        (so to_user is the ancestor).
        """
        if data.kind not in RELATION_KINDS:
            raise HTTPException(status_code=400, detail="Invalid relation kind")
        if data.to_user_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot mark yourself")

        # Ensure both have alumni profile
        me_alum = await _get_alumni_profile(current_user.id)
        other_alum = await _get_alumni_profile(data.to_user_id)
        if not me_alum or not other_alum:
            raise HTTPException(status_code=400, detail="Both users must have an alumni profile")

        # Check duplicate
        existing = await db.alumni_relations.find_one({
            "from_user_id": current_user.id,
            "to_user_id": data.to_user_id,
            "kind": data.kind,
        })
        if existing:
            raise HTTPException(status_code=400, detail="Relation already exists")

        now = datetime.now(timezone.utc).isoformat()
        relation = {
            "id": str(uuid.uuid4()),
            "from_user_id": current_user.id,
            "to_user_id": data.to_user_id,
            "kind": data.kind,
            "status": "pending",
            "confirmed_by_from": True,  # The marker auto-confirms from their side
            "confirmed_by_to": False,
            "derived": False,
            "primary": True,
            "created_by": current_user.id,
            "created_at": now,
            "confirmed_at": None,
        }
        await db.alumni_relations.insert_one(relation)
        return {k: v for k, v in relation.items() if k != "_id"}

    @alumni_router.put("/relations/{relation_id}/confirm")
    async def confirm_relation(
        relation_id: str, data: ConfirmRelationRequest, current_user=Depends(get_current_user)
    ):
        """Confirm/reject a pending relation. Only the 'to_user' can confirm."""
        rel = await db.alumni_relations.find_one({"id": relation_id}, {"_id": 0})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        if rel["to_user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Only the addressee can confirm")
        if rel["status"] != "pending":
            raise HTTPException(status_code=400, detail="Relation already processed")

        now = datetime.now(timezone.utc).isoformat()
        update = {
            "confirmed_by_to": data.accept,
            "status": "confirmed" if data.accept else "rejected",
            "confirmed_at": now if data.accept else None,
        }
        await db.alumni_relations.update_one({"id": relation_id}, {"$set": update})
        updated = await db.alumni_relations.find_one({"id": relation_id}, {"_id": 0})
        return updated

    @alumni_router.get("/relations/pending")
    async def list_pending_relations(current_user=Depends(get_current_user)):
        """Pending relations awaiting my confirmation (incoming)."""
        cur = db.alumni_relations.find({
            "to_user_id": current_user.id,
            "status": "pending",
        }, {"_id": 0})
        items = await cur.to_list(100)
        # Enrich with from_user info
        for r in items:
            from_alum = await _get_alumni_profile(r["from_user_id"])
            if from_alum:
                r["from_profile"] = await _enrich_alumni(from_alum)
        return {"pending": items, "total": len(items)}

    @alumni_router.get("/relations/mine")
    async def list_my_relations(current_user=Depends(get_current_user)):
        """All my outgoing + incoming confirmed relations."""
        cur = db.alumni_relations.find({
            "$or": [
                {"from_user_id": current_user.id},
                {"to_user_id": current_user.id},
            ],
        }, {"_id": 0})
        return {"relations": await cur.to_list(500)}

    @alumni_router.delete("/relations/{relation_id}")
    async def delete_relation(relation_id: str, current_user=Depends(get_current_user)):
        rel = await db.alumni_relations.find_one({"id": relation_id})
        if not rel:
            raise HTTPException(status_code=404, detail="Relation not found")
        if rel["from_user_id"] != current_user.id and rel["to_user_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot delete others' relations")
        await db.alumni_relations.delete_one({"id": relation_id})
        return {"message": "Relation deleted"}

    # ============ INVITES ============

    @alumni_router.post("/invites")
    async def send_invite(data: InviteRequest, current_user=Depends(get_current_user)):
        """Send an invite to an email/studentId. Creates a record for later verification."""
        if not data.invitee_email and not data.invitee_student_id and not data.invitee_name:
            raise HTTPException(status_code=400, detail="Need at least one identifier")

        code = uuid.uuid4().hex[:10]
        now = datetime.now(timezone.utc).isoformat()
        invite = {
            "id": str(uuid.uuid4()),
            "inviter_id": current_user.id,
            "invitee_email": data.invitee_email,
            "invitee_student_id": data.invitee_student_id,
            "invitee_name": data.invitee_name,
            "code": code,
            "status": "sent",
            "relation_hint": data.relation_hint,
            "sent_at": now,
            "accepted_at": None,
        }
        await db.alumni_invites.insert_one(invite)

        # Increment inviter counter
        await db.alumni_users.update_one(
            {"user_id": current_user.id},
            {"$inc": {"invite_count": 1}},
        )

        return {k: v for k, v in invite.items() if k != "_id"}

    @alumni_router.get("/invites")
    async def list_my_invites(current_user=Depends(get_current_user)):
        cur = db.alumni_invites.find({"inviter_id": current_user.id}, {"_id": 0}).sort("sent_at", -1)
        items = await cur.to_list(200)
        return {"invites": items, "total": len(items)}

    # ============ ACTIVITY FEED (Basic) ============

    @alumni_router.get("/activity/me")
    async def my_activity(current_user=Depends(get_current_user)):
        """Recent personal activity — last relations & invites."""
        rel_cur = db.alumni_relations.find({
            "$or": [{"from_user_id": current_user.id}, {"to_user_id": current_user.id}],
        }, {"_id": 0}).sort("created_at", -1).limit(10)
        relations = await rel_cur.to_list(10)

        inv_cur = db.alumni_invites.find({"inviter_id": current_user.id}, {"_id": 0}).sort("sent_at", -1).limit(10)
        invites = await inv_cur.to_list(10)

        return {"relations": relations, "invites": invites}

    return alumni_router
