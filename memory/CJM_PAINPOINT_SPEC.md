# SPEC — Pain point ต้องสืบทอดมาจากงานวิจัยเชิงคุณภาพ (CJM)

**สถานะเอกสาร:** สเปกเท่านั้น · **ยังไม่ implement** · เขียนไว้ให้ agent ตัวถัดไปดึงผ่าน git
**วันที่:** 19 ส.ค. 2026
**ขอบเขต:** โมดูล Customer Journey เชิงปริมาณ (Phase 1 model-free ที่ ship แล้ว)
**เอกสารที่เกี่ยวข้อง:** `/app/HANDOFF_CJM.md` · `/app/memory/CJM_QUANT_SPEC.md` · `/app/memory/PRD.md`

---

## 0. ปัญหาที่ต้องแก้ (ข้อวิจารณ์ของผู้ใช้ — ถูกต้อง)

> "painpoint จริงมันต้องมาจากผลวิจัยเชิงคุณภาพสิ มา fix แค่นั้นได้ไง มันต้องรับช่วงงานมาจากอีก step"

ปัจจุบันรายการ pain point เป็น **ค่าคงที่ในโค้ด** (`PAIN_TAXONOMY` 10 ตัวเลือก / 8 ประเภท) ซึ่งผิดลำดับระเบียบวิธี:

1. **ผิดทิศทางของ inference** — งานเชิงคุณภาพมีหน้าที่ "ค้นพบ" ว่าปัญหาคืออะไรในภาษาของลูกค้า
   งานเชิงปริมาณมีหน้าที่ "วัดขนาด" ของสิ่งที่ค้นพบ · การ fix รายการไว้ล่วงหน้าเท่ากับข้ามขั้นการค้นพบ
   แล้วเอากรอบของผู้วิจัย (หรือของ agent) ไปครอบผู้ตอบ
2. **เกิด construct ที่ไม่ตรงบริบท** — คำว่า "ระบบ/แอป/เว็บมีปัญหา" ไม่มีความหมายกับการศึกษาที่ไม่มีแอป
   ส่วนปัญหาที่เป็นหัวใจของบริบทนั้นจริง ๆ (เช่น "ที่จอดรถเต็ม", "คิวตัดหน้า", "ไรเดอร์ยกเลิก")
   ไม่มีในรายการ ผู้ตอบจึงถูกบังคับเลือกช่องที่ใกล้เคียงที่สุด → **measurement error ที่มองไม่เห็น**
3. **ตัดวงจร qualitative → quantitative → qualitative** ที่ควรมี: ค้นพบ → วัด → กลับไปตีความ
4. **ตอนนี้ทำได้แค่แก้มือ** — เจ้าของศึกษาแก้ `study.pain_options[state_id]` เองได้ผ่าน API
   แต่ไม่มีที่มา ไม่มี provenance ไม่มีการลงรหัส (coding) และไม่มีการตรวจความน่าเชื่อถือ

**หลักที่ต้องยึดในสเปกนี้:** รายการ pain point ของการศึกษาหนึ่ง = **ผลลัพธ์ของการลงรหัสข้อมูลเชิงคุณภาพของการศึกษานั้น**
โดยมีมนุษย์อนุมัติทุกตัว และเก็บ verbatim ต้นทางไว้อ้างอิงได้เสมอ · ค่าคงที่ในโค้ดเป็นได้แค่ "ตัวช่วยเริ่มต้น" ที่ต้องยืนยัน ไม่ใช่คำตอบ

---

## 1. SPEC ปัจจุบัน (AS-IS)

