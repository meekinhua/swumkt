"""
Mathematical correctness tests for the Conjoint stats engine.

Strategy: build a SYNTHETIC study where respondents choose according to a
KNOWN logit utility function (true part-worths). A correct estimator must
recover the SIGN and RANKING of those part-worths, produce a substantial
McFadden pseudo-R^2 (NOT ~0), a significant LR test, and an importance
ranking that matches which attribute we made dominant.

These tests pin down academic correctness without touching the live DB.
"""
import os
import sys
import uuid
import math
import numpy as np
import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from routes import conjoint as CJ  # noqa: E402


# ----------------------------------------------------------------------------
# Synthetic data generator with a KNOWN ground-truth utility model.
# ----------------------------------------------------------------------------
def _lvl(value):
    return {"id": f"lvl_{value}", "value": value}


def build_synthetic(n_resp=200, n_sets=10, alts=3, seed=7):
    """Returns (study, responses, true_util) for a known logit DGP.

    Reference level = LAST level of each attribute (= 0 utility), matching
    the module's encoding convention.
    """
    attrs = [
        {"id": "attr_brand", "name": "Brand",
         "levels": [_lvl("BrandA"), _lvl("BrandB"), _lvl("BrandC")]},
        {"id": "attr_price", "name": "Price",
         "levels": [_lvl("Low"), _lvl("High")]},
        {"id": "attr_qual", "name": "Quality",
         "levels": [_lvl("Good"), _lvl("Bad")]},
    ]
    # True part-worths on the logit scale (reference = last level = 0).
    # Price is intentionally the MOST important attribute (largest range).
    true_util = {
        ("attr_brand", "lvl_BrandA"): 0.4,
        ("attr_brand", "lvl_BrandB"): 0.2,
        ("attr_brand", "lvl_BrandC"): 0.0,
        ("attr_price", "lvl_Low"): 2.0,
        ("attr_price", "lvl_High"): 0.0,
        ("attr_qual", "lvl_Good"): 1.0,
        ("attr_qual", "lvl_Bad"): 0.0,
    }

    rng = np.random.default_rng(seed)

    # Full factorial of profiles.
    import itertools
    attr_ids = [a["id"] for a in attrs]
    level_ids = [[l["id"] for l in a["levels"]] for a in attrs]
    combos = list(itertools.product(*level_ids))

    def make_profile(combo):
        return {
            "id": str(uuid.uuid4()),
            "attribute_levels": {attr_ids[i]: combo[i] for i in range(len(attr_ids))},
        }

    # Build n_sets distinct choice sets of `alts` distinct profiles.
    choice_sets = []
    for s in range(n_sets):
        idx = rng.choice(len(combos), size=alts, replace=False)
        profiles = [make_profile(combos[i]) for i in idx]
        choice_sets.append({
            "id": str(uuid.uuid4()),
            "set_number": s + 1,
            "profiles": profiles,
        })

    def profile_util(profile):
        u = 0.0
        for aid, lid in profile["attribute_levels"].items():
            u += true_util.get((aid, lid), 0.0)
        return u

    # Simulate respondents: Gumbel-noise utility maximisation (= logit DGP).
    responses = []
    for r in range(n_resp):
        choices = []
        for cs in choice_sets:
            utils = np.array([profile_util(p) for p in cs["profiles"]])
            gumbel = rng.gumbel(size=len(utils))
            sel = int(np.argmax(utils + gumbel))
            choices.append({
                "choice_set_id": cs["id"],
                "selected_profile_id": cs["profiles"][sel]["id"],
            })
        responses.append({"respondent_id": f"r{r}", "responses": choices})

    study = {"attributes": attrs, "choice_sets": choice_sets}
    return study, responses, true_util


# ----------------------------------------------------------------------------
# 1. _calc_fit_diagnostics — hand-checked formula correctness.
# ----------------------------------------------------------------------------
def test_fit_diagnostics_formula():
    # LL_model = -50, LL_null = -100, k = 3 params
    d = CJ._calc_fit_diagnostics(-50.0, -100.0, 3)
    # McFadden rho^2 = 1 - (-50)/(-100) = 0.5
    assert abs(d["pseudo_r_squared"] - 0.5) < 1e-9
    # LR = 2*(LL_model - LL_null) = 2*(-50 - -100) = 100
    assert abs(d["lr_statistic"] - 100.0) < 1e-9
    assert d["lr_df"] == 3
    # chi2(100, df=3) p-value is astronomically small
    assert d["lr_p_value"] < 1e-12
    assert d["fit_label"] == "exceptional"  # rho^2 0.5 >= 0.40


