# Conjoint Module — External-LLM workflow + Academic/Practitioner Audit
_Date: 2026-11-26 · WP2 of `memory/PLAN_2026_11_EXTERNAL_LLM.md` · follows `CONJOINT_AUDIT_2026_08.md`_

Everything below was either **executed** (numbers quoted are from runs on synthetic data with
known part-worths) or is explicitly marked _found by reading_. Tests:
`backend/tests/test_conjoint_2026_11_audit.py` (pure functions) and
`backend/tests/test_conjoint_2026_11_external.py` (real router, TestClient + mongomock-motor,
real `lib/llm_policy`). API for the frontend: `memory/LLM_EXTERNAL_CONTRACT.md` § Conjoint.

The August fixes (F1–F10, R1–R8, thesis C1–C5) were re-run and still pass; nothing from them was
reverted. `ANALYSIS_CACHE_VERSION` **5 → 6**.

---

## Part 1 — External-LLM workflow

Every conjoint AI feature now has a system path guarded by `llm_policy.require_system_llm`
(placed before any job/cache write; re-asserted inside background jobs) and an external path
that always works:

| feature key | system path (409 `llm_external_only` when off) | external path |
|---|---|---|
| `conjoint.interpretation` | `ai-interpretation` | `ai-interpretation/external-prompt`, `/external-import` |
| `conjoint.qualitative` | `qualitative-analysis` | `qualitative-analysis/external-prompt`, `/external-import` (tolerant JSON) |
| `conjoint.thesis` | `export-thesis` | `export-thesis/external-prompt`, `/external-pack` (Markdown), `/external-import`, **`/no-ai`** |
| `conjoint.images` | 5 image endpoints | `<endpoint>/external-prompt` + existing `upload-image` / `upload-profile-image` |

Design decisions:
- **One builder per prompt.** `_build_interpretation_prompt`, `_build_qualitative_prompt`,
  `_build_thesis_prompt`, `_level_image_prompt`, `_profile_image_prompt`, `_product_prompt_writer`,
  `_shelf_prompt_writer` are called by both paths. Tests assert byte-equality of the external
  prompt with the builder output.
- **Same store, same guards.** Imported interpretations go to the same `analysis_cache` row
  (`ai_<method>_<all|single>`, `respondent_count`, `schema_version`), imported thesis chapters to
  the same `thesis_<methods>_<chapters>[_ep…]` row, imported attributes to
  `suggested_attributes` / `llm_analysis`. A new respondent invalidates an imported row exactly
  like a system row (tested). Rows carry `source`, `model_label`, `imported_at`, `imported_by`.
- **Cached results stay readable when the LLM is off** (tested for interpretation and thesis).
- **Policy errors are never swallowed.** `_is_policy_error` re-raises the 409 / `SystemLLMDisabled`
  from every broad `except Exception` around LLM calls; background jobs record
  `error_code: "llm_external_only"` with the Thai message (tested with a policy flip between
  request and job).
- **AI-use disclosure** is prepended to every thesis `.docx` that contains AI text, naming the
  tool (`model_label`, or "AI ของระบบ (Gemini 2.5 Flash)").
- **Thesis access rule unchanged** (admin OR owner + `can_export_thesis`) and applied to the new
  external/no-AI thesis paths too — relaxing it is a one-line owner decision in `_thesis_access`.
- The interpretation cache was never keyed by Results-page filters; the external path uses the
  same keys (documented in the contract so the UI can say "ทั้งหมด").

**No-AI thesis path.** Before: with the LLM unavailable `export-thesis` queued a job that failed
("AI service not configured") and produced nothing. Now `POST …/export-thesis/no-ai` renders
Chapter 3 (methods paragraph generated from the fielded design, design table, sample-size rule,
data-quality note, equations) and Chapter 4 (demographics, APA tables per method, fit statistics,
WTP, importance figure) with the existing renderer.

---

## Part 2 — Audit findings

### Verified correct (no change)

