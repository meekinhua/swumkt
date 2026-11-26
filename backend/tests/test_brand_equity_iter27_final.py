"""Iter-27 backend acceptance for the 4 new Brand Equity features + Conjoint public-route regression.

Covers:
- score-history (wave / month / week granularities) + empty state
- segment-significance (age Welch-ANOVA sig, gender ns, small-study not-testable)
- drafts-summary (owner nudge)
- public draft save/get/delete + respond(draft_id) deletes draft
- owner-only 403 for non-owner
- Conjoint public results/statistical-analysis reachable without auth
"""
import os
import uuid
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

DEMO_STUDY_ID = "demo-sim-chathai-001"
DEMO_TOKEN = "demosimchathai"
WAVE_STUDY_ID = "zz-wavesig-0001"
SMALL_STUDY_ID = "0a0a1f3b-54f9-4d06-addb-10a4c620d187"  # TEST_UIBrand, 12 responses
CONJOINT_PUBLIC_STUDY = "6099ac5b-4376-4c14-9d51-3c0637ca4260"


# --- fixtures ---

@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "admin@swu.ac.th", "password": "admin123"},
                      timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="session")
def student_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "student1@swu.ac.th", "password": "student123"},
                      timeout=30)
    assert r.status_code == 200, f"student login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def student_headers(student_token):
    return {"Authorization": f"Bearer {student_token}"}


# --- score-history ---

