# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented (Latest Session - Jan 11, 2026)

### ✅ Sub-Kanban (Mini Kanban Board) Feature
**เสร็จสมบูรณ์และทดสอบแล้ว**

- **Backend APIs:**
  - `POST /api/projects/{id}/cards/{card_id}/init-sub-columns` - Initialize sub-columns for existing cards
  - `PUT /api/projects/{id}/cards/{card_id}/subtasks/{subtask_id}/move` - Move subtask between sub-columns
  - Extended subtask model with `sub_column_id` field
  - Default sub-columns: รอทำ (gray), กำลังทำ (orange), เสร็จแล้ว (green)

- **Frontend:**
  - Mini Kanban Board UI inside Card Modal
  - Drag & drop support for subtasks between sub-columns
  - Toggle button to switch between List view and Kanban view
  - Auto-status update when subtask is moved (pending → in_progress → done)

- **Test Results:** 15/15 backend tests passed, all frontend flows verified

### Previous Features (Still Working)
- ✅ Course Management System
- ✅ Advanced Conjoint Analysis (NCA, fsQCA, IPMA)
- ✅ Customer Journey Tool with AI fallback
- ✅ AI Rearrange & Behavior Analysis with fallback
- ✅ Course Export CSV
- ✅ Project Management (Kanban) MVP

## Core User Personas
- **Admin/Instructor:** สร้างและจัดการ Projects, Courses
- **Student:** เข้าร่วม Projects, ทำ assignments
- **Researcher:** ใช้เครื่องมือวิเคราะห์ตลาด

## Prioritized Backlog

### P0 (Critical) - ✅ DONE
- Sub-Kanban feature inside cards

### P1 (High Priority) - Pending
- File Attachments via Google Drive (placeholder ready)
- Verify Survey Image Display Fix

### P2 (Medium Priority) - Pending
- Phase 2 Caching (Image Endpoint)
- Verify Auto AI Analysis in "Share as Content"

### P3+ (Future/Backlog)
- Role-based access for Kanban boards
- Different board templates (thesis, client work)
- Custom fields for cards
- Android Push Notification vibrate option
- Customer Behavior Analysis (Quantitative tab)
- Survey Analytics & Dashboard

## Technical Architecture

### Key Files
- `/app/backend/routes/projects.py` - Project Management APIs
- `/app/frontend/src/pages/KanbanBoard.js` - Kanban Board with Sub-Kanban
- `/app/frontend/src/pages/ProjectsPage.js` - Projects list

### Database Collections
- `projects` - Project documents with columns
- `project_cards` - Cards with sub_columns and subtasks
- `users` - User accounts

### Test Coverage
- Backend: pytest tests at `/app/tests/test_projects_api.py`
- Test reports: `/app/test_reports/`

## Credentials
- Admin: admin@swu.ac.th / admin123
