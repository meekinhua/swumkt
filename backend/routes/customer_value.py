"""
Customer Value Lab
==================
A full-stack marketing tool built on the CBS04 principle:

    Customer Value = Benefit − Price (Cost)
    "ลูกค้าเลือกตัวเลือกที่ให้ Customer Value สูงสุดเสมอ"

Three lenses from the lecture:
  • Basic:   make people CHOOSE your option
  • Drucker: good marketing makes selling unnecessary (the offer self-sells)
  • Kotler:  managing customer VALUE + customer ENGAGEMENT

Modules powered by this module's API:
  1. Value Audit          — Benefit (functional/economic/psychological) vs
                            Cost (money/inconvenience/risk), our brand vs competitors
  2. AI Suggestions       — Gemini suggests which factors to ADD per category
                            (raise benefit / cut cost) grounded in the principle
  3. Perception Timeline  — over/under/balanced promise simulation (frontend math)
  4. Image Simulation     — Nano Banana renders the real product/service that the
                            chosen value proposition implies

Factory pattern mirrors routes/conjoint.py. Router prefix = /cv so all paths
resolve to /api/cv/... through the parent api_router(prefix="/api").
"""
import os
import uuid
import json
import logging
import base64
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

cv_router = APIRouter(prefix="/cv", tags=["customer-value"])

# Economical Gemini text model. gemini-2.5-flash-lite is not enabled on the
# Emergent universal key, so we use gemini-2.5-flash (the cheapest model that
# the key reliably accepts and the rest of the app already uses).
CV_TEXT_MODEL = "gemini-2.5-flash"
CV_IMAGE_MODEL = "gemini-3.1-flash-image-preview"  # Nano Banana (current)


# ============================ MODELS ============================
class CVBrandCreate(BaseModel):
    name: str
    is_ours: bool = False


class CVStudyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    industry: str = "generic"  # food | hotel | service | retail | generic
    brands: Optional[List[CVBrandCreate]] = None


class CVStudyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    industry: Optional[str] = None
    brands: Optional[List[Dict[str, Any]]] = None  # full brand objects from UI
    perception: Optional[Dict[str, Any]] = None
    needs: Optional[Dict[str, Any]] = None          # Need/Want/Demand module
    process: Optional[Dict[str, Any]] = None         # 5-step process module
    lens: Optional[Dict[str, Any]] = None            # Marketing Lens module


class CVAISuggestRequest(BaseModel):
    brand_id: str
    # functional | economic | love_belonging | esteem_status | money | inconvenience | risk
    category: str


class CVImageRequest(BaseModel):
    brand_id: str
    extra_prompt: Optional[str] = ""


class CVNeedsRequest(BaseModel):
    need: Optional[str] = ""
    want: Optional[str] = ""
    buying_power: Optional[str] = ""


class CVStepRequest(BaseModel):
    step: str  # research | stp | fourps | engagement | returns


# ===================== SCORING (mirror of frontend cv-lib.js) =====================
def _cat_score(factors: List[Dict[str, Any]]) -> float:
    """0-10 score for one benefit/cost category = capped sum of checked weights."""
    raw = sum(float(f.get("weight", 1)) for f in (factors or []) if f.get("checked"))
    return min(10.0, raw)


def _money_score(price: float, pmin: float, pmax: float) -> float:
    """Map monetary price to a 1-10 COST score (higher price = higher cost)."""
    if pmax <= pmin:
        return 5.0
    t = (float(price) - pmin) / (pmax - pmin)
    return max(1.0, min(10.0, 1.0 + t * 9.0))


