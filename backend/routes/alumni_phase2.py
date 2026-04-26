"""
Alumni Phase 2 Routes
=====================
- Discover (Mystery Match)
- Feed (posts + reactions + comments)
- Jobs directory
- Reviews (1-5 stars on alumni)
"""

import random
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

phase2_router = APIRouter(prefix="/alumni", tags=["Alumni Phase 2"])


# ============ MODELS ============

class PostCreate(BaseModel):
    kind: str  # plain | throwback | review | job_share | announcement | search_help
    content: str
    image_url: Optional[str] = None  # base64 data URL
    meta: Optional[Dict[str, Any]] = None  # flexible per-kind data


class CommentCreate(BaseModel):
    content: str


class ReactionToggle(BaseModel):
    emoji: str = "❤️"  # heart by default; can extend


class JobCreate(BaseModel):
    title: str
    company: str
    location: Optional[str] = "Bangkok / Hybrid"
    description: str
    level: Optional[str] = None  # entry / mid / senior / lead
    kind: str = "hiring"  # hiring | seeking_referral
    salary_range: Optional[str] = None
    apply_url: Optional[str] = None
    deadline: Optional[str] = None  # ISO date


class ReviewCreate(BaseModel):
    subject_user_id: str
    rating: int = Field(ge=1, le=5)
    tags: List[str] = []  # ["ใจดี", "ช่วยเหลือเก่ง", "expertise สูง"]
    comment: Optional[str] = None
    anonymous: bool = False


REVIEW_TAGS = [
    "ใจดี", "ช่วยเหลือเก่ง", "expertise สูง", "ตอบเร็ว",
    "เคยช่วย refer งาน", "mentor ที่ดี", "เชี่ยวชาญสาย Brand",
    "เชี่ยวชาญสาย Digital", "เชี่ยวชาญสาย Strategy", "เชี่ยวชาญสาย Creative",
    "เป็นกันเอง", "professional", "ให้ feedback ตรง",
]

POST_KINDS = ["plain", "throwback", "review", "job_share", "announcement", "search_help"]
JOB_KINDS = ["hiring", "seeking_referral"]


