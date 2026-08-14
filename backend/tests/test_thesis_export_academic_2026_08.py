"""Academic-correctness regression tests for the two thesis-export pipelines.

Each test pins a defect an examiner would mark down, reproduced before it was
fixed. See memory/THESIS_EXPORT_AUDIT_2026_08.md.
"""
import os
import sys
import itertools
import uuid

import numpy as np
import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import conjoint as CJ            # noqa: E402
from routes import brand_equity as BE        # noqa: E402
from routes import be_thesis_ai as BTA       # noqa: E402


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------
def _lvl(v):
    return {"id": f"lvl_{v}", "value": v}


def build_conjoint(n_resp=80, n_sets=9, alts=3, seed=7):
    attrs = [
        {"id": "a_brand", "name": "Brand",
         "levels": [_lvl("A"), _lvl("B"), _lvl("C")]},
        {"id": "a_price", "name": "Price", "levels": [_lvl("Low"), _lvl("High")]},
        {"id": "a_qual", "name": "Quality", "levels": [_lvl("Good"), _lvl("Bad")]},
    ]
    true_u = {("a_brand", "lvl_A"): .4, ("a_brand", "lvl_B"): .2, ("a_brand", "lvl_C"): 0.,
              ("a_price", "lvl_Low"): 2., ("a_price", "lvl_High"): 0.,
              ("a_qual", "lvl_Good"): 1., ("a_qual", "lvl_Bad"): 0.}
    rng = np.random.default_rng(seed)
    aids = [a["id"] for a in attrs]
    combos = list(itertools.product(*[[l["id"] for l in a["levels"]] for a in attrs]))
    cs = []
    for s in range(n_sets):
        idx = rng.choice(len(combos), size=alts, replace=False)
        cs.append({"id": str(uuid.uuid4()), "set_number": s + 1, "profiles": [
            {"id": str(uuid.uuid4()),
             "attribute_levels": {aids[i]: combos[j][i] for i in range(len(aids))}}
            for j in idx]})
    responses = []
    for r in range(n_resp):
        ch = []
        for c in cs:
            u = np.array([sum(true_u.get((a, l), 0.)
                              for a, l in p["attribute_levels"].items())
                          for p in c["profiles"]])
            sel = int(np.argmax(u + rng.gumbel(size=len(u))))
            ch.append({"choice_set_id": c["id"],
                       "selected_profile_id": c["profiles"][sel]["id"]})
        responses.append({"respondent_id": f"r{r}", "responses": ch})
    return {"attributes": attrs, "choice_sets": cs, "title": "CBC"}, responses


# ===========================================================================
# CONJOINT — the equations must describe only what the code runs
# ===========================================================================
@pytest.mark.parametrize("needle", [
    "Gibbs", "Metropolis", "Wishart", "Gelman", "Burn-in", "burn-in",
])
def test_hb_equations_do_not_describe_mcmc(needle):
    """`calculate_hierarchical_bayes_analysis` runs Maximum Simulated Likelihood
    plus Train's conditional distribution — no sampler exists to diagnose."""
    eq = CJ._get_method_equations("hierarchical_bayes")
    if needle in eq:
        # Only acceptable inside an explicit disclaimer that it is NOT used.
        assert "ไม่มี" in eq or "ห้ามบรรยายว่าใช้ MCMC" in eq, \
            f"{needle!r} presented as the estimation procedure"


def test_hb_equations_state_the_real_estimator():
    eq = CJ._get_method_equations("hierarchical_bayes")
    assert "Maximum Simulated Likelihood" in eq
    assert "conditional distribution" in eq or "Train" in eq
    assert "Empirical Bayes" in eq


def test_mnl_equations_do_not_claim_an_uncomputed_iia_test():
    eq = CJ._get_method_equations("mnl")
    assert "Hausman" not in eq or "ไม่ได้ทดสอบ" in eq


