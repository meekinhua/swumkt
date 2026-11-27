# แผน Deploy โปรเจกต์ย่อย `/dorm` (หาห้อง·หาเมท มศว) ไม่ให้ตีกับเว็บหลัก `swumkt.org`

> **สถานะ Git:** แยกโค้ดทั้งหมดขึ้น branch **`dorm`** (`origin/dorm`) เรียบร้อย — ไม่แตะ `main` และ `meekintubeDone` จนกว่าคุณจะสั่ง deploy

---

## 1. โครงสร้างแยกส่วน (Zero-Conflict Isolation Matrix)

ระบบ `/dorm` ถูกออกแบบให้เป็น **Isolated Sub-module** แทบจะ 100% จึงไม่รบกวนฟีเจอร์เดิมของ `swumkt.org` (CMS, Conjoint, Brand Equity, CJM, Alumni, meekinTube):

| ชั้นระบบ | แยกขาดอย่างไร | ไฟล์หลักที่แตะ (5 ไฟล์เท่านั้น) |
| --- | --- | --- |
| **Backend Routes & Data** | แยก router `/api/dorm/*` ใน `backend/routes/dorm.py`, `dorm_agent.py` + seed JSON ใน `backend/data/dorm_*.json` | `backend/server.py` (+5 บรรทัด: `include_router` ตัวเดียว) |
| **Auth & API Keys** | ใช้ `get_current_user` เดิมร่วมกันได้ ไม่แตะ `/api/auth/*`; Scoped API key แยก wildcard **`dorm.*`** ออกจาก `cms.*` และมี `HARD_DENY` บล็อกคีย์ข้ามแดน | `backend/lib/api_keys.py`, `backend/tests/test_api_keys.py` |
| **MongoDB** | Collection ใหม่ทั้งหมดขึ้นต้นด้วย `dorm_*` (`dorm_listings`, `dorm_buildings`, `dorm_mates`, `dorm_reviews`, `dorm_reports`, `dorm_interests`, `dorm_peeks`, `dorm_gone_signals`, `dorm_threads`, `dorm_messages`, `dorm_photos`, `dorm_verifications`, `dorm_admin_proposals`, `dorm_agent_actions`, `dorm_events`) + index/seed **สร้างอัตโนมัติ (lazy idempotent)** เมื่อมี request แรกเข้า `/api/dorm/*` ไม่มี migration ที่ไปยุ่ง collection เดิม | — |
| **Frontend & CSS** | โค้ดหน้าเว็บทั้งหมดอยู่ใน `frontend/src/pages/dorm/` แบบ `lazy()` + รูปใน `frontend/public/dorm/`, สไตล์ทั้งหมดจำกัดใน `.dorm-root` / `.dorm-portal` (ไม่ล้นไปเปลี่ยนธีมเว็บหลัก) | `frontend/src/App.js` (`Route path="/dorm"`), `frontend/public/index.html` (สคริปต์ 1 บรรทัดเปลี่ยน `<title>` เฉพาะ path `/dorm*`) |

---

## 2. เปรียบเทียบ 2 แนวทางการ Deploy บน Emergent

### แนวทางที่ 1 (แนะนำตอนนี้): Sub-module บนโปรเจกต์ Emergent เดิม + Cloudflare Redirect
*สอดคล้องกับการตั้งค่า Cloudflare Redirect `https://roommate.swumkt.org/` → `https://swumkt.org/dorm/` ที่ตั้งและทดสอบใช้งานได้จริงแล้ว*

- **ข้อดี:**
  - ไม่เสียโควต้า/ค่าโฮสต์ Emergent เพิ่ม (ใช้เซิร์ฟเวอร์เดิม)
  - แชร์บัญชีผู้ใช้และ Google Login มศว เดิมได้ทันที **ไม่ต้องแก้ Google OAuth Authorized Origins หรือ CORS**
  - พิมพ์ **`https://roommate.swumkt.org/`** หรือ **`https://roommate.swumkt.org/?src=poster-tuek14`** แล้วเด้งเข้า `/dorm` พร้อมเก็บยอดสแกน QR ครบถ้วน
- **เหมาะกับ:** เปิดใช้งานจริงทันทีในช่วงเริ่มต้นและขยายผู้ใช้งานรอบ มศว

---

