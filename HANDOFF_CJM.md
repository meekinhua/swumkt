# HANDOFF — three bug fixes + Customer Journey (quantitative) Phase 0

**Date:** 2026-08-18
**Base branch:** `meekintubeDone` @ `9946c83`
**Contains:** three fixed defects, the full design spec for the quantitative
Customer Journey module, and its tested mathematical core. **Phases 1–6 are the
work order in §5 — that is what you are being asked to build.**

**161 tests pass.** No new dependencies: numpy/scipy are already in
`backend/requirements.txt`.

---

## 1. Files

### Changed
| File | Why |
|---|---|
| `backend/server.py` | `analysis_cache` unique index widened + migration to drop the old one |
| `backend/routes/conjoint.py` | cache write wrapped so a failed write cannot 500 a successful analysis |
| `backend/lib/ipma_analysis.py` | docstring corrected; the sample-relative normalisation documented |
| `frontend/src/pages/brand-equity/brand-equity-styles.css` | topbar stacking fix (10 pages) |

### Added
| File | Why |
|---|---|
| `memory/CJM_QUANT_SPEC.md` | 1,438-line design spec. **Read §0, §6, §8.8 before you start.** |
| `backend/lib/markov_journey.py` | the estimation core, pure maths |
| `backend/lib/journey_priority.py` | the "what to fix" decision rule |
| `backend/lib/journey_budget.py` | respondent-burden model + the design blocker |
| `backend/tests/test_markov_journey.py` | 36 tests |
| `backend/tests/test_journey_budget_priority.py` | 22 tests |
| `HANDOFF_CJM.md` | this file |

---

## 2. ⚠️ Deploy first, read this

### (a) The `analysis_cache` index needs a migration, not just a code change

`server.py` created `analysis_cache` unique on `(study_id, method)` while
`conjoint.py:4895` upserts on `(study_id, method, filter_sig)`. The first filter
slice of a study inserted fine; the **second** matched no document, attempted an
insert, and hit the unique index — an unhandled `DuplicateKeyError` surfacing as
a **500 on the Conjoint results page every time a user filtered by segment or
date.**

The fix widens the index, but `safe_create_index` swallows failures, so declaring
the wider index alone would leave the old constraint in force. The code therefore
**drops `study_id_1_method_1` first**. Confirm in the deploy logs that you see:

```
[INDEXES] dropped stale unique index analysis_cache.study_id_1_method_1
```

If that line is absent on a database that has been running, the fix has not
taken effect. AI-interpretation and thesis rows write no `filter_sig`; Mongo
indexes a missing key as null, so those keep exactly one row per
`(study_id, method)`, which is the existing intent.

### (b) The topbar fix changes stacking on 10 pages

`.be-root > *:not(.fixed)` (specificity 0,2,0) was overriding `.utb-root`
(0,1,0), replacing the topbar's `position: sticky; z-index: 50` with
`relative; z-index: 1`. Two consequences: the topbar was never actually sticky on
those pages, and its **"เครื่องมือ" dropdown opened underneath the page content
and could not be clicked**. `.utb-dd-menu` carries `z-index: 100`, but that only
orders it inside the topbar's own stacking context.

Set to **40** on purpose: above page content (1), still below
`.be-root > .fixed` modals (50), so a dialog keeps covering the topbar rather
than opening behind it. Affects every Brand Equity and Conjoint page — **check a
modal still covers the topbar** as part of QA.

---

## 3. Verify

```bash
cd backend
python -m pytest tests/test_markov_journey.py -v            # 36
python -m pytest tests/test_journey_budget_priority.py -v   # 22
python -m pytest tests/test_brand_equity_audit_2026_08.py -v        # 49
python -m pytest tests/test_thesis_export_academic_2026_08.py -v    # 23
python -m pytest tests/test_conjoint_audit_2026_08.py -v            # 31
```

### Not verified — close these
| | Why | Do this |
|---|---|---|
| The topbar/dropdown fix in a browser | no `node_modules`, no dev server here | open any Brand Equity or Conjoint page, click "เครื่องมือ", then open a modal |
| The index migration | no MongoDB here | deploy, check the log line, then load a Conjoint study and switch segment twice |
| Anything in `routes/` for the journey module | **not written — see §5** | build it |

---

## 4. What the maths core gives you

`backend/lib/markov_journey.py` — every function is pure and deterministic given
a seed, so a student can reproduce their own thesis numbers.

```
build_sequences(states, responses)      -> (seqs, meta)     routes UNKNOWN
count_transitions(seqs, states)         -> (n_ij, n_hij, r_i)
estimate_transition_matrix(n_ij, α₀=1)  -> (p_tilde, p_hat)
fundamental_matrix(p_tilde, m)          -> (N, Q, R)        raises, never returns garbage
reach_and_revisit(N, states)            -> reach / revisit / visits
absorption(N, R)                        -> B
loss_decomposition(N, R, p, states, displayed)   asserts Σ vⱼqⱼ == B[START,ABANDON]
manski_bounds(B)
counterfactual_delta(p, states, step, δ)
removal_effects(p, states, min_r, r_i)
test_order1(n_ij, states)               Gate A — abstains, can only veto
crossval_perplexity(seqs, states)       Gate B — the blocking gate
bootstrap_respondents / jackknife_respondents / bca_interval / percentile_interval
wilson_interval(x, n)
low_information_sensitivity / empirical_routes / sample_adequacy / gated_p
```

