# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Service Worker Cache Fix (Apr 10, 2026)
- Changed from aggressive cache-first to proper strategies: network-only for API, network-first for HTML, stale-while-revalidate for static assets
- Added SW updatefound auto-reload in index.html
- Cache version bumped v2→v3 to clear stale cache

### Generate Prompt Fallback for AI Interpretation (Apr 10, 2026)
- `POST /api/conjoint/studies/{id}/generate-prompt` — returns prompt with real data
- Fixed `get_method_results` to support all 5 methods
- Auto-generates prompt on AI failure + always-available button

### Conjoint Statistical UI — Method-Specific Output (Apr 10, 2026)
- MNL: Pseudo R², Log-Likelihood, AIC, p-values
- Mixed Logit: Respondents, Heterogeneity, Std.Dev
- HB: Population Std, Individual estimates
- OLS: R², Intercept, Coefficient

### Conjoint Performance Optimization (Apr 10, 2026)
- Fixed O(n³-n⁴) nested loops → 12x faster, handles 620+ responses

### Kanban Board Features (Previous Sessions)
- Sub-Kanban, Cover Image, RBAC, Assign Card, Responsive Design

## Key Files
- `/app/frontend/public/service-worker.js` — SW with proper cache strategies
- `/app/frontend/public/index.html` — SW registration with update handling
- `/app/frontend/src/pages/ConjointResultsPage.js`
- `/app/backend/server.py`

## Prioritized Backlog
- P1: File Attachments via Google Drive (Kanban)
- P2: Verify Auto AI Analysis in "Share as Content"
- P2: Phase 2 Image Caching endpoint
- P3: Board templates, Refactor KanbanBoard.js
- P4: Academic Format Corrector
- P5: Customer Behavior Analysis (Quantitative tab)
- P6: Survey Analytics & Dashboard

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
