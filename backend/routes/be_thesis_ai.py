"""
be_thesis_ai.py — AI-powered thesis (วิทยานิพนธ์) generator for Brand Equity studies.

Builds per-chapter Gemini prompts (chapters 1-5) then merges chapter outputs
into a single markdown blob that the existing `_create_thesis_docx` renderer
in server.py can convert into a SWU-iThesis formatted .docx.

Chapters 1-2 are explicitly tagged "ร่าง" (DRAFT) so the user knows to fine-tune.
Chapters 3-5 use real numbers from the aggregate.

References are brand-equity focused (Aaker, Keller, Reichheld, Kapferer, Kotler).
"""
import json
from typing import Any, Dict, List, Optional, Tuple


# ============================================================================
# Compact summarizer: turns aggregate into ≈1KB context for AI prompts
# ============================================================================

def _summarize_be_for_ai(
    *, study: Dict[str, Any], aggregate: Dict[str, Any],
    n_total: int, n_filtered: int,
) -> str:
    """Compact text summary so we don't blow Gemini's context with raw stats."""
    brand = study.get("brand") or {}
    composite = aggregate.get("composite") or {}
    questions = aggregate.get("questions") or []
    ai_cache = study.get("ai_cache") or {}
    ii = ai_cache.get("identity_image") or {}
    insights = ai_cache.get("master_insights") or []

    def _f(v):
        if v is None: return "—"
        if isinstance(v, float): return f"{round(v, 1)}"
        return str(v)

    lines: List[str] = []
    lines.append("=== STUDY ===")
    lines.append(f"Brand: {brand.get('name')} ({brand.get('category', 'n/a')})")
    if brand.get("competitors"):
        lines.append(f"Competitors: {', '.join(brand.get('competitors') or [])}")
    if (study.get("identity") or {}).get("traits"):
        lines.append(f"Intended identity traits: {', '.join(study['identity']['traits'])}")
    lines.append(f"Sample size: n={n_filtered} (of {n_total} total)")
    _adq = aggregate.get("sample_adequacy") or {}
    if _adq.get("moe_95_pct") is not None:
        lines.append(f"Max margin of error for a proportion (95%, SRS assumption): ±{_adq['moe_95_pct']} points")
    _norm = aggregate.get("normalization") or {}
    lines.append("Open-ended brand mentions counted by: " + {
        "ai": "LLM-assisted coding of each distinct answer (see coding tool below)",
        "manual": "researcher's manual code frame",
        "deterministic": "deterministic exact/unambiguous brand-name matching (no LLM)",
        "none": "no open-ended brand questions",
    }.get(_norm.get("basis") or "none", str(_norm.get("basis"))))

    lines.append("\n=== COMPOSITE SCORES (0-100) ===")
    lines.append(f"BES (Overall): {_f(composite.get('overall'))}")
    lines.append(f"Awareness: {_f(composite.get('awareness'))}")
    lines.append(f"Quality:   {_f(composite.get('quality'))}")
    lines.append(f"Identity:  {_f(composite.get('identity'))}")
    lines.append(f"Loyalty:   {_f(composite.get('loyalty'))}")

    # Per-question stats by dimension (concise)
    for dim_key, dim_label in [
        ("awareness", "AWARENESS"),
        ("quality",   "QUALITY"),
        ("identity",  "IDENTITY"),
        ("loyalty",   "LOYALTY"),
    ]:
        dim_qs = [q for q in questions if q.get("dimension") == dim_key
                  and not q.get("compare_brand")]
        if not dim_qs:
            continue
        lines.append(f"\n--- {dim_label} (per-question) ---")
        for q in dim_qs:
            s = q.get("stats") or {}
            kind = q.get("kind") or q.get("type") or "?"
            row = f"{kind}: n={s.get('n', 0)}"
            if s.get("mean") is not None:
                row += f", mean={_f(s.get('mean'))}"
            if s.get("std") is not None:
                row += f", sd={_f(s.get('std'))}"
            if s.get("score_100") is not None:
                row += f", score_100={_f(s.get('score_100'))}"
            if s.get("score_100_ci95"):
                row += f" (95% CI {s['score_100_ci95'][0]}–{s['score_100_ci95'][1]})"
            if q.get("reverse_scored"):
                row += " [reverse-scored]"
            if s.get("score") is not None:  # NPS raw score
                row += f", nps={_f(s.get('score'))}"
                if s.get("score_ci95"):
                    row += f" (95% CI {s['score_ci95'][0]} to {s['score_ci95'][1]})"
            # top counts (TOM/recall/aided)
            counts = s.get("counts") or []
            if counts:
                top = ", ".join(
                    f"{c.get('label')}={_f(c.get('pct'))}%" for c in counts[:5]
                )
                row += f" | top: {top}"
            if q.get("coding_status") == "uncoded":
                row += " | open-ended answers NOT coded (do not report frequencies/themes for this item)"
            lines.append(row)

    # Comparative items separately
    comps = [q for q in questions if q.get("compare_brand")]
    if comps:
        lines.append("\n--- COMPARATIVE (vs competitors) ---")
        for q in comps[:8]:
            s = q.get("stats") or {}
            lines.append(
                f"vs {q.get('compare_brand')} on {q.get('axis_label', q.get('kind'))}: "
                f"mean={_f(s.get('mean'))}, focal-favors={_f(s.get('favor_left_pct'))}%, "
                f"score_100={_f(s.get('score_100'))}"
            )

    # Brand vs competitor — paired tests (the ONLY significance tests in this report)
    cc = (aggregate.get("competitor_comparison") or {}).get("paired") or []
    tested = [r for r in cc if r.get("testable")]
    if tested:
        lines.append("\n=== BRAND vs COMPETITOR — paired t-tests (POMP 0-100, Holm-adjusted) ===")
        for r in tested[:12]:
            lines.append(
                f"{r['axis']} vs {r['competitor']}: diff={r['mean_diff']} (95% CI {r['diff_ci95'][0]} to "
                f"{r['diff_ci95'][1]}), t({r['df']})={r['t']}, p_holm={r.get('p_value_holm')}, "
                f"d_z={r['cohens_dz']}, n_pairs={r['n_pairs']}")
    dq = aggregate.get("data_quality") or {}
    if dq.get("flags"):
        fl = dq["flags"]
        lines.append(f"\nData-quality flags (not excluded): speeders={fl.get('speeder', 0)}, "
                     f"straight-liners={fl.get('straightliner', 0)}, duplicates={fl.get('duplicate', 0)}, "
                     f"rated-without-awareness={fl.get('unaware_rater', 0)}")

    # Identity-Image
    if ii:
        lines.append("\n=== IDENTITY vs IMAGE (qualitative LLM judgement — NOT part of any score) ===")
        lines.append(f"Aligned traits: {', '.join(ii.get('aligned') or []) or '—'}")
        lines.append(f"Lost traits (intended but not perceived): {', '.join(ii.get('lost') or []) or '—'}")
        lines.append(f"Unintended traits (perceived but not in identity): {', '.join(ii.get('unintended') or []) or '—'}")
        lines.append(f"LLM-judged alignment (opinion, not a measurement): "
                     f"{_f(ii.get('alignment_score_0_100') or ii.get('alignment_score'))}/100")
        if ii.get("narrative"):
            lines.append(f"AI narrative: {ii['narrative']}")

    # Master insights
    if insights:
        lines.append("\n=== AI MASTER INSIGHTS ===")
        for i, ins in enumerate(insights[:5], 1):
            if isinstance(ins, dict):
                hl = ins.get("headline") or ins.get("title") or ""
                ev = ins.get("evidence") or ins.get("body") or ""
                rec = ins.get("recommendation") or ""
                lines.append(f"{i}. {hl}")
                if ev: lines.append(f"   evidence: {ev}")
                if rec: lines.append(f"   → {rec}")
            else:
                lines.append(f"{i}. {ins}")

    return "\n".join(lines)


# ============================================================================
# Reference list (brand-focused, APA 7)
# ============================================================================

