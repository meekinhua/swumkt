"""Shared JSON extraction, schema validation, auto-repair prompts, and
normalization helpers for Bring-Your-Own-AI (External AI Copy/Paste) workflows
across Brand Equity and Conjoint Analysis.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

START_MARKER = "<<<SWUMKT_JSON_START>>>"
END_MARKER = "<<<SWUMKT_JSON_END>>>"

_HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def _replace_smart_quotes(text: str) -> str:
    return (
        text.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )


def _strip_js_comments_outside_strings(text: str) -> str:
    """Remove // single-line comments and /* ... */ comments outside JSON strings."""
    out: List[str] = []
    i = 0
    n = len(text)
    in_str = False
    escaped = False
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
            continue

        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue

        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            # skip to newline
            nl = text.find("\n", i + 2)
            i = n if nl == -1 else nl
            continue

        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            i = n if end == -1 else end + 2
            continue

        out.append(ch)
        i += 1
    return "".join(out)


def _remove_trailing_commas(text: str) -> str:
    """Strip trailing commas before `}` or `]` outside JSON strings."""
    out: List[str] = []
    i = 0
    n = len(text)
    in_str = False
    escaped = False
    while i < n:
        ch = text[i]
        if in_str:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_str = False
            i += 1
            continue

        if ch == '"':
            in_str = True
            out.append(ch)
            i += 1
            continue

        if ch == ",":
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in ("}", "]"):
                i += 1
                continue

        out.append(ch)
        i += 1
    return "".join(out)


def _extract_balanced_json_slice(text: str) -> Optional[str]:
    """Find the first balanced `{...}` or `[...]` slice in text."""
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        if start == -1:
            continue
        depth = 0
        in_str = False
        escaped = False
        for i in range(start, len(text)):
            ch = text[i]
            if in_str:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == opener:
                depth += 1
            elif ch == closer:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
    return None


def extract_json_payload(raw_text: str) -> Tuple[Any, Optional[str], List[str]]:
    """Extract and parse JSON from external AI text with safe syntax repair.

    Returns (parsed_obj, error_message_th_or_None, warnings).
    """
    warnings: List[str] = []
    if not raw_text or not str(raw_text).strip():
        return None, "ยังไม่ได้วางคำตอบจาก AI", warnings

    text = str(raw_text).lstrip("\ufeff").strip()
    candidate = text

    if START_MARKER in text and END_MARKER in text:
        s_idx = text.find(START_MARKER) + len(START_MARKER)
        e_idx = text.find(END_MARKER, s_idx)
        if e_idx > s_idx:
            candidate = text[s_idx:e_idx].strip()
    elif "```" in text:
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
        if fence_match:
            candidate = fence_match.group(1).strip()

    # Strip accidental code fences inside START/END markers too
    if candidate.startswith("```"):
        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", candidate, re.IGNORECASE)
        if fence_match:
            candidate = fence_match.group(1).strip()

    try:
        return json.loads(candidate), None, warnings
    except Exception:
        pass

    sliced = _extract_balanced_json_slice(candidate) or _extract_balanced_json_slice(text)
    if sliced:
        try:
            return json.loads(sliced), None, warnings
        except Exception:
            candidate = sliced

    # Attempt safe syntax repair
    repaired = _replace_smart_quotes(candidate)
    repaired = _strip_js_comments_outside_strings(repaired)
    repaired = _remove_trailing_commas(repaired).strip()

    try:
        parsed = json.loads(repaired)
        warnings.append("ระบบแก้ไขรูปแบบ JSON เล็กน้อยให้อัตโนมัติ (เช่น Smart quotes / Trailing comma)")
        return parsed, None, warnings
    except Exception as exc:
        err = (
            f"ไม่สามารถอ่าน JSON จากคำตอบที่วางได้ ({exc}) — "
            f"กรุณาคัดลอกคำตอบทั้งหมดที่มี {START_MARKER} ... {END_MARKER} หรือกด 'คัดลอก Prompt สั่ง AI แก้ให้ถูกต้อง'"
        )
        return None, err, warnings


