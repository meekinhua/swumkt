# PLAN 2026-11 — External-LLM mode · Conjoint/Brand-Equity readiness · operate-from-CLI

Base: `meekintubeDone` @ `0dbb9e5`, merged into `claude/vigilant-brown-g695x1`.
Out of scope: meekintube, yolo, music/TV apps (do not touch `backend/meekintube_static`,
`meekintube_tv`, `backend/yolo_static`).

## Goals (owner's request)

1. Conjoint + Brand Equity tools: correct by academic standards, easy for both
   practitioners and thesis students, good UX/UI.
2. Stop paying for the system LLM. Every AI feature must have a path where the
   user runs the prompt in their OWN LLM (ChatGPT / Claude / Gemini …) and either
   pastes the result back or just takes the prompt pack away (e.g. thesis export).
3. Admin switch: allow the system LLM, or force users outside.
4. The owner can operate the platform from Claude Code (CLI), not only the web UI.

## Local dev environment (already set up in this container)

- Python venv: `/home/user/venv/bin/python` (requirements installed, minus
  `emergentintegrations`, which is not on a public index; `mongomock-motor` added).
- `/app` is a symlink to the repo (tests `chdir("/app/backend")`).
- Baseline: `cd backend && /home/user/venv/bin/python -m pytest tests/test_conjoint_audit_2026_08.py tests/test_brand_equity_audit_2026_08.py tests/test_thesis_export_academic_2026_08.py -q` → 103 passed.
- Frontend: `cd frontend && yarn install` done. Build check: `CI=true yarn build`.
- No real MongoDB and no LLM key here. Do not try to download mongod (blocked).
- Chromium + Playwright are preinstalled (`require('playwright')`), do NOT install.

## Ground rules for every agent

- **Do not run git add/commit/push/stash/checkout.** The lead commits. Others are
  editing the same working tree concurrently — touch ONLY the files you own
  (listed in your brief). If you need a change in a file you do not own, write
  the request in your final report instead of making it.
- No new paid services. No new heavy dependencies; a new dependency needs a
  strong reason and must be added to `backend/requirements.txt` / `package.json`.
- Every behaviour change gets a pytest test that needs neither Mongo nor an LLM
  key (pure functions, or FastAPI TestClient with mongomock-motor).
- If a fix changes numbers a user has already seen, bump the relevant cache
  version (`ANALYSIS_CACHE_VERSION`, `BE_ANALYSIS_SCHEMA_VERSION`) and say so.
- UI text is Thai-first (the platform is Thai); keep the existing design system
  (`design_guidelines.json`, existing component classes). Keep `data-testid`s.
- Report honestly: what was verified by execution, what was not.

## A. System-LLM policy (the admin switch)

`backend/lib/llm_policy.py` — single source of truth.

Stored in Mongo collection `platform_settings`, doc `{id: "llm"}`:

```json
{ "id": "llm",
  "system_llm_enabled": false,
  "features": { "<group-or-feature-key>": true|false },
  "admin_bypass": false,
  "external_hint": "free text shown to users, optional",
  "updated_at": "...", "updated_by": "..." }
```

Effective(feature) = `features[feature]` ?? `features[group(feature)]` ??
`system_llm_enabled`. If `admin_bypass` and the caller is ADMIN → allowed.
**Default when the doc does not exist: OFF** (owner does not want to pay); env
`SYSTEM_LLM_DEFAULT=on` flips the default. Policy cached in-process ≤ 15 s.

Feature registry (key → group):

| group | keys |
|---|---|
| `research` | `conjoint.interpretation`, `conjoint.qualitative`, `be.ai_analyze`, `be.questions`, `cv.ai`, `journey.ai` |
| `thesis` | `conjoint.thesis`, `be.thesis` |
| `images` | `conjoint.images`, `be.visual_identity`, `cv.image`, `cms.image`, `content.image` |
| `content` | `cms.ai`, `survey.ai`, `content.ai`, `translate` |
| `documents` | `docs.format`, `docs.citation`, `docs.ref_extract` |

(The foundation agent may add keys it finds; it must list the final registry in
`memory/LLM_EXTERNAL_CONTRACT.md`.)

Python interface (fixed — other agents code against it):

```python
from lib import llm_policy

llm_policy.init(db)                                    # server.py, once
await llm_policy.require_system_llm("conjoint.interpretation", user)  # raises HTTPException 409
await llm_policy.is_system_llm_allowed("be.thesis", user) -> bool
llm_policy.SystemLLMDisabled                           # raised by the central guard
```

`require_system_llm` failure → HTTP **409** with
`{"detail": {"code": "llm_external_only", "feature": "...", "message": "<Thai>", "hint": "<external_hint>"}}`.
A passing `require_system_llm` marks the current context (contextvar) as granted.

Central guard (defence in depth, so nothing is ever billed by accident): the
existing monkey-patch in `server.py` (`_install_llm_concurrency_patch`) and the
image-generation entry points refuse with `SystemLLMDisabled` unless the policy
is globally on with no relevant override, or the context carries a grant.
A global exception handler turns `SystemLLMDisabled` into the same 409 body.

HTTP:
- `GET  /api/platform/llm-policy` — any logged-in user: `{system_llm_enabled, features (effective per key for this user), external_hint, registry}`.
- `PUT  /api/platform/llm-policy` — admin (or API key with scope `platform.settings`): partial update.
- `GET  /api/health` — `{status:"ok", version, time}`; no auth.

## B. External-LLM workflow (uniform convention)

Always available, whatever the switch says (a user may prefer their own LLM).
For an AI feature whose system-LLM endpoint is `{B}`:

