# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented (Apr 10, 2026)

### AI switched to Gemini
- Changed from openai/gpt-4o-mini (502 errors) to gemini/gemini-2.5-flash
- AI interpretation works: 13K chars Thai response, cached after first call

### Analysis Caching System
- Statistical + AI results cached in MongoDB (analysis_cache collection)
- Auto-invalidate on new response, switch methods instantly
- First MNL: 1.76s → cached: 0.12s | First AI: 45s → cached: 0.12s

### Performance Optimizations
- Async bcrypt, JWT-first auth, user cache, GZip
- Studies list: 20MB→1.3KB | Results page: 7.4MB→36KB
- O(n³) analysis fix: 12x faster

### Service Worker Cache Fix
- Proper strategies per request type, auto-reload on update

### Conjoint Features
- Method-specific stats display, Prompt fallback for AI

### Kanban Board (Previous)
- Sub-Kanban, Cover Image, RBAC, Assign Card, Responsive

## Prioritized Backlog
- P1: File Attachments via Google Drive (Kanban)
- P2: Verify AI "Share as Content" flow
- P2: Phase 2 Image Caching
- P3: Board templates, Refactor KanbanBoard.js
- P4: Academic Format Corrector
- P5: Customer Behavior Analysis
- P6: Survey Analytics & Dashboard

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
