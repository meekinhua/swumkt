# PRD - SWU Marketing Research Tool

## Original Problem Statement
A comprehensive marketing research and academic tool for Srinakharinwirot University (SWU). Features include Conjoint Analysis, Survey Management, Customer Journey Mapping, Kanban Project Management with RBAC, and AI-powered content generation.

## Core Requirements
- Conjoint Analysis with multiple statistical methods (Counting, MNL, Mixed Logit, HB, Linear Regression)
- AI interpretation of results via Gemini 2.5 Flash
- Export capabilities (CSV, Word thesis format)
- Kanban Project Management with sub-kanban, RBAC, member management

## What's Been Implemented

### Conjoint Analysis (COMPLETE)
- Full conjoint study creation and response collection
- 5 statistical analysis methods
- AI interpretation with Gemini 2.5 Flash (with MongoDB caching)
- Generate Prompt fallback for external AI usage
- CSV export for raw response data
- **Thesis Word Export with method & chapter selection:**
  - User selects statistical method (Counting, MNL, OLS, Mixed Logit, HB) via modal
  - User selects chapters: Ch3 (Methodology), Ch4 (Results), Ch5 (Discussion)
  - Each method includes detailed statistical equations (utility functions, Pseudo R², AIC, test criteria)
  - Background job + polling pattern for reliable generation
  - Summarized prompts (3K chars vs 50K+ raw JSON) for reliable Gemini completion
  - Retry helper with exponential backoff for 502 errors
- Performance optimized: nested loops removed, payload reduced from 7.4MB to 36KB
- Async bcrypt for event-loop safety

### AI Reliability (FIXED Apr 2026)
- Root cause: proxy 60s timeout + oversized prompts
- Summarized prompts, split chapter generation, retry with backoff
- All AI calls now complete reliably in 30-45s

### Kanban Project Management (COMPLETE)
- Full CRUD with drag-and-drop, Sub-Kanban, Cover Images, Assignees
- RBAC: Owner, Manager, Editor, Card Owner (Student), Viewer
- Mobile & Desktop responsive

## Architecture
- Frontend: React + TailwindCSS + Shadcn/UI
- Backend: FastAPI + Python + MongoDB
- AI: Gemini 2.5 Flash via emergentintegrations
- Word generation: python-docx

## Prioritized Backlog
### P1
- Google Drive Integration for Kanban card attachments
- Verify Survey Image Display Fix
### P2
- Phase 2 Caching (Image Endpoint)
- Verify Auto AI Analysis in "Share as Content"
### P3+
- Expand Kanban features, Refactor server.py, Customer Behavior Analysis, Survey Analytics

## Key API Endpoints (Thesis)
- POST /api/conjoint/studies/{id}/export-thesis — {method, chapters[]}
- GET /api/conjoint/studies/{id}/export-thesis-status/{job_id}
- GET /api/conjoint/studies/{id}/export-thesis-download?cache_key=X

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
