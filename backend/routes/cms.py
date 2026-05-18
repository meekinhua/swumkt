"""
CMS — Content Management for SWU MKT Marketing Research Platform
================================================================
Manages: Article, Insight, Case Story posts.
Sources: Brand Equity studies + Conjoint studies + cross-referenced CMS posts.
AI: Gemini 2.5 Flash (text/summary/translate) + Gemini Nano Banana (image gen).
Auth: Admin only (instructor role not formalised in UserRole).
Soft delete via `deleted_at`.
"""

import os
import uuid
import json
import asyncio
import logging
import base64
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Literal

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from lib.ttl_cache import async_ttl_cache, invalidate_prefix

cms_router = APIRouter(prefix="/cms", tags=["CMS"])

# ============ MODELS ============

POST_TYPES = ["article", "insight", "case_story", "announcement"]
PROMPT_SCOPES = ["text", "image", "summary", "translate"]


class SourceRef(BaseModel):
    type: Literal["be_study", "conjoint_study", "cms_post"]
    id: str
    title: Optional[str] = None


class CmsPostCreate(BaseModel):
    type: Literal["article", "insight", "case_story", "announcement"] = "article"
    title: str
    title_en: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    excerpt: Optional[str] = None
    body_md: Optional[str] = ""
    cover_image: Optional[str] = None  # base64 data URL
    cover_caption: Optional[str] = None
    read_min: Optional[int] = 5
    tags: Optional[List[str]] = []
    source_refs: Optional[List[SourceRef]] = []
    generation_meta: Optional[Dict[str, Any]] = None
    # Announcement-specific (also usable on any post type, but ignored by Learn UI)
    media: Optional[List["SlideMediaItem"]] = []          # multi-image + YouTube
    pinned_to_home: Optional[bool] = False                # surface on HomePage hero
    pinned_order: Optional[int] = 0                       # sort within pinned
    cta_url: Optional[str] = None                         # destination link (overrides default /learn/{slug})
    hero_title_lines: Optional[List[str]] = None          # 1-2 short lines shown in homepage hero (overrides title)
    hero_accent_idx: Optional[int] = 1                    # which hero line gets italic-accent red (0 or 1)


class CmsPostUpdate(BaseModel):
    title: Optional[str] = None
    title_en: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    excerpt: Optional[str] = None
    body_md: Optional[str] = None
    cover_image: Optional[str] = None
    cover_caption: Optional[str] = None
    read_min: Optional[int] = None
    tags: Optional[List[str]] = None
    source_refs: Optional[List[SourceRef]] = None
    status: Optional[Literal["draft", "published"]] = None
    media: Optional[List["SlideMediaItem"]] = None
    pinned_to_home: Optional[bool] = None
    pinned_order: Optional[int] = None
    cta_url: Optional[str] = None
    hero_title_lines: Optional[List[str]] = None
    hero_accent_idx: Optional[int] = None


class PromptTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    scope: Literal["text", "image", "summary", "translate"]
    post_type: Optional[Literal["article", "insight", "case_story", "announcement"]] = None
    template: str  # use {placeholders}
    is_default: Optional[bool] = False


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    template: Optional[str] = None
    is_default: Optional[bool] = None


class AITextRequest(BaseModel):
    base_prompt: str  # template text already filled by client OR raw prompt
    extra_prompt: Optional[str] = ""
    sources: Optional[List[SourceRef]] = []
    target_lang: Optional[Literal["th", "en", "auto"]] = "th"


class AIImageRequest(BaseModel):
    prompt: str
    style: Optional[str] = "editorial photograph, marketing magazine, modern Thai context"
    aspect: Optional[Literal["16:9", "1:1", "4:3", "9:16"]] = "16:9"


class AISummarizeRequest(BaseModel):
    sources: List[SourceRef]
    extra_prompt: Optional[str] = ""


class AITranslateRequest(BaseModel):
    text: str
    to: Literal["th", "en"]


# ============ LANDING PAGE MODELS ============

class SlideMediaItem(BaseModel):
    """A single media item attached to a hero slide.
    kind=`image` → src is URL (https://) or data: URI
    kind=`youtube` → src is YouTube URL or video id (we extract id at render)
    """
    kind: Literal["image", "youtube"] = "image"
    src: str
    alt: Optional[str] = ""
    caption: Optional[str] = ""


class LandingSlide(BaseModel):
    eyebrow: str
    heroPre: List[str]
    heroAccentIdx: int = 1
    lede: str
    mantra: List[str]
    mantraAccentIdx: int = 1
    image: str = ""  # legacy — single image fallback when `media` is empty
    imageAlt: Optional[str] = ""
    imageCaption: Optional[str] = ""
    media: List[SlideMediaItem] = []  # NEW — multi-image + YouTube; takes precedence over `image`
    cta_url: Optional[str] = None     # NEW — clickable destination for the whole slide (internal path or external URL)


class LandingTool(BaseModel):
    tag: str
    t: str  # title
    s: str  # subtitle/description
    p: str  # path


class LandingSection(BaseModel):
    eyebrow: Optional[str] = ""
    heading: Optional[str] = ""
    accent: Optional[str] = ""
    lede: Optional[str] = ""
    cta_label: Optional[str] = ""
    cta_path: Optional[str] = ""


class FeaturedConfig(BaseModel):
    mode: Literal["auto", "random", "fixed"] = "auto"
    count: int = 4
    ids: List[str] = []  # slugs for articles, study_ids for brands


class EditorPickConfig(BaseModel):
    enabled: bool = False
    study_id: Optional[str] = None       # BE study_id or CJ study_id
    study_method: Optional[Literal["brand_equity", "conjoint"]] = None
    headline: Optional[str] = None       # custom title; if blank use the study name
    subhead: Optional[str] = None        # short editorial blurb
    image_base64: Optional[str] = None   # uploaded or AI-gen image (no data: prefix)
    image_mime: Optional[str] = None     # e.g. image/png
    image_url: Optional[str] = None      # alt: http URL


