# แก้เนื้อหาเว็บได้จากที่นี่ โดยไม่ต้อง deploy ใหม่

**วันที่:** 27 ต.ค. 2569
**โจทย์:** "ทำให้ เมื่อ deploy ไปแล้ว สั่งแก้อะไรได้ง่าย ๆ ที่นี่เลย โดยไม่ต้อง deploy ใหม่บ่อย ๆ"

---

## 0. สรุป

สั่งจาก terminal ที่เครื่องนี้ได้เลย:

```bash
python backend/scripts/sitectl.py --dry-run landing set knowledge_hub.heading "อ่านก่อนใคร"
```

พิสูจน์แล้วบน sim: เปลี่ยนหัวข้อหน้า `/learn` จาก "อ่านเทรนด์" เป็น "อ่านก่อนใคร"
**ไม่ได้ build ใหม่ ไม่ได้ deploy ใหม่** แล้วสั่ง `undo restore` กลับเป็นของเดิมได้

---

## 1. ของเดิมแก้ได้อยู่แล้วเยอะกว่าที่คิด

สำรวจ repo ด้วย 6 readers แล้วพบว่า **เนื้อหาส่วนใหญ่แก้ได้ที่ runtime อยู่แล้ว** ผ่าน API:

- **ทั้งหน้าแรก** เป็นเอกสารเดียวใน `cms_landing` — hero slides, การ์ดเครื่องมือ 8 ใบ,
  แถบ Knowledge Hub / About, ความเร็วหมุนสไลด์, การเลือกบทความ/แบรนด์เด่น
- **บทความ ประกาศ case story ทั้งหมด** — CRUD ครบ รวมเผยแพร่ ถอด ปักหมุด กู้คืน
- **prompt ของ AI ทุกตัวในระบบ CMS** และ prompt ของเครื่องมือวิจัย
- **sitemap และการ์ดแชร์** สร้างจาก DB ทุกครั้ง เผยแพร่บทความแล้วขึ้นเอง

สิ่งที่ติดคือ **"เฟอร์นิเจอร์" รอบเนื้อหา** — หัวข้อ section, ป้ายปุ่ม, เมนู, footer
กับอีกสามเรื่องที่ทำให้ของที่แก้ได้อยู่แล้วใช้งานจริงไม่ได้

---

## 2. สามเรื่องที่ขวางอยู่ และแก้แล้ว

### 2.1 เขียนบางส่วนไม่ได้ — และถ้าฝืนเขียน ข้อมูลหาย

`PUT /api/cms/landing` รับ `LandingDoc` ซึ่งเป็นโมเดล **ทั้งเอกสาร** แล้ว `$set` ทับ
ฟิลด์ที่เป็น Optional จะ default เป็น `None` ดังนั้น body ที่ไม่ส่ง `featured_articles`
มาด้วยจะ**เขียน null ทับ** และ `get_landing` เติมค่ากลับให้เฉพาะตอน key **หายไป**
ไม่ใช่ตอนเป็น null — ค่า null จึงค้างถาวร

คนที่ถูกสั่งว่า "เปลี่ยนหัวข้อ hero" ย่อมส่งมาแค่ hero → การตั้งค่าบทความเด่นพังเงียบ ๆ

→ เพิ่ม **`PATCH /api/cms/landing`** ที่ deep-merge: ส่งมาเฉพาะที่จะเปลี่ยน
อย่างอื่นไม่ขยับ · list แทนที่ทั้งก้อน (merge ตาม index จะเพี้ยนทันทีที่ลบสไลด์)

### 2.2 ไม่มี undo เลย

ไม่มีประวัติการแก้ที่ไหนเลยในระบบ และ `POST /landing/reset` ใช้ `delete_many`
แล้ว `insert_one` — ทิ้งเอกสารปัจจุบันโดยไม่เก็บสำเนา

→ เพิ่ม **`cms_revisions`**: ทุกการเขียน landing / post เก็บ snapshot ของ**ก่อนหน้า**ไว้
`GET /api/cms/revisions` · `POST /api/cms/revisions/{id}/restore`
เก็บ 50 รุ่นล่าสุดต่อเอกสาร · การ restore ก็ถูก snapshot ด้วย จึง undo ซ้อนได้

