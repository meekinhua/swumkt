# HANDOFF — Conjoint module, theoretical audit + UX pass

**Date:** 2026-08-13
**Base branch:** `meekintubeDone` @ `24c3aaf`
**Scope:** conjoint analysis only. Nothing outside the files listed below was touched.

---

## 1. What is in this package

Ten theoretical/correctness defects in the conjoint subsystem, plus four UX
problems, found → reproduced by execution → fixed → pinned by tests.

**No new dependencies.** `xlogit==0.2.7`, `statsmodels`, `scipy`, `numpy`, `pandas`
are already in `backend/requirements.txt`. Nothing was added or upgraded.

### Files changed

| File | Change |
|---|---|
| `backend/routes/conjoint.py` | All ten backend fixes. ~600 lines changed. |
| `frontend/src/pages/conjoint/ConjointCompareMethods.jsx` | Model-selection criterion fixed; new diagnostics surfaced |
| `frontend/src/pages/ConjointResultsPage.js` | Sample-adequacy card, plain-language summary, method picker |

### Files added

| File | Purpose |
|---|---|
| `backend/tests/test_conjoint_audit_2026_08.py` | 31 regression tests, one per defect |
| `memory/CONJOINT_AUDIT_2026_08.md` | Full audit with the measurements behind every claim |
| `HANDOFF_CONJOINT.md` | This file |

---

## 2. The fixes, in one line each

Full detail with measurements is in `memory/CONJOINT_AUDIT_2026_08.md`.

| # | Severity | Fix |
|---|---|---|
| F1 | HIGH | `generate_d_optimal_design` optimised `det(X'X)` over a pooled bag of profiles **then grouped them into choice sets at random**. Rewritten as modified Fedorov on the β=0 MNL information matrix, which is the criterion the grouping actually determines. **+44.8–59.9 % D-efficiency vs best-of-N random**, and 5–40× faster. |
| F2 | HIGH | Appending a level or an attribute after design generation made MNL/Mixed/HB return `None`. Encoder now picks a reference that exists in the data and drops columns with no within-set variation. |
| F3 | HIGH | The "BEST FIT" badge ranked methods by raw log-likelihood — which always favours the model with more parameters. Now BIC, with Raftery's gap grading, and OLS excluded from the comparison entirely. |
| F4 | MED-HIGH | MNL's BIC used `n` = exploded rows, xlogit used `n` = choice situations. Both now on the choice-situation basis. |
| F5 | MED | HB crashed (`ValueError: array is not broadcastable`) when a task had no recorded selection. |
| F6 | MED | HB importance came from population means; now averaged over per-respondent importances (Sawtooth definition). |
| F7 | MED | Every coefficient was declared random in Mixed Logit/HB. Now only coefficients whose taste SD is significant stay random. Includes switching coefficient lookup from positional to **name-based** — positional slicing silently misreads any mixed fixed/random model. |
| F8 | HIGH | OLS took `levels[-1]` as reference even when that level was never shown, making the remaining dummies collinear with the intercept; statsmodels pseudo-inverted instead of failing, reporting unidentified coefficients. |
| F9 | LOW | Added adjusted McFadden ρ². |
| F10 | MED | Task-count rule divided by the alternative count instead of the contrasts those alternatives supply; cap raised 20 → 24; sample-size rule unified with the UI. |
| U1 | HIGH | The "ข้อมูลเพียงพอแล้ว" card was **hardcoded** — a 4-respondent study was told it was ready to report. Now computed (Johnson & Orme). |
| U2–U4 | — | Plain-language summary card; intent-based method picker; McFadden ρ² no longer rendered as a percentage or mixed with OLS R². |

---

## 2b. This change was reviewed, and the review found real problems

After the fixes above were written, they were put through an independent
adversarial review (four lenses; every finding then handed to a separate agent
instructed to refute it). **15 claims raised, 11 confirmed by reproduction, 4
refuted.** All 11 are fixed and pinned by tests. Five mattered a lot:

- Two `useMemo` hooks had been placed **below** the Results page's early returns
  — a Rules-of-Hooks violation that crashes the entire page as soon as loading
  finishes. This alone would have made the UX work look broken on first open.
- The BIC-based recommendation **degenerated to the constant "MNL"**, because the
  tie test compared the top two models and Mixed Logit vs HB always tie (they
  differ only in draw count). Reproduced on three seeds where MNL was 70–270 BIC
  points worse.
- The "skipped task" fix guarded the wrong layer — Mixed Logit and HB still died,
  and MNL's fit statistics silently described a larger sample than the model was
  estimated on.
