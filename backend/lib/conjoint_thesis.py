"""Deterministic (no-AI) thesis material for conjoint studies — 2026-11.

Everything in this module is computed from the study document and the
estimator outputs. It feeds three things:

1. the facts block given to the AI writer (system or external), so Chapter 3
   describes the design that was actually fielded instead of a generic one;
2. the no-AI thesis document (methods text + APA-style tables + figure);
3. the external-LLM "pack" (Markdown) a student takes to their own LLM.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

METHOD_NAMES = {
    "counting": "Counting Method (นับความถี่)",
    "mnl": "Multinomial Logit Model (MNL)",
    "linear_regression": "Linear Regression (OLS)",
    "mixed_logit": "Mixed Logit (Random Parameters Logit)",
    "hierarchical_bayes": "Hierarchical Bayes (HB)",
}

DEMO_LABELS_TH = {
    "age": "อายุ", "gender": "เพศ", "occupation": "อาชีพ", "education": "การศึกษา",
    "region": "ภูมิภาค", "income": "รายได้",
}


# --------------------------------------------------------------------------
# number formatting (APA 7)
# --------------------------------------------------------------------------
def fmt_num(v: Any, d: int = 3) -> str:
    if v is None or (isinstance(v, float) and not math.isfinite(v)):
        return "—"
    if isinstance(v, (int,)) and not isinstance(v, bool):
        return f"{v:,}"
    try:
        return f"{float(v):.{d}f}"
    except (TypeError, ValueError):
        return str(v)


def fmt_p(p: Any) -> str:
    """APA: no leading zero, '< .001' floor."""
    if p is None:
        return "—"
    try:
        p = float(p)
    except (TypeError, ValueError):
        return "—"
    if not math.isfinite(p):
        return "—"
    if p < 0.001:
        return "< .001"
    s = f"{p:.3f}"
    return s[1:] if s.startswith("0") else s


def fmt_bounded(v: Any, d: int = 3) -> str:
    """Statistics bounded by ±1 (ρ², R²): no leading zero."""
    s = fmt_num(v, d)
    if s.startswith("0."):
        return s[1:]
    if s.startswith("-0."):
        return "-" + s[2:]
    return s


def stars(p: Any) -> str:
    try:
        p = float(p)
    except (TypeError, ValueError):
        return ""
    return "***" if p < .001 else "**" if p < .01 else "*" if p < .05 else ""


def md_table(header: List[str], rows: List[List[Any]]) -> str:
    out = ["| " + " | ".join(str(h) for h in header) + " |",
           "|" + "|".join("---" for _ in header) + "|"]
    for r in rows:
        out.append("| " + " | ".join("" if c is None else str(c).replace("|", "/") for c in r) + " |")
    return "\n".join(out)


# --------------------------------------------------------------------------
# facts
# --------------------------------------------------------------------------
def randomization_text_th(rnd: Dict[str, Any]) -> str:
    """Honest description of task-order / position randomisation, from the data.

    The survey page randomises per respondent since 2026-11 and records what was
    shown; responses collected before that saw the design order. Never claim
    more than the recorded data shows.
    """
    status = (rnd or {}).get("status")
    n = (rnd or {}).get("n_responses", 0)
    k = (rnd or {}).get("n_with_display_order", 0)
    what = []
    if (rnd or {}).get("order_varies"):
        what.append("ลำดับของชุดคำถาม")
    if (rnd or {}).get("positions_vary"):
        what.append("ตำแหน่งของทางเลือกในแต่ละชุด")
    what_txt = " และ".join(what) if what else "ลำดับของชุดคำถามและตำแหน่งของทางเลือก"
    if status == "randomised":
        return (f"ผู้ตอบทุกคนเห็นชุดคำถามชุดเดียวกัน (1 version) แต่ระบบสุ่ม{what_txt}แยกตามผู้ตอบแต่ละคน "
                "และบันทึกลำดับที่แสดงจริงไว้ในข้อมูล (ไม่มี blocking หลาย version)")
    if status == "mixed":
        return (f"ผู้ตอบ {k} จาก {n} คนได้รับการสุ่ม{what_txt}แยกตามผู้ตอบแต่ละคน (บันทึกลำดับที่แสดงจริงไว้) "
                f"ส่วนอีก {n - k} คนซึ่งตอบก่อนที่ระบบจะเพิ่มการสุ่ม เห็นชุดคำถามในลำดับเดียวกันและตำแหน่งทางเลือกเหมือนกัน "
                "ตามแผนการทดลอง — ต้องรายงานทั้งสองส่วนตามจริง (1 version, ไม่มี blocking)")
    return ("ผู้ตอบทุกคนเห็นชุดคำถามชุดเดียวกัน (1 version) ในลำดับเดียวกัน และตำแหน่งของทางเลือกเหมือนกัน "
            "— ระบบไม่ได้สุ่มลำดับชุดคำถามหรือสุ่มตำแหน่งทางเลือก")


def design_facts(study: Dict, responses: List[Dict]) -> Dict[str, Any]:
    from routes.conjoint import recommend_sample_size, calculate_optimal_choice_sets

    attrs = study.get("attributes", []) or []
    cs = study.get("choice_sets", []) or []
    alts = int(study.get("alternatives_per_set") or (len(cs[0].get("profiles", [])) if cs else 0) or 0)
    levels = [len(a.get("levels", []) or []) for a in attrs]
    k = max(sum(levels) - len(attrs), 0)
    cs_map = {c["id"]: c for c in cs}

    usable = 0
    for r in responses:
        for ch in r.get("responses", []) or []:
            c = cs_map.get(ch.get("choice_set_id"))
            if not c:
                continue
            prof = c.get("profiles", []) or []
            if len(prof) >= 2 and sum(1 for p in prof if p.get("id") == ch.get("selected_profile_id")) == 1:
                usable += 1

    # Level balance and overlap of the fielded design (computed, not asserted).
    balance = []
    for a in attrs:
        cnt = {l["id"]: 0 for l in a.get("levels", []) or []}
        overl = 0
        for c in cs:
            vals = [(p.get("attribute_levels") or {}).get(a["id"]) for p in c.get("profiles", []) or []]
            for v in vals:
                if v in cnt:
                    cnt[v] += 1
            if len(set(vals)) < len(vals):
                overl += 1
        freq = list(cnt.values())
        balance.append({
            "attribute": a.get("name"),
            "level_frequencies": freq,
            "min_freq": min(freq) if freq else 0,
            "max_freq": max(freq) if freq else 0,
            "sets_with_overlap": overl,
        })

    from lib.conjoint_quality import randomization_summary
    rnd = randomization_summary(study, responses)

    n = len(responses)
    c_max = max(levels) if levels else 1
    jo_score = (n * len(cs) * alts / c_max) if c_max else 0
    dm = (study.get("design_method") or "d-optimal").lower()
    return {
        "title": study.get("title", ""),
        "description": study.get("description") or "",
        "product_category": study.get("product_category") or "",
        "attributes": [{"name": a.get("name"), "levels": [l.get("value") for l in a.get("levels", []) or []]}
                       for a in attrs],
        "n_attributes": len(attrs),
        "levels_per_attribute": levels,
        "n_parameters_main_effects": k,
        "n_tasks": len(cs),
        "alternatives_per_task": alts,
        "recommended_tasks": calculate_optimal_choice_sets(len(attrs), levels, alts) if attrs and alts else None,
        "design_method": dm,
        "design_algorithm_th": (
            "แผนการทดลองแบบมีประสิทธิภาพเชิง D (D-efficient choice design) สร้างด้วยอัลกอริทึม modified Fedorov "
            "บนเมทริกซ์สารสนเทศของ MNL ภายใต้ข้อสมมติ β = 0 (utility-neutral) จากหลายจุดเริ่มต้น "
            "ไม่มีทางเลือกซ้ำภายในชุดเดียวกัน (Huber & Zwerina, 1996)"
        ),
        "versions": 1,
        "randomization": rnd,
        "randomization_th": randomization_text_th(rnd),
        "none_option": False,
        "holdout_tasks": 0,
        "coding_th": "Dummy coding โดยระดับอ้างอิง (reference level) คือระดับสุดท้ายที่ประกาศไว้และถูกแสดงจริง (utility = 0)",
        "n_responses": n,
        "n_usable_choice_situations": usable,
        "johnson_orme_score": round(jo_score, 1),
        "sample_size_rule": recommend_sample_size(levels or [1], len(cs) or 1, alts or 1),
        "balance": balance,
    }


def demographics_summary(study: Dict, responses: List[Dict]) -> Dict[str, List[Dict[str, Any]]]:
    fields = list(study.get("demographics_to_capture") or [])
    for r in responses:
        for k in (r.get("demographics") or {}):
            if k not in fields:
                fields.append(k)
    n = len(responses)
    out = {}
    for f in fields:
        counts: Dict[str, int] = {}
        missing = 0
        for r in responses:
            v = (r.get("demographics") or {}).get(f)
            if v in (None, ""):
                missing += 1
            else:
                counts[str(v)] = counts.get(str(v), 0) + 1
        if not counts:
            continue
        rows = [{"value": k, "n": c, "pct": round(100.0 * c / n, 1) if n else 0.0}
                for k, c in sorted(counts.items(), key=lambda kv: -kv[1])]
        if missing:
            rows.append({"value": "ไม่ระบุ", "n": missing, "pct": round(100.0 * missing / n, 1)})
        out[f] = rows
    return out


def facts_text(facts: Dict[str, Any], demo: Dict[str, List[Dict]], quality: Optional[Dict] = None) -> str:
    """Plain-text facts block for prompts (AI writer must use these, not invent)."""
    lines = ["ข้อเท็จจริงของแผนการทดลองและข้อมูล (คำนวณโดยระบบ — ใช้ตามนี้เท่านั้น):",
             f"- จำนวนคุณลักษณะ: {facts['n_attributes']}"]
    for a in facts["attributes"]:
        lines.append(f"  • {a['name']}: {len(a['levels'])} ระดับ ({', '.join(str(v) for v in a['levels'])})")
    lines += [
        f"- จำนวนพารามิเตอร์ main effects: {facts['n_parameters_main_effects']}",
        f"- จำนวนชุดคำถาม (choice tasks) ต่อผู้ตอบ: {facts['n_tasks']}",
        f"- จำนวนทางเลือกต่อชุด: {facts['alternatives_per_task']}",
        f"- ทางเลือก 'ไม่เลือก' (none option): {'มี' if facts['none_option'] else 'ไม่มี'}",
        f"- holdout tasks: {facts['holdout_tasks']}",
        f"- วิธีสร้างแผนการทดลอง: {facts['design_algorithm_th']}",
        f"- การสุ่ม: {facts['randomization_th']}",
        f"- การเข้ารหัสตัวแปร: {facts['coding_th']}",
        f"- จำนวนผู้ตอบ (รายการที่ส่ง): {facts['n_responses']}",
        f"- จำนวนสถานการณ์การเลือกที่ใช้วิเคราะห์ได้: {facts['n_usable_choice_situations']}",
        f"- เกณฑ์ขนาดตัวอย่าง Johnson & Orme: n·t·a/c = {facts['johnson_orme_score']} "
        f"(เกณฑ์ขั้นต่ำ 500; ต้องการผู้ตอบอย่างน้อย {facts['sample_size_rule']['minimum']} คน, "
        f"แนะนำ {facts['sample_size_rule']['recommended']} คน)",
    ]
    if demo:
        lines.append("- ข้อมูลทั่วไปของผู้ตอบ (ความถี่ / ร้อยละ):")
        for f, rows in demo.items():
            lab = DEMO_LABELS_TH.get(f, f)
            lines.append(f"  • {lab}: " + "; ".join(f"{r['value']} {r['n']} คน ({r['pct']}%)" for r in rows))
    else:
        lines.append("- ข้อมูลทั่วไปของผู้ตอบ: ไม่ได้เก็บ — ห้ามบรรยายลักษณะประชากรของกลุ่มตัวอย่าง")
    if quality:
        c = quality.get("counts", {})
        lines.append(
            f"- การตรวจคุณภาพข้อมูล (ไม่ได้ตัดออกจากการวิเคราะห์): speeder {c.get('speeder', 0)}, "
            f"straight-liner {c.get('straightliner', 0)}, ส่งซ้ำ {c.get('duplicate_id', 0) + c.get('duplicate_email', 0)}, "
            f"อาจส่งซ้ำ {c.get('possible_duplicate', 0)} รายการ")
    return "\n".join(lines)


def methods_paragraph_th(facts: Dict[str, Any], methods: List[str]) -> str:
    attrs_txt = ", ".join(f"{a['name']} ({len(a['levels'])} ระดับ)" for a in facts["attributes"])
    mtxt = ", ".join(METHOD_NAMES.get(m, m) for m in methods)
    jo = facts["johnson_orme_score"]
    verdict = ("ผ่านเกณฑ์ขั้นต่ำ" if jo >= 500 else "ยังต่ำกว่าเกณฑ์ขั้นต่ำ")
    return (
        f"การวิจัยนี้ใช้การวิเคราะห์ร่วมแบบอิงการเลือก (Choice-Based Conjoint Analysis) ประกอบด้วยคุณลักษณะ "
        f"{facts['n_attributes']} คุณลักษณะ ได้แก่ {attrs_txt} ผู้ตอบแต่ละคนตอบชุดคำถาม {facts['n_tasks']} ชุด "
        f"ชุดละ {facts['alternatives_per_task']} ทางเลือก โดยไม่มีทางเลือก \"ไม่เลือก\" "
        f"{facts['design_algorithm_th']} {facts['randomization_th']} "
        f"ข้อมูลที่ได้รับมีผู้ตอบ {facts['n_responses']} รายการ คิดเป็นสถานการณ์การเลือกที่ใช้วิเคราะห์ได้ "
        f"{facts['n_usable_choice_situations']} สถานการณ์ ค่าดัชนีขนาดตัวอย่างตามเกณฑ์ของ Johnson และ Orme "
        f"(n·t·a/c) เท่ากับ {jo} ซึ่ง{verdict} 500 "
        f"{facts['coding_th']} และวิเคราะห์ข้อมูลด้วย {mtxt}"
    )


# --------------------------------------------------------------------------
# APA-style tables
# --------------------------------------------------------------------------
def importance_rows(result: Dict) -> List[List[Any]]:
    imp = (result or {}).get("importance_scores") or {}
    items = [(v.get("name", k), v.get("importance", 0.0)) for k, v in imp.items() if isinstance(v, dict)]
    items.sort(key=lambda t: -float(t[1] or 0))
    return [[i + 1, n, f"{float(v):.2f}"] for i, (n, v) in enumerate(items)]


def _level_rows_logit(result: Dict, with_inference: bool) -> List[List[Any]]:
    rows = []
    coefs = result.get("coefficients") or {}
    ses = result.get("std_errors") or {}
    zs = result.get("z_values") or {}
    ps = result.get("p_values") or {}
    lo = result.get("ci_lower") or {}
    hi = result.get("ci_upper") or {}
    for attr_id, a in (result.get("part_worths") or {}).items():
        for lid, lv in (a.get("levels") or {}).items():
            col = f"{a.get('name')}_{lv.get('value')}"
            if lv.get("is_reference"):
                rows.append([a.get("name"), lv.get("value"), "0 (อ้างอิง)", "", "", "", ""])
                continue
            if lv.get("is_excluded") or (col not in coefs and with_inference):
                rows.append([a.get("name"), lv.get("value"), "ประมาณค่าไม่ได้", "", "", "", ""])
                continue
            b = coefs.get(col, lv.get("utility"))
            if with_inference:
                ci = f"[{fmt_num(lo.get(col))}, {fmt_num(hi.get(col))}]" if col in lo else "—"
                rows.append([a.get("name"), lv.get("value"), fmt_num(b) + stars(ps.get(col)),
                             fmt_num(ses.get(col)), fmt_num(zs.get(col), 2), fmt_p(ps.get(col)), ci])
            else:
                rows.append([a.get("name"), lv.get("value"), fmt_num(b), "", "", "", ""])
    return rows


def method_tables_markdown(method: str, result: Dict, table_no: List[int]) -> str:
    """APA-style tables for one method. ``table_no`` is a one-element counter list."""
    if not result:
        return f"_ไม่มีผล {METHOD_NAMES.get(method, method)} (ประมาณค่าไม่สำเร็จหรือข้อมูลไม่พอ)_\n"
    out = []
    name = METHOD_NAMES.get(method, method)

    def cap(title):
        table_no[0] += 1
        out.append(f"[ตาราง 4.{table_no[0]}: {title}]")

    cap(f"ความสำคัญของคุณลักษณะ (%) — {name}")
    out.append(md_table(["อันดับ", "คุณลักษณะ", "ความสำคัญ (%)"], importance_rows(result)))
    if method == "hierarchical_bayes" and result.get("importance_basis") == "individual":
        out.append("_หมายเหตุ. ความสำคัญคำนวณรายบุคคลแล้วเฉลี่ย (Sawtooth definition)_")
    out.append("")

    if method == "mnl":
        cap(f"ค่าสัมประสิทธิ์ part-worth — {name}")
        out.append(md_table(["คุณลักษณะ", "ระดับ", "β", "SE", "z", "p", "95% CI"],
                            _level_rows_logit(result, True)))
        out.append("_หมายเหตุ. Dummy coding; ระดับอ้างอิง = 0. *p < .05, **p < .01, ***p < .001_")
    elif method == "mixed_logit":
        cap(f"ค่าเฉลี่ยและส่วนเบี่ยงเบนของ part-worth — {name}")
        rows = []
        m, se, p = result.get("coefficients") or {}, result.get("std_errors") or {}, result.get("p_values") or {}
        sd, sdp = result.get("std_coefficients") or {}, result.get("sd_p_values") or {}
        rnd = set(result.get("random_vars") or [])
        for col in m:
            rows.append([col, fmt_num(m[col]) + stars(p.get(col)), fmt_num(se.get(col)), fmt_p(p.get(col)),
                         fmt_num(sd.get(col)) if col in rnd else "fixed",
                         fmt_p(sdp.get(col)) if col in rnd else ""])
        out.append(md_table(["พารามิเตอร์", "mean β", "SE", "p", "σ̂", "p(σ̂)"], rows))
    elif method == "hierarchical_bayes":
        cap(f"part-worth ระดับประชากร — {name}")
        pm, ps_ = result.get("population_mean") or {}, result.get("population_std") or {}
        q = result.get("individual_quantiles") or {}
        rows = [[col, fmt_num(pm[col]), fmt_num(ps_.get(col)),
                 f"{q.get(col, {}).get('pct_positive', float('nan')):.1f}" if col in q else "—"] for col in pm]
        out.append(md_table(["พารามิเตอร์", "β̄", "SD ระหว่างบุคคล", "% ผู้ตอบที่ β > 0"], rows))
        out.append("_หมายเหตุ. SD คือการกระจายระหว่างบุคคล ไม่ใช่ standard error; Empirical Bayes (Train, 2009, บทที่ 11)_")
    elif method == "linear_regression":
        cap(f"ค่าสัมประสิทธิ์ — {name} (cluster-robust SE)")
        rows = []
        for attr_id, a in (result.get("coefficients") or {}).items():
            for lid, lv in (a.get("levels") or {}).items():
                if lv.get("is_reference"):
                    rows.append([a.get("name"), lv.get("value"), "0 (อ้างอิง)", "", "", ""])
                elif lv.get("is_excluded"):
                    rows.append([a.get("name"), lv.get("value"), "ประมาณค่าไม่ได้", "", "", ""])
                else:
                    rows.append([a.get("name"), lv.get("value"), fmt_num(lv.get("coefficient")) + stars(lv.get("p_value")),
                                 fmt_num(lv.get("std_error")), fmt_num(lv.get("t_value"), 2), fmt_p(lv.get("p_value"))])
        out.append(md_table(["คุณลักษณะ", "ระดับ", "β", "SE (robust)", "t", "p"], rows))
    elif method == "counting":
        cap(f"อัตราการถูกเลือกแบบมีเงื่อนไข — {name}")
        rows = []
        for attr_id, a in (result.get("part_worths") or {}).items():
            for lid, lv in (a.get("levels") or {}).items():
                rows.append([a.get("name"), lv.get("value"), fmt_num(lv.get("utility"), 2),
                             lv.get("selection_count", ""), lv.get("appearance_count", "")])
        out.append(md_table(["คุณลักษณะ", "ระดับ", "อัตราการถูกเลือก (%)", "ถูกเลือก", "ถูกแสดง"], rows))
        out.append("_หมายเหตุ. สถิติเชิงพรรณนา ไม่มีการทดสอบนัยสำคัญ_")
    out.append("")

    if method in ("mnl", "mixed_logit", "hierarchical_bayes"):
        cap(f"ค่าสถิติความเหมาะสมของแบบจำลอง — {name}")
        r = result
        rows = [
            ["Log-likelihood (LL)", fmt_num(r.get("log_likelihood"), 2)],
            ["Null log-likelihood (LL₀)", fmt_num(r.get("log_likelihood_null"), 2)],
            ["McFadden ρ²", fmt_bounded(r.get("pseudo_r_squared"))],
            ["Adjusted ρ²", fmt_bounded(r.get("pseudo_r_squared_adj"))],
            ["LR χ²(df)", f"{fmt_num(r.get('lr_statistic'), 2)} ({r.get('lr_df', '—')})"],
            ["p (LR test)", fmt_p(r.get("lr_p_value"))],
            ["AIC", fmt_num(r.get("aic"), 2)],
            ["BIC", fmt_num(r.get("bic"), 2)],
            ["จำนวนพารามิเตอร์ (k)", r.get("n_parameters", "—")],
            ["จำนวนสถานการณ์การเลือก (N)", r.get("n_choice_situations", "—")],
            ["จำนวนผู้ตอบ", r.get("n_respondents", "—")],
        ]
        if r.get("converged") is not None:
            rows.append(["การลู่เข้าของการประมาณค่า", "ลู่เข้า" if r.get("converged") else "ไม่ลู่เข้า — ห้ามรายงานผล"])
        out.append(md_table(["สถิติ", "ค่า"], rows))
        out.append("")
    elif method == "linear_regression":
        cap(f"ค่าสถิติของแบบจำลอง — {name}")
        k, n = result.get("n_parameters"), result.get("n_observations")
        df_txt = f"F({int(k) - 1}, {int(n) - int(k)})" if k and n else "F"
        out.append(md_table(["สถิติ", "ค่า"], [
            ["R²", fmt_bounded(result.get("r_squared"))],
            ["Adjusted R²", fmt_bounded(result.get("adj_r_squared"))],
            [df_txt, fmt_num(result.get("f_statistic"), 2)],
            ["p", fmt_p(result.get("f_pvalue"))],
            ["N (แถวทางเลือก)", n],
        ]))
        out.append("")
    return "\n".join(out)


def wtp_table_markdown(wtp: Optional[Dict], table_no: List[int]) -> str:
    if not wtp or wtp.get("status") in (None, "not_applicable"):
        return ""
    if wtp.get("status") == "refused":
        return f"_ความเต็มใจจ่าย (WTP): ไม่คำนวณ — {wtp.get('reason_th', '')}_\n"
    table_no[0] += 1
    rows = []
    for l in wtp.get("levels", []):
        if l.get("is_reference"):
            rows.append([l["attribute"], l["level"], "0 (อ้างอิง)", "", ""])
        elif l.get("wtp") is None:
            rows.append([l["attribute"], l["level"], "ประมาณค่าไม่ได้", "", ""])
        else:
            rows.append([l["attribute"], l["level"], fmt_num(l["wtp"], 2), fmt_num(l.get("se_delta"), 2),
                         f"[{fmt_num(l['ci_low'], 2)}, {fmt_num(l['ci_high'], 2)}]"])
    p_txt = fmt_p(wtp.get("price_p_value"))
    p_txt = p_txt if p_txt.startswith("<") else f"= {p_txt}"
    out = [f"[ตาราง 4.{table_no[0]}: ความเต็มใจจ่าย (WTP) เทียบกับระดับอ้างอิง — หน่วยเดียวกับ {wtp.get('price_attribute_name')}]",
           md_table(["คุณลักษณะ", "ระดับ", "WTP", "SE (delta)", "95% CI (Krinsky–Robb)"], rows),
           f"_หมายเหตุ. WTP = −β/β_ราคา; β_ราคา = {fmt_num(wtp.get('price_coefficient'), 4)} (p {p_txt})_"]
    for w in wtp.get("warnings_th", []) or []:
        out.append(f"_{w}_")
    out.append("")
    return "\n".join(out)


def demographics_table_markdown(demo: Dict[str, List[Dict]], table_no: List[int]) -> str:
    if not demo:
        return "_ไม่ได้เก็บข้อมูลทั่วไปของผู้ตอบ_\n"
    table_no[0] += 1
    rows = []
    for f, items in demo.items():
        for i, r in enumerate(items):
            rows.append([DEMO_LABELS_TH.get(f, f) if i == 0 else "", r["value"], r["n"], f"{r['pct']:.1f}"])
    return (f"[ตาราง 4.{table_no[0]}: ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม]\n"
            + md_table(["ตัวแปร", "กลุ่ม", "จำนวน (คน)", "ร้อยละ"], rows) + "\n")


def design_table_markdown(facts: Dict[str, Any], label: str = "3.1") -> str:
    rows = [[a["name"], len(a["levels"]), ", ".join(str(v) for v in a["levels"])] for a in facts["attributes"]]
    return (f"[ตาราง {label}: คุณลักษณะและระดับที่ใช้ในการทดลอง]\n"
            + md_table(["คุณลักษณะ", "จำนวนระดับ", "ระดับ"], rows) + "\n")


def top_attribute_sentence(method: str, result: Dict) -> str:
    rows = importance_rows(result or {})
    if not rows:
        return ""
    top = rows[0]
    s = f"จากผลการวิเคราะห์ด้วย {METHOD_NAMES.get(method, method)} คุณลักษณะที่มีความสำคัญสูงสุดคือ {top[1]} ({top[2]}%)"
    if len(rows) > 1:
        s += f" รองลงมาคือ {rows[1][1]} ({rows[1][2]}%)"
    return s + " โดยความสำคัญคำนวณจากพิสัยของ part-worth ภายในคุณลักษณะหารด้วยผลรวมพิสัยของทุกคุณลักษณะ"


# --------------------------------------------------------------------------
# full documents
# --------------------------------------------------------------------------
def no_ai_thesis_markdown(*, facts: Dict, demo: Dict, methods: List[str], all_results: Dict,
                          equations: Dict[str, str], wtp: Optional[Dict] = None,
                          quality: Optional[Dict] = None, chapters: Optional[List[int]] = None,
                          include_figure: bool = False) -> str:
    chapters = chapters or [3, 4]
    parts: List[str] = []
    if 3 in chapters:
        parts += ["## บทที่ 3 ระเบียบวิธีวิจัย", "",
                  "### 3.1 รูปแบบการวิจัยและแผนการทดลอง", "", methods_paragraph_th(facts, methods), "",
                  design_table_markdown(facts), "",
                  "### 3.2 ประชากรและกลุ่มตัวอย่าง", "",
                  (f"กลุ่มตัวอย่างประกอบด้วยผู้ตอบ {facts['n_responses']} รายการ เกณฑ์ขนาดตัวอย่างของ Johnson และ Orme "
                   f"กำหนดให้ n·t·a/c ≥ 500 ซึ่งสำหรับแผนการทดลองนี้เทียบเท่าผู้ตอบอย่างน้อย "
                   f"{facts['sample_size_rule']['minimum']} คน (แนะนำ {facts['sample_size_rule']['recommended']} คน "
                   "หากต้องการวิเคราะห์กลุ่มย่อย)"), ""]
        if quality:
            c = quality.get("counts", {})
            parts += [(f"การตรวจคุณภาพข้อมูลพบผู้ตอบที่ใช้เวลาน้อยผิดปกติ (speeder) {c.get('speeder', 0)} ราย "
                       f"ผู้ตอบที่เลือกตำแหน่งเดิมทุกข้อ (straight-liner) {c.get('straightliner', 0)} ราย และรายการที่อาจส่งซ้ำ "
                       f"{c.get('duplicate_id', 0) + c.get('duplicate_email', 0) + c.get('possible_duplicate', 0)} รายการ "
                       "ผลการวิเคราะห์ในรายงานนี้ใช้ข้อมูลทั้งหมดโดยไม่ได้ตัดรายการดังกล่าวออก"), ""]
        sec = 2
        for m in methods:
            sec += 1
            parts += [f"### 3.{sec} วิธีการวิเคราะห์ข้อมูล — {METHOD_NAMES.get(m, m)}", ""]
            parts += [ln if ln.strip() else "" for ln in (equations.get(m) or "").strip().splitlines()]
            parts.append("")
        parts += ["### 3.%d ความสำคัญของคุณลักษณะ" % (sec + 1), "",
                  "ความสำคัญของคุณลักษณะ k คำนวณจาก I_k = [max(U_k) − min(U_k)] / Σ_i [max(U_i) − min(U_i)] × 100", ""]
        if wtp and wtp.get("status") in ("ok", "warning"):
            parts += ["### 3.%d ความเต็มใจจ่าย (Willingness to Pay)" % (sec + 2), "",
                      (f"WTP ของระดับ k คำนวณจาก WTP_k = −β_k / β_ราคา โดยประมาณแบบจำลอง conditional logit ที่ใส่ "
                       f"{wtp.get('price_attribute_name')} เป็นตัวแปรเชิงเส้น ช่วงความเชื่อมั่น 95% คำนวณด้วยวิธี "
                       "Krinsky–Robb (10,000 draws) และทดสอบความเป็นเชิงเส้นของราคาด้วย likelihood-ratio test"), ""]
        parts += ["---", ""]
    if 4 in chapters:
        tno = [0]
        parts += ["## บทที่ 4 ผลการศึกษา", "", "### 4.1 ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม", "",
                  demographics_table_markdown(demo, tno), ""]
        sec = 1
        for m in methods:
            sec += 1
            parts += [f"### 4.{sec} ผลการวิเคราะห์ด้วย {METHOD_NAMES.get(m, m)}", ""]
            sent = top_attribute_sentence(m, all_results.get(m))
            if sent:
                parts += [sent, ""]
            if include_figure and m == methods[0]:
                parts += [f"[[FIGURE:importance:{m}]]", ""]
            parts += [method_tables_markdown(m, all_results.get(m), tno), ""]
        if wtp and wtp.get("status") not in (None, "not_applicable"):
            sec += 1
            parts += [f"### 4.{sec} ความเต็มใจจ่าย (Willingness to Pay)", "", wtp_table_markdown(wtp, tno), ""]
    return "\n".join(parts).strip() + "\n"


def importance_chart_png(result: Dict, title: str = "ความสำคัญของคุณลักษณะ (%)") -> Optional[bytes]:
    """Horizontal bar chart of importance; None if matplotlib/fonts unavailable."""
    rows = importance_rows(result or {})
    if not rows:
        return None
    try:
        import io
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        plt.rcParams["font.family"] = "sans-serif"
        plt.rcParams["font.sans-serif"] = ["Loma", "Garuda", "Noto Sans Thai", "DejaVu Sans"]
        plt.rcParams["axes.unicode_minus"] = False
        names = [r[1] for r in rows][::-1]
        vals = [float(r[2]) for r in rows][::-1]
        fig, ax = plt.subplots(figsize=(7, max(2.5, 0.5 * len(rows) + 1)))
        ax.barh(names, vals, color="#4b5563")
        for i, v in enumerate(vals):
            ax.text(v + 0.5, i, f"{v:.1f}", va="center", fontsize=9)
        ax.set_xlabel(title)
        ax.set_xlim(0, max(vals) * 1.15 if vals else 1)
        for s in ("top", "right"):
            ax.spines[s].set_visible(False)
        fig.tight_layout()
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150)
        plt.close(fig)
        return buf.getvalue()
    except Exception:  # pragma: no cover - optional
        return None


PACK_STEPS_TH = """1. อ่านส่วน "ข้อเท็จจริงของการศึกษา" และ "ตารางผลการวิเคราะห์" ให้ครบ — ตัวเลขทั้งหมดคำนวณโดยระบบแล้ว
2. เปิด AI ที่คุณใช้ (ChatGPT, Claude, Gemini ฯลฯ) และเริ่มแชตใหม่ **หนึ่งแชตต่อหนึ่งบท**
3. คัดลอก "คำสั่งระบบ" (system prompt) ไปวางก่อน — ถ้า AI มีช่อง Custom instructions ให้วางที่นั่น ถ้าไม่มีให้วางไว้บนสุดของข้อความ
4. คัดลอก "พรอมต์บทที่ X" ทั้งก้อน วางต่อท้าย แล้วส่ง
5. ตรวจคำตอบ: ตัวเลขทุกตัวต้องตรงกับตารางในไฟล์นี้ ห้ามมีค่าสถิติที่ไม่อยู่ในไฟล์ (เช่น Hausman test, VIF, R̂)
6. นำเนื้อหาแต่ละบทกลับมาวางในหน้า "นำเนื้อหาบทวิทยานิพนธ์เข้า" ของระบบ เพื่อสร้างไฟล์ .docx รูปแบบ iThesis
   หรือคัดลอกไปใช้ในเอกสารของคุณเองโดยตรง
