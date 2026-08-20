"""
Seed the classic UX teaching case: the glass ketchup bottle.

Runs the WHOLE chain through the real API, the same way a student would:
qualitative interviews -> extract candidates -> approve codebook v1 -> activate
-> publish -> quantitative responses (category ids + "อื่น ๆ" free text).
Nothing is hand-written into Mongo except the simulated responses themselves.

Run:  cd /app/backend && python scripts/seed_journey_ketchup.py
"""

import os
import sys
import uuid
import random
import asyncio
import requests
from datetime import datetime, timezone, timedelta

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

from dotenv import load_dotenv                       # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient   # noqa: E402
from lib.consent import new_respondent_token         # noqa: E402

load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"] if os.environ.get("REACT_APP_BACKEND_URL") \
    else "http://localhost:8001"
EMAIL, PASSWORD = "admin@swu.ac.th", "admin123"
SHARE = "demoketchup1"
N = 160
SEED = 20260820

STEP_LABELS = [
    "หยิบขวดซอสจากตู้เย็น/ชั้นวาง",
    "เปิดฝาและลอกซีล",
    "คว่ำขวดแล้วรอให้ซอสไหล",
    "เคาะก้นขวดหรือเคาะข้างขวด",
    "ใช้มีด/ช้อนแคะซอสออกมา",
    "ปิดฝาและเก็บขวดกลับที่เดิม",
]

# Eight informants, in their own words. This is the ONLY source of pain codes.
INTERVIEWS = [
    "คว่ำขวดแล้วรอเป็นนาที ซอสไม่ออกเลย รอนานมากจนเฟรนช์ฟรายเย็น สุดท้ายต้องเคาะก้นขวด",
    "เคาะแล้วมันออกมาทีเดียวเยอะเลย เลอะทั้งจานทั้งโต๊ะ ต้องเช็ดใหม่ หงุดหงิดมาก",
    "น้ำใส ๆ ออกมาก่อนซอส มันไหลไปทั่วขนมปัง รู้สึกว่าอาหารเสียรสไปเลย",
    "ตอนเหลือก้นขวดคือแคะไม่ออก ต้องเอามีดปาดเข้าไป เสียดายของ แต่ก็ทำอะไรไม่ได้",
    "ไม่รู้ว่าต้องเคาะตรงไหน เห็นคนบอกให้เคาะเลข 57 ข้างขวด แต่ไม่มั่นใจว่าจริงไหม งงมาก",
    "ขวดแก้วหนักและลื่น มือเปื้อนซอสแล้วจับไม่ค่อยอยู่ กลัวหลุดแตกตอนคว่ำ",
    "ปากขวดมีคราบซอสแห้งติดอยู่ ปิดฝาแล้วเหนียวมือ ดูไม่สะอาด ไม่อยากเอาเข้าตู้เย็นเลย",
    "เวลาแขกมาบ้านต้องเอาช้อนตักใส่ถ้วยให้ก่อน เพราะปล่อยให้เขาเคาะขวดเองมันดูไม่ดี เสียเวลาเพิ่ม",
]

