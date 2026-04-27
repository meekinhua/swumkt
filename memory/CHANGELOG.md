# CHANGELOG — SWU Marketing Research & Alumni Platform


## 2026-04-27 (later 2) — 🏆 Brand Equity: Unlimited Competitors + Topic Grouping + TH Trait Pool
- **🚀 Removed competitor cap** — `competitors_top` no longer slices to `[:2]`, accepts any number of competitors. Each `COMP-1..COMP-5` template + every `COMP-CUSTOM-*` now emits one question per competitor (was top-1 for custom)
- **📑 Topic-based grouping** — every Likert question carries `comparison_group = axis_label` (or fallback to template id). New helper `_group_questions_for_comparison` re-orders within each dimension so brand+all-competitors for the same topic appear contiguously: brand first, then competitors in user input order. Singleton groups stay in the original perspective layout (no misleading 1-brand topic).
- **🇹🇭 Hard-coded Thai trait translations** — `DEFAULT_TRAIT_POOL_TH` (24 items) + `PERSONALITY_TRAIT_POOL_TH` (17 items) + `TRAIT_TH_MAP` lookup dict. Every `trait_grid` question now carries `options_th` parallel to `options`. Storage stays in EN (so stats engine + dashboard unchanged); UI swaps display label only.
- **Frontend Respondent**:
  - `QuestionInput` — trait_grid / mcq_single / mcq_multi pick `options_th` when `lang='th'` (display only, value submitted is still the EN canonical)
  - New axis-group renderer with header `หัวข้อ · <attr> · N แบรนด์` (TH) / `TOPIC · <attr> · N brands` (EN), gold dot indicator
  - Identity perspective sub-grouping retained for non-axis questions (BI-1..BI-4, ASO-1, ASS-1, ASP-1)
  - `data-testid='be-resp-group-header-{axis}'` for testability
- **Frontend Wizard step 0**: removed "top 2 only" hint; added live "+ N×5 questions" estimate side panel
- **Testing**: iteration_15 · 13/13 backend pytest · frontend lang toggle + wizard text verified · `/app/backend/tests/test_brand_equity_grouping_trait_th.py`



## 2026-04-27 (later) — 🖼️ Brand Equity: Real Brand Logos + Editable Studies
- **New `BrandLogo` component** (`be-components.jsx`) with priority fallback chain:
  1. `identity.visual_assets[kind=logo]` (uploaded base64) → 2. `brand.logo_url` (URL) → 3. initial letter on gradient
  - `onError` auto-falls back to initial when remote URL breaks
- **Replaced initial-letter boxes with real logos** on:
  - Studies List card (`.be-study-card`)
  - Dashboard hero (`be-dashboard-brand-logo`)
  - Public Respondent welcome screen (size 64) + question header (size 42)
- **Wizard Step 0 — Logo card**: URL input + Upload button + live preview + clear; supports both `brand.logo_url` and inline upload (de-duplicates kind='logo')
- **Backend** `get_public_study`: surfaces standalone `logo_asset` (kind=logo only) instead of full `visual_assets` — drops public payload size while letting respondent render real logo
- **🐛 Fixed Edit Bug**: previously editing a study or going back to fix typos created duplicate studies because Wizard always POSTed a new one. Now:
  - `loadStudy` lands on Step 0 (was auto-jumping to Step 3 review)
  - `Stepper` is clickable in edit mode (jump freely)
  - `proceedToReview` uses `PUT /studies/{id} + POST regenerate-questions` when `study.id` exists; falls back to `POST /studies` for brand-new
  - Step 2 button label switches to **"Update & regenerate →"** for existing studies
  - Step 3 launch becomes **"Save & re-publish"** for `status='collecting'`
  - Quick **"Save changes"** button on every step (steps 0/1/2 + step 3) for edit mode
- **Edit access points**: "Edit study" button on Dashboard hero + small "Edit" on every List card (stopPropagation)
- **Testing**: iteration_14 · 7/7 backend pytest · 100% frontend e2e · `/app/backend/tests/test_brand_equity_logo_edit.py`



