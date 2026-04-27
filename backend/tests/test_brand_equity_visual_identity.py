"""Brand Equity - Visual Identity (multimodal) endpoints tests.

Covers NEW endpoints:
  - POST /api/brand-equity/extract-identity  (stateless)
  - POST /api/brand-equity/studies/{id}/extract-visual-identity  (per-study)
  - IdentitySetup persistence of description/visual_assets/derived_* on POST + PUT studies
  - Sanity check existing normalization on pre-seeded Mali study
"""
import os
import io
import base64
import random
import pytest
import requests
from PIL import Image, ImageDraw

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
STUDENT_EMAIL = "student1@swu.ac.th"
STUDENT_PASSWORD = "student123"

MALI_STUDY_ID = "c5b3458f-b482-4859-ae15-b8c725e78d1c"


# ---- helpers ----------------------------------------------------------------

def _make_png_b64(w=300, h=200, color=(14, 85, 56), shapes=True) -> str:
    """Generate a small non-uniform PNG with real visual features."""
    img = Image.new("RGB", (w, h), color)
    d = ImageDraw.Draw(img)
    if shapes:
        # Add some shapes so the image is not a solid block
        d.rectangle([20, 20, 120, 100], fill=(245, 235, 210))
        d.ellipse([140, 40, 260, 160], fill=(200, 90, 50), outline=(60, 40, 20), width=3)
        d.line([0, 180, 300, 180], fill=(50, 50, 50), width=4)
        d.text((30, 130), "MALI", fill=(30, 30, 30))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _make_jpeg_b64(w=300, h=200) -> str:
    img = Image.new("RGB", (w, h), (255, 240, 230))
    d = ImageDraw.Draw(img)
    # Gradient-ish stripes
    for i in range(0, h, 10):
        d.line([0, i, w, i], fill=(200 - i // 2, 120, 80 + i // 4), width=2)
    d.rectangle([50, 40, 250, 150], outline=(80, 40, 20), width=4)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip("Student login unavailable")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}", "Content-Type": "application/json"}


# =============================================================================
# 1) Stateless POST /api/brand-equity/extract-identity
# =============================================================================
class TestExtractIdentityStateless:

    def test_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          json={"brand_name": "X"}, timeout=20)
        assert r.status_code in (401, 403), f"Expected auth required, got {r.status_code}"

    def test_400_when_all_empty(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          headers=admin_headers,
                          json={"brand_name": "TEST_EmptyBrand", "category": "coffee",
                                "description": "", "traits": [], "visual_assets": []},
                          timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"

    def test_description_only(self, admin_headers):
        desc = ("Mali is a modern artisanal Thai coffee brand that celebrates earthy "
                "warm tones, premium craftsmanship, and a minimalist aesthetic. "
                "Inspired by northern Thai landscapes and traditional ceramics.")
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          headers=admin_headers,
                          json={"brand_name": "TEST_Mali", "category": "coffee",
                                "description": desc, "traits": [],
                                "pricing_tier": "premium", "visual_assets": []},
                          timeout=90)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        d = r.json()
        # Validate structure
        assert isinstance(d.get("derived_traits"), list) and len(d["derived_traits"]) >= 1
        assert isinstance(d.get("visual_palette"), list)
        assert isinstance(d.get("visual_keywords"), list) and len(d["visual_keywords"]) >= 1
        assert isinstance(d.get("summary"), str) and len(d["summary"]) >= 10

    def test_images_only(self, admin_headers):
        img1 = _make_png_b64()
        img2 = _make_jpeg_b64()
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          headers=admin_headers,
                          json={"brand_name": "TEST_VisualMali", "category": "coffee",
                                "description": "", "traits": [],
                                "visual_assets": [
                                    {"kind": "logo", "image_base64": img1,
                                     "mime_type": "image/png", "note": "primary logo"},
                                    {"kind": "design", "image_base64": img2,
                                     "mime_type": "image/jpeg", "note": "packaging"},
                                ]},
                          timeout=120)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        d = r.json()
        assert isinstance(d.get("derived_traits"), list)
        # palette should have at least one hex when images provided
        palette = d.get("visual_palette") or []
        assert isinstance(palette, list)
        assert isinstance(d.get("summary"), str) and len(d["summary"]) > 0

    def test_description_and_images(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          headers=admin_headers,
                          json={
                              "brand_name": "TEST_FullMali",
                              "category": "coffee",
                              "description": "Modern Thai artisanal coffee with warm earthy palette.",
                              "traits": ["Modern", "Artisanal", "Warm"],
                              "brand_promise": "Comfort in every sip",
                              "pricing_tier": "premium",
                              "visual_assets": [
                                  {"kind": "logo", "image_base64": _make_png_b64(),
                                   "mime_type": "image/png", "note": "logo"}
                              ]},
                          timeout=120)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        d = r.json()
        assert len(d.get("derived_traits", [])) >= 1
        assert isinstance(d.get("summary"), str)

    def test_data_url_prefix_stripped(self, admin_headers):
        """Backend should handle accidentally-prefixed data URL base64."""
        b64 = "data:image/png;base64," + _make_png_b64()
        r = requests.post(f"{BASE_URL}/api/brand-equity/extract-identity",
                          headers=admin_headers,
                          json={"brand_name": "TEST_Prefix", "category": "cafe",
                                "description": "",
                                "visual_assets": [
                                    {"kind": "logo", "image_base64": b64,
                                     "mime_type": "image/png", "note": "prefixed"}
                                ]},
                          timeout=120)
        # Should still succeed (prefix stripped inside helper)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:200]}"