def score_brand(brand: Dict[str, Any], industry_range: Dict[str, float]) -> Dict[str, Any]:
    """Compute benefit/cost/net value for a single brand. Range 0-100 each.

    Benefit has 3 equal dimensions per CBS04: Functional, Economic, Psychological.
    Psychological is itself made of two Maslow sub-dimensions (Love&Belonging +
    Esteem&Status); their checked weights combine into the single psychological
    dimension (capped at 10) so the 3 benefit dimensions stay equally weighted.
    """
    benefits = brand.get("benefits", {}) or {}
    costs = brand.get("costs", {}) or {}

    func = _cat_score(benefits.get("functional"))
    econ = _cat_score(benefits.get("economic"))
    love = _cat_score(benefits.get("love_belonging"))
    esteem = _cat_score(benefits.get("esteem_status"))
    psych = min(10.0, love + esteem)
    benefit_total = round((func + econ + psych) / 3.0 * 10.0, 1)

    money = _money_score(
        brand.get("price_value", industry_range.get("mid", 100)),
        industry_range.get("min", 0),
        industry_range.get("max", 200),
    )
    inconv = _cat_score(costs.get("inconvenience"))
    risk = _cat_score(costs.get("risk"))
    cost_total = round((money + inconv + risk) / 3.0 * 10.0, 1)

    return {
        "benefit_total": benefit_total,
        "cost_total": cost_total,
        "net_value": round(benefit_total - cost_total, 1),
        "breakdown": {
            "functional": round(func, 1), "economic": round(econ, 1),
            "love_belonging": round(love, 1), "esteem_status": round(esteem, 1),
            "psychological": round(psych, 1), "money": round(money, 1),
            "inconvenience": round(inconv, 1), "risk": round(risk, 1),
        },
    }


INDUSTRY_RANGES = {
    "food":    {"min": 30,  "mid": 120, "max": 400, "label": "ร้านอาหาร / เครื่องดื่ม"},
    "hotel":   {"min": 500, "mid": 2500, "max": 8000, "label": "โรงแรม / ที่พัก"},
    "service": {"min": 200, "mid": 1500, "max": 6000, "label": "บริการ"},
    "retail":  {"min": 50,  "mid": 500, "max": 3000, "label": "ค้าปลีก / สินค้า"},
    "generic": {"min": 0,   "mid": 100, "max": 200, "label": "ทั่วไป"},
}

CATEGORY_LABELS = {
    "functional": "Functional Benefit — ประโยชน์ตามฟังก์ชัน/คุณภาพ",
    "economic": "Economic Benefit — ความคุ้มค่าเชิงปริมาณ/ของแถม",
    "love_belonging": "Psychological · Love & Belonging — ความรัก/ความผูกพัน/การเป็นส่วนหนึ่ง",
    "esteem_status": "Psychological · Esteem & Status — ความภูมิใจ/สถานะ/การยอมรับ",
    "money": "Monetary Cost — ราคาที่เป็นตัวเงิน (รวมความพยายามที่ตีเป็นเงินได้)",
    "inconvenience": "Inconvenience — ความยากลำบากในการเข้าถึง (รวมเวลาที่เสียไป)",
    "risk": "Risk — ความเสี่ยงแฝง/ความไม่มั่นใจทางจิตใจ",
}

