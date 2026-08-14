"""Seed a realistic simulated Brand Equity study (DEMO, clearly labelled).

Why simulated data at all: Cronbach's alpha needs ~30+ respondents who answered
every item in a dimension, and no live study on this instance has that, so the
reliability card and the thesis reliability table could never show a real number.
This produces a study that behaves like a real fieldwork dataset instead of noise:

  * a latent brand attitude per respondent, drawn from five archetypes, feeding
    every rating item through a graded-response style threshold model — that is
    what makes items in a dimension actually correlate (alpha comes out ~0.7-0.9,
    not ~0.0 like uniform random answers)
  * per-dimension latent factors correlated with, but not identical to, the
    overall attitude, so the four dimensions differ from each other
  * response styles seen in real panels: acquiescence, extreme and midpoint
    responders, and a few straight-liners
  * item non-response on optional items, and true partial drop-offs stored as
    unfinished DRAFTS (which also gives the reminder feature real data)
  * Thai open-ended answers written per archetype, with typos, nicknames and
    mixed-script brand names, so AI theme extraction has something honest to chew
  * two waves with a plausible campaign effect (awareness up most, loyalty lags)

Run: cd /app/backend && python scripts/seed_simulated_brand_study.py
"""
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from routes import brand_equity as BE  # noqa: E402

STUDY_ID = "demo-sim-chathai-001"
SHARE_TOKEN = "demosimchathai"
OWNER_EMAIL = "admin@swu.ac.th"
BRAND = "ชาไทยมะลิ"
COMPETITORS = ["Cha Tra Mue", "Inthanin"]
INTENDED = ["สดชื่น", "คุ้มค่า", "ทันสมัย", "เป็นกันเอง"]

WAVE_1 = datetime(2026, 2, 3, 9, 0, tzinfo=timezone.utc)
WAVE_2 = datetime(2026, 5, 4, 9, 0, tzinfo=timezone.utc)

# archetype: (share, attitude mean, attitude sd, awareness bonus)
ARCHETYPES = {
    "loyal_fan":  (0.18, 1.15, 0.45, 0.9),
    "satisfied":  (0.34, 0.45, 0.45, 0.4),
    "neutral":    (0.26, -0.05, 0.50, 0.0),
    "skeptic":    (0.16, -0.70, 0.50, -0.3),
    "detractor":  (0.06, -1.35, 0.55, -0.5),
}