- `pseudo_r_squared_adj` was computed but never returned, so its new column was
  always empty.
- The sample-adequacy card **could never render**, because the Results page uses
  `view=summary`, which strips the field it depended on.

Full detail is in `memory/CONJOINT_AUDIT_2026_08.md` § "Review pass". The point
for you: the code in this package has been through that pass, but the same class
of mistake is exactly what §5 below is about — nothing here has been seen running.

---

## 3. ⚠️ Cache invalidation — read before deploying

`ANALYSIS_CACHE_VERSION` was bumped **2 → 4**, and the AI-interpretation and
thesis-export caches gained the `schema_version` guard neither of them had.

This matters because the audit changed **values**, not just added fields:
MNL's BIC moved to a different basis, HB importance is computed differently, and
Mixed Logit/HB may now constrain coefficients. Without the bump, every
already-analysed study would keep serving its pre-audit numbers — the BIC column
would stay on the old incomparable scale exactly where a researcher is most
likely to look, and cached AI interpretations would keep narrating the old
figures.

Consequence on deploy: **the first view of each study recomputes.** For studies
with many respondents, Mixed Logit and HB take a few seconds. This is expected,
one-off per study/filter combination, and self-healing. Do not "fix" it by
reverting the version.

No migration script is needed — stale rows are simply treated as a miss, and the
writes keep their existing `{study_id, method}` filter so a stale row is updated
in place (no duplicate-key risk against the unique index in `server.py`).

The thesis cache deserves a specific note: it had **no** guard before, and there
is no regenerate button in the UI, so a pre-audit thesis document would have been
served forever. With the guard, the first export after deploy regenerates — which
costs an AI round-trip per chapter. Expect it, and do not treat it as a bug.

---

## 4. What was verified, and how

Run from `backend/`:

```bash
python -m pytest tests/test_conjoint_audit_2026_08.py -v
```

**31 tests, all passing.** They are written so that each one fails if its defect
returns — every one was confirmed failing against the pre-fix code first. Six of
them pin the review-pass regressions described in §2b.

Also still green (unchanged, no regressions):

```bash
python -m pytest tests/test_conjoint_stats_correctness.py -v
```

Measured results reproduced during the audit:

- D-efficiency of the new design generator vs 30 random designs, on 3×3×3 and
  3·3·2·2 layouts
- Generator runtime: 0.06 s / 0.38 s / 6.89 s for small / medium / large studies
  (was 0.89 s / 15.20 s / 34.07 s)
- BIC bases now identical across MNL, Mixed Logit and HB
- On synthetic data generated from a **homogeneous** logit, BIC correctly ranks
  MNL first (2182.4) ahead of Mixed Logit (2209.4) and HB (2209.6), while raw
  log-likelihood would have picked Mixed Logit — the exact failure F3 fixes

---

## 5. ⚠️ What was NOT verified — please close these

This work was done on a Windows workstation with **no running application**. Be
explicit with the user about this before treating the UI as done.

| Not verified | Why | What to do |
|---|---|---|
| **Frontend rendering** | No `node_modules`, no `.env`, no dev server. JSX was only parsed with `@babel/parser` — syntax is valid, appearance is unconfirmed. | `yarn install && yarn start`, then open a study's Results page and the Compare tab. |
| **The two new UI cards** | Same reason. | Check the sample-adequacy card and "สรุปผลแบบอ่านง่าย" card render correctly at each of the four adequacy bands, and on mobile widths. **Check the adequacy card specifically** — the review found it silently unrenderable once already (R5); confirm it shows a band, not "กำลังตรวจสอบ". |
| **That the Results page mounts at all** | Same reason. | The review found a Rules-of-Hooks violation here (R1) that crashes the page after loading. It is fixed, but the fix has not been seen in a browser. Open the page first, before anything else. |
| **The `view=summary` aggregation** | Requires MongoDB. | `GET /api/conjoint/studies/{id}?view=summary` must now return `num_choice_sets` and `alternatives_per_set`, still without `choice_sets`. Verify both the values and that the response size did not grow. |
| **Any end-to-end API call** | No MongoDB, no backend process. All backend verification was done by calling the analysis functions directly with synthetic studies. | Exercise `GET /api/conjoint/studies/{id}/statistical-analysis?method=…` for all four methods on a real study. |
| **The design-generation endpoint** | `generate_d_optimal_design` was tested as a function, not through `POST /conjoint/studies/{id}/generate-design`. | Generate a design on a real study and confirm the sets look sane in the Design page. |
| **Behaviour on real (messy) response data** | Only synthetic data was used. | Run all four methods against a production-like study, especially one that has been edited after its design was generated. |
| **Thesis/DOCX export and AI interpretation prompts** | Not touched, but they quote statistics whose values changed. | Regenerate one thesis export and one AI interpretation and check the numbers agree with the Results page. |

