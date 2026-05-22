# 🚨 Performance Audit Report — SWU MKT
> ตรวจสอบ Feb 20, 2026 · Codebase หลัง refactor

## TL;DR — Top 3 issues ที่กระทบ user หนักที่สุด

| # | ปัญหา | กระทบ | ความรุนแรง |
|---|-------|-------|:----------:|
| 1 | **Base64 images ฝังใน MongoDB** — `conjoint_studies` เฉลี่ย 1.4MB/doc, `cms_posts` 150KB/doc | ทุก list API ดาวน์โหลด blob เป็น MB ต่อ request | 🔴 P0 |
| 2 | **No code splitting** — App.js import 55 หน้า eager → initial bundle ใหญ่มาก โหลดหน้าแรกช้า | First page load (โดยเฉพาะมือถือ/3G) | 🔴 P0 |
| 3 | **No frontend cache** — 0 ใช้ react-query/SWR → ทุก navigation = refetch ทั้งหมด | UX feel slow ขณะเปลี่ยนหน้า | 🟠 P1 |

---

## 🔴 P0 — ต้องแก้ก่อน

### 1. Embedded Base64 Images in MongoDB (กระทบหนักที่สุด)

**หลักฐาน** (จาก `collStats`):
```
collection            docs   size_kb    avg
conjoint_studies       14    20,053    1,432 KB/doc  ⚠️
contents               51     8,292      162 KB/doc
cms_posts              19     2,817      148 KB/doc
brand_studies          11       475       43 KB/doc
```

**ผลกระทบ:**
- `GET /api/conjoint/studies` ดาวน์โหลด **~20MB JSON** ทุกครั้งที่ list (admin/student)
- หน้า showcase, dashboard, list views ทั้งหมดมี first-paint ช้า
- Mongo memory pressure (working set ใหญ่)
- LLM Gemini Image Gen เก็บ base64 ลงตรงๆ → ขยายตัวเรื่อยๆ

**สาเหตุ:** ใน `conjoint_studies.profiles[].image_b64`, `conjoint_studies.reference_images[]`, `cms_posts.cover_image` (เป็น data:image base64), brand logo upload

**วิธีแก้ — เรียงตามผลตอบแทน:**

#### ⭐ A. ใช้ Emergent Object Storage (แนะนำ — เปลี่ยนน้อยสุด)
```
ปัจจุบัน:                 หลังแก้:
{                          {
  image_b64: "iVBORw...    →   image_url: "https://emergent-files.com/..."
  (2MB string in Mongo)       (60-byte URL string)
}
```
- เรียก integration agent ขอ object storage integration
- Migrate ทีละ collection: เขียน script ดึง base64 → upload → save URL → unset field
- เก็บ legacy `image_b64` ไว้ก่อน fallback (อ่านอันใหม่ก่อน)
- **ผลลัพธ์คาดการณ์:** `conjoint_studies` 20MB → ~50KB (-99.7%) · API list ลดเหลือ <100ms

#### B. List endpoint ใช้ projection ตัด field
ถ้ายังไม่พร้อม migrate ภาพ ให้ list endpoint **exclude** base64 fields ออกก่อน:
```python
# ใน routes/conjoint.py list_studies
projection = {
    "_id": 0,
    "profiles.image_b64": 0,
    "reference_images": 0,
    "profile_images": 0,
}
cur = db.conjoint_studies.find(filter, projection)
```
ดู detail endpoint (`/studies/{id}`) ค่อยส่ง full doc → ผู้ใช้กดเข้าไปดูคน 1 caser
- **ผลลัพธ์:** list -90% ทันที โดยไม่ต้อง migrate

#### C. Lazy-load images ใน client
ใน `<img loading="lazy" decoding="async">` (เร็วๆ) และพิจารณา WebP/AVIF ถ้า host เอง

---

### 2. No Code Splitting / Lazy Routes

**หลักฐาน:** `App.js` มี `lazy(` = 0 ครั้ง แต่ `import ... from '@/pages/'` = **55 หน้า** เป็น eager imports ทั้งหมด

**ผลกระทบ:**
- Initial bundle รวมทุกหน้า (ConjointResultsPage 3,388 บรรทัด + ConjointDesignPage 1,583 + AdminSettings 1,879 ฯลฯ)
- หน้าแรกผู้ใช้ guest ก็โหลด admin pages, conjoint pages, kanban — ใช้ไม่ได้ด้วยซ้ำ
- Mobile/3G user รอ download bundle หลายวินาที

