#!/usr/bin/env python3
"""Mint the first scoped API key, straight against MongoDB.

`POST /api/cms/keys` needs an admin already signed in, which is the thing the
key exists to avoid needing. This closes that loop: run it once on the server,
hand the printed key to whoever operates the content tooling, and manage every
later key through the endpoint.

    python backend/scripts/mint_api_key.py --label "sitectl · claude-code"

Scopes default to the full content set (`cms.*`). Narrow them when the key is
for something smaller:

    python backend/scripts/mint_api_key.py --label "publish bot" \\
        --scope cms.read --scope cms.posts.write

Other operations:

    python backend/scripts/mint_api_key.py --list
    python backend/scripts/mint_api_key.py --revoke <key-id>

The key is printed once. Only its SHA-256 is stored, so a lost key is minted
again rather than recovered.

Reads MONGO_URL and DB_NAME from the environment, the same as the server.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib import api_keys  # noqa: E402

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    sys.exit("needs motor — run this inside the backend environment")


def _db():
    url = os.environ.get("MONGO_URL")
    name = os.environ.get("DB_NAME")
    if not url or not name:
        sys.exit("MONGO_URL and DB_NAME must be set (same values the server uses)")
    return AsyncIOMotorClient(url)[name]


async def do_list(db) -> int:
    rows = await db[api_keys.COLLECTION].find(
        {}, {"_id": 0, "key_hash": 0}).sort("created_at", -1).to_list(200)
    if not rows:
        print("no API keys yet")
        return 0
    print(f"{'id':38} {'key':16} {'state':9} {'last used':20} label / scopes")
    for r in rows:
        state = "revoked" if r.get("revoked_at") else "active"
        print(f"{r['id']:38} {r.get('fingerprint',''):16} {state:9} "
              f"{str(r.get('last_used_at') or '—')[:19]:20} "
              f"{r.get('label','')}  [{', '.join(r.get('scopes') or [])}]")
    return 0


async def do_revoke(db, key_id: str) -> int:
    from datetime import datetime, timezone
    res = await db[api_keys.COLLECTION].update_one(
        {"id": key_id, "revoked_at": None},
        {"$set": {"revoked_at": datetime.now(timezone.utc).isoformat(),
                  "revoked_by": "mint_api_key.py"}})
    if res.matched_count == 0:
        print("no such key, or it was already revoked")
        return 1
    print(f"revoked {key_id}")
    return 0


async def do_mint(db, label: str, scopes, expires_at) -> int:
    try:
        doc, plaintext = api_keys.build_key_document(
            label, scopes, "mint_api_key.py", expires_at)
    except ValueError as e:
        print(e)
        return 1
    # The unique index on key_hash is the real guard against a collision; this
    # is here so the failure reads as something other than a stack trace.
    if await db[api_keys.COLLECTION].find_one({"key_hash": doc["key_hash"]}):
        print("generated a key that already exists — run again")
        return 1
    await db[api_keys.COLLECTION].insert_one(dict(doc))

    print()
    print("  key:     " + plaintext)
    print("  id:      " + doc["id"])
    print("  label:   " + doc["label"])
    print("  scopes:  " + ", ".join(doc["scopes"]))
    if expires_at:
        print("  expires: " + str(expires_at))
    print()
    print("  This is the only time the key is shown. Store it where the tool")
    print("  can read it and nowhere else:")
    print()
    print("      export SWUMKT_API_KEY=" + plaintext)
    print()
    print("  Revoke it with:  python backend/scripts/mint_api_key.py --revoke "
          + doc["id"])
    print()
    return 0


async def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--label", help="what this key is for — shown in listings")
    p.add_argument("--scope", action="append", dest="scopes", default=None,
                   help=f"repeatable; default {api_keys.WILDCARD}. "
                        f"valid: {', '.join(sorted(api_keys.SCOPES))}")
    p.add_argument("--expires-at", help="ISO timestamp; omit for no expiry")
    p.add_argument("--list", action="store_true", help="show existing keys")
    p.add_argument("--revoke", metavar="KEY_ID")
    a = p.parse_args()

    db = _db()
    if a.list:
        return await do_list(db)
    if a.revoke:
        return await do_revoke(db, a.revoke)
    if not a.label:
        p.error("--label is required when minting")
    return await do_mint(db, a.label, a.scopes or [api_keys.WILDCARD], a.expires_at)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
