"""
Absorbing-Markov estimation for the quantitative Customer Journey module.

Pure maths: no FastAPI, no database, no LLM. Everything here is deterministic
given its inputs and a seed, so a student can reproduce their own thesis numbers.

Design source: memory/CJM_QUANT_SPEC.md. The rules below are load-bearing and
were argued for there; they are restated because breaking one silently produces
a number that looks fine and is wrong.

  * There is NO SAMPLER. The Dirichlet is a smoothing prior. No MCMC, no chain,
    no burn-in, nothing that can fail to converge. (A previous module in this
    codebase was caught describing a Gibbs sampler it never ran.)
  * The expected-transition mask NEVER touches the data. It is instrument
    guidance and a diagnostic; masking observed transitions would delete
    evidence that the design was wrong.
  * Journeys whose ending the respondent could not report go to a third
    absorbing state, UNKNOWN, and are COUNTED, never imputed. Every conversion
    figure therefore ships with a Manski bound.
  * A p-value is emitted only when the test is actually evaluable. `gated_p`
    returns None otherwise, and the payload must carry `evaluable: False`
    rather than a number nobody may use.

References
  Anderson & Goodman (1957), Ann. Math. Statist. 28(1), 89-110.
  Grinstead & Snell (1997), Introduction to Probability, 2nd ed., section 11.2.
  Kemeny & Snell (1976), Finite Markov Chains, 2nd ed., Ch. 3.
  Anderl, Becker, von Wangenheim & Schumann (2016), IJRM 33(3), 457-474.
  Efron & Tibshirani (1993), An Introduction to the Bootstrap, Ch. 8.
  Efron (1987), JASA 82(397), 171-185  (BCa).
  Wilson (1927), JASA 22(158), 209-212.
  Manski (2003), Partial Identification of Probability Distributions, Ch. 1-2.
  Bickenbach & Bode (2003), Int. Regional Science Review 26(3), 363-392.
"""
from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

import numpy as np

START = "START"
CONV = "CONV"
ABANDON = "ABANDON"
UNKNOWN = "UNKNOWN"
ABSORBING = (CONV, ABANDON, UNKNOWN)

# Display / recommendation thresholds (spec 3.2).
MIN_R_ROW_DISPLAY = 10      # show a row at all
MIN_R_EDGE_LABEL = 25       # put a number on an edge
MIN_R_RECOMMEND = 60        # base a recommendation on it
MIN_ABANDONERS_FOR_LOSS = 20
MAX_Q_CI_HALFWIDTH = 0.15


class JourneyModelError(ValueError):
    """Raised when the chain cannot be estimated. Never return a garbage inverse."""


# ---------------------------------------------------------------------------
# 1. Sequences
# ---------------------------------------------------------------------------
def build_sequences(states: Sequence[str], responses: Sequence[dict]):
    """Turn stored responses into state sequences START -> ... -> absorbing.

    Every sequence terminates in exactly one absorbing state. A respondent who
    could not report an ending terminates in UNKNOWN. That mass is observed and
    carried through to the Manski bound, never dropped and never imputed.
    """
    known = set(states)
    seqs: List[List[str]] = []
    meta = {"n_responses": len(responses), "dropped_unknown_state": 0,
            "terminal_counts": {CONV: 0, ABANDON: 0, UNKNOWN: 0}, "empty_path": 0}

    for r in responses:
        raw = sorted(r.get("path") or [], key=lambda p: p.get("order", 0))
        clean = []
        for p in raw:
            s = p.get("state_id")
            if s in known:
                clean.append(s)
            elif s is not None:
                meta["dropped_unknown_state"] += 1

        term = str(r.get("terminal") or "").upper()
        if term not in ABSORBING:
            term = UNKNOWN
        meta["terminal_counts"][term] += 1
        if not clean:
            meta["empty_path"] += 1
        seqs.append([START] + clean + [term])

    return seqs, meta


