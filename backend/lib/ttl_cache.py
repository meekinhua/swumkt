"""
Simple async-safe TTL cache for read-only public aggregations.

Why: Endpoints like `/api/showcase/index`, `/api/brand-equity/showcase`,
`/api/share/showcase-index` re-run dozens of `count_documents` + aggregation
queries on every visit. For public/non-critical data, caching the response
for ~60s gives near-instant page loads with negligible staleness.

Usage:
    from lib.ttl_cache import async_ttl_cache

    @async_ttl_cache(ttl_seconds=60)
    async def expensive_endpoint(...):
        ...

The cache key is built from the wrapped function name + positional args +
sorted kwargs (best-effort `repr`). Skip caching by passing `_skip_cache=True`
to the call site — useful for owner-side fresh reads.
"""
import asyncio
import functools
import time
from typing import Any, Callable, Dict, Tuple


_store: Dict[str, Tuple[float, Any]] = {}
_locks: Dict[str, asyncio.Lock] = {}


def _make_key(name: str, args: tuple, kwargs: dict) -> str:
    # Drop FastAPI Request objects (un-hashable, dynamic) from key
    safe_args = tuple(repr(a) for a in args if not hasattr(a, "scope"))
    safe_kw = tuple(sorted(
        (k, repr(v)) for k, v in kwargs.items()
        if not hasattr(v, "scope") and not k.startswith("_")
    ))
    return f"{name}|{safe_args}|{safe_kw}"


def async_ttl_cache(ttl_seconds: int = 60):
    """Decorate an async function with an in-memory TTL cache.

    Single-flight: concurrent callers wait on the same lock so the underlying
    work runs once."""
    def deco(fn: Callable):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            if kwargs.pop("_skip_cache", False):
                return await fn(*args, **kwargs)
            key = _make_key(fn.__qualname__, args, kwargs)
            now = time.monotonic()
            hit = _store.get(key)
            if hit and (now - hit[0]) < ttl_seconds:
                return hit[1]
            lock = _locks.setdefault(key, asyncio.Lock())
            async with lock:
                # Re-check after acquiring lock — another coroutine may have filled it
                hit = _store.get(key)
                if hit and (time.monotonic() - hit[0]) < ttl_seconds:
                    return hit[1]
                value = await fn(*args, **kwargs)
                _store[key] = (time.monotonic(), value)
                return value
        wrapper.cache_clear = lambda: _store.clear()  # noqa: E731
        return wrapper
    return deco


def invalidate_prefix(prefix: str) -> int:
    """Remove all cache entries whose key starts with `prefix`. Returns count cleared."""
    dead = [k for k in _store if k.startswith(prefix)]
    for k in dead:
        _store.pop(k, None)
    return len(dead)
