"""`GET /api/media/...` — serves the images that live inline in Mongo.

The counterpart to `lib.inline_media.externalize`: public list endpoints hand
back URLs into here instead of megabytes of base64, and this route turns one
back into an ordinary image response the browser and the CDN can cache.

Why the long cache lifetime is safe: the URL carries a hash of the image, so
any edit produces a different URL. Access stays current regardless — the
document is re-read through its collection's public filter on every request,
so unpublishing a post stops serving its cover immediately, cached URL or not.

See `lib/inline_media.py` for the measurements that motivated this.
"""
from fastapi import APIRouter, HTTPException, Query, Request, Response

from lib.inline_media import resolve

# A year. The hash in the URL is what makes `immutable` honest.
CACHE_CONTROL = "public, max-age=31536000, immutable"

# PNG, JPEG and WebP are compressed already; running them through GZipMiddleware
# burns CPU for nothing. Starlette's middleware stands down when the response
# already declares a Content-Encoding, so `identity` is how we opt out. SVG is
# text and is left to compress.
_PRECOMPRESSED = {"image/png", "image/jpeg", "image/jpg", "image/webp",
                  "image/gif", "image/avif"}


def get_media_routes(db) -> APIRouter:
    router = APIRouter(prefix="/media", tags=["media"])

    @router.get("/{source}/{doc_id}")
    async def serve_inline_media(
        source: str,
        doc_id: str,
        request: Request,
        f: str = Query(..., description="dotted path to the image field"),
        v: str = Query(None, description="content hash — cache key only"),
    ):
        found = await resolve(db, source, doc_id, f)
        if found is None:
            raise HTTPException(404, "Image not found")
        data, mime, etag = found

        quoted = f'"{etag}"'
        headers = {"Cache-Control": CACHE_CONTROL, "ETag": quoted}
        if mime in _PRECOMPRESSED:
            headers["Content-Encoding"] = "identity"
        if request.headers.get("if-none-match") == quoted:
            return Response(status_code=304, headers=headers)
        return Response(content=data, media_type=mime, headers=headers)

    return router
