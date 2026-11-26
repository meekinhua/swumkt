# Conjoint Module — Theoretical Audit + UX Pass
_Date: 2026-08-13 · follows up `CONJOINT_AUDIT_2026_05.md`_

Every defect below was **reproduced by execution first**, then fixed, then pinned
by a test in `backend/tests/test_conjoint_audit_2026_08.py` (11 tests, all green).
Numbers in this document are measured, not estimated.

---

## Status of the May 2026 audit items

| ID | May finding | Status now |
|---|---|---|
| H1 | "D-optimal" was random sampling | Was rewritten to K-exchange — **but on the wrong objective**. See F1. |
| H2 | HB was Mixed Logit relabelled | ✅ Genuinely fixed — Train (2009) Ch. 11.5 conditional distribution is implemented and correct |
| M1 | MNL reference level alphabetical | ✅ Fixed — `_dummy_encode_consistent_reference`, last level as reference |
| M2 | OLS SE ignored clustering | ✅ Fixed — `cov_type="cluster"` by choice situation |
| M3 | Mixed Logit treats every coefficient as random | ✅ Fixed — see F7 |
| L1 | BIC `n` ambiguity | ✅ Fixed — was worse than documented, see F4 |
| L2 | Adjusted McFadden ρ² | ✅ Fixed — see F9 |

---

## F1 · Design generator optimised a quantity the next step threw away — **HIGH**

`generate_d_optimal_design` ran K-exchange to maximise `log det(X'X)` over a
**pooled bag** of profiles, including an intercept column, then **shuffled those
profiles into choice sets at random**.

Two things are wrong with that. A conditional logit has no intercept — it cancels
within a choice set, so including it optimises a direction that does not exist in
the estimated model. And under the standard β = 0 design prior the information
matrix is

```
I_s = X_s' (diag(p) − p p') X_s = (1/J) · Xc_s' Xc_s      (p = 1/J, Xc = within-set centred)
```

so information comes **only from contrasts inside a choice set**. Grouping is the
whole game — and grouping was random.

**Measured** (`det(I)^(1/K)`, higher is better):

| design | 3×3×3, 9 sets | 3·3·2·2, 12 sets |
|---|---|---|
| shipped "D-optimal" | 1.2088 | 1.6419 |
| plain random (mean of 30) | 1.0274 | 1.5433 |
| plain random (**best** of 30) | 1.2023 | **1.7846** ← beat the optimiser |
| optimising the correct criterion | **1.6831** (+39%) | **2.3750** (+45%) |

Drawing 30 random designs and keeping the best outperformed the expensive
K-exchange in the second scenario.

**Fix** — modified Fedorov directly on `Σ_s I_s`, evaluated on the same grouping
respondents actually see; no intercept; multi-start; the trial batch for each
position is built in closed form and scored with one batched `slogdet`.

Result: **+44.8 % to +59.9 % D-efficiency over best-of-N random**, ≈ 15 % smaller
standard errors — the same precision from roughly a quarter fewer respondents.
Runtime went *down*, because the batched scorer more than paid for the extra work:

| study | before | after |
|---|---|---|
| 3×3×3, 9 sets | 0.89 s | **0.06 s** |
| 4,4,3,3,2 — 14 sets | 15.20 s | **0.38 s** |
| 5,4,4,3,3,3,2 — 18 sets | 34.07 s | **6.89 s** |

---

## F2 · Editing a study after design generation killed the analysis — **HIGH**

`_dummy_encode_consistent_reference` dropped the reference column only *if it was
already there*. Two edits the study editor permits made that a silent no-op:

* **append a level** → the new level becomes `levels[-1]`, i.e. the nominal
  reference, but it was never shown, so nothing was dropped and every observed
  level kept a dummy
* **append an attribute** → `_build_conjoint_data_rows` writes the `__MISSING__`
  sentinel on every row, producing a constant column

Both are unidentified without an intercept. Reproduced:

```
appended level     → ValueError: need covariance of parameters for computing (unnormalized) covariances
appended attribute → ValueError: Conditional models should not have an intercept in the design matrix
```

`calculate_mnl_analysis` catches these, logs, and returns `None` — the user sees a
generic failure. Mixed Logit and HB share the encoder, so all three died together.

The existing `update_study_attributes` guard does **not** cover this: it clears
`choice_sets` only when a level was **removed**, and neither of these removes
anything.

**Fix** — the reference is now the last *declared* level that actually appears in
the data; attributes with fewer than two observed levels are dropped whole; and
any column with no within-choice-set variation is removed (that is the exact
identification condition for a conditional logit, and it catches `__MISSING__`).

