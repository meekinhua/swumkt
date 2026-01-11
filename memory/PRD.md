# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented (Latest Session - Jan 11, 2026)

### ✅ Sub-Kanban (Mini Kanban Board) Feature
- Mini Kanban Board UI inside Card Modal
- 3 Columns: รอทำ, กำลังทำ, เสร็จแล้ว
- Drag & drop subtasks between sub-columns

### ✅ Card Cover Image Feature
- Cover image displayed on Card in Kanban Board
- Cover image in Card Modal with hover controls

### ✅ Auto Assignee Profile Image
- Automatically show assignee's profile image on Card when no cover image
- Profile image displayed as circular avatar
- Small avatar badges showing all assignees

### ✅ Edit Project Feature
- Edit Project Modal (name, description, visibility)
- Pencil icon next to project name in header

### ✅ Member Management Feature
- Member Management Modal with role management
- Search and add members by name/email/student_id

### ✅ Role-Based Permission System (NEW - COMPLETE)
**Roles:**
- **owner**: เจ้าของ Project (จัดการทุกอย่าง)
- **manager**: ผู้จัดการ/อาจารย์ (จัดการได้ทั้งหมด)
- **editor**: แก้ไข Cards ทุกใบได้
- **card_owner**: นิสิต (จัดการได้เฉพาะ Card ที่ตัวเองสร้างหรือได้รับมอบหมาย)
- **viewer**: ดูได้อย่างเดียว

**Permission Checking:**
- Backend validates permissions on create/update/delete operations
- Cards return `can_edit` flag per card based on user's role
- Project returns `can_manage`, `can_edit_cards`, `can_create_cards` flags

**UI Behavior:**
- Edit/Delete buttons hidden for cards user cannot edit
- Lock icon + warning message shown on cards user cannot edit
- "เพิ่ม Card" button visible only for users who can create cards
- Edit Project button visible only for managers/owners

**Test Results:**
- Student (card_owner) can create new cards ✅
- Student can edit/delete their own cards ✅
- Student CANNOT edit cards created by others ✅
- Backend returns proper error message when permission denied ✅

## Prioritized Backlog

### P1 (High Priority) - Pending
- File Attachments via Google Drive

### P2+ (Future/Backlog)
- Different board templates (thesis, client work)
- Custom fields for cards
- Notifications when assigned to card

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