def build_repair_prompt(
    schema_version: str,
    errors: List[str],
    expected_schema_hint: str,
    raw_snippet: str = "",
) -> str:
    snippet = (raw_snippet or "").strip()
    if len(snippet) > 900:
        snippet = snippet[:900] + "\n...(truncated)"
    err_lines = "\n".join(f"- {e}" for e in errors)
    return (
        f"คำตอบก่อนหน้าของคุณยังไม่ตรงตามรูปแบบ `{schema_version}` ของระบบ SWUMKT และพบข้อผิดพลาดดังนี้:\n"
        f"{err_lines}\n\n"
        f"กรุณาแก้ไขและตอบกลับใหม่ **เฉพาะ JSON ที่ถูกต้องเท่านั้น** โดยครอบด้วย {START_MARKER} และ {END_MARKER} "
        f"(ห้ามใส่ข้อความอธิบายเพิ่มเติม ห้ามใช้เครื่องหมายคำพูดโค้ง และห้ามมี trailing comma):\n\n"
        f"{START_MARKER}\n{expected_schema_hint}\n{END_MARKER}\n\n"
        + (f"คำตอบเดิมที่ต้องแก้:\n{snippet}" if snippet else "")
    ).strip()


def _normalize_hex(val: Any) -> Optional[str]:
    if not isinstance(val, str):
        return None
    s = val.strip()
    if not s:
        return None
    if not s.startswith("#"):
        s = "#" + s
    if not _HEX_RE.match(s):
        return None
    if len(s) == 4:
        s = "#" + "".join(ch * 2 for ch in s[1:])
    return s.upper()


# ============ 1. BRAND EQUITY IDENTITY EXTRACT ============

_BE_IDENTITY_SCHEMA_HINT = """{
  "derived_traits": ["Modern", "Artisanal", "Warm"],
  "visual_palette": ["#0E5538", "#F4EFE6", "#C8102E"],
  "visual_keywords": ["minimalist", "earthy", "specialty"],
  "design_style": "Clean Editorial",
  "archetype": "Creator",
  "summary": "สรุปแก่นแบรนด์ 2-3 ประโยคภาษาไทย"
}"""


def validate_be_identity_payload(raw_text: str) -> dict:
    parsed, parse_err, warnings = extract_json_payload(raw_text)
    if parse_err:
        return {
            "valid": False,
            "errors": [parse_err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_identity_v1", [parse_err], _BE_IDENTITY_SCHEMA_HINT, raw_text),
        }
    if not isinstance(parsed, dict):
        err = "ข้อมูลต้องเป็น JSON Object {...} ที่มี derived_traits และ summary"
        return {
            "valid": False,
            "errors": [err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_identity_v1", [err], _BE_IDENTITY_SCHEMA_HINT, raw_text),
        }

    errors: List[str] = []
    raw_traits = parsed.get("derived_traits") or parsed.get("traits") or []
    traits: List[str] = []
    if isinstance(raw_traits, list):
        seen = set()
        for t in raw_traits:
            ts = str(t or "").strip()
            if ts and ts.lower() not in seen:
                seen.add(ts.lower())
                traits.append(ts)
        traits = traits[:12]
    if not traits:
        errors.append("ต้องมี 'derived_traits' อย่างน้อย 1 คำ (เช่น [\"Modern\", \"Warm\"])")

    summary = str(parsed.get("summary") or parsed.get("ai_summary") or "").strip()
    if not summary:
        errors.append("ต้องมี 'summary' อธิบายตัวตน/แก่นของแบรนด์")

    raw_palette = parsed.get("visual_palette") or parsed.get("palette") or []
    palette: List[str] = []
    if isinstance(raw_palette, list):
        for p in raw_palette:
            nh = _normalize_hex(p)
            if nh:
                if nh not in palette:
                    palette.append(nh)
            elif str(p or "").strip():
                warnings.append(f"ข้ามรหัสสีที่ไม่ใช่ hex: {p}")

    raw_kw = parsed.get("visual_keywords") or parsed.get("keywords") or []
    keywords = [str(k).strip() for k in raw_kw if str(k or "").strip()][:12] if isinstance(raw_kw, list) else []

    data = {
        "derived_traits": traits,
        "visual_palette": palette[:8],
        "visual_keywords": keywords,
        "design_style": str(parsed.get("design_style") or "").strip(),
        "archetype": str(parsed.get("archetype") or "").strip(),
        "summary": summary,
    }

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_identity_v1", errors, _BE_IDENTITY_SCHEMA_HINT, raw_text),
        }

    preview = {
        "trait_count": len(data["derived_traits"]),
        "palette_count": len(data["visual_palette"]),
        "archetype": data["archetype"] or "-",
        "summary": data["summary"],
        "derived_traits": data["derived_traits"],
        "visual_palette": data["visual_palette"],
    }
    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "data": data,
        "preview": preview,
        "repair_prompt": None,
    }


