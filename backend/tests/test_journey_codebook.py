"""Tests for lib/journey_codebook.py — the qualitative -> quantitative contract.

Spec: memory/CJM_PAINPOINT_SPEC.md revision 2, acceptance list section 4.
Numbered comments below map to that list.
"""
import os
import sys

import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from lib import journey_codebook as jc          # noqa: E402
from lib.markov_journey import wilson_interval  # noqa: E402
from lib.consent import check_blocklist         # noqa: E402


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def _row(rid, label, **kw):
    row = {"id": rid, "label_th": label, "definition_th": "นิยาม " + label,
           "state_ids": [], "applies_to": "all", "status": "approved",
           "approved_by": "u1", "approved_at": "2026-08-20T00:00:00Z",
           "provenance": {"run_ids": ["r1"],
                          "quotes": [{"text": "ลูกค้าบอกว่า " + label,
                                      "source_ref": "qualitative"}],
                          "origin": "qualitative", "citation_th": None}}
    row.update(kw)
    return row


def _codebook(n_pain=3, **kw):
    cb = {
        "id": "cb1", "study_id": "s1", "version": 1, "status": "draft",
        "source": {"qualitative_run_ids": ["r1"], "n_interviews": 12,
                   "collection_method_th": "สัมภาษณ์กึ่งโครงสร้าง 12 ราย",
                   "journey_style": "nonlinear"},
        "states": [_row("st1", "ค้นหา", role="step", order=0),
                   _row("st2", "สั่งซื้อ", role="step", order=1)],
        "edges": [],
        "touchpoints": [_row("tp1", "แอป", channel_type="app")],
        "pain_categories": [_row("pc%d" % i, "ปัญหา%d" % i, pain_type="process")
                            for i in range(1, n_pain + 1)],
        "reliability": {"mode": "none"},
    }
    cb.update(kw)
    return cb


# --------------------------------------------------------------------------
# 2 — extraction keeps the edges, which is what makes step 2 able to audit step 1
# --------------------------------------------------------------------------

MERMAID = """
graph TD
  A[ค้นหาร้าน] --> B[ดูรีวิว]
  B --> C[สั่งซื้อ]
  C -->|ยกเลิก| A
"""


def test_extract_pulls_both_nodes_and_edges():
    states, edges = jc.extract_states_and_edges(MERMAID)
    assert states == ["ค้นหาร้าน", "ดูรีวิว", "สั่งซื้อ"]
    assert ("ค้นหาร้าน", "ดูรีวิว") in edges
    assert ("ดูรีวิว", "สั่งซื้อ") in edges
    # the labelled arrow must survive too — it is the back-edge that decides
    # whether the "linear" claim holds
    assert ("สั่งซื้อ", "ค้นหาร้าน") in edges


def test_extract_ignores_self_loops_and_unknown_nodes():
    states, edges = jc.extract_states_and_edges("graph TD\n X[หนึ่ง] --> X\n Y --> Z")
    assert states == ["หนึ่ง"]
    assert edges == []


# --------------------------------------------------------------------------
# 1 — a candidate without a quote is impossible to construct, not merely rejected
# --------------------------------------------------------------------------

RAW = """
รอคิวนานมากกว่าสามสิบนาที
แอปใช้ยาก กดแล้วงง
ราคาแพงกว่าที่คิด
พนักงานที่สาขาอธิบายดี
"""


def test_every_extracted_candidate_carries_at_least_one_quote():
    out = jc.extract_candidates(raw_text=RAW, mermaid=MERMAID, run_ids=["r1"])
    assert out["pain_categories"], "expected some pain candidates"
    for group in ("states", "touchpoints", "pain_categories"):
        for row in out[group]:
            quotes = row["provenance"]["quotes"]
            assert quotes, "%s candidate %r has no quote" % (group, row["id"])
            assert all(q["text"].strip() for q in quotes)


def test_extraction_finds_thai_pain_and_channel_cues():
    out = jc.extract_candidates(raw_text=RAW, run_ids=["r1"])
    cues = {p["_cue"] for p in out["pain_categories"]}
    assert {"นาน", "ยาก", "งง", "แพง"} & cues
    channels = {t["label_th"] for t in out["touchpoints"]}
    assert "แอป" in channels and "สาขา" in channels


def test_extraction_survives_empty_input():
    out = jc.extract_candidates()
    assert out["pain_categories"] == [] and out["states"] == []


