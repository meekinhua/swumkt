# 🛑 PAUSED WORK — งานที่พักไว้

> User บอก "เบรกงานอื่นไว้ก่อน มีงานสำคัญแทรก" เมื่อ 2026-04-27
> เมื่อ user กลับมา ให้พิจารณา list นี้ตาม priority

## Phase 2.5 — Alumni Module Enhancements (พร้อมกลับมาทำ)
- 🔴 **Image upload ใน Feed posts** — backend `image_url` field รองรับแล้ว · UI ยังไม่มีปุ่มอัปโหลด
- 🔴 **OG image generator** — share tree milestone (server-side HTML→PNG เช่น `playwright` หรือ `imgkit`)
- 🔴 **Anniversary surprises** — วันเกิดพี่ในสาย → notification + greeting card
- 🔴 **Dynasty Leaderboard** "ตระกูลใหญ่ที่สุดในคณะ" — rank by tree size + max depth + connections
- 🔴 **Activity Stream realtime** — แทน polling 60s ด้วย WebSocket/SSE
- 🟡 **Smart Nudges** (ideja ของ AI agent · user ยังไม่ confirm) — ใช้ activity gap → กระตุ้น "ไม่ได้โพสต์ 7 วัน +5 XP ถ้าโพสต์ตอนนี้"

## Pre-existing Backlog
- 🟡 **Google Drive Integration** สำหรับ Kanban card attachments — ใช้ `integration_playbook_expert_v2`
- 🟡 **Verify Auto AI Analysis** ใน Conjoint "Share as Content" flow (ต้อง create study + ≥30 responses)

## P2/P3 Future
- 🟢 Mystery Box (gacha-lite) reward system
- 🟢 AI-generated trivia สำหรับ heavy users (เมื่อ static questions หมดหลายเดือน)
- 🟢 Refactor `server.py` (>11,700 lines) → split routes
- 🟢 Refactor `alumni.py` (~1,160 lines) → split submodules (auth/tree/invite/gamification)
- 🟢 Phase 2 Caching: image endpoint แทน Base64 embedding

## Earlier Issues (ยังเปิดอยู่)
- AI Rearrange Context Window Fallback — monitor token limits ใน analysis ขนาดใหญ่

## ⚠️ Note สำหรับ next agent
- Test credentials อยู่ใน `/app/memory/test_credentials.md`
- อย่าลืมอ่าน `CHANGELOG.md` สำหรับ context สิ่งที่ทำไปแล้ว
- ถ้า context หาย ให้ดูว่า user message ล่าสุดเป็นเรื่องอะไร → ทำตามนั้นก่อน → แล้วค่อยกลับมา list นี้
