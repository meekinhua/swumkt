# 🛠️ Refactor Prompt — แยก Conjoint Module ออกจาก `server.py`

> ใช้ไฟล์นี้สั่ง **Claude Code Pro (local)** ให้ refactor codebase แบบปลอดภัย แล้วเอา code ที่เสร็จกลับมาทำงานต่อใน Emergent ได้
>
> **Workflow:** Emergent → Save to GitHub → clone → Claude Code Pro refactor → push → Emergent pull → verify

---

## 🚦 Safe Collaboration Workflow (อ่านก่อน)

### ฝั่ง Emergent (ที่นี่)
1. กด **"Save to GitHub"** ใน chat input ของ Emergent → จะ push code ล่าสุดไปที่ GitHub repo ของคุณ
2. จด **commit hash ปัจจุบัน** ไว้ (เผื่อต้อง rollback) — ดูได้จากหน้า Save to GitHub
3. **อย่าเริ่ม task ใหม่บน Emergent** จนกว่า refactor จะเสร็จและ pull กลับมาแล้ว (ไม่งั้น merge conflict)

### ฝั่ง Local (Claude Code Pro)
4. `git clone <your-repo-url>` ลงเครื่อง
5. สร้าง branch ใหม่: `git checkout -b refactor/conjoint-module`
6. เปิด Claude Code Pro ใน folder นั้น → **paste prompt ด้านล่างทั้งหมด**
7. ให้ Claude Code Pro commit เป็นกลุ่มๆ (ไม่ใช่ commit เดียวยักษ์) — รายละเอียดในส่วน Steps ด้านล่าง
8. รัน smoke tests ตามคำสั่งใน prompt
9. ถ้าผ่านหมด: `git push origin refactor/conjoint-module`
10. เปิด **Pull Request** บน GitHub → merge เข้า `main` (หรือ branch ที่ Emergent ใช้)

### กลับมา Emergent
11. แจ้งผม (agent ที่นี่) ว่า **"refactor เสร็จแล้ว ให้ pull จาก GitHub"**
12. ผมจะรัน `git pull` + restart backend + smoke test ทั้งหมดให้
13. ถ้าพัง → ผม rollback ให้กลับ commit hash เดิมที่จดไว้ ใน step 2

### กรณีฉุกเฉิน (rollback)
- บน Emergent ใช้ feature **"Rollback"** (มีอยู่ในเมนู ไม่กิน credit)
- หรือบน GitHub: `git revert <merge-commit>`

---

## 📋 Prompt (copy ทั้งหมดให้ Claude Code Pro)