def test_fit_diagnostics_null_guard():
    d = CJ._calc_fit_diagnostics(-50.0, 0.0, 3)
    assert d["fit_label"] == "n/a"
    assert d["pseudo_r_squared"] == 0.0


def test_fit_diagnostics_labels():
    # rho^2 = 0.05 -> poor ; 0.15 -> fair ; 0.25 -> good ; 0.35 -> excellent
    assert CJ._calc_fit_diagnostics(-95.0, -100.0, 2)["fit_label"] == "poor"
    assert CJ._calc_fit_diagnostics(-85.0, -100.0, 2)["fit_label"] == "fair"
    assert CJ._calc_fit_diagnostics(-75.0, -100.0, 2)["fit_label"] == "good"
    assert CJ._calc_fit_diagnostics(-65.0, -100.0, 2)["fit_label"] == "excellent"


# ----------------------------------------------------------------------------
# 2. MNL recovers the known DGP.
# ----------------------------------------------------------------------------
def test_mnl_recovers_truth():
    study, responses, true_util = build_synthetic()
    res = CJ.calculate_mnl_analysis(study, responses)
    assert res is not None, "MNL returned None"

    coefs = res["coefficients"]  # keyed by "Attr_Value", reference dropped
    # Non-reference dummies must be present, reference dummies absent.
    assert "Price_Low" in coefs and "Quality_Good" in coefs
    assert "Brand_BrandA" in coefs and "Brand_BrandB" in coefs
    assert "Price_High" not in coefs  # last level = reference, dropped
    assert "Quality_Bad" not in coefs
    assert "Brand_BrandC" not in coefs

    # Signs: all preferred levels should have positive utility.
    assert coefs["Price_Low"] > 0
    assert coefs["Quality_Good"] > 0
    assert coefs["Brand_BrandA"] > 0

    # Ranking matches the true DGP: Price(2.0) > Quality(1.0) > BrandA(0.4).
    assert coefs["Price_Low"] > coefs["Quality_Good"] > coefs["Brand_BrandA"]

    # Recovered values reasonably close to truth (within 0.4 abs at N=200).
    assert abs(coefs["Price_Low"] - 2.0) < 0.4
    assert abs(coefs["Quality_Good"] - 1.0) < 0.4

    # Fit must be substantial (NOT ~0 — the bug we are guarding against).
    assert res["pseudo_r_squared"] > 0.10, f"R2 too low: {res['pseudo_r_squared']}"
    assert res["lr_p_value"] is not None and res["lr_p_value"] < 1e-6
    assert res["lr_df"] == len(coefs)
    # LR statistic must equal 2*(LL - LL_null)
    exp_lr = 2.0 * (res["log_likelihood"] - res["log_likelihood_null"])
    assert abs(res["lr_statistic"] - exp_lr) < 1e-6


def test_mnl_importance_ranking():
    study, responses, _ = build_synthetic()
    res = CJ.calculate_mnl_analysis(study, responses)
    imp = res["importance_scores"]
    # Importances sum to ~100
    total = sum(v["importance"] for v in imp.values())
    assert abs(total - 100.0) < 0.5
    # Price must be the most important attribute.
    price_imp = imp["attr_price"]["importance"]
    qual_imp = imp["attr_qual"]["importance"]
    brand_imp = imp["attr_brand"]["importance"]
    assert price_imp > qual_imp > brand_imp


# ----------------------------------------------------------------------------
# 3. Counting method — conditional selection rate is correct.
# ----------------------------------------------------------------------------
def test_counting_conditional_rate():
    study, responses, _ = build_synthetic()
    pw = CJ.calculate_part_worths(study, responses)
    price = pw["attr_price"]["levels"]
    low = price["lvl_Low"]
    high = price["lvl_High"]
    # utility = sel/appearance*100 must lie in [0,100]
    assert 0 <= low["utility"] <= 100
    assert 0 <= high["utility"] <= 100
    # Manual recomputation of the conditional rate must match.
    assert abs(low["utility"] - (low["selection_count"] / low["appearance_count"] * 100)) < 1e-6
    # Preferred level selected more often than the dispreferred one.
    assert low["utility"] > high["utility"]
    # Quality Good > Bad too.
    q = pw["attr_qual"]["levels"]
    assert q["lvl_Good"]["utility"] > q["lvl_Bad"]["utility"]


