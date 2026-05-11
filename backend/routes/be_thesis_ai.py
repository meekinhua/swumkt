"""
be_thesis_ai.py — AI-powered thesis (วิทยานิพนธ์) generator for Brand Equity studies.

Builds per-chapter Gemini prompts (chapters 1-5) then merges chapter outputs
into a single markdown blob that the existing `_create_thesis_docx` renderer
in server.py can convert into a SWU-iThesis formatted .docx.

Chapters 1-2 are explicitly tagged "ร่าง" (DRAFT) so the user knows to fine-tune.
Chapters 3-5 use real numbers from the aggregate.

References are brand-equity focused (Aaker, Keller, Reichheld, Kapferer, Kotler).
"""
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
            if s.get("score") is not None:  # NPS raw score
                row += f", nps={_f(s.get('score'))}"
            # top counts (TOM/recall/aided)
            counts = s.get("counts") or []
            if counts:
                top = ", ".join(
                    f"{c.get('label')}={_f(c.get('pct'))}%" for c in counts[:5]
                )
                row += f" | top: {top}"
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

    # Identity-Image
    if ii:
        lines.append("\n=== IDENTITY vs IMAGE (AI) ===")
        lines.append(f"Aligned traits: {', '.join(ii.get('aligned') or []) or '—'}")
        lines.append(f"Lost traits (intended but not perceived): {', '.join(ii.get('lost') or []) or '—'}")
        lines.append(f"Unintended traits (perceived but not in identity): {', '.join(ii.get('unintended') or []) or '—'}")
        lines.append(f"Alignment score: {_f(ii.get('alignment_score_0_100') or ii.get('alignment_score'))}/100")
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
- Aaker, D. A. (1997). Dimensions of brand personality. *Journal of Marketing Research, 34*(3), 347–356.
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
"""


# ============================================================================
# Per-chapter prompt builders
# ============================================================================

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
        "4. ห้ามใช้คำว่า 'ผู้ใช้จะใส่เอง' หรือ 'TBD' หรือ 'X' ใน chapter 3-5 (data-driven)\n\n"
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

### 1.4 สมมติฐานการวิจัย
- H1: Brand Awareness ของ "{brand_name}" สัมพันธ์เชิงบวกกับ Brand Loyalty
- H2: ความสอดคล้องระหว่าง Identity และ Image ส่งผลต่อ Perceived Quality
- (เพิ่มสมมติฐานอื่นตามทฤษฎี Aaker / Keller)

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
- วิธีการสุ่ม: convenience/purposive sampling
- Inclusion criteria

### 3.3 เครื่องมือที่ใช้ในการวิจัย
- แบบสอบถามที่ออกแบบตาม Aaker (1996) และ Yoo & Donthu (2001)
- ประกอบด้วย 4 ส่วน:
  1. Awareness: Top-of-mind, Spontaneous Recall, Aided Recognition, Familiarity
  2. Perceived Quality: Overall, Reliability, Value, Comparative
  3. Identity vs Image: Trait grid (3-5 traits), Brand Promise, Aaker's 4 Perspectives
  4. Loyalty: NPS, Repeat Intent, Switching Resistance
- การทดสอบความเที่ยง (Cronbach's α) — ผู้ใช้จะใส่ค่าจริงเพิ่ม

### 3.4 การคำนวณ Brand Equity Score (BES)
อธิบายสูตรการคำนวณแต่ละมิติ + composite ดังนี้:

**3.4.1 Likert Score Normalization**
$$\\text{{score}}_{{100}} = \\frac{{\\bar{{x}} - 1}}{{k - 1}} \\times 100$$
เมื่อ $\\bar{{x}}$ = ค่าเฉลี่ย, $k$ = scale max (5 หรือ 7) — สูตรมาตรฐาน DeVellis (2017)

**3.4.2 Net Promoter Score**
$$\\text{{NPS}} = \\frac{{n_{{promoters}} - n_{{detractors}}}}{{n}} \\times 100$$
แล้วแปลงเป็น 0-100 scale: $(NPS + 100) / 2$ ตาม Reichheld (2003)

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

| Dimension | Signal | Weight |
|-----------|--------|--------|
| Awareness | Top-of-Mind | 0.40 |
| Awareness | Spontaneous Recall | 0.25 |
| Awareness | Aided Recognition | 0.20 |
| Awareness | Brand Familiarity | 0.15 |
| Quality | Overall Quality | 0.35 |
| Quality | Reliability | 0.20 |
| Quality | Value-for-Money | 0.20 |
| Quality | Comparative vs Competitor | 0.15 |
| Quality | Design | 0.10 |
| Identity | Trait-Grid Pickup | 0.20 |
| Identity | Brand Promise Match | 0.15 |
| Identity | Aaker 4 Perspectives | ≈0.50 |
| Identity | AI Identity-Image Alignment | 0.10 |
| Loyalty | NPS | 0.40 |
| Loyalty | Repeat Intent | 0.30 |
| Loyalty | Switching Resistance | 0.30 |

### 3.6 การวิเคราะห์ข้อมูล
- Descriptive: mean, std, T2B/B2B, frequency, distribution
- AI normalization: Gemini canonicalization สำหรับ open-ended brand mentions
- Theme extraction และ Identity-Image alignment ผ่าน LLM
- **สำคัญ**: สร้างแผนภาพ mermaid flowchart แสดงขั้นตอนการวิจัยทั้งกระบวนการ (Survey design → Data collection → AI normalization → Aggregate → Composite calculation → Report)

### 3.7 สมมติฐานของแบบจำลอง
- ความเที่ยง (reliability) ของ scale: Cronbach's α ≥ 0.7
- ความตรงเชิงเนื้อหา (content validity) อ้าง Aaker (1996)
- สมมติฐาน normalization ของ Likert มีระยะห่างเท่ากัน (Equal-interval assumption)

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

### 4.7 สรุปผลการทดสอบสมมติฐาน
- ตอบสมมติฐานที่ตั้งไว้ในบทที่ 1 (ถ้ามี — ผู้ใช้จะปรับ)

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
