"""Phase 0 tests for the quantitative Customer Journey maths.

Every assertion is against a chain whose answer is known ANALYTICALLY, or against
an identity the module claims at runtime. Spec: memory/CJM_QUANT_SPEC.md 8.8.

The point of shipping this before any UI exists is that a journey map is a
picture — a wrong number in it looks exactly like a right one.
"""
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from lib import markov_journey as MJ  # noqa: E402

START, CONV, ABANDON, UNKNOWN = MJ.START, MJ.CONV, MJ.ABANDON, MJ.UNKNOWN


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def resp(path, terminal):
    return {"path": [{"state_id": s, "order": i} for i, s in enumerate(path)],
            "terminal": terminal}


def simulate(P_rows, states, n, seed=7, max_steps=40):
    """Generate sequences from a KNOWN transition specification.

    P_rows maps a transient state to {destination: probability}.
    """
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        cur, path, steps = START, [], 0
        term = UNKNOWN
        while steps < max_steps:
            row = P_rows[cur]
            dests = list(row.keys())
            probs = np.array([row[d] for d in dests], dtype=float)
            probs = probs / probs.sum()
            nxt = dests[int(rng.choice(len(dests), p=probs))]
            if nxt in MJ.ABSORBING:
                term = nxt
                break
            path.append(nxt)
            cur = nxt
            steps += 1
        out.append(resp(path, term))
    return out


# ---------------------------------------------------------------------------
# 1. Sequences and counts
# ---------------------------------------------------------------------------
def test_sequences_always_start_and_absorb():
    states = ["a", "b"]
    seqs, meta = MJ.build_sequences(states, [
        resp(["a", "b"], "CONV"), resp(["a"], "ABANDON"), resp([], "nonsense"),
    ])
    assert all(s[0] == START for s in seqs)
    assert all(s[-1] in MJ.ABSORBING for s in seqs)
    assert seqs[2][-1] == UNKNOWN, "an unrecognised terminal must become UNKNOWN, not be dropped"
    assert meta["terminal_counts"][UNKNOWN] == 1
    assert meta["empty_path"] == 1


def test_unknown_states_are_counted_not_silently_dropped():
    seqs, meta = MJ.build_sequences(["a"], [resp(["a", "ghost", "a"], "CONV")])
    assert seqs[0] == [START, "a", "a", CONV]
    assert meta["dropped_unknown_state"] == 1


def test_r_i_counts_people_not_transitions():
    """One respondent looping a step five times is one person's evidence."""
    states = ["a", "b"]
    seqs, _ = MJ.build_sequences(states, [resp(["a", "a", "a", "a", "b"], "CONV")])
    n_ij, _, r_i = MJ.count_transitions(seqs, states)
    assert r_i["a"] == 1
    assert n_ij.sum() == 6, "START>a>a>a>a>b>CONV is six transitions, from one person"


def test_nothing_ever_enters_start():
    states = ["a"]
    seqs, _ = MJ.build_sequences(states, [resp(["a"], "CONV")] * 5)
    n_ij, _, _ = MJ.count_transitions(seqs, states)
    p, _ = MJ.estimate_transition_matrix(n_ij)
    Q, _ = MJ._split_QR(p, len(states))
    assert np.allclose(Q[:, 0], 0.0)


# ---------------------------------------------------------------------------
# 2. Estimator
# ---------------------------------------------------------------------------
def test_smoothing_is_one_pseudo_observation_per_row():
    """alpha0 is TOTAL prior mass per row, spread over all destinations."""
    n_ij = np.zeros((2, 4))
    n_ij[0, 0] = 9.0
    p, p_hat = MJ.estimate_transition_matrix(n_ij, alpha0=1.0)
    assert abs(p[0, 0] - (9 + 0.25) / 10.0) < 1e-12
    assert abs(p_hat[0, 0] - 1.0) < 1e-12
    assert np.allclose(p.sum(axis=1), 1.0)


