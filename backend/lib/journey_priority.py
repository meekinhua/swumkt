"""
"What to fix" for the quantitative Customer Journey module.

Spec: memory/CJM_QUANT_SPEC.md section 6.

The rule, stated once, because everything here follows from it:

    The action list is the decision. The quadrant is the picture of why.
    The quadrant never removes anything from the action list.

Two deliberate refusals, both because the alternative is unfalsifiable:

  * No cross-partition weighted score. Steps are PARTITIONED by who can act on
    them, never combined with hand-chosen weights.
  * No single composite priority index (Exposure x Damage, FMEA S*O*D, and so
    on). One seductive number hides which factor drives it, has no sampling
    distribution, and gets cited by students as though it were a construct from
    the literature.

Ordering is by TIER, never by rank. At R around 100 the defensible statement is
"these two steps dominate the loss", not "step A is worse than step B" — so a
step is placed above another only when the PAIRED bootstrap difference of their
counterfactual improvements excludes zero. Everything inside a tier is displayed
as unrankable, with no 1..m numbering.

This module deliberately does NOT import lib/ipma_analysis.py. That module
rescales on the sample min/max, which forces the best step to exactly 100 and
the worst to exactly 0 regardless of spread, so "every step performs badly" is
unrepresentable; and its quadrant thresholds at a hardcoded 50 while its own
docstring claims a median split.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Sequence

import numpy as np

# Eligibility for the action list (spec 6.2).
MIN_R_ACTION = 20        # respondents who exited the step
MIN_EXP_ACTION = 30      # respondents who rated the step

# Quadrant geometry (spec 6.4).
Y_CROSSHAIR = 50.0       # ABSOLUTE midpoint of the 0-100 burden scale
MIN_STATES_FOR_QUADRANT = 4
STABILITY_LABEL_CUTOFF = 0.70

OWNER_READS_AS = {
    "brand": "คุณแก้เองได้",
    "partner": "ต้องคุยกับพาร์ทเนอร์",
    "customer": "ทำได้แค่ช่วยให้ลูกค้าทำง่ายขึ้น",
    "social": "ทำได้แค่ส่งอิทธิพลทางอ้อม",
    "external": "ทำได้แค่ส่งอิทธิพลทางอ้อม",
}
SUBSTITUTABILITY_READS_AS = {
    "replaceable": "แทนที่ด้วยโซลูชันใหม่ได้",
    "assistable": "ช่วยให้ทำง่ายขึ้นได้",
    "fixed": "เปลี่ยนไม่ได้ ต้องออกแบบให้อยู่กับมัน",
}

QUADRANTS = {
    ("high", "high"): {"key": "fix_first", "label_th": "แก้ก่อนเลย"},
    ("high", "low"): {"key": "structural", "label_th": "ปัญหาเชิงโครงสร้าง"},
    ("low", "high"): {"key": "small_group", "label_th": "แก้ให้กลุ่มเล็ก"},
    ("low", "low"): {"key": "leave", "label_th": "ปล่อยไว้"},
}


# ---------------------------------------------------------------------------
# Tiering
# ---------------------------------------------------------------------------
def paired_difference_ci(boot_a: Sequence[float], boot_b: Sequence[float],
                         alpha: float = 0.05):
    """CI of (a - b) computed PAIRWISE within each bootstrap replicate.

    Pairing is the whole point: both quantities come from the same resampled
    respondents, so their errors are correlated. Comparing two independently
    summarised intervals would overstate the uncertainty of the difference and
    make everything look unrankable.
    """
    a = np.asarray(list(boot_a), dtype=float)
    b = np.asarray(list(boot_b), dtype=float)
    n = min(a.size, b.size)
    if n < 2:
        return None
    d = a[:n] - b[:n]
    return [float(np.percentile(d, 100 * alpha / 2)),
            float(np.percentile(d, 100 * (1 - alpha / 2)))]


def tier_by_paired_dominance(point: Dict[str, float],
                             boot: Dict[str, Sequence[float]],
                             alpha: float = 0.05) -> List[List[str]]:
    """Group steps into tiers. One rule, used for every displayed ordering.

    A step goes in a strictly higher tier than another only when the paired
    bootstrap difference of their point quantities excludes zero. Steps that
    cannot be separated share a tier and are displayed without numbering.
    """
    order = sorted(point, key=lambda s: point[s], reverse=True)
    if not order:
        return []
    tiers: List[List[str]] = [[order[0]]]
    for s in order[1:]:
        prev_tier = tiers[-1]
        dominated_by_all = True
        for p in prev_tier:
            ci = paired_difference_ci(boot.get(p, []), boot.get(s, []), alpha)
            # p dominates s only if the whole interval for (p - s) is above zero.
            if ci is None or ci[0] <= 0:
                dominated_by_all = False
                break
        if dominated_by_all:
            tiers.append([s])
        else:
            prev_tier.append(s)
    return tiers


# ---------------------------------------------------------------------------
# Action list
# ---------------------------------------------------------------------------
def build_action_list(steps: Sequence[str], metrics: Dict[str, dict],
                      delta_boot: Optional[Dict[str, Sequence[float]]] = None,
                      loss_unlocked: bool = True,
                      partition_key: str = "owner") -> dict:
    """Assemble the action list.

    `metrics[step]` is expected to carry, where available:
        delta_pp, delta_pp_ci95, delta_rel, delta_rel_ci95,
        l_star, l_star_ci95, reach, revisit, q, burden, burden_ci95,
        r_i, n_exp, feasibility, u, owner, substitutability

    A step is eligible only when enough people exited it, enough people rated
    it, abandon-observability is unlocked, and its improvement interval excludes
    zero. Everything else is reported but not recommended.
    """
    delta_boot = delta_boot or {}
    eligible, excluded = [], []

    for s in steps:
        m = metrics.get(s) or {}
        reasons = []
        if not loss_unlocked:
            reasons.append("ยังบอกไม่ได้ว่าลูกค้าหลุดที่ขั้นไหน (ผู้ที่เลิกสนใจยังน้อยเกินไป)")
        if (m.get("r_i") or 0) < MIN_R_ACTION:
            reasons.append("ผู้ตอบที่ผ่านขั้นนี้ยังน้อยเกินไป (%s คน ต้องการ %d)"
                           % (m.get("r_i", 0), MIN_R_ACTION))
        if (m.get("n_exp") or 0) < MIN_EXP_ACTION:
            reasons.append("ผู้ที่ให้คะแนนขั้นนี้ยังน้อยเกินไป (%s คน ต้องการ %d)"
                           % (m.get("n_exp", 0), MIN_EXP_ACTION))
        ci = m.get("delta_pp_ci95")
        if not ci or not (ci[0] > 0 or ci[1] < 0):
            reasons.append("ผลของการแก้ขั้นนี้ยังแยกจากศูนย์ไม่ได้")
        (excluded if reasons else eligible).append(
            {"step": s, "reasons": reasons} if reasons else s)

    point = {s: float((metrics.get(s) or {}).get("delta_pp") or 0.0) for s in eligible}
    tiers = tier_by_paired_dominance(point, {s: delta_boot.get(s, []) for s in eligible}) \
        if delta_boot else ([[s] for s in sorted(point, key=point.get, reverse=True)] if point else [])

    rows = []
    for ti, tier in enumerate(tiers, start=1):
        for s in tier:
            m = dict(metrics.get(s) or {})
            m.update({
                "step": s, "tier": ti,
                "tier_size": len(tier),
                "unrankable_within_tier": len(tier) > 1,
                "partition": m.get(partition_key),
                "partition_reads_as": (
                    OWNER_READS_AS.get(m.get("owner"))
                    if partition_key == "owner"
                    else SUBSTITUTABILITY_READS_AS.get(m.get("substitutability"))),
            })
            rows.append(m)

    if not rows:
        state = "empty"
    elif len(rows) == 1:
        state = "single"
    else:
        state = "populated"

    return {
        "action_list_state": state,
        "rows": rows,
        "tiers": tiers,
        "excluded": excluded,
        "tie_note_th": "แยกอันดับไม่ได้ที่ขนาดตัวอย่างนี้",
        "rule_th": ("รายการสิ่งที่ควรแก้คือข้อสรุป · แผนภาพสี่ช่องเป็นภาพอธิบายว่าทำไม "
                    "· แผนภาพไม่เคยตัดรายการใดออกจากข้อสรุป"),
    }


def sample_needed_to_separate(gap: float, halfwidth: float, r_now: int):
    """How many more respondents would separate the top two steps.

    The paired-difference half-width shrinks as 1/sqrt(R), so the R at which it
    clears the observed gap is R_now * (halfwidth / gap)^2. Returned as a count
    of PEOPLE; the caller converts to link-sends using the realised completion
    rate, because "send it to 120 more people" is the only actionable form.
    """
    if gap <= 0 or halfwidth <= 0 or r_now <= 0:
        return None
    r_needed = int(np.ceil(r_now * (halfwidth / gap) ** 2))
    return {"r_now": r_now, "r_needed": r_needed,
            "additional": max(0, r_needed - r_now)}


def empty_state_guidance(metrics: Dict[str, dict],
                         delta_boot: Dict[str, Sequence[float]],
                         r_now: int, completion_rate: float = 1.0) -> dict:
    """The designed empty state.

    At R around 100 an action list with one row or none is the MODAL outcome,
    not a failure. The dashboard says so, then shows the ordering without
    claims, then says how much more sample would separate the top two.
    """
    point = {s: float((m or {}).get("delta_pp") or 0.0) for s, m in metrics.items()}
    order = sorted(point, key=point.get, reverse=True)
    guidance = {
        "headline_th": ("ที่ขนาดตัวอย่างนี้ ยังแยกไม่ได้ว่าขั้นไหนควรแก้ก่อน — "
                        "นี่เป็นผลลัพธ์ที่พบบ่อยและไม่ใช่ความผิดพลาด"),
        "ordering_without_claims": order,
        "separation": None,
    }
    if len(order) >= 2:
        a, b = order[0], order[1]
        ci = paired_difference_ci(delta_boot.get(a, []), delta_boot.get(b, []))
        if ci:
            half = (ci[1] - ci[0]) / 2.0
            gap = abs(point[a] - point[b])
            need = sample_needed_to_separate(gap, half, r_now)
            if need:
                extra_people = need["additional"]
                sends = int(np.ceil(extra_people / completion_rate)) if completion_rate > 0 else None
                guidance["separation"] = {
                    **need, "top_two": [a, b], "gap_pp": gap, "halfwidth_pp": half,
                    "additional_link_sends": sends,
                    "message_th": (("ต้องส่งลิงก์เพิ่มอีกประมาณ %d คน จึงจะแยกสองอันดับแรกได้" % sends)
                                   if sends else None),
                }
    return guidance


# ---------------------------------------------------------------------------
# Quadrant  (a picture, with an ABSOLUTE y-axis)
# ---------------------------------------------------------------------------
def priority_quadrant(l_star: Dict[str, float], burden: Dict[str, float],
                      n_exp: Dict[str, int],
                      boot_quadrant: Optional[Dict[str, Sequence[str]]] = None) -> dict:
    """x = L*, y = Burden on the absolute 0-100 scale.

    The x-crosshair is 1/|D_plot|, which is EXACTLY the mean of L* by
    construction because L* is renormalised over the plotted set.

    The y-crosshair is the ABSOLUTE scale midpoint, not the grand mean across
    steps. Classifying against the grand mean puts half the steps above the line
    by definition, so "every step is fine" and "every step is painful" are both
    unrepresentable — and those labels are what feed the copy. The grand mean is
    still drawn, as a labelled dotted reference, and never used to classify.
    """
    steps = [s for s in l_star if s in burden]
    if not steps:
        return {"renderable": False, "reason": "no steps with both loss and burden"}
    if len(steps) < MIN_STATES_FOR_QUADRANT:
        return {"renderable": False,
                "reason": "ต้องมีอย่างน้อย %d ขั้นตอน เส้นแบ่งจึงจะมีความหมาย" % MIN_STATES_FOR_QUADRANT,
                "n_steps": len(steps)}

    x_cross = 1.0 / len(steps)
    grand_mean_burden = float(np.mean([burden[s] for s in steps]))

    points = []
    for s in steps:
        hx = "high" if l_star[s] >= x_cross else "low"
        hy = "high" if burden[s] >= Y_CROSSHAIR else "low"
        q = QUADRANTS[(hx, hy)]
        stab = None
        if boot_quadrant and s in boot_quadrant:
            reps = list(boot_quadrant[s])
            stab = (sum(1 for r in reps if r == q["key"]) / len(reps)) if reps else None
        points.append({
            "step": s, "x_l_star": l_star[s], "y_burden": burden[s],
            "n_exp": n_exp.get(s, 0),
            "radius": float(np.sqrt(max(n_exp.get(s, 0), 0))),
            "quadrant": q["key"], "quadrant_label_th": q["label_th"],
            "stability": stab,
            # Below the cutoff the LABEL on the picture is greyed. The step is
            # NOT removed from the action list — that is the one rule.
            "label_greyed": (stab is not None and stab < STABILITY_LABEL_CUTOFF),
        })

    return {
        "renderable": True,
        "x_crosshair": x_cross,
        "y_crosshair": Y_CROSSHAIR,
        "y_reference_grand_mean": grand_mean_burden,
        "y_reference_note_th": "เส้นประคือค่าเฉลี่ยของการศึกษานี้ ใช้เป็นบริบทเท่านั้น ไม่ได้ใช้จัดกลุ่ม",
        "points": points,
        "quadrant_legend": {v["key"]: v["label_th"] for v in QUADRANTS.values()},
    }


def partition_rows(rows: Sequence[dict], key: str = "owner") -> dict:
    """Partition, do not weight.

    A cross-partition weighted score with hand-chosen weights is unfalsifiable,
    so the rows are grouped by who can actually act and left ungrouped-by-score.
    """
    out: Dict[str, List[dict]] = {}
    for r in rows:
        out.setdefault(r.get(key) or "unspecified", []).append(r)
    reads = OWNER_READS_AS if key == "owner" else SUBSTITUTABILITY_READS_AS
    return {"key": key,
            "groups": [{"value": k, "reads_as_th": reads.get(k), "rows": v}
                       for k, v in out.items()]}
