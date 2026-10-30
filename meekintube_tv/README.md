# meekinTube TV — แอปทีวี Samsung + Xiaomi

หน้าตาแบบ 10-foot (คุมด้วยรีโมต) สำหรับ meekinTube ส่วนเดียวกับเว็บ `/api/meekintube`
ใช้คลัง ประวัติ ดูภายหลัง และการติดตาม (localStorage key ชุดเดียวกัน)

```
backend/meekintube_static/tv/      ← โค้ด UI ชุดเดียว ใช้ทั้งสองยี่ห้อ
  index.html  tv.css  tv.js        ← หน้าจอทีวี (1920x1080 แล้วย่อ/ขยายตามจอ)
  player.html                      ← ตัวเล่น YouTube ต้องอยู่บน https://swumkt.org เสมอ
meekintube_tv/
  tizen/    ← Samsung (.wgt)  config.xml, icon.png, build.ps1
  android/  ← Xiaomi / Android TV (.apk)  Gradle project, build.ps1
```

## ทำไมตัวเล่นต้องอยู่บน swumkt.org

YouTube ไม่ยอมเล่นคลิปถ้าหน้าที่ฝังไม่ส่ง Referer มา (error 153)
แอปที่โหลดจากไฟล์ในเครื่อง (`file://` แบบแอป Samsung) ไม่มี Referer ให้
จึงให้ตัวเล่นอยู่ใน `https://swumkt.org/api/meekintube/tv/player.html` เสมอ แล้ว UI สั่งงานผ่าน postMessage

- **Samsung**: UI อยู่ในแพ็กเกจ .wgt (ปุ่มรีโมตและ Tizen API ใช้ได้) ส่วนตัวเล่นโหลดจาก swumkt.org
- **Xiaomi**: แอปเปิด WebView ไปที่ `https://swumkt.org/api/meekintube/tv/?shell=android` ทั้งหน้า
  แก้ UI ที่เว็บแล้วทีวีได้ของใหม่เลย ไม่ต้องลง APK ใหม่

**ต้อง deploy `backend/meekintube_static/tv/` ขึ้น prod ก่อน** แอปทั้งสองตัวถึงจะเล่นวิดีโอได้

## ปุ่มรีโมต

| ปุ่ม | หน้าหลัก | ระหว่างดู |
|---|---|---|
| ลูกศร | เลื่อน (แถวจำตำแหน่งไว้) | ซ้าย/ขวา = ถอย/เดินหน้า 10 วิ (กดรัวยิ่งข้ามไกล) · ลง = รายการถัดไป |
| OK | เลือก · **กดค้าง = เมนู** (ดูภายหลัง, ไปที่ช่อง, ติดตาม) | แสดงแถบควบคุม |
| BACK | ย้อนกลับ → เมนูซ้าย → ถามก่อนออก | ซ่อนแถบควบคุม → ปิดตัวเล่น |
| เล่น/หยุด, ⏩ ⏪, ⏭ ⏮, CH+/- | — | ใช้ได้ตรง ๆ |

Shorts: ขึ้น/ลง = เปลี่ยนคลิป, OK = หยุด/เล่น

## ลองบนคอมก่อน (ไม่ต้องมีทีวี)

```bash
python -m http.server 8791 --directory backend/meekintube_static
```

เปิด `http://localhost:8791/tv/` ใน Chrome ที่ 1920x1080 ใช้ลูกศร / Enter / Esc แทนรีโมต
(เล่นวิดีโอจาก localhost ได้ในเบราว์เซอร์ PC แต่บนทีวีต้องใช้ตัวเล่นจาก swumkt.org)

## Samsung (Tizen) — สร้าง .wgt และลงทีวี

รองรับทีวีปี 2018 ขึ้นไป (Tizen 4.0 / Chromium 56+) แอปส่วนตัวลงแบบ Developer Mode (ไม่ผ่าน Samsung store)

**ของที่ต้องมี (ทำครั้งเดียว)**

1. Tizen Studio 6.1 สำหรับ Windows จาก `https://download.tizen.org/sdk/Installer/tizen-studio_6.1/`
   ติดตั้งที่ `C:\tizen-studio` แล้วใน Package Manager > Extension SDK ลง **TV Extensions Tools** และ **Samsung Certificate Extension** (เวอร์ชัน 2.0.73 ขึ้นไป)
2. เปิด Developer Mode บนทีวี: Apps > App Settings > กด `12345` > Developer mode = On > ใส่ IP ของคอม > รีบูตทีวี
3. ดู DUID ของทีวี: Menu > Support > Contact Samsung > Unique Device ID
4. Tools > Certificate Manager > `+` > **Samsung** > **TV** > ล็อกอิน Samsung account > distributor แบบ Public ใส่ DUID ของทีวี
   ตั้งชื่อ profile เช่น `MeekinTV` (เก็บ `author.p12` ไว้ดี ๆ อัปเดตแอปครั้งหน้าต้องใช้ใบเดิม)

**Build + ลงทีวี**

```powershell
cd meekintube_tv\tizen
C:\tizen-studio\tools\sdb.exe connect <ip-ทีวี>
C:\tizen-studio\tools\sdb.exe devices          # ดูชื่อ device
.\build.ps1 -Profile MeekinTV -Target <ชื่อ-device>
```

