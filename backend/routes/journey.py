"""
Quantitative Customer Journey — Phase 1 (model-free layer).

Ships a working quantitative CJM that makes NO Markov assumption: observed
routes with Wilson intervals, per-step reach/rework, per-step Burden, pain
incidence, adequacy bands and every diagnostic the spec says must be computed
*and used*. The transition matrix, the weighted map and everything downstream of
them belong to Phase 2 and are absent here rather than faked — `gates.unlocked`
is the contract the frontend renders from.

Maths lives in `lib/markov_journey.py`; nothing statistical is computed inline.
"""

import math
import uuid
import json
import logging
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from lib import markov_journey as mj
from lib import journey_budget as jb
from lib import journey_codebook as jcb
from lib import journey_copy_th as copy_th
from lib.consent import (default_consent, consent_record, new_respondent_token,
                         purge_after_iso, check_blocklist, CONSENT_VERSION)
from routes import journey_instrument as ji
from routes._analysis_common import (parse_segments_param, apply_response_filter,
                                     segments_available, filter_signature, json_safe)

journey_router = APIRouter(prefix="/journey", tags=["Customer Journey"])

ANALYSIS_SCHEMA_VERSION = 2
METHOD_MODEL_FREE = "model_free"
MAX_PATH_STEPS = 12
DEFAULT_COMPLETION_RATE = 0.55
MIN_R_FOR_ROUTE_SHARE = 30
# Edge labels: a share needs a denominator worth dividing by, and a thin edge is
# drawn dashed rather than given a percentage it cannot support.
MIN_OUT_FOR_EDGE_SHARE = 10
MIN_COUNT_FOR_SOLID_EDGE = 5
QUALITY_REFERENCE_FREEZE_AT = 50


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------
class Subject(BaseModel):
    name: str = ""
    category: str = ""
    is_competitor: bool = False
    competitors: List[str] = Field(default_factory=list)


class StudyCreate(BaseModel):
    title: str
    analysis_level: str = "product"
    subject: Subject = Field(default_factory=Subject)
    template_key: str = "retail_product"
    sampling_frame: str
    recall_window_days: int = 90
    # 120 is the smallest target that carries a 6-step instrument: below it the
    # recruitment-dependent cap in journey_budget allows only 5 steps.
    target_responses: int = 120
    researcher_name: str = ""
    advisor_name: str = ""
    contact: str = ""


class StudyUpdate(BaseModel):
    title: Optional[str] = None
    subject: Optional[Subject] = None
    sampling_frame: Optional[str] = None
    recall_window_days: Optional[int] = None
    target_responses: Optional[int] = None
    stages: Optional[List[dict]] = None
    state_labels: Optional[List[str]] = None
    states: Optional[List[dict]] = None
    absorbing: Optional[dict] = None
    pain_options: Optional[Dict[str, List[str]]] = None
    channel_options: Optional[List[str]] = None
    channel_types: Optional[Dict[str, str]] = None
    channel_modes: Optional[Dict[str, str]] = None
    ask_channel_per_step: Optional[bool] = None
    allow_pain_other_text: Optional[bool] = None
    pain_nomination_cap: Optional[int] = None
    severity_scope: Optional[str] = None
    state_meta: Optional[List[dict]] = None
    expected_transitions: Optional[dict] = None
    custom_segment: Optional[dict] = None
    status: Optional[str] = None


class SeedBody(BaseModel):
    qualitative_run_id: Optional[str] = None
    raw_text: Optional[str] = None
    mermaid_code: Optional[str] = None
    apply_states: bool = True


class CodebookExtract(BaseModel):
    qualitative_run_ids: List[str] = Field(default_factory=list)
    raw_text: Optional[str] = None
    mermaid_code: Optional[str] = None
    # One entry per informant. Supplying this instead of a single blob is what
    # makes a saturation curve possible.
    interviews: List[str] = Field(default_factory=list)


class BackCodeBody(BaseModel):
    response_id: str
    state_id: str
    category_ids: List[str] = Field(default_factory=list)


class CodebookUpdate(BaseModel):
    """Partial replacement of the draft. Absent keys are left alone."""
    source: Optional[dict] = None
    states: Optional[List[dict]] = None
    edges: Optional[List[dict]] = None
    touchpoints: Optional[List[dict]] = None
    pain_categories: Optional[List[dict]] = None


class ReliabilityBody(BaseModel):
    mode: str = "second_coder"
    coder_ref: Optional[str] = None
    coder_a: List[List[str]] = Field(default_factory=list)
    coder_b: List[List[str]] = Field(default_factory=list)


class ConsentBody(BaseModel):
    participation: bool = False
    recontact: bool = False
    linkage: bool = False


class PathStep(BaseModel):
    state_id: str
    order: int


class JourneySubmit(BaseModel):
    consent: ConsentBody
    episode: Dict[str, Any] = Field(default_factory=dict)
    subject_choice: Optional[str] = None
    visited: List[str] = Field(default_factory=list)
    late_additions: List[str] = Field(default_factory=list)
    path: List[PathStep] = Field(default_factory=list)
    path_raw: List[PathStep] = Field(default_factory=list)
    replay_edited: bool = False
    edit_ops: List[dict] = Field(default_factory=list)
    terminal: str = "UNKNOWN"
    terminated_by: str = "outcome"
    outcome: Optional[str] = None
    experience: Dict[str, dict] = Field(default_factory=dict)
    pain: Dict[str, Any] = Field(default_factory=dict)
    overall_sat_0_10: Optional[float] = None
    demographics: Dict[str, str] = Field(default_factory=dict)
    quality: Dict[str, Any] = Field(default_factory=dict)
    draft_id: Optional[str] = None
    recontact_value: Optional[str] = None


class DraftSave(BaseModel):
    draft_id: Optional[str] = None
    state: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Response cleaning / validation
# ---------------------------------------------------------------------------
def _clean_submission(study: dict, data: JourneySubmit) -> dict:
    """Validate a public submission against the study's own instrument.

    Values outside their declared range are dropped, never coerced: an unbounded
    difficulty value flows straight into the POMP transform and moves the Burden
    of a whole step.
    """
    state_ids = [s["id"] for s in (study.get("states") or [])]
    known = set(state_ids)

    path = [p for p in sorted(data.path, key=lambda x: x.order)
            if p.state_id in known][:MAX_PATH_STEPS]
    path_raw = [p for p in sorted(data.path_raw, key=lambda x: x.order)
                if p.state_id in known][:MAX_PATH_STEPS]

    terminal = str(data.terminal or "").upper()
    if terminal not in mj.ABSORBING:
        terminal = mj.UNKNOWN

    visited = [s for s in data.visited if s in known]
    late = [s for s in data.late_additions if s in known]

    experience: Dict[str, dict] = {}
    channels = set(study.get("channel_options") or ji.DEFAULT_CHANNEL_OPTIONS)
    for sid, val in (data.experience or {}).items():
        if sid not in known or not isinstance(val, dict):
            continue
        d = val.get("difficulty_1_5")
        e = val.get("emotion")
        chs = val.get("channels")
        if not isinstance(chs, list):
            chs = [val.get("channel")] if val.get("channel") else []
        row: Dict[str, Any] = {}
        if isinstance(d, (int, float)) and not isinstance(d, bool) and 1 <= float(d) <= 5:
            row["difficulty_1_5"] = float(d)
        if isinstance(e, (int, float)) and not isinstance(e, bool) and -1 <= float(e) <= 1:
            row["emotion"] = float(e)
        a = val.get("anxiety_1_5")
        if isinstance(a, (int, float)) and not isinstance(a, bool) and 1 <= float(a) <= 5:
            row["anxiety_1_5"] = float(a)
        picked = [str(c) for c in chs if c in channels][:6]
        if picked:
            row["channels"] = picked
            row["channel"] = picked[0]      # primary, kept for older readers
        if row:
            experience[sid] = row

    # The cap is a study setting, enforced here. Before this it lived only in
    # the UI, so what was stored could disagree with what was designed.
    nominated = jcb.enforce_nomination_cap(
        [s for s in (data.pain.get("nominated") or []) if s in known],
        int(study.get("pain_nomination_cap") or 2))
    pain: Dict[str, Any] = {"nominated": nominated}
    id_map = study.get("pain_category_ids") or {}
    allow_other = study.get("allow_pain_other_text", True)
    for sid in nominated:
        raw = data.pain.get(sid) or {}
        sev = raw.get("severity_0_10")
        row = {}
        if isinstance(sev, (int, float)) and not isinstance(sev, bool) and 0 <= float(sev) <= 10:
            row["severity_0_10"] = float(sev)

        # Legacy free-text categories are still accepted so studies fielded
        # before the codebook keep working; new ones carry ids.
        allowed = set((study.get("pain_options") or {}).get(sid) or ji.DEFAULT_PAIN_OPTIONS)
        row["categories"] = [c for c in (raw.get("categories") or []) if c in allowed]

        allowed_ids = set(id_map.get(sid) or [])
        if allowed_ids:
            seen_ids = []
            for cid in (raw.get("category_ids") or []):
                if cid in allowed_ids and cid not in seen_ids:
                    seen_ids.append(cid)
            row["category_ids"] = seen_ids
            sev_by_cat = raw.get("category_severity") or {}
            picked = {}
            for cid in seen_ids:
                v = sev_by_cat.get(cid)
                if isinstance(v, (int, float)) and not isinstance(v, bool) and 0 <= float(v) <= 10:
                    picked[cid] = float(v)
            if picked:
                row["category_severity"] = picked

        if allow_other:
            other = raw.get("other_text")
            if other and str(other).strip():
                row["other_text"] = str(other)[:300]

        note = raw.get("note")
        if note:
            row["note"] = str(note)[:300]
        pain[sid] = row

    seg_ids = {q["id"] for q in (study.get("segment_questions") or [])}
    demo = {}
    for k, v in (data.demographics or {}).items():
        if k in seg_ids and v not in (None, ""):
            demo[k] = str(v)[:120]

    sat = data.overall_sat_0_10
    if not (isinstance(sat, (int, float)) and not isinstance(sat, bool) and 0 <= float(sat) <= 10):
        sat = None

    # Mask violations are recorded, never removed (spec 2.6).
    matrix = ((study.get("expected_transitions") or {}).get("matrix")) or []
    idx = {sid: i for i, sid in enumerate(state_ids)}
    violations = []
    seq = [p.state_id for p in path]
    for a, b in zip(seq, seq[1:]):
        ia, ib = idx.get(a), idx.get(b)
        if ia is None or ib is None:
            continue
        try:
            if not matrix[ia][ib]:
                violations.append([a, b])
        except (IndexError, TypeError):
            continue

    q = data.quality or {}
    diffs = [row["difficulty_1_5"] for row in experience.values() if "difficulty_1_5" in row]
    scored_rows = len(diffs) + len(demo) + (1 if sat is not None else 0)

    return {
        "path": [{"state_id": p.state_id, "order": i} for i, p in enumerate(path)],
        "path_raw": [{"state_id": p.state_id, "order": i} for i, p in enumerate(path_raw)],
        "terminal": terminal,
        "visited": visited,
        "late_additions": late,
        "experience": experience,
        "pain": pain,
        "demographics": demo,
        "overall_sat_0_10": sat,
        "mask_violations": violations,
        "quality": {
            "duration_sec": float(q.get("duration_sec") or 0),
            "page_times_ms": q.get("page_times_ms") or {},
            "option_positions": q.get("option_positions") or {},
            "rng_seed": q.get("rng_seed"),
            "trap_shown": bool(q.get("trap_shown")),
            "trap_hit": bool(q.get("trap_hit")),
            "backnav_count": int(q.get("backnav_count") or 0),
            "other_selected": bool(q.get("other_selected")),
            "longstring": _longstring(diffs),
            "irv": _irv(diffs),
            "scored_rows": scored_rows,
            "difficulty_rows": len(diffs),
        },
    }


def _longstring(vals: List[float]) -> int:
    best = run = 0
    prev = None
    for v in vals:
        run = run + 1 if v == prev else 1
        prev = v
        best = max(best, run)
    return best


