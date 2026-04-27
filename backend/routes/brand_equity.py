"""
Brand Equity / Brand Health Check Module
==========================================
Aaker's 4-Dimension framework: Awareness, Perceived Quality, Brand Identity, Brand Loyalty.
- Auto-generated question library + AI-powered question generation
- Stats engine (descriptive + inferential)
- AI theme extraction + Identity-Image alignment + Master insights
"""

import os
import uuid
import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from collections import Counter

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field

brand_equity_router = APIRouter(prefix="/brand-equity", tags=["Brand Equity"])

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

# Default trait pool (Aaker's 5-archetype + custom-friendly)
DEFAULT_TRAIT_POOL = [
    "Modern", "Classic", "Trustworthy", "Innovative", "Friendly", "Premium",
    "Affordable", "Exciting", "Reliable", "Sophisticated", "Bold", "Fun",
    "Professional", "Caring", "Energetic", "Calm", "Authentic", "Edgy",
    "Down-to-earth", "Aspirational", "Tech-savvy", "Traditional", "Playful", "Serious",
]


# ============ MODELS ============

class BrandSetup(BaseModel):
    name: str
    logo_url: Optional[str] = None
    category: str = "ทั่วไป"
    competitors: List[str] = []
    industry_context: Optional[str] = None


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


class ResponseSubmit(BaseModel):
    demographics: Dict[str, Any] = {}
    answers: List[Dict[str, Any]]  # [{question_id, value}]
    duration_sec: Optional[int] = 0


# ============ HELPERS ============

def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _generate_questions_from_template(brand_setup: BrandSetup, identity: IdentitySetup) -> List[dict]:
    """Generate question objects from template, filling in brand/competitors/etc."""
    questions = []
    primary_competitor = brand_setup.competitors[0] if brand_setup.competitors else "คู่แข่ง"
    brand_list = [brand_setup.name] + (brand_setup.competitors or [])
    trait_pool = list(set(DEFAULT_TRAIT_POOL + (identity.traits or [])))

    for dim, templates in TEMPLATE_LIB.items():
        for tmpl in templates:
            q = {
                "id": f"{tmpl['id']}-{uuid.uuid4().hex[:4]}",
                "template_id": tmpl["id"],
                "dimension": dim,
                "type": tmpl["type"],
                "kind": tmpl["kind"],
                "required": tmpl.get("required", False),
                "ai_processing": tmpl.get("ai_processing"),
                "prompt": tmpl["prompt_t"]
                    .replace("{brand}", brand_setup.name)
                    .replace("{category}", brand_setup.category)
                    .replace("{competitor}", primary_competitor)
                    .replace("{brand_promise}", identity.brand_promise or "ที่ตั้งใจไว้"),
            }
            if "scale" in tmpl:
                q["scale"] = tmpl["scale"]
            if "scale_left" in tmpl:
                q["scale_left"] = tmpl["scale_left"].replace("{brand}", brand_setup.name)
                q["scale_right"] = tmpl["scale_right"].replace("{competitor}", primary_competitor)
            if "help" in tmpl:
                q["help"] = tmpl["help"]
            if tmpl.get("options_t") == "brand_list":
                # Add some decoy brands
                decoys = ["Brand X", "Brand Y", "Brand Z"]
                q["options"] = brand_list + decoys[:max(0, 5 - len(brand_list))]
            elif tmpl.get("options_t") == "trait_list":
                q["options"] = trait_pool[:24]
                q["min"] = tmpl.get("min", 1)
                q["max"] = tmpl.get("max", 5)
            questions.append(q)
    return questions


# ============ STATS ENGINE ============