---

## F3 · "BEST FIT" was decided by raw log-likelihood — **HIGH**

`ConjointCompareMethods.jsx` picked the winner with
`fit.reduce((a, b) => (b.ll > a.ll ? b : a))` and printed
*"— แนะนำเป็น primary analysis"*.

Log-likelihood is weakly increasing in parameter count, and Mixed Logit / HB
**nest** MNL (MNL is the special case where every taste SD is 0). The richer model
therefore essentially always wins, whether or not the heterogeneity is real —
the badge was relabelling "most parameters" as "best fit".

Demonstrated on data generated from a **homogeneous** logit (no heterogeneity at
all, so MNL is the true model):

```
log-likelihood : MXL −1076.35  >  MNL −1077.00     -> old rule recommends Mixed Logit
BIC            : MNL  2182.4   <  MXL  2209.4  <  HB 2209.6   -> correct answer is MNL
```

Also: Mixed Logit and HB differ only in draw count (200 vs 300), so their gap is
partly Monte-Carlo noise — a bare winner between them is not meaningful.

**Fix** — selection by BIC among the discrete-choice family only, with Raftery's
(1995) grading of the gap (<2 not worth mentioning → prefer the simpler model;
2–6 positive; 6–10 strong; >10 very strong). OLS is excluded from the LL/AIC/BIC
columns entirely: it maximises a Gaussian likelihood over a 0/1 outcome, a
different scale, and its R² is now shown separately instead of being rendered in
the "Pseudo R²" column.

---

## F4 · AIC/BIC were not comparable across methods — **MED-HIGH**

The Compare Methods table put these side by side under "lower = better":

```
MNL      bic = -2*llf + k*log(n_obs)          n_obs = 1440  (exploded alternative rows)
MXL/HB   model.bic from xlogit                 n     =  480  (choice situations)
```

A `log(J)` per-parameter difference in the penalty — 3.3 BIC points at k = 3, and
it scales with k, easily enough to flip a ranking.

**Fix** — MNL now penalises by `log(n_choice_situations)`, Train's convention for
a conditional logit and the one xlogit already used. All methods return
`n_choice_situations`, `n_parameters` and `ic_sample_basis` so the basis is
visible rather than assumed.

---

## F5 · HB crashed on a task with no recorded selection — **MED**

`_individual_posteriors` built a situation-indexed table and then ran
`np.add.at(log_L_n, resp_inverse, ll_per_sit)`, assuming exactly one chosen row
per situation. A skipped task — or a `selected_profile_id` that no longer matches
any profile in the set — breaks that:

```
ValueError: array is not broadcastable to correct shape
```

**Fix** — aggregate by the respondent of each *chosen row* instead of by
situation, so situations without a selection simply contribute nothing.

_(A separate suspicion — that the vectorised aggregation misaligned respondents
when tasks were answered out of order — was tested against a brute-force
reference implementation and **disproved**: the permutation is always within a
single respondent, and the sum is order-invariant. No change made.)_

---

## F6 · HB importance came from the population mean — **MED**

Importance is a ratio of ranges, and a ratio of averages is not the average of
ratios. Deriving it from population-mean part-worths understates any attribute
where respondents disagree in **direction** — their positive and negative
part-worths cancel in the mean, shrinking its range even though every individual
has a large one. Sawtooth's HB module averages per-respondent importances.

**Fix** — `_importance_from_individual_betas` computes each respondent's own
ranges, normalises to 100 % within that respondent, then averages; SD and
quartiles ship alongside. The population-mean version is retained under
`importance_population_mean` for comparison, and `importance_basis` says which
one `importance_scores` holds.

---

## F7 · Every coefficient was declared random — **MED**

`randvars={v: "n" for v in varnames}` asks the data for 2K parameters when the
design may only support K. The symptom is a taste SD estimated at ~0 or with an
implausible sign — not a finding about consumers, just an over-parameterised
model burning degrees of freedom and inflating standard errors.

**Fix** — `_fit_panel_mixed_logit` fits with everything random, reads the SD
p-values, and re-fits keeping as random only the coefficients that earned it
(Hensher & Greene, *Applied Choice Analysis*, ch. 15). If NO SD is significant we
do **not** invent one: the all-random fit is returned with
`heterogeneity_detected = False` and a note telling the user to report MNL.
`random_vars` / `fixed_vars` / `n_parameters` ship in the result and are surfaced
in the Compare tab.

