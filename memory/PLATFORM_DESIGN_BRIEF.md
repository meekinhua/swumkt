# SWU MKT — Web Platform Structure & Design Brief

> **For**: External design tool (Claude artifacts / Figma / designer)
> **Purpose**: Comprehensive spec to redesign the public-facing pages of SWUMKT.org without losing product context.
> **Owner**: สาขาการตลาด มหาวิทยาลัยศรีนครินทรวิโรฒ (Department of Marketing, Srinakharinwirot University)
> **Live URL**: https://swumkt.org
> **Primary Language**: Thai (ภาษาไทย) — English is secondary, used for SEO keyword variants and academic terms.

---

## 1. WHAT THIS PRODUCT IS

SWU MKT is an **open marketing-research platform** built by the Marketing department at Srinakharinwirot University. It's three things at once:

1. **Public showcase of brand-research studies** — anyone can browse real Brand Health Check reports (Awareness · Quality · Identity · Loyalty scores) that researchers chose to publish.
2. **Free research tools** — Brand Equity surveys, Conjoint Analysis (Choice-Based Conjoint with D-Optimal design + market simulator), Customer Journey mapping, Customer Perception/Behavior tools, Survey Builder, Kanban for project management.
3. **Marketing knowledge hub** — long-form educational articles in Thai about brand strategy, consumer behavior, research methodology, that link readers into the tools.

Audience: Thai university students, SME owners, marketing professionals, researchers. Tone: **academic but accessible · authoritative · trustworthy · open**. Emotional brief: feel like reading *Monocle* / *The Atlantic* / *Aeon Magazine* — editorial, slow-paced, generous whitespace, IBM Plex Serif headlines.

---

## 2. SITE MAP (PUBLIC SURFACES TO REDESIGN)

```
/                                     Homepage  ← HERO is the brand showcase
├── /showcase                         Public showcase index (all brands)
├── /showcase/{share_token}           Single brand's public dashboard (read-only)
├── /learn                            Knowledge Hub index (10+ articles)
│   ├── /learn/brand-equity
│   ├── /learn/conjoint-analysis
│   ├── /learn/customer-journey-mapping
│   ├── /learn/customer-perception
│   ├── /learn/customer-behavior
│   ├── /learn/positioning-strategy
│   ├── /learn/segmentation-targeting
│   ├── /learn/4ps-marketing-mix
│   ├── /learn/swot-analysis
│   └── /learn/marketing-research-methods
├── /about/swu-marketing              Pillar page about the department (E-E-A-T)
├── /login                            Auth (already designed, OK)
└── /register                         Auth
```

Behind auth (do NOT redesign these — internal tools): `/brand-equity/*`, `/market-research/*`, `/projects/*`, `/dashboard`, `/admin`.

---

## 3. BRAND IDENTITY

### Logo
- URL: `https://customer-assets.emergentagent.com/job_swu-market/artifacts/ntstn8tz_SWUMKT%20Logo%20Concept%20-%20Edited.png`
- Mark: stylized "SWU/MKT" wordmark with red+blue accents on white. Use at small height (28-40px in topbar) so the mark stays legible.
- The logo itself uses brand red and blue, but the **website chrome should NOT lean on those colors**. Keep the canvas neutral and let the logo carry color.

### Color tokens (current CSS variables)
| Token | Value | Use |
|---|---|---|
| `--paper` | `#F7F4EE` | Body background — slightly warm off-white, "newspaper paper" feel |
| `--paper-dark` | `#EBE7DD` | Surface 2 (alternating section backgrounds) |
| `--ink` | `#1A1A1A` | Body text + strong UI elements |
| `--ink-2` | `#4A4A4A` | Secondary text |
| `--ink-3` | `#737373` | Muted text |
| `--be-red` | `#C8102E` | Editorial accent — eyebrows, key stats, pull-quote borders. Use **sparingly** (≤5% of any view). |
| `--be-green` | `#0E5538` | Status "PUBLIC" / positive sentiment |
| `--rule` | `#D1CCC2` | Hairline borders |
| `--rule-strong` | `#1A1A1A` | Section dividers (1px solid black) |

