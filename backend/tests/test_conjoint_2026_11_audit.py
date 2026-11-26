"""2026-11 conjoint audit — defects reproduced, fixed and pinned; new
practitioner/academic helpers verified against synthetic data with KNOWN
part-worths. Pure functions only: no Mongo, no LLM.

See memory/CONJOINT_AUDIT_2026_11.md for the measurements.
"""
import asyncio
import io
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from routes import conjoint as CJ  # noqa: E402
from lib import conjoint_external as EXT  # noqa: E402
from lib import conjoint_quality as Q  # noqa: E402
from lib import conjoint_export as EXP  # noqa: E402
from lib import conjoint_wtp as W  # noqa: E402
from lib import conjoint_simulator as SIM  # noqa: E402
from lib import conjoint_thesis as T  # noqa: E402

TRUE_WTP = {"Brand A": 30.0, "Brand B": 15.0, "Quality Good": 50.0}   # = −β/β_price, β_price = −0.02


def build(n_resp=200, n_sets=10, alts=3, seed=11, price_beta=-0.02, price_vals=(100, 150, 200),
          nonlinear=False, brand_sd=0.0, price_labels=None):
    attrs = [
        CJ.ConjointAttribute(id="brand", name="Brand", levels=[
            CJ.AttributeLevel(id=f"b{i}", value=v) for i, v in enumerate(["A", "B", "C"])]),
        CJ.ConjointAttribute(id="price", name="ราคา", levels=[
            CJ.AttributeLevel(id=f"p{i}", value=(price_labels[i] if price_labels else f"฿{v}"))
            for i, v in enumerate(price_vals)]),
        CJ.ConjointAttribute(id="qual", name="Quality", levels=[
            CJ.AttributeLevel(id="q0", value="Good"), CJ.AttributeLevel(id="q1", value="Bad")]),
    ]
    sets = asyncio.run(CJ.generate_d_optimal_design(attrs, alts, n_sets))
    study = {"id": "s", "title": "T", "attributes": [a.model_dump() for a in attrs],
             "choice_sets": [c.model_dump() for c in sets], "alternatives_per_set": alts,
             "demographics_to_capture": ["gender"]}
    pmap = {f"p{i}": v for i, v in enumerate(price_vals)}
    rng = np.random.default_rng(seed)
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    resps = []
    for r in range(n_resp):
        u_b = {"b0": 0.6 + brand_sd * rng.standard_normal(), "b1": 0.3, "b2": 0.0}
        ch = []
        for cs in study["choice_sets"]:
            u = []
            for p in cs["profiles"]:
                al = p["attribute_levels"]
                pr = pmap[al["price"]]
                pu = (price_beta * (pr - price_vals[0]) if not nonlinear
                      else {price_vals[0]: 0.0, price_vals[1]: -1.8, price_vals[2]: -2.0}[pr])
                u.append(u_b[al["brand"]] + pu + (1.0 if al["qual"] == "q0" else 0.0))
            u = np.array(u) + rng.gumbel(size=len(u))
            ch.append({"choice_set_id": cs["id"], "selected_profile_id": cs["profiles"][int(np.argmax(u))]["id"]})
        resps.append({"id": f"x{r}", "respondent_id": f"r{r}", "responses": ch,
                      "duration_sec": int(rng.integers(120, 300)), "demographics": {"gender": "FM"[r % 2]},
                      "submitted_at": t0 + timedelta(hours=r)})
    return study, resps


@pytest.fixture(scope="module")
def base():
    return build()


# ===========================================================================
# D1 · counting method kept unusable choice situations (sample mismatch)
# ===========================================================================
def test_counting_excludes_unusable_situations(base):
    study, resps = base
    clean = CJ.calculate_part_worths(study, resps)
    broken = [dict(r, responses=[dict(c) for c in r["responses"]]) for r in resps]
    # respondent 0 skipped task 3 (stale id) — must contribute nothing, not 3 appearances
    broken[0]["responses"][2]["selected_profile_id"] = "stale-id"
    got = CJ.calculate_part_worths(study, broken)
    expected = CJ.calculate_part_worths(
        study, [dict(broken[0], responses=[c for i, c in enumerate(broken[0]["responses"]) if i != 2])] + broken[1:])
    for aid in got:
        for lid in got[aid]["levels"]:
            assert got[aid]["levels"][lid] == expected[aid]["levels"][lid]
    total_app = sum(l["appearance_count"] for a in got.values() for l in a["levels"].values())
    total_clean = sum(l["appearance_count"] for a in clean.values() for l in a["levels"].values())
    assert total_clean - total_app == 3 * 3      # 3 alternatives × 3 attributes dropped


