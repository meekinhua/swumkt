# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Performance & Scalability Fix (Apr 10, 2026)
- Async bcrypt (login/register no longer blocks event loop)
- JWT-first auth check + in-memory user cache (TTL 5min)
- Conjoint studies list projection: 20MB → 1.3KB
- GZip middleware for all responses >500 bytes
- MongoDB connection pool already configured (50 max, 10 min)
- Tested: 20 concurrent logins OK, 20 concurrent API calls OK

### Service Worker Cache Fix (Apr 10, 2026)
- Network-only for API, network-first for HTML, stale-while-revalidate for assets
- Auto-reload on SW update

### Generate Prompt Fallback (Apr 10, 2026)
- POST /api/conjoint/studies/{id}/generate-prompt
- Auto-generates on AI failure + always-available button

### Conjoint Statistical UI + Performance (Apr 10, 2026)
- Method-specific stats display (MNL/Mixed Logit/HB/OLS)
- O(n³) nested loop fix → 12x faster, handles 620+ responses

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