BRAND_REFERENCES_APA = """\
- Aaker, D. A. (1991). *Managing brand equity: Capitalizing on the value of a brand name*. The Free Press.
- Aaker, D. A. (1996). *Building strong brands*. The Free Press.
- Aaker, J. L. (1997). Dimensions of brand personality. *Journal of Marketing Research, 34*(3), 347–356. https://doi.org/10.1177/002224379703400304
- Aaker, J. L., Fournier, S., & Brasel, S. A. (2004). When good brands do bad. *Journal of Consumer Research, 31*(1), 1–16.
- Keller, K. L. (1993). Conceptualizing, measuring, and managing customer-based brand equity. *Journal of Marketing, 57*(1), 1–22. https://doi.org/10.2307/1252054
- Keller, K. L. (2001). Building customer-based brand equity: A blueprint for creating strong brands. *Marketing Management, 10*(2), 14–19.
- Keller, K. L. (2013). *Strategic brand management: Building, measuring, and managing brand equity* (4th ed.). Pearson.
- Kapferer, J.-N. (2012). *The new strategic brand management: Advanced insights and strategic thinking* (5th ed.). Kogan Page.
- Kotler, P., & Keller, K. L. (2016). *Marketing management* (15th ed.). Pearson.
- Reichheld, F. F. (2003). The one number you need to grow. *Harvard Business Review, 81*(12), 46–54.
- Reichheld, F. F., & Markey, R. (2011). *The ultimate question 2.0: How net promoter companies thrive in a customer-driven world*. Harvard Business Review Press.
- Yoo, B., & Donthu, N. (2001). Developing and validating a multidimensional consumer-based brand equity scale. *Journal of Business Research, 52*(1), 1–14.
- Pappu, R., Quester, P. G., & Cooksey, R. W. (2005). Consumer-based brand equity: Improving the measurement – empirical evidence. *Journal of Product & Brand Management, 14*(3), 143–154.
- Christodoulides, G., & de Chernatony, L. (2010). Consumer-based brand equity conceptualization and measurement: A literature review. *International Journal of Market Research, 52*(1), 43–66.
- DeVellis, R. F. (2017). *Scale development: Theory and applications* (4th ed.). SAGE Publications.
- Cohen, P., Cohen, J., Aiken, L. S., & West, S. G. (1999). The problem of units and the circumstance for POMP. *Multivariate Behavioral Research, 34*(3), 315–346. https://doi.org/10.1207/S15327906MBR3403_2
- Cronbach, L. J. (1951). Coefficient alpha and the internal structure of tests. *Psychometrika, 16*(3), 297–334. https://doi.org/10.1007/BF02310555
- Nunnally, J. C., & Bernstein, I. H. (1994). *Psychometric theory* (3rd ed.). McGraw-Hill.
- Fornell, C., & Larcker, D. F. (1981). Evaluating structural equation models with unobservable variables and measurement error. *Journal of Marketing Research, 18*(1), 39–50. https://doi.org/10.2307/3151312
- Zeithaml, V. A. (1988). Consumer perceptions of price, quality, and value: A means-end model and synthesis of evidence. *Journal of Marketing, 52*(3), 2–22. https://doi.org/10.1177/002224298805200302
- Hair, J. F., Black, W. C., Babin, B. J., & Anderson, R. E. (2010). *Multivariate data analysis* (7th ed.). Pearson.
- Cochran, W. G. (1977). *Sampling techniques* (3rd ed.). Wiley.
- Churchill, G. A., Jr. (1979). A paradigm for developing better measures of marketing constructs. *Journal of Marketing Research, 16*(1), 64–73. https://doi.org/10.1177/002224377901600110
- Clark, L. A., & Watson, D. (1995). Constructing validity: Basic issues in objective scale development. *Psychological Assessment, 7*(3), 309–319. https://doi.org/10.1037/1040-3590.7.3.309
- Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics, 6*(2), 65–70.
- Cohen, J. (1988). *Statistical power analysis for the behavioral sciences* (2nd ed.). Lawrence Erlbaum Associates.
"""


# ============================================================================
# Per-chapter prompt builders
# ============================================================================

# Hard rules that every chapter — whether written by the system LLM or pasted
# from the user's own LLM — must obey. They live in the system message, which
# the external pack reproduces verbatim, so there is no second copy to drift.
HARD_RULES_TH = (
    "5. ความเที่ยง: ห้ามอ้างว่า Cronbach's α ≥ .70 หรือ 'ผ่านเกณฑ์' เว้นแต่ตารางความเที่ยงที่ให้มาระบุเช่นนั้น "
    "มิติที่ 'ประเมินไม่ได้' ต้องเขียนว่าประเมินไม่ได้พร้อมเหตุผล\n"
    "6. BES เป็นดัชนีถ่วงน้ำหนัก (weighted composite index) ที่กำหนดน้ำหนักจากทฤษฎี ไม่ใช่ตัวแปรแฝงหรือผลจาก SEM\n"
    "7. ยังไม่ได้ทดสอบความตรงเชิงโครงสร้าง (ไม่มี EFA/CFA, AVE/CR, McDonald's ω) — ห้ามอ้างว่าทดสอบแล้ว\n"
    "8. นัยสำคัญทางสถิติ: รายงานได้เฉพาะผลทดสอบที่ปรากฏในข้อมูล (paired t-test แบรนด์ vs คู่แข่ง ปรับ Holm) "
    "การเปรียบเทียบอื่นทั้งหมดเป็นเชิงพรรณนา ห้ามใช้คำว่า 'มีนัยสำคัญ' และห้ามสรุปเชิงสาเหตุ\n"
    "9. ห้ามอ้างงานที่ไม่อยู่ในรายการอ้างอิงที่ให้มา เว้นแต่ระบุชัดว่า '(ผู้เขียนต้องตรวจสอบและเพิ่มในบรรณานุกรม)'\n"
    "10. ค่า alignment ระหว่าง identity กับ image เป็นดุลยพินิจของ LLM ไม่ใช่การวัด และไม่ได้อยู่ในคะแนนใด\n"
    "11. คำตอบปลายเปิดที่ระบุว่า 'NOT coded' ห้ามรายงานความถี่หรือประเด็นของข้อนั้น\n"
)


def _system_msg(extra_prompt: str = "") -> str:
    base = (
        "คุณเป็นอาจารย์ที่ปรึกษาวิทยานิพนธ์ MBA ที่เชี่ยวชาญ Brand Equity / Consumer-Based "
        "Brand Equity (Aaker 1991/1996, Keller 1993/2013, Kapferer 2012). "
        "เขียนเนื้อหาเป็นภาษาไทยวิชาการ น้ำเสียงเชิงวิจัย ใช้คำเชื่อมเชิงเหตุผล "
        "อ้างอิงค่าสถิติจริงจากข้อมูลที่ได้รับ และอ้างอิงทฤษฎี/งานวิจัยที่เกี่ยวข้อง "
        "(Aaker, Keller, Kapferer, Reichheld, Kotler) ในรูปแบบ APA 7 in-text citation "
        "เช่น (Aaker, 1996), (Keller, 2013) ทุกครั้งที่อ้างทฤษฎี\n\n"
        "**กฎสำคัญที่สุด — ห้ามแหก**:\n"
        "1. ใช้ตัวเลขสถิติ **จริง** จาก data ที่ส่งให้เท่านั้น — ห้ามแต่ง ห้ามใส่ X.X หรือ "
        "[ระบุค่า] หรือ placeholder ใดๆ ทั้งสิ้น\n"
        "2. ถ้า data field ไหนเป็น '—' หรือไม่มี — ให้เขียนตามข้อมูลที่มี อย่ายัด placeholder\n"
        "3. ทุกครั้งที่อ้างค่า ต้องมีหน่วย/บริบท เช่น 'ค่าเฉลี่ย 4.95 จาก scale 1-7 (n=21)'\n"
        "4. ห้ามใช้คำว่า 'ผู้ใช้จะใส่เอง' หรือ 'TBD' หรือ 'X' ใน chapter 3-5 (data-driven)\n"
        + HARD_RULES_TH + "\n"
        "**กฎ Mermaid Diagrams — ใช้ทุกครั้งที่ควรมีแผนภาพ**:\n"
        "- เมื่อกล่าวถึง conceptual framework / กรอบแนวคิด ให้สร้าง mermaid flowchart\n"
        "- เมื่อกล่าวถึง research methodology / ขั้นตอนการวิจัย ให้สร้าง mermaid flowchart\n"
        "- เมื่อกล่าวถึง Aaker Brand Equity Model หรือ Keller CBBE Pyramid ให้สร้าง mermaid\n"
        "- ใช้ syntax `flowchart TD` หรือ `flowchart LR` เท่านั้น\n"
        "- **ห้ามใช้ภาษาไทยใน node labels** (เนื่องจาก mmdc/Chromium ยังไม่รองรับเต็มที่) — "
        "ใช้ภาษาอังกฤษใน label แต่อธิบายเป็นไทยในย่อหน้า\n"
        "- ใช้ syntax ที่ valid 100% — ห้าม custom theme, ห้าม unicode escape, "
        "ห้าม `subgraph` ที่ซับซ้อน\n"
        "- ตัวอย่าง syntax ที่ถูกต้อง:\n"
        "  ```mermaid\n"
        "  flowchart TD\n"
        "      A[Brand Identity] --> B[Brand Awareness]\n"
        "      B --> C[Perceived Quality]\n"
        "      C --> D[Brand Loyalty]\n"
        "      D --> E[Brand Equity Score]\n"
        "  ```\n"
        "- AI ของเราจะ render mermaid เป็นภาพ PNG ฝังใน DOCX อัตโนมัติ ผู้ใช้จึงจะได้แผนภาพจริง\n\n"
        "**กฎการเขียนสมการ**: ใช้ LaTeX inline `$...$` หรือ display `$$...$$`\n\n"
        "**กฎการเขียน format**:\n"
        "- หัวข้อใช้ Markdown: ## ชื่อบท, ### หัวข้อย่อย\n"
        "- ตารางใช้ Markdown table syntax (| col1 | col2 |)\n"
        "- in-text citation อ้างทฤษฎีทุกครั้งที่กล่าวถึง model/concept\n"
        "- ภาษาไทยวิชาการ ห้ามใช้ภาษาพูด\n"
    )
    if extra_prompt and extra_prompt.strip():
        base += f"\n**คำสั่งเพิ่มเติมจากผู้ใช้**: {extra_prompt.strip()}"
    return base