**Design generation** (`generate_d_optimal_design`, executed):

| layout | sets×alts | level frequencies | sets with overlap | time |
|---|---|---|---|---|
| 3×3×3 | 9×3 | 9/9/9 on every attribute | 0 | 0.03 s |
| 4,4,3,3,2 | 16×3 | 12/12/12/12, 12/11/13/12, 16/16/16 ×2, 24/24 | 0, except the 2-level attribute (forced: 16/16) | 0.49 s |
| 3,3,2,2 | 12×2 | perfectly balanced | 0 | 0.02 s |
| 5,3,2 | 12×4 | 9/10/9/10/10, 15/15/18, 24/24 | 0 on the 5-level attribute | 0.04 s |

No duplicate sets, no duplicate alternatives within a set. Overlap only where an attribute has
fewer levels than alternatives (unavoidable). A 2-level attribute in 3-alternative sets can be
17/13 (the β=0 criterion is indifferent to which level is doubled) — acceptable, pinned in a test.
Dominated alternatives cannot be screened without priors on level order — see recommendations.

**MNL estimation and inference** (200 replications, 150 respondents × 10 tasks, true β known):
Wald 95 % CI coverage **0.960** (Brand_A) and **0.955** (Quality_Good) — nominal. Point estimates
for n = 300: Brand_A 0.694 (true 0.6, SE 0.059), Brand_B 0.355 (0.3), ฿100 2.083 (2.0),
฿150 1.066 (1.0), Good 0.961 (1.0). BIC basis, ρ²/adj ρ², LR test unchanged from August and correct.

**Sample-size guidance** (Johnson & Orme n·t·a/c ≥ 500) — consistent between design page,
Results card and the new thesis facts.

### Defects found and fixed

