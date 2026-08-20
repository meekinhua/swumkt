# SPEC — Customer Journey สองขั้น: เชิงคุณภาพตั้งสมมติฐาน · เชิงปริมาณวัดขนาดและตรวจสอบกลับ

**สถานะเอกสาร:** สเปก · **ฉบับแก้ครั้งที่ 2** (ขยายขอบเขตจากเดิมที่พูดเฉพาะ pain point)
**วันที่:** 20 ส.ค. 2026
**แทนที่:** ฉบับ 19 ส.ค. 2026 (`CJM_PAINPOINT_SPEC.md` เดิม) — เก็บ path เดิมไว้เพื่อให้ handoff เก่าชี้ถูก
**เอกสารที่เกี่ยวข้อง:** `/app/HANDOFF_CJM.md` · `/app/memory/CJM_QUANT_SPEC.md` · `/app/memory/PRD.md`

---

## 0. เจตนา — โมดูลนี้ทำงานสองขั้น

> "ให้ได้ customer journey ที่ทำงาน 2 step · แบบแรกเป็นเชิงคุณภาพที่ใช้เทคนิคเดิม คือเอาข้อมูลเชิงคุณภาพที่เก็บได้มาสร้าง map หา painpoint หา touchpoint ทำ linear / nonlinear map · ส่วนเชิงปริมาณ คือเอาผลของเชิงคุณภาพมาต่อยอด ให้มีตัวเลขและหลักฐานจาก sample ที่มากขึ้นและน่าเชื่อถือมากขึ้น"

| | ขั้นที่ 1 — เชิงคุณภาพ | ขั้นที่ 2 — เชิงปริมาณ |
|---|---|---|
| ถามว่า | *อะไร* คือเส้นทาง ปัญหา และจุดสัมผัส — ในภาษาลูกค้า | *เท่าไร* — ใหญ่แค่ไหน เกิดกับใคร ตรงไหนของเส้นทาง |
| ข้อมูล | สัมภาษณ์ / diary / open-ended จำนวนน้อย ลึก | แบบสอบถามจำนวนมาก สั้น |
| ผลลัพธ์ | **Journey Codebook** ที่มนุษย์อนุมัติ | สัดส่วน + ช่วงความเชื่อมั่น + เมทริกซ์การเปลี่ยนสถานะ |
| บทบาทของ AI | **ผู้เสนอเท่านั้น** | ไม่มีบทบาทในการคำนวณเลย |

**หลักที่ยึด** — ขั้นที่ 1 สร้าง *สมมติฐาน* ขั้นที่ 2 *วัดขนาด* และ **ตรวจสอบย้อนกลับว่าขั้นที่ 1 ครอบคลุมพอหรือไม่**
ข้อสุดท้ายคือสิ่งที่ระบบเดิมไม่มี และเป็นหัวใจของฉบับแก้นี้: ถ้าขั้นที่ 1 ทำไม่ครบ ขั้นที่ 2 ต้อง **บอกได้ว่าไม่ครบ** ด้วยตัวเลข ไม่ใช่ปล่อยผ่าน

**กฎเหล็ก** — ไม่มีรายการใด (ขั้นตอน / จุดสัมผัส / ประเภทปัญหา) ถูกใช้เก็บข้อมูลได้
ถ้าไม่มี `approved_by` + `approved_at` และไม่มี verbatim ต้นทางอย่างน้อย 1 ชิ้น
บังคับด้วย **โครงสร้างข้อมูล** ไม่ใช่ด้วยข้อความใน prompt

---

## 1. AS-IS

### 1.1 ขั้นเชิงคุณภาพวันนี้ — มีอยู่ แต่ผลลัพธ์ไม่ใช่ข้อมูลที่เครื่องอ่านต่อได้
| จุด | ไฟล์/บรรทัด | พฤติกรรม |
|---|---|---|
| สร้าง map | `backend/server.py` L3551 `generate_journey_map` | รับ `raw_data`, `research_context`, `journey_type` (A/B), `journey_style` (**linear/nonlinear**) |
| เก็บผล | `server.py` L3639 → `qualitative_runs` | เก็บ `raw_text`, `context`, `mermaid_code`, `analysis` (**ร้อยแก้วล้วน**), `created_at` |
| อ่านรายการ | `routes/journey.py` L1247 `GET /api/journey/qualitative-runs` | |
| ส่งต่อขั้นที่ 2 | `journey.py` L1252 `POST /studies/{id}/seed` → `_extract_steps()` L1589 | **ดึงได้เฉพาะ "ชื่อขั้นตอน"** ด้วย regex จาก mermaid |

