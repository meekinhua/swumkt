"""
be_thesis_charts.py — Render every Brand Equity dashboard visual as a PNG image
suitable for embedding in a thesis DOCX.

Charts mirrored from the dashboard:
  · Top-of-Mind brand cloud (target highlighted)
  · Quality attributes radar (single brand)
  · Multi-dimensional Image radar (brand + competitors)
  · 2D Perceptual map (X attr × Y attr, brand vs competitors)
  · Identity vs Image overlap (intended traits LEFT vs perceived traits RIGHT)
  · Aaker 4-Perspective composite bars
  · NPS distribution bar
  · Likert distribution histograms (Familiarity, Overall Quality)

All functions return io.BytesIO of PNG bytes so the docx renderer can
`add_picture(buf, width=...)` directly.
"""
import io
import math
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # headless backend — required since we run in FastAPI
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm  # noqa: E402
from matplotlib.patches import Circle  # noqa: F401
import numpy as np
import os
import logging

# Register Thai-capable font (Loma is shipped via fonts-thai-tlwg in the container).
# We must use **explicit FontProperties** on every text call — matplotlib's rcParams
# fallback chain does NOT reliably apply to polar tick labels, legend, etc., which
# is why tofu boxes appeared on radar/perceptual axis labels.
#
# **Production reliability**: We bundle Loma.otf inside the repo at
# `/app/backend/fonts/Loma.otf` so the font is ALWAYS available regardless of
# whether the production container has `fonts-thai-tlwg` installed. System-installed
# Loma is kept as a secondary fallback in case the bundled file moves.
_BUNDLED_FONT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "fonts")
_THAI_FONT_FILE = None
for _candidate in (
    os.path.join(_BUNDLED_FONT_DIR, "Loma.otf"),
    "/usr/share/fonts/opentype/tlwg/Loma.otf",
    "/usr/share/fonts/truetype/tlwg/Loma.ttf",
    "/usr/share/fonts/truetype/thai/Loma.ttf",
):
    if os.path.exists(_candidate):
        _THAI_FONT_FILE = _candidate
        break
if _THAI_FONT_FILE:
    try:
        fm.fontManager.addfont(_THAI_FONT_FILE)
        _FP        = fm.FontProperties(fname=_THAI_FONT_FILE, size=9)
        _FP_TITLE  = fm.FontProperties(fname=_THAI_FONT_FILE, size=11, weight="bold")
        _FP_LABEL  = fm.FontProperties(fname=_THAI_FONT_FILE, size=10)
        _FP_SMALL  = fm.FontProperties(fname=_THAI_FONT_FILE, size=8)
        _FP_BOLD   = fm.FontProperties(fname=_THAI_FONT_FILE, size=10, weight="bold")
        plt.rcParams["font.family"] = ["Loma", "DejaVu Sans"]
    except Exception as e:
        logging.warning(f"[be_thesis_charts] Failed to load Thai font: {e}")
        _THAI_FONT_FILE = None
if not _THAI_FONT_FILE:
    logging.warning("[be_thesis_charts] Thai font NOT found — Thai glyphs may show as boxes")
    _FP        = fm.FontProperties(size=9)
    _FP_TITLE  = fm.FontProperties(size=11, weight="bold")
    _FP_LABEL  = fm.FontProperties(size=10)
    _FP_SMALL  = fm.FontProperties(size=8)
    _FP_BOLD   = fm.FontProperties(size=10, weight="bold")
plt.rcParams["axes.unicode_minus"] = False

# Brand-equity dashboard palette (matches frontend CSS)
INK       = "#0A0A0A"
INK_2     = "#3B3D43"
INK_3     = "#5C5F66"
PAPER     = "#F7F4EE"
RULE      = "#D8D4CC"
BE_RED    = "#C8102E"
BE_BLUE   = "#1B75BC"
BE_GOLD   = "#D4A017"
BE_GREEN  = "#10B981"
DIM_COLORS = {
    "awareness": BE_BLUE,
    "quality":   BE_GOLD,
    "identity":  BE_RED,
    "loyalty":   BE_GREEN,
}
COMP_PALETTE = ["#1B75BC", "#D4A017", "#5C5F66", "#10B981", "#7C3AED"]


def _save_fig(fig, *, dpi: int = 150) -> io.BytesIO:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor=PAPER, edgecolor="none")
    plt.close(fig)
    buf.seek(0)
    return buf


