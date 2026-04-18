# CHANGELOG — SWU Marketing Research & Alumni Platform

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