### 1.1 ที่มาของรายการ pain point
| จุด | ไฟล์/บรรทัด | พฤติกรรม |
|---|---|---|
| taxonomy คงที่ | `backend/routes/journey_instrument.py` L61–90 (`PAIN_TYPES`, `PAIN_TAXONOMY`, `DEFAULT_PAIN_OPTIONS`, `pain_type_of`) | 10 ตัวเลือก จับกลุ่มเป็น 8 ประเภท hard-code |
| แจกให้ทุกขั้น | `journey_instrument.py` L256 `default_pain_options(states)` | ทุก state ได้รายการ **เดียวกันทั้งชุด** |
| ตอนสร้างการศึกษา | `backend/routes/journey.py` L1060 | `study.pain_options = default_pain_options(states)` |
| แก้ได้เฉพาะมือ | `journey.py` L1138 (`StudyUpdate.pain_options`) | รับ dict ตรง ๆ ไม่มี validation เชิงระเบียบวิธี ไม่มี provenance |
| ส่งให้ผู้ตอบ | `journey.py` L1034 (public payload) | ผู้ตอบเห็นเฉพาะรายการที่ตั้งไว้ |
| รับคำตอบ | `journey.py` L193–205 (`_clean_submission`) | `pain.nominated` (ผู้ตอบเลือกขั้นที่มีปัญหา, UI จำกัด 2 ขั้น), `severity_0_10` ต่อขั้น, `categories` ต้องอยู่ใน `pain_options[sid]` เท่านั้น, `note` ≤300 ตัวอักษร |
| วิเคราะห์ | `journey.py` L382–430 (nodes), L728+ (`_pain_matrix`), L560+ (`_touchpoint_summary`) | นับ nomination rate + Wilson CI, severity แบบมีเงื่อนไข, ตาราง ปัญหา×ขั้น และ ปัญหา×ช่องทาง, จับกลุ่มตามประเภทจาก `pain_type_of` |

### 1.2 ท่อเชิงคุณภาพที่มีอยู่แล้ว (ใช้ยังไม่เต็ม)
- `POST /api/generate-journey-map` (`backend/server.py` L3550) → เก็บลง `qualitative_runs` (L3639) คืน `qualitative_run_id`
- `GET /api/journey/qualitative-runs` (`journey.py` L1247)
- `POST /api/journey/studies/{id}/seed` (`journey.py` L1261–1285) → ใช้ `_extract_steps()` (L1589)
  **ดึงเฉพาะ "ชื่อขั้นตอน"** จาก mermaid/ข้อความ · **ไม่ดึง pain point เลย**
- `study.qualitative_seed` เก็บ `raw_text`, `mermaid_code`, `extracted_labels`, `qualitative_run_id`

### 1.3 ช่องว่างสรุป (AS-IS)
1. pain point ไม่ผูกกับ `qualitative_runs` ใด ๆ
2. ไม่มี "ขั้นตอนลงรหัส" (open coding → category) และไม่มี verbatim อ้างอิงต่อ category
3. ไม่มี `pain_options` ต่างกันรายขั้น (ทุกขั้นเหมือนกันหมด)
4. ไม่มีช่อง "อื่น ๆ ระบุ" ให้ผู้ตอบพิมพ์ปัญหาที่ไม่มีในรายการ → ไม่มีทางรู้ว่ารายการขาดอะไร
5. ไม่มีการตรวจความน่าเชื่อถือของการลงรหัส (inter-coder agreement)
6. ไม่มี versioning ของชุด category (แก้แล้วข้อมูลเก่าเทียบกับใหม่ไม่ได้)
7. `severity_0_10` ถามต่อ "ขั้น" ไม่ใช่ต่อ "ประเภทปัญหา"
8. UI จำกัด 2 ขั้นต่อคน แต่ backend ไม่ได้ enforce (ไม่ตรงกัน — ควรตัดสินให้ชัด)

---

## 2. SPEC ที่ควรแก้ (TO-BE)

### 2.1 ภาพรวมท่อ (pipeline)
```
[S0] ข้อมูลเชิงคุณภาพ            สัมภาษณ์/diary/open-ended ที่นักศึกษามีอยู่
        ↓  (มนุษย์วางข้อความ หรือเลือก qualitative_run)
[S1] สกัดผู้สมัคร (candidate)     deterministic + AI ช่วย "เสนอ" เท่านั้น
        ↓  ผลลัพธ์: candidate list พร้อม verbatim ทุกชิ้น
[S2] ลงรหัส (open → axial)        มนุษย์ merge/rename/ทิ้ง/ผูกเข้าขั้นตอน + ผูกประเภท
        ↓  ต้องกด "อนุมัติ" ทุก category
[S3] ล็อกเป็น codebook v1         pain_codebook (มี version, provenance, ขั้นที่ใช้)
        ↓
[S4] วัดเชิงปริมาณ                ผู้ตอบเห็นเฉพาะ category ของขั้นนั้น + "อื่น ๆ ระบุ"
        ↓
[S5] back-coding                  ข้อความ "อื่น ๆ" ถูกลงรหัสกลับ → เสนอ codebook v2
        ↓
[S6] รายงาน                       ทุกตัวเลขมี provenance: มาจาก codebook เวอร์ชันไหน ต้นทางไหน
```
**กฎเหล็ก:** AI/heuristic เป็นได้แค่ผู้เสนอ (`status: "suggested"`) · ไม่มี category ใดถูกใช้เก็บข้อมูลได้ถ้าไม่มี `approved_by` + `approved_at`

