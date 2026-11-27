"""Respondent data-quality checks for choice-based conjoint (2026-11 audit).

Pure functions — no DB. Nothing here changes the estimation sample; the report
tells the researcher which respondents look suspicious so they can decide
(and disclose) whether to exclude them. Thresholds follow common CBC practice:

* speeder      — total duration below ``speeder_ratio`` × the median duration
                 (Sawtooth's default screen is in the same range, 30–50 %),
                 and only when a duration was actually recorded (> 0 s)
* straight-liner — chose the SAME on-screen position in every answered task
                 (the position actually DISPLAYED when the response records it —
                 the survey shuffles alternatives per respondent since 2026-11 —
                 else the position in the design),
                 with at least ``min_tasks_straightline`` tasks (with 3
                 alternatives and 8 tasks a random respondent does this with
                 probability 3·(1/3)^8 ≈ 0.05 %, so it is a strong signal)
* duplicate    — the same ``respondent_id`` or the same non-empty e-mail
                 submitted more than once (each submission is otherwise
                 treated as a separate person by every estimator)
* possible duplicate — identical choice sequence AND identical demographics
                 AND submitted within ``duplicate_window_sec`` of each other (a
                 double-click / resubmit leaves exactly this trace). Without the
                 time window, respondents with strong shared preferences and few
                 demographic fields collide by chance: on a synthetic 300-person
                 study with gender only, 46 (15 %) were false positives.
"""
from __future__ import annotations

from statistics import median
from typing import Any, Dict, List, Optional


def _usable(cs: Dict, choice: Dict) -> bool:
    profiles = cs.get("profiles", []) or []
    sel = choice.get("selected_profile_id")
    return len(profiles) >= 2 and sum(1 for p in profiles if p.get("id") == sel) == 1


def displayed_profile_ids(cs: Dict, choice: Dict) -> Optional[List[str]]:
    """The on-screen order of the alternatives as recorded by the survey page
    (`display_profile_ids`), or None when absent or not a permutation of the
    design's profile ids (the item is stored verbatim from a public endpoint,
    so it is validated here, never trusted)."""
    ids = choice.get("display_profile_ids")
    if not isinstance(ids, list) or not ids or not all(isinstance(x, str) for x in ids):
        return None
    design = [p.get("id") for p in cs.get("profiles", []) or []]
    if len(ids) != len(design) or len(set(ids)) != len(ids) or set(ids) != set(design):
        return None
    return ids


def displayed_task_index(choice: Dict) -> Optional[int]:
    """1-based position of the task as shown to this respondent, or None."""
    v = choice.get("display_task_index")
    if isinstance(v, bool) or not isinstance(v, int) or v < 1:
        return None
    return v


def selected_position(cs: Dict, choice: Dict) -> Optional[int]:
    """0-based position of the chosen alternative: displayed if recorded, else design."""
    sel = choice.get("selected_profile_id")
    shown = displayed_profile_ids(cs, choice)
    order = shown if shown is not None else [p.get("id") for p in cs.get("profiles", []) or []]
    try:
        return order.index(sel)
    except ValueError:
        return None


def randomization_summary(study: Dict, responses: List[Dict]) -> Dict[str, Any]:
    """Was task order / alternative position randomised for these respondents?

    A response counts as randomised when at least one of its items carries a
    valid recorded display order (the survey page writes it on every item since
    the 2026-11 change; older responses have none). ``status``:
    ``randomised`` (all), ``not_randomised`` (none), ``mixed``, ``no_responses``.
    ``order_varies`` / ``positions_vary`` say whether the recorded orders really
    differ from the design order (evidence, not an assumption).
    """
    cs_map = {cs["id"]: cs for cs in study.get("choice_sets", []) or []}
    design_task_order = {cid: i + 1 for i, cid in enumerate(cs_map)}
    n_with = 0
    order_varies = positions_vary = False
    for r in responses:
        has = False
        for ch in r.get("responses", []) or []:
            cs = cs_map.get(ch.get("choice_set_id"))
            if not cs:
                continue
            shown = displayed_profile_ids(cs, ch)
            t = displayed_task_index(ch)
            if shown is not None:
                has = True
                if shown != [p.get("id") for p in cs.get("profiles", []) or []]:
                    positions_vary = True
            if t is not None:
                has = True
                if t != design_task_order.get(ch.get("choice_set_id")):
                    order_varies = True
        n_with += 1 if has else 0
    n = len(responses)
    if n == 0:
        status = "no_responses"
    elif n_with == n:
        status = "randomised"
    elif n_with == 0:
        status = "not_randomised"
    else:
        status = "mixed"
    return {"status": status, "n_responses": n, "n_with_display_order": n_with,
            "n_without_display_order": n - n_with,
            "order_varies": order_varies, "positions_vary": positions_vary}


def _epoch(v) -> Any:
    from datetime import datetime, timezone
    if v is None:
        return None
    try:
        if isinstance(v, str):
            v = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=timezone.utc)
            return v.timestamp()
    except (ValueError, TypeError):
        return None
    return None


