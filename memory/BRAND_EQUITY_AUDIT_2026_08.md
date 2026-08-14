# Brand Equity — Theoretical Audit + UX Pass
_Date: 2026-08-14_

Audited by four independent lenses (measurement theory, scoring arithmetic,
inference, UX), every finding then handed to a separate reviewer instructed to
refute it. **46 findings raised, 8 verified in depth — all 8 confirmed, none
refuted.** Everything below was reproduced by executing the real module before
being fixed, and is pinned by `backend/tests/test_brand_equity_audit_2026_08.py`
(41 tests, all passing).

---

## The headline problem

The module presented a **weighted dashboard index** with the credentials of a
**psychometric measurement**, and exported it as a thesis asserting properties it
had never tested.

Nothing computed Cronbach's α, composite reliability, AVE, inter-item
correlation, or any factor-analytic check. Meanwhile the Chapter 3 prompt
instructed the model to write *"ความเที่ยง (reliability) ของ scale: Cronbach's
α ≥ 0.7"* — and the system message forbade it from writing a placeholder, from
saying the user would supply the value, and from using "TBD". The only compliant
output was a methodology chapter narrating a reliability test that never ran.

**Reproduced:** the same 4-item Perceived Quality scale, once loading on a single
factor (α = 0.93) and once with each item column independently shuffled so the
items share nothing (α ≈ 0), produced **byte-identical output** — same composite,
same `coverage: 1.0`, same tier. And it needs no contrivance: a premium brand
where value-for-money loads negatively gives α = 0.017 while the app reports
Quality 65.7 at full coverage with no caveat.

---

## Fixed

### Measurement

| | |
|---|---|
| **Cronbach's α now computed** | `_dimension_reliability()` builds the respondent × item matrix per dimension and reports α, mean inter-item r, k and n. It **refuses to report a number** when it cannot be estimated (k < 2, n < 30, zero variance) and says why instead. |
| **Thesis stops asserting reliability** | Chapter 3 now receives a table of measured α values and a hard rule against claiming a threshold the table does not show. Un-estimable dimensions must be disclosed and repeated in the limitations chapter. |
| **Thesis stops overclaiming generally** | Now required to state that construct validity was not tested (no EFA/CFA, no AVE/CR), that BES is a weighted composite index and not an SEM estimate, and that every comparison in the report is descriptive with no significance testing. |
| **Weight table generated from code** | §3.5 was hand-copied and had drifted from `DIMENSION_WEIGHTS`. It is now rendered from the live dictionary, so the methodology cannot describe a model the software does not run. |
| **Reverse coding** | `_likert_stats(..., reverse=True)` flips the 0-100 score and swaps the top/bottom boxes. Agreeing that a brand is "แพงเกินไป" used to **raise** its Perceived Quality. |
| **Polarity is declared, not guessed** | New `custom_quality_attributes_reverse` field. Free text carries no polarity, so an undeclared attribute that reads as negative (`_looks_negatively_worded`) is flagged and kept **out of every aggregate** rather than counted as a virtue. The heuristic only raises a flag — it never decides. |
| **Sample SD** | `_likert_stats` used the population form (÷n). It is exported under an "SD" column in the thesis appendix and handed to the AI writer as `sd=`; both mean the sample estimate. Now ÷(n−1). |

### Scoring arithmetic

