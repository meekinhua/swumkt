# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Generate Prompt Fallback for AI Interpretation (Apr 10, 2026)
- Added `POST /api/conjoint/studies/{id}/generate-prompt` endpoint (returns prompt text with real statistical data, no AI call)
- Fixed `get_method_results` to support MNL/Mixed Logit/HB/OLS (was only counting)
- Frontend: auto-generates prompt on AI failure + always-available "สร้าง Prompt" button
- Prompt includes System Instructions + full analysis data in JSON for each method or compare all 5

### Conjoint Statistical UI — Method-Specific Output (Apr 10, 2026)
- MNL: Pseudo R², Log-Likelihood, AIC, p-values, z-values, Std.Error
- Mixed Logit: Respondents, Preference Heterogeneity, Std.Dev per level
- HB: Respondents, Population Std, Individual-level estimates
- OLS: R², Intercept, Coefficient (β)

### Conjoint Performance Optimization (Apr 10, 2026)
- Fixed O(n³-n⁴) nested loops → 12x faster, handles 620+ responses

### Kanban Board Features (Previous Sessions)
- Sub-Kanban, Cover Image, RBAC, Assign Card, Responsive Design

## Key Files
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
