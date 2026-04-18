# สายตระกูล · MKT SWU Alumni — Product Spec v1.0

**Project:** ระบบ Alumni การตลาด มศว
**Tagline:** "สายตระกูลของเรา ยาวกว่าที่คุณคิด"
**Document owner:** Product / Design
**Status:** Draft — สำหรับทีมพัฒนาต่อ
**Last updated:** 2026-04-18

---

## 1. Vision & Goals

### 1.1 Vision
สร้างเครือข่ายศิษย์เก่า-นิสิตปัจจุบัน คณะการตลาด มศว ที่ **active, สนุก และ ให้ value จริง** จนคนอยากกลับมาใช้เป็นประจำ — โดยใช้ระบบ **"สายรหัส" (พี่ take → ปู่ → ทวด → เทียด)** เป็น core metaphor

### 1.2 Strategic goals
| # | Goal | Metric (12 เดือน) |
|---|---|---|
| G1 | ดึง alumni กลับมาลงทะเบียน | 2,000+ ลงทะเบียน (จาก ~4,200 คน) |
| G2 | สร้าง viral loop ผ่าน chain invite | K-factor ≥ 1.3 (invite → new reg) |
| G3 | ให้ value ที่จับต้องได้ | งาน refer ≥ 200 ตำแหน่ง/ปี |
| G4 | Active retention | WAU/MAU ≥ 45% |
| G5 | เป็นที่สนใจของคนนอก (employer) | บริษัท partner ≥ 50 |

### 1.3 Non-goals (v1)
- ไม่ทำ learning platform / course
- ไม่ทำ chat แบบ DM ที่ซับซ้อน (v1 ใช้ message แบบ guided)
- ไม่ทำ payment / donations

---

## 2. Personas

| Persona | Need | Jobs-to-be-done |
|---|---|---|
| **นิสิตปัจจุบัน ภูมิ (ปี 4)** | หาที่ฝึกงาน/งานแรก · ปรึกษาพี่ | "หาคน refer งาน สาย growth" |
| **ศิษย์เก่ารุ่นกลาง ฟ้า (7 ปี)** | Network · หา junior hire · keep in touch | "หาน้องในสายมาช่วยทีม" |
| **ศิษย์เก่ารุ่นใหญ่ กันต์ (13 ปี)** | Give back · pipeline hiring · reputation | "เจอทวดของทวดที่เคยทำงานด้วย" |
| **คณะ/มหาวิทยาลัย** | ติดตาม alumni · จัด reunion · ชื่อเสียง | "มีฐานข้อมูลที่ active จริง" |

---

## 3. Core Concept: สายตระกูล (Bloodline System)

### 3.1 Relationship model
```
เทียดทวด (รุ่น 47)
   ↓ take
เทียด (รุ่น 51)
   ↓ take
ทวด (รุ่น 55)
   ↓ take
ปู่ (รุ่น 58)
   ↓ take
พี่ take (รุ่น 61)
   ↓ take
คุณ (รุ่น 64) ← anchor
   ↓ take
น้อง take (รุ่น 66)
   ↓ take
เหลน (รุ่น 67)
```

### 3.2 Relation vocabulary (extensible)
- **พี่ take** = รุ่นก่อนหน้า 3 ปี (direct mentor)
- **ปู่** = พี่ของพี่ take
- **ทวด, เทียด, เทียดทวด, ...** = ไต่ขึ้นไปเป็นทอดๆ
- **น้อง take, เหลน, ...** = ไล่ลงมา
- ระบบต้องรองรับความยาวไม่จำกัด (recursive) และ **alias customization** ต่อตระกูล

### 3.3 Marking rules
- ผู้ใช้ทุกคนสามารถ **mark** ความสัมพันธ์ได้ 2 ทิศทาง (ของตัวเองกับอีกคน)
- ต้องมี **มีการ confirm 2 ฝั่ง** (A ตั้ง B เป็นพี่ take → B ต้อง accept)
- ระบบจะ **derive ความสัมพันธ์ถัดไป** อัตโนมัติ (ถ้า B เป็นพี่ take ของคุณ + C เป็นพี่ take ของ B → C เป็นปู่ของคุณ)
- Conflict resolution: คนหนึ่งอาจมีหลายพี่ take ได้ (multi-parent), แต่จะ highlight "primary" ที่ mutual ยืนยันล่าสุด

---

## 4. Feature Specification

### 4.1 Landing (public)
**Goal:** ดึง alumni ที่ยังไม่ลงทะเบียน