def _irv(vals: List[float]) -> Optional[float]:
    if len(vals) < 2:
        return None
    mean = sum(vals) / len(vals)
    return math.sqrt(sum((v - mean) ** 2 for v in vals) / (len(vals) - 1))


# ---------------------------------------------------------------------------
# Careless-response battery (spec 2.8) — exclude only on >= 2 APPLICABLE flags
# ---------------------------------------------------------------------------
def _quality_flags(resp: dict, reference: Optional[dict]) -> dict:
    q = resp.get("quality") or {}
    flags: Dict[str, Any] = {}

    flags["trap"] = bool(q.get("trap_hit")) if q.get("trap_shown") else None

    rows = int(q.get("difficulty_rows") or 0)
    if rows >= 6:
        irv, ls = q.get("irv"), int(q.get("longstring") or 0)
        flags["straightlining"] = bool((irv is not None and irv == 0)
                                       or ls >= math.ceil(0.8 * rows))
    else:
        flags["straightlining"] = None

    med = (reference or {}).get("median_total_sec")
    dur = float(q.get("duration_sec") or 0)
    flags["speeding"] = bool(dur > 0 and med and dur < 0.4 * med) if (med and dur > 0) else None

    outcome = resp.get("outcome")
    term = resp.get("terminal")
    if outcome in ("convert", "abandon", "ongoing"):
        expect = {"convert": mj.CONV, "abandon": mj.ABANDON, "ongoing": mj.UNKNOWN}[outcome]
        flags["outcome_conflict"] = bool(term != expect)
    else:
        flags["outcome_conflict"] = None

    applicable = [k for k, v in flags.items() if v is not None]
    hits = [k for k in applicable if flags[k]]
    return {"flags": flags, "applicable": len(applicable), "hits": hits,
            "excluded": len(hits) >= 2}


# ---------------------------------------------------------------------------
# The Phase 1 analysis
# ---------------------------------------------------------------------------
def _t_crit(n: int) -> float:
    try:
        from scipy.stats import t as _t
        return float(_t.ppf(0.975, max(1, n - 1)))
    except Exception:
        return 1.96


def compute_model_free(study: dict, responses: List[dict],
                       quality_reference: Optional[dict] = None) -> dict:
    """Everything Phase 1 renders. No transition matrix is estimated."""
    states = [s["id"] for s in (study.get("states") or [])]
    labels = {s["id"]: s.get("label_th") for s in (study.get("states") or [])}
    absorbing = study.get("absorbing") or ji.default_absorbing(study.get("analysis_level"))

    # --- quality battery -------------------------------------------------
    battery = {r["id"]: _quality_flags(r, quality_reference) for r in responses}
    excluded_ids = [rid for rid, b in battery.items() if b["excluded"]]
    kept = [r for r in responses if r["id"] not in set(excluded_ids)]
    applicable_counts = [b["applicable"] for b in battery.values()] or [0]

    R = len(kept)
    seqs, meta = mj.build_sequences(states, kept)
    n_ij, _, r_i = mj.count_transitions(seqs, states)

    terminal_counts = meta["terminal_counts"]
    n_abandon = terminal_counts.get(mj.ABANDON, 0)

    adequacy = mj.sample_adequacy(r_i, R, len(states), n_abandon)
    completion = _completion_rate(study, len(responses))
    adequacy["completion_rate"] = completion
    adequacy["link_sends_for_next_band"] = _link_sends(R, study.get("target_responses") or 100,
                                                       completion)
    adequacy["cap_shortfall"] = bool(R < 120 and len(states) >= 6)
    adequacy["band_note_th"] = copy_th.BANDS.get(adequacy["level"], "")

    # --- routes (model-free layer) --------------------------------------
    routes_top = mj.empirical_routes(seqs, top_k=8)
    show_share = R >= MIN_R_FOR_ROUTE_SHARE
    for row in routes_top:
        row["path_labels"] = [_label_of(p, labels, absorbing) for p in row["route"].split(" > ")]
        if not show_share:
            row["share"] = None
            row["share_ci95"] = None
    coverage = (sum(r["count"] for r in routes_top) / R) if R else 0.0
    none_route = sum(1 for s in seqs if len(s) == 2)

    # --- per-step nodes --------------------------------------------------
    nodes: Dict[str, dict] = {}
    for sid in states:
        visits = [sum(1 for p in (r.get("path") or []) if p.get("state_id") == sid)
                  for r in kept]
        visitors = [v for v in visits if v > 0]
        n_visit = len(visitors)
        diffs = [(r.get("experience") or {}).get(sid, {}).get("difficulty_1_5")
                 for r in kept]
        diffs = [d for d in diffs if isinstance(d, (int, float))]
        emos = [(r.get("experience") or {}).get(sid, {}).get("emotion") for r in kept]
        emos = [e for e in emos if isinstance(e, (int, float))]
        anx = [(r.get("experience") or {}).get(sid, {}).get("anxiety_1_5") for r in kept]
        anx = [a for a in anx if isinstance(a, (int, float))]
        anxiety, anxiety_ci = _burden(anx)
        nominated = [r for r in kept if sid in ((r.get("pain") or {}).get("nominated") or [])]
        sev = [((r.get("pain") or {}).get(sid) or {}).get("severity_0_10") for r in nominated]
        sev = [s for s in sev if isinstance(s, (int, float))]

        burden, burden_ci = _burden(diffs)
        cats = Counter()
        for r in nominated:
            for c in ((r.get("pain") or {}).get(sid) or {}).get("categories") or []:
                cats[c] += 1

        # Touchpoint: which channel the customer actually used at this step,
        # counted from their own answers rather than assigned by the researcher.
        chan = Counter()
        for r in kept:
            for c in _channels_of((r.get("experience") or {}).get(sid)):
                chan[c] += 1
        chan_total = sum(chan.values())
        channels = [{"label": c, "count": n,
                     "share": (n / chan_total) if chan_total else None}
                    for c, n in chan.most_common()]

        nodes[sid] = {
            "label_th": labels.get(sid),
            "stage_id": next((s.get("stage_id") for s in study.get("states") or []
                              if s["id"] == sid), None),
            "owner": next((s.get("owner") for s in study.get("states") or []
                           if s["id"] == sid), None),
            "n_visit": n_visit,
            "reach": (n_visit / R) if R else 0.0,
            "reach_ci95": mj.wilson_interval(n_visit, R) if R else None,
            "revisit": (sum(visitors) / n_visit) if n_visit else 0.0,
            "expected_visits": (sum(visits) / R) if R else 0.0,
            "rework_rate": (sum(1 for v in visitors if v > 1) / n_visit) if n_visit else 0.0,
            "r": int(r_i.get(sid, 0)),
            "n_transitions": float(n_ij[states.index(sid) + 1].sum()),
            "n_exp": len(diffs),
            "burden": burden,
            "burden_ci95": burden_ci,
            "emotion": (sum(emos) / len(emos)) if emos else None,
            "anxiety": anxiety,
            "anxiety_ci95": anxiety_ci,
            "n_anxiety": len(anx),
            "pain_nomination_rate": (len(nominated) / n_visit) if n_visit else None,
            "pain_nomination_ci95": mj.wilson_interval(len(nominated), n_visit) if n_visit else None,
            "severity_conditional": {"mean": (sum(sev) / len(sev)) if sev else None,
                                     "m": len(sev),
                                     "caveat_th": copy_th.SEVERITY_CAVEAT},
            "pain_categories": [{"label": c, "count": n} for c, n in cats.most_common(6)],
            "channels": channels,
            "dominant_channel": channels[0]["label"] if channels else None,
            "dominant_channel_share": channels[0]["share"] if channels else None,
            "n_channel": chan_total,
            "no_visitors": n_visit == 0,
        }
        # Flags, not a weighted index: each axis is reported on its own so a bad
        # step cannot be averaged into looking acceptable.
        nodes[sid]["watch_flags"] = _watch_flags(nodes[sid])

    # --- terminals -------------------------------------------------------
    terminals = {}
    for key, label in ((mj.CONV, absorbing.get("conv_label_th")),
                       (mj.ABANDON, absorbing.get("abandon_label_th")),
                       (mj.UNKNOWN, absorbing.get("unknown_label_th"))):
        c = terminal_counts.get(key, 0)
        terminals[key] = {"label_th": label, "count": c,
                          "share": (c / R) if R else 0.0,
                          "share_ci95": mj.wilson_interval(c, R) if R else None}

    # --- diagnostics -----------------------------------------------------
    unknown_rate = terminals[mj.UNKNOWN]["share"]
    cap_hits = sum(1 for r in kept if len(r.get("path") or []) >= MAX_PATH_STEPS)
    late = sum(1 for r in kept if r.get("late_additions"))
    other = sum(1 for r in kept if (r.get("quality") or {}).get("other_selected"))
    trap_free = [r for r in kept if not (r.get("quality") or {}).get("trap_hit")]
    viol = sum(1 for r in trap_free if r.get("mask_violations"))
    consistent = sum(1 for r in kept if _set_consistent(r))

    diagnostics = {
        "unknown_rate": unknown_rate,
        "unknown_rate_ci95": mj.wilson_interval(terminals[mj.UNKNOWN]["count"], R) if R else None,
        "cap_rate": (cap_hits / R) if R else 0.0,
        "late_addition_rate": (late / R) if R else 0.0,
        "other_rate": (other / R) if R else 0.0,
        "other_rate_ci95": mj.wilson_interval(other, R) if R else None,
        "mask_violation_rate": (viol / len(trap_free)) if trap_free else 0.0,
        "set_consistency_rate": (consistent / R) if R else 1.0,
        "option_position_effect": _option_position_effect(kept),
        "exclusions": {
            "n": len(excluded_ids),
            "rate": (len(excluded_ids) / len(responses)) if responses else 0.0,
            "applicable_flags": max(applicable_counts),
            "respondent_ids": excluded_ids,
            "rule_th": "คัดออกเมื่อเข้าเงื่อนไขคุณภาพตั้งแต่ 2 ข้อขึ้นไป จากข้อที่ประเมินได้",
        },
        "quality_reference": quality_reference,
    }
    diagnostics["warnings"] = _diagnostic_warnings(diagnostics)

    # --- touchpoint + stage views (customer-side cuts) --------------------
    touchpoints = _touchpoint_summary(study, kept)
    stages_summary = _stage_summary(study, kept, nodes)
    pain_matrix = _pain_matrix(study, kept)
    channel_types = {**ji.default_channel_types(study.get("channel_options")),
                     **(study.get("channel_types") or {})}
    step_touchpoints = _step_touchpoints(study, nodes, channel_types)

    # --- observed flow map (model-free) ----------------------------------
    observed_flow = _observed_flow(seqs, states, labels, absorbing, nodes, terminals, R,
                                   study.get('stages') or ji.DEFAULT_STAGES)

    unlocked = ["counts", "steps", "pain"]
    if R >= MIN_R_FOR_ROUTE_SHARE:
        unlocked.append("routes")
    if observed_flow["edges"]:
        # NOT the weighted Markov map: these are counted transitions, no
        # estimated probabilities, no certainty bands (that is Phase 2).
        unlocked.append("observed_flow")
    if len(segments_available(kept, [q["id"] for q in study.get("segment_questions") or []])) and R >= 25:
        unlocked.append("segments_view")

    results = {
        "gates": {
            "unlocked": unlocked,
            "predictive": {"verdict": "not_run", "evaluable": False, "p": None,
                           "message_th": copy_th.GATE_NOT_RUN},
            "order_test": {"verdict": "not_run", "evaluable": False, "p": None,
                           "role": "can_block_never_authorise",
                           "message_th": copy_th.GATE_NOT_RUN},
        },
        "sample_adequacy": adequacy,
        "terminals": terminals,
        "routes": {"top": routes_top, "coverage": coverage,
                   "none_route_share": (none_route / R) if R else 0.0,
                   "shares_hidden": not show_share},
        "nodes": nodes,
        "touchpoints": touchpoints,
        "pain_matrix": pain_matrix,
        "step_touchpoints": step_touchpoints,
        "stages_summary": stages_summary,
        "qualitative_audit": _qualitative_audit(study, n_ij, states),
        "observed_flow": observed_flow,
        "diagnostics": diagnostics,
        "matrix": None, "loss": None, "priority": None, "map": None,
        "scope_note_th": copy_th.PHASE1_SCOPE,
        "methodology_th": copy_th.METHODOLOGY,
        "interval_caveat_th": copy_th.INTERVAL_CAVEAT,
        "burden_definition_th": copy_th.BURDEN_DEF,
        "n_disclosure": {"R_submitted": len(responses), "R_analysed": R,
                         "n_excluded": len(excluded_ids),
                         "n_transitions": int(n_ij.sum())},
    }
    return json_safe(results)