def test_cache_version_bumped_for_changed_values():
    assert CJ.ANALYSIS_CACHE_VERSION >= 6


# ===========================================================================
# D2 · logit methods reported unestimable levels as utility 0, like the reference
# ===========================================================================
def test_logit_part_worths_flag_reference_and_unestimable_levels(base):
    study, resps = base
    s2 = dict(study, attributes=[dict(a) for a in study["attributes"]])
    s2["attributes"][2] = dict(s2["attributes"][2], levels=list(s2["attributes"][2]["levels"]) +
                               [{"id": "q2", "value": "Premium"}])     # appended after fielding
    for fn in (CJ.calculate_mnl_analysis, CJ.calculate_hierarchical_bayes_analysis):
        res = fn(s2, resps[:80])
        q = res["part_worths"]["qual"]["levels"]
        assert q["q2"]["is_excluded"] is True and q["q2"]["is_reference"] is False
        assert q["q1"]["is_reference"] is True                   # last DECLARED level that was shown
        assert q["q0"]["is_excluded"] is False and q["q0"]["is_reference"] is False
        assert res["reference_levels"] == {"brand": "b2", "price": "p2", "qual": "q1"}
    text = CJ._summarize_results_for_thesis({"mnl": CJ.calculate_mnl_analysis(s2, resps[:80])})
    assert "Quality/Premium: utility=0.00 (ประมาณค่าไม่ได้" in text
    assert "Quality/Bad: utility=0.00 (ระดับอ้างอิง)" in text


# ===========================================================================
# D3 · MNL: no convergence flag, no CIs; thesis writer missing LR/BIC it must report
# ===========================================================================
def test_mnl_reports_convergence_and_wald_ci(base):
    study, resps = base
    m = CJ.calculate_mnl_analysis(study, resps)
    assert m["converged"] is True and m["ci_level"] == 0.95
    for k, b in m["coefficients"].items():
        se = m["std_errors"][k]
        assert m["ci_lower"][k] == pytest.approx(b - 1.959964 * se, abs=1e-6)
        assert m["ci_upper"][k] == pytest.approx(b + 1.959964 * se, abs=1e-6)
    # true dummy-price part-worths: A .6, B .3, ฿100 2.0, ฿150 1.0, Good 1.0
    truth = {"Brand_A": 0.6, "Brand_B": 0.3, "ราคา_฿100": 2.0, "ราคา_฿150": 1.0, "Quality_Good": 1.0}
    for k, t in truth.items():
        assert m["ci_lower"][k] - 0.1 < t < m["ci_upper"][k] + 0.1


def test_mnl_thesis_summary_supplies_lr_test_bic_and_ci(base):
    study, resps = base
    text = CJ._summarize_results_for_thesis({"mnl": CJ.calculate_mnl_analysis(study, resps)})
    for key in ("lr_statistic", "lr_df", "lr_p_value", "bic", "pseudo_r_squared_adj",
                "n_choice_situations", "converged", "95% CI=["):
        assert key in text, key


def test_mixed_logit_reports_convergence_and_ci(base):
    study, resps = base
    m = CJ.calculate_mixed_logit_analysis(study, resps[:80])
    assert m["converged"] in (True, False)
    k = next(iter(m["coefficients"]))
    assert m["ci_lower"][k] < m["coefficients"][k] < m["ci_upper"][k]


# ===========================================================================
# D4 · thesis Chapter 3 claimed "Full-profile, random assignment"
# ===========================================================================
def test_thesis_prompt_uses_fielded_design_facts(base):
    study, resps = base
    facts = T.design_facts(study, resps)
    demo = T.demographics_summary(study, resps)
    block = T.facts_text(facts, demo)
    _s, prompts = CJ._build_thesis_prompt("T", 200, {"mnl": {}}, ["mnl"], [3, 4, 5], facts_block=block)
    assert "random assignment" not in prompts[3].replace("ห้ามอ้างว่ามีการสุ่มแบบสอบถาม (random assignment)", "")
    assert "จำนวนชุดคำถาม (choice tasks) ต่อผู้ตอบ: 10" in prompts[3]
    assert "ไม่ได้สุ่มลำดับชุดคำถาม" in prompts[3]
    assert "ทางเลือก 'ไม่เลือก' (none option): ไม่มี" in prompts[3]
    assert "เพศ: F 100 คน (50.0%)" in prompts[4] or "เพศ: M 100 คน (50.0%)" in prompts[4]
    assert "ไม่มี holdout" in prompts[5] or "holdout" in prompts[5]


