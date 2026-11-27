# Dorm External Agent Admin API Guide

ระบบจัดการหลังบ้าน `/dorm/admin` รองรับ **External Agent** (สคริปต์, บอท, หรือ AI agent ภายนอก) ทำงานร่วมกับแอดมินคนจริงอย่างปลอดภัยผ่านหลักการ **2 เลน (Two-Lane Autonomy)**:

- **Lane A — Auto-Execute + 1-Click Undo (`POST /api/dorm/admin/agent/execute`)**: งานดูแลข้อมูลประจำที่ชัดเจนและย้อนกลับได้ (เช่น ปิดห้องภายนอกที่ต้นทางหายไปแล้ว, เปิดคืน, ล้างธง `อาจไม่ว่าง` ที่ผิดพลาด, ปิดรายงานค้างที่เป้าหมายปิดไปแล้ว, อัปเดตรูป/ราคาห้องนอกหรือข้อมูลสื่อตึก, ซิงก์ชุดข้อมูลห้องนอก) — Agent ทำได้ทันที ระบบจะถ่ายสำเนาเอกสารก่อนแก้ (`snapshot`) ลง `dorm_agent_actions` เพื่อให้แอดมินกด **ย้อนกลับ (Undo)** ได้ 1 คลิก
- **Lane B — Proposal Queue + 1-Click Confirm (`POST /api/dorm/admin/proposals`)**: งานที่ต้องใช้ดุลยพินิจหรือกระทบข้อมูลของนิสิต/คนจริง (อนุมัติยืนยันนิสิต มศว, ปิด/ลบประกาศนิสิต, ตัดสินรายงานที่เป้าหมายยังเปิดอยู่, ปักแนะนำ, เพิ่มตึกใหม่, จัดการโปรไฟล์/รีวิว, ยืนยันข้อความสรุป OpenChat, หรือปิดห้องนอกพร้อมกันเกิน 40%) — Agent จะส่งเข้าคิว `งานรอแอดมินพิจารณา` บนหน้า `/dorm/admin` ให้คนจริงแก้สั้นๆ แล้วกด **[ยืนยันทำตามนี้]** หรือ **[ปัดตก]** (และทุกครั้งที่กดยืนยันก็สร้างประวัติที่ Undo ได้เช่นกัน)

---

## 1. การออก Scoped API Key และขอบเขตสิทธิ์

แอดมินคนจริงเท่านั้นที่ออกและยกเลิกคีย์ได้จากหน้า `/dorm/admin` กล่อง **“คีย์สำหรับ Agent ข้างนอก”** (หรือผ่าน API ขณะล็อกอินด้วยบัญชีแอดมิน — ห้ามใช้ API key มาสร้าง/ยกเลิกคีย์)

ส่งคีย์ใน header: `Authorization: Bearer swk_...`

| Scope | สิทธิ์ที่อนุญาต |
| --- | --- |
| `dorm.read` | อ่าน `GET /api/dorm/*` รวม `/admin/agent/brief`, `/admin/overview`, `/admin/proposals`, `/admin/actions` |
| `dorm.sync` | รัน `POST /admin/agent/execute`, `POST /admin/import-external`, `PUT /admin/buildings` |
| `dorm.propose` | ส่งข้อเสนอ `POST /admin/proposals` และ `POST /admin/proposals/batch` |
| `dorm.actions.undo` | เรียก `POST /admin/actions/{action_id}/undo` |
| `dorm.*` | Wildcard ของระบบ `/dorm` เท่านั้น (ไม่ข้ามไป `cms.*`) |

**Fail-Closed / `HARD_DENY`:**
- คีย์ `cms.*` ใช้กับ `/api/dorm/*` ไม่ได้ และคีย์ `dorm.*` ใช้กับ `/api/cms/*` ไม่ได้
- ทุก API key ถูกปฏิเสธ (`403`) บน endpoint ตัดสินใจของคนจริง:
  - `/api/dorm/admin/keys*`
  - `/api/dorm/admin/proposals/{id}/confirm` และ `/reject`
  - `/api/dorm/admin/verifications/*`
  - `/api/dorm/admin/seed-buildings`
  - `DELETE /api/dorm/listings/*`, `POST /api/dorm/listings/*/status`, `POST /api/dorm/admin/listings/*/feature`, `POST /api/dorm/admin/reports/*/resolve`

---

## 2. สรุป Endpoints หลักสำหรับ Agent

### 2.1 อ่านงานค้างรวม (`GET /api/dorm/admin/agent/brief`)
ใช้เป็นจุดเริ่มต้นทุกครั้งที่ Agent ตื่นขึ้นมาทำงาน:
```bash
curl -s "http://localhost:8001/api/dorm/admin/agent/brief" \
  -H "Authorization: Bearer $DORM_API_KEY"
```
คืนค่า:
- `summary`: ตัวเลขรวม (`external_open`, `external_maybe_gone`, `external_stale_7d`, `native_open`, `reports_open`, `stale_reports`, `live_reports`, `pending_verifications`, `pending_proposals`, `buildings_low_photos`)
- `work_items`: รายการพร้อมตรวจ (`external_to_check`, `stale_reports`, `live_reports`, `pending_verifications`, `buildings_low_photos`, `pending_proposals`)
- `capabilities`: รายชื่อ `auto_actions` และ `proposal_kinds` ที่รองรับ

