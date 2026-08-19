"""
Phase 1 (model-free) Customer Journey — behaviour tests.

Everything here runs on pure functions: no FastAPI, no Mongo. The route layer is
exercised end-to-end by the API tests.
"""

import os
import sys

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

import pytest  # noqa: E402

from routes import journey as J  # noqa: E402
from routes import journey_instrument as ji  # noqa: E402
from lib import journey_budget as jb  # noqa: E402
from lib import markov_journey as mj  # noqa: E402
from lib.consent import check_blocklist, new_respondent_token  # noqa: E402


def make_study(m=4):
    states = ji.build_states_from_template("retail_product")[:m]
    study = {
        "analysis_level": "product",
        "stages": ji.DEFAULT_STAGES,
        "states": states,
        "absorbing": ji.default_absorbing("product"),
        "expected_transitions": ji.default_expected_transitions(states),
        "pain_options": ji.default_pain_options(states),
        "segment_questions": ji.build_segment_questions(),
        "recall_window_days": 90,
        "target_responses": 120,
    }
    study["structure_hash"] = ji.compute_structure_hash(study)
    return study


def resp(rid, path, terminal, diffs=None, pain=None, quality=None, demo=None,
         outcome=None):
    return {
        "id": rid,
        "path": [{"state_id": s, "order": i} for i, s in enumerate(path)],
        "visited": list(dict.fromkeys(path)),
        "late_additions": [],
        "terminal": terminal,
        "outcome": outcome,
        "experience": {s: {"difficulty_1_5": v, "emotion": 0.0}
                       for s, v in (diffs or {}).items()},
        "pain": pain or {"nominated": []},
        "demographics": demo or {"age_band": "20–29 ปี"},
        "mask_violations": [],
        "quality": {"duration_sec": 300, "difficulty_rows": len(diffs or {}),
                    "scored_rows": len(diffs or {}), "longstring": 1, "irv": 1.0,
                    **(quality or {})},
    }


# ---------------------------------------------------------------------------
# Burden: POMP on the scale endpoints, never on the sample min/max
# ---------------------------------------------------------------------------
def test_burden_uses_scale_endpoints_not_sample_range():
    b_all_bad, _ = J._burden([4.0, 4.0, 4.0, 4.0])
    b_all_good, _ = J._burden([2.0, 2.0, 2.0, 2.0])
    assert b_all_bad == pytest.approx(75.0)
    assert b_all_good == pytest.approx(25.0)
    # ipma_analysis.normalize_scores would force these to 100 and 0.
    assert b_all_bad != 100.0 and b_all_good != 0.0


def test_burden_ci_narrows_with_n():
    small = J._burden([2, 3, 4, 3, 2])[1]
    large = J._burden([2, 3, 4, 3, 2] * 20)[1]
    assert (small[1] - small[0]) > (large[1] - large[0])


def test_burden_none_when_nobody_rated():
    assert J._burden([]) == (None, None)


# ---------------------------------------------------------------------------
# Analysis payload
# ---------------------------------------------------------------------------
def test_analysis_counts_unknown_never_imputes():
    study = make_study()
    responses = ([resp(f"c{i}", ["s1", "s2", "s3"], "CONV", {"s1": 2, "s2": 3}) for i in range(10)]
                 + [resp(f"a{i}", ["s1", "s2"], "ABANDON", {"s1": 4}) for i in range(6)]
                 + [resp(f"u{i}", ["s1"], "UNKNOWN", {"s1": 3}) for i in range(4)])
    res = J.compute_model_free(study, responses)
    t = res["terminals"]
    assert t["CONV"]["count"] == 10 and t["ABANDON"]["count"] == 6 and t["UNKNOWN"]["count"] == 4
    assert t["CONV"]["share"] + t["ABANDON"]["share"] + t["UNKNOWN"]["share"] == pytest.approx(1.0)
    assert res["diagnostics"]["unknown_rate"] == pytest.approx(0.2)


def test_route_shares_hidden_below_30_respondents():
    study = make_study()
    res = J.compute_model_free(study, [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3})
                                       for i in range(12)])
    assert res["routes"]["shares_hidden"] is True
    assert all(r["share"] is None for r in res["routes"]["top"])
    assert "routes" not in res["gates"]["unlocked"]

    res2 = J.compute_model_free(study, [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3})
                                        for i in range(35)])
    assert res2["routes"]["shares_hidden"] is False
    assert "routes" in res2["gates"]["unlocked"]


