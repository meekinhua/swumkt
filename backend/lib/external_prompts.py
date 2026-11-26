"""Prompt builders + helpers for the external-LLM workflow of the "other tools"
(plan 2026-11 §B, WP5): translate, survey generation, journey map, behaviour /
perception analysis.

Every builder here is PURE (no db, no LLM) and is the single source of the prompt:
the system-LLM endpoint in ``server.py`` calls the same function that its
``…/external-prompt`` companion calls, so the two can never drift.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from lib import llm_policy

GENERIC_STEPS_TH = (
    "1. กดปุ่ม \"คัดลอก\" (หรือดาวน์โหลดไฟล์ .md) ของพรอมต์แต่ละส่วน\n"
    "2. เปิด AI ที่คุณใช้เอง เช่น ChatGPT, Claude, Gemini แล้วเริ่มแชตใหม่\n"
    "3. วาง \"คำสั่งระบบ (system prompt)\" ก่อน (ถ้า AI ของคุณมีช่อง Custom instructions / System ให้วางที่นั่น "
    "ถ้าไม่มี ให้วางรวมไว้ด้านบนของข้อความเดียวกัน) แล้ววางพรอมต์หลักต่อท้าย\n"
    "4. ตรวจคำตอบที่ได้ก่อนนำไปใช้ — AI อาจแต่งข้อมูลหรือตัวเลขที่ไม่มีในพรอมต์\n"
    "5. คัดลอกคำตอบกลับมาวางในช่องผลลัพธ์ของหน้านี้ (หรือช่องนำผลลัพธ์เข้า ถ้ามี)"
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- policy glue
def is_policy_refusal(exc: BaseException) -> bool:
    """True for the two shapes a policy refusal takes: the central guard's
    ``SystemLLMDisabled`` and the explicit ``HTTPException(409, llm_external_only)``."""
    if isinstance(exc, llm_policy.SystemLLMDisabled):
        return True
    if isinstance(exc, HTTPException) and exc.status_code == 409:
        d = exc.detail
        return isinstance(d, dict) and d.get("code") == "llm_external_only"
    return False


async def llm_if_allowed(feature: str, user: Any = None) -> bool:
    """Soft gate for endpoints that only USE the LLM as an optional extra
    (document analysis, journal-based style detection): True (and the request is
    granted) when the policy allows the system LLM, False when it does not, so the
    caller can degrade gracefully instead of failing."""
    try:
        await llm_policy.require_system_llm(feature, user)
        return True
    except HTTPException as e:
        if is_policy_refusal(e):
            return False
        raise


# ---------------------------------------------------------------- payloads
def build_payload(*, feature: str, title: str, instructions_th: str, parts: List[Dict[str, Any]],
                  expected_format: str, filename: str, **extra) -> Dict[str, Any]:
    """Uniform ``external-prompt`` response body (plan §B)."""
    clean = []
    for p in parts:
        q = {"key": p.get("key", "main"), "title": p.get("title") or p.get("key", "main"),
             "system_prompt": p.get("system_prompt") or "", "prompt": p.get("prompt") or ""}
        if p.get("json_example"):
            q["json_example"] = p["json_example"]
        clean.append(q)
    body = {"feature": feature, "title": title, "instructions_th": instructions_th,
            "expected_format": expected_format, "parts": clean, "filename": filename}
    body.update(extra)
    return body


def single_part_payload(*, feature: str, title: str, system_prompt: str, prompt: str,
                        expected_format: str, filename: str, json_example: Optional[str] = None,
                        instructions_th: Optional[str] = None, **extra) -> Dict[str, Any]:
    part = {"key": "main", "title": title, "system_prompt": system_prompt, "prompt": prompt}
    if json_example:
        part["json_example"] = json_example
    return build_payload(feature=feature, title=title,
                         instructions_th=instructions_th or GENERIC_STEPS_TH,
                         parts=[part], expected_format=expected_format, filename=filename, **extra)


# ---------------------------------------------------------------- import helpers
class ExternalImportError(ValueError):
    """Pasted answer is unusable. ``str(e)`` is a Thai message for the user."""


def strip_code_fence(text: str) -> str:
    t = (text or "").strip()
    m = re.match(r"^```[a-zA-Z0-9_-]*[ \t]*\n(.*?)\n?```\s*$", t, re.DOTALL)
    return m.group(1).strip() if m else t


def clean_text_import(content: Optional[str], *, min_chars: int = 20) -> str:
    t = strip_code_fence(content or "")
    if len(t) < min_chars:
        raise ExternalImportError("ข้อความที่วางสั้นเกินไปหรือว่างเปล่า — กรุณาวางคำตอบทั้งหมดจาก AI")
    return t


def clean_model_label(label: Optional[str]) -> str:
    return re.sub(r"\s+", " ", (label or "").strip())[:80]


def external_stamp(model_label: Optional[str], user: Any) -> Dict[str, Any]:
    uid = None
    if user is not None:
        uid = user.get("id") if isinstance(user, dict) else getattr(user, "id", None)
    return {"source": "external", "model_label": clean_model_label(model_label) or None,
            "imported_at": utcnow_iso(), "imported_by": uid}


# ---------------------------------------------------------------- translate
LANGUAGE_NAMES = {"th": "Thai", "en": "English", "zh": "Chinese", "ja": "Japanese",
                  "ko": "Korean", "my": "Burmese", "lo": "Lao", "vi": "Vietnamese"}


def translate_prompts(text: str, target_language: str) -> Tuple[str, str]:
    """(system_prompt, user_prompt) of POST /api/translate."""
    name = LANGUAGE_NAMES.get(target_language, target_language)
    system = (f"You are a professional translator. Translate the given text to {name}. "
              "Only return the translated text without any explanations or additional comments.")
    return system, f"Translate this text to {name}:\n\n{text}"


# ---------------------------------------------------------------- survey (SDL)
SURVEY_SYSTEM_PROMPT = ("You are a professional survey designer. You create surveys using YAML format. "
                        "Return only valid YAML without markdown code blocks or explanations.")


def survey_sdl_prompts(description: str, survey_type: Any, num_questions: Any,
                       target_language: str) -> Tuple[str, str]:
    """(system_prompt, user_prompt) of POST /api/surveys/ai-generate."""
    lang_instruction = "English" if target_language == "en" else "Thai (ไทย)"
    survey_type_value = survey_type.value if hasattr(survey_type, "value") else survey_type
    prompt = f"""You are a professional survey designer. Create a survey using the Survey Definition Language (SDL) YAML format.

