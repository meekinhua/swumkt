# หน้าคณาจารย์ + ผลงานตีพิมพ์ แบบ SEO-driven

**วันที่:** 27 ต.ค. 2569
**โจทย์:** "ทำให้มี section ของอาจารย์ และมีลิงก์ paper ให้อ่านด้วย แล้วจัดระบบให้เป็น SEO driven"
**ตั้งต้น 4 ท่าน** จาก https://bas.swu.ac.th/faculty/marketing-management แล้วตามหาผลงานมาลง

---

## 0. สรุป

| หน้า | ทำอะไร |
|---|---|
| `/people` | รวมคณาจารย์ |
| `/people/<slug>` | โปรไฟล์ — ความเชี่ยวชาญ · ผลงาน · ลิงก์ ORCID/CV · บทความที่เขียนในเว็บ |
| `/publications` | ผลงานทั้งภาควิชา กรองตามปี/อาจารย์ได้ · คลิกชื่อเรื่องไปอ่านที่วารสาร |

เพิ่ม "คณาจารย์" ในเมนูบนสุด และ Faculty + Publications ใน footer ทุกหน้า
บทความใน Knowledge Hub ผูกกับอาจารย์ได้ → มี byline "โดย …" ลิงก์ไปหน้าโปรไฟล์

---

## 1. ข้อมูลมาจากไหน

| ข้อมูล | แหล่ง | หมายเหตุ |
|---|---|---|
| ชื่อ ตำแหน่ง อีเมล รูป ลิงก์ CV | หน้าภาควิชา มศว | คัดลอกตรงตัวอักษร |
| รายการผลงาน | **OpenAlex** | ฐานข้อมูลวิชาการเปิด ครอบคลุมใกล้เคียง Scopus มี DOI |
| ยืนยันผลงาน | **ORCID** ของแต่ละท่าน | รายการที่เจ้าตัวดูแลเอง — ความเชื่อมั่นสูงสุด |

**ทำไมไม่ใช่ Google Scholar / Scopus ตรง ๆ:** Google Scholar บังคับ login บัญชี Google
ในเบราว์เซอร์นี้ (ผมไม่ login ให้) · Scopus ต้องใช้ login สถาบัน
OpenAlex + ORCID ให้ข้อมูลชุดเดียวกันในรูปแบบที่ตรวจสอบได้ และ ORCID ยังเป็นสิ่งที่
อาจารย์ยืนยันเองด้วย · ลิงก์ Scholar/Scopus ของแต่ละท่านใส่ทีหลังได้ทันที (ดูข้อ 5)

**ไม่ได้อ่าน CV** — ไฟล์ CV ในหน้าภาควิชาเปิดในเบราว์เซอร์ไม่ได้ (เด้งเป็นการดาวน์โหลด)
และการดาวน์โหลดไฟล์ต้องขออนุญาตก่อน ถ้าอยากให้ผมเอา CV มาเทียบรายการ บอกได้

### ผลที่ได้

| อาจารย์ | แสดง | รอตรวจ | ORCID |
|---|---|---|---|
| รศ.ดร.อินทกะ พิริยะกุล | 16 | 11 | ✓ |
| รศ.ดร.วรินรำไพ รุ่งเรืองจิตต์ | 7 | 6 | ✓ |
| ดร.ภูมิภักดิ์ คูสวัสดิ์ | 6 | 0 | ✓ |
| ผศ.กนกกาญจน์ บัญชาบุษบง | 2 | 0 | — |

รวม **30 รายการแสดง** (17 ยืนยันจาก ORCID · 12 มี DOI · 1 วารสารไทยไม่มี DOI)
และ **17 รายการกันไว้รอตรวจ** · paper ที่เขียนร่วมกัน (virtual influencer)
เป็น record เดียวที่ขึ้นทั้งสองหน้า

---

## 2. 17 รายการที่กันไว้ — **อย่าเผยแพร่โดยไม่ดู**

