"""Brand Equity — external-LLM workflow helpers (plan 2026-11 §B).

Pure functions only (no Mongo, no LLM), so the system-LLM path in
``routes/brand_equity.py`` and the ``external-prompt`` / ``external-import``
endpoints share ONE prompt builder and ONE validator per AI step — there is no
second copy of a prompt that could drift.

Open-ended coding uses stable answer ids
----------------------------------------
Every distinct open-ended answer (after casefold + whitespace collapse) gets an
id ``a<8 hex>`` = sha1(question_id, normalised_text). The id depends only on the
text, not on its position, so

* answers that arrive between "copy prompt" and "paste result" cannot shift the
  mapping (a positional id would silently re-label every later answer);
* a code imported for an id maps back to exactly one (question, text) pair, and
  is applied to every respondent who typed that text — in any filter slice.

Duplicate answers are sent once with their frequency, which is what keeps a
study with hundreds of "Starbucks" answers inside what a chat LLM can handle.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import random
import re
from collections import Counter
from typing import Any, Dict, Iterable, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Budgets — keep every part comfortably inside a free-tier chat LLM.
# ---------------------------------------------------------------------------
PART_CHAR_BUDGET = 18000          # data characters per part (prompt text excluded)
CODING_ITEMS_PER_PART = 200       # distinct answers per coding part (output stays < ~8k chars)
CODING_TEXT_MAX = 300             # chars of one answer shown for coding
THEME_TEXT_MAX = 500              # chars of one answer shown for theme extraction
THEME_MAX_ITEMS = 250             # distinct answers per theme question before sampling
IDENTITY_MAX_ITEMS = 200          # distinct answers sent to the identity-image step

CODEABLE_PROCESSING = ("extract_brand", "extract_brands", "word_cloud")
TASK_OF_PROCESSING = {"extract_brand": "brand_single", "extract_brands": "brand_multi",
                      "word_cloud": "concept"}
LABEL_MAX = 60

SECTION_KEYS = ("coding", "themes", "identity", "insights")

SECTION_TITLES_TH = {
    "coding": "จัดกลุ่ม/เข้ารหัสคำตอบปลายเปิด",
    "themes": "สกัดประเด็น (themes) จากคำตอบปลายเปิด",
    "identity": "เทียบอัตลักษณ์ที่ตั้งใจ (identity) กับภาพลักษณ์ที่รับรู้ (image)",
    "insights": "ข้อเสนอแนะเชิงกลยุทธ์ (master insights)",
}


class ImportValidationError(ValueError):
    """Pasted content could not be accepted. ``message`` is Thai and user-facing;
    ``errors`` lists the individual problems (first ones only)."""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.errors = list(errors or [])[:15]

    def to_detail(self) -> Dict[str, Any]:
        return {"code": "external_import_invalid", "message": self.message,
                "errors": self.errors}


# ---------------------------------------------------------------------------
# Tolerant JSON extraction (strict about structure, forgiving about wrapping)
# ---------------------------------------------------------------------------
_FENCE_RE = re.compile(r"```[a-zA-Z0-9_-]*\s*\n?(.*?)```", re.S)
_TRAILING_COMMA_RE = re.compile(r",(\s*[}\]])")


def _try_load(s: str):
    try:
        return json.loads(s), None
    except json.JSONDecodeError as e:
        return None, e


def extract_json(text: Any) -> Any:
    """Find the JSON value in what a user pasted from a chat LLM.

    Accepts: bare JSON; JSON inside ``` fences; JSON with prose before/after;
    trailing commas. Raises ImportValidationError (Thai) when nothing parses.
    """
    if not isinstance(text, str) or not text.strip():
        raise ImportValidationError("ไม่พบข้อความที่วาง — กรุณาวางคำตอบจาก AI ทั้งหมด")
    s = text.strip().lstrip("﻿")
    # Typographic quotes break JSON and chat UIs love them.
    s_q = s.replace("“", '"').replace("”", '"')

    candidates: List[str] = [s, s_q]
    candidates += [m.group(1).strip() for m in _FENCE_RE.finditer(s_q)]
    last_err = None
    for c in candidates:
        val, err = _try_load(c)
        if err is None and isinstance(val, (dict, list)):
            return val
        last_err = err or last_err
        val, err = _try_load(_TRAILING_COMMA_RE.sub(r"\1", c))
        if err is None and isinstance(val, (dict, list)):
            return val

    # Prose around the JSON: try every '{' / '[' position with raw_decode and
    # keep the LARGEST value that decodes (prose like "{ดูด้านล่าง}" decodes to
    # nothing or to something tiny).
    dec = json.JSONDecoder()
    best = None
    best_len = 0
    for src in (s_q, _TRAILING_COMMA_RE.sub(r"\1", s_q)):
        for i, ch in enumerate(src):
            if ch not in "{[":
                continue
            try:
                val, end = dec.raw_decode(src, i)
            except json.JSONDecodeError as e:
                last_err = e
                continue
            if isinstance(val, (dict, list)) and end - i > best_len:
                best, best_len = val, end - i
        if best is not None:
            return best

    where = ""
    if last_err is not None:
        where = f" (ตำแหน่งที่อ่านไม่ได้: บรรทัด {last_err.lineno} คอลัมน์ {last_err.colno})"
    raise ImportValidationError(
        "อ่าน JSON จากข้อความที่วางไม่ได้" + where +
        " — ตรวจว่าคัดลอกคำตอบมาครบ (ไม่ถูกตัดกลางคัน) และ AI ตอบเป็น JSON ตามตัวอย่าง")


# ---------------------------------------------------------------------------
# Stable answer ids
# ---------------------------------------------------------------------------
_WS_RE = re.compile(r"\s+")


def norm_answer(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        v = ", ".join(str(x) for x in v if x not in (None, ""))
    return _WS_RE.sub(" ", str(v)).strip().casefold()


def answer_id(qid: str, key: str, length: int = 8) -> str:
    h = hashlib.sha1(f"{qid}\x1f{key}".encode("utf-8")).hexdigest()
    return "a" + h[:length]


def _question_values(q: dict, responses: Iterable[dict]) -> List[Any]:
    ids = {q.get("id")} | set(q.get("legacy_ids") or [])
    out = []
    for r in responses or []:
        for a in r.get("answers") or []:
            if a.get("question_id") in ids:
                out.append(a.get("value"))
    return out


def _distinct_items(qid: str, values: Iterable[Any], text_max: int) -> List[dict]:
    """[{id, key, text, n}] sorted by frequency desc, then key."""
    freq: Counter = Counter()
    forms: Dict[str, Counter] = {}
    for v in values:
        k = norm_answer(v)
        if not k:
            continue
        freq[k] += 1
        raw = v if not isinstance(v, list) else ", ".join(str(x) for x in v)
        forms.setdefault(k, Counter())[_WS_RE.sub(" ", str(raw)).strip()] += 1
    items = []
    for k, n in freq.items():
        text = forms[k].most_common(1)[0][0]
        if len(text) > text_max:
            text = text[: text_max - 1] + "…"
        items.append({"id": answer_id(qid, k), "key": k, "text": text, "n": n})
    items.sort(key=lambda it: (-it["n"], it["key"]))
    return items


def _dedupe_ids(units: List[dict]) -> None:
    """Resolve the (astronomically rare) 8-hex collision by lengthening the ids
    of every item that shares a prefix. Deterministic for a given set."""
    seen: Dict[str, int] = Counter(it["id"] for u in units for it in u["items"])
    if all(c == 1 for c in seen.values()):
        return
    for u in units:
        for it in u["items"]:
            if seen[it["id"]] > 1:
                it["id"] = answer_id(u["qid"], it["key"], 12)


def coding_units(study: dict, responses: List[dict]) -> List[dict]:
    """One unit per open-ended question whose answers need coding before they
    can be counted (brand mentions and one-word descriptors)."""
    units = []
    for q in study.get("questions") or []:
        ap = q.get("ai_processing")
        if ap not in CODEABLE_PROCESSING:
            continue
        if q.get("type") not in ("open_short", "open_long"):
            continue
        items = _distinct_items(q["id"], _question_values(q, responses), CODING_TEXT_MAX)
        if not items:
            continue
        units.append({"qid": q["id"], "prompt": q.get("prompt_th") or q.get("prompt") or "",
                      "task": TASK_OF_PROCESSING[ap], "kind": q.get("kind"),
                      "items": items})
    _dedupe_ids(units)
    return units


def theme_units(study: dict, responses: List[dict]) -> List[dict]:
    units = []
    for q in study.get("questions") or []:
        if q.get("ai_processing") != "theme_extraction" or q.get("type") != "open_long":
            continue
        items = _distinct_items(q["id"], _question_values(q, responses), THEME_TEXT_MAX)
        if not items:
            continue
        total_n = sum(it["n"] for it in items)
        sampled = False
        if len(items) > THEME_MAX_ITEMS or sum(len(it["text"]) + 16 for it in items) > PART_CHAR_BUDGET:
            # Deterministic, order-free sample: rank by a hash of the id so the
            # same data always yields the same sample. Disclosed as a sample.
            ranked = sorted(items, key=lambda it: hashlib.sha1(it["id"].encode()).hexdigest())
            keep, size = [], 0
            for it in ranked:
                cost = len(it["text"]) + 16
                if len(keep) >= THEME_MAX_ITEMS or size + cost > PART_CHAR_BUDGET:
                    break
                keep.append(it)
                size += cost
            keep.sort(key=lambda it: (-it["n"], it["key"]))
            items, sampled = keep, True
        units.append({"qid": q["id"], "prompt": q.get("prompt_th") or q.get("prompt") or "",
                      "kind": q.get("kind"), "items": items, "sampled": sampled,
                      "base_n": sum(it["n"] for it in items), "total_n": total_n})
    _dedupe_ids(units)
    return units


def identity_inputs(study: dict, responses: List[dict]) -> List[dict]:
    """Distinct personality + one-word answers (with frequency) for the
    identity-image comparison."""
    # Same inputs as the system pipeline has always used: the personality
    # question plus every word-association question.
    values: List[Any] = []
    for q in study.get("questions") or []:
        if q.get("ai_processing") in ("extract_personality", "word_cloud"):
            values += _question_values(q, responses)
    items = _distinct_items("identity", values, 200)
    return items[:IDENTITY_MAX_ITEMS]


def id_table(units: List[dict]) -> Dict[str, Tuple[str, str, str]]:
    """answer id -> (question id, normalised key, display text)."""
    return {it["id"]: (u["qid"], it["key"], it["text"]) for u in units for it in u["items"]}


# ---------------------------------------------------------------------------
# Prompt blocks (one builder per AI step)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_TH = (
    "คุณเป็นนักวิจัยการตลาดที่เข้ารหัสข้อมูลแบบสอบถามอย่างเป็นระบบ "
    "ทำงานตามคำสั่งทุกข้อ ใช้เฉพาะข้อมูลที่ให้มา ห้ามแต่งข้อมูลหรือตัวเลขเพิ่ม "
    "และตอบเป็น JSON ตามรูปแบบที่กำหนดเท่านั้น (ไม่ต้องมีคำอธิบายนอก JSON)"
)


def coding_block(units: List[dict], brand_list: List[str], category: str) -> str:
    lines = [
        "### งาน: เข้ารหัสคำตอบปลายเปิด (coding)",
        f"หมวดสินค้า: {category or '-'}",
        f"แบรนด์ที่รู้จักในการศึกษานี้ (ใช้ตัวสะกดนี้เป็นป้ายชื่อเสมอ): {', '.join(b for b in brand_list if b)}",
        "",
        "แต่ละบรรทัดคือคำตอบที่ไม่ซ้ำกัน รูปแบบ `id | (จำนวนคนที่ตอบแบบนี้) | ข้อความ`",
        "กติกา:",
        "- brand_single (แบรนด์แรกที่นึกถึง): ให้ป้ายชื่อแบรนด์ 1 ชื่อ เป็น string",
        "- brand_multi (แบรนด์อื่นที่นึกถึง): ให้ list ของชื่อแบรนด์ทั้งหมดที่คำตอบกล่าวถึง (ไม่ซ้ำ)",
        "- concept (คำ/คุณค่าที่นึกถึง): ให้ป้ายแนวคิด 1 คำ (ใช้คำเดียวกันกับคำตอบที่ความหมายเดียวกัน "
        "เช่น 'ทันสมัย' = 'modern' = 'Modern')",
        "- รวมตัวสะกดผิด ไทย/อังกฤษ ตัวย่อ ชื่อเล่น เข้ากับแบรนด์เดียวกัน; แบรนด์ที่ไม่อยู่ในรายการให้ใช้ชื่อที่นิยมที่สุด",
        "- คำตอบที่ไม่ได้ระบุแบรนด์/ไม่มีความหมาย (เช่น 'ไม่รู้', '-', 'ไม่มี') ให้ใส่ null",
        f"- ป้ายชื่อยาวไม่เกิน {LABEL_MAX} ตัวอักษร ห้ามเว้น id ใด ห้ามสร้าง id ใหม่",
        "",
    ]
    for u in units:
        lines.append(f"#### คำถาม {u['qid']} · ประเภท {u['task']}")
        lines.append(f"ข้อความคำถาม: {u['prompt']}")
        for it in u["items"]:
            lines.append(f"{it['id']} | ({it['n']}) | {it['text']}")
        lines.append("")
    return "\n".join(lines)


CODING_OUTPUT_SPEC = (
    '"coding": { "<id>": "ป้ายชื่อ" | ["ป้าย1","ป้าย2"] | null, ... }  '
    "— ครบทุก id ในงานนี้"
)


def themes_block(units: List[dict]) -> str:
    lines = [
        "### งาน: สกัดประเด็น (themes) จากคำตอบปลายเปิด",
        "สำหรับแต่ละคำถาม ให้จัดคำตอบเป็น 3-7 ประเด็น แต่ละประเด็นมี name (สั้น), "
        "description (1 ประโยค), sentiment (-1 ถึง 1) และ answer_ids = id ของคำตอบที่อยู่ในประเด็นนั้น",
        "คำตอบหนึ่งอยู่ได้หลายประเด็น ไม่ต้องนับจำนวนเอง — ระบบจะนับจาก answer_ids "
        "(จำนวนคนที่ตอบแบบนั้นอยู่ในวงเล็บ) ห้ามใส่ id ที่ไม่มีในรายการ",
        "",
    ]
    for u in units:
        note = (f" (สุ่มตัวอย่าง {len(u['items'])} จาก {u['total_n']} คำตอบ)" if u.get("sampled") else "")
        lines.append(f"#### คำถาม {u['qid']}{note}")
        lines.append(f"ข้อความคำถาม: {u['prompt']}")
        for it in u["items"]:
            lines.append(f"{it['id']} | ({it['n']}) | {it['text']}")
        lines.append("")
    return "\n".join(lines)


THEMES_OUTPUT_SPEC = (
    '"themes": { "<question id>": [ {"name": "...", "description": "...", '
    '"sentiment": 0.3, "answer_ids": ["a...", "a..."]}, ... ] }'
)


def identity_block(brand: str, intended_traits: List[str], items: List[dict]) -> str:
    lines = [
        "### งาน: เทียบอัตลักษณ์ที่แบรนด์ตั้งใจ กับภาพลักษณ์ที่ผู้ตอบรับรู้",
        f"แบรนด์: {brand}",
        f"อัตลักษณ์ที่ตั้งใจ (intended traits): {', '.join(intended_traits) or '(ไม่ได้ระบุ)'}",
        "คำตอบของผู้ตอบ (คำอธิบายบุคลิกแบรนด์ / คำเดียวที่นึกถึง) รูปแบบ `(จำนวน) ข้อความ`:",
    ]
    for it in items:
        lines.append(f"({it['n']}) {it['text']}")
    lines += [
        "",
        "ให้สรุป: perceived_traits (ไม่เกิน 12 ข้อ พร้อม count โดยประมาณจากจำนวนในวงเล็บ และ sentiment -1..1), "
        "aligned (intended ที่ผู้ตอบรับรู้), lost (intended ที่ไม่มีใครกล่าวถึง), "
        "unintended (ที่รับรู้แต่ไม่ได้ตั้งใจ), alignment_score_0_100 (ดุลยพินิจของคุณ — "
        "ระบบจะแสดงเป็นความเห็นเชิงคุณภาพ ไม่นำไปคำนวณคะแนน) และ narrative 2 ประโยค",
    ]
    return "\n".join(lines)


IDENTITY_OUTPUT_SPEC = (
    '"identity": {"perceived_traits": [{"trait": "...", "count": 12, "sentiment": 0.4}], '
    '"aligned": ["..."], "lost": ["..."], "unintended": ["..."], '
    '"alignment_score_0_100": 60, "narrative": "..."}'
)

INSIGHTS_OUTPUT_SPEC = (
    '"insights": [ {"headline": "...", "evidence": "... (อ้าง qid)", '
    '"recommendation": "...", "priority": "high|medium|low"}, ... 5 ข้อ ]'
)

OUTPUT_SPECS = {"coding": CODING_OUTPUT_SPEC, "themes": THEMES_OUTPUT_SPEC,
                "identity": IDENTITY_OUTPUT_SPEC, "insights": INSIGHTS_OUTPUT_SPEC}


def assemble_part(key: str, title: str, blocks: List[Tuple[str, str]],
                  study_line: str) -> Dict[str, Any]:
    """blocks: [(section_key, block_text)]. Returns one external-prompt part."""
    sections = [s for s, _ in blocks]
    body = [f"## ชุดงาน {key}: {title}", study_line, ""]
    for _s, txt in blocks:
        body.append(txt)
        body.append("")
    body.append("### รูปแบบคำตอบ (สำคัญ)")
    body.append("ตอบเป็น JSON object เดียวเท่านั้น โดยมี key ต่อไปนี้:")
    body.append(f'"part": "{key}"')
    for s in sections:
        body.append(OUTPUT_SPECS[s])
    example = {"part": key}
    if "coding" in sections:
        example["coding"] = {"a1b2c3d4": "ชื่อแบรนด์", "a5e6f7a8": None}
    if "themes" in sections:
        example["themes"] = {"<question id>": [{"name": "ราคา", "description": "...",
                                                 "sentiment": -0.2, "answer_ids": ["a1b2c3d4"]}]}
    if "identity" in sections:
        example["identity"] = {"perceived_traits": [{"trait": "เป็นกันเอง", "count": 10, "sentiment": 0.5}],
                               "aligned": [], "lost": [], "unintended": [],
                               "alignment_score_0_100": 50, "narrative": "..."}
    if "insights" in sections:
        example["insights"] = [{"headline": "...", "evidence": "...", "recommendation": "...",
                                "priority": "high"}]
    return {
        "key": key,
        "title": title,
        "sections": sections,
        "system_prompt": SYSTEM_PROMPT_TH,
        "prompt": "\n".join(body),
        "json_example": json.dumps(example, ensure_ascii=False, indent=2),
    }


def chunk_coding_units(units: List[dict]) -> List[List[dict]]:
    """Split coding units into part-sized chunks. A question larger than one
    chunk is split across consecutive chunks (each answer is coded on its own,
    and the brand list anchors labels across chunks)."""
    chunks: List[List[dict]] = []
    cur: List[dict] = []
    cur_items = 0
    cur_chars = 0
    for u in units:
        items = list(u["items"])
        while items:
            room_items = CODING_ITEMS_PER_PART - cur_items
            take, chars = [], 0
            for it in items:
                cost = len(it["text"]) + 20
                if len(take) >= room_items or (cur_chars + chars + cost > PART_CHAR_BUDGET and (take or cur)):
                    break
                take.append(it)
                chars += cost
            if not take:
                chunks.append(cur)
                cur, cur_items, cur_chars = [], 0, 0
                continue
            cur.append({**u, "items": take})
            cur_items += len(take)
            cur_chars += chars
            items = items[len(take):]
            if items:
                chunks.append(cur)
                cur, cur_items, cur_chars = [], 0, 0
    if cur:
        chunks.append(cur)
    return [c for c in chunks if c]


def block_chars(text: str) -> int:
    return len(text)


# ---------------------------------------------------------------------------
# Validators — never partially apply: validate everything, then return.
# ---------------------------------------------------------------------------
def _canon_brand(label: str, brand_list: List[str]) -> str:
    def tok(s):
        return re.sub(r"[\s\-_.,;:!?'\"()\[\]/\\]+", "", str(s or "").casefold())
    t = tok(label)
    for b in brand_list:
        if b and tok(b) == t:
            return b
    return label


def _clean_label(v: Any, errors: List[str], where: str) -> Optional[str]:
    if v is None:
        return None
    if not isinstance(v, str):
        errors.append(f"{where}: ป้ายต้องเป็นข้อความหรือ null (ได้ {type(v).__name__})")
        return None
    s = _WS_RE.sub(" ", v).strip()
    if not s or s.lower() in ("null", "none", "-", "n/a"):
        return None
    if len(s) > LABEL_MAX:
        errors.append(f"{where}: ป้ายยาวเกิน {LABEL_MAX} ตัวอักษร")
        return None
    return s


def validate_coding(section: Any, table: Dict[str, Tuple[str, str, str]],
                    task_by_qid: Dict[str, str], brand_list: List[str]) -> Dict[str, Dict[str, List[str]]]:
    """-> {qid: {answer_id: [labels]}}. [] means "coded: no brand / not usable"."""
    if not isinstance(section, dict) or not section:
        raise ImportValidationError(
            'ส่วน "coding" ต้องเป็น object ที่มี id เป็น key เช่น {"a1b2c3d4": "ชื่อแบรนด์"}')
    errors: List[str] = []
    unknown: List[str] = []
    out: Dict[str, Dict[str, List[str]]] = {}
    for aid, val in section.items():
        aid_s = str(aid).strip()
        if aid_s not in table:
            unknown.append(aid_s)
            continue
        qid = table[aid_s][0]
        task = task_by_qid.get(qid, "concept")
        where = f"id {aid_s}"
        labels: List[str] = []
        if isinstance(val, list):
            raw = [_clean_label(x, errors, where) for x in val]
            labels = [x for x in raw if x]
            if task != "brand_multi" and len(labels) > 1:
                errors.append(f"{where}: คำถามประเภท {task} ต้องมีป้ายเดียว (ได้ {len(labels)} ป้าย)")
                continue
        elif isinstance(val, dict):
            errors.append(f"{where}: ป้ายต้องเป็นข้อความ, list หรือ null — ไม่ใช่ object")
            continue
        else:
            lab = _clean_label(val, errors, where)
            labels = [lab] if lab else []
        if task in ("brand_single", "brand_multi"):
            labels = [_canon_brand(x, brand_list) for x in labels]
        seen, uniq = set(), []
        for x in labels:
            if x.casefold() not in seen:
                seen.add(x.casefold())
                uniq.append(x)
        out.setdefault(qid, {})[aid_s] = uniq
    if unknown:
        errors.insert(0, f"พบ id ที่ไม่มีในการศึกษานี้ {len(unknown)} รายการ เช่น {', '.join(unknown[:5])} "
                         "— AI อาจพิมพ์ id ผิด หรือพรอมต์เก่าเกินไป (สร้างพรอมต์ใหม่แล้วลองอีกครั้ง)")
    if errors:
        raise ImportValidationError("ส่วน coding มีข้อผิดพลาด จึงยังไม่นำเข้าส่วนใดเลย", errors)
    if not out:
        raise ImportValidationError("ส่วน coding ไม่มีรายการที่ใช้ได้")
    return out


def validate_themes(section: Any, units_by_qid: Dict[str, dict]) -> Dict[str, List[dict]]:
    if not isinstance(section, dict) or not section:
        raise ImportValidationError(
            'ส่วน "themes" ต้องเป็น object รูปแบบ {"<question id>": [ {...}, ... ]}')
    errors: List[str] = []
    out: Dict[str, List[dict]] = {}
    for qid, themes in section.items():
        u = units_by_qid.get(str(qid))
        if u is None:
            errors.append(f"คำถาม {qid}: ไม่ใช่คำถามที่ต้องสกัดประเด็นในชุดข้อมูลนี้")
            continue
        if not isinstance(themes, list) or not themes:
            errors.append(f"คำถาม {qid}: ต้องเป็น list ของประเด็นอย่างน้อย 1 ข้อ")
            continue
        if len(themes) > 12:
            errors.append(f"คำถาม {qid}: มีประเด็นมากเกินไป ({len(themes)} > 12)")
            continue
        by_id = {it["id"]: it for it in u["items"]}
        base = u.get("base_n") or sum(it["n"] for it in u["items"]) or 1
        rows = []
        for i, t in enumerate(themes, 1):
            w = f"คำถาม {qid} ประเด็นที่ {i}"
            if not isinstance(t, dict):
                errors.append(f"{w}: ต้องเป็น object")
                continue
            name = t.get("name") or t.get("theme")
            if not isinstance(name, str) or not name.strip():
                errors.append(f"{w}: ไม่มี name")
                continue
            desc = t.get("description") or ""
            if not isinstance(desc, str):
                errors.append(f"{w}: description ต้องเป็นข้อความ")
                continue
            sent = t.get("sentiment", 0)
            if isinstance(sent, bool) or not isinstance(sent, (int, float)):
                try:
                    sent = float(sent)
                except (TypeError, ValueError):
                    errors.append(f"{w}: sentiment ต้องเป็นตัวเลข -1 ถึง 1")
                    continue
            sent = max(-1.0, min(1.0, float(sent)))
            ids = t.get("answer_ids")
            if not isinstance(ids, list):
                errors.append(f"{w}: ต้องมี answer_ids เป็น list")
                continue
            bad = [str(x) for x in ids if str(x) not in by_id]
            if bad:
                errors.append(f"{w}: answer_ids ที่ไม่มีในคำถามนี้ เช่น {', '.join(bad[:4])}")
                continue
            uniq = list(dict.fromkeys(str(x) for x in ids))
            members = [by_id[x] for x in uniq]
            count = sum(m["n"] for m in members)
            quotes = [m["text"] for m in sorted(members, key=lambda m: -m["n"])[:2]]
            rows.append({"name": name.strip()[:80], "description": desc.strip()[:300],
                         "sentiment": round(sent, 2), "count": count,
                         "pct": round(count / base * 100, 1), "sample_quotes": quotes,
                         "answer_ids": uniq, "base_n": base,
                         "sampled": bool(u.get("sampled")), "total_n": u.get("total_n", base)})
        rows.sort(key=lambda r: -r["count"])
        out[str(qid)] = rows
    if errors:
        raise ImportValidationError("ส่วน themes มีข้อผิดพลาด จึงยังไม่นำเข้าส่วนใดเลย", errors)
    return out


def _str_list(v: Any, field: str, errors: List[str], max_len: int = 30) -> List[str]:
    if v is None:
        return []
    if not isinstance(v, list):
        errors.append(f"identity.{field}: ต้องเป็น list")
        return []
    out = []
    for x in v:
        if isinstance(x, dict):
            x = x.get("trait") or x.get("label") or x.get("name")
        if isinstance(x, str) and x.strip():
            out.append(x.strip()[:60])
    return out[:max_len]


def validate_identity(section: Any) -> Dict[str, Any]:
    if not isinstance(section, dict):
        raise ImportValidationError('ส่วน "identity" ต้องเป็น object')
    errors: List[str] = []
    pt_raw = section.get("perceived_traits")
    if not isinstance(pt_raw, list) or not pt_raw:
        errors.append("identity.perceived_traits: ต้องเป็น list อย่างน้อย 1 ข้อ")
        pt_raw = []
    perceived = []
    for i, p in enumerate(pt_raw[:15], 1):
        if isinstance(p, str):
            p = {"trait": p}
        if not isinstance(p, dict) or not str(p.get("trait") or "").strip():
            errors.append(f"identity.perceived_traits ข้อที่ {i}: ต้องมี trait")
            continue
        try:
            cnt = int(p.get("count") or 0)
            sent = float(p.get("sentiment") or 0)
        except (TypeError, ValueError):
            errors.append(f"identity.perceived_traits ข้อที่ {i}: count/sentiment ต้องเป็นตัวเลข")
            continue
        perceived.append({"trait": str(p["trait"]).strip()[:60], "count": max(0, cnt),
                          "sentiment": round(max(-1.0, min(1.0, sent)), 2)})
    score = section.get("alignment_score_0_100", section.get("alignment_score"))
    if score is not None:
        try:
            score = float(score)
            if score <= 1 and score > 0 and isinstance(section.get("alignment_score_0_100"), float):
                score = score * 100
            score = int(round(max(0.0, min(100.0, score))))
        except (TypeError, ValueError):
            errors.append("identity.alignment_score_0_100: ต้องเป็นตัวเลข 0-100")
            score = None
    narrative = section.get("narrative") or ""
    if not isinstance(narrative, str):
        errors.append("identity.narrative: ต้องเป็นข้อความ")
        narrative = ""
    out = {
        "perceived_traits": perceived,
        "aligned": _str_list(section.get("aligned"), "aligned", errors),
        "lost": _str_list(section.get("lost"), "lost", errors),
        "unintended": _str_list(section.get("unintended"), "unintended", errors),
        "alignment_score_0_100": score,
        "narrative": narrative.strip()[:800],
        # Explicit: an LLM judgement, displayed but never scored.
        "alignment_is_llm_judgement": True,
    }
    if errors:
        raise ImportValidationError("ส่วน identity มีข้อผิดพลาด จึงยังไม่นำเข้าส่วนใดเลย", errors)
    return out


_PRIORITY_MAP = {"high": "high", "medium": "medium", "low": "low", "สูง": "high",
                 "กลาง": "medium", "ปานกลาง": "medium", "ต่ำ": "low", "med": "medium"}


def validate_insights(section: Any) -> List[dict]:
    if isinstance(section, dict) and isinstance(section.get("insights"), list):
        section = section["insights"]
    if not isinstance(section, list) or not section:
        raise ImportValidationError('ส่วน "insights" ต้องเป็น list ของข้อเสนอแนะอย่างน้อย 1 ข้อ')
    errors: List[str] = []
    out = []
    for i, ins in enumerate(section[:10], 1):
        w = f"insights ข้อที่ {i}"
        if not isinstance(ins, dict):
            errors.append(f"{w}: ต้องเป็น object")
            continue
        head = ins.get("headline") or ins.get("title")
        if not isinstance(head, str) or not head.strip():
            errors.append(f"{w}: ไม่มี headline")
            continue
        ev = ins.get("evidence") or ""
        rec = ins.get("recommendation") or ""
        if not isinstance(ev, str) or not isinstance(rec, str):
            errors.append(f"{w}: evidence/recommendation ต้องเป็นข้อความ")
            continue
        pr = str(ins.get("priority") or "medium").strip().lower()
        pr = _PRIORITY_MAP.get(pr)
        if pr is None:
            errors.append(f"{w}: priority ต้องเป็น high, medium หรือ low")
            continue
        out.append({"headline": head.strip()[:200], "evidence": ev.strip()[:1200],
                    "recommendation": rec.strip()[:600], "priority": pr})
    if errors:
        raise ImportValidationError("ส่วน insights มีข้อผิดพลาด จึงยังไม่นำเข้าส่วนใดเลย", errors)
    return out


def split_sections(obj: Any, expected: Optional[List[str]] = None) -> Dict[str, Any]:
    """Normalise a pasted response to {section: value}. Forgiving about
    wrapping: a bare array is the insights list when only insights is expected;
    a bare {id: label} map is coding when only coding is expected."""
    exp = list(expected or [])
    if isinstance(obj, list):
        if exp == ["insights"] or (not exp and obj and isinstance(obj[0], dict)
                                    and ("headline" in obj[0] or "title" in obj[0])):
            return {"insights": obj}
        raise ImportValidationError(
            'คำตอบเป็น list แต่ชุดงานนี้ต้องการ JSON object ที่มี key เช่น "coding", "themes"')
    if not isinstance(obj, dict):
        raise ImportValidationError("คำตอบต้องเป็น JSON object")
    found = {k: obj[k] for k in SECTION_KEYS if k in obj}
    if not found:
        if exp == ["coding"] and obj and all(re.fullmatch(r"a[0-9a-f]{8,12}", str(k)) for k in obj):
            return {"coding": obj}
        if exp == ["identity"] and "perceived_traits" in obj:
            return {"identity": obj}
        raise ImportValidationError(
            "ไม่พบส่วนคำตอบที่รู้จัก — ต้องมีอย่างน้อยหนึ่งใน: " + ", ".join(SECTION_KEYS))
    return found


# ---------------------------------------------------------------------------
# Applying codes to raw answers (works on ANY slice of respondents)
# ---------------------------------------------------------------------------
def wilson_ci(k: int, n: int, z: float = 1.959963984540054) -> Optional[List[float]]:
    """Wilson score interval for a proportion, in percent."""
    if n <= 0:
        return None
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / den
    return [round(max(0.0, centre - half) * 100, 1), round(min(1.0, centre + half) * 100, 1)]


def counts_from_codes(qid: str, values: List[Any], codes: Dict[str, List[str]],
                      fallback) -> Dict[str, Any]:
    """Count labels over respondents in THIS slice.

    codes: {answer_id: [labels]} for the question. ``fallback(value)`` returns
    the labels for an answer that has no code yet (deterministic matching).
    pct base = respondents who gave a non-empty answer; a respondent naming a
    brand twice counts once.
    """
    total = 0
    coded = 0
    counter: Counter = Counter()
    for v in values:
        k = norm_answer(v)
        if not k:
            continue
        total += 1
        aid = answer_id(qid, k)
        labels = codes.get(aid)
        if labels is None:
            aid12 = answer_id(qid, k, 12)
            labels = codes.get(aid12)
        if labels is None:
            labels = list(fallback(v) or [])
        else:
            coded += 1
        for lab in dict.fromkeys(labels):
            counter[lab] += 1
    rows = [{"label": lab, "count": c, "pct": round(c / total * 100, 1) if total else 0.0,
             "pct_ci95": wilson_ci(c, total)}
            for lab, c in sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))]
    return {"total": total, "coded": coded, "counts": rows[:30]}


# ---------------------------------------------------------------------------
# Manual / spreadsheet code frame (no LLM)
# ---------------------------------------------------------------------------
CODEFRAME_HEADER = ["answer_id", "question_id", "question_type", "frequency", "answer_text", "code"]


def codeframe_csv(units: List[dict], existing: Optional[Dict[str, Dict[str, List[str]]]] = None) -> str:
    """Spreadsheet the researcher codes by hand. ``code``: one label; for
    brand_multi several labels separated by ``;``. Blank = not coded yet;
    ``-`` = coded as "no brand / not usable"."""
    existing = existing or {}
    buf = io.StringIO()
    buf.write("﻿")  # Excel opens UTF-8 Thai correctly with a BOM
    w = csv.writer(buf)
    w.writerow(CODEFRAME_HEADER)
    for u in units:
        ex = existing.get(u["qid"]) or {}
        for it in u["items"]:
            cur = ex.get(it["id"])
            code = "" if cur is None else ("-" if not cur else "; ".join(cur))
            w.writerow([it["id"], u["qid"], u["task"], it["n"], it["text"], code])
    return buf.getvalue()


def parse_codeframe_csv(text: str, table: Dict[str, Tuple[str, str, str]],
                        task_by_qid: Dict[str, str], brand_list: List[str]) -> Dict[str, Dict[str, List[str]]]:
    """Validate a filled code frame. Same strictness as the LLM import: an
    unknown id or a malformed row rejects the whole file."""
    if not isinstance(text, str) or not text.strip():
        raise ImportValidationError("ไฟล์ว่าง — กรุณาอัปโหลดไฟล์ CSV ที่ลงรหัสแล้ว")
    s = text.lstrip("﻿")
    try:
        dialect = csv.Sniffer().sniff(s[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    rows = list(csv.reader(io.StringIO(s), dialect))
    if not rows:
        raise ImportValidationError("ไม่พบแถวข้อมูลในไฟล์")
    header = [h.strip().lower() for h in rows[0]]
    if "answer_id" not in header or "code" not in header:
        raise ImportValidationError(
            "ไม่พบคอลัมน์ answer_id และ code — กรุณาใช้ไฟล์ที่ดาวน์โหลดจากระบบ (อย่าเปลี่ยนชื่อหัวคอลัมน์)")
    i_id, i_code = header.index("answer_id"), header.index("code")
    section: Dict[str, Any] = {}
    errors: List[str] = []
    for ln, row in enumerate(rows[1:], start=2):
        if not row or all(not c.strip() for c in row):
            continue
        if len(row) <= max(i_id, i_code):
            errors.append(f"แถว {ln}: จำนวนคอลัมน์ไม่ครบ")
            continue
        aid = row[i_id].strip()
        code = row[i_code].strip()
        if not code:
            continue  # not coded yet — allowed
        if code == "-":
            section[aid] = None
        else:
            parts = [p.strip() for p in code.split(";") if p.strip()]
            section[aid] = parts if len(parts) > 1 else parts[0]
    if errors:
        raise ImportValidationError("ไฟล์ CSV มีข้อผิดพลาด จึงยังไม่นำเข้าเลย", errors)
    if not section:
        raise ImportValidationError("ยังไม่มีแถวใดลงรหัส (คอลัมน์ code ว่างทั้งหมด)")
    return validate_coding(section, table, task_by_qid, brand_list)


# ---------------------------------------------------------------------------
# Thesis chapter import
# ---------------------------------------------------------------------------
_PLACEHOLDER_RE = re.compile(r"\bX\.X\b|\[ระบุ|\bTBD\b|ผู้ใช้จะใส่เอง|\[insert", re.I)


def clean_chapter(ch: int, content: Any) -> Tuple[str, List[str]]:
    """Validate one pasted chapter. Returns (markdown, warnings)."""
    if not isinstance(content, str) or not content.strip():
        raise ImportValidationError(f"บทที่ {ch}: ไม่มีเนื้อหา")
    s = content.strip()
    m = re.fullmatch(r"```(?:markdown|md)?\s*\n(.*)\n```", s, re.S)
    if m:
        s = m.group(1).strip()
    if len(s) < 200:
        raise ImportValidationError(
            f"บทที่ {ch}: เนื้อหาสั้นเกินไป ({len(s)} ตัวอักษร) — อาจคัดลอกมาไม่ครบ")
    warnings: List[str] = []
    if not re.search(rf"บทที่\s*{ch}\b", s[:400]):
        s = f"## บทที่ {ch}\n\n" + s
        warnings.append(f"บทที่ {ch}: ไม่พบหัวข้อ 'บทที่ {ch}' ระบบเติมให้แล้ว")
    if _PLACEHOLDER_RE.search(s):
        warnings.append(f"บทที่ {ch}: พบข้อความเว้นว่าง/placeholder (เช่น X.X, [ระบุ…]) — ตรวจแก้ก่อนส่ง")
    return s, warnings


def reliability_claim_warnings(text: str, reliability: Dict[str, dict]) -> List[str]:
    """Flag an imported chapter that claims α ≥ .70 although no dimension was
    measured to meet it (the hard rule given to the external LLM)."""
    if not text:
        return []
    any_meets = any((r or {}).get("meets_threshold") for r in (reliability or {}).values())
    claims = re.search(r"(α|alpha|แอลฟา)[^\n]{0,40}(≥|>=|มากกว่า|สูงกว่า)\s*0?\.7", text, re.I)
    if claims and not any_meets:
        return ["มีการอ้างว่า Cronbach's α ผ่านเกณฑ์ 0.70 แต่ไม่มีมิติใดที่วัดได้ผ่านเกณฑ์ — ต้องแก้ก่อนส่ง"]
    return []


# ---------------------------------------------------------------------------
# Visual identity (vision step) and attribute translation (be.questions)
# ---------------------------------------------------------------------------
_HEX_RE = re.compile(r"^#?[0-9a-fA-F]{6}$")


def validate_visual_identity(obj: Any) -> Dict[str, Any]:
    if isinstance(obj, dict) and isinstance(obj.get("visual_identity"), dict):
        obj = obj["visual_identity"]
    if not isinstance(obj, dict):
        raise ImportValidationError("คำตอบต้องเป็น JSON object ตามตัวอย่าง (derived_traits, visual_palette, …)")
    errors: List[str] = []

    def strs(field, mx):
        v = obj.get(field)
        if v is None:
            return []
        if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
            errors.append(f"{field}: ต้องเป็น list ของข้อความ")
            return []
        return [x.strip()[:60] for x in v if x.strip()][:mx]

    traits = strs("derived_traits", 12)
    if not traits:
        errors.append("derived_traits: ต้องมีอย่างน้อย 1 ข้อ")
    palette_raw = strs("visual_palette", 8)
    palette = []
    for h in palette_raw:
        if not _HEX_RE.match(h):
            errors.append(f"visual_palette: '{h}' ไม่ใช่รหัสสี hex 6 หลัก")
            continue
        palette.append("#" + h.lstrip("#").upper())
    out = {"derived_traits": traits, "visual_palette": palette,
           "visual_keywords": strs("visual_keywords", 12)}
    for f in ("design_style", "archetype", "summary"):
        v = obj.get(f) or ""
        if not isinstance(v, str):
            errors.append(f"{f}: ต้องเป็นข้อความ")
            v = ""
        out[f] = v.strip()[:800 if f == "summary" else 120]
    if errors:
        raise ImportValidationError("ผลวิเคราะห์อัตลักษณ์ภาพมีข้อผิดพลาด จึงยังไม่นำเข้า", errors)
    return out


def parse_translations(text: Any, n_expected: int) -> List[str]:
    """Accept a JSON list of strings, or one translation per line."""
    lines: List[str] = []
    try:
        val = extract_json(text)
        if isinstance(val, dict):
            val = val.get("translations") or val.get("en") or list(val.values())
        if isinstance(val, list):
            lines = [str(x).strip() for x in val if str(x).strip()]
    except ImportValidationError:
        if not isinstance(text, str):
            raise
        lines = [re.sub(r"^\s*(\d+[.)]|[-•*])\s*", "", ln).strip().strip('"')
                 for ln in text.splitlines() if ln.strip()]
    if len(lines) != n_expected:
        raise ImportValidationError(
            f"จำนวนคำแปลไม่ตรง: ต้องการ {n_expected} บรรทัด ได้ {len(lines)} บรรทัด "
            "(หนึ่งบรรทัดต่อหนึ่งคุณลักษณะ ตามลำดับเดิม)")
    if any(len(x) > 120 for x in lines):
        raise ImportValidationError("คำแปลบางบรรทัดยาวเกิน 120 ตัวอักษร")
    return lines