**Task:** Create a survey in {lang_instruction} language

**Topic:** {description}
**Survey Type:** {survey_type_value}
**Target Number of Questions:** {num_questions}

**Requirements:**
- Create 2-3 well-organized sections
- Use diverse question types
- Write all text in {lang_instruction}
- Return ONLY valid YAML (no markdown, no explanations)
- IMPORTANT: Use simple strings for 'type', not enum names (e.g., 'perception' not 'SurveyType.PERCEPTION')

**SDL Format Example:**
```yaml
survey: "Survey Title in {lang_instruction}"
type: perception
description: "Brief description in {lang_instruction}"

demographics:
  collect: true
  auto_fill: true
  fields:
    - birth_sex
    - age_group
    - education

sections:
  - name: "Section Name in {lang_instruction}"
    description: "Section description"
    questions:
      - text: "Question in {lang_instruction}?"
        type: multiple_choice_single
        required: yes
        data_type: nominal
        options:
          - "Option 1"
          - "Option 2"
          - "Option 3"
      
      - text: "Rate this..."
        type: rating_scale
        scale: "1-5"
        labels:
          "1": "Very Poor"
          "5": "Excellent"
        required: yes
        data_type: scale
      
      - text: "Your thoughts?"
        type: open_ended
        required: no
        data_type: nominal
```

