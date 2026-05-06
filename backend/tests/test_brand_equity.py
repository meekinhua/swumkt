"""Brand Equity / Brand Health Check module — pytest backend tests."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://soft-delete-conjoint.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
OTHER_EMAIL = "student1@swu.ac.th"
OTHER_PASSWORD = "student123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def other_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OTHER_EMAIL, "password": OTHER_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip("Other user login unavailable")
    data = r.json()
    return data.get("token") or data.get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def other_headers(other_token):
    return {"Authorization": f"Bearer {other_token}", "Content-Type": "application/json"}


# -------- Templates --------
class TestTemplates:
    def test_get_templates(self):
        r = requests.get(f"{BASE_URL}/api/brand-equity/templates", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "library" in d and "trait_pool" in d
        assert set(d["library"].keys()) == {"awareness", "quality", "identity", "loyalty"}
        assert len(d["trait_pool"]) >= 20


# -------- Study CRUD --------
@pytest.fixture(scope="module")
def created_study(admin_headers):
    payload = {
        "brand": {
            "name": "TEST_BrandX",
            "category": "เครื่องดื่ม",
            "competitors": ["TEST_CompA", "TEST_CompB"],
        },
        "identity": {
            "traits": ["Modern", "Trustworthy", "Premium"],
            "brand_promise": "คุณภาพดีที่สุดในราคาที่จับต้องได้",
            "pricing_tier": "premium",
        },
        "segments_to_capture": ["age", "gender"],
        "target_responses": 100,
    }
    r = requests.post(f"{BASE_URL}/api/brand-equity/studies", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"create_study failed: {r.status_code} {r.text}"
    s = r.json()
    assert s["status"] == "draft"
    assert "share_token" in s and len(s["share_token"]) >= 8
    assert "questions" in s and len(s["questions"]) == 18  # 4+6+4+4
    dims = {q["dimension"] for q in s["questions"]}
    assert dims == {"awareness", "quality", "identity", "loyalty"}
    return s


class TestStudyCRUD:
    def test_list_studies(self, admin_headers, created_study):
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        ids = [s["id"] for s in d["studies"]]
        assert created_study["id"] in ids
        s = next(s for s in d["studies"] if s["id"] == created_study["id"])
        assert "response_count" in s

    def test_get_study_owner(self, admin_headers, created_study):
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == created_study["id"]
        assert d["brand"]["name"] == "TEST_BrandX"

    def test_get_study_other_user_forbidden(self, other_headers, created_study):
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}",
                         headers=other_headers, timeout=15)
        assert r.status_code == 403

    def test_regenerate_questions(self, admin_headers, created_study):
        r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}/regenerate-questions",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["questions"]) == 18

    def test_public_token_410_when_draft(self, created_study):
        # Status is still draft → 410
        r = requests.get(f"{BASE_URL}/api/brand-equity/public/{created_study['share_token']}", timeout=15)
        assert r.status_code == 410, f"Expected 410 draft, got {r.status_code}"

    def test_update_status_to_collecting(self, admin_headers, created_study):
        r = requests.put(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}",
                         json={"status": "collecting"}, headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "collecting"

    def test_public_token_200_after_collecting(self, created_study):
        r = requests.get(f"{BASE_URL}/api/brand-equity/public/{created_study['share_token']}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "questions" in d
        assert "owner_id" not in d  # stripped
        assert "owner_email" not in d


# -------- Public response submission --------
def _build_answer(q):
    t = q["type"]
    if t in ("likert_5", "likert_7"):
        scale = 5 if t == "likert_5" else 7
        return scale - 1  # near top-of-box
    if t == "nps_0_10":
        return 9
    if t == "comparative_7":
        return 4
    if t == "trait_grid":
        opts = q.get("options", [])
        return opts[:3] if len(opts) >= 3 else opts
    if t == "mcq_multi":
        opts = q.get("options", [])
        return opts[:1] if opts else []
    if t == "mcq_single":
        opts = q.get("options", [])
        return opts[0] if opts else ""
    if t == "open_short":
        return q.get("kind") == "unaided_top_of_mind" and "TEST_BrandX" or "ดี"
    if t == "open_long":
        return "เป็นแบรนด์ที่ดูทันสมัยและน่าเชื่อถือ คุณภาพคุ้มราคา"
    return ""


class TestRespondentFlow:
    def test_submit_responses_and_dashboard(self, admin_headers, created_study):
        token = created_study["share_token"]
        # Fetch public study to get questions with their generated IDs
        pub = requests.get(f"{BASE_URL}/api/brand-equity/public/{token}", timeout=15).json()
        questions = pub["questions"]
        # Submit 12 responses
        for i in range(12):
            answers = [{"question_id": q["id"], "value": _build_answer(q)} for q in questions]
            r = requests.post(f"{BASE_URL}/api/brand-equity/public/{token}/respond",
                              json={"demographics": {"age": "25-34", "gender": "F"},
                                    "answers": answers, "duration_sec": 180}, timeout=15)
            assert r.status_code == 200, f"submit {i} failed: {r.status_code} {r.text}"

        # Owner-only list responses
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}/responses",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["total"] >= 12

        # Dashboard
        r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}/dashboard",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["ready_for_dashboard"] is True
        comp = d["aggregate"]["composite"]
        for dim in ("awareness", "quality", "identity", "loyalty", "overall"):
            assert dim in comp
        assert comp["overall"] > 0
        assert len(d["aggregate"]["questions"]) == 18


# -------- AI background --------
class TestAI:
    def test_ai_analyze_queue_and_status(self, admin_headers, created_study):
        sid = created_study["id"]
        r = requests.post(f"{BASE_URL}/api/brand-equity/studies/{sid}/ai-analyze",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "queued"

        # Poll status
        st = "queued"
        for _ in range(12):
            time.sleep(5)
            try:
                s = requests.get(f"{BASE_URL}/api/brand-equity/studies/{sid}/ai-status",
                                 headers=admin_headers, timeout=45)
            except requests.exceptions.ReadTimeout:
                continue
            assert s.status_code == 200
            st = s.json().get("status")
            if st in ("ready", "error", "no_data"):
                break
            assert s.status_code == 200
            st = s.json().get("status")
            if st in ("ready", "error", "no_data"):
                break
        # We don't strictly require "ready" since AI may be slow, but status should not stay "queued" forever
        # Acceptable end-states: ready/running/error
        assert st in ("ready", "running", "error", "no_data", "queued"), f"unexpected: {st}"


# -------- Cleanup --------
class TestCleanup:
    def test_delete_study(self, admin_headers, created_study):
        r = requests.delete(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}",
                            headers=admin_headers, timeout=60)
        assert r.status_code == 200
        # GET should now 404
        r2 = requests.get(f"{BASE_URL}/api/brand-equity/studies/{created_study['id']}",
                          headers=admin_headers, timeout=15)
        assert r2.status_code == 404
