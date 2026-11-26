# HANDOFF — Brand Equity correctness + thesis-export academic audit

**Date:** 2026-08-14
**Base branch:** `meekintubeDone` @ `aedda54`
**Scope:** Brand Equity subsystem and BOTH thesis-export pipelines (Brand Equity
and Conjoint). The Brand Equity **frontend** is deliberately left for you — see §6.

---

## 1. What is in this package

Two audits, both run the same way: four independent review lenses, then every
finding handed to a separate agent instructed to **refute** it, then fixed only if
it survived and was reproducible by execution.

| Audit | Raised | Verified in depth | Confirmed |
|---|---|---|---|
| Brand Equity system | 46 | 8 | 8 |
| Thesis exports (both modules) | 8 | 8 | 7 (1 was fixed mid-audit) |

**103 tests pass.** No new dependencies — nothing was added to `requirements.txt`.

### Files changed

| File | Change |
|---|---|
| `backend/routes/brand_equity.py` | All Brand Equity fixes (~630 lines) |
| `backend/routes/be_thesis_ai.py` | Reliability injected; citations corrected |
| `backend/routes/thesis_renderer.py` | Reliability table; weights generated from code |
| `backend/routes/conjoint.py` | Thesis equations + summariser + Ch4 instructions |
| `frontend/src/pages/brand-equity/BrandEquityDashboardPage.jsx` | Reliability card, sample adequacy, coverage warning, one verdict scale |

### Files added

| File | Purpose |
|---|---|
| `backend/tests/test_brand_equity_audit_2026_08.py` | 49 tests |
| `backend/tests/test_thesis_export_academic_2026_08.py` | 23 tests |
| `memory/BRAND_EQUITY_AUDIT_2026_08.md` | Full audit with measurements |
| `memory/THESIS_EXPORT_AUDIT_2026_08.md` | Thesis academic audit |
| `HANDOFF_BRAND_EQUITY.md` | This file |

(`backend/tests/test_conjoint_audit_2026_08.py` — 31 tests — is already on the
branch from the previous handoff and still passes.)

---

## 2. ⚠️ The two things that most need your attention

### (a) Numbers changed. Old cached artefacts must not be served.

`BE_ANALYSIS_SCHEMA_VERSION = 1` was introduced and the **thesis cache now carries
it on the write and checks it on all three reads**. It previously had no guard at
all, and there is **no regenerate button in the UI** — so a study that had ever
generated a thesis would keep emitting one built on pre-audit numbers, containing
a Cronbach's α claim that had never been tested.

On deploy: the first thesis export per study regenerates (one AI round-trip per
chapter). That is expected. Do not "fix" it by removing the guard.

**Still unguarded and worth your judgement:** `study.ai_cache` /
`ai_cache_by_filter` hold LLM-normalised counts and identity-image alignment.
Those are inputs rather than rendered text, and the scoring no longer depends on
them (see §3), so they are safe to keep — but any *narrative* cached alongside
them was written against the old figures.

### (b) A brand's published score will move — usually downward, and that is the fix

Awareness previously renormalised away 65 % of its weight until an AI job ran, in
a direction that always **inflated** the score. Studies that were published
without running the AI pass were showing a number up to ~30 points too high. After
this change they will show their real number. This is not a regression; it is the
defect being corrected. Expect questions from users whose score dropped.

---

## 3. What was fixed — Brand Equity

### Measurement honesty
- **Cronbach's α is now computed** per dimension (`_dimension_reliability`) with
  mean inter-item r, k and n. It **refuses to report a number** when it cannot be
  estimated (k < 2, n < 30, zero variance) and says why. Proof it works: the same
  4-item scale, once loading on one factor (α = .966) and once with its item
  columns shuffled (α = .027), used to produce **byte-identical output**.
- The thesis chapters stopped asserting `Cronbach's α ≥ 0.7`; they now receive the
  measured table and a hard rule against claiming a threshold it does not show.
