"""Regression tests pinning the 2026-08 conjoint audit fixes.

Each test here corresponds to a defect that was REPRODUCED before the fix, so a
failure means the defect is back. See memory/CONJOINT_AUDIT_2026_08.md for the
measurements behind each one.

Companion to test_conjoint_stats_correctness.py, which pins the estimator maths.
"""
import os
import sys
import uuid
import asyncio
import itertools

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import conjoint as CJ  # noqa: E402


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _lvl(value):
    return {"id": f"lvl_{value}", "value": value}


def build_study(n_resp=60, n_sets=8, alts=3, seed=7,
                append_level=None, append_attribute=False, break_one_selection=False):
    """Known logit DGP; the optional flags reproduce the audited failure modes."""
    attrs = [
        {"id": "attr_brand", "name": "Brand",
         "levels": [_lvl("BrandA"), _lvl("BrandB"), _lvl("BrandC")]},
        {"id": "attr_price", "name": "Price", "levels": [_lvl("Low"), _lvl("High")]},
        {"id": "attr_qual", "name": "Quality", "levels": [_lvl("Good"), _lvl("Bad")]},
    ]
    true_util = {
        ("attr_brand", "lvl_BrandA"): 0.4, ("attr_brand", "lvl_BrandB"): 0.2,
        ("attr_brand", "lvl_BrandC"): 0.0, ("attr_price", "lvl_Low"): 2.0,
        ("attr_price", "lvl_High"): 0.0, ("attr_qual", "lvl_Good"): 1.0,
        ("attr_qual", "lvl_Bad"): 0.0,
    }
    rng = np.random.default_rng(seed)
    attr_ids = [a["id"] for a in attrs]
    combos = list(itertools.product(*[[l["id"] for l in a["levels"]] for a in attrs]))

    choice_sets = []
    for s in range(n_sets):
        idx = rng.choice(len(combos), size=alts, replace=False)
        choice_sets.append({
            "id": str(uuid.uuid4()), "set_number": s + 1,
            "profiles": [
                {"id": str(uuid.uuid4()),
                 "attribute_levels": {attr_ids[i]: combos[j][i] for i in range(len(attr_ids))}}
                for j in idx
            ],
        })

    def util(p):
        return sum(true_util.get((a, l), 0.0) for a, l in p["attribute_levels"].items())

    responses = []
    for r in range(n_resp):
        ch = []
        for cs in choice_sets:
            u = np.array([util(p) for p in cs["profiles"]])
            sel = int(np.argmax(u + rng.gumbel(size=len(u))))
            ch.append({"choice_set_id": cs["id"],
                       "selected_profile_id": cs["profiles"][sel]["id"]})
        if break_one_selection and r == 0:
            # A task with no usable selection: skipped, or a stale profile id.
            ch[2]["selected_profile_id"] = "no-such-profile-id"
        responses.append({"respondent_id": f"r{r}", "responses": ch})

    # Post-design edits — the study editor allows both of these.
    if append_level:
        attrs[0]["levels"].append(_lvl(append_level))
    if append_attribute:
        attrs.append({"id": "attr_new", "name": "NewAttr",
                      "levels": [_lvl("X"), _lvl("Y")]})

    return {"attributes": attrs, "choice_sets": choice_sets}, responses


class _L:
    def __init__(self, i, v):
        self.id, self.value = i, v


class _A:
    def __init__(self, i, n, lv):
        self.id, self.name, self.levels = i, n, lv


def _choice_design_d_efficiency(design, attrs_obj):
    """det(I)^(1/K) for the beta=0 MNL information matrix — the quantity a choice
    design is supposed to maximise. Information lives in WITHIN-SET contrasts."""
    col_specs = [(ai, l.id) for ai, a in enumerate(attrs_obj) for l in a.levels[:-1]]
    attr_ids = [a.id for a in attrs_obj]
    K = len(col_specs)
    info = np.zeros((K, K))
    for cs in design:
        Xs = np.array([
            [1.0 if p.attribute_levels[attr_ids[ai]] == lid else 0.0 for ai, lid in col_specs]
            for p in cs.profiles
        ])
        Xc = Xs - Xs.mean(axis=0, keepdims=True)
        info += Xc.T @ Xc / Xs.shape[0]
    sign, ld = np.linalg.slogdet(info)
    return float(np.exp(ld / K)) if sign > 0 else 0.0


