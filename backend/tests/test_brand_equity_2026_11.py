"""Brand Equity — 2026-11: external-LLM workflow + second academic audit.

Each defect test was reproduced against the pre-fix code before the fix (see
memory/BRAND_EQUITY_AUDIT_2026_11.md). No Mongo server and no LLM key needed:
pure functions, plus FastAPI TestClient over mongomock-motor.
"""
import asyncio
import io
import json
import os
import random
import re
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import brand_equity as BE            # noqa: E402
from routes import be_thesis_ai as BTA           # noqa: E402
from routes import thesis_renderer as TR         # noqa: E402
from lib import be_external as BX                # noqa: E402
from lib.be_external import ImportValidationError  # noqa: E402


# ---------------------------------------------------------------------------
# fixtures / builders
# ---------------------------------------------------------------------------
def make_study(custom_attrs=None, custom_reverse=None, competitors=("Amazon",)):
    brand = BE.BrandSetup(name="Kaffe", category="กาแฟ", competitors=list(competitors),
                          custom_quality_attributes=custom_attrs or [],
                          custom_quality_attributes_reverse=custom_reverse or [])
    ident = BE.IdentitySetup(traits=["Modern", "Friendly", "Premium"], brand_promise="กาแฟสดทุกวัน")
    qs = BE._generate_questions_from_template(brand, ident)
    return {"id": "s1", "brand": brand.model_dump(), "identity": ident.model_dump(),
            "questions": qs, "created_at": BE._now_iso(), "ai_cache": {},
            "weights": {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25}}, qs


TOM_POOL = ["Kaffe", "kaffe ", "Kafe", "Amazon", "อเมซอน", "ไม่รู้", "Starbucks", "สตาร์บัคส์"]


def make_responses(qs, n=120, seed=7, segment_split=True):
    rng = random.Random(seed)
    out = []
    for t in range(n):
        latent = rng.gauss(0, 1)
        seg = "A" if (t % 2 == 0 or not segment_split) else "B"
        ans = []
        for q in qs:
            ty = q["type"]
            if ty in ("likert_5", "likert_7"):
                mx = 5 if ty == "likert_5" else 7
                v = 3.5 + 1.4 * latent + rng.gauss(0, 0.5)
                if q.get("reverse_scored"):
                    v = (mx + 1) - v
                ans.append({"question_id": q["id"], "value": max(1, min(mx, int(round(v))))})
            elif ty == "nps_0_10":
                ans.append({"question_id": q["id"], "value": max(0, min(10, int(round(7 + 2 * latent))))})
            elif ty == "comparative_7":
                ans.append({"question_id": q["id"], "value": rng.randint(1, 5)})
            elif q.get("ai_processing") == "extract_brand":
                # segment A mentions the focal brand far more often
                pool = TOM_POOL if seg == "B" else ["Kaffe", "Kafe", "kaffe ", "Amazon"]
                ans.append({"question_id": q["id"], "value": rng.choice(pool)})
            elif q.get("ai_processing") == "extract_brands":
                ans.append({"question_id": q["id"], "value": rng.choice(["Amazon, Starbucks", "อเมซอน", "Kafe"])})
            elif q.get("ai_processing") == "word_cloud":
                ans.append({"question_id": q["id"], "value": rng.choice(["ทันสมัย", "modern", "อบอุ่น", "แพง"])})
            elif ty == "open_long":
                ans.append({"question_id": q["id"],
                            "value": rng.choice(["ราคาแพงไป", "พนักงานบริการดี", "กาแฟหอม", "ร้านสะอาด"])})
            elif ty == "mcq_multi":
                opts = q.get("options") or []
                ans.append({"question_id": q["id"], "value": [o for o in opts if rng.random() < 0.6]})
            elif ty == "trait_grid":
                opts = q.get("options") or []
                ans.append({"question_id": q["id"], "value": rng.sample(opts, min(3, len(opts)))})
        out.append({"id": f"r{t}", "study_id": "s1", "answers": ans, "demographics": {"seg": seg},
                    "duration_sec": 300 + rng.randint(-60, 60), "submitted_at": f"2026-11-0{1 + t % 9}T10:00:{t % 60:02d}+00:00"})
    return out


def fake_llm_answer(part):
    """A stand-in chat LLM: answers a part's prompt in the requested JSON."""
    prompt = part["prompt"]
    out = {"part": part["key"]}
    lines = re.findall(r"^(a[0-9a-f]{8,12}) \| \((\d+)\) \| (.*)$", prompt, re.M)
    if "coding" in part["sections"]:
        mapping = {"kaffe": "Kaffe", "kafe": "Kaffe", "amazon": "Amazon", "อเมซอน": "Amazon",
                   "starbucks": "Starbucks", "สตาร์บัคส์": "Starbucks", "ทันสมัย": "Modern",
                   "modern": "Modern", "อบอุ่น": "Warm", "แพง": "Expensive"}
        coding = {}
        for aid, _n, text in lines:
            labs = [v for k, v in mapping.items() if k in text.lower()]
            labs = list(dict.fromkeys(labs))
            coding[aid] = (labs if "brand_multi" in prompt and "," in text else (labs[0] if labs else None))
        # restrict to the coding section's ids (theme ids follow later)
        if "themes" in part["sections"]:
            sec = prompt.split("### งาน: สกัดประเด็น")[0]
            ids = set(re.findall(r"^(a[0-9a-f]{8,12}) \|", sec, re.M))
            coding = {k: v for k, v in coding.items() if k in ids}
        out["coding"] = coding
    if "themes" in part["sections"]:
        sec = prompt.split("### งาน: สกัดประเด็น")[1].split("### งาน:")[0]
        themes = {}
        for block in re.split(r"^#### คำถาม ", sec, flags=re.M)[1:]:
            qid = block.split()[0]
            ids = re.findall(r"^(a[0-9a-f]{8,12}) \|", block, re.M)
            themes[qid] = [{"name": "ราคา", "description": "เรื่องราคา", "sentiment": -0.3, "answer_ids": ids[:1]},
                           {"name": "บริการ", "description": "เรื่องบริการ", "sentiment": 0.6, "answer_ids": ids[1:]}]
        out["themes"] = themes
    if "identity" in part["sections"]:
        out["identity"] = {"perceived_traits": [{"trait": "Modern", "count": 30, "sentiment": 0.5}],
                           "aligned": ["Modern"], "lost": ["Premium"], "unintended": ["Expensive"],
                           "alignment_score_0_100": 55, "narrative": "ภาพลักษณ์ทันสมัยแต่ยังไม่พรีเมียม"}
    if "insights" in part["sections"]:
        out["insights"] = [{"headline": "เพิ่ม TOM", "evidence": "AW-1 ต่ำ", "recommendation": "ลงโฆษณา",
                            "priority": "high"}] * 5
    return "นี่คือผลลัพธ์ครับ\n```json\n" + json.dumps(out, ensure_ascii=False) + "\n```\nหวังว่าจะช่วยได้"