| # | Sev. | Defect | Evidence | Fix / test |
|---|---|---|---|---|
| D1 | MED | **Counting method kept unusable choice situations.** A skipped task (or stale `selected_profile_id`) added appearances with no selection, deflating every rate in that set; the four model-based methods drop such situations (R3), so the Results page's default method described a different sample. | One broken task adds 3 alts × 3 attrs = 9 spurious appearances (test reproduces). | Same admissibility rule as `_build_conjoint_data_rows`. `test_counting_excludes_unusable_situations`. Cache v6. |
| D2 | MED | **Logit methods reported an unestimable level as utility 0, indistinguishable from the reference** (only OLS had `is_reference`/`is_excluded`). The thesis summary printed `Quality/Premium: utility=0.00`, inviting "no different from the reference". | Appended level after fielding → MNL/HB `utility 0.0` with no flag (reproduced). | Encoder exposes `reference_cols`; MNL/Mixed/HB levels carry `is_reference`/`is_excluded`, results carry `reference_levels`; summary tags "(ระดับอ้างอิง)" / "(ประมาณค่าไม่ได้ — ห้ามตีความเป็น 0)". `test_logit_part_worths_flag_reference_and_unestimable_levels`. |
| D3 | MED | **MNL thesis summary omitted statistics its own equations tell the writer to report** (LR χ², df, p; BIC; adj ρ²; N situations) — complying meant inventing them (same class as August C5, missed for MNL). MNL/Mixed also had **no convergence flag** and **no CIs**. | `_summarize_results_for_thesis` MNL keys were `pseudo_r_squared, log_likelihood, aic, n_observations` only. | Keys added + 95 % CI per coefficient; `converged`, `ci_lower/upper` in MNL and Mixed results, `converged` in HB. Tests `test_mnl_thesis_summary_supplies_lr_test_bic_and_ci`, `test_mnl_reports_convergence_and_wald_ci`, `test_mixed_logit_reports_convergence_and_ci`. |
| D4 | HIGH | **Thesis Chapter 3 instructed the writer to describe "Experimental design: Full-profile, random assignment"**, but the platform fields ONE fixed D-efficient version, same task order and positions for everyone, no none option, no holdouts. Chapter 4 §4.1 asked for respondent demographics that were never supplied. A student would sign a methods chapter describing a randomisation that never happened, with invented demographics. | Prompt text (reading) + `ConjointSurveyPage.js` has no shuffling. | Computed facts block (`lib/conjoint_thesis.design_facts` + `facts_text`: attributes/levels, tasks, alternatives, algorithm, no randomisation, no none option, Johnson–Orme score, demographics frequencies, data-quality counts) injected into Ch 3/4/5 prompts for BOTH system and external paths; without facts the prompt forbids stating them. Ch 5 limitations now name the design limits. `test_thesis_prompt_uses_fielded_design_facts`, `test_thesis_prompt_without_facts_forbids_inventing_them`. |
| D5 | MED | **Thesis job reused cached method results without the filter signature** (`{study_id, method, respondent_count}`), so a segment slice could be quoted as the whole sample when counts coincide (e.g. the counter drifts — the sync endpoint exists because it does); freshly computed results were **not humanised**, so `__ORPHAN_xxxx__` could still reach the prompt. | _Found by reading_; not reproduced against Mongo. | `_thesis_inputs` matches `filter_sig:"all"` + actual response count + schema version, and humanises all results. |
| D6 | HIGH | **`share-content` had no authorization**: any logged-in user could publish any study (including a private one) as site content under their own name; its broad `except` turned the 404 into a 500. | _Found by reading_; the new test confirms 403 now. | Owner/admin check, `except HTTPException: raise`. System LLM only used when allowed. `test_share_content_requires_ownership`. |
| D7 | HIGH (practitioners) | **The response export could not be re-estimated anywhere**: one CSV row per respondent with all choices as a JSON string in one cell; no task/alt/chosen columns, no attribute columns, no coding documentation. | `ConjointResultsPage.handleExportCSV`. | `GET …/export-long` (xlsx/csv): long format + codebook + design + data-quality + Thai README with R/Stata/Python commands. A conditional logit fitted on the export reproduces the platform's MNL to < 1e-4 (`test_export_long_xlsx_has_codebook_and_reestimates`). |
| D8 | HIGH | **No thesis document without AI** (see Part 1). | Job fails when the key is missing. | `export-thesis/no-ai`. `test_no_ai_thesis_document`. |
| D9 | LOW | Image/product/shelf endpoints wrapped their own `HTTPException("No image was generated")` into `500 "Image generation failed: 500: …"`, and would equally have swallowed the policy error. | Reading. | `except HTTPException: raise` + policy re-raise everywhere. |

### Improvements implemented (high value, low risk)

- **Willingness to pay** (`lib/conjoint_wtp.py`, `GET …/wtp`, in thesis pack/no-AI doc).
  Linear-price conditional logit; `WTP_k = −β_k/β_price`; refused unless β_price < 0 and p < .05;
  linearity LR-tested against the dummy-price model when price has ≥ 3 levels; Krinsky–Robb CI
  (10 000 draws) + delta-method SE; extrapolation flag. Measured:
  - n = 300: Brand A 33.5 [28.5, 38.7] (true 30), Brand B 16.9 [11.7, 22.0] (15), Good 46.3 [41.8, 51.1] (50).
  - **KR coverage over 200 replications: 0.955 (Brand A), 0.955 (Good)** — honest intervals.
  - Price β = 0 in the DGP → β̂ = −0.0004, p = .445 → **refused**.
  - Non-linear price DGP (0, −1.8, −2.0) → linearity rejected → `status: warning`.
  - Non-numeric price levels ("ถูก/กลาง/แพง") → `not_applicable`.
  The thesis equations no longer say "this report computes no WTP" when one is shown (now: Mixed
  Logit is not used for WTP; any WTP table comes from the linear-price MNL).
