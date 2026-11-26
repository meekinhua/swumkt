# Brand Equity — External-LLM workflow + second academic audit
_Date: 2026-11-26 · WP3 of `memory/PLAN_2026_11_EXTERNAL_LLM.md` · continues `BRAND_EQUITY_AUDIT_2026_08.md`_

Method: read the whole pipeline (`routes/brand_equity.py`, `be_thesis_*.py`,
`thesis_renderer.py`), then executed it on synthetic studies (60–3000 respondents,
coherent latent factor, declared reverse items, open answers with misspellings / Thai
transliterations, two demographic segments). Every defect below was **reproduced
against the pre-change code** (commit `b1e58ea`, the last commit before this work)
and is pinned by `backend/tests/test_brand_equity_2026_11.py` (57 tests). The
August fixes were kept; their tests (`test_brand_equity_audit_2026_08.py`,
`test_thesis_export_academic_2026_08.py`) still pass unchanged.

**Schema:** `BE_ANALYSIS_SCHEMA_VERSION` 1 → **2** (displayed numbers change: Identity,
Awareness, α). The thesis cache and the list-page `bes_cache` are keyed on it, so
nothing built on v1 numbers is served again.

---

## Part 1 — External-LLM workflow

| AI step | Feature key | System path | External path |
|---|---|---|---|
| Open-ended coding, themes, identity–image, insights | `be.ai_analyze` | `POST …/ai-analyze` → 409 before queueing when off | `…/ai-analyze/external-prompt` + `…/external-import`; **manual code frame** (`…/coding/codeframe.csv` → `…/coding/import-csv`) |
| Thesis chapters | `be.thesis` | `POST …/thesis-ai-start` → 409 before a job exists (cached thesis still served) | `…/thesis-ai/external-pack` (Markdown or JSON parts) + `…/thesis-ai/external-import` → existing `thesis-ai-download` |
| Visual identity (vision) | `be.visual_identity` | `POST …/extract-visual-identity`, `POST /extract-identity` → 409 | `…/external-prompt` (user attaches the images) + `…/external-import` |
| TH→EN attribute wording | `be.questions` | skipped silently when off (Thai kept) — creating a study never fails on it | `…/regenerate-questions/external-prompt|import`; a supplied `custom_quality_attributes_en` is now respected |
| Non-AI DOCX | — | `POST …/thesis-export` unchanged, works with the switch off (tested) | — |

Exact endpoints / payloads: `memory/LLM_EXTERNAL_CONTRACT.md` § Brand Equity.

### Design of the ai-analyze pack
- **One builder per step, shared** (`lib/be_external.py`: `coding_block`, `themes_block`,
  `identity_block`; insights from `_ai_master_insights(build_only=True)`); `_build_ai_parts`
  packs them. The system job calls the same builders one task per call and parses with the
  same validators (`validate_coding/themes/identity/insights`). A test drives the system job
  with a fake LLM that answers from the prompt text — proving the two paths share prompts and
  storage.
- **Stable answer ids** `a` + sha1(question id, normalised text)[:8]: independent of order,
  unaffected by answers arriving between "copy" and "paste" (tested), applied to every
  respondent with that text in any slice.
- **De-duplication**: each distinct answer is sent once with its frequency (120 TOM answers →
  ≤ 8 lines). **Chunking**: ≤ 200 distinct answers and ~18 k data characters per coding part;
  two coding chunks are never merged (keeps the JSON reply short enough not to truncate); a
  small study is one paste. Theme questions above budget are sent as a deterministic,
  disclosed sample (the old code silently took the first 80). 500-respondent test: all parts
  within budget, every answer id appears exactly once.