### แนวทางที่ 2 (เมื่อต้องขยายแยกตัวในอนาคต): Standalone Emergent Sub-Project
*ใช้เมื่อต้องการแยกเซิร์ฟเวอร์อิสระ ปรับรอบ deploy แยกจากเว็บหลัก หรืออยากให้ช่อง URL ด้านบนแสดงเป็น `https://roommate.swumkt.org/` ตลอดโดยไม่ Redirect*

1. สร้างโปรเจกต์ใหม่บน Emergent ผูกจาก repo เดียวกันแต่เลือก branch **`dorm`** (หรือแยก build เฉพาะ `/dorm`)
2. ตั้งค่า env บนโปรเจกต์ใหม่:
   - `DB_NAME=swudorm_prod` (แยกฐานข้อมูลจากเว็บหลัก) หรือใช้ DB เดิมถ้าตั้งใจแชร์บัญชี `users`
   - `DORM_SITE_ORIGIN=https://roommate.swumkt.org`
   - `CORS_ORIGINS=https://roommate.swumkt.org`
3. เพิ่ม `window.location.hostname === 'roommate.swumkt.org'` ใน `frontend/src/App.js` ให้ path `/` เปิดเข้า `<DormHomePage />` โดยตรง
4. ใน **Google Cloud Console** เพิ่ม `https://roommate.swumkt.org` ใน *Authorized JavaScript origins*
5. ใน **Cloudflare Dashboard**: ปิด Redirect Rule `roommate to dorm`, ลบ record `AAAA 100::` เดิม, แล้วใส่ **CNAME / A Record** ตามที่หน้า **Preview → Manage → Domain** ของ Emergent แจ้ง (ตั้งเป็น **DNS only / เมฆสีเทา** ช่วง Verify SSL)

---

## 3. Runbook ขั้นตอน Deploy แนวทางที่ 1 บน Emergent (ทีละขั้น + Rollback < 1 นาที)

### ขั้นที่ 1 — เตรียม Environment Variables (ใน Emergent Project Settings)
| ตัวแปร | ค่าที่แนะนำ | หมายเหตุ |
| --- | --- | --- |
| `DORM_SITE_ORIGIN` | `https://swumkt.org` | ใช้สร้างลิงก์แชร์ OG (`/api/dorm/og/rooms/{id}`) ให้ LINE/FB ดึงรูปสวยตรงโดเมนจริง |
| `CORS_ORIGINS` | `*` หรือใส่เพิ่ม `https://swumkt.org,https://roommate.swumkt.org` | ถ้าเว็บหลักตั้งเป็น `*` อยู่แล้วไม่ต้องแก้ |
| `DORM_SMTP_HOST` / `USER` / `PASS` *(ถ้าต้องการ)* | เช่น SMTP ของระบบ | สำหรับส่งรหัส OTP ยืนยัน `@g.swu.ac.th` อัตโนมัติ (ถ้ายังไม่ตั้ง ยังใช้ปุ่มยืนยัน Google มศว และคำขอให้แอดมินตรวจแทนได้) |

### ขั้นที่ 2 — สำรองฐานข้อมูลก่อนปล่อย (แนะนำ)
```bash
mongodump --uri="$MONGO_URL" --db="$DB_NAME" --out=/tmp/backup-before-dorm-$(date +%F)
```
*(หากฐานข้อมูลอยู่ใน Cluster ภายนอกที่ตั้ง snapshot อัตโนมัติไว้แล้ว ขั้นนี้เป็นตัวเสริมความปลอดภัย)*

### ขั้นที่ 3 — ดึง Branch `dorm` และ Build + Restart
```bash
git fetch origin
git merge --no-ff origin/dorm   # หรือดึง/deploy จาก branch dorm บน Emergent
```
1. Build frontend (`CI=true yarn build` — ใช้ Node memory ปกติ, ESLint strict mode ของโปรเจกต์รองรับครบแล้ว)
2. Restart backend (`uvicorn` / Emergent Deploy)
3. ทันทีที่ request แรกเข้า `/api/dorm/stats`:
   - สร้าง index ทุก collection `dorm_*` อัตโนมัติ
   - Seed ตึก/หอทั้งหมด **36 แห่ง** จาก `backend/data/dorm_buildings_seed.json` (idempotent: ไม่ทับค่าที่แอดมินแก้)
   - Import ห้องว่างภายนอก **101 ห้อง** จาก `backend/data/dorm_external_listings.json` (มีผล 21 วันนับจาก `seen_at`)