**ช่องว่างที่ใหญ่ที่สุด:** ผลของขั้นที่ 1 คือ *ร้อยแก้ว + ไดอะแกรม* ไม่มีโครงสร้าง
`journey_style` ที่ผู้ใช้เลือก (linear / nonlinear) **ไม่ถูกเก็บลง `qualitative_runs` เลย** และเส้นเชื่อม (edges) ในไดอะแกรมถูกทิ้งทั้งหมด
ขั้นที่ 2 จึงรับช่วงได้แค่ชื่อขั้นตอน — pain point และ touchpoint ต้องเริ่มใหม่จากศูนย์

### 1.2 ขั้นเชิงปริมาณวันนี้ — แข็งแรง แต่รับช่วงมาจากค่าคงที่
| จุด | ไฟล์/บรรทัด | พฤติกรรม |
|---|---|---|
| taxonomy ปัญหาคงที่ | `routes/journey_instrument.py` L61–90 | 10 ตัวเลือก / 8 ประเภท hard-code |
| แจกเหมือนกันทุกขั้น | `journey_instrument.py` L256 `default_pain_options` | ทุก state ได้รายการเดียวกัน |
| ตอนสร้างการศึกษา | `journey.py` L1060 | `study.pain_options = default_pain_options(states)` |
| แก้ได้เฉพาะมือ | `journey.py` L1138 `StudyUpdate.pain_options` | รับ dict ตรง ๆ ไม่มี provenance |
| คีย์รวมกลุ่ม | `journey_instrument.py` L278 `compute_structure_hash` | รวม `pain_option_counts` แล้ว (ดี) แต่ยังไม่รวมเวอร์ชัน codebook |
| วิเคราะห์ | `journey.py` L560 `_touchpoint_summary`, L728 `_pain_matrix` | nomination rate + Wilson CI, severity แบบมีเงื่อนไข |

### 1.3 ช่องว่างสรุป
1. ผลเชิงคุณภาพไม่ถูกแปลงเป็นโครงสร้าง — `edges`, `touchpoints`, `pain` หายหมด เหลือแต่ชื่อขั้น
2. `journey_style` (linear/nonlinear) ไม่ถูกเก็บ จึงเทียบกับผลเชิงปริมาณไม่ได้
3. pain ไม่ผูกกับ `qualitative_runs` ใด ๆ ไม่มีการลงรหัส ไม่มี verbatim
4. `pain_options` เหมือนกันทุกขั้น
5. ไม่มีช่อง "อื่น ๆ ระบุ" → ไม่มีทางรู้ว่ารายการขาดอะไร
6. ไม่มีการตรวจความน่าเชื่อถือของการลงรหัส
7. ไม่มี versioning ของชุด category
8. คำตอบเก็บ category เป็น **ข้อความ** → แก้คำ 1 ตัวอักษร = สร้าง category ใหม่เงียบ ๆ
9. UI จำกัด 2 ขั้นต่อคน แต่ backend ไม่ enforce — ข้อมูลที่เก็บมาแล้วอาจไม่ตรงกับที่คิด

---

## 2. TO-BE

### 2.1 ภาพรวมท่อ

```
ขั้นที่ 1 — เชิงคุณภาพ
[Q0] ข้อมูลดิบ            สัมภาษณ์ / diary / open-ended
      ↓
[Q1] สร้าง map            generate_journey_map (เทคนิคเดิม) → prose + mermaid + linear/nonlinear
      ↓
[Q2] สกัดเป็นโครงสร้าง     deterministic ก่อน · LLM เสนอได้เท่านั้น · ทุกชิ้นต้องมี verbatim
      ↓  ผลลัพธ์: states, edges, touchpoints, pain candidates (status="suggested")
[Q3] มนุษย์ลงรหัส          merge / rename / ผูกขั้น / ผูกประเภท / อนุมัติทีละตัว
      ↓
[Q4] ล็อกเป็น Journey Codebook v1   (active · id คงที่ · มี provenance ครบ)

ขั้นที่ 2 — เชิงปริมาณ
[N1] สร้างเครื่องมือจาก codebook     ผู้ตอบเห็นเฉพาะรายการของขั้นนั้น + "อื่น ๆ ระบุ"
      ↓
[N2] เก็บข้อมูล                     คำตอบตรึงกับ codebook_version
      ↓
[N3] วัดขนาด                        Wilson CI, severity, Markov, touchpoint
      ↓
[N4] ตรวจสอบย้อนกลับขั้นที่ 1        other_rate · edge coverage · saturation
      ↓
[N5] back-coding                    "อื่น ๆ" → ลงรหัสกลับ → เสนอ codebook v2
      ↓
[N6] รายงาน                         ทุกตัวเลขบอกได้ว่ามาจาก codebook เวอร์ชันไหน ต้นทางไหน
```

### 2.2 Journey Codebook — สัญญาส่งต่อระหว่างสองขั้น