# --------------------------------------------------------------------------
# 3 — activation gates, each one independently
# --------------------------------------------------------------------------

def test_clean_codebook_activates():
    assert jc.validate_for_activation(_codebook()) == []


def test_gate_missing_definition():
    cb = _codebook()
    cb["pain_categories"][0]["definition_th"] = "  "
    reasons = jc.validate_for_activation(cb)
    assert any("คำนิยาม" in r for r in reasons)


def test_gate_missing_quote():
    cb = _codebook()
    cb["pain_categories"][0]["provenance"]["quotes"] = []
    assert any("ข้อความต้นทาง" in r for r in jc.validate_for_activation(cb))


def test_gate_selected_but_no_states_chosen():
    cb = _codebook()
    cb["pain_categories"][0]["applies_to"] = "selected"
    cb["pain_categories"][0]["state_ids"] = []
    assert any("ยังไม่ได้เลือกขั้น" in r for r in jc.validate_for_activation(cb))


def test_gate_too_few_and_too_many_pain_categories():
    assert any("อย่างน้อย" in r for r in jc.validate_for_activation(_codebook(n_pain=2)))
    assert any("เกิน" in r for r in jc.validate_for_activation(_codebook(n_pain=13)))


def test_gate_duplicate_labels():
    cb = _codebook()
    cb["pain_categories"][1]["label_th"] = cb["pain_categories"][0]["label_th"]
    assert any("ซ้ำกัน" in r for r in jc.validate_for_activation(cb))


def test_gate_missing_collection_method():
    cb = _codebook()
    cb["source"]["collection_method_th"] = ""
    assert any("วิธีเก็บข้อมูล" in r for r in jc.validate_for_activation(cb))


def test_gate_prior_literature_needs_citation():
    cb = _codebook()
    cb["pain_categories"][0]["provenance"]["origin"] = "prior_literature"
    cb["pain_categories"][0]["provenance"]["citation_th"] = None
    assert any("อ้างอิง" in r for r in jc.validate_for_activation(cb))
    cb["pain_categories"][0]["provenance"]["citation_th"] = "Lemon & Verhoef (2016)"
    assert jc.validate_for_activation(cb) == []


def test_gate_budget_blocks_and_reports_why():
    budget = {"blocked": True, "blockers": ["ใช้เวลาประมาณ 900 วินาที เกินเพดาน 480 วินาที"]}
    reasons = jc.validate_for_activation(_codebook(), budget=budget)
    assert any("งบเวลา" in r and "900" in r for r in reasons)


def test_gate_reports_every_problem_at_once_not_just_the_first():
    cb = _codebook(n_pain=2)
    cb["source"]["collection_method_th"] = ""
    cb["pain_categories"][0]["definition_th"] = ""
    assert len(jc.validate_for_activation(cb)) >= 3


def test_pdpa_blocklist_screens_visible_labels():
    cb = _codebook()
    cb["pain_categories"][0]["label_th"] = "ไม่สะดวกใจเรื่องศาสนา"
    hits = jc.blocklist_terms(cb, check_blocklist)
    assert hits, "a special-category term in a visible label must be caught"


# --------------------------------------------------------------------------
# spec 3.5 — the per-state ceiling advises, the time budget blocks
# --------------------------------------------------------------------------

def test_more_than_eight_options_per_state_warns_but_does_not_block():
    cb = _codebook(n_pain=10)
    assert jc.validate_for_activation(cb) == []          # not blocked
    warns = jc.soft_warnings(cb)
    assert any("อ่านยาก" in w for w in warns)             # but advised


# --------------------------------------------------------------------------
# 6, 7, 8, 9 — serving and accepting
# --------------------------------------------------------------------------

def test_public_payload_is_per_state():
    cb = _codebook()
    cb["pain_categories"][0].update(applies_to="selected", state_ids=["st1"])
    cb["pain_categories"][1].update(applies_to="selected", state_ids=["st2"])
    st1 = {o["id"] for o in jc.pain_options_for_state(cb, "st1")}
    st2 = {o["id"] for o in jc.pain_options_for_state(cb, "st2")}
    assert "pc1" in st1 and "pc1" not in st2
    assert "pc2" in st2 and "pc2" not in st1
    assert "pc3" in st1 and "pc3" in st2      # applies_to == "all"


