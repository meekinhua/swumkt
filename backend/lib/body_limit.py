"""Request-body size cap for the paste/upload-a-text endpoints (WP9a, 2026-11).

The external-LLM workflow lets a user paste an AI answer (`…/external-import`),
upload a code-frame CSV (`…/coding/import-csv`) or send a prompt body
(`…/external-prompt|pack`). Nothing bounded those bodies: a multi-hundred-MB
paste was read into memory, parsed by the tolerant JSON/markdown cleaners
(several passes over the text) and could be stored in Mongo (16 MB document
limit → 500). A real answer is far smaller — the biggest legitimate case, a
whole thesis chapter set pasted at once, is well under 1 MB.

Pure ASGI, no dependency. For a matching path the body is read up to
``limit + 1`` bytes (Content-Length is checked first when present); over the
limit → 413 with a Thai message in the usual ``{"detail": …}`` shape,
otherwise the buffered body is replayed to the app unchanged.
"""
from __future__ import annotations

import json
import re
from typing import Pattern, Tuple

DEFAULT_LIMIT_BYTES = 2 * 1024 * 1024  # 2 MB

LIMITED_PATHS: Tuple[Pattern, ...] = (
    re.compile(r"/external-(import|prompt|pack)/?$"),
    re.compile(r"^/api/brand-equity/studies/[^/]+/coding/import-csv/?$"),
)

MESSAGE_TH = ("ข้อความที่ส่งมามีขนาดใหญ่เกินไป (เกิน {mb:.0f} MB) — กรุณาวางเฉพาะคำตอบของ AI "
              "หรือแบ่งนำเข้าทีละส่วน")


def path_is_limited(path: str) -> bool:
    return any(rx.search(path or "") for rx in LIMITED_PATHS)


class BodySizeLimitMiddleware:
    def __init__(self, app, limit_bytes: int = DEFAULT_LIMIT_BYTES):
        self.app = app
        self.limit = int(limit_bytes)

    async def _reject(self, send):
        body = json.dumps({"detail": {"code": "payload_too_large",
                                      "message": MESSAGE_TH.format(mb=self.limit / 1024 / 1024)}},
                          ensure_ascii=False).encode("utf-8")
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json; charset=utf-8"),
                                (b"content-length", str(len(body)).encode())]})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") not in ("POST", "PUT", "PATCH") \
                or not path_is_limited(scope.get("path", "")):
            return await self.app(scope, receive, send)
        for k, v in scope.get("headers") or []:
            if k == b"content-length":
                try:
                    if int(v) > self.limit:
                        return await self._reject(send)
                except ValueError:
                    pass
        chunks, size, more = [], 0, True
        while more:
            msg = await receive()
            if msg["type"] == "http.disconnect":
                return
            chunk = msg.get("body", b"")
            size += len(chunk)
            if size > self.limit:
                return await self._reject(send)
            chunks.append(chunk)
            more = msg.get("more_body", False)
        body = b"".join(chunks)
        sent = False

        async def replay():
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        return await self.app(scope, replay, send)
