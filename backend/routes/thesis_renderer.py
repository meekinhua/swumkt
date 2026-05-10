"""
thesis_renderer.py — Generate thesis-ready DOCX report from a brand-equity study.

Scope (academic-defensible, ready to paste into a chapter):
  · Cover + abstract
  · Methodology (Aaker-aligned weighted composite + sample size + filter snapshot)
  · Results — composite scores with delta from neutral, per-dimension tables of
    every question with mean, std, n, score_100
  · Identity vs Image overlap analysis
  · AI Master Insights (themes, opportunities, risks)
  · References (APA 7) — Aaker, Keller, Reichheld, DeVellis

Inputs:
  - study (full doc from `brand_studies`)
  - aggregate (output of _aggregate_responses)
  - filter info (active filter when generating, for "Sample" section)
  - sample_n_total / sample_n_filtered

Output: BytesIO containing .docx
"""

import io
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

INK = RGBColor(0x14, 0x16, 0x1A)
RED = RGBColor(0xE2, 0x2B, 0x37)
BLUE = RGBColor(0x35, 0x97, 0xE4)
GREY = RGBColor(0x5B, 0x5E, 0x63)


def _h(doc: Document, text: str, level: int = 1, color: Optional[RGBColor] = None):
    p = doc.add_heading(text, level=level)
    if color and p.runs:
        p.runs[0].font.color.rgb = color


def _p(doc: Document, text: str, *, italic: bool = False, bold: bool = False,
       size: int = 11, color: Optional[RGBColor] = None) -> Any:
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.font.size = Pt(size)
    r.italic = italic
    r.bold = bold
    if color:
        r.font.color.rgb = color
    return p


def _eyebrow(doc: Document, text: str, color: RGBColor = RED):
    """Mono-style eyebrow line to mark a section."""
    p = doc.add_paragraph()
    r = p.add_run(text.upper())
    r.font.size = Pt(8.5)
    r.font.color.rgb = color
    r.font.name = "Consolas"
    p.paragraph_format.space_after = Pt(2)


def _kv_table(doc: Document, rows: List[tuple]) -> None:
    """Two-column key/value table, no header, lightly ruled."""
    t = doc.add_table(rows=len(rows), cols=2)
    t.autofit = False
    t.columns[0].width = Cm(5.5)
    t.columns[1].width = Cm(11.0)
    for i, (k, v) in enumerate(rows):
        cell_k = t.rows[i].cells[0]
        cell_v = t.rows[i].cells[1]
        cell_k.width = Cm(5.5)
        cell_v.width = Cm(11.0)
        rk = cell_k.paragraphs[0].add_run(str(k))
        rk.font.size = Pt(9.5)
        rk.font.color.rgb = GREY
        rk.bold = True
        rv = cell_v.paragraphs[0].add_run("" if v is None else str(v))
        rv.font.size = Pt(10.5)
        for c in (cell_k, cell_v):
            c.vertical_alignment = WD_ALIGN_VERTICAL.TOP


def _data_table(doc: Document, headers: List[str], rows: List[List[Any]]):
    t = doc.add_table(rows=len(rows) + 1, cols=len(headers))
    # header
    for i, h in enumerate(headers):
        c = t.rows[0].cells[i]
        run = c.paragraphs[0].add_run(h)
        run.bold = True
        run.font.size = Pt(9)
        run.font.color.rgb = INK
    for ri, row in enumerate(rows, start=1):
        for ci, val in enumerate(row):
            c = t.rows[ri].cells[ci]
            run = c.paragraphs[0].add_run("" if val is None else str(val))
            run.font.size = Pt(9.5)


def _tier_label(score: Optional[float]) -> str:
    if score is None:
        return "Insufficient data"
    if score >= 80:  return "Champion (ผู้นำตลาด)"
    if score >= 65:  return "Strong (แข็งแกร่ง)"
    if score >= 50:  return "Healthy (สุขภาพดี)"
    if score >= 35:  return "At Watch (เฝ้าระวัง)"
    return "At Risk (เสี่ยง)"


def _fmt(v: Any, suffix: str = "") -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{round(v, 1)}{suffix}"
    return f"{v}{suffix}"


