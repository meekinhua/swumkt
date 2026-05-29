## 2026-05-29 — NEW TOOL: Customer Value Lab (CBS04: Value = Benefit − Price)

### Request (Thai)
Build a new tool based on the attached CBS04 marketing principle, better than a
sample Gemini HTML tool. Must include AI suggestions for what to add per category,
and an image-simulation module showing real product/service images.

### Principle implemented
Customer Value = Benefit − Price (Cost), with Kotler (value + engagement) and
Drucker (make selling unnecessary) framing. Benefit = 3 categories
(functional / economic / psychological); Cost = 3 categories
(money[incl. effort] / inconvenience[incl. time] / risk) — time & effort folded
in per the user's instruction.

### Backend — `routes/customer_value.py` (factory, router prefix /cv → /api/cv/*)
- CRUD: POST/GET/PUT/DELETE `/cv/studies(/{id})`, soft-delete + `/trash` + `/restore`.
- Ownership: admin sees all, creator-only otherwise (403 enforced).
- `POST /cv/studies/{id}/ai-suggest` {brand_id, category}: Gemini suggests 4-5
  factors to add per category (label/weight 1-3/rationale/principle). Robust JSON
  parsing. Model = **gemini-2.5-flash** (gemini-2.5-flash-lite is NOT enabled on
  the Emergent key despite being listed — fell back per user's "ก็ใช้ตามนั้น").
- `POST /cv/studies/{id}/ai-analysis`: strategic markdown comparing all brands.
- `POST /cv/studies/{id}/generate-image` {brand_id}: builds a prompt from the
  brand's checked benefits and renders a realistic product/service photo via
  **Nano Banana = gemini-3.1-flash-image-preview** (the 2.5 image model is
  deprecated/404). Compresses + stores via object storage → `/api/files/...`.
- Transparent scoring (`score_brand`, mirrored in frontend `cv-lib.js`):
  catScore=min(10, Σ checked weights); benefit_total=(func+econ+psych)/3·10;
  money mapped 1-10 by price within industry range; cost_total=(money+inconv+risk)/3·10;
  net = benefit − cost.

### Frontend — `pages/customer-value/`
- `CustomerValueListPage.jsx` (/market-research/customer-value): study list +
  create (industry chips) + trash.
- `CustomerValueStudioPage.jsx` (/:studyId): 4 tabs —
  1) **Value Audit**: brand columns, live Benefit/Cost gauges + Net Value, factor
     checkboxes + weight 1-2-3 + quick-add chips + custom add + per-category **AI**
     suggestion box, add competitors, winner banner (empty-state aware), debounced auto-save.
  2) **AI Strategy**: one-click Gemini strategic analysis (markdown).
  3) **Perception Timeline**: over/under/balanced-promise SVG simulation of
     expectation vs experienced value vs satisfaction.
  4) **Image Simulation**: per-brand Nano Banana product/service image generation.
- `cv-lib.js`: industry ranges, default factor library per industry, scoring math
  (mirror of backend), perception model.
- Editorial/Swiss design (`customer-value.css`); added to เครื่องมือ menu (hint CV).

### Testing — iteration_22.json: 100% (backend 12/12 pytest, frontend all flows)
- Tests at `/app/backend/tests/test_customer_value.py`. No critical/minor issues.
- Polish from review: winner banner shows "ยังไม่ได้ประเมิน" until ≥1 factor checked
  (avoids confusing negative Net on a fresh study from price-only cost).



## 2026-05-29 — Conjoint Stats Full Correctness Audit + Stale-Cache Fix

### User request (Thai)
"เอาให้มั่นใจว่า ค่าต่างๆ และวิธีต่างๆ ถูกต้องจริง ทั้งหมด" — verify ALL conjoint
statistical values and methods are genuinely correct, end to end.

### What was verified
1. **Mathematical correctness — proven via synthetic ground-truth tests.**
   New suite `/app/backend/tests/test_conjoint_stats_correctness.py` (12 tests,
   all PASS). Builds a synthetic study where respondents choose by a KNOWN logit
   utility (Price=2.0 > Quality=1.0 > BrandA=0.4, reference=last level) and
   confirms every estimator recovers the truth:
   - `_calc_fit_diagnostics`: McFadden ρ², LR=2·(LL−LL_null), df, χ² p-value,
     and all five fit-labels hand-checked.
   - MNL recovers coefficient SIGNS + RANKING + values close to truth, drops the
     LAST level as reference (Price_High/Quality_Bad/Brand_BrandC absent),
     ρ²>0.10, LR p<1e-6, importance ranks Price>Quality>Brand.
   - Counting method = conditional selection rate (sel/appearance), preferred
     levels rank higher.
   - OLS signs correct, reference coef = 0 + flagged, R²∈[0,1].
   - Reference consistency: MNL & OLS both drop the same (last) level.
   - Orphan level_id preserved as `__ORPHAN_*__` (no silent row drop); new
     attribute → `__MISSING__`; row count preserved.
   - Mixed Logit signs + LR df = 2K; HB individual posteriors are genuinely
     heterogeneous (std>0) with monotone quantiles.

2. **Real-data finding — the low ρ² is GENUINE, not a bug.** On the two live
   studies with ≥30 responses ("นมหมี" n=120, "ข้าว" n=51) ρ²≈0.003–0.006.
   Investigation proved the response data is statistically random:
   - Selected-alternative POSITION distribution is uniform (นมหมี: 24.3–25.6%
     across 4 positions; uniform=25%).
   - Per-level conditional selection rates are FLAT (max spread ≤3.7pp across
     every attribute in both studies).
   - LR test p=0.67 → model NOT significantly better than equal-probability null.
   Conclusion: these are seeded/test responses with no preference signal, so
   ρ²≈0 is the mathematically correct result. The synthetic test confirms the
   SAME engine returns ρ²>0.10 the moment real signal exists.

### Bug found & fixed — stale `analysis_cache` hid the new diagnostics
`GET /conjoint/studies/{id}/statistical-analysis` cached per-method results in
`db.analysis_cache` and never invalidated on code change. Studies analysed
BEFORE the LR-test / fit_label fields were added kept serving old cached results
where `lr_statistic`, `lr_df`, `lr_p_value`, `fit_label`, `fit_description` were
all `null` — so the frontend "Model Fit Diagnostics" card showed blanks even
though a fresh compute (`?force=true`) returned them correctly.

**Fix** (`routes/conjoint.py`): added `ANALYSIS_CACHE_VERSION = 2`. The cache
write now stamps `schema_version`; the read paths (main endpoint + thesis
background per-method reuse) treat a version mismatch as a cache MISS and
recompute. Old rows self-heal on next view — no manual purge needed.

### Verified end-to-end
- API default (non-force) call #1 → `cached:false` (recomputed, full
  diagnostics); call #2 → `cached:true` serving fresh v2 cache WITH diagnostics.
- Live frontend `/conjoint/results/{นมหมี}` → "เชิงวิชาการและสถิติ" tab → Model
  Fit Diagnostics card renders: badge "ρ² 0.003 · ฟิตต่ำ", LR χ²=10.24 df=13,
  p=0.675 "Model ไม่ดีกว่า null อย่างมีนัยสำคัญ", McFadden scale + Thai
  explanation. Pseudo R² 0.26%, LL −1991.1, AIC 4008.3, n=5,760.
- 12/12 pytest pass; no new lint errors introduced.



## 2026-05-25 — Why MNL Pseudo R² was Stuck Near Zero: Root-Cause Fix

### User-reported issue
"ตอนนี้คำนวณ Pseudo R² ยังไง ทำไมค่าต่ำมากตลอด" — McFadden's ρ² was
showing 0.001-0.006 on every real study, making the academic dashboard
look broken.

### Diagnosis
The formula was already correct McFadden:
  LL_null = -Σ log(C_i)         # equal-prob over alternatives per choice set
  ρ²      = 1 - LL_model/LL_null
But ρ² was being suppressed by **two real bugs** + **one UX gap**:

1. **Orphan level_ids silently dropped from X.** When a study editor removed
   or renamed a level after `choice_sets` had been generated, the profiles
   inside `choice_sets[*].profiles[*].attribute_levels` still referenced
   the deleted level_id. `_build_conjoint_data_rows` looked up
   `level_value_map[(attr_id, lvl_id)]`, hit None, and silently SKIPPED the
   row's column. Result: entire dummies for that attribute went missing
   → MNL had nothing to learn → ρ² ≈ 0. Confirmed on "นมหมี" study:
   `แบรนด์` had 2 levels in `attributes`, 4 used in profiles, 2 orphans.

2. **No guard against the mutation itself.** `PUT /studies/{id}/attributes`
   accepted any attribute change even when there were already `choice_sets`
   referencing the old IDs — so the corruption could re-introduce itself
   any time the user edited a study post-design.

3. **No UX for what McFadden's ρ² actually means.** Users naturally compare
   it to OLS R² (where 0.7+ is normal). For discrete choice, McFadden (1979)
   himself defines 0.2-0.4 as "excellent fit" — but we never said that on
   the page, so users saw 0.05 and assumed the system was broken.

### Fix
- **`_build_conjoint_data_rows`** now preserves orphans as `__ORPHAN_xxxxxxxx__`
  and missing-attr cells as `__MISSING__` so encoding sees a real categorical
  value instead of `NaN`. Information is no longer lost.
- **`_calc_fit_diagnostics`** new shared helper: computes McFadden ρ²,
  likelihood-ratio χ² statistic, df, p-value, and a categorical
  `fit_label` ("poor" / "fair" / "good" / "excellent" / "exceptional")
  following McFadden's published thresholds. Returned by MNL, Mixed Logit,
  and HB endpoints.
- **`PUT /studies/{id}/attributes` validator** — if any `(attr_id, level_id)`
  referenced by existing `choice_sets` no longer exists in the new attribute
  spec, the endpoint now wipes `choice_sets`, reverts `status` to `draft`,
  and returns `choice_sets_cleared: true` with an explanatory message.
- **`ConjointResultsPage.js`** — new "Model Fit Diagnostics" card above
  the method-specific summary blocks. Shows ρ² + colored label badge,
  LR χ² with df, LR p-value with significant/not-significant verdict in
  Thai, and the McFadden scale legend ("0.2-0.4 = excellent fit"). Renders
  for MNL / Mixed Logit / Hierarchical Bayes.

### Verification
- Smoke-tested `_build_conjoint_data_rows` on the "นมหมี" study: orphan
  brand levels are now encoded as two extra dummies and surface in the
  fitted coefficients (no more silent drop).
- API round-trip through `GET /statistical-analysis?method=mnl`:
  new fields `lr_statistic`, `lr_df`, `lr_p_value`, `fit_label`,
  `fit_description` are present in `results`.
- Validator test: created a study, generated design, mutated attribute IDs
  → server returned `choice_sets_cleared: true`, `status=draft`,
  `len(choice_sets)=0`. ✓

---


## 2026-05-25 — H1 Verified: True D-Optimal Choice-Set Design

### What
Tested and verified the K-exchange / modified-Fedorov D-optimal design
generator that was implemented at the end of the previous fork in
`/app/backend/routes/conjoint.py::generate_d_optimal_design`. Also fixed
a critical SyntaxError caused by `_dummy_encode_consistent_reference` being
inserted inside the `_individual_posteriors` docstring (the file would
not import; backend was relying on prior reload state).

### Verification
- Unit test (3×3×2 attributes, 8 sets × 3 alts):
  Perfect level balance — Price 8/8/8, Brand 8/8/8, Color 12/12.
  0 duplicate profiles within sets. ~0.1 s runtime.
- D-efficiency vs random (4 attributes 3×4×3×2, 8 sets):
  log|X'X|  D-opt = 15.05  vs  Random = 13.32  →  +1.72 log-units
  (≈ 5.6× larger determinant — more informative design).
- End-to-end API smoke test through
  `POST /api/conjoint/studies/{id}/generate-design`:
  Real attribute IDs persisted, choice_sets length matches
  `calculate_optimal_choice_sets`, and balance preserved when
  round-tripping through MongoDB.

### Status
H1 (academic-grade D-optimal design) — COMPLETE.

---


## 2026-05-23 — Performance Audit v2: 22 MB freed from MongoDB

### Why
A re-audit after the v1 migration revealed three remaining hot spots still
inflating documents and slowing list / detail APIs:
- `conjoint_studies.choice_sets[*].profiles[*].profile_image_url` held base64
  data URIs (avg 248 KB each × 58 profiles = **14 MB total**). The biggest
  study "นมหมี" was a 7 MB single document.
- `contents.attachments[*].file_data` and `behavior_metadata.image_url` —
  another **6.3 MB** of inline base64 (largest single field: 2.23 MB).
- `cms_posts.cover_image` and `media[*].src` still held base64 even though
  the v1 migration had written `/api/files/...` URLs into sibling fields.
  Field names mismatched what the frontend read, so the base64 was dead
  weight (**2.75 MB**).
- `users.avatar_url` had a 32 KB base64 webp for the test student account.

### Fix
1. New script `/app/backend/scripts/migrate_heavy_fields_v2.py` walks all
   three collections and rewrites each base64 value in-place with the
   storage URL returned by `lib/object_storage.upload_b64_image`. Because
   the frontend uses each field directly as `<img src>`, replacing the value
   is transparent — no React change required.
2. One-off cleanup pass on `cms_posts` to sync the legacy fields that v1
   had only mirrored: copied `cover_image_url` → `cover_image` and the
   per-media `url` → `src`, freeing the base64 strings.
3. Updated source endpoints so new data lands in object storage from the
   start (prevents re-bloat):
   - `routes/conjoint.py` `generate-profile-image` → wraps the freshly
     generated data URI through `normalize_image_for_storage` before
     persisting.
   - `server.py` `share-as-content` (behavior + perception) → routes the
     attachment and `behavior_metadata.image_url` through the same helper.
   - `server.py` `create_content` / `update_content` → normalizes every
     `file_data` field on incoming attachments.
   - `server.py` `update_profile` → normalizes `avatar_url`.

### Impact (verified on live preview DB)
| Collection | Before | After | Δ |
|------------|-------:|------:|---:|
| `conjoint_studies` | 19.58 MB | **5.55 MB** | −72 % |
| `contents` | 8.10 MB | **1.76 MB** | −78 % |
| `cms_posts` | 2.75 MB | **0.07 MB** | −97 % |
| **Total DB data** | ~32 MB | **9.57 MB** | **−70 %** |

Largest single conjoint study went from **7 MB → 39 KB** (180× smaller).
The `GET /api/conjoint/studies/{id}` response (full view) is now 73 KB
where it was previously up to 7 MB — about 100× faster transfer.

### Verified
- Survey page (`/survey/conjoint/<id>`) for "นมหมี" renders all 4 profile
  images correctly from `/api/files/swumkt/conjoint-profiles/...` URLs.
- Conjoint Results page MNL auto-loads on first open (previous bug fix
  also verified — see same-day fix below).
- Smoke-tested: study list, study detail, CMS pinned, content list — all
  return 200 and reasonable payload sizes.

### Known follow-up
- `AnnouncementsPage` cards render with `<img>` height 0 due to a CSS
  layout issue (image has `position: absolute; inset: 0` but parent has
  only `min-height`, no fixed height in grid). This is a **pre-existing**
  UI bug unrelated to the migration — image data loads correctly; only
  rendering box collapses. Logged for future investigation.


## 2026-05-23 — Conjoint Results: MNL no longer requires manual method switch

### Why
On the Conjoint Results page the dropdown defaulted to `MNL`, but the
display kept showing the Counting result until the user manually switched
methods. Cause: a duplicated useEffect chain plus an auth-state race —
`loadResults` was wired to `[user, token, studyId]`, so each auth hydration
re-ran the fetch and re-wrote `currentResults` back to the counting payload
right after the parallel MNL effect had populated it. The MNL effect's
own `!statisticalData` guard then blocked a re-load.

### Fix (`ConjointResultsPage.js`)
- Dependency list reduced to `[studyId]` so `loadResults` runs once per
  study.
- The default MNL fetch is now invoked inline at the tail of `loadResults`,
  guarded only by `respondent_count >= 30` (avoids the insufficient-data
  branch crashing the panel).

### Verified
Opening `/conjoint/results/<id>` on a 120-respondent study now shows
Pseudo R², Log-likelihood and AIC immediately — no manual method switch
required.



## 2026-05-11 — AI insight cache keyed by wave

### Why
The dashboard's "Run AI analysis" had been generating a SINGLE master-insights
set per study (keyed by filter signature only) — so switching the new Wave
Selector chip between Wave 1 and Wave 2 showed identical AI recommendations
even though the underlying response sets were entirely different. Insights
couldn't pick up shifts driven by a new wave's campaign / questionnaire
revision.