เป็นบันทึกผลงานของคนจริงที่ระบบอัตโนมัติทำพลาด แต่ละรายการมี `review_note` บอกเหตุผล

**ชื่อเรื่องภาษาไทยเพี้ยน (6 รายการ)** — OpenAlex ดึงข้อความไทยจาก PDF แล้วสระ
และวรรณยุกต์หาย เช่น "การเลาตำนานและประสบการณลกคา…" ผมลองไปเอาชื่อจริงจาก ThaiJO
แต่เครื่องนี้เข้า ThaiJO ไม่ได้ (หมดเวลาทั้ง curl และเบราว์เซอร์)
**ผมจะไม่เดาชื่อเรื่องเอง** — การเติมสระให้ชื่องานวิชาการของคนอื่นคือการสร้างข้อมูลขึ้นมา

**น่าจะเป็นสารนิพนธ์นักศึกษา (11 รายการ)** — ตัวพิมพ์ใหญ่ทั้งหมด ไม่มีวารสาร ไม่มี DOI
ปี 2018–2020 เช่น "FACTORS RELATED TO BUDDHISM LOYALTY OF THAI BUDDHISTS"
ที่ระบบระบุว่าเป็น *dissertation* ของ รศ.ดร.อินทกะ ในปี 2018 — รูปแบบนี้คือ
งานที่อาจารย์เป็นที่ปรึกษาแล้วถูกผูกชื่ออาจารย์เป็นผู้แต่ง

ดูรายการ:

```bash
python backend/scripts/sitectl.py paper list --status review
```

แก้ชื่อแล้วเผยแพร่:

```bash
python backend/scripts/sitectl.py paper set pap-w7215668802 title "ชื่อที่ถูกต้อง"
python backend/scripts/sitectl.py paper publish pap-w7215668802
```

---

## 3. SEO — ทำอะไรไปบ้าง และทำไม

**หลักคือให้ Google รู้ว่า "อินทกะ พิริยะกุล" ในหน้านี้ = ใน ORCID = ใน paper
ที่ตีพิมพ์ = ผู้เขียนบทความใน Knowledge Hub เป็นคนเดียวกัน** ชื่อเสียงของภาควิชา
ก่อตัวจากการเชื่อมโยงนี้

| ทำ | ผล |
|---|---|
| JSON-LD `ProfilePage` + `Person` ทุกหน้าโปรไฟล์ | Google รู้ว่าหน้านี้คือหน้าหลักของบุคคลนี้ |
| `sameAs` → ORCID, OpenAlex (+ Scholar/Scopus เมื่อใส่) | เชื่อมโปรไฟล์ทุกที่เข้าเป็น entity เดียว |
| `ScholarlyArticle` ทุก paper อ้างผู้แต่งด้วย `@id` | paper กับโปรไฟล์ชี้ที่คนเดียวกัน ไม่ใช่แค่ชื่อลอย ๆ |
| paper ร่วมชี้ทั้งสองท่านด้วย `@id` | Google เห็นภาควิชาเป็นเครือข่ายคนที่ทำงานด้วยกัน |
| `knowsAbout` = สาขาที่เชี่ยวชาญ (ไทย + อังกฤษ) | ค้น "live-streaming commerce Thailand" มีโอกาสเจอ |
| `BreadcrumbList` | แสดง breadcrumb ในผลค้นหา |
| `<title>` = ชื่อไทย + (ชื่ออังกฤษ) | ตรงกับที่คนพิมพ์ค้นทั้งสองภาษา |
| byline บทความ → `Person` ที่มี `@id` เดียวกับโปรไฟล์ | บทความใน Knowledge Hub นับเป็นผลงานของอาจารย์ |
| share bridge `/api/share/people/<slug>` | แชร์ลง Facebook/LINE ขึ้นการ์ดรูป + ชื่ออาจารย์ |
| sitemap ใส่ `/people`, ทุกโปรไฟล์, `/publications` | Google เจอทุกหน้าโดยไม่ต้องรอไต่ลิงก์ |
| ลิงก์ในเมนูบนสุดและ footer ทุกหน้า | ทุกหน้าส่งน้ำหนักลิงก์มาที่หน้าคณาจารย์ |

