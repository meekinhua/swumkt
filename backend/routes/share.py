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
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse, Response

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
) -> str:
    """Tiny HTML page rich with OG/Twitter tags + meta-refresh for humans."""
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

    return f"""<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{t}</title>
<meta name="description" content="{d}" />
<link rel="canonical" href="{canon}" />

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


# ============ FACTORY ============

def get_share_routes(db, brand_aggregate_helper=None):
    """Factory — wires DB + (optional) BE composite-score helper.

    `brand_aggregate_helper(study, responses, normalized=...)` should return
    the same shape as `_aggregate_responses` from brand_equity.py.
    """

    @share_router.get("/showcase/{share_token}", response_class=HTMLResponse)
    async def share_showcase(share_token: str, request: Request):
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

        origin = _request_origin(request)
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

        return HTMLResponse(_build_og_html(
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
        ))

    @share_router.get("/learn/{slug}", response_class=HTMLResponse)
    async def share_learn(slug: str, request: Request):
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

        origin = _request_origin(request)
        canonical = f"{origin}/api/share/learn/{slug}"
        redirect_url = f"{origin}/learn/{slug}"

        cover = post.get("cover_image") or ""
        if cover.startswith("http"):
            og_image = cover
        elif cover.startswith("data:image/"):
            og_image = f"{origin}/api/share/og-image/learn/{slug}"
        else:
            og_image = SWUMKT_LOGO_URL

        title_line = f"{title} · SWU · Marketing Research"
        description = _truncate(excerpt, 260)

        return HTMLResponse(_build_og_html(
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
        ))

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

        origin = _request_origin(request)
        canonical = f"{origin}/api/share/showcase-index"
        redirect_url = f"{origin}/showcase"

        title = (
            f"SWU MKT Showcase · {be_count + cj_count} งานวิจัยเปิดสาธารณะ — "
            f"Brand Equity & Conjoint Analysis"
        )
        lede_parts = [
            f"งานวิจัยจริงจากนักศึกษา SWU เปิดให้คนทั่วไปดูได้",
            f"{be_count} Brand Equity · {cj_count} Conjoint · "
            f"{len(unique_topics)} topics · {total_responses}+ responses",
        ]
        if sample_str:
            lede_parts.append(f"ตัวอย่าง: {sample_str}")
        description = _truncate(" — ".join(lede_parts), 280)

        return HTMLResponse(_build_og_html(
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
        ))

    return share_router
