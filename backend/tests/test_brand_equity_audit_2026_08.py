"""Regression tests pinning the 2026-08 Brand Equity audit fixes.

Each test corresponds to a defect that was REPRODUCED before the fix, so a
failure means the defect is back. See memory/BRAND_EQUITY_AUDIT_2026_08.md.
"""
import os
import sys
import random
import statistics

import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import brand_equity as BE  # noqa: E402


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def make_study(custom_attrs=None, custom_reverse=None):
    brand = BE.BrandSetup(
        name="Kaffe", category="กาแฟ", competitors=["Amazon"],
        custom_quality_attributes=custom_attrs or [],
        custom_quality_attributes_reverse=custom_reverse or [],
    )
    ident = BE.IdentitySetup(traits=["สดชื่น", "เป็นกันเอง", "คุณภาพดี"],
                             brand_promise="กาแฟสดชื่นทุกวัน")
    qs = BE._generate_questions_from_template(brand, ident)
    return {"id": "s1", "title": "t", "brand": brand.dict(), "identity": ident.dict(),
            "questions": qs, "created_at": BE._now_iso(), "ai_cache": {}}, qs


def make_responses(qs, n, coherent=True, seed=5):
    rng = random.Random(seed)
    out = []
    for t in range(n):
        latent = rng.gauss(0, 1)
        answers = []
        for q in qs:
            ty = q.get("type")
            if ty in ("likert_5", "likert_7"):
                mx = 5 if ty == "likert_5" else 7
                v = (3 + 1.5 * latent + rng.gauss(0, 0.4)) if coherent else rng.uniform(1, mx)
                answers.append({"question_id": q["id"], "value": max(1, min(mx, int(round(v))))})
            elif ty == "nps_0_10":
                answers.append({"question_id": q["id"], "value": rng.randint(5, 10)})
            elif ty == "comparative_7":
                answers.append({"question_id": q["id"], "value": rng.randint(1, 6)})
        out.append({"id": f"r{t}", "study_id": "s1", "answers": answers,
                    "created_at": BE._now_iso()})
    return out


# ---------------------------------------------------------------------------
# 1. Reliability is computed — and refuses to invent a number.
# ---------------------------------------------------------------------------
def test_alpha_separates_a_real_scale_from_shuffled_noise():
    """Before the fix, a scale with alpha .93 and the same scale with its item
    columns independently shuffled (alpha ~0) produced byte-identical output."""
    study, qs = make_study()
    pq = [q["id"] for q in qs
          if q.get("dimension") == "quality" and q.get("type") in ("likert_5", "likert_7")]
    assert len(pq) >= 3

    rng = random.Random(11)
    n = 300
    rows = []
    for _ in range(n):
        latent = rng.gauss(0, 1)
        rows.append({qid: max(1, min(7, int(round(4 + 1.6 * latent + rng.gauss(0, 0.45)))))
                     for qid in pq})
    cols = {qid: [r[qid] for r in rows] for qid in pq}
    for qid in pq:
        rng.shuffle(cols[qid])
    shuffled = [{qid: cols[qid][t] for qid in pq} for t in range(n)]

    def to_resp(matrix):
        return [{"id": f"r{t}", "study_id": "s1", "created_at": BE._now_iso(),
                 "answers": [{"question_id": k, "value": v} for k, v in row.items()]}
                for t, row in enumerate(matrix)]

    a = BE._aggregate_responses(study, to_resp(rows))["reliability"]["quality"]
    b = BE._aggregate_responses(study, to_resp(shuffled))["reliability"]["quality"]
    assert a["alpha"] is not None and b["alpha"] is not None
    assert a["alpha"] >= 0.70, a["alpha"]
    assert b["alpha"] < 0.50, b["alpha"]
    assert a["meets_threshold"] is True and b["meets_threshold"] is False


def test_alpha_refuses_to_report_below_n30():
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, 15))
    r = agg["reliability"]["quality"]
    assert r["alpha"] is None
    assert r["reason"] == "n_below_30"
    assert "30" in r["interpretation"]