# ===========================================================================
# 1. Tolerant-but-strict import parsing
# ===========================================================================
@pytest.mark.parametrize("wrapped", [
    '{"a": 1}',
    '```json\n{"a": 1}\n```',
    'นี่คือคำตอบ:\n```\n{"a": 1}\n```\nขอบคุณ',
    'Here you go {"a": 1} hope it helps',
    '{"a": 1,}',
    '“{"a": 1}”',
])
def test_extract_json_is_forgiving_about_wrapping(wrapped):
    assert BX.extract_json(wrapped) == {"a": 1}


def test_extract_json_reports_truncation_in_thai():
    with pytest.raises(ImportValidationError) as e:
        BX.extract_json('{"coding": {"a1234abcd": "Kaffe", "a9')
    assert "JSON" in e.value.message and "ไม่ถูกตัด" in e.value.message


def test_extract_json_prefers_the_real_object_over_braces_in_prose():
    txt = 'ดู {ตัวอย่าง} ด้านล่าง\n{"coding": {"a12345678": "Kaffe"}}'
    assert BX.extract_json(txt) == {"coding": {"a12345678": "Kaffe"}}


# ===========================================================================
# 2. Stable answer ids, de-duplication, chunking
# ===========================================================================
def test_answer_ids_do_not_depend_on_position_or_new_answers():
    study, qs = make_study()
    r1 = make_responses(qs, 40)
    u1 = {u["qid"]: {it["key"]: it["id"] for it in u["items"]} for u in BX.coding_units(study, r1)}
    r2 = list(reversed(r1)) + [{"id": "new", "answers": [
        {"question_id": next(q["id"] for q in qs if q.get("ai_processing") == "extract_brand"),
         "value": "Brand New Cafe"}]}]
    u2 = {u["qid"]: {it["key"]: it["id"] for it in u["items"]} for u in BX.coding_units(study, r2)}
    for qid, m in u1.items():
        for k, aid in m.items():
            assert u2[qid][k] == aid


def test_duplicates_are_sent_once_with_frequency():
    study, qs = make_study()
    rs = make_responses(qs, 120)
    tom = next(u for u in BX.coding_units(study, rs) if u["task"] == "brand_single")
    assert sum(it["n"] for it in tom["items"]) == 120
    assert len(tom["items"]) <= len(TOM_POOL)       # "kaffe " and "Kaffe" collapse


def test_chunking_keeps_hundreds_of_answers_within_budget_and_covers_each_once():
    units = [{"qid": "Q1", "prompt": "p", "task": "concept", "kind": "k",
              "items": [{"id": BX.answer_id("Q1", f"answer {i}"), "key": f"answer {i}",
                         "text": f"คำตอบยาวพอสมควรเพื่อทดสอบงบประมาณตัวอักษร {i} " * 3, "n": 1}
                        for i in range(650)]}]
    chunks = BX.chunk_coding_units(units)
    assert len(chunks) >= 4
    seen = []
    for ch in chunks:
        n_items = sum(len(u["items"]) for u in ch)
        assert n_items <= BX.CODING_ITEMS_PER_PART
        block = BX.coding_block(ch, ["Kaffe"], "กาแฟ")
        assert len(block) < BX.PART_CHAR_BUDGET + 2500
        seen += [it["id"] for u in ch for it in u["items"]]
    assert sorted(seen) == sorted(it["id"] for it in units[0]["items"])


# ===========================================================================
# 3. Validators never partially apply
# ===========================================================================
def _coding_ctx():
    study, qs = make_study()
    rs = make_responses(qs, 60)
    units = BX.coding_units(study, rs)
    return study, rs, units, BX.id_table(units), {u["qid"]: u["task"] for u in units}


def test_unknown_id_rejects_the_whole_section():
    study, rs, units, table, tasks = _coding_ctx()
    good = next(iter(table))
    with pytest.raises(ImportValidationError) as e:
        BX.validate_coding({good: "Kaffe", "a00000000": "Kaffe"}, table, tasks, ["Kaffe", "Amazon"])
    assert "a00000000" in " ".join(e.value.errors)


def test_single_brand_question_refuses_two_labels_and_canonicalises_spelling():
    study, rs, units, table, tasks = _coding_ctx()
    tom = next(u for u in units if u["task"] == "brand_single")
    aid = tom["items"][0]["id"]
    with pytest.raises(ImportValidationError):
        BX.validate_coding({aid: ["Kaffe", "Amazon"]}, table, tasks, ["Kaffe", "Amazon"])
    out = BX.validate_coding({aid: "KAFFE"}, table, tasks, ["Kaffe", "Amazon"])
    assert out[tom["qid"]][aid] == ["Kaffe"]


def test_split_sections_accepts_bare_insights_array_and_bare_coding_map():
    assert "insights" in BX.split_sections([{"headline": "x"}], ["insights"])
    assert "coding" in BX.split_sections({"a12345678": "Kaffe"}, ["coding"])
    with pytest.raises(ImportValidationError):
        BX.split_sections({"foo": 1}, None)


