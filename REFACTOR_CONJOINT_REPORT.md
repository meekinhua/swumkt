# Refactor Report — Conjoint Module Extraction

## Summary
แยก **Conjoint Analysis module** ออกจาก `backend/server.py` ไปเป็น
`backend/routes/conjoint.py` ตาม factory pattern เดียวกับ `routes/brand_equity.py`

| ไฟล์ | ก่อน | หลัง |
|------|------|------|
| `backend/server.py` | 12,342 บรรทัด | ~8,022 บรรทัด |
| `backend/routes/conjoint.py` | — | ~4,357 บรรทัด |

ย้าย: **24 models**, **24 helpers** (21 module-level + 3 ที่ต้องใช้ `db` เป็น nested),
และ **42 endpoints** ครบทุกตัว

## Commits
- `refactor(conjoint): baseline ...` — empty baseline (rollback point)
- `refactor(conjoint): extract Conjoint module into routes/conjoint.py` — งานหลักทั้งหมด

> หมายเหตุ: container นี้ **ไม่มี MongoDB / supervisor / fastapi** จึงรัน live smoke
> test ไม่ได้ ผมทำ extraction แบบ atomic พร้อม static verification เข้มข้นแทน
> (ดู Verification ด้านล่าง) — ฝั่งที่ pull ไปควรรัน smoke test ตาม Step 5 ของ
> `REFACTOR_CONJOINT.md` อีกครั้ง

## สถาปัตยกรรม
- `conjoint_router = APIRouter(tags=["conjoint"])` — **ไม่มี prefix โดยตั้งใจ**
  เพราะมี endpoint ที่ path ขึ้นต้นด้วย `/admin/conjoint-image-settings` ปนอยู่
  การใส่ `prefix="/conjoint"` จะทำให้ URL เพี้ยน → คง full path เดิมทุกตัว
- Factory `get_conjoint_routes(db, get_current_user, get_current_user_optional)`
  late-import symbols จาก `server` ตอนถูกเรียก (ปลาย server.py ที่ทุกอย่างถูก
  define แล้ว) เพื่อคงพฤติกรรมเดิมโดยไม่ duplicate โค้ดใหญ่:
  `User, UserRole, SurveyResponse, compress_base64_image, initialize_default_prompts`
- Heavy libs (numpy/pandas/sklearn/statsmodels/docx/emergentintegrations/matplotlib
  + lib.nca/ipma/fsqca) ยัง import แบบ lazy ภายในฟังก์ชันเหมือนเดิม ไม่แตะ

## สิ่งที่คงไว้ใน server.py (ไม่ใช่ conjoint หรือ shared)
- `/showcase/index`, `/admin/llm-prompts`, `/admin/llm-prompts/{prompt_id}`
- `/admin/users/{id}/thesis-export-permission`
- models `LLMPromptTemplate`, `UpdateLLMPromptRequest` + `initialize_default_prompts`
- **`SurveyResponse` (ตัว conjoint):** จงใจ shadow `SurveyResponse` ของ survey ที่
  define ก่อนหน้า — เก็บไว้ที่เดิมเพื่อไม่เปลี่ยนพฤติกรรม global-name ของ endpoint
  survey เดิม (เป็น latent behavior ที่มีอยู่แล้วก่อน refactor)

## Verification (static — ทำในนี้ได้)
- ✅ `ast.parse` ผ่านทั้งสองไฟล์
- ✅ ไม่มี undefined-name (F821) ใหม่ — เหลือแค่ `emergent_key`, `uuid4` ซึ่ง
  **มีอยู่เดิมใน server.py** (บรรทัด 465, 2791 นอกเขต conjoint) ไม่ใช่ regression
- ✅ ไม่มี redefinition (F811) ใน conjoint.py
- ✅ route 42 ตัวใน conjoint.py ตรงกับ origin **เป๊ะทุกตัว** (method+path) —
  ไม่มีตกหล่น / เกิน / ซ้ำ / ค้างใน server.py
- ✅ module-level imports ใน conjoint.py ถูกใช้ครบ
- ✅ ไม่มี `@api_router` หลงเหลือใน conjoint.py
- ⚠️ F401/F841 ที่เหลือใน conjoint.py เป็น local import/var ที่ copy มาเป๊ะจาก
  ต้นฉบับ (origin server.py ก็มี 19 รายการ) — ไม่แก้เพื่อไม่แตะ logic (โดยเฉพาะ
  MNL/Mixed Logit ที่ห้ามแก้)

## ยังไม่ได้ทำ (ต้องรันฝั่งที่มี runtime)
- `ruff check backend/` ให้ผ่าน 100% (ยังเหลือ F401/F841 ของเดิม)
- live API smoke tests (login + curl ทุก endpoint) ตาม Step 5
- restart backend + ตรวจ `/var/log/supervisor/backend.err.log`
