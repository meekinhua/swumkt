#!/usr/bin/env python3
"""sitectl — change swumkt.org content on a running deploy, from a terminal.

Everything here talks to the public API of whichever instance you point it at.
Nothing is rebuilt and nothing is redeployed; the next page load shows the new
text once the server's 60–300s cache turns over, which this tool waits for and
confirms rather than assuming.

    sitectl login                              # once; token cached for 72h
    sitectl landing get slides.0.heroPre
    sitectl landing set slides.0.lede "ข้อความใหม่"
    sitectl text set learn.heading "อ่านก่อนใคร"
    sitectl post list
    sitectl post publish <id>
    sitectl undo list
    sitectl undo restore <rev-id>

Design notes, each of which is load-bearing:

* **Partial writes only.** `PUT /api/cms/landing` replaces the whole document
  and writes null over anything you leave out, which for a "change one
  headline" request would silently destroy the featured-article config. This
  tool only ever calls `PATCH`, which deep-merges.

* **Optimistic concurrency.** Every landing write sends `If-Match` with the
  version it read. If someone is editing in `/admin/cms/landing` at the same
  time you get a 409 instead of overwriting them.

* **A diff before anything changes**, and confirmation for destructive edits —
  emptying a list, deleting a slide, or touching many fields at once.

* **A deny-list that the prompt cannot talk you out of.** Purge, landing reset,
  user and role endpoints are not reachable from this tool at all. The undo
  story only works if nothing here can destroy a document outright.

* **Read-back through the *public* endpoint.** "The write returned 200" is not
  the same as "a visitor sees it": the server caches public responses per
  process. This tool re-reads the public URL and reports what a visitor
  actually gets.

Credentials live in ~/.swumkt/credentials.json, never in the repo.
Override the target with --api or SWUMKT_API (default https://swumkt.org).
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import requests
except ImportError:
    sys.exit("sitectl needs `requests` — pip install requests")

DEFAULT_API = os.environ.get("SWUMKT_API", "https://swumkt.org").rstrip("/")
CRED_PATH = Path.home() / ".swumkt" / "credentials.json"

# Endpoints this tool will never call, whatever it is asked to do. Each one is
# either unrecoverable or outside the remit of content editing.
# Matched as path prefixes and as a `/purge` suffix, not as whole paths: the
# first version compared the end of the path, so `/admin/users` was blocked but
# `/admin/users/<id>/role` — the one that actually changes a privilege — was not.
DENIED_PREFIXES = (
    "/admin/users",           # roles and accounts are not content
    "/admin/settings",        # model keys and provider secrets
    "/auth/register",
    "/cms/landing/reset",     # throws the live homepage away
)
DENIED_SUFFIXES = (
    "/purge",                 # hard delete
    "/landing/reset",
)


def _check_denied(path: str) -> None:
    """Refuse a path on the deny-list — after resolving dot segments.

    Ids are interpolated into paths, so `post publish "../../admin/users/x"`
    built `/cms/posts/../../admin/users/x`, which matched nothing on the list
    as a string. With a login token there is no server-side scope gate behind
    this check, so it has to look at the path the request will actually reach.
    """
    import posixpath
    from urllib.parse import unquote
    raw = path.split("?")[0]
    clean = posixpath.normpath(unquote(raw).replace("\\", "/"))
    if clean != raw.rstrip("/") and clean + "/" != raw:
        raise SystemExit(f"refused: {path} is not a plain path (dot segments or encoding)")
    clean = clean.rstrip("/")
    for p in DENIED_PREFIXES:
        if clean == p or clean.startswith(p + "/"):
            raise SystemExit(f"refused: {path} is on sitectl's deny-list")
    for suf in DENIED_SUFFIXES:
        if clean.endswith(suf):
            raise SystemExit(f"refused: {path} is on sitectl's deny-list")

# Beyond this many changed leaves, ask before writing.
CONFIRM_ABOVE_FIELDS = 6


# Fields CmsPostUpdate accepts. The server ignores anything else, so without
# this check a typo returns 200 and changes nothing, which reads as success.
POST_FIELDS = (
    "title", "title_en", "slug", "category", "excerpt", "body_md",
    "cover_image", "cover_caption", "read_min", "tags", "source_refs",
    "media", "status", "pinned_to_home", "pinned_order", "cta_url",
    "hero_title_lines", "hero_accent_idx", "type",
    "author_faculty_ids", "author_name",
)

# Mirrors FACULTY_FIELDS / PAPER_FIELDS in backend/routes/faculty.py. The server
# refuses unknown fields too; checking here just fails before the round trip.
FACULTY_FIELDS = (
    "slug", "title_th", "name_th", "title_en", "name_en", "rank_th", "rank_en",
    "department_th", "department_en", "bio_th", "bio_en", "email", "photo",
    "photo_credit", "research_areas", "links", "sort_order", "status", "show_email",
)
PAPER_FIELDS = (
    "title", "title_th", "authors", "faculty_ids", "year", "venue", "type",
    "doi", "url", "pdf_url", "open_access", "cited_by", "cited_by_as_of",
    "status", "confidence", "review_note", "slug",
)


# ── plumbing ────────────────────────────────────────────────────────────────

class Api:
    def __init__(self, base: str, token: Optional[str] = None):
        self.base = base.rstrip("/")
        self.token = token
        self.s = requests.Session()

    def _headers(self, extra: Optional[dict] = None) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        h.update(extra or {})
        return h

    def req(self, method: str, path: str, **kw) -> requests.Response:
        _check_denied(path)
        url = f"{self.base}/api{path}"
        r = self.s.request(method, url, headers=self._headers(kw.pop("headers", None)),
                           timeout=kw.pop("timeout", 120), **kw)
        if r.status_code == 401:
            raise SystemExit("not authenticated — run: sitectl login")
        if r.status_code == 403:
            detail = ""
            try:
                detail = r.json().get("detail", "")
            except Exception:
                detail = r.text[:200]
            if "scope" in detail or "API key" in detail:
                # The key is valid; it is simply not allowed to do this.
                raise SystemExit(f"refused: {detail}")
            raise SystemExit("forbidden — this credential is not an admin on " + self.base)
        return r

    def get(self, path: str, **kw) -> Any:
        r = self.req("GET", path, **kw)
        r.raise_for_status()
        return r.json()


def load_token() -> Tuple[Optional[str], str]:
    """Find a credential, preferring a scoped API key over a borrowed login.

    A key is better in every way that matters here: it does not expire after
    72 hours, it carries only the content scopes, and it can be revoked. The
    login path stays as a fallback for someone who has an admin password and
    no key yet.
    """
    saved: Dict[str, Any] = {}
    if CRED_PATH.exists():
        try:
            saved = json.loads(CRED_PATH.read_text(encoding="utf-8"))
        except Exception:
            # A corrupt file must not silently retarget the tool at the
            # production default with no credential — say so.
            print(f"warning: {CRED_PATH} is unreadable; ignoring it", file=sys.stderr)
            saved = {}
    # The target comes from SWUMKT_API, then the saved file, then the default —
    # whichever credential is used. Taking the key from the environment used
    # to drop the saved host, so a staging key was sent to production.
    api = os.environ.get("SWUMKT_API") or saved.get("api") or DEFAULT_API
    for env in ("SWUMKT_API_KEY", "SWUMKT_TOKEN"):
        if os.environ.get(env):
            return os.environ[env], api
    return saved.get("api_key") or saved.get("token"), api


def _write_credentials(data: Dict[str, Any]) -> None:
    """Write atomically and private from the first byte.

    `write_text` then `chmod` left the file world-readable for a moment, and a
    crash between truncate and write left it empty.
    """
    import tempfile
    CRED_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(CRED_PATH.parent), prefix=".cred-")
    try:
        try:
            os.fchmod(fd, 0o600)
        except (AttributeError, OSError):
            pass  # Windows: no POSIX modes; the profile directory is private already
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp, CRED_PATH)
    except Exception:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def save_api_key(key: str, api: str) -> None:
    existing: Dict[str, Any] = {}
    if CRED_PATH.exists():
        try:
            existing = json.loads(CRED_PATH.read_text(encoding="utf-8"))
        except Exception:
            existing = {}
    existing.update({"api_key": key, "api": api})
    existing.pop("token", None)  # a key supersedes a cached login
    _write_credentials(existing)


def save_token(token: str, api: str) -> None:
    _write_credentials({"token": token, "api": api})


def walk(doc: Any, path: str) -> Any:
    cur = doc
    for seg in path.split("."):
        if isinstance(cur, dict):
            cur = cur.get(seg)
        elif isinstance(cur, list) and seg.isdigit():
            cur = cur[int(seg)] if int(seg) < len(cur) else None
        else:
            return None
        if cur is None:
            return None
    return cur


def nest(path: str, value: Any) -> Dict[str, Any]:
    """`a.0.b` + v -> {"a": [{"b": v}]} — but a list index needs the existing
    list, so this is only used for all-dict paths; see `patch_for`."""
    segs = path.split(".")
    out: Any = value
    for seg in reversed(segs):
        if seg.isdigit():
            raise SystemExit(
                f"'{path}' indexes a list. Lists are replaced whole: fetch it with "
                f"`get`, edit, and pass the whole list as JSON.")
        out = {seg: out}
    return out


def patch_for(current: Any, path: str, value: Any) -> Dict[str, Any]:
    """Build the smallest patch that sets `path` to `value`.

    A list index is handled by rebuilding that list from the current document:
    the server replaces lists wholesale, so sending only element 2 would drop
    the others.
    """
    segs = path.split(".")
    idxs = [i for i, s in enumerate(segs) if s.isdigit()]
    if not idxs:
        return nest(path, value)

    cut = idxs[0]
    list_path, rest = ".".join(segs[:cut]), segs[cut:]
    lst = walk(current, list_path) if list_path else current
    if not isinstance(lst, list):
        raise SystemExit(f"'{list_path}' is not a list in the current document")

    i = int(rest[0])
    if i >= len(lst):
        raise SystemExit(f"'{list_path}' has {len(lst)} items — index {i} does not exist")
    new_list = json.loads(json.dumps(lst))
    if len(rest) == 1:
        new_list[i] = value
    else:
        cur = new_list[i]
        for seg in rest[1:-1]:
            if seg.isdigit():
                cur = cur[int(seg)]
            else:
                cur = cur.setdefault(seg, {})
        leaf = rest[-1]
        if leaf.isdigit():
            cur[int(leaf)] = value
        else:
            cur[leaf] = value
    return nest(list_path, new_list) if list_path else new_list


def leaves(obj: Any, prefix: str = "") -> List[Tuple[str, Any]]:
    if isinstance(obj, dict):
        out = []
        for k, v in obj.items():
            out += leaves(v, f"{prefix}.{k}" if prefix else k)
        return out
    if isinstance(obj, list):
        out = []
        for i, v in enumerate(obj):
            out += leaves(v, f"{prefix}.{i}")
        return out
    return [(prefix, obj)]


def shorten(v: Any, n: int = 72) -> str:
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    s = s.replace("\n", "⏎")
    if s.startswith("data:") or len(s) > 400:
        return f"<{len(s)} chars>"
    return s if len(s) <= n else s[: n - 1] + "…"


def show_diff(before: Any, after: Any) -> int:
    """Print a field-level before/after. Returns the number of changed leaves."""
    b, a = dict(leaves(before)), dict(leaves(after))
    changed = [k for k in sorted(set(b) | set(a)) if b.get(k) != a.get(k)]
    if not changed:
        print("  (no change)")
        return 0
    for k in changed:
        if k not in b:
            print(f"  + {k}\n      {shorten(a[k])}")
        elif k not in a:
            print(f"  - {k}\n      was: {shorten(b[k])}")
        else:
            print(f"  ~ {k}\n      was: {shorten(b[k])}\n      now: {shorten(a[k])}")
    return len(changed)


def risky(before: Any, after: Any) -> Optional[str]:
    """Name the first destructive-looking aspect of this change, if any."""
    b, a = dict(leaves(before)), dict(leaves(after))
    gone = [k for k in b if k not in a]
    if gone:
        return f"removes {len(gone)} field(s), e.g. {gone[0]}"
    emptied = [k for k, v in a.items() if isinstance(v, str) and not v.strip()
               and isinstance(b.get(k), str) and b[k].strip()]
    if emptied:
        return f"blanks {len(emptied)} field(s), e.g. {emptied[0]}"
    n = sum(1 for k in set(b) | set(a) if b.get(k) != a.get(k))
    if n > CONFIRM_ABOVE_FIELDS:
        return f"changes {n} fields at once"
    return None


def confirm(question: str, assume_yes: bool) -> bool:
    if assume_yes:
        print(f"  (--yes) {question}")
        return True
    if not sys.stdin.isatty():
        print(f"  refusing without confirmation: {question}\n"
              f"  re-run with --yes if that is what you want.")
        return False
    return input(f"  {question} [y/N] ").strip().lower() in ("y", "yes")


def _unverifiable(expected: Any) -> Optional[str]:
    """Why this value cannot be compared against the public response, if so."""
    blob = expected if isinstance(expected, str) else json.dumps(expected, ensure_ascii=False)
    if "data:image/" in blob:
        # The public endpoint serves inline images as /api/media/... URLs
        # (lib/inline_media.py), so the bytes sent will never come back.
        return "the value is an inline image; the public API returns a URL for it"
    return None


def verify_public(api: Api, path: str, dotted: str, expected: Any,
                  tries: int = 8, wait: float = 20.0) -> bool:
    """Confirm a visitor sees the change, not just that the write returned 200.

    Public responses are cached per process for 60–300s, so a read straight
    after a write can legitimately still show the old value.
    """
    why = _unverifiable(expected)
    if why is not None:
        print(f"  (not read back: {why})")
        return True
    for n in range(tries):
        try:
            got = walk(api.get(path), dotted)
        except Exception as e:
            print(f"  read-back failed: {e}")
            return False
        if got == expected:
            print(f"  ✓ live at {api.base}{path} ({dotted})")
            return True
        if n == 0:
            print(f"  waiting for the public cache to turn over…", end="", flush=True)
        else:
            print(".", end="", flush=True)
        time.sleep(wait)
    print(f"\n  ✗ still serving the old value after {int(tries * wait)}s.\n"
          f"    The write was accepted — if the backend runs several workers, "
          f"each clears its own cache only when its TTL expires.")
    return False


# ── commands ────────────────────────────────────────────────────────────────

def cmd_login(api: Api, a) -> int:
    email = a.email or input("email: ").strip()
    pw = a.password or getpass.getpass("password: ")
    r = api.s.post(f"{api.base}/api/auth/login",
                   json={"email": email, "password": pw}, timeout=60)
    if r.status_code != 200:
        print(f"login failed ({r.status_code}): {r.text[:300]}")
        if r.status_code in (401, 404):
            print("\nIf this account signs in with Google, it has no password to post\n"
                  "here. Set one, or ask for a dedicated admin account for the tool.")
        return 1
    tok = r.json().get("access_token")
    if not tok:
        print("login returned no access_token"); return 1
    save_token(tok, api.base)
    print(f"logged in to {api.base} — token cached at {CRED_PATH} (valid 72h)")
    return 0


def cmd_use_key(api: Api, a) -> int:
    """Store a key minted elsewhere, and prove it works before saving it."""
    key = a.key or os.environ.get("SWUMKT_API_KEY") or getpass.getpass("api key: ")
    key = key.strip()
    if not key.startswith("swk_"):
        print("that does not look like a SWUMKT API key (they start with swk_)")
        return 1
    # Probe an endpoint that actually authenticates. The first version asked
    # for /cms/settings, which is public — it answered 200 to any header at
    # all, so a mistyped or revoked key was saved over a working one.
    probe = Api(api.base, key)
    r = probe.s.get(f"{api.base}/api{_KEY_PROBE}", headers=probe._headers(), timeout=60)
    if r.status_code != 200:
        detail = ""
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text[:200]
        print(f"the key was refused by {api.base} ({r.status_code}): {detail}")
        print("nothing was saved.")
        return 1
    save_api_key(key, api.base)
    print(f"key accepted by {api.base} — stored at {CRED_PATH}")
    return 0


# Endpoints that require a credential, so the status codes say something
# about it. (Public ones answer 200 to anyone and would prove nothing.)
_KEY_PROBE = "/cms/revisions?doc=landing&limit=1"
_WHOAMI_PROBES = (
    ("/cms/revisions?doc=landing&limit=1", "read revisions"),
    ("/cms/faculty", "read faculty admin"),
    ("/cms/papers?status=review", "read held papers"),
)


def cmd_whoami(api: Api, a) -> int:
    if not api.token:
        print("no credential — set SWUMKT_API_KEY, or run `sitectl use-key`")
        return 1
    kind = "API key" if api.token.startswith("swk_") else "login token"
    # The prefix and fingerprint only — never enough of the secret to use it.
    print(f"{kind} ({api.token[:12]}…) against {api.base}")
    ok = True
    for path, what in _WHOAMI_PROBES:
        r = api.s.get(f"{api.base}/api{path}", headers=api._headers(), timeout=60)
        verdict = {200: "ok", 401: "credential rejected", 403: "not allowed"}.get(
            r.status_code, str(r.status_code))
        print(f"  {what:20} -> {r.status_code} {verdict}")
        ok = ok and r.status_code == 200
    return 0 if ok else 1


def cmd_landing_get(api: Api, a) -> int:
    doc = api.get("/cms/landing")
    out = walk(doc, a.path) if a.path else doc
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_landing_set(api: Api, a) -> int:
    current = api.get("/cms/landing")
    version = current.get("version", 0)
    value = parse_value(a.value, a.json)
    patch = patch_for(current, a.path, value)

    print(f"{api.base} · landing (version {version})")
    merged = deep_merge_local(current, patch)
    n = show_diff(current, merged)
    if n == 0:
        print("nothing to do."); return 0
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    warn = risky(current, merged)
    if warn and not confirm(f"this {warn}. continue?", a.yes):
        return 1

    r = api.req("PATCH", "/cms/landing", json=patch,
                headers={"If-Match": str(version)})
    if r.status_code == 409:
        print(f"conflict: {r.json().get('detail')}"); return 1
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print(f"  written — version {r.json().get('version')}")
    # Compare against what the merge should produce, not the raw input:
    # the server normalises values, so the two rarely match literally.
    return 0 if verify_public(api, "/cms/landing", a.path, walk(merged, a.path)) else 2


def cmd_text_get(api: Api, a) -> int:
    doc = api.get("/cms/settings")
    print(json.dumps(walk(doc, a.path) if a.path else doc, ensure_ascii=False, indent=2))
    return 0


def cmd_text_set(api: Api, a) -> int:
    current = api.get("/cms/settings")
    value = parse_value(a.value, a.json)
    patch = patch_for(current, a.path, value)
    merged = deep_merge_local(current, patch)

    print(f"{api.base} · site settings")
    if show_diff(current, merged) == 0:
        print("nothing to do."); return 0
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    warn = risky(current, merged)
    if warn and not confirm(f"this {warn}. continue?", a.yes):
        return 1

    r = api.req("PATCH", "/cms/settings", json=patch)
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  written")
    # Compare against what the merge should produce, not the raw input:
    # the server normalises values, so the two rarely match literally.
    return 0 if verify_public(api, "/cms/settings", a.path, walk(merged, a.path)) else 2


def cmd_text_unset(api: Api, a) -> int:
    current = api.get("/cms/settings")
    was = walk(current, a.path)
    if was is None:
        print(f"'{a.path}' is not overridden — the page already uses its built-in text.")
        return 0
    print(f"{api.base} · site settings")
    print(f"  - {a.path}")
    print(f"      was: {shorten(was)}")
    print("  the page will fall back to the text compiled into the component.")
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    if not confirm("remove this override?", a.yes):
        return 1
    r = api.req("DELETE", "/cms/settings", params={"path": a.path})
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  removed")
    return 0


def cmd_post_list(api: Api, a) -> int:
    rows = api.get(f"/cms/posts/public?limit={a.limit}").get("items", [])
    if not rows:
        print("(no published posts)"); return 0
    print(f"{'id':38} {'type':13} {'published':12} title")
    for p in rows:
        print(f"{p.get('id',''):38} {p.get('type',''):13} "
              f"{str(p.get('published_at',''))[:10]:12} {p.get('title','')[:60]}")
    return 0


def _safe_id(value: str, what: str = "id") -> str:
    """Ids are interpolated into URL paths; refuse anything that could step
    out of the segment it is meant to fill."""
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value or "") or ".." in value:
        raise SystemExit(f"'{value}' is not a valid {what}")
    return value


def cmd_post_set(api: Api, a) -> int:
    if a.field not in POST_FIELDS:
        raise SystemExit(
            f"'{a.field}' is not a writable post field. "
            f"valid: {', '.join(POST_FIELDS)}")
    _safe_id(a.id, "post id")
    before = api.get(f"/cms/posts/{a.id}")
    value = parse_value(a.value, a.json)
    body = {a.field: value}
    print(f"{api.base} · post {a.id} — {before.get('title','')}")
    if show_diff({a.field: before.get(a.field)}, {a.field: value}) == 0:
        print("nothing to do."); return 0
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    # Same gate as landing and settings: blanking a body or removing a field
    # needs a deliberate --yes.
    warn = risky({a.field: before.get(a.field)}, {a.field: value})
    if warn and not confirm(f"this {warn}. continue?", a.yes):
        return 1
    r = api.req("PUT", f"/cms/posts/{a.id}", json=body)
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  written")
    slug = r.json().get("slug") or before.get("slug")
    if slug and before.get("status") == "published":
        verify_public(api, f"/cms/posts/public/by-slug/{slug}", a.field, value)
    return 0


def cmd_post_status(api: Api, a, status: str) -> int:
    _safe_id(a.id, "post id")
    if a.dry_run:
        # --dry-run was accepted here and then ignored; the post changed anyway.
        cur = api.get(f"/cms/posts/{a.id}")
        print(f"  {cur.get('title','')}: {cur.get('status')} -> {status}")
        print("(--dry-run — nothing sent)")
        return 0
    r = api.req("PUT", f"/cms/posts/{a.id}", json={"status": status})
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    d = r.json()
    print(f"  {d.get('title','')} -> {status}")
    if status == "published" and d.get("slug"):
        print(f"  {api.base}/learn/{d['slug']}")
    return 0


def cmd_undo_list(api: Api, a) -> int:
    _safe_id(a.doc, "document")
    rows = api.get("/cms/revisions", params={"doc": a.doc, "limit": a.limit}).get("items", [])
    if not rows:
        print("(no revisions yet — they are written from the next edit onward)")
        return 0
    print(f"{'revision':38} {'saved':21} {'by':28} what")
    for r in rows:
        print(f"{r.get('id',''):38} {str(r.get('saved_at',''))[:19]:21} "
              f"{str(r.get('actor',''))[:26]:28} {r.get('label','')}")
    return 0


def cmd_undo_restore(api: Api, a) -> int:
    _safe_id(a.rev_id, "revision id")
    if not confirm(f"restore revision {a.rev_id}? "
                   f"(the current version is snapshotted first)", a.yes):
        return 1
    r = api.req("POST", f"/cms/revisions/{a.rev_id}/restore")
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print(f"  restored: {json.dumps(r.json(), ensure_ascii=False)}")
    return 0


def cmd_flush(api: Api, a) -> int:
    r = api.req("POST", "/cms/cache/flush")
    print(r.text[:300])
    return 0 if r.status_code < 400 else 1


# ── faculty ─────────────────────────────────────────────────────────────────

def _faculty_by_slug(api: Api, slug: str) -> dict:
    _safe_id(slug, "faculty slug")
    rows = api.get("/cms/faculty").get("items", [])
    for f in rows:
        if f.get("slug") == slug or f.get("id") == slug:
            return f
    raise SystemExit(f"no faculty '{slug}' — `sitectl faculty list` shows the slugs")


def _name(f: dict) -> str:
    t = (f.get("title_th") or "").strip()
    return f"{t}{f.get('name_th', '')}" if t else f.get("name_th", "")


def cmd_faculty_list(api: Api, a) -> int:
    rows = api.get("/cms/faculty").get("items", [])
    if not rows:
        print("(no faculty yet — run backend/scripts/seed_faculty.py on the server)")
        return 0
    print(f"{'slug':28} {'status':10} name")
    for f in rows:
        print(f"{f.get('slug',''):28} {f.get('status',''):10} {_name(f)}")
    return 0


def cmd_faculty_get(api: Api, a) -> int:
    f = _faculty_by_slug(api, a.slug)
    out = walk(f, a.path) if a.path else f
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


def cmd_faculty_set(api: Api, a) -> int:
    top = a.path.split(".")[0]
    if top not in FACULTY_FIELDS:
        raise SystemExit(f"'{top}' is not a faculty field. valid: {', '.join(FACULTY_FIELDS)}")
    f = _faculty_by_slug(api, a.slug)
    value = parse_value(a.value, a.json)
    patch = patch_for(f, a.path, value)
    merged = deep_merge_local(f, patch)

    print(f"{api.base} · {_name(f)}")
    if show_diff({top: f.get(top)}, {top: merged.get(top)}) == 0:
        print("nothing to do."); return 0
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    warn = risky({top: f.get(top)}, {top: merged.get(top)})
    if warn and not confirm(f"this {warn}. continue?", a.yes):
        return 1
    r = api.req("PATCH", f"/cms/faculty/{f['id']}", json=patch)
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  written")
    if f.get("status") == "published":
        verify_public(api, f"/faculty/{merged.get('slug', f['slug'])}",
                      f"faculty.{a.path}", walk(merged, a.path))
    return 0


def cmd_faculty_photo(api: Api, a) -> int:
    """Upload a portrait from a local file.

    The image is sent as a data URI and stored on the record; the public API
    then serves it through /api/media as a cacheable file, so it never rides
    inside the JSON. The old photo is kept in the revision history.
    """
    import base64
    import mimetypes
    path = Path(a.file)
    if not path.is_file():
        raise SystemExit(f"no such file: {path}")
    mime = mimetypes.guess_type(path.name)[0] or ""
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise SystemExit(f"{path.name}: use a JPEG, PNG or WebP (got {mime or 'unknown'})")
    data = path.read_bytes()
    if len(data) > 3 * 1024 * 1024:
        raise SystemExit(
            f"{path.name} is {len(data)//1024} KB — resize it to under 3 MB first. "
            f"A portrait shown at 260px wide needs nothing like that.")
    f = _faculty_by_slug(api, a.slug)
    print(f"{api.base} · {_name(f)}")
    print(f"  photo: {str(f.get('photo') or '—')[:70]}")
    print(f"     -> {path.name} ({len(data)//1024} KB, {mime})")
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    if not confirm("replace the portrait?", a.yes):
        return 1
    uri = f"data:{mime};base64,{base64.b64encode(data).decode()}"
    r = api.req("PATCH", f"/cms/faculty/{f['id']}", json={"photo": uri})
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  replaced — the previous photo is in `sitectl undo list --doc "
          f"{f['id']}`")
    return 0


# ── papers ──────────────────────────────────────────────────────────────────

def cmd_paper_list(api: Api, a) -> int:
    q = []
    if a.status:
        q.append(f"status={a.status}")
    if a.faculty:
        q.append(f"faculty_id={_faculty_by_slug(api, a.faculty)['id']}")
    rows = api.get("/cms/papers" + ("?" + "&".join(q) if q else "")).get("items", [])
    if not rows:
        print("(none)"); return 0
    for p in rows:
        flag = {"published": " ", "review": "?", "hidden": "x"}.get(p.get("status"), " ")
        print(f"{flag} {p['id']:22} {p.get('year') or '----'}  {p.get('title','')[:66]}")
        if a.status == "review" and p.get("review_note"):
            print(f"  {'':22}       ↳ {p['review_note'][:90]}")
    if not a.status:
        print("\n  ? = held for review (not shown on the site)   x = hidden")
    return 0


def cmd_paper_set(api: Api, a) -> int:
    _safe_id(a.id, "paper id")
    if a.field not in PAPER_FIELDS:
        raise SystemExit(f"'{a.field}' is not a paper field. valid: {', '.join(PAPER_FIELDS)}")
    rows = api.get("/cms/papers").get("items", [])
    cur = next((p for p in rows if p["id"] == a.id), None)
    if not cur:
        raise SystemExit(f"no paper '{a.id}' — `sitectl paper list` shows the ids")
    value = parse_value(a.value, a.json)
    print(f"{api.base} · {cur.get('title','')[:70]}")
    if show_diff({a.field: cur.get(a.field)}, {a.field: value}) == 0:
        print("nothing to do."); return 0
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    r = api.req("PATCH", f"/cms/papers/{a.id}", json={a.field: value})
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print("  written")
    return 0


def cmd_paper_status(api: Api, a, status: str) -> int:
    _safe_id(a.id, "paper id")
    rows = api.get("/cms/papers").get("items", [])
    cur = next((p for p in rows if p["id"] == a.id), None)
    if not cur:
        raise SystemExit(f"no paper '{a.id}'")
    if a.dry_run:
        print(f"  {cur.get('title','')[:66]}: {cur.get('status')} -> {status}")
        if cur.get("review_note"):
            print(f"  held because: {cur['review_note']}")
        print("(--dry-run — nothing sent)")
        return 0
    if cur.get("status") == "review" and status == "published":
        print(f"  {cur.get('title','')}")
        if cur.get("review_note"):
            print(f"  held because: {cur['review_note']}")
        if not confirm("you have checked this and it is right — publish it?", a.yes):
            return 1
    r = api.req("PATCH", f"/cms/papers/{a.id}", json={"status": status})
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print(f"  {cur.get('title','')[:66]} -> {status}")
    return 0


def cmd_paper_add(api: Api, a) -> int:
    fids = [_faculty_by_slug(api, s)["id"] for s in a.faculty]
    body = {"title": a.title, "faculty_ids": fids}
    for k in ("doi", "venue", "url"):
        if getattr(a, k):
            body[k] = getattr(a, k)
    if a.year:
        body["year"] = a.year
    if a.authors:
        body["authors"] = [s.strip() for s in a.authors.split(";") if s.strip()]
    print(json.dumps(body, ensure_ascii=False, indent=2))
    if a.dry_run:
        print("(--dry-run — nothing sent)"); return 0
    r = api.req("POST", "/cms/papers", json=body)
    if r.status_code >= 400:
        print(f"failed ({r.status_code}): {r.text[:400]}"); return 1
    print(f"  added {r.json().get('id')}")
    return 0


# ── helpers used by commands ────────────────────────────────────────────────

def parse_value(raw: str, force_json: bool) -> Any:
    if force_json:
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            raise SystemExit(f"--json given but the value is not JSON: {e}")
    if raw.startswith("@"):
        return Path(raw[1:]).read_text(encoding="utf-8")
    return raw


def deep_merge_local(base: Any, patch: Any) -> Any:
    """Mirror of the server's merge, so the diff shown matches what will land."""
    if isinstance(base, dict) and isinstance(patch, dict):
        out = dict(base)
        for k, v in patch.items():
            out[k] = deep_merge_local(base.get(k), v) if k in base else v
        return out
    return patch