Shared by Mixed Logit and HB. For HB a fixed coefficient has `pop_sd = 0`, so its
individual-posterior draws collapse onto the population mean — which is exactly
what "everyone shares this coefficient" should mean.

### F7a · The coefficient lookup this exposed — **HIGH if left unfixed**

The old code read results positionally: `coeff_[:K]` = means, `coeff_[K:]` = SDs.
That is correct **only while every coefficient is random**. xlogit emits
`coeff_names` as every varname, then `sd.<v>` for the random subset **only**:

```
randvars=[A,B,C] -> ['A','B','C','sd.A','sd.B','sd.C']
randvars=[B]     -> ['A','B','C','sd.B']
```

So the moment a subset became fixed, positional slicing would have silently read
SD entries as means. All coefficient access is now **by name**.

---

## F8 · OLS reference could be a level nobody was ever shown — **HIGH**

Found by a test written for F6, not by reading. `calculate_regression_analysis`
took `levels[-1]` as the reference unconditionally. Append a level after the
design is generated and that new level becomes the reference while appearing in
no profile — so every *other* level of the attribute keeps a dummy, and those
dummies sum to 1 on every row, which is **perfectly collinear with the
intercept**. statsmodels pseudo-inverts rather than failing, so the model happily
reported coefficients that are not identified.

**Fix** — a pre-pass records which levels were actually shown; the reference is
the last *declared* level among them (matching `_dummy_encode_consistent_reference`);
attributes with fewer than two observed levels are dropped whole; levels never
shown are reported in `excluded_levels` with `is_excluded: true` rather than
being emitted as a coefficient of 0. `reference_levels` now says which level each
attribute is measured against. Pinned by a full-rank assertion on the design matrix.

Also: `unmapped_level_rows` counts rows whose level the study no longer declares.
OLS folds those into the reference while MNL gives them their own class, so the
two methods were describing different data — now stated in the result and shown
as a warning banner in the Compare tab.

---

## F9 · Adjusted McFadden ρ² — **LOW**

`_calc_fit_diagnostics` now also returns `pseudo_r_squared_adj = 1 − (LL − k)/LL_null`.
The unadjusted statistic can only rise as parameters are added, exactly like an
unadjusted OLS R², so it is the wrong column to compare models of different size
in. Shown as its own column in the Compare tab.

---

## F10 · Task-count rule divided by the wrong thing — **MED**

`calculate_optimal_choice_sets` used `3K / alternatives_per_set`. A choice set of
`a` alternatives supplies `a − 1` independent **contrasts**, not `a`, so dividing
by `a` shrank the design exactly when more alternatives made each task more
informative — more alternatives asked for *fewer* tasks in a way the arithmetic
did not justify. It also hard-capped at 20 tasks, silently under-identifying large
studies.

**Fix** — `t · (a − 1) ≥ 3K`, cap raised to 24, and the respondent-count
consequence moved into a new `recommend_sample_size()` that uses the **same
Johnson & Orme rule** as the Results page's adequacy card, so the number quoted
before launch matches the one checked after.

---

## UX pass — for users with no statistics background

### U1 · The data-adequacy card was hardcoded to "เพียงพอ" — **HIGH**

`ConjointResultsPage.js` rendered a fixed green card reading
**"สถานะ: พร้อมวิเคราะห์ / ข้อมูลเพียงพอแล้ว"** with no condition attached. A study
with four respondents was told it was ready to report.

Replaced with a computed readout using the standard choice-based conjoint
planning rule (Orme, *Getting Started with Conjoint Analysis*, ch. 7):

```
n · t · a / c  >=  500        n respondents, t tasks, a alternatives/task,
                               c = largest level count of any attribute
```

Four bands — `< 30 respondents` (cannot estimate at all) / below 500 / 500–1000 /
above 1000 — each stating the score, the threshold, and **how many more people
are needed**, which is the only form of that number a non-specialist can act on.

### U2 · "สรุปผลแบบอ่านง่าย" card at the top of Overview

Answers the question first: which attribute drove the decision and by how much,
the best and worst level of every attribute, how far to trust it, and a one-line
gloss of what "importance %" even means. Attributes with a zero range are called
out as "ไม่ต่างกันอย่างมีนัย" rather than shown with an arbitrary winner.

### U3 · Method picker rewritten around intent

Was five bare method names. Now each option leads with *why you would pick it*
("เมื่อคนแต่ละกลุ่มชอบไม่เหมือนกัน", "เมื่อต้องการผลรายบุคคล"), MNL is marked
แนะนำ and listed first, and a hint points at the Compare tab for users who want
the system to decide.

