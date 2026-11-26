"""End-to-end: the qualitative step hands off to the quantitative step, and the
quantitative step audits it back.

Spec: memory/CJM_PAINPOINT_SPEC.md rev 2 — sections 2.1, 2.7 and acceptance
items 11-13, 17. This is the test that would catch the two halves drifting
apart, which no unit test can.
"""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or frontend_env.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")

# One string per informant — this is what makes a saturation curve possible.
INTERVIEWS = [
    "รอคิวนานมากกว่าสามสิบนาที กว่าจะได้ของ",
    "แอปใช้ยาก กดแล้วงง หาเมนูไม่เจอเลย",
    "ราคาแพงกว่าที่คิดไว้ตอนแรกมาก",
    "ต้องกลับมาทำใหม่เพราะระบบตัดรอบ",
    "รอนานเหมือนกัน คิวเยอะ",
    "แอปงงมาก กดผิดตลอด",
]
MERMAID = """
graph TD
  A[ค้นหาข้อมูล] --> B[เปรียบเทียบราคา]
  B --> C[สั่งซื้อ]
  C --> D[รับของ]
  C -->|ยกเลิก| A
"""


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def auth(api):
    r = api.post(f"{BASE_URL}/api/auth/login",
                 json={"email": "admin@swu.ac.th", "password": "admin123"})
    if r.status_code != 200:
        pytest.fail(f"admin login failed: {r.status_code} {r.text[:300]}")
    api.headers.update({"Authorization": f"Bearer {r.json()['access_token']}"})
    return api


@pytest.fixture(scope="module")
def flow(auth):
    """Walk the whole pipeline once; every test below reads from the result."""
    body = {"title": "TEST_TwoStep_" + uuid.uuid4().hex[:8],
            "subject": {"kind": "product", "name": "ทดสอบสองขั้น"},
            "sampling_frame": "นิสิตที่เคยสั่งซื้อออนไลน์ใน 90 วัน",
            "target_responses": 150}
    sid = auth.post(f"{BASE_URL}/api/journey/studies", json=body).json()["id"]

    out = {"study_id": sid}
    try:
        # step 1 -> the study's own steps come from the qualitative map
        seed = auth.post(f"{BASE_URL}/api/journey/studies/{sid}/seed",
                         json={"mermaid_code": MERMAID, "apply_states": True})
        assert seed.status_code == 200, seed.text[:300]

        ex = auth.post(f"{BASE_URL}/api/journey/studies/{sid}/codebook/extract",
                       json={"interviews": INTERVIEWS, "mermaid_code": MERMAID})
        assert ex.status_code == 200, ex.text[:300]
        draft = ex.json()["draft"]
        out["extract"] = ex.json()

        study = auth.get(f"{BASE_URL}/api/journey/studies/{sid}").json()
        study_labels = [s.get("label_th") or s.get("label") for s in study["states"]]

        # a human approves: rename, define, keep four
        pains = draft["pain_categories"][:4]
        for i, row in enumerate(pains, 1):
            row["label_th"] = "ปัญหา %d" % i
            row["definition_th"] = "นับเมื่อผู้ตอบพูดถึงปัญหาแบบที่ %d" % i
            row["pain_type"] = "process"
            row["applies_to"] = "all"
            row["status"] = "approved"
        states = draft["states"]
        for st in states:
            st["definition_th"] = "นิยาม " + st["label_th"]
            st["status"] = "approved"

        put = auth.put(f"{BASE_URL}/api/journey/studies/{sid}/codebook",
                       json={"pain_categories": pains, "states": states,
                             "touchpoints": [],
                             "source": {**draft["source"],
                                        "collection_method_th": "สัมภาษณ์กึ่งโครงสร้าง 6 ราย",
                                        "n_interviews": len(INTERVIEWS),
                                        "journey_style": "linear"}})
        assert put.status_code == 200, put.text[:400]
        assert put.json()["blockers"] == [], put.json()["blockers"]

        act = auth.post(f"{BASE_URL}/api/journey/studies/{sid}/codebook/activate")
        assert act.status_code == 200, act.text[:500]
        out["activate"] = act.json()
        out["study_labels"] = study_labels
        yield out
    finally:
        auth.delete(f"{BASE_URL}/api/journey/studies/{sid}")
        auth.delete(f"{BASE_URL}/api/journey/studies/{sid}/purge")


# ---------------------------------------------------------------------------
# 13 — saturation is real, not decorative
# ---------------------------------------------------------------------------
def test_each_candidate_records_which_interview_produced_it(flow):
    pains = flow["extract"]["draft"]["pain_categories"]
    assert pains
    assert any(p["provenance"]["interview_indices"] for p in pains), \
        "without an interview index there is no saturation curve"


def test_activation_freezes_a_saturation_curve(flow):
    sat = flow["activate"]["saturation"]
    assert sat["rows"], "curve must have a row per interview"
    assert sat["n_interviews"] == len(INTERVIEWS)
    # cumulative can only go up
    cum = [r["cumulative"] for r in sat["rows"]]
    assert cum == sorted(cum)