# ---------------------------------------------------------------------------
# 1. Post-design edits must not kill the analysis.
#
# `_dummy_encode_consistent_reference` used to drop the reference column only if
# it already existed, so appending a level (the new level becomes the nominal
# reference but was never shown) left every observed level with a dummy, and
# appending an attribute produced a constant "__MISSING__" column. Both are
# unidentified in a conditional logit; statsmodels raised and the analysis
# returned None with only a log line to show for it.
# ---------------------------------------------------------------------------
def test_appended_level_does_not_break_mnl():
    study, responses = build_study(append_level="BrandD_NEW")
    res = CJ.calculate_mnl_analysis(study, responses)
    assert res is not None, "MNL died after a level was appended post-design"
    assert "Brand_BrandD_NEW" not in res["coefficients"], "unseen level must not enter the model"
    assert res["coefficients"]["Price_Low"] > 0


def test_appended_attribute_does_not_break_mnl():
    study, responses = build_study(append_attribute=True)
    res = CJ.calculate_mnl_analysis(study, responses)
    assert res is not None, "MNL died after an attribute was appended post-design"
    assert not any("MISSING" in k for k in res["coefficients"]), \
        "the __MISSING__ sentinel is a constant column and must be excluded"
    assert res["coefficients"]["Price_Low"] > 0


def test_encoder_drops_columns_without_within_set_variation():
    study, responses = build_study(append_attribute=True)
    rows, attrs, _ = CJ._build_conjoint_data_rows(study, responses)
    df = pd.DataFrame(rows)
    cs_codes, _u = pd.factorize(df["choice_set"])
    df["_situation"] = df["respondent"].astype(int) * 1_000_000 + cs_codes
    feature_cols = [c for c in df.columns
                    if c not in ("respondent", "choice_set", "alternative", "choice", "_situation")]
    X = CJ._dummy_encode_consistent_reference(df, attrs, feature_cols, groups=df["_situation"])
    assert X.shape[1] > 0
    assert np.linalg.matrix_rank(X.values) == X.shape[1], "design matrix must be full rank"


# ---------------------------------------------------------------------------
# 2. Individual posteriors must survive a task with no recorded selection.
#    The old situation-indexed aggregation raised
#    "ValueError: array is not broadcastable to correct shape".
# ---------------------------------------------------------------------------
def test_individual_posteriors_tolerates_missing_selection():
    study, responses = build_study(n_resp=40, break_one_selection=True)
    rows, attrs, _ = CJ._build_conjoint_data_rows(study, responses)
    df = pd.DataFrame(rows)
    cs_codes, _u = pd.factorize(df["choice_set"])
    df["_situation"] = df["respondent"].astype(int) * 1_000_000 + cs_codes
    feature_cols = [c for c in df.columns
                    if c not in ("respondent", "choice_set", "alternative", "choice", "_situation")]
    X = CJ._dummy_encode_consistent_reference(df, attrs, feature_cols, groups=df["_situation"])
    varnames = list(X.columns)
    means, sds = CJ._individual_posteriors(
        df, X.values, varnames, np.zeros(len(varnames)), np.ones(len(varnames)),
        n_draws_indiv=200,
    )
    assert len(means) > 0
    assert set(means) == set(sds)


# ---------------------------------------------------------------------------
# 3. AIC/BIC must be comparable across the logit family.
#    MNL penalised by log(exploded rows) while xlogit penalises Mixed Logit / HB
#    by log(choice situations) — a log(J) per-parameter gap that made the
#    Compare Methods table unrankable.
# ---------------------------------------------------------------------------
def test_mnl_bic_uses_choice_situations():
    study, responses = build_study()
    res = CJ.calculate_mnl_analysis(study, responses)
    assert res is not None
    assert res["ic_sample_basis"] == "choice_situations"
    assert res["n_choice_situations"] < res["n_observations"], \
        "situations must be fewer than exploded alternative rows"
    expected = -2 * res["log_likelihood"] + res["n_parameters"] * np.log(res["n_choice_situations"])
    assert abs(res["bic"] - expected) < 1e-6