def test_smoothing_guarantees_absorption_even_for_an_unobserved_row():
    """A row with zero observations still gets positive mass into ABANDON and
    UNKNOWN, which is what makes (I - Q) invertible."""
    states = ["a", "b"]
    n_ij = np.zeros((3, 5))
    n_ij[0, 0] = 20.0            # START -> a only
    p, _ = MJ.estimate_transition_matrix(n_ij)
    assert p[2, 3] > 0 and p[2, 4] > 0
    N, _, R = MJ.fundamental_matrix(p, len(states))
    assert np.all(np.isfinite(N))


def test_estimate_converges_to_the_mle_as_n_grows():
    states = ["a", "b"]
    spec = {START: {"a": 1.0},
            "a": {"b": 0.6, ABANDON: 0.3, UNKNOWN: 0.1},
            "b": {CONV: 0.7, ABANDON: 0.3}}
    prev = None
    for n in (200, 2000, 20000):
        seqs, _ = MJ.build_sequences(states, simulate(spec, states, n, seed=n))
        n_ij, _, _ = MJ.count_transitions(seqs, states)
        p, _ = MJ.estimate_transition_matrix(n_ij)
        err = abs(float(p[1, 1]) - 0.6)          # a -> b
        if prev is not None:
            assert err < prev, "smoothed estimate must approach the truth as n grows"
        prev = err
    assert prev < 0.02


# ---------------------------------------------------------------------------
# 3. Absorbing-chain core, against an ANALYTICALLY known answer
# ---------------------------------------------------------------------------
def _hand_built_chain():
    """START -> a (certain); a -> b w.p. .5, ABANDON .5; b -> CONV .5, a .5.

    Solved by hand with Q on transient order [START, a, b]:
        N = (I-Q)^-1, and from START:
        P(reach a) = 1, E[visits to a] = 1/(1 - .5*.5) = 4/3
        E[visits to b] = .5 * 4/3 = 2/3
        P(CONV from START) = 1/3
    """
    states = ["a", "b"]
    # columns: a, b, CONV, ABANDON, UNKNOWN
    p = np.array([
        [1.0, 0.0, 0.0, 0.0, 0.0],   # START
        [0.0, 0.5, 0.0, 0.5, 0.0],   # a
        [0.5, 0.0, 0.5, 0.0, 0.0],   # b
    ], dtype=float)
    return states, p


def test_fundamental_matrix_matches_hand_solution():
    states, p = _hand_built_chain()
    N, _, R = MJ.fundamental_matrix(p, len(states))
    assert abs(N[0, 1] - 4.0 / 3.0) < 1e-12, "expected visits to a"
    assert abs(N[0, 2] - 2.0 / 3.0) < 1e-12, "expected visits to b"
    B = MJ.absorption(N, R)
    assert abs(B[0, 0] - 1.0 / 3.0) < 1e-12, "P(CONV) from START"
    assert abs(B[0, 1] - 2.0 / 3.0) < 1e-12, "P(ABANDON) from START"
    assert np.allclose(B.sum(axis=1), 1.0)


def test_reach_times_revisit_equals_visits():
    """The identity N[i,j] = h_ij * N[j,j] is what lets node size mean
    'how many people came through', not 'expected visits'."""
    states, p = _hand_built_chain()
    N, _, _ = MJ.fundamental_matrix(p, len(states))
    rr = MJ.reach_and_revisit(N, states)
    for s in states:
        assert abs(rr[s]["reach"] * rr[s]["revisit"] - rr[s]["visits"]) < 1e-12
    assert abs(rr["a"]["reach"] - 1.0) < 1e-12
    assert abs(rr["b"]["reach"] - 0.5) < 1e-12
    assert abs(rr["a"]["revisit"] - 4.0 / 3.0) < 1e-12


