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


class PrivacyUpdate(BaseModel):
    show_in_feed: Optional[bool] = None
    show_company_to_juniors: Optional[bool] = None
    allow_mystery_match: Optional[bool] = None
    allow_message_requests: Optional[bool] = None
    mask_student_id: Optional[bool] = None


class TriviaAnswer(BaseModel):
    question_id: str
    answer_index: int  # 0-3


# ==== XP / BADGE ENGINE ====
XP_EVENTS = {
    "login_daily": 5,
    "upload_avatar": 20,
    "mark_relation": 10,
    "relation_confirmed": 30,
    "invite_sent": 5,
    "invite_accepted": 100,
    "trivia_correct": 10,
    "streak_milestone_3": 20,
    "streak_milestone_7": 50,
    "streak_milestone_14": 100,
    "streak_milestone_30": 300,
}

BADGE_RULES = [
    # key, name, emoji, check(profile, stats) -> bool
    ("tree_builder", "ผู้ก่อร่าง", "🌳", lambda p, s: s.get("invite_accepted", 0) >= 5),
    ("king", "นายก๊ก", "👑", lambda p, s: s.get("invite_accepted", 0) >= 10),
    ("5_tier_club", "5 ทอดคลับ", "🔗", lambda p, s: s.get("max_ancestor_depth", 0) >= 5),
    ("connector", "Connector", "🤝", lambda p, s: s.get("confirmed_relations", 0) >= 10),
    ("reviewer", "นักรีวิว", "⭐", lambda p, s: s.get("reviews_written", 0) >= 3),
    ("iq_master", "IQ Master", "🧠", lambda p, s: s.get("trivia_streak", 0) >= 7),
    ("streak_7", "ไฟลุก 7 วัน", "🔥", lambda p, s: p.get("streak_days", 0) >= 7),
    ("streak_30", "ตำนานตระกูล", "🏆", lambda p, s: p.get("streak_days", 0) >= 30),
]


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
            {"_id": 0, "id": 1, "full_name": 1, "email": 1, "student_id": 1,
             "profile_image": 1, "avatar_url": 1, "google_picture": 1},
        )

    async def _enrich_alumni(alum: dict) -> dict:
        """Attach user info (full_name, email, avatar) to alumni record."""
        if not alum:
            return alum
        user = await _get_user_info(alum["user_id"])
        if user:
            alum["name"] = user.get("full_name") or alum.get("nickname") or ""
            alum["email"] = user.get("email")
            # Prefer uploaded avatar_url, else Google picture, else profile_image
            alum["avatar_url"] = (
                user.get("avatar_url")
                or user.get("google_picture")
                or user.get("profile_image")
            )
        return alum

    # ============ XP / BADGE / STREAK / NOTIFICATION ENGINE ============

    def _level_from_xp(xp: int) -> int:
        """Return level 1-15 based on XP thresholds."""
        thresholds = [0, 100, 300, 600, 1000, 1500, 2500, 4000, 6000, 9000, 13000, 18000, 25000, 35000, 50000]
        for i, t in enumerate(reversed(thresholds)):
            if xp >= t:
                return len(thresholds) - i
        return 1

    async def _push_notification(user_id: str, kind: str, title: str, body: str = "", meta: dict = None):
        """Insert a notification."""
        doc = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "kind": kind,
            "title": title,
            "body": body,
            "meta": meta or {},
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.alumni_notifications.insert_one(doc)
        return doc

    async def _log_activity(actor_id: str, kind: str, summary: str,
                            target_id: Optional[str] = None, meta: Optional[dict] = None):
        """Log an activity event for tree-stream consumption.

        Activity kinds: joined_family | position_changed | company_changed |
        post_created | job_posted | review_given | tree_extended | level_up | badge_earned
        """
        doc = {
            "id": str(uuid.uuid4()),
            "actor_id": actor_id,
            "kind": kind,
            "summary": summary,
            "target_id": target_id,
            "meta": meta or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.alumni_activities.insert_one(doc)
        return doc

    async def _compute_user_stats(user_id: str) -> dict:
        """Compute stats for badge unlock checks."""
        invite_accepted = await db.alumni_invites.count_documents({
            "inviter_id": user_id, "status": "registered",
        })
        confirmed = await db.alumni_relations.count_documents({
            "$or": [{"from_user_id": user_id}, {"to_user_id": user_id}],
            "status": "confirmed",
        })
        # Max ancestor depth via simple BFS
        max_depth = 0
        frontier = [(user_id, 0)]
        visited = {user_id}
        while frontier:
            nxt = []
            for uid, d in frontier:
                parents = await _confirmed_parents(uid)
                for rel in parents:
                    pid = rel["to_user_id"]
                    if pid in visited:
                        continue
                    visited.add(pid)
                    max_depth = max(max_depth, d + 1)
                    if d + 1 < 8:
                        nxt.append((pid, d + 1))
            frontier = nxt

        trivia_stats = await db.alumni_users.find_one({"user_id": user_id}, {"_id": 0, "trivia_streak": 1, "reviews_written": 1}) or {}
        return {
            "invite_accepted": invite_accepted,
            "confirmed_relations": confirmed,
            "max_ancestor_depth": max_depth,
            "trivia_streak": trivia_stats.get("trivia_streak", 0),
            "reviews_written": trivia_stats.get("reviews_written", 0),
        }

    async def _award_xp(user_id: str, event_key: str, custom_amount: Optional[int] = None):
        """Award XP + check level up + check badge unlocks. Creates notification for big events."""
        amount = custom_amount if custom_amount is not None else XP_EVENTS.get(event_key, 0)
        if amount <= 0:
            return
        profile = await db.alumni_users.find_one({"user_id": user_id}, {"_id": 0})
        if not profile:
            return
        old_xp = profile.get("xp", 0)
        old_level = _level_from_xp(old_xp)
        new_xp = old_xp + amount
        new_level = _level_from_xp(new_xp)
        update = {"xp": new_xp}

        # Check badge unlocks
        stats = await _compute_user_stats(user_id)
        earned_now = set(profile.get("badges", []))
        newly_earned = []
        for key, name, emoji, rule in BADGE_RULES:
            if key in earned_now:
                continue
            try:
                if rule(profile, stats):
                    earned_now.add(key)
                    newly_earned.append((key, name, emoji))
            except Exception:
                pass
        if newly_earned:
            update["badges"] = list(earned_now)

        await db.alumni_users.update_one({"user_id": user_id}, {"$set": update})

        # Level-up notification
        if new_level > old_level:
            await _push_notification(user_id, "level_up",
                f"🎉 เลเวลอัพ! Lv.{new_level}",
                f"คุณได้ +{amount} XP และขึ้น Lv.{new_level} แล้ว",
                {"old_level": old_level, "new_level": new_level})
            actor_nick = profile.get("nickname") or "บางคน"
            await _log_activity(
                user_id, "level_up",
                f"{actor_nick} เลเวลอัพเป็น Lv.{new_level}",
                meta={"old_level": old_level, "new_level": new_level},
            )
        # Badge-earned notifications
        for key, name, emoji in newly_earned:
            await _push_notification(user_id, "badge",
                f"{emoji} ปลดล็อค Badge ใหม่!",
                f"คุณได้ Badge \"{name}\" แล้ว",
                {"badge_key": key})
            actor_nick = profile.get("nickname") or "บางคน"
            await _log_activity(
                user_id, "badge_earned",
                f"{actor_nick} ได้ Badge {emoji} \"{name}\"",
                meta={"badge_key": key, "badge_name": name, "badge_emoji": emoji},
            )

    async def _touch_streak(user_id: str):
        """Update streak_days based on last_active_at. Awards milestone XP."""
        profile = await db.alumni_users.find_one({"user_id": user_id}, {"_id": 0})
        if not profile:
            return
        now = datetime.now(timezone.utc)
        last_active_str = profile.get("last_active_at")
        streak = profile.get("streak_days", 0)

        if last_active_str:
            try:
                last_active = datetime.fromisoformat(last_active_str.replace("Z", "+00:00"))
                delta_days = (now.date() - last_active.date()).days
                if delta_days == 0:
                    return  # Already touched today
                elif delta_days == 1:
                    streak += 1
                else:
                    streak = 1  # Reset
            except Exception:
                streak = 1
        else:
            streak = 1

        await db.alumni_users.update_one(
            {"user_id": user_id},
            {"$set": {"streak_days": streak, "last_active_at": now.isoformat()}},
        )

        # Milestone rewards
        if streak in (3, 7, 14, 30):
            await _award_xp(user_id, f"streak_milestone_{streak}")
            await _push_notification(user_id, "streak",
                f"🔥 Streak {streak} วันแล้ว!",
                f"active ต่อเนื่อง {streak} วัน · รับโบนัสไปเลย")

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
        u = user or {}
        avatar = u.get("avatar_url") or u.get("google_picture") or u.get("profile_image")
        return {
            "user_id": user_id,
            "name": u.get("full_name") or alum.get("nickname") or "",
            "nickname": alum.get("nickname"),
            "student_id": alum.get("student_id"),
            "gen": alum.get("gen"),
            "role": alum.get("role"),
            "position": alum.get("position"),
            "company": alum.get("company"),
            "avatar_hue": alum.get("avatar_hue", 210),
            "avatar_url": avatar,
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
        default_nick = data.nickname
        if not default_nick:
            full_name = (current_user.full_name or "").strip()
            default_nick = full_name.split()[0] if full_name else current_user.email.split("@")[0]
        profile = {
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "student_id": data.student_id,
            "nickname": default_nick,
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
        await _touch_streak(current_user.id)
        await _log_activity(
            current_user.id, "joined_family",
            f"{default_nick} (รุ่น {data.gen}) เข้ามาในตระกูล",
            meta={"gen": data.gen, "nickname": default_nick},
        )

        # If registered via invite code (stored in session/later), mark invite + auto-relation
        # (handled separately via /invites/accept endpoint)

        return await _enrich_alumni(await _get_alumni_profile(current_user.id))

    @alumni_router.get("/me")
    async def get_my_profile(current_user=Depends(get_current_user)):
        """Get my alumni profile (null if not registered). Also touches streak."""
        alum = await _get_alumni_profile(current_user.id)
        if not alum:
            return {"registered": False, "profile": None}
        await _touch_streak(current_user.id)
        alum = await _get_alumni_profile(current_user.id)  # reload after touch
        enriched = await _enrich_alumni(alum)
        enriched["level"] = _level_from_xp(enriched.get("xp", 0))
        return {"registered": True, "profile": enriched}

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

        # Log activity for meaningful changes
        nick = alum.get("nickname") or "บางคน"
        if "position" in update and update["position"] and update["position"] != alum.get("position"):
            await _log_activity(
                current_user.id, "position_changed",
                f"{nick} เปลี่ยนตำแหน่งเป็น \"{update['position']}\"",
                meta={"old": alum.get("position"), "new": update["position"]},
            )
        if "company" in update and update["company"] and update["company"] != alum.get("company"):
            await _log_activity(
                current_user.id, "company_changed",
                f"{nick} ย้ายไปทำงานที่ {update['company']}",
                meta={"old": alum.get("company"), "new": update["company"]},
            )

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

        # Award small XP + notify the target
        await _award_xp(current_user.id, "mark_relation")
        me_name = (current_user.full_name or "").strip() or (current_user.email.split("@")[0])
        await _push_notification(
            data.to_user_id, "mark_request",
            "🤝 มีคนขอให้คุณเป็นพี่ในสายของเขา",
            f"{me_name} ขอ mark คุณเป็น \"พี่ take\" · เข้าไปยืนยันได้",
            {"relation_id": relation["id"], "from_user_id": current_user.id},
        )

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

        if data.accept:
            # Both parties earn XP when confirmed
            await _award_xp(rel["from_user_id"], "relation_confirmed")
            await _award_xp(rel["to_user_id"], "relation_confirmed")
            # Notify the marker
            me_name = (current_user.full_name or "").strip() or current_user.email.split("@")[0]
            await _push_notification(
                rel["from_user_id"], "relation_confirmed",
                "✅ ได้รับการยืนยันแล้ว",
                f"{me_name} ยืนยันเป็นพี่ take ในสายตระกูลของคุณ",
                {"relation_id": relation_id, "to_user_id": rel["to_user_id"]},
            )
            # Log tree_extended activity
            from_alum = await _get_alumni_profile(rel["from_user_id"])
            to_alum = await _get_alumni_profile(rel["to_user_id"])
            from_nick = (from_alum or {}).get("nickname") or "บางคน"
            to_nick = (to_alum or {}).get("nickname") or "บางคน"
            await _log_activity(
                rel["from_user_id"], "tree_extended",
                f"{from_nick} เพิ่ม {to_nick} เป็นพี่ take ในสาย",
                target_id=rel["to_user_id"],
                meta={"relation_id": relation_id},
            )

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

    # ============ INVITES (Viral Loop) ============

    def _build_invite_url(code: str) -> str:
        """Build shareable invite URL. Relies on frontend route /alumni/invite/{code}."""
        return f"/alumni/invite/{code}"

    @alumni_router.post("/invites")
    async def send_invite(data: InviteRequest, current_user=Depends(get_current_user)):
        """Create an invite with unique short code. Returns shareable URL."""
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
            "relation_hint": data.relation_hint or "น้อง take",
            "share_url": _build_invite_url(code),
            "sent_at": now,
            "accepted_at": None,
        }
        await db.alumni_invites.insert_one(invite)

        # Counter + small XP
        await db.alumni_users.update_one(
            {"user_id": current_user.id},
            {"$inc": {"invite_count": 1}},
        )
        await _award_xp(current_user.id, "invite_sent")

        return {k: v for k, v in invite.items() if k != "_id"}

    @alumni_router.get("/invites")
    async def list_my_invites(current_user=Depends(get_current_user)):
        cur = db.alumni_invites.find({"inviter_id": current_user.id}, {"_id": 0}).sort("sent_at", -1)
        items = await cur.to_list(200)
        return {"invites": items, "total": len(items)}

    @alumni_router.get("/invites/preview/{code}")
    async def preview_invite(code: str):
        """Public — used on /alumni/invite/{code} landing page to show who's inviting."""
        invite = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        if not invite:
            raise HTTPException(status_code=404, detail="Invite code not found or expired")
        if invite.get("status") == "expired":
            raise HTTPException(status_code=410, detail="Invite expired")
        # Mark as opened
        if invite.get("status") == "sent":
            await db.alumni_invites.update_one(
                {"code": code}, {"$set": {"status": "opened", "opened_at": datetime.now(timezone.utc).isoformat()}},
            )
        inviter_alum = await _get_alumni_profile(invite["inviter_id"])
        inviter = await _enrich_alumni(inviter_alum) if inviter_alum else None
        return {
            "code": code,
            "inviter": inviter,
            "relation_hint": invite.get("relation_hint"),
            "status": invite.get("status"),
        }

    @alumni_router.post("/invites/accept/{code}")
    async def accept_invite(code: str, current_user=Depends(get_current_user)):
        """Called after registration — links invite to the new alumni profile and auto-creates pending mark."""
        invite = await db.alumni_invites.find_one({"code": code}, {"_id": 0})
        if not invite:
            raise HTTPException(status_code=404, detail="Invite not found")
        if invite.get("status") == "registered":
            return {"message": "Already accepted", "invite": invite}

        inviter_id = invite["inviter_id"]
        if inviter_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot accept your own invite")

        # Both must have alumni profiles
        me_alum = await _get_alumni_profile(current_user.id)
        if not me_alum:
            raise HTTPException(status_code=400, detail="Register alumni profile first")

        # Auto-create pending relation (me → inviter as พี่ take) — inviter still confirms
        now = datetime.now(timezone.utc).isoformat()
        existing = await db.alumni_relations.find_one({
            "from_user_id": current_user.id, "to_user_id": inviter_id, "kind": "take",
        })
        if not existing:
            relation = {
                "id": str(uuid.uuid4()),
                "from_user_id": current_user.id,
                "to_user_id": inviter_id,
                "kind": "take",
                "status": "pending",
                "confirmed_by_from": True,
                "confirmed_by_to": False,
                "derived": False,
                "primary": True,
                "created_by": current_user.id,
                "created_at": now,
                "confirmed_at": None,
            }
            await db.alumni_relations.insert_one(relation)

        # Update invite status + reward inviter
        await db.alumni_invites.update_one(
            {"code": code},
            {"$set": {"status": "registered", "accepted_at": now, "accepted_by_user_id": current_user.id}},
        )
        await _award_xp(inviter_id, "invite_accepted")
        inviter_alum = await _get_alumni_profile(inviter_id)
        inviter_name = (inviter_alum or {}).get("nickname") or "พี่"
        me_name = (current_user.full_name or "").strip() or current_user.email.split("@")[0]
        await _push_notification(
            inviter_id, "invite_accepted",
            "🎉 มีคนเข้ามาผ่าน invite ของคุณแล้ว!",
            f"{me_name} สมัครผ่านลิงก์ของคุณ · เข้าไปยืนยันเป็นน้อง take",
            {"invitee_user_id": current_user.id, "code": code},
        )
        await _push_notification(
            current_user.id, "welcome",
            f"👋 ยินดีต้อนรับสู่สายของ {inviter_name}",
            "คุณถูกเพิ่มเข้าสายตระกูลโดยอัตโนมัติ — {inviter_name} ต้องยืนยันก่อน",
        )

        return {"message": "Invite accepted", "inviter_id": inviter_id, "relation_pending": True}

    # ============ ACTIVITY STREAM ============

    @alumni_router.get("/activity/stream")
    async def activity_stream(
        scope: str = "tree",  # tree | global | self
        limit: int = 30,
        current_user=Depends(get_current_user),
    ):
        """Recent activity events from your tree members (or global/self).

        scope='tree' → events from ancestors+descendants (BFS up to 8 levels)
        scope='global' → all events
        scope='self' → own events only
        """
        actor_ids = None
        if scope == "self":
            actor_ids = [current_user.id]
        elif scope == "tree":
            ancestors = await _bfs_ancestors(current_user.id, max_depth=8)
            descendants = await _bfs_descendants(current_user.id, max_depth=8)
            actor_ids = [a["user_id"] for a in ancestors + descendants]
            actor_ids.append(current_user.id)
            # Also include direct relations (siblings of same gen who marked me/i marked them)
            rel_cur = db.alumni_relations.find({
                "$or": [{"from_user_id": current_user.id}, {"to_user_id": current_user.id}],
                "status": "confirmed",
            }, {"_id": 0, "from_user_id": 1, "to_user_id": 1})
            rels = await rel_cur.to_list(500)
            for r in rels:
                actor_ids.append(r["from_user_id"])
                actor_ids.append(r["to_user_id"])
            actor_ids = list(set(actor_ids))

        query = {}
        if actor_ids is not None:
            query["actor_id"] = {"$in": actor_ids}

        cur = db.alumni_activities.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
        items = await cur.to_list(limit)

        # Enrich with actor profile (cache in this call)
        actor_cache: Dict[str, Any] = {}
        for it in items:
            aid = it["actor_id"]
            if aid not in actor_cache:
                a = await _get_alumni_profile(aid)
                actor_cache[aid] = await _enrich_alumni(a) if a else None
            it["actor"] = actor_cache[aid]

        return {"items": items, "total": len(items), "scope": scope}

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

    # ============ PRIVACY ============

    @alumni_router.put("/privacy")
    async def update_privacy(data: PrivacyUpdate, current_user=Depends(get_current_user)):
        """Update privacy toggles."""
        profile = await _get_alumni_profile(current_user.id)
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        current = profile.get("privacy_settings") or _default_privacy()
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        current.update(updates)
        await db.alumni_users.update_one(
            {"user_id": current_user.id},
            {"$set": {"privacy_settings": current, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        return {"privacy_settings": current}

    # ============ NOTIFICATIONS ============

    @alumni_router.get("/notifications")
    async def list_notifications(current_user=Depends(get_current_user), limit: int = 20):
        cur = db.alumni_notifications.find(
            {"user_id": current_user.id}, {"_id": 0}
        ).sort("created_at", -1).limit(limit)
        items = await cur.to_list(limit)
        unread = await db.alumni_notifications.count_documents(
            {"user_id": current_user.id, "read": False}
        )
        return {"notifications": items, "unread": unread}

    @alumni_router.put("/notifications/{notif_id}/read")
    async def mark_notification_read(notif_id: str, current_user=Depends(get_current_user)):
        await db.alumni_notifications.update_one(
            {"id": notif_id, "user_id": current_user.id},
            {"$set": {"read": True}},
        )
        return {"message": "Marked as read"}

    @alumni_router.put("/notifications/read-all")
    async def mark_all_notifications_read(current_user=Depends(get_current_user)):
        await db.alumni_notifications.update_many(
            {"user_id": current_user.id, "read": False},
            {"$set": {"read": True}},
        )
        return {"message": "All marked as read"}

    # ============ TRIVIA "รู้จักสายของคุณไหม?" ============

    async def _generate_trivia_question(user_id: str) -> Optional[dict]:
        """Generate a daily trivia question based on user's tree. Multiple choice (4 options)."""
        # Get all alumni connected via tree (up to 5 levels)
        ancestors_raw = await _bfs_ancestors(user_id, max_depth=5)
        descendants_raw = await _bfs_descendants(user_id, max_depth=3)
        all_ids = [a["user_id"] for a in ancestors_raw + descendants_raw]
        if not all_ids:
            return None

        import random
        # Pick a random tree member as subject
        subject_uid = random.choice(all_ids)
        subject = await _get_alumni_profile(subject_uid)
        subject_user = await _get_user_info(subject_uid)
        if not subject or not subject_user:
            return None
        subject_name = subject_user.get("full_name") or subject.get("nickname") or "พี่"

        # Pool of distractor alumni (not the subject)
        distractor_cur = db.alumni_users.find(
            {"user_id": {"$ne": subject_uid}}, {"_id": 0}
        ).limit(50)
        distractors = await distractor_cur.to_list(50)
        random.shuffle(distractors)

        # Choose question type
        valid_types = []
        if subject.get("company"):
            valid_types.append("company")
        if subject.get("position"):
            valid_types.append("position")
        if subject.get("gen"):
            valid_types.append("gen")

        if not valid_types:
            return None
        qtype = random.choice(valid_types)

        if qtype == "company":
            question = f"พี่ {subject.get('nickname') or subject_name} ทำงานอยู่ที่บริษัทไหน?"
            correct = subject.get("company")
            distract_pool = [d.get("company") for d in distractors if d.get("company") and d.get("company") != correct]
        elif qtype == "position":
            question = f"ตำแหน่งของพี่ {subject.get('nickname') or subject_name} คืออะไร?"
            correct = subject.get("position")
            distract_pool = [d.get("position") for d in distractors if d.get("position") and d.get("position") != correct]
        else:  # gen
            question = f"{subject_name} คือรุ่นอะไร?"
            correct = str(subject.get("gen"))
            distract_pool = [str(d.get("gen")) for d in distractors if d.get("gen") and str(d.get("gen")) != correct]

        # Ensure at least 3 distractors
        distract_pool = list(set(distract_pool))[:3]
        while len(distract_pool) < 3:
            distract_pool.append("ไม่ทราบ / อื่น ๆ " + str(len(distract_pool)))

        options = distract_pool[:3] + [correct]
        random.shuffle(options)
        correct_idx = options.index(correct)

        return {
            "id": str(uuid.uuid4()),
            "date": datetime.now(timezone.utc).date().isoformat(),
            "subject_user_id": subject_uid,
            "question": question,
            "options": options,
            "correct_index": correct_idx,
            "type": qtype,
        }

    @alumni_router.get("/trivia/daily")
    async def get_daily_trivia(current_user=Depends(get_current_user)):
        """Return today's trivia question. Idempotent per day per user."""
        today = datetime.now(timezone.utc).date().isoformat()
        existing = await db.alumni_trivia_daily.find_one(
            {"user_id": current_user.id, "date": today}, {"_id": 0}
        )
        if existing:
            # Hide correct_index if not yet answered
            out = dict(existing)
            if not existing.get("answered"):
                out.pop("correct_index", None)
            return out

        q = await _generate_trivia_question(current_user.id)
        if not q:
            return {"question": None, "message": "ยังไม่มีคนในสายของคุณมากพอ · ลอง mark พี่ take ก่อน"}

        doc = {
            **q,
            "user_id": current_user.id,
            "answered": False,
            "is_correct": None,
            "answered_at": None,
        }
        await db.alumni_trivia_daily.insert_one(doc)
        out = {k: v for k, v in doc.items() if k not in ("_id", "correct_index")}
        return out

    @alumni_router.post("/trivia/answer")
    async def answer_trivia(data: TriviaAnswer, current_user=Depends(get_current_user)):
        today = datetime.now(timezone.utc).date().isoformat()
        q = await db.alumni_trivia_daily.find_one(
            {"id": data.question_id, "user_id": current_user.id, "date": today}, {"_id": 0}
        )
        if not q:
            raise HTTPException(status_code=404, detail="Trivia question not found")
        if q.get("answered"):
            raise HTTPException(status_code=400, detail="Already answered today")

        is_correct = data.answer_index == q.get("correct_index")
        await db.alumni_trivia_daily.update_one(
            {"id": data.question_id},
            {"$set": {
                "answered": True,
                "is_correct": is_correct,
                "answered_at": datetime.now(timezone.utc).isoformat(),
                "answer_index": data.answer_index,
            }},
        )

        # Update trivia streak
        profile = await _get_alumni_profile(current_user.id)
        trivia_streak = profile.get("trivia_streak", 0)
        if is_correct:
            trivia_streak += 1
            await db.alumni_users.update_one(
                {"user_id": current_user.id},
                {"$set": {"trivia_streak": trivia_streak}},
            )
            await _award_xp(current_user.id, "trivia_correct")
        else:
            await db.alumni_users.update_one(
                {"user_id": current_user.id},
                {"$set": {"trivia_streak": 0}},
            )

        return {
            "is_correct": is_correct,
            "correct_index": q.get("correct_index"),
            "xp_earned": XP_EVENTS["trivia_correct"] if is_correct else 0,
            "trivia_streak": trivia_streak if is_correct else 0,
        }

    @alumni_router.get("/leaderboard/iq")
    async def leaderboard_iq(limit: int = 10):
        """Top trivia streakers."""
        cur = db.alumni_users.find(
            {"trivia_streak": {"$gt": 0}}, {"_id": 0}
        ).sort("trivia_streak", -1).limit(limit)
        items = await cur.to_list(limit)
        enriched = [await _enrich_alumni(i) for i in items]
        return {"leaderboard": enriched}

    # ============ THROWBACK (Random alumni showcase for fun) ============

    @alumni_router.get("/throwback/random")
    async def throwback_random(count: int = 5, current_user=Depends(get_current_user)):
        """Return random alumni for playful showcase. Lightweight fun."""
        import random
        cur = db.alumni_users.find({}, {"_id": 0}).limit(200)
        pool = await cur.to_list(200)
        if not pool:
            return {"items": []}
        picks = random.sample(pool, min(count, len(pool)))
        captions = [
            "มีใครจำพี่คนนี้ได้ไหม?",
            "ครั้งหนึ่งเคยเป็นวัยรุ่นแบบเรา",
            "ตำนานของรุ่น",
            "เจ้าของ legendary",
            "พี่ที่ทุกคนในคณะควรรู้จัก",
            "สายนี้ห่างจากคุณแค่ไม่กี่ทอด",
        ]
        result = []
        for p in picks:
            enriched = await _enrich_alumni(p)
            enriched["caption"] = random.choice(captions)
            result.append(enriched)
        return {"items": result}

    return alumni_router, {
        "_get_alumni_profile": _get_alumni_profile,
        "_get_user_info": _get_user_info,
        "_enrich_alumni": _enrich_alumni,
        "_bfs_ancestors": _bfs_ancestors,
        "_bfs_descendants": _bfs_descendants,
        "_award_xp": _award_xp,
        "_push_notification": _push_notification,
        "_touch_streak": _touch_streak,
        "_compute_user_stats": _compute_user_stats,
        "_level_from_xp": _level_from_xp,
        "_log_activity": _log_activity,
    }


def get_alumni_helpers(db, get_current_user, get_optional_user, UserRole):
    """Re-export the internal helpers for use by phase2 router (avoids circular dep).

    Returns a dict of helper functions bound to the same DB.
    Note: This re-instantiates the helpers — we avoid that duplication by
    having get_alumni_routes also return helpers via a separate accessor below.
    """
    # Helpers are defined inside get_alumni_routes closure. To share, we use
    # the route-instance approach: caller of get_alumni_routes can stash via a
    # side-channel. For simplicity, we re-define the necessary helpers here.
    raise NotImplementedError("Use get_alumni_routes which now returns (router, helpers)")