def test_bic_basis_matches_across_methods():
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    mnl = CJ.calculate_mnl_analysis(study, responses)
    mxl = CJ.calculate_mixed_logit_analysis(study, responses)
    assert mnl is not None and mxl is not None
    assert mnl["n_choice_situations"] == mxl["n_choice_situations"]
    assert mnl["ic_sample_basis"] == mxl["ic_sample_basis"] == "choice_situations"
    # xlogit's own BIC must agree with that basis, otherwise the two columns are
    # still on different scales even though both claim the same n.
    expected = -2 * mxl["log_likelihood"] + mxl["n_parameters"] * np.log(mxl["n_choice_situations"])
    assert abs(mxl["bic"] - expected) < 1e-4


def test_homogeneous_data_prefers_mnl_on_bic():
    """The DGP has NO taste heterogeneity, so the simple model should win.

    Raw log-likelihood cannot express this — Mixed Logit nests MNL, so its LL is
    always >= MNL's and an LL-ranked table would recommend the richer model on
    data generated without any heterogeneity at all. BIC is what makes the
    correct answer reachable.
    """
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    mnl = CJ.calculate_mnl_analysis(study, responses)
    mxl = CJ.calculate_mixed_logit_analysis(study, responses)
    assert mnl is not None and mxl is not None
    assert mxl["log_likelihood"] >= mnl["log_likelihood"] - 1e-6, \
        "sanity: the nesting model cannot fit worse in-sample"
    assert mnl["bic"] < mxl["bic"], \
        "BIC must prefer MNL when the data carry no heterogeneity"


# ---------------------------------------------------------------------------
# 4. The design generator must optimise the CHOICE-design criterion.
#    The previous version maximised det(X'X) over a pooled bag of profiles (with
#    an intercept a conditional logit cannot identify) and then assigned them to
#    sets at random — so the grouping step discarded the optimisation. Measured
#    D-efficiency was only +6..18% over random, and best-of-30 random beat it.
# ---------------------------------------------------------------------------
def _attrs_3x3x3():
    return [
        _A("a1", "Brand", [_L("b1", "X"), _L("b2", "Y"), _L("b3", "Z")]),
        _A("a2", "Price", [_L("p1", "Lo"), _L("p2", "Mid"), _L("p3", "Hi")]),
        _A("a3", "Size", [_L("s1", "S"), _L("s2", "M"), _L("s3", "L")]),
    ]


def test_design_shape_and_no_duplicate_alternatives():
    attrs = _attrs_3x3x3()
    sets = asyncio.run(CJ.generate_d_optimal_design(attrs, 3, 9))
    assert len(sets) == 9
    for cs in sets:
        keys = {tuple(sorted(p.attribute_levels.items())) for p in cs.profiles}
        assert len(keys) == 3, "a choice set must not repeat the same profile"


def test_design_beats_best_of_many_random_designs():
    attrs = _attrs_3x3x3()
    sets = asyncio.run(CJ.generate_d_optimal_design(attrs, 3, 9))
    d_opt = _choice_design_d_efficiency(sets, attrs)

    class _P:
        def __init__(self, al):
            self.attribute_levels = al

    class _CS:
        def __init__(self, pr):
            self.profiles = pr

    rng = np.random.default_rng(5)
    attr_ids = [a.id for a in attrs]
    combos = list(itertools.product(*[[l.id for l in a.levels] for a in attrs]))
    randoms = []
    for _ in range(30):
        design = []
        for _s in range(9):
            pick = rng.choice(len(combos), size=3, replace=False)
            design.append(_CS([
                _P({attr_ids[i]: combos[j][i] for i in range(len(attr_ids))}) for j in pick
            ]))
        randoms.append(_choice_design_d_efficiency(design, attrs))

    assert d_opt > float(np.mean(randoms)) * 1.25, \
        f"D-efficiency {d_opt:.4f} barely beats random mean {np.mean(randoms):.4f}"
    assert d_opt > max(randoms), \
        f"D-efficiency {d_opt:.4f} must beat best-of-30 random {max(randoms):.4f}"