# ============================================================================
# 1) Top-of-Mind brand cloud
# ============================================================================
def render_tom_cloud(
    counts: List[Dict[str, Any]], target_brand: str, *,
    width: float = 9, height: float = 4.5,
) -> Optional[io.BytesIO]:
    """Word-cloud style figure where each brand label is sized by % share.
    Target brand is rendered in BE_RED, others in INK_3."""
    if not counts:
        return None
    counts_sorted = sorted(counts, key=lambda c: -float(c.get("pct") or 0))[:14]
    if not counts_sorted:
        return None

    target_low = (target_brand or "").lower().strip()
    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_xlim(0, 100); ax.set_ylim(0, 100)
    ax.axis("off")

    # Spiral-ish placement: 4 columns × N rows
    cols = 4
    pad_x = 100 / (cols + 1)
    rows = math.ceil(len(counts_sorted) / cols)
    pad_y = 100 / (rows + 1)
    for i, c in enumerate(counts_sorted):
        label = str(c.get("label") or "?")
        pct   = float(c.get("pct") or 0)
        col = i % cols
        row = i // cols
        x = pad_x * (col + 1) + (np.random.uniform(-3, 3) if cols > 1 else 0)
        y = 100 - pad_y * (row + 0.7) + (np.random.uniform(-2, 2))
        # Size scales 14..42 with sqrt of pct
        size = max(14, min(42, 14 + (pct ** 0.55) * 4.0))
        is_target = target_low and target_low in label.lower()
        if _THAI_FONT_FILE:
            fp = fm.FontProperties(fname=_THAI_FONT_FILE, size=size,
                                    weight="bold" if is_target else "normal")
        else:
            fp = fm.FontProperties(size=size,
                                    weight="bold" if is_target else "normal")
        ax.text(
            x, y, label,
            color=BE_RED if is_target else INK_3,
            ha="center", va="center",
            fontproperties=fp,
        )
        # small % tag below
        ax.text(
            x, y - size * 0.4, f"{round(pct, 1)}%",
            color=INK_3, ha="center", va="center",
            fontproperties=_FP_SMALL,
        )
    fig.tight_layout(pad=0.3)
    return _save_fig(fig)


# ============================================================================
# 2) Radar chart helper (single-brand or multi-brand)
# ============================================================================
def _radar(
    axes: List[str], series: List[Dict[str, Any]],
    *, width: float = 6.5, height: float = 6.5,
    title: Optional[str] = None,
) -> Optional[io.BytesIO]:
    """Generic radar.
    series: [{name, values:[...], color, kind:'brand'|'competitor', dash:bool}]
    """
    if not axes or len(axes) < 3 or not series:
        return None
    n = len(axes)
    angles = np.linspace(0, 2 * np.pi, n, endpoint=False).tolist()
    angles_loop = angles + angles[:1]

    fig, ax = plt.subplots(figsize=(width, height), subplot_kw=dict(polar=True))
    ax.set_facecolor(PAPER)
    ax.set_theta_offset(np.pi / 2)
    ax.set_theta_direction(-1)

    # axis labels — use explicit fontproperties to force Thai-capable font
    ax.set_xticks(angles)
    # Wrap long bilingual labels onto 2 lines so they don't crash into the polygon
    def _wrap(s: str, max_len: int = 18) -> str:
        if "(" in s and len(s) > max_len:
            # Split right before the "(" for "ENG (ไทย)" style
            i = s.rfind("(")
            return s[:i].strip() + "\n" + s[i:]
        return s
    wrapped = [_wrap(a.upper()) for a in axes]
    ax.set_xticklabels(wrapped, color=INK, fontproperties=_FP_LABEL)
    ax.set_ylim(0, 100)
    ax.set_yticks([20, 40, 60, 80])
    ax.set_yticklabels(["20", "40", "60", "80"], color=INK_3, fontproperties=_FP_SMALL)
    ax.tick_params(axis="x", pad=10)
    ax.grid(color=RULE, linewidth=0.7)
    ax.spines["polar"].set_color(RULE)

    for s in series:
        vals = [(v if v is not None else 0) for v in (s.get("values") or [])]
        if len(vals) != n:
            continue
        vals_loop = vals + vals[:1]
        ls = "--" if s.get("kind") == "competitor" or s.get("dash") else "-"
        color = s.get("color") or BE_RED
        alpha_fill = 0.06 if s.get("kind") == "competitor" else 0.18
        ax.plot(angles_loop, vals_loop, linewidth=2 if s.get("kind") == "brand" else 1.4,
                linestyle=ls, color=color, label=s.get("name", "?"))
        ax.fill(angles_loop, vals_loop, alpha=alpha_fill, color=color)

    if title:
        ax.set_title(title, color=INK, pad=20, fontproperties=_FP_TITLE)
    if len(series) > 1:
        leg = ax.legend(loc="lower center", bbox_to_anchor=(0.5, -0.15),
                        ncol=min(4, len(series)), frameon=False, prop=_FP_LABEL)
        for t in leg.get_texts():
            t.set_color(INK)
    return _save_fig(fig)


def render_quality_radar(
    attrs: List[Dict[str, Any]], *, brand_name: str = "Brand",
) -> Optional[io.BytesIO]:
    """attrs: [{axis_label, mean (1-7)}]"""
    if not attrs or len(attrs) < 3:
        return None
    axes = [a["axis_label"] for a in attrs]
    vals = [round((a.get("mean") or 0) / 7 * 100, 1) for a in attrs]
    return _radar(axes,
                  [{"name": brand_name, "kind": "brand",
                    "color": BE_GOLD, "values": vals}],
                  title="Quality attributes — radar (Likert 1-7 normalized to 0-100)")


def render_image_radar(
    axes: List[str], series: List[Dict[str, Any]],
) -> Optional[io.BytesIO]:
    """series: [{name, kind:'brand'|'competitor', values:[0..100]}]"""
    if not axes or not series:
        return None
    enriched = []
    for i, s in enumerate(series):
        color = BE_RED if s.get("kind") == "brand" else COMP_PALETTE[i % len(COMP_PALETTE)]
        enriched.append({**s, "color": color})
    return _radar(axes, enriched,
                  title="Multi-dimensional Image Radar — brand vs competitors")