def test_a_step_reached_once_by_all_differs_from_one_reached_twice_by_half():
    """Both give visits = 1.0 and mean entirely different things."""
    states = ["x"]
    all_once = np.array([[1.0, 0, 0, 0], [0, 1.0, 0, 0]], dtype=float)
    N1, _, _ = MJ.fundamental_matrix(all_once, 1)
    half_twice = np.array([[0.5, 0.0, 0.5, 0.0], [0.5, 0.0, 0.5, 0.0]], dtype=float)
    N2, _, _ = MJ.fundamental_matrix(half_twice, 1)
    r1 = MJ.reach_and_revisit(N1, states)["x"]
    r2 = MJ.reach_and_revisit(N2, states)["x"]
    assert abs(r1["visits"] - r2["visits"]) < 1e-9, "fixture: visits deliberately equal"
    assert r1["reach"] > r2["reach"]
    assert r2["revisit"] > r1["revisit"]


def test_singular_chain_raises_instead_of_returning_garbage():
    states = ["a"]
    # columns: a, CONV, ABANDON, UNKNOWN. START -> a, and a -> a forever.
    absorbing_never = np.array([[1.0, 0.0, 0.0, 0.0],
                                [1.0, 0.0, 0.0, 0.0]], dtype=float)
    with pytest.raises(MJ.JourneyModelError):
        MJ.fundamental_matrix(absorbing_never, len(states))


# ---------------------------------------------------------------------------
# 4. Loss decomposition -- the primary weight
# ---------------------------------------------------------------------------
def test_loss_identity_holds_and_shares_sum_to_one():
    states, p = _hand_built_chain()
    N, _, R = MJ.fundamental_matrix(p, len(states))
    dec = MJ.loss_decomposition(N, R, p, states)
    assert abs(sum(dec["L_star"].values()) - 1.0) < 1e-12
    recomposed = sum(dec["visits"][s] * dec["q"][s] for s in [START] + states)
    assert abs(recomposed - dec["total_abandon"]) < 1e-12


def test_loss_identity_violation_refuses_to_render():
    states, p = _hand_built_chain()
    N, _, R = MJ.fundamental_matrix(p, len(states))
    tampered = p.copy()
    tampered[1, 3] += 0.2          # break the identity deliberately
    with pytest.raises(MJ.JourneyModelError):
        MJ.loss_decomposition(N, R, tampered, states)


def test_crosshair_is_exactly_the_mean_of_the_plotted_quantity():
    """1/|D_plot| must be the mean of exactly the plotted quantity -- the whole
    reason L* is renormalised over the displayed set rather than over all
    transient states."""
    states = ["a", "b"]
    # columns: a, b, CONV, ABANDON, UNKNOWN. Both steps lose customers.
    p = np.array([[1.0, 0.0, 0.0, 0.0, 0.0],
                  [0.0, 0.6, 0.0, 0.4, 0.0],
                  [0.0, 0.0, 0.7, 0.3, 0.0]], dtype=float)
    N, _, R = MJ.fundamental_matrix(p, len(states))

    both = MJ.loss_decomposition(N, R, p, states)
    assert both["crosshair_x"] == 0.5
    vals = list(both["L_star"].values())
    assert abs(both["crosshair_x"] - sum(vals) / len(vals)) < 1e-12
    assert abs(both["excluded_loss_share"]) < 1e-12

    only_a = MJ.loss_decomposition(N, R, p, states, displayed=["a"])
    assert only_a["crosshair_x"] == 1.0
    assert abs(sum(only_a["L_star"].values()) - 1.0) < 1e-12
    assert only_a["excluded_loss_share"] > 0, "b's loss share must be reported as excluded"


def test_loss_before_journey_is_separated():
    """People who reported doing nothing at all are real but are not a fixable
    touchpoint, so they are reported separately."""
    states = ["a"]
    p = np.array([[0.5, 0.0, 0.5, 0.0],
                  [0.0, 0.5, 0.5, 0.0]], dtype=float)
    N, _, R = MJ.fundamental_matrix(p, 1)
    dec = MJ.loss_decomposition(N, R, p, states)
    assert dec["loss_before_journey"] > 0
    assert START not in dec["L_star"]