# ---------------------------------------------------------------------------
# 2. Counts  (no mask -- spec 2.6)
# ---------------------------------------------------------------------------
def count_transitions(seqs: Sequence[Sequence[str]], states: Sequence[str]):
    """Pooled first-order counts, second-order counts, and the gate quantity r_i.

    Returns (n_ij, n_hij, r_i) where
        n_ij  : (m+1) x (m+3)  transient -> destination
        n_hij : dict[(h, i)] -> vector over destinations, for the order-2 test
        r_i   : dict state -> number of DISTINCT respondents exiting i

    r_i, not the transition count, is what gates display. One respondent looping
    a step five times is one person's evidence, not five.
    """
    transient = [START] + list(states)
    dest = list(states) + list(ABSORBING)
    ti = {s: k for k, s in enumerate(transient)}
    di = {s: k for k, s in enumerate(dest)}

    n_ij = np.zeros((len(transient), len(dest)), dtype=float)
    n_hij: Dict[Tuple[str, str], np.ndarray] = {}
    exits_by_resp: Dict[str, set] = {s: set() for s in transient}

    for ridx, seq in enumerate(seqs):
        for t in range(len(seq) - 1):
            i, j = seq[t], seq[t + 1]
            if i not in ti or j not in di:
                continue
            n_ij[ti[i], di[j]] += 1
            exits_by_resp[i].add(ridx)
            if t >= 1:
                key = (seq[t - 1], i)
                if key not in n_hij:
                    n_hij[key] = np.zeros(len(dest), dtype=float)
                n_hij[key][di[j]] += 1

    r_i = {s: len(v) for s, v in exits_by_resp.items()}
    return n_ij, n_hij, r_i


# ---------------------------------------------------------------------------
# 3. Estimator  (spec 3.2)
# ---------------------------------------------------------------------------
def estimate_transition_matrix(n_ij: np.ndarray, alpha0: float = 1.0):
    """Dirichlet-smoothed MLE. alpha0 is TOTAL prior mass per row, spread over
    all |D| destinations -- one pseudo-observation per row, not one per cell.

    The smoothing is load-bearing engineering, not decoration: alpha0 > 0
    guarantees every transient row has positive mass into ABANDON and UNKNOWN,
    which guarantees certain absorption, which guarantees (I - Q) is invertible.
    It also means B[START, CONV] > 0 in every bootstrap replicate, so no
    replicate ever has to be discarded and redrawn -- which would condition on
    at least one converter and bias the distribution upward.

    Returns (p_tilde, p_hat). p_hat is the raw MLE, stored for reporting.
    """
    n_ij = np.asarray(n_ij, dtype=float)
    n_dest = n_ij.shape[1]
    row = n_ij.sum(axis=1, keepdims=True)

    with np.errstate(invalid="ignore", divide="ignore"):
        p_hat = np.where(row > 0, n_ij / np.where(row == 0, 1.0, row), 0.0)
    p_tilde = (n_ij + alpha0 / n_dest) / (row + alpha0)

    bad = np.abs(p_tilde.sum(axis=1) - 1.0) > 1e-9
    if bad.any():
        raise JourneyModelError(
            "smoothed rows do not sum to 1: rows %s" % np.where(bad)[0].tolist())
    return p_tilde, p_hat


def _split_QR(p_tilde: np.ndarray, n_states: int):
    """P = [[Q, R], [0, I]] with transient = START + states, absorbing = 3."""
    n_tr = n_states + 1
    Q = np.hstack([np.zeros((n_tr, 1)), p_tilde[:, :n_states]])  # nothing enters START
    R = p_tilde[:, n_states:]
    return Q, R


def fundamental_matrix(p_tilde: np.ndarray, n_states: int, cond_limit: float = 1e12):
    """N = (I - Q)^-1, with the pre-flight checks raised in production code.

    Returns (N, Q, R). Raises JourneyModelError rather than handing back a
    garbage inverse -- a silently wrong N would poison every downstream weight.
    """
    Q, R = _split_QR(p_tilde, n_states)
    n_tr = Q.shape[0]
    rho = float(max(abs(np.linalg.eigvals(Q))))
    if rho >= 1.0 - 1e-12:
        raise JourneyModelError(
            "spectral radius of Q is %.6f; absorption is not certain" % rho)
    A = np.eye(n_tr) - Q
    cond = float(np.linalg.cond(A))
    if not np.isfinite(cond) or cond > cond_limit:
        raise JourneyModelError("(I - Q) is ill-conditioned (cond=%.3e)" % cond)
    N = np.linalg.inv(A)
    if not np.all(np.isfinite(N)):
        raise JourneyModelError("fundamental matrix contains non-finite entries")
    return N, Q, R


