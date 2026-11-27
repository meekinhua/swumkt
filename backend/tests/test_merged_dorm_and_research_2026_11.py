"""Regression checks for the merged 2026-11 + dorm + research-UX baseline.

Covers:
1. Self-registration security guard (`POST /api/auth/register` rejects `role="admin"` -> 403).
2. Filtered Conjoint NCA, fsQCA, and `generate-prompt` (`?segments=...`), verifying filtered counts
   and verifying unfiltered caches on the study document stay intact.
"""

import json
import os
import uuid
import pytest
import requests

API = f"{os.environ.get('REACT_APP_BACKEND_URL', 'http://localhost:8001').rstrip('/')}/api"
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "admin@swu.ac.th")
ADMIN_PASSWORD = os.environ.get("TEST_ADMIN_PASSWORD", "admin123")


def _login(email: str, password: str) -> dict:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"Login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_headers():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD)


@pytest.fixture
def conjoint_cleanup(admin_headers):
    created = []
    yield created
    for sid in created:
        requests.delete(f"{API}/conjoint/studies/{sid}", headers=admin_headers, timeout=15)
        requests.delete(f"{API}/conjoint/studies/{sid}/purge", headers=admin_headers, timeout=15)


def test_register_rejects_privileged_role():
    res = requests.post(
        f"{API}/auth/register",
        json={
            "email": f"sec_{uuid.uuid4().hex[:8]}@swu.ac.th",
            "password": "Password123!",
            "full_name": "Security Probe",
            "role": "admin",
        },
        timeout=15,
    )
    assert res.status_code == 403, f"Expected 403 for privileged self-register, got {res.status_code}: {res.text}"


def test_conjoint_filtered_nca_fsqca_and_prompt(admin_headers, conjoint_cleanup):
    st = requests.post(
        f"{API}/conjoint/studies",
        json={"title": "TEST_Merged_Filtered_Adv", "description": "Merged QA", "product_category": "Coffee"},
        headers=admin_headers,
        timeout=15,
    )
    assert st.status_code in (200, 201), st.text
    sid = st.json().get("study_id") or st.json().get("id")
    conjoint_cleanup.append(sid)

    attrs = [
        {"name": "ราคา", "description": "บาท", "levels": [{"value": "45 บาท"}, {"value": "65 บาท"}]},
        {"name": "ขนาด", "description": "ml", "levels": [{"value": "250 ml"}, {"value": "350 ml"}]},
    ]
    put_a = requests.put(f"{API}/conjoint/studies/{sid}/attributes", json={"attributes": attrs}, headers=admin_headers, timeout=15)
    assert put_a.status_code == 200, put_a.text

    des = requests.post(
        f"{API}/conjoint/studies/{sid}/generate-design",
        json={"alternatives_per_set": 3, "number_of_sets": 6},
        headers=admin_headers,
        timeout=20,
    )
    assert des.status_code == 200, des.text
    assert requests.post(f"{API}/conjoint/studies/{sid}/start-survey", json={}, headers=admin_headers, timeout=15).status_code == 200

    csets = requests.get(f"{API}/conjoint/survey/{sid}", timeout=15).json()["choice_sets"]
    for i in range(15):
        ch = [{"choice_set_id": cs["id"], "selected_profile_id": cs["profiles"][0 if i % 2 == 0 else -1]["id"]} for cs in csets]
        resp = requests.post(
            f"{API}/conjoint/survey/{sid}/response",
            json={"study_id": sid, "responses": ch, "duration_sec": 25, "demographics": {"gender": "female" if i < 10 else "male"}},
            timeout=15,
        )
        assert resp.status_code == 200, resp.text

    # Unfiltered NCA & fsQCA
    nca_all = requests.post(f"{API}/conjoint/studies/{sid}/nca-analysis", json={}, headers=admin_headers, timeout=20)
    assert nca_all.status_code == 200, nca_all.text
    assert nca_all.json()["respondent_count"] == 15 and nca_all.json()["filtered"] is False

    fs_all = requests.post(f"{API}/conjoint/studies/{sid}/fsqca-analysis", json={}, headers=admin_headers, timeout=20)
    assert fs_all.status_code == 200, fs_all.text
    assert fs_all.json()["respondent_count"] == 15 and fs_all.json()["filtered"] is False

    # Filtered (female = 10)
    seg = json.dumps({"gender": ["female"]})
    nca_f = requests.post(f"{API}/conjoint/studies/{sid}/nca-analysis", params={"segments": seg}, json={}, headers=admin_headers, timeout=20)
    assert nca_f.status_code == 200, nca_f.text
    assert nca_f.json()["respondent_count"] == 10 and nca_f.json()["filtered"] is True

    fs_f = requests.post(f"{API}/conjoint/studies/{sid}/fsqca-analysis", params={"segments": seg}, json={}, headers=admin_headers, timeout=20)
    assert fs_f.status_code == 200, fs_f.text
    assert fs_f.json()["respondent_count"] == 10 and fs_f.json()["filtered"] is True

    gp_f = requests.post(
        f"{API}/conjoint/studies/{sid}/generate-prompt",
        params={"segments": seg},
        json={"method": "mnl", "compare_all": False},
        headers=admin_headers,
        timeout=20,
    )
    assert gp_f.status_code == 200, gp_f.text
    gp_data = gp_f.json()
    assert gp_data["filtered"] is True and gp_data["respondent_count"] == 10
    assert "[Filter Scope]" in gp_data["prompt"]

    # Confirm unfiltered nca_results cache on study still shows N=15
    study_doc = requests.get(f"{API}/conjoint/studies/{sid}", headers=admin_headers, timeout=15).json()
    assert study_doc["nca_results"]["respondent_count"] == 15
    assert study_doc["fsqca_results"]["respondent_count"] == 15
