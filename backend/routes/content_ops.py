"""Content operations — what makes the site editable after it is deployed.

The CMS already covers the homepage document and every post, so most *content*
could always be changed without a redeploy. Three things stopped that from
being usable by an agent working from a terminal, and this module supplies
them.

**Partial writes.** `PUT /api/cms/landing` takes `LandingDoc`, a whole-document
model, and `update_landing` does `model_dump()` then `$set`. A body that omits
`featured_articles` therefore writes `null` over it, and `get_landing` only
backfills a key that is *absent*, so the null sticks and the homepage gets
`None` where it expects a config. Anyone asked to "change the hero headline"
will naturally send just the hero. `PATCH /api/cms/landing` deep-merges instead,
so you send what you are changing and nothing else moves.

**Undo.** There was no revision history anywhere — and `POST /landing/reset`
does `delete_many` then `insert_one`, destroying the current document with no
copy kept. Every write through this module snapshots the *prior* document into
`cms_revisions` first, so "ย้อนกลับอันเมื่อกี้" means something.

**A place to put strings.** There was no settings collection at all, and
`LandingDoc` is a closed model with four named sections, so making any new
string editable was a schema change and a redeploy. `cms_site_settings` is one
open document: write any key, read it from the frontend with a fallback to the
value that is compiled in today. Nothing breaks when a key is missing, which is
what lets strings be migrated one at a time.

Concurrency: the landing document carries a `version` that every write bumps.
Send `If-Match: <version>` to be told (409) that someone edited it since you
read it, rather than silently overwriting an admin who is in the browser.
"""
from __future__ import annotations

import copy
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Request

from lib import api_keys
from lib.inline_media import rehydrate
from lib.ttl_cache import async_ttl_cache, invalidate_prefix

log = logging.getLogger(__name__)

# Keep the history useful without letting it grow without bound.
MAX_REVISIONS_PER_DOC = 50

# A settings document is for strings and flags. Images belong in the media
# pipeline, and a base64 blob in here would be shipped on every page load.
MAX_SETTINGS_BYTES = 256 * 1024

# Revisions store whole documents, and a landing document with inline hero
# images is ~2 MB, so a count cap alone lets history outgrow the content it is
# protecting. Trim on whichever limit bites first.
MAX_REVISION_BYTES_PER_DOC = 40 * 1024 * 1024

# Which field identifies a document, per collection. This was a
# landing-or-not ternary, which silently sent `cms_site_settings` — keyed by
# `key`, like landing — down the `id` branch, so every settings write looked
# up a document that could not exist, recorded no revision, and left the
# settings document the one thing in here with no undo.
_KEY_FIELD = {
    "cms_landing": "key",
    "cms_site_settings": "key",
}

# `doc=` in the revisions API, to (collection, id).
_REVISION_DOCS = {
    "landing": ("cms_landing", "home"),
    "settings": ("cms_site_settings", "site"),
}


# The write scope a key needs to restore a revision of each collection.
_RESTORE_SCOPE = {
    "cms_landing": "cms.landing.write",
    "cms_site_settings": "cms.settings.write",
    "cms_posts": "cms.posts.write",
    "faculty": "cms.faculty.write",
    "faculty_papers": "cms.faculty.write",
}


def _key_field(collection: str) -> str:
    return _KEY_FIELD.get(collection, "id")


def _revision_target(doc: str):
    """`doc=` to (collection, id). Faculty and paper ids carry a prefix, so
    they can be told apart from post ids without a second parameter."""
    if doc in _REVISION_DOCS:
        return _REVISION_DOCS[doc]
    if doc.startswith("fac-"):
        return "faculty", doc
    if doc.startswith("pap-"):
        return "faculty_papers", doc
    return "cms_posts", doc


class SnapshotFailed(Exception):
    """The prior document could not be stored.

    Distinguished from "there was nothing to store" so that the two writes
    which destroy data outright can refuse to proceed, while an ordinary edit
    still goes through — losing a history entry must not block a headline
    change, but it must block a purge.
    """

LANDING_CACHE = "get_cms_routes.<locals>._get_landing_cached"
SETTINGS_CACHE = "get_content_ops_routes.<locals>._get_settings_cached"


