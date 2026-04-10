# PRD - SWU Marketing Research Tool

## Original Problem Statement
A comprehensive marketing research and academic tool for Srinakharinwirot University (SWU). Features include Conjoint Analysis, Survey Management, Customer Journey Mapping, Kanban Project Management with RBAC, and AI-powered content generation.

## Core Requirements
- Conjoint Analysis with multiple statistical methods (Counting, MNL, Mixed Logit, HB, Linear Regression)
- AI interpretation of results via Gemini 2.5 Flash
- Export capabilities (CSV, Word thesis format)
- Kanban Project Management with sub-kanban, RBAC, member management
- Survey creation and response collection
- Customer Journey mapping
- Content sharing system

## What's Been Implemented

### Conjoint Analysis (COMPLETE)
- Full conjoint study creation and response collection
- 5 statistical analysis methods: Counting, MNL, Mixed Logit, Hierarchical Bayes, Linear Regression
- Method-specific UI metrics (Pseudo R², Utility Scale, etc.)
- AI interpretation with Gemini 2.5 Flash (with MongoDB caching)
- Generate Prompt fallback for external AI usage
- CSV export for raw response data
- **NEW (Apr 2026):** AI-powered Thesis Word Export (Chapter 4 & 5) using background jobs + polling
- Performance optimized: nested loops removed, payload reduced from 7.4MB to 36KB
- Async bcrypt for event-loop safety

### Kanban Project Management (COMPLETE)
- Full CRUD with drag-and-drop (react-beautiful-dnd)
- Sub-Kanban (Mini Kanban) inside each card
- Cover Images & Assignee auto-avatar display
- RBAC: Owner, Manager, Editor, Card Owner (Student), Viewer
- Mobile & Desktop responsive design
- Member Management Modal

### Service Worker & Caching (COMPLETE)
- Network-first strategy for API calls
- Cache-first for static assets
- Fixed Ctrl+F5 freeze issue

## Architecture
- Frontend: React + TailwindCSS + Shadcn/UI
- Backend: FastAPI + Python + MongoDB
- AI: Gemini 2.5 Flash via emergentintegrations
- Word generation: python-docx

## Prioritized Backlog

### P1
- Google Drive Integration for Kanban card attachments
- Verify Survey Image Display Fix

### P2
- Phase 2 Caching (Image Endpoint)
- Verify Auto AI Analysis in "Share as Content" Flow

### P3
- Expand Kanban Board features (templates, custom fields)
- Verify raw data storage in Customer Journey "Share as Content"
- Android Push Notification vibrate option

### P4+
- Revisit Academic Format Corrector
- Customer Behavior Analysis (Quantitative tab)
- Survey Analytics & Dashboard
- Refactor server.py (>11K lines) into modular routes

## Known Issues
- AI Rearrange Context Window Fallback (recurring)
- Survey Image Display (testing pending, recurrence count: 1)
- server.py is >11K lines - needs modular refactor

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