- **Data-quality report** (`GET …/data-quality`; flags in the export; counts in thesis facts):
  speeders (< 40 % of median duration), straight-liners (same position in ≥ 6 tasks), duplicate
  respondent_id / e-mail, possible double-submits, incomplete, no usable task. Report only — the
  estimation sample is unchanged. While building it, a naive "identical pattern + demographics"
  rule flagged **46 of 300 (15 %)** honest synthetic respondents; it now also requires submission
  within 10 minutes (tested both ways).
- **Market simulator** (`POST …/simulate`): logit share of preference (MNL point estimates;
  Mixed/HB averaged over the estimated taste distribution) and first-choice (heterogeneous models
  only). Measured on n = 300: shares 0.172 / 0.691 / 0.136 vs true 0.173 / 0.700 / 0.128.
  IIA relaxation verified (adding a twin product takes > the IIA-proportional share from its twin
  under Mixed Logit). Caveats returned: no none-option → share of preference, not market share; IIA.
- **APA-style tables and a methods paragraph generated from the actual design**
  (`lib/conjoint_thesis.py`): `p < .001`, no leading zero on bounded statistics, stars legend,
  `F(df1, df2)`, "0 (อ้างอิง)" / "ประมาณค่าไม่ได้". Used by the no-AI document and the external pack.

### Deliberately left

- Estimators were not rewritten (no reproduced defect in MNL/Mixed/HB maths).
- Quality flags are reported, not auto-applied: excluding respondents is a researcher's decision
  that must be disclosed; an "exclude flagged" toggle is a recommendation below.
- `export-responses` (old JSON export) kept unchanged for compatibility; the UI should switch to `export-long`.
- The thesis whitelist rule was kept for the new paths (owner decision whether the no-AI document
  should be open to every owner).

---

## Recommendations (not implemented)

1. **Randomise task order and alternative positions per respondent** in `ConjointSurveyPage.js`
   (or field 2–4 design versions/blocks). Today order and position effects are confounded with the
   design; the thesis facts now disclose it, but fixing it is cheap. Record the shown order in the
   response so the export can carry it.
2. **Holdout tasks** (1–2 fixed tasks excluded from estimation) and a hit-rate / MAE report — the
   standard predictive-validity check examiners ask for.
3. **Optional none / dual-response option**, so the simulator can estimate market share and
   WTP can reflect purchase likelihood.
4. **Explicit price attribute in the study editor** (`price_attribute_id`, numeric levels) so WTP
   does not rely on name detection.
5. **Segment comparison**: raw logit coefficients from separately estimated groups are not
   comparable (scale confound, Swait & Louviere 1993) and no difference is tested. Compare
   importance/WTP (scale-free), and add a pooled model with segment interactions + LR test.
6. **"Exclude flagged respondents" toggle** in the analysis (new filter-signature component), with
   the exclusion count fed into the thesis facts.
7. **Dominance screen** for ordered attributes (price, quantity) once the editor lets users mark
   level order.
8. **Mixed Logit price distribution**: log-normal / sign-constrained price coefficient; per-person
   WTP from HB posteriors with the ratio-of-random-coefficients caveat.
9. **HB naming**: either implement MCMC HB or label the method "Empirical Bayes (Mixed Logit
   posteriors)" in the UI as the thesis text already does.
10. **Full per-respondent HB posterior export** (still capped at 50 in the payload).
11. AI interpretation for filtered views (key the cache by `filter_sig`).
12. Pydantic `.dict()` deprecation warnings in `routes/conjoint.py` (cosmetic).

---

## Not verified

- No real LLM call was made (no key, no `emergentintegrations`); the system paths were exercised
  only up to the policy gate and to the job's failure branch.
- No real MongoDB: routes ran on mongomock-motor; `$regex` sort on the thesis download and the
  `view=summary` aggregation were not exercised.
- WP1's global `SystemLLMDisabled` handler and contextvar propagation into real background tasks
  were not exercised end-to-end here (the code re-checks the policy inside each job anyway).
- Frontend: no UI exists yet for any new endpoint (WP6).
- The importance chart uses the Loma font; on a host without Thai fonts the labels may render as boxes.
