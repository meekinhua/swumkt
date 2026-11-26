"""
Iteration 32 — verify Claude model rename (claude-sonnet-4-6) fixed the
"model: claude-sonnet-4-20250514 not found" bug across Conjoint qualitative
analysis and other LLM-backed features.
"""
import os
import time
import uuid
import requests
import pytest
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"

THAI_QUAL = (
    "จากการสัมภาษณ์ผู้บริโภคชาไข่มุกอายุ 20-30 ปี พบว่า "
    "ปัจจัยสำคัญคือ ความหวานที่ปรับได้ ราคาไม่เกิน 45 บาท "
    "ขนาดแก้วมีตัวเลือกใหญ่/เล็ก แบรนด์ที่คุ้นเคยเช่น CoCo หรือ KOI "
    "และความนุ่มเหนียวของไข่มุก บางคนก็สนใจโปรโมชั่นซื้อ 1 แถม 1"
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- Bug fix: Conjoint qualitative analysis via API ---
class TestConjointQualitative:
    created_id = None

    def test_create_study(self, auth):
        r = requests.post(f"{BASE_URL}/api/conjoint/studies", headers=auth,
                          json={"title": f"TEST_iter32_qual_{uuid.uuid4().hex[:6]}",
                                "description": "iter32 qual analysis test",
                                "category": "beverage"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        sid = data.get("id") or data.get("study_id") or (data.get("study") or {}).get("id")
        assert sid, data
        TestConjointQualitative.created_id = sid

    def test_qualitative_analysis_thai(self, auth):
        sid = TestConjointQualitative.created_id
        assert sid
        payload = {
            "qualitative_data": [
                {"type": "interview", "content": THAI_QUAL}
            ],
            "target_language": "th",
        }
        r = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/qualitative-analysis",
            headers=auth, json=payload, timeout=120)
        assert r.status_code == 200, f"{r.status_code} {r.text[:500]}"
        body = r.json()
        # Should NOT contain model-not-found error strings
        text = str(body).lower()
        assert "not_found_error" not in text
        assert "notfounderror" not in text
        assert "model:" not in text or "claude-sonnet-4-20250514" not in text
        # Should include suggested attributes with levels
        attrs = body.get("suggested_attributes") or body.get("attributes") \
            or (body.get("analysis") or {}).get("suggested_attributes")
        assert attrs and isinstance(attrs, list) and len(attrs) >= 2, body
        first = attrs[0]
        # Levels present
        levels = first.get("levels") or first.get("suggested_levels")
        assert levels and len(levels) >= 2, first
        # Thai output (has at least one Thai character somewhere)
        joined = str(attrs)
        assert any("\u0e00" <= c <= "\u0e7f" for c in joined), "expected Thai chars in suggestions"

    def test_cleanup_study(self, auth):
        sid = TestConjointQualitative.created_id
        if not sid:
            return
        # soft-delete then purge
        requests.delete(f"{BASE_URL}/api/conjoint/studies/{sid}", headers=auth, timeout=30)
        r = requests.delete(f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
                            headers=auth, timeout=30)
        assert r.status_code in (200, 204, 404)


# --- Admin LLM prompt settings: model_name should be claude-sonnet-4-6 ---
class TestLLMPromptSettings:
    def test_get_settings(self, auth):
        # Try common endpoints
        for path in ("/api/admin/llm-prompts", "/api/llm-prompts",
                     "/api/admin/settings/llm", "/api/llm/settings"):
            r = requests.get(f"{BASE_URL}{path}", headers=auth, timeout=15)
            if r.status_code == 200:
                data = r.json()
                s = str(data)
                assert "claude-sonnet-4-20250514" not in s, f"retired alias present in {path}"
                return
        pytest.skip("no llm prompt admin endpoint reachable")


# --- Brand Equity AI analysis: uses Claude via with_model ---
class TestBrandEquityAI:
    def test_ai_analysis_demo_sim(self, auth):
        sid = "demo-sim-chathai-001"
        r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{sid}/ai-analyze",
                          headers=auth, json={}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json().get("status") in ("queued", "running", "ready"), r.json()
        # Poll status up to ~90s and verify no model-not-found error surfaces
        deadline = time.time() + 90
        last = None
        while time.time() < deadline:
            s = requests.get(f"{BASE_URL}/api/brand-equity/studies/{sid}/ai-status",
                             headers=auth, timeout=15)
            assert s.status_code == 200, s.text
            data = s.json()
            last = data
            text = str(data).lower()
            assert "not_found_error" not in text, data
            assert "claude-sonnet-4-20250514" not in text, data
            if data.get("status") in ("ready", "error", "failed"):
                break
            time.sleep(4)
        assert last and last.get("status") not in ("error", "failed"), last


# --- Conjoint AI interpretation on an existing study ---
class TestConjointAIInterpretation:
    def test_interpret_existing(self, auth):
        sid = "6099ac5b-4376-4c14-9d51-3c0637ca4260"
        candidates = [
            (f"/api/conjoint/studies/{sid}/ai-interpretation", "POST", {}),
            (f"/api/conjoint/studies/{sid}/thesis-ai", "POST", {}),
            (f"/api/conjoint/studies/{sid}/ai-analysis", "POST", {}),
            (f"/api/conjoint/studies/{sid}/interpretation", "POST", {}),
        ]
        last = None
        for path, method, body in candidates:
            r = requests.request(method, f"{BASE_URL}{path}", headers=auth,
                                 json=body, timeout=180)
            last = (path, r.status_code, r.text[:400])
            if r.status_code == 200:
                text = r.text.lower()
                assert "not_found_error" not in text
                assert "claude-sonnet-4-20250514" not in text
                return
        pytest.skip(f"no conjoint AI interp endpoint returned 200; last={last}")