### 2.3 ไม่มีที่เก็บข้อความ

ไม่มี collection สำหรับ settings เลย (ตรวจแล้ว ไม่มีจริง ๆ) และ `LandingDoc`
เป็นโมเดลปิดที่มีแค่ 4 section ดังนั้นทุกคำขอว่า "ขอแก้ข้อความนี้ได้ไหม"
= แก้ schema + deploy ใหม่

→ เพิ่ม **`cms_site_settings`** เป็นเอกสารเปิดใบเดียว เขียน key อะไรก็ได้
ฝั่งหน้าเว็บอ่านผ่าน `useSiteText()` ที่**มีค่า fallback เป็นข้อความที่ฝังอยู่เดิม**

```jsx
<h1>{t('learn.heading', 'อ่านเทรนด์')}</h1>
```

ข้อความเดิมยังอยู่ในโค้ด เอกสาร settings เริ่มจากว่างเปล่าและมักว่างเกือบตลอด
key จะโผล่ก็ต่อเมื่อมีคนตั้งใจเขียนทับจริง ๆ → **request ล่ม / cache เย็น / พิมพ์ path ผิด /
ฐานข้อมูลใหม่เอี่ยม ทั้งหมดนี้แสดงผลเท่าของเดิมเป๊ะ** และการย้ายข้อความเข้า CMS
เป็นการแก้บรรทัดเดียวที่ทำให้หน้าพังไม่ได้

---

## 3. เครื่องมือ: `sitectl`

```bash
sitectl login                                  # ครั้งเดียว token อยู่ได้ 72 ชม.
sitectl landing get slides.0.heroPre
sitectl landing set slides.0.lede "ข้อความใหม่"
sitectl text set learn.heading "อ่านก่อนใคร"
sitectl text unset learn.heading               # กลับไปใช้ข้อความในโค้ด
sitectl post list / publish / unpublish
sitectl undo list / restore <rev-id>
```

### กันพลาดไว้ 5 ชั้น

| ชั้น | ทำอะไร |
|---|---|
| **PATCH อย่างเดียว** | ไม่มีทางเรียก PUT ที่เขียน null ทับได้ |
| **`If-Match`** | ถ้ามีคนแก้ใน `/admin/cms/landing` อยู่พร้อมกัน ได้ 409 ไม่ใช่ทับเขา |
| **diff ก่อนเขียน** | แสดง before/after รายฟิลด์ · `--dry-run` ไม่ส่งอะไรเลย |
| **ถามก่อนของอันตราย** | ลบฟิลด์ · ทำให้ว่าง · แก้เกิน 6 ฟิลด์พร้อมกัน → ต้อง `--yes` |
| **deny-list ตายตัว** | `purge` · `landing reset` · `/admin/users` เรียกไม่ได้เลย ไม่ว่าจะถูกสั่งยังไง |

และ **อ่านกลับจาก public endpoint** หลังเขียนเสมอ — "เขียนสำเร็จ" ไม่เท่ากับ
"คนเข้าเว็บเห็นแล้ว" เพราะ backend cache ไว้ 60–300 วินาที เครื่องมือจะรอและบอกว่า
ขึ้นจริงหรือยัง

### Skill

`.claude/skills/site-edit/SKILL.md` — พิมพ์สั่งที่นี่เป็นภาษาไทยได้เลย เช่น
"แก้หัวข้อหน้า /learn เป็น ..." แล้ว agent จะอ่านค่าเดิม เสนอ diff รอยืนยัน แล้วค่อยเขียน

---

## 4. ของที่เจอระหว่างทาง และแก้ไปด้วย

### 4.1 `robots.txt` บล็อกงาน SEO ของตัวเอง — **ความผิดพลาดของผมเองรอบที่แล้ว**

รอบที่แล้วผมเติม `Sitemap: https://swumkt.org/api/share/sitemap.xml` ลงไฟล์ที่มี
`Disallow: /api/` อยู่ก่อนแล้ว และผมไม่ได้สังเกต

ผลคือ **Google ไม่ดึง sitemap ที่ถูกสั่งห้ามคลาน** และ share bridge ที่
`/api/share/learn/{slug}` ก็โดนห้ามด้วย — งานการ์ดแชร์ + JSON-LD ทั้งหมดรอบที่แล้ว
ถูกบรรทัดนี้ปิดไว้