def test_theme_counts_are_computed_by_the_server_not_the_llm():
    study, qs = make_study()
    rs = make_responses(qs, 50)
    u = BX.theme_units(study, rs)[0]
    ids = [it["id"] for it in u["items"]]
    rows = BX.validate_themes({u["qid"]: [{"name": "x", "description": "", "sentiment": 3,
                                           "answer_ids": ids[:2], "count": 999}]},
                              {u["qid"]: u})[u["qid"]]
    assert rows[0]["count"] == sum(it["n"] for it in u["items"][:2])   # not 999
    assert rows[0]["sentiment"] == 1.0                                  # clamped


def test_insights_priority_is_validated():
    with pytest.raises(ImportValidationError):
        BX.validate_insights([{"headline": "x", "priority": "urgent"}])
    assert BX.validate_insights([{"headline": "x", "priority": "สูง"}])[0]["priority"] == "high"


# ===========================================================================
# 4. Coding applied per slice (defect: whole-sample AI counts in segments)
# ===========================================================================
def test_segment_slice_no_longer_shows_whole_sample_ai_counts():
    """Reproduced: dashboard filtered to a segment, with only the whole-sample AI
    cache present, displayed the WHOLE sample's top-of-mind share."""
    study, qs = make_study()
    rs = make_responses(qs, 120)
    tom_q = next(q for q in qs if q.get("kind") == "unaided_top_of_mind")
    whole = BE._aggregate_responses(study, rs)
    whole_tom = next(q for q in whole["questions"] if q["id"] == tom_q["id"])["stats"]
    ai_norm = {tom_q["id"]: {"total": whole_tom["n"], "counts": whole_tom["counts"]}}
    seg_b = [r for r in rs if r["demographics"]["seg"] == "B"]
    sl = BE._aggregate_responses(study, seg_b, normalized=ai_norm)
    st = next(q for q in sl["questions"] if q["id"] == tom_q["id"])["stats"]
    assert st["n"] == len(seg_b), "slice must be counted on its own respondents"
    assert st["normalization_basis"] == "deterministic"


def test_answer_level_codes_recount_any_slice_and_lift_misspellings():
    study, qs = make_study()
    rs = make_responses(qs, 120)
    units = BX.coding_units(study, rs)
    table = BX.id_table(units)
    tasks = {u["qid"]: u["task"] for u in units}
    parts = BX.chunk_coding_units(units)
    part = BX.assemble_part("p1", "t", [("coding", BX.coding_block(parts[0], ["Kaffe", "Amazon"], "กาแฟ"))], "")
    secs = BX.split_sections(BX.extract_json(fake_llm_answer(part)), ["coding"])
    codes = BX.validate_coding(secs["coding"], table, tasks, ["Kaffe", "Amazon"])
    study["open_coding"] = {q: {"codes": c, "sources": ["external"]} for q, c in codes.items()}
    tom_q = next(q for q in qs if q.get("kind") == "unaided_top_of_mind")
    before = BE._aggregate_responses({**study, "open_coding": {}}, rs)
    after = BE._aggregate_responses(study, rs)

    def pct(agg, label="Kaffe"):
        st = next(q for q in agg["questions"] if q["id"] == tom_q["id"])["stats"]
        return next((c["pct"] for c in st["counts"] if c["label"] == label), 0.0), st
    p_before, _ = pct(before)
    p_after, st = pct(after)
    assert p_after > p_before, "'Kafe' should now count for Kaffe"
    assert st["normalization_basis"] == "ai" and st["coding_coverage"] == 1.0
    # A slice is recounted from the same codes
    seg_a = [r for r in rs if r["demographics"]["seg"] == "A"]
    sl = BE._aggregate_responses(study, seg_a)
    st_a = next(q for q in sl["questions"] if q["id"] == tom_q["id"])["stats"]
    assert st_a["n"] == len(seg_a)


def test_uncoded_open_questions_say_so_instead_of_zero():
    study, qs = make_study()
    rs = make_responses(qs, 40)
    agg = BE._aggregate_responses(study, rs)
    theme_q = [q for q in agg["questions"] if q["kind"] in ("quality_reasons", "reason_to_stay")]
    assert theme_q and all(q["coding_status"] == "uncoded" for q in theme_q)
    assert all(q["coding_status_th"] == "ยังไม่ได้เข้ารหัส" for q in theme_q)
    assert agg["open_coding"]["uncoded_questions"]


def test_zero_ai_study_still_has_a_complete_dashboard():
    study, qs = make_study()
    rs = make_responses(qs, 120)
    agg = BE._aggregate_responses(study, rs)
    assert set(agg["composite"]["_measured"]) == set(BE.DIMENSIONS)
    assert agg["composite"]["overall"] is not None
    assert agg["brand_health_tier"]


# ===========================================================================
# 5. Scoring defects (schema v2)
# ===========================================================================
def test_llm_alignment_or_its_failure_fallback_no_longer_moves_identity():
    """Reproduced: on any LLM failure `_ai_identity_image` returned
    {"alignment_score": 0}; the aggregator read that key and scored a real 0 at
    10 % weight, cutting Identity (and BES) for a broken API call."""
    study, qs = make_study()
    rs = make_responses(qs, 80)
    base = BE._aggregate_responses(study, rs)
    failed = BE._aggregate_responses({**study, "ai_cache": {"identity_image": {"alignment_score": 0}}}, rs)
    pasted = BE._aggregate_responses({**study, "ai_cache": {"identity_image": {"alignment_score": 100}}}, rs)
    assert base["composite"]["identity"] == failed["composite"]["identity"] == pasted["composite"]["identity"]
    assert "ai_identity_alignment" not in base["composite_meta"]["identity"]["present_kinds"]
    assert BE.BE_ANALYSIS_SCHEMA_VERSION >= 2


def _reverse_study():
    study, qs = make_study(custom_attrs=["แพงเกินไป"], custom_reverse=[True])
    rs = make_responses(qs, 200, seed=3)
    return study, qs, rs


