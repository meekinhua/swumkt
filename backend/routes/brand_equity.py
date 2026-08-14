"""
Brand Equity / Brand Health Check Module
==========================================
Aaker's 4-Dimension framework: Awareness, Perceived Quality, Brand Identity, Brand Loyalty.
- Auto-generated question library + AI-powered question generation
- Stats engine (descriptive + inferential)
- AI theme extraction + Identity-Image alignment + Master insights
"""

import os
import re
import uuid
import json
import hashlib
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from collections import Counter

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks, Query
from pydantic import BaseModel, Field

from lib.ttl_cache import async_ttl_cache

brand_equity_router = APIRouter(prefix="/brand-equity", tags=["Brand Equity"])


class BrandThesisExportRequest(BaseModel):
    """Request body for AI thesis generation (chapters 1-5 + extra prompt)."""
    chapters: List[int] = Field(default_factory=lambda: [3, 4, 5])
    extra_prompt: str = ""

# Canonical Brand-Health tier scale. ONE definition, served to every surface.
# It previously existed as two incompatible mappings: this 5-tier scale (in
# frontend/src/lib/brandHealthVerdict.js, BeMethodology.jsx, routes/share.py and
# routes/thesis_renderer.py) and a separate 3-tier scale hard-coded in the
# dashboard hero (>=70 Healthy / >=40 At watch). A BES of 62 was therefore
# labelled "เฝ้าระวัง" by the headline and "สุขภาพดี" by the methodology box
# further down the SAME page, and the exported thesis agreed with the second.
BRAND_HEALTH_TIERS = [
    {"min": 80, "label": "Champion", "label_th": "ผู้นำตลาด",
     "note": "Top of mind · สร้าง defensive moat ได้"},
    {"min": 65, "label": "Strong", "label_th": "แข็งแกร่ง",
     "note": "แบรนด์มี loyalty + identity ชัด"},
    {"min": 50, "label": "Healthy", "label_th": "สุขภาพดี",
     "note": "มี base ดี · ต้องปั้น edge เพิ่ม"},
    {"min": 35, "label": "At Watch", "label_th": "เฝ้าระวัง",
     "note": "สัญญาณอ่อนใน 1-2 มิติ ต้องลงมือ"},
    {"min": 0, "label": "At Risk", "label_th": "เสี่ยง",
     "note": "หลุดจากใจลูกค้าเร็ว · ต้อง reposition"},
]


def brand_health_tier(score: Optional[float]) -> Optional[dict]:
    if score is None:
        return None
    v = float(score)
    for t in BRAND_HEALTH_TIERS:
        if v >= t["min"]:
            return dict(t)
    return dict(BRAND_HEALTH_TIERS[-1])


# Bump when the SCORING or the generated thesis TEXT changes meaning, so cached
# artefacts built from superseded numbers are treated as a miss and regenerated.
# v1 (2026-08, audit): reliability now computed and reported; unaided brand
#   mentions counted deterministically (Awareness no longer swings 30-51 points
#   on whether the AI pass ran); dead dimension weights removed; identity ceiling
#   fixed; reverse coding; sample SD; the thesis chapters stopped asserting an
#   untested Cronbach's alpha and stopped misattributing POMP / brand personality.
# A thesis cached before this is a different document about different numbers.
BE_ANALYSIS_SCHEMA_VERSION = 1

DIMENSIONS = ["awareness", "quality", "identity", "loyalty"]
DIM_LABELS = {
    "awareness": "Brand Awareness",
    "quality": "Perceived Quality",
    "identity": "Brand Identity vs Image",
    "loyalty": "Brand Loyalty",
}
DIM_COLORS = {
    "awareness": "#1B75BC",
    "quality": "#D4A017",
    "identity": "#C8102E",
    "loyalty": "#10B981",
}

QUESTION_TYPES = [
    "open_short", "open_long", "likert_5", "likert_7", "nps_0_10",
    "mcq_single", "mcq_multi", "ranking", "comparative_7", "trait_grid",
]

# Base question templates (will be customized with brand/competitor names)
TEMPLATE_LIB = {
    "awareness": [
        {"id": "AW-1", "type": "open_short", "kind": "unaided_top_of_mind",
         "prompt_t": "เมื่อพูดถึง {category} แบรนด์แรกที่นึกถึงคืออะไร?",
         "required": True, "ai_processing": "extract_brand"},
        {"id": "AW-2", "type": "open_long", "kind": "unaided_recall",
         "prompt_t": "นอกจากแบรนด์ข้างต้น คุณนึกถึงแบรนด์ {category} อะไรอีกบ้าง?",
         "required": True, "ai_processing": "extract_brands"},
        {"id": "AW-3", "type": "mcq_multi", "kind": "aided_recognition",
         "prompt_t": "แบรนด์ใดต่อไปนี้ที่คุณรู้จัก? (เลือกได้หลายข้อ)",
         "options_t": "brand_list", "required": True},
        {"id": "AW-4", "type": "likert_5", "kind": "brand_familiarity",
         "prompt_t": "คุณรู้จัก {brand} ในระดับใด?",
         "scale": ["ไม่เคยได้ยิน", "เคยได้ยิน", "พอรู้จัก", "รู้จักดี", "รู้จักดีมาก"],
         "required": True},
    ],
    "quality": [
        {"id": "PQ-1", "type": "likert_7", "kind": "overall_quality",
         "prompt_t": "โดยรวม {brand} มีคุณภาพระดับใด?",
         "scale": ["แย่มาก", "แย่", "ค่อนข้างแย่", "ปานกลาง", "ค่อนข้างดี", "ดี", "ดีมาก"],
         "required": True},
        {"id": "PQ-2", "type": "likert_7", "kind": "attribute_reliability",
         "prompt_t": "{brand} ไว้ใจได้ ทำงานได้ตามที่คาดหวัง",
         "required": True},
        {"id": "PQ-3", "type": "likert_7", "kind": "attribute_value",
         "prompt_t": "{brand} คุ้มค่ากับราคาที่จ่าย",
         "required": True},
        {"id": "PQ-4", "type": "likert_7", "kind": "attribute_design",
         "prompt_t": "{brand} ดูดี / มีดีไซน์ที่ถูกใจ",
         "required": False},
        {"id": "PQ-5", "type": "comparative_7", "kind": "brand_vs_competitor",
         "prompt_t": "เทียบ {brand} กับ {competitor} คุณคิดว่า...",
         "scale_left": "{brand} ดีกว่ามาก", "scale_right": "{competitor} ดีกว่ามาก",
         "required": True},
        {"id": "PQ-6", "type": "open_long", "kind": "quality_reasons",
         "prompt_t": "อะไรทำให้คุณรู้สึกว่า {brand} มีคุณภาพดี / ไม่ดี?",
         "required": False, "ai_processing": "theme_extraction"},
    ],
    "identity": [
        {"id": "BI-1", "type": "trait_grid", "kind": "image_traits_aided",
         "prompt_t": "เลือก 3-5 ข้อที่อธิบาย {brand} ได้ดีที่สุด",
         "options_t": "trait_list", "required": True, "min": 3, "max": 5},
        {"id": "BI-2", "type": "open_long", "kind": "image_personality",
         "prompt_t": "ถ้า {brand} เป็นคน คุณจะอธิบายว่าเป็นคนแบบไหน?",
         "required": True, "ai_processing": "extract_personality"},
        {"id": "BI-3", "type": "open_short", "kind": "image_one_word",
         "prompt_t": "อธิบาย {brand} ในคำเดียว",
         "required": True, "ai_processing": "word_cloud"},
        {"id": "BI-4", "type": "likert_5", "kind": "brand_promise_match",
         "prompt_t": "{brand} ทำตามสัญญาที่ให้ไว้: \"{brand_promise}\"",
         "required": True},

        # === Brand Association · Aaker 4 perspectives ===
        # Brand as Organization (corporate trust, values, responsibility)
        {"id": "ASO-1", "type": "open_short", "kind": "as_org_unaided",
         "perspective": "as_organization",
         "prompt_t": "เมื่อนึกถึง {brand} ในฐานะองค์กร / บริษัท คำหรือคุณค่าอะไรที่นึกถึงเป็นอย่างแรก?",
         "help": "เช่น น่าเชื่อถือ · นวัตกรรม · ใส่ใจสังคม · เก่าแก่ · ท้องถิ่น",
         "required": True, "ai_processing": "word_cloud"},
        {"id": "ASO-2", "type": "likert_7", "kind": "as_org_trust",
         "perspective": "as_organization", "axis_label": "Trustworthy",
         "prompt_t": "{brand} เป็นองค์กรที่น่าเชื่อถือและซื่อสัตย์", "required": True},
        {"id": "ASO-3", "type": "likert_7", "kind": "as_org_innovation",
         "perspective": "as_organization", "axis_label": "Innovative",
         "prompt_t": "{brand} เป็นองค์กรที่มีนวัตกรรม / ทันสมัย", "required": True},
        {"id": "ASO-4", "type": "likert_7", "kind": "as_org_responsibility",
         "perspective": "as_organization", "axis_label": "Responsible",
         "prompt_t": "{brand} ใส่ใจสังคม / สิ่งแวดล้อม / พนักงาน", "required": False},

        # Brand as Person (personality / archetype, Aaker BPS-inspired)
        {"id": "ASP-1", "type": "trait_grid", "kind": "as_person_personality",
         "perspective": "as_person", "options_t": "personality_traits",
         "prompt_t": "ถ้า {brand} เป็นคน · เลือกบุคลิกที่ตรงที่สุด 2-4 ข้อ",
         "required": True, "min": 2, "max": 4},
        {"id": "ASP-2", "type": "likert_7", "kind": "as_person_relatable",
         "perspective": "as_person", "axis_label": "Relatable",
         "prompt_t": "{brand} เป็นเหมือนเพื่อนหรือคนใกล้ตัวของคุณ", "required": False},
        {"id": "ASP-3", "type": "likert_7", "kind": "as_person_aspirational",
         "perspective": "as_person", "axis_label": "Aspirational",
         "prompt_t": "{brand} เป็นเหมือนคนที่คุณอยากเป็น / ชื่นชม", "required": False},

        # Brand as Symbol (icon, colors, slogan recall)
        {"id": "ASS-1", "type": "open_short", "kind": "as_symbol_unaided",
         "perspective": "as_symbol",
         "prompt_t": "อะไรคือ logo / สี / สโลแกน / สัญลักษณ์ของ {brand} ที่คุณจำได้?",
         "required": False, "ai_processing": "word_cloud"},
        {"id": "ASS-2", "type": "likert_7", "kind": "as_symbol_recognizability",
         "perspective": "as_symbol", "axis_label": "Iconic",
         "prompt_t": "ฉันจำสัญลักษณ์ / ดีไซน์ของ {brand} ได้ทันที", "required": True},
        {"id": "ASS-3", "type": "likert_7", "kind": "as_symbol_distinctive",
         "perspective": "as_symbol", "axis_label": "Distinctive",
         "prompt_t": "{brand} ดูแตกต่างจากคู่แข่งอย่างชัดเจน (visual / สโลแกน / ดีไซน์)", "required": True},

        # Brand as Product (functional attributes — extends PQ but uniquely framed)
        {"id": "ASD-1", "type": "likert_7", "kind": "as_product_quality",
         "perspective": "as_product", "axis_label": "High-quality",
         "prompt_t": "{brand} เป็นสินค้า / บริการที่มีคุณภาพสูง", "required": True},
        {"id": "ASD-2", "type": "likert_7", "kind": "as_product_variety",
         "perspective": "as_product", "axis_label": "Diverse-offerings",
         "prompt_t": "{brand} มี product line / เมนู / option ให้เลือกหลากหลาย", "required": False},
        {"id": "ASD-3", "type": "likert_7", "kind": "as_product_premium",
         "perspective": "as_product", "axis_label": "Premium",
         "prompt_t": "{brand} เป็นแบรนด์ระดับ premium / ดูแพง", "required": True},

        # === Competitor parallel attributes (for radar overlay & perceptual map) ===
        {"id": "COMP-1", "type": "likert_7", "kind": "competitor_quality",
         "perspective": "competitor", "axis_label": "High-quality", "compare_brand": "competitor",
         "prompt_t": "{competitor} เป็นแบรนด์ที่มีคุณภาพสูง", "required": False},
        {"id": "COMP-2", "type": "likert_7", "kind": "competitor_premium",
         "perspective": "competitor", "axis_label": "Premium", "compare_brand": "competitor",
         "prompt_t": "{competitor} เป็นแบรนด์ระดับ premium / ดูแพง", "required": False},
        {"id": "COMP-3", "type": "likert_7", "kind": "competitor_innovation",
         "perspective": "competitor", "axis_label": "Innovative", "compare_brand": "competitor",
         "prompt_t": "{competitor} เป็นแบรนด์ที่มีนวัตกรรม / ทันสมัย", "required": False},
        {"id": "COMP-4", "type": "likert_7", "kind": "competitor_trust",
         "perspective": "competitor", "axis_label": "Trustworthy", "compare_brand": "competitor",
         "prompt_t": "{competitor} เป็นองค์กรที่น่าเชื่อถือและซื่อสัตย์", "required": False},
        {"id": "COMP-5", "type": "likert_7", "kind": "competitor_iconic",
         "perspective": "competitor", "axis_label": "Iconic", "compare_brand": "competitor",
         "prompt_t": "ฉันจำสัญลักษณ์ / ดีไซน์ของ {competitor} ได้ทันที", "required": False},

        # === Visual Identity Tests (only generated if brand uploaded matching assets) ===
        {"id": "VIS-1", "type": "open_short", "kind": "logo_unaided",
         "perspective": "as_symbol",
         "requires_asset": "logo",
         "prompt_t": "เห็นโลโก้นี้แล้ว คุณนึกถึงแบรนด์อะไร?",
         "required": False, "ai_processing": "extract_brand"},
        {"id": "VIS-2", "type": "mcq_single", "kind": "logo_aided",
         "perspective": "as_symbol",
         "requires_asset": "logo", "options_t": "brand_list",
         "prompt_t": "นี่คือโลโก้ของแบรนด์ใด?",
         "required": False},
        {"id": "VIS-3", "type": "open_long", "kind": "logo_association",
         "perspective": "as_symbol",
         "requires_asset": "logo",
         "prompt_t": "เห็นโลโก้นี้แล้วคิดถึงอะไร? / รู้สึกอย่างไร?",
         "help": "เช่น คุ้นเคย · เก๋ · เป็นมิตร · ทันสมัย · ไม่รู้สึกอะไร",
         "required": False, "ai_processing": "theme_extraction"},
        {"id": "VIS-4", "type": "open_short", "kind": "color_recall",
         "perspective": "as_symbol",
         "requires_palette": True,
         "prompt_t": "เห็นชุดสีนี้แล้วนึกถึงแบรนด์ใด?",
         "required": False, "ai_processing": "extract_brand"},
    ],
    "loyalty": [
        {"id": "LY-1", "type": "nps_0_10", "kind": "nps",
         "prompt_t": "คุณจะแนะนำ {brand} ให้เพื่อน/ครอบครัว?",
         "help": "0 = ไม่แน่นอน · 10 = แนะนำแน่นอน", "required": True},
        {"id": "LY-2", "type": "likert_7", "kind": "repeat_intent",
         "prompt_t": "ครั้งหน้าหากต้องซื้อ {category} อีก คุณจะเลือก {brand} แน่นอน",
         "required": True},
        {"id": "LY-3", "type": "likert_7", "kind": "switching_resistance",
         "prompt_t": "ถ้าคู่แข่งลดราคา 20% คุณจะยังเลือก {brand}",
         "required": True},
        {"id": "LY-4", "type": "open_long", "kind": "reason_to_stay",
         "prompt_t": "ทำไมคุณยังคงเลือก {brand}?",
         "required": False, "ai_processing": "theme_extraction"},
    ],
}

# EN translation map — keyed by template id. Prompts are the user-facing TH→EN.
PROMPT_EN = {
    "AW-1": "When you think of {category}, which brand comes to mind first?",
    "AW-2": "Besides those, what other {category} brands can you recall?",
    "AW-3": "Which of the following brands have you heard of? (select all that apply)",
    "AW-4": "How well do you know {brand}?",
    "PQ-1": "Overall, how would you rate {brand}'s quality?",
    "PQ-2": "{brand} is reliable and performs as expected",
    "PQ-3": "{brand} offers good value for money",
    "PQ-4": "{brand} has good design / aesthetics",
    "PQ-5": "Comparing {brand} with {competitor}, you think...",
    "PQ-6": "What makes you feel that {brand} has good or poor quality?",
    "BI-1": "Pick 3-5 traits that best describe {brand}",
    "BI-2": "If {brand} were a person, how would you describe them?",
    "BI-3": "Describe {brand} in one word",
    "BI-4": '{brand} delivers on its promise: "{brand_promise}"',
    "ASO-1": "When you think of {brand} as an organization / company, what value or word comes first?",
    "ASO-2": "{brand} is a trustworthy and honest organization",
    "ASO-3": "{brand} is an innovative / modern organization",
    "ASO-4": "{brand} cares about society / environment / employees",
    "ASP-1": "If {brand} were a person, choose 2-4 personality traits that fit",
    "ASP-2": "{brand} feels like a friend or someone close to you",
    "ASP-3": "{brand} feels like someone you aspire to be / admire",
    "ASS-1": "What logo / color / slogan / symbol of {brand} do you remember?",
    "ASS-2": "I can instantly recognize the symbol / design of {brand}",
    "ASS-3": "{brand} looks clearly different from competitors (visual / slogan / design)",
    "ASD-1": "{brand} is a high-quality product / service",
    "ASD-2": "{brand} offers a diverse product line / menu / options",
    "ASD-3": "{brand} is a premium / high-end brand",
    "COMP-1": "{competitor} is a high-quality brand",
    "COMP-2": "{competitor} is a premium / high-end brand",
    "COMP-3": "{competitor} is an innovative / modern brand",
    "COMP-4": "{competitor} is a trustworthy and honest organization",
    "COMP-5": "I can instantly recognize the symbol / design of {competitor}",
    "LY-1": "How likely are you to recommend {brand} to a friend or family? (0-10)",
    "LY-2": "I will keep using {brand} in the future",
    "LY-3": "If a competitor offered a 20% discount, I would still stick with {brand}",
    "LY-4": "Why do you stay with {brand}? (or why might you switch?)",
    # Visual identity tests (NEW)
    "VIS-1": "What brand do you think of when you see this logo?",
    "VIS-2": "Whose logo is this?",
    "VIS-3": "What does this logo make you think of? How does it feel?",
    "VIS-4": "What brand do you associate with these colors?",
}

HELP_EN = {
    "ASO-1": "e.g. trustworthy · innovative · socially-conscious · heritage · local",
    "VIS-3": "Open thoughts — brand recall, mood, feelings, associations…",
}

SCALE_EN = {
    "AW-4": ["Never heard", "Heard of", "Somewhat know", "Know well", "Know very well"],
    "PQ-1": ["Very poor", "Poor", "Below avg", "Average", "Above avg", "Good", "Excellent"],
}

SCALE_LR_EN = {
    "PQ-5": ("{brand} is much better", "{competitor} is much better"),
}


# Aaker Brand Personality Scale (BPS) — 5 facets
PERSONALITY_TRAIT_POOL = [
    # Sincerity
    "Honest", "Wholesome", "Down-to-earth", "Cheerful",
    # Excitement
    "Daring", "Spirited", "Imaginative", "Up-to-date",
    # Competence
    "Reliable", "Intelligent", "Successful",
    # Sophistication
    "Upper-class", "Charming", "Glamorous",
    # Ruggedness
    "Outdoorsy", "Tough", "Rugged",
]

# Thai translations (1:1 with PERSONALITY_TRAIT_POOL — hard-coded since pool is finite)
PERSONALITY_TRAIT_POOL_TH = [
    "ซื่อสัตย์", "อบอุ่น/แท้จริง", "ติดดิน", "ร่าเริง",
    "กล้า", "มีชีวิตชีวา", "ช่างจินตนาการ", "ทันสมัย",
    "ไว้ใจได้", "ฉลาด", "ประสบความสำเร็จ",
    "หรูหรา", "มีเสน่ห์", "เก๋ไก๋",
    "รักธรรมชาติ", "แกร่ง", "ลุย/ทรหด",
]