→ ใส่ `Allow: /api/share/` และ `Allow: /api/media/` ไว้ก่อน `Disallow: /api/`

### 4.2 API key จริงฝังเป็นค่า default ในโค้ด

`server.py:3059` และ `:5069`

```python
emergent_key = os.environ.get('EMERGENT_LLM_KEY', 'sk-emergent-8C90…(redacted)')
```

คีย์จริงอยู่ใน repo และถ้า env var หาย ระบบจะไปพังลึก ๆ ในฝั่ง provider แทนที่จะฟ้องตรงนี้
→ เอา default ออกทั้งสองจุด

**คีย์นี้อยู่ใน git history แล้ว ควรเพิกถอนและออกใหม่** — ผมทำให้ไม่ได้

### 4.3 `JWT_SECRET` มีค่า default ที่เดาได้

`'swumkt-secret-key-change-in-production'` — ถ้า env var ไม่ถูกตั้งบน prod
ใครก็ตามที่อ่าน repo นี้ปลอม token admin ได้
→ ไม่มี secret แล้วรันบน production = ไม่ยอมสตาร์ท · บน dev เตือนแล้วใช้ค่า dev

### 4.4 การเขียนที่ลืมล้าง cache

`soft_delete` · `restore` · `purge` · `landing reset` เปลี่ยนฐานข้อมูลแล้วจบ
ไม่ล้าง cache — ลบบทความแล้วมันยังโผล่อยู่ได้อีก 300 วินาที ซึ่งอ่านเหมือน "สั่งแล้วไม่ติด"
→ ใส่ครบทั้งสี่จุด

### 4.5 index ที่หายไประหว่างทาง

ตอนทำ baseline เปรียบเทียบเทส ผมกู้ไฟล์จาก backup ที่ถ่ายไว้**ก่อน**เพิ่ม index
ทำให้บล็อก index 12 ตัวจากรอบ performance หลุดไปจาก source โดยที่ index ใน DB
ของ pod ยังอยู่ จึงไม่มีอะไรฟ้อง — เจอตอนเห็นเลขตอน startup ลดจาก 51 เหลือ 39
→ ใส่กลับแล้ว ตอนนี้ 54 (เพิ่ม 3 ตัวของ content ops)

### 4.6 จำนวนเครื่องมือที่เขียนตายไว้

หน้าแรกเขียนว่า "แปดเครื่องมือ" ขณะที่รายการการ์ดข้าง ๆ มาจาก CMS
เพิ่มหรือลดการ์ดเมื่อไรตัวเลขผิดทันทีโดยไม่มีใครรู้ → ใช้ `TOOLS_LIVE.length`

---

## 5. ข้อความที่ต่อเข้า settings แล้ว

| หน้า | key |
|---|---|
| `/learn` | `learn.eyebrow` `learn.heading` `learn.headingAccent` `learn.lede` |
| `/announcements` | `announcements.eyebrow` `announcements.heading` `announcements.headingAccent` |
| `/showcase` | `showcase.eyebrow` `showcase.eyebrowNote` |
| หน้าแรก | `home.heroCtaPrimary` + `…Path` · `home.heroCtaSecondary` + `…Path` · `home.toolsEyebrow` `home.toolsHeading` `home.toolsHeadingLine2` `home.toolsLede` |

ข้อความอื่นที่ยังฝังอยู่ (เมนู · footer · หน้า `/about`) ต่อเพิ่มได้ด้วยการแก้บรรทัดเดียว
ต่อข้อความ ตามแบบใน `useSiteText.js` — **แต่การต่อแต่ละครั้งยังต้อง deploy หนึ่งรอบ**
หลังจากนั้นข้อความนั้นแก้ได้ตลอดไปโดยไม่ต้อง deploy อีก

---

## 6. ข้อจำกัดที่ต้องรู้