def test_alpha_reports_a_reason_when_dimension_has_too_few_items():
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, 60))
    aw = agg["reliability"]["awareness"]
    assert aw["alpha"] is None
    assert aw["reason"] == "fewer_than_2_likert_items"


def test_cronbach_alpha_matches_the_textbook_formula():
    m = [[5, 4, 5], [3, 3, 2], [6, 7, 6], [4, 4, 5], [2, 1, 2],
         [7, 6, 7], [5, 5, 4], [3, 4, 3], [6, 6, 7], [4, 3, 4]]
    k, n = 3, len(m)
    item_vars = [statistics.variance([r[j] for r in m]) for j in range(k)]
    total_var = statistics.variance([sum(r) for r in m])
    expected = (k / (k - 1)) * (1 - sum(item_vars) / total_var)
    assert abs(BE._cronbach_alpha(m) - expected) < 1e-9


# ---------------------------------------------------------------------------
# 2. Weight tables contain no unreachable entries.
# ---------------------------------------------------------------------------
def test_no_dimension_weight_is_unreachable():
    """`logo_aided`/`logo_unaided`/`color_recall` (0.25 of Awareness) and
    `as_product_quality` (0.05 of Quality) were listed under dimensions whose
    questions can never carry those kinds."""
    _study, qs = make_study()
    kinds_by_dim = {}
    for q in qs:
        k = q.get("kind")
        if k:
            kinds_by_dim.setdefault(k, set()).add(q.get("dimension"))
    dead = [f"{dim}.{kind}"
            for dim, wm in BE.DIMENSION_WEIGHTS.items()
            for kind in wm
            if dim not in kinds_by_dim.get(kind, set())]
    assert not dead, f"unreachable weight entries: {dead}"


def test_awareness_and_quality_weights_sum_to_one():
    for dim in ("awareness", "quality", "loyalty"):
        assert abs(sum(BE.DIMENSION_WEIGHTS[dim].values()) - 1.0) < 1e-9, dim


# ---------------------------------------------------------------------------
# 3. Identity trait metric: the ceiling must not depend on the trait COUNT.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("n_traits", [3, 5, 8, 12])
def test_perfect_identity_overlap_scores_100_regardless_of_trait_count(n_traits):
    traits = [f"trait{i}" for i in range(n_traits)]
    picks = 5
    q = {"type": "trait_grid", "kind": "image_traits_aided",
         "options": traits, "options_th": traits, "max": picks}
    stats = {"n": 100, "counts": [{"label": t, "pct": 100.0 * picks / n_traits} for t in traits]}
    sig = BE._question_signal_100(q, stats, "Kaffe", intended_traits=traits)
    assert sig is not None and sig >= 99.0, f"{n_traits} traits -> {sig}"


def test_disjoint_trait_vocabulary_is_excluded_not_scored_zero():
    """`as_person_personality` offers PERSONALITY_TRAIT_POOL but was scored
    against the brand's intended traits, which share almost nothing with it —
    returning a hard 0.0 that dragged Identity down in every study."""
    q = {"type": "trait_grid", "kind": "as_person_personality",
         "options": list(BE.PERSONALITY_TRAIT_POOL), "options_th": [], "max": 3}
    stats = {"n": 100, "counts": [{"label": t, "pct": 40.0} for t in BE.PERSONALITY_TRAIT_POOL]}
    assert BE._question_signal_100(q, stats, "Kaffe",
                                   intended_traits=["สดชื่น", "เป็นกันเอง"]) is None