_QUESTION_KIND_LABEL = {
    # Awareness
    "unaided_top_of_mind": "Top-of-Mind Recall",
    "unaided_recall":      "Spontaneous Recall",
    "aided_recognition":   "Aided Recognition",
    "logo_unaided":        "Logo Unaided Recognition",
    "logo_aided":          "Logo Aided Recognition",
    "color_recall":        "Color Association Recall",
    "brand_familiarity":   "Brand Familiarity (Likert)",
    # Quality
    "overall_quality":       "Overall Perceived Quality",
    "attribute_reliability": "Reliability",
    "attribute_value":       "Value-for-Money",
    "attribute_design":      "Design / Aesthetics",
    "brand_vs_competitor":   "Comparative vs Competitor",
    # Identity
    "image_traits_aided":    "Trait-Grid Identity Pickup",
    "brand_promise_match":   "Brand Promise Delivery",
    "as_org_trust":          "As Organization · Trust",
    "as_org_innovation":     "As Organization · Innovation",
    "as_org_responsibility": "As Organization · Responsibility",
    "as_person_personality": "As Person · Personality Grid",
    "as_person_relatable":   "As Person · Relatable",
    "as_person_aspirational":"As Person · Aspirational",
    "as_symbol_recognizability": "As Symbol · Recognizability",
    "as_symbol_distinctive": "As Symbol · Distinctiveness",
    "as_product_premium":    "As Product · Premium",
    "as_product_variety":    "As Product · Variety",
    "as_product_quality":    "As Product · Quality",
    "image_personality":     "Open Personality (AI normalized)",
    "image_one_word":        "Open One-Word (AI normalized)",
    # Loyalty
    "nps":                   "Net Promoter Score (NPS)",
    "repeat_intent":         "Repurchase Intent",
    "switching_resistance":  "Switching Resistance",
}


def _kind_label(kind: Optional[str]) -> str:
    return _QUESTION_KIND_LABEL.get(kind or "", (kind or "").replace("_", " ").title())


# ============================================================================

