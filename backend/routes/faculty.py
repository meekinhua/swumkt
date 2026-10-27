"""Faculty profiles and their publications.

A department's reputation is built out of the names of people a search engine
can find, and this site had none: no page per lecturer, no list of their
research, and articles with no byline that linked anywhere. This module is the
data half of fixing that; `routes/share.py` renders it for crawlers and
`frontend/src/pages/people/` renders it for readers.

Two collections, because papers are shared. "The power of human-like
virtual-influencer-generated content" has two of the department's lecturers on
it, and it should exist once — on both of their pages, counted once on the
publications page, with one canonical record to correct.

**Papers carry a confidence tier and only some tiers are shown.** The list was
seeded from OpenAlex and ORCID (see `backend/data/faculty_seed.json`), and an
automated index gets things wrong in ways that matter when the subject is a
real person's record: Thai titles arrive without their vowel marks, and
supervised student theses get indexed under the advisor. So:

    orcid   in the lecturer's own ORCID record           -> published
    doi     has a DOI, matched to this person at SWU     -> published
    venue   a named journal without a DOI (Thai journals) -> published
    review  anything else                                -> held, not shown

Nothing in `review` is public until a person changes its status.

Writes live under `/api/cms/...` so the scoped API keys (`cms.faculty.write`)
reach them and `sitectl` can edit a profile without a redeploy. Every write is
snapshotted for undo.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pymongo.errors import DuplicateKeyError

from lib.inline_media import externalize, rehydrate
from lib.ttl_cache import async_ttl_cache, invalidate_prefix

log = logging.getLogger(__name__)

PAPER_TYPES = ("article", "review", "conference", "chapter", "book",
               "preprint", "thesis", "other")
PAPER_STATUSES = ("published", "review", "hidden")
CONFIDENCE = ("orcid", "doi", "venue", "manual", "review")

# Editable fields. Anything else in a PATCH is refused rather than silently
# stored — a typo should fail loudly, not become a field nobody reads.
FACULTY_FIELDS = {
    "slug", "title_th", "name_th", "title_en", "name_en", "rank_th", "rank_en",
    "department_th", "department_en", "bio_th", "bio_en", "email", "photo",
    "photo_credit", "research_areas", "links", "sort_order", "status",
    "show_email",
}
PAPER_FIELDS = {
    "title", "title_th", "authors", "faculty_ids", "year", "venue", "type",
    "doi", "url", "pdf_url", "open_access", "cited_by", "cited_by_as_of",
    "status", "confidence", "review_note", "slug",
}

_LIST_CACHE = "get_faculty_routes.<locals>."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(text: str, fallback: str) -> str:
    s = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return s[:80].rstrip("-") or fallback


def display_name(f: Dict[str, Any], lang: str = "th") -> str:
    """Title and name joined the way each language writes them.

    Thai runs the academic title straight into the name —
    'ผู้ช่วยศาสตราจารย์กนกกาญจน์', 'รองศาสตราจารย์ ดร.อินทกะ' (that space is
    inside the title string) — which is how the department's own page writes
    them. English separates them: 'Associate Professor Dr. Intaka Piriyakul'.
    """
    title = (f.get(f"title_{lang}") or "").strip()
    name = (f.get(f"name_{lang}") or "").strip()
    if not title:
        return name
    return f"{title}{'' if lang == 'th' else ' '}{name}"


def public_faculty(f: Dict[str, Any]) -> Dict[str, Any]:
    """What a visitor may see of a faculty record."""
    out = {k: v for k, v in f.items()
           if k not in ("_id", "deleted_at", "source", "email")}
    # The address itself is not in any public listing: robots.txt now lets
    # crawlers fetch this JSON so the pages can render, which would make it a
    # convenient harvest source. The profile asks /faculty/{slug}/contact for
    # it when someone clicks, and robots.txt disallows that path.
    out["has_email"] = bool(f.get("email")) and f.get("show_email", True)
    out["display_name_th"] = display_name(f, "th")
    out["display_name_en"] = display_name(f, "en")
    return externalize(out, "faculty", f["id"])


def public_paper(p: Dict[str, Any], public_ids: Optional[set] = None) -> Dict[str, Any]:
    out = {k: v for k, v in p.items()
           if k not in ("_id", "review_note", "deleted_at", "source_id")}
    if public_ids is not None:
        # A draft or deleted colleague's id would reveal that a profile exists
        # before anyone has decided to publish it.
        out["faculty_ids"] = [i for i in p.get("faculty_ids", []) if i in public_ids]
    return out


def _reject_unknown(patch: Dict[str, Any], allowed: set, what: str) -> None:
    bad = sorted(k for k in patch if k not in allowed)
    if bad:
        raise HTTPException(
            400, f"unknown {what} field(s): {', '.join(bad)} — "
                 f"valid: {', '.join(sorted(allowed))}")


def get_faculty_routes(db, get_current_user, require_admin, snapshot=None) -> APIRouter:
    router = APIRouter(tags=["faculty"])

    def _invalidate():
        invalidate_prefix(_LIST_CACHE)
        invalidate_prefix("get_share_routes.<locals>._share_people")
        # Articles embed their authors' names and links; unpublishing a
        # lecturer must take the byline down with the profile.
        invalidate_prefix("get_cms_routes.<locals>._get_public_post_by_slug_cached")
        invalidate_prefix("get_share_routes.<locals>._share_learn")

    async def _snap(collection: str, doc_id: str, user, label: str):
        if snapshot:
            await snapshot(collection, doc_id,
                           getattr(user, "email", "unknown"), label)

    # ── public ───────────────────────────────────────────────────────────

    @router.get("/faculty")
    async def list_faculty():
        return await _list_faculty_cached()

    @async_ttl_cache(ttl_seconds=300)
    async def _list_faculty_cached():
        rows = await db.faculty.find(
            {"status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort([("sort_order", 1), ("name_th", 1)]).to_list(200)

        counts = {
            r["_id"]: r["n"]
            async for r in db.faculty_papers.aggregate([
                {"$match": {"status": "published", "deleted_at": {"$exists": False}}},
                {"$unwind": "$faculty_ids"},
                {"$group": {"_id": "$faculty_ids", "n": {"$sum": 1}}},
            ])
        }
        items = []
        for f in rows:
            pf = public_faculty(f)
            pf["paper_count"] = counts.get(f["id"], 0)
            items.append(pf)
        return {"items": items, "total": len(items)}

    @router.get("/faculty/{slug}")
    async def get_faculty(slug: str):
        return await _get_faculty_cached(slug)

    @async_ttl_cache(ttl_seconds=300)
    async def _get_faculty_cached(slug: str):
        f = await db.faculty.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0},
        )
        if not f:
            raise HTTPException(404, "Faculty member not found")

        papers = await db.faculty_papers.find(
            {"faculty_ids": f["id"], "status": "published",
             "deleted_at": {"$exists": False}},
            {"_id": 0},
        ).sort([("year", -1), ("title", 1)]).to_list(500)

        # Colleagues who co-wrote with this person, so the page can link to
        # them — internal links between people are what tie the department
        # together as one entity in a search engine's eyes.
        co_ids = {i for p in papers for i in p.get("faculty_ids", []) if i != f["id"]}
        colleagues = {}
        if co_ids:
            async for c in db.faculty.find(
                    {"id": {"$in": list(co_ids)}, "status": "published",
                     "deleted_at": {"$exists": False}},
                    {"_id": 0, "id": 1, "slug": 1, "title_th": 1, "name_th": 1,
                     "title_en": 1, "name_en": 1}):
                colleagues[c["id"]] = {
                    "slug": c["slug"],
                    # The bare name too: the frontend matches it against a
                    # paper's author list to emit a linked @id.
                    "name_en": c.get("name_en"),
                    "display_name_th": display_name(c, "th"),
                    "display_name_en": display_name(c, "en"),
                }

        articles = await db.cms_posts.find(
            {"author_faculty_ids": f["id"], "status": "published",
             "deleted_at": {"$exists": False}},
            {"_id": 0, "slug": 1, "title": 1, "excerpt": 1, "published_at": 1,
             "category": 1, "type": 1},
        ).sort("published_at", -1).to_list(50)

        public_ids = set(colleagues) | {f["id"]}
        return {
            "faculty": public_faculty(f),
            "papers": [public_paper(p, public_ids) for p in papers],
            "colleagues": colleagues,
            "articles": articles,
            "metrics": {
                "papers": len(papers),
                "citations": sum(int(p.get("cited_by") or 0) for p in papers),
                "open_access": sum(1 for p in papers if p.get("open_access")),
            },
        }

    @router.get("/faculty/{slug}/contact")
    async def get_faculty_contact(slug: str):
        """The address, on request. Kept out of every listing so that the JSON
        crawlers are now allowed to fetch is not also an address book.
        robots.txt disallows this path."""
        f = await db.faculty.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0, "email": 1, "show_email": 1})
        if not f or not f.get("email") or not f.get("show_email", True):
            raise HTTPException(404, "No public contact address")
        return {"email": f["email"]}

    @router.get("/publications")
    async def list_publications(
        year: Optional[int] = None,
        faculty: Optional[str] = Query(None, description="faculty slug"),
    ):
        return await _list_publications_cached(year, faculty)

    @async_ttl_cache(ttl_seconds=300)
    async def _list_publications_cached(year: Optional[int], faculty: Optional[str]):
        q: Dict[str, Any] = {"status": "published", "deleted_at": {"$exists": False}}
        if year:
            q["year"] = year
        people = await db.faculty.find(
            {"status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "slug": 1, "title_th": 1, "name_th": 1,
             "title_en": 1, "name_en": 1},
        ).to_list(200)
        by_id = {p["id"]: {"slug": p["slug"],
                           "display_name_th": display_name(p, "th"),
                           "display_name_en": display_name(p, "en")}
                 for p in people}
        if faculty:
            fid = next((p["id"] for p in people if p["slug"] == faculty), None)
            if not fid:
                return {"items": [], "total": 0, "faculty": by_id, "years": []}
            q["faculty_ids"] = fid
        else:
            # A paper is public only while at least one of its lecturers is.
            # Unpublishing or deleting a profile used to leave every one of
            # their papers listed here, attributed to nobody.
            q["faculty_ids"] = {"$in": list(by_id)}

        rows = await db.faculty_papers.find(q, {"_id": 0}).sort(
            [("year", -1), ("title", 1)]).to_list(2000)
        # Years from the same query minus the year filter, so choosing 2023
        # does not shrink the year list to just 2023 and trap the reader there.
        year_q = {k: v for k, v in q.items() if k != "year"}
        years = sorted(await db.faculty_papers.distinct("year", year_q) or [],
                       key=lambda y: -(y or 0))
        public_ids = set(by_id)
        return {"items": [public_paper(p, public_ids) for p in rows], "total": len(rows),
                "faculty": by_id, "years": [y for y in years if y]}

    # ── admin: faculty ───────────────────────────────────────────────────

    @router.get("/cms/faculty")
    async def admin_list_faculty(current_user=Depends(get_current_user)):
        require_admin(current_user)
        rows = await db.faculty.find(
            {"deleted_at": {"$exists": False}}, {"_id": 0},
        ).sort("sort_order", 1).to_list(500)
        return {"items": rows, "total": len(rows)}

    @router.post("/cms/faculty")
    async def admin_create_faculty(body: Dict[str, Any] = Body(...),
                                   current_user=Depends(get_current_user)):
        require_admin(current_user)
        _reject_unknown(body, FACULTY_FIELDS, "faculty")
        if not (body.get("name_th") or body.get("name_en")):
            raise HTTPException(400, "name_th or name_en is required")
        _check_faculty_values(body)
        slug = body.get("slug") or slugify(body.get("name_en") or "", f"f-{uuid.uuid4().hex[:6]}")
        if await db.faculty.find_one({"slug": slug, "deleted_at": {"$exists": False}}):
            raise HTTPException(409, f"slug '{slug}' is taken")
        # Not derived from the slug: a slug is freed by a delete or a rename
        # and can then be reused, and an id built from it collided with the
        # old record's — a 500 on create, and a slug nobody could ever take.
        doc = {
            "id": f"fac-{uuid.uuid4().hex[:10]}",
            **body,
            "slug": slug,
            # New profiles start hidden: a page about a real person should be
            # looked at before it is public.
            "status": body.get("status", "draft"),
            "research_areas": body.get("research_areas") or [],
            "links": body.get("links") or {},
            "created_at": _now(),
            "updated_at": _now(),
        }
        try:
            await db.faculty.insert_one(dict(doc))
        except DuplicateKeyError:
            raise HTTPException(409, "that profile already exists")
        _invalidate()
        doc.pop("_id", None)
        return doc

    @router.post("/cms/faculty/seed")
    async def admin_seed_faculty(dry_run: bool = Query(False),
                                 current_user=Depends(get_current_user)):
        """Load `data/faculty_seed.json`, insert-only.

        The CLI script cannot be run against production from here, so the same
        function is exposed to a signed-in admin. Insert-only, so pressing it
        twice cannot overwrite a profile a lecturer has since corrected.
        """
        require_admin(current_user)
        import sys as _sys
        from pathlib import Path as _Path
        _sys.path.insert(0, str(_Path(__file__).resolve().parents[1]))
        from scripts.seed_faculty import apply_seed, load_seed
        try:
            data = load_seed()
        except FileNotFoundError:
            raise HTTPException(500, "faculty_seed.json is missing from this build")
        result = await apply_seed(db, data, dry_run)
        if not dry_run:
            _invalidate()
            log.info("[FACULTY-SEED] %s added %d faculty, %d papers",
                     getattr(current_user, "email", "?"),
                     result["added_faculty"], result["added_papers"])
        return result

    @router.patch("/cms/faculty/{fid}")
    async def admin_patch_faculty(fid: str, body: Dict[str, Any] = Body(...),
                                  current_user=Depends(get_current_user)):
        require_admin(current_user)
        _reject_unknown(body, FACULTY_FIELDS, "faculty")
        cur = await db.faculty.find_one({"id": fid, "deleted_at": {"$exists": False}},
                                        {"_id": 0})
        if not cur:
            raise HTTPException(404, "Faculty member not found")
        if "status" in body and body["status"] not in ("draft", "published"):
            raise HTTPException(400, "status must be draft or published")
        _check_faculty_values(body)
        if "slug" in body and body["slug"] != cur["slug"]:
            if await db.faculty.find_one({"slug": body["slug"], "id": {"$ne": fid}}):
                raise HTTPException(409, f"slug '{body['slug']}' is taken")

        upd = dict(body)
        # `links` merges rather than replaces, so setting the Scholar URL does
        # not wipe the ORCID one.
        if isinstance(upd.get("links"), dict):
            upd["links"] = {**(cur.get("links") or {}), **upd["links"]}
            upd["links"] = {k: v for k, v in upd["links"].items() if v}
        # A client echoing back the /api/media/... URL it was served must not
        # overwrite an uploaded portrait with a pointer to itself.
        upd = rehydrate(upd, cur)
        upd["updated_at"] = _now()

        await _snap("faculty", fid, current_user, "faculty edit")
        await db.faculty.update_one({"id": fid}, {"$set": upd})
        _invalidate()
        return await db.faculty.find_one({"id": fid}, {"_id": 0})

    @router.delete("/cms/faculty/{fid}")
    async def admin_delete_faculty(fid: str, current_user=Depends(get_current_user)):
        """Soft delete — the record and its revisions survive."""
        require_admin(current_user)
        await _snap("faculty", fid, current_user, "before faculty delete")
        res = await db.faculty.update_one(
            {"id": fid, "deleted_at": {"$exists": False}},
            {"$set": {"deleted_at": _now()}})
        if res.matched_count == 0:
            raise HTTPException(404, "Faculty member not found")
        _invalidate()
        return {"deleted": fid}

    # ── admin: papers ────────────────────────────────────────────────────

    @router.get("/cms/papers")
    async def admin_list_papers(
        status: Optional[str] = Query(None, description="published | review | hidden"),
        faculty_id: Optional[str] = None,
        current_user=Depends(get_current_user),
    ):
        require_admin(current_user)
        q: Dict[str, Any] = {"deleted_at": {"$exists": False}}
        if status:
            q["status"] = status
        if faculty_id:
            q["faculty_ids"] = faculty_id
        rows = await db.faculty_papers.find(q, {"_id": 0}).sort(
            [("year", -1), ("title", 1)]).to_list(2000)
        return {"items": rows, "total": len(rows)}

    @router.post("/cms/papers")
    async def admin_create_paper(body: Dict[str, Any] = Body(...),
                                 current_user=Depends(get_current_user)):
        require_admin(current_user)
        _reject_unknown(body, PAPER_FIELDS, "paper")
        if not body.get("title"):
            raise HTTPException(400, "title is required")
        if not body.get("faculty_ids"):
            raise HTTPException(400, "faculty_ids is required — whose paper is it?")
        body["faculty_ids"] = _dedupe(body["faculty_ids"])
        await _check_faculty_ids(body["faculty_ids"])
        _check_paper_values(body)
        # Marking a paper as needing review and then publishing it by default
        # would contradict itself.
        if body.get("confidence") == "review":
            body.setdefault("status", "review")

        doi = _clean_doi(body.get("doi"))
        if doi and await db.faculty_papers.find_one(
                {"doi": doi, "deleted_at": {"$exists": False}}):
            raise HTTPException(
                409, f"a paper with DOI {doi} exists — add the lecturer to its "
                     f"faculty_ids instead of creating a duplicate")
        pid = f"pap-{uuid.uuid4().hex[:10]}"
        doc = {
            "id": pid,
            "slug": body.get("slug") or slugify(body["title"], pid),
            "authors": [],
            "type": "article",
            "open_access": False,
            "cited_by": 0,
            "confidence": "manual",
            # A paper someone typed in themselves is as trustworthy as the
            # person who typed it, so manual entries publish by default.
            "status": "published",
            "source": "manual",
            **body,
            "doi": doi,
            "url": body.get("url") or (f"https://doi.org/{doi}" if doi else None),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.faculty_papers.insert_one(dict(doc))
        _invalidate()
        doc.pop("_id", None)
        return doc

    @router.patch("/cms/papers/{pid}")
    async def admin_patch_paper(pid: str, body: Dict[str, Any] = Body(...),
                                current_user=Depends(get_current_user)):
        require_admin(current_user)
        _reject_unknown(body, PAPER_FIELDS, "paper")
        cur = await db.faculty_papers.find_one(
            {"id": pid, "deleted_at": {"$exists": False}}, {"_id": 0})
        if not cur:
            raise HTTPException(404, "Paper not found")
        if "faculty_ids" in body:
            if not body["faculty_ids"]:
                raise HTTPException(400, "a paper must belong to at least one lecturer")
            body["faculty_ids"] = _dedupe(body["faculty_ids"])
            # Ids already on the paper are kept even if that lecturer has
            # since been deleted, so adding a co-author by sending the whole
            # list does not fail on someone else's history.
            await _check_faculty_ids(
                [i for i in body["faculty_ids"] if i not in (cur.get("faculty_ids") or [])])
        _check_paper_values(body)

        upd = dict(body)
        if "doi" in upd:
            upd["doi"] = _clean_doi(upd["doi"])
            if upd["doi"] and await db.faculty_papers.find_one(
                    {"doi": upd["doi"], "id": {"$ne": pid},
                     "deleted_at": {"$exists": False}}):
                raise HTTPException(
                    409, f"another paper already has DOI {upd['doi']} — add the "
                         f"lecturer to that one instead")
            # The link followed the old DOI; if it was just the resolver URL,
            # it follows the new one too.
            old_doi = cur.get("doi")
            if "url" not in upd and (not cur.get("url") or
                                     (old_doi and cur["url"] == f"https://doi.org/{old_doi}")):
                upd["url"] = f"https://doi.org/{upd['doi']}" if upd["doi"] else None
        # Publishing a held paper is a human vouching for it.
        if upd.get("status") == "published" and cur.get("status") == "review":
            upd.setdefault("confidence", "manual")
            upd.setdefault("review_note", None)
        upd["updated_at"] = _now()

        await _snap("faculty_papers", pid, current_user, "paper edit")
        await db.faculty_papers.update_one({"id": pid}, {"$set": upd})
        _invalidate()
        return await db.faculty_papers.find_one({"id": pid}, {"_id": 0})

    @router.delete("/cms/papers/{pid}")
    async def admin_delete_paper(pid: str, current_user=Depends(get_current_user)):
        require_admin(current_user)
        await _snap("faculty_papers", pid, current_user, "before paper delete")
        res = await db.faculty_papers.update_one(
            {"id": pid, "deleted_at": {"$exists": False}},
            {"$set": {"deleted_at": _now()}})
        if res.matched_count == 0:
            raise HTTPException(404, "Paper not found")
        _invalidate()
        return {"deleted": pid}

    async def _check_faculty_ids(ids: List[str]) -> None:
        if not isinstance(ids, list) or not all(isinstance(i, str) for i in ids):
            raise HTTPException(400, "faculty_ids must be a list of faculty ids")
        found = {f["id"] async for f in db.faculty.find(
            {"id": {"$in": ids}, "deleted_at": {"$exists": False}}, {"id": 1})}
        missing = [i for i in ids if i not in found]
        if missing:
            raise HTTPException(400, f"no such faculty: {', '.join(missing)}")

    return router


_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_LINK_KEYS = {"orcid", "scholar", "scopus", "researchgate", "openalex",
              "linkedin", "cv", "department", "website"}


def _dedupe(ids: List[str]) -> List[str]:
    """Keep order, drop repeats — a lecturer listed twice was counted twice."""
    seen, out = set(), []
    for i in ids or []:
        if i not in seen:
            seen.add(i)
            out.append(i)
    return out


def _check_faculty_values(body: Dict[str, Any]) -> None:
    """Shape checks. The share bridge and the profile page index into these
    fields, so a malformed value saved here is a 500 there."""
    if "slug" in body and not (isinstance(body["slug"], str) and len(body["slug"]) <= 80
                               and _SLUG_RE.match(body["slug"])):
        raise HTTPException(400, "slug must be lowercase letters, digits and single hyphens")
    if "links" in body:
        links = body["links"]
        if not isinstance(links, dict):
            raise HTTPException(400, "links must be an object of name -> URL")
        for k, v in links.items():
            if k not in _LINK_KEYS:
                raise HTTPException(
                    400, f"unknown link '{k}' — valid: {', '.join(sorted(_LINK_KEYS))}")
            if v is not None and not (isinstance(v, str) and re.match(r"^https?://", v)):
                raise HTTPException(400, f"links.{k} must be an http(s) URL or null")
    if "research_areas" in body:
        areas = body["research_areas"]
        ok = isinstance(areas, list) and all(
            isinstance(a, dict) and a and set(a) <= {"th", "en"}
            and all(isinstance(x, str) for x in a.values())
            for a in areas)
        if not ok:
            raise HTTPException(400, 'research_areas must be a list of {"th": ..., "en": ...}')
    for name in ("name_th", "name_en", "title_th", "title_en", "bio_th", "bio_en"):
        if name in body and body[name] is not None and not isinstance(body[name], str):
            raise HTTPException(400, f"{name} must be text")
    if "show_email" in body and not isinstance(body["show_email"], bool):
        raise HTTPException(400, "show_email must be true or false")


def _clean_doi(doi: Optional[str]) -> Optional[str]:
    """Store the bare DOI. People paste the resolver URL as often as not."""
    if not doi:
        return None
    d = str(doi).strip()
    d = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:\s*)", "", d, flags=re.I)
    return d.lower() or None


def _check_paper_values(body: Dict[str, Any]) -> None:
    if "type" in body and body["type"] not in PAPER_TYPES:
        raise HTTPException(400, f"type must be one of {', '.join(PAPER_TYPES)}")
    if "status" in body and body["status"] not in PAPER_STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(PAPER_STATUSES)}")
    if "confidence" in body and body["confidence"] not in CONFIDENCE:
        raise HTTPException(400, f"confidence must be one of {', '.join(CONFIDENCE)}")
    if "year" in body and body["year"] is not None:
        try:
            y = int(body["year"])
        except (TypeError, ValueError):
            raise HTTPException(400, "year must be a number")
        if not 1950 <= y <= datetime.now(timezone.utc).year + 1:
            raise HTTPException(400, f"year {y} is not plausible")
        body["year"] = y
    if "authors" in body and not isinstance(body["authors"], list):
        raise HTTPException(400, "authors must be a list of names")