# ---------------------------------------------------------------------------
# 4. No ad-hoc 0.85/0.15 blend.
# ---------------------------------------------------------------------------
def test_unweighted_question_cannot_move_a_weighted_composite():
    qs = [
        {"id": "w1", "dimension": "loyalty", "kind": "nps", "type": "nps_0_10",
         "stats": {"n": 50, "score_100": 80.0}},
        {"id": "w2", "dimension": "loyalty", "kind": "repeat_intent", "type": "likert_7",
         "stats": {"n": 50, "score_100": 60.0}},
        {"id": "u1", "dimension": "loyalty", "kind": "not_a_weighted_kind", "type": "likert_7",
         "stats": {"n": 50, "score_100": 0.0}},
    ]
    score, meta = BE._compute_dim_composite("loyalty", qs, "Kaffe")
    expected = round((80.0 * 0.40 + 60.0 * 0.30) / 0.70, 1)
    assert abs(score - expected) < 0.05, f"{score} != {expected}"
    assert meta["used_fallback"] is True


def test_pure_fallback_still_returns_the_mean():
    qs = [{"id": "u1", "dimension": "loyalty", "kind": "unknown", "type": "likert_7",
           "stats": {"n": 50, "score_100": 42.0}}]
    score, _ = BE._compute_dim_composite("loyalty", qs, "Kaffe")
    assert abs(score - 42.0) < 0.05


# ---------------------------------------------------------------------------
# 5. Coverage arithmetic is symmetric.
# ---------------------------------------------------------------------------
def test_identity_alignment_enters_both_sides_of_coverage():
    qs = [{"id": "q1", "dimension": "identity", "kind": "image_traits_aided",
           "type": "likert_7", "stats": {"n": 50, "score_100": 70.0}}]
    _s, meta = BE._compute_dim_composite("identity", qs, "Kaffe", identity_alignment=80.0)
    # designed = image_traits_aided (0.20) + alignment (0.10); both present -> 1.0
    assert meta["coverage"] <= 1.0
    _s2, meta2 = BE._compute_dim_composite("identity", qs, "Kaffe")
    assert meta2["coverage"] <= 1.0
    # Coverage must never claim completeness while listing missing signals.
    for m in (meta, meta2):
        if m["coverage"] >= 1.0:
            assert not m["missing_kinds"], m


# ---------------------------------------------------------------------------
# 6. Reverse coding and polarity.
# ---------------------------------------------------------------------------
def test_reverse_scoring_flips_the_score_and_the_boxes():
    agree = [6, 7, 6, 7, 6, 7, 7, 6]
    fwd = BE._likert_stats(agree, 7, reverse=False)
    rev = BE._likert_stats(agree, 7, reverse=True)
    assert abs((fwd["score_100"] + rev["score_100"]) - 100.0) < 0.15
    assert abs(rev["t2b"] - fwd["b2b"]) < 0.05
    assert rev["reverse_scored"] is True and fwd["reverse_scored"] is False


@pytest.mark.parametrize("text,expected", [
    ("แพงเกินไป", True), ("ไม่คุ้มค่า", True), ("too expensive", True),
    ("สดชื่น", False), ("ดีไซน์สวย", False), ("premium", False),
])
def test_negative_wording_heuristic(text, expected):
    assert BE._looks_negatively_worded(text) is expected


def test_undeclared_negative_attribute_is_kept_out_of_scores():
    """Agreeing a brand is 'overpriced' used to RAISE its Perceived Quality."""
    _study, qs = make_study(custom_attrs=["แพงเกินไป", "สดชื่น"])
    custom = [q for q in qs if q.get("polarity_declared") is not None]
    negative = [q for q in custom if q.get("polarity_suspected_negative")]
    neutral = [q for q in custom if not q.get("polarity_suspected_negative")]
    assert negative and all(q["score_eligible"] is False for q in negative)
    assert neutral and all(q["score_eligible"] is True for q in neutral)


def test_declared_polarity_enables_reverse_scored_inclusion():
    _study, qs = make_study(custom_attrs=["แพงเกินไป"], custom_reverse=[True])
    declared = [q for q in qs if q.get("polarity_declared")]
    assert declared
    assert all(q["reverse_scored"] and q["score_eligible"] for q in declared)