7. ระบุการใช้ AI ในวิทยานิพนธ์ตามข้อกำหนดของมหาวิทยาลัย (ระบบจะใส่ข้อความเปิดเผยการใช้ AI ให้อัตโนมัติในไฟล์ .docx)
8. ตารางในส่วนที่ 3 ของไฟล์นี้ใช้ได้ทันทีโดยไม่ต้องผ่าน AI — หรือดาวน์โหลดเอกสาร "ไม่ใช้ AI" จากระบบ"""


def external_pack_markdown(*, facts: Dict, demo: Dict, quality: Optional[Dict], methods: List[str],
                           all_results: Dict, equations: Dict[str, str], wtp: Optional[Dict],
                           system_prompt: str, chapter_prompts: Dict[int, str], generated_at: str) -> str:
    tno = [0]
    out = [f"# ชุดข้อมูลสำหรับเขียนวิทยานิพนธ์ด้วย AI ของคุณเอง — {facts.get('title', '')}", "",
           f"_สร้างโดย SWUMKT เมื่อ {generated_at} · วิธีวิเคราะห์: {', '.join(METHOD_NAMES.get(m, m) for m in methods)}_", "",
           "## ส่วนที่ 1 · ขั้นตอนการใช้งาน", "", PACK_STEPS_TH, "",
           "## ส่วนที่ 2 · ข้อเท็จจริงของการศึกษา", ""]
    if facts.get("description"):
        out += [f"**คำอธิบายการศึกษา:** {facts['description']}", ""]
    if facts.get("product_category"):
        out += [f"**หมวดสินค้า:** {facts['product_category']}", ""]
    out += [methods_paragraph_th(facts, methods), "", design_table_markdown(facts), "",
            "```text", facts_text(facts, demo, quality), "```", "",
            "## ส่วนที่ 3 · ตารางผลการวิเคราะห์ (คำนวณโดยระบบ)", "",
            demographics_table_markdown(demo, tno), ""]
    for m in methods:
        out += [f"### {METHOD_NAMES.get(m, m)}", "", method_tables_markdown(m, all_results.get(m), tno), ""]
    if wtp and wtp.get("status") not in (None, "not_applicable"):
        out += ["### ความเต็มใจจ่าย (WTP)", "", wtp_table_markdown(wtp, tno), ""]
    out += ["## ส่วนที่ 4 · สมการของวิธีที่ใช้ (ตรงกับสิ่งที่ระบบคำนวณจริง)", ""]
    for m in methods:
        out += ["```text", (equations.get(m) or "").strip(), "```", ""]
    out += ["## ส่วนที่ 5 · พรอมต์สำหรับ AI", "", "### คำสั่งระบบ (ใช้กับทุกบท)", "", "```text", system_prompt, "```", ""]
    for ch in sorted(chapter_prompts):
        out += [f"### พรอมต์บทที่ {ch}", "", "```text", chapter_prompts[ch], "```", ""]
    return "\n".join(out)
