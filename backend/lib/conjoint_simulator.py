"""Market simulator (share of preference) for estimated conjoint models — 2026-11.

Rules
-----
* ``logit`` (share of preference): s_j = exp(V_j) / Σ_k exp(V_k).
  - MNL: V from the point estimates. Inherits IIA — adding a near-copy of a
    product steals share proportionally from every product, not mainly from
    its twin. Reported in ``caveats_th``.
  - Mixed Logit / HB: shares are averaged over draws from the estimated
    (independent normal) taste distribution, which relaxes IIA at the
    population level.
* ``first_choice``: share of simulated consumers for whom the product has the
  highest utility. Only meaningful with heterogeneity (Mixed Logit / HB);
  for MNL every consumer is identical so it degenerates to 100 % / 0 % and is
  refused.

Counting and OLS are refused: neither produces utilities on a choice-
probability scale.

There is no "none" alternative in the platform's design, so shares are
conditional on buying one of the simulated products — they are NOT market
shares, and the result says so.
"""
from __future__ import annotations

from typing import Any, Dict, List

LOGIT_METHODS = ("mnl", "mixed_logit", "hierarchical_bayes")


class SimulationError(ValueError):
    pass


def _coef_maps(method: str, result: Dict):
    if method == "hierarchical_bayes":
        mean = result.get("population_mean") or result.get("coefficients") or {}
        sd = result.get("population_std") or {}
    elif method == "mixed_logit":
        mean = result.get("coefficients") or result.get("mean_coefficients") or {}
        sd = result.get("std_coefficients") or {}
    else:
        mean, sd = result.get("coefficients") or {}, {}
    return mean, sd


def simulate_shares(study: Dict, method: str, result: Dict, products: List[Dict],
                    rule: str = "logit", n_draws: int = 5000, seed: int = 7) -> Dict[str, Any]:
    import numpy as np

    if method not in LOGIT_METHODS:
        raise SimulationError("จำลองส่วนแบ่งได้เฉพาะ MNL, Mixed Logit และ HB "
                              "(Counting/OLS ไม่ได้ให้ utility บนสเกลความน่าจะเป็นในการเลือก)")
    if rule not in ("logit", "first_choice"):
        raise SimulationError("rule ต้องเป็น 'logit' หรือ 'first_choice'")
    if rule == "first_choice" and method == "mnl":
        raise SimulationError("first_choice ใช้กับ MNL ไม่ได้ (ทุกคนมีความชอบเหมือนกัน ผลจะเป็น 100%/0%) "
                              "— ใช้ rule='logit' หรือเลือก Mixed Logit / HB")
    if not products or len(products) < 2:
        raise SimulationError("ต้องมีสินค้าอย่างน้อย 2 รายการ")

    attrs = {a["id"]: a for a in study.get("attributes", []) or []}
    mean, sd = _coef_maps(method, result)
    cols = sorted(set(mean) | set(sd))
    col_idx = {c: i for i, c in enumerate(cols)}
    X = np.zeros((len(products), len(cols)))
    described = []
    for j, prod in enumerate(products):
        desc = {}
        for aid, lid in (prod.get("levels") or {}).items():
            a = attrs.get(aid)
            if not a:
                raise SimulationError(f"ไม่พบคุณลักษณะ {aid}")
            lvl = next((l for l in a.get("levels", []) or [] if l["id"] == lid), None)
            if not lvl:
                raise SimulationError(f"ไม่พบระดับ {lid} ของ {a.get('name')}")
            col = f"{a['name']}_{lvl['value']}"
            if col in col_idx:
                X[j, col_idx[col]] = 1.0
            desc[a["name"]] = lvl["value"]
        missing = [attrs[a]["name"] for a in attrs if a not in (prod.get("levels") or {})]
        if missing:
            raise SimulationError(f"สินค้า '{prod.get('name')}' ยังไม่ได้กำหนดระดับของ: {', '.join(missing)}")
        described.append(desc)

    mu = np.array([float(mean.get(c, 0.0)) for c in cols])
    sig = np.array([abs(float(sd.get(c, 0.0))) for c in cols])
    utilities = X @ mu
    heterogeneous = method in ("mixed_logit", "hierarchical_bayes") and bool(np.any(sig > 0))

    if heterogeneous:
        rng = np.random.default_rng(seed)
        B = mu + rng.standard_normal((n_draws, len(cols))) * sig       # (R, K)
        V = B @ X.T                                                   # (R, J)
        if rule == "logit":
            V = V - V.max(axis=1, keepdims=True)
            P = np.exp(V)
            P /= P.sum(axis=1, keepdims=True)
            shares = P.mean(axis=0)
        else:
            win = V.argmax(axis=1)
            shares = np.bincount(win, minlength=len(products)) / n_draws
    else:
        v = utilities - utilities.max()
        shares = np.exp(v) / np.exp(v).sum()

    caveats = [
        "ไม่มีทางเลือก 'ไม่ซื้อ' ในแบบสอบถาม — ส่วนแบ่งนี้คือ share of preference เมื่อผู้บริโภคต้องเลือกหนึ่งในสินค้าที่จำลอง "
        "ไม่ใช่ส่วนแบ่งตลาดจริง (ไม่ได้รวมการรับรู้แบรนด์ การกระจายสินค้า หรือการตลาด)",
    ]
    if method == "mnl":
        caveats.append("MNL มีข้อสมมติ IIA: สินค้าที่คล้ายกันมากจะดึงส่วนแบ่งจากทุกสินค้าตามสัดส่วน "
                       "ซึ่งมักไม่สมจริง — หากจำลองสินค้าที่คล้ายกัน ให้ใช้ Mixed Logit/HB")
    elif not heterogeneous:
        caveats.append("แบบจำลองนี้ไม่พบความแตกต่างของรสนิยม (σ̂ = 0 ทุกตัว) จึงให้ผลเหมือน MNL")
    return {
        "method": method,
        "rule": rule,
        "heterogeneity_simulated": heterogeneous,
        "n_draws": n_draws if heterogeneous else 0,
        "products": [
            {"name": p.get("name"), "levels": described[j], "utility": float(utilities[j]),
             "share": float(shares[j])}
            for j, p in enumerate(products)
        ],
        "caveats_th": caveats,
    }
