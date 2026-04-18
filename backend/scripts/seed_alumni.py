"""
Seed Alumni sample data from the product spec (alumni-spec/app/data.jsx).
Creates fake alumni users + their relations forming "สายตระกูล" chain.

Run: python -m scripts.seed_alumni  (from /app/backend)
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

# Ensure backend is importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# Chain from youngest → oldest based on data.jsx
# ME (student1 existing)  ← พี่ take (ฟ้า) ← ปู่ (ดิน) ← ทวด (แพร) ← เทียด (กันต์) ← เทียดทวด (อ.ศรีรัตน์)

SEED_USERS = [
    # (full_name, nickname, email, student_id, gen, role, position, company, hue)
    ("ฟ้า ชนัญญา", "ฟ้า", "fah61@g.swu.ac.th", "61131xxxxx", 61, "alumni",
     "Brand Manager, Hellmann's", "Unilever Thailand", 340),
    ("ดิน สิรวิชญ์", "ดิน", "din58@g.swu.ac.th", "58131xxxxx", 58, "alumni",
     "Head of Growth", "LINE MAN Wongnai", 190),
    ("แพร พัทธนันท์", "แพร", "prae55@g.swu.ac.th", "55131xxxxx", 55, "alumni",
     "Group Creative Director", "Ogilvy Bangkok", 20),
    ("กันต์ ศุภโชค", "กันต์", "kan51@g.swu.ac.th", "51131xxxxx", 51, "alumni",
     "VP, Regional Marketing", "Sea (Shopee)", 280),
    ("ศรีรัตน์ ธนิต", "พี่อิ๊ก", "sriratana47@g.swu.ac.th", "47131xxxxx", 47, "alumni",
     "Co-founder & CSO", "Studio Soi", 130),
    # Descendants
    ("ใบเตย ธัญพร", "ใบเตย", "baitoey66@g.swu.ac.th", "66131xxxxx", 66, "current_student",
     "กำลังศึกษา · ปี 2", None, 45),
    ("บาส ศุภกร", "บาส", "bas66@g.swu.ac.th", "66131xxxxy", 66, "current_student",
     "กำลังศึกษา · ปี 2", None, 220),
    ("มายด์ นภัสสร", "มายด์", "mind67@g.swu.ac.th", "67131xxxxx", 67, "current_student",
     "กำลังศึกษา · ปี 1", None, 300),
]

# Map student email → user_id after insert
async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    print(f"Connected to DB: {DB_NAME}")

    # Find student1 (existing user — ภูมิ)
    me = await db.users.find_one({"email": "student1@swu.ac.th"}, {"_id": 0})
    if not me:
        print("❌ student1@swu.ac.th not found. Please ensure seed users are created first.")
        return
    me_id = me["id"]
    print(f"Me (student1): {me_id}")

    # Ensure me has alumni profile
    me_alum = await db.alumni_users.find_one({"user_id": me_id})
    if not me_alum:
        now = datetime.now(timezone.utc).isoformat()
        await db.alumni_users.insert_one({
            "id": str(uuid.uuid4()),
            "user_id": me_id,
            "student_id": "64131xxxxx",
            "nickname": "ภูมิ",
            "gen": 64,
            "role": "current_student",
            "major": "การตลาด",
            "position": "นิสิตฝึกงาน @ Agoda",
            "company": None,
            "bio": "ชอบ consumer insight และ growth marketing — กำลังหาที่ฝึกงานต่อ ปลายปี",
            "avatar_hue": 210,
            "verified": True,
            "xp": 1240,
            "streak_days": 12,
            "invite_count": 8,
            "badges": ["tree_builder", "5_tier_club", "reviewer"],
            "privacy_settings": {
                "show_in_feed": True,
                "show_company_to_juniors": True,
                "allow_mystery_match": True,
                "allow_message_requests": True,
                "mask_student_id": True,
            },
            "last_active_at": now,
            "created_at": now,
            "updated_at": now,
        })
        print("✓ Created alumni profile for student1 (ภูมิ)")
    else:
        print("• student1 already has alumni profile")

    # Create seed users + alumni profiles
    user_id_by_email = {}
    for full_name, nickname, email, sid, gen, role, position, company, hue in SEED_USERS:
        existing = await db.users.find_one({"email": email}, {"_id": 0})
        if existing:
            uid = existing["id"]
        else:
            uid = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            # role maps: alumni → alumni, current_student → current_student
            auth_role = "alumni" if role == "alumni" else "current_student"
            await db.users.insert_one({
                "id": uid,
                "email": email,
                "password": pwd.hash("alumni123"),
                "full_name": full_name,
                "role": auth_role,
                "user_type": "regular",
                "auth_method": "email",
                "student_id": sid,
                "graduation_year": 2500 + (gen or 64) - 43,
                "bio": None,
                "avatar_url": None,
                "google_picture": None,
                "created_at": now,
                "updated_at": now,
            })
            print(f"+ Created user: {full_name} ({email})")
        user_id_by_email[email] = uid

        # Create alumni profile if not exist
        alum_exists = await db.alumni_users.find_one({"user_id": uid})
        if not alum_exists:
            now_iso = datetime.now(timezone.utc).isoformat()
            await db.alumni_users.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "student_id": sid,
                "nickname": nickname,
                "gen": gen,
                "role": role,
                "major": "การตลาด",
                "position": position,
                "company": company,
                "bio": None,
                "avatar_hue": hue,
                "verified": True,
                "xp": 500 + gen * 5,
                "streak_days": 3,
                "invite_count": 0,
                "badges": [],
                "privacy_settings": {
                    "show_in_feed": True,
                    "show_company_to_juniors": True,
                    "allow_mystery_match": True,
                    "allow_message_requests": True,
                    "mask_student_id": True,
                },
                "last_active_at": now_iso,
                "created_at": now_iso,
                "updated_at": now_iso,
            })

    # Build chain relations (confirmed takes):
    # ภูมิ(64) → ฟ้า(61) → ดิน(58) → แพร(55) → กันต์(51) → อ.ศรีรัตน์(47)
    chain = [
        (me_id, user_id_by_email["fah61@g.swu.ac.th"]),  # ภูมิ takes ฟ้า
        (user_id_by_email["fah61@g.swu.ac.th"], user_id_by_email["din58@g.swu.ac.th"]),  # ฟ้า takes ดิน
        (user_id_by_email["din58@g.swu.ac.th"], user_id_by_email["prae55@g.swu.ac.th"]),  # ดิน takes แพร
        (user_id_by_email["prae55@g.swu.ac.th"], user_id_by_email["kan51@g.swu.ac.th"]),  # แพร takes กันต์
        (user_id_by_email["kan51@g.swu.ac.th"], user_id_by_email["sriratana47@g.swu.ac.th"]),  # กันต์ takes อ.ศรีรัตน์
        # Descendants (น้อง take = they took me)
        (user_id_by_email["baitoey66@g.swu.ac.th"], me_id),  # ใบเตย takes ภูมิ
        (user_id_by_email["bas66@g.swu.ac.th"], me_id),  # บาส takes ภูมิ
        (user_id_by_email["mind67@g.swu.ac.th"], user_id_by_email["baitoey66@g.swu.ac.th"]),  # มายด์ takes ใบเตย (เหลน to ภูมิ)
    ]

    for from_uid, to_uid in chain:
        existing = await db.alumni_relations.find_one({
            "from_user_id": from_uid, "to_user_id": to_uid, "kind": "take"
        })
        if existing:
            continue
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.alumni_relations.insert_one({
            "id": str(uuid.uuid4()),
            "from_user_id": from_uid,
            "to_user_id": to_uid,
            "kind": "take",
            "status": "confirmed",
            "confirmed_by_from": True,
            "confirmed_by_to": True,
            "derived": False,
            "primary": True,
            "created_by": from_uid,
            "created_at": now_iso,
            "confirmed_at": now_iso,
        })
        print(f"+ Relation: {from_uid[:8]} → {to_uid[:8]}")

    # Stats
    total_users = await db.alumni_users.count_documents({})
    total_rels = await db.alumni_relations.count_documents({"status": "confirmed"})
    print(f"\n✓ Done. Alumni users: {total_users}, Confirmed relations: {total_rels}")

if __name__ == "__main__":
    asyncio.run(main())