```markdown
# Refactor: แยก Conjoint Module ออกจาก backend/server.py

## Context
ผมกำลังพัฒนา full-stack app (FastAPI + React + MongoDB) ชื่อ SWU MKT —
แพลตฟอร์มวิจัยตลาดของสาขาการตลาด มศว. ไฟล์ `backend/server.py` ตอนนี้ยาว
**12,342 บรรทัด** ใหญ่เกินไป จนอ่าน/แก้ยาก ต้องแยก **Conjoint Analysis module**
ออกมาเป็นไฟล์ใหม่ตาม pattern เดียวกับ module อื่นที่แยกออกมาแล้ว

## Current State

### ไฟล์ที่เกี่ยวข้อง
- `backend/server.py` (12,342 บรรทัด) — มี conjoint code ตั้งแต่บรรทัด **~7484 ถึง ~12200** (~4,700 บรรทัด)
- `backend/routes/brand_equity.py` (3,175 บรรทัด) — **เป็น reference pattern ที่ต้องเลียนแบบ**
- `backend/routes/projects.py` (1,436 บรรทัด) — modular route อีกตัวอย่าง
- `backend/routes/cms.py` (1,162 บรรทัด) — modular route อีกตัวอย่าง

> ก่อนเริ่ม ให้รัน `grep -n "@api_router.*conjoint\|/conjoint" backend/server.py`
> เพื่อ verify เลขบรรทัดปัจจุบัน (อาจขยับเล็กน้อยถ้ามีการแก้)

### Conjoint code ใน server.py แบ่งเป็น 3 กลุ่ม

**1. Models (Pydantic) — บรรทัด ~7517–7700**
- `ConjointStudyStatus` (Enum)
- `ConjointAttribute`, `ConjointProfile`, `ChoiceSet`
- `CreateConjointStudyRequest`, `ConjointStudyResponse`
- `ConjointContentShareRequest`

**2. Helpers — กระจายอยู่หลายที่**
- `generate_d_optimal_design(...)` (~7697)
- `is_balanced_set(...)` (~7748)
- `_build_conjoint_data_rows(...)` (~9808)
- `calculate_mnl_analysis(...)` (~9869)
- `calculate_mixed_logit_analysis(...)` (~9946)
- `get_method_results(...)` (~10356)
- `_prepare_analysis_summary(...)` (~11129)

**3. API endpoints (~35 ตัว) — บรรทัด ~7769–12200**
```
POST   /conjoint/studies                                   (create)
POST   /conjoint/studies/{id}/qualitative-analysis
PUT    /conjoint/studies/{id}/attributes
POST   /conjoint/studies/{id}/generate-design
GET    /conjoint/studies/trash
GET    /conjoint/studies/{id}
GET    /conjoint/studies                                   (list)
PUT    /conjoint/studies/{id}/status
PUT    /conjoint/studies/{id}/public-result
GET    /conjoint/showcase
POST   /conjoint/studies/{id}/generate-images
POST   /conjoint/studies/{id}/generate-single-image
POST   /conjoint/studies/{id}/upload-image
POST   /conjoint/studies/{id}/generate-profile-image
POST   /conjoint/studies/{id}/upload-profile-image
POST   /conjoint/studies/{id}/reference-images
DELETE /conjoint/studies/{id}/reference-images/{idx}
DELETE /conjoint/studies/{id}                              (soft delete)
POST   /conjoint/studies/{id}/restore
DELETE /conjoint/studies/{id}/purge
POST   /conjoint/studies/{id}/nca-analysis
POST   /conjoint/studies/{id}/fsqca-analysis
POST   /conjoint/studies/{id}/ipma-analysis
POST   /conjoint/studies/{id}/start-survey
GET    /admin/conjoint-image-settings
PUT    /admin/conjoint-image-settings
GET    /conjoint/survey/{id}
POST   /conjoint/survey/{id}/response
POST   /conjoint/studies/{id}/sync-respondent-count
POST   /conjoint/admin/sync-all-respondent-counts
GET    /conjoint/studies/{id}/results
GET    /conjoint/studies/{id}/export-responses
GET    /conjoint/studies/{id}/statistical-analysis
POST   /conjoint/studies/{id}/generate-product-from-results
POST   /conjoint/studies/{id}/generate-shelf-simulation
POST   /conjoint/studies/{id}/share-content
POST   /conjoint/studies/{id}/ai-interpretation
GET    /conjoint/studies/{id}/ai-interpretation-status/{job_id}
POST   /conjoint/studies/{id}/generate-prompt
POST   /conjoint/studies/{id}/export-thesis
GET    /conjoint/studies/{id}/export-thesis-status/{job_id}
GET    /conjoint/studies/{id}/export-thesis-download
```

## Goal
สร้าง `backend/routes/conjoint.py` ที่:
1. ใช้ **factory pattern เหมือน `brand_equity.py`** — export function
   `get_conjoint_routes(db, get_current_user)` ที่ return `APIRouter`
2. ย้าย **ทุก model / helper / endpoint** ของ conjoint จาก `server.py` มา
3. `server.py` register module ตามท้ายไฟล์ (เหมือน brand_equity)
4. **ห้าม break URL path ใดๆ** — ทุก endpoint ต้องตอบที่ `/api/conjoint/...` เหมือนเดิม
5. โค้ดเดิมยังต้อง pass ทุก smoke test

## Reference Pattern (อ่าน `backend/routes/brand_equity.py` ก่อนเริ่ม)

```python
# backend/routes/brand_equity.py
from fastapi import APIRouter, Depends, HTTPException
# ... imports ...

# Models at top
class BrandStudy(BaseModel):
    ...

# Helpers (module-level)
def _is_admin(u): ...
def _now(): ...

# Factory function
def get_brand_equity_routes(db, get_current_user):
    router = APIRouter(prefix="/brand-equity", tags=["brand-equity"])

    @router.post("/studies")
    async def create_study(...):
        ...

    # ... endpoints ทั้งหมด nested ใน factory ...

    return router
