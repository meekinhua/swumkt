"""Scoped API keys — a way to let a tool edit content without handing it an admin.

The alternative was for `sitectl` to cache the owner's JWT. Three things are
wrong with that. A JWT expires after 72 hours, so a cached one fails on day
four, in the middle of something. It carries the owner's full rights, so a
confused or misdirected agent could change roles, purge users or rotate the
LLM key, none of which content editing needs. And it cannot be taken back: a
signed token is valid until it expires, whatever you do in the database.

A key here is the opposite on all three counts. It does not expire unless you
give it an expiry, it carries an explicit list of scopes and nothing else, and
revoking it is one update.

**The scope check is path-based and it fails closed.** `SCOPE_RULES` is the
complete list of what a key can reach; a request that matches no rule is
refused, so adding a route never silently widens an existing key. `HARD_DENY`
sits in front of that for the operations no key may perform at any scope —
purge and landing-reset destroy data, and `/admin/*` is not content.

Keys are stored as a SHA-256 hash. The plaintext is shown once, when it is
minted, and cannot be recovered afterwards. The `swk_` prefix makes a leaked
key recognisable in a log or a paste, and lets `get_current_user` tell a key
from a JWT without trying to decode it.
"""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

KEY_PREFIX = "swk_"
# Enough to identify the key in a listing without being enough to use it.
VISIBLE_CHARS = 8

COLLECTION = "api_keys"


# Scopes, narrowest useful set. `cms.*` is accepted as a wildcard for all of
# them — convenient for the one key the owner runs, still refused everything
# in HARD_DENY.
SCOPES: Dict[str, str] = {
    "cms.read": "read any CMS document, including drafts",
    "cms.landing.write": "change the homepage document",
    "cms.settings.write": "change site settings (headings, labels)",
    "cms.posts.write": "create, edit, publish and trash posts",
    "cms.revisions.restore": "roll a document back to an earlier revision",
    "cms.faculty.write": "edit faculty profiles and their publication lists",
}
WILDCARD = "cms.*"

# Checked before anything else. These stay out of reach of every key, however
# it is scoped, because they are unrecoverable or are not content at all.
HARD_DENY: Sequence[re.Pattern] = (
    re.compile(r"^/api/cms/posts/[^/]+/purge/?$"),
    re.compile(r"^/api/cms/landing/reset/?$"),
    re.compile(r"^/api/admin(/|$)"),
    re.compile(r"^/api/auth/"),
    re.compile(r"^/api/users(/|$)"),
    re.compile(r"^/api/cms/keys(/|$)"),   # a key cannot mint or revoke keys
    # Lists brand-equity and conjoint studies as AI "sources" — research data
    # that happens to live under /cms, not content a content key should read.
    re.compile(r"^/api/cms/sources(/|$)"),
    # One-off bootstrap from /admin/cms/setup: a bulk insert, run by a person.
    re.compile(r"^/api/cms/faculty/seed/?$"),
)

# (scope, methods, path pattern). First match wins; no match means refused.
SCOPE_RULES: Sequence[Tuple[str, Set[str], re.Pattern]] = (
    ("cms.landing.write", {"PATCH", "PUT"}, re.compile(r"^/api/cms/landing/?$")),
    ("cms.settings.write", {"PATCH", "DELETE"}, re.compile(r"^/api/cms/settings/?$")),
    ("cms.revisions.restore", {"POST"},
     re.compile(r"^/api/cms/revisions/[^/]+/restore/?$")),
    ("cms.posts.write", {"POST", "PUT", "DELETE"},
     re.compile(r"^/api/cms/posts(/.*)?$")),
    ("cms.posts.write", {"POST"}, re.compile(r"^/api/cms/cache/flush/?$")),
    ("cms.faculty.write", {"POST", "PATCH", "DELETE"},
     re.compile(r"^/api/cms/(faculty|papers)(/.*)?$")),
    # Reads last, so a write rule is chosen first for the same path.
    ("cms.read", {"GET", "HEAD"}, re.compile(r"^/api/cms(/.*)?$")),
)


