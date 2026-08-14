"""Wave comparison significance testing (Jun 2026).

Before this, two waves were shown side by side with a delta and nothing else, so
a 3-point move on 12 respondents looked exactly like a 3-point move on 400.
"""
import os
import random
import sys

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import brand_equity as BE  # noqa: E402


def make_study():
    brand = BE.BrandSetup(name="Kaffe", category="กาแฟ", competitors=["Amazon"])
    ident = BE.IdentitySetup(traits=["สดชื่น", "เป็นกันเอง", "คุณภาพดี"],
                             brand_promise="กาแฟสดชื่นทุกวัน")
    qs = BE._generate_questions_from_template(brand, ident)
    return {"id": "s1", "brand": brand.dict(), "identity": ident.dict(), "questions": qs}


def responses(study, n, shift=0.0, seed=1):
    """n respondents; `shift` moves every rating item up by that many scale points."""
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        answers = []
        for q in study["questions"]:
            if q["type"] in ("likert_5", "likert_7"):
                top = 5 if q["type"] == "likert_5" else 7
                v = min(top, max(1, round(rng.gauss(top / 2 + shift, 0.8))))
                answers.append({"question_id": q["id"], "value": v})
            elif q["type"] == "nps_0_10":
                answers.append({"question_id": q["id"],
                                "value": min(10, max(0, round(rng.gauss(6 + shift, 1.2))))})
        out.append({"answers": answers, "demographics": {}})
    return out


def test_respondent_dimension_scores_are_pomp_and_per_respondent():
    study = make_study()
    rs = responses(study, 20, seed=3)
    scores = BE._respondent_dimension_scores(study, rs)
    assert set(scores) & {"awareness", "quality", "identity", "loyalty"}
    for dim, vals in scores.items():
        assert len(vals) <= 20, dim
        assert all(0 <= v <= 100 for v in vals), dim


def test_legacy_question_ids_are_pooled():
    """Responses from an earlier wave carry that wave's question id."""
    study = make_study()
    q = next(q for q in study["questions"] if q["type"] in ("likert_5", "likert_7"))
    q["legacy_ids"] = ["OLD-1"]
    old_wave = [{"answers": [{"question_id": "OLD-1", "value": 5}]} for _ in range(5)]
    scores = BE._respondent_dimension_scores(study, old_wave)
    assert len(scores.get(q["dimension"]) or []) == 5


def test_no_real_change_is_reported_as_not_significant():
    study = make_study()
    a = responses(study, 60, shift=0.0, seed=11)
    b = responses(study, 60, shift=0.0, seed=12)
    sig = BE._wave_significance(study, a, b)
    tested = [v for v in sig["by_dimension"].values() if v.get("testable")]
    assert tested, "nothing was testable"
    assert not any(v["significant"] for v in tested)


def test_real_shift_is_detected():
    study = make_study()
    a = responses(study, 60, shift=0.0, seed=21)
    b = responses(study, 60, shift=1.2, seed=22)
    sig = BE._wave_significance(study, a, b)
    tested = [v for v in sig["by_dimension"].values() if v.get("testable")]
    assert any(v["significant"] for v in tested)
    for v in tested:
        assert v["diff"] > 0
        assert v["p_value"] <= v["p_value_holm"]  # adjustment can only raise p
        assert v["effect_label"] in ("negligible", "small", "medium", "large")
        lo, hi = v["diff_ci95"]
        assert lo <= v["diff"] <= hi


def test_tiny_waves_are_not_tested_rather_than_guessed():
    study = make_study()
    sig = BE._wave_significance(study, responses(study, 2, seed=1), responses(study, 30, seed=2))
    for v in sig["by_dimension"].values():
        assert v["testable"] is False
        assert "reason" in v


def test_holm_adjustment_is_monotone_and_bounded():
    adj = BE._holm_adjust([("a", 0.001), ("b", 0.02), ("c", 0.30), ("d", 0.90)])
    assert adj["a"] <= adj["b"] <= adj["c"] <= adj["d"]
    assert all(0 <= v <= 1 for v in adj.values())
    assert adj["a"] == 0.004  # smallest p x 4 comparisons
