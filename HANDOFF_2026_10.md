# HANDOFF — Performance · แก้เนื้อหาโดยไม่ deploy · API key · หน้าคณาจารย์ + SEO

**ฐาน:** `meekintubeDone` @ `3bf602e` · commit นี้ต่อจากนั้นตรง ๆ (ไม่มีอะไรต้อง merge)
**สถานะ:** backend + frontend เสร็จ ทดสอบใน emergent-sim (Linux `/app` · MongoDB · เบราว์เซอร์จริง)
**รายละเอียดแต่ละเรื่อง:** `memory/PERFORMANCE_AUDIT_2026_10.md` · `memory/CONTENT_OPS_2026_10.md` ·
`memory/FACULTY_SEO_2026_10.md` · `memory/FACULTY_PORTRAIT_PROMPTS.md` · `memory/REPUTATION_AUDIT_2026_10.md`

---

## 0. ก่อน deploy — สองข้อนี้ต้องทำก่อน

### 0.1 ⚠️ ตั้ง `JWT_SECRET` ใน environment ของ backend — ไม่งั้น backend ไม่สตาร์ท

`server.py` เคย fallback เป็นสตริงที่อยู่ใน repo (`'swumkt-secret-key-change-in-production'`)
→ ถ้า prod ไม่เคยตั้ง `JWT_SECRET` ใครที่อ่าน repo นี้ก็ปลอม token admin ได้

ตอนนี้ไม่มี default แล้ว ไม่มีค่า = `RuntimeError` ตอนสตาร์ท ข้อความบอกวิธีแก้ชัดเจน

- **มีอยู่แล้ว** → ไม่ต้องทำอะไร
- **ยังไม่มี** → ใส่ `JWT_SECRET=<สุ่ม 32 ตัวขึ้นไป>` · token เดิมจะใช้ไม่ได้ ผู้ใช้ login ใหม่หนึ่งครั้ง
- ฉุกเฉินจริง ๆ: `ALLOW_INSECURE_JWT_SECRET=1` ใช้พฤติกรรมเดิมได้ แต่ log ERROR ทุกครั้งที่สตาร์ท

### 0.2 🔑 เพิกถอน `EMERGENT_LLM_KEY` ตัวที่หลุด

`server.py:3059` และ `:5069` เคยมีคีย์จริง `sk-emergent-8C90…` เป็นค่า default
เอาออกแล้วใน commit นี้ แต่**ยังอยู่ใน git history** → เพิกถอนแล้วออกคีย์ใหม่

---

## 1. หลัง deploy — ทำตามลำดับ

```bash
cd /app/backend

# 1) โหลดข้อมูลอาจารย์ 4 ท่าน + ผลงาน 47 รายการ (30 แสดง · 17 กันไว้รอตรวจ)
#    insert-only: รันซ้ำได้ ไม่ทับสิ่งที่แก้ไปแล้ว
python scripts/seed_faculty.py --dry-run
python scripts/seed_faculty.py

# 2) ออก API key ใบแรกให้เจ้าของงาน (ใช้กับ sitectl แก้เนื้อหาจากเครื่องของเขา)
#    คีย์แสดงครั้งเดียว — ส่งให้เจ้าของงานทางช่องทางส่วนตัว ห้าม commit ห้ามแปะในแชทสาธารณะ
python scripts/mint_api_key.py --label "sitectl · owner"
```

**คีย์ใบแรกต้องออกจากฝั่ง server เท่านั้น** — `POST /api/cms/keys` ต้องมี admin login อยู่แล้ว
และเจ้าของงาน (`intaka@gmail.com`) เป็นบัญชี Google OAuth ที่ไม่มีรหัสผ่าน จึง login ผ่าน API ไม่ได้
สคริปต์นี้เขียนลง Mongo ตรง ๆ เพื่อปิดวงจรนั้น · เพิกถอน: `python scripts/mint_api_key.py --revoke <id>`

### ตรวจหลัง deploy

1. **เปิด `/admin/cms/landing` กด Save โดยไม่แก้อะไร แล้วรีโหลดหน้าแรก — รูป hero ต้องยังอยู่**
   (หน้าแก้ไขอ่าน endpoint เดียวกับหน้าแรก ซึ่งตอนนี้คืน `/api/media/...` แทน base64
   `rehydrate()` ใส่ base64 กลับก่อนบันทึก — ถ้า guard นี้หลุด กด Save ครั้งเดียวรูปหายถาวร)
2. `/people` → อาจารย์ 4 ท่าน · `/publications` → 30 เรื่อง · `/people/intaka-piriyakul` → มีผลงาน
3. `curl -s https://swumkt.org/api/cms/posts/public | grep -c 'data:image/'` → `0`
4. `curl -sI https://swumkt.org/api/faculty | grep -i x-robots-tag` → `noindex`
5. **Google Search Console → URL Inspection** หน้าบทความสักหน้า → ดู rendered page
   ต้องเห็นเนื้อหา ไม่ใช่หน้าว่าง (ดูข้อ 2.5)