`journey_priority.py` — `tier_by_paired_dominance`, `build_action_list`,
`empty_state_guidance`, `priority_quadrant`, `partition_rows`.

`journey_budget.py` — `estimate`, `check_design`, `max_states_for_target`,
`REFERENCE_INSTRUMENT`.

---

## 5. THE WORK ORDER — Phases 1–6

Follow `memory/CJM_QUANT_SPEC.md`. Section numbers below refer to it. Ship each
phase on its own; every one is independently useful.

### Phase 0b — prerequisites (do first, they block everything)

1. **`journey_analysis_cache` collection**, unique on
   `(study_id, method, filter_sig)`. Spec §8.2 is explicit: **do not reuse
   `analysis_cache`.** A new collection is one line and carries zero risk to the
   two shipping modules that depend on the old one.
2. **`qualitative_runs` collection.** `POST /generate-journey-map`
   (`server.py:3504`) is stateless and persists nothing, so `/seed` currently has
   nothing to read. Persist the result when the user is authenticated; keep a
   paste-in path for everyone else.
3. **Shared PDPA consent scaffolding** (`backend/lib/consent.py` +
   `backend/routes/consent.py`). There is none anywhere in the codebase today —
   this is a platform-wide gap, not a journey-specific one. Needs
   `respondent_token`, withdrawal, retention. Retrofit Brand Equity too.
4. **Advisor/supervisor role** does not exist in the auth model and blocks the
   `advisor_signoff` publish gate. Either add it or drop that gate deliberately.

### Phase 1 — a working quantitative CJM with no Markov assumption ✅ ships alone

- `backend/routes/journey.py`, factory `get_journey_routes(db, get_current_user,
  get_optional_user)` — mirrors `get_brand_equity_routes` at
  `brand_equity.py:2469` (note: the third parameter there is `get_optional_user`,
  **not** `get_current_user_optional`, which belongs to `get_conjoint_routes`).
  Register beside `cv_routes` in `server.py`.
- `backend/routes/journey_instrument.py` — deterministic template library and
  question-slot merge. Model on `brand_equity.py::_generate_questions_from_template`
  (L660) and `_merge_questions_preserving_history` (L594). **Do not extend
  `backend/survey_dsl.py`** — spec §8.7 establishes that nothing in this feature
  path uses it.
- Study CRUD, `/budget-estimate` wired to `journey_budget.check_design` as a
  **hard block**, `/design-preview`, `/lock-instrument` computing
  `structure_hash`.
- Public respondent link + drafts. Model on
  `BrandEquityRespondentPage.jsx` (819 lines) — it already has localStorage +
  server drafts, `?draft=` resume, `duration_sec`, section-stepped navigation and
  a th/en toggle. **Not** `SurveyTakingPage.js`.
- `JourneyPathBuilder`: checklist → one-step-at-a-time branching → tap-to-edit
  replay. **No HTML5 drag-and-drop** — it does not work on a phone, and phones
  are how a shared link is opened.
- `/analysis` returning `empirical_routes`, `reach`, `revisit`, per-step burden,
  pain incidence, `sample_adequacy`, all diagnostics. **Dashboard is tables
  only.** This is already a defensible deliverable.

### Phase 2 — the weighted map ✅

Transition matrix → Gate A + Gate B → fundamental matrix → reach/revisit split →
loss decomposition + Manski bounds → cluster bootstrap + BCa → low-information
sensitivity → `WeightedJourneyMap.jsx` in all three layout modes
(horizontal / scroll / vertical).

**Gate B is the blocking gate.** If it fails, render routes and say so in Thai —
do not render the weighted map anyway.

### Phase 3 — what to fix ✅

Counterfactual Δ and Δrel → tiering by paired-difference CI → action list
**including the empty state** (spec §6.3 — at R≈100 an empty or single-row list
is the MODAL outcome, and the UI must handle it as a designed state) → priority
quadrant → owner partition → removal effects in an advanced panel.

The rule, rendered verbatim in Thai at the top of the results page:
> รายการสิ่งที่ควรแก้คือข้อสรุป · แผนภาพสี่ช่องเป็นภาพอธิบายว่าทำไม · แผนภาพไม่เคยตัดรายการใดออกจากข้อสรุป

### Phase 4 — segments ✅
Leave-one-group-out pooling · TV + Holm (`brand_equity.py::_holm_adjust` L1690 is
reusable) · `BeFilterBar.jsx` wired · study-vs-study `/compare` with an explicit
`state_id_map` · planned-vs-actual TV.

