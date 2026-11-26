"""Scoped API keys — `lib/api_keys.py`, the gate in `get_current_user`, `/cms/keys`.

The whole value of a scoped key is what it *cannot* do, so most of this file
is negative. The rule that matters is in `required_scope`: a path no rule
covers returns None and is refused, which means adding a route to the app can
never silently widen a key that already exists.

Integration tests need a running server and mint real keys through Mongo
(the first key cannot come from an endpoint that requires a key).
"""
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib import api_keys  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


# ---- pure: the scope map --------------------------------------------------

def test_content_writes_map_to_their_own_scope():
    assert api_keys.required_scope("PATCH", "/api/cms/landing") == "cms.landing.write"
    assert api_keys.required_scope("PATCH", "/api/cms/settings") == "cms.settings.write"
    assert api_keys.required_scope("DELETE", "/api/cms/settings") == "cms.settings.write"
    assert api_keys.required_scope("PUT", "/api/cms/posts/abc") == "cms.posts.write"
    assert api_keys.required_scope(
        "POST", "/api/cms/revisions/r1/restore") == "cms.revisions.restore"


def test_reads_fall_through_to_the_read_scope():
    assert api_keys.required_scope("GET", "/api/cms/landing") == "cms.read"
    assert api_keys.required_scope("GET", "/api/cms/posts/abc") == "cms.read"


@pytest.mark.parametrize("method,path", [
    ("DELETE", "/api/cms/posts/abc/purge"),
    ("POST", "/api/cms/landing/reset"),
    ("GET", "/api/admin/llm-prompts"),
    ("POST", "/api/admin/image-model"),
    ("GET", "/api/cms/keys"),
    ("POST", "/api/cms/keys"),
    ("DELETE", "/api/cms/keys/abc"),
    ("POST", "/api/auth/login"),
    ("GET", "/api/users"),
])
def test_hard_denied_paths_have_no_scope_at_all(method, path):
    """No scope, including the wildcard, can reach these."""
    assert api_keys.required_scope(method, path) is None


@pytest.mark.parametrize("path", [
    "/api/brand-equity/studies", "/api/surveys", "/api/conjoint/studies",
    "/api/journey/studies", "/api/projects", "/api/notifications",
    "/api/health", "/api/some/route/invented/next/year",
])
def test_anything_outside_the_cms_is_refused(path):
    """A route nobody thought about is not a route a key should reach."""
    assert api_keys.required_scope("GET", path) is None
    assert api_keys.required_scope("POST", path) is None


def test_a_trailing_slash_does_not_slip_past_a_deny():
    assert api_keys.required_scope("DELETE", "/api/cms/posts/abc/purge/") is None
    assert api_keys.required_scope("GET", "/api/admin/") is None


def test_a_query_string_does_not_slip_past_a_deny():
    assert api_keys.required_scope("GET", "/api/admin/users?x=1") is None


def test_wildcard_grants_the_content_scopes_and_nothing_more():
    assert api_keys.scope_allows([api_keys.WILDCARD], "cms.posts.write")
    assert api_keys.scope_allows([api_keys.WILDCARD], "cms.read")
    # ...but the wildcard is irrelevant where required_scope returned None,
    # which is what actually protects the denied paths.
    assert api_keys.required_scope("POST", "/api/cms/landing/reset") is None


def test_a_narrow_scope_does_not_grant_a_wider_one():
    assert api_keys.scope_allows(["cms.read"], "cms.read")
    assert not api_keys.scope_allows(["cms.read"], "cms.settings.write")
    assert not api_keys.scope_allows(["cms.posts.write"], "cms.landing.write")


# ---- pure: minting --------------------------------------------------------

def test_a_minted_key_is_stored_only_as_a_hash():
    doc, plaintext = api_keys.build_key_document("t", ["cms.read"], "me")
    assert plaintext.startswith(api_keys.KEY_PREFIX)
    assert plaintext not in str(doc)
    assert doc["key_hash"] == api_keys.hash_key(plaintext)
    assert len(doc["key_hash"]) == 64


def test_the_fingerprint_identifies_without_authenticating():
    doc, plaintext = api_keys.build_key_document("t", ["cms.read"], "me")
    assert plaintext.startswith(doc["fingerprint"])
    assert len(doc["fingerprint"]) < len(plaintext)