**วิธีแก้ — `React.lazy` + `Suspense`:**

```jsx
// App.js — แทน
import HomePage from '@/pages/HomePage';
import ConjointResultsPage from '@/pages/ConjointResultsPage';
// ...

// ด้วย:
const HomePage = lazy(() => import('@/pages/HomePage'));
const ConjointResultsPage = lazy(() => import('@/pages/ConjointResultsPage'));
const ConjointDesignPage = lazy(() => import('@/pages/ConjointDesignPage'));
const AdminSettings = lazy(() => import('@/pages/AdminSettings'));
const KanbanBoard = lazy(() => import('@/pages/KanbanBoard'));
const ContentEditor = lazy(() => import('@/pages/ContentEditor'));
const BrandEquityDashboardPage = lazy(() => import('@/pages/brand-equity/BrandEquityDashboardPage'));
// ... (ทำเฉพาะหน้าที่ ≥ 500 บรรทัด)

// ใน <Routes> wrap ด้วย:
<Suspense fallback={<div className="loading-shim">Loading…</div>}>
  <Routes>...</Routes>
</Suspense>
```

**Priority หน้าที่ควร lazy ก่อน** (เลือกตามขนาด > 500 บรรทัด):
1. `ConjointResultsPage` (3,388) · `AdminSettings` (1,879) · `KanbanBoard` (1,861)
2. `BrandEquityDashboardPage` (1,783) · `ConjointDesignPage` (1,583)
3. `ContentEditor` (1,100) · `CustomerJourneyTool` (1,078) · `AcademicFormatEditor` (1,023)
4. `ConjointAnalysisTool` (948) · `BrandEquityWizardPage` (934)

**ผลลัพธ์คาดการณ์:** Initial bundle ลด 60-70% · First Contentful Paint <1.5s บน 4G

---

## 🟠 P1 — แก้ตามมาทีหลัง

### 3. Frontend Refetching (ไม่มี cache layer)

**หลักฐาน:** `useQuery`, `react-query`, `swr` = 0 ครั้ง · ทุก mount ของ component → axios.get ใหม่หมด

**ผลกระทบ:**
- เปลี่ยนหน้า → กลับมา → load API ซ้ำ
- เปิด 2 tabs → 2× API calls
- Auto-rotate hero slide ใน HomePage มีโอกาส refetch ถ้า useEffect leak

**วิธีแก้:**
```bash
yarn add @tanstack/react-query
```
แล้ว wrap App ใน `<QueryClientProvider>` ตั้ง `staleTime: 60_000` สำหรับ GET ทั้งหมด:
- `/cms/landing` (rarely changes)
- `/cms/announcements/pinned` (60s freshness ok)
- `/showcase/index` (already TTL-cached on server, can cache 5min on client)
- `/conjoint/studies`, `/brand-equity/studies` (สำคัญ — list ใหญ่)

**ผลลัพธ์คาดการณ์:** เปลี่ยนหน้าระหว่าง dashboard ↔ market-research = instant (จาก cache)

### 4. Polling Storms

**หลักฐาน:**
| Component | Interval | API ที่เรียก |
|-----------|---------:|--------------|
| `NotificationCenter.js` | 30s | `/notifications/unread-count` |
| `NotificationBell.jsx` | 30s | (alumni) |
| `BrandEquityDashboardPage` (× 2 polls) | ~3s | AI interpretation + thesis export status |
| `ConjointResultsPage` (× 2 polls) | ~3s | เหมือนกัน |
| `ActivityStream` | configurable | activity feed |

**ผลกระทบ:**
- เปิดหน้าค้างไว้ = ยิง 2-5 API/วินาทีต่อ tab
- Backend log จะเต็มไปด้วย polling traffic
- Browser eats CPU ถ้าหลาย tabs

