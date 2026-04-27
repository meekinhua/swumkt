# Brand Equity / Brand Health Check Module — Design Spec

> **Purpose**: Design brief for Claude Design to produce pixel-perfect interface mockups for SWU Marketing Research App's new **Brand Equity Tools** module.
>
> **Audience**: UX designer, product manager
> **Status**: Frozen Spec v1.0 · 2026-04-27
> **Stack hint**: React + TailwindCSS + Shadcn UI · same DNA as existing app

---

## 1. Vision & Positioning

A research tool that lets brand managers, marketers, and students conduct **Brand Health Checks** end-to-end — from study design → respondent collection → multi-dimensional analysis → shareable report — combining classical statistical rigor with AI-powered qualitative insight.

**Tagline candidate**: *"วัดสุขภาพแบรนด์ของคุณ · ตั้งแต่การจดจำถึงความภักดี"*
*("Measure your brand's vitals · from recall to loyalty")*

**Core promise**: "Aaker's 4-dimension framework, automated question generation, AI + statistics in one click."

### Why this exists
Brand managers today juggle multiple tools: SurveyMonkey (collection), Excel (stats), ChatGPT (qualitative coding), Canva (reports). This module unifies them into a single research workflow that produces a **defensible, citable Brand Equity Score** plus actionable Identity-Image gap analysis.

### Where it lives in the app
- Sibling to existing **Conjoint Analysis** module
- Listed under "Research Tools" in main nav
- Shares Survey infrastructure (`surveys`, `survey_responses` collections already exist)
- Shares LLM infrastructure (Gemini via Emergent LLM Key)
- Shares thesis-export (DOCX with native equations) infrastructure

---

## 2. User Personas

### Persona A: "ดร.อาภา" — Marketing Researcher / Brand Strategist (PRIMARY)
- 35-50 yrs, agency or in-house brand team
- Goal: prove brand health to C-suite quarterly; track progress over time
- Pain: stitching Likert + open-ends manually takes 2 weeks
- Win: gets boardroom-ready output in 30 min from collected data

### Persona B: "พิม" — Marketing Major Student / Thesis Writer
- 21 yrs, doing senior thesis on brand equity
- Goal: rigorous methodology that satisfies advisor; thesis-style output
- Pain: doesn't know how to run multiple statistical tests; AI summary feels untrustworthy without numbers
- Win: ระบบช่วยสร้าง survey ครบ 4 dimensions + คำนวณ stats ตามตำรา + DOCX format ตรงเทมเพลตคณะ

### Persona C: "อาจารย์เก่ง" — Faculty / Reviewer
- Reviews student work, occasionally runs own studies
- Wants methodology transparency, not black box

### Persona D: "ลูกค้า / Respondent"
- Just wants a fast, friendly survey that doesn't feel like an interrogation
- Mobile-first, minimal cognitive load

---

## 3. Information Architecture

```
/brand-equity                            (List: My Studies)
├── /brand-equity/templates              (Question library / templates)
├── /brand-equity/new                    (Wizard: create new study)
├── /brand-equity/{id}                   (Study Detail · Setup tab default)
│   ├── /brand-equity/{id}/setup         (Edit brand, competitors, identity, demographics)
│   ├── /brand-equity/{id}/questions     (Question editor — drag/drop, edit, add)
│   ├── /brand-equity/{id}/share         (Share & distribution panel)
│   ├── /brand-equity/{id}/responses     (Raw responses table)
│   └── /brand-equity/{id}/dashboard     (Analysis dashboard — main deliverable)
├── /brand-equity/{id}/respond           (PUBLIC — survey-taking UI for respondents)
└── /brand-equity/{id}/preview           (Researcher previews respondent flow)
```

### Navigation pattern
- **Within a study**: 5-step horizontal stepper (`Setup → Questions → Share → Responses → Dashboard`)
- **Stepper states**: `complete`, `current`, `disabled` (Dashboard disabled until ≥10 responses)

---