# ============ 2. BRAND EQUITY FULL ANALYSIS & POSITIONING ============

_BE_ANALYSIS_SCHEMA_HINT = """{
  "schema_version": "be_analysis_v1",
  "normalized_by_question": {
    "AW-1--self": {
      "clusters": [
        {"canonical": "BrandName", "variants": ["brandname", "ชื่อไทย"], "count": 5}
      ]
    }
  },
  "themes_by_question": {
    "PQ-6--self": [
      {"name": "ชื่อ Theme", "description": "คำอธิบาย 1 ประโยค", "count": 4, "sample_quotes": ["..."], "sentiment": 0.6}
    ]
  },
  "identity_image": {
    "perceived_traits": [{"trait": "Modern", "count": 6, "sentiment": 0.7}],
    "aligned": ["Modern"],
    "lost": ["Artisanal"],
    "unintended": ["Expensive"],
    "alignment_score_0_100": 68,
    "narrative": "สรุปช่องว่าง Identity vs Image 2 ประโยค"
  },
  "master_insights": [
    {
      "headline": "หัวข้อ insight 1 บรรทัด",
      "evidence": "หลักฐานพร้อมตัวเลขจากผลสำรวจและ qid",
      "recommendation": "แนวทางปฏิบัติที่ทำได้จริง",
      "priority": "high"
    }
  ],
  "positioning_analysis": {
    "summary": "สรุปตำแหน่งแบรนด์เทียบคู่แข่งบนตลาด",
    "recommended_axes": {"x": "High-quality", "y": "Premium", "reason": "สองแกนนี้แยกแบรนด์กับคู่แข่งชัดที่สุด"},
    "white_space": "ช่องว่างทางการตลาดที่ยังไม่มีคู่แข่งครอง",
    "competitor_positions": [
      {"brand": "BrandA", "position_label": "Premium Leader", "strength": "ภาพลักษณ์หรู", "weakness": "ราคาสูง"}
    ]
  }
}"""