def test_counting_equations_do_not_claim_a_significance_test():
    eq = CJ._get_method_equations("counting")
    assert "Chi-square test for independence" not in eq
    assert "ไม่มีการทดสอบนัยสำคัญ" in eq


def test_ols_equations_describe_cluster_robust_not_classical_se():
    eq = CJ._get_method_equations("linear_regression")
    assert "cluster-robust" in eq
    assert "MSE × (X'X)⁻¹" not in eq, "classical homoskedastic SE formula still printed"
    for uncomputed in ("VIF", "Durbin"):
        if uncomputed in eq:
            assert "ไม่ได้คำนวณ" in eq, f"{uncomputed} presented as a performed check"


def test_mixed_logit_equations_match_the_independent_normal_spec():
    eq = CJ._get_method_equations("mixed_logit")
    # The estimator fits independent normals, so a Cholesky factor must not be
    # presented as part of the specification — only inside an explicit denial.
    assert "Lω" not in eq and "L·ω" not in eq, "correlated-RP parameterisation still shown"
    if "Cholesky" in eq:
        assert "ไม่มี Cholesky" in eq, "Cholesky factor presented as part of the model"
    assert "ไม่มีสหสัมพันธ์ระหว่างพารามิเตอร์" in eq
    assert "WTP_k = -" not in eq, "willingness-to-pay is never computed"


def test_mnl_equations_state_the_bic_sample_basis():
    eq = CJ._get_method_equations("mnl")
    assert "N_situations" in eq or "ชุดคำถาม" in eq


# ===========================================================================
# CONJOINT — the writer must be given the statistics it is told to report
# ===========================================================================
def test_summary_supplies_ols_inference_and_f_degrees_of_freedom():
    study, responses = build_conjoint()
    ols = CJ.calculate_regression_analysis(study, responses)
    assert ols is not None
    s = CJ._summarize_results_for_thesis({"linear_regression": ols})
    assert "f_pvalue:" in s, "the old lookup used the non-existent key `f_p_value`"
    assert "f_df1:" in s and "f_df2:" in s, "APA 7 requires F(df1, df2)"
    assert "cluster-robust" in s
    assert "SE=" in s and "t=" in s and "p=" in s


def test_summary_supplies_mixed_logit_heterogeneity():
    pytest.importorskip("xlogit")
    study, responses = build_conjoint(n_resp=60)
    mxl = CJ.calculate_mixed_logit_analysis(study, responses)
    assert mxl is not None
    s = CJ._summarize_results_for_thesis({"mixed_logit": mxl})
    assert "preference_heterogeneity" not in s, "key never existed on the result dict"
    assert "σ̂=" in s and "p(σ̂)=" in s
    assert "random_vars:" in s and "fixed_vars:" in s
    assert "bic:" in s and "pseudo_r_squared_adj:" in s


def test_summary_supplies_hb_fit_statistics_not_sampler_diagnostics():
    pytest.importorskip("xlogit")
    study, responses = build_conjoint(n_resp=60)
    hb = CJ.calculate_hierarchical_bayes_analysis(study, responses)
    assert hb is not None
    s = CJ._summarize_results_for_thesis({"hierarchical_bayes": hb})
    assert "convergence:" not in s and "n_iterations:" not in s
    assert "n_individual_draws:" in s
    assert "NOT a standard error" in s, "population SD must not be read as SE"


# ===========================================================================
# CONJOINT — per-method reporting instructions must be satisfiable
# ===========================================================================
def _ch4(methods):
    study, responses = build_conjoint(n_resp=50)
    results = {m: CJ.get_method_results for m in methods}  # placeholder, replaced below
    results = {}
    fns = {"mnl": CJ.calculate_mnl_analysis,
           "linear_regression": CJ.calculate_regression_analysis,
           "counting": None,
           "mixed_logit": CJ.calculate_mixed_logit_analysis,
           "hierarchical_bayes": CJ.calculate_hierarchical_bayes_analysis}
    for m in methods:
        fn = fns[m]
        if fn is None:
            pw = CJ.calculate_part_worths(study, responses)
            results[m] = {"method": "counting", "part_worths": pw,
                          "importance_scores": CJ.calculate_importance_scores(pw, study)}
        else:
            results[m] = fn(study, responses)
    _sys, prompts = CJ._build_thesis_prompt("CBC", 50, results, methods=methods,
                                            chapters=[3, 4, 5])
    return prompts[4]


