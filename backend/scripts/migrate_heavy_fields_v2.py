"""
Migration v2: Target the heavy fields still bloating MongoDB after v1.

v1 migrated:
  - conjoint_studies.profiles[].image_b64 (top-level profiles, mostly empty now)
  - cms_posts.cover_image
  - brand_studies.brand_setup.logo_url

v2 targets the REAL weight that v1 missed:
  · conjoint_studies.choice_sets[*].profiles[*].profile_image_url  (14 MB total!)
  · contents.attachments[*].file_data                              (multi-MB galleries)
  · contents.behavior_metadata.image_url                           (up to 2 MB each)
  · users.avatar_url                                               (small but easy)

Strategy
========
Frontend uses these fields directly as `<img src={field}>`. We OVERWRITE the
base64 in-place with the `/api/files/...` URL. Browser resolves the relative
URL against the current origin and the backend's `/api/files/{path}` route
proxies object storage. No frontend change required.

Idempotent: skips values that are already URLs (start with http or /api/).

Usage
=====
  cd /app/backend
  python -m scripts.migrate_heavy_fields_v2 --dry-run
  python -m scripts.migrate_heavy_fields_v2
  python -m scripts.migrate_heavy_fields_v2 --collection conjoint_studies
"""
import asyncio
import argparse
import logging
import os
import sys
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from lib.object_storage import init_storage, upload_b64_image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("migrate_v2")


def _is_data_uri(s: Optional[str]) -> bool:
    return isinstance(s, str) and s.strip().startswith("data:image/")


def _is_already_url(s: Optional[str]) -> bool:
    if not isinstance(s, str):
        return False
    t = s.strip()
    return t.startswith(("http://", "https://", "/api/"))


async def migrate_conjoint_choice_sets(db, dry_run: bool):
    """Migrate conjoint_studies.choice_sets[*].profiles[*].profile_image_url"""
    coll = db.conjoint_studies
    total = await coll.count_documents({"choice_sets": {"$exists": True, "$ne": []}})
    log.info(f"[conjoint_studies] scanning {total} studies with choice_sets…")
    changed_docs = 0
    uploaded = 0
    errors = 0
    bytes_saved = 0

    async for doc in coll.find({"choice_sets": {"$exists": True, "$ne": []}}):
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        title = (doc.get("title") or "?")[:30]
        choice_sets = doc.get("choice_sets") or []
        doc_changed = False
        doc_bytes_before = 0
        doc_bytes_after = 0

        new_choice_sets = []
        for cs in choice_sets:
            if not isinstance(cs, dict):
                new_choice_sets.append(cs)
                continue
            new_cs = dict(cs)
            new_profiles = []
            for p in cs.get("profiles", []):
                if not isinstance(p, dict):
                    new_profiles.append(p)
                    continue
                np = dict(p)
                v = np.get("profile_image_url")
                if _is_data_uri(v):
                    doc_bytes_before += len(v)
                    if dry_run:
                        np["profile_image_url"] = "(would-upload)"
                        uploaded += 1
                        doc_bytes_after += 80
                    else:
                        info = await upload_b64_image(
                            v, "conjoint-profiles", doc_id
                        )
                        if info and info.get("url"):
                            np["profile_image_url"] = info["url"]
                            uploaded += 1
                            doc_bytes_after += len(info["url"])
                        else:
                            errors += 1
                            doc_bytes_after += len(v)
                    doc_changed = True
                # else: already a URL or empty → leave alone
                new_profiles.append(np)
            new_cs["profiles"] = new_profiles
            new_choice_sets.append(new_cs)

        if doc_changed:
            changed_docs += 1
            bytes_saved += (doc_bytes_before - doc_bytes_after)
            log.info(
                f"  {title:30} | profiles_migrated, "
                f"~{(doc_bytes_before - doc_bytes_after)/1024:.0f}KB saved"
            )
            if not dry_run:
                await coll.update_one(
                    {"id": doc_id},
                    {"$set": {"choice_sets": new_choice_sets}},
                )

    log.info(
        f"[conjoint_studies] DONE — changed={changed_docs} uploaded={uploaded} "
        f"errors={errors} bytes_saved≈{bytes_saved/1024/1024:.2f}MB"
    )