def test_unapproved_categories_never_reach_a_respondent():
    cb = _codebook()
    cb["pain_categories"][0]["status"] = "suggested"
    assert "pc1" not in {o["id"] for o in jc.pain_options_for_state(cb, "st1")}


def test_unknown_category_ids_are_dropped_not_raised():
    cb = _codebook()
    got = jc.sanitize_category_ids(["pc1", "pc999", "pc1"], cb, "st1")
    assert got == ["pc1"]


def test_nomination_cap_is_enforced_server_side():
    assert jc.enforce_nomination_cap(["a", "b", "c"], 2) == ["a", "b"]
    assert jc.enforce_nomination_cap(["a", "a", "b"], 2) == ["a", "b"]
    assert jc.enforce_nomination_cap(["a", "b", "c"], 3) == ["a", "b", "c"]


# --------------------------------------------------------------------------
# 11 — other_rate warns on the interval's lower bound, not the point estimate
# --------------------------------------------------------------------------

def test_other_rate_does_not_cry_wolf_on_a_small_pilot():
    got = jc.other_rate(1, 12, wilson_interval)
    assert got["rate"] == pytest.approx(1 / 12, abs=1e-4)
    assert got["ci95"][0] < 0.15
    assert got["warn"] is False and got["warning_th"] is None


def test_other_rate_warns_when_the_lower_bound_clears_fifteen_percent():
    got = jc.other_rate(30, 100, wilson_interval)
    assert got["ci95"][0] > 0.15
    assert got["warn"] is True and "ครอบคลุมไม่พอ" in got["warning_th"]


def test_other_rate_with_no_nominations_is_silent():
    got = jc.other_rate(0, 0, wilson_interval)
    assert got["rate"] is None and got["warn"] is False


# --------------------------------------------------------------------------
# 12 — edge coverage: the join between the two steps
# --------------------------------------------------------------------------

STATES = ["A", "B", "C"]
# Row totals are deliberately above MIN_R_EDGE_LABEL (25): below that an edge
# may not carry a number, so it may not overturn a claim either.
#            A    B   C
N_IJ = [[0, 100, 0],    # A -> B
        [0, 0, 80],     # B -> C
        [30, 0, 0]]     # C -> A   (a back-edge with real mass)


def test_edge_coverage_splits_claimed_and_observed_three_ways():
    cov = jc.edge_coverage([("A", "B"), ("A", "C")], N_IJ, STATES, wilson_interval)
    assert [(c["from"], c["to"]) for c in cov["claimed_and_observed"]] == [("A", "B")]
    assert [(c["from"], c["to"]) for c in cov["claimed_not_observed"]] == [("A", "C")]
    pairs = {(c["from"], c["to"]) for c in cov["observed_not_claimed"]}
    assert pairs == {("B", "C"), ("C", "A")}


def test_edge_coverage_flags_a_linear_claim_contradicted_by_a_back_edge():
    cov = jc.edge_coverage([("A", "B"), ("B", "C")], N_IJ, STATES, wilson_interval,
                           journey_style="linear")
    assert cov["linear_violations"], "C->A is a material back-edge"
    assert "nonlinear" in cov["warning_th"]


def test_a_nonlinear_claim_is_not_flagged_by_the_same_data():
    cov = jc.edge_coverage([("A", "B"), ("B", "C")], N_IJ, STATES, wilson_interval,
                           journey_style="nonlinear")
    assert cov["linear_violations"] == [] and cov["warning_th"] is None


def test_a_trace_back_edge_is_not_material_enough_to_flag():
    # C's row holds a single observation. Its share is 1.0 and its Wilson lower
    # bound is about 0.21, so a share threshold alone would call it material and
    # wrongly overturn the student's "linear" claim on one stray answer.
    n_ij = [[0, 100, 0], [0, 0, 100], [1, 0, 0]]
    cov = jc.edge_coverage([("A", "B"), ("B", "C")], n_ij, STATES, wilson_interval,
                           journey_style="linear")
    c_to_a = [c for c in cov["observed_not_claimed"] if c["from"] == "C"][0]
    assert c_to_a["share"] == 1.0 and c_to_a["ci95"][0] > jc.MATERIAL_EDGE_SHARE
    assert c_to_a["material"] is False, "one observation cannot carry an edge"
    assert cov["linear_violations"] == []


def test_edge_coverage_reports_what_the_qualitative_step_missed():
    cov = jc.edge_coverage([("A", "B")], N_IJ, STATES, wilson_interval)
    assert cov["missed_by_qualitative_th"] is not None