### 2.2 Data model ที่เพิ่ม/เปลี่ยน

**collection ใหม่ `journey_pain_codebooks`**
```
{
  id, study_id, version: int, status: "draft"|"active"|"superseded",
  source: { qualitative_run_ids: [str], pasted_text_sha1: [str], n_interviews: int|null,
            method_note_th: str },              # ต้องกรอกก่อน active
  categories: [{
      id: "pc1",                                # id คงที่ ห้ามเปลี่ยนเมื่อ active แล้ว
      label_th: str,                            # ภาษาลูกค้า ไม่ใช่ศัพท์แบรนด์
      definition_th: str,                       # เกณฑ์ตัดสินว่านับ/ไม่นับ (จำเป็นต่อ coder คนที่ 2)
      pain_type: "process|time|information|money|service|functional|emotional|access|other",
      state_ids: [str],                         # ขั้นที่จะโชว์ตัวเลือกนี้ (ว่าง = ทุกขั้น)
      provenance: { run_ids: [str],
                    quotes: [{ text: str, source_ref: str }],   # ต้องมี ≥1 เมื่อ status=approved
                    origin: "qualitative"|"back_coded"|"library_default" },
      status: "suggested"|"approved"|"rejected",
      approved_by, approved_at, rejected_reason,
      merged_from: [str]                        # ถ้าเกิดจากการรวมโค้ด
  }],
  reliability: { second_coder_id: str|null, n_double_coded: int,
                 percent_agreement: float|null, cohen_kappa: float|null,
                 computed_at: str|null },
  created_at, updated_at, activated_at
}
```

**`journey_studies` (เพิ่ม)**
```
pain_codebook_id: str|null          # codebook ที่ active
pain_codebook_version: int
pain_source: "qualitative"|"library_default"   # ต้องประกาศ และถูกพิมพ์ในทุก export
allow_pain_other_text: bool = True             # ช่อง "อื่น ๆ ระบุ"
pain_nomination_cap: int = 2                   # ย้ายมาเป็นค่าจริงใน study (เลิกฝังใน UI)
```
- `study.pain_options` → **deprecated** แต่ยังอ่านได้ (สร้างจาก codebook ตอน serve public payload)
- `structure_hash` (`journey_instrument.py` L~300) ต้องรวม `pain_codebook_version` และจำนวน category ต่อขั้น
  → เปลี่ยน codebook หลังเปิดเก็บข้อมูล = โครงสร้างเปลี่ยน = **ห้าม** (ตามกฎเดิม) ยกเว้นแก้เฉพาะ `label_th`/`definition_th` (นับเป็น `content_revision`)

**`journey_responses` (เพิ่มในบล็อก `pain`)**
```
pain: {
  nominated: [state_id],
  <state_id>: { severity_0_10, category_ids: [pc*],       # ← เก็บเป็น id ไม่ใช่ข้อความ
                other_text: str|null,                     # ผู้ตอบพิมพ์เอง
                back_coded_ids: [pc*]|null,               # เติมภายหลังโดยมนุษย์
                back_coded_at, back_coded_by }
}
codebook_version: int                                      # ตรึงไว้กับคำตอบ
```
**เหตุผลที่ต้องเก็บ id:** ตอนนี้เก็บเป็นข้อความ ทำให้แก้คำ 1 ตัวอักษรเท่ากับสร้าง category ใหม่เงียบ ๆ

