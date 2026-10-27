"""
Share — Social Media Preview (Open Graph / Twitter Card) endpoints
==================================================================
Crawlers (Facebook, LINE, Twitter, WhatsApp, Slack, Telegram, Discord) DO NOT
execute JavaScript. The React SPA's `useDocumentMeta` hook injects OG tags
client-side, so when the URL `/showcase/{token}` or `/learn/{slug}` is shared,
the bot only sees the static defaults from `index.html`.

This router serves a small, OG-rich HTML page at `/api/share/...` that:
  1. Includes per-resource OG / Twitter meta tags (title + CTA + image)
  2. Auto-redirects humans via `<meta http-equiv="refresh">` to the actual
     React route. Crawlers ignore meta-refresh and just keep the OG.

Usage from frontend:
  - "Copy showcase URL"  → copy `<origin>/api/share/showcase/{token}`
  - Article "Share"      → copy `<origin>/api/share/learn/{slug}`
"""

import base64
import binascii
import html as _html
import re
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, Response

from lib.ttl_cache import async_ttl_cache

share_router = APIRouter(prefix="/share", tags=["Share"])

SWUMKT_LOGO_URL = (
    "https://customer-assets.emergentagent.com/job_swu-market/artifacts/"
    "ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png"
)
SITE_NAME = "SWU · Marketing Research"

# Brand Health tiers — kept in sync with /app/frontend/src/lib/brandHealthVerdict.js
TIERS = [
    {"min": 80, "label": "Champion", "label_th": "ผู้นำตลาด",   "note": "Top of mind · สร้าง defensive moat ได้"},
    {"min": 65, "label": "Strong",   "label_th": "แข็งแกร่ง",   "note": "แบรนด์มี loyalty + identity ชัด"},
    {"min": 50, "label": "Healthy",  "label_th": "สุขภาพดี",     "note": "มี base ดี · ต้องปั้น edge เพิ่ม"},
    {"min": 35, "label": "At Watch", "label_th": "เฝ้าระวัง",    "note": "สัญญาณอ่อนใน 1-2 มิติ ต้องลงมือ"},
    {"min": 0,  "label": "At Risk",  "label_th": "เสี่ยง",        "note": "หลุดจากใจลูกค้าเร็ว · ต้อง reposition"},
]


def _tier_for(score: float) -> Dict[str, Any]:
    v = float(score or 0)
    for t in TIERS:
        if v >= t["min"]:
            return t
    return TIERS[-1]


def _esc(s: Any) -> str:
    if s is None:
        return ""
    return _html.escape(str(s), quote=True)


def _truncate(text: str, n: int = 200) -> str:
    text = (text or "").strip()
    if len(text) <= n:
        return text
    return text[: n - 1].rstrip() + "…"


def _strip_md(text: str) -> str:
    """Strip basic Markdown so excerpt is clean for OG description."""
    t = text or ""
    t = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", t)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)
    t = re.sub(r"^#+\s+", "", t, flags=re.MULTILINE)
    t = re.sub(r"(\*\*|__|[*_~`>])", "", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _request_origin(request: Request) -> str:
    """Best-effort origin (scheme://host) honoring proxies."""
    proto = (
        request.headers.get("x-forwarded-proto")
        or request.headers.get("x-forwarded-protocol")
        or request.url.scheme
        or "https"
    ).split(",")[0].strip()
    host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or request.url.netloc
    ).split(",")[0].strip()
    return f"{proto}://{host}"


def _build_og_html(
    *,
    canonical_url: str,
    redirect_url: str,
    title: str,
    description: str,
    image_url: str,
    og_type: str = "article",
    body_eyebrow: str = "",
    body_h1: str = "",
    body_lede: str = "",
    cta_label: str = "Open →",
    json_ld: Optional[dict] = None,
) -> str:
    """Tiny HTML page rich with OG/Twitter tags + meta-refresh for humans.

    `canonical_url` must be the page a reader would bookmark, never this bridge:
    pointing it here tells Google the API URL is the real article and invites it
    to drop the page the site actually links to.
    """
    t = _esc(title)
    d = _esc(description)
    img = _esc(image_url)
    canon = _esc(canonical_url)
    redir = _esc(redirect_url)
    eyebrow = _esc(body_eyebrow)
    h1 = _esc(body_h1 or title)
    lede = _esc(body_lede or description)
    cta = _esc(cta_label)
    redir_js = redirect_url.replace("\\", "\\\\").replace("'", "\\'")
    ld = ""
    if json_ld:
        # </script> inside a JSON string would end the block early.
        blob = json.dumps(json_ld, ensure_ascii=False).replace("</", "<\\/")
        ld = '<script type="application/ld+json">' + blob + "</script>"


    return f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{t}</title>
