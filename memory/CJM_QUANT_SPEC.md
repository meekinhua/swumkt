# SWUMKT — Quantitative Customer Journey Module (Markov CJM)

**Final buildable specification, v2.**
Supersedes v1. Every finding raised in the method critique (M1–M46) and the build/usability critique (B-A1…B-F10) is dispositioned in **Appendix A**; the numbered resolutions are woven into the body, not appended to it.

**Calibration:** median study is **R ≈ 100 Thai respondents**, mobile, non-probability, self-selected. Observed mean path length in simulation is **L̄ ≈ 4.0**, not 5 — every cap and every recruitment number below is derived from L̄ = 4.

**One-line summary of what changed from v1.** The transition mask no longer touches the data; unobserved journey endings became an explicit third absorbing state instead of a silent MCAR assumption; the ICC design-effect was deleted and replaced by a count you can point at; the order test was re-derived; the priority quadrant stopped classifying against a sample-relative line; and the two competing "what to fix" rankings collapsed into one decision rule with tiers instead of ranks.

---

## 0. The one-paragraph design

Fit **one first-order absorbing Markov chain per study** over a locked vocabulary of 5–7 Thai journey steps plus `START` and **three** absorbing states — `ซื้อ/สำเร็จ (CONV)`, `เลิกสนใจ (ABANDON)` and `ไม่ทราบปลายทาง (UNKNOWN)`. Collect each respondent's route by aided-recall checklist → one-step-at-a-time branching → tap-to-edit replay, never by free recall and never by HTML5 drag. Estimate each row by **Dirichlet-smoothed MLE on the observed data with no mask applied** (α₀ = 1 spread over all m+3 destinations). Put a **respondent-level cluster bootstrap** (B = 2000) around the whole pipeline, with **BCa** intervals on the three quantities that drive decisions and percentile intervals elsewhere. The map's primary weight is the **expected-loss decomposition L\*ⱼ**, an exact algebraic identity that splits 100% of *observed* lost customers across the displayed steps; the mass that went to `UNKNOWN` is shown beside it as a **Manski bound**, never redistributed. "What to fix" is **one** ranked action list, tiered by paired-bootstrap dominance on the counterfactual Δⱼ; the priority quadrant is a picture of *why*, not a second ranking. Level B (new product, no comparator) reuses the identical machinery with absorbing labels stored **as data** and the chain describing the customer's current coping journey. One blocking gate — held-out predictive skill — decides whether the weighted map renders; the order-1-vs-order-0 test is reported honestly as *usually not evaluable at R ≈ 100* and can only ever veto, never authorise. If the gate fails, the module renders route frequencies and says so in Thai.

---

## 1. Verified codebase facts

Re-verified in this repository for v2. Corrections to v1 are marked.

| Claim | Status |
|---|---|
| `backend/lib/ipma_analysis.py::normalize_scores` L9–22 rescales on **sample** min/max; `determine_quadrant` hardcodes `importance_threshold = 50` / `performance_threshold = 50` while its own docstring says "using median as threshold" | ✅ confirmed, **and the docstring contradicts the code**. Do not reuse. |
| Zero occurrences of `bootstrap / wilson / p_value / permut / confidence` in `ipma_analysis.py`, `nca_analysis.py`, `fsqca_analysis.py` | ✅ confirmed |
| `backend/survey_dsl.py` (460 lines) has 8 question types, none sequential or branching; `_parse_demographics` accepts an arbitrary `fields` list with no vocabulary and no blocklist; `_parse_settings` randomises options without persisting the realised order | ✅ confirmed. **Not a prerequisite for this module** — see §7.6. |
| No PDPA/consent scaffolding anywhere in `backend/` (only hit is vendored `opencv.js`) | ✅ confirmed — **platform-wide gap**, not journey-specific |
| `backend/server.py:371` creates `analysis_cache` with `unique=True` on **`(study_id, method)` only** — `filter_sig` is absent — while `backend/routes/conjoint.py:4895` upserts on `{study_id, method, filter_sig}` with no exception handling | ✅ **confirmed. This is a live latent DuplicateKeyError in conjoint's second filter slice.** The journey module must not touch this collection (§7.1). |
| `get_brand_equity_routes(db, get_current_user, get_optional_user)` at `brand_equity.py:2469` — third parameter is **`get_optional_user`** (v1 said `get_current_user_optional`; that name belongs to `get_conjoint_routes` at `conjoint.py:2810`) | ✅ corrected |
| Reusable helpers: `_parse_segments_param` L443, `_apply_response_filter` L497, `_segments_available` L524, `_filter_signature` L537, `_likert_stats` L1029, `_holm_adjust` L1690, `_welch_t_test` L1647, `_json_safe` L1594 | ✅ confirmed |
| `analysis_cache` + schema-version + `ThreadPoolExecutor` + `asyncio.wait_for` offload pattern at `conjoint.py` L4822–4912 | ✅ confirmed (pattern reusable; collection is not) |
| `numpy 2.3.4`, `scipy 1.16.3`, `pandas`, `statsmodels`, `scikit-learn` present in `backend/requirements.txt`; frontend has `recharts@3.5.0`, no d3 | ✅ confirmed — no new dependency |
| `frontend/src/pages/brand-equity/BrandEquityRespondentPage.jsx` (819 lines) already implements localStorage + server drafts, `?draft=` resume, `duration_sec`, section-stepped navigation, th/en toggle | ✅ confirmed — **this**, not `SurveyTakingPage.js`, is the model for the respondent page |
| `frontend/src/pages/CustomerJourneyTool.js` (1078 lines) holds its result in React state; `POST /generate-journey-map` (`server.py:3504`) is stateless and persists nothing | ✅ confirmed — seeding needs a persistence path (§7.4) |

---

## 2. What is measured, and how it is collected

### 2.1 Design-time objects (locked before fielding)

| Object | Source | In the pooling hash? |
|---|---|---|
| `analysis_level` = `product` \| `solution` | owner, at creation | yes |
| State vocabulary `T` (5–7 Thai step names, stable ids) | LLM **proposes** → student **edits** → system **locks** | ids: yes · labels: no |
| `stage` tag per step (`pre`/`purchase`/`post`; Level B: job-map step) | student, LLM pre-fills | ids: yes |
| `owner` tag per step (`brand`/`partner`/`customer`/`social`) — **Level A** | student, required radio, no default | yes |
| `substitutability` per step (`replaceable`/`assistable`/`fixed`) — **Level B** | student, required radio | yes |
| `feasibility` per step (`high`/`med`/`low`/`unknown`) | student, **locked before any result is shown** | no |
| `expected_transitions` matrix `A ∈ {0,1}` | LLM proposes → student confirms | **no — advisory only, see §2.6** |
| Absorbing labels (`conv_label_th`, `abandon_label_th`) | template by level, editable | ids: yes |
| Pain-option list per step (≤6 + อื่น ๆ) | LLM proposes → student confirms | option ids: yes |
| `planned_next_state_id` per step (optional) | student, locked before results | no |
| Recall window `W` (30/90/365 days) | student picks by category | yes |
| `structure_hash` | system | — |

**Two hashes, not one** *(resolves M37, M38, B-D6, B-D7)*:

```
structure_hash  = SHA256( ordered state ids ‖ stage ids ‖ absorbing ids ‖
                          question ids ‖ question types ‖ option ids ‖
                          scale point-counts ‖ recall_window_days ‖ analysis_level )
content_revision = integer, incremented on ANY label / wording / helptext edit
```

`structure_hash` is the **only** pooling key. A Thai typo fix bumps `content_revision`, is logged with a diff visible in the methodology appendix, and **does not split the sample**. `state_vocab_version` from v1 is deleted — it was subsumed. Brand names live in `subject.name` and are **not** hashed, so two studies of two brands built from the same template share a hash and `/compare` works *(resolves M38)*.

**Design-time caps** (`GET /budget-estimate` hard-blocks, in code):

```
m ≤ 10 always.
R_target <  120  →  m ≤ 5  (warning, overridable with advisor sign-off)
R_target 120–250 →  m ≤ 7
R_target >  250  →  m ≤ 10
```

The R-derived caps are **advisory at design time and re-evaluated against realised R at analysis time** *(resolves M30)*. If realised `R < 120` while `m ≥ 6`, `/analysis` emits `sample_adequacy.cap_shortfall` and the Thai copy names it. The `m ≤ 10` bound is hard everywhere.

**Decision (state granularity).** The chain runs over steps/touchpoints, not over the three Lemon–Verhoef stages. `stage` is a layout column and grouping attribute; `owner`/`substitutability` is an action-partition attribute. Neither is a second chain.

### 2.2 The three absorbing states

v1 had two absorbing states and a censoring flag, which forced a choice between fabricating rows, dropping states, or blocking the map *(M3)*, and quietly assumed censoring was MCAR *(M43, B-C6)*. v2 replaces both with an observed state.

```
CONV     ซื้อแล้ว / ทำสำเร็จ
ABANDON  เลิกสนใจ / ยอมแพ้
UNKNOWN  ไม่ทราบปลายทาง
```

Everything that in v1 was "censoring" becomes an **observed transition into `UNKNOWN`**:

| Respondent event | Recorded as |
|---|---|
| chose `จำลำดับไม่ได้` at step *t* | `x_t → UNKNOWN` |
| chose `ยังตัดสินใจอยู่` | `x_t → UNKNOWN` |
| hit the 12-transition cap | `x_12 → UNKNOWN` |
| abandoned the survey mid-branch (partial submit) | `x_last → UNKNOWN` |

Consequences, all of them intended:

1. **Every visited state has `n_i· ≥ 1`.** The `n_i· = 0` row that broke v1 cannot occur. A state that *nobody visited* is removed from the transient set (its `v_j = 0` identically, so removing it changes no other number) and reported as `"ไม่มีผู้ตอบผ่านขั้นนี้"`.
2. **`(I − Q)` is always invertible** without relying on the mask or on a lucky ABANDON count, because α₀ > 0 puts mass on `UNKNOWN` in every row.
3. **No MCAR assumption is made anywhere.** Missing endings are not redistributed; they are counted.
4. **Every conversion quantity is reported with a Manski bound** (§3.7).

### 2.3 The instrument, item by item — Level A (product / competitor)

**Budget model** (`backend/lib/journey_budget.py`, one source of truth, unit-tested — *resolves M32, B-C1, B-C2*). All constants are mobile-inclusive; there is no separate ×1.3 factor.

| Control | Expected seconds |
|---|---|
| page transition (network + render, Thai 4G, React SPA) | **0.6 per screen** |
| PDPA consent screen: read + 3 separate opt-ins | **45** |
| single-select ≤6 options | 7 |
| single-select 7–12 options | 10 |
| multi-select over K options | 4 + 1.2K |
| branch screen (single-select over \|V_r\|+5) | 11 |
| grid screen overhead | 5 |
| grid row, 2 cells (difficulty + emotion) | 7 |
| grid row, 1 cell | 4 |
| grid row, 1 cell, long statement (ODI) | 5 |
| 0–10 slider | 7 |
| short optional open text (skippable, not autofocused) | 12 |
| incident open text ≤300 chars, when shown | 50 |
| replay screen | **25.2** = 0.7 × 6 (confirm) + 0.3 × 70 (edit) |

**Reference Level-A instrument, m = 6, L = 4, 1.3 pain nominations, incident shown to 65%:**

| # | Block | Screens | Scored items | Sec |
|---|---|---|---|---|
| C1 | **Consent** — PDPA notice + participation (required) + recontact (optional) + linkage (optional). Never bundled. | 1 | 0 | 45.0 |
| S1–S2 | **Episode anchor** — `"ครั้งล่าสุดที่คุณ <หมวด> คือเมื่อไร"` banded (≤7 วัน / 8–30 / 1–3 เดือน / 3–12 / นานกว่านั้น / ไม่เคย), screen-out beyond `W`; plus an **optional, non-autofocused** free-text memory cue on the same screen, PII-scrubbed, never analysed *(resolves B-C3)* | 1 | 1 | 19.0 |
| S3 | Which brand/shop? single-select (Level B: problem screener instead) | 1 | 1 | 10.0 |
| Q1 | **Aided-recall checklist** over the m locked steps, randomised within stage block, block order fixed, plus `"ไม่ได้ทำขั้นไหนเลย"` and `"อื่น ๆ (ระบุ)"`. Yields `V_r`. | 1 | 1 | 13.6 |
| Q2 | **Anchored first step** — options = `V_r` (+ escape). This is the `START` row. | 1 | 1 | 7.0 |
| Q3–Qk | **Branching**, `"หลังจาก <X> แล้วคุณทำอะไรต่อ"`. Options = `V_r` ∪ {`ทำ <X> ซ้ำอีกครั้ง`, `ซื้อแล้ว`, `เลิกสนใจ`, `ยังตัดสินใจอยู่`, `จำลำดับไม่ได้`, **`ทำอย่างอื่นที่ยังไม่ได้เลือก`**}. END options ranked mid-list. **Cap 12 transitions** (was 8). Exactly one screen carries the logic trap. | 4.0 | 4.0 | 44.0 |
| Q10 | **Replay & correct** (§2.5) | 1 | 1 | 25.2 |
| G1 | **Per-step experience grid** — visited steps only, ≤5 rows/screen: `ความยุ่งยาก` 1–5 and `ความรู้สึก` −1/0/+1. For abandoners the abandon step is asked **first**. | 1 | 8 | 33.0 |
| P1 | **Pain nomination** — multi-select over `V_r` | 1 | 1 | 8.8 |
| P2–P3 | **Pain depth** for the ≤2 nominated steps — severity 0–10 + pain-category multi-select. Conditional; never compared across steps. | 1.3 | 2.6 | 25.2 |
| P6 | **Critical incident** — optional open text, shown only if any step nominated, placed late | 0.65 | 0.65 | 32.5 |
| O1–O2 | Outcome confirm (ซื้อ / เลิกสนใจ / ยังตัดสินใจอยู่) + ความพึงพอใจโดยรวม 0–10 (descriptive only) | 1 | 2 | 14.0 |
| D1–D6 | **Segments** — (1) ประสบการณ์กับหมวดนี้ · (2) บทบาทตัดสินใจ · (3) ช่องทางหลัก · (4) ช่วงอายุ (5 bands) · (5) ภูมิภาค (**province max**) · (6) one study-specific banded item. Behavioural first, demographic last. | 2 | 6 | 42.0 |
| — | page transitions, 18 × 0.6 | — | — | 10.8 |
| | **Total** | **18.0** | **29.3** | **330.1 s = 5.5 min** |

**T̂ p75 ≈ 512 s (8.5 min), T̂ p95 ≈ 900 s (15 min)** using the standard right-skew multipliers 1.55 / 2.7, which are stored as constants and displayed.

**Hard block** in `GET /budget-estimate`: `T̂_median > 480 s` **or** `scored items > 34` **or** `screens > 24` **or** `m > 10`. The reference instrument passes with 31% time headroom, and the block **does** fire on realistic overshoots (m = 7, L = 6, 3 nominations → T̂ ≈ 470 s and 33 items; m = 8 → block). A unit test asserts `budget_estimate(reference_instrument) == 330 ± 15 s` and `screens == 18`; the documented figure and the computed figure cannot drift apart.

**Also captured silently:** per-screen timing (ms, winsorised at p99 before use), **displayed option position for every option** (and it is *used* — §5.4), randomisation seed, `structure_hash`, `content_revision`, `backnav_count`, `late_additions[]`.

### 2.4 The `V_r` escape hatch

v1 made a step forgotten at Q1 permanently unreportable *(M34, B-C8)*. v2:

- Every branch screen carries **`ทำอย่างอื่นที่ยังไม่ได้เลือก`**, which opens the full state list minus already-chosen, adds the pick to `V_r`, and appends the state id to `late_additions[]`.
- The replay editor's **insert** draws from the **full** state list, not `V_r`.
- `late_addition_rate` is a reported diagnostic. Above 15% the study owner is told the Q1 checklist wording is losing steps.

### 2.5 The replay editor — complete interaction spec

This is the only genuinely new widget. v1 left its semantics unspecified *(B-D2, B-D3, B-F5)*; they are fixed here and `JourneyPathBuilder.jsx` must implement exactly this.

**State:** `draft_path: [state_id]` (ordered, repeats allowed, max 12) plus `terminal ∈ {CONV, ABANDON, UNKNOWN}`.

**Layout:** a **vertical** numbered chip list (not a horizontal strip — thumb reach on mobile). Each chip carries its ordinal, the Thai label, and two 44 px controls: `✕` remove and `⊕` insert-after.

