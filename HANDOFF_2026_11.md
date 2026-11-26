# HANDOFF 2026-11 — External-LLM mode · Conjoint/Brand Equity audit · สายเทค alumni · CLI

Base `meekintubeDone` @ `0dbb9e5` → branch `claude/vigilant-brown-g695x1`.
Details: `memory/PLAN_2026_11_EXTERNAL_LLM.md`, `memory/LLM_EXTERNAL_CONTRACT.md`,
`memory/CONJOINT_AUDIT_2026_11.md`, `memory/BRAND_EQUITY_AUDIT_2026_11.md`,
`memory/ALUMNI_CONTRACT_2026_11.md`.

## Before / at deploy
1. **System LLM is OFF by default** after deploy. Turn on from `/admin/settings` → "AI ของระบบ (LLM)",
   or set env `SYSTEM_LLM_DEFAULT=on`. Do NOT remove `EMERGENT_LLM_KEY`: object storage uses it too.
2. Set `ALUMNI_OPTOUT_SALT=<long random>` in the backend env (a warning is logged if unset).
3. First view of each study recomputes: conjoint `ANALYSIS_CACHE_VERSION` 5→6, Brand Equity
   `BE_ANALYSIS_SCHEMA_VERSION` 1→2. Identity, Awareness and α change for existing BE studies.
4. Site settings to fill: `privacy.contact`, `privacy.status_note`, `privacy.updated` (the /privacy page).
5. CLI: `python backend/scripts/mint_api_key.py --preset operator` on the server, then
   `SWUMKT_API_KEY=… python backend/scripts/sitectl.py llm status`. See `.claude/skills/site-edit/SKILL.md`.

## Verified here (no real MongoDB, no real LLM)
- `pytest` 20 suites: 667 passed, 65 skipped (skips need a live server).
- `CI=true yarn build`: passes.
- Browser (Playwright, `backend/scripts/dev_sim.py`): 8 journeys at 390/1280 px.

## Check after deploy
- A real system-LLM call when the switch is ON (the guard was tested with a fake `emergentintegrations`).
- Google login keeps `?redirect=`.
- Indexes for the new alumni collections are created lazily on first use.

## Local run without Mongo/LLM
`pip install -r backend/requirements-dev.txt` then `python backend/scripts/dev_sim.py` (see docstring).

## Co-hosted sub-apps
SwuDorm (separate project) is reserved at `/api/swudorm/` and auto-mounts from `backend/swudorm_app/asgi.py` or `backend/swudorm_static/`. Rules and guarantees: `SUBAPPS.md`, registry `backend/lib/subapps.py`.