# ----------------------------------------------------------------------------
# 4. OLS (LPM) — signs match & reference level encoded as 0.
# ----------------------------------------------------------------------------
def test_ols_signs_and_reference():
    study, responses, _ = build_synthetic()
    res = CJ.calculate_regression_analysis(study, responses)
    assert res is not None
    coefs = res["coefficients"]
    price = coefs["attr_price"]["levels"]
    # Reference (last level = High) coefficient must be exactly 0 and flagged.
    assert price["lvl_High"]["is_reference"] is True
    assert price["lvl_High"]["coefficient"] == 0.0
    # Low level positive (raises choice probability).
    assert price["lvl_Low"]["coefficient"] > 0
    assert coefs["attr_qual"]["levels"]["lvl_Good"]["coefficient"] > 0
    # R^2 reported and in [0,1].
    assert 0.0 <= res["r_squared"] <= 1.0


# ----------------------------------------------------------------------------
# 5. Reference-level consistency: MNL and OLS drop the SAME (last) level.
# ----------------------------------------------------------------------------
def test_reference_consistency_mnl_vs_ols():
    study, responses, _ = build_synthetic()
    mnl = CJ.calculate_mnl_analysis(study, responses)
    # MNL part_worths: reference level has utility ~0 (it was dropped → 0.0).
    pw = mnl["part_worths"]
    assert pw["attr_price"]["levels"]["lvl_High"]["utility"] == 0.0
    assert pw["attr_qual"]["levels"]["lvl_Bad"]["utility"] == 0.0
    assert pw["attr_brand"]["levels"]["lvl_BrandC"]["utility"] == 0.0


# ----------------------------------------------------------------------------
# 6. Orphan level handling — no silent row drop, dummy preserved.
# ----------------------------------------------------------------------------
def test_orphan_level_preserved():
    study, responses, _ = build_synthetic(n_resp=5, n_sets=4)
    # Corrupt: remove BrandA from attributes AFTER design (simulate editor bug).
    # Profiles still reference lvl_BrandA -> orphan.
    study["attributes"][0]["levels"] = [
        l for l in study["attributes"][0]["levels"] if l["id"] != "lvl_BrandA"
    ]
    rows, attrs, _ = CJ._build_conjoint_data_rows(study, responses)
    assert rows is not None
    # Some Brand cells should now be the orphan sentinel, not dropped/NaN.
    brand_vals = {r["Brand"] for r in rows}
    assert any(v.startswith("__ORPHAN_") for v in brand_vals), brand_vals
    # Row count preserved (every presented alternative still encoded).
    n_alts = sum(
        len(cs["profiles"])
        for resp in responses
        for ch in resp["responses"]
        for cs in study["choice_sets"] if cs["id"] == ch["choice_set_id"]
    )
    assert len(rows) == n_alts


def test_missing_attr_sentinel():
    study, responses, _ = build_synthetic(n_resp=5, n_sets=4)
    # Add a brand-new attribute not present in any existing profile.
    study["attributes"].append({
        "id": "attr_new", "name": "NewAttr",
        "levels": [_lvl("X"), _lvl("Y")],
    })
    rows, _, _ = CJ._build_conjoint_data_rows(study, responses)
    assert all(r["NewAttr"] == "__MISSING__" for r in rows)


# ----------------------------------------------------------------------------
# 7. Mixed Logit & HB — population means recover signs, individual posteriors.
# ----------------------------------------------------------------------------
def test_mixed_logit_signs():
    study, responses, _ = build_synthetic(n_resp=150, n_sets=10)
    res = CJ.calculate_mixed_logit_analysis(study, responses)
    assert res is not None, "Mixed Logit returned None"
    mc = res["mean_coefficients"]
    assert mc["Price_Low"] > 0 and mc["Quality_Good"] > 0
    assert mc["Price_Low"] > mc["Quality_Good"]
    # LR df = 2K (means + SDs).
    assert res["lr_df"] == 2 * len(res["coefficients"])
    assert res["pseudo_r_squared"] > 0.05


def test_hb_individual_posteriors():
    study, responses, _ = build_synthetic(n_resp=120, n_sets=10)
    res = CJ.calculate_hierarchical_bayes_analysis(study, responses)
    assert res is not None, "HB returned None"
    # Population means recover signs.
    assert res["population_mean"]["Price_Low"] > 0
    # Individual posteriors must exist and differ across respondents (the
    # whole point of HB vs Mixed Logit).
    sample = res["individual_posteriors_sample"]
    assert len(sample) > 0
    price_betas = [s["betas"]["Price_Low"] for s in sample]
    assert np.std(price_betas) > 0, "individual posteriors are identical — not real HB"
    # Quantiles + pct_positive present.
    q = res["individual_quantiles"]["Price_Low"]
    assert q["q10"] <= q["q50"] <= q["q90"]
    assert 0.0 <= q["pct_positive"] <= 100.0


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