| Action | Semantics |
|---|---|
| `✕` at index *i* | remove chip *i*, renumber. If the path empties, return the respondent to Q2. |
| `⊕` at index *i* | bottom sheet listing **all m states**; one tap inserts at *i+1*. Repeat for multiple inserts. |
| reorder | **not supported by drag.** Reorder = remove + insert. Stated in the Thai helptext. |
| terminal chip | fixed final chip with a single `เปลี่ยน` control reopening the outcome choice. |
| `ถูกต้องแล้ว` | explicit confirmation; required. |

**Precedence, stated once and enforced in code:** the **confirmed replay is the sole source of truth** for `path`. Branch-screen answers are retained as `path_raw` for diagnostics only. Any edit sets `replay_edited: true` and appends to `edit_ops[]`.

**Editing does not invalidate quality metadata.** `trap_hit`, per-screen timings and `option_positions` measured attention at the moment those screens were shown and are kept as measured *(resolves B-D2's third question)*.

**A confirmed replay containing a transition the `expected_transitions` matrix forbids is kept in full and counted in full.** It is recorded in `mask_violations[]` and nothing is discarded *(resolves B-D3, and see §2.6)*.

**Resume mid-branch** *(resolves B-D4)*: `journey_response_drafts` stores the **full navigation state**, not a flat answers dict:

```jsonc
{ "answers": {...}, "draft_path": ["s3","s1","s3"], "branch_cursor": "s3",
  "screen_index": 7, "V_r": ["s1","s3","s5"], "late_additions": [],
  "rng_seed": 8812345, "option_positions": {...}, "terminal": null,
  "structure_hash": "...", "updated_at": "..." }
```

Resume rehydrates from `draft_path` + `branch_cursor` directly; branch screens are **not** replayed.

### 2.6 The mask never touches the data

v1 zeroed respondent-reported transitions that an LLM-proposed matrix disallowed, then renormalised — changing `p̃`, `N`, `v_j`, `L_j` and every downstream number on LLM authority, while §7 claimed "the LLM produces no number" *(M36 — the sharpest violation of house standards in v1; **accepted in full**)*.

**v2 rule: estimation runs on the observed data with no mask applied. There is no zeroing anywhere in the pipeline.** The matrix is renamed `expected_transitions` and its role is declared in the schema as `"instrument_and_diagnostic_only"`. Its three remaining jobs:

1. ordering options on branch screens (plausible successors first),
2. locating the single logic-trap option,
3. producing `mask_violation_rate` — a **study-design diagnostic**. Above 5%: `"ลำดับที่ผู้ตอบรายงานไม่ตรงกับที่คุณคาดไว้ — ให้ทบทวนแผนภาพขั้นตอน ไม่ใช่ตัดข้อมูลผู้ตอบทิ้ง"`. Zero effect on any number.

Trap-screen responses are **excluded from the `mask_violation_rate` denominator** *(resolves B-C7 — otherwise a 5–10% trap-hit rate manufactures the warning on every study)*.

Two further consequences, both good: the diagonal-mask ambiguity evaporates (**self-transitions are always estimable** — *resolves B-D1*), and the order-0 null becomes well-defined again (§4.1 — *resolves M1's first half*).

### 2.7 Handling messy responses

| Situation | Rule |
|---|---|
| `จำลำดับไม่ได้` at step *t* | `x_t → UNKNOWN`. Interior transitions up to *t* count. Respondent still counts in prevalence. |
| `ยังตัดสินใจอยู่` | `x_t → UNKNOWN`. Same treatment. |
| `ไม่ได้ทำขั้นไหนเลย` at Q1 | path = `START → terminal` directly. Their outcome **is** represented in `B[START,·]` *(resolves B-C9)*. Recorded as route `NONE`. |
| Fewer than 2 steps reported | Kept. Contributes to the `START` row and the outcome. Never discarded. |
| Transition contradicting `expected_transitions` | **Kept and counted.** Logged to `mask_violations[]`. |
| Self-transition `i→i` | **Kept** — it is the rework signal that makes `N[j,j] > 1`. Flag `p̂_ii > 0.5` as a probable coding artefact. |
| Hit the 12-transition cap | `x_12 → UNKNOWN`. `cap_rate` reported. At L̄ = 4 this is rarely binding, so the long loopy tail — the journeys that justify a Markov model at all — survives *(resolves B-C5)*. |
| Unordered set of touchpoints | Cannot arise: the branching instrument always yields an order. v1's `unordered_rate` field is **deleted** *(resolves M33)* and replaced by `set_consistency_rate` (§5.4). |

### 2.8 Careless-response battery

Four flags; **exclusion only on ≥2 *applicable* flags**, never on one.

1. **Logic trap** — the one implausible transition offered in the branching block.
2. **Straight-lining** — `IRV = 0` or `LongString ≥ ⌈0.8 × rows⌉`, computed across **all** scored grid/scale rows in the response (G1 + segments + ODI). **Applicable only when the response contains ≥6 such rows**; otherwise reported as `not_applicable` *(resolves M40 — at median L = 4 this flag was inert in v1 and silently reduced the battery to three)*.
3. **Speeding** — per-screen `RRT = t_p / median_ref(t_p) < 0.5`; flagged if >50% of screens flagged or total < 0.4 × `median_ref_total`.
4. **Outcome conflict** — branch terminal ≠ O1 answer.

**Reference medians are frozen** *(resolves M39)*. At the first `/analysis` run with `R ≥ 50`, the study stores `quality_reference = {median_total_sec, median_page_ms{}, frozen_at_R, frozen_at}`. They are recomputed only on explicit owner action, which is logged and surfaced in Thai. Results are therefore **monotone in n and reproducible**. The realised exclusion set is persisted in the analysis-cache row as `diagnostics.exclusions.respondent_ids` alongside `rng_seed`.

`diagnostics.exclusions.applicable_flags` reports how many of the four were evaluable, so "≥2 of 3" is never silently presented as "≥2 of 4".

**Mandatory sensitivity re-run:** the map is recomputed with and without exclusions; the payload states whether any displayed transition moved beyond its own CI half-width. Above 10% exclusions: blocking warning — *fix the instrument, do not keep deleting*.

**Rejected:** the bogus-foil / over-claiming item — ethics-committee risk on a product an SME may actually be building, burns a checklist slot, and needs n ≥ 50 before its own false-positive rate stabilises. Recognition-induced over-claiming is named as a limitation in the Thai methodology text instead.

### 2.9 Level B (new solution, no comparator)

Structurally two-wave. A single-wave Level-B instrument would require inventing touchpoints for a product that does not exist; an LLM doing that is load-bearing fabrication.

**Wave 0 — vocabulary discovery (n = 15–30, ~5 min).** One free-list prompt with order preserved. Human merges synonyms (Thai free lists fragment on spelling). Smith's salience:

```
S_j = (1/N) · Σ_{r : j ∈ list_r} (L_r − rank_rj + 1) / L_r
```

Retain `S_j ≥ 0.10` or the top 7, whichever is smaller. Stop when new distinct items per additional respondent fall below 5% over the last 5 respondents. Retained items are tagged to the eight universal job-map steps (define / locate / prepare / confirm / execute / monitor / modify / conclude); the tagging is a **human judgement, displayed as such**.

*Cite:* **Smith (1993), *Cultural Anthropology Methods* 5(3), 1–3; Smith & Borgatti (1997), *J. Linguistic Anthropology* 7(2), 208–209** *(resolves M27 — v1 used this index for a blocking gate with no citation at all)*.

**Wave 1 — the same instrument**, four substitutions:

1. **State vocabulary = Wave-0 coping steps, cap `m ≤ 7`** (was 5). v1's `m ≤ 5` plus a hard 10% "อื่น ๆ" block had **no exit condition** — a genuinely unmet need has heterogeneous coping behaviour by definition, and more Wave-0 rounds cannot compress 9 true steps into 5 *(M15)*.
2. Absorbing labels become `แก้ปัญหาได้ (RESOLVED)` and **`ยังไม่สำเร็จภายใน W วัน (NOT_RESOLVED_IN_W)`** — not "ENDURED", not "absorbed". The quantity is right-censored at `W` and is named as such in the payload, the Thai copy and the methodology page *(resolves M17)*. `UNKNOWN` is unchanged.
3. `S3` becomes a problem screener; the screen-out rate is reported.
4. P2–P3 and the emotion column are dropped; **ODI opportunity items on ≤5 outcome statements** are added (`Imp_j`, `Sat_j`, each 1–5). Outcome statements follow `[ทิศทาง] + [หน่วยวัด] + [สิ่งที่ควบคุม] + [บริบท]` and are rejected by a validator containing a solution-noun blocklist (`แอป`, `เว็บ`, `ระบบ`, `บริการของเรา`, …).

**Level-B closure check — graded, not a trap** *(resolves M15, B-C11)*:

```
other_rate = (# respondents choosing "อื่น ๆ" on the Wave-1 checklist) / R
block the weighted map only if  Wilson_lower_95(other_rate) > 0.10
```

Blocking on the point estimate against a threshold the CI straddles (at R = 100, x = 10 the Wilson interval is [0.055, 0.174]) fails studies at random. And the block now has a **defined exit**: after one further Wave-0 round, if closure still fails, the study proceeds as a **model-free Level-B study** — routes, reach, burden and ODI, no chain — which is a shippable, honest outcome rather than an infinite loop.

**Level-B budget** (same constants): drop P2–P3 (−1.3 screens, −2.6 items, −25.2 s), drop P6 (−0.65, −0.65, −32.5 s), grid loses the emotion column (−4 items, −12.0 s), add two ODI grid screens of 5 long-statement rows each (+2 screens, +10 items, +60.0 s).

**Level B total: 18.1 screens, 32.1 scored items, 320.4 s = 5.3 min.** Passes the 34-item / 480-s block *(resolves M19 — v1's Level B was blocked by its own generator)*.

**Level-B ownership partition** *(resolves M16)*. At Level B the brand-owned partition is empty by construction, and a student handed an empty "คุณแก้เองได้" column reads it as a failed study. The Level-B action table is therefore partitioned by **`substitutability`**, declared per step at design time:

| Partition | Reads as |
|---|---|
| `replaceable` | ผลิตภัณฑ์ของคุณเข้าไปแทนขั้นนี้ได้เลย |
| `assistable` | ผลิตภัณฑ์ของคุณช่วยให้ขั้นนี้ง่ายขึ้นได้ |
| `fixed` | ขั้นนี้แทนไม่ได้ — ต้องออกแบบให้อยู่ร่วมกับมัน |

### 2.10 PDPA — shared platform infrastructure, Phase 0b

Nothing exists today, and the gap is **platform-wide**: Brand Equity already collects demographics from public respondents with no consent object *(B-A3)*. Building consent only inside the journey module would leave the existing exposure untouched, create two consent implementations, and make the new module look like the risky one.

**`backend/lib/consent.py` + `backend/routes/consent.py` are shared, and `BrandEquityRespondentPage.jsx` is retrofitted in the same PR.**

- **Consent object**, stored before question 1: `{controller (มหาวิทยาลัย + ชื่อผู้วิจัย + อาจารย์ที่ปรึกษา), purpose, data_items[], retention_months ≤ 24, rights (เข้าถึง / แก้ไข / ถอนความยินยอม / ร้องเรียน), contact, version}`.
- **Three separate opt-ins**, never bundled: participation (required) / recontact / account linkage.
- **Generator blocklist — hard reject, not warning** — on PDPA s.26 special categories: เชื้อชาติ, ความคิดเห็นทางการเมือง, ศาสนา, พฤติกรรมทางเพศ, ประวัติอาชญากรรม, ข้อมูลสุขภาพ, ความพิการ, สหภาพแรงงาน, ข้อมูลชีวมิติ. This also closes the open `fields` list at `survey_dsl.py::_parse_demographics`.
- **Banded values only.** No birthdate, no exact income, no address below province.
- **`respondent_token`** — 128-bit random, stored on the response, shown once on the thank-you screen with a copy button and a Thai instruction to keep it for withdrawal *(resolves M44, B-D5)*.
- **Recontact contact details live in a separate collection `journey_recontacts`, keyed by `respondent_token`**, so deleting a contact is independent of deleting a response, and the response document itself never carries contact data.
- **`k = 10` scope, stated explicitly** *(resolves M45, B-D8)*: applies to **every shared, exported or showcased view**. On the owner's own dashboard (they are the data controller) small cells are shown but hatched. The segment map's ≥25-respondent floor and the per-cell `r_j ≥ 10` rule therefore do not conflict — they govern different surfaces.
- **`export-responses`** applies generalisation on any non-owner or shareable path: province → region, page timings dropped, free text PII-scrubbed and truncated. The owner's own raw export is watermarked with the study id and a Thai retention notice *(resolves M44's third clause)*.
- **Withdrawal** — `DELETE /journey/public/{share_token}/withdraw/{respondent_token}` hard-deletes the response, the draft and any recontact row, and invalidates the cached analysis rows for the study.
- **Retention job** that actually runs, on `retention_months`.

This is a compliance *design*, not legal advice. The university DPO and the human-research ethics committee must approve the consent text; `publish survey` is gated on an `advisor_signoff` flag, which requires a supervisor role in the auth model — **a dependency that does not exist today and must be scheduled**.

---

## 3. Estimation — every formula

Notation: `S = {START} ∪ T ∪ {CONV, ABANDON, UNKNOWN}`, `|T| = m`. Transient set `Tr = {START} ∪ T`, size `m+1`. Destination set `D = T ∪ {CONV, ABANDON, UNKNOWN}`, size `m+3` (nothing ever enters `START`).

### 3.1 Counts and the denominators that are actually displayed

```
n_ij = Σ_r Σ_t 1[x_{r,t}=i ∧ x_{r,t+1}=j]     pooled transition counts
n_i· = Σ_j n_ij                                row total
r_i  = # DISTINCT respondents contributing ≥1 exit from i     ← the gate quantity
m̄_i  = n_i· / r_i                              ← REWORK statistic, displayed as such
n_j^visit = # respondents who ever visited j
n_j^exp   = # respondents who answered the experience item at j
```

**`DEFF_i` and `n_eff,i` are deleted from the design** *(resolves M6, B-B3)*. v1 defined `n_eff` as `n_i·/(1 + (m̄_i−1)ρ_i)` with `ρ_i` an "intra-respondent ICC of the next-state indicator" and made it the gate that drives everything. Three reasons it had to go, all conceded:

- the next state is **multinomial**; ICC is undefined for a categorical outcome, and v1 never said which binarisation to use;
- it is estimable only from respondents with ≥2 exits from `i`, which at a well-designed 5–7 step journey is 10–20% of the sample — a noisy `ρ̂` in the **denominator** of the gate that decides what renders;
- measured in simulation at the calibration point: `m̄ = 1.00–1.33`, `DEFF = 1.00–1.06`. In practice `ρ̂` fails to estimate, defaults to 0, and the module ships `n_eff = n` under a name asserting a design-effect adjustment was applied. **That is a statistic claimed but not computed — the exact failure the two prior audits exist to stop.**

Replacements, all of which are things we actually have:

- **`r_i` is the suppression gate.** Exactly interpretable, exactly what a committee asks for.
- **`m̄_i` is displayed as rework**, not as a design effect: `"ผู้ตอบที่ผ่านขั้นนี้ ทำซ้ำเฉลี่ย 1.3 ครั้ง"`.
- **`deff_boot_ij = Var_boot(p̃_ij) / [p̃_ij(1−p̃_ij)/n_i·]`** is computed as a free by-product of the bootstrap and reported as a **diagnostic only**. It is internally consistent with the intervals actually displayed, because it is derived from them. It never enters a gate.

The dependence that actually matters — one respondent contributing to *several different rows*, correlating `v_j`, `B` and `L_j` across the whole map — is invisible to any within-row design effect and is handled correctly by the cluster bootstrap.

*Cite:* Kish (1965), *Survey Sampling* — for the concept, cited in the methodology page as the reason the bootstrap resamples people.

### 3.2 Point estimator — Dirichlet-smoothed MLE, unmasked

```
p̂_ij = n_ij / n_i·                                          raw MLE, stored

p̃_ij = (n_ij + α₀/|D|) / (n_i· + α₀),   α₀ = 1.0, |D| = m+3   ← used downstream
```

α₀ = 1.0 is **total** prior mass per row spread over **all** destinations — one pseudo-observation per row, not one per cell. Jeffreys (α = 0.5 per cell) is rejected: at m = 7 it injects 5 pseudo-observations into a row that may hold 20 real ones.

The smoothing is load-bearing engineering: `α₀ > 0` guarantees `p̃[j,ABANDON] > 0` and `p̃[j,UNKNOWN] > 0` for every transient `j`, which guarantees certain absorption, which guarantees `(I − Q)` is invertible. It also means **`B[START,CONV] > 0` in every bootstrap replicate**, so v1's "discard replicates with zero converters and redraw" — which conditions on ≥1 converter and biases the distribution upward — is **deleted** *(resolves B-B10)*. Non-finite replicates cannot occur; if one does, it is dropped and **counted in the payload**.

**Naming discipline (non-negotiable given this codebase's history):** the Dirichlet is a **smoothing prior, not a sampler**. The word **MCMC must not appear anywhere** — code, comments, UI copy, methodology page, thesis export. There is no sampler, no burn-in, no chain, and therefore nothing that can silently fail to run.

*Cite:* Anderson & Goodman (1957), *Ann. Math. Statist.* 28(1), 89–110. Gelman et al. (2013), *Bayesian Data Analysis*, 3rd ed., Ch. 2–3.
*Min n:* display a row at `r_i ≥ 10`; a number on an edge at `r_i ≥ 25`; base a recommendation on `r_i ≥ 60`.

### 3.3 Absorbing-chain core

Order `P = [[Q, R],[0, I]]`, `Q` = `(m+1)×(m+1)` transient→transient including `START`, `R` = transient→{CONV, ABANDON, UNKNOWN}.

```
N       = (I − Q)^{-1}
v_j     = N[START, j]        expected visits to j before absorption
reach_j = N[START, j] / N[j, j]      ← P(ever reach j)          ← NODE SIZE
revisit_j = N[j, j]                  ← E[visits | reached]      ← REWORK BADGE
B       = N·R
B[j, CONV]                    P(reach CONV eventually | now at j)
t       = N·1                 expected remaining steps
var(t)  = (2N − I)t − (t ∘ t)
```

**`v_j` is split** *(resolves M13)*. v1 used `N[START,j]` as node size and glossed it as "customers revisit this step 2.3 times", which is only true when `P(reach) = 1`: a step reached by everyone once and a step reached by half the sample twice both give `v = 1.0`. The identity `N[i,j] = h_ij · N[j,j]` makes the decomposition exact and free. **Node size is `reach_j`** — "how many people go through here" — and `revisit_j` is a separate rework badge. `v_j` stays in the payload because `L_j` is defined on it.

**`Lift_j = B[j,CONV] − B[START,CONV]` is deleted from the product** *(resolves M12)*. It is guaranteed positive for any late step purely because reaching `j` means not having abandoned yet; the Thai gloss `"ผู้ที่มาถึงขั้นนี้ มีโอกาสซื้อสูงกว่าค่าเฉลี่ย"` stays grammatically correlational while being structurally survivorship, and every reader converts it to "push people to step j". `B[j,CONV]` remains, labelled `"ในบรรดาผู้ที่มาถึงขั้นนี้ มีสัดส่วนเท่าไรที่ไปถึงการซื้อ"` with a permanent caption that later steps are mechanically higher.

**Pre-flight assertions, raised in production code, not only in tests:**
- every transient state reaches an absorbing state (reachability walk) — else return a structured error dict, never a garbage inverse;
- `spectral_radius(Q) < 1` and `cond(I − Q)` below threshold;
- every row of `P̃` sums to 1 within 1e-9.

*Cite:* **Grinstead & Snell (1997), *Introduction to Probability*, 2nd ed., §11.2, Theorems 11.4–11.6** as the primary, freely downloadable reference; Kemeny & Snell (1976), *Finite Markov Chains*, 2nd ed., **Ch. 3 (cited by chapter — theorem numbering differs between the 1960 Van Nostrand printing and the 1976 Springer UTM reprint, so v1's "Thm 3.2.4 / 3.3.7" must not be reproduced in a thesis without checking the physical edition)** *(resolves M28)*.

### 3.4 Low-information rows stay in the chain, and we say so

A row with `r_i < 10` is hidden from the matrix view and its edges render dashed-unlabelled — but **it still contributes to `N`**, because the chain needs a complete `Q`. v1 hatched such nodes as "no data" while using them, which is house standard #1 violated by omission *(M3)*.

v2 does three things instead:

1. **The row is real, not fabricated.** With `UNKNOWN` absorbing (§2.2) every visited state has genuinely observed exits — worst case, all of them into `UNKNOWN`. Nothing near-uniform is ever invented.
2. **The Thai copy is accurate:** `"ข้อมูลน้อย (ผู้ตอบ 7 คน) — ตัวเลขบนลูกศรถูกซ่อน แต่ยังถูกใช้ในการคำนวณ"`.
3. **`low_information_row_sensitivity`** — for each such row, recompute `N` with that row's mass routed entirely to `UNKNOWN`, and report how far `B[START,CONV]` and the top-ranked `L*` move. If either moves beyond its own CI half-width, the payload raises `sensitivity_flag: true` and the dashboard says the map depends materially on a step almost nobody reported. Cost: one extra inversion of a ≤10×10 matrix per low-information row.

### 3.5 Expected-loss decomposition — the primary CJM weight

From `B = N·R`, expand the ABANDON column. **Exact algebraic identity, not a model claim:**

```
B[START, ABANDON] = Σ_{j ∈ Tr} v_j · q_j          q_j = p̃[j, ABANDON]
L_j     = v_j·q_j / B[START,ABANDON]              Σ_{j∈Tr} L_j = 1  BY CONSTRUCTION
Loss_j  = 100 · v_j · q_j                          expected losses per 100 entering
```

**The plotted and ranked quantity is `L*`, renormalised over the displayed touchpoint set `D_plot`** *(resolves M5)*:

```
D_plot = { j ∈ T : r_j ≥ 10 and n_j^exp ≥ 10 }
L*_j   = L_j / Σ_{k ∈ D_plot} L_k                 Σ_{j ∈ D_plot} L*_j = 1
crosshair_x = 1 / |D_plot|                        ← exact mean of L*, by construction
excluded_loss_share = 1 − Σ_{k ∈ D_plot} L_k      ← PRINTED beside the axis
```

v1's crosshair was `1/m` against a sum running over `m+1` transient states including `START`, minus any suppressed state — off by 30–40% of its own value at the calibration point, which is the difference between `แก้ก่อนเลย` and `ปล่อยไว้`. Renormalising over exactly the plotted set makes `1/|D_plot|` exactly the mean of exactly the plotted quantity.

`L_START` — losses from people who reported doing nothing at all — is reported **separately** as `"หลุดก่อนเริ่มเส้นทาง"`, because it is real but is not a fixable touchpoint.

Alongside it, from the same identity applied to the `UNKNOWN` column:

```
U_j = v_j · u_j / B[START, UNKNOWN]     u_j = p̃[j, UNKNOWN]
```

`U_j` is displayed as **"ข้อมูลขาดที่ขั้นนี้"** — where recall broke. A step with a large `U_j` is where the instrument, not necessarily the product, is failing.

**Runtime assertion, in production code:** `abs(Σ_{j∈Tr} v_j·q_j − B[START,ABANDON]) < 1e-9`. If the identity fails, the map does not render.

Reads in Thai with no statistical vocabulary: `"จากลูกค้าที่หายไป 100 คน มี 34 คนหายไปตอนขั้นเปรียบเทียบราคา"`.

`L*` separates two failure types a raw drop-off rate conflates: a step is high-loss either because `q_j` is brutal, or because everyone passes through it repeatedly. **`reach_j`, `revisit_j` and `q_j` are displayed side by side** — that is the difference between "fix the step" and "stop routing people through it."

*Cite:* algebraic consequence of the fundamental matrix (Grinstead & Snell §11.2); framing per Lemon & Verhoef (2016), *J. Marketing* 80(6), 69–96.
*Min n:* see the unlock condition in §3.6.

### 3.6 Abandon observability — a measured gate, not a self-declared one

`L*` is the primary weight and is unmeasurable in a buyers-only sample. v1 gated on `abandoners ≥ 20` **and** `≥15% of sample` **and** a `sampling_frame.reaches_non_buyers` boolean the study owner sets themselves. The share condition punishes a well-recruited R = 400 study with 50 abandoners (12.5%) while passing a self-selected complainer sample at 60%, and a gate authored by the party who wants the output is not a gate *(M42, B-D10)*.

**v2 unlock condition for `L*`, `Δ`, and the priority views:**

```
abandoners ≥ 20
AND  for every step entering the displayed ranking:  CI95_halfwidth(q_j) ≤ 0.15
```

Both are measured from the data. `sampling_frame` survives as a **required free-text description that is printed on every export, showcase page and thesis appendix** — disclosure, not gate.

**Buyers-only handling is explicit** *(resolves B-D11)*:

- **Automatic detection:** `abandoners / R < 0.05` ⇒ `frame_class: "buyers_only"`, regardless of what was declared.
- **Warning at study creation**, in Thai, before a single response is collected, with a required acknowledgement: `"ถ้าคุณเก็บข้อมูลจากลูกค้าที่ซื้อแล้วเท่านั้น เครื่องมือนี้จะบอกไม่ได้ว่าลูกค้าหลุดหายไปที่ขั้นไหน"`.
- **The fallback is fully specified and does not collapse:** routes, `reach_j`, `revisit_j`, `Burden_j`, pain incidence, `U_j`, and the ODI block at Level B. **`B[j,CONV]` is suppressed** in a buyers-only sample because it is ≈1 by construction and would read as a finding. No composite is substituted.

### 3.7 Manski bounds on every conversion quantity

Because `UNKNOWN` is observed rather than imputed, the honest statement about conversion is an interval over the two extreme allocations of that mass:

```
B_lo[START,CONV] = B[START,CONV]
B_hi[START,CONV] = B[START,CONV] + B[START,UNKNOWN]
bound_width      = B[START,UNKNOWN]
```

Displayed always, at any level of `UNKNOWN` mass — v1's "above 25% censoring, call it an upper bound" implied unbiasedness below 25%, which was never true *(resolves M43, B-C6)*. Thai: `"อัตราการซื้อที่วัดได้อยู่ระหว่าง 21% ถึง 29% — ช่วงกว้าง 8 จุดนี้มาจากผู้ตอบที่จำปลายทางไม่ได้"`. The width of the bound is itself the recall-quality diagnostic.

*Cite:* Manski (2003), *Partial Identification of Probability Distributions*, Springer, Ch. 1–2.

### 3.8 Counterfactual improvement

Pick step `j` and improvement fraction `δ` (default 0.25, slider capped at 0.5):

```
f = δ · q_j                                  freed mass
p_new[j, ABANDON] = (1 − δ) · q_j
p_new[j, UNKNOWN] = u_j                      unchanged — fixing a step does not fix recall
p_new[j, k]       = p̃[j,k] · (1 + f/(1 − q_j − u_j))    for all k ∉ {ABANDON, UNKNOWN}
Δ_j(δ)     = B_new[START,CONV] − B[START,CONV]          percentage points
Δrel_j(δ)  = Δ_j(δ) / B[START,CONV]                      relative lift
```

Row sum verified: `(1−q_j−u_j)(1 + f/(1−q_j−u_j)) + (1−δ)q_j + u_j = 1`. Proportional redistribution is a **stated modelling choice**, not a discovery.

Computed **inside** the bootstrap loop, so it ships with an interval for free.

**Report both scales** *(resolves B-B6)*. Measured single-step effects at the calibration point are **0.87–2.22 percentage points** — structurally small, because in a leaky chain freed traffic re-leaks. v1's illustrative "3.1 จุด" oversold it, and an unmotivating pp figure guarantees every student maxes the δ slider. Thai copy:

> `"ถ้าลดการหลุดที่ขั้นเปรียบเทียบราคาลง 25% ยอดซื้อน่าจะเพิ่มขึ้น 2.2 จุด (ช่วง 0.9 ถึง 4.1) — คิดเป็นประมาณ +11% ของยอดซื้อปัจจุบัน"`

Plus a **tier-level combined counterfactual**: apply `δ` simultaneously to every step in action tier 1 and report `Δ_tier1`, computed identically. Larger, still honest, and it is the number an SME can act on.

Two mandatory static Thai captions:

- `"เป็นการคำนวณแบบสมมติจากโมเดล ไม่ใช่การพยากรณ์ยอดขาย"`
- `"การจัดอันดับนี้สมมติว่าทุกขั้นปรับปรุงได้ยากง่ายเท่ากัน ซึ่งในความเป็นจริงไม่เท่ากัน"` *(resolves M11 — equal-δ smuggles equal cost)*

The student's pre-declared `feasibility` tag **sorts within a tier** and is displayed, but never enters a computed number. Partition, do not weight.

Report the **CI of the magnitude**, never `P(Δ > 0)` — which is ≈1 by construction and would be theatre.

### 3.9 Removal effect — secondary, explicitly non-causal

```
P^(−i): row i replaced by a unit vector on ABANDON (the touchpoint becomes a dead end)
        — NOT deleted-and-renormalised; this is where most reimplementations go wrong
RE_i = 1 − B^(−i)[START,CONV] / B[START,CONV]     ∈ [0,1]
```

Kept because a Thai supervisor will expect the citation, and because it is `m` extra inversions of a ≤10×10 matrix. **Demoted to a collapsed "advanced" panel** — it degenerates to exactly 1.0 for any mandatory step, rises mechanically with traffic, does not sum to anything before an arbitrary normalisation, and is routinely misread as causal. The v1 normalisation `w_i = RE_i/ΣRE_k` is **removed** rather than labelled a convention.

**Fixed Thai disclaimer, static string, never LLM-generated:**
`"ค่านี้บอกว่าจุดสัมผัสนี้อยู่ในเส้นทางที่นำไปสู่การซื้อบ่อยแค่ไหน ไม่ได้บอกว่าถ้าตัดออกแล้วยอดขายจะลดลงจริงเท่านี้"`

**Degeneracy detector:** if `RE_i = 1.0` because every respondent passes through `i`, the UI says so rather than crowning `ชำระเงิน` the most important touchpoint in every study ever run.

*Cite:* Anderl, Becker, von Wangenheim & Schumann (2016), *IJRM* 33(3), 457–474. Reference implementation: `ChannelAttribution::markov_model()` (CRAN). On the causal gap: Blake, Nosko & Tadelis (2015), *Econometrica* 83(1), 155–174; Lewis & Rao (2015), *QJE* 130(4), 1941–1973.
*Min n:* ≥30 converters **and** ≥30 abandoners, `r_i ≥ 25` in and out. Displayed unranked unless the ordering survives the paired-difference rule of §5.2.

### 3.10 Uncertainty — one machinery

**Respondent-level cluster bootstrap**, with the Dirichlet smoothing used *inside* each replicate as the estimator.

```
for b in 1..B:
    resample R respondents WITH REPLACEMENT (clusters = people, never transitions)
    rebuild n_ij^(b) → p̃^(b) (α₀ = 1, unmasked)
    recompute EVERYTHING: N, reach, revisit, B, L*, U, Δ, Δrel, RE, t, Burden, quadrant
```

- `B = 2000` for the unfiltered slice; `B = 800` for filtered slices; `B = 500` when `R < 50`; removal effects use a **400-replicate** subsample. **The `B` actually used is printed next to every interval.**
- **Fixed RNG seed, stored with the result**, so a student reproduces their own numbers in a thesis appendix.
- No replicate is ever discarded and redrawn (§3.2).

**Interval type:**

| Quantity | Interval |
|---|---|
| `L*_j`, `Δ_j`, `B[START,CONV]` | **BCa** — jackknife acceleration over the R respondents, ≈100 extra fits, ~5% overhead on a budget already being paid |
| everything else derived from the chain | percentile |
| simple respondent-level proportions (route share, visit incidence, pain incidence, `other_rate`) | **Wilson score**, integer `n` |

BCa for the three decision quantities *(resolves the percentile-coverage objection in the method critique's Part B)*: `L*_j` is a bounded, skewed ratio of products of a matrix inverse with mass near 0 for rare states — precisely the regime where percentile intervals under-cover. "It was simpler" is a weak answer to a committee when the acceleration term costs 100 jackknife fits.

**Wilson takes raw, integer respondent counts and nothing else** *(resolves M4)*. v1 instructed `n = n_eff`; since `n_eff < n`, any `x/n > 1/DEFF` makes `x(n−x)/n` negative and the formula returns `NaN` — and the substitution was a category error besides, since Wilson is used only on respondent-level proportions where each respondent contributes exactly once. The formula is the standard one:

```
centre = (x + z²/2)/(n + z²)
half   = z/(n + z²) · √( x(n−x)/n + z²/4 ),   z = 1.96
```

**Wald intervals are banned outright.** They collapse to zero width at `p̂ ∈ {0,1}`, manufacturing false certainty at exactly the sparse cells that dominate here.

**Measured cost** (numpy 2.3.4): base bootstrap with masked-free Dirichlet estimation + inversion + loss decomposition ≈ **1.4 s** at B = 2000, m = 6, R = 100. With per-step counterfactuals, BCa jackknife and 400-replicate removal effects: **10–20 s**. Runs in the existing `ThreadPoolExecutor` + `asyncio.wait_for(timeout=120)` pattern.

*Cite:* **Efron & Tibshirani (1993), *An Introduction to the Bootstrap*, Ch. 8 ("More complicated data structures")** for the resampling unit — *not* Ch. 12–14, which are the jackknife and interval construction; **Davison & Hinkley (1997), *Bootstrap Methods and Their Application*, §3.8** for clustered resampling; **Efron (1987), *JASA* 82(397), 171–185** and **DiCiccio & Efron (1996), *Statistical Science* 11(3), 189–228** for BCa; Field & Welsh (2007), *JRSS-B* 69(3), 369–390; Wilson (1927), *JASA* 22(158), 209–212; Brown, Cai & DasGupta (2001), *Statistical Science* 16(2), 101–133. *(resolves M26)*
*Min n:* below `R = 30` the bootstrap distribution is lumpy — suppress all derived quantities rather than showing a jagged interval.

### 3.11 Pain — the comparable axis is `Burden`

```
Per step j, over VISITORS of j only:
  n_j^visit, n_j^exp     (both displayed, alongside R and r_j)
  diff_j    = mean difficulty, 1–5
  Burden_j  = 100 · (diff_j − 1)/4          ∈ [0,100]   ← POMP on SCALE ENDPOINTS
  CI95      = mean ± t_{.975,n−1}·s/√n, then transformed
  emo_j     = mean emotion, −1..+1
  f_j       = proportion nominating a problem at j, Wilson CI
  sev_j     = mean severity | nominated      ← CONDITIONAL, never compared across steps
```

**The axis is named `Burden_j` everywhere — in the payload, the code, the UI and the methodology page. It is never called "performance."** v1 called the same quantity "pain" in §3.1 and "performance: 0–100" in §4.1, planned to reuse a React quadrant component built for IPA semantics (high-y = good), and planned to reuse `_likert_stats`, which carries a `reverse` flag whose entire purpose is this inversion — three artefacts at one seam, two assuming opposite polarity. High `Burden` = high difficulty = bad. `_likert_stats` is called with `scale_max=5, reverse=False` and a comment saying why *(resolves M7's second half)*.

The **1–5 difficulty grid asked of every visited step** is the comparable performance axis. The 0–10 severity item asked only of respondent-nominated worst steps is a **conditional, selected measure**, displayed as colour and annotation only, always captioned `"จากผู้ที่เลือกขั้นนี้ว่ามีปัญหา (m = …)"`. Ranking on a selected mean is the mistake this rule exists to prevent.

**Two different biases, two different names** *(resolves M41)*:

| Bias | Mechanism | Mitigation | Measured by |
|---|---|---|---|
| within-survey item non-response at the abandon step | break-off before the grid | abandon step's experience item asked **first** for abandoners | `n_j^exp / n_j^visit` per step, reported |
| under-recruitment of abandoners | frame problem — abandoners never enter the sample | none available inside the instrument | abandoner count/share + §3.6 gate + the printed frame description |

v1 named the second and mitigated the first under one label.

**Why not CES 2.0:** rejected for v1 and v2. It duplicates the difficulty item, its agree/disagree 7-point format attracts documented acquiescence bias in Southeast Asian samples, it is semantically invalid on self-directed steps (`ถามเพื่อน`, `หาข้อมูลใน TikTok`), and it is structurally invalid at Level B where no company exists.

*Cite:* Cohen, Cohen, Aiken & West (1999), *Multivariate Behavioral Research* 34(3), 315–346 (POMP); Martilla & James (1977), *J. Marketing* 41(1), 77–79.
*Min n:* `n_j^exp ≥ 10` to plot (hatched, no label); `≥ 20` for a quadrant label; `≥ 30` to enter the action list.

### 3.12 Segments

**Pre-declared only. Maximum 3 per analysis. Never discovered by clustering.** Restricting `_segments_available` to declared segment fields also bounds the filter-signature space, which is what makes the compute budget in §7.5 tractable.

**Partial pooling with a leave-one-group-out target** *(resolves M25)*:

```
p̃^(g)_ij = ( n^(g)_ij + κ · p̃^(−g)_ij ) / ( n^(g)_i· + κ )
λ^(g)_i  = n^(g)_i· / ( n^(g)_i· + κ )
κ = 10, FIXED and documented
```

`p̃^(−g)` is fitted on **all respondents not in group g**. v1 shrank group A toward a pooled estimate that contained group A — at G = 2 with equal sizes, toward roughly (A+B)/2 — attenuating the very difference being examined.

**Display uses the shrunk estimate; every comparison uses the unshrunk `p̂^(g)`.** Stated in the payload as `comparison_basis: "unshrunk"`.

κ is **fixed, not estimated by empirical Bayes**: at G ≤ 3 and R ≈ 100 a Brent search on the Dirichlet–multinomial marginal likelihood is unstable, and an exposed prior-strength knob is a footgun for a non-statistician. `λ^(g)_i` is **displayed per row**, which turns a statistical necessity into a legible guard rail: `"เซกเมนต์นี้ใช้ข้อมูลตัวเอง 38% ที่เหลือยืมจากภาพรวม"`. Unshrunk `p̂^(g)` and `n^(g)_i·` on hover.

Segments defined by the **outcome itself** (buyer vs non-buyer) are **excluded from pooling**.

**Comparing two segments or two studies — one rule everywhere** *(resolves M24)*:

```
Difference of any quantity X:  point = X^A − X^B
                               CI95  = BCa percentiles of (X^A(b) − X^B(b)) over PAIRED replicates
Claim allowed iff the CI excludes 0.
```

v1 required a CI excluding zero **and** a bootstrap frequency ≥ 0.90 — which is strictly weaker than the CI condition (equivalent to ≥ 0.975) and adds nothing, while contradicting §2.6's own correct refusal to report `P(Δ > 0)`. **`bootstrap_freq` is removed from the payload entirely.** One rule: paired-difference CI.

**The Anderson–Goodman homogeneity test is a diagnostic, never a verdict.**

```
Λ_H = 2 Σ_g Σ_{i∈T} Σ_j n^(g)_ij · ln( p̂^(g)_ij / p̂_ij )
df  = (G−1) · Σ_{i∈T} (b_i − 1)     b_i = # destinations with a nonzero column marginal in row i
```

Worked: G = 2, m = 6, b_i = 9 for all rows ⇒ **df = 1 × 6 × 8 = 48**. v1's prose said 84, its payload said 84, and its stated formula `(G−1)·m·(m−1)` gives 42 — three numbers, no two agreeing *(resolves M21)*. At 48 df on ~400 transitions the test is hopelessly underpowered, and its non-rejection would be read by a student as "the segments are the same."

**Lead with the effect size:** per-row total variation `TV_i = ½ Σ_j |p̂^A_ij − p̂^B_ij|`, with Holm correction across the rows tested (reuse `_holm_adjust`, `brand_equity.py:1690`), and the number of comparisons run stated on screen.

*Cite:* Gelman & Hill (2007), *Data Analysis Using Regression and Multilevel/Hierarchical Models*, Ch. 12; Anderson & Goodman (1957); Agresti (2013), *Categorical Data Analysis*, 3rd ed.
*Min n:* segment map renders at **≥25 respondents** with pooling; unpooled at ≥50; a difference claim needs ≥40 per segment and a paired CI excluding 0.

### 3.13 Planned-vs-actual deviation (Phase 4)

Where the student declared `planned_next_state_id` **before results were shown** (UI lock):

```
TV_i = ½ Σ_j |p̃_ij − p*_ij|  ∈ [0,1]
```

Computed only for steps with a declared plan and `r_i ≥ 20`. Always paired with `Burden_i`, because `TV` is a distance, not a direction: off-plan-and-fine is a discovery, off-plan-and-painful is a defect.

*Cite:* Halvorsrud, Kvale & Følstad (2016), *J. Service Theory and Practice* 26(6), 840–867.

### 3.14 Level-B opportunity score

```
Imp_j = 10 · (top-2-box importance) ;  Sat_j = 10 · (top-2-box satisfaction)
Opp_j = Imp_j + max(Imp_j − Sat_j, 0)     ∈ [0,20]
```

Wilson on each proportion; `Opp_j` interval by bootstrap (it is non-smooth at the kink, so delta-method SEs are unreliable). Ulwick's 10/12/15 bands are **practitioner heuristics, not sampling thresholds** — a band label never appears without its CI.

**Stated up front, not discovered in Phase 5** *(resolves M18)*: at R ≈ 100 with 5 statements, `Opp_j` intervals will usually overlap. The ODI panel therefore renders as a **band chart with overlapping intervals visible** and, when the top two overlap, prints the verdict `"แยกอันดับข้อได้ไม่ชัดเจนที่ขนาดตัวอย่างนี้"`. That is the expected Level-B headline and it is honest.

**`Opp_j` and `L*_j` are never combined into one ranking.** They live in different spaces. The stated reading rule, in the methodology page: `L*` answers *where the coping journey breaks*; `Opp` answers *which outcome matters most*. They are read together only as a qualitative step × outcome table.

*Cite:* Ulwick (2002), *HBR* 80(1), 91–97; Ulwick & Bettencourt (2008), *MIT Sloan Management Review* 49(3), 62–68; Bettencourt & Ulwick (2008), *HBR* 86(5), 109–114.
*Min n:* ≥60 per statement as an absolute floor with prominent uncertainty; ranking is honest at ≥100. Outcome-based segmentation is **not built** (needs ~150+).

---

## 4. Model gates

### 4.1 Gate A — order-1 vs order-0 (diagnostic; can veto, never authorise)

Because the mask no longer touches the data (§2.6), the order-0 null `p_ij = p_·j` is back inside the model space and the likelihood-ratio statistic is well-defined. Two further corrections:

```
Rows      = T only.  START IS EXCLUDED.
Table     = a' × b' after deleting any row or column with a zero marginal
            (a' ≤ m rows, b' ≤ m+3 destinations)
Λ₁        = 2 Σ_{i∈T} Σ_j n_ij · ln( p̂_ij / p̂_·j )
df        = (a' − 1)(b' − 1)
```

At m = 6 with all destinations observed: **df = 5 × 8 = 40**, not 25.

**Why START must be excluded, with numbers.** On data generated from a chain with *literally zero memory* — every transient row identical, the exact thing this gate exists to catch — at R = 100:

| variant | Λ | df | p | outcome |
|---|---|---|---|---|
| START included, df = 42 | 83.9 | 42 | 0.00013 | **rejects → gate "passes" → weighted map renders on memoryless data** |
| START included, v1's df = 25 | 83.9 | 25 | 2.7e-08 | rejects harder |
| **START excluded, df = 35** | **36.2** | **35** | **0.41** | correct: no rejection |

Nothing ever transitions *into* `START`, so its row is structurally guaranteed to differ from the pooled marginal; including it manufactures rejection. Both of v1's errors pushed the same way — toward rendering the map.

**Evaluability is per cell, measured, never a closed form** *(resolves M23, B-A1)*:

```
evaluable  ⟺  ≥80% of cells in the reduced a'×b' table have expected count ≥ 5
```

v1's `≈5(m−1)²` converted a per-cell criterion into a total-N criterion and understated the requirement by more than 2×. **Measured fraction of cells meeting the criterion, m = 6:** R = 100 → 72%, R = 150 → 78%, **R = 200 → 84% (first pass)**. So at the design's own calibration point Gate A is **not evaluable**, and the module says exactly that:

> `"ข้อมูลของคุณยังไม่พอที่จะทดสอบว่าลำดับขั้นตอนมีรูปแบบจริงหรือไม่ (ผ่านเกณฑ์ 72% จากที่ต้องการ 80%) — การทดสอบนี้มักใช้ได้เมื่อมีผู้ตอบประมาณ 200 คนขึ้นไป"`

**Gate A's role is asymmetric and stated as such:** when evaluable *and* non-significant, it **blocks** the weighted map (the sequence shows no memory). When not evaluable, it **abstains** — no p-value is emitted, `p: null`. It can never be cited as evidence *for* the Markov property. The v1 claim in §0 that "two hard gates decide whether the weighted map renders at all" is corrected throughout: **there is one blocking gate.**

The measured evaluability curve above is reproduced in `JourneyMethodology.jsx`.

*Cite:* Anderson & Goodman (1957); Bickenbach & Bode (2003), *Int. Regional Science Review* 26(3), 363–392.

### 4.2 Gate B — held-out predictive skill (the blocking gate)

```
5-fold CV over RESPONDENTS (never over transitions)
LL_test    = Σ_{r∈test} Σ_t ln p̃_{x_t, x_{t+1}}       (fit on train folds only)
PPL        = exp(−LL_test / M)
Skill      = 1 − PPL_markov / PPL_order0
PASS  ⟺  mean(Skill) − t_{.95,4} · SE_folds  >  0
```

Two corrections from v1:

1. **The order-0 baseline is fitted on the same training folds with the same α₀ smoothing and the same (unmasked) destination set.** With the mask gone this is automatic, but it is stated so no future refactor reintroduces a baseline that spends probability on destinations the Markov model knows are unavailable *(resolves M2's first half)*.
2. **Gate on the lower confidence bound, not the point estimate** — `fold_sd` is already computed and reported *(resolves M2's second half)*.

Measured on a true first-order chain at R = 100, m = 6: **Skill = 0.434, fold SD = 0.051** — the gate does real work and passes comfortably when the structure is real. Requires `R ≥ 40` to evaluate; **below R = 40 no weighted map renders at all** *(resolves M31 — v1's §5.2 rendered a dashed map from R = 30 while the gate was suppressed below 40)*.

**What Gate B actually measures, stated in the payload and the Thai copy** *(resolves M8)*. The branching instrument walks the respondent through a first-order elicitation, one hop at a time, and then this gate asks whether the resulting data are first-order. **The Markov property is in the questionnaire before it is in the customer.** Gate B therefore measures whether the *reconstructed sequences* are internally predictable — not whether behaviour is Markovian. Fixed string, in `journey_copy_th.py` and in `n_disclosure`:

> `"แบบสอบถามนี้ถามทีละขั้น (ทำ A แล้วทำอะไรต่อ) ซึ่งเป็นการชี้นำให้ข้อมูลออกมาเป็นลำดับแบบขั้นต่อขั้นอยู่แล้ว คะแนนนี้จึงบอกว่าลำดับที่ผู้ตอบประกอบขึ้นมามีรูปแบบที่ทำนายได้ ไม่ได้พิสูจน์ว่าพฤติกรรมจริงเป็นแบบมาร์คอฟ"`

Two partial empirical checks are **implemented, not reserved** *(resolves M8's second half)*:

- **Set consistency** — `set_consistency_rate` compares the aided-recall set `V_r` (Q1, collected before any sequencing) with the set implied by the reconstructed path. It does not depend on the branching elicitation at all. A low rate means the elicitation is lossy.
- **Replicate sub-study** — promoted out of "reserved" into Phase 2. A recontact-consented subsample (target ≥25 pairs) retakes the route block; normalised Damerau–Levenshtein similarity is reported. It measures **response-process consistency, not recall accuracy** — but its absence would be decisive. Where fewer than 25 pairs exist, it is reported as **not measured**, never estimated.

### 4.3 Order-2 — computed, reported, never a gate

```
Λ₂  = 2 Σ_{h,i,j} n_hij · ln( p̂_hij / p̂_ij )        ← denominator is the FIRST-ORDER estimate
df  = (P − a')·(b' − 1)      P = # distinct (h,i) pairs observed, a' = # distinct i among them
```

v1's denominator `p̂_jk` shares no index with `n_hij` — a typo inside a block presented as the implementation spec, from which `test_markov_order` would have been written *(resolves M22)*.

At m = 6 with `P` up to 42 and `b' = 9`, the per-cell criterion needs ≈1,900 transitions; R ≈ 100 supplies ≈400. Not evaluable, and the honest output is exactly that:

> `"ข้อมูลของคุณมี 412 ลำดับสามขั้น กระจายใน 378 ช่อง จึงไม่เพียงพอที่จะทดสอบว่าเส้นทางมีความจำเกินหนึ่งขั้นหรือไม่ — โมเดลนี้จึงตั้งสมมติฐานว่าเป็นอันดับหนึ่ง"`

**Non-rejection is never reported as evidence for the Markov property.** And the methodologically important point, stated in the UI: apparent non-Markovian behaviour in journey data is usually **unobserved heterogeneity, not genuine memory** (the mover–stayer confound). The remedy is segmentation — which the brief already requires — not raising the order.

*Cite:* Katz (1981), *Technometrics* 23(3), 243–249 *(pagination differs across indexes; verify against the issue before thesis submission)*; Blumen, Kogan & McCarthy (1955).

### 4.4 One p-value rule, enforced in code

`backend/lib/markov_journey.py::gated_p(statistic, df, evaluable)` returns `None` whenever `evaluable is False`. **No payload field named `p` may be non-null beside `evaluable: false`.** v1 shipped `"homogeneity": {"lambda_h": 96.2, "df": 84, "p": 0.17, "evaluable": false}` — a p-value alongside a flag saying it cannot be evaluated, which the thesis renderer and the AI narrative writer would both have read as "no significant difference between segments" *(resolves M20)*. A unit test walks the serialised payload and asserts the invariant.

### 4.5 Model-free layer — ships first, stands alone

```
route signature σ_r = the ordered path (also reported with immediate repeats collapsed)
share p̂ = x/R with Wilson CI, rendered INLINE, not on hover
coverage = cumulative share of the top-k routes
stage-level signatures = each step mapped to its stage first (compresses the space usefully)
```

Available at `R ≥ 30` with **no Markov assumption whatsoever**, and it is the sanity check on everything downstream: if the fitted chain's highest-probability path is not among the observed routes, the model is wrong and the UI says so.

---

## 5. The weighted CJM

### 5.1 Encoding table

| Channel | Quantity | Formula | Interval |
|---|---|---|---|
| **Node size** | `reach_j` = P(ever reach) | `N[START,j] / N[j,j]` | percentile CI as a lighter ring |
| **Node rework badge** | `revisit_j` | `N[j,j]` | shown when > 1.15 |
| **Node fill** | `Burden_j` | `100·(diff_j−1)/4` | t-CI in tooltip |
| **Node border weight / priority badge** | `L*_j` | `v_j q_j / Σ_{D_plot} v_k q_k` | **BCa** CI in tooltip |
| **Node secondary number** | `B[j,CONV]` | `(N·R)[j,CONV]` | percentile CI + tautology caption |
| **Node "missing" wedge** | `U_j` | `v_j u_j / B[START,UNKNOWN]` | percentile CI |
| **Node hatch** | `r_j < 10` | — | hatch = "ข้อมูลน้อย — ยังถูกใช้ในการคำนวณ" |
| **Edge stroke width** | `p̃_ij`, `w ∝ √p` clamped 1–14 px | §3.2 | — |
| **Edge line style** | certainty band from CI half-width `h` | `h ≤ 0.07` solid + number · `0.07 < h ≤ 0.15` thin solid + `±` · `h > 0.15` **dashed grey, number hidden, excluded from all rankings** | the style *is* the interval |
| **Edge curve below the flow** | self-transitions and backward loops | kept, never deleted | — |
| **Collapsed edge** | Wilson upper bound < 0.05 | grouped as `"อื่น ๆ (รวม X%)"`, **still listed in a table** | — |
| **x position** | `stage` column, fixed order | design-time tag | — |
| **y position** | rank by `reach_j` within column | — | — |

**Two thresholds, two jobs.** `r_j` decides whether a row **renders** (`<10` hidden · `10–24` provisional · `25–59` adequate · `≥60` strong). CI half-width `h` decides **how** it renders. A row with `n = 200` split 50/50 is genuinely uncertain about which way people go; an n-only rule would draw it confidently. Band thresholds (0.07 / 0.15) live in **one config constant**.

Every label carries `n=` inline. Every edge tooltip reads: **`p = .42 [.31, .54] · 88 การเปลี่ยนขั้น จากผู้ตอบ 31 คน · B=2000`**. Colour is never the sole carrier of a band — **dash pattern is primary** (colour-blind safety).

**What R = 100 actually buys, measured** *(resolves B-B1)*. Best case — mask equal to the true generating structure, zero `UNKNOWN`, zero exclusions, 100% completes, m = 6 — of 32 reachable cells: **9 solid with a number (28%) · 17 thin with ± (53%) · 6 dashed, number hidden, excluded from rankings (19%).** With realistic `UNKNOWN` mass and exclusions, roughly a third of the map reads `ยังสรุปไม่ได้`.

The student sees this **before fielding**, not after. `GET /journey/studies/{id}/design-preview` runs 200 synthetic replicates of a plausible chain with the declared `m`, `R_target` and `L̄ = 4`, and returns the expected certainty-band distribution, the expected action-list length, and the expected `Δ` magnitude range. It is rendered as a required screen in the wizard before `lock-instrument`.

### 5.2 Renderer

**Hand-rolled inline SVG in `WeightedJourneyMap.jsx`, laid out from a server-computed payload. No new frontend dependency.** Realistic size: **600–900 lines** — curved self-loops, arrowheads, dash-pattern certainty bands, 44 px touch targets. Budget it as such, not as a footnote.

- **Sankey (recharts `<Sankey>` / d3-sankey) is rejected**: both require a DAG. Real journeys loop, and those loops are precisely what the chain reveals over a static funnel. A Sankey would silently delete the module's main finding.
- **Mermaid is rejected for the quantitative map**: it cannot encode a continuous weight or an uncertainty and re-renders slowly on every filter change. It stays on the qualitative tab.

**Mobile is not a fallback to tables** *(resolves the desktop-only objection)*. Thai students read results on phones; the primary deliverable cannot be desktop-only. Three modes:

| Width | Mode |
|---|---|
| ≥1024 px | horizontal stage-column layout |
| 768–1023 px | same SVG inside `overflow-x: auto`; page body never scrolls horizontally |
| <768 px | **vertical layout mode** — stages become rows, steps stack, edges become short curved connectors with the same encoding; plus a `ดูเต็มจอแนวนอน` fullscreen-landscape toggle |

The mobile tables (top-5 routes with Wilson CIs, per-stage accordion, priority quadrant as a sorted two-column table) remain **in addition** to the map, not instead of it.

---

## 6. How "what to fix" is derived — ONE decision rule

v1 had two authoritative-looking rankings that could disagree with no arbitration: the quadrant's change list (high `L`, high pain) and the action table sorted by `Δ` descending, which ignores pain entirely *(M10)*. Simulation confirmed they do disagree at the calibration point: `L` ranks step 2 (0.272) > step 1 (0.252) > step 3 > step 4, while `Δ(0.25)` ranks step 4 (2.22 pp) > step 3 (1.49) > step 2 (1.44) > step 1 (1.12) — and v1's `Stab_j ≥ 0.70` rule then **greyed out step 4**, the top row of the action table, excluding the secondary view's #1 recommendation on the authority of the primary view *(B-B4, B-B5)*.

### 6.1 The rule, stated once

> **The action list is the decision. The quadrant is the picture of why. The quadrant never removes anything from the action list.**

This sentence appears verbatim (in Thai) at the top of the results page and in `JourneyMethodology.jsx`.

### 6.2 The action list

**Eligibility** — a step appears iff all of:

```
r_j ≥ 20                                    enough respondents exited it
n_j^exp ≥ 30                                enough rated it
abandon-observability unlocked (§3.6)
BCa CI95 of Δ_j(δ) excludes 0
```

**Ordering — tiers, not ranks** *(resolves the method critique's Part B conclusion, M9, M10, B-B4, B-B5, B-B7)*. At R = 100 the honest identifiability statement is: *you can defend "these two steps dominate the loss"; you cannot defend "step A is worse than step B."* v1 shipped `"delta_pp": 3.1, "ci95": [1.0, 6.4], "rank": 1` — a half-width of ±87% of the point estimate, presented as rank 1 — while applying stability rules to `RE` and to quadrant membership but to neither `L*` nor `Δ`, the two quantities the entire "what to fix" story rests on.

```
Step a is placed in a strictly higher tier than step b
    iff  BCa CI95 of the PAIRED bootstrap difference (Δ_a − Δ_b) excludes 0.
Within a tier the display reads  "แยกอันดับไม่ได้ที่ขนาดตัวอย่างนี้"  and shows no 1..m numbering.
```

The same rule governs `RE` ordering and every other displayed ranking. **One rule, everywhere.**

**Columns**, partitioned by `owner` (Level A) or `substitutability` (Level B):

`Δ_j(δ)` pp + CI · `Δrel_j` % + CI · `L*_j` + CI · `reach_j` · `revisit_j` · `q_j` · `Burden_j` + CI · `r_j` · `n_j^exp` · `feasibility` tag · `U_j`.

| Level-A partition | Reads as |
|---|---|
| brand | คุณแก้เองได้ |
| partner | ต้องคุยกับพาร์ทเนอร์ |
| customer | ทำได้แค่ช่วยให้ลูกค้าทำง่ายขึ้น |
| social / external | ทำได้แค่ส่งอิทธิพลทางอ้อม |

**Explicitly NOT computed:** a cross-partition weighted score `Σ w_owner · score_j` with hand-chosen weights — unfalsifiable. **Partition, do not weight.**

**Explicitly NOT computed:** a single composite priority index (`Exposure × Damage`, `L × (1−perf)`, FMEA `S×O×D`). One seductive number hides which factor drives it, has no sampling distribution, and would be cited by students as if it were a literature construct.

### 6.3 The empty action list — a designed state, not an accident

At R = 100, `L*` CI widths run 0.09–0.19 against a crosshair at ~0.17, and four of six steps' intervals straddle it. **The modal outcome is an action list with one row, two rows, or none.** v1 never said what the UI shows then; that is the worst student experience the design can produce *(B-B7, B-D9)*.

`results.priority.action_list_state ∈ {"populated","single","empty"}`. When `empty`, the dashboard renders, in this order:

1. The fixed Thai statement: `"ที่ขนาดตัวอย่างนี้ ยังแยกไม่ได้ว่าขั้นไหนควรแก้ก่อน — นี่เป็นผลลัพธ์ที่พบบ่อยและไม่ใช่ความผิดพลาด"`.
2. The **ordering without claims**: steps sorted by `Δ` with all intervals drawn overlapping and no tier badges.
3. **How much more sample would separate the top two**, computed by scaling the paired-difference CI half-width as `√(R_now/R_needed)` until it clears the observed gap, then converted to **link-sends** using the study's realised completion rate: `"ต้องส่งลิงก์เพิ่มอีกประมาณ 120 คน จึงจะแยกอันดับสองอันดับแรกได้"`.
4. The model-free view — routes, `reach`, `revisit`, `Burden`, pain incidence — which is a real, defensible deliverable on its own.

### 6.4 The priority quadrant — a picture, with an absolute y-axis

```
x = L*_j          share of DISPLAYED lost customers attributable to step j
y = Burden_j      0–100, from scale ENDPOINTS
bubble radius ∝ √n_j^exp
x-crosshair = 1 / |D_plot|      exact mean of L* by construction
y-crosshair = 50                ABSOLUTE scale midpoint (difficulty 3 of 5)
y-reference = grand mean of Burden_j, drawn as a dotted secondary line, LABELLED, never used to classify
```

**Why the y-crosshair moved to an absolute anchor** *(resolves M7, B-B8)*. v1 correctly rejected `ipma_analysis.py::normalize_scores` for rescaling against the sample min/max — and then set the quadrant's y-crosshair to the grand mean of `Burden_j` across steps, which is the same defect one layer up: half the steps are always above the line, so **"every step is fine" and "every step is painful" are both unrepresentable in the labelling**. And the labels are what feed the partition table and the copy. Classification is now on the absolute scale; the grand mean is drawn as context.

Quadrants in plain Thai:

- high `L*`, high burden → **แก้ก่อนเลย**
- high `L*`, low burden → **ปัญหาเชิงโครงสร้าง** (people leave here without saying it hurts — usually routing, price or fit)
- low `L*`, high burden → **แก้ให้กลุ่มเล็ก**
- low `L*`, low burden → **ปล่อยไว้**

`Stab_j` = fraction of bootstrap replicates in which `j` lands in its point-estimate quadrant, is still computed and still greys the **label on the picture** below 0.70 — but **it no longer removes anything from the action list**. Requires `m ≥ 4` for the crosshairs to mean anything.

**The v1 claim that the two axes come from independent measurement is deleted** *(resolves M14)*. Same respondents, same session, and a direct mechanical link: a respondent who found step `j` hard is likelier to have abandoned at `j`, raising both `Burden_j` and `L*_j`. The axes are positively correlated by construction, points cluster on the diagonal, and the "high `L*`, low burden" quadrant will be sparse for reasons unrelated to the product. The payload reports the observed cross-step correlation `axis_correlation` and the methodology page names the mechanism.

### 6.5 Redundancy, disclosed

`L*`, `Δ`, `RE`, `reach` and `q` are **five transforms of one 28-parameter fit**, not five independent corroborations *(M9)*. To first order, `Δ_j ≈ δ · Loss_j · c_j` where `c_j` is the continuation rate, and `c_j` varies far less across steps than `L*_j` does — so the action table is largely the quadrant's x-axis re-sorted, and `RE_i` is a monotone function of the same traffic-through-`j` quantity.

Two mitigations, both shipped:

1. `results.redundancy` reports the **bootstrap Spearman rank correlation** between `L*`, `Δ` and `RE` across steps, with its own interval.
2. A static Thai paragraph in `JourneyMethodology.jsx`: `"ตัวเลขเหล่านี้คำนวณจากโมเดลชุดเดียวกัน จึงไม่ใช่หลักฐานสามชิ้นที่ยืนยันกันเอง"`.

Where `L*` and `Δ` disagree (as they do at the calibration point), the fixed explanation is: `"L* บอกว่าลูกค้าหายไปที่ขั้นไหนมากที่สุด · Δ บอกว่าถ้าอุดรอยรั่วตรงนั้นแล้ว คนที่เหลืออยู่จะไปถึงการซื้อได้จริงแค่ไหน — สองคำถามนี้ตอบไม่เหมือนกันเป็นเรื่องปกติ"`.

### 6.6 The qualitative "why"

For the top tier only: coded critical incidents and locked pain-category frequencies at that step, plus an LLM-drafted **service-blueprint hypothesis** for the backstage cause — permanently marked `ข้อสันนิษฐาน — ยังไม่ได้ยืนยัน`, dashed border, and **structurally incapable of feeding any number**.

**Critical-incident coding — the α gate.** An LLM may propose a codebook and do first-pass coding. Displaying **counts** requires Krippendorff's α computed against a **≥20% human double-coded subsample by two distinct human coder ids** (the schema rejects two LLM passes as "coders"):

```
α ≥ 0.80          → display code frequencies as numbers with n
0.667 ≤ α < 0.80  → display as "ประมาณการ", with α printed
α < 0.667         → illustrative verbatim quotes ONLY. No counts. No percentages. Anywhere.
```

Below 15 double-coded units, α is reported as **not computed** — never estimated, never asserted.

*Cite:* Flanagan (1954), *Psychological Bulletin* 51(4), 327–358; Bitner, Booms & Tetreault (1990), *J. Marketing* 54(1), 71–84; Krippendorff (2004), *Content Analysis*, 2nd ed.; Bitner, Ostrom & Morgan (2008), *California Management Review* 50(3), 66–94.

---

## 7. Small n and uncertainty reaching a non-expert

### 7.1 The five mechanisms, in order of importance

1. **`gates.unlocked` in the API payload.** The backend returns an array — `["routes","matrix","map","priority","removal","segments"]` — and the frontend renders **only what is in it**. The honesty rule is enforced in *data*, not in copy a later refactor can drop.
2. **Certainty as a rendering property.** A dashed grey edge labelled `ยังสรุปไม่ได้` communicates more truthfully to a Thai student than `±0.18` does — lay readers systematically misread error bars (Correll & Gleicher 2014, *IEEE TVCG* 20(12), 2142–2151).
3. **Four visible n's, never one.** `R` (respondents) · `n_j^visit` (visited this step) · `r_j` (respondents contributing an exit) · `n_j·` (transitions out). They differ by an order of magnitude on the same diagram and the difference is the point.
4. **Sample-adequacy panel counted in link-sends, not completes** *(resolves B-C4)*. With an S1 screen-out plus a realistic 50–65% completion rate on a 5.5-minute unincentivised mobile survey, R = 100 completes needs ~170–220 starts. v1's `"ต้องการอีกประมาณ 38 คน"` would be wrong by roughly 2×. v2: `"ตอนนี้มีผู้ตอบครบ 62 คน — ต้องส่งลิงก์เพิ่มอีกประมาณ 65 คน (จากอัตราตอบจบปัจจุบัน 58%)"`, using the study's own realised rate once available and 55% before.
5. **The pre-fielding design preview** (§5.1), which shows what R = 100 buys *before* 100 people spend 5.5 minutes each.

### 7.2 Adequacy bands

| Condition | What renders |
|---|---|
| `R < 30` | route counts, visit counts, pain tables. **No percentages on routes, no matrix, no map** |
| `30 ≤ R < 40` | model-free layer with Wilson CIs. **No matrix, no map** — Gate B is not evaluable |
| `R ≥ 40` and Gate B passes | matrix (rows with `r_i ≥ 10`) + weighted map with certainty bands |
| `R ≥ 40` and Gate B fails, or Gate A evaluable-and-non-significant | model-free layer + plain-Thai explanation. **No weighted map** |
| converters ≥ 20 | `B[j,CONV]`, `Δ`, Manski bounds |
| abandoners ≥ 20 **and** every ranked step has `CI½(q_j) ≤ 0.15` | `L*`, priority quadrant, action list |
| converters ≥ 30 **and** abandoners ≥ 30 **and** `r_i ≥ 25` | removal effects (advanced panel) |
| segment ≥ 25 | segment map with pooling, `λ` displayed |
| segment ≥ 40 per group | segment difference claims |

There is no band in which a weighted map renders on an unevaluated gate.

### 7.3 Static Thai guard-rail copy

All disclaimer, band-label and limitation strings live in **one static constants module** — `backend/lib/journey_copy_th.py`, mirrored to `frontend/src/pages/journey/copy-th.js`. **Never generated by an LLM.** A disclaimer that depends on an LLM call is a disclaimer that can silently vanish. `JourneyMethodology.jsx` (modelled on `BeMethodology.jsx`) defines every term in place: what a transition probability is, what "expected visits" means, why `L*` sums to 100%, what a bootstrap interval does and does not cover.

The interval caption, verbatim:

> `"ช่วงความเชื่อมั่นนี้สะท้อนเฉพาะความไม่แน่นอนจากขนาดตัวอย่าง ไม่ได้ครอบคลุมความคลาดเคลื่อนจากการจำของผู้ตอบ จากวิธีถามที่ชี้นำให้ตอบเป็นลำดับ หรือจากการที่เรากำหนดขั้นตอนไว้ไม่ครบ"`

### 7.4 Diagnostics that are computed *and used*

Every diagnostic in the payload drives something visible. Data collected for a correction that is never computed is the same failure class as an asserted statistic that never ran *(B-C10)*.

| Diagnostic | Drives |
|---|---|
| `option_position_effect` — Wilson-CI'd difference in selection rate between top-half and bottom-half displayed positions, on Q1 and the branch screens | warning above 5 pp: `"ลำดับตัวเลือกมีผลต่อคำตอบ"`; reported in the thesis limitations |
| `set_consistency_rate` | elicitation-quality warning; feeds §4.2 |
| `other_rate` (Level A **and** B) with Wilson CI | Level A: warning band + the "อื่น ๆ" free-text strings clustered by frequency, surfaced as a v2 vocabulary input. Level B: the closure gate. *(resolves M35 — v1 collected `"อื่น ๆ (ระบุ)"` at Level A and did nothing with it while calling omitted-state bias "unmeasurable")* |
| `late_addition_rate` | Q1 checklist wording warning |
| `mask_violation_rate` (trap responses excluded) | study-design warning only |
| `cap_rate`, `unknown_rate` | Manski bound width; recall-quality copy |
| `deff_boot_ij` | displayed diagnostic; never a gate |
| `low_information_row_sensitivity` | `sensitivity_flag` on the map |
| `exclusions.applicable_flags` | qualifies the "≥2 flags" rule |

---

## 8. Data model, endpoints, file layout, build order

### 8.1 Mongo collections

```
journey_studies
  { id, owner_id, owner_email (lowercased),
    status: draft|collecting|analyzing|completed|closed,
    analysis_level: "product" | "solution",
    subject:  { name, is_competitor, category, competitors[] },        // level A — NOT hashed
    problem:  { job_statement, current_alternatives[], context },      // level B
    sampling_frame: { description },        // REQUIRED free text, printed on every export/showcase
    frame_class: "mixed" | "buyers_only",   // DERIVED at analysis time, not declared
    recall_window_days: 30|90|365,
    stages:  [{ id, label_th, order }],
    states:  [{ id, stage_id, label_th, owner, substitutability,
                feasibility, planned_next_state_id?, job_map_step? }],
    absorbing: { conv_id, conv_label_th, abandon_id, abandon_label_th,
                 unknown_id: "UNKNOWN", unknown_label_th: "ไม่ทราบปลายทาง" },   // DATA, not hardcoded
    expected_transitions: { matrix: [[0|1]], role: "instrument_and_diagnostic_only" },
    pain_options: { <state_id>: [th, ...] },
    odi_outcomes: [{ id, statement_th, job_map_step }],                // level B
    wave0: { free_list_responses[], salience: {}, closed_at },         // level B
    structure_hash: "<sha256>", content_revision: int,
    content_revision_log: [{ at, by, field, before, after }],
    questions: [...], target_responses, share_token,
    consent: { controller, purpose, data_items[], retention_months, contact, version },
    advisor_signoff: { by, at } | null,                                // gates publish
    quality_reference: { median_total_sec, median_page_ms{}, frozen_at_R, frozen_at } | null,
    qualitative_seed: { qualitative_run_id? , raw_text, mermaid_code, analysis, generated_at },
    ai_cache: {}, ai_cache_by_filter: {}, is_public_showcase,
    created_at, updated_at, deleted_at? }

journey_responses
  { id, study_id, respondent_token: "<128-bit hex>",     // PDPA withdrawal key
    structure_hash, content_revision,
    consent: { participation: true, recontact: bool, linkage: bool, at, version },
    demographics: {...},
    visited: [state_id],                        // Q1 checklist
    late_additions: [state_id],
    path: [{ state_id, order }],                // REPEATS ALLOWED — from the CONFIRMED replay
    path_raw: [{ state_id, order }],            // pre-edit branch answers, diagnostics only
    replay_edited: bool, edit_ops: [...],
    terminal: "CONV"|"ABANDON"|"UNKNOWN",
    terminated_by: "outcome"|"unsure"|"ongoing"|"cap"|"partial_submit",
    outcome: "convert"|"abandon"|"ongoing",
    experience: { <state_id>: { difficulty_1_5, emotion } },
    pain: { nominated: [state_id], <state_id>: { severity_0_10, categories[], note } },
    odi:  { <outcome_id>: { importance_1_5, satisfaction_1_5 } },      // level B
    overall_sat_0_10,
    replicate: { is_replicate: bool, of_token: str, path2: [...] } | null,
    mask_violations: [[i,j], ...],
    quality: { duration_sec, page_times_ms: {}, option_positions: {}, rng_seed,
               longstring, irv, scored_rows, trap_hit, trap_shown,
               outcome_conflict, backnav_count },
    channel: "public_link", started_at, submitted_at }

journey_recontacts          // SEPARATE — contact data never lives on the response
  { respondent_token, study_id, channel, value, consented_at, purge_after }

journey_response_drafts     // full navigation state, see §2.5

qualitative_runs            // NEW, tiny: persists /generate-journey-map output for seeding
  { id, owner_id, raw_text, context, mermaid_code, analysis, created_at }

journey_analysis_cache      // OWN collection — see §8.2
  { study_id, method, filter_sig, schema_version, respondent_count,
    rng_seed, bootstrap_B, results, exclusions_respondent_ids, created_at }
```

**Three schema rules fixed now because they are expensive to change later:**

1. **Absorbing labels are stored as data.** Level A and Level B share one backend module and one renderer; only the vocabulary and the three labels differ.
2. **Raw per-respondent sequences are the source of truth.** The cluster bootstrap cannot run from aggregated counts. Denormalised counts may exist only as an additive cache.
3. **The confirmed replay is the sole source of truth for `path`**; `path_raw` is diagnostic only.

### 8.2 The `analysis_cache` decision

`backend/server.py:371` creates `analysis_cache` with `unique=True` on **`(study_id, method)`** while `conjoint.py:4895` upserts on `{study_id, method, filter_sig}` — so the second filter slice for a study finds no match, attempts an insert, and violates the unique index. Because `safe_create_index` swallows creation failures, the behaviour differs per environment. This is a **live latent bug in conjoint's segment-filtered analysis** *(B-A2)*.

**The journey module creates its own collection `journey_analysis_cache` with `unique=(study_id, method, filter_sig)`.** Rationale: v1's "one-line migration, add a `module` field" would require dropping and rebuilding a unique index on a collection two shipping 4,000–6,000-line modules depend on, with no test-coverage guarantee. A new collection is one line, carries zero risk to shipping modules, and removes the collision concern entirely.

**The conjoint bug is filed separately as a defect** with a proposed fix (rebuild the index as `(study_id, method, filter_sig)` and wrap the upsert). It is **not** in this module's scope and **not** a prerequisite.

### 8.3 REST surface — `backend/routes/journey.py`

```python
journey_router = APIRouter(prefix="/journey", tags=["Customer Journey"])   # → /api/journey/...
def get_journey_routes(db, get_current_user, get_optional_user):           # mirrors
                                                                           # get_brand_equity_routes:2469
```

Registered beside `cv_routes` in `backend/server.py` (~L7992).

```
POST   /journey/studies                        GET  /journey/studies
GET    /journey/studies/trash                  GET  /journey/studies/{id}
PUT    /journey/studies/{id}                   DELETE /journey/studies/{id}
POST   /journey/studies/{id}/restore           DELETE /journey/studies/{id}/purge

POST   /journey/studies/{id}/seed              # body: {qualitative_run_id} OR {raw_text, mermaid_code}
POST   /journey/studies/{id}/regenerate-questions     # preserves question ids across regenerates
GET    /journey/studies/{id}/budget-estimate          # T̂, items, screens; HARD BLOCK above caps
GET    /journey/studies/{id}/design-preview           # 200 synthetic replicates → what R_target buys
POST   /journey/studies/{id}/lock-instrument          # computes structure_hash; advisor gate
POST   /journey/studies/{id}/wave0                    # level B free-list intake + Smith salience

GET    /journey/public/{share_token}           POST /journey/public/{share_token}/respond
POST   /journey/public/{share_token}/draft     GET|DELETE /journey/public/{share_token}/draft/{draft_id}
DELETE /journey/public/{share_token}/withdraw/{respondent_token}    # PDPA hard delete

GET    /journey/studies/{id}/responses         GET  /journey/studies/{id}/export-responses
GET    /journey/studies/{id}/analysis?method=markov_first_order&from=&to=&segments=&force=
GET    /journey/studies/{id}/segment-significance
POST   /journey/studies/{id}/compare           # two studies; requires an explicit state-id mapping

POST   /journey/studies/{id}/ai-analyze        GET  /journey/studies/{id}/ai-status
POST   /journey/studies/{id}/thesis-ai-start   GET  .../thesis-ai-status/{job_id}
GET    /journey/studies/{id}/thesis-ai-download
GET    /journey/showcase                       GET  /journey/showcase/{share_token}
POST   /journey/studies/{id}/share-content
```

**No separate `/journey-map` endpoint** — the render payload ships inside `results.map` of `/analysis`, so one cache row serves the whole dashboard.

**`/compare`** requires an explicit `state_id_map` supplied by the student through a mapping UI. Since brand names are not hashed, two studies built from the same template share a `structure_hash` and compare without a mapping.

### 8.4 `/analysis` response shape

```jsonc
{ "status": "ok", "method": "markov_first_order", "filter_signature": "...",
  "respondent_count": 104, "cached": true, "rng_seed": 20260818, "bootstrap_B": 2000,
  "structure_hash": "...", "content_revision": 3,
  "results": {
    "gates": {
      "order_test":  { "lambda1": 36.2, "df": 35, "p": null, "evaluable": false,
                       "cells_meeting_e5": 0.72, "verdict": "abstain",
                       "role": "can_block_never_authorise", "message_th": "..." },
      "order2_test": { "evaluable": false, "triples": 412, "cells": 378, "p": null, "message_th": "..." },
      "predictive":  { "skill_mean": 0.434, "fold_sd": 0.051, "lower_bound": 0.337,
                       "ppl_markov": 3.1, "ppl_order0": 4.5, "verdict": "pass",
                       "interpretation_th": "..." },
      "abandon_observability": { "abandoners": 41, "max_q_ci_halfwidth": 0.11, "verdict": "pass" },
      "unlocked": ["routes","matrix","map","priority","removal","segments"] },

    "sample_adequacy": { "level": "adequate", "n_resp": 104, "n_transitions": 416,
                         "mean_path_length": 4.0, "completion_rate": 0.58,
                         "rows_suppressed": ["s6"], "link_sends_for_next_band": 0,
                         "cap_shortfall": false, "message_th": "..." },

    "diagnostics": { "rework_by_row": {}, "deff_boot_by_row": {}, "unknown_rate": 0.11,
                     "cap_rate": 0.02, "set_consistency_rate": 0.94, "other_rate": 0.06,
                     "other_rate_ci95": [0.03,0.12], "late_addition_rate": 0.08,
                     "mask_violation_rate": 0.02, "option_position_effect": 0.021,
                     "axis_correlation": 0.61,
                     "low_information_row_sensitivity": { "s6": { "b_conv_shift": 0.004,
                                                                  "top_l_shift": 0.012,
                                                                  "flag": false } },
                     "replicate_reliability": { "pairs": 0, "status": "not_measured" },
                     "exclusions": { "n": 6, "applicable_flags": 3, "flags": {},
                                     "respondent_ids": [...],
                                     "sensitivity": "no displayed transition moved beyond its CI" } },

    "matrix": { "states": [], "p": [[]], "p_raw": [[]], "ci95": [[[]]],
                "n_row": [], "r_row": [], "rework_row": [], "suppressed_rows": ["s6"] },

    "routes": { "top": [{ "path": [], "count": 9, "share": 0.087, "wilson_ci95": [] }],
                "coverage": 0.41, "none_route_share": 0.03 },

    "nodes": { "<state_id>": { "reach": 0.83, "reach_ci95": [], "revisit": 1.31, "revisit_ci95": [],
                               "expected_visits": 1.09,
                               "exit_prob_abandon": 0.14, "exit_prob_unknown": 0.05,
                               "loss_share": 0.31, "loss_share_ci95_bca": [],
                               "unknown_share": 0.18,
                               "b_conv": 0.52, "b_conv_ci95": [], "steps_remaining": 3.1,
                               "burden": 68.0, "burden_ci95": [], "emotion": -0.3,
                               "n_visit": 88, "n_exp": 81, "r": 62, "n_transitions": 81,
                               "severity_conditional": { "mean": 7.2, "m": 19 } } },

    "loss": { "displayed_states": ["s1","s2","s3","s4"], "crosshair_x": 0.25,
              "excluded_loss_share": 0.19, "l_start": 0.07,
              "b_conv_point": 0.208, "b_conv_manski": [0.208, 0.289],
              "b_conv_ci95_bca": [0.171, 0.248] },

    "priority": { "action_list_state": "populated", "delta": 0.25,
                  "action_list": [ { "state_id": "s4", "tier": 1, "delta_pp": 2.22,
                                     "delta_ci95_bca": [0.9,4.1], "delta_rel": 0.107,
                                     "loss_share": 0.19, "burden": 71.0, "r": 44,
                                     "owner": "brand", "feasibility": "med" } ],
                  "tier_note_th": "ภายในระดับเดียวกัน แยกอันดับไม่ได้ที่ขนาดตัวอย่างนี้",
                  "tier1_combined_delta_pp": 4.6, "tier1_combined_ci95": [2.1, 7.8],
                  "quadrant": { "<id>": { "x": 0.31, "y": 68.0, "quadrant": "fix_first",
                                          "stability": 0.63, "label_greyed": true } },
                  "by_owner": { "brand": [], "partner": [], "customer": [], "social": [] } },

    "redundancy": { "spearman_l_delta": 0.71, "ci95": [0.31, 0.93],
                    "spearman_l_re": 0.88, "note_th": "..." },

    "removal_effects": { "<id>": { "re": 0.34, "ci95": [], "tier": 1, "degenerate": false } },

    "segments": { "field": "experience", "kappa": 10, "target": "leave_one_group_out",
                  "comparison_basis": "unshrunk",
                  "groups": { "<val>": { "p": [[]], "lambda_by_row": [], "n": 41 } },
                  "tv_by_row": {}, "tv_holm_p": {},
                  "homogeneity": { "lambda_h": 96.2, "df": 48, "p": null, "evaluable": false },
                  "comparisons": [{ "quantity": "b_conv", "diff": 0.08,
                                    "ci95_bca": [-0.02, 0.19], "claim_allowed": false }] },

    "odi": null,
    "map": { "nodes": [], "links": [], "layout": "horizontal" },
    "methodology_th": "...", "n_disclosure": {} } }
```

Every node and link carries **its own n and interval**. The frontend cannot draw an edge without its uncertainty, because the uncertainty is in the same object.

### 8.5 Compute and caching policy

*(resolves M46, B-B9)*

- **Unfiltered slice:** `B = 2000` + BCa jackknife + 400-replicate removal effects ≈ 10–20 s.
- **Pre-computation is debounced, not per-submission.** v1's "pre-compute on response submission" means every respondent POST triggers a 10–20 s GIL-holding job; thirty students fielding the night before a deadline is a self-inflicted DoS. v2: submission **enqueues** a coalescing job that runs at most **once per study per 10 minutes**, or immediately when `R` crosses an adequacy-band boundary. A process-wide semaphore caps concurrent journey analyses at 2.
- **Filtered slices are lazy**, `B = 800`, `asyncio.wait_for(timeout=120)`. On timeout, return `{"status": "computing"}` and let the client poll — the pattern already exists for `thesis-ai-status`.
- **Filter cardinality is bounded** because `_segments_available` is restricted to the ≤3 declared segment fields.
- `bootstrap_B` is in the payload and printed next to every interval.

### 8.6 File layout

```
backend/lib/consent.py                 ← SHARED PDPA scaffolding (Phase 0b)
backend/lib/markov_journey.py          ← the maths. Pure. No FastAPI, no db.
    build_sequences(study, responses)              -> (sequences, meta)      # routes UNKNOWN
    count_transitions(seqs, states)                -> (n_ij, n_hij, r_i)     # NO MASK
    estimate_transition_matrix(counts, alpha0=1.0)
    fundamental_matrix(P, transient_idx, absorbing_idx)   # asserts reachability + cond number
    reach_and_revisit(N, start)                    # N[s,j]/N[j,j] , N[j,j]
    loss_decomposition(N, R, start, displayed)     # ASSERTS Σ v_j q_j == B[s,ABANDON]
    manski_bounds(B, start)
    counterfactual_delta(P, j, delta)              # redistribution excludes ABANDON & UNKNOWN
    removal_effects(P, states, start, conv, abandon)
    empirical_routes(seqs, top_k=8)
    test_order1(n_ij, states)                      # START EXCLUDED, df=(a'-1)(b'-1), per-cell eval
    test_order2(n_hij, n_ij)                       # denominator is p̂_ij
    crossval_perplexity(seqs, folds=5)             # order-0 baseline fitted on TRAIN folds
    bootstrap_respondents(seqs, fn, B, seed, bca=False)
    bca_interval(theta_hat, boot, jack)
    pool_segments(counts_by_group, kappa=10.0)     # leave-one-group-out target
    test_homogeneity(counts_by_group)              # + TV_i + Holm
    low_information_sensitivity(P, rows)
    sample_adequacy(counts, n_resp, m, completion_rate)
    gated_p(stat, df, evaluable)                   # returns None when not evaluable
    build_map_payload(...)

backend/lib/journey_priority.py        ← quadrant maths: endpoint rescaling, 1/|D_plot| crosshair,
                                          ABSOLUTE y-threshold, tiering by paired-difference CI.
                                          Does NOT import ipma_analysis.py.
backend/lib/journey_budget.py          ← the ONE time/item model (§2.3). Unit-tested against
                                          the documented reference figure.
backend/lib/journey_copy_th.py         ← static Thai guard-rail strings
backend/routes/_analysis_common.py     ← extracted segment/filter helpers (import-only copy;
                                          do NOT migrate conjoint/brand_equity in this PR)
backend/routes/consent.py              ← shared consent endpoints (Phase 0b)
backend/routes/journey.py              ← route factory get_journey_routes(db, get_current_user,
                                                                          get_optional_user)
backend/routes/journey_instrument.py   ← deterministic template library + question-slot merge
                                          (models: brand_equity.py _generate_questions_from_template
                                           L660, _merge_questions_preserving_history L594)
backend/routes/journey_thesis.py       ← mirrors be_thesis_ai.py
backend/tests/test_markov_journey.py   ← synthetic chains with ANALYTICALLY KNOWN N, B, L, RE
backend/tests/test_journey_budget.py   ← reference instrument T̂ == 330 ± 15 s, screens == 18
backend/tests/test_payload_invariants.py ← no non-null p beside evaluable:false; Σ L*_j == 1

frontend/src/pages/CustomerJourneyHub.jsx       ← shadcn <Tabs> shell
frontend/src/pages/journey/
    JourneyListPage.jsx          JourneyWizardPage.jsx
    JourneyDesignPreview.jsx     ← "what R = 100 buys", required wizard screen
    JourneyPathBuilder.jsx       ← checklist → branching → tap-to-edit replay (§2.5).
                                    NO HTML5 drag-and-drop.
    JourneyRespondentPage.jsx    ← modelled on BrandEquityRespondentPage.jsx (819 lines)
    JourneyDashboardPage.jsx
    WeightedJourneyMap.jsx       ← 600–900 lines; horizontal / scroll / vertical modes
    JourneyPriorityQuadrant.jsx  JourneyActionList.jsx
    JourneyMethodology.jsx       copy-th.js       journey-styles.css
```

**`CustomerJourneyTool.js` (1078 lines) is not restructured.** Two additive changes: an `embedded` prop suppressing its own `<Navigation />`, and an `onSeedQuantitative(result)` callback. Additionally, when the user is authenticated it POSTs its result to `qualitative_runs` so `/seed` has something to read *(resolves the stateless-seed gap)*; a paste-in path exists for everyone else. `App.js:225` swaps `<CustomerJourneyTool />` for `<CustomerJourneyHub />`; new routes `/market-research/customer-journey/quant/:studyId{,/wizard,/results}` and public `/journey/r/:shareToken`.

**Reused verbatim:** `_parse_segments_param` L443, `_apply_response_filter` L497, `_segments_available` L524, `_filter_signature` L537, `_holm_adjust` L1690, `_welch_t_test` L1647, `_json_safe` L1594, `_likert_stats` L1029 (`scale_max=5, reverse=False`); the `ThreadPoolExecutor` + `asyncio.wait_for(timeout=120)` offload pattern from `conjoint.py` L4822–4912 (the **pattern**, not the collection); `thesis_renderer.py`; `share.py::_share_showcase_cached`; `BeFilterBar.jsx`; `BeMethodology.jsx` as the glossary template; `recharts` for supporting bar/CI charts.

**Not reused: `backend/lib/ipma_analysis.py`.** `normalize_scores` (L9–22) rescales against the sample min/max, forcing the best step to exactly 100 and the worst to exactly 0 regardless of spread — so "every step performs badly" is unrepresentable — and `determine_quadrant` thresholds at a hardcoded 50 while its docstring claims a median split. Quadrant membership is an artefact of the normalisation: a false claim generated by code. **Reuse the React chart, not the maths.** *(The same defect is live in the conjoint module's IPMA output and is filed separately.)*

### 8.7 Prerequisites — what is real and what was phantom

| v1 prerequisite | Verdict |
|---|---|
| Add 4 question types to `backend/survey_dsl.py` | **Dropped — phantom.** `SurveyDSLParser` is imported only by `server.py:2041` (the generic survey builder) and its own test. Neither Brand Equity nor Conjoint touch it, and this module uses `journey_instrument.py` modelled on `brand_equity.py`'s template generator. Adding branching types to a shared DSL nothing in this feature path uses is a week of work and a regression surface on the generic survey tool for zero benefit. *(resolves B-E phantom 1)* |
| Extend `SurveyTakingPage.js` | **Dropped — phantom.** It serves only `/surveys/:surveyId/take` (`App.js:425`). The correct model is `BrandEquityRespondentPage.jsx`, which already has localStorage + server drafts, `?draft=` resume, `duration_sec`, section-stepped navigation and a th/en toggle. Building standalone was v1's own recommendation; only its stated reason was false. *(resolves B-E phantom 2)* |
| PDPA scaffolding | **Real, and larger than stated** — shared `consent.py` + BE retrofit, Phase 0b. |
| Analysis cache | **Real, and unlisted in v1** — new `journey_analysis_cache` collection with a correct unique index (§8.2). |
| Qualitative persistence | **Real, and unlisted in v1** — `qualitative_runs` collection, or `/seed` accepts a paste. |
| Advisor/supervisor role in the auth model | **Real, and does not exist today.** Blocks the `advisor_signoff` gate. Schedule it. |

### 8.8 Phased build order — smallest shippable first

| Phase | Contents | Ships alone? |
|---|---|---|
| **0** | `markov_journey.py` + `journey_budget.py` + tests against synthetic chains with analytically known `N`, `B`, `L`, `RE`. Assert `Σ L*_j = 1`, `Σ v_j q_j = B[s,ABANDON]`, `reach·revisit = v`, convergence of the smoothed estimate to the MLE with CI width shrinking as `1/√n`, `budget_estimate(reference) == 330 ± 15 s`, and the no-p-value-when-not-evaluable invariant. **Ship the maths, tested, before any UI exists.** | invisible |
| **0b** | Shared `consent.py` + `consent.py` routes + PDPA blocklist + `respondent_token` + withdrawal + retention job + **Brand Equity retrofit**. `journey_analysis_cache` collection + index. `qualitative_runs` collection. | ✅ closes a live platform-wide gap |
| **1** | Study CRUD · deterministic instrument + budget blocker + design preview · `JourneyPathBuilder` (checklist → branching → replay) · public respondent link · `/analysis` returning **empirical routes, reach, rework, per-step burden, pain, adequacy bands, all diagnostics**. Dashboard is **tables only**. | ✅ **already a working quantitative CJM requiring no Markov assumption** |
| **2** | Transition matrix · Gate A + Gate B · fundamental matrix · reach/revisit split · loss decomposition + Manski bounds · cluster bootstrap + BCa · low-information sensitivity · replicate reliability → `WeightedJourneyMap.jsx` (all three layout modes) | ✅ |
| **3** | Counterfactual Δ + Δrel + tier-combined Δ · tiering by paired-difference CI · action list (incl. the empty state) · priority quadrant · owner partition · removal effects (advanced panel) · CIT coding + α gate | ✅ |
| **4** | Segments: leave-one-group-out pooling · TV + Holm · `BeFilterBar` wired · study-vs-study `/compare` with state-id mapping · planned-vs-actual TV | ✅ |
| **5** | Level B: Wave-0 salience intake · coping-journey vocabulary · substitutability partition · ODI opportunity with overlap verdict · solution-level dashboard variant | ✅ |
| **6** | AI enhancement (`/ai-analyze` narrative) · thesis export · showcase + share-content | ✅ |

---

## 9. What this design deliberately does NOT claim

1. **No causality.** Removal effects and `Δ_j` are sensitivity properties of a fitted *descriptive* chain on *recalled observational* data. Thai copy uses `เกี่ยวข้องกับ`, never `ทำให้`. Observational attribution can overstate true incremental effect by an order of magnitude (Blake et al. 2015; Lewis & Rao 2015).
2. **No forecast.** `Δ_j` assumes the improvement is achievable, that every other row stays fixed, and that a 25% cut costs the same at every step. All three are stated in Thai on the table.
3. **No stationary distribution `π`, ever.** The chain is absorbing; `π` puts all mass on the absorbing states. Any "% of customers currently at each stage" derived from `π` would be a fabricated statistic. Node size is `reach_j`, which is defined.
4. **No MCMC.** There is no sampler. The Dirichlet is a smoothing prior; intervals come from a cluster bootstrap. Stated in code comments, in the methodology page and in the API payload, because a prior module in this codebase was caught asserting an MCMC sampler that never ran.
5. **No design effect we cannot estimate.** The ICC-based `DEFF`/`n_eff` of v1 is gone. Gates use `r_i`, a count. The bootstrap variance ratio is reported as a diagnostic derived from the intervals actually shown.
6. **No Cronbach's α on the journey.** Per-step pain items form a **formative index** — dropping the worst step would raise α while destroying the construct. α is structurally unavailable in the renderer for formative blocks.
7. **No claim that the Markov property holds.** Gate A is usually not evaluable at R ≈ 100 and says so; order-2 is not evaluable and says so. Non-rejection is reported as *absence of data*, never as evidence.
8. **The first-order structure is partly an artefact of the instrument.** The branching elicitation asks "after X, what next?" — a first-order question. Gate B measures whether the *reconstructed* sequences are internally predictable, not whether behaviour is Markovian. Stated in the payload, in `n_disclosure`, in the Thai methodology text, and next to the gate itself.
9. **No population inference.** Non-probability, self-selected samples. Every map carries `"ไม่ใช่กลุ่มตัวอย่างเชิงความน่าจะเป็น — สรุปกลับไปยังประชากรทั้งหมดไม่ได้"`, and the study's own sampling-frame description is printed beside it.
10. **Intervals cover sampling error only.** Not recall bias, not elicitation-induced straightening, not state-space misspecification (an omitted touchpoint is silently absorbed into the states that were listed). `other_rate` measures part of the last one; the rest is named in the limitations text.
11. **`L*_j` locates where loss became visible, not where it was caused.** A customer may abandon at checkout because of something that happened at discovery.
12. **`L*`, `Δ`, `RE`, `reach` and `q` are transforms of one 28-parameter fit**, not five independent confirmations. `results.redundancy` reports the rank correlations and the methodology page says so.
13. **`B[j,CONV]` rises with position by construction**, because reaching a late step means not having abandoned. It is captioned accordingly, and `Lift_j` — which packaged that survivorship as a finding — is removed.
14. **Missing journey endings are counted, not imputed.** `UNKNOWN` mass appears on the map and every conversion figure ships with a Manski bound. No MCAR assumption is made at any censoring rate.
15. **Level B says nothing about whether the new product will be adopted.** A large `B[START, NOT_RESOLVED_IN_W]` shows an unmet need exists in the *current* coping journey. It says nothing about willingness to pay for *your* solution. This is the most likely over-claim in the feature and is stated flatly. That outcome is also **right-censored at W**, not absorbing, and is named `"ยังไม่สำเร็จภายใน W วัน"` everywhere.
16. **Level-B outcome ranking usually will not separate at R ≈ 100.** Expected, disclosed in advance, and rendered as overlapping bands with an explicit "cannot rank" verdict rather than a false ordering.
17. **The LLM produces no number.** Its role is bounded to three enhancement tasks the feature survives without: proposing candidate Thai state names and a candidate `expected_transitions` matrix (which no longer touches the data); proposing candidate pain options and blueprint hypotheses; and writing narrative prose about numbers already computed. `ai_cache` never feeds `results.map`. **If the LLM is unavailable, the map renders identically minus the prose.**
18. **No reliability coefficient we did not compute.** Single items report distribution and n with `"ข้อคำถามเดี่ยว — ประเมินค่าความเชื่อมั่นภายในไม่ได้"`. Sequence reliability is reported only when ≥25 replicate pairs exist, and it measures response-process consistency, not recall accuracy.
19. **Single-step counterfactuals are small by construction.** 0.87–2.22 pp at the calibration point. Stated before the number is shown, so a small figure reads as physics rather than failure.

---

## 10. Rejected alternatives

**Rejected on arithmetic at R ≈ 100:**

- **PRCA / penalty–reward dummy regression** — 8 steps means 16 dummies plus intercept; needs R = 170–255. The best "how to fix, not just what" instrument available and simply out of reach. Primary v2 upgrade at R ≥ 150.
- **Kano two-question battery** — 2 items × 5–7 features breaks the budget, the dysfunctional item is cognitively hard on a Thai mobile survey, and the mode-significance test needs n ≥ 50–60 per segment. Deferred with PRCA.
- **NCA (bottleneck thresholds)** — the only method producing "step X must score ≥ 5.2 or nothing else matters", and `nca_analysis.py` already implements CE-FDH/CR-FDH. But it ships **no permutation significance test** (verified), is extremely outlier-sensitive at n < 100, and its `d = C/S` normalises by the *empirical* scope so values are not comparable across steps. v2, after the permutation test lands.
- **BWS / MaxDiff for Level B** — needs a BIBD generator plus conditional logit, n ≥ 60 for stable SEs, 10–15 extra screens. ODI answers the same question at 2 items per statement.
- **Order-2 Markov as the working model** — `m²(m−1)` free parameters (294 at m = 7) from ~400 triples over 378 cells. Every cell prior-dominated.
- **Hidden Markov / latent-class / mover–stayer** — theoretically the best fit for heterogeneity and genuinely undeliverable; EM over 7 states at R = 100 finds classes that are pure noise and presents them confidently. Revisit above R = 500.
- **Raftery MTD, semi-Markov, survival analysis on dwell time, process mining, Shapley attribution, outcome-based latent segmentation** — each adds a framework the student must defend for a benefit that does not exist at this n. Duration is asked (optional) and reported as a descriptive statistic **alongside** the chain, never inside it.

**Rejected on correctness:**

- **Applying the transition mask to the data** — deletes respondent-reported behaviour on LLM-proposed authority and changes every downstream number, while the spec claims the LLM produces no number.
- **A censoring flag instead of an `UNKNOWN` state** — forces a choice between a fabricated row, a shifting state set, and a blocked map, and hides an MCAR assumption in the row normalisation.
- **ICC-based design effects on multinomial transitions** — undefined for a categorical outcome, unidentifiable from the data at typical rework rates, and a 1.06× correction shipped under a name claiming more.
- **Wilson intervals with an effective n** — returns `NaN` whenever `x > n_eff`, and imports a design effect into the one place with no clustering.
- **Sample min–max normalisation and any sample-relative quadrant crosshair** — manufactures "excellent performance" out of a uniformly bad journey, in either axis.
- **Wald intervals** — zero width at `p̂ ∈ {0,1}`: false certainty exactly where the data is sparse.
- **χ² tests as decision rules** — at these cell counts the asymptotic null does not hold, and a non-rejection would be read as proof of no difference. Order-2 and homogeneity are diagnostics; Gate A can only veto.
- **Percentile intervals on `L*` and `Δ`** — under-cover on bounded skewed ratios with mass near 0. BCa costs ~5% more.
- **Uniform imputation of order for unordered responses** — data fabrication. Cannot arise here anyway.
- **Sankey / d3-sankey / Mermaid for the weighted map** — DAG-only or weight-blind; would delete the loops that are the module's main finding.
- **A single composite priority index** (`JPI`, `Pain × Frequency`, FMEA `RPN`) — multiplies incommensurable quantities, has no sampling distribution, hides which factor drives it.
- **A hand-weighted controllability multiplier across ownership classes** — unfalsifiable. Partition instead.
- **Two competing rankings with no arbitration rule** — worse for a non-statistician than one ranking with a caveat.
- **Integer ranks on quantities whose intervals overlap** — replaced by tiers.
- **fsQCA** — 2^k truth table (128 rows at k = 7) against R = 100, percentile calibration making membership sample-relative, and no consistency/coverage bounds in the existing module.
- **NPS per step** — category error. One journey-level 0–10 item, descriptive only.
- **SERVQUAL P−E difference scores** — poor reliability, double the items.
- **Stated importance** — flat, inflated, socially desirable. Derived importance (`L*`) is free.
- **Bogus foil / over-claiming item** — ethics risk plus n ≥ 50 before its own FPR stabilises. Named as a limitation instead.
- **Within-subject own-vs-competitor design** — doubles the questionnaire past budget and breaks the independence the paired comparison assumes. **Level A comparison is between-subjects only in v1**, run as two studies via `/compare`.
- **Migrating `conjoint.py` and `brand_equity.py` onto `_analysis_common.py` in this PR** — couples a new feature to a refactor of two 4,000–6,000-line files with no coverage guarantee. Filed as a follow-up; `journey.py` imports its own copy.
- **Reusing the shared `analysis_cache` collection** — its unique index is `(study_id, method)`; per-filter rows collide.
- **LLM-derived weights, LLM-inferred sequences, LLM-scored pain severity, LLM-vs-LLM "inter-coder reliability"** — all four are load-bearing LLM output and all four are forbidden.

---

## Appendix A — Disposition of every criticism

**Method critique (M1–M46).**

| # | Finding | Disposition |
|---|---|---|
| M1 | Gate 1 vacuous under a mask; df `(m−1)²` wrong | **Accepted.** Mask removed from estimation (§2.6), so the order-0 null is back in the model space; START excluded; `df = (a'−1)(b'−1)` on the reduced table; per-cell evaluability. §4.1 |
| M2 | Gate 2 baseline inherits the mask; gates on a point estimate | **Accepted.** Baseline fitted on train folds with the same unmasked destination set; gate on `mean − t·SE`. §4.2 |
| M3 | Suppressed rows feed `(I−Q)⁻¹` | **Accepted.** `UNKNOWN` absorbing state means no row is ever empty or fabricated; low-information rows are disclosed as still-in-use and carry a leave-one-row-out sensitivity. §2.2, §3.4 |
| M4 | Wilson with `n_eff` returns `NaN`; category error | **Accepted.** Wilson takes integer respondent counts only. §3.10 |
| M5 | `1/m` crosshair — wrong denominator, breaks under suppression | **Accepted.** `L*` renormalised over `D_plot`; crosshair `1/|D_plot|`; `L_START` and excluded mass printed. §3.5 |
| M6 | `DEFF_i` not estimable, and a no-op | **Accepted in full.** Deleted. Gates use `r_i`; `m̄_i` displayed as rework; bootstrap variance ratio as a diagnostic. §3.1 |
| M7 | y-crosshair sample-relative; performance/pain polarity trap | **Accepted.** Absolute y-threshold at 50; axis named `Burden` everywhere; `reverse=False` documented. §3.11, §6.4 |
| M8 | Instrument manufactures the structure the gates test | **Accepted; cannot be fixed by code.** Reframed in the payload, the copy and the methodology page; `set_consistency_rate` added; the replicate sub-study promoted out of "reserved". §4.2 |
| M9 | Five collinear reads presented as five weights | **Accepted.** `results.redundancy` ships bootstrap rank correlations; static Thai disclosure; `RE` demoted, `Lift` deleted. §6.5 |
| M10 | Two primary views can disagree, no arbitration | **Accepted.** One decision rule: the action list decides, the quadrant explains. §6.1 |
| M11 | Equal-δ smuggles equal cost | **Accepted.** Mandatory Thai caption; pre-declared `feasibility` sorts within tier, never enters a number. §3.8 |
| M12 | `Lift_j` is survivorship wearing a causal label | **Accepted.** Deleted. §3.3 |
| M13 | `v_j` conflates reach with rework; the gloss is wrong | **Accepted.** Split into `reach_j = N[s,j]/N[j,j]` and `revisit_j = N[j,j]`. §3.3 |
| M14 | "Two axes independent" is false | **Accepted.** Claim deleted; `axis_correlation` reported. §6.4 |
| M15 | Level-B closure gate vs `m ≤ 5` unsatisfiable | **Accepted.** Cap → 7; block on the Wilson lower bound; defined exit to a model-free Level-B study. §2.9 |
| M16 | Level-B output lands in the "cannot fix" partition | **Accepted.** Level B partitions by `substitutability`, not `owner`. §2.9 |
| M17 | `ENDURED` is right-censored, not absorbing | **Accepted.** Renamed `NOT_RESOLVED_IN_W` / `"ยังไม่สำเร็จภายใน W วัน"` in payload and copy. §2.9 |
| M18 | Two unlinked Level-B rankings; `Opp` floor above calibration | **Accepted.** Never combined; overlap verdict stated up front. §3.14 |
| M19 | Level-B item budget blocked by its own generator | **Accepted.** Rebuilt: 32.1 items, 320 s, passes. §2.9 |
| M20 | Payload ships a p-value the spec forbids | **Accepted.** `gated_p()` + a payload-invariant test. §4.4 |
| M21 | Homogeneity df: three numbers, none agreeing | **Accepted.** `df = (G−1)·Σ_i(b_i−1)`; worked example = 48. §3.12 |
| M22 | Order-2 formula malformed | **Accepted.** Denominator is `p̂_ij`. §4.3 |
| M23 | ≥5-expected-count applied to df, not cells | **Accepted.** Per-cell, measured, with the R-curve published. §4.1 |
| M24 | Segment gates double-count; contradicts §2.6 | **Accepted.** One rule: paired-difference CI excludes 0. `bootstrap_freq` removed. §3.12 |
| M25 | Pooling target contains the group | **Accepted.** Leave-one-group-out target; comparisons on unshrunk estimates. §3.12 |
| M26 | Efron & Tibshirani Ch. 12–14 is the wrong pointer | **Accepted.** Ch. 8 + Davison & Hinkley §3.8; BCa adopted with its own citations. §3.10 |
| M27 | Smith's salience uncited | **Accepted.** Smith (1993); Smith & Borgatti (1997). §2.9 |
| M28 | Kemeny & Snell theorem numbers are edition-dependent | **Accepted.** Cited by chapter; Grinstead & Snell §11.2 Thms 11.4–11.6 promoted to primary. §3.3 |
| M29 | Katz (1981) pagination | **Accepted.** Cited with an explicit verify-before-thesis note. §4.3 |
| M30 | Reference payload violates the m cap | **Accepted.** Caps re-evaluated against realised R; `cap_shortfall` emitted; the example is now internally consistent. §2.1 |
| M31 | §0 vs §5.2 contradict on hard gates | **Accepted.** One blocking gate; no weighted map below R = 40 or on an unevaluated gate. §4.1, §7.2 |
| M32 | Item and time budgets do not sum; block is inert | **Accepted.** Single budget module, published constants, reference = 330 s / 18 screens / 29.3 items, unit-tested, block fires on realistic overshoots. §2.3 |
| M33 | `unordered_rate` has no source | **Accepted.** Field deleted; `set_consistency_rate` replaces it. §2.7 |
| M34 | `V_r` makes a Q1 omission unrecoverable | **Accepted.** Escape option on every branch screen; replay insert draws from the full state list. §2.4 |
| M35 | Level A has no closure check | **Accepted.** `other_rate` with Wilson CI computed and surfaced at both levels. §7.4 |
| M36 | The mask deletes respondent data on LLM authority | **Accepted in full — the sharpest finding.** Nothing is ever zeroed. §2.6 |
| M37 | `instrument_version` has no compatible-change class | **Accepted.** `structure_hash` + `content_revision`. §2.1 |
| M38 | `/compare` unusable because of hashing | **Accepted.** Brand names not hashed; explicit state-id mapping for genuinely different templates. §2.1, §8.3 |
| M39 | Exclusions non-monotone in n | **Accepted.** Frozen `quality_reference`; realised exclusion set persisted with the analysis row. §2.8 |
| M40 | `LongString` inert at typical L | **Accepted.** Computed across all scored rows, `not_applicable` below 6, applicable-flag count reported. §2.8 |
| M41 | Survivor-bias mitigation addresses the wrong bias | **Accepted.** Two named biases, two mitigations, two measurements. §3.11 |
| M42 | Abandon gate's 15% share punishes good studies; self-declared flag | **Accepted.** Replaced by a precision condition on `q_j`; the boolean is deleted; the frame description becomes disclosure. §3.6 |
| M43 | Censoring treated as MCAR; "upper bound" misplaced | **Accepted.** `UNKNOWN` state + Manski bounds at every censoring rate. §2.2, §3.7 |
| M44 | PDPA schema gaps | **Accepted.** `respondent_token` added; recontact data in a separate collection; export path generalised. §2.10 |
| M45 | `k = 10` vs the segment floor | **Accepted.** Scope stated: shared/exported/showcased surfaces. §2.10 |
| M46 | Compute budget under filtering | **Accepted.** Debounced pre-compute, `B = 800` on filtered slices, bounded filter cardinality, poll-on-timeout. §8.5 |

**Build/usability critique.**

| # | Finding | Disposition |
|---|---|---|
| A1 | Gate 1 broken three ways; false PASS on memoryless data; not evaluable at R = 100 | **Accepted with the simulation figures reproduced in the spec.** §4.1 |
| A2 | `analysis_cache` unique index omits `filter_sig` | **Accepted and re-verified.** Journey uses its own collection; the conjoint bug is filed separately. §1, §8.2 |
| A3 | PDPA gap is platform-wide | **Accepted.** Shared consent module + Brand Equity retrofit in Phase 0b. §2.10, §8.8 |
| B1 | Only 28% of edges get a number | **Accepted.** Figures published; `design-preview` shown before fielding. §5.1 |
| B2 | Observed L̄ = 3.99, not 5 | **Accepted.** All arithmetic uses L̄ = 4; realised L̄ computed and reported. |
| B3 | DEFF machinery inert / unidentifiable | **Accepted.** Deleted; bootstrap variance ratio replaces it as a diagnostic. §3.1 |
| B4 | Quadrant greys out the action table's top row | **Accepted.** `Stab_j` greys a label on the picture only; it never touches the action list. §6.1, §6.4 |
| B5 | L ranking ≠ Δ ranking, unexplained | **Accepted.** Named static Thai explanation + one stated decision rule. §6.5 |
| B6 | Δ magnitudes underwhelming; example oversells | **Accepted.** `Δrel` and a tier-combined Δ added; smallness stated up front; the illustrative string corrected. §3.8 |
| B7 | `L` CIs straddle the crosshair; action list often empty | **Accepted.** Tiers replace ranks; the empty state is a designed screen with a sample-needed number. §6.3 |
| B8 | y-crosshair reintroduces the `ipma` defect | **Accepted.** Absolute midpoint; grand mean is a reference line. §6.4 |
| B9 | Pre-compute on submission is a self-inflicted DoS | **Accepted.** Debounced, coalesced, semaphore-capped. §8.5 |
| B10 | Discard-and-redraw biases the bootstrap | **Accepted.** Deleted — α₀ > 0 makes every replicate well-defined. §3.2 |
| C1 | Time model does not reproduce its own total | **Accepted.** One module, one constant table, unit-tested. §2.3 |
| C2 | Three real costs missing | **Accepted.** Page transitions 0.6 s, consent 45 s, replay 25.2 s expected. §2.3 |
| C3 | S2 free text at screen 4 | **Accepted.** Optional, not autofocused, merged onto the S1 screen. §2.3 |
| C4 | Recruitment quoted in completes | **Accepted.** Quoted in link-sends using the realised completion rate. §7.1 |
| C5 | 8-transition cap truncates the informative tail | **Accepted.** Raised to 12; cap terminates into `UNKNOWN`; `cap_rate` reported. §2.7 |
| C6 | Censoring informative; "upper bound" is an assumption | **Accepted.** Manski bounds, always. §3.7 |
| C7 | Logic trap manufactures the inconsistency warning | **Accepted.** Trap responses excluded from the denominator; and the mask no longer affects data anyway. §2.6 |
| C8 | Q1 is a hard ceiling | **Accepted.** Escape option on branch screens. §2.4 |
| C9 | "ไม่ได้ทำขั้นไหนเลย" respondents unrepresented | **Accepted.** Direct `START → terminal` transition; route `NONE`. §2.7 |
| C10 | `option_positions` collected, never used | **Accepted.** `option_position_effect` computed, displayed, and in the limitations. §7.4 |
| C11 | 10% closure check on a noisy proportion | **Accepted.** Wilson lower bound. §2.9 |
| D1 | Is the mask diagonal always 1? | **Moot.** No mask on the data; self-transitions always estimable. §2.6 |
| D2 | Replay editor semantics absent | **Accepted.** Fully specified, including precedence and metadata handling. §2.5 |
| D3 | Confirmed replay containing a forbidden transition | **Accepted.** Kept in full, logged, never discarded. §2.5 |
| D4 | Draft/resume mid-branch | **Accepted.** Full navigation state persisted; schema given. §2.5 |
| D5 | `respondent_token` does not exist | **Accepted.** Added. §2.10, §8.1 |
| D6 | `instrument_version` vs `state_vocab_version` | **Accepted.** The latter deleted. §2.1 |
| D7 | Hash structure, not label text | **Accepted.** §2.1 |
| D8 | `k = 10` scope | **Accepted.** §2.10 |
| D9 | Empty action list unspecified | **Accepted.** §6.3 |
| D10 | Self-declared frame boolean | **Accepted.** Deleted; replaced by measured conditions + printed disclosure. §3.6 |
| D11 | Buyers-only studies get nothing | **Accepted.** Auto-detected, warned at creation, and given a fallback that does not collapse (`B[j,CONV]` suppressed). §3.6 |
| E | Two phantom prerequisites, one real one, `get_optional_user` naming, stateless seed, desktop-only map | **Accepted.** §8.7, §8.6, §5.2 |
| F1–F10 | The ten minimum pre-code changes | **All ten adopted:** F1 §4.1 · F2 §3.1 · F3 §6.4 · F4 §6.5 · F5 §2.5 · F6 §2.1 · F7 §2.10 · F8 §8.2 · F9 §8.7 + §8.8 Phase 0 · F10 §5.1 + §3.6 |

**Nothing in either critique is dismissed as inapplicable.** The one finding whose *stated reason* was wrong rather than its conclusion — B-E's claim that the branching instrument depends on `SurveyTakingPage.js` — is recorded as such in §8.7 while its conclusion (build standalone, drop the prerequisite) is adopted.