```

ใน `server.py` ท้ายไฟล์:
```python
from routes.brand_equity import get_brand_equity_routes
api_router.include_router(get_brand_equity_routes(db, get_current_user))
```

## ⛔ Constraints (สำคัญมาก — ห้ามผิด)

1. **ห้ามเปลี่ยน URL path** ของ endpoint ใดๆ — frontend เรียกอยู่ทั้งหมด
2. **ห้ามเปลี่ยน request/response schema** — frontend จะพังทันที
3. **ห้ามแตะ frontend code** เลย (`frontend/`)
4. **MongoDB queries**: ทุก query ที่ return ออก API ต้องมี `{"_id": 0}` ใน projection
   (ObjectId ไม่ JSON-serializable)
5. **datetime**: ใช้ `datetime.now(timezone.utc).isoformat()` ห้ามใช้ `datetime.utcnow()`
6. **async**: ทุก endpoint ต้องเป็น `async def`
7. **CPU-heavy code**: ถ้ามี calculation หนัก (MNL/Mixed Logit/HB) ต้อง wrap ด้วย
   `await asyncio.to_thread(...)` เพื่อไม่ block event loop (production เป็น single worker)
8. **Permissions helpers** (`_is_owner_or_admin`, `_has_thesis_export_permission` ฯลฯ)
   → copy มาจาก `server.py` ได้ ไม่ต้อง refactor เป็น shared lib ตอนนี้
9. **Background task system** (สำหรับ AI interpretation + thesis export):
   ใช้ระบบเดิมจาก `server.py` — อย่าเขียนใหม่
10. **AI calls**: ใช้ `emergentintegrations` library กับ Gemini 2.5 Flash
    ใช้ semaphore `_AI_SEM = asyncio.Semaphore(3)` + timeout 55s เหมือนใน `brand_equity.py`
11. **ห้ามแก้ `.env`** — credentials อยู่ที่ env vars เท่านั้น
12. **ห้ามแก้ `requirements.txt`** โดยตรง — ถ้าจำเป็น ใช้ `pip install` + `pip freeze`
13. **ห้ามรัน uvicorn เอง** — ใช้ `sudo supervisorctl restart backend`
14. **ห้ามลบ** `.git/`, `.emergent/`, `frontend/.env`, `backend/.env`

## 📐 Steps (ทำตามลำดับ — commit ทุก step)

### Step 0: Branch + baseline
```bash
git checkout -b refactor/conjoint-module
git log -1 --oneline  # จด commit hash baseline ไว้
```

### Step 1: Discovery (อย่าเพิ่งแก้)
- เปิด `backend/server.py` อ่านบรรทัด 7484–12200
- รัน:
  ```bash
  grep -n "^class\|^def\|^async def\|@api_router" backend/server.py \
      | awk 'NR==1 || $0 ~ /[Cc]onjoint|[Mm]nl|[Mm]ixed|[Tt]hesis/'
  ```
- list dependencies ที่ conjoint code ใช้จาก server.py:
  - global vars (`db`, `api_router`)
  - helper functions ที่ shared (`get_current_user`, `_thesis_export_allowed`, image utilities)
  - shared models (`User`, `ContentType`, `ContentRecord`)
- บันทึก list ไว้ใน **comment ที่ด้านบนของ conjoint.py** เพื่อให้ reviewer เข้าใจ scope
- **Commit:** `git commit --allow-empty -m "refactor(conjoint): start — baseline notes"`

### Step 2: สร้าง skeleton
- สร้าง `backend/routes/conjoint.py`
- เขียน imports + factory `get_conjoint_routes(db, get_current_user)`
  ที่ return `APIRouter(prefix="/conjoint", tags=["conjoint"])`
- copy models เข้ามา (บรรทัด ~7517–7700 ของ server.py) **แต่ยังไม่ลบจาก server.py**
- ที่ท้าย `server.py`:
  ```python
  from routes.conjoint import get_conjoint_routes
  api_router.include_router(get_conjoint_routes(db, get_current_user))
  ```
- ลบ duplicate models เก่าออกจาก server.py
- รัน `ruff check backend/` → ต้องผ่าน
- รัน `sudo supervisorctl restart backend` → server ต้องสตาร์ตได้
- **Commit:** `git commit -m "refactor(conjoint): create routes/conjoint.py skeleton with models"`

### Step 3: ย้าย endpoints ทีละกลุ่ม (8 commits)

ทำตามลำดับนี้ — **commit หลังย้ายเสร็จแต่ละกลุ่ม + run smoke test:**

| # | กลุ่ม | Endpoints | Commit message |
|---|------|-----------|----------------|
| 3.1 | CRUD studies | create/get/list/status/delete/restore/purge/trash | `refactor(conjoint): move CRUD endpoints` |
| 3.2 | Design | generate-design, attributes, qualitative-analysis | `refactor(conjoint): move design endpoints` |
| 3.3 | Images | generate-images, upload-image, reference-images, profile-image, admin-image-settings | `refactor(conjoint): move image endpoints` |
| 3.4 | Survey | start-survey, survey/{id}, survey response, sync-respondent-count | `refactor(conjoint): move survey endpoints` |
| 3.5 | Analytics | results, statistical-analysis, NCA/fsQCA/IPMA, export-responses + MNL/MixedLogit helpers | `refactor(conjoint): move analytics endpoints` |
| 3.6 | AI interpretation | ai-interpretation + status polling + generate-prompt | `refactor(conjoint): move AI interpretation` |
| 3.7 | Thesis export | export-thesis + status + download | `refactor(conjoint): move thesis export` |
| 3.8 | Showcase + share | showcase, public-result, share-content, generate-product, generate-shelf | `refactor(conjoint): move showcase + share` |

หลังย้ายเสร็จแต่ละกลุ่ม:
1. **ลบ code เก่าออกจาก server.py** (ไม่ใช่แค่ comment out)
2. รัน `ruff check backend/`
3. รัน `sudo supervisorctl restart backend`
4. รัน smoke test (ดู Step 5)
5. ถ้าผ่าน → commit

### Step 4: Final cleanup
- ตรวจ `server.py` ว่าไม่มี dead code (functions/classes ที่ไม่มีใครเรียกแล้ว)
- ลบ imports ที่ไม่ใช้ใน server.py
- จัด imports ใน `conjoint.py` ให้สะอาด (group: stdlib, 3rd party, local)
- **Commit:** `git commit -m "refactor(conjoint): cleanup unused imports and dead code"`

### Step 5: Smoke tests (ห้ามข้าม)

```bash
# 1. Lint ทั้ง backend
ruff check backend/