**Rule**: never use multi-stop gradients on chrome. Solid colors + 1px hairlines only. Dark sections use solid `--ink` (#1A1A1A), not navy or charcoal gradient.

### Typography stack

```
Headings → 'IBM Plex Serif', 'IBM Plex Serif Thai', Georgia, serif
Body     → 'IBM Plex Sans Thai', 'IBM Plex Sans', system-ui, sans-serif
Mono/UI  → 'IBM Plex Mono', ui-monospace, monospace
```

- Big serif headlines should feel **editorial / scholarly**, weight 500 (medium), not 700.
- Body text uses **Plex Sans Thai** at 16-18px / 1.6-1.75 line-height for long-form readability.
- Mono is used **for eyebrows, metadata, tags, ALL CAPS uppercase** with `letter-spacing: 0.10em–0.18em` — never for body content.

Type scale (clamp-based):
- H1 hero: `clamp(46px, 8vw, 96px)` line-height `0.98`, letter-spacing `-0.02em`
- H1 article: `clamp(32px, 5vw, 52px)` line-height `1.1`
- H2: `28-36px` weight 500
- Eyebrow: `11-12px` mono uppercase, letter-spacing `0.14em`
- Body: `16-18px` line-height `1.6-1.75`
- Tiny meta: `11px` mono uppercase

### Spacing & rhythm
- Container: `max-width: 1180px`, padding `0 32px` (mobile `0 18px`)
- Section vertical: `60-80px` between major sections
- Use **2-3× more whitespace** than feels comfortable — paper feel
- Borders: only 1px solid (`--rule` for hairlines, `--ink` for emphasis)
- Corners: **never round more than 0px** — sharp edges only. The single allowed exception is profile avatars (circular).

### Motion
- Hover transitions: `0.15s ease` on transform + border-color only — never on `all`
- Scroll: do NOT use Lenis or smooth-scroll polyfills (Core Web Vitals matter for SEO)
- Card hover: `translateY(-2px)` + border darkens to `--ink`
- No parallax, no WebGL, no canvas animations — performance is a ranking factor

---

## 4. PAGE-BY-PAGE BRIEF

### 4.1 `/` — Homepage  ← TOP PRIORITY REDESIGN

**Goal**: Make a visitor immediately understand "this is a credible university research platform with real, public brand studies" — and convert them to either click into a showcase, sign up, or read an article.

**Current state**: existing implementation at `/app/frontend/src/pages/HomePage.jsx` works but feels too dense / not editorial enough. The user wants something more striking.

**Section sequence (recommended)**:

1. **Topbar (sticky)** — Logo wordmark left · nav right (`SHOWCASE / LEARN / ABOUT / Sign in`). Height 64px. Border-bottom 1px on scroll only.

2. **HERO** — Asymmetric layout. Left 60%: massive serif headline (3 lines) like:
   > งานวิจัย<br>แบรนด์ที่<br>*เปิดเผย*.   ← red italic on the last word

   Sub-paragraph in Plex Sans Thai (~18px, 720px max-width).
   Two CTAs (primary black solid "ดูผลงานทั้งหมด" + ghost "เริ่มสร้างวิจัยฟรี").

   Right 40%: showcase brand grid teaser — 3-4 brand logo cards with name+category, hover reveals subtle red dot/score.

   The hero should feel like the **front page of a magazine**, not a SaaS marketing page. Allow asymmetry — left text doesn't need to be vertically centered with right grid.

3. **Stats strip** (optional, if the user has it) — `n brands · n respondents · n articles` in mono uppercase, separated by 1px hairlines.

4. **Tools bento grid** — Use 1px-gap-on-dark-background pattern (CSS `gap: 1px; background: var(--rule-strong)`). 8 tools in `repeat(auto-fill, minmax(280px, 1fr))`. Each cell: tag (red mono) → serif title → 1-line sans description → "OPEN →" mono link. Hover: cell turns pure white.

5. **Editorial divider** — 1px solid black across full width.

6. **Knowledge Hub teasers** — heading "เรียนการตลาด ฉบับ มศว." + 4 article cards (top-border style, no bg). Each: red mono category · serif title · 2-line sans excerpt.

7. **About band on dark** — full-width black section with white text. Big serif headline + paragraph + red CTA "อ่านเรื่องเรา".

8. **Footer (sitemap-style)** — 4 columns: EXPLORE / TOOLS / LEARN / ACCOUNT. Each column: mono caps heading + 4-6 plain-text links. Bottom: copyright in mono tiny.

### 4.2 `/showcase` — Public Showcase Index

Hero "Brand Health, in Public." (massive italic serif), stats bar (BRANDS · RESPONDENTS · READY TO READ), search input under hairline, then grid of brand cards. Each card: BrandLogo (48px) → serif name → category → "VS · {competitors}" → status pill + n=count → "VIEW REPORT →".

### 4.3 `/showcase/{token}` — Single Brand Dashboard

Already built — Swiss/Editorial style with score ring, radar chart, identity-vs-image map, perceptual map, master insights, AI analysis. **Do not redesign** unless explicitly asked.

### 4.4 `/learn` — Knowledge Hub Index

Magazine-style. Hero: eyebrow → "เรียนการตลาด กับสาขา MKT มศว." (massive italic serif) → 760px paragraph. Below: grid of articles. Each card uses **top-border-only treatment** (1px solid black at top, no other border, no bg). Inside: red mono category + read time → serif title → 2-line excerpt → "READ ARTICLE →".

### 4.5 `/learn/{slug}` — Article Page

Editorial reading experience. Layout:
- **Breadcrumb**: `HOME / LEARN / {CATEGORY}` mono tiny
- **Header**: red mono category + read time + updated date → massive serif title (52px) → English subtitle (mono italic muted) → 18px sans Thai description
- **Body**: single column 720-820px max. Font 16px line-height 1.75. H2 sections (28px serif). Bold inline = `<strong>` ink + weight 600. Links = red underline. Bullet lists. Blockquotes get a 4px red left border + italic serif.
- **Inline TOOL CTA block** (mid-article): black bg, white text. Mono eyebrow "TRY THIS NOW · ใช้เครื่องมือนี้ทันที" → serif tool name → sans description → red button "OPEN TOOL →".
- **Author byline**: mono "WRITTEN BY" → serif "SWU Marketing Research Team" → sans line "Department of Marketing · Srinakharinwirot University".
- **Related articles**: 3 cards in cluster pattern, top-border-only, smaller (18px serif title).

### 4.6 `/about/swu-marketing` — Pillar Page (E-E-A-T)

Hero "การตลาด มศว. — วิจัย · ปฏิบัติ · เปิดเผย." → campus image (full-bleed, slight grayscale + contrast filter) → 3 stat blocks (1974 / 5 streams / Open Platform) → mission section (long-form Plex Sans Thai paragraphs) → tools shortcut on dark band.

---

## 5. REUSABLE EDITORIAL COMPONENTS

These should appear consistently across pages:

### 5.1 Eyebrow
```html
● PUBLIC SHOWCASE · LIVE BRAND RESEARCH FROM SWU MKT
```
- Red dot (8px, optional `animate-pulse` if live data) + mono uppercase + `letter-spacing: 0.14em`
- Always sits above an H1/H2

### 5.2 Editorial Card (article, brand, tool)
- 1px solid black top border (no other border, no rounded corners)
- Inside flow: `mono red category` → `serif title` → `sans excerpt` → `mono "READ →"` link
- Hover: `translateY(-2px)`, transition 0.15s

### 5.3 Bento Grid (tools / showcase brands)
- `gap: 1px; background: var(--rule-strong); border: 1px solid var(--rule-strong)`
- Cells default `var(--paper)`, hover `#fff`
- Sharp edges
- Use `auto-fill, minmax(280px, 1fr)` for responsive flow

### 5.4 Inline Tool CTA (in articles)
- Full-width-of-content block, black bg, white text
- Tiny mono eyebrow → serif headline → sans paragraph → red mono uppercase button

### 5.5 Sitemap Footer
- 4 columns, mono caps headings, plain Plex Sans Thai links, hover → red

### 5.6 BrandLogo
- 48px square
- If brand has uploaded logo or URL: show it
- Else: gradient background (rotation through 5 IDE-style gradients) + brand initial in serif white
- Already implemented — see `/app/frontend/src/pages/brand-equity/be-components.jsx`

### 5.7 Status Pill
- Mono tiny, 1px border, uppercase, `letter-spacing: 0.10em`
- Variants: `● PUBLIC` (green), `○ AWAITING DATA` (gray), `● COLLECTING` (red dot pulse)

---

## 6. CONTENT INVENTORY (for designer reference)

10 SEO articles already drafted in Thai with substantive content (~600-1000 words each). Topics + slugs:

| Slug | Title (TH) | Category | Read |
|---|---|---|---|
| `brand-equity` | Brand Equity คืออะไร · เข้าใจคุณค่าแบรนด์ตามแนว Aaker | BRAND STRATEGY | 9 min |
| `conjoint-analysis` | Conjoint Analysis คืออะไร · เทคนิควิจัยตลาดที่นักการตลาดต้องรู้ | RESEARCH METHOD | 11 min |
| `customer-journey-mapping` | Customer Journey Mapping · แผนที่การเดินทางของลูกค้า | CUSTOMER EXPERIENCE | 8 min |
| `customer-perception` | Customer Perception · การรับรู้ของลูกค้าที่กำหนดยอดขาย | CONSUMER PSYCHOLOGY | 7 min |
| `customer-behavior` | Consumer Behavior · พฤติกรรมผู้บริโภค | CONSUMER PSYCHOLOGY | 7 min |
| `positioning-strategy` | Positioning Strategy · ฉบับ Trout & Ries | BRAND STRATEGY | 8 min |
| `segmentation-targeting` | STP Marketing · ฉบับ Kotler | MARKETING STRATEGY | 8 min |
| `4ps-marketing-mix` | 4Ps Marketing Mix + 7Ps | MARKETING FUNDAMENTALS | 6 min |
| `swot-analysis` | SWOT Analysis · TOWS Matrix | STRATEGIC PLANNING | 5 min |
| `marketing-research-methods` | Marketing Research Methods · 7 วิธี | RESEARCH METHOD | 9 min |

Full content lives at `/app/frontend/src/pages/learn/learnContent.js`.

---

## 7. DATA / API CONTRACT (for live pages)

### Showcase index data (used in homepage hero + `/showcase`)
```http
GET /api/brand-equity/showcase    → no auth
```
Response shape:
```json
{
  "showcases": [
    {
      "id": "uuid",
      "share_token": "abcd1234",
      "status": "completed",
      "brand_name": "TEST_UIBrand",
      "category": "กาแฟ",
      "competitors": ["Comp1", "Comp2", "Comp3"],
      "logo_url": "https://...",            // optional external URL
      "logo_asset": { "image_base64": "...", "mime_type": "image/png" },  // optional uploaded
      "response_count": 12,
      "ready_for_dashboard": true,           // n >= 10
      "created_at": "ISO",
      "updated_at": "ISO"
    }
  ],
  "total": 1
}
```

### Single showcase data (`/showcase/{token}`)
```http
GET /api/brand-equity/showcase/{share_token}    → no auth
```
Returns brand + identity + aggregate scores + AI cache (themes, identity_image, master_insights).

### Tool inventory (for Tools grid — currently hardcoded)
```js
const TOOLS = [
  { p: '/brand-equity', t: 'Brand Health Check', s: 'วัด Brand Equity ตาม Aaker · 4 มิติ', tag: 'BRAND' },
  { p: '/market-research/conjoint-analysis', t: 'Conjoint Analysis', s: 'CBC + D-Optimal + Market Simulator', tag: 'RESEARCH' },
  { p: '/market-research', t: 'Customer Journey', s: 'Map touchpoints และ pain points', tag: 'CX' },
  { p: '/market-research', t: 'Customer Perception', s: 'Perceptual Map + Sentiment AI', tag: 'PSYCH' },
  { p: '/market-research', t: 'Customer Behavior', s: 'Decision-process analytics', tag: 'PSYCH' },
  { p: '/market-research', t: 'Survey Builder', s: 'AI-assisted survey design', tag: 'TOOL' },
  { p: '/content', t: 'Content Hub', s: 'Knowledge base for marketing', tag: 'LEARN' },
  { p: '/projects', t: 'Kanban Projects', s: 'จัดการงานวิจัยเป็นทีม', tag: 'WORKFLOW' },
];
```

---

## 8. SEO REQUIREMENTS (must preserve in any redesign)

Every redesigned public page must:

1. Use the `useDocumentMeta` hook (`/app/frontend/src/hooks/useDocumentMeta.js`) which sets:
   - `<title>` (Thai-first, 50-60 chars)
   - `<meta name="description">` (150-160 chars)
   - OG tags: `og:type`, `og:title`, `og:description`, `og:image`, `og:url`, `og:site_name`
   - Twitter Card tags
   - `<link rel="canonical">`
   - JSON-LD structured data appropriate to page type

2. JSON-LD types per page:
   - Homepage → `WebSite`
   - `/showcase` → `CollectionPage` + `ItemList`
   - `/showcase/{token}` → `Report` + `Brand` + `Organization` publisher
   - `/learn` → `CollectionPage` + `ItemList`
   - `/learn/{slug}` → `Article` (headline, datePublished, dateModified, author, publisher, image, keywords)
   - `/about/swu-marketing` → `EducationalOrganization`

3. Internal linking strategy:
   - Every article → 2-3 related articles + 1 tool CTA
   - Footer sitemap = 4 columns covering all crawlable URLs
   - Breadcrumb on article + about pages

4. Files maintained:
   - `/app/frontend/public/sitemap.xml` (14 URLs, update when adding articles)
   - `/app/frontend/public/robots.txt` (allow public, disallow auth pages, references sitemap)

---

## 9. PRIMARY KEYWORDS (Thai marketing search intent)

**Pillar terms** (high volume, generic):
การตลาด · การวิจัยตลาด · marketing research · brand strategy · พฤติกรรมผู้บริโภค

**Long-tail (each article targets one):**
- `brand equity คือ`, `แบรนด์เอควิตี้`, `Aaker framework`
- `conjoint analysis คือ`, `choice-based conjoint`, `CBC คือ`
- `customer journey map คือ`, `touchpoint คือ`, `customer experience`
- `customer perception คือ`, `perceptual map`, `sentiment analysis`
- `consumer behavior คือ`, `decision making process`, `EBM model`
- `positioning คืออะไร`, `Trout Ries`, `brand positioning`
- `STP คือ`, `market segmentation`, `Kotler`
- `4P marketing`, `7P marketing`, `marketing mix`, `ส่วนประสมการตลาด`
- `SWOT analysis คือ`, `TOWS matrix`
- `marketing research methods`, `quantitative research`, `qualitative research`

**Brand terms (E-E-A-T):**
สาขาการตลาด มศว · MKT SWU · มหาวิทยาลัยศรีนครินทรวิโรฒ · SWUMKT

---

## 10. INSPIRATION REFERENCES

When in doubt, lean toward:
- **Monocle Magazine** — measured, generous whitespace, mono-uppercase eyebrows, restrained color
- **The Atlantic** (web) — long-form readability, serif scholarly authority
- **Aeon Magazine** — confident editorial typography
- **Bloomberg Green / FT Alphaville** — data-as-editorial, hairline rules
- **Apple's "Today" cards in App Store** — bento grid aesthetic
- **Dezeen / It's Nice That** — magazine grid for showcase

Avoid:
- Stripe / Linear / Vercel SaaS look (gradients, neon accents, generic Inter)
- "Glassmorphism", neumorphism, big drop shadows
- Y-Combinator startup landing-page aesthetics

---

## 11. WHAT THE CURRENT IMPLEMENTATION GETS RIGHT

- `/showcase/{token}` brand dashboard — Swiss/Editorial vibe is solid, the user explicitly liked it
- `useDocumentMeta` hook for SEO — keep it
- IBM Plex Serif/Sans/Mono stack
- Editorial brand-card with top-border-only treatment
- Bento tools grid with 1px-gap-on-dark technique

## 12. WHAT THE USER FEELS IS NOT BEAUTIFUL ENOUGH

The homepage in particular feels:
- Not striking enough at first glance (hero competes with too many stats/CTAs)
- Too dense — needs more breathing room
- Bento tools grid feels like 8 generic cells; could be more curated/asymmetric
- Knowledge hub teasers underwhelming as a row of equal cards
- About band feels like an afterthought

Designer should consider:
- A truly **magazine-style asymmetric hero** where one large featured brand takes a half-page, with smaller brands tessellated around it
- Pull quotes / large-stat moments breaking up sections
- A second/third typeface accent for variety (e.g. condensed serif for stat counters)
- Tasteful use of brand logos as "graphic elements" (oversized, cropped)
- More confident use of the red accent — not just dots, but a single bold typographic moment per page

---

## 13. DELIVERABLES EXPECTED FROM THE EXTERNAL DESIGNER

For each redesigned page:
1. **Desktop hi-fi** (1440px width)
2. **Mobile hi-fi** (390px width)
3. **Spec annotations** — fonts, sizes, spacing, colors using the tokens above
4. **Component library** — eyebrow, editorial card, bento cell, inline tool CTA, sitemap footer
5. (Optional) **Motion notes** — what hovers, what animates on scroll, no parallax

Output format: artboards/PDF/Figma export — main agent will translate to React + the existing CSS variable tokens above.

---

## 14. FILES TO REFERENCE WHILE DESIGNING

- `/app/design_guidelines.json` — JSON structure of design tokens (machine-readable)
- `/app/frontend/src/pages/brand-equity/brand-equity-styles.css` — current Swiss/Editorial CSS implementation
- `/app/frontend/src/pages/brand-equity/be-components.jsx` — existing reusable React components (BrandLogo, BeTopbar, Icon, BeLoading)
- `/app/frontend/src/pages/HomePage.jsx` — current homepage (the one user finds underwhelming)
- `/app/frontend/src/pages/learn/learnContent.js` — full Thai content for all 10 articles
- `/app/frontend/src/hooks/useDocumentMeta.js` — SEO meta-tag hook

---

**END OF BRIEF.** Hand this file to Claude (or any designer) along with the live URL `https://swumkt.org` for context.