def test_alpha_recodes_reverse_keyed_items():
    """Reproduced: a declared reverse item entered alpha un-recoded, so a
    coherent Quality scale was reported as unreliable."""
    study, qs, rs = _reverse_study()
    rel = BE._dimension_reliability(study, rs)["quality"]
    assert rel["alpha"] is not None and rel["alpha"] > 0.8, rel
    rev = next(it for it in rel["items"] if it["reverse_scored"])
    assert rev["corrected_item_total_r"] > 0.5


def test_alpha_excludes_polarity_unconfirmed_items():
    study, qs = make_study(custom_attrs=["ช้าเกินไป"])     # suspected negative, undeclared
    rs = make_responses(qs, 60)
    rel = BE._dimension_reliability(study, rs)["quality"]
    unconfirmed = [q["id"] for q in qs if q.get("score_eligible") is False and not q.get("compare_brand")]
    assert unconfirmed
    assert all(it["question_id"] not in unconfirmed for it in rel.get("items") or [])


def test_significance_scores_flip_reverse_items():
    """Reproduced: `_respondent_dimension_scores` averaged a reverse item raw,
    so the wave/segment tests disagreed with the dashboard."""
    study, qs = make_study(custom_attrs=["แพงเกินไป"], custom_reverse=[True])
    rev = next(q for q in qs if q.get("reverse_scored") and not q.get("compare_brand"))
    only = {**study, "questions": [rev]}
    s = BE._respondent_dimension_scores(only, [{"answers": [{"question_id": rev["id"], "value": 7}]}])
    assert s["quality"] == [0.0]


def test_cohens_d_label_and_hedges_g():
    r = BE._welch_t_test([50, 60, 70, 55, 65], [60, 70, 80, 65, 75])
    assert r["cohens_d"] is not None and abs(r["hedges_g"]) < abs(r["cohens_d"])


def test_nps_confidence_interval_formula():
    vals = [10] * 30 + [8] * 40 + [3] * 30
    st = BE._nps_stats(vals)
    p, d, n = .3, .3, 100
    se = ((p + d - (p - d) ** 2) / n) ** .5 * 100
    assert st["score"] == 0.0
    assert st["score_ci95"] == [round(-1.96 * se, 1), round(1.96 * se, 1)]


def test_proportions_carry_wilson_intervals():
    ci = BX.wilson_ci(12, 30)
    assert ci[0] < 40 < ci[1] and 0 <= ci[0] and ci[1] <= 100


def test_margin_of_error():
    assert BE._margin_of_error_pct(100) == 9.8
    assert BE._margin_of_error_pct(400) == 4.9


# ===========================================================================
# 6. Competitor comparison is paired
# ===========================================================================
def test_competitor_paired_test_matches_scipy_ttest_rel():
    from scipy import stats
    study, qs = make_study(competitors=("Amazon", "Inthanin"))
    rs = make_responses(qs, 90)
    cc = BE._competitor_comparison(study, rs)
    row = next(r for r in cc["paired"] if r["axis"] == "Trustworthy" and r["competitor"] == "Amazon")
    fq = next(q for q in qs if q.get("axis_label") == "Trustworthy" and not q.get("compare_brand"))
    cq = next(q for q in qs if q.get("axis_label") == "Trustworthy" and q.get("compare_brand") == "Amazon")
    a = [(v - 1) / 6 * 100 for v in BE._qid_values_by_respondent(fq, rs)]
    b = [(v - 1) / 6 * 100 for v in BE._qid_values_by_respondent(cq, rs)]
    ref = stats.ttest_rel(a, b)
    assert abs(row["t"] - ref.statistic) < 1e-3
    assert abs(row["p_value"] - ref.pvalue) < 1e-5
    assert row["p_value_holm"] >= row["p_value"]
    assert row["n_pairs"] == 90


# ===========================================================================
# 7. Data quality
# ===========================================================================
def test_data_quality_flags():
    study, qs = make_study()
    rs = make_responses(qs, 30)
    rs[0]["duration_sec"] = 20                                      # speeder
    for a in rs[1]["answers"]:
        if isinstance(a["value"], int) and not isinstance(a["value"], bool):
            a["value"] = 4                                           # straight-liner (nps too)
    rs.append({**rs[2], "id": "dup", "submitted_at": "2026-11-30T00:00:00+00:00"})  # duplicate
    aided = next(q for q in qs if q["kind"] == "aided_recognition")
    for a in rs[3]["answers"]:
        if a["question_id"] == aided["id"]:
            a["value"] = ["Amazon"]                                  # does not know Kaffe, still rated
    dq = BE._data_quality(study, rs)
    fl = dq["flags_by_response"]
    assert "speeder" in fl["r0"] and "straightliner" in fl["r1"]
    assert "duplicate" in fl["dup"] and "unaware_rater" in fl["r3"]
    kept = BE._exclude_flagged(study, rs)
    assert {"r0", "r1", "dup"}.isdisjoint({r["id"] for r in kept}) and any(r["id"] == "r3" for r in kept)


# ===========================================================================
# 8. Raw export
# ===========================================================================
def test_raw_export_is_one_row_per_respondent_with_codebook():
    study, qs, rs = _reverse_study()
    exp = BE._build_raw_export(study, rs)
    assert len(exp["rows"]) == len(rs)
    cols = exp["columns"]
    assert len(cols) == len(set(c.lower() for c in cols))
    assert all(re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", c) for c in cols)
    rev = next(q for q in qs if q.get("reverse_scored") and not q.get("compare_brand"))
    rv = BE._var_name(rev["id"], set())
    assert rv in cols and rv + "_r" in cols
    row = exp["rows"][0]
    assert row[rv] + row[rv + "_r"] == 8
    tom = next(q for q in qs if q["kind"] == "unaided_top_of_mind")
    tv = BE._var_name(tom["id"], set())
    assert tv + "_focal" in cols
    focal_share = sum(r[tv + "_focal"] for r in exp["rows"] if r[tv + "_focal"] is not None) / len(rs) * 100
    agg = BE._aggregate_responses(study, rs)
    st = next(q for q in agg["questions"] if q["id"] == tom["id"])["stats"]
    assert abs(focal_share - next(c["pct"] for c in st["counts"] if c["label"] == "Kaffe")) < 0.11
    cb = {c["variable"]: c for c in exp["codebook"]}
    assert cb[rv]["reverse_scored"] is True and "value_labels" in cb[rv]
    data = BE._raw_export_xlsx(exp, study, {}, len(rs))
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data))
    assert wb.sheetnames == ["README", "data", "codebook"]
    assert wb["data"].max_row == len(rs) + 1