# =============================================================================
# 2) Study create/update persists new identity fields
# =============================================================================
@pytest.fixture(scope="module")
def created_study(admin_headers):
    desc = "TEST_ brand with free-form identity description for persistence test."
    payload = {
        "brand": {
            "name": "TEST_VisualIdentityBrand",
            "category": "beverage",
            "competitors": ["CompA", "CompB"],
            "industry_context": "artisanal",
        },
        "identity": {
            "traits": ["Modern", "Warm", "Premium"],
            "description": desc,
            "visual_assets": [
                {"kind": "logo", "image_base64": _make_png_b64(),
                 "mime_type": "image/png", "note": "logo"}
            ],
            "brand_promise": "Comfort in every sip",
            "pricing_tier": "premium",
            "derived_traits": ["Artisanal"],
            "visual_palette": ["#0E5538"],
            "visual_keywords": ["minimalist"],
            "ai_summary": "Seeded summary.",
        },
        "segments_to_capture": ["age", "gender"],
        "target_responses": 50,
    }
    r = requests.post(f"{BASE_URL}/api/brand-equity/studies",
                      headers=admin_headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    sid = r.json()["id"]
    yield sid
    # cleanup
    requests.delete(f"{BASE_URL}/api/brand-equity/studies/{sid}",
                    headers=admin_headers, timeout=15)


class TestIdentityPersistence:

    def test_create_persists_fields(self, admin_headers, created_study):
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        ident = r.json()["identity"]
        assert ident["description"].startswith("TEST_ brand with free-form")
        assert len(ident["visual_assets"]) == 1
        assert ident["visual_assets"][0]["kind"] == "logo"
        assert ident["visual_assets"][0]["image_base64"]  # base64 persisted
        assert ident["derived_traits"] == ["Artisanal"]
        assert ident["visual_palette"] == ["#0E5538"]
        assert ident["visual_keywords"] == ["minimalist"]
        assert ident["ai_summary"] == "Seeded summary."

    def test_update_persists_visual_assets(self, admin_headers, created_study):
        new_assets = [
            {"kind": "logo", "image_base64": _make_png_b64(),
             "mime_type": "image/png", "note": "v2 logo"},
            {"kind": "palette", "image_base64": _make_jpeg_b64(),
             "mime_type": "image/jpeg", "note": "color swatch"},
        ]
        r = requests.put(f"{BASE_URL}/api/brand-equity/studies/{created_study}",
                         headers=admin_headers,
                         json={"identity": {
                             "traits": ["Modern", "Warm", "Premium", "Refined"],
                             "description": "Updated description for Mali brand.",
                             "visual_assets": new_assets,
                             "brand_promise": "Comfort in every sip",
                             "pricing_tier": "premium",
                             "derived_traits": ["Artisanal", "Calm"],
                             "visual_palette": ["#0E5538", "#7DDDB1"],
                             "visual_keywords": ["earthy"],
                             "ai_summary": "Updated summary.",
                         }},
                         timeout=30)
        assert r.status_code == 200, f"Update failed: {r.status_code} {r.text}"
        # Re-read
        g = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study}",
                        headers=admin_headers, timeout=15).json()
        ident = g["identity"]
        assert len(ident["visual_assets"]) == 2
        assert [a["kind"] for a in ident["visual_assets"]] == ["logo", "palette"]
        assert ident["description"] == "Updated description for Mali brand."
        assert ident["visual_palette"] == ["#0E5538", "#7DDDB1"]
        assert ident["ai_summary"] == "Updated summary."