# Default trait pool (Aaker's 5-archetype + custom-friendly)
DEFAULT_TRAIT_POOL = [
    "Modern", "Classic", "Trustworthy", "Innovative", "Friendly", "Premium",
    "Affordable", "Exciting", "Reliable", "Sophisticated", "Bold", "Fun",
    "Professional", "Caring", "Energetic", "Calm", "Authentic", "Edgy",
    "Down-to-earth", "Aspirational", "Tech-savvy", "Traditional", "Playful", "Serious",
]

# Thai translations (1:1 with DEFAULT_TRAIT_POOL)
DEFAULT_TRAIT_POOL_TH = [
    "ทันสมัย", "คลาสสิก", "น่าเชื่อถือ", "นวัตกรรม", "เป็นกันเอง", "พรีเมี่ยม",
    "ราคาเข้าถึงได้", "ตื่นเต้น", "ไว้ใจได้", "หรูดูดี", "กล้าหาญ", "สนุก",
    "มืออาชีพ", "ใส่ใจ", "มีพลัง", "สงบ/นิ่ง", "แท้จริง/จริงใจ", "เท่/แตกต่าง",
    "ติดดิน", "มีแรงบันดาลใจ", "ล้ำเทคโนโลยี", "ดั้งเดิม", "ขี้เล่น", "จริงจัง",
]

# Lookup helpers — one source of truth for any future code that needs trait→TH
TRAIT_TH_MAP = dict(zip(DEFAULT_TRAIT_POOL, DEFAULT_TRAIT_POOL_TH))
TRAIT_TH_MAP.update(dict(zip(PERSONALITY_TRAIT_POOL, PERSONALITY_TRAIT_POOL_TH)))


# ============ MODELS ============

class BrandSetup(BaseModel):
    name: str
    logo_url: Optional[str] = None
    category: str = "ทั่วไป"
    competitors: List[str] = []
    industry_context: Optional[str] = None
    custom_quality_attributes: List[str] = []  # extra Likert-7 attributes per brand
    custom_quality_attributes_en: List[str] = []  # auto-translated EN versions (parallel index)
    # Parallel index: True marks a NEGATIVELY worded attribute ("แพงเกินไป"),
    # where agreement means LESS quality and the item must be reverse-scored.
    # Free text carries no polarity, so anything left undeclared is treated as
    # polarity-unknown and kept out of the aggregate scores rather than being
    # silently counted as a virtue.
    custom_quality_attributes_reverse: List[bool] = []


class VisualAsset(BaseModel):
    kind: str = "design"  # logo | palette | design | ad | other
    image_base64: str  # raw base64, no data: prefix
    mime_type: str = "image/png"  # image/png | image/jpeg | image/webp
    note: Optional[str] = None


class IdentitySetup(BaseModel):
    traits: List[str] = []
    description: Optional[str] = None  # free-form: what the brand wants to be
    visual_assets: List[VisualAsset] = []  # uploaded images (logo, palette, design, etc.)
    brand_promise: Optional[str] = None
    pricing_tier: Optional[str] = "mid"  # budget | mid | premium | luxury
    archetype: Optional[str] = None
    # AI-derived (computed from description + visual_assets)
    derived_traits: List[str] = []
    visual_palette: List[str] = []  # hex colors
    visual_keywords: List[str] = []
    ai_summary: Optional[str] = None


class StudyCreate(BaseModel):
    brand: BrandSetup
    identity: IdentitySetup
    segments_to_capture: List[str] = ["age", "gender"]
    target_responses: int = 100


class StudyUpdate(BaseModel):
    brand: Optional[BrandSetup] = None
    identity: Optional[IdentitySetup] = None
    questions: Optional[List[Dict[str, Any]]] = None
    segments_to_capture: Optional[List[str]] = None
    target_responses: Optional[int] = None
    status: Optional[str] = None  # draft | collecting | analyzing | completed | closed
    weights: Optional[Dict[str, int]] = None
    is_public_showcase: Optional[bool] = None  # owner toggle for read-only public dashboard view


class ResponseSubmit(BaseModel):
    demographics: Dict[str, Any] = {}
    answers: List[Dict[str, Any]]  # [{question_id, value}]
    duration_sec: Optional[int] = 0


# ============ HELPERS ============

def _now_iso():
    return datetime.now(timezone.utc).isoformat()


# ============ FILTER HELPERS (time + segment) ============

def _parse_segments_param(segments: Optional[str]) -> Dict[str, List[str]]:
    """Parse `segments` query param (URL-encoded JSON) into {field: [values]}.
    Returns empty dict on parse error / empty input."""
    if not segments:
        return {}
    try:
        raw = json.loads(segments)
        if not isinstance(raw, dict):
            return {}
        return {
            str(k): [str(v) for v in (vs or []) if v not in (None, "")]
            for k, vs in raw.items()
            if vs
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}


def _wave_bounds(wave_history: List[dict], wave_param: Optional[str]) -> tuple:
    """Translate a `wave` query param into ISO time bounds.

    Returns (from_iso, to_iso, label) where any may be None for open-ended.

    `wave_param` values:
      - None / "all"     → no bounds (pool every wave; full longitudinal view)
      - "latest"         → from the most recent wave_history.published_at, no upper bound
      - "<N>" (1-based)  → from waves[N-1].published_at to waves[N].published_at
                           (or no upper bound if N is the latest)

    Falls back to (None, None, "all") if wave_history is empty/missing.
    """
    wh = sorted(
        [w for w in (wave_history or []) if w and w.get("published_at")],
        key=lambda x: x.get("published_at") or "",
    )
    if not wh or wave_param in (None, "", "all"):
        return (None, None, "all")
    if wave_param == "latest":
        return (wh[-1].get("published_at"), None, f"wave {wh[-1].get('wave')}")
    try:
        n = int(wave_param)
    except (TypeError, ValueError):
        return (None, None, "all")
    # Index n is 1-based — find matching wave entry
    target = next((w for w in wh if int(w.get("wave", 0)) == n), None)
    if not target:
        return (None, None, "all")
    from_iso = target.get("published_at")
    # Upper bound = next wave's published_at, or open-ended if last
    idx = wh.index(target)
    to_iso = wh[idx + 1].get("published_at") if idx + 1 < len(wh) else None
    return (from_iso, to_iso, f"wave {n}")


def _apply_response_filter(
    responses: List[dict],
    from_iso: Optional[str] = None,
    to_iso: Optional[str] = None,
    segments: Optional[Dict[str, List[str]]] = None,
) -> List[dict]:
    """Filter a list of brand_responses by time + demographic segments.
    `submitted_at` is ISO-8601 UTC string → lexicographic compare is valid.
    Multiple segment fields combine AND; values within a field combine OR.
    """
    out = responses
    if from_iso:
        out = [r for r in out if (r.get("submitted_at") or "") >= from_iso]
    if to_iso:
        out = [r for r in out if (r.get("submitted_at") or "") <= to_iso]
    if segments:
        for field, allowed in segments.items():
            if not allowed:
                continue
            allowed_set = set(allowed)
            out = [
                r for r in out
                if str((r.get("demographics") or {}).get(field, "")) in allowed_set
            ]
    return out


def _segments_available(responses: List[dict], capture: List[str]) -> Dict[str, List[str]]:
    """Auto-derive distinct segment values from all responses for each captured field.
    Sorted alphabetically per field. Used by frontend to build chip selectors."""
    out: Dict[str, set] = {k: set() for k in (capture or [])}
    for r in responses:
        demo = r.get("demographics") or {}
        for k in out.keys():
            v = demo.get(k)
            if v not in (None, ""):
                out[k].add(str(v))
    return {k: sorted(list(vs)) for k, vs in out.items()}


def _filter_signature(
    from_iso: Optional[str],
    to_iso: Optional[str],
    segments: Optional[Dict[str, List[str]]],
) -> str:
    """Stable short hash used as a key in `ai_cache_by_filter`.
    Empty filter → constant 'all' so the unfiltered AI cache stays at the
    canonical `ai_cache.*` path (backward compatible)."""
    seg_norm: Dict[str, List[str]] = {
        k: sorted(set(str(x) for x in (v or []))) for k, v in (segments or {}).items() if v
    }
    if not from_iso and not to_iso and not seg_norm:
        return "all"
    payload = json.dumps(
        {"from": from_iso or "", "to": to_iso or "", "seg": seg_norm},
        sort_keys=True, ensure_ascii=False,
    )
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def _resolve_ai_cache(study: dict, sig: str) -> dict:
    """Return the AI cache for this filter signature. `all` reads top-level
    `ai_cache`; other signatures read `ai_cache_by_filter.<sig>`."""
    if sig == "all":
        return study.get("ai_cache") or {}
    return ((study.get("ai_cache_by_filter") or {}).get(sig)) or {}


def _slugify_slot(s: str) -> str:
    """ASCII-safe slot suffix used in deterministic question ids.

    Lowercased, alphanumerics + hyphen kept, anything else collapsed to '_'.
    Keeps Thai-language competitor names usable inside ids by hashing them
    short (8-char md5) when they are not ASCII-clean.
    """
    if not s:
        return "self"
    base = s.strip()
    safe = re.sub(r"[^A-Za-z0-9-]+", "_", base).strip("_")
    if not safe:
        # Thai / unicode competitor name → use a stable short hash
        import hashlib as _h
        safe = _h.md5(base.encode("utf-8")).hexdigest()[:8]
    return safe.lower()[:32]


def _question_slot_key(q: dict) -> tuple:
    """Identity for a semantic 'slot' — same across regenerates as long as
    the same template + competitor variant is in use. Used to inherit ids
    and accumulate legacy_ids when republishing."""
    return (
        q.get("template_id") or q.get("id", "").split("--")[0],
        (q.get("compare_brand") or "").strip().lower(),
        q.get("dimension") or "",
    )


def _merge_questions_preserving_history(
    old_questions: List[dict], new_questions: List[dict],
) -> List[dict]:
    """For each NEW question, find any OLD question(s) with the same slot key.

       Strategy (academically defensible + migration-friendly):

       * If the OLD id is already in the modern stable form (`--` separator)
         AND the wording/scale/type didn't change, reuse the old id verbatim
         (no spurious wave bump). Existing legacy_ids carried over.
       * Otherwise (old id was random-suffix from the legacy scheme, OR the
         question wording was rewritten on regenerate): keep the NEW
         deterministic id and stash the old id into `legacy_ids` so the
         aggregator still pools old responses under the new question.
         `wave` bumps by 1 when the wording/scale actually changed, else
         stays the same — migration-only id swaps should not look like a
         new survey wave to the researcher.

       If no slot match exists at all (entirely new question), wave starts
       at 1 with empty legacy_ids — same as a fresh study.
    """
    old_by_slot: Dict[tuple, List[dict]] = {}
    for oq in (old_questions or []):
        old_by_slot.setdefault(_question_slot_key(oq), []).append(oq)

    for nq in new_questions:
        slot = _question_slot_key(nq)
        olds = old_by_slot.get(slot, [])
        if not olds:
            nq.setdefault("wave", 1)
            nq.setdefault("legacy_ids", [])
            continue
        oq = olds[0]  # only one expected per slot
        prev_legacy = list(oq.get("legacy_ids") or [])
        same_shape = (
            oq.get("prompt_th") == nq.get("prompt_th")
            and oq.get("scale") == nq.get("scale")
            and oq.get("type") == nq.get("type")
        )
        old_id = oq.get("id") or ""
        old_id_is_stable = "--" in old_id  # legacy random ids never contain '--'

        if same_shape and old_id_is_stable:
            # Identical question + already-modern id — fully reuse.
            nq["id"] = old_id
            nq["slot_key"] = nq.get("slot_key") or oq.get("slot_key") or old_id
            nq["wave"] = oq.get("wave", 1)
            nq["legacy_ids"] = prev_legacy
        else:
            # Either the wording/scale changed, or we're migrating a legacy
            # random-id question to the modern stable scheme.
            extra = []
            if old_id and old_id != nq["id"] and old_id not in prev_legacy:
                extra.append(old_id)
            nq["legacy_ids"] = prev_legacy + extra
            if same_shape:
                # Migration-only swap: keep the prior wave number — no
                # research-significant change happened.
                nq["wave"] = oq.get("wave", 1)
            else:
                nq["wave"] = (oq.get("wave", 1) or 1) + 1
                if oq.get("prompt_th") and oq.get("prompt_th") != nq.get("prompt_th"):
                    nq["prev_prompt_th"] = oq.get("prompt_th")
    return new_questions


def _generate_questions_from_template(brand_setup: BrandSetup, identity: IdentitySetup) -> List[dict]:
    """Generate question objects from template, filling in brand/competitors/etc."""
    questions = []
    # Use ALL competitors the user entered (no longer capped at 2)
    competitors_top = list(brand_setup.competitors or [])
    primary_competitor = competitors_top[0] if competitors_top else "คู่แข่ง"
    brand_list = [brand_setup.name] + (brand_setup.competitors or [])
    # Trait grid options. This used to be `list(set(DEFAULT_TRAIT_POOL + traits))`
    # sliced to [:24], which had two consequences:
    #   1. `set` iteration order over strings is not stable across processes, so
    #      the same study produced a DIFFERENT questionnaire after every server
    #      restart — the instrument was not reproducible;
    #   2. because the brand's own intended traits landed in random positions,
    #      the [:24] truncation could silently drop them — removing from the grid
    #      the very traits the identity-overlap metric then scores against.
    # Intended traits now come FIRST (so truncation can never reach them) and the
    # rest keep the pool's declared order.
    _seen_traits = set()
    trait_pool = []
    for t in list(identity.traits or []) + list(DEFAULT_TRAIT_POOL):
        key = str(t).strip().lower()
        if not key or key in _seen_traits:
            continue
        _seen_traits.add(key)
        trait_pool.append(t)
    # Build matching TH list (preserve order of trait_pool)
    trait_pool_th = [TRAIT_TH_MAP.get(t, t) for t in trait_pool]

    visual_assets = identity.visual_assets or []
    logo_asset = next((a.model_dump() if hasattr(a, "model_dump") else a
                       for a in visual_assets
                       if (a.kind if hasattr(a, "kind") else a.get("kind")) == "logo"), None)
    palette_image_asset = next((a.model_dump() if hasattr(a, "model_dump") else a
                                for a in visual_assets
                                if (a.kind if hasattr(a, "kind") else a.get("kind")) == "palette"), None)
    visual_palette_hex = identity.visual_palette or []

    def fill(text: str, override_competitor: Optional[str] = None) -> str:
        if not text:
            return text
        comp = override_competitor or primary_competitor
        return (text
                .replace("{brand}", brand_setup.name)
                .replace("{category}", brand_setup.category)
                .replace("{competitor}", comp)
                .replace("{brand_promise}", identity.brand_promise or "ที่ตั้งใจไว้"))

    def build(tmpl, dim, override_competitor=None):
        comp = override_competitor or primary_competitor
        prompt_th = fill(tmpl["prompt_t"], comp)
        en_template = PROMPT_EN.get(tmpl["id"])
        prompt_en = fill(en_template, comp) if en_template else prompt_th
        # Deterministic id derived from template_id + competitor variant.
        # CRITICAL: stable IDs across regenerates so old responses keep linking
        # to the right question. Random-suffix ids (the prior scheme) caused
        # responses to orphan whenever questions were regenerated.
        slot_suffix = "self"
        if override_competitor:
            slot_suffix = _slugify_slot(override_competitor)
        slot_id = f"{tmpl['id']}--{slot_suffix}"
        q = {
            "id": slot_id,
            "template_id": tmpl["id"],
            "slot_key": slot_id,           # canonical academic-slot identifier
            "wave": 1,                      # filled in by _merge_questions_preserving_history
            "legacy_ids": [],               # filled in by _merge_questions_preserving_history
            "dimension": dim,
            "type": tmpl["type"],
            "kind": tmpl["kind"],
            "required": tmpl.get("required", False),
            "ai_processing": tmpl.get("ai_processing"),
            "prompt": prompt_th,
            "prompt_th": prompt_th,
            "prompt_en": prompt_en,
        }
        for fld in ("perspective", "axis_label"):
            if fld in tmpl:
                q[fld] = tmpl[fld]
        if tmpl.get("compare_brand") == "competitor":
            q["compare_brand"] = comp
        if "scale" in tmpl:
            q["scale"] = tmpl["scale"]
            if tmpl["id"] in SCALE_EN:
                q["scale_en"] = SCALE_EN[tmpl["id"]]
        if "scale_left" in tmpl:
            q["scale_left"] = fill(tmpl["scale_left"], comp)
            q["scale_right"] = fill(tmpl["scale_right"], comp)
            if tmpl["id"] in SCALE_LR_EN:
                lt, rt = SCALE_LR_EN[tmpl["id"]]
                q["scale_left_en"] = fill(lt, comp)
                q["scale_right_en"] = fill(rt, comp)
        if "help" in tmpl:
            help_th = fill(tmpl["help"], comp)
            q["help"] = help_th
            q["help_th"] = help_th
            q["help_en"] = HELP_EN.get(tmpl["id"], help_th)
        if tmpl.get("options_t") == "brand_list":
            # Use only real brands entered by the user (focal + competitors).
            # Deduplicate while preserving order, strip whitespace, and drop empties.
            seen = set()
            real_brands = []
            for b in brand_list:
                name = (b or "").strip()
                if not name:
                    continue
                key = name.lower()
                if key in seen:
                    continue
                seen.add(key)
                real_brands.append(name)
            q["options"] = real_brands
            q["options_th"] = real_brands  # brand names — no translation
        elif tmpl.get("options_t") == "trait_list":
            q["options"] = trait_pool[:24]
            q["options_th"] = trait_pool_th[:24]
            q["min"] = tmpl.get("min", 1)
            q["max"] = tmpl.get("max", 5)
        elif tmpl.get("options_t") == "personality_traits":
            q["options"] = PERSONALITY_TRAIT_POOL
            q["options_th"] = PERSONALITY_TRAIT_POOL_TH
            q["min"] = tmpl.get("min", 2)
            q["max"] = tmpl.get("max", 4)
        # Comparison group key — used by the Respondent UI to group questions
        # about the same attribute together so users can compare side-by-side.
        # Priority: explicit axis_label → template root id (so paired templates fall in the same bucket)
        q["comparison_group"] = (q.get("axis_label") or tmpl["id"])
        # Attach display image for visual-identity questions
        if tmpl.get("requires_asset") == "logo" and logo_asset:
            q["display_image"] = {
                "kind": "logo",
                "image_base64": logo_asset.get("image_base64"),
                "mime_type": logo_asset.get("mime_type", "image/png"),
            }
        elif tmpl.get("requires_palette"):
            if palette_image_asset:
                q["display_image"] = {
                    "kind": "palette",
                    "image_base64": palette_image_asset.get("image_base64"),
                    "mime_type": palette_image_asset.get("mime_type", "image/png"),
                }
            elif visual_palette_hex:
                q["display_palette"] = visual_palette_hex[:6]
        return q

    for dim, templates in TEMPLATE_LIB.items():
        for tmpl in templates:
            # Visual identity tests: skip if required asset not provided
            if tmpl.get("requires_asset") == "logo" and not logo_asset:
                continue
            if tmpl.get("requires_palette") and not (palette_image_asset or visual_palette_hex):
                continue
            # Competitor templates: emit one per competitor (skip if no competitors).
            # Cap previously was top-2; now uses every competitor the user provided.
            if tmpl.get("compare_brand") == "competitor":
                if not competitors_top:
                    continue
                for comp in competitors_top:
                    questions.append(build(tmpl, dim, override_competitor=comp))
            else:
                questions.append(build(tmpl, dim))

    # === Custom quality attributes (per-brand variation, optional) ===
    import re
    custom_attrs = (brand_setup.custom_quality_attributes or [])[:5]
    custom_attrs_en = (brand_setup.custom_quality_attributes_en or [])
    custom_attrs_rev = (brand_setup.custom_quality_attributes_reverse or [])
    for idx, attr in enumerate(custom_attrs):
        attr_clean = attr.strip()
        if not attr_clean:
            continue
        declared_reverse = bool(custom_attrs_rev[idx]) if idx < len(custom_attrs_rev) else None
        suspected_reverse = _looks_negatively_worded(attr_clean)
        # Use translated EN version if available, else fall back to TH text
        attr_en = (custom_attrs_en[idx] if idx < len(custom_attrs_en) and custom_attrs_en[idx] else attr_clean).strip()
        slug = re.sub(r"[^a-zA-Z0-9]", "", attr_clean).lower() or uuid.uuid4().hex[:4]
        # Brand attribute likert
        q_brand = build({
            "id": f"PQ-CUSTOM-{slug.upper()[:8]}",
            "type": "likert_7",
            "kind": f"attribute_{slug}",
            "perspective": "as_product",
            "axis_label": attr_clean,
            "prompt_t": f"{{brand}} เป็นแบรนด์ที่ {attr_clean}",
            "required": False,
        }, "quality")
        # Override EN prompt with proper translation
        q_brand["prompt_en"] = f"{brand_setup.name} is a brand that is {attr_en}"
        # Polarity. Declared wins; otherwise flag for the researcher to confirm
        # and keep the item out of any aggregate until they do.
        q_brand["reverse_scored"] = bool(declared_reverse) if declared_reverse is not None else False
        q_brand["polarity_declared"] = declared_reverse is not None
        q_brand["polarity_suspected_negative"] = suspected_reverse
        q_brand["score_eligible"] = (declared_reverse is not None) or (not suspected_reverse)
        questions.append(q_brand)
        # Parallel competitor questions — one per competitor (was top-1 only; now full list)
        for comp in competitors_top:
            q_comp = build({
                "id": f"COMP-CUSTOM-{slug.upper()[:8]}",
                "type": "likert_7",
                "kind": f"competitor_{slug}",
                "perspective": "competitor",
                "axis_label": attr_clean,
                "compare_brand": "competitor",
                "prompt_t": f"{{competitor}} เป็นแบรนด์ที่ {attr_clean}",
                "required": False,
            }, "quality", override_competitor=comp)
            q_comp["prompt_en"] = f"{comp} is a brand that is {attr_en}"
            q_comp["reverse_scored"] = bool(declared_reverse) if declared_reverse is not None else False
            q_comp["polarity_declared"] = declared_reverse is not None
            q_comp["polarity_suspected_negative"] = suspected_reverse
            q_comp["score_eligible"] = (declared_reverse is not None) or (not suspected_reverse)
            questions.append(q_comp)

    # === Re-order within each dimension so brand+competitor questions for the same
    # comparison_group are contiguous (brand first, then competitors in user order).
    # Preserves dimension order; questions without a comparison group keep their original slot. ===
    return _group_questions_for_comparison(questions, brand_setup.name, competitors_top)