def main(argv: Optional[List[str]] = None) -> int:
    token, saved_api = load_token()
    # The same flags on the top-level parser and on every leaf, so they work
    # before OR after the subcommand. argparse does not pass them down the
    # chain, and `sitectl text set k v --yes` reads far more naturally than
    # having to remember the flag goes first.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--api", default=saved_api,
                        help=f"target instance (default {saved_api})")
    common.add_argument("--dry-run", action="store_true",
                        help="show the diff, send nothing")
    common.add_argument("--yes", action="store_true", help="skip confirmation prompts")
    common.add_argument("--json", action="store_true", help="parse VALUE as JSON")

    p = argparse.ArgumentParser(prog="sitectl", parents=[common],
                                description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("login", help="authenticate and cache a token", parents=[common])
    sp.add_argument("--email"); sp.add_argument("--password")
    sp.set_defaults(fn=cmd_login, needs_auth=False)

    uk = sub.add_parser("use-key", parents=[common],
                        help="store a scoped API key (preferred over login)")
    uk.add_argument("--key", help="omit to be prompted, or set SWUMKT_API_KEY")
    uk.set_defaults(fn=cmd_use_key, needs_auth=False)

    wi = sub.add_parser("whoami", parents=[common],
                        help="which credential is in use and what it can reach")
    wi.set_defaults(fn=cmd_whoami, needs_auth=False)

    land = sub.add_parser("landing", help="the homepage document").add_subparsers(
        dest="sub", required=True)
    g = land.add_parser("get", parents=[common]); g.add_argument("path", nargs="?")
    g.set_defaults(fn=cmd_landing_get, needs_auth=False)
    st = land.add_parser("set", parents=[common]); st.add_argument("path"); st.add_argument("value")
    st.set_defaults(fn=cmd_landing_set, needs_auth=True)

    text = sub.add_parser("text", help="site strings (headings, labels)").add_subparsers(
        dest="sub", required=True)
    g = text.add_parser("get", parents=[common]); g.add_argument("path", nargs="?")
    g.set_defaults(fn=cmd_text_get, needs_auth=False)
    st = text.add_parser("set", parents=[common]); st.add_argument("path"); st.add_argument("value")
    st.set_defaults(fn=cmd_text_set, needs_auth=True)
    un = text.add_parser("unset", help="drop an override, back to the built-in text", parents=[common])
    un.add_argument("path"); un.set_defaults(fn=cmd_text_unset, needs_auth=True)

    post = sub.add_parser("post", help="articles and announcements").add_subparsers(
        dest="sub", required=True)
    pl = post.add_parser("list", parents=[common]); pl.add_argument("--limit", type=int, default=50)
    pl.set_defaults(fn=cmd_post_list, needs_auth=False)
    ps = post.add_parser("set", parents=[common]); ps.add_argument("id"); ps.add_argument("field")
    ps.add_argument("value"); ps.set_defaults(fn=cmd_post_set, needs_auth=True)
    pp = post.add_parser("publish", parents=[common]); pp.add_argument("id")
    pp.set_defaults(fn=lambda api, a: cmd_post_status(api, a, "published"), needs_auth=True)
    pu = post.add_parser("unpublish", parents=[common]); pu.add_argument("id")
    pu.set_defaults(fn=lambda api, a: cmd_post_status(api, a, "draft"), needs_auth=True)

    undo = sub.add_parser("undo", help="revision history").add_subparsers(
        dest="sub", required=True)
    ul = undo.add_parser("list", parents=[common])
    ul.add_argument("--doc", default="landing",
                    help="landing | settings | <post-id>")
    ul.add_argument("--limit", type=int, default=20)
    ul.set_defaults(fn=cmd_undo_list, needs_auth=True)
    ur = undo.add_parser("restore", parents=[common]); ur.add_argument("rev_id")
    ur.set_defaults(fn=cmd_undo_restore, needs_auth=True)

    fl = sub.add_parser("flush", help="drop this worker's public caches", parents=[common])
    fl.set_defaults(fn=cmd_flush, needs_auth=True)

    fac = sub.add_parser("faculty", help="lecturer profiles").add_subparsers(
        dest="sub", required=True)
    x = fac.add_parser("list", parents=[common])
    x.set_defaults(fn=cmd_faculty_list, needs_auth=True)
    x = fac.add_parser("get", parents=[common]); x.add_argument("slug")
    x.add_argument("path", nargs="?")
    x.set_defaults(fn=cmd_faculty_get, needs_auth=True)
    x = fac.add_parser("set", parents=[common], help="e.g. links.scholar <url>")
    x.add_argument("slug"); x.add_argument("path"); x.add_argument("value")
    x.set_defaults(fn=cmd_faculty_set, needs_auth=True)
    x = fac.add_parser("photo", parents=[common], help="upload a portrait file")
    x.add_argument("slug"); x.add_argument("file")
    x.set_defaults(fn=cmd_faculty_photo, needs_auth=True)

    pap = sub.add_parser("paper", help="publications").add_subparsers(
        dest="sub", required=True)
    x = pap.add_parser("list", parents=[common])
    x.add_argument("--status", choices=("published", "review", "hidden"))
    x.add_argument("--faculty", help="slug")
    x.set_defaults(fn=cmd_paper_list, needs_auth=True)
    x = pap.add_parser("set", parents=[common])
    x.add_argument("id"); x.add_argument("field"); x.add_argument("value")
    x.set_defaults(fn=cmd_paper_set, needs_auth=True)
    x = pap.add_parser("publish", parents=[common]); x.add_argument("id")
    x.set_defaults(fn=lambda api, a: cmd_paper_status(api, a, "published"), needs_auth=True)
    x = pap.add_parser("hide", parents=[common]); x.add_argument("id")
    x.set_defaults(fn=lambda api, a: cmd_paper_status(api, a, "hidden"), needs_auth=True)
    x = pap.add_parser("add", parents=[common])
    x.add_argument("--faculty", action="append", required=True, help="slug; repeat for co-authors")
    x.add_argument("--title", required=True)
    x.add_argument("--doi"); x.add_argument("--venue"); x.add_argument("--url")
    x.add_argument("--year", type=int)
    x.add_argument("--authors", help="'A. Name; B. Name' in published order")
    x.set_defaults(fn=cmd_paper_add, needs_auth=True)

    a = p.parse_args(argv)
    api = Api(a.api, token)
    if getattr(a, "needs_auth", False) and not token:
        return cmd_login(api, argparse.Namespace(email=None, password=None)) or \
            main(argv)  # retry once after a successful login
    return a.fn(api, a)


if __name__ == "__main__":
    sys.exit(main())