# ============================================================================
# 3) 2D Perceptual map
# ============================================================================
def render_perceptual_map(
    *, x_axis_label: str, y_axis_label: str,
    dots: List[Dict[str, Any]],
    width: float = 7, height: float = 6,
) -> Optional[io.BytesIO]:
    """dots: [{name, rawX, rawY, kind:'brand'|'competitor'}]"""
    if not dots or len(dots) < 1:
        return None
    xs = [d.get("rawX", 0) for d in dots]
    ys = [d.get("rawY", 0) for d in dots]
    if not xs or not ys:
        return None
    pad = 0.18
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    x_range = max(5, x_max - x_min)
    y_range = max(5, y_max - y_min)
    xlo = max(0, x_min - x_range * pad)
    xhi = min(100, x_max + x_range * pad)
    ylo = max(0, y_min - y_range * pad)
    yhi = min(100, y_max + y_range * pad)

    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_facecolor(PAPER)
    ax.set_xlim(xlo, xhi); ax.set_ylim(ylo, yhi)

    # midline cross
    ax.axhline((ylo + yhi) / 2, color=RULE, linewidth=0.8, linestyle="--")
    ax.axvline((xlo + xhi) / 2, color=RULE, linewidth=0.8, linestyle="--")

    for d in dots:
        is_brand = d.get("kind") == "brand"
        color = BE_RED if is_brand else INK_3
        ax.scatter(d.get("rawX", 0), d.get("rawY", 0),
                   s=220 if is_brand else 130,
                   facecolors=color, edgecolors=color,
                   alpha=0.85 if is_brand else 0.65, zorder=3)
        ax.annotate(
            d.get("name", "?"),
            (d.get("rawX", 0), d.get("rawY", 0)),
            xytext=(8, 6), textcoords="offset points",
            color=INK,
            fontproperties=(_FP_BOLD if is_brand else _FP_LABEL),
        )
        # raw value label
        ax.annotate(
            f"({round(d.get('rawX', 0), 1)}, {round(d.get('rawY', 0), 1)})",
            (d.get("rawX", 0), d.get("rawY", 0)),
            xytext=(8, -10), textcoords="offset points",
            color=INK_3, fontproperties=_FP_SMALL,
        )

    ax.set_xlabel(f"X · {x_axis_label}", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_ylabel(f"Y · {y_axis_label}", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title(f"Perceptual Map · {x_axis_label} × {y_axis_label}",
                 color=INK, pad=12, fontproperties=_FP_TITLE)
    ax.tick_params(colors=INK_3, labelsize=8)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    return _save_fig(fig)


# ============================================================================
# 4) Identity vs Image map (intended LEFT vs perceived RIGHT)
# ============================================================================
def render_identity_image_map(
    *, intended_traits: List[str],
    image_col: List[Dict[str, Any]],   # [{trait, pct, kind:'aligned|lost|unintended'}]
    alignment_score: Optional[float] = None,
) -> Optional[io.BytesIO]:
    """Two-column visualization: intended vs perceived, with status colors."""
    if not intended_traits and not image_col:
        return None
    fig, ax = plt.subplots(figsize=(9.5, 5.5))
    ax.set_xlim(0, 10); ax.set_ylim(0, 10); ax.axis("off")

    # Headers
    ax.text(2.0, 9.6, "IDENTITY · ที่แบรนด์ตั้งใจ",
            color=INK, fontproperties=_FP_BOLD)
    ax.text(7.0, 9.6, "IMAGE · ที่ผู้บริโภครับรู้",
            color=INK, fontproperties=_FP_BOLD)
    ax.plot([5, 5], [0.3, 9.3], color=RULE, linewidth=0.8, linestyle="--")

    # LEFT — intended traits
    n_left = len(intended_traits) or 1
    spacing_l = min(1.0, 8.0 / n_left)
    _FP_TRAIT = (fm.FontProperties(fname=_THAI_FONT_FILE, size=11)
                 if _THAI_FONT_FILE else fm.FontProperties(size=11))
    for i, t in enumerate(intended_traits):
        y = 9.0 - (i + 1) * spacing_l
        ax.text(2.0, y, t, color=INK_2, ha="center", fontproperties=_FP_TRAIT)
        ax.add_patch(plt.Rectangle((0.5, y - 0.18), 3.0, 0.05,
                                   facecolor=BE_RED, edgecolor="none"))

    # RIGHT — perceived
    color_for = {"aligned": BE_GREEN, "lost": INK_3, "unintended": BE_GOLD}
    n_right = len(image_col) or 1
    spacing_r = min(1.0, 8.0 / n_right)
    _FP_TRAIT_BOLD = (fm.FontProperties(fname=_THAI_FONT_FILE, size=11, weight="bold")
                     if _THAI_FONT_FILE else fm.FontProperties(size=11, weight="bold"))
    for i, p in enumerate(image_col):
        y = 9.0 - (i + 1) * spacing_r
        c = color_for.get(p.get("kind", "lost"), INK_3)
        trait = str(p.get("trait", ""))
        pct = float(p.get("pct") or 0)
        ax.text(7.0, y, trait, color=c, ha="center",
                fontproperties=(_FP_TRAIT_BOLD if p.get("kind") == "aligned" else _FP_TRAIT))
        # bar showing pct
        ax.add_patch(plt.Rectangle((6.0, y - 0.2), 2.0 * (pct / 100), 0.05,
                                   facecolor=c, edgecolor="none"))
        ax.text(8.4, y, f"{int(round(pct))}%", color=INK_3, ha="left",
                fontproperties=_FP_SMALL)

    if alignment_score is not None:
        ax.text(5.0, 0.3,
                f"Alignment Score: {round(alignment_score, 1)} / 100",
                color=INK, ha="center", fontproperties=_FP_BOLD)

    # Legend
    legend_y = 0.85
    for i, (kind, label) in enumerate([
        ("aligned", "Aligned (ตรงตามที่ตั้งใจ)"),
        ("lost", "Lost (ตั้งใจแต่ลูกค้าไม่รับรู้)"),
        ("unintended", "Unintended (ลูกค้ารับรู้แต่ไม่ได้ตั้งใจ)"),
    ]):
        x = 0.5 + i * 3.3
        ax.add_patch(plt.Rectangle((x, legend_y - 0.05), 0.25, 0.1,
                                    facecolor=color_for[kind], edgecolor="none"))
        ax.text(x + 0.35, legend_y, label, color=INK_2, va="center",
                fontproperties=_FP_SMALL)

    return _save_fig(fig)


# ============================================================================
# 5) Aaker 4-Perspective composite bar chart
# ============================================================================
def render_perspective_bars(
    by_perspective: Dict[str, float],
) -> Optional[io.BytesIO]:
    if not by_perspective:
        return None
    order = ["as_organization", "as_person", "as_symbol", "as_product"]
    labels = {
        "as_organization": "As Organization\n(องค์กร)",
        "as_person":       "As Person\n(บุคลิก)",
        "as_symbol":       "As Symbol\n(สัญลักษณ์)",
        "as_product":      "As Product\n(ผลิตภัณฑ์)",
    }
    keys = [k for k in order if k in by_perspective]
    if not keys:
        return None
    vals = [round(float(by_perspective.get(k) or 0), 1) for k in keys]
    fig, ax = plt.subplots(figsize=(8, 4.2))
    ax.set_facecolor(PAPER)
    bars = ax.bar([labels[k] for k in keys], vals,
                  color=BE_RED, alpha=0.85, edgecolor=INK, linewidth=0.6)
    ax.set_ylim(0, 100)
    ax.set_ylabel("Score (0-100)", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title("Brand Association — Aaker 4 Perspectives",
                 color=INK, pad=10, fontproperties=_FP_TITLE)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 2, f"{v}",
                ha="center", color=INK, fontproperties=_FP_BOLD)
    # ticklabels (bar labels) — apply Thai font
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_LABEL)
    for lbl in ax.get_yticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8.5)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    return _save_fig(fig)


