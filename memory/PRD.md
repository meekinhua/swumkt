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

### Brand Equity / Brand Health Check (COMPLETE — Feb 2026, polished Apr 27 2026)
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
- **OG/Social preview bridge**: `GET /api/share/showcase-index` returns OG-rich HTML (title + Thai description with live stats + meta-refresh) — paste link in FB/LINE/Slack/Discord/WhatsApp shows beautiful preview card. Frontend hero has `⤴ SHARE THIS PAGE` button that copies bridge URL.
- Verified via iteration_19: 9/9 backend pytest pass + frontend 100% flows pass

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