def _group_questions_for_comparison(questions: List[dict], brand_name: str, competitors: List[str]) -> List[dict]:
    """Re-order questions so that within a dimension, all questions sharing the same
    comparison_group are placed contiguously: brand first, then competitors in input order.
    Questions without `axis_label` (open-ended, trait_grid, etc.) stay in original slot.
    """
    comp_order = {name: i for i, name in enumerate(competitors)}

    def is_groupable(q):
        return bool(q.get("axis_label"))  # only axis-tagged Likert questions group

    def sort_key_within_group(q):
        # brand questions (no compare_brand) sort first; then competitors in input order
        if not q.get("compare_brand"):
            return (0, 0)
        return (1, comp_order.get(q.get("compare_brand"), 99))

    # Group questions by dimension first to preserve dimension order on the survey
    by_dim: Dict[str, List[dict]] = {}
    dim_order: List[str] = []
    for q in questions:
        d = q.get("dimension", "")
        if d not in by_dim:
            by_dim[d] = []
            dim_order.append(d)
        by_dim[d].append(q)

    out: List[dict] = []
    for d in dim_order:
        dim_qs = by_dim[d]
        # Walk through, when we hit an axis-tagged question, gather ALL its group siblings
        consumed = set()
        for i, q in enumerate(dim_qs):
            if i in consumed:
                continue
            if is_groupable(q):
                group_key = q.get("comparison_group") or q.get("axis_label")
                # Pull all siblings (anywhere in this dimension) that share the group
                siblings = [(j, x) for j, x in enumerate(dim_qs)
                            if j not in consumed
                            and is_groupable(x)
                            and (x.get("comparison_group") or x.get("axis_label")) == group_key]
                # Mark consumed
                for j, _ in siblings:
                    consumed.add(j)
                # Sort: brand → competitors in input order
                siblings.sort(key=lambda jx: sort_key_within_group(jx[1]))
                out.extend(x for _, x in siblings)
            else:
                consumed.add(i)
                out.append(q)
    return out


# ============ STATS ENGINE ============

# Markers that make a free-text attribute read as a NEGATIVE statement. Used
# only to raise a flag for the researcher to confirm — never to decide polarity
# automatically, because guessing wrong flips a score silently.
_NEGATIVE_MARKERS_TH = (
    "เกินไป", "ไม่ดี", "ไม่คุ้ม", "ไม่น่า", "ไม่ค่อย", "ไม่มี", "ไม่ได้", "ไม่สะดวก",
    "แพง", "ช้า", "แย่", "ยาก", "ล้าสมัย", "น่าเบื่อ", "ธรรมดา", "ด้อย", "ขาด",
    "เชย", "จำเจ", "ผิดหวัง", "เสีย",
)
_NEGATIVE_MARKERS_EN = (
    "too ", "not ", "hard to", "difficult", "expensive", "overpriced", "slow",
    "poor", "bad", "outdated", "boring", "lacks", "lack of", "cheap-looking",
)


def _norm_brand_token(s: Any) -> str:
    """Casefold a free-text answer for brand matching: drop spaces, punctuation
    and Thai vowel-length variation that respondents type inconsistently."""
    t = str(s or "").strip().lower()
    if not t:
        return ""
    t = re.sub(r"[\s​\-_.,;:!?'\"()\[\]/\\]+", "", t)
    return t


def _deterministic_brand_counts(values: List[Any], brand_list: List[str]) -> Optional[dict]:
    """Count unaided brand mentions WITHOUT the LLM.

    Why this exists
    ---------------
    `_question_signal_100` used to return None for every open-ended question
    until an AI normalisation job had run. Top-of-Mind (weight .40) and Unaided
    Recall (.25) are open-ended, so 65 % of the Awareness weight simply vanished
    and the composite renormalised over what was left. Because unaided recall is
    always lower than aided recognition, dropping it did not merely add noise —
    it INFLATED the score, by up to ~30 points on identical raw data, and the
    inflated version was publishable to the public showcase.

    So we always produce a defensible count from the raw text. A mention is
    attributed to a brand only on an exact normalised match, or when the brand
    token is contained in the answer AND no other brand in the study matches more
    specifically. That last clause is the guard against the previous substring
    behaviour, where a focal brand whose name is a substring of a competitor's
    (or vice versa) could be credited with the competitor's mentions.

    The AI pass still improves on this — it catches misspellings, transliteration
    and nicknames — but it is now an ENHANCEMENT, not the difference between
    having a score and not having one.
    """
    if not values or not brand_list:
        return None
    norm_brands = [(b, _norm_brand_token(b)) for b in brand_list if _norm_brand_token(b)]
    if not norm_brands:
        return None

    counts: Dict[str, int] = {}
    total = 0
    for v in values:
        raw = v if not isinstance(v, list) else " ".join(str(x) for x in v)
        tok = _norm_brand_token(raw)
        if not tok:
            continue
        total += 1
        exact = [b for b, nb in norm_brands if nb == tok]
        if exact:
            counts[exact[0]] = counts.get(exact[0], 0) + 1
            continue
        # Substring fallback — attribute only to the LONGEST matching brand
        # token, and only when that match is unambiguous.
        contained = [(b, nb) for b, nb in norm_brands if nb and nb in tok]
        if contained:
            contained.sort(key=lambda x: len(x[1]), reverse=True)
            longest = len(contained[0][1])
            if sum(1 for _b, nb in contained if len(nb) == longest) == 1:
                counts[contained[0][0]] = counts.get(contained[0][0], 0) + 1

    if not total:
        return None
    return {
        "total": total,
        "counts": [
            {"label": b, "count": c, "pct": round(c / total * 100, 1)}
            for b, c in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        ],
    }


def _looks_negatively_worded(text: str) -> bool:
    """Heuristic only — flags an attribute for human confirmation."""
    t = (text or "").strip().lower()
    if not t:
        return False
    return (any(m in t for m in _NEGATIVE_MARKERS_TH)
            or any(m in t for m in _NEGATIVE_MARKERS_EN))


