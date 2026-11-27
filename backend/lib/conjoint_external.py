"""External-LLM helpers for the conjoint module (plan §B, 2026-11).

Everything here is pure (no DB, no LLM) so it can be unit-tested directly.

The convention every conjoint AI feature follows:

* ``{B}/external-prompt`` returns the SAME prompt the system LLM would receive,
  built by the same function, with the data already embedded.
* ``{B}/external-import`` accepts the text the user got back from their own LLM,
  validates it, and stores it in the same place the system result goes, stamped
  ``source="external"`` plus ``model_label`` / ``imported_at`` / ``imported_by``.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

SYSTEM_LLM_LABEL = "AI ของระบบ (Gemini 2.5 Flash)"

GENERIC_STEPS_TH = (
    "1. กดปุ่ม \"คัดลอก\" (หรือดาวน์โหลดไฟล์ .md) ของพรอมต์แต่ละส่วน\n"
    "2. เปิด AI ที่คุณใช้เอง เช่น ChatGPT, Claude, Gemini แล้วเริ่มแชตใหม่\n"
    "3. วาง \"คำสั่งระบบ (system prompt)\" ก่อน (ถ้า AI ของคุณมีช่อง Custom instructions / System ให้วางที่นั่น "
    "ถ้าไม่มี ให้วางรวมไว้ด้านบนของข้อความเดียวกัน) แล้ววางพรอมต์หลักต่อท้าย\n"
    "4. ตรวจคำตอบที่ได้ — ตัวเลขทุกตัวต้องตรงกับตัวเลขในพรอมต์ ห้ามมีตัวเลขที่ AI แต่งขึ้นเอง\n"
    "5. คัดลอกคำตอบทั้งหมดกลับมาวางในช่อง \"นำผลลัพธ์เข้า\" แล้วระบุชื่อ AI ที่ใช้ (เช่น ChatGPT-5, Claude)"
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(text: str, fallback: str = "study", max_len: int = 40) -> str:
    """Filename-safe slug. Thai characters are kept (browsers handle UTF-8
    filenames), whitespace and punctuation collapse to ``-``."""
    s = re.sub(r"[\\/:*?\"<>|\s]+", "-", (text or "").strip())
    s = re.sub(r"-{2,}", "-", s).strip("-.")
    return (s[:max_len] or fallback)


def build_prompt_payload(*, feature: str, title: str, instructions_th: str,
                         parts: List[Dict[str, Any]], expected_format: str,
                         filename: str, **extra) -> Dict[str, Any]:
    """Uniform ``external-prompt`` response body (plan §B)."""
    clean_parts = []
    for p in parts:
        q = {
            "key": p["key"],
            "title": p.get("title") or p["key"],
            "system_prompt": p.get("system_prompt") or "",
            "prompt": p.get("prompt") or "",
        }
        if p.get("json_example"):
            q["json_example"] = p["json_example"]
        for k in ("meta",):
            if p.get(k) is not None:
                q[k] = p[k]
        clean_parts.append(q)
    body = {
        "feature": feature,
        "title": title,
        "instructions_th": instructions_th,
        "expected_format": expected_format,
        "parts": clean_parts,
        "filename": filename,
    }
    body.update(extra)
    return body


def combined_prompt_text(system_prompt: str, prompt: str) -> str:
    """One self-contained block for chat UIs that have no system-prompt box."""
    if not system_prompt:
        return prompt
    return f"[คำสั่งระบบ / System instructions]\n{system_prompt}\n\n[คำขอ / Request]\n{prompt}"


def payload_as_markdown(payload: Dict[str, Any]) -> str:
    """Render an external-prompt payload as a downloadable .md file."""
    out = [f"# {payload.get('title', '')}", "", "## วิธีใช้", "", payload.get("instructions_th", ""), ""]
    for p in payload.get("parts", []):
        out += [f"## {p.get('title') or p['key']}", ""]
        if p.get("system_prompt"):
            out += ["### คำสั่งระบบ (system prompt)", "", "```text", p["system_prompt"], "```", ""]
        out += ["### พรอมต์", "", "```text", p.get("prompt", ""), "```", ""]
        if p.get("json_example"):
            out += ["### รูปแบบ JSON ที่ต้องได้กลับมา", "", "```json", p["json_example"], "```", ""]
    return "\n".join(out)


# --------------------------------------------------------------------------
# Import validation
# --------------------------------------------------------------------------
class ExternalImportError(ValueError):
    """Raised with a Thai, user-facing message when pasted content is unusable."""


_FENCE_RE = re.compile(r"^\s*```[a-zA-Z0-9_-]*\s*\n(.*?)\n?```\s*$", re.DOTALL)


def strip_code_fence(text: str) -> str:
    """Remove ONE code fence wrapping the whole answer (chat UIs love adding
    them). Fences inside the text are left alone."""
    if text is None:
        return ""
    m = _FENCE_RE.match(text)
    return m.group(1) if m else text


def clean_markdown_import(content: Optional[str], *, min_chars: int = 40) -> str:
    text = strip_code_fence((content or "").replace("\r\n", "\n")).strip()
    if len(text) < min_chars:
        raise ExternalImportError(
            "ข้อความที่วางสั้นเกินไป — กรุณาคัดลอกคำตอบทั้งหมดจาก AI มาวาง "
            f"(ต้องมีอย่างน้อย {min_chars} ตัวอักษร)"
        )
    return text


def parse_json_object(content: Optional[str]) -> Dict[str, Any]:
    """Tolerant JSON parsing for pasted LLM output.

    Accepts: bare JSON, JSON in a ```json fence, JSON surrounded by prose, and
    the common smart-quote / trailing-comma slips. Returns the FIRST balanced
    top-level object that parses.
    """
    raw = strip_code_fence((content or "").strip())
    if not raw:
        raise ExternalImportError("ยังไม่ได้วางผลลัพธ์จาก AI")
    candidates = [raw]
    # Any fenced block inside the text.
    candidates += re.findall(r"```(?:json)?\s*\n(.*?)```", raw, re.DOTALL)
    # Balanced {...} substrings, in order of appearance.
    candidates += _balanced_objects(raw)
    for cand in candidates:
        for variant in (cand, _repair_json(cand)):
            try:
                obj = json.loads(variant)
            except (ValueError, TypeError):
                continue
            if isinstance(obj, dict):
                return obj
    raise ExternalImportError(
        "อ่านผลลัพธ์เป็น JSON ไม่ได้ — กรุณาขอให้ AI ตอบเป็น JSON ตามตัวอย่างเท่านั้น "
        "(เริ่มด้วย { และจบด้วย }) แล้วคัดลอกมาวางใหม่ทั้งหมด"
    )


def _balanced_objects(text: str) -> List[str]:
    out, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(text):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}" and depth:
            depth -= 1
            if depth == 0 and start is not None:
                out.append(text[start:i + 1])
    return out


def _repair_json(s: str) -> str:
    s = s.replace("“", '"').replace("”", '"').replace("’", "'")
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return s


def clean_model_label(label: Optional[str]) -> str:
    lab = re.sub(r"\s+", " ", (label or "").strip())[:80]
    return lab or "AI ภายนอก (ไม่ระบุชื่อ)"


def external_stamp(model_label: Optional[str], user: Any) -> Dict[str, Any]:
    return {
        "source": "external",
        "model_label": clean_model_label(model_label),
        "imported_at": utcnow_iso(),
        "imported_by": getattr(user, "id", None),
    }


def ai_disclosure_line(source: Optional[str], model_label: Optional[str]) -> str:
    """AI-use disclosure for documents that contain AI-written text."""
    tool = (clean_model_label(model_label) if source == "external"
            else (model_label or SYSTEM_LLM_LABEL))
    return (
        f"การเปิดเผยการใช้ปัญญาประดิษฐ์: เนื้อหาเชิงบรรยายในเอกสารนี้ร่างด้วย {tool} "
        "จากผลการวิเคราะห์ที่คำนวณโดยระบบ SWUMKT ผู้วิจัยมีหน้าที่ตรวจทาน แก้ไข และรับผิดชอบต่อเนื้อหาทั้งหมด "
        "ตัวเลขสถิติทุกค่าต้องตรงกับตารางที่ระบบคำนวณ"
    )