def test_no_matrix_or_map_in_phase1_payload():
    study = make_study()
    res = J.compute_model_free(study, [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3})
                                       for i in range(40)])
    assert res["matrix"] is None and res["map"] is None and res["priority"] is None
    for gate in ("order_test", "predictive"):
        assert res["gates"][gate]["evaluable"] is False
        assert res["gates"][gate]["p"] is None       # no p-value when not evaluable


def test_reach_revisit_and_rework():
    study = make_study()
    responses = [resp("r1", ["s1", "s2", "s1", "s3"], "CONV", {"s1": 3}),
                 resp("r2", ["s1", "s2"], "ABANDON", {"s1": 3}),
                 resp("r3", ["s2", "s3"], "CONV", {"s2": 2})]
    res = J.compute_model_free(study, responses)
    s1 = res["nodes"]["s1"]
    assert s1["n_visit"] == 2
    assert s1["reach"] == pytest.approx(2 / 3)
    assert s1["revisit"] == pytest.approx(1.5)      # r1 visits s1 twice
    assert s1["rework_rate"] == pytest.approx(0.5)
    assert res["nodes"]["s4"]["no_visitors"] is True


def test_severity_is_conditional_and_labelled():
    study = make_study()
    responses = [resp("r1", ["s1", "s2"], "CONV", {"s1": 3},
                      pain={"nominated": ["s1"], "s1": {"severity_0_10": 8}}),
                 resp("r2", ["s1", "s2"], "CONV", {"s1": 3}, pain={"nominated": []})]
    node = J.compute_model_free(study, responses)["nodes"]["s1"]
    assert node["severity_conditional"]["m"] == 1
    assert node["severity_conditional"]["mean"] == pytest.approx(8.0)
    assert "เลือกขั้นนี้ว่ามีปัญหา" in node["severity_conditional"]["caveat_th"]
    assert node["pain_nomination_rate"] == pytest.approx(0.5)
    assert node["pain_nomination_ci95"] is not None


# ---------------------------------------------------------------------------
# Careless-response battery
# ---------------------------------------------------------------------------
def test_single_flag_never_excludes():
    r = resp("r1", ["s1", "s2"], "CONV", {"s1": 3},
             quality={"trap_shown": True, "trap_hit": True})
    out = J._quality_flags(r, None)
    assert out["hits"] == ["trap"] and out["excluded"] is False


def test_two_applicable_flags_exclude():
    r = resp("r1", ["s1", "s2"], "ABANDON", {"s1": 3}, outcome="convert",
             quality={"trap_shown": True, "trap_hit": True})
    out = J._quality_flags(r, None)
    assert set(out["hits"]) == {"trap", "outcome_conflict"} and out["excluded"] is True


def test_straightlining_not_applicable_below_six_rows():
    r = resp("r1", ["s1", "s2"], "CONV", {"s1": 3, "s2": 3},
             quality={"irv": 0.0, "longstring": 2, "difficulty_rows": 2})
    out = J._quality_flags(r, None)
    assert out["flags"]["straightlining"] is None
    assert "straightlining" not in out["hits"]


def test_applicable_flag_count_is_reported():
    study = make_study()
    responses = [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(10)]
    res = J.compute_model_free(study, responses)
    assert res["diagnostics"]["exclusions"]["applicable_flags"] <= 4
    assert res["diagnostics"]["exclusions"]["n"] == 0