## 4. The 4-Dimension Framework (Aaker)

The product lives by this taxonomy — every UI element should reinforce it.

| Dimension | Color hint | Icon hint | Question types |
|---|---|---|---|
| 🧠 **Brand Awareness** | Blue `#1B75BC` | `brain` / `lightbulb` | Unaided recall (open), Aided recognition (multi-checkbox), Top-of-mind (rank) |
| ⭐ **Perceived Quality** | Yellow `#F6C445` | `star-half` | Likert 1-7, Comparative scale vs competitor, Open "why" |
| 🎭 **Brand Identity vs Image** | Red `#C8102E` | `theater-masks` | Trait selection (closed), Brand personality (open), Identity-Image GAP score |
| 💛 **Brand Loyalty** | Green `#10B981` | `heart` / `repeat` | NPS (0-10), Repeat-intent (Likert), Switching cost, Open "why stay" |

> **Design tip**: Use these 4 colors as accent system. Each dimension's section header, chart, and dashboard tile should pick its own dimension color.

---

## 5. Key Flows

### Flow 1 · Researcher creates a study (4-step wizard)
1. **Brand basics** — Brand name, logo upload, category, competitors (2-5)
2. **Brand Identity** — researcher inputs intended traits (chip selector + custom: e.g., `Modern, Trustworthy, Premium, Playful`); used as "ground truth" for Identity-Image gap
3. **Demographics segments** — checkbox of segments to slice by (age, gender, occupation, region, alumni gen)
4. **Question generation** — system shows auto-generated 25-30 questions across 4 dimensions; researcher can edit/add/remove

### Flow 2 · Respondent takes survey (mobile-first)
- Single-page progressive disclosure with progress bar at top
- Each dimension is a section break with celebratory micro-animation
- Estimated time visible: "ใช้เวลาประมาณ 6-8 นาที"
- Skip-friendly except for required questions
- Submit → thank-you screen with optional incentive (alumni: +XP, public: lottery code)

### Flow 3 · Dashboard analysis (researcher viewing)
- Top: **Brand Equity Score** (0-100) hero + 4 sub-scores (one per dimension)
- 4 stacked sections (one per dimension), each with:
  - Statistical chart (auto-chosen by question type)
  - LLM-generated insight paragraph
  - Comparison vs competitor (if applicable)
  - Drill-down link
- Right rail: **AI Insights** (3-5 bullet recommendations with citations to specific questions)
- Floating actions: **Export PDF**, **Export Thesis DOCX**, **Share read-only link**

---

## 6. Page-by-Page Specifications

### 6.1 `/brand-equity` — My Studies List
- **Hero**: title "Brand Health Studies" + CTA "+ สร้าง study ใหม่"
- **Filter chips**: All / Draft / Collecting / Analyzing / Completed
- **Sort**: Latest / Most Responses / Highest Score
- **Card grid** per study:
  - Brand logo (if provided) or initial-circle gradient
  - Brand name (display) + category chip
  - Status badge with respondent count `87 / 200 · Collecting`
  - **Brand Equity Score** ring (only when status=Completed)
  - 4 mini-bars showing dimension sub-scores
  - Last updated timestamp
- **Empty state**: friendly illustration + "เริ่ม Brand Health Check แรกของคุณ" + CTA

### 6.2 `/brand-equity/new` — Create Study Wizard
- **4-step stepper** at top with progress bar
- **Sticky bottom bar**: `← ย้อน` and `ถัดไป →` buttons
- **Step 1 — Brand basics**:
  - Big brand name input (autocomplete from previous studies)
  - Logo dropzone (PNG/JPG/SVG, optional)
  - Category dropdown (FMCG, Tech, Luxury, F&B, Service, ...) + custom
  - Competitors: chip-input (type to add, 2-5 required); each chip shows remove X
  - Industry context (text area, optional, helps AI generate better questions)