| | |
|---|---|
| **Unreachable weights removed** | `logo_aided` + `logo_unaided` + `color_recall` carried **0.25 of Awareness** and `as_product_quality` 0.05 of Quality — but those questions are filed under `identity`, and the composite only ever reads questions whose `dimension` matches. They could never match anything. Awareness declared 1.25 and Quality 1.05; both now sum to 1.00 with every entry reachable. |
| **Identity metric ceiling** | `image_traits_aided` divided by the number of intended traits while the grid caps picks at 5, so a brand every respondent recognised perfectly scored **41.7 with 12 traits and 100 with 3** — the metric measured how many traits the student typed into the wizard. Now normalised by the achievable ceiling. |
| **Disjoint vocabulary** | `as_person_personality` offers `PERSONALITY_TRAIT_POOL`, which shares **2 of 17** labels with the pool intended traits come from, so it returned a hard `0.0` in essentially every study and cost Identity ~5 points unconditionally. A question that cannot express the construct is now **excluded** (`None`), not scored as a failure. |
| **Ad-hoc blend deleted** | `score = score*0.85 + fb_avg*0.15` handed the deliberately-unweighted descriptive questions a flat 15% of a dimension — more than every designed signal in `identity` except one, from an unsourced constant. Unweighted questions are descriptive-only now, exactly as the methodology page already claimed. |
| **Coverage made symmetric** | The AI identity-alignment weight was added to the numerator but not the denominator, so the function reported `coverage: 1.0` (clamped) while its own `missing_kinds` list was non-empty. |
| **Reproducible instrument** | The trait grid was `list(set(...))[:24]` — `set` iteration order is not stable across processes, so the questionnaire changed after every server restart, and the truncation could silently drop the brand's own intended traits from the grid that scores them. Intended traits now come first, order is fixed. |

### Honesty of the output

| | |
|---|---|
| **One verdict scale** | Two incompatible mappings existed: a 5-tier canonical scale (home card, methodology box, social preview, thesis DOCX) and a private **3-tier** scale in the dashboard hero (`≥70 Healthy / ≥40 At watch`). A BES of 62 was headlined **"เฝ้าระวัง"** while the methodology box lower on the *same page* called it **"สุขภาพดี"**, and the exported thesis agreed with the second. There is now one definition, served by the backend as `brand_health_tier`. |
| **Sample adequacy** | There was no minimum-n gate anywhere: n = 1 produced a full Brand Equity Score and a "Champion" verdict, silently. Four bands now ship in the payload and render under the headline. |
| **Confidence intervals** | Every score was a bare point estimate, so a dimension resting on 12 respondents looked as firm as one resting on 400. `score_100_ci95` and `mean_ci95` now accompany every Likert item. |
| **Unmeasured ≠ zero** | Missing dimensions were coerced to `0` after being excluded from BES, and the public home page then named an **unmeasured** dimension as the brand's weakest. `composite._measured` now says which dimensions were actually scored. |
| **Public endpoint validates** | `POST /public/{share_token}/respond` checked nothing. A value of 9 on a 7-point item flows into the unbounded POMP transform and pushes that question's score to **133.3** (0 pushes it to −25.0), straight into the published score. Answers are now range-checked per question type, pick caps enforced, free text bounded; invalid fields are dropped rather than discarding the whole response. |

### UX (dashboard)

- The **reliability card** renders α per dimension with a plain-Thai explanation of
  what it means and why some dimensions legitimately cannot have one.
- **Sample adequacy** and a **coverage warning** now sit directly under the
  headline score. `composite_meta[d].coverage` was already computed server-side
  as the incomplete-data flag and **nothing rendered it**.
- The hero's supporting sentence comes from the same canonical tier as its label,
  so headline and explanation cannot disagree.

---

## Second pass — the AI-dependency defect (fixed)

### S1 · Scores no longer depend on whether the LLM job ran — **HIGH**

`_question_signal_100` began with `if not s.get("ai_normalized"): return None`, so
every open-ended question contributed **nothing** until an AI normalisation job
had run. Top-of-Mind (w .40) and Unaided Recall (w .25) are open-ended, so **65 %
of the Awareness weight silently renormalised away** — and because unaided recall
is always lower than aided recognition, dropping it did not add noise, it
**inflated** the score. The inflated version was publishable to the public
showcase.

**Fixed** by `_deterministic_brand_counts()`: unaided mentions are now counted
from the raw text without the LLM (normalised casefold, exact match first, then a
longest-unambiguous-token fallback). The AI pass is now an *enhancement* —
catching misspellings, transliteration and nicknames — not the difference between
having a score and not having one. `normalization_basis` records which produced
each count, and the payload carries a `normalization` summary.