# ---------------------------------------------------------------------------
# 7. Dispersion and uncertainty.
# ---------------------------------------------------------------------------
def test_std_is_the_sample_estimate():
    vals = [3, 4, 5, 6, 7, 4, 5, 6]
    assert abs(BE._likert_stats(vals, 7)["std"] - round(statistics.stdev(vals), 2)) < 0.011
    assert BE._likert_stats([4], 7)["std"] == 0.0


def test_confidence_interval_reported_and_narrows_with_n():
    base = [5, 6, 4, 7, 5, 6, 3, 6, 5, 6, 4, 5]
    small = BE._likert_stats(base, 7)
    big = BE._likert_stats(base * 25, 7)
    assert small["score_100_ci95"] and big["score_100_ci95"]
    w_small = small["score_100_ci95"][1] - small["score_100_ci95"][0]
    w_big = big["score_100_ci95"][1] - big["score_100_ci95"][0]
    assert w_big < w_small / 2
    assert small["score_100_ci95"][0] <= small["score_100"] <= small["score_100_ci95"][1]
    assert 0 <= small["score_100_ci95"][0] and small["score_100_ci95"][1] <= 100


# ---------------------------------------------------------------------------
# 8. Sample adequacy gate.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("n,level", [(1, "insufficient"), (12, "provisional"),
                                     (60, "adequate"), (150, "strong")])
def test_sample_adequacy_bands(n, level):
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, n))
    assert agg["sample_adequacy"]["level"] == level
    assert str(n) in agg["sample_adequacy"]["message"]


# ---------------------------------------------------------------------------
# 9. One canonical verdict scale.
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("score,label", [
    (92, "Champion"), (80, "Champion"), (72, "Strong"), (65, "Strong"),
    (62, "Healthy"), (50, "Healthy"), (45, "At Watch"), (35, "At Watch"), (12, "At Risk"),
])
def test_brand_health_tier_boundaries(score, label):
    assert BE.brand_health_tier(score)["label"] == label


def test_tier_served_in_the_aggregate_payload():
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, 60))
    assert agg["brand_health_tier"]["label"] == BE.brand_health_tier(
        agg["composite"]["overall"])["label"]
    assert len(agg["brand_health_tiers"]) == 5


# ---------------------------------------------------------------------------
# 10. Unmeasured dimensions are distinguishable from a genuine zero.
# ---------------------------------------------------------------------------
def test_measured_dimension_list_is_exposed():
    study, qs = make_study()
    agg = BE._aggregate_responses(study, make_responses(qs, 60))
    assert "_measured" in agg["composite"]
    assert set(agg["composite"]["_measured"]) <= set(BE.DIMENSIONS)


# ---------------------------------------------------------------------------
# 11. The questionnaire is reproducible and keeps the brand's own traits.
# ---------------------------------------------------------------------------
def test_trait_grid_is_deterministic_and_keeps_intended_traits():
    intended = ["สดชื่น", "เป็นกันเอง", "คุณภาพดี"]
    brand = BE.BrandSetup(name="Kaffe", category="กาแฟ", competitors=["A"])
    ident = BE.IdentitySetup(traits=intended)
    a = BE._generate_questions_from_template(brand, ident)
    b = BE._generate_questions_from_template(brand, ident)
    grid_a = next(q for q in a if q.get("kind") == "image_traits_aided")
    grid_b = next(q for q in b if q.get("kind") == "image_traits_aided")
    assert grid_a["options"] == grid_b["options"], "grid must be reproducible"
    for t in intended:
        assert t in grid_a["options"], f"intended trait {t} was dropped from its own grid"


