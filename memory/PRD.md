# SWUMKT Portal - Product Requirements Document

## Original Problem Statement
ระบบ SWUMKT Portal สำหรับมหาวิทยาลัย ศรีนครินทรวิโรฒ (SWU) ประกอบด้วยเครื่องมือวิจัยตลาด, Course Management, Conjoint Analysis และ Project Management

## What's Been Implemented (Latest Session - Jan 11, 2026)

### ✅ Sub-Kanban (Mini Kanban Board)
- Mini Kanban Board UI inside Card Modal
- 3 Columns: รอทำ, กำลังทำ, เสร็จแล้ว
- Drag & drop subtasks between sub-columns

### ✅ Card Cover Image & Auto Assignee Profile
- Cover image on Card in Kanban Board
- Auto-show assignee's profile image when no cover

### ✅ Project & Member Management
- Edit Project Modal
- Member Management with role-based access

### ✅ Role-Based Permission System
- **owner/manager**: จัดการทุกอย่าง
- **editor**: แก้ไข Cards ทุกใบ
- **card_owner**: จัดการได้เฉพาะ Card ตัวเอง + ที่ถูก Assign
- **viewer**: ดูเท่านั้น

### ✅ Assign Card Feature (NEW)
- **Manager สามารถ Assign Card ให้นิสิตได้**
- **นิสิตที่ถูก Assign สามารถแก้ไข Card ได้** (แม้ไม่ได้สร้างเอง)
- Assignee section ใน Card Modal พร้อมค้นหาและเพิ่ม/ลบ
- แสดง Avatar ของ Assignees บน Card

### ✅ Responsive Design (NEW)
- **Mobile-first responsive layout**
- Header: ปุ่มย่อลง แสดงเฉพาะไอคอนบน mobile
- Kanban Board: Columns แคบลง scroll แนวนอน
- Card Modal: เต็มจอบน mobile, sticky header
- All components รองรับ touch และ scroll
- Tested on iPhone SE (375px) และ Desktop (1920px)

## Test Results
- ✅ Student creates Card → can_edit=True
- ✅ Student edits own Card → Success
- ✅ Manager assigns Student to other Card → can_edit=True
- ✅ Student edits assigned Card → Success
- ✅ Student cannot edit unassigned Cards → 403 Error
- ✅ Mobile/Desktop views → Working

## Prioritized Backlog
- P1: File Attachments via Google Drive
- P2: Board templates (thesis, client work)
- P3: Notifications when assigned

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