---

## 2. เปลี่ยนอะไรบ้าง

### 2.1 Performance

หน้าแรกเคยโหลด **JSON 10.34 MB** คำขอช้าสุด **8.6 s** — 99% เป็นรูป base64 ฝังใน JSON
และ `cms_posts` `brand_studies` `brand_responses` `cms_landing` ไม่มี index เลยนอกจาก `_id`

| ไฟล์ | สาระ |
|---|---|
| `backend/lib/inline_media.py` | **ใหม่** · `externalize()` แทน base64 ด้วย URL · `resolve()` · `rehydrate()` |
| `backend/routes/media.py` | **ใหม่** · `GET /api/media/{source}/{id}?f=…&v=hash` · cache 1 ปี immutable · ETag/304 |
| `backend/routes/cms.py` · `brand_equity.py` · `server.py` | ใช้ externalize กับ endpoint สาธารณะทุกตัว · เลิก N+1 · index 12 ตัว · gzip 9→6 |
| `frontend/src/App.js` | `refetchOnWindowFocus: 'always'` → `true` (เดิมโหลดใหม่ 10 MB ทุกครั้งที่สลับแท็บ) |

ผล: JSON หน้าแรก **5 KB** · API ช้าสุด **61 ms** · รูปตอนเข้ารอบสอง **0 ไบต์**

### 2.2 แก้เนื้อหาได้โดยไม่ต้อง deploy

| ไฟล์ | สาระ |
|---|---|
| `backend/routes/content_ops.py` | **ใหม่** · `PATCH /api/cms/landing` (deep-merge + `If-Match`) · `cms_revisions` + restore · `cms_site_settings` |
| `backend/routes/cms.py` | snapshot ก่อนทุกการเขียน · ล้าง cache ใน 4 จุดที่ลืม · `PUT` ไม่เขียน null ทับ config อีก |
| `frontend/src/hooks/useSiteText.js` | **ใหม่** · ข้อความที่แก้ได้จาก settings โดย fallback เป็นข้อความเดิมเสมอ |
| `backend/scripts/sitectl.py` | **ใหม่** · CLI สำหรับเจ้าของงาน (diff · dry-run · undo · deny-list · อ่านกลับจาก public) |

### 2.3 Scoped API keys

| ไฟล์ | สาระ |
|---|---|
| `backend/lib/api_keys.py` | **ใหม่** · คีย์ `swk_…` เก็บแค่ SHA-256 · scope ราย collection · `HARD_DENY` |
| `backend/server.py` | `get_current_user` รับคีย์ใน `Authorization: Bearer` แล้วตรวจ scope **ก่อน**สร้าง principal |
| `backend/scripts/mint_api_key.py` | **ใหม่** · ออก / list / เพิกถอนคีย์ |

**gate ปฏิเสธเป็นค่าตั้งต้น:** path ที่ไม่มีกฎรองรับ = ปฏิเสธ · route ใหม่ไม่ขยายสิทธิ์คีย์เก่าโดยบังเอิญ
`purge` · `landing/reset` · `/api/admin/*` · `/api/auth/*` · `/api/cms/keys` · `/api/cms/sources`
ห้ามตลอดไม่ว่า scope อะไร · path ที่มี `..` `//` `%2e` ถูกปฏิเสธทันที

### 2.4 หน้าคณาจารย์ + ผลงานตีพิมพ์

| ไฟล์ | สาระ |
|---|---|
| `backend/routes/faculty.py` | **ใหม่** · `/api/faculty` · `/api/faculty/{slug}` · `/api/faculty/{slug}/contact` · `/api/publications` · admin `/api/cms/faculty` `/api/cms/papers` |
| `backend/data/faculty_seed.json` | **ใหม่** · 4 ท่านจาก bas.swu.ac.th + ผลงานจาก OpenAlex ยืนยันด้วย ORCID |
| `backend/scripts/seed_faculty.py` | **ใหม่** · insert-only |
| `backend/routes/share.py` | `/api/share/people/{slug}` · JSON-LD `ProfilePage` `Person` `ScholarlyArticle` เชื่อมด้วย `@id` · sitemap |
| `backend/routes/cms.py` | `author_faculty_ids` บนบทความ → byline ลิงก์ไปหน้าอาจารย์ |
| `frontend/src/pages/people/*` | **ใหม่** · `/people` · `/people/:slug` · `/publications` |
| `UnifiedTopbar.jsx` · `SwumktComponents.jsx` | "คณาจารย์" ในเมนูบน · Faculty + Publications ใน footer |

