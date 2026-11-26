"""Willingness-to-pay for choice-based conjoint (2026-11).

WTP needs a price COEFFICIENT — a marginal utility of money. The platform's
estimators dummy-code every attribute, price included, so they never produce
one. This module re-estimates the conditional logit with price entered as a
single LINEAR numeric term (all other attributes dummy-coded with the same
reference convention as `calculate_mnl_analysis`) and derives

    WTP_k = −β_k / β_price            (value of level k relative to its reference)

Honesty rules (each enforced, each reported):

* refused unless a numeric price attribute exists (≥ 2 distinct numeric levels)
* refused unless β_price < 0 and significant (p < .05) — a non-negative or
  insignificant price coefficient makes the ratio meaningless / unbounded
* linearity of price is TESTED when price has ≥ 3 levels: LR test of the
  linear-price model against the dummy-price model (nested). If rejected the
  WTP is still shown but marked ``linearity_rejected`` with a warning
* confidence intervals are Krinsky–Robb (parametric bootstrap from the joint
  sampling distribution of the coefficients, 10 000 draws, seeded) — the ratio
  of two normals is skewed, so a symmetric delta-method interval can mislead.
  The delta-method SE is reported alongside for reference
* a WTP outside the tested price range is flagged as an extrapolation
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

PRICE_NAME_RE = re.compile(r"(price|ราคา|cost|ค่าใช้จ่าย|ค่าบริการ|baht|บาท)", re.IGNORECASE)
_NUM_RE = re.compile(r"-?\d+(?:[.,]\d+)*")


def parse_price(value: Any) -> Optional[float]:
    """'฿1,290' -> 1290.0 · '59 บาท' -> 59.0 · '2.5k' -> 2500.0 · 'ฟรี' -> None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip().lower()
    m = _NUM_RE.search(s.replace(" ", ""))
    if not m:
        return None
    num = m.group(0)
    # thousands separators: '1,290' / '1.290.000'; keep a single decimal point
    if num.count(",") and num.count("."):
        num = num.replace(",", "")
    elif num.count(",") == 1 and len(num.split(",")[1]) != 3:
        num = num.replace(",", ".")
    else:
        num = num.replace(",", "")
    if num.count(".") > 1:
        num = num.replace(".", "")
    try:
        v = float(num)
    except ValueError:
        return None
    tail = s[m.end(): m.end() + 2]
    if tail.startswith("k"):
        v *= 1000
    return v


def detect_price_attribute(study: Dict, price_attribute_id: Optional[str] = None):
    """Return (attribute_dict, {level_id: price}) or (None, reason)."""
    attrs = study.get("attributes", []) or []
    wanted = price_attribute_id or study.get("price_attribute_id")
    cands = [a for a in attrs if a.get("id") == wanted] if wanted else \
        [a for a in attrs if PRICE_NAME_RE.search(a.get("name") or "")]
    if not cands:
        return None, ("ไม่พบคุณลักษณะด้านราคา (ชื่อคุณลักษณะควรมีคำว่า 'ราคา' หรือ 'price' "
                      "หรือระบุ price_attribute_id)")
    for a in cands:
        prices = {l["id"]: parse_price(l.get("value")) for l in a.get("levels", []) or []}
        if prices and all(v is not None for v in prices.values()) and len(set(prices.values())) >= 2:
            return a, prices
    return None, ("คุณลักษณะด้านราคามีระดับที่ไม่ใช่ตัวเลข (เช่น 'ถูก/แพง') — "
                  "คำนวณ WTP ได้เฉพาะเมื่อทุกระดับราคาเป็นตัวเลข")