def test_mnl_set_information_ignores_within_set_constants():
    """A column constant inside a set contributes nothing — this is exactly why
    the old pooled-X'X objective (which included an intercept) was measuring the
    wrong thing."""
    X = np.array([[1.0, 0.0], [1.0, 1.0], [1.0, 0.0]])  # col 0 constant in-set
    info = CJ._mnl_set_information(X)
    assert np.allclose(info[0, :], 0.0) and np.allclose(info[:, 0], 0.0)
    assert info[1, 1] > 0


# ---------------------------------------------------------------------------
# 5. HB importance is averaged over respondents, not derived from the mean.
# ---------------------------------------------------------------------------
def test_hb_importance_is_individual_based():
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    hb = CJ.calculate_hierarchical_bayes_analysis(study, responses)
    assert hb is not None
    assert hb["importance_basis"] == "individual"
    assert "importance_population_mean" in hb, "keep both definitions for comparison"
    imp = hb["importance_scores"]
    assert abs(sum(v["importance"] for v in imp.values()) - 100.0) < 1.0
    assert all("importance_sd" in v for v in imp.values())
    assert imp["attr_price"]["importance"] == max(v["importance"] for v in imp.values())


# ---------------------------------------------------------------------------
# 6. Adjusted McFadden rho-squared (needed to compare models of different size).
# ---------------------------------------------------------------------------
def test_adjusted_mcfadden_present_and_penalises_parameters():
    d = CJ._calc_fit_diagnostics(-50.0, -100.0, 3)
    assert abs(d["pseudo_r_squared"] - 0.5) < 1e-9
    # 1 - (LL - k)/LL_null = 1 - (-50 - 3)/(-100) = 0.47
    assert abs(d["pseudo_r_squared_adj"] - 0.47) < 1e-9
    assert d["pseudo_r_squared_adj"] < d["pseudo_r_squared"], "adjustment must penalise k"


def test_adjusted_mcfadden_guard_when_null_is_zero():
    d = CJ._calc_fit_diagnostics(-50.0, 0.0, 3)
    assert d["pseudo_r_squared_adj"] == 0.0


# ---------------------------------------------------------------------------
# 7. Mixed Logit / HB constrain coefficients with no detectable heterogeneity.
#    Also pins NAME-based coefficient lookup: xlogit emits 'sd.<v>' only for the
#    random subset, so positional slicing silently misreads a mixed model.
# ---------------------------------------------------------------------------
def test_mixed_logit_reports_random_and_fixed_split():
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    res = CJ.calculate_mixed_logit_analysis(study, responses)
    assert res is not None
    assert "random_vars" in res and "fixed_vars" in res
    all_vars = set(res["random_vars"]) | set(res["fixed_vars"])
    assert all_vars == set(res["coefficients"]), "every coefficient must be classified"
    assert not (set(res["random_vars"]) & set(res["fixed_vars"])), "no overlap"
    # n_parameters = K means + one SD per random coefficient.
    assert res["n_parameters"] == len(res["coefficients"]) + len(res["random_vars"])
    # A fixed coefficient has no taste SD to report.
    for v in res["fixed_vars"]:
        assert res["std_coefficients"][v] == 0.0 if v in res["std_coefficients"] else True


def test_homogeneous_dgp_flags_no_heterogeneity():
    """The DGP is a plain logit, so no coefficient should need to be random."""
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    res = CJ.calculate_mixed_logit_analysis(study, responses)
    assert res is not None
    if not res["heterogeneity_detected"]:
        assert "report MNL" in res["note"], "must tell the user to fall back to MNL"