### Fix
`/studies/{id}/ai-analyze` and `/studies/{id}/ai-status` now accept the
same `wave` query param the dashboard endpoint uses. Both endpoints:
1. Translate `wave` via `_wave_bounds()` into ISO time bounds.
2. Apply those bounds (only if the caller didn't supply explicit from/to)
   when computing the cache signature.
3. Background `_run_ai_analysis` receives the effective from/to and writes
   its result to a signature-specific cache slot in
   `ai_cache_by_filter.<sig>`.

This piggybacks on the existing per-filter caching infrastructure — Wave 1,
Wave 2, "all waves" each become a distinct sig hash with its own cache
slot, all refreshable independently.

### UI signal
Master Insights rail now shows:
- A small `WAVE N` badge next to the eyebrow when filter.wave isn't `all`.
- "**Insights scoped to wave N** — switch wave above to refresh." appended
  to the subtitle so researchers don't get confused about scope.

### Verified
- `ai-status?wave=all` → sig `all`, status `ready`, 5 insights (existing).
- `ai-status?wave=1` → sig `89810edc3b3c`, status `idle` (fresh slot).
- `ai-status?wave=latest` → sig `d9c50ea29e74`, status `idle` (distinct).
- `POST ai-analyze?wave=1` → status `queued`, sig `89810edc3b3c`
  (runs independently from the wave=all run).
- Screenshot confirmed: clicking Wave 1 chip surfaces "WAVE 1" badge on
  the AI insights card.


## 2026-05-11 — Wave Selector UI + Migration Orphan Banner

### Wave Selector (backend + frontend)
- **Backend** (`/studies/{id}/dashboard`):
  - New `wave` query param: `all` | `latest` | `<N>`.
  - New helper `_wave_bounds(wave_history, param)` translates the param into
    ISO time bounds (from prior wave's `published_at` → next wave's
    `published_at` or open-ended for the latest).
  - Wave bounds are applied as `from_iso`/`to_iso` overlay on top of the
    existing `_apply_response_filter`; explicit date params from the UI
    take precedence so the date-range filter still works in tandem.
  - Response always includes a `waves: [{wave, published_at, by,
    questions_changed, questions_total, n_responses}]` summary for the UI.
- **Frontend** — new `BeWaveSelector` (`be-components.jsx`):
  - Hidden when study has only 1 wave (no choice to make).
  - Chips: รวมทุก Wave / Wave N (ล่าสุด) / Wave 1 / Wave 2 … each with
    `n=<count>` + publish date sub-label.
  - Active chip rendered in solid dark green (`#0E5538`); inactive chips
    are outlined.
  - Wire-up: `filter.wave` added to filter state, included in `buildFilterQS`,
    triggers `load()` via `useEffect` dep.
  - Verified end-to-end: `wave=all` returns 21 responses (Mali study);
    `wave=1` returns 21 with composite scores; `wave=2` correctly returns 0
    because nothing was collected after the wave-2 republish.

### Migration Orphan Banner
- **Backend** — migrate now persists `migration_meta` on the study doc:
  `{last_migrated_at, phase2_orphan_relinked, phase2_unmappable_orphans}`.
  Surfaced verbatim in the dashboard response.
- **Frontend** — new `MigrationOrphanBanner` (`be-components.jsx`):
  - Amber border + "DATA LINEAGE NOTICE" badge when
    `phase2_unmappable_orphans > 0`.
  - Plain-language explanation that orphan rows are safe in DB but excluded
    from composites, plus actionable suggestion (regenerate questions or
    contact admin for manual relink).
  - Shows last migration timestamp for audit trail.
  - Hidden entirely on healthy studies (orphans=0 AND relinked=0).
- Verified on study `02a6ff40` (6 unmappable orphans): banner renders
  with full explanation; verified hidden on study `c5b3458f` (no orphans).

### Files touched
- `/app/backend/routes/brand_equity.py` — `_wave_bounds`, dashboard
  `wave` param, `migration_meta` written by admin endpoint.
- `/app/backend/server.py` — `migration_meta` written by startup migration.
- `/app/frontend/src/pages/brand-equity/be-components.jsx` —
  `BeWaveSelector`, `MigrationOrphanBanner`.
- `/app/frontend/src/pages/brand-equity/BrandEquityDashboardPage.jsx` —
  `filter.wave` state, `wave` in `buildFilterQS`, imports + render slot
  above the BeFilterBar.


## 2026-05-11 — Auto-migration on startup + Phase 2 cross-template orphan re-link

### Why
User asked whether they should visit `https://swumkt.org/admin/relink-stable-ids`
in a browser — it's a POST endpoint so opening in browser doesn't work. To
remove that friction (and avoid asking the user to run curl), the migration
now runs **automatically on every backend startup**. Idempotent → no-op on
subsequent boots when there's nothing left to migrate.

### Phase 1 fix to the merge helper
Previous `_merge_questions_preserving_history` reused the OLD id verbatim
whenever `same_shape == True`. For migrating legacy studies that meant we
KEPT the random-suffix ids forever (defeating the migration). Fix: only
reuse the OLD id when it's already in the modern stable form (`--`
separator). Otherwise adopt the new stable id and stash the legacy id in
`legacy_ids`. Wave only bumps when wording/scale actually changed —
migration-only swaps don't pollute the wave timeline.

### Phase 2 — cross-template orphan re-link (new)
Even with Phase 1 stable-id merging, some legacy studies had a more drastic
issue: their *template structure itself* had been overhauled (e.g., old
study used templates `BI-3`, `PQ-5`, `LY-1`; current study has `COMP-1`,
`ASD-1`, `PQ-2`). Phase 1 only merges by slot key (template_id +
compare_brand + dimension), so those responses were still orphaned.

Phase 2 scans `brand_responses` for question_ids missing from
`{q.id} ∪ q.legacy_ids` of the migrated study. For each orphan it derives
the prior `template_id` (strip the trailing `-{4hex}`) and re-links into
the new question with the matching template_id (preferring the
non-`compare_brand` variant since legacy single-brand surveys had no
per-competitor variants).

### Where it runs
- `@app.on_event("startup")` in `server.py` — runs both phases for every
  study that needs them, logs `[BE-MIGRATE]` when work was done.
- `POST /api/brand-equity/admin/relink-stable-ids` — same logic, available
  for manual re-runs / admin tooling.

### Verified
- Study `0a0a1f3b` (12 responses w/ BI/PQ/LY ids but study uses COMP/ASD/PQ)
  went from **0/42 questions with data** → **18/42** after Phase 2 re-link,
  composite scores now visible (awareness 89.3, identity 42.5, loyalty 90,
  overall 75).
- Study `02a6ff40` had 6 truly unmappable orphans (template prefix no
  longer exists at all in current study) — these are surfaced in
  `phase2_unmappable_orphans` and require manual researcher review.
- All 11 studies now have stable ids end-to-end (random=0 everywhere).


## 2026-05-11 — Fix: Regenerate Questions Drops All Old Responses (P0)

### Symptom
User reported: clicking "Regenerate questions" + Save&Republish on a Brand
Equity study caused the dashboard to come back **empty** — even though 21
responses were definitely already in the DB.

### Root cause
`_generate_questions_from_template` generated question ids of the form
`f"{tmpl_id}-{uuid4.hex[:4]}"` — a NEW random suffix on every regenerate.
The dashboard aggregator (`_aggregate_responses`) groups answers by
`question_id` and matches against the CURRENT `study.questions[i].id`, so
every old response (which still pointed at the prior random suffix) became
an orphan that wasn't visible anywhere.

### Hybrid Solution (option C as agreed with user)
Academic-research best practice: **stable slot identity + visible wave
history + non-destructive legacy linkage**.

1. **Deterministic ids** in `_generate_questions_from_template`:
   `f"{tmpl_id}--{slugify(override_competitor or 'self')}"` →
   same template + same competitor variant always produces the same id.
   New helper `_slugify_slot` keeps Thai competitor names safe via 8-char
   md5 hash when not ASCII-clean.
2. **`_merge_questions_preserving_history(old, new)`** (new helper):
   - Matches by slot key = (template_id, compare_brand, dimension).
   - Same shape (prompt_th + scale + type unchanged) → reuse OLD id verbatim,
     wave stays the same.
   - Shape changed → keep NEW deterministic id, stash old id in
     `legacy_ids: List[str]`, bump per-question `wave`, archive prior prompt
     into `prev_prompt_th` for audit.
3. **`_aggregate_responses`** now pools values from `[qid] + legacy_ids`
   when collecting answers for a question. This is the standard
   "stable construct, evolving instrument" survey-research pattern.
4. **Study-level wave tracking**:
   `current_wave: int` + `wave_history: [{wave, published_at, by, questions_changed, questions_total}]`
   auto-appended on every regenerate that materially changes any question.
5. **Backfill endpoint** `POST /api/brand-equity/admin/relink-stable-ids`
   (admin-only, idempotent): walks every existing study, regenerates ids
   to the new deterministic form, captures the prior random ids into
   `legacy_ids`. After running this once, all existing studies' dashboards
   pick up their historical data seamlessly.

### Verified
- Migration: 11 studies migrated; study `c5b3458f` got 18 questions with
  legacy_ids, study `a407a08f` got 41.
- BEFORE: 21 responses, 18/18 questions with data, composite normal.
- AFTER migration + regenerate (wave 2): still 21 responses, 18/51
  questions with data (51 because the new generation expanded competitor
  coverage), composite scores stable.
- `wave_history` correctly logged: wave 1 system-backfill →
  wave 2 admin republished 2026-05-11 (18 changed / 51 total).

### Files touched
- `/app/backend/routes/brand_equity.py`:
  - new `_slugify_slot`, `_question_slot_key`, `_merge_questions_preserving_history`
  - rewrote `build()` to use deterministic ids + stamp `wave / legacy_ids`
  - rewrote `regenerate_questions` to call merge helper + maintain wave_history
  - new admin endpoint `/admin/relink-stable-ids`
  - `_aggregate_responses` now reads `legacy_ids`


## 2026-05-11 — Global LLM Concurrency Patch (catches ALL 30+ call sites)

### Why this matters
Previous fix only protected `_gemini_call` (brand_equity.py) and
`_call_gemini_with_retry` (server.py) — two of ~32 places that call
`chat.send_message(...)` directly. The other 30 (CMS, citation formatter,
doc formatter, ref extract, image gen, vision, thesis ai, etc.) still
blocked the FastAPI event loop on every Gemini latency.

### Fix
Installed a **library-level monkey-patch** at server.py top-of-module that
wraps `emergentintegrations.LlmChat.send_message` and
`send_message_multimodal_response` with:
- `asyncio.to_thread(...)` — runs the sync-inside-async flow in a worker
  thread so the event loop keeps serving HTTP traffic.
- Process-wide `asyncio.Semaphore(3)` — caps concurrent in-flight LLM calls
  (was 2 in old per-route guards; bumped to 3 since one user's AI analysis
  also benefits from a little intra-job parallelism).
- `asyncio.wait_for` timeout (90s for text, 180s for multimodal/image gen)
  so a hanging Gemini call cannot reserve a semaphore slot forever.
- Idempotent (`_emrg_patched` flag) — survives uvicorn hot-reload.

### Cleanup
Removed the now-redundant per-module guards (`_GEMINI_SEM`,
`_GLOBAL_GEMINI_SEM`) and the manual `_sync_call` thread wrappers in
`brand_equity._gemini_call` and `server._call_gemini_with_retry`. They
were also a foot-gun: with the global patch, the old wrappers would have
been "thread inside thread + new event loop inside new event loop" which
deadlocks worker pool.

### Verified
- Patch confirmed via `LlmChat._emrg_patched == True` and
  `LlmChat.send_message.__name__ == '_wrapped_send'`.
- 5 parallel `/auth/me` calls fired immediately after triggering AI
  analysis: 173 ms, 175 ms, 188 ms, 195 ms, 269 ms.
- Sustained over 24 s of AI running: every concurrent `/auth/me` returned
  in 107-192 ms.

### Coverage now includes
- ✅ Brand Equity `/ai-analyze` (4 sequential phases × multiple sub-calls)
- ✅ Brand Equity `/thesis-ai-start` (AI chapters 1-5)
- ✅ Conjoint AI insights + AI-generated DOCX
- ✅ CMS AI assist (routes/cms.py)
- ✅ Citation style formatter, doc_formatter, ref_extract
- ✅ Vision (image description), translation, image generation paths
- ✅ Any future `chat.send_message(...)` — automatic.


## 2026-05-11 — AI Job Progress Bar + P0/P1 verified

### Verified P0 (Brand X) — already resolved
- `_generate_questions_from_template` already builds options dynamically from
  `brand_list = [brand_setup.name] + competitors`. No hardcoded decoy strings.
- Admin cleanup endpoint exists to scrub legacy studies. DB scan confirms
  **0 studies** in production with stale "Brand X/Y/Z" options.

### Verified P1 (Conjoint Trash) — already resolved
- Backend endpoints exist: `/conjoint/studies/trash`, `/restore`, `/purge`.
- Frontend `ConjointAnalysisTool.js` ships `view='active'|'trash'` toggle and
  Trash UI parity with Brand Equity.

### NEW: Live AI progress bar
- Backend (`_run_ai_analysis`): writes a `progress` dict to `ai_cache.progress`
  on every phase transition with `step / total / phase / elapsed_sec / pct`.
  4 phases: Normalize → Themes → Identity↔Image → Master Insights. Final
  state pinned to 100% / "เสร็จสมบูรณ์" so the UI can flash the success state.
- Frontend `BrandEquityDashboardPage`: polling every 2.5 s instead of 3 s,
  captures `progress` field into `aiProgress` state, optimistically seeds
  `step=0` immediately on click so the card appears before the first poll
  lands. Card auto-fades 2.2 s after completion.
- New component `AIProgressCard` in `be-components.jsx`: gradient progress
  bar, 4 stepper pills with active/completed states + check marks, shimmer
  band while running, live elapsed-time counter, prominent reassurance:
  "ระบบยังให้บริการผู้ใช้คนอื่นได้ตามปกติระหว่าง AI ทำงาน". Stacks 2×2
  pills on mobile via internal `<style>` tag (≤700 px).

### Verified end-to-end
- API: `POST /ai-analyze` → `GET /ai-status` returned progress 1/4 → 2/4 →
  3/4 → 4/4 with correct Thai phase labels and rising elapsed seconds.
- UI screenshot (1440×900): card renders at 100% with all 4 steps checked,
  reassurance text visible, elapsed time "1น 29ว".


## 2026-05-11 — Fix: AI Analysis Freezing Entire Platform (P0)

### Symptom
User reported: clicking "วิเคราะห์ด้วย AI" on a Brand Equity study would freeze
the entire app — other users couldn't login, load dashboards, or do anything
until the AI job finished (60-120s).

### Root cause
`emergentintegrations.LlmChat.send_message` (used by both
`routes/brand_equity._gemini_call` and `server._call_gemini_with_retry`)
internally invokes `litellm.completion(...)` — the **synchronous** httpx call —
from inside an `async def`. There is no real `await`-able I/O at the bottom
of the stack, so `await chat.send_message(...)` actually **blocks the FastAPI
event loop** for the full Gemini latency. A single AI analysis fires ~6+
Gemini calls back-to-back; while any one is in flight, every other HTTP
request the worker is supposed to handle (login, dashboard fetch, even
static-asset proxying through ingress) queues up and times out.

### Fix
Wrapped every Gemini call with **two layers** of protection:
1. **`asyncio.to_thread`** — push the blocking sync call into the default
   worker-thread pool. The FastAPI event loop is freed within microseconds
   and keeps servicing other requests in parallel.
2. **Process-wide `asyncio.Semaphore(2)`** — at most 2 Gemini calls in flight
   simultaneously system-wide (`_GEMINI_SEM` in brand_equity.py + a separate
   `_GLOBAL_GEMINI_SEM` in server.py for the shared retry helper). Prevents
   a single user's analysis from spawning 20 threads / saturating the proxy.
3. **60s / 90s `asyncio.wait_for` timeouts** — releases semaphore slots even
   if Gemini hangs.

### Verification
Triggered AI analysis on study `Mali` and timed parallel `/auth/me` calls
every 5 s for 30 s. Result: every concurrent call returned in 100-200 ms
while `ai-status: running` — the platform stayed fully responsive end-to-end.

### Files touched
- `/app/backend/routes/brand_equity.py` — rewrote `_gemini_call`, added
  `_GEMINI_SEM = asyncio.Semaphore(2)` at AI Integration section top.
- `/app/backend/server.py` — rewrote `_call_gemini_with_retry`, added
  `_GLOBAL_GEMINI_SEM = asyncio.Semaphore(2)` above it.


## 2026-05-11 — Mobile Layout Fix + 5 More Charts in Thesis DOCX

### Mobile Layout (P0 — RESOLVED)
- Root cause discovered: 3 cards (`gridColumn: 'span 2'`) inside `.be-grid-2` parents
  were forcing the implicit grid to expand to 2 columns even when CSS specified single
  column on mobile. The previous agent's CSS overrides were correct but defeated by
  `span 2` items creating implicit columns.
- Fix:
  1. New defensive class `.be-stack-2` (mobile: `grid-template-columns: minmax(0,1fr)`,
     desktop ≥901px: `1fr 1fr`) used on the awareness / quality / loyalty wrappers.
  2. New `.be-span-2` utility (mobile: `grid-column: 1`, desktop: `span 2`) replaces
     the inline `style={{ gridColumn: 'span 2' }}` so full-bleed cards behave correctly
     on both viewports.
  3. `.be-card` now has `overflow-x: hidden`; `.be-page` clamps to viewport — defensive
     overflow guards.
- Verified at 390×844 (iPhone) and 1440×900 (desktop). Identity Map stacks vertically
  with all 5 intended + 9 perceived traits visible; NPS card no longer collapses to
  ~30px wide.

### Brand Equity Thesis DOCX — 5 new charts + themes appendix
Brand Equity AI Thesis (`enrich_thesis_docx`) now embeds **16 chart slots** (was 9),
covering every visible dashboard chart:
- ก-1 Brand Equity Score 4-dim breakdown (NEW, `render_bes_breakdown`)
- ก-3 Unaided Recall HBar (NEW, `render_hbar_counts`)
- ก-4 Aided Recognition HBar (NEW, `render_hbar_counts`)
- ก-8 Voice of Respondent · quality themes (NEW, `render_open_end_themes`)
- ก-13 One-word Identity Cloud (NEW, `render_one_word_cloud`)
- ก-15 Loyalty Means — Repeat Intent + Switching Resistance (NEW, `render_loyalty_means`)
- ก-16 Why Customers Stay · loyalty themes (NEW, `render_open_end_themes`)
- New appendix **ฉ — Open-end Themes & Sample Quotes** with verbatim quotes table.
- Replaced unsupported glyphs (σ, →) with ASCII to avoid Loma font tofu warnings.
- Verified end-to-end on study `Mali` (21 responses): 13 charts + 18 tables embedded,
  595 KB DOCX, all Thai labels render with bundled Loma.otf.


# CHANGELOG — SWU Marketing Research & Alumni Platform


## 2026-02-11 — Identity vs Image Connector: เส้นเชื่อมถูกต้องตามตำแหน่งจริง 🎯