def _likert_stats(values: List[int], scale_max: int = 7, reverse: bool = False) -> dict:
    """Descriptives for a Likert item.

    `reverse=True` marks a NEGATIVELY worded item ("brand X is overpriced"):
    agreement then means *less* of the construct, so the 0-100 score is flipped.
    Without this, agreeing that a brand is overpriced raised its Perceived
    Quality — the item was scored as if every custom attribute were a virtue.
    """
    if not values:
        return {"n": 0}
    n = len(values)
    mean = sum(values) / n
    sorted_v = sorted(values)
    median = sorted_v[n // 2] if n % 2 else (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2
    # Sample standard deviation (n-1). The population form (÷n) understates
    # dispersion, and this value is exported under an "SD" column in the thesis
    # appendix and handed to the AI writer as `sd=` — both of which mean the
    # sample estimate. At n=8 the difference is ~6.5%.
    var = sum((v - mean) ** 2 for v in values) / (n - 1) if n > 1 else 0.0
    std = var ** 0.5
    # T2B (top-2-box)
    t2b = sum(1 for v in values if v >= scale_max - 1) / n * 100
    b2b = sum(1 for v in values if v <= 2) / n * 100
    nq = (t2b - b2b)
    distribution = [sum(1 for v in values if v == i) for i in range(1, scale_max + 1)]
    # Score normalization: standard psychometric (mean − 1) / (max − 1) × 100 so
    # the lowest scale value maps to 0 and the highest to 100. The legacy formula
    # `mean/max*100` left an arbitrary floor at (1/max)*100 (e.g. 20 for a 1-5
    # likert) which inflated all scores ~20pts on the low end and broke
    # cross-scale comparability. Confirmed correct per Aaker (1996) ch.7,
    # Keller CBBE measurement, and DeVellis (Scale Development, 2017).
    score_100 = (mean - 1) / (scale_max - 1) * 100 if scale_max > 1 else 0
    if reverse and scale_max > 1:
        score_100 = 100.0 - score_100
        t2b, b2b = b2b, t2b        # "top box" now means the favourable end
        nq = t2b - b2b
    # 95% CI for the mean, and for the 0-100 score. Every score in this module
    # used to be reported as a bare point estimate, so a dimension resting on 12
    # respondents looked exactly as firm as one resting on 400.
    ci_low = ci_high = None
    score_ci_low = score_ci_high = None
    if n > 1 and std > 0:
        se = std / (n ** 0.5)
        try:
            from scipy import stats as _st
            crit = float(_st.t.ppf(0.975, n - 1))
        except Exception:
            crit = 1.96
        ci_low, ci_high = mean - crit * se, mean + crit * se
        if scale_max > 1:
            lo = (ci_low - 1) / (scale_max - 1) * 100
            hi = (ci_high - 1) / (scale_max - 1) * 100
            if reverse:
                lo, hi = 100.0 - hi, 100.0 - lo
            score_ci_low, score_ci_high = max(0.0, lo), min(100.0, hi)
    return {
        "n": n, "mean": round(mean, 2), "median": median,
        "std": round(std, 2), "t2b": round(t2b, 1), "b2b": round(b2b, 1),
        "net": round(nq, 1), "distribution": distribution,
        "score_100": round(score_100, 1),
        "reverse_scored": bool(reverse),
        "mean_ci95": [round(ci_low, 2), round(ci_high, 2)] if ci_low is not None else None,
        "score_100_ci95": ([round(score_ci_low, 1), round(score_ci_high, 1)]
                           if score_ci_low is not None else None),
    }


def _nps_stats(values: List[int]) -> dict:
    if not values:
        return {"n": 0, "score": 0, "promoters": 0, "passives": 0, "detractors": 0}
    n = len(values)
    promoters = sum(1 for v in values if v >= 9)
    detractors = sum(1 for v in values if v <= 6)
    passives = n - promoters - detractors
    score = ((promoters - detractors) / n) * 100
    return {
        "n": n,
        "score": round(score, 1),
        "promoters_pct": round(promoters / n * 100, 1),
        "passives_pct": round(passives / n * 100, 1),
        "detractors_pct": round(detractors / n * 100, 1),
        "promoters": promoters, "passives": passives, "detractors": detractors,
        "mean": round(sum(values) / n, 2),
        "score_100": round((score + 100) / 2, 1),  # normalize to 0-100
    }


def _frequency_stats(values: List[Any]) -> dict:
    """Counts for MCQ/text — flatten arrays."""
    flat = []
    for v in values:
        if isinstance(v, list):
            flat.extend(v)
        elif v is not None and v != "":
            flat.append(v)
    counter = Counter(flat)
    total = len(values)
    return {
        "n": total,
        "counts": [{"label": k, "count": v, "pct": round(v / total * 100, 1) if total else 0}
                   for k, v in counter.most_common(20)],
    }


def _comparative_stats(values: List[int]) -> dict:
    """7-pt comparative: 1=brand_left ดีมาก, 4=เท่ากัน, 7=brand_right ดีมาก.

    Convention in this codebase: focal_brand always sits on the LEFT of the scale
    and the competitor (named in `compare_brand`) sits on the RIGHT. So:
      mean = 1 → focal wins fully → score_100 = 100
      mean = 4 → tie               → score_100 = 50
      mean = 7 → competitor wins   → score_100 = 0
    Formula: (7 − mean) / 6 × 100"""
    if not values:
        return {"n": 0}
    n = len(values)
    mean = sum(values) / n
    favor_left = sum(1 for v in values if v <= 3) / n * 100
    favor_right = sum(1 for v in values if v >= 5) / n * 100
    neutral = 100 - favor_left - favor_right
    score_100 = (7 - mean) / 6 * 100
    return {
        "n": n, "mean": round(mean, 2),
        "favor_left_pct": round(favor_left, 1),
        "favor_right_pct": round(favor_right, 1),
        "neutral_pct": round(neutral, 1),
        "score_100": round(max(0.0, min(100.0, score_100)), 1),
    }


def _question_signal_100(
    q: dict, stats: dict, target_brand: str,
    intended_traits: Optional[List[str]] = None,
) -> Optional[float]:
    """Return a 0-100 signal score for ANY question type (not just likert/nps).
    Used by Aaker-aligned dimension scoring so we can include
    aided-recognition, top-of-mind, recall — not only likert/nps.

    `intended_traits` enables trait-grid identity-image alignment scoring
    (e.g. BI-1 "Pick traits describing brand" — score = mean pickup of the
    brand's *intended* traits, the core Aaker identity-image overlap metric).

    Returns None when the question has no usable signal yet."""
    s = stats or {}
    qtype = q.get("type")
    kind = q.get("kind")
    counts = s.get("counts") or []
    n = s.get("n") or 0
    target_lower = (target_brand or "").strip().lower()

    # Direct numeric scales
    if qtype in ("likert_5", "likert_7", "nps_0_10", "comparative_7"):
        return s.get("score_100")

    # ---- Identity trait-grid: avg pickup of brand's *intended* traits ----
    # Score = average % of respondents who picked each intended trait.
    # This is the canonical identity-image overlap metric.
    if qtype == "trait_grid" and kind in ("image_traits_aided", "as_person_personality") and intended_traits:
        if not counts or not n:
            return None
        intended_lower = {t.strip().lower() for t in intended_traits if t}
        if not intended_lower:
            return None

        # Only intended traits that are actually OFFERED in this grid can be
        # picked. Scoring against traits the respondent was never shown is not a
        # measurement of anything — most importantly it is what made
        # `as_person_personality` return a hard 0.0 in essentially every study:
        # that question offers PERSONALITY_TRAIT_POOL, which shares only 2 of its
        # 17 labels with the pool the brand's intended traits are drawn from. A
        # question that cannot express the construct must be EXCLUDED (None), not
        # scored as a failure (0.0) that drags the dimension down.
        options = [str(o).strip().lower() for o in (q.get("options") or []) if o]
        options_th = [str(o).strip().lower() for o in (q.get("options_th") or []) if o]
        offered = set(options) | set(options_th)
        answerable = intended_lower & offered if offered else intended_lower
        if not answerable:
            return None

        matched_pcts = []
        for c in counts:
            label = (c.get("label") or "").strip().lower()
            if label in answerable:
                matched_pcts.append(float(c.get("pct") or 0))
        raw = sum(matched_pcts) / len(answerable)

        # Respondents may tick at most `max` traits, so the raw average pickup has
        # a structural ceiling of max_picks/len(answerable) x 100. Dividing by the
        # trait count alone made the metric unreachable: with 12 intended traits
        # and a 5-pick cap, a brand every respondent recognised perfectly scored
        # 41.7, while the same brand with 3 intended traits scored 100 — the score
        # measured how many traits the student typed into the wizard, not the
        # brand. Normalise by the achievable ceiling so 100 means "every intended
        # trait that could be picked, was picked".
        try:
            max_picks = int(q.get("max") or len(answerable))
        except (TypeError, ValueError):
            max_picks = len(answerable)
        max_picks = max(1, min(max_picks, len(answerable)))
        ceiling = 100.0 * max_picks / len(answerable)
        if ceiling <= 0:
            return None
        return max(0.0, min(100.0, raw / ceiling * 100.0))

    # Brand-mention questions (aided / aided-logo) → % who picked target brand
    if qtype in ("mcq_multi", "mcq_single"):
        if not counts or not n:
            return None
        for c in counts:
            if (c.get("label") or "").strip().lower() == target_lower:
                return float(c.get("pct") or 0)
        return 0.0

    # Generic trait_grid without intended-trait context → not meaningful for scoring
    if qtype == "trait_grid":
        return None

    # Open-ended brand/concept (TOM, recall, logo unaided, color recall) — pull share from AI-normalized counts
    if qtype in ("open_short", "open_long"):
        # word_cloud kinds (image_one_word, as_org_unaided, as_symbol_unaided) emit
        # word counts not brand counts → can't score against a target_brand. Skip them.
        if (q.get("ai_processing") or "") == "word_cloud":
            return None
        # This used to be `if not s.get("ai_normalized"): return None`, which made
        # Top-of-Mind (w .40) and Unaided Recall (w .25) contribute NOTHING until
        # an LLM job had run — 65 % of the Awareness weight, renormalised away in
        # a direction that always raised the score. `_aggregate_responses` now
        # supplies deterministic counts when the AI pass has not run, so a signal
        # always exists; `normalization_basis` records which one produced it.
        if not counts or not n:
            return None
        for c in counts:
            if (c.get("label") or "").strip().lower() == target_lower:
                count = float(c.get("count") or 0)
                pct = float(c.get("pct") or (count / n * 100 if n else 0))
                return min(100.0, pct)
        return 0.0

    return None


# Aaker-aligned weights per dimension. Keys are question `kind` values from TEMPLATE_LIB.
# Reflects the relative importance each signal carries in Aaker's brand-equity model.
# When a kind is missing from a study, weights renormalize over what's present so a
# study with only some signals still produces a defensible composite.
DIMENSION_WEIGHTS: Dict[str, Dict[str, float]] = {
    "awareness": {
        # Aaker's awareness pyramid — TOM is the strongest signal.
        # NOTE: `logo_aided`, `logo_unaided` and `color_recall` used to be listed
        # here with a combined weight of 0.25. They are real questions, but
        # TEMPLATE_LIB files them under the `identity` dimension, and
        # `_compute_dim_composite` only ever looks at questions whose
        # `dimension` equals the dimension being scored — so those 0.25 could
        # never match anything. They were dead entries that made this table read
        # as though visual recognition contributed a quarter of Awareness when
        # it contributed nothing. (If visual recognition SHOULD count toward
        # Awareness — it is defensible under Aaker — the fix is to re-file those
        # questions' `dimension`, not to re-add unreachable weights here.)
        "unaided_top_of_mind": 0.40,
        "unaided_recall":      0.25,
        "aided_recognition":   0.20,
        "brand_familiarity":   0.15,
    },
    "quality": {
        # `as_product_quality` was listed here at 0.05 but is an `identity`
        # question — same dead-entry problem as above. It still carries its
        # legitimate 0.04 weight inside `identity` below.
        "overall_quality":       0.35,
        "attribute_reliability": 0.20,
        "attribute_value":       0.20,
        "brand_vs_competitor":   0.15,
        "attribute_design":      0.10,
    },
    "identity": {
        # Aaker's "brand as ..." 4-perspective framework + identity-image overlap
        "image_traits_aided":       0.20,   # Aaker identity-image overlap (key metric)
        "brand_promise_match":      0.15,   # delivers on intended promise
        "as_org_trust":             0.06,
        "as_org_innovation":        0.06,
        "as_org_responsibility":    0.05,
        "as_person_personality":    0.06,   # trait_grid scored vs intent
        "as_person_relatable":      0.05,
        "as_person_aspirational":   0.06,
        "as_symbol_recognizability":0.06,
        "as_symbol_distinctive":    0.06,
        "as_product_premium":       0.06,
        "as_product_variety":       0.05,
        "as_product_quality":       0.04,
    },
    "loyalty": {
        "nps":                  0.40,
        "repeat_intent":        0.30,
        "switching_resistance": 0.30,
    },
}


def _compute_dim_composite(
    dim: str, out_questions: List[dict], target_brand: str,
    intended_traits: Optional[List[str]] = None,
    identity_alignment: Optional[float] = None,
) -> tuple:
    """Aaker-aligned weighted dimension composite.

    Returns `(score, coverage_meta)` where:
      score: 0-100 weighted composite (or None if no signals at all)
      coverage_meta: {
        'coverage': 0-1.0 (% of expected weight that had data),
        'present_kinds': [list of kind strings that fed the score],
        'missing_kinds': [list of expected kinds with no data],
        'used_fallback': bool (true if non-DIMENSION_WEIGHTS kinds present),
      }

    Each question is scored to 0-100 via `_question_signal_100`, then weighted
    by `DIMENSION_WEIGHTS[dim][kind]`. Weights renormalize over signals that
    are actually present so partial studies still produce a defensible score
    — but the coverage % lets the UI flag "data is incomplete" with a warning.

    For `identity`, `identity_alignment` (from AI cache identity_image, 0-100)
    is mixed in at 10% if available (qualitative open-ended overlap).
    """
    weight_map = DIMENSION_WEIGHTS.get(dim, {})
    expected_weight_total = sum(weight_map.values()) if weight_map else 1.0
    weighted_sum = 0.0
    total_weight = 0.0
    fallback_signals: List[float] = []
    present_kinds: List[str] = []
    used_fallback = False

    # Only kinds that this dim's questions actually carry — i.e. a study that
    # never includes "logo_unaided" shouldn't be penalized for lacking it.
    # We compute coverage relative to the SUBSET of dim weights that the
    # study's questionnaire designed-in. This matches Aaker's "use what you
    # collect" practice rather than the theoretical 1.0.
    designed_kinds = {q.get("kind") for q in out_questions
                      if q.get("dimension") == dim and not q.get("compare_brand")
                      and q.get("kind") in weight_map}
    designed_weight_total = sum(weight_map[k] for k in designed_kinds) if designed_kinds else expected_weight_total

    for q in out_questions:
        if q.get("dimension") != dim:
            continue
        if q.get("compare_brand"):
            continue
        if q.get("score_eligible") is False:
            continue  # polarity unconfirmed — see `_looks_negatively_worded`
        signal = _question_signal_100(
            q, q.get("stats", {}), target_brand,
            intended_traits=intended_traits,
        )
        if signal is None:
            continue
        kind = q.get("kind")
        w = weight_map.get(kind)
        if w is not None and w > 0:
            weighted_sum += signal * w
            total_weight += w
            if kind:
                present_kinds.append(kind)
        else:
            fallback_signals.append(signal)
            used_fallback = True

    if dim == "identity" and identity_alignment is not None:
        align_w = 0.10
        weighted_sum += float(identity_alignment) * align_w
        total_weight += align_w
        present_kinds.append("ai_identity_alignment")
        # The alignment weight has to enter the DENOMINATOR too. It used to be
        # added only to `total_weight`, which inflated coverage — the function
        # reported 1.0 (clamped) while its own `missing_kinds` list was still
        # non-empty, i.e. it claimed complete data for a dimension it knew was
        # incomplete.
        designed_weight_total += align_w

    # Coverage = actual_weight / designed_weight (1.0 = every designed signal had data)
    coverage = (total_weight / designed_weight_total) if designed_weight_total > 0 else 0.0
    coverage = round(min(1.0, max(0.0, coverage)), 3)

    missing_kinds = sorted(designed_kinds - set(present_kinds))

    meta = {
        "coverage": coverage,
        "present_kinds": present_kinds,
        "missing_kinds": missing_kinds,
        "used_fallback": used_fallback,
        "designed_kinds": sorted(designed_kinds),
    }

    if total_weight > 0:
        # No ad-hoc blend. This used to be
        #     score = score * 0.85 + fb_avg * 0.15
        # which handed the *unweighted* questions — the ones deliberately left
        # out of DIMENSION_WEIGHTS because they are descriptive, not scoring
        # signals — a flat 15% of the dimension. That is more than every designed
        # signal in `identity` except one, and the 0.85/0.15 split had no source.
        # Unweighted questions now stay descriptive-only, which is what the
        # methodology page already tells users happens.
        return round(weighted_sum / total_weight, 1), meta
    if fallback_signals:
        # Only when the dimension produced NO weighted signal at all: fall back to
        # the plain mean of whatever is available, so a partially-designed study
        # still shows something rather than a blank.
        return round(sum(fallback_signals) / len(fallback_signals), 1), meta
    return None, meta


def _cronbach_alpha(matrix: List[List[float]]) -> Optional[float]:
    """Cronbach's alpha for a complete-case respondent x item matrix.

        alpha = k/(k-1) * (1 - sum(var_i) / var_total)

    Sample variance (n-1). Returns None when it cannot be estimated.
    """
    if not matrix:
        return None
    k = len(matrix[0])
    n = len(matrix)
    if k < 2 or n < 3:
        return None

    def _var(xs):
        m = sum(xs) / len(xs)
        return sum((x - m) ** 2 for x in xs) / (len(xs) - 1)

    item_vars = [_var([row[j] for row in matrix]) for j in range(k)]
    totals = [sum(row) for row in matrix]
    var_total = _var(totals)
    if var_total <= 0:
        return None
    return (k / (k - 1)) * (1 - sum(item_vars) / var_total)


def _dimension_reliability(study: dict, responses: List[dict]) -> Dict[str, dict]:
    """Per-dimension internal-consistency reliability from the raw item matrix.

    Why this exists
    ---------------
    Nothing in this module used to compute a reliability or validity statistic,
    yet the generated thesis asserted "Cronbach's alpha >= 0.7" as an established
    property of the instrument. That assertion was unfalsifiable *and* wrong to
    make: `_aggregate_responses` collapses answers into per-question buckets and
    never reconstructs the respondent x item matrix, so no covariance between
    items reached any reported number. Two datasets on the same 4-item Perceived
    Quality scale — one loading on a single factor (alpha = 0.93), the other with
    each item column independently shuffled so the items share nothing
    (alpha = -0.02) — produced byte-identical output: same composite, same
    coverage of 1.0, same tier.

    So: compute it from the data that was already in hand, report it honestly,
    and let the caller refuse to claim what has not been shown. A dimension with
    fewer than 2 Likert items has no internal consistency to estimate — that is
    reported as a reason, not as a number.

    References: Cronbach (1951); Nunnally & Bernstein (1994) for the .70
    convention; Churchill (1979) for the scale-development paradigm.
    """
    by_dim_items: Dict[str, List[str]] = {d: [] for d in DIMENSIONS}
    scale_of: Dict[str, int] = {}
    for q in study.get("questions", []) or []:
        if q.get("compare_brand"):
            continue  # competitor items measure a different object
        if q.get("type") not in ("likert_5", "likert_7"):
            continue  # alpha is defined for the multi-item rating scale only
        d = q.get("dimension")
        if d in by_dim_items:
            by_dim_items[d].append(q["id"])
            scale_of[q["id"]] = 5 if q["type"] == "likert_5" else 7

    # respondent -> {question_id: numeric value}
    per_resp: List[Dict[str, float]] = []
    for r in responses:
        row: Dict[str, float] = {}
        for ans in r.get("answers", []) or []:
            qid = ans.get("question_id")
            val = ans.get("value")
            if qid in scale_of and isinstance(val, (int, float)) and not isinstance(val, bool):
                row[qid] = float(val)
        if row:
            per_resp.append(row)

    out: Dict[str, dict] = {}
    for d, qids in by_dim_items.items():
        k = len(qids)
        if k < 2:
            out[d] = {"alpha": None, "k_items": k, "n_complete": 0,
                      "reason": "fewer_than_2_likert_items",
                      "interpretation": "ไม่สามารถประเมินความเที่ยงได้ (มีข้อคำถามมาตรวัดน้อยกว่า 2 ข้อ)"}
            continue
        matrix = [[row[q] for q in qids] for row in per_resp if all(q in row for q in qids)]
        n = len(matrix)
        if n < 30:
            out[d] = {"alpha": None, "k_items": k, "n_complete": n,
                      "reason": "n_below_30",
                      "interpretation": f"ยังประเมินความเที่ยงไม่ได้ — มีผู้ตอบครบทุกข้อเพียง {n} คน (ต้องการ 30 ขึ้นไป)"}
            continue
        a = _cronbach_alpha(matrix)
        if a is None:
            out[d] = {"alpha": None, "k_items": k, "n_complete": n,
                      "reason": "zero_variance",
                      "interpretation": "ยังประเมินความเที่ยงไม่ได้ — คำตอบไม่มีความแปรปรวน"}
            continue
        # Mean inter-item correlation — diagnoses WHY alpha is low (Clark & Watson
        # 1995 recommend .15-.50 for a broad construct).
        cols = [[row[j] for row in matrix] for j in range(k)]
        rs = []
        for x in range(k):
            for y in range(x + 1, k):
                xs, ys = cols[x], cols[y]
                mx, my = sum(xs) / n, sum(ys) / n
                cov = sum((xs[t] - mx) * (ys[t] - my) for t in range(n))
                dx = sum((v - mx) ** 2 for v in xs) ** 0.5
                dy = sum((v - my) ** 2 for v in ys) ** 0.5
                if dx > 0 and dy > 0:
                    rs.append(cov / (dx * dy))
        mean_r = round(sum(rs) / len(rs), 3) if rs else None

        if a >= 0.90:
            label, interp = "excellent", "ความเที่ยงสูงมาก (อาจมีข้อคำถามซ้ำซ้อนกัน)"
        elif a >= 0.80:
            label, interp = "good", "ความเที่ยงดี"
        elif a >= 0.70:
            label, interp = "acceptable", "ความเที่ยงผ่านเกณฑ์ที่ยอมรับได้ (≥ 0.70)"
        elif a >= 0.60:
            label, interp = "questionable", "ความเที่ยงต่ำกว่าเกณฑ์ 0.70 — ควรระมัดระวังในการตีความ"
        else:
            label, interp = "unacceptable", "ความเที่ยงไม่ผ่านเกณฑ์ — ข้อคำถามในมิตินี้อาจไม่ได้วัดสิ่งเดียวกัน"

        out[d] = {
            "alpha": round(a, 3),
            "k_items": k,
            "n_complete": n,
            "mean_inter_item_r": mean_r,
            "meets_threshold": bool(a >= 0.70),
            "label": label,
            "interpretation": interp,
        }
    return out


def _aggregate_responses(study: dict, responses: List[dict], normalized: Optional[Dict[str, dict]] = None) -> dict:
    """Compute stats per question.
    normalized: optional {question_id: {counts: [...], total: N, variants_map: {...}}}
                — if provided, overrides _frequency_stats counts for that question with AI-canonicalized buckets.
    """
    by_q: Dict[str, List] = {}
    for r in responses:
        for ans in r.get("answers", []):
            qid = ans.get("question_id")
            if qid:
                by_q.setdefault(qid, []).append(ans.get("value"))

    questions = study.get("questions", [])
    out_questions = []
    dim_aggregates: Dict[str, List[float]] = {d: [] for d in DIMENSIONS}
    normalized = normalized or {}
    # Focal brand first, then competitors — used by `_deterministic_brand_counts`
    # so an unaided mention can be attributed without waiting for the LLM.
    _bs = study.get("brand") or {}
    _brand_list_for_matching = [_bs.get("name") or ""] + list(_bs.get("competitors") or [])

    for q in questions:
        qid = q["id"]
        # Academic hybrid: also pull values from any legacy_ids (prior waves of
        # the SAME semantic slot, stashed by `_merge_questions_preserving_history`
        # when the question wording was changed on regenerate). This is the
        # standard "stable slot, evolving instrument" pattern used in survey
        # research — responses that targeted the same construct are pooled.
        legacy_ids = q.get("legacy_ids") or []
        if legacy_ids:
            values = list(by_q.get(qid, []))
            for lid in legacy_ids:
                values.extend(by_q.get(lid, []))
        else:
            values = by_q.get(qid, [])
        stats: Dict[str, Any] = {"n": len(values)}

        if q["type"] in ("likert_5", "likert_7"):
            scale_max = 5 if q["type"] == "likert_5" else 7
            numeric = [int(v) for v in values if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit())]
            stats = _likert_stats(numeric, scale_max, reverse=bool(q.get("reverse_scored")))
            if stats.get("score_100") is not None:
                dim_aggregates[q["dimension"]].append(stats["score_100"])
        elif q["type"] == "nps_0_10":
            numeric = [int(v) for v in values if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit())]
            stats = _nps_stats(numeric)
            if stats.get("score_100") is not None:
                dim_aggregates[q["dimension"]].append(stats["score_100"])
        elif q["type"] in ("mcq_single", "mcq_multi", "trait_grid", "open_short"):
            stats = _frequency_stats(values)
            # Override with AI-normalized counts for open-ended brand/concept questions
            if q.get("ai_processing") in ("extract_brand", "extract_brands", "word_cloud") and qid in normalized:
                norm = normalized[qid]
                if norm.get("counts"):
                    stats = {
                        "n": norm.get("total", stats.get("n", 0)),
                        "counts": norm["counts"],
                        "ai_normalized": True,
                        "normalization_basis": "ai",
                    }
            # No AI pass yet → count brand mentions deterministically so the
            # dimension keeps its signal instead of silently renormalising it away.
            if (q.get("ai_processing") in ("extract_brand", "extract_brands")
                    and not stats.get("ai_normalized")):
                det = _deterministic_brand_counts(values, _brand_list_for_matching)
                if det:
                    stats = {
                        "n": det["total"],
                        "counts": det["counts"],
                        "ai_normalized": False,
                        "normalization_basis": "deterministic",
                    }
        elif q["type"] == "open_long":
            # If AI normalized this open_long (e.g., extract_brands), use it; otherwise raw responses
            if q.get("ai_processing") in ("extract_brand", "extract_brands") and qid in normalized:
                norm = normalized[qid]
                stats = {
                    "n": norm.get("total", len(values)),
                    "counts": norm.get("counts", []),
                    "ai_normalized": True,
                    "normalization_basis": "ai",
                    "responses": [v for v in values if v][:10],  # keep sample
                }
            else:
                stats = {"n": len(values), "responses": [v for v in values if v]}
                if q.get("ai_processing") in ("extract_brand", "extract_brands"):
                    det = _deterministic_brand_counts(values, _brand_list_for_matching)
                    if det:
                        stats.update({
                            "n": det["total"],
                            "counts": det["counts"],
                            "ai_normalized": False,
                            "normalization_basis": "deterministic",
                        })
        elif q["type"] == "comparative_7":
            numeric = [int(v) for v in values if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit())]
            stats = _comparative_stats(numeric)

        out_questions.append({
            "id": qid, "dimension": q["dimension"], "type": q["type"],
            "kind": q.get("kind"), "prompt": q.get("prompt"),
            "perspective": q.get("perspective"),
            "axis_label": q.get("axis_label"),
            "compare_brand": q.get("compare_brand"),
            "stats": stats,
        })

    # ============ Aaker-aligned dimension composites ============
    # Each dimension uses kind-aware weighted scoring (see DIMENSION_WEIGHTS).
    # `_compute_dim_composite` renormalizes weights over signals that are present,
    # so studies missing some questions still get a defensible score.
    target_brand = study["brand"]["name"]

    # Identity-Image alignment is computed by the AI pipeline (post-survey) and
    # stored in study.ai_cache.identity_image.alignment_score (0-100). When
    # available, it boosts identity composite at 10% weight.
    identity_alignment = None
    ai_cache_local = study.get("ai_cache") or {}
    ii = ai_cache_local.get("identity_image") or {}
    if isinstance(ii, dict):
        a = ii.get("alignment_score")
        if a is None:
            # Some pipelines emit a 0-1 score under different keys
            a = ii.get("alignment") or ii.get("match_score")
        if isinstance(a, (int, float)):
            identity_alignment = float(a) if a > 1 else float(a) * 100.0

    composite: Dict[str, Optional[float]] = {}
    composite_meta: Dict[str, dict] = {}
    intended_traits = (study.get("identity") or {}).get("traits") or []
    for d in DIMENSIONS:
        score_val, meta = _compute_dim_composite(
            d, out_questions, target_brand,
            intended_traits=intended_traits,
            identity_alignment=(identity_alignment if d == "identity" else None),
        )
        composite[d] = score_val
        composite_meta[d] = meta

    # Overall = weighted mean of dimensions that produced a score.
    weights = study.get("weights") or {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25}
    weighted_total = 0.0
    weight_sum = 0.0
    for d in DIMENSIONS:
        score = composite.get(d)
        if score is None:
            continue
        w = float(weights.get(d, 25))
        weighted_total += float(score) * w
        weight_sum += w
    composite["overall"] = round(weighted_total / weight_sum, 1) if weight_sum > 0 else None

    # Which dimensions actually produced a score. Kept explicitly because the
    # next block coerces `None` to 0 for backward compatibility, and a 0 that
    # means "not measured" is indistinguishable from a 0 that means "measured,
    # scored zero". The public home page read those coerced zeros and named an
    # UNMEASURED dimension as the brand's weakest.
    composite["_measured"] = [d for d in DIMENSIONS if composite.get(d) is not None]

    # Cast missing dims back to 0 for backward-compat with frontends that expect numeric;
    # the dashboard's `v > 0 ? v : '—'` will still render '—' but downstream sorting & exports
    # don't choke on null. Keep `null` only for `overall` so a fully-empty study is identifiable.
    for d in DIMENSIONS:
        if composite.get(d) is None:
            composite[d] = 0

    # Awareness extras
    awareness_extras = {}
    aided_q = next((q for q in out_questions if q.get("kind") == "aided_recognition"), None)
    if aided_q and aided_q["stats"].get("counts"):
        target = study["brand"]["name"]
        target_count = next((c for c in aided_q["stats"]["counts"] if c["label"] == target), None)
        awareness_extras["aided_recognition_pct"] = target_count["pct"] if target_count else 0

    # ========== Brand Association: per-perspective scores ==========
    # Aggregate likert score_100 per perspective for the focal brand only (skip competitor questions)
    perspective_scores: Dict[str, List[float]] = {
        "as_organization": [], "as_person": [], "as_symbol": [], "as_product": [],
    }
    for q in out_questions:
        persp = q.get("perspective")
        # `score_eligible is False` marks a free-text attribute whose polarity the
        # researcher has not confirmed and which reads as negative. Averaging it
        # in either direction would be a guess, so it stays descriptive-only.
        if q.get("score_eligible") is False:
            continue
        if persp in perspective_scores and not q.get("compare_brand"):
            s = q["stats"].get("score_100")
            if s is not None:
                perspective_scores[persp].append(s)
    association = {
        "by_perspective": {
            p: round(sum(v) / len(v), 1) if v else 0
            for p, v in perspective_scores.items()
        },
    }
    pv = [v for v in association["by_perspective"].values() if v]
    association["overall"] = round(sum(pv) / len(pv), 1) if pv else 0

    # ========== Brand Image Radar (focal brand + competitors) ==========
    # Collect axis_label means for the focal brand (from non-competitor questions)
    # and per competitor (from compare_brand questions)
    # Each axis entry carries mean, the POMP 0-100 score and n. The 0-100 value
    # used to be `mean / 7 * 100`, which is the normalisation this module's own
    # `_likert_stats` comment calls broken: it leaves an arbitrary floor at
    # (1/max)x100 and is not comparable across scale lengths. POMP —
    # (mean-1)/(max-1)x100, already computed as `score_100` — is used instead, so
    # the radar and every dimension score are finally on the same scale.
    # `n` is carried because a focal item answered by 100 people and an OPTIONAL
    # competitor item answered by 3 were drawn as equal polygons with no n shown
    # anywhere.
    def _axis_entry(q: dict) -> Optional[dict]:
        st = q.get("stats") or {}
        m = st.get("mean")
        if m is None:
            return None
        score = st.get("score_100")
        if score is None:
            smax = 5 if q.get("type") == "likert_5" else 7
            score = round((m - 1) / (smax - 1) * 100, 1) if smax > 1 else None
        return {"mean": m, "score": score, "n": st.get("n") or 0}

    radar_axes_set = []  # ordered, deduped axis labels
    seen_axis = set()
    brand_axis: Dict[str, dict] = {}  # axis -> {mean, score, n}
    for q in out_questions:
        ax = q.get("axis_label")
        if not ax or q.get("compare_brand"):
            continue
        if ax not in seen_axis:
            seen_axis.add(ax)
            radar_axes_set.append(ax)
        e = _axis_entry(q)
        if e:
            brand_axis[ax] = e

    # Per competitor
    competitor_axes: Dict[str, Dict[str, dict]] = {}  # comp_name -> {axis -> entry}
    for q in out_questions:
        ax = q.get("axis_label")
        comp = q.get("compare_brand")
        if not ax or not comp:
            continue
        e = _axis_entry(q)
        if e:
            competitor_axes.setdefault(comp, {})[ax] = e
        if ax not in seen_axis:
            seen_axis.add(ax)
            radar_axes_set.append(ax)

    def _radar_series(name: str, kind: str, axmap: Dict[str, dict]) -> dict:
        ns = [(axmap.get(ax) or {}).get("n") for ax in radar_axes_set]
        present_ns = [v for v in ns if v]
        return {
            "name": name,
            "kind": kind,
            "values": [(axmap.get(ax) or {}).get("score") for ax in radar_axes_set],
            "raw_means": [(axmap.get(ax) or {}).get("mean") for ax in radar_axes_set],
            "n_values": ns,
            "n_min": min(present_ns) if present_ns else 0,
            "n_max": max(present_ns) if present_ns else 0,
        }

    image_radar = {
        "axes": radar_axes_set,
        "series": [],
        "scale": "pomp_0_100",
    }
    if brand_axis:
        image_radar["series"].append(
            _radar_series(study["brand"]["name"], "brand", brand_axis)
        )
    for comp_name, comp_axes in competitor_axes.items():
        image_radar["series"].append(_radar_series(comp_name, "competitor", comp_axes))

    # Internal-consistency reliability per dimension. Reported whether or not it
    # is flattering — the thesis export reads THIS instead of asserting a
    # threshold it never tested.
    reliability = _dimension_reliability(study, responses)

    # Sample adequacy. There was no minimum-n gate anywhere: a single respondent
    # produced a full Brand Equity Score and a "Champion" verdict with no
    # warning. These bands are stated as rules of thumb, not as a power
    # calculation, and the UI is expected to say so.
    n_resp = len(responses)
    if n_resp < 10:
        adequacy = {"level": "insufficient", "n": n_resp, "min_next": 10,
                    "message": f"มีผู้ตอบ {n_resp} คน — ยังน้อยเกินกว่าจะสรุปผลได้ ควรมีอย่างน้อย 30 คน"}
    elif n_resp < 30:
        adequacy = {"level": "provisional", "n": n_resp, "min_next": 30,
                    "message": f"มีผู้ตอบ {n_resp} คน — ดูแนวโน้มได้ แต่ตัวเลขจะยังแกว่ง ควรเก็บให้ถึง 30 คน"}
    elif n_resp < 100:
        adequacy = {"level": "adequate", "n": n_resp, "min_next": 100,
                    "message": f"มีผู้ตอบ {n_resp} คน — เพียงพอสำหรับสรุปผลรวม (ถ้าจะแยกดูรายกลุ่ม ควรมี 100 คนขึ้นไป)"}
    else:
        adequacy = {"level": "strong", "n": n_resp, "min_next": None,
                    "message": f"มีผู้ตอบ {n_resp} คน — เพียงพอทั้งภาพรวมและการแยกกลุ่มย่อย"}

    return {
        "total_responses": len(responses),
        "questions": out_questions,
        "composite": composite,
        "composite_meta": composite_meta,
        "awareness_extras": awareness_extras,
        "association": association,
        "image_radar": image_radar,
        "reliability": reliability,
        "sample_adequacy": adequacy,
        # Served so no surface has to re-derive the tier and drift from the rest.
        "brand_health_tier": brand_health_tier(composite.get("overall")),
        "brand_health_tiers": BRAND_HEALTH_TIERS,
        # Which basis produced the unaided brand-mention counts. Scores no longer
        # depend on the AI job having run, but accuracy still improves with it
        # (misspellings, transliteration, nicknames), so the UI can offer it as an
        # enhancement without implying the current numbers are provisional.
        "normalization": {
            "basis": ("ai" if any(
                (q["stats"].get("normalization_basis") == "ai") for q in out_questions
            ) else ("deterministic" if any(
                (q["stats"].get("normalization_basis") == "deterministic") for q in out_questions
            ) else "none")),
            "ai_questions": sum(1 for q in out_questions
                                if q["stats"].get("normalization_basis") == "ai"),
            "deterministic_questions": sum(1 for q in out_questions
                                           if q["stats"].get("normalization_basis") == "deterministic"),
        },
    }