# 2. Restart + check error log
sudo supervisorctl restart backend
sleep 3
tail -n 50 /var/log/supervisor/backend.err.log
# → ต้องไม่มี error ที่เกี่ยวกับ conjoint หรือ import

# 3. API smoke tests
API_URL=$(grep REACT_APP_BACKEND_URL frontend/.env | cut -d '=' -f2)
TOKEN=$(curl -s -X POST "$API_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@swu.ac.th","password":"admin123"}' \
    | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('access_token') or d.get('token'))")

# ทุก endpoint ต้องคืน status 2xx/4xx (ไม่ใช่ 500)
echo "=== List studies ==="
curl -s -o /dev/null -w "%{http_code}\n" \
    "$API_URL/api/conjoint/studies" -H "Authorization: Bearer $TOKEN"

echo "=== Showcase (public) ==="
curl -s -o /dev/null -w "%{http_code}\n" "$API_URL/api/conjoint/showcase"

echo "=== Trash list ==="
curl -s -o /dev/null -w "%{http_code}\n" \
    "$API_URL/api/conjoint/studies/trash" -H "Authorization: Bearer $TOKEN"

echo "=== Admin image settings ==="
curl -s -o /dev/null -w "%{http_code}\n" \
    "$API_URL/api/admin/conjoint-image-settings" -H "Authorization: Bearer $TOKEN"