**ทำไมต้องรวมเป็นก้อนเดียว ไม่แยกเป็น pain codebook อย่างเดียว:** ขั้นตอน จุดสัมผัส และประเภทปัญหา
ต้องเปลี่ยนพร้อมกัน เพราะทั้งสามอย่างประกอบกันเป็น `structure_hash` ถ้าแยกเวอร์ชันกัน
จะเกิดสภาพที่ pain เป็น v2 แต่ states เป็น v1 แล้วไม่มีใครบอกได้ว่าคำตอบชุดหนึ่งเทียบกับอะไรได้บ้าง

**collection ใหม่ `journey_codebooks`**

```
{
  id, study_id, version: int, status: "draft"|"active"|"superseded",

  source: {
    qualitative_run_ids: [str],
    pasted_text_sha1: [str],
    n_interviews: int|null,              # ใช้จริง ดูข้อ 2.7(3)
    collection_method_th: str,           # "สัมภาษณ์กึ่งโครงสร้าง 12 คน ..." — พิมพ์ในภาคผนวก
    journey_style: "linear"|"nonlinear"  # สมมติฐานจากขั้นที่ 1 — ดูข้อ 2.7(2)
  },

  states: [{ id, label_th, definition_th, order: int,
             role: "step"|"conv"|"abandon"|"unknown",
             provenance: {...}, status, approved_by, approved_at }],

  edges: [{ from_state_id, to_state_id,
            claimed_in_qualitative: bool,    # ขั้นที่ 1 บอกว่ามีเส้นนี้
            provenance: {...} }],            # ใช้ทดสอบกับ Markov ในข้อ 2.7(2)

  touchpoints: [{ id, label_th, definition_th,
                  channel_type: "physical|app|web|phone|social|person|other",
                  state_ids: [str], applies_to: "all"|"selected",
                  provenance: {...}, status, approved_by, approved_at }],

  pain_categories: [{
      id: "pc1",                          # ห้ามเปลี่ยนเมื่อ active แล้ว
      label_th: str,                      # ภาษาลูกค้า ไม่ใช่ศัพท์แบรนด์
      definition_th: str,                 # เกณฑ์ตัดสินว่านับ/ไม่นับ — จำเป็นต่อ coder คนที่ 2
      pain_type: "process|time|information|money|service|functional|emotional|access|other",
      state_ids: [str], applies_to: "all"|"selected",
      provenance: { run_ids: [str],
                    quotes: [{ text, source_ref }],       # ต้องมี ≥1 เมื่อ approved
                    origin: "qualitative"|"back_coded"|"prior_literature"|"library_default",
                    citation_th: str|null },              # บังคับเมื่อ origin=prior_literature
      status: "suggested"|"approved"|"rejected",
      approved_by, approved_at, rejected_reason,
      merged_from: [str]
  }],

  reliability: {
      mode: "none"|"second_coder"|"test_retest",
      coder_ref: str|null, n_double_coded: int,
      percent_agreement: float|null,
      per_category: [{ category_id, kappa: float|null, prevalence: float,
                       n_agree: int, n_total: int }],     # ดูข้อ 2.7(4) — ห้ามมีค่า κ รวมค่าเดียว
      krippendorff_alpha: float|null,
      computed_at: str|null
  },

  saturation: [{ interview_index: int, n_new_categories: int,
                 cumulative: int }],       # เส้นอิ่มตัว ดูข้อ 2.7(3)

  created_at, updated_at, activated_at
}
```

**`applies_to` แทน "ลิสต์ว่าง = ทุกขั้น"** — ลิสต์ว่างแยกไม่ออกจาก "ยังไม่ได้ผูก" ซึ่งเป็นกับดัก
`applies_to: "all"` คือเจตนา `applies_to: "selected"` + `state_ids` ว่าง คือ **ยังทำไม่เสร็จ** และ gate ต้องบล็อก

**`journey_studies` (เพิ่ม)**
```
codebook_id: str|null
codebook_version: int
pain_source: "qualitative"|"prior_literature"|"library_default"   # ประกาศเสมอ พิมพ์ในทุก export
allow_pain_other_text: bool = True
pain_nomination_cap: int = 2                # 2–3 ตั้งได้ต่อการศึกษา · enforce ที่ backend
severity_scope: "state"|"state_and_category" = "state_and_category"
```
- `study.pain_options` → **deprecated** แต่ยังอ่านได้ (สร้างจาก codebook ตอน serve public payload)
- `compute_structure_hash` (`journey_instrument.py` L278) เพิ่ม `codebook_version` และจำนวน category ต่อขั้น
  → เปลี่ยน codebook หลังเปิดเก็บข้อมูล = **ห้าม** ยกเว้นแก้เฉพาะ `label_th` / `definition_th`
  ซึ่งนับเป็น `content_revision` และ **ไม่** เปลี่ยน hash (กลไกนี้มีอยู่แล้วที่ `journey.py` L1203)