# Precise per-category guide so AI suggestions stay in the correct concept bucket
# (definition + what belongs + what does NOT belong → which category it goes to instead).
CATEGORY_GUIDE = {
    # ---- BENEFITS ----
    "functional": {
        "def": "หน้าที่และสมรรถนะพื้นฐานที่สินค้า/บริการพึงมีตามความคาดหวัง (ตัวสินค้าทำงานได้ดี)",
        "include": "คุณภาพ/รสชาติ, ประสิทธิภาพ/ความเสถียร, ความทนทาน, ความหลากหลายของตัวเลือก, ใช้งานง่าย",
        "exclude": "ปริมาณ/ของแถม/ความคุ้มเงิน → Economic ; ความฟิน/ภาพลักษณ์/สถานะ → Psychological(Love/Esteem)",
    },
    "economic": {
        "def": "ความคุ้มค่าที่จับต้องได้ในแง่ปริมาณ ปริมาตร หรือของแถม (ได้เยอะในราคาเท่าเดิม)",
        "include": "ปริมาณเยอะ/จานใหญ่พูน, ของแถม/น้ำซุปฟรี, ซื้อ 1 แถม 1, แพ็กคุ้ม, สะสมแต้ม/รับประกัน",
        "exclude": "คุณภาพ/รสชาติตัวสินค้า → Functional ; ความภูมิใจ/สถานะ → Esteem&Status",
    },
    "love_belonging": {
        "def": "ประโยชน์เชิงจิตวิทยาระดับความรักและการเป็นส่วนหนึ่ง (Maslow: Love & Belonging)",
        "include": "ตอบสนองความผูกพันในครอบครัว/แฟน/เพื่อน/สัตว์เลี้ยง, ร้าน Pet-friendly, พื้นที่รวมกลุ่ม/ชุมชน, ความอบอุ่นเป็นกันเอง",
        "exclude": "การอวด/สถานะ/ความพรีเมียม → Esteem&Status ; คุณภาพการใช้งาน → Functional",
    },
    "esteem_status": {
        "def": "ประโยชน์เชิงจิตวิทยาระดับความภูมิใจและสถานะทางสังคม (Maslow: Esteem & Status)",
        "include": "ความรู้สึกได้รับการยอมรับ, ซื้อเพื่ออวด/แสดงรสนิยม, ความพรีเมียม/หรูหรา, แบรนด์เนม, ภาพลักษณ์ไฮเอนด์",
        "exclude": "ความผูกพัน/ครอบครัว/ชุมชน → Love&Belonging ; ความคุ้มเงิน → Economic",
    },
    # ---- COSTS (เขียนเป็นมุมลบ) ----
    "money": {
        "def": "ราคาเงินสดที่ต้องควักจ่ายจริง (รวมความพยายาม/แรงที่ตีค่าเป็นเงินได้)",
        "include": "ราคาสูง/แพงกว่าคู่แข่ง, ค่าใช้จ่ายแฝง, ค่าบริการ/ภาษีเพิ่ม, ปริมาณไม่คุ้มเงิน, ค่าเดินทางที่เป็นเงิน",
        "exclude": "การเสียเวลา/ความยุ่งยากเชิงกระบวนการ → Inconvenience ; ความกลัว/ไม่มั่นใจ → Risk",
    },
    "inconvenience": {
        "def": "ความไม่สะดวกสบาย/เสียเวลา/ความยากลำบากในการเข้าถึงและใช้บริการ (รวม Time cost)",
        "include": "รอคิว/รอนาน, ทำเลไกล/เดินทางลำบาก/หายาก, ไม่มีที่จอดรถ, หน้าจอ/แอปใช้ยาก, ขั้นตอนยุ่งยาก, เวลาทำการจำกัด",
        "exclude": "เรื่องราคา/เงิน → Money ; ความกลัว ไม่มั่นใจ ความสะอาด ความปลอดภัย ของไม่ตรงปก → Risk",
    },
    "risk": {
        "def": "ความเสี่ยงแฝง — ความกลัว ความระแวง ความกังวล ด้านความปลอดภัย/ความสะอาด/ของไม่ตรงปก",
        "include": "กลัวคุณภาพไม่ดี/ไม่ตรงปก, กังวลความสะอาด/สุขอนามัย (เช่น ห้องน้ำสกปรก), กังวลความปลอดภัย, กลัวได้ของปลอม, ร้านใหม่ยังไม่น่าเชื่อถือ, ไม่มั่นใจบริการหลังการขาย",
        "exclude": "ราคา/เงิน → Money ; การเสียเวลา/ความยุ่งยากเชิงกระบวนการ (ที่ไม่ได้เกิดจากความกังวล) → Inconvenience",
    },
}

# Strategic tips from the CBS04 doc, surfaced as AI context per cost dimension.
STRATEGY_NOTES = {
    "money": "เกมตัดราคา (Price War) เป็นสนามรบของยักษ์ใหญ่ที่มี Economy of Scale — รายย่อยควรเลี่ยง ไปสู้จุดอื่นแทน",
    "inconvenience": "ลูกค้ามักยอมจ่ายแพงขึ้นเพื่อแลกกับความสะดวก (เช่น ซื้อของหน้าปากซอยแพงกว่าแต่ไม่ต้องเดินทางไกล)",
    "risk": "ร้านใหญ่/แบรนด์ที่น่าเชื่อถือมักได้เปรียบเรื่องความเสี่ยงต่ำ ลูกค้ายอมจ่ายแพงกว่าเพื่อตัดความเสี่ยงทิ้ง",
}