- **Step 2 — Brand Identity**:
  - "อยากให้ลูกค้ามอง brand คุณว่าอย่างไร?" prompt
  - **Trait chip selector**: 30 pre-defined traits across 5 archetypes (Sincerity, Excitement, Competence, Sophistication, Ruggedness). User picks 5-10.
  - Free-text "Brand promise" (1 sentence)
  - Pricing tier (selector: budget / mid / premium / luxury)
- **Step 3 — Segments**:
  - Demographics to capture: Age band, Gender, Occupation, Income band, Region, (alumni gen if linked)
  - Each as a toggle — disabled = skip that question in survey
- **Step 4 — Question Review**:
  - Loading state: "AI กำลังสร้างคำถาม 25 ข้อตามบริบทของแบรนด์คุณ..." (with spinner + 4 dimension icons cycling)
  - When ready: 4 collapsed cards (one per dimension), each showing question count, sample question, expand to view all
  - Each question: edit / duplicate / delete / change-type
  - "+ เพิ่มคำถามเอง" inline button per section
  - Footer: "เปิดรับคำตอบ" → moves to status=Collecting

### 6.3 `/brand-equity/{id}/share` — Distribution Panel
- **Top**: status banner + respondent counter `127 / 200 (target)`
- **Left column — Public link**:
  - QR code (large, downloadable)
  - Short URL with copy button
  - LINE share, Twitter, Email template
  - Embed snippet `<iframe>`
- **Right column — Alumni targeting** (only if user is alumni-registered):
  - Filter: by gen range, by industry, by gender
  - Estimated reach: "ส่งให้ ~840 คน"
  - "ส่งคำเชิญทั้งหมด" button → in-app notifications
  - Per-recipient response status table (sent / opened / completed)
- **Bottom — Incentive setup** (optional):
  - Toggle "ตั้งรางวัล"
  - Lottery code, XP boost, fixed reward

### 6.4 `/brand-equity/{id}/respond` — Respondent UI (PUBLIC, mobile-first)
- **Top**: brand logo + "ขอเวลา 6 นาทีของคุณ ช่วยตอบคำถามเรื่อง [Brand]"
- **Progress bar** that segments by 4 dimensions (each dimension lights up as you cross into it)
- **Dimension intro cards** between sections:
  - Big icon + "ตอนที่ 1 · การจดจำแบรนด์ 🧠"
  - 1-line explanation
  - "เริ่ม →" button (full-width on mobile)
- **Question rendering rules** (atomic component types):
  - **Open-short** — single-line input
  - **Open-long** — textarea with character counter
  - **Likert 5/7** — emoji-graded buttons or labeled scale
  - **NPS 0-10** — segmented horizontal bar
  - **MCQ-single** — radio cards with optional brand-logo
  - **MCQ-multi** — checkbox cards
  - **Ranking** — drag-to-reorder list (mobile: long-press)
  - **Comparative scale** — 7-point bipolar slider with `[Brand A] ←──→ [Brand B]`
  - **Trait grid** — chip multi-select with "เลือกได้ 1-5 ข้อ" hint
- **Footer**: "ข้าม" (if optional) + "ถัดไป" (right-aligned)
- **Submit screen**:
  - Confetti animation
  - "ขอบคุณ! การตอบของคุณช่วยให้ [Brand] ดีขึ้น"
  - Optional: incentive code reveal
  - "แชร์ให้เพื่อน" CTA (drives K-factor)

### 6.5 `/brand-equity/{id}/dashboard` — THE MAIN DELIVERABLE
> *This is the most important screen. Spend the most design effort here.*

- **Top hero strip** (fixed, glass-morph):
  - Brand name + logo
  - **Brand Equity Score**: huge animated ring 0-100 with gradient by tier (red <40, yellow 40-70, green >70)
  - Score breakdown: 4 mini-rings (one per dimension) clickable to scroll to section
  - Right: actions — `Export PDF`, `Export Thesis DOCX`, `Share (read-only)`, `Refresh data`
  - Sub: "127 respondents · last updated 3 hours ago"