def build_be_thesis_prompts(
    *, study: Dict[str, Any], aggregate: Dict[str, Any],
    n_total: int, n_filtered: int,
    chapters: List[int], extra_prompt: str = "",
) -> Tuple[str, Dict[int, str]]:
    """Returns (system_msg, {chapter_num: prompt}) for selected chapters.

    Chapters 1-2 are flagged 'ร่าง' (draft) since they don't depend on data.
    Chapters 3-5 cite real numbers from `summary`.
    """
    brand = study.get("brand") or {}
    brand_name = brand.get("name") or "Brand"
    category = brand.get("category") or "category"
    summary = _summarize_be_for_ai(
        study=study, aggregate=aggregate,
        n_total=n_total, n_filtered=n_filtered,
    )
    sysmsg = _system_msg(extra_prompt)

    # ---- Reliability: report what was MEASURED, never a threshold ----------
    # This block used to be the literal instruction
    #   "- การทดสอบความเที่ยง (Cronbach's α) — ผู้ใช้จะใส่ค่าจริงเพิ่ม"   (§3.3)
    #   "- ความเที่ยง (reliability) ของ scale: Cronbach's α ≥ 0.7"        (§3.7)
    # while nothing in the system computed alpha. Combined with the system
    # message's own rules ("ห้ามใส่ placeholder", "ห้ามใช้คำว่า 'ผู้ใช้จะใส่เอง'"),
    # the only output the model could produce was a methodology chapter
    # asserting that a reliability test had been passed. Now the real per-
    # dimension alpha is computed in `_dimension_reliability` and injected here,
    # including the cases where it CANNOT be estimated — which the chapter is
    # explicitly required to disclose rather than paper over.
    _rel = (aggregate or {}).get("reliability") or {}
    _dim_th = {"awareness": "การรู้จักแบรนด์ (Awareness)",
               "quality": "การรับรู้คุณภาพ (Perceived Quality)",
               "identity": "อัตลักษณ์และภาพลักษณ์ (Identity vs Image)",
               "loyalty": "ความภักดี (Loyalty)"}
    _rel_rows, _rel_caveats = [], []
    for _d, _label in _dim_th.items():
        _r = _rel.get(_d) or {}
        _a = _r.get("alpha")
        if _a is None:
            _rel_rows.append(f"| {_label} | {_r.get('k_items', 0)} | – | ประเมินไม่ได้ | {_r.get('interpretation') or '-'} |")
            _rel_caveats.append(f"{_label}: {_r.get('interpretation') or 'ประเมินความเที่ยงไม่ได้'}")
        else:
            _mark = "ผ่านเกณฑ์ ≥ 0.70" if _r.get("meets_threshold") else "**ต่ำกว่าเกณฑ์ 0.70**"
            _rel_rows.append(
                f"| {_label} | {_r.get('k_items')} | {_a:.3f} | {_mark} | {_r.get('interpretation') or ''} |")
            if not _r.get("meets_threshold"):
                _rel_caveats.append(f"{_label}: α = {_a:.3f} ต่ำกว่าเกณฑ์ 0.70")
    reliability_block = (
        "| มิติ | จำนวนข้อ (k) | Cronbach's α | เกณฑ์ | การตีความ |\n"
        "|---|---|---|---|---|\n" + "\n".join(_rel_rows)
    )
    reliability_rule = (
        "**กฎเด็ดขาดเรื่องความเที่ยง**: อ้างอิงได้เฉพาะตัวเลขในตารางด้านบนเท่านั้น "
        "ห้ามเขียนเกณฑ์ลอยๆ เป็นข้อสมมติ และห้ามสรุปว่ามิติใดผ่านเกณฑ์ "
        "หากคอลัมน์ 'เกณฑ์' ของมิตินั้นไม่ได้ระบุเช่นนั้น "
        "มิติใดที่ระบุว่า 'ประเมินไม่ได้' ให้เขียนตรงๆ ว่ายังประเมินความเที่ยงไม่ได้พร้อมเหตุผล "
        "และนำไปกล่าวซ้ำในข้อจำกัดของการวิจัย (บทที่ 5) ห้ามละเว้น"
        + (("\n**ประเด็นที่ต้องระบุเป็นข้อจำกัด**: " + " · ".join(_rel_caveats)) if _rel_caveats else "")
    )

    # ---- Weight table generated from the CODE, not hand-copied -------------
    # The hard-coded table in §3.5 drifted from DIMENSION_WEIGHTS (it still
    # listed signals that had been removed as unreachable). Generating it means
    # the methodology chapter cannot describe a model the software does not run.
    try:
        from .brand_equity import DIMENSION_WEIGHTS as _DW
        _w_rows = []
        for _d, _label in _dim_th.items():
            for _kind, _w in (_DW.get(_d) or {}).items():
                _w_rows.append(f"| {_label} | `{_kind}` | {_w:.2f} |")
        weight_table = ("| Dimension | Signal (kind) | Weight |\n|---|---|---|\n"
                        + "\n".join(_w_rows))
    except Exception:  # pragma: no cover — never let the export die on this
        weight_table = "(ไม่สามารถดึงตารางน้ำหนักจากระบบได้)"

    _adq = (aggregate or {}).get("sample_adequacy") or {}
    sample_adequacy_note = _adq.get("message") or ""
    coding_note, qual_tool = _coding_and_tool_notes(study, aggregate)

    prompts: Dict[int, str] = {}

    # ============ Ch 1 — บทนำ (DRAFT) ============
    if 1 in chapters:
        prompts[1] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 1 บทนำ (Introduction) — ร่าง** สำหรับงานวิจัย Brand Equity ของแบรนด์ "{brand_name}" ใน category "{category}"

**หมายเหตุสำคัญ**: บทนี้เป็น **ร่าง** ที่ AI สร้างให้เป็นโครงสร้างพื้นฐาน ผู้เขียนวิทยานิพนธ์ต้องนำไป fine-tune / revise เอง ให้ตรงกับบริบทของโรงเรียน/มหาวิทยาลัย และ scope ของงานวิจัยจริง

โครงสร้างบทที่ 1:
## บทที่ 1 บทนำ
*(ร่างจาก AI — กรุณานำไป fine-tune / revise ให้ตรงกับบริบทงานวิจัยของท่านเอง)*

### 1.1 ความเป็นมาและความสำคัญของปัญหา
- เขียน 3-4 ย่อหน้าเกี่ยวกับความสำคัญของการสร้าง Brand Equity ในยุคปัจจุบัน
- อ้าง Aaker (1991), Keller (1993), Kapferer (2012) เกี่ยวกับ value ของ strong brand
- อธิบายบริบท category "{category}" ในตลาดไทย/global (ใช้สมมุติฐานทั่วไปได้ — ผู้ใช้จะแก้เอง)
- ชี้ปัญหา: brand ส่วนใหญ่ขาดเครื่องมือวัด brand health เชิง quantitative