**paper ที่ `status=review` (17 รายการ) คือบันทึกผลงานของคนจริงที่ระบบอัตโนมัติยืนยันไม่ได้** —
6 รายการชื่อไทยเพี้ยน (สระหาย) · 11 รายการน่าจะเป็นสารนิพนธ์นักศึกษาที่ผูกชื่ออาจารย์ที่ปรึกษา
แต่ละรายการมี `review_note` · **ห้ามเผยแพร่ทีเดียวทั้งหมด** ให้อาจารย์เจ้าของผลงานตัดสินทีละรายการ

### 2.5 robots.txt — มีผลกับ SEO ทั้งเว็บ

เดิม `Disallow: /api/` · เว็บเป็น SPA ทุกหน้าว่างจนกว่า JavaScript จะดึงข้อมูลจาก `/api`
Googlebot เคารพ robots.txt ตอนดึงข้อมูลมา render ด้วย และบน prod หน้าเว็บดึงข้อมูลจาก
`cite-master-2.emergent.host` ซึ่งเสิร์ฟ robots.txt ชุดเดียวกัน → **Google เห็นทุกหน้าเป็นหน้าว่างมาตลอด**

ตอนนี้เปิด endpoint อ่านอย่างเดียวที่หน้าสาธารณะใช้ render · ที่เหลือใต้ `/api` ยังปิด
และ middleware ใส่ `X-Robots-Tag: noindex` ให้ JSON ทุกตัว (ยกเว้น `/api/share/` `/api/media/` `/api/files/`)
→ Google ดึงไป render ได้ แต่ไม่เอา JSON ไปขึ้นผลค้นหา

### 2.6 บั๊กที่แก้ไปด้วย

- sitemap กรอง showcase ด้วยฟิลด์ `showcase` ซึ่งไม่มีอยู่จริง → showcase ไม่เคยเข้า sitemap สักชิ้น
- byline บทความ: หน้าเว็บบอก `Organization` ขณะที่ share bridge บอก `Person` → ตอนนี้ตรงกัน
- canonical ของบทความรวม `?utm_…` ไปด้วย → ใช้ origin + path
- `snapshot()` หา settings ด้วยฟิลด์ผิด → settings ไม่เคยมี revision (undo ใช้ไม่ได้)
- `backend/tests/test_journey_ketchup_iter39.py` ไม่ hardcode study id อีกแล้ว (resolve จาก share token)

---

## 3. ตรวจอะไรไปแล้ว

| | ผล |
|---|---|
| `pytest tests/test_inline_media.py tests/test_content_ops.py tests/test_api_keys.py tests/test_faculty.py` | **ผ่านทั้งหมด** (เทส API key บางตัวต้องตั้ง `MONGO_URL` `DB_NAME`) |
| `pytest tests/` เทียบกับ `3bf602e` (revert แล้วรันเทียบรายชื่อ) | **ไม่มี regression** · fail ค้างเดิม 156 รายการ ตรงกันทุกชื่อ |
| `pytest tests/` | 714 ผ่าน (เดิม 540) |
| `CI=true yarn build` | ผ่าน ไม่มี warning |
| `yarn.lock` | ตรงกับ `package.json` ครบ 76 dependency (commit มาด้วยตาม DoD) |
| `verify.py --app` (ส่วนตรวจไฟล์) | ผ่าน |
| รีวิวแบบ adversarial 4 รอบ | ทุกข้อที่หักล้างไม่ได้แก้แล้ว พร้อมเทสกัน |
| เบราว์เซอร์ | หน้าใหม่ทุกหน้า · byline · ปุ่มอีเมล · ตัวกรอง · ไม่มีรูปเสีย |

fail ค้างเดิม 156 รายการส่วนใหญ่ hardcode study id ที่ไม่มีใน DB หรือต้องใช้ LLM key — ไม่ใช่ของใหม่

## 4. ตรวจไม่ได้จากฝั่งนี้

| เรื่อง | เหตุผล |
|---|---|
| object storage · AI generation | ต้องใช้ `EMERGENT_LLM_KEY` |
| `JWT_SECRET` ของ prod | อ่าน env ของ prod ไม่ได้ — **ข้อ 0.1** |
| Googlebot render หลังแก้ robots.txt | ต้องดู Search Console หลัง deploy |
| ตัวเลข performance บน prod | ทดสอบด้วย fixture ขนาดเท่า prod ไม่ใช่ข้อมูลจริง |

---

## 5. งานเสริม (ไม่บังคับ)

1. **migration base64 → object storage** (`backend/scripts/migrate_b64_to_storage.py`) — ทำให้เอกสารใน DB
   เล็กลงด้วย · **เขียนลง prod DB — ขออนุมัติเจ้าของงานก่อนรัน** · dry-run ผ่านแล้ว ·
   มี `image_b64_backup` ให้ย้อน · เข้ากันได้กับโค้ดนี้ ไม่ต้องแก้อะไรเพิ่ม