- **Filter rail** (sticky on left): demographic segment slicers (toggling re-runs analysis client-side)
- **Section 1 — Brand Awareness** 🧠 (blue accent)
  - **Top-of-Mind Brand Cloud**: word-cloud showing brands respondents recalled first, sized by frequency. Target brand highlighted.
  - **Aided Awareness Bar**: bars for each brand showing % who recognized, with target brand bolded
  - **Awareness Funnel**: Recognized → Considered → Aware-of-features
  - **AI Insight box** (red-cornered card): 2-3 bullet observations
- **Section 2 — Perceived Quality** ⭐ (yellow accent)
  - **Spider/Radar chart**: target brand vs competitors on 5-7 quality attributes
  - **Distribution histogram**: rating distribution (overall + by segment)
  - **Net Quality Score** (% top-2-box minus bottom-2-box)
  - **AI Insight**: "respondents praise X but flag Y as weakness" + sample quote citations
- **Section 3 — Brand Identity vs Image** 🎭 (red accent · centerpiece of the tool)
  - **Identity-Image Alignment Map**: 2-col layout
    - Left: "Identity (intended)" — chips of traits researcher set
    - Right: "Image (perceived)" — chips of traits AI extracted from open responses, sized by frequency
    - Connector arrows show overlap (green) and divergence (red)
  - **Alignment Score**: %, with breakdown of "Aligned / Lost in translation / Unintended attributes"
  - **Trait gap table**: 3 columns (Trait · % Identity · % Image · Gap)
  - **Sample verbatims** carousel (top quotes representing each trait)
  - **AI Insight**: "Brand wants to feel `Premium, Modern` but consumers most associate with `Affordable, Reliable` — recommend visual identity update"
- **Section 4 — Brand Loyalty** 💛 (green accent)
  - **NPS gauge**: -100 to +100 with promoters/passives/detractors split
  - **Repeat Intent** vertical bar (vs category benchmark if available)
  - **Switching Risk Matrix**: 2x2 grid (Loyalty × Switching cost) with respondent dots
  - **Open-end themes**: "Why customers stay" word cloud + top 3 themes from AI clustering
  - **AI Insight**: actionable retention recommendations
- **Footer Right Rail — Master AI Insights**:
  - 5-bullet recommendations card (always visible during scroll)
  - "ทำไมต้องเชื่อ AI?" → expandable methodology + citation count
  - "Generate new insights" refresh button (re-runs Gemini)

### 6.6 `/brand-equity/{id}/responses` — Raw Data Table
- Spreadsheet-like view: rows = respondents, cols = questions
- Filterable + searchable
- Per-row "View full response" drawer
- **Export CSV** button
- Anonymized vs identified toggle

### 6.7 `/brand-equity/templates` — Question Library
- Pre-built study templates: "Soft Drink Brand", "Banking Service", "EdTech App", "FMCG", "Luxury", "Generic"
- Each template = a starter set of questions tagged by dimension
- Searchable + filterable by dimension/industry
- "Use as starter" button → spawns new study pre-filled

---

## 7. Question Library — Detailed Templates

> Auto-inserted on study creation. Each marked `[REQUIRED]` or `[OPTIONAL]`. Each has `kind`, `prompt`, `meta`.

### Brand Awareness 🧠
| ID | Type | Kind | Prompt (Thai) | Required | AI? |
|---|---|---|---|---|---|
| AW-1 | Open-short | unaided_top_of_mind | "เมื่อพูดถึง `[category]` แบรนด์แรกที่นึกถึงคืออะไร?" | ✅ | ✅ extract brand |
| AW-2 | Open-long | unaided_recall | "นอกจากแบรนด์ข้างต้น คุณนึกถึงแบรนด์ใน `[category]` อะไรอีกบ้าง?" | ✅ | ✅ extract brands |
| AW-3 | MCQ-multi | aided_recognition | "แบรนด์ใดต่อไปนี้ที่คุณรู้จัก? (เลือกได้หลายข้อ)" — list = target + competitors + decoys | ✅ | ❌ |
| AW-4 | MCQ-single | brand_familiarity | "คุณรู้จัก `[Brand]` ในระดับใด?" (1=ไม่เคยได้ยินเลย, 5=รู้จักดีมาก) | ✅ | ❌ |
| AW-5 | Open-short | first_source | "รู้จัก `[Brand]` จากที่ไหนเป็นที่แรก?" | ⬜ | ✅ classify channel |

