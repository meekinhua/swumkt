# Prompt สร้างรูปอาจารย์ใหม่จากรูปเดิม

**ใช้กับ:** โมเดลที่แก้ภาพจากภาพต้นฉบับได้ — Gemini (Nano Banana) · ChatGPT image ·
Flux Kontext · Midjourney (`--cref` + `--cw 100`) · Firefly Generative Fill
**รูปต้นฉบับ:** `https://bas.swu.ac.th/Portals/4/Images/faculty_and_staff/marketing_and_management/MK01.png` (MK02, MK03, MK06)

รูปเดิมทุกท่านใช้แม่แบบเดียวกัน: ฉากเทาเรียบ แสงแฟลตด้านหน้า สูทสีเทาติดเข็มตรามหาวิทยาลัย
ครอปครึ่งตัว ~440×590 — ดูทางการแต่หม่นและแบน

---

## หลักการ 3 ข้อ

1. **หน้าต้องเป็นคนเดิม 100%** — นี่คือรูปประจำตัวบนเว็บทางการของมหาวิทยาลัย คนที่เคยเจออาจารย์
   ต้องจำได้ทันที โมเดลภาพมักแอบ "ปรับปรุง" หน้า (เรียวลง ผิวขาวขึ้น อ่อนวัยลง ตาโตขึ้น)
   prompt ข้างล่างจึงล็อกเรื่องนี้ไว้ก่อนอย่างอื่น
2. **เปลี่ยนแค่แสง ฉาก และโทนสี** — ไม่เปลี่ยนเสื้อผ้า ทรงผม หรือท่าทาง
3. **ทุกท่านใช้ prompt เดียวกันเป๊ะ** — หน้า `/people` แสดงเป็นตาราง ถ้าแสงหรือฉากต่างกัน
   จะดูเหมือนรูปมาจากคนละที่ ทำทีเดียวทั้ง 4 ท่านในเซสชันเดียว

---

## Prompt หลัก (แนะนำ — ฉากไล่สีอุ่น)

สว่าง สะอาด ทันสมัย และที่สำคัญคือ**คุมให้เหมือนกันทุกรูปได้ง่าย**

```
Professional portrait retouch of the person in the reference photo.

IDENTITY — keep exactly as in the original: the same face, facial
structure, eye shape, nose, lips, jawline, skin tone, skin texture, age,
hairstyle, hair colour and hairline. Do not slim, smooth, lighten,
de-age or beautify. They must be instantly recognisable to anyone who
knows them.

KEEP: the same clothing, the same blazer and the university pin on the
lapel, the same pose and head angle, the same expression.

CHANGE ONLY the lighting, background and colour grade:
- Lighting: soft, bright, natural window-style key light from camera
  left at 45 degrees, gentle fill, subtle rim light separating hair and
  shoulders from the background. Even, flattering, no harsh shadows.
- Background: smooth seamless gradient, warm off-white (#F7F4EE) at the
  top fading to a soft warm beige (#E9E1D3), very slight vignette.
- Colour: clean and fresh, true-to-life skin, gentle warmth, crisp but
  natural contrast.
- Camera: 85mm portrait look, eye level, sharp focus on the eyes.

Composition: head and shoulders, 4:5 portrait, eyes on the upper third,
a little headroom.

Photorealistic. Looks like an editorial faculty portrait from a modern
university, not a filter.
```

### สิ่งที่ห้าม (ใส่เป็น negative prompt ถ้าเครื่องมือรองรับ)

```
different person, altered face, changed facial features, slimmer face,
smoothed skin, plastic skin, airbrushed, lighter skin tone, whitened skin,
younger, older, makeup added, changed hairstyle, changed clothing,
cartoon, illustration, 3D render, oversaturated, HDR, heavy filter,
text, watermark, logo change, extra fingers, distorted pin
```

---

## ทางเลือก B — ฉากออฟฟิศ/วิทยาเขตเบลอ (ดูเป็น editorial มากกว่า)

ใช้แทนบรรทัด `Background:` ในชุดข้างบน:

```
- Background: a softly blurred modern university interior — warm daylight,
  pale wood and glass, hints of green plants, creamy bokeh. Nothing in the
  background is legible or distracting.
```

ดูมีชีวิตกว่า แต่คุมให้เหมือนกันทุกรูปยากกว่ามาก (พื้นหลังแต่ละรูปจะออกมาไม่เหมือนกัน)
**แนะนำให้ใช้ชุดหลักสำหรับหน้า `/people`** แล้วเก็บแบบ B ไว้ใช้กับโปสเตอร์หรือบทความ

---

## ขั้นตอน

1. ดาวน์โหลดรูปต้นฉบับขนาดใหญ่ที่สุดที่มี (รูปบนเว็บภาควิชาเล็กแค่ ~440 px —
   ถ้ามีไฟล์ต้นฉบับจากช่างภาพ ใช้ไฟล์นั้นจะได้ผลดีกว่ามาก)
2. ใส่รูป + prompt หลัก · ทำทีละท่านแต่**ไม่แก้ prompt ระหว่างท่าน**
3. **เทียบกับรูปเดิมข้างกันทุกครั้ง** — ถ้าหน้าเพี้ยนแม้แต่นิดเดียว (ตา จมูก รูปหน้า) ให้เจนใหม่
   อย่าเลือกรูปที่ "ดูดีกว่า" แต่ไม่เหมือน
4. ส่งให้อาจารย์เจ้าของรูปดูก่อนขึ้นเว็บ — เป็นหน้าตาของท่าน ท่านควรได้เห็นก่อนสาธารณะ
5. export เป็น JPEG หรือ WebP ขนาด **1200×1500 px** คุณภาพ ~85 (จะได้ไฟล์ราว 200–400 KB)
6. อัปโหลดจากที่นี่ได้เลย ไม่ต้อง deploy:

```bash
python backend/scripts/sitectl.py --dry-run faculty photo intaka-piriyakul portrait-intaka.jpg
python backend/scripts/sitectl.py faculty photo intaka-piriyakul portrait-intaka.jpg
```

รูปเก่าถูกเก็บไว้ใน revision history อัตโนมัติ ย้อนกลับได้ด้วย `sitectl undo list --doc fac-intaka-piriyakul`

---

## slug ของแต่ละท่าน

| อาจารย์ | slug | รูปต้นฉบับ |
|---|---|---|
| รองศาสตราจารย์ ดร.อินทกะ พิริยะกุล | `intaka-piriyakul` | MK01.png |
| รองศาสตราจารย์ ดร.วรินรำไพ รุ่งเรืองจิตต์ | `warinrampai-rungruangjit` | MK02.png |
| ดร.ภูมิภักดิ์ คูสวัสดิ์ | `poompak-kusawat` | MK03.png |
| ผู้ช่วยศาสตราจารย์กนกกาญจน์ บัญชาบุษบง | `kanokkan-bunchabusabong` | MK06.png |
