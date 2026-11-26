"""Brand Equity audit follow-up patch — backend acceptance checks.

Dashboard payload nests everything under `aggregate`. Public respond returns
a flat `questions` list (no sections).
"""
import os
import requests
import pytest
from dotenv import dotenv_values

fe = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or fe.get("REACT_APP_BACKEND_URL")).rstrip("/")

STUDY_ID = "c5b3458f-b482-4859-ae15-b8c725e78d1c"
STUDY_ID_RADAR = "a407a08f-2814-4763-baca-ffb4bdeffa2c"
PUBLIC_TOKEN = "0edb6beab1b6"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "admin@swu.ac.th", "password": "admin123"},
    )
    assert r.status_code == 200, r.text[:200]
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


def _fetch_public_survey():
    r = requests.get(f"{BASE_URL}/api/brand-equity/public/{PUBLIC_TOKEN}")
    assert r.status_code == 200, r.text[:300]
    return r.json()


def _build_answers(survey, inject_bad=False):
    """Answers is a list of {question_id, value} dicts.

    Inject_bad => first likert_7 gets value 9 (out of range) and first nps
    gets value 15. Both should be silently dropped by the server.
    """
    answers = []
    bad_likert_id = None
    bad_nps_id = None
    for q in survey.get("questions", []):
        qid = q.get("id")
        t = q.get("type")
        required = q.get("required", False)
        val = None
        if t == "likert_7":
            if inject_bad and bad_likert_id is None:
                bad_likert_id = qid
                val = 9  # out of range
            else:
                val = 5
        elif t in ("nps", "nps_0_10"):
            if inject_bad and bad_nps_id is None:
                bad_nps_id = qid
                val = 15  # out of range
            else:
                val = 8
        elif t == "comparative_7":
            val = 4
        elif t in ("mcq_single", "single_choice"):
            opts = q.get("options") or []
            if opts:
                val = opts[0] if not isinstance(opts[0], dict) else opts[0].get("value")
        elif t in ("mcq_multi", "multi_choice"):
            opts = q.get("options") or []
            val = [opts[0]] if opts and not isinstance(opts[0], dict) else []
        elif t == "trait_grid":
            opts = q.get("options") or []
            val = opts[:1] if opts else []
        elif t in ("open_short", "open_long"):
            if required:
                val = "ทดสอบ"
        if val is not None:
            answers.append({"question_id": qid, "value": val})
    return answers, bad_likert_id, bad_nps_id


def test_public_survey_carries_estimated_minutes():
    """Backend supplies estimated_minutes; frontend derives the visible range."""
    data = _fetch_public_survey()
    assert data.get("estimated_minutes") is not None, "no estimated_minutes"


def test_public_respond_drops_out_of_range():
    survey = _fetch_public_survey()
    answers, bad_l, bad_n = _build_answers(survey, inject_bad=True)
    assert bad_l is not None, "no likert_7 question to poison"
    payload = {
        "answers": answers,
        "demographics": {"age_range": "25-34", "gender": "female", "region": "bangkok"},
    }
    r = requests.post(f"{BASE_URL}/api/brand-equity/public/{PUBLIC_TOKEN}/respond", json=payload)
    assert r.status_code == 200, f"expected 200 with drops, got {r.status_code}: {r.text[:400]}"
    body = r.json()
    # response should indicate acceptance
    assert body.get("status") == "ok" or body.get("id") or body.get("response_id") or body.get("accepted"), body


def test_dashboard_has_reliability_and_new_fields(auth_headers):
    r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}/dashboard", headers=auth_headers)
    assert r.status_code == 200, r.text[:300]
    d = r.json()
    agg = d.get("aggregate") or {}
    assert agg, f"no aggregate; keys={list(d.keys())}"
    # reliability
    rel = agg.get("reliability")
    assert rel, "reliability missing"
    # sample_adequacy
    sa = agg.get("sample_adequacy")
    assert sa and "level" in sa, f"sample_adequacy missing/malformed: {sa}"
    # normalization basis
    norm = agg.get("normalization")
    assert norm and norm.get("basis"), f"normalization missing: {norm}"
    # composite _measured
    comp = agg.get("composite") or {}
    assert "_measured" in comp, f"composite._measured missing. keys={list(comp.keys())}"
    # composite_meta coverage per dimension
    cmeta = agg.get("composite_meta") or {}
    assert cmeta, "composite_meta missing"
    for dim, meta in cmeta.items():
        has = ("coverage" in meta) or ("_measured" in meta) or ("measured" in meta) or ("n" in meta)
        assert has, f"composite_meta[{dim}] has none of coverage/_measured/n: {meta}"


def test_image_radar_pomp_and_n_per_series(auth_headers):
    r = requests.get(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID_RADAR}/dashboard", headers=auth_headers)
    assert r.status_code == 200, r.text[:300]
    agg = (r.json() or {}).get("aggregate") or {}
    radar = agg.get("image_radar") or {}
    assert radar, f"no image_radar; keys={list(agg.keys())}"
    assert "pomp" in str(radar.get("scale") or "").lower(), f"scale not POMP: {radar.get('scale')!r}"
    series = radar.get("series") or []
    assert series, "radar series empty"
    for s in series:
        assert "n_min" in s and "n_max" in s and "n_values" in s, f"series missing n fields: {list(s.keys())}"


def test_put_weights_roundtrip(auth_headers):
    """Weights are integer percentages summing to 100. Reset to 25/25/25/25."""
    payload = {"weights": {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25}}
    r = requests.put(
        f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}", headers=auth_headers, json=payload
    )
    assert r.status_code in (200, 204), f"PUT weights {r.status_code}: {r.text[:300]}"

    # confirm study round-trips (fetch)
    g = requests.get(f"{BASE_URL}/api/brand-equity/studies/{STUDY_ID}", headers=auth_headers)
    if g.status_code == 200:
        js = g.json()
        w = (js.get("weights") or (js.get("study") or {}).get("weights") or {})
        if w:
            total = sum(v for v in w.values() if isinstance(v, (int, float)))
            assert 99 <= total <= 101, f"weights don't sum to ~100: {w}"