# ============ AI INTEGRATION ============
# Concurrency throttling (Semaphore) + thread-offloading (asyncio.to_thread)
# is installed GLOBALLY at server import time via
# `_install_llm_concurrency_patch` in server.py. Every chat.send_message(...)
# is automatically wrapped, so call sites here can stay simple.


async def _gemini_call(prompt: str, system: str = "You are a brand strategy expert. Respond in Thai unless asked otherwise.") -> str:
    """Call Gemini via emergentintegrations. Returns text or '' on error.

    Thread-offloading + global semaphore are applied transparently by the
    library monkey-patch in server.py.
    """
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return ""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=api_key,
            session_id=f"brand-equity-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)
    except asyncio.TimeoutError:
        logging.error("[BrandEquity] Gemini call timed out (handled by global patch)")
        return ""
    except Exception as e:
        logging.error(f"[BrandEquity] Gemini error: {e}")
        return ""


async def _translate_attrs_to_en(attrs_th: List[str]) -> List[str]:
    """Translate Thai brand-quality attributes to natural English adjectives/phrases.
    Aligns 1:1 with input order. Falls back to original Thai on error.
    """
    cleaned = [a.strip() for a in (attrs_th or []) if a and a.strip()]
    if not cleaned:
        return []
    try:
        prompt = (
            "Translate each of the following Thai brand quality attributes into a natural, "
            "concise English adjective/phrase suitable for a survey statement of the form "
            "'<Brand> is a brand that is <ATTR>'. Keep order, return ONE per line, "
            "NO numbering, NO quotes, NO extra commentary.\n\n"
            + "\n".join(cleaned)
        )
        out = await _gemini_call(
            prompt,
            system="You are a precise bilingual TH↔EN brand-marketing translator. "
                   "Output EN translations only — one per line, in the exact order given.",
        )
        if not out:
            return cleaned
        lines = [ln.strip(" -•\t").strip() for ln in out.splitlines() if ln.strip()]
        # Pad / truncate to match length
        if len(lines) < len(cleaned):
            lines = lines + cleaned[len(lines):]
        return lines[:len(cleaned)]
    except Exception as e:
        logging.error(f"[BrandEquity] translate_attrs error: {e}")
        return cleaned


async def _ai_extract_visual_identity(brand_name: str, category: str,
                                       description: str, traits: List[str],
                                       brand_promise: Optional[str],
                                       pricing_tier: Optional[str],
                                       visual_assets: List[dict]) -> dict:
    """Multimodal Gemini: combine free-form text + uploaded images
    (logo, palette, design samples) into a structured visual identity.

    Returns:
      {
        "derived_traits":   ["Modern", "Artisanal", ...],     # 5-10 trait words
        "visual_palette":   ["#0E5538", "#7DDDB1", ...],       # hex codes from imagery
        "visual_keywords":  ["minimalist", "earthy", ...],     # mood/style descriptors
        "design_style":     "...",                             # short label
        "archetype":        "...",                             # Aaker-style archetype
        "summary":          "..."                              # 2-3 sentence brand essence
      }
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return {}

        prompt = f"""คุณคือ senior brand strategist + visual designer
วิเคราะห์ identity ของแบรนด์ "{brand_name}" (category: {category}) จากข้อมูลทั้งหมด:

Free-form description from owner:
\"\"\"{description or '(none)'}\"\"\"

Brand promise: {brand_promise or '(none)'}
Pricing tier: {pricing_tier or 'mid'}
User-tagged traits: {', '.join(traits) if traits else '(none)'}

แนบมา {len(visual_assets)} ภาพ (logo, color palette, หรือ design samples)
"""
        if visual_assets:
            asset_lines = []
            for i, a in enumerate(visual_assets):
                asset_lines.append(f"  Image #{i+1}: kind={a.get('kind')}"
                                   + (f" · note: {a.get('note')}" if a.get('note') else ""))
            prompt += "Asset descriptions:\n" + "\n".join(asset_lines) + "\n"

        prompt += """
จงสรุปว่าแบรนด์นี้ตั้งใจสื่อ aspect ใดบ้าง โดยพิจารณาทั้ง text และภาพ (สี · ฟอนต์ · mood · composition · layout)

Return JSON ONLY (no markdown):
{
  "derived_traits": ["Modern", "Artisanal", ...],
  "visual_palette": ["#hex1", "#hex2", "#hex3"],
  "visual_keywords": ["minimalist", "earthy", "premium", ...],
  "design_style": "...",
  "archetype": "...",
  "summary": "2-3 ประโยคอธิบาย brand essence ที่สื่อจาก text + visuals"
}
"""

        chat = LlmChat(
            api_key=api_key,
            session_id=f"brand-identity-{uuid.uuid4().hex[:8]}",
            system_message="You are a senior brand strategist analyzing brand identity from descriptions and visual assets. Reply in Thai when appropriate, keep traits as concise English title-case words.",
        ).with_model("gemini", "gemini-2.5-flash")

        # Attach up to 5 images to keep payload reasonable
        file_contents = []
        for a in (visual_assets or [])[:5]:
            b64 = a.get("image_base64") or ""
            # Strip data URL prefix if present
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[-1]
            if b64:
                file_contents.append(ImageContent(image_base64=b64))

        msg = UserMessage(text=prompt, file_contents=file_contents) if file_contents \
              else UserMessage(text=prompt)
        # Hard timeout — multimodal can occasionally hang; we'd rather fail fast than
        # hold the proxy connection past 60s and trigger an unhelpful 502.
        import asyncio
        try:
            resp = await asyncio.wait_for(chat.send_message(msg), timeout=55.0)
        except asyncio.TimeoutError:
            logging.error("[BrandEquity] visual identity timed out after 55s")
            return {}
        text = resp if isinstance(resp, str) else str(resp)

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```", 2)[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned.strip())
    except Exception as e:
        logging.exception(f"[BrandEquity] visual identity extract failed: {e}")
        return {}


async def _ai_normalize_open(responses: List[str], kind: str, brand_list: List[str], category: str = "") -> dict:
    """Cluster open-ended brand/concept mentions written in different ways
    (Thai/English, casing, typos, abbreviations) into canonical buckets.

    kind:
      - 'brand_single' : each response = one brand (top-of-mind)
      - 'brand_multi'  : each response may list MULTIPLE brands separated by comma/space
      - 'concept'      : one-word brand descriptors (Modern == ทันสมัย == modern)

    Returns: {"counts": [{label, count, pct, variants}], "total": N}
    """
    if not responses:
        return {"counts": [], "total": 0}
    # cap input
    sample = [r for r in responses if r and str(r).strip()][:200]
    if not sample:
        return {"counts": [], "total": 0}

    if kind in ("brand_single", "brand_multi"):
        guidance = f"""These are brand-name responses about category '{category}'.
Known brands to anchor canonical labels: {', '.join(brand_list)}.
Cluster mentions referring to the SAME brand. Handle:
- Thai/English variants ('Mali' = 'มะลิ' = 'MALI')
- Casing/typos ('starbuks' = 'Starbucks')
- Abbreviations ('SB' = 'Starbucks' if context suggests)
- Multi-brand single responses (split commas, slashes, '/').
Use the most recognized form (prefer English brand if commonly used) as canonical."""
    else:  # concept
        guidance = """These are one-word brand descriptors.
Cluster synonyms / cross-language equivalents into one canonical concept:
- 'Modern' = 'modern' = 'ทันสมัย' = 'ทันยุค'
- 'Cozy'   = 'อบอุ่น' = 'นั่งสบาย' = 'cozy'
- 'Premium' = 'หรู' = 'แพง' (but 'expensive'/'แพง' is closer to 'Expensive' than 'Premium')
Use a single English title-case word as canonical when possible."""

    prompt = f"""{guidance}

Responses ({len(sample)}):
{json.dumps(sample, ensure_ascii=False)}

Return JSON only (no markdown):
{{
  "clusters": [
    {{"canonical": "<label>", "variants": ["v1", "v2", "v3"], "count": <int>}},
    ...
  ]
}}
Sort by count desc. Maximum 15 clusters. The total `count` across all clusters MAY exceed
{len(sample)} for brand_multi (multiple brands per response), but never less than the most-frequent variant.
Return ONLY JSON:"""
    text = await _gemini_call(prompt)
    if not text:
        # Fallback: case-insensitive frequency on raw strings
        normalized_pairs = [(r.strip().lower(), r.strip()) for r in sample]
        counter = Counter(p[0] for p in normalized_pairs)
        total = len(sample)
        return {
            "counts": [
                {"label": k.title(), "count": v,
                 "pct": round(v / total * 100, 1) if total else 0,
                 "variants": list(set(orig for low, orig in normalized_pairs if low == k))}
                for k, v in counter.most_common(15)
            ],
            "total": total,
        }
    try:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        parsed = json.loads(cleaned.strip())
        clusters = parsed.get("clusters", [])
        # base = number of responses (not sum of counts) — for percentage display
        total = len(sample)
        return {
            "counts": [
                {"label": c.get("canonical", "?"),
                 "count": int(c.get("count", 0)),
                 "pct": round(int(c.get("count", 0)) / total * 100, 1) if total else 0,
                 "variants": c.get("variants", []) or []}
                for c in clusters[:15]
            ],
            "total": total,
        }
    except Exception as e:
        logging.error(f"[BrandEquity] Parse normalize ({kind}) failed: {e} text={text[:200]}")
        return {"counts": [], "total": len(sample)}


async def _ai_extract_themes(open_responses: List[str], context: str = "") -> List[dict]:
    """Cluster open-ended responses into 3-7 themes."""
    if not open_responses:
        return []
    sample = open_responses[:80]
    prompt = f"""วิเคราะห์ {len(sample)} คำตอบเปิด {context} แล้ว cluster เป็น 3-7 themes
สำหรับแต่ละ theme: name (สั้น), description (1 ประโยค), count (จำนวนคำตอบที่เกี่ยวข้อง), sample_quotes (เลือก 2 ประโยคจากคำตอบจริง), sentiment (-1 ถึง 1)
Output JSON array. คำตอบ:
{json.dumps(sample, ensure_ascii=False)}
Return ONLY JSON array, no markdown:"""
    text = await _gemini_call(prompt)
    if not text:
        return []
    try:
        # Strip markdown code fence if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned.strip())
    except Exception as e:
        logging.error(f"[BrandEquity] Parse themes failed: {e}")
        return []


async def _ai_identity_image(intended_traits: List[str], open_responses: List[str], brand: str) -> dict:
    """Compute alignment between intended identity and perceived image."""
    if not open_responses:
        return {"alignment_score": 0, "perceived_traits": [], "aligned": [], "lost": [], "unintended": []}
    prompt = f"""วิเคราะห์ image perception ของแบรนด์ {brand}
Identity (ที่แบรนด์ตั้งใจให้เป็น): {', '.join(intended_traits)}
Open responses จากผู้ตอบ:
{json.dumps(open_responses[:60], ensure_ascii=False)}

Output JSON:
{{
  "perceived_traits": [{{"trait": "...", "count": N, "sentiment": float}}, ...up to 12 traits],
  "aligned": ["trait1", ...],   // intended ∩ perceived
  "lost": ["trait1", ...],       // intended that respondents DON'T mention
  "unintended": ["trait1", ...], // perceived but NOT intended
  "alignment_score_0_100": int,
  "narrative": "2 ประโยคสรุปช่องว่าง"
}}
Return ONLY JSON, no markdown:"""
    text = await _gemini_call(prompt)
    if not text:
        return {"alignment_score": 0, "perceived_traits": [], "aligned": [], "lost": [], "unintended": []}
    try:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned.strip())
    except Exception as e:
        logging.error(f"[BrandEquity] Parse identity-image failed: {e}")
        return {"alignment_score": 0, "perceived_traits": [], "aligned": [], "lost": [], "unintended": []}


async def _ai_master_insights(study: dict, agg: dict) -> List[dict]:
    """Generate 5 actionable insights."""
    # The payload used to be `agg["questions"][:20]` serialised whole and then
    # sliced with `[:6000]`. Two consequences, both silent:
    #   • the slice cut the JSON mid-string, so the model received malformed data
    #     and had to guess where it ended;
    #   • the questionnaire is ordered awareness → quality → identity → loyalty
    #     with ~27 identity items, so the first 20 questions NEVER reached a
    #     single Loyalty item — insights were generated for a brand whose loyalty
    #     the model had never seen.
    # Fix: send a compact, per-dimension-balanced digest that fits comfortably,
    # and serialise it whole so the JSON is always valid.
    def _slim(q: dict) -> dict:
        s = q.get("stats") or {}
        out = {"qid": q["id"], "kind": q.get("kind"), "dim": q.get("dimension"),
               "n": s.get("n")}
        for k in ("score_100", "mean", "t2b", "b2b", "net", "score", "promoters_pct",
                  "detractors_pct"):
            if s.get(k) is not None:
                out[k] = s[k]
        if s.get("counts"):
            out["top"] = [{"label": c.get("label"), "pct": c.get("pct")}
                          for c in s["counts"][:5]]
        return out

    per_dim_cap = 6
    picked, seen = [], {d: 0 for d in DIMENSIONS}
    for q in agg["questions"]:
        d = q.get("dimension")
        if d in seen and seen[d] < per_dim_cap and not q.get("compare_brand"):
            picked.append(_slim(q))
            seen[d] += 1

    summary = {
        "brand": study["brand"]["name"],
        "category": study["brand"]["category"],
        "competitors": study["brand"]["competitors"],
        "intended_identity": study["identity"]["traits"],
        "scores": {k: v for k, v in agg["composite"].items() if k != "_measured"},
        "measured_dimensions": agg["composite"].get("_measured"),
        "sample": agg.get("sample_adequacy"),
        "reliability": {d: (agg.get("reliability") or {}).get(d, {}).get("alpha")
                        for d in DIMENSIONS},
        "key_stats": picked,
    }
    prompt = f"""คุณคือ senior brand strategist วิเคราะห์ข้อมูล Brand Health ด้านล่าง สร้าง 5 actionable insights แต่ละ insight มี:
- headline: 1 บรรทัด
- evidence: เหตุผลโดยอ้างถึง stats (ระบุ qid)
- recommendation: 1 action ที่ทำได้จริง
- priority: high | medium | low

