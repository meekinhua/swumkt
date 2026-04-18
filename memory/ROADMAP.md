# ROADMAP — SWU Platform

## P0 — Alumni Network "สายตระกูล MKT SWU" (Phase 1 MVP)
**User-approved scope. Implementation NOT started.**

### Step 1: Backend Foundation (`/app/backend/routes/alumni.py`)
- Create alumni_router with prefix `/alumni`
- Register in server.py: `api_router.include_router(alumni_router)`
- MongoDB collections: `alumni_users`, `alumni_relations`, `alumni_invites`
- Endpoints needed:
  - `POST /api/alumni/register` — Create alumni profile (student_id, gen, name, etc.)
  - `GET /api/alumni/stats` — Public stats for landing (alumni count, connections, etc.)
  - `GET /api/alumni/profile/{user_id}` — Get alumni profile
  - `PUT /api/alumni/profile` — Update own profile
  - `GET /api/alumni/tree/{user_id}` — Get ancestor/descendant chain
  - `POST /api/alumni/relations` — Mark a relation (from → to, kind)
  - `PUT /api/alumni/relations/{id}/confirm` — Confirm/reject relation
  - `GET /api/alumni/relations/pending` — Pending marks to confirm
  - `POST /api/alumni/invites` — Send invite (email/studentId/link)
  - `GET /api/alumni/search` — Search alumni by name/studentId/gen
- Key algorithm: Derive relations from chain (when A→B confirmed, auto-create A→C derived relations)

### Step 2: Frontend Pages (`/app/frontend/src/pages/alumni/`)
Files to create:
- `AlumniLandingPage.js` — Hero, stats, how-it-works, testimonials, CTA (pixel-perfect from prototype)
- `AlumniOnboardingPage.js` — 4-step flow
- `AlumniTreePage.js` — Family tree with ancestors/descendants/all views
- `AlumniProfilePage.js` — Stats, badges, bio
- `AlumniLayout.js` — Shared TopNav + BottomNav wrapper
- `alumni-styles.css` — Design system CSS (colors, typography from spec)

### Step 3: Route Registration (`App.js`)
- `/alumni` → AlumniLandingPage (public)
- `/alumni/onboarding` → AlumniOnboardingPage (auth required)
- `/alumni/tree` → AlumniTreePage (auth required)
- `/alumni/tree/:userId` → AlumniTreePage viewing another user
- `/alumni/profile` → AlumniProfilePage (auth required)
- `/alumni/profile/:userId` → View another user's profile

### Step 4: Design System
- Font: IBM Plex Sans Thai (import from Google Fonts CDN)
- Colors: CSS variables matching spec (Red #C8102E, Blue #1B75BC, Paper #F7F4EE, etc.)
- Components: Avatar (hue-based gradient), Chip, StatPill, TreeNode, TreeConnector
- Responsive: 360px → 1440px, bottom nav for mobile

### Step 5: Testing
- Backend: pytest for alumni API endpoints (CRUD, relations, tree derivation)
- Frontend: Screenshot + testing_agent for visual verification

---

## P1 — Existing Backlog
- Google Drive Integration for Kanban file attachments
- Survey Image Display Fix
- Auto AI Analysis verification in "Share as Content" flow

## P2 — Alumni Phase 2
- Discover (Mystery Match)
- Feed (multi-type posts)
- Jobs & Business directory
- Reviews system

## P3+ — Future
- Phase 2 Caching (Image Endpoint)
- Kanban templates & custom fields
- Refactor server.py (extract routes)
- Customer Behavior Analysis (Quantitative)
- Survey Analytics & Dashboard
- Android Push Notification vibrate
- Academic Format Corrector improvements