JSON-LD ฝั่ง server (share bridge สำหรับ Facebook/LINE ที่ไม่รัน JS) กับฝั่ง client
(สำหรับ Googlebot ที่รัน JS) **ใช้ `@id` ชุดเดียวกัน** — ทุกหน้าที่พูดถึงคนคนนี้ตอบตรงกัน

### `/publications` ไม่ใช่ `/research`

`robots.txt` มี `Disallow: /research/` อยู่แล้ว (เป็นที่อยู่ของเครื่องมือ conjoint)
ถ้าตั้งหน้ารวม paper ไว้ที่ `/research` Google จะไม่เก็บเลย

### อีเมล

หน้าภาควิชาเปิดอีเมลไว้แล้ว แต่หน้าโปรไฟล์ถูก crawl บ่อยกว่ามาก จึงไม่ใส่อีเมลไว้ใน HTML
— แสดงเป็น `intaka [at] g [dot] swu [dot] ac [dot] th` แล้วต่อเป็นลิงก์จริงตอนคนกดเท่านั้น
ปิดรายคนได้ด้วย `sitectl faculty set <slug> show_email false --json`

---

## 4. บั๊กที่เจอระหว่างทาง

### sitemap ไม่เคยมี showcase เลยสักชิ้น — **ของผมเองรอบ SEO ก่อน**

โค้ดที่ผมเขียนกรองด้วย `{"showcase": True}` ซึ่ง**ไม่มีฟิลด์นี้ในทั้งสอง collection**
(ฟิลด์จริงคือ `is_public_showcase` และ `is_public_result`) และใช้ path ที่ไม่มี route รองรับ
ผลคือ showcase **0 ชิ้น** ใน sitemap ทั้งที่มีที่เผยแพร่อยู่ · ตอนรายงานรอบนั้นผมบอกว่า
sitemap "รวมบทความ + showcase ทุกชิ้น" ซึ่งจริงแค่ครึ่งเดียว

แก้ให้ใช้ฟิลด์และ path จริง (`/showcase/<token>`, `/conjoint/results/<id>`) แล้ว — ตอนนี้ขึ้นครบ

### byline ขัดกันเอง

หน้าบทความ (SPA) ระบุผู้เขียนเป็น `Organization` ขณะที่ share bridge ระบุเป็น `Person`
crawler ที่เห็นทั้งสองได้คำตอบไม่ตรงกัน · ตอนนี้ทั้งสองใช้ `Person` ตัวเดียวกับหน้าโปรไฟล์

### byline แก้ไม่ได้

`author_name` ถูกประทับจากคนที่ login ตอนสร้างบทความ และไม่อยู่ในโมเดล update
→ บทความที่อาจารย์เขียนแต่ admin กรอก ให้เครดิต admin ตลอดไป · เพิ่ม `author_faculty_ids` แล้ว

---

## 5. แก้จากที่นี่ได้เลย ไม่ต้อง deploy

```bash
# ใส่ลิงก์ Google Scholar / Scopus (ผมหาให้ไม่ได้เพราะต้อง login)
python backend/scripts/sitectl.py faculty set intaka-piriyakul links.scholar "https://scholar.google.com/citations?user=..."
python backend/scripts/sitectl.py faculty set intaka-piriyakul links.scopus  "https://www.scopus.com/authid/detail.uri?authorId=..."

# เขียนประวัติ (ตอนนี้มีแค่ตำแหน่ง + ภาควิชา — ผมไม่เขียนประวัติคนจริงเอง)
python backend/scripts/sitectl.py faculty set poompak-kusawat bio_th "..."

# เปลี่ยนรูป (prompt อยู่ที่ memory/FACULTY_PORTRAIT_PROMPTS.md)
python backend/scripts/sitectl.py faculty photo kanokkan-bunchabusabong portrait.jpg

# ผูกบทความกับอาจารย์ → byline ขึ้นเอง
python backend/scripts/sitectl.py post set <post-id> author_faculty_ids '["fac-intaka-piriyakul"]' --json

# เพิ่ม paper ที่ระบบหาไม่เจอ
python backend/scripts/sitectl.py paper add --faculty poompak-kusawat --title "..." --doi 10.xxxx/...
```