# ---------------------------------------------------------------------------
# 5. Manski bounds -- UNKNOWN is counted, never imputed
# ---------------------------------------------------------------------------
def test_manski_bound_width_equals_unknown_mass():
    states = ["a"]
    p = np.array([[1.0, 0, 0, 0],
                  [0.0, 0.5, 0.2, 0.3]], dtype=float)
    N, _, R = MJ.fundamental_matrix(p, len(states))
    B = MJ.absorption(N, R)
    mb = MJ.manski_bounds(B)
    assert abs(mb["width"] - float(B[0, 2])) < 1e-12
    assert abs(mb["hi"] - (mb["lo"] + mb["width"])) < 1e-12
    assert mb["lo"] <= mb["hi"] <= 1.0


def test_bound_is_reported_even_at_tiny_censoring():
    states = ["a"]
    p = np.array([[1.0, 0, 0, 0],
                  [0.0, 0.60, 0.39, 0.01]], dtype=float)
    N, _, R = MJ.fundamental_matrix(p, len(states))
    mb = MJ.manski_bounds(MJ.absorption(N, R))
    assert mb["width"] > 0, "no censoring level is treated as unbiased"


# ---------------------------------------------------------------------------
# 6. Counterfactual and removal effect
# ---------------------------------------------------------------------------
def test_counterfactual_never_moves_mass_into_abandon_or_unknown():
    states, p = _hand_built_chain()
    p = p.copy()
    p[1] = [0.0, 0.4, 0.0, 0.4, 0.2]      # a: onward .4, abandon .4, unknown .2
    out = MJ.counterfactual_delta(p, states, "a", delta=0.25)
    assert out["delta_pp"] > 0
    assert not out["degenerate"]

    # rebuild the modified row to confirm UNKNOWN is untouched
    n_states = len(states)
    ab, un = n_states + 1, n_states + 2
    P = p.copy()
    q_j, u_j = P[1, ab], P[1, un]
    freed = 0.25 * q_j
    P[1, ab] = 0.75 * q_j
    scale = 1.0 + freed / (1.0 - q_j - u_j)
    for c in range(P.shape[1]):
        if c not in (ab, un):
            P[1, c] *= scale
    assert abs(P[1, un] - u_j) < 1e-12, "fixing a step must not fix recall"
    assert abs(P[1, :].sum() - 1.0) < 1e-9


def test_counterfactual_is_zero_when_there_is_nowhere_onward_to_go():
    states = ["a"]
    p = np.array([[1.0, 0, 0, 0],
                  [0.0, 0.0, 0.7, 0.3]], dtype=float)   # a: no onward mass at all
    out = MJ.counterfactual_delta(p, list(states), "a")
    assert out["degenerate"] is True
    assert out["delta_pp"] == 0.0


def test_removal_effect_flags_the_universal_step_degeneracy():
    """A step every respondent passes through gets RE = 1.0 by construction and
    must be flagged, not crowned."""
    states = ["pay"]
    p = np.array([[1.0, 0, 0, 0],
                  [0.0, 0.8, 0.2, 0.0]], dtype=float)
    out = MJ.removal_effects(p, states)
    assert out["by_step"]["pay"]["degenerate_universal"] is True


def test_removal_effect_suppressed_below_min_r():
    states = ["a"]
    p = np.array([[1.0, 0, 0, 0], [0.0, 0.5, 0.5, 0.0]], dtype=float)
    out = MJ.removal_effects(p, states, min_r=25, r_i={"a": 4})
    assert out["by_step"]["a"]["suppressed"] is True
    assert out["by_step"]["a"]["removal_effect"] is None


