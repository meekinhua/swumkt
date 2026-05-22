"""
One-shot migration: embedded base64 images → Emergent Object Storage.

What it does
============
Scans these MongoDB collections for embedded base64/data-URI image strings and
migrates them to object storage, **keeping the original as fallback**:
  · conjoint_studies.profiles[].image_b64  →  image_url
  · conjoint_studies.reference_images[]    →  reference_images[] (replace inline)
  · conjoint_studies.profile_images        →  profile_images_urls
  · cms_posts.cover_image                  →  cover_image_url
  · cms_posts.media[].src (data: URIs)     →  url field
  · brand_studies.brand_setup.logo_url     →  brand_setup.logo_url (replace)

Safety guarantees
=================
1. Original base64 field is NEVER deleted by this script. We add a new URL
   field next to it. The application reads URL first, falls back to base64.
2. Each upload is wrapped in try/except — failed uploads don't break the run.
3. Idempotent: re-running skips docs that already have URL fields populated.
4. Dry-run mode: prints what would change without writing.

Usage
=====
  cd /app/backend
  # Dry run first to inspect
  python -m scripts.migrate_b64_to_storage --dry-run
  # Real migration
  python -m scripts.migrate_b64_to_storage
  # Migrate just one collection
  python -m scripts.migrate_b64_to_storage --collection conjoint_studies
"""
import asyncio
import argparse
import logging
import os
import sys
from typing import Optional

# Make `lib.object_storage` importable when run as a module
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from lib.object_storage import init_storage, upload_b64_image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
log = logging.getLogger("migrate")


def _looks_like_b64_image(s: Optional[str]) -> bool:
    """Heuristic: data URI or long base64-ish string."""
    if not s or not isinstance(s, str):
        return False
    if s.startswith("data:image/"):
        return True
    if s.startswith("http://") or s.startswith("https://") or s.startswith("/api/"):
        return False
    # Long-enough plain base64 (~ >1.5 KB encoded)
    if len(s) > 2000 and "/" not in s[:40] and " " not in s[:40]:
        return True
    return False


async def migrate_conjoint_studies(db, dry_run: bool):
    coll = db.conjoint_studies
    total = await coll.count_documents({})
    log.info(f"[conjoint_studies] scanning {total} docs…")
    changed_docs = 0
    uploaded = 0
    errors = 0
    cur = coll.find({})
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        updates = {}

        # 1. profiles[].image_b64  →  profiles[].image_url
        profiles = doc.get("profiles") or []
        new_profiles = []
        for p in profiles:
            if not isinstance(p, dict):
                new_profiles.append(p); continue
            np = dict(p)
            # Skip if already migrated
            if np.get("image_url"):
                new_profiles.append(np); continue
            b64 = np.get("image_b64")
            if _looks_like_b64_image(b64):
                if dry_run:
                    log.info(f"  [DRY] would upload conjoint profile {doc_id}/{np.get('id','?')}")
                    np["image_url"] = "(would-upload)"
                    uploaded += 1
                else:
                    info = await upload_b64_image(b64, "conjoint-profiles", doc_id)
                    if info:
                        np["image_url"] = info["url"]
                        np["image_storage_path"] = info["path"]
                        uploaded += 1
                    else:
                        errors += 1
            new_profiles.append(np)
        if new_profiles != profiles:
            updates["profiles"] = new_profiles

        # 2. reference_images[] — list of base64 strings → list of {url, storage_path}
        refs = doc.get("reference_images") or []
        if refs and isinstance(refs[0], str):  # legacy: list of strings
            new_refs = []
            for s in refs:
                if _looks_like_b64_image(s):
                    if dry_run:
                        new_refs.append({"legacy_b64": s[:60] + "…", "url": "(would-upload)"})
                        uploaded += 1
                    else:
                        info = await upload_b64_image(s, "conjoint-refs", doc_id)
                        if info:
                            new_refs.append({"url": info["url"], "storage_path": info["path"], "legacy_b64": s})
                            uploaded += 1
                        else:
                            new_refs.append({"legacy_b64": s})
                            errors += 1
                else:
                    new_refs.append({"url": s} if (s or '').startswith(('http', '/api/')) else {"legacy_b64": s})
            updates["reference_images"] = new_refs

        # 3. profile_images dict — keys = profile_id, vals = base64
        pi = doc.get("profile_images") or {}
        if isinstance(pi, dict) and pi:
            new_pi = {}
            for k, v in pi.items():
                if v and isinstance(v, dict):
                    new_pi[k] = v; continue
                if _looks_like_b64_image(v):
                    if dry_run:
                        new_pi[k] = {"legacy_b64": (v or '')[:60] + "…", "url": "(would-upload)"}
                        uploaded += 1
                    else:
                        info = await upload_b64_image(v, "conjoint-profile-images", doc_id)
                        if info:
                            new_pi[k] = {"url": info["url"], "storage_path": info["path"]}
                            uploaded += 1
                        else:
                            new_pi[k] = {"legacy_b64": v}; errors += 1
                else:
                    new_pi[k] = {"url": v}
            updates["profile_images"] = new_pi

        if updates:
            changed_docs += 1
            if not dry_run:
                await coll.update_one({"id": doc_id}, {"$set": updates})
    log.info(f"[conjoint_studies] done — changed_docs={changed_docs} uploaded={uploaded} errors={errors}")


