"""
หาห้อง·หาเมท มศว (SWU Nest) — roommate + room board for SWU Prasarnmit students.
==============================================================================
Built from an analysis of the LINE OpenChat "พี่ มศว พาน้องหาที่พัก หารูมเมท"
(~7,500 members, 880 messages, May–Nov 2026; see data/dorm_insights.json).
Each feature answers a pain found there:

  * roommate board with filters + a match score  ← 1/3 of all posts were "หาเมท",
    and people had to repost up to 16 times because the chat buries them
  * room listings by budget / zone, incl. contract transfers and short stays
  * building guide with resident reviews (management, safety, transit, value)
  * posts expire after 30 days and can be renewed or reported  ← flaking, stale posts
  * a weekly digest the admin pastes back into the OpenChat (the channel itself)

Privacy: contact fields (LINE ID / phone) never appear in list or detail
responses. They come only from the /contact endpoints, which need a login and
log a lead event — that event count is also what the product can later sell
to room owners.
"""

import asyncio
import base64
import gzip
import hashlib
import html as _html
import io
import json
import math
import secrets
import smtplib
import time
from email.message import EmailMessage

import httpx
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from pydantic import BaseModel, Field, field_validator

from .dorm_agent import ensure_agent_indexes, register_dorm_agent_routes

dorm_router = APIRouter(prefix="/dorm", tags=["Dorm · หาห้องหาเมท"])

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EXPIRY_DAYS = 30
EXPIRY_BY_KIND = {"mate_wanted": 14, "transfer": 14, "room": 30, "short_term": 30}
RESERVED_SHOW_DAYS = 5
EXT_GONE_AUTO_CLOSE = 2
NATIVE_GONE_AUTO_PAUSE = 3
NATIVE_GONE_GRACE_HOURS = 48
ARCHIVE_VISIBLE_DAYS = 90
MAX_ACTIVE_LISTINGS = 5
MAX_CHAT_MSGS_PER_MIN = 30
ADMIN_CLOSED_MSG = "แอดมินปิดประกาศนี้ไว้ เปิดเองไม่ได้ ถ้าคิดว่าปิดผิด แจ้งแอดมินในกลุ่ม OpenChat ได้"
AUTO_MOD_CLOSED_MSG = "ประกาศถูกพักชั่วคราวเนื่องจากมีผู้รายงานหลายคน หากคิดว่าผิดพลาด แจ้งแอดมินเพื่อตรวจสอบและเปิดคืนได้"
DEFAULT_GOOGLE_CLIENT_ID = "949663376782-cd9128nvekdavpu09mko30rfn9c2kre4.apps.googleusercontent.com"
SEVERE_REPORT_REASONS = frozenset({
    "สแกม/ขอโอนเงินก่อน", "ข้อมูลเท็จ/ไม่มีห้องจริง",
    "โปรไฟล์ปลอม/ไม่มีตัวตน", "คุกคามหรือไม่สุภาพ",
    "ข้อมูลเท็จ", "โฆษณาหรือสแปม",
})
AUTO_MOD_MIN_REPORTERS = 3
AUTO_MOD_MIN_WEIGHT = 2.5  # SWU-verified reporter = 1.0, unverified signed-in = 0.5

# ---------------------------------------------------------------- vocab
# One source of truth; the frontend reads it from GET /dorm/meta.
ZONES = [
    {"id": "asoke", "label": "อโศก เพชรบุรี (ใกล้ มศว)"},
    {"id": "rama9", "label": "พระราม 9"},
    {"id": "huaikwang", "label": "ห้วยขวาง/ศูนย์วัฒนธรรม"},
    {"id": "ratchada", "label": "รัชดา/สุทธิสาร"},
    {"id": "dindaeng", "label": "ดินแดง/ประชาสงเคราะห์"},
    {"id": "ramkhamhaeng", "label": "รามคำแหง/แอร์พอร์ตลิงก์"},
    {"id": "ladprao", "label": "ลาดพร้าว"},
    {"id": "other", "label": "อื่นๆ (เดินทางสะดวก)"},
]
KINDS = [
    {"id": "mate_wanted", "label": "มีห้องแล้ว หาเมท", "emoji": "👫"},
    {"id": "transfer", "label": "ส่งต่อสัญญา / หาคนอยู่แทน", "emoji": "🔁"},
    {"id": "room", "label": "ห้องว่างให้เช่า", "emoji": "🏠"},
    {"id": "short_term", "label": "ระยะสั้น 1–6 เดือน", "emoji": "⏱️"},
]
POSTER_ROLES = [
    {"id": "student", "label": "นิสิต/ผู้เช่า"},
    {"id": "owner", "label": "เจ้าของห้องปล่อยเอง"},
    {"id": "agent", "label": "นายหน้า"},
]
LIFESTYLE_TAGS = [
    {"id": "clean", "label": "รักสะอาด"},
    {"id": "save_power", "label": "ช่วยประหยัดไฟ"},
    {"id": "quiet", "label": "ไม่เสียงดัง"},
    {"id": "night_owl", "label": "นอนดึก"},
    {"id": "early_bird", "label": "ตื่นเช้า"},
    {"id": "no_smoke", "label": "ไม่สูบบุหรี่"},
    {"id": "has_pet", "label": "มีสัตว์เลี้ยง"},
    {"id": "pet_ok", "label": "โอเคกับสัตว์เลี้ยง"},
    {"id": "no_pet", "label": "ไม่เอาสัตว์เลี้ยง"},
    {"id": "cook", "label": "ทำอาหารกินเอง"},
    {"id": "home_weekend", "label": "กลับบ้านเสาร์-อาทิตย์"},
    {"id": "homebody", "label": "ติดห้อง"},
    {"id": "social", "label": "ชอบเที่ยว/มีเพื่อนมาบ่อย"},
]
AMENITIES = [
    {"id": "walk_swu", "label": "เดินไปมอได้"},
    {"id": "near_mrt", "label": "ใกล้ MRT/BTS/ARL"},
    {"id": "washer", "label": "เครื่องซักผ้าในห้อง"},
    {"id": "kitchen", "label": "มีครัว"},
    {"id": "pool", "label": "สระว่ายน้ำ"},
    {"id": "gym", "label": "ฟิตเนส"},
    {"id": "pet_friendly", "label": "เลี้ยงสัตว์ได้"},
    {"id": "furnished", "label": "เฟอร์ครบ"},
    {"id": "security", "label": "รปภ. 24 ชม./คีย์การ์ด"},
]
GENDERS = [{"id": "female", "label": "หญิง"}, {"id": "male", "label": "ชาย"}, {"id": "other", "label": "อื่นๆ"}]
GENDER_PREFS = [{"id": "female", "label": "เมทหญิง"}, {"id": "male", "label": "เมทชาย"}, {"id": "any", "label": "ได้หมด"}]
YEARS = [{"id": y, "label": l} for y, l in
         [("1", "ปี 1"), ("2", "ปี 2"), ("3", "ปี 3"), ("4", "ปี 4"), ("grad", "ป.โท/เอก"), ("other", "อื่นๆ")]]
REVIEW_ASPECTS = [
    {"id": "transit", "label": "เดินทาง"},
    {"id": "safety", "label": "ความปลอดภัย"},
    {"id": "management", "label": "นิติ/เจ้าของ"},
    {"id": "value", "label": "ความคุ้ม"},
    {"id": "quiet", "label": "ความเงียบ"},
]
REPORT_REASONS = ["ข้อมูลเท็จ/ไม่มีห้องจริง", "สแกม/ขอโอนเงินก่อน", "ห้องเต็มแล้วแต่ไม่ปิดประกาศ", "ไม่เหมาะสม", "อื่นๆ"]
# the reasons offered depend on what is reported (a profile has no room that can be "full")
REPORT_REASONS_BY_TYPE = {
    "listing": REPORT_REASONS,
    "mate": ["โปรไฟล์ปลอม/ไม่มีตัวตน", "สแกม/ขอโอนเงินก่อน", "คุกคามหรือไม่สุภาพ", "ไม่เหมาะสม", "อื่นๆ"],
    "review": ["ข้อมูลเท็จ", "โฆษณาหรือสแปม", "ไม่สุภาพ/ไม่เหมาะสม", "อื่นๆ"],
}
REPORT_NOTE_MAX = 200
_CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
# OpenChat archive vocabulary (old ads; "seeking" = someone looking for a room or a mate)
CHAT_KIND_LABELS = [
    {"id": "room", "label": "ปล่อยเช่า"},
    {"id": "mate_wanted", "label": "มีห้อง หาเมท"},
    {"id": "transfer", "label": "ส่งต่อสัญญา"},
    {"id": "short_term", "label": "ระยะสั้น"},
    {"id": "seeking", "label": "หาห้อง/หาเมท"},
]
ROOM_TYPES = [{"id": "studio", "label": "สตูดิโอ"}, {"id": "1br", "label": "1 ห้องนอน"}, {"id": "2br", "label": "2 ห้องนอน"},
              {"id": "3br", "label": "3 ห้องนอน"}]