# ============================================================================
# 6) NPS distribution bar
# ============================================================================
def render_nps_bar(
    *, detractors_pct: float, passives_pct: float, promoters_pct: float,
    nps_score: Optional[float] = None,
) -> Optional[io.BytesIO]:
    fig, ax = plt.subplots(figsize=(8, 1.6))
    ax.set_facecolor(PAPER); ax.axis("off")
    ax.set_xlim(0, 100); ax.set_ylim(0, 1)
    ax.barh([0.5], [detractors_pct], left=0,
            color=BE_RED, height=0.6)
    ax.barh([0.5], [passives_pct], left=detractors_pct,
            color=INK_3, height=0.6)
    ax.barh([0.5], [promoters_pct], left=detractors_pct + passives_pct,
            color=BE_GREEN, height=0.6)
    ax.text(detractors_pct / 2, 0.5, f"Detractors\n{round(detractors_pct,1)}%",
            ha="center", va="center", color="white", fontproperties=_FP_BOLD)
    ax.text(detractors_pct + passives_pct / 2, 0.5,
            f"Passives\n{round(passives_pct,1)}%",
            ha="center", va="center", color="white", fontproperties=_FP_BOLD)
    ax.text(detractors_pct + passives_pct + promoters_pct / 2, 0.5,
            f"Promoters\n{round(promoters_pct,1)}%",
            ha="center", va="center", color="white", fontproperties=_FP_BOLD)
    title = "Net Promoter Score Breakdown"
    if nps_score is not None:
        title += f" — NPS = {round(nps_score, 1)}"
    ax.set_title(title, color=INK, pad=8, fontproperties=_FP_TITLE)
    return _save_fig(fig)