- Added required disclosures: no EFA/CFA, no AVE/CR, BES is a weighted composite
  index rather than a latent variable, all comparisons are descriptive.

### Scoring arithmetic
- **Unreachable weights removed** — `logo_aided` + `logo_unaided` + `color_recall`
  carried 0.25 of Awareness and `as_product_quality` 0.05 of Quality, but those
  questions are filed under `identity`, so they could never match. Awareness
  declared 1.25 and Quality 1.05; both now sum to 1.00.
- **Identity ceiling fixed** — a perfect brand scored 41.7 with 12 intended traits
  and 100 with 3, because the metric divided by trait count while the grid caps
  picks at 5. It measured how many traits the student typed.
- **`as_person_personality`** returned a hard 0.0 in essentially every study (its
  trait vocabulary shares 2 of 17 labels with the intended-trait pool). A question
  that cannot express the construct is now excluded, not scored as a failure.
- **The 0.85/0.15 blend deleted** — it gave deliberately-descriptive questions 15 %
  of a dimension from an unsourced constant.
- **Coverage made symmetric** — it reported 1.0 while its own `missing_kinds` was
  non-empty.
- **Reverse coding** — agreeing a brand is "แพงเกินไป" used to *raise* Perceived
  Quality. Polarity is now declared (`custom_quality_attributes_reverse`); an
  undeclared attribute that reads as negative is flagged and kept out of scores
  rather than counted as a virtue.
- **Sample SD** (÷ n−1) replaces the population form, which was exported under an
  "SD" column and handed to the AI writer as `sd=`.

### The AI-dependency defect (largest single item)
`_question_signal_100` began `if not s.get("ai_normalized"): return None`.
Top-of-Mind (w .40) and Unaided Recall (w .25) are open-ended, so 65 % of Awareness
vanished until an LLM job ran.

`_deterministic_brand_counts()` now counts unaided mentions from raw text without
the LLM — exact normalised match first, then longest-*unambiguous*-token fallback,
which is also the guard against the old substring behaviour that could credit a
competitor's mentions to the focal brand. **Measured on the same 120 respondents:
awareness delta 30–51 pts → 0.0, BES delta 0.0, tier unchanged, coverage identical.**
The AI pass is now an accuracy enhancement (misspellings, transliteration,
nicknames). `normalization_basis` on each question and a `normalization` block on
the payload record which basis was used.

### Output honesty
- **One verdict scale.** A 5-tier canonical scale lived in four places while the
  dashboard hero used its own **3-tier** one, so a BES of 62 was headlined
  "เฝ้าระวัง" and called "สุขภาพดี" a few hundred pixels lower on the same page.
  The backend now serves `brand_health_tier`.
- **Sample adequacy** — n = 1 used to produce a full score and a "Champion"
  verdict, silently. Four bands now ship in the payload.
- **95 % CIs** on every Likert score (`score_100_ci95`).
- **Unmeasured ≠ zero** — `composite._measured` distinguishes them; the public home
  page used to name an unmeasured dimension as the brand's weakest.
- **Public respond endpoint validates.** It checked nothing; a 9 on a 7-point item
  pushed that question's score to 133.3 (a 0 to −25.0) straight into the published
  BES. Range-checked per type, pick caps enforced, free text bounded; invalid
  fields are dropped rather than rejecting the whole response.
- **AI insights payload** — was `questions[:20]` serialised then sliced at 6000
  chars. With realistic Thai free text it reached **21,928 chars** and the slice
  cut the JSON mid-string; and because the questionnaire runs awareness → quality
  → identity (~22 items) → loyalty, `[:20]` **could never reach a Loyalty item**.
  Now a per-dimension-balanced digest, 3,071 chars, valid, all four dimensions,
  carrying sample adequacy and α so the model is told when not to be confident.

---

## 4. What was fixed — thesis exports (both modules)

The unifying defect: **both pipelines instructed the writer to report procedures
and statistics the software never produces.**

