# SWUMKT — แพลตฟอร์มวิจัยตลาดของสาขาการตลาด มศว.

เว็บแพลตฟอร์มของสาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ (https://swumkt.org) — เครื่องมือวิจัยตลาดที่ใช้ได้จริงสำหรับ
นักการตลาดและ SME พร้อมรองรับนิสิตที่ทำวิทยานิพนธ์ (ส่งออกบทที่ 3–5 เป็น .docx) และคลังความรู้/ผลงานของสาขา

README นี้บอก **สถานะปัจจุบัน** ของระบบ รายละเอียดเชิงลึกของแต่ละเรื่องอยู่ใน [`memory/`](memory/) (ดูหัวข้อสุดท้าย)

## โมดูลในระบบ

| โมดูล | ทำอะไร | หน้าเว็บ (route) | ส่งออกวิทยานิพนธ์ |
|---|---|---|---|
| **Research Hub** | หน้ารวมเครื่องมือ จัดตามคำถามวิจัย + แนะนำ "เริ่มจากตรงไหนดี" | `/market-research` | — |
| **Brand Health Check** (Brand Equity, กรอบ Aaker) | แบบสอบถามวัด 4 มิติ, dashboard, เทียบกลุ่ม/รอบ, AI insights, หน้าเผยแพร่สาธารณะ | `/brand-equity` | บท 3–5 .docx (ไม่ใช้ AI ได้) |
| **Conjoint Analysis** (Choice-Based) | D-Optimal design, part-worth, HB, market simulator, AI ตีความ | `/market-research/conjoint-analysis` | บท 3–5 .docx (`…/no-ai` ไม่ใช้ AI) |
| **Customer Value Lab** | เทียบ Customer Value = Benefit − Cost กับคู่แข่ง (ผู้ใช้ประเมินเอง) | `/market-research/customer-value` | ไม่มี |
| **Customer Journey** | เชิงปริมาณ (เก็บข้อมูลจริง, pain point, codebook) + เชิงคุณภาพ (แผนที่จาก AI) | `/market-research/customer-journey` | ไม่มี |
| **Customer Behavior / Perception** | วิเคราะห์ข้อมูลเชิงคุณภาพ (Perception Phase 2 เชิงปริมาณ **ยังไม่เปิด**) | `/market-research/customer-behavior`, `/customer-perception` | ไม่มี |
| **Survey Builder** | แบบสอบถามทั่วไป, ลิงก์ตอบ, ส่งออก CSV | `/surveys` | CSV |
| **Journal Finder** | ค้นวารสาร (AI หรือฐานข้อมูล) | `/market-research/journal-finder` | — |
| Academic Format Editor | หน้าในระบบยังเป็น Coming Soon; hub ลิงก์ไปแอปทดลองภายนอก | `/market-research/academic-format-editor` | — |
| **Kanban Projects** | บอร์ดงานของทีมวิจัย | `/projects` | — |
| **CMS / Content Ops** | บทความ ข่าว ประชาสัมพันธ์ หน้าแรก คณาจารย์ — แก้ได้โดยไม่ต้อง deploy | `/admin/cms`, `/learn`, `/announcements`, `/people` | — |
| **Showcase** | รายงานแบรนด์ที่เผยแพร่แล้ว | `/showcase` | — |
| **Alumni Zone** (สายเทค) | เครือข่ายศิษย์เก่า | `/alumni` | — |
| ระบบผู้ใช้/แอดมิน | JWT, บทบาท (admin / current_student / alumni / public_user), ตั้งค่าระบบ, สิทธิ์ส่งออกวิทยานิพนธ์รายบุคคล | `/login`, `/dashboard`, `/admin/*` | — |

หมายเหตุ: การส่งออกวิทยานิพนธ์ต้องได้สิทธิ์ `can_export_thesis` จากแอดมิน (ผู้ดูแล → Users) · ต้องมีผู้ตอบ ≥ 10 คนเพื่อส่งออก
และ ≥ 30 คนเพื่อสรุปผลอย่างน่าเชื่อถือ

นอกขอบเขต README นี้: meekinTube / yolo / แอป TV-เพลง เป็นของเล่นทดลอง เสิร์ฟแบบ static ใต้ `/api/meekintube` และ `/api/yolo`

## สถาปัตยกรรม

```
backend/                FastAPI + MongoDB (motor, async)
  server.py             app + endpoint รุ่นเก่า (survey, behavior, perception, journal finder, content…)
  routes/               โมดูลที่แยกแล้ว: conjoint, brand_equity, journey, customer_value, cms, alumni,
                        faculty, projects, media, share, thesis_renderer, be_thesis_*
  lib/                  ตรรกะที่ไม่ผูก HTTP: llm_policy, external_prompts, conjoint_*, be_external,
                        journey_*, api_keys, object_storage …
  scripts/              dev_sim.py, sitectl.py, mint_api_key.py, seed_*.py
  tests/                pytest (ไม่ต้องใช้ Mongo จริง/LLM key — ใช้ mongomock-motor)
frontend/               React 19 + react-router 7 + Tailwind + shadcn/Radix + TanStack Query (CRA + craco)
  src/pages/            หน้าต่าง ๆ (MarketResearch.js = Research Hub, Dashboard.js, brand-equity/, journey/ …)
  src/components/       UnifiedTopbar (เมนูกลาง), ExternalAiDialog / AiActionButton (ใช้ AI ของตัวเอง)
  src/hooks, src/lib    useLlmPolicy, llmErrors, aiTextParse, apiError
memory/                 เอกสารออกแบบ/ตรวจสอบ/สัญญาระหว่าง backend–frontend
```

- API ทั้งหมดอยู่ใต้ `/api` · frontend อ่าน URL ของ backend จาก `REACT_APP_BACKEND_URL` **ตอน build**
- ไฟล์ตั้งค่า deploy จริง (supervisor / Kubernetes / reverse proxy) ไม่อยู่ใน repo นี้ — ดู `HANDOFF_*.md`

## รันบนเครื่อง

### ทางลัด: `dev_sim.py` (ไม่ต้องมี MongoDB และไม่ต้องมี LLM key)

รัน FastAPI ตัวจริงด้วย MongoDB จำลอง (in-memory, หายเมื่อปิด) + LLM ปลอม (log เป็น `[FAKE-LLM]`) พร้อมข้อมูลตัวอย่าง
(ผู้ใช้ 2 คน, Conjoint 1 study, Brand Equity 1 study)

```bash
cd frontend && yarn install
REACT_APP_BACKEND_URL=http://localhost:18090 CI=true yarn build     # baked in ตอน build
cd ../backend && pip install -r requirements.txt                    # ต้องมี mongomock-motor เพิ่ม (ไม่อยู่ใน requirements.txt)
python scripts/dev_sim.py --port 18090                              # เสิร์ฟ frontend/build ที่ http://localhost:18090/
```

- `admin@swu.ac.th / admin1234` (admin), `student@swu.ac.th / student1234` (นิสิต)
- ตัวเลือก: `--no-frontend`, `--no-seed`, `--llm-policy on|off` (ค่าเริ่มต้น: ปิด AI ของระบบ), `--frontend-dir PATH`
- `emergentintegrations` (SDK เรียก LLM) ไม่อยู่ใน PyPI สาธารณะ — dev_sim ใช้ตัวปลอมแทน จึงรันได้โดยไม่ต้องติดตั้ง

### รันแบบเต็ม (ต้องมี MongoDB)

```bash
cd backend
cp .env.example .env          # แก้ MONGO_URL, JWT_SECRET (บังคับ), EMERGENT_LLM_KEY ฯลฯ
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

cd frontend
cp .env.example .env          # REACT_APP_BACKEND_URL=http://localhost:8001
yarn install && yarn start    # http://localhost:3000
```

`yarn build` ใช้ `CI=true` จะนับ warning ของ ESLint เป็น error — เป็นเกณฑ์ที่ใช้ตรวจก่อนส่งงาน:
`cd frontend && CI=true yarn build`

### ทดสอบ

```bash
cd backend
python -m pytest tests -q                                  # ทั้งหมด (บางชุดเป็น integration ที่ต้องมีเซิร์ฟเวอร์รัน)
python -m pytest tests/test_llm_policy.py tests/test_llm_call_sites_2026_11.py \
                 tests/test_conjoint_2026_11_external.py tests/test_brand_equity_2026_11.py -q   # ชุดสวิตช์ AI (offline)
```

Frontend ยังไม่มี unit test — ตรวจด้วย build + เปิดเบราว์เซอร์ (Playwright ใช้กับ dev_sim ได้)

## ตัวแปรสภาพแวดล้อม

| ที่ไหน | ไฟล์ตัวอย่าง | สำคัญ |
|---|---|---|
| Backend | [`backend/.env.example`](backend/.env.example) | `MONGO_URL`, `DB_NAME`, `JWT_SECRET` (ไม่ตั้ง = server ไม่สตาร์ท), `EMERGENT_LLM_KEY`, `CORS_ORIGINS`, `FRONTEND_URL`, `VAPID_*` (web push), `SYSTEM_LLM_DEFAULT` |
| Frontend | [`frontend/.env.example`](frontend/.env.example) | `REACT_APP_BACKEND_URL` (บังคับ, ฝังตอน build) + ตัวเลือก dev-server |

ไม่ commit ค่าจริง · `.gitignore` ของ repo ignore `.env.*` อยู่ ไฟล์ `*.env.example` ต้อง `git add -f`

## AI ของระบบ: สวิตช์ และการใช้ AI ของตัวเอง

ผู้ดูแลควบคุมได้ว่าระบบจะจ่ายค่า LLM เองหรือไม่ — **ค่าเริ่มต้นคือปิด** (ตั้ง `SYSTEM_LLM_DEFAULT=on` เพื่อเปลี่ยน)

- ตั้งค่าที่ `/admin/settings` (สวิตช์หลัก + รายกลุ่ม `research` / `thesis` / `images` / `content` / `documents` + แอดมินข้ามได้ + ข้อความแนะนำผู้ใช้)
  หรือจาก CLI: `sitectl llm status | on | off | set <key> on|off|default | hint "<ข้อความ>"`
- ตรวจที่ server เป็นหลัก: ฟังก์ชัน AI ที่ถูกปิดตอบ HTTP **409** `{"detail": {"code": "llm_external_only", …}}` — ไม่มีการเรียก LLM แบบเสียเงินเงียบ ๆ
  (guard กลางใน `server.py` + `backend/lib/llm_policy.py`) · frontend แสดง toast เดียวและเปิดทาง "ใช้ AI ของฉันเอง"
- **ใช้ AI ของตัวเอง (ใช้ได้เสมอ แม้สวิตช์เปิด)**: ปุ่ม AI มีเมนู "ใช้ AI ของฉันเอง" → ระบบสร้างพรอมต์ฉบับเดียวกับที่ส่งให้ AI ของระบบ
  (มีข้อมูลฝังแล้ว) → คัดลอกไปวางใน ChatGPT / Claude / Gemini → วางคำตอบกลับ ระบบตรวจรูปแบบและเก็บเหมือนผลจาก AI ของระบบ
  ภาพ: ได้พรอมต์ไปสร้างภาพเองแล้วอัปโหลด · วิทยานิพนธ์: ดาวน์โหลด pack (Markdown) ไปให้ AI เขียนบท แล้วนำกลับมาออก .docx
- Endpoint, feature key, รูปแบบ request/response ทั้งหมด: [`memory/LLM_EXTERNAL_CONTRACT.md`](memory/LLM_EXTERNAL_CONTRACT.md)
- ฟังก์ชัน AI ที่ **ยังไม่มีทางใช้ AI ของตัวเอง** (ถ้าปิด จะใช้ไม่ได้ หน้าเว็บแจ้งและปิดปุ่มพร้อมเหตุผล): Journal Finder (โหมด AI),
  Academic Format Editor, ภาพประกอบของ Behavior/Perception, AI จัดเรียงเนื้อหา (`content.ai`) ใช้พรอมต์ที่สร้างในหน้าเว็บเอง

## สั่งงานจาก CLI: `backend/scripts/sitectl.py`

เจ้าของงานแก้เนื้อหา/สลับ AI/อ่านผลการศึกษา ได้จากเทอร์มินัล (หรือผ่าน Claude Code skill `site-edit`) โดยไม่ต้อง rebuild/deploy

```bash
python backend/scripts/mint_api_key.py --label "sitectl · owner" --preset operator   # ออกคีย์ (ฝั่งเซิร์ฟเวอร์, แสดงครั้งเดียว)
export SWUMKT_API=https://swumkt.org SWUMKT_API_KEY=swk_…
python backend/scripts/sitectl.py health
python backend/scripts/sitectl.py landing get slides.0.heroPre         # อ่านก่อนเขียนเสมอ
python backend/scripts/sitectl.py landing set slides.0.lede "ข้อความใหม่" --dry-run
python backend/scripts/sitectl.py llm status
python backend/scripts/sitectl.py research list --tool conjoint
python backend/scripts/sitectl.py research prompt brand-equity <study-id> analyze -o prompt.md
python backend/scripts/sitectl.py research import brand-equity <study-id> analyze --file answer.md
```

มี deny-list (ลบถาวร, ผู้ใช้/บทบาท, `/api/admin/*` เข้าถึงไม่ได้) และ undo ของการแก้เนื้อหา — รายละเอียดใน `.claude/skills/site-edit/SKILL.md`
และหัวไฟล์ `sitectl.py`

## เอกสารใน `memory/`

| ไฟล์ | เรื่อง |
|---|---|
| `PLAN_2026_11_EXTERNAL_LLM.md` | แผนงาน 2026-11: สวิตช์ AI, ใช้ AI ของตัวเอง, CLI, alumni |
| `LLM_EXTERNAL_CONTRACT.md` | สัญญา backend–frontend ของสวิตช์ AI และ endpoint `external-prompt` / `external-import` |
| `PLATFORM_DESIGN_BRIEF.md`, `../design_guidelines.json` | ระบบการออกแบบ (editorial / Swiss), หน้าสาธารณะ |
| `CONJOINT_AUDIT_*.md`, `BRAND_EQUITY_AUDIT_*.md`, `THESIS_EXPORT_AUDIT_2026_08.md` | การตรวจความถูกต้องเชิงวิชาการของสูตรและการส่งออก |
| `CJM_QUANT_SPEC.md`, `CJM_PAINPOINT_SPEC.md` | สเปก Customer Journey เชิงปริมาณ |
| `CONTENT_OPS_2026_10.md`, `FACULTY_SEO_2026_10.md`, `PERFORMANCE_AUDIT_2026_10.md`, `REPUTATION_AUDIT_2026_10.md` | แก้เนื้อหาโดยไม่ deploy, หน้าคณาจารย์/SEO, ประสิทธิภาพ |
| `ALUMNI_CONTRACT_2026_11.md`, `alumni-spec/` | Alumni Zone (สายเทค) |
| `PRD.md`, `ROADMAP.md`, `CHANGELOG.md`, `PAUSED_WORK.md` | ความต้องการ, แผน, ประวัติ, งานที่พักไว้ |
| `test_credentials.md` | บัญชีทดสอบ (ข้อมูลทดสอบรุ่นเก่า — dev_sim ใช้ชุดบัญชีของตัวเองข้างบน) |
