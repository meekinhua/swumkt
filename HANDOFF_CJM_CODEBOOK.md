# HANDOFF — Journey Codebook (ขั้นเชิงคุณภาพ → ขั้นเชิงปริมาณ)

**ฐาน:** `meekintubeDone` @ `51b46ea`
**สเปก:** `memory/CJM_PAINPOINT_SPEC.md` (ฉบับแก้ครั้งที่ 2, 20 ส.ค. 2026) — **อ่านก่อน**
**สถานะ:** backend **และ frontend** เสร็จ เดินครบวงจรในเบราว์เซอร์แล้ว · เทสต์ journey 225 ผ่านทั้งหมด

---

## 1. เรื่องนี้แก้ปัญหาอะไร

รายการ pain point เคยเป็น **ค่าคงที่ในโค้ด** (`journey_instrument.py` L61–90 · 10 ตัวเลือก)
ซึ่งกลับทิศของระเบียบวิธี: งานเชิงคุณภาพมีหน้าที่ *ค้นพบ* ว่าปัญหาคืออะไรในภาษาลูกค้า
งานเชิงปริมาณมีหน้าที่ *วัดขนาด* · การ fix รายการไว้ล่วงหน้าคือการข้ามขั้นค้นพบ

ตอนนี้รายการมาจาก **Journey Codebook** ของการศึกษานั้นเอง — states + edges + touchpoints + pain
เป็นก้อนเดียว มีเวอร์ชัน มี verbatim ต้นทาง และมนุษย์อนุมัติทุกตัว

**สิ่งที่ใหม่ที่สุด:** ขั้นที่ 2 ไม่ได้แค่วัด แต่ **ตรวจสอบย้อนกลับว่าขั้นที่ 1 ทำครบไหม**

---

## 2. สิ่งที่ทำไปแล้ว (backend)

| ไฟล์ | สาระ |
|---|---|
| `backend/lib/journey_codebook.py` | **ใหม่** ~700 บรรทัด · แกนคำนวณล้วน ไม่มี DB/FastAPI/นาฬิกา |
| `backend/routes/journey.py` | +7 endpoints · submission เก็บ id · public payload รายขั้น · `qualitative_audit` · provenance |
| `backend/routes/journey_instrument.py` | `codebook_version` เข้า `structure_hash` (แบบมีเงื่อนไข — ดูข้อ 4) |
| `backend/lib/journey_budget.py` | `estimate()` รับ `n_pain_options`, `allow_other_text`, `severity_scope` |
| `backend/server.py` | แก้บั๊ก `logging.info` ตายทั้งระบบ — ดูข้อ 5 |
| `backend/tests/test_journey_codebook.py` | **ใหม่** 52 เทส (แกนคำนวณ) |
| `backend/tests/test_journey_codebook_api.py` | **ใหม่** 29 เทส (HTTP contract) |
| `backend/tests/test_journey_two_step_flow.py` | **ใหม่** 13 เทส (end-to-end สองขั้น) |

### endpoints
```
POST   /api/journey/studies/{id}/codebook/extract      สกัด candidate (deterministic)
GET    /api/journey/studies/{id}/codebook              active + draft + can_edit
PUT    /api/journey/studies/{id}/codebook              แก้ draft → คืน blockers ทุกครั้ง
POST   /api/journey/studies/{id}/codebook/activate     ตรวจ gate แล้วล็อก
POST   /api/journey/studies/{id}/codebook/reliability  κ รายหมวด + Krippendorff α
GET    /api/journey/studies/{id}/pain-other-texts      คิว back-coding
POST   /api/journey/studies/{id}/pain-back-code        ลงรหัสย้อนกลับ
```

---

## 3. Frontend — ทำแล้ว เดินครบวงจรจริงในเบราว์เซอร์

| ไฟล์ | สาระ |
|---|---|
| `frontend/src/pages/journey/JourneyCodebookStep.jsx` | **ใหม่** ขั้นลงรหัสในวิซาร์ด |
| `frontend/src/pages/journey/JourneyProvenance.jsx` | **ใหม่** การ์ด provenance / audit / saturation / reliability |
| `frontend/src/pages/journey/JourneyBackCoding.jsx` | **ใหม่** คิวลงรหัสย้อนกลับ |
| `frontend/src/pages/journey/JourneyWizardPage.jsx` | แทรกขั้นที่ 3 “ลงรหัสปัญหา” · เลื่อนเลขขั้นที่เหลือ |
| `frontend/src/pages/journey/JourneyDashboardPage.jsx` | ต่อการ์ดใหม่ทั้งหมด + ดึง codebook มาใช้ |
| `frontend/src/pages/journey/JourneyRespondentPage.jsx` | ส่ง `category_ids` แทนข้อความ · ช่อง “อื่น ๆ” · cap จาก study |

