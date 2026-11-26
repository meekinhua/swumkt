"""Editing a deployed site from a terminal — `routes/content_ops.py` + `scripts/sitectl.py`.

The point of these is the failure the feature exists to prevent: someone asks
to change one hero headline, a partial body goes to `PUT /api/cms/landing`,
and `featured_articles` is nulled out because the whole-document model
defaulted it to None. `test_patch_leaves_siblings_alone` is the one that must
never go red.

Integration tests need a running server (`REACT_APP_BACKEND_URL`) and an admin
account; they skip when either is missing rather than failing.
"""
import json
import os
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.inline_media import rehydrate  # noqa: E402
from routes.content_ops import deep_merge, set_by_path  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sitectl  # noqa: E402

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
ADMIN_EMAIL = os.environ.get("SWUMKT_ADMIN_EMAIL", "admin@swu.ac.th")
ADMIN_PW = os.environ.get("SWUMKT_ADMIN_PW", "admin123")


# ---- pure: the merge ------------------------------------------------------

def test_nested_dicts_merge_rather_than_replace():
    base = {"knowledge_hub": {"heading": "a", "lede": "keep me"}, "rotation_ms": 5500}
    out = deep_merge(base, {"knowledge_hub": {"heading": "b"}})
    assert out == {"knowledge_hub": {"heading": "b", "lede": "keep me"},
                   "rotation_ms": 5500}


def test_lists_are_replaced_whole():
    """Merging by index goes wrong the moment a slide is deleted."""
    base = {"slides": [{"a": 1}, {"b": 2}]}
    assert deep_merge(base, {"slides": [{"c": 3}]}) == {"slides": [{"c": 3}]}


def test_a_key_the_patch_omits_is_untouched():
    base = {"slides": [1], "featured_articles": {"mode": "fixed", "ids": ["x"]}}
    out = deep_merge(base, {"rotation_ms": 9000})
    assert out["featured_articles"] == {"mode": "fixed", "ids": ["x"]}
    assert out["slides"] == [1]


def test_explicit_null_is_still_a_write():
    assert deep_merge({"a": 1}, {"a": None}) == {"a": None}


def test_set_by_path_builds_a_nested_patch():
    assert set_by_path({}, "knowledge_hub.heading", "x") == {"knowledge_hub": {"heading": "x"}}


def test_set_by_path_refuses_a_leading_list_index():
    with pytest.raises(Exception):
        set_by_path({}, "0.title", "x")


# ---- pure: the client -----------------------------------------------------

def test_client_merge_matches_the_server():
    """The diff the user is shown has to be what actually lands."""
    base = {"a": {"b": 1, "c": 2}, "l": [1, 2]}
    patch = {"a": {"b": 9}, "l": [3]}
    assert sitectl.deep_merge_local(base, patch) == deep_merge(base, patch)


def test_patch_for_rebuilds_the_whole_list_around_one_element():
    """The server replaces lists, so a patch touching slide 1 must carry slide 0."""
    current = {"slides": [{"lede": "zero"}, {"lede": "one"}, {"lede": "two"}]}
    patch = sitectl.patch_for(current, "slides.1.lede", "CHANGED")
    assert [s["lede"] for s in patch["slides"]] == ["zero", "CHANGED", "two"]
    assert deep_merge(current, patch)["slides"][0]["lede"] == "zero"


def test_patch_for_rejects_an_index_past_the_end():
    with pytest.raises(SystemExit):
        sitectl.patch_for({"slides": [{"a": 1}]}, "slides.5.a", "x")


def test_risky_flags_a_blanked_field():
    assert "blanks" in sitectl.risky({"a": "text"}, {"a": ""})


def test_risky_flags_a_removed_field():
    assert "removes" in sitectl.risky({"a": 1, "b": 2}, {"a": 1})


def test_risky_passes_an_ordinary_edit():
    assert sitectl.risky({"a": "old"}, {"a": "new"}) is None


def test_risky_flags_a_sweeping_change():
    before = {str(i): "x" for i in range(10)}
    after = {str(i): "y" for i in range(10)}
    assert "10 fields" in sitectl.risky(before, after)


def test_base64_is_never_echoed_into_a_diff():
    big = "data:image/png;base64," + "A" * 5000
    assert sitectl.shorten(big).startswith("<") and "AAAA" not in sitectl.shorten(big)


def test_walk_returns_none_instead_of_raising():
    assert sitectl.walk({"a": {"b": 1}}, "a.nope.deeper") is None
    assert sitectl.walk({"l": [1]}, "l.9") is None


# ---- integration ----------------------------------------------------------

