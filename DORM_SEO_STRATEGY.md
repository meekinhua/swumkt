# กลยุทธ์ SEO, ชุดคีย์เวิร์ดแนะนำ และแผนขยายแพลตฟอร์มสู่หลายมหาวิทยาลัย (`/dorm`)

เอกสารนี้ออกแบบ SEO เต็มระบบสำหรับ **หาห้อง·หาเมท** (เริ่มที่ **มศว ประสานมิตร** บน `https://swumkt.org/dorm`) และวางโครงสร้างข้อมูล + URL ให้ขยายไปมหาวิทยาลัยอื่นในไทยได้โดยไม่ต้องรื้อโค้ดใหม่

---

## 1. สิ่งที่จูนเข้ากับระบบแล้ว (Technical & On-Page SEO)

| ส่วนที่ปรับ | รายละเอียด |
|---|---|
| **`GET /api/dorm/sitemap.xml`** ([dorm.py](file:///c:/ClaudeCode/MktSwuPortal/swumkt/backend/routes/dorm.py)) | สร้าง Sitemap XML อัตโนมัติจาก DB ครอบคลุมหน้าหลัก `/dorm`, หน้าโซนที่มีห้อง, **ตึกทั้งหมด 42 ตึก** (`/dorm/buildings/{slug}`), และ**ห้องที่ยังเปิดอยู่ทั้งหมด** (`/dorm/rooms/{id}`) อัปเดตตลอดโดยไม่ต้อง redeploy |
| **`robots.txt` & `_INDEXABLE_API_PREFIXES`** ([robots.txt](file:///c:/ClaudeCode/MktSwuPortal/swumkt/frontend/public/robots.txt), [server.py](file:///c:/ClaudeCode/MktSwuPortal/swumkt/backend/server.py)) | เปิดให้ Googlebot ดึง public endpoints (`/api/dorm/buildings`, `/api/dorm/listings`, `/api/dorm/stats`, `/api/dorm/campuses`) ไป render SPA ได้ พร้อมปลด `X-Robots-Tag: noindex` สำหรับ `sitemap.xml`, `/api/dorm/og/*` และรูป `/api/dorm/photos/*` ขณะที่บล็อก `/dorm/admin`, `/dorm/me`, `/dorm/post` และ endpoint ติดต่อส่วนตัว |
| **`useDormSeo` & Schema.org JSON-LD** ([dormSeo.js](file:///c:/ClaudeCode/MktSwuPortal/swumkt/frontend/src/pages/dorm/dormSeo.js)) | จัดการ `<title>`, `meta description`, `link rel="canonical"` (ตัด UTM `?src=` ทิ้งอัตโนมัติกัน Duplicate Content), `meta robots` (`noindex, nofollow` บนหน้าส่วนตัว และ `noindex, follow` บนห้อง 410 ปิดแล้ว), Open Graph + Twitter Card ครบทุกหน้า |
| **Structured Data (Rich Snippets)** | หน้าแรก `WebSite + SearchAction + FAQPage`, หน้าตึก `ApartmentComplex + AggregateRating` (ดาวรีวิวจริง), หน้าห้อง `Accommodation + Offer (THB)`, หน้าตลาด `Dataset`, และ `BreadcrumbList` ทุกหน้ารอง |
| **OG Preview สำหรับตึก & ห้อง** | `/api/dorm/og/rooms/{lid}` และ `/api/dorm/og/buildings/{slug}` มี `rel="canonical"` ชี้กลับหน้าจริงและดึงรูป/ราคา/คะแนนรีวิวไปโชว์เวลาแชร์ลง LINE/Facebook |
| **Campus Registry (`dorm_campuses.json`)** | เก็บ metadata มหาวิทยาลัย, โซน, โดเมนอีเมลนิสิต (`email_domains`), และชุดคำค้น SEO ไว้ในไฟล์เดียว พร้อม filter `?campus=` และ `GET /api/dorm/campuses` |

---

## 2. ชุดคีย์เวิร์ดแนะนำสำหรับ มศว ประสานมิตร (SWU Prasarnmit)

### กลุ่ม A — Head & Commercial Intent (คนค้นเยอะ ตัดสินใจเช่าเร็ว)
- `หอพักใกล้ มศว ประสานมิตร` / `หอพักรอบ มศว`
- `คอนโดใกล้ มศว อโศก` / `เช่าคอนโดใกล้ มศว`
- `หอพักอโศก ใกล้มศว` / `หอพักซอยประสานมิตร`
- `หอพักใกล้ มศว เดินไปได้` / `หอพัก มศว ราคาถูก`

### กลุ่ม B — Roommate & Contract Transfer (จุดขายหลักของเว็บ แข่งกับเว็บบริษัทอสังหาฯ ง่าย)
- `หารูมเมท มศว` / `หาเมท มศว ประสานมิตร` / `หารูมเมท อโศก พระราม 9`
- `หาคนหารห้อง มศว` / `หาเมทหญิง มศว` / `หาเมทชาย มศว`
- `ส่งต่อสัญญาหอพัก มศว` / `ขายต่อสัญญาคอนโด อโศก มศว`
- `หอพักระยะสั้น ใกล้ มศว` / `เช่าคอนโดระยะสั้น ฝึกงาน อโศก`

### กลุ่ม C — Zone + Budget Long-Tail (ติดหน้าแรกง่าย + ตรงความต้องการนิสิตจริง)
- `หอพักใกล้ มศว ไม่เกิน 5000` / `หอพัก มศว งบ 4000-6000`
- `หอพักหญิง ใกล้ มศว ประสานมิตร`
- `หอพักประชาสงเคราะห์ ดินแดง ไป มศว`
- `คอนโดพระราม 9 ใกล้ มศว` / `คอนโดห้วยขวาง หาร 2 ไป มศว`
- `หอพักใกล้ MRT เพชรบุรี` / `หอพักใกล้ ARL มักกะสัน มศว`

### กลุ่ม D — Building-Name + Review Queries (High Conversion จากหน้ารีวิวตึก 42 แห่ง)
- `{ชื่อตึก} รีวิว มศว` / `{ชื่อตึก} ค่าเช่าเท่าไหร่` / `{ชื่อตึก} เดินไป มศว กี่นาที`
- ตัวอย่างตึกทำเลหลัก: `Life Asoke`, `Supalai Premier Asoke`, `Rhythm Asoke`, `The Address Asoke`, `Asoke Place`, `The Niche Mono Ratchavipha / พระราม 9`, `Summer Place ห้วยขวาง`, `หอพักหญิง มศว ประสานมิตร`, `Ideo Mobi Rama 9`, `A Space Asoke-Ratchada`

### กลุ่ม E — Seasonal Peak Timing (ตั้งเวลาผลัก SEO / OpenChat Digest)
- **เม.ย. – ก.ค. (TCAS รอบ 1–4 & เปิดเทอม 1):** เน้นคีย์เวิร์ด `หอพักเด็กใหม่ มศว ปี 1`, `หอพักใกล้ มศว เดินได้`, `หาเมทปี 1 มศว`
- **พ.ย. – ธ.ค. (เปิดเทอม 2 & ย้าย/ส่งต่อสัญญา):** เน้น `ส่งต่อสัญญา มศว`, `หาเมทเทอม 2 มศว`, `หอพักระยะสั้น อโศก`

---

## 3. โครงสร้างขยายไปมหาวิทยาลัยอื่น (Multi-Campus Blueprint)

ระบบฝั่ง backend วาง `campus_slug` (ค่าเริ่มต้น `"swu-prasarnmit"`) และตาราง `backend/data/dorm_campuses.json` ไว้รองรับไว้แล้ว แบ่งจังหวะการขยายเป็น 2 เฟส:

### เฟส 1 — Subfolder ใต้แพลตฟอร์มเดิม (ใช้ได้เลย เร็วที่สุด)
ใช้โครงสร้าง Path-based per campus เพื่อให้ SEO ของแต่ละมหาวิทยาลัยสะสม Authority บนโดเมนเดียว:
- หน้าแรก มศว (เดิมไม่เปลี่ยน): `/dorm` (canonical = `/dorm`)
- หน้าแรก ม.อื่น: `/dorm/c/:campusSlug` (เช่น `/dorm/c/chula`, `/dorm/c/ku-bangkhen`, `/dorm/c/tu-rangsit`)
- ห้อง/ตึก/หาเมทกรองตาม ม.: API รองรับ `?campus=chula` แล้วใน `GET /stats`, `GET /buildings`, `GET /listings`, `GET /mates`, `GET /sitemap.xml`
- **ยืนยันตัวตนนิสิตอัตโนมัติตาม ม.:** ใช้ Google Account `@student.chula.ac.th`, `@ku.th`, `@dome.tu.ac.th`, `@kmitl.ac.th`, `@bumail.net`, `@cmu.ac.th` ตาม `email_domains` ใน `dorm_campuses.json` — นิสิต ม.ไหนก็ยืนยัน 1 คลิกได้ทันทีโดยไม่ต้องเพิ่มงานแอดมิน

### เฟส 2 — แยกโดเมนกลางเมื่อขยายเกิน 2–3 มหาวิทยาลัย
หากต้องการแบรนด์กลางที่ไม่ติดชื่อเฉพาะ มศว (`swumkt.org`):
1. ตั้งโดเมนแบรนด์กลาง (เช่นแนว `nestmate.th`, `dekdorm.th`, `campushub.th`)
2. ทำ 301 Redirect จาก `swumkt.org/dorm/...` -> `brand.th/swu/...` (หรือทำ `rel="canonical"` ชี้ไปโดเมนใหม่ระหว่างย้าย) เพื่อไม่ให้ SEO Ranking ที่สะสมจาก มศว หายไป
3. ใช้ `campus_slug` เป็น root folder:
   - `brand.th/swu-prasarnmit/` (`มศว ประสานมิตร`)
   - `brand.th/chula/` (`จุฬาฯ`)
   - `brand.th/ku-bangkhen/` (`ม.เกษตร บางเขน`)
   - `brand.th/tu-rangsit/` (`มธ. รังสิต`)
   - `brand.th/kmitl/` (`สจล. ลาดกระบัง`)
   - `brand.th/cmu/` (`มช. เชียงใหม่`)

### ชุด Target มหาวิทยาลัยพร้อมโดเมนอีเมล & โซนตั้งต้น (ใส่ไว้ใน `dorm_campuses.json` แล้ว)

| มหาวิทยาลัย (`slug`) | โดเมนอีเมลนิสิต | โซนทำเลหลัก | ตัวอย่าง Keyword ทองคำ |
|---|---|---|---|
| **มศว ประสานมิตร** (`swu-prasarnmit`) | `g.swu.ac.th`, `swu.ac.th` | อโศก–เพชรบุรี, พระราม 9, ห้วยขวาง, ดินแดง | `หอพักใกล้ มศว`, `หาเมท มศว` |
| **มศว องครักษ์** (`swu-ongkharak`) | `g.swu.ac.th`, `swu.ac.th` | หน้ามอ, คลอง 16, คลอง 15 | `หอพัก มศว องครักษ์`, `หาเมท องครักษ์` |
| **จุฬาฯ** (`chula`) | `student.chula.ac.th`, `chula.ac.th` | สามย่าน, บรรทัดทอง, ราชเทวี, สีลม | `หอพักใกล้จุฬา สามย่าน`, `หาเมท จุฬา` |
| **ม.เกษตร บางเขน** (`ku-bangkhen`) | `ku.th`, `live.ku.th` | BTS ม.เกษตร, งามวงศ์วาน, เสนานิคม | `หอพัก งามวงศ์วาน พหลโยธิน`, `หาเมท เกษตร` |
| **มธ. รังสิต** (`tu-rangsit`) | `dome.tu.ac.th`, `tu.ac.th` | เชียงราก 1–2, Interpark, Kave/Plum | `คอนโดเชียงราก มธ รังสิต`, `ส่งต่อสัญญา มธ` |
| **สจล. ลาดกระบัง** (`kmitl`) | `kmitl.ac.th` | ซอยเกกีงาม 1–4, RNP, ตลาดจินดา | `หอพัก เกกีงาม ลาดกระบัง`, `หอพัก KMITL` |
| **ม.กรุงเทพ รังสิต** (`bu-rangsit`) | `bumail.net`, `bu.ac.th` | ซอยรังสิตภิรมย์, Kave/Plum หน้ามอ | `หอพักซอยรังสิตภิรมย์`, `หาเมท ม.กรุงเทพ` |
| **ม.เชียงใหม่** (`cmu`) | `cmu.ac.th` | หลังมอ (สุเทพ), หน้ามอ, นิมมาน | `หอพักหลังมอ มช`, `หารูมเมท มช` |

---

## 4. Checklist ส่ง Google Search Console หลัง Deploy

1. ยืนยัน ownership ของ `https://swumkt.org` ใน Google Search Console (ถ้ายังไม่ได้ส่ง sitemap เพิ่ม)
2. กด Submit Sitemap URL ใหม่: `https://swumkt.org/api/dorm/sitemap.xml` (คู่กับ `https://swumkt.org/api/share/sitemap.xml`)
3. ใช้เครื่องมือ **URL Inspection** เทส 3 หน้าหลัก (`https://swumkt.org/dorm`, `https://swumkt.org/dorm/buildings/life-asoke`, `https://swumkt.org/dorm/rooms?zone=asoke`) แล้วกด **Test Live URL** เพื่อตรวจดูว่า Googlebot render HTML + JSON-LD ได้สมบูรณ์โดยไม่ติด `robots.txt`
4. ตรวจใน **Rich Results Test** ของ Google ว่า `ApartmentComplex + AggregateRating` และ `FAQPage` ผ่านโดยไม่มี error