**Elements:**
- Hero: สายตระกูลของเรายาวกว่าที่คุณคิด + animated gen counter
- Live stats: alumni/current/companies/connections/jobs-referred
- How it works 4 steps
- Testimonial quotes จาก alumni
- CTA: "เริ่มใน 60 วินาที" + "ดูสายของฉัน"

**Acceptance:**
- Load < 2s
- Hero CTA click-through ≥ 8%
- Works responsive 360px → 1440px

### 4.2 Onboarding flow (4 steps)
1. **ยืนยันตัวตน** — รหัสนิสิต + อีเมล (@g.swu หรืออีเมลศิษย์เก่า) · fallback: บัตร ปชช. + ชื่อพี่ take
2. **ระบุพี่ take** — search / suggested list · preview bloodline อัตโนมัติ
3. **ชวนเป็นทอดๆ** — ส่งคำเชิญ ≥ 3 คน เพื่อปลดล็อค Badge "ผู้ก่อร่าง" · invite via ชื่อ/รหัส/อีเมล, QR, link
4. **เสร็จ** — preview สายตระกูล + CTA ไป Tree / Discover

**Drop-off mitigation:**
- Skip button ทุก step (ยกเว้น 01)
- Progress bar ชัดเจน
- Suggested invites จาก group membership (LINE, alumni list)

### 4.3 Family Tree
**Views:**
- **Ancestors (default)** — สายขึ้น ใน 1 column
- **Descendants** — สายลง
- **All (combined)** — tree view แบบ vertical

**Interactions:**
- Click node → open detail panel (position, company, helpful tags, reviews)
- **Mark pending** — สำหรับคนที่ระบบยังไม่ confirm ว่าเป็นใคร ผู้ใช้เลือก "พี่/ปู่/ทวด/ไม่เกี่ยว"
- **Unknown ancestor hint** — dashed box ชวนไล่ต่อไปรุ่นเก่าขึ้น
- Share tree (generate OG image + unique URL)

**Data:**
- Node fields: name, nickname, studentId, gen, relation, company, position, years, verified, online, tags[], helpful[]

### 4.4 Discover — "ทวดของทวด"
**Signature feature:** Mystery Match

- **Mystery Match** — สุ่ม 1 คนจากสาย 3-6 ทอด ที่ผู้ใช้ยังไม่เคยติดต่อ
  - Reveal animation (blur → clear)
  - แสดง bloodline path เต็ม
  - CTA: "ทักทายผ่านพี่กลาง" (ส่งผ่านคนกลาง ไม่ cold)

- **Filters:** industry, role, rising, founder, open-to-mentor, ทำงานต่างประเทศ

- **Card fields:** heat score (engagement), degree of separation, chain steps, "why interesting" reason, tags

### 4.5 Feed
**Post types:**
- `post` — text + image
- `throwback` — photo + year tag (prompts ทุกสัปดาห์: "รูปรุ่นเรา 20xx")
- `review` — star rating + พี่ที่ถูกรีวิว
- `job` — embedded job card
- `announcement` — จากคณะ (org badge)
- `search` — ตามหาพี่/น้อง

**Ranking:** สายตระกูลมาก่อน → เครือข่าย 2-3 ทอด → ทั้งคณะ

**Sidebar:** Badge progress, event reminders, searching people, reviews preview

### 4.6 Jobs & Business
**Tabs:**
- **งาน** — wanted with referrer avatar (พี่ในสาย, ระยะทอด), refer directly to hiring team
- **ธุรกิจศิษย์เก่า** — directory + perks for alumni
- **Mentor** — mentor-mentee matching, 1 mentee/ไตรมาส default
- **สิทธิพิเศษ** — discount codes, partnership

**Job refer flow:**
1. นิสิตกด "สมัครผ่าน refer"
2. ระบบส่ง CV + message ไปถึง referrer (พี่ในสาย)
3. Referrer check + forward ให้ hiring team
4. สถานะแสดงในโปรไฟล์ทั้ง 2 ฝั่ง

### 4.7 Profile & Gamification
**Header:** avatar, studentId, position, รุ่น, bio
**Stats:** tree size, invites, XP, streak
**Badges (examples):**
- 🌳 ผู้ก่อร่าง — ชวน 5 คน
- 👑 นายก๊ก — ชวน 10 คน
- 🔗 5 ทอดคลับ — สายยาว 5 ชั้น
- ⭐ นักรีวิว — รีวิว 3 คน
- 💼 Career Helper — refer งานสำเร็จ 1 ครั้ง
- 🎓 Mentor ตัวจริง — รับ mentee 1 คน

**Streak:** active (login + action) ต่อเนื่อง กี่วัน

**Quests:** rotating weekly (refer 1 · review 2 · attend event · ชวน 3 คน)

