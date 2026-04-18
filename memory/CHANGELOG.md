# CHANGELOG — SWU Marketing Research & Alumni Platform

## 2026-04-18 — AI Interpretation Reliability + Thesis Enhancements
- **AI Interpretation → Background Task**: Converted synchronous AI interpretation call to background task + polling (same pattern as Thesis Export). Prevents 502 proxy timeout when Gemini takes >60s.
  - New endpoint: `GET /api/conjoint/studies/{id}/ai-interpretation-status/{job_id}`
  - Updated both "วิเคราะห์ด้วย AI" button and "แชร์เป็นเนื้อหา" flow to use polling
  - Added `resolved` guard flag to prevent duplicate actions
- **Thesis Export Modal Overflow Fix**: Added `max-h-[90vh] flex flex-col` + `overflow-y-auto` to prevent modal from overflowing on small screens. Footer buttons always visible.
- **Thesis Download Duplicate Fix**: Added `downloaded` flag to polling loop to prevent multiple file downloads (was downloading 9 files at once due to race condition in setInterval callbacks)
- **Thesis Extra Prompt**: Added textarea in Export Modal for custom AI instructions. Backend accepts `extra_prompt` in request, appends to system message. Cache key includes hash of extra_prompt.
- **Thesis Native Equations (OMML)**: Installed `math2docx` + `latex2mathml`. AI instructed to output LaTeX `$$...$$` (display) and `$...$` (inline). `_create_thesis_docx` detects patterns and converts to native Word equations via `math2docx.add_math()`.
- **Thesis SWU iThesis Format**: TH SarabunPSK font set on ALL runs (headings 18pt bold, body 16pt, table 14pt). Margins: left 3.81cm, others 2.54cm. Line spacing 1.5.

## Previous Sessions (Summary)
- Conjoint Analysis: 5 methods, AI interpretation, CSV export, Thesis Word Export
- Kanban: Sub-Kanban, Cover Images, Assignees, RBAC, Mobile Responsive
- Survey Builder, Customer Journey, Content Sharing, Admin Dashboard
- Background task architecture for long-running AI jobs
- `_call_gemini_with_retry` for reliable Gemini calls