### Phase 5 — Level B (new product, no comparator) ✅
Wave-0 free-list salience intake · coping-journey vocabulary · substitutability
partition · ODI opportunity scoring with an overlap verdict · solution-level
dashboard variant.

Absorbing labels are stored **as data** (`absorbing.conv_label_th` etc.) — Level A
and Level B share one backend module and one renderer; only the vocabulary and
the three labels differ. Do not fork the module.

### Phase 6 — AI, thesis, showcase ✅
`/ai-analyze` narrative · thesis export mirroring `be_thesis_ai.py` +
`thesis_renderer.py` · showcase + share-content.

---

## 6. Invariants — do not undo these

Each one was argued for in the spec and several exist because an audit caught the
opposite behaviour shipping in a sibling module.

1. **No sampler.** The Dirichlet is a smoothing prior. The words *MCMC, Gibbs,
   Metropolis, burn-in, Wishart, Gelman-Rubin* must not appear in code, comments,
   UI copy, the methodology page or the thesis export. A test enforces this. A
   previous module in this codebase was caught documenting a Gibbs sampler it
   never ran.
2. **The expected-transition mask never touches the data.** It is instrument
   guidance and a diagnostic. Masking observed transitions deletes the evidence
   that the design was wrong.
3. **UNKNOWN is counted, never imputed.** Every conversion figure ships with a
   Manski bound, at any censoring level. There is no threshold below which the
   estimate is treated as unbiased.
4. **No p-value when the test is not evaluable.** `gated_p` returns `None` and the
   payload carries `evaluable: false`. Gate A is usually NOT evaluable at R≈100
   and must say so; it can veto, never authorise.
5. **START is excluded from the order test.** Nothing transitions into START, so
   its row is structurally guaranteed to differ from the pooled marginal.
   Including it manufactures rejection on data with literally zero memory — there
   is a test that demonstrates exactly this.
6. **The bootstrap resamples people, never transitions.**
7. **Wald intervals are banned.** Wilson on raw integer respondent counts; BCa for
   `L*`, `Δ` and `B[START,CONV]`; percentile elsewhere.
8. **No stationary distribution π.** The chain is absorbing; π puts all mass on
   the absorbing states. Any "% of customers currently at each stage" derived from
   it would be fabricated. Node size is `reach`.
9. **Tiers, not ranks.** One ordering rule everywhere: a step outranks another
   only when the paired bootstrap difference excludes zero.
10. **Partition, do not weight.** No cross-owner weighted score, no composite
    priority index (`Exposure × Damage`, FMEA `S×O×D`). One seductive number hides
    which factor drives it and has no sampling distribution.
11. **The quadrant's y-axis is the absolute scale midpoint (50), not the sample
    mean.** Against a sample mean, half the steps sit above the line by
    definition, so "every step is fine" and "every step is painful" are both
    unrepresentable — and those labels feed the copy.
12. **Do not reuse `backend/lib/ipma_analysis.py`.** `normalize_scores` rescales
    on the sample min/max, forcing the best step to exactly 100 and the worst to
    exactly 0 regardless of spread. Reuse the React chart, not the maths.
13. **The LLM produces no number.** Its role is proposing candidate Thai state
    names, candidate pain options, and narrative prose about numbers already
    computed. If the LLM is unavailable the map renders identically, minus the
    prose.
14. **`L*` locates where loss became visible, not where it was caused.** Thai copy
    uses `เกี่ยวข้องกับ`, never `ทำให้`.

---

## 7. Two things the spec itself gets wrong

Both found while implementing against it.

1. **§2.3 screens arithmetic.** The worked example's total row says 18.0 screens;
   its own screens column sums to 16.95. `journey_budget.estimate` computes 17.0
   and reproduces the seconds (330.3 vs the documented 330.1) and items (29.2 vs
   29.3) correctly. The test asserts the computed value. Do not "fix" the model to
   hit 18.
2. **§2.3 "m = 8 → block".** m=8 alone trips none of the absolute caps
   (480 s / 34 items / 24 screens / m>10). It blocks via the
   recruitment-dependent cap: `max_states_for_target` allows 5 below 120
   respondents and 7 up to 250. `check_design(8, r_target)` is the function that
   enforces it.

---

## 8. Gotchas

- **Tests hardcode `/app/backend`** (`sys.path.insert` + `os.chdir`), matching the
  existing convention. They run in the container; on a workstation you must edit
  those two lines.
- **`fundamental_matrix` raises rather than returning a bad inverse.** Catch
  `JourneyModelError` at the route layer and return a structured error the UI can
  render as "the map cannot be built and here is why" — never a 500.
- **`loss_decomposition` asserts its own identity at runtime.** If it raises, the
  map must not render. Do not soften the tolerance to make it pass.
- **`m ≥ 4` for the quadrant.** Below that the crosshairs are meaningless and
  `priority_quadrant` returns `renderable: false` with a Thai reason.
- Language: all new user-facing strings are Thai.
- Nothing here is committed or pushed.