### Perceived Quality ⭐
| ID | Type | Kind | Prompt | Required | AI? |
|---|---|---|---|---|---|
| PQ-1 | Likert-7 | overall_quality | "โดยรวม `[Brand]` มีคุณภาพระดับใด?" (1=แย่มาก, 7=ดีมาก) | ✅ | ❌ |
| PQ-2..6 | Likert-7 | attribute_quality | per-attribute (reliability, value, design, service, innovation) | ✅ | ❌ |
| PQ-7 | Comparative-7 | brand_vs_competitor | "เทียบ `[Brand]` กับ `[Competitor]` คุณคิดว่า..." (1=BrandA ดีกว่ามาก, 7=BrandB ดีกว่ามาก) | ✅ | ❌ |
| PQ-8 | Open-long | quality_reasons | "อะไรทำให้คุณรู้สึกว่า `[Brand]` มีคุณภาพดี / ไม่ดี?" | ⬜ | ✅ theme extraction |
| PQ-9 | NPS-style 0-10 | likely_to_buy | "โอกาสที่คุณจะซื้อ `[Brand]` ในเดือนหน้า?" | ⬜ | ❌ |

### Brand Identity vs Image 🎭
| ID | Type | Kind | Prompt | Required | AI? |
|---|---|---|---|---|---|
| BI-1 | Trait-grid | image_traits_aided | "เลือก 3-5 ข้อที่อธิบาย `[Brand]` ได้ดีที่สุด" — list = identity_traits + 10 distractors | ✅ | ❌ |
| BI-2 | Open-long | image_personality | "ถ้า `[Brand]` เป็นคน คุณจะอธิบายว่าเป็นคนแบบไหน?" | ✅ | ✅ extract personality |
| BI-3 | Open-short | image_one_word | "อธิบาย `[Brand]` ในคำเดียว" | ✅ | ✅ word-cloud |
| BI-4 | MCQ-single | archetype | "`[Brand]` เหมาะกับ archetype ใดที่สุด?" (Hero, Sage, Lover, ...) | ⬜ | ❌ |
| BI-5 | Likert-5 | brand_promise_match | "`[Brand]` ทำตามสัญญาที่ให้ไว้ `[brand_promise]`" | ✅ | ❌ |

### Brand Loyalty 💛
| ID | Type | Kind | Prompt | Required | AI? |
|---|---|---|---|---|---|
| LY-1 | NPS 0-10 | nps | "คุณจะแนะนำ `[Brand]` ให้เพื่อนครอบครัวเท่าไหน? (0-10)" | ✅ | ❌ |
| LY-2 | Likert-7 | repeat_intent | "ครั้งหน้าหากต้องซื้อ `[category]` อีก คุณจะเลือก `[Brand]` แน่นอน" | ✅ | ❌ |
| LY-3 | Likert-7 | switching_resistance | "ถ้าคู่แข่งลดราคา 20% คุณจะยังเลือก `[Brand]`" | ✅ | ❌ |
| LY-4 | Open-long | reason_to_stay | "ทำไมคุณยังคงเลือก `[Brand]`?" | ⬜ | ✅ theme |
| LY-5 | Open-long | reason_to_leave | "ถ้าจะเปลี่ยน brand จะเป็นเพราะอะไร?" | ⬜ | ✅ theme |
| LY-6 | MCQ-single | usage_frequency | "ใช้/ซื้อ `[Brand]` บ่อยแค่ไหน?" | ⬜ | ❌ |

