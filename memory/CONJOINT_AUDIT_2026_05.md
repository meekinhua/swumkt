# Conjoint Module — Academic Audit + UX Improvement Plan
_Date: 2026-05-24_

## Part 1 — Academic Correctness Audit

### Score card

| Method / Step | Implementation | Academic Status | Severity |
|---|---|---|---|
| **Counting Method** | `selections / appearances × 100` | ✅ Correct (Sawtooth-style) | — |
| **MNL (Conditional Logit)** | statsmodels ConditionalLogit | ✅ Mostly correct | Low |
| **Mixed Logit** | xlogit MixedLogit + Halton draws | ✅ Real SMLE | Low-Med |
| **HB** | Same as Mixed Logit, just `n_draws=300` | ⚠️ Mislabeled — not true HB | **HIGH** |
| **OLS / LPM** | statsmodels OLS | ✅ Correct, but SE wrong for clustered data | Med |
| **Importance Scores** | `range / Σ ranges × 100` | ✅ Standard | — |
| **Experimental Design** | Random sampling, NOT D-optimal | ⚠️ Mislabeled "D-optimal" | **HIGH** |

---

### Issues found

#### 🔴 H1 — "D-Optimal" design isn't D-optimal
**Where:** `generate_d_optimal_design` in `routes/conjoint.py:289`

The function name and docstring say "D-optimal fractional factorial design" but the implementation is **random sampling with a within-set variation check**. The author's own comment admits this: `"D-optimal selection (simplified - use random sampling with constraints)"`.

**Why it matters academically:**
A D-optimal design minimises `det((X'X)⁻¹)`, giving the smallest possible joint confidence region for all parameter estimates. With random sampling, attribute-level frequencies and pairwise correlations are uncontrolled — some studies will produce SE that are 30-50% larger than achievable with the same number of choice sets.

**Recommended fix:**
- Use `dexpy` (D-optimal exchange algorithm via coordinate-exchange).
- Or implement modified Fedorov: start with random design, iterate row swaps that maximally reduce `|info_matrix⁻¹|`.
- Rename the function honestly to `generate_random_balanced_design` until a true D-opt is in place.

#### 🔴 H2 — Hierarchical Bayes is just Mixed Logit relabeled
**Where:** `calculate_hierarchical_bayes_analysis` in `routes/conjoint.py:582`

The only difference from `calculate_mixed_logit_analysis` is `n_draws=300` vs `200`. Population means, SDs, and fit statistics will be nearly identical. Genuine HB delivers **per-respondent posterior coefficient vectors** that Mixed Logit cannot produce.

**Recommended fix:**
Add Train (2009, Ch. 11.5) "conditional distribution" individual-level estimates on top of the existing SMLE fit:

```
For each respondent n:
  P(β_r | y_n) ∝ L_n(β_r)
  E[β | y_n] ≈ Σ_r β_r · w_r,n   where w_r,n = L_n(β_r) / Σ_r L_n(β_r)
```

This makes HB output **meaningfully distinct** (individual-level utilities → market simulator, segmentation) instead of duplicating Mixed Logit. Full MCMC (PyMC) is optional and slow; the conditional distribution method is the academically accepted compromise.

#### 🟡 M1 — MNL reference level is alphabetical, not configurable
**Where:** `calculate_mnl_analysis`, `pd.get_dummies(... drop_first=True)`

`drop_first=True` drops the FIRST level alphabetically. OLS in the same file uses `levels[-1]` (the LAST level by study order) as reference. This inconsistency confuses interpretation across methods.

**Fix:** Use `pd.get_dummies(..., drop_first=False)` then drop the level matching the UI's reference. Or expose a `reference_level_id` field per attribute.

#### 🟡 M2 — OLS standard errors ignore clustering
**Where:** `calculate_regression_analysis`

Within a choice set, alternatives are not independent — selecting one means the others were rejected. Current SE assume i.i.d. observations.

**Fix:** Use `model.fit(cov_type='cluster', cov_kwds={'groups': situation_id})`. The note correctly says "use MNL for inference," which mitigates this, but if anyone publishes the OLS table they'll under-state SE.

#### 🟡 M3 — Mixed Logit treats every coefficient as random
**Where:** `calculate_mixed_logit_analysis`, `randvars={v:'n' for v in varnames}`

In standard practice, the price coefficient is often constrained fixed (or log-normal with sign constraint) to avoid identification problems. Treating all variables as random sometimes yields near-zero or "wrong-sign" SD estimates — a symptom of model over-parameterisation.

**Fix:** Add a per-attribute "treat as random" UI toggle, or auto-detect coefficients whose SD is < 5% of mean and re-estimate as fixed.

#### 🟢 L1 — `n` for BIC ambiguity
**Where:** `calculate_mnl_analysis`, `bic = -2*llf + k*log(n_obs)` where n_obs = total exploded rows.

Train (2009) uses number of choice situations (groups) for BIC of conditional logit; other texts use exploded rows. Both are defensible. **Document the choice in the UI tooltip.**

#### 🟢 L2 — Pseudo R² ≠ McFadden's adjusted Pseudo R²
We report the un-adjusted McFadden statistic. For comparing models with different K, the adjusted version `1 - (LL_model - K) / LL_null` is preferred. Add as a second column in the Compare Methods table.

---

## Part 2 — UX Improvement Plan

Two personas, two journeys.