async def migrate_contents(db, dry_run: bool):
    """Migrate contents.attachments[].file_data and behavior_metadata.image_url"""
    coll = db.contents
    total = await coll.count_documents({})
    log.info(f"[contents] scanning {total} docs…")
    changed_docs = 0
    uploaded = 0
    errors = 0
    bytes_saved = 0

    async for doc in coll.find({}):
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        title = (doc.get("title") or "?")[:30]
        updates = {}
        local_saved = 0

        # 1) attachments[].file_data
        attachments = doc.get("attachments") or []
        new_attachments = []
        atts_changed = False
        for a in attachments:
            if not isinstance(a, dict):
                new_attachments.append(a)
                continue
            na = dict(a)
            fd = na.get("file_data")
            if _is_data_uri(fd):
                before = len(fd)
                if dry_run:
                    na["file_data"] = "(would-upload)"
                    uploaded += 1
                    atts_changed = True
                    local_saved += (before - 80)
                else:
                    info = await upload_b64_image(
                        fd, "content-attachments", doc_id
                    )
                    if info and info.get("url"):
                        na["file_data"] = info["url"]
                        uploaded += 1
                        atts_changed = True
                        local_saved += (before - len(info["url"]))
                    else:
                        errors += 1
            new_attachments.append(na)
        if atts_changed:
            updates["attachments"] = new_attachments

        # 2) behavior_metadata.image_url
        bm = doc.get("behavior_metadata") or {}
        if isinstance(bm, dict):
            bm_img = bm.get("image_url")
            if _is_data_uri(bm_img):
                before = len(bm_img)
                if dry_run:
                    new_bm = dict(bm)
                    new_bm["image_url"] = "(would-upload)"
                    updates["behavior_metadata"] = new_bm
                    uploaded += 1
                    local_saved += (before - 80)
                else:
                    info = await upload_b64_image(
                        bm_img, "content-behavior", doc_id
                    )
                    if info and info.get("url"):
                        new_bm = dict(bm)
                        new_bm["image_url"] = info["url"]
                        updates["behavior_metadata"] = new_bm
                        uploaded += 1
                        local_saved += (before - len(info["url"]))
                    else:
                        errors += 1

        # 3) cover_image_thumbnail — small but still data URI? Migrate if huge.
        cit = doc.get("cover_image_thumbnail")
        if _is_data_uri(cit) and len(cit) > 5000:
            before = len(cit)
            if dry_run:
                updates["cover_image_thumbnail"] = "(would-upload)"
                uploaded += 1
                local_saved += (before - 80)
            else:
                info = await upload_b64_image(cit, "content-thumbs", doc_id)
                if info and info.get("url"):
                    updates["cover_image_thumbnail"] = info["url"]
                    uploaded += 1
                    local_saved += (before - len(info["url"]))
                else:
                    errors += 1

        if updates:
            changed_docs += 1
            bytes_saved += local_saved
            log.info(f"  {title:30} | ~{local_saved/1024:.0f}KB saved")
            if not dry_run:
                await coll.update_one({"id": doc_id}, {"$set": updates})

    log.info(
        f"[contents] DONE — changed={changed_docs} uploaded={uploaded} "
        f"errors={errors} bytes_saved≈{bytes_saved/1024/1024:.2f}MB"
    )


async def migrate_users(db, dry_run: bool):
    """Migrate users.avatar_url base64 → storage URL"""
    coll = db.users
    total = await coll.count_documents({})
    log.info(f"[users] scanning {total} docs…")
    changed_docs = 0
    uploaded = 0
    errors = 0
    bytes_saved = 0

    async for doc in coll.find({}):
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        email = doc.get("email", "?")
        av = doc.get("avatar_url")
        if _is_data_uri(av):
            before = len(av)
            if dry_run:
                uploaded += 1
                changed_docs += 1
                bytes_saved += (before - 80)
                log.info(f"  [DRY] {email} avatar {before/1024:.1f}KB")
            else:
                info = await upload_b64_image(av, "user-avatars", doc_id)
                if info and info.get("url"):
                    await coll.update_one(
                        {"id": doc_id}, {"$set": {"avatar_url": info["url"]}}
                    )
                    uploaded += 1
                    changed_docs += 1
                    bytes_saved += (before - len(info["url"]))
                    log.info(f"  {email} ~{before/1024:.1f}KB saved")
                else:
                    errors += 1

    log.info(
        f"[users] DONE — changed={changed_docs} uploaded={uploaded} "
        f"errors={errors} bytes_saved≈{bytes_saved/1024/1024:.2f}MB"
    )


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing")
    parser.add_argument(
        "--collection",
        choices=["conjoint_studies", "contents", "users", "all"],
        default="all",
    )
    args = parser.parse_args()

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    await init_storage()
    log.info(f"Object storage initialised. dry_run={args.dry_run}")

    tasks = {
        "conjoint_studies": migrate_conjoint_choice_sets,
        "contents": migrate_contents,
        "users": migrate_users,
    }
    targets = list(tasks.keys()) if args.collection == "all" else [args.collection]
    for name in targets:
        try:
            await tasks[name](db, args.dry_run)
        except Exception as e:
            log.exception(f"FAILED migrating {name}: {e}")
    log.info("Migration v2 complete.")


if __name__ == "__main__":
    asyncio.run(main())