_ids = lambda lst: [x["id"] for x in lst]  # noqa: E731
ZoneId = Literal[tuple(_ids(ZONES))]  # type: ignore[valid-type]
KindId = Literal[tuple(_ids(KINDS))]  # type: ignore[valid-type]
RoleId = Literal[tuple(_ids(POSTER_ROLES))]  # type: ignore[valid-type]
GenderId = Literal["female", "male", "other"]
PrefId = Literal["female", "male", "any"]
YearId = Literal["1", "2", "3", "4", "grad", "other"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


BKK = timezone(timedelta(hours=7))


def today_bkk() -> date:
    """Today's calendar date in Bangkok (the site's users), for "not before today" checks."""
    return datetime.now(BKK).date()


def real_date(v: str) -> Optional[date]:
    """A real calendar date from 'YYYY-MM-DD' (2026-02-30 is None)."""
    try:
        return date.fromisoformat(v)
    except (TypeError, ValueError):
        return None


def per_person_of(price_total, people_total) -> int:
    """The per-person rent the server stores: the whole rent split evenly over the occupants (one occupant pays it
    all). Never taken from the client, so every card, filter and sort agrees with the total and the head count."""
    return int(round(int(price_total) / max(1, int(people_total or 1))))


def _iso(d: datetime) -> str:
    return d.isoformat()


def _clean_tags(v: List[str], allowed: list) -> List[str]:
    ok = set(_ids(allowed))
    out = []
    for t in v or []:
        if t in ok and t not in out:
            out.append(t)
    return out


_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
_DATE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
_URL = re.compile(r"^https?://\S{4,500}$")
# photos uploaded here are stored in Mongo and referenced by this relative path
_PHOTO = re.compile(r"^/api/dorm/photos/[a-f0-9]{16}$")
MAX_PHOTO_BYTES = 1_500_000
MAX_PHOTOS_PER_DAY = 40


# ---------------------------------------------------------------- models
class MateIn(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=40)
    gender: GenderId
    mate_gender_pref: PrefId = "any"
    year: YearId = "other"
    faculty: str = Field("", max_length=80)
    budget_min: int = Field(2000, ge=0, le=100000)
    budget_max: int = Field(6000, ge=0, le=100000)
    zones: List[str] = Field(default_factory=list)
    move_in: str = Field(..., description="YYYY-MM")
    has_room: bool = False
    room_note: str = Field("", max_length=300)
    tags: List[str] = Field(default_factory=list)
    about: str = Field("", max_length=600)
    contact_line: str = Field("", max_length=60)
    contact_ig: str = Field("", max_length=60)
    consent: bool = False

    @field_validator("move_in")
    @classmethod
    def _m(cls, v):
        if not _MONTH.match(v or ""):
            raise ValueError("move_in must be YYYY-MM")
        return v

    @field_validator("zones")
    @classmethod
    def _z(cls, v):
        return _clean_tags(v, ZONES)

    @field_validator("tags")
    @classmethod
    def _t(cls, v):
        return _clean_tags(v, LIFESTYLE_TAGS)


class ListingIn(BaseModel):
    kind: KindId
    poster_role: RoleId = "student"
    title: str = Field(..., min_length=4, max_length=120)
    building_slug: Optional[str] = Field(None, max_length=80)
    building_name: str = Field("", max_length=120)
    zone: ZoneId
    price_total: int = Field(..., ge=500, le=200000, description="ค่าเช่าทั้งห้อง/เดือน")
    people_total: int = Field(1, ge=1, le=8, description="อยู่ทั้งหมดกี่คน (รวมคนใหม่)")
    price_per_person: Optional[int] = Field(None, ge=0, le=200000)
    deposit: Optional[int] = Field(None, ge=0, le=500000)
    utilities_note: str = Field("", max_length=120)
    move_in: str = Field(..., description="YYYY-MM-DD")
    contract_months_left: Optional[int] = Field(None, ge=0, le=60)
    min_months: Optional[int] = Field(None, ge=1, le=24)
    gender_pref: PrefId = "any"
    bedrooms: Optional[int] = Field(None, ge=0, le=10)
    size_sqm: Optional[float] = Field(None, ge=5, le=500)
    amenities: List[str] = Field(default_factory=list)
    description: str = Field("", max_length=2000)
    photo_links: List[str] = Field(default_factory=list)
    contact_line: str = Field("", max_length=60)
    contact_phone: str = Field("", max_length=30)

    @field_validator("move_in")
    @classmethod
    def _d(cls, v):
        if not _DATE.match(v or "") or not real_date(v):
            raise ValueError("move_in must be a real date YYYY-MM-DD")
        return v

    @field_validator("amenities")
    @classmethod
    def _a(cls, v):
        return _clean_tags(v, AMENITIES)

    @field_validator("photo_links")
    @classmethod
    def _p(cls, v):
        return [u for u in (v or []) if _URL.match(u) or _PHOTO.match(u)][:8]


class PhotoIn(BaseModel):
    # no max_length here: a pydantic length error echoes the whole input back; the route answers a short 413
    data_url: str


class StatusIn(BaseModel):
    status: Literal["active", "reserved", "closed"]


class ReviewIn(BaseModel):
    ratings: dict
    text: str = Field("", max_length=1500)
    lived_year: Optional[int] = Field(None, ge=2000, le=2100)
    anonymous: bool = True

    @field_validator("ratings")
    @classmethod
    def _r(cls, v):
        out = {}
        for a in _ids(REVIEW_ASPECTS):
            x = (v or {}).get(a) if isinstance(v, dict) else None
            if x is None:
                continue
            if isinstance(x, bool):
                raise ValueError(f"rating {a} must be a number 1–5")
            try:
                x = int(x)
            except (TypeError, ValueError, OverflowError):
                raise ValueError(f"rating {a} must be a number 1–5")
            if not 1 <= x <= 5:
                raise ValueError(f"rating {a} must be 1–5")
            out[a] = x
        if not out:
            raise ValueError("at least one rating is required")
        return out


class ReportIn(BaseModel):
    target_type: Literal["listing", "mate", "review"]
    target_id: str = Field(..., max_length=64)
    reason: str = Field(..., max_length=80)
    note: str = Field("", max_length=REPORT_NOTE_MAX)

    @field_validator("note")
    @classmethod
    def _plain(cls, v):
        # plain text: no control characters, single spaces, trimmed (React escapes it on display)
        return re.sub(r"\s+", " ", _CTRL.sub("", v or "")).strip()


class FeatureIn(BaseModel):
    featured: bool


class PeekIn(BaseModel):
    anon_id: str = Field(..., min_length=8, max_length=64)
    active: bool = True

    @field_validator("anon_id")
    @classmethod
    def _aid(cls, v: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", v or ""):
            raise ValueError("anon_id ไม่ถูกต้อง")
        return v


class GoneSignalIn(BaseModel):
    anon_id: Optional[str] = Field(None, min_length=8, max_length=64)
    note: str = Field("", max_length=REPORT_NOTE_MAX)

    @field_validator("anon_id")
    @classmethod
    def _gaid(cls, v: Optional[str]):
        if v is None or v == "":
            return None
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", v):
            raise ValueError("anon_id ไม่ถูกต้อง")
        return v

    @field_validator("note")
    @classmethod
    def _gnote(cls, v):
        return re.sub(r"\s+", " ", _CTRL.sub("", v or "")).strip()


SWU_EMAIL_RE = re.compile(r"^[^@\s]+@(?:[a-z0-9-]+\.)*swu\.ac\.th$", re.I)
VERIFY_LABELS = {"student": "ยืนยันนิสิต มศว", "freshman": "ว่าที่นิสิต มศว", "alumni": "ศิษย์เก่า มศว"}


class VerifyOtpRequestIn(BaseModel):
    swu_email: str = Field(..., min_length=6, max_length=120)

    @field_validator("swu_email")
    @classmethod
    def _swu(cls, v: str):
        v = v.strip().lower()
        if not SWU_EMAIL_RE.match(v):
            raise ValueError("กรุณาใช้อีเมล มศว เช่น @g.swu.ac.th หรือ @swu.ac.th")
        return v


class VerifyOtpConfirmIn(BaseModel):
    code: str = Field(..., pattern=r"^\d{6}$")


class VerifyGoogleLinkIn(BaseModel):
    credential: str = Field(..., min_length=20, max_length=4000)


class VerifyVouchPersonalIn(BaseModel):
    personal_email: str = Field(..., min_length=5, max_length=120)

    @field_validator("personal_email")
    @classmethod
    def _em(cls, v: str):
        v = (v or "").strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
            raise ValueError("รูปแบบอีเมลไม่ถูกต้อง")
        if SWU_EMAIL_RE.match(v):
            raise ValueError("กรุณาใส่อีเมลส่วนตัวที่ไม่ใช่อีเมล มศว (อีเมล มศว ยืนยันอัตโนมัติอยู่แล้ว)")
        return v


class VerifyManualRequestIn(BaseModel):
    kind: Literal["student", "freshman", "alumni"] = "freshman"
    faculty: str = Field(..., min_length=2, max_length=80)
    entry_year: Optional[int] = Field(None, ge=2500, le=2650)
    swu_email: str = Field("", max_length=120)
    note: str = Field("", max_length=400)

    @field_validator("faculty", "note", "swu_email", mode="before")
    @classmethod
    def _strip(cls, v):
        return (v or "").strip()


class AdminVerifyActionIn(BaseModel):
    action: Literal["approve", "reject"]
    reason: str = Field("", max_length=200)


class ThreadStartIn(BaseModel):
    target_type: Literal["listing", "mate"]
    target_id: str = Field(..., min_length=3, max_length=60)
    room_id: Optional[str] = Field(None, max_length=60)
    message: str = Field("", max_length=1000)

    @field_validator("message", mode="before")
    @classmethod
    def _strip_msg(cls, v):
        return (v or "").strip()


class MessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=1000)
    kind: Literal["text", "line_card"] = "text"

    @field_validator("body", mode="before")
    @classmethod
    def _strip_body(cls, v):
        return (v or "").strip()


class InterestIn(BaseModel):
    party_size: int = Field(1, ge=1, le=3, description="how many people I am, me included")


_HTTPS = re.compile(r"^https://[^\s\"'<>]{4,600}$")


class BuildingPhoto(BaseModel):
    """A remote photo of the project, shown link-preview style: the site stores only the URL and
    always shows the credit linking back to the source page. Never downloaded or re-hosted."""
    url: str
    kind: Literal["exterior", "facility", "room"] = "exterior"
    credit: str = Field(..., min_length=1, max_length=80)
    source_url: str
    bytes: Optional[int] = Field(None, ge=0, description="reported size; heavy ones are kept off list cards")

    @field_validator("url", "source_url")
    @classmethod
    def _https(cls, v):
        if not _HTTPS.match(v or ""):
            raise ValueError("must be an https URL")
        return v


class BuildingIn(BaseModel):
    slug: str = Field(..., pattern=r"^[a-z0-9-]{3,80}$")
    name: str = Field(..., min_length=2, max_length=120)
    type: Literal["condo", "apartment", "dorm"] = "condo"
    zone: ZoneId
    walk_to_swu: bool = False
    # door-to-SWU estimate shown as a badge on cards: minutes + how you get there
    minutes_to_swu: Optional[int] = Field(None, ge=1, le=120)
    travel_mode: Literal["walk", "mrt", "moto", "bus", "boat"] = "walk"
    transit: str = Field("", max_length=160)
    price_seen: str = Field("", max_length=160)
    pros: List[str] = Field(default_factory=list)
    cons: List[str] = Field(default_factory=list)
    web_review_summary: str = Field("", max_length=400)
    web_review_sources: List[str] = Field(default_factory=list, max_length=6)
    aliases: List[str] = Field(default_factory=list)
    photos: List[BuildingPhoto] = Field(default_factory=list, max_length=6)
    official_url: Optional[str] = None

    @field_validator("official_url")
    @classmethod
    def _official(cls, v):
        if v in (None, ""):
            return None
        if not _HTTPS.match(v):
            raise ValueError("official_url must be an https URL")
        return v


# a list card never loads a photo heavier than this (the building page gallery may)
THUMB_MAX_BYTES = 700_000


def building_thumb(photos: List[dict]) -> Optional[dict]:
    """First photo light enough for a list card, or None (cards then keep the illustration)."""
    for p in photos or []:
        if (p.get("bytes") or 0) <= THUMB_MAX_BYTES:
            return p
    return None


# ---------------------------------------------------------------- external listings (public real-estate sites)
# data/dorm_external_listings.json holds FACTS about rooms seen on public listing sites (price, size, rooms,
# contract terms, photo URLs with credit) plus the link to the source page. Never a description, an advertiser
# name or a phone number: contact happens on the source site. Rows live in dorm_listings flagged
# `external: true` (kind "room", no owner) so every list / detail / saved / share path just works.
EXT_FILE = "dorm_external_listings.json"
EXT_TTL_DAYS = 21                 # a row not seen again for 3 weeks disappears by itself
SHARE_BY_BEDROOMS = {0: 2, 1: 2, 2: 3, 3: 4}
MAX_ACTIVE_INTERESTS = 10
EXT_GONE_REASON = "ห้องนี้ไม่ว่างแล้ว"
NATIVE_GONE_REASON = "ห้องเต็มแล้วแต่ไม่ปิดประกาศ"
GONE_REASONS = (EXT_GONE_REASON, NATIVE_GONE_REASON)
# closed_reason values: "missing" (dropped out of the file: reopens if it comes back),
# "admin" / "deleted" / "gone" (closed by admin, deleted, or crowd-confirmed gone: never resurrected)
EXT_REOPENABLE = ("missing",)


def expiry_days_for(kind: Optional[str], external: bool = False) -> int:
    """Native mate_wanted/transfer turn over fast (14 days); rentals/short stays live 30 days; external stays 21."""
    if external:
        return EXT_TTL_DAYS
    return EXPIRY_BY_KIND.get(kind or "", EXPIRY_DAYS)


def is_reserved_expired(x: dict, now_iso: str) -> bool:
    """True when a native listing marked 'reserved' has passed its 5-day grace visibility window."""
    return x.get("status") == "reserved" and bool(x.get("reserved_until")) and x["reserved_until"] <= now_iso


def is_listing_gone(x: dict, now_iso: str) -> bool:
    """True when a listing is closed, expired, or past its reserved visibility window."""
    return x.get("status") == "closed" or (x.get("expires_at") or "") <= now_iso or is_reserved_expired(x, now_iso)


def gone_label_of(x: dict) -> str:
    """Human-readable status label for gone listings shown in the price-reference archive or soft-410 view."""
    if x.get("external"):
        return "ไม่ว่างแล้ว (อ้างอิงราคา)"
    if x.get("closed_reason") == "paused_unconfirmed":
        return "พักประกาศ (รอเจ้าของยืนยัน)"
    if x.get("status") != "closed":
        return "หมดอายุแล้ว"
    k = x.get("kind")
    if k == "mate_wanted":
        return "ได้เมทแล้ว"
    if k == "transfer":
        return "ส่งต่อสัญญาแล้ว"
    return "ปล่อยเช่าแล้ว"


def is_publicly_archivable(x: dict, cutoff_iso: str) -> bool:
    """Whether a gone listing may appear when 'include_closed=1' is toggled (excludes deleted, admin-moderated native, and very old rows)."""
    if x.get("closed_reason") == "deleted":
        return False
    if not x.get("external") and x.get("closed_by") == "admin":
        return False
    ts = x.get("closed_at") or x.get("reserved_until") or x.get("expires_at") or x.get("renewed_at") or x.get("created_at") or ""
    return ts >= cutoff_iso
# whitelisted keys; whatever else the file holds never reaches the database
EXT_ROW_KEYS = ("ext_id", "source", "source_url", "seen_at", "building_slug", "building_name", "zone", "price_total",
                "bedrooms", "bathrooms", "size_sqm", "floor", "furnished", "amenities", "min_contract_months",
                "deposit_months", "advance_months", "available_from", "photos")


def default_share(bedrooms) -> int:
    """How many people usually split a unit of this size (studio 2, 1BR 2, 2BR 3, 3BR+ 4)."""
    try:
        b = int(bedrooms)
    except (TypeError, ValueError):
        return 2
    return SHARE_BY_BEDROOMS.get(b, 4 if b > 3 else 2)


# A studio under this size (or any studio in an apartment / dorm building) is a room for one: it is shown as
# "อยู่คนเดียว หรือหาร 2" first, never as a shared room. people_total and price_per_person keep the 2-way split,
# so budget filters still find it for students who would share (the card says the split is what matches).
SINGLE_ROOM_MAX_SQM = 28
SINGLE_ROOM_BUILDING_TYPES = ("apartment", "dorm")


def is_single_room(x: dict, building_type: Optional[str] = None) -> bool:
    """True for a studio meant for one person: bedrooms == 0 and (size known and < 28 sqm, or the building is an
    apartment / dorm). A "has a room, looking for a mate" ad, or a post that says more than 2 share, never is."""
    if x.get("bedrooms") != 0 or x.get("kind") == "mate_wanted":
        return False
    if not x.get("external") and int(x.get("people_total") or 1) > 2:
        return False
    size = x.get("size_sqm")
    small = isinstance(size, (int, float)) and 0 < size < SINGLE_ROOM_MAX_SQM
    return small or building_type in SINGLE_ROOM_BUILDING_TYPES


def mark_shared_photos(docs: List[dict]) -> None:
    """Sets shared_photo on external docs that have no room photo of their own: no photos at all, or the same
    photo set as another row of the same building and source (the building's cover). List views collapse 3+
    such rows of one building into a single group card; a row with its own photos is never marked."""
    sets = {}
    for d in docs:
        key = (d.get("building_slug"), d.get("source"), tuple(p["url"] for p in d.get("ext_photos") or []))
        sets.setdefault(key, []).append(d)
    for (slug, _src, urls), group in sets.items():
        for d in group:
            d["shared_photo"] = bool(slug) and (not urls or len(group) > 1)


def ext_listing_id(ext_id: str) -> str:
    """Stable 12-char listing id from the source key, so links survive re-imports and fresh databases."""
    import hashlib
    return "x" + hashlib.sha1(ext_id.encode("utf-8")).hexdigest()[:11]


def ext_title(row: dict) -> str:
    """'1 ห้องนอน 35 ตร.ม. Life Asoke' — built from facts only."""
    b = row.get("bedrooms")
    parts = ["สตูดิโอ" if b == 0 else f"{b} ห้องนอน" if b else "ห้องเช่า"]
    if row.get("size_sqm"):
        parts.append(f"{row['size_sqm']:g} ตร.ม.")
    where = row.get("building_name") or next((z["label"] for z in ZONES if z["id"] == row.get("zone")), "")
    if where:
        parts.append(re.sub(r"\s*\(.*\)\s*$", "", where))
    return " ".join(parts)[:120]


def _int_or_none(v, lo, hi):
    try:
        v = int(v)
    except (TypeError, ValueError):
        return None
    return v if lo <= v <= hi else None


def clean_external_row(row: dict) -> Optional[dict]:
    """A validated, whitelisted copy of one file row, or None when it is unusable."""
    r = {k: row.get(k) for k in EXT_ROW_KEYS}
    if not isinstance(r["ext_id"], str) or not re.fullmatch(r"[a-z0-9_-]{2,40}:[\w-]{1,60}", r["ext_id"]):
        return None
    if not isinstance(r["source"], str) or not (1 <= len(r["source"]) <= 40):
        return None
    if not _HTTPS.match(r["source_url"] or ""):
        return None
    r["price_total"] = _int_or_none(r["price_total"], 500, 200000)
    if not r["price_total"]:
        return None
    if not _DATE.match(r["seen_at"] or ""):
        return None
    if r["zone"] not in _ids(ZONES):
        r["zone"] = "other"
    r["bedrooms"] = _int_or_none(r["bedrooms"], 0, 10)
    r["bathrooms"] = _int_or_none(r["bathrooms"], 0, 10)
    r["floor"] = _int_or_none(r["floor"], -5, 120)
    for k, hi in (("min_contract_months", 60), ("deposit_months", 12), ("advance_months", 12)):
        r[k] = _int_or_none(r[k], 0, hi)
    try:
        r["size_sqm"] = float(r["size_sqm"]) if r["size_sqm"] is not None and 5 <= float(r["size_sqm"]) <= 500 else None
    except (TypeError, ValueError):
        r["size_sqm"] = None
    r["furnished"] = r["furnished"] if isinstance(r["furnished"], bool) else None
    r["amenities"] = _clean_tags(r["amenities"] or [], AMENITIES)
    r["available_from"] = r["available_from"] if _DATE.match(r["available_from"] or "") else None
    r["building_name"] = str(r["building_name"] or "")[:120]
    r["building_slug"] = r["building_slug"] if isinstance(r["building_slug"], str) and re.fullmatch(r"[a-z0-9-]{3,80}", r["building_slug"]) else None
    photos = []
    for p in r["photos"] or []:
        if isinstance(p, dict) and _HTTPS.match(p.get("url") or "") and _HTTPS.match(p.get("source_url") or r["source_url"]):
            photos.append({"url": p["url"], "credit": str(p.get("credit") or r["source"])[:80],
                           "source_url": p.get("source_url") or r["source_url"]})
    r["photos"] = photos[:8]
    return r


def external_doc(r: dict) -> dict:
    """The listing fields an external row maps to (facts only; status and counters are set by the import)."""
    share = default_share(r["bedrooms"])
    try:
        seen = datetime.fromisoformat(r["seen_at"]).replace(tzinfo=timezone.utc)
    except ValueError:
        seen = _now()
    deposit = r["price_total"] * r["deposit_months"] if r["deposit_months"] else None
    return {
        "id": ext_listing_id(r["ext_id"]), "external": True, "ext_id": r["ext_id"], "kind": "room",
        "poster_role": None, "owner_id": None,
        "source": r["source"], "source_url": r["source_url"], "source_seen_at": r["seen_at"],
        "title": ext_title(r), "building_slug": r["building_slug"], "building_name": r["building_name"],
        "zone": r["zone"], "price_total": r["price_total"], "people_total": share,
        "price_per_person": int(round(r["price_total"] / share)),
        "bedrooms": r["bedrooms"], "bathrooms": r["bathrooms"], "size_sqm": r["size_sqm"], "floor": r["floor"],
        "furnished": r["furnished"], "amenities": r["amenities"],
        "min_months": r["min_contract_months"], "min_contract_months": r["min_contract_months"],
        "deposit_months": r["deposit_months"], "advance_months": r["advance_months"], "deposit": deposit,
        "available_from": r["available_from"], "move_in": r["available_from"],
        "gender_pref": "any", "description": "", "photo_links": [], "ext_photos": r["photos"],
        "utilities_note": "",
        "renewed_at": _iso(seen), "expires_at": _iso(seen + timedelta(days=EXT_TTL_DAYS)),
    }


def plan_external_import(raw: dict, existing: List[dict], now: datetime) -> dict:
    """What an import of the file does to the database, as plain data (so it can be tested without Mongo).
    existing: the external rows already stored ({ext_id, status, closed_reason}).
    Returns {"upsert": [doc...], "close": [ext_id...], "skipped": [ext_id...]}:
      * a row in the file is upserted by ext_id (facts refreshed, expiry pushed to seen_at + 21 days);
      * a row closed because it had dropped out of the file reopens when it comes back;
      * a row an admin closed or deleted, or that was confirmed gone, is skipped: never resurrected;
      * an open row no longer in the file is closed (reason "missing")."""
    have = {e["ext_id"]: e for e in existing if e.get("ext_id")}
    seen, upsert, skipped = set(), [], []
    for row in (raw or {}).get("listings") or []:
        r = clean_external_row(row if isinstance(row, dict) else {})
        if not r or r["ext_id"] in seen:
            continue
        seen.add(r["ext_id"])
        old = have.get(r["ext_id"])
        if old and old.get("status") == "closed" and old.get("closed_reason") not in EXT_REOPENABLE:
            skipped.append(r["ext_id"])
            continue
        doc = external_doc(r)
        if old and old.get("status") == "closed":
            doc["status"] = "active"
            doc["closed_reason"] = None
        upsert.append(doc)
    mark_shared_photos(upsert)
    close = [k for k, e in have.items() if k not in seen and e.get("status") != "closed"]
    return {"upsert": upsert, "close": close, "skipped": skipped}


def spots_of(x: dict, interest_people: int) -> dict:
    """Seats in a room: the share count, how many are taken (the poster of a "has a room, looking for mates"
    ad lives there already, plus everyone who pressed interest with their party size) and how many are left."""
    total = max(1, int(x.get("people_total") or default_share(x.get("bedrooms"))))
    taken = (1 if x.get("kind") == "mate_wanted" else 0) + interest_people
    return {"spots_total": total, "spots_taken": taken, "spots_left": max(0, total - taken)}


AVATAR_TONES = ["k", "r", "b", "s", "g", "l"]
_DEMO_NAME = re.compile(r"\s*\(ตัวอย่าง\)\s*$")


def avatar_of(name: str) -> dict:
    """{initials, tone} for an avatar disc, computed like the frontend's Avatar (initials() / toneFor()), so a
    public payload can draw the same disc without ever carrying the name."""
    s = _DEMO_NAME.sub("", (name or "").strip())
    if not s:
        return {"initials": "?", "tone": AVATAR_TONES[0]}
    parts = s.split()
    first = next((ch for ch in parts[0] if re.match(r"[A-Za-z0-9ก-ฮ]", ch)), parts[0][0])
    second = parts[1][0] if len(parts) > 1 and re.match(r"[A-Za-z]", parts[1]) else ""
    h = 0
    for ch in s:
        h = (h * 31 + ord(ch)) % 9973
    return {"initials": (first + second).upper(), "tone": AVATAR_TONES[h % len(AVATAR_TONES)]}


def mate_in_zone(m: dict, zone: str) -> bool:
    """A mate profile belongs to a zone when it names it or names no zone at all (open to anywhere)."""
    zs = m.get("zones") or []
    return not zs or zone in zs


def mate_zone_q(zone: str) -> list:
    """mate_in_zone as a Mongo $or (used by GET /mates?zone=)."""
    return [{"zones": zone}, {"zones": {"$size": 0}}, {"zones": {"$exists": False}}, {"zones": None}]


def gender_accepts(a: dict, b: dict) -> bool:
    """a's mate preference accepts b's gender."""
    p = a.get("mate_gender_pref") or "any"
    return p == "any" or p == b.get("gender")


def gate_ok(me: dict, other: dict) -> bool:
    """The two-way gender gate (same rule as match_score)."""
    return gender_accepts(me, other) and gender_accepts(other, me)


GENDER_ONLY = {"female": "ประกาศนี้รับเฉพาะเมทหญิง", "male": "ประกาศนี้รับเฉพาะเมทชาย"}


def listing_refuses(x: dict, mate: Optional[dict]) -> Optional[str]:
    """Why this person cannot press interest on a listing posted on the site, or None. A normal listing with a
    gender preference ("หาเมทชาย") takes only that gender; external rooms have no preference."""
    pref = x.get("gender_pref")
    if x.get("external") or pref not in GENDER_ONLY or not mate:
        return None
    return None if mate.get("gender") == pref else GENDER_ONLY[pref]


def interest_fields(x: dict, people: List[dict], viewer_id: Optional[str], viewer_mate: Optional[dict] = None) -> dict:
    """Public interest summary of a listing. people: the counting interests (open listing, open mate profile),
    oldest first, each {user_id, party_size, display_name, gender, mate_gender_pref}. User ids and names never
    leave this function: avatars are initials + tone only. viewer_mate: the viewer's LIVE mate profile (or None);
    with it, interest_match counts the other people who pass the gender gate both ways.
    The interested people are not one group that "fills up" (the gate splits them), so spots_* stay only for
    compatibility and must not drive copy."""
    n_people = sum(int(p.get("party_size") or 1) for p in people)
    mine = next((p for p in people if viewer_id and p.get("user_id") == viewer_id), None)
    match = None
    if viewer_mate:
        match = sum(1 for p in people if p.get("user_id") != viewer_id and gate_ok(viewer_mate, p))
    return {
        "interest_count": len(people), "interest_people": n_people,
        "interest_avatars": [avatar_of(p.get("display_name") or "") for p in people[:3]],
        "interest_match": match,
        **spots_of(x, n_people),
        "my_interest": {"party_size": int(mine.get("party_size") or 1)} if mine else None,
    }


def whole_first(x: dict, single: Optional[bool] = None) -> bool:
    """True when the whole-room rent is the headline price: a room for one (single_room), and every listing
    posted on the site except "มีห้องแล้ว หาเมท" (a landlord's room, a transfer or a short stay is rented as a
    whole; a split is only an option). Otherwise (shared rooms) the per-person price leads."""
    if x.get("external"):
        return bool(x.get("single_room") if single is None else single)
    return x.get("kind") != "mate_wanted"


def price_text(x: dict, single: Optional[bool] = None) -> str:
    """One-line price for the digest and the share card, following whole_first:
    '7,000 บาท/เดือน', '14,000 บาท/เดือน หารได้ 2 คนละ 7,000', '7,500 บาท/คน/เดือน (ทั้งห้อง 15,000 หาร 2)'."""
    total = int(x.get("price_total") or 0)
    n = max(1, int(x.get("people_total") or 1))
    per = int(x.get("price_per_person") or round(total / n))
    if whole_first(x, single):
        if n < 2:
            return f"{total:,} บาท/เดือน"
        lead = "อยู่คนเดียว หรือหาร" if (single if single is not None else x.get("single_room")) else "หารได้"
        return f"{total:,} บาท/เดือน {lead} {n} คนละ {per:,}"
    return f"{per:,} บาท/คน/เดือน (ทั้งห้อง {total:,} หาร {n})" if n > 1 else f"{total:,} บาท/เดือน"


def _closed_sort_key(x: dict) -> tuple:
    ts = x.get("closed_at") or x.get("reserved_until") or x.get("expires_at") or x.get("renewed_at") or ""
    return (ts, x.get("id") or "")


def _price_tier(x: dict) -> int:
    """Bucket rooms into 4 student-friendly price tiers (plus 4 for missing price)."""
    p = x.get("price_per_person")
    if p is None:
        return 4
    if p < 4000:
        return 0
    if p < 6500:
        return 1
    if p < 9000:
        return 2
    return 3


def _interleave_external_tiers(rows: List[dict]) -> List[dict]:
    """Deterministically mix clean external rooms across all price grades and distinct buildings."""
    by_tier = {t: [] for t in range(5)}
    for x in rows:
        by_tier[_price_tier(x)].append(x)

    queues = []
    for t in range(5):
        bucket = by_tier[t]
        if not bucket:
            continue
        bucket.sort(key=lambda x: (
            bool(x.get("shared_photo")),
            x.get("price_per_person") if x.get("price_per_person") is not None else 10 ** 9,
            x.get("id") or "",
        ))
        by_bldg = {}
        b_order = []
        for x in bucket:
            bk = x.get("building_slug") or x.get("id") or ""
            if bk not in by_bldg:
                by_bldg[bk] = []
                b_order.append(bk)
            by_bldg[bk].append(x)
        spread = []
        while any(by_bldg[bk] for bk in b_order):
            for bk in b_order:
                if by_bldg[bk]:
                    spread.append(by_bldg[bk].pop(0))
        queues.append(spread)

    out = []
    while any(queues):
        wave_buildings = set()
        for q in queues:
            if not q:
                continue
            idx = next(
                (i for i, item in enumerate(q)
                 if not (item.get("building_slug") and item["building_slug"] in wave_buildings)),
                0,
            )
            pick = q.pop(idx)
            out.append(pick)
            if pick.get("building_slug"):
                wave_buildings.add(pick["building_slug"])
    return out


def recommended_order(items: List[dict]) -> List[dict]:
    """sort=recommended: featured first, then native listings (newest first), then clean external rooms
    interleaved across 4 price grades & distinct buildings, then maybe_gone warnings, then gone archive."""
    def newest(lst):
        lst = sorted(lst, key=lambda x: x.get("id") or "")
        return sorted(lst, key=lambda x: x.get("renewed_at") or "", reverse=True)
    open_rows = [x for x in items if not x.get("is_gone")]
    gone_rows = sorted([x for x in items if x.get("is_gone")], key=_closed_sort_key, reverse=True)
    feat = [x for x in open_rows if x.get("featured")]
    native = [x for x in open_rows if not x.get("featured") and not x.get("external")]
    ext_clean = [x for x in open_rows if not x.get("featured") and x.get("external") and not x.get("maybe_gone")]
    ext_maybe = [x for x in open_rows if not x.get("featured") and x.get("external") and x.get("maybe_gone")]
    ext_maybe.sort(key=lambda x: (
        x.get("price_per_person") if x.get("price_per_person") is not None else 10 ** 9,
        x.get("id") or "",
    ))
    return newest(feat) + newest(native) + _interleave_external_tiers(ext_clean) + ext_maybe + gone_rows


def sort_listings(items: List[dict], sort: str) -> List[dict]:
    """Every list order, each ending on the unique id so paging (limit/skip) never repeats or skips a row.
    Gone archive rows (when include_closed=1) are always placed after open listings, newest closed first."""
    def newest(lst):
        lst = sorted(lst, key=lambda x: x.get("id") or "")
        return sorted(lst, key=lambda x: x.get("renewed_at") or "", reverse=True)
    open_rows = [x for x in items if not x.get("is_gone")]
    gone_rows = sorted([x for x in items if x.get("is_gone")], key=_closed_sort_key, reverse=True)
    if sort == "recommended":
        return recommended_order(open_rows) + gone_rows
    if sort == "price":
        open_rows = sorted(open_rows, key=lambda x: (not x.get("featured"), x.get("price_per_person") is None,
                                                     x.get("price_per_person") or 0, x.get("id") or ""))
        return open_rows + gone_rows
    if sort == "interest":
        open_rows = sorted(open_rows, key=lambda x: (-int(x.get("interest_people") or 0), -int(x.get("interest_count") or 0),
                                                     -int(x.get("peek_count") or 0), not x.get("featured"), x.get("id") or ""))
        return open_rows + gone_rows
    if sort == "move_in":
        open_rows = sorted(open_rows, key=lambda x: (not x.get("featured"), x.get("move_in") or "9999", x.get("id") or ""))
        return open_rows + gone_rows
    rows = newest(open_rows)
    return [x for x in rows if x.get("featured")] + [x for x in rows if not x.get("featured")] + gone_rows


SORTS = ("new", "recommended", "price", "interest", "move_in")


def short_room_title(x: dict) -> str:
    """Chip-sized room name: building (with the room type for external rooms, so two units in one building differ)."""
    t = x.get("building_name") or re.sub(r"^\s*\[ตัวอย่าง\]\s*", "", x.get("title") or "")
    if x.get("external") and x.get("building_name") and x.get("bedrooms") is not None:
        t = ("สตูดิโอ " if x["bedrooms"] == 0 else f"{x['bedrooms']} นอน ") + x["building_name"]
    return t if len(t) <= 34 else t[:33].rstrip() + "…"


# ---------------------------------------------------------------- OpenChat archive
# Old, anonymised ads from the group (data/dorm_chat_posts.json). They are a real-price and
# real-demand archive, never rooms on offer: no contact, no text, not mixed into listings.
# Only these fields ever leave the server, whatever the file holds.
CHAT_FIELDS = ("id", "date", "reposts", "kind", "building_slug", "building_name", "zone", "price_total",
               "price_per_person", "people_total", "room_type", "gender_pref", "move_in", "budget_min",
               "budget_max", "amenities")
CHAT_KINDS = ("room", "mate_wanted", "transfer", "short_term", "seeking")
_chat_cache = {"mtime": None, "data": None}


# A "mate_wanted" ad that gives only one price (no head count, no per-person figure) of at most this much
# is almost always the share each person pays: whole rooms near SWU start around 9,000 a month, and
# the extractor simply could not tell which number it saw. Such a price counts as per person, flagged
# `per_person_inferred` so the page shows it as "~x ฿/คน". Above the cap it stays a whole-room price.
INFER_PER_PERSON_MAX = 8000


def chat_price_info(p: dict) -> tuple:
    """(per-person monthly price or None, inferred?) of an offer post. 'seeking' posts have none.
    Whole-room prices (price_total without a head count) never become per-person values, except the
    mate-ad rule above, so per-person statistics never mix the two."""
    if p.get("kind") == "seeking":
        return None, False
    if p.get("price_per_person"):
        return int(p["price_per_person"]), False
    if p.get("price_total") and p.get("people_total"):
        return int(round(p["price_total"] / p["people_total"])), False
    if p.get("kind") == "mate_wanted" and p.get("price_total") and p["price_total"] <= INFER_PER_PERSON_MAX:
        return int(p["price_total"]), True
    return None, False


def chat_per_person(p: dict) -> Optional[int]:
    """Per-person monthly price of an offer post; None for 'seeking' posts and unknown prices."""
    return chat_price_info(p)[0]


def clean_chat_posts(raw: dict) -> dict:
    posts = []
    for p in raw.get("posts") or []:
        if p.get("kind") not in CHAT_KINDS or not p.get("id") or not p.get("date"):
            continue
        x = {k: p.get(k) for k in CHAT_FIELDS}
        x["reposts"] = int(x.get("reposts") or 1)
        x["amenities"] = _clean_tags(x.get("amenities") or [], AMENITIES)
        x["per_person"], x["per_person_inferred"] = chat_price_info(x)
        posts.append(x)
    posts.sort(key=lambda x: (x["date"], x["id"]), reverse=True)
    period = raw.get("period") or {}
    by_building = {}
    by_zone = {}
    for x in posts:
        if x.get("building_slug"):
            by_building.setdefault(x["building_slug"], []).append(x)
        if x.get("zone"):
            by_zone.setdefault(x["zone"], []).append(x)
    overview = {
        "posts": len(posts),
        "seeking": sum(1 for p in posts if p["kind"] == "seeking"),
        "priced": sum(1 for p in posts if p.get("per_person")),
        "period": {"from": period.get("from"), "to": period.get("to")},
        "per_person": price_summary([p["per_person"] for p in posts if p.get("per_person")]),
        "by_zone": {z["id"]: chat_summary(by_zone[z["id"]]) for z in ZONES if z["id"] in by_zone},
    }
    return {"period": {"from": period.get("from"), "to": period.get("to")}, "posts": posts,
            "by_building": by_building, "overview": overview}


_insights_cache = {"mtime": None, "data": None}
_campuses_cache = {"mtime": None, "data": None}
DEFAULT_CAMPUS = "swu-prasarnmit"


def load_campuses() -> dict:
    """Load university/campus config once and refresh when dorm_campuses.json changes."""
    path = DATA_DIR / "dorm_campuses.json"
    fallback = {
        "default_campus": DEFAULT_CAMPUS,
        "campuses": [{
            "slug": DEFAULT_CAMPUS, "status": "active", "short_th": "มศว",
            "name_th": "มศว ประสานมิตร", "full_th": "มหาวิทยาลัยศรีนครินทรวิโรฒ ประสานมิตร",
            "name_en": "SWU Prasarnmit", "area_th": "อโศก–เพชรบุรี", "city_th": "กรุงเทพฯ",
            "base_path": "/dorm", "email_domains": ["g.swu.ac.th", "swu.ac.th"], "seo_keywords": [],
        }],
    }
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return fallback
    if _campuses_cache["mtime"] != mtime:
        try:
            _campuses_cache["data"] = json.loads(path.read_text(encoding="utf-8"))
            _campuses_cache["mtime"] = mtime
        except Exception:
            return _campuses_cache["data"] or fallback
    return _campuses_cache["data"] or fallback


def campus_info(slug: Optional[str] = None) -> dict:
    cfg = load_campuses()
    want = slug or cfg.get("default_campus") or DEFAULT_CAMPUS
    for c in cfg.get("campuses") or []:
        if c.get("slug") == want:
            return c
    return (cfg.get("campuses") or [{}])[0]


def _campus_q(campus: Optional[str] = None) -> dict:
    if not campus or campus == DEFAULT_CAMPUS:
        return {"$or": [{"campus_slug": DEFAULT_CAMPUS}, {"campus_slug": {"$exists": False}}, {"campus_slug": None}]}
    return {"campus_slug": campus}


def load_insights() -> Optional[dict]:
    """Read insights summary once and refresh only when the file changes."""
    path = DATA_DIR / "dorm_insights.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return None
    if _insights_cache["mtime"] != mtime:
        try:
            _insights_cache["data"] = json.loads(path.read_text(encoding="utf-8"))
            _insights_cache["mtime"] = mtime
        except Exception:
            return _insights_cache["data"]
    return _insights_cache["data"]


def load_chat_posts() -> dict:
    """The archive, re-read only when the file changes."""
    path = DATA_DIR / "dorm_chat_posts.json"
    try:
        mtime = path.stat().st_mtime
    except OSError:
        return {"period": {"from": None, "to": None}, "posts": []}
    if _chat_cache["mtime"] != mtime:
        _chat_cache["data"] = clean_chat_posts(json.loads(path.read_text(encoding="utf-8")))
        _chat_cache["mtime"] = mtime
    return _chat_cache["data"]


def _nearest_rank(vals: List[int], q: float) -> int:
    return vals[max(0, math.ceil(q * len(vals)) - 1)]


def price_summary(vals: List[int]) -> dict:
    """{n, min, median, max, p25, p75}; percentiles are nearest-rank, so every number was really seen."""
    vals = sorted(v for v in vals if v)
    if not vals:
        return {"n": 0, "min": None, "median": None, "max": None, "p25": None, "p75": None}
    mid = len(vals) // 2
    median = vals[mid] if len(vals) % 2 else round((vals[mid - 1] + vals[mid]) / 2)
    return {"n": len(vals), "min": vals[0], "median": int(median), "max": vals[-1],
            "p25": _nearest_rank(vals, 0.25), "p75": _nearest_rank(vals, 0.75)}


def chat_summary(posts: List[dict]) -> dict:
    return {"count": len(posts), "last_date": max((p["date"] for p in posts), default=None),
            "per_person": price_summary([p["per_person"] for p in posts if p.get("per_person")])}


def filter_chat(posts: List[dict], building: Optional[str] = None, zone: Optional[str] = None,
                kind: Optional[str] = None, max_price: Optional[int] = None,
                min_price: Optional[int] = None) -> List[dict]:
    """kind: one id or a comma list. Price bounds use the per-person price of offers and the
    budget of 'seeking' posts; posts with no known price drop out once a bound is set."""
    kinds = {k for k in (kind or "").split(",") if k in CHAT_KINDS}
    out = []
    for p in posts:
        if building and p.get("building_slug") != building:
            continue
        if zone and p.get("zone") != zone:
            continue
        if kinds and p["kind"] not in kinds:
            continue
        if max_price or min_price:
            if p["kind"] == "seeking":
                lo, hi = p.get("budget_min") or p.get("budget_max"), p.get("budget_max") or p.get("budget_min")
            else:
                lo = hi = p.get("per_person")
            if lo is None:
                continue
            if max_price and lo > max_price:
                continue
            if min_price and hi < min_price:
                continue
        out.append(p)
    return out


# ---------------------------------------------------------------- matching
_TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]


