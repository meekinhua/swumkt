"""
Object Storage helper (Emergent integrations).

Used to offload image base64 blobs from MongoDB (the storage cost was averaging
~1.4 MB / conjoint study, 95% of which were inline images). After migration,
documents shrink ~95% and list/showcase APIs become 10× faster.

Public-read by design: files are served by our own `/api/files/{path}` route,
which proxies the storage and exposes them without auth. This is intentional
for public-facing brand logos, CMS covers, and conjoint profile images — they
are already shown on public dashboards.
"""
from __future__ import annotations

import asyncio
import logging
import os
import uuid
import requests
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "swumkt"

_storage_key: Optional[str] = None
_init_lock = asyncio.Lock()


def _emergent_key() -> str:
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not set in environment")
    return key


def init_storage_sync() -> str:
    """Synchronous init for startup hook. Returns the storage_key."""
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init",
        json={"emergent_key": _emergent_key()},
        timeout=30,
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    logger.info("[OBJSTORE] Initialized session storage_key")
    return _storage_key


async def init_storage() -> str:
    """Async-friendly init wrapper, idempotent and thread-safe under asyncio."""
    global _storage_key
    if _storage_key:
        return _storage_key
    async with _init_lock:
        if _storage_key:  # re-check inside lock
            return _storage_key
        # network call wrapped in thread to keep event loop responsive
        _storage_key = await asyncio.to_thread(init_storage_sync)
        return _storage_key


def _do_put(path: str, data: bytes, content_type: str) -> dict:
    """Blocking PUT — call only from inside asyncio.to_thread()."""
    headers = {"X-Storage-Key": _storage_key, "Content-Type": content_type}
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers=headers,
        data=data,
        timeout=120,
    )
    if resp.status_code == 403:
        # Key likely expired — re-init and retry once
        logger.warning("[OBJSTORE] Storage key expired, re-initializing")
        globals()["_storage_key"] = None
        init_storage_sync()
        headers["X-Storage-Key"] = _storage_key
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers=headers,
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def _do_get(path: str) -> Tuple[bytes, str]:
    """Blocking GET — call only from inside asyncio.to_thread()."""
    headers = {"X-Storage-Key": _storage_key}
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers=headers, timeout=60)
    if resp.status_code == 403:
        globals()["_storage_key"] = None
        init_storage_sync()
        headers["X-Storage-Key"] = _storage_key
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


async def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes to object storage. Returns {"path", "size", "etag"}."""
    await init_storage()
    return await asyncio.to_thread(_do_put, path, data, content_type)


async def get_object(path: str) -> Tuple[bytes, str]:
    """Download bytes. Returns (content_bytes, content_type)."""
    await init_storage()
    return await asyncio.to_thread(_do_get, path)


def make_storage_path(category: str, ext: str = "png", entity_id: str = "shared") -> str:
    """Generate canonical storage path. Always UUID-based to avoid collisions.
    category — semantic group, e.g. "conjoint-profiles", "cms-covers", "brand-logos"
    entity_id — owning entity (study_id, post_id, etc.) for organisation only
    """
    safe_ext = (ext or "png").lstrip(".").lower()[:5]
    if safe_ext not in ("png", "jpg", "jpeg", "webp", "gif", "svg"):
        safe_ext = "png"
    return f"{APP_NAME}/{category}/{entity_id}/{uuid.uuid4().hex}.{safe_ext}"


def public_url(path: str) -> str:
    """Return the public URL clients use to fetch a stored object.
    Frontend uses `<img src={image_url}>` directly — backend proxies to storage.
    """
    # Path-relative — works with REACT_APP_BACKEND_URL prefix on frontend
    return f"/api/files/{path}"


# Common helper: decode base64 → upload → return (storage_path, public_url)
async def upload_b64_image(b64_str: str, category: str, entity_id: str = "shared") -> Optional[dict]:
    """Accept a possibly-data-URI-prefixed base64 string and upload it.
    Returns dict {"path": "...", "url": "/api/files/...", "size": N, "mime": "image/png"}
    or None if the input is empty/invalid.
    """
    import base64 as _b64
    s = (b64_str or "").strip()
    if not s:
        return None
    mime = "image/png"
    ext = "png"
    # Strip data URI prefix if present and capture mime
    if s.startswith("data:"):
        try:
            header, payload = s.split(",", 1)
            # header looks like: data:image/png;base64
            if ";" in header:
                mime_part = header.split(";")[0].replace("data:", "")
                if mime_part:
                    mime = mime_part
                    if mime == "image/jpeg": ext = "jpg"
                    elif mime == "image/webp": ext = "webp"
                    elif mime == "image/gif": ext = "gif"
                    elif mime == "image/svg+xml": ext = "svg"
            s = payload
        except Exception:
            return None
    try:
        data = _b64.b64decode(s, validate=False)
    except Exception as e:
        logger.warning(f"[OBJSTORE] b64 decode failed: {e}")
        return None
    if len(data) < 100 or len(data) > 8 * 1024 * 1024:  # sanity: 100B to 8MB
        logger.warning(f"[OBJSTORE] image size out of bounds: {len(data)}")
        return None
    path = make_storage_path(category, ext, entity_id)
    try:
        result = await put_object(path, data, mime)
    except Exception as e:
        logger.warning(f"[OBJSTORE] upload failed: {e}")
        return None
    return {
        "path": result.get("path", path),
        "url": public_url(result.get("path", path)),
        "size": result.get("size", len(data)),
        "mime": mime,
    }
