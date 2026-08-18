"""Tests for the journey burden model and the "what to fix" decision rule.

Spec: memory/CJM_QUANT_SPEC.md sections 2.3 and 6.

The budget tests exist so the documented figure and the computed figure cannot
drift apart. The priority tests exist because the ordering shown to a student is
a claim about what to spend money on.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from lib import journey_budget as JB      # noqa: E402
from lib import journey_priority as JP    # noqa: E402


# ===========================================================================
# Budget
# ===========================================================================
def test_reference_instrument_matches_the_documented_figure():
    """Spec 2.3 works a reference instrument to 330.1 s and 29.3 scored items."""
    e = JB.estimate(**JB.REFERENCE_INSTRUMENT)
    assert abs(e["seconds_median"] - 330.0) <= 15.0, e["seconds_median"]
    assert abs(e["scored_items"] - 29.3) <= 1.0, e["scored_items"]
    # The spec's screens TOTAL row says 18.0 while its own screens column sums to
    # 16.95. The model computes the column, not the typo.
    assert abs(e["screens"] - 17.0) <= 1.0, e["screens"]
    assert e["blocked"] is False
    assert e["headroom_pct"] > 25.0, "the reference instrument should have real headroom"


def test_percentiles_are_reported_because_the_median_is_not_the_experience():
    e = JB.estimate(**JB.REFERENCE_INSTRUMENT)
    assert e["seconds_p75"] > e["seconds_median"] < e["seconds_p95"]
    # both figures are rounded to 1dp for display, so compare with that tolerance
    assert abs(e["seconds_p75"] / e["seconds_median"] - JB.P75_MULTIPLIER) < 1e-3
    assert "75%" in e["estimate_note_th"]


def test_blocker_fires_on_a_realistic_overshoot():
    """m=7, a 6-step path and 3 pain nominations is a plausible design, and it
    must be refused rather than fielded."""
    e = JB.estimate(**{**JB.REFERENCE_INSTRUMENT,
                       "m_states": 7, "mean_path_length": 6.0, "pain_nominations": 3.0})
    assert e["blocked"] is True
    assert e["blockers"]


def test_state_cap_depends_on_the_recruitment_target():
    """Eight steps is fine at 400 respondents and indefensible at 100."""
    assert JB.max_states_for_target(100) == 5
    assert JB.max_states_for_target(200) == 7
    assert JB.max_states_for_target(400) == JB.MAX_STATES

    small = JB.check_design(8, 100, **{k: v for k, v in JB.REFERENCE_INSTRUMENT.items()
                                       if k != "m_states"})
    big = JB.check_design(8, 400, **{k: v for k, v in JB.REFERENCE_INSTRUMENT.items()
                                     if k != "m_states"})
    assert small["blocked"] is True and "100" in small["blockers"][-1]
    assert big["blocked"] is False


def test_every_block_is_itemised_so_an_over_budget_student_can_cut():
    e = JB.estimate(**JB.REFERENCE_INSTRUMENT)
    assert len(e["blocks"]) >= 10
    assert abs(sum(b["seconds"] for b in e["blocks"])
               + e["screens"] * JB.SEC_PAGE_TRANSITION - e["seconds_median"]) < 0.5
    assert all(b.get("name") for b in e["blocks"]), "each block needs a Thai label"


def test_solution_level_adds_the_outcome_grid():
    a = JB.estimate(**JB.REFERENCE_INSTRUMENT)
    b = JB.estimate(**{**JB.REFERENCE_INSTRUMENT, "level": "solution", "n_odi_outcomes": 10})
    assert b["seconds_median"] > a["seconds_median"]
    assert b["scored_items"] > a["scored_items"]


# ===========================================================================
# Tiering — the one ordering rule
# ===========================================================================
def _boot(mean, sd, n=400, seed=1):
    return list(np.random.default_rng(seed).normal(mean, sd, n))


def test_clearly_separated_steps_land_in_different_tiers():
    point = {"a": 5.0, "b": 1.0}
    boot = {"a": _boot(5.0, 0.2, seed=1), "b": _boot(1.0, 0.2, seed=2)}
    tiers = JP.tier_by_paired_dominance(point, boot)
    assert tiers == [["a"], ["b"]]


def test_overlapping_steps_share_a_tier_and_are_not_ranked():
    """At R about 100 the honest statement is 'these two dominate', never
    'A is worse than B'."""
    point = {"a": 3.0, "b": 2.9}
    boot = {"a": _boot(3.0, 2.0, seed=3), "b": _boot(2.9, 2.0, seed=4)}
    tiers = JP.tier_by_paired_dominance(point, boot)
    assert len(tiers) == 1 and set(tiers[0]) == {"a", "b"}


def test_paired_difference_is_computed_within_replicates():
    """Pairing matters: both quantities come from the same resampled people, so
    their errors are correlated. Treating them as independent would make
    everything look unrankable."""
    rng = np.random.default_rng(7)
    common = rng.normal(0, 3.0, 500)          # shared respondent-level noise
    a = common + 5.0
    b = common + 1.0                          # always exactly 4 apart
    ci = JP.paired_difference_ci(a, b)
    assert ci[0] > 0, "a dominates b in every replicate"
    assert (ci[1] - ci[0]) < 0.5, "pairing should cancel the shared noise"


def test_paired_ci_needs_two_replicates():
    assert JP.paired_difference_ci([1.0], [0.5]) is None


# ===========================================================================
# Action list
# ===========================================================================
def _metrics(**over):
    base = {"r_i": 40, "n_exp": 50, "delta_pp": 2.0, "delta_pp_ci95": [0.5, 3.5],
            "l_star": 0.3, "burden": 60.0, "owner": "brand"}
    base.update(over)
    return base


def test_step_is_excluded_when_its_effect_cannot_be_separated_from_zero():
    steps = ["a", "b"]
    metrics = {"a": _metrics(), "b": _metrics(delta_pp=0.4, delta_pp_ci95=[-1.0, 1.8])}
    out = JP.build_action_list(steps, metrics, delta_boot={
        "a": _boot(2.0, 0.3, seed=5), "b": _boot(0.4, 0.9, seed=6)})
    assert [r["step"] for r in out["rows"]] == ["a"]
    assert out["excluded"][0]["step"] == "b"
    assert any("ศูนย์" in r for r in out["excluded"][0]["reasons"])


def test_thin_steps_are_excluded_with_a_reason_a_student_can_act_on():
    out = JP.build_action_list(["a"], {"a": _metrics(r_i=5, n_exp=8)})
    assert out["rows"] == []
    reasons = out["excluded"][0]["reasons"]
    assert any("ผู้ตอบที่ผ่านขั้นนี้" in r for r in reasons)
    assert any("ให้คะแนน" in r for r in reasons)


def test_locked_loss_view_blocks_the_whole_list():
    out = JP.build_action_list(["a"], {"a": _metrics()}, loss_unlocked=False)
    assert out["action_list_state"] == "empty"
    assert any("หลุดที่ขั้นไหน" in r for r in out["excluded"][0]["reasons"])


def test_rows_carry_their_tier_and_say_when_a_tier_cannot_be_ordered():
    steps = ["a", "b", "c"]
    metrics = {s: _metrics(delta_pp=v) for s, v in zip(steps, (5.0, 2.9, 3.0))}
    # a is far enough above both to dominate them; b and c are 0.1 apart with the
    # same spread, so they must stay inseparable.
    boot = {"a": _boot(5.0, 0.3, seed=8), "b": _boot(2.9, 0.3, seed=9),
            "c": _boot(3.0, 0.3, seed=10)}
    out = JP.build_action_list(steps, metrics, delta_boot=boot)
    assert out["action_list_state"] == "populated"
    top = [r for r in out["rows"] if r["tier"] == 1]
    assert [r["step"] for r in top] == ["a"]
    rest = [r for r in out["rows"] if r["tier"] == 2]
    assert {r["step"] for r in rest} == {"b", "c"}
    assert all(r["unrankable_within_tier"] for r in rest)
    assert "แยกอันดับไม่ได้" in out["tie_note_th"]


def test_partition_reads_as_who_can_act():
    out = JP.build_action_list(["a"], {"a": _metrics(owner="partner")},
                               delta_boot={"a": _boot(2.0, 0.3, seed=11)})
    assert out["rows"][0]["partition_reads_as"] == "ต้องคุยกับพาร์ทเนอร์"


def test_partition_does_not_weight():
    rows = [{"step": "a", "owner": "brand"}, {"step": "b", "owner": "customer"}]
    part = JP.partition_rows(rows, key="owner")
    assert {g["value"] for g in part["groups"]} == {"brand", "customer"}
    # No combined score anywhere in the output.
    assert not any("score" in k for g in part["groups"] for r in g["rows"] for k in r)


# ===========================================================================
# The designed empty state
# ===========================================================================
def test_empty_state_says_how_many_more_people_would_separate_the_top_two():
    metrics = {"a": _metrics(delta_pp=3.0), "b": _metrics(delta_pp=2.4)}
    boot = {"a": _boot(3.0, 2.0, seed=12), "b": _boot(2.4, 2.0, seed=13)}
    g = JP.empty_state_guidance(metrics, boot, r_now=100, completion_rate=0.5)
    assert "ไม่ใช่ความผิดพลาด" in g["headline_th"]
    assert g["ordering_without_claims"][0] == "a"
    sep = g["separation"]
    assert sep and sep["r_needed"] > sep["r_now"]
    # a 50% completion rate means twice as many link-sends as people needed
    assert sep["additional_link_sends"] >= sep["additional"]
    assert "ส่งลิงก์เพิ่ม" in sep["message_th"]


def test_separation_maths_scales_as_root_n():
    a = JP.sample_needed_to_separate(gap=1.0, halfwidth=2.0, r_now=100)
    assert a["r_needed"] == 400          # (2/1)^2 * 100
    assert JP.sample_needed_to_separate(gap=0.0, halfwidth=2.0, r_now=100) is None


# ===========================================================================
# Quadrant
# ===========================================================================
def test_quadrant_y_axis_is_absolute_not_the_sample_mean():
    """Against a grand-mean crosshair, half the steps sit above the line by
    definition, so 'every step is fine' is unrepresentable. These four steps are
    ALL low-burden and must all be classified low."""
    l_star = {"a": 0.4, "b": 0.3, "c": 0.2, "d": 0.1}
    burden = {"a": 20.0, "b": 22.0, "c": 25.0, "d": 18.0}
    q = JP.priority_quadrant(l_star, burden, {s: 40 for s in l_star})
    assert q["renderable"] is True
    assert q["y_crosshair"] == 50.0
    assert all(p["quadrant"] in ("structural", "leave") for p in q["points"]), \
        "no step may be labelled high-burden when none exceeds the scale midpoint"
    assert q["y_reference_grand_mean"] < 50.0
    assert "ไม่ได้ใช้จัดกลุ่ม" in q["y_reference_note_th"]


def test_quadrant_x_crosshair_is_exactly_the_mean_of_l_star():
    l_star = {"a": 0.4, "b": 0.3, "c": 0.2, "d": 0.1}
    burden = {s: 55.0 for s in l_star}
    q = JP.priority_quadrant(l_star, burden, {s: 30 for s in l_star})
    assert abs(q["x_crosshair"] - 0.25) < 1e-12
    assert abs(q["x_crosshair"] - sum(l_star.values()) / len(l_star)) < 1e-12


def test_quadrant_refuses_to_render_below_four_steps():
    q = JP.priority_quadrant({"a": 0.6, "b": 0.4}, {"a": 60.0, "b": 40.0}, {"a": 30, "b": 30})
    assert q["renderable"] is False


def test_unstable_label_is_greyed_but_the_step_is_never_removed():
    """The one rule: the quadrant is a picture, and it never removes anything
    from the action list."""
    l_star = {"a": 0.4, "b": 0.3, "c": 0.2, "d": 0.1}
    burden = {"a": 70.0, "b": 60.0, "c": 40.0, "d": 30.0}
    boot_q = {"a": ["fix_first"] * 3 + ["structural"] * 7}   # unstable
    q = JP.priority_quadrant(l_star, burden, {s: 40 for s in l_star}, boot_quadrant=boot_q)
    pa = next(p for p in q["points"] if p["step"] == "a")
    assert pa["stability"] == pytest.approx(0.3)
    assert pa["label_greyed"] is True

    action = JP.build_action_list(["a"], {"a": _metrics()},
                                  delta_boot={"a": _boot(2.0, 0.3, seed=14)})
    assert [r["step"] for r in action["rows"]] == ["a"], \
        "an unstable quadrant label must not remove the step from the action list"
    assert "ไม่เคยตัดรายการใดออก" in action["rule_th"]


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
