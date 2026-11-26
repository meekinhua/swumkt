# LLM External Contract (plan 2026-11)

Shared contract between backend and frontend agents. Each section is owned by
one work package (see `memory/PLAN_2026_11_EXTERNAL_LLM.md`).

## Policy

_Owner: WP1. Code: `backend/lib/llm_policy.py`, guard + endpoints in `backend/server.py`,
scopes in `backend/lib/api_keys.py`. Tests: `backend/tests/test_llm_policy.py`._

### Python interface (final)

```python
from lib import llm_policy
llm_policy.init(db)                                   # server.py does this once
await llm_policy.require_system_llm("conjoint.interpretation", user)  # raises HTTPException(409)
await llm_policy.is_system_llm_allowed("be.thesis", user) -> bool
llm_policy.SystemLLMDisabled        # raised by the central guard; .feature, .detail
llm_policy.FEATURES                 # {feature_key: group_key}
llm_policy.GROUPS                   # {group_key: Thai label}
llm_policy.registry()               # what GET /api/platform/llm-policy returns as "registry"
await llm_policy.get_policy()       # normalized stored policy (cached <= 15 s)
await llm_policy.update_policy(patch, updated_by)   # validates, writes, invalidates cache
llm_policy.validate_update(patch)   # ValueError on bad input
```

`user` may be the server `User` model, a dict with `role`, or omitted (then the
user captured by `get_current_user` / `get_current_user_optional` for this
request is used). The module imports with no db: until `init()` the default
policy is used. Unit tests of other modules need nothing special.

### Stored document

Mongo `platform_settings`, `{id: "llm"}`:

```json
{"id": "llm", "system_llm_enabled": false, "features": {"images": false, "be.thesis": true},
 "admin_bypass": false, "external_hint": "ใช้ ChatGPT ของคุณเอง",
 "updated_at": "2026-11-26T09:31:01+00:00", "updated_by": "admin@swu.ac.th"}
```

Default when the doc does not exist: **OFF**; env `SYSTEM_LLM_DEFAULT=on` makes
the default ON (a stored `system_llm_enabled` always wins over the env).
Cache: per process, 15 s; `update_policy` invalidates it in the process that
served the PUT. With several workers, the others see the change within 15 s.

### Registry (final)

| group | feature keys |
|---|---|
| `research` | `conjoint.interpretation`, `conjoint.qualitative`, `be.ai_analyze`, `be.questions`, `cv.ai`, `journey.ai`, `behavior.ai`*, `perception.ai`* |
| `thesis` | `conjoint.thesis`, `be.thesis` |
| `images` | `conjoint.images`, `be.visual_identity`, `cv.image`, `cms.image`, `content.image`, `behavior.image`*, `perception.image`* |
| `content` | `cms.ai`, `survey.ai`, `content.ai`, `translate` |
| `documents` | `docs.format`, `docs.citation`, `docs.ref_extract`, `docs.journal_finder`* |

`*` = added by WP1 (server.py endpoints `/api/generate-behavior-*`, `/api/perception/*`,
`/api/journal-finder` that the plan's table did not cover).

### Semantics (final)

`effective(feature, user)` =
1. `admin_bypass` and user is ADMIN → **allowed**;
2. else `features[feature]` if set; else `features[group(feature)]` if set; else `system_llm_enabled`.
   Unknown/None feature → master switch.

**Central guard** (every billed entry point: `LlmChat.send_message`,
`LlmChat.send_message_multimodal_response`, `LlmChat.send_message_async` if present,
`OpenAIImageGeneration.generate_images`, `emergentintegrations.image.generate_image`).
A call is billed only if some rule allows it, checked in this order:

1. the context carries a **grant** (a `require_system_llm` passed earlier in this
   request or in the code that spawned this task/thread) → allowed;
2. else the request's **route feature** (path → feature map,
   `llm_policy.ROUTE_FEATURES`, set by `RouteFeatureMiddleware`) is known →
   `effective(route_feature, user)`;
3. else (unmapped path, or no request at all, e.g. a startup job): image calls →
   `effective("images")` (group override, else master); chat calls → master switch.
   `admin_bypass` applies in 2 and 3 (user = the one `get_current_user` resolved).

Refusal → `SystemLLMDisabled`; the global exception handler returns the 409
body below if it propagates. Many legacy call sites catch exceptions broadly and
return 500 / empty text instead — the call is still NOT billed (WP5 fixes those
UX paths by adding `require_system_llm` up front).

Consequences worth knowing:
- Unannotated endpoint, master ON, group override OFF for its feature → refused
  (via the path map). Master OFF, feature override ON → allowed (via the path map).
- Unannotated endpoint whose path is not in the map → follows the master switch
  (images: the `images` group).
- Grants survive `asyncio.create_task`, `asyncio.to_thread`, a fresh event loop in
  a worker thread, and FastAPI `BackgroundTasks` (sync and async) — tested.
- A background job that holds a grant **finishes** even if the admin flips the
  policy OFF meanwhile (accepted). A job without a grant re-checks at every call,
  so it may stop at its next LLM call after a flip.
- Grants never leak from a child task to its parent, nor across requests
  (the middleware resets grant/user/route feature per request).

### How a route author annotates an endpoint