# ---------------------------------------------------------------------------
# 7. Gates
# ---------------------------------------------------------------------------
def test_order1_excludes_start_and_does_not_reject_a_memoryless_chain():
    """The headline correction: including START manufactures rejection on data
    generated with literally zero memory."""
    states = ["a", "b", "c"]
    common = {"a": 0.25, "b": 0.25, "c": 0.2, CONV: 0.1, ABANDON: 0.15, UNKNOWN: 0.05}
    spec = {START: {"a": 1 / 3, "b": 1 / 3, "c": 1 / 3}}
    for s in states:
        spec[s] = dict(common)
    seqs, _ = MJ.build_sequences(states, simulate(spec, states, 400, seed=11))
    n_ij, _, _ = MJ.count_transitions(seqs, states)

    res = MJ.test_order1(n_ij, states)
    assert res["table_shape"][0] <= len(states), "START row must be excluded"
    if res["evaluable"]:
        assert res["p"] is not None and res["p"] > 0.01, (
            "memoryless data must not be declared order-1 (p=%s)" % res["p"])
        assert res["verdict"] == "block"


def test_order1_abstains_and_emits_no_p_value_when_not_evaluable():
    states = ["a", "b", "c", "d", "e", "f"]
    spec = {START: {s: 1 / 6 for s in states}}
    for s in states:
        spec[s] = {**{t: 0.1 for t in states}, CONV: 0.2, ABANDON: 0.15, UNKNOWN: 0.05}
    seqs, _ = MJ.build_sequences(states, simulate(spec, states, 25, seed=3))
    n_ij, _, _ = MJ.count_transitions(seqs, states)
    res = MJ.test_order1(n_ij, states)
    assert res["evaluable"] is False
    assert res["p"] is None, "no p-value may be emitted when the test is not evaluable"
    assert res["verdict"] == "abstain"


def test_gated_p_never_returns_a_number_when_not_evaluable():
    assert MJ.gated_p(100.0, 10, evaluable=False) is None
    assert MJ.gated_p(None, 10, evaluable=True) is None
    assert MJ.gated_p(100.0, 0, evaluable=True) is None
    assert MJ.gated_p(100.0, 10, evaluable=True) is not None


def test_gate_b_detects_real_structure_and_rejects_noise():
    states = ["a", "b", "c"]
    structured = {START: {"a": 1.0},
                  "a": {"b": 0.9, ABANDON: 0.1},
                  "b": {"c": 0.9, ABANDON: 0.1},
                  "c": {CONV: 0.9, ABANDON: 0.1}}
    seqs, _ = MJ.build_sequences(states, simulate(structured, states, 200, seed=5))
    g = MJ.crossval_perplexity(seqs, states)
    assert g["evaluable"] and g["skill"] > 0 and g["verdict"] == "pass"

    common = {"a": 0.25, "b": 0.25, "c": 0.2, CONV: 0.15, ABANDON: 0.1, UNKNOWN: 0.05}
    memoryless = {START: {s: 1 / 3 for s in states}}
    for s in states:
        memoryless[s] = dict(common)
    seqs2, _ = MJ.build_sequences(states, simulate(memoryless, states, 200, seed=6))
    g2 = MJ.crossval_perplexity(seqs2, states)
    assert g2["evaluable"]
    assert g2["skill"] < g["skill"], "memoryless data must show far less predictive skill"


def test_gate_b_abstains_on_a_tiny_sample():
    states = ["a"]
    seqs, _ = MJ.build_sequences(states, [resp(["a"], "CONV")] * 5)
    g = MJ.crossval_perplexity(seqs, states)
    assert g["evaluable"] is False and g["skill"] is None


# ---------------------------------------------------------------------------
# 8. Uncertainty
# ---------------------------------------------------------------------------
def _conv_stat(states):
    def f(seqs):
        n_ij, _, _ = MJ.count_transitions(seqs, states)
        p, _ = MJ.estimate_transition_matrix(n_ij)
        N, _, R = MJ.fundamental_matrix(p, len(states))
        return float(MJ.absorption(N, R)[0, 0])
    return f


