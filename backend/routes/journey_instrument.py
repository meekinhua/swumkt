"""
Deterministic instrument library for the quantitative Customer Journey module.

Modelled on `brand_equity.py::_generate_questions_from_template` (L660) and
`_merge_questions_preserving_history` (L594): templates are data, ids are stable
across regenerates, and nothing here calls an LLM. `survey_dsl.py` is
deliberately untouched — spec 8.7 establishes nothing in this path uses it.
"""

import hashlib
import json
from typing import Dict, List, Optional

from lib.consent import check_blocklist

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------
DEFAULT_STAGES = [
    # Named from the CUSTOMER's point of view — this is UX research, so a stage
    # is what the customer is doing, never what the brand is doing to them.
    {"id": "pre", "label_th": "ยังหาข้อมูล/เทียบตัวเลือก", "order": 1},
    {"id": "purchase", "label_th": "กำลังตัดสินใจและซื้อ", "order": 2},
    {"id": "post", "label_th": "ได้ของแล้วและใช้งาน", "order": 3},
]

# Touchpoint options as the CUSTOMER experiences them. Measured per step from
# each respondent — never declared by the researcher on the customer's behalf.
DEFAULT_CHANNEL_OPTIONS = [
    "แอป/เว็บไซต์",
    "หน้าร้าน/สถานที่จริง",
    "โซเชียลมีเดีย/รีวิว",
    "คนรู้จัก/ปากต่อปาก",
    "พนักงาน/ตัวแทน",
    "โทรศัพท์/แชท",
]

OWNERS = ["brand", "partner", "customer", "social"]
OWNER_LABELS_TH = {
    "brand": "แบรนด์ควบคุมเอง",
    "partner": "คู่ค้า/ตัวกลาง",
    "customer": "ลูกค้าทำเอง",
    "social": "สังคม/คนรอบตัว",
}
FEASIBILITY = ["high", "med", "low", "unknown"]
FEASIBILITY_LABELS_TH = {"high": "แก้ได้เร็ว", "med": "แก้ได้ปานกลาง",
                         "low": "แก้ได้ยาก", "unknown": "ยังไม่ทราบ"}

RECENCY_BANDS = [
    {"id": "le_7", "label_th": "ภายใน 7 วัน", "days": 7},
    {"id": "d8_30", "label_th": "8–30 วันที่แล้ว", "days": 30},
    {"id": "m1_3", "label_th": "1–3 เดือนที่แล้ว", "days": 90},
    {"id": "m3_12", "label_th": "3–12 เดือนที่แล้ว", "days": 365},
    {"id": "older", "label_th": "นานกว่า 1 ปี", "days": 4000},
    {"id": "never", "label_th": "ไม่เคยทำเลย", "days": -1},
]

# Pain is not only effort. The taxonomy keeps each option in ONE type so the
# results can be grouped without double counting, and the wording stays in the
# customer's voice ("ฉันเจออะไร") rather than the brand's diagnosis.
PAIN_TYPES = {
    "process": "กระบวนการ/ขั้นตอน",
    "time": "เวลาและความพยายาม",
    "information": "ข้อมูลและความชัดเจน",
    "money": "ค่าใช้จ่าย",
    "service": "คนและบริการ",
    "functional": "ระบบ/ของใช้งานไม่ได้",
    "emotional": "ความรู้สึกและความมั่นใจ",
    "access": "การเข้าถึง",
}

PAIN_TAXONOMY = [
    ("ขั้นตอนยุ่งยาก/ซับซ้อน", "process"),
    ("ต้องทำซ้ำหรือต้องตามเรื่องเอง", "process"),
    ("ใช้เวลานานเกินไป/รอนาน", "time"),
    ("ข้อมูลไม่ชัดเจนหรือหายาก", "information"),
    ("ราคา/ค่าใช้จ่ายไม่คุ้มหรือมีค่าใช้จ่ายแฝง", "money"),
    ("พนักงานหรือบริการไม่ช่วยเหลือ", "service"),
    ("ระบบ/แอป/เว็บมีปัญหา", "functional"),
    ("ไม่มั่นใจ/กังวลว่าจะถูกเอาเปรียบหรือข้อมูลไม่ปลอดภัย", "emotional"),
    ("รู้สึกหงุดหงิดหรืออึดอัดกับสถานการณ์", "emotional"),
    ("เดินทางลำบาก/เข้าถึงยาก/เวลาไม่สะดวก", "access"),
]

