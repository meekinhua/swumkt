"""Respondent data-quality checks for choice-based conjoint (2026-11 audit).

Pure functions — no DB. Nothing here changes the estimation sample; the report
tells the researcher which respondents look suspicious so they can decide
(and disclose) whether to exclude them. Thresholds follow common CBC practice:

* speeder      — total duration below ``speeder_ratio`` × the median duration
                 (Sawtooth's default screen is in the same range, 30–50 %),
                 and only when a duration was actually recorded (> 0 s)
* straight-liner — chose the SAME on-screen position in every answered task,
                 with at least ``min_tasks_straightline`` tasks (with 3
                 alternatives and 8 tasks a random respondent does this with
                 probability 3·(1/3)^8 ≈ 0.05 %, so it is a strong signal)
* duplicate    — the same ``respondent_id`` or the same non-empty e-mail
                 submitted more than once (each submission is otherwise
                 treated as a separate person by every estimator)
* possible duplicate — identical choice sequence AND identical demographics
                 (a double-click / resubmit leaves exactly this trace)
"""
from __future__ import annotations

from statistics import median
from typing import Any, Dict, List


def _usable(cs: Dict, choice: Dict) -> bool:
    profiles = cs.get("profiles", []) or []
    sel = choice.get("selected_profile_id")
    return len(profiles) >= 2 and sum(1 for p in profiles if p.get("id") == sel) == 1


def data_quality_report(study: Dict, responses: List[Dict], *,
                        speeder_ratio: float = 0.4,
                        min_tasks_straightline: int = 6) -> Dict[str, Any]:
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
                pos = next(i for i, p in enumerate(cs["profiles"]) if p.get("id") == ch.get("selected_profile_id"))
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
        if p["pattern"]:
            key = (p["pattern"], p["demo"])
            pattern_counts[key] = pattern_counts.get(key, 0) + 1

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
        if p["pattern"] and pattern_counts.get((p["pattern"], p["demo"]), 0) > 1:
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
        },
        "counts": counts,
        "n_flagged": any_flag,
        "share_flagged": round(any_flag / n, 4) if n else 0.0,
        "flagged": flagged,
        "notes_th": notes,
    }


def flags_by_index(report: Dict[str, Any]) -> Dict[int, List[str]]:
    return {f["respondent_index"]: f["flags"] for f in report.get("flagged", [])}