# --------------------------------------------------------------------------
# 13 — saturation
# --------------------------------------------------------------------------

def test_saturation_curve_counts_only_new_categories():
    per = [["a", "b"], ["b", "c"], ["a"], []]
    got = jc.saturation_curve(per)
    assert [r["n_new_categories"] for r in got["rows"]] == [2, 1, 0, 0]
    assert [r["cumulative"] for r in got["rows"]] == [2, 3, 3, 3]
    assert got["saturated"] is True


def test_saturation_warns_when_the_tail_still_produces_new_codes():
    got = jc.saturation_curve([["a"], ["b"], ["c"]])
    assert got["saturated"] is False
    assert any("ยังไม่อิ่มตัว" in w for w in got["warnings"])


def test_saturation_warns_below_twelve_interviews():
    got = jc.saturation_curve([["a"], ["a"], ["a"]])
    assert any("ต่ำกว่า 12" in w for w in got["warnings"])


def test_saturation_at_twelve_interviews_drops_the_sample_size_warning():
    got = jc.saturation_curve([["a"]] * 12)
    assert not any("ต่ำกว่า 12" in w for w in got["warnings"])


# --------------------------------------------------------------------------
# 14, 15, 16 — reliability, and the refusal to report one pooled kappa
# --------------------------------------------------------------------------

def test_per_category_kappa_is_one_on_perfect_agreement():
    a = [["c1"], ["c1"], [], []]
    rows = jc.per_category_kappa(a, list(a), ["c1"])
    assert rows[0]["kappa"] == pytest.approx(1.0)
    assert rows[0]["prevalence"] == pytest.approx(0.5)


def test_per_category_kappa_is_zero_at_chance():
    a = [["c1"] if i < 50 else [] for i in range(100)]
    b = [["c1"] if i % 2 == 0 else [] for i in range(100)]
    rows = jc.per_category_kappa(a, b, ["c1"])
    assert rows[0]["kappa"] == pytest.approx(0.0, abs=1e-9)


def test_rare_category_reports_na_instead_of_a_paradoxical_kappa():
    # present in 1 of 40 units for each coder -> prevalence 2.5%
    a = [["c1"]] + [[] for _ in range(39)]
    rows = jc.per_category_kappa(a, list(a), ["c1"])
    assert rows[0]["kappa"] is None
    assert "พบน้อยเกินไป" in rows[0]["note_th"]
    assert rows[0]["percent_agreement"] == pytest.approx(1.0)


def test_kappa_undefined_when_both_coders_are_constant():
    a = [["c1"]] * 10
    rows = jc.per_category_kappa(a, list(a), ["c1"])
    assert rows[0]["kappa"] is None and "ไม่นิยาม" in rows[0]["note_th"]


def test_mismatched_coder_lengths_raise():
    with pytest.raises(jc.CodebookError):
        jc.per_category_kappa([["c1"]], [["c1"], ["c1"]], ["c1"])


def test_krippendorff_alpha_is_one_on_perfect_agreement_with_variation():
    a = [["c1"], ["c1"], [], []]
    assert jc.krippendorff_alpha_binary(a, list(a), ["c1"]) == pytest.approx(1.0)


def test_krippendorff_alpha_matches_a_hand_calculation():
    # two units, one category, coders exactly opposed.
    # o[1,0]=o[0,1]=2 ; n_0=n_1=2 ; n=4 ; D_o=4 ; D_e=(2*2+2*2)/3=8/3 ; a=1-1.5
    a, b = [["c1"], []], [[], ["c1"]]
    assert jc.krippendorff_alpha_binary(a, b, ["c1"]) == pytest.approx(-0.5, abs=1e-4)


def test_krippendorff_alpha_handles_multi_label_units():
    a = [["c1", "c2"], ["c1"], [], ["c2"]]
    assert jc.krippendorff_alpha_binary(a, list(a), ["c1", "c2"]) == pytest.approx(1.0)


def test_reliability_report_never_exposes_a_single_pooled_kappa():
    a = [["c1"], ["c1"], [], []]
    rep = jc.reliability_report(a, list(a), ["c1"], mode="second_coder")
    assert "kappa" not in rep, "a pooled kappa field would eventually get rendered"
    assert "cohen_kappa" not in rep
    assert isinstance(rep["per_category"], list)
    assert rep["krippendorff_alpha"] is not None