def test_two_keys_are_never_the_same():
    a, ka = api_keys.build_key_document("a", ["cms.read"], "me")
    b, kb = api_keys.build_key_document("b", ["cms.read"], "me")
    assert ka != kb and a["key_hash"] != b["key_hash"]


def test_an_unknown_scope_is_refused_at_mint_time():
    with pytest.raises(ValueError):
        api_keys.normalise_scopes(["cms.everything"])
    with pytest.raises(ValueError):
        api_keys.normalise_scopes([])


def test_a_jwt_is_not_mistaken_for_a_key():
    assert not api_keys.looks_like_api_key("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.x.y")
    assert api_keys.looks_like_api_key("swk_abc")


def test_an_expiry_in_the_past_disqualifies_a_key():
    assert api_keys._expired({"expires_at": "2020-01-01T00:00:00+00:00"})
    assert not api_keys._expired({"expires_at": "2099-01-01T00:00:00+00:00"})
    assert not api_keys._expired({"expires_at": None})
    # Unreadable means over, not unlimited. New keys cannot get here —
    # parse_expiry refuses them at mint — but a hand-edited row can.
    assert api_keys._expired({"expires_at": "whenever"})


def test_an_unreadable_expiry_is_refused_at_mint():
    with pytest.raises(ValueError):
        api_keys.build_key_document("t", ["cms.read"], "me", expires_at="next tuesday")
    with pytest.raises(ValueError):
        api_keys.build_key_document("t", ["cms.read"], "me", expires_at="2020-01-01")
    doc, _ = api_keys.build_key_document("t", ["cms.read"], "me",
                                         expires_at="2099-06-01T00:00:00")
    assert doc["expires_at"].startswith("2099-06-01T00:00:00")


@pytest.mark.parametrize("path", [
    "/api/cms/posts/../../admin/users/x",
    "/api/cms/posts/./x",
    "/api/cms//posts/x",
    "/api/cms/posts/%2e%2e/%2e%2e/admin/users",
    "/api/cms/posts/x%2Fpurge",
    "/api/cms/posts/x\..\admin",
])
def test_non_canonical_paths_are_refused_outright(path):
    """Dot segments and encoded separators would otherwise match a content
    rule as a string while a proxy in front resolves them elsewhere."""
    for m in ("GET", "POST", "PUT", "PATCH", "DELETE"):
        assert api_keys.required_scope(m, path) is None, (m, path)


# ---- integration ----------------------------------------------------------

needs_all = pytest.mark.skipif(
    not (BASE_URL and MONGO_URL and DB_NAME),
    reason="needs REACT_APP_BACKEND_URL, MONGO_URL and DB_NAME")


async def _mint(scopes):
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
    doc, key = api_keys.build_key_document("pytest", scopes, "pytest")
    await db[api_keys.COLLECTION].insert_one(dict(doc))
    return doc, key


@pytest.fixture
def wildcard_key():
    doc, key = _sync_mint([api_keys.WILDCARD])
    yield key
    _sync_revoke(doc["id"])


@pytest.fixture
def readonly_key():
    doc, key = _sync_mint(["cms.read"])
    yield key
    _sync_revoke(doc["id"])


def _sync_mint(scopes):
    import asyncio
    return asyncio.new_event_loop().run_until_complete(_mint(scopes))


def _sync_revoke(key_id):
    import asyncio
    from datetime import datetime, timezone
    from motor.motor_asyncio import AsyncIOMotorClient

    async def go():
        db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
        await db[api_keys.COLLECTION].update_one(
            {"id": key_id},
            {"$set": {"revoked_at": datetime.now(timezone.utc).isoformat()}})
    asyncio.new_event_loop().run_until_complete(go())


def _hdr(key):
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


@needs_all
def test_a_wildcard_key_can_edit_content(wildcard_key):
    r = requests.patch(f"{BASE_URL}/api/cms/settings",
                       json={"pytest_key": {"v": "1"}},
                       headers=_hdr(wildcard_key), timeout=60)
    assert r.status_code == 200, r.text
    requests.delete(f"{BASE_URL}/api/cms/settings", params={"path": "pytest_key"},
                    headers=_hdr(wildcard_key), timeout=60)