# ============================================================================
# 7) Likert distribution histogram
# ============================================================================
def render_likert_histogram(
    *, distribution: List[float], title: str,
    labels: Optional[List[str]] = None, color: str = BE_GOLD,
) -> Optional[io.BytesIO]:
    if not distribution:
        return None
    n_bins = len(distribution)
    if labels is None:
        labels = [str(i + 1) for i in range(n_bins)]
    peak_idx = distribution.index(max(distribution)) if distribution else -1
    fig, ax = plt.subplots(figsize=(7, 3))
    ax.set_facecolor(PAPER)
    bars = ax.bar(labels, distribution,
                  color=[color if i == peak_idx else "#CDCCC8" for i in range(n_bins)],
                  edgecolor=INK, linewidth=0.5)
    ax.set_ylabel("คน", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title(title, color=INK, pad=8, fontproperties=_FP_TITLE)
    for b, v in zip(bars, distribution):
        if v > 0:
            ax.text(b.get_x() + b.get_width() / 2, v + 0.3, str(int(v)),
                    ha="center", color=INK, fontproperties=_FP_SMALL)
    # tick labels (may contain Thai e.g. "ไม่รู้จัก", "เคยได้ยิน")
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    for lbl in ax.get_yticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    return _save_fig(fig)


# ============================================================================
# 8) Horizontal bar chart for AW recall/aided
# ============================================================================
def render_hbar_counts(
    *, rows: List[Dict[str, Any]], target_brand: str = "",
    title: str, color: str = BE_BLUE,
    width: float = 8, height: float = None,
) -> Optional[io.BytesIO]:
    """rows: [{label, pct, count?}]. Renders horizontal bars, target highlighted."""
    if not rows:
        return None
    rows = [r for r in rows if r.get("label")][:10]
    if not rows:
        return None
    labels = [str(r.get("label") or "?") for r in rows]
    vals = [float(r.get("pct") or r.get("value") or 0) for r in rows]
    target_low = (target_brand or "").lower().strip()

    h = height or max(2.4, 0.45 * len(rows) + 0.9)
    fig, ax = plt.subplots(figsize=(width, h))
    ax.set_facecolor(PAPER)
    y_pos = np.arange(len(labels))[::-1]  # reverse so #1 is on top
    bar_colors = [
        BE_RED if (target_low and target_low in lbl.lower()) else color
        for lbl in labels
    ]
    bars = ax.barh(y_pos, vals, color=bar_colors, edgecolor=INK, linewidth=0.4,
                   alpha=0.92)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color=INK, fontproperties=_FP_LABEL)
    ax.set_xlim(0, max(100, max(vals) * 1.15 if vals else 100))
    ax.set_xlabel("% ของผู้ตอบ", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title(title, color=INK, pad=10, fontproperties=_FP_TITLE)
    for b, v in zip(bars, vals):
        ax.text(v + 1.5, b.get_y() + b.get_height() / 2,
                f"{round(v, 1)}%", va="center", color=INK_2,
                fontproperties=_FP_SMALL)
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    ax.invert_yaxis()  # but we already reversed y_pos — invert again so #1 is top
    return _save_fig(fig)


# ============================================================================
# 9) One-word identity cloud (sized by frequency, target words highlighted)
# ============================================================================
def render_one_word_cloud(
    counts: List[Dict[str, Any]], aligned_traits: List[str], *,
    width: float = 9, height: float = 4.2,
) -> Optional[io.BytesIO]:
    """counts: [{label, pct, count?}], aligned_traits: list of intended traits
    (rendered green if matched)."""
    counts = [c for c in (counts or []) if c.get("label")][:14]
    if not counts:
        return None
    aligned_low = {str(t).lower().strip() for t in (aligned_traits or [])}
    fig, ax = plt.subplots(figsize=(width, height))
    ax.set_xlim(0, 100); ax.set_ylim(0, 100); ax.axis("off")
    cols = 4
    pad_x = 100 / (cols + 1)
    rows_n = math.ceil(len(counts) / cols)
    pad_y = 100 / (rows_n + 1)
    for i, c in enumerate(counts):
        label = str(c.get("label") or "")
        pct = float(c.get("pct") or 0)
        col = i % cols
        row = i // cols
        x = pad_x * (col + 1) + np.random.uniform(-3, 3)
        y = 100 - pad_y * (row + 0.7) + np.random.uniform(-2, 2)
        size = max(12, min(38, 12 + (pct ** 0.55) * 3.5))
        is_aligned = label.lower().strip() in aligned_low
        if _THAI_FONT_FILE:
            fp = fm.FontProperties(fname=_THAI_FONT_FILE, size=size,
                                    weight="bold" if is_aligned else "normal")
        else:
            fp = fm.FontProperties(size=size,
                                    weight="bold" if is_aligned else "normal")
        ax.text(x, y, label,
                color=BE_GREEN if is_aligned else INK_3,
                ha="center", va="center", fontproperties=fp)
        ax.text(x, y - size * 0.42, f"{round(pct, 1)}%",
                color=INK_3, ha="center", va="center",
                fontproperties=_FP_SMALL)
    fig.tight_layout(pad=0.3)
    return _save_fig(fig)


# ============================================================================
# 10) Loyalty: Repeat intent + Switching resistance (mean / 7 bars)
# ============================================================================
def render_loyalty_means(
    *, repeat_mean: Optional[float] = None,
    switching_mean: Optional[float] = None,
    repeat_n: Optional[int] = None,
    switching_n: Optional[int] = None,
) -> Optional[io.BytesIO]:
    items = []
    if repeat_mean is not None:
        items.append(("Repeat Intent\n(ตั้งใจกลับมาซื้อ)",
                       float(repeat_mean), BE_GREEN, repeat_n))
    if switching_mean is not None:
        items.append(("Switching Resistance\n(ต้านการเปลี่ยน)",
                       float(switching_mean), BE_GOLD, switching_n))
    if not items:
        return None
    fig, ax = plt.subplots(figsize=(7.5, 3))
    ax.set_facecolor(PAPER)
    labels = [it[0] for it in items]
    vals_pct = [round(it[1] / 7 * 100, 1) for it in items]
    colors = [it[2] for it in items]
    y_pos = np.arange(len(items))
    bars = ax.barh(y_pos, vals_pct, color=colors, edgecolor=INK, linewidth=0.4,
                   alpha=0.92, height=0.55)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color=INK, fontproperties=_FP_LABEL)
    ax.set_xlim(0, 100)
    ax.set_xlabel("Score (0-100, จาก Likert 1-7)", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title("Loyalty — Repeat Intent & Switching Resistance",
                 color=INK, pad=10, fontproperties=_FP_TITLE)
    for b, v, raw in zip(bars, vals_pct, items):
        suffix = f"  (mean={round(raw[1], 2)}/7"
        if raw[3]: suffix += f" · n={raw[3]}"
        suffix += ")"
        ax.text(v + 1.5, b.get_y() + b.get_height() / 2,
                f"{v}%{suffix}", va="center", color=INK_2,
                fontproperties=_FP_SMALL)
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    ax.invert_yaxis()
    return _save_fig(fig)


# ============================================================================
# 11) Open-end themes (loyalty / quality reasons) — horizontal bar with quotes
# ============================================================================
def render_open_end_themes(
    themes: List[Dict[str, Any]], *,
    title: str, color: str = BE_GREEN,
    max_themes: int = 6,
) -> Optional[io.BytesIO]:
    """themes: [{name, count, sample_quotes:[...]}]"""
    themes = [t for t in (themes or []) if t.get("name")][:max_themes]
    if not themes:
        return None
    labels = [str(t.get("name") or "?")[:48] for t in themes]
    counts = [int(t.get("count") or 0) for t in themes]
    max_c = max(counts) if counts else 1
    h = max(2.6, 0.55 * len(themes) + 1.0)
    fig, ax = plt.subplots(figsize=(8.2, h))
    ax.set_facecolor(PAPER)
    y_pos = np.arange(len(labels))
    bars = ax.barh(y_pos, counts, color=color, alpha=0.78,
                   edgecolor=INK, linewidth=0.4, height=0.55)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, color=INK, fontproperties=_FP_LABEL)
    ax.set_xlim(0, max_c * 1.25)
    ax.set_xlabel("จำนวนผู้ตอบที่กล่าวถึง (n)", color=INK_2, fontproperties=_FP_LABEL)
    ax.set_title(title, color=INK, pad=10, fontproperties=_FP_TITLE)
    for b, c in zip(bars, counts):
        ax.text(c + max_c * 0.02, b.get_y() + b.get_height() / 2,
                f"n={c}", va="center", color=INK_2, fontproperties=_FP_SMALL)
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    ax.invert_yaxis()
    return _save_fig(fig)


