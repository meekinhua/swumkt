# PRD - SWU Marketing Research Tool

## Original Problem Statement
A comprehensive marketing research and academic tool for Srinakharinwirot University (SWU).

## What's Been Implemented

### Conjoint Analysis (COMPLETE)
- 5 statistical methods: Counting, MNL, Mixed Logit, HB, Linear Regression
- AI interpretation via Gemini 2.5 Flash with caching
- Generate Prompt fallback
- CSV export
- **Thesis Word Export** with multi-method & chapter selection:
  - Select 1 or more methods (checkboxes, min 1)
  - Select chapters 3 (Methodology), 4 (Results), 5 (Discussion)
  - Detailed statistical equations per method (utility functions, R², AIC, Pseudo R², Wald test etc.)
  - Multi-method → Ch4 includes comparison table
  - Background job + polling, retry with backoff
  - **Extra Prompt** input for custom AI instructions (appended to system message)
  - **Native Word Equations (OMML)** via math2docx: LaTeX $...$ and $$...$$ converted to editable Word equations
  - **SWU iThesis Format**: TH SarabunPSK font (16pt body, 18pt headings), margins (left 3.81cm, others 2.54cm), 1.5 line spacing
- AI reliability: summarized prompts (3K vs 50K), split chapter generation, retry helper

### Kanban Project Management (COMPLETE)
- Sub-Kanban, Cover Images, Assignees, RBAC, Responsive

## Key API Endpoints (Thesis)
- POST /api/conjoint/studies/{id}/export-thesis — {methods: [...], chapters: [...], extra_prompt: "..."}
- GET /api/conjoint/studies/{id}/export-thesis-status/{job_id}
- GET /api/conjoint/studies/{id}/export-thesis-download?cache_key=X

## Backlog
- P1: Google Drive Integration for Kanban, Survey Image Display Fix
- P2: Phase 2 Caching, Auto AI Analysis verification
- P3+: Kanban templates, Refactor server.py, Survey Analytics, Customer Behavior Analysis

## Credentials
- Admin: admin@swu.ac.th / admin123
- Student: student1@swu.ac.th / student123