**Available Question Types:**
- multiple_choice_single: Single selection from options
- multiple_choice_multiple: Multiple selections allowed
- rating_scale: Numeric scale (use scale: "1-5" or "1-10")
- likert_scale: Use likert: agreement-5 or satisfaction-5
- open_ended: Free text response

**Data Types:**
- nominal: Categories without order
- ordinal: Ordered categories
- scale: Numeric scale with intervals

**Now create the survey. Return ONLY the YAML, no markdown blocks, no explanations:**"""
    return SURVEY_SYSTEM_PROMPT, prompt


# ---------------------------------------------------------------- journey map
def journey_user_prompt(raw_data: str, research_context: Optional[str], target_language: Optional[str],
                        journey_type: Optional[str], journey_style: Optional[str]) -> str:
    """User prompt of POST /api/generate-journey-map (the system prompt is the admin-editable
    ``journey_map_prompt`` setting or the built-in default)."""
    language_name = "Thai" if target_language == "th" else "English"
    type_desc = "simple and straightforward" if journey_type == "A" else "detailed and comprehensive"
    style_desc = ("linear sequential path" if journey_style == "linear"
                  else "nonlinear with multiple paths and decision points")
    return f"""Please analyze the following qualitative research data and create a Customer Journey Map:

Research Data:
{raw_data}

{f"Additional Context: {research_context}" if research_context else ""}

Journey Requirements:
- Type: {journey_type} ({type_desc})
- Style: {journey_style} ({style_desc})
- Output Language: {language_name}

Please provide:
1. Analysis summary of the customer journey in {language_name}
2. Mermaid diagram code for visualization with labels in {language_name}

IMPORTANT: All text in both the analysis summary and the mermaid diagram must be written in {language_name}.
"""


def parse_journey_response(response_text: str) -> Tuple[str, str]:
    """(analysis_summary, mermaid_code) from the model's ANALYSIS:/MERMAID: answer."""
    analysis_summary = ""
    mermaid_code = ""
    if "ANALYSIS:" in response_text and "MERMAID:" in response_text:
        parts = response_text.split("MERMAID:")
        analysis_part = parts[0].replace("ANALYSIS:", "").strip()
        mermaid_part = parts[1].strip()
        if "```mermaid" in mermaid_part:
            mermaid_code = mermaid_part.split("```mermaid")[1].split("```")[0].strip()
        elif "```" in mermaid_part:
            mermaid_code = mermaid_part.split("```")[1].split("```")[0].strip()
        else:
            mermaid_code = mermaid_part.strip()
        analysis_summary = analysis_part
    else:
        if "```mermaid" in response_text:
            mermaid_code = response_text.split("```mermaid")[1].split("```")[0].strip()
            analysis_summary = response_text.split("```mermaid")[0].strip()
        else:
            analysis_summary = response_text
            mermaid_code = "graph TD\n    A[Start] --> B[Process Data]\n    B --> C[End]"
    return analysis_summary, mermaid_code


# ---------------------------------------------------------------- behaviour analysis
def behavior_user_prompt(raw_data: str, research_context: Optional[str], target_language: Optional[str]) -> str:
    language_name = "Thai" if target_language == "th" else "English"
    return f"""Please analyze the following customer behavior research data:

Research Data:
{raw_data}

{f"Additional Context: {research_context}" if research_context else ""}

Output Language: {language_name}

Please provide a comprehensive analysis with key findings and actionable recommendations in {language_name}.
"""




# ---------------------------------------------------------------- perception
def perception_questions_user_prompt(topic: str, perspective: Optional[str], target_language: str) -> str:
    p = f"""Research Topic: {topic}"""
    if perspective:
        p += f"\n\nResearch Perspective/Focus Areas:\n{perspective}"
    p += f"\n\nGenerate interview questions in {target_language} language."
    return p




def perception_analysis_user_prompt(interview_data: str, analysis_context: Optional[str],
                                    target_language: str) -> str:
    p = f"""Interview Data:
{interview_data}"""
    if analysis_context:
        p += f"\n\nAdditional Context:\n{analysis_context}"
    p += f"\n\nProvide analysis in {target_language} language."
    return p

