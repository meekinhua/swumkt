"""
Iteration 14 — Brand Equity logo + edit-flow regression
Covers:
  - Public endpoint exposes logo_asset standalone (filtered to kind=logo)
  - Edit flow: PUT /studies/{id} updates fields (no duplicate study)
  - Regenerate-questions does not create new study
  - Logo upload via base64 in identity.visual_assets[kind=logo] persists & shows in public
  - brand.logo_url persists and is exposed publicly
  - Clearing logo restores fallback (logo_asset null)
"""
import os
import base64
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    p = Path('/app/frontend/.env')
    if p.exists():
        for line in p.read_text().splitlines():
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip()
    return None


BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or _load_frontend_env() or '').rstrip('/')
assert BASE_URL, "REACT_APP_BACKEND_URL not configured"
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"

# A 1x1 transparent PNG (small base64 to avoid bandwidth)
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
)


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Login failed: {r.status_code} {r.text[:200]}")
    token = r.json().get("access_token") or r.json().get("token")
    assert token, "No token returned"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_study(auth_headers):
    """Create a TEST_ study with logo asset; cleanup at end of module."""
    payload = {
        "brand": {
            "name": "TEST_LogoEditBrand",
            "logo_url": "",
            "category": "specialty coffee",
            "competitors": ["Starbucks", "Cafe Amazon"],
            "industry_context": "Bangkok urban premium coffee",
            "custom_quality_attributes": [],
        },
        "identity": {
            "traits": ["Modern", "Authentic", "Premium"],
            "description": "A premium Thai specialty coffee brand emphasizing craft and origin transparency.",
            "visual_assets": [
                {"kind": "logo", "image_base64": TINY_PNG_B64, "mime_type": "image/png", "note": "test_logo.png"}
            ],
            "brand_promise": "Craft coffee, honest origin",
            "pricing_tier": "premium",
        },
        "segments_to_capture": ["age", "gender"],
        "target_responses": 50,
    }
    r = requests.post(f"{API}/brand-equity/studies", json=payload, headers=auth_headers, timeout=60)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text[:300]}"
    study = r.json()
    yield study
    # cleanup
    try:
        requests.delete(f"{API}/brand-equity/studies/{study['id']}", headers=auth_headers, timeout=10)
    except Exception:
        pass


# -------------- Tests --------------

def test_create_study_persists_logo_asset(auth_headers, created_study):
    """Created study should have visual_assets containing kind=logo."""
    sid = created_study["id"]
    r = requests.get(f"{API}/brand-equity/studies/{sid}", headers=auth_headers, timeout=15)
    assert r.status_code == 200
    s = r.json()
    assets = (s.get("identity") or {}).get("visual_assets") or []
    logos = [a for a in assets if a.get("kind") == "logo"]
    assert len(logos) >= 1, "Logo asset not persisted in identity.visual_assets"
    assert logos[0].get("image_base64"), "Logo image_base64 missing"