# ---------------------------------------------------------------------------
# 12. The score must not depend on whether the LLM normalisation job has run.
# ---------------------------------------------------------------------------
def _study_with_open_brand_questions():
    brand = BE.BrandSetup(name="Kaffe", category="กาแฟ", competitors=["Amazon", "Inthanin"])
    ident = BE.IdentitySetup(traits=["สดชื่น", "เป็นกันเอง", "คุณภาพดี"], brand_promise="p")
    qs = BE._generate_questions_from_template(brand, ident)
    study = {"id": "s", "title": "t", "brand": brand.dict(), "identity": ident.dict(),
             "questions": qs, "created_at": BE._now_iso(), "ai_cache": {}}
    rng = random.Random(3)
    n, truth = 120, []
    responses = []
    for t in range(n):
        focal = rng.random() < 0.40
        truth.append(focal)
        ans = []
        for q in qs:
            ty = q.get("type")
            if q.get("ai_processing") in ("extract_brand", "extract_brands"):
                ans.append({"question_id": q["id"],
                            "value": "Kaffe" if focal else rng.choice(["Amazon", "Inthanin"])})
            elif ty in ("likert_5", "likert_7"):
                mx = 5 if ty == "likert_5" else 7
                ans.append({"question_id": q["id"], "value": rng.randint(mx - 2, mx)})
            elif ty == "nps_0_10":
                ans.append({"question_id": q["id"], "value": rng.randint(6, 10)})
            elif ty == "comparative_7":
                ans.append({"question_id": q["id"], "value": rng.randint(1, 4)})
        responses.append({"id": f"r{t}", "study_id": "s", "answers": ans,
                          "created_at": BE._now_iso()})
    open_qs = [q for q in qs if q.get("ai_processing") in ("extract_brand", "extract_brands")]
    pct = sum(truth) / n * 100
    ai_norm = {q["id"]: {"total": n, "counts": [
        {"label": "Kaffe", "count": sum(truth), "pct": round(pct, 1)},
        {"label": "Amazon", "count": n - sum(truth), "pct": round(100 - pct, 1)}]}
        for q in open_qs}
    return study, responses, ai_norm, pct


def test_score_does_not_move_when_the_ai_pass_runs():
    """Top-of-Mind (w .40) and Unaided Recall (w .25) used to contribute nothing
    until an LLM job had run, renormalising 65% of Awareness away in a direction
    that always inflated the score."""
    study, responses, ai_norm, _pct = _study_with_open_brand_questions()
    without = BE._aggregate_responses(study, responses)
    with_ai = BE._aggregate_responses(study, responses, normalized=ai_norm)
    assert abs(without["composite"]["awareness"] - with_ai["composite"]["awareness"]) < 3.0
    assert abs(without["composite"]["overall"] - with_ai["composite"]["overall"]) < 2.0
    assert without["brand_health_tier"]["label"] == with_ai["brand_health_tier"]["label"]


def test_unaided_signals_present_without_the_ai_pass():
    study, responses, ai_norm, _ = _study_with_open_brand_questions()
    without = BE._aggregate_responses(study, responses)
    with_ai = BE._aggregate_responses(study, responses, normalized=ai_norm)
    meta_w, meta_a = without["composite_meta"]["awareness"], with_ai["composite_meta"]["awareness"]
    assert "unaided_top_of_mind" in meta_w["present_kinds"]
    assert "unaided_recall" in meta_w["present_kinds"]
    assert meta_w["coverage"] == meta_a["coverage"]
    assert sorted(meta_w["present_kinds"]) == sorted(meta_a["present_kinds"])


def test_deterministic_count_matches_the_truth_and_reports_its_basis():
    study, responses, _ai, pct = _study_with_open_brand_questions()
    agg = BE._aggregate_responses(study, responses)
    tom = next(q for q in agg["questions"] if q["kind"] == "unaided_top_of_mind")
    got = next((c["pct"] for c in tom["stats"]["counts"] if c["label"] == "Kaffe"), None)
    assert got is not None and abs(got - pct) < 0.6
    assert tom["stats"]["normalization_basis"] == "deterministic"
    assert agg["normalization"]["basis"] == "deterministic"