**Conjoint**
- The HB chapter documented a **Gibbs sampler with Metropolis-Hastings, Wishart
  hyperpriors, Gelman-Rubin R̂ and burn-in**. No MCMC runs anywhere — it is MSL +
  Train (2009) §11.5 conditional distribution. Rewritten to describe the real
  estimator and to state that it is Empirical Bayes, not full MCMC.
- The OLS block printed classical homoskedastic SE and an R²-based F while the
  model uses **cluster-robust** SEs, plus VIF and Durbin-Watson as performed
  checks (neither is computed) and `ε ~ N(0,σ²)` for a 0/1 outcome.
- MNL claimed a **Hausman test** for IIA and Counting a **χ² test**; neither runs.
- Mixed Logit showed a **Cholesky factor** (correlated random parameters) where
  the estimator fits independent normals, four mixing distributions where only the
  normal is used, and a **WTP formula** that is never computed.
- Chapter 4 demanded SE/test statistic/p-value **for every method**, though only
  MNL supplies them — and three summariser lookups were dead: `f_p_value` (the key
  is `f_pvalue`), `preference_heterogeneity` and `convergence`/`n_iterations`
  (never returned). Now per-method: Counting and HB are **forbidden** from
  reporting p-values or stars, HB reports model-level significance via the LR
  test, OLS reports `F(df1, df2)` with the df now supplied.
- A new system-message rule forbids inventing any statistic, names Hausman / VIF /
  Durbin-Watson / Gelman-Rubin as things to declare as limitations, and states APA
  7 conventions (italic symbols, `p < .001`, no leading zero, F with df).

**Brand Equity**
- `Aaker, D. A. (1997). Dimensions of brand personality` — that paper is by
  **Jennifer L. Aaker**. Corrected, DOI added.
- The POMP transform was attributed to **DeVellis (2017)**, a scale-development
  textbook. Correct source is **Cohen, Cohen, Aiken & West (1999)**, now cited and
  added to the reference list along with Cronbach (1951), Nunnally & Bernstein
  (1994) and Fornell & Larcker (1981).
- The non-AI DOCX gained a **reliability table**, the validity disclosures, the
  computed sample-adequacy verdict in place of a fixed sentence, and a
  weight table generated from `DIMENSION_WEIGHTS` instead of a drifted literal.

---

## 5. Verify

```bash
cd backend
python -m pytest tests/test_brand_equity_audit_2026_08.py -v        # 49
python -m pytest tests/test_thesis_export_academic_2026_08.py -v    # 23
python -m pytest tests/test_conjoint_audit_2026_08.py -v            # 31
```

Existing suites (`test_brand_equity*.py`, `test_conjoint_stats_correctness.py`)
should still pass — nothing in them was touched.

### ⚠️ Not verified — please close these

| Not verified | Why | What to do |
|---|---|---|
| **Any frontend rendering** | No `node_modules`, no `.env`, no dev server here. JSX was only parsed with `@babel/parser`. | `yarn install && yarn start`, open a Brand Equity dashboard. **Open it first** — a Rules-of-Hooks violation was caught in the conjoint work by review, not by tooling. |
| **The new dashboard cards** | Same. | Check the reliability card, the sample-adequacy line and the coverage warning render at each band and on mobile. |
| **Any live API call** | No MongoDB, no backend process. All verification called the analysis functions directly with synthetic studies. | Exercise the dashboard, compare and thesis endpoints on a real study. |
| **Any AI chapter** | Needs a live Gemini key. | Generate one thesis per module and **read chapters 3 and 4**. The prompts and rules are right; whether the model obeys them has not been observed. |
| **The validation change** | Needs a live public survey. | Submit a response through `/public/{share_token}/respond` and confirm normal answers are accepted and out-of-range ones dropped. |
| **Real messy data** | Only synthetic data was used. | Run a production-like study, especially one edited after its questions were generated. |