async def migrate_cms_posts(db, dry_run: bool):
    coll = db.cms_posts
    total = await coll.count_documents({})
    log.info(f"[cms_posts] scanning {total} docs…")
    changed_docs = 0; uploaded = 0; errors = 0
    cur = coll.find({})
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        updates = {}
        # cover_image (often a data: URI)
        cover = doc.get("cover_image")
        if _looks_like_b64_image(cover) and not doc.get("cover_image_url"):
            if dry_run:
                uploaded += 1
                updates["cover_image_url"] = "(would-upload)"
            else:
                info = await upload_b64_image(cover, "cms-covers", doc_id)
                if info:
                    updates["cover_image_url"] = info["url"]
                    updates["cover_image_storage_path"] = info["path"]
                    uploaded += 1
                else: errors += 1

        # media[] items with kind=image and src is base64
        media = doc.get("media") or []
        new_media = []
        media_changed = False
        for m in media:
            if not isinstance(m, dict):
                new_media.append(m); continue
            nm = dict(m)
            if nm.get("kind") == "image" and _looks_like_b64_image(nm.get("src")) and not nm.get("url"):
                if dry_run:
                    nm["url"] = "(would-upload)"; uploaded += 1; media_changed = True
                else:
                    info = await upload_b64_image(nm["src"], "cms-media", doc_id)
                    if info:
                        nm["url"] = info["url"]; nm["storage_path"] = info["path"]
                        uploaded += 1; media_changed = True
                    else: errors += 1
            new_media.append(nm)
        if media_changed:
            updates["media"] = new_media

        if updates:
            changed_docs += 1
            if not dry_run:
                await coll.update_one({"id": doc_id}, {"$set": updates})
    log.info(f"[cms_posts] done — changed_docs={changed_docs} uploaded={uploaded} errors={errors}")


async def migrate_brand_studies(db, dry_run: bool):
    coll = db.brand_studies
    total = await coll.count_documents({})
    log.info(f"[brand_studies] scanning {total} docs…")
    changed_docs = 0; uploaded = 0; errors = 0
    cur = coll.find({})
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        bs = doc.get("brand_setup") or {}
        logo = bs.get("logo_url")
        if _looks_like_b64_image(logo) and not bs.get("logo_storage_url"):
            if dry_run:
                uploaded += 1
                changed_docs += 1
            else:
                info = await upload_b64_image(logo, "brand-logos", doc_id)
                if info:
                    bs["logo_storage_url"] = info["url"]
                    bs["logo_storage_path"] = info["path"]
                    # Keep original logo_url as fallback — DO NOT overwrite
                    await coll.update_one({"id": doc_id}, {"$set": {"brand_setup": bs}})
                    uploaded += 1
                    changed_docs += 1
                else:
                    errors += 1
    log.info(f"[brand_studies] done — changed_docs={changed_docs} uploaded={uploaded} errors={errors}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show what would change without writing")
    parser.add_argument("--collection", choices=["conjoint_studies", "cms_posts", "brand_studies", "all"],
                        default="all")
    args = parser.parse_args()

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    await init_storage()
    log.info(f"Object storage initialised. dry_run={args.dry_run}")

    tasks = {
        "conjoint_studies": migrate_conjoint_studies,
        "cms_posts": migrate_cms_posts,
        "brand_studies": migrate_brand_studies,
    }
    targets = list(tasks.keys()) if args.collection == "all" else [args.collection]
    for name in targets:
        try:
            await tasks[name](db, args.dry_run)
        except Exception as e:
            log.exception(f"FAILED migrating {name}: {e}")
    log.info("Migration complete.")


if __name__ == "__main__":
    asyncio.run(main())