DEFAULT_PAIN_OPTIONS = [label for label, _ in PAIN_TAXONOMY]
PAIN_TYPE_OF = {label: t for label, t in PAIN_TAXONOMY}


def pain_type_of(label: str) -> str:
    return PAIN_TYPE_OF.get(label, "process")

# Behavioural first, demographic last. Banded values only (PDPA, spec 2.10).
SEGMENT_QUESTIONS = [
    {"id": "experience", "label_th": "ประสบการณ์กับสินค้า/บริการหมวดนี้",
     "options": ["เพิ่งเริ่มสนใจ", "เคยซื้อ/ใช้บ้าง", "ซื้อ/ใช้เป็นประจำ"]},
    {"id": "role", "label_th": "บทบาทในการตัดสินใจ",
     "options": ["ตัดสินใจเอง", "ตัดสินใจร่วมกับคนอื่น", "คนอื่นตัดสินใจให้"]},
    {"id": "channel", "label_th": "ช่องทางหลักที่ใช้",
     "options": ["หน้าร้าน", "แอป/เว็บไซต์", "โซเชียลมีเดีย", "ตัวแทน/คนกลาง"]},
    {"id": "age_band", "label_th": "ช่วงอายุ",
     "options": ["ต่ำกว่า 20 ปี", "20–29 ปี", "30–39 ปี", "40–49 ปี", "50 ปีขึ้นไป"]},
    {"id": "region", "label_th": "ภูมิภาคที่อาศัยอยู่",
     "options": ["กรุงเทพฯ และปริมณฑล", "ภาคกลาง", "ภาคเหนือ",
                 "ภาคตะวันออกเฉียงเหนือ", "ภาคตะวันออก", "ภาคตะวันตก", "ภาคใต้"]},
]

TEMPLATES = {
    "retail_product": {
        "label_th": "สินค้าอุปโภคบริโภค / ร้านค้า",
        "steps": [
            ("รู้จักสินค้าครั้งแรก", "pre", "social"),
            ("หาข้อมูลและอ่านรีวิว", "pre", "customer"),
            ("เปรียบเทียบร้าน/ราคา", "pre", "customer"),
            ("ไปดูสินค้าจริง/ทดลอง", "purchase", "brand"),
            ("สั่งซื้อและชำระเงิน", "purchase", "brand"),
            ("รับสินค้าและเริ่มใช้งาน", "post", "partner"),
        ],
    },
    "online_service": {
        "label_th": "บริการออนไลน์ / แอป",
        "steps": [
            ("เห็นโฆษณาหรือคนแนะนำ", "pre", "social"),
            ("เข้าไปดูรายละเอียดบริการ", "pre", "brand"),
            ("สมัครสมาชิก/กรอกข้อมูล", "purchase", "brand"),
            ("ชำระเงิน/เลือกแพ็กเกจ", "purchase", "brand"),
            ("เริ่มใช้งานครั้งแรก", "post", "brand"),
            ("ติดต่อฝ่ายบริการเมื่อมีปัญหา", "post", "partner"),
        ],
    },
    "food_service": {
        "label_th": "ร้านอาหาร / บริการหน้าร้าน",
        "steps": [
            ("เห็นร้านหรือรีวิวในโซเชียล", "pre", "social"),
            ("ดูเมนูและราคา", "pre", "customer"),
            ("เดินทางไปร้าน/สั่งเดลิเวอรี", "purchase", "customer"),
            ("สั่งอาหารและรอรับ", "purchase", "brand"),
            ("รับประทานและชำระเงิน", "post", "brand"),
        ],
    },
}


# ---------------------------------------------------------------------------
# Builders
# ---------------------------------------------------------------------------
def _state_id(idx: int) -> str:
    return f"s{idx + 1}"