---

## 6. TODO for the next agent

### P1 — finish what this change started

1. **Visual QA of the two new cards** and the rebuilt Compare tab (see §5).
2. **Surface the new fields in the Academic tab.** `ConjointResultsPage.js`'s
   `activeTab === 'academic'` section still renders the old field set. Now
   available and worth showing there:
   `pseudo_r_squared_adj`, `n_choice_situations`, `n_parameters`,
   `random_vars` / `fixed_vars`, `reference_levels`, `excluded_levels`.
3. **Design page should quote the sample size it now can.** `recommend_sample_size()`
   exists in `backend/routes/conjoint.py` and uses the same rule as the Results
   page's adequacy card, but no endpoint returns it yet. Wire it into the design
   step so the researcher sees "you will need ≈ N respondents" *before* launching.
   This closes the loop U1 opened.

### P2 — worth doing, not started

4. **Respondent quality checks before estimation** — drop straight-liners and
   speeders. This was already on the roadmap (`.emergent/summary.txt`, P2) and it
   interacts with everything here: junk responses depress McFadden ρ², which the
   new UI now reports prominently.
5. **Survey preview** and a **progress-dot grid** for respondents — carried over
   from `memory/CONJOINT_AUDIT_2026_05.md` Part 2, still unaddressed.
6. **Export per-respondent HB posteriors.** `individual_posteriors_sample` is
   capped at 50 respondents for payload size; there is no full export endpoint.
   Needed for segmentation and market simulation.

### P3 — known remaining theory gaps

7. **Mixed Logit distributions are all normal.** A normal price coefficient puts
   positive mass on "prefers paying more". Log-normal with a sign constraint is
   the standard remedy. `_fit_panel_mixed_logit` takes `randvars` as a dict, so
   per-attribute distributions are a small change — the plumbing is ready, the
   UI to choose them is not.
8. **`calculate_optimal_choice_sets` caps at 24 tasks.** Above that, respondent
   fatigue is the real constraint and the honest answer is "use a blocked design"
   — which is not implemented. Right now large studies silently accept the cap.
9. **The counting method's importance** uses ranges of selection *percentages*,
   which is not on the same scale as the logit methods' importance. They are
   displayed on one chart in the Compare tab. Defensible, but worth a footnote.

---

## 7. Gotchas

- **The test file hardcodes `/app/backend`** (`sys.path.insert` + `os.chdir`),
  matching the existing `test_conjoint_stats_correctness.py` convention. It runs
  as-is in the deploy container. It will not run on a workstation without editing
  those two lines.
- **`_dummy_encode_consistent_reference` now takes an optional `groups` argument.**
  Pass it (one id per choice situation) for any conditional-logit-style model;
  omit it for models with an intercept, where the correct guard is
  globally-constant columns rather than within-group-constant ones. OLS
  deliberately does not pass it.
- **Coefficient access must stay name-based.** If you add anything that reads
  `model.coeff_`, index via `model.coeff_names` — xlogit emits `sd.<v>` only for
  random variables, so positional slicing breaks silently on mixed models.
- **`generate_d_optimal_design` is seeded** (`default_rng(42)`, plus fixed
  per-restart seeds) so designs are reproducible. Changing the seeds changes
  every newly generated design; existing studies are unaffected.
- **Design generation is bounded by `EVAL_BUDGET = 400_000`** determinant
  evaluations. A very large attribute space will hit the budget and return a
  good-but-not-optimal design rather than hanging. Raise it if quality matters
  more than the ~7 s worst case measured.
- **Language:** this project's users are Thai speakers; all new user-facing
  strings are in Thai. Keep it that way.

---

## 8. Reviewing this change

Start with `memory/CONJOINT_AUDIT_2026_08.md` — it gives, for each defect, the
reproduction, the measurement, and the reasoning. The code comments explain *why*
each fix is shaped the way it is, including one hypothesis that was investigated
and **disproved** (a suspected respondent-misalignment bug in
`_individual_posteriors`, refuted against a brute-force reference implementation
— no change was made, and the reasoning is recorded so nobody re-opens it).