def test_fitter_uses_name_based_lookup_not_positional():
    """Fit with an explicit random SUBSET and confirm the means still line up.

    Under the old positional slicing (`coeff_[:K]` / `coeff_[K:]`) a subset fit
    would read SD entries as means for the trailing variables.
    """
    pytest.importorskip("xlogit")
    import pandas as _pd
    study, responses = build_study(n_resp=100, n_sets=10)
    rows, attrs, _ = CJ._build_conjoint_data_rows(study, responses)
    df = _pd.DataFrame(rows)
    cs_codes, _u = _pd.factorize(df["choice_set"])
    df["_situation"] = df["respondent"].astype(int) * 1_000_000 + cs_codes
    feature_cols = [c for c in df.columns
                    if c not in ("respondent", "choice_set", "alternative", "choice", "_situation")]
    X = CJ._dummy_encode_consistent_reference(df, attrs, feature_cols, groups=df["_situation"])
    varnames = list(X.columns)

    full = CJ._fit_panel_mixed_logit(X, df, varnames, n_draws=150, auto_fixed=False)
    assert set(full["means"]) == set(varnames)
    assert full["random_vars"] == varnames
    # Price_Low is the dominant true effect; it must be recovered as a MEAN.
    assert full["means"]["Price_Low"] > full["means"]["Quality_Good"] > 0
    # Every fixed variable must carry SD exactly 0 (no 'sd.<v>' emitted for it).
    subset = CJ._fit_panel_mixed_logit(X, df, varnames, n_draws=150, auto_fixed=True)
    for v in subset["fixed_vars"]:
        assert subset["sds"][v] == 0.0
    assert subset["means"]["Price_Low"] > 0, "means must survive a subset refit"


def test_hb_exposes_random_fixed_split():
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    hb = CJ.calculate_hierarchical_bayes_analysis(study, responses)
    assert hb is not None
    assert set(hb["random_vars"]) | set(hb["fixed_vars"]) == set(hb["population_mean"])
    assert hb["n_parameters"] == len(hb["population_mean"]) + len(hb["random_vars"])


# ---------------------------------------------------------------------------
# 8. OLS no longer folds unmappable levels into the reference silently.
# ---------------------------------------------------------------------------
def test_ols_reports_excluded_levels_for_appended_level():
    study, responses = build_study(append_level="BrandD_NEW")
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    # BrandD_NEW was never shown, so its dummy is all zeros -> unestimable.
    excluded = {e["level_id"] for e in res["excluded_levels"]}
    assert "lvl_BrandD_NEW" in excluded
    brand = res["coefficients"]["attr_brand"]["levels"]
    assert brand["lvl_BrandD_NEW"]["is_excluded"] is True
    # Levels that WERE shown must still be estimated normally.
    assert brand["lvl_BrandA"]["is_excluded"] is False
    assert res["coefficients"]["attr_price"]["levels"]["lvl_Low"]["coefficient"] > 0


def test_ols_reports_excluded_levels_for_appended_attribute():
    study, responses = build_study(append_attribute=True)
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    assert any(e["attribute_id"] == "attr_new" for e in res["excluded_levels"])
    # Every profile predates the attribute, so every row is unmapped for it.
    assert res["unmapped_level_rows"].get("attr_new", 0) > 0
    assert "no longer declares" in res["note"] or "never appeared" in res["note"]
    assert res["coefficients"]["attr_price"]["levels"]["lvl_Low"]["coefficient"] > 0


def test_ols_reference_is_a_level_that_was_actually_shown():
    """With an appended level the nominal reference `levels[-1]` was never shown,
    so keeping a dummy for every other level makes them sum to 1 on every row —
    perfectly collinear with the intercept. statsmodels would pseudo-invert and
    report unidentified coefficients instead of failing."""
    study, responses = build_study(append_level="BrandD_NEW")
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    brand_ref = res["reference_levels"]["attr_brand"]
    assert brand_ref != "lvl_BrandD_NEW", "reference must be a level respondents saw"
    assert brand_ref == "lvl_BrandC", "reference = last DECLARED level actually shown"
    brand = res["coefficients"]["attr_brand"]["levels"]
    assert brand["lvl_BrandC"]["is_reference"] is True
    assert brand["lvl_BrandD_NEW"]["is_excluded"] is True
    # Exactly one reference per attribute, and it is not also excluded.
    for attr_id, entry in res["coefficients"].items():
        refs = [k for k, v in entry["levels"].items() if v["is_reference"]]
        assert len(refs) <= 1, f"{attr_id} has {len(refs)} reference levels"
        for k in refs:
            assert entry["levels"][k]["is_excluded"] is False