### 1.2 วัตถุประสงค์ของการวิจัย
1. เพื่อวัด Brand Equity ของ "{brand_name}" ตามกรอบ Aaker (1996) ที่ประกอบด้วย 4 มิติ: Awareness, Perceived Quality, Brand Identity vs Image, Brand Loyalty
2. เพื่อวิเคราะห์ความสอดคล้องระหว่าง Brand Identity (intended) กับ Brand Image (perceived) ของ "{brand_name}"
3. เพื่อเปรียบเทียบ Brand Equity ของ "{brand_name}" กับคู่แข่งหลักใน category "{category}"
4. เพื่อเสนอแนวทางการปรับปรุงกลยุทธ์แบรนด์ให้สอดคล้องกับมิติที่อ่อน

### 1.3 ขอบเขตของการวิจัย
- ขอบเขตด้านเนื้อหา: 4 มิติของ Aaker
- ขอบเขตด้านประชากร/กลุ่มตัวอย่าง (n={n_filtered})
- ขอบเขตด้านเวลา / สถานที่ (ผู้ใช้ระบุเอง)

### 1.4 คำถามการวิจัย
- RQ1: Brand Equity ของ "{brand_name}" ในแต่ละมิติ (Awareness, Perceived Quality, Identity vs Image, Loyalty) อยู่ในระดับใด
- RQ2: ภาพลักษณ์ที่ผู้บริโภครับรู้สอดคล้องกับอัตลักษณ์ที่แบรนด์ตั้งใจมากน้อยเพียงใด
- RQ3: "{brand_name}" ได้รับการประเมินต่างจากคู่แข่งในด้านเดียวกันอย่างไร
- **ห้ามตั้งสมมติฐานเชิงความสัมพันธ์/เชิงสาเหตุ (เช่น "A สัมพันธ์กับ B", "A ส่งผลต่อ B")** — ระบบไม่ได้วิเคราะห์
  สหสัมพันธ์ การถดถอย หรือ SEM ถ้าผู้เขียนต้องการสมมติฐานเช่นนั้นต้องวิเคราะห์เพิ่มเองจากไฟล์ข้อมูลดิบ

### 1.5 ประโยชน์ที่คาดว่าจะได้รับ
- เชิงวิชาการ: เพิ่มองค์ความรู้ด้าน CBBE ในบริบทไทย
- เชิงปฏิบัติ: brand manager นำไปวางกลยุทธ์ได้

### 1.6 นิยามศัพท์เฉพาะ
- Brand Equity, Brand Awareness, Perceived Quality, Brand Identity, Brand Image, Brand Loyalty (อ้าง Aaker, 1996; Keller, 2013)

ข้อกำหนด: ใช้ภาษาไทยวิชาการ, in-text citation ทุกครั้งที่อ้างทฤษฎี, ขึ้นต้นด้วย "*(ร่างจาก AI — กรุณานำไป fine-tune / revise เอง)*" หลัง heading ของบท
"""

    # ============ Ch 2 — ทบทวนวรรณกรรม (DRAFT) ============
    if 2 in chapters:
        prompts[2] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 2 ทบทวนวรรณกรรม (Literature Review) — ร่าง** สำหรับงานวิจัย Brand Equity ของ "{brand_name}"

**หมายเหตุสำคัญ**: บทนี้เป็น **ร่าง** กรุณานำไป fine-tune / revise + เพิ่มงานวิจัยใน category ของท่านเอง

โครงสร้างบทที่ 2:
## บทที่ 2 ทบทวนวรรณกรรมและงานวิจัยที่เกี่ยวข้อง
*(ร่างจาก AI — กรุณานำไป fine-tune / revise เอง โดยเฉพาะ section 2.4 งานวิจัยที่เกี่ยวข้อง)*

### 2.1 แนวคิดและทฤษฎีเกี่ยวกับ Brand Equity
- นิยาม Brand Equity จาก Aaker (1991) และ Keller (1993)
- เปรียบเทียบ Aaker's Brand Equity Model กับ Keller's CBBE Pyramid
- Yoo & Donthu (2001) และ Pappu et al. (2005) ที่พัฒนา measurement scale

### 2.2 มิติของ Brand Equity ตามกรอบ Aaker (1996)

**2.2.1 Brand Awareness**
- ระดับ awareness pyramid (Aaker, 1996): Recognition → Recall → Top-of-Mind → Dominance
- บทบาทของ memory strength ต่อ purchase decision (Keller, 2013)

**2.2.2 Perceived Quality**
- นิยาม perceived quality vs objective quality (Zeithaml, 1988; Aaker, 1991)
- ความสัมพันธ์ของ perceived quality กับ premium pricing

**2.2.3 Brand Identity vs Brand Image**
- Kapferer's Brand Identity Prism (Kapferer, 2012)
- Aaker's Brand Identity System (Aaker, 1996): Brand-as-Product/Organization/Person/Symbol
- Identity-Image gap ที่เป็นปัญหาในการสื่อสารแบรนด์

**2.2.4 Brand Loyalty**
- Loyalty pyramid (Aaker, 1991): Switcher → Habitual → Satisfied → Friend of brand → Committed
- Net Promoter Score (Reichheld, 2003) เป็น behavioral predictor

### 2.3 การวัด Brand Equity เชิงปริมาณ
- Multi-dimensional scale (Yoo & Donthu, 2001)
- Customer-Based Brand Equity (CBBE) measurement (Christodoulides & de Chernatony, 2010)
- Likert scale normalization และ NPS computation

### 2.4 งานวิจัยที่เกี่ยวข้อง
*(ส่วนนี้เป็น placeholder — ผู้เขียนต้องไปค้นงานวิจัยใน category "{category}" และ context ไทย/global เพิ่มเอง)*
- เขียนตัวอย่าง 3-4 งานวิจัยใน category นี้ (ผู้ใช้จะแทนที่ด้วยงานจริง)

### 2.5 กรอบแนวคิดของการวิจัย
- เขียนคำบรรยาย conceptual framework ที่นำ Aaker's 4 dimensions มาใช้กับ "{brand_name}"
- ตัวแปรอิสระ: 4 มิติ; ตัวแปรตาม: Brand Equity Score (BES)
- **สำคัญ**: สร้างแผนภาพ mermaid flowchart แสดงกรอบแนวคิดวิจัย (Aaker 4 dimensions → BES)
  เช่น:
  ```mermaid
  flowchart LR
      A[Brand Awareness] --> Z[Brand Equity Score]
      B[Perceived Quality] --> Z
      C[Brand Identity] --> Z
      D[Brand Loyalty] --> Z
  ```

ข้อกำหนด: ภาษาไทยวิชาการ, in-text citation APA 7 ทุกย่อหน้า, ขึ้นต้นด้วย "*(ร่างจาก AI — กรุณานำไป fine-tune / revise เอง...)*" หลัง heading
"""

    # ============ Ch 3 — Methodology ============
    if 3 in chapters:
        prompts[3] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 3 ระเบียบวิธีวิจัย (Research Methodology)** สำหรับงานวิจัย Brand Equity ของ "{brand_name}"

ข้อมูลการวิจัย:
- Brand: {brand_name} ({category})
- Sample: n={n_filtered} (จาก {n_total} respondents)
- Framework: Aaker's 4-Dimension CBBE Model

โครงสร้างบทที่ 3:
## บทที่ 3 ระเบียบวิธีวิจัย

### 3.1 รูปแบบการวิจัย
- Quantitative descriptive research with cross-sectional survey design
- อธิบายว่าทำไมเลือก quantitative approach (อ้าง Yoo & Donthu, 2001; Pappu et al., 2005)

### 3.2 ประชากรและกลุ่มตัวอย่าง
- ระบุประชากร (consumers ใน category "{category}")
- ขนาดตัวอย่าง n={n_filtered} — อ้างเกณฑ์ขนาดกลุ่มตัวอย่าง (Hair et al., 2010 หรือ Cochran, 1977 — ผู้ใช้จะปรับ)
- การประเมินความเพียงพอของกลุ่มตัวอย่างจากระบบ: {sample_adequacy_note}
  (ถ้าข้อความข้างต้นระบุว่ายังไม่เพียงพอ ให้เขียนไว้ในข้อจำกัดของการวิจัยด้วย ห้ามละเว้น)