def get_phase2_routes(db, get_current_user, get_optional_user, alumni_helpers):
    """Factory — alumni_helpers contains shared functions from main alumni router.

    Expected helpers:
      - _get_alumni_profile(user_id)
      - _get_user_info(user_id)
      - _enrich_alumni(alum)
      - _bfs_ancestors(user_id, max_depth)
      - _bfs_descendants(user_id, max_depth)
      - _award_xp(user_id, event_key, custom_amount=None)
      - _push_notification(user_id, kind, title, body, meta)
    """
    H = alumni_helpers

    # ============ DISCOVER (Mystery Match) ============

    @phase2_router.get("/discover/mystery-match")
    async def mystery_match(
        min_hops: int = Query(3, ge=1, le=8),
        max_hops: int = Query(6, ge=1, le=8),
        industry: Optional[str] = None,
        current_user=Depends(get_current_user),
    ):
        """Return 1 mystery match — alumni 3-6 hops away in tree (not already marked)."""
        me = await H["_get_alumni_profile"](current_user.id)
        if not me:
            raise HTTPException(status_code=404, detail="Register alumni profile first")

        # Get ancestors + descendants within range
        ancestors = await H["_bfs_ancestors"](current_user.id, max_depth=max_hops)
        descendants = await H["_bfs_descendants"](current_user.id, max_depth=max_hops)
        within_range = [
            x for x in (ancestors + descendants)
            if min_hops <= x["distance"] <= max_hops
        ]

        # Get already-marked or skipped users
        marked_cur = db.alumni_relations.find({
            "$or": [{"from_user_id": current_user.id}, {"to_user_id": current_user.id}],
        }, {"_id": 0, "from_user_id": 1, "to_user_id": 1})
        marked_list = await marked_cur.to_list(1000)
        marked_ids = set()
        for m in marked_list:
            marked_ids.add(m["from_user_id"])
            marked_ids.add(m["to_user_id"])
        marked_ids.discard(current_user.id)

        skipped_cur = db.alumni_mystery_skipped.find({"user_id": current_user.id}, {"_id": 0, "skipped_user_id": 1})
        skipped_list = await skipped_cur.to_list(500)
        skipped_ids = {s["skipped_user_id"] for s in skipped_list}

        candidates = [x for x in within_range if x["user_id"] not in marked_ids and x["user_id"] not in skipped_ids]

        if not candidates:
            # Fallback: random alumni not yet marked + filter privacy
            cur = db.alumni_users.find({
                "user_id": {"$nin": list(marked_ids | skipped_ids | {current_user.id})},
                "privacy_settings.allow_mystery_match": {"$ne": False},
            }, {"_id": 0}).limit(50)
            pool = await cur.to_list(50)
            if not pool:
                return {"match": None, "reason": "หมดคนแล้ว · ลองอีกครั้งภายหลัง หรือชวนเพื่อนเข้ามาเพิ่ม"}
            random.shuffle(pool)
            picked = pool[0]
            picked_distance = None
            picked_direction = "?"
        else:
            random.shuffle(candidates)
            choice = candidates[0]
            picked = await H["_get_alumni_profile"](choice["user_id"])
            if not picked:
                return {"match": None, "reason": "data corruption"}
            picked_distance = choice.get("distance")
            picked_direction = "up" if choice in ancestors else "down"

        if industry and picked.get("company"):
            # Loose filter — if company doesn't match, still return but mark mismatch
            pass

        # Enrich
        enriched = await H["_enrich_alumni"](picked)

        # "Why interesting" — simple algorithmic reason
        reasons = []
        if picked_distance:
            label = ("ปู่ของปู่" if picked_distance >= 4 else "ปู่ของคุณ") if picked_direction == "up" else "เหลนของเหลน"
            reasons.append(f"ห่างจากคุณ {picked_distance} ทอด · {label}")
        if picked.get("company"):
            reasons.append(f"ทำงานที่ {picked['company']}")
        if picked.get("position"):
            reasons.append(picked["position"])
        if picked.get("gen") and me.get("gen"):
            gap = abs(picked["gen"] - me["gen"])
            if gap >= 10:
                reasons.append(f"ห่าง {gap} รุ่น")

        return {
            "match": enriched,
            "distance": picked_distance,
            "direction": picked_direction,
            "reasons": reasons,
        }

    @phase2_router.post("/discover/skip/{user_id}")
    async def skip_mystery_match(user_id: str, current_user=Depends(get_current_user)):
        """Mark a user as skipped so they won't appear in next mystery match."""
        await db.alumni_mystery_skipped.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": current_user.id,
            "skipped_user_id": user_id,
            "skipped_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"message": "Skipped"}

    # ============ FEED ============

    @phase2_router.post("/feed/posts")
    async def create_post(data: PostCreate, current_user=Depends(get_current_user)):
        """Create a feed post."""
        if data.kind not in POST_KINDS:
            raise HTTPException(status_code=400, detail=f"Invalid post kind. Must be one of {POST_KINDS}")
        me = await H["_get_alumni_profile"](current_user.id)
        if not me:
            raise HTTPException(status_code=404, detail="Register alumni profile first")

        now = datetime.now(timezone.utc).isoformat()
        post = {
            "id": str(uuid.uuid4()),
            "author_id": current_user.id,
            "kind": data.kind,
            "content": data.content,
            "image_url": data.image_url,
            "meta": data.meta or {},
            "reactions": {},  # {emoji: [user_ids]}
            "comment_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        await db.alumni_posts.insert_one(post)
        await H["_award_xp"](current_user.id, "post_created", 5)
        return {k: v for k, v in post.items() if k != "_id"}

    async def _enrich_post(p: dict, current_user_id: str) -> dict:
        """Attach author info + my reaction state."""
        author = await H["_get_alumni_profile"](p["author_id"])
        p["author"] = await H["_enrich_alumni"](author) if author else None
        # Compute total reactions
        total = sum(len(v) for v in p.get("reactions", {}).values())
        p["reaction_count"] = total
        # My reactions
        my_reactions = [emoji for emoji, uids in p.get("reactions", {}).items() if current_user_id in uids]
        p["my_reactions"] = my_reactions
        return p

    @phase2_router.get("/feed/posts")
    async def list_posts(
        kind: Optional[str] = None,
        limit: int = 20,
        skip: int = 0,
        current_user=Depends(get_current_user),
    ):
        """List feed posts (newest first). Optionally filter by kind."""
        query = {}
        if kind:
            query["kind"] = kind
        cur = db.alumni_posts.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        posts = await cur.to_list(limit)
        enriched = [await _enrich_post(p, current_user.id) for p in posts]
        return {"posts": enriched, "total": len(enriched)}

    @phase2_router.delete("/feed/posts/{post_id}")
    async def delete_post(post_id: str, current_user=Depends(get_current_user)):
        post = await db.alumni_posts.find_one({"id": post_id})
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        if post["author_id"] != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot delete others' posts")
        await db.alumni_posts.delete_one({"id": post_id})
        await db.alumni_post_comments.delete_many({"post_id": post_id})
        return {"message": "Deleted"}

    @phase2_router.post("/feed/posts/{post_id}/react")
    async def toggle_reaction(post_id: str, data: ReactionToggle, current_user=Depends(get_current_user)):
        """Toggle a reaction emoji on a post."""
        post = await db.alumni_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        reactions = post.get("reactions", {})
        emoji = data.emoji
        users_for_emoji = reactions.get(emoji, [])
        notify = False
        if current_user.id in users_for_emoji:
            users_for_emoji = [u for u in users_for_emoji if u != current_user.id]
        else:
            users_for_emoji.append(current_user.id)
            notify = True
        if users_for_emoji:
            reactions[emoji] = users_for_emoji
        else:
            reactions.pop(emoji, None)
        await db.alumni_posts.update_one({"id": post_id}, {"$set": {"reactions": reactions}})

        # Notify post author (once per emoji-add)
        if notify and post["author_id"] != current_user.id:
            me_alum = await H["_get_alumni_profile"](current_user.id)
            me_name = (me_alum or {}).get("nickname") or current_user.email.split("@")[0]
            await H["_push_notification"](
                post["author_id"], "post_reaction",
                f"{emoji} มีคน react โพสต์ของคุณ",
                f"{me_name} กด {emoji} ให้โพสต์ของคุณ",
                {"post_id": post_id, "emoji": emoji},
            )
        return {"reactions": reactions, "reaction_count": sum(len(v) for v in reactions.values())}

    @phase2_router.get("/feed/posts/{post_id}/comments")
    async def list_comments(post_id: str, current_user=Depends(get_current_user)):
        cur = db.alumni_post_comments.find({"post_id": post_id}, {"_id": 0}).sort("created_at", 1)
        comments = await cur.to_list(500)
        for c in comments:
            author = await H["_get_alumni_profile"](c["author_id"])
            c["author"] = await H["_enrich_alumni"](author) if author else None
        return {"comments": comments, "total": len(comments)}

    @phase2_router.post("/feed/posts/{post_id}/comments")
    async def create_comment(post_id: str, data: CommentCreate, current_user=Depends(get_current_user)):
        post = await db.alumni_posts.find_one({"id": post_id}, {"_id": 0})
        if not post:
            raise HTTPException(status_code=404, detail="Post not found")
        now = datetime.now(timezone.utc).isoformat()
        comment = {
            "id": str(uuid.uuid4()),
            "post_id": post_id,
            "author_id": current_user.id,
            "content": data.content,
            "created_at": now,
        }
        await db.alumni_post_comments.insert_one(comment)
        await db.alumni_posts.update_one({"id": post_id}, {"$inc": {"comment_count": 1}})

        if post["author_id"] != current_user.id:
            me_alum = await H["_get_alumni_profile"](current_user.id)
            me_name = (me_alum or {}).get("nickname") or current_user.email.split("@")[0]
            await H["_push_notification"](
                post["author_id"], "post_comment",
                "💬 มีคนคอมเมนต์โพสต์ของคุณ",
                f"{me_name}: {data.content[:60]}...",
                {"post_id": post_id, "comment_id": comment["id"]},
            )
        out = {k: v for k, v in comment.items() if k != "_id"}
        author = await H["_get_alumni_profile"](current_user.id)
        out["author"] = await H["_enrich_alumni"](author) if author else None
        return out

    # ============ JOBS DIRECTORY ============

    @phase2_router.post("/jobs")
    async def post_job(data: JobCreate, current_user=Depends(get_current_user)):
        if data.kind not in JOB_KINDS:
            raise HTTPException(status_code=400, detail="Invalid job kind")
        me = await H["_get_alumni_profile"](current_user.id)
        if not me:
            raise HTTPException(status_code=404, detail="Register alumni profile first")
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "id": str(uuid.uuid4()),
            "posted_by": current_user.id,
            "title": data.title,
            "company": data.company,
            "location": data.location or "Bangkok / Hybrid",
            "description": data.description,
            "level": data.level,
            "kind": data.kind,
            "salary_range": data.salary_range,
            "apply_url": data.apply_url,
            "deadline": data.deadline,
            "interest_count": 0,
            "interested_users": [],
            "active": True,
            "created_at": now,
        }
        await db.alumni_jobs.insert_one(job)
        await H["_award_xp"](current_user.id, "job_posted", 30)
        return {k: v for k, v in job.items() if k != "_id"}

    async def _enrich_job(j: dict) -> dict:
        author = await H["_get_alumni_profile"](j["posted_by"])
        j["poster"] = await H["_enrich_alumni"](author) if author else None
        return j

    @phase2_router.get("/jobs")
    async def list_jobs(
        kind: Optional[str] = None,
        level: Optional[str] = None,
        limit: int = 30,
        current_user=Depends(get_current_user),
    ):
        query = {"active": True}
        if kind:
            query["kind"] = kind
        if level:
            query["level"] = level
        cur = db.alumni_jobs.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
        jobs = await cur.to_list(limit)
        enriched = [await _enrich_job(j) for j in jobs]
        return {"jobs": enriched, "total": len(enriched)}

    @phase2_router.post("/jobs/{job_id}/interest")
    async def express_interest(job_id: str, current_user=Depends(get_current_user)):
        """Express interest in a job — notifies poster."""
        job = await db.alumni_jobs.find_one({"id": job_id}, {"_id": 0})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if current_user.id == job["posted_by"]:
            raise HTTPException(status_code=400, detail="Cannot express interest on your own job")
        if current_user.id in job.get("interested_users", []):
            return {"message": "Already interested", "interest_count": job.get("interest_count", 0)}
        await db.alumni_jobs.update_one(
            {"id": job_id},
            {"$inc": {"interest_count": 1}, "$addToSet": {"interested_users": current_user.id}},
        )
        me_alum = await H["_get_alumni_profile"](current_user.id)
        me_name = (me_alum or {}).get("nickname") or current_user.email.split("@")[0]
        await H["_push_notification"](
            job["posted_by"], "job_interest",
            "💼 มีคนสนใจตำแหน่งของคุณ",
            f"{me_name} สนใจตำแหน่ง {job['title']} ที่ {job['company']}",
            {"job_id": job_id, "interested_user_id": current_user.id},
        )
        return {"message": "Interest expressed", "interest_count": job.get("interest_count", 0) + 1}

    @phase2_router.delete("/jobs/{job_id}")
    async def delete_job(job_id: str, current_user=Depends(get_current_user)):
        job = await db.alumni_jobs.find_one({"id": job_id})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["posted_by"] != current_user.id:
            raise HTTPException(status_code=403, detail="Cannot delete others' jobs")
        await db.alumni_jobs.update_one({"id": job_id}, {"$set": {"active": False}})
        return {"message": "Job closed"}

    # ============ REVIEWS ============

    @phase2_router.get("/reviews/tags")
    async def get_review_tags():
        return {"tags": REVIEW_TAGS}

    @phase2_router.post("/reviews")
    async def post_review(data: ReviewCreate, current_user=Depends(get_current_user)):
        if data.subject_user_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot review yourself")
        subject = await H["_get_alumni_profile"](data.subject_user_id)
        if not subject:
            raise HTTPException(status_code=404, detail="Subject profile not found")

        # 1 review per (reviewer, subject) — upsert
        now = datetime.now(timezone.utc).isoformat()
        existing = await db.alumni_reviews.find_one({
            "reviewer_id": current_user.id,
            "subject_user_id": data.subject_user_id,
        })

        review_doc = {
            "reviewer_id": current_user.id,
            "subject_user_id": data.subject_user_id,
            "rating": data.rating,
            "tags": data.tags,
            "comment": data.comment,
            "anonymous": data.anonymous,
            "helpful_count": 0,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
        }

        if existing:
            await db.alumni_reviews.update_one(
                {"_id": existing["_id"]},
                {"$set": {k: v for k, v in review_doc.items() if k != "created_at"}},
            )
            review_doc["id"] = existing.get("id")
            new_review = False
        else:
            review_doc["id"] = str(uuid.uuid4())
            await db.alumni_reviews.insert_one(review_doc)
            await db.alumni_users.update_one(
                {"user_id": current_user.id},
                {"$inc": {"reviews_written": 1}},
            )
            await H["_award_xp"](current_user.id, "review_written", 25)
            new_review = True

        # Update subject's review_avg + review_count cache
        cur = db.alumni_reviews.find({"subject_user_id": data.subject_user_id}, {"_id": 0, "rating": 1})
        all_reviews = await cur.to_list(1000)
        avg = sum(r["rating"] for r in all_reviews) / len(all_reviews) if all_reviews else 0
        await db.alumni_users.update_one(
            {"user_id": data.subject_user_id},
            {"$set": {"review_avg": round(avg, 2), "review_count": len(all_reviews)}},
        )

        if new_review:
            me_alum = await H["_get_alumni_profile"](current_user.id)
            me_name = (me_alum or {}).get("nickname") or "ใครบางคน"
            display_from = me_name if not data.anonymous else "ใครบางคน"
            await H["_push_notification"](
                data.subject_user_id, "review_received",
                "⭐ ได้รับรีวิวใหม่",
                f"{display_from} รีวิวคุณ {data.rating}/5 ดาว",
                {"review_id": review_doc["id"], "rating": data.rating},
            )

        out = {k: v for k, v in review_doc.items() if k != "_id"}
        return out

    @phase2_router.get("/reviews/user/{user_id}")
    async def list_reviews(user_id: str, limit: int = 30, current_user=Depends(get_current_user)):
        cur = db.alumni_reviews.find({"subject_user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(limit)
        reviews = await cur.to_list(limit)
        # Compute summary
        ratings = [r["rating"] for r in reviews]
        avg = sum(ratings) / len(ratings) if ratings else 0
        # Anonymize + enrich
        for r in reviews:
            if r.get("anonymous"):
                r["reviewer"] = {"name": "ศิษย์เก่า MKT", "anonymous": True}
            else:
                rev_alum = await H["_get_alumni_profile"](r["reviewer_id"])
                r["reviewer"] = await H["_enrich_alumni"](rev_alum) if rev_alum else None

        # Tag frequency
        all_tags = []
        for r in reviews:
            all_tags.extend(r.get("tags", []))
        from collections import Counter
        tag_counts = Counter(all_tags).most_common(8)

        return {
            "reviews": reviews,
            "total": len(reviews),
            "average_rating": round(avg, 2),
            "rating_breakdown": {str(i): sum(1 for r in ratings if r == i) for i in range(1, 6)},
            "top_tags": [{"tag": t, "count": c} for t, c in tag_counts],
        }

    return phase2_router