---

## 8. Statistics Engine (server-side)

### Per-question computations
- **Likert/NPS**: mean, median, mode, std-dev, distribution histogram
- **Comparative scale**: mean position, % favoring each brand
- **MCQ-single**: count + %
- **MCQ-multi**: count + % per option, average # selected
- **Ranking**: average rank, % ranked first
- **Open-text**: word count avg, theme clustering (via Gemini), sentiment score (via Gemini)

### Composite scores
- **Brand Equity Score (0-100)** = weighted avg of 4 dimension scores
  - Default weights: 25/25/25/25; researcher can override
- **Awareness Score** = (top-of-mind% × 0.4) + (aided recognition% × 0.3) + (familiarity mean/5 × 0.3) × 100
- **Perceived Quality Score** = (mean overall_quality / 7 × 100)
- **Identity-Image Alignment Score** = Jaccard overlap of traits set ∪ traits perceived, weighted by frequency
- **Loyalty Score** = NPS_normalized (0-100) × 0.5 + repeat_intent_mean/7 × 50

### Inferential tests (when comparing segments or vs competitor)
- Independent t-test (normality assumed for n>30)
- Mann-Whitney U (non-parametric fallback)
- Chi-square for categorical
- Confidence intervals on means (95%)
- Cohen's d for effect size
- Cronbach's α for multi-item Likert constructs (Awareness/PQ/Loyalty scales)

### Segmentation
- All metrics auto-computed per segment slice (age × gender × occupation × region × alumni-gen)
- Sparklines per segment in dashboard
- Highlight "significant differences" with star indicator

---

## 9. AI Integration (Gemini via Emergent LLM Key)

### 9.1 Question Generation (study setup)
**Trigger**: Step 4 of wizard, on first load
**Input**: brand_name, category, competitors, identity_traits, brand_promise, industry_context
**Prompt sketch**:
> "Generate 25-30 brand-equity survey questions covering Aaker's 4 dimensions for `[brand]` in `[category]`. Use the question types and IDs from the template library. Adapt prompts to mention specific competitors and identity traits the researcher set. Ensure mix of aided/unaided, open/closed, Likert/comparative. Output as JSON array with `id, dimension, type, kind, prompt, options, required, ai_processing`."
**Output**: validated JSON ready to render in editor; researcher can override

### 9.2 Open-text Theme Extraction (analysis)
**Trigger**: dashboard load when a study has open-text responses
**Input**: list of responses for a single open-question
**Prompt**:
> "Cluster these `n` Thai responses about `[Brand]` into 3-7 themes. For each theme, return `name, description, count, sample_quotes (3 verbatims), sentiment_score (-1 to 1)`. Output JSON."