def test_thesis_prompt_without_facts_forbids_inventing_them():
    _s, prompts = CJ._build_thesis_prompt("T", 50, {"mnl": {}}, ["mnl"], [3, 4])
    assert "ห้ามระบุจำนวนชุดคำถาม" in prompts[3]
    assert "Full-profile, random assignment" not in prompts[3]


def test_design_facts_are_computed_not_asserted(base):
    study, resps = base
    f = T.design_facts(study, resps)
    assert f["n_tasks"] == 10 and f["alternatives_per_task"] == 3 and f["n_parameters_main_effects"] == 5
    assert f["n_usable_choice_situations"] == 2000
    assert f["johnson_orme_score"] == pytest.approx(200 * 10 * 3 / 3)
    # The D-efficient generator delivers level balance and no overlap where the
    # attribute has at least as many levels as there are alternatives. (A
    # 2-level attribute in 3-alternative sets must overlap in every set; the β=0
    # criterion is indifferent to which level is doubled, so 17/13 occurs.)
    for b, a in zip(f["balance"], study["attributes"]):
        if len(a["levels"]) >= 3:
            assert b["max_freq"] - b["min_freq"] <= 1 and b["sets_with_overlap"] == 0
        else:
            assert b["sets_with_overlap"] == 10 and b["min_freq"] >= 10


# ===========================================================================
# WTP
# ===========================================================================
@pytest.mark.parametrize("raw,val", [("฿1,290", 1290.0), ("59 บาท", 59.0), ("2.5k", 2500.0), ("1.290.000", 1290000.0),
                                     ("ฟรี", None), (99, 99.0), ("12,5", 12.5)])
def test_parse_price(raw, val):
    assert W.parse_price(raw) == val


def test_wtp_recovers_known_values_with_honest_intervals(base):
    study, resps = base
    w = W.calculate_wtp(study, resps)
    assert w["status"] == "ok" and w["price_attribute_id"] == "price"
    assert w["linearity_test"]["tested"] and not w["linearity_test"]["rejected"]
    got = {f"{l['attribute']} {l['level']}": l for l in w["levels"]}
    for k, truth in TRUE_WTP.items():
        l = got[k]
        assert l["ci_low"] < truth < l["ci_high"], (k, l)
        assert l["ci_low"] < l["wtp"] < l["ci_high"]
        assert l["se_delta"] > 0
    assert got["Brand C"]["is_reference"] and got["Brand C"]["wtp"] == 0.0


def test_wtp_refused_when_price_not_significant():
    study, resps = build(price_beta=0.0, seed=3)
    w = W.calculate_wtp(study, resps)
    assert w["status"] == "refused" and w["levels"] == []
    assert "ไม่คำนวณ WTP" in w["reason_th"]


def test_wtp_flags_rejected_linearity():
    study, resps = build(nonlinear=True, seed=4, n_resp=400)
    w = W.calculate_wtp(study, resps)
    assert w["linearity_test"]["rejected"] is True
    assert w["status"] == "warning" and any("เชิงเส้น" in x for x in w["warnings_th"])


def test_wtp_not_applicable_for_non_numeric_price(base):
    study, resps = build(price_labels=["ถูก", "กลาง", "แพง"], n_resp=40)
    assert W.calculate_wtp(study, resps)["status"] == "not_applicable"


def test_wtp_summary_text_only_quotes_computed_values(base):
    study, resps = base
    txt = CJ._wtp_summary_text(W.calculate_wtp(study, resps))
    assert "WILLINGNESS TO PAY" in txt and "Krinsky" in txt and "linearity LR test" in txt
    assert CJ._wtp_summary_text({"status": "not_applicable"}) == ""