OPEN_TEXT = {
    "quality_reasons": {
        "loyal_fan": ["ชาหอมมาก ใบชาคุณภาพดี ไม่หวานเลี่ยน", "รสชาติคงที่ทุกสาขา สั่งกี่ครั้งก็เหมือนกัน",
                      "ใช้นมสดจริง ไม่ใช่ครีมเทียม รู้สึกได้เลย"],
        "satisfied": ["รสชาติดี ราคาโอเค", "ชาหอม แต่บางสาขาหวานไม่เท่ากัน",
                      "แก้วใหญ่ คุ้มราคา", "ไข่มุกนุ่มดี"],
        "neutral": ["ก็ทั่วไป ไม่ได้ต่างจากร้านอื่น", "เฉยๆ ครับ ดื่มได้",
                    "ขึ้นอยู่กับสาขา", "ไม่แน่ใจ"],
        "skeptic": ["หวานเกินไป ขอหวานน้อยแล้วยังหวาน", "ราคาขึ้นแต่แก้วเล็กลง",
                    "รอนานมาก ช่วงเย็นคิวยาว", "บางครั้งชาจางเหมือนเติมน้ำ"],
        "detractor": ["แพงเกินไปสำหรับคุณภาพแบบนี้", "ไข่มุกแข็ง ดื่มไม่หมดต้องทิ้ง",
                      "พนักงานไม่ใส่ใจ ทำผิดออเดอร์บ่อย"],
    },
    "reason_to_stay": {
        "loyal_fan": ["ติดรสชาตินี้ ร้านอื่นไม่เหมือน", "มีบัตรสะสมแต้ม คุ้มมาก",
                      "อยู่ใกล้ที่ทำงาน แวะง่ายทุกเช้า"],
        "satisfied": ["ราคาเข้าถึงได้ และหาง่าย", "รสชาติคุ้นเคย สั่งแล้วไม่พลาด",
                      "มีโปรบ่อย"],
        "neutral": ["ก็แค่ใกล้บ้าน", "ถ้ามีร้านอื่นก็เปลี่ยนได้",
                    "ยังไม่มีเหตุผลพิเศษ"],
        "skeptic": ["จะอยู่ต่อถ้าลดความหวานได้จริง", "ถ้าราคาขึ้นอีกคงเปลี่ยน"],
        "detractor": ["ไม่คิดจะกลับไปซื้อ", "ย้ายไปร้านอื่นแล้ว"],
    },
    "image_personality": {
        "loyal_fan": ["เหมือนเพื่อนสมัยเรียนที่ยังคุยกันได้ทุกเรื่อง", "เป็นพี่สาวใจดี ไม่ต้องเกรงใจ",
                      "สดใส เป็นกันเอง เข้าถึงง่าย"],
        "satisfied": ["คนรุ่นใหม่ ทำงานออฟฟิศ ง่ายๆ สบายๆ", "เป็นมิตร ไม่หรูจนเกร็ง"],
        "neutral": ["ธรรมดาๆ ทั่วไป", "ไม่มีบุคลิกชัดเจน"],
        "skeptic": ["พยายามดูทันสมัยแต่ยังไม่ถึง", "เหมือนคนที่อยากขายของมากกว่าคุย"],
        "detractor": ["ไม่รู้สึกอะไรกับแบรนด์นี้"],
    },
    "image_one_word": {
        "loyal_fan": ["หอม", "สดชื่น", "อบอุ่น", "คุ้ม"],
        "satisfied": ["สดชื่น", "ง่าย", "คุ้มค่า"],
        "neutral": ["ธรรมดา", "ชานม", "ทั่วไป"],
        "skeptic": ["หวาน", "แพง", "ช้า"],
        "detractor": ["แพง", "เฉยๆ"],
    },
    "as_org_unaided": {
        "loyal_fan": ["บริษัทไทยที่ดูใส่ใจวัตถุดิบ", "ดูเป็นแบรนด์ท้องถิ่นที่โตขึ้นเรื่อยๆ"],
        "satisfied": ["บริษัทชานมทั่วไป แต่ดูน่าเชื่อถือ", "เห็นสาขาเยอะ ดูมั่นคง"],
        "neutral": ["ไม่รู้จักบริษัทเลย", "ไม่เคยสนใจว่าใครเป็นเจ้าของ"],
        "skeptic": ["เน้นขยายสาขามากกว่าคุณภาพ"],
        "detractor": ["ไม่รู้ และไม่สนใจ"],
    },
    "as_symbol_unaided": {
        "loyal_fan": ["โลโก้ดอกมะลิสีขาวบนพื้นส้ม จำได้เลย", "แก้วลายมะลิ เห็นแล้วรู้ทันที"],
        "satisfied": ["สีส้ม กับดอกมะลิ", "จำได้ว่าเป็นสีส้ม"],
        "neutral": ["จำโลโก้ไม่ได้", "ไม่แน่ใจ"],
        "skeptic": ["คล้ายๆ ร้านอื่นในห้าง"],
        "detractor": ["จำไม่ได้"],
    },
}

# Unaided top-of-mind: what people type, including typos and nicknames.
TOM_FOCAL = [BRAND, "ชาไทย มะลิ", "ชาไทยมะลี", "chathai mali", "ร้านชาไทยมะลิ", "ชาไทยมะลิ "]
TOM_OTHER = ["Cha Tra Mue", "ชาตรามือ", "Inthanin", "อินทนิล", "KOI", "Fire Tiger", "Bearhouse", "โอชายะ"]

AGE_MIX = [("18-24", 0.34), ("25-34", 0.38), ("35-44", 0.18), ("45+", 0.10)]
GENDER_MIX = [("หญิง", 0.60), ("ชาย", 0.36), ("ไม่ระบุ", 0.04)]
OCCUPATION_MIX = [("นักเรียน/นักศึกษา", 0.30), ("พนักงานบริษัท", 0.40),
                  ("ธุรกิจส่วนตัว", 0.15), ("ข้าราชการ/รัฐวิสาหกิจ", 0.09), ("อื่นๆ", 0.06)]


def pick(rng, mix):
    r = rng.random()
    acc = 0.0
    for val, p in mix:
        acc += p
        if r <= acc:
            return val
    return mix[-1][0]