def test_reliability_modes_carry_their_own_limitation_text():
    a = [["c1"], []]
    assert any("ข้อจำกัด" in t for t in
               jc.reliability_report(a, list(a), ["c1"], mode="none")["limitations_th"])
    assert any("test–retest" in t for t in
               jc.reliability_report(a, list(a), ["c1"], mode="test_retest")["limitations_th"])
    with pytest.raises(jc.CodebookError):
        jc.reliability_report(a, list(a), ["c1"], mode="bogus")


def test_reliability_reports_percent_agreement_on_whole_label_sets():
    a = [["c1", "c2"], ["c1"]]
    b = [["c1", "c2"], []]
    rep = jc.reliability_report(a, b, ["c1", "c2"])
    assert rep["percent_agreement"] == pytest.approx(0.5)


# --------------------------------------------------------------------------
# 18, 19 — provenance and comparability
# --------------------------------------------------------------------------

def test_provenance_warns_loudly_for_the_library_default():
    got = jc.provenance_block(None, {"pain_source": "library_default"})
    assert "ไม่ได้มาจากข้อมูลเชิงคุณภาพ" in got["warning_th"]


def test_provenance_distinguishes_prior_literature_from_laziness():
    got = jc.provenance_block(None, {"pain_source": "prior_literature"})
    assert "งานวิจัยก่อนหน้า" in got["warning_th"]
    assert "ไม่ได้มาจากข้อมูลเชิงคุณภาพ" not in got["warning_th"]


def test_provenance_is_silent_when_the_codebook_is_genuinely_qualitative():
    cb = _codebook()
    got = jc.provenance_block(cb, {"pain_source": "qualitative"})
    assert got["warning_th"] is None
    assert got["n_quotes"] == 6          # 2 states + 1 touchpoint + 3 pain
    assert got["n_interviews"] == 12
    assert got["journey_style_claimed"] == "nonlinear"


def test_results_from_different_codebook_versions_are_flagged_incomparable():
    assert jc.comparability_flag(2, 2)["comparable"] is True
    bad = jc.comparability_flag(1, 2)
    assert bad["comparable"] is False and "เทียบกันไม่ได้" in bad["reason_th"]


# --------------------------------------------------------------------------
# spec 2.2 — the codebook version is structural, but only once one is in use
# --------------------------------------------------------------------------

def test_codebook_version_enters_the_structure_hash_without_moving_old_studies():
    from routes import journey_instrument as ji
    base = {"states": [{"id": "a"}, {"id": "b"}], "pain_options": {"a": ["x"]}}
    h_none = ji.compute_structure_hash(base)
    # Every study fielded before this feature has no codebook_version. If adding
    # the key moved their hash, the next label fix on a collecting study would
    # be rejected as a structural change.
    assert ji.compute_structure_hash({**base, "codebook_version": 0}) == h_none
    h1 = ji.compute_structure_hash({**base, "codebook_version": 1})
    h2 = ji.compute_structure_hash({**base, "codebook_version": 2})
    assert h1 != h_none and h2 != h1


def test_one_sentence_tripping_two_cues_yields_one_candidate():
    # "ยาก" and "งง" both fire on this single sentence. Emitting it twice gave
    # two rows with the same label, which the duplicate-label gate then blocked.
    out = jc.extract_candidates(raw_text="แอปใช้ยาก กดแล้วงง หาเมนูไม่เจอ")
    labels = [p["label_th"] for p in out["pain_categories"]]
    assert len(labels) == len(set(labels)), labels
    assert len(out["pain_categories"]) == 1
    assert "+" in out["pain_categories"][0]["_cue"], "both cues should be recorded"


def test_distinct_sentences_stay_distinct_candidates():
    out = jc.extract_candidates(raw_text="รอคิวนานมาก\nราคาแพงกว่าที่คิด")
    assert len(out["pain_categories"]) == 2


def test_placeholder_labels_never_collide():
    # "ไม่" matches both sentences while "ยาก"/"งง" match only the first, so the
    # two groups differ but share a first quote. Identical placeholder labels
    # would trip the duplicate-label gate through no fault of the student.
    out = jc.extract_candidates(
        raw_text="แอปใช้ยาก กดแล้วงง หาเมนูไม่เจอ\nที่จอดรถเต็ม หาที่จอดไม่ได้")
    labels = [p["label_th"] for p in out["pain_categories"]]
    assert len(labels) == len(set(labels)), labels