def validate_be_analysis_payload(raw_text: str, study: dict, responses: List[dict], agg: dict) -> dict:
    parsed, parse_err, warnings = extract_json_payload(raw_text)
    if parse_err:
        return {
            "valid": False,
            "errors": [parse_err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_analysis_v1", [parse_err], _BE_ANALYSIS_SCHEMA_HINT, raw_text),
        }
    if not isinstance(parsed, dict):
        err = "คำตอบจาก AI ต้องเป็น JSON Object {...} ตามโครงสร้าง be_analysis_v1"
        return {
            "valid": False,
            "errors": [err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_analysis_v1", [err], _BE_ANALYSIS_SCHEMA_HINT, raw_text),
        }

    errors: List[str] = []
    questions = study.get("questions") or []
    q_by_id = {q.get("id"): q for q in questions if q.get("id")}
    agg_q_by_id = {q.get("id"): q for q in (agg.get("questions") or []) if q.get("id")}

    # 1) normalized_by_question
    norm_out: Dict[str, dict] = {}
    raw_norm = parsed.get("normalized_by_question")
    if raw_norm is not None:
        if not isinstance(raw_norm, dict):
            errors.append("'normalized_by_question' ต้องเป็น Object { question_id: { clusters: [...] } }")
        else:
            for qid, val in raw_norm.items():
                q = q_by_id.get(qid)
                if not q:
                    warnings.append(f"ข้าม normalized_by_question['{qid}'] เนื่องจากไม่ตรงกับรหัสคำถามใน study")
                    continue
                if q.get("ai_processing") not in ("extract_brand", "extract_brands", "word_cloud"):
                    warnings.append(f"คำถาม '{qid}' ไม่ใช่คำถามปลายเปิดสำหรับ normalize — ข้ามอัตโนมัติ")
                    continue
                clusters = val.get("clusters") if isinstance(val, dict) else (val.get("counts") if isinstance(val, dict) else val)
                if isinstance(val, dict) and val.get("counts") and not val.get("clusters"):
                    clusters = val.get("counts")
                if not isinstance(clusters, list):
                    errors.append(f"normalized_by_question['{qid}'] ต้องมีรายการ clusters/counts")
                    continue
                # True respondent base from aggregated question stats or response count
                agg_n = ((agg_q_by_id.get(qid) or {}).get("stats") or {}).get("n")
                total_base = int(agg_n) if isinstance(agg_n, (int, float)) and agg_n > 0 else max(1, len(responses))
                cleaned_counts = []
                for c in clusters[:15]:
                    if not isinstance(c, dict):
                        continue
                    label = str(c.get("canonical") or c.get("label") or "").strip()
                    if not label:
                        continue
                    try:
                        cnt = max(0, int(c.get("count", 0)))
                    except Exception:
                        cnt = 0
                    variants_raw = c.get("variants") or []
                    variants = [str(v).strip() for v in variants_raw if str(v or "").strip()] if isinstance(variants_raw, list) else []
                    cleaned_counts.append({
                        "label": label,
                        "count": cnt,
                        "pct": round(cnt / total_base * 100, 1) if total_base else 0.0,
                        "variants": variants,
                    })
                cleaned_counts.sort(key=lambda x: x["count"], reverse=True)
                if cleaned_counts:
                    norm_out[qid] = {"counts": cleaned_counts, "total": total_base}

    # 2) themes_by_question
    themes_out: Dict[str, List[dict]] = {}
    raw_themes = parsed.get("themes_by_question")
    if raw_themes is not None:
        if not isinstance(raw_themes, dict):
            errors.append("'themes_by_question' ต้องเป็น Object { question_id: [ ... ] }")
        else:
            for qid, items in raw_themes.items():
                if qid not in q_by_id:
                    warnings.append(f"ข้าม themes_by_question['{qid}'] เนื่องจากไม่ตรงกับรหัสคำถามใน study")
                    continue
                if not isinstance(items, list):
                    errors.append(f"themes_by_question['{qid}'] ต้องเป็น Array ของ theme")
                    continue
                clean_themes = []
                for th in items[:10]:
                    if not isinstance(th, dict):
                        continue
                    name = str(th.get("name") or "").strip()
                    if not name:
                        continue
                    try:
                        cnt = max(0, int(th.get("count", 0)))
                    except Exception:
                        cnt = 0
                    try:
                        sent = float(th.get("sentiment", 0.0))
                        sent = max(-1.0, min(1.0, sent))
                    except Exception:
                        sent = 0.0
                    quotes = th.get("sample_quotes") or []
                    clean_quotes = [str(q_txt).strip() for q_txt in quotes if str(q_txt or "").strip()][:3] if isinstance(quotes, list) else []
                    clean_themes.append({
                        "name": name,
                        "description": str(th.get("description") or "").strip(),
                        "count": cnt,
                        "sample_quotes": clean_quotes,
                        "sentiment": round(sent, 2),
                    })
                themes_out[qid] = clean_themes

    # 3) identity_image
    ii_out: Dict[str, Any] = {}
    raw_ii = parsed.get("identity_image")
    if raw_ii is None:
        errors.append("ต้องมี 'identity_image' (aligned, lost, unintended, alignment_score_0_100, narrative)")
    elif not isinstance(raw_ii, dict):
        errors.append("'identity_image' ต้องเป็น Object {...}")
    else:
        raw_pt = raw_ii.get("perceived_traits") or []
        clean_pt = []
        if isinstance(raw_pt, list):
            for pt in raw_pt[:12]:
                if not isinstance(pt, dict):
                    continue
                tr = str(pt.get("trait") or "").strip()
                if not tr:
                    continue
                try:
                    cnt = max(0, int(pt.get("count", 0)))
                except Exception:
                    cnt = 0
                try:
                    sent = max(-1.0, min(1.0, float(pt.get("sentiment", 0.0))))
                except Exception:
                    sent = 0.0
                clean_pt.append({"trait": tr, "count": cnt, "sentiment": round(sent, 2)})

        raw_score = raw_ii.get("alignment_score_0_100")
        if raw_score is None:
            raw_score = raw_ii.get("alignment_score", 0)
        try:
            align_score = max(0, min(100, int(round(float(raw_score)))))
        except Exception:
            align_score = 0

        ii_out = {
            "perceived_traits": clean_pt,
            "aligned": [str(x).strip() for x in (raw_ii.get("aligned") or []) if str(x or "").strip()],
            "lost": [str(x).strip() for x in (raw_ii.get("lost") or []) if str(x or "").strip()],
            "unintended": [str(x).strip() for x in (raw_ii.get("unintended") or []) if str(x or "").strip()],
            "alignment_score_0_100": align_score,
            "narrative": str(raw_ii.get("narrative") or "").strip(),
        }

    # 4) master_insights
    insights_out: List[dict] = []
    raw_ins = parsed.get("master_insights")
    if not isinstance(raw_ins, list) or len(raw_ins) == 0:
        errors.append("ต้องมี 'master_insights' เป็น Array อย่างน้อย 1 ข้อ (แนะนำ 5 ข้อ)")
    else:
        for ins in raw_ins[:10]:
            if not isinstance(ins, dict):
                continue
            headline = str(ins.get("headline") or ins.get("title") or "").strip()
            evidence = str(ins.get("evidence") or "").strip()
            rec = str(ins.get("recommendation") or "").strip()
            if not headline or not (evidence or rec):
                continue
            prio = str(ins.get("priority") or "medium").strip().lower()
            if prio not in ("high", "medium", "low"):
                prio = "medium"
            insights_out.append({
                "headline": headline,
                "evidence": evidence,
                "recommendation": rec,
                "priority": prio,
            })
        if not insights_out:
            errors.append("'master_insights' ไม่มีข้อที่มี headline และ evidence/recommendation ครบถ้วน")

    # 5) positioning_analysis (competitive perceptual map narrative + recommended axes)
    radar_axes = (agg.get("image_radar") or {}).get("axes") or []
    axis_lookup = {ax.lower(): ax for ax in radar_axes}
    pos_out: Dict[str, Any] = {}
    raw_pos = parsed.get("positioning_analysis")
    competitors = (study.get("brand") or {}).get("competitors") or []
    if isinstance(raw_pos, dict) and raw_pos:
        rec_axes = raw_pos.get("recommended_axes") or {}
        clean_axes = None
        if isinstance(rec_axes, dict):
            rx = str(rec_axes.get("x") or "").strip()
            ry = str(rec_axes.get("y") or "").strip()
            reason = str(rec_axes.get("reason") or "").strip()
            if rx and ry:
                if axis_lookup:
                    mx = axis_lookup.get(rx.lower())
                    my = axis_lookup.get(ry.lower())
                    if not mx or not my:
                        warnings.append(
                            f"แกน Perceptual Map ที่ AI แนะนำ ({rx} × {ry}) ไม่ตรงกับแกนที่มีในชุดคำถาม ({', '.join(radar_axes)})"
                        )
                    elif mx == my:
                        warnings.append("แกน X และ Y ที่ AI แนะนำเป็นแกนเดียวกัน")
                    else:
                        clean_axes = {"x": mx, "y": my, "reason": reason}
                else:
                    clean_axes = {"x": rx, "y": ry, "reason": reason}
        comp_pos_list = []
        raw_cp = raw_pos.get("competitor_positions") or []
        if isinstance(raw_cp, list):
            for cp in raw_cp[:10]:
                if not isinstance(cp, dict):
                    continue
                bname = str(cp.get("brand") or "").strip()
                if not bname:
                    continue
                comp_pos_list.append({
                    "brand": bname,
                    "position_label": str(cp.get("position_label") or "").strip(),
                    "strength": str(cp.get("strength") or "").strip(),
                    "weakness": str(cp.get("weakness") or "").strip(),
                })
        pos_out = {
            "summary": str(raw_pos.get("summary") or "").strip(),
            "recommended_axes": clean_axes,
            "white_space": str(raw_pos.get("white_space") or "").strip(),
            "competitor_positions": comp_pos_list,
        }
    elif competitors and len(radar_axes) >= 2:
        warnings.append("ยังไม่มี 'positioning_analysis' สำหรับวิเคราะห์คู่แข่งบน Perceptual Map (นำเข้าส่วนอื่นได้ตามปกติ)")

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("be_analysis_v1", errors, _BE_ANALYSIS_SCHEMA_HINT, raw_text),
        }

    data = {
        "normalized_by_question": norm_out,
        "themes_by_question": themes_out,
        "identity_image": ii_out,
        "master_insights": insights_out,
        "positioning_analysis": pos_out,
    }
    preview = {
        "normalized_questions": len(norm_out),
        "theme_questions": len(themes_out),
        "alignment_score_0_100": ii_out.get("alignment_score_0_100", 0),
        "aligned_count": len(ii_out.get("aligned") or []),
        "insights_count": len(insights_out),
        "has_positioning": bool(pos_out),
        "recommended_axes": pos_out.get("recommended_axes"),
        "insights_headlines": [i["headline"] for i in insights_out],
    }
    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "data": data,
        "preview": preview,
        "repair_prompt": None,
    }


