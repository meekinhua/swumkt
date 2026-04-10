# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Conjoint Statistical UI — Method-Specific Output (Apr 10, 2026)
- Fixed frontend to show method-appropriate statistics instead of one static R²/Intercept template
- MNL: Pseudo R², Log-Likelihood, AIC, p-values, z-values, Std.Error
- Mixed Logit: Respondents, Preference Heterogeneity, Std.Dev per level
- HB: Respondents, Population Std, Individual-level estimates
- OLS: R², Intercept, Coefficient (β)
- Interpretation section adapts per method (Thai language)

### Conjoint Analysis Performance Optimization (Apr 10, 2026)
- Fixed O(n³-n⁴) nested loops in ALL analysis functions (MNL, Mixed Logit, HB, Regression, Counting)
- Replaced linear choice_set search with dict lookup (`_build_conjoint_data_rows` shared helper)
- Added `_calc_importance_from_part_worths` shared helper to eliminate code duplication
- Added ThreadPoolExecutor + 120s timeout for `/statistical-analysis` endpoint
- Benchmark: `calculate_part_worths` 12x faster, MNL handles 620 responses in 4.2s (was failing)

### Kanban Board Features (Previous Sessions)
- Sub-Kanban (Mini Kanban Board) inside Card Modal
- Card Cover Image & Auto Assignee Avatar
- RBAC & Member Management (owner, manager, editor, card_owner, viewer)
- Assign Card to students with permission enforcement
- Mobile & Desktop Responsive Design

## Key Files
- `/app/frontend/src/pages/ConjointResultsPage.js` — Method-specific stat display
- `/app/backend/server.py` — Optimized analysis functions + timeout protection
- `/app/frontend/src/pages/KanbanBoard.js` — Kanban with RBAC

## Prioritized Backlog
- P1: File Attachments via Google Drive (Kanban)
- P2: Verify Auto AI Analysis in "Share as Content" Flow
- P2: Phase 2 Image Caching endpoint
- P3: Board templates (thesis tracking, client work)
- P3: Notifications when assigned to card
- P3: Refactor KanbanBoard.js (>1400 lines)
- P4: Academic Format Corrector
- P5: Customer Behavior Analysis (Quantitative tab)
- P6: Survey Analytics & Dashboard

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
