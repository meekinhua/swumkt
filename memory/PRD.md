# PRD - SWU Marketing Research & Alumni Platform

## Original Problem Statement
A comprehensive marketing research and academic tool for Srinakharinwirot University (SWU), now expanding to include an Alumni Network platform ("สายตระกูล MKT SWU").

## Brand Voice (Feb 7, 2026)
**Position**: Consumer Foresight & Insight Lab — "เห็นในสิ่งที่ตลาดยังไม่เห็น · อ่านใจผู้บริโภคก่อนใคร · นำตลาด"
- **Avoid**: คำว่า "เปิดเผย / เผยแพร่ / Transparent" (ฟังเหมือน transparency report)
- **Use**: เห็นก่อน · อ่านใจ · นำตลาด · Insight · Foresight · Consumer Intelligence
- **3 rotating headline triplets** on HomePage hero (auto-cycle 5.5s + dot indicators):
  1. Foresight Lab — "เห็นในสิ่งที่ตลาด · ยังมองไม่เห็น"
  2. Insight Studio — "อ่านใจ · ผู้บริโภค · ก่อนใคร"
  3. Marketing Intelligence — "รู้ก่อนตลาด · หนึ่งก้าว"

## User Language: THAI — All communication MUST be in Thai.

---

## System 1: Marketing Research Tool (COMPLETE)