ต้องใช้ API key ที่มี scope `cms.faculty.write` (หรือ `cms.*`) · ทุกการแก้ undo ได้

---

## 6. เพิ่มอาจารย์ท่านอื่น

หน้าภาควิชามีอีก 2 ท่านในสายการตลาด (ผศ.ดร.วรินทรา ศิริสุทธิกุล · ผศ.ดร.ณัฐยา ประดิษฐสุวรรณ)
และ 3 ท่านสายการจัดการ — ยังไม่ได้ใส่เพราะโจทย์ให้ตั้งต้น 4 ท่าน

ทำได้สองทาง: บอกผมแล้วผมดึงข้อมูลแบบเดียวกัน หรือเพิ่มเองผ่าน `POST /api/cms/faculty`
(โปรไฟล์ใหม่เริ่มเป็น `draft` เสมอ — หน้าเกี่ยวกับคนจริงควรมีคนดูก่อนเปิด)

---

## 7. ทดสอบ

| | ผล |
|---|---|
| `test_faculty.py` | **26 ผ่าน** — รวมเทสที่ยืนยันว่ารายการ `review` ไม่หลุดไป endpoint สาธารณะใดเลย |
| ชุดเต็มเทียบ HEAD | **ไม่มี regression** |
| `CI=true yarn build` | ผ่าน |
| เบราว์เซอร์จริง | `/people` · `/people/<slug>` · `/publications` · byline บทความ — ไม่มีรูปเสีย อีเมลไม่อยู่ใน HTML |
| seed รันซ้ำ | ไม่เปลี่ยนอะไร (insert-only — ไม่ทับสิ่งที่อาจารย์แก้ไปแล้ว) |

---

## 8. รีวิวรอบสุดท้าย — และสิ่งที่ใหญ่ที่สุดที่เจอทั้งโปรเจกต์

รีวิว 6 มุม 120 agent รอด 36 ข้อ (ซ้ำกันหลายข้อ) แก้ทุกข้อที่เป็นของจริง

### Google เห็นทุกหน้าของเว็บเป็นหน้าว่าง — มาตั้งแต่ก่อนผมเข้ามา

เว็บนี้เป็น SPA: ทุกหน้าเป็นเปลือกเปล่าจนกว่า JavaScript จะไปดึงข้อมูลจาก `/api`
Googlebot รัน JavaScript ได้ **แต่เคารพ robots.txt ตอนดึงข้อมูลด้วย** และ robots.txt มี
`Disallow: /api/`

บน prod หน้าเว็บ swumkt.org ดึงข้อมูลจาก `https://cite-master-2.emergent.host/api/...`
และ host นั้นเสิร์ฟ robots.txt ชุดเดียวกัน (ตรวจแล้ว) → Googlebot render
**หน้าแรก บทความ showcase และหน้าอาจารย์ใหม่ทั้งหมด เป็นหน้าว่าง ไม่มีเนื้อหา ไม่มี JSON-LD**

ตอนรอบ SEO ผมเปิดให้แค่ `/api/share/` กับ `/api/media/` — ไม่ได้เปิด API ข้อมูลที่หน้าเว็บใช้
เพราะไม่ได้คิดถึงการ render ของ Googlebot เลย

**แก้:** เปิด endpoint อ่านอย่างเดียวที่หน้าสาธารณะใช้ render (`/api/cms/landing`,
`/api/cms/posts/public`, `/api/faculty`, `/api/publications`, `/api/showcase/index` ฯลฯ)
ที่เหลือใต้ `/api` ยังปิด · และใส่ `X-Robots-Tag: noindex` ให้ JSON ของ API
เพื่อให้ Google *ดึงไป render ได้* แต่ *ไม่เอา JSON ไปขึ้นผลค้นหา*

