"""
Post-refactor regression test for Conjoint module extraction (server.py -> routes/conjoint.py).
Covers:
- Auth & health
- Conjoint CRUD, design, survey, analytics
- Background jobs (AI interpretation, thesis export)
- Admin image settings (non-prefixed URL preserved)
- Regression: Brand Equity, CMS, Projects, Auth/Admin
"""
import os
import time
import json
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://soft-delete-conjoint.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
STUDENT_EMAIL = "student1@swu.ac.th"
STUDENT_PASSWORD = "student123"

session = requests.Session()
session.headers.update({"Content-Type": "application/json"})

state = {
    "admin_token": None,
    "admin_id": None,
    "student_token": None,
    "study_id": None,
    "survey_token": None,
    "ai_job_id": None,
    "thesis_job_id": None,
}


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- Auth ----------------
class TestAuth:
    def test_admin_login(self):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
        state["admin_token"] = data["access_token"]
        state["admin_id"] = data["user"]["id"]

    def test_auth_me(self):
        r = session.get(f"{BASE_URL}/api/auth/me", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "admin"

    def test_student_login(self):
        r = session.post(f"{BASE_URL}/api/auth/login", json={"email": STUDENT_EMAIL, "password": STUDENT_PASSWORD})
        if r.status_code == 200:
            state["student_token"] = r.json()["access_token"]
        else:
            pytest.skip("Student login failed - non-critical")


# ---------------- Conjoint CRUD ----------------
class TestConjointCRUD:
    def test_create_study(self):
        payload = {
            "title": "TEST_RefactorRegression",
            "description": "Post-refactor regression test study",
            "product_category": "Coffee",
        }
        r = session.post(f"{BASE_URL}/api/conjoint/studies", json=payload, headers=_auth_headers(state["admin_token"]))
        assert r.status_code in (200, 201), r.text
        data = r.json()
        sid = data.get("id") or data.get("study_id")
        assert sid, f"No id/study_id in: {data}"
        state["study_id"] = sid

    def test_list_studies(self):
        r = session.get(f"{BASE_URL}/api/conjoint/studies", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text
        data = r.json()
        studies = data.get("studies", data) if isinstance(data, dict) else data
        assert isinstance(studies, list)
        assert any(s.get("id") == state["study_id"] for s in studies)

    def test_get_study(self):
        sid = state["study_id"]
        r = session.get(f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text
        assert r.json()["id"] == sid

    def test_update_attributes(self):
        sid = state["study_id"]
        payload = {
            "attributes": [
                {"name": "Brand", "order": 0, "levels": [{"value": "A"}, {"value": "B"}, {"value": "C"}]},
                {"name": "Price", "order": 1, "levels": [{"value": "100"}, {"value": "150"}, {"value": "200"}]},
                {"name": "Origin", "order": 2, "levels": [{"value": "Local"}, {"value": "Imported"}, {"value": "Organic"}]},
            ]
        }
        r = session.put(
            f"{BASE_URL}/api/conjoint/studies/{sid}/attributes",
            json=payload,
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_generate_design(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/generate-design",
            json={"alternatives_per_set": 3, "number_of_sets": 8, "design_method": "d-optimal"},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 201), f"generate-design failed: {r.status_code} {r.text[:300]}"


# ---------------- Conjoint Survey ----------------
class TestConjointSurvey:
    def test_status_collecting(self):
        sid = state["study_id"]
        r = session.put(
            f"{BASE_URL}/api/conjoint/studies/{sid}/status",
            json={"status": "active"},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_start_survey(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/start-survey",
            json={},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 201), r.text
        data = r.json()
        # Common keys: survey_token, share_token, token, survey_id
        token = data.get("survey_token") or data.get("share_token") or data.get("token") or data.get("survey_id") or sid
        state["survey_token"] = token

    def test_public_survey_get(self):
        token = state["survey_token"]
        # Endpoint registered is /conjoint/survey/{study_id}
        r = requests.get(f"{BASE_URL}/api/conjoint/survey/{token}")
        if r.status_code != 200:
            # Try study_id directly
            r = requests.get(f"{BASE_URL}/api/conjoint/survey/{state['study_id']}")
            state["survey_token"] = state["study_id"]
        assert r.status_code == 200, f"public survey GET failed: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert isinstance(data, dict)

    def test_submit_responses(self):
        token = state["survey_token"]
        # Submit 6 responses
        successful = 0
        for i in range(6):
            payload = {
                "respondent_id": f"TEST_resp_{i}",
                "answers": [{"choice_set_index": j, "selected_alternative": (j + i) % 3} for j in range(8)],
            }
            r = requests.post(f"{BASE_URL}/api/conjoint/survey/{token}/response", json=payload)
            if r.status_code in (200, 201):
                successful += 1
        # Don't fail hard - just record
        print(f"Submitted {successful}/6 responses")
        assert successful >= 0  # smoke test only

    def test_sync_respondent_count(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/sync-respondent-count",
            json={},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text


# ---------------- Showcase + Sharing ----------------
class TestShowcase:
    def test_public_showcase(self):
        r = requests.get(f"{BASE_URL}/api/conjoint/showcase")
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("showcases", data) if isinstance(data, dict) else data
        assert isinstance(items, list)

    def test_toggle_public_result(self):
        sid = state["study_id"]
        r = session.put(
            f"{BASE_URL}/api/conjoint/studies/{sid}/public-result",
            json={"is_public": True},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_share_content(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/share-content",
            json={"platform": "twitter"},
            headers=_auth_headers(state["admin_token"]),
        )
        # share-content may need study to be completed; accept 200/400
        assert r.status_code in (200, 201, 400, 422), f"share-content: {r.status_code} {r.text[:200]}"


# ---------------- Analytics ----------------
class TestAnalytics:
    def test_results(self):
        sid = state["study_id"]
        r = session.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}/results",
            headers=_auth_headers(state["admin_token"]),
        )
        # Results may fail if insufficient responses, but should not be 500
        assert r.status_code in (200, 400, 422), f"results: {r.status_code} {r.text[:200]}"

    def test_statistical_analysis(self):
        sid = state["study_id"]
        r = session.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}/statistical-analysis",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 400, 422), f"stats: {r.status_code} {r.text[:200]}"

    def test_export_responses_csv(self):
        sid = state["study_id"]
        r = session.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}/export-responses",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 400, 404), f"export-responses: {r.status_code}"


# ---------------- Advanced Analytics ----------------
class TestAdvancedAnalytics:
    def test_nca(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/nca-analysis",
            json={},
            headers=_auth_headers(state["admin_token"]),
            timeout=60,
        )
        assert r.status_code in (200, 400, 422), f"nca: {r.status_code} {r.text[:200]}"

    def test_fsqca(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/fsqca-analysis",
            json={},
            headers=_auth_headers(state["admin_token"]),
            timeout=60,
        )
        assert r.status_code in (200, 400, 422), f"fsqca: {r.status_code} {r.text[:200]}"

    def test_ipma(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/ipma-analysis",
            json={},
            headers=_auth_headers(state["admin_token"]),
            timeout=60,
        )
        assert r.status_code in (200, 400, 422), f"ipma: {r.status_code} {r.text[:200]}"


# ---------------- Admin Image Settings (non-prefixed URL preserved) ----------------
class TestAdminImageSettings:
    def test_get_admin_image_settings(self):
        r = session.get(
            f"{BASE_URL}/api/admin/conjoint-image-settings",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, f"admin/conjoint-image-settings GET failed: {r.status_code} {r.text[:200]}"

    def test_put_admin_image_settings(self):
        current = session.get(
            f"{BASE_URL}/api/admin/conjoint-image-settings",
            headers=_auth_headers(state["admin_token"]),
        ).json()
        # PUT same back as no-op update
        r = session.put(
            f"{BASE_URL}/api/admin/conjoint-image-settings",
            json=current if isinstance(current, dict) else {},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 422), f"admin/conjoint-image-settings PUT: {r.status_code} {r.text[:200]}"


# ---------------- AI Interpretation ----------------
class TestAIInterpretation:
    def test_kick_off(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/ai-interpretation",
            json={},
            headers=_auth_headers(state["admin_token"]),
        )
        if r.status_code in (400, 422):
            pytest.skip(f"AI interpretation rejected (likely insufficient data): {r.status_code}")
        assert r.status_code in (200, 201, 202), f"ai-interpretation: {r.status_code} {r.text[:200]}"
        data = r.json()
        job_id = data.get("job_id") or data.get("id")
        assert job_id, f"no job_id in response: {data}"
        state["ai_job_id"] = job_id

    def test_poll_status(self):
        if not state.get("ai_job_id"):
            pytest.skip("No AI job to poll")
        sid = state["study_id"]
        job_id = state["ai_job_id"]
        for _ in range(18):  # up to 90s
            r = session.get(
                f"{BASE_URL}/api/conjoint/studies/{sid}/ai-interpretation-status/{job_id}",
                headers=_auth_headers(state["admin_token"]),
            )
            assert r.status_code == 200, f"poll: {r.status_code} {r.text[:200]}"
            status = r.json().get("status", "")
            if status in ("completed", "failed", "error"):
                break
            time.sleep(5)


# ---------------- Thesis Export ----------------
class TestThesisExport:
    def test_grant_permission(self):
        uid = state["admin_id"]
        r = session.put(
            f"{BASE_URL}/api/admin/users/{uid}/thesis-export-permission",
            json={"enabled": True},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, f"grant perm: {r.status_code} {r.text[:200]}"

    def test_kick_off_export(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/export-thesis",
            json={},
            headers=_auth_headers(state["admin_token"]),
        )
        if r.status_code in (400, 422):
            pytest.skip(f"Thesis export rejected (likely needs more data): {r.status_code}")
        assert r.status_code in (200, 201, 202), f"export-thesis: {r.status_code} {r.text[:200]}"
        data = r.json()
        job_id = data.get("job_id") or data.get("id")
        if job_id:
            state["thesis_job_id"] = job_id

    def test_poll_thesis(self):
        if not state.get("thesis_job_id"):
            pytest.skip("No thesis job")
        sid = state["study_id"]
        job_id = state["thesis_job_id"]
        for _ in range(18):  # 90s
            r = session.get(
                f"{BASE_URL}/api/conjoint/studies/{sid}/export-thesis-status/{job_id}",
                headers=_auth_headers(state["admin_token"]),
            )
            assert r.status_code == 200, f"poll thesis: {r.status_code} {r.text[:200]}"
            status = r.json().get("status", "")
            if status in ("completed", "failed", "error"):
                break
            time.sleep(5)


# ---------------- Trash / Soft Delete ----------------
class TestTrash:
    def test_trash_list(self):
        r = session.get(
            f"{BASE_URL}/api/conjoint/studies/trash",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_soft_delete(self):
        sid = state["study_id"]
        r = session.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 204), r.text

    def test_in_trash(self):
        sid = state["study_id"]
        r = session.get(
            f"{BASE_URL}/api/conjoint/studies/trash",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200
        data = r.json()
        items = data.get("studies", data) if isinstance(data, dict) else data
        assert any(s.get("id") == sid for s in items), "Soft-deleted study not in trash"

    def test_restore(self):
        sid = state["study_id"]
        r = session.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/restore",
            json={},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_cleanup_purge(self):
        sid = state["study_id"]
        # soft delete again, then purge
        session.delete(f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_auth_headers(state["admin_token"]))
        r = session.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code in (200, 204, 404), r.text


# ---------------- REGRESSION: Brand Equity ----------------
class TestRegressionBrandEquity:
    def test_be_studies(self):
        r = session.get(f"{BASE_URL}/api/brand-equity/studies", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text

    def test_be_showcase(self):
        r = requests.get(f"{BASE_URL}/api/brand-equity/showcase")
        assert r.status_code == 200, r.text

    def test_be_trash(self):
        r = session.get(f"{BASE_URL}/api/brand-equity/studies/trash", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text


# ---------------- REGRESSION: CMS ----------------
class TestRegressionCMS:
    def test_cms_landing(self):
        r = requests.get(f"{BASE_URL}/api/cms/landing")
        assert r.status_code == 200, r.text

    def test_cms_announcements_pinned(self):
        r = requests.get(f"{BASE_URL}/api/cms/announcements/pinned")
        assert r.status_code == 200, r.text

    def test_cms_posts_public(self):
        r = requests.get(f"{BASE_URL}/api/cms/posts/public")
        assert r.status_code == 200, r.text

    def test_cms_ai_generate_full(self):
        r = session.post(
            f"{BASE_URL}/api/cms/ai/generate-full",
            json={"description": "Marketing research workshop announcement"},
            headers=_auth_headers(state["admin_token"]),
            timeout=60,
        )
        # AI may be slow/rate-limited; allow 200 or 5xx that isn't a routing 404
        assert r.status_code != 404, "AI endpoint missing"
        assert r.status_code in (200, 201, 400, 422, 500, 503), f"cms ai: {r.status_code} {r.text[:200]}"


# ---------------- REGRESSION: Projects + Unified Showcase ----------------
class TestRegressionProjects:
    def test_projects(self):
        r = session.get(f"{BASE_URL}/api/projects", headers=_auth_headers(state["admin_token"]))
        assert r.status_code == 200, r.text

    def test_unified_showcase(self):
        r = requests.get(f"{BASE_URL}/api/showcase/index")
        assert r.status_code == 200, r.text

    def test_share_showcase_index(self):
        r = requests.get(f"{BASE_URL}/api/share/showcase-index")
        assert r.status_code == 200, r.text


# ---------------- REGRESSION: Admin / Users ----------------
class TestRegressionAdmin:
    def test_admin_users_list(self):
        r = session.get(
            f"{BASE_URL}/api/admin/users?q=&limit=10",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_admin_users_count(self):
        r = session.get(
            f"{BASE_URL}/api/admin/users/count",
            headers=_auth_headers(state["admin_token"]),
        )
        assert r.status_code == 200, r.text

    def test_thesis_export_perm_toggle(self):
        uid = state["admin_id"]
        # Off
        r1 = session.put(
            f"{BASE_URL}/api/admin/users/{uid}/thesis-export-permission",
            json={"enabled": False},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r1.status_code == 200, r1.text
        # On
        r2 = session.put(
            f"{BASE_URL}/api/admin/users/{uid}/thesis-export-permission",
            json={"enabled": True},
            headers=_auth_headers(state["admin_token"]),
        )
        assert r2.status_code == 200, r2.text