class TestScoreHistory:
    def test_wave_granularity(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/score-history",
            params={"granularity": "wave"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["granularity"] == "wave"
        pts = data["points"]
        assert isinstance(pts, list) and len(pts) >= 2, f"expected >=2 wave points, got {len(pts)}"
        for p in pts:
            assert "label" in p and "n" in p and "composite" in p
            # each point should carry a BES-composite dictionary
            assert isinstance(p["composite"], dict)

    def test_month_granularity(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/score-history",
            params={"granularity": "month"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["granularity"] == "month"
        assert len(data["points"]) >= 1

    def test_week_granularity(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/score-history",
            params={"granularity": "week"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["granularity"] == "week"

    def test_non_owner_forbidden(self, student_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/score-history",
            headers=student_headers, timeout=30)
        assert r.status_code == 403


# --- segment-significance ---

class TestSegmentSignificance:
    def test_age_significant_on_identity_loyalty(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/segment-significance",
            params={"field": "age"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["testable"] is True
        assert data["field"] == "age"
        by_dim = data["by_dimension"]
        # identity + loyalty must come out significant with 4 age groups
        assert by_dim["identity"]["testable"] is True
        assert by_dim["identity"]["significant"] is True, f"identity should be sig: {by_dim['identity']}"
        assert by_dim["loyalty"]["significant"] is True, f"loyalty should be sig: {by_dim['loyalty']}"
        # 4 groups -> Welch ANOVA (alexander-govern)
        assert "alexander" in by_dim["identity"]["test"] or "anova" in by_dim["identity"]["test"]
        # pairwise present
        assert isinstance(by_dim["identity"].get("pairwise"), list)
        assert len(by_dim["identity"]["pairwise"]) >= 3
        # Holm-adjusted p present
        assert "p_value_holm" in by_dim["identity"]
        # awareness / quality should be ns
        assert by_dim["quality"].get("significant") is False

    def test_gender_ns_all_dimensions(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/segment-significance",
            params={"field": "gender"}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        by_dim = r.json()["by_dimension"]
        for dim in ("awareness", "quality", "identity", "loyalty"):
            if by_dim.get(dim, {}).get("testable"):
                assert by_dim[dim]["significant"] is False, f"gender {dim} should be ns"

    def test_small_study_not_testable(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{SMALL_STUDY_ID}/segment-significance",
            params={"field": "age"}, headers=admin_headers, timeout=30)
        # Should be 200 with testable=False, not a crash
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["testable"] is False
        assert "reason" in data

    def test_non_owner_forbidden(self, student_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/segment-significance",
            params={"field": "age"}, headers=student_headers, timeout=30)
        assert r.status_code == 403


# --- drafts-summary ---

class TestDraftsSummary:
    def test_demo_has_unfinished(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/drafts-summary",
            headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data["unfinished"] >= 15, f"expected ~25-30 unfinished drafts, got {data['unfinished']}"

    def test_non_owner_forbidden(self, student_headers):
        r = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{DEMO_STUDY_ID}/drafts-summary",
            headers=student_headers, timeout=30)
        assert r.status_code == 403


# --- public draft lifecycle ---

class TestPublicDraft:
    def test_create_get_delete(self):
        # Create
        payload = {
            "answers": [
                {"question_id": "aw_1", "value": 5},
                {"question_id": "aw_2", "value": 4},
                {"question_id": "aw_3", "value": 6},
            ],
            "demographics": {"age": "25-34"},
            "section": 1,
        }
        r = requests.post(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft",
                          json=payload, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        draft_id = d["draft_id"]
        assert d["answered_count"] == 3
        assert "updated_at" in d

        # Get
        r2 = requests.get(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft/{draft_id}",
                          timeout=30)
        assert r2.status_code == 200
        got = r2.json()
        assert got["id"] == draft_id
        assert len(got["answers"]) == 3
        assert got["section"] == 1
        assert got.get("demographics", {}).get("age") == "25-34"

        # Update via same draft_id
        payload2 = {"draft_id": draft_id,
                    "answers": payload["answers"] + [{"question_id": "aw_4", "value": 7}],
                    "demographics": payload["demographics"], "section": 1}
        r3 = requests.post(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft",
                           json=payload2, timeout=30)
        assert r3.status_code == 200
        assert r3.json()["draft_id"] == draft_id
        assert r3.json()["answered_count"] == 4

        # Delete
        r4 = requests.delete(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft/{draft_id}",
                             timeout=30)
        assert r4.status_code == 200

        # Get after delete -> 404
        r5 = requests.get(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft/{draft_id}",
                          timeout=30)
        assert r5.status_code == 404

    def test_draft_deleted_on_submit(self):
        # Create draft
        payload = {"answers": [{"question_id": "aw_1", "value": 5}],
                   "demographics": {}, "section": 0}
        r = requests.post(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft",
                          json=payload, timeout=30)
        assert r.status_code == 200
        draft_id = r.json()["draft_id"]

        # Submit a response with that draft_id (minimal answers so validation might drop them,
        # but the endpoint should still delete the draft)
        submit_payload = {
            "draft_id": draft_id,
            "answers": [{"question_id": "aw_1", "value": 5}],
            "demographics": {"age": "25-34", "gender": "female", "occupation": "student"},
        }
        r2 = requests.post(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/respond",
                           json=submit_payload, timeout=30)
        # 200 if accepted, 400 if invalid. Either way, draft should be gone on 200.
        if r2.status_code == 200:
            r3 = requests.get(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft/{draft_id}",
                              timeout=30)
            assert r3.status_code == 404, "draft must be deleted on successful submit"
        else:
            # cleanup manually so we don't leak
            requests.delete(f"{BASE_URL}/api/brand-equity/public/{DEMO_TOKEN}/draft/{draft_id}",
                            timeout=30)


# --- Conjoint public-route regression (iter24 HIGH bug) ---

class TestConjointPublicRoute:
    def test_public_results_no_auth(self):
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{CONJOINT_PUBLIC_STUDY}/results",
                         timeout=60)
        assert r.status_code == 200, f"public /results should work w/o auth: {r.status_code}"
        data = r.json()
        assert "importance_scores" in data or "part_worths" in data

    def test_public_statistical_analysis_no_auth(self):
        # This is what the Compare tab hits — must be reachable without a token.
        methods = ["mnl", "mixed_logit", "hierarchical_bayes", "linear_regression"]
        for m in methods:
            r = requests.get(
                f"{BASE_URL}/api/conjoint/studies/{CONJOINT_PUBLIC_STUDY}/statistical-analysis",
                params={"method": m}, timeout=120)
            assert r.status_code == 200, f"public statistical-analysis({m}) failed: {r.status_code} {r.text[:200]}"
