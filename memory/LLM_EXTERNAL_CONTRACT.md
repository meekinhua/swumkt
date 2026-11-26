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
response adds `quality_filter: {"exclude_flagged": bool, "excluded": n}` and
`methods_paragraph_th` (ready-to-adapt Thai methods paragraph built from this study's facts).

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

- API-key scopes: `POST /studies/{id}/coding/import-csv` and `DELETE /studies/{id}/coding` are
  not matched by the current `research.ai` rule (it only matches `external-(import|pack)`); suggest
  `("research.ai", {"POST","DELETE"}, r"^/api/brand-equity/studies/[^/]+/coding(/import-csv)?/?$")`.
- `ROUTE_FEATURES`: `/api/brand-equity/extract-identity` currently falls through to
  `be.ai_analyze`; the route itself calls `require_system_llm("be.visual_identity")`, but the
  path map should list it under `be.visual_identity` for consistency.

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