# ถ้าทุกอันคืน 200 (หรือ 401/404 ตามที่ควรจะเป็น) = pass
```

### Step 6: Verify file sizes
```bash
wc -l backend/server.py backend/routes/conjoint.py
# Expected:
#   server.py:  ~7,500–8,000 lines (จาก 12,342)
#   conjoint.py: ~4,000–5,000 lines
```

### Step 7: Final commit + push
```bash
git status              # ต้องไม่มีไฟล์ค้าง
git log --oneline       # ดูว่ามี ~10 commits ตามลำดับ
git push origin refactor/conjoint-module
```

แล้วเปิด **Pull Request** บน GitHub → merge เข้า main

## ✅ Success Criteria
- [x] `backend/server.py` ลดลงจาก ~12,342 → ~7,500–8,000 บรรทัด
- [x] `backend/routes/conjoint.py` มี code ทั้งหมดของ conjoint module
- [x] ทุก endpoint คืน status code เดิม (verified ด้วย curl)
- [x] ไม่มี error ใน `/var/log/supervisor/backend.err.log`
- [x] `ruff check backend/` ผ่าน 100%
- [x] frontend ไม่ต้องแก้แม้แต่บรรทัดเดียว
- [x] git log มี commits เป็นกลุ่มชัด (rollback ทีละกลุ่มได้)

## 🚫 Anti-patterns (ห้ามทำ)
- ❌ ห้ามแก้ frontend
- ❌ ห้ามเปลี่ยน URL paths
- ❌ ห้ามเปลี่ยน request/response shape (เพราะ frontend bind ตามนี้แล้ว)
- ❌ ห้าม refactor logic ของ MNL/Mixed Logit calculation (เพราะ thesis ของนิสิตอ้างอิงผลลัพธ์)
- ❌ ห้าม commit เดียวยักษ์ — ต้องแบ่ง commit ตาม Step 3
- ❌ ห้ามรัน `uvicorn` เอง — supervisor จัดการให้แล้ว
- ❌ ห้ามแก้ `.env`, `.gitignore`, `requirements.txt` โดยตรง

## 🎁 Optional Bonus (ทำเสร็จแล้วยังเหลือเวลา)
- เพิ่ม unit tests ใน `backend/tests/test_conjoint.py` (pytest + httpx)
- เพิ่ม docstring ให้ทุก endpoint
- ถ้า `conjoint.py` ยังเกิน 3,000 บรรทัด → แยก stats ออกเป็น
  `backend/lib/conjoint_stats.py` (เก็บแค่ MNL/Mixed Logit/Counting calculations)

---

เริ่มได้เลย ขั้นแรกอ่าน `backend/routes/brand_equity.py` ก่อน เพื่อเข้าใจ pattern
แล้วทำ Step 0 → 1 → 2 → 3.x → 4 → 5 → 6 → 7 ตามลำดับ
```

---

## 📦 หลังจาก refactor เสร็จ — เอากลับมา Emergent

1. บอกผม (Emergent agent) ว่า:
   > "refactor conjoint เสร็จแล้ว ช่วย pull จาก GitHub branch `refactor/conjoint-module` แล้ว smoke test ให้ที"

2. ผมจะ:
   - `cd /app && git fetch && git checkout refactor/conjoint-module && git pull`
     (หรือ pull `main` ถ้า merge แล้ว)
   - `sudo supervisorctl restart backend`
   - รัน smoke tests ครบทุก endpoint
   - check `/var/log/supervisor/backend.err.log`
   - report ผลลัพธ์ + screenshot 1 ภาพยืนยันว่า frontend ยังทำงานได้

3. ถ้าผ่าน → ทำงานต่อได้เลย
4. ถ้าพัง → ผม rollback ให้กลับ commit hash ที่จดไว้ใน step 2 ของ workflow ด้านบน

---

## 💡 Tips สำหรับการใช้ Claude Code Pro

- เปิด project ทั้ง folder ใน Claude Code Pro (ไม่ใช่แค่ไฟล์เดียว) — มันจะเข้าใจ context ได้ดีกว่า
- บอกให้มัน `git diff --stat HEAD~1` ก่อน commit แต่ละครั้ง เพื่อ verify ขนาดการเปลี่ยนแปลง
- ถ้ามันเริ่มทำเกิน scope (เช่น แก้ frontend, refactor logic) — interrupt ทันที แล้วบอก
  *"stop, ทำตาม REFACTOR_CONJOINT.md เท่านั้น ห้ามนอก scope"*
- หลังเสร็จ ขอให้มันสร้าง `REFACTOR_CONJOINT_REPORT.md` สรุป:
  - กี่ commits
  - file sizes ก่อน/หลัง
  - ผล smoke tests
  - issues ที่เจอ (ถ้ามี)