# ============================================================================
# 12) Brand Equity Score breakdown — overall + 4 dims composite ring/bars
# ============================================================================
def render_bes_breakdown(
    *, overall: Optional[float] = None,
    awareness: Optional[float] = None,
    quality: Optional[float] = None,
    identity: Optional[float] = None,
    loyalty: Optional[float] = None,
) -> Optional[io.BytesIO]:
    dims = [
        ("Awareness\n(การจดจำ)", awareness, BE_BLUE),
        ("Quality\n(คุณภาพ)",     quality,   BE_GOLD),
        ("Identity\n(อัตลักษณ์)",  identity,  BE_RED),
        ("Loyalty\n(ความภักดี)",   loyalty,   BE_GREEN),
    ]
    if not any(v is not None for _, v, _ in dims) and overall is None:
        return None
    labels = [d[0] for d in dims]
    vals = [round(float(d[1]) if d[1] is not None else 0, 1) for d in dims]
    colors = [d[2] for d in dims]
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.set_facecolor(PAPER)
    bars = ax.bar(labels, vals, color=colors, alpha=0.88,
                  edgecolor=INK, linewidth=0.5, width=0.62)
    ax.set_ylim(0, 100)
    ax.set_ylabel("Composite Score (0-100)", color=INK_2, fontproperties=_FP_LABEL)
    overall_str = f" · Brand Equity Score = {round(float(overall), 1)}/100" if overall is not None else ""
    ax.set_title(f"Brand Equity Score — 4-Dimension Composite{overall_str}",
                 color=INK, pad=10, fontproperties=_FP_TITLE)
    for b, v in zip(bars, vals):
        ax.text(b.get_x() + b.get_width() / 2, v + 2,
                f"{v}", ha="center", color=INK, fontproperties=_FP_BOLD)
    for lbl in ax.get_xticklabels():
        lbl.set_fontproperties(_FP_LABEL)
    for lbl in ax.get_yticklabels():
        lbl.set_fontproperties(_FP_SMALL)
    ax.tick_params(colors=INK_3, labelsize=8.5)
    for sp in ax.spines.values():
        sp.set_color(RULE)
    return _save_fig(fig)