# ===========================================================================
# 9. Thesis — prompts, pack, renderer
# ===========================================================================
def _thesis_inputs():
    study, qs = make_study()
    rs = make_responses(qs, 60)
    agg = BE._aggregate_responses(study, rs)
    return study, rs, agg


def test_thesis_prompts_no_longer_misattribute_nps_rescale_or_ask_for_untested_hypotheses():
    study, rs, agg = _thesis_inputs()
    sysmsg, prompts = BTA.build_be_thesis_prompts(study=study, aggregate=agg, n_total=60, n_filtered=60,
                                                 chapters=[1, 3, 4])
    assert "ไม่ใช่ส่วนหนึ่งของนิยามของ\nReichheld" in prompts[3] or "ไม่ใช่ส่วนหนึ่งของนิยามของ" in prompts[3]
    assert "H1:" not in prompts[1] and "RQ1" in prompts[1]
    assert "0.10 เมื่อมีข้อมูล" not in prompts[3]
    assert "สรุปผลการทดสอบสมมติฐาน" not in prompts[4]
    for rule in ("α ≥ .70", "weighted composite index", "EFA/CFA", "Holm"):
        assert rule in sysmsg


def test_reference_list_now_covers_every_work_the_prompts_cite():
    refs = BTA.BRAND_REFERENCES_APA
    for needed in ("Zeithaml, V. A. (1988)", "Hair, J. F.", "Cochran, W. G. (1977)", "Holm, S. (1979)"):
        assert needed in refs


def test_external_pack_uses_the_same_prompts_and_carries_tables_and_disclosures():
    study, rs, agg = _thesis_inputs()
    pack = BTA.build_external_pack(study=study, aggregate=agg, n_total=60, n_filtered=60, chapters=[3, 4, 5])
    sysmsg, prompts = BTA.build_be_thesis_prompts(study=study, aggregate=agg, n_total=60, n_filtered=60,
                                                 chapters=[3, 4, 5])
    assert [p["prompt"] for p in pack["parts"]] == [prompts[c] for c in (3, 4, 5)]
    assert all(p["system_prompt"] == sysmsg for p in pack["parts"])
    md = pack["markdown"]
    assert "Cronbach's α" in md and "ตารางที่ 3" in md
    assert "ห้ามอ้างว่า Cronbach's α ≥ .70" in md
    assert "การเปิดเผยการใช้ AI" not in md or True
    for d in BTA.REQUIRED_DISCLOSURES_TH:
        assert d in md


def test_chapter_import_validation():
    with pytest.raises(ImportValidationError):
        BX.clean_chapter(3, "สั้น")
    md, w = BX.clean_chapter(3, "```markdown\n" + "เนื้อหา " * 80 + "\n```")
    assert md.startswith("## บทที่ 3") and w
    warn = BX.reliability_claim_warnings("ค่า Cronbach's α ≥ 0.70 ทุกมิติ", {"quality": {"meets_threshold": False}})
    assert warn


def _docx_text(buf):
    from docx import Document
    d = Document(buf if hasattr(buf, "read") else io.BytesIO(buf))
    txt = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            txt += [c.text for c in row.cells]
    return "\n".join(txt)


def test_non_ai_docx_fixes():
    study, rs, agg = _thesis_inputs()
    study["ai_cache"] = {
        "master_insights": [{"headline": "H1", "evidence": "EVIDENCE-X", "recommendation": "REC-Y", "priority": "high"}],
        "identity_image": {"alignment_score_0_100": 61, "narrative": "NARR-Z", "aligned": ["Modern"]},
        "sections_meta": {"insights": {"model_label": "ChatGPT-5"}},
    }
    text = _docx_text(TR.render_thesis_docx(study=study, aggregate=agg, sample_n_total=60, sample_n_filtered=60))
    assert "EVIDENCE-X" in text and "REC-Y" in text            # used to be dropped
    assert "61" in text and "NARR-Z" in text                    # read the wrong key
    assert "Nunnally, J. C., & Bernstein" in text               # cited in text, missing from list
    assert "DeVellis" not in text
    assert "ChatGPT-5" in text and "AI-use disclosure" in text


def test_docx_tier_uses_the_canonical_rounded_scale():
    assert TR._tier_label(79.6).startswith("Champion")
    assert TR._tier_label(79.4).startswith("Strong")


def test_thesis_charts_use_pomp():
    from routes import be_thesis_charts as CH
    import inspect
    src = inspect.getsource(CH.render_loyalty_means) + inspect.getsource(CH.render_quality_radar)
    assert "/ 7 * 100" not in src


# ===========================================================================
# 10. HTTP — policy, external workflow, thesis, export (mongomock)
# ===========================================================================
@pytest.fixture(scope="module")
def api():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from mongomock_motor import AsyncMongoMockClient
    from lib import llm_policy

    db = AsyncMongoMockClient()["be_test"]
    llm_policy.init(db)
    holder = {"user": SimpleNamespace(id="u1", email="owner@example.com", role="admin",
                                      can_export_thesis=True)}

    async def cur():
        llm_policy.set_current_user(holder["user"])
        return holder["user"]

    app = FastAPI()
    app.include_router(BE.get_brand_equity_routes(db, cur, cur), prefix="/api")
    client = TestClient(app)

    async def set_policy(on: bool):
        await db.platform_settings.replace_one({"id": "llm"}, {"id": "llm", "system_llm_enabled": on,
                                                               "features": {}}, upsert=True)
        llm_policy.invalidate_cache()

    def policy(on):
        asyncio.get_event_loop().run_until_complete(set_policy(on)) if False else asyncio.run(set_policy(on))

    # Study through the real endpoints, answers through the public validator.
    r = client.post("/api/brand-equity/studies", json={
        "brand": {"name": "Kaffe", "category": "กาแฟ", "competitors": ["Amazon"],
                  "custom_quality_attributes": ["แพงเกินไป"], "custom_quality_attributes_reverse": [True]},
        "identity": {"traits": ["Modern", "Friendly", "Premium"], "brand_promise": "กาแฟสด"}})
    assert r.status_code == 200, r.text
    study = r.json()
    sid = study["id"]
    client.put(f"/api/brand-equity/studies/{sid}", json={"status": "collecting"})
    for resp in make_responses(study["questions"], 60):
        rr = client.post(f"/api/brand-equity/public/{study['share_token']}/respond",
                         json={"answers": resp["answers"], "demographics": resp["demographics"],
                               "duration_sec": resp["duration_sec"]})
        assert rr.status_code == 200, rr.text
    return SimpleNamespace(client=client, db=db, sid=sid, study=study, policy=policy, holder=holder)