def test_ols_design_matrix_is_full_rank_after_post_design_edits():
    import statsmodels.api as sm
    for kwargs in ({"append_level": "BrandD_NEW"}, {"append_attribute": True}):
        study, responses = build_study(**kwargs)
        cs_map = {cs["id"]: cs for cs in study["choice_sets"]}
        res = CJ.calculate_regression_analysis(study, responses)
        assert res is not None, kwargs
        # Rebuild the design the way the function does and check its rank.
        est = [(a, l) for a, entry in res["coefficients"].items()
               for l, d in entry["levels"].items()
               if not d["is_reference"] and not d["is_excluded"]]
        rows = []
        for resp in responses:
            for ch in resp["responses"]:
                cs = cs_map.get(ch["choice_set_id"])
                if not cs:
                    continue
                for prof in cs["profiles"]:
                    rows.append([
                        1 if prof.get("attribute_levels", {}).get(a) == l else 0
                        for a, l in est
                    ])
        X = sm.add_constant(np.asarray(rows, dtype=float), has_constant="add")
        assert np.linalg.matrix_rank(X) == X.shape[1], \
            f"rank {np.linalg.matrix_rank(X)} != {X.shape[1]} columns for {kwargs}"


def test_ols_clean_study_reports_nothing_excluded():
    study, responses = build_study()
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    assert res["excluded_levels"] == []
    assert res["unmapped_level_rows"] == {}
    ref = res["coefficients"]["attr_price"]["levels"]["lvl_High"]
    assert ref["is_reference"] is True and ref["is_excluded"] is False


# ---------------------------------------------------------------------------
# 9. Design-size and sample-size rules agree with the UI.
# ---------------------------------------------------------------------------
def test_choice_set_count_scales_with_contrasts_not_alternatives():
    """A set of `a` alternatives supplies `a - 1` contrasts, so MORE alternatives
    should never require MORE tasks. The old `3K / a` formula got this backwards
    by dividing by the alternative count itself."""
    levels = [4, 4, 3, 3, 2]
    n_attr = len(levels)
    t2 = CJ.calculate_optimal_choice_sets(n_attr, levels, alternatives_per_set=2)
    t3 = CJ.calculate_optimal_choice_sets(n_attr, levels, alternatives_per_set=3)
    t4 = CJ.calculate_optimal_choice_sets(n_attr, levels, alternatives_per_set=4)
    assert t2 >= t3 >= t4, f"tasks must not grow with alternatives: {t2}, {t3}, {t4}"
    for t in (t2, t3, t4):
        assert 8 <= t <= 24


def test_choice_set_count_covers_degrees_of_freedom():
    levels = [5, 4, 4, 3, 3, 3, 2]
    n_attr = len(levels)
    a = 3
    t = CJ.calculate_optimal_choice_sets(n_attr, levels, alternatives_per_set=a)
    K = sum(levels) - n_attr
    # Capped at 24, but within the cap the design must clear the K threshold.
    if t < 24:
        assert t * (a - 1) >= 3 * K


def test_recommend_sample_size_matches_johnson_orme():
    rec = CJ.recommend_sample_size([3, 3, 2], num_sets=10, alternatives_per_set=3)
    # c = 3 (largest level count); n >= 500*3/(10*3) = 50
    assert rec["minimum"] == 50
    assert rec["recommended"] == 100
    assert rec["largest_attribute_levels"] == 3
    # The rule must be monotone: more tasks -> fewer respondents needed.
    fewer = CJ.recommend_sample_size([3, 3, 2], num_sets=5, alternatives_per_set=3)
    assert fewer["minimum"] > rec["minimum"]


# ---------------------------------------------------------------------------
# 10. Review-pass regressions (found by adversarial review of the fixes above).
# ---------------------------------------------------------------------------
def test_unusable_choice_situations_are_dropped_at_the_source():
    """A task with no usable selection breaks each estimator differently — xlogit
    rejects the whole dataset, ConditionalLogit silently drops the group (so the
    fit stats describe a different sample than the model), OLS keeps an all-zero
    outcome. It must be excluded once, where every method reads its data."""
    clean_study, clean_resp = build_study(n_resp=40, n_sets=8)
    broken_study, broken_resp = build_study(n_resp=40, n_sets=8, break_one_selection=True)

    clean_rows, _, _ = CJ._build_conjoint_data_rows(clean_study, clean_resp)
    broken_rows, _, _ = CJ._build_conjoint_data_rows(broken_study, broken_resp)
    alts = len(clean_study["choice_sets"][0]["profiles"])
    assert len(broken_rows) == len(clean_rows) - alts, "exactly one situation must be dropped"

    # Every situation that survives has exactly one chosen alternative.
    import collections
    per_sit = collections.Counter()
    for r in broken_rows:
        per_sit[(r["respondent"], r["choice_set"])] += r["choice"]
    assert set(per_sit.values()) == {1}