## 2026-04-27 — 🎨 Brand Equity: SWUMKT Logo + EN Translation Polish
- **Backend** `brand_equity.py`:
  - New `_translate_attrs_to_en(attrs_th)` helper — Gemini 2.5 Flash translates TH brand-quality attributes to natural EN adjectives (1:1 indexed, falls back to TH on error)
  - `BrandSetup.custom_quality_attributes_en: List[str]` parallel field
  - `POST /studies` auto-translates on create
  - `PUT /studies/{id}` re-translates only when TH list changed (saves Gemini calls)
  - `POST /studies/{id}/regenerate-questions` lazy-backfills EN list for legacy studies
  - `_generate_questions_from_template` emits proper `prompt_en` for PQ-CUSTOM-* and COMP-CUSTOM-* (e.g. "Brand is a brand that is trustworthy") instead of leaking Thai into EN respondent flow
- **Frontend** Brand Equity:
  - `BeTopbar` now shows real SWUMKT logo (`<img class='be-logo-img'>`) + name + sub-label, replacing the abstract dot — applied to List, Wizard, Dashboard
  - New `PublicTopbar` on `BrandEquityRespondentPage` (welcome / question / demographics / thanks) with logo + LangToggle so survey looks part of the SWU MKT system
  - Mobile-responsive CSS (`.be-public-topbar`, `.be-public-logo`)
  - Exported `SWU_LOGO_URL` constant from `be-components.jsx`
- **Testing**: iteration_13 · 7/7 backend pytest · frontend topbar + toggle + persistence verified on 3 pages · `/app/backend/tests/test_brand_equity_translation.py`


## 2026-04-27 — 📡 Activity Stream — Real-time Tree Events
- **Backend**:
  - New `_log_activity(actor_id, kind, summary, target_id, meta)` helper in alumni.py
  - New collection `alumni_activities`
  - `GET /api/alumni/activity/stream?scope=tree|global|self&limit=30` — filters events by ancestors+descendants+direct relations (BFS up to 8 levels)
  - 9 activity kinds auto-logged: `joined_family`, `position_changed`, `company_changed`, `post_created`, `job_posted`, `review_given`, `tree_extended`, `level_up`, `badge_earned`
  - Anonymous reviews skip activity log (privacy hardening)
  - Helpers dict now exposes `_log_activity` to phase2 router
- **Frontend** `ActivityStream.jsx`:
  - Right sidebar of `/alumni/feed` (3 tabs: สายของฉัน / ทั้งคณะ / ของฉัน)
  - Compact version on `/alumni/tree` sidebar
  - Auto-refresh every 60s · click item → /alumni/profile/{actor.user_id}
  - Each kind has emoji + tone color · time-ago formatter
- **Testing**: iteration_9 · 13/13 backend · 100% frontend · `/app/backend/tests/test_activity_stream.py`

## 2026-04-26 — 🚀 Alumni Phase 2: Discover + Feed + Jobs + Reviews
**4 new major features in modular `alumni_phase2.py` router (~512 lines, separate from main alumni.py)**

- **Discover (Mystery Match)** `/alumni/discover`:
  - `GET /api/alumni/discover/mystery-match` returns 1 alumni 3-6 hops away with reasons
  - Filters: hop range (close/far/all), industry
  - `POST /discover/skip/{user_id}` to never see again
  - UI: blur→reveal animation, gradient card, 4 actions (Mark/View/Skip/Shuffle)
- **Feed** `/alumni/feed`:
  - 6 post kinds: plain, throwback, review, job_share, announcement, search_help
  - `POST /feed/posts` (+5 XP), `GET /feed/posts` with kind filter
  - `POST /feed/posts/{id}/react` toggle ❤️ (notifies author)
  - `GET/POST /feed/posts/{id}/comments` (notifies author, increments comment_count)
  - `DELETE /feed/posts/{id}` (author only)
  - UI: composer with kind selector, post cards, react toggle, expandable comments
- **Jobs Directory** `/alumni/jobs`:
  - `POST /jobs` (+30 XP), supports kind=hiring|seeking_referral, level, salary, apply_url
  - `GET /jobs` with kind+level filters
  - `POST /jobs/{id}/interest` increments counter, notifies poster, idempotent
  - `DELETE /jobs/{id}` soft-deletes (active=false, preserves analytics)
  - UI: filter chips, JobCard with poster avatar + interest button, PostJobModal
