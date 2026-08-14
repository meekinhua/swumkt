# Thesis Export — Academic Correctness Audit (Conjoint + Brand Equity)
_Date: 2026-08-14_

Audited by four lenses (equations, citations, claims-vs-evidence, APA 7 reporting)
across both export pipelines, every finding then handed to a separate reviewer
instructed to refute it. **8 raised, 7 confirmed, 1 refuted** — the refuted one
only because it had been fixed mid-audit. All confirmed items are fixed and pinned
by `backend/tests/test_thesis_export_academic_2026_08.py` (23 tests).

The unifying defect: **both pipelines instructed the AI writer to report
procedures and statistics the software never produces.** A student would sign a
methodology chapter describing analyses that did not happen.

---

## Conjoint

### C1 · HB chapter documented an MCMC sampler that never runs — **HIGH**

`_get_method_equations("hierarchical_bayes")` emitted, verbatim into Chapters 3
and 4:

```
- Hyperpriors: μ ~ N(μ₀, Σ₀), Σ⁻¹ ~ Wishart(ν₀, V₀)
- MCMC (Gibbs Sampling):
  Step 1: Draw βₙ|data, μ, Σ (Metropolis-Hastings within Gibbs)
  Step 2: Draw μ|{βₙ}, Σ
  Step 3: Draw Σ|{βₙ}, μ
- Convergence Diagnostics: Gelman-Rubin statistic (R̂ < 1.1), trace plots
- Burn-in: ทิ้ง iterations แรก (ก่อน convergence)
```

`calculate_hierarchical_bayes_analysis` runs **no MCMC at all** — its own
docstring says so. It fits a panel Mixed Logit by Maximum Simulated Likelihood
(300 Halton draws) and derives per-respondent posteriors from Train (2009) §11.5,
`E[β|yₙ] ≈ Σᵣ βᵣ·w_{r,n}`. There is no prior, no chain, no burn-in and no R̂ to
report. **Fixed:** the block now describes the two-step MSL + conditional-
distribution estimator and states explicitly that this is Empirical Bayes, not
full MCMC, so the limitation is disclosed rather than concealed.

### C2 · OLS block printed formulas that do not produce the reported numbers — **HIGH**

The module fits a **Linear Probability Model with cluster-robust (Liang–Zeger)
SEs by choice situation**, yet the chapter printed the classical homoskedastic
`SE(β̂) = √[MSE × (X'X)⁻¹ⱼⱼ]`, an R²-based F formula that does not reproduce the
robust Wald F actually reported, `ε ~ N(0, σ²)` for a 0/1 outcome, and VIF and
Durbin–Watson as satisfied assumption checks — neither of which is computed.
Listing homoscedasticity as an assumption is doubly wrong: an LPM is
heteroscedastic by construction, which is *why* the robust estimator is used.

### C3 · MNL and Counting claimed tests that never run — **HIGH**

`- IIA Assumption: … (Hausman test)` and, for the counting method,
`- ทดสอบนัยสำคัญ: Chi-square test for independence`. Neither is computed anywhere.
**Fixed:** IIA is now stated as an untested assumption to be declared as a
limitation; counting is labelled descriptive with no significance testing.

### C4 · Mixed Logit spec was more general than the estimator — **HIGH**

`βₙ = β̄ + Lωₙ` with a Cholesky factor describes **correlated** random parameters;
the code fits independent normals. A four-distribution menu was listed where only
the normal is used, and a willingness-to-pay formula appeared that the module
never computes.

### C5 · Chapter 4 demanded statistics the writer was never given — **HIGH**

The per-method loop emitted, identically for all five methods:

```
- แสดงค่า Coefficients/Part-worths ทุกตัว พร้อม SE, test statistic, p-value
- อธิบายนัยสำคัญทางสถิติ: *** p<0.001, ** p<0.01, * p<0.05, ns
```

Only MNL supplies per-coefficient p-values. Worse, three lookups in
`_summarize_results_for_thesis` could never match:

| lookup | reality |
|---|---|
| `f_p_value` | the estimator returns **`f_pvalue`** |
| `preference_heterogeneity` | never returned; σ̂ lives in `std_coefficients`, its test in `sd_p_values` |
| `convergence`, `n_iterations` | never returned — there is no sampler |

So the writer was ordered to star coefficients it had never seen, and to report an
F with neither degrees of freedom nor a p-value. With no anti-fabrication rule in
the system message, the only way to comply was to invent numbers.

**Fixed:** the summariser now emits OLS per-level cluster-robust SE/t/p plus
`f_df1`/`f_df2` for APA's `F(df1, df2)`; Mixed Logit means with SE, z, p, σ̂ and
p(σ̂) plus the random/fixed split; HB fit statistics and population SDs labelled
**"NOT a standard error"**. Chapter 4 bullets are now per method — counting and HB
are explicitly forbidden from reporting p-values or stars, HB reports model-level
significance via the LR test instead. A new system-message rule forbids inventing
any statistic and names Hausman, VIF, Durbin–Watson and Gelman–Rubin as things to
declare as limitations rather than report, alongside APA 7 conventions
(italic symbols, `p < .001`, no leading zero on bounded statistics, F with df).

---

## Brand Equity

### B1 · Reference misattributed — **HIGH**

```
- Aaker, D. A. (1997). Dimensions of brand personality. JMR 34(3), 347–356.
```

That paper is by **Jennifer L. Aaker**, not David A. Aaker — two different
scholars, and the brand-personality construct is specifically J. L. Aaker's.
Fixed, with the DOI added.

### B2 · POMP misattributed to DeVellis (2017) — **HIGH**

The Chapter 3 prompt called `(x̄−1)/(k−1)×100` "สูตรมาตรฐาน DeVellis (2017)".
DeVellis is a scale-development textbook, not the source of the POMP transform.
Correct attribution is **Cohen, Cohen, Aiken & West (1999)**, now cited in the
prompt and added to the reference list — together with Cronbach (1951),
Nunnally & Bernstein (1994) and Fornell & Larcker (1981), which the export now
needs since it reports reliability and discusses validity.

### B3 · Non-AI DOCX report

Added while auditing: the report now carries a **reliability table** (α, k, n,
mean inter-item r, assessment per dimension), an explicit statement that construct
validity was not assessed and that BES is a theory-weighted index rather than a
latent variable, the **computed sample-adequacy verdict** in place of a fixed
sentence, and a note that all comparisons are descriptive with no significance
testing. The dimension-weight table is now generated from `DIMENSION_WEIGHTS`
instead of a hand-copied literal that had already drifted.

---

## Verified

```bash
python -m pytest tests/test_thesis_export_academic_2026_08.py -v   # 23
python -m pytest tests/test_brand_equity_audit_2026_08.py -v       # 41
python -m pytest tests/test_conjoint_audit_2026_08.py -v           # 31
```

All 95 pass. Both DOCX renderers were executed end-to-end on synthetic studies
and their headings and tables inspected.

## Not verified

No AI chapter was actually generated — that needs a live Gemini key. The prompts
are correct and the rules are in place, but **whether the model obeys them has not
been observed**. Generate one thesis per module after deploy and read Chapter 3
and Chapter 4 before trusting the output.