# ============================ FACTORY ============================
def get_customer_value_routes(db, get_current_user, get_current_user_optional):
    import server as _server
    User = _server.User
    UserRole = _server.UserRole
    compress_base64_image = _server.compress_base64_image

    async def _gemini_text(system_msg: str, prompt: str, session_id: str) -> str:
        """Single short Gemini text call on the cheapest model. The library
        send_message is monkey-patched (server.py) to run off the event loop
        with a process-wide semaphore + timeout, so this stays non-blocking."""
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured (EMERGENT_LLM_KEY missing)")
        chat = (
            LlmChat(api_key=api_key, session_id=session_id, system_message=system_msg)
            .with_model("gemini", CV_TEXT_MODEL)
            .with_params(timeout=90, num_retries=0)
        )
        return await chat.send_message(UserMessage(text=prompt))

    def _owns(study, user) -> bool:
        return study.get("creator_id") == user.id or user.role == UserRole.ADMIN

    # ---------------------------------------------------------------- CRUD
    @cv_router.post("/studies")
    async def create_study(req: CVStudyCreate, current_user: User = Depends(get_current_user)):
        sid = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        palette = ["#C8102E", "#1B75BC", "#0E5538", "#B8860B", "#6B21A8"]
        brands_in = req.brands or [CVBrandCreate(name="แบรนด์ของเรา", is_ours=True),
                                   CVBrandCreate(name="คู่แข่ง A", is_ours=False)]
        brands = []
        for i, b in enumerate(brands_in):
            brands.append({
                "id": str(uuid.uuid4()),
                "name": b.name,
                "is_ours": b.is_ours,
                "color": palette[i % len(palette)],
                "price_value": INDUSTRY_RANGES.get(req.industry, INDUSTRY_RANGES["generic"])["mid"],
                "benefits": {"functional": [], "economic": [], "love_belonging": [], "esteem_status": []},
                "costs": {"inconvenience": [], "risk": []},
                "image_url": None,
                "image_prompt": None,
            })
        doc = {
            "id": sid, "creator_id": current_user.id,
            "title": req.title, "description": req.description or "",
            "industry": req.industry, "brands": brands,
            "perception": {"profile": "C"},
            "needs": {"need": "", "want": "", "buying_power": ""},
            "process": {"research": {"notes": "", "done": False}, "stp": {"notes": "", "done": False},
                        "fourps": {"notes": "", "done": False}, "engagement": {"notes": "", "done": False},
                        "returns": {"notes": "", "done": False}},
            "lens": {"self_sell": 50},
            "created_at": now, "updated_at": now, "deleted_at": None,
        }
        await db.cv_studies.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @cv_router.get("/studies")
    async def list_studies(current_user: User = Depends(get_current_user)):
        q = {"deleted_at": None}
        if current_user.role != UserRole.ADMIN:
            q["creator_id"] = current_user.id
        rows = await db.cv_studies.find(q, {"_id": 0}).sort("updated_at", -1).to_list(500)
        # attach quick scores for list cards
        for s in rows:
            rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
            s["scores"] = {b["id"]: score_brand(b, rng) for b in s.get("brands", [])}
        return {"studies": rows}

    @cv_router.get("/studies/trash")
    async def list_trash(current_user: User = Depends(get_current_user)):
        q = {"deleted_at": {"$ne": None}}
        if current_user.role != UserRole.ADMIN:
            q["creator_id"] = current_user.id
        rows = await db.cv_studies.find(q, {"_id": 0}).sort("deleted_at", -1).to_list(500)
        return {"studies": rows}

    @cv_router.get("/studies/{study_id}")
    async def get_study(study_id: str, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Study not found")
        if not _owns(s, current_user):
            raise HTTPException(status_code=403, detail="Not authorized")
        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        s["scores"] = {b["id"]: score_brand(b, rng) for b in s.get("brands", [])}
        s["industry_range"] = rng
        return s

    @cv_router.put("/studies/{study_id}")
    async def update_study(study_id: str, req: CVStudyUpdate, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Study not found")
        if not _owns(s, current_user):
            raise HTTPException(status_code=403, detail="Not authorized")
        patch = {k: v for k, v in req.model_dump(exclude_unset=True).items() if v is not None}
        patch["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.cv_studies.update_one({"id": study_id}, {"$set": patch})
        s2 = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        rng = INDUSTRY_RANGES.get(s2.get("industry"), INDUSTRY_RANGES["generic"])
        s2["scores"] = {b["id"]: score_brand(b, rng) for b in s2.get("brands", [])}
        s2["industry_range"] = rng
        return s2

    @cv_router.delete("/studies/{study_id}")
    async def soft_delete(study_id: str, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=404, detail="Study not found")
        if not _owns(s, current_user):
            raise HTTPException(status_code=403, detail="Not authorized")
        await db.cv_studies.update_one(
            {"id": study_id}, {"$set": {"deleted_at": datetime.now(timezone.utc).isoformat()}})
        return {"ok": True}

    @cv_router.post("/studies/{study_id}/restore")
    async def restore(study_id: str, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        await db.cv_studies.update_one({"id": study_id}, {"$set": {"deleted_at": None}})
        return {"ok": True}

    # ------------------------------------------------------ AI SUGGESTIONS
    @cv_router.post("/studies/{study_id}/ai-suggest")
    async def ai_suggest(study_id: str, req: CVAISuggestRequest, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        brand = next((b for b in s.get("brands", []) if b["id"] == req.brand_id), None)
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")
        if req.category not in CATEGORY_LABELS:
            raise HTTPException(status_code=400, detail="Invalid category")

        is_cost = req.category in ("money", "inconvenience", "risk")
        existing = []
        if is_cost:
            existing = [f["label"] for f in (brand.get("costs", {}).get(req.category, []) or [])]
        else:
            existing = [f["label"] for f in (brand.get("benefits", {}).get(req.category, []) or [])]

        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        if is_cost:
            goal = ("ระบุ 'ต้นทุน / สิ่งที่ลูกค้าต้องเสียหรือเจ็บปวด' ในหมวดนี้ "
                    "(ยิ่งมีปัจจัยเหล่านี้มาก Customer Value ยิ่งลดลง)")
            framing = (
                "สำคัญมาก: เนื่องจากเป็นหมวด COST ปัจจัยทุกตัวต้องเขียนใน 'มุมลบ' "
                "คือ ปัญหา/อุปสรรค/สิ่งที่ลูกค้าต้องเสียหรือไม่พอใจ "
                "เช่น 'ที่จอดรถไม่เพียงพอ', 'รอคิวนาน', 'ขั้นตอนสั่งซื้อยุ่งยาก', 'กลัวได้ของไม่ตรงปก'. "
                "ห้ามเขียนเป็นทางแก้หรือมุมบวกเด็ดขาด (อย่าเขียน 'ที่จอดรถเพียงพอ' หรือ 'ระบบจองคิวสะดวก').\n"
            )
            rationale_hint = "rationale: เหตุผลสั้นๆ ว่าทำไมสิ่งนี้เป็นต้นทุนที่ทำให้ลูกค้าลังเล / คุณค่าลดลง"
        else:
            goal = "เพิ่มประโยชน์/คุณค่าที่ลูกค้าจะได้รับในหมวดนี้ (Benefit สูงขึ้น → Customer Value สูงขึ้น)"
            framing = (
                "ปัจจัยทุกตัวต้องเขียนใน 'มุมบวก' คือ ประโยชน์/จุดเด่นที่ลูกค้าได้รับ "
                "เช่น 'รสชาติอร่อยเข้มข้น', 'บริการรวดเร็ว'.\n"
            )
            rationale_hint = "rationale: เหตุผลสั้นๆ ว่าช่วยเพิ่มคุณค่าให้ลูกค้าอย่างไร"

        system = (
            "คุณเป็นที่ปรึกษาการตลาดที่ยึดหลัก Kotler (บริหาร Customer Value + Engagement) "
            "และ Drucker (ทำให้สินค้าขายได้ด้วยตัวเอง). "
            "ตอบเป็นภาษาไทย และตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON."
        )
        guide = CATEGORY_GUIDE.get(req.category, {})
        strat = STRATEGY_NOTES.get(req.category, "")
        prompt = (
            f"ธุรกิจ: {rng['label']} | แบรนด์: {brand['name']}\n"
            f"หมวดที่ต้องการคำแนะนำ: {CATEGORY_LABELS[req.category]}\n"
            f"นิยามของหมวดนี้: {guide.get('def', '')}\n"
            f"สิ่งที่อยู่ในหมวดนี้: {guide.get('include', '')}\n"
            f"สิ่งที่ 'ไม่ใช่' หมวดนี้ (ห้ามเสนอ เพราะอยู่หมวดอื่น): {guide.get('exclude', '')}\n"
            + (f"ข้อสังเกตเชิงกลยุทธ์: {strat}\n" if strat else "")
            + f"เป้าหมาย: {goal}\n"
            f"{framing}"
            f"ปัจจัยที่มีอยู่แล้ว (อย่าซ้ำ): {existing or 'ยังไม่มี'}\n\n"
            "เสนอ 4-5 ปัจจัยใหม่ที่ 'ตรงกับนิยามหมวดนี้เท่านั้น' โดยแต่ละปัจจัยให้:\n"
            "- label: ชื่อปัจจัยสั้นๆ ภาษาไทย (เป็นรูปธรรม จับต้องได้ และตรงตามมุม+นิยามที่กำหนด)\n"
            "- weight: ความสำคัญ/ความรุนแรง 1-3 (3=มากที่สุด)\n"
            f"- {rationale_hint}\n"
            "- principle: หนึ่งใน ['kotler-value','kotler-engagement','drucker-selfsell']\n\n"
            "ก่อนตอบ ให้ตรวจสอบทุกปัจจัยว่าตรงนิยามหมวดนี้จริง ถ้าเข้าหมวดอื่นให้ตัดทิ้ง\n"
            'รูปแบบ JSON: {"suggestions":[{"label":"...","weight":2,"rationale":"...","principle":"kotler-value"}]}'
        )
        try:
            raw = await _gemini_text(system, prompt, f"cv-suggest-{study_id}-{req.category}")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"CV ai-suggest error: {e}")
            raise HTTPException(status_code=500, detail="AI suggestion failed")

        suggestions = _parse_suggestions(raw)
        return {"category": req.category, "is_cost": is_cost, "suggestions": suggestions}

    # ------------------------------------------------------ AI ANALYSIS
    @cv_router.post("/studies/{study_id}/ai-analysis")
    async def ai_analysis(study_id: str, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        lines = []
        for b in s.get("brands", []):
            sc = score_brand(b, rng)
            tag = "(เรา)" if b.get("is_ours") else "(คู่แข่ง)"
            lines.append(
                f"- {b['name']} {tag}: Benefit={sc['benefit_total']}, Cost={sc['cost_total']}, "
                f"Net Value={sc['net_value']} | breakdown={sc['breakdown']}"
            )
        system = (
            "คุณเป็นที่ปรึกษากลยุทธ์การตลาดระดับสูง ยึดหลัก Customer Value = Benefit − Price, "
            "Kotler (value + engagement) และ Drucker (make selling unnecessary). ตอบเป็น Markdown ภาษาไทย."
        )
        prompt = (
            f"ธุรกิจ: {rng['label']}\nผลการประเมิน Customer Value ของแต่ละแบรนด์:\n"
            + "\n".join(lines)
            + "\n\nเขียนบทวิเคราะห์เชิงกลยุทธ์ กระชับ มีหัวข้อ:\n"
            "1. ใครชนะด้านคุณค่า และเพราะอะไร (อ้างตัวเลข)\n"
            "2. ช่องว่างของแบรนด์เรา — ควรเพิ่ม Benefit หมวดใด / ลด Cost หมวดใด\n"
            "3. กลยุทธ์ทำให้ 'ขายได้ด้วยตัวเอง' (Drucker) + สร้าง engagement (Kotler)\n"
            "4. คำแนะนำที่ลงมือทำได้ทันที 3 ข้อ"
        )
        try:
            md = await _gemini_text(system, prompt, f"cv-analysis-{study_id}")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"CV ai-analysis error: {e}")
            raise HTTPException(status_code=500, detail="AI analysis failed")
        await db.cv_studies.update_one(
            {"id": study_id},
            {"$set": {"ai_analysis": md, "ai_analysis_at": datetime.now(timezone.utc).isoformat()}})
        return {"analysis": md}

    # ------------------------------------------------------ AI: NEED → WANT → DEMAND
    @cv_router.post("/studies/{study_id}/ai-needs")
    async def ai_needs(study_id: str, req: CVNeedsRequest, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        ours = next((b for b in s.get("brands", []) if b.get("is_ours")), (s.get("brands") or [{}])[0])
        system = (
            "คุณเป็นที่ปรึกษาการตลาด สอนเรื่อง Need vs Want vs Demand. "
            "Need=ความต้องการดิบจากธรรมชาติ, Want=Need ที่ถูกหล่อหลอมด้วยวัฒนธรรมจนเจาะจงเป็นสินค้า, "
            "Demand=Want ที่มี Buying Power (กำลังซื้อ/สิทธิ์จริง) รองรับเท่านั้น. "
            "ตอบเป็นภาษาไทย และตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON."
        )
        prompt = (
            f"ธุรกิจ: {rng['label']} | แบรนด์: {ours.get('name','ของเรา')}\n"
            f"Need ที่ผู้ใช้ระบุ: {req.need or '(ยังไม่ระบุ)'}\n"
            f"Want ที่ผู้ใช้ระบุ: {req.want or '(ยังไม่ระบุ)'}\n"
            f"Buying Power ที่ผู้ใช้ระบุ: {req.buying_power or '(ยังไม่ระบุ)'}\n\n"
            "ช่วยวิเคราะห์และเติมเต็มให้ ตอบ JSON ดังนี้:\n"
            '{"need":"ความต้องการดิบที่แท้จริง","want":"Want ที่เจาะจงตามวัฒนธรรมกลุ่มเป้าหมาย",'
            '"buying_power":"ประเมินกำลังซื้อ/สิทธิ์ของกลุ่มเป้าหมาย",'
            '"is_real_demand":true,"demand_verdict":"สรุปสั้นๆว่านับเป็น Demand จริงไหม เพราะอะไร",'
            '"tips":["คำแนะนำสั้นๆ 2-3 ข้อ ในการเปลี่ยน Want ให้เป็น Demand"]}'
        )
        try:
            raw = await _gemini_text(system, prompt, f"cv-needs-{study_id}")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"CV ai-needs error: {e}")
            raise HTTPException(status_code=500, detail="AI needs analysis failed")
        data = _parse_json_obj(raw)
        return {"result": data}

    # ------------------------------------------------------ AI: 5-STEP PROCESS
    _STEP_LABELS = {
        "research": "ขั้นที่ 1 — เข้าใจตลาดและความต้องการ (Market Research: Need & Want)",
        "stp": "ขั้นที่ 2 — วางกลยุทธ์ STP (Segmentation, Targeting, Positioning)",
        "fourps": "ขั้นที่ 3 — สร้างโปรแกรมคุณค่า 4Ps (Product, Price, Place, Promotion)",
        "engagement": "ขั้นที่ 4 — สร้างความสัมพันธ์และความรักแบรนด์ (Engagement)",
        "returns": "ขั้นที่ 5 — เก็บเกี่ยวผลตอบแทนเชิงคุณค่า (Capture Value / Return / ROI)",
    }

    @cv_router.post("/studies/{study_id}/ai-step")
    async def ai_step(study_id: str, req: CVStepRequest, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        if req.step not in _STEP_LABELS:
            raise HTTPException(status_code=400, detail="Invalid step")
        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        ours = next((b for b in s.get("brands", []) if b.get("is_ours")), (s.get("brands") or [{}])[0])
        needs = s.get("needs", {}) or {}
        system = (
            "คุณเป็นที่ปรึกษาการตลาดที่ยึดกระบวนการตลาด 5 ขั้นของ Kotler. "
            "ตอบเป็นภาษาไทย และตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON."
        )
        prompt = (
            f"ธุรกิจ: {rng['label']} | แบรนด์: {ours.get('name','ของเรา')}\n"
            f"บริบท Need/Want: {needs.get('need','-')} / {needs.get('want','-')}\n"
            f"ขั้นตอนที่ต้องการคำแนะนำ: {_STEP_LABELS[req.step]}\n\n"
            "ให้คำแนะนำที่ลงมือทำได้จริงเฉพาะขั้นตอนนี้ ตอบ JSON:\n"
            '{"summary":"อธิบายเป้าหมายของขั้นตอนนี้ใน 1-2 ประโยค",'
            '"checklist":["สิ่งที่ต้องทำเป็นข้อๆ 4-5 ข้อ เฉพาะเจาะจงกับธุรกิจนี้"]}'
        )
        try:
            raw = await _gemini_text(system, prompt, f"cv-step-{study_id}-{req.step}")
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"CV ai-step error: {e}")
            raise HTTPException(status_code=500, detail="AI step guidance failed")
        data = _parse_json_obj(raw)
        return {"step": req.step, "result": data}


    # ------------------------------------------------------ IMAGE SIMULATION
    @cv_router.post("/studies/{study_id}/generate-image")
    async def generate_image(study_id: str, req: CVImageRequest, current_user: User = Depends(get_current_user)):
        s = await db.cv_studies.find_one({"id": study_id}, {"_id": 0})
        if not s or not _owns(s, current_user):
            raise HTTPException(status_code=404, detail="Study not found")
        brand = next((b for b in s.get("brands", []) if b["id"] == req.brand_id), None)
        if not brand:
            raise HTTPException(status_code=404, detail="Brand not found")

        rng = INDUSTRY_RANGES.get(s.get("industry"), INDUSTRY_RANGES["generic"])
        # Build a vivid prompt from the chosen value proposition (checked benefits).
        benefits = brand.get("benefits", {}) or {}
        chosen = []
        for cat in ("functional", "economic", "psychological"):
            chosen += [f["label"] for f in (benefits.get(cat) or []) if f.get("checked")]
        value_props = ", ".join(chosen[:8]) if chosen else "high quality, appealing"

        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="AI service not configured")

        prompt = (
            f"A professional, photorealistic product/service marketing photo for a "
            f"{rng['label']} business named '{brand['name']}'. "
            f"The offering should visually communicate these value propositions: {value_props}. "
            f"Clean studio or real-world setting, premium commercial photography, soft lighting, "
            f"high detail, no text overlays. {req.extra_prompt or ''}"
        ).strip()

        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = (
                LlmChat(api_key=api_key, session_id=f"cv-img-{study_id}-{req.brand_id}",
                        system_message="You are an AI product photographer.")
                .with_model("gemini", CV_IMAGE_MODEL)
                .with_params(modalities=["image", "text"])
            )
            _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
            if not images:
                raise HTTPException(status_code=502, detail="No image generated")
            image_base64 = images[0]["data"]
        except HTTPException:
            raise
        except Exception as e:
            logging.error(f"CV image gen error: {e}")
            raise HTTPException(status_code=500, detail=f"Image generation failed: {e}")

        import asyncio
        compressed = await asyncio.to_thread(
            compress_base64_image, image_base64, max_size_kb=150.0, target_dimension=720)
        data_url = f"data:image/jpeg;base64,{compressed}"
        # Offload to object storage to keep the document small.
        try:
            from lib.image_normalize import normalize_image_for_storage
            stable_url = await normalize_image_for_storage(data_url, "cv-simulation", study_id)
        except Exception as e:
            logging.warning(f"CV image storage fallback (kept data URL): {e}")
            stable_url = data_url

        # Persist on the brand.
        brands = s.get("brands", [])
        for b in brands:
            if b["id"] == req.brand_id:
                b["image_url"] = stable_url
                b["image_prompt"] = prompt
        await db.cv_studies.update_one(
            {"id": study_id}, {"$set": {"brands": brands, "updated_at": datetime.now(timezone.utc).isoformat()}})
        return {"image_url": stable_url, "prompt_used": prompt}

    return cv_router


def _parse_json_obj(raw: str) -> Dict[str, Any]:
    """Robustly parse a single JSON object from the model output."""
    if not raw:
        return {}
    txt = raw.strip()
    if "```" in txt:
        parts = txt.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{"):
                txt = p
                break
    start = txt.find("{")
    end = txt.rfind("}")
    if start != -1 and end != -1 and end > start:
        txt = txt[start:end + 1]
    try:
        return json.loads(txt)
    except Exception:
        return {}



def _parse_suggestions(raw: str) -> List[Dict[str, Any]]:
    """Robustly parse the model's JSON (strips ```json fences, finds the object)."""
    if not raw:
        return []
    txt = raw.strip()
    if "```" in txt:
        # take content between the first pair of fences
        parts = txt.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[4:].strip()
            if p.startswith("{") or p.startswith("["):
                txt = p
                break
    # find the outermost { } block
    start = txt.find("{")
    end = txt.rfind("}")
    if start != -1 and end != -1 and end > start:
        txt = txt[start:end + 1]
    try:
        data = json.loads(txt)
    except Exception:
        return []
    items = data.get("suggestions", data) if isinstance(data, dict) else data
    out = []
    if isinstance(items, list):
        for it in items:
            if not isinstance(it, dict):
                continue
            try:
                w = int(it.get("weight", 2))
            except Exception:
                w = 2
            out.append({
                "label": str(it.get("label", "")).strip()[:80],
                "weight": max(1, min(3, w)),
                "rationale": str(it.get("rationale", "")).strip()[:200],
                "principle": it.get("principle", "kotler-value"),
            })
    return [o for o in out if o["label"]]