def reach_and_revisit(N: np.ndarray, states: Sequence[str]):
    """Split expected visits into P(ever reach) and E[visits | reached].

    The identity N[i,j] = h_ij * N[j,j] makes the decomposition exact and free.
    Node size on the map is `reach`, because a step everyone touches once and a
    step half the sample touches twice both give visits = 1.0 and mean entirely
    different things.
    """
    out = {}
    for k, s in enumerate(states, start=1):   # row/col 0 is START
        njj = float(N[k, k])
        v = float(N[0, k])
        reach = (v / njj) if njj > 0 else 0.0
        out[s] = {"visits": v, "reach": min(1.0, max(0.0, reach)), "revisit": njj}
    return out


def absorption(N: np.ndarray, R: np.ndarray):
    """B = N.R -- probability of ending in each absorbing state, from each transient."""
    return N @ R


# ---------------------------------------------------------------------------
# 4. Expected-loss decomposition  (spec 3.5) -- the primary CJM weight
# ---------------------------------------------------------------------------
def loss_decomposition(N, R, p_tilde, states, displayed=None, atol=1e-9):
    """Split observed lost customers across steps. Exact identity, not a claim:

        B[START, ABANDON] = sum_j visits_j * q_j        q_j = p[j, ABANDON]

    Asserted at runtime. If the identity fails, the map must not render.

    L_star renormalises over the DISPLAYED set, so the quadrant crosshair
    1/|D_plot| is exactly the mean of exactly the plotted quantity.
    """
    n_states = len(states)
    B = absorption(N, R)
    transient = [START] + list(states)
    ab_col, un_col = 1, 2          # order within R is (CONV, ABANDON, UNKNOWN)

    q = {s: float(p_tilde[k, n_states + ab_col]) for k, s in enumerate(transient)}
    u = {s: float(p_tilde[k, n_states + un_col]) for k, s in enumerate(transient)}
    v = {s: float(N[0, k]) for k, s in enumerate(transient)}

    total_abandon = float(B[0, ab_col])
    total_unknown = float(B[0, un_col])

    recomposed = sum(v[s] * q[s] for s in transient)
    if abs(recomposed - total_abandon) > atol:
        raise JourneyModelError(
            "loss identity violated: sum(v_j*q_j)=%.12f vs B[START,ABANDON]=%.12f"
            % (recomposed, total_abandon))

    L = {s: (v[s] * q[s] / total_abandon if total_abandon > 0 else 0.0) for s in transient}
    U = {s: (v[s] * u[s] / total_unknown if total_unknown > 0 else 0.0) for s in transient}

    if displayed is None:
        displayed = list(states)
    displayed = [s for s in displayed if s in set(states)]
    denom = sum(L[s] for s in displayed)
    L_star = {s: (L[s] / denom if denom > 0 else 0.0) for s in displayed}

    return {
        "q": q, "u": u, "visits": v,
        "L": L, "L_star": L_star, "U": U,
        "loss_per_100": {s: 100.0 * v[s] * q[s] for s in transient},
        "displayed": displayed,
        "crosshair_x": (1.0 / len(displayed)) if displayed else None,
        "excluded_loss_share": max(0.0, 1.0 - denom),
        "loss_before_journey": L[START],
        "total_abandon": total_abandon,
        "total_unknown": total_unknown,
    }


def manski_bounds(B: np.ndarray):
    """Conversion is an interval, always -- at any level of UNKNOWN mass.

    Saying "above 25% censoring treat it as an upper bound" would imply
    unbiasedness below 25%, which was never true.
    """
    lo = float(B[0, 0])
    width = float(B[0, 2])
    return {"lo": lo, "hi": min(1.0, lo + width), "width": width}