ครั้งแรกต้องกด Device Manager > คลิกขวาที่ทีวี > **Permit to install applications** ก่อน
`build.ps1` เฉย ๆ (ไม่มี -Profile) จะแค่รวมไฟล์ไว้ที่ `tizen\build\` ไม่ build

**Emulator ของ Samsung** — ไม่มีตัวที่รันใน Docker ได้จริง (ตรวจแล้วทั้งของ Samsung และ community ทุกตัวเป็นแค่ CLI หรือเก่า/พัง)
ตัวที่ใช้ได้คือ **Samsung TV Emulator 10.0 (official)** รันใน WSL2 Ubuntu แสดงผลผ่าน WSLg
เครื่องนี้มี nested virtualization (`/dev/kvm`) ใน WSL อยู่แล้ว ไม่ต้องเปิด WHPX
แต่ emulator ตั้งแต่ 7.0.1 รับเฉพาะ .wgt ที่เซ็นด้วย Samsung certificate (ข้อ 4) และต้องเพิ่ม DUID ของ emulator ในใบเซ็นด้วย
ตัวเบากว่าคือ **TV Web Simulator** ที่มากับ TV Extensions (ไม่ใช้ VM) ใช้เช็กหน้าจอและปุ่มรีโมตได้ แต่เล่นวิดีโอเชื่อถือไม่ได้

## Xiaomi / Android TV — สร้าง .apk และลงทีวี

ทีวีและกล่อง Xiaomi รุ่นที่ขายในไทยเป็น Android TV / Google TV (Android 8.0 ขึ้นไป) แอปเป็น WebView เต็มจอเปิดหน้า TV บน swumkt.org

**Build (ไม่ต้องมี Android Studio ใช้ Docker)**

```powershell
cd meekintube_tv\android
.\build.ps1                    # ได้ meekinTubeTV-debug.apk (ครั้งแรก pull image cimg/android:2026.10 ~3 GB)
.\build.ps1 -Install <ip-ทีวี>  # build แล้วลงทีวีผ่าน adb แล้วเปิดแอปเลย
```

กุญแจเซ็นแอปเก็บที่ `%USERPROFILE%\.android-meekin` ทุก build ใช้กุญแจเดิม จึงลงทับของเก่าได้โดยประวัติไม่หาย
(ถ้ากุญแจเปลี่ยน ต้อง uninstall ก่อน แล้วประวัติ ดูภายหลัง และการติดตามในแอปจะหาย)

**ลงทีวีจริง**

1. เปิดโหมดนักพัฒนา: Settings > System > About > กด OK ที่ "Android TV OS build" ~7 ครั้ง
   (รุ่นเก่า: Settings > Device Preferences > About > Build)
2. Developer options > **USB debugging** = เปิด (กล่อง Google TV รุ่นใหม่ใช้ **Wireless debugging** แล้ว pair ด้วยรหัสบนจอ)
3. `.\build.ps1 -Install <ip>` (หรือ `<ip>:<port>` แบบ wireless debugging) ทีวีจะถาม "Allow USB debugging?" ให้กดอนุญาต
4. แอปขึ้นในแถว Apps ของทีวี (ใช้ banner 320x180)

ปุ่มเล่น/หยุดบนรีโมตส่งต่อให้หน้าเว็บ แต่รีโมต Bluetooth ของ Google TV ส่วนใหญ่ไม่มีปุ่มนี้ ใช้ OK แทนได้

**Emulator ของ Android TV** — Docker รัน emulator ทีวีบนเครื่องนี้ไม่ได้ (ไม่มี image สำเร็จรูป และ Docker Desktop บน Windows ไม่ส่ง KVM ให้ container)
ตัวที่ใช้ได้คือ **Android Emulator ของ Google + image `system-images;android-34;google-tv;x86`** (ตัวหลัก, ~1.5 GB รวม)
ต้องเปิดฟีเจอร์ Windows **Windows Hypervisor Platform** ก่อน (PowerShell แบบ Admin: `Enable-WindowsOptionalFeature -Online -FeatureName HypervisorPlatform -All` แล้วรีบูต)
ปุ่มรีโมตผ่าน adb: `adb -e shell input keyevent 19/20/21/22` (ขึ้น/ลง/ซ้าย/ขวา), `23` (OK), `4` (Back), `85` (เล่น/หยุด)
ดีบักหน้าเว็บในแอป: build debug เปิด `chrome://inspect/#devices` บน Chrome ของคอมได้เลย

## ข้อควรรู้

- ผลค้นหาและ "มาแรง" มาจาก Invidious / Piped สาธารณะ (เหมือนเว็บ meekinTube เดิม) ถ้าล่มทั้งหมดจะขึ้น "โหลดไม่สำเร็จ · กด OK เพื่อลองใหม่"
- ระหว่างเล่นจะไม่มีอะไรทับวิดีโอ (ข้อกำหนด YouTube) ตอนแถบควบคุมขึ้น วิดีโอจะย่อขึ้นด้านบนแทน
- ออกจากแอปหรือกด HOME แล้ววิดีโอจะหยุด (YouTube ห้ามเล่นเบื้องหลัง)
- หน้าตาเอาแบบแผนผัง YouTube บนทีวี แต่ใช้โลโก้ สี และไอคอนของ meekinTube เอง ไม่ใช้โลโก้ YouTube