# ===========================================================================
# data quality
# ===========================================================================
def test_quality_flags_known_problems(base):
    study, resps = base
    rs = [dict(r) for r in resps[:40]]
    rs[0] = dict(rs[0], duration_sec=10)                          # speeder
    cs = study["choice_sets"]
    rs[1] = dict(rs[1], responses=[{"choice_set_id": c["id"], "selected_profile_id": c["profiles"][0]["id"]}
                                   for c in cs])                  # always position 1
    rs[2] = dict(rs[2], respondent_id="dup")
    rs[3] = dict(rs[3], respondent_id="dup")
    rs[4] = dict(rs[4], respondent_email="A@x.com")
    rs[5] = dict(rs[5], respondent_email="a@x.com ")
    rs[6] = dict(rs[6], responses=rs[7]["responses"], demographics=rs[7]["demographics"],
                 submitted_at=rs[7]["submitted_at"] + timedelta(seconds=20))   # resubmit
    rep = Q.data_quality_report(study, rs)
    flags = Q.flags_by_index(rep)
    assert "speeder" in flags[0]
    assert "straightliner" in flags[1]
    assert "duplicate_id" in flags[2] and "duplicate_id" in flags[3]
    assert "duplicate_email" in flags[4] and "duplicate_email" in flags[5]
    assert "possible_duplicate" in flags[6] and "possible_duplicate" in flags[7]


def test_quality_possible_duplicate_needs_time_proximity(base):
    """Identical patterns far apart in time are NOT flagged (false-positive fix)."""
    study, resps = base
    rs = [dict(r) for r in resps[:10]]
    rs[1] = dict(rs[1], responses=rs[0]["responses"], demographics=rs[0]["demographics"])  # 1 h apart
    rep = Q.data_quality_report(study, rs)
    assert rep["counts"]["possible_duplicate"] == 0
    no_ts = [dict(r, submitted_at=None) for r in rs]
    assert Q.data_quality_report(study, no_ts)["counts"]["possible_duplicate"] == 0


# ===========================================================================
# long-format export
# ===========================================================================
def test_long_export_layout_and_codebook(base):
    study, resps = base
    header, rows = EXP.build_long_table(study, resps[:5])
    assert len(rows) == 5 * 10 * 3
    i = {h: k for k, h in enumerate(header)}
    first_task = rows[:3]
    assert [r[i["alt"]] for r in first_task] == [1, 2, 3]
    assert sum(r[i["chosen"]] for r in first_task) == 1
    assert len({r[i["situation_id"]] for r in rows}) == 50
    cb = EXP.build_codebook(study)
    assert ["Quality__code", 2, "Bad", "reference level ในแบบจำลองของระบบ (ถ้าระดับนี้ถูกแสดงจริง)"] in cb


# ===========================================================================
# simulator
# ===========================================================================
PRODS = [{"name": "P1", "levels": {"brand": "b0", "price": "p2", "qual": "q0"}},
         {"name": "P2", "levels": {"brand": "b2", "price": "p0", "qual": "q0"}},
         {"name": "P3", "levels": {"brand": "b1", "price": "p1", "qual": "q1"}}]


def test_simulator_logit_shares_match_known_truth(base):
    study, resps = base
    m = CJ.calculate_mnl_analysis(study, resps)
    out = SIM.simulate_shares(study, "mnl", m, PRODS)
    tu = np.array([0.6 - 2.0 + 1.0, 0.0 + 0.0 + 1.0, 0.3 - 1.0 + 0.0])
    truth = np.exp(tu) / np.exp(tu).sum()
    got = np.array([p["share"] for p in out["products"]])
    assert np.abs(got - truth).max() < 0.05
    assert any("IIA" in c for c in out["caveats_th"])


def test_simulator_mixed_logit_relaxes_iia():
    """Adding a twin of P1: under MNL every rival loses the same proportion; with
    heterogeneity the twin takes relatively more from P1 than from others."""
    study = build(n_resp=10)[0]
    res = {"coefficients": {"Brand_A": 0.0, "Brand_B": 0.0, "Quality_Good": 0.0},
           "std_coefficients": {"Brand_A": 3.0, "Brand_B": 0.0, "Quality_Good": 0.0}}
    a = {"name": "A1", "levels": {"brand": "b0", "price": "p0", "qual": "q0"}}
    c = {"name": "C", "levels": {"brand": "b2", "price": "p0", "qual": "q0"}}
    before = SIM.simulate_shares(study, "mixed_logit", res, [a, c], n_draws=20000)
    after = SIM.simulate_shares(study, "mixed_logit", res, [a, dict(a, name="A2"), c], n_draws=20000)
    c_before, c_after = before["products"][1]["share"], after["products"][2]["share"]
    assert c_after > c_before * (2 / 3) + 0.02        # MNL (IIA) would give exactly c_before·(2/3)