def test_counting_section_forbids_significance_stars():
    ch4 = _ch4(["counting"])
    assert "ห้ามรายงาน SE" in ch4
    assert "*** p<.001" not in ch4, "star legend must not be attached to a descriptive method"


def test_hb_section_forbids_per_coefficient_p_values():
    pytest.importorskip("xlogit")
    ch4 = _ch4(["hierarchical_bayes"])
    assert "ห้ามรายงาน SE, z/t, p-value" in ch4
    assert "ไม่ใช่ standard error" in ch4
    assert "LR test" in ch4


def test_mnl_section_still_asks_for_p_values():
    ch4 = _ch4(["mnl"])
    assert "*** p<.001" in ch4


def test_ols_section_asks_for_apa_f_and_robust_se():
    ch4 = _ch4(["linear_regression"])
    assert "cluster-robust SE" in ch4
    assert "F(f_df1, f_df2)" in ch4


def test_system_message_forbids_fabricating_statistics():
    study, responses = build_conjoint(n_resp=40)
    mnl = CJ.calculate_mnl_analysis(study, responses)
    sysmsg, _ = CJ._build_thesis_prompt("CBC", 40, {"mnl": mnl},
                                        methods=["mnl"], chapters=[3])
    assert "ห้ามสร้างตัวเลขขึ้นเอง" in sysmsg
    for uncomputed in ("Hausman", "VIF", "Durbin-Watson", "Gelman-Rubin"):
        assert uncomputed in sysmsg, f"{uncomputed} not named as forbidden"
    assert "p < .001" in sysmsg, "APA p-value convention not stated"


# ===========================================================================
# BRAND EQUITY — citations
# ===========================================================================
def test_brand_personality_is_attributed_to_jennifer_aaker():
    refs = BTA.BRAND_REFERENCES_APA
    assert "Aaker, J. L. (1997). Dimensions of brand personality" in refs
    assert "Aaker, D. A. (1997). Dimensions of brand personality" not in refs, \
        "misattributed to David A. Aaker"


def test_pomp_is_attributed_to_cohen_et_al_not_devellis():
    brand = BE.BrandSetup(name="K", category="c", competitors=["A"])
    ident = BE.IdentitySetup(traits=["x", "y", "z"])
    qs = BE._generate_questions_from_template(brand, ident)
    study = {"id": "s", "title": "t", "brand": brand.dict(), "identity": ident.dict(),
             "questions": qs, "created_at": BE._now_iso(), "ai_cache": {}}
    agg = BE._aggregate_responses(study, [])
    _sys, prompts = BTA.build_be_thesis_prompts(
        study=study, aggregate=agg, n_total=0, n_filtered=0, chapters=[3])
    ch3 = prompts[3]
    assert "Cohen" in ch3, "POMP source not cited"
    assert "POMP" in ch3
    assert "สูตรมาตรฐาน DeVellis (2017)" not in ch3, "POMP misattributed to DeVellis"
    assert "Cohen, P., Cohen, J., Aiken, L. S., & West, S. G. (1999)" in BTA.BRAND_REFERENCES_APA


def test_reference_list_covers_the_statistics_now_reported():
    refs = BTA.BRAND_REFERENCES_APA
    for needed in ("Cronbach, L. J. (1951)", "Nunnally, J. C., & Bernstein, I. H. (1994)",
                   "Fornell, C., & Larcker, D. F. (1981)"):
        assert needed in refs, f"missing reference: {needed}"


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