### User-reported: เส้นไม่ครบ + ไม่ตรงกับแต่ละจุด
- **Root cause**: SVG ใช้พิกัด **hardcoded** (`startY = 30 + i * 60`) ที่ไม่
  สัมพันธ์กับตำแหน่งจริงของ trait row บน DOM → เส้นปลาย/ต้น lag ออกนอกการ์ด
  เมื่อจำนวน row ของซ้าย/ขวาไม่เท่ากัน + cubic Bezier ใช้ตัวเลขสุ่มทำให้เส้นเด้งผิดที่
- **Fix**: rewrite `IdentityImageMap` ใน `be-components.jsx`:
  1. ใส่ `ref` ทุก trait card ทั้ง 2 ฝั่ง
  2. `useLayoutEffect` + `ResizeObserver` คำนวณ y-position จริงของแต่ละ row
  3. SVG `viewBox` ขยายตาม wrapper height แบบ dynamic (`setWrapH`)
  4. `_findMatchingImageIdx`: fuzzy match 3 รอบ
     - exact match บน aligned row
     - substring match บน aligned row
     - substring match บน **ทุก** row (จับ "Premium" → "Premium / Expensive")
  5. 4 line kinds:
     - `aligned`     · เส้นโค้งเขียว + endpoints dots ทั้ง 2 ฝั่ง
     - `aligned-stub`· stub เขียวสั้น "✓ no-match" (intended อยู่ใน aligned[]
                       แต่หา image row ไม่เจอ)
     - `lost`        · stub แดงประสั้น "✕" ทาง LEFT เท่านั้น
     - `unintended`  · stub ทองประสั้น "+" ทาง RIGHT เท่านั้น

### Legend ใหม่ที่ explainable
- Inline legend ด้านบนของ map: aligned (เขียว) · lost (แดง) · unintended (ทอง)
  มี SVG icons จริงข้างชื่อแต่ละ kind → user เข้าใจว่าเส้นแต่ละแบบหมายถึงอะไร

### Verified
- Mali study: 4/5 intended aligned (Modern, Artisanal, Premium, Mindful) + Local lost
  → ทุกเส้นเชื่อมถูกต้อง · Premium fuzzy-match กับ "Premium / Expensive" สำเร็จ
  · Mindful fuzzy-match กับ "Mindful / Slow Living" สำเร็จ
- Unintended (Young & Hip, Aesthetic, Cozy, Sophisticated) → stub ทองด้านขวา


## 2026-02-11 — Bundle Thai Font (Loma.otf) with Codebase 🇹🇭📦

### User-reported: ภาษาไทยใน chart รูป thesis **บน production** ยังเป็นกล่อง □□□
- **Root cause**: Production container ไม่มี `fonts-thai-tlwg` package → Loma.otf
  ไม่อยู่ใน `/usr/share/fonts/` → matplotlib fallback ไป DejaVu (ไม่มี Thai glyphs)
- **Fix**: คัดลอก `Loma.otf` + `Loma-Bold.otf` ลงใน **`/app/backend/fonts/`** ของ
  codebase → font จะถูก deploy ไปด้วยทุกครั้งที่ push code ขึ้น production
- `be_thesis_charts.py` ค้นหา font ตามลำดับ:
  1. `<backend>/fonts/Loma.otf` (bundled, ALWAYS works) ⭐
  2. `/usr/share/fonts/opentype/tlwg/Loma.otf` (system package)
  3. `/usr/share/fonts/truetype/tlwg/Loma.ttf` (alt path)
- Verified: `Active Thai font path: /app/backend/fonts/Loma.otf` หลัง restart →
  Thai chars (ส, ถ, า, น, ะ, ห, ร, ู, ห, ร, า, ฯลฯ) render ถูก 100%

### Files added
- `/app/backend/fonts/Loma.otf` (50KB, 363 glyphs ครอบคลุม Thai + Latin)
- `/app/backend/fonts/Loma-Bold.otf` (48KB)


## 2026-02-11 — Graceful Degradation: Download Always Succeeds 🛟

### User-reported: "ดาวน์โหลดไม่สำเร็จ" บน production แม้ cache hit
- **Root cause hypothesis**: Production container อาจไม่มี `Loma.otf` (fonts-thai-tlwg) หรือ
  `mmdc` (mermaid-cli) → matplotlib/python-docx ขัดข้องตอน render appendix → entire
  endpoint return 500 → frontend ขึ้น "ดาวน์โหลดไม่สำเร็จ"
- **Fix**: 3-level graceful fallback ใน `thesis-ai-download` endpoint:
  1. **Mermaid pipeline**: ถ้า mmdc ไม่มี/fail → skip diagrams ทุกอัน, ดำเนินงานต่อ
  2. **Base DOCX render**: ถ้า fail → 500 (เป็น critical step, ไม่ degrade ได้)
  3. **Appendix enrichment** (charts + tables): ถ้า fail → fall back ไป base DOCX
     เท่านั้น user ยังได้ thesis ที่ใช้งานได้
- เพิ่ม logging:
  - `[BE-Thesis-DL] cache_key=... ai_md_len=...`
  - `[BE-Thesis-DL] base docx rendered: N bytes`
  - `[BE-Thesis-DL] enriched docx: N bytes (+M from appendix)`
  - บน production สามารถ check logs เพื่อ trace ปัญหาได้

### Thai font: graceful detection
- `be_thesis_charts.py` ตอน import ค้นหา Loma ใน 3 paths:
  - `/usr/share/fonts/opentype/tlwg/Loma.otf`
  - `/usr/share/fonts/truetype/tlwg/Loma.ttf`
  - `/usr/share/fonts/truetype/thai/Loma.ttf`
- ถ้าไม่เจอ → ใช้ default sans-serif แทน + log warning (charts ยัง render ได้,
  แค่ภาษาไทยอาจเป็น tofu — ดีกว่าทั้ง pipeline พัง)

### Verified บน preview
- Download: 200 OK, 311KB DOCX valid
- Logs ใหม่ครบ — สามารถ trace step-by-step ได้บน production


## 2026-02-11 — Thai Font (chart): Explicit FontProperties Fix + Mobile AI Overflow 🇹🇭📱

### 🇹🇭 Thai font in charts — root cause + fix
- **สาเหตุ**: matplotlib's `rcParams["font.family"]` ไม่ propagate ไปยัง polar tick labels,
  legend, และ tick labels บางจุด — ทำให้ axes ของ radar chart ยังใช้ font fallback
  (DejaVu) ที่ไม่มี glyph ภาษาไทย → tofu boxes
- **Fix**: ใช้ `FontProperties(fname='/usr/share/fonts/opentype/tlwg/Loma.otf')`
  เป็น instance ระดับ module + apply ผ่าน `fontproperties=` argument โดยตรงทุก text call:
  - `ax.set_xticklabels(..., fontproperties=_FP_LABEL)` (สำคัญสุด — fix user's reported issue)
  - `ax.set_yticklabels(...)`, `ax.set_title(...)`, `ax.set_xlabel/ylabel(...)`
  - `ax.text(...)`, `ax.annotate(...)` ทุกตัว
  - `ax.legend(prop=_FP_LABEL)` ใน legend
  - Bar chart tick labels via `lbl.set_fontproperties(...)` loop
- **Auto-wrap**: เพิ่ม `_wrap()` helper สำหรับ radar axis labels ที่ยาว เช่น
  `"SOCIAL STATUS (สถานะทางสังคม/ความหรูหรา)"` → 2 บรรทัด เพื่อไม่ทับ polygon
- **Verified**: re-rendered user's exact failing radar (Starbucks vs Café Amazon vs Punthai Coffee
  with Thai parenthetical labels) — ภาษาไทยขึ้นถูกต้องไม่มี tofu

### 📱 Mobile overflow — AI Insights rail (`be-dash-ai`)
- **สาเหตุ**: long Thai text ใน `master_insights` headlines/evidence ไม่ break บน mobile
  → ดันให้ flex/grid parent ขยายเกิน viewport
- **Fix** (CSS):
  - `.be-dash-main`, `.be-dash-ai`, `.be-ai-rec` ได้ `min-width: 0` (กัน flex/grid ขยายเกิน)
  - `.be-ai-rec-headline`, `.be-ai-rec-body` ได้ `word-break: break-word;
    overflow-wrap: anywhere;` (Thai words wrap ที่ไหนก็ได้)
  - `@media (max-width: 1100px)`: `.be-dash-ai` ได้ `width: 100%; box-sizing: border-box`
  - `@media (max-width: 600px)`: ลด font + padding
- **Verified** บน viewport 390×800: `railRight: 374` (16px margin), ทุก `.be-ai-rec` fit
  ใน viewport ไม่มี overflow


## 2026-02-11 — Hotfix: Thesis Export Triggered 5 Downloads 🔴

### Race condition: polling fires every 4s but each poll takes >4s
- เมื่อกด "สร้างวิทยานิพนธ์" → frontend ตั้ง `setInterval(... , 4000)` polling status
- Backend ใช้เวลามากกว่า 4 วินาทีต่อ poll → multiple poll requests in-flight พร้อมกัน
- เมื่อ status → "ready" — **ทุก poll ที่ pending** เห็น "ready" → call `clearInterval` (ไม่ทันแล้ว) + `downloadThesisDocx`
- ผลลัพธ์: ดาวน์โหลดไฟล์เดียวกัน 2-5 ครั้ง

### Fix (BrandEquityDashboardPage.jsx)
- เพิ่ม `thesisDownloadStartedRef` (boolean guard) — claim slot atomically
- Guard ที่ **3 จุด**:
  1. ด้านบน setInterval callback — skip ทันทีถ้า ref ถูก set แล้ว
  2. หลัง `await axios.get` — re-check (อาจมีอีก poll ชิงไปก่อน)
  3. ใน `handleStartThesisAI` — reset เป็น false ทุกครั้งที่กด Generate ใหม่
- ก่อน `await downloadThesisDocx` — set ref=true + clearInterval ก่อนเสมอ
- กัน double-click: ถ้า `thesisProgress` ไม่ใช่ idle/failed → return
- กัน stale interval: clear interval เก่าทุกครั้งที่กด Generate ใหม่

### Verified
- Playwright test: กด Generate → **1 download URL fetch เท่านั้น** (รอ 20 วินาทีเช็คซ้ำ)


## 2026-02-11 — Mermaid Diagrams + Thai Font Hardening 📐🇹🇭

### Mermaid rendering (server-side via mmdc + Chromium headless)
- ติดตั้ง `@mermaid-js/mermaid-cli@10.9.1` ที่ `/opt/mmdc/` ใช้ระบบ Chromium ที่มีอยู่แล้ว
  (Playwright dependency) ไม่ต้องโหลด chromium เพิ่ม
- **NEW** `/app/backend/routes/be_thesis_mermaid.py`:
  - `extract_mermaid_blocks(md)` — regex หา ` ```mermaid ... ``` ` ใน markdown
  - `replace_mermaid_blocks_with_markers(md)` — แทนที่ block ด้วยข้อความ "ภาพประกอบ M-01"
    เพื่อให้ markdown→docx engine ไม่ render เป็น code block
  - `render_mermaid_to_png(code)` — shell out ไป `mmdc -i in.mmd -o out.png`
    พร้อม puppeteer config ใช้ `/usr/bin/chromium` + `--no-sandbox`
- Wired into download endpoint: extract → render PNG → ส่งให้ `enrich_thesis_docx` เพิ่ม
  **ภาคผนวก ก-mermaid** section ที่ embed ทุกแผนภาพ
- AI prompts (Ch 2, 3) ได้รับการ update ให้ใส่ mermaid:
  - Ch 2 — conceptual framework: `flowchart LR` แสดง Aaker 4 dimensions → BES
  - Ch 3 — methodology: `flowchart TD` แสดง Survey → Collection → Normalization → Composite
- **กฎสำคัญ**: AI ใช้ภาษาอังกฤษใน mermaid node labels (Chromium ภายใน mmdc render ไทยไม่ครบ)
  แต่อธิบายเป็นไทยใน narrative text — ภาพประกอบจึงเป็น English ในขณะที่เนื้อหารอบๆ เป็นไทย
- Verified: ทดสอบสร้าง thesis (Ch 2-5) — **17 images embedded** รวม mermaid flowcharts หลายชิ้น
  + ทุก matplotlib chart + ทุกตาราง

### Thai font hardening
- Test ใหม่ทุก chart (TOM cloud, radar, perceptual map, identity-image) ด้วยข้อมูลภาษาไทย
  ระดับยาก (สระ-วรรณยุกต์ครบ) — **ไม่มี tofu boxes**
- Loma font (`/usr/share/fonts/opentype/tlwg/Loma.otf`) ถูก register ตอน module import
- ผู้ใช้ที่ยังเห็น box อาจดาวน์โหลด DOCX cache เก่าก่อนที่ font fix จะ deploy — แนะนำ
  ดาวน์โหลดใหม่ (cache ถูกเคลียร์แล้ว)

### Verified
- DOCX 482KB · 17 images · mermaid + matplotlib charts ครบ · Thai font ถูกต้อง


## 2026-02-11 — Thesis DOCX: All Dashboard Charts + Full Statistics Tables 📊🎓

### ภาพประกอบทั้งหมดจาก Dashboard ฝัง DOCX แล้ว (request: "เอา output ทุกอันมา")
- **NEW** `/app/backend/routes/be_thesis_charts.py` — render ทุก chart ผ่าน matplotlib (Loma font
  สำหรับภาษาไทย เรนเดอร์ถูกหมดทั้งสระ-วรรณยุกต์):
  - **TOM Brand Cloud** — แบรนด์เป้าหมายไฮไลต์สีแดง คู่แข่งสีเทา + % share
  - **Quality Attributes Radar** — Likert 1-7 → 0-100, สีทอง brand
  - **Multi-dim Image Radar** — แบรนด์ vs คู่แข่ง 3+ axes
  - **Perceptual Map (2D)** — เลือก 2 axes ที่ spread มากสุดอัตโนมัติ + raw value labels
  - **Identity vs Image Map** — สอง columns: intended (red bars) vs perceived (color-coded
    aligned/lost/unintended) + alignment score
  - **Aaker 4 Perspectives Bars** — Org/Person/Symbol/Product
  - **NPS distribution bar** — Detractors/Passives/Promoters horizontal stack
  - **Likert histograms** — Familiarity (5-pt) + Overall Quality (7-pt) ที่แสดง distribution

### ตารางสถิติฉบับเต็ม + ภาคผนวกใหม่ใน DOCX (no placeholders)
- **NEW** `/app/backend/routes/be_thesis_appendix.py` — ผนวก section ใหม่ที่ท้าย DOCX
  หลัง References:
  - **ภาคผนวก ก** — ภาพประกอบทุก chart (caption: "ภาพ ก-1 · TOM Cloud", "ภาพ ก-2 · Quality Radar"
    ฯลฯ)
  - **ภาคผนวก ข** — ตารางสถิติทุกคำถามแยกตาม 4 มิติ Aaker (id, kind, type, n, mean, sd, T2B,
    B2B, net, score_100) + Comparative table แยก
  - **ภาคผนวก ค** — ความถี่ open-ended TOM/Recall/Aided พร้อม AI-merged variants
  - **ภาคผนวก ง** — Identity vs Image trait-by-trait status table + AI narrative
  - **ภาคผนวก จ** — Aaker 4 Perspectives breakdown + per-question contributions
  - **ภาคผนวก ฉ** — Composite summary recap + signal coverage

### AI prompt hardening — ห้าม placeholder
- `_system_msg` ใน `be_thesis_ai.py` เพิ่มกฎเข้มงวด:
  - ห้ามใช้ `X.X`, `[ระบุค่า]`, placeholder ใดๆ
  - ทุกค่าต้องมีหน่วย/บริบท เช่น "ค่าเฉลี่ย 4.95 จาก scale 1-7 (n=21)"
  - ห้ามใช้ "ผู้ใช้จะใส่เอง" / "TBD" / "X" ในบท 3-5

### Wired into download endpoint
- `GET /api/brand-equity/studies/{id}/thesis-ai-download` ใน `brand_equity.py` ตอนนี้:
  1. โหลด AI markdown จาก cache → render base DOCX ผ่าน `_create_thesis_docx`
  2. recompute aggregate ด้วย `_aggregate_responses` เพื่อใช้สร้าง charts จริง (cache เก็บแค่ md)
  3. เรียก `enrich_thesis_docx` เพื่อ append visual + data appendix
  4. ทั้งสอง CPU-heavy steps wrap ด้วย `asyncio.to_thread` ป้องกัน event loop block

### Verified
- DOCX 311KB · valid zip · **6 charts embedded** · **15 data tables** · **211 paragraphs**
- ภาคผนวก ก/ข/ค/ง/ฉ ครบทั้งหมด · Thai font Loma เรนเดอร์ถูกต้อง
- AI cited real numbers: "Brand Awareness (71.3)", "Brand Identity (53.5)", "(Aaker, 1996)"


## 2026-02-11 — AI-Powered Thesis Export for Brand Equity 🎓✨

### Full Conjoint-style thesis flow ported to Brand Equity
- **5 chapters** ให้เลือก ตามความต้องการของผู้ใช้:
  - บทที่ 1 (บทนำ) · บทที่ 2 (ทบทวนวรรณกรรม) — **ร่าง · DRAFT** (gold tag) — ผู้ใช้ต้อง fine-tune เอง
  - บทที่ 3 (ระเบียบวิธีวิจัย) · บทที่ 4 (ผลการศึกษา) · บทที่ 5 (สรุป อภิปราย ข้อเสนอแนะ) — ใช้ **data จริง**
- **Extra Prompt** textarea — AI นำคำสั่งเพิ่มเติมไปประกอบทุกบท
- **Brand-focused references**: Aaker (1991/1996/1997), Keller (1993/2001/2013), Kapferer (2012),
  Kotler & Keller (2016), Reichheld (2003/2011), Yoo & Donthu (2001), Pappu et al. (2005),
  Christodoulides & de Chernatony (2010) — APA 7

### Backend (`/app/backend/routes/`)
- **NEW**: `be_thesis_ai.py` — `build_be_thesis_prompts(study, aggregate, n_total, n_filtered, chapters, extra_prompt)`
  สร้าง system_msg + per-chapter prompts (1-5) ด้วย summary ที่ compact (≈1KB token-economy)
