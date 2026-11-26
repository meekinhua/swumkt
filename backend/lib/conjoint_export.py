"""Long-format (one row per alternative) export of choice-based conjoint data.

The previous export shipped each respondent's choices as a JSON string in one
CSV cell, which no statistics package can estimate from. This module produces
the standard stacked layout used by R (`survival::clogit`, `mlogit`,
`apollo`), Stata (`clogit`, `cmclogit`) and Sawtooth/Lighthouse imports:

    respondent_id · situation_id · task · alt · chosen · <attribute columns>

plus a codebook and a README that documents the coding the platform's own
estimators use (dummy coding, reference = last declared level that was shown).
"""
from __future__ import annotations

import csv
import io
from typing import Any, Dict, List, Optional, Tuple

from lib.conjoint_quality import data_quality_report, flags_by_index

DEMO_FIELDS_ORDER = ["age", "gender", "occupation", "education", "region", "income"]


def _safe_col(name: str) -> str:
    return (name or "").strip()


def build_long_table(study: Dict, responses: List[Dict],
                     quality: Optional[Dict] = None) -> Tuple[List[str], List[List[Any]]]:
    attrs = study.get("attributes", []) or []
    cs_list = study.get("choice_sets", []) or []
    cs_map = {cs["id"]: cs for cs in cs_list}
    level_info = {}  # (attr_id, level_id) -> (code, label)
    for a in attrs:
        for j, lvl in enumerate(a.get("levels", []) or [], start=1):
            level_info[(a["id"], lvl["id"])] = (j, lvl.get("value"))

    demo_keys = list(study.get("demographics_to_capture") or [])
    for r in responses:
        for k in (r.get("demographics") or {}).keys():
            if k not in demo_keys:
                demo_keys.append(k)
    demo_keys.sort(key=lambda k: (DEMO_FIELDS_ORDER.index(k) if k in DEMO_FIELDS_ORDER else 99, k))

    quality = quality or data_quality_report(study, responses)
    flags = flags_by_index(quality)

    header = ["respondent_id", "respondent_index", "response_id", "submitted_at", "duration_sec",
              "situation_id", "task", "choice_set_id", "alt", "profile_id", "chosen", "usable"]
    for a in attrs:
        nm = _safe_col(a.get("name"))
        header += [nm, f"{nm}__code"]
    header += [f"demo_{k}" for k in demo_keys]
    header += ["flag_speeder", "flag_straightliner", "flag_duplicate", "flags"]

    rows: List[List[Any]] = []
    for idx, r in enumerate(responses):
        rflags = flags.get(idx, [])
        submitted = r.get("submitted_at")
        submitted = submitted.isoformat() if hasattr(submitted, "isoformat") else (submitted or "")
        for ch in r.get("responses", []) or []:
            cs = cs_map.get(ch.get("choice_set_id"))
            if not cs:
                continue
            profiles = cs.get("profiles", []) or []
            sel = ch.get("selected_profile_id")
            usable = int(len(profiles) >= 2 and sum(1 for p in profiles if p.get("id") == sel) == 1)
            task = cs.get("set_number") or (cs_list.index(cs) + 1)
            situation = idx * 1000 + int(task)
            for alt_i, prof in enumerate(profiles, start=1):
                row = [r.get("respondent_id") or f"resp{idx + 1}", idx + 1, r.get("id") or "",
                       submitted, r.get("duration_sec") or 0, situation, task, cs["id"], alt_i,
                       prof.get("id"), int(prof.get("id") == sel), usable]
                for a in attrs:
                    lid = (prof.get("attribute_levels") or {}).get(a["id"])
                    code, label = level_info.get((a["id"], lid), (None, None))
                    if lid is None:
                        label = "(ไม่ได้แสดง — เพิ่มคุณลักษณะหลังออกแบบ)"
                    elif code is None:
                        label = f"(ระดับที่ถูกลบภายหลัง {str(lid)[:8]})"
                    row += [label, code if code is not None else ""]
                demo = r.get("demographics") or {}
                row += [demo.get(k, "") for k in demo_keys]
                row += [int("speeder" in rflags), int("straightliner" in rflags),
                        int(any(f in rflags for f in ("duplicate_id", "duplicate_email", "possible_duplicate"))),
                        ";".join(rflags)]
                rows.append(row)
    return header, rows


def build_codebook(study: Dict) -> List[List[Any]]:
    """variable · code · label · role/reference note."""
    out = [["variable", "code", "label", "note"]]
    fixed = [
        ("respondent_id", "", "รหัสผู้ตอบ (ใช้เป็น panel / cluster id)", "string"),
        ("respondent_index", "", "ลำดับผู้ตอบตามที่ระบบอ่าน (ระบบใช้ค่านี้เป็นตัวระบุผู้ตอบในการประมาณค่า)", "integer"),
        ("situation_id", "", "รหัสสถานการณ์การเลือก = respondent_index×1000 + task (ใช้เป็น group ใน clogit)", "integer"),
        ("task", "", "ลำดับชุดคำถาม (choice task) ตามการออกแบบ", "integer"),
        ("alt", "", "ตำแหน่งของทางเลือกบนหน้าจอ (1 = ซ้ายสุด/บนสุด)", "integer"),
        ("chosen", "0/1", "1 = ทางเลือกที่ถูกเลือก", "dependent variable"),
        ("usable", "0/1", "1 = สถานการณ์นี้มีการเลือกที่ถูกต้องหนึ่งทางเลือกพอดี (ระบบใช้เฉพาะ usable = 1)", "filter"),
        ("duration_sec", "", "เวลาที่ใช้ทำแบบสอบถามทั้งชุด (วินาที; 0 = ไม่ได้บันทึก)", "integer"),
        ("flag_speeder / flag_straightliner / flag_duplicate", "0/1",
         "ธงคุณภาพข้อมูล (ดูชีต README) — ระบบไม่ได้ตัดออกจากการวิเคราะห์", "quality"),
    ]
    for v, c, l, n in fixed:
        out.append([v, c, l, n])
    for a in study.get("attributes", []) or []:
        levels = a.get("levels", []) or []
        for j, lvl in enumerate(levels, start=1):
            note = "reference level ในแบบจำลองของระบบ (ถ้าระดับนี้ถูกแสดงจริง)" if j == len(levels) else ""
            out.append([f"{a.get('name')}__code", j, lvl.get("value"), note])
    return out