def _th_date(iso: str) -> str:
    """'2026-12-01' → '1 ธ.ค. 69' (Buddhist year, short) — how the site shows dates."""
    try:
        y, m, d = (int(v) for v in (iso or "")[:10].split("-"))
        return f"{d} {_TH_MONTHS[m - 1]} {(y + 543) % 100:02d}"
    except (ValueError, IndexError):
        return iso or ""


def _month_index(ym: str) -> Optional[int]:
    try:
        y, m = ym[:7].split("-")
        return int(y) * 12 + int(m)
    except Exception:
        return None


def match_score(me: Optional[dict], other: dict) -> Optional[dict]:
    """0–100 compatibility between two mate profiles, with the reasons shown to
    the user. Gender preference is a hard gate in both directions: a mismatch
    returns score 0, not a low number, so it can be filtered out."""
    if not me or me.get("id") == other.get("id"):
        return None

    def accepts(a, b):
        p = a.get("mate_gender_pref", "any")
        return p == "any" or p == b.get("gender")

    if not (accepts(me, other) and accepts(other, me)):
        return {"score": 0, "reasons": ["เพศที่ต้องการไม่ตรงกัน"]}

    reasons, score = [], 0.0
    # budget overlap (35)
    lo = max(me.get("budget_min", 0), other.get("budget_min", 0))
    hi = min(me.get("budget_max", 0), other.get("budget_max", 0))
    if hi >= lo:
        # scale by how much of the narrower range overlaps: 500 baht of overlap
        # on a 2,000-wide range is a weak match, not a full 35
        wa = max(1, me.get("budget_max", 0) - me.get("budget_min", 0))
        wb = max(1, other.get("budget_max", 0) - other.get("budget_min", 0))
        ratio = min(1.0, max(hi - lo, 1) / min(wa, wb))
        score += 5 + 30 * ratio
        reasons.append(f"งบตรงกันช่วง {lo:,}–{hi:,}" if ratio >= 0.5 else f"งบทับกันนิดเดียว ({lo:,}–{hi:,})")
    else:
        gap = lo - hi
        # stays below the smallest overlap score (5) so any overlap ranks higher
        score += max(0.0, 4 - gap / 250)
    # zones (25) — empty = flexible
    za, zb = set(me.get("zones") or []), set(other.get("zones") or [])
    if not za or not zb:
        score += 15
    elif za & zb:
        score += 25
        reasons.append("โซนที่อยากอยู่ตรงกัน")
    # move-in month (20)
    ma, mb = _month_index(me.get("move_in", "")), _month_index(other.get("move_in", ""))
    if ma and mb:
        d = abs(ma - mb)
        score += {0: 20, 1: 14, 2: 7}.get(d, 0)
        if d == 0:
            reasons.append("ย้ายเข้าเดือนเดียวกัน")
    # lifestyle (20): shared tags up, known clashes down
    ta, tb = set(me.get("tags") or []), set(other.get("tags") or [])
    shared = ta & tb - {"has_pet"}
    score += min(20, 5 * len(shared))
    clashes = []
    if ("night_owl" in ta and "early_bird" in tb) or ("early_bird" in ta and "night_owl" in tb):
        clashes.append("เวลานอนต่างกัน")
    if ("has_pet" in ta and "pet_ok" not in tb and "has_pet" not in tb) or \
       ("has_pet" in tb and "pet_ok" not in ta and "has_pet" not in ta) or \
       ("no_pet" in ta and ("has_pet" in tb or "pet_ok" in tb)) or \
       ("no_pet" in tb and ("has_pet" in ta or "pet_ok" in ta)):
        clashes.append("เรื่องสัตว์เลี้ยง")
    if ("social" in ta and "quiet" in tb) or ("quiet" in ta and "social" in tb):
        clashes.append("ชอบเงียบ vs ชอบมีเพื่อนมา")
    score -= 8 * len(clashes)
    labels = {t["id"]: t["label"] for t in LIFESTYLE_TAGS}
    if shared:
        reasons.append("เหมือนกัน: " + ", ".join(labels[t] for t in sorted(shared)))
    # one side already has a room — that is what most seekers need
    if me.get("has_room") != other.get("has_room"):
        reasons.append("อีกฝ่ายมีห้องแล้ว" if other.get("has_room") else "คุณมีห้อง อีกฝ่ายยังไม่มี")
    return {"score": int(max(0, min(100, round(score)))), "reasons": reasons, "clashes": clashes}


# ---------------------------------------------------------------- digest
def build_digest(listings: List[dict], mates: List[dict], base_url: str, since: datetime) -> str:
    kinds = {k["id"]: k for k in KINDS}
    zones = {z["id"]: z["label"] for z in ZONES}
    th_months = ["", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

    def d(dt):
        return f"{dt.day} {th_months[dt.month]}"

    base = base_url.rstrip("/")
    lines = [f"🏠 สรุปห้อง·เมท รอบ มศว ({d(since)} – {d(_now())})", ""]
    if listings:
        lines.append(f"📌 ห้อง/ส่งต่อสัญญาใหม่ {len(listings)} รายการ")
        for x in listings[:12]:
            k = kinds.get(x["kind"], {})
            where = x.get("building_name") or zones.get(x["zone"], "")
            mi = x.get("move_in", "")[:10]
            try:
                mi = d(datetime.fromisoformat(mi))
            except Exception:
                pass
            star = "⭐ " if x.get("featured") else ""
            lines.append(f"{star}{k.get('emoji', '•')} {where} {price_text(x)}, เข้า {mi}")
            lines.append(f"   {base}/dorm/rooms/{x['id']}")
        if len(listings) > 12:
            lines.append(f"   …และอีก {len(listings) - 12} รายการ")
        lines.append("")
    if mates:
        f = sum(1 for m in mates if m.get("gender") == "female")
        mm = sum(1 for m in mates if m.get("gender") == "male")
        no_room = sum(1 for m in mates if not m.get("has_room"))
        zc = {}
        for m in mates:
            for z in m.get("zones") or []:
                zc[z] = zc.get(z, 0) + 1
        top = sorted(zc.items(), key=lambda kv: -kv[1])[:2]
        lines.append(f"👫 คนหาเมทใหม่ {len(mates)} คน (ญ {f}, ช {mm}), ยังไม่มีห้อง {no_room} คน")
        if top:
            lines.append("   โซนยอดฮิต: " + ", ".join(zones.get(z, z) for z, _ in top))
        lines.append(f"   ดู + กรองตามงบ/โซน/นิสัย: {base}/dorm/mates")
        lines.append("")
    if not listings and not mates:
        lines.append("สัปดาห์นี้ยังไม่มีประกาศใหม่ — ลงก่อนได้เห็นก่อน 🙌")
        lines.append("")
    lines.append(f"✍️ ลงประกาศ/หาเมทฟรี ไม่ต้องโพสต์ซ้ำ (ประกาศอยู่ 30 วัน): {base}/dorm")
    return "\n".join(lines)


_PIL_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}