def test_bootstrap_resamples_people_and_ci_narrows_as_root_n():
    states = ["a", "b"]
    spec = {START: {"a": 1.0},
            "a": {"b": 0.7, ABANDON: 0.3},
            "b": {CONV: 0.6, ABANDON: 0.4}}
    widths = []
    for n in (60, 240):
        seqs, _ = MJ.build_sequences(states, simulate(spec, states, n, seed=n))
        boot, failed = MJ.bootstrap_respondents(seqs, _conv_stat(states), B=300, seed=1)
        assert failed == 0, "smoothing must make every replicate finite"
        assert len(boot) == 300
        ci = MJ.percentile_interval(boot)
        widths.append(ci[1] - ci[0])
    ratio = widths[0] / widths[1]
    assert 1.4 < ratio < 3.0, "CI width should shrink roughly as 1/sqrt(n), got %.2f" % ratio


def test_bca_interval_brackets_the_estimate():
    states = ["a"]
    spec = {START: {"a": 1.0}, "a": {CONV: 0.4, ABANDON: 0.6}}
    seqs, _ = MJ.build_sequences(states, simulate(spec, states, 120, seed=9))
    stat = _conv_stat(states)
    theta = stat(seqs)
    boot, _ = MJ.bootstrap_respondents(seqs, stat, B=300, seed=2)
    jack = MJ.jackknife_respondents(seqs, stat)
    ci = MJ.bca_interval(theta, boot, jack)
    assert ci is not None and ci[0] <= theta <= ci[1]
    assert 0.0 <= ci[0] < ci[1] <= 1.0


def test_wilson_never_collapses_to_zero_width_at_the_boundary():
    """Wald is banned precisely because it manufactures certainty here."""
    for x, n in ((0, 30), (30, 30)):
        lo, hi = MJ.wilson_interval(x, n)
        assert hi - lo > 0.05
    assert MJ.wilson_interval(5, 0) is None


def test_wilson_takes_integer_counts_only():
    lo, hi = MJ.wilson_interval(12, 40)
    assert 0 < lo < 12 / 40 < hi < 1


# ---------------------------------------------------------------------------
# 9. Diagnostics and adequacy
# ---------------------------------------------------------------------------
def test_low_information_rows_stay_in_the_chain_but_are_flagged():
    states = ["a", "b"]
    p = np.array([[0.9, 0.1, 0.0, 0.0, 0.0],
                  [0.0, 0.5, 0.3, 0.2, 0.0],
                  [0.0, 0.0, 0.4, 0.4, 0.2]], dtype=float)
    out = MJ.low_information_sensitivity(p, states, {"a": 40, "b": 3})
    flagged = [f["state"] for f in out["low_information_rows"]]
    assert flagged == ["b"], "only the thin row is flagged"
    assert out["low_information_rows"][0]["conversion_shift"] >= 0
    N, _, R = MJ.fundamental_matrix(p, 2)
    assert float(MJ.absorption(N, R)[0, 0]) > 0, "the thin row still contributes to N"


def test_empirical_routes_need_no_markov_assumption():
    states = ["a", "b"]
    seqs, _ = MJ.build_sequences(states, [resp(["a", "b"], "CONV")] * 7
                                 + [resp(["a"], "ABANDON")] * 3)
    routes = MJ.empirical_routes(seqs)
    assert routes[0]["count"] == 7
    assert abs(routes[0]["share"] - 0.7) < 1e-9
    lo, hi = routes[0]["share_ci95"]
    assert lo < 0.7 < hi


def test_sample_adequacy_bands_and_loss_lock():
    a = MJ.sample_adequacy({"a": 5}, n_respondents=12, n_states=3, n_abandoners=2)
    assert a["level"] == "insufficient" and a["loss_view_unlocked"] is False
    assert "12" in a["message"]

    b = MJ.sample_adequacy({"a": 40}, n_respondents=150, n_states=3, n_abandoners=45)
    assert b["level"] == "adequate" and b["loss_view_unlocked"] is True

    c = MJ.sample_adequacy({"a": 90}, n_respondents=300, n_states=3, n_abandoners=100)
    assert c["level"] == "strong"