class LandingDoc(BaseModel):
    slides: List[LandingSlide]
    tools: List[LandingTool]
    knowledge_hub: LandingSection
    about_band: LandingSection
    rotation_ms: Optional[int] = 5500
    featured_articles: Optional[FeaturedConfig] = None
    featured_brands: Optional[FeaturedConfig] = None
    showcase_editor_pick: Optional[EditorPickConfig] = None


# Default landing content — mirrors current HomePage.jsx hardcoded values.
DEFAULT_LANDING: Dict[str, Any] = {
    "key": "home",
    "rotation_ms": 5500,
    "slides": [
        {
            "eyebrow": "Consumer Foresight Lab · SWU MKT",
            "heroPre": ["เห็นในสิ่งที่ตลาด", "ยังมองไม่เห็น"],
            "heroAccentIdx": 1,
            "lede": "แพลตฟอร์มวิจัยตลาดของสาขาการตลาด มศว. — ใช้ data, AI และทฤษฎีการตลาดสากล เพื่อเห็นพฤติกรรมและความต้องการของผู้บริโภค ก่อนที่ตลาดจะส่งสัญญาณ",
            "mantra": ["วิจัย", "เห็นก่อน", "ชนะก่อน"],
            "mantraAccentIdx": 1,
            "image": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
            "imageAlt": "Bangkok night street — Thai consumer pulse",
            "imageCaption": "● BANGKOK PULSE · LIVE",
        },
        {
            "eyebrow": "Consumer Insight Studio · SWU MKT",
            "heroPre": ["อ่านใจ", "ผู้บริโภค", "ก่อนใคร"],
            "heroAccentIdx": 2,
            "lede": "อ่านความรู้สึก ความต้องการ และเหตุผลที่ลูกค้าเลือกแบรนด์ — ด้วยเครื่องมือมาตรฐานวิชาการที่นักการตลาดจริงใช้อยู่",
            "mantra": ["เห็น", "เข้าใจ", "นำตลาด"],
            "mantraAccentIdx": 2,
            "image": "https://images.unsplash.com/photo-1556560984-36a7ec2ba544?crop=entropy&cs=srgb&fm=jpg&q=85&w=900",
            "imageAlt": "Modern Thai marketing student — consumer of tomorrow",
            "imageCaption": "● FIELD RESEARCH · 2026",
        },
        {
            "eyebrow": "Marketing Intelligence · มศว.",
            "heroPre": ["รู้ก่อนตลาด", "หนึ่งก้าว"],
            "heroAccentIdx": 1,
            "lede": "Insight ที่เร็วกว่าเทรนด์ — งานวิจัยจริงจากสาขาการตลาด มศว. ที่นำสิ่งที่ลูกค้าจะชอบ มาบอกคุณก่อนคู่แข่ง",
            "mantra": ["Insight", "ที่เร็ว", "กว่าเทรนด์"],
            "mantraAccentIdx": 1,
            "image": "https://images.pexels.com/photos/4350061/pexels-photo-4350061.jpeg?auto=compress&cs=tinysrgb&w=900",
            "imageAlt": "Asian marketing team collaborating in modern cafe",
            "imageCaption": "● TEAM SYNC · MKT LAB",
        },
    ],
    "tools": [
        {"tag": "BRAND", "t": "Brand Health Check", "s": "วัด Brand Equity ตามกรอบ Aaker — Awareness · Quality · Identity · Loyalty อ่านสุขภาพแบรนด์ก่อนคู่แข่งจะรู้ตัว", "p": "/brand-equity"},
        {"tag": "RESEARCH", "t": "Conjoint Analysis", "s": "Choice-Based Conjoint + D-Optimal — รู้ว่าลูกค้ายอมแลกอะไรเพื่ออะไร ก่อนปล่อยสินค้าจริง", "p": "/market-research/conjoint-analysis"},
        {"tag": "CX", "t": "Customer Journey", "s": "แผนที่ touchpoint และ pain point — เห็นจุดที่ลูกค้าจะหลุดมือ ก่อนที่ยอดจะตก", "p": "/market-research"},
        {"tag": "PSYCH", "t": "Customer Perception", "s": "Perceptual Map + Sentiment AI — อ่านภาพแบรนด์ในหัวลูกค้า ก่อนที่ตลาดจะให้คำตอบ", "p": "/market-research"},
        {"tag": "PSYCH", "t": "Customer Behavior", "s": "EBM Decision-process analytics — เห็นว่าลูกค้าตัดสินใจซื้อยังไง ตั้งแต่ search ถึง post-purchase", "p": "/market-research"},
        {"tag": "TOOL", "t": "Survey Builder", "s": "ออกแบบแบบสอบถาม AI-assisted — ถามคำถามที่ใช่ ได้ insight ที่จริง", "p": "/market-research"},
        {"tag": "LEARN", "t": "Content Hub", "s": "ฐานความรู้การตลาด — อ่านเทรนด์ก่อนคนอื่น เชื่อมทฤษฎีกับเครื่องมือจริง", "p": "/learn"},
        {"tag": "WORKFLOW", "t": "Kanban Projects", "s": "จัดการทีมวิจัย — board, sprint, และ research log สำหรับ insight ที่ส่งทันเวลา", "p": "/projects"},
    ],
    "knowledge_hub": {
        "eyebrow": "● Knowledge Hub",
        "heading": "อ่านเทรนด์",
        "accent": "ก่อนคนอื่น",
        "lede": "บทความวิชาการเขียนโดย SWU Marketing Research Team — เชื่อมทฤษฎีคลาสสิก (Aaker · Kotler · Trout & Ries) เข้ากับเครื่องมือจริง เพื่อให้คุณเห็นจังหวะของผู้บริโภคก่อนตลาดจะส่งสัญญาณ",
        "cta_label": "อ่านทั้งหมด →",
        "cta_path": "/learn",
    },
    "about_band": {
        "eyebrow": "About SWU MKT",
        "heading": "",
        "accent": "",
        "lede": "สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ — ผลิตงานวิจัยและบุคลากรการตลาดระดับประเทศมา 50 ปี เปิดแพลตฟอร์มนี้เพื่อให้ทุกแบรนด์เข้าถึง insight ที่อ่านใจลูกค้าได้ก่อนคู่แข่ง",
        "cta_label": "อ่านเรื่องเรา →",
        "cta_path": "/about/swu-marketing",
    },
    "featured_articles": {"mode": "auto", "count": 4, "ids": []},
    "featured_brands": {"mode": "auto", "count": 5, "ids": []},
    "showcase_editor_pick": {
        "enabled": False,
        "study_id": None,
        "study_method": None,
        "headline": None,
        "subhead": None,
        "image_base64": None,
        "image_mime": None,
        "image_url": None,
    },
}


