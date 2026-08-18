"""
Filter/segment helpers shared by analysis modules.

Import-only copy of the four helpers proven in `routes/brand_equity.py`
(_parse_segments_param L443, _apply_response_filter L497, _segments_available
L524, _filter_signature L537, _json_safe L1594). The shipping modules are NOT
migrated onto this file — that is a separate refactor with its own regression
surface.
"""

import json
import math
import hashlib
from typing import Any, Dict, List, Optional


def parse_segments_param(segments: Optional[str]) -> Dict[str, List[str]]:
    if not segments:
        return {}
    try:
        raw = json.loads(segments)
        if not isinstance(raw, dict):
            return {}
        return {
            str(k): [str(v) for v in (vs or []) if v not in (None, "")]
            for k, vs in raw.items() if vs
        }
    except (json.JSONDecodeError, TypeError, ValueError):
        return {}


def apply_response_filter(responses: List[dict],
                          from_iso: Optional[str] = None,
                          to_iso: Optional[str] = None,
                          segments: Optional[Dict[str, List[str]]] = None) -> List[dict]:
    out = responses
    if from_iso:
        out = [r for r in out if (r.get("submitted_at") or "") >= from_iso]
    if to_iso:
        out = [r for r in out if (r.get("submitted_at") or "") <= to_iso]
    if segments:
        for field, allowed in segments.items():
            if not allowed:
                continue
            allowed_set = set(allowed)
            out = [r for r in out
                   if str((r.get("demographics") or {}).get(field, "")) in allowed_set]
    return out


def segments_available(responses: List[dict], capture: List[str]) -> Dict[str, List[str]]:
    out: Dict[str, set] = {k: set() for k in (capture or [])}
    for r in responses:
        demo = r.get("demographics") or {}
        for k in out.keys():
            v = demo.get(k)
            if v not in (None, ""):
                out[k].add(str(v))
    return {k: sorted(list(vs)) for k, vs in out.items()}


def filter_signature(from_iso: Optional[str], to_iso: Optional[str],
                     segments: Optional[Dict[str, List[str]]]) -> str:
    seg_norm = {k: sorted(set(str(x) for x in (v or [])))
                for k, v in (segments or {}).items() if v}
    if not from_iso and not to_iso and not seg_norm:
        return "all"
    payload = json.dumps({"from": from_iso or "", "to": to_iso or "", "seg": seg_norm},
                         sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()[:12]


def json_safe(obj: Any) -> Any:
    """NaN/inf are not JSON — they surface as a 500 rather than a bad number."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_safe(v) for v in obj]
    return obj