---

## 6. Frontend — over to you

These are all **reproduced** and documented in
`memory/BRAND_EQUITY_AUDIT_2026_08.md`. Nothing here silently corrupts a published
score any more; this block is about clarity and usability.

### P1 — the user is misled or blocked

1. **Respondent flow** (`BrandEquityRespondentPage.jsx`): 36 required-heavy
   questions, **no way back from the last screen**, un-undoable demographic
   answers, a silently disabled Next button, and an understated time promise.
2. **No mobile layout on any answer control.** The NPS row gives ~26 px tap
   targets on a phone. Most respondents arrive from a shared link on mobile.
3. **"AI GENERATION COMPLETE"** is shown for a questionnaire produced entirely by
   static template substitution. It is not an AI generation.
4. **Jargon defined nowhere** — TOP-2-BOX, BOTTOM-2-BOX, NET Q-SCORE, σ — including
   in the appendix that claims to explain every score. One loyalty bar plots a raw
   count as a percentage.
5. **Surface the new backend fields.** These now exist and nothing renders them
   outside the hero: `score_100_ci95` per question, `reliability` per dimension
   (a card exists — extend it into the per-dimension sections), `sample_adequacy`,
   `composite_meta[d].coverage`, `composite._measured`, `normalization.basis`,
   and OLS-style `is_reference` / `is_excluded` flags on part-worth levels.

### P2 — accuracy of what is drawn

6. **Image radar** plots a required focal item (n = 100) and an optional competitor
   item (n = 3) as equal polygons and exposes **no n at all**. Radar and loyalty
   bars still use the mean/max normalisation the code's own comment calls broken —
   the correct POMP transform is already implemented in `_likert_stats`.
7. **The methodology appendix** links to a **weight editor that does not exist**
   and documents a comparative-score formula the code does not use (up to 33
   points apart on the same answers). Either build the editor or drop the link;
   either fix the formula or copy the real one.
8. **"Brand Association · 4 perspectives"** claims to compare perceived image
   against the intended identity and labels low scores "misaligned", but the
   computation never reads the intended identity.
9. **Public home page** (`HomePage.jsx:436`) does `Number(featured.scores[d.k] || 0)`
   and renders `0` for an unmeasured dimension — use `composite._measured`.
10. **`be-components.jsx:52` and `BrandEquityListPage.jsx:19`** still use a private
    `>=70 / >=40` colour scale. Import from `@/lib/brandHealthVerdict` so every
    surface agrees; the backend also serves `brand_health_tiers`.

### Backend items left, if you want them

- **Segment/wave slices** still resolve the AI cache at whole-sample level. The
  deterministic count is computed per slice so the worst of this is gone, but a
  wave-over-wave delta can still be attenuated.
- **No test of a difference.** Per-item 95 % CIs exist; nothing tests whether a
  brand-vs-competitor or wave-over-wave gap differs from zero — while the wizard
  promises "30+ จุดต่อ segment สำหรับ statistical significance". Either implement
  the test or stop promising it.

---

## 7. Gotchas

- **Tests hardcode `/app/backend`** (`sys.path.insert` + `os.chdir`), matching the
  existing convention. They run as-is in the container, not on a workstation
  without editing those two lines.
- **Do not reintroduce polarity guessing.** `_looks_negatively_worded` only raises
  a flag for a human to confirm. Guessing wrong silently flips a score.
- **`_deterministic_brand_counts` must stay conservative.** It attributes only on
  an exact normalised match or the longest *unambiguous* token. Loosening it
  re-opens the bug where a competitor's mentions land on the focal brand.
- **Reliability may legitimately be "not estimable."** Awareness is measured mainly
  by open-ended and recognition items, so it usually has < 2 Likert items. That is
  correct output, not a bug — do not paper over it with a fallback value.
- **Language:** all new user-facing strings are Thai. Keep it that way.
- Nothing here is committed. Nothing was pushed.