# ---------------------------------------------------------------------------
# 5. Counterfactual and removal effect  (spec 3.8)
# ---------------------------------------------------------------------------
def counterfactual_delta(p_tilde, states, step, delta=0.25):
    """Cut step `step`'s abandon rate by `delta` and re-solve.

    Freed mass is redistributed over onward destinations ONLY -- never into
    ABANDON (the thing being reduced) and never into UNKNOWN (fixing a step does
    not fix the respondent's memory).

    This is a sensitivity property of a descriptive chain fitted to recalled
    observational data. It is not a forecast and not a causal effect.
    """
    n_states = len(states)
    transient = [START] + list(states)
    if step not in transient:
        raise JourneyModelError("unknown step %r" % (step,))
    k = transient.index(step)
    ab, un = n_states + 1, n_states + 2

    N0, _, R0 = fundamental_matrix(p_tilde, n_states)
    base = float(absorption(N0, R0)[0, 0])

    q_j, u_j = float(p_tilde[k, ab]), float(p_tilde[k, un])
    onward = 1.0 - q_j - u_j
    if onward <= 1e-12:
        return {"step": step, "delta": delta, "base": base, "new": base,
                "delta_pp": 0.0, "delta_rel": 0.0, "degenerate": True}

    P = p_tilde.copy()
    freed = delta * q_j
    P[k, ab] = (1.0 - delta) * q_j
    scale = 1.0 + freed / onward
    for c in range(P.shape[1]):
        if c not in (ab, un):
            P[k, c] *= scale
    P[k, un] = u_j
    P[k, :] = P[k, :] / P[k, :].sum()

    N1, _, R1 = fundamental_matrix(P, n_states)
    new = float(absorption(N1, R1)[0, 0])
    return {"step": step, "delta": delta, "base": base, "new": new,
            "delta_pp": (new - base) * 100.0,
            "delta_rel": ((new - base) / base) if base > 0 else 0.0,
            "degenerate": False}


def removal_effects(p_tilde, states, min_r=None, r_i=None):
    """Anderl et al. (2016) removal effect: route a step's mass straight to
    ABANDON and measure the drop in conversion.

    Flags the degeneracy where every respondent passes through a step, which
    otherwise crowns the payment step the most important touchpoint in every
    study ever run.
    """
    n_states = len(states)
    transient = [START] + list(states)
    ab = n_states + 1
    N0, _, R0 = fundamental_matrix(p_tilde, n_states)
    base = float(absorption(N0, R0)[0, 0])

    out = {}
    for s in states:
        if min_r is not None and r_i is not None and r_i.get(s, 0) < min_r:
            out[s] = {"removal_effect": None, "suppressed": True, "r_i": r_i.get(s, 0)}
            continue
        k = transient.index(s)
        P = p_tilde.copy()
        P[k, :] = 0.0
        P[k, ab] = 1.0
        try:
            N1, _, R1 = fundamental_matrix(P, n_states)
            new = float(absorption(N1, R1)[0, 0])
        except JourneyModelError:
            out[s] = {"removal_effect": None, "suppressed": True, "reason": "singular"}
            continue
        re = ((base - new) / base) if base > 0 else 0.0
        out[s] = {"removal_effect": re, "suppressed": False,
                  "degenerate_universal": bool(re > 0.999)}
    return {"base_conversion": base, "by_step": out}


# ---------------------------------------------------------------------------
# 6. Gates  (spec 4)
# ---------------------------------------------------------------------------
def gated_p(stat: Optional[float], df: Optional[int], evaluable: bool):
    """Return a p-value ONLY when the test is evaluable. Never a number the
    reader is not allowed to use."""
    if not evaluable or stat is None or df is None or df <= 0:
        return None
    try:
        from scipy.stats import chi2
        return float(chi2.sf(max(stat, 0.0), df=df))
    except Exception:
        return None