- วิธีการสุ่ม: convenience/purposive sampling
- Inclusion criteria

### 3.3 เครื่องมือที่ใช้ในการวิจัย
- แบบสอบถามที่ออกแบบตาม Aaker (1996) และ Yoo & Donthu (2001)
- ประกอบด้วย 4 ส่วน:
  1. Awareness: Top-of-mind, Spontaneous Recall, Aided Recognition, Familiarity
  2. Perceived Quality: Overall, Reliability, Value, Comparative
  3. Identity vs Image: Trait grid (3-5 traits), Brand Promise, Aaker's 4 Perspectives
  4. Loyalty: NPS, Repeat Intent, Switching Resistance
- หมายเหตุ: เครื่องมือนี้พัฒนาขึ้นตามกรอบแนวคิดของ Aaker (1996) และ Yoo & Donthu (2001)
  แต่**ไม่ได้ใช้ข้อคำถามมาตรฐาน (validated items) ของ MBE scale โดยตรง** ให้ระบุข้อนี้ตามตรง

**3.3.1 การทดสอบความเที่ยง (Internal Consistency Reliability)**
ใช้ค่าที่คำนวณจากข้อมูลจริงต่อไปนี้ ห้ามแก้ไขตัวเลข:

{reliability_block}

{reliability_rule}

### 3.4 การคำนวณ Brand Equity Score (BES)
อธิบายสูตรการคำนวณแต่ละมิติ + composite ดังนี้:

**3.4.1 Likert Score Normalization (POMP — Percentage of Maximum Possible)**
$$\\text{{score}}_{{100}} = \\frac{{\\bar{{x}} - 1}}{{k - 1}} \\times 100$$
เมื่อ $\\bar{{x}}$ = ค่าเฉลี่ย, $k$ = ค่าสูงสุดของมาตรวัด (5 หรือ 7)
การแปลงนี้คือ POMP score ตาม Cohen, Cohen, Aiken และ West (1999) ซึ่งเป็นการแปลง
เชิงเส้นให้ค่าต่ำสุดของมาตรวัดเป็น 0 และค่าสูงสุดเป็น 100 เพื่อให้เทียบข้ามมาตรวัดที่มี
จำนวนระดับต่างกันได้ (ห้ามอ้าง DeVellis (2017) เป็นแหล่งของสูตรนี้ — เป็นตำราการพัฒนา
มาตรวัด ไม่ใช่ที่มาของ POMP)

**3.4.2 Net Promoter Score**
$$\\text{{NPS}} = \\frac{{n_{{promoters}} - n_{{detractors}}}}{{n}} \\times 100$$
นิยาม NPS ตาม Reichheld (2003) (promoters = 9-10, detractors = 0-6) แล้วแปลงเป็นสเกล 0-100 ด้วย
$(NPS + 100) / 2$ — การแปลงนี้เป็นการแปลงเชิงเส้นของระบบเพื่อให้รวมกับมิติอื่นได้ **ไม่ใช่ส่วนหนึ่งของนิยามของ
Reichheld** (ห้ามอ้างว่า Reichheld เสนอการแปลงนี้)

**3.4.3 Comparative 7-pt**
$$\\text{{score}}_{{100}} = \\frac{{7 - \\bar{{x}}}}{{6}} \\times 100$$
(focal brand ที่ฝั่งซ้าย)

**3.4.4 Dimension Composite**
$$D_i = \\frac{{\\sum_k w_k \\cdot s_k}}{{\\sum_k w_k}}$$
เมื่อ $s_k$ = score_100 ของแต่ละ signal kind, $w_k$ = น้ำหนักทฤษฎี (renormalize เมื่อ signal ขาด)

**3.4.5 Brand Equity Score (BES)**
$$\\text{{BES}} = \\frac{{\\sum_{{i \\in \\{{aw,q,id,ly\\}}}} D_i \\cdot W_i}}{{\\sum_i W_i}}$$
ค่าเริ่มต้น $W_i = 25$ ทุกมิติ (ปรับได้ใน Wizard step 4)

### 3.5 น้ำหนักของแต่ละ Signal (ตามทฤษฎี Aaker / Keller)
ใส่ตาราง Markdown แสดงน้ำหนัก:

{weight_table}

(ตารางนี้ดึงจาก `DIMENSION_WEIGHTS` ในระบบโดยตรง จึงตรงกับที่ใช้คำนวณจริงเสมอ
ค่า Identity-Image alignment ที่ LLM ประเมิน **ไม่ได้** รวมอยู่ในคะแนนใด)

### 3.6 การวิเคราะห์ข้อมูล
- Descriptive: mean, SD (n−1), 95% CI, T2B/B2B, frequency, distribution
- การนับชื่อแบรนด์จากคำตอบปลายเปิด: {coding_note}
- Theme extraction และ Identity-Image comparison ผ่าน LLM (เครื่องมือ: {qual_tool}) — เป็นการตีความเชิงคุณภาพ ไม่ได้ใช้คำนวณคะแนน
- การทดสอบนัยสำคัญ: paired t-test ระหว่างแบรนด์หลักกับคู่แข่งในด้านเดียวกัน (effect size Cohen's d_z,
  ปรับ Holm, 1979) เฉพาะที่มีในข้อมูล
- ระบุการคัดกรองคุณภาพข้อมูล (speeders / straight-liners / คำตอบซ้ำ) ตามจำนวนที่รายงานในข้อมูล
- **สำคัญ**: สร้างแผนภาพ mermaid flowchart แสดงขั้นตอนการวิจัยทั้งกระบวนการ (Survey design → Data collection → AI normalization → Aggregate → Composite calculation → Report)

### 3.7 สมมติฐานและข้อจำกัดของแบบจำลอง
- ความเที่ยง (reliability): ใช้ค่า α ที่รายงานไว้ในตาราง §3.3.1 เท่านั้น ห้ามอ้างเกณฑ์ลอยๆ
- ความตรงเชิงเนื้อหา (content validity): อ้างกรอบของ Aaker (1996) — ระบุตามตรงว่า
  **ยังไม่ได้ทดสอบความตรงเชิงโครงสร้าง (construct validity) ด้วย EFA/CFA** และยังไม่ได้
  รายงาน AVE/CR ตาม Fornell & Larcker (1981)
- สมมติฐาน normalization ของ Likert มีระยะห่างเท่ากัน (Equal-interval assumption)
- BES เป็น **ดัชนีแบบถ่วงน้ำหนัก (weighted composite index)** ที่กำหนดน้ำหนักจากทฤษฎี
  ไม่ใช่ค่าที่ประมาณจากแบบจำลองสมการโครงสร้าง — ให้ระบุข้อนี้ตามตรง
- การเปรียบเทียบระหว่างกลุ่ม/ช่วงเวลาในรายงานนี้เป็น **ผลต่างเชิงพรรณนา** ห้ามใช้ถ้อยคำที่สื่อว่ามีนัยสำคัญ;
  การเปรียบเทียบกับคู่แข่งรายงานนัยสำคัญได้เฉพาะคู่ที่มีผล paired t-test ในข้อมูลเท่านั้น

ข้อกำหนด: ภาษาไทยวิชาการ, in-text citation APA 7 ครบทุกที่ที่อ้างทฤษฎี, สูตรใช้ LaTeX ($$..$$ display, $..$ inline) เสมอ