- `GET|POST {B}/external-prompt` → 
  ```json
  { "feature": "conjoint.interpretation", "title": "…", "instructions_th": "ขั้นตอน…",
    "expected_format": "markdown" | "json",
    "parts": [ { "key": "main", "title": "…", "system_prompt": "…", "prompt": "…",
                 "json_example": "… (only for json)" } ],
    "filename": "conjoint-<study>-interpretation-prompt.md" }
  ```
  The prompt is the SAME prompt the system would send, with the data already
  embedded, built by the same function (no drift between system and external).
  It must be self-contained: a user pastes it into any chat LLM and gets a usable answer.
- `POST {B}/external-import` body `{ "part_key": "main", "content": "<pasted>", "model_label": "ChatGPT …" }`
  → validates (JSON features: tolerant parsing — strip code fences, find the JSON
  object; clear Thai error on failure), stores in the SAME place the system-LLM
  result goes, plus `source: "external"`, `model_label`, `imported_at`,
  `imported_by`; returns what the system endpoint would have returned so the UI
  renders identically.
- Thesis export: `{thesis}/external-pack` → a downloadable Markdown (or zip) pack:
  study facts + every computed table + one prompt per chapter + how-to. Optional
  `{thesis}/external-import` to bring chapters back and render the .docx with the
  existing renderer. A thesis/export that contains AI-written text carries an
  AI-use disclosure line (tool = model_label or "system LLM").
- Images: no pasted result; the UI shows the generated prompt (copy) and the
  existing upload endpoint.

Exact endpoints per module are recorded by the backend agents in
`memory/LLM_EXTERNAL_CONTRACT.md` (one section each) — the frontend agents read it.

## C. Frontend shared pieces

- `frontend/src/hooks/useLlmPolicy.js` — `{ loading, systemAllowed(feature), hint }` (react-query, 60 s).
- `frontend/src/components/ExternalAiDialog.jsx` — props
  `{ open, onOpenChange, promptRequest: {method, url, data?}, importUrl, onImported, title }`:
  step 1 show instructions + each part's prompt with Copy / Download .md;
  step 2 paste result (+ optional "ใช้ AI ตัวไหน" label) → import → `onImported(data)`.
- `frontend/src/components/AiActionButton.jsx` — one button that, per policy,
  either calls the system action or opens the external dialog; when both are
  available offers a small menu ("ใช้ AI ของระบบ" / "ใช้ AI ของฉันเอง").
- Admin page section (in `/admin/settings`): master switch + per-group switches +
  admin-bypass + hint text.
- Axios: a 409 `llm_external_only` anywhere shows one consistent Thai toast.

## D. Operate from CLI

Extend `backend/scripts/sitectl.py` (+ `.claude/skills/site-edit/SKILL.md`):
`sitectl llm status|on|off|set <key> on|off|default|hint "<text>"`,
`sitectl research list|show|prompt|import …` for conjoint / brand-equity studies
(read results, fetch a prompt pack, import an AI result). New API-key scopes:
`platform.settings`, `research.read`, `research.ai`. `/api/admin/*` stays HARD_DENY.

## Work packages

| WP | Model | Owns (may edit) |
|---|---|---|
| WP1 Foundation | opus | `backend/lib/llm_policy.py`, `backend/server.py`, `backend/lib/api_keys.py`, `backend/scripts/dev_sim.py`, `backend/scripts/mint_api_key.py`, `backend/tests/test_llm_policy.py`, `backend/.env.example`, `memory/LLM_EXTERNAL_CONTRACT.md` (§policy) |
| WP2 Conjoint backend | opus | `backend/routes/conjoint.py`, new `backend/lib/conjoint_*.py`, `backend/tests/test_conjoint_2026_11*.py`, contract §conjoint, `memory/CONJOINT_AUDIT_2026_11.md` |
| WP3 Brand Equity backend | opus | `backend/routes/brand_equity.py`, `be_thesis_*.py`, `thesis_renderer.py`, new `backend/lib/be_*.py`, `backend/tests/test_brand_equity_2026_11*.py`, contract §brand-equity, `memory/BRAND_EQUITY_AUDIT_2026_11.md` |
| WP4 Frontend shared + admin | sonnet | `frontend/src/hooks/useLlmPolicy.js`, `frontend/src/components/ExternalAiDialog.jsx`, `AiActionButton.jsx`, `frontend/src/pages/AdminSettings.js`, `AdminAISettings.js`, `frontend/src/App.js`, `frontend/src/lib/*` axios bits |
| WP5 Other backend call sites + CLI | sonnet (after WP1) | `backend/routes/cms.py`, `customer_value.py`, `journey*.py`, `backend/lib/{doc_formatter,citation_*,ref_extract}.py`, `backend/scripts/sitectl.py`, `.claude/skills/site-edit/SKILL.md`, `backend/tests/test_sitectl_llm.py`; in `server.py` ONLY add `require_system_llm` lines inside existing endpoints (after WP1 is done) |
| WP6 Conjoint frontend | sonnet (after WP2+WP4) | `frontend/src/pages/Conjoint*.js`, `frontend/src/pages/conjoint/*` |
| WP7 Brand Equity frontend | sonnet (after WP3+WP4) | `frontend/src/pages/brand-equity/*` |
| WP8 Platform structure | sonnet (after WP4) | `frontend/src/pages/MarketResearch.js`, `Dashboard.js`, nav/topbar components, other tools' pages (graceful `llm_external_only`), dead files, `README.md`, `frontend/.env.example` |
| WP9 Verification | opus | review everything, run tests/build, browser smoke with `dev_sim.py`, fix |