def data_quality_report(study: Dict, responses: List[Dict], *,
                        speeder_ratio: float = 0.4,
                        min_tasks_straightline: int = 6,
                        duplicate_window_sec: float = 600.0) -> Dict[str, Any]:
    cs_map = {cs["id"]: cs for cs in study.get("choice_sets", []) or []}
    n_tasks_design = len(cs_map)

    per = []
    for idx, r in enumerate(responses):
        answered, usable, positions = 0, 0, []
        for ch in r.get("responses", []) or []:
            cs = cs_map.get(ch.get("choice_set_id"))
            if not cs:
                continue
            answered += 1
            if _usable(cs, ch):
                usable += 1
                pos = selected_position(cs, ch)
                if pos is not None:
                    positions.append(pos)
        dur = r.get("duration_sec")
        try:
            dur = int(dur) if dur is not None else 0
        except (TypeError, ValueError):
            dur = 0
        per.append({
            "respondent_index": idx,
            "respondent_id": r.get("respondent_id"),
            "response_id": r.get("id"),
            "tasks_answered": answered,
            "tasks_usable": usable,
            "duration_sec": dur,
            "positions": positions,
            "email": (r.get("respondent_email") or "").strip().lower(),
            "pattern": tuple((ch.get("choice_set_id"), ch.get("selected_profile_id"))
                             for ch in (r.get("responses") or [])),
            "demo": tuple(sorted((str(k), str(v)) for k, v in (r.get("demographics") or {}).items())),
            "ts": _epoch(r.get("submitted_at")),
        })

    durations = [p["duration_sec"] for p in per if p["duration_sec"] > 0]
    med = float(median(durations)) if durations else None
    speed_cut = (med * speeder_ratio) if med else None

    id_counts, email_counts, pattern_counts = {}, {}, {}
    for p in per:
        if p["respondent_id"]:
            id_counts[p["respondent_id"]] = id_counts.get(p["respondent_id"], 0) + 1
        if p["email"]:
            email_counts[p["email"]] = email_counts.get(p["email"], 0) + 1
        if p["pattern"] and p["ts"] is not None:
            key = (p["pattern"], p["demo"])
            pattern_counts.setdefault(key, []).append(p["ts"])

    flagged = []
    counts = {"speeder": 0, "straightliner": 0, "duplicate_id": 0, "duplicate_email": 0,
              "possible_duplicate": 0, "incomplete": 0, "no_usable_task": 0}
    for p in per:
        flags = []
        if speed_cut is not None and 0 < p["duration_sec"] < speed_cut:
            flags.append("speeder")
        if (len(p["positions"]) >= min_tasks_straightline
                and len(set(p["positions"])) == 1):
            flags.append("straightliner")
        if p["respondent_id"] and id_counts.get(p["respondent_id"], 0) > 1:
            flags.append("duplicate_id")
        if p["email"] and email_counts.get(p["email"], 0) > 1:
            flags.append("duplicate_email")
        if p["pattern"] and p["ts"] is not None:
            others = list(pattern_counts.get((p["pattern"], p["demo"]), []))
            others.remove(p["ts"])
            if any(abs(p["ts"] - t) <= duplicate_window_sec for t in others):
                flags.append("possible_duplicate")
        if n_tasks_design and p["tasks_answered"] < n_tasks_design:
            flags.append("incomplete")
        if p["tasks_usable"] == 0:
            flags.append("no_usable_task")
        for f in flags:
            counts[f] += 1
        if flags:
            flagged.append({
                "respondent_index": p["respondent_index"],
                "respondent_id": p["respondent_id"],
                "response_id": p["response_id"],
                "duration_sec": p["duration_sec"],
                "tasks_answered": p["tasks_answered"],
                "tasks_usable": p["tasks_usable"],
                "flags": flags,
            })

    n = len(per)
    any_flag = len(flagged)
    notes = [
        "รายงานนี้ไม่ได้ตัดผู้ตอบออกจากการวิเคราะห์โดยอัตโนมัติ — ผลทุกวิธีในระบบยังใช้ผู้ตอบทั้งหมด "
        "หากตัดสินใจตัดผู้ตอบที่ถูกทำเครื่องหมาย ให้ระบุเกณฑ์และจำนวนที่ตัดในบทที่ 3",
        "ผู้ตอบที่ส่งซ้ำ (respondent_id หรืออีเมลเดียวกัน) ถูกนับเป็นคนละคนในทุกแบบจำลอง "
        "ทำให้ขนาดตัวอย่างและความแม่นยำดูดีเกินจริง",
    ]
    if med is None:
        notes.append("ไม่มีข้อมูลเวลาที่ใช้ทำแบบสอบถาม (duration_sec) จึงตรวจ speeder ไม่ได้")
    return {
        "n_responses": n,
        "n_tasks_in_design": n_tasks_design,
        "median_duration_sec": med,
        "thresholds": {
            "speeder_seconds": round(speed_cut, 1) if speed_cut else None,
            "speeder_ratio_of_median": speeder_ratio,
            "straightline_min_tasks": min_tasks_straightline,
            "possible_duplicate_window_sec": duplicate_window_sec,
        },
        "counts": counts,
        "n_flagged": any_flag,
        "share_flagged": round(any_flag / n, 4) if n else 0.0,
        "flagged": flagged,
        "notes_th": notes,
    }


def flags_by_index(report: Dict[str, Any]) -> Dict[int, List[str]]:
    return {f["respondent_index"]: f["flags"] for f in report.get("flagged", [])}