# Touchpoint TYPE. The two-way cut the literature cares about is physical vs
# non-physical, but "คนต่อคน" sits across both (a shop assistant is physical, a
# friend on the phone is not), so the type is stored in three values and rolled
# up to the two-way view in the payload rather than being forced into it here.
CHANNEL_TYPES = {
    "digital": "ดิจิทัล/ออนไลน์",
    "physical": "กายภาพ/สถานที่จริง",
    "human": "คนต่อคน",
}
PHYSICAL_TYPES = {"physical"}

DEFAULT_CHANNEL_TYPES = {
    "แอป/เว็บไซต์": "digital",
    "โซเชียลมีเดีย/รีวิว": "digital",
    "หน้าร้าน/สถานที่จริง": "physical",
    "คนรู้จัก/ปากต่อปาก": "human",
    "พนักงาน/ตัวแทน": "human",
    "โทรศัพท์/แชท": "human",
}


# Interaction cardinality. one_to_many is the brand talking to a crowd,
# many_to_many is customers talking to each other — the part the brand does not
# control and usually cannot fix, which is why it is reported separately.
CHANNEL_MODES = {
    "one_to_one": "ตัวต่อตัว (one-to-one)",
    "one_to_many": "แบรนด์ถึงคนหมู่มาก (one-to-many)",
    "many_to_many": "ลูกค้าคุยกันเอง (many-to-many)",
}

DEFAULT_CHANNEL_MODES = {
    "แอป/เว็บไซต์": "one_to_many",
    "โซเชียลมีเดีย/รีวิว": "many_to_many",
    "หน้าร้าน/สถานที่จริง": "one_to_many",
    "คนรู้จัก/ปากต่อปาก": "many_to_many",
    "พนักงาน/ตัวแทน": "one_to_one",
    "โทรศัพท์/แชท": "one_to_one",
}


def default_channel_modes(options: Optional[List[str]] = None) -> Dict[str, str]:
    return {o: DEFAULT_CHANNEL_MODES.get(o, "one_to_many")
            for o in (options or DEFAULT_CHANNEL_OPTIONS)}


def default_channel_types(options: Optional[List[str]] = None) -> Dict[str, str]:
    return {o: DEFAULT_CHANNEL_TYPES.get(o, "digital")
            for o in (options or DEFAULT_CHANNEL_OPTIONS)}


def build_states_from_template(template_key: str) -> List[dict]:
    tpl = TEMPLATES.get(template_key) or TEMPLATES["retail_product"]
    return [
        {"id": _state_id(i), "stage_id": stage, "label_th": label,
         "owner": owner, "substitutability": "assistable",
         "feasibility": "unknown", "planned_next_state_id": None}
        for i, (label, stage, owner) in enumerate(tpl["steps"])
    ]


def build_states_from_labels(labels: List[str],
                             existing: Optional[List[dict]] = None) -> List[dict]:
    """Stable ids: a label that already exists keeps its id, so responses
    collected earlier still point at the same step."""
    by_label = {(s.get("label_th") or "").strip(): s for s in (existing or [])}
    used = set()
    out: List[dict] = []
    for i, raw in enumerate(labels):
        label = (raw or "").strip()
        if not label:
            continue
        old = by_label.get(label)
        sid = old["id"] if old and old["id"] not in used else _state_id(i)
        while sid in used:
            sid = f"s{len(used) + 1}x"
        used.add(sid)
        out.append({
            "id": sid,
            "stage_id": (old or {}).get("stage_id") or DEFAULT_STAGES[min(i, 2)]["id"],
            "label_th": label,
            "owner": (old or {}).get("owner") or "brand",
            "substitutability": (old or {}).get("substitutability") or "assistable",
            "feasibility": (old or {}).get("feasibility") or "unknown",
            "planned_next_state_id": (old or {}).get("planned_next_state_id"),
        })
    return out


def default_absorbing(level: str = "product") -> dict:
    if level == "solution":
        return {"conv_id": "CONV", "conv_label_th": "แก้ปัญหาได้สำเร็จ",
                "abandon_id": "ABANDON", "abandon_label_th": "ยอมแพ้/เลิกพยายาม",
                "unknown_id": "UNKNOWN", "unknown_label_th": "ไม่ทราบปลายทาง"}
    return {"conv_id": "CONV", "conv_label_th": "ซื้อแล้ว",
            "abandon_id": "ABANDON", "abandon_label_th": "เลิกสนใจ",
            "unknown_id": "UNKNOWN", "unknown_label_th": "ไม่ทราบปลายทาง"}


