"""
Alumni "สายเทค" kinship vocabulary engine (pure — no DB, no I/O).
==================================================================

SWU calls the senior/junior code line **สายเทค**.  A relation between two people
in a line is described by the *signed distance* between them (positive = the
other person is above me / senior, negative = below me / junior) and, for some
rungs, the other person's gender.

The ladder below is the owner-approved DEFAULT (memory/PLAN_2026_11_EXTERNAL_LLM.md,
"ADDENDUM — Alumni").  It is stored in Mongo (`alumni_settings` doc
`{id: "kinship"}`) as an *override* on top of these defaults, so the owner can
change any term without a deploy, and a line can carry its own override
(e.g. ตา/ยาย instead of ปู่/ย่า).

Important corrections vs. the 2026-04 spec:
  * distance 2 upward is ลุงเทค / ป้าเทค (the old labels skipped it);
  * one step is one *link*, not "3 years" — the link, not the cohort year,
    defines the relation.

Settings shape (all keys are strings so the document is valid BSON):

    {
      "up":   {"1": {"m": "...", "f": "...", "u": "..."}, ...},
      "down": {"1": {...}, ...},
      "variants": {"maternal": {"up": {"3": {...}}}},
      "variant": "default" | "<variant key>",
      "fallback_up":   "ทวดเทค รุ่นที่ {n}",
      "fallback_down": "น้องเทค รุ่นที่ {n}",
      "self": "คุณ",
      "unverified": ["up.5"],
      "line_name": "สายเทค"
    }

Gender keys: "m" (male form), "f" (female form), "u" (unknown — combined form).
"""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, Iterable, List, Optional

GENDERS = ("m", "f", "u")
MAX_DISTANCE = 12          # deepest rung that may be given an explicit term
MAX_TERM_LEN = 40
MAX_VARIANTS = 6


def _same(term: str) -> Dict[str, str]:
    return {"m": term, "f": term, "u": term}


DEFAULT_SETTINGS: Dict[str, Any] = {
    "up": {
        "1": _same("พี่เทค"),
        "2": {"m": "ลุงเทค", "f": "ป้าเทค", "u": "ลุง/ป้าเทค"},
        "3": {"m": "ปู่เทค", "f": "ย่าเทค", "u": "ปู่/ย่าเทค"},
        "4": _same("ทวดเทค"),
        "5": _same("เทียดเทค"),
    },
    "down": {
        "1": _same("น้องเทค"),
        "2": _same("หลานเทค"),
        "3": _same("เหลนเทค"),
        "4": _same("โหลนเทค"),
    },
    "variants": {
        # Some lines say ตา/ยาย for the 3rd rung up.
        "maternal": {"up": {"3": {"m": "ตาเทค", "f": "ยายเทค", "u": "ตา/ยายเทค"}}},
    },
    "variant": "default",
    "fallback_up": "ทวดเทค รุ่นที่ {n}",
    "fallback_down": "น้องเทค รุ่นที่ {n}",
    "self": "คุณ",
    # Rungs whose SWU usage is not verified — the UI may show a small "?".
    "unverified": ["up.5"],
    "line_name": "สายเทค",
}


# ---------------------------------------------------------------- helpers

_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def normalize_gender(value: Any) -> str:
    """Map anything gender-ish to 'm' | 'f' | 'u'. Unknown / non-binary → 'u'
    (the combined form, e.g. "ลุง/ป้าเทค") so nobody is mis-gendered."""
    if value is None:
        return "u"
    v = str(value).strip().lower()
    if v in ("m", "male", "man", "ชาย", "ผู้ชาย", "ช"):
        return "m"
    if v in ("f", "female", "woman", "หญิง", "ผู้หญิง", "ญ"):
        return "f"
    return "u"


def _clean_term(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field}: ต้องเป็นข้อความ")
    v = _CTRL.sub("", value).strip()
    if not v:
        raise ValueError(f"{field}: ห้ามว่าง")
    if len(v) > MAX_TERM_LEN:
        raise ValueError(f"{field}: ยาวเกิน {MAX_TERM_LEN} ตัวอักษร")
    return v


def _clean_template(value: Any, field: str) -> str:
    v = _clean_term(value, field)
    if "{n}" not in v:
        raise ValueError(f"{field}: ต้องมี {{n}} (ตำแหน่งตัวเลขรุ่น)")
    # Only {n} is allowed as a placeholder (no attribute access / format abuse).
    stripped = v.replace("{n}", "")
    if "{" in stripped or "}" in stripped:
        raise ValueError(f"{field}: ใช้ได้เฉพาะ {{n}}")
    return v