```python
from lib import llm_policy

@router.post("/conjoint/studies/{study_id}/ai-interpretation")
async def ai_interpretation(study_id: str, current_user = Depends(get_current_user)):
    await llm_policy.require_system_llm("conjoint.interpretation", current_user)  # 409 if not allowed
    ...start background job / call LlmChat as before...
```

Put the check BEFORE any work or job creation, so the client gets a clean 409
instead of a failed job. To show/hide UI per feature, use
`await llm_policy.is_system_llm_allowed(key, user)` (no grant is made).
If a feature key is missing, add it to `FEATURES` (+ `FEATURE_LABELS_TH`) in
`lib/llm_policy.py` — ask WP1/lead; do not invent keys elsewhere.

### HTTP

**409 (any endpoint, explicit check or central guard):**

```json
{"detail": {"code": "llm_external_only", "feature": "conjoint.interpretation",
            "message": "ผู้ดูแลระบบปิดการใช้ AI ของระบบสำหรับฟังก์ชันนี้ — กรุณาใช้ AI ของคุณเอง ...",
            "hint": "<external_hint or empty string>"}}
```

**`GET /api/health`** — no auth → `{"status": "ok", "version": "2026.11", "time": "<ISO UTC>"}`
(version from env `APP_VERSION`).

**`GET /api/platform/llm-policy`** — any logged-in user (or API key with `platform.settings`):

```json
{"system_llm_enabled": false,
 "features": {"conjoint.interpretation": false, "be.thesis": true, "...": false},
 "external_hint": "ใช้ ChatGPT ของคุณเอง",
 "registry": {"groups": [{"key": "research", "label": "…", "features": ["conjoint.interpretation", "…"]}],
              "features": [{"key": "conjoint.interpretation", "group": "research", "label": "…"}]}}
```

`features` = effective value per feature key **for this caller** (admin_bypass included).
Admins additionally get `overrides` (the raw stored `features` map), `admin_bypass`,
`updated_at`, `updated_by`, `default_when_unset`.

**`PUT /api/platform/llm-policy`** — admin (or key with `platform.settings`); partial update:

```json
{"system_llm_enabled": true, "admin_bypass": false, "external_hint": "…",
 "features": {"images": false, "be.thesis": true, "translate": null}}
```

All fields optional. `features` merges into the stored map; `null` removes an
override. Unknown top-level fields, unknown feature/group keys, non-boolean
values → **422** `{"detail": "<reason>"}`. Non-admin → 403. Response = the same
shape as GET (admin view). `updated_by` = caller email, `updated_at` = now.

### API-key scopes (lib/api_keys.py)

| scope | grants |
|---|---|
| `platform.settings` | GET/HEAD/PUT `/api/platform/llm-policy` |
| `research.read` | GET/HEAD `/api/{conjoint,brand-equity}/studies(/…)`, GET `/api/brand-equity/{templates,thesis-eligible}`, GET/POST `…/studies/{id}/…/external-prompt`, GET `…/studies/{id}/…/external-pack` |
| `research.ai` | POST `/api/{conjoint,brand-equity}/studies/{id}/…/external-import` and `…/external-pack` |

`cms.*` does NOT cover these (wildcard = `cms.` scopes only), so no existing key
gained access. `/api/admin/*`, `/api/{conjoint,brand-equity}/admin/*`, `/api/auth/*`,
`/api/users*`, `/api/cms/keys*` stay HARD_DENY. A key acts as an ADMIN principal
within its scopes (existing convention), so a `research.read` key reads every
user's studies. Mint: `python backend/scripts/mint_api_key.py --label "sitectl · owner" --preset operator`
(`operator` = cms.* + platform.settings + research.read + research.ai; `research` = research.read + research.ai).

### Local simulation (no Mongo, no LLM): `backend/scripts/dev_sim.py`

```bash
cd backend && /home/user/venv/bin/python scripts/dev_sim.py            # port 18090
# options: --port N --host H --no-seed --no-frontend --llm-policy on|off --frontend-dir PATH
curl -s localhost:18090/api/health
curl -s -XPOST localhost:18090/api/auth/login -H 'content-type: application/json' \
     -d '{"email":"admin@swu.ac.th","password":"admin1234"}'
```

- Users: `admin@swu.ac.th / admin1234` (admin), `student@swu.ac.th / student1234` (current_student).
- Seeds: one conjoint study (3 attributes, 8 sets, 60 synthetic MNL respondents,
  created through the real endpoints; id printed at boot) and the brand-equity
  study `demo-sim-chathai-001` (from `scripts/seed_simulated_brand_study.py`, 183
  responses + drafts, 2 waves).
- Fake LLM: every call that passes the guard logs `[FAKE-LLM] …` and returns canned
  Thai text / a 1×1 PNG; refused calls log `[llm_policy] blocked billed …`.
- Frontend on the same origin: `cd frontend && REACT_APP_BACKEND_URL=http://localhost:18090 CI=true yarn build`,
  then run dev_sim (it serves `frontend/build` at `/` with SPA fallback when present).
  The URL is baked in at build time; a build made for another host will call that host.
- In-memory only: everything is lost on exit. Object storage is an in-memory dict.

## Conjoint

_(WP2 fills this section.)_

## Brand Equity

_(WP3 fills this section.)_