**เดินจริงแล้วทั้งเส้น** (มี screenshot ไม่ได้ แต่ยืนยันด้วยข้อมูลในฐานข้อมูล):
วางบทสัมภาษณ์ 5 ราย → สกัดได้ 5 candidate พร้อม quote และเลข index ของบทสัมภาษณ์ →
อนุมัติ 4 → เปิดใช้ v1 → หน้าผู้ตอบเสิร์ฟ `pc1..pc4` (id ไม่ใช่ข้อความ) และ cap 2 ทำงาน
(กด 3 ขั้นได้แค่ 2) → ตอบพร้อมพิมพ์ “อื่น ๆ” → dashboard ขึ้น provenance, saturation
`[1,2,0,1,0]` พร้อมคำเตือนสองข้อ, other-rate 100% (CI 34–100%) พร้อมคำเตือน →
ลงรหัสย้อนกลับจากคิว → `back_coded_ids: ["pc2"]`, rate 0.5

### ยังเหลือให้ทำต่อ
1. **ไฟล์ export** — การ์ดขึ้นบนจอครบแล้ว แต่ยังไม่ได้ฝัง provenance / คำเตือน `library_default`
   / ตาราง κ / เส้น saturation ลงไฟล์ export ตามข้อ 2.8 ของสเปก
2. **LLM booster** (สเปก 2.4 ข้อ 6) — ยืนยันบนเครื่อง dev ไม่ได้เพราะ stub คืนผลปลอมโดยเจตนา
3. **การรวม (merge) candidate** — โครงสร้าง `merged_from` มีแล้ว ยังไม่มีปุ่มในหน้าจอ
   ตอนนี้ทำได้ด้วยการลบแถวหนึ่งแล้วแก้อีกแถว
4. **เทส frontend อัตโนมัติ** — ยังไม่มี ทั้งหมดยืนยันด้วยการเดินมือในเบราว์เซอร์
   `data-testid` วางไว้ครบแล้ว (`cb-*`, `bc-*`, `journey-qual-audit`, `journey-saturation`,
   `journey-reliability`, `jy-paincat-<id>`, `jy-painother-<sid>`)

---

## 4. กับดักที่เกือบทำข้อมูลเสีย — อย่ารื้อ

**`codebook_version` เข้า `structure_hash` แบบมีเงื่อนไข**
`journey_instrument.py` เพิ่ม key นี้ **เฉพาะเมื่อ `codebook_version` เป็นค่าจริง** ถ้าใส่ตรง ๆ
โดยไม่มีเงื่อนไข hash ของ **ทุกการศึกษาที่มีอยู่** จะขยับ แล้ว `PUT /studies/{id}` จะตอบ 400
"มีคำตอบเข้ามาแล้ว จึงแก้โครงสร้างไม่ได้" แม้แต่ตอนแก้คำผิด ซึ่งโมดูลนี้สัญญาไว้ว่าทำได้เสมอ
มีเทสปักไว้: `test_codebook_version_enters_the_structure_hash_without_moving_old_studies`

**เกณฑ์ "edge มีนัย" ใช้ `MIN_R_EDGE_LABEL = 25`**
ถ้าดูแต่สัดส่วน แถวที่มี observation เดียวจะได้ share 1.0 กับขอบล่าง Wilson ~0.21
แล้วล้มสมมติฐาน linear ของนักศึกษาด้วยคำตอบหลงเพียงข้อเดียว

**`purge` ลบ `journey_codebooks` ด้วย** — codebook เก็บ verbatim จากบทสัมภาษณ์
purge คือเส้นทาง PDPA hard-delete การทิ้งไว้คือข้อมูลส่วนบุคคลค้างระบบ

**ค่า default ของ `journey_budget.estimate()` ห้ามขยับ**
`n_pain_options=6`, `allow_other_text=False`, `severity_scope="state"` ถูกเลือกให้ผลลัพธ์
เท่าเดิมเป๊ะ (330.3 วินาที / 29.2 ข้อ ตาม `REFERENCE_INSTRUMENT`) ผู้เรียกใหม่ส่งค่าจริงเข้ามาเอง

---

## 5. บั๊กที่เจอระหว่างทาง และแก้ให้แล้ว

**`logging.info` ตายทั้งระบบ** (โค้ดเดิม ไม่ใช่ของงานนี้)
`_install_llm_concurrency_patch()` เรียก `logging.info` ตอน import ซึ่งไป auto-call
`basicConfig()` เปล่า ๆ ใส่ handler ให้ root แต่ทิ้ง level ไว้ที่ WARNING
พอถึง `logging.basicConfig(level=INFO, format=...)` ตัวจริง มันเลยเป็น **no-op เงียบ ๆ**