def test_excluded_respondents_leave_the_denominator():
    study = make_study()
    good = [resp(f"g{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(9)]
    bad = resp("b1", ["s1"], "ABANDON", {"s1": 3}, outcome="convert",
               quality={"trap_shown": True, "trap_hit": True})
    res = J.compute_model_free(study, good + [bad])
    assert res["n_disclosure"] == {"R_submitted": 10, "R_analysed": 9,
                                   "n_excluded": 1, "n_transitions": res["n_disclosure"]["n_transitions"]}


# ---------------------------------------------------------------------------
# Diagnostics drive something visible
# ---------------------------------------------------------------------------
def test_mask_violation_excludes_trap_responses_from_denominator():
    study = make_study()
    trap = resp("t1", ["s1", "s3"], "CONV", {"s1": 3}, quality={"trap_shown": True, "trap_hit": True})
    trap["mask_violations"] = [["s1", "s3"]]
    clean = [resp(f"c{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(9)]
    res = J.compute_model_free(study, clean + [trap])
    assert res["diagnostics"]["mask_violation_rate"] == 0.0


def test_set_consistency_detects_late_walk():
    study = make_study()
    r = resp("r1", ["s1", "s2"], "CONV", {"s1": 3})
    r["visited"] = ["s1"]                    # s2 walked but never declared
    res = J.compute_model_free(study, [r])
    assert res["diagnostics"]["set_consistency_rate"] == 0.0


def test_high_unknown_rate_raises_a_warning():
    study = make_study()
    responses = ([resp(f"u{i}", ["s1"], "UNKNOWN", {"s1": 3}) for i in range(5)]
                 + [resp(f"c{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(5)])
    res = J.compute_model_free(study, responses)
    keys = [w["key"] for w in res["diagnostics"]["warnings"]]
    assert "unknown_rate" in keys


def test_link_sends_counted_not_completes():
    # 62 of 100 done at a 58% completion rate needs ~66 more SENDS, not 38.
    assert J._link_sends(62, 100, 0.58) == 66


# ---------------------------------------------------------------------------
# Instrument, budget, consent
# ---------------------------------------------------------------------------
def test_structure_hash_ignores_labels_but_tracks_ids():
    a = make_study()
    b = {**a, "states": [dict(s, label_th=s["label_th"] + " (แก้คำ)") for s in a["states"]]}
    assert ji.compute_structure_hash(a) == ji.compute_structure_hash(b)
    c = {**a, "states": a["states"][:3]}
    assert ji.compute_structure_hash(a) != ji.compute_structure_hash(c)


def test_state_ids_are_stable_across_label_edits():
    original = ji.build_states_from_template("retail_product")
    labels = [s["label_th"] for s in original]
    labels[0] = "รู้จักสินค้าครั้งแรก"          # unchanged
    rebuilt = ji.build_states_from_labels(labels, original)
    assert [s["id"] for s in rebuilt] == [s["id"] for s in original]


def test_budget_blocks_eight_states_via_recruitment_cap():
    est = jb.check_design(8, 100)
    assert est["blocked"] is True
    assert est["max_states_for_target"] == 5


def test_reference_instrument_matches_the_documented_figure():
    est = jb.estimate(**jb.REFERENCE_INSTRUMENT)
    assert abs(est["seconds_median"] - 330) <= 15


def test_pdpa_blocklist_hard_rejects_special_categories():
    assert check_blocklist(["ศาสนาที่นับถือ"])
    assert check_blocklist(["ช่วงอายุ", "ภูมิภาค"]) == []
    with pytest.raises(ValueError):
        ji.build_segment_questions({"label_th": "ข้อมูลสุขภาพ", "options": ["ก", "ข"]})


def test_respondent_token_is_128_bit():
    t = new_respondent_token()
    assert len(t) == 32 and int(t, 16) >= 0


def test_seed_extraction_from_mermaid():
    labels = J._extract_steps("graph TD\n A[เห็นโฆษณา] --> B[ค้นหาข้อมูล]\n B --> C[ซื้อ]", "")
    assert labels[:3] == ["เห็นโฆษณา", "ค้นหาข้อมูล", "ซื้อ"]


# ---------------------------------------------------------------------------
# Submission cleaning
# ---------------------------------------------------------------------------
def _submit(**kw):
    body = dict(consent={"participation": True}, terminal="CONV", **kw)
    return J.JourneySubmit(**body)


def test_out_of_range_difficulty_is_dropped_not_coerced():
    study = make_study()
    clean = J._clean_submission(study, _submit(
        path=[{"state_id": "s1", "order": 0}],
        experience={"s1": {"difficulty_1_5": 9, "emotion": 0}}))
    assert "difficulty_1_5" not in clean["experience"].get("s1", {})


def test_unknown_state_ids_are_dropped_from_the_path():
    study = make_study()
    clean = J._clean_submission(study, _submit(
        path=[{"state_id": "s1", "order": 0}, {"state_id": "nope", "order": 1}]))
    assert [p["state_id"] for p in clean["path"]] == ["s1"]


def test_path_capped_at_twelve_transitions():
    study = make_study()
    clean = J._clean_submission(study, _submit(
        path=[{"state_id": "s1", "order": i} for i in range(20)]))
    assert len(clean["path"]) == J.MAX_PATH_STEPS


def test_mask_violation_recorded_but_data_kept():
    study = make_study()
    clean = J._clean_submission(study, _submit(
        path=[{"state_id": "s1", "order": 0}, {"state_id": "s3", "order": 1}]))
    assert clean["mask_violations"] == [["s1", "s3"]]
    assert len(clean["path"]) == 2       # nothing discarded


def test_unknown_terminal_when_respondent_cannot_say():
    study = make_study()
    body = J.JourneySubmit(consent={"participation": True}, terminal="???",
                           path=[{"state_id": "s1", "order": 0}])
    assert J._clean_submission(study, body)["terminal"] == mj.UNKNOWN


# ---------------------------------------------------------------------------
# Observed-flow map (Mermaid layer) — counted transitions, never estimates
# ---------------------------------------------------------------------------
def test_observed_flow_counts_transitions_including_self_loops():
    study = make_study()
    responses = ([resp(f"c{i}", ["s1", "s2", "s2", "s3"], "CONV", {"s1": 3}) for i in range(12)]
                 + [resp(f"a{i}", ["s1", "s2"], "ABANDON", {"s1": 4}) for i in range(8)])
    flow = J.compute_model_free(study, responses)["observed_flow"]
    edges = {(e["from"], e["to"]): e for e in flow["edges"]}
    assert edges[("START", "s1")]["count"] == 20
    assert edges[("s2", "s2")]["count"] == 12 and edges[("s2", "s2")]["self_loop"] is True
    assert edges[("s2", "ABANDON")]["count"] == 8
    assert edges[("s2", "ABANDON")]["to_terminal"] is True
    assert flow["total_transitions"] == sum(e["count"] for e in flow["edges"])


def test_observed_flow_hides_share_without_enough_exits():
    study = make_study()
    responses = [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(4)]
    flow = J.compute_model_free(study, responses)["observed_flow"]
    assert all(e["share_of_source"] is None for e in flow["edges"])
    assert all(e["thin"] is True for e in flow["edges"])   # 4 < MIN_COUNT_FOR_SOLID_EDGE


def test_observed_flow_share_is_of_source_exits_not_of_respondents():
    study = make_study()
    responses = ([resp(f"c{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(15)]
                 + [resp(f"a{i}", ["s1"], "ABANDON", {"s1": 3}) for i in range(5)])
    flow = J.compute_model_free(study, responses)["observed_flow"]
    e = next(x for x in flow["edges"] if (x["from"], x["to"]) == ("s1", "s2"))
    assert e["share_of_source"] == pytest.approx(15 / 20)
    assert e["thin"] is False


def test_observed_flow_carries_no_probability_and_no_band():
    study = make_study()
    responses = [resp(f"r{i}", ["s1", "s2", "s3"], "CONV", {"s1": 3}) for i in range(40)]
    res = J.compute_model_free(study, responses)
    flow = res["observed_flow"]
    assert "observed_flow" in res["gates"]["unlocked"]
    assert res["map"] is None and res["matrix"] is None      # the weighted map is Phase 2
    for e in flow["edges"]:
        assert set(e.keys()).isdisjoint({"probability", "ci95", "p", "smoothed"})


def test_observed_flow_nodes_cover_start_steps_and_three_terminals():
    study = make_study()
    responses = [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(10)]
    flow = J.compute_model_free(study, responses)["observed_flow"]
    kinds = [n["kind"] for n in flow["nodes"]]
    assert kinds.count("start") == 1 and kinds.count("terminal") == 3
    assert kinds.count("step") == len(study["states"])


# ---------------------------------------------------------------------------
# Touchpoints and stages — read from the customer, not declared for them
# ---------------------------------------------------------------------------
def _resp_ch(rid, path, terminal, rows, nominated=None):
    r = resp(rid, path, terminal, {sid: d for sid, (d, _) in rows.items()})
    for sid, (d, ch) in rows.items():
        r["experience"][sid]["channel"] = ch
    if nominated:
        r["pain"] = {"nominated": nominated,
                     **{sid: {"severity_0_10": 7.0, "categories": []} for sid in nominated}}
    return r


def test_touchpoints_are_counted_per_step_visit_not_per_respondent():
    study = make_study()
    study["ask_channel_per_step"] = True
    study["channel_options"] = list(ji.DEFAULT_CHANNEL_OPTIONS)
    app, shop = "แอป/เว็บไซต์", "หน้าร้าน/สถานที่จริง"
    responses = [_resp_ch(f"r{i}", ["s1", "s2"], "CONV",
                          {"s1": (2, app), "s2": (4, shop)}) for i in range(10)]
    tp = J.compute_model_free(study, responses)["touchpoints"]
    rows = {r["label"]: r for r in tp["rows"]}
    assert tp["total_visits"] == 20 and tp["measured"] is True
    assert rows[app]["n_visit"] == 10 and rows[shop]["n_visit"] == 10
    assert rows[app]["share_of_visits"] == pytest.approx(0.5)
    assert rows[app]["burden"] == pytest.approx(25.0)     # difficulty 2 -> 25
    assert rows[shop]["burden"] == pytest.approx(75.0)    # difficulty 4 -> 75
    assert "การผ่านหนึ่งขั้นของหนึ่งคน" in tp["unit_th"]


def test_touchpoint_pain_rate_uses_that_channels_visits():
    study = make_study()
    study["ask_channel_per_step"] = True
    app, shop = "แอป/เว็บไซต์", "หน้าร้าน/สถานที่จริง"
    responses = ([_resp_ch(f"p{i}", ["s1", "s2"], "CONV",
                           {"s1": (2, app), "s2": (5, shop)}, nominated=["s2"])
                  for i in range(6)]
                 + [_resp_ch(f"q{i}", ["s1", "s2"], "CONV",
                             {"s1": (2, app), "s2": (3, shop)}) for i in range(4)])
    rows = {r["label"]: r for r in J.compute_model_free(study, responses)["touchpoints"]["rows"]}
    assert rows[shop]["pain_rate"] == pytest.approx(0.6)
    assert rows[app]["pain_rate"] == pytest.approx(0.0)
    assert rows[shop]["pain_rate_ci95"] is not None


def test_touchpoints_report_not_asked_rather_than_zero():
    study = make_study()
    study["ask_channel_per_step"] = False
    responses = [resp(f"r{i}", ["s1", "s2"], "CONV", {"s1": 3}) for i in range(10)]
    tp = J.compute_model_free(study, responses)["touchpoints"]
    assert tp["measured"] is False and tp["asked"] is False and tp["rows"] == []
    assert "ยังไม่ได้ถามช่องทาง" in tp["not_measured_th"]


def test_dominant_channel_on_the_step_comes_from_respondents():
    study = make_study()
    study["ask_channel_per_step"] = True
    app, shop = "แอป/เว็บไซต์", "หน้าร้าน/สถานที่จริง"
    responses = ([_resp_ch(f"a{i}", ["s1"], "CONV", {"s1": (3, app)}) for i in range(7)]
                 + [_resp_ch(f"b{i}", ["s1"], "CONV", {"s1": (3, shop)}) for i in range(3)])
    node = J.compute_model_free(study, responses)["nodes"]["s1"]
    assert node["dominant_channel"] == app
    assert node["dominant_channel_share"] == pytest.approx(0.7)
    assert node["n_channel"] == 10


def test_unknown_channel_value_is_dropped_not_stored():
    study = make_study()
    study["channel_options"] = list(ji.DEFAULT_CHANNEL_OPTIONS)
    clean = J._clean_submission(study, J.JourneySubmit(
        consent={"participation": True}, terminal="CONV",
        path=[{"state_id": "s1", "order": 0}],
        experience={"s1": {"difficulty_1_5": 3, "channel": "ช่องทางที่ไม่มีในลิสต์"}}))
    assert "channel" not in clean["experience"]["s1"]


def test_stage_summary_reports_customer_phases():
    study = make_study()
    responses = [resp(f"r{i}", ["s1", "s2", "s4"], "CONV",
                      {"s1": 2, "s2": 2, "s4": 5}) for i in range(10)]
    rows = {r["id"]: r for r in J.compute_model_free(study, responses)["stages_summary"]["rows"]}
    assert rows["pre"]["n_reached"] == 10
    assert rows["pre"]["burden"] == pytest.approx(25.0)
    assert rows["purchase"]["n_reached"] == 10        # s4 is in the purchase stage
    assert rows["purchase"]["burden"] == pytest.approx(100.0)
    assert rows["post"]["n_reached"] == 0


def test_stage_labels_are_written_from_the_customer_side():
    joined = " ".join(s["label_th"] for s in ji.DEFAULT_STAGES)
    for phrase in ("หาข้อมูล", "ตัดสินใจ", "ใช้งาน"):
        assert phrase in joined


def test_channel_question_is_inside_the_time_budget():
    without = jb.check_design(6, 150, ask_channel_per_step=False)
    with_ch = jb.check_design(6, 150, ask_channel_per_step=True)
    assert with_ch["seconds_median"] > without["seconds_median"]
    assert with_ch["scored_items"] > without["scored_items"]
    assert with_ch["blocked"] is False       # still inside the cap at m=6