def test_put_updates_brand_no_duplicate(auth_headers, created_study):
    """PUT /studies/{id} should update fields and NOT create a new study."""
    sid = created_study["id"]
    # count studies before
    pre = requests.get(f"{API}/brand-equity/studies", headers=auth_headers, timeout=15).json()
    pre_count = len(pre) if isinstance(pre, list) else len(pre.get("studies", []))

    update = {
        "brand": {**created_study["brand"], "name": "TEST_LogoEditBrand_v2",
                  "logo_url": "https://example.com/logo.png"},
        "identity": created_study["identity"],
        "segments_to_capture": ["age", "gender", "region"],
        "target_responses": 80,
    }
    r = requests.put(f"{API}/brand-equity/studies/{sid}", json=update, headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"PUT failed: {r.status_code} {r.text[:300]}"
    out = r.json()
    assert out["id"] == sid, "PUT returned different study id (would mean duplicate)"
    assert out["brand"]["name"] == "TEST_LogoEditBrand_v2"
    assert out["brand"].get("logo_url") == "https://example.com/logo.png"
    assert "region" in out.get("segments_to_capture", [])

    # studies count unchanged
    post = requests.get(f"{API}/brand-equity/studies", headers=auth_headers, timeout=15).json()
    post_count = len(post) if isinstance(post, list) else len(post.get("studies", []))
    assert post_count == pre_count, "Study count changed after PUT (duplicate created)"


def test_regenerate_questions_does_not_duplicate(auth_headers, created_study):
    """POST regenerate-questions returns new questions but keeps same study id."""
    sid = created_study["id"]
    pre = requests.get(f"{API}/brand-equity/studies", headers=auth_headers, timeout=15).json()
    pre_count = len(pre) if isinstance(pre, list) else len(pre.get("studies", []))

    r = requests.post(f"{API}/brand-equity/studies/{sid}/regenerate-questions",
                      json={}, headers=auth_headers, timeout=60)
    assert r.status_code == 200, f"Regenerate failed: {r.status_code} {r.text[:300]}"
    qs = r.json().get("questions") or []
    assert len(qs) > 0, "Regenerate returned 0 questions"

    post = requests.get(f"{API}/brand-equity/studies", headers=auth_headers, timeout=15).json()
    post_count = len(post) if isinstance(post, list) else len(post.get("studies", []))
    assert post_count == pre_count, "Study count changed after regenerate (duplicate)"


def test_launch_and_public_endpoint_returns_logo_asset(auth_headers, created_study):
    """Launch the study, then GET /public/{token} → must include logo_asset standalone."""
    sid = created_study["id"]
    # Launch (set collecting)
    r = requests.put(f"{API}/brand-equity/studies/{sid}",
                     json={"status": "collecting"}, headers=auth_headers, timeout=20)
    assert r.status_code == 200
    token = r.json().get("share_token")
    assert token, "No share_token after launch"

    # Public endpoint
    pr = requests.get(f"{API}/brand-equity/public/{token}", timeout=15)
    assert pr.status_code == 200, f"public GET failed: {pr.status_code} {pr.text[:300]}"
    pub = pr.json()
    assert "logo_asset" in pub, "Public response missing logo_asset key"
    assert pub["logo_asset"] is not None, "logo_asset should be populated (we uploaded one)"
    assert pub["logo_asset"].get("kind") == "logo"
    assert pub["logo_asset"].get("image_base64"), "logo image_base64 should be present"
    # brand.logo_url surfaced too
    assert pub["brand"].get("logo_url") == "https://example.com/logo.png"
    # ensure full visual_assets NOT leaked (payload reduction promise)
    assert "visual_assets" not in (pub.get("identity") or {}), \
        "identity.visual_assets should NOT be exposed publicly (only logo_asset)"


def test_clear_logo_makes_public_logo_null(auth_headers, created_study):
    """Remove logo from visual_assets and clear logo_url → public returns logo_asset=None."""
    sid = created_study["id"]
    cleared_identity = {**created_study["identity"], "visual_assets": []}
    cleared_brand = {**created_study["brand"], "logo_url": ""}
    r = requests.put(f"{API}/brand-equity/studies/{sid}",
                     json={"brand": cleared_brand, "identity": cleared_identity},
                     headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"PUT clear failed: {r.text[:200]}"
    token = r.json().get("share_token")

    pr = requests.get(f"{API}/brand-equity/public/{token}", timeout=15)
    assert pr.status_code == 200
    pub = pr.json()
    assert pub.get("logo_asset") is None, "logo_asset should be None after clearing"
    assert (pub.get("brand") or {}).get("logo_url") in (None, ""), "logo_url should be cleared"


def test_logo_url_only_brand_no_upload(auth_headers):
    """Brand created with logo_url but no upload — public returns logo_asset=None but logo_url present."""
    payload = {
        "brand": {
            "name": "TEST_LogoUrlOnlyBrand",
            "logo_url": "https://example.com/url-only-logo.png",
            "category": "fintech",
            "competitors": ["SCB", "Kasikorn"],
            "industry_context": "TH digital banking",
            "custom_quality_attributes": [],
        },
        "identity": {
            "traits": ["Modern", "Trustworthy", "Innovative"],
            "description": "A digital-first Thai bank built around mobile experience and AI advisory.",
            "visual_assets": [],
            "brand_promise": "Banking, simplified",
            "pricing_tier": "mid",
        },
        "segments_to_capture": ["age"],
        "target_responses": 30,
    }
    r = requests.post(f"{API}/brand-equity/studies", json=payload, headers=auth_headers, timeout=60)
    assert r.status_code in (200, 201), f"Create failed: {r.text[:200]}"
    sid = r.json()["id"]
    try:
        # launch
        rr = requests.put(f"{API}/brand-equity/studies/{sid}",
                          json={"status": "collecting"}, headers=auth_headers, timeout=20)
        assert rr.status_code == 200
        token = rr.json().get("share_token")

        pr = requests.get(f"{API}/brand-equity/public/{token}", timeout=15)
        assert pr.status_code == 200
        pub = pr.json()
        assert pub.get("logo_asset") is None, "no upload → logo_asset must be null"
        assert pub["brand"]["logo_url"] == "https://example.com/url-only-logo.png", \
            "logo_url must be passed through on public"
    finally:
        requests.delete(f"{API}/brand-equity/studies/{sid}", headers=auth_headers, timeout=10)


def test_seed_study_public_has_logo_asset_field(auth_headers):
    """Existing seed study (no logo) should still expose logo_asset key (=null) on public endpoint."""
    seed_token = "e936845d9491"
    pr = requests.get(f"{API}/brand-equity/public/{seed_token}", timeout=15)
    if pr.status_code == 410:
        pytest.skip("Seed study no longer collecting")
    assert pr.status_code == 200, f"Seed public failed: {pr.status_code} {pr.text[:200]}"
    pub = pr.json()
    assert "logo_asset" in pub, "logo_asset key must always be present in public response"
    # seed has no logo → expect null
    assert pub["logo_asset"] is None
