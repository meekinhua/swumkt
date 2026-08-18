"""
Seed a realistic quantitative Customer Journey study so the Phase 1 dashboard has
something honest to render. Simulated data, flagged as such on the study.

Run:  cd /app/backend && python scripts/seed_journey_demo.py
"""

import os
import sys
import random
import asyncio
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv                       # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient   # noqa: E402

from routes import journey_instrument as ji          # noqa: E402
from lib.consent import default_consent, new_respondent_token  # noqa: E402

load_dotenv("/app/backend/.env")

STUDY_ID = "demo-journey-kafae-001"
SHARE_TOKEN = "demojourney1"
OWNER_EMAIL = "admin@swu.ac.th"
N = 140
SEED = 20260818

STEPS = [
    ("เห็นร้านหรือรีวิวในโซเชียล", "pre", "social"),
    ("ดูเมนูและราคา", "pre", "customer"),
    ("อ่านรีวิวและถามเพื่อน", "pre", "social"),
    ("เดินทางไปร้าน/กดสั่งเดลิเวอรี", "purchase", "customer"),
    ("สั่งและชำระเงิน", "purchase", "brand"),
    ("รับเครื่องดื่มและดื่ม", "post", "brand"),
]

# Per-step difficulty centre (1-5) — step 4 is the painful one on purpose.
DIFF = {"s1": 1.8, "s2": 2.2, "s3": 2.6, "s4": 3.9, "s5": 2.9, "s6": 2.1}


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    rnd = random.Random(SEED)

    owner = await db.users.find_one({"email": OWNER_EMAIL}, {"_id": 0, "id": 1})
    if not owner:
        print(f"owner {OWNER_EMAIL} not found"); return

    states = [{"id": f"s{i+1}", "stage_id": stage, "label_th": label, "owner": owner_tag,
               "substitutability": "assistable", "feasibility": "unknown",
               "planned_next_state_id": None}
              for i, (label, stage, owner_tag) in enumerate(STEPS)]

    study = {
        "id": STUDY_ID,
        "owner_id": owner["id"],
        "owner_email": OWNER_EMAIL,
        "title": "DEMO · เส้นทางลูกค้าร้านกาแฟ (ข้อมูลจำลอง)",
        "status": "collecting",
        "is_simulated": True,
        "analysis_level": "product",
        "subject": {"name": "ร้านกาแฟตัวอย่าง", "category": "กาแฟ", "is_competitor": False,
                    "competitors": []},
        "sampling_frame": "นิสิตและบุคลากรที่ซื้อกาแฟในรัศมี 2 กม. จากมหาวิทยาลัย ภายใน 90 วัน",
        "recall_window_days": 90,
        "target_responses": 150,
        "stages": ji.DEFAULT_STAGES,
        "states": states,
        "absorbing": ji.default_absorbing("product"),
        "expected_transitions": ji.default_expected_transitions(states),
        "pain_options": ji.default_pain_options(states),
        "segment_questions": ji.build_segment_questions(),
        "consent": default_consent("นิสิตปริญญาโท", "อาจารย์ที่ปรึกษา", "swumkt@swu.ac.th"),
        "content_revision": 1,
        "content_revision_log": [],
        "share_token": SHARE_TOKEN,
        "link_starts": int(N / 0.58),
        "quality_reference": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    study["structure_hash"] = ji.compute_structure_hash(study)

    await db.journey_studies.delete_one({"id": STUDY_ID})
    await db.journey_responses.delete_many({"study_id": STUDY_ID})
    await db.journey_analysis_cache.delete_many({"study_id": STUDY_ID})
    await db.journey_studies.insert_one(study)

    ids = [s["id"] for s in states]
    segs = {q["id"]: q["options"] for q in study["segment_questions"]}
    docs = []
    for k in range(N):
        # Route: mostly forward, with rework at s4 and some drop-off.
        path, cur = [], 0
        while cur < len(ids) and len(path) < 10:
            path.append(ids[cur])
            if ids[cur] == "s4" and rnd.random() < 0.30:
                path.append("s4")                       # rework loop
            if rnd.random() < (0.30 if ids[cur] == "s4" else 0.10):
                break
            cur += 1
        reached_end = path and path[-1] in ("s5", "s6")
        roll = rnd.random()
        if reached_end and roll < 0.80:
            terminal, outcome = "CONV", "convert"
        elif roll < 0.90:
            terminal, outcome = "ABANDON", "abandon"
        else:
            terminal, outcome = "UNKNOWN", ("ongoing" if rnd.random() < 0.5 else None)

        uniq = list(dict.fromkeys(path))
        experience = {}
        for sid in uniq:
            d = max(1, min(5, round(rnd.gauss(DIFF[sid], 0.9))))
            experience[sid] = {"difficulty_1_5": float(d),
                               "emotion": float(rnd.choice([-1, 0, 0, 1]) if d < 4 else -1)}
        nominated = [sid for sid in uniq if experience[sid]["difficulty_1_5"] >= 4
                     and rnd.random() < 0.7][:2]
        pain = {"nominated": nominated}
        for sid in nominated:
            pain[sid] = {"severity_0_10": float(rnd.randint(5, 10)),
                         "categories": rnd.sample(ji.DEFAULT_PAIN_OPTIONS, k=rnd.randint(1, 2))}

        submitted = (datetime.now(timezone.utc) - timedelta(days=rnd.randint(0, 40))).isoformat()
        docs.append({
            "id": f"{STUDY_ID}-r{k:04d}",
            "study_id": STUDY_ID,
            "respondent_token": new_respondent_token(),
            "structure_hash": study["structure_hash"],
            "content_revision": 1,
            "consent": {"participation": True, "recontact": False, "linkage": False,
                        "at": submitted, "version": study["consent"]["version"]},
            "episode": {"recency_band": rnd.choice(["le_7", "d8_30", "m1_3"])},
            "subject_choice": "ร้านกาแฟตัวอย่าง",
            "visited": uniq,
            "late_additions": [],
            "path": [{"state_id": s, "order": i} for i, s in enumerate(path)],
            "path_raw": [{"state_id": s, "order": i} for i, s in enumerate(path)],
            "replay_edited": rnd.random() < 0.28,
            "edit_ops": [],
            "terminal": terminal,
            "terminated_by": "outcome" if terminal != "UNKNOWN" else "unsure",
            "outcome": outcome,
            "experience": experience,
            "pain": pain,
            "overall_sat_0_10": float(rnd.randint(4, 10)),
            "demographics": {k2: rnd.choice(v) for k2, v in segs.items()},
            "mask_violations": [],
            "quality": {"duration_sec": float(max(120, rnd.gauss(330, 90))),
                        "page_times_ms": {}, "option_positions": {},
                        "rng_seed": rnd.randint(1, 10**9),
                        "trap_shown": True, "trap_hit": rnd.random() < 0.05,
                        "backnav_count": rnd.randint(0, 2),
                        "other_selected": rnd.random() < 0.05,
                        "longstring": rnd.randint(1, 3),
                        "irv": round(rnd.uniform(0.5, 1.4), 2),
                        "scored_rows": len(experience) + 6,
                        "difficulty_rows": len(experience)},
            "channel": "public_link",
            "started_at": submitted,
            "submitted_at": submitted,
        })

    await db.journey_responses.insert_many(docs)
    print(f"seeded {len(docs)} responses for {STUDY_ID} (share token {SHARE_TOKEN})")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