**สรุปข้อมูลจากการเก็บจริง (สำหรับใช้ใน description):**
{summary}
"""

    # ============ Ch 4 — Results ============
    if 4 in chapters:
        prompts[4] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 4 ผลการศึกษา (Results)** สำหรับงานวิจัย Brand Equity ของ "{brand_name}"

ข้อมูลที่เก็บจริง:
{summary}

โครงสร้างบทที่ 4:
## บทที่ 4 ผลการศึกษา

### 4.1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม
- ระบุ n={n_filtered} (จากทั้งหมด {n_total})
- (ผู้เขียนเสริมข้อมูลประชากรศาสตร์เอง — กรุณาใส่ตาราง demographics)

### 4.2 Brand Equity Score (BES) ภาพรวม
- รายงานค่า BES และ tier (Champion/Strong/Healthy/At Watch/At Risk)
- ใส่ตาราง Markdown แสดง 4 มิติพร้อม composite score (อ้างจาก data จริงด้านบน)

### 4.3 ผลการวิเคราะห์ Brand Awareness
- รายงานค่าทุก signal ของ awareness (TOM, Spontaneous Recall, Aided, Familiarity)
- อภิปราย Awareness pyramid ของ Aaker (1996)
- ใส่ตารางสถิติ + อภิปราย

### 4.4 ผลการวิเคราะห์ Perceived Quality
- รายงาน Overall Quality, Attribute scores, Comparative vs competitors
- T2B/B2B, Net Q-Score
- ใส่ตาราง

### 4.5 ผลการวิเคราะห์ Brand Identity vs Brand Image
- เปรียบ Intended traits กับ Perceived traits
- รายงาน Aligned/Lost/Unintended traits จาก AI analysis
- Aaker's 4 Perspectives scores (As Org/Person/Symbol/Product)
- Brand Promise Match score

### 4.6 ผลการวิเคราะห์ Brand Loyalty
- รายงาน NPS (พร้อม % Promoters/Passives/Detractors)
- Repeat Intent, Switching Resistance
- อ้าง Reichheld (2003) ในการตีความ NPS

### 4.7 การเปรียบเทียบกับคู่แข่ง
- รายงานผล paired t-test ตามรูปแบบ APA 7: *t*(df) = …, *p* = … (หลังปรับ Holm), *d_z* = …, 95% CI ของผลต่าง
- ถ้าไม่มีผลทดสอบในข้อมูล ให้รายงานเป็นค่าเฉลี่ยเชิงพรรณนาเท่านั้น

### 4.8 สรุปคำตอบของคำถามการวิจัย
- ตอบ RQ1-RQ3 จากบทที่ 1 ด้วยตัวเลขจริง — ห้ามเขียนว่า "สมมติฐานได้รับการสนับสนุน" (ไม่มีการทดสอบสมมติฐานเชิงความสัมพันธ์)

ข้อกำหนด: 
- อ้างค่าสถิติ **จริงทุกจุด** ตาม data ที่ให้มา (เช่น "BES ของ {brand_name} = X.X/100" โดย X คือค่าจริง)
- ใช้ตาราง Markdown ทุกที่ที่ควรมี
- in-text citation: Aaker (1996), Keller (2013), Reichheld (2003) ตามที่อ้าง
- ภาษาไทยวิชาการ
"""

    # ============ Ch 5 — Discussion ============
    if 5 in chapters:
        prompts[5] = f"""เขียนวิทยานิพนธ์ MBA **บทที่ 5 สรุป อภิปราย และข้อเสนอแนะ (Discussion & Conclusion)** สำหรับงานวิจัย Brand Equity ของ "{brand_name}"

ข้อมูลผลการวิจัย:
{summary}

โครงสร้างบทที่ 5:
## บทที่ 5 สรุป อภิปรายผล และข้อเสนอแนะ

### 5.1 สรุปผลการวิจัย
- สรุป BES และ 4 มิติของ "{brand_name}"
- ตอบวัตถุประสงค์ที่ตั้งไว้ในบทที่ 1

### 5.2 อภิปรายผลการวิจัย
- เปรียบเทียบผลกับทฤษฎี Aaker (1996) — มิติที่สูง/ต่ำ
- เปรียบเทียบกับ Keller's CBBE pyramid (Keller, 2013)
- อภิปรายช่องว่าง Identity-Image (อ้าง Kapferer, 2012)
- ตีความ NPS ตาม Reichheld (2003)
- เปรียบเทียบกับงานวิจัยที่เกี่ยวข้องใน category ใกล้เคียง (ผู้ใช้จะเสริม specific references)

### 5.3 ข้อเสนอแนะเชิงกลยุทธ์ (5-7 ข้อ)
สำหรับ "{brand_name}" — เสนอแนะตามมิติที่อ่อน เช่น:
- Awareness: TOM ต่ำ → ลงทุน above-the-line, จับ memory cue
- Quality: T2B ต่ำ → improve product/service touchpoints
- Identity: ขาดเสียงสะท้อนตรงตัวอย่าง intended trait → reframe communication
- Loyalty: NPS ต่ำ → focus retention program, NPS monitoring quarterly
- (เพิ่มข้อเฉพาะตาม data จริง)

### 5.4 ข้อเสนอแนะเชิงปฏิบัติ
- การประยุกต์ใช้กรอบ Aaker ในการวัด brand health ระยะยาว (Wave tracking)
- การลงทุนใน brand asset (logo, palette, ads) ที่สอดคล้องกับ intended identity

### 5.5 ข้อจำกัดของการวิจัย
- ขนาดตัวอย่าง n={n_filtered} อาจไม่เพียงพอสำหรับ inferential statistics ระดับสูง
- Convenience sampling — generalizability จำกัด
- Self-reported data — bias เชิง social desirability
- Cross-sectional — ไม่สามารถสรุปเชิง causal ได้

### 5.6 ข้อเสนอแนะสำหรับการวิจัยในอนาคต
1. Wave tracking — เก็บข้อมูล Q1-Q4 เพื่อวัดการเปลี่ยนแปลง
2. ขยาย sample เป็น probabilistic sampling
3. เปรียบเทียบ Brand Equity ของ "{brand_name}" กับคู่แข่งครบทุกราย
4. รวม qualitative interview กับ heavy users / detractors

ข้อกำหนด:
- ภาษาไทยวิชาการ
- in-text citation: Aaker (1996), Keller (2013), Reichheld (2003), Kapferer (2012) ตามที่อ้าง
- อ้างค่าสถิติจริงจาก data ในการอภิปราย (ห้ามแต่งตัวเลข)
- ทุกหัวข้อย่อยมีอย่างน้อย 2 ย่อหน้า
"""

    return sysmsg, prompts


def references_section_md() -> str:
    """Return the brand-focused References block as markdown for appending."""
    return f"""## บรรณานุกรม (References)

{BRAND_REFERENCES_APA}
"""



# ============================================================================
# 2026-11 — provenance, disclosures, methods paragraph, external pack
# ============================================================================
def _coding_tool_labels(study: Dict[str, Any]) -> List[str]:
    labels: List[str] = []
    for entry in (study.get("open_coding") or {}).values():
        for src, lab in ((entry or {}).get("model_labels") or {}).items():
            txt = lab if src != "manual" else f"{lab} (เข้ารหัสด้วยมือ)"
            if txt and txt not in labels:
                labels.append(txt)
    return labels


def _coding_and_tool_notes(study: Dict[str, Any], aggregate: Dict[str, Any]) -> Tuple[str, str]:
    basis = ((aggregate or {}).get("normalization") or {}).get("basis") or "none"
    tools = _coding_tool_labels(study)
    if basis == "ai":
        coding = ("เข้ารหัสคำตอบที่ไม่ซ้ำกันแต่ละคำตอบด้วย LLM (" + (", ".join(tools) or "ไม่ระบุเครื่องมือ") +
                  ") แล้วนับเป็นสัดส่วนผู้ตอบ คำตอบที่ยังไม่ได้เข้ารหัสนับด้วยการจับคู่ชื่อแบรนด์อัตโนมัติ — "
                  "ต้องระบุชื่อเครื่องมือ AI และให้ผู้วิจัยตรวจทานการเข้ารหัส (ดูคอลัมน์ *_code ในไฟล์ข้อมูลดิบ)")
    elif basis == "manual":
        coding = "ผู้วิจัยเข้ารหัสด้วยมือตาม code frame แล้วนับเป็นสัดส่วนผู้ตอบ"
    elif basis == "deterministic":
        coding = ("จับคู่ชื่อแบรนด์แบบตรงตัว/ไม่กำกวม (ไม่ใช้ AI) แล้วนับเป็นสัดส่วนผู้ตอบ — "
                  "คำที่สะกดผิดหรือชื่อเล่นอาจไม่ถูกนับ ให้ระบุเป็นข้อจำกัด")
    else:
        coding = "ไม่มีคำถามปลายเปิดที่ต้องนับชื่อแบรนด์"
    ai = study.get("ai_cache") or {}
    metas = ai.get("sections_meta") or {}
    q_tools = [m.get("model_label") for k, m in metas.items() if k in ("themes", "identity", "insights")
               and isinstance(m, dict) and m.get("model_label")]
    if not q_tools and (ai.get("themes_by_question") or ai.get("identity_image") or ai.get("master_insights")):
        q_tools = [ai.get("model_label") or "system LLM (Gemini 2.5 Flash)"]
    qual = ", ".join(dict.fromkeys(q_tools)) or "ยังไม่ได้ใช้ (ไม่มีผลการวิเคราะห์เชิงคุณภาพ)"
    return coding, qual


