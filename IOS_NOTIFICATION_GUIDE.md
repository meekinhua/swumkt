# 📱 คู่มือการใช้งานการแจ้งเตือนบน iOS

## ข้อกำหนด
- **iOS 16.4 ขึ้นไป** (ตรวจสอบได้ที่ Settings → General → About → Software Version)
- Safari browser
- ต้องติดตั้งเป็น PWA (Progressive Web App)

## ⚠️ ข้อจำกัดบน iOS

**iOS Safari ไม่รองรับ Web Push Notification ในโหมดเบราว์เซอร์ปกติ**

คุณต้อง:
1. ติดตั้งแอปบน Home Screen (Add to Home Screen)
2. เปิดแอปจาก Home Screen (ไม่ใช่จาก Safari)
3. จากนั้นถึงจะสามารถเปิดการแจ้งเตือนได้

---

## 📲 วิธีติดตั้งแอป (Add to Home Screen)

### ขั้นตอนที่ 1: เปิดเว็บใน Safari
1. เปิด Safari บน iPhone/iPad
2. ไปที่ URL: `https://choice-conjoint.preview.emergentagent.com`
3. Login เข้าระบบ

### ขั้นตอนที่ 2: กดปุ่ม Share
1. กดที่ไอคอน **Share** (รูปสี่เหลี่ยมพร้อมลูกศร) ด้านล่างหน้าจอ
2. หรือกดที่แถบ Address Bar แล้วกด Share

### ขั้นตอนที่ 3: เลือก "Add to Home Screen"
1. เลื่อนเมนูลงมาจนเจอ **"Add to Home Screen"** (เพิ่มที่หน้าจอหลัก)
2. กดเลือกตัวเลือกนั้น

### ขั้นตอนที่ 4: ยืนยันการติดตั้ง
1. แก้ไขชื่อแอปได้ตามต้องการ (ค่าเริ่มต้น: "SWUMKT Portal")
2. กดปุ่ม **"Add"** (เพิ่ม) มุมบนขวา

### ขั้นตอนที่ 5: เปิดแอปจาก Home Screen
1. กลับไปที่หน้าจอหลัก
2. ค้นหาไอคอนแอป "SWUMKT Portal"
3. **กดเปิดจากไอคอนนี้** (สำคัญ! ไม่ใช่เปิดจาก Safari)

---

## 🔔 วิธีเปิดการแจ้งเตือน

### หลังจากติดตั้งแอปแล้ว:

1. **เปิดแอปจาก Home Screen** (ไม่ใช่ Safari)
2. ไปที่ **Profile** → **Notification Settings**
3. กดปุ่ม **"เปิดการแจ้งเตือน"**
4. iOS จะขอ permission → กด **"Allow"**
5. เสร็จสิ้น! ✅

---

## ✅ การตรวจสอบว่าติดตั้งถูกต้อง

เปิดแอปแล้วตรวจสอบว่า:
- ✅ ไม่มี address bar ด้านล่าง
- ✅ แอปเต็มหน้าจอ (full screen)
- ✅ หน้า Notification Settings ไม่แสดงข้อความเตือน "สำหรับผู้ใช้ iPhone/iPad"

ถ้ายังเห็นข้อความเตือนสีฟ้า = คุณยังไม่ได้ติดตั้งเป็น PWA

---

## 🐛 แก้ปัญหาทั่วไป

### ปัญหา: ไม่เห็นปุ่ม "Add to Home Screen"
**วิธีแก้:**
- ตรวจสอบว่าใช้ Safari (ไม่ใช่ Chrome หรือ Firefox)
- อัปเดต iOS เป็น 16.4 ขึ้นไป
- ลอง force quit Safari แล้วเปิดใหม่

### ปัญหา: กดเปิดการแจ้งเตือนแล้วไม่มี permission prompt
**วิธีแก้:**
- ตรวจสอบว่าเปิดจาก Home Screen (ไม่ใช่ Safari)
- ลองลบแอปออก แล้วติดตั้งใหม่
- ตรวจสอบ iOS Settings → Safari → Privacy → Allow Notifications

### ปัญหา: ติดตั้งแล้วแต่ยังแสดงข้อความเตือน iOS
**วิธีแก้:**
- **ปิด Safari ให้หมด** (swipe up แล้ว swipe ออก)
- เปิดแอปจาก **Home Screen** (ไอคอนแอป ไม่ใช่ Safari)
- ถ้ายังไม่หาย ลองรีสตาร์ท iPhone

### ปัญหา: ไม่ได้รับการแจ้งเตือน
**วิธีแก้:**
- ตรวจสอบ iOS Settings → Notifications → SWUMKT Portal → Allow Notifications = ON
- ตรวจสอบ Focus Mode ไม่ได้เปิดอยู่
- ทดสอบส่งการแจ้งเตือนในหน้า Notification Settings

---

## 📱 ข้อมูลเพิ่มเติม

### ทำไมต้องติดตั้งเป็น PWA?
Apple จำกัดการใช้งาน Web Push Notification บน iOS เพื่อ:
- ประหยัดแบตเตอรี่
- ป้องกัน spam notifications
- ให้ผู้ใช้ควบคุมได้มากขึ้น

### ข้อดีของ PWA:
- ✅ ทำงานเหมือนแอปจริง
- ✅ เปิดเร็วกว่า
- ✅ ทำงาน offline ได้
- ✅ รับการแจ้งเตือน
- ✅ ไม่ต้อง download จาก App Store

---

## 🆘 ติดปัญหา?

ติดต่อ Admin ที่:
- Email: intaka@hotmail.com, intaka@gmail.com
- หรือแจ้งผ่านระบบ

---

**อัปเดตล่าสุด:** พฤศจิกายน 2024
**เวอร์ชั่น:** 1.0