- **Reviews 1-5 stars** (in Profile page sidebar):
  - `POST /reviews` (+25 XP first review only) with stars + tags + optional anonymous
  - `GET /reviews/user/{user_id}` returns reviews + average + breakdown + top_tags
  - `GET /reviews/tags` returns 13 curated tag list
  - Upsert behavior: re-reviewing same person updates not duplicates
  - Anonymous reviewer_id stripped from API response (privacy hardened)
  - UI: ReviewModal (StarInput + tag chips + anonymous toggle), ReviewsSection (avg, breakdown bars, top tags, list)
- **Architecture**: `get_alumni_routes` now returns `(router, helpers)` tuple. Phase 2 receives helpers via factory pattern — clean separation.
- **New collections**: alumni_posts, alumni_post_comments, alumni_jobs, alumni_reviews, alumni_mystery_skipped
- **Top nav**: now 6 tabs (หน้าแรก · สายตระกูล · Discover · ฟีด · งาน · ฉัน)
- **Testing**: iteration_8 · 24/24 backend pytest · ~95% frontend · `/app/backend/tests/test_alumni_phase2.py`

## 2026-04-18 — 🚀 Alumni Phase 1.5: Viral Invite + Gamification Engine + Notifications + Trivia
- **Invite Viral Loop (production-ready)**:
  - Shareable link `/alumni/invite/{code}` with public preview endpoint (shows inviter card)
  - InviteModal: real **QR code** (qrcode.react SVG), Copy Link, LINE deep-link share, Download QR
  - Floating Action Button (+100 XP badge) + Sticky top-nav "ชวนเพื่อน" button
  - Auto-mark flow: new registrant via link → auto-creates pending 'take' relation to inviter
  - Pending invite code persists in localStorage across register → onboarding → accept
  - Inviter earns **+100 XP** per accepted invite + notification
- **XP / Badge / Level Engine**:
  - `XP_EVENTS` catalog: login_daily +5, upload_avatar +20, mark_relation +10, relation_confirmed +30, invite_sent +5, invite_accepted +100, trivia_correct +10, streak milestones +20/+50/+100/+300
  - 8 auto-unlock badges (`BADGE_RULES`): tree_builder, king, 5_tier_club, connector, reviewer, iq_master, streak_7, streak_30
  - 15-level progression (XP thresholds [0→50000])
  - Level-up notifications ("🎉 Lv.5 แล้ว!") + badge-earned notifications
- **Streak System**: `_touch_streak` on `/me` — auto resets if >1 day gap, +XP at 3/7/14/30 day milestones
- **Notifications**:
  - New collection `alumni_notifications` with `{user_id, kind, title, body, meta, read, created_at}`
  - Bell icon in top nav with unread red badge · dropdown with time-ago formatting · deep-links to relevant page · "อ่านทั้งหมด" mass-mark-read · 30s polling
  - Event kinds: mark_request, relation_confirmed, invite_accepted, welcome, badge, level_up, streak
- **Trivia "รู้จักสายของคุณไหม?"** (`/alumni/trivia`):
  - Auto-generates daily MCQ from user's tree (question types: company / position / gen)
  - 4 options with correct/wrong visual feedback + XP reward
  - IQ Leaderboard sidebar (top trivia_streak)
  - Idempotent per day
- **Throwback Widget** (Tree page sidebar):
  - Random 4 alumni with playful Thai captions ("มีใครจำพี่คนนี้ได้ไหม?", "ตำนานของรุ่น")
  - "สุ่มใหม่" refresh button
- **Privacy toggles** now fully functional (PUT /api/alumni/privacy with partial merge)
- **Testing**: iteration_7 · 18/18 backend · ~95% frontend · test file `/app/backend/tests/test_alumni_phase15.py`

## 2026-04-18 — 🎉 Alumni Network "สายตระกูล MKT SWU" Phase 1 MVP
- **New Feature**: Full Alumni Networking & Family Tree module (Phase 1 of 2).
- **Backend** — new router `/app/backend/routes/alumni.py` (factory pattern, separate from server.py):
  - `GET /api/alumni/stats` (public, no auth) — landing page stats
  - `POST /api/alumni/register`, `GET /api/alumni/me`, `PUT /api/alumni/me`
  - `GET /api/alumni/profile/{user_id}`
  - `GET /api/alumni/tree/me`, `GET /api/alumni/tree/{user_id}` — BFS ancestor/descendant chain with auto-labeling (พี่ take / ปู่ / ทวด / เทียด / เทียดทวด)
  - `POST /api/alumni/relations` — mark (pending, needs 2-way confirmation)
  - `PUT /api/alumni/relations/{id}/confirm` — only `to_user` can confirm
  - `GET /api/alumni/relations/pending`, `GET /api/alumni/relations/mine`
  - `POST /api/alumni/invites`, `GET /api/alumni/invites`
  - `GET /api/alumni/search?q=&gen=`