**วิธีแก้:**
1. **Polling ของ AI/Thesis jobs** — เพิ่ม **exponential backoff** (3s → 5s → 8s → max 15s)
2. **Polling ของ notifications** — เปลี่ยนเป็น **SSE หรือ WebSocket** (1 connection ต่อ tab แทน 2 polls)
3. **Polling ทุกตัว** — เพิ่ม `document.visibilityState === 'hidden'` check → หยุดเมื่อ tab ไม่ active
   ```jsx
   useEffect(() => {
     const onVisChange = () => {
       if (document.hidden) clearInterval(pollRef.current);
       else startPolling();
     };
     document.addEventListener('visibilitychange', onVisChange);
     return () => document.removeEventListener('visibilitychange', onVisChange);
   }, []);
   ```

### 5. Alumni `find()` Without Pagination/Projection

**หลักฐาน:** `routes/alumni.py` มี 12+ ครั้งของ `db.X.find(...)` ที่ไม่มี `.limit()` หรือ projection — ตอนนี้ collection ยังเล็ก แต่ถ้าโตจะ scan ทั้งหมด

**ผลกระทบ:** Future risk เมื่อ alumni โต — ตอนนี้ยังโอเค

**วิธีแก้:** ใส่ `.limit(50)` + `.sort([("created_at", -1)])` + projection `{"_id": 0, "password_hash": 0}` ทุก list query

---

## 🟢 P2 — Polish/Future

### 6. Large Components ที่ควรแยก
| ไฟล์ | บรรทัด | แนะนำ |
|------|--------|-------|
| `ConjointResultsPage.js` | 3,388 | แยกเป็น tabs (MNL/Mixed/NCA/IPMA) แต่ละไฟล์ + lazy load tab |
| `AdminSettings.js` | 1,879 | แยก by feature section (Users/Email/AI Settings/Branding) |
| `KanbanBoard.js` | 1,861 | แยก card/column/modal subcomponents |

### 7. Heavy Libraries Review
- 30+ `@radix-ui/*` packages — ใช้จริงไม่กี่ตัว ตรวจดูตัดออกได้ (เช่น context-menu, menubar, hover-card ถ้าไม่ใช้)
- `framer-motion` — มีไหม? ถ้าใช้แค่ basic animations ใช้ CSS transitions ก็พอ

### 8. MongoDB Indexes ที่อาจขาด
- `conjoint_studies` มี 5 index — ok
- `contents` มี 9 index — เยอะไป (index overhead เขียนช้า) — review ดูใช้ตัวไหนจริง
- `analysis_cache` มี 3 index — ดี
- `brand_responses` มี 1 index เท่านั้น → เพิ่ม `[("study_id", 1), ("created_at", -1)]`

### 9. Backend Logs ไม่มี Slow Query Logging
แนะนำเพิ่ม middleware:
```python
@app.middleware("http")
async def log_slow_requests(request, call_next):
    start = time.time()
    response = await call_next(request)
    elapsed = time.time() - start
    if elapsed > 1.0:
        logging.warning(f"SLOW {elapsed:.2f}s {request.method} {request.url.path}")
    return response
```

---

## 📋 Recommended Action Plan (เรียงตามผลตอบแทน)

| Phase | Task | Effort | Impact |
|------:|------|:------:|:------:|
| **1** | List endpoints exclude base64 fields (projection) | 30 นาที | 🔴🔴🔴 |
| **2** | React.lazy 10 หน้าใหญ่สุด + Suspense | 1 ชั่วโมง | 🔴🔴 |
| **3** | Polling: เพิ่ม visibilitychange pause + backoff | 1 ชั่วโมง | 🟠🟠 |
| **4** | Migrate base64 → Object Storage | 2-3 ชั่วโมง | 🔴🔴🔴 (ระยะยาว) |
| **5** | Add React Query สำหรับ GET endpoints | 2 ชั่วโมง | 🟠 |
| **6** | Slow query logging middleware | 15 นาที | 🟢 (observability) |
| **7** | Split large pages (ConjointResultsPage etc) | 4-6 ชั่วโมง | 🟢 |

---

## 🎯 Quick Win แรกที่ผมแนะนำ

ทำ **Phase 1 + 2** ก่อนเลย — ใช้เวลารวม ~1.5 ชม. แต่ user จะรู้สึก **เร็วขึ้น 3-5 เท่า** ทันที (ทั้ง initial load + เปลี่ยนหน้า):

1. แก้ projection ใน `routes/conjoint.py` + `cms.py` list endpoints
2. lazy-load 10 หน้าใหญ่สุด

อยากเริ่มจากตรงไหนครับ?