def test_buyers_only_frame_is_detected_not_declared():
    a = MJ.sample_adequacy({"a": 90}, n_respondents=200, n_states=3, n_abandoners=4)
    assert a["frame_class"] == "buyers_only"
    assert a["loss_view_unlocked"] is False
    b = MJ.sample_adequacy({"a": 90}, n_respondents=200, n_states=3, n_abandoners=60)
    assert b["frame_class"] == "mixed"


# ---------------------------------------------------------------------------
# 10. Payload invariants the spec calls out by name
# ---------------------------------------------------------------------------
def test_no_mcmc_vocabulary_anywhere_in_the_module():
    """A previous module in this codebase was caught describing a Gibbs sampler
    it never ran. There is no sampler here and the words must not appear."""
    import inspect
    full = inspect.getsource(MJ)
    # The module docstring explains WHY there is no sampler, so it legitimately
    # names them. Everything after it must not.
    body = full.split('"""', 2)[-1].lower()
    for banned in ("gibbs", "metropolis", "burn-in", "burnin", "wishart", "gelman", "mcmc"):
        assert banned not in body, (
            "%r appears outside the module docstring: there is no sampler here" % banned)
    # And where the docstring does name them, it is only to deny them.
    head = full.split('"""', 2)[1].lower()
    for line in head.splitlines():
        if any(b in line for b in ("gibbs", "mcmc", "burn-in")):
            assert ("no " in line or "never" in line or "not " in line), line


def test_end_to_end_on_a_realistic_study():
    states = ["รู้จัก", "หาข้อมูล", "เปรียบเทียบ", "ตัดสินใจ", "ชำระเงิน"]
    spec = {
        START: {"รู้จัก": 0.9, ABANDON: 0.1},
        "รู้จัก": {"หาข้อมูล": 0.75, ABANDON: 0.2, UNKNOWN: 0.05},
        "หาข้อมูล": {"เปรียบเทียบ": 0.7, "รู้จัก": 0.05, ABANDON: 0.2, UNKNOWN: 0.05},
        "เปรียบเทียบ": {"ตัดสินใจ": 0.55, "หาข้อมูล": 0.1, ABANDON: 0.3, UNKNOWN: 0.05},
        "ตัดสินใจ": {"ชำระเงิน": 0.8, ABANDON: 0.15, UNKNOWN: 0.05},
        "ชำระเงิน": {CONV: 0.85, ABANDON: 0.12, UNKNOWN: 0.03},
    }
    responses = simulate(spec, states, 150, seed=42)
    seqs, meta = MJ.build_sequences(states, responses)
    n_ij, _, r_i = MJ.count_transitions(seqs, states)
    p, _ = MJ.estimate_transition_matrix(n_ij)
    N, _, R = MJ.fundamental_matrix(p, len(states))
    B = MJ.absorption(N, R)

    displayed = [s for s in states if r_i.get(s, 0) >= MJ.MIN_R_ROW_DISPLAY]
    dec = MJ.loss_decomposition(N, R, p, states, displayed=displayed)
    assert abs(sum(dec["L_star"].values()) - 1.0) < 1e-12

    mb = MJ.manski_bounds(B)
    assert mb["lo"] <= mb["hi"]

    adq = MJ.sample_adequacy(r_i, len(responses), len(states),
                             meta["terminal_counts"][ABANDON])
    assert adq["level"] == "adequate" and adq["loss_view_unlocked"] is True

    # the loss ranking must find the step the generator actually made worst
    top = max(dec["L_star"], key=dec["L_star"].get)
    assert top in ("เปรียบเทียบ", "หาข้อมูล"), "recovered top-loss step was %s" % top


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v", "-s"]))