### Journey A — Researcher (study creator)
**Current flow:**
1. `/market-research/conjoint-analysis` → study list
2. Click "สร้างการศึกษาใหม่" → modal with title / desc / category / demographics chips (just added)
3. Land on Design page → fill attributes & levels, generate choice sets, AI image generation
4. Hit "Start Survey" → get share link
5. Wait for responses → Results page

**Pain points & fixes:**

| Pain | Fix | Priority |
|---|---|---|
| New researcher has no idea **how many respondents** they need before launching | Add live "Power calculator" widget in Design page: shows "for K parameters and detect effect size d=0.3, you need N ≈ X respondents" | P1 |
| Attribute editing UI is generic — no guard rails for **bad designs** (e.g. all attributes 2-level, or one attribute with 8 levels making it dominate importance) | Inline warnings: "Attribute 'Brand' has 8 levels — will need >150 respondents for stable estimates" | P1 |
| No way to **preview the survey** before launching | Add "ดูตัวอย่าง survey" button that opens the survey in a modal with sample interactions disabled | P1 |
| Generating AI images per profile is slow; user doesn't know which sets are pending | Per-set progress indicator + ability to bulk-regenerate failed images | P2 |
| **No data quality** dashboard — speeders, straight-liners, mid-survey dropoffs invisible | Quality panel: drop respondents with duration < 30 s, flag respondents who picked Alt-1 every time, show completion funnel | P2 |
| When the survey is live, the researcher checks Results page repeatedly. No "what changed since last visit" view | Email/notification on milestone: "n=30 reached → MNL now estimable" / "n=100, segment-level analysis unlocked" | P3 |
| Sharing results currently relies on toggling `is_public_result` — no fine-grained access (e.g. team-only) | Per-study collaborator list with view/edit roles | P3 |
| **Method picker is intimidating** for non-statisticians (MNL/Mixed/HB/OLS) | Default "Just show me the answer" mode that picks the best-fit method automatically and explains why in plain language | P2 |
| Importance scores can be misleading when one attribute has many levels | Show "level-balanced importance" alongside raw importance, with a tooltip explaining the difference | P2 |

---

### Journey B — Respondent (survey taker / public viewer)
**Current flow:**
1. Land on `/survey/conjoint/{id}` via share link
2. (NEW) Demographics step → fill chip selectors
3. Choice sets one-by-one with prev/next
4. Submit → thank-you

**Pain points & fixes:**

| Pain | Fix | Priority |
|---|---|---|
| Page jumps to top on every Next click, hurting fatigue on mobile | Smooth scroll/anchor preservation + sticky "Set X of Y" header | P1 |
| No idea how long the survey will take. Drop-off risk | Show "ใช้เวลาประมาณ 3-5 นาที" on the intro/demographics card | P1 |
| Mobile: profile images are cropped, prices hard to compare | Comparison-table mode toggle: hide images, show attributes in a table for fast scanning | P1 |
| All choices equally weighted UI-wise — no hint that "this is just one of 12" | Replace the textual "12/12" with a progress dot grid; respondents see exactly how much is left | P1 |
| "Mock data attack" — anyone can submit junk responses on a public link | Add lightweight bot protection: minimum duration per choice set, "challenge" attention check inserted at set #6 | P1 |
| No way to go back and **change a previous answer** if user realizes they misread | Already supported via Prev button, but should add visual hint ("คลิก Prev เพื่อแก้ไข") | P2 |
| Demographic step asks for ALL fields the creator selected, no way to "Prefer not to say" per field | Add neutral "ไม่ระบุ" option to every demographic field | P2 |
| Public viewer (read-only Results page) sees raw stats with no narrative | Add an "Executive Summary" card at top: "60% of consumers prioritize PRICE. Brand X wins 38% market share at ฿29 price point." auto-generated from results | P1 |
| Public viewer has no way to **save / share / cite** what they saw | Add "ดาวน์โหลด PDF report" + "อ้างอิงงานวิจัย" with proper citation block | P2 |
| Public viewer who wants to dig deeper can't currently filter by segment (only the owner can?). Check ACL | Verify filter bar works for public viewers (it should) — if not, expose it | P1 (verify) |

---

### Prioritized 90-day roadmap

**Sprint 1 (P0/P1 fixes, ~2 weeks)**
- 🔴 Implement true D-optimal design via `dexpy` or manual K-exchange (H1)
- 🔴 Make HB output individual-level posteriors via Train's conditional distribution (H2)
- 🟡 Add cluster-robust SE to OLS (M2)
- ✅ Power calculator widget in Design page
- ✅ Survey preview button
- ✅ Mobile comparison-table mode
- ✅ Public viewer filter bar verification

**Sprint 2 (P1-P2 enhancements, ~3 weeks)**
- Data quality panel (speeders, straight-liners, dropoffs)
- "Just show me the answer" auto-method-picker
- AI-generated executive summary for public viewers
- Adjusted McFadden Pseudo R² in Compare Methods table
- Attention check question injected into surveys
- "Prefer not to say" demographic option

**Sprint 3 (P2-P3 polish, ~3 weeks)**
- Per-study collaborator roles
- Real-time notifications on survey milestones
- PDF report download + citation block
- Per-set AI image regeneration controls
- Mixed Logit: smart random/fixed coefficient detection (M3)

---

## Notes
- All "Sprint 1" items are tractable with the current stack — no new infra needed.
- The HB conditional-distribution upgrade (~150 lines) and D-optimal upgrade (~300 lines via `dexpy`) are the two highest-leverage items because they unlock honest academic citation of the tool.