2. **`GET /api/health`** ยังไม่มี · **`/api/openapi.json`** เข้าไม่ถึงผ่าน ingress (FastAPI เสิร์ฟที่ `/openapi.json`)
3. **`frontend/.env.example` · `backend/.env.example`** ยังไม่มี (verify.py เตือน)
4. `requirements.txt` pin `emergentintegrations==0.1.0` ซึ่ง public index ไม่มี (pod ของ Emergent มีติดมาให้)

---

## 6. Gotchas — สิ่งที่เผลอทำพังได้ง่าย

- **ห้ามลบ `Allow: /api/...` ใน robots.txt** — ดูเหมือนเปิดเกิน แต่ถ้าลบ Google กลับไปเห็นหน้าว่างทั้งเว็บ
  ความปลอดภัยอยู่ที่ server ไม่ใช่ robots.txt
- **ห้ามใส่ `X-Robots-Tag: noindex` กับ `/api/share/`** — หน้านั้นมี canonical อยู่แล้ว
- **`rehydrate()`** ในทุก endpoint ที่รับเอกสารกลับมาบันทึก (`PUT/PATCH /cms/landing`, `PUT /cms/posts`, `PATCH /cms/faculty`) — ถอดออก = รูปหาย
- **principal ของ API key มี `role=ADMIN`** — gate ใน `api_keys.py` คือสิ่งเดียวที่กั้น
  เพิ่ม route ใต้ `/api/cms` ต้องคิดว่าคีย์ควรเข้าถึงไหม (ค่าตั้งต้นคือไม่ ซึ่งถูกแล้ว)
- **`SOURCES` ใน `inline_media.py`** — `public_filter` คือตัวคุมสิทธิ์ของ `/api/media`
- **`/publications` ไม่ใช่ `/research`** — robots.txt ปิด `/research/` อยู่
- **อีเมลอาจารย์ไม่อยู่ใน listing ไหนเลย** — มาจาก `/api/faculty/{slug}/contact` ตอนกดเท่านั้น
- **id อาจารย์ที่สร้างผ่าน API เป็น uuid** ไม่ใช่ `fac-{slug}` (ชุด seed ยังเป็น `fac-{slug}`)
- **`refetchOnWindowFocus: true` ไม่ใช่ `'always'`** · **`fetchPriority` ไม่ใช่ `fetchpriority`**
- **cache เป็นราย process** (`lib/ttl_cache.py`) — หลาย worker ล้างได้ทีละตัว ที่เหลือรอ TTL หมด

---

## 7. ภาคผนวก — ตรวจรอบ setup page (`7129655`) แล้วแก้ 3 จุด

หน้า `/admin/cms/setup` ใช้ได้ดี ทดสอบใน sim ครบวงจรแล้ว (ตรวจก่อน → นำเข้า → ออกคีย์ → เพิกถอน)
แต่ในรอบเดียวกันมี 1 จุดที่เปิดช่องโหว่ จึงแก้ก่อน deploy:

| จุด | ปัญหา | แก้ |
|---|---|---|
| `routes/projects.py` · `PUT /{id}/columns/reorder` | ย้าย route ขึ้นมาเหนือ `/columns/{column_id}` ทำให้ handler ที่ไม่เคยถูกเรียกถึงกลายเป็นใช้งานได้ — **ไม่มีการตรวจสิทธิ์** และเขียนทับด้วยเฉพาะ id ที่ส่งมา ผู้ใช้ที่ login แล้วคนไหนก็ส่ง `[]` ลบคอลัมน์ทุกโปรเจกต์ได้ (ทำซ้ำได้จริงใน sim) | ต้องเป็น admin หรือ owner/admin ของโปรเจกต์ แบบเดียวกับ `update_column` · ต้องส่ง id ครบทุกคอลัมน์ ไม่งั้น 400 |
| `routes/faculty.py` · `POST /cms/faculty/seed` | API key ที่มี `cms.faculty.write` เรียกได้ — เป็นการ insert ก้อนใหญ่ที่ไม่มี snapshot | admin ที่ login เท่านั้น · เพิ่มใน `api_keys.HARD_DENY` |
| `routes/faculty.py` | `sys.path.insert` ทุกครั้งที่กด → list ยาวขึ้นเรื่อย ๆ | import ปกติ (`scripts/__init__.py` มีอยู่แล้ว) |

**ห้ามย้อนการตรวจสิทธิ์ของ reorder กลับ** — `tests/test_project_columns_reorder.py` ล้ม 6 จาก 7 บนโค้ดก่อนแก้

หมายเหตุเล็ก: มี `yarn.lock` ว่างที่ root ของ repo (มาจากการรัน yarn ผิดโฟลเดอร์) ไม่มีผลกับ build ลบได้