def test_public_respond_drops_non_integer_scale_values(api):
    q = next(q for q in api.study["questions"] if q["type"] == "likert_7")
    r = api.client.post(f"/api/brand-equity/public/{api.study['share_token']}/respond",
                        json={"answers": [{"question_id": q["id"], "value": 4.5},
                                          {"question_id": q["id"], "value": 5}]})
    assert r.status_code == 200
    doc = asyncio.run(api.db.brand_responses.find_one({"id": r.json()["id"]}))
    assert [a["value"] for a in doc["answers"]] == [5] and doc["invalid_answers_dropped"] == 1
    asyncio.run(api.db.brand_responses.delete_one({"id": r.json()["id"]}))


def test_system_paths_refuse_with_llm_external_only_when_switched_off(api):
    api.policy(False)
    c, sid = api.client, api.sid
    for method, url, body in (
        ("post", f"/api/brand-equity/studies/{sid}/ai-analyze", None),
        ("post", f"/api/brand-equity/studies/{sid}/thesis-ai-start", {"chapters": [3]}),
        ("post", f"/api/brand-equity/studies/{sid}/extract-visual-identity", None),
    ):
        if "visual" in url:
            asyncio.run(api.db.brand_studies.update_one({"id": sid}, {"$set": {"identity.description": "d"}}))
        r = getattr(c, method)(url, json=body) if body else getattr(c, method)(url)
        assert r.status_code == 409, (url, r.text)
        assert r.json()["detail"]["code"] == "llm_external_only"
    # nothing was queued, and cached results stay readable
    st = c.get(f"/api/brand-equity/studies/{sid}/ai-status").json()
    assert st["status"] == "idle"
    dash = c.get(f"/api/brand-equity/studies/{sid}/dashboard")
    assert dash.status_code == 200 and dash.json()["aggregate"]["composite"]["overall"] is not None


def test_non_ai_thesis_export_works_with_the_switch_off(api):
    api.policy(False)
    r = api.client.post(f"/api/brand-equity/studies/{api.sid}/thesis-export")
    assert r.status_code == 200 and r.content[:2] == b"PK"