def decodes_as_image(raw: bytes, mime: str) -> bool:
    """True when Pillow can fully decode the bytes as the claimed format (a right header on junk is refused)."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(raw)) as im:
            if im.format != _PIL_FORMAT.get(mime):
                return False
            im.load()
            w, h = im.size
            return 0 < w <= 20000 and 0 < h <= 20000
    except Exception:
        return False


def site_origin(request) -> str:
    """Origin for absolute links in share pages: the configured site origin (DORM_SITE_ORIGIN, else the repo's
    FRONTEND_URL) when it is an https origin; otherwise the Host the request came to. X-Forwarded-Host is never
    trusted: anyone can send it, and the share page would then point at their site."""
    for key in ("DORM_SITE_ORIGIN", "FRONTEND_URL"):
        v = (os.environ.get(key) or "").strip().rstrip("/")
        if re.fullmatch(r"https://[\w.-]+(:\d+)?", v):
            return v
    proto = "https" if request.headers.get("x-forwarded-proto") == "https" else request.url.scheme
    host = request.headers.get("host") or request.url.netloc
    if not re.fullmatch(r"[\w.-]+(:\d+)?", host or ""):
        host = request.url.netloc
    return f"{proto}://{host}"


# ---------------------------------------------------------------- routes
def get_dorm_routes(db, get_current_user, get_current_user_optional):
    state = {"indexed": False, "seeded": False, "cache_ver": 0, "rcache": {}, "rlocks": {}}

    def _bust_cache() -> None:
        state["cache_ver"] += 1
        state["rcache"].clear()

    async def _cached(key, ttl: int, loader):
        now_m = time.monotonic()
        hit = state["rcache"].get(key)
        if hit and (now_m - hit[0]) < ttl:
            return hit[1]
        lock = state["rlocks"].setdefault(key, asyncio.Lock())
        async with lock:
            hit = state["rcache"].get(key)
            if hit and (time.monotonic() - hit[0]) < ttl:
                return hit[1]
            ver = state["cache_ver"]
            val = await loader()
            if state["cache_ver"] == ver:
                if len(state["rcache"]) >= 250:
                    oldest = min(state["rcache"].items(), key=lambda kv: kv[1][0])[0]
                    state["rcache"].pop(oldest, None)
                state["rcache"][key] = (time.monotonic(), val)
            return val

    def _response_from_bytes(raw_bytes: bytes, gz_bytes: Optional[bytes], request: Request) -> Response:
        accept_enc = (request.headers.get("accept-encoding") or "").lower()
        if "gzip" in accept_enc and gz_bytes is not None:
            return Response(
                content=gz_bytes,
                media_type="application/json; charset=utf-8",
                headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"},
            )
        return Response(
            content=raw_bytes,
            media_type="application/json; charset=utf-8",
            headers={"Vary": "Accept-Encoding"},
        )

    async def _cached_json(key, ttl: int, loader, request: Request) -> Response:
        jkey = ("_json", key)
        now_m = time.monotonic()
        hit = state["rcache"].get(jkey)
        if hit and (now_m - hit[0]) < ttl:
            return _response_from_bytes(hit[1], hit[2], request)
        lock = state["rlocks"].setdefault(jkey, asyncio.Lock())
        async with lock:
            hit = state["rcache"].get(jkey)
            if hit and (time.monotonic() - hit[0]) < ttl:
                return _response_from_bytes(hit[1], hit[2], request)
            ver = state["cache_ver"]
            val = await loader()
            raw_bytes = json.dumps(val, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
            gz_bytes = gzip.compress(raw_bytes, compresslevel=5) if len(raw_bytes) >= 500 else None
            if state["cache_ver"] == ver:
                if len(state["rcache"]) >= 250:
                    oldest = min(state["rcache"].items(), key=lambda kv: kv[1][0])[0]
                    state["rcache"].pop(oldest, None)
                state["rcache"][jkey] = (time.monotonic(), raw_bytes, gz_bytes)
            return _response_from_bytes(raw_bytes, gz_bytes, request)

    def _is_admin(u) -> bool:
        return getattr(u, "role", None) == "admin"

    def _google_client_id() -> str:
        return (os.environ.get("GOOGLE_CLIENT_ID") or DEFAULT_GOOGLE_CLIENT_ID).strip()

    def _swu_verified(u) -> bool:
        email = (getattr(u, "email", "") or "").lower()
        return getattr(u, "auth_method", "") == "google" and (email.endswith("@swu.ac.th") or email.endswith(".swu.ac.th"))

    async def _dismiss_verification_proposals(user_id: str, note: str) -> None:
        await db.dorm_admin_proposals.update_many(
            {"kind": "review_verification", "target_id": user_id, "status": "pending"},
            {"$set": {"status": "dismissed", "decided_at": _iso(_now()), "decided_by": "system:auto", "decision_note": note}},
        )

    async def _claim_pregrant(u) -> bool:
        if not u or _swu_verified(u):
            return False
        email = (getattr(u, "email", "") or "").strip().lower()
        if not email:
            return False
        existing = await db.dorm_verifications.find_one({"user_id": u.id, "status": "verified"}, {"_id": 1})
        if existing:
            return False
        pg = await db.dorm_verify_pregrants.find_one({"personal_email": email, "claimed_by": None}, {"_id": 0})
        if not pg or not pg.get("swu_email"):
            return False
        taken = await db.dorm_verifications.find_one(
            {"swu_email": pg["swu_email"], "status": "verified", "user_id": {"$ne": u.id}}, {"_id": 1}
        )
        if taken:
            return False
        now_s = _iso(_now())
        claimed = await db.dorm_verify_pregrants.update_one(
            {"swu_email": pg["swu_email"], "personal_email": email, "claimed_by": None},
            {"$set": {"claimed_by": u.id, "claimed_at": now_s}},
        )
        if not claimed.matched_count:
            return False
        await db.dorm_verifications.update_one(
            {"user_id": u.id},
            {"$set": {
                "user_id": u.id, "status": "verified", "method": "swu_account_vouch", "kind": "student",
                "status_label": VERIFY_LABELS["student"], "swu_email": pg["swu_email"],
                "vouched_by": pg.get("vouched_by") or "", "verified_at": now_s, "updated_at": now_s, "reject_reason": "",
            }, "$setOnInsert": {"created_at": now_s}},
            upsert=True,
        )
        await _backfill_verified(u.id)
        await _dismiss_verification_proposals(u.id, "self_verified_vouch_pregrant")
        _bust_cache()
        return True

    async def _swu_verified_async(u) -> bool:
        if _swu_verified(u):
            return True
        doc = await db.dorm_verifications.find_one({"user_id": u.id, "status": "verified"}, {"_id": 1})
        if doc:
            return True
        return await _claim_pregrant(u)

    async def _backfill_verified(user_id: str) -> None:
        await db.dorm_listings.update_many({"owner_id": user_id}, {"$set": {"poster_swu_verified": True}})
        await db.dorm_mates.update_many({"user_id": user_id}, {"$set": {"swu_verified": True}})
        await db.dorm_reviews.update_many({"user_id": user_id}, {"$set": {"swu_verified": True}})

    async def _auto_resolve_reports(target_type: str, target_id: str, reason_tag: str, reasons_in: Optional[list] = None) -> int:
        if not target_id:
            return 0
        q: dict = {"target_type": target_type, "target_id": target_id, "resolved": False}
        if reasons_in is not None:
            q["reason"] = {"$in": list(reasons_in)}
        res = await db.dorm_reports.update_many(q, {"$set": {"resolved": True, "resolved_at": _iso(_now()), "resolved_by": reason_tag}})
        return res.modified_count

    def _smtp_enabled() -> bool:
        return bool(os.environ.get("DORM_SMTP_HOST", "").strip())

    def _send_otp_email(to_email: str, code: str) -> None:
        host = os.environ.get("DORM_SMTP_HOST", "").strip()
        port = int(os.environ.get("DORM_SMTP_PORT", "587"))
        user = os.environ.get("DORM_SMTP_USER", "").strip()
        pw = os.environ.get("DORM_SMTP_PASS", "").strip()
        sender = os.environ.get("DORM_SMTP_FROM", "").strip() or user or "noreply@swumkt.org"
        msg = EmailMessage()
        msg["Subject"] = f"รหัสยืนยันนิสิต มศว: {code}"
        msg["From"] = sender
        msg["To"] = to_email
        msg.set_content(
            f"รหัสยืนยันตัวตนสำหรับ หาห้อง หาเมท มศว (/dorm) คือ: {code}\n\n"
            "รหัสนี้ใช้ได้ภายใน 15 นาที หากคุณไม่ได้เป็นผู้ขอรหัสนี้ สามารถละเว้นอีเมลนี้ได้"
        )
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=10) as s:
                if user:
                    s.login(user, pw)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=10) as s:
                s.starttls()
                if user:
                    s.login(user, pw)
                s.send_message(msg)

    async def _verification_info(u) -> dict:
        cid = _google_client_id()
        if _swu_verified(u):
            swu_em = (u.email or "").strip().lower()
            pg = await db.dorm_verify_pregrants.find_one({"swu_email": swu_em}, {"_id": 0, "personal_email": 1, "claimed_by": 1})
            return {
                "verified": True, "status": "verified", "method": "google_swu",
                "status_label": VERIFY_LABELS["student"], "swu_email": swu_em,
                "reject_reason": "", "smtp_enabled": _smtp_enabled(),
                "google_enabled": bool(cid), "google_client_id": cid,
                "vouched_personal_email": (pg or {}).get("personal_email") or "",
                "vouch_claimed": bool(pg and pg.get("claimed_by")),
            }
        await _claim_pregrant(u)
        doc = await db.dorm_verifications.find_one({"user_id": u.id}, {"_id": 0, "otp_hash": 0})
        if doc:
            return {
                "verified": doc.get("status") == "verified",
                "status": doc.get("status") or "none",
                "method": doc.get("method") or "",
                "kind": doc.get("kind") or "student",
                "status_label": doc.get("status_label") or VERIFY_LABELS.get(doc.get("kind") or "student", VERIFY_LABELS["student"]),
                "swu_email": doc.get("swu_email") or "",
                "reject_reason": doc.get("reject_reason") or "",
                "smtp_enabled": _smtp_enabled(),
                "google_enabled": bool(cid), "google_client_id": cid,
                "vouched_personal_email": "", "vouch_claimed": False,
            }
        return {
            "verified": False, "status": "none", "method": "", "kind": "",
            "status_label": "", "swu_email": "", "reject_reason": "",
            "smtp_enabled": _smtp_enabled(),
            "google_enabled": bool(cid), "google_client_id": cid,
            "vouched_personal_email": "", "vouch_claimed": False,
        }

    async def _ensure():
        if not state["indexed"]:
            await db.dorm_listings.create_index("id", unique=True)
            await db.dorm_listings.create_index([("status", 1), ("expires_at", -1)])
            await db.dorm_listings.create_index([("building_slug", 1), ("status", 1), ("expires_at", -1)])
            await db.dorm_mates.create_index("id", unique=True)
            await db.dorm_mates.create_index("user_id", unique=True)
            await db.dorm_buildings.create_index("slug", unique=True)
            await db.dorm_reviews.create_index([("building_slug", 1), ("user_id", 1)], unique=True)
            await db.dorm_events.create_index([("target_id", 1), ("type", 1)])
            await db.dorm_photos.create_index("id", unique=True)
            await db.dorm_photos.create_index([("owner_id", 1), ("created_at", -1)])
            await db.dorm_listings.create_index("ext_id", unique=True, sparse=True)
            await db.dorm_interests.create_index([("listing_id", 1), ("user_id", 1)], unique=True)
            await db.dorm_interests.create_index("user_id")
            await db.dorm_verifications.create_index("user_id", unique=True)
            await db.dorm_verifications.create_index("status")
            await db.dorm_verify_pregrants.create_index("swu_email", unique=True)
            await db.dorm_verify_pregrants.create_index("personal_email")
            await db.dorm_threads.create_index("id", unique=True)
            await db.dorm_threads.create_index("pair_key", unique=True)
            await db.dorm_threads.create_index([("participants", 1), ("last_at", -1)])
            await db.dorm_messages.create_index([("thread_id", 1), ("created_at", 1)])
            await db.dorm_messages.create_index([("sender_id", 1), ("created_at", -1)])
            await db.dorm_interests.create_index("mate_id")
            await db.dorm_peeks.create_index([("listing_id", 1), ("anon_id", 1)], unique=True)
            await db.dorm_gone_signals.create_index([("listing_id", 1), ("actor_key", 1)], unique=True)
            await ensure_agent_indexes(db)
            state["indexed"] = True
        if not state["seeded"]:
            # idempotent: inserts missing buildings, backfills new fields, keeps admin edits
            await _seed_buildings()
            state["seeded"] = True
        sync_res = await _sync_external()
        if sync_res and (sync_res.get("upserted") or sync_res.get("closed")):
            _bust_cache()
        if await _sweep_unconfirmed_native():
            _bust_cache()
        if await _sweep_maintenance():
            _bust_cache()

    async def _sweep_unconfirmed_native(force: bool = False) -> int:
        """Auto-pauses native listings that received gone reports >= 48h ago without owner confirmation."""
        now_dt = _now()
        last = state.get("sweep_at")
        if not force and last and (now_dt - last).total_seconds() < 60:
            return 0
        state["sweep_at"] = now_dt
        cutoff = _iso(now_dt - timedelta(hours=NATIVE_GONE_GRACE_HOURS))
        now_s = _iso(now_dt)
        q = {
            "external": {"$ne": True},
            "status": {"$in": ["active", "reserved"]},
            "owner_confirm_needed": True,
            "gone_check_since": {"$ne": None, "$lte": cutoff},
        }
        lids = [x["id"] for x in await db.dorm_listings.find(q, {"_id": 0, "id": 1}).to_list(200)]
        if not lids:
            return 0
        res = await db.dorm_listings.update_many(
            {"id": {"$in": lids}},
            {"$set": {
                "status": "closed",
                "closed_by": "system",
                "closed_reason": "paused_unconfirmed",
                "closed_at": now_s,
                "reserved_until": None,
            }},
        )
        await db.dorm_reports.update_many(
            {"target_type": "listing", "target_id": {"$in": lids}, "reason": {"$in": list(GONE_REASONS)}, "resolved": False},
            {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": "system_paused_48h"}},
        )
        return res.modified_count

    async def _sweep_maintenance(force: bool = False) -> int:
        """Periodic self-healing cleanup so stale queues and orphans don't pile up for admin."""
        now_dt = _now()
        last = state.get("maint_at")
        if not force and last and (now_dt - last).total_seconds() < 300:
            return 0
        state["maint_at"] = now_dt
        now_s = _iso(now_dt)
        changed = 0

        # 1) Auto-resolve open reports pointing to deleted targets OR closed >= 7 days ago
        old_closed_cutoff = _iso(now_dt - timedelta(days=7))
        open_reps = await db.dorm_reports.find({"resolved": False}, {"_id": 0, "id": 1, "target_type": 1, "target_id": 1}).to_list(500)
        if open_reps:
            lids = list({r["target_id"] for r in open_reps if r.get("target_type") == "listing"})
            mids = list({r["target_id"] for r in open_reps if r.get("target_type") == "mate"})
            rids = list({r["target_id"] for r in open_reps if r.get("target_type") == "review"})
            lmap = {x["id"]: x async for x in db.dorm_listings.find({"id": {"$in": lids}}, {"_id": 0, "id": 1, "status": 1, "closed_at": 1})} if lids else {}
            mmap = {x["id"]: x async for x in db.dorm_mates.find({"id": {"$in": mids}}, {"_id": 0, "id": 1, "status": 1, "closed_at": 1})} if mids else {}
            rev_set = {x["id"] async for x in db.dorm_reviews.find({"id": {"$in": rids}}, {"_id": 0, "id": 1})} if rids else set()
            stale_rids = []
            for r in open_reps:
                tt, tid = r.get("target_type"), r.get("target_id")
                if tt == "listing":
                    tgt = lmap.get(tid)
                    if tgt is None or (tgt.get("status") == "closed" and (tgt.get("closed_at") or "") <= old_closed_cutoff):
                        stale_rids.append(r["id"])
                elif tt == "mate":
                    tgt = mmap.get(tid)
                    if tgt is None or (tgt.get("status") == "closed" and (tgt.get("closed_at") or "") <= old_closed_cutoff):
                        stale_rids.append(r["id"])
                elif tt == "review" and tid not in rev_set:
                    stale_rids.append(r["id"])
            if stale_rids:
                rr = await db.dorm_reports.update_many(
                    {"id": {"$in": stale_rids}, "resolved": False},
                    {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": "system_stale_sweep"}},
                )
                changed += rr.modified_count

        # 2) Clean orphaned uploaded photos older than 24h not referenced by any listing
        photo_cutoff = _iso(now_dt - timedelta(hours=24))
        old_photos = await db.dorm_photos.find({"created_at": {"$lte": photo_cutoff}}, {"_id": 0, "id": 1}).to_list(200)
        if old_photos:
            used_pids = set()
            async for lst in db.dorm_listings.find({"photo_links.0": {"$exists": True}}, {"_id": 0, "photo_links": 1}):
                for u in lst.get("photo_links") or []:
                    m = re.fullmatch(r"/api/dorm/photos/([a-f0-9]{16})", u or "")
                    if m:
                        used_pids.add(m.group(1))
            orphan_pids = [p["id"] for p in old_photos if p["id"] not in used_pids]
            if orphan_pids:
                dr = await db.dorm_photos.delete_many({"id": {"$in": orphan_pids}})
                changed += dr.deleted_count

        # 3) Clean expired abandoned OTP records (> 24h past expiry)
        otp_cutoff = _iso(now_dt - timedelta(hours=24))
        od = await db.dorm_verifications.delete_many({"status": "otp_sent", "otp_expires_at": {"$lte": otp_cutoff}})
        changed += od.deleted_count

        # 4) Auto-dismiss obsolete pending admin proposals whose target is already handled
        pend_props = await db.dorm_admin_proposals.find(
            {"status": "pending", "kind": {"$in": ["review_verification", "resolve_report"]}},
            {"_id": 0, "id": 1, "kind": 1, "target_id": 1},
        ).to_list(200)
        if pend_props:
            vuids = [p["target_id"] for p in pend_props if p["kind"] == "review_verification" and p.get("target_id")]
            rpids = [p["target_id"] for p in pend_props if p["kind"] == "resolve_report" and p.get("target_id")]
            verified_uids = {v["user_id"] async for v in db.dorm_verifications.find({"user_id": {"$in": vuids}, "status": "verified"}, {"_id": 0, "user_id": 1})} if vuids else set()
            resolved_rids = {r["id"] async for r in db.dorm_reports.find({"id": {"$in": rpids}, "resolved": True}, {"_id": 0, "id": 1})} if rpids else set()
            obs_ids = [
                p["id"] for p in pend_props
                if (p["kind"] == "review_verification" and p.get("target_id") in verified_uids)
                or (p["kind"] == "resolve_report" and p.get("target_id") in resolved_rids)
            ]
            if obs_ids:
                pr = await db.dorm_admin_proposals.update_many(
                    {"id": {"$in": obs_ids}, "status": "pending"},
                    {"$set": {"status": "dismissed", "decided_at": now_s, "decided_by": "system:auto", "decision_note": "target_already_handled"}},
                )
                changed += pr.modified_count
        return changed

    async def _sync_external(force: bool = False) -> Optional[dict]:
        """Imports data/dorm_external_listings.json once per process and again whenever the file changes."""
        now_m = time.monotonic()
        if not force and state.get("ext_mtime") is not None and (now_m - (state.get("ext_stat_at") or 0)) < 5:
            return None
        state["ext_stat_at"] = now_m
        path = DATA_DIR / EXT_FILE
        try:
            mtime = path.stat().st_mtime
        except OSError:
            return None
        if state.get("ext_mtime") == mtime and not force:
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None          # half-written file: try again on the next request
        res = await import_external(raw)
        state["ext_mtime"] = mtime
        return res

    async def import_external(raw: dict) -> dict:
        existing = await db.dorm_listings.find({"external": True}, {"_id": 0, "ext_id": 1, "status": 1, "closed_reason": 1}).to_list(10000)
        plan = plan_external_import(raw, existing, _now())
        now = _iso(_now())
        for doc in plan["upsert"]:
            on_insert = {"status": "active", "featured": False, "views": 0, "contact_reveals": 0, "reports": 0, "created_at": now}
            for k in ("status",):
                if k in doc:
                    on_insert.pop(k)
            await db.dorm_listings.update_one({"ext_id": doc["ext_id"]}, {"$set": doc, "$setOnInsert": on_insert}, upsert=True)
        if plan["close"]:
            await db.dorm_listings.update_many({"ext_id": {"$in": plan["close"]}, "external": True},
                                               {"$set": {"status": "closed", "closed_reason": "missing", "closed_at": now}})
        return {"upserted": len(plan["upsert"]), "closed": len(plan["close"]), "skipped": len(plan["skipped"])}

    async def _seed_buildings(overwrite: bool = False) -> int:
        seed = json.loads((DATA_DIR / "dorm_buildings_seed.json").read_text(encoding="utf-8"))
        n = 0
        for b in seed:
            b = BuildingIn(**b).model_dump()
            b["source"] = "openchat-2026"
            if overwrite:
                await db.dorm_buildings.update_one({"slug": b["slug"]}, {"$set": b}, upsert=True)
            else:
                await db.dorm_buildings.update_one({"slug": b["slug"]}, {"$setOnInsert": b}, upsert=True)
                # buildings seeded before minutes_to_swu existed get it once
                await db.dorm_buildings.update_one(
                    {"slug": b["slug"], "minutes_to_swu": {"$exists": False}},
                    {"$set": {"minutes_to_swu": b["minutes_to_swu"], "travel_mode": b["travel_mode"],
                              "transit": b["transit"]}})
                # same for the project photos / official link / public review summary (an admin edit, even to [], is kept)
                for field in ("photos", "official_url", "web_review_summary", "web_review_sources"):
                    await db.dorm_buildings.update_one(
                        {"slug": b["slug"], field: {"$exists": False}}, {"$set": {field: b[field]}})
            n += 1
        return n

    def _active_q():
        return {"status": {"$in": ["active", "reserved"]}, "expires_at": {"$gt": _iso(_now())}}

    def _active_listing_q():
        now_s = _iso(_now())
        return {
            "status": {"$in": ["active", "reserved"]},
            "expires_at": {"$gt": now_s},
            "$nor": [{"status": "reserved", "reserved_until": {"$ne": None, "$lte": now_s}}],
        }

    PUBLIC_LISTING = {"_id": 0, "contact_line": 0, "contact_phone": 0, "owner_id": 0, "reports": 0}
    PUBLIC_MATE = {"_id": 0, "contact_line": 0, "contact_ig": 0, "user_id": 0, "consent": 0}

    async def _my_mate(u) -> Optional[dict]:
        if not u:
            return None
        return await db.dorm_mates.find_one({"user_id": u.id}, {"_id": 0})

    async def _log(type_: str, target_id: str, u=None, extra: dict = None):
        await db.dorm_events.insert_one({
            "type": type_, "target_id": target_id, "user_id": getattr(u, "id", None),
            "at": _iso(_now()), **(extra or {}),
        })

    # ---------- interests ("สนใจ หาเมทห้องนี้")
    # An interest counts only while its listing is open and the person's mate profile is open (their contact
    # is revealed through the mate profile). Nothing about it is private except the user id.
    def _mate_live(m: Optional[dict]) -> bool:
        return bool(m) and m.get("status") == "active" and m.get("expires_at", "") > _iso(_now())

    async def _interest_people(listing_ids: List[str]) -> dict:
        """{listing_id: [{user_id, mate_id, party_size, display_name, created_at}]} of counting interests, oldest first."""
        if not listing_ids:
            return {}
        ints = await db.dorm_interests.find({"listing_id": {"$in": list(listing_ids)}}, {"_id": 0}).sort("created_at", 1).to_list(20000)
        if not ints:
            return {}
        mids = list({i["mate_id"] for i in ints})
        mates = {m["id"]: m for m in await db.dorm_mates.find(
            {"id": {"$in": mids}, **_active_q()},
            {"_id": 0, "id": 1, "display_name": 1, "gender": 1, "mate_gender_pref": 1}).to_list(20000)}
        out = {}
        for i in ints:
            m = mates.get(i["mate_id"])
            if m:
                out.setdefault(i["listing_id"], []).append({
                    **i, "display_name": m.get("display_name", ""), "gender": m.get("gender"),
                    "mate_gender_pref": m.get("mate_gender_pref") or "any"})
        return out

    async def _live_mate(u) -> Optional[dict]:
        m = await _my_mate(u)
        return m if _mate_live(m) else None

    async def _annotate(items: List[dict], u=None) -> List[dict]:
        if not items:
            return items
        lids = [x["id"] for x in items]
        slugs = list({x["building_slug"] for x in items if x.get("building_slug") and x.get("bedrooms") == 0})

        async def _get_peeks():
            return {
                r["_id"]: int(r["n"])
                async for r in db.dorm_peeks.aggregate([
                    {"$match": {"listing_id": {"$in": lids}}},
                    {"$group": {"_id": "$listing_id", "n": {"$sum": 1}}},
                ])
            }

        async def _get_btypes():
            if not slugs:
                return {}
            return {b["slug"]: b.get("type") for b in await db.dorm_buildings.find(
                {"slug": {"$in": slugs}}, {"_id": 0, "slug": 1, "type": 1}).to_list(500)}

        async def _no_mate():
            return None

        people, peeks, btype, me = await asyncio.gather(
            _interest_people(lids),
            _get_peeks(),
            _get_btypes(),
            _live_mate(u) if u else _no_mate(),
        )
        now_s = _iso(_now())
        for x in items:
            x.update(interest_fields(x, people.get(x["id"], []), getattr(u, "id", None), me))
            x["peek_count"] = peeks.get(x["id"], 0)
            x["single_room"] = is_single_room(x, btype.get(x.get("building_slug")))
            x["whole_first"] = whole_first(x)
            gone = is_listing_gone(x, now_s)
            g_reports = int(x.get("gone_reports") or 0)
            x["is_gone"] = gone
            x["gone_label"] = gone_label_of(x) if gone else None
            x["gone_reports"] = g_reports
            x["maybe_gone"] = bool(x.get("external") and not gone and g_reports > 0)
            x["owner_confirm_needed"] = bool(not x.get("external") and not gone and x.get("owner_confirm_needed"))
        return items

    async def _waiting_ids() -> List[str]:
        """Listings with at least one counting interest (the caller filters for open ones)."""
        ints = await db.dorm_interests.find({}, {"_id": 0, "listing_id": 1, "mate_id": 1}).to_list(50000)
        if not ints:
            return []
        live = {m["id"] for m in await db.dorm_mates.find({"id": {"$in": list({i["mate_id"] for i in ints})}, **_active_q()},
                                                          {"_id": 0, "id": 1}).to_list(50000)}
        return list({i["listing_id"] for i in ints if i["mate_id"] in live})

    async def _active_interest_count(uid: str) -> int:
        lids = await db.dorm_interests.distinct("listing_id", {"user_id": uid})
        if not lids:
            return 0
        return await db.dorm_listings.count_documents({"id": {"$in": lids}, **_active_listing_q()})

    # ---------- meta / stats
    class QrVisitIn(BaseModel):
        src: str = Field(..., min_length=1, max_length=48)
        path: str = Field("", max_length=120)

    @dorm_router.post("/visit")
    async def log_qr_visit(body: QrVisitIn):
        src = body.src.strip()
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,48}", src):
            raise HTTPException(422, "src ไม่ถูกต้อง")
        await _ensure()
        await _log("qr_visit", src, extra={"path": (body.path or "")[:120]})
        return {"ok": True}

    @dorm_router.get("/campuses")
    async def list_campuses(request: Request):
        async def _load_campuses():
            cfg = load_campuses()
            return {"default": cfg.get("default_campus") or DEFAULT_CAMPUS, "items": cfg.get("campuses") or []}
        return await _cached_json(("campuses",), 3600, _load_campuses, request)

    @dorm_router.get("/meta")
    async def meta(request: Request, campus: Optional[str] = None):
        ckey = ("meta", campus or DEFAULT_CAMPUS)

        async def _load_meta():
            cfg = load_campuses()
            cobj = campus_info(campus)
            return {
                "zones": cobj.get("zones") or ZONES, "kinds": KINDS, "poster_roles": POSTER_ROLES, "tags": LIFESTYLE_TAGS,
                "amenities": AMENITIES, "genders": GENDERS, "gender_prefs": GENDER_PREFS, "years": YEARS,
                "review_aspects": REVIEW_ASPECTS, "report_reasons": REPORT_REASONS, "expiry_days": EXPIRY_DAYS,
                "expiry_by_kind": EXPIRY_BY_KIND, "reserved_show_days": RESERVED_SHOW_DAYS,
                "ext_ttl_days": EXT_TTL_DAYS, "ext_gone_auto_close": EXT_GONE_AUTO_CLOSE,
                "native_gone_auto_pause": NATIVE_GONE_AUTO_PAUSE, "native_gone_grace_hours": NATIVE_GONE_GRACE_HOURS,
                "archive_visible_days": ARCHIVE_VISIBLE_DAYS,
                "report_reasons_by_type": REPORT_REASONS_BY_TYPE, "report_note_max": REPORT_NOTE_MAX,
                "chat_kinds": CHAT_KIND_LABELS, "room_types": ROOM_TYPES,
                "ext_gone_reason": EXT_GONE_REASON, "max_interests": MAX_ACTIVE_INTERESTS, "share_by_bedrooms": SHARE_BY_BEDROOMS,
                "campus": cobj,
                "campuses": [{"slug": c.get("slug"), "short_th": c.get("short_th"), "name_th": c.get("name_th"),
                              "status": c.get("status"), "base_path": c.get("base_path")} for c in cfg.get("campuses") or []],
            }
        return await _cached_json(ckey, 3600, _load_meta, request)

    def _chat_overview() -> dict:
        return load_chat_posts()["overview"]

    @dorm_router.get("/chat-posts")
    async def chat_posts(request: Request, building: Optional[str] = None, zone: Optional[str] = None, kind: Optional[str] = None,
                         max_price: Optional[int] = None, min_price: Optional[int] = None,
                         limit: int = Query(20, ge=1, le=500), skip: int = Query(0, ge=0)):
        """Old anonymised OpenChat ads, newest first. An archive of prices and demand, not rooms on offer."""
        async def _load_chat():
            chat = load_chat_posts()
            items = filter_chat(chat["posts"], building=building, zone=zone, kind=kind,
                                max_price=max_price, min_price=min_price)
            return {"total": len(items), "items": items[skip:skip + limit], "period": chat["period"]}
        if building is None and zone is None and kind is None and max_price is None and min_price is None and skip == 0:
            return await _cached_json(("chat-posts", limit), 60, _load_chat, request)
        return await _load_chat()

    @dorm_router.get("/stats")
    async def stats(request: Request, campus: Optional[str] = None):
        await _ensure()

        async def _load():
            cf = _campus_q(campus) if campus else {}
            q_m = {**_active_q(), **cf}
            q_l = {**_active_listing_q(), **cf}
            listings, waiting_l, peeking_l, mates, n_buildings, n_reviews = await asyncio.gather(
                db.dorm_listings.find(q_l, {"_id": 0, "id": 1, "kind": 1, "zone": 1, "price_per_person": 1,
                                            "external": 1, "source": 1}).to_list(5000),
                _waiting_ids(),
                db.dorm_peeks.distinct("listing_id"),
                db.dorm_mates.find(q_m, {"_id": 0, "gender": 1, "zones": 1, "budget_max": 1, "has_room": 1}).to_list(5000),
                db.dorm_buildings.count_documents(cf),
                db.dorm_reviews.count_documents({"hidden": {"$ne": True}}),
            )
            waiting = set(waiting_l)
            peeking = set(peeking_l)
            by_source = {}
            by_kind = {}
            for x in listings:
                by_kind[x["kind"]] = by_kind.get(x["kind"], 0) + 1
                if x.get("external"):
                    by_source[x.get("source") or ""] = by_source.get(x.get("source") or "", 0) + 1
            by_zone = {}
            for z in _ids(ZONES):
                n = sum(1 for m in mates if mate_in_zone(m, z))
                if n:
                    by_zone[z] = n
            return {
                "chat": _chat_overview(),
                "live": {
                    "listings": len(listings), "mates": len(mates),
                    "buildings": n_buildings, "reviews": n_reviews,
                    "listings_by_kind": by_kind, "mate_demand_by_zone": by_zone,
                    "external": sum(by_source.values()), "external_by_source": by_source,
                    "waiting": sum(1 for x in listings if x["id"] in waiting),
                    "peeking": sum(1 for x in listings if x["id"] in peeking),
                    "mates_female": sum(1 for m in mates if m.get("gender") == "female"),
                    "mates_male": sum(1 for m in mates if m.get("gender") == "male"),
                    "mates_without_room": sum(1 for m in mates if not m.get("has_room")),
                },
                "insights": load_insights(),
            }

        return await _cached_json(("stats", campus) if campus else ("stats",), 20, _load, request)

    # ---------- listings
    @dorm_router.get("/listings")
    async def list_listings(
        request: Request,
        kind: Optional[str] = None, zone: Optional[str] = None, max_price: Optional[int] = None,
        min_price: Optional[int] = None, gender: Optional[str] = None, building: Optional[str] = None, q: Optional[str] = None,
        amenity: Optional[str] = None, sort: str = "new", limit: int = Query(30, ge=1, le=1000), skip: int = Query(0, ge=0),
        # sort: new (default) | recommended | price | interest | move_in (unknown values fall back to new)
        ids: Optional[str] = None, interested: Optional[int] = None, engaged: Optional[int] = None, external: Optional[int] = None,
        include_closed: Optional[int] = None, campus: Optional[str] = None,
        u=Depends(get_current_user_optional),
    ):
        await _ensure()
        if ids is not None:
            # saved rooms (frontend localStorage): only listings still open, in the order given,
            # same public projection, and no view counting
            want = list(dict.fromkeys(s.strip() for s in ids.split(",") if s.strip()))[:50]
            if not want:
                return {"total": 0, "items": []}
            found = await db.dorm_listings.find({**_active_listing_q(), "id": {"$in": want}}, PUBLIC_LISTING).to_list(50)
            pos = {lid: i for i, lid in enumerate(want)}
            found.sort(key=lambda x: pos.get(x["id"], 0))
            return {"total": len(found), "items": await _annotate(found, u)}
        async def _load_listings():
            base_f = {**_campus_q(campus)} if campus else {}
            if kind:
                base_f["kind"] = kind
            if zone:
                base_f["zone"] = zone
            if building:
                base_f["building_slug"] = building
            if amenity:
                base_f["amenities"] = amenity
            if max_price is not None or min_price is not None:
                base_f["price_per_person"] = {**({"$lte": max_price} if max_price is not None else {}),
                                              **({"$gte": min_price} if min_price is not None else {})}
            if gender in ("female", "male"):
                base_f["gender_pref"] = {"$in": [gender, "any"]}
            if q:
                rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
                base_f["$or"] = [{"title": rx}, {"building_name": rx}, {"description": rx}]
            if engaged:
                w_l, p_l = await asyncio.gather(_waiting_ids(), db.dorm_peeks.distinct("listing_id"))
                base_f["id"] = {"$in": list(set(w_l) | set(p_l))}
            elif interested:
                base_f["id"] = {"$in": await _waiting_ids()}
            if external is not None:
                base_f["external"] = True if external else {"$ne": True}
            now_dt = _now()
            now_s = _iso(now_dt)
            cutoff_s = _iso(now_dt - timedelta(days=ARCHIVE_VISIBLE_DAYS))
            sort_k = sort if sort in SORTS else "new"
            base_docs = await db.dorm_listings.find(base_f, PUBLIC_LISTING).to_list(3000)
            if include_closed:
                all_rows = await _annotate(base_docs, u)
                rows = [x for x in all_rows if not x.get("is_gone") or is_publicly_archivable(x, cutoff_s)]
                total = len(rows)
                ext_total = sum(1 for x in rows if x.get("external")) if external is None else (total if external else 0)
                closed_total = sum(1 for x in rows if x.get("is_gone"))
                archived_total = closed_total
                waiting_total = sum(1 for x in rows if not x.get("is_gone") and (x.get("interest_people") or 0) > 0)
                peeked_total = sum(1 for x in rows if not x.get("is_gone") and (x.get("peek_count") or 0) > 0)
                items = sort_listings(rows, sort_k)[skip:skip + limit]
                return {"total": total, "external_total": ext_total, "waiting_total": waiting_total,
                        "peeked_total": peeked_total, "archived_total": archived_total, "closed_total": closed_total, "items": items}
            active_docs = [d for d in base_docs if not is_listing_gone(d, now_s)]
            archived_total = sum(1 for d in base_docs if is_listing_gone(d, now_s) and is_publicly_archivable(d, cutoff_s))
            total = len(active_docs)
            ext_total = sum(1 for d in active_docs if d.get("external")) if external is None else (total if external else 0)
            rows = await _annotate(active_docs, u)
            waiting_total = sum(1 for x in rows if (x.get("interest_people") or 0) > 0)
            peeked_total = sum(1 for x in rows if (x.get("peek_count") or 0) > 0)
            items = sort_listings(rows, sort_k)[skip:skip + limit]
            return {"total": total, "external_total": ext_total, "waiting_total": waiting_total,
                    "peeked_total": peeked_total, "archived_total": archived_total, "closed_total": 0, "items": items}

        if u is None and q is None:
            ckey = ("listings", kind, zone, building, min_price, max_price, gender, amenity,
                    external, interested, engaged, include_closed, sort, limit, skip)
            if campus:
                ckey = ckey + (campus,)
            return await _cached_json(ckey, 20, _load_listings, request)
        return await _load_listings()

    @dorm_router.get("/listings/{lid}")
    async def get_listing(lid: str, u=Depends(get_current_user_optional)):
        await _ensure()
        # owner_id is needed for is_mine and popped below for non-owners
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0, "contact_line": 0, "contact_phone": 0, "reports": 0})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ")
        mine = bool(u) and (x.get("owner_id") == u.id or _is_admin(u))
        now_s = _iso(_now())
        expired = x.get("expires_at", "") <= now_s
        gone = is_listing_gone(x, now_s)
        building = None
        if x.get("building_slug"):
            building = await db.dorm_buildings.find_one({"slug": x["building_slug"]}, {"_id": 0, "aliases": 0})
            if building:
                building["thumb"] = building_thumb(building.get("photos"))
        if gone and not mine:
            # Soft closed 410 response: keep non-private facts + up to 4 active nearby alternatives so shared links never dead-end
            soft = {k: v for k, v in x.items() if k != "owner_id"}
            soft["is_mine"] = False
            soft["expired"] = expired
            soft["is_gone"] = True
            soft["gone_label"] = gone_label_of(soft)
            alts_raw = await db.dorm_listings.find(
                {**_active_listing_q(), "id": {"$ne": lid},
                 **({"zone": x["zone"]} if x.get("zone") else {})},
                PUBLIC_LISTING,
            ).to_list(300)
            my_per = int(x.get("price_per_person") or x.get("price_total") or 0)
            alts_raw.sort(key=lambda y: (
                0 if x.get("building_slug") and y.get("building_slug") == x.get("building_slug") else 1,
                abs(int(y.get("price_per_person") or y.get("price_total") or 0) - my_per),
                y.get("id") or "",
            ))
            alts = await _annotate(alts_raw[:4], u)
            return JSONResponse(status_code=410, content={
                "detail": "ประกาศนี้ปิดหรือหมดอายุแล้ว",
                "gone": True,
                "listing": soft,
                "building": building,
                "alternatives": alts,
            })
        if not mine:  # owners refreshing their own post shouldn't inflate the count
            await db.dorm_listings.update_one({"id": lid}, {"$inc": {"views": 1}})
        # an admin may open a closed external room, but owner tools never apply to it
        x["is_mine"] = mine and not x.get("external")
        x["expired"] = expired
        await _annotate([x], u)
        # a viewer whose gender the listing excludes sees why instead of an interest button (the API refuses too)
        x["interest_blocked"] = listing_refuses(x, await _my_mate(u)) if u and not x["is_mine"] else None
        x.pop("owner_id", None)
        return {"listing": x, "building": building}

    async def _first_lead(type_: str, target_id: str, u) -> bool:
        """A lead counts once per (viewer, target): True only the first time this user reveals this contact."""
        return not await db.dorm_events.find_one({"type": type_, "target_id": target_id, "user_id": u.id}, {"_id": 1})

    @dorm_router.get("/listings/{lid}/contact")
    async def listing_contact(lid: str, u=Depends(get_current_user)):
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ")
        own = x.get("owner_id") == u.id
        if is_listing_gone(x, _iso(_now())) and not own:
            raise HTTPException(410, "ประกาศนี้ปิดหรือหมดอายุแล้ว")
        if x.get("external"):
            # facts gathered from a public site: we hold no contact, the source page does
            raise HTTPException(409, "ห้องนี้มาจากประกาศบนเว็บภายนอก ติดต่อผู้ลงที่เว็บต้นทาง")
        if not own and await _first_lead("contact_listing", lid, u):
            await db.dorm_listings.update_one({"id": lid}, {"$inc": {"contact_reveals": 1}})
            await _log("contact_listing", lid, u)
        return {"contact_line": x.get("contact_line", ""), "contact_phone": x.get("contact_phone", "")}

    @dorm_router.post("/listings")
    async def create_listing(body: ListingIn, u=Depends(get_current_user)):
        await _ensure()
        if not (body.contact_line or body.contact_phone):
            raise HTTPException(422, "ใส่ LINE ID หรือเบอร์โทรอย่างน้อยหนึ่งช่อง")
        _check_listing(body, creating=True)
        await _check_cap(u)
        doc = body.model_dump()
        await _resolve_building(doc)
        doc["price_per_person"] = per_person_of(doc["price_total"], doc["people_total"])
        now = _now()
        exp_days = expiry_days_for(doc["kind"], False)
        doc.update({
            "id": uuid.uuid4().hex[:12], "owner_id": u.id, "status": "active", "featured": False,
            "poster_swu_verified": await _swu_verified_async(u),
            "views": 0, "contact_reveals": 0, "reports": 0, "gone_reports": 0,
            "created_at": _iso(now), "renewed_at": _iso(now), "expires_at": _iso(now + timedelta(days=exp_days)),
        })
        await db.dorm_listings.insert_one(dict(doc))
        doc.pop("_id", None)
        _bust_cache()
        return doc

    def _check_listing(body: ListingIn, creating: bool):
        """Rules the field types can't say: a new listing can't move in before today (Bangkok), and a short stay
        is 1 to 6 months."""
        if creating and real_date(body.move_in) < today_bkk():
            raise HTTPException(422, "วันที่เข้าอยู่ต้องไม่ก่อนวันนี้")
        if body.kind == "short_term" and body.min_months and body.min_months > 6:
            raise HTTPException(422, "ห้องระยะสั้นอยู่ขั้นต่ำได้ไม่เกิน 6 เดือน")

    async def _check_cap(u, except_id: Optional[str] = None):
        """At most MAX_ACTIVE_LISTINGS open listings per person (admins exempt), on create and on reopen."""
        if _is_admin(u):
            return
        q = {"owner_id": u.id, **_active_listing_q()}
        if except_id:
            q["id"] = {"$ne": except_id}
        if await db.dorm_listings.count_documents(q) >= MAX_ACTIVE_LISTINGS:
            raise HTTPException(429, f"มีประกาศที่เปิดอยู่ครบ {MAX_ACTIVE_LISTINGS} รายการแล้ว ปิดอันเก่าก่อนนะ")

    async def _resolve_building(doc: dict):
        slug = doc.get("building_slug")
        if slug:
            b = await db.dorm_buildings.find_one({"slug": slug}, {"_id": 0, "name": 1, "zone": 1})
            if not b:
                doc["building_slug"] = None
            else:
                doc["building_name"] = doc.get("building_name") or b["name"]
                return
        # free-text building → try the alias table so it still links to a guide page
        name = (doc.get("building_name") or "").lower()
        if name:
            async for b in db.dorm_buildings.find({}, {"_id": 0, "slug": 1, "name": 1, "aliases": 1}):
                keys = [b["name"].lower()] + [a.lower() for a in b.get("aliases") or []]
                if any(k and k in name for k in keys):
                    doc["building_slug"] = b["slug"]
                    break

    async def _owned_listing(lid: str, u) -> dict:
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ")
        if x.get("owner_id") != u.id and not _is_admin(u):
            raise HTTPException(403, "ไม่ใช่ประกาศของคุณ")
        return x

    def _no_external(x: dict):
        if x.get("external"):
            raise HTTPException(409, "ประกาศจากเว็บภายนอกแก้ไขหรือต่ออายุไม่ได้ ข้อมูลมาจากเว็บต้นทาง")

    @dorm_router.put("/listings/{lid}")
    async def update_listing(lid: str, body: ListingIn, u=Depends(get_current_user)):
        _no_external(await _owned_listing(lid, u))
        _check_listing(body, creating=False)
        doc = body.model_dump()
        await _resolve_building(doc)
        doc["price_per_person"] = per_person_of(doc["price_total"], doc["people_total"])
        await db.dorm_listings.update_one({"id": lid}, {"$set": doc})
        _bust_cache()
        return await db.dorm_listings.find_one({"id": lid}, {"_id": 0})

    @dorm_router.post("/listings/{lid}/renew")
    async def renew_listing(lid: str, u=Depends(get_current_user)):
        x = await _owned_listing(lid, u)
        _no_external(x)
        if x.get("status") == "closed":
            raise HTTPException(409, "ประกาศปิดไปแล้ว")
        if is_listing_gone(x, _iso(_now())):
            # an expired listing coming back counts against the cap like a new one
            await _check_cap(u, except_id=lid)
        now = _now()
        exp = _iso(now + timedelta(days=expiry_days_for(x.get("kind"), False)))
        await db.dorm_gone_signals.delete_many({"listing_id": lid})
        await db.dorm_reports.update_many(
            {"target_type": "listing", "target_id": lid, "reason": {"$in": list(GONE_REASONS)}, "resolved": False},
            {"$set": {"resolved": True, "resolved_at": _iso(now)}},
        )
        await db.dorm_listings.update_one({"id": lid}, {"$set": {
            "renewed_at": _iso(now), "expires_at": exp,
            "gone_reports": 0, "owner_confirm_needed": False, "gone_check_since": None,
        }})
        _bust_cache()
        return {"ok": True, "expires_at": exp}

    @dorm_router.post("/listings/{lid}/status")
    async def listing_status(lid: str, body: StatusIn, u=Depends(get_current_user)):
        x = await _owned_listing(lid, u)
        ch = {"status": body.status}
        was_closed = x.get("status") == "closed"
        by_admin = _is_admin(u) and x.get("owner_id") != u.id
        now = _now()
        now_s = _iso(now)
        if body.status == "closed":
            ch["reserved_until"] = None
            ch["owner_confirm_needed"] = False
            if not was_closed:
                # who closed it decides who may reopen it: an admin's close is moderation, the owner can't undo it
                ch.update({"closed_by": "admin" if by_admin else "owner", "closed_at": now_s})
            # Auto-resolve stale availability ("gone") reports while keeping fraud/spam reports intact
            await _auto_resolve_reports("listing", lid, "system_listing_closed", list(GONE_REASONS))
        elif body.status == "reserved":
            if was_closed:
                if (x.get("closed_by") == "admin" or x.get("closed_reason") == "auto_moderated") and not _is_admin(u):
                    raise HTTPException(403, AUTO_MOD_CLOSED_MSG if x.get("closed_reason") == "auto_moderated" else ADMIN_CLOSED_MSG)
                if not x.get("external") and not by_admin:
                    await _check_cap(u, except_id=lid)
                ch.update({"closed_by": None, "closed_at": None})
            ch["reserved_until"] = _iso(now + timedelta(days=RESERVED_SHOW_DAYS))
            ch["owner_confirm_needed"] = False
        else:
            # body.status == "active"
            if was_closed:
                if (x.get("closed_by") == "admin" or x.get("closed_reason") == "auto_moderated") and not _is_admin(u):
                    raise HTTPException(403, AUTO_MOD_CLOSED_MSG if x.get("closed_reason") == "auto_moderated" else ADMIN_CLOSED_MSG)
                if not x.get("external") and not by_admin:
                    await _check_cap(u, except_id=lid)
            ch.update({
                "closed_by": None, "closed_at": None, "reserved_until": None,
                "gone_reports": 0, "maybe_gone": False, "owner_confirm_needed": False, "gone_check_since": None,
            })
            if x.get("external") and x.get("expires_at", "") <= now_s:
                ch["expires_at"] = _iso(now + timedelta(days=EXT_TTL_DAYS))
            await db.dorm_gone_signals.delete_many({"listing_id": lid})
            await db.dorm_reports.update_many(
                {"target_type": "listing", "target_id": lid, "reason": {"$in": list(GONE_REASONS)}, "resolved": False},
                {"$set": {"resolved": True, "resolved_at": now_s}},
            )
        if x.get("external"):
            # an admin closing an external room (e.g. confirmed gone) is final: re-imports skip it
            ch["closed_reason"] = "admin" if body.status == "closed" else None
        elif body.status == "active":
            ch["closed_reason"] = None
        await db.dorm_listings.update_one({"id": lid}, {"$set": ch})
        _bust_cache()
        return {"ok": True, "status": body.status, **({"reserved_until": ch["reserved_until"]} if body.status == "reserved" else {})}

    async def _record_gone_signal(x: dict, actor_key: str, u=None, anon_id: Optional[str] = None,
                                   note: str = "", log_report: bool = True) -> dict:
        """Dual-track gone handler:
          * External: 1 report -> maybe_gone orange badge; >=2 distinct reports -> auto-closed.
          * Native: 1-2 reports -> keep visible + flag owner_confirm_needed (48h grace); >=3 -> auto-pause."""
        lid = x["id"]
        now_s = _iso(_now())
        dup = False
        try:
            await db.dorm_gone_signals.insert_one({
                "listing_id": lid, "actor_key": actor_key, "user_id": getattr(u, "id", None),
                "anon_id": anon_id, "created_at": now_s,
            })
        except Exception as e:
            if getattr(e, "code", None) != 11000:
                raise
            dup = True
        n = await db.dorm_gone_signals.count_documents({"listing_id": lid})
        ext = bool(x.get("external"))
        if dup:
            return {
                "ok": True, "duplicate": True, "status": x.get("status"),
                "gone_reports": n,
                "auto_closed": bool(ext and x.get("status") == "closed"),
                "auto_paused": bool((not ext) and x.get("status") == "closed"),
                "maybe_gone": bool(ext and x.get("status") != "closed" and n > 0),
                "needs_owner_confirm": bool((not ext) and x.get("status") != "closed" and x.get("owner_confirm_needed")),
            }
        if log_report:
            reason = EXT_GONE_REASON if ext else NATIVE_GONE_REASON
            rep_user = getattr(u, "id", None) or actor_key
            has_rep = await db.dorm_reports.find_one({"target_id": lid, "user_id": rep_user, "resolved": False}, {"_id": 1})
            if not has_rep:
                await db.dorm_reports.insert_one({
                    "id": uuid.uuid4().hex[:12], "target_type": "listing", "target_id": lid,
                    "reason": reason, "note": note or "", "user_id": rep_user, "resolved": False, "created_at": now_s,
                })
                await db.dorm_listings.update_one({"id": lid}, {"$inc": {"reports": 1}})
        if ext:
            if n >= EXT_GONE_AUTO_CLOSE:
                await db.dorm_listings.update_one(
                    {"id": lid},
                    {"$set": {
                        "status": "closed", "closed_reason": "gone", "closed_by": "crowd",
                        "closed_at": now_s, "gone_reports": n, "maybe_gone": False, "reserved_until": None,
                    }},
                )
                await _auto_resolve_reports("listing", lid, "system_crowd_gone", list(GONE_REASONS))
                _bust_cache()
                return {"ok": True, "status": "closed", "auto_closed": True, "gone_reports": n, "maybe_gone": False}
            await db.dorm_listings.update_one(
                {"id": lid},
                {"$set": {"gone_reports": n, "maybe_gone": True, "gone_flagged_at": now_s}},
            )
            _bust_cache()
            return {"ok": True, "status": x.get("status"), "auto_closed": False, "gone_reports": n, "maybe_gone": True}
        ch = {
            "gone_reports": n, "owner_confirm_needed": True,
            "gone_check_since": x.get("gone_check_since") or now_s,
        }
        if n >= NATIVE_GONE_AUTO_PAUSE:
            ch.update({
                "status": "closed", "closed_by": "system", "closed_reason": "paused_unconfirmed",
                "closed_at": now_s, "reserved_until": None,
            })
            await db.dorm_listings.update_one({"id": lid}, {"$set": ch})
            await _auto_resolve_reports("listing", lid, "system_crowd_gone", list(GONE_REASONS))
            _bust_cache()
            return {"ok": True, "status": "closed", "auto_paused": True, "needs_owner_confirm": False, "gone_reports": n}
        await db.dorm_listings.update_one({"id": lid}, {"$set": ch})
        _bust_cache()
        return {"ok": True, "status": x.get("status"), "auto_paused": False, "needs_owner_confirm": True, "gone_reports": n}

    @dorm_router.post("/listings/{lid}/gone")
    async def report_listing_gone(lid: str, body: GoneSignalIn = GoneSignalIn(), u=Depends(get_current_user_optional)):
        await _ensure()
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ")
        if is_listing_gone(x, _iso(_now())):
            return {"ok": True, "already_closed": True, "status": "closed", "gone_reports": int(x.get("gone_reports") or 0)}
        if x.get("external"):
            if u:
                actor_key = f"u:{u.id}"
            elif body.anon_id:
                actor_key = f"a:{body.anon_id}"
            else:
                raise HTTPException(422, "ต้องระบุตัวตนผู้แจ้ง")
            return await _record_gone_signal(x, actor_key, u=u, anon_id=body.anon_id, note=body.note, log_report=True)
        if not u:
            raise HTTPException(401, "เข้าสู่ระบบเพื่อแจ้งประกาศนี้")
        if x.get("owner_id") == u.id:
            raise HTTPException(400, "ประกาศของคุณเอง กดปิดได้ในหน้าของฉัน")
        return await _record_gone_signal(x, f"u:{u.id}", u=u, note=body.note, log_report=True)

    @dorm_router.post("/listings/{lid}/confirm-available")
    async def confirm_listing_available(lid: str, u=Depends(get_current_user)):
        """Owner confirms their flagged/paused/reserved native listing is still open: clears flags & extends TTL."""
        x = await _owned_listing(lid, u)
        _no_external(x)
        now = _now()
        now_s = _iso(now)
        if x.get("status") == "closed" and (x.get("closed_by") == "admin" or x.get("closed_reason") == "auto_moderated") and not _is_admin(u):
            raise HTTPException(403, AUTO_MOD_CLOSED_MSG if x.get("closed_reason") == "auto_moderated" else ADMIN_CLOSED_MSG)
        if is_listing_gone(x, now_s) and not _is_admin(u):
            await _check_cap(u, except_id=lid)
        exp = _iso(now + timedelta(days=expiry_days_for(x.get("kind"), False)))
        await db.dorm_gone_signals.delete_many({"listing_id": lid})
        await db.dorm_reports.update_many(
            {"target_type": "listing", "target_id": lid, "reason": {"$in": list(GONE_REASONS)}, "resolved": False},
            {"$set": {"resolved": True, "resolved_at": now_s}},
        )
        await db.dorm_listings.update_one(
            {"id": lid},
            {"$set": {
                "status": "active", "closed_by": None, "closed_reason": None, "closed_at": None,
                "reserved_until": None, "gone_reports": 0, "maybe_gone": False,
                "owner_confirm_needed": False, "gone_check_since": None,
                "renewed_at": now_s, "expires_at": exp, "owner_confirmed_at": now_s,
            }},
        )
        _bust_cache()
        return {"ok": True, "status": "active", "expires_at": exp}

    @dorm_router.delete("/listings/{lid}")
    async def delete_listing(lid: str, u=Depends(get_current_user)):
        """Owner (or admin) deletes a listing for good, with its own uploaded photos and its event log."""
        x = await _owned_listing(lid, u)
        await db.dorm_interests.delete_many({"listing_id": lid})
        await db.dorm_gone_signals.delete_many({"listing_id": lid})
        await _auto_resolve_reports("listing", lid, "system_target_deleted")
        if x.get("external"):
            # kept as a closed tombstone so the next import doesn't bring it back
            await db.dorm_listings.update_one({"id": lid}, {"$set": {"status": "closed", "closed_reason": "deleted"}})
            _bust_cache()
            return {"ok": True}
        pids = [m.group(1) for p in x.get("photo_links") or []
                if (m := re.fullmatch(r"/api/dorm/photos/([a-f0-9]{16})", p or ""))]
        if pids:
            await db.dorm_photos.delete_many({"id": {"$in": pids}, "owner_id": x.get("owner_id")})
        await db.dorm_events.delete_many({"target_id": lid})
        await db.dorm_listings.delete_one({"id": lid})
        _bust_cache()
        return {"ok": True}

    # ---------- mates
    @dorm_router.get("/mates")
    async def list_mates(
        request: Request,
        gender: Optional[str] = None, zone: Optional[str] = None, budget: Optional[int] = None,
        move_in: Optional[str] = None, has_room: Optional[bool] = None, tag: Optional[str] = None,
        year: Optional[str] = None, sort: str = "match", limit: int = Query(60, ge=1, le=200), skip: int = Query(0, ge=0),
        campus: Optional[str] = None,
        u=Depends(get_current_user_optional),
    ):
        await _ensure()

        async def _load_mates():
            f = {**_active_q(), **(_campus_q(campus) if campus else {})}
            if gender in ("female", "male", "other"):
                f["gender"] = gender
            if zone:
                f["$or"] = mate_zone_q(zone)
            if budget:
                f["budget_min"] = {"$lte": budget}
            if move_in and _MONTH.match(move_in):
                f["move_in"] = move_in
            if has_room is not None:
                f["has_room"] = has_room
            if tag:
                f["tags"] = tag
            if year:
                f["year"] = year
            me = await _my_mate(u) if u else None
            items = await db.dorm_mates.find(f, PUBLIC_MATE).sort([("renewed_at", -1), ("id", 1)]).to_list(1000)
            for m in items:
                m["match"] = match_score(me, m)
                m["is_me"] = bool(me) and me["id"] == m["id"]
            hidden = {"total": 0, "theirs": 0, "mine": 0}
            if me and sort == "match":
                def _acc(a, b):
                    p = a.get("mate_gender_pref", "any")
                    return p == "any" or p == b.get("gender")
                kept = []
                for m in items:
                    if m["is_me"] or (m["match"] and m["match"]["score"] > 0):
                        kept.append(m)
                        continue
                    hidden["total"] += 1
                    if not _acc(m, me):
                        hidden["theirs"] += 1
                    if not _acc(me, m):
                        hidden["mine"] += 1
                items = kept
                items.sort(key=lambda m: (not m["is_me"], -(m["match"] or {}).get("score", 0)))
            page = items[skip:skip + limit]
            live_me = me if _mate_live(me) else None
            await _attach_rooms([m for m in page if live_me and (m["is_me"] or gate_ok(live_me, m))])
            for m in page:
                m.setdefault("interested_rooms", [])
                m.setdefault("interested_rooms_total", 0)
            return {"total": len(items), "items": page, "me": bool(me), "hidden_by_gender": hidden}

        if u is None:
            ckey = ("mates", gender, zone, budget, move_in, has_room, tag, year, sort, limit, skip)
            if campus:
                ckey = ckey + (campus,)
            return await _cached_json(ckey, 20, _load_mates, request)
        return await _load_mates()

    async def _attach_rooms(mates: List[dict]):
        """Each mate's open rooms they pressed interest on (newest first, max 2 shown, plus the total)."""
        if not mates:
            return
        ints = await db.dorm_interests.find({"mate_id": {"$in": [m["id"] for m in mates]}}, {"_id": 0, "mate_id": 1, "listing_id": 1}) \
            .sort("created_at", -1).to_list(5000)
        rooms = {x["id"]: x for x in await db.dorm_listings.find(
            {"id": {"$in": list({i["listing_id"] for i in ints})}, **_active_listing_q()},
            {"_id": 0, "id": 1, "title": 1, "building_name": 1, "external": 1, "bedrooms": 1}).to_list(5000)}
        for m in mates:
            mine = [rooms[i["listing_id"]] for i in ints if i["mate_id"] == m["id"] and i["listing_id"] in rooms]
            m["interested_rooms"] = [{"id": r["id"], "title": short_room_title(r)} for r in mine[:2]]
            m["interested_rooms_total"] = len(mine)

    @dorm_router.get("/mates/me")
    async def my_mate(u=Depends(get_current_user)):
        return {"profile": await _my_mate(u)}

    @dorm_router.put("/mates/me")
    async def upsert_mate(body: MateIn, u=Depends(get_current_user)):
        await _ensure()
        if not body.consent:
            raise HTTPException(422, "ต้องยินยอมให้แสดงโปรไฟล์ก่อน")
        if not (body.contact_line or body.contact_ig):
            raise HTTPException(422, "ใส่ LINE ID หรือ IG อย่างน้อยหนึ่งช่อง")
        if body.budget_max < body.budget_min:
            raise HTTPException(422, "งบสูงสุดต้องไม่น้อยกว่างบต่ำสุด")
        now = _now()
        doc = body.model_dump()
        doc.update({"user_id": u.id, "status": "active", "renewed_at": _iso(now), "swu_verified": await _swu_verified_async(u),
                    "expires_at": _iso(now + timedelta(days=EXPIRY_DAYS)), "consented_at": _iso(now)})
        existing = await _my_mate(u)
        if existing:
            await db.dorm_mates.update_one({"user_id": u.id}, {"$set": doc})
        else:
            doc.update({"id": uuid.uuid4().hex[:12], "created_at": _iso(now), "contact_reveals": 0})
            await db.dorm_mates.insert_one(dict(doc))
        _bust_cache()
        return {"profile": await _my_mate(u)}

    @dorm_router.post("/mates/me/renew")
    async def renew_mate(u=Depends(get_current_user)):
        if not await _my_mate(u):
            raise HTTPException(404, "ยังไม่มีโปรไฟล์")
        now = _now()
        await db.dorm_mates.update_one({"user_id": u.id}, {"$set": {
            "status": "active", "renewed_at": _iso(now), "expires_at": _iso(now + timedelta(days=EXPIRY_DAYS))}})
        _bust_cache()
        return {"ok": True}

    @dorm_router.post("/mates/me/close")
    async def close_mate(u=Depends(get_current_user)):
        m = await _my_mate(u)
        await db.dorm_mates.update_one({"user_id": u.id}, {"$set": {"status": "closed", "closed_at": _iso(_now())}})
        if m:
            await _auto_resolve_reports("mate", m["id"], "system_mate_closed")
        _bust_cache()
        return {"ok": True}

    @dorm_router.delete("/mates/me")
    async def delete_mate(u=Depends(get_current_user)):
        m = await _my_mate(u)
        if m:
            await _auto_resolve_reports("mate", m["id"], "system_target_deleted")
        await db.dorm_mates.delete_one({"user_id": u.id})
        await db.dorm_interests.delete_many({"user_id": u.id})
        _bust_cache()
        return {"ok": True}

    @dorm_router.get("/mates/{mid}/contact")
    async def mate_contact(mid: str, u=Depends(get_current_user)):
        m = await db.dorm_mates.find_one({"id": mid, **_active_q()}, {"_id": 0})
        if not m:
            raise HTTPException(404, "ไม่พบโปรไฟล์ หรือปิดไปแล้ว")
        if m.get("user_id") != u.id and await _first_lead("contact_mate", mid, u):
            await db.dorm_mates.update_one({"id": mid}, {"$inc": {"contact_reveals": 1}})
            await _log("contact_mate", mid, u)
        return {"contact_line": m.get("contact_line", ""), "contact_ig": m.get("contact_ig", "")}

    # ---------- my stuff
    @dorm_router.get("/my")
    async def my_stuff(u=Depends(get_current_user)):
        listings = await db.dorm_listings.find({"owner_id": u.id}, {"_id": 0}).sort("created_at", -1).to_list(100)
        now = _iso(_now())
        for x in listings:
            x["expired"] = x.get("expires_at", "") <= now or is_reserved_expired(x, now)
        await _annotate(listings, u)
        return {"profile": await _my_mate(u), "listings": listings, "interests": await _my_interests(u),
                "verification": await _verification_info(u)}

    # ---------- SWU verification (personal email + SWU email OTP / Google link / freshman & alumni request)
    @dorm_router.post("/verify/swu-email/request")
    async def verify_swu_email_request(body: VerifyOtpRequestIn, u=Depends(get_current_user)):
        await _ensure()
        if await _swu_verified_async(u):
            return {"ok": True, "already_verified": True}
        taken = await db.dorm_verifications.find_one({"swu_email": body.swu_email, "status": "verified", "user_id": {"$ne": u.id}})
        if taken:
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันกับบัญชีอื่นไปแล้ว")
        if not _smtp_enabled():
            raise HTTPException(503, "ระบบส่งรหัส OTP ทางอีเมลยังไม่ได้ตั้งค่า กรุณาส่งคำขอยืนยันให้แอดมินตรวจแทน")
        code = f"{secrets.randbelow(1000000):06d}"
        now = _now()
        otp_hash = hashlib.sha256(f"{u.id}:{body.swu_email}:{code}".encode()).hexdigest()
        try:
            _send_otp_email(body.swu_email, code)
        except Exception:
            raise HTTPException(502, "ส่งอีเมลไม่สำเร็จ ลองใหม่ภายหลังหรือส่งคำขอให้แอดมินตรวจแทน")
        await db.dorm_verifications.update_one(
            {"user_id": u.id},
            {"$set": {
                "user_id": u.id, "status": "otp_sent", "method": "swu_email_otp", "kind": "student",
                "status_label": VERIFY_LABELS["student"], "swu_email": body.swu_email,
                "otp_hash": otp_hash, "otp_expires_at": _iso(now + timedelta(minutes=15)), "otp_tries": 0,
                "updated_at": _iso(now),
            }, "$setOnInsert": {"created_at": _iso(now)}},
            upsert=True,
        )
        return {"ok": True, "swu_email": body.swu_email, "expires_minutes": 15}

    @dorm_router.post("/verify/swu-email/confirm")
    async def verify_swu_email_confirm(body: VerifyOtpConfirmIn, u=Depends(get_current_user)):
        await _ensure()
        doc = await db.dorm_verifications.find_one({"user_id": u.id})
        if not doc or doc.get("status") != "otp_sent" or not doc.get("otp_hash"):
            raise HTTPException(400, "ยังไม่ได้ขอรหัสยืนยัน กรุณากดขอรหัสใหม่")
        if (doc.get("otp_expires_at") or "") <= _iso(_now()):
            raise HTTPException(400, "รหัสยืนยันหมดอายุแล้ว กรุณากดขอรหัสใหม่")
        if (doc.get("otp_tries") or 0) >= 5:
            raise HTTPException(429, "กรอกรหัสผิดเกินกำหนด กรุณากดขอรหัสใหม่")
        expected = hashlib.sha256(f"{u.id}:{doc['swu_email']}:{body.code}".encode()).hexdigest()
        if not secrets.compare_digest(expected, doc["otp_hash"]):
            await db.dorm_verifications.update_one({"user_id": u.id}, {"$inc": {"otp_tries": 1}})
            raise HTTPException(400, "รหัสยืนยันไม่ถูกต้อง")
        taken = await db.dorm_verifications.find_one({"swu_email": doc["swu_email"], "status": "verified", "user_id": {"$ne": u.id}})
        if taken:
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันกับบัญชีอื่นไปแล้ว")
        now = _iso(_now())
        await db.dorm_verifications.update_one(
            {"user_id": u.id},
            {"$set": {"status": "verified", "verified_at": now, "updated_at": now},
             "$unset": {"otp_hash": "", "otp_expires_at": "", "otp_tries": ""}},
        )
        await _backfill_verified(u.id)
        await _dismiss_verification_proposals(u.id, "self_verified_otp")
        _bust_cache()
        return {"ok": True, "verification": await _verification_info(u)}

    @dorm_router.post("/verify/google-link")
    async def verify_google_link(body: VerifyGoogleLinkIn, u=Depends(get_current_user)):
        """Verify ownership of an @g.swu.ac.th / @swu.ac.th Google account and link the badge to this personal account."""
        await _ensure()
        if await _swu_verified_async(u):
            return {"ok": True, "verification": await _verification_info(u)}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": body.credential})
            if res.status_code != 200:
                raise HTTPException(400, "ยืนยันบัญชี Google ไม่สำเร็จ ลองอีกครั้ง")
            info = res.json()
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(502, "เชื่อมต่อ Google ไม่สำเร็จ ลองอีกครั้ง")
        expected_aud = _google_client_id()
        if not expected_aud or info.get("aud") != expected_aud:
            raise HTTPException(400, "โทเค็น Google ไม่ตรงกับระบบ")
        email = (info.get("email") or "").strip().lower()
        if str(info.get("email_verified", "")).lower() != "true" or not SWU_EMAIL_RE.match(email):
            raise HTTPException(400, "กรุณาเลือกบัญชี Google ที่เป็นอีเมล มศว (@g.swu.ac.th หรือ @swu.ac.th)")
        taken = await db.dorm_verifications.find_one({"swu_email": email, "status": "verified", "user_id": {"$ne": u.id}})
        if taken:
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันกับบัญชีอื่นไปแล้ว")
        pg = await db.dorm_verify_pregrants.find_one({"swu_email": email, "claimed_by": {"$nin": [None, u.id]}}, {"_id": 1})
        if pg:
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันให้อีเมลส่วนตัวอื่นไปแล้ว")
        now = _iso(_now())
        await db.dorm_verifications.update_one(
            {"user_id": u.id},
            {"$set": {
                "user_id": u.id, "status": "verified", "method": "google_swu_link", "kind": "student",
                "status_label": VERIFY_LABELS["student"], "swu_email": email,
                "verified_at": now, "updated_at": now, "reject_reason": "",
            }, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        await db.dorm_verify_pregrants.delete_one({"swu_email": email, "claimed_by": None})
        await _backfill_verified(u.id)
        await _dismiss_verification_proposals(u.id, "self_verified_google")
        _bust_cache()
        return {"ok": True, "verification": await _verification_info(u)}

    @dorm_router.post("/verify/vouch-personal-email")
    async def verify_vouch_personal_email(body: VerifyVouchPersonalIn, u=Depends(get_current_user)):
        """An @g.swu.ac.th Google user confirms 1 personal email (now or before signup) with zero admin effort."""
        await _ensure()
        if not _swu_verified(u):
            raise HTTPException(403, "เฉพาะบัญชีที่เข้าสู่ระบบ Google ด้วยอีเมล มศว (@g.swu.ac.th / @swu.ac.th) เท่านั้น")
        swu_email = (u.email or "").strip().lower()
        target_email = body.personal_email
        now_s = _iso(_now())

        # Enforce 1 SWU account -> at most 1 verified personal email
        existing_link = await db.dorm_verifications.find_one({"swu_email": swu_email, "status": "verified"}, {"_id": 0})
        if existing_link:
            owner_usr = await db.users.find_one({"id": existing_link["user_id"]}, {"_id": 0, "id": 1, "email": 1})
            owner_em = (owner_usr or {}).get("email", "").strip().lower()
            if owner_em == target_email:
                return {"ok": True, "applied": True, "already": True, "personal_email": target_email,
                        "verification": await _verification_info(u)}
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันให้อีเมลส่วนตัวอื่นไปแล้ว (1 อีเมล มศว ยืนยันได้ 1 บัญชี)")

        existing_pg = await db.dorm_verify_pregrants.find_one({"swu_email": swu_email}, {"_id": 0})
        if existing_pg and existing_pg.get("claimed_by"):
            if (existing_pg.get("personal_email") or "").strip().lower() == target_email:
                return {"ok": True, "applied": True, "already": True, "personal_email": target_email,
                        "verification": await _verification_info(u)}
            raise HTTPException(409, "อีเมล มศว นี้ถูกใช้ยืนยันให้อีเมลส่วนตัวอื่นไปแล้ว (1 อีเมล มศว ยืนยันได้ 1 บัญชี)")

        target = await db.users.find_one(
            {"email": {"$regex": f"^{re.escape(target_email)}$", "$options": "i"}}, {"_id": 0, "id": 1, "email": 1}
        )
        if target:
            await db.dorm_verifications.update_one(
                {"user_id": target["id"]},
                {"$set": {
                    "user_id": target["id"], "status": "verified", "method": "swu_account_vouch", "kind": "student",
                    "status_label": VERIFY_LABELS["student"], "swu_email": swu_email,
                    "vouched_by": u.id, "verified_at": now_s, "updated_at": now_s, "reject_reason": "",
                }, "$setOnInsert": {"created_at": now_s}},
                upsert=True,
            )
            await db.dorm_verify_pregrants.update_one(
                {"swu_email": swu_email},
                {"$set": {
                    "swu_email": swu_email, "personal_email": target_email, "vouched_by": u.id,
                    "claimed_by": target["id"], "claimed_at": now_s, "updated_at": now_s,
                }, "$setOnInsert": {"created_at": now_s}},
                upsert=True,
            )
            await _backfill_verified(target["id"])
            await _dismiss_verification_proposals(target["id"], "self_verified_vouch")
            _bust_cache()
            return {"ok": True, "applied": True, "personal_email": target_email, "verification": await _verification_info(u)}

        await db.dorm_verify_pregrants.update_one(
            {"swu_email": swu_email},
            {"$set": {
                "swu_email": swu_email, "personal_email": target_email, "vouched_by": u.id,
                "claimed_by": None, "claimed_at": None, "updated_at": now_s,
            }, "$setOnInsert": {"created_at": now_s}},
            upsert=True,
        )
        return {"ok": True, "applied": False, "pending_signup": True, "personal_email": target_email,
                "verification": await _verification_info(u)}

    @dorm_router.get("/verify/me")
    async def verify_me(u=Depends(get_current_user)):
        await _ensure()
        return {"verification": await _verification_info(u)}

    @dorm_router.post("/verify/request")
    async def verify_manual_request(body: VerifyManualRequestIn, u=Depends(get_current_user)):
        """Manual SWU verification request for freshmen without SWU email yet, or alumni whose SWU email expired."""
        await _ensure()
        if await _swu_verified_async(u):
            return {"ok": True, "verification": await _verification_info(u)}
        swu_em = body.swu_email.lower()
        if swu_em and not SWU_EMAIL_RE.match(swu_em):
            raise HTTPException(422, "อีเมล มศว ต้องลงท้ายด้วย @g.swu.ac.th หรือ @swu.ac.th")
        now = _iso(_now())
        await db.dorm_verifications.update_one(
            {"user_id": u.id},
            {"$set": {
                "user_id": u.id, "status": "pending", "method": f"manual_{body.kind}",
                "kind": body.kind, "status_label": VERIFY_LABELS[body.kind],
                "faculty": body.faculty, "entry_year": body.entry_year,
                "swu_email": swu_em, "note": body.note, "reject_reason": "",
                "updated_at": now,
            }, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        return {"ok": True, "verification": await _verification_info(u)}

    # ---------- in-app 1-on-1 chat (keeps conversations inside /dorm, explicit 1-tap LINE share)
    async def _my_line_id(uid: str) -> str:
        m = await db.dorm_mates.find_one({"user_id": uid}, {"_id": 0, "contact_line": 1})
        if m and (m.get("contact_line") or "").strip():
            return m["contact_line"].strip()
        l = await db.dorm_listings.find_one({"owner_id": uid, "contact_line": {"$ne": ""}}, {"_id": 0, "contact_line": 1}, sort=[("created_at", -1)])
        return (l.get("contact_line") or "").strip() if l else ""

    async def _decorate_threads(threads: List[dict], me_id: str) -> List[dict]:
        if not threads:
            return []
        other_ids = list({p for t in threads for p in t.get("participants", []) if p != me_id})
        mates = {m["user_id"]: m async for m in db.dorm_mates.find({"user_id": {"$in": other_ids}}, {"_id": 0, "user_id": 1, "display_name": 1, "swu_verified": 1})}
        users = {x["id"]: x async for x in db.users.find({"id": {"$in": other_ids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "auth_method": 1})}
        verifs = {v["user_id"] async for v in db.dorm_verifications.find({"user_id": {"$in": other_ids}, "status": "verified"}, {"_id": 0, "user_id": 1})}
        ctx_lids = list({t["context_id"] for t in threads if t.get("context_type") == "listing" and t.get("context_id")})
        lmap = {l["id"]: l async for l in db.dorm_listings.find(
            {"id": {"$in": ctx_lids}},
            {"_id": 0, "id": 1, "owner_id": 1, "status": 1, "kind": 1, "owner_confirm_needed": 1, "closed_by": 1},
        )} if ctx_lids else {}
        out = []
        for t in threads:
            other_id = next((p for p in t.get("participants", []) if p != me_id), "")
            m = mates.get(other_id)
            usr = users.get(other_id) or {}
            fname = ((m or {}).get("display_name") or (usr.get("full_name") or "").split(" ")[0] or "สมาชิก มศว").strip()
            em = (usr.get("email") or "").lower()
            verified = bool((m or {}).get("swu_verified") or other_id in verifs or (usr.get("auth_method") == "google" and (em.endswith("@swu.ac.th") or em.endswith(".swu.ac.th"))))
            read_at = (t.get("read_at") or {}).get(me_id, "")
            last_at = t.get("last_at") or ""
            unread = bool(t.get("last_message") and t.get("last_sender_id") != me_id and last_at > read_at)
            lst = lmap.get(t.get("context_id")) if t.get("context_type") == "listing" else None
            is_owner = bool(lst and lst.get("owner_id") == me_id)
            out.append({
                "id": t["id"], "context_type": t["context_type"], "context_id": t["context_id"],
                "context_title": t.get("context_title") or "", "context_link": t.get("context_link") or "",
                "other_name": fname, "other_verified": verified,
                "last_message": t.get("last_message") or "", "last_at": last_at,
                "last_is_mine": t.get("last_sender_id") == me_id, "unread": unread,
                "is_listing_owner": is_owner,
                "listing_status": lst.get("status") if lst else None,
                "listing_kind": lst.get("kind") if lst else None,
                "listing_confirm_needed": bool(is_owner and lst.get("owner_confirm_needed") and lst.get("status") != "closed"),
            })
        return out

    async def _latest_messages(tid: str, me_id: str, limit: int = 100) -> List[dict]:
        msgs = await db.dorm_messages.find({"thread_id": tid}, {"_id": 0}).sort("created_at", -1).to_list(limit)
        msgs.reverse()
        for mdoc in msgs:
            mdoc["is_mine"] = mdoc["sender_id"] == me_id
            mdoc.pop("sender_id", None)
        return msgs

    async def _check_chat_rate(u) -> None:
        if _is_admin(u):
            return
        since = _iso(_now() - timedelta(minutes=1))
        n = await db.dorm_messages.count_documents({"sender_id": u.id, "created_at": {"$gte": since}})
        if n >= MAX_CHAT_MSGS_PER_MIN:
            raise HTTPException(429, "ส่งข้อความเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่")

    @dorm_router.post("/threads")
    async def start_thread(body: ThreadStartIn, u=Depends(get_current_user)):
        await _ensure()
        mate_live_ok = True
        if body.target_type == "listing":
            x = await db.dorm_listings.find_one({"id": body.target_id}, {"_id": 0})
            if not x:
                raise HTTPException(404, "ไม่พบประกาศนี้")
            if x.get("external"):
                raise HTTPException(409, "ห้องจากเว็บภายนอก กรุณาติดต่อที่เว็บต้นทาง")
            if is_listing_gone(x, _iso(_now())):
                raise HTTPException(410, "ประกาศนี้ปิดหรือหมดอายุแล้ว")
            other_id = x.get("owner_id") or ""
            ctx_title = x.get("title") or "ประกาศห้อง"
            ctx_link = f"/dorm/rooms/{x['id']}"
        else:
            m = await db.dorm_mates.find_one({"id": body.target_id}, {"_id": 0})
            if not m:
                raise HTTPException(404, "ไม่พบโปรไฟล์นี้")
            mate_live_ok = _mate_live(m)
            other_id = m.get("user_id") or ""
            ctx_title = m.get("display_name") or "โปรไฟล์หาเมท"
            ctx_link = f"/dorm/mates?focus={m['id']}"
            if body.room_id:
                rm = await db.dorm_listings.find_one({"id": body.room_id}, {"_id": 0, "id": 1, "title": 1, "building_name": 1})
                if rm:
                    ctx_title = f"หารห้อง: {short_room_title(rm)}"
                    ctx_link = f"/dorm/rooms/{rm['id']}"
        if not other_id or other_id == u.id:
            raise HTTPException(400, "ส่งข้อความหาตัวเองไม่ได้")
        pair = sorted([u.id, other_id])
        if body.target_type == "mate":
            ctx_key = f"mate_room:{body.room_id}" if body.room_id else "mate"
            pair_key = f"{pair[0]}:{pair[1]}:{ctx_key}"
            suffix = f":{body.room_id}" if body.room_id else ""
            candidate_keys = [pair_key, f"{pair[0]}:{pair[1]}:mate:{body.target_id}{suffix}"]
            my_m = await _my_mate(u)
            if my_m and my_m.get("id"):
                candidate_keys.append(f"{pair[0]}:{pair[1]}:mate:{my_m['id']}{suffix}")
        else:
            pair_key = f"{pair[0]}:{pair[1]}:listing:{body.target_id}"
            candidate_keys = [pair_key]
        now = _iso(_now())
        t = await db.dorm_threads.find_one({"pair_key": {"$in": candidate_keys}}, {"_id": 0})
        if not t:
            if body.target_type == "mate" and not mate_live_ok:
                raise HTTPException(410, "โปรไฟล์นี้ปิดหรือหมดอายุแล้ว")
            t = {
                "id": uuid.uuid4().hex[:12], "pair_key": pair_key, "participants": pair,
                "context_type": body.target_type, "context_id": body.target_id,
                "context_title": ctx_title, "context_link": ctx_link,
                "last_message": "", "last_sender_id": "", "last_at": now,
                "read_at": {u.id: now}, "created_at": now,
            }
            try:
                await db.dorm_threads.insert_one(dict(t))
            except Exception as e:
                if getattr(e, "code", None) != 11000:
                    raise
                t = await db.dorm_threads.find_one({"pair_key": pair_key}, {"_id": 0}) or t
        if body.message:
            await _check_chat_rate(u)
            msg = {"id": uuid.uuid4().hex[:12], "thread_id": t["id"], "sender_id": u.id,
                   "body": body.message, "kind": "text", "created_at": now}
            await db.dorm_messages.insert_one(dict(msg))
            await db.dorm_threads.update_one(
                {"id": t["id"]},
                {"$set": {"last_message": body.message[:140], "last_sender_id": u.id, "last_at": now, f"read_at.{u.id}": now}},
            )
            t.update({"last_message": body.message[:140], "last_sender_id": u.id, "last_at": now})
            # Log a deduplicated lead event consistent with /contact
            ev_type = "contact_listing" if body.target_type == "listing" else "contact_mate"
            seen = await db.dorm_events.find_one({"type": ev_type, "target_id": body.target_id, "user_id": u.id})
            if not seen:
                await db.dorm_events.insert_one({"type": ev_type, "target_id": body.target_id, "user_id": u.id, "at": now})
                coll = db.dorm_listings if body.target_type == "listing" else db.dorm_mates
                await coll.update_one({"id": body.target_id}, {"$inc": {"contact_reveals": 1}})
        msgs = await _latest_messages(t["id"], u.id)
        dec = (await _decorate_threads([t], u.id))[0]
        return {"thread": dec, "messages": msgs, "my_line": await _my_line_id(u.id)}

    @dorm_router.get("/threads")
    async def list_threads(u=Depends(get_current_user)):
        await _ensure()
        rows = await db.dorm_threads.find({"participants": u.id, "last_message": {"$ne": ""}}, {"_id": 0}).sort("last_at", -1).to_list(100)
        return {"items": await _decorate_threads(rows, u.id), "my_line": await _my_line_id(u.id)}

    @dorm_router.get("/threads/unread")
    async def unread_threads(u=Depends(get_current_user)):
        await _ensure()
        rows = await db.dorm_threads.find({"participants": u.id, "last_message": {"$ne": ""}}, {"_id": 0, "last_sender_id": 1, "last_at": 1, "read_at": 1}).to_list(100)
        n = sum(1 for t in rows if t.get("last_sender_id") != u.id and (t.get("last_at") or "") > (t.get("read_at") or {}).get(u.id, ""))
        return {"count": n}

    @dorm_router.get("/threads/{tid}/messages")
    async def get_thread_messages(tid: str, u=Depends(get_current_user)):
        await _ensure()
        t = await db.dorm_threads.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(404, "ไม่พบห้องแชทนี้")
        if u.id not in t.get("participants", []):
            raise HTTPException(403, "ไม่มีสิทธิ์เข้าถึงห้องแชทนี้")
        now = _iso(_now())
        await db.dorm_threads.update_one({"id": tid}, {"$set": {f"read_at.{u.id}": now}})
        t.setdefault("read_at", {})[u.id] = now
        msgs = await _latest_messages(tid, u.id)
        dec = (await _decorate_threads([t], u.id))[0]
        return {"thread": dec, "messages": msgs, "my_line": await _my_line_id(u.id)}

    @dorm_router.post("/threads/{tid}/messages")
    async def send_thread_message(tid: str, body: MessageIn, u=Depends(get_current_user)):
        await _ensure()
        t = await db.dorm_threads.find_one({"id": tid}, {"_id": 0})
        if not t:
            raise HTTPException(404, "ไม่พบห้องแชทนี้")
        if u.id not in t.get("participants", []):
            raise HTTPException(403, "ไม่มีสิทธิ์ส่งข้อความในห้องแชทนี้")
        await _check_chat_rate(u)
        now = _iso(_now())
        msg = {"id": uuid.uuid4().hex[:12], "thread_id": tid, "sender_id": u.id,
               "body": body.body, "kind": body.kind, "created_at": now}
        await db.dorm_messages.insert_one(dict(msg))
        preview = f"ส่ง LINE ID: {body.body}" if body.kind == "line_card" else body.body[:140]
        await db.dorm_threads.update_one(
            {"id": tid},
            {"$set": {"last_message": preview, "last_sender_id": u.id, "last_at": now, f"read_at.{u.id}": now}},
        )
        # Activity heartbeat: if the owner replies in a listing chat, gently keep their listing fresh
        if t.get("context_type") == "listing":
            lst = await db.dorm_listings.find_one(
                {"id": t["context_id"], "owner_id": u.id, "external": {"$ne": True}, "status": "active"},
                {"_id": 0, "kind": 1, "expires_at": 1},
            )
            if lst:
                exp = _iso(_now() + timedelta(days=expiry_days_for(lst.get("kind"), False)))
                if exp > (lst.get("expires_at") or ""):
                    await db.dorm_listings.update_one({"id": t["context_id"]}, {"$set": {"expires_at": exp, "renewed_at": now}})
        # First message in a thread also counts as a lead for the target owner
        if not t.get("last_message"):
            ev_type = "contact_listing" if t["context_type"] == "listing" else "contact_mate"
            seen = await db.dorm_events.find_one({"type": ev_type, "target_id": t["context_id"], "user_id": u.id})
            if not seen:
                await db.dorm_events.insert_one({"type": ev_type, "target_id": t["context_id"], "user_id": u.id, "at": now})
                coll = db.dorm_listings if t["context_type"] == "listing" else db.dorm_mates
                await coll.update_one({"id": t["context_id"]}, {"$inc": {"contact_reveals": 1}})
        msg["is_mine"] = True
        msg.pop("sender_id", None)
        return {"message": msg}

    @dorm_router.get("/my/listing-interest")
    async def my_listing_interest(u=Depends(get_current_user)):
        """{listing_id: interest_people} for my open listings: cheap enough for the nav to poll, so it can
        show a dot when someone new is interested (the page keeps the last-seen counts on the device)."""
        own = await db.dorm_listings.find({"owner_id": u.id, **_active_listing_q()}, {"_id": 0, "id": 1}).to_list(100)
        people = await _interest_people([x["id"] for x in own])
        return {"listings": {lid: sum(int(p.get("party_size") or 1) for p in ps) for lid, ps in people.items()}}

    async def _my_interests(u) -> List[dict]:
        """Open rooms I pressed interest on, newest first, as public listing cards with the interest summary."""
        ints = await db.dorm_interests.find({"user_id": u.id}, {"_id": 0}).sort("created_at", -1).to_list(200)
        rooms = {x["id"]: x for x in await db.dorm_listings.find(
            {"id": {"$in": [i["listing_id"] for i in ints]}, **_active_listing_q()}, PUBLIC_LISTING).to_list(200)}
        out = [rooms[i["listing_id"]] for i in ints if i["listing_id"] in rooms]
        await _annotate(out, u)
        return out

    # ---------- interest endpoints
    async def _interest_summary(lid: str, u) -> dict:
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0, "id": 1, "kind": 1, "people_total": 1, "bedrooms": 1})
        await _annotate([x], u)
        return {k: x[k] for k in ("interest_count", "interest_people", "interest_avatars", "interest_match", "spots_total",
                                  "spots_taken", "spots_left", "my_interest")}

    @dorm_router.post("/listings/{lid}/peek")
    async def toggle_peek(lid: str, body: PeekIn):
        """Light, login-free interest signal triggered when a visitor saves/bookmarks a room."""
        await _ensure()
        if not await db.dorm_listings.find_one({"id": lid, **_active_listing_q()}, {"_id": 1}):
            raise HTTPException(404, "ไม่พบประกาศ หรือปิดไปแล้ว")
        if body.active:
            now = _iso(_now())
            await db.dorm_peeks.update_one(
                {"listing_id": lid, "anon_id": body.anon_id},
                {"$set": {"updated_at": now}, "$setOnInsert": {"created_at": now}},
                upsert=True,
            )
        else:
            await db.dorm_peeks.delete_one({"listing_id": lid, "anon_id": body.anon_id})
        _bust_cache()
        return {"ok": True, "peek_count": await db.dorm_peeks.count_documents({"listing_id": lid})}

    @dorm_router.post("/listings/{lid}/interest")
    async def add_interest(lid: str, body: InterestIn, u=Depends(get_current_user)):
        await _ensure()
        x = await db.dorm_listings.find_one({"id": lid, **_active_listing_q()},
                                            {"_id": 0, "id": 1, "owner_id": 1, "external": 1, "gender_pref": 1})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ หรือปิดไปแล้ว")
        if x.get("owner_id") and x["owner_id"] == u.id:
            raise HTTPException(409, "นี่คือประกาศของคุณเอง")
        me = await _my_mate(u)
        if not _mate_live(me):
            # 428: the page then asks for the short profile (gender, LINE, consent) and tries again
            raise HTTPException(428, "สร้างโปรไฟล์หาเมทสั้นๆ ก่อน คนที่สนใจห้องเดียวกันจะได้ทักคุณได้")
        why = listing_refuses(x, me)
        if why:
            raise HTTPException(403, why)
        now = _iso(_now())
        old = await db.dorm_interests.find_one({"listing_id": lid, "user_id": u.id}, {"_id": 0, "id": 1})
        if old:
            await db.dorm_interests.update_one({"id": old["id"]}, {"$set": {"party_size": body.party_size, "mate_id": me["id"]}})
        else:
            if await _active_interest_count(u.id) >= MAX_ACTIVE_INTERESTS:
                raise HTTPException(429, f"สนใจได้พร้อมกัน {MAX_ACTIVE_INTERESTS} ห้อง ถอนห้องที่ไม่สนใจแล้วก่อนนะ")
            try:
                await db.dorm_interests.insert_one({"id": uuid.uuid4().hex[:12], "listing_id": lid, "user_id": u.id,
                                                    "mate_id": me["id"], "party_size": body.party_size, "created_at": now})
            except Exception:   # a double tap raced the unique index: keep the one that landed
                await db.dorm_interests.update_one({"listing_id": lid, "user_id": u.id}, {"$set": {"party_size": body.party_size}})
            await _log("interest", lid, u)
        _bust_cache()
        return await _interest_summary(lid, u)

    @dorm_router.delete("/listings/{lid}/interest")
    async def withdraw_interest(lid: str, u=Depends(get_current_user)):
        await db.dorm_interests.delete_one({"listing_id": lid, "user_id": u.id})
        _bust_cache()
        if not await db.dorm_listings.find_one({"id": lid}, {"_id": 1}):
            return {"ok": True}
        return {"ok": True, **await _interest_summary(lid, u)}

    @dorm_router.get("/listings/{lid}/interested")
    async def listing_interested(lid: str, u=Depends(get_current_user_optional)):
        """People interested in a room, gated:
          * guest -> access "guest", and a signed-in user without a live mate profile -> access "no_profile":
            the neutral total and initials only, no cards, no names;
          * a viewer with a live profile -> access "profile": their own card plus exactly the people who pass the
            two-way gender gate with them (interest_match of them), with a match score; the rest are counted in
            hidden_by_gender;
          * the owner of a listing posted on the site -> access "owner": everyone.
        Cards carry public mate-card fields only (never contacts)."""
        await _ensure()
        x = await db.dorm_listings.find_one({"id": lid}, {"_id": 0, "id": 1, "owner_id": 1, "status": 1, "expires_at": 1,
                                                          "kind": 1, "people_total": 1, "bedrooms": 1})
        if not x:
            raise HTTPException(404, "ไม่พบประกาศ")
        owner = bool(u) and bool(x.get("owner_id")) and x["owner_id"] == u.id
        if is_listing_gone(x, _iso(_now())) and not owner:
            raise HTTPException(410, "ประกาศนี้ปิดหรือหมดอายุแล้ว")
        counting = (await _interest_people([lid])).get(lid, [])
        me = await _live_mate(u) if u else None
        access = "owner" if owner else "profile" if me else "no_profile" if u else "guest"
        hidden = {"total": 0, "theirs": 0, "mine": 0}
        items = []
        interest_summary = None
        if counting:
            mate_ids = [i["mate_id"] for i in counting]
            if access in ("owner", "profile"):
                mates = {m["id"]: m for m in await db.dorm_mates.find({"id": {"$in": mate_ids}}, PUBLIC_MATE).to_list(500)}
                raw_mates = list(mates.values())
            else:
                mates = {}
                raw_mates = await db.dorm_mates.find(
                    {"id": {"$in": mate_ids}}, {"_id": 0, "budget_min": 1, "budget_max": 1, "move_in": 1}
                ).to_list(500)
            b_mins = [m["budget_min"] for m in raw_mates if (m.get("budget_min") or 0) > 0]
            b_maxs = [m["budget_max"] for m in raw_mates if (m.get("budget_max") or 0) > 0]
            move_ins = sorted({m["move_in"] for m in raw_mates if m.get("move_in")})[:3]
            if b_mins or b_maxs or move_ins:
                interest_summary = {
                    "budget_min": min(b_mins) if b_mins else None,
                    "budget_max": max(b_maxs) if b_maxs else (max(b_mins) if b_mins else None),
                    "move_ins": move_ins,
                }
        else:
            mates = {}
        if access in ("owner", "profile"):
            for i in counting:
                m = dict(mates.get(i["mate_id"]) or {})
                if not m:
                    continue
                m.update({"party_size": i["party_size"], "interested_at": i["created_at"], "is_me": bool(me) and me["id"] == m["id"]})
                m["match"] = match_score(me, m) if me else None
                if access == "profile" and not m["is_me"] and not gate_ok(me, m):
                    hidden["total"] += 1
                    if not gender_accepts(m, me):
                        hidden["theirs"] += 1      # they want a different gender than the viewer's
                    if not gender_accepts(me, m):
                        hidden["mine"] += 1        # their gender is not what the viewer asked for
                    continue
                items.append(m)
            items.sort(key=lambda m: (not m["is_me"], -((m["match"] or {}).get("score") or 0)))
        return {"items": items, "me": bool(me), "is_owner": owner, "access": access, "hidden_by_gender": hidden,
                "interest_summary": interest_summary,
                **interest_fields(x, counting, getattr(u, "id", None), me)}

    # ---------- buildings + reviews
    async def _building_summaries(items: List[dict]) -> List[dict]:
        """Batch-enrich building summaries with reviews & active room counts in 2 parallel DB queries."""
        if not items:
            return items
        slugs = [b["slug"] for b in items]
        reviews, counts_raw = await asyncio.gather(
            db.dorm_reviews.find({"building_slug": {"$in": slugs}, "hidden": {"$ne": True}}, {"_id": 0, "building_slug": 1, "ratings": 1}).to_list(20000),
            db.dorm_listings.aggregate([
                {"$match": {"building_slug": {"$in": slugs}, **_active_listing_q()}},
                {"$group": {"_id": "$building_slug", "n": {"$sum": 1}}},
            ]).to_list(1000),
        )
        rev_by_slug = {}
        for r in reviews:
            rev_by_slug.setdefault(r["building_slug"], []).append(r)
        count_map = {c["_id"]: int(c["n"]) for c in counts_raw if c.get("_id")}
        by_b_chat = load_chat_posts()["by_building"]
        aspect_ids = _ids(REVIEW_ASPECTS)
        for b in items:
            sl = b["slug"]
            revs = rev_by_slug.get(sl, [])
            avg = {}
            for a in aspect_ids:
                vals = [r["ratings"][a] for r in revs if a in r.get("ratings", {})]
                if vals:
                    avg[a] = round(sum(vals) / len(vals), 1)
            b["review_count"] = len(revs)
            b["ratings_avg"] = avg
            b["overall"] = round(sum(avg.values()) / len(avg), 1) if avg else None
            b["active_listings"] = count_map.get(sl, 0)
            b["photos"] = b.get("photos") or []
            b["official_url"] = b.get("official_url")
            b["thumb"] = building_thumb(b["photos"])
            b["chat"] = chat_summary(by_b_chat.get(sl, []))
        return items

    async def _building_summary(b: dict) -> dict:
        return (await _building_summaries([b]))[0]

    @dorm_router.get("/buildings")
    async def list_buildings(request: Request, zone: Optional[str] = None, q: Optional[str] = None, campus: Optional[str] = None):
        await _ensure()

        async def _load_buildings():
            f = {**_campus_q(campus)} if campus else {}
            if zone:
                f["zone"] = zone
            if q:
                rx = {"$regex": re.escape(q.strip()[:60]), "$options": "i"}
                f["$or"] = [{"name": rx}, {"aliases": rx}]
            items = await db.dorm_buildings.find(f, {"_id": 0, "aliases": 0}).sort("name", 1).to_list(500)
            await _building_summaries(items)
            items.sort(key=lambda b: (-b["active_listings"], -b["review_count"], b["name"]))
            return {"items": items}

        if q is None:
            ckey = ("buildings", zone, campus) if campus else ("buildings", zone)
            return await _cached_json(ckey, 20, _load_buildings, request)
        return await _load_buildings()

    @dorm_router.get("/buildings/{slug}")
    async def get_building(slug: str, u=Depends(get_current_user_optional)):
        await _ensure()
        b = await db.dorm_buildings.find_one({"slug": slug}, {"_id": 0, "aliases": 0})
        if not b:
            raise HTTPException(404, "ไม่พบตึกนี้")
        b = await _building_summary(b)
        reviews = await db.dorm_reviews.find({"building_slug": slug, "hidden": {"$ne": True}}, {"_id": 0}).sort("created_at", -1).to_list(200)
        for r in reviews:
            r["is_mine"] = bool(u) and r.get("user_id") == u.id
            r.pop("user_id", None)
        now_dt = _now()
        cutoff_s = _iso(now_dt - timedelta(days=ARCHIVE_VISIBLE_DAYS))
        all_b_rows = await _annotate(await db.dorm_listings.find({"building_slug": slug}, PUBLIC_LISTING).to_list(500), u)
        listings = sort_listings([x for x in all_b_rows if not x.get("is_gone")], "new")
        listings.sort(key=lambda x: (not bool(x.get("interest_people")), -int(x.get("interest_people") or 0)))
        closed_listings = sorted(
            [x for x in all_b_rows if x.get("is_gone") and is_publicly_archivable(x, cutoff_s)],
            key=_closed_sort_key, reverse=True,
        )[:24]
        return {"building": b, "reviews": reviews, "listings": listings, "closed_listings": closed_listings}

    @dorm_router.post("/buildings/{slug}/reviews")
    async def review_building(slug: str, body: ReviewIn, u=Depends(get_current_user)):
        if not await db.dorm_buildings.find_one({"slug": slug}, {"_id": 1}):
            raise HTTPException(404, "ไม่พบตึกนี้")
        now = _iso(_now())
        name = "ผู้อยู่อาศัย (ไม่ระบุชื่อ)" if body.anonymous else (getattr(u, "full_name", "") or "สมาชิก")
        await db.dorm_reviews.update_one(
            {"building_slug": slug, "user_id": u.id},
            {"$set": {"ratings": body.ratings, "text": body.text, "lived_year": body.lived_year, "swu_verified": await _swu_verified_async(u),
                      "display_name": name, "updated_at": now},
             "$setOnInsert": {"id": uuid.uuid4().hex[:12], "created_at": now}},
            upsert=True)
        _bust_cache()
        return {"ok": True}

    @dorm_router.delete("/buildings/{slug}/reviews/me")
    async def delete_my_review(slug: str, u=Depends(get_current_user)):
        rv = await db.dorm_reviews.find_one({"building_slug": slug, "user_id": u.id}, {"_id": 0, "id": 1})
        r = await db.dorm_reviews.delete_one({"building_slug": slug, "user_id": u.id})
        if rv:
            await _auto_resolve_reports("review", rv["id"], "system_target_deleted")
        _bust_cache()
        return {"ok": True, "deleted": r.deleted_count}

    # ---------- photos (client compresses to ~1280px JPEG before upload)
    _MAGIC = {bytes([0xFF, 0xD8, 0xFF]): "image/jpeg", bytes([0x89]) + b"PNG": "image/png", b"RIFF": "image/webp"}

    @dorm_router.post("/photos")
    async def upload_photo(body: PhotoIn, u=Depends(get_current_user)):
        # base64 of 1.5 MB is ~2.0 MB of text; anything longer is too big before decoding it
        if len(body.data_url) > 2_100_000:
            raise HTTPException(413, "รูปใหญ่เกิน 1.5 MB")
        m = re.match(r"^data:image/(jpeg|png|webp);base64,(.+)$", body.data_url, re.S)
        if not m:
            raise HTTPException(422, "รองรับเฉพาะรูป JPG / PNG / WEBP")
        try:
            raw = base64.b64decode(m.group(2), validate=True)
        except Exception:
            raise HTTPException(422, "ไฟล์รูปเสีย")
        if len(raw) > MAX_PHOTO_BYTES:
            raise HTTPException(413, "รูปใหญ่เกิน 1.5 MB")
        mime = next((t for sig, t in _MAGIC.items() if raw.startswith(sig)), None)
        if not mime or (mime == "image/webp" and raw[8:12] != b"WEBP") or not decodes_as_image(raw, mime):
            raise HTTPException(422, "ไฟล์นี้ไม่ใช่รูปภาพ")
        since = _iso(_now() - timedelta(days=1))
        if await db.dorm_photos.count_documents({"owner_id": u.id, "created_at": {"$gte": since}}) >= MAX_PHOTOS_PER_DAY                 and not _is_admin(u):
            raise HTTPException(429, "อัปโหลดรูปครบโควตาวันนี้แล้ว")
        pid = uuid.uuid4().hex[:16]
        await db.dorm_photos.insert_one({"id": pid, "owner_id": u.id, "mime": mime, "data": raw,
                                         "size": len(raw), "created_at": _iso(_now())})
        return {"id": pid, "url": f"/api/dorm/photos/{pid}"}

    @dorm_router.get("/photos/{pid}")
    async def get_photo(pid: str):
        if not re.fullmatch(r"[a-f0-9]{16}", pid):
            raise HTTPException(404)
        doc = await db.dorm_photos.find_one({"id": pid}, {"_id": 0, "data": 1, "mime": 1})
        if not doc:
            raise HTTPException(404)
        # ids are random and never reused, so the bytes behind a URL never change
        return Response(bytes(doc["data"]), media_type=doc["mime"],
                        headers={"Cache-Control": "public, max-age=31536000, immutable",
                                 "Content-Encoding": "identity"})

    # ---------- link preview for LINE / Facebook (crawlers don't run the SPA's JS)
    @dorm_router.get("/og/rooms/{lid}", response_class=HTMLResponse)
    async def og_room(lid: str, request: Request):
        x = await db.dorm_listings.find_one({"id": lid}, PUBLIC_LISTING)
        origin = site_origin(request)
        target = f"{origin}/dorm/rooms/{lid}"
        gone = bool(x) and is_listing_gone(x, _iso(_now()))
        if not x:
            title, desc = "หาห้อง หาเมท มศว", "ห้องว่างและเพื่อนร่วมห้องรอบ มศว ประสานมิตร"
            img = f"{origin}/dorm/og/default.png"
        elif gone:
            # a closed or expired listing shows no title, price or photo, only a neutral card
            title, desc = "ประกาศนี้ปิดแล้ว", "ดูห้องอื่นและคนหาเมทรอบ มศว ประสานมิตร ได้ที่ หาห้อง หาเมท มศว"
            img = f"{origin}/dorm/og/default.png"
        else:
            kind = next((k["label"] for k in KINDS if k["id"] == x["kind"]), "")
            where = x.get("building_name") or next((z["label"] for z in ZONES if z["id"] == x["zone"]), "")
            title = x["title"]
            btype = None
            if x.get("building_slug") and x.get("bedrooms") == 0:
                b = await db.dorm_buildings.find_one({"slug": x["building_slug"]}, {"_id": 0, "type": 1})
                btype = (b or {}).get("type")
            price = price_text(x, is_single_room(x, btype))
            if x.get("external"):
                desc = f"{price}, {where}, ข้อมูลจาก {x.get('source', '')}"
            else:
                desc = f"{kind}, {where}, {price}, เข้าอยู่ {_th_date(x.get('move_in', ''))}"
            first = next((p for p in x.get("photo_links") or [] if p.startswith("/api/dorm/photos/")), "")
            # no photo → the kind's illustrated card (static, in frontend/public/dorm/og)
            img = origin + first if first else f"{origin}/dorm/og/{x['kind']}.png"
        e = lambda v: _html.escape(str(v), quote=True)  # noqa: E731
        img_tags = f'<meta property="og:image" content="{e(img)}"><meta name="twitter:card" content="summary_large_image">' if img else ""
        return HTMLResponse(f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>{e(title)}</title><link rel="canonical" href="{e(target)}"><meta property="og:type" content="website"><meta property="og:site_name" content="หาห้อง·หาเมท มศว">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(target)}">{img_tags}
<meta http-equiv="refresh" content="0;url={e(target)}"></head>
<body><a href="{e(target)}">{e(title)}</a></body></html>""")

    @dorm_router.get("/og/buildings/{slug}", response_class=HTMLResponse)
    async def og_building(slug: str, request: Request):
        await _ensure()
        b = await db.dorm_buildings.find_one({"slug": slug}, {"_id": 0, "aliases": 0})
        origin = site_origin(request)
        target = f"{origin}/dorm/buildings/{slug}"
        cobj = campus_info(b.get("campus_slug") if b else None)
        if not b:
            title = f"รีวิวหอพักใกล้ {cobj.get('name_th', 'มศว ประสานมิตร')}"
            desc = "เปรียบเทียบรีวิวตึก คอนโด อพาร์ตเมนต์รอบ มศว พร้อมเวลาเดินทางและราคา"
            img = f"{origin}/dorm/og/default.png"
        else:
            b = await _building_summary(b)
            zone_l = next((z["label"] for z in ZONES if z["id"] == b.get("zone")), "")
            title = f"{b['name']} — รีวิวที่พักใกล้ {cobj.get('name_th', 'มศว ประสานมิตร')}"
            parts = [zone_l, b.get("minutes_to_swu") and f"เดินทาง ~{b['minutes_to_swu']} นาทีถึง {cobj.get('short_th', 'มศว')}"]
            if b.get("review_count") and b.get("overall"):
                parts.append(f"คะแนน {b['overall']}/5 ({b['review_count']} รีวิว)")
            if b.get("price_seen"):
                parts.append(b["price_seen"])
            desc = " · ".join(p for p in parts if p) or b.get("web_review_summary") or title
            img = (b.get("photos") or [{}])[0].get("url") or f"{origin}/dorm/og/default.png"
        e = lambda v: _html.escape(str(v), quote=True)  # noqa: E731
        return HTMLResponse(f"""<!doctype html><html lang="th"><head><meta charset="utf-8">
<title>{e(title)}</title><link rel="canonical" href="{e(target)}"><meta property="og:type" content="website"><meta property="og:site_name" content="หาห้อง·หาเมท {e(cobj.get('short_th', 'มศว'))}">
<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{e(target)}"><meta property="og:image" content="{e(img)}">
<meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url={e(target)}"></head>
<body><a href="{e(target)}">{e(title)}</a></body></html>""")

    @dorm_router.get("/sitemap.xml")
    async def dorm_sitemap_xml(request: Request, campus: Optional[str] = None):
        await _ensure()
        origin = site_origin(request)

        async def _build_xml():
            cf = _campus_q(campus) if campus else {}
            cobj = campus_info(campus)
            base_path = (cobj.get("base_path") or "/dorm").rstrip("/")
            buildings, listings = await asyncio.gather(
                db.dorm_buildings.find(cf, {"_id": 0, "slug": 1, "zone": 1}).to_list(1000),
                db.dorm_listings.find({**_active_listing_q(), **cf}, {"_id": 0, "id": 1, "zone": 1, "renewed_at": 1, "created_at": 1}).to_list(3000),
            )
            urls = [
                (f"{origin}{base_path}", None, "daily", "1.0"),
                (f"{origin}{base_path}/rooms", None, "daily", "0.9"),
                (f"{origin}{base_path}/buildings", None, "weekly", "0.9"),
                (f"{origin}{base_path}/mates", None, "daily", "0.8"),
                (f"{origin}{base_path}/insights", None, "weekly", "0.7"),
            ]
            active_zones = {x.get("zone") for x in listings if x.get("zone")} | {b.get("zone") for b in buildings if b.get("zone")}
            for z in _ids(ZONES):
                if z in active_zones and z != "other":
                    urls.append((f"{origin}{base_path}/rooms?zone={z}", None, "daily", "0.8"))
            for b in sorted(buildings, key=lambda item: item.get("slug") or ""):
                if b.get("slug"):
                    urls.append((f"{origin}{base_path}/buildings/{b['slug']}", None, "weekly", "0.85"))
            for x in listings:
                if x.get("id"):
                    lm = (x.get("renewed_at") or x.get("created_at") or "")[:10] or None
                    urls.append((f"{origin}{base_path}/rooms/{x['id']}", lm, "daily", "0.7"))

            lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
            for loc, lastmod, cf_val, pri in urls:
                lines.append("  <url>")
                lines.append(f"    <loc>{_html.escape(loc)}</loc>")
                if lastmod:
                    lines.append(f"    <lastmod>{_html.escape(lastmod)}</lastmod>")
                lines.append(f"    <changefreq>{cf_val}</changefreq>")
                lines.append(f"    <priority>{pri}</priority>")
                lines.append("  </url>")
            lines.append("</urlset>")
            return "\n".join(lines)

        xml = await _cached(("sitemap_xml", origin, campus or DEFAULT_CAMPUS), 600, _build_xml)
        return Response(content=xml, media_type="application/xml; charset=utf-8")

    # ---------- reports
    @dorm_router.post("/reports")
    async def report(body: ReportIn, u=Depends(get_current_user)):
        # the external room's one-tap "ไม่ว่างแล้ว" button sends EXT_GONE_REASON
        allowed = REPORT_REASONS_BY_TYPE[body.target_type] + ([EXT_GONE_REASON] if body.target_type == "listing" else [])
        if body.reason not in allowed:
            raise HTTPException(422, "เลือกเหตุผลจากรายการ")
        coll_name = {"listing": "dorm_listings", "mate": "dorm_mates", "review": "dorm_reviews"}[body.target_type]
        coll = db[coll_name]
        target = await coll.find_one({"id": body.target_id}, {"_id": 0})
        if not target:
            raise HTTPException(404, "ไม่พบสิ่งที่รายงาน")
        dup = await db.dorm_reports.find_one({"target_id": body.target_id, "user_id": u.id, "resolved": False})
        if dup:
            return {"ok": True, "duplicate": True}
        now_s = _iso(_now())
        rep_verified = await _swu_verified_async(u)
        rep_doc = {
            "id": uuid.uuid4().hex[:12], "target_type": body.target_type, "target_id": body.target_id,
            "reason": body.reason, "note": body.note, "user_id": u.id,
            "reporter_verified": rep_verified, "resolved": False, "created_at": now_s,
        }
        await db.dorm_reports.insert_one(dict(rep_doc))
        await coll.update_one({"id": body.target_id}, {"$inc": {"reports": 1}})
        if body.target_type == "listing" and body.reason in GONE_REASONS:
            if not target.get("external") and target.get("owner_id") == u.id:
                return {"ok": True}
            sig = await _record_gone_signal(target, f"u:{u.id}", u=u, note=body.note, log_report=False)
            return {"ok": True, **sig}

        # Safe crowd auto-moderation for severe spam/scam reports (reversible via dorm_agent_actions)
        already_hidden = (
            (body.target_type in ("listing", "mate") and target.get("status") == "closed")
            or (body.target_type == "review" and bool(target.get("hidden")))
        )
        can_auto_mod = (
            body.reason in SEVERE_REPORT_REASONS
            and not already_hidden
            and not (body.target_type == "listing" and target.get("external"))
        )
        if can_auto_mod:
            owner_id = target.get("owner_id") or target.get("user_id")
            open_severe = await db.dorm_reports.find({
                "target_type": body.target_type,
                "target_id": body.target_id,
                "reason": {"$in": list(SEVERE_REPORT_REASONS)},
                "resolved": False,
                **({"user_id": {"$ne": owner_id}} if owner_id else {}),
            }, {"_id": 0}).to_list(50)
            by_user = {r["user_id"]: r for r in open_severe if r.get("user_id")}
            weight = sum(1.0 if r.get("reporter_verified") else 0.5 for r in by_user.values())
            if len(by_user) >= AUTO_MOD_MIN_REPORTERS and weight >= AUTO_MOD_MIN_WEIGHT:
                import copy
                snaps = [{"collection": coll_name, "query": {"id": body.target_id}, "before": copy.deepcopy(target)}]
                for r in open_severe:
                    snaps.append({"collection": "dorm_reports", "query": {"id": r["id"]}, "before": copy.deepcopy(r)})
                if body.target_type == "listing":
                    await coll.update_one(
                        {"id": body.target_id},
                        {"$set": {
                            "status": "closed", "closed_by": "system", "closed_reason": "auto_moderated",
                            "closed_at": now_s, "reserved_until": None,
                        }},
                    )
                    tgt_title = target.get("title") or body.target_id
                    tgt_link = f"/dorm/rooms/{body.target_id}"
                elif body.target_type == "mate":
                    await coll.update_one(
                        {"id": body.target_id},
                        {"$set": {"status": "closed", "closed_by": "system", "closed_reason": "auto_moderated", "closed_at": now_s}},
                    )
                    tgt_title = target.get("display_name") or body.target_id
                    tgt_link = f"/dorm/mates?focus={body.target_id}"
                else:
                    await coll.update_one(
                        {"id": body.target_id},
                        {"$set": {"hidden": True, "hidden_reason": "auto_moderated", "hidden_at": now_s}},
                    )
                    tgt_title = f"รีวิว {target.get('building_slug') or body.target_id}"
                    tgt_link = f"/dorm/buildings/{target.get('building_slug')}" if target.get("building_slug") else "/dorm/admin"
                rids = [r["id"] for r in open_severe]
                await db.dorm_reports.update_many(
                    {"id": {"$in": rids}, "resolved": False},
                    {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": "system_auto_mod"}},
                )
                await db.dorm_admin_proposals.update_many(
                    {"status": "pending", "kind": "resolve_report", "target_id": {"$in": rids}},
                    {"$set": {"status": "dismissed", "decided_at": now_s, "decided_by": "system:auto", "decision_note": "auto_moderated"}},
                )
                await db.dorm_agent_actions.insert_one({
                    "id": "act_" + uuid.uuid4().hex[:12],
                    "action": "auto_moderate",
                    "source": "system_auto",
                    "title": f"พักเนื้อหาชั่วคราว ({len(by_user)} ผู้รายงาน): {tgt_title}"[:160],
                    "reason": f"รายงานรุนแรง {len(by_user)} คน (คะแนนความน่าเชื่อถือ {weight:.1f})",
                    "target_type": body.target_type,
                    "target_id": body.target_id,
                    "target_link": tgt_link,
                    "affected_count": len(snaps),
                    "actor": "system:auto-guard",
                    "proposal_id": None,
                    "snapshot_count": len(snaps),
                    "snapshots": snaps,
                    "created_at": now_s,
                    "undone_at": None,
                    "undone_by": None,
                })
                _bust_cache()
                return {"ok": True, "auto_moderated": True}
        return {"ok": True}

    # ---------- admin
    def _admin(u):
        if not _is_admin(u):
            raise HTTPException(403, "Admin only")

    @dorm_router.get("/admin/overview")
    async def admin_overview(u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        reports = await db.dorm_reports.find({"resolved": False}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(200)
        await _report_targets(reports)
        # no contacts, descriptions or photo lists: the table needs facts, status and counters only
        listings = await db.dorm_listings.find({}, {
            "_id": 0, "contact_line": 0, "contact_phone": 0, "description": 0, "ext_photos": 0, "photo_links": 0,
            "amenities": 0, "owner_id": 0}).to_list(3000)
        # posted on the site first (newest first), then external rows; id keeps the order stable between loads
        listings.sort(key=lambda x: x.get("id") or "")
        listings.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        listings.sort(key=lambda x: bool(x.get("external")))
        since = _iso(_now() - timedelta(days=30))
        leads = await db.dorm_events.count_documents({"at": {"$gte": since}, "type": {"$regex": "^contact_"}})
        qr_raw = await db.dorm_events.aggregate([
            {"$match": {"type": "qr_visit", "at": {"$gte": since}}},
            {"$group": {"_id": "$target_id", "count": {"$sum": 1}, "last_at": {"$max": "$at"}}},
            {"$sort": {"count": -1, "_id": 1}},
            {"$limit": 30},
        ]).to_list(30)
        qr_scans = [{"src": x["_id"], "count": int(x["count"]), "last_at": x["last_at"]} for x in qr_raw if x.get("_id")]
        qr_total = await db.dorm_events.count_documents({"type": "qr_visit", "at": {"$gte": since}})
        verifs = await db.dorm_verifications.find({"status": "pending"}, {"_id": 0, "otp_hash": 0}).sort("updated_at", -1).to_list(200)
        if verifs:
            uids = [v["user_id"] for v in verifs]
            umap = {x["id"]: x async for x in db.users.find({"id": {"$in": uids}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1})}
            for v in verifs:
                usr = umap.get(v["user_id"]) or {}
                v["user_name"] = usr.get("full_name") or ""
                v["user_email"] = usr.get("email") or ""
        proposals = await agent_views["list_pending_proposals"](100)
        self_ver_n, auto_closed_n, auto_rep_n, auto_mod_n = await asyncio.gather(
            db.dorm_verifications.count_documents({
                "status": "verified",
                "method": {"$in": ["google_swu_link", "swu_account_vouch", "swu_email_otp"]},
                "verified_at": {"$gte": since},
            }),
            db.dorm_listings.count_documents({
                "status": "closed",
                "closed_by": {"$in": ["crowd", "system", "agent"]},
                "closed_at": {"$gte": since},
            }),
            db.dorm_reports.count_documents({
                "resolved": True,
                "resolved_by": {"$regex": "^system_"},
                "resolved_at": {"$gte": since},
            }),
            db.dorm_agent_actions.count_documents({
                "action": "auto_moderate",
                "created_at": {"$gte": since},
            }),
        )
        return {"reports": reports, "verifications": verifs, "listings": listings, "leads_30d": leads,
                "qr_scans_30d": qr_scans, "qr_total_30d": qr_total,
                "mates_total": await db.dorm_mates.count_documents({}),
                "proposals": proposals,
                "pending_proposals_count": len(proposals),
                "recent_actions": await agent_views["list_recent_actions"](30),
                "autopilot_30d": {
                    "self_verified_google": self_ver_n,
                    "auto_closed_gone": auto_closed_n,
                    "auto_resolved_reports": auto_rep_n,
                    "auto_moderated": auto_mod_n,
                }}

    @dorm_router.post("/admin/verifications/{uid}")
    async def admin_review_verification(uid: str, body: AdminVerifyActionIn, u=Depends(get_current_user)):
        _admin(u)
        if getattr(u, "auth_method", None) == "api_key":
            raise HTTPException(403, "กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน (API key ทำรายการนี้ไม่ได้)")
        await _ensure()
        doc = await db.dorm_verifications.find_one({"user_id": uid})
        if not doc:
            raise HTTPException(404, "ไม่พบคำขอยืนยันนี้")
        now = _iso(_now())
        if body.action == "approve":
            await db.dorm_verifications.update_one(
                {"user_id": uid},
                {"$set": {"status": "verified", "verified_at": now, "updated_at": now, "reviewed_by": u.id, "reject_reason": ""}},
            )
            await _backfill_verified(uid)
        else:
            await db.dorm_verifications.update_one(
                {"user_id": uid},
                {"$set": {"status": "rejected", "updated_at": now, "reviewed_by": u.id, "reject_reason": body.reason.strip()}},
            )
        await _dismiss_verification_proposals(uid, f"human_{body.action}")
        _bust_cache()
        return {"ok": True}

    async def _report_targets(reports: List[dict]):
        """Adds target_title (listing title, mate display name, or the building of a review), target_link (a page
        path, or None when the target is gone) and target_status to each report, for the admin list."""
        by = {}
        for r in reports:
            by.setdefault(r["target_type"], set()).add(r["target_id"])
        found = {}
        if by.get("listing"):
            async for x in db.dorm_listings.find({"id": {"$in": list(by["listing"])}}, {"_id": 0, "id": 1, "title": 1, "status": 1}):
                found[("listing", x["id"])] = (x["title"], f"/dorm/rooms/{x['id']}", x.get("status"))
        if by.get("mate"):
            async for m in db.dorm_mates.find({"id": {"$in": list(by["mate"])}}, {"_id": 0, "id": 1, "display_name": 1, "status": 1}):
                found[("mate", m["id"])] = (m.get("display_name") or "", f"/dorm/mates?focus={m['id']}", m.get("status"))
        if by.get("review"):
            async for v in db.dorm_reviews.find({"id": {"$in": list(by["review"])}}, {"_id": 0, "id": 1, "building_slug": 1}):
                found[("review", v["id"])] = (f"รีวิว {v.get('building_slug') or ''}".strip(), f"/dorm/buildings/{v.get('building_slug')}", None)
        for r in reports:
            t = found.get((r["target_type"], r["target_id"]))
            r["target_title"], r["target_link"], r["target_status"] = t if t else ("(ถูกลบไปแล้ว)", None, "deleted")

    @dorm_router.post("/admin/reports/resolve-stale")
    async def resolve_stale_reports_bulk(u=Depends(get_current_user)):
        """Human admin clears all open reports whose target is already closed, expired, hidden, or deleted."""
        _admin(u)
        if getattr(u, "auth_method", None) == "api_key":
            raise HTTPException(403, "กรุณาเข้าสู่ระบบด้วยบัญชีแอดมิน (API key ทำรายการนี้ไม่ได้)")
        await _ensure()
        now_s = _iso(_now())
        open_reps = await db.dorm_reports.find({"resolved": False}, {"_id": 0, "id": 1, "target_type": 1, "target_id": 1}).to_list(1000)
        if not open_reps:
            return {"ok": True, "resolved": 0}
        lids = list({r["target_id"] for r in open_reps if r.get("target_type") == "listing"})
        mids = list({r["target_id"] for r in open_reps if r.get("target_type") == "mate"})
        rids = list({r["target_id"] for r in open_reps if r.get("target_type") == "review"})
        lmap = {x["id"]: x async for x in db.dorm_listings.find({"id": {"$in": lids}}, {"_id": 0})} if lids else {}
        mmap = {x["id"]: x async for x in db.dorm_mates.find({"id": {"$in": mids}}, {"_id": 0})} if mids else {}
        rmap = {x["id"]: x async for x in db.dorm_reviews.find({"id": {"$in": rids}}, {"_id": 0})} if rids else {}
        stale_ids = []
        for r in open_reps:
            tt, tid = r.get("target_type"), r.get("target_id")
            if tt == "listing":
                tgt = lmap.get(tid)
                if tgt is None or is_listing_gone(tgt, now_s):
                    stale_ids.append(r["id"])
            elif tt == "mate":
                tgt = mmap.get(tid)
                if tgt is None or tgt.get("status") == "closed" or (tgt.get("expires_at") or "") <= now_s:
                    stale_ids.append(r["id"])
            elif tt == "review":
                tgt = rmap.get(tid)
                if tgt is None or tgt.get("hidden"):
                    stale_ids.append(r["id"])
        if not stale_ids:
            return {"ok": True, "resolved": 0}
        res = await db.dorm_reports.update_many(
            {"id": {"$in": stale_ids}, "resolved": False},
            {"$set": {"resolved": True, "resolved_at": now_s, "resolved_by": f"admin_stale:{u.id}"}},
        )
        await db.dorm_admin_proposals.update_many(
            {"status": "pending", "kind": "resolve_report", "target_id": {"$in": stale_ids}},
            {"$set": {"status": "dismissed", "decided_at": now_s, "decided_by": "system:auto", "decision_note": "stale_bulk_cleared"}},
        )
        return {"ok": True, "resolved": res.modified_count}

    @dorm_router.post("/admin/reports/{rid}/resolve")
    async def resolve_report(rid: str, u=Depends(get_current_user)):
        _admin(u)
        r = await db.dorm_reports.update_one({"id": rid}, {"$set": {"resolved": True, "resolved_at": _iso(_now())}})
        if not r.matched_count:
            raise HTTPException(404, "ไม่พบรายงานนี้")
        return {"ok": True}

    @dorm_router.post("/admin/listings/{lid}/feature")
    async def feature_listing(lid: str, body: FeatureIn, u=Depends(get_current_user)):
        _admin(u)
        r = await db.dorm_listings.update_one({"id": lid}, {"$set": {"featured": body.featured}})
        if not r.matched_count:
            raise HTTPException(404, "ไม่พบประกาศ")
        _bust_cache()
        return {"ok": True}

    @dorm_router.get("/admin/digest")
    async def digest(days: int = Query(7, ge=1, le=60), base_url: str = Query("https://swumkt.org", max_length=200),
                     u=Depends(get_current_user)):
        _admin(u)
        if not re.match(r"^https?://[\w.:-]+$", base_url):
            raise HTTPException(422, "base_url must be an origin, e.g. https://swumkt.org")
        since = _now() - timedelta(days=days)
        ql = {**_active_listing_q(), "created_at": {"$gte": _iso(since)}, "external": {"$ne": True}}
        qm = {**_active_q(), "created_at": {"$gte": _iso(since)}}
        listings = await db.dorm_listings.find(ql, PUBLIC_LISTING).sort([("featured", -1), ("created_at", -1)]).to_list(200)
        mates = await db.dorm_mates.find(qm, PUBLIC_MATE).to_list(1000)
        return {"text": build_digest(listings, mates, base_url, since),
                "listings": len(listings), "mates": len(mates)}

    @dorm_router.put("/admin/buildings")
    async def upsert_building(body: BuildingIn, u=Depends(get_current_user)):
        _admin(u)
        await db.dorm_buildings.update_one({"slug": body.slug}, {"$set": body.model_dump()}, upsert=True)
        _bust_cache()
        return {"ok": True}

    @dorm_router.post("/admin/import-external")
    async def reimport_external(u=Depends(get_current_user)):
        _admin(u)
        await _ensure()
        res = await _sync_external(force=True) or {}
        _bust_cache()
        return {"ok": True, **res}

    @dorm_router.post("/admin/seed-buildings")
    async def reseed(overwrite: bool = False, u=Depends(get_current_user)):
        _admin(u)
        n = await _seed_buildings(overwrite=overwrite)
        _bust_cache()
        return {"ok": True, "count": n}

    agent_views = register_dorm_agent_routes(dorm_router, db, get_current_user, {
        "_is_admin": _is_admin,
        "_ensure": _ensure,
        "_now": _now,
        "_iso": _iso,
        "plan_external_import": plan_external_import,
        "per_person_of": per_person_of,
        "BuildingIn": BuildingIn,
        "_backfill_verified": _backfill_verified,
        "_report_targets": _report_targets,
        "is_listing_gone": is_listing_gone,
        "EXT_TTL_DAYS": EXT_TTL_DAYS,
        "GONE_REASONS": GONE_REASONS,
        "_bust_cache": _bust_cache,
    })

    return dorm_router