# ============ DEFAULT PROMPT TEMPLATES (seeded on first read) ============

DEFAULT_TEMPLATES = [
    {
        "id": "default-article-text",
        "name": "บทความวิจัยตลาด (Default)",
        "description": "เขียนบทความเชิงลึก จาก study + insight",
        "scope": "text",
        "post_type": "article",
        "template": (
            "คุณคือนักวิจัยตลาดมืออาชีพของ SWU Marketing Research Lab.\n"
            "เขียนบทความวิชาการที่อ่านง่าย ความยาว 600-900 คำ ในหัวข้อ '{title}'.\n"
            "Tone: เห็นก่อน · อ่านใจก่อน · นำตลาด (avoid 'transparent/เปิดเผย').\n"
            "ใช้ข้อมูลจาก source ที่แนบมาเพื่ออ้างอิง (อย่าแต่งตัวเลข).\n"
            "โครงสร้าง: hook → consumer insight → ทฤษฎีอ้างอิง (Aaker/Kotler) → "
            "ตัวเลขสำคัญ → ข้อเสนอแนะการตลาด.\n"
            "ภาษา: ไทยเป็นหลัก, ใช้ศัพท์ EN ตามจริง.\n"
            "Output ในรูปแบบ Markdown."
        ),
        "is_default": True,
    },
    {
        "id": "default-insight-text",
        "name": "Insight Post สั้น (Default)",
        "description": "Post สั้นๆ 150-250 คำ สำหรับ feed",
        "scope": "text",
        "post_type": "insight",
        "template": (
            "เขียน Insight Post สั้นๆ 150-250 คำ จาก data ที่แนบมา.\n"
            "หัวข้อ: '{title}'.\n"
            "Tone: เก่ง, มั่นใจ, อ่านใจตลาด, ไม่ยาวเกินไป.\n"
            "เริ่มด้วย key finding ที่น่าตกใจ → อธิบายเหตุผล → ส่งสัญญาณให้นักการตลาด.\n"
            "Output Markdown."
        ),
        "is_default": True,
    },
    {
        "id": "default-case-text",
        "name": "Case Story (Default)",
        "description": "เล่า case study ของแบรนด์",
        "scope": "text",
        "post_type": "case_story",
        "template": (
            "เล่า Case Story ของแบรนด์ในรูปแบบ storytelling.\n"
            "หัวข้อ: '{title}'.\n"
            "โครงสร้าง: บริบท → ปัญหา → วิธีวิจัย → ผลลัพธ์ → บทเรียน.\n"
            "ความยาว 500-800 คำ. ใช้ตัวเลขและคำพูดจริงจาก source ที่แนบ.\n"
            "Tone: น่าอ่าน, เป็นมิตร, แต่ลึกเชิงวิชาการ. Output Markdown."
        ),
        "is_default": True,
    },
    # ============ Announcement templates ============
    {
        "id": "default-announce-activity",
        "name": "ประชาสัมพันธ์ · กิจกรรมนิสิต (Default)",
        "description": "เขียนข่าวประชาสัมพันธ์กิจกรรมนิสิต (เช่น สัมมนา, ทริป, workshop)",
        "scope": "text",
        "post_type": "announcement",
        "template": (
            "คุณคือฝ่ายประชาสัมพันธ์ของสาขาการตลาด มศว (SWU MKT).\n"
            "เขียนข่าวประชาสัมพันธ์ \"กิจกรรมนิสิต\" หัวข้อ '{title}' ความยาว 250-400 คำ.\n"
            "Tone: เป็นทางการแต่อบอุ่น, ภูมิใจในศักยภาพนิสิต, ชวนติดตาม.\n"
            "โครงสร้าง:\n"
            "1) ย่อหน้านำ — กิจกรรมอะไร ใครจัด ที่ไหน เมื่อไหร่\n"
            "2) วัตถุประสงค์และความสำคัญของกิจกรรม\n"
            "3) กิจกรรมเด่น/วิทยากร/ไฮไลต์\n"
            "4) ใครได้ประโยชน์/กลุ่มเป้าหมาย\n"
            "5) ปิดท้าย — เชิญชวน, ช่องทางลงทะเบียน, ติดตามเพิ่มเติม\n"
            "ใช้ภาษาไทยเป็นหลัก, ระบุวันเวลา/สถานที่ให้ชัด, ใส่ #hashtag ที่เกี่ยวข้องตอนท้าย.\n"
            "Output Markdown."
        ),
        "is_default": True,
    },
    {
        "id": "default-announce-contest",
        "name": "ประชาสัมพันธ์ · การประกวดของนิสิต",
        "description": "เขียนข่าวประกวด/แข่งขัน/ผลรางวัล",
        "scope": "text",
        "post_type": "announcement",
        "template": (
            "คุณคือฝ่ายประชาสัมพันธ์ของสาขาการตลาด มศว (SWU MKT).\n"
            "เขียนข่าวประชาสัมพันธ์ \"การประกวด/แข่งขันของนิสิต\" หัวข้อ '{title}' ความยาว 250-400 คำ.\n"
            "Tone: ภูมิใจ เชิดชู สร้างแรงบันดาลใจ.\n"
            "โครงสร้าง:\n"
            "1) ย่อหน้านำ — การประกวดอะไร จัดโดยใคร ระดับใด (มหาวิทยาลัย/ประเทศ/นานาชาติ)\n"
            "2) โจทย์/หัวข้อการแข่งขัน, เกณฑ์การตัดสิน\n"
            "3) ทีม/นิสิตที่เข้าร่วม (ชื่อ-นามสกุล, ชั้นปี, อาจารย์ที่ปรึกษา)\n"
            "4) ผลงาน/ไอเดียเด่นที่นำเสนอ\n"
            "5) ผลรางวัล (ถ้าได้รับ) + ความรู้สึก/บทเรียน\n"
            "6) ปิดท้าย — ชื่นชม, ลิงก์ดูผลงาน/รายละเอียดเพิ่มเติม\n"
            "ระบุวันเวลา/สถานที่/รางวัลให้ชัด, ใส่ #hashtag เกี่ยวข้องท้ายเรื่อง.\n"
            "Output Markdown."
        ),
        "is_default": False,
    },
    {
        "id": "default-announce-project",
        "name": "ประชาสัมพันธ์ · โครงงานนิสิต",
        "description": "เขียนประชาสัมพันธ์โครงงาน/ผลงานวิจัยของนิสิต",
        "scope": "text",
        "post_type": "announcement",
        "template": (
            "คุณคือฝ่ายประชาสัมพันธ์ของสาขาการตลาด มศว (SWU MKT).\n"
            "เขียนประชาสัมพันธ์ \"โครงงาน/ผลงานวิจัยนิสิต\" หัวข้อ '{title}' ความยาว 300-500 คำ.\n"
            "Tone: วิชาการแต่เข้าถึงง่าย, เน้น insight ที่นิสิตค้นพบ.\n"
            "โครงสร้าง:\n"
            "1) ย่อหน้านำ — โครงงานชื่ออะไร ทำโดยนิสิตชั้นปีไหน อาจารย์ที่ปรึกษา\n"
            "2) ที่มา/ปัญหาวิจัย ที่กระตุ้นให้ทำโครงงานนี้\n"
            "3) วิธีการวิจัย/กลุ่มเป้าหมาย/เครื่องมือที่ใช้ (เช่น Conjoint, Brand Equity, Survey)\n"
            "4) ผลการวิจัย/ข้อค้นพบสำคัญ (3-5 bullet)\n"
            "5) ประโยชน์ต่อวงการการตลาด/อุตสาหกรรม\n"
            "6) ปิดท้าย — เชิญชวนอ่าน full report/ติดตามผลงานนิสิต\n"
            "ใช้ภาษาไทยเป็นหลัก, ใส่ตัวเลข/สถิติเด่น, ระบุวันที่นำเสนอ.\n"
            "Output Markdown."
        ),
        "is_default": False,
    },
    {
        "id": "default-announce-training",
        "name": "ประชาสัมพันธ์ · การอบรมของนิสิต",
        "description": "เขียนประชาสัมพันธ์งานอบรม/workshop/short course",
        "scope": "text",
        "post_type": "announcement",
        "template": (
            "คุณคือฝ่ายประชาสัมพันธ์ของสาขาการตลาด มศว (SWU MKT).\n"
            "เขียนประชาสัมพันธ์ \"การอบรม/Workshop ของนิสิต\" หัวข้อ '{title}' ความยาว 250-400 คำ.\n"
            "Tone: เชิญชวน เป็นมิตร เน้นประโยชน์ที่จับต้องได้.\n"
            "โครงสร้าง:\n"
            "1) ย่อหน้านำ — อบรมเรื่องอะไร จัดเมื่อไหร่ ใครคือกลุ่มเป้าหมาย\n"
            "2) วิทยากร/ผู้เชี่ยวชาญที่บรรยาย (ตำแหน่ง, ประสบการณ์)\n"
            "3) เนื้อหา/หัวข้อหลักที่จะได้เรียนรู้ (3-5 bullet)\n"
            "4) สิ่งที่ผู้เข้าร่วมจะได้รับ (certificate, ทักษะ, networking)\n"
            "5) วัน-เวลา-สถานที่/รูปแบบ (onsite/online/hybrid)\n"
            "6) ปิดท้าย — ค่าใช้จ่าย (ฟรี/มีค่าใช้จ่าย), ช่องทางลงทะเบียน, deadline\n"
            "ระบุวันเวลา/ลิงก์ลงทะเบียนให้ชัด, ใส่ #hashtag เกี่ยวข้องท้ายเรื่อง.\n"
            "Output Markdown."
        ),
        "is_default": False,
    },
    {
        "id": "default-image",
        "name": "Cover Image (Default)",
        "description": "สร้าง cover image สไตล์ editorial Thai+international",
        "scope": "image",
        "post_type": None,
        "template": (
            "Editorial cover photograph for a Thai marketing research article. "
            "Subject: {title}. Style: modern, magazine-grade, soft natural light, "
            "Thai+international consumer context, no text on image, "
            "shallow depth-of-field, sophisticated color palette of blue, red, off-white."
        ),
        "is_default": True,
    },
    {
        "id": "default-summary",
        "name": "Summarize Source (Default)",
        "description": "สรุป study เป็น bullet 5-7 ข้อ",
        "scope": "summary",
        "post_type": None,
        "template": (
            "สรุปข้อมูล source ต่อไปนี้เป็น bullet 5-7 ข้อ ที่นักการตลาดใช้ตัดสินใจได้ทันที.\n"
            "ระบุตัวเลขสำคัญ, key consumer insight, opportunity. Output Markdown."
        ),
        "is_default": True,
    },
    {
        "id": "default-translate",
        "name": "Translate TH↔EN (Default)",
        "description": "แปลงานเขียนการตลาดอย่างเป็นธรรมชาติ",
        "scope": "translate",
        "post_type": None,
        "template": (
            "Translate the following content to {to}. Keep marketing tone, "
            "preserve numbers and proper nouns, do not add commentary. Output only the translation."
        ),
        "is_default": True,
    },
]