def test_simulator_refuses_meaningless_requests(base):
    study, resps = base
    m = CJ.calculate_mnl_analysis(study, resps[:60])
    with pytest.raises(SIM.SimulationError):
        SIM.simulate_shares(study, "mnl", m, PRODS, rule="first_choice")
    with pytest.raises(SIM.SimulationError):
        SIM.simulate_shares(study, "counting", m, PRODS)
    with pytest.raises(SIM.SimulationError):
        SIM.simulate_shares(study, "mnl", m, [{"name": "X", "levels": {"brand": "b0"}}, PRODS[0]])


# ===========================================================================
# external-LLM helpers
# ===========================================================================
@pytest.mark.parametrize("pasted", [
    '{"attributes": []}',
    '```json\n{"attributes": []}\n```',
    'Sure! Here it is:\n{"attributes": [],}\nLet me know.',
    '“” prefix {“attributes”: []}',
])
def test_parse_json_object_is_tolerant(pasted):
    assert EXT.parse_json_object(pasted) == {"attributes": []}


def test_parse_json_object_thai_error():
    with pytest.raises(EXT.ExternalImportError) as e:
        EXT.parse_json_object("ไม่มี JSON")
    assert "JSON" in str(e.value)


def test_disclosure_names_the_tool():
    assert "ChatGPT-5" in EXT.ai_disclosure_line("external", "ChatGPT-5")
    assert EXT.SYSTEM_LLM_LABEL in EXT.ai_disclosure_line("system", None)
    assert "ไม่ระบุชื่อ" in EXT.ai_disclosure_line("external", "")


def test_markdown_import_strips_wrapping_fence_only():
    txt = EXT.clean_markdown_import("```markdown\n## H\n" + "x" * 50 + "\n```")
    assert txt.startswith("## H") and not txt.endswith("```")


# ===========================================================================
# APA tables / no-AI document / renderer
# ===========================================================================
def test_apa_number_formatting():
    assert T.fmt_p(0.0004) == "< .001" and T.fmt_p(0.0321) == ".032" and T.fmt_p(None) == "—"
    assert T.fmt_bounded(0.2345) == ".234" or T.fmt_bounded(0.2345) == ".235"


def test_no_ai_markdown_and_docx(base):
    study, resps = base
    results = {"mnl": CJ._humanize_internal_labels(CJ.calculate_mnl_analysis(study, resps)),
               "counting": {"part_worths": CJ.calculate_part_worths(study, resps),
                            "importance_scores": CJ.calculate_importance_scores(
                                CJ.calculate_part_worths(study, resps), study)}}
    md = T.no_ai_thesis_markdown(
        facts=T.design_facts(study, resps), demo=T.demographics_summary(study, resps),
        methods=["mnl", "counting"], all_results=results,
        equations={m: CJ._get_method_equations(m) for m in ("mnl", "counting")},
        wtp=W.calculate_wtp(study, resps), quality=Q.data_quality_report(study, resps), include_figure=True)
    assert "[ตาราง 4.1: ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม]" in md
    assert "| คุณลักษณะ | ระดับ | β | SE | z | p | 95% CI |" in md
    assert "< .001" in md and "0 (อ้างอิง)" in md
    assert "[[FIGURE:importance:mnl]]" in md
    assert "ห้ามรายงาน" not in md                       # no prompt instructions leak into the document
    png = T.importance_chart_png(results["mnl"])
    assert png and png[:4] == b"\x89PNG"
    docx = CJ._create_thesis_docx("T", 200, md, "DISCLOSURE-LINE", {"importance:mnl": png})
    from docx import Document
    d = Document(io.BytesIO(docx))
    assert d.paragraphs[0].text == "DISCLOSURE-LINE"
    assert len(d.inline_shapes) == 1 and len(d.tables) >= 4


def test_renderer_still_accepts_legacy_three_argument_call():
    out = CJ._create_thesis_docx("T", 10, "## บทที่ 3\n\nข้อความ $x$")
    assert out[:2] == b"PK"
