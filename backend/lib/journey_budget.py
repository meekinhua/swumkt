"""
Respondent-burden model for the quantitative Customer Journey instrument.

Spec: memory/CJM_QUANT_SPEC.md section 2.3. ONE source of truth for how long an
instrument takes, so the number quoted in the wizard, the number enforced by the
budget blocker and the number written in the thesis appendix cannot drift apart.

All constants are mobile-inclusive. There is no separate "times 1.3 for phones"
factor to forget to apply.

This exists because an audit of a sibling module in this codebase found a
36-question instrument with no way back and no mobile layout, fielded to
students on their phones. An instrument nobody finishes produces no data, and no
amount of correct estimation downstream repairs that.
"""
from __future__ import annotations

import math
from typing import Dict

# ---- per-control expected seconds (spec 2.3) ------------------------------
SEC_PAGE_TRANSITION = 0.6        # network + render, Thai 4G, React SPA
SEC_CONSENT = 45.0               # PDPA notice + three separate opt-ins
SEC_SINGLE_SMALL = 7.0           # single-select, <= 6 options
SEC_SINGLE_LARGE = 10.0          # single-select, 7-12 options
SEC_MULTI_BASE = 4.0             # multi-select: 4 + 1.2 per option
SEC_MULTI_PER_OPTION = 1.2
SEC_BRANCH = 11.0                # one branch screen
SEC_GRID_OVERHEAD = 5.0
SEC_GRID_ROW_2CELL = 7.0
SEC_GRID_ROW_1CELL = 4.0
SEC_GRID_ROW_1CELL_LONG = 5.0    # ODI statements
SEC_SLIDER_0_10 = 7.0
SEC_OPEN_SHORT = 12.0            # optional, not autofocused
SEC_INCIDENT = 50.0              # <= 300 chars, only when shown
SEC_REPLAY = 0.7 * 6.0 + 0.3 * 70.0   # 25.2 — confirm vs edit

# Right-skew multipliers. Stored, and DISPLAYED, so the median is never mistaken
# for the experience of a slow reader.
P75_MULTIPLIER = 1.55
P95_MULTIPLIER = 2.70

# ---- hard blocks (spec 2.3) ----------------------------------------------
MAX_MEDIAN_SECONDS = 480.0
MAX_SCORED_ITEMS = 34
MAX_SCREENS = 24
MAX_STATES = 10

# Design-time caps on m, by recruitment target.
def max_states_for_target(r_target: int) -> int:
    if r_target < 120:
        return 5
    if r_target <= 250:
        return 7
    return MAX_STATES


def _multi(k_options: int) -> float:
    return SEC_MULTI_BASE + SEC_MULTI_PER_OPTION * max(0, k_options)