ผลคือ startup มี log 8 บรรทัดและ **ไม่มี `[INDEXES]` เลย** — คำสั่งใน `HANDOFF_CJM.md` §2(a)
ที่ให้ยืนยัน migration ด้วย log บรรทัดนั้น **ทำตามไม่ได้มาตั้งแต่แรก**

แก้ด้วย `force=True` · ยืนยันแล้วว่า log ออกตามรูปแบบที่ตั้งใจ พร้อม `[INDEXES] Created: 29`
ข้อควรรู้: `[LLM-PATCH]` ยังไม่โผล่ เพราะมันถูก log **ก่อน** การตั้งค่า logging ใด ๆ จะทำงานได้
อย่าถือว่าการหายไปของบรรทัดนั้นเป็นความผิดปกติ

---

## 5b. บั๊กที่โผล่เฉพาะตอนกดใช้จริง

สี่ตัวนี้ผ่าน syntax check และผ่านเทสต์ backend ทั้งหมด เจอเพราะเปิดเบราว์เซอร์กดจริง

1. **`extract` ปฏิเสธเมื่อส่งแต่ `interviews`** — guard นับเฉพาะ `raw_text`/`mermaid`
   ทั้งที่ `interviews` คือทางหลัก (และเป็นทางเดียวที่ให้เส้น saturation ได้)
2. **TDZ crash หน้าผู้ตอบ** — ประกาศ `painCap` ไว้ใต้บล็อกที่ใช้มัน หน้าจอขาวทั้งหน้า
3. **lost update สองจุด** — `patchRow` ในวิซาร์ดและ `toggleCat` หน้าผู้ตอบ อ่าน state จาก
   closure แล้วเขียนทับ กดเร็ว ๆ สองครั้งจะหายไปหนึ่ง แก้เป็น functional updater ทั้งคู่
4. **candidate ซ้ำ** — ประโยคเดียวโดนหลาย cue (“ยาก” กับ “งง”) กลายเป็นหลายแถวที่ label
   เหมือนกัน แล้ว gate ห้าม label ซ้ำก็บล็อกการเปิดใช้ โดยที่นักศึกษาไม่ได้ทำอะไรผิด
   แก้สองชั้น: รวมกลุ่มที่มีหลักฐานชุดเดียวกัน และเติม cue ต่อท้ายเมื่อ label ยังชนกัน

และหนึ่งข้อที่สเปกกำหนดไว้แต่ผมลืมทำ: **คำตอบไม่ได้ถูกประทับ `codebook_version`**
ถ้าเปิดใช้ v2 ทีหลัง คำตอบเก่าจะถูกตีความด้วยคำนิยามใหม่เงียบ ๆ — ประทับแล้วและมีเทสปักไว้

---

## 6. วิธีตรวจ

```bash
cd backend
python -m pytest tests/test_journey_codebook.py -q          # 52  ไม่ต้องมี server
python -m pytest tests/test_journey_codebook_api.py -q      # 29  ต้องมี server + seed
python -m pytest tests/test_journey_two_step_flow.py -q     # 13  ต้องมี server + seed
python -m pytest tests/test_journey_phase1.py tests/test_journey_api_phase1.py -q
```

ชุด API ต้องมี `admin@swu.ac.th / admin123` และ `demo-journey-kafae-001` อยู่ในฐานข้อมูล
(`backend/scripts/seed_journey_demo.py`)

**เทสต์ล้างของตัวเองเสมอ** — ตอบแล้วถอน (อยู่ใน `finally`) และ purge study ที่สร้าง
หลังรันครบ demo ต้องยังมี 140 คำตอบพอดี ถ้าไม่ใช่ แปลว่ามีเทสหลุด cleanup

---

## 7. ยังไม่ได้ทำ — ตัดสินใจไว้แบบนี้

- **เสนอ category ใหม่จากหน้า back-coding** — ตั้งใจไม่ทำ เพราะจะเปิดช่องให้ label เข้าระบบ
  โดยไม่มี quote และไม่ผ่านการอนุมัติ ซึ่งเป็นสิ่งเดียวที่โมดูลนี้กันไว้ทั้งหมด
  ถ้าจะทำ ต้องเข้าเส้นทาง draft v(n+1) ตามปกติ
- **`edges` ที่จับคู่ไม่ได้** — นับไว้ใน `claimed_edges_unmatched` และรายงาน ไม่เดาจับคู่ให้
- **LLM booster** — ดูข้อ 3(จ)
- **การรวม (merge) candidate** — โครงสร้าง `merged_from` มีแล้ว แต่ยังไม่มี endpoint เฉพาะ
  ทำผ่าน `PUT` ได้ (ลบแถวหนึ่ง แล้วใส่ id ของมันใน `merged_from` ของอีกแถว)