def test_order1(n_ij: np.ndarray, states: Sequence[str], expected_min: float = 5.0,
                cell_fraction: float = 0.80):
    """Order-1 vs order-0 likelihood ratio.

    START IS EXCLUDED. Nothing ever transitions into START, so its row is
    structurally guaranteed to differ from the pooled marginal; including it
    manufactures rejection on data generated with literally zero memory.

    Evaluability is measured per cell, never from a closed form: at least
    `cell_fraction` of cells in the reduced table must have expected count >= 5.
    At R around 100 this test is usually NOT evaluable, and it says so.

    Asymmetric by design: when evaluable and non-significant it BLOCKS the
    weighted map. When not evaluable it abstains. It can never be cited as
    evidence FOR the Markov property.
    """
    sub = np.asarray(n_ij, dtype=float)[1:, :]          # drop the START row
    keep_r = sub.sum(axis=1) > 0
    keep_c = sub.sum(axis=0) > 0
    tab = sub[np.ix_(keep_r, keep_c)]
    a_, b_ = tab.shape
    if a_ < 2 or b_ < 2:
        return {"lambda1": None, "df": None, "p": None, "evaluable": False,
                "cells_meeting_e5": 0.0, "verdict": "abstain",
                "reason": "table degenerate after dropping empty margins"}

    total = tab.sum()
    expected = tab.sum(axis=1, keepdims=True) @ tab.sum(axis=0, keepdims=True) / total
    frac = float((expected >= expected_min).mean())
    evaluable = frac >= cell_fraction

    with np.errstate(divide="ignore", invalid="ignore"):
        ratio = np.where((tab > 0) & (expected > 0), tab / np.where(expected == 0, 1.0, expected), 1.0)
        lam = 2.0 * float(np.sum(np.where(tab > 0, tab * np.log(ratio), 0.0)))
    df = (a_ - 1) * (b_ - 1)
    p = gated_p(lam, df, evaluable)

    if not evaluable:
        verdict = "abstain"
    elif p is not None and p < 0.05:
        verdict = "order1_supported"
    else:
        verdict = "block"      # the sequence shows no memory
    return {"lambda1": lam, "df": df, "p": p, "evaluable": evaluable,
            "cells_meeting_e5": frac, "table_shape": [a_, b_], "verdict": verdict}


def crossval_perplexity(seqs, states, folds=5, alpha0=1.0, seed=20260818):
    """Gate B -- held-out predictive skill. THE blocking gate.

    5-fold CV over RESPONDENTS, never over transitions: splitting one person's
    transitions across folds leaks their own behaviour into their test set.
    The order-0 baseline is fitted on the TRAIN folds only.
    """
    seqs = list(seqs)
    R = len(seqs)
    if R < 20:
        return {"evaluable": False, "reason": "fewer than 20 respondents",
                "ppl_order1": None, "ppl_order0": None, "skill": None,
                "verdict": "abstain"}

    rng = np.random.default_rng(seed)
    parts = np.array_split(rng.permutation(R), folds)
    dest = list(states) + list(ABSORBING)
    di = {s: k for k, s in enumerate(dest)}
    transient = [START] + list(states)
    ti = {s: k for k, s in enumerate(transient)}

    ll1 = ll0 = 0.0
    M = 0
    for f in range(folds):
        test = set(parts[f].tolist())
        train = [seqs[i] for i in range(R) if i not in test]
        held = [seqs[i] for i in range(R) if i in test]
        if not train or not held:
            continue
        n_ij, _, _ = count_transitions(train, states)
        p1, _ = estimate_transition_matrix(n_ij, alpha0)
        marg = n_ij.sum(axis=0)
        p0 = (marg + alpha0 / len(dest)) / (marg.sum() + alpha0)
        for seq in held:
            for t in range(len(seq) - 1):
                i, j = seq[t], seq[t + 1]
                if i not in ti or j not in di:
                    continue
                ll1 += math.log(max(float(p1[ti[i], di[j]]), 1e-300))
                ll0 += math.log(max(float(p0[di[j]]), 1e-300))
                M += 1
    if M == 0:
        return {"evaluable": False, "reason": "no held-out transitions",
                "ppl_order1": None, "ppl_order0": None, "skill": None,
                "verdict": "abstain"}

    ppl1 = math.exp(-ll1 / M)
    ppl0 = math.exp(-ll0 / M)
    skill = (1.0 - ppl1 / ppl0) if ppl0 > 0 else 0.0
    return {"evaluable": True, "ppl_order1": ppl1, "ppl_order0": ppl0,
            "skill": skill, "n_transitions": M,
            "verdict": "pass" if skill > 0 else "block"}


