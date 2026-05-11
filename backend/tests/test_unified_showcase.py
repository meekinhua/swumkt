"""Tests for the Unified Public Showcase backend endpoints.

Covers:
- GET /api/showcase/index — combined BE + Conjoint public showcase
- GET /api/conjoint/showcase — legacy conjoint-only public list

Both endpoints must work unauthenticated (public access) and must not leak
MongoDB `_id` fields in their responses.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # last-resort read from frontend/.env so the test still runs locally
    try:
        with open("/app/frontend/.env") as fh:
            for line in fh:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------------------------------------------------------------------------
# /api/showcase/index — unified endpoint
# ---------------------------------------------------------------------------
class TestUnifiedShowcaseIndex:
    def test_no_auth_required(self, client):
        # explicitly send NO Authorization header
        r = client.get(f"{BASE_URL}/api/showcase/index")
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"

    def test_response_shape(self, client):
        r = client.get(f"{BASE_URL}/api/showcase/index")
        data = r.json()
        # top-level keys
        for k in ("featured_topics", "brand_equity", "conjoint", "totals"):
            assert k in data, f"missing top-level key '{k}': keys={list(data.keys())}"
        # types
        assert isinstance(data["featured_topics"], list)
        assert isinstance(data["brand_equity"], list)
        assert isinstance(data["conjoint"], list)
        assert isinstance(data["totals"], dict)
        # totals sub-keys
        for k in ("brand_equity", "conjoint", "responses", "topics"):
            assert k in data["totals"], f"missing totals.'{k}'"
            assert isinstance(data["totals"][k], int)

    def test_no_mongo_id_leak(self, client):
        r = client.get(f"{BASE_URL}/api/showcase/index")
        data = r.json()
        # spot-check nested items
        for item in (data.get("brand_equity") or []) + (data.get("conjoint") or []):
            assert "_id" not in item, f"_id leaked in item: {item}"
        for topic in data.get("featured_topics") or []:
            assert "_id" not in topic
            for s in topic.get("studies") or []:
                assert "_id" not in s

    def test_be_items_have_method_and_share_token(self, client):
        r = client.get(f"{BASE_URL}/api/showcase/index")
        data = r.json()
        for it in data.get("brand_equity") or []:
            assert it.get("method") == "brand_equity"
            assert it.get("share_token"), f"BE item missing share_token: {it}"
            assert "topic" in it
            assert "id" in it

    def test_cj_items_have_method_and_id(self, client):
        r = client.get(f"{BASE_URL}/api/showcase/index")
        data = r.json()
        for it in data.get("conjoint") or []:
            assert it.get("method") == "conjoint"
            assert it.get("id"), f"CJ item missing id: {it}"
            assert "topic" in it
            assert "attributes_count" in it

    def test_totals_consistent_with_arrays(self, client):
        r = client.get(f"{BASE_URL}/api/showcase/index")
        data = r.json()
        assert data["totals"]["brand_equity"] == len(data["brand_equity"])
        assert data["totals"]["conjoint"] == len(data["conjoint"])


# ---------------------------------------------------------------------------
# /api/conjoint/showcase — legacy endpoint
# ---------------------------------------------------------------------------
class TestConjointShowcaseLegacy:
    def test_legacy_endpoint_works(self, client):
        r = client.get(f"{BASE_URL}/api/conjoint/showcase")
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"

    def test_legacy_response_shape(self, client):
        r = client.get(f"{BASE_URL}/api/conjoint/showcase")
        data = r.json()
        assert "showcases" in data
        assert "total" in data
        assert "method" in data
        assert data["method"] == "conjoint"
        assert isinstance(data["showcases"], list)
        assert data["total"] == len(data["showcases"])

    def test_legacy_no_mongo_id(self, client):
        r = client.get(f"{BASE_URL}/api/conjoint/showcase")
        data = r.json()
        for it in data.get("showcases") or []:
            assert "_id" not in it
