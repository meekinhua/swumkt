# swumkt.org — อะไรทำให้ช้า และแก้อะไรไปบ้าง

**วันที่:** 27 ต.ค. 2569 · **วัดจาก prod จริง** (https://swumkt.org) ด้วย Resource Timing API
**ทดสอบการแก้:** emergent-sim pod (Linux `/app` จริง) ที่ `C:\ClaudeCode\MktSwuPortal\emergent-sim`

---

## 0. สรุปใน 4 บรรทัด

หน้าแรกโหลด **JSON 10.34 MB** ก่อนจะขึ้นจอได้ · คำขอที่ช้าที่สุดใช้ **8.6 วินาที**
ในนั้น **99% เป็นรูปภาพ base64** ที่ฝังอยู่ใน JSON — เบราว์เซอร์ cache ไม่ได้ CDN ก็ช่วยไม่ได้
และ **collection หลักทั้ง 4 ตัวไม่มี index เลย** นอกจาก `_id`
หลังแก้: JSON เหลือ **5 KB** · API ช้าสุด **61 ms** · รูปโหลดรอบสองเป็น **0 ไบต์**

---

## 1. ตัวเลขจริงจาก prod (27 ต.ค. 2569)

เปิดหน้าแรกหนึ่งครั้ง (cold load) — วัดด้วย `performance.getEntriesByType('resource')`

| endpoint | ขนาด | เวลา | ส่วนที่เป็น base64 |
|---|---|---|---|
| `/api/cms/posts/public?type=article&limit=12` | **5.84 MB** | **8.6 s** | 7.04 MB จาก 7.05 MB (99.9%) |
| `/api/cms/landing` | **2.09 MB** | 5.1 s | 2.08 MB (99.5%) |
| `/api/cms/announcements/pinned` | **1.21 MB** | 7.6 s | 1.20 MB (99.2%) |
| `/api/brand-equity/showcase` | **1.20 MB** | 6.0 s | 1.25 MB / 24 โลโก้จาก 25 (99.0%) |
| **รวม** | **10.34 MB** | | **~99%** |

เทียบกัน: `/api/cms/posts/public` ส่งการ์ดบทความ **9 ใบ** หนัก 5.84 MB
เนื้อหาตัวหนังสือจริงในนั้นรวมกันไม่ถึง **3 KB**

### ทำไม base64 ใน JSON ถึงแย่กว่าไฟล์รูป

1. base64 ใหญ่กว่าไฟล์จริงประมาณ **33%**
2. อยู่ใน JSON → **เบราว์เซอร์ cache ไม่ได้** ต้องโหลดใหม่ทุกครั้งที่เข้าเว็บ
3. **CDN ก็ cache ไม่ได้** เพราะเป็น response ของ API
4. **โหลดขนานไม่ได้** — ต้องรอทั้งก้อนจบก่อนหน้าเว็บถึงจะ render
5. gzip แทบไม่ช่วย เพราะ JPEG/PNG ถูกบีบมาแล้ว

---

## 2. ปัญหาอื่นที่เจอระหว่างทาง

### 2.1 ไม่มี index เลยใน 4 collection ที่ใช้ทุกหน้า

```
cms_posts         indexes = ['_id_']
cms_landing       indexes = ['_id_']
brand_studies     indexes = ['_id_']
brand_responses   indexes = ['_id_']
```

ทุกคำขอหน้าสาธารณะจึงเป็น **full collection scan** — หนักที่สุดคือ `brand_responses`
เพราะหน้า showcase นับจำนวนผู้ตอบของทุกการศึกษา

### 2.2 N+1 query ใน `/api/brand-equity/showcase`

สำหรับ 25 การศึกษา โค้ดเดิมยิง `count_documents` ทีละตัว แล้ว**โหลดคำตอบทั้งหมด
ของแต่ละตัวมาคำนวณคะแนน composite เต็มรูปแบบ** → TTFB **3.3 วินาที**
ทั้งที่หน้าแรกใช้คะแนนแค่ใบเดียว (การ์ด Featured) — อีก 24 ครั้งทิ้งทั้งหมด

### 2.3 `refetchOnWindowFocus: 'always'`

คอมเมนต์ในโค้ดเขียนว่า *"refetch when tab regains focus IF stale"*
แต่ค่าที่ตั้งคือ `'always'` ซึ่ง **ไม่สนใจ `staleTime` เลย**
ผลคือทุกครั้งที่ผู้ใช้สลับแท็บกลับมา React Query ยิงใหม่ทั้ง 4 endpoint — **อีก 10.3 MB**
ไม่ว่าเพิ่งโหลดไปเมื่อ 2 วินาทีที่แล้วก็ตาม

> แก้คำพูดของตัวเอง: ตอนแรกผมอ่านผลวัดแล้วบอกว่า "หน้าแรกยิงซ้ำ 2 ครั้งตั้งแต่โหลดแรก"
> — **ไม่ใช่** การโหลดสะอาดยิงแค่ 4 ครั้ง ที่เห็นซ้ำคือตอนแท็บกลับมา focus
> ซึ่งก็ยังเป็นปัญหาจริง แค่คนละสาเหตุกับที่พูดไว้ตอนแรก

### 2.4 gzip ระดับ 9

Starlette ตั้ง `compresslevel=9` เป็นค่า default ซึ่งกิน CPU หลายเท่าของระดับ 6
เพื่อแลกอัตราบีบที่ดีขึ้นราว 1% — และ CPU ก้อนนั้นอยู่บนเส้นทางวิกฤตของทุกคำขอ

---

## 3. แก้อะไรไปบ้าง

| # | แก้ | ไฟล์ |
|---|---|---|
| 1 | ส่ง URL แทน base64 ในทุก endpoint สาธารณะ + route `/api/media/...` ที่เสิร์ฟรูปพร้อม cache 1 ปี | `backend/lib/inline_media.py`, `backend/routes/media.py` |
| 2 | เรียกใช้ที่ landing · posts · announcements · showcase ทั้งสองตัว | `backend/routes/cms.py`, `backend/routes/brand_equity.py`, `backend/server.py` |
| 3 | เพิ่ม index 12 ตัวให้ `cms_posts` · `cms_landing` · `brand_studies` · `brand_responses` · `conjoint_studies` | `backend/server.py` |
| 4 | เลิก N+1: นับด้วย `$group` ครั้งเดียว + จำคะแนน composite ไว้ต่อการศึกษา | `backend/routes/brand_equity.py` |
| 5 | `refetchOnWindowFocus: 'always'` → `true` (ให้เคารพ `staleTime` ตามที่คอมเมนต์บอก) | `frontend/src/App.js` |
| 6 | `loading="lazy"` กับรูปที่อยู่ใต้ fold · hero ได้ `fetchPriority="high"` | 6 ไฟล์ใน `frontend/src` |
| 7 | gzip ระดับ 9 → 6 · ไม่ gzip ซ้ำกับ PNG/JPEG | `backend/server.py`, `backend/routes/media.py` |

### จุดที่อันตรายที่สุดและกันไว้แล้ว

หน้าแก้ไข Landing CMS **อ่าน endpoint ตัวเดียวกับหน้าแรก แล้วเซฟกลับทั้งก้อน**
ถ้าปล่อยไว้ การกดบันทึกครั้งเดียวจะเขียนทับรูป hero ทุกใบด้วย URL ที่ชี้กลับมาหาตัวเอง
→ รูปหายถาวร

`rehydrate()` ใน `lib/inline_media.py` ใส่ base64 กลับก่อนบันทึกเสมอ โดยอ่านตำแหน่งฟิลด์
**จากตัว URL เอง** ไม่ใช่จากตำแหน่งที่ค่านั้นอยู่ตอนนี้ — สลับลำดับสไลด์ในหน้าแก้ไขแล้ว
รูปก็ยังติดไปกับสไลด์ที่ถูกต้อง · ป้องกันที่ฝั่ง server จึงกันเบราว์เซอร์ที่ค้าง JS เก่าไว้ด้วย

ทดสอบจริงบน pod: GET → PUT → อ่าน DB ตรง ๆ → base64 ทั้งสองใบยังอยู่ครบ

### ความปลอดภัย

`/api/media/{source}/{id}` อ่านเอกสารผ่าน **public filter ของ collection นั้นทุกครั้ง**
(`status: published`, `is_public_showcase: true`, …) — ปลดเผยแพร่เมื่อไร รูปหยุดเสิร์ฟทันที
แม้ URL จะหลุดไปแล้ว · source ถูก whitelist ไว้ 4 ตัว · path ที่ไม่ใช่รูปคืน 404

---

## 4. ผลหลังแก้ (วัดบน pod ด้วยข้อมูลขนาดเท่า prod)

| | ก่อน (prod) | หลัง (pod) |
|---|---|---|
| JSON ที่หน้าแรกโหลด | **10.34 MB** | **5 KB** |
| API ที่ช้าที่สุด | **8.6 s** | **61 ms** |
| `/api/brand-equity/showcase` TTFB (cold) | 3.3 s | 10 ms |
| รูปตอนเข้าเว็บรอบสอง | โหลดใหม่ทั้งหมด | **0 ไบต์** (จาก cache) |
| index บน collection สาธารณะ | 0 | 12 |

การ์ดแชร์ · sitemap · JSON-LD จากรอบที่แล้วยังทำงานเหมือนเดิม

---

## 5. ที่ยังเหลือ — ต้องสั่งก่อน

### 5.1 รัน migration ย้าย base64 ขึ้น object storage (ยังไม่ได้ทำ)

`scripts/migrate_b64_to_storage.py` ย้ายรูปออกจาก MongoDB ไปเก็บที่ object storage จริง
ซึ่งเป็นทางแก้ที่ถาวรกว่า — ตอนนี้ `/api/media/...` อ่าน base64 จาก DB มาถอดรหัสให้ทุกครั้ง
ที่ cache พลาด ส่วน migration จะทำให้ **เอกสารใน DB เล็กลงด้วย**

ยังไม่รัน เพราะต้องใช้ `EMERGENT_LLM_KEY` และ **เขียนลงฐานข้อมูล production จริง**
มี `image_b64_backup` ให้ย้อนกลับได้ · dry-run ทดสอบแล้วจับได้ถูกต้อง

**สองอย่างนี้อยู่ด้วยกันได้** — `externalize()` ไม่แตะค่าที่เป็น URL อยู่แล้ว
ดังนั้นหลัง migration โค้ดนี้จะปล่อยผ่านเอง ไม่ต้องแก้อะไร

### 5.2 main.js 1.1 MB (305 KB gzip)

ยังไม่แตะ · ตรวจแล้วว่า `mermaid` / `recharts` ไม่ได้อยู่ใน entry bundle (แยก chunk ถูกแล้ว)
และ static asset มี `max-age=31536000, immutable` อยู่แล้ว
การแยก entry bundle ต่อเป็นงานใหญ่กว่าและได้น้อยกว่าของที่เพิ่งตัดไป 10 MB — เอาไว้รอบหน้า

### 5.3 ช่องว่างตาม spec ที่ยังค้าง (ไม่เกี่ยวกับ performance)

- ไม่มี `GET /api/health`
- `/api/openapi.json` เข้าไม่ถึง (FastAPI เสิร์ฟที่ `/openapi.json` แต่ ingress ส่งเฉพาะ `/api/*`)
- `frontend/yarn.lock` ยังไม่ถูก commit
- `requirements.txt` pin `emergentintegrations==0.1.0` ซึ่ง index สาธารณะไม่มี

---

## 6. การทดสอบ

- `backend/tests/test_inline_media.py` — **25 เทส ผ่านหมด**
  17 ตัวเป็น pure unit test ที่พิสูจน์ว่า `externalize` กับ `rehydrate` เป็น inverse กันจริง
  (รวมเคสสลับลำดับสไลด์ · อัปโหลดรูปใหม่ · ลบรูป · URL ที่ชี้ไปที่ว่าง)
  8 ตัวยิงใส่ endpoint จริงว่าไม่มี base64 เหลือ และ URL ที่ส่งออกไปเปิดได้จริง + คืน 304
- เทียบ **ชุดเทสทั้งหมด** ก่อน/หลัง (revert ไฟล์กลับไป HEAD แล้วรันใหม่): **รายชื่อที่ fail เหมือนกันเป๊ะ — ไม่มี regression ใหม่**
  (ชุดเทสนี้มี fail ค้างอยู่เดิม 156 รายการ ส่วนใหญ่เพราะ hardcode study id ที่ไม่มีใน DB และไม่มี LLM key)
- ชุด journey: **228 ผ่าน**
- `CI=true yarn build`: **ผ่าน ไม่มี warning**
- ตรวจด้วยเบราว์เซอร์จริงบน pod: `/` · `/learn` · `/showcase` · `/announcements` ไม่มีรูปเสียสักใบ
  (เจอ `fetchpriority` ต้องเป็น `fetchPriority` ตอนนี้เอง — build ไม่จับ แต่ console จับ แก้แล้ว)