# ---------------------------------------------------------------------------
# 7. Uncertainty  (spec 3.10)
# ---------------------------------------------------------------------------
def bootstrap_respondents(seqs, statistic: Callable[[List[List[str]]], Any],
                          B: int = 2000, seed: int = 20260818):
    """Cluster bootstrap: resample PEOPLE with replacement, never transitions.

    The dependence that matters is one respondent contributing to several
    different rows, correlating the whole map. No within-row design effect can
    see that; resampling people can.

    Returns (values, n_failed). Replicates are never discarded and redrawn --
    non-finite ones are dropped and COUNTED, so the payload can report them.
    """
    rng = np.random.default_rng(seed)
    R = len(seqs)
    vals, failed = [], 0
    if R == 0:
        return vals, failed
    for _ in range(B):
        pick = rng.integers(0, R, size=R)
        rep = [seqs[i] for i in pick]
        try:
            v = statistic(rep)
        except Exception:
            failed += 1
            continue
        if not np.all(np.isfinite(np.atleast_1d(np.asarray(v, dtype=float)))):
            failed += 1
            continue
        vals.append(v)
    return vals, failed


def jackknife_respondents(seqs, statistic):
    """Leave-one-respondent-out, for the BCa acceleration term."""
    out = []
    for i in range(len(seqs)):
        try:
            out.append(float(statistic(seqs[:i] + seqs[i + 1:])))
        except Exception:
            continue
    return np.asarray(out, dtype=float)


def percentile_interval(boot, alpha=0.05):
    b = np.asarray([float(x) for x in boot], dtype=float)
    if b.size == 0:
        return None
    return [float(np.percentile(b, 100 * alpha / 2)),
            float(np.percentile(b, 100 * (1 - alpha / 2)))]


def bca_interval(theta_hat: float, boot, jack, alpha: float = 0.05):
    """Bias-corrected and accelerated interval (Efron 1987).

    Used for the three quantities that drive decisions -- L_star, delta and
    B[START, CONV]. Those are bounded, skewed ratios with mass near zero,
    exactly the regime where percentile intervals under-cover.
    """
    b = np.asarray([float(x) for x in boot], dtype=float)
    j = np.asarray(jack, dtype=float)
    if b.size == 0:
        return None
    if j.size < 2:
        return percentile_interval(b, alpha)
    try:
        from scipy.stats import norm
    except Exception:
        return percentile_interval(b, alpha)

    prop = float(np.mean(b < theta_hat))
    prop = min(max(prop, 1.0 / (2 * b.size)), 1.0 - 1.0 / (2 * b.size))
    z0 = float(norm.ppf(prop))

    jbar = float(np.mean(j))
    num = float(np.sum((jbar - j) ** 3))
    den = 6.0 * (float(np.sum((jbar - j) ** 2)) ** 1.5)
    a = (num / den) if den != 0 else 0.0

    edges = []
    for qq in (alpha / 2, 1 - alpha / 2):
        z = float(norm.ppf(qq))
        denom = 1 - a * (z0 + z)
        if abs(denom) < 1e-12:
            return percentile_interval(b, alpha)
        adj = float(norm.cdf(z0 + (z0 + z) / denom))
        edges.append(float(np.percentile(b, 100 * min(max(adj, 1e-6), 1 - 1e-6))))
    lo, hi = sorted(edges)
    return [lo, hi]


def wilson_interval(x: int, n: int, z: float = 1.96):
    """Wilson score interval on RAW integer respondent counts.

    Wald is banned outright: it collapses to zero width at p in {0, 1},
    manufacturing false certainty at exactly the sparse cells that dominate here.
    """
    x, n = int(x), int(n)
    if n <= 0:
        return None
    centre = (x + z * z / 2) / (n + z * z)
    half = z / (n + z * z) * math.sqrt(x * (n - x) / n + z * z / 4)
    return [max(0.0, centre - half), min(1.0, centre + half)]