### 2.3 API ที่เพิ่ม (ทั้งหมดต้อง owner-scoped เหมือน endpoint เดิม)
| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/journey/studies/{id}/pain-codebook/extract` | รับ `qualitative_run_ids[]` หรือ `raw_text` → คืน candidate categories (`status:"suggested"`) พร้อม verbatim · deterministic ก่อน, LLM เป็น optional booster |
| GET | `/api/journey/studies/{id}/pain-codebook` | คืน codebook active + draft |
| PUT | `/api/journey/studies/{id}/pain-codebook` | แก้ draft: merge / rename / ผูก `state_ids` / ตั้ง `pain_type` / approve / reject |
| POST | `/api/journey/studies/{id}/pain-codebook/activate` | ตรวจ gate ทั้งหมด (ข้อ 2.5) แล้วเลื่อนเป็น `active` (ล็อก id) |
| POST | `/api/journey/studies/{id}/pain-codebook/reliability` | บันทึกผลลงรหัสของ coder คนที่ 2 → คำนวณ percent agreement + Cohen's κ |
| GET | `/api/journey/studies/{id}/pain-other-texts` | รายการ `other_text` ที่ยังไม่ back-code |
| POST | `/api/journey/studies/{id}/pain-back-code` | ผูก `other_text` เข้ากับ category ที่มี หรือเสนอ category ใหม่เข้าสู่ draft v(n+1) |

**endpoint เดิมที่ต้องแก้**
- `POST /studies/{id}/seed` — เพิ่ม `include_pain: bool` (default `true`) ให้ดึง candidate pain พร้อมชื่อขั้นในครั้งเดียว
- `POST /studies/{id}/lock-instrument` — **บล็อก** ถ้า `pain_source == "library_default"` และผู้ใช้ไม่ได้กดยืนยันข้อ 2.5(6)
- `GET /public/{share_token}` — คืน `pain_options` ที่คำนวณ **ต่อขั้น** จาก codebook + ธง `allow_pain_other_text`
- `GET /studies/{id}/analysis` — เพิ่ม `results.pain_provenance` = `{codebook_version, source, n_quotes, reliability, other_rate, back_coded_rate}` และให้ `pain_matrix` อ้าง `category_id` คู่กับ label

### 2.4 การสกัด candidate (S1) — deterministic ก่อน AI
1. ตัดประโยคจาก verbatim ด้วยกฎ (ตัวคั่น, ความยาว 4–120 ตัวอักษร)
2. จับคู่คำบ่งชี้ปัญหาแบบภาษาไทย: `ไม่, ยาก, นาน, รอ, งง, สับสน, เสีย, แพง, กลัว, หงุดหงิด, ผิดหวัง, ไม่มั่นใจ, ต้องกลับมา, ซ้ำ, เต็ม, ไกล, ปิด, ยกเลิก`
3. รวมคำที่ก้านเดียวกัน (normalize ช่องว่าง/วรรณยุกต์ซ้ำ) → นับความถี่ + เก็บ quote ทุกชิ้น
4. LLM (Claude ผ่าน Emergent LLM key ตามที่ระบบใช้อยู่) **optional**: ทำได้แค่ 2 อย่าง
   - เสนอ `label_th` ที่กระชับขึ้นจาก quote ที่ให้มา (ห้ามแต่งเนื้อหาใหม่)
   - เสนอ `pain_type` — และต้องมีปุ่มให้มนุษย์แก้
   ทุก candidate จาก LLM ต้องมี `provenance.quotes` ที่ **คัดลอกมาจากข้อความจริง** ถ้าไม่มี quote → ระบบทิ้งทันที
5. ห้ามส่ง candidate ที่ไม่มี quote เข้าสู่ draft (กัน hallucination โดยโครงสร้าง ไม่ใช่โดยคำสั่ง prompt)

### 2.5 Gate ก่อน activate codebook (บล็อกจริง ไม่ใช่คำเตือน)
1. ทุก category ที่ `approved` มี `definition_th` และ `provenance.quotes` ≥ 1
2. จำนวน category ที่ approved: **3–12** ต่อการศึกษา (เกิน 12 ทำให้ผู้ตอบอ่านไม่ไหวและงบเวลาบวม)
3. category ต่อ **หนึ่งขั้น** ไม่เกิน 8 (คุมเวลาตอบ)
4. `source.method_note_th` ไม่ว่าง (จำนวนผู้ให้สัมภาษณ์/วิธีเก็บ) — จะถูกพิมพ์ในภาคผนวก
5. ไม่มี label ซ้ำ และไม่มี label ที่ผ่าน PDPA blocklist (`lib/consent.py::check_blocklist`)
6. ถ้าผู้ใช้ยืนกรานใช้ชุด default ของระบบ (`library_default`) ต้องกดยืนยันข้อความว่า
   "รายการนี้ไม่ได้มาจากข้อมูลเชิงคุณภาพของการศึกษานี้" และข้อความนี้ต้องปรากฏใน dashboard + ทุกไฟล์ export
7. `reliability` เป็น **คำเตือน ไม่บล็อก** (นักศึกษาบางคนไม่มี coder คนที่สอง) แต่ถ้าไม่มี ต้องแสดงเป็นข้อจำกัด

### 2.6 ผลกระทบด้านงบเวลา (`lib/journey_budget.py`)
- ตัวเลือก pain ต่อขั้นเปลี่ยนจากคงที่ 10 → แปรผัน (≤8) ⇒ `estimate()` ต้องรับ `n_pain_options`
  แทนการสมมติจำนวนคงที่ (ปัจจุบันคิดผ่าน `pain_nominations`/`incident_share`)
- ช่อง "อื่น ๆ ระบุ" (ข้อความสั้น) ⇒ `+SEC_OPEN_TEXT_SHORT` ต่อ nomination ที่เลือก "อื่น ๆ"
  ประมาณด้วย `p_other` (เริ่มที่ 0.15 แล้ว calibrate จากข้อมูลจริง)
- เพดานรวมยังคือ 480 วินาที และยัง hard-block ตามเดิม

### 2.7 การรายงาน (dashboard + export)
1. ทุกการ์ดที่เกี่ยวกับ pain ต้องมีบรรทัด provenance: "ประเภทปัญหามาจากการลงรหัสข้อมูลเชิงคุณภาพของการศึกษานี้ (codebook v2, จาก 12 บทสัมภาษณ์)" หรือข้อความเตือนตามข้อ 2.5(6)
2. แสดง **other_rate**: สัดส่วน nomination ที่ผู้ตอบเลือก "อื่น ๆ" — ถ้า > 15% ให้ขึ้นคำเตือนว่า codebook ยังไม่ครอบคลุม (เข้ากันกับ pattern `diagnostics.warnings` ที่มีอยู่)
3. แสดง **back_coded_rate** และ κ (ถ้ามี) พร้อมข้อจำกัดถ้าไม่มี
4. ปุ่ม "ดู verbatim ต้นทาง" ต่อ category (แสดง quote ที่อนุมัติไว้) — เพื่อให้กรรมการสอบตรวจย้อนได้
5. ห้ามเปรียบเทียบสัดส่วนปัญหาข้าม codebook version — ถ้า version ต่างกัน ต้องขึ้นข้อความห้ามเทียบ

### 2.8 Migration
- การศึกษาเดิมทั้งหมด: ตั้ง `pain_source = "library_default"`, `pain_codebook_id = null`
  → ทำงานได้เหมือนเดิม แต่ dashboard/export ขึ้นข้อความจำกัดตามข้อ 2.5(6)
- คำตอบเดิมเก็บ category เป็นข้อความ: เขียน mapper อ่านได้ทั้งสองแบบ (`category_ids` หรือ `categories`)
  **ห้าม** เขียนสคริปต์เดาย้อนหลังว่าข้อความไหน = category id ไหน
- เดโม `demo-journey-kafae-001`: ทำ codebook สังเคราะห์ v1 พร้อม quote ปลอมที่ระบุชัดว่า "ข้อมูลจำลอง"
  หรือคง `library_default` ไว้และให้เห็นคำเตือน (เลือกอย่างหลังถ้าต้องการโชว์กลไกคำเตือน)

### 2.9 สิ่งที่ต้องเลิกทำ (จงใจ)
- เลิกใช้ `PAIN_TAXONOMY` เป็นแหล่งความจริงของการศึกษา → ลดบทบาทเหลือ `library_default` ที่ต้องยืนยัน
- เลิกให้ทุกขั้นมีรายการเดียวกันโดยอัตโนมัติ
- เลิกเก็บ category เป็น free text ในคำตอบ
- ไม่เพิ่ม composite "pain index" ใด ๆ (คงหลักเดิม: รายงานแยกแกน + ธงจับตา)

---

## 3. เกณฑ์ยอมรับ (acceptance) และรายการเทสที่ต้องเขียน

**Backend (pytest, ต่อจาก `backend/tests/test_journey_phase1.py` 61 เคสเดิม)**
1. candidate ที่ไม่มี quote ถูกทิ้ง — `extract` ไม่คืน category ที่ไม่มี `provenance.quotes`
2. activate ถูกบล็อกเมื่อ: ไม่มี definition / ไม่มี quote / category > 12 / ต่อขั้น > 8 / method_note ว่าง / label ซ้ำ / ติด PDPA blocklist
3. activate สำเร็จ → `structure_hash` เปลี่ยน และแก้ codebook หลังมีคำตอบแล้วถูกปฏิเสธ (400)
4. แก้เฉพาะ `label_th`/`definition_th` → `content_revision` +1 และ `structure_hash` **ไม่เปลี่ยน**
5. public payload คืน category **เฉพาะของขั้นนั้น** ตาม `state_ids`
6. คำตอบที่ส่ง `category_ids` ที่ไม่อยู่ใน codebook ถูกตัดออก (ไม่ 500)
7. `other_text` ถูกเก็บ, `other_rate` คำนวณถูก, > 15% ขึ้น warning ใน `diagnostics.warnings`
8. back-coding ผูก other_text เข้ากับ category → `back_coded_rate` เพิ่ม และ `pain_matrix` เปลี่ยนตาม
9. κ / percent agreement คำนวณตรงตามสูตร (มีเคสตรงกันหมด = 1.0 และเคสสุ่ม ≈ 0)
10. `pain_matrix` แยกด้วย `category_id` และไม่นับซ้ำเมื่อ label ซ้ำกันข้ามขั้น
11. `analysis.results.pain_provenance` ครบทุกฟิลด์ และมีคำเตือนเมื่อ `pain_source == "library_default"`
12. งบเวลา: `n_pain_options` มากขึ้น → วินาทีเพิ่ม และยัง hard-block ที่เพดานเดิม
13. อ่านคำตอบเก่า (เก็บเป็นข้อความ) ได้โดยไม่ error
14. เทียบข้าม codebook version → payload มีธงห้ามเทียบ

**Frontend (ทดสอบด้วย testing agent)**
15. วิซาร์ดมีขั้น "ลงรหัสปัญหาจากข้อมูลเชิงคุณภาพ": วางข้อความ/เลือก run → เห็น candidate + quote → merge/rename/approve → activate
16. ปุ่ม activate ถูก disable พร้อมเหตุผลไทยที่ระบุ gate ที่ยังไม่ผ่าน
17. หน้าผู้ตอบเห็นตัวเลือกเฉพาะของขั้นนั้น + ช่อง "อื่น ๆ ระบุ"
18. dashboard แสดง provenance, other_rate, κ/ข้อจำกัด และปุ่มดู verbatim
19. การศึกษาเดิม (library_default) แสดงคำเตือนชัดเจนทั้งใน dashboard และไฟล์ export

---

## 4. ลำดับงานที่แนะนำ (สำหรับ agent ตัวถัดไป)
1. **P0** collection + model + `GET/PUT/activate` codebook + gate ทั้งหมด + เทส 1–6, 11
2. **P0** public payload ต่อขั้น + submission เก็บ `category_ids` + `other_text` + เทส 5–7, 13
3. **P1** `extract` (deterministic) + UI ลงรหัสในวิซาร์ด + เทส 1, 15–17
4. **P1** provenance ใน dashboard + export + คำเตือน library_default + เทส 11, 18–19
5. **P2** back-coding loop + reliability (κ) + เทส 8–9
6. **P2** LLM booster (ผ่าน integration playbook เท่านั้น) + งบเวลา `n_pain_options` + เทส 12

## 5. คำถามที่ต้องให้ผู้ใช้ตัดสิน
1. `pain_nomination_cap` คงที่ 2 ขั้นต่อคน หรือให้ตั้งได้ต่อการศึกษา (2–3)?
2. บังคับ coder คนที่ 2 (κ) สำหรับงานระดับวิทยานิพนธ์ หรือให้เป็นทางเลือกพร้อมข้อจำกัด?
3. `severity_0_10` ย้ายไปถามต่อ "ประเภทปัญหา" (แม่นกว่า, +8–12 วินาที) หรือคงไว้ต่อขั้น?
4. อนุญาตให้ใช้ชุด `library_default` ได้เลยหรือไม่ (พร้อมคำเตือน) หรือบล็อกไปเลยถ้าไม่มีข้อมูลเชิงคุณภาพ?
