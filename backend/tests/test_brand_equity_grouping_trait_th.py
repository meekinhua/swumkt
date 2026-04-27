"""
Iteration 15 — Brand Equity tool regression tests for:
  1) Uncapped competitors (was top-2, now unlimited)
  2) Question grouping: same comparison_group/axis_label contiguous, brand-first then competitors in user order
  3) trait_grid options_th (DEFAULT_TRAIT_POOL_TH, PERSONALITY_TRAIT_POOL_TH) parallel to options
  4) regenerate-questions produces new schema with comparison_group + options_th
  5) End-to-end: public respond submit still works
"""
import os
import time
import requests
import pytest

def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if url:
        return url.rstrip("/")
    # Fallback: read frontend/.env
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    return ""


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@swu.ac.th"
ADMIN_PASSWORD = "admin123"
SEED_STUDY_ID = "0a0a1f3b-54f9-4d06-addb-10a4c620d187"


# --------- Fixtures ---------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def study_4comp(auth_headers):
    """Create a study with 4 competitors + 1 custom attribute. Yield (id, questions).
    Auto-clean after module."""
    payload = {
        "brand": {
            "name": "TEST_GROUP_BRAND",
            "category": "กาแฟ",
            "competitors": ["Alpha", "Bravo", "Charlie", "Delta"],
            "custom_quality_attributes": ["น่าเชื่อถือ"],
            "custom_quality_attributes_en": ["trustworthy"],
        },
        "identity": {
            "traits": [],
            "description": "brand used for regression test",
            "visual_assets": [],
            "pricing_tier": "mid",
        },
        "segments_to_capture": ["age", "gender"],
        "target_responses": 50,
    }
    r = requests.post(f"{API}/brand-equity/studies", headers=auth_headers, json=payload, timeout=30)
    assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
    study = r.json()
    sid = study["id"]
    yield sid, study.get("questions") or []
    # Teardown
    try:
        requests.delete(f"{API}/brand-equity/studies/{sid}", headers=auth_headers, timeout=10)
    except Exception:
        pass


# --------- Helpers ---------

def _by_template(questions, tmpl_id):
    return [q for q in questions if q.get("template_id") == tmpl_id]


# --------- Tests ---------

# Feature 1: uncapped competitors — each COMP-1..COMP-5 emitted per competitor

class TestUncappedCompetitors:
    def test_each_comp_template_has_one_q_per_competitor(self, study_4comp):
        _, qs = study_4comp
        for tmpl in ["COMP-1", "COMP-2", "COMP-3", "COMP-4", "COMP-5"]:
            comp_qs = _by_template(qs, tmpl)
            assert len(comp_qs) == 4, f"{tmpl} expected 4 competitor rows, got {len(comp_qs)}: {[q.get('compare_brand') for q in comp_qs]}"
            brands = sorted(q.get("compare_brand") for q in comp_qs)
            assert brands == ["Alpha", "Bravo", "Charlie", "Delta"], f"{tmpl} unexpected compare_brand: {brands}"

    def test_custom_attr_creates_us_plus_4_competitor_questions(self, study_4comp):
        _, qs = study_4comp
        us = [q for q in qs if q.get("template_id", "").startswith("PQ-CUSTOM-")]
        comp = [q for q in qs if q.get("template_id", "").startswith("COMP-CUSTOM-")]
        assert len(us) == 1, f"expected 1 us-custom, got {len(us)}"
        assert len(comp) == 4, f"expected 4 competitor-custom, got {len(comp)}"
        # Both share axis_label = 'น่าเชื่อถือ'
        all_custom = us + comp
        axes = {q.get("axis_label") for q in all_custom}
        assert axes == {"น่าเชื่อถือ"}, f"axis_label mismatch: {axes}"

    def test_total_question_count_reasonable(self, study_4comp):
        _, qs = study_4comp
        # With 4 competitors + 1 custom: roughly >= 30 (focal templates) + 5 COMP*4 - but many focal are single
        assert len(qs) >= 35, f"too few questions: {len(qs)}"


# Feature 2: comparison_group

class TestComparisonGroup:
    def test_axis_tagged_questions_have_comparison_group_equal_to_axis(self, study_4comp):
        _, qs = study_4comp
        missing = []
        for q in qs:
            axis = q.get("axis_label")
            if not axis:
                continue
            cg = q.get("comparison_group")
            if cg != axis:
                missing.append((q.get("template_id"), axis, cg))
        assert not missing, f"comparison_group mismatch: {missing[:5]}"

    def test_axes_are_shared_between_us_and_competitor_versions(self, study_4comp):
        _, qs = study_4comp
        # High-quality: ASD-1 (us) + COMP-1 (each competitor) — all share group
        hq = [q for q in qs if q.get("comparison_group") == "High-quality"]
        tmpls = sorted({q.get("template_id") for q in hq})
        assert "ASD-1" in tmpls and "COMP-1" in tmpls, f"High-quality group missing templates: {tmpls}"
        # Should be 1 (ASD-1) + 4 (COMP-1 per competitor) = 5
        assert len(hq) == 5, f"High-quality group size expected 5, got {len(hq)}"
        # Trustworthy (ASO-2 + COMP-4): should also be 5
        tw = [q for q in qs if q.get("comparison_group") == "Trustworthy"]
        tw_tmpls = sorted({q.get("template_id") for q in tw})
        assert "ASO-2" in tw_tmpls and "COMP-4" in tw_tmpls, f"Trustworthy templates: {tw_tmpls}"
        assert len(tw) == 5, f"Trustworthy group size expected 5, got {len(tw)}"