needs_server = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")


@pytest.fixture(scope="module")
def token():
    if not BASE_URL:
        pytest.skip("no server")
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"no admin account on {BASE_URL} ({r.status_code})")
    return r.json()["access_token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@needs_server
def test_settings_is_public_and_safe_when_empty():
    r = requests.get(f"{BASE_URL}/api/cms/settings", timeout=30)
    assert r.status_code == 200
    assert isinstance(r.json(), dict)


@needs_server
def test_settings_write_requires_admin():
    r = requests.patch(f"{BASE_URL}/api/cms/settings", json={"x": "y"}, timeout=30)
    assert r.status_code in (401, 403)


@needs_server
def test_landing_write_requires_admin():
    r = requests.patch(f"{BASE_URL}/api/cms/landing", json={"rotation_ms": 1}, timeout=30)
    assert r.status_code in (401, 403)


@needs_server
def test_patch_leaves_siblings_alone(auth):
    """The whole reason PATCH exists.

    A partial body through PUT nulls every field the model defaults to None.
    This asserts the shape of the document is preserved around the one change.
    """
    before = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    keys_before = set(before)
    n_slides = len(before.get("slides") or [])

    r = requests.patch(f"{BASE_URL}/api/cms/landing",
                       json={"rotation_ms": 7321}, headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    try:
        after = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
        assert after["rotation_ms"] == 7321
        assert len(after.get("slides") or []) == n_slides
        # Every key that existed still exists and is not None.
        for k in keys_before - {"rotation_ms", "version", "updated_at"}:
            assert k in after, f"PATCH dropped {k}"
            assert after[k] is not None or before[k] is None, f"PATCH nulled {k}"
    finally:
        requests.patch(f"{BASE_URL}/api/cms/landing",
                       json={"rotation_ms": before.get("rotation_ms", 5500)},
                       headers=auth, timeout=60)


@needs_server
def test_stale_if_match_is_rejected(auth):
    cur = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    stale = str(int(cur.get("version", 0)) - 99)
    r = requests.patch(f"{BASE_URL}/api/cms/landing", json={"rotation_ms": 1234},
                       headers={**auth, "If-Match": stale}, timeout=60)
    assert r.status_code == 409
    assert "changed by someone else" in r.text


@needs_server
def test_matching_if_match_is_accepted_and_bumps_the_version(auth):
    cur = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    v = int(cur.get("version", 0))
    r = requests.patch(f"{BASE_URL}/api/cms/landing",
                       json={"rotation_ms": cur.get("rotation_ms", 5500)},
                       headers={**auth, "If-Match": str(v)}, timeout=60)
    assert r.status_code == 200, r.text
    assert r.json()["version"] == v + 1


@needs_server
def test_settings_round_trip_and_unset(auth):
    key = "pytest.sample"
    requests.patch(f"{BASE_URL}/api/cms/settings",
                   json={"pytest": {"sample": "ก"}}, headers=auth, timeout=60)
    got = requests.get(f"{BASE_URL}/api/cms/settings", timeout=30).json()
    assert got["pytest"]["sample"] == "ก"

    r = requests.delete(f"{BASE_URL}/api/cms/settings", params={"path": key},
                        headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    got = requests.get(f"{BASE_URL}/api/cms/settings", timeout=30).json()
    assert "sample" not in (got.get("pytest") or {})


@needs_server
def test_unsetting_something_that_is_not_set_is_404(auth):
    r = requests.delete(f"{BASE_URL}/api/cms/settings",
                        params={"path": "pytest.never.set"}, headers=auth, timeout=60)
    assert r.status_code == 404


@needs_server
def test_settings_refuses_a_payload_big_enough_to_be_an_image(auth):
    r = requests.patch(f"{BASE_URL}/api/cms/settings",
                       json={"pytest": {"blob": "x" * (300 * 1024)}},
                       headers=auth, timeout=120)
    assert r.status_code == 413


@needs_server
def test_an_edit_can_be_undone(auth):
    """Edit, find the snapshot taken before it, restore, original text is back."""
    before = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    original = (before.get("knowledge_hub") or {}).get("heading")
    if original is None:
        pytest.skip("landing has no knowledge_hub.heading in this database")

    r = requests.patch(f"{BASE_URL}/api/cms/landing",
                       json={"knowledge_hub": {"heading": "PYTEST-OVERWRITE"}},
                       headers=auth, timeout=60)
    assert r.status_code == 200, r.text
    mid = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    assert mid["knowledge_hub"]["heading"] == "PYTEST-OVERWRITE"

    revs = requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                        headers=auth, timeout=60).json()["items"]
    assert revs, "no revision was recorded for the edit"
    rid = revs[0]["id"]
    assert requests.post(f"{BASE_URL}/api/cms/revisions/{rid}/restore",
                         headers=auth, timeout=60).status_code == 200

    after = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    assert after["knowledge_hub"]["heading"] == original


@needs_server
def test_revision_listing_omits_the_stored_document(auth):
    """A listing must stay small — the documents can be megabytes."""
    rows = requests.get(f"{BASE_URL}/api/cms/revisions?doc=landing",
                        headers=auth, timeout=60).json()["items"]
    for r in rows:
        assert "document" not in r


@needs_server
def test_revisions_require_admin():
    assert requests.get(f"{BASE_URL}/api/cms/revisions", timeout=30
                        ).status_code in (401, 403)

# ---- regressions found by review, each pinned here -------------------------

def test_settings_uses_the_same_key_field_as_landing():
    """The snapshot lookup was a landing-or-not ternary, so cms_site_settings
    — which is also keyed by `key` — was queried by `id`, found nothing, and
    silently recorded no revision for any settings write."""
    from routes.content_ops import _key_field
    assert _key_field("cms_landing") == "key"
    assert _key_field("cms_site_settings") == "key"
    assert _key_field("cms_posts") == "id"


def test_revisions_can_address_the_settings_document():
    from routes.content_ops import _REVISION_DOCS
    assert _REVISION_DOCS["settings"] == ("cms_site_settings", "site")
    assert _REVISION_DOCS["landing"] == ("cms_landing", "home")


def test_set_by_path_refuses_any_list_index():
    """It used to build a one-element list, which deep_merge would then use to
    replace the whole list."""
    with pytest.raises(Exception):
        set_by_path({}, "slides.0.lede", "x")


def test_deny_list_blocks_paths_under_a_denied_prefix():
    """Suffix matching let /admin/users/<id>/role — the call that actually
    changes a privilege — straight through."""
    for p in ("/admin/users", "/admin/users/abc123", "/admin/users/abc/role",
              "/admin/settings/image-model", "/cms/posts/x/purge",
              "/cms/landing/reset"):
        with pytest.raises(SystemExit):
            sitectl._check_denied(p)


def test_deny_list_allows_ordinary_content_paths():
    for p in ("/cms/landing", "/cms/settings", "/cms/posts/abc",
              "/cms/revisions", "/cms/posts/public"):
        sitectl._check_denied(p)  # must not raise


def test_read_back_is_skipped_for_an_inline_image():
    """The public API returns /api/media/... for an inline image, so comparing
    the base64 that was sent would stall for the full retry budget and then
    report a correct write as a failure."""
    assert sitectl._unverifiable("data:image/png;base64,AAAA") is not None
    assert sitectl._unverifiable({"image": "data:image/png;base64,AAAA"}) is not None
    assert sitectl._unverifiable("ข้อความธรรมดา") is None


def test_global_flags_are_accepted_after_the_subcommand():
    """SKILL.md's own example put --dry-run last, and argparse rejected it."""
    import contextlib, io as _io
    for argv in (["--dry-run", "text", "get"], ["text", "get", "--dry-run"]):
        buf = _io.StringIO()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                sitectl.main(argv + ["--api", "http://127.0.0.1:9"])
            except SystemExit as e:
                assert e.code != 2, f"argparse rejected {argv}: {buf.getvalue()}"
            except Exception:
                pass  # connection refused is fine; parsing is what is under test


def test_post_set_rejects_a_field_the_server_would_ignore():
    assert "title" in sitectl.POST_FIELDS
    # author_name became writable when bylines got linked to faculty; these
    # two are genuinely not fields of CmsPostUpdate.
    assert "created_by" not in sitectl.POST_FIELDS
    assert "nickname" not in sitectl.POST_FIELDS


@needs_server
def test_a_settings_edit_is_undoable(auth):
    """The bug this file exists to prevent recurring: settings writes recorded
    no revision at all, so `undo` silently did nothing."""
    requests.patch(f"{BASE_URL}/api/cms/settings",
                   json={"pytest": {"undo": "first"}}, headers=auth, timeout=60)
    requests.patch(f"{BASE_URL}/api/cms/settings",
                   json={"pytest": {"undo": "second"}}, headers=auth, timeout=60)

    revs = requests.get(f"{BASE_URL}/api/cms/revisions?doc=settings",
                        headers=auth, timeout=60).json()["items"]
    assert revs, "a settings write recorded no revision"
    assert requests.post(f"{BASE_URL}/api/cms/revisions/{revs[0]['id']}/restore",
                         headers=auth, timeout=60).status_code == 200
    back = requests.get(f"{BASE_URL}/api/cms/settings", timeout=30).json()
    assert back["pytest"]["undo"] == "first"

    requests.delete(f"{BASE_URL}/api/cms/settings", params={"path": "pytest"},
                    headers=auth, timeout=60)


@needs_server
def test_a_patch_that_would_break_the_homepage_is_rejected(auth):
    """`landing set slides "oops"` merged a string where a list belongs and the
    homepage rendered empty."""
    r = requests.patch(f"{BASE_URL}/api/cms/landing", json={"slides": "oops"},
                       headers=auth, timeout=60)
    assert r.status_code == 422, r.text
    assert (requests.get(f"{BASE_URL}/api/cms/landing", timeout=60)
            .json()["slides"]) != "oops"


@needs_server
def test_reserved_keys_are_refused_before_anything_is_written(auth):
    for body in ({"_id": "x"}, {"$set": {"a": 1}}):
        r = requests.patch(f"{BASE_URL}/api/cms/landing", json=body,
                           headers=auth, timeout=60)
        assert r.status_code == 400, r.text


@needs_server
def test_optional_configs_survive_a_partial_full_put(auth):
    """A PUT body omitting featured_articles used to null it, and the backfill
    only healed an absent key — so the null was permanent."""
    before = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    body = {k: before[k] for k in ("slides", "tools", "knowledge_hub", "about_band")
            if k in before}
    r = requests.put(f"{BASE_URL}/api/cms/landing", json=body, headers=auth, timeout=120)
    assert r.status_code == 200, r.text[:300]
    after = requests.get(f"{BASE_URL}/api/cms/landing", timeout=60).json()
    for field in ("featured_articles", "featured_brands", "showcase_editor_pick"):
        assert after.get(field) is not None, f"{field} was nulled by a partial PUT"


# ---- client hardening (findings from the review that died mid-run) --------

@pytest.mark.parametrize("path", [
    "/cms/posts/../../admin/users/x",
    "/cms/posts/./../admin/settings",
    "/cms/posts/%2e%2e/%2e%2e/admin/users",
])
def test_dot_segments_cannot_walk_past_the_deny_list(path):
    """Ids are interpolated into paths; `post publish ../../admin/users/x`
    used to build a path the deny-list compared only as a string."""
    with pytest.raises(SystemExit):
        sitectl._check_denied(path)


@pytest.mark.parametrize("bad", ["../../admin", "a/b", "x?y=1", "", "%2e%2e", "a b"])
def test_ids_that_could_leave_their_path_segment_are_refused(bad):
    with pytest.raises(SystemExit):
        sitectl._safe_id(bad)


@pytest.mark.parametrize("good", ["perf-post-0", "pap-w7215668802", "fac-intaka-piriyakul",
                                  "4fd1b266-c761-43cc-a1db-e6c8c229b696"])
def test_real_ids_pass(good):
    assert sitectl._safe_id(good) == good


def test_whoami_and_use_key_probe_only_authenticated_endpoints():
    """/cms/settings is public, so a probe against it said 200 for a revoked
    key, a wrong key or no key at all."""
    public = ("/cms/settings", "/cms/landing", "/faculty", "/publications")
    for p in [sitectl._KEY_PROBE] + [p for p, _ in sitectl._WHOAMI_PROBES]:
        assert not p.split("?")[0] in public, p
        assert p.startswith("/cms/"), p


def test_env_key_keeps_the_saved_target(tmp_path, monkeypatch):
    """A key in SWUMKT_API_KEY used to drop the saved host and go to the
    production default."""
    cred = tmp_path / "credentials.json"
    cred.write_text('{"api": "https://staging.example"}', encoding="utf-8")
    monkeypatch.setattr(sitectl, "CRED_PATH", cred)
    monkeypatch.setenv("SWUMKT_API_KEY", "swk_x")
    monkeypatch.delenv("SWUMKT_API", raising=False)
    token, api = sitectl.load_token()
    assert token == "swk_x" and api == "https://staging.example"


def test_credentials_are_written_atomically(tmp_path, monkeypatch):
    cred = tmp_path / "sub" / "credentials.json"
    monkeypatch.setattr(sitectl, "CRED_PATH", cred)
    sitectl.save_api_key("swk_abc", "https://x.example")
    import json as _json
    assert _json.loads(cred.read_text(encoding="utf-8"))["api_key"] == "swk_abc"
    assert not [p for p in cred.parent.iterdir() if p.name.startswith(".cred-")]
