"""
Cleanup: remove legacy base64 image fields AFTER verifying URL fields work.

⚠️ DESTRUCTIVE — run only after confirming the migration succeeded and the
frontend reads the new URL fields correctly. Recommended timeline:
  1. Run migrate_b64_to_storage (already done).
  2. Deploy + observe for ≥ 1 week.
  3. Verify all images render properly across pages.
  4. Run THIS cleanup to actually shrink the database.

What it removes
===============
  · conjoint_studies.profiles[].image_b64    (if image_url present)
  · conjoint_studies.reference_images[].legacy_b64  (after url set)
  · conjoint_studies.profile_images[].legacy_b64
  · cms_posts.cover_image                    (if cover_image_url present, KEEP only the new field)
  · cms_posts.media[].src                    (if url set on the media item)
  · brand_studies.brand_setup.logo_url       (if logo_storage_url present)

Usage
=====
  cd /app/backend
  python -m scripts.cleanup_legacy_b64 --dry-run     # see what would be removed
  python -m scripts.cleanup_legacy_b64               # actually remove
"""
import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()
from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("cleanup")


async def cleanup(db, dry_run: bool):
    # 1. conjoint_studies
    cur = db.conjoint_studies.find({})
    cs_changed = 0; cs_freed = 0
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        before_size = len(str(doc))
        updates = {}
        # profiles[]
        new_profiles = []
        any_changed = False
        for p in (doc.get("profiles") or []):
            if isinstance(p, dict) and p.get("image_url") and p.get("image_b64"):
                np = {k: v for k, v in p.items() if k != "image_b64"}
                new_profiles.append(np)
                any_changed = True
            else:
                new_profiles.append(p)
        if any_changed:
            updates["profiles"] = new_profiles
        # reference_images
        refs = doc.get("reference_images") or []
        if refs and isinstance(refs[0], dict):
            new_refs = []
            any_ref_changed = False
            for r in refs:
                if r.get("url") and r.get("legacy_b64"):
                    new_refs.append({k: v for k, v in r.items() if k != "legacy_b64"})
                    any_ref_changed = True
                else:
                    new_refs.append(r)
            if any_ref_changed:
                updates["reference_images"] = new_refs
        # profile_images
        pi = doc.get("profile_images") or {}
        if isinstance(pi, dict):
            new_pi = {}; any_pi_changed = False
            for k, v in pi.items():
                if isinstance(v, dict) and v.get("url") and v.get("legacy_b64"):
                    new_pi[k] = {kk: vv for kk, vv in v.items() if kk != "legacy_b64"}
                    any_pi_changed = True
                else:
                    new_pi[k] = v
            if any_pi_changed:
                updates["profile_images"] = new_pi

        if updates:
            cs_changed += 1
            after_size = len(str({**doc, **updates}))
            cs_freed += max(0, before_size - after_size)
            if not dry_run:
                await db.conjoint_studies.update_one({"id": doc_id}, {"$set": updates})
    log.info(f"[conjoint_studies] changed={cs_changed}, freed≈{cs_freed/1024:.1f} KB")

    # 2. cms_posts
    cur = db.cms_posts.find({})
    cms_changed = 0; cms_freed = 0
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        before_size = len(str(doc))
        unset = {}; set_ = {}
        if doc.get("cover_image_url") and doc.get("cover_image"):
            unset["cover_image"] = ""
        media = doc.get("media") or []
        if media:
            new_media = []; any_changed = False
            for m in media:
                if isinstance(m, dict) and m.get("url") and m.get("src") and len(m.get("src","")) > 1000:
                    nm = {k: v for k, v in m.items() if k != "src"}
                    nm["src"] = m["url"]  # keep src as URL string for back-compat
                    new_media.append(nm); any_changed = True
                else:
                    new_media.append(m)
            if any_changed:
                set_["media"] = new_media
        op = {}
        if set_: op["$set"] = set_
        if unset: op["$unset"] = unset
        if op:
            cms_changed += 1
            cms_freed += max(0, before_size - len(str({**doc, **set_})))
            if not dry_run:
                await db.cms_posts.update_one({"id": doc_id}, op)
    log.info(f"[cms_posts] changed={cms_changed}, freed≈{cms_freed/1024:.1f} KB")

    # 3. brand_studies — remove logo_url base64 if logo_storage_url set
    cur = db.brand_studies.find({})
    bs_changed = 0
    async for doc in cur:
        doc_id = doc.get("id", str(doc.get("_id", "?")))
        bs = doc.get("brand_setup") or {}
        if bs.get("logo_storage_url") and bs.get("logo_url") and bs["logo_url"].startswith("data:"):
            bs["logo_url"] = bs["logo_storage_url"]
            bs_changed += 1
            if not dry_run:
                await db.brand_studies.update_one({"id": doc_id}, {"$set": {"brand_setup": bs}})
    log.info(f"[brand_studies] changed={bs_changed}")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    log.info(f"Cleanup starting — dry_run={args.dry_run}")
    await cleanup(db, args.dry_run)
    log.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