class KeyRejected(Exception):
    """Carries the status the caller should return: 401 unknown, 403 scope."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def looks_like_api_key(token: str) -> bool:
    return isinstance(token, str) and token.startswith(KEY_PREFIX)


def generate_key() -> str:
    return KEY_PREFIX + secrets.token_urlsafe(32)


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def fingerprint(key: str) -> str:
    """The part shown in listings — enough to tell two keys apart."""
    return key[: len(KEY_PREFIX) + VISIBLE_CHARS]


def normalise_scopes(scopes: Sequence[str]) -> List[str]:
    out = []
    for s in scopes:
        s = (s or "").strip()
        if s == WILDCARD:
            out.append(WILDCARD)
        elif s in SCOPES:
            out.append(s)
        else:
            raise ValueError(
                f"unknown scope {s!r} — valid: {', '.join([WILDCARD] + sorted(SCOPES))}")
    if not out:
        raise ValueError("a key with no scopes could do nothing")
    return sorted(set(out))


_NON_CANONICAL = re.compile(r"(//|/\.\.?(/|$)|%2e|%2f|%5c|\\)", re.IGNORECASE)


def _is_canonical_path(path: str) -> bool:
    """No `//`, no `.` or `..` segments, no encoded dot/slash/backslash."""
    return bool(path) and path.startswith("/") and not _NON_CANONICAL.search(path)


def required_scope(method: str, path: str) -> Optional[str]:
    """Which scope this request needs, or None if no key may make it.

    None is both "denied outright" and "no rule covers this", deliberately:
    a route nobody thought about is not a route a key should reach.

    A path that is not already in canonical form is refused rather than
    normalised. `/api/cms/posts/../../admin/users` matches the posts rule as a
    string, and whether it then reaches an admin route depends on what a proxy
    in front does with the dot segments — not something to leave to chance.
    No legitimate client sends such a path.
    """
    clean = path.split("?")[0]
    if not _is_canonical_path(clean):
        return None
    for pattern in HARD_DENY:
        if pattern.match(clean):
            return None
    for scope, methods, pattern in SCOPE_RULES:
        if method.upper() in methods and pattern.match(clean):
            return scope
    return None


def scope_allows(granted: Sequence[str], needed: str) -> bool:
    return WILDCARD in granted or needed in granted


def build_key_document(label: str, scopes: Sequence[str], created_by: str,
                       expires_at: Optional[str] = None) -> Tuple[Dict[str, Any], str]:
    """Returns (document to store, the plaintext key to show once)."""
    expires_at = parse_expiry(expires_at)
    key = generate_key()
    doc = {
        "id": str(uuid.uuid4()),
        "label": label.strip() or "unnamed",
        "key_hash": hash_key(key),
        "fingerprint": fingerprint(key),
        "scopes": normalise_scopes(scopes),
        "created_by": created_by,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "last_used_at": None,
        "revoked_at": None,
    }
    return doc, key


def parse_expiry(value: Any) -> Optional[str]:
    """Validate an expiry at mint time and return it normalised to UTC ISO.

    Raises ValueError for anything unreadable. This used to be stored verbatim
    and checked only at use, where an unparseable value was treated as "no
    expiry" — so a typo in `--expires-at` minted a key that lived forever.
    """
    if value in (None, ""):
        return None
    when = datetime.fromisoformat(str(value).strip().replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    if when <= datetime.now(timezone.utc):
        raise ValueError(f"expiry {value!r} is already in the past")
    return when.astimezone(timezone.utc).isoformat()


def _expired(doc: Dict[str, Any]) -> bool:
    exp = doc.get("expires_at")
    if not exp:
        return False
    try:
        when = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
    except ValueError:
        # parse_expiry guarantees new keys are readable, so this is a value
        # someone edited into the database by hand. A credential whose
        # lifetime cannot be read is treated as over, not as unlimited.
        return True
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when < datetime.now(timezone.utc)


async def authorize(db, token: str, method: str, path: str) -> Dict[str, Any]:
    """Resolve a key and check it may make this request. Raises KeyRejected.

    The lookup is by hash, so the plaintext is never compared against anything
    stored, and `compare_digest` keeps the final check constant-time even
    though a hash lookup already removes most of the timing signal.
    """
    doc = await db[COLLECTION].find_one({"key_hash": hash_key(token)}, {"_id": 0})
    if not doc or not hmac.compare_digest(doc.get("key_hash", ""), hash_key(token)):
        raise KeyRejected(401, "Invalid API key")
    if doc.get("revoked_at"):
        raise KeyRejected(401, f"API key '{doc.get('label')}' was revoked")
    if _expired(doc):
        raise KeyRejected(401, f"API key '{doc.get('label')}' expired")

    needed = required_scope(method, path)
    if needed is None:
        raise KeyRejected(
            403, f"API keys cannot {method} {path} — content endpoints only")
    if not scope_allows(doc.get("scopes") or [], needed):
        raise KeyRejected(
            403,
            f"API key '{doc.get('label')}' lacks the '{needed}' scope "
            f"(has: {', '.join(doc.get('scopes') or []) or 'none'})")
    return doc


async def touch(db, key_id: str) -> None:
    """Record use. Best-effort — never fail a request over bookkeeping."""
    try:
        await db[COLLECTION].update_one(
            {"id": key_id},
            {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}})
    except Exception:
        pass
