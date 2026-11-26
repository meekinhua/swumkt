"""
Phase 1 (model-free) Customer Journey — HTTP contract tests.

Focus:
- Analysis payload contract (no matrix / map / priority / p-values, intervals present, JSON clean)
- Filtered slices via segments= / from= / to= create SEPARATE cache rows without 500
- Budget hard block
- Small-sample honesty (route shares hidden < 30)
- PDPA public respond + withdraw
- Public flow screening
"""
import json
import os
import math
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

DEMO_ID = "demo-journey-kafae-001"
DEMO_TOKEN = "demojourney1"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": "admin@swu.ac.th", "password": "admin123"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed: {r.status_code} {r.text[:300]}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def auth(api, admin_token):
    api.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api


# ---------------------------------------------------------------------------
# Public study endpoint
# ---------------------------------------------------------------------------
def test_public_study_loads(api):
    r = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}")
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["id"] == DEMO_ID
    assert isinstance(body["states"], list) and len(body["states"]) >= 5
    assert isinstance(body["segment_questions"], list) and body["segment_questions"]
    # Thai copy present
    assert any(s.get("label_th") for s in body["states"])


# ---------------------------------------------------------------------------
# Analysis contract — the Phase-1 forbidden fields must be absent/null
# ---------------------------------------------------------------------------
def test_analysis_contract_no_matrix_no_map_no_pvalues(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    assert r.status_code == 200, r.text[:400]
    # Guard: content must be plain JSON — NaN/Inf would tokenise but the raw
    # body parses cleanly only when json_safe scrubbed them.
    raw = r.text
    assert "NaN" not in raw and "Infinity" not in raw and "-Infinity" not in raw
    body = json.loads(raw)
    res = body["results"]
    # Phase-2 things must be absent
    assert res["matrix"] is None
    assert res["map"] is None
    assert res["priority"] is None
    # Gates: no p-values in Phase 1, both non-evaluable
    for k in ("order_test", "predictive"):
        gate = res["gates"][k]
        assert gate["evaluable"] is False
        assert gate.get("p") is None
    # Terminals present with intervals
    for t in ("CONV", "ABANDON", "UNKNOWN"):
        row = res["terminals"][t]
        assert "count" in row and "share" in row
        assert row.get("share_ci95") is not None
        assert isinstance(row["share_ci95"], (list, tuple)) and len(row["share_ci95"]) == 2
    # Routes: top must have counts, and CIs for share values when shown
    routes = res["routes"]
    assert "top" in routes and "shares_hidden" in routes
    if not routes["shares_hidden"]:
        for r0 in routes["top"]:
            assert r0.get("count") is not None
            assert r0.get("share") is not None
            assert r0.get("share_ci95") is not None
    # Per-node table has reach + CI, burden 0-100 + CI
    for node in res["nodes"].values():
        if node.get("n_visit"):
            assert node.get("reach") is not None
            assert node.get("reach_ci95") is not None
            b = node.get("burden")
            if b is not None:
                assert 0.0 <= b <= 100.0
                assert node.get("burden_ci95") is not None


def test_analysis_no_nan_or_inf_in_serialised_payload(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    assert r.status_code == 200
    body = r.json()

    def walk(obj):
        if isinstance(obj, float):
            assert math.isfinite(obj) or obj is None, f"non-finite float: {obj}"
        elif isinstance(obj, dict):
            for v in obj.values():
                walk(v)
        elif isinstance(obj, list):
            for v in obj:
                walk(v)
    walk(body)


def test_analysis_terminals_shares_sum_to_one(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    body = r.json()["results"]
    total = sum(body["terminals"][k]["share"] for k in ("CONV", "ABANDON", "UNKNOWN"))
    assert abs(total - 1.0) < 1e-6


def test_analysis_shows_140_respondents(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    body = r.json()
    assert body["respondent_count"] == 140


# ---------------------------------------------------------------------------
# Filtered slices — the exact bug the old unique index caused (500 on 2nd slice)
# ---------------------------------------------------------------------------
def test_filtered_slices_do_not_500_and_are_independent(auth):
    # 1) baseline
    r0 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    assert r0.status_code == 200
    # 2) date-window slice
    r1 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis",
                  params={"from": "2020-01-01", "to": "2030-12-31"})
    assert r1.status_code == 200
    # 3) segment slice — age_band
    seg = json.dumps({"age_band": ["20–29 ปี"]}, ensure_ascii=False)
    r2 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis",
                  params={"segments": seg})
    assert r2.status_code == 200, r2.text[:400]
    # 4) date+segment slice (2nd flavour)
    r3 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis",
                  params={"segments": seg, "from": "2020-01-01"})
    assert r3.status_code == 200, r3.text[:400]

    sigs = {r0.json()["filter_signature"], r1.json()["filter_signature"],
            r2.json()["filter_signature"], r3.json()["filter_signature"]}
    assert len(sigs) == 4, f"expected 4 distinct filter signatures, got {sigs}"


def test_filtered_segments_actually_narrow_the_sample(auth):
    seg = json.dumps({"age_band": ["20–29 ปี"]}, ensure_ascii=False)
    r_all = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    r_slice = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis",
                       params={"segments": seg}).json()
    assert r_slice["respondent_count"] < r_all["respondent_count"]