@needs_all
@pytest.mark.parametrize("method,path", [
    ("DELETE", "/api/cms/posts/anything/purge"),
    ("POST", "/api/cms/landing/reset"),
    ("GET", "/api/admin/llm-prompts"),
    ("GET", "/api/cms/keys"),
    ("GET", "/api/brand-equity/studies"),
])
def test_a_wildcard_key_is_still_refused_everywhere_it_should_be(
        wildcard_key, method, path):
    r = requests.request(method, f"{BASE_URL}{path}",
                         headers=_hdr(wildcard_key), json={}, timeout=60)
    assert r.status_code == 403, f"{method} {path} returned {r.status_code}"


@needs_all
def test_a_key_cannot_mint_another_key(wildcard_key):
    r = requests.post(f"{BASE_URL}/api/cms/keys",
                      json={"label": "escalation", "scopes": [api_keys.WILDCARD]},
                      headers=_hdr(wildcard_key), timeout=60)
    assert r.status_code == 403


@needs_all
def test_a_read_only_key_cannot_write(readonly_key):
    assert requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                        headers=_hdr(readonly_key), timeout=60).status_code == 200
    r = requests.patch(f"{BASE_URL}/api/cms/settings", json={"pytest_ro": 1},
                       headers=_hdr(readonly_key), timeout=60)
    assert r.status_code == 403
    assert "cms.settings.write" in r.text


@needs_all
def test_a_revoked_key_stops_working_immediately():
    doc, key = _sync_mint([api_keys.WILDCARD])
    assert requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                        headers=_hdr(key), timeout=60).status_code == 200
    _sync_revoke(doc["id"])
    r = requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                     headers=_hdr(key), timeout=60)
    assert r.status_code == 401 and "revoked" in r.text


@needs_all
def test_a_made_up_key_is_rejected():
    r = requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                     headers=_hdr("swk_not_a_real_key_at_all"), timeout=60)
    assert r.status_code == 401


@needs_all
def test_the_revision_records_the_key_not_a_person(wildcard_key):
    requests.patch(f"{BASE_URL}/api/cms/settings", json={"pytest_actor": "x"},
                   headers=_hdr(wildcard_key), timeout=60)
    revs = requests.get(f"{BASE_URL}/api/cms/revisions?doc=settings",
                        headers=_hdr(wildcard_key), timeout=60).json()["items"]
    assert revs and "api-key" in revs[0]["actor"], revs[:1]
    requests.delete(f"{BASE_URL}/api/cms/settings", params={"path": "pytest_actor"},
                    headers=_hdr(wildcard_key), timeout=60)


@needs_all
def test_restoring_a_paper_needs_the_faculty_scope_too():
    """`cms.revisions.restore` alone used to be enough to republish a paper
    someone had deliberately hidden."""
    admin = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@swu.ac.th", "password": "admin123"},
                          timeout=60)
    if admin.status_code != 200:
        pytest.skip("no admin account")
    h = {"Authorization": f"Bearer {admin.json()['access_token']}",
         "Content-Type": "application/json"}
    papers = requests.get(f"{BASE_URL}/api/cms/papers?status=published", headers=h,
                          timeout=60).json()["items"]
    if not papers:
        pytest.skip("no papers seeded")
    pid = papers[0]["id"]
    requests.patch(f"{BASE_URL}/api/cms/papers/{pid}", json={"status": "hidden"},
                   headers=h, timeout=60)
    try:
        revs = requests.get(f"{BASE_URL}/api/cms/revisions?doc={pid}", headers=h,
                            timeout=60).json()["items"]
        assert revs
        doc, key = _sync_mint(["cms.revisions.restore"])
        try:
            r = requests.post(f"{BASE_URL}/api/cms/revisions/{revs[0]['id']}/restore",
                              headers=_hdr(key), timeout=60)
            assert r.status_code == 403 and "cms.faculty.write" in r.text
        finally:
            _sync_revoke(doc["id"])
    finally:
        requests.patch(f"{BASE_URL}/api/cms/papers/{pid}", json={"status": "published"},
                       headers=h, timeout=60)


def test_research_sources_are_out_of_reach_of_any_key():
    assert api_keys.required_scope("GET", "/api/cms/sources") is None


def test_the_faculty_seed_is_out_of_reach_of_any_key():
    """A bulk, un-snapshotted bootstrap — run by a person at /admin/cms/setup."""
    assert api_keys.required_scope("POST", "/api/cms/faculty/seed") is None
    # ...while ordinary faculty edits stay within the faculty scope.
    assert api_keys.required_scope("PATCH", "/api/cms/faculty/fac-x") == "cms.faculty.write"