### U4 · McFadden ρ² no longer rendered as a percentage

It was displayed via `fmtPct` as "19.20%", in the same column as OLS's R² — two
different quantities under one heading, formatted to invite the exact
share-of-variance reading McFadden's statistic does not support. Now a plain
3-decimal number with a colour-coded band (ต่ำ / พอใช้ / ดี / ดีมาก / ดีเยี่ยม)
and a footnote giving the OLS-equivalent intuition.

---

---

## Review pass — defects introduced BY the fixes above

The fixes were then put through an independent adversarial review (four lenses:
statistical, Python robustness, backend↔frontend contract, completeness sweep;
every finding then handed to a separate agent instructed to refute it). 15 claims
raised, **11 confirmed by reproduction, 4 refuted**. All 11 are fixed; the ones
that mattered are below.

| ID | Severity | What was wrong with the fix |
|---|---|---|
| R1 | **HIGH** | `sampleAdequacy` and `plainSummary` were `useMemo` calls placed **below** the component's two early returns. That is a Rules-of-Hooks violation: React throws "Rendered more hooks than during the previous render" the moment loading finishes, taking the entire Results page down. Now plain IIFEs — the values feed no other hook, and the computation is O(attributes), so memoising bought nothing. |
| R2 | **HIGH** | The BIC recommendation degenerated to the constant "MNL". `delta` compared rows[0] to rows[1], but Mixed Logit and HB are the same estimator differing only in draw count, so their gap is Monte-Carlo noise (measured 0.01–0.23) — always < 2, so the tie branch fired on every study and hardcoded MNL. Reproduced on three seeds where MNL was 70–270 BIC points *worse*. Now the tie set is anchored to the leader and the simplest model **within it** is picked; a model that failed to load can no longer receive the badge. |
| R3 | **HIGH** | F5 guarded the wrong layer. A task with no usable selection still killed Mixed Logit and HB, because xlogit rejects the dataset inside the fit — long before `_individual_posteriors` runs. The same input also made `ConditionalLogit` silently drop the group, so MNL's `llnull`, `n_observations` and BIC described a larger sample than the coefficients were estimated on. Now excluded once, in `_build_conjoint_data_rows` (and mirrored in OLS), so all four methods share one sample. |
| R4 | **HIGH** | `pseudo_r_squared_adj` was computed in `_calc_fit_diagnostics` and **never added to any result dict**, so F9's new column was always "—". |
| R5 | **HIGH** | The sample-adequacy card could never render: the Results page requests `view=summary`, which strips `choice_sets`, and `num_choice_sets` is not a stored field — so tasks × alternatives was always 0 and the card sat on "กำลังตรวจสอบ" forever, i.e. exactly the state U1 was written to remove. The summary view now computes both scalars with `$addFields`/`$size` without shipping the 7 MB array. |
| R6 | MED | Two attributes sharing a NAME collapse into one dataframe column (rows are keyed by name), and the per-attribute reference loop then dropped two of that column's levels. Now one reference per name, declared match preferred over the positional fallback. |
| R7 | MED | OLS `part_worths` carried no `is_reference` / `is_excluded`, so the results table still inferred "reference" from `utility === 0` — which is wrong for an unestimable level (also 0) and for a genuine zero coefficient. Flags now carried through and rendered, including a distinct "ประมาณค่าไม่ได้" state. |
| R8 | MED | The thesis-export cache had no `schema_version` guard, and unlike the other caches there is **no regenerate path in the UI** — a study would have kept emitting a .docx quoting its pre-audit figures forever. Guard added to the write and to both reads (including the keyless `^thesis_` fallback, which is the branch the frontend actually hits). |

Refuted (recorded so they are not re-opened): a claimed `recommend_sample_size`
inconsistency with the UI (the two rules do agree); a duplicate-column crash from
`get_dummies` (reproducible only via attribute names contrived to collide, and it
fails loudly rather than silently); a unique-index conflict on filtered analyses
(the cited code is not in this diff); and counting-method importance inflation
(real arithmetic, but pre-existing and unchanged here).

`ANALYSIS_CACHE_VERSION` ended at **4** — R3 and R4 moved values again after the
v3 bump.

---

## Still open

Everything raised by the May audit, by this one, and by the review pass is now
closed. What remains is new work, not unfinished work — see `HANDOFF_CONJOINT.md`
for the items being passed to the next agent, the deployment steps, and the parts
of this change that have **not** been verified in a running environment.