# ---------------------------------------------------------------------------
# Budget hard block
# ---------------------------------------------------------------------------
def _create_study(auth, **overrides):
    body = {
        "title": "TEST_journey_budget",
        "analysis_level": "product",
        "subject": {"name": "TEST", "category": "TEST"},
        "template_key": "retail_product",
        "sampling_frame": "ผู้บริโภคทดสอบ",
        "recall_window_days": 90,
        "target_responses": 200,
    }
    body.update(overrides)
    r = auth.post(f"{BASE_URL}/api/journey/studies", json=body)
    assert r.status_code in (200, 201), r.text[:400]
    return r.json()


def test_budget_hard_block_with_low_target_high_states(auth):
    study = _create_study(auth, target_responses=50)  # 6 states via retail_product, low target
    sid = study["id"]
    try:
        r = auth.get(f"{BASE_URL}/api/journey/studies/{sid}/budget-estimate")
        assert r.status_code == 200
        assert r.json().get("blocked") is True, r.json()
        # Thai text present
        text = json.dumps(r.json(), ensure_ascii=False)
        assert "จำนวน" in text or "ตัด" in text or "ผู้ตอบ" in text or "งบ" in text or "รับได้" in text or "รองรับ" in text or "ขั้น" in text

        # Bumping target unblocks
        r2 = auth.put(f"{BASE_URL}/api/journey/studies/{sid}",
                      json={"target_responses": 300})
        assert r2.status_code == 200, r2.text[:300]
        r3 = auth.get(f"{BASE_URL}/api/journey/studies/{sid}/budget-estimate")
        assert r3.status_code == 200
        assert r3.json().get("blocked") is False
    finally:
        auth.delete(f"{BASE_URL}/api/journey/studies/{sid}/purge")


# ---------------------------------------------------------------------------
# PDPA — public respond + withdraw
# ---------------------------------------------------------------------------
def _minimal_submit_body(states):
    sid = states[0]["id"]
    return {
        "consent": {"participation": True, "recontact": False, "linkage": False},
        "episode": {"recency_band": "le_7"},
        "path": [{"state_id": sid, "order": 0}],
        "visited": [sid],
        "terminal": "CONV",
        "experience": {sid: {"difficulty_1_5": 3, "emotion": 0}},
        "pain": {"nominated": []},
        "demographics": {"age_band": "20–29 ปี"},
        "quality": {"duration_sec": 180, "difficulty_rows": 1, "scored_rows": 1,
                    "longstring": 1, "irv": 1.0},
    }


def test_public_respond_then_withdraw_roundtrip(api, auth):
    # Baseline
    a0 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    n0 = a0["respondent_count"]

    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    body = _minimal_submit_body(pub["states"])
    r = api.post(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/respond", json=body)
    assert r.status_code == 200, r.text[:400]
    j = r.json()
    assert j.get("respondent_token") and len(j["respondent_token"]) == 32

    a1 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    assert a1["respondent_count"] == n0 + 1

    # Unknown token = 404
    bad = api.delete(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/withdraw/ffffffffffffffffffffffffffffffff")
    assert bad.status_code == 404

    # Real withdraw
    d = api.delete(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/withdraw/{j['respondent_token']}")
    assert d.status_code == 200, d.text[:300]

    a2 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    assert a2["respondent_count"] == n0


def test_screened_out_never_stored(api, auth):
    a0 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    n0 = a0["respondent_count"]
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    body = _minimal_submit_body(pub["states"])
    body["episode"]["recency_band"] = "never"
    r = api.post(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/respond", json=body)
    assert r.status_code == 200, r.text[:300]
    j = r.json()
    assert j.get("screened_out") is True
    # No respondent_token was minted / stored
    assert "respondent_token" not in j or not j.get("respondent_token")
    a1 = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    assert a1["respondent_count"] == n0


def test_respond_requires_participation_consent(api):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    body = _minimal_submit_body(pub["states"])
    body["consent"]["participation"] = False
    r = api.post(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/respond", json=body)
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# Small-sample honesty
# ---------------------------------------------------------------------------
def test_new_study_hides_route_shares_until_thirty(api, auth):
    study = _create_study(auth, title="TEST_journey_smallsample", target_responses=200)
    sid = study["id"]
    # Publish (set status to collecting) via lock-instrument
    lock = auth.post(f"{BASE_URL}/api/journey/studies/{sid}/lock-instrument", json={})
    assert lock.status_code in (200, 201), lock.text[:300]
    # Fetch share token
    st = auth.get(f"{BASE_URL}/api/journey/studies/{sid}").json()
    share = st.get("share_token")
    assert share, st
    try:
        pub = api.get(f"{BASE_URL}/api/journey/public/{share}").json()
        # Submit 5 responses (well under 30)
        for i in range(5):
            b = _minimal_submit_body(pub["states"])
            b["quality"]["duration_sec"] = 180 + i
            rr = api.post(f"{BASE_URL}/api/journey/public/{share}/respond", json=b)
            assert rr.status_code == 200, rr.text[:200]
        a = auth.get(f"{BASE_URL}/api/journey/studies/{sid}/analysis").json()
        assert a["respondent_count"] == 5
        res = a["results"]
        assert res["routes"]["shares_hidden"] is True
        assert all(r.get("share") is None for r in res["routes"]["top"])
        assert "routes" not in res["gates"]["unlocked"]
    finally:
        auth.delete(f"{BASE_URL}/api/journey/studies/{sid}/purge")