### 4.8 Reviews (พี่ take / ปู่ / ทวด)
- Rating 1-5 ดาว + category (พี่ take · ปู่ · ทวด · mentor)
- Review text, helpful tags (e.g., "refer งาน", "portfolio review")
- Helpful votes
- Required: รีวิวเป็น public หรือ anonymous-to-subject (flag)
- **Abuse prevention:** ต้องมี mutual connection ≥ 2 คนถึงรีวิวได้ · edit ได้ 7 วัน · report + moderation

---

## 5. Gamification system

### 5.1 XP economy
| Action | XP |
|---|---|
| Login daily | +5 |
| ชวนคนสำเร็จ (reg) | +100 |
| Mark relation confirmed | +30 |
| โพสต์ feed | +10 |
| รีวิวพี่ | +50 |
| Refer งาน (successful hire) | +500 |
| Accept mentee | +200 |

### 5.2 Levels
- Lv.1-3 ภายใน 1 สัปดาห์ (easy)
- Lv.4-8 ใช้งานสม่ำเสมอ 1-3 เดือน
- Lv.9-15 active user / super connector
- Lv.15+ hall of fame

### 5.3 Streaks
- 3/7/14/30/90/365 day milestones → bonus XP + badge

---

## 6. Tech architecture

### 6.1 Stack recommendation
- **Frontend:** Next.js 14 (App Router) + React + Tailwind + shadcn/ui
- **Backend:** Node.js + NestJS (หรือ Next API routes) + TypeScript
- **DB:** PostgreSQL + Prisma · Redis (cache + rate limit)
- **Graph:** relations stored as adjacency list + materialized paths for tree queries · optional Neo4j ถ้า scale
- **Auth:** SSO กับ Bunditpat / SWU SSO สำหรับนิสิต · OTP email สำหรับ alumni
- **Search:** Meilisearch / Typesense
- **File:** S3-compatible (Cloudflare R2)
- **Realtime:** Pusher / Supabase Realtime (online status, notifications)
- **Analytics:** PostHog
- **Deployment:** Vercel + Railway / AWS

### 6.2 Data model (core tables)

```sql
users (
  id uuid pk,
  student_id varchar unique,
  email varchar unique,
  name, nickname,
  gen int,                -- รหัสรุ่น (61, 64, etc.)
  role enum('current','alumni','staff'),
  position, company,
  bio, avatar_hue int,
  verified bool,
  xp int, streak_days int, last_active_at,
  privacy_settings jsonb,
  created_at, updated_at
)

relations (
  id uuid pk,
  from_user_id → users,
  to_user_id → users,
  kind enum('take','mentor','custom'),
  status enum('pending','confirmed','rejected'),
  confirmed_by_from bool,
  confirmed_by_to bool,
  derived bool,            -- true if auto-derived from chain
  primary bool,
  created_by → users,      -- who marked this
  created_at, confirmed_at,
  UNIQUE(from_user_id, to_user_id, kind)
)

invites (
  id, inviter_id → users,
  invitee_email | invitee_studentId,
  code varchar,            -- short link slug
  status enum('sent','opened','registered','expired'),
  relation_hint,           -- "น่าจะเป็นน้อง take"
  sent_at, accepted_at
)

reviews (
  id, reviewer_id, subject_id,
  rating 1-5,
  category,
  text, helpful_tags[],
  anonymous bool,
  helpful_count,
  status enum('active','hidden','removed'),
  created_at
)

posts (
  id, author_id,
  type enum('text','throwback','review','job','announce','search'),
  content, images[],
  metadata jsonb,         -- job/review embedded data
  visibility enum('family','network','all'),
  reactions jsonb,
  created_at
)

jobs (
  id, title, company, type, salary_range,
  location, tags[],
  referrer_id → users,    -- พี่ที่ refer
  posted_by → users,
  applicants_count,
  status, expires_at
)

businesses (
  id, owner_id, name, category,
  description, perk, location,
  logo_url, verified
)

badges_earned (
  user_id, badge_key, earned_at
)

events (
  id, title, date, location, type,
  organizer_id, rsvp_count
)

activities (
  id, user_id, kind, metadata, created_at
)
```

### 6.3 Key algorithms

**Derive relations from chain:**
```
when A marks B as "พี่ take" and B confirms:
  for each ancestor X of B:
    create derived relation (A → X, kind=chain, rank=X.rank+1)
  for each descendant Y of A:
    create derived relation (Y → B, ...)
```

**Mystery Match selection:**
```
candidates = users where
  - in network 3-6 degrees from me
  - active in last 30 days
  - not messaged by me before
  - privacy.allow_mystery = true
  - open_to_mentor or rising_score > threshold
weight by: degree (closer = higher), heat, industry match
random pick 1, then reveal animation
```