def ai_use_disclosure_md(model_label: str, source: str = "system") -> str:
    """One line every AI-written thesis document starts with."""
    who = model_label or ("system LLM" if source == "system" else "AI ภายนอก")
    return (f"> **การเปิดเผยการใช้ AI:** เนื้อหาในเอกสารนี้ร่างโดยปัญญาประดิษฐ์ ({who}) จากข้อมูลและตารางที่ระบบ "
            "SWUMKT คำนวณ ผู้เขียนต้องตรวจทาน แก้ไข และรับผิดชอบต่อความถูกต้องทั้งหมด "
            "และต้องเปิดเผยการใช้ AI ตามระเบียบของสถาบัน")


def methods_paragraph_th(*, study: Dict[str, Any], aggregate: Dict[str, Any],
                         n_total: int, n_filtered: int) -> str:
    """A ready-to-adapt methods paragraph generated from what was actually
    computed — nothing it states is untrue of this study."""
    b = study.get("brand") or {}
    rel = (aggregate or {}).get("reliability") or {}
    dim_th = {"awareness": "การรู้จักแบรนด์", "quality": "การรับรู้คุณภาพ",
              "identity": "อัตลักษณ์และภาพลักษณ์", "loyalty": "ความภักดี"}
    rel_bits = []
    for d, lab in dim_th.items():
        r = rel.get(d) or {}
        if r.get("alpha") is not None:
            rel_bits.append(f"{lab} α = {r['alpha']:.2f} (k = {r.get('k_items')}, n = {r.get('n_complete')})")
        else:
            rel_bits.append(f"{lab} ประเมินไม่ได้ ({r.get('interpretation') or 'ข้อมูลไม่พอ'})")
    coding_note, _q = _coding_and_tool_notes(study, aggregate)
    dq = ((aggregate or {}).get("data_quality") or {}).get("flags") or {}
    cc = [r for r in ((aggregate or {}).get("competitor_comparison") or {}).get("paired") or [] if r.get("testable")]
    adq = (aggregate or {}).get("sample_adequacy") or {}
    parts = [
        f"การวิจัยครั้งนี้เป็นการวิจัยเชิงปริมาณแบบสำรวจภาคตัดขวาง วัดคุณค่าตราสินค้า (brand equity) ของ "
        f"\"{b.get('name')}\" ในหมวด{b.get('category') or 'สินค้า'} ตามกรอบสินทรัพย์ตราสินค้าของ Aaker (1991, 1996) "
        f"4 มิติ ได้แก่ การรู้จักแบรนด์ การรับรู้คุณภาพ อัตลักษณ์และภาพลักษณ์ (brand associations) และความภักดี",
        f"กลุ่มตัวอย่าง n = {n_filtered} คน" + (f" (จากทั้งหมด {n_total} คน ตามตัวกรองที่เลือก)" if n_filtered != n_total else "")
        + " เลือกแบบสะดวก" + (f" ค่าความคลาดเคลื่อนสูงสุดของสัดส่วนประมาณ ±{adq['moe_95_pct']} จุด (หากเป็นการสุ่มอย่างง่าย)"
                               if adq.get("moe_95_pct") is not None else ""),
        "ข้อคำถามมาตรประมาณค่าแปลงเป็นคะแนน 0-100 ด้วย POMP (Cohen et al., 1999) ข้อที่มีความหมายเชิงลบกลับคะแนนก่อนรวม "
        "คะแนนแต่ละมิติเป็นค่าเฉลี่ยถ่วงน้ำหนักตามทฤษฎีของตัวชี้วัดที่มีข้อมูล และ Brand Equity Score (BES) "
        "เป็นดัชนีถ่วงน้ำหนักของ 4 มิติ ไม่ใช่ตัวแปรแฝงที่ประมาณจากแบบจำลองสมการโครงสร้าง",
        f"การนับชื่อแบรนด์จากคำตอบปลายเปิด: {coding_note}",
        "ความเที่ยงแบบความสอดคล้องภายใน (Cronbach, 1951): " + "; ".join(rel_bits)
        + " ทั้งนี้ไม่ได้ทดสอบความตรงเชิงโครงสร้าง (EFA/CFA, AVE/CR) และไม่ได้คำนวณ McDonald's ω",
    ]
    if cc:
        parts.append("การเปรียบเทียบกับคู่แข่งใช้ paired t-test บนผลต่างรายบุคคล ปรับค่า p ด้วยวิธีของ Holm (1979) "
                     "และรายงานขนาดอิทธิพล Cohen's d_z; การเปรียบเทียบอื่นเป็นเชิงพรรณนา")
    else:
        parts.append("การเปรียบเทียบทั้งหมดเป็นเชิงพรรณนา ไม่ได้ทดสอบนัยสำคัญทางสถิติ")
    if dq:
        parts.append(f"คัดกรองคุณภาพข้อมูลพบผู้ตอบเร็วผิดปกติ {dq.get('speeder', 0)} คน ตอบค่าเดียวทุกข้อ "
                     f"{dq.get('straightliner', 0)} คน และคำตอบซ้ำ {dq.get('duplicate', 0)} รายการ "
                     "(ระบุว่าตัดออกหรือไม่ตามที่ผู้วิจัยเลือก)")
    return " ".join(p.strip() for p in parts if p.strip())