def _likert_stats(values: List[int], scale_max: int = 7) -> dict:
    if not values:
        return {"n": 0}
    n = len(values)
    mean = sum(values) / n
    sorted_v = sorted(values)
    median = sorted_v[n // 2] if n % 2 else (sorted_v[n // 2 - 1] + sorted_v[n // 2]) / 2
    var = sum((v - mean) ** 2 for v in values) / n
    std = var ** 0.5
    # T2B (top-2-box)
    t2b = sum(1 for v in values if v >= scale_max - 1) / n * 100
    b2b = sum(1 for v in values if v <= 2) / n * 100
    nq = (t2b - b2b)
    distribution = [sum(1 for v in values if v == i) for i in range(1, scale_max + 1)]
    return {
        "n": n, "mean": round(mean, 2), "median": median,
        "std": round(std, 2), "t2b": round(t2b, 1), "b2b": round(b2b, 1),
        "net": round(nq, 1), "distribution": distribution,
        "score_100": round(mean / scale_max * 100, 1),
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
    """7-pt comparative: 1=brand_left ดีมาก, 4=เท่ากัน, 7=brand_right ดีมาก."""
    if not values:
        return {"n": 0}
    n = len(values)
    mean = sum(values) / n
    favor_left = sum(1 for v in values if v <= 3) / n * 100
    favor_right = sum(1 for v in values if v >= 5) / n * 100
    neutral = 100 - favor_left - favor_right
    return {
        "n": n, "mean": round(mean, 2),
        "favor_left_pct": round(favor_left, 1),
        "favor_right_pct": round(favor_right, 1),
        "neutral_pct": round(neutral, 1),
    }


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

    for q in questions:
        qid = q["id"]
        values = by_q.get(qid, [])
        stats: Dict[str, Any] = {"n": len(values)}

        if q["type"] in ("likert_5", "likert_7"):
            scale_max = 5 if q["type"] == "likert_5" else 7
            numeric = [int(v) for v in values if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit())]
            stats = _likert_stats(numeric, scale_max)
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
                    }
        elif q["type"] == "open_long":
            # If AI normalized this open_long (e.g., extract_brands), use it; otherwise raw responses
            if q.get("ai_processing") in ("extract_brand", "extract_brands") and qid in normalized:
                norm = normalized[qid]
                stats = {
                    "n": norm.get("total", len(values)),
                    "counts": norm.get("counts", []),
                    "ai_normalized": True,
                    "responses": [v for v in values if v][:10],  # keep sample
                }
            else:
                stats = {"n": len(values), "responses": [v for v in values if v]}
        elif q["type"] == "comparative_7":
            numeric = [int(v) for v in values if isinstance(v, (int, float)) or (isinstance(v, str) and v.isdigit())]
            stats = _comparative_stats(numeric)

        out_questions.append({
            "id": qid, "dimension": q["dimension"], "type": q["type"],
            "kind": q.get("kind"), "prompt": q.get("prompt"),
            "stats": stats,
        })

    # Composite scores
    composite = {}
    for d in DIMENSIONS:
        if dim_aggregates[d]:
            composite[d] = round(sum(dim_aggregates[d]) / len(dim_aggregates[d]), 1)
        else:
            composite[d] = 0
    weights = study.get("weights") or {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25}
    total_w = sum(weights.values()) or 100
    overall = sum(composite[d] * weights.get(d, 25) for d in DIMENSIONS) / total_w
    composite["overall"] = round(overall, 1)

    # Awareness extras
    awareness_extras = {}
    aided_q = next((q for q in out_questions if q.get("kind") == "aided_recognition"), None)
    if aided_q and aided_q["stats"].get("counts"):
        target = study["brand"]["name"]
        target_count = next((c for c in aided_q["stats"]["counts"] if c["label"] == target), None)
        awareness_extras["aided_recognition_pct"] = target_count["pct"] if target_count else 0

    return {
        "total_responses": len(responses),
        "questions": out_questions,
        "composite": composite,
        "awareness_extras": awareness_extras,
    }


# ============ AI INTEGRATION ============