**Chain path (A → X):**
- Materialized paths for common ancestors, else BFS depth 8 max
- Cache result 24h

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Performance** | TTI ≤ 2s on 4G · tree render 100+ nodes ≤ 500ms |
| **Scalability** | 10,000 DAU, 50,000 users target v1 |
| **Privacy** | GDPR-style: export, delete · opt-out of mystery, company visibility · hide studentId publicly |
| **Accessibility** | WCAG 2.1 AA · keyboard nav · min hit target 44px · color contrast AA |
| **i18n** | Thai primary · English labels secondary |
| **Security** | Rate limit invites (5/hour) · email verify · abuse report · admin moderation queue |
| **Offline** | Read-cached feed when offline · queue actions |

---

## 8. Privacy & Trust

### 8.1 Privacy controls (per-user)
- แสดงใน feed เครือข่าย (on/off)
- ให้รุ่นน้องเห็นบริษัท (on/off)
- รับ mystery match (on/off)
- รับคำขอทักทาย (on/off · from family only · from network)
- แสดงรหัสนิสิต (masked default: 64131xxxxx)

### 8.2 Moderation
- Report: post / user / review
- Auto-hide if reported 3+ times (pending review)
- Admin dashboard for คณะ
- Anti-impersonation: verified badge after email + nominator confirm

---

## 9. Analytics & Success metrics

**Acquisition:**
- Registrations / week
- Source: invite · direct · social
- Onboarding completion rate per step

**Activation:**
- % new users who complete tree setup
- % who invite ≥ 3 within 7 days
- First meaningful action (message, review, apply)

**Retention:**
- D1, D7, D30
- WAU/MAU
- Streak distribution

**Referral (K-factor):**
- Invites sent per user
- Invite → registration conversion
- Depth of chain growth

**Value delivered:**
- Jobs refered → interviews → hires
- Mentor sessions booked
- Reviews written
- Mystery matches → real conversations

---

## 10. Roadmap

### v1.0 MVP (3-4 months)
- Auth + onboarding + tree + invite chain
- Feed (basic) + reviews
- Jobs (manual posting)
- Basic badges + XP
- Web responsive

### v1.1 (5-6 months)
- Mystery Match
- Mentor matching + booking
- Business directory + deals
- Email digest
- Push notifications

### v1.2 (7-9 months)
- Mobile app (React Native)
- AMA / live events
- Alumni map (geographic)
- Throwback prompts auto
- Admin dashboard

### v2.0 (future)
- AI-generated weekly connection suggestions
- Company pages (employer side)
- Paid tier for recruiters (revenue model)
- ขยายไปคณะอื่นของ มศว (template)

---

## 11. Open questions / decisions needed

1. **Identity authority:** ใช้ SWU SSO ได้หรือไม่? fallback ยังไง?
2. **Naming:** "สายตระกูล" vs "สายรหัส" vs อื่น? (ปัจจุบันใช้สายตระกูล — poetic กว่า)
3. **Scope of relations:** ครอบคลุมแค่ MKT หรือทั้งคณะบริหาร? (impact data & partnership)
4. **Revenue model:** ฟรีสำหรับนิสิต/alumni · charge employer สำหรับ posting premium?
5. **คนที่เสียชีวิต:** ใส่เป็น memorial node?
6. **Cross-gen namings:** บางตระกูลเรียก "ย่า / ยาย" ไม่ใช่ "ปู่" — ให้ custom ได้ไหม?
7. **Integration:** LINE OA notification? Google Calendar sync events?
8. **Content policy:** รีวิวเชิงลบ — ซ่อนอัตโนมัติหรือ moderate?

---

## 12. Design system handoff

**Typography:**
- Display/Body: IBM Plex Sans Thai (300-700)
- Mono: IBM Plex Mono (สำหรับรหัส, ตัวเลข)

**Colors:**
- Red: `#C8102E` (primary) · Red-ink `#8A0B20` · Red-soft `#FCE8EB`
- Blue: `#1B75BC` · Blue-ink `#0E4F83` · Blue-soft `#E3F0FA`
- Ink: `#14161A` · Paper: `#F7F4EE`
- Yellow (gamification): `#F6C445`

**Radius scale:** 8 / 14 / 22 / 32
**Shadow:** sm / md / lg (defined in prototype)

ดูเพิ่มเติมที่ `app/styles.css`

---

*เอกสารนี้ใช้คู่กับ prototype HTML — mock ทุกหน้าคลิกได้จริง เพื่อให้ทีม dev เห็นภาพปลายทางชัด*