# Each approved code, with the step(s) it belongs to and the quote that earned it.
CODES = [
    ("ซอสไม่ไหลออกมา ต้องรอนาน", "time",
     "ผู้ตอบต้องรอโดยที่ซอสยังไม่ออกจากขวด นับเฉพาะกรณีที่รอแล้วยังไม่ได้ซอส",
     ["s3"], [0]),
    ("ต้องเคาะหรือเขย่าขวดเอง", "process",
     "ต้องออกแรงเคาะ เขย่า หรือกระแทกขวดเพื่อให้ซอสออก", ["s4"], [0, 4]),
    ("ซอสออกมาทีเดียวมากเกินไปจนเลอะ", "functional",
     "ซอสพุ่งหรือทะลักออกมามากกว่าที่ต้องการ ทำให้เลอะจาน โต๊ะ หรือมือ", ["s3", "s4"], [1]),
    ("น้ำใสไหลออกมาก่อนเนื้อซอส", "functional",
     "ของเหลวใสแยกชั้นไหลออกมาก่อน ทำให้อาหารแฉะหรือรสเปลี่ยน", ["s3"], [2]),
    ("ซอสก้นขวดเอาออกไม่ได้ ต้องแคะ", "process",
     "ซอสค้างที่ก้นขวดหรือคอขวด ต้องใช้อุปกรณ์ช่วยแคะหรือปาด", ["s5"], [3]),
    ("ไม่รู้ว่าต้องทำอย่างไรให้ซอสออก", "information",
     "ไม่มั่นใจวิธีที่ถูกต้อง เช่น ต้องเคาะตรงไหน หรือคว่ำนานแค่ไหน", ["s3", "s4"], [4]),
    ("ขวดหนัก ลื่น กลัวหลุดหรือแตก", "access",
     "จับขวดไม่ถนัด ลื่นเมื่อมือเปื้อน หรือกังวลว่าขวดแก้วจะแตก", ["s1", "s3"], [5]),
    ("คราบซอสที่ปากขวดเหนียวมือและดูไม่สะอาด", "service",
     "มีคราบซอสค้างที่ปากขวดหรือฝา ทำให้เปื้อนมือหรือรู้สึกไม่สะอาด", ["s2", "s6"], [6]),
    ("รู้สึกเสียหน้าหรืออึดอัดเวลาใช้ต่อหน้าคนอื่น", "emotional",
     "รู้สึกอาย หงุดหงิด หรือต้องเตรียมล่วงหน้าเพราะการใช้ขวดดูไม่เรียบร้อย", ["s4", "s5"], [7]),
]

CHANNELS = {
    "s1": ["ที่บ้าน/ครัวของตัวเอง"],
    "s2": ["ที่บ้าน/ครัวของตัวเอง"],
    "s3": ["ที่บ้าน/ครัวของตัวเอง", "ร้านอาหาร/โต๊ะอาหารนอกบ้าน"],
    "s4": ["ที่บ้าน/ครัวของตัวเอง", "ร้านอาหาร/โต๊ะอาหารนอกบ้าน", "คนอื่นทำให้/พนักงานช่วย"],
    "s5": ["ที่บ้าน/ครัวของตัวเอง", "คนอื่นทำให้/พนักงานช่วย"],
    "s6": ["ที่บ้าน/ครัวของตัวเอง"],
}
CHANNEL_TYPES = {"ที่บ้าน/ครัวของตัวเอง": "physical",
                 "ร้านอาหาร/โต๊ะอาหารนอกบ้าน": "physical",
                 "คนอื่นทำให้/พนักงานช่วย": "human"}
CHANNEL_MODES = {"ที่บ้าน/ครัวของตัวเอง": "one_to_one",
                 "ร้านอาหาร/โต๊ะอาหารนอกบ้าน": "one_to_many",
                 "คนอื่นทำให้/พนักงานช่วย": "one_to_one"}

# The teaching point: step 4 (tapping) and step 5 (scraping) are the painful ones.
DIFF = {"s1": 1.5, "s2": 2.0, "s3": 3.6, "s4": 4.2, "s5": 4.4, "s6": 2.4}
ANX = {"s1": 1.4, "s2": 1.6, "s3": 3.2, "s4": 3.6, "s5": 3.3, "s6": 2.0}
OTHER_TEXTS = [
    "ฝาขวดแข็งมาก เปิดครั้งแรกแทบไม่ออก",
    "ซอสเปลี่ยนสีคล้ำที่ปากขวดเวลาเก็บไว้นาน",
    "ขวดใหญ่เกินไป ไม่มีที่เก็บในตู้เย็น",
]


def api(method, path, token=None, **kw):
    h = {"Authorization": f"Bearer {token}"} if token else {}
    r = requests.request(method, f"{API}/api{path}", headers=h, timeout=120, **kw)
    if r.status_code >= 400:
        raise SystemExit(f"{method} {path} -> {r.status_code} {r.text[:400]}")
    return r.json()