- 3 endpoints ใหม่ใน `brand_equity.py`:
  - `POST /api/brand-equity/studies/{id}/thesis-ai-start` — รับ `{chapters: [int], extra_prompt: str}` + filter qs
    → return `{job_id, cache_key}` (cache hit ตอบ ready ทันที)
  - `GET  /api/brand-equity/studies/{id}/thesis-ai-status/{job_id}` — return `{status, progress: "chapter_X", error}`
  - `GET  /api/brand-equity/studies/{id}/thesis-ai-download?cache_key=...` — DOCX response
- Background task `_run_be_thesis_ai_generation` เรียก Gemini ทีละบท ด้วย `_call_gemini_with_retry`
  แล้ว stitch เป็น markdown blob เก็บใน `db.brand_thesis_cache`
- DOCX render reuse `_create_thesis_docx` จาก server.py (รองรับ markdown headings, tables, LaTeX math)
  รันใน `asyncio.to_thread` ป้องกัน event loop block
- Role-gate: ADMIN / CURRENT_STUDENT / ALUMNI; ต้องมี ≥10 responses สำหรับ chapter 3/4/5
  (chapters 1-2 อนุญาต n=0 เพราะเป็น draft)
- Cache key: `be_thesis_{studyid}_{chapters}_{filter_sig}_ep{extra_prompt_md5}` — idempotent

### Frontend (`/app/frontend/src/pages/brand-equity/`)
- `BeMethodology.jsx`: เปลี่ยนจาก single static-export button เป็น **inline form**:
  - 5 chapter checkboxes พร้อม draft tag กับบท 1-2
  - Extra prompt textarea
  - "สร้างวิทยานิพนธ์ X บท →" button (disabled ตอน working)
  - Progress bar animated + "AI กำลังเขียนบทที่ X..." text
  - Error display ถ้า failed
- `BrandEquityDashboardPage.jsx`: ลบ static `handleExportThesis`, เพิ่ม:
  - State: `thesisChapters`, `thesisExtraPrompt`, `thesisProgress`, `thesisError`
  - `handleStartThesisAI`: POST start → poll every 4s → auto-download blob เมื่อ ready
  - Cache hit fast-path: ถ้า server ตอบ ready ทันที ก็ดาวน์โหลดเลย
- CSS: `.be-thesis-chapters`, `.be-thesis-chapter` (with `.draft` border-left gold),
  `.be-thesis-draft-tag`, `.be-thesis-textarea`, `.be-thesis-progress-bar` (shimmer animation)

### Verified end-to-end
- Backend curl: `POST /thesis-ai-start` → `processing` → poll `chapter_5` → `ready` → download 44KB valid DOCX
- Frontend Playwright: เลือกบท 5, ใส่ extra prompt, กด button → toast "ดาวน์โหลดเรียบร้อย" + DOCX downloaded


## 2026-02-11 — Partial-Data Warning UI + Dashboard 500 Hotfix 🔴

### 🔴 BUG (P0): Dashboard 500 — `score * w` TypeError
- `_compute_dim_composite` ถูก refactor ให้ return `(score, meta)` tuple แต่ caller ใน `_aggregate_responses`
  ยัง assign `composite[d] = _compute_dim_composite(...)` (ทั้ง tuple) → loop weighted-sum ทำ
  `tuple * float` → `TypeError: can't multiply sequence by non-int of type 'float'`
- **Fix**: unpack tuple → `score_val, meta = _compute_dim_composite(...)` + cast `float(score)` ก่อน weight
- Impact: ทุก study ที่มี responses เคย 500 ที่ `/api/brand-equity/studies/{id}/dashboard` กลับมาทำงาน
- File: `/app/backend/routes/brand_equity.py` (line 1093-1116)
- เพิ่ม `composite_meta: {dim: {coverage, present_kinds, missing_kinds, designed_kinds}}` ใน aggregate response
  เพื่อให้ frontend ใช้ตัดสินใจแสดง warning ในอนาคต (ตอนนี้ frontend มี logic แยกอยู่แล้ว)

### Partial-Data Warning UI (frontend)
- ทุก section บน Brand Equity dashboard (Awareness · Quality · Identity · Loyalty) แสดง
  **เครื่องหมายดอกจันสีแดงขนาดใหญ่ (✱)** + ข้อความ "ข้อมูลไม่ครบ — score คำนวณจากข้อมูลเท่าที่มี"
  พร้อม chip แสดงรายชื่อคำถามหลักที่ขาด (e.g. `Familiarity (AW-4)`, `NPS (LY-1)`)
- Logic: `EXPECTED_KINDS_BY_DIM` กำหนดคำถามแกนหลักของแต่ละ Aaker dimension; `getMissingKinds(qs, dim)`
  เทียบกับ kind ที่มี data จริง (`stats.n > 0`) → เฉพาะ kind ที่ขาดเท่านั้นถูกแสดง
- Score ยังคำนวณจาก data ที่มี — warning เป็น UI metadata เท่านั้น ไม่กระทบสูตร
- File: `/app/frontend/src/pages/brand-equity/BrandEquityDashboardPage.jsx`
  (`PartialDataWarning`, `EXPECTED_KINDS_BY_DIM`, `getMissingKinds`)
- Style: `/app/frontend/src/pages/brand-equity/brand-equity-styles.css` (`.be-partial-warning`,
  `.be-partial-asterisk` 38px serif red, `.be-partial-chip`)

### Thesis Export — Active for Admin
- ยืนยันว่า `/api/brand-equity/thesis-eligible` คืน `{eligible: true}` สำหรับ role `admin`
- Frontend `BeMethodology` แสดง "ACADEMIC EXPORT · READY" + ปุ่ม "Export Thesis DOCX →" (enabled)
- ทดสอบด้วย admin@swu.ac.th — DOCX 40KB valid file (zipfile.is_zipfile = True)
- ไม่ต้องเปลี่ยนโค้ดเพิ่มเติม — feature ทำงานแล้วเมื่อ user role = admin


## 2026-02-10 — Academic Audit + Thesis DOCX Export 🎓
### Audit fixes (academic correctness)
- **🔴 BUG 1 (likert score normalization)** — `_likert_stats` ใช้ `mean / scale_max × 100` ซึ่งทำให้ floor ของคะแนนต่ำสุดเป็น 20 (1-5 scale) หรือ 14.3 (1-7 scale) แทนที่จะเป็น 0
  - **Fix**: เปลี่ยนเป็น `(mean − 1) / (scale_max − 1) × 100` (มาตรฐาน DeVellis 2017, Aaker 1996 ch.7)
  - Impact: ทุก likert score ที่ต่ำเคยถูก inflate ~20pts — Mali Quality 70.1 → 63.2, Loyalty 59.7 → 56.2
- **🔴 BUG 2 (comparative_7 ไม่ feed composite)** — `_comparative_stats` ไม่ return `score_100` → comparative questions ส่ง None เข้า `_compute_dim_composite` ทำให้ Quality "Comparative vs Competitor" weight 0.15 ถูก ignore
  - **Fix**: เพิ่ม `score_100 = (7 − mean) / 6 × 100` (focal บน left convention)
  - Impact: Mali Quality ตอนนี้รวม comparative 51.6 ที่ weight 0.15 → defensive
- **✅ ผ่าน audit**: NPS formula, TOM/recall pct, trait_grid identity overlap, filter signature, owner auth, AI cache per signature

### Thesis DOCX Export — ทำงานเต็มแล้ว
- Backend `/app/backend/routes/thesis_renderer.py` (ใหม่):
  - `render_thesis_docx(study, aggregate, sample_n_total, sample_n_filtered, filter_info, author_name)` → BytesIO
  - 6 sections: Cover · Executive Summary · Methodology · Results by Dimension · Identity vs Image · Strategic Insights · References (APA 7)
  - Tables: KV (brand info), data tables (per-dim with mean/std/n/score_100)
  - Methodology section อธิบาย formulas + dimension weights table
  - Comparative subsection แยก แสดง favor% vs competitor
  - Identity vs Image: intended vs perceived traits + alignment score
  - APA references: Aaker (1991, 1996), Keller (1993), Reichheld (2003), DeVellis (2017)
- Endpoint `POST /api/brand-equity/studies/{id}/thesis-export?from=&to=&segments=`:
  - Role-gated: ADMIN / CURRENT_STUDENT / ALUMNI (FACULTY role TBD)
  - 403 ถ้า role ไม่ผ่าน
  - Honors active filter — รายงาน snapshot เฉพาะ slice นั้น
  - Renders ใน `asyncio.to_thread` (CPU-heavy DOCX rendering ไม่ block event loop)
  - StreamingResponse with proper Content-Disposition + filename `thesis-{Brand}-{YYYYMMDD}.docx`
- `GET /api/brand-equity/thesis-eligible` returns `{eligible: bool, role}` ตาม role ปัจจุบัน
- Frontend (`BeMethodology.jsx`):
  - Card title อัปเดต: `◆ ACADEMIC EXPORT · READY` (ผ่าน) / `· LOCKED`
  - Caption เปลี่ยน: "พร้อม Methodology · Aaker breakdown · ตาราง score · AI insights · APA references"
  - Button: "Export Thesis DOCX →" (active) / "🔒 Locked"
- Verified: Mali export ได้ 40KB DOCX with all 6 sections ครบ, 403 สำหรับ no-auth, frontend admin login → button enabled



## 2026-02-10 — Methodology Appendix + Thesis Export Stub 📚
- **User**: "ช่วยเพิ่ม expand box รายละเอียดและวิธีการวัด คำนวณค่าทั้งหมดไว้ท้าย report ... เผื่อคนไหนสนใจจะได้กดออกมาดูได้ และให้เตรียมส่วน export เป็นวิทยานิพนธ์ไว้ที่นี่ด้วย (ยังไม่ต้อง active)"
- **New component** `BeMethodology.jsx` — appendix ที่ท้าย dashboard (เฉพาะเมื่อ ready_for_dashboard):
  - 6 collapsible expand boxes (`be-method-toggle-{id}` data-testids):
    - **00 · BES (รวม)**: สูตร `BES = Σ(D × w) / Σw` + tier mapping (Champion ≥80 / Strong 65-79 / Healthy 50-64 / At Watch 35-49 / At Risk <35)
    - **01 · Awareness Pyramid**: TOM 0.40 + Spontaneous 0.25 + Aided 0.20 + Familiarity 0.15 + Visual 0.05-0.10 — พร้อมอธิบายว่าแต่ละ signal ดึงจาก question kind ใด
    - **02 · Perceived Quality**: Overall 0.35 + Reliability 0.20 + Value 0.20 + Comparative 0.15 + Design 0.10
    - **03 · Identity vs Image**: Trait Overlap 0.20 + Brand Promise 0.15 + Aaker 4 Perspectives ~50% + AI Alignment 0.10
    - **04 · Loyalty**: NPS 0.40 + Repurchase 0.30 + Switching Resistance 0.30
    - **05 · Data Pipeline**: AI normalize → frequency stats → likert/NPS scoring → weighted composite + filter/wave-compare signature explanation
  - Eyebrow + serif title + mono short summary + plus/minus toggle UX (Editorial Swiss style)
  - References: Aaker (1991, 1996), Keller (1993), Reichheld (2003), Ehrenberg-Bass framework
- **Thesis Export card** (placeholder, role-gated):
  - Gradient cream/tan card "◆ ACADEMIC EXPORT · PREVIEW · ส่งออกเป็นรายงานวิทยานิพนธ์ (PDF / DOCX)"
  - Disabled `🔒 Locked` button + "เปิดใช้งานเฉพาะ admin · อาจารย์ · นิสิต ที่ลงทะเบียนแล้ว — เร็วๆ นี้ (coming soon)"
  - Frontend probes `GET /api/brand-equity/thesis-eligible` on mount; backend returns `{eligible: false}` for everyone today (TODO comment in code shows how to flip on per role)
  - `handleExportThesis` ลง endpoint `POST /studies/{id}/thesis-export` — backend stub returns 403 with friendly toast "ฟีเจอร์ยังไม่เปิดใช้งานสำหรับ role ของคุณ"
- **Backend additions** (`/app/backend/routes/brand_equity.py`):
  - `GET /thesis-eligible` — returns `{eligible: false, status: "coming_soon"}`
  - `POST /studies/{id}/thesis-export` — stub raises 403 with TODO scaffold