# ============ 3. CONJOINT QUALITATIVE EXTRACTION ============

_CONJOINT_QUAL_SCHEMA_HINT = """{
  "summary": "สรุปภาพรวมปัจจัยสำคัญที่ได้จากข้อมูลเชิงคุณภาพ 2-3 ประโยค",
  "attributes": [
    {
      "name": "ชื่อปัจจัย (เช่น ราคาต่อแก้ว)",
      "description": "คำอธิบายปัจจัยสั้นๆ",
      "rationale": "เหตุผลที่พบจากบทสัมภาษณ์",
      "levels": [
        {"value": "65 บาท", "description": "ราคาย่อมเยา"},
        {"value": "85 บาท", "description": "ราคามาตรฐาน"},
        {"value": "110 บาท", "description": "ระดับพรีเมียม"}
      ]
    }
  ]
}"""


def validate_conjoint_qualitative_payload(raw_text: str) -> dict:
    parsed, parse_err, warnings = extract_json_payload(raw_text)
    if parse_err:
        return {
            "valid": False,
            "errors": [parse_err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("conjoint_qual_v1", [parse_err], _CONJOINT_QUAL_SCHEMA_HINT, raw_text),
        }
    if not isinstance(parsed, dict):
        err = "คำตอบต้องเป็น JSON Object {...} ที่มี key 'attributes'"
        return {
            "valid": False,
            "errors": [err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("conjoint_qual_v1", [err], _CONJOINT_QUAL_SCHEMA_HINT, raw_text),
        }

    errors: List[str] = []
    raw_attrs = parsed.get("attributes") or []
    clean_attrs: List[dict] = []
    if not isinstance(raw_attrs, list):
        errors.append("'attributes' ต้องเป็น Array ของปัจจัย")
    else:
        for idx, a in enumerate(raw_attrs):
            if not isinstance(a, dict):
                continue
            name = str(a.get("name") or "").strip()
            if not name:
                errors.append(f"ปัจจัยลำดับที่ {idx + 1} ไม่มีชื่อ ('name')")
                continue
            raw_levels = a.get("levels") or []
            if not isinstance(raw_levels, list):
                errors.append(f"ปัจจัย '{name}' ต้องมี 'levels' เป็น Array")
                continue
            seen_lvl = set()
            clean_levels = []
            for lv in raw_levels:
                val = str(lv.get("value") if isinstance(lv, dict) else lv or "").strip()
                desc = str(lv.get("description") or "").strip() if isinstance(lv, dict) else ""
                if not val:
                    continue
                if val.lower() in seen_lvl:
                    warnings.append(f"ตัดระดับซ้ำ '{val}' ในปัจจัย '{name}' ออกอัตโนมัติ")
                    continue
                seen_lvl.add(val.lower())
                clean_levels.append({"value": val, "description": desc or None})
            if len(clean_levels) < 2:
                errors.append(f"ปัจจัย '{name}' ต้องมีระดับ (levels) ไม่ซ้ำอย่างน้อย 2 ระดับ")
                continue
            if len(clean_levels) > 5:
                warnings.append(f"ปัจจัย '{name}' มี {len(clean_levels)} ระดับ (> 5 อาจเกิด Number-of-Levels Effect)")
            clean_attrs.append({
                "name": name,
                "description": str(a.get("description") or "").strip() or None,
                "rationale": str(a.get("rationale") or "").strip() or None,
                "levels": clean_levels,
            })

    if len(clean_attrs) < 2:
        errors.append("Conjoint Analysis ต้องมีปัจจัย (attributes) ที่สมบูรณ์อย่างน้อย 2 ปัจจัย")
    elif len(clean_attrs) > 6:
        warnings.append(f"มีทั้งหมด {len(clean_attrs)} ปัจจัย (> 6 อาจทำให้ผู้ตอบแบบสอบถามล้า)")

    summary = str(parsed.get("summary") or parsed.get("recommendations") or "").strip()

    if errors:
        return {
            "valid": False,
            "errors": errors,
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("conjoint_qual_v1", errors, _CONJOINT_QUAL_SCHEMA_HINT, raw_text),
        }

    total_levels = sum(len(a["levels"]) for a in clean_attrs)
    data = {"summary": summary, "attributes": clean_attrs}
    preview = {
        "attribute_count": len(clean_attrs),
        "total_levels": total_levels,
        "attributes": [{"name": a["name"], "levels": [l["value"] for l in a["levels"]]} for a in clean_attrs],
        "summary": summary,
    }
    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "data": data,
        "preview": preview,
        "repair_prompt": None,
    }


# ============ 4. CONJOINT RESULTS INTERPRETATION ============

_CONJOINT_INTERP_HINT = """{
  "interpretation": "บทวิเคราะห์ผลการวิจัย Conjoint Analysis เป็นภาษาไทยแบบ Markdown ครอบคลุม 1) สรุปผู้บริหาร 2) วิเคราะห์ระดับความสำคัญและ Part-Worth Utilities 3) สเปกสินค้าที่เหมาะสมที่สุด (Optimal Product) 4) ข้อเสนอแนะเชิงกลยุทธ์ด้านราคาและการตลาด"
}"""


def validate_conjoint_interpretation_payload(raw_text: str) -> dict:
    warnings: List[str] = []
    if not raw_text or not str(raw_text).strip():
        err = "ยังไม่ได้วางผลวิเคราะห์จาก AI"
        return {
            "valid": False,
            "errors": [err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("conjoint_interp_v1", [err], _CONJOINT_INTERP_HINT, raw_text),
        }

    text = str(raw_text).strip()
    if START_MARKER in text and END_MARKER in text:
        s_idx = text.find(START_MARKER) + len(START_MARKER)
        e_idx = text.find(END_MARKER, s_idx)
        if e_idx > s_idx:
            text = text[s_idx:e_idx].strip()

    # If user/AI replied with JSON containing `interpretation`, unwrap cleanly
    if text.startswith("{") or text.startswith("```"):
        parsed, parse_err, parse_warns = extract_json_payload(text)
        warnings.extend(parse_warns)
        if not parse_err and isinstance(parsed, dict) and parsed.get("interpretation"):
            text = str(parsed["interpretation"]).strip()

    if len(text) < 80:
        err = "คำอธิบายสั้นเกินไป (< 80 ตัวอักษร) — กรุณานำบทวิเคราะห์ฉบับเต็มจาก ChatGPT / Gemini / Claude มาวาง"
        return {
            "valid": False,
            "errors": [err],
            "warnings": warnings,
            "data": None,
            "preview": None,
            "repair_prompt": build_repair_prompt("conjoint_interp_v1", [err], _CONJOINT_INTERP_HINT, raw_text),
        }

    return {
        "valid": True,
        "errors": [],
        "warnings": warnings,
        "data": {"interpretation": text},
        "preview": {
            "char_count": len(text),
            "excerpt": text[:280] + ("..." if len(text) > 280 else ""),
        },
        "repair_prompt": None,
    }