def build_study(token):
    study = api("POST", "/journey/studies", token, json={
        "title": "DEMO · UX ซอสมะเขือเทศขวดแก้ว (ข้อมูลจำลอง)",
        "template_key": "retail_product",
        "sampling_frame": ("ผู้ที่ใช้ซอสมะเขือเทศขวดแก้วที่บ้านหรือที่ร้านอาหาร "
                           "ภายใน 30 วันล่าสุด เก็บผ่านลิงก์ในกลุ่มทำอาหารออนไลน์"),
        "recall_window_days": 30,
        "target_responses": 160,
        "subject": {"name": "ซอสมะเขือเทศขวดแก้ว", "category": "ซอสมะเขือเทศ"},
    })
    sid = study["id"]
    api("PUT", f"/journey/studies/{sid}", token, json={"state_labels": STEP_LABELS})
    api("PUT", f"/journey/studies/{sid}", token, json={
        "channel_options": list(CHANNEL_TYPES.keys()),
        "ask_channel_per_step": True,
        "channel_types": CHANNEL_TYPES,
        "channel_modes": CHANNEL_MODES,
    })
    api("PUT", f"/journey/studies/{sid}", token, json={
        "state_meta": [{"id": "s1", "stage_id": "pre"}, {"id": "s2", "stage_id": "pre"},
                       {"id": "s3", "stage_id": "purchase"}, {"id": "s4", "stage_id": "purchase"},
                       {"id": "s5", "stage_id": "purchase"}, {"id": "s6", "stage_id": "post"}]})
    return sid


def build_codebook(token, sid):
    """Extract from the interviews, then approve exactly what the quotes support."""
    api("POST", f"/journey/studies/{sid}/codebook/extract", token,
        json={"interviews": INTERVIEWS})

    cats = []
    for i, (label, ptype, definition, states, quote_idx) in enumerate(CODES, start=1):
        cats.append({
            "id": f"pc{i}",
            "label_th": label,
            "definition_th": definition,
            "pain_type": ptype,
            "state_ids": states,
            "applies_to": "states",
            "status": "approved",
            "origin": "qualitative",
            "approved_by": "seed-script",
            "approved_at": datetime.now(timezone.utc).isoformat(),
            "provenance": {
                "origin": "qualitative",
                "interview_indices": quote_idx,
                "quotes": [{"text": INTERVIEWS[q], "source_ref": f"สัมภาษณ์ที่ {q + 1}"}
                           for q in quote_idx],
            },
        })

    api("PUT", f"/journey/studies/{sid}/codebook", token, json={
        "source": {
            "n_interviews": len(INTERVIEWS),
            "collection_method_th": ("สัมภาษณ์เชิงลึกผู้ใช้ซอสมะเขือเทศขวดแก้ว 8 คน "
                               "ที่บ้านและที่ร้านอาหาร ลงรหัสแบบ open coding "
                               "แล้วรวมเป็นหมวดโดยผู้วิจัย (ข้อมูลจำลองเพื่อการสอน)"),
            "journey_style": "task_based",
        },
        "pain_categories": cats,
    })
    return api("POST", f"/journey/studies/{sid}/codebook/activate", token, json={})