- **Hidden on showcase mode** (anonymous public viewers don't see methodology toggle to keep showcase clean)



## 2026-02-10 — Aaker-Aligned Brand Equity Scoring (All 4 Dimensions) 🎯
- **User**: "การศึกษาบางอันไม่ขึ้นค่า awareness เลย ... คำนวณค่าที่ดูถูกต้องที่สุดทางทฤษฎีมา ทุกค่าเลย"
- **Root cause**: เดิม `_aggregate_responses` ใช้แค่ `likert_5/7`/`nps_0_10`/`comparative_7` ในการ feed `dim_aggregates` → ทุก dimension ถูก average เฉพาะ likert เท่านั้น
  - **Awareness** (4 questions: TOM, recall, aided, familiarity) — feed แค่ AW-4 likert เพียงตัวเดียว → ถ้า user ลบ AW-4 → composite=0 → UI แสดง "—"
  - **Quality / Identity / Loyalty** — ตัด open-ended/mcq/trait_grid ออกหมด ไม่ใช้ Aaker framework
- **Fix** (`/app/backend/routes/brand_equity.py`):
  - **`_question_signal_100(q, stats, target_brand, intended_traits)`** — fn ใหม่ score ทุก question type 0-100:
    - `likert_5/7`/`nps_0_10`/`comparative_7` → existing `score_100`
    - `mcq_multi`/`mcq_single` → % respondents picked target_brand (aided recognition)
    - `trait_grid` (image_traits_aided / as_person_personality) → mean pickup pct ของ **intended_traits** (Aaker identity-image overlap)
    - `open_short`/`open_long` (extract_brand/extract_brands) → top-of-mind / unaided-recall share จาก AI normalized counts
    - `word_cloud` & generic trait_grid → None (ไม่มี comparable signal)
  - **`DIMENSION_WEIGHTS`** — Aaker-aligned weights ต่อ `kind`:
    - **Awareness pyramid**: TOM 0.40, Spontaneous 0.25, Aided 0.20, Familiarity 0.15, +visual 0.05-0.10 ถ้ามี
    - **Quality**: Overall 0.35, Reliability 0.20, Value 0.20, Comparative 0.15, Design 0.10
    - **Identity**: Trait pickup vs intent 0.20, Brand promise 0.15, Aaker 4 perspectives (Org/Person/Symbol/Product likert grids) 0.04-0.07 each, +AI identity-image alignment 0.10
    - **Loyalty**: NPS 0.40, Repurchase 0.30, Switching resistance 0.30
  - **`_compute_dim_composite(dim, out_questions, target_brand, intended_traits, identity_alignment)`** — weighted avg over present signals, weights renormalize, fallback to plain mean for unrecognized kinds
  - Composite "overall" computed from dimension scores ที่ผลิตได้จริง (skip None)
- **Verified ด้วย Mali (n=21)**:
  - **ก่อน**: A 75.2 / Q 71.5 / I 70.5 / L 60.5 / BES 69.4 (ใช้แค่ likert)
  - **หลัง**: A 72.2 / Q 70.1 / I 56.2 / L 59.7 / BES 64.5
  - Awareness math เช็คมือ: TOM 61.9×0.40 + Recall 76.2×0.25 + Aided 85.7×0.20 + Familiarity 75.2×0.15 = 72.23 ✅
  - Identity ลด เพราะรวม trait pickup overlap (intended traits matched 5/5 avg 62.88%) + AI alignment ที่ AI cache สรุปไว้
  - Frontend dashboard แสดงครบ 4 ค่าไม่มี "—", AI insights ปกติ
- ใช้ได้กับ studies เก่าทั้งหมด (recompute on-the-fly, ไม่กระทบ data) + ทำงานกับทั้ง owner mode + showcase + filter + wave compare



## 2026-02-08 — Filter UX: Empty Segment State Fix 🪄
- **User**: "เห็นแต่ filter เวลา ไม่มีอย่างอื่น หรือว่าไม่มีข้อมูลก็ไม่รู้ ตรวจหน่อย"
- **Root cause** (`BeFilterBar.jsx`):
  - `segFields = Object.keys(segmentsAvailable)` → studies ที่ 0 responses ได้ key `age`/`gender` แต่ value เป็น `[]` → header "SEGMENTS" แสดง แต่ไม่มี chip ข้างใต้ ดูเหมือนหายไป
  - Studies ที่ตั้ง `segments_to_capture: []` → `segments_available = {}` → SEGMENTS section หายเลย user งงว่ามีหรือไม่มี
- **Fix** (`BeFilterBar.jsx`):
  - `segFieldsWithData` filter เฉพาะ field ที่มีค่า ≥ 1
  - SEGMENTS section แสดงเสมอ:
    - ถ้ามี ≥1 ค่า → render chips ตามปกติ
    - ถ้า 0 ค่า → render empty state card (dashed border, paper bg) อธิบายเหตุผล + วิธีแก้
  - สำหรับ field ที่มีเพียง 1 ค่า → แสดง chip + hint "(มีเพียง 1 ค่า · เก็บข้อมูลเพิ่มเพื่อ filter)"
- **CSS** (`brand-equity-styles.css`): `.be-filter-segments-empty` style — dashed border, paper bg, mono uppercase header
- **Verified ผ่าน screenshot tool**:
  - Mali (n=21, 3 fields × 5/3/5 vals) → 13 chips render ครบ ✅
  - TEST_UIBrand (n=12, 1 val/field) → 2 chips + hint ✅
  - SoloBrand (n=0) → empty state card "ยังไม่มี SEGMENT DATA ให้กรอง" ชัดเจน ✅



## 2026-02-08 — Brand Result: Filterable Analysis + Wave Compare + Y-axis Label Fix 📊
**User**: "ใน result ส่วน Perceptual Map ที่แก้แกน X ก่อนหน้า ให้แก้แกน Y ด้วย เอาไปอยู่มุมซ้ายบน · และหาทางทำให้เลือก filter ข้อมูลในการวิเคราะห์ได้ด้วย โดยวิเคราะห์แยก ตามเวลา และตาม segment ของข้อมูลส่วนบุคคลของผู้ตอบ เพื่อในอนาคตสามารถทำ brand tracking health ได้ด้วย"

### A. Y-axis label position (Perceptual Map)
- **Before**: Y-axis label `↑ {yAxis}` อยู่ตำแหน่ง `(pad + inner/2 + 6, pad - 8)` — กลางบนใน chart, ทับ midline crosshair
- **After**: ย้ายไป `(pad, pad - 18)` พร้อม `textAnchor="start"` → มุมซ้ายบนนอกกรอบ chart symmetric กับ X-axis ที่อยู่มุมขวาล่าง
- File: `be-components.jsx` PerceptualMap component

### B. Filter Analysis (Time + Segment)
**Backend** (`/app/backend/routes/brand_equity.py`):
- New helpers: `_parse_segments_param`, `_apply_response_filter`, `_segments_available`, `_filter_signature`, `_resolve_ai_cache`
- `GET /studies/{id}/dashboard?from=&to=&segments=<JSON>` — filtered aggregate + `responses_total`/`responses_filtered`/`segments_available`/`filter.signature`
- `GET /showcase/{token}` — same query params, public-facing filter (transparency mode)
- `POST /studies/{id}/ai-analyze?from=&to=&segments=` — AI analysis scoped per filter signature
- `GET /studies/{id}/ai-status?from=&to=&segments=` — status per signature
- AI cache strategy: unfiltered = `ai_cache.*` (backward compat); filtered = `ai_cache_by_filter.<sig>` (12-char SHA1 hash); idempotency guard separate per signature

### C. Wave Compare (Brand Tracking Health)
- **Backend**: `POST /studies/{id}/compare` body `{wave_a: {from,to,segments}, wave_b: {...}}` returns `{wave_a, wave_b, deltas}` for BES + 4 Aaker dims
- **Frontend**: Wave compare card — 2 columns × 5 metrics with delta arrows (▲ green / ▼ red / — flat)

### D. Frontend Filter Bar
- New component `BeFilterBar.jsx`:
  - Sticky bar under topbar with summary "FILTER · ANALYSIS · X/Y responses · ● ACTIVE · ◆ WAVE COMPARE"
  - Time presets: 7D/30D/90D/ALL + manual FROM/TO date inputs
  - Segment chips per field (auto-derived from `segments_available`): age/gender/region/usage_frequency
  - Compare Waves toggle reveals Wave B identical UI block (owner only — hidden on showcase)
  - Reset button clears all filters
  - AI hint banner when active filter on owner mode
- All inputs have `data-testid` (`be-filter-a-preset-30d`, `be-filter-b-from`, `be-filter-a-seg-gender-F`, etc.)
- Mobile responsive (sticky disabled, dates stack vertical)

### Verified
- Backend: `?from=2026-04-27` returns sig `a8316b2efa9d`, `?segments={"gender":["F"]}` returns sig `8c9a851d6e37`, all `signature: all`
- Compare: A n=12 / B n=12 / deltas 0 (study TEST_UIBrand has all-0 scores) — structure works
- Frontend showcase: Filter bar visible, expand → Wave A panel with presets + dates + chips (อายุ: 25-34, เพศ: F)
- Frontend owner: Compare toggle shows Wave B block; selecting from-date triggers `/compare` API → renders side-by-side card
- AI per-filter: `POST /ai-analyze?segments=...` returns `{status: "queued", signature: "8c9a851d6e37"}`



## 2026-02-08 — Showcase Index Mobile Responsive Fix 📱
- **User**: "ในหน้า showcase ยังไม่เป็น responsive กับมือถือ แก้หน่อย"
- **Root cause** (`BrandEquityShowcaseIndexPage.jsx`):
  - Grid showcase ใช้ inline `gridTemplateColumns: 'repeat(3, minmax(0, 1fr))'` แบบ fix 3 columns ทุก viewport — บน 390px ทำให้ card กว้างเพียง 103px → ตัวหนังสือบีบหลุด
  - Search row (`display: flex` ไม่ wrap) — count badge "1 results" ถูกดันออกขอบ
- **Fix**:
  - **CSS** (`swumkt-design.css`): เพิ่ม `[data-testid="showcase-grid"]` เข้า media queries เดียวกันกับ home grids
    - `@media (max-width: 900px)` → 2 cols
    - `@media (max-width: 640px)` → 1 col + gap 12px
  - **Frontend** (`BrandEquityShowcaseIndexPage.jsx`):
    - Search row: `flex-wrap: wrap` + input `flex: '1 1 200px'` + count `flexShrink: 0` → wrap clean บน narrow
    - Class `showcase-search-row` เผื่อใช้ในอนาคต
- **Verified**:
  - 360px (Android เล็ก): grid = 320px (1 col), bodyScrollW = docW ✅
  - 390px (iPhone): grid = 350px (1 col) ✅
  - 768px (Tablet): grid = `342px 342px` (2 cols) ✅
  - Card showcase แสดง logo + Public badge + brand name + competitors + SHARE + View Report ครบเต็มกรอบ
- หน้า Showcase Detail (`/showcase/{token}`) ที่แก้ centerpiece ในรอบก่อนยังทำงานปกติ



## 2026-02-08 — Brand Result Dashboard: Mobile Overflow Fix 📱
- **User**: "ในหน้า brand result ยังมีปัญหาล้นจอในหลายส่วน เวลาใช้มือถือเข้า แก้ไขหน่อย"
- **Root cause** (`/app/frontend/src/pages/brand-equity/BrandEquityDashboardPage.jsx` line 902):
  - `SectionIdentity` component (centerpiece การ์ด `Identity vs Image`) ใช้ inline style `margin: '0 -32px'` เพื่อให้เอฟเฟกต์ full-bleed บน desktop
  - บนมือถือ: parent `.be-page` padding=16px ทำให้ content area 358px แต่ `-32px×2` ดันออก 64px → section width = 422px ล้น viewport 32px ทุกหน้าจอ < 1100px
  - `bodyScrollW=406` (ที่ 390px viewport) → page scroll horizontally
- **Fix**:
  - แทนที่ inline style → CSS class `be-section-centerpiece`
  - ใน `brand-equity-styles.css`:
    - Desktop default: เก็บ `margin: 0 -32px` + paper bg + border (เอฟเฟกต์เดิม)
    - `@media (max-width: 1100px)`: `margin: 0` (เลิก bleed เมื่อจอแคบเพราะ dash-rail/ai พับเป็น 1 column แล้ว)
    - `@media (max-width: 700px)`: ลด padding `40px 24px` → `24px 14px` ให้ฟิตจอเล็ก
- **Verified**:
  - 390px viewport: bodyScrollW = 390 (เท่ากับ docW), ไม่มี element ล้น ✅
  - 360px viewport (mobile แคบ): bodyScrollW = 360, section identity render ครบใน viewport พร้อม palette swatches + visual keywords + AI summary ✅



## 2026-02-08 — Social Media Preview (OG Bridge) สำหรับ Showcase + Learn 📲
- **User**: "เวลา share showcase url หรือ content learn ให้ทำ social media preview ที่ใส่ ทั้งหัวข้อ ที่เรียก CTA ได้ดี และ รูปภาพประกอบ เข้าไปด้วย เวลาแชร์ไปใน social media จะได้น่ากดมาอ่าน"
- **Root cause**: React SPA ใช้ `useDocumentMeta` inject OG tags ฝั่ง client หลัง mount → Facebook/LINE/Twitter/WhatsApp/Slack bot ไม่ run JS → bot เห็นเฉพาะ default OG จาก `index.html` (โลโก้ทั่วไป + ข้อความเดียวกันทุกหน้า)
- **Solution**: server-side rendered OG bridge endpoint
  - **Backend** `/app/backend/routes/share.py` (ใหม่) — factory pattern register ใน `server.py`:
    - `GET /api/share/showcase/{share_token}` → HTML พร้อม OG/Twitter tags + meta-refresh redirect ไป `/showcase/{token}`
      - Title: `{Brand} · Brand Health Score {X}/100 — {Tier label} ({TH label})` (เช่น "TEST_UIBrand · Brand Health Score 0/100 — At Risk (เสี่ยง)")
      - Description: tier note + 4 dimension scores + CTA "เปิดอ่านงานวิจัย Brand Equity ฉบับเต็ม"
      - og:image: brand `logo_url` (URL only) → fallback SWUMKT logo (FB/LINE ตัด data: URI)
      - Compute composite scores ผ่าน `_aggregate_responses` helper เมื่อ response_count ≥ 10
    - `GET /api/share/learn/{slug}` → OG-rich HTML + meta-refresh redirect ไป `/learn/{slug}`
      - Title: article title + " · SWU · Marketing Research"
      - Description: excerpt (auto strip Markdown ถ้าไม่มี)
      - og:image: cover_image URL → ถ้าเป็น base64 data URI → ผ่าน proxy `/api/share/og-image/learn/{slug}` (FB ไม่รับ data URI)
    - `GET /api/share/og-image/learn/{slug}` → stream binary image bytes สำหรับ data URI cover_image
    - 5 tier ของ Brand Health (Champion/Strong/Healthy/At Watch/At Risk) sync กับ frontend `brandHealthVerdict.js`
    - HTML body เป็น mini editorial card (eyebrow + serif h1 + lede + dark pill CTA) สำหรับ humans ที่ JS ปิด
  - **Frontend updates**:
    - `BrandEquityDashboardPage.jsx` — `copyShowcaseLink` เปลี่ยนเป็น copy `<origin>/api/share/showcase/{token}`
    - `BrandEquityShowcaseIndexPage.jsx` — เพิ่มปุ่ม `SHARE` icon + label ในการ์ด showcase แต่ละใบ (data-testid `showcase-card-share-{id}`) + import `copyToClipboard`
    - `CmsArticleView.jsx` — เพิ่ม 2 ปุ่ม Share:
      - Top-right ของ article header: pill outline + ไอคอน share (data-testid `cms-article-share-top`)
      - Bottom band ข้าง "All Articles": blue pill "แชร์บทความนี้ →" (data-testid `cms-article-share-bottom`)
- **Verified ผ่าน curl**:
  - Facebookbot UA → ได้ OG title/description/image ครบ
  - LineBot UA → ได้ Brand Health pill + scores + Thai CTA
  - bad token/slug → 404
  - existing `/api/brand-equity/showcase`, `/api/cms/posts/public`, `/api/cms/landing` → 200 (no regression)
- **Frontend smoke test**: ปุ่ม Share top + bottom render บน `/learn/brand-equity` คลิกได้ปกติ



## 2026-02-08 — Mobile Responsive HomePage (VERIFIED) 📱
- **User**: Tools + Knowledge Hub grids ถูกบีบบนมือถือเพราะ inline `gridTemplateColumns: 'repeat(4, 1fr)'`
- **Fix** (`/app/frontend/src/pages/swumkt-design.css` lines 557-588):
  - `@media (max-width: 900px)` → `[data-testid="home-tools-bento"]` + `[data-testid="home-articles-grid"]` ใช้ `repeat(2, minmax(0, 1fr)) !important`
  - `@media (max-width: 640px)` → ใช้ `1fr !important` + `gap: 12px`
  - เพิ่ม `.swu-container` padding 20px และ `.img-frame` min-height 220px
- **Verified via screenshot tool**:
  - 390px viewport: tools_cols = `350px` (single), articles_cols = `350px` (single) ✅
  - 768px viewport: tools_cols = `344px 344px` (2 cols), articles_cols = `344px 344px` (2 cols) ✅
- Cards render full-width with title + description + CTA visible, ไม่บีบเนื้อหาแล้ว



## 2026-02-08 — Perceptual Map X-Axis Label Position Fix 📍
- **User**: ส่งภาพ — "สบายผิว →" axis label ลอยอยู่กลางขวาในกล่อง chart, ขอย้ายลงมาใต้กล่อง (ล่างขวา)
- **Bug** (`/app/frontend/src/pages/brand-equity/be-components.jsx` PerceptualMap component):
  - SVG text element สำหรับ xAxis label ใช้ `y={pad + inner / 2 - 6}` = ตำแหน่งกึ่งกลาง chart vertically (ทับ midline crosshair)
- **Fix**: เปลี่ยน `y` เป็น `size - pad + 32` → อยู่ใต้กล่องชัดเจน 32px ใต้ chart bottom edge
- เลื่อน midline note ขึ้นเล็กน้อย (y `size - pad + 28` → `size - pad + 18`) เพื่อให้ axis label มี gap 14px ไม่ทับ
- Layout ใหม่ (top-down): chart box (56-304) → tickmarks (y=318) → midline note (y=322) → xAxis label (y=336)
- Lint clean


## 2026-02-07 — Brand Health Verdict Pill (At Watch / At Risk / Strong / Champion) 🚦
- **User**: "มีค่าสรุปไหม เช่น At Watch · เฝ้าระวัง · ใส่เข้าไปให้น่าสนใจด้วย"
- **New util** `/app/frontend/src/lib/brandHealthVerdict.js`:
  - 5 tiers based on Brand Equity Score (0-100):
    - **80-100** Champion · ผู้นำตลาด (blue) — "Top of mind, สร้าง defensive moat ได้"
    - **65-79** Strong · แข็งแกร่ง (green) — "แบรนด์มี loyalty + identity ชัด"
    - **50-64** Healthy · สุขภาพดี (cyan) — "มี base ดี · ต้องปั้น edge เพิ่ม"
    - **35-49** At Watch · เฝ้าระวัง (amber) — "สัญญาณอ่อนใน 1-2 มิติ ต้องลงมือ"
    - **0-34** At Risk · เสี่ยง (red) — "หลุดจากใจลูกค้าเร็ว · ต้อง reposition"
  - `getBrandHealthTier(bes)` returns `{ label, labelTh, color, bg, border, note }`
  - `getWeakestDimension(scores)` returns weakest of 4 dims for "watch this" callout
- **HomePage Featured Card** ขยาย:
  - BES ตัวเลขสีตาม tier (red/amber/cyan/green/blue) — ไม่ static blue อีกต่อไป
  - **Verdict pill** ขวาบน: `● AT WATCH / เฝ้าระวัง` (background + border + 2 บรรทัด: EN tier + TH label)
  - **Tier note** italic ใต้ — phrase สำหรับ marketer (`"สัญญาณอ่อนใน 1-2 มิติ ต้องลงมือ"`)
  - หาก weakest dim < 50 → แสดง "จุดที่ต้องดู: **{ภาษาไทย}**" สีแดง
  - 4 dimension bars (เดิม) ยังอยู่
- **Tested**: TEST_UIBrand BES=0 → tier = At Risk → red pill rendered, note + weakest dim ("การรู้จัก") highlighted; lint clean


## 2026-02-07 — Featured Brand Scores on Hero Card 📊
- **User**: "หน้าแรกของ brand featured card ให้ใส่ค่าผลลัพธ์ล่าสุดทั้ง 4 ค่าลงไปด้วย · Awareness · Perceived Quality · Identity vs Image · Loyalty + BRAND EQUITY SCORE · เพื่อสร้าง CTA"
- **Backend** (`/app/backend/routes/brand_equity.py`):
  - `list_public_showcases()` ตอนนี้คำนวณ `composite` scores สำหรับ studies ที่ `response_count >= 10`
  - Reuses `_aggregate_responses(study, responses, normalized=ai_cache.normalized_by_question)` (same logic as `/showcase/{token}`)
  - คืน field `scores: { awareness, quality, identity, loyalty, overall }` หรือ `null` ถ้าไม่ครบ
- **Frontend `HomePage.jsx`** Featured Brand Card ขยายเป็น CTA panel:
  - **Brand Equity Score** ตัวใหญ่ 36px serif สี logo-blue พร้อม `/100` suffix
  - **4 Aaker dimensions** เป็น 2×2 grid — แต่ละมิติแสดง label + ตัวเลข + mini progress bar (สีตาม Aaker palette: Awareness blue, Quality amber, Identity violet, Loyalty green)
  - Smooth `width .8s ease` transition บน progress bars
  - Scores block แสดงเฉพาะเมื่อ `featured.scores` ไม่ null
- **Tested**: Hero featured card render BES + 4 dimensions + bars; layout ไม่เพี้ยน, lint clean


## 2026-02-07 — Featured Content Selector (Articles + Brands) 🎯
- **User**: "ให้มีระบบเลือกได้ว่าจะเอา content ไหนขึ้นหน้าแรกบ้าง · บทความและแบรนด์ · อาจ random หรือ fix ได้"
- **Backend** (`/app/backend/routes/cms.py`):
  - `LandingDoc` ขยาย: `featured_articles` + `featured_brands` (each: `mode: 'auto'|'random'|'fixed'`, `count: int`, `ids: List[str]`)
  - `DEFAULT_LANDING` seed: articles count=4 mode=auto, brands count=5 mode=auto
  - `GET /cms/landing` backfills new fields for legacy docs
- **Frontend Landing Manager** (`CmsLandingPage.jsx`):
  - 2 ใหม่: `● FEATURED ARTICLES (หน้าแรก)` + `● FEATURED BRANDS (หน้าแรก)` cards
  - **Mode selector**: Auto (ล่าสุด/popular) · Random · Fixed (admin เลือกเอง)
  - **Count input**: จำนวนที่จะแสดง
  - **Selected list**: chips with index `01..NN` + reorder ↑↓ + remove ×
  - **Pool picker** (collapsed `<details>`): list ทั้งหมด, click toggle, ✓ marker
  - Loads pool from `/cms/posts/public?type=article&limit=200` and `/brand-equity/showcase`
- **HomePage logic** (`HomePage.jsx`):
  - `applyFeatured()` helper applies mode:
    - **fixed** → preserve admin order, drop missing
    - **random** → shuffle (within fixed pool if any) → take N
    - **auto** → sort by `autoSorter` (newest published_at for articles, response_count desc for brands) → take N
  - Used for both Hero showcase (sortedBrands) and Knowledge Hub Featured Articles
- **Tested**: Set articles to Fixed + pick 2 → Save → Homepage shows exactly 2 (not 4 default) → Reset → revert to auto → Homepage shows 4 newest. Lint clean.


## 2026-02-07 — Migration: hardcoded learnContent → CMS 🚚
- **User**: "Migration script ย้าย hardcoded learnContent.js 10 บทความเข้า CMS (ลบ hardcoded ทิ้งหลัง verify)"
- **Migration script** (`/app/scripts/migrate_learn_to_cms.mjs`):
  - Node ESM + built-in `fetch` (no deps)
  - Dynamic-imports `learnContent.js`, login as admin, skip duplicates by slug
  - Converts each article: `description → > blockquote`, `sections[] → ## heading + body`, tool callout, related links → all merged into clean Markdown body
  - Tags from `keywords` (top 6), cover image from `image`, read time from `readMin`
  - Result: **created=10, skipped=0, failed=0** ✅ (all 10 hardcoded articles → published CMS posts)
- **Cleanup**:
  - Deleted `/app/frontend/src/pages/learn/learnContent.js` and `LearnArticlePage.jsx`
  - `LearnIndexPage` now CMS-only (loads via `/cms/posts/public?type=article`)
  - `HomePage` Knowledge Hub Featured Articles + stat strip count → CMS-driven
  - Route `/learn/:slug` → directly renders `<CmsArticleView/>` (single source of truth)
- **Verified**:
  - /learn shows 11 articles (10 migrated + 1 earlier test post)
  - /learn/brand-equity renders via CmsArticleView with Aaker cover image + Markdown body
  - Homepage hero still works, no compile errors, lint clean


## 2026-02-07 — Knowledge Hub × CMS Integration 📚
- **User**: "ทำให้บทความใน Knowledge Hub จัดการได้ด้วย"
- **Backend** (`/app/backend/routes/cms.py`):
  - `GET /cms/posts/public?type=article` — public list (no auth, only published & not deleted)
  - `GET /cms/posts/public/by-slug/{slug}` — public single post (no auth)
- **Frontend**:
  - `LearnIndexPage` ดึง CMS articles + merge กับ hardcoded `learnContent` (CMS posts ก่อน → featured = CMS ตัวล่าสุด)
  - แสดง cover image จาก CMS post ทั้งใน featured และ grid card (fallback เป็น diagram placeholder)
  - `CmsArticleView.jsx` (new) — render CMS post แบบ public ใน `/learn/{slug}`:
    - Breadcrumb, eyebrow + meta, title, title_en, excerpt, cover image + caption
    - **react-markdown** รองรับ h1-h3, p, ul/ol/li, blockquote, link, strong, code, hr — styled ตาม Swiss/Editorial design
    - Tags chips + Back button
    - SEO meta + JSON-LD Article schema
  - `LearnArticlePage` fallback ไป `<CmsArticleView/>` เมื่อ slug ไม่ตรง hardcoded `ARTICLES`
- **Dependency**: `react-markdown` ติดตั้งใหม่ผ่าน yarn
- **Tested**: Created + published article via API → /learn shows 11 articles (10 hardcoded + 1 CMS) → CMS post featured → click → renders markdown body with H2/list/blockquote correctly


## 2026-02-07 — Landing Page Manager (CMS extension) 🏠
- **User**: "ให้มีระบบจัดการหน้าแรกของ landing ด้วย"
- **Scope**: c (ทุกส่วน) · b (paste URL + AI generate image) · a (save publish ทันที) · a (form + reorder)
- **Backend** (`/app/backend/routes/cms.py` extended):
  - Collection `cms_landing` (single doc with `key="home"`)
  - `GET /cms/landing` (public, used by HomePage)
  - `PUT /cms/landing` (admin only)
  - `POST /cms/landing/reset` (revert to seeded defaults)
  - Default content seeded from previous HomePage hardcoded values (Foresight/Insight/Intelligence slides + 8 tools + Knowledge Hub + About Band sections)
- **Frontend** `/admin/cms/landing` — `CmsLandingPage.jsx`:
  - Hero Slides editor: eyebrow, headline lines (multi), accent index, lede, mantra words (multi), mantra accent index, image URL, AI generate button, image alt, caption — reorder ↑↓ + add/remove
  - Open Tools editor: tag, title, subtitle, path — reorder + add/remove
  - Knowledge Hub & About Band section editors (eyebrow, heading, accent word, lede, CTA label, CTA path)
  - Auto-rotate interval (ms) configurable
  - "Save & Publish" + "Reset Default" actions
  - Sticky header with Save button always accessible
- **HomePage** updated to fetch `/cms/landing` on mount + use API-driven slides/tools/sections + retain hardcoded fallback for SSR/offline
- Linked from `/admin/cms` ("Landing Page" button next to "Prompt Templates")
- **Tested**: Login → Edit slide 0 eyebrow → Save → reload Homepage → eyebrow updated. Reset → reverted to default.
- Lint clean (Python + JS)


## 2026-02-07 — CMS Content Studio with AI (Text + Image) 🆕
- **User**: "ทำระบบจัดการ content + ให้ AI ช่วยทำงาน (สร้างรูปประกอบ) มี prompt ตั้งต้นที่ปรับปรุงได้ จัดการได้ทั้ง content จาก prompt หรือจากของในฐานข้อมูล (เลือกได้) ใช้ prompt เสริมได้"
- **Scope confirmed**: posts หลายประเภท (Article/Insight/Case Story), sources (BE + Conjoint + CMS posts cross-ref), AI ทั้ง text+image+summary+translate, prompts ใน MongoDB, admin only
- **Backend `/app/backend/routes/cms.py`** (new):
  - Collections: `cms_posts`, `cms_prompt_templates`
  - Soft delete via `deleted_at`, restore + purge
  - 6 default prompt templates seeded on first read (article/insight/case_story/image/summary/translate)
  - Admin-only via `_is_admin` (UserRole.ADMIN)
  - Endpoints:
    - `GET/POST/PUT/DELETE /cms/posts`, `/posts/trash`, `/posts/{id}/restore`, `/posts/{id}/purge`
    - `GET/POST/PUT/DELETE /cms/prompts` (built-in defaults can be edited but not deleted)
    - `GET /cms/sources` — picker list across BE studies + Conjoint studies + CMS posts (with q search)
    - `POST /cms/ai/generate-text` — Gemini 2.5 Flash, accepts base_prompt + extra_prompt + sources, builds context from MongoDB
    - `POST /cms/ai/generate-image` — Gemini Nano Banana (`gemini-3.1-flash-image-preview`), returns base64 data URL
    - `POST /cms/ai/summarize` — sources → 5-7 bullet summary
    - `POST /cms/ai/translate` — TH ↔ EN
  - Bounded concurrency: `Semaphore(3)` + 55s/90s timeouts to prevent proxy 502
- **Frontend** (3 pages under `/admin/cms/...`):
  - `/admin/cms` — list with tabs (All/Article/Insight/Case Story/Trash), search, soft delete + restore + purge
  - `/admin/cms/new` and `/admin/cms/:id` — full editor:
    - Title/type/category/slug/excerpt/read min
    - Cover image: AI Generate (Nano Banana) button + paste URL fallback + caption + editable image prompt template + extra image prompt
    - Body: Markdown textarea + AI translate EN/TH + AI Write (template-driven)
    - Sources panel: pick BE/Conjoint/CMS items, multi-select chips, search filter, "Summarize → Body" action
    - AI Write Body panel: template selector (filtered by post type), prompt preview, extra prompt textarea, generate button
  - `/admin/cms/prompts` — manage prompt templates (edit/create/delete custom; defaults editable but not deletable)
  - Linked from `/admin` AdminSettings page ("Content Studio (CMS)" button)
- **Tested via curl + screenshots**:
  - Login + list 6 prompts (seeded)
  - List 21 sources (BE + Conjoint + CMS)
  - Create draft post + list returns it
  - AI text gen returned 370-char Markdown insight post (~3s)
  - AI image gen returned valid 1.18MB jpeg data URL from Nano Banana (~30s)
  - All 3 frontend pages render via `data-testid` selectors


## 2026-02-07 — Rotating Hero Copy + "Foresight" Brand Voice
- **User**: "พาดหัว เห่ย ไปหน่อย · 'เปิดเผย' มันเหมือนเน้นความสุจริต · เราเน้นว่าเก่งการตลาด มองเห็นว่าลูกค้าชอบอะไรก่อนใคร · ทำให้ rotate กันได้ไหม"
- **Follow-up**: "ทำให้ hero image มีหลายๆ รูป rotate ได้ ขอโทน ไทย+inter"
- **Repositioned brand voice** from "Open/Transparent Research" → **"Consumer Foresight & Insight"** (เห็นก่อน · อ่านใจก่อน · นำตลาด)
- **3 rotating hero triplets** (eyebrow + H1 + lede + mantra + image + image caption) auto-cycle every 5.5s + clickable dots:
  1. Foresight Lab — *"เห็นในสิ่งที่ตลาด · ยังมองไม่เห็น"* / `BANGKOK PULSE · LIVE` / Bangkok night neon + tuk-tuks
  2. Insight Studio — *"อ่านใจ · ผู้บริโภค · ก่อนใคร"* / `FIELD RESEARCH · 2026` / Asian students portrait
  3. Marketing Intelligence — *"รู้ก่อนตลาด · หนึ่งก้าว"* / `TEAM SYNC · MKT LAB` / Asian team in modern cafe
- **Image strategy** — โทน Thai+International: Thai urban context (Bangkok) + Asian consumers + Asian collaboration in global modern setting
- **Preload**: ภาพทั้ง 3 ถูก preload ตอน mount (`new Image()`) เพื่อกัน flash ตอน rotate
- **CSS**: เพิ่ม `@keyframes rotateIn` (opacity + translateY + blur fade), `.rotate-in` / `.rotate-in-slow` triggered ผ่าน React `key` change
- **Removed "เปิดเผย / เผยแพร่"** copy site-wide (Footer, About hero, About mission, About quote, Showcase index, Learn index)
- **Updated headings**:
  - Tools: "เครื่องมืออ่านใจผู้บริโภค"
  - Knowledge Hub: "อ่านเทรนด์ก่อนคนอื่น"
  - About hero: "เห็น · เข้าใจ · นำตลาด"
  - Showcase: "อ่านใจตลาดจริง"
- **SEO meta** updated: title/description นำด้วย "อ่านใจผู้บริโภคก่อนใคร"



## 2026-02-06 — 🌟 Liveliness V2: Bright/Modern + Imagery + Motion
- **User**: "ทำให้ สดใส ขึ้น · ใช้รูปประกอบ · ทันสมัยขึ้น"
- **Design agent** เรียกอีกรอบ — guidelines saved to `/app/design_guidelines.json`
- **CSS V2 layer** appended to `swumkt-design.css`:
  - `--logo-grad-soft` (soft 10% opacity version of the gradient)
  - `.glass` panel (rgba 78% white + 18px backdrop-blur saturate 180%) สำหรับ sticky topbar
  - `.bg-dots / .bg-dots-soft` — radial dots BG echoing the SWU MKT logo's network motif
  - `.card-modern` — soft 1px stroke + 16px radius + lift+shadow on hover + `.corner-accent` gradient corner triangle
  - `.btn-pill` (blue / dark / ghost) — pill-shaped CTAs replace boxy ones
  - `.chip / .chip--red / .chip--gray` — soft pill labels for categories
  - `.fade-up` + staggered delays (`.fade-up-1` … `.fade-up-5`) for entrance motion
  - `.img-frame` — rounded image container with paper bg
- **Topbar**: now `.glass` + sticky, "Sign in →" becomes blue pill button
- **HomePage**:
  - Hero: Pexels portrait photograph (Thai students field research) in rounded frame on right + "● FIELD RESEARCH · 2026" overlay chip; soft dots BG over white; 5 staggered fade-up animations
  - Featured brand → `.card-modern` with corner-accent gradient on hover
  - Tools bento → 4×2 modern cards (was bento with 1px gaps); each card: chip tag + serif title + sans description + blue "Open Tool →" CTA + corner-accent
  - Knowledge Hub → magazine image on right + dark pill CTA + 4 modern cards
  - Section transitions alternate `#FFFFFF` ↔ `var(--paper)` for breathing rhythm
- **ShowcaseIndexPage**: same modern card treatment, search becomes pill input on paper bg
- **Verified**: 5 staggered animations on hero, glass topbar visible, photographs render, alternating bg sections create rhythm



## 2026-02-06 — 🎨 Logo enlarged + Palette refined to Blue/Gray/Red only
- **User**: "ขยาย logo · ใช้ สี ฟ้า แดง เทา ไม่ใช่ ม่วง"
- **Logo size**: SwuLogo default `36px` → `56px`; topbar height `64px` → `88px`; footer brand logo → `64px`
- **Palette refined** (no more purple/pink):
  - Old gradient: Blue → Purple → Pink → Red (4 stops, too "playful")
  - New gradient: **Blue → Gray → Red** (3 stops, scholarly/corporate)
  - Tokens: `--logo-blue: #3597E4`, `--logo-gray: #8E8E93`, `--logo-red: #E22B37`
  - `--logo-grad: linear-gradient(90deg, #3597E4 0%, #8E8E93 50%, #E22B37 100%)`
- **Brand-logo fallbacks** (g1-g5) rebuilt with the new palette: blue, blue→gray, gray, gray→red, full spectrum
- All accents (italic-accent text, hero-grad-rule, tool-cta::before, dot--brand) automatically inherit the new gradient since they reference `--logo-grad`
- **Verified**: italic "เปิดเผย" / "in Public." now reads Blue→Gray→Red smoothly; logo height 56px confirmed via DOM measurement



## 2026-02-06 — 🎨 Logo Restoration + Brand Color Blending
- **User**: "เอา logo เก่ากลับมา · blend สี จาก logo เข้าไปใน design โดยรวมด้วย"
- **Logo analysis** (Gemini multimodal vision on the bitmap):
  - Wordmark gradient: Blue `#3597E4` → Purple `#8A58C7` → Pink `#D44F80` → Red `#E22B37`
  - Network of hexagonal nodes following the same spectrum
- **Restored logo**: `SwuLogo` component now renders the actual SWU MKT bitmap from `SWU_LOGO_URL` instead of typographic SWU/MKT wordmark
- **Blended brand palette into design system** (`swumkt-design.css`):
  - Added `--logo-blue / --logo-purple / --logo-pink / --logo-red` + `--logo-grad` (linear-gradient) tokens
  - Realigned `--be-red` to match the logo's exact `#E22B37`
  - `.italic-accent` (every italic accent word like "เปิดเผย" / "in Public.") now uses the **brand spectrum as a text gradient** via `background-clip: text`
  - `.hero-grad-rule` — replaces the plain 1px black border under the homepage hero with a 2px brand-spectrum hairline
  - `.tool-cta::before` — every inline tool CTA gets a 2px gradient accent rule along the top edge
  - `.dot--brand` variant — eyebrow dot with full-spectrum gradient (used sparingly)
  - **Brand-logo fallback gradients** (`.blogo--g1` through `.blogo--g5`) rebuilt from the logo palette so missing brand logos echo the platform identity:
    - g1=blue, g2=purple, g3=pink, g4=red, g5=full spectrum
- **Discipline preserved**: Swiss/editorial layout untouched — gradients used as ACCENTS (italic words, hairlines, fallback avatars) not on chrome/buttons/typography
- **Verified**: italic-accent renders as gradient text, logo loads from CDN, all 5 public pages still pass smoke test



## 2026-02-06 — 🎨 Public Pages V2: Integrated Claude Design Handoff
- **User feedback**: V1 redesign "ไม่สวย" — created design brief, user took to Claude Design tool, returned a `swumkt-handoff.zip` bundle
- **Integrated handoff**:
  - Copied `styles.css` (548 lines) → `/app/frontend/src/pages/swumkt-design.css`
  - Created `SwumktComponents.jsx` (Topbar, Footer, Eyebrow, BrandLogo with API support, ScoreRing, StatusPill, gradientForBrand)
  - Rewrote 5 public pages to use the new design system: HomePage, ShowcaseIndex, LearnIndex, LearnArticle, AboutSwuMarketing
  - Wired all pages to **real API data** (showcase fetched from `/api/brand-equity/showcase`) — design prototype used static data
  - Preserved: `useDocumentMeta` SEO hooks, JSON-LD schemas, react-router navigation, BrandLogo with uploaded-logo fallback to gradient+initial
  - Added responsive media queries (900px / 640px breakpoints) since prototype was desktop-only
- **Result**: Editorial / Monocle-style aesthetic with massive serif hero italics, asymmetric grids, 1px-gap-on-dark bento, sticky topbar, sitemap footer
- Old `LandingPage` archived at `/legacy-home` (rollback path)



## 2026-02-06 — 🏛️ SEO Restructure: Homepage Redesign + Knowledge Hub + Marketing Pillar
- **Why**: User wants Brand Showcase as homepage hero + multiple SEO content pages targeting Thai marketing keywords + restructure for Google ranking
- **Design**: เรียก `design_agent_full_stack` ออกแบบ Swiss/Editorial system — IBM Plex Serif/Mono/Sans, paper bg #F7F4EE, 1px hairline rules, large editorial serif headlines, restrained color (red #C8102E, black) — full guidelines saved to `/app/design_guidelines.json`

### New Pages
- **`/` HomePage** (`HomePage.jsx` NEW): Public Showcase as HERO ("งานวิจัยแบรนด์ที่เปิดเผย." massive serif), live brand grid pulled from `/api/brand-equity/showcase`, sticky topbar (Showcase/Learn/About/Sign in), bento Tools grid (8 cards: Brand Health, Conjoint, Customer Journey, Perception, Behavior, Survey Builder, Content Hub, Kanban), Knowledge Hub teasers (4 latest articles), About band on dark, sitemap-style 4-column footer for SEO crawlability
- **`/learn` LearnIndexPage**: Magazine-style grid of 10 articles with category + read time, JSON-LD CollectionPage + ItemList
- **`/learn/:slug` LearnArticlePage**: Editorial article template — breadcrumb, IBM Plex Serif h1/h2, IBM Plex Sans Thai body, **bold** + [link](url) markdown-lite renderer, blockquotes with red border, inline TOOL CTA block (black bg), author byline, related articles cluster, JSON-LD Article schema
- **`/about/swu-marketing` AboutSwuMarketing**: Pillar page for E-E-A-T — campus image, mission statement, 3 stat blocks (Established/Focus Areas/Research Output), tools shortcut on dark band, JSON-LD `EducationalOrganization`
- Old LandingPage archived at `/legacy-home`

### Knowledge Hub Content (10 SEO articles, all in Thai)
1. `brand-equity` — Brand Equity คืออะไร · Aaker framework
2. `conjoint-analysis` — CBC + D-Optimal + Market Simulator
3. `customer-journey-mapping` — 5 stages, touchpoints, MoT
4. `customer-perception` — Perceptual Map, Sentiment AI
5. `customer-behavior` — EBM Model, Maslow, involvement
6. `positioning-strategy` — Trout & Ries framework
7. `segmentation-targeting` — STP + 5 targeting strategies
8. `4ps-marketing-mix` — 4Ps + 7Ps for services
9. `swot-analysis` — TOWS Matrix
10. `marketing-research-methods` — Quant vs Qual comparison

แต่ละบทความมี `tool` link ไปหน้า tool ที่เกี่ยวข้อง + `related` ที่ link ข้ามบทความ (cluster strategy)

### Technical SEO
- All pages use `useDocumentMeta` hook (title, OG, Twitter, canonical, JSON-LD)
- `/sitemap.xml` ใหม่ (14 URLs) + `Sitemap:` directive ใน robots.txt
- Updated `robots.txt`: allow `/learn`, `/about/`, disallow auth/admin pages
- Article schema: Article + Organization publisher + datePublished + dateModified + keywords
- Internal linking strategy: every article links 2-3 related articles + 1 tool CTA
- Footer sitemap: 4 columns (Explore/Tools/Learn/Account) for crawlability

### Verified
- Smoke test: ทั้ง 4 หน้าใหม่ load สำเร็จ พร้อม title + OG + JSON-LD ครบ
- Cross-navigation: hero buttons → showcase, learn nav → articles, footer links → tools
- About band: white text on dark fixed (was blending with bg)



## 2026-02-06 — 🔍 SEO + Social Share Previews (Meta tags + JSON-LD)
- **Why**: ให้นักวิจัยใช้ลิงก์ `/showcase/{token}` แชร์บน LINE/Facebook/Twitter ได้สวย พร้อมโลโก้แบรนด์ + คะแนน — และ Google index ได้
- **Custom hook** (`/app/frontend/src/hooks/useDocumentMeta.js` NEW):
  - Lightweight, zero-dependency hook ที่ inject meta tags ผ่าน DOM โดยตรง (เลี่ยง react-helmet-async ที่ไม่เข้ากับ React 19)
  - Manages `<title>`, `<meta name="description">`, OG tags, Twitter Card tags, canonical link, JSON-LD `<script type="application/ld+json">`
  - Auto-cleanup on unmount (กัน meta ค้างข้ามหน้า)
- **Showcase index** (`/showcase`):
  - Title: "Brand Health, in Public · SWU MKT" + dynamic count description
  - JSON-LD `CollectionPage` + `ItemList` (top 20 brands) for rich snippets
- **Showcase detail** (`/showcase/{token}`):
  - Title: `{Brand} · Brand Health Check — SWU MKT`
  - Description: รวม Brand Equity score, tier (Healthy/At watch/At risk), response count
  - og:image: brand logo (external URL > base64 > SWU fallback) — Facebook ตัด data: URIs จึงเลือก URL ก่อน
  - JSON-LD `Report` schema + `Brand` + `Organization` publisher
- **Default tags** (`index.html`): OG + Twitter Card defaults สำหรับ crawler ที่ไม่ render JS
- **robots.txt** (NEW): Allow `/showcase/*`, disallow auth pages, special rules สำหรับ facebookexternalhit, Twitterbot, LineBot, WhatsApp
- **Verified**: Title resets ถูก คน navigate ระหว่างหน้า, og: tags ตั้งค่าถูกตามเนื้อหา, JSON-LD schema valid



## 2026-02-06 — 🔗 Landing page: Showcase entry points
- เพิ่ม Showcase link 2 จุดบน landing page หลักให้ visitor ค้นหา public showcase ง่าย:
  - **Top nav (desktop + mobile)**: "● ผลงานวิจัยแบรนด์" — มี red dot pulsing accent
  - **Hero tertiary CTA**: "● ดูผลงานวิจัยแบรนด์ที่เปิดสาธารณะ →" ใต้ปุ่มหลัก เข้ากับ branding ไม่บดบัง CTA primary
- TH/EN translations: `nav.showcase` + `landing.viewShowcase`
- คลิกที่ลิงก์ → ไปที่ `/showcase` (public, no auth)



## 2026-02-06 — 🐛 Showcase: "Identity ที่แบรนด์ตั้งใจ" output ไม่ครบ
- **User report**: หน้า public showcase แสดง section Identity vs Image ไม่ครบ — "ที่แบรนด์ตั้งใจ" ว่างเปล่า
- **Root cause** (`BrandEquityDashboardPage.jsx` line 60 ก่อนแก้):
  ```js
  identity: sd.logo_asset ? { visual_assets: [sd.logo_asset] } : { visual_assets: [] }
  ```
  ตอน reconstruct study object ใน showcase mode เก็บแค่ logo asset → `study.identity.traits / archetype / brand_promise / ai_summary / visual_palette / visual_keywords` หายหมด → SectionIdentity render ว่าง
  Backend `/showcase/{token}` ก็ไม่ได้ส่ง `identity` ออกมา (มีแค่ `logo_asset` แยก)
- **Fix**:
  - Backend (`brand_equity.py`): เพิ่ม `identity_safe` projection ใน `/showcase/{share_token}` payload — รวม traits, description, brand_promise, archetype, derived_traits, visual_palette, visual_keywords, ai_summary, visual_assets (logo เท่านั้น เพื่อไม่ให้ palette images รั่ว)
  - Frontend: ใช้ `sd.identity` แทน reconstruct เอง (มี fallback สำหรับ payload เก่า)
  - ปรับ message "AI ANALYSIS PENDING" ใน showcase mode: "เจ้าของ study ต้องรัน AI analysis ก่อน" แทน "กดปุ่ม Run AI analysis ด้านบน" (ใน showcase ไม่มีปุ่มนั้น)
- **Verified**: archetype "THE CREATOR", AI summary, palette 4 สี, 9 visual keywords, 11 traits — ออกครบบนหน้า public showcase



## 2026-02-06 — 🎭 Public Showcase Hub Page (`/showcase` index)
- **Why**: User requested a landing page where visitors can browse all Brand Equity studies that owners have published as public showcases — instead of needing the direct `/showcase/{token}` URL
- **Backend** (`/app/backend/routes/brand_equity.py`):
  - `GET /api/brand-equity/showcase` (NEW, public, no auth): lists studies where `is_public_showcase: true` AND not soft-deleted
  - Lean projection — brand name, category, logo, competitors, response_count, ready_for_dashboard flag
  - Registered BEFORE `/showcase/{share_token}` to avoid path collision
- **Frontend** (`/app/frontend/src/pages/brand-equity/BrandEquityShowcaseIndexPage.jsx` NEW):
  - Public route `/showcase` (no auth required) registered in App.js
  - Editorial/Swiss design: large serif hero "Brand Health, in Public.", stats bar (BRANDS · RESPONDENTS · READY TO READ), search filter (name/category/competitor), grid of brand cards
  - Each card → click navigates to `/showcase/{share_token}` (existing public dashboard)
  - PUBLIC vs AWAITING DATA badge based on `ready_for_dashboard` (response_count >= 10)
  - Empty/no-match states; sparse-grid override (transparent bg + border per card) when items < 3
- **Verified**: List endpoint returns 1 showcase publicly, click-through to detail loads full dashboard



## 2026-02-06 — 🗑️ Conjoint Analysis: Soft-delete + Trash Bin (mirroring Brand Equity)
- **Why**: User explicitly requested feature parity — "ทั้ง conjoint และ brand" — Brand Equity got Trash in prior iteration but Conjoint was missed
- **Backend** (`/app/backend/server.py`):
  - `DELETE /api/conjoint/studies/{id}` → soft-delete (sets `deleted_at` ISO string), returns `{trashed: true}`
  - `GET /api/conjoint/studies` → adds `{deleted_at: {$exists: False}}` filter to hide trashed items
  - `GET /api/conjoint/studies/trash` (NEW): registered BEFORE `/{study_id}` route to avoid path collision; returns trashed items with `deleted_at` timestamp; auto-purges items > 30 days on each call (cascades responses)
  - `POST /api/conjoint/studies/{id}/restore` (NEW): `$unset` deleted_at, returns `{trashed: false}`
  - `DELETE /api/conjoint/studies/{id}/purge` (NEW): hard delete study + responses, no recovery
  - All endpoints enforce creator-or-admin permission (consistent with existing pattern)
- **Frontend** (`/app/frontend/src/pages/ConjointAnalysisTool.js`):
  - View tabs at top of Studies card: "การศึกษาของคุณ" vs "ถังขยะ" with live count badge
  - Soft-delete confirm modal updated: "ย้ายการศึกษาไปยังถังขยะ?" with 30-day recovery note (replaces old "ลบถาวร" wording)
  - Trash view: amber-bg cards with deleted-at date, "เหลือ N วัน" countdown, owner badge for admin, **Restore** + **Purge** buttons
  - Purge confirm modal: separate red modal with "⚠️ ลบถาวร — ไม่สามารถกู้คืนได้"
  - Fixed pre-existing typo `studyToDelete.name` → `studyToDelete.title`
- **Verified** (testing agent iteration 18, 7/7 backend pytest + 100% frontend UI flows)

## 2026-02-06 — 🐛 Brand Equity: Aided Recognition "Brand X" hallucination fix
- **Issue**: ผู้ตอบเห็นแบรนด์ปลอม "Brand X / Y / Z" ในคำถาม Aided Recognition ทั้งที่ admin ไม่ได้ใส่
- **Root cause** (`/app/backend/routes/brand_equity.py` line 441-442 ก่อนแก้):
  ```python
  decoys = ["Brand X", "Brand Y", "Brand Z"]
  q["options"] = brand_list + decoys[:max(0, 5 - len(brand_list))]
  ```
  โค้ดเดิม pad รายการแบรนด์ให้ครบ 5 ตัวด้วย dummy names — สร้าง survey data integrity issue
- **Fix**: ใช้เฉพาะ `brand_setup.name + competitors` (deduplicate case-insensitive, strip whitespace, drop empties); ไม่ pad ใด ๆ
- **Verified**: 0/2/many competitors เคสทั้งหมดผ่าน — options แสดงเฉพาะแบรนด์จริงที่ user ใส่



## 2026-05-06 — 🗑️ Brand Equity: Soft-delete + Trash Bin (30-day recovery)
- **Why**: ป้องกันกดผิดลบงานวิจัยนักศึกษา — เดิม DELETE ลบถาวรทันที (study + responses + AI cache)
- **Backend** (`/app/backend/routes/brand_equity.py`):
  - `DELETE /studies/{id}` → soft-delete (set `deleted_at` timestamp) แทน hard delete
  - `GET /studies` → ซ่อน studies ที่มี `deleted_at` ฟิลด์
  - `GET /studies/trash` (ใหม่): รายการ trashed (owner-scoped + admin) พร้อม auto-purge items >30 days on each call
  - `POST /studies/{id}/restore` (ใหม่): unset `deleted_at` → กลับมา active
  - `DELETE /studies/{id}/purge` (ใหม่): hard delete ทั้ง study + responses (ไม่มีกู้คืน)
- **Frontend** (`BrandEquityListPage.jsx`):
  - View toggle: `ACTIVE · N` / `TRASH · N` chips ที่ header
  - Active view: ปุ่ม Delete เดิม → เรียก soft-delete + confirm "ย้ายไปถังขยะ กู้คืนได้ 30 วัน"
  - Trash view: การ์ด greyscale + hatched bg + ชื่อขีดฆ่า · แสดง "ลบเมื่อ X วันที่แล้ว · เหลือ Y วัน" (เตือนสีแดงเมื่อ ≤7 วัน) · ปุ่ม **↺ Restore** (dark primary) + **✕ Purge** (red outline, **double confirm**)
  - Trash count badge อัปเดต live ทุก operation
- **Verified (API + UI E2E)**:
  - Create → Delete → ACTIVE ซ่อน, TRASH โผล่ ✅
  - Restore → กลับเข้า ACTIVE, Trash ว่าง ✅
  - Purge → HTTP 404 บน GET ตามหลัง (hard-deleted จริง) ✅
  - Auto-purge >30d → cleanup hook ใน `/trash` endpoint
- ไม่กระทบ ownership / owner-filter / admin scope ใด ๆ


## 2026-05-06 — 🚨 Brand Equity AI Analyze: Concurrency + Timeout Hardening
- **Issue (ต่อจาก server overload fix)**: User รายงาน AI analyze ของ Brand Equity ก็ทำให้ระบบน๊อค
- **Root causes**:
  1. **Multimodal Gemini call** (`_ai_extract_visual_identity`) ไม่มี timeout → ค้าง > 60s → proxy 502 + holds connection slot
  2. **No idempotency** บน `start_ai_analysis` — user กด "Analyze" ซ้ำ ๆ ขณะ pipeline ยังรันอยู่ → multiple 5-15min pipelines พร้อมกัน → CPU/memory spike
- **Fix** (`/app/backend/routes/brand_equity.py`):
  - `_gemini_call`: wrap `chat.send_message` ด้วย `asyncio.wait_for(..., timeout=55s)` · log + return "" เมื่อ timeout
  - `_ai_extract_visual_identity`: wrap multimodal `chat.send_message` ด้วย `asyncio.wait_for(..., timeout=55s)` · return `{}` เมื่อ timeout
  - `start_ai_analysis`: ก่อน enqueue ตรวจ `study.ai_cache.status` — ถ้าเป็น `queued` หรือ `running` ตอบ `{"status": <existing>, "message": "AI analysis already in progress"}` แทน
- **Verified**: idempotency curl test → 1st = queued, 2nd/3rd = guard ตอบกลับสถานะเดิมไม่ enqueue ซ้ำ · backend health 200


## 2026-05-06 — 🚨 Production Server Overload: Event-Loop Blocking Fix
- **Issue**: User รายงาน production (https://swumkt.org) ดับเป็นช่วง ๆ — login ไม่ได้ระหว่างนั้น
- **Root cause**: single-worker uvicorn ถูก block โดย CPU-bound sync code ใน async routes:
  1. `_create_thesis_docx()` (math2docx + LaTeX→OMML + PIL) เรียกตรงใน `export_thesis_download` → block 5-30s
  2. `compress_base64_image()` 9 จุด ใน image generation/upload routes → 100-500ms ต่อรูป
  เมื่อมีคน export thesis หรือ upload หลายรูป event loop ค้าง → ทุก request รวมถึง login ค้างหมด
- **Fix** (`/app/backend/server.py`):
  - เพิ่ม `import asyncio` ที่ top of file
  - `_create_thesis_docx` → `await asyncio.to_thread(_create_thesis_docx, ...)`
  - 9 call sites ของ `compress_base64_image` → `await asyncio.to_thread(compress_base64_image, ...)` (sed bulk replace)
  - เพิ่ม async wrappers `compress_base64_image_async` / `create_thumbnail_base64_async` สำหรับใช้ในอนาคต
  - ทุก call site อยู่ใน `async def` แล้ว (verified ผ่าน AST walk)
- **Verified**: 10 parallel logins บน preview ทำงานครบใน ~1s (event loop ไม่ block แล้ว) · backend restart OK · health endpoint 200


## 2026-05-06 — 🔐 Hardcoded Admins: Auto-Promote on Every Auth (was admin-only endpoints)
- **Issue**: `intaka@gmail.com` (hardcoded admin) ยังเห็นเฉพาะ Brand Equity ของตัวเอง — เพราะ DB role ยังเป็น `public_user` และการ auto-promote เดิมเกิดเฉพาะตอนยิง endpoint ที่ใช้ `get_admin_user` (ซึ่ง brand_equity ไม่ได้ใช้)
- **Fix**: ย้าย hardcoded-admin check + auto-promote เข้าไปใน `get_current_user` (ผ่าน helper `_ensure_hardcoded_admin`) — ทำให้ทุก endpoint ที่ใช้ `Depends(get_current_user)` เห็น `role=admin` ทันที (ทั้ง JWT path, session path, cache path)
- **Constants**: `HARDCODED_ADMIN_EMAILS = {"intaka@hotmail.com", "intaka@gmail.com"}` (module-level)
- **DB migration**: promote intaka users 2 คนใน preview DB เป็น admin ทันที (production DB จะถูก promote อัตโนมัติเมื่อ user login ครั้งถัดไปหลัง redeploy)
- `get_admin_user` ตอนนี้ถูกย่อให้ check role อย่างเดียว (hardcoded check ทำที่ระดับ get_current_user แล้ว)
- Backward compatible · ไม่กระทบ admin คนอื่น · admin@swu.ac.th list test ผ่าน 5/5


## 2026-04-28 — 🛠️ Clipboard Permission Fix (Iframe Preview)
- **Issue**: `NotAllowedError: Failed to execute 'writeText' on 'Clipboard'` เมื่อกด Copy ภายใน preview iframe (Permissions Policy block ใน cross-origin context)
- **Solution**: ใช้ utility `/app/frontend/src/lib/clipboard.js` (modern API → legacy `execCommand` textarea fallback → toast manual copy) ทดแทนการเรียก `navigator.clipboard.writeText` ตรง ๆ
- **Files migrated** (5):
  - `CustomerBehaviorTool.js` (Copy AI Prompt)
  - `ContentEditor.js` (Copy Rearrange Prompt)
  - `CustomerJourneyTool.js` (Copy Mermaid Prompt — i18n preserved)
  - `KanbanBoard.js` (Copy Public Link)
  - `ProjectsPage.js` (Copy Public Link)
- **Skipped** (Alumni paused): `alumni/InviteModal.jsx`
- **Verified**: smoke test คลิก Copy บน /projects → toast "คัดลอก Public Link แล้ว!" แสดงผล, 0 runtime errors


## 2026-04-28 — 🎨 Conjoint Module: Visual Theme Unification with Brand Equity
- Conjoint Analysis module ทุก 5 หน้าตอนนี้ใช้ design system เดียวกับ Brand Equity (Editorial / Swiss / Plex stack)
- **Reused** `brand-equity-styles.css` เป็น single source of truth (no rename, no duplicate)
- **New CSS scope** `.be-conjoint-page` + 8 override rules ภายใน `.be-root` ที่ flatten shadcn corners, ลบ shadows, แปลง blue/purple buttons → ink/red, แทน gradient bg ด้วย paper-2
- **Pages restyled** (shell only — chart/table/form logic untouched):
  - `ConjointAnalysisTool.js` — list page header สวยขึ้น, BeTopbar, `be-btn-red` CTA
  - `ConjointDesignPage.js` — wizard wrapped, BE topbar
  - `ConjointResultsPage.js` — dashboard + `insufficient_data` state ใช้ be-card / be-eyebrow / be-data
  - `ConjointQualitativePage.js` — wrapped
  - `ConjointSurveyPage.js` — PUBLIC: local `PublicTopbar` (logo SWUMKT + 'CONJOINT ANALYSIS · ANONYMOUS'), loading/notfound/submitted states ทั้งหมดใช้ be-card
- **Scope isolation verified**: CSS overrides scoped ภายใน `.be-root` เท่านั้น, ไม่ leak ไปกระทบหน้า non-Conjoint, non-BE
- **Testing**: iteration_17 · 7/7 frontend e2e pass · BE regression OK · 0 UI bugs · 0 console errors



## 2026-04-27 (later 3) — 🌐 Brand Equity: Public Showcase Mode
- **New `is_public_showcase: bool`** field on study (default false). Owner toggles via existing `PUT /api/brand-equity/studies/{id}`
- **New endpoint** `GET /api/brand-equity/showcase/{share_token}` — public, no auth:
  - 403 if not published as showcase, 404 if unknown token
  - Returns sanitized payload: brand, status, response_count/target, aggregate (demographics removed), ai_cache (whitelist: themes_by_question · identity_image · master_insights · normalized_by_question), logo_asset
  - Strips owner_id, owner_email, raw responses, palette/design images
- **Frontend** `BrandEquityDashboardPage.jsx`:
  - Detects showcase mode via `location.pathname.startsWith('/showcase/')`
  - On showcase path: fetches public endpoint (no auth), normalizes payload to dashboard's expected shape, swaps `BeTopbar` for `PublicTopbar` (logo + Powered-By tag)
  - Hides owner controls: edit, launch, refresh, run-ai, regen-insights, copy-share-link, showcase-toggle
  - Shows "Take the survey →" CTA when status ∈ {collecting, analyzing}
  - Footer: SWUMKT logo + "POWERED BY · SWU · Marketing Research Tools" + home + take-survey links
- **Owner toolbar**: new `Publish as showcase` toggle (`be-dashboard-showcase-toggle`, disabled until 10+ responses) + `Copy showcase URL` (`be-dashboard-showcase-copy`) revealed when ON
- **Route**: `/showcase/:token` registered in `App.js` (no `ProtectedRoute`)
- **Testing**: iteration_16 · 6/6 backend pytest · frontend e2e pass · `/app/backend/tests/test_brand_equity_showcase.py`. Testing agent fixed 2 mid-flight bugs: (a) footer JSX leaked into `SectionLoyalty` scope causing ReferenceError, (b) regen-insights button leaked into public — both gated with `!isShowcase`



## 2026-04-27 (later 2) — 🏆 Brand Equity: Unlimited Competitors + Topic Grouping + TH Trait Pool
- **🚀 Removed competitor cap** — `competitors_top` no longer slices to `[:2]`, accepts any number of competitors. Each `COMP-1..COMP-5` template + every `COMP-CUSTOM-*` now emits one question per competitor (was top-1 for custom)
- **📑 Topic-based grouping** — every Likert question carries `comparison_group = axis_label` (or fallback to template id). New helper `_group_questions_for_comparison` re-orders within each dimension so brand+all-competitors for the same topic appear contiguously: brand first, then competitors in user input order. Singleton groups stay in the original perspective layout (no misleading 1-brand topic).
- **🇹🇭 Hard-coded Thai trait translations** — `DEFAULT_TRAIT_POOL_TH` (24 items) + `PERSONALITY_TRAIT_POOL_TH` (17 items) + `TRAIT_TH_MAP` lookup dict. Every `trait_grid` question now carries `options_th` parallel to `options`. Storage stays in EN (so stats engine + dashboard unchanged); UI swaps display label only.
- **Frontend Respondent**:
  - `QuestionInput` — trait_grid / mcq_single / mcq_multi pick `options_th` when `lang='th'` (display only, value submitted is still the EN canonical)
  - New axis-group renderer with header `หัวข้อ · <attr> · N แบรนด์` (TH) / `TOPIC · <attr> · N brands` (EN), gold dot indicator
  - Identity perspective sub-grouping retained for non-axis questions (BI-1..BI-4, ASO-1, ASS-1, ASP-1)
  - `data-testid='be-resp-group-header-{axis}'` for testability
- **Frontend Wizard step 0**: removed "top 2 only" hint; added live "+ N×5 questions" estimate side panel
- **Testing**: iteration_15 · 13/13 backend pytest · frontend lang toggle + wizard text verified · `/app/backend/tests/test_brand_equity_grouping_trait_th.py`



## 2026-04-27 (later) — 🖼️ Brand Equity: Real Brand Logos + Editable Studies
- **New `BrandLogo` component** (`be-components.jsx`) with priority fallback chain:
  1. `identity.visual_assets[kind=logo]` (uploaded base64) → 2. `brand.logo_url` (URL) → 3. initial letter on gradient
  - `onError` auto-falls back to initial when remote URL breaks
- **Replaced initial-letter boxes with real logos** on:
  - Studies List card (`.be-study-card`)
  - Dashboard hero (`be-dashboard-brand-logo`)
  - Public Respondent welcome screen (size 64) + question header (size 42)
- **Wizard Step 0 — Logo card**: URL input + Upload button + live preview + clear; supports both `brand.logo_url` and inline upload (de-duplicates kind='logo')
- **Backend** `get_public_study`: surfaces standalone `logo_asset` (kind=logo only) instead of full `visual_assets` — drops public payload size while letting respondent render real logo
- **🐛 Fixed Edit Bug**: previously editing a study or going back to fix typos created duplicate studies because Wizard always POSTed a new one. Now:
  - `loadStudy` lands on Step 0 (was auto-jumping to Step 3 review)
  - `Stepper` is clickable in edit mode (jump freely)
  - `proceedToReview` uses `PUT /studies/{id} + POST regenerate-questions` when `study.id` exists; falls back to `POST /studies` for brand-new
  - Step 2 button label switches to **"Update & regenerate →"** for existing studies
  - Step 3 launch becomes **"Save & re-publish"** for `status='collecting'`
  - Quick **"Save changes"** button on every step (steps 0/1/2 + step 3) for edit mode
- **Edit access points**: "Edit study" button on Dashboard hero + small "Edit" on every List card (stopPropagation)
- **Testing**: iteration_14 · 7/7 backend pytest · 100% frontend e2e · `/app/backend/tests/test_brand_equity_logo_edit.py`



## 2026-04-27 — 🎨 Brand Equity: SWUMKT Logo + EN Translation Polish
- **Backend** `brand_equity.py`:
  - New `_translate_attrs_to_en(attrs_th)` helper — Gemini 2.5 Flash translates TH brand-quality attributes to natural EN adjectives (1:1 indexed, falls back to TH on error)
  - `BrandSetup.custom_quality_attributes_en: List[str]` parallel field
  - `POST /studies` auto-translates on create
  - `PUT /studies/{id}` re-translates only when TH list changed (saves Gemini calls)
  - `POST /studies/{id}/regenerate-questions` lazy-backfills EN list for legacy studies
  - `_generate_questions_from_template` emits proper `prompt_en` for PQ-CUSTOM-* and COMP-CUSTOM-* (e.g. "Brand is a brand that is trustworthy") instead of leaking Thai into EN respondent flow
- **Frontend** Brand Equity:
  - `BeTopbar` now shows real SWUMKT logo (`<img class='be-logo-img'>`) + name + sub-label, replacing the abstract dot — applied to List, Wizard, Dashboard
  - New `PublicTopbar` on `BrandEquityRespondentPage` (welcome / question / demographics / thanks) with logo + LangToggle so survey looks part of the SWU MKT system
  - Mobile-responsive CSS (`.be-public-topbar`, `.be-public-logo`)
  - Exported `SWU_LOGO_URL` constant from `be-components.jsx`
- **Testing**: iteration_13 · 7/7 backend pytest · frontend topbar + toggle + persistence verified on 3 pages · `/app/backend/tests/test_brand_equity_translation.py`


## 2026-04-27 — 📡 Activity Stream — Real-time Tree Events
- **Backend**:
  - New `_log_activity(actor_id, kind, summary, target_id, meta)` helper in alumni.py
  - New collection `alumni_activities`
  - `GET /api/alumni/activity/stream?scope=tree|global|self&limit=30` — filters events by ancestors+descendants+direct relations (BFS up to 8 levels)
  - 9 activity kinds auto-logged: `joined_family`, `position_changed`, `company_changed`, `post_created`, `job_posted`, `review_given`, `tree_extended`, `level_up`, `badge_earned`
  - Anonymous reviews skip activity log (privacy hardening)
  - Helpers dict now exposes `_log_activity` to phase2 router
- **Frontend** `ActivityStream.jsx`:
  - Right sidebar of `/alumni/feed` (3 tabs: สายของฉัน / ทั้งคณะ / ของฉัน)
  - Compact version on `/alumni/tree` sidebar
  - Auto-refresh every 60s · click item → /alumni/profile/{actor.user_id}
  - Each kind has emoji + tone color · time-ago formatter
- **Testing**: iteration_9 · 13/13 backend · 100% frontend · `/app/backend/tests/test_activity_stream.py`

## 2026-04-26 — 🚀 Alumni Phase 2: Discover + Feed + Jobs + Reviews
**4 new major features in modular `alumni_phase2.py` router (~512 lines, separate from main alumni.py)**

- **Discover (Mystery Match)** `/alumni/discover`:
  - `GET /api/alumni/discover/mystery-match` returns 1 alumni 3-6 hops away with reasons
  - Filters: hop range (close/far/all), industry
  - `POST /discover/skip/{user_id}` to never see again
  - UI: blur→reveal animation, gradient card, 4 actions (Mark/View/Skip/Shuffle)
- **Feed** `/alumni/feed`:
  - 6 post kinds: plain, throwback, review, job_share, announcement, search_help
  - `POST /feed/posts` (+5 XP), `GET /feed/posts` with kind filter
  - `POST /feed/posts/{id}/react` toggle ❤️ (notifies author)
  - `GET/POST /feed/posts/{id}/comments` (notifies author, increments comment_count)
  - `DELETE /feed/posts/{id}` (author only)
  - UI: composer with kind selector, post cards, react toggle, expandable comments
- **Jobs Directory** `/alumni/jobs`:
  - `POST /jobs` (+30 XP), supports kind=hiring|seeking_referral, level, salary, apply_url
  - `GET /jobs` with kind+level filters
  - `POST /jobs/{id}/interest` increments counter, notifies poster, idempotent
  - `DELETE /jobs/{id}` soft-deletes (active=false, preserves analytics)
  - UI: filter chips, JobCard with poster avatar + interest button, PostJobModal
- **Reviews 1-5 stars** (in Profile page sidebar):
  - `POST /reviews` (+25 XP first review only) with stars + tags + optional anonymous
  - `GET /reviews/user/{user_id}` returns reviews + average + breakdown + top_tags
  - `GET /reviews/tags` returns 13 curated tag list
  - Upsert behavior: re-reviewing same person updates not duplicates
  - Anonymous reviewer_id stripped from API response (privacy hardened)
  - UI: ReviewModal (StarInput + tag chips + anonymous toggle), ReviewsSection (avg, breakdown bars, top tags, list)
- **Architecture**: `get_alumni_routes` now returns `(router, helpers)` tuple. Phase 2 receives helpers via factory pattern — clean separation.
- **New collections**: alumni_posts, alumni_post_comments, alumni_jobs, alumni_reviews, alumni_mystery_skipped
- **Top nav**: now 6 tabs (หน้าแรก · สายตระกูล · Discover · ฟีด · งาน · ฉัน)
- **Testing**: iteration_8 · 24/24 backend pytest · ~95% frontend · `/app/backend/tests/test_alumni_phase2.py`

## 2026-04-18 — 🚀 Alumni Phase 1.5: Viral Invite + Gamification Engine + Notifications + Trivia
- **Invite Viral Loop (production-ready)**:
  - Shareable link `/alumni/invite/{code}` with public preview endpoint (shows inviter card)
  - InviteModal: real **QR code** (qrcode.react SVG), Copy Link, LINE deep-link share, Download QR
  - Floating Action Button (+100 XP badge) + Sticky top-nav "ชวนเพื่อน" button
  - Auto-mark flow: new registrant via link → auto-creates pending 'take' relation to inviter
  - Pending invite code persists in localStorage across register → onboarding → accept
  - Inviter earns **+100 XP** per accepted invite + notification
- **XP / Badge / Level Engine**:
  - `XP_EVENTS` catalog: login_daily +5, upload_avatar +20, mark_relation +10, relation_confirmed +30, invite_sent +5, invite_accepted +100, trivia_correct +10, streak milestones +20/+50/+100/+300
  - 8 auto-unlock badges (`BADGE_RULES`): tree_builder, king, 5_tier_club, connector, reviewer, iq_master, streak_7, streak_30
  - 15-level progression (XP thresholds [0→50000])
  - Level-up notifications ("🎉 Lv.5 แล้ว!") + badge-earned notifications
- **Streak System**: `_touch_streak` on `/me` — auto resets if >1 day gap, +XP at 3/7/14/30 day milestones
- **Notifications**:
  - New collection `alumni_notifications` with `{user_id, kind, title, body, meta, read, created_at}`
  - Bell icon in top nav with unread red badge · dropdown with time-ago formatting · deep-links to relevant page · "อ่านทั้งหมด" mass-mark-read · 30s polling
  - Event kinds: mark_request, relation_confirmed, invite_accepted, welcome, badge, level_up, streak
- **Trivia "รู้จักสายของคุณไหม?"** (`/alumni/trivia`):
  - Auto-generates daily MCQ from user's tree (question types: company / position / gen)
  - 4 options with correct/wrong visual feedback + XP reward
  - IQ Leaderboard sidebar (top trivia_streak)
  - Idempotent per day
- **Throwback Widget** (Tree page sidebar):
  - Random 4 alumni with playful Thai captions ("มีใครจำพี่คนนี้ได้ไหม?", "ตำนานของรุ่น")
  - "สุ่มใหม่" refresh button
- **Privacy toggles** now fully functional (PUT /api/alumni/privacy with partial merge)
- **Testing**: iteration_7 · 18/18 backend · ~95% frontend · test file `/app/backend/tests/test_alumni_phase15.py`

## 2026-04-18 — 🎉 Alumni Network "สายตระกูล MKT SWU" Phase 1 MVP
- **New Feature**: Full Alumni Networking & Family Tree module (Phase 1 of 2).
- **Backend** — new router `/app/backend/routes/alumni.py` (factory pattern, separate from server.py):
  - `GET /api/alumni/stats` (public, no auth) — landing page stats
  - `POST /api/alumni/register`, `GET /api/alumni/me`, `PUT /api/alumni/me`
  - `GET /api/alumni/profile/{user_id}`
  - `GET /api/alumni/tree/me`, `GET /api/alumni/tree/{user_id}` — BFS ancestor/descendant chain with auto-labeling (พี่ take / ปู่ / ทวด / เทียด / เทียดทวด)
  - `POST /api/alumni/relations` — mark (pending, needs 2-way confirmation)
  - `PUT /api/alumni/relations/{id}/confirm` — only `to_user` can confirm
  - `GET /api/alumni/relations/pending`, `GET /api/alumni/relations/mine`
  - `POST /api/alumni/invites`, `GET /api/alumni/invites`
  - `GET /api/alumni/search?q=&gen=`
- **MongoDB Collections**: `alumni_users`, `alumni_relations`, `alumni_invites`
- **Algorithm**: BFS traversal — derives ปู่/ทวด/เทียด automatically from confirmed `take` chains (distance 1→N); no materialization needed for MVP scale.
- **Frontend** — `/app/frontend/src/pages/alumni/`:
  - `AlumniLandingPage` (public) — hero with animated gen counter, 5 stat pills (live from DB), how-it-works, testimonials, final CTA
  - `AlumniOnboardingPage` — 4-step flow (verify → search พี่ take → invite → done), auto-skip to done if already registered
  - `AlumniTreePage` — tabs (สายขึ้น / สายลง / ทั้งหมด), clickable tree nodes with side panel, pending marks to confirm, Mark modal with live search
  - `AlumniProfilePage` — hero banner, stats, 8 badges catalog, chain path breadcrumb, streak calendar, quests, privacy toggles, edit form
  - Shared `AlumniLayout`, `AlumniUI` (Avatar/Chip/StatPill/Modal/Icons/Toast), scoped `alumni-styles.css` with IBM Plex Sans Thai
- **Routes registered** in `App.js`: `/alumni` (public), `/alumni/onboarding`, `/alumni/tree`, `/alumni/tree/:userId`, `/alumni/profile`, `/alumni/profile/:userId`
- **Seed Data** — `/app/backend/scripts/seed_alumni.py`: Creates 8 fake alumni + full bloodline chain for `student1@swu.ac.th` (ภูมิ, รุ่น 64) → 5 ancestors + 3 descendants exactly as spec.
- **Testing**: 17/17 backend tests passed · 100% frontend critical flows · test_report iteration_6.json

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