# Feature 3: grouping / ordering — contiguous, brand first, competitors in input order

class TestGroupingOrder:
    def test_group_members_are_contiguous_brand_first_then_comp_order(self, study_4comp):
        _, qs = study_4comp
        comp_order = ["Alpha", "Bravo", "Charlie", "Delta"]
        # For each axis-tagged comparison_group, collect the indices; they must be consecutive
        groups: dict = {}
        for idx, q in enumerate(qs):
            if not q.get("axis_label"):
                continue
            groups.setdefault(q.get("comparison_group"), []).append((idx, q))
        assert groups, "no grouped questions found"
        for cg, items in groups.items():
            idxs = [i for i, _ in items]
            assert idxs == sorted(idxs), f"group {cg} indices not sorted: {idxs}"
            # Contiguous (no gap)
            assert idxs[-1] - idxs[0] == len(idxs) - 1, f"group {cg} not contiguous (idxs={idxs})"
            # Brand-first ordering
            seq = [q for _, q in items]
            # First entry should be "us" (no compare_brand) — assuming us version exists
            us_entries = [q for q in seq if not q.get("compare_brand")]
            if us_entries:
                assert not seq[0].get("compare_brand"), f"group {cg}: first entry should be us, got {seq[0].get('template_id')} compare={seq[0].get('compare_brand')}"
            # Competitor entries should follow user input order
            comp_entries = [q.get("compare_brand") for q in seq if q.get("compare_brand")]
            expected_order = [c for c in comp_order if c in comp_entries]
            assert comp_entries == expected_order, f"group {cg}: comp order {comp_entries} != expected {expected_order}"

    def test_non_grouped_questions_preserve_relative_order(self, study_4comp):
        _, qs = study_4comp
        # PQ-1 (no axis) and AW-1 and BI-1 and open-long ones should still appear
        non_grouped = [q.get("template_id") for q in qs if not q.get("axis_label")]
        # At least the fundamentals are present
        assert "PQ-1" in non_grouped
        assert "BI-1" in non_grouped
        assert "ASO-1" in non_grouped  # unaided association
        assert "LY-1" in non_grouped  # NPS


# Feature 4: options_th for trait_grid (BI-1 + ASP-1)

DEFAULT_TRAIT_MAP = {
    "Modern": "ทันสมัย",
    "Classic": "คลาสสิก",
    "Trustworthy": "น่าเชื่อถือ",
    "Innovative": "นวัตกรรม",
    "Premium": "พรีเมี่ยม",
    "Reliable": "ไว้ใจได้",
}
PERSONALITY_TRAIT_MAP = {
    "Honest": "ซื่อสัตย์",
    "Reliable": "ไว้ใจได้",
    "Up-to-date": "ทันสมัย",
}


class TestTraitGridThaiOptions:
    def test_bi1_has_options_th_same_length(self, study_4comp):
        _, qs = study_4comp
        bi1 = _by_template(qs, "BI-1")
        assert len(bi1) == 1, f"expected 1 BI-1, got {len(bi1)}"
        q = bi1[0]
        assert q["type"] == "trait_grid"
        assert isinstance(q.get("options"), list) and len(q["options"]) >= 20
        assert isinstance(q.get("options_th"), list)
        assert len(q["options_th"]) == len(q["options"]), "options_th length must match options"
        # No None/empty
        assert all(isinstance(s, str) and s.strip() for s in q["options_th"]), "options_th contains empty"

    def test_bi1_options_th_map_by_index(self, study_4comp):
        _, qs = study_4comp
        q = _by_template(qs, "BI-1")[0]
        opts, opts_th = q["options"], q["options_th"]
        for en, th in DEFAULT_TRAIT_MAP.items():
            if en in opts:
                idx = opts.index(en)
                assert opts_th[idx] == th, f"BI-1: {en} -> expected {th}, got {opts_th[idx]}"

    def test_asp1_personality_traits_has_17_items_with_th_map(self, study_4comp):
        _, qs = study_4comp
        asp = _by_template(qs, "ASP-1")
        assert len(asp) == 1, f"expected 1 ASP-1, got {len(asp)}"
        q = asp[0]
        assert q["type"] == "trait_grid"
        assert len(q["options"]) == 17, f"personality pool size != 17: {len(q['options'])}"
        assert len(q["options_th"]) == 17
        for en, th in PERSONALITY_TRAIT_MAP.items():
            assert en in q["options"], f"{en} missing from ASP-1 options"
            idx = q["options"].index(en)
            assert q["options_th"][idx] == th, f"ASP-1: {en} -> expected {th}, got {q['options_th'][idx]}"


