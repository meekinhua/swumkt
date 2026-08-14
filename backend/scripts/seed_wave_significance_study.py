"""Seed a two-wave Brand Equity study for wave-significance QA.

Creates ZZ_WaveSigTest with 45 responses in April (baseline) and 45 in June with
every rating item shifted up ~1 point, so the wave comparison has something real
to detect. Run: python scripts/seed_wave_significance_study.py
"""
import asyncio
import os
import random
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv
load_dotenv("/app/backend/.env")
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from routes import brand_equity as BE  # noqa: E402

STUDY_ID = "zz-wavesig-0001"
OWNER_EMAIL = "admin@swu.ac.th"


def build_responses(questions, n, shift, iso, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        answers = []
        for q in questions:
            t = q["type"]
            if t in ("likert_5", "likert_7"):
                top = 5 if t == "likert_5" else 7
                answers.append({"question_id": q["id"],
                                "value": min(top, max(1, round(rng.gauss(top / 2 + shift, 0.9))))})
            elif t == "nps_0_10":
                answers.append({"question_id": q["id"],
                                "value": min(10, max(0, round(rng.gauss(6 + shift, 1.3))))})
            elif t == "comparative_7":
                answers.append({"question_id": q["id"],
                                "value": min(7, max(1, round(rng.gauss(4 - shift, 1.0))))})
            elif t == "mcq_single" and q.get("options"):
                answers.append({"question_id": q["id"], "value": rng.choice(q["options"])})
            elif t == "mcq_multi" and q.get("options"):
                answers.append({"question_id": q["id"],
                                "value": rng.sample(q["options"], min(2, len(q["options"])))})
            elif t == "trait_grid" and q.get("options"):
                answers.append({"question_id": q["id"],
                                "value": rng.sample(q["options"], min(3, len(q["options"])))})
        out.append({
            "id": str(uuid.uuid4()),
            "study_id": STUDY_ID,
            "answers": answers,
            "demographics": {"age": rng.choice(["18-24", "25-34", "35-44"]),
                             "gender": rng.choice(["ชาย", "หญิง"])},
            "duration_sec": rng.randint(200, 900),
            "submitted_at": iso,
            "created_at": iso,
        })
    return out


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    user = await db.users.find_one({"email": OWNER_EMAIL}, {"_id": 0, "id": 1})
    brand = BE.BrandSetup(name="ZZ_WaveSigTest", category="ชานมไข่มุก",
                          competitors=["BrandA", "BrandB"])
    ident = BE.IdentitySetup(traits=["สดชื่น", "ทันสมัย", "คุ้มค่า"],
                             brand_promise="ชานมสดใหม่ทุกแก้ว")
    questions = BE._generate_questions_from_template(brand, ident)

    w1 = "2026-04-01T09:00:00+00:00"
    w2 = "2026-06-01T09:00:00+00:00"
    study = {
        "id": STUDY_ID,
        "owner_id": (user or {}).get("id"),
        "owner_email": OWNER_EMAIL,
        "status": "collecting",
        "brand": brand.dict(),
        "identity": ident.dict(),
        "segments_to_capture": ["age", "gender"],
        "target_responses": 100,
        "questions": questions,
        "weights": {"awareness": 25, "quality": 25, "identity": 25, "loyalty": 25},
        "share_token": "zzwavesig01",
        "estimated_minutes": 12,
        "wave_history": [
            {"wave": 1, "published_at": w1, "by": "seed", "note": "baseline wave"},
            {"wave": 2, "published_at": w2, "by": "seed", "note": "post-campaign wave"},
        ],
        "created_at": w1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "ai_cache": {},
    }

    await db.brand_studies.delete_one({"id": STUDY_ID})
    await db.brand_responses.delete_many({"study_id": STUDY_ID})
    await db.brand_studies.insert_one(dict(study))
    rows = (build_responses(questions, 45, 0.0, "2026-04-10T10:00:00+00:00", 101)
            + build_responses(questions, 45, 1.1, "2026-06-10T10:00:00+00:00", 202))
    await db.brand_responses.insert_many(rows)
    print(f"seeded {STUDY_ID} with {len(rows)} responses (share token zzwavesig01)")


asyncio.run(main())