README_TH = """ข้อมูล Choice-Based Conjoint แบบ long format (หนึ่งแถว = หนึ่งทางเลือกในหนึ่งชุดคำถามของผู้ตอบหนึ่งคน)

โครงสร้าง
- ชีต data_long: ข้อมูลสำหรับประมาณค่าใหม่ในโปรแกรมอื่น
- ชีต codebook: ความหมายของตัวแปรและรหัสระดับ (level code) ของทุกคุณลักษณะ
- ชีต design: แผนการทดลอง (ชุดคำถาม × ทางเลือก × ระดับ) ที่ผู้ตอบทุกคนเห็น
- ชีต data_quality: ผู้ตอบที่ถูกทำเครื่องหมาย (speeder / straight-liner / ส่งซ้ำ / ตอบไม่ครบ)

การเข้ารหัสที่ระบบใช้ (เพื่อให้ผลตรงกับหน้า Results)
- Dummy coding, reference level = ระดับสุดท้ายที่ประกาศไว้และถูกแสดงจริง (utility ของ reference = 0)
- ใช้เฉพาะแถว usable = 1; ผู้ตอบแต่ละรายการถูกนับเป็นคนละคน (ดูธง flag_duplicate)
- MNL = conditional logit จัดกลุ่มตาม situation_id; BIC ใช้ n = จำนวน situation
- ไม่มีทางเลือก "ไม่เลือก" (none option) ในแบบสอบถามนี้

ตัวอย่างคำสั่ง
R:     library(survival); d <- subset(read.csv("data.csv"), usable == 1)
       clogit(chosen ~ factor(<คุณลักษณะ>__code) + ... + strata(situation_id), data = d, cluster = respondent_id)
Stata: keep if usable == 1
       clogit chosen ib(last).<คุณลักษณะ>__code ..., group(situation_id) vce(cluster respondent_id)
Python: statsmodels ConditionalLogit(d.chosen, X, groups=d.situation_id)

หมายเหตุ: ค่าที่ได้จาก clogit แบบ cluster-robust SE จะมี SE ต่างจากหน้า Results เล็กน้อย
(หน้า Results ใช้ SE แบบ model-based ของ conditional logit)
"""


def build_design_sheet(study: Dict) -> List[List[Any]]:
    attrs = study.get("attributes", []) or []
    names = {a["id"]: {l["id"]: l.get("value") for l in a.get("levels", []) or []} for a in attrs}
    out = [["task", "alt", "profile_id"] + [a.get("name") for a in attrs]]
    for i, cs in enumerate(study.get("choice_sets", []) or [], start=1):
        for j, p in enumerate(cs.get("profiles", []) or [], start=1):
            al = p.get("attribute_levels") or {}
            out.append([cs.get("set_number") or i, j, p.get("id")]
                       + [names.get(a["id"], {}).get(al.get(a["id"]), "") for a in attrs])
    return out


def export_csv(study: Dict, responses: List[Dict]) -> str:
    header, rows = build_long_table(study, responses)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return "﻿" + buf.getvalue()


def export_xlsx(study: Dict, responses: List[Dict]) -> bytes:
    from openpyxl import Workbook

    quality = data_quality_report(study, responses)
    header, rows = build_long_table(study, responses, quality)
    wb = Workbook()
    ws = wb.active
    ws.title = "README"
    ws.append([f"การศึกษา: {study.get('title', '')}"])
    ws.append([f"จำนวนผู้ตอบ (รายการที่ส่ง): {len(responses)}"])
    for line in README_TH.splitlines():
        ws.append([line])
    ws.column_dimensions["A"].width = 120

    ws = wb.create_sheet("data_long")
    ws.append(header)
    for r in rows:
        ws.append(r)
    ws.freeze_panes = "A2"

    ws = wb.create_sheet("codebook")
    for r in build_codebook(study):
        ws.append(r)

    ws = wb.create_sheet("design")
    for r in build_design_sheet(study):
        ws.append(r)

    ws = wb.create_sheet("data_quality")
    ws.append(["median_duration_sec", quality.get("median_duration_sec")])
    ws.append(["speeder_threshold_sec", quality["thresholds"].get("speeder_seconds")])
    ws.append([])
    ws.append(["respondent_index", "respondent_id", "duration_sec", "tasks_answered", "tasks_usable", "flags"])
    for f in quality.get("flagged", []):
        ws.append([f["respondent_index"] + 1, f["respondent_id"], f["duration_sec"],
                   f["tasks_answered"], f["tasks_usable"], ";".join(f["flags"])])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