# Feature 5: regenerate-questions on existing seed study

class TestRegenerateQuestions:
    def test_regenerate_produces_comparison_group_and_options_th(self, auth_headers):
        r = requests.post(
            f"{API}/brand-equity/studies/{SEED_STUDY_ID}/regenerate-questions",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"regenerate failed: {r.status_code} {r.text}"
        data = r.json()
        qs = data.get("questions") or []
        assert qs, "no questions returned"
        # All axis-tagged questions have comparison_group
        axis_qs = [q for q in qs if q.get("axis_label")]
        assert axis_qs, "no axis-tagged questions after regenerate"
        assert all(q.get("comparison_group") for q in axis_qs), "some axis_qs missing comparison_group"
        # BI-1 has options_th
        bi1 = [q for q in qs if q.get("template_id") == "BI-1"]
        if bi1:
            assert bi1[0].get("options_th"), "BI-1 missing options_th after regenerate"
            assert len(bi1[0]["options_th"]) == len(bi1[0]["options"])


# Feature 6: Public respond submit still works with new schema

class TestPublicRespondE2E:
    def test_public_payload_has_grouped_questions_and_options_th(self, study_4comp, auth_headers):
        sid, _ = study_4comp
        # Launch: set status to collecting
        r = requests.put(
            f"{API}/brand-equity/studies/{sid}",
            headers=auth_headers,
            json={"status": "collecting"},
            timeout=15,
        )
        assert r.status_code in (200, 204), f"launch failed: {r.status_code} {r.text}"
        # Get share token
        r2 = requests.get(f"{API}/brand-equity/studies/{sid}", headers=auth_headers, timeout=15)
        assert r2.status_code == 200
        study = r2.json()
        token = study.get("share_token") or study.get("public_token")
        assert token, f"no share_token on study keys={list(study.keys())}"
        # Hit public endpoint
        r3 = requests.get(f"{API}/brand-equity/public/{token}", timeout=15)
        assert r3.status_code == 200, f"public GET failed: {r3.status_code} {r3.text}"
        public_data = r3.json()
        qs = public_data.get("questions") or []
        assert qs, "public endpoint returned no questions"
        bi1 = [q for q in qs if q.get("template_id") == "BI-1"]
        assert bi1 and bi1[0].get("options_th"), "BI-1 options_th missing on public payload"

    def test_respond_submit_succeeds(self, study_4comp, auth_headers):
        sid, _ = study_4comp
        # ensure launched (idempotent)
        requests.put(f"{API}/brand-equity/studies/{sid}", headers=auth_headers,
                     json={"status": "collecting"}, timeout=15)
        r2 = requests.get(f"{API}/brand-equity/studies/{sid}", headers=auth_headers, timeout=15)
        study = r2.json()
        token = study.get("share_token") or study.get("public_token")
        r3 = requests.get(f"{API}/brand-equity/public/{token}", timeout=15)
        qs = r3.json().get("questions") or []
        # Build synthetic answers
        answers = []
        for q in qs:
            qid = q["id"]
            t = q.get("type")
            if t == "likert_7":
                answers.append({"question_id": qid, "value": 5})
            elif t == "nps_0_10":
                answers.append({"question_id": qid, "value": 8})
            elif t == "comparative_7":
                answers.append({"question_id": qid, "value": 4})
            elif t == "trait_grid":
                opts = q.get("options") or []
                chosen = opts[: max(q.get("min", 1), 1)] if opts else []
                answers.append({"question_id": qid, "value": chosen})
            elif t == "mcq_single":
                opts = q.get("options") or []
                answers.append({"question_id": qid, "value": opts[0] if opts else ""})
            elif t == "mcq_multi":
                opts = q.get("options") or []
                answers.append({"question_id": qid, "value": opts[:1]})
            elif t == "ranking":
                opts = q.get("options") or []
                answers.append({"question_id": qid, "value": opts})
            else:  # open_short / open_long
                answers.append({"question_id": qid, "value": "ทดสอบ"})
        payload = {
            "demographics": {"age": "25-34", "gender": "female"},
            "answers": answers,
            "duration_sec": 60,
        }
        r4 = requests.post(f"{API}/brand-equity/public/{token}/respond", json=payload, timeout=30)
        assert r4.status_code in (200, 201), f"respond submit failed: {r4.status_code} {r4.text[:500]}"