def deep_merge(base: Any, patch: Any) -> Any:
    """Merge `patch` into `base`, recursing into dicts only.

    Lists are replaced wholesale. Merging them by index reads well in a
    docstring and goes wrong the first time someone deletes a slide: index 1 of
    the patch would land on what is now a different slide. Replacing means "send
    the whole list when you change the list", which is unambiguous.
    """
    if isinstance(base, dict) and isinstance(patch, dict):
        out = dict(base)
        for k, v in patch.items():
            out[k] = deep_merge(base.get(k), v) if k in base else v
        return out
    return patch


def set_by_path(doc: Dict[str, Any], path: str, value: Any) -> Dict[str, Any]:
    """Build the nested patch for one dotted path — `slides.0.lede` etc.

    Returns a patch object, not a mutated document, so the caller can hand it
    to `deep_merge` and keep the same code path as a whole-object patch.
    """
    segs = path.split(".")
    if any(seg.isdigit() for seg in segs):
        # Lists are replaced whole by `deep_merge`, so a patch built around a
        # single index would drop every other element. The client rebuilds the
        # surrounding list instead (see sitectl.patch_for).
        raise HTTPException(
            400, f"'{path}' indexes a list — send the whole list instead")
    patch: Any = value
    for seg in reversed(segs):
        patch = {seg: patch}
    return patch


def _approx_size(obj: Any) -> int:
    import json
    return len(json.dumps(obj, ensure_ascii=False).encode("utf-8"))