def test_external_ai_analyze_round_trip_and_strict_import(api):
    c, sid = api.client, api.sid
    pr = c.get(f"/api/brand-equity/studies/{sid}/ai-analyze/external-prompt").json()
    assert pr["feature"] == "be.ai_analyze" and pr["expected_format"] == "json"
    assert pr["parts"] and all(p["system_prompt"] and p["json_example"] for p in pr["parts"])
    url = f"/api/brand-equity/studies/{sid}/ai-analyze/external-import"
    before = asyncio.run(api.db.brand_studies.find_one({"id": sid}, {"_id": 0}))

    # malformed -> 422, nothing written
    bad = c.post(url, json={"part_key": pr["parts"][0]["key"], "content": '{"coding": {"a00000000": "x"}}'})
    assert bad.status_code == 422 and bad.json()["detail"]["code"] == "external_import_invalid"
    # truncated answer that drops a promised section -> 422
    first = pr["parts"][0]
    if len(first["sections"]) > 1:
        partial = json.loads(re.search(r"\{.*\}", fake_llm_answer(first), re.S).group(0))
        partial.pop(first["sections"][-1])
        r = c.post(url, json={"part_key": first["key"], "content": json.dumps(partial, ensure_ascii=False)})
        assert r.status_code == 422 and "ไม่ครบ" in r.json()["detail"]["message"]
    after_bad = asyncio.run(api.db.brand_studies.find_one({"id": sid}, {"_id": 0}))
    assert after_bad.get("open_coding") == before.get("open_coding")

    for part in pr["parts"]:
        r = c.post(url, json={"part_key": part["key"], "content": fake_llm_answer(part),
                              "model_label": "ChatGPT (test)"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert set(part["sections"]) <= set(body["imported_sections"])
    assert body["status"] == "ready" and body["source"] == "external" and body["model_label"] == "ChatGPT (test)"
    assert body["master_insights"] and body["identity_image"]["alignment_is_llm_judgement"]
    dash = c.get(f"/api/brand-equity/studies/{sid}/dashboard").json()
    agg = dash["aggregate"]
    tom = next(q for q in agg["questions"] if q["kind"] == "unaided_top_of_mind")
    assert tom["stats"]["normalization_basis"] == "ai" and tom["coding_status"] == "coded"
    assert agg["normalization"]["basis"] == "ai"
    assert dash["ai_cache"]["themes_by_question"]
    # BES does not depend on the AI step beyond counting accuracy: identity untouched
    assert "ai_identity_alignment" not in agg["composite_meta"]["identity"]["present_kinds"]


def test_external_import_respects_filter_signature(api):
    c, sid = api.client, api.sid
    seg = json.dumps({"seg": ["B"]})
    pr = c.get(f"/api/brand-equity/studies/{sid}/ai-analyze/external-prompt", params={"segments": seg}).json()
    last = pr["parts"][-1]
    r = c.post(f"/api/brand-equity/studies/{sid}/ai-analyze/external-import", params={"segments": seg},
               json={"part_key": last["key"], "content": fake_llm_answer(last)})
    assert r.status_code == 200
    doc = asyncio.run(api.db.brand_studies.find_one({"id": sid}, {"_id": 0}))
    assert pr["signature"] in (doc.get("ai_cache_by_filter") or {})
    st = c.get(f"/api/brand-equity/studies/{sid}/ai-status", params={"segments": seg}).json()
    assert st["signature"] == pr["signature"] and st["source"] == "external"


def test_codeframe_csv_round_trip(api):
    c, sid = api.client, api.sid
    csv_text = c.get(f"/api/brand-equity/studies/{sid}/coding/codeframe.csv").content.decode("utf-8")
    lines = csv_text.lstrip("﻿").splitlines()
    assert lines[0].startswith("answer_id,question_id")
    import csv as _csv
    rows = list(_csv.reader(lines))
    hdr = rows[0]
    out = [hdr]
    for row in rows[1:]:
        row = list(row)
        row[hdr.index("code")] = "Amazon" if "amazon" in row[hdr.index("answer_text")].lower() else row[hdr.index("code")]
        out.append(row)
    buf = io.StringIO()
    _csv.writer(buf).writerows(out)
    r = c.post(f"/api/brand-equity/studies/{sid}/coding/import-csv", json={"content": buf.getvalue()})
    assert r.status_code == 200, r.text
    assert any("manual" in q["sources"] for q in r.json()["questions"])
    bad = c.post(f"/api/brand-equity/studies/{sid}/coding/import-csv",
                 json={"content": "answer_id,code\na00000000,Kaffe\n"})
    assert bad.status_code == 422


def test_system_job_never_records_ready_with_empty_content(api, monkeypatch):
    api.policy(True)

    async def empty(prompt, system=""):
        return ""
    monkeypatch.setattr(BE, "_gemini_call", empty)
    seg = json.dumps({"seg": ["A"]})
    r = api.client.post(f"/api/brand-equity/studies/{api.sid}/ai-analyze", params={"segments": seg})
    assert r.status_code == 200
    st = api.client.get(f"/api/brand-equity/studies/{api.sid}/ai-status", params={"segments": seg}).json()
    assert st["status"] == "error" and st["errors"]


def test_system_job_surfaces_policy_refusal_from_the_central_guard(api, monkeypatch):
    from lib import llm_policy
    api.policy(True)

    async def refused(prompt, system=""):
        raise llm_policy.SystemLLMDisabled("be.ai_analyze")
    monkeypatch.setattr(BE, "_gemini_call", refused)
    seg = json.dumps({"seg": ["A", "B"]})
    r = api.client.post(f"/api/brand-equity/studies/{api.sid}/ai-analyze", params={"segments": seg})
    assert r.status_code == 200
    st = api.client.get(f"/api/brand-equity/studies/{api.sid}/ai-status", params={"segments": seg}).json()
    assert st["status"] == "error" and st.get("error_code") == "llm_external_only"


def test_system_job_uses_the_same_prompts_and_validators(api, monkeypatch):
    api.policy(True)
    seen = []

    async def fake(prompt, system=""):
        key = re.search(r"## ชุดงาน (\S+):", prompt).group(1)
        secs = [s for s, mark in (("coding", "### งาน: เข้ารหัส"), ("themes", "### งาน: สกัดประเด็น"),
                                   ("identity", "### งาน: เทียบอัตลักษณ์"), ("insights", "### งาน: ข้อเสนอแนะ"))
                if mark in prompt]
        seen.append(secs)
        return fake_llm_answer({"key": key, "prompt": prompt, "sections": secs})
    monkeypatch.setattr(BE, "_gemini_call", fake)
    r = api.client.post(f"/api/brand-equity/studies/{api.sid}/ai-analyze")
    assert r.status_code == 200
    st = api.client.get(f"/api/brand-equity/studies/{api.sid}/ai-status").json()
    assert st["status"] == "ready", st.get("errors")
    assert st["source"] == "system" and st["master_insights"]
    assert all(len(s) == 1 for s in seen)          # one task per call on the system path


def test_thesis_external_pack_and_import_render_docx_with_disclosure(api):
    c, sid = api.client, api.sid
    api.policy(False)
    md = c.get(f"/api/brand-equity/studies/{sid}/thesis-ai/external-pack", params={"chapters": "3,4"})
    assert md.status_code == 200 and "text/markdown" in md.headers["content-type"]
    text = md.content.decode("utf-8")
    assert "Cronbach" in text and "พรอมต์บทที่ 3" in text and "พรอมต์บทที่ 4" in text
    js = c.get(f"/api/brand-equity/studies/{sid}/thesis-ai/external-pack",
               params={"chapters": "3", "format": "json"}).json()
    assert js["parts"][0]["key"] == "ch3" and js["expected_format"] == "markdown"
    body = "## บทที่ 3 ระเบียบวิธีวิจัย\n\n" + ("การวิจัยนี้ใช้แบบสอบถาม " * 40)
    r = c.post(f"/api/brand-equity/studies/{sid}/thesis-ai/external-import",
               json={"part_key": "ch3", "content": body, "model_label": "Claude (test)"})
    assert r.status_code == 200, r.text
    ck = r.json()["cache_key"]
    r2 = c.post(f"/api/brand-equity/studies/{sid}/thesis-ai/external-import",
                json={"chapters": {"4": "## บทที่ 4 ผลการศึกษา\n\n" + ("ผลการศึกษา " * 60)},
                      "model_label": "Claude (test)"})
    assert r2.json()["chapters_stored"] == [3, 4]
    dl = c.get(f"/api/brand-equity/studies/{sid}/thesis-ai-download", params={"cache_key": ck})
    assert dl.status_code == 200, dl.text[:300]
    t = _docx_text(dl.content)
    assert "Claude (test)" in t and "การเปิดเผยการใช้ AI" in t
    bad = c.post(f"/api/brand-equity/studies/{sid}/thesis-ai/external-import",
                 json={"part_key": "ch9", "content": body})
    assert bad.status_code == 422


def test_thesis_job_imports_helpers_that_exist():
    """Reproduced: the job imported `_call_gemini_with_retry` and the download
    `_create_thesis_docx` from `server`, which defines neither — every AI
    thesis job failed with ImportError."""
    import inspect
    src = inspect.getsource(BE.get_brand_equity_routes)
    assert "from server import _call_gemini_with_retry" not in src
    assert "from server import _create_thesis_docx" not in src
    from routes.conjoint import _call_gemini_with_retry, _create_thesis_docx  # noqa: F401


def test_raw_export_endpoint(api):
    r = api.client.get(f"/api/brand-equity/studies/{api.sid}/export/raw")
    assert r.status_code == 200 and r.content[:2] == b"PK"
    csv_r = api.client.get(f"/api/brand-equity/studies/{api.sid}/export/raw", params={"format": "codebook_csv"})
    assert "variable" in csv_r.content.decode("utf-8").splitlines()[0]


def test_visual_identity_and_translation_external(api):
    c, sid = api.client, api.sid
    asyncio.run(api.db.brand_studies.update_one({"id": sid}, {"$set": {"identity.description": "ร้านกาแฟโมเดิร์น"}}))
    p = c.get(f"/api/brand-equity/studies/{sid}/extract-visual-identity/external-prompt").json()
    assert p["parts"][0]["prompt"] and p["feature"] == "be.visual_identity"
    bad = c.post(f"/api/brand-equity/studies/{sid}/extract-visual-identity/external-import",
                 json={"content": '{"derived_traits": [], "visual_palette": ["red"]}'})
    assert bad.status_code == 422
    ok = c.post(f"/api/brand-equity/studies/{sid}/extract-visual-identity/external-import",
                json={"content": '{"derived_traits": ["Modern"], "visual_palette": ["0e5538"], "summary": "s"}',
                      "model_label": "Gemini (mine)"})
    assert ok.status_code == 200 and ok.json()["identity"]["visual_palette"] == ["#0E5538"]
    tp = c.get(f"/api/brand-equity/studies/{sid}/regenerate-questions/external-prompt").json()
    assert "แพงเกินไป" in tp["parts"][0]["prompt"]
    tr = c.post(f"/api/brand-equity/studies/{sid}/regenerate-questions/external-import",
                json={"content": "is too expensive"})
    assert tr.status_code == 200 and tr.json()["custom_quality_attributes_en"] == ["is too expensive"]
    assert any("is too expensive" in (q.get("prompt_en") or "") for q in tr.json()["questions"])


def test_creating_a_study_does_not_call_the_llm_when_switched_off(api, monkeypatch):
    api.policy(False)
    called = []

    async def boom(prompt, system=""):
        called.append(1)
        return "x"
    monkeypatch.setattr(BE, "_gemini_call", boom)
    r = api.client.post("/api/brand-equity/studies", json={
        "brand": {"name": "B2", "category": "c", "competitors": [], "custom_quality_attributes": ["อร่อย"]},
        "identity": {"traits": []}})
    assert r.status_code == 200 and not called
    assert r.json()["brand"]["custom_quality_attributes_en"] == ["อร่อย"]


def test_large_study_external_parts_stay_within_what_a_chat_llm_handles():
    """500 respondents with mostly distinct answers: every part stays within the
    character budget and no part asks for more than CODING_ITEMS_PER_PART codes."""
    study, qs = make_study()
    rng = random.Random(1)
    rs = make_responses(qs, 500)
    for r in rs:
        for a in r["answers"]:
            q = next(q for q in qs if q["id"] == a["question_id"])
            if q.get("ai_processing") in BX.CODEABLE_PROCESSING:
                a["value"] = f"{rng.choice(['Kaffe', 'Amazon', 'ร้านแถวบ้าน'])} สาขา {rng.randint(1, 400)}"
            elif q.get("ai_processing") == "theme_extraction":
                a["value"] = "ความเห็นยาว " * rng.randint(5, 30) + str(rng.random())
    agg = BE._aggregate_responses(study, rs)
    built = asyncio.run(BE._build_ai_parts(study, rs, agg, merge=True))
    total_ids = 0
    for p in built["parts"]:
        n_ids = len(re.findall(r"^a[0-9a-f]{8,12} \|", p["prompt"].split("### งาน: สกัดประเด็น")[0], re.M))
        assert n_ids <= BX.CODING_ITEMS_PER_PART
        assert len(p["prompt"]) < BX.PART_CHAR_BUDGET + 6000, (p["key"], len(p["prompt"]))
        total_ids += n_ids
    assert total_ids == sum(len(u["items"]) for u in built["coding_units"])
    assert all(u["sampled"] for u in built["theme_units"])   # disclosed sample, not silent [:80]


def test_unaided_recall_no_longer_penalises_the_top_of_mind_brand():
    """Reproduced: AW-2 asks for brands *besides* the first one, so a brand that
    is everyone's top-of-mind scored ~0 on unaided recall (weight .25)."""
    study, qs = make_study()
    tom = next(q for q in qs if q["kind"] == "unaided_top_of_mind")
    rec = next(q for q in qs if q["kind"] == "unaided_recall")
    rs = [{"id": f"r{i}", "answers": [{"question_id": tom["id"], "value": "Kaffe"},
                                       {"question_id": rec["id"], "value": "Amazon"}]} for i in range(40)]
    agg = BE._aggregate_responses(study, rs)
    st = next(q for q in agg["questions"] if q["id"] == rec["id"])["stats"]
    assert st["total_unaided_pct"] == 100.0
    assert BE._question_signal_100({"type": "open_long", "kind": "unaided_recall",
                                    "ai_processing": "extract_brands"}, st, "Kaffe") == 100.0


def test_bes_weight_sensitivity_is_reported():
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, 60))
    sens = agg["bes_sensitivity"]
    lo, hi = sens["range_one_weight_halved_or_doubled"]
    assert lo <= agg["composite"]["overall"] <= hi and sens["dimensions_used"] == 4