**ยังเข้า prod ไม่ได้** — ผมยังไม่เคย login เข้าเว็บจริงในฐานะ admin
`intaka@gmail.com` อยู่ใน `HARDCODED_ADMIN_EMAILS` และถูกเลื่อนเป็น admin อัตโนมัติ
**แต่เป็นบัญชี Google OAuth ซึ่งไม่มีรหัสผ่านให้ `POST /api/auth/login` ใช้**
ต้องเลือกอย่างใดอย่างหนึ่ง:
1. ตั้งรหัสผ่านให้บัญชี admin สักใบแล้วบอกผม — ง่ายที่สุด ใช้ได้ทันที
2. ทำ API key แบบมี scope (`cms.*` เท่านั้น เพิกถอนได้) — ปลอดภัยกว่า แต่ต้องเขียนเพิ่ม

ข้อ 2 ดีกว่าในระยะยาว เพราะ JWT หมดอายุ 72 ชม. และพกสิทธิ์ admin เต็มใบติดไปด้วย
ทั้งที่งานนี้ต้องการแค่สิทธิ์แก้เนื้อหา · บอกมาว่าจะเอาแบบไหน เดี๋ยวผมทำต่อ

**cache เป็นราย process** — `lib/ttl_cache.py` เป็น dict ธรรมดาในหน่วยความจำ
ถ้า backend รันหลาย worker การล้าง cache จะโดนแค่ตัวที่รับ request นั้น
ตัวอื่นรอ TTL ของตัวเองหมด (60–300 วินาที) · `sitectl` รอและรายงานตามจริง
ถ้าอยากให้แน่นอนต้องย้ายไปใช้ Redis หรือกำหนดให้มี worker เดียว

---

## 7. ทดสอบอะไรไปแล้ว

รันบน emergent-sim pod (Linux `/app` จริง · MongoDB จริง · เบราว์เซอร์จริง)

| | ผล |
|---|---|
| `pytest tests/test_content_ops.py` | **27 ผ่าน** |
| `pytest tests/test_inline_media.py` | 25 ผ่าน |
| `pytest tests/` เทียบกับ HEAD ที่ยังไม่แก้ | **รายชื่อ fail เหมือนกันเป๊ะ 156 รายการ — ไม่มี regression** |
| `CI=true yarn build` | ผ่าน ไม่มี warning |
| แก้ข้อความจริงผ่าน CLI → เบราว์เซอร์ | `/learn` เปลี่ยนหัวข้อจริงโดยไม่ build ใหม่ |
| undo | แก้ → restore → ข้อความเดิมกลับมา |
| `If-Match` ค้าง | ได้ 409 ตามคาด |
| ทำให้ฟิลด์ว่างโดยไม่ใส่ `--yes` | ถูกปฏิเสธ exit 1 |

เทสที่สำคัญที่สุดคือ `test_patch_leaves_siblings_alone` — ยืนยันว่า PATCH
ไม่ไปแตะฟิลด์ที่ไม่ได้ส่งมา ซึ่งคือเหตุผลที่ feature นี้มีอยู่

---

## 8. รีวิวตัวเอง แล้วเจอบั๊กที่เพิ่งเขียนเอง

หลังเขียนเสร็จ รันรีวิว 5 มุม แล้วทุกข้อที่เจอโดน 3 sceptics พยายามหักล้าง
ต้องรอดอย่างน้อย 2 เสียงถึงนับ — รอด 25 ข้อ (ซ้ำกันบางส่วน) แก้แล้วทั้งหมดที่เป็นของจริง

### ข้อที่ร้ายแรงที่สุดคือของผมเอง

```python
key = "key" if collection == "cms_landing" else "id"
```

`cms_site_settings` ใช้ `key: "site"` เหมือน landing แต่โดนส่งเข้าสาย `id`
→ `find_one({"id": "site"})` ไม่เจออะไรเลย → **ไม่เคยบันทึก revision ของ settings สักครั้ง**

ตรวจในฐานข้อมูลยืนยัน: `cms_landing 17 revisions, cms_site_settings 0`
ทั้งที่ docstring ของผมเองกับ SKILL.md เขียนไว้ว่า "ทุกการเขียนเก็บ snapshot ก่อน"
→ เปลี่ยนเป็น mapping ต่อ collection + เพิ่ม `doc=settings` ใน `/cms/revisions` + ใส่เทสกัน

### ที่เหลือที่แก้