async def _gemini_call(prompt: str, system: str = "You are a brand strategy expert. Respond in Thai unless asked otherwise.") -> str:
    """Call Gemini via emergentintegrations. Returns text."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            return ""
        chat = LlmChat(
            api_key=api_key,
            session_id=f"brand-equity-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logging.error(f"[BrandEquity] Gemini error: {e}")
        return ""


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
        resp = await chat.send_message(msg)
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
    summary = {
        "brand": study["brand"]["name"],
        "category": study["brand"]["category"],
        "competitors": study["brand"]["competitors"],
        "intended_identity": study["identity"]["traits"],
        "scores": agg["composite"],
        "key_stats": [
            {"qid": q["id"], "kind": q["kind"], "stats": q["stats"]}
            for q in agg["questions"][:20]
        ],
    }
    prompt = f"""คุณคือ senior brand strategist วิเคราะห์ข้อมูล Brand Health ด้านล่าง สร้าง 5 actionable insights แต่ละ insight มี:
- headline: 1 บรรทัด
- evidence: เหตุผลโดยอ้างถึง stats (ระบุ qid)
- recommendation: 1 action ที่ทำได้จริง
- priority: high | medium | low

Data:
{json.dumps(summary, ensure_ascii=False)[:6000]}

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

    @brand_equity_router.get("/templates")
    async def list_templates():
        """Return raw template library for browsing/preview."""
        return {"library": TEMPLATE_LIB, "trait_pool": DEFAULT_TRAIT_POOL,
                "dimensions": DIMENSIONS, "dimension_labels": DIM_LABELS,
                "dimension_colors": DIM_COLORS, "question_types": QUESTION_TYPES}

    # ---- Studies CRUD ----

    @brand_equity_router.post("/studies")
    async def create_study(data: StudyCreate, current_user=Depends(get_current_user)):
        questions = _generate_questions_from_template(data.brand, data.identity)
        share_token = uuid.uuid4().hex[:12]
        study = {
            "id": str(uuid.uuid4()),
            "owner_id": current_user.id,
            "owner_email": current_user.email,
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
        cur = db.brand_studies.find({"owner_id": current_user.id}, {"_id": 0}).sort("updated_at", -1)
        items = await cur.to_list(200)
        # Attach response counts
        for s in items:
            s["response_count"] = await db.brand_responses.count_documents({"study_id": s["id"]})
        return {"studies": items, "total": len(items)}

    @brand_equity_router.get("/studies/{study_id}")
    async def get_study(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404, "Study not found")
        if study["owner_id"] != current_user.id:
            raise HTTPException(403, "Not authorized")
        study["response_count"] = await db.brand_responses.count_documents({"study_id": study_id})
        return study

    @brand_equity_router.put("/studies/{study_id}")
    async def update_study(study_id: str, data: StudyUpdate, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if study["owner_id"] != current_user.id:
            raise HTTPException(403, "Not authorized")
        update = {k: v.model_dump() if hasattr(v, "model_dump") else v
                  for k, v in data.model_dump().items() if v is not None}
        update["updated_at"] = _now_iso()
        await db.brand_studies.update_one({"id": study_id}, {"$set": update})
        out = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        out["response_count"] = await db.brand_responses.count_documents({"study_id": study_id})
        return out

    @brand_equity_router.delete("/studies/{study_id}")
    async def delete_study(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404, "Study not found")
        if study["owner_id"] != current_user.id:
            raise HTTPException(403, "Not authorized")
        await db.brand_studies.delete_one({"id": study_id})
        await db.brand_responses.delete_many({"study_id": study_id})
        return {"message": "Deleted"}

    @brand_equity_router.post("/studies/{study_id}/regenerate-questions")
    async def regenerate_questions(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if study["owner_id"] != current_user.id:
            raise HTTPException(403)
        brand = BrandSetup(**study["brand"])
        identity = IdentitySetup(**study["identity"])
        questions = _generate_questions_from_template(brand, identity)
        await db.brand_studies.update_one({"id": study_id},
            {"$set": {"questions": questions, "updated_at": _now_iso()}})
        return {"questions": questions}

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
        if study["owner_id"] != current_user.id:
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
        # Strip sensitive owner info
        return {
            "id": study["id"],
            "share_token": share_token,
            "brand": study["brand"],
            "identity": {"brand_promise": study["identity"].get("brand_promise")},
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
        resp = {
            "id": str(uuid.uuid4()),
            "study_id": study["id"],
            "respondent_id": None,  # anonymous
            "demographics": data.demographics,
            "answers": data.answers,
            "duration_sec": data.duration_sec,
            "started_at": _now_iso(),
            "submitted_at": _now_iso(),
            "channel": "public_link",
        }
        await db.brand_responses.insert_one(resp)
        return {"message": "Response saved", "id": resp["id"]}

    # ---- Responses (for owner) ----

    @brand_equity_router.get("/studies/{study_id}/responses")
    async def list_responses(study_id: str, limit: int = 200, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if study["owner_id"] != current_user.id:
            raise HTTPException(403)
        cur = db.brand_responses.find({"study_id": study_id}, {"_id": 0}).sort("submitted_at", -1).limit(limit)
        items = await cur.to_list(limit)
        return {"responses": items, "total": len(items)}

    # ---- Dashboard / analysis ----

    @brand_equity_router.get("/studies/{study_id}/dashboard")
    async def get_dashboard(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
        if not study:
            raise HTTPException(404)
        if study["owner_id"] != current_user.id:
            raise HTTPException(403)

        cur = db.brand_responses.find({"study_id": study_id}, {"_id": 0})
        responses = await cur.to_list(5000)

        ai_cache = study.get("ai_cache", {})
        normalized = ai_cache.get("normalized_by_question") or {}
        agg = _aggregate_responses(study, responses, normalized=normalized)

        return {
            "study": study,
            "aggregate": agg,
            "ai_cache": ai_cache,
            "ready_for_dashboard": len(responses) >= 10,
        }

    # ---- AI generation (background) ----

    async def _run_ai_analysis(study_id: str):
        """Background AI job: themes + identity-image + master insights."""
        try:
            study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0})
            if not study:
                return
            cur = db.brand_responses.find({"study_id": study_id}, {"_id": 0})
            responses = await cur.to_list(5000)
            if not responses:
                await db.brand_studies.update_one({"id": study_id},
                    {"$set": {"ai_cache.status": "no_data", "ai_cache.updated_at": _now_iso()}})
                return

            await db.brand_studies.update_one({"id": study_id},
                {"$set": {"ai_cache.status": "running", "ai_cache.updated_at": _now_iso()}})

            # ---- Step 1: Normalize open-ended brand/concept responses ----
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

            # Theme extraction per open question
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

            # Identity-Image
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

            # Master insights
            insights = await _ai_master_insights(study, agg)

            await db.brand_studies.update_one({"id": study_id}, {
                "$set": {
                    "ai_cache": {
                        "status": "ready",
                        "normalized_by_question": normalized_by_q,
                        "themes_by_question": themes_by_q,
                        "identity_image": identity_image,
                        "master_insights": insights,
                        "updated_at": _now_iso(),
                    },
                    "updated_at": _now_iso(),
                },
            })
            logging.info(f"[BrandEquity] AI analysis done for {study_id}")
        except Exception as e:
            logging.exception(f"[BrandEquity] AI analysis failed: {e}")
            await db.brand_studies.update_one({"id": study_id},
                {"$set": {"ai_cache.status": "error", "ai_cache.error": str(e)}})

    @brand_equity_router.post("/studies/{study_id}/ai-analyze")
    async def start_ai_analysis(study_id: str, bg: BackgroundTasks, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id})
        if not study:
            raise HTTPException(404)
        if study["owner_id"] != current_user.id:
            raise HTTPException(403)
        await db.brand_studies.update_one({"id": study_id},
            {"$set": {"ai_cache.status": "queued"}})
        bg.add_task(_run_ai_analysis, study_id)
        return {"status": "queued"}

    @brand_equity_router.get("/studies/{study_id}/ai-status")
    async def ai_status(study_id: str, current_user=Depends(get_current_user)):
        study = await db.brand_studies.find_one({"id": study_id}, {"_id": 0, "ai_cache": 1, "owner_id": 1})
        if not study:
            raise HTTPException(404)
        if study["owner_id"] != current_user.id:
            raise HTTPException(403)
        return study.get("ai_cache", {"status": "idle"})

    return brand_equity_router