### Brand Equity / Brand Health Check (COMPLETE — Feb 2026, polished Apr 27 2026, correctness audit Jun 2026)
- **Correctness audit applied Jun 14 2026** (`/app/memory/BRAND_EQUITY_AUDIT_2026_08.md`, `/app/memory/THESIS_EXPORT_AUDIT_2026_08.md`, CHANGELOG entry of the same date): Cronbach's α actually computed, dead weights removed (Awareness summed to 1.25), identity ceiling fixed, Awareness no longer waits for AI, reverse coding, public-answer validation, 95% CI, sample adequacy, one canonical verdict scale, thesis prompts no longer claim uncomputed statistics. **Some studies now show a LOWER (correct) score than before.** 103 tests.
- **Frontend follow-ups shipped Jun 14 2026**: respondent survey UX (explained Next, Back on demographics, clearable answers, honest time range), full mobile layout for answer controls, glossary card, new `BeWeightEditor.jsx` dimension-weight editor, corrected methodology appendix + new limitations section, count-vs-percent bar fixes, n on the image radar, honest Brand Association labels, unified tier scale, unmeasured dimensions render "—" not 0.
- **Second follow-up batch Jun 14 2026**: `GET /brand-equity/studies/scores` (list cards show real BES + tier chip, cached per response-count/weights), **wave-over-wave significance testing** (Welch t-test on respondent-level POMP dimension scores, Holm-adjusted, 95% CI + Cohen's d, shown as a table with SIG/ns markers), respondent **progress autosave + resume** via localStorage, Cronbach α now pools legacy question ids (α was unreportable on any study whose instrument had been republished), thesis DOCX verified to match the dashboard, and tier labels classified on the rounded score everywhere.
- Aaker's 4-dimension framework: Awareness · Quality · Identity vs Image · Loyalty
- Auto-generated questions (~18) from template lib + brand/competitor/category context
- 4-step Wizard: Brand basics → Identity traits (3-8) → Segments → Question review
- **Public Showcase Mode** — owner toggles a study to be publicly viewable as content (read-only, no auth) at `/showcase/{token}`. Sanitized payload (no demographics/owner/raw responses), Take-Survey CTA, "Powered by SWU MKT" footer
- **Editable any time** — clickable Stepper, "Update & regenerate" / "Save changes" / "Save & re-publish" actions; Edit buttons on Dashboard hero + List cards
- **Real brand logos** — Logo URL input + image upload in Wizard Step 0, displayed on List cards, Dashboard hero, and Public Respondent (welcome + header). Fallback to initial-letter gradient if no logo
- Public respondent flow (no auth) — Likert 5/7, NPS 0-10, MCQ single/multi, trait grid (3-5), comparative 7-pt, open short/long
- **Bilingual TH/EN toggle** (persisted via localStorage) covering all prompts, scales, demographics, and thank-you messages
- **Visual Identity Questions (VIS-1..VIS-4)** — public survey can show uploaded logo + palette swatches for recall/recognition tests
- **Custom Quality Attributes** — owner adds free-form Thai attributes; Gemini 2.5 Flash auto-translates to natural EN adjectives so prompt_en stays in English
- **SWUMKT Logo in topbar** — List/Wizard/Dashboard share `BeTopbar` with real logo image; public Respondent page has its own `PublicTopbar` so the survey looks anchored to the main system
- Stats engine: T2B, B2B, Net-Q, NPS, mean/median/std, distribution, frequency
- AI background analysis (Gemini 2.5 Flash via emergentintegrations):
  - Theme extraction from open-ended responses
  - Open-text normalization (clusters near-duplicates: Mali/MALI/มะลิ → one bucket)
  - Multimodal Visual Identity extraction from uploaded logo/palette images
  - Brand Association (Aaker 4 perspectives: Organization/Person/Symbol/Product)
  - Identity-Image alignment (aligned · lost · unintended traits, alignment_score_0_100)
  - Master Insights — 5 actionable recommendations with cited question IDs
- Dashboard: Score ring (color-tiered), 4 dimension cards, Word cloud, Multi-dim Radar w/ competitor overlay, NPS bar,
  Histogram with T2B/B2B/Net-Q, Identity-Image map, Interactive 2D Perceptual Map (auto-scale axes), Master AI Insights rail
- Editorial / Swiss design (1px borders, IBM Plex Serif/Mono/Sans, paper #F7F4EE)
- Routes: `/brand-equity` · `/brand-equity/new` · `/brand-equity/studies/:id` · `/brand-equity/respond/:token`
- Backend router: `/app/backend/routes/brand_equity.py` (separate from server.py, ~1300 lines)
- DB collections: `brand_studies` · `brand_responses`
- Tests: iteration_10 (base), iteration_11 (visual ID), iteration_12 (perceptual map), iteration_13 (translation + logo) — all 100% pass
- **Trash Bin** (Feb 2026): soft-delete via `deleted_at`, 30-day recovery window, auto-purge, restore + permanent purge endpoints
- **Aided Recognition fix** (Feb 2026): removed hardcoded "Brand X/Y/Z" decoys — options show only real brands (focal + user-entered competitors)


### Conjoint Analysis (COMPLETE)
- 5 statistical methods: Counting, MNL, Mixed Logit, HB, Linear Regression
- **D-Optimal design via K-exchange / modified Fedorov** (May 25, 2026) — replaces random sampling; ~5.6× larger |X'X| than random; perfect level balance across attributes; verified via API + unit tests
- Cluster-robust OLS standard errors (M2), consistent reference-level encoding across MNL/Mixed/HB/OLS (M1)
- Demographics capture (Wave A/B segment comparison), HB Individual Posteriors panel
- AI interpretation via Gemini 2.5 Flash with caching
- Background task + polling architecture (prevents 502 proxy timeout)
- `_call_gemini_with_retry` for reliable AI calls
- Generate Prompt fallback
- CSV export
- **Thesis Word Export**:
  - Select methods (checkboxes) + chapters (3: Methodology, 4: Results, 5: Discussion)
  - Extra Prompt input for custom AI instructions
  - Native Word Equations (OMML) via `math2docx`
  - SWU iThesis Format: TH SarabunPSK font, academic margins, 1.5 line spacing
  - Background job + polling, retry with backoff
- AI Interpretation: Background task + polling (same as thesis, prevents 502)
- **Trash Bin** (Feb 2026): soft-delete with 30-day recovery, restore + purge endpoints, UI tabs in `ConjointAnalysisTool.js`
- **Stats correctness audit (May 29, 2026)**: all 5 methods verified via synthetic ground-truth tests (`backend/tests/test_conjoint_stats_correctness.py`, 12 PASS). Confirmed low McFadden ρ² on live studies is genuine (random/test responses), not a calculation bug. Added `ANALYSIS_CACHE_VERSION` to `analysis_cache` so new fit-diagnostic fields (LR test, fit_label) self-heal stale caches instead of serving null.
- **Theoretical audit (Jun 2026, applied from `conjoint-audit-2026-08` package)** — see `/app/memory/CONJOINT_AUDIT_2026_08.md` + `/app/HANDOFF_CONJOINT.md`:
  - D-optimal generator rewritten as modified Fedorov on the β=0 MNL information matrix (+45-60% D-efficiency, 5-40× faster); seeded, `EVAL_BUDGET=400_000`
  - BIC (choice-situation basis) is now the model-selection criterion; OLS excluded from ranking; Raftery gap grading
  - HB importance = mean of per-respondent importances (Sawtooth); HB no longer crashes on skipped tasks
  - Mixed/HB keep only coefficients with a significant taste SD as random; coefficient lookup is name-based
  - OLS reference level must exist in data; adjusted McFadden ρ² emitted; task-count/sample-size rules unified (cap 24)
  - Sample adequacy card computed (Johnson & Orme) instead of hardcoded; plain-language summary; intent-based method picker
  - `ANALYSIS_CACHE_VERSION` 2→4, `schema_version` guard added to AI-interpretation and thesis caches (first view per study recomputes — expected)
  - Tests: `backend/tests/test_conjoint_audit_2026_08.py` (31 PASS) + existing conjoint suites (55 PASS)
- **P1 follow-ups (Jun 2026)**:
  - Academic tab: new `Model Specification` card (adjusted ρ², choice situations, K, random/fixed vars, reference & excluded levels with human-readable names); repaired the previously broken/orphaned `สถิติการวิจัย` card JSX; MNL ρ² no longer rendered as a percentage
  - New `GET /api/conjoint/studies/{id}/design-recommendation` → recommended tasks + required respondents; Design page shows ขั้นต่ำ/แนะนำ live (replaces hardcoded "Recommended Sample: 200"); `generate-design` returns `sample_size`
  - Compare tab now works on the PUBLIC results route (token no longer required)

### Customer Value Lab (NEW — May 29, 2026) — COMPLETE
**Reference concept (permanent asset): `/app/memory/CONCEPT_marketing_principles_intaka.md`** — always consult before changing this tool.
Full CBS04 framework, 6-module studio: **Marketing Lens** (3 definitions + self-sell slider), **Need→Want→Demand** (AI demand validation), **Value Audit** (Benefit: Functional/Economic/Psychological[Love&Belonging+Esteem&Status]; Cost: Monetary/Inconvenience/Risk; per-category AI + strategy), **Perception Timeline** (exact A:^4/B:^2.5/C:flat formulas), **5-Step Process** (Research→STP→4Ps→Engagement→Return with AI per step), **Image Simulation** (Nano Banana). Backend `routes/customer_value.py` (/api/cv/*): CRUD+trash, ai-suggest (7 categories), ai-needs, ai-step, ai-analysis, generate-image. Tested 100% (iteration_23: 27/27 backend, all 6 tabs). Added to เครื่องมือ menu.

### Kanban Project Management (COMPLETE)
- Sub-Kanban inside cards, Cover Images, Assignees with auto-avatar
- RBAC: owner, manager, editor, card_owner (student), viewer
- Students can only edit cards they created or are assigned to
- Mobile & Desktop Responsive

### Other Features (COMPLETE)
- Survey Builder, Customer Journey, Customer Perception
- Journal Finder, Academic Format Editor
- Content sharing, Admin dashboard, Notifications

## System 2: Alumni Network — "สายตระกูล MKT SWU" (NEW — NOT STARTED)

### Vision
สร้างเครือข่ายศิษย์เก่า-นิสิตปัจจุบัน คณะการตลาด มศว ที่ active, สนุก และให้ value จริง โดยใช้ระบบ "สายรหัส" (พี่ take → ปู่ → ทวด → เทียด) เป็น core metaphor

### Core Concept: สายตระกูล (Bloodline System)
- Relationship model: เทียดทวด → เทียด → ทวด → ปู่ → พี่ take → คุณ → น้อง take → เหลน
- Marking rules: 2-way confirmation (A marks B → B accepts)
- Auto-derive chain: If B is your พี่ take and C is B's พี่ take → C is your ปู่
- Multi-parent supported (multiple พี่ take possible)

### Phase 1 — MVP (TO DO):
1. **Landing Page** (public) — Hero with animated gen counter, live stats, how-it-works, testimonials, CTAs
2. **Onboarding** (4 steps) — Verify identity → Specify พี่ take → Invite chain → Preview tree
3. **Family Tree** — Ancestors/Descendants view, click node detail, mark relations, unknown ancestor hints
4. **Profile** — Avatar, stats, badges, bio, gamification basics

### Phase 2 (FUTURE):
- Discover (Mystery Match — random person 3-6 hops away)
- Feed (post types: text, throwback, review, job, announcement, search)
- Jobs & Business directory

### Alumni Design System (from spec):
- Colors: Red `#C8102E`, Red-ink `#8A0B20`, Red-soft `#FCE8EB`, Blue `#1B75BC`, Blue-ink `#0E4F83`, Blue-soft `#E3F0FA`, Ink `#14161A`, Paper `#F7F4EE`, Yellow `#F6C445`
- Typography: IBM Plex Sans Thai (300-700), IBM Plex Mono
- Radius: 8 / 14 / 22 / 32px
- Shadow: sm / md / lg defined in spec
- Dark theme support defined in CSS variables

### Alumni Architecture Decision:
- **Backend**: `/app/backend/routes/alumni.py` (SEPARATE from server.py)
- **Frontend**: `/app/frontend/src/pages/alumni/` (SEPARATE folder)
- **DB**: MongoDB (existing), new collections: `alumni_users`, `alumni_relations`, `alumni_posts`, `alumni_jobs`, `alumni_reviews`, `alumni_invites`, `alumni_badges`
- **Auth**: Use existing auth system + alumni-specific fields (gen, studentId, role)
- **Route prefix**: `/api/alumni/...` for backend, `/alumni/...` for frontend routes
- **Register in server.py**: Same pattern as Kanban — `api_router.include_router(alumni_router)` at bottom of server.py

### Alumni DB Schema (from spec):
```
alumni_users: {
  id, user_id (ref to existing users), student_id, name, nickname, gen, 
  role (current/alumni/staff), major, position, company, bio, avatar_hue,
  verified, xp, streak_days, last_active_at, privacy_settings, badges[]
}

alumni_relations: {
  id, from_user_id, to_user_id, kind (take/mentor/custom), 
  status (pending/confirmed/rejected), confirmed_by_from, confirmed_by_to,
  derived (bool), primary (bool), created_by, created_at, confirmed_at
}

alumni_invites: {
  id, inviter_id, invitee_email/invitee_student_id, code, 
  status (sent/opened/registered/expired), relation_hint, sent_at, accepted_at
}

alumni_reviews: {
  id, reviewer_id, subject_id, rating (1-5), category, text, 
  helpful_tags[], anonymous, helpful_count, status, created_at
}

alumni_posts: {
  id, author_id, type (text/throwback/review/job/announce/search),
  content, images[], metadata (jsonb), visibility (family/network/all),
  reactions, created_at
}

alumni_jobs: {
  id, title, company, type, salary_range, location, tags[],
  referrer_id, posted_by, applicants_count, status, expires_at
}
```

### Alumni Spec & Prototype Files:
- Full spec: `/app/memory/alumni-spec/SPEC.md`
- Design CSS: `/app/memory/alumni-spec/app/styles.css`
- Mock data: `/app/memory/alumni-spec/app/data.jsx`
- Landing: `/app/memory/alumni-spec/app/screen-landing.jsx`
- Onboarding: `/app/memory/alumni-spec/app/screen-onboarding.jsx`
- Tree: `/app/memory/alumni-spec/app/screen-tree.jsx`
- Discover: `/app/memory/alumni-spec/app/screen-discover.jsx`
- Feed: `/app/memory/alumni-spec/app/screen-feed.jsx`
- Jobs: `/app/memory/alumni-spec/app/screen-jobs.jsx`
- Profile: `/app/memory/alumni-spec/app/screen-profile.jsx`
- Shared components: `/app/memory/alumni-spec/app/components.jsx`
- Icons: `/app/memory/alumni-spec/app/icons.jsx`

---

## Key API Endpoints (Existing)

### Conjoint
- POST /api/conjoint/studies/{id}/export-thesis — {methods, chapters, extra_prompt}
- GET /api/conjoint/studies/{id}/export-thesis-status/{job_id}
- GET /api/conjoint/studies/{id}/export-thesis-download?cache_key=X
- POST /api/conjoint/studies/{id}/ai-interpretation (background task + polling)
- GET /api/conjoint/studies/{id}/ai-interpretation-status/{job_id}

### Kanban
- PUT /api/projects/{id}/members
- POST /api/projects/{id}/cards/{card_id}/cover
- PUT /api/projects/{id}/cards/{card_id}/subtasks/{subtask_id}/move

---

## Architecture Overview
```
/app/
├── backend/
│   ├── server.py              # Main API (11,700+ lines) — auth, conjoint, surveys, content
│   ├── routes/
│   │   ├── projects.py        # Kanban routes (separate)
│   │   └── alumni.py          # TO CREATE — Alumni routes (separate)
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.js             # Route definitions
│   │   ├── context/AuthContext.js
│   │   ├── components/ui/     # Shadcn UI components
│   │   └── pages/
│   │       ├── alumni/        # TO CREATE — Alumni pages
│   │       ├── ConjointResultsPage.js
│   │       ├── KanbanBoard.js
│   │       └── ... (30+ pages)
│   └── package.json
└── memory/
    ├── PRD.md
    ├── CHANGELOG.md
    ├── ROADMAP.md
    ├── test_credentials.md
    └── alumni-spec/           # Full prototype & spec
```

## Embedded Sub-Apps (Jun 2026)
- **YOLO Detect PWA** — static-only, mounted at `/api/yolo/` (in-browser ONNX/OpenCV). Dir: `backend/yolo_static/`.
- **meekinTube** (YouTube-style PWA) — **static** PWA mounted at `/api/meekintube/` via `StaticFiles(html=True)`. Public, no auth. Dir: `backend/meekintube_static/`. Frontend `/meekintube` redirects to it. Plays via YouTube embed; search/feed via public Invidious/Piped (client-side). No backend/ffmpeg/yt-dlp needed. (Replaced the old Flask downloader on 2026-06-14.)

## 3rd Party Integrations
- Emergent LLM Key → Gemini 2.5 Flash (`gemini-2.5-flash`) via `emergentintegrations` (text/translate/summary)
- Emergent LLM Key → Gemini Nano Banana (`gemini-3.1-flash-image-preview`) via `emergentintegrations` (CMS cover image gen)
- Google Drive: Pending for Kanban attachments

## CMS Module (Feb 7, 2026 — NEW)
Admin-only Content Studio for publishing Articles, Insights, Case Stories powered by AI.
- Backend: `/app/backend/routes/cms.py` (collections: `cms_posts`, `cms_prompt_templates`)
- Frontend: `/app/frontend/src/pages/cms/` — `CmsListPage`, `CmsEditorPage`, `CmsPromptsPage`
- AI: text/summary/translate via Gemini 2.5 Flash; cover images via Nano Banana
- Sources picker: Brand Equity studies + Conjoint studies + cross-ref CMS posts
- Editable prompt templates with `{title}` placeholder; 6 defaults seeded auto
- Soft delete + 30-day trash + restore + purge
- Linked from `AdminSettings` ("Content Studio (CMS)" button)

## Brand Health Filter & Tracking (Feb 2026 — NEW)
- **Filter analysis** by time range + demographic segments (age/gender/region/usage_frequency) on both owner dashboard and public showcase
- **Wave Compare** (owner only): side-by-side Wave A vs Wave B with delta indicators for BES + 4 Aaker dims — foundation for brand tracking health (compare quarters, segments, before/after)
- **AI cache per filter**: unfiltered = `ai_cache.*`, filtered = `ai_cache_by_filter.<sig>` (SHA1 12-char); idempotency separate per signature
- API contracts:
  - `GET /studies/{id}/dashboard?from=&to=&segments=<JSON>` (owner)
  - `GET /showcase/{token}?from=&to=&segments=<JSON>` (public)
  - `POST /studies/{id}/compare` body `{wave_a, wave_b}` → `{wave_a, wave_b, deltas}`
  - `POST /studies/{id}/ai-analyze?from=&to=&segments=` (per-filter AI)
- Frontend component: `BeFilterBar.jsx` (sticky, presets 7D/30D/90D/ALL, segment chips, compare toggle)

## Mobile Responsive (Feb 2026 — VERIFIED)
  - `@media (max-width: 900px)` → 2 cols (tablet)
  - `@media (max-width: 640px)` → 1 col (phone)
- Override scoped via `[data-testid="home-tools-bento"]` and `[data-testid="home-articles-grid"]` in `swumkt-design.css` lines 557-588
- Verified at 390px (single column) and 768px (2 columns)

## Social Media Preview (Feb 2026 — VERIFIED)
Crawlers (FB/LINE/Twitter/WhatsApp/Slack/Discord) don't run JS → React-side OG tags invisible to them. Solution: SSR OG bridge.
- Backend: `/app/backend/routes/share.py` (factory pattern, registered in server.py)
  - `GET /api/share/showcase/{share_token}` → OG-rich HTML + meta-refresh
  - `GET /api/share/learn/{slug}` → OG-rich HTML + meta-refresh
  - `GET /api/share/og-image/learn/{slug}` → proxy for base64 data URI covers
- Frontend share buttons (data-testid):
  - `cms-article-share-top` / `cms-article-share-bottom` (Learn article)
  - `showcase-card-share-{id}` (Showcase index per-card)
  - Showcase Dashboard `Copy showcase URL` now uses bridge URL

## Unified Public Showcase (Feb 2026 — NEW)
- **Route**: `/showcase` (public, no auth) → `UnifiedShowcasePage.jsx`
- **Legacy**: `/showcase/brand-equity` keeps the old BE-only index for backward compat
- **Backend**: `GET /api/showcase/index` merges public BE + Conjoint studies, returns `{featured_topics, brand_equity, conjoint, totals}`
- **UI**: Hero with rotating stats (TOPICS/BE/CJ/RESPONSES), Featured multi-method topics, Tab filter (All/BE/CJ), Methods Primer footer (Aaker 4-dim vs Conjoint choice-based)
- **Card navigation**: BE → `/showcase/{share_token}` (public BE dashboard) · CJ → `/conjoint/results/{id}` (public CJ results)

## Announcement System — News Posts + Pin to Home (Feb 2026 — NEW)

**Concept**: ประชาสัมพันธ์เป็น proper post type ใน CMS — เก็บถาวรได้ตลอด, admin ปักหมุดอันไหนขึ้นหน้าแรกก็ได้ พอ unpin เนื้อหายังอยู่

- **Schema**: เพิ่ม `announcement` ใน `POST_TYPES`. ทุก post รองรับ `media: List[SlideMediaItem]` + `pinned_to_home: bool` + `pinned_order: int`
- **Public endpoints**:
  - `GET /cms/announcements/pinned` (60s cache) — สำหรับ HomePage hero
  - `GET /cms/posts/public?type=announcement&limit=100` — archive
  - Cache invalidate อัตโนมัติเมื่อ create/update post
- **Admin UI** (`/admin/cms`):
  - List page มี tab "📣 ประชาสัมพันธ์" + badge "📌 PIN" ในแถวที่ pinned
  - Editor page (type=announcement) มี yellow pin block: checkbox "ปักหมุดบนหน้าแรก" + input order + media gallery (ภาพ+YouTube) ด้านล่าง cover image
- **HomePage**: prepend pinned announcements เป็น slides แรกของ hero (sort by `pinned_order` → `published_at`), หมุนปกติ
- **Public archive page** `/announcements`:
  - Editorial layout (5/7 split panel per card)
  - Topbar publicMode มี link "ประชาสัมพันธ์" ใหม่
  - แต่ละ card มี SlideMedia gallery รองรับ image+YouTube + 📌 PINNED ON HOME badge + "อ่านต่อ →" ไปหน้า learn/{slug}
- **Verified E2E**:
  - Create announcement → publish → pinned_to_home=true → ขึ้นเป็น slide แรกในหน้าแรก (eyebrow "📣 กิจกรรมนิสิต", media 2 dots: image+YT)
  - `/announcements` แสดง card พร้อม badge "PINNED ON HOME"
  - Cache invalidation ทำงาน — ไม่ต้องรอ 60s

### Hero Clickable CTA (Feb 2026 — NEW)
- **Schema**: `CmsPost.cta_url` + `LandingSlide.cta_url` (string, optional) — admin-defined destination URL
- **Backend**: `create_post` now persists `cta_url` (bug fix: เคยถูก drop ตอน insert); `update_post` ใช้ `model_dump(exclude_unset=True)` ผ่านได้อยู่แล้ว
- **Frontend HomePage**: `HeroClickable` helper wraps H1+lede+"อ่านต่อ ↗" hint
  - External URL (เริ่มด้วย `http(s)://`) → `<a target="_blank" rel="noopener noreferrer">`
  - Internal path → react-router `<Link>` (SPA navigation)
  - ถ้าไม่มี cta_url ใน announcement → fallback ไป `/learn/{slug}` อัตโนมัติ
  - ถ้าไม่มี cta_url ใน static landing slide → ไม่ clickable (ไม่แสดง hint)
  - Buttons (`ดูผลงานทั้งหมด`, `เริ่มอ่านใจตลาดฟรี`), rotation dots, และ SlideMedia (YouTube play) ทำงานปกติไม่ถูกครอบ
- **Admin UI**:
  - `/admin/cms/landing` per slide: red CTA URL block พร้อม placeholder รองรับทั้ง internal/external
  - `/admin/cms/posts/:id` (type=announcement): red CTA URL block ใต้ pin block พร้อม hint default `/learn/{slug}`
- **Verified E2E**: สร้าง announcement พร้อม `cta_url=https://example.com/news/123` → publish → pinned → ขึ้น slide ที่ 2 ของ hero พร้อม `<a target="_blank" href="https://...">` ครอบ H1+lede ✓

### Announcement AI Body Templates (Feb 2026 — NEW)
4 default prompt templates สำหรับเขียน body ของ post type `announcement` ผ่าน Gemini:
1. `default-announce-activity` — **กิจกรรมนิสิต** (★ default) — สัมมนา/ทริป/workshop
2. `default-announce-contest` — **การประกวดของนิสิต** — แข่งขัน/ผลรางวัล
3. `default-announce-project` — **โครงงานนิสิต** — โครงงาน/ผลงานวิจัย
4. `default-announce-training` — **การอบรมของนิสิต** — workshop/short course

Schema:
- `PromptTemplateCreate.post_type` Literal เพิ่ม `announcement` (เดิมมีแค่ article/insight/case_story)
- Idempotent seed ผ่าน `_seed_default_templates()` — ครั้งแรกเรียก `/cms/prompts` ก็จะ insert ครบ

Admin UX (`CmsEditorPage`):
- Base Template dropdown ใช้ `<optgroup>` 3 กลุ่ม: `◆ สำหรับ {post.type}` / `◇ ทั่วไป` / `∙ ของ post type อื่น`
- **Category-aware auto-pick** — เมื่อ post.type=announcement + category มีคีย์เวิร์ด (`ประกวด/แข่งขัน`, `โครงงาน/วิจัย`, `อบรม/workshop`, `กิจกรรม`) → auto-เลือก template ที่ตรง
- Verified PASS ทั้ง 4 categories จาก screenshot test

`CmsPromptsPage` (admin prompt manager): เพิ่ม option `📣 Announcement` ใน post_type selector

### Multi-Media Attachments บน Post ทุก Type (Feb 2026 — NEW)
ก่อนหน้านี้ Media Gallery (รูปหลายรูป + YouTube) เปิดให้แค่ announcement สำหรับใช้ใน hero slider. ตอนนี้ขยายให้ **ทุก post type** (article/insight/case_story/announcement) แนบ media ได้.

- **Admin (`CmsEditorPage`)**: Media Gallery แสดงเสมอ — heading เปลี่ยนตาม post type (announcement: "📣 Media Gallery — สลับใน hero"; อื่นๆ: "🖼 รูปประกอบ + วิดีโอ YouTube — แสดงในหน้าบทความ")
  - `+ Image` (upload ≤4MB หรือ URL) · `+ YouTube` (URL → auto-extract video id)
  - Reorder ▲▼, remove ✕, caption ต่อ item
- **Public article view (`CmsArticleView`)**: เพิ่ม section "● MEDIA (n)" ระหว่าง cover และ body
  - Layout: CSS grid `auto-fit minmax(280px, 1fr)` — รูปแสดง 2 คอลัมน์
  - YouTube ใช้ `<iframe>` 16:9 + `gridColumn: span 2` (เต็มกว้าง)
  - แต่ละ figure มี caption (font-mono uppercase) ด้านล่าง
- Backend: schema `media: List[SlideMediaItem]` มีอยู่แล้ว, persist + return ครบทุก endpoint
- Verified E2E: สร้าง article ที่มี 2 image + 1 YouTube → publish → `/learn/{slug}` แสดง MEDIA (3) ครบ + YouTube playable ✓

### Hero Short Headline สำหรับ Announcement (Feb 2026 — NEW)
ก่อนหน้านี้ HomePage hero เอา `post.title` มา `.slice(0, 80)` เลย → ถ้า title ยาว/มีรายละเอียดเยอะ พาดหัวก็ดูยาว/ไม่สวย และ admin ไม่สามารถเลือก italic-accent ที่บรรทัดไหนได้

- **Schema** (CmsPost): เพิ่ม
  - `hero_title_lines: Optional[List[str]]` (สูงสุด 2 บรรทัด, trim+filter empty)
  - `hero_accent_idx: Optional[int]` (0 หรือ 1 — ระบุบรรทัดที่ italic-accent สีแดง)
- **Admin (CmsEditorPage)**: ใต้ CTA URL block (post type=announcement) มี blue block ใหม่ "✨ พาดหัวสั้นสำหรับ Hero หน้าแรก"
  - 2 input บรรทัดละ 60 chars + radio "เน้นสีแดงที่: บรรทัด 1 / บรรทัด 2"
  - Live label แสดงว่าบรรทัดไหนกำลังเป็น accent
- **HomePage**: `announcementSlides` ใช้ `hero_title_lines` ถ้ามี (filter empty), fallback ไป `title.slice(0,80)`; clamp `hero_accent_idx` ตาม length
- Verified E2E: สร้าง announcement พร้อม `hero_title_lines=["งานสัมมนา","Brand Equity 2026"]` + `hero_accent_idx=1` → hero แสดง 2 บรรทัด, บรรทัด 2 = italic-accent ✓

### One-Shot AI Write (Feb 2026 — NEW)
เปลี่ยน workflow ของ AI Write Body จากเดิมต้องกรอก title ก่อนแล้ว AI ค่อยเขียน body → ตอนนี้ admin แค่ใส่ **รายละเอียดข่าว/เนื้อหา** ที่อยากเขียน → AI สร้างทุกอย่างให้ในคลิกเดียว

- **Backend endpoint ใหม่** `POST /api/cms/ai/generate-full`:
  - Request: `{description, post_type, category?, base_prompt?, sources?}`
  - Response (structured JSON): `{title, hero_title_lines, hero_accent_idx, excerpt, category, body_md, model}`
  - Prompt design: Gemini ถูกสั่งให้ตอบเป็น JSON object เดียว — มี robust parser ตัด ```json fences และหา `{...}` block; fallback คืน body_md ถ้า parse ไม่ผ่าน (`parse_warning: true`)
- **Frontend (CmsEditorPage)**:
  - Card "✨ AI WRITE" มี hint ชัดเจน: *"ใส่รายละเอียดเนื้อหา → AI จะสร้าง title · พาดหัวสั้น · excerpt · category · body ให้พร้อมในครั้งเดียว"*
  - Textarea ใหญ่ (8 rows) เน้น border-blue, placeholder ยกตัวอย่าง รายละเอียดให้
  - Primary CTA: **"✨ AI สร้างทั้งหมด (TITLE + พาดหัวสั้น + BODY)"**
  - Secondary fallback button: "หรือสร้างเฉพาะ BODY (ใช้ TITLE ปัจจุบัน)" — เก็บ flow เก่าไว้สำหรับ regenerate body อย่างเดียว
  - Warning text: overwrite title/excerpt/category/body/hero ทั้งหมด
- **Verified E2E**: ใส่ description "นิสิตคว้ารางวัล Brand Storytelling Awards..." → AI คืน title + hero ["เห็นก่อน อ่านใจก่อน", "นำตลาดทุกเวที"] + excerpt + body markdown ครบ ✓


## Hero Multi-Media Announcement Slides (Feb 2026 — superseded)
- **Backend schema**: `LandingSlide.media: List[SlideMediaItem]` where `{kind: 'image'|'youtube', src, alt, caption}` — multiple per slide; legacy `image` field kept as fallback
- **Frontend rendering** (`/app/frontend/src/components/SlideMedia.jsx`): auto-rotating intra-slide carousel (4.5s). **Lazy-load YouTube**: shows hqdefault thumbnail + red ▶ play button by default so outer hero carousel keeps rotating; iframe loads on click with `autoplay=1` and pause becomes sticky until user navigates away. Clicking inner dot = 30s grace pause + dwell. Hover also pauses outer rotation. ▶ VIDEO red badge for YT items; dots top-right with red active marker for YT, black for image
- **Admin UI** in `/admin/cms/landing` per slide: 📣 MEDIA GALLERY card with `+ Image` (upload ≤4MB OR URL OR AI gen via Cover Image button) and `+ YouTube` (URL or video id auto-extracted); reorder ▲▼, remove ✕, live preview (image or YT thumbnail). Cache invalidated on save
- **Visual redesign (Feb 2026)** — "Academic Brutalism × Editorial" by design agent:
  - Bento hero: 8/4 split, italic accent + red square mark on headline, 2x2 stats grid with 01/02/03/04 numbering
  - **Editorial Monogram logo fallback** — deterministic hash-derived gradient + initial letter for any study missing `logo_url` (fixes inconsistent brand image issue); 8-color palette, radial noise overlay
  - Study cards: top accent bar (BE green / CJ red), translateY hover lift + deep shadow, dashed "OPEN →" footer
  - Featured topics: full-width split panel (5fr/7fr) with method sub-tiles
  - Methods Primer footer: dark slab (#0A0A0A) with sectioned 01/02 columns
  - Mobile (≤390px): single-col cards, stats 2x2, hero text reflows; verified at 390px
- Design guidelines saved to `/app/design_guidelines.json`
- **Showcase polish (Feb 2026 — round 2)**:
  - Logo fallback ครบ — backend `/showcase/index` ตอนนี้รองรับ 2 แหล่ง: `brand.logo_url` (URL) → fallback ไป `identity.visual_assets[].kind=='logo'` (base64 upload) → frontend monogram tile (hash-derived gradient)
  - Topbar `publicMode` prop — แสดง HOME / LEARN / SHOWCASE สำหรับผู้ใช้สาธารณะแทน auth-only links; แก้ broken link `/market-research/brand-equity` → `/brand-equity`
  - Theme เปลี่ยน beige (#F4F0EA) → bright white (#FFFFFF/#FAFAFA) ให้สดใสตรงกับ HomePage
  - Default catalog tab = `brand_equity` (เดิม `all`)
  - **Editor's Pick hero** — admin pick 1 study (BE/CJ) + custom headline + subhead + image (upload/AI Nano Banana/URL); แสดงระหว่าง main hero กับ catalog
    - Schema: `cms_landing.showcase_editor_pick = {enabled, study_id, study_method, headline, subhead, image_base64/mime, image_url}`
    - Admin UI: `/admin/cms/landing` มี section ★ Editor's Pick พร้อม Upload / ✨ AI Generate / URL input + preview
    - Public render: magazine cover-style split panel (6/6) + diagonal stripe overlay + EDITOR'S PICK badge + colored top-bar (BE green / CJ red)
- **OG/Social preview bridge**: `GET /api/share/showcase-index` returns OG-rich HTML (title + Thai description with live stats + meta-refresh) — paste link in FB/LINE/Slack/Discord/WhatsApp shows beautiful preview card. Frontend hero has `⤴ SHARE THIS PAGE` button that copies bridge URL.
- **TTL cache (60–300s)** on all public read-only endpoints — instant response for repeat visitors + cuts DB load:
  - `/api/cms/landing` (120s, invalidated on PUT)
  - `/api/cms/posts/public` (120s)
  - `/api/cms/posts/public/by-slug/{slug}` (300s — articles rarely change)
  - `/api/brand-equity/showcase` (60s — list)
  - `/api/brand-equity/showcase/{token}` (60s — full sanitized dashboard, supports filter params in cache key)
  - `/api/showcase/index` (60s — unified BE + CJ)
  - `/api/conjoint/showcase` (60s)
  - `/api/share/showcase-index` (60s — OG bridge index)
  - `/api/share/showcase/{token}` (120s — OG bridge per BE)
  - `/api/share/learn/{slug}` (300s — OG bridge per article)
- Helper: `/app/backend/lib/ttl_cache.py` — async-safe, single-flight locking, `_skip_cache=True` escape, `invalidate_prefix()` for write hooks
- Verified via iteration_19: 9/9 backend pytest pass + frontend 100% flows pass

## Thesis Export Permission Whitelist (Feb 2026 — NEW)
- **Schema**: `users.can_export_thesis: bool = False` — central whitelist flag (instead of separate teacher role)
- **Backend**: `PUT /api/admin/users/{user_id}/thesis-export-permission` body `{enabled: bool}` — admin only; invalidates in-memory user cache so flag takes effect immediately (no re-login needed)
- **Gates updated (Feb 2026 round 2)**: New rule = **(owner AND whitelisted) OR admin**
  - Owner without whitelist → 403 "คุณเป็นเจ้าของ study แต่ยังไม่ได้รับสิทธิ์ Export Thesis"
  - Non-owner non-admin → 403 "เฉพาะเจ้าของ study (ที่ได้รับสิทธิ์แล้ว) หรือ admin"
  - Non-owner admin → ✓ (40KB DOCX verified via curl)
- **Frontend hide policy**:
  - `/showcase/{token}` (public BE dashboard) — Export card completely hidden via `showExport={!isShowcase}` prop on `BeMethodology`; rest of methodology content preserved
  - `/conjoint/results/{id}` — Export buttons (both `export-thesis-btn` + `export-thesis-after-ai-btn`) gated by `isOwnerOrAdmin`
- Export available only on tools pages: `/brand-equity/studies/{id}` and `/conjoint/results/{id}` (owner view)
- **`/thesis-eligible` endpoint**: returns `{eligible, role, can_export_thesis}` — frontend uses to show/hide export button
- **Admin UI** at `/admin/users`: each user card has `🎓 Allow Thesis` button (toggle to `Thesis: ON` green) + `🎓 THESIS` badge next to name when granted; server-side search (`?q=`, debounced 300ms) + Load More pagination (100/page, cap 1000) — scales to any user count
- **Admin Users API**: `/api/admin/users?q={search}&skip={n}&limit={n}` (cap 1000) + `/api/admin/users/count?q={search}` for pagination UI
- Verified end-to-end: grant via UI → toast → badge appears → student's `/thesis-eligible` flips to `true`

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123

## CMS Hero Clickable + Custom Title + Multi-Media (Feb 2026)
- **Hero Clickable CTA** (`HomePage.jsx` + `CmsLandingPage.jsx` + `CmsEditorPage.jsx`)
  - `CmsPost.cta_url` + `LandingSlide.cta_url` — admin-defined destination
  - `HeroClickable` wraps H1+lede+"อ่านต่อ ↗" hint; external (`http(s)://`) → `<a target="_blank">`; internal → `<Link>`
  - Fallback: announcement → `/learn/{slug}`; static slide → no click affordance
- **Announcement AI Body Templates** (4 defaults, auto-seed):
  - `default-announce-activity` (★ default) — กิจกรรมนิสิต
  - `default-announce-contest` — การประกวด
  - `default-announce-project` — โครงงาน
  - `default-announce-training` — การอบรม
  - Category-aware auto-pick (ประกวด/โครงงาน/อบรม/กิจกรรม → matches template); dropdown uses `<optgroup>` grouping
- **Multi-Media Gallery on every post type** (article/insight/case_story/announcement)
  - CmsEditorPage: media editor visible for all types (heading adapts)
  - CmsArticleView (`/learn/{slug}`): renders "● MEDIA (n)" section between cover and body; grid layout, YouTube `span 2` 16:9 iframe, image figcaption
- **Hero Short Headline override** (announcement only)
  - Schema: `hero_title_lines: List[str]` (max 2) + `hero_accent_idx: int` (0/1)
  - Admin: blue block "✨ พาดหัวสั้นสำหรับ Hero หน้าแรก" — 2 inputs (60 chars each) + radio for italic-accent line
  - HomePage uses `hero_title_lines` if present, else falls back to `title.slice(0,80)`
- **One-Shot AI Write** (`POST /api/cms/ai/generate-full`)
  - Input: `{description, post_type, category?, base_prompt?, sources?}`
  - Output: `{title, hero_title_lines, hero_accent_idx, excerpt, category, body_md, model}` — Gemini returns JSON; robust parser strips ```json fences and finds `{...}` block; falls back to `body_md` with `parse_warning: true`
  - Frontend "✨ AI WRITE" card: hint text, big blue textarea (8 rows), primary CTA "✨ AI สร้างทั้งหมด (TITLE + พาดหัวสั้น + BODY)" + secondary "หรือสร้างเฉพาะ BODY"

## Refactor: Conjoint Module Extraction (Feb 20, 2026 — DONE)
ทำโดย Claude Code Pro (local) → push GitHub `main` → pull กลับ Emergent → smoke test ผ่าน

- **ไฟล์เปลี่ยน:**
  - `backend/server.py`: 12,342 → **8,022 บรรทัด** (ลด 35%)
  - `backend/routes/conjoint.py`: ใหม่, **4,356 บรรทัด** (24 models + 24 helpers + 42 endpoints)
- **สถาปัตยกรรม:** Factory pattern `get_conjoint_routes(db, get_current_user, get_current_user_optional)` — **ไม่มี router prefix** (เพราะมี `/admin/conjoint-image-settings` ปน → คง full path เดิม)
- Late-import shared symbols จาก `server.py` (`User, UserRole, SurveyResponse, compress_base64_image, initialize_default_prompts`)
- Heavy libs (numpy/pandas/sklearn/statsmodels/docx/matplotlib/lib.nca/ipma/fsqca) ยัง lazy import ภายในฟังก์ชันเหมือนเดิม
- **Smoke tests passed**:
  - ✅ Backend boots cleanly, no errors in supervisor log
  - ✅ All `/api/conjoint/*` + `/api/admin/conjoint-image-settings` → 200
  - ✅ Regression: `/api/brand-equity/*`, `/api/cms/*`, `/api/projects`, `/api/showcase/index` → 200
  - ✅ Public showcase UI ยังแสดง topics=4 / BE=1 / CJ=3 / responses=12 ครบ
- Reference docs: `/app/REFACTOR_CONJOINT.md` (prompt), `/app/REFACTOR_CONJOINT_REPORT.md` (สรุปจาก local agent)

## Unified Top Navigation (Feb 20, 2026 — NEW)
แก้ปัญหา: top menu ของระบบไม่ consistent ระหว่างหน้าต่างๆ + login/role logic เพี้ยน + ปุ่ม Login/Logout/Profile หาไม่เจอ

### Architecture
- ไฟล์ใหม่: `/app/frontend/src/components/UnifiedTopbar.jsx` (~310 บรรทัด, single source of truth)
- ไฟล์ใหม่: `/app/frontend/src/components/unified-topbar.css` (Editorial/Swiss white sticky)
- Legacy wrappers (zero per-page changes — 30+ pages auto-upgraded):
  - `BeTopbar` ใน `be-components.jsx` → ตอนนี้แค่ render `<UnifiedTopbar/>`
  - `Topbar` ใน `SwumktComponents.jsx` → ตอนนี้แค่ render `<UnifiedTopbar/>`

### Menu Structure (role-based)
| Element | Guest | Student | Admin |
|---------|:-----:|:-------:|:-----:|
| Logo + subtitle | ✓ | ✓ | ✓ |
| หน้าแรก / เรียนรู้ / ประชาสัมพันธ์ / Showcase | ✓ | ✓ | ✓ |
| เครื่องมือ ▾ (BE/CJ/CX/CB/JF/SV) | – | ✓ | ✓ |
| โปรเจกต์ | – | ✓ | ✓ |
| ผู้ดูแล ▾ (Users/CMS/Landing/AI/Notifications/LLM/Settings) | – | – | ✓ |
| `[เข้าสู่ระบบ] [ลงทะเบียน]` | ✓ | – | – |
| Avatar dropdown (Profile/Notifications/Dashboard/Logout) | – | ✓ | ✓ |

### Features
- Auto-detect auth via `useAuth()` — no per-page logic needed
- Role badge color-coded: ADMIN (red), TEACHER (green), STUDENT (blue — also default for `role='user'`)
- Mobile: hamburger + drawer @ ≤900px (auto-closes on route change)
- `publicMode` prop (still supported) hides Tools/Projects/Admin even when logged in — ใช้กับ `/showcase/{token}` (shared dashboard) และ `/brand-equity/respond/{token}` (survey link)
- `subtitle` prop passes through e.g. "BRAND HEALTH CHECK" / "CONJOINT ANALYSIS"
- `active` prop highlights current section

### Testing (iteration 21 — frontend agent)
- 12/13 acceptance criteria PASS
- Guest/Student/Admin views verified on `/`, `/learn`, `/announcements`, `/showcase`, `/brand-equity`, `/market-research/conjoint-analysis`
- Logout flow + tools dropdown + admin dropdown + active state + subtitle + mobile responsive all PASS
- 1 minor (student role badge showing "USER" instead of "STUDENT") — fixed by mapping `role='user'` → STUDENT label
- No double-topbar regression (`.be-topbar:not(.utb-root)` count = 0 on all pages)

## Performance Overhaul (Feb 22, 2026)
ตรวจสอบ performance ทั้งระบบ → แก้ทั้ง 6 phases

### Phase 1: List endpoint projection — verified
endpoints ทั้งหมดมี projection ตัด heavy fields ออกครบแล้ว (ไม่ต้องแก้เพิ่ม)

### Phase 2: Frontend Code Splitting (Lazy Routes)
- App.js เปลี่ยนจาก eager imports 55 หน้า → eager 18 หน้า + lazy 30 หน้า
- ทุก lazy route wrap ด้วย `<Suspense fallback={<RouteFallback/>}>`
- หน้าใหญ่ที่ lazy: ConjointResultsPage (3,388 บรรทัด), KanbanBoard (1,861), AdminSettings (1,879), BrandEquityDashboardPage (1,783), ConjointDesignPage (1,583), CmsEditorPage, all Admin pages, all Alumni pages, Surveys, BE Wizard, Content tools
- Verified: `/admin/cms` fetches `src_pages_cms_CmsListPage_jsx.chunk.js` on-demand

### Phase 3: Visibility-based Polling (Battery/CPU saver)
- New hook: `/app/frontend/src/hooks/useVisiblePolling.js`
- Pauses interval when `document.hidden === true`, resumes when tab focuses
- Applied to: `NotificationCenter.js` (30s unread polls — biggest offender)
- Pattern available for other polls (Conjoint AI status, BE thesis export) to adopt

### Phase 4: Object Storage Migration (P0 lowest DB pressure)
- New lib: `/app/backend/lib/object_storage.py` — Emergent Object Storage wrapper
- New endpoint: `GET /api/files/{path}` — public file proxy with 24h browser cache
- New helper: `/app/backend/lib/image_normalize.py` — transparent base64→URL conversion at write time
- Migration: `scripts/migrate_b64_to_storage.py` ran successfully
  - 9 conjoint images + 5 cms covers uploaded to object storage
  - **Safety:** original base64 fields kept as fallback — no data loss
- Cleanup script ready: `scripts/cleanup_legacy_b64.py` (run AFTER verifying URLs render correctly in production for ≥1 week)
- Upload endpoints updated: `upload_profile_image`, `upload_image` — incoming `data:image/*` automatically uploaded to storage, only URL stored in MongoDB going forward

### Phase 5: React Query (Frontend Cache)
- Installed `@tanstack/react-query@5.100.13`
- New hooks file: `/app/frontend/src/hooks/queries.js` — shared queries with centralised keys
- Hooks created: `useLanding`, `usePinnedAnnouncements`, `useAnnouncementsArchive`, `useShowcaseIndex`, `useBrandEquityShowcase`, `useConjointShowcase`
- staleTime: 60s for announcements, 90s for showcase, 5min for landing config
- HomePage migrated: 4 parallel axios calls → 3 React Query hooks (instant on revisit)

### Phase 6: Slow Request Logging
- Middleware in `server.py` logs requests ≥1.5s as WARNING, ≥5s as ERROR
- Skips noisy endpoints (`/auth/me`, `/notifications/unread-count`, `/health`)

### Tests
- Backend smoke: 5/5 endpoints → 200
- Frontend smoke: HomePage + Announcements + Admin CMS (lazy) all load OK
- Object storage: upload roundtrip verified (2KB → 200 OK retrieval)
- Lint: all clean

### Expected Performance Impact
- **Initial bundle size:** -60% (lazy chunks load on demand)
- **Object storage migration (when cleanup runs):** conjoint_studies ~20MB → expected ~50KB
- **React Query caching:** เปลี่ยนหน้าระหว่าง dashboard/showcase → instant (จาก cache)
- **Polling load:** tab idle → 0 API calls (was 2 req/min per tab)