<meta name="description" content="{d}" />
<link rel="canonical" href="{canon}" />
{ld}

<!-- Open Graph (Facebook · LINE · WhatsApp · Discord · Slack) -->
<meta property="og:type" content="{_esc(og_type)}" />
<meta property="og:site_name" content="{_esc(SITE_NAME)}" />
<meta property="og:title" content="{t}" />
<meta property="og:description" content="{d}" />
<meta property="og:url" content="{canon}" />
<meta property="og:image" content="{img}" />
<meta property="og:image:secure_url" content="{img}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="{t}" />
<meta property="og:locale" content="th_TH" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{t}" />
<meta name="twitter:description" content="{d}" />
<meta name="twitter:image" content="{img}" />

<!-- Auto-redirect humans (bots ignore this) -->
<meta http-equiv="refresh" content="0; url={redir}" />
<style>
  *,*:before,*:after{{box-sizing:border-box}}
  body{{margin:0;font-family:'IBM Plex Sans Thai','IBM Plex Sans',-apple-system,system-ui,sans-serif;
       background:#F7F4EE;color:#14161A;min-height:100vh;display:flex;
       align-items:center;justify-content:center;padding:32px}}
  .card{{max-width:560px;width:100%;background:#fff;border:1px solid rgba(20,22,26,0.10);
        border-radius:14px;padding:32px;box-shadow:0 12px 40px rgba(0,0,0,.06)}}
  .eyebrow{{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.18em;
           text-transform:uppercase;color:#E22B37}}
  .eyebrow::before{{content:"●";margin-right:8px}}
  h1{{font-family:'IBM Plex Serif',Georgia,serif;font-size:30px;line-height:1.18;
      margin:14px 0 12px;letter-spacing:-.01em}}
  p.lede{{margin:0 0 24px;color:#5b5e63;line-height:1.55;font-size:15px}}
  a.cta{{display:inline-flex;align-items:center;gap:8px;background:#14161A;color:#fff;
        text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:600;
        font-size:14px;letter-spacing:.02em}}
  a.cta:hover{{background:#3597E4}}
  .small{{margin-top:18px;color:#8E8E93;font-size:11px;
         font-family:'IBM Plex Mono',monospace;letter-spacing:.12em;text-transform:uppercase}}
</style>
</head>
<body>
<div class="card" data-testid="share-bridge-card">
  <div class="eyebrow">{eyebrow}</div>
  <h1>{h1}</h1>
  <p class="lede">{lede}</p>
  <a class="cta" href="{redir}" data-testid="share-bridge-cta">{cta}</a>
  <div class="small">SWU · Marketing Research</div>
</div>
<script>
  // Replace history so the bridge URL doesn't pollute the back stack.
  try {{ window.location.replace('{redir_js}'); }} catch (e) {{}}
</script>
</body>
</html>"""


def _org_ld(origin: str) -> dict:
    """The department as an entity Google can recognise and attribute work to."""
    return {
        "@type": "CollegeOrUniversity",
        "name": SITE_NAME,
        "alternateName": "สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ",
        "url": origin,
        "logo": SWUMKT_LOGO_URL,
        "parentOrganization": {
            "@type": "CollegeOrUniversity",
            "name": "มหาวิทยาลัยศรีนครินทรวิโรฒ",
            "url": "https://www.swu.ac.th",
        },
    }


def _article_ld(post: dict, canonical: str, image: str, origin: str) -> dict:
    """Article markup, with a byline whenever the post carries one.

    The author matters as much as the article: a department earns a reputation
    through names that can be looked up, so the field is emitted whenever the
    data has it rather than being dropped into a generic site credit.
    """
    data = {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": (post.get("title") or "")[:110],
        "description": _truncate(post.get("excerpt") or "", 300),
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
        "url": canonical,
        "image": [image] if image else [],
        "inLanguage": "th-TH",
        "publisher": _org_ld(origin),
        "isAccessibleForFree": True,
    }
    for src, dst in (("published_at", "datePublished"), ("updated_at", "dateModified")):
        if post.get(src):
            data[dst] = str(post[src])
    faculty_authors = post.get("_faculty_authors") or []
    if faculty_authors:
        # A Person with a stable @id and url is what lets a search engine join
        # this article to the lecturer's profile page, their ORCID and their
        # other papers — a bare name joins to nothing.
        data["author"] = [
            {"@type": "Person", "@id": f"{origin}/people/{f['slug']}#person",
             "name": f.get("name_th") or f.get("name_en"),
             "alternateName": f.get("name_en"),
             "url": f"{origin}/people/{f['slug']}"}
            for f in faculty_authors]
    else:
        author = (post.get("author_name") or post.get("author") or "").strip()
        if author:
            data["author"] = {"@type": "Person", "name": author}
    return data


# Profile links worth emitting as `sameAs`: each is another page about the same
# person, which is how a search engine decides they are one entity.
_SAME_AS_KEYS = ("orcid", "scholar", "scopus", "researchgate", "openalex", "linkedin")


def _person_ld(f: dict, origin: str, image: str = "") -> dict:
    canonical = f"{origin}/people/{f['slug']}"
    org = {
        "@type": "CollegeOrUniversity",
        "name": f.get("department_th") or "ภาควิชาการตลาดและการจัดการ",
        "alternateName": f.get("department_en") or "Department of Marketing and Management",
        "parentOrganization": {
            "@type": "CollegeOrUniversity",
            "name": "มหาวิทยาลัยศรีนครินทรวิโรฒ",
            "alternateName": "Srinakharinwirot University",
            "url": "https://www.swu.ac.th",
        },
    }
    alt = [n for n in (f.get("name_en"), f.get("display_name_th"),
                       f.get("display_name_en")) if n]
    areas = [a.get("en") for a in (f.get("research_areas") or []) if a.get("en")] + \
            [a.get("th") for a in (f.get("research_areas") or []) if a.get("th")]
    data = {
        "@type": "Person",
        "@id": canonical + "#person",
        "name": f.get("name_th") or f.get("name_en"),
        "alternateName": alt,
        "honorificPrefix": f.get("title_th") or f.get("title_en"),
        "jobTitle": f.get("rank_en") or f.get("rank_th"),
        "url": canonical,
        "worksFor": org,
        "affiliation": org,
        "knowsAbout": areas,
        "sameAs": [v for k, v in (f.get("links") or {}).items()
                   if k in _SAME_AS_KEYS and v],
    }
    if image:
        data["image"] = image
    # No `email`: the profile page keeps the address out of its HTML so
    # scrapers cannot lift it, and this bridge is the page crawlers read
    # most. Emitting it here would undo that for no ranking benefit.
    return {k: v for k, v in data.items() if v not in (None, "", [], {})}


def _paper_ld(p: dict, origin: str, by_id: dict) -> dict:
    """ScholarlyArticle. Our own lecturers are referenced by @id, so the paper
    and the profile point at the same entity rather than at two strings."""
    ours = {}
    for i in p.get("faculty_ids", []):
        name = (by_id.get(i, {}).get("name_en") or "").strip().lower()
        if name:
            ours[name] = i
    authors = []
    for name in p.get("authors") or []:
        fid = ours.get((name or "").lower())
        if fid:
            authors.append({"@id": f"{origin}/people/{by_id[fid]['slug']}#person"})
        else:
            authors.append({"@type": "Person", "name": name})
    data = {
        "@type": "ScholarlyArticle",
        "headline": (p.get("title") or "")[:240],
        "name": p.get("title"),
        "author": authors,
        "datePublished": str(p["year"]) if p.get("year") else None,
        "url": p.get("url"),
        "isAccessibleForFree": bool(p.get("open_access")),
    }
    if p.get("venue"):
        data["isPartOf"] = {"@type": "Periodical", "name": p["venue"]}
    if p.get("doi"):
        data["identifier"] = {"@type": "PropertyValue", "propertyID": "DOI",
                              "value": p["doi"]}
        data["sameAs"] = f"https://doi.org/{p['doi']}"
    return {k: v for k, v in data.items() if v not in (None, "", [], {})}


# ============ FACTORY ============

def get_share_routes(db, brand_aggregate_helper=None):
    """Factory — wires DB + (optional) BE composite-score helper.

    `brand_aggregate_helper(study, responses, normalized=...)` should return
    the same shape as `_aggregate_responses` from brand_equity.py.
    """

    # ---- sitemap generated from the database ------------------------------
    # The static frontend/public/sitemap.xml only lists category pages, so the
    # published articles and showcases were invisible to crawlers and nothing
    # published later could ever be added without a redeploy.

    STATIC_PATHS = [
        ("/", "weekly", "1.0"),
        ("/showcase", "daily", "0.9"),
        ("/learn", "daily", "0.9"),
        ("/people", "monthly", "0.9"),
        ("/publications", "weekly", "0.8"),
        ("/about/swu-marketing", "monthly", "0.8"),
        ("/brand-equity", "monthly", "0.7"),
        ("/market-research/conjoint-analysis", "monthly", "0.7"),
        ("/market-research/customer-journey", "monthly", "0.7"),
    ]

    def _xml_escape(v: str) -> str:
        return (str(v).replace("&", "&amp;").replace("<", "&lt;")
                .replace(">", "&gt;").replace('"', "&quot;"))

    def _url_entry(loc: str, lastmod=None, changefreq=None, priority=None) -> str:
        out = ["  <url>", "    <loc>%s</loc>" % _xml_escape(loc)]
        if lastmod:
            out.append("    <lastmod>%s</lastmod>" % _xml_escape(str(lastmod)[:10]))
        if changefreq:
            out.append("    <changefreq>%s</changefreq>" % changefreq)
        if priority:
            out.append("    <priority>%s</priority>" % priority)
        out.append("  </url>")
        return "\n".join(out)

    @share_router.get("/sitemap.xml")
    async def sitemap_xml(request: Request):
        origin = _request_origin(request)
        rows = [_url_entry(origin + p, changefreq=cf, priority=pr)
                for p, cf, pr in STATIC_PATHS]

        posts = await db.cms_posts.find(
            {"status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1},
        ).to_list(2000)
        for p in posts:
            if not p.get("slug"):
                continue
            rows.append(_url_entry(
                "%s/learn/%s" % (origin, p["slug"]),
                lastmod=p.get("updated_at") or p.get("published_at"),
                changefreq="monthly", priority="0.8"))

        # Published showcases. This first shipped filtering on `showcase: True`
        # — a field neither collection has — and with paths no route serves,
        # so not one showcase ever reached the sitemap. The flags and paths
        # below are the ones the app actually uses: brand_equity.py's public
        # filter and the routes UnifiedShowcasePage navigates to.
        showcase_sources = (
            (db.brand_studies,
             {"is_public_showcase": True, "deleted_at": {"$exists": False},
              "share_token": {"$nin": [None, ""]}},
             lambda it: f"/showcase/{it['share_token']}"),
            (db.conjoint_studies,
             {"is_public_result": True, "deleted_at": {"$exists": False}},
             lambda it: f"/conjoint/results/{it['id']}"),
        )
        for coll, query, path_for in showcase_sources:
            try:
                items = await coll.find(
                    query, {"_id": 0, "id": 1, "share_token": 1, "updated_at": 1},
                ).to_list(2000)
            except Exception:
                items = []
            for it in items:
                try:
                    loc = origin + path_for(it)
                except KeyError:
                    continue
                rows.append(_url_entry(loc, lastmod=it.get("updated_at"),
                                       changefreq="monthly", priority="0.7"))

        # Faculty profiles: the pages that make a named lecturer findable.
        for f in await db.faculty.find(
                {"status": "published", "deleted_at": {"$exists": False}},
                {"_id": 0, "slug": 1, "updated_at": 1}).to_list(500):
            if f.get("slug"):
                rows.append(_url_entry(f"{origin}/people/{f['slug']}",
                                       lastmod=f.get("updated_at"),
                                       changefreq="monthly", priority="0.8"))

        body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                + "\n".join(rows) + "\n</urlset>\n")
        return Response(content=body, media_type="application/xml",
                        headers={"Cache-Control": "public, max-age=3600"})

    @share_router.get("/showcase/{share_token}", response_class=HTMLResponse)
    async def share_showcase(share_token: str, request: Request):
        origin = _request_origin(request)
        return HTMLResponse(await _share_showcase_cached(share_token, origin))

    @async_ttl_cache(ttl_seconds=120)
    async def _share_showcase_cached(share_token: str, origin: str) -> str:
        study = await db.brand_studies.find_one(
            {"share_token": share_token, "deleted_at": {"$exists": False}},
            {"_id": 0},
        )
        if not study:
            raise HTTPException(404, "Showcase not found")
        if not study.get("is_public_showcase"):
            raise HTTPException(403, "Not published as public showcase")

        brand = study.get("brand") or {}
        name = brand.get("name") or "Brand"
        category = brand.get("category") or ""
        logo_url = brand.get("logo_url")
        # FB/LINE reject base64 data URIs — only http(s) URL works.
        og_image = logo_url if (logo_url and logo_url.startswith("http")) else SWUMKT_LOGO_URL

        # Compute scores when possible
        scores = None
        try:
            response_count = await db.brand_responses.count_documents({"study_id": study["id"]})
            if response_count >= 10 and brand_aggregate_helper:
                responses = await db.brand_responses.find(
                    {"study_id": study["id"]}, {"_id": 0}
                ).to_list(5000)
                ai_cache = study.get("ai_cache") or {}
                agg = brand_aggregate_helper(
                    study, responses,
                    normalized=ai_cache.get("normalized_by_question") or {},
                )
                scores = (agg or {}).get("composite") or None
        except Exception:
            scores = None

        canonical = f"{origin}/api/share/showcase/{share_token}"
        redirect_url = f"{origin}/showcase/{share_token}"

        if scores and scores.get("overall") is not None:
            bes = round(float(scores.get("overall") or 0))
            tier = _tier_for(bes)
            title = f"{name} · Brand Health Score {bes}/100 — {tier['label']} ({tier['label_th']})"
            dim_bits = []
            for k, lbl in [
                ("awareness", "Awareness"),
                ("quality", "Quality"),
                ("identity", "Identity"),
                ("loyalty", "Loyalty"),
            ]:
                v = scores.get(k)
                if v is not None:
                    dim_bits.append(f"{lbl} {round(float(v))}")
            description = _truncate(
                f"{tier['note']} · {' · '.join(dim_bits)} — เปิดอ่านงานวิจัย Brand Equity ฉบับเต็ม (Aaker 4 มิติ) บน SWU MKT",
                280,
            )
            eyebrow = f"BRAND HEALTH · {tier['label'].upper()}"
            cta_label = "ดูผลวิจัยฉบับเต็ม →"
        else:
            cat_bit = f" · {category}" if category else ""
            title = f"{name}{cat_bit} · Brand Health Check"
            description = _truncate(
                f"งานวิจัย Brand Equity แบรนด์ {name} จาก SWU MKT — กำลังเก็บข้อมูลผู้บริโภค "
                f"ผ่าน Aaker framework 4 มิติ (Awareness · Quality · Identity · Loyalty). "
                f"ร่วมตอบ หรือดูผลฉบับเปิดได้ที่นี่",
                280,
            )
            eyebrow = "BRAND HEALTH · IN PUBLIC"
            cta_label = "เข้าดู Showcase →"

        return _build_og_html(
            canonical_url=canonical,
            redirect_url=redirect_url,
            title=title,
            description=description,
            image_url=og_image,
            og_type="article",
            body_eyebrow=eyebrow,
            body_h1=title,
            body_lede=description,
            cta_label=cta_label,
        )

    @share_router.get("/learn/{slug}", response_class=HTMLResponse)
    async def share_learn(slug: str, request: Request):
        origin = _request_origin(request)
        return HTMLResponse(await _share_learn_cached(slug, origin))

    @async_ttl_cache(ttl_seconds=300)
    async def _share_learn_cached(slug: str, origin: str) -> str:
        post = await db.cms_posts.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0},
        )
        if not post:
            raise HTTPException(404, "Article not found")

        title = (post.get("title") or "").strip() or "Knowledge Hub · SWU MKT"
        excerpt = post.get("excerpt") or ""
        if not excerpt:
            excerpt = _strip_md(post.get("body_md") or "")
        excerpt = _truncate(excerpt, 240)
        if not excerpt:
            excerpt = "อ่านบทความ Marketing Research จาก SWU · เครื่องมืออ่านใจผู้บริโภค ก่อนตลาด"

        category = (post.get("category") or post.get("type") or "ARTICLE").upper()
        eyebrow = f"KNOWLEDGE HUB · {category}"

        # The bookmarkable page, not this bridge.
        canonical = f"{origin}/learn/{slug}"
        redirect_url = canonical

        cover = post.get("cover_image") or ""
        if cover.startswith("http"):
            og_image = cover
        elif cover.startswith("data:image/"):
            og_image = f"{origin}/api/share/og-image/learn/{slug}"
        else:
            og_image = SWUMKT_LOGO_URL

        title_line = f"{title} · SWU · Marketing Research"
        description = _truncate(excerpt, 260)

        if post.get("author_faculty_ids"):
            found = {f["id"]: f async for f in db.faculty.find(
                {"id": {"$in": post["author_faculty_ids"]}, "status": "published",
                 "deleted_at": {"$exists": False}},
                {"_id": 0, "id": 1, "slug": 1, "name_th": 1, "name_en": 1})}
            post["_faculty_authors"] = [found[i] for i in post["author_faculty_ids"]
                                        if i in found]

        return _build_og_html(
            canonical_url=canonical,
            redirect_url=redirect_url,
            title=title_line,
            description=description,
            image_url=og_image,
            og_type="article",
            body_eyebrow=eyebrow,
            body_h1=title,
            body_lede=description,
            cta_label="อ่านบทความเต็ม →",
            json_ld=_article_ld(post, canonical, og_image, origin),
        )

    # ---- faculty ------------------------------------------------------------

    def _faculty_image(f: dict, origin: str) -> str:
        photo = f.get("photo") or ""
        if photo.startswith("http"):
            return photo
        if photo.startswith("/"):
            return origin + photo
        if photo.startswith("data:image/"):
            from lib.inline_media import media_url, inline_image
            found = inline_image(photo)
            return origin + media_url("faculty", f["id"], "photo", found[1]) if found else SWUMKT_LOGO_URL
        return SWUMKT_LOGO_URL

    @share_router.get("/people/{slug}", response_class=HTMLResponse)
    async def share_people(slug: str, request: Request):
        origin = _request_origin(request)
        return HTMLResponse(await _share_people_cached(slug, origin))

    @async_ttl_cache(ttl_seconds=300)
    async def _share_people_cached(slug: str, origin: str) -> str:
        from routes.faculty import display_name
        f = await db.faculty.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0})
        if not f:
            raise HTTPException(404, "Faculty member not found")
        f["display_name_th"] = display_name(f, "th")
        f["display_name_en"] = display_name(f, "en")

        papers = await db.faculty_papers.find(
            {"faculty_ids": f["id"], "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0}).sort([("year", -1)]).to_list(200)
        co_ids = list({i for p in papers for i in p.get("faculty_ids", [])})
        by_id = {c["id"]: c async for c in db.faculty.find(
            {"id": {"$in": co_ids}, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "slug": 1, "name_en": 1, "name_th": 1})}

        canonical = f"{origin}/people/{slug}"
        image = _faculty_image(f, origin)
        # The logo stays as the share card's picture, but a Person's `image`
        # must be the person or nothing.
        person = _person_ld(f, origin, image if image != SWUMKT_LOGO_URL else "")
        graph = [
            {"@type": "ProfilePage", "@id": canonical, "url": canonical,
             "name": f["display_name_th"], "inLanguage": "th-TH",
             "mainEntity": {"@id": person["@id"]},
             "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": origin}},
            person,
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "หน้าแรก", "item": origin + "/"},
                {"@type": "ListItem", "position": 2, "name": "คณาจารย์", "item": origin + "/people"},
                {"@type": "ListItem", "position": 3, "name": f["display_name_th"], "item": canonical},
            ]},
        ] + [_paper_ld(p, origin, by_id) for p in papers[:40]]

        areas = ", ".join(a.get("th") for a in (f.get("research_areas") or [])[:3] if a.get("th"))
        n = len(papers)
        description = _truncate(
            f"{f['display_name_th']} ({f.get('name_en', '')}) — "
            f"{f.get('rank_th') or ''} {f.get('department_th') or ''} มหาวิทยาลัยศรีนครินทรวิโรฒ"
            + (f" · ความเชี่ยวชาญ: {areas}" if areas else "")
            + (f" · ผลงานตีพิมพ์ {n} เรื่อง" if n else ""), 280)

        return _build_og_html(
            canonical_url=canonical,
            redirect_url=canonical,
            title=f"{f['display_name_th']} · คณาจารย์ การตลาด มศว",
            description=description,
            image_url=image,
            og_type="profile",
            body_eyebrow="FACULTY · SWU MARKETING",
            body_h1=f["display_name_th"],
            body_lede=description,
            cta_label="ดูโปรไฟล์และผลงาน →",
            json_ld={"@context": "https://schema.org", "@graph": graph},
        )

    @share_router.get("/og-image/learn/{slug}")
    async def og_image_learn(slug: str):
        """Stream cover_image bytes when stored as base64 data URI."""
        post = await db.cms_posts.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0, "cover_image": 1},
        )
        if not post:
            raise HTTPException(404, "Not found")
        cover = post.get("cover_image") or ""
        if cover.startswith("http"):
            return Response(status_code=302, headers={"Location": cover})
        if not cover.startswith("data:image/"):
            raise HTTPException(404, "No cover image")
        try:
            header, b64 = cover.split(",", 1)
            mime = header.split(";")[0].replace("data:", "") or "image/png"
            raw = base64.b64decode(b64, validate=False)
        except (ValueError, binascii.Error):
            raise HTTPException(500, "Invalid image data")
        return Response(content=raw, media_type=mime, headers={
            "Cache-Control": "public, max-age=86400",
        })

    @share_router.get("/showcase-index", response_class=HTMLResponse)
    async def share_showcase_index(request: Request):
        origin = _request_origin(request)
        return HTMLResponse(await _build_showcase_index_og(origin))

    @async_ttl_cache(ttl_seconds=60)
    async def _build_showcase_index_og(origin: str) -> str:
        """OG bridge for the unified public showcase landing (`/showcase`).
        Crawlers see rich preview; humans get meta-refreshed to the React page."""
        # Aggregate light stats — same filters as /api/showcase/index
        be_count = await db.brand_studies.count_documents(
            {"is_public_showcase": True, "deleted_at": {"$exists": False}}
        )
        cj_count = await db.conjoint_studies.count_documents(
            {"is_public_result": True, "deleted_at": {"$exists": False}}
        )
        # Total BE responses across public studies
        be_ids_cur = db.brand_studies.find(
            {"is_public_showcase": True, "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "brand.name": 1},
        )
        be_rows = await be_ids_cur.to_list(500)
        be_ids = [r["id"] for r in be_rows]
        total_responses = 0
        if be_ids:
            total_responses = await db.brand_responses.count_documents(
                {"study_id": {"$in": be_ids}}
            )
        # Topic names — for the lede
        be_topics = [
            ((r.get("brand") or {}).get("name") or "").strip()
            for r in be_rows
        ]
        cj_cur = db.conjoint_studies.find(
            {"is_public_result": True, "deleted_at": {"$exists": False}},
            {"_id": 0, "brand_name": 1, "title": 1},
        )
        cj_rows = await cj_cur.to_list(500)
        cj_topics = [
            (r.get("brand_name") or r.get("title") or "").strip()
            for r in cj_rows
        ]
        unique_topics = {t.lower() for t in be_topics + cj_topics if t}
        # Featured sample for the lede (up to 4)
        sample = [t for t in (be_topics + cj_topics) if t][:4]
        sample_str = " · ".join(sample) if sample else ""

        canonical = f"{origin}/api/share/showcase-index"
        redirect_url = f"{origin}/showcase"

        title = (
            f"SWU MKT Showcase · {be_count + cj_count} งานวิจัยเปิดสาธารณะ — "
            f"Brand Equity & Conjoint Analysis"
        )
        lede_parts = [
            "งานวิจัยจริงจากนักศึกษา SWU เปิดให้คนทั่วไปดูได้",
            f"{be_count} Brand Equity · {cj_count} Conjoint · "
            f"{len(unique_topics)} topics · {total_responses}+ responses",
        ]
        if sample_str:
            lede_parts.append(f"ตัวอย่าง: {sample_str}")
        description = _truncate(" — ".join(lede_parts), 280)

        return _build_og_html(
            canonical_url=canonical,
            redirect_url=redirect_url,
            title=title,
            description=description,
            image_url=SWUMKT_LOGO_URL,
            og_type="website",
            body_eyebrow="PUBLIC RESEARCH SHOWCASE · OPEN ACCESS",
            body_h1="Marketing research, publicly visible.",
            body_lede=description,
            cta_label="เข้าดู Showcase →",
        )

    return share_router