- **Theme counts are computed by the server** from `answer_ids`, never taken from the LLM.
- **Import**: tolerant of fences, prose, trailing commas, smart quotes; strict about
  structure; all sections validated before anything is written (422 lists the errors in
  Thai; a part whose promised section is missing is rejected as truncated). Stored where
  the system result goes (`ai_cache` / `ai_cache_by_filter.<sig>`, same filter signature as
  the dashboard) with `source`, `model_label`, `imported_at/by`, `sections_meta`. Coding is
  stored once per study in `open_coding` (keyed by answer id — safe Mongo field names) and
  recounted per slice.
- **Manual code frame** (no LLM): CSV with id/frequency/text/code; same validator; source
  `manual`; thesis text then says "researcher's manual code frame".
- **Policy refusals are never swallowed**: `_gemini_call` and the vision call re-raise
  `SystemLLMDisabled` / 409; jobs record `error_code: llm_external_only`; an empty LLM reply
  is an error, never a `ready` with empty content (system job: `ready|partial|error`;
  thesis job: an empty chapter fails the job).

### Thesis pack
Markdown: how-to (Thai), filter, all measured tables (scores + coverage, item statistics
with 95 % CI, reliability with item-total r and α-if-deleted, paired competitor tests,
method facts, MoE, data-quality flags, weights), generated methods paragraph, required
disclosures, the system prompt and one prompt per chapter — all from
`build_be_thesis_prompts`, the same function the system job uses (test asserts equality).
The hard rules (no α ≥ .70 claim unless measured, BES is a composite index, no EFA/CFA/ω,
significance only where tested, no references outside the list, alignment is an LLM
opinion, uncoded items not reported) are now in the **system message**, so every
chapter — system or external — carries them. Imported chapters are checked for
placeholders and an unsupported α claim (warnings), stored per filter, and rendered by the
existing DOCX path with an AI-use disclosure naming `model_label`. The non-AI DOCX now also
carries a disclosure when it includes AI-written insights / identity text.

---

## Part 2 — Defects found and fixed (each with a test)