def render_thesis_docx(
    *,
    study: Dict[str, Any],
    aggregate: Dict[str, Any],
    sample_n_total: int,
    sample_n_filtered: int,
    filter_info: Optional[Dict[str, Any]] = None,
    author_name: Optional[str] = None,
) -> io.BytesIO:
    """Build and return a BytesIO containing the thesis-ready .docx report."""
    doc = Document()

    # Page-wide font defaults
    style = doc.styles["Normal"]
    style.font.name = "Sarabun"
    style.font.size = Pt(11)
    style.font.color.rgb = INK

    brand = study.get("brand") or {}
    brand_name = brand.get("name") or "Brand"
    composite = aggregate.get("composite") or {}
    questions = aggregate.get("questions") or []

    # ============ COVER ============
    _eyebrow(doc, "BRAND EQUITY · ACADEMIC REPORT")
    _h(doc, f"{brand_name} — Brand Health Diagnostic", level=0)
    _p(doc,
       "An Aaker-aligned brand equity assessment with weighted composite scoring "
       "across Awareness, Perceived Quality, Brand Identity, and Loyalty.",
       italic=True, color=GREY, size=11)

    today = datetime.now(timezone.utc).strftime("%d %B %Y")
    _kv_table(doc, [
        ("Brand", brand_name),
        ("Category", brand.get("category") or "—"),
        ("Competitors", ", ".join(brand.get("competitors") or []) or "—"),
        ("Sample size (filtered / total)", f"{sample_n_filtered} / {sample_n_total}"),
        ("Report generated", today),
        ("Author", author_name or "—"),
    ])

    # ============ EXECUTIVE SUMMARY ============
    doc.add_paragraph()
    _eyebrow(doc, "01 · EXECUTIVE SUMMARY")
    _h(doc, "Brand Equity Score (BES)", level=1)
    overall = composite.get("overall")
    _p(doc, f"BES = {_fmt(overall)} / 100  ·  Tier: {_tier_label(overall)}",
       bold=True, size=14)
    summary_rows = [
        ("Awareness",         _fmt(composite.get("awareness")),  _tier_label(composite.get("awareness"))),
        ("Perceived Quality", _fmt(composite.get("quality")),    _tier_label(composite.get("quality"))),
        ("Brand Identity",    _fmt(composite.get("identity")),   _tier_label(composite.get("identity"))),
        ("Loyalty",           _fmt(composite.get("loyalty")),    _tier_label(composite.get("loyalty"))),
    ]
    _data_table(doc, ["Dimension", "Score (0-100)", "Tier"], summary_rows)

    # ============ METHODOLOGY ============
    doc.add_page_break()
    _eyebrow(doc, "02 · METHODOLOGY")
    _h(doc, "Conceptual framework", level=1)
    _p(doc,
       "This study operationalizes Aaker's customer-based brand equity model (Aaker, "
       "1991, 1996) integrated with Keller's CBBE pyramid (Keller, 1993) and "
       "Reichheld's Net Promoter Score (Reichheld, 2003). Composite scores per "
       "dimension use kind-aware weighted aggregation: every question on the "
       "instrument is mapped to a signal kind and assigned a theoretically "
       "informed weight; weights renormalize over signals that are present so a "
       "study with partial coverage still yields a defensible composite.")

    _h(doc, "Scoring", level=1)
    _p(doc,
       "Likert items (5- and 7-point) are normalized to 0–100 via "
       "(mean − 1) / (scale_max − 1) × 100. NPS uses the standard "
       "(promoters − detractors)/n × 100 transformed to 0–100 via (NPS+100)/2. "
       "Comparative 7-pt items use (7 − mean)/6 × 100 with focal brand on the "
       "left. Open-ended items (top-of-mind, recall) are AI-normalized into "
       "canonical brand buckets and contribute share-of-respondents (0–100).")

    _h(doc, "Dimension weights", level=1)
    _data_table(doc, ["Dimension", "Signal", "Weight"],
        [
            ["Awareness", "Top-of-Mind",          "0.40"],
            ["Awareness", "Spontaneous Recall",   "0.25"],
            ["Awareness", "Aided Recognition",    "0.20"],
            ["Awareness", "Brand Familiarity",    "0.15"],
            ["Quality",   "Overall Quality",      "0.35"],
            ["Quality",   "Reliability",          "0.20"],
            ["Quality",   "Value-for-Money",      "0.20"],
            ["Quality",   "Comparative vs Competitor", "0.15"],
            ["Quality",   "Design",               "0.10"],
            ["Identity",  "Trait-Grid Pickup vs Intended", "0.20"],
            ["Identity",  "Brand Promise Match",  "0.15"],
            ["Identity",  "Aaker 4 Perspectives (Org/Person/Symbol/Product)", "≈0.50"],
            ["Identity",  "AI Identity-Image Alignment", "0.10"],
            ["Loyalty",   "Net Promoter Score",   "0.40"],
            ["Loyalty",   "Repurchase Intent",    "0.30"],
            ["Loyalty",   "Switching Resistance", "0.30"],
        ])

    _h(doc, "Sample", level=1)
    _kv_table(doc, [
        ("Total responses collected", sample_n_total),
        ("Responses included in this report", sample_n_filtered),
        ("Filter applied",
         _format_filter(filter_info) if filter_info else "None — full sample"),
        ("Sample-size note",
         "n ≥ 30 recommended for thesis-grade inference; n ≥ 10 enables "
         "indicative reporting only."),
    ])

    # ============ RESULTS ============
    doc.add_page_break()
    _eyebrow(doc, "03 · RESULTS BY DIMENSION")

    for dim_key, dim_label in [
        ("awareness", "Awareness"),
        ("quality",   "Perceived Quality"),
        ("identity",  "Brand Identity"),
        ("loyalty",   "Loyalty"),
    ]:
        _h(doc, f"{dim_label} — {_fmt(composite.get(dim_key))} / 100",
           level=1, color=RED)
        dim_qs = [q for q in questions if q.get("dimension") == dim_key
                  and not q.get("compare_brand")]
        if not dim_qs:
            _p(doc, "No questions in this dimension yet.", italic=True, color=GREY)
            continue

        rows = []
        for q in dim_qs:
            s = q.get("stats") or {}
            rows.append([
                _kind_label(q.get("kind")),
                q.get("type") or "",
                s.get("n") or "—",
                _fmt(s.get("mean")),
                _fmt(s.get("std")),
                _fmt(s.get("score_100")),
            ])
        _data_table(doc, ["Question kind", "Type", "n", "Mean", "Std", "Score (0-100)"], rows)

        # Comparative subsection (if any compare_brand q's exist for quality)
        if dim_key == "quality":
            comps = [q for q in questions if q.get("compare_brand")]
            if comps:
                _h(doc, "Comparative — vs each competitor", level=2)
                comp_rows = []
                for q in comps:
                    s = q.get("stats") or {}
                    comp_rows.append([
                        q.get("compare_brand") or "—",
                        q.get("axis_label") or "—",
                        s.get("n") or "—",
                        _fmt(s.get("mean")),
                        _fmt(s.get("favor_left_pct"), "%"),
                        _fmt(s.get("favor_right_pct"), "%"),
                        _fmt(s.get("score_100")),
                    ])
                _data_table(doc,
                    ["Competitor", "Axis", "n", "Mean", "Focal favors %", "Comp favors %", "Score (focal)"],
                    comp_rows)

    # ============ IDENTITY VS IMAGE ============
    ai_cache = study.get("ai_cache") or {}
    ii = ai_cache.get("identity_image") or {}
    if ii:
        doc.add_page_break()
        _eyebrow(doc, "04 · IDENTITY vs IMAGE OVERLAP")
        _h(doc, "Aaker identity-image gap analysis", level=1)
        intended = (study.get("identity") or {}).get("traits") or []
        perceived = ii.get("perceived_traits") or ii.get("image_traits") or []
        # AI sometimes emits dicts {trait, count, sentiment} instead of plain strings
        if isinstance(perceived, list):
            perc_str = ", ".join(
                (p.get("trait") or p.get("label") or str(p)) if isinstance(p, dict) else str(p)
                for p in perceived
            )
        else:
            perc_str = str(perceived or "—")
        align = ii.get("alignment_score")
        _kv_table(doc, [
            ("Intended traits (brand input)", ", ".join(intended) or "—"),
            ("Perceived traits (AI-extracted from open responses)", perc_str or "—"),
            ("Alignment score", f"{_fmt(align)} / 100"),
        ])
        if ii.get("summary"):
            _p(doc, ii["summary"], italic=True)

    # ============ AI MASTER INSIGHTS ============
    insights = ai_cache.get("master_insights") or []
    if insights:
        doc.add_page_break()
        _eyebrow(doc, "05 · STRATEGIC INSIGHTS")
        _h(doc, "AI-derived master insights", level=1)
        for i, ins in enumerate(insights, 1):
            if isinstance(ins, str):
                _p(doc, f"{i}. {ins}")
            elif isinstance(ins, dict):
                title = ins.get("title") or ins.get("headline") or "Insight"
                body = ins.get("body") or ins.get("description") or ""
                _p(doc, f"{i}. {title}", bold=True, size=11)
                if body:
                    _p(doc, body, size=10.5, color=GREY)

    # ============ REFERENCES ============
    doc.add_page_break()
    _eyebrow(doc, "06 · REFERENCES")
    _h(doc, "Cited works (APA 7)", level=1)
    _p(doc,
       "Aaker, D. A. (1991). Managing brand equity: Capitalizing on the value of "
       "a brand name. The Free Press.")
    _p(doc,
       "Aaker, D. A. (1996). Building strong brands. The Free Press.")
    _p(doc,
       "Keller, K. L. (1993). Conceptualizing, measuring, and managing customer-"
       "based brand equity. Journal of Marketing, 57(1), 1–22. "
       "https://doi.org/10.2307/1252054")
    _p(doc,
       "Reichheld, F. F. (2003). The one number you need to grow. "
       "Harvard Business Review, 81(12), 46–54.")
    _p(doc,
       "DeVellis, R. F. (2017). Scale development: Theory and applications "
       "(4th ed.). SAGE Publications.")

    # Output
    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf


def _format_filter(f: Dict[str, Any]) -> str:
    parts = []
    if f.get("from"): parts.append(f"from {str(f['from'])[:10]}")
    if f.get("to"):   parts.append(f"to {str(f['to'])[:10]}")
    segs = f.get("segments") or {}
    for k, vs in segs.items():
        if vs:
            parts.append(f"{k}={','.join(vs)}")
    return " · ".join(parts) if parts else "None"
