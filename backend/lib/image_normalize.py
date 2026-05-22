"""Helper to normalize incoming image strings into stable storage URLs.

Frontend often sends `data:image/...;base64,...` strings. Storing those inline
in MongoDB inflates docs 4×. This helper transparently uploads any data-URI to
object storage and returns the storage URL, falling back to passthrough for
already-stored URLs or empty strings.
"""
from typing import Optional
from lib.object_storage import upload_b64_image


async def normalize_image_for_storage(
    value: Optional[str],
    category: str,
    entity_id: str = "shared",
) -> Optional[str]:
    """Take whatever the frontend sent us and return a stable URL.

    Args:
        value: incoming string — may be a data: URI, an http(s) URL, an existing
               `/api/files/...` URL, or empty/None.
        category: storage path category (e.g. "conjoint-profiles", "cms-covers")
        entity_id: owning entity id used for path organisation only

    Returns:
        - URL string if input was a data: URI that we uploaded
        - The original string if it was already an http(s) or /api/files URL
        - None / empty string passed through unchanged
        - Original value if upload failed (graceful degradation)
    """
    if not value or not isinstance(value, str):
        return value
    s = value.strip()
    if not s:
        return s
    # Already a URL — passthrough
    if s.startswith(("http://", "https://", "/api/")):
        return s
    # data: URI or raw base64 — try to upload
    if s.startswith("data:image/") or len(s) > 2000:
        info = await upload_b64_image(s, category, entity_id)
        if info:
            return info["url"]
        # Upload failed — fall back to storing original to avoid data loss
        return value
    # Short string that's not a URL — keep as-is (might be a filename or label)
    return s