### 9.3 Identity-Image Trait Extraction
**Input**: identity_traits (researcher's), open responses to BI-2/BI-3
**Prompt**:
> "Extract personality traits respondents perceive about `[Brand]` from these Thai open-ended responses. Return top 15 traits with frequency. Then compute alignment vs the intended `identity_traits`. Output `{perceived_traits: [{trait, count, sentiment}], aligned_traits: [...], lost_traits: [...], unintended_traits: [...], alignment_score_0_100, narrative_2_sentences}`."

### 9.4 Master AI Insights (right rail of dashboard)
**Input**: full statistical summary JSON (all dimensions) + key open-text themes
**Prompt**:
> "You are a senior brand strategist. Given this brand health data, generate 5 actionable insights for the brand manager. Each insight: `headline (1 line), evidence (cite specific question stats), recommendation (1 action)`. Be specific, no fluff. Output JSON."

### 9.5 Architecture
- All AI calls go via existing **background-task + polling** pattern (already in use for Conjoint AI Interpretation) to avoid 502 timeouts
- AI results cached in `brand_studies.ai_cache` keyed by data hash
- "Refresh AI" button re-runs

---

## 10. Data Models (MongoDB)

```javascript
// brand_studies
{
  id, owner_id, status, // draft | collecting | analyzing | completed
  brand: { name, logo_url, category, competitors: [], industry_context },
  identity: { traits: [], brand_promise, pricing_tier, archetype },
  segments_to_capture: [], // ['age', 'gender', ...]
  questions: [
    { id, dimension, type, kind, prompt, options?, required, ai_processing? }
  ],
  weights: { awareness: 25, quality: 25, identity: 25, loyalty: 25 },
  target_responses: 200,
  share_token: '...',  // public link
  alumni_targeting: { gen_range, industries, gender, sent_count },
  incentive: { type, value },
  ai_cache: { questions_generated, theme_clusters, identity_image, master_insights, generated_at },
  created_at, updated_at, closed_at
}

// brand_responses (one doc per respondent submission)
{
  id, study_id, respondent_id, // null if anonymous
  demographics: { age, gender, occupation, income, region, alumni_gen },
  answers: [
    { question_id, value, value_type } // value can be string|number|array
  ],
  duration_sec, started_at, submitted_at, channel // public_link | alumni_invite | embedded
}

// brand_analysis_cache
{
  study_id, dimension, computed_at,
  stats: { /* per-question summaries */ },
  composite_scores: { awareness, quality, identity_alignment, loyalty, overall },
  segment_breakdown: { /* nested */ },
  ai_themes: [], ai_master_insights: []
}
```

---

## 11. Output Artifacts

### A. Dashboard Online (primary)
- See section 6.5

### B. PDF Executive Report
- Cover page: brand logo, study title, dates, n respondents, **Brand Equity Score** big
- 1-page exec summary (4 key takeaways from AI master insights)
- 4 sections (one per dimension), 1-2 pages each: charts + AI narrative + tables
- Methodology appendix (auto-generated)
- Goal: A4, 12-15 pages, ready for boardroom

### C. Thesis-style DOCX (for student personas)
- SWU iThesis format (TH SarabunPSK font, exact margins)
- Same content as PDF + Thai academic structure:
  - บทที่ 1 บทนำ (auto-stub)
  - บทที่ 2 ทฤษฎี (Aaker framework + literature stub)
  - บทที่ 3 ระเบียบวิธีวิจัย (auto: methodology written from study config)
  - บทที่ 4 ผลการวิจัย (charts + tables + interpretation per dimension)
  - บทที่ 5 สรุปและข้อเสนอแนะ (AI master insights as จุดสำคัญ)
- Reuses existing `_create_thesis_docx` infrastructure with native equation rendering for Cronbach's α etc.

### D. Read-only share link
- Hashed token; visitor sees dashboard without filter rail (locked) + watermark "Generated via SWU MKT Tools"

---

## 12. Design System Tokens (proposed)

> Match existing app DNA but introduce dimension colors as accents.

**Already existing in app**: Red `#C8102E` · Blue `#1B75BC` · Paper `#F7F4EE` · Ink `#14161A`. Brand Equity module **must reuse these** + add:

**New dimension accents** (use as fills/strokes for charts and section headers only):
- Awareness blue · `#1B75BC` (already in palette ✓)
- Quality gold · `#F6C445` (already in palette ✓)
- Identity red · `#C8102E` (already ✓)
- Loyalty green · `#10B981` (NEW, add as `--be-green`)

**Typography**: IBM Plex Sans Thai (consistent with Alumni module) + IBM Plex Mono for numbers/scores.

**Card shadow tier**: prefer the existing `--al-shadow-md/lg` tokens.

**Charts library suggestion**: Recharts (lightweight, React-native, already common in similar apps). Avoid heavy D3 for v1.

---

## 13. State & Edge Cases

### Empty / Loading states
- 0 responses: dashboard locked with "ต้องการอย่างน้อย 10 responses เพื่อ unlock dashboard"
- AI processing: skeleton card with "AI กำลังวิเคราะห์ · 10-30 วินาที" + progress polling
- AI failed: graceful fallback "AI ใช้งานไม่ได้ชั่วคราว · แสดง stats เท่านั้น" with retry

### Validation
- Cannot proceed past Step 4 with <10 questions
- Cannot publish if any required question lacks options/setup
- Cannot edit questions once collecting > 5 responses (lock with warning)

### Privacy / Ethics
- Default: anonymous respondents (no PII captured)
- IRB-friendly: optional consent screen at start of survey
- Anonymized export: strip IPs/timestamps from CSV

### Offline / network
- Auto-save draft every 5 sec on study setup
- Respondent answers persist locally (localStorage) until submit

---

## 14. Component Library Needed (for Claude Design)

Reusable components to design (Shadcn-flavor):

| Component | Variants |
|---|---|
| `BrandEquityScoreRing` | sizes: hero (200px), card (80px), mini (40px); tier-based gradient |
| `DimensionBadge` | 4 dimensions, sizes sm/md/lg, with icon |
| `QuestionCard` (editor) | 9 question types, edit/duplicate/delete actions |
| `QuestionRender` (respondent) | 9 types, mobile-first |
| `LikertEmojiBar` | 5/7/10 point variants |
| `NPSGauge` | -100 to +100 with 3-color zones |
| `IdentityImageMap` | side-by-side traits with connector arrows |
| `RadarChart` (perceived quality) | up to 7 axes |
| `BrandWordCloud` | with target-brand highlight |
| `SegmentSlicerRail` | sticky left, multi-toggle |
| `AIInsightCard` | red-cornered, 3-bullet, with citation links |
| `StudyStepper` | 5 steps horizontal |
| `DashboardSection` | dimension-colored header + chart + insight slot |
| `RespondentProgress` | dimension-segmented progress bar |
| `ShareCard` | QR + copy + LINE/email |

---

## 15. Glossary (for designer reference)

| Term | Meaning |
|---|---|
| **Aaker's 4D** | Brand Equity = Awareness + Perceived Quality + Brand Associations (Identity/Image) + Loyalty |
| **Top-of-mind** | First brand recalled without aid |
| **Aided recall** | Recognition from a presented list |
| **NPS** | Net Promoter Score, -100 to +100 |
| **Identity vs Image** | What brand wants to be vs what consumers actually perceive |
| **Cronbach's α** | Reliability coefficient for multi-item scales (target ≥0.7) |
| **Top-2-Box** | % responses choosing top 2 options on a Likert scale |

---

## 16. Out of Scope (v1)

- Real-time A/B testing of brand designs
- Tracking studies (longitudinal — wave 1 vs wave 2 comparison) — defer to v2
- Conjoint sub-study integration (later)
- Pricing optimization (handled by existing Conjoint module)
- Social listening / scraped brand mentions

---

## 17. Open Design Questions for Claude Design

1. Should the dashboard's "Brand Equity Score" hero ring be **animated count-up** on first view? (recommend: yes, 1.2s ease-out)
2. For mobile respondent flow, should we **gamify** dimension completion with mini badges? (recommend: yes, subtle confetti at section ends)
3. Identity-Image Alignment Map — should connector arrows be **animated** drawing in? (recommend: yes, 800ms stagger)
4. PDF/DOCX export — should there be a **brand-styled cover page** option (using brand logo + colors)? (recommend: yes, 3 templates)
5. Should the AI insight cards be **dismissible** (researcher curates final report)? (recommend: yes, with restore option)

---

## 18. Reference Mood / Inspiration (for Claude Design)

- **Stripe Atlas dashboards** — clean, dense, chart-driven
- **Notion AI panels** — friendly AI insight cards with citation chips
- **Linear's progress bars** — segmented progress aesthetic
- **Aaker's Brand Asset Valuator** classic visual frameworks — modernize, don't copy
- **Existing app's Alumni module** (`/app/memory/alumni-spec/`) — same DNA, IBM Plex font, Red/Blue accents

---

*End of Spec v1.0 · 2026-04-27*