def default_expected_transitions(states: List[dict]) -> dict:
    """Forward-plus-self by default. Advisory only: it orders branch options and
    produces a design diagnostic. It never touches the data (spec 2.6)."""
    m = len(states)
    matrix = [[1 if (j == i or j == i + 1) else 0 for j in range(m)] for i in range(m)]
    return {"matrix": matrix, "role": "instrument_and_diagnostic_only"}


def default_pain_options(states: List[dict]) -> Dict[str, List[str]]:
    return {s["id"]: list(DEFAULT_PAIN_OPTIONS) for s in states}


def build_segment_questions(custom: Optional[dict] = None) -> List[dict]:
    """The six segment slots. A study-specific banded item may replace slot 6."""
    qs = [dict(q, type="mcq_single", scale_points=len(q["options"])) for q in SEGMENT_QUESTIONS]
    if custom and custom.get("label_th") and custom.get("options"):
        violations = check_blocklist([custom.get("label_th")] + list(custom.get("options") or []))
        if violations:
            raise ValueError("ข้อมูลอ่อนไหวตาม PDPA มาตรา 26 ใช้เป็นคำถามไม่ได้: "
                             + ", ".join(violations))
        qs.append({"id": "custom_1", "label_th": custom["label_th"],
                   "options": [str(o) for o in custom["options"]][:8],
                   "type": "mcq_single",
                   "scale_points": len(custom["options"][:8])})
    return qs


# ---------------------------------------------------------------------------
# Hashing
# ---------------------------------------------------------------------------
def compute_structure_hash(study: dict) -> str:
    """The ONLY pooling key. Labels are excluded on purpose: a Thai typo fix
    bumps `content_revision` and must not split the sample."""
    payload = {
        "states": [s.get("id") for s in (study.get("states") or [])],
        "stages": [s.get("id") for s in (study.get("stages") or [])],
        "absorbing": [(study.get("absorbing") or {}).get(k)
                      for k in ("conv_id", "abandon_id", "unknown_id")],
        "questions": [[q.get("id"), q.get("type"), len(q.get("options") or []),
                       q.get("scale_points")]
                      for q in (study.get("segment_questions") or [])],
        "pain_option_counts": {k: len(v or []) for k, v in
                               (study.get("pain_options") or {}).items()},
        "channel_options": len(study.get("channel_options") or []),
        "ask_channel_per_step": bool(study.get("ask_channel_per_step")),
        "channel_multi": bool(study.get("channel_multi")),
        "ask_anxiety_per_step": bool(study.get("ask_anxiety_per_step")),
        "recall_window_days": study.get("recall_window_days"),
        "analysis_level": study.get("analysis_level"),
    }
    # Swapping the codebook changes what every pain option MEANS, so it is a
    # structural change. Added only when a codebook is actually in use: keying
    # it unconditionally would move the hash of every study fielded before this
    # feature existed, and a moved hash makes even a typo fix return 400.
    if study.get("codebook_version"):
        payload["codebook_version"] = int(study["codebook_version"])

    blob = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


LABEL_FIELDS = ("label_th", "conv_label_th", "abandon_label_th", "unknown_label_th")


def diff_content_revision(before: dict, after: dict) -> List[dict]:
    """Label-only edits, logged so the methodology appendix can show them."""
    log: List[dict] = []
    old_states = {s["id"]: s for s in (before.get("states") or [])}
    for s in (after.get("states") or []):
        o = old_states.get(s["id"])
        if o and (o.get("label_th") or "") != (s.get("label_th") or ""):
            log.append({"field": f"states.{s['id']}.label_th",
                        "before": o.get("label_th"), "after": s.get("label_th")})
    ob, ab = before.get("absorbing") or {}, after.get("absorbing") or {}
    for k in LABEL_FIELDS[1:]:
        if ob.get(k) != ab.get(k) and ab.get(k) is not None:
            log.append({"field": f"absorbing.{k}", "before": ob.get(k), "after": ab.get(k)})
    return log