def get_content_ops_routes(db, get_current_user, require_admin) -> APIRouter:
    router = APIRouter(prefix="/cms", tags=["content-ops"])

    # ---- revisions -------------------------------------------------------

    async def snapshot(collection: str, doc_id: str, actor: str,
                       label: str = "", required: bool = False) -> Optional[str]:
        """Store the current state of a document before it is overwritten.

        Returns the revision id, or None when the document does not exist yet
        — there is nothing to preserve, which is a normal state, not an error.

        `required=True` is for the two writes that destroy data outright
        (purge, landing reset): they raise `SnapshotFailed` rather than go
        ahead blind. Ordinary edits leave it False, so a history failure is
        logged and swallowed and the user's edit still happens.
        """
        import uuid
        from datetime import datetime, timezone
        try:
            current = await db[collection].find_one(
                {_key_field(collection): doc_id}, {"_id": 0})
            if not current:
                return None
            rev_id = str(uuid.uuid4())
            await db.cms_revisions.insert_one({
                "id": rev_id,
                "collection": collection,
                "doc_id": doc_id,
                "actor": actor,
                "label": label,
                "saved_at": datetime.now(timezone.utc).isoformat(),
                "size": _approx_size(current),
                "document": current,
            })
            await _trim_revisions(collection, doc_id)
            return rev_id
        except Exception as e:
            log.warning("[CONTENT_OPS] snapshot failed for %s/%s",
                        collection, doc_id, exc_info=True)
            if required:
                raise SnapshotFailed(str(e))
            return None

    async def _trim_revisions(collection: str, doc_id: str) -> None:
        """Keep history bounded by count and by total bytes.

        Count alone is not enough while images still live inside the
        documents: fifty revisions of a 2 MB landing document is 100 MB of
        history for a page that is mostly three paragraphs of text.
        """
        rows = await db.cms_revisions.find(
            {"collection": collection, "doc_id": doc_id},
            {"_id": 0, "id": 1, "size": 1},
        ).sort("saved_at", -1).to_list(MAX_REVISIONS_PER_DOC + 200)

        keep, running = [], 0
        for r in rows:
            running += int(r.get("size") or 0)
            if len(keep) >= MAX_REVISIONS_PER_DOC or (
                    keep and running > MAX_REVISION_BYTES_PER_DOC):
                break
            keep.append(r["id"])
        stale = [r["id"] for r in rows if r["id"] not in set(keep)]
        if stale:
            await db.cms_revisions.delete_many({"id": {"$in": stale}})

    router.snapshot = snapshot  # so cms.py can reuse it
    router.SnapshotFailed = SnapshotFailed

    @router.get("/revisions")
    async def list_revisions(
        doc: str = Query("landing", description="'landing', 'settings', or a post id"),
        limit: int = Query(20, le=MAX_REVISIONS_PER_DOC),
        current_user=Depends(get_current_user),
    ):
        require_admin(current_user)
        collection, doc_id = _revision_target(doc)
        rows = await db.cms_revisions.find(
            {"collection": collection, "doc_id": doc_id},
            # The stored document can be megabytes; a listing needs none of it.
            {"_id": 0, "document": 0},
        ).sort("saved_at", -1).to_list(limit)
        return {"items": rows, "total": len(rows)}

    @router.post("/revisions/{rev_id}/restore")
    async def restore_revision(rev_id: str, request: Request,
                               current_user=Depends(get_current_user)):
        require_admin(current_user)
        rev = await db.cms_revisions.find_one({"id": rev_id}, {"_id": 0})
        if not rev:
            raise HTTPException(404, "Revision not found")

        collection, doc_id = rev["collection"], rev["doc_id"]
        # A restore is a write to whatever the revision belongs to, so a key
        # also needs that collection's write scope. Without this, a key scoped
        # only to `cms.revisions.restore` could republish a paper someone had
        # deliberately hidden.
        scopes = getattr(request.state, "api_key_scopes", None)
        if scopes is not None:
            needed = _RESTORE_SCOPE.get(collection)
            if not needed or not api_keys.scope_allows(scopes, needed):
                raise HTTPException(
                    403, f"restoring {collection} needs the '{needed}' scope as well")
        key = _key_field(collection)
        # Restoring is itself a change worth being able to undo.
        await snapshot(collection, doc_id, _actor(current_user),
                       f"before restoring {rev_id[:8]}")

        document = dict(rev["document"])
        document.pop("_id", None)
        document["version"] = int(
            (await db[collection].find_one({key: doc_id}, {"version": 1}) or {}).get("version", 0)
        ) + 1
        await db[collection].replace_one({key: doc_id}, document, upsert=True)
        _invalidate_all()
        return {"restored": rev_id, "collection": collection, "doc_id": doc_id,
                "version": document["version"]}

    # ---- site settings ---------------------------------------------------

    @router.get("/settings")
    async def get_settings():
        """Public — the frontend reads this to fill strings that used to be
        compiled in. Every consumer falls back to its built-in value, so an
        empty document is a valid state and the site renders unchanged."""
        return await _get_settings_cached()

    @async_ttl_cache(ttl_seconds=60)
    async def _get_settings_cached():
        doc = await db.cms_site_settings.find_one({"key": "site"}, {"_id": 0})
        return doc or {"key": "site"}

    @router.patch("/settings")
    async def patch_settings(
        patch: Dict[str, Any] = Body(...),
        current_user=Depends(get_current_user),
    ):
        require_admin(current_user)
        if not isinstance(patch, dict) or not patch:
            raise HTTPException(400, "patch must be a non-empty object")

        _reject_reserved_keys(patch)
        current = await db.cms_site_settings.find_one({"key": "site"}, {"_id": 0}) or {"key": "site"}
        merged = deep_merge(current, patch)
        merged["key"] = "site"
        if _approx_size(merged) > MAX_SETTINGS_BYTES:
            raise HTTPException(
                413, "settings document too large — images belong in the CMS, not here")

        await snapshot("cms_site_settings", "site", _actor(current_user), "settings patch")
        await db.cms_site_settings.replace_one({"key": "site"}, merged, upsert=True)
        invalidate_prefix(SETTINGS_CACHE)
        return merged

    @router.delete("/settings")
    async def unset_setting(
        path: str = Query(..., description="dotted path to remove"),
        current_user=Depends(get_current_user),
    ):
        """Drop an override so the string falls back to the one compiled in.

        Needed because patching a key to `""` is not the same thing: the
        frontend ignores an empty string (a blank heading is almost always a
        half-finished edit), so the only way back to the built-in wording is to
        remove the key entirely.
        """
        require_admin(current_user)
        if path == "key" or not path:
            raise HTTPException(400, "refusing to remove the document key")

        current = await db.cms_site_settings.find_one({"key": "site"}, {"_id": 0})
        if not current:
            raise HTTPException(404, "no settings document")

        segs = path.split(".")
        parent: Any = current
        for seg in segs[:-1]:
            if isinstance(parent, dict) and seg in parent:
                parent = parent[seg]
            elif isinstance(parent, list) and seg.isdigit() and int(seg) < len(parent):
                parent = parent[int(seg)]
            else:
                raise HTTPException(404, f"'{path}' is not set")
        leaf = segs[-1]
        if isinstance(parent, dict) and leaf in parent:
            await snapshot("cms_site_settings", "site", _actor(current_user),
                           f"unset {path}")
            parent.pop(leaf)
        elif isinstance(parent, list) and leaf.isdigit() and int(leaf) < len(parent):
            await snapshot("cms_site_settings", "site", _actor(current_user),
                           f"unset {path}")
            parent.pop(int(leaf))
        else:
            raise HTTPException(404, f"'{path}' is not set")

        await db.cms_site_settings.replace_one({"key": "site"}, current, upsert=True)
        invalidate_prefix(SETTINGS_CACHE)
        return {"unset": path}

    # ---- landing, partially -----------------------------------------------

    @router.patch("/landing")
    async def patch_landing(
        patch: Dict[str, Any] = Body(...),
        if_match: Optional[str] = Header(None, alias="If-Match"),
        current_user=Depends(get_current_user),
    ):
        """Change part of the homepage document without touching the rest.

        `PUT` replaces the whole document and nulls anything you leave out.
        This merges, so `{"knowledge_hub": {"heading": "..."}}` changes one
        heading and leaves the band's other fields, the slides, the tool cards
        and the featured-article config exactly as they were.
        """
        require_admin(current_user)
        if not isinstance(patch, dict) or not patch:
            raise HTTPException(400, "patch must be a non-empty object")

        current = await db.cms_landing.find_one({"key": "home"}, {"_id": 0})
        if not current:
            raise HTTPException(404, "landing document not found — GET /api/cms/landing first")

        version = int(current.get("version", 0))
        if if_match is not None and if_match.strip('"') != str(version):
            raise HTTPException(
                409,
                f"landing was changed by someone else (now version {version}, "
                f"you have {if_match}) — re-read it and re-apply your change")

        _reject_reserved_keys(patch)
        merged = deep_merge(current, patch)
        # The patch may carry /api/media/... URLs the client read back from us.
        merged = rehydrate(merged, current)
        merged["key"] = "home"
        merged["version"] = version + 1

        # The merge is structure-blind, so `landing set slides "oops"` would
        # otherwise store a string where the homepage expects a list and the
        # page would render empty. Validate the result against the same model
        # the full PUT uses before anything is written.
        _validate_landing(merged)

        await snapshot("cms_landing", "home", _actor(current_user), "landing patch")
        # Conditional on the version we read, so the check above cannot be
        # overtaken between reading and writing by an admin saving in the UI.
        res = await db.cms_landing.replace_one(
            {"key": "home", "version": version}, merged)
        if res.matched_count == 0:
            # Either someone wrote in between, or the document predates
            # versioning (no `version` field at all) — retry once against the
            # unversioned document, which is only possible before the first
            # write through this route.
            if version != 0 or await db.cms_landing.count_documents(
                    {"key": "home", "version": {"$exists": True}}):
                raise HTTPException(
                    409, "landing changed while this edit was being applied — "
                         "re-read it and re-apply")
            await db.cms_landing.replace_one({"key": "home"}, merged, upsert=True)
        invalidate_prefix(LANDING_CACHE)
        return {"version": merged["version"], "changed": sorted(patch.keys())}

    # ---- API keys ----------------------------------------------------------
    # `/cms/keys` is in `api_keys.HARD_DENY`, so these are reachable with a
    # signed-in admin only. A key cannot mint another key or revoke itself.

    @router.get("/keys")
    async def list_keys(current_user=Depends(get_current_user)):
        _require_human_admin(current_user)
        rows = await db[api_keys.COLLECTION].find(
            {}, {"_id": 0, "key_hash": 0},
        ).sort("created_at", -1).to_list(100)
        return {"items": rows, "scopes": api_keys.SCOPES, "wildcard": api_keys.WILDCARD}

    @router.post("/keys")
    async def create_key(
        body: Dict[str, Any] = Body(...),
        current_user=Depends(get_current_user),
    ):
        """Mint a key. The plaintext is in this response and nowhere else."""
        _require_human_admin(current_user)
        label = str(body.get("label") or "").strip()
        if not label:
            raise HTTPException(400, "a label is required — it is how you revoke it later")
        try:
            scopes = api_keys.normalise_scopes(body.get("scopes") or [])
        except ValueError as e:
            raise HTTPException(400, str(e))

        try:
            doc, plaintext = api_keys.build_key_document(
                label, scopes, _actor(current_user), body.get("expires_at"))
        except ValueError as e:
            raise HTTPException(400, f"expires_at: {e}")
        await db[api_keys.COLLECTION].insert_one(dict(doc))
        log.info("[API_KEYS] %s minted key %s (%s) scopes=%s",
                 _actor(current_user), doc["fingerprint"], label, scopes)
        return {
            "key": plaintext,
            "warning": "shown once — store it now; it cannot be recovered",
            **{k: v for k, v in doc.items() if k != "key_hash"},
        }

    @router.delete("/keys/{key_id}")
    async def revoke_key(key_id: str, current_user=Depends(get_current_user)):
        """Revoke rather than delete, so the audit trail survives."""
        _require_human_admin(current_user)
        from datetime import datetime, timezone
        res = await db[api_keys.COLLECTION].update_one(
            {"id": key_id, "revoked_at": None},
            {"$set": {"revoked_at": datetime.now(timezone.utc).isoformat(),
                      "revoked_by": _actor(current_user)}})
        if res.matched_count == 0:
            raise HTTPException(404, "no such key, or it was already revoked")
        log.info("[API_KEYS] %s revoked key %s", _actor(current_user), key_id)
        return {"revoked": key_id}

    # ---- cache -------------------------------------------------------------

    def _invalidate_all():
        for prefix in (LANDING_CACHE, SETTINGS_CACHE,
                       "get_cms_routes.<locals>._list_public_posts_cached",
                       "get_cms_routes.<locals>._list_pinned_announcements_cached",
                       "get_cms_routes.<locals>._get_public_post_by_slug_cached",
                       # a restored faculty or paper revision must show too
                       "get_faculty_routes.<locals>.",
                       "get_share_routes.<locals>"):
            invalidate_prefix(prefix)

    @router.post("/cache/flush")
    async def flush_cache(current_user=Depends(get_current_user)):
        """Drop every public TTL cache in this process.

        Caveat worth knowing before relying on it: `lib/ttl_cache` is a plain
        module-level dict, so this clears the worker that happens to serve the
        request. With more than one uvicorn worker or replica, the others keep
        serving their own copy until it expires on its own (60–300s).
        """
        require_admin(current_user)
        _invalidate_all()
        return {"flushed": True,
                "note": "per-process — other workers expire on their own TTL"}

    return router