# ============================================================================
# Convenience: build all charts from a study + aggregate
# ============================================================================
def collect_all_charts(
    study: Dict[str, Any], aggregate: Dict[str, Any],
) -> Dict[str, io.BytesIO]:
    """Build a dict of chart_key -> PNG BytesIO. Skips charts with insufficient data."""
    out: Dict[str, io.BytesIO] = {}
    questions = aggregate.get("questions") or []
    target = (study.get("brand") or {}).get("name", "")

    # 1. TOM cloud
    tom = next((q for q in questions if q.get("kind") == "unaided_top_of_mind"), None)
    if tom:
        counts = (tom.get("stats") or {}).get("counts") or []
        b = render_tom_cloud(counts, target)
        if b: out["tom_cloud"] = b

    # 2. Quality radar
    attrs = [q for q in questions
             if q.get("dimension") == "quality"
             and q.get("type") == "likert_7"
             and (q.get("kind") or "").startswith("attribute_")
             and q.get("stats", {}).get("mean") is not None]
    if len(attrs) >= 3:
        attrs_data = [{"axis_label": a.get("axis_label") or a["kind"].replace("attribute_", ""),
                       "mean": a["stats"]["mean"]} for a in attrs[:8]]
        b = render_quality_radar(attrs_data, brand_name=target)
        if b: out["quality_radar"] = b

    # 3. Multi-dim Image radar (from aggregate.image_radar)
    img_radar = aggregate.get("image_radar") or {}
    if (img_radar.get("axes") or []) and (img_radar.get("series") or []):
        axes = img_radar["axes"]
        series = []
        # Keep axes where every series has a value (intersection mode)
        keep_idx = [i for i in range(len(axes))
                    if all(s["values"][i] is not None for s in img_radar["series"])]
        if len(keep_idx) >= 3:
            axes_keep = [axes[i] for i in keep_idx]
            for s in img_radar["series"]:
                series.append({
                    "name": s.get("name", "?"),
                    "kind": s.get("kind", "brand"),
                    "values": [s["values"][i] for i in keep_idx],
                })
            b = render_image_radar(axes_keep, series)
            if b: out["image_radar"] = b

            # 4. 2D Perceptual map — pick top 2 axes by spread (most differentiated)
            if len(axes_keep) >= 2 and len(series) >= 2:
                # compute spread of each axis across series
                spreads = []
                for i in range(len(axes_keep)):
                    vals = [s["values"][i] for s in series]
                    spreads.append((max(vals) - min(vals), i, axes_keep[i]))
                spreads.sort(reverse=True)
                if len(spreads) >= 2:
                    xi, yi = spreads[0][1], spreads[1][1]
                    dots = []
                    for s in series:
                        dots.append({
                            "name": s["name"],
                            "rawX": s["values"][xi],
                            "rawY": s["values"][yi],
                            "kind": s["kind"],
                        })
                    b2 = render_perceptual_map(
                        x_axis_label=axes_keep[xi],
                        y_axis_label=axes_keep[yi],
                        dots=dots,
                    )
                    if b2: out["perceptual_map"] = b2

    # 5. Identity vs Image
    ai_cache = study.get("ai_cache") or {}
    ii = ai_cache.get("identity_image") or {}
    intended = (study.get("identity") or {}).get("traits") or []
    aligned = ii.get("aligned") or []
    unintended = ii.get("unintended") or []
    perceived = ii.get("perceived_traits") or []
    if intended or perceived:
        image_col = []
        for p in (perceived[:8] if isinstance(perceived, list) else []):
            if isinstance(p, dict):
                trait = p.get("trait") or p.get("label") or ""
                pct = float(p.get("count") or p.get("pct") or 0)
                if pct > 100: pct = min(100, pct)
            else:
                trait = str(p); pct = 50
            if not trait: continue
            kind = ("aligned" if trait in aligned
                    else "unintended" if trait in unintended
                    else "lost")
            image_col.append({"trait": trait, "pct": pct, "kind": kind})
        b = render_identity_image_map(
            intended_traits=intended,
            image_col=image_col,
            alignment_score=ii.get("alignment_score_0_100") or ii.get("alignment_score"),
        )
        if b: out["identity_image"] = b

    # 6. Aaker 4 perspectives
    persp = (aggregate.get("association") or {}).get("by_perspective") or {}
    if any(v > 0 for v in persp.values()):
        b = render_perspective_bars(persp)
        if b: out["perspective_bars"] = b

    # 7. NPS bar
    nps_q = next((q for q in questions if q.get("kind") == "nps"), None)
    if nps_q and (nps_q.get("stats") or {}).get("n", 0) > 0:
        s = nps_q["stats"]
        b = render_nps_bar(
            detractors_pct=float(s.get("detractors_pct") or 0),
            passives_pct=float(s.get("passives_pct") or 0),
            promoters_pct=float(s.get("promoters_pct") or 0),
            nps_score=s.get("score"),
        )
        if b: out["nps_bar"] = b

    # 8. Likert histograms (familiarity + overall quality)
    fam = next((q for q in questions if q.get("kind") == "brand_familiarity"), None)
    if fam:
        s = fam.get("stats") or {}
        if s.get("distribution"):
            b = render_likert_histogram(
                distribution=s["distribution"],
                title=f"Brand Familiarity (5-pt) · n={s.get('n', 0)} · mean={s.get('mean', 0)}",
                labels=["ไม่รู้จัก", "เคยได้ยิน", "พอรู้จัก", "รู้ดี", "รู้ดีมาก"],
                color=BE_BLUE,
            )
            if b: out["familiarity_hist"] = b

    overall_q = next((q for q in questions if q.get("kind") == "overall_quality"), None)
    if overall_q:
        s = overall_q.get("stats") or {}
        if s.get("distribution"):
            b = render_likert_histogram(
                distribution=s["distribution"],
                title=f"Overall Quality (7-pt) · n={s.get('n', 0)} · mean={s.get('mean', 0)} · SD={s.get('std', 0)}",
                color=BE_GOLD,
            )
            if b: out["overall_quality_hist"] = b

    # 9. Unaided recall bars (top 8 brands respondents named spontaneously)
    recall_q = next((q for q in questions if q.get("kind") == "unaided_recall"), None)
    if recall_q:
        counts = (recall_q.get("stats") or {}).get("counts") or []
        b = render_hbar_counts(
            rows=counts, target_brand=target,
            title="Unaided Recall — แบรนด์อื่นที่นึกถึงเอง (Top 10)",
            color=BE_BLUE,
        )
        if b: out["unaided_recall_bars"] = b

    # 10. Aided recognition bars (which brands respondents recognized when shown)
    aided_q = next((q for q in questions if q.get("kind") == "aided_recognition"), None)
    if aided_q:
        counts = (aided_q.get("stats") or {}).get("counts") or []
        b = render_hbar_counts(
            rows=counts, target_brand=target,
            title="Aided Recognition — แบรนด์ที่ผู้ตอบรู้จักเมื่อถูกแสดงรายชื่อ",
            color=BE_BLUE,
        )
        if b: out["aided_recognition_bars"] = b

    # 11. One-word identity cloud (BI-3 image_one_word) — aligned words rendered green
    oneword_q = next((q for q in questions if q.get("kind") == "image_one_word"), None)
    if oneword_q:
        counts = (oneword_q.get("stats") or {}).get("counts") or []
        aligned_traits = (ii.get("aligned") or []) + (intended or [])
        b = render_one_word_cloud(counts, aligned_traits)
        if b: out["one_word_cloud"] = b

    # 12. Loyalty bars (repeat intent + switching resistance)
    repeat_q = next((q for q in questions if q.get("kind") == "repeat_intent"), None)
    switch_q = next((q for q in questions if q.get("kind") == "switching_resistance"), None)
    if repeat_q or switch_q:
        b = render_loyalty_means(
            repeat_mean=(repeat_q or {}).get("stats", {}).get("mean"),
            switching_mean=(switch_q or {}).get("stats", {}).get("mean"),
            repeat_n=(repeat_q or {}).get("stats", {}).get("n"),
            switching_n=(switch_q or {}).get("stats", {}).get("n"),
        )
        if b: out["loyalty_means"] = b

    # 13. Loyalty themes (Why customers stay — open-end clustered by AI)
    themes_map = (ai_cache.get("themes_by_question") or {})
    _OPEN_TYPES = {"open_text", "open_long", "text", "textarea", "open"}
    # find loyalty open-end question id
    loy_open = next((q for q in questions
                     if q.get("dimension") == "loyalty"
                     and (q.get("type") in _OPEN_TYPES
                          or q.get("kind") in ("reason_to_stay", "loyalty_reasons"))),
                    None)
    if loy_open:
        themes = themes_map.get(loy_open.get("id")) or []
        b = render_open_end_themes(
            themes,
            title="Why Customers Stay — เหตุผลที่ลูกค้าอยู่กับแบรนด์ (Themes)",
            color=BE_GREEN,
        )
        if b: out["loyalty_themes"] = b

    # 14. Quality reasons themes (Voice of respondent — open-end clustered by AI)
    qual_open = next((q for q in questions
                      if q.get("dimension") == "quality"
                      and (q.get("type") in _OPEN_TYPES
                           or q.get("kind") in ("quality_reasons", "quality_voice"))),
                     None)
    if qual_open:
        themes = themes_map.get(qual_open.get("id")) or []
        b = render_open_end_themes(
            themes,
            title="Voice of Respondent — เหตุผลด้านคุณภาพ (Themes)",
            color=BE_GOLD,
        )
        if b: out["quality_reason_themes"] = b

    # 15. Brand Equity Score breakdown (overall + 4 dims composite)
    comp = aggregate.get("composite") or {}
    if comp:
        b = render_bes_breakdown(
            overall=comp.get("overall"),
            awareness=comp.get("awareness"),
            quality=comp.get("quality"),
            identity=comp.get("identity"),
            loyalty=comp.get("loyalty"),
        )
        if b: out["bes_breakdown"] = b

    return out
