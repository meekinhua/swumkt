# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Conjoint Results Page Optimization (Apr 10, 2026)
- Study detail: ?view=summary skips choice_sets (7.2MB→33KB, 212x smaller)
- Results: removed raw responses from payload (200KB→2.8KB)
- Added /export-responses endpoint for CSV export on-demand
- Total page load: 7.4MB→36KB (205x reduction)

### Performance & Scalability Fix (Apr 10, 2026)
- Async bcrypt (login/register no longer blocks event loop)
- JWT-first auth check + in-memory user cache (TTL 5min)
- Conjoint studies list projection: 20MB→1.3KB
- GZip middleware for all responses >500 bytes
- Tested: 20 concurrent logins OK

### Service Worker Cache Fix (Apr 10, 2026)
- Network-only for API, network-first for HTML, stale-while-revalidate for assets

### Generate Prompt Fallback (Apr 10, 2026)
- POST /api/conjoint/studies/{id}/generate-prompt

### Conjoint Statistical UI + Performance (Apr 10, 2026)
- Method-specific stats display (MNL/Mixed Logit/HB/OLS)
- O(n³) nested loop fix → 12x faster

### Kanban Board (Previous Sessions)
- Sub-Kanban, Cover Image, RBAC, Assign Card, Responsive Design

## Prioritized Backlog
- P1: File Attachments via Google Drive (Kanban)
- P2: Verify Auto AI Analysis in "Share as Content"
- P2: Phase 2 Image Caching endpoint
- P3: Board templates, Refactor KanbanBoard.js
- P4: Academic Format Corrector
- P5: Customer Behavior Analysis
- P6: Survey Analytics & Dashboard

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