# ---------------------------------------------------------------------------
# 8. Diagnostics
# ---------------------------------------------------------------------------
def low_information_sensitivity(p_tilde, states, r_i, threshold=MIN_R_ROW_DISPLAY):
    """Does the map depend materially on a step almost nobody reported?

    Low-information rows STAY in the chain -- Q must be complete -- but we
    recompute with that row's mass routed entirely to UNKNOWN and report how far
    the headline moves.
    """
    n_states = len(states)
    transient = [START] + list(states)
    un = n_states + 2
    N0, _, R0 = fundamental_matrix(p_tilde, n_states)
    base = float(absorption(N0, R0)[0, 0])

    flagged = []
    for s in states:
        if r_i.get(s, 0) >= threshold:
            continue
        k = transient.index(s)
        P = p_tilde.copy()
        P[k, :] = 0.0
        P[k, un] = 1.0
        try:
            N1, _, R1 = fundamental_matrix(P, n_states)
            moved = abs(float(absorption(N1, R1)[0, 0]) - base)
        except JourneyModelError:
            moved = float("inf")
        flagged.append({"state": s, "r_i": r_i.get(s, 0), "conversion_shift": moved})
    return {"base_conversion": base, "low_information_rows": flagged}


def empirical_routes(seqs, top_k: int = 8):
    """Most common observed routes. Requires no Markov assumption at all --
    this is what Phase 1 ships before any chain is fitted."""
    from collections import Counter
    c = Counter(" > ".join(s) for s in seqs)
    total = sum(c.values())
    return [{"route": r, "count": n,
             "share": (n / total if total else 0.0),
             "share_ci95": wilson_interval(n, total)}
            for r, n in c.most_common(top_k)]


def sample_adequacy(r_i: Dict[str, int], n_respondents: int, n_states: int,
                    n_abandoners: int):
    """Bands stated as rules of thumb, never as a power calculation."""
    rows_ok = sum(1 for s, v in r_i.items() if s != START and v >= MIN_R_ROW_DISPLAY)
    edges_ok = sum(1 for s, v in r_i.items() if s != START and v >= MIN_R_EDGE_LABEL)

    if n_respondents < 30:
        level = "insufficient"
        msg = ("มีผู้ตอบ %d คน — ยังน้อยเกินกว่าจะประมาณเส้นทางได้ "
               "ระบบจะแสดงเฉพาะเส้นทางที่พบบ่อย" % n_respondents)
    elif n_respondents < 100:
        level = "provisional"
        msg = "มีผู้ตอบ %d คน — ดูแนวโน้มได้ แต่ตัวเลขบนลูกศรจะยังแกว่ง" % n_respondents
    elif n_respondents < 200:
        level = "adequate"
        msg = "มีผู้ตอบ %d คน — เพียงพอสำหรับแผนที่ถ่วงน้ำหนักภาพรวม" % n_respondents
    else:
        level = "strong"
        msg = "มีผู้ตอบ %d คน — เพียงพอทั้งภาพรวมและการแยกกลุ่มย่อย" % n_respondents

    unlocked = n_abandoners >= MIN_ABANDONERS_FOR_LOSS
    return {
        "level": level, "message": msg,
        "n_respondents": n_respondents, "n_abandoners": n_abandoners,
        "rows_displayable": rows_ok, "rows_edge_labelled": edges_ok,
        "n_states": n_states,
        "loss_view_unlocked": unlocked,
        "loss_view_reason": (None if unlocked else
                             "ต้องมีผู้ที่เลิกสนใจอย่างน้อย %d คน จึงจะบอกได้ว่าลูกค้าหลุดที่ขั้นไหน "
                             "(ตอนนี้มี %d คน)" % (MIN_ABANDONERS_FOR_LOSS, n_abandoners)),
        "frame_class": ("buyers_only"
                        if n_respondents > 0 and (n_abandoners / n_respondents) < 0.05
                        else "mixed"),
    }
