"""Serve images that live inline in Mongo as separately cacheable files.

The public JSON on this site carries its images as base64 inside the document.
Measured against production on 27 Oct 2026:

    GET /api/cms/posts/public            7.05 MB   99.9% cover_image + media[].src
    GET /api/cms/landing                 2.09 MB   99.5% slides[].image
    GET /api/brand-equity/showcase       1.26 MB   99.0% logo_asset.image_base64
    GET /api/cms/announcements/pinned    1.21 MB   99.2% media[].src
    GET /api/showcase/index              0.68 MB   logo_url built as a data: URI

Base64 costs a third more than the bytes it encodes, but the shape is the real
problem: an image inside a JSON body cannot be cached by the browser or a CDN,
cannot be fetched in parallel, and cannot be skipped — nothing renders until
the last byte of the response has arrived, and the whole thing is re-sent on
the next visit.

The durable fix is to keep images in object storage; `scripts/migrate_b64_to_storage.py`
does that, but it needs EMERGENT_LLM_KEY and has not been run against
production. This module is the half that works on the data exactly as it
stands: a list endpoint hands back a URL into `/api/media/...` where the base64
used to be, and that URL serves the same bytes as an ordinary image with a
year-long lifetime. The URL carries a hash of the content, so it changes when
the image changes and `immutable` stays truthful.

Three functions, kept in one file so they cannot drift apart:

    externalize  — swap inline images for URLs, on the way out
    resolve      — turn one of those URLs back into bytes, for /api/media
    rehydrate    — put the base64 back when a client PUTs our own URL at us

`rehydrate` is what makes this safe rather than merely fast. The landing-page
editor GETs the same document the homepage does and PUTs it straight back; the
images are already encoded in the URL's `f` parameter, so the original bytes
can be recovered by path even if the admin reordered the slides in between.
Without it, one save would overwrite every hero image with a URL pointing at
itself.

Forward-compatible with the migration: a value that is already an http(s) or
`/api/files/...` URL is not an inline image, so it is left alone.
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import logging
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple
from urllib.parse import parse_qs, quote, urlparse

logger = logging.getLogger(__name__)

# Below this, a separate request costs more than the bytes it saves. A 4 KB
# data URI is roughly a 3 KB icon — not worth a round trip.
MIN_INLINE_BYTES = 4096

URL_PREFIX = "/api/media"

_ALLOWED_MIME = {
    "image/png", "image/jpeg", "image/jpg", "image/webp",
    "image/gif", "image/svg+xml", "image/avif",
}


@dataclass(frozen=True)
class _Source:
    """One collection whose inline images may be served.

    `public_filter` is the access control: `resolve` re-reads the document
    through it on every request, so a study that stops being a public showcase
    stops serving its logo, URL already in the wild or not.
    """
    collection: str
    id_field: str
    public_filter: Dict[str, Any]


SOURCES: Dict[str, _Source] = {
    "landing": _Source("cms_landing", "key", {}),
    "post": _Source(
        "cms_posts", "id",
        {"status": "published", "deleted_at": {"$exists": False}},
    ),
    "brand": _Source(
        "brand_studies", "id",
        {"is_public_showcase": True, "deleted_at": {"$exists": False}},
    ),
    "conjoint": _Source(
        "conjoint_studies", "id",
        {"is_public_result": True, "deleted_at": {"$exists": False}},
    ),
    # Faculty portraits. Stored as a URL to the department's photo at first;
    # a regenerated portrait uploaded as a data URI lands here and is served
    # as a file like every other image, not shipped inside the JSON.
    "faculty": _Source(
        "faculty", "id",
        {"status": "published", "deleted_at": {"$exists": False}},
    ),
}


# ── decoding ────────────────────────────────────────────────────────────────

def _split_data_uri(s: str) -> Optional[Tuple[str, str]]:
    """`data:image/png;base64,AAAA` -> ("image/png", "AAAA"), else None."""
    if not s.startswith("data:"):
        return None
    head, _, payload = s.partition(",")
    if not payload or "base64" not in head:
        return None
    mime = head[5:].split(";")[0].strip().lower() or "image/png"
    if mime not in _ALLOWED_MIME:
        return None
    return mime, payload


def inline_image(value: Any) -> Optional[Tuple[str, str]]:
    """Return (mime, base64_payload) when `value` holds an inline image.

    Two shapes occur in this database: a `data:` URI string (CMS covers, hero
    slides, announcement media) and an asset object carrying a bare
    `image_base64` plus `mime_type` (brand identity visual_assets).
    """
    if isinstance(value, str):
        return _split_data_uri(value)
    if isinstance(value, dict):
        payload = value.get("image_base64")
        if isinstance(payload, str) and payload:
            mime = (value.get("mime_type") or "image/png").strip().lower()
            if mime not in _ALLOWED_MIME:
                mime = "image/png"
            return mime, payload
    return None


def decode_image(mime: str, payload: str) -> Optional[bytes]:
    try:
        data = base64.b64decode(payload, validate=False)
    except (binascii.Error, ValueError) as e:
        logger.warning("[INLINE_MEDIA] base64 decode failed (%s): %s", mime, e)
        return None
    return data or None


def _digest(payload: str) -> str:
    return hashlib.sha1(payload.encode("utf-8", "ignore")).hexdigest()[:12]


# ── paths ───────────────────────────────────────────────────────────────────

def _walk_path(doc: Any, path: str) -> Any:
    """Resolve a dotted path, where an all-digits segment indexes a list."""
    cur = doc
    for seg in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(seg)
        elif isinstance(cur, list) and seg.isdigit():
            idx = int(seg)
            cur = cur[idx] if 0 <= idx < len(cur) else None
        else:
            return None
        if cur is None:
            return None
    return cur


def media_url(source: str, doc_id: str, path: str, payload: str) -> str:
    return (
        f"{URL_PREFIX}/{quote(source, safe='')}/{quote(str(doc_id), safe='')}"
        f"?f={quote(path, safe='')}&v={_digest(payload)}"
    )


def parse_media_url(url: str) -> Optional[Tuple[str, str, str]]:
    """One of our URLs -> (source, doc_id, field_path). None if it is not ours."""
    if not isinstance(url, str) or not url.startswith(URL_PREFIX + "/"):
        return None
    parts = urlparse(url)
    segs = parts.path[len(URL_PREFIX) + 1:].split("/")
    if len(segs) != 2 or not all(segs):
        return None
    field = (parse_qs(parts.query).get("f") or [""])[0]
    if not field:
        return None
    from urllib.parse import unquote
    return unquote(segs[0]), unquote(segs[1]), field


# ── out: inline image -> URL ────────────────────────────────────────────────

def externalize(doc: Any, source: str, doc_id: Any,
                min_bytes: int = MIN_INLINE_BYTES) -> Any:
    """Copy `doc`, replacing every inline image larger than `min_bytes`.

    A `data:` URI string becomes the URL string. An asset object loses
    `image_base64` and gains `image_url`, keeping its other fields so callers
    that read `kind` or `mime_type` still work.

    Keys containing a dot are not descended into: the path would not survive
    the round trip, and silently serving the wrong image is worse than leaving
    one large.
    """
    if source not in SOURCES:
        raise KeyError(f"unknown inline-media source {source!r}")
    doc_id = str(doc_id)

    def visit(node: Any, path: str) -> Any:
        found = inline_image(node)
        if found is not None:
            mime, payload = found
            # len(base64) overstates the decoded size by a third; that is the
            # figure that matters, because base64 is what travels.
            if len(payload) >= min_bytes:
                url = media_url(source, doc_id, path, payload)
                if isinstance(node, str):
                    return url
                out = {k: v for k, v in node.items() if k != "image_base64"}
                out["image_url"] = url
                out.setdefault("mime_type", mime)
                return out
            return node
        if isinstance(node, dict):
            return {
                k: (v if "." in k else visit(v, f"{path}.{k}" if path else k))
                for k, v in node.items()
            }
        if isinstance(node, list):
            return [visit(v, f"{path}.{i}" if path else str(i))
                    for i, v in enumerate(node)]
        return node

    return visit(doc, "")


def externalize_many(docs, source: str, id_field: str = "id",
                     min_bytes: int = MIN_INLINE_BYTES):
    """`externalize` over a list of documents, skipping any that lack an id."""
    out = []
    for d in docs:
        doc_id = d.get(id_field) if isinstance(d, dict) else None
        out.append(externalize(d, source, doc_id, min_bytes) if doc_id else d)
    return out


# ── back: URL -> bytes ──────────────────────────────────────────────────────

async def resolve(db, source: str, doc_id: str, field: str
                  ) -> Optional[Tuple[bytes, str, str]]:
    """Fetch the image one of our URLs points at. Returns (bytes, mime, etag).

    None covers every failure the caller should answer with a 404: unknown
    source, document missing or no longer public, path pointing at something
    that is not an inline image. They are deliberately not distinguished —
    telling an anonymous caller which of those happened would leak whether a
    private document exists.
    """
    src = SOURCES.get(source)
    if src is None or not field or len(field) > 200:
        return None
    if not all(seg and all(c.isalnum() or c == "_" for c in seg)
               for seg in field.split(".")):
        return None

    query = {src.id_field: doc_id, **src.public_filter}
    doc = await db[src.collection].find_one(query, {"_id": 0})
    if not doc:
        return None

    found = inline_image(_walk_path(doc, field))
    if found is None:
        return None
    mime, payload = found
    data = decode_image(mime, payload)
    if data is None:
        return None
    return data, mime, _digest(payload)


# ── in: our own URL -> inline image again ───────────────────────────────────

def rehydrate(incoming: Any, stored: Any) -> Any:
    """Undo `externalize` on a document a client is sending back.

    The landing editor loads the public document and saves it unchanged, so
    without this the first save would replace each hero image with a URL
    pointing at the field it just overwrote. The field path is read from the
    URL rather than from where the value sits now, so reordering slides in the
    editor still carries each image with its slide.

    Anything the client actually changed — a freshly uploaded `data:` URI, a
    deleted slide — passes through untouched.
    """
    if stored is None:
        return incoming

    def restore(url: str) -> Optional[Any]:
        parsed = parse_media_url(url)
        if parsed is None:
            return None
        _, _, field = parsed
        value = _walk_path(stored, field)
        return value if inline_image(value) is not None else None

    def visit(node: Any) -> Any:
        if isinstance(node, str):
            back = restore(node)
            return back if isinstance(back, str) else node
        if isinstance(node, dict):
            url = node.get("image_url")
            if isinstance(url, str) and not node.get("image_base64"):
                found = inline_image(restore(url))
                if found is not None:
                    # Keep whatever else the client edited on this asset and
                    # only put the pixels back.
                    out = {k: v for k, v in node.items() if k != "image_url"}
                    out["mime_type"], out["image_base64"] = found
                    return out
            return {k: visit(v) for k, v in node.items()}
        if isinstance(node, list):
            return [visit(v) for v in node]
        return node

    return visit(incoming)
