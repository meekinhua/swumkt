#!/usr/bin/env python3
"""Load the faculty + publications seed into MongoDB.

    python backend/scripts/seed_faculty.py              # insert what is missing
    python backend/scripts/seed_faculty.py --dry-run    # report, write nothing

Source: backend/data/faculty_seed.json, built from the department page
(https://bas.swu.ac.th/faculty/marketing-management), OpenAlex and each
lecturer's ORCID record. See that file's `sources` and each paper's
`confidence` / `review_note`.

**Insert-only by design.** A record that already exists is left exactly as it
is, so running this again after a lecturer has corrected their profile, fixed
a Thai title or published a held paper cannot undo their work. To pick up a
change in the seed for a record that exists, edit it through the API
(`sitectl faculty set` / `sitectl paper set`) — that path is snapshotted and
can be undone; this one is not.

Reads MONGO_URL and DB_NAME from the environment, like the server.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

SEED = Path(__file__).resolve().parents[1] / "data" / "faculty_seed.json"


def load_seed(path: str | Path = SEED) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


async def apply_seed(db, data: dict, dry_run: bool) -> dict:
    """Insert what is missing. Shared with POST /api/cms/faculty/seed, because
    production has no shell to run this script in."""
    now = datetime.now(timezone.utc).isoformat()
    added_f = kept_f = added_p = kept_p = 0

    for f in data["faculty"]:
        if await db.faculty.find_one({"id": f["id"]}):
            kept_f += 1
            continue
        added_f += 1
        if not dry_run:
            await db.faculty.insert_one({**f, "created_at": now, "updated_at": now})

    for paper in data["papers"]:
        exists = await db.faculty_papers.find_one({"id": paper["id"]})
        if not exists and paper.get("doi"):
            exists = await db.faculty_papers.find_one({"doi": paper["doi"]})
        if exists:
            kept_p += 1
            continue
        added_p += 1
        if not dry_run:
            await db.faculty_papers.insert_one({**paper, "created_at": now, "updated_at": now})

    shown = sum(1 for x in data["papers"] if x["status"] == "published")
    return {
        "dry_run": dry_run,
        "added_faculty": added_f, "added_papers": added_p,
        "kept_faculty": kept_f, "kept_papers": kept_p,
        "seed_public_papers": shown,
        "seed_review_papers": len(data["papers"]) - shown,
    }


async def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--seed", default=str(SEED))
    a = p.parse_args()

    url, name = os.environ.get("MONGO_URL"), os.environ.get("DB_NAME")
    if not url or not name:
        sys.exit("MONGO_URL and DB_NAME must be set (same values the server uses)")
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(url)[name]

    r = await apply_seed(db, load_seed(a.seed), a.dry_run)
    print(f"{'would add' if a.dry_run else 'added'}: "
          f"{r['added_faculty']} faculty, {r['added_papers']} papers")
    print(f"left as they are (already present): "
          f"{r['kept_faculty']} faculty, {r['kept_papers']} papers")
    print(f"in the seed: {r['seed_public_papers']} papers public, "
          f"{r['seed_review_papers']} held for review (status=review)")
    if not a.dry_run and (r["added_faculty"] or r["added_papers"]):
        print("public caches expire within 5 minutes; `sitectl flush` to see it now")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