ข้อกำหนด: ใช้เฉพาะตัวเลขที่ปรากฏด้านล่าง ห้ามเดาหรือคำนวณเพิ่ม ·
ครอบคลุมทั้ง 4 มิติเท่าที่มีข้อมูล · ถ้ามิติใดไม่อยู่ใน measured_dimensions
หรือค่า reliability เป็น null ห้ามสรุปหนักแน่นเกี่ยวกับมิตินั้น ·
ถ้า sample.level เป็น insufficient/provisional ให้ระบุความไม่แน่นอนไว้ใน evidence

Data:
{json.dumps(summary, ensure_ascii=False)}

Return JSON array of 5 objects, no markdown:"""
    text = await _gemini_call(prompt)
    if not text:
        return []
    try:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.rsplit("```", 1)[0]
        return json.loads(cleaned.strip())
    except Exception as e:
        logging.error(f"[BrandEquity] Parse insights failed: {e}")
        return []


# ============ ROUTES FACTORY ============

def get_brand_equity_routes(db, get_current_user, get_optional_user):
    """Factory — register routes with DB + auth deps."""

    # ---- ownership helpers ----------------------------------------------
    def _is_admin(u) -> bool:
        return getattr(u, "role", None) == "admin"

    def _owns(u, study: dict) -> bool:
        if not study:
            return False
        if _is_admin(u):
            return True
        if study.get("owner_id") == u.id:
            return True
        # Email fallback — handles edge cases where the owner_id changed
        # (e.g. mixed-case email re-registered, OAuth merge, manual data fix).
        oem = (study.get("owner_email") or "").strip().lower()
        uem = (getattr(u, "email", "") or "").strip().lower()
        return bool(oem) and oem == uem

    def _owner_query(u):
        """Mongo filter so a user sees the studies they truly own
        even if owner_id was stored under a stale id."""
        import re
        uem = (getattr(u, "email", "") or "").strip().lower()
        clauses = [{"owner_id": u.id}]
        if uem:
            # case-insensitive exact match on owner_email
            clauses.append({"owner_email": {"$regex": f"^{re.escape(uem)}$", "$options": "i"}})
        return {"$or": clauses} if len(clauses) > 1 else clauses[0]

    @brand_equity_router.get("/templates")
    async def list_templates():
        """Return raw template library for browsing/preview."""
        return {"library": TEMPLATE_LIB, "trait_pool": DEFAULT_TRAIT_POOL,
                "dimensions": DIMENSIONS, "dimension_labels": DIM_LABELS,
                "dimension_colors": DIM_COLORS, "question_types": QUESTION_TYPES}

    # ---- Studies CRUD ----

    @brand_equity_router.post("/studies")
    async def create_study(data: StudyCreate, current_user=Depends(get_current_user)):
        # Auto-translate custom quality attrs (TH → EN) so EN respondents see proper prompts
        if data.brand.custom_quality_attributes and not data.brand.custom_quality_attributes_en:
            data.brand.custom_quality_attributes_en = await _translate_attrs_to_en(data.brand.custom_quality_attributes)
        questions = _generate_questions_from_template(data.brand, data.identity)
        share_token = uuid.uuid4().hex[:12]
        study = {
            "id": str(uuid.uuid4()),
            "owner_id": current_user.id,
            # Always store lower-cased email so future lookups are deterministic
            "owner_email": (current_user.email or "").strip().lower(),
            "status": "draft",
            "brand": data.brand.model_dump(),
            "identity": data.identity.model_dump(),
            "segments_to_capture": data.segments_to_capture,
            "target_responses": data.target_responses,
            "questions": questions,
            "weights": {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25},
            "share_token": share_token,
            "ai_cache": {},
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.brand_studies.insert_one(study)
        return {k: v for k, v in study.items() if k != "_id"}

    @brand_equity_router.get("/studies")
    async def list_studies(current_user=Depends(get_current_user)):
        # Admin sees ALL studies (matches Conjoint pattern). Non-admin uses
        # owner_id OR owner_email fallback so studies aren't lost if the id changed.
        owner_q = {} if _is_admin(current_user) else _owner_query(current_user)
        # Soft-delete: hide trashed studies from the main list
        not_trashed = {"deleted_at": {"$exists": False}}
        query = {"$and": [owner_q, not_trashed]} if owner_q else not_trashed
        cur = db.brand_studies.find(query, {"_id": 0}).sort("updated_at", -1)
        items = await cur.to_list(500)
        # Attach response counts
        for s in items:
            s["response_count"] = await db.brand_responses.count_documents({"study_id": s["id"]})
        return {"studies": items, "total": len(items)}

    @brand_equity_router.get("/studies/trash")
    async def list_trashed_studies(current_user=Depends(get_current_user)):
        """Trashed studies (soft-deleted, restorable). Auto-purges items older than 30 days
        before listing. Honors the same admin-vs-owner scoping as the main list."""
        cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

        # Best-effort cleanup: hard-purge anything trashed > 30 days
        old = await db.brand_studies.find({"deleted_at": {"$lt": cutoff}}, {"_id": 0, "id": 1}).to_list(500)
        if old:
            old_ids = [s["id"] for s in old]
            await db.brand_studies.delete_many({"id": {"$in": old_ids}})
            await db.brand_responses.delete_many({"study_id": {"$in": old_ids}})

        owner_q = {} if _is_admin(current_user) else _owner_query(current_user)
        q = {"$and": [owner_q, {"deleted_at": {"$exists": True, "$ne": None}}]} if owner_q \
            else {"deleted_at": {"$exists": True, "$ne": None}}
        cur = db.brand_studies.find(q, {"_id": 0}).sort("deleted_at", -1)
        items = await cur.to_list(500)
        for s in items:
            s["response_count"] = await db.brand_responses.count_documents({"study_id": s["id"]})
        return {"studies": items, "total": len(items)}

    @brand_equity_router.get("/studies/{study_id}")
    async def get_study(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        study["response_count"] = await db.brand_responses.count_documents({"study_id": study_id})
        return study

    @brand_equity_router.put("/studies/{study_id}")
    async def update_study(study_id: str, data: StudyUpdate, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        # Re-translate custom quality attrs if the TH list changed
        if data.brand is not None:
            new_th = data.brand.custom_quality_attributes or []
            old_th = (study.get("brand") or {}).get("custom_quality_attributes") or []
            old_en = (study.get("brand") or {}).get("custom_quality_attributes_en") or []
            if new_th != old_th or len(old_en) != len(new_th):
                data.brand.custom_quality_attributes_en = await _translate_attrs_to_en(new_th)
            else:
                data.brand.custom_quality_attributes_en = old_en
        update = {k: v.model_dump() if hasattr(v, "model_dump") else v
                  for k, v in data.model_dump().items() if v is not None}
        update["updated_at"] = _now_iso()
        await db.brand_studies.update_one({"id": study_id}, {"$set": update})
        out = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        out["response_count"] = await db.brand_responses.count_documents({"study_id": study_id})
        return out

    @brand_equity_router.delete("/studies/{study_id}")
    async def delete_study(study_id: str, current_user=Depends(get_current_user)):
        """Soft-delete (move to Trash). Auto-purged after 30 days; restore via /restore."""
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        await db.brand_studies.update_one({"id": study_id},
            {"$set": {"deleted_at": _now_iso(), "updated_at": _now_iso()}})
        return {"message": "Moved to Trash", "trashed": True}

    @brand_equity_router.post("/studies/{study_id}/restore")
    async def restore_study(study_id: str, current_user=Depends(get_current_user)):
        """Restore a soft-deleted study from the Trash."""
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        if not study.get("deleted_at"):
            return {"message": "Already active"}
        await db.brand_studies.update_one({"id": study_id},
            {"$unset": {"deleted_at": ""}, "$set": {"updated_at": _now_iso()}})
        return {"message": "Restored", "trashed": False}

    @brand_equity_router.delete("/studies/{study_id}/purge")
    async def purge_study(study_id: str, current_user=Depends(get_current_user)):
        """Hard-delete a study and its responses permanently. Use only on already-trashed
        items (or by admin) — there is no recovery after this."""
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        await db.brand_studies.delete_one({"id": study_id})
        await db.brand_responses.delete_many({"study_id": study_id})
        return {"message": "Purged permanently"}

    @brand_equity_router.post("/studies/{study_id}/regenerate-questions")
    async def regenerate_questions(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)
        brand = BrandSetup(**study["brand"])
        identity = IdentitySetup(**study["identity"])
        # Ensure custom attrs have EN translation (lazy backfill for old studies)
        if brand.custom_quality_attributes and not brand.custom_quality_attributes_en:
            brand.custom_quality_attributes_en = await _translate_attrs_to_en(brand.custom_quality_attributes)

        old_questions = study.get("questions") or []
        new_questions = _generate_questions_from_template(brand, identity)
        # HYBRID HISTORY MERGE — preserve ids of unchanged questions so prior
        # responses keep linking; stash old ids in legacy_ids for changed ones;
        # bump per-question wave only when the wording/scale actually changed.
        new_questions = _merge_questions_preserving_history(old_questions, new_questions)

        # Did anything materially change? If yes, bump study-level wave.
        bump = any(q.get("legacy_ids") or q.get("wave", 1) > 1 for q in new_questions)
        wave_history = list(study.get("wave_history") or [])
        current_wave = study.get("current_wave", 1)
        if bump or not wave_history:
            current_wave = current_wave + 1 if wave_history else 1
            wave_history.append({
                "wave": current_wave,
                "published_at": _now_iso(),
                "by": (current_user.email if hasattr(current_user, 'email') else str(current_user)),
                "questions_changed": sum(1 for q in new_questions if q.get("wave", 1) > 1 or q.get("legacy_ids")),
                "questions_total": len(new_questions),
            })

        await db.brand_studies.update_one({"id": study_id},
            {"$set": {
                "questions": new_questions,
                "brand.custom_quality_attributes_en": brand.custom_quality_attributes_en,
                "current_wave": current_wave,
                "wave_history": wave_history,
                "updated_at": _now_iso(),
            }})
        return {
            "questions": new_questions,
            "current_wave": current_wave,
            "merged_from_prior_wave": bump,
            "questions_with_history": sum(1 for q in new_questions if q.get("legacy_ids")),
        }

    @brand_equity_router.post("/admin/relink-stable-ids")
    async def admin_relink_stable_question_ids(current_user=Depends(get_current_user)):
        """One-shot backfill: for every existing study,

           PHASE 1 — Regenerate the question list to deterministic slot-based
                     ids and merge against the CURRENT questions so the old
                     random ids stored on `study.questions` end up in
                     `legacy_ids`.

           PHASE 2 — Scan `brand_responses` for question_ids that don't
                     appear in the new study (orphans from older template
                     versions or wording revisions). For each orphan,
                     derive its `template_id` (prefix before the first `-`)
                     and re-link it into the `legacy_ids` of the matching
                     current question (by template_id + dimension).

        Admin-only. Idempotent — safe to run repeatedly."""
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        migrated = []
        cursor = db.brand_studies.find({}, {"_id": 0})
        async for s in cursor:
            try:
                brand = BrandSetup(**s["brand"])
                identity = IdentitySetup(**s["identity"])
            except Exception:
                continue
            old_questions = s.get("questions") or []

            # ---- PHASE 1: stable id migration via slot merge ----
            new_questions = _generate_questions_from_template(brand, identity)
            new_questions = _merge_questions_preserving_history(old_questions, new_questions)

            # ---- PHASE 2: re-link orphaned response ids by template_id ----
            sid = s["id"]
            resp_qids: set = set()
            async for r in db.brand_responses.find(
                {"study_id": sid}, {"_id": 0, "answers": 1}
            ):
                for a in (r.get("answers") or []):
                    qid = a.get("question_id")
                    if qid:
                        resp_qids.add(qid)
            # ids already known to the study (either as primary id or in legacy_ids)
            known: set = set()
            for q in new_questions:
                known.add(q.get("id"))
                for lid in (q.get("legacy_ids") or []):
                    known.add(lid)
            orphans = resp_qids - known
            phase2_links = 0
            if orphans:
                # Build template_id -> list of new questions index
                by_tmpl: Dict[str, List[int]] = {}
                for i, q in enumerate(new_questions):
                    t = q.get("template_id") or q.get("id", "").split("--")[0]
                    by_tmpl.setdefault(t, []).append(i)
                for orph in orphans:
                    # legacy id format: "{TEMPLATE}-{4hex}" — strip the trailing suffix
                    tmpl = orph.rsplit("-", 1)[0] if "-" in orph else orph
                    candidates = by_tmpl.get(tmpl, [])
                    if not candidates:
                        continue  # truly unmappable — original template no longer in study
                    # If there are multiple candidates (e.g., per-competitor), pick
                    # the one whose `compare_brand` is empty/self by default since
                    # orphaned legacy responses had no per-competitor variants.
                    chosen = candidates[0]
                    for ci in candidates:
                        if not new_questions[ci].get("compare_brand"):
                            chosen = ci
                            break
                    q = new_questions[chosen]
                    legacy = list(q.get("legacy_ids") or [])
                    if orph not in legacy:
                        legacy.append(orph)
                        q["legacy_ids"] = legacy
                        phase2_links += 1

            await db.brand_studies.update_one(
                {"id": sid},
                {"$set": {
                    "questions": new_questions,
                    "current_wave": s.get("current_wave", 1),
                    "wave_history": s.get("wave_history") or [
                        {"wave": 1, "published_at": s.get("created_at"),
                         "by": "system-backfill", "note": "initial wave"}
                    ],
                    "migration_meta": {
                        "last_migrated_at": _now_iso(),
                        "phase2_orphan_relinked": phase2_links,
                        "phase2_unmappable_orphans": len(orphans) - phase2_links,
                    },
                    "updated_at": _now_iso(),
                }},
            )
            migrated.append({
                "study_id": sid,
                "questions_with_legacy_ids": sum(
                    1 for q in new_questions if q.get("legacy_ids")
                ),
                "phase2_orphan_relinked": phase2_links,
                "phase2_unmappable_orphans": len(orphans) - phase2_links,
            })
        return {"migrated_count": len(migrated), "studies": migrated}

    @brand_equity_router.post("/admin/cleanup-decoys")
    async def admin_cleanup_decoys(current_user=Depends(get_current_user)):
        """Surgical backfill: strip legacy 'Brand X/Y/Z' decoy entries from existing
        studies' questions.options. Idempotent — safe to call multiple times.
        Admin-only. Use after deploying the template fix."""
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        import re as _re
        decoy_re = _re.compile(r"^Brand\s+[XYZ]$", _re.IGNORECASE)

        cursor = db.brand_studies.find({}, {"_id": 0, "id": 1, "questions": 1})
        fixed_ids = []
        async for s in cursor:
            qs = s.get("questions") or []
            changed = False
            for q in qs:
                for fld in ("options", "options_th"):
                    opts = q.get(fld)
                    if isinstance(opts, list):
                        cleaned = [o for o in opts
                                   if not (isinstance(o, str) and decoy_re.match(o.strip()))]
                        if cleaned != opts:
                            q[fld] = cleaned
                            changed = True
            if changed:
                await db.brand_studies.update_one(
                    {"id": s["id"]},
                    {"$set": {"questions": qs, "updated_at": _now_iso()}}
                )
                fixed_ids.append(s["id"])
        return {"fixed_count": len(fixed_ids), "fixed_ids": fixed_ids}

    class IdentityExtractRequest(BaseModel):
        brand_name: str
        category: Optional[str] = ""
        description: Optional[str] = ""
        traits: List[str] = []
        brand_promise: Optional[str] = None
        pricing_tier: Optional[str] = "mid"
        visual_assets: List[VisualAsset] = []

    @brand_equity_router.post("/extract-identity")
    async def extract_identity(payload: IdentityExtractRequest, current_user=Depends(get_current_user)):
        """Stateless: take free-form text + uploaded images and return derived identity.
        Used by the wizard BEFORE study creation. Owner just merges result into draft."""
        if not (payload.description or payload.visual_assets or payload.traits):
            raise HTTPException(400, "Provide description, traits, or at least 1 visual asset")
        derived = await _ai_extract_visual_identity(
            brand_name=payload.brand_name,
            category=payload.category or "",
            description=payload.description or "",
            traits=payload.traits,
            brand_promise=payload.brand_promise,
            pricing_tier=payload.pricing_tier,
            visual_assets=[a.model_dump() for a in payload.visual_assets],
        )
        if not derived:
            raise HTTPException(502, "AI extraction failed. Try simplifying description or fewer images.")
        return derived

    @brand_equity_router.post("/studies/{study_id}/extract-visual-identity")
    async def extract_visual_identity(study_id: str, current_user=Depends(get_current_user)):
        """Run multimodal LLM over the study's identity (description + visual_assets)
        to derive traits, palette, keywords. Updates study.identity with derived_*."""
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "Not authorized")
        ident = study.get("identity", {}) or {}
        if not (ident.get("description") or ident.get("visual_assets")):
            raise HTTPException(400, "Provide identity.description or identity.visual_assets first")
        brand = study.get("brand", {}) or {}
        derived = await _ai_extract_visual_identity(
            brand_name=brand.get("name", ""),
            category=brand.get("category", ""),
            description=ident.get("description") or "",
            traits=ident.get("traits") or [],
            brand_promise=ident.get("brand_promise"),
            pricing_tier=ident.get("pricing_tier"),
            visual_assets=ident.get("visual_assets") or [],
        )
        if not derived:
            raise HTTPException(502, "AI extraction returned no result. Check description/images and try again.")
        # Merge derived back into identity (don't overwrite explicit traits unless empty)
        new_traits = list(dict.fromkeys((ident.get("traits") or []) + (derived.get("derived_traits") or [])))
        update = {
            "identity.derived_traits": derived.get("derived_traits") or [],
            "identity.visual_palette": derived.get("visual_palette") or [],
            "identity.visual_keywords": derived.get("visual_keywords") or [],
            "identity.ai_summary": derived.get("summary") or "",
            "identity.archetype": derived.get("archetype") or ident.get("archetype"),
            "identity.traits": new_traits[:12],
            "updated_at": _now_iso(),
        }
        await db.brand_studies.update_one({"id": study_id}, {"$set": update})
        out = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        return {"identity": out.get("identity"), "derived": derived}

    # ---- Public respondent flow ----

    @brand_equity_router.get("/public/{share_token}")
    async def get_public_study(share_token: str):
        """Public — fetch study by share token for respondent UI. Strips owner data."""
        study = await db.brand_studies.find_one({"share_token": share_token}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if study.get("status") not in ("collecting", "analyzing"):
            raise HTTPException(410, "Study is not currently accepting responses")
        # Surface only the logo asset (skip palette/design/ad images — heavy and unused on respondent UI)
        identity = study.get("identity") or {}
        logo_asset = next(
            (a for a in (identity.get("visual_assets") or []) if a.get("kind") == "logo"),
            None
        )
        # Strip sensitive owner info
        return {
            "id": study["id"],
            "share_token": share_token,
            "brand": study["brand"],
            "identity": {"brand_promise": identity.get("brand_promise")},
            "logo_asset": logo_asset,
            "questions": study["questions"],
            "segments_to_capture": study.get("segments_to_capture", []),
            "estimated_minutes": max(5, len(study["questions"]) // 4),
        }

    @brand_equity_router.post("/public/{share_token}/respond")
    async def submit_response(share_token: str, data: ResponseSubmit):
        study = await db.brand_studies.find_one({"share_token": share_token}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if study.get("status") not in ("collecting", "analyzing"):
            raise HTTPException(410, "Study is not accepting responses")

        # Validate answers against the study's own instrument before storing.
        # This endpoint is PUBLIC and unauthenticated, and nothing used to check
        # the payload: a scale value outside its range flows straight into
        # `_likert_stats`, whose POMP transform is unbounded, so a single
        # response of 9 on a 7-point item pushes that question's score_100 to
        # 133.3 (and 0 pushes it to -25.0). Those feed the dimension composite and
        # the published Brand Equity Score. Out-of-range values are dropped rather
        # than rejected wholesale, so one bad field cannot discard an otherwise
        # complete response.
        valid_q = {q["id"]: q for q in (study.get("questions") or [])}
        clean_answers, dropped = [], 0
        for ans in (data.answers or []):
            if not isinstance(ans, dict):
                dropped += 1
                continue
            q = valid_q.get(ans.get("question_id"))
            if not q:
                dropped += 1  # unknown/stale question id
                continue
            val, qtype = ans.get("value"), q.get("type")
            ok = True
            if qtype in ("likert_5", "likert_7", "nps_0_10", "comparative_7"):
                lo, hi = {"likert_5": (1, 5), "likert_7": (1, 7),
                          "nps_0_10": (0, 10), "comparative_7": (1, 7)}[qtype]
                if isinstance(val, bool) or not isinstance(val, (int, float)):
                    ok = False
                elif not (lo <= float(val) <= hi):
                    ok = False
            elif qtype in ("mcq_single",):
                opts = q.get("options") or []
                ok = (not opts) or (val in opts)
            elif qtype in ("mcq_multi", "trait_grid"):
                if not isinstance(val, list):
                    ok = False
                else:
                    opts = set(q.get("options") or [])
                    if opts:
                        val = [v for v in val if v in opts]
                    mx = q.get("max")
                    if isinstance(mx, int) and mx > 0:
                        val = val[:mx]   # honour the instrument's own pick cap
                    ans = {**ans, "value": val}
            elif qtype in ("open_short", "open_long"):
                if val is None:
                    ok = False
                else:
                    ans = {**ans, "value": str(val)[:2000]}  # bound free text
            if ok:
                clean_answers.append(ans)
            else:
                dropped += 1

        if not clean_answers:
            raise HTTPException(400, "ไม่พบคำตอบที่ใช้ได้ในแบบสอบถามนี้")
        if dropped:
            logging.warning(
                "[BE] study %s: dropped %d invalid answer(s) from a public response",
                study["id"], dropped,
            )

        resp = {
            "id": str(uuid.uuid4()),
            "study_id": study["id"],
            "respondent_id": None,  # anonymous
            "demographics": data.demographics,
            "answers": clean_answers,
            "invalid_answers_dropped": dropped,
            "duration_sec": data.duration_sec,
            "started_at": _now_iso(),
            "submitted_at": _now_iso(),
            "channel": "public_link",
        }
        await db.brand_responses.insert_one(resp)
        return {"message": "Response saved", "id": resp["id"]}

    # ---- Public Showcase (read-only sanitized dashboard view, no auth) ----

    @brand_equity_router.get("/showcase")
    async def list_public_showcases():
        return await _list_public_showcases_cached()

    @async_ttl_cache(ttl_seconds=60)
    async def _list_public_showcases_cached():
        """Public — list all studies the owner has marked as `is_public_showcase`.
        Returns lean metadata only (no aggregates). Anyone can browse;
        clicking into /showcase/{token} loads the full sanitized dashboard."""
        cur = db.brand_studies.find(
            {"is_public_showcase": True, "deleted_at": {"$exists": False}},
            {"_id": 0, "id": 1, "brand": 1, "share_token": 1, "status": 1,
             "created_at": 1, "updated_at": 1, "is_public_showcase": 1,
             "identity.visual_assets": 1}
        ).sort("updated_at", -1)
        items = await cur.to_list(500)

        out = []
        for s in items:
            tok = s.get("share_token")
            if not tok:
                continue
            brand = s.get("brand") or {}
            identity = s.get("identity") or {}
            logo_asset = next(
                (a for a in (identity.get("visual_assets") or []) if a.get("kind") == "logo"),
                None
            )
            response_count = await db.brand_responses.count_documents({"study_id": s["id"]})

            # Compute composite scores when enough data — used for the homepage Featured card preview
            scores = None
            if response_count >= 10:
                try:
                    full_study = await db.brand_studies.find_one({"id": s["id"]}, {"_id": 0})
                    if full_study:
                        responses = await db.brand_responses.find(
                            {"study_id": s["id"]}, {"_id": 0}
                        ).to_list(5000)
                        ai_cache = full_study.get("ai_cache", {}) or {}
                        agg = _aggregate_responses(
                            full_study, responses,
                            normalized=ai_cache.get("normalized_by_question") or {},
                        )
                        scores = agg.get("composite") or None
                except Exception:
                    scores = None

            out.append({
                "id": s["id"],
                "share_token": tok,
                "status": s.get("status"),
                "brand_name": brand.get("name"),
                "category": brand.get("category"),
                "competitors": (brand.get("competitors") or [])[:5],
                "logo_url": brand.get("logo_url"),
                "logo_asset": logo_asset,
                "response_count": response_count,
                "ready_for_dashboard": response_count >= 10,
                "scores": scores,  # {awareness, quality, identity, loyalty, overall} or None
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
            })
        return {"showcases": out, "total": len(out)}

    @brand_equity_router.get("/showcase/{share_token}")
    async def get_public_showcase(
        share_token: str,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None, description="JSON-encoded {field:[values]}"),
    ):
        return await _get_public_showcase_cached(share_token, from_iso, to_iso, segments)

    @async_ttl_cache(ttl_seconds=60)
    async def _get_public_showcase_cached(
        share_token: str,
        from_iso: Optional[str],
        to_iso: Optional[str],
        segments: Optional[str],
    ):
        """Public — sanitized dashboard view of a study that the owner has marked as showcase.
        Returns aggregates + AI insights + brand info, but strips owner identity, raw responses,
        demographics breakdown, and any sensitive fields. Survey-taking is still possible via
        the normal /respond/ endpoint (we surface its share_token + status so the page can link).
        """
        study = await db.brand_studies.find_one({"share_token": share_token}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if not study.get("is_public_showcase"):
            raise HTTPException(403, "This study is not published as a public showcase")
        # Need at least 10 responses before showcasing — same gate as the owner dashboard
        responses_count = await db.brand_responses.count_documents({"study_id": study["id"]})
        all_responses: List[dict] = []
        if responses_count >= 10:
            all_responses = await db.brand_responses.find(
                {"study_id": study["id"]}, {"_id": 0}
            ).to_list(5000)

        seg_filter = _parse_segments_param(segments)
        filtered_responses = _apply_response_filter(
            all_responses, from_iso=from_iso, to_iso=to_iso, segments=seg_filter,
        )
        sig = _filter_signature(from_iso, to_iso, seg_filter)
        ai_cache_active = _resolve_ai_cache(study, sig)
        normalized_active = ai_cache_active.get("normalized_by_question") or \
                            (study.get("ai_cache") or {}).get("normalized_by_question") or {}

        agg = _aggregate_responses(study, filtered_responses,
                                   normalized=normalized_active) \
              if filtered_responses else {}

        # Only logo asset is exposed (palette/design images are owner-internal)
        identity = study.get("identity") or {}
        logo_asset = next(
            (a for a in (identity.get("visual_assets") or []) if a.get("kind") == "logo"),
            None
        )

        # Sanitize aggregate: drop demographics breakdown if present
        if agg:
            agg = {k: v for k, v in agg.items() if k != "demographics"}

        # Sanitize AI cache: keep only display-safe fields
        ai_safe = {
            "themes_by_question": ai_cache_active.get("themes_by_question", {}),
            "identity_image": ai_cache_active.get("identity_image", {}),
            "master_insights": ai_cache_active.get("master_insights", []),
            "normalized_by_question": ai_cache_active.get("normalized_by_question", {}),
            "status": ai_cache_active.get("status"),
            "filter_signature": sig,
        }

        # Sanitize identity: include the brand-identity intent fields that the public
        # dashboard's "Identity vs Image" section needs to render.
        # Logo is already exposed via logo_asset above, so visual_assets keeps ONLY logo
        # (palette images stay owner-internal).
        identity_safe = {
            "traits": identity.get("traits") or [],
            "description": identity.get("description"),
            "brand_promise": identity.get("brand_promise"),
            "pricing_tier": identity.get("pricing_tier"),
            "archetype": identity.get("archetype"),
            "derived_traits": identity.get("derived_traits") or [],
            "visual_palette": identity.get("visual_palette") or [],
            "visual_keywords": identity.get("visual_keywords") or [],
            "ai_summary": identity.get("ai_summary"),
            "visual_assets": [logo_asset] if logo_asset else [],
        }

        return {
            "id": study["id"],
            "share_token": share_token,
            "status": study.get("status"),
            "brand": study["brand"],
            "identity": identity_safe,
            "logo_asset": logo_asset,
            "competitors": (study["brand"].get("competitors") or []),
            "estimated_minutes": max(5, len(study.get("questions") or []) // 4),
            "response_count": responses_count,
            "target_responses": study.get("target_responses", 100),
            "ready_for_dashboard": len(filtered_responses) >= 10,
            "aggregate": agg,
            "ai_cache": ai_safe,
            "created_at": study.get("created_at"),
            "updated_at": study.get("updated_at"),
            "filter": {
                "from": from_iso, "to": to_iso, "segments": seg_filter,
                "signature": sig,
            },
            "responses_total": len(all_responses),
            "responses_filtered": len(filtered_responses),
            "segments_available": _segments_available(
                all_responses, study.get("segments_to_capture") or []
            ),
        }

    # ---- Responses (for owner) ----

    @brand_equity_router.get("/studies/{study_id}/responses")
    async def list_responses(study_id: str, limit: int = 200, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)
        cur = db.brand_responses.find({"study_id": study_id}, {"_id": 0}).sort("submitted_at", -1).limit(limit)
        items = await cur.to_list(limit)
        return {"responses": items, "total": len(items)}

    # ---- Dashboard / analysis ----

    @brand_equity_router.get("/thesis-eligible")
    async def thesis_eligible(current_user=Depends(get_current_user)):
        """Returns whether the current user can use the thesis export feature.
        Eligible: ADMIN, or any user with `can_export_thesis=True` whitelist flag."""
        from server import UserRole
        if not current_user:
            return {"eligible": False, "feature": "thesis_export", "role": None}
        is_admin = current_user.role == UserRole.ADMIN
        is_whitelisted = bool(getattr(current_user, "can_export_thesis", False))
        return {
            "eligible": bool(is_admin or is_whitelisted),
            "feature": "thesis_export",
            "role": getattr(current_user, "role", None),
            "can_export_thesis": is_whitelisted,
        }

    @brand_equity_router.post("/studies/{study_id}/thesis-export")
    async def thesis_export(
        study_id: str,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None),
        current_user=Depends(get_current_user),
    ):
        """Generate a thesis-ready DOCX of this study (Aaker-aligned methodology).
        Permission: ADMIN, owner of study, or user with `can_export_thesis=True`.
        Honors active filter (from/to/segments) so users can export segment-specific reports."""
        from fastapi.responses import StreamingResponse
        from server import UserRole
        from .thesis_renderer import render_thesis_docx

        if not current_user:
            raise HTTPException(403, "Login required")
        is_admin = current_user.role == UserRole.ADMIN
        is_whitelisted = bool(getattr(current_user, "can_export_thesis", False))

        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")

        is_owner = _owns(current_user, study)
        # Rule: owner-with-permission OR admin (non-owners must be admin)
        if is_admin:
            pass  # admins can export anything
        elif is_owner and is_whitelisted:
            pass  # owners with whitelist can export their own
        elif is_owner and not is_whitelisted:
            raise HTTPException(403, "คุณเป็นเจ้าของ study แต่ยังไม่ได้รับสิทธิ์ Export Thesis — ติดต่อ admin")
        else:
            raise HTTPException(403, "เฉพาะเจ้าของ study (ที่ได้รับสิทธิ์แล้ว) หรือ admin เท่านั้น")

        all_responses = await db.brand_responses.find(
            {"study_id": study_id}, {"_id": 0}
        ).to_list(5000)
        seg_filter = _parse_segments_param(segments)
        filtered = _apply_response_filter(
            all_responses, from_iso=from_iso, to_iso=to_iso, segments=seg_filter,
        )
        sig = _filter_signature(from_iso, to_iso, seg_filter)
        ai_cache_active = _resolve_ai_cache(study, sig)
        normalized = ai_cache_active.get("normalized_by_question") or \
                     (study.get("ai_cache") or {}).get("normalized_by_question") or {}
        agg = _aggregate_responses(study, filtered, normalized=normalized)

        # Inject the active filter's AI cache so identity-image / master_insights
        # match the data slice in the report
        study_for_report = {**study, "ai_cache": ai_cache_active or study.get("ai_cache") or {}}

        # Render in a thread — python-docx is sync and CPU-bound
        buf = await asyncio.to_thread(
            render_thesis_docx,
            study=study_for_report,
            aggregate=agg,
            sample_n_total=len(all_responses),
            sample_n_filtered=len(filtered),
            filter_info={"from": from_iso, "to": to_iso, "segments": seg_filter},
            author_name=getattr(current_user, "email", None) or getattr(current_user, "id", None),
        )

        brand_safe = (study.get("brand", {}).get("name") or "brand").strip()
        brand_safe = "".join(c if c.isalnum() else "_" for c in brand_safe) or "brand"
        filename = f"thesis-{brand_safe}-{datetime.now(timezone.utc).strftime('%Y%m%d')}.docx"

        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # ========================================================================
    # AI-POWERED THESIS EXPORT (chapters 1-5, Gemini-generated, async job)
    # ========================================================================
    # Mirrors the Conjoint thesis export workflow:
    #   POST  /studies/{id}/thesis-ai-start   { chapters, extra_prompt, ?from, ?to, ?segments }
    #   GET   /studies/{id}/thesis-ai-status/{job_id}
    #   GET   /studies/{id}/thesis-ai-download?job_id=...
    # Cache key combines study_id + chapters + extra_prompt hash + filter sig
    # so identical requests reuse the AI markdown without re-billing.

    async def _run_be_thesis_ai_generation(
        study_id: str, job_id: str, cache_key: str,
        chapters: List[int], extra_prompt: str,
        from_iso: Optional[str], to_iso: Optional[str],
        segments: Optional[Dict[str, List[str]]],
    ):
        """Background task: build per-chapter prompts → call Gemini → cache markdown."""
        from .be_thesis_ai import build_be_thesis_prompts, references_section_md
        try:
            study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
            if not study:
                await db.brand_thesis_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {"status": "failed", "error": "Study not found"}},
                )
                return

            all_resp = await db.brand_responses.find(
                {"study_id": study_id}, {"_id": 0}
            ).to_list(5000)
            filtered = _apply_response_filter(
                all_resp, from_iso=from_iso, to_iso=to_iso, segments=segments,
            )

            sig = _filter_signature(from_iso, to_iso, segments)
            ai_cache_active = _resolve_ai_cache(study, sig)
            normalized = ai_cache_active.get("normalized_by_question") or \
                         (study.get("ai_cache") or {}).get("normalized_by_question") or {}
            agg = _aggregate_responses(study, filtered, normalized=normalized)

            # Inject the active filter's AI cache so master_insights / identity-image
            # reflect the slice the user is exporting
            study_for_ai = {**study, "ai_cache": ai_cache_active or study.get("ai_cache") or {}}

            sys_msg, prompts = build_be_thesis_prompts(
                study=study_for_ai, aggregate=agg,
                n_total=len(all_resp), n_filtered=len(filtered),
                chapters=sorted(chapters), extra_prompt=extra_prompt,
            )

            # Lazy import — server.py owns the Gemini retry helper
            from server import _call_gemini_with_retry

            chapter_outputs: Dict[int, str] = {}
            for ch in sorted(prompts.keys()):
                logging.info(f"[BE-Thesis] job {job_id} generating ch{ch}")
                # Mark progress in job doc so UI can show "กำลังสร้างบทที่ X"
                await db.brand_thesis_jobs.update_one(
                    {"job_id": job_id},
                    {"$set": {"progress": f"chapter_{ch}",
                              "updated_at": _now_iso()}},
                )
                content = await _call_gemini_with_retry(
                    system_msg=sys_msg,
                    prompt=prompts[ch],
                    session_id=f"be-thesis-ch{ch}-{study_id}-{job_id}",
                )
                chapter_outputs[ch] = content or ""

            # Stitch markdown — chapter break = ---
            # (server's `_create_thesis_docx` treats `---` as page-break)
            ai_md = "\n\n---\n\n".join(
                chapter_outputs[ch] for ch in sorted(chapter_outputs.keys())
            )
            # Always append References at the end
            ai_md += "\n\n---\n\n" + references_section_md()

            # Cache and mark ready
            await db.brand_thesis_cache.update_one(
                {"cache_key": cache_key, "study_id": study_id},
                {"$set": {
                    "study_id": study_id,
                    "cache_key": cache_key,
                    # Stamp the scoring/text schema so a thesis written against
                    # superseded numbers is never replayed. See
                    # BE_ANALYSIS_SCHEMA_VERSION.
                    "schema_version": BE_ANALYSIS_SCHEMA_VERSION,
                    "ai_content": ai_md,
                    "chapters": sorted(chapters),
                    "n_filtered": len(filtered),
                    "n_total": len(all_resp),
                    "created_at": _now_iso(),
                }},
                upsert=True,
            )
            await db.brand_thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "ready",
                          "cache_key": cache_key,
                          "updated_at": _now_iso()}},
            )
            logging.info(f"[BE-Thesis] job {job_id} ready (chapters={chapters})")
        except asyncio.TimeoutError:
            await db.brand_thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed",
                          "error": "AI ใช้เวลานานเกินไป กรุณาลองใหม่"}},
            )
        except Exception as e:
            logging.exception(f"[BE-Thesis] job {job_id} failed: {e}")
            await db.brand_thesis_jobs.update_one(
                {"job_id": job_id},
                {"$set": {"status": "failed", "error": str(e)[:300]}},
            )

    @brand_equity_router.post("/studies/{study_id}/thesis-ai-start")
    async def thesis_ai_start(
        study_id: str,
        request: BrandThesisExportRequest,
        background_tasks: BackgroundTasks,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None),
        current_user=Depends(get_current_user),
    ):
        """Kick off a Gemini-powered thesis generation. Returns job_id for polling."""
        from server import UserRole
        eligible_roles = {UserRole.ADMIN, UserRole.CURRENT_STUDENT, UserRole.ALUMNI}
        if not current_user or current_user.role not in eligible_roles:
            raise HTTPException(403, "Thesis export not available for your role.")

        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if not _owns(current_user, study):
            raise HTTPException(403, "You do not own this study.")

        chapters = sorted({int(c) for c in (request.chapters or []) if 1 <= int(c) <= 5})
        if not chapters:
            raise HTTPException(400, "เลือกบทที่ต้องการอย่างน้อย 1 บท")

        # Need ≥ 10 responses (after filter) for chapters that cite real numbers (3,4,5).
        # Chapters 1-2 only are allowed even with 0 responses (they're drafts).
        seg_filter = _parse_segments_param(segments)
        n_filtered = len(_apply_response_filter(
            await db.brand_responses.find(
                {"study_id": study_id}, {"_id": 0}
            ).to_list(5000),
            from_iso=from_iso, to_iso=to_iso, segments=seg_filter,
        ))
        if any(c >= 3 for c in chapters) and n_filtered < 10:
            raise HTTPException(
                400,
                f"ต้องมีอย่างน้อย 10 responses สำหรับบทที่ 3/4/5 — ปัจจุบัน {n_filtered}",
            )

        # Build cache key from inputs (so identical requests reuse output)
        sig = _filter_signature(from_iso, to_iso, seg_filter)
        ep_hash = ""
        if request.extra_prompt and request.extra_prompt.strip():
            ep_hash = hashlib.md5(request.extra_prompt.strip().encode()).hexdigest()[:8]
        ch_key = "_".join(str(c) for c in chapters)
        cache_key = f"be_thesis_{study_id}_{ch_key}_{sig}" + (f"_ep{ep_hash}" if ep_hash else "")

        # Cache hit — return ready immediately. The schema guard matters here more
        # than anywhere: the generated text EMBEDS the statistics, the DOCX
        # re-renders that stored text verbatim, and there is no regenerate button
        # in the UI — so without it a study keeps emitting a thesis built on
        # pre-audit numbers forever.
        cached = await db.brand_thesis_cache.find_one(
            {"cache_key": cache_key, "study_id": study_id,
             "schema_version": BE_ANALYSIS_SCHEMA_VERSION}, {"_id": 0},
        )
        if cached and cached.get("ai_content"):
            return {"status": "ready", "job_id": cache_key,
                    "cache_key": cache_key, "cached": True}

        job_id = f"be_thesis_{study_id[:8]}_{uuid.uuid4().hex[:8]}"
        await db.brand_thesis_jobs.update_one(
            {"job_id": job_id},
            {"$set": {
                "job_id": job_id,
                "study_id": study_id,
                "cache_key": cache_key,
                "chapters": chapters,
                "status": "processing",
                "progress": "queued",
                "created_at": _now_iso(),
            }},
            upsert=True,
        )

        background_tasks.add_task(
            _run_be_thesis_ai_generation,
            study_id, job_id, cache_key,
            chapters, request.extra_prompt or "",
            from_iso, to_iso, seg_filter,
        )
        return {"status": "processing", "job_id": job_id, "cache_key": cache_key}

    @brand_equity_router.get("/studies/{study_id}/thesis-ai-status/{job_id}")
    async def thesis_ai_status(
        study_id: str, job_id: str,
        current_user=Depends(get_current_user),
    ):
        """Poll job status. Returns status + progress (chapter_X) + error."""
        from server import UserRole
        if current_user.role not in {UserRole.ADMIN, UserRole.CURRENT_STUDENT, UserRole.ALUMNI}:
            raise HTTPException(403)

        # If job_id IS a cache_key (cache hit path), short-circuit to ready
        if job_id.startswith("be_thesis_") and "_" in job_id and job_id.count("_") >= 4:
            cached = await db.brand_thesis_cache.find_one(
                {"cache_key": job_id, "study_id": study_id,
                 "schema_version": BE_ANALYSIS_SCHEMA_VERSION}, {"_id": 0},
            )
            if cached:
                return {"status": "ready", "cache_key": job_id, "cached": True}
        job = await db.brand_thesis_jobs.find_one({"job_id": job_id}, {"_id": 0})
        if not job:
            return {"status": "not_found"}
        return {
            "status": job.get("status", "unknown"),
            "progress": job.get("progress"),
            "cache_key": job.get("cache_key"),
            "error": job.get("error"),
        }

    @brand_equity_router.get("/studies/{study_id}/thesis-ai-download")
    async def thesis_ai_download(
        study_id: str,
        cache_key: str = Query(...),
        current_user=Depends(get_current_user),
    ):
        """Download the generated DOCX (renders cached markdown via shared docx engine)."""
        from fastapi.responses import Response
        from server import UserRole
        if current_user.role not in {UserRole.ADMIN, UserRole.CURRENT_STUDENT, UserRole.ALUMNI}:
            raise HTTPException(403)

        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)

        cached = await db.brand_thesis_cache.find_one(
            {"cache_key": cache_key, "study_id": study_id,
             "schema_version": BE_ANALYSIS_SCHEMA_VERSION}, {"_id": 0},
        )
        if not cached or not cached.get("ai_content"):
            raise HTTPException(404, "ยังไม่มีเนื้อหาวิทยานิพนธ์ — กรุณาสร้างก่อน")

        ai_md = cached["ai_content"]
        respondent_count = cached.get("n_filtered", 0)
        title = study.get("brand", {}).get("name") or "Brand"
        logging.info(f"[BE-Thesis-DL] cache_key={cache_key[:60]} ai_md_len={len(ai_md or '')}")

        # Extract & replace mermaid blocks BEFORE the markdown→docx engine sees them,
        # otherwise raw `mermaid` source would be rendered as a code block.
        # If mermaid-cli is missing on the host (e.g. production container without
        # mmdc setup), we still let render proceed — just no diagrams in appendix.
        ai_md_clean = ai_md
        rendered_mermaids = []
        try:
            from .be_thesis_mermaid import replace_mermaid_blocks_with_markers, render_mermaid_to_png
            ai_md_clean, mermaid_blocks = replace_mermaid_blocks_with_markers(ai_md)
            for bid, code in mermaid_blocks:
                try:
                    png = await asyncio.to_thread(render_mermaid_to_png, code)
                    if png:
                        rendered_mermaids.append((bid, png))
                except Exception as e:
                    logging.warning(f"[BE-Thesis-DL] mermaid block {bid} failed: {e}")
        except Exception as e:
            logging.warning(f"[BE-Thesis-DL] mermaid pipeline disabled: {e}")
            ai_md_clean = ai_md  # fall back to original markdown if pipeline broken

        # Render base DOCX from AI markdown — this is the CRITICAL step.
        # If THIS fails we cannot serve anything, so do NOT swallow that error.
        try:
            from server import _create_thesis_docx
            base_bytes = await asyncio.to_thread(
                _create_thesis_docx, title, respondent_count, ai_md_clean,
            )
            logging.info(f"[BE-Thesis-DL] base docx rendered: {len(base_bytes)} bytes")
        except Exception as e:
            logging.exception(f"[BE-Thesis-DL] BASE DOCX render failed: {e}")
            raise HTTPException(500, f"DOCX render error: {str(e)[:200]}")

        # Enrich with charts + comprehensive data tables + mermaid figures.
        # If THIS fails (e.g. missing Thai font on host, matplotlib backend issue),
        # we fall back to the base DOCX — user still gets a usable thesis.
        docx_bytes = base_bytes
        try:
            # Recompute aggregate so the appendix has fresh chart-friendly stats
            all_responses = await db.brand_responses.find(
                {"study_id": study_id}, {"_id": 0}
            ).to_list(5000)
            agg_for_appendix = _aggregate_responses(
                study, all_responses,
                normalized=(study.get("ai_cache") or {}).get("normalized_by_question") or {},
            )
            from .be_thesis_appendix import enrich_thesis_docx
            docx_bytes = await asyncio.to_thread(
                enrich_thesis_docx, base_bytes,
                study=study, aggregate=agg_for_appendix,
                mermaid_figures=rendered_mermaids,
            )
            logging.info(f"[BE-Thesis-DL] enriched docx: {len(docx_bytes)} bytes "
                         f"(+{len(docx_bytes) - len(base_bytes)} from appendix)")
        except Exception as e:
            logging.exception(f"[BE-Thesis-DL] appendix enrich failed — falling back to base: {e}")
            docx_bytes = base_bytes  # graceful degradation

        brand_safe = "".join(c if c.isalnum() else "_" for c in title) or "brand"
        ch_label = ""
        if "thesis" in cache_key:
            # cache_key looks like be_thesis_{studyid}_{ch1_ch2_..}_{sig}[..]
            parts = cache_key.split("_")
            # find the chunk between studyid and sig — chapters are digits joined by _
            digits = [p for p in parts if p.isdigit() and len(p) == 1]
            if digits:
                ch_label = "_Ch" + "Ch".join(digits)
        filename = f"BE_Thesis_{brand_safe}{ch_label}.docx"

        return Response(
            content=docx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    @brand_equity_router.get("/studies/{study_id}/dashboard")
    async def get_dashboard(
        study_id: str,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None, description="JSON-encoded {field:[values]}"),
        wave: Optional[str] = Query(None, description="latest | all | <wave_number>"),
        current_user=Depends(get_current_user),
    ):
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)

        all_responses = await db.brand_responses.find(
            {"study_id": study_id}, {"_id": 0}
        ).to_list(5000)

        seg_filter = _parse_segments_param(segments)

        # Resolve wave param → adjust from_iso/to_iso accordingly.
        # Explicit from/to passed via query take precedence over the wave bounds
        # (so the existing date-range filter UI continues to work intact).
        wave_history = study.get("wave_history") or []
        wave_from, wave_to, wave_label = _wave_bounds(wave_history, wave)
        eff_from = from_iso or wave_from
        eff_to = to_iso or wave_to

        filtered = _apply_response_filter(
            all_responses, from_iso=eff_from, to_iso=eff_to, segments=seg_filter,
        )

        sig = _filter_signature(eff_from, eff_to, seg_filter)
        ai_cache_active = _resolve_ai_cache(study, sig)
        normalized = ai_cache_active.get("normalized_by_question") or \
                     (study.get("ai_cache") or {}).get("normalized_by_question") or {}
        agg = _aggregate_responses(study, filtered, normalized=normalized)

        # Per-wave response counts for the UI selector.
        waves_summary = []
        for w in (wave_history or []):
            wf, wt, _ = _wave_bounds(wave_history, str(w.get("wave")))
            wn = len(_apply_response_filter(all_responses, from_iso=wf, to_iso=wt))
            waves_summary.append({
                "wave": w.get("wave"),
                "published_at": w.get("published_at"),
                "by": w.get("by"),
                "questions_changed": w.get("questions_changed"),
                "questions_total": w.get("questions_total"),
                "n_responses": wn,
            })

        return {
            "study": study,
            "aggregate": agg,
            "ai_cache": ai_cache_active,
            "ready_for_dashboard": len(filtered) >= 10,
            "filter": {
                "from": eff_from, "to": eff_to, "segments": seg_filter,
                "signature": sig, "wave": wave or "all", "wave_label": wave_label,
            },
            "responses_total": len(all_responses),
            "responses_filtered": len(filtered),
            "segments_available": _segments_available(
                all_responses, study.get("segments_to_capture") or []
            ),
            "waves": waves_summary,
            "migration_meta": study.get("migration_meta") or {},
        }

    @brand_equity_router.post("/studies/{study_id}/compare")
    async def compare_waves(
        study_id: str,
        body: Dict[str, Any],
        current_user=Depends(get_current_user),
    ):
        """Wave comparison — body: { wave_a: {from, to, segments}, wave_b: {...} }
        Returns BES + 4 Aaker scores + n for each wave + delta."""
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)

        all_responses = await db.brand_responses.find(
            {"study_id": study_id}, {"_id": 0}
        ).to_list(5000)

        normalized_all = (study.get("ai_cache") or {}).get("normalized_by_question") or {}

        def _wave_summary(wave: Dict[str, Any]) -> Dict[str, Any]:
            f_iso = (wave or {}).get("from")
            t_iso = (wave or {}).get("to")
            segs = (wave or {}).get("segments") or {}
            if isinstance(segs, str):
                segs = _parse_segments_param(segs)
            filtered = _apply_response_filter(
                all_responses, from_iso=f_iso, to_iso=t_iso, segments=segs,
            )
            agg = _aggregate_responses(study, filtered, normalized=normalized_all)
            return {
                "filter": {"from": f_iso, "to": t_iso, "segments": segs},
                "n": len(filtered),
                "composite": agg.get("composite") or {},
            }

        wave_a = _wave_summary(body.get("wave_a") or {})
        wave_b = _wave_summary(body.get("wave_b") or {})

        # Compute delta (b - a) for each shared dimension
        deltas: Dict[str, Any] = {}
        for k in set((wave_a["composite"] or {}).keys()) | set((wave_b["composite"] or {}).keys()):
            a = wave_a["composite"].get(k)
            b = wave_b["composite"].get(k)
            if a is not None and b is not None:
                deltas[k] = round(b - a, 1)
            else:
                deltas[k] = None

        return {
            "wave_a": wave_a,
            "wave_b": wave_b,
            "deltas": deltas,
            "responses_total": len(all_responses),
        }


    # ---- AI generation (background) ----

    async def _set_progress(study_id: str, cache_path: str, *,
                            step: int, total: int, phase: str,
                            started_at: Optional[float] = None):
        """Write live progress to the study's ai_cache for the UI polling loop.
        `phase` is a short Thai label shown in the progress card."""
        import time as _t
        elapsed = round(_t.time() - started_at, 1) if started_at else 0
        await db.brand_studies.update_one({"id": study_id}, {
            "$set": {
                f"{cache_path}.progress": {
                    "step": step, "total": total, "phase": phase,
                    "elapsed_sec": elapsed, "pct": round(step / max(total, 1) * 100, 1),
                },
                f"{cache_path}.updated_at": _now_iso(),
            }
        })

    async def _run_ai_analysis(
        study_id: str,
        from_iso: Optional[str] = None,
        to_iso: Optional[str] = None,
        segments: Optional[Dict[str, List[str]]] = None,
    ):
        """Background AI job: normalize → themes → identity-image → master insights.
        Each phase publishes a `progress` dict (step/total/phase/elapsed_sec/pct) to
        the same ai_cache the dashboard polls, so the UI can render a live status
        card without any extra round-trips.

        When filter params are provided, results are stored in
        `ai_cache_by_filter.<sig>` instead of the top-level `ai_cache`."""
        import time as _t
        started = _t.time()
        sig = _filter_signature(from_iso, to_iso, segments)
        cache_path = "ai_cache" if sig == "all" else f"ai_cache_by_filter.{sig}"
        TOTAL_STEPS = 4
        try:
            study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
            if not study:
                return
            all_resp = await db.brand_responses.find(
                {"study_id": study_id}, {"_id": 0}
            ).to_list(5000)
            responses = _apply_response_filter(
                all_resp, from_iso=from_iso, to_iso=to_iso, segments=segments,
            )
            if not responses:
                await db.brand_studies.update_one({"id": study_id},
                    {"$set": {f"{cache_path}.status": "no_data",
                              f"{cache_path}.updated_at": _now_iso()}})
                return

            await db.brand_studies.update_one({"id": study_id},
                {"$set": {f"{cache_path}.status": "running",
                          f"{cache_path}.updated_at": _now_iso()}})

            # ---- Phase 1/4: Normalize open-ended brand/concept responses ----
            await _set_progress(study_id, cache_path, step=1, total=TOTAL_STEPS,
                                phase="Normalize · จัดกลุ่มชื่อแบรนด์/คำใกล้เคียง",
                                started_at=started)
            normalized_by_q: Dict[str, dict] = {}
            brand_list = [study["brand"]["name"]] + (study["brand"].get("competitors") or [])
            category = study["brand"].get("category", "")
            for q in study["questions"]:
                ap = q.get("ai_processing")
                if ap not in ("extract_brand", "extract_brands", "word_cloud"):
                    continue
                open_resps: List[str] = []
                for r in responses:
                    for a in r.get("answers", []):
                        if a.get("question_id") == q["id"] and a.get("value"):
                            open_resps.append(str(a["value"]))
                if not open_resps:
                    continue
                kind = "brand_single" if ap == "extract_brand" else \
                       "brand_multi"  if ap == "extract_brands" else "concept"
                norm = await _ai_normalize_open(open_resps, kind, brand_list, category)
                if norm.get("counts"):
                    normalized_by_q[q["id"]] = norm

            # Recompute aggregate WITH normalized counts (so master insights see canonical buckets)
            agg = _aggregate_responses(study, responses, normalized=normalized_by_q)

            # ---- Phase 2/4: Extract themes per open question ----
            await _set_progress(study_id, cache_path, step=2, total=TOTAL_STEPS,
                                phase="Themes · สกัด theme จากคำตอบเปิด",
                                started_at=started)
            themes_by_q: Dict[str, List[dict]] = {}
            for q in study["questions"]:
                if q.get("ai_processing") == "theme_extraction" and q["type"] == "open_long":
                    open_resps: List[str] = []
                    for r in responses:
                        for a in r.get("answers", []):
                            if a.get("question_id") == q["id"] and a.get("value"):
                                open_resps.append(str(a["value"]))
                    if open_resps:
                        themes = await _ai_extract_themes(open_resps, context=q.get("prompt", ""))
                        themes_by_q[q["id"]] = themes

            # ---- Phase 3/4: Identity vs Image alignment ----
            await _set_progress(study_id, cache_path, step=3, total=TOTAL_STEPS,
                                phase="Identity ↔ Image · เทียบอัตลักษณ์ vs ภาพลักษณ์",
                                started_at=started)
            personality_q = next((q for q in study["questions"]
                                  if q.get("ai_processing") == "extract_personality"), None)
            identity_image = {}
            if personality_q:
                p_resps = []
                for r in responses:
                    for a in r.get("answers", []):
                        if a.get("question_id") == personality_q["id"] and a.get("value"):
                            p_resps.append(str(a["value"]))
                # Also include "image_one_word"
                for q in study["questions"]:
                    if q.get("ai_processing") == "word_cloud":
                        for r in responses:
                            for a in r.get("answers", []):
                                if a.get("question_id") == q["id"] and a.get("value"):
                                    p_resps.append(str(a["value"]))
                if p_resps:
                    identity_image = await _ai_identity_image(
                        study["identity"]["traits"], p_resps, study["brand"]["name"],
                    )

            # ---- Phase 4/4: Master Insights ----
            await _set_progress(study_id, cache_path, step=4, total=TOTAL_STEPS,
                                phase="Master Insights · สรุปข้อเสนอแนะเชิงกลยุทธ์",
                                started_at=started)
            insights = await _ai_master_insights(study, agg)

            cache_payload = {
                "status": "ready",
                "normalized_by_question": normalized_by_q,
                "themes_by_question": themes_by_q,
                "identity_image": identity_image,
                "master_insights": insights,
                "updated_at": _now_iso(),
                "progress": {
                    "step": TOTAL_STEPS, "total": TOTAL_STEPS,
                    "phase": "เสร็จสมบูรณ์",
                    "elapsed_sec": round(_t.time() - started, 1),
                    "pct": 100.0,
                },
                "filter": {
                    "from": from_iso, "to": to_iso, "segments": segments or {},
                    "n": len(responses),
                },
            }
            await db.brand_studies.update_one({"id": study_id}, {
                "$set": {
                    cache_path: cache_payload,
                    "updated_at": _now_iso(),
                },
            })
            logging.info(f"[BrandEquity] AI analysis done for {study_id} (sig={sig}, n={len(responses)})")
        except Exception as e:
            logging.exception(f"[BrandEquity] AI analysis failed: {e}")
            await db.brand_studies.update_one({"id": study_id},
                {"$set": {f"{cache_path}.status": "error", f"{cache_path}.error": str(e)}})

    @brand_equity_router.post("/studies/{study_id}/ai-analyze")
    async def start_ai_analysis(
        study_id: str,
        bg: BackgroundTasks,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None),
        wave: Optional[str] = Query(None, description="latest | all | <wave_number>"),
        current_user=Depends(get_current_user),
    ):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)
        seg_filter = _parse_segments_param(segments)
        # Translate `wave` into time bounds so the cache signature reflects
        # the wave — each wave gets its own AI insights set, refreshable
        # independently, no cross-wave contamination.
        wave_from, wave_to, _ = _wave_bounds(study.get("wave_history") or [], wave)
        eff_from = from_iso or wave_from
        eff_to = to_iso or wave_to
        sig = _filter_signature(eff_from, eff_to, seg_filter)

        # Idempotency guard — refuse to enqueue another pipeline if one is already in-flight
        # FOR THIS FILTER SIGNATURE. Different filters / waves can run in parallel.
        cache_for_sig = _resolve_ai_cache(study, sig)
        cur_status = cache_for_sig.get("status")
        if cur_status in ("queued", "running"):
            return {"status": cur_status, "signature": sig,
                    "message": "AI analysis already in progress for this filter"}

        cache_path = "ai_cache" if sig == "all" else f"ai_cache_by_filter.{sig}"
        await db.brand_studies.update_one({"id": study_id},
            {"$set": {f"{cache_path}.status": "queued",
                      f"{cache_path}.updated_at": _now_iso()}})
        bg.add_task(_run_ai_analysis, study_id, eff_from, eff_to, seg_filter)
        return {"status": "queued", "signature": sig, "wave": wave or "all"}

    @brand_equity_router.get("/studies/{study_id}/ai-status")
    async def ai_status(
        study_id: str,
        from_iso: Optional[str] = Query(None, alias="from"),
        to_iso: Optional[str] = Query(None, alias="to"),
        segments: Optional[str] = Query(None),
        wave: Optional[str] = Query(None, description="latest | all | <wave_number>"),
        current_user=Depends(get_current_user),
    ):
        study = await db.brand_studies.find_one(
            {"id": study_id},
            {"_id": 0, "ai_cache": 1, "ai_cache_by_filter": 1,
             "owner_id": 1, "owner_email": 1, "wave_history": 1},
        )
        if not study:
            raise HTTPException(404)
        if not _owns(current_user, study):
            raise HTTPException(403)
        seg_filter = _parse_segments_param(segments)
        wave_from, wave_to, _ = _wave_bounds(study.get("wave_history") or [], wave)
        eff_from = from_iso or wave_from
        eff_to = to_iso or wave_to
        sig = _filter_signature(eff_from, eff_to, seg_filter)
        cache = _resolve_ai_cache(study, sig)
        if not cache:
            return {"status": "idle", "signature": sig, "wave": wave or "all"}
        return {**cache, "signature": sig, "wave": wave or "all"}

    return brand_equity_router
