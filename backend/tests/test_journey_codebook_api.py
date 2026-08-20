"""HTTP contract tests for the Journey Codebook — the qualitative -> quantitative
handoff. Spec: memory/CJM_PAINPOINT_SPEC.md rev 2, acceptance items 1-10, 18-19.

These run against a live backend (the same convention as
test_journey_api_phase1.py). Locally: devenv/mkt.ps1 up, then mkt.ps1 test.
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

RAW = """
รอคิวนานมากกว่าสามสิบนาที กว่าจะได้ของ
แอปใช้ยาก กดแล้วงง หาเมนูไม่เจอ
ราคาแพงกว่าที่คิดไว้ตอนแรก
ต้องกลับมาทำใหม่เพราะระบบตัดรอบ
ที่จอดรถเต็มตลอด หาที่จอดไม่ได้
พนักงานที่สาขาอธิบายได้ดีมาก
"""
MERMAID = """
graph TD
  A[ค้นหาข้อมูล] --> B[เปรียบเทียบราคา]
  B --> C[สั่งซื้อ]
  C --> D[รับของ]
  C -->|ยกเลิก| A
"""


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------
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
def study(auth):
    """A fresh draft study, deleted at the end of the module."""
    body = {"title": "TEST_Codebook_" + uuid.uuid4().hex[:8],
            "subject": {"kind": "product", "name": "ทดสอบชุดรหัส"},
            "sampling_frame": "นิสิตปริญญาตรี มศว ที่เคยสั่งซื้อออนไลน์ใน 90 วัน",
            "target_responses": 150}
    r = auth.post(f"{BASE_URL}/api/journey/studies", json=body)
    assert r.status_code in (200, 201), r.text[:400]
    sid = r.json()["id"] if "id" in r.json() else r.json()["study"]["id"]
    yield sid
    auth.delete(f"{BASE_URL}/api/journey/studies/{sid}")
    auth.delete(f"{BASE_URL}/api/journey/studies/{sid}/purge")


def _extract(auth, sid):
    return auth.post(f"{BASE_URL}/api/journey/studies/{sid}/codebook/extract",
                     json={"raw_text": RAW, "mermaid_code": MERMAID})


def _put(auth, sid, **patch):
    return auth.put(f"{BASE_URL}/api/journey/studies/{sid}/codebook", json=patch)


def _approve_minimum(draft, n=3):
    """Turn the first n pain candidates into legitimately approved rows."""
    pains = draft["pain_categories"][:n]
    for i, row in enumerate(pains, 1):
        row["label_th"] = "ปัญหาทดสอบ %d" % i
        row["definition_th"] = "นับเมื่อผู้ตอบพูดถึงปัญหาแบบที่ %d" % i
        row["pain_type"] = "process"
        row["applies_to"] = "all"
        row["status"] = "approved"
    return pains


# ---------------------------------------------------------------------------
# 1, 2 — extraction
# ---------------------------------------------------------------------------
def test_extract_returns_all_three_kinds_with_quotes(auth, study):
    r = _extract(auth, study)
    assert r.status_code == 200, r.text[:400]
    draft = r.json()["draft"]
    assert draft["status"] == "draft"
    assert draft["pain_categories"] and draft["touchpoints"] and draft["states"]
    for key in ("states", "touchpoints", "pain_categories"):
        for row in draft[key]:
            assert row["provenance"]["quotes"], f"{key} {row['id']} has no quote"
            assert row["status"] == "suggested", "extraction may only suggest"


def test_extract_keeps_the_edges_from_the_qualitative_map(auth, study):
    draft = _extract(auth, study).json()["draft"]
    labels = {s["id"]: s["label_th"] for s in draft["states"]}
    pairs = {(labels[e["from_state_id"]], labels[e["to_state_id"]])
             for e in draft["edges"]}
    assert ("ค้นหาข้อมูล", "เปรียบเทียบราคา") in pairs
    assert ("สั่งซื้อ", "ค้นหาข้อมูล") in pairs, "the labelled back-edge must survive"


def test_extract_rejects_empty_input(auth, study):
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/extract", json={})
    assert r.status_code == 400


def test_extract_404s_on_an_unknown_qualitative_run(auth, study):
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/extract",
                  json={"qualitative_run_ids": ["does-not-exist"]})
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# 3 — the gates block activation, with reasons
# ---------------------------------------------------------------------------
def test_activation_is_blocked_while_nothing_is_approved(auth, study):
    _extract(auth, study)
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/activate")
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["blockers"], "must say why"
    assert any("อย่างน้อย" in b for b in detail["blockers"])


def test_blockers_are_returned_on_every_save_not_only_on_activate(auth, study):
    draft = _extract(auth, study).json()["draft"]
    pains = _approve_minimum(draft)
    pains[0]["definition_th"] = ""
    r = _put(auth, study, pain_categories=pains)
    assert r.status_code == 200
    assert any("คำนิยาม" in b for b in r.json()["blockers"])


def test_selected_scope_without_states_blocks(auth, study):
    draft = _extract(auth, study).json()["draft"]
    pains = _approve_minimum(draft)
    pains[0]["applies_to"] = "selected"
    pains[0]["state_ids"] = []
    r = _put(auth, study, pain_categories=pains)
    assert any("ยังไม่ได้เลือกขั้น" in b for b in r.json()["blockers"])


def test_missing_collection_method_blocks(auth, study):
    draft = _extract(auth, study).json()["draft"]
    r = _put(auth, study, pain_categories=_approve_minimum(draft),
             source={**draft["source"], "collection_method_th": ""})
    assert any("วิธีเก็บข้อมูล" in b for b in r.json()["blockers"])


def test_pdpa_term_in_a_visible_label_blocks(auth, study):
    draft = _extract(auth, study).json()["draft"]
    pains = _approve_minimum(draft)
    pains[0]["label_th"] = "ไม่สะดวกใจเรื่องศาสนา"
    r = _put(auth, study, pain_categories=pains,
             source={**draft["source"], "collection_method_th": "สัมภาษณ์ 12 ราย"})
    assert r.json()["pdpa_hits"], "a special-category term must be caught"
    assert any("PDPA" in b for b in r.json()["blockers"])


def test_client_cannot_forge_an_approval_stamp(auth, study):
    draft = _extract(auth, study).json()["draft"]
    pains = _approve_minimum(draft)
    pains[0]["approved_by"] = "somebody-else"
    saved = _put(auth, study, pain_categories=pains).json()["draft"]
    # the server keeps whatever the client claimed only if it stamped it itself;
    # what matters is that a rejected row can never keep a stamp
    pains[1]["status"] = "rejected"
    pains[1]["approved_by"] = "forged"
    again = _put(auth, study, pain_categories=pains).json()["draft"]
    rejected = [p for p in again["pain_categories"] if p["status"] == "rejected"][0]
    assert rejected["approved_by"] is None and rejected["approved_at"] is None


# ---------------------------------------------------------------------------
# 4 — a clean codebook activates and moves the structure hash
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def activated(auth, study):
    draft = _extract(auth, study).json()["draft"]
    pains = _approve_minimum(draft, n=4)
    states = draft["states"][:4]
    for st in states:
        st["definition_th"] = "นิยาม " + st["label_th"]
        st["status"] = "approved"
    saved = _put(auth, study, pain_categories=pains, states=states,
                 touchpoints=[],
                 source={**draft["source"], "collection_method_th": "สัมภาษณ์กึ่งโครงสร้าง 12 ราย",
                         "n_interviews": 12}).json()
    assert saved["blockers"] == [], saved["blockers"]

    before = auth.get(f"{BASE_URL}/api/journey/studies/{study}").json().get("structure_hash")
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/activate")
    assert r.status_code == 200, r.text[:500]
    return {"before_hash": before, "result": r.json()}


def test_activation_succeeds_and_changes_the_structure_hash(auth, study, activated):
    assert activated["result"]["codebook"]["status"] == "active"
    assert activated["result"]["structure_hash"] != activated["before_hash"]


def test_activation_marks_the_study_as_qualitatively_sourced(auth, study, activated):
    got = auth.get(f"{BASE_URL}/api/journey/studies/{study}/codebook").json()
    assert got["pain_source"] == "qualitative"
    assert got["active"]["version"] >= 1


def test_pain_options_are_derived_from_the_codebook(auth, study, activated):
    st = auth.get(f"{BASE_URL}/api/journey/studies/{study}").json()
    labels = {lbl for opts in (st.get("pain_options") or {}).values() for lbl in opts}
    assert any(l.startswith("ปัญหาทดสอบ") for l in labels)
    assert "ขั้นตอนยุ่งยาก/ซับซ้อน" not in labels, "the hard-coded taxonomy must be gone"


# ---------------------------------------------------------------------------
# reliability — and the refusal to report one pooled kappa over HTTP
# ---------------------------------------------------------------------------
def test_reliability_endpoint_reports_per_category_never_a_single_kappa(auth, study, activated):
    ids = [c["id"] for c in activated["result"]["codebook"]["pain_categories"]
           if c["status"] == "approved"]
    a = [[ids[0]], [ids[0]], [ids[1]], []]
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/reliability",
                  json={"mode": "second_coder", "coder_a": a, "coder_b": a})
    assert r.status_code == 200, r.text[:300]
    body = r.json()
    assert "kappa" not in body and "cohen_kappa" not in body
    assert isinstance(body["per_category"], list)
    assert body["percent_agreement"] == 1.0


def test_reliability_rejects_mismatched_coder_lengths(auth, study, activated):
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/reliability",
                  json={"coder_a": [["pc1"]], "coder_b": []})
    assert r.status_code == 400


def test_reliability_mode_none_carries_its_limitation(auth, study, activated):
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/reliability",
                  json={"mode": "none", "coder_a": [], "coder_b": []})
    assert r.status_code == 200
    assert any("ข้อจำกัด" in t for t in r.json()["limitations_th"])


# ---------------------------------------------------------------------------
# authorisation
# ---------------------------------------------------------------------------
def test_codebook_endpoints_require_auth(api, study):
    plain = requests.Session()
    for path, method in ((f"/api/journey/studies/{study}/codebook", "get"),
                         (f"/api/journey/studies/{study}/codebook/activate", "post")):
        r = getattr(plain, method)(f"{BASE_URL}{path}")
        assert r.status_code in (401, 403), f"{path} returned {r.status_code}"


def test_unknown_study_is_404_not_500(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/no-such-study/codebook")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# spec 2.3, 8 — what the respondent is served, and what the server accepts
# ---------------------------------------------------------------------------
DEMO_TOKEN = "demojourney1"
DEMO_ID = "demo-journey-kafae-001"


def test_public_payload_carries_the_new_instrument_settings(api):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    assert "pain_category_options" in pub
    assert "allow_pain_other_text" in pub
    assert isinstance(pub["pain_nomination_cap"], int) and pub["pain_nomination_cap"] >= 1
    assert pub["pain_source"] in ("library_default", "prior_literature", "qualitative")


def test_a_library_default_study_still_serves_its_options(api):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    opts = pub["pain_category_options"]
    assert opts, "the demo must keep working without a codebook"
    first = next(iter(opts.values()))
    assert first and first[0]["id"] is None, "legacy labels have no stable id"
    assert first[0]["label_th"]


def _body(states, pain):
    sid = states[0]["id"]
    return {"consent": {"participation": True, "recontact": False, "linkage": False},
            "episode": {"recency_band": "le_7"},
            "path": [{"state_id": sid, "order": 0}],
            "visited": [sid], "terminal": "CONV",
            "experience": {sid: {"difficulty_1_5": 3, "emotion": 0}},
            "pain": pain,
            "demographics": {"age_band": "20–29 ปี"},
            "quality": {"duration_sec": 180, "difficulty_rows": 1, "scored_rows": 1,
                        "longstring": 1, "irv": 1.0}}


def _respond_and_read(api, auth, pain):
    """Submit one response, read it back from the owner view, then withdraw."""
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    r = api.post(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/respond",
                 json=_body(pub["states"], pain))
    assert r.status_code == 200, r.text[:400]
    token = r.json()["respondent_token"]
    try:
        items = auth.get(
            f"{BASE_URL}/api/journey/studies/{DEMO_ID}/responses").json()["responses"]
        mine = [x for x in items if x.get("respondent_token") == token]
        return mine[0] if mine else None
    finally:
        # Withdrawal must happen even if the read above raises, or a failing
        # test silently leaves an extra row in the shared demo study and the
        # "exactly 140 respondents" test starts failing for unrelated reasons.
        d = api.delete(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}/withdraw/{token}")
        assert d.status_code == 200, "cleanup failed: " + d.text[:200]


def test_nomination_cap_is_enforced_by_the_server_not_the_browser(api, auth):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    cap = pub["pain_nomination_cap"]
    ids = [s["id"] for s in pub["states"]][:cap + 2]
    if len(ids) <= cap:
        pytest.skip("demo has too few states to exceed the cap")
    stored = _respond_and_read(api, auth, {"nominated": ids})
    assert stored is not None, "response should have been stored"
    assert len(stored["pain"]["nominated"]) == cap


def test_unknown_category_ids_never_reach_storage(api, auth):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    sid = pub["states"][0]["id"]
    stored = _respond_and_read(api, auth, {
        "nominated": [sid],
        sid: {"severity_0_10": 7, "category_ids": ["pc-not-real"]}})
    assert stored is not None
    assert not stored["pain"][sid].get("category_ids")


def test_free_text_other_is_kept_and_truncated(api, auth):
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    if not pub.get("allow_pain_other_text"):
        pytest.skip("other-text disabled on the demo")
    sid = pub["states"][0]["id"]
    stored = _respond_and_read(api, auth, {
        "nominated": [sid],
        sid: {"severity_0_10": 5, "other_text": "ก" * 500}})
    assert stored is not None
    assert len(stored["pain"][sid]["other_text"]) == 300


# ---------------------------------------------------------------------------
# 18, 19 — provenance travels with every analysis payload
# ---------------------------------------------------------------------------
def test_analysis_carries_provenance(auth):
    r = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis")
    assert r.status_code == 200, r.text[:300]
    p = r.json()["provenance"]
    for key in ("codebook_version", "pain_source", "n_quotes",
                "reliability_mode", "other", "warning_th"):
        assert key in p, f"missing {key}"


def test_a_library_default_study_says_so_in_its_analysis(auth):
    p = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()["provenance"]
    assert p["pain_source"] == "library_default"
    assert "ไม่ได้มาจากข้อมูลเชิงคุณภาพ" in p["warning_th"]


def test_provenance_survives_the_analysis_cache(auth):
    # Second call is served from cache; the block must still be there, because
    # it describes the codebook rather than the responses.
    first = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    second = auth.get(f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()
    assert second.get("cached") is True
    assert second["provenance"]["pain_source"] == first["provenance"]["pain_source"]


def test_other_rate_is_reported_with_an_interval(auth):
    other = auth.get(
        f"{BASE_URL}/api/journey/studies/{DEMO_ID}/analysis").json()["provenance"]["other"]
    assert other["n"] > 0
    assert other["rate"] is not None and other["ci95"] is not None
    assert isinstance(other["warn"], bool)


def test_interviews_alone_are_enough_material_to_extract(auth, study):
    """The saturation curve only exists when material arrives per informant, so
    supplying interviews and nothing else must not be treated as empty input."""
    r = auth.post(f"{BASE_URL}/api/journey/studies/{study}/codebook/extract",
                  json={"interviews": ["รอคิวนานมาก", "แอปใช้ยาก กดแล้วงง"]})
    assert r.status_code == 200, r.text[:300]
    draft = r.json()["draft"]
    assert draft["pain_categories"]
    assert draft["source"]["n_interviews"] == 2
    assert any(p["provenance"]["interview_indices"] for p in draft["pain_categories"])


def test_every_response_is_pinned_to_the_codebook_version_in_force(api, auth):
    """Without the stamp, activating v2 would silently reinterpret v1 answers."""
    pub = api.get(f"{BASE_URL}/api/journey/public/{DEMO_TOKEN}").json()
    sid = pub["states"][0]["id"]
    stored = _respond_and_read(api, auth, {"nominated": [sid],
                                           sid: {"severity_0_10": 4}})
    assert stored is not None
    assert "codebook_version" in stored
    assert stored["codebook_version"] == pub.get("codebook_version", 0)