def test_competitor_mentions_are_never_credited_to_the_focal_brand():
    """Guards the previous substring behaviour: a focal brand whose name is a
    substring of a competitor's could absorb the competitor's mentions."""
    det = BE._deterministic_brand_counts(
        ["Kaffe Prime"] * 10 + ["Kaffe"] * 5, ["Kaffe", "Kaffe Prime", "Amazon"])
    counts = {c["label"]: c["count"] for c in det["counts"]}
    assert counts.get("Kaffe Prime") == 10
    assert counts.get("Kaffe") == 5


def test_case_and_spacing_variants_are_matched():
    det = BE._deterministic_brand_counts(["  KAFFE  ", "kaffe"], ["Kaffe", "Amazon"])
    assert next(c["count"] for c in det["counts"] if c["label"] == "Kaffe") == 2


# ---------------------------------------------------------------------------
# 13. The AI-insights payload must be valid JSON and reach every dimension.
# ---------------------------------------------------------------------------
def _insights_summary(agg, study):
    """Execute the payload-building half of `_ai_master_insights` (the rest
    needs a live LLM)."""
    import inspect
    import json as _json
    src = inspect.getsource(BE._ai_master_insights)
    body = src.split('prompt = f"""')[0].split('"""Generate 5 actionable insights."""')[1]
    ns = {"study": study, "agg": agg, "DIMENSIONS": BE.DIMENSIONS, "json": _json}
    exec(body.replace("\n    ", "\n").lstrip("\n"), ns)  # noqa: S102 — test harness
    return ns["summary"]


def _long_answer_study():
    study, qs = make_study()
    rng = random.Random(4)
    thai = "กาแฟหอมกลมกล่อม ราคาเข้าถึงได้ บรรยากาศร้านดี พนักงานบริการเป็นกันเอง"
    responses = []
    for t in range(80):
        ans = []
        for q in qs:
            ty = q.get("type")
            if ty in ("open_short", "open_long"):
                ans.append({"question_id": q["id"], "value": thai})
            elif ty in ("likert_5", "likert_7"):
                mx = 5 if ty == "likert_5" else 7
                ans.append({"question_id": q["id"], "value": rng.randint(mx - 3, mx)})
            elif ty == "nps_0_10":
                ans.append({"question_id": q["id"], "value": rng.randint(4, 10)})
        responses.append({"id": f"L{t}", "study_id": "s1", "answers": ans,
                          "created_at": BE._now_iso()})
    return study, BE._aggregate_responses(study, responses)


def test_insights_payload_reaches_every_dimension():
    """The questionnaire is ordered awareness → quality → identity (~22 items) →
    loyalty, so the old `questions[:20]` slice could never reach a Loyalty item."""
    study, agg = _long_answer_study()
    summary = _insights_summary(agg, study)
    dims = {k.get("dim") for k in summary["key_stats"]}
    for d in BE.DIMENSIONS:
        assert d in dims, f"{d} never reaches the insights model"


def test_insights_payload_is_valid_json_on_realistic_text():
    """The old payload was serialised whole then sliced at 6000 chars, cutting
    the JSON mid-string once respondents typed realistic Thai free text."""
    import json as _json
    study, agg = _long_answer_study()
    blob = _json.dumps(_insights_summary(agg, study), ensure_ascii=False)
    _json.loads(blob)          # must parse
    assert len(blob) < 12000, f"payload grew to {len(blob)} chars"

    old = _json.dumps({"key_stats": [
        {"qid": q["id"], "kind": q["kind"], "stats": q["stats"]}
        for q in agg["questions"][:20]]}, ensure_ascii=False)
    assert len(old) > 6000, "fixture no longer reproduces the overflow"
    with pytest.raises(ValueError):
        _json.loads(old[:6000])


def test_insights_payload_carries_trust_context():
    study, agg = _long_answer_study()
    summary = _insights_summary(agg, study)
    assert summary.get("sample", {}).get("level")
    assert "reliability" in summary
    assert "_measured" not in summary["scores"], "internal key leaked as a score"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