| # | Defect (reproduced on `b1e58ea`) | Evidence | Fix |
|---|---|---|---|
| D1 | **AI thesis never worked**: job imported `_call_gemini_with_retry` and download `_create_thesis_docx` `from server`, which defines neither since conjoint moved to `routes/conjoint.py` | `grep` — no definition in server.py; every job → ImportError → "failed" | import from `.conjoint` |
| D2 | **LLM failure lowered Identity**: on any error `_ai_identity_image` returned `{"alignment_score": 0}`; the aggregator read that key and scored 0 at 10 % weight (real results used `alignment_score_0_100`, so only failures reached the score) | same 80 respondents: Identity 37.1 → **33.6** | alignment removed from scoring (also closes "paste 100 to inflate a published BES" and whole-sample leakage into slices); shown as labelled LLM opinion |
| D3 | **Unaided recall penalised the strongest brand**: AW-2 asks for brands *besides* the first, so a brand that is everyone's top-of-mind scored ~0 on "unaided recall" (w .25) | 40/40 TOM = focal → Awareness **61.5** | unaided recall = share naming the brand unprompted in TOM **or** AW-2 (`total_unaided_pct`) → 100.0 |
| D4 | **α ignored reverse-keyed items**: a declared negative item entered raw | coherent 5-item Quality scale α = **0.519** | recode `max+1−x` first → α 0.96; polarity-unconfirmed items excluded |
| D5 | **Significance tests ignored reverse items** (`_respondent_dimension_scores`) | "too expensive" = 7 scored **100** (dashboard scores it 0) | flipped; unconfirmed items excluded |
| D6 | **Segment/wave slices showed whole-sample AI counts** (open item #1 of August) | segment of 60: TOM stats n = **120**, whole-sample share | codes recounted per slice; legacy counts used only if computed on exactly those answers, else recounted via `variants` or deterministic |
| D7 | Non-AI DOCX dropped insight **evidence and recommendation** (read `title/body`) | rendered text lacked both | reads `headline/evidence/recommendation/priority` |
| D8 | Non-AI DOCX identity section read `alignment_score` → "— / 100"; ignored `narrative` | — | correct keys, labelled qualitative |
| D9 | Non-AI DOCX **reference list ≠ citations**: cited Nunnally & Bernstein, Cronbach, Fornell & Larcker (and POMP) but listed DeVellis (uncited) | — | list generated to match in-text citations (+ Cohen et al., Holm) |
| D10 | DOCX tier used a private unrounded copy: 79.6 → "Strong" while dashboard → "Champion" | — | canonical `brand_health_tier` |
| D11 | Thesis charts (quality radar, loyalty bars) used `mean/7×100` (floor 14.3), disagreeing with every table | — | POMP; reverse items via `score_100`; unconfirmed items excluded |
| D12 | Thesis prompt attributed the NPS 0–100 rescale `(NPS+100)/2` to Reichheld (2003) | — | stated as the system's own linear transform |
| D13 | Ch.1 told the writer to state H1/H2 correlational/causal hypotheses and Ch.4 to "test" them — nothing computes a correlation, regression or SEM | — | research questions; explicit ban on "hypothesis supported" |
| D14 | Prompts cited Zeithaml (1988), Hair et al. (2010), Cochran (1977) absent from the reference list | — | added (+ Churchill, Clark & Watson, Holm, Cohen 1988) |
| D15 | Thesis appendix used the **whole sample** while chapters cited the filtered slice | — | filter stored with the cached thesis and re-applied |
| D16 | `update_study` overwrote a user-supplied EN translation with a fresh LLM call | — | supplied EN respected |
| D17 | Public endpoint accepted 4.5 on a 7-point item (aggregator truncated to 4, α/tests used 4.5) | — | non-integer scale values dropped |
| D18 | `_welch_t_test` comment claimed Hedges-corrected d; it was plain Cohen's d | — | comment fixed, `hedges_g` added |
| D19 | DOCX claimed "integrated with Keller's CBBE pyramid (Keller, 1993)" — the pyramid is Keller (2001) and the instrument does not measure its blocks | — | reworded to Aaker's asset categories informed by Keller (1993); loyalty stated as attitudinal |
| D20 | Routes did `from server import UserRole` → unusable wherever server.py cannot import (tests, CLI) | — | role compared by value |

### Additions (high value, low risk, additive fields)
- **95 % CIs**: NPS (trinomial variance), Wilson CI on every brand/option share, total unaided recall.
- **Paired brand-vs-competitor tests** (`competitor_comparison`): paired t on within-person POMP
  differences (the same respondents rate both brands — an independent test would be wrong),
  Cohen's d_z, 95 % CI, Holm across all comparisons; comparative 7-pt items tested against the
  midpoint. Matches `scipy.stats.ttest_rel` to 1e-3 (test).
- **Reliability diagnostics**: corrected item-total r, α-if-item-deleted, listwise rule stated;
  explicit "ω / CR / AVE / EFA-CFA / discriminant validity not computed" sentence.
- **BES weight sensitivity**: equal-weight BES, range when any one weight is halved/doubled,
  whether the tier is stable, dimensions used.
- **Margin of error** (worst case, SRS assumption stated) in `sample_adequacy`.
- **Data-quality screening**: speeders (< 40 % of median time, needs ≥ 10 timings),
  straight-liners (≥ 8 identical rating answers), duplicates (identical answers +
  demographics), "rated without recognising the brand" (informational). Reported, never
  silently applied; `exclude_flagged=true` on dashboard / export.
- **Raw export** (`/export/raw`): xlsx README + data (one row per respondent, SPSS/R-safe
  names, `_r` reverse copies, 0/1 dummies, `*_code` / `*_focal`, `dq_*`) + codebook (labels,
  value labels, measure, range, reverse flag, eligibility, weight). `*_focal` reproduces the
  dashboard's unaided share exactly (test). There was no raw export at all before.
- **Generated methods paragraph** (`methods_paragraph_th`, dashboard + pack).
- `coding_status` / `coding_status_th` per question ("ยังไม่ได้เข้ารหัส" instead of zeros).

Verified: a study with **zero AI** gives all four dimensions, BES and tier (test); scores
depend on the LLM only through counting accuracy of brand mentions (misspellings,
transliteration), which is disclosed with the tool name.

Performance: aggregation of 3000 respondents × 56 questions 0.76 s → 1.1 s (vectorised α
diagnostics, single-pass answer maps).

---

## Reviewed and found correct (no change)
POMP direction and formula; T2B/B2B per scale; sample SD; NPS formula (9–10 / 0–6);
comparative-7 orientation; Welch t + Holm for waves (independent samples — correct);
Alexander-Govern Welch ANOVA + Holm-adjusted Welch post-hoc for segments; weight table
generated from code; α refusal rules (k < 2, n < 30); identity-ceiling and disjoint
vocabulary fixes from August; citations Aaker 1991/1996, J. L. Aaker 1997, Keller 1993/2001/2013,
Yoo & Donthu 2001, Pappu et al. 2005, Christodoulides & de Chernatony 2010, Reichheld 2003,
Cohen et al. 1999, Cronbach 1951, Fornell & Larcker 1981.

## Left open / recommendations
1. **Perception items are asked of people who do not know the brand.** No "don't know"
   option and no aided-awareness gate: in the synthetic run ~⅓ of respondents rated a brand
   they did not tick in AW-3. Now flagged (`unaware_rater`); recommended: route
   perception/loyalty blocks to aware respondents only (questionnaire + frontend change),
   or add a "ไม่รู้จัก/ไม่แน่ใจ" option treated as missing.
2. **Segment suppression.** The dashboard shows any slice with n ≥ 10 and the segment test
   accepts groups of 3. Recommend: grey out segment metrics below n = 30 per cell and show
   n on every segment chart (frontend).
3. **NPS scale inconsistency**: the dimension uses the NPS-based score_100 while the
   respondent-level tests use mean/10. Both are defensible; a future version should pick one
   and document it.
4. **Construct coverage**: value-for-money (PQ-3) is arguably perceived value (Zeithaml,
   1988), not perceived quality; loyalty is attitudinal only (no purchase behaviour); BI-4
   prints "ทำตามสัญญาที่ให้ไว้: ที่ตั้งใจไว้" when no promise was entered — respondents
   cannot judge an unseen promise (should be skipped). Questionnaire changes would start a
   new wave, so not done here.
5. **ω / CFA**: disclosed as not computed. McDonald's ω needs a factor model (no
   factor-analysis dependency in requirements); the raw export now lets a student run it in
   JASP/R. An `omega_total` via a 1-factor ML fit is a reasonable later addition.
6. **No test of BES change between waves** (dimensions are tested; BES is an index) —
   disclosed in the caveat. A respondent-level bootstrap of BES would be the honest option.
7. `be.visual_identity` is in the policy's `images` group although it is a vision *analysis*
   (text output); admins may expect it under `research` (WP1 decision).
8. Old `ai_cache` narratives (insights, identity text) written before v2 are still shown;
   they are inputs/opinions, not scores, but were written against v1 numbers.

## Not verified
- No live LLM: system prompts were exercised only with a fake LLM; whether Gemini/ChatGPT
  follow the coding/themes JSON format reliably is unobserved (validators make failures
  visible, not silent).
- No real MongoDB (mongomock-motor), no running server/frontend; `server.py` itself cannot
  be imported in this container (`emergentintegrations` missing), so the global exception
  handler / middleware integration was not exercised end-to-end — only `require_system_llm`
  and `SystemLLMDisabled` directly.
- Production data shapes (very old studies with random ids, legacy `normalized_by_question`
  without `variants`) were covered only by synthetic cases.