def _qualitative_audit(study: dict, n_ij, states) -> Optional[dict]:
    """Does the qualitative map survive contact with the data?

    Step 1 asserts a set of edges and a linear/nonlinear shape. Step 2 has the
    transitions actually taken. Reporting the three-way split — claimed and
    seen, claimed and absent, seen but never claimed — is what turns the
    quantitative stage into a test of the qualitative one rather than a
    decoration on top of it.
    """
    claimed = study.get("claimed_edges")
    if not claimed:
        return None
    order = {s: i for i, s in enumerate(states)}
    cov = jcb.edge_coverage([(a, b) for a, b in claimed], n_ij, states,
                            mj.wilson_interval,
                            journey_style=study.get("journey_style_claimed") or "nonlinear",
                            order=order)
    cov["unmatched_claimed_edges"] = int(study.get("claimed_edges_unmatched") or 0)
    if cov["unmatched_claimed_edges"]:
        cov["unmatched_note_th"] = (
            "มีเส้นทางจากขั้นเชิงคุณภาพ %d เส้นที่จับคู่กับขั้นตอนในแบบสอบถามไม่ได้ "
            "จึงตรวจสอบไม่ได้" % cov["unmatched_claimed_edges"])
    return cov


def _watch_flags(node: dict) -> List[dict]:
    out = []
    if (node.get("burden") or 0) >= 60:
        out.append({"key": "burden", "label_th": "ยุ่งยากมาก"})
    if (node.get("anxiety") or 0) >= 60:
        out.append({"key": "anxiety", "label_th": "กังวล/ไม่มั่นใจสูง"})
    if node.get("emotion") is not None and node["emotion"] <= -0.3:
        out.append({"key": "emotion", "label_th": "ความรู้สึกติดลบ"})
    if (node.get("pain_nomination_rate") or 0) >= 0.30:
        out.append({"key": "pain", "label_th": "ถูกระบุว่าเป็นปัญหา"})
    if (node.get("revisit") or 0) >= 1.3:
        out.append({"key": "rework", "label_th": "ต้องทำซ้ำบ่อย"})
    return out


def _channels_of(exp: dict) -> List[str]:
    """Every touchpoint used at one step. Old rows hold a single `channel`."""
    if not isinstance(exp, dict):
        return []
    chs = exp.get("channels")
    if isinstance(chs, list) and chs:
        return [str(c) for c in chs]
    return [str(exp["channel"])] if exp.get("channel") else []


def _touchpoint_summary(study: dict, kept: List[dict]) -> dict:
    """Aggregate by the channel the CUSTOMER said they used.

    The unit is a step-visit, not a respondent: one person can use the app at one
    step and the shop at the next, and both facts belong to their own channel.
    Burden and pain are therefore per visit as well, and `n` is printed beside
    every number so nobody reads a 3-visit channel as a finding.
    """
    known = {s["id"] for s in (study.get("states") or [])}
    labels = {s["id"]: s.get("label_th") for s in (study.get("states") or [])}
    rows: Dict[str, dict] = {}
    for r in kept:
        nominated = set((r.get("pain") or {}).get("nominated") or [])
        for sid, exp in (r.get("experience") or {}).items():
            if sid not in known:
                continue
            for ch in _channels_of(exp):
                row = rows.setdefault(ch, {"label": ch, "n_visit": 0, "difficulties": [],
                                                   "emotions": [], "anxieties": [],
                                                   "n_pain": 0, "steps": set(),
                                                   "cats": Counter(), "pain_steps": Counter()})
                row["n_visit"] += 1
                row["steps"].add(sid)
                if isinstance(exp.get("difficulty_1_5"), (int, float)):
                    row["difficulties"].append(float(exp["difficulty_1_5"]))
                if isinstance(exp.get("emotion"), (int, float)):
                    row["emotions"].append(float(exp["emotion"]))
                if isinstance(exp.get("anxiety_1_5"), (int, float)):
                    row["anxieties"].append(float(exp["anxiety_1_5"]))
                if sid in nominated:
                    row["n_pain"] += 1
                    row["pain_steps"][sid] += 1
                    # One touchpoint can carry SEVERAL pain types, and one
                    # respondent can name several at the same step.
                    for c in ((r.get("pain") or {}).get(sid) or {}).get("categories") or []:
                        row["cats"][c] += 1

    total = sum(v["n_visit"] for v in rows.values())
    types = {**ji.default_channel_types(study.get("channel_options")),
             **(study.get("channel_types") or {})}
    out = []
    for row in sorted(rows.values(), key=lambda x: -x["n_visit"]):
        burden, ci = _burden(row["difficulties"])
        out.append({
            "label": row["label"],
            "type": types.get(row["label"], "digital"),
            "type_label_th": ji.CHANNEL_TYPES.get(types.get(row["label"], "digital")),
            "n_visit": row["n_visit"],
            "share_of_visits": (row["n_visit"] / total) if total else None,
            "n_steps": len(row["steps"]),
            "burden": burden,
            "burden_ci95": ci,
            "emotion": (sum(row["emotions"]) / len(row["emotions"])) if row["emotions"] else None,
            "anxiety": _burden(row["anxieties"])[0],
            "pain_rate": (row["n_pain"] / row["n_visit"]) if row["n_visit"] else None,
            "pain_rate_ci95": mj.wilson_interval(row["n_pain"], row["n_visit"]),
            "n_pain": row["n_pain"],
            "pain_categories": [
                {"label": c, "count": n,
                 "share_of_pain": (n / row["n_pain"]) if row["n_pain"] else None}
                for c, n in row["cats"].most_common()],
            "pain_steps": [{"state_id": sid, "label_th": labels.get(sid), "count": n}
                           for sid, n in row["pain_steps"].most_common()],
            "thin": row["n_visit"] < 10,
        })
    modes = {**ji.default_channel_modes(study.get("channel_options")),
             **(study.get("channel_modes") or {})}
    for row in out:
        row["mode"] = modes.get(row["label"], "one_to_many")
        row["mode_label_th"] = ji.CHANNEL_MODES.get(row["mode"])
    return {
        "rows": out,
        "by_type": _by_type(rows, types, total),
        "by_mode": _by_mode(rows, modes, total),
        "mode_labels_th": ji.CHANNEL_MODES,
        "type_labels_th": ji.CHANNEL_TYPES,
        "total_visits": total,
        "asked": bool(study.get("ask_channel_per_step")),
        "measured": total > 0,
        "unit_th": ("หน่วยนับคือ “การใช้หนึ่งช่องทางในหนึ่งขั้นของหนึ่งคน” ไม่ใช่จำนวนคน "
                    "หนึ่งขั้นใช้ได้หลายช่องทาง ผลรวมจึงมากกว่าจำนวนการผ่านขั้น"),
        "note_th": ("ช่องทางมาจากคำตอบของผู้ตอบเองว่าตอนนั้นทำผ่านอะไร "
                    "ไม่ได้มาจากที่ผู้วิจัยกำหนดแทนลูกค้า"),
        "not_measured_th": ("การศึกษานี้ยังไม่ได้ถามช่องทางรายขั้น "
                            "เปิดได้ที่หน้าแก้ไขการศึกษา (เพิ่มเวลาตอบประมาณ 16 วินาที)"),
    }


def _pool(rows: dict, classify: dict, keys: List[str], default: str, total: int) -> dict:
    """Pool over visit-level ratings, never over per-channel means."""
    diffs, emos, anx, n_visit, n_pain, chans = [], [], [], 0, 0, []
    for r in rows.values():
        if classify.get(r["label"], default) not in keys:
            continue
        diffs += r["difficulties"]
        emos += r["emotions"]
        anx += r.get("anxieties") or []
        n_visit += r["n_visit"]
        n_pain += r["n_pain"]
        chans.append(r["label"])
    burden, ci = _burden(diffs)
    return {"channels": chans, "n_visit": n_visit,
            "share_of_visits": (n_visit / total) if total else None,
            "burden": burden, "burden_ci95": ci,
            "emotion": (sum(emos) / len(emos)) if emos else None,
            "anxiety": _burden(anx)[0],
            "pain_rate": (n_pain / n_visit) if n_visit else None,
            "pain_rate_ci95": mj.wilson_interval(n_pain, n_visit),
            "thin": n_visit < 10}


def _by_mode(rows: dict, modes: dict, total: int) -> dict:
    out = []
    for key, label in ji.CHANNEL_MODES.items():
        row = _pool(rows, modes, [key], "one_to_many", total)
        if row["n_visit"]:
            out.append({**row, "mode": key, "label_th": label})
    return {
        "rows": out,
        "note_th": ("many-to-many คือลูกค้าคุยกันเอง (รีวิว โซเชียล ปากต่อปาก) "
                    "ซึ่งแบรนด์คุมไม่ได้โดยตรง จึงต้องอ่านแยกจากช่องทางที่แบรนด์คุมเอง"),
    }


def _step_touchpoints(study: dict, nodes: dict, types: dict) -> List[dict]:
    """Step x touchpoint, with a flag when one step mixes physical and not."""
    out = []
    for s in (study.get("states") or []):
        n = nodes.get(s["id"]) or {}
        chans = n.get("channels") or []
        kinds = {("physical" if types.get(c["label"]) in ji.PHYSICAL_TYPES
                  else "non_physical") for c in chans}
        out.append({
            "state_id": s["id"], "label_th": n.get("label_th"),
            "stage_id": n.get("stage_id"),
            "n_visit": n.get("n_visit", 0),
            "n_channel_uses": n.get("n_channel", 0),
            "channels": [{**c, "type": types.get(c["label"], "digital"),
                          "type_label_th": ji.CHANNEL_TYPES.get(types.get(c["label"], "digital"))}
                         for c in chans],
            "channels_per_visit": ((n.get("n_channel") or 0) / n["n_visit"]) if n.get("n_visit") else None,
            "mixed_types": len(kinds) > 1,
        })
    return out


def _by_type(rows: dict, types: dict, total: int) -> dict:
    """Roll channels up to their type, then to the physical / non-physical cut.

    Burden is pooled over the raw visit-level ratings, never averaged over
    channel means — a 3-visit channel must not weigh the same as a 200-visit one.
    """
    def agg(keys: List[str], label: str) -> dict:
        return {**_pool(rows, types, keys, "digital", total), "label_th": label}

    three = [dict(agg([k], v), type=k) for k, v in ji.CHANNEL_TYPES.items()]
    non_physical = [k for k in ji.CHANNEL_TYPES if k not in ji.PHYSICAL_TYPES]
    two = [dict(agg(list(ji.PHYSICAL_TYPES), "ต้องไปถึงที่จริง (physical)"), type="physical"),
           dict(agg(non_physical, "ไม่ต้องไปถึงที่จริง (non-physical)"), type="non_physical")]
    return {
        "three_way": [t for t in three if t["n_visit"] > 0],
        "two_way": [t for t in two if t["n_visit"] > 0],
        "note_th": ("ประเภทช่องทางเป็นการจัดกลุ่มโดยผู้วิจัย (แก้ได้ในหน้าแก้ไขการศึกษา) "
                    "ส่วนช่องทางที่ใช้จริงมาจากคำตอบของลูกค้า · "
                    "“คนต่อคน” ถูกนับเป็นฝั่งไม่ต้องไปถึงที่จริง เพราะรวมทั้งโทร แชท และปากต่อปาก"),
    }


