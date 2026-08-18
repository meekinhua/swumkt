"""
Shared PDPA consent scaffolding (spec 2.10, Phase 0b).

Deliberately small: a consent object stored before question 1, three separate
opt-ins that are never bundled, a per-respondent withdrawal token, and a hard
blocklist on PDPA s.26 special categories that any generator must pass through.
"""

import secrets
from datetime import datetime, timezone
from typing import Dict, List, Optional

CONSENT_VERSION = "2026-08-pdpa-v1"
MAX_RETENTION_MONTHS = 24

# PDPA s.26 special categories — hard reject, never a warning.
SPECIAL_CATEGORY_TERMS = [
    "เชื้อชาติ", "ชาติพันธุ์", "ความคิดเห็นทางการเมือง", "พรรคการเมือง",
    "ศาสนา", "ความเชื่อ", "พฤติกรรมทางเพศ", "รสนิยมทางเพศ",
    "ประวัติอาชญากรรม", "ข้อมูลสุขภาพ", "โรคประจำตัว", "ความพิการ",
    "สหภาพแรงงาน", "ข้อมูลชีวมิติ", "ลายนิ้วมือ", "ใบหน้า", "พันธุกรรม",
]

# Values that must never be collected raw — banded alternatives only.
UNBANDED_TERMS = [
    "วันเกิด", "วัน/เดือน/ปีเกิด", "เลขบัตรประชาชน", "บัตรประชาชน",
    "รายได้ต่อเดือนเป็นตัวเลข", "ที่อยู่", "บ้านเลขที่", "เบอร์โทร",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_respondent_token() -> str:
    """128-bit withdrawal key, shown once on the thank-you screen."""
    return secrets.token_hex(16)


def check_blocklist(texts: List[str]) -> List[str]:
    """Return the offending terms found in any supplied label/option text."""
    hits: List[str] = []
    blob = " ".join(str(t or "") for t in texts)
    for term in SPECIAL_CATEGORY_TERMS + UNBANDED_TERMS:
        if term in blob and term not in hits:
            hits.append(term)
    return hits


def default_consent(researcher_name: str = "",
                    advisor_name: str = "",
                    contact: str = "",
                    retention_months: int = 12) -> Dict:
    """The consent object stored on the study and shown before question 1."""
    retention = max(1, min(int(retention_months or 12), MAX_RETENTION_MONTHS))
    controller = "มหาวิทยาลัยศรีนครินทรวิโรฒ"
    if researcher_name:
        controller += f" · ผู้วิจัย {researcher_name}"
    if advisor_name:
        controller += f" · อาจารย์ที่ปรึกษา {advisor_name}"
    return {
        "version": CONSENT_VERSION,
        "controller": controller,
        "purpose": ("เก็บข้อมูลเส้นทางประสบการณ์ของลูกค้าเพื่อการศึกษาวิจัย"
                    "ทางการตลาดในระดับปริญญา ไม่ใช้เพื่อการขายหรือโฆษณา"),
        "data_items": [
            "ลำดับขั้นตอนที่คุณทำ",
            "ความยุ่งยากและความรู้สึกในแต่ละขั้น",
            "ข้อมูลกลุ่มแบบช่วง (ช่วงอายุ ภูมิภาค ช่องทางหลัก)",
            "เวลาที่ใช้ตอบแต่ละหน้า",
        ],
        "retention_months": retention,
        "rights": [
            "ขอเข้าถึงข้อมูลของตนเอง",
            "ขอแก้ไขข้อมูลให้ถูกต้อง",
            "ถอนความยินยอมและลบคำตอบได้ทุกเมื่อ",
            "ร้องเรียนต่อผู้ควบคุมข้อมูลหรือสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคล",
        ],
        "contact": contact or "ติดต่อผู้วิจัยผ่านช่องทางที่แจ้งไว้ในลิงก์แบบสอบถาม",
        "opt_ins": [
            {"key": "participation", "required": True,
             "label_th": "ยินยอมให้ใช้คำตอบของฉันในงานวิจัยนี้"},
            {"key": "recontact", "required": False,
             "label_th": "ยินดีให้ติดต่อกลับเพื่อสอบถามเพิ่มเติม (ไม่บังคับ)"},
            {"key": "linkage", "required": False,
             "label_th": "ยินยอมให้เชื่อมคำตอบนี้กับแบบสอบถามอื่นของโครงการเดียวกัน (ไม่บังคับ)"},
        ],
        "withdraw_note_th": ("ระบบจะให้รหัสถอนความยินยอมหลังส่งคำตอบ "
                            "เก็บรหัสนี้ไว้หากต้องการให้ลบคำตอบภายหลัง"),
    }


def consent_record(participation: bool, recontact: bool = False,
                   linkage: bool = False, version: Optional[str] = None) -> Dict:
    return {
        "participation": bool(participation),
        "recontact": bool(recontact),
        "linkage": bool(linkage),
        "at": now_iso(),
        "version": version or CONSENT_VERSION,
    }


def purge_after_iso(retention_months: int) -> str:
    months = max(1, min(int(retention_months or 12), MAX_RETENTION_MONTHS))
    now = datetime.now(timezone.utc)
    year = now.year + (now.month - 1 + months) // 12
    month = (now.month - 1 + months) % 12 + 1
    day = min(now.day, 28)
    return now.replace(year=year, month=month, day=day).isoformat()