**`journey_responses` (เพิ่มในบล็อก `pain`)**
```
pain: {
  nominated: [state_id],
  <state_id>: {
      severity_0_10,                       # ต่อขั้น (คงไว้)
      category_ids: [pc*],                 # ← เก็บ id ไม่ใช่ข้อความ
      category_severity: { pc1: int },     # ต่อหมวดที่เลือกจริงเท่านั้น (ดูข้อ 3.3)
      other_text: str|null,
      back_coded_ids: [pc*]|null, back_coded_at, back_coded_by
  }
}
codebook_version: int
```

### 2.3 API

**ขั้นที่ 1 → โครงสร้าง**
| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/journey/studies/{id}/codebook/extract` | รับ `qualitative_run_ids[]` หรือ `raw_text` → คืน candidate **ทั้งสามชนิด** (states / touchpoints / pain) พร้อม verbatim · deterministic ก่อน · LLM optional |
| GET | `/api/journey/studies/{id}/codebook` | คืน active + draft |
| PUT | `/api/journey/studies/{id}/codebook` | แก้ draft: merge / rename / ผูก `state_ids` / ตั้งประเภท / approve / reject |
| POST | `/api/journey/studies/{id}/codebook/activate` | ตรวจ gate ทั้งหมด (2.6) แล้วเลื่อนเป็น `active` |
| POST | `/api/journey/studies/{id}/codebook/reliability` | รับผลลงรหัสรอบสอง (coder คนที่ 2 **หรือ** test–retest) → คำนวณตาม 2.7(4) |

**ขั้นที่ 2 → ตรวจสอบย้อนกลับ**
| Method | Path | หน้าที่ |
|---|---|---|
| GET | `/api/journey/studies/{id}/pain-other-texts` | `other_text` ที่ยังไม่ back-code |
| POST | `/api/journey/studies/{id}/pain-back-code` | ผูกเข้ากับ category เดิม หรือเสนอ category ใหม่เข้า draft v(n+1) |

**endpoint เดิมที่ต้องแก้**
- `POST /studies/{id}/seed` — เพิ่ม `include_pain`, `include_touchpoints` (default `true`) ให้ดึงครบในครั้งเดียว
- `POST /studies/{id}/lock-instrument` — บล็อกถ้า `pain_source == "library_default"` และยังไม่กดยืนยันตาม 2.6(7)
- `GET /public/{share_token}` — คืนตัวเลือก **ต่อขั้น** จาก codebook + ธง `allow_pain_other_text` + `pain_nomination_cap`
- `POST /public/{share_token}/respond` — **enforce `pain_nomination_cap` ที่ backend** (วันนี้จำกัดแค่ UI)
- `GET /studies/{id}/analysis` — เพิ่ม `results.provenance` และ `results.qualitative_audit` (ดู 2.7)

**เก็บ `journey_style` ลง `qualitative_runs`** (`server.py` L3639) — วันนี้ผู้ใช้เลือกแล้วแต่ค่าหายไป

### 2.4 การสกัด candidate (Q2) — deterministic ก่อน AI
1. ตัดประโยคจาก verbatim ด้วยกฎ (ตัวคั่น, ความยาว 4–120 ตัวอักษร)
2. **pain** — จับคำบ่งชี้ภาษาไทย: `ไม่ · ยาก · นาน · รอ · งง · สับสน · เสีย · แพง · กลัว · หงุดหงิด · ผิดหวัง · ไม่มั่นใจ · ต้องกลับมา · ซ้ำ · เต็ม · ไกล · ปิด · ยกเลิก`
3. **touchpoint** — จับคำบ่งชี้ช่องทาง: `แอป · เว็บ · ไลน์ · โทร · สาขา · หน้าร้าน · เคาน์เตอร์ · พนักงาน · เพจ · ไอจี · อีเมล · ตู้`
4. **states / edges** — จาก mermaid: node = state, `-->` = edge (ปรับปรุงจาก `_extract_steps` ที่ทิ้ง edge)
5. รวมคำก้านเดียวกัน (normalize ช่องว่าง/วรรณยุกต์ซ้ำ) → นับความถี่ + เก็บ quote ทุกชิ้น
6. LLM (ผ่าน Emergent LLM key ตามที่ระบบใช้อยู่) **optional** ทำได้แค่ 2 อย่าง
   - เสนอ `label_th` ที่กระชับขึ้น **จาก quote ที่ให้มาเท่านั้น** ห้ามแต่งเนื้อหาใหม่
   - เสนอ `pain_type` / `channel_type` — ต้องมีปุ่มให้มนุษย์แก้
7. **candidate ที่ไม่มี quote ถูกทิ้งที่ชั้นข้อมูล** ไม่ใช่ที่ prompt — กัน hallucination โดยโครงสร้าง

### 2.5 งบเวลา (`lib/journey_budget.py`) — เพดานแข็งมีชุดเดียว
- `estimate()` รับ `n_pain_options` (ต่อขั้น) และ `n_touchpoint_options` แทนการสมมติจำนวนคงที่
- ช่อง "อื่น ๆ ระบุ" ⇒ `+SEC_OPEN_TEXT_SHORT` × `p_other` (เริ่ม 0.15 แล้ว calibrate จากข้อมูลจริง)
- `severity_scope == "state_and_category"` ⇒ `+SEC_SLIDER_0_10` × จำนวนหมวดที่คาดว่าเลือก (เริ่ม 1.4)
- **เพดาน 480 วินาทีคือเพดานเดียวที่บล็อกจริง** ตัวเลข "≤8 ตัวเลือกต่อขั้น" เป็น *คำแนะนำด้าน usability*
  ที่แสดงเป็นคำเตือน ไม่ใช่ hard block ซ้อน — เหตุผลอยู่ในข้อ 3.5

### 2.6 Gate ก่อน activate codebook (บล็อกจริง)
1. ทุกรายการที่ `approved` (state / touchpoint / pain) มี `definition_th` และ `provenance.quotes` ≥ 1
2. pain ที่ approved: **3–12** ต่อการศึกษา
3. ทุกรายการที่ `applies_to == "selected"` ต้องมี `state_ids` ไม่ว่าง
4. `source.collection_method_th` ไม่ว่าง
5. ไม่มี `label_th` ซ้ำภายในชนิดเดียวกัน และไม่ติด PDPA blocklist (`lib/consent.py` L40 `check_blocklist`)
6. **งบเวลาผ่าน** (`journey_budget.check_design`) — ถ้าไม่ผ่าน บอกว่าต้องตัดอะไร
7. ถ้า `pain_source == "library_default"` ต้องกดยืนยันข้อความ
   "รายการนี้ไม่ได้มาจากข้อมูลเชิงคุณภาพของการศึกษานี้" ซึ่งจะปรากฏใน dashboard + ทุกไฟล์ export
8. ถ้า `origin == "prior_literature"` ต้องมี `citation_th`
9. `reliability` และ `saturation` เป็น **คำเตือน ไม่บล็อก** แต่ถ้าไม่มี ต้องพิมพ์เป็นข้อจำกัด

### 2.7 ขั้นที่ 2 ตรวจสอบขั้นที่ 1 อย่างไร — ส่วนที่ใหม่ที่สุดของสเปกนี้

**(1) ความครอบคลุมของรายการปัญหา — `other_rate`**
สัดส่วน nomination ที่ผู้ตอบเลือก "อื่น ๆ" รายงานพร้อม **Wilson CI** (ให้เข้าชุดกับ nomination rate ที่ทำอยู่แล้ว)
ถ้า **ขอบล่างของ CI > 15%** ขึ้นคำเตือนใน `diagnostics.warnings` ว่า codebook ยังไม่ครอบคลุม
(ใช้ขอบล่าง ไม่ใช่ค่าประมาณจุด เพื่อไม่ให้ n น้อยแล้วเตือนพร่ำเพรื่อ)

**(2) ความถูกต้องของแผนที่ — edge coverage** ← ข้อนี้คือการต่อยอด linear/nonlinear ที่ผู้ใช้ต้องการ
เอา `edges` ที่ขั้นที่ 1 อ้าง มาเทียบกับเมทริกซ์การเปลี่ยนสถานะที่วัดได้จริง:
- `claimed_and_observed` — เส้นที่ขั้นที่ 1 บอกไว้ และพบจริง (พร้อมสัดส่วน + CI)
- `claimed_not_observed` — ขั้นที่ 1 บอกว่ามี แต่ไม่พบเลย → **สมมติฐานที่ข้อมูลไม่รองรับ**
- `observed_not_claimed` — พบจริงแต่ขั้นที่ 1 มองข้าม → **เส้นทางที่งานเชิงคุณภาพพลาด**
- ถ้า `journey_style == "linear"` แต่พบ back-edge หรือ loop ที่มีมวลสาระ (เกณฑ์: ขอบล่าง Wilson > 5%)
  → เตือนว่า **สมมติฐาน linear ไม่ผ่านการตรวจ** ควรรายงานเป็น nonlinear

นี่คือสิ่งที่ทำให้สองขั้นเชื่อมกันจริง ไม่ใช่แค่ขั้นที่ 2 ยืมชื่อขั้นตอนมาใช้

**(3) ความอิ่มตัวของข้อมูลเชิงคุณภาพ — saturation**
เก็บว่าบทสัมภาษณ์ลำดับที่ *i* ทำให้เกิด category ใหม่กี่ตัว แล้ววาดเส้นสะสม
- ถ้า `n_interviews < 12` ขึ้นข้อจำกัด (Guest, Bunce & Johnson 2006 พบว่ากลุ่มเนื้อเดียวกันมักอิ่มตัวราว 12 ราย)
- ถ้าบทสัมภาษณ์ 2 รายสุดท้ายยังให้ category ใหม่ → เตือนว่ายังไม่อิ่มตัว
เป็นคำถามแรกที่กรรมการสอบถาม และวันนี้ระบบเก็บ `n_interviews` ไว้เฉย ๆ โดยไม่ใช้

**(4) ความน่าเชื่อถือของการลงรหัส — ห้ามรายงาน κ ค่าเดียว**
การลงรหัสนี้เป็น **multi-label** (ข้อความหนึ่งได้หลาย category) ซึ่งผิดสมมติฐานของ Cohen's κ
ที่ต้องการการจัดเข้าหมวดเดียวแบบไม่ทับกัน · ยิ่งกว่านั้น κ มี **kappa paradox**:
หมวดที่พบน้อย ต่อให้ coder เห็นตรงกัน 95% κ ก็ร่วงเข้าใกล้ 0 — ในงานที่มี 10 หมวดซึ่งส่วนใหญ่พบน้อย
นักศึกษาจะได้ตัวเลขต่ำที่เป็น artifact ล้วน ๆ แล้วสรุปผิด

จึงกำหนดว่า:
- คำนวณ **κ รายหมวด** (binary มี/ไม่มี) และ **ต้องรายงานคู่กับ prevalence เสมอ**
- คำนวณ **Krippendorff's α** เป็นตัวเลขรวม (รองรับ multi-label / ข้อมูลขาด / coder > 2)
- **ห้าม** แสดง κ รวมค่าเดียวในทุกหน้าจอและทุก export
- หมวดที่ `prevalence < 0.05` ให้แสดง κ เป็น `n/a (พบน้อยเกินไป)` แทนตัวเลข

**(5) provenance ในทุกตัวเลข**
`results.provenance = {codebook_version, pain_source, n_quotes, n_interviews, reliability_mode, other_rate, back_coded_rate}`
`pain_matrix` อ้าง `category_id` คู่กับ label เสมอ

### 2.8 การรายงาน
1. ทุกการ์ดที่เกี่ยวกับ pain / touchpoint มีบรรทัดที่มา เช่น
   "ประเภทปัญหามาจากการลงรหัสข้อมูลเชิงคุณภาพของการศึกษานี้ (codebook v2 · จาก 12 บทสัมภาษณ์)"
   หรือคำเตือนตามข้อ 2.6(7)
2. การ์ด **"ขั้นที่ 1 ตรงกับข้อมูลจริงแค่ไหน"** แสดง edge coverage ตาม 2.7(2) — สามรายการ พร้อมจำนวน
3. แสดง `other_rate` (พร้อม CI), `back_coded_rate`, เส้น saturation, และตาราง κ รายหมวด + prevalence
4. ปุ่ม **"ดู verbatim ต้นทาง"** ต่อทุกรายการที่อนุมัติ — ให้กรรมการสอบตรวจย้อนได้
5. **ห้ามเปรียบเทียบข้าม codebook version** — ถ้าเวอร์ชันต่างกัน payload ต้องมีธงห้ามเทียบ

### 2.9 Migration
- การศึกษาเดิม: `pain_source = "library_default"`, `codebook_id = null` → ทำงานเหมือนเดิม แต่ขึ้นคำเตือน
- คำตอบเดิมเก็บ category เป็นข้อความ: mapper อ่านได้ทั้ง `category_ids` และ `categories`
  **ห้าม** เขียนสคริปต์เดาย้อนหลังว่าข้อความไหน = id ไหน
- ผลของขั้นที่ 2 ที่คำนวณจากคำตอบเก่า **ห้ามนำไปรวมกับ** ผลที่คำนวณจาก codebook — กติกาเดียวกับ 2.8(5)
- เดโม `demo-journey-kafae-001`: คงเป็น `library_default` เพื่อให้เห็นกลไกคำเตือนทำงาน

### 2.10 สิ่งที่ต้องเลิกทำ (จงใจ)
- เลิกใช้ `PAIN_TAXONOMY` เป็นแหล่งความจริง → ลดบทบาทเหลือ `library_default` ที่ต้องยืนยัน
- เลิกให้ทุกขั้นมีรายการเดียวกันโดยอัตโนมัติ
- เลิกเก็บ category เป็น free text ในคำตอบ
- เลิกรายงาน κ รวมค่าเดียว
- ไม่เพิ่ม composite "pain index" หรือ "journey health score" ใด ๆ (คงหลักเดิม: แยกแกน + ธงจับตา)

---

## 3. การตัดสินใจ 4 ข้อ — ตัดสินแล้ว

**3.1 `pain_nomination_cap` — ตั้งได้ 2–3 ค่าเริ่มต้น 2 และ enforce ที่ backend**
ความหมายของ cap ขึ้นกับจำนวนขั้น: ถ้า m=3 การ cap ที่ 2 แทบไม่จำกัดอะไร แต่ถ้า m=10
มันจะกดจำนวนปัญหาในเส้นทางยาวอย่างเป็นระบบ ทำให้ pain ในช่วงท้ายเส้นทางถูกนับต่ำกว่าจริง
ไม่ว่าจะเลือกทางใด **ต้อง enforce ที่ backend** เพราะวันนี้จำกัดแค่ UI (ช่องว่างข้อ 1.3.9)

**3.2 coder คนที่ 2 — ไม่บังคับ แต่ต้องประกาศข้อจำกัด และมีทางเลือกที่ทำคนเดียวได้**
บังคับแล้วนักศึกษาที่ไม่มีคนที่สองจะกุตัวเลข ซึ่งแย่กว่าการยอมรับตรง ๆ
จึงรองรับ `reliability.mode` สามค่า: `none` (พิมพ์ข้อจำกัด) · `second_coder` · **`test_retest`**
(ลงรหัสซ้ำ 20% ของตัวอย่างหลังเว้น ≥1 สัปดาห์ — ทำคนเดียวได้และเป็นวิธีที่ยอมรับกัน)

**3.3 `severity` — คงต่อขั้นไว้ และเพิ่มต่อหมวด เฉพาะหมวดที่ผู้ตอบเลือกจริง**
ปัญหาของ severity ต่อขั้นล้วน ๆ คือ ขั้นที่มีปัญหาหนักหนึ่งเรื่องกับจิ๊บจ๊อยหนึ่งเรื่อง
ได้ค่าเฉลี่ยที่ตีความไม่ได้ · แต่ grid เต็มทุกหมวดจะบวมตามจำนวนหมวดและทะลุงบเวลา
ทางออก: ผู้ตอบเพิ่งเลือก `category_ids` ไปแล้ว จึงถามต่ออีก 1–3 ข้อ (ราว +8–14 วินาที)
`severity_scope` ตั้งเป็น `"state"` ได้ถ้าการศึกษาต้องการประหยัดเวลา

**3.4 `library_default` — อนุญาต พร้อมคำยืนยันและคำเตือน ไม่ hard-block**
การใช้เครื่องมือที่ตีพิมพ์แล้วซ้ำคือ *replication* ไม่ใช่ความมักง่าย และการ hard-block
จะทำให้การศึกษาเดิมทั้งหมดกับเดโมใช้ไม่ได้ · แต่แยก `origin` เพิ่มเป็น **`prior_literature`**
(ต้องมี `citation_th`) เพื่อไม่ให้ "ผมใช้ taxonomy จากงานวิจัยชิ้นนี้" โดนคำเตือนเสียงเดียวกับ
"ไม่ได้ทำงานเชิงคุณภาพ"

**3.5 เพดานจำนวนตัวเลือก — งบเวลาเป็นเพดานแข็งชุดเดียว**
สเปกฉบับก่อนตั้ง "3–12 หมวด" และ "≤8 ต่อขั้น" คู่กับเพดาน 480 วินาที กลายเป็นเพดานสองชุดที่ขัดกันเองได้
(8 ตัวเลือก × 6 ขั้นอาจทะลุงบไปแล้ว ขณะที่การศึกษา 3 ขั้นอาจเกิน 8 ได้สบาย)
คง 3–12 ไว้เป็น gate เพราะเป็นเรื่องคุณภาพการลงรหัส ไม่ใช่เรื่องเวลา
ส่วน "≤8 ต่อขั้น" ลดเป็นคำเตือน — ให้ `journey_budget` เป็นผู้ตัดสินคนเดียว
ตรงกับวินัยที่โมดูลนี้ตั้งไว้แล้วว่ามี source of truth เดียวเรื่องเวลา

---

## 4. เกณฑ์ยอมรับ และรายการเทสที่ต้องเขียน

**Backend (pytest — ต่อจาก `tests/test_journey_phase1.py` และ `tests/test_journey_api_phase1.py`)**

*โครงสร้าง codebook*
1. candidate ที่ไม่มี quote ถูกทิ้งตั้งแต่ชั้นข้อมูล — `extract` ไม่คืนรายการที่ `provenance.quotes` ว่าง
2. `extract` คืนครบสามชนิด (states / touchpoints / pain) และดึง **edges** จาก mermaid ได้
3. activate ถูกบล็อกเมื่อ: ไม่มี definition / ไม่มี quote / pain > 12 หรือ < 3 / `applies_to="selected"` แต่ `state_ids` ว่าง / `collection_method_th` ว่าง / label ซ้ำ / ติด PDPA blocklist / งบเวลาไม่ผ่าน / `prior_literature` ไม่มี citation
4. activate สำเร็จ → `structure_hash` เปลี่ยน · แก้ codebook หลังมีคำตอบแล้วถูกปฏิเสธ (400)
5. แก้เฉพาะ `label_th`/`definition_th` → `content_revision` +1 และ `structure_hash` **ไม่เปลี่ยน**

*การเก็บข้อมูล*
6. public payload คืนตัวเลือก **เฉพาะของขั้นนั้น** ตาม `state_ids` / `applies_to`
7. `category_ids` ที่ไม่อยู่ใน codebook ถูกตัดออก (ไม่ 500)
8. `pain_nomination_cap` ถูก **enforce ที่ backend** — ส่งเกินแล้วถูกตัด ไม่ใช่รับไว้
9. `category_severity` รับเฉพาะหมวดที่อยู่ใน `category_ids` ของขั้นนั้น
10. อ่านคำตอบเก่า (เก็บ category เป็นข้อความ) ได้โดยไม่ error

*การตรวจสอบย้อนกลับ — ข้อ 2.7*
11. `other_rate` คำนวณถูก มี Wilson CI และเตือนเมื่อ **ขอบล่าง** > 15% (ไม่ใช่ค่าประมาณจุด)
12. edge coverage แยกได้ครบสามกลุ่ม และเคส `journey_style="linear"` ที่มี back-edge มวลสาระ → ขึ้นคำเตือน
13. saturation: บทสัมภาษณ์สุดท้ายยังให้ category ใหม่ → เตือน · `n_interviews < 12` → ข้อจำกัด
14. κ รายหมวดคำนวณตรงสูตร (เคสตรงกันหมด = 1.0 · เคสสุ่ม ≈ 0) และหมวด `prevalence < 0.05` คืน `n/a`
15. **ไม่มี** κ รวมค่าเดียวใน payload ใด ๆ (เทสเชิงลบ)
16. Krippendorff's α คำนวณได้กับข้อมูล multi-label และตรงกับค่าอ้างอิงที่คำนวณมือ
17. back-coding ผูก other_text → `back_coded_rate` เพิ่ม และ `pain_matrix` เปลี่ยนตาม

*สัญญาและงบเวลา*
18. `results.provenance` ครบทุกฟิลด์ และมีคำเตือนเมื่อ `pain_source == "library_default"`
19. เทียบข้าม codebook version → payload มีธงห้ามเทียบ
20. `n_pain_options` / `n_touchpoint_options` มากขึ้น → วินาทีเพิ่ม และ hard-block ที่ 480 วินาทีเหมือนเดิม
21. `severity_scope="state_and_category"` เพิ่มเวลาตามจำนวนหมวดที่คาดว่าเลือก

**Frontend (ทดสอบด้วย testing agent)**
22. วิซาร์ดมีขั้น "แปลงผลเชิงคุณภาพเป็นโครงสร้าง": วางข้อความ/เลือก run → เห็น candidate + quote → merge/rename/approve → activate
23. ปุ่ม activate ถูก disable พร้อมเหตุผลไทยที่ระบุ gate ที่ยังไม่ผ่าน
24. หน้าผู้ตอบเห็นตัวเลือกเฉพาะของขั้นนั้น + ช่อง "อื่น ๆ ระบุ" + cap ตรงกับ backend
25. dashboard แสดง provenance, การ์ด edge coverage, other_rate, saturation, κ รายหมวด, ปุ่มดู verbatim
26. การศึกษาเดิม (library_default) แสดงคำเตือนชัดเจนทั้งใน dashboard และไฟล์ export

---

## 5. ลำดับงาน

| | งาน | เทส |
|---|---|---|
| **P0** | collection + model + `GET/PUT/activate` + gate ทั้งหมด | 1, 3, 4, 5 |
| **P0** | public payload ต่อขั้น + `category_ids` + `other_text` + enforce cap | 6–10 |
| **P0** | `provenance` ใน analysis + คำเตือน library_default + ธงห้ามเทียบ | 18, 19 |
| **P1** | `extract` deterministic ครบสามชนิด + edges จาก mermaid | 2 |
| **P1** | edge coverage + other_rate CI + saturation | 11, 12, 13 |
| **P1** | UI ลงรหัสในวิซาร์ด | 22, 23, 24 |
| **P2** | reliability: κ รายหมวด + Krippendorff α + test–retest | 14, 15, 16 |
| **P2** | back-coding loop | 17 |
| **P2** | งบเวลา `n_pain_options` / `severity_scope` | 20, 21 |
| **P2** | LLM booster (ผ่าน integration playbook เท่านั้น) | — |
| **P3** | dashboard/export ครบตาม 2.8 | 25, 26 |

**หมายเหตุเรื่องการทดสอบ:** ทุกข้อยกเว้น LLM booster ทดสอบจบได้บนเครื่อง dev
(`devenv/mkt.ps1 seed` แล้ว `test`) — LLM booster ต้องยืนยันบน Emergent เพราะ stub คืนผลปลอมโดยเจตนา