def tables_markdown(*, study: Dict[str, Any], aggregate: Dict[str, Any],
                    n_total: int, n_filtered: int) -> str:
    """Every measured table, as Markdown, for the external pack (APA-style
    column naming; the user pastes them into the thesis as-is)."""
    comp = (aggregate or {}).get("composite") or {}
    meta = (aggregate or {}).get("composite_meta") or {}
    tier = (aggregate or {}).get("brand_health_tier") or {}
    measured = set(comp.get("_measured") or [])
    dim_lab = {"awareness": "Brand Awareness", "quality": "Perceived Quality",
               "identity": "Brand Identity vs Image", "loyalty": "Brand Loyalty"}

    def f1(v):
        return "—" if v is None else (f"{v:.1f}" if isinstance(v, float) else str(v))

    out = ["### ตารางที่ 1 คะแนน Brand Equity รายมิติ (0-100)",
           "| มิติ | คะแนน | ความครอบคลุมของตัวชี้วัด |", "|---|---|---|"]
    for d, lab in dim_lab.items():
        sc = f1(comp.get(d)) if d in measured else "ไม่ได้วัด"
        out.append(f"| {lab} | {sc} | {round(((meta.get(d) or {}).get('coverage') or 0) * 100)}% |")
    out.append(f"| **BES (ดัชนีถ่วงน้ำหนัก)** | **{f1(comp.get('overall'))}** | ระดับ: {tier.get('label', '—')} ({tier.get('label_th', '—')}) |")
    out.append("")

    out += ["### ตารางที่ 2 สถิติรายข้อ", "| มิติ | ตัวชี้วัด (kind) | ประเภท | n | M | SD | คะแนน 0-100 | 95% CI | หมายเหตุ |",
            "|---|---|---|---|---|---|---|---|---|"]
    for q in (aggregate or {}).get("questions") or []:
        if q.get("compare_brand"):
            continue
        s_ = q.get("stats") or {}
        ci = s_.get("score_100_ci95") or s_.get("score_ci95")
        note = []
        if q.get("reverse_scored"):
            note.append("กลับคะแนน")
        if q.get("coding_status") == "uncoded":
            note.append("ยังไม่ได้เข้ารหัส")
        if s_.get("counts") and q.get("type") in ("open_short", "open_long", "mcq_multi", "mcq_single"):
            focal = (study.get("brand") or {}).get("name")
            row = next((c for c in s_["counts"] if c.get("label") == focal), None)
            if row:
                note.append(f"{focal} = {row.get('pct')}%" + (f" (95% CI {row['pct_ci95'][0]}–{row['pct_ci95'][1]})"
                                                               if row.get("pct_ci95") else ""))
        out.append(f"| {q.get('dimension')} | {q.get('kind')} | {q.get('type')} | {s_.get('n', 0)} | "
                   f"{f1(s_.get('mean'))} | {f1(s_.get('std'))} | {f1(s_.get('score_100'))} | "
                   f"{'—' if not ci else f'{ci[0]}–{ci[1]}'} | {'; '.join(note)} |")
    out.append("")

    rel = (aggregate or {}).get("reliability") or {}
    out += ["### ตารางที่ 3 ความเที่ยงแบบความสอดคล้องภายใน (Cronbach's α)",
            "| มิติ | k | n (ตอบครบ) | α | mean inter-item r | การประเมิน |", "|---|---|---|---|---|---|"]
    for d, lab in dim_lab.items():
        r = rel.get(d) or {}
        a = r.get("alpha")
        out.append(f"| {lab} | {r.get('k_items', 0)} | {r.get('n_complete', 0)} | {'—' if a is None else f'{a:.3f}'} | "
                   f"{'—' if r.get('mean_inter_item_r') is None else r['mean_inter_item_r']} | {r.get('interpretation') or '—'} |")
    items = [(d, it) for d in dim_lab for it in ((rel.get(d) or {}).get("items") or [])]
    if items:
        out += ["", "| มิติ | ข้อ | corrected item-total r | α if item deleted | กลับคะแนน |", "|---|---|---|---|---|"]
        for d, it in items:
            out.append(f"| {d} | {it.get('kind')} | {it.get('corrected_item_total_r')} | "
                       f"{it.get('alpha_if_deleted') if it.get('alpha_if_deleted') is not None else '—'} | "
                       f"{'ใช่' if it.get('reverse_scored') else ''} |")
    out.append("")
    out.append("หมายเหตุ: " + ((aggregate or {}).get("reliability_not_computed") or ""))
    out.append("")

    cc = (aggregate or {}).get("competitor_comparison") or {}
    paired = [r for r in cc.get("paired") or [] if r.get("testable")]
    if paired:
        out += ["### ตารางที่ 4 เปรียบเทียบกับคู่แข่ง (paired t-test, POMP 0-100, ปรับ Holm)",
                "| ด้าน | คู่แข่ง | n คู่ | ผลต่าง (แบรนด์ − คู่แข่ง) | 95% CI | t(df) | p (Holm) | d_z |",
                "|---|---|---|---|---|---|---|---|"]
        for r in paired:
            p = r.get("p_value_holm")
            ptxt = "< .001" if p is not None and p < 0.001 else (f"{p:.3f}".lstrip("0") if p is not None else "—")
            out.append(f"| {r['axis']} | {r['competitor']} | {r['n_pairs']} | {r['mean_diff']} | "
                       f"{r['diff_ci95'][0]} to {r['diff_ci95'][1]} | t({r['df']}) = {r['t']} | {ptxt} | {r['cohens_dz']} |")
        out.append("")

    dq = (aggregate or {}).get("data_quality") or {}
    adq = (aggregate or {}).get("sample_adequacy") or {}
    out += ["### ข้อเท็จจริงด้านระเบียบวิธี",
            f"- กลุ่มตัวอย่าง: n = {n_filtered} จาก {n_total} — {adq.get('message', '')}",
            f"- ค่าความคลาดเคลื่อนสูงสุดของสัดส่วน (95%, สมมติการสุ่มอย่างง่าย): ±{adq.get('moe_95_pct', '—')} จุด",
            f"- ธงคุณภาพข้อมูล (ไม่ได้ตัดออก): {json.dumps(dq.get('flags') or {}, ensure_ascii=False)}",
            "- น้ำหนักมิติ (BES): " + json.dumps(study.get("weights") or {}, ensure_ascii=False)]
    return "\n".join(out)


REQUIRED_DISCLOSURES_TH = [
    "BES เป็นดัชนีถ่วงน้ำหนักที่กำหนดน้ำหนักจากทฤษฎี ไม่ใช่ตัวแปรแฝงหรือผลจากแบบจำลองสมการโครงสร้าง",
    "ยังไม่ได้ทดสอบความตรงเชิงโครงสร้าง: ไม่มี EFA/CFA, ไม่รายงาน AVE/CR (Fornell & Larcker, 1981) และ McDonald's ω",
    "รายงาน Cronbach's α ตามที่คำนวณได้จริงเท่านั้น มิติที่ประเมินไม่ได้ต้องระบุเหตุผลและกล่าวซ้ำในข้อจำกัด",
    "เครื่องมือพัฒนาตามกรอบ Aaker (1996) / Yoo & Donthu (2001) แต่ไม่ได้ใช้ข้อคำถามมาตรฐาน (validated items) โดยตรง",
    "การเปรียบเทียบระหว่างกลุ่ม/ช่วงเวลาเป็นเชิงพรรณนา; นัยสำคัญรายงานได้เฉพาะ paired t-test แบรนด์ vs คู่แข่งที่ระบบคำนวณ",
    "กลุ่มตัวอย่างแบบสะดวก — สรุปอ้างอิงประชากรและสรุปเชิงสาเหตุไม่ได้",
    "ค่า alignment ระหว่าง identity กับ image เป็นดุลยพินิจของ LLM ไม่ใช่การวัด",
    "ต้องเปิดเผยการใช้ AI (ชื่อเครื่องมือ) ในการเข้ารหัสคำตอบปลายเปิดและในการร่างเนื้อหา",
]


def build_external_pack(*, study: Dict[str, Any], aggregate: Dict[str, Any], n_total: int,
                        n_filtered: int, chapters: List[int], extra_prompt: str = "",
                        filter_info: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Markdown pack + ExternalAiDialog parts. Chapter prompts and the system
    message come from `build_be_thesis_prompts` — the same function the system
    job uses — so the external chapters are bound by the same hard rules."""
    sysmsg, prompts = build_be_thesis_prompts(study=study, aggregate=aggregate, n_total=n_total,
                                             n_filtered=n_filtered, chapters=sorted(chapters),
                                             extra_prompt=extra_prompt)
    brand = (study.get("brand") or {}).get("name") or "Brand"
    title = f"ชุดเขียนวิทยานิพนธ์ด้วย AI ของคุณเอง — Brand Equity: {brand}"
    howto = (
        "วิธีใช้ชุดนี้ (ทำทีละบท):\n"
        "1. เปิดแชตใหม่ใน ChatGPT / Claude / Gemini\n"
        "2. วาง 'System prompt' ด้านล่างเป็นข้อความแรก (ถ้าแชตไม่มีช่อง system ให้วางรวมไว้ต้นพรอมต์)\n"
        "3. วางพรอมต์ของบทที่ต้องการ แล้วส่ง — หนึ่งบทต่อหนึ่งแชตจะได้ผลดีที่สุด\n"
        "4. คัดลอกคำตอบ (Markdown) กลับไปที่หน้า Brand Equity › ส่งออกวิทยานิพนธ์ › 'นำเข้าบทจาก AI ของฉัน' "
        "แล้วกดดาวน์โหลด .docx (ระบบใส่ตาราง กราฟ ภาคผนวก และบรรทัดเปิดเผยการใช้ AI ให้)\n"
        "5. ตรวจทุกตัวเลขกับตารางในชุดนี้ — กฎในพรอมต์ห้าม AI แต่งตัวเลข แต่ผู้เขียนต้องรับผิดชอบเอง"
    )
    tables = tables_markdown(study=study, aggregate=aggregate, n_total=n_total, n_filtered=n_filtered)
    methods = methods_paragraph_th(study=study, aggregate=aggregate, n_total=n_total, n_filtered=n_filtered)
    md = [f"# {title}", "", howto, "",
          "## ตัวกรองข้อมูล", "", json.dumps(filter_info or {}, ensure_ascii=False), "",
          "## ตารางที่ระบบคำนวณ (ใช้ตัวเลขเหล่านี้เท่านั้น)", "", tables, "",
          "## ย่อหน้าระเบียบวิธีที่สร้างจากข้อมูลจริง (ปรับถ้อยคำได้ ห้ามเปลี่ยนข้อเท็จจริง)", "", methods, "",
          "## ข้อที่ต้องเปิดเผยในวิทยานิพนธ์", ""]
    md += [f"- {x}" for x in REQUIRED_DISCLOSURES_TH]
    md += ["", "## System prompt (ใช้กับทุกบท)", "", "```text", sysmsg, "```", ""]
    parts = []
    for ch in sorted(prompts):
        md += [f"## พรอมต์บทที่ {ch}", "", "```text", prompts[ch], "```", ""]
        parts.append({"key": f"ch{ch}", "title": f"บทที่ {ch}", "system_prompt": sysmsg,
                      "prompt": prompts[ch]})
    md += ["## บรรณานุกรมที่ใช้ได้", "", BRAND_REFERENCES_APA]
    return {"title": title, "instructions_th": howto, "markdown": "\n".join(md), "parts": parts}