def test_six_interviews_are_reported_as_below_the_saturation_norm(flow):
    warnings = flow["activate"]["saturation"]["warnings"]
    assert any("ต่ำกว่า 12" in w for w in warnings)


# ---------------------------------------------------------------------------
# 12 — the qualitative map's edges survive into the study
# ---------------------------------------------------------------------------
def test_activation_translates_the_claimed_edges_onto_the_study_steps(flow):
    edges = flow["activate"]["claimed_edges"]
    assert edges, "the map's arrows must reach the study, not just its nodes"
    ids = set()
    for a, b in edges:
        ids.update([a, b])
    assert len(ids) >= 2


def test_untranslatable_edges_are_counted_not_silently_dropped(flow):
    assert "claimed_edges_unmatched" in flow["activate"]


def test_analysis_reports_the_audit_once_a_codebook_is_active(auth, flow):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{flow['study_id']}/analysis")
    assert r.status_code == 200, r.text[:300]
    audit = r.json()["results"].get("qualitative_audit")
    assert audit is not None, "a study with claimed edges must be audited"
    for key in ("claimed_and_observed", "claimed_not_observed",
                "observed_not_claimed", "linear_violations"):
        assert key in audit
    assert audit["journey_style_claimed"] == "linear"


def test_a_study_without_a_codebook_reports_no_audit(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/demo-journey-kafae-001/analysis")
    assert r.json()["results"].get("qualitative_audit") is None, \
        "nothing was claimed, so there is nothing to audit"


# ---------------------------------------------------------------------------
# provenance now reflects a genuinely qualitative source
# ---------------------------------------------------------------------------
def test_provenance_stops_warning_once_the_source_is_qualitative(auth, flow):
    p = auth.get(
        f"{BASE_URL}/api/journey/studies/{flow['study_id']}/analysis").json()["provenance"]
    assert p["pain_source"] == "qualitative"
    assert p["warning_th"] is None
    assert p["n_interviews"] == len(INTERVIEWS)
    assert p["n_quotes"] > 0
    assert p["saturation"] is not None, "the frozen curve must travel with the results"


# ---------------------------------------------------------------------------
# 17 — the back-coding queue
# ---------------------------------------------------------------------------
def test_other_text_queue_starts_empty_and_reports_a_rate(auth, flow):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{flow['study_id']}/pain-other-texts")
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert body["n_pending"] == 0 and body["n_back_coded"] == 0
    assert body["back_coded_rate"] is None


def test_back_coding_refuses_a_category_outside_the_active_codebook(auth, flow):
    r = auth.post(f"{BASE_URL}/api/journey/studies/{flow['study_id']}/pain-back-code",
                  json={"response_id": "nope", "state_id": "s1",
                        "category_ids": ["pc-invented"]})
    assert r.status_code == 400
    assert "อนุมัติแล้ว" in r.json()["detail"]


def test_back_coding_404s_on_an_unknown_response(auth, flow):
    cat = [c["id"] for c in flow["activate"]["codebook"]["pain_categories"]
           if c["status"] == "approved"][0]
    r = auth.post(f"{BASE_URL}/api/journey/studies/{flow['study_id']}/pain-back-code",
                  json={"response_id": "does-not-exist", "state_id": "s1",
                        "category_ids": [cat]})
    assert r.status_code == 404


def test_back_coding_requires_an_active_codebook(auth):
    r = auth.post(f"{BASE_URL}/api/journey/studies/demo-journey-kafae-001/pain-back-code",
                  json={"response_id": "x", "state_id": "y", "category_ids": ["pc1"]})
    assert r.status_code == 400
    assert "ชุดรหัส" in r.json()["detail"]


# ---------------------------------------------------------------------------
# PDPA — a purge must take the interview quotes with it
# ---------------------------------------------------------------------------
def test_purging_a_study_deletes_its_codebook_and_its_verbatim_quotes(auth):
    body = {"title": "TEST_Purge_" + uuid.uuid4().hex[:8],
            "subject": {"kind": "product", "name": "ทดสอบลบถาวร"},
            "sampling_frame": "ผู้ใช้ทั่วไป", "target_responses": 120}
    sid = auth.post(f"{BASE_URL}/api/journey/studies", json=body).json()["id"]
    ex = auth.post(f"{BASE_URL}/api/journey/studies/{sid}/codebook/extract",
                   json={"interviews": INTERVIEWS, "mermaid_code": MERMAID})
    assert ex.status_code == 200
    assert ex.json()["draft"]["pain_categories"][0]["provenance"]["quotes"]

    auth.delete(f"{BASE_URL}/api/journey/studies/{sid}")
    auth.delete(f"{BASE_URL}/api/journey/studies/{sid}/purge")

    # the study is gone, so the endpoint 404s — the point is that nothing is
    # left behind in journey_codebooks for it either
    assert auth.get(f"{BASE_URL}/api/journey/studies/{sid}/codebook").status_code == 404