Measured on the same 120 respondents: awareness delta **30–51 pts → 0.0 pts**,
BES delta 0.0, tier unchanged, coverage identical with and without the AI pass.
The deterministic count reproduced ground truth exactly (42.5 % vs 42.5 %).

### S2 · A competitor's mentions can no longer be credited to the focal brand

The old attribution used plain substring matching. A focal brand whose name is a
substring of a competitor's absorbed the competitor's mentions. The new matcher
attributes only on an exact normalised match, or to the **longest unambiguously
matching** brand token. Verified: with brands `Kaffe` / `Kaffe Prime`, ten
"Kaffe Prime" answers go to Kaffe Prime and five "Kaffe" answers to Kaffe.

### S3 · The AI-insights payload was malformed and blind to Loyalty

`_ai_master_insights` serialised `questions[:20]` whole and sliced it at 6000
chars. Two silent consequences: with realistic Thai free text the payload reached
**21,928 chars** and the slice cut the JSON mid-string (verified: `json.loads` on
the truncated blob raises), and because the questionnaire runs awareness → quality
→ identity (~22 items) → loyalty, the `[:20]` slice **could never reach a single
Loyalty question**. Insights were written for a brand whose loyalty the model had
never seen.

**Fixed:** a compact per-dimension-balanced digest (max 6 questions per
dimension), serialised whole — 3,071 chars on the same data, valid JSON, all four
dimensions represented. It now also carries sample adequacy, per-dimension α and
the measured-dimension list, with prompt rules forbidding confident conclusions
about a dimension that is unmeasured, unreliable, or resting on a thin sample.

---

## Still open

Real, reproduced, and not yet fixed:

1. **Segment/wave slices reuse whole-sample normalisation**, so an 80% → 10%
   awareness collapse between waves can still report an attenuated delta. (S1
   reduces this — the deterministic count is computed per slice — but the AI
   cache is still resolved at whole-sample level.)
2. **No inferential statistics.** Brand-vs-competitor and wave/segment gaps are
   raw point differences presented as directional findings, while the wizard
   promises "30+ จุดต่อ segment สำหรับ statistical significance". Per-item 95 %
   CIs now exist (`score_100_ci95`) but nothing tests a *difference*.
3. **Respondent UX**: 36 required-heavy questions, no way back from the last
   screen, no mobile layout (NPS tap targets ≈ 26px), no attention check.
7. **Jargon** (T2B, B2B, NET Q-SCORE, σ) is defined nowhere, including in the
   appendix that claims to explain every score.
8. **"AI GENERATION COMPLETE"** is shown for a questionnaire produced entirely by
   static template substitution.
9. The **image radar** plots a required focal item (n = 100) and an optional
   competitor item (n = 3) as equal polygons and exposes no n; radar and loyalty
   bars still use the mean/max normalisation the code's own comment calls broken.
10. The methodology appendix links to a **weight editor that does not exist** and
    documents a comparative-score formula the code does not use (up to 33 points
    apart on the same answers).

Items 1–2 are backend work with a clear shape; 3–10 are frontend and are the
larger remaining block. None of them silently corrupts a published score any
more — that class of defect is now closed.

**Tests:** `backend/tests/test_brand_equity_audit_2026_08.py` — 49 passing.

---

## Note on thesis export

It already existed and works — `thesis_renderer.py` + `be_thesis_ai.py` (5 AI
chapters) + `be_thesis_charts.py` + `be_thesis_appendix.py`, wired to
`BrandEquityDashboardPage.jsx`. Verified end-to-end: a 60-respondent synthetic
study renders a 40 KB DOCX with 9 tables and APA-7 citations. It is **collapsed by
default and gated behind `can_export_thesis`**, which is why it looks absent.

It was not rebuilt. It was made honest — which mattered more, because it inherits
every number the audit above corrected.