| เจออะไร | ผลถ้าไม่แก้ |
|---|---|
| flag หลัง subcommand ถูก argparse ปฏิเสธ | ตัวอย่างใน SKILL.md ของผมเอง รันแล้ว exit 2 ไม่ทำอะไร |
| deny-list เทียบแบบ suffix | `/admin/users/<id>/role` ซึ่งเป็นตัวเปลี่ยนสิทธิ์จริง **ไม่ถูกบล็อก** |
| PATCH ไม่ validate ผลลัพธ์ | `landing set slides "oops"` → หน้าแรกว่างเปล่า ตอนนี้ได้ 422 |
| If-Match เป็น check-then-act | เปลี่ยนเป็นเขียนแบบมีเงื่อนไขที่ version |
| `purge` / `reset` เดินต่อแม้ snapshot ล้ม | แยก "ไม่มีอะไรให้เก็บ" ออกจาก "เก็บไม่สำเร็จ" แล้วปฏิเสธเฉพาะอย่างหลัง |
| backfill เช็คแค่ key หาย ไม่เช็ค null | null ที่ PUT เก่าเขียนไว้ค้างถาวร (ของเดิม ไม่ใช่ของรอบนี้) |
| read-back เทียบค่าดิบ | เขียนรูปสำเร็จแต่รายงานว่าล้มเหลว เพราะ public คืน URL ไม่ใช่ base64 |
| revision เก็บ base64 เต็ม | 50 รุ่น × 2 MB = 100 MB ต่อเอกสาร → จำกัดทั้งจำนวนและขนาดรวม |
| `safe_create_index` นับ error เป็น "มีอยู่แล้ว" | unique index ที่สร้างไม่ได้เพราะข้อมูลซ้ำ ดูเหมือนสำเร็จ |
| `post set` ชื่อฟิลด์ผิด | server เมินเงียบ ๆ แล้วตอบ 200 → ตรวจชื่อฟิลด์ฝั่ง client |
| lede บอกจำนวนเครื่องมือผิดตอนโหลดแรก | ของที่ผมเพิ่งสร้างเองรอบนี้ |
| ปุ่ม "คัดลอกแล้ว" ไม่รีเซ็ต | กดครั้งที่สองไม่มี feedback |

### ข้อที่ผมเขียนผิดระหว่างแก้ แล้วจับได้เอง

`raise RuntimeError(...) if cond else None` — อันนี้ parse เป็น `raise (X if cond else None)`
คือถ้าเงื่อนไขไม่ตรงจะ **raise None** ซึ่งเป็น TypeError · เปลี่ยนเป็น `if` ปกติแล้ว

### `JWT_SECRET` — ตัดสินใจอย่างไร

guard แรกที่ผมเขียนเช็ค `ENVIRONMENT in ('production','prod')` แต่ตรวจแล้ว
**ไม่มีอะไรตั้งตัวแปรนี้เลยทั้ง repo** — guard จึงเป็น dead code

เปลี่ยนเป็น: **ไม่มี `JWT_SECRET` = ไม่สตาร์ท** (ยกเว้นตั้ง `ALLOW_INSECURE_JWT_SECRET=1`)
ทุก environment ที่มีอยู่จริงตอนนี้ตั้งค่านี้ไว้แล้ว (local `.env`, pod, CI)

**ความเสี่ยงที่ต้องบอกตรง ๆ:** ถ้า prod ไม่ได้ตั้ง `JWT_SECRET` ไว้ **deploy ครั้งถัดไปจะไม่ขึ้น**
ผมตรวจ env ของ prod ไม่ได้ · เลือกทางนี้เพราะ deploy ล่มแก้ได้ในนาทีเดียวและ error บอกชัด
ส่วน token admin ที่ใครก็ปลอมได้แก้ไม่ได้เลย — **ให้ฝั่ง emergent เช็ค env ก่อน deploy**

---

## 9. API key แบบมี scope (ทำแล้ว)

เลือกทางนี้แทนการให้ `sitectl` ถือ JWT ของเจ้าของงาน ด้วยเหตุผลสามข้อ:
JWT หมดอายุ 72 ชม. (พังกลางคันวันที่สี่) · พกสิทธิ์ admin เต็มใบ ทั้งที่งานนี้ต้องการแค่แก้เนื้อหา ·
และ**เพิกถอนไม่ได้** — token ที่เซ็นแล้วใช้ได้จนหมดอายุ ไม่ว่าจะทำอะไรในฐานข้อมูล