def _clean_rungs(value: Any, field: str) -> Dict[str, Dict[str, str]]:
    if not isinstance(value, dict):
        raise ValueError(f"{field}: ต้องเป็น object")
    out: Dict[str, Dict[str, str]] = {}
    for k, forms in value.items():
        try:
            d = int(str(k))
        except ValueError:
            raise ValueError(f"{field}.{k}: ระยะต้องเป็นตัวเลข")
        if d < 1 or d > MAX_DISTANCE:
            raise ValueError(f"{field}.{k}: ระยะต้องอยู่ระหว่าง 1–{MAX_DISTANCE}")
        if forms is None:
            out[str(d)] = None  # explicit removal → falls back to template
            continue
        if isinstance(forms, str):
            t = _clean_term(forms, f"{field}.{d}")
            out[str(d)] = _same(t)
            continue
        if not isinstance(forms, dict):
            raise ValueError(f"{field}.{d}: ต้องเป็นข้อความหรือ {{m,f,u}}")
        clean: Dict[str, str] = {}
        for g, t in forms.items():
            if g not in GENDERS:
                raise ValueError(f"{field}.{d}.{g}: ใช้ได้เฉพาะ m / f / u")
            clean[g] = _clean_term(t, f"{field}.{d}.{g}")
        out[str(d)] = clean
    return out


def validate_settings(payload: Any) -> Dict[str, Any]:
    """Validate a (partial) settings override. Returns a cleaned dict with only
    the keys that were supplied. Raises ValueError with a Thai message."""
    if not isinstance(payload, dict):
        raise ValueError("รูปแบบไม่ถูกต้อง")
    allowed = {"up", "down", "variants", "variant", "fallback_up", "fallback_down",
               "self", "unverified", "line_name"}
    unknown = set(payload) - allowed
    if unknown:
        raise ValueError(f"ไม่รู้จักฟิลด์: {', '.join(sorted(unknown))}")
    out: Dict[str, Any] = {}
    if "up" in payload:
        out["up"] = _clean_rungs(payload["up"], "up")
    if "down" in payload:
        out["down"] = _clean_rungs(payload["down"], "down")
    if "variants" in payload:
        vs = payload["variants"]
        if not isinstance(vs, dict) or len(vs) > MAX_VARIANTS:
            raise ValueError(f"variants: ต้องเป็น object ไม่เกิน {MAX_VARIANTS} แบบ")
        cv: Dict[str, Any] = {}
        for name, body in vs.items():
            if not re.fullmatch(r"[a-z0-9_]{1,24}", str(name)) or name == "default":
                raise ValueError(f"variants.{name}: ชื่อใช้ a-z 0-9 _ (ห้าม 'default')")
            if not isinstance(body, dict) or set(body) - {"up", "down"}:
                raise ValueError(f"variants.{name}: มีได้เฉพาะ up / down")
            cv[name] = {k: _clean_rungs(v, f"variants.{name}.{k}") for k, v in body.items()}
        out["variants"] = cv
    if "variant" in payload:
        v = payload["variant"]
        if not isinstance(v, str) or not re.fullmatch(r"[a-z0-9_]{1,24}", v):
            raise ValueError("variant: ชื่อไม่ถูกต้อง")
        out["variant"] = v
    for key in ("fallback_up", "fallback_down"):
        if key in payload:
            out[key] = _clean_template(payload[key], key)
    for key in ("self", "line_name"):
        if key in payload:
            out[key] = _clean_term(payload[key], key)
    if "unverified" in payload:
        uv = payload["unverified"]
        if not isinstance(uv, list) or not all(
            isinstance(x, str) and re.fullmatch(r"(up|down)\.\d{1,2}", x) for x in uv
        ):
            raise ValueError("unverified: ต้องเป็นรายการเช่น [\"up.5\"]")
        out["unverified"] = uv
    return out