# ============ AI HELPERS ============

# Limit concurrent LLM calls to prevent proxy 502s
_AI_SEM = asyncio.Semaphore(3)


async def _gemini_text(prompt: str, system: str = "You are a senior marketing research writer.") -> str:
    """Call Gemini 2.5 Flash for text. Returns string. Bounded concurrency + 55s timeout."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logging.error(f"[CMS] emergentintegrations import error: {e}")
        return ""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return ""

    async def _do():
        chat = LlmChat(
            api_key=api_key,
            session_id=f"cms-{uuid.uuid4().hex[:8]}",
            system_message=system,
        ).with_model("gemini", "gemini-2.5-flash")
        resp = await chat.send_message(UserMessage(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    try:
        async with _AI_SEM:
            return await asyncio.wait_for(_do(), timeout=55.0)
    except asyncio.TimeoutError:
        logging.error("[CMS] Gemini text timeout")
        return ""
    except Exception as e:
        logging.error(f"[CMS] Gemini text error: {e}")
        return ""


async def _gemini_image(prompt: str) -> Optional[str]:
    """Call Gemini Nano Banana. Returns base64 data URL string or None."""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logging.error(f"[CMS] emergentintegrations import error: {e}")
        return None
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return None

    async def _do():
        chat = LlmChat(
            api_key=api_key,
            session_id=f"cms-img-{uuid.uuid4().hex[:8]}",
            system_message="You are an editorial illustrator.",
        ).with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
            modalities=["image", "text"]
        )
        text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if images and len(images) > 0:
            img = images[0]
            mime = img.get("mime_type", "image/png")
            data = img.get("data", "")
            if data:
                return f"data:{mime};base64,{data}"
        return None

    try:
        async with _AI_SEM:
            return await asyncio.wait_for(_do(), timeout=90.0)
    except asyncio.TimeoutError:
        logging.error("[CMS] Gemini image timeout")
        return None
    except Exception as e:
        logging.error(f"[CMS] Gemini image error: {e}")
        return None


async def _build_source_context(db, sources: List[SourceRef]) -> str:
    """Fetch each source and produce a compact text context."""
    if not sources:
        return ""
    parts: List[str] = []
    for s in sources[:10]:  # cap at 10 sources to keep prompt small
        try:
            if s.type == "be_study":
                doc = await db.brand_studies.find_one({"id": s.id}, {"_id": 0})
                if not doc:
                    continue
                bs = doc.get("brand_setup", {}) or {}
                summary = doc.get("summary_stats", {}) or {}
                themes = doc.get("ai_themes", []) or []
                parts.append(
                    f"## Brand Equity Study — {bs.get('name', s.id)}\n"
                    f"- หมวดหมู่: {bs.get('category', '-')}\n"
                    f"- คู่แข่ง: {', '.join(bs.get('competitors', []) or []) or '-'}\n"
                    f"- จำนวนผู้ตอบ: {doc.get('response_count', 0)}\n"
                    f"- Awareness score: {summary.get('awareness_score', '-')}\n"
                    f"- Quality score: {summary.get('quality_score', '-')}\n"
                    f"- Loyalty score: {summary.get('loyalty_score', '-')}\n"
                    f"- Themes: {'; '.join((t.get('label', '') for t in themes[:6]))}\n"
                )
            elif s.type == "conjoint_study":
                doc = await db.conjoint_studies.find_one({"id": s.id}, {"_id": 0})
                if not doc:
                    continue
                attrs = doc.get("attributes", []) or []
                parts.append(
                    f"## Conjoint Study — {doc.get('title', s.id)}\n"
                    f"- หมวดหมู่: {doc.get('category', '-')}\n"
                    f"- Attributes: {', '.join((a.get('name', '') for a in attrs))}\n"
                    f"- จำนวนผู้ตอบ: {doc.get('response_count', 0)}\n"
                    f"- คำอธิบาย: {(doc.get('description') or '')[:300]}\n"
                )
            elif s.type == "cms_post":
                doc = await db.cms_posts.find_one({"id": s.id}, {"_id": 0})
                if not doc:
                    continue
                parts.append(
                    f"## CMS Post — {doc.get('title', s.id)}\n"
                    f"- Type: {doc.get('type')}\n"
                    f"- Excerpt: {(doc.get('excerpt') or '')[:300]}\n"
                    f"- Body (first 800 chars): {(doc.get('body_md') or '')[:800]}\n"
                )
        except Exception as e:
            logging.error(f"[CMS] source fetch error {s.type}/{s.id}: {e}")
    return "\n\n".join(parts)


# ============ HELPERS ============

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(s: str) -> str:
    import re
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9\u0E00-\u0E7F\s-]", "", s)
    s = re.sub(r"\s+", "-", s)[:80]
    return s or f"post-{uuid.uuid4().hex[:6]}"


def _is_admin(u) -> bool:
    return getattr(u, "role", None) == "admin"


# ============ ROUTE FACTORY ============

def get_cms_routes(db, get_current_user):
    """Factory pattern matches brand_equity.py."""

    async def _seed_default_templates():
        """Insert default templates if missing. Idempotent."""
        for t in DEFAULT_TEMPLATES:
            existing = await db.cms_prompt_templates.find_one({"id": t["id"]}, {"_id": 0})
            if not existing:
                doc = dict(t)
                doc["created_at"] = _now()
                doc["updated_at"] = _now()
                await db.cms_prompt_templates.insert_one(doc)

    # --------- POSTS (public) ---------

    @cms_router.get("/posts/public")
    async def list_public_posts(type: Optional[str] = None, limit: int = 50):
        return await _list_public_posts_cached(type, limit)

    @async_ttl_cache(ttl_seconds=120)
    async def _list_public_posts_cached(type: Optional[str], limit: int):
        """Public list of published posts (no auth)."""
        query: Dict[str, Any] = {
            "deleted_at": {"$exists": False},
            "status": "published",
        }
        if type and type in POST_TYPES:
            query["type"] = type
        cur = db.cms_posts.find(
            query,
            {"_id": 0, "body_md": 0},  # exclude body for list view (lighter)
        ).sort("published_at", -1).limit(min(limit, 200))
        items = await cur.to_list(length=limit)
        return {"items": items, "total": len(items)}

    @cms_router.get("/announcements/pinned")
    async def list_pinned_announcements():
        """Public — pinned announcements for the homepage hero (auto-shown as extra slides)."""
        return await _list_pinned_announcements_cached()

    @async_ttl_cache(ttl_seconds=60)
    async def _list_pinned_announcements_cached():
        cur = db.cms_posts.find(
            {
                "type": "announcement",
                "status": "published",
                "pinned_to_home": True,
                "deleted_at": {"$exists": False},
            },
            {"_id": 0, "body_md": 0},
        ).sort([("pinned_order", 1), ("published_at", -1)]).limit(8)
        items = await cur.to_list(length=8)
        return {"items": items, "total": len(items)}

    @cms_router.get("/posts/public/by-slug/{slug}")
    async def get_public_post_by_slug(slug: str):
        return await _get_public_post_by_slug_cached(slug)

    @async_ttl_cache(ttl_seconds=300)
    async def _get_public_post_by_slug_cached(slug: str):
        """Public single post by slug (no auth, only if published & not deleted)."""
        doc = await db.cms_posts.find_one(
            {"slug": slug, "status": "published", "deleted_at": {"$exists": False}},
            {"_id": 0},
        )
        if not doc:
            raise HTTPException(404, "Post not found or not published")
        return doc

    # --------- POSTS (admin) ---------

    @cms_router.get("/posts")
    async def list_posts(
        type: Optional[str] = None,
        status: Optional[str] = None,
        q: Optional[str] = None,
        current_user=Depends(get_current_user),
    ):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        query: Dict[str, Any] = {"deleted_at": {"$exists": False}}
        if type and type in POST_TYPES:
            query["type"] = type
        if status in ("draft", "published"):
            query["status"] = status
        if q:
            query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"excerpt": {"$regex": q, "$options": "i"}},
                {"slug": {"$regex": q, "$options": "i"}},
            ]
        cur = db.cms_posts.find(query, {"_id": 0, "body_md": 0, "cover_image": 0}).sort("updated_at", -1).limit(200)
        items = await cur.to_list(length=200)
        return {"items": items, "total": len(items)}

    @cms_router.get("/posts/trash")
    async def list_trash(current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        cur = db.cms_posts.find(
            {"deleted_at": {"$exists": True}},
            {"_id": 0, "body_md": 0, "cover_image": 0},
        ).sort("deleted_at", -1).limit(200)
        items = await cur.to_list(length=200)
        return {"items": items, "total": len(items)}

    @cms_router.get("/posts/{post_id}")
    async def get_post(post_id: str, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        doc = await db.cms_posts.find_one({"id": post_id}, {"_id": 0})
        if not doc:
            raise HTTPException(404, "Post not found")
        return doc

    @cms_router.post("/posts")
    async def create_post(data: CmsPostCreate, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        slug = data.slug or _slugify(data.title)
        # Ensure unique slug
        if await db.cms_posts.find_one({"slug": slug}, {"_id": 0}):
            slug = f"{slug}-{uuid.uuid4().hex[:5]}"
        doc = {
            "id": str(uuid.uuid4()),
            "type": data.type,
            "title": data.title,
            "title_en": data.title_en,
            "slug": slug,
            "category": data.category or "General",
            "excerpt": data.excerpt or "",
            "body_md": data.body_md or "",
            "cover_image": data.cover_image,
            "cover_caption": data.cover_caption,
            "read_min": data.read_min or 5,
            "tags": data.tags or [],
            "source_refs": [s.model_dump() for s in (data.source_refs or [])],
            "generation_meta": data.generation_meta,
            "media": [m.model_dump() for m in (data.media or [])],
            "pinned_to_home": bool(data.pinned_to_home),
            "pinned_order": int(data.pinned_order or 0),
            "cta_url": (data.cta_url or "").strip() or None,
            "hero_title_lines": [
                str(s).strip() for s in (data.hero_title_lines or []) if str(s).strip()
            ][:2] or None,
            "hero_accent_idx": int(data.hero_accent_idx) if data.hero_accent_idx is not None else 1,
            "status": "draft",
            "author_id": getattr(current_user, "id", None),
            "author_name": getattr(current_user, "full_name", None) or getattr(current_user, "email", "admin"),
            "created_at": _now(),
            "updated_at": _now(),
        }
        await db.cms_posts.insert_one(doc)
        doc.pop("_id", None)
        invalidate_prefix("get_cms_routes.<locals>._list_pinned_announcements_cached")
        invalidate_prefix("get_cms_routes.<locals>._list_public_posts_cached")
        return doc

    @cms_router.put("/posts/{post_id}")
    async def update_post(post_id: str, data: CmsPostUpdate, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        existing = await db.cms_posts.find_one({"id": post_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Post not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        for k, v in data.model_dump(exclude_unset=True).items():
            if k == "source_refs" and v is not None:
                upd[k] = [SourceRef(**s).model_dump() if isinstance(s, dict) else s.model_dump() for s in v]
            elif k == "media" and v is not None:
                upd[k] = [SlideMediaItem(**m).model_dump() if isinstance(m, dict) else m.model_dump() for m in v]
            elif k == "status" and v == "published" and existing.get("status") != "published":
                upd[k] = v
                upd["published_at"] = _now()
            else:
                upd[k] = v
        await db.cms_posts.update_one({"id": post_id}, {"$set": upd})
        doc = await db.cms_posts.find_one({"id": post_id}, {"_id": 0})
        invalidate_prefix("get_cms_routes.<locals>._list_pinned_announcements_cached")
        invalidate_prefix("get_cms_routes.<locals>._list_public_posts_cached")
        invalidate_prefix("get_cms_routes.<locals>._get_public_post_by_slug_cached")
        return doc

    @cms_router.delete("/posts/{post_id}")
    async def soft_delete_post(post_id: str, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        res = await db.cms_posts.update_one(
            {"id": post_id, "deleted_at": {"$exists": False}},
            {"$set": {"deleted_at": _now()}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Post not found or already trashed")
        return {"ok": True, "id": post_id}

    @cms_router.post("/posts/{post_id}/restore")
    async def restore_post(post_id: str, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        res = await db.cms_posts.update_one(
            {"id": post_id, "deleted_at": {"$exists": True}},
            {"$unset": {"deleted_at": ""}},
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Post not in trash")
        return {"ok": True, "id": post_id}

    @cms_router.delete("/posts/{post_id}/purge")
    async def purge_post(post_id: str, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        res = await db.cms_posts.delete_one({"id": post_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Post not found")
        return {"ok": True, "id": post_id}

    # --------- PROMPT TEMPLATES ---------

    @cms_router.get("/prompts")
    async def list_prompts(scope: Optional[str] = None, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        await _seed_default_templates()
        query: Dict[str, Any] = {}
        if scope in PROMPT_SCOPES:
            query["scope"] = scope
        cur = db.cms_prompt_templates.find(query, {"_id": 0}).sort([("scope", 1), ("post_type", 1), ("name", 1)])
        items = await cur.to_list(length=200)
        return {"items": items}

    @cms_router.post("/prompts")
    async def create_prompt(data: PromptTemplateCreate, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        doc = {
            "id": str(uuid.uuid4()),
            "name": data.name,
            "description": data.description or "",
            "scope": data.scope,
            "post_type": data.post_type,
            "template": data.template,
            "is_default": bool(data.is_default),
            "created_at": _now(),
            "updated_at": _now(),
        }
        if doc["is_default"]:
            # Unset previous defaults at same scope+post_type
            await db.cms_prompt_templates.update_many(
                {"scope": doc["scope"], "post_type": doc["post_type"], "is_default": True},
                {"$set": {"is_default": False}},
            )
        await db.cms_prompt_templates.insert_one(doc)
        doc.pop("_id", None)
        return doc

    @cms_router.put("/prompts/{prompt_id}")
    async def update_prompt(prompt_id: str, data: PromptTemplateUpdate, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        existing = await db.cms_prompt_templates.find_one({"id": prompt_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Prompt not found")
        upd: Dict[str, Any] = {"updated_at": _now()}
        for k, v in data.model_dump(exclude_unset=True).items():
            upd[k] = v
        if upd.get("is_default"):
            await db.cms_prompt_templates.update_many(
                {"scope": existing["scope"], "post_type": existing.get("post_type"), "is_default": True, "id": {"$ne": prompt_id}},
                {"$set": {"is_default": False}},
            )
        await db.cms_prompt_templates.update_one({"id": prompt_id}, {"$set": upd})
        doc = await db.cms_prompt_templates.find_one({"id": prompt_id}, {"_id": 0})
        return doc

    @cms_router.delete("/prompts/{prompt_id}")
    async def delete_prompt(prompt_id: str, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        # Don't allow deleting if the doc started as a hardcoded default seed
        existing = await db.cms_prompt_templates.find_one({"id": prompt_id}, {"_id": 0})
        if not existing:
            raise HTTPException(404, "Prompt not found")
        if str(existing.get("id", "")).startswith("default-"):
            raise HTTPException(400, "Cannot delete built-in default templates. Edit them instead.")
        await db.cms_prompt_templates.delete_one({"id": prompt_id})
        return {"ok": True, "id": prompt_id}

    # --------- SOURCES (for context picker) ---------

    @cms_router.get("/sources")
    async def list_sources(q: Optional[str] = None, current_user=Depends(get_current_user)):
        """Return all picker-friendly source items: BE studies, Conjoint studies, CMS posts."""
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        out: List[Dict[str, Any]] = []
        # BE studies
        be_query: Dict[str, Any] = {"deleted_at": {"$exists": False}}
        if q:
            be_query["$or"] = [
                {"brand_setup.name": {"$regex": q, "$options": "i"}},
                {"brand_setup.category": {"$regex": q, "$options": "i"}},
            ]
        async for s in db.brand_studies.find(be_query, {"_id": 0, "id": 1, "brand_setup": 1, "response_count": 1, "status": 1}).limit(60):
            bs = s.get("brand_setup", {}) or {}
            out.append({
                "type": "be_study",
                "id": s.get("id"),
                "title": bs.get("name") or "(untitled)",
                "subtitle": f"Brand Equity · {bs.get('category', '-')} · n={s.get('response_count', 0)}",
            })
        # Conjoint studies
        cj_query: Dict[str, Any] = {"deleted_at": {"$exists": False}}
        if q:
            cj_query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"category": {"$regex": q, "$options": "i"}},
            ]
        async for s in db.conjoint_studies.find(cj_query, {"_id": 0, "id": 1, "title": 1, "category": 1, "response_count": 1}).limit(60):
            out.append({
                "type": "conjoint_study",
                "id": s.get("id"),
                "title": s.get("title") or "(untitled)",
                "subtitle": f"Conjoint · {s.get('category', '-')} · n={s.get('response_count', 0)}",
            })
        # CMS posts (cross-ref)
        cms_query: Dict[str, Any] = {"deleted_at": {"$exists": False}}
        if q:
            cms_query["$or"] = [
                {"title": {"$regex": q, "$options": "i"}},
                {"excerpt": {"$regex": q, "$options": "i"}},
            ]
        async for p in db.cms_posts.find(cms_query, {"_id": 0, "id": 1, "title": 1, "type": 1, "status": 1}).limit(60):
            out.append({
                "type": "cms_post",
                "id": p.get("id"),
                "title": p.get("title") or "(untitled)",
                "subtitle": f"CMS · {p.get('type')} · {p.get('status', 'draft')}",
            })
        return {"items": out, "total": len(out)}

    # --------- AI ENDPOINTS ---------

    @cms_router.post("/ai/generate-text")
    async def ai_generate_text(req: AITextRequest, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        ctx = await _build_source_context(db, req.sources or [])
        full = req.base_prompt or ""
        if req.extra_prompt:
            full += f"\n\n[คำขอเพิ่มเติม]\n{req.extra_prompt}"
        if ctx:
            full += f"\n\n[ข้อมูลอ้างอิง — ใช้ตัวเลขและคำพูดจริง อย่าแต่ง]\n{ctx}"
        text = await _gemini_text(full)
        if not text:
            raise HTTPException(503, "AI text generation failed (timeout or quota). Try again.")
        return {"text": text, "model": "gemini-2.5-flash"}

    @cms_router.post("/ai/generate-image")
    async def ai_generate_image(req: AIImageRequest, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        prompt = f"{req.prompt}. Style: {req.style}. Aspect: {req.aspect}."
        url = await _gemini_image(prompt)
        if not url:
            raise HTTPException(503, "AI image generation failed (timeout or quota). Try again.")
        return {"image_data_url": url, "model": "gemini-3.1-flash-image-preview"}

    @cms_router.post("/ai/summarize")
    async def ai_summarize(req: AISummarizeRequest, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        ctx = await _build_source_context(db, req.sources)
        if not ctx:
            raise HTTPException(400, "No valid sources to summarise")
        prompt = (
            "สรุปข้อมูล source ต่อไปนี้เป็น bullet 5-7 ข้อ ที่นักการตลาดใช้ตัดสินใจได้ทันที. "
            "ระบุตัวเลขสำคัญ, key consumer insight, opportunity. Output Markdown."
        )
        if req.extra_prompt:
            prompt += f"\n\n[คำขอเพิ่ม] {req.extra_prompt}"
        prompt += f"\n\n[Source]\n{ctx}"
        text = await _gemini_text(prompt)
        if not text:
            raise HTTPException(503, "AI summarize failed")
        return {"text": text}

    @cms_router.post("/ai/translate")
    async def ai_translate(req: AITranslateRequest, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        target = "Thai" if req.to == "th" else "English"
        prompt = (
            f"Translate the following content to {target}. Keep marketing tone, "
            f"preserve numbers and proper nouns, do not add commentary. Output only the translation.\n\n"
            f"[Source]\n{req.text}"
        )
        text = await _gemini_text(prompt, system="You are a professional bilingual marketing editor.")
        if not text:
            raise HTTPException(503, "AI translate failed")
        return {"text": text}

    # --------- LANDING PAGE ---------

    async def _seed_landing():
        existing = await db.cms_landing.find_one({"key": "home"}, {"_id": 0})
        if not existing:
            doc = dict(DEFAULT_LANDING)
            doc["updated_at"] = _now()
            await db.cms_landing.insert_one(doc)

    @cms_router.get("/landing")
    async def get_landing():
        await _seed_landing()
        return await _get_landing_cached()

    @async_ttl_cache(ttl_seconds=120)
    async def _get_landing_cached():
        """Public — HomePage uses this to render. No auth required."""
        doc = await db.cms_landing.find_one({"key": "home"}, {"_id": 0})
        if not doc:
            return DEFAULT_LANDING
        # Backfill new fields for legacy docs created before this feature
        if "featured_articles" not in doc:
            doc["featured_articles"] = DEFAULT_LANDING["featured_articles"]
        if "featured_brands" not in doc:
            doc["featured_brands"] = DEFAULT_LANDING["featured_brands"]
        if "showcase_editor_pick" not in doc:
            doc["showcase_editor_pick"] = DEFAULT_LANDING["showcase_editor_pick"]
        return doc

    @cms_router.put("/landing")
    async def update_landing(data: LandingDoc, current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        await _seed_landing()
        upd = data.model_dump()
        upd["updated_at"] = _now()
        await db.cms_landing.update_one({"key": "home"}, {"$set": upd})
        invalidate_prefix("get_cms_routes.<locals>._get_landing_cached")
        doc = await db.cms_landing.find_one({"key": "home"}, {"_id": 0})
        return doc

    @cms_router.post("/landing/reset")
    async def reset_landing(current_user=Depends(get_current_user)):
        if not _is_admin(current_user):
            raise HTTPException(403, "Admin only")
        doc = dict(DEFAULT_LANDING)
        doc["updated_at"] = _now()
        await db.cms_landing.delete_many({"key": "home"})
        await db.cms_landing.insert_one(doc)
        out = await db.cms_landing.find_one({"key": "home"}, {"_id": 0})
        return out

    return cms_router
