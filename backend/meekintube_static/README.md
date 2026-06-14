# MyTube — YouTube-style PWA (embed player)

เว็บแอปหน้าตาเหมือน YouTube ที่เล่นวิดีโอผ่าน **YouTube embed player** เป็น **PWA** (ติดตั้งเป็นแอปได้)
เขียนด้วย HTML/CSS/JS ล้วน **ไม่มี build step, ไม่มี dependency, ไม่ต้องมี backend** — เป็นไฟล์ static ทั้งหมด

---

## ✨ ฟีเจอร์

- **หน้าแรกแบบฟีดแนะนำ** — สร้างแบบ dynamic จากประวัติการดู + วิดีโอกำลังมาแรง (ไม่ hardcode)
- **ค้นหาจริง** — ดึงผลจาก YouTube ผ่าน public Invidious/Piped instances (มี fallback หลายตัว) + **autocomplete**
- **เล่นวิดีโอผ่าน embed** — คลิก/วางลิงก์ YouTube หรือโค้ด `<iframe>` แล้วเล่นได้เลย
- **Mini-player (PiP)** — กดย่อแล้ววิดีโอลอยมุมจอ เล่นต่อขณะเลื่อนดูอย่างอื่น
- **วิดีโอ sticky บนหน้าเล่น (มือถือ)** — เลื่อนดูวิดีโอแนะนำได้โดยวิดีโอหลักยังเห็นตลอด
- **Shorts แบบ TikTok** — ผู้เล่นแนวตั้งเต็มจอ ปัด/เลื่อนขึ้น-ลงเปลี่ยนคลิป
- **ช่อง + การติดตาม** — คลิกชื่อช่องเข้าหน้าช่อง, กดติดตาม, ดูฟีดช่องที่ติดตาม
- **ประวัติการดู / เพลย์ลิสต์ / ดูภายหลัง** — เก็บใน `localStorage`
- **สำรวจ** — กำลังมาแรง / เพลง / เกม / กีฬา + แถบหมวดหมู่ (chips) ใช้งานได้จริง
- **รองรับมือถือเต็มที่** — responsive, bottom nav, drawer, รองรับ **safe-area (notch/Dynamic Island ของ iPhone)**

---

## 📁 โครงสร้างไฟล์

```
index.html              # ทั้งแอปอยู่ในไฟล์นี้ (HTML + CSS + JS)
manifest.webmanifest    # PWA manifest
sw.js                   # Service worker (cache app-shell, ใช้ offline ได้)
icon-192.png            # ไอคอนแอป
icon-512.png
icon-512-maskable.png   # ไอคอนแบบ maskable (Android)
apple-touch-icon.png    # ไอคอน iOS
serve_lan.py            # (ตัวช่วย) เสิร์ฟบน LAN เพื่อเทสบนมือถือ — ไม่จำเป็นตอน deploy
```

> ทุกไฟล์ต้องอยู่ **โฟลเดอร์เดียวกัน** และ path ใน manifest/sw เป็นแบบ relative อยู่แล้ว

---

## 🚀 Deploy (static hosting / Emergent)

แอปนี้เป็น **static site** — อัปโหลดไฟล์ทั้งหมดขึ้น static host ได้เลย โดยให้ `index.html` เป็นหน้าหลัก
ใช้ได้กับ Emergent, Netlify, Vercel, Cloudflare Pages, GitHub Pages ฯลฯ

**สิ่งที่ต้องมี:**
- เสิร์ฟผ่าน **HTTPS** (host พวกนี้ให้มาอยู่แล้ว) — จำเป็นสำหรับ PWA/Service Worker
- ไม่ต้องตั้ง build command / ไม่ต้องลง dependency
- ถ้าตั้ง config ได้: publish directory = โฟลเดอร์ที่มีไฟล์เหล่านี้, ไม่มี build

เปิดเสร็จกด **ติดตั้งแอป** บนเบราว์เซอร์ได้ทันที

---

## 🖥️ รัน local

ต้องเสิร์ฟผ่าน http (ไม่ใช่เปิดไฟล์ `file://` ตรง ๆ ไม่งั้น embed/PWA จะไม่ทำงาน)

```bash
# Python
python -m http.server 8000
# แล้วเปิด http://localhost:8000
```

**เทสบนมือถือ (Wi-Fi เดียวกัน):**
```bash
python serve_lan.py 8080
# จะแสดง URL เช่น http://192.168.x.x:8080 ให้เปิดบนมือถือ
```
> หมายเหตุ: PWA/ติดตั้งแอป ทำงานเฉพาะ https หรือ localhost — ผ่าน IP มือถือแบบ http จะเล่นได้ทุกอย่าง **ยกเว้น** การติดตั้งแอป/Service Worker (ลอง deploy ขึ้น host ที่เป็น https เพื่อเทส PWA เต็ม)

---

## ⚙️ การทำงาน (สั้น ๆ)

- **เล่นวิดีโอ**: ฝัง `https://www.youtube.com/embed/<videoId>` ใน iframe เดียวที่อยู่ระดับ `<body>` (`#dock`) — ไม่ย้าย DOM เพื่อให้สลับเต็มจอ ↔ mini โดยวิดีโอไม่รีโหลด
- **ค้นหา/แนะนำ/Shorts/ช่อง**: เรียก public Invidious (`/api/v1/...`) และ Piped (`/search`, `/trending`, `/suggestions`) มี fallback หลาย instance ถ้าตัวใดล่ม
- **ข้อมูลผู้ใช้**: `localStorage` (`mytube_videos`, `mytube_history`, `mytube_watchlater`, `mytube_playlists`, `mytube_subs`)
- **Offline**: service worker cache เฉพาะตัวแอป (หน้าเว็บ/ไอคอน) — ตัววิดีโอสตรีมจาก YouTube ต้องออนไลน์

---

## ⚠️ ข้อควรรู้

- **Public instances ไม่เสถียร 100%** — Invidious/Piped สาธารณะล่ม/โดนบล็อกบ่อย โค้ดมี fallback + ข้อความแจ้งเมื่อโหลดไม่สำเร็จ แต่บางช่วงอาจช้า/ต้องลองใหม่
  ถ้าต้องการความนิ่ง แนะนำเพิ่มโหมด **YouTube Data API key** ภายหลัง
- บางวิดีโอที่เจ้าของ **ปิดการฝัง (embedding)** จะเล่นใน iframe ไม่ได้ (เป็นข้อจำกัดของวิดีโอนั้น ไม่ใช่บั๊ก)
- แอปนี้เพื่อการศึกษา/ใช้ส่วนตัว — เคารพข้อกำหนดการใช้งานของ YouTube