def _require_human_admin(user) -> None:
    """Admin *and* not an API key.

    `api_keys.HARD_DENY` already blocks `/cms/keys` so a key cannot get here,
    but key management is exactly the place not to rely on one check: a rule
    edited in the wrong direction would otherwise let a key escalate itself.
    """
    if getattr(user, "role", None) != "admin":
        raise HTTPException(403, "Admin only")
    if getattr(user, "auth_method", None) == "api_key":
        raise HTTPException(403, "API keys cannot manage API keys — sign in as an admin")


def _reject_reserved_keys(patch: Dict[str, Any]) -> None:
    """`_id` and `$`-prefixed keys would make the write fail after the
    snapshot had already been taken, leaving a revision for a change that
    never happened."""
    bad = [k for k in patch if k == "_id" or str(k).startswith("$")]
    if bad:
        raise HTTPException(400, f"reserved key(s) in patch: {', '.join(bad)}")


def _validate_landing(merged: Dict[str, Any]) -> None:
    """Check the merged document still satisfies the homepage's model.

    Imported here rather than at module scope: `routes.cms` imports nothing
    from this module today and a top-level import would make that circular the
    first time it does.
    """
    from routes.cms import LandingDoc
    payload = {k: v for k, v in merged.items()
               if k not in ("key", "version", "updated_at", "_id")}
    try:
        LandingDoc(**payload)
    except Exception as e:
        raise HTTPException(422, f"patch would make the landing document invalid: {e}")


def _actor(user) -> str:
    for attr in ("email", "id"):
        v = getattr(user, attr, None) or (user.get(attr) if isinstance(user, dict) else None)
        if v:
            return str(v)
    return "unknown"