def _pain_matrix(study: dict, kept: List[dict]) -> dict:
    """Pain TYPE x step, and pain TYPE x touchpoint.

    A step — and therefore a touchpoint — can carry several pain types at once,
    so the cell is a count of nominations, and row totals exceed the number of
    respondents on purpose.
    """
    labels = {s["id"]: s.get("label_th") for s in (study.get("states") or [])}
    order = [s["id"] for s in (study.get("states") or [])]
    cats: Counter = Counter()
    by_step: Dict[str, Counter] = {sid: Counter() for sid in order}
    by_channel: Dict[str, Counter] = {}
    step_nominations: Counter = Counter()
    channel_nominations: Counter = Counter()

    for r in kept:
        pain = r.get("pain") or {}
        for sid in (pain.get("nominated") or []):
            if sid not in by_step:
                continue
            step_nominations[sid] += 1
            chans = _channels_of((r.get("experience") or {}).get(sid))
            for ch in chans:
                channel_nominations[ch] += 1
                by_channel.setdefault(ch, Counter())
            for c in ((pain.get(sid) or {}).get("categories") or []):
                cats[c] += 1
                by_step[sid][c] += 1
                for ch in chans:
                    by_channel[ch][c] += 1

    cat_order = [c for c, _ in cats.most_common()]
    type_counts: Counter = Counter()
    for c, n in cats.items():
        type_counts[ji.pain_type_of(c)] += n
    return {
        "categories": cat_order,
        "category_types": {c: ji.pain_type_of(c) for c in cat_order},
        "by_type": [{"type": t, "label_th": ji.PAIN_TYPES.get(t), "count": n,
                     "share": (n / sum(type_counts.values())) if type_counts else None}
                    for t, n in type_counts.most_common()],
        "type_labels_th": ji.PAIN_TYPES,
        "by_step": [{"state_id": sid, "label_th": labels.get(sid),
                     "n_nominations": step_nominations.get(sid, 0),
                     "counts": {c: by_step[sid].get(c, 0) for c in cat_order},
                     "total": sum(by_step[sid].values())}
                    for sid in order],
        "by_channel": [{"label": ch,
                        "n_nominations": channel_nominations.get(ch, 0),
                        "counts": {c: cnt.get(c, 0) for c in cat_order},
                        "total": sum(cnt.values())}
                       for ch, cnt in sorted(by_channel.items(),
                                             key=lambda kv: -sum(kv[1].values()))],
        "total": int(sum(cats.values())),
        "note_th": ("หนึ่งขั้นและหนึ่งช่องทางมีได้หลายปัญหา ตัวเลขในช่องคือจำนวนครั้งที่ผู้ตอบระบุ "
                    "ผลรวมจึงมากกว่าจำนวนคนได้"),
        "limitations_th": [
            "ความรุนแรง 0–10 ถูกถามต่อ “ขั้นตอน” ไม่ได้ถามแยกต่อประเภทปัญหา "
            "จึงจัดลำดับปัญหาได้ด้วยจำนวนคนที่ระบุ แต่ยังเทียบความหนักระหว่างประเภทในขั้นเดียวกันไม่ได้",
            "ผู้ตอบหนึ่งคนเลือกขั้นที่เป็นปัญหาได้สูงสุด 2 ขั้น (คุมเวลาตอบ) "
            "ภาพรวมจึงเป็นการนับจากทุกคนรวมกัน ไม่ใช่รายการปัญหาทั้งหมดของแต่ละคน",
            "นับจากคนที่ผ่านขั้นนั้นเท่านั้น ขั้นที่มีคนผ่านน้อยจะแกว่งมาก",
        ],
    }


def _stage_summary(study: dict, kept: List[dict], nodes: dict) -> dict:
    """Reach / burden / pain by the customer's phase, not by a funnel template."""
    stages = study.get("stages") or ji.DEFAULT_STAGES
    stage_of = {s["id"]: s.get("stage_id") for s in (study.get("states") or [])}
    R = len(kept)
    out = []
    for st in stages:
        sids = [sid for sid, stg in stage_of.items() if stg == st["id"]]
        reached = sum(1 for r in kept
                      if any(p.get("state_id") in sids for p in (r.get("path") or [])))
        diffs, n_pain, n_rated = [], 0, 0
        for r in kept:
            nominated = set((r.get("pain") or {}).get("nominated") or [])
            for sid in sids:
                exp = (r.get("experience") or {}).get(sid) or {}
                if isinstance(exp.get("difficulty_1_5"), (int, float)):
                    diffs.append(float(exp["difficulty_1_5"]))
                    n_rated += 1
                    if sid in nominated:
                        n_pain += 1
        burden, ci = _burden(diffs)
        out.append({
            "id": st["id"], "label_th": st.get("label_th"),
            "n_steps": len(sids),
            "step_ids": sids,
            "reach": (reached / R) if R else 0.0,
            "n_reached": reached,
            "burden": burden, "burden_ci95": ci,
            "pain_rate": (n_pain / n_rated) if n_rated else None,
            "n_rated": n_rated,
        })
    return {"rows": out,
            "note_th": "ระยะคือสิ่งที่ลูกค้ากำลังทำ ไม่ใช่ขั้นตอนภายในของแบรนด์"}


def _observed_flow(seqs, states, labels, absorbing, nodes, terminals, R, stages=None) -> dict:
    """Counted transitions between steps — the map layer that is honest at Phase 1.

    This is NOT `results.map`: no probability is estimated, no certainty band is
    drawn and nothing is smoothed. Each edge is "how many respondents went from
    here to there", and a share is emitted only when the source has at least
    MIN_OUT_FOR_EDGE_SHARE outgoing transitions to divide by.
    """
    out_total = Counter()
    pair = Counter()
    for seq in seqs:
        for a, b in zip(seq, seq[1:]):
            pair[(a, b)] += 1
            out_total[a] += 1

    edges = []
    for (a, b), c in sorted(pair.items(), key=lambda kv: -kv[1]):
        src_total = out_total[a]
        share = (c / src_total) if src_total >= MIN_OUT_FOR_EDGE_SHARE else None
        edges.append({
            "from": a, "to": b, "count": c,
            "from_label": _label_of(a, labels, absorbing),
            "to_label": _label_of(b, labels, absorbing),
            "share_of_source": share,
            "self_loop": a == b,
            "thin": c < MIN_COUNT_FOR_SOLID_EDGE,
            "to_terminal": b in mj.ABSORBING,
        })

    flow_nodes = [{"id": mj.START, "label_th": "เริ่มต้น", "kind": "start",
                   "n_visit": R, "burden": None}]
    for sid in states:
        n = nodes.get(sid) or {}
        flow_nodes.append({
            "id": sid, "label_th": n.get("label_th") or sid, "kind": "step",
            "stage_id": n.get("stage_id"), "n_visit": n.get("n_visit", 0),
            "reach": n.get("reach"), "burden": n.get("burden"),
            "anxiety": n.get("anxiety"),
            "revisit": n.get("revisit"),
            "dominant_channel": n.get("dominant_channel"),
            "dominant_channel_share": n.get("dominant_channel_share"),
            "pain_nomination_rate": n.get("pain_nomination_rate"),
        })
    for key in (mj.CONV, mj.ABANDON, mj.UNKNOWN):
        t = terminals.get(key) or {}
        flow_nodes.append({"id": key, "label_th": t.get("label_th") or key,
                           "kind": "terminal", "n_visit": t.get("count", 0),
                           "reach": t.get("share"), "burden": None})

    max_count = max([e["count"] for e in edges] or [1])
    return {
        "nodes": flow_nodes,
        "edges": edges,
        "stages": [{"id": s.get("id"), "label_th": s.get("label_th")}
                   for s in (stages or [])],
        "max_edge_count": max_count,
        "total_transitions": int(sum(pair.values())),
        "share_floor": MIN_OUT_FOR_EDGE_SHARE,
        "thin_floor": MIN_COUNT_FOR_SOLID_EDGE,
        "note_th": ("แผนที่นี้คือ “การนับจริง” ของการเดินจากขั้นหนึ่งไปอีกขั้น "
                    "ความหนาของเส้นแทนจำนวนคน ไม่ใช่ความน่าจะเป็นที่ประมาณจากแบบจำลอง "
                    "และไม่มีการถ่วงน้ำหนักหรือช่วงความเชื่อมั่นบนเส้น "
                    f"เปอร์เซ็นต์จะแสดงเฉพาะขั้นที่มีการออกจากขั้นนั้นตั้งแต่ {MIN_OUT_FOR_EDGE_SHARE} ครั้งขึ้นไป"),
    }


def _label_of(token: str, labels: dict, absorbing: dict) -> str:
    if token == mj.START:
        return "เริ่มต้น"
    if token == mj.CONV:
        return absorbing.get("conv_label_th") or "สำเร็จ"
    if token == mj.ABANDON:
        return absorbing.get("abandon_label_th") or "เลิกสนใจ"
    if token == mj.UNKNOWN:
        return absorbing.get("unknown_label_th") or "ไม่ทราบปลายทาง"
    return labels.get(token) or token


def _burden(diffs: List[float]):
    """POMP on the SCALE ENDPOINTS, never on the sample min/max. High = bad."""
    n = len(diffs)
    if n == 0:
        return None, None
    mean = sum(diffs) / n
    burden = 100.0 * (mean - 1) / 4
    if n < 2:
        return burden, None
    sd = math.sqrt(sum((d - mean) ** 2 for d in diffs) / (n - 1))
    half = _t_crit(n) * sd / math.sqrt(n)
    lo, hi = 100.0 * (mean - half - 1) / 4, 100.0 * (mean + half - 1) / 4
    return burden, [max(0.0, lo), min(100.0, hi)]


def _set_consistent(resp: dict) -> bool:
    declared = set(resp.get("visited") or []) | set(resp.get("late_additions") or [])
    walked = {p.get("state_id") for p in (resp.get("path") or [])}
    return walked.issubset(declared) if walked else True


def _option_position_effect(responses: List[dict]) -> Optional[float]:
    """Selection-rate difference between top-half and bottom-half displayed
    positions on the Q1 checklist. Drives a warning above 5 pp and is printed in
    the thesis limitations — it is not collected and then ignored."""
    top_shown = top_sel = bot_shown = bot_sel = 0
    for r in responses:
        pos = ((r.get("quality") or {}).get("option_positions") or {}).get("q1") or {}
        if not pos:
            continue
        n = len(pos)
        chosen = set(r.get("visited") or [])
        for sid, p in pos.items():
            try:
                p = int(p)
            except (TypeError, ValueError):
                continue
            if p < n / 2:
                top_shown += 1
                top_sel += 1 if sid in chosen else 0
            else:
                bot_shown += 1
                bot_sel += 1 if sid in chosen else 0
    if top_shown < 10 or bot_shown < 10:
        return None
    return (top_sel / top_shown) - (bot_sel / bot_shown)


def _diagnostic_warnings(d: dict) -> List[dict]:
    out = []
    ope = d.get("option_position_effect")
    if ope is not None and abs(ope) > 0.05:
        out.append({"key": "option_position", "message_th": copy_th.DIAG_MESSAGES["option_position"]})
    if (d.get("late_addition_rate") or 0) > 0.15:
        out.append({"key": "late_addition", "message_th": copy_th.DIAG_MESSAGES["late_addition"]})
    if (d.get("mask_violation_rate") or 0) > 0.05:
        out.append({"key": "mask_violation", "message_th": copy_th.DIAG_MESSAGES["mask_violation"]})
    if (d.get("other_rate") or 0) > 0.10:
        out.append({"key": "other_rate", "message_th": copy_th.DIAG_MESSAGES["other_rate"]})
    if (d.get("unknown_rate") or 0) > 0.20:
        out.append({"key": "unknown_rate", "message_th": copy_th.DIAG_MESSAGES["unknown_rate"]})
    if ((d.get("exclusions") or {}).get("rate") or 0) > 0.10:
        out.append({"key": "exclusions", "message_th": copy_th.DIAG_MESSAGES["exclusions"],
                    "blocking": True})
    return out


def _completion_rate(study: dict, n_complete: int) -> float:
    started = int(study.get("link_starts") or 0)
    if started >= 10 and n_complete:
        return min(1.0, n_complete / started)
    return DEFAULT_COMPLETION_RATE