### 2.2 Lane A — สั่งทำงานอัตโนมัติ (`POST /api/dorm/admin/agent/execute`)
รองรับ `dry_run: true` ในทุก action:
```json
{
  "action": "close_external_gone",
  "params": { "listing_id": "x06d3c7df33b" },
  "reason": "HTTP 404 on Renthub source page",
  "dry_run": false
}
```
รายการ `action` ทั้ง 7 แบบ:
1. `close_external_gone` (`listing_id` หรือ `ext_id`): ปิดเฉพาะห้อง `external: true` (ถ้าเป็นห้องนิสิตคืน `409`)
2. `reopen_external` (`listing_id` หรือ `ext_id`): เปิดห้องภายนอกคืนและต่ออายุ `EXPIRY` (ห้ามใช้กับห้องที่โดนลบถาวร)
3. `clear_false_maybe_gone` (`listing_id`): ล้างป้ายส้ม `อาจไม่ว่าง` + ลบ `dorm_gone_signals` + ปิดรายงาน `GONE_REASONS` ที่ค้าง
4. `resolve_stale_report` (`report_id`): ปิดรายงานที่เป้าหมายปิด/ถูกลบไปแล้ว (ถ้าเป้าหมายยังเปิดอยู่คืน `409` ให้ส่งเข้าคิว proposal แทน)
5. `patch_external_listing` (`listing_id`, `patch`): แก้เฉพาะฟิลด์ที่ whitelist (`price_total`, `bedrooms`, `bathrooms`, `size_sqm`, `floor`, `furnished`, `amenities`, `min_contract_months`, `deposit_months`, `advance_months`, `available_from`, `ext_photos`, `source_seen_at`)
6. `update_building_media` (`slug` + ฟิลด์ `photos`, `price_seen`, `official_url`, `web_review_summary`, `web_review_sources`): ตรวจสอบด้วย `BuildingIn` ก่อนบันทึก
7. `refresh_external_batch` (`listings`, `close_missing`): อัปเดตชุดห้องภายนอก (มี **Safety Guard 40%** ถ้าจะปิดห้องหายเกิน 40% ของห้องนอกทั้งหมดจะปฏิเสธ `409` ให้ส่งเป็น proposal `mass_external_sync` แทน)

### 2.3 Lane B — ส่งและยืนยัน Proposals (`POST /api/dorm/admin/proposals`)
Agent ส่งเข้าคิว (ระบบ deduplicate ให้ตามคู่ `(kind, target_id)` ที่ยัง `pending`):
```json
{
  "kind": "resolve_report",
  "priority": "high",
  "title": "รายงานประกาศ: ห้องสงสัยสแกม",
  "summary": "ผู้แจ้งระบุว่าขอให้โอนมัดจำก่อนดูห้อง",
  "target_type": "report",
  "target_id": "rep_1234",
  "evidence": [{ "label": "เหตุผล", "value": "สแกม/ขอโอนเงินก่อน" }],
  "payload": { "decision": "close_target", "note": "" }
}
```
`kind` ที่รองรับ: `review_verification`, `close_native_listing`, `delete_listing`, `resolve_report`, `feature_listing`, `upsert_building`, `moderate_mate`, `moderate_review`, `publish_digest`, `mass_external_sync`

- ส่งเป็นชุด: `POST /api/dorm/admin/proposals/batch` (`{"items": [...]}` สูงสุด 50 รายการ)
- ดูคิว: `GET /api/dorm/admin/proposals?status=pending`
- คนจริงยืนยัน/ปัดตก (จากหน้า `/dorm/admin`):
  - `POST /api/dorm/admin/proposals/{id}/confirm` (`{"payload": {...}, "note": ""}`)
  - `POST /api/dorm/admin/proposals/{id}/reject` (`{"note": ""}`)

### 2.4 ประวัติและการย้อนกลับ (`GET /api/dorm/admin/actions` & `POST /api/dorm/admin/actions/{id}/undo`)
- ดูประวัติล่าสุด: `GET /api/dorm/admin/actions?status=all|active|undone`
- ย้อนกลับ 1 คลิก: `POST /api/dorm/admin/actions/{action_id}/undo` — คืนเอกสารทุกชิ้นใน `snapshots` กลับสู่สภาพก่อนทำทันที (ถ้ากดซ้ำคืน `409`)

---

## 3. สคริปต์ Agent สำเร็จรูป (`backend/scripts/dorm_agent.py`)

```bash
export DORM_BASE_URL=http://localhost:8001
export DORM_API_KEY=swk_xxxxxxxxxxxxxxxxxxxx

# 1) สรุปงานทั้งหมดที่รอตรวจ
python backend/scripts/dorm_agent.py brief

# 2) ลองตรวจเว็บต้นทางของห้องที่โดนแจ้งว่าอาจไม่ว่าง (dry-run ก่อนเสมอ)
python backend/scripts/dorm_agent.py check-external --only-flagged --dry-run
python backend/scripts/dorm_agent.py check-external --limit 30

# 3) ปิดรายงานค้างอัตโนมัติ + จัดเตรียมข้อเสนอคำขอยืนยัน/รายงานใหม่เข้าคิว
python backend/scripts/dorm_agent.py triage

# 4) ดูประวัติที่ Agent ทำ และย้อนกลับถ้าต้องการ
python backend/scripts/dorm_agent.py actions
python backend/scripts/dorm_agent.py undo act_xxxxxxxxxxxx
```
