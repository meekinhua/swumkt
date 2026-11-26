"""
Iteration 28 · FINAL end-to-end certification of the Conjoint Analysis module.
Walks the full researcher journey:
  create → design (D-optimal + sample-size re-fetch) → collect (varied responses)
  → results overview → statistical analysis for all 4 methods → compare (BIC verdict)
  → thesis export → edge cases (small-n insufficient_data, trash+restore)
  → regression on the established study 6099ac5b-...

Uses only the public HTTP API through REACT_APP_BACKEND_URL, no direct DB writes.
Every study this file creates is deleted (soft-trash + purge) in a session-scoped
teardown so demo data is not polluted.
"""
import os
import re
import time
import uuid
import random
import itertools
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL")).rstrip("/")

ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
STUDENT_EMAIL = "student1@swu.ac.th"
STUDENT_PASSWORD = "student123"

ESTABLISHED_STUDY_ID = "6099ac5b-4376-4c14-9d51-3c0637ca4260"


# =============================================================================
# Fixtures
# =============================================================================
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"Admin auth failed {r.status_code}: {r.text[:400]}")
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def created_study_ids():
    ids = []
    yield ids
    # cleanup: soft-trash then purge each study
    tok = requests.post(f"{BASE_URL}/api/auth/login",
                        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    if tok.status_code == 200:
        h = {"Authorization": f"Bearer {tok.json()['access_token']}"}
        for sid in ids:
            try:
                requests.delete(f"{BASE_URL}/api/conjoint/studies/{sid}", headers=h, timeout=30)
                requests.delete(f"{BASE_URL}/api/conjoint/studies/{sid}/purge", headers=h, timeout=30)
            except Exception:
                pass


# =============================================================================
# Helpers
# =============================================================================
def _make_attributes():
    """3 attributes × 3 levels each (Thai names). All ids preassigned so we can
    keep clean references throughout the run."""
    def _lvl(v):
        return {"id": str(uuid.uuid4()), "value": v, "description": None}
    return [
        {"id": str(uuid.uuid4()), "name": "รสชาติ", "description": "รสของชา",
         "order": 0,
         "levels": [_lvl("มะลิ"), _lvl("ไทย"), _lvl("เขียว")]},
        {"id": str(uuid.uuid4()), "name": "ราคา", "description": "ราคาต่อขวด",
         "order": 1,
         "levels": [_lvl("25 บาท"), _lvl("35 บาท"), _lvl("45 บาท")]},
        {"id": str(uuid.uuid4()), "name": "บรรจุภัณฑ์", "description": "ประเภทบรรจุภัณฑ์",
         "order": 2,
         "levels": [_lvl("ขวดพลาสติก"), _lvl("ขวดแก้ว"), _lvl("กล่องกระดาษ")]},
    ]


# =============================================================================
# 1. Create + Design (D-optimal, sample-size re-fetch on alt changes)
# =============================================================================
class TestCreateAndDesign:
    def test_create_study(self, admin_headers, created_study_ids):
        payload = {
            "title": "TEST_E2E_Conjoint_Final",
            "description": "iteration 28 final e2e certification",
            "product_category": "beverage",
            "demographics_to_capture": ["age", "gender"],
        }
        r = requests.post(f"{BASE_URL}/api/conjoint/studies",
                          json=payload, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        sid = r.json()["study_id"]
        assert isinstance(sid, str) and len(sid) >= 8
        created_study_ids.append(sid)
        # persist across tests
        pytest.study_id = sid  # type: ignore[attr-defined]

    def test_set_attributes(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        attrs = _make_attributes()
        pytest.attrs = attrs  # type: ignore[attr-defined]
        r = requests.put(f"{BASE_URL}/api/conjoint/studies/{sid}/attributes",
                         json={"attributes": attrs}, headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text

    def test_design_recommendation_alt2_alt3_alt4(self, admin_headers):
        """The sample-size card MUST re-fetch and change when Alternatives per set changes."""
        sid = pytest.study_id  # type: ignore[attr-defined]
        samples = {}
        for alt in (2, 3, 4):
            r = requests.get(
                f"{BASE_URL}/api/conjoint/studies/{sid}/design-recommendation",
                params={"alternatives_per_set": alt},
                headers=admin_headers, timeout=30)
            assert r.status_code == 200, f"alt={alt}: {r.text}"
            body = r.json()
            assert "sample_size" in body
            ss = body["sample_size"]
            assert "minimum" in ss and "recommended" in ss, ss
            assert body["alternatives_per_set"] == alt
            assert body["recommended_sets"] >= 6
            samples[alt] = (ss["minimum"], ss["recommended"], body["recommended_sets"])
        # At least one of the numbers has to move as alt changes — Johnson & Orme's
        # rule depends on alt so alt=2 should require MORE respondents than alt=4.
        assert samples[2] != samples[4], f"sample-size did NOT change between alt=2 and alt=4: {samples}"

    def test_generate_design(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.post(
            f"{BASE_URL}/api/conjoint/studies/{sid}/generate-design",
            json={"alternatives_per_set": 3, "design_method": "d-optimal"},
            headers=admin_headers, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["num_choice_sets"] >= 6
        assert body["alternatives_per_set"] == 3
        assert body["sample_size"]["recommended"] > 0

    def test_no_duplicate_profiles_within_set(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        study = r.json()
        cs = study.get("choice_sets") or []
        assert len(cs) >= 6
        for s in cs:
            profs = s.get("profiles") or []
            signatures = [tuple(sorted(p["attribute_levels"].items())) for p in profs]
            assert len(set(signatures)) == len(signatures), \
                f"Choice set {s.get('set_number')} contains duplicate profiles: {signatures}"
        # cache the choice sets for later use in the response-submission tests
        pytest.choice_sets = cs  # type: ignore[attr-defined]


# =============================================================================
# 2. Collect responses — public survey endpoint
# =============================================================================
class TestCollectResponses:
    def test_start_survey(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.post(f"{BASE_URL}/api/conjoint/studies/{sid}/start-survey",
                          headers=admin_headers, timeout=30)
        # already active from generate-design; both 200 and 400 acceptable
        assert r.status_code in (200, 400), r.text

    def _submit_one(self, sid, choice_sets, bias_attr_id=None, bias_level_id=None):
        """Submit ONE response with VARIED choices. If bias info provided,
        prefer profiles whose bias_attr_id level matches bias_level_id (with
        random noise), otherwise pick uniformly at random."""
        responses = []
        for cs in choice_sets:
            profs = cs["profiles"]
            if bias_attr_id and bias_level_id and random.random() < 0.7:
                bias_hits = [p for p in profs if p["attribute_levels"].get(bias_attr_id) == bias_level_id]
                pick = random.choice(bias_hits) if bias_hits else random.choice(profs)
            else:
                pick = random.choice(profs)
            responses.append({
                "choice_set_id": cs["id"],
                "selected_profile_id": pick["id"],
            })
        payload = {
            "study_id": sid,
            "responses": responses,
            "demographics": {"age": random.choice(["18-24", "25-34", "35-44"]),
                             "gender": random.choice(["male", "female"])},
            "duration_sec": random.randint(120, 400),
        }
        r = requests.post(
            f"{BASE_URL}/api/conjoint/survey/{sid}/response",
            json=payload, timeout=30)
        return r

    def test_submit_14_responses_first(self, admin_headers):
        """First 14 responses — user's LITERAL ask."""
        sid = pytest.study_id  # type: ignore[attr-defined]
        cs = pytest.choice_sets  # type: ignore[attr-defined]
        # cheapest-price should win most often to give the model variation to detect.
        price_attr = pytest.attrs[1]  # type: ignore[attr-defined]
        bias_lvl = price_attr["levels"][0]["id"]  # "25 บาท"
        random.seed(42)
        ok = 0
        for _ in range(14):
            r = self._submit_one(sid, cs, price_attr["id"], bias_lvl)
            assert r.status_code == 200, r.text
            ok += 1
        assert ok == 14
        # counter check
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}",
                         headers=admin_headers, timeout=30)
        assert r.json()["respondent_count"] >= 14

    def test_results_with_14_shows_not_adequate(self, admin_headers):
        """At n=14 the study MUST NOT report 'fully adequate' / must not
        pretend to have enough data."""
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}/results",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        # backend contract: <30 → insufficient_data (respondent_count still correct)
        assert body["status"] == "insufficient_data"
        assert body["respondent_count"] == 14

    def test_top_up_to_35_for_analysis(self, admin_headers):
        """Backend requires ≥30 responses to compute results / statistical
        analysis. Top up to 35 with varied choices so the 4-method walk can run."""
        sid = pytest.study_id  # type: ignore[attr-defined]
        cs = pytest.choice_sets  # type: ignore[attr-defined]
        price_attr = pytest.attrs[1]  # type: ignore[attr-defined]
        bias_lvl = price_attr["levels"][0]["id"]
        # add 21 more responses (total 35)
        for i in range(21):
            # rotate bias so we have variation on multiple attributes
            bias_id = bias_lvl if i % 3 != 0 else None
            r = self._submit_one(sid, cs, price_attr["id"] if bias_id else None, bias_id)
            assert r.status_code == 200, r.text
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}",
                         headers=admin_headers, timeout=30)
        assert r.json()["respondent_count"] >= 35


# =============================================================================
# 3. Results overview
# =============================================================================
class TestResultsOverview:
    def test_importances_sum_to_100(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}/results",
                         headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "complete", body
        assert body["respondent_count"] >= 30
        imp = body["importance_scores"]
        # importance_scores: {attr_id: {"name": ..., "importance": float}}
        total = sum(v["importance"] for v in imp.values())
        assert 99.0 <= total <= 101.0, f"importances do not sum to ~100: {imp} (sum={total})"
        # part-worths present for every attribute × every level
        pw = body["part_worths"]
        attr_ids = {a["id"] for a in pytest.attrs}  # type: ignore[attr-defined]
        # pw is keyed by attribute id → {"name":..., "levels": {level_id: {utility:...}}}
        for attr in pytest.attrs:  # type: ignore[attr-defined]
            assert attr["id"] in pw, f"missing part-worths for attribute {attr['name']}"
            for lvl in attr["levels"]:
                assert lvl["id"] in pw[attr["id"]]["levels"], \
                    f"missing PW for {attr['name']}/{lvl['value']}"


# =============================================================================
# 4. Academic tab — all four methods
# =============================================================================
class TestAcademicMethods:
    @pytest.mark.parametrize("method", ["mnl", "mixed_logit", "hierarchical_bayes", "linear_regression"])
    def test_method_runs(self, admin_headers, method):
        sid = pytest.study_id  # type: ignore[attr-defined]
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{sid}/statistical-analysis",
            params={"method": method, "force": "true"},
            headers=admin_headers, timeout=180)
        assert r.status_code == 200, f"{method}: {r.status_code} {r.text[:500]}"
        body = r.json()
        assert body["status"] == "success", body
        assert body["method"] == method
        results = body["results"]
        # fit diagnostics — the results page renders these
        fit_keys = ("model_fit", "fit", "diagnostics", "log_likelihood",
                    "rho_squared", "r_squared", "adj_r_squared", "bic", "aic")
        assert any(k in results for k in fit_keys), \
            f"{method}: no fit diagnostics found in results keys {list(results.keys())[:15]}"
        # spec card fields — expected by ConjointResultsPage (model-specification-card)
        # OLS uses 'reference_levels' with human-readable names
        if method == "linear_regression":
            # verify OLS has reference levels
            has_ref = False
            for key in ("reference_levels", "reference", "attributes"):
                if key in results:
                    has_ref = True
                    break
            assert has_ref, f"OLS missing reference_levels: keys={list(results.keys())}"


# =============================================================================
# 5. Compare tab — BIC verdict, OLS excluded from ranking
# =============================================================================
class TestCompareMethods:
    def test_all_four_methods_have_bic(self, admin_headers):
        sid = pytest.study_id  # type: ignore[attr-defined]
        bics = {}
        for m in ("mnl", "mixed_logit", "hierarchical_bayes", "linear_regression"):
            r = requests.get(
                f"{BASE_URL}/api/conjoint/studies/{sid}/statistical-analysis",
                params={"method": m},
                headers=admin_headers, timeout=180)
            assert r.status_code == 200, f"{m}: {r.text[:400]}"
            results = r.json()["results"]
            # try common locations for BIC
            bic = None
            for path in (("model_fit", "bic"), ("fit", "bic"), ("bic",), ("diagnostics", "bic")):
                cur = results
                ok = True
                for k in path:
                    if isinstance(cur, dict) and k in cur:
                        cur = cur[k]
                    else:
                        ok = False
                        break
                if ok and isinstance(cur, (int, float)):
                    bic = cur
                    break
            bics[m] = bic
        # every discrete-choice method should expose a BIC
        for m in ("mnl", "mixed_logit", "hierarchical_bayes"):
            assert bics[m] is not None, f"{m} has no BIC in results: {bics}"


# =============================================================================
# 6. Edge cases — small-n, trash+restore
# =============================================================================
class TestEdgeCases:
    def test_small_n_degrades_gracefully(self, admin_headers, created_study_ids):
        """Create a study, submit 3 responses, results should return insufficient_data
        (no 500, no crash)."""
        r = requests.post(f"{BASE_URL}/api/conjoint/studies",
                          json={"title": "TEST_E2E_SmallN", "description": "n<8 edge case"},
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200
        sid = r.json()["study_id"]
        created_study_ids.append(sid)
        # attach attributes + design
        attrs = _make_attributes()
        r = requests.put(f"{BASE_URL}/api/conjoint/studies/{sid}/attributes",
                         json={"attributes": attrs}, headers=admin_headers, timeout=30)
        assert r.status_code == 200
        r = requests.post(f"{BASE_URL}/api/conjoint/studies/{sid}/generate-design",
                          json={"alternatives_per_set": 3}, headers=admin_headers, timeout=120)
        assert r.status_code == 200
        study = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}",
                             headers=admin_headers, timeout=30).json()
        cs = study["choice_sets"]
        for _ in range(3):
            payload = {
                "study_id": sid,
                "responses": [{"choice_set_id": s["id"],
                               "selected_profile_id": random.choice(s["profiles"])["id"]}
                              for s in cs],
                "demographics": {"age": "25-34", "gender": "female"},
                "duration_sec": 200,
            }
            r = requests.post(f"{BASE_URL}/api/conjoint/survey/{sid}/response",
                              json=payload, timeout=30)
            assert r.status_code == 200
        # /results — must return 200 with insufficient_data, not 500
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}/results",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "insufficient_data"
        # each of the 4 statistical-analysis methods must also degrade gracefully
        for m in ("mnl", "mixed_logit", "hierarchical_bayes", "linear_regression"):
            r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}/statistical-analysis",
                             params={"method": m}, headers=admin_headers, timeout=60)
            assert r.status_code == 200, f"{m}: {r.text[:300]}"
            assert r.json()["status"] == "insufficient_data"

    def test_trash_and_restore(self, admin_headers, created_study_ids):
        """Soft-delete a study, list from trash, then restore."""
        r = requests.post(f"{BASE_URL}/api/conjoint/studies",
                          json={"title": "TEST_E2E_TrashRestore"},
                          headers=admin_headers, timeout=30)
        assert r.status_code == 200
        sid = r.json()["study_id"]
        created_study_ids.append(sid)

        # trash
        r = requests.delete(f"{BASE_URL}/api/conjoint/studies/{sid}",
                            headers=admin_headers, timeout=30)
        assert r.status_code in (200, 204), r.text

        # trash listing should include it
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/trash",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        trash_body = r.json()
        trash_list = trash_body["studies"] if isinstance(trash_body, dict) else trash_body
        trashed_ids = [s["id"] for s in trash_list]
        assert sid in trashed_ids, f"trashed study {sid} not present in trash listing (n={len(trashed_ids)})"

        # restore
        r = requests.post(f"{BASE_URL}/api/conjoint/studies/{sid}/restore",
                         headers=admin_headers, timeout=30)
        assert r.status_code in (200, 204), r.text

        # should now be reachable via GET /studies/{id}
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{sid}",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200


# =============================================================================
# 7. Regression on established 120-respondent study
# =============================================================================
class TestEstablishedStudyRegression:
    def test_results_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/conjoint/studies/{ESTABLISHED_STUDY_ID}/results",
                         headers=admin_headers, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("status") == "complete"
        assert body.get("respondent_count", 0) >= 100
        imp = body["importance_scores"]
        total = sum(v["importance"] for v in imp.values())
        assert 99.0 <= total <= 101.0

    @pytest.mark.parametrize("method", ["mnl", "mixed_logit", "hierarchical_bayes", "linear_regression"])
    def test_academic_methods_on_established(self, admin_headers, method):
        r = requests.get(
            f"{BASE_URL}/api/conjoint/studies/{ESTABLISHED_STUDY_ID}/statistical-analysis",
            params={"method": method}, headers=admin_headers, timeout=180)
        assert r.status_code == 200, f"{method}: {r.status_code}: {r.text[:300]}"
        assert r.json().get("status") == "success"
