# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented

### Analysis Caching System (Apr 10, 2026)
- Statistical analysis results cached in MongoDB (analysis_cache collection)
- AI interpretation results cached separately
- Auto-invalidate on new response submission
- Switching between methods is instant from cache (1.76s→0.12s)
- AI timeout set to 45s with proper error message

### Results Page Optimization (Apr 10, 2026)
- Study detail: ?view=summary (7.2MB→33KB)
- Results: no raw responses (200KB→2.8KB)
- /export-responses endpoint for CSV on-demand

### Performance & Scalability (Apr 10, 2026)
- Async bcrypt, JWT-first auth, user cache, GZip
- Studies list projection: 20MB→1.3KB

### Service Worker Cache Fix (Apr 10, 2026)
- Proper caching strategies per request type

### Conjoint Statistical UI + Performance (Apr 10, 2026)
- Method-specific stats, O(n³) fix, Prompt fallback

### Kanban Board (Previous Sessions)
- Sub-Kanban, Cover Image, RBAC, Assign Card, Responsive

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
