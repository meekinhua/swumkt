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
| `research` | `conjoint.interpretation`, `conjoint.qualitative`, `be.ai_analyze`, `be.questions`, `cv.ai`, `journey.ai`, `behavior.ai`*, `perception.ai`*, `be.visual_identity`† |
| `thesis` | `conjoint.thesis`, `be.thesis` |
| `images` | `conjoint.images`, `cv.image`, `cms.image`, `content.image`, `behavior.image`*, `perception.image`* |
| `content` | `cms.ai`, `survey.ai`, `content.ai`, `translate` |
| `documents` | `docs.format`, `docs.citation`, `docs.ref_extract`, `docs.journal_finder`* |

`*` = added by WP1 (server.py endpoints `/api/generate-behavior-*`, `/api/perception/*`,
`/api/journal-finder` that the plan's table did not cover).
`†` = moved from `images` to `research` by WP9a: it is a vision *analysis* (images in, text out,
billed as a chat call); an admin who switches off "images" means image generation. Label:
"Brand Equity — วิเคราะห์อัตลักษณ์แบรนด์จากภาพ/คำบรรยาย (vision)". The admin UI builds from the
registry API, so nothing else changes.

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

**No-LLM routes (WP9a).** Every `…/external-prompt|import|pack` path and the no-LLM computations
(`conjoint …/export-thesis/no-ai|export-long|export-responses|wtp|simulate|data-quality|results|statistical-analysis|…`,
`brand-equity …/coding*|export/raw|thesis-export|dashboard|ai-status|…`, public survey/showcase paths) map to the
sentinel `llm_policy.NO_LLM` in the path map. The middleware never refuses a *request*; the guard refuses
any billed call made while serving such a path, **unconditionally** (even with a grant or admin_bypass) and
logs it as a bug. The sentinel is not a registry key and never appears in the UI.

**API keys never spend (WP9a).** The principal of a scoped API key (`auth_method: "api_key"`, id
`apikey:…`) has role ADMIN for the CMS handlers, but `effective()` is always **false** for it: no
`admin_bypass`, no billed call, whatever the policy says (a key that reaches a system-LLM endpoint gets the
409). `GET /api/platform/llm-policy` with a key shows `features` as an ordinary user sees them (so
`sitectl llm status` reports what the site does).

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
| `research.read` (+WP9a) | POST `/api/conjoint/studies/{id}/export-thesis/no-ai` and `…/simulate` (read-only, no LLM) |
| `research.ai` | POST `/api/{conjoint,brand-equity}/studies/{id}/…/external-import` and `…/external-pack`; POST `/api/brand-equity/studies/{id}/coding/import-csv`, DELETE `…/coding` (WP9a) |

Optional-auth routes (WP9a): a key on a route that takes `get_current_user_optional` (conjoint
interpretation prompt, WTP, simulator, …) now goes through the same scope gate and acts as the key
principal; before, it was silently treated as anonymous (so private studies answered 401). A key that is
presented but not allowed is refused (401/403), never downgraded to anonymous.

`cms.*` does NOT cover these (wildcard = `cms.` scopes only), so no existing key
gained access. `/api/admin/*`, `/api/{conjoint,brand-equity}/admin/*`, `/api/auth/*`,
`/api/users*`, `/api/cms/keys*` stay HARD_DENY. A key acts as an ADMIN principal
within its scopes (existing convention), so a `research.read` key reads every
user's studies. Mint: `python backend/scripts/mint_api_key.py --label "sitectl · owner" --preset operator`
(`operator` = cms.* + platform.settings + research.read + research.ai; `research` = research.read + research.ai).

### Request-size cap (WP9a)

`POST|PUT|PATCH` on `…/external-import`, `…/external-prompt`, `…/external-pack` and
`/api/brand-equity/studies/{id}/coding/import-csv`: body > **2 MB** → **413**
`{"detail": {"code": "payload_too_large", "message": "<Thai>"}}` (`lib/body_limit.py`). Show `message`.

### Imported text is stored verbatim — render it as text (sanitisation assumption, WP9a)

Imported AI answers (interpretation markdown, thesis chapters, BE themes / identity narrative /
insights, CV analysis, journey text) are validated for *structure* only; their text is **not**
HTML-sanitised server-side. The frontend must render them as text or with `react-markdown` **without**
`rehype-raw` (as it does today) — never `dangerouslySetInnerHTML`. Known raw-HTML sink: `ContentDetail.js`
renders `db.contents.content` with `dangerouslySetInnerHTML`; conjoint `share-content` now HTML-escapes the
body it writes there (it carries user text and a pasted interpretation). Content created through
`POST /api/content` is NOT escaped (pre-existing — any logged-in author can publish raw HTML; frontend
owner's decision to add DOMPurify there). DOCX exports insert text as runs (no markup interpretation).

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
  Thai text / a 1×1 PNG; refused calls log `[llm_policy] blocked billed …`. Since WP9a the fake is
  "smart" when run as `dev_sim.py`: brand-equity ai-analyze parts, visual identity, attribute
  translation, conjoint qualitative and survey generation get a schema-valid canned JSON/YAML answer,
  so the system path can be watched *succeeding* (`--llm-policy on`). Tests that pass their own
  `reply=` keep the old fixed reply.
- Dev-only packages: `pip install -r backend/requirements-dev.txt` (mongomock-motor).
- Frontend on the same origin: `cd frontend && REACT_APP_BACKEND_URL=http://localhost:18090 CI=true yarn build`,
  then run dev_sim (it serves `frontend/build` at `/` with SPA fallback when present).
  The URL is baked in at build time; a build made for another host will call that host.
- In-memory only: everything is lost on exit. Object storage is an in-memory dict.

## Conjoint

_Owner: WP2. Code: `backend/routes/conjoint.py`, `backend/lib/conjoint_{external,thesis,export,quality,wtp,simulator}.py`.
Tests: `backend/tests/test_conjoint_2026_11_external.py` (routes, TestClient + mongomock),
`backend/tests/test_conjoint_2026_11_audit.py` (pure). Audit: `memory/CONJOINT_AUDIT_2026_11.md`._

All paths are under `/api`. "owner" = study creator or admin. "viewer" = owner/admin, or
anyone (even anonymous) when the study has `is_public_result: true` — same rule as the
existing Results-page endpoints.

### Feature keys and system endpoints

| feature | system endpoint(s) — `409 llm_external_only` when not allowed | external alternative |
|---|---|---|
| `conjoint.interpretation` | `POST /conjoint/studies/{id}/ai-interpretation` (a cached interpretation, system **or external**, is still returned with `status:"ready"` when off; the check runs before a job is created) | `…/ai-interpretation/external-prompt` + `…/ai-interpretation/external-import` |
| `conjoint.qualitative` | `POST /conjoint/studies/{id}/qualitative-analysis` | `…/qualitative-analysis/external-prompt` + `…/external-import` |
| `conjoint.thesis` | `POST /conjoint/studies/{id}/export-thesis` (a cached doc → `status:"ready"` when off) | `…/export-thesis/external-prompt`, `…/export-thesis/external-pack`, `…/export-thesis/external-import`, and **`…/export-thesis/no-ai`** (no LLM at all) |
| `conjoint.images` | `POST …/generate-images`, `…/generate-single-image`, `…/generate-profile-image`, `…/generate-product-from-results`, `…/generate-shelf-simulation` | `…/<same>/external-prompt` (prompt only) + existing upload endpoints |

`POST …/share-content` no longer calls the system LLM when it is not allowed; it publishes
without the AI section (send your own text in `ai_interpretation`). It now requires owner (403 otherwise).

Background jobs: when a job fails because of the policy (switch turned off after the job was
queued), the status endpoints return
`{"status":"failed","error":"<Thai policy message>","error_code":"llm_external_only"}` — show the
same toast as a synchronous 409. Applies to
`GET /conjoint/studies/{id}/ai-interpretation-status/{job_id}` and
`GET /conjoint/studies/{id}/export-thesis-status/{job_id}` (the latter now also returns `cache_key`).

Uniform error bodies for imports: `422 {"detail":{"code":"external_import_invalid","message":"<Thai>"}}`.

### 1. AI interpretation

**`POST /conjoint/studies/{id}/ai-interpretation/external-prompt`** — viewer. Parallels the
existing `generate-prompt` call in `ConjointResultsPage.js` (which still works, same builder).
Request = same body as `ai-interpretation`: `{"method":"mnl","compare_all":false}`.

```json
{"feature":"conjoint.interpretation","title":"ตีความผล Conjoint ด้วย AI ของคุณเอง (mnl)",
 "instructions_th":"1. กดปุ่ม \"คัดลอก\" …","expected_format":"markdown",
 "parts":[{"key":"main","title":"การตีความผลการวิเคราะห์","system_prompt":"คุณเป็นผู้เชี่ยวชาญ…","prompt":"วิเคราะห์และตีความผลการวิจัย…"}],
 "filename":"conjoint-<title>-interpretation-prompt.md","method":"mnl","compare_all":false}
```
Needs ≥ 10 responses (400 otherwise, same as the system path).

**`POST /conjoint/studies/{id}/ai-interpretation/external-import`** — owner (logged in).
Request `{"method":"mnl","compare_all":false,"part_key":"main","content":"<pasted markdown>","model_label":"ChatGPT-5"}`.
Stored in the SAME `analysis_cache` row the system job writes (`method = ai_<method>_<all|single>`,
same `respondent_count` + `schema_version` guard → invalidated exactly like a system row when a
new respondent arrives). Response = the shape `ai-interpretation` returns when cached:
```json
{"status":"ready","interpretation":"## สรุปผล …","summary_data":{…},"cached":false,
 "source":"external","model_label":"ChatGPT-5","imported_at":"2026-11-26T…"}
```
`ai-interpretation` and `ai-interpretation-status` responses now also carry
`source` (`"system"|"external"`), `model_label`, `imported_at` — show "เขียนโดย <model_label>" when external.
Note: the interpretation cache is NOT keyed by the Results-page filters (it never was) — it
always describes all respondents. Since WP9a every interpretation response (`POST/GET ai-interpretation`,
`ai-interpretation-status` when ready, `external-import`) carries:
`"sample_scope": "all"`, `"sample_note_th": "เขียนจากผู้ตอบทั้งหมด (ไม่ใช้ตัวกรอง…)"`,
`"sample_respondent_count": <n the text was written from>`, `"filter_mismatch": <bool>` (true when the
caller passed `from`/`to`/`segments` to the GET). Show `sample_note_th` next to the text when a filter is
active (or when `filter_mismatch`).

**`GET /conjoint/studies/{id}/ai-interpretation?method=mnl&compare_all=false[&from=&to=&segments=]`** — NEW
(WP9a), viewer (same rule as the POST). Read-only twin of the POST: when a valid cache exists (same key,
`respondent_count` and `schema_version` guards) it returns exactly what the POST returns
(`{"status":"ready","interpretation":…,"cached":true,"source",…}` + the sample fields above); otherwise
**`200 {"cached": false}`**. Never calls an LLM, never 409, never creates a job. Use it on page load instead
of POSTing (a POST with the LLM off and no cache is a 409).

`GET …/ai-interpretation-status/{job_id}` now requires the viewer rule for `{id}` and a job that belongs to
that study (`{"status":"not_found"}` otherwise) — a caller's own job id used to unlock another study's
cached interpretation. `GET …/export-thesis-status/{job_id}` likewise requires owner/admin and the job's study.
Both report a job whose worker died (server restart) as
`{"status":"failed","error_code":"stale_job","error":"<Thai>"}` (interpretation after 15 min, thesis after
45 min) instead of `processing` forever.

### 2. Qualitative → attributes (JSON)

**`POST /conjoint/studies/{id}/qualitative-analysis/external-prompt`** — owner. Request = the
`qualitative-analysis` body `{"qualitative_data":[{"type":"interview","content":"…"}],"target_language":"th"}`.
Response as above with `"expected_format":"json"` and `parts[0].json_example` (the JSON shape to paste back).

**`POST /conjoint/studies/{id}/qualitative-analysis/external-import`** — owner. Request
`{"content":"<pasted, fences/prose OK>","model_label":"Claude","qualitative_data":[…same as above, optional…],"target_language":"th"}`.
Response = what `qualitative-analysis` returns:
`{"suggested_attributes":[{id,name,description,levels:[{id,value,description}],order}],"recommendations":"…","raw_analysis":{…},"source":"external","model_label":"Claude","imported_at":"…","imported_by":"<user id>"}`.
Writes `suggested_attributes`, `llm_analysis` (+ stamp), and `qualitative_data` if sent — the
same fields the system path writes. `ConjointQualitativePage.js` can feed the response to the
same handler it uses for the system result.

### 3. Thesis

All thesis paths keep the existing rule **admin OR (owner AND `can_export_thesis`)** (403 otherwise).
Request body everywhere = the existing `ThesisExportRequest`: `{"methods":["mnl"],"chapters":[3,4,5],"extra_prompt":""}`.
`cache_key` = `thesis_<sorted methods>_<sorted chapters>[_ep<hash>]` (unchanged).

**`POST …/export-thesis/external-prompt`** → prompt payload with one part per chapter
(`key: "ch3"|"ch4"|"ch5"`), all sharing the same `system_prompt`; plus `"cache_key"`.

**`POST …/export-thesis/external-pack`** → **file download** `text/markdown; charset=utf-8`
(`Content-Disposition: attachment; filename*=UTF-8''conjoint-<title>-thesis-pack.md`). Contains:
Thai step-by-step guide, study description, design facts (attributes/levels, tasks, alternatives,
algorithm, randomisation as recorded in the data — see below, no none-option, Johnson–Orme check), demographics table, every
computed APA-style table per method (+ WTP when computable), the method equations, the system
prompt, and one prompt per chapter. Frontend: `axios.post(url, body, {responseType:'blob'})` → save.

**`POST …/export-thesis/external-import`** — request = ThesisExportRequest fields plus either
`{"part_key":"ch3","content":"…","model_label":"Gemini 2.5 Pro"}` (one chapter) or
`{"parts":[{"part_key":"ch3","content":"…"},{"part_key":"ch4","content":"…"}],"model_label":"…"}`.
Chapters accumulate across calls (same `cache_key`). Response:
```json
{"status":"partial","job_id":"thesis_mnl_3_4","cache_key":"thesis_mnl_3_4","chapters_present":[3],
 "chapters_missing":[4],"download_url":"/api/conjoint/studies/<id>/export-thesis-download?cache_key=thesis_mnl_3_4",
 "source":"external","model_label":"Gemini 2.5 Pro","imported_at":"…","imported_by":"…"}
```
`status:"ready"` when every requested chapter is present. Then download with the existing
`GET …/export-thesis-download?cache_key=<cache_key>` (as `ConjointResultsPage.js` already does).
Each chapter must be ≥ 100 characters.

**`GET …/export-thesis-download`** (existing) — now prepends an AI-use disclosure paragraph naming
the tool (`model_label` for imported text, "AI ของระบบ (Gemini 2.5 Flash)" for system text). Never needs the LLM.

**`POST …/export-thesis/no-ai`** — NEW, **no LLM, works whatever the switch says** → `.docx` download
(`application/vnd.openxmlformats-officedocument.wordprocessingml.document`). Chapter 3 (methods
paragraph generated from the fielded design, design table, sample-size rule, data-quality note,
equations of each selected method) and Chapter 4 (demographics table, APA tables per method:
importance, coefficients with SE/z/p/95% CI, fit statistics; WTP table when price is numeric;
importance bar chart). `chapters` is intersected with {3,4}; chapter 5 is never generated without AI.
Suggested UI: a third option in the thesis modal "ดาวน์โหลดตารางและบทที่ 3–4 (ไม่ใช้ AI)".

**Randomisation facts (WP9a).** The survey page shuffles task order and alternative positions per
respondent and stores `display_task_index` (1-based) and `display_profile_ids` on each response item. The
design facts (`lib/conjoint_thesis.design_facts`) now carry `randomization: {status:
"randomised"|"not_randomised"|"mixed"|"no_responses", n_responses, n_with_display_order,
n_without_display_order, order_varies, positions_vary}` and a matching honest `randomization_th`
sentence used by the Chapter-3 prompt (system and external), the pack, and the no-AI document ("mixed" =
older responses without the fields saw the design order — both parts are stated). Straight-lining in
`data-quality` uses the **displayed** position when recorded (validated: must be a permutation of the
set's profile ids), else the design position. Estimation never uses position.

`POST …/export-thesis` now returns `{"status":"ready","job_id":<cache_key>,"cache_key":…,"cached":true,"source":…,"model_label":…}`
for a cached doc and `{"status":"processing","job_id":…,"cache_key":…}` otherwise.

### 4. Images (prompt only — the result is uploaded to the existing slot)

All return the prompt payload with `"expected_format":"image"` and an `upload` hint:

| endpoint | auth | request | `parts[].key` | upload slot (existing endpoint) |
|---|---|---|---|---|
| `POST …/generate-single-image/external-prompt` | owner | same as `generate-single-image` (`attribute_id, level_id, prompt?, reference_image_indices?, additional_prompt?`) | `<attr_id>:<level_id>` | `POST …/upload-image` `{attribute_id, level_id, image_url:"data:image/…;base64,…"}` → stored in `attributes[].levels[].image_url` (same field the generator writes) |
| `POST …/generate-images/external-prompt` | owner | none | one per level | same as above |
| `POST …/generate-profile-image/external-prompt` | owner | same as `generate-profile-image` | `<choice_set_id>:<profile_id>` | `POST …/upload-profile-image` `{choice_set_id, profile_id, image_url}` → `profile_image_url` (same field) |
| `POST …/generate-product-from-results/external-prompt` | viewer | same as `generate-product-from-results` | `image_prompt` (ready to use), `prompt_writer` (system+meta prompt the system uses) | none — the product image is never stored server-side; use the file locally / pass it as `product_image_url` to shelf simulation. Response also has `optimal_features`. |
| `POST …/generate-shelf-simulation/external-prompt` | viewer | `{environment_type, custom_environment?, shelf_style, custom_shelf_style?, additional_prompt?}` (`product_image_url` optional) | `image_prompt`, `prompt_writer` | none (attach the product image in the user's image tool). Response has `environment_type` (resolved "auto"). |

Example (`upload` is `null` for product/shelf):
```json
{"feature":"conjoint.images","title":"ภาพสำหรับ Brand: A","instructions_th":"1. คัดลอกพรอมต์ภาพ …","expected_format":"image",
 "parts":[{"key":"brand:b0","title":"Brand — A","system_prompt":"","prompt":"Professional product visualization: Brand - A. …"}],
 "filename":"conjoint-<title>-level-image-prompt.md",
 "upload":{"method":"POST","url":"/api/conjoint/studies/<id>/upload-image","body":{"attribute_id":"brand","level_id":"b0","image_url":"<data:image/...;base64,...>"}}}
```

### 5. New analysis fields (statistical-analysis results, cache v6)

`GET /conjoint/studies/{id}/statistical-analysis?method=…` results now also contain:
- MNL: `ci_lower`, `ci_upper` ({coef_name: value}, Wald 95 %), `ci_level: 0.95`, `converged` (bool),
  `reference_levels` ({attr_id: level_id}), `coding` (text).
- Mixed Logit: `ci_lower`, `ci_upper`, `ci_level`, `converged`, `reference_levels`.
- HB: `converged`, `reference_levels`.
- MNL / Mixed Logit / HB `part_worths[attr].levels[level]` now carry `is_reference` and
  `is_excluded` (as OLS already did). Render `is_excluded` as "ประมาณค่าไม่ได้", not 0;
  `is_reference` as "0 (อ้างอิง)". Show a red warning when `converged === false`.
`ANALYSIS_CACHE_VERSION` 5 → 6: first view of every study recomputes once.

### 6. New practitioner / academic endpoints (no LLM)

**`GET /conjoint/studies/{id}/export-long?format=xlsx|csv`** — owner. File download. xlsx sheets:
`README` (Thai: layout, coding, R/Stata/Python commands), `data_long` (one row per alternative:
`respondent_id, respondent_index, response_id, submitted_at, duration_sec, situation_id, task,
choice_set_id, alt, profile_id, chosen, usable, [display_task, display_alt,] <Attr>, <Attr>__code …,
demo_<field> …, flag_speeder, flag_straightliner, flag_duplicate, flags`; `task`/`alt` are DESIGN
positions; `display_task`/`display_alt` (WP9a) are present when any response recorded what was shown —
blank for older responses — and are documented in the codebook), `codebook`, `design`, `data_quality`.
Re-estimating a conditional logit on `usable==1` grouped by `situation_id` reproduces the
platform's MNL coefficients (pinned by a test). **Replace** the CSV button in
`ConjointResultsPage.js` `handleExportCSV` (currently a JSON blob in one cell) with this download;
keep the old `export-responses` endpoint (unchanged) for anything else that uses it.

**`GET /conjoint/studies/{id}/data-quality`** — owner. Report only (nothing is excluded from analysis):
```json
{"n_responses":60,"n_tasks_in_design":8,"median_duration_sec":178.0,
 "thresholds":{"speeder_seconds":71.2,"speeder_ratio_of_median":0.4,"straightline_min_tasks":6,"possible_duplicate_window_sec":600},
 "counts":{"speeder":2,"straightliner":0,"duplicate_id":0,"duplicate_email":0,"possible_duplicate":0,"incomplete":0,"no_usable_task":0},
 "n_flagged":2,"share_flagged":0.0333,
 "flagged":[{"respondent_index":4,"respondent_id":"r4","response_id":"…","duration_sec":40,"tasks_answered":8,"tasks_usable":8,"flags":["speeder"]}],
 "notes_th":["…"]}
```
Suggested: a card next to the sample-adequacy card.

**`GET /conjoint/studies/{id}/wtp?price_attribute_id=&from=&to=&segments=`** — viewer.
`status`: `"ok" | "warning"` (linearity rejected) `| "refused"` (price β ≥ 0 or p ≥ .05; `reason_th`)
`| "not_applicable"` (no numeric price attribute; `reason_th`) `| "insufficient_data"` (< 30).
Price attribute auto-detected by name (ราคา/price/cost/บาท) with all-numeric levels (e.g. "฿59", "1,290 บาท"),
or pass `price_attribute_id`.
```json
{"status":"ok","price_attribute_id":"price","price_attribute_name":"ราคา","price_levels":[100,150,200],
 "price_coefficient":-0.0207,"price_se":0.0006,"price_p_value":1e-228,
 "linearity_test":{"tested":true,"lr_statistic":0.24,"df":1,"p_value":0.62,"rejected":false},
 "ci_method":"Krinsky–Robb, 10000 draws, 95% percentile interval",
 "levels":[{"attribute_id":"brand","attribute":"Brand","level_id":"b0","level":"A","is_reference":false,
            "beta":0.69,"wtp":33.5,"se_delta":2.6,"ci_low":28.5,"ci_high":38.7,"ci_excludes_zero":true,"extrapolated":false},
           {"attribute_id":"brand","attribute":"Brand","level_id":"b2","level":"C","is_reference":true,"wtp":0.0,"note_th":"ระดับอ้างอิง (WTP = 0)"}],
 "warnings_th":["…"],"respondent_count":300}
```
WTP is in the price attribute's currency units, relative to each attribute's reference level.

**`POST /conjoint/studies/{id}/simulate?from=&to=&segments=`** — viewer. Request
`{"method":"mnl"|"mixed_logit"|"hierarchical_bayes","rule":"logit"|"first_choice","products":[{"name":"A","levels":{"<attr_id>":"<level_id>",…}},…]}`
(every attribute must be set; ≥ 2 products). Uses the cached analysis for the same filter.
Response `{"method","rule","heterogeneity_simulated","n_draws","products":[{"name","levels":{attrName:levelValue},"utility","share"}],"caveats_th":[…],"respondent_count"}`.
400 with a Thai `detail` for counting/OLS, for `first_choice` with MNL, or incomplete products.
Show the caveats (no none-option → share of preference, not market share; IIA for MNL).
400 (WP9a) when a product uses a level the model could not estimate (it used to be simulated as if it
were the reference level, utility 0).

`POST …/share-content` (WP9a): the automatic interpretation now actually runs when the system LLM is
allowed (it called `LlmChat()` without arguments and a non-existent `send_message_async`, so it always
failed silently); the stored content body is HTML-escaped.

### API-key scopes (for WP1 / sitectl)

Already covered by the current rules: `…/external-prompt` → `research.read`; `…/external-import`,
`…/external-pack` (POST) → `research.ai`; `GET export-long|data-quality|wtp` → `research.read`.
`POST …/export-thesis/no-ai` and `POST …/simulate` → `research.read` (added by WP9a).

## Brand Equity

_Owner: WP3. Code: `backend/routes/brand_equity.py`, `backend/lib/be_external.py`,
`backend/routes/be_thesis_ai.py`, `thesis_renderer.py`. Tests:
`backend/tests/test_brand_equity_2026_11.py`. Audit: `memory/BRAND_EQUITY_AUDIT_2026_11.md`._

All paths below are under `/api/brand-equity`. Auth = the study owner (or admin), same as
the existing study routes. Every endpoint that takes a filter accepts the dashboard's query
params `from`, `to`, `segments` (URL-encoded JSON `{field:[values]}`) and `wave`
(`latest|all|<n>`) — pass exactly what the dashboard passes to `/dashboard`, so the result
lands in the same `ai_cache` / `ai_cache_by_filter.<signature>` slot the dashboard reads.

### Feature keys (llm_policy) and system endpoints

| feature | system endpoint(s) — now `409 llm_external_only` when not allowed | external alternative |
|---|---|---|
| `be.ai_analyze` | `POST /studies/{id}/ai-analyze` (checked **before** anything is queued) | `…/ai-analyze/external-prompt` + `…/external-import`; manual code frame |
| `be.thesis` | `POST /studies/{id}/thesis-ai-start` (a cached thesis is still returned as `ready` when off) | `…/thesis-ai/external-pack` + `…/thesis-ai/external-import` |
| `be.visual_identity` | `POST /studies/{id}/extract-visual-identity`, `POST /extract-identity` (wizard) | `…/extract-visual-identity/external-prompt|import`, `/extract-identity/external-prompt|import` |
| `be.questions` | no endpoint refuses: the only LLM use is the optional TH→EN translation of custom quality attributes in `POST /studies`, `PUT /studies/{id}`, `POST /studies/{id}/regenerate-questions`; when off it is silently skipped (Thai text kept) | `…/regenerate-questions/external-prompt|import`; or send `brand.custom_quality_attributes_en` in `PUT /studies/{id}` (now respected instead of overwritten) |

Always available whatever the switch says: `GET /studies/{id}/ai-status`, `GET /dashboard`
(cached AI results stay readable), `POST /studies/{id}/thesis-export` (non-AI DOCX).

Background jobs (system path) now record failure honestly:
- `ai-status` `status` ∈ `idle|queued|running|ready|partial|error|no_data`. **New:** `partial`
  (some steps failed) and the fields `errors: [{part, sections, message, errors?}]`,
  `error_code: "llm_external_only"` + `error_detail` (the 409 body's `detail`) when the policy
  refused mid-job. Never `ready` with empty content.
- `thesis-ai-status/{job_id}` adds `error_code` / `error_detail` the same way; an empty chapter
  fails the job (it used to be cached as an empty chapter).

### 1. AI analysis — external prompt (parallels "Run AI analysis" → `POST /studies/{id}/ai-analyze`)

`GET` (or `POST`, no body) `/studies/{id}/ai-analyze/external-prompt?from&to&segments&wave`

```json
{"feature": "be.ai_analyze",
 "title": "วิเคราะห์ Brand Equity ด้วย AI ของคุณเอง — Kaffe",
 "instructions_th": "วิธีใช้ AI ของคุณเอง …",
 "expected_format": "json",
 "parts": [{"key": "p1",
            "title": "จัดกลุ่ม/เข้ารหัสคำตอบปลายเปิด + สกัดประเด็น (themes) … + ข้อเสนอแนะเชิงกลยุทธ์ (master insights)",
            "sections": ["coding", "themes", "identity", "insights"],
            "system_prompt": "คุณเป็นนักวิจัยการตลาด…",
            "prompt": "## ชุดงาน p1: … (data embedded)",
            "json_example": "{\n  \"part\": \"p1\",\n  \"coding\": {…}, …}"}],
 "filename": "brand-equity-Kaffe-all-ai-prompt.md",
 "signature": "all",
 "filter": {"from": null, "to": null, "segments": {}},
 "n_responses": 60,
 "coding": {"questions": 6, "distinct_answers": 24, "answers": 360},
 "themes": [{"question_id": "PQ-6--self", "sampled": false, "sent": 4, "total_answers": 60}]}
```

- A small study is ONE part (`p1`, all four sections). A large one is several parts: each
  coding part carries ≤ 200 distinct answers; themes / identity / insights follow in the last
  part(s). `sections` tells the UI what each part produces. Parts are independent: import them
  in any order, one paste per part. Show `part.title` and `sections` on each step.
- 400 `"ยังไม่มีคำตอบในชุดข้อมูลนี้ …"` when the filtered slice is empty.
- Theme questions with too many distinct answers are sent as a deterministic sample;
  `themes[].sampled = true` → show "ส่งตัวอย่าง {sent} จาก {total_answers} คำตอบ".

### 2. AI analysis — external import

`POST /studies/{id}/ai-analyze/external-import?from&to&segments&wave`

```json
{"part_key": "p1", "content": "<everything the user pasted>", "model_label": "ChatGPT-5"}
```

`part_key` optional (the pasted JSON's `"part"` is used if present). `model_label` optional
(stored as `"AI ภายนอก (ไม่ระบุชื่อ)"` when blank). Code fences / prose around the JSON are fine.

200 → the same object `GET /ai-status` returns for that filter, plus import info:

```json
{"status": "ready", "source": "external", "model_label": "ChatGPT-5",
 "imported_at": "…", "imported_by": "owner@…",
 "normalized_by_question": {"AW-1--self": {"counts": […], "total": 60, "basis": "ai", "coding_coverage": 1.0, "derived_from_open_coding": true}},
 "themes_by_question": {"PQ-6--self": [{"name": "ราคา", "description": "…", "sentiment": -0.3,
                                        "count": 15, "pct": 25.0, "sample_quotes": ["…"],
                                        "answer_ids": ["a1b2c3d4"], "base_n": 60, "sampled": false, "total_n": 60}]},
 "identity_image": {"perceived_traits": [{"trait": "Modern", "count": 30, "sentiment": 0.5}],
                    "aligned": ["Modern"], "lost": ["Premium"], "unintended": ["Expensive"],
                    "alignment_score_0_100": 55, "narrative": "…", "alignment_is_llm_judgement": true},
 "master_insights": [{"headline": "…", "evidence": "…", "recommendation": "…", "priority": "high"}],
 "sections_meta": {"coding": {"source": "external", "model_label": "ChatGPT-5", "at": "…", "by": "…"}, "…": {}},
 "filter": {"from": null, "to": null, "segments": {}, "n": 60}, "schema_version": 2,
 "signature": "all", "wave": "all",
 "imported_sections": ["coding", "themes", "identity", "insights"], "part_key": "p1",
 "warnings": ["คำถาม AW-2--self: เข้ารหัสแล้ว 60% ของคำตอบ — …"]}
```

422 (nothing is saved — a part is applied all-or-nothing):

```json
{"detail": {"code": "external_import_invalid",
            "message": "ส่วน coding มีข้อผิดพลาด จึงยังไม่นำเข้าส่วนใดเลย",
            "errors": ["พบ id ที่ไม่มีในการศึกษานี้ 1 รายการ เช่น a00000000 — …"]}}
```

Show `message` + the `errors` list. Other messages: unreadable JSON (with line/column),
"คำตอบไม่ครบ: ชุดงาน p2 ต้องมีส่วน insights …" (a promised section is missing — truncated paste).
After a successful import re-fetch `/dashboard` (counts change only via coding).

Same `ai_cache` fields as the system path; the system path now also writes `source`,
`model_label`, `sections_meta`, `errors`, `schema_version`.

### 3. Open-ended coding without an LLM (code frame) — new UI block, no existing parallel

- `GET /studies/{id}/coding` →
  ```json
  {"questions": [{"question_id": "AW-1--self", "prompt": "เมื่อพูดถึง กาแฟ แบรนด์แรกที่นึกถึงคืออะไร?",
                  "task": "brand_single", "distinct_answers": 7, "coded_distinct": 7,
                  "answers": 60, "coded_answers": 60, "coverage": 1.0,
                  "sources": ["external"], "model_labels": {"external": "ChatGPT-5"}}],
   "distinct_answers": 24, "coded_distinct": 24, "how_to_th": "ดาวน์โหลดไฟล์ code frame → …"}
  ```
  `task` ∈ `brand_single|brand_multi|concept`; `sources` ⊂ `system|external|manual`.
- `GET /studies/{id}/coding/codeframe.csv` → UTF-8 CSV (BOM) download, columns
  `answer_id,question_id,question_type,frequency,answer_text,code` (existing codes pre-filled).
  User fills `code` (one label; several brands `A; B`; `-` = no brand; blank = leave uncoded).
- `POST /studies/{id}/coding/import-csv` body `{"content": "<csv text>", "model_label": "optional coder name"}`
  (read the file with FileReader as text) → `{"imported": 24, "questions": [same rows as GET /coding]}`;
  422 same shape as §2.
- `DELETE /studies/{id}/coding?question_id=AW-1--self` (omit `question_id` = clear all) →
  `{"open_coding_questions": [...]}`.

Codes are per distinct answer text, so they apply to every filter/segment/wave automatically.

### 4. Dashboard / aggregate — new fields (all additive; `aggregate` of `GET /studies/{id}/dashboard` and `GET /showcase/{token}`)

Query: `exclude_flagged=true` drops speeders / straight-liners / duplicates before analysis;
response adds `quality_filter` and
`methods_paragraph_th` (ready-to-adapt Thai methods paragraph built from this study's facts).
`quality_filter` (WP9a, unambiguous):
```json
{"exclude_flagged": true, "excluded": 4, "excluded_flags": ["speeder","straightliner","duplicate"],
 "n_before_exclusion": 64, "aggregate_data_quality_scope": "remaining_after_exclusion",
 "full_sample_data_quality": {"n_total": 64, "flags": {"speeder": 2, "straightliner": 1, "duplicate": 1, "unaware_rater": 3}, "n_flagged_excludable": 4, "…": "…"},
 "note_th": "ตัดผู้ตอบที่น่าสงสัยออกแล้ว — …"}
```
With the filter on, `aggregate.data_quality` describes the REMAINING respondents (so it shows ~0 flags):
render the data-quality card from `quality_filter.full_sample_data_quality` and say how many were excluded.
Flags are always judged against the whole study (dashboard and `export/raw` now agree).

`aggregate` adds:
- `schema_version: 2`.
- `questions[]`: `reverse_scored`, `score_eligible`, `coding_status`
  (`coded|partial|deterministic|uncoded|not_required`), `coding_status_th`
  (**render this text instead of an empty chart/zero when `uncoded`** — e.g. "ยังไม่ได้เข้ารหัส").
- `questions[].stats` (frequency / brand rows): `counts[].pct_ci95: [lo, hi]` (Wilson 95%);
  coded open questions: `normalization_basis` ∈ `ai|manual|deterministic|none`, `coding_source`,
  `coding_coverage`, `uncoded_n`; unaided-recall question: `total_unaided_pct`,
  `total_unaided_ci95`, `total_unaided_base` (share naming the focal brand unprompted in
  top-of-mind OR later — **this is what scores now**; show it as "Unaided recall (รวม)").
- NPS stats: `score_ci95: [lo, hi]` (NPS units, −100..100) and `score_100_ci95`.
- `reliability[dim]`: adds `items: [{question_id, kind, reverse_scored, corrected_item_total_r,
  alpha_if_deleted}]`, `missing_data_rule`; top-level `reliability_not_computed` (Thai sentence
  to print under the reliability card).
- `sample_adequacy`: adds `moe_95_pct` (± points, worst case) and `moe_note`.
- `bes_sensitivity`: `{"dimensions_used": 4, "dimensions_missing": [], "equal_weights": 46.5,
  "range_one_weight_halved_or_doubled": [43.9, 50.2], "tier_stable": false, "note": "…"}` —
  show the range next to BES; when `tier_stable` is false show the note.
- `competitor_comparison`:
  ```json
  {"paired": [{"axis": "Trustworthy", "competitor": "Amazon", "n_pairs": 60, "testable": true,
               "mean_diff": 6.4, "diff_ci95": [2.1, 10.7], "t": 2.97, "df": 59, "p_value": 0.0043,
               "p_value_holm": 0.03, "significant": true, "cohens_dz": 0.38, "effect_label": "small",
               "reverse_scored": false, "low_n": true, "interpretation": "Kaffe สูงกว่า Amazon …"}],
   "comparative_vs_midpoint": [{"question_id": "PQ-5--self", "competitor": "Amazon", "n": 60,
               "testable": true, "mean": 3.2, "t": -4.1, "df": 59, "p_value": 0.0001,
               "p_value_holm": 0.0001, "significant": true, "cohens_d": -0.53,
               "mean_favour_focal_ci95": [0.4, 1.2]}],
   "method": "paired t-test …", "caveat": "…"}
  ```
  (`testable:false` rows carry `reason` + `interpretation`.) Use it on the radar / competitor cards.
- `data_quality`: `{"n_total": 60, "flags": {"speeder": 0, "straightliner": 1, "duplicate": 0,
  "unaware_rater": 3}, "n_flagged_excludable": 1, "median_duration_sec": 298.0,
  "rules": {"speeder": "…", …}, "excluded_by_default": false, "note": "…"}` — card + the
  `exclude_flagged` toggle.
- `open_coding`: `{"questions_needing_coding": 7, "by_status": {"coded": 6, "uncoded": 1},
  "uncoded_questions": ["LY-4--self"]}`.
- `normalization`: adds `manual_questions`; `basis` may be `"manual"`.
- **Removed from scoring:** the LLM identity–image alignment no longer feeds Identity
  (`composite_meta.identity.present_kinds` never contains `ai_identity_alignment`).
  `identity_image.alignment_score_0_100` is still returned — label it "ความเห็นของ AI (ไม่ใช่คะแนน)".
  The methodology page (`BeMethodology.jsx`) must stop saying alignment is 10 % of Identity, and
  should say unaided recall = TOM ∪ later mentions.

**List page (WP9a):** `GET /studies` and `GET /studies/scores` add top-level
`"analysis_schema_version": 2`; each `scores[<id>]` adds `schema_version` and `method_updated_from`
(the analysis version of the scores this study showed before, e.g. `1`, or `null`). Show the
"วิธีคำนวณปรับปรุงแล้ว — ตัวเลขอาจเปลี่ยน" note when `method_updated_from` is not null.

**System ai-analyze failures (WP9a):** a step that fails no longer overwrites what the slot held: themes /
identity / insights from an earlier (e.g. external) import are kept, and `sections_meta.<section>` is
stamped `system` only for steps that succeeded in this run (it used to say "coded by system AI" after a
failed run). `ai-status` reports a queued/running job with no progress for 15 min as
`{"status":"error","error_code":"stale_job","error":"<Thai>"}`, and `POST ai-analyze` then starts a new one.
`GET /studies/{id}/thesis-ai-status/{job_id}` now requires ownership of the study.

### 5. Raw data export — new button (no existing parallel)

`GET /studies/{id}/export/raw?format=xlsx|csv|codebook_csv&from&to&segments&wave&exclude_flagged`
- `xlsx` (default): sheets `README`, `data` (one row per respondent; SPSS/R-safe variable
  names; `_r` reverse-scored copies; `*_1…*_k` 0/1 dummies for multi-select; `*_code` and
  `*_focal` for open brand questions; `dq_*` flags), `codebook` (variable, question text TH/EN,
  dimension, kind, type, measure, min, max, value_labels, reverse_scored, score_eligible,
  weight_in_dimension, notes).
- `csv` = the `data` sheet; `codebook_csv` = the codebook. Download with the auth header (blob).

### 6. Thesis — external pack (parallels `POST /studies/{id}/thesis-ai-start`)

`GET /studies/{id}/thesis-ai/external-pack?chapters=3,4,5&extra_prompt=&format=md|json&from&to&segments`
(role admin / current_student / alumni + owner, like thesis-ai-start; chapters 3-5 need ≥ 10
responses → 400).
- `format=md` (default): `text/markdown` download `brand-equity-thesis-pack-<brand>.md` —
  how-to, all measured tables (scores, item stats with CIs, reliability incl. item-total r,
  paired competitor tests, method facts), generated methods paragraph, required disclosures,
  the system prompt, one prompt per chapter, the allowed reference list.
- `format=json` (for `ExternalAiDialog`):
  ```json
  {"feature": "be.thesis", "title": "…", "instructions_th": "…", "expected_format": "markdown",
   "parts": [{"key": "ch3", "title": "บทที่ 3", "system_prompt": "…", "prompt": "…"}],
   "filename": "brand-equity-thesis-pack-Kaffe.md", "signature": "all", "markdown": "<whole pack>"}
  ```

### 7. Thesis — external import (then download through the existing renderer)

`POST /studies/{id}/thesis-ai/external-import?from&to&segments`

```json
{"part_key": "ch3", "content": "<pasted markdown>", "model_label": "Claude"}
```
or several at once: `{"chapters": {"3": "…", "4": "…"}, "model_label": "Claude"}`.

200:
```json
{"status": "ready", "cache_key": "be_thesis_ext_<study_id>_all",
 "chapters_imported": [3], "chapters_stored": [3, 4], "warnings": ["บทที่ 3: พบข้อความเว้นว่าง/placeholder …"],
 "model_label": "Claude",
 "download_path": "/brand-equity/studies/<id>/thesis-ai-download?cache_key=be_thesis_ext_<id>_all"}
```
Chapters accumulate per filter (import ch3 now, ch4 later). Download with the existing
`GET /studies/{id}/thesis-ai-download?cache_key=…` (same call the system flow uses); the DOCX
starts with an AI-use disclosure naming `model_label`. 422 (`external_import_invalid`) for an
empty/too-short chapter or a bad `part_key`. Show `warnings` (placeholders, an α ≥ .70 claim the
data does not support) before the download button.

### 8. Visual identity (vision) — prompt only, user attaches the images

- `GET|POST /studies/{id}/extract-visual-identity/external-prompt` → uniform shape with one part
  `main`, `expected_format: "json"`, plus `images: [{index, kind, note, mime_type}]` (tell the user
  which images to attach, in order; the frontend already holds them in `study.identity.visual_assets`).
- `POST /studies/{id}/extract-visual-identity/external-import` `{content, model_label}` → same
  response as `POST /studies/{id}/extract-visual-identity`: `{"identity": {…}, "derived": {…}}`;
  `identity.ai_source = {source, model_label, at, by}`.
- Wizard (before the study exists): `POST /extract-identity/external-prompt` with the same body as
  `POST /extract-identity`; `POST /extract-identity/external-import` `{content, model_label}` →
  the derived object (same as `/extract-identity`) + `source`, `model_label`.

### 9. Attribute translation (be.questions)

- `GET|POST /studies/{id}/regenerate-questions/external-prompt` → one part, `expected_format: "text"`
  (400 when the study has no custom quality attributes).
- `POST /studies/{id}/regenerate-questions/external-import` `{content, model_label}` (one line per
  attribute, or a JSON array) → same response as `POST /studies/{id}/regenerate-questions` plus
  `custom_quality_attributes_en`.

### Notes for WP1 / CLI

- API-key scopes: `POST /studies/{id}/coding/import-csv` and `DELETE /studies/{id}/coding` → `research.ai` (done, WP9a).
- `ROUTE_FEATURES`: `/api/brand-equity/extract-identity` → `be.visual_identity` (done, WP9a).

## Other tools

_Owner: WP5. Code: `backend/server.py` (survey / translate / journey / behaviour / perception / document
endpoints), `backend/routes/customer_value.py`, `backend/routes/cms.py`, `backend/lib/external_prompts.py`
(shared pure prompt builders + helpers), `backend/lib/{doc_formatter,citation_replacer,citation_style_formatter,ref_extract}.py`.
Tests: `backend/tests/test_llm_call_sites_2026_11.py`._

Rule for every endpoint below: `require_system_llm(<key>)` runs **before** any work / DB read / write
(so a refusal writes nothing), outside the endpoint's broad `try`, and the broad `except` re-raises
`HTTPException` / `SystemLLMDisabled` — a refusal is always the 409 `llm_external_only` body of
§Policy, never a 500 / "Translation failed" / "AI failed (timeout or quota)" / empty result. The
`…/external-prompt` endpoints need no policy check (a user may prefer their own LLM even when the
system LLM is on) and build the prompt with **the same function** as the system path.

### Gated endpoints (path → feature key) — 24 (+ 2 degrade-gracefully)

| endpoint | key | notes |
|---|---|---|
| `POST /api/translate` | `translate` | anonymous allowed; now takes `get_current_user_optional` so an admin keeps `admin_bypass` |
| `POST /api/surveys/ai-generate` | `survey.ai` | |
| `POST /api/content/{id}/ai-rearrange` | `content.ai` | also fixed: 404/403 were turned into 500 |
| `POST /api/generate-journey-map` | `journey.ai` | |
| `POST /api/generate-behavior-analysis` | `behavior.ai` | |
| `POST /api/generate-behavior-image` | `behavior.image` | |
| `POST /api/perception/generate-questions` | `perception.ai` | |
| `POST /api/perception/generate-analysis` | `perception.ai` | |
| `POST /api/perception/generate-illustration` | `perception.image` | |
| `POST /api/journal-finder` | `docs.journal_finder` | |
| `POST /api/format-editor/fetch-guidelines` | `docs.format` | |
| `POST /api/format-editor/reformat-with-ai` | `docs.format` | |
| `POST /api/format-editor/replace-citations` | `docs.citation` | |
| `POST /api/admin/test-image-generation` | `content.image` | admin check first, then policy |
| `POST /api/cv/studies/{id}/ai-suggest` | `cv.ai` | |
| `POST /api/cv/studies/{id}/ai-analysis` | `cv.ai` | |
| `POST /api/cv/studies/{id}/ai-needs` | `cv.ai` | |
| `POST /api/cv/studies/{id}/ai-step` | `cv.ai` | |
| `POST /api/cv/studies/{id}/generate-image` | `cv.image` | |
| `POST /api/cms/ai/generate-text` | `cms.ai` | admin only (as before) |
| `POST /api/cms/ai/generate-full` | `cms.ai` | 400 on empty description comes first |
| `POST /api/cms/ai/summarize` | `cms.ai` | |
| `POST /api/cms/ai/translate` | `translate` | |
| `POST /api/cms/ai/generate-image` | `cms.image` | |

Gate cleanly / degrade gracefully (these are mostly free features, so they do NOT 409):
- `POST /api/format-editor/analyze-file` (anonymous): structure analysis always works; the AI reference
  extraction (`bib_content`) runs only when `docs.ref_extract` is allowed, otherwise `bib_content: null`.
- `POST /api/format-editor/format`: with `journal_name`, the AI citation-style detection runs only when
  `docs.format` is allowed (else the chosen `format_style` is used); AI `.bib` extraction only when
  `docs.ref_extract` is allowed.
- `journey*.py` (quantitative journey module): has no LLM call. The only `journey.ai` endpoint is the legacy
  `POST /api/generate-journey-map` above.
- Not offered externally (multi-call, file based): `docs.format`, `docs.citation`, `docs.ref_extract`,
  `docs.journal_finder` — just gated. The four `lib/*` document modules now import `emergentintegrations`
  lazily inside the functions that call the LLM and re-raise `SystemLLMDisabled` instead of returning a fallback.

### External-prompt / import endpoints

All return the uniform shape of plan §B (`feature, title, instructions_th, expected_format, parts[{key,title,
system_prompt, prompt, json_example?}], filename`); every part has `key: "main"`. `expected_format` is
`markdown` (free text the user pastes into an editable field), `json` (see `json_example`), `yaml` (survey
SDL) or `image-prompt` (copy it into an image tool and upload the picture with the normal upload — no paste-back).
Import bodies are `{"content": "<pasted>", "part_key": "main", "model_label": "ChatGPT 5"}`; failures are
**422** with a Thai `detail` string; successes carry `source: "external"`, `model_label`, `imported_at`, `imported_by`.

**Stored server-side → `external-import` exists (response = what the system endpoint returns):**

| prompt | import | stores in |
|---|---|---|
| `POST /api/surveys/ai-generate/external-prompt` (same body as ai-generate) | `POST /api/surveys/ai-generate/external-import` → `Survey` | `db.surveys` (+ `source`, `model_label`) after the same SDL parser + validator |
| `POST /api/generate-journey-map/external-prompt` (same body) | `POST /api/generate-journey-map/external-import` `{content, raw_data, research_context?, model_label?}` → `{mermaid_code, analysis_summary, qualitative_run_id}` | `db.qualitative_runs` (what the quantitative journey `seed` reads) |
| `GET\|POST /api/cv/studies/{id}/ai-analysis/external-prompt` | `POST /api/cv/studies/{id}/ai-analysis/external-import` → `{analysis, source, model_label, imported_at}` | `cv_studies.ai_analysis` (+ `ai_analysis_source`) |

**Parse-only imports (nothing stored; the UI fills its form from the validated result, same JSON as the system endpoint):**

| prompt | import → response |
|---|---|
| `POST /api/cv/studies/{id}/ai-suggest/external-prompt` `{brand_id, category}` | `POST …/ai-suggest/external-import` `{brand_id, category, content}` → `{category, is_cost, suggestions[]}` |
| `POST /api/cv/studies/{id}/ai-needs/external-prompt` `{need, want, buying_power}` | `POST …/ai-needs/external-import` `{content}` → `{result}` |
| `POST /api/cv/studies/{id}/ai-step/external-prompt` `{step}` | `POST …/ai-step/external-import` `{step, content}` → `{step, result}` |
| `POST /api/cms/ai/generate-full/external-prompt` (same body) | `POST /api/cms/ai/generate-full/external-import` `{content, category?, model_label?}` → exactly what `generate-full` returns (`title, hero_title_lines, hero_accent_idx, excerpt, category, body_md`) |

**Prompt only — the user pastes the answer into the existing editable field (no import endpoint):**
`POST /api/translate/external-prompt` (anonymous, same body as `/translate`),
`POST /api/generate-behavior-analysis/external-prompt`, `POST /api/perception/generate-questions/external-prompt`,
`POST /api/perception/generate-analysis/external-prompt`, `POST /api/cms/ai/generate-text/external-prompt`,
`POST /api/cms/ai/summarize/external-prompt`, `POST /api/cms/ai/translate/external-prompt`.
Images (`image-prompt`): `POST /api/cv/studies/{id}/generate-image/external-prompt {brand_id, extra_prompt?}`,
`POST /api/cms/ai/generate-image/external-prompt {prompt, style?, aspect?}`. (Behaviour / perception
illustration: not added — gated only.)

Example — `POST /api/translate/external-prompt {"text":"สวัสดีครับ","target_language":"en"}` (no auth):

```json
{"feature": "translate", "title": "แปลข้อความ", "instructions_th": "1. กดปุ่ม \"คัดลอก\" …",
 "expected_format": "markdown",
 "parts": [{"key": "main", "title": "แปลข้อความ",
            "system_prompt": "You are a professional translator. Translate the given text to English. Only return …",
            "prompt": "Translate this text to English:\n\nสวัสดีครับ"}],
 "filename": "translate-prompt.md"}
```

Example — survey: `POST /api/surveys/ai-generate/external-import`
`{"content": "```yaml\nsurvey: \"…\"\ntype: perception\nsections: [...]\n```", "model_label": "ChatGPT 5"}` → the created
`Survey` (200) or `422 {"detail": "อ่านรูปแบบแบบสอบถามที่ AI สร้างไม่ได้ — …"}`.

Example — customer value: `POST /api/cv/studies/{id}/ai-suggest/external-prompt {"brand_id":"…","category":"money"}`
→ `expected_format: "json"`, `parts[0].json_example = '{"suggestions":[{"label":"…","weight":2,"rationale":"…","principle":"kotler-value"}]}'`;
then `POST …/ai-suggest/external-import {"brand_id":"…","category":"money","content":"```json {…} ```"}` →
`{"category":"money","is_cost":true,"suggestions":[{"label":"…","weight":2,…}],"source":"external","model_label":null,…}`.

Frontend notes: API-key scopes `research.*` do not cover these (they are web-UI features); the CLI only
drives conjoint / brand-equity. `GET /api/platform/llm-policy` → `features[key]` decides whether to show the
system button, the external dialog, or both, using the keys in the first table.
