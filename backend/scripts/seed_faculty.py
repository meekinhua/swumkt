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

    data = json.loads(Path(a.seed).read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat()

    added_f = kept_f = added_p = kept_p = 0
    for f in data["faculty"]:
        if await db.faculty.find_one({"id": f["id"]}):
            kept_f += 1
            continue
        added_f += 1
        if not a.dry_run:
            await db.faculty.insert_one({**f, "created_at": now, "updated_at": now})

    for paper in data["papers"]:
        exists = await db.faculty_papers.find_one({"id": paper["id"]})
        if not exists and paper.get("doi"):
            exists = await db.faculty_papers.find_one({"doi": paper["doi"]})
        if exists:
            kept_p += 1
            continue
        added_p += 1
        if not a.dry_run:
            await db.faculty_papers.insert_one({**paper, "created_at": now, "updated_at": now})

    shown = sum(1 for x in data["papers"] if x["status"] == "published")
    print(f"{'would add' if a.dry_run else 'added'}: {added_f} faculty, {added_p} papers")
    print(f"left as they are (already present): {kept_f} faculty, {kept_p} papers")
    print(f"in the seed: {shown} papers public, "
          f"{len(data['papers']) - shown} held for review (status=review)")
    if not a.dry_run and (added_f or added_p):
        print("public caches expire within 5 minutes; `sitectl flush` to see it now")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
