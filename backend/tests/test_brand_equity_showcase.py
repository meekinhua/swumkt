"""Tests for Brand Equity Public Showcase feature (iteration 16).

Covers:
- PUT /api/brand-equity/studies/{id}   with {is_public_showcase: bool}  (persist)
- GET /api/brand-equity/showcase/{token}   (public, no auth)
- Sanitization: no owner_id/owner_email/demographics/raw responses
- 403 when toggle OFF, 200 + sanitized when toggle ON
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STUDY_ID = "0a0a1f3b-54f9-4d06-addb-10a4c620d187"
SHARE_TOKEN = "e936845d9491"
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PW = "admin123"


# ---- fixtures ----

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": ADMIN_EMAIL, "password": ADMIN_PW})
    assert r.status_code == 200, r.text
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"no token in {data}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module", autouse=True)
def ensure_showcase_on_at_end(api, auth_headers):
    """After all tests, leave showcase ON for manual user testing (per instructions)."""
    yield
    api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
            json={"is_public_showcase": True}, headers=auth_headers)


# ---- toggle / persistence ----

class TestShowcaseToggle:
    def test_toggle_off_persists(self, api, auth_headers):
        r = api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
                    json={"is_public_showcase": False}, headers=auth_headers)
        assert r.status_code == 200, r.text
        g = api.get(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}", headers=auth_headers)
        assert g.status_code == 200
        assert g.json().get("is_public_showcase") is False

    def test_toggle_on_persists(self, api, auth_headers):
        r = api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
                    json={"is_public_showcase": True}, headers=auth_headers)
        assert r.status_code == 200, r.text
        g = api.get(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}", headers=auth_headers)
        assert g.status_code == 200
        assert g.json().get("is_public_showcase") is True


# ---- public endpoint ----

class TestPublicShowcaseEndpoint:
    def test_403_when_off(self, api, auth_headers):
        # Turn off first
        r0 = api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
                     json={"is_public_showcase": False}, headers=auth_headers)
        assert r0.status_code == 200
        # Public request (no auth)
        r = requests.get(f"{BASE_URL}/api/brand-equity/showcase/{SHARE_TOKEN}")
        assert r.status_code == 403

    def test_404_when_token_invalid(self):
        r = requests.get(f"{BASE_URL}/api/brand-equity/showcase/nonexistent_token_zzz")
        assert r.status_code == 404

    def test_200_when_on_with_sanitized_payload(self, api, auth_headers):
        # Turn on
        r0 = api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
                     json={"is_public_showcase": True}, headers=auth_headers)
        assert r0.status_code == 200

        # Public request (no auth)
        r = requests.get(f"{BASE_URL}/api/brand-equity/showcase/{SHARE_TOKEN}")
        assert r.status_code == 200, r.text
        data = r.json()

        # Required keys present
        for k in ("brand", "share_token", "status", "response_count",
                  "target_responses", "ready_for_dashboard", "aggregate",
                  "ai_cache", "logo_asset"):
            assert k in data, f"missing key {k}"

        # share_token round-trip
        assert data["share_token"] == SHARE_TOKEN
        # response_count >= 10 so ready
        assert data["response_count"] >= 10
        assert data["ready_for_dashboard"] is True
        assert isinstance(data["aggregate"], dict) and data["aggregate"]  # non-empty

        # ai_cache only has safe keys
        ai = data["ai_cache"]
        allowed = {"themes_by_question", "identity_image",
                   "master_insights", "normalized_by_question"}
        assert set(ai.keys()).issubset(allowed), f"unexpected ai keys: {set(ai.keys())-allowed}"

    def test_sanitization_no_sensitive_fields(self, api, auth_headers):
        # Make sure ON
        api.put(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}",
                json={"is_public_showcase": True}, headers=auth_headers)

        r = requests.get(f"{BASE_URL}/api/brand-equity/showcase/{SHARE_TOKEN}")
        assert r.status_code == 200
        # Search raw text of response for forbidden tokens
        raw = r.text.lower()
        forbidden = ["owner_id", "owner_email", "demographics",
                     "raw_response", "raw_responses"]
        for bad in forbidden:
            assert bad not in raw, f"sanitization leak: '{bad}' found in payload"

        data = r.json()
        # No top-level owner_* keys
        for k in data.keys():
            assert not k.startswith("owner"), f"owner key leaked: {k}"
        # aggregate has no 'demographics' nested key
        assert "demographics" not in (data.get("aggregate") or {})
        # No raw per-respondent list anywhere at top level
        assert "responses" not in data