def graded(rng, theta, top, discrimination=1.15, bias=0.0, style="normal"):
    """Turn a latent attitude into a rating on a 1..top scale.

    Thresholds are spread across the latent scale, which is what makes items that
    load on the same latent correlate the way real scale items do.
    """
    z = theta * discrimination + bias + rng.gauss(0, 0.55)
    # map z (roughly -3..3) onto 1..top
    v = (z + 2.6) / 5.2 * (top - 1) + 1
    if style == "extreme":
        v = 1 + (v - 1) * 1.35 - 0.15 * (top - 1) * 0.0
    elif style == "midpoint":
        mid = (1 + top) / 2
        v = mid + (v - mid) * 0.55
    return int(max(1, min(top, round(v))))


class Respondent:
    def __init__(self, rng, wave, campaign_lift):
        self.rng = rng
        self.wave = wave
        share_roll = rng.random()
        acc = 0.0
        self.archetype = "neutral"
        for name, (share, mu, sd, aw) in ARCHETYPES.items():
            acc += share
            if share_roll <= acc:
                self.archetype = name
                break
        _, mu, sd, aw_bonus = ARCHETYPES[self.archetype]
        self.theta = rng.gauss(mu, sd) + campaign_lift.get("overall", 0.0)
        # Dimension factors: correlated with the overall attitude (r ~ 0.75) but
        # not identical, so the four dimension scores are not clones.
        def dim_theta(extra=0.0):
            return 0.78 * self.theta + 0.62 * rng.gauss(0, 0.62) + extra
        self.dim = {
            "awareness": dim_theta(aw_bonus + campaign_lift.get("awareness", 0.0)),
            "quality": dim_theta(campaign_lift.get("quality", 0.0)),
            "identity": dim_theta(campaign_lift.get("identity", 0.0)),
            "loyalty": dim_theta(campaign_lift.get("loyalty", 0.0)),
        }
        # Response style
        r = rng.random()
        self.style = "extreme" if r < 0.14 else "midpoint" if r < 0.30 else "normal"
        self.acquiescence = 0.35 if rng.random() < 0.15 else 0.0
        self.straight_liner = rng.random() < 0.03
        self.speeder = rng.random() < 0.06
        self.skip_rate = rng.uniform(0.03, 0.16)
        self._facets = {}
        self.demographics = {
            "age": pick(rng, AGE_MIX),
            "gender": pick(rng, GENDER_MIX),
            "occupation": pick(rng, OCCUPATION_MIX),
        }
        # Real panels are not demographically flat: for a bubble-tea brand the
        # under-25s are the core audience and the over-45s are lukewarm. Without an
        # effect like this the segment tests can only ever return "not significant",
        # which tells a user nothing about whether the test works.
        age_shift = {"18-24": 0.42, "25-34": 0.12, "35-44": -0.22, "45+": -0.55}
        gender_shift = {"หญิง": 0.16, "ชาย": -0.14, "ไม่ระบุ": 0.0}
        shift = age_shift.get(self.demographics["age"], 0.0) \
            + gender_shift.get(self.demographics["gender"], 0.0)
        self.theta += shift
        for k in self.dim:
            # Age bites hardest on identity/loyalty (who the brand feels "for"),
            # least on perceived quality, which is closer to a factual judgement.
            w = {"awareness": 0.8, "quality": 0.45, "identity": 1.0, "loyalty": 1.1}[k]
            self.dim[k] += shift * w

    def rating(self, dim, top, discrimination=1.15, facet=None):
        if self.straight_liner:
            return max(1, min(top, round((top + 1) / 2) + (1 if self.theta > 0 else 0)))
        # Facet factor: items about the brand "as a person" hang together more
        # tightly with each other than with items about it "as a product". Without
        # this, an 11-item dimension all loading on one latent gives an
        # implausibly clean alpha of 0.97.
        base = self.dim.get(dim, self.theta)
        if facet:
            if facet not in self._facets:
                self._facets[facet] = 0.72 * base + 0.70 * self.rng.gauss(0, 0.62)
            base = self._facets[facet]
        return graded(self.rng, base, top, discrimination, self.acquiescence, self.style)

    @staticmethod
    def facet_of(kind: str) -> str:
        k = kind or ""
        for pref in ("as_org", "as_person", "as_symbol", "as_product", "attribute",
                     "brand_promise", "image", "repeat", "switching", "overall_quality"):
            if k.startswith(pref):
                return pref
        return k

    def text(self, kind):
        pool = OPEN_TEXT.get(kind, {}).get(self.archetype)
        if not pool:
            return None
        t = self.rng.choice(pool)
        if self.rng.random() < 0.10:      # typos happen
            t = t.replace("ั", "ั้", 1) if "ั" in t else t + " ครับ"
        return t

    def answer_question(self, q):
        """None means the respondent left the item blank."""
        qtype, kind, dim = q["type"], q.get("kind"), q.get("dimension")
        if not q.get("required") and self.rng.random() < self.skip_rate:
            return None

        if qtype == "likert_5":
            return self.rating(dim, 5, facet=self.facet_of(kind))
        if qtype == "likert_7":
            if q.get("compare_brand"):
                # Competitor items are judged on their own merit, only mildly
                # related to how the respondent feels about the focal brand.
                base = self.rng.gauss(0.25, 0.75) - 0.25 * self.theta
                return graded(self.rng, base, 7, 1.0, self.acquiescence, self.style)
            return self.rating(dim, 7, facet=self.facet_of(kind))
        if qtype == "comparative_7":
            # 1 = focal brand much better, 7 = competitor much better
            return int(max(1, min(7, round(4 - self.dim["quality"] * 1.15 + self.rng.gauss(0, 0.8)))))
        if qtype == "nps_0_10":
            v = 5.4 + self.dim["loyalty"] * 2.3 + self.rng.gauss(0, 1.0)
            return int(max(0, min(10, round(v))))
        if qtype == "mcq_multi" and kind == "aided_recognition":
            opts = q.get("options") or []
            picked = []
            for o in opts:
                if o == BRAND:
                    p = 0.62 + 0.16 * self.dim["awareness"]
                elif o in COMPETITORS:
                    p = 0.55
                else:
                    p = 0.30
                if self.rng.random() < max(0.05, min(0.97, p)):
                    picked.append(o)
            if not picked:
                picked = [self.rng.choice(opts)] if opts else []
            return picked
        if qtype == "mcq_single":
            opts = q.get("options") or []
            return self.rng.choice(opts) if opts else None
        if qtype == "trait_grid":
            opts = list(q.get("options") or [])
            if not opts:
                return None
            lo = q.get("min") or 2
            hi = q.get("max") or max(lo, 4)
            k = self.rng.randint(lo, hi)
            intended_here = [o for o in opts if o in INTENDED]
            other = [o for o in opts if o not in INTENDED]
            picked = []
            # The stronger the identity attitude, the more the intended traits get
            # picked — which is exactly what the identity score measures.
            p_intended = max(0.10, min(0.92, 0.45 + 0.24 * self.dim["identity"]))
            for o in intended_here:
                if len(picked) < k and self.rng.random() < p_intended:
                    picked.append(o)
            self.rng.shuffle(other)
            for o in other:
                if len(picked) < k and self.rng.random() < 0.45:
                    picked.append(o)
            while len(picked) < lo and (set(opts) - set(picked)):
                picked.append(self.rng.choice(list(set(opts) - set(picked))))
            return picked[:hi]
        if qtype in ("open_short", "open_long"):
            if kind == "unaided_top_of_mind":
                p_focal = max(0.08, min(0.90, 0.40 + 0.22 * self.dim["awareness"]))
                return (self.rng.choice(TOM_FOCAL) if self.rng.random() < p_focal
                        else self.rng.choice(TOM_OTHER))
            if kind == "unaided_recall":
                names = []
                if self.rng.random() < max(0.15, min(0.95, 0.55 + 0.20 * self.dim["awareness"])):
                    names.append(self.rng.choice(TOM_FOCAL))
                names += self.rng.sample(TOM_OTHER, self.rng.randint(1, 3))
                self.rng.shuffle(names)
                return ", ".join(names)
            t = self.text(kind)
            return t
        return None