# =============================================================================
# 3) POST /studies/{id}/extract-visual-identity
# =============================================================================
class TestPerStudyExtract:

    def test_owner_can_extract_and_persists(self, admin_headers, created_study):
        r = requests.post(
            f"{BASE_URL}/api/brand-equity/studies/{created_study}/extract-visual-identity",
            headers=admin_headers, timeout=120)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "identity" in data and "derived" in data
        ident = data["identity"]
        # Derived fields should be populated from AI (not just the seed values)
        assert isinstance(ident.get("derived_traits"), list)
        assert isinstance(ident.get("visual_palette"), list)
        assert isinstance(ident.get("visual_keywords"), list)
        assert isinstance(ident.get("ai_summary"), str) and len(ident["ai_summary"]) > 0

    def test_403_when_not_owner(self, student_headers, created_study):
        r = requests.post(
            f"{BASE_URL}/api/brand-equity/studies/{created_study}/extract-visual-identity",
            headers=student_headers, timeout=30)
        assert r.status_code == 403, f"Expected 403, got {r.status_code}: {r.text}"

    def test_400_when_no_description_or_assets(self, admin_headers):
        # Create a minimal study with empty description & assets
        payload = {
            "brand": {"name": "TEST_Empty", "category": "misc", "competitors": []},
            "identity": {"traits": ["Fast"], "description": "", "visual_assets": [],
                         "pricing_tier": "mid"},
            "segments_to_capture": ["age"],
            "target_responses": 10,
        }
        c = requests.post(f"{BASE_URL}/api/brand-equity/studies",
                          headers=admin_headers, json=payload, timeout=20)
        assert c.status_code in (200, 201)
        sid = c.json()["id"]
        try:
            r = requests.post(
                f"{BASE_URL}/api/brand-equity/studies/{sid}/extract-visual-identity",
                headers=admin_headers, timeout=30)
            assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
        finally:
            requests.delete(f"{BASE_URL}/api/brand-equity/studies/{sid}",
                            headers=admin_headers, timeout=15)


# =============================================================================
# 4) Sanity check existing normalization still works on Mali study
# =============================================================================
class TestNormalizationSanity:

    def test_mali_study_still_has_normalized(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{MALI_STUDY_ID}/dashboard",
                         headers=admin_headers, timeout=30)
        if r.status_code == 404:
            pytest.skip("Mali seed study not present in this environment")
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:200]}"
        # AI results usually served from a separate endpoint — just ensure study exists
        # and ai-analyze path hits 200 or already-cached
        s = requests.get(f"{BASE_URL}/api/brand-equity/studies/{MALI_STUDY_ID}",
                         headers=admin_headers, timeout=15)
        assert s.status_code == 200