async def seed_responses(sid, share_token, cat_ids):
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    study = await db.journey_studies.find_one({"id": sid}, {"_id": 0})
    rnd = random.Random(SEED)
    ids = [s["id"] for s in study["states"]]
    segs = {q["id"]: q["options"] for q in study["segment_questions"]}
    docs = []

    for k in range(N):
        # Everyone starts the bottle; the tapping/scraping loop is where it hurts.
        path = ["s1", "s2", "s3"]
        if rnd.random() < 0.82:
            path.append("s4")
            if rnd.random() < 0.34:
                path.append("s4")                    # tap again
            if rnd.random() < 0.30:
                path.append("s3")                    # back to waiting
        if rnd.random() < 0.36:
            path.append("s5")
        if rnd.random() < 0.88:
            path.append("s6")
        path = path[:10]

        terminal, outcome = ("CONV", "convert") if rnd.random() < 0.87 else (
            ("ABANDON", "abandon") if rnd.random() < 0.6 else ("UNKNOWN", "ongoing"))
        uniq = list(dict.fromkeys(path))

        experience = {}
        for s in uniq:
            d = max(1, min(5, round(rnd.gauss(DIFF[s], 0.85))))
            a = max(1, min(5, round(rnd.gauss(ANX[s], 0.9))))
            chans = [c for c in CHANNELS[s] if rnd.random() < 0.30] or [CHANNELS[s][0]]
            experience[s] = {"difficulty_1_5": float(d), "anxiety_1_5": float(a),
                             "emotion": float(rnd.choice([-1, 0]) if d >= 4 else rnd.choice([-1, 0, 1])),
                             "channels": chans, "channel": chans[0]}

        nominated = [s for s in uniq if experience[s]["difficulty_1_5"] >= 4
                     and rnd.random() < 0.75][:2]
        pain = {"nominated": nominated}
        for s in nominated:
            avail = cat_ids.get(s) or []
            picked = rnd.sample(avail, k=min(len(avail), rnd.randint(1, 2))) if avail else []
            row = {"severity_0_10": float(rnd.randint(5, 10)), "category_ids": picked,
                   "categories": []}
            if rnd.random() < 0.09:
                row["other_text"] = rnd.choice(OTHER_TEXTS)
            pain[s] = row

        submitted = (datetime.now(timezone.utc) - timedelta(days=rnd.randint(0, 25))).isoformat()
        docs.append({
            "id": f"{sid}-r{k:04d}",
            "study_id": sid,
            "respondent_token": new_respondent_token(),
            "structure_hash": study["structure_hash"],
            "content_revision": study.get("content_revision", 1),
            "codebook_version": int(study.get("codebook_version") or 1),
            "consent": {"participation": True, "recontact": False, "linkage": False,
                        "at": submitted, "version": study["consent"]["version"]},
            "episode": {"recency_band": rnd.choice(["le_7", "d8_30"])},
            "subject_choice": "ซอสมะเขือเทศขวดแก้ว",
            "visited": uniq, "late_additions": [],
            "path": [{"state_id": s, "order": i} for i, s in enumerate(path)],
            "path_raw": [{"state_id": s, "order": i} for i, s in enumerate(path)],
            "replay_edited": rnd.random() < 0.25, "edit_ops": [],
            "terminal": terminal, "terminated_by": "outcome", "outcome": outcome,
            "experience": experience, "pain": pain,
            "overall_sat_0_10": float(rnd.randint(3, 9)),
            "demographics": {k2: rnd.choice(v) for k2, v in segs.items()},
            "mask_violations": [],
            "quality": {"duration_sec": float(max(140, rnd.gauss(360, 90))),
                        "page_times_ms": {}, "option_positions": {},
                        "rng_seed": rnd.randint(1, 10 ** 9),
                        "trap_shown": True, "trap_hit": rnd.random() < 0.04,
                        "backnav_count": rnd.randint(0, 2),
                        "other_selected": rnd.random() < 0.05,
                        "longstring": rnd.randint(1, 3), "irv": round(rnd.uniform(0.5, 1.4), 2),
                        "scored_rows": len(experience) * 2 + 6,
                        "difficulty_rows": len(experience)},
            "channel": "public_link",
            "started_at": submitted, "submitted_at": submitted,
        })

    await db.journey_responses.delete_many({"study_id": sid})
    await db.journey_responses.insert_many(docs)
    await db.journey_studies.update_one({"id": sid}, {"$set": {
        "share_token": share_token, "is_simulated": True,
        "link_starts": int(N / 0.58)}})
    await db.journey_analysis_cache.delete_many({"study_id": sid})
    client.close()
    return len(docs)


async def wipe_previous():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    old = await db.journey_studies.find({"title": {"$regex": "ซอสมะเขือเทศขวดแก้ว"}},
                                        {"_id": 0, "id": 1}).to_list(20)
    for o in old:
        await db.journey_studies.delete_one({"id": o["id"]})
        await db.journey_responses.delete_many({"study_id": o["id"]})
        await db.journey_codebooks.delete_many({"study_id": o["id"]})
        await db.journey_analysis_cache.delete_many({"study_id": o["id"]})
    client.close()
    return len(old)


def main():
    removed = asyncio.run(wipe_previous())
    token = requests.post(f"{API}/api/auth/login",
                          json={"email": EMAIL, "password": PASSWORD},
                          timeout=60).json()["access_token"]
    sid = build_study(token)
    act = build_codebook(token, sid)
    api("POST", f"/journey/studies/{sid}/lock-instrument", token, json={})
    study = api("GET", f"/journey/studies/{sid}", token)
    n = asyncio.run(seed_responses(sid, SHARE, study.get("pain_category_ids") or {}))
    print(f"removed {removed} old · study {sid}")
    print(f"codebook v{act['codebook']['version']} · "
          f"{len(act['codebook']['pain_categories'])} รหัสปัญหา · "
          f"saturation {act['codebook'].get('saturation', {}).get('verdict')}")
    print(f"seeded {n} responses · public link /journey/r/{SHARE}")
    print(f"dashboard /market-research/customer-journey/quant/{sid}")


if __name__ == "__main__":
    main()
