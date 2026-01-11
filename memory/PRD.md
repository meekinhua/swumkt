# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented (Latest Session - Jan 11, 2026)

### ✅ Sub-Kanban (Mini Kanban Board) Feature
- Mini Kanban Board UI inside Card Modal
- 3 Columns: รอทำ, กำลังทำ, เสร็จแล้ว
- Drag & drop subtasks between sub-columns
- Auto-status update

### ✅ Card Cover Image Feature
- Cover image displayed on Card in Kanban Board
- Cover image in Card Modal with hover controls
- "เพิ่มรูปภาพหน้าปก" for cards without cover

### ✅ Auto Assignee Profile Image (NEW)
- **Automatically show assignee's profile image** on Card when no cover image
- Profile image displayed as circular avatar in center of card
- Small avatar badges in bottom-right showing all assignees

### ✅ Edit Project Feature (NEW)
- Edit Project Modal (name, description, visibility)
- Pencil icon next to project name in header

### ✅ Member Management Feature (NEW)
- **Member Management Modal** with role management
- Search and add members by name/email/student_id
- Role-based access control:
  - **owner**: เจ้าของ Project (จัดการทุกอย่าง)
  - **manager**: ผู้จัดการ/อาจารย์ (จัดการได้ทั้งหมด)
  - **editor**: แก้ไข Cards ทุกใบได้
  - **card_owner**: นิสิต (จัดการได้เฉพาะ Card ตัวเองสร้าง/รับผิดชอบ)
  - **viewer**: ดูได้อย่างเดียว
- Update/Remove member roles
- Permission-based UI (hide/show buttons based on role)

### Backend APIs Added
- `GET /api/projects/{id}/members` - Get project members
- `POST /api/projects/{id}/members` - Add member
- `PUT /api/projects/{id}/members/{user_id}` - Update role
- `DELETE /api/projects/{id}/members/{user_id}` - Remove member
- `GET /api/projects/{id}/available-users` - Search users to add
- Project API now includes `user_role`, `can_manage`, `can_edit_cards`
- Card API now includes `can_edit` per card

### Previous Features (Still Working)
- ✅ Course Management System
- ✅ Advanced Conjoint Analysis
- ✅ Customer Journey Tool with AI fallback
- ✅ Course Export CSV
- ✅ Project Management (Kanban) MVP

## Prioritized Backlog

### P1 (High Priority) - Pending
- File Attachments via Google Drive (placeholder ready)

### P2 (Medium Priority) - Pending
- Phase 2 Caching (Image Endpoint)

### P3+ (Future/Backlog)
- Different board templates (thesis, client work)
- Custom fields for cards
- Customer Behavior Analysis (Quantitative tab)
- Survey Analytics & Dashboard

## Technical Architecture

### Key Files
- `/app/backend/routes/projects.py` - Project Management APIs with Member Management
- `/app/frontend/src/pages/KanbanBoard.js` - Kanban Board with all features

## Credentials
- Admin: admin@swu.ac.th / admin123