### ออกคีย์

```bash
python backend/scripts/mint_api_key.py --label "sitectl · claude-code"
# แคบลงได้
python backend/scripts/mint_api_key.py --label "publish bot" \
    --scope cms.read --scope cms.posts.write
```

สคริปต์เขียนลง Mongo ตรง ๆ เพราะ `POST /api/cms/keys` ต้องมี admin login อยู่แล้ว
ซึ่งเป็นสิ่งที่คีย์มีไว้เพื่อไม่ต้องมี — คีย์ใบแรกจึงต้องออกจากฝั่งเซิร์ฟเวอร์
ใบต่อ ๆ ไปออกผ่าน endpoint ได้

คีย์แสดงครั้งเดียว · เก็บเฉพาะ SHA-256 · ขึ้นต้นด้วย `swk_` เพื่อให้เห็นได้ทันทีถ้าหลุดไปอยู่ใน log

```bash
export SWUMKT_API_KEY=swk_...        # หรือ sitectl use-key
python backend/scripts/sitectl.py whoami
```

### scope

| scope | ได้อะไร |
|---|---|
| `cms.read` | อ่านเอกสาร CMS ทั้งหมด รวม draft |
| `cms.landing.write` | แก้หน้าแรก |
| `cms.settings.write` | แก้ข้อความ/ป้ายต่าง ๆ |
| `cms.posts.write` | สร้าง แก้ เผยแพร่ ทิ้งบทความ |
| `cms.revisions.restore` | ย้อนเอกสารกลับ |
| `cms.*` | ทั้งหมดข้างบน |

### สิ่งสำคัญที่สุด: gate ปฏิเสธเป็นค่าตั้งต้น

`required_scope(method, path)` คืน `None` ทั้งกรณีที่อยู่ใน `HARD_DENY`
**และกรณีที่ไม่มีกฎไหนตรงเลย** — `None` แปลว่าปฏิเสธ

แปลว่า **เพิ่ม route ใหม่เข้าแอปจะไม่ขยายสิทธิ์ของคีย์ที่มีอยู่แล้วโดยบังเอิญ**
ซึ่งสำคัญ เพราะ principal ที่คีย์สวมมี `role=ADMIN` (handler ของ CMS ทั้ง ~20 ตัว
เช็ค `role == admin` และไม่คุ้มที่จะสอนทุกตัวให้รู้จักสิทธิ์แบบที่สอง)
ตัวที่กั้นจริงคือ gate ตัวเดียวนี้ และมันปฏิเสธก่อนที่ principal จะถูกสร้างขึ้นด้วยซ้ำ

`HARD_DENY` ห้ามตลอดไม่ว่า scope อะไร: `purge` · `landing/reset` · `/api/admin/*` ·
`/api/auth/*` · `/api/users` · `/api/cms/keys` (คีย์ออกคีย์เองไม่ได้)

ทดสอบจริงบน pod:

```
cms.*  →  GET/PATCH /api/cms/landing, /settings, /revisions      200
cms.*  →  purge · landing/reset · /api/admin/* · /cms/keys       403
cms.*  →  /api/auth/me · /api/brand-equity/studies · /api/surveys 403
cms.read → PATCH /api/cms/settings
           403 "lacks the 'cms.settings.write' scope (has: cms.read)"
เพิกถอนแล้ว → 401 "API key 'sitectl · claude-code' was revoked"
```

### ประวัติการแก้บันทึกว่าเป็นคีย์ ไม่ใช่คน

`actor` ของ revision เป็น `swk_Od4PUsiH@api-key.swumkt` ไม่ใช่อีเมลของใครสักคน
ซึ่งถูกต้องกว่า — คนคนนั้นไม่ได้อยู่ตรงนั้น

### เทส

`backend/tests/test_api_keys.py` — **40 ผ่าน** ส่วนใหญ่เป็นเทสเชิงลบ
รวมถึงกวาดทุก path ที่ต้องห้าม ทั้งแบบมี query string ท้าย slash และ path ที่ยังไม่มีในแอป
