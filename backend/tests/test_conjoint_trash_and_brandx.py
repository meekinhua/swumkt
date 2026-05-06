"""Backend tests for iteration 18:
   1. Brand Equity 'Brand X' hallucination fix in aided_recognition options.
   2. Conjoint Analysis soft-delete + Trash Bin (restore/purge) flow.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or pytest.fail(
    "REACT_APP_BACKEND_URL not set"
)
ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASS = "admin123"
STUDENT_EMAIL = "student1@swu.ac.th"
STUDENT_PASS = "student123"


# ---------- Auth helpers ----------
def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("access_token") or data.get("token")
    assert token, f"no token in login response: {data}"
    return token


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT_EMAIL, STUDENT_PASS)


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ============================================================
# 1. Brand Equity — aided_recognition decoy removal
# ============================================================
class TestBrandEquityAidedRecognition:
    """Verify aided_recognition options contain ONLY user-entered brands (no Brand X/Y/Z)."""

    DECOY_NAMES = {"brand x", "brand y", "brand z"}
    _created = []

    def _create_study(self, token, name, competitors):
        payload = {
            "brand": {
                "name": name,
                "category": "ทั่วไป",
                "competitors": competitors,
            },
            "identity": {"traits": [], "visual_assets": []},
            "segments_to_capture": ["age", "gender"],
            "target_responses": 50,
        }
        r = requests.post(
            f"{BASE_URL}/api/brand-equity/studies",
            json=payload,
            headers=_h(token),
            timeout=30,
        )
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        data = r.json()
        sid = data.get("id") or data.get("study_id") or (data.get("study") or {}).get("id")
        assert sid, f"no study id in create response: {data}"
        self._created.append((token, sid))
        # Fetch full study to inspect questions
        rg = requests.get(
            f"{BASE_URL}/api/brand-equity/studies/{sid}", headers=_h(token), timeout=30
        )
        assert rg.status_code == 200, f"GET study failed: {rg.status_code} {rg.text}"
        return rg.json()

    def _aided(self, study):
        questions = study.get("questions") or []
        aided = [q for q in questions if q.get("kind") == "aided_recognition"]
        assert aided, "No aided_recognition question found"
        return aided[0]

    def test_two_competitors_yields_three_options_no_decoys(self, admin_token):
        focal = f"TEST_AR_Focal_{uuid.uuid4().hex[:6]}"
        comps = ["TEST_Comp_A", "TEST_Comp_B"]
        study = self._create_study(admin_token, focal, comps)
        q = self._aided(study)
        opts = q.get("options") or []
        opts_th = q.get("options_th") or []
        assert opts == [focal] + comps, f"options mismatch: {opts}"
        assert opts_th == [focal] + comps, f"options_th mismatch: {opts_th}"
        # No decoys
        for o in opts + opts_th:
            assert o.lower() not in self.DECOY_NAMES, f"decoy present: {o}"

    def test_zero_competitors_yields_single_option(self, admin_token):
        focal = f"TEST_AR_Solo_{uuid.uuid4().hex[:6]}"
        study = self._create_study(admin_token, focal, [])
        q = self._aided(study)
        opts = q.get("options") or []
        assert opts == [focal], f"expected [{focal}], got {opts}"
        for o in opts:
            assert o.lower() not in self.DECOY_NAMES

    def test_many_competitors_all_included(self, admin_token):
        focal = f"TEST_AR_Many_{uuid.uuid4().hex[:6]}"
        comps = [f"TEST_Comp_{i}" for i in range(6)]
        study = self._create_study(admin_token, focal, comps)
        q = self._aided(study)
        opts = q.get("options") or []
        # Ensure all real brands present and no decoy
        assert set(opts) == set([focal] + comps), f"mismatch: {opts}"
        for o in opts:
            assert o.lower() not in self.DECOY_NAMES

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup
        for token, sid in cls._created:
            try:
                requests.delete(
                    f"{BASE_URL}/api/brand-equity/studies/{sid}",
                    headers=_h(token),
                    timeout=15,
                )
            except Exception:
                pass


# ============================================================
# 2. Conjoint — soft-delete + trash flow
# ============================================================
class TestConjointTrash:
    _admin_studies = []  # track for cleanup

    def _create_conjoint(self, token, title=None):
        title = title or f"TEST_Conjoint_{uuid.uuid4().hex[:6]}"
        r = requests.post(
            f"{BASE_URL}/api/conjoint/studies",
            json={"title": title, "description": "auto", "product_category": "test"},
            headers=_h(token),
            timeout=20,
        )
        assert r.status_code in (200, 201), f"create conjoint failed: {r.status_code} {r.text}"
        sid = r.json().get("study_id")
        assert sid, f"no study_id: {r.text}"
        self._admin_studies.append((token, sid))
        return sid, title

    # --- Route priority test ---
    def test_trash_route_priority_returns_200(self, admin_token):
        """GET /conjoint/studies/trash must NOT be matched by /studies/{study_id}."""
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/trash", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200, f"trash route failed: {r.status_code} {r.text}"
        body = r.json()
        assert "studies" in body and isinstance(body["studies"], list)

    # --- Full lifecycle: create → delete (soft) → list excludes → trash includes → restore → list includes → delete → purge → gone ---
    def test_full_soft_delete_lifecycle(self, admin_token):
        sid, title = self._create_conjoint(admin_token)

        # Active list contains it
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200
        active_ids = [s["id"] for s in r.json().get("studies", [])]
        assert sid in active_ids, "newly created not in active list"

        # Soft delete
        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200, f"soft-delete failed: {r.status_code} {r.text}"
        body = r.json()
        assert body.get("trashed") is True, f"expected trashed:true, got {body}"

        # Active list excludes it
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies", headers=_h(admin_token), timeout=20
        )
        active_ids = [s["id"] for s in r.json().get("studies", [])]
        assert sid not in active_ids, "soft-deleted study still in active list"

        # Trash list includes with deleted_at
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/trash", headers=_h(admin_token), timeout=20
        )
        trash = r.json().get("studies", [])
        match = next((s for s in trash if s["id"] == sid), None)
        assert match is not None, "study not found in trash"
        assert match.get("deleted_at"), f"deleted_at missing/falsy: {match}"
        assert isinstance(match["deleted_at"], str), "deleted_at not ISO string"

        # Restore
        r = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/restore",
            headers=_h(admin_token),
            timeout=20,
        )
        assert r.status_code == 200, f"restore failed: {r.status_code} {r.text}"
        assert r.json().get("trashed") is False

        # No longer in trash
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/trash", headers=_h(admin_token), timeout=20
        )
        trash_ids = [s["id"] for s in r.json().get("studies", [])]
        assert sid not in trash_ids, "restored study still in trash"

        # Back in active list
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies", headers=_h(admin_token), timeout=20
        )
        active_ids = [s["id"] for s in r.json().get("studies", [])]
        assert sid in active_ids, "restored study not in active list"

        # Soft-delete again, then purge
        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200

        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
            headers=_h(admin_token),
            timeout=20,
        )
        assert r.status_code == 200, f"purge failed: {r.status_code} {r.text}"

        # GET should now 404
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 404, f"expected 404 after purge, got {r.status_code}"

    # --- Permission: non-owner non-admin cannot delete/restore/purge ---
    def test_non_owner_cannot_delete_or_restore_or_purge(self, admin_token, student_token):
        sid, _ = self._create_conjoint(admin_token)  # owned by admin

        # Student tries to delete
        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(student_token), timeout=20
        )
        assert r.status_code == 403, f"expected 403 for student delete, got {r.status_code} {r.text}"

        # Admin soft-deletes (so we can test student restore)
        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200

        r = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/restore",
            headers=_h(student_token),
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403 for student restore, got {r.status_code}"

        r = requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
            headers=_h(student_token),
            timeout=20,
        )
        assert r.status_code == 403, f"expected 403 for student purge, got {r.status_code}"

        # Cleanup: admin purges
        requests.delete(
            f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
            headers=_h(admin_token),
            timeout=20,
        )

    # --- Regression: GET /studies/{id} still works for active study ---
    def test_get_active_study_detail_works(self, admin_token):
        sid, title = self._create_conjoint(admin_token)
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}", headers=_h(admin_token), timeout=20
        )
        assert r.status_code == 200
        body = r.json()
        assert body.get("id") == sid and body.get("title") == title

    @classmethod
    def teardown_class(cls):
        # Best-effort cleanup of leftover test studies
        for token, sid in cls._admin_studies:
            try:
                requests.delete(
                    f"{BASE_URL}/api/conjoint/studies/{sid}/purge",
                    headers=_h(token),
                    timeout=10,
                )
            except Exception:
                pass