def calculate_wtp(study: Dict, responses: List[Dict], price_attribute_id: Optional[str] = None,
                  alpha: float = 0.05, n_draws: int = 10_000, seed: int = 20261126) -> Dict[str, Any]:
    import numpy as np
    import pandas as pd
    from statsmodels.discrete.conditional_models import ConditionalLogit
    from routes.conjoint import _build_conjoint_data_rows, _dummy_encode_consistent_reference

    price_attr, prices = detect_price_attribute(study, price_attribute_id)
    if price_attr is None:
        return {"status": "not_applicable", "reason_th": prices}

    data_rows, attributes, level_value_map = _build_conjoint_data_rows(study, responses)
    if not data_rows:
        return {"status": "not_applicable", "reason_th": "ไม่มีข้อมูลการเลือกที่ใช้ได้"}
    df = pd.DataFrame(data_rows)
    pname = price_attr["name"]
    value_to_price = {l.get("value"): prices[l["id"]] for l in price_attr.get("levels", []) or []}
    df["_price"] = df[pname].map(value_to_price)
    if df["_price"].isna().any():
        return {"status": "refused",
                "reason_th": "บางโปรไฟล์มีระดับราคาที่ไม่อยู่ในรายการปัจจุบัน (แก้ไขหลังออกแบบ) — สร้างแผนการทดลองใหม่ก่อน"}

    groups = df["respondent"] * 1_000_000 + pd.factorize(df["choice_set"])[0]
    other_cols = [c for c in df.columns
                  if c not in ("respondent", "choice_set", "alternative", "choice", "_price", pname)]
    other_attrs = [a for a in attributes if a.get("name") != pname]
    X_other = _dummy_encode_consistent_reference(df, other_attrs, other_cols, groups=groups) \
        if other_cols else pd.DataFrame(index=df.index)
    X_lin = X_other.copy()
    X_lin["__price__"] = df["_price"].astype(float)
    y = df["choice"]

    try:
        res_lin = ConditionalLogit(y, X_lin, groups=groups).fit(disp=False, maxiter=500, method="lbfgs")
    except Exception as e:  # pragma: no cover - defensive
        return {"status": "refused", "reason_th": f"ประมาณค่าแบบจำลองราคาเชิงเส้นไม่สำเร็จ: {e}"}

    b_p = float(res_lin.params["__price__"])
    se_p = float(res_lin.bse["__price__"])
    p_p = float(res_lin.pvalues["__price__"])
    price_vals = sorted(set(value_to_price.values()))
    base = {
        "price_attribute_id": price_attr["id"],
        "price_attribute_name": pname,
        "price_levels": price_vals,
        "price_coefficient": b_p,
        "price_se": se_p,
        "price_p_value": p_p,
        "n_choice_situations": int(groups.nunique()),
        "model": "Conditional logit, price linear (per 1 currency unit), other attributes dummy-coded",
        "ci_method": f"Krinsky–Robb, {n_draws} draws, {int((1 - alpha) * 100)}% percentile interval",
    }

    # Linearity test (needs ≥ 3 price levels): dummy-price model nests linear price.
    lin = {"tested": False}
    if len(price_vals) >= 3:
        X_dum = _dummy_encode_consistent_reference(
            df, other_attrs + [price_attr], other_cols + [pname], groups=groups)
        try:
            res_dum = ConditionalLogit(y, X_dum, groups=groups).fit(disp=False, maxiter=500, method="lbfgs")
            from scipy.stats import chi2
            lr = max(2.0 * (float(res_dum.llf) - float(res_lin.llf)), 0.0)
            df_lr = int(len(res_dum.params) - len(res_lin.params))
            p_lr = float(chi2.sf(lr, df_lr)) if df_lr > 0 else None
            lin = {"tested": True, "lr_statistic": lr, "df": df_lr, "p_value": p_lr,
                   "rejected": bool(p_lr is not None and p_lr < alpha)}
        except Exception as e:  # pragma: no cover
            lin = {"tested": False, "error": str(e)}
    base["linearity_test"] = lin

    if not (b_p < 0 and p_p < alpha):
        base.update({
            "status": "refused",
            "reason_th": (
                f"ไม่คำนวณ WTP: สัมประสิทธิ์ราคา β = {b_p:.4f} (p = {p_p:.3f}) "
                + ("ไม่เป็นลบ — ผู้ตอบไม่ได้แสดงว่าราคาที่สูงขึ้นลดความน่าสนใจ"
                   if b_p >= 0 else "ไม่มีนัยสำคัญทางสถิติ")
                + " การหาร β ของคุณลักษณะด้วย β ราคาในกรณีนี้ให้ตัวเลขที่ไม่มีความหมาย"
            ),
            "levels": [],
        })
        return base

    names = list(res_lin.params.index)
    cov = np.asarray(res_lin.cov_params(), dtype=float)
    mean = np.asarray(res_lin.params, dtype=float)
    ip = names.index("__price__")
    rng = np.random.default_rng(seed)
    draws = rng.multivariate_normal(mean, cov, size=n_draws, method="eigh")
    bp_draws = draws[:, ip]
    lo_q, hi_q = 100 * alpha / 2, 100 * (1 - alpha / 2)
    p_range = max(price_vals) - min(price_vals)

    levels_out = []
    for attr in other_attrs:
        ref_col = (X_other.attrs.get("reference_cols") or {}).get(attr["name"]) if hasattr(X_other, "attrs") else None
        for lvl in attr.get("levels", []) or []:
            col = f"{attr['name']}_{lvl.get('value')}"
            if col not in names:
                levels_out.append({
                    "attribute_id": attr["id"], "attribute": attr["name"], "level_id": lvl["id"],
                    "level": lvl.get("value"),
                    "is_reference": col == ref_col,
                    "wtp": 0.0 if col == ref_col else None,
                    "note_th": "ระดับอ้างอิง (WTP = 0)" if col == ref_col else "ประมาณค่าไม่ได้",
                })
                continue
            k = names.index(col)
            b_k = float(mean[k])
            wtp = -b_k / b_p
            g = np.zeros(len(mean))
            g[k] = -1.0 / b_p
            g[ip] = b_k / (b_p ** 2)
            se_delta = float(np.sqrt(max(g @ cov @ g, 0.0)))
            kr = -draws[:, k] / bp_draws
            lo, hi = float(np.percentile(kr, lo_q)), float(np.percentile(kr, hi_q))
            levels_out.append({
                "attribute_id": attr["id"], "attribute": attr["name"], "level_id": lvl["id"],
                "level": lvl.get("value"), "is_reference": False,
                "beta": b_k, "wtp": wtp, "se_delta": se_delta, "ci_low": lo, "ci_high": hi,
                "ci_excludes_zero": bool(lo > 0 or hi < 0),
                "extrapolated": bool(abs(wtp) > p_range),
            })

    warnings = []
    if lin.get("rejected"):
        warnings.append("การทดสอบ LR ปฏิเสธข้อสมมติว่าราคามีผลเชิงเส้น (p < .05) — WTP ที่รายงานเป็นค่าประมาณเฉลี่ย"
                        " ตลอดช่วงราคา ควรรายงานพร้อมข้อจำกัดนี้")
    if any(l.get("extrapolated") for l in levels_out):
        warnings.append("WTP บางค่ามากกว่าช่วงราคาที่ทดสอบ — เป็นการประมาณนอกช่วงข้อมูล ห้ามตีความเป็นราคาที่ตั้งได้จริง")
    warnings.append("WTP เป็นค่าเฉลี่ยระดับประชากรจาก MNL (สมมติให้ทุกคนมีความไวต่อราคาเท่ากัน) "
                    "และเป็นมูลค่าเทียบกับระดับอ้างอิงของคุณลักษณะนั้น ไม่ใช่ราคาสินค้าทั้งชิ้น")
    base.update({
        "status": "warning" if lin.get("rejected") else "ok",
        "levels": levels_out,
        "warnings_th": warnings,
        "log_likelihood": float(res_lin.llf),
    })
    return base