### ขั้นที่ 4 — Smoke Test หลัง Deploy (ทำทั้ง `/dorm` และเว็บหลัก)
- **ฝั่ง `/dorm` และ Subdomain:**
  1. เปิด `https://roommate.swumkt.org/` → ต้องเด้งมาที่ `https://swumkt.org/dorm/` โหลดหน้า “หาห้อง หาเมท มศว” และขึ้น “ห้องแนะนำ” คละครบ 4 เกรดราคา (8 การ์ด, รูปโหลดครบทุกใบ)
  2. เปิด `https://roommate.swumkt.org/?src=smoke-deploy` → ล็อกอินแอดมินเข้า `https://swumkt.org/dorm/admin` ต้องเห็นยอด QR `smoke-deploy` นับขึ้น + ตารางประกาศ 101 ห้อง + 36 ตึก
  3. ทดสอบเปิดลิงก์แชร์ `https://swumkt.org/api/dorm/og/rooms/<id>` (ดู HTML ว่ามี `og:title`, `og:image`, และราคาตรง)
  4. ทดสอบกดหัวใจ ♥ (`เล็งอยู่`) แบบไม่ล็อกอิน → ขึ้นแท็ก `เล็งอยู่` และโหลดหลังรีเฟรชหน้าได้
- **ฝั่งเว็บหลัก `swumkt.org` (เช็กว่าไม่กระทบ):**
  5. เปิดหน้าแรก `https://swumkt.org/` → แสดงเว็บหลักตามปกติ สไตล์ไม่เพี้ยน
  6. ล็อกอินและเปิดเครื่องมือหลักสัก 1–2 ตัว (เช่น `/projects` หรือ `/cms` / `/faculty`) → ทำงานปกติ

### ขั้นที่ 5 — เปิดใช้ External Agent หลังบ้าน (ไม่บังคับ แต่ช่วยลดงานแอดมิน)
1. ล็อกอินแอดมินที่ `https://swumkt.org/dorm/admin` → กล่อง **“คีย์สำหรับ Agent ข้างนอก”** → ตั้งชื่อ เช่น `prod-bot`, เลือกสิทธิ์ `dorm.*` แล้วกด **สร้างคีย์**
2. ทดสอบจากเครื่องหรือ cron job ภายนอก:
   ```bash
   export DORM_BASE_URL=https://swumkt.org
   export DORM_API_KEY=swk_xxxxxxxxxxxxxxxxxxxx
   python backend/scripts/dorm_agent.py brief
   python backend/scripts/dorm_agent.py check-external --only-flagged --dry-run
   python backend/scripts/dorm_agent.py triage --dry-run
   ```
3. รายละเอียด API ทั้งหมดดูใน `DORM_AGENT_API.md`

### ขั้นที่ 6 — Rollback ฉุกเฉิน (< 1 นาที)
หากพบปัญหาหลังรวมโค้ด:
```bash
git checkout meekintubeDone   # หรือ revert merge commit กลับไปที่ commit 0dbb9e5
```
แล้ว redeploy กลับทันที — ข้อมูลเว็บหลักไม่ถูกแตะต้อง และข้อมูล `dorm_*` อยู่ใน collection แยกทั้งหมด

---

## 4. รายการเตือนก่อนเปิดโปรโมตจริงให้คนนอกใช้
1. **Service Worker / Cache:** เว็บหลักมี `service-worker.js` หากผู้ใช้เก่าเปิด `swumkt.org` แล้วติด cache หน้าเดิม ให้กด hard refresh / รอ SW อัปเดต 1 รอบ (`App.js` + `index.html`)
2. **รูปและประกาศภายนอก:** รูปและห้อง 101 รายการจาก Renthub / PropertyScout / Horga ใช้ลิงก์ตรงพร้อมเครดิต ควรขออนุญาตหรือทยอยแทนด้วยประกาศจากเจ้าของห้อง/นิสิตจริงก่อนประชาสัมพันธ์วงกว้าง
3. **ความสดใหม่ของห้องนอก:** ห้องชุดตั้งต้น `seen_at: 2026-11-27` (หมดอายุอัตโนมัติใน 21 วัน) ควรเปิด `dorm_agent.py check-external` เป็นรอบเวลาหลังปล่อยจริง
4. **ช่องโหว่เดิมของระบบสมัครเว็บหลัก:** ตามที่ระบุใน `HANDOFF_DORM.md` (`POST /api/auth/register` ใน `backend/server.py` รับ field `role` จาก client) ยังคงเปิดอยู่ตามการตัดสินใจเดิมของโปรเจกต์หลัก ควรปิดก่อนเปิดรับบุคคลทั่วไปเต็มรูปแบบ
