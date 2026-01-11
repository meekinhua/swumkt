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

### ✅ Card Cover Image Feature (NEW)
**เสร็จสมบูรณ์**

- **Backend APIs:**
  - `POST /api/projects/{id}/cards/{card_id}/cover-image` - Upload cover image (base64 or URL)
  - `DELETE /api/projects/{id}/cards/{card_id}/cover-image` - Remove cover image
  - Extended card model with `cover_image` field

- **Frontend:**
  - Cover image displayed on Card in Kanban Board
  - Cover image displayed full-width in Card Modal
  - Hover overlay with "เปลี่ยนรูป" and "ลบรูป" buttons
  - "เพิ่มรูปภาพหน้าปก (เช่น รูปนิสิต)" for cards without cover
  - Image icon indicator on cards with covers
  - File validation (image types only, max 5MB)

- **Test Results:** Backend APIs verified, Frontend UI working

### Previous Features (Still Working)
- ✅ Course Management System
- ✅ Advanced Conjoint Analysis (NCA, fsQCA, IPMA)
- ✅ Customer Journey Tool with AI fallback
- ✅ AI Rearrange & Behavior Analysis with fallback
- ✅ Course Export CSV
- ✅ Project Management (Kanban) MVP

## Prioritized Backlog

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
- `/app/backend/routes/projects.py` - Project Management APIs (Cards, Subtasks, Cover Image)
- `/app/frontend/src/pages/KanbanBoard.js` - Kanban Board with Sub-Kanban & Cover Image
- `/app/frontend/src/pages/ProjectsPage.js` - Projects list

### Database Collections
- `projects` - Project documents with columns
- `project_cards` - Cards with sub_columns, subtasks, and cover_image
- `users` - User accounts

### Test Coverage
- Backend: pytest tests at `/app/tests/test_projects_api.py`
- Test reports: `/app/test_reports/`

## Credentials
- Admin: admin@swu.ac.th / admin123