**หลัง deploy ควรเห็นผลใน Google Search Console** — ใช้ URL Inspection กับหน้าบทความสักหน้า
ดู "Rendered page" ก่อน deploy จะเห็นหน้าว่าง หลัง deploy ควรเห็นเนื้อหา

### อีเมลอยู่ใน JSON สาธารณะ

พอเปิดให้ crawler ดึง `/api/faculty` ได้ อีเมลที่อยู่ใน JSON นั้นก็เก็บได้ทันที
→ เอาออกจาก listing ทุกตัว · ปุ่ม "แสดงอีเมล" เรียก `/api/faculty/<slug>/contact`
ซึ่ง robots.txt ปิดไว้ · share bridge ก็ไม่ใส่อีเมลใน JSON-LD แล้ว

### ที่เหลือ

| เจออะไร | ผลถ้าไม่แก้ |
|---|---|
| ปิดหรือลบโปรไฟล์อาจารย์ แต่ paper ยังขึ้นใน `/publications` | ผลงานของคนที่ไม่ได้เปิดเผยตัวยังเป็นสาธารณะ |
| อาจารย์ที่มีแต่ชื่อไทย ทำ share bridge ล่ม (500) | การ์ดแชร์ของทุกคนที่เขียน paper ร่วมกันพังด้วย |
| id สร้างจาก slug → สร้างโปรไฟล์ด้วย slug ที่เคยลบไปแล้ว = 500 | slug นั้นใช้ไม่ได้อีกตลอดไป |
| PATCH ทำให้สอง paper มี DOI เดียวกันได้ | นับซ้ำ ทั้งจำนวน paper และการอ้างอิง |
| คีย์ที่มีแค่ `cms.revisions.restore` เผยแพร่ paper ที่ถูกซ่อนไว้ได้ | ข้ามการตรวจ scope |
| JSON-LD ฝั่ง server ใช้โลโก้มศวเป็น "รูปของบุคคล" | Google อาจผูกโลโก้เข้ากับตัวอาจารย์ |
| canonical บทความรวม `?utm_…` ไปด้วย | ทุกลิงก์ติดตามกลายเป็นหน้าคนละหน้า |
| ตัวกรองปีหดเหลือปีที่เลือก | เลือกปีแล้วเปลี่ยนปีไม่ได้ |
| `keepPreviousData` ไม่มีผลใน React Query v5 | รายการกระพริบว่างทุกครั้งที่กรอง |
| โปรไฟล์ค้าง "กำลังโหลด…" ตลอดไปเมื่อ error ที่ไม่ใช่ 404 | — |
| สร้างบทความพร้อมอาจารย์ แต่ระบบทิ้ง `author_faculty_ids` | byline ไม่ขึ้น |
| ไม่ตรวจรูปแบบ `links` / `research_areas` | ค่าผิดรูปทำหน้าโปรไฟล์ล่ม |

### 8 ข้อจากรีวิวรอบที่ล่มไปก่อนหน้า

รีวิว API key รอบแรกล่มเพราะ OAuth หมดอายุ — มี agent ตัวเดียวที่รันทัน เจอ 8 ข้อแต่ยังไม่ได้
ตรวจสอบ ผมตรวจเองทีละข้อ **ทั้ง 8 ข้อเป็นของจริง** และแก้หมดแล้ว ข้อที่หนักสุด:
`sitectl post publish "../../admin/users/x"` — client ไม่ resolve `..` ก่อนเช็ค deny-list
และถ้าใช้ login token (admin เต็มสิทธิ์) ฝั่ง server ไม่มี scope gate ให้พึ่ง
ตอนนี้ปฏิเสธทั้งสองฝั่ง: client ตรวจ id ทุกตัวที่จะเข้าไปใน path · gate ฝั่ง server
ปฏิเสธ path ที่มี `..`, `//` หรือ `%2e` ทันที