def estimate(m_states: int, mean_path_length: float = 4.0,
             pain_nominations: float = 1.3, incident_share: float = 0.65,
             n_segment_items: int = 6, level: str = "product",
             n_odi_outcomes: int = 0, ask_channel_per_step: bool = False,
             channel_multi: bool = False, n_channel_options: int = 6) -> Dict:
    """Expected screens, scored items and seconds for one instrument.

    `mean_path_length` is the observed L-bar, calibrated at 4.0 rather than the
    5 a designer intuitively assumes — every cap below is derived from 4.0.

    Returns the block-by-block breakdown as well as the totals, because a
    student who is over budget needs to see which block to cut.
    """
    blocks = []

    def add(code, name, screens, items, seconds):
        blocks.append({"code": code, "name": name, "screens": screens,
                       "scored_items": items, "seconds": round(seconds, 2)})

    add("C1", "คำยินยอม (PDPA)", 1, 0, SEC_CONSENT)
    # Episode anchor: banded recency single-select + optional memory cue.
    add("S1-S2", "ยึดเหตุการณ์ล่าสุด", 1, 1, SEC_SINGLE_SMALL + SEC_OPEN_SHORT)
    add("S3", "แบรนด์/ร้านที่ใช้" if level == "product" else "คัดกรองปัญหา",
        1, 1, SEC_SINGLE_LARGE)
    # Q1 checklist over m steps + "none" + "other"
    add("Q1", "เลือกขั้นตอนที่ทำจริง", 1, 1, _multi(m_states + 2))
    add("Q2", "ขั้นแรกที่ทำ", 1, 1, SEC_SINGLE_SMALL)
    add("Q3-Qk", "ถามทีละก้าว", mean_path_length, mean_path_length,
        mean_path_length * SEC_BRANCH)
    add("Q10", "ทวนและแก้ลำดับ", 1, 1, SEC_REPLAY)
    # Experience grid over visited steps: 2 cells each, 3 when the touchpoint
    # (which channel the customer used) is measured per step instead of assumed.
    if ask_channel_per_step:
        # Multi-select costs more than a single pick, and a step really does have
        # several touchpoints, so the extra seconds are charged honestly.
        chan_sec = _multi(n_channel_options) if channel_multi else SEC_GRID_ROW_1CELL
        add("G1", "ความยุ่งยาก/ความรู้สึก/ช่องทางรายขั้น", 1, 3 * mean_path_length,
            SEC_GRID_OVERHEAD + (SEC_GRID_ROW_2CELL + chan_sec) * mean_path_length)
    else:
        add("G1", "ความยุ่งยาก/ความรู้สึกรายขั้น", 1, 2 * mean_path_length,
            SEC_GRID_OVERHEAD + SEC_GRID_ROW_2CELL * mean_path_length)
    add("P1", "เลือกขั้นที่มีปัญหา", 1, 1, _multi(m_states))
    add("P2-P3", "รายละเอียดปัญหา", pain_nominations, 2 * pain_nominations,
        pain_nominations * (SEC_SLIDER_0_10 + _multi(6)))
    add("P6", "เล่าเหตุการณ์ (ไม่บังคับ)", incident_share, incident_share,
        incident_share * SEC_INCIDENT)
    add("O1-O2", "ผลลัพธ์ + ความพึงพอใจ", 1, 2, SEC_SINGLE_SMALL + SEC_SLIDER_0_10)
    add("D1-D6", "ข้อมูลกลุ่ม", 2, n_segment_items, n_segment_items * SEC_SINGLE_SMALL)

    if level == "solution" and n_odi_outcomes:
        add("B1", "ความสำคัญ/ความพอใจของผลลัพธ์ที่ต้องการ",
            math.ceil(n_odi_outcomes / 5.0), 2 * n_odi_outcomes,
            SEC_GRID_OVERHEAD * math.ceil(n_odi_outcomes / 5.0)
            + 2 * SEC_GRID_ROW_1CELL_LONG * n_odi_outcomes)

    screens = sum(b["screens"] for b in blocks)
    items = sum(b["scored_items"] for b in blocks)
    seconds = sum(b["seconds"] for b in blocks) + screens * SEC_PAGE_TRANSITION

    blockers = []
    if seconds > MAX_MEDIAN_SECONDS:
        blockers.append("ใช้เวลาประมาณ %.0f วินาที เกินเพดาน %.0f วินาที"
                        % (seconds, MAX_MEDIAN_SECONDS))
    if items > MAX_SCORED_ITEMS:
        blockers.append("มีข้อคำถาม %.0f ข้อ เกินเพดาน %d ข้อ" % (items, MAX_SCORED_ITEMS))
    if screens > MAX_SCREENS:
        blockers.append("มี %.0f หน้าจอ เกินเพดาน %d หน้าจอ" % (screens, MAX_SCREENS))
    if m_states > MAX_STATES:
        blockers.append("มี %d ขั้นตอน เกินเพดาน %d ขั้นตอน" % (m_states, MAX_STATES))

    return {
        "blocks": blocks,
        "screens": round(screens, 1),
        "scored_items": round(items, 1),
        "seconds_median": round(seconds, 1),
        "seconds_p75": round(seconds * P75_MULTIPLIER, 1),
        "seconds_p95": round(seconds * P95_MULTIPLIER, 1),
        "minutes_median": round(seconds / 60.0, 1),
        "p75_multiplier": P75_MULTIPLIER,
        "p95_multiplier": P95_MULTIPLIER,
        "blocked": bool(blockers),
        "blockers": blockers,
        "headroom_pct": round(100.0 * (MAX_MEDIAN_SECONDS - seconds) / MAX_MEDIAN_SECONDS, 1),
        "estimate_note_th": (
            "ประมาณเวลาสำหรับผู้ตอบครึ่งหนึ่ง — อีกครึ่งจะใช้นานกว่านี้ "
            "(75%% ของผู้ตอบใช้ไม่เกิน %.0f วินาที · 95%% ไม่เกิน %.0f วินาที)"
            % (seconds * P75_MULTIPLIER, seconds * P95_MULTIPLIER)),
    }


def check_design(m_states: int, r_target: int, **kw) -> Dict:
    """Budget estimate plus the recruitment-dependent cap on m."""
    est = estimate(m_states, **kw)
    cap = max_states_for_target(r_target)
    if m_states > cap:
        est["blocked"] = True
        est["blockers"] = list(est["blockers"]) + [
            "ตั้งเป้าผู้ตอบ %d คน รองรับได้ไม่เกิน %d ขั้นตอน (ตอนนี้ %d)"
            % (r_target, cap, m_states)]
    est["max_states_for_target"] = cap
    est["r_target"] = r_target
    return est


# The spec's worked example (section 2.3) reports 330.1 s and 29.3 scored items,
# which this model reproduces to 330.3 s and 29.2 items. Its "screens" total row
# says 18.0, but its own screens column sums to 16.95 — an arithmetic slip in the
# document, not in this model, which computes 17.0. The seconds figure is the one
# that matters and it agrees; the test asserts the computed value, not the typo.
REFERENCE_INSTRUMENT = dict(m_states=6, mean_path_length=4.0, pain_nominations=1.3,
                            incident_share=0.65, n_segment_items=6, level="product")