- **MongoDB Collections**: `alumni_users`, `alumni_relations`, `alumni_invites`
- **Algorithm**: BFS traversal — derives ปู่/ทวด/เทียด automatically from confirmed `take` chains (distance 1→N); no materialization needed for MVP scale.
- **Frontend** — `/app/frontend/src/pages/alumni/`:
  - `AlumniLandingPage` (public) — hero with animated gen counter, 5 stat pills (live from DB), how-it-works, testimonials, final CTA
  - `AlumniOnboardingPage` — 4-step flow (verify → search พี่ take → invite → done), auto-skip to done if already registered
  - `AlumniTreePage` — tabs (สายขึ้น / สายลง / ทั้งหมด), clickable tree nodes with side panel, pending marks to confirm, Mark modal with live search
  - `AlumniProfilePage` — hero banner, stats, 8 badges catalog, chain path breadcrumb, streak calendar, quests, privacy toggles, edit form
  - Shared `AlumniLayout`, `AlumniUI` (Avatar/Chip/StatPill/Modal/Icons/Toast), scoped `alumni-styles.css` with IBM Plex Sans Thai
- **Routes registered** in `App.js`: `/alumni` (public), `/alumni/onboarding`, `/alumni/tree`, `/alumni/tree/:userId`, `/alumni/profile`, `/alumni/profile/:userId`
- **Seed Data** — `/app/backend/scripts/seed_alumni.py`: Creates 8 fake alumni + full bloodline chain for `student1@swu.ac.th` (ภูมิ, รุ่น 64) → 5 ancestors + 3 descendants exactly as spec.
- **Testing**: 17/17 backend tests passed · 100% frontend critical flows · test_report iteration_6.json

## 2026-04-18 — AI Interpretation Reliability + Thesis Enhancements
- **AI Interpretation → Background Task**: Converted synchronous AI interpretation call to background task + polling (same pattern as Thesis Export). Prevents 502 proxy timeout when Gemini takes >60s.
  - New endpoint: `GET /api/conjoint/studies/{id}/ai-interpretation-status/{job_id}`
  - Updated both "วิเคราะห์ด้วย AI" button and "แชร์เป็นเนื้อหา" flow to use polling
  - Added `resolved` guard flag to prevent duplicate actions
- **Thesis Export Modal Overflow Fix**: Added `max-h-[90vh] flex flex-col` + `overflow-y-auto` to prevent modal from overflowing on small screens. Footer buttons always visible.
- **Thesis Download Duplicate Fix**: Added `downloaded` flag to polling loop to prevent multiple file downloads (was downloading 9 files at once due to race condition in setInterval callbacks)
- **Thesis Extra Prompt**: Added textarea in Export Modal for custom AI instructions. Backend accepts `extra_prompt` in request, appends to system message. Cache key includes hash of extra_prompt.
- **Thesis Native Equations (OMML)**: Installed `math2docx` + `latex2mathml`. AI instructed to output LaTeX `$$...$$` (display) and `$...$` (inline). `_create_thesis_docx` detects patterns and converts to native Word equations via `math2docx.add_math()`.
- **Thesis SWU iThesis Format**: TH SarabunPSK font set on ALL runs (headings 18pt bold, body 16pt, table 14pt). Margins: left 3.81cm, others 2.54cm. Line spacing 1.5.

## Previous Sessions (Summary)
- Conjoint Analysis: 5 methods, AI interpretation, CSV export, Thesis Word Export
- Kanban: Sub-Kanban, Cover Images, Assignees, RBAC, Mobile Responsive
- Survey Builder, Customer Journey, Content Sharing, Admin Dashboard
- Background task architecture for long-running AI jobs
- `_call_gemini_with_retry` for reliable Gemini calls