def build(questions, n, wave, campaign_lift, start_dt, seed):
    """Returns (completed responses, unfinished drafts)."""
    rng = random.Random(seed)
    responses, drafts = [], []
    for idx in range(n):
        p = Respondent(rng, wave, campaign_lift)
        answers = []
        for q in questions:
            v = p.answer_question(q)
            if v is None or (isinstance(v, list) and not v) or v == "":
                continue
            answers.append({"question_id": q["id"], "value": v})

        submitted = start_dt + timedelta(
            days=rng.randint(0, 26), hours=rng.randint(7, 22), minutes=rng.randint(0, 59)
        )
        iso = submitted.isoformat()

        # ~12% start and never finish. Those are drafts, not responses — the same
        # shape a real abandoned session leaves behind.
        if rng.random() < 0.12:
            cut = rng.randint(3, max(4, int(len(answers) * 0.6)))
            drafts.append({
                "id": str(uuid.uuid4()),
                "study_id": STUDY_ID,
                "share_token": SHARE_TOKEN,
                "answers": answers[:cut],
                "demographics": {},
                "section": min(3, cut // 10),
                "answered_count": cut,
                "created_at": iso,
                "updated_at": iso,
            })
            continue

        dur = int(rng.lognormvariate(6.2, 0.45))       # ~300-900s typical
        if p.speeder:
            dur = rng.randint(70, 160)
        responses.append({
            "id": str(uuid.uuid4()),
            "study_id": STUDY_ID,
            "respondent_id": None,
            "demographics": p.demographics,
            "answers": answers,
            "duration_sec": dur,
            "started_at": iso,
            "submitted_at": iso,
            "created_at": iso,
            "channel": "public_link",
            "simulated": True,
            "sim_archetype": p.archetype,
            "sim_wave": wave,
        })
    return responses, drafts


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    user = await db.users.find_one({"email": OWNER_EMAIL}, {"_id": 0, "id": 1})

    brand = BE.BrandSetup(name=BRAND, category="ชานมไข่มุก", competitors=COMPETITORS)
    ident = BE.IdentitySetup(traits=INTENDED, brand_promise="ชาไทยหอมมะลิสดใหม่ทุกแก้ว")
    questions = BE._generate_questions_from_template(brand, ident)

    study = {
        "id": STUDY_ID,
        "owner_id": (user or {}).get("id"),
        "owner_email": OWNER_EMAIL,
        "status": "collecting",
        "title": "DEMO · ชาไทยมะลิ (ข้อมูลจำลอง)",
        "brand": brand.model_dump(),
        "identity": ident.model_dump(),
        "segments_to_capture": ["age", "gender", "occupation"],
        "target_responses": 200,
        "questions": questions,
        "weights": {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25},
        "share_token": SHARE_TOKEN,
        "estimated_minutes": 12,
        "is_simulated": True,
        "simulated_note": "ข้อมูลชุดนี้เป็นข้อมูลจำลองสำหรับสาธิตและทดสอบระบบ ไม่ใช่ผลสำรวจจริง",
        "wave_history": [
            {"wave": 1, "published_at": WAVE_1.isoformat(), "by": "seed",
             "note": "baseline (ข้อมูลจำลอง)"},
            {"wave": 2, "published_at": WAVE_2.isoformat(), "by": "seed",
             "note": "หลังแคมเปญ (ข้อมูลจำลอง)"},
        ],
        "created_at": WAVE_1.isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "ai_cache": {},
    }

    await db.brand_studies.delete_one({"id": STUDY_ID})
    await db.brand_responses.delete_many({"study_id": STUDY_ID})
    await db.brand_response_drafts.delete_many({"study_id": STUDY_ID})
    await db.brand_studies.insert_one(dict(study))

    r1, d1 = build(questions, 105, 1, {}, WAVE_1, seed=7001)
    r2, d2 = build(questions, 105, 2,
                   {"overall": 0.28, "awareness": 0.55, "quality": 0.22,
                    "identity": 0.18, "loyalty": 0.10},
                   WAVE_2, seed=7002)
    await db.brand_responses.insert_many(r1 + r2)
    if d1 + d2:
        await db.brand_response_drafts.insert_many(d1 + d2)

    print(f"seeded {STUDY_ID}: {len(r1 + r2)} completed responses "
          f"({len(r1)} wave 1 / {len(r2)} wave 2), {len(d1 + d2)} unfinished drafts")

    # Report what the reliability card will now show.
    all_r = r1 + r2
    rel = BE._dimension_reliability(study, all_r)
    for dim, v in rel.items():
        print(f"  {dim:10s} alpha={v.get('alpha')} k={v.get('k_items')} "
              f"n_complete={v.get('n_complete')} {v.get('reason') or ''}")
    agg = BE._aggregate_responses(study, all_r, normalized={})
    print("  composite:", {k: v for k, v in (agg.get("composite") or {}).items()
                           if not k.startswith("_")})


asyncio.run(main())