def test_all_methods_survive_an_unusable_choice_situation():
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=40, n_sets=8, break_one_selection=True)
    for name, fn in (("MNL", CJ.calculate_mnl_analysis),
                     ("MixedLogit", CJ.calculate_mixed_logit_analysis),
                     ("HB", CJ.calculate_hierarchical_bayes_analysis),
                     ("OLS", CJ.calculate_regression_analysis)):
        res = fn(study, responses)
        assert res is not None, f"{name} returned None on a study with one skipped task"


def test_mnl_fit_stats_describe_the_estimated_sample():
    """ConditionalLogit drops zero-variance groups internally. If such a group
    reached it, llnull / n_observations / BIC would describe a larger sample than
    the coefficients were estimated on."""
    study, responses = build_study(n_resp=40, n_sets=8, break_one_selection=True)
    res = CJ.calculate_mnl_analysis(study, responses)
    assert res is not None
    alts = len(study["choice_sets"][0]["profiles"])
    assert res["n_observations"] == res["n_choice_situations"] * alts
    # LL_null for a conditional logit = -sum(log(group size)) over the SAME groups.
    expected_null = -res["n_choice_situations"] * np.log(alts)
    assert abs(res["log_likelihood_null"] - expected_null) < 1e-6


def test_adjusted_mcfadden_is_actually_returned_by_every_logit_method():
    """v3 computed pseudo_r_squared_adj in _calc_fit_diagnostics but never put it
    in the result dicts, so the Compare tab's column was always empty."""
    pytest.importorskip("xlogit")
    study, responses = build_study(n_resp=120, n_sets=10)
    for name, fn in (("mnl", CJ.calculate_mnl_analysis),
                     ("mixed_logit", CJ.calculate_mixed_logit_analysis),
                     ("hierarchical_bayes", CJ.calculate_hierarchical_bayes_analysis)):
        res = fn(study, responses)
        assert res is not None, name
        assert "pseudo_r_squared_adj" in res, f"{name} does not return pseudo_r_squared_adj"
        assert res["pseudo_r_squared_adj"] < res["pseudo_r_squared"], name


def test_duplicate_attribute_names_drop_only_one_reference():
    """Rows are keyed by attribute NAME, so two attributes sharing a name collapse
    into one dataframe column. Choosing a reference per attribute OBJECT would
    drop two levels of that single column and lose one that should be estimated."""
    import pandas as _pd
    attrs = [
        {"id": "a1", "name": "Price", "levels": [_lvl("A"), _lvl("B"), _lvl("C")]},
        {"id": "a2", "name": "Price", "levels": [_lvl("A"), _lvl("B"), _lvl("C")]},
    ]
    rng = np.random.default_rng(2)
    rows = []
    for r in range(30):
        for s in range(6):
            for a in range(3):
                rows.append({"respondent": r, "choice_set": f"cs{s}", "alternative": a,
                             "choice": 1 if a == 0 else 0,
                             "Price": rng.choice(["A", "B", "C"])})
    df = _pd.DataFrame(rows)
    groups = df["respondent"] * 1_000_000 + _pd.factorize(df["choice_set"])[0]
    X = CJ._dummy_encode_consistent_reference(df, attrs, ["Price"], groups=groups)
    # One column collapsed, one reference dropped -> exactly 2 estimable columns.
    assert sorted(X.columns) == ["Price_A", "Price_B"], list(X.columns)


def test_ols_part_worths_carry_identification_flags():
    """The results table must not have to infer 'reference' from utility == 0."""
    study, responses = build_study(append_level="BrandD_NEW")
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    brand = res["part_worths"]["attr_brand"]["levels"]
    assert brand["lvl_BrandC"]["is_reference"] is True
    assert brand["lvl_BrandD_NEW"]["is_excluded"] is True
    assert brand["lvl_BrandA"]["is_reference"] is False
    assert brand["lvl_BrandA"]["is_excluded"] is False


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