def merge_settings(base: Optional[Dict[str, Any]], *overrides: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Deep-merge overrides (later wins) on top of `base` (default: DEFAULT_SETTINGS).

    Rung dictionaries merge per distance and per gender form, so an override
    `{"up": {"2": {"f": "น้าเทค"}}}` changes only the female form of rung 2.
    A rung set to None is removed (the fallback template then applies)."""
    out = copy.deepcopy(base if base is not None else DEFAULT_SETTINGS)
    for ov in overrides:
        if not ov:
            continue
        for key, val in ov.items():
            if key in ("up", "down"):
                rungs = out.setdefault(key, {})
                for d, forms in (val or {}).items():
                    if forms is None:
                        rungs.pop(str(d), None)
                    else:
                        merged = dict(rungs.get(str(d)) or {})
                        merged.update(_same(forms) if isinstance(forms, str) else forms)
                        rungs[str(d)] = merged
            elif key == "variants":
                vs = out.setdefault("variants", {})
                for name, body in (val or {}).items():
                    cur = vs.setdefault(name, {})
                    for side, rungs in body.items():
                        side_d = cur.setdefault(side, {})
                        for d, forms in rungs.items():
                            if forms is None:
                                side_d.pop(str(d), None)
                            else:
                                m = dict(side_d.get(str(d)) or {})
                                m.update(_same(forms) if isinstance(forms, str) else forms)
                                side_d[str(d)] = m
            else:
                out[key] = copy.deepcopy(val)
    return out


def _pick_form(forms: Dict[str, str], gender: str) -> Optional[str]:
    if not forms:
        return None
    if gender in forms and forms[gender]:
        return forms[gender]
    if gender != "u" and forms.get("u"):
        return forms["u"]
    # Unknown gender but only gendered forms given → combine them.
    m, f = forms.get("m"), forms.get("f")
    if m and f:
        if m == f:
            return m
        # "ลุงเทค" + "ป้าเทค" → "ลุง/ป้าเทค" when they share a suffix
        suffix = _common_suffix(m, f)
        if suffix and len(suffix) < min(len(m), len(f)):
            return f"{m[:-len(suffix)]}/{f[:-len(suffix)]}{suffix}"
        return f"{m}/{f}"
    return m or f


def _common_suffix(a: str, b: str) -> str:
    i = 0
    while i < min(len(a), len(b)) and a[-1 - i] == b[-1 - i]:
        i += 1
    return a[len(a) - i:] if i else ""


def _rung(settings: Dict[str, Any], side: str, dist: int, variant: Optional[str]) -> Optional[Dict[str, str]]:
    v = variant if variant is not None else settings.get("variant") or "default"
    if v and v != "default":
        vr = (((settings.get("variants") or {}).get(v) or {}).get(side) or {}).get(str(dist))
        if vr:
            base = dict((settings.get(side) or {}).get(str(dist)) or {})
            base.update(vr)
            return base
    return (settings.get(side) or {}).get(str(dist))


def describe(distance: int, gender: Any = None, settings: Optional[Dict[str, Any]] = None,
             variant: Optional[str] = None) -> Dict[str, Any]:
    """Full description of a relation.

    distance > 0 → the other person is `distance` links ABOVE me (senior);
    distance < 0 → BELOW me (junior); 0 → myself.
    """
    s = settings if settings is not None else DEFAULT_SETTINGS
    g = normalize_gender(gender)
    try:
        distance = int(distance)
    except (TypeError, ValueError):
        raise ValueError("distance ต้องเป็นจำนวนเต็ม")
    if distance == 0:
        return {"term": s.get("self") or "คุณ", "distance": 0, "direction": "self",
                "gender_used": g, "is_fallback": False, "unverified": False}
    side = "up" if distance > 0 else "down"
    n = abs(distance)
    forms = _rung(s, side, n, variant)
    term = _pick_form(forms, g) if forms else None
    is_fallback = term is None
    if is_fallback:
        tpl = s.get(f"fallback_{side}") or DEFAULT_SETTINGS[f"fallback_{side}"]
        term = tpl.replace("{n}", str(n))
    return {
        "term": term,
        "distance": distance,
        "direction": side,
        "gender_used": g,
        "is_fallback": is_fallback,
        "unverified": f"{side}.{n}" in (s.get("unverified") or []),
    }


def term_for(distance: int, gender: Any = None, settings: Optional[Dict[str, Any]] = None,
             variant: Optional[str] = None) -> str:
    """The kinship term for the other person, seen from me."""
    return describe(distance, gender, settings, variant)["term"]


def ladder(settings: Optional[Dict[str, Any]] = None, up: int = 6, down: int = 5,
           variant: Optional[str] = None) -> List[Dict[str, Any]]:
    """Legend for the UI: one row per rung with all three gender forms."""
    s = settings if settings is not None else DEFAULT_SETTINGS
    rows: List[Dict[str, Any]] = []
    for d in list(range(up, 0, -1)) + [0] + [-k for k in range(1, down + 1)]:
        rows.append({
            "distance": d,
            "m": term_for(d, "m", s, variant),
            "f": term_for(d, "f", s, variant),
            "u": term_for(d, "u", s, variant),
            "is_fallback": describe(d, "u", s, variant)["is_fallback"],
            "unverified": describe(d, "u", s, variant)["unverified"],
        })
    return rows


def nearest_override(path_ids: Iterable[str], overrides_by_anchor: Dict[str, Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Per-line overrides are anchored at a member and apply to that member and
    everyone below them.  Given the viewer's upward path [self, parent, grand…],
    return the override of the nearest anchor (or None)."""
    for nid in path_ids:
        ov = overrides_by_anchor.get(nid)
        if ov:
            return ov
    return None