def _link_sends(r_now: int, r_target: int, completion: float) -> int:
    """Counted in link-sends, not completes (spec 7.1.4)."""
    missing = max(0, int(r_target) - int(r_now))
    if missing == 0:
        return 0
    return int(math.ceil(missing / max(0.15, completion)))


# ---------------------------------------------------------------------------
# Routes factory
# ---------------------------------------------------------------------------
def get_journey_routes(db, get_current_user, get_optional_user):
    """Mirrors get_brand_equity_routes(db, get_current_user, get_optional_user)."""

    def _is_admin(u) -> bool:
        return getattr(u, "role", None) == "admin"

    def _owns(u, study: dict) -> bool:
        if not study:
            return False
        if _is_admin(u) or study.get("owner_id") == u.id:
            return True
        oem = (study.get("owner_email") or "").strip().lower()
        uem = (getattr(u, "email", "") or "").strip().lower()
        return bool(oem) and oem == uem

    def _owner_query(u):
        import re
        uem = (getattr(u, "email", "") or "").strip().lower()
        clauses = [{"owner_id": u.id}]
        if uem:
            clauses.append({"owner_email": {"$regex": f"^{re.escape(uem)}$", "$options": "i"}})
        return {"$or": clauses}

    async def _get_owned(study_id: str, u) -> dict:
        study = await db.journey_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(u, study):
            raise HTTPException(403, "Not authorized")
        return study

    # ---- templates ------------------------------------------------------
    @journey_router.get("/templates")
    async def list_templates():
        return {
            "templates": {k: {"label_th": v["label_th"],
                              "steps": [s[0] for s in v["steps"]]}
                          for k, v in ji.TEMPLATES.items()},
            "stages": ji.DEFAULT_STAGES,
            "owners": ji.OWNER_LABELS_TH,
            "feasibility": ji.FEASIBILITY_LABELS_TH,
            "recency_bands": ji.RECENCY_BANDS,
            "pain_options": ji.DEFAULT_PAIN_OPTIONS,
            "segment_questions": ji.SEGMENT_QUESTIONS,
            "reference_budget": jb.estimate(**jb.REFERENCE_INSTRUMENT),
        }

    # ---- study CRUD -----------------------------------------------------
    @journey_router.post("/studies")
    async def create_study(data: StudyCreate, current_user=Depends(get_current_user)):
        if not (data.sampling_frame or "").strip():
            raise HTTPException(400, "ต้องระบุกรอบผู้ตอบ (sampling frame) ก่อนสร้างการศึกษา")
        states = ji.build_states_from_template(data.template_key)
        study = {
            "id": str(uuid.uuid4()),
            "owner_id": current_user.id,
            "owner_email": (current_user.email or "").strip().lower(),
            "title": data.title.strip() or "การศึกษาเส้นทางลูกค้า",
            "status": "draft",
            "analysis_level": data.analysis_level if data.analysis_level in ("product", "solution") else "product",
            "subject": data.subject.model_dump(),
            "sampling_frame": data.sampling_frame.strip(),
            "recall_window_days": data.recall_window_days,
            "target_responses": max(20, int(data.target_responses or 100)),
            "stages": ji.DEFAULT_STAGES,
            "states": states,
            "absorbing": ji.default_absorbing(data.analysis_level),
            "expected_transitions": ji.default_expected_transitions(states),
            "pain_options": ji.default_pain_options(states),
            "channel_options": list(ji.DEFAULT_CHANNEL_OPTIONS),
            "channel_types": ji.default_channel_types(),
            "channel_modes": ji.default_channel_modes(),
            "ask_channel_per_step": True,
            # Effort is only one axis of pain — uncertainty is asked separately
            # so ranking a step never rests on difficulty alone.
            "ask_anxiety_per_step": True,
            # One step can involve several touchpoints at once — asking for a
            # single one under-counts every mixed step, physical ones first.
            "channel_multi": True,
            "segment_questions": ji.build_segment_questions(),
            "consent": default_consent(data.researcher_name, data.advisor_name, data.contact),
            "content_revision": 1,
            "content_revision_log": [],
            "share_token": uuid.uuid4().hex[:12],
            "link_starts": 0,
            "quality_reference": None,
            # Declared from the start so every export can state where the pain
            # list came from. Activating a codebook flips this to "qualitative".
            "pain_source": "library_default",
            "codebook_id": None,
            "codebook_version": 0,
            "allow_pain_other_text": True,
            # The UI used to cap nominations on its own while the backend
            # accepted anything; the value lives here now and is enforced.
            "pain_nomination_cap": 2,
            "severity_scope": "state",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        study["structure_hash"] = ji.compute_structure_hash(study)
        await db.journey_studies.insert_one(dict(study))
        return {k: v for k, v in study.items() if k != "_id"}

    @journey_router.get("/studies")
    async def list_studies(current_user=Depends(get_current_user)):
        owner_q = {} if _is_admin(current_user) else _owner_query(current_user)
        not_trashed = {"deleted_at": {"$exists": False}}
        query = {"$and": [owner_q, not_trashed]} if owner_q else not_trashed
        items = await db.journey_studies.find(query, {"_id": 0}).sort("updated_at", -1).to_list(500)
        for s in items:
            s["response_count"] = await db.journey_responses.count_documents({"study_id": s["id"]})
        return {"studies": items, "total": len(items)}

    @journey_router.get("/studies/trash")
    async def list_trash(current_user=Depends(get_current_user)):
        owner_q = {} if _is_admin(current_user) else _owner_query(current_user)
        query = {"$and": [owner_q, {"deleted_at": {"$exists": True}}]}
        items = await db.journey_studies.find(query, {"_id": 0}).to_list(200)
        return {"studies": items, "total": len(items)}

    @journey_router.get("/studies/{study_id}")
    async def get_study(study_id: str, current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        study["response_count"] = await db.journey_responses.count_documents({"study_id": study_id})
        return study

    @journey_router.put("/studies/{study_id}")
    async def update_study(study_id: str, data: StudyUpdate,
                           current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        upd: Dict[str, Any] = {}
        after = dict(study)

        if data.title is not None:
            upd["title"] = data.title.strip()
        if data.subject is not None:
            upd["subject"] = data.subject.model_dump()
        if data.sampling_frame is not None:
            if not data.sampling_frame.strip():
                raise HTTPException(400, "กรอบผู้ตอบ (sampling frame) ห้ามว่าง")
            upd["sampling_frame"] = data.sampling_frame.strip()
        if data.recall_window_days is not None:
            upd["recall_window_days"] = int(data.recall_window_days)
        if data.target_responses is not None:
            upd["target_responses"] = max(20, int(data.target_responses))
        if data.stages is not None:
            upd["stages"] = data.stages
        if data.state_labels is not None:
            violations = check_blocklist(data.state_labels)
            if violations:
                raise HTTPException(400, "ชื่อขั้นตอนมีข้อมูลอ่อนไหวตาม PDPA: " + ", ".join(violations))
            upd["states"] = ji.build_states_from_labels(data.state_labels, study.get("states"))
        elif data.states is not None:
            upd["states"] = data.states
        if data.absorbing is not None:
            upd["absorbing"] = {**(study.get("absorbing") or {}), **data.absorbing}
        if data.pain_options is not None:
            upd["pain_options"] = data.pain_options
        if data.channel_options is not None:
            opts = [str(o).strip() for o in data.channel_options if str(o).strip()][:8]
            if len(opts) < 2:
                raise HTTPException(400, "ต้องมีช่องทางให้ผู้ตอบเลือกอย่างน้อย 2 ช่องทาง")
            violations = check_blocklist(opts)
            if violations:
                raise HTTPException(400, "ชื่อช่องทางมีข้อมูลอ่อนไหวตาม PDPA: " + ", ".join(violations))
            upd["channel_options"] = opts
            existing_types = {**ji.default_channel_types(opts),
                              **(study.get("channel_types") or {})}
            upd["channel_types"] = {o: existing_types.get(o, "digital") for o in opts}
            existing_modes = {**ji.default_channel_modes(opts),
                              **(study.get("channel_modes") or {})}
            upd["channel_modes"] = {o: existing_modes.get(o, "one_to_many") for o in opts}
        if data.channel_modes is not None:
            valid = {k: v for k, v in data.channel_modes.items() if v in ji.CHANNEL_MODES}
            upd["channel_modes"] = {**(study.get("channel_modes") or {}), **valid}
        if data.channel_types is not None:
            valid = {k: v for k, v in data.channel_types.items() if v in ji.CHANNEL_TYPES}
            upd["channel_types"] = {**(study.get("channel_types") or {}), **valid}
        if data.ask_channel_per_step is not None:
            upd["ask_channel_per_step"] = bool(data.ask_channel_per_step)
        if data.state_meta is not None:
            # Stage is a customer-side framing (what the customer is doing), so it
            # is editable at any time and never changes `structure_hash`.
            stage_ids = {s.get("id") for s in (after.get("stages") or ji.DEFAULT_STAGES)}
            meta = {m.get("id"): m for m in data.state_meta if m.get("id")}
            upd["states"] = [
                {**s, "stage_id": (meta.get(s["id"], {}).get("stage_id")
                                   if meta.get(s["id"], {}).get("stage_id") in stage_ids
                                   else s.get("stage_id"))}
                for s in (upd.get("states") or study.get("states") or [])
            ]
            after["states"] = upd["states"]
        if data.expected_transitions is not None:
            upd["expected_transitions"] = {"matrix": data.expected_transitions.get("matrix") or [],
                                           "role": "instrument_and_diagnostic_only"}
        if data.custom_segment is not None:
            try:
                upd["segment_questions"] = ji.build_segment_questions(data.custom_segment)
            except ValueError as e:
                raise HTTPException(400, str(e))
        if data.status is not None:
            if data.status not in ("draft", "collecting", "analyzing", "completed", "closed"):
                raise HTTPException(400, "สถานะไม่ถูกต้อง")
            upd["status"] = data.status

        after.update(upd)
        if "states" in upd and study.get("status") != "draft":
            # states changed after fielding: keep old ids, only labels may move
            pass
        if "states" in upd:
            states = after["states"]
            if len(states) > jb.MAX_STATES:
                raise HTTPException(400, f"ขั้นตอนสูงสุด {jb.MAX_STATES} ขั้น")
            existing_ids = {s["id"] for s in states}
            after["pain_options"] = {sid: (after.get("pain_options") or {}).get(sid)
                                     or list(ji.DEFAULT_PAIN_OPTIONS) for sid in existing_ids}
            upd["pain_options"] = after["pain_options"]
            if not data.expected_transitions:
                upd["expected_transitions"] = ji.default_expected_transitions(states)
                after["expected_transitions"] = upd["expected_transitions"]

        label_log = ji.diff_content_revision(study, after)
        new_hash = ji.compute_structure_hash(after)
        if new_hash != study.get("structure_hash"):
            if study.get("status") in ("collecting", "analyzing"):
                n = await db.journey_responses.count_documents({"study_id": study_id})
                if n > 0:
                    raise HTTPException(
                        400, "มีคำตอบเข้ามาแล้ว จึงแก้โครงสร้างแบบสอบถามไม่ได้ "
                             "(แก้ได้เฉพาะถ้อยคำ) — สร้างการศึกษาใหม่หากต้องการเปลี่ยนขั้นตอน")
            upd["structure_hash"] = new_hash
        if label_log:
            upd["content_revision"] = int(study.get("content_revision") or 1) + 1
            upd["content_revision_log"] = (study.get("content_revision_log") or []) + [
                {**row, "at": _now_iso(), "by": current_user.id} for row in label_log]

        upd["updated_at"] = _now_iso()
        await db.journey_studies.update_one({"id": study_id}, {"$set": upd})
        return await db.journey_studies.find_one({"id": study_id}, {"_id": 0})

    @journey_router.delete("/studies/{study_id}")
    async def trash_study(study_id: str, current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        await db.journey_studies.update_one({"id": study_id},
                                            {"$set": {"deleted_at": _now_iso()}})
        return {"message": "ย้ายไปถังขยะแล้ว"}

    @journey_router.post("/studies/{study_id}/restore")
    async def restore_study(study_id: str, current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        await db.journey_studies.update_one({"id": study_id}, {"$unset": {"deleted_at": ""}})
        return {"message": "กู้คืนแล้ว"}

    @journey_router.delete("/studies/{study_id}/purge")
    async def purge_study(study_id: str, current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        await db.journey_studies.delete_one({"id": study_id})
        await db.journey_responses.delete_many({"study_id": study_id})
        await db.journey_response_drafts.delete_many({"study_id": study_id})
        await db.journey_analysis_cache.delete_many({"study_id": study_id})
        await db.journey_recontacts.delete_many({"study_id": study_id})
        # Codebooks hold verbatim interview quotes. A purge is the PDPA hard
        # delete, so leaving them behind would keep personal data after the
        # study that justified collecting it is gone.
        await db.journey_codebooks.delete_many({"study_id": study_id})
        return {"message": "ลบถาวรแล้ว"}

    # ---- seed from the qualitative tool ---------------------------------
    @journey_router.get("/qualitative-runs")
    async def list_qualitative_runs(current_user=Depends(get_current_user)):
        runs = await db.qualitative_runs.find(
            {"owner_id": current_user.id}, {"_id": 0}).sort("created_at", -1).to_list(30)
        return {"runs": runs}

    @journey_router.post("/studies/{study_id}/seed")
    async def seed_study(study_id: str, body: SeedBody,
                         current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        if study.get("status") != "draft":
            raise HTTPException(400, "แก้ขั้นตอนได้เฉพาะตอนยังเป็นฉบับร่าง")

        run = None
        if body.qualitative_run_id:
            run = await db.qualitative_runs.find_one(
                {"id": body.qualitative_run_id, "owner_id": current_user.id}, {"_id": 0})
            if not run:
                raise HTTPException(404, "ไม่พบผลวิเคราะห์เชิงคุณภาพนี้")
        raw_text = (run or {}).get("raw_text") or body.raw_text or ""
        mermaid = (run or {}).get("mermaid_code") or body.mermaid_code or ""
        if not raw_text and not mermaid:
            raise HTTPException(400, "ต้องระบุ qualitative_run_id หรือวางผลวิเคราะห์เข้ามา")

        labels = _extract_steps(mermaid, raw_text)
        if not labels:
            raise HTTPException(400, "อ่านชื่อขั้นตอนจากข้อความที่ให้มาไม่ได้ — กรุณาแก้ไขเอง")
        labels = labels[:jb.MAX_STATES]

        seed_meta = {"qualitative_run_id": (run or {}).get("id"),
                     "raw_text": raw_text[:4000], "mermaid_code": mermaid[:4000],
                     "generated_at": _now_iso(), "extracted_labels": labels}
        upd = {"qualitative_seed": seed_meta, "updated_at": _now_iso()}
        if body.apply_states:
            states = ji.build_states_from_labels(labels, study.get("states"))
            upd["states"] = states
            upd["expected_transitions"] = ji.default_expected_transitions(states)
            upd["pain_options"] = ji.default_pain_options(states)
            after = {**study, **upd}
            upd["structure_hash"] = ji.compute_structure_hash(after)
        await db.journey_studies.update_one({"id": study_id}, {"$set": upd})
        return {"applied": body.apply_states, "labels": labels,
                "study": await db.journey_studies.find_one({"id": study_id}, {"_id": 0})}

    # ---- journey codebook: the qualitative -> quantitative contract ------
    # Spec: memory/CJM_PAINPOINT_SPEC.md rev 2. Nothing here reaches a
    # respondent unless a human approved it and a verbatim quote backs it.

    async def _provenance_for(study: dict, responses: List[dict]) -> dict:
        """Where every pain number on this page came from.

        Recomputed on each call rather than cached with the results: it reflects
        the codebook, which can be corrected (labels, method note) without the
        responses changing.
        """
        codebook = None
        if study.get("codebook_id"):
            codebook = await db.journey_codebooks.find_one(
                {"id": study["codebook_id"]}, {"_id": 0})

        n_other = n_nom = n_back = 0
        for r in responses:
            pain = r.get("pain") or {}
            for sid in (pain.get("nominated") or []):
                row = pain.get(sid) or {}
                n_nom += 1
                if (row.get("other_text") or "").strip():
                    n_other += 1
                if row.get("back_coded_ids"):
                    n_back += 1

        block = jcb.provenance_block(
            codebook, study,
            other=jcb.other_rate(n_other, n_nom, mj.wilson_interval),
            back_coded_rate=round(n_back / n_other, 4) if n_other else None)
        return block

    def _public_pain_options(study: dict, codebook: Optional[dict]):
        """What the respondent UI renders per step.

        Falls back to the study's label lists when no codebook is active, so a
        study fielded before this feature is unaffected.
        """
        if codebook:
            return {st["id"]: jcb.pain_options_for_state(codebook, st["id"])
                    for st in (study.get("states") or [])}
        legacy = study.get("pain_options") or {}
        return {sid: [{"id": None, "label_th": lbl} for lbl in (labels or [])]
                for sid, labels in legacy.items()}

    async def _codebooks(study_id: str):
        rows = await db.journey_codebooks.find({"study_id": study_id},
                                               {"_id": 0}).to_list(100)
        active = next((r for r in rows if r.get("status") == "active"), None)
        draft = next((r for r in rows if r.get("status") == "draft"), None)
        return active, draft

    async def _n_responses(study_id: str) -> int:
        return int(await db.journey_responses.count_documents({"study_id": study_id}))

    def _blank_codebook(study: dict, version: int) -> dict:
        seed = study.get("qualitative_seed") or {}
        return {"id": str(uuid.uuid4()), "study_id": study["id"], "version": version,
                "status": "draft",
                "source": {"qualitative_run_ids": [], "pasted_text_sha1": [],
                           "n_interviews": None, "collection_method_th": "",
                           "journey_style": seed.get("journey_style") or "nonlinear"},
                "states": [], "edges": [], "touchpoints": [], "pain_categories": [],
                "reliability": {"mode": "none"}, "saturation": [],
                "created_at": _now_iso(), "updated_at": _now_iso(),
                "activated_at": None}

    async def _budget_for(study: dict, codebook: dict) -> dict:
        """Budget computed from the codebook's real option counts.

        The per-state ceiling is advice; this is the ceiling that blocks, so it
        has to see the actual numbers rather than an assumed constant.
        """
        approved = [st for st in (codebook.get("states") or [])
                    if st.get("status") == "approved"]
        states = approved or (study.get("states") or [])
        per_state = [len(jcb.pain_options_for_state(codebook, st.get("id") or ""))
                     for st in states] or [0]
        return jb.check_design(
            m_states=max(1, len(states)),
            r_target=int(study.get("target_responses") or 100),
            n_pain_options=max(per_state))

    @journey_router.get("/studies/{study_id}/codebook")
    async def get_codebook(study_id: str, current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        active, draft = await _codebooks(study_id)
        # Blockers travel with the GET so the activate button is already
        # disabled on first paint, with its reasons, instead of after a click.
        blockers = jcb.validate_for_activation(draft) if draft else [
            "ยังไม่มีชุดรหัสฉบับร่าง — สกัดจากข้อมูลเชิงคุณภาพก่อน"]
        return {"active": active, "draft": draft,
                "pain_source": study.get("pain_source") or "library_default",
                "blockers": blockers,
                "warnings": jcb.soft_warnings(draft) if draft else [],
                "can_edit": (await _n_responses(study_id)) == 0}

    @journey_router.post("/studies/{study_id}/codebook/extract")
    async def extract_codebook(study_id: str, body: CodebookExtract,
                               current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        if await _n_responses(study_id):
            raise HTTPException(400, "มีคำตอบเข้ามาแล้ว แก้ชุดรหัสไม่ได้")

        raw_parts, mermaid_parts, run_ids, styles = [], [], [], []
        for rid in (body.qualitative_run_ids or []):
            run = await db.qualitative_runs.find_one({"id": rid}, {"_id": 0})
            if not run:
                raise HTTPException(404, "ไม่พบผลวิเคราะห์เชิงคุณภาพ")
            owner = run.get("owner_id")
            if owner and owner != current_user.id and not _is_admin(current_user):
                raise HTTPException(403, "Not authorized")
            raw_parts.append(run.get("raw_text") or "")
            mermaid_parts.append(run.get("mermaid_code") or "")
            if run.get("journey_style"):
                styles.append(run["journey_style"])
            run_ids.append(rid)
        if body.raw_text:
            raw_parts.append(body.raw_text)
        if body.mermaid_code:
            mermaid_parts.append(body.mermaid_code)
        # `interviews` is the primary path — it is the only input that can carry
        # a saturation curve — so it has to count as material on its own.
        supplied = raw_parts + mermaid_parts + list(body.interviews or [])
        if not any((p or "").strip() for p in supplied):
            raise HTTPException(400, "ต้องระบุ qualitative_run_ids หรือวางข้อความเข้ามา")

        found = jcb.extract_candidates(raw_text="\n".join(raw_parts),
                                       mermaid="\n".join(mermaid_parts),
                                       run_ids=run_ids,
                                       interviews=list(body.interviews or []))

        active, draft = await _codebooks(study_id)
        version = ((active or {}).get("version") or 0) + 1
        cb = draft or _blank_codebook(study, version)
        for key in ("states", "edges", "touchpoints", "pain_categories"):
            cb[key] = found[key]
        cb["source"]["qualitative_run_ids"] = run_ids
        if body.interviews:
            cb["source"]["n_interviews"] = len(body.interviews)
        if styles:
            cb["source"]["journey_style"] = styles[0]
        cb["updated_at"] = _now_iso()
        await db.journey_codebooks.update_one({"id": cb["id"]}, {"$set": cb}, upsert=True)
        return {"draft": cb, "n_sentences": found["n_sentences"],
                "note_th": ("ทุกรายการเป็นข้อเสนอ ต้องอนุมัติทีละรายการ "
                            "และต้องมีข้อความต้นทางอ้างอิง ก่อนนำไปเก็บข้อมูล")}

    @journey_router.put("/studies/{study_id}/codebook")
    async def put_codebook(study_id: str, body: CodebookUpdate,
                           current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        if await _n_responses(study_id):
            raise HTTPException(400, "มีคำตอบเข้ามาแล้ว แก้ชุดรหัสไม่ได้")
        active, draft = await _codebooks(study_id)
        cb = draft or _blank_codebook(study, ((active or {}).get("version") or 0) + 1)

        patch = body.model_dump(exclude_none=True)
        for key in ("source", "states", "edges", "touchpoints", "pain_categories"):
            if key in patch:
                cb[key] = patch[key]
        # Approval is stamped here, never accepted from the client: the whole
        # gate rests on approved_by being real.
        for key in ("states", "touchpoints", "pain_categories"):
            for row in cb.get(key) or []:
                if row.get("status") == "approved":
                    if not row.get("approved_by"):
                        row["approved_by"] = current_user.id
                        row["approved_at"] = _now_iso()
                else:
                    row["approved_by"] = None
                    row["approved_at"] = None
        cb["updated_at"] = _now_iso()
        await db.journey_codebooks.update_one({"id": cb["id"]}, {"$set": cb}, upsert=True)

        budget = await _budget_for(study, cb)
        blockers = jcb.validate_for_activation(cb, budget=budget)
        pdpa = jcb.blocklist_terms(cb, check_blocklist)
        if pdpa:
            blockers.append("มีคำที่ห้ามถามตาม PDPA: " + ", ".join(pdpa))
        return {"draft": cb, "blockers": blockers, "pdpa_hits": pdpa,
                "warnings": jcb.soft_warnings(cb), "budget": budget}

    @journey_router.post("/studies/{study_id}/codebook/activate")
    async def activate_codebook(study_id: str, current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        if await _n_responses(study_id):
            raise HTTPException(400, "มีคำตอบเข้ามาแล้ว เปลี่ยนชุดรหัสไม่ได้")
        active, draft = await _codebooks(study_id)
        if not draft:
            raise HTTPException(404, "ยังไม่มีชุดรหัสฉบับร่าง")

        budget = await _budget_for(study, draft)
        blockers = jcb.validate_for_activation(draft, budget=budget)
        pdpa = jcb.blocklist_terms(draft, check_blocklist)
        if pdpa:
            blockers.append("มีคำที่ห้ามถามตาม PDPA: " + ", ".join(pdpa))
        if blockers:
            raise HTTPException(400, {"message": "ยังเปิดใช้ชุดรหัสนี้ไม่ได้",
                                      "blockers": blockers})

        if active:
            await db.journey_codebooks.update_one(
                {"id": active["id"]},
                {"$set": {"status": "superseded", "updated_at": _now_iso()}})
        draft["status"] = "active"
        draft["activated_at"] = _now_iso()
        draft["updated_at"] = _now_iso()
        # Frozen at activation: both describe the qualitative step, which stops
        # changing here, and both are read on every analysis afterwards.
        draft["saturation"] = jcb.saturation_from_codebook(draft)
        await db.journey_codebooks.update_one({"id": draft["id"]}, {"$set": draft})

        # `pain_options` stays populated so every existing reader keeps working;
        # it is now derived from the codebook rather than being the source.
        opts = {st["id"]: jcb.pain_options_for_state(draft, st["id"])
                for st in (study.get("states") or [])}
        pain_options = {sid: [o["label_th"] for o in rows] for sid, rows in opts.items()}
        # Ids are what a submission is validated against; labels stay only so
        # existing readers and exports keep working.
        pain_category_ids = {sid: [o["id"] for o in rows] for sid, rows in opts.items()}
        after = dict(study)
        after.update({"pain_options": pain_options})
        new_hash = ji.compute_structure_hash(after)
        translated = jcb.translate_edges_to_states(draft, study.get("states") or [])
        await db.journey_studies.update_one({"id": study_id}, {"$set": {
            "codebook_id": draft["id"], "codebook_version": draft["version"],
            "pain_source": "qualitative", "pain_options": pain_options,
            "pain_category_ids": pain_category_ids,
            "claimed_edges": translated["edges"],
            "claimed_edges_unmatched": translated["unmatched"],
            "journey_style_claimed": (draft.get("source") or {}).get("journey_style"),
            "structure_hash": new_hash, "updated_at": _now_iso()}})
        return {"codebook": draft, "structure_hash": new_hash,
                "warnings": jcb.soft_warnings(draft),
                "claimed_edges": translated["edges"],
                "claimed_edges_unmatched": translated["unmatched"],
                "saturation": draft["saturation"]}

    @journey_router.post("/studies/{study_id}/codebook/reliability")
    async def codebook_reliability(study_id: str, body: ReliabilityBody,
                                   current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        active, draft = await _codebooks(study_id)
        cb = active or draft
        if not cb:
            raise HTTPException(404, "ยังไม่มีชุดรหัส")
        ids = [c["id"] for c in (cb.get("pain_categories") or [])
               if c.get("status") == "approved"]
        try:
            report = jcb.reliability_report(body.coder_a, body.coder_b, ids,
                                            mode=body.mode, coder_ref=body.coder_ref)
        except jcb.CodebookError as e:
            raise HTTPException(400, str(e))
        report["computed_at"] = _now_iso()
        await db.journey_codebooks.update_one(
            {"id": cb["id"]}, {"$set": {"reliability": report,
                                        "updated_at": _now_iso()}})
        return report

    @journey_router.get("/studies/{study_id}/pain-other-texts")
    async def pain_other_texts(study_id: str, current_user=Depends(get_current_user)):
        """Everything a respondent typed under "other" that nobody has coded yet.

        A high other-rate is the signal that the codebook is incomplete; this is
        the queue for doing something about it.
        """
        await _get_owned(study_id, current_user)
        rows = await db.journey_responses.find({"study_id": study_id},
                                               {"_id": 0}).to_list(5000)
        pending, done = [], 0
        for r in rows:
            pain = r.get("pain") or {}
            for sid in (pain.get("nominated") or []):
                cell = pain.get(sid) or {}
                text = (cell.get("other_text") or "").strip()
                if not text:
                    continue
                if cell.get("back_coded_ids"):
                    done += 1
                    continue
                pending.append({"response_id": r.get("id"), "state_id": sid,
                                "text": text, "submitted_at": r.get("created_at")})
        total = len(pending) + done
        return {"pending": pending, "n_pending": len(pending), "n_back_coded": done,
                "back_coded_rate": round(done / total, 4) if total else None}

    @journey_router.post("/studies/{study_id}/pain-back-code")
    async def pain_back_code(study_id: str, body: BackCodeBody,
                             current_user=Depends(get_current_user)):
        """Attach an existing category to one free-text answer.

        Only ids already in the active codebook are accepted. Inventing a new
        category from here would let a label enter the study without a quote and
        without approval, which is the one thing this whole module prevents.
        """
        study = await _get_owned(study_id, current_user)
        active, _ = await _codebooks(study_id)
        if not active:
            raise HTTPException(400, "ต้องเปิดใช้ชุดรหัสก่อนจึงจะลงรหัสย้อนกลับได้")
        allowed = {c["id"] for c in (active.get("pain_categories") or [])
                   if c.get("status") == "approved"}
        picked = [c for c in dict.fromkeys(body.category_ids or []) if c in allowed]
        if not picked:
            raise HTTPException(400, "ไม่มีรหัสที่ใช้ได้ — ต้องเป็นประเภทที่อนุมัติแล้วในชุดรหัสที่ใช้อยู่")

        resp = await db.journey_responses.find_one(
            {"id": body.response_id, "study_id": study_id}, {"_id": 0})
        if not resp:
            raise HTTPException(404, "ไม่พบคำตอบนี้")
        cell = ((resp.get("pain") or {}).get(body.state_id) or {})
        if not (cell.get("other_text") or "").strip():
            raise HTTPException(400, "คำตอบนี้ไม่มีข้อความ \"อื่น ๆ\" ให้ลงรหัส")

        await db.journey_responses.update_one(
            {"id": body.response_id, "study_id": study_id},
            {"$set": {f"pain.{body.state_id}.back_coded_ids": picked,
                      f"pain.{body.state_id}.back_coded_at": _now_iso(),
                      f"pain.{body.state_id}.back_coded_by": current_user.id}})
        # Back-coding changes what the pain matrix counts, so the cached
        # analysis for every filter slice is now wrong.
        await db.journey_analysis_cache.delete_many({"study_id": study_id})
        return {"response_id": body.response_id, "state_id": body.state_id,
                "category_ids": picked}

    # ---- budget + preview + lock ----------------------------------------
    @journey_router.get("/studies/{study_id}/budget-estimate")
    async def budget_estimate(study_id: str, current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        est = jb.check_design(
            m_states=len(study.get("states") or []),
            r_target=int(study.get("target_responses") or 100),
            level="solution" if study.get("analysis_level") == "solution" else "product",
            n_segment_items=len(study.get("segment_questions") or []),
            ask_channel_per_step=bool(study.get("ask_channel_per_step")),
            channel_multi=bool(study.get("channel_multi")),
            ask_anxiety_per_step=bool(study.get("ask_anxiety_per_step")),
        )
        return json_safe(est)

    @journey_router.get("/studies/{study_id}/design-preview")
    async def design_preview(study_id: str, current_user=Depends(get_current_user)):
        """What R_target actually buys, before anyone spends 5.5 minutes on it."""
        study = await _get_owned(study_id, current_user)
        m = len(study.get("states") or [])
        r = int(study.get("target_responses") or 100)
        lbar = 4.0
        n_visit = int(round(r * lbar / max(1, m)))
        rows = []
        for p in (0.10, 0.25, 0.50):
            ci = mj.wilson_interval(int(round(p * r)), r) or [None, None]
            rows.append({"share": p, "ci95": ci,
                         "halfwidth_pp": round(100 * (ci[1] - ci[0]) / 2, 1)})
        burden_half = round(100 * (_t_crit(n_visit) * 1.0 / math.sqrt(max(1, n_visit))) / 4, 1)
        bands = [
            {"threshold": 30, "unlocks": "สัดส่วนของเส้นทางที่พบบ่อย", "met": r >= 30},
            {"threshold": 40, "unlocks": "เมทริกซ์การเปลี่ยนขั้น (เฟส 2)", "met": r >= 40},
            {"threshold": 100, "unlocks": "แผนที่ถ่วงน้ำหนักภาพรวม (เฟส 2)", "met": r >= 100},
            {"threshold": 200, "unlocks": "แยกกลุ่มย่อยได้ (เฟส 4)", "met": r >= 200},
        ]
        return json_safe({
            "r_target": r, "m_states": m,
            "expected_visitors_per_step": n_visit,
            "route_share_precision": rows,
            "burden_ci_halfwidth_pp": burden_half,
            "link_sends_needed": _link_sends(0, r, DEFAULT_COMPLETION_RATE),
            "assumed_completion_rate": DEFAULT_COMPLETION_RATE,
            "bands": bands,
            "note_th": ("ตัวเลขนี้คือความแม่นที่ขนาดตัวอย่างเป้าหมายจะให้ได้ "
                        "ก่อนที่จะมีใครเสียเวลาตอบจริง " + copy_th.INTERVAL_CAVEAT),
        })

    @journey_router.post("/studies/{study_id}/lock-instrument")
    async def lock_instrument(study_id: str, current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        m = len(study.get("states") or [])
        if m < 3:
            raise HTTPException(400, "ต้องมีอย่างน้อย 3 ขั้นตอนก่อนเปิดเก็บข้อมูล")
        est = jb.check_design(m_states=m, r_target=int(study.get("target_responses") or 100),
                              level="solution" if study.get("analysis_level") == "solution" else "product",
                              n_segment_items=len(study.get("segment_questions") or []),
                              ask_channel_per_step=bool(study.get("ask_channel_per_step")),
                          channel_multi=bool(study.get("channel_multi")),
                              ask_anxiety_per_step=bool(study.get("ask_anxiety_per_step")))
        if est["blocked"]:
            raise HTTPException(400, "แบบสอบถามเกินเพดานที่ผู้ตอบรับไหว: " + " · ".join(est["blockers"]))
        if not (study.get("sampling_frame") or "").strip():
            raise HTTPException(400, "ต้องระบุกรอบผู้ตอบก่อนเปิดเก็บข้อมูล")
        h = ji.compute_structure_hash(study)
        await db.journey_studies.update_one({"id": study_id}, {"$set": {
            "structure_hash": h, "status": "collecting",
            "locked_at": _now_iso(), "updated_at": _now_iso()}})
        return {"structure_hash": h, "status": "collecting", "budget": json_safe(est),
                "share_token": study["share_token"]}

    # ---- public respondent surface --------------------------------------
    @journey_router.get("/public/{share_token}")
    async def get_public_study(share_token: str):
        study = await db.journey_studies.find_one({"share_token": share_token}, {"_id": 0})
        if not study:
            raise HTTPException(404, "ไม่พบแบบสอบถาม")
        if study.get("status") not in ("collecting", "analyzing"):
            raise HTTPException(410, "แบบสอบถามนี้ปิดรับคำตอบแล้ว")
        await db.journey_studies.update_one({"id": study["id"]}, {"$inc": {"link_starts": 1}})
        codebook = None
        if study.get("codebook_id"):
            codebook = await db.journey_codebooks.find_one(
                {"id": study["codebook_id"]}, {"_id": 0})
        per_state = [len(v or []) for v in (study.get("pain_category_ids") or {}).values()]
        est = jb.estimate(m_states=len(study.get("states") or []),
                          n_segment_items=len(study.get("segment_questions") or []),
                          ask_channel_per_step=bool(study.get("ask_channel_per_step")),
                          channel_multi=bool(study.get("channel_multi")),
                          n_pain_options=max(per_state) if per_state else 6,
                          allow_other_text=bool(study.get("allow_pain_other_text", True)),
                          severity_scope=study.get("severity_scope") or "state",
                          ask_anxiety_per_step=bool(study.get("ask_anxiety_per_step")))
        return {
            "id": study["id"], "share_token": share_token,
            "title": study.get("title"), "analysis_level": study.get("analysis_level"),
            "subject": study.get("subject"),
            "stages": study.get("stages"), "states": study.get("states"),
            "absorbing": study.get("absorbing"),
            "expected_transitions": study.get("expected_transitions"),
            "pain_options": study.get("pain_options"),
            # Per-state options carrying their stable ids, plus the two settings
            # the respondent UI must honour rather than hard-code.
            "pain_category_options": _public_pain_options(study, codebook),
            "allow_pain_other_text": bool(study.get("allow_pain_other_text", True)),
            "pain_nomination_cap": int(study.get("pain_nomination_cap") or 2),
            "pain_source": study.get("pain_source") or "library_default",
            "codebook_version": int(study.get("codebook_version") or 0),
            "channel_options": study.get("channel_options") or ji.DEFAULT_CHANNEL_OPTIONS,
            "channel_types": study.get("channel_types") or ji.default_channel_types(
                study.get("channel_options")),
            "channel_multi": bool(study.get("channel_multi")),
            "ask_anxiety_per_step": bool(study.get("ask_anxiety_per_step")),
            "ask_channel_per_step": bool(study.get("ask_channel_per_step")),
            "segment_questions": study.get("segment_questions"),
            "recency_bands": ji.RECENCY_BANDS,
            "recall_window_days": study.get("recall_window_days"),
            "consent": study.get("consent") or default_consent(),
            "structure_hash": study.get("structure_hash"),
            "content_revision": study.get("content_revision"),
            "estimated_seconds": est["seconds_median"],
            "estimated_minutes": est["minutes_median"],
        }

    @journey_router.post("/public/{share_token}/respond")
    async def submit_response(share_token: str, data: JourneySubmit):
        study = await db.journey_studies.find_one({"share_token": share_token}, {"_id": 0})
        if not study:
            raise HTTPException(404, "ไม่พบแบบสอบถาม")
        if study.get("status") not in ("collecting", "analyzing"):
            raise HTTPException(410, "แบบสอบถามนี้ปิดรับคำตอบแล้ว")
        if not data.consent.participation:
            raise HTTPException(400, "ต้องให้ความยินยอมก่อนจึงจะบันทึกคำตอบได้")

        band_id = (data.episode or {}).get("recency_band")
        band = next((b for b in ji.RECENCY_BANDS if b["id"] == band_id), None)
        window = int(study.get("recall_window_days") or 365)
        if band and (band["days"] < 0 or band["days"] > window):
            return {"screened_out": True,
                    "message": "ขอบคุณมากครับ/ค่ะ — การศึกษานี้ต้องการผู้ที่มีประสบการณ์ในช่วงเวลาที่กำหนด"}

        clean = _clean_submission(study, data)
        if not clean["path"] and clean["terminal"] == mj.UNKNOWN:
            # "ไม่ได้ทำขั้นไหนเลย" is legitimate; a wholly empty submission is not.
            if not data.visited and not data.outcome:
                raise HTTPException(400, "ยังไม่มีคำตอบที่บันทึกได้")

        token = new_respondent_token()
        resp = {
            "id": str(uuid.uuid4()),
            "study_id": study["id"],
            "respondent_token": token,
            "structure_hash": study.get("structure_hash"),
            "content_revision": study.get("content_revision"),
            "consent": consent_record(True, data.consent.recontact, data.consent.linkage,
                                      (study.get("consent") or {}).get("version") or CONSENT_VERSION),
            "episode": {"recency_band": band_id},
            "subject_choice": (data.subject_choice or None),
            "outcome": data.outcome,
            "terminated_by": data.terminated_by,
            "replay_edited": bool(data.replay_edited),
            "edit_ops": (data.edit_ops or [])[:50],
            "channel": "public_link",
            "started_at": _now_iso(),
            "submitted_at": _now_iso(),
            **clean,
        }
        # Pin the answer to the vocabulary that produced it. Without this a
        # later codebook version would silently reinterpret older answers.
        resp["codebook_version"] = int(study.get("codebook_version") or 0)
        await db.journey_responses.insert_one(dict(resp))

        if data.consent.recontact and data.recontact_value:
            await db.journey_recontacts.insert_one({
                "respondent_token": token, "study_id": study["id"],
                "channel": "free_text", "value": str(data.recontact_value)[:200],
                "consented_at": _now_iso(),
                "purge_after": purge_after_iso((study.get("consent") or {}).get("retention_months", 12)),
            })
        if data.draft_id:
            await db.journey_response_drafts.delete_one(
                {"id": data.draft_id, "study_id": study["id"]})
        await db.journey_analysis_cache.delete_many({"study_id": study["id"]})
        return {"message": "บันทึกคำตอบแล้ว", "id": resp["id"], "respondent_token": token,
                "withdraw_note_th": (study.get("consent") or {}).get("withdraw_note_th")}

    @journey_router.post("/public/{share_token}/draft")
    async def save_draft(share_token: str, data: DraftSave):
        study = await db.journey_studies.find_one({"share_token": share_token},
                                                  {"_id": 0, "id": 1, "status": 1})
        if not study:
            raise HTTPException(404, "ไม่พบแบบสอบถาม")
        if study.get("status") not in ("collecting", "analyzing"):
            raise HTTPException(410, "แบบสอบถามนี้ปิดรับคำตอบแล้ว")
        draft_id = data.draft_id or str(uuid.uuid4())
        now = _now_iso()
        await db.journey_response_drafts.update_one(
            {"id": draft_id},
            {"$set": {"id": draft_id, "study_id": study["id"], "share_token": share_token,
                      "state": data.state or {}, "updated_at": now},
             "$setOnInsert": {"created_at": now}},
            upsert=True)
        return {"draft_id": draft_id, "updated_at": now}

    @journey_router.get("/public/{share_token}/draft/{draft_id}")
    async def get_draft(share_token: str, draft_id: str):
        d = await db.journey_response_drafts.find_one(
            {"id": draft_id, "share_token": share_token}, {"_id": 0})
        if not d:
            raise HTTPException(404, "ไม่พบข้อมูลที่บันทึกไว้")
        return d

    @journey_router.delete("/public/{share_token}/draft/{draft_id}")
    async def delete_draft(share_token: str, draft_id: str):
        await db.journey_response_drafts.delete_one({"id": draft_id, "share_token": share_token})
        return {"message": "ลบฉบับร่างแล้ว"}

    @journey_router.delete("/public/{share_token}/withdraw/{respondent_token}")
    async def withdraw(share_token: str, respondent_token: str):
        """PDPA hard delete — response, draft and recontact row all go."""
        study = await db.journey_studies.find_one({"share_token": share_token},
                                                  {"_id": 0, "id": 1})
        if not study:
            raise HTTPException(404, "ไม่พบแบบสอบถาม")
        res = await db.journey_responses.delete_one(
            {"study_id": study["id"], "respondent_token": respondent_token})
        if res.deleted_count == 0:
            raise HTTPException(404, "ไม่พบคำตอบที่ตรงกับรหัสนี้")
        await db.journey_recontacts.delete_many({"respondent_token": respondent_token})
        await db.journey_analysis_cache.delete_many({"study_id": study["id"]})
        return {"message": "ลบคำตอบของคุณออกจากงานวิจัยเรียบร้อยแล้ว"}

    # ---- owner data surfaces --------------------------------------------
    @journey_router.get("/studies/{study_id}/responses")
    async def list_responses(study_id: str, current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        items = await db.journey_responses.find({"study_id": study_id}, {"_id": 0}).to_list(5000)
        return {"responses": items, "total": len(items)}

    @journey_router.get("/studies/{study_id}/analysis")
    async def analysis(study_id: str,
                       method: str = Query(METHOD_MODEL_FREE),
                       from_date: Optional[str] = Query(None, alias="from"),
                       to_date: Optional[str] = Query(None, alias="to"),
                       segments: Optional[str] = Query(None),
                       force: bool = Query(False),
                       current_user=Depends(get_current_user)):
        study = await _get_owned(study_id, current_user)
        seg = parse_segments_param(segments)
        sig = filter_signature(from_date, to_date, seg)

        all_responses = await db.journey_responses.find({"study_id": study_id},
                                                        {"_id": 0}).to_list(5000)
        responses = apply_response_filter(all_responses, from_date, to_date, seg)

        cached = await db.journey_analysis_cache.find_one(
            {"study_id": study_id, "method": METHOD_MODEL_FREE, "filter_sig": sig}, {"_id": 0})
        if (cached and not force
                and cached.get("schema_version") == ANALYSIS_SCHEMA_VERSION
                and cached.get("respondent_count") == len(responses)
                and cached.get("structure_hash") == study.get("structure_hash")):
            return {"status": "ok", "method": METHOD_MODEL_FREE, "cached": True,
                    "filter_signature": sig, "respondent_count": len(responses),
                    "structure_hash": study.get("structure_hash"),
                    "content_revision": study.get("content_revision"),
                    "segments_available": segments_available(
                        all_responses, [q["id"] for q in study.get("segment_questions") or []]),
                    "provenance": await _provenance_for(study, responses),
                    "results": cached.get("results")}

        # Reference medians freeze once, so results stay monotone in n (spec 2.8).
        quality_reference = study.get("quality_reference")
        if not quality_reference and len(all_responses) >= QUALITY_REFERENCE_FREEZE_AT:
            durs = sorted(float((r.get("quality") or {}).get("duration_sec") or 0)
                          for r in all_responses)
            durs = [d for d in durs if d > 0]
            if durs:
                quality_reference = {"median_total_sec": durs[len(durs) // 2],
                                     "frozen_at_R": len(all_responses),
                                     "frozen_at": _now_iso()}
                await db.journey_studies.update_one(
                    {"id": study_id}, {"$set": {"quality_reference": quality_reference}})

        results = compute_model_free(study, responses, quality_reference)

        try:
            await db.journey_analysis_cache.update_one(
                {"study_id": study_id, "method": METHOD_MODEL_FREE, "filter_sig": sig},
                {"$set": {"study_id": study_id, "method": METHOD_MODEL_FREE, "filter_sig": sig,
                          "schema_version": ANALYSIS_SCHEMA_VERSION,
                          "respondent_count": len(responses),
                          "structure_hash": study.get("structure_hash"),
                          "results": results, "created_at": _now_iso()}},
                upsert=True)
        except Exception as e:  # a cache write must never 500 a good analysis
            logging.warning("[Journey] analysis cache write failed for %s: %s", study_id, e)

        return {"status": "ok", "method": METHOD_MODEL_FREE, "cached": False,
                "filter_signature": sig, "respondent_count": len(responses),
                "structure_hash": study.get("structure_hash"),
                "content_revision": study.get("content_revision"),
                "segments_available": segments_available(
                    all_responses, [q["id"] for q in study.get("segment_questions") or []]),
                "provenance": await _provenance_for(study, responses),
                "results": results}

    @journey_router.get("/studies/{study_id}/drafts-summary")
    async def drafts_summary(study_id: str, current_user=Depends(get_current_user)):
        await _get_owned(study_id, current_user)
        drafts = await db.journey_response_drafts.find({"study_id": study_id},
                                                       {"_id": 0}).to_list(500)
        return {"unfinished": len(drafts),
                "latest_updated_at": max([d.get("updated_at") or "" for d in drafts] or [None])}

    return journey_router


# ---------------------------------------------------------------------------
# Seeding helper — pull candidate step names out of the qualitative output
# ---------------------------------------------------------------------------
def _extract_steps(mermaid: str, raw_text: str) -> List[str]:
    """Deterministic extraction. No LLM: the LLM produces no number and no
    locked vocabulary — the student edits whatever comes out of here."""
    import re
    labels: List[str] = []

    for m in re.finditer(r'[\[\(\{"]([^\[\]\(\)\{\}"|>]{3,60})[\]\)\}"]', mermaid or ""):
        text = m.group(1).strip()
        if text and text.lower() not in ("start", "end") and text not in labels:
            labels.append(text)

    if not labels:
        for line in (raw_text or "").splitlines():
            line = line.strip(" -•\t")
            line = re.sub(r"^\d+[\.\)]\s*", "", line)
            if 3 <= len(line) <= 60 and line not in labels:
                labels.append(line)
    return labels[:jb.MAX_STATES]
