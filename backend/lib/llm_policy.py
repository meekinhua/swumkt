"""System-LLM policy — the admin switch (plan §A, memory/LLM_EXTERNAL_CONTRACT.md).

Single source of truth for "may this call be billed to the platform's LLM key?".

Stored in Mongo ``platform_settings`` doc ``{id: "llm"}``::

    {"id": "llm", "system_llm_enabled": false,
     "features": {"<group-or-feature-key>": true|false},
     "admin_bypass": false, "external_hint": "...",
     "updated_at": "...", "updated_by": "..."}

Effective(feature) = features[feature] ?? features[group(feature)] ?? system_llm_enabled
(admin_bypass + ADMIN caller -> allowed). Default when the doc is missing: OFF,
unless env ``SYSTEM_LLM_DEFAULT=on``.

Public interface (fixed; other modules code against it)::

    from lib import llm_policy
    llm_policy.init(db)
    await llm_policy.require_system_llm("conjoint.interpretation", user)  # HTTPException 409
    await llm_policy.is_system_llm_allowed("be.thesis", user) -> bool
    llm_policy.SystemLLMDisabled          # raised by the central guard

The module imports cleanly without a db: until ``init`` is called every read
returns the default policy (OFF unless the env says otherwise).
"""
from __future__ import annotations

import contextvars
import logging
import os
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional, Tuple

from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
GROUPS: Dict[str, str] = {
    "research": "งานวิจัย (Conjoint / Brand Equity / Customer Value / Journey)",
    "thesis": "ส่งออกวิทยานิพนธ์",
    "images": "สร้างภาพด้วย AI",
    "content": "เนื้อหา / CMS / แบบสอบถาม / แปลภาษา",
    "documents": "จัดรูปแบบเอกสาร / อ้างอิง",
}

# feature key -> group
FEATURES: Dict[str, str] = {
    # research
    "conjoint.interpretation": "research",
    "conjoint.qualitative": "research",
    "be.ai_analyze": "research",
    "be.questions": "research",
    "cv.ai": "research",
    "journey.ai": "research",
    "behavior.ai": "research",
    "perception.ai": "research",
    # thesis
    "conjoint.thesis": "thesis",
    "be.thesis": "thesis",
    # images
    "conjoint.images": "images",
    "be.visual_identity": "images",
    "cv.image": "images",
    "cms.image": "images",
    "content.image": "images",
    "behavior.image": "images",
    "perception.image": "images",
    # content
    "cms.ai": "content",
    "survey.ai": "content",
    "content.ai": "content",
    "translate": "content",
    # documents
    "docs.format": "documents",
    "docs.citation": "documents",
    "docs.ref_extract": "documents",
    "docs.journal_finder": "documents",
}

FEATURE_LABELS_TH: Dict[str, str] = {
    "conjoint.interpretation": "Conjoint — ตีความผลด้วย AI",
    "conjoint.qualitative": "Conjoint — วิเคราะห์คำตอบปลายเปิด",
    "be.ai_analyze": "Brand Equity — วิเคราะห์ด้วย AI",
    "be.questions": "Brand Equity — สร้างคำถามด้วย AI",
    "cv.ai": "Customer Value — AI",
    "journey.ai": "Customer Journey — AI",
    "behavior.ai": "วิเคราะห์พฤติกรรมผู้บริโภค — AI",
    "perception.ai": "Perception Map — AI",
    "behavior.image": "วิเคราะห์พฤติกรรม — สร้างภาพ",
    "perception.image": "Perception Map — สร้างภาพประกอบ",
    "docs.journal_finder": "ค้นหาวารสาร (Journal Finder)",
    "conjoint.thesis": "Conjoint — ส่งออกวิทยานิพนธ์ (AI เขียนบท)",
    "be.thesis": "Brand Equity — ส่งออกวิทยานิพนธ์ (AI เขียนบท)",
    "conjoint.images": "Conjoint — สร้างภาพโปรไฟล์",
    "be.visual_identity": "Brand Equity — สร้างภาพอัตลักษณ์แบรนด์",
    "cv.image": "Customer Value — สร้างภาพ",
    "cms.image": "CMS — สร้างภาพ",
    "content.image": "คลังเนื้อหา — สร้างภาพ",
    "cms.ai": "CMS — ผู้ช่วยเขียน",
    "survey.ai": "แบบสอบถาม — ผู้ช่วย AI",
    "content.ai": "คลังเนื้อหา — ผู้ช่วย AI",
    "translate": "แปลภาษา",
    "docs.format": "จัดรูปแบบเอกสาร",
    "docs.citation": "แปลง/จัดรูปแบบการอ้างอิง",
    "docs.ref_extract": "ดึงรายการอ้างอิง",
}

ALL_KEYS = frozenset(FEATURES) | frozenset(GROUPS)

COLLECTION = "platform_settings"
DOC_ID = "llm"
CACHE_TTL_SECONDS = 15.0

MESSAGE_TH = (
    "ผู้ดูแลระบบปิดการใช้ AI ของระบบสำหรับฟังก์ชันนี้ — "
    "กรุณาใช้ AI ของคุณเอง (ChatGPT / Claude / Gemini ฯลฯ): "
    "คัดลอกพรอมต์ไปใช้ แล้ววางผลลัพธ์กลับเข้ามา"
)


def group_of(feature: Optional[str]) -> Optional[str]:
    if not feature:
        return None
    if feature in GROUPS:
        return feature
    return FEATURES.get(feature)


def registry() -> Dict[str, Any]:
    """Registry as returned by GET /api/platform/llm-policy."""
    return {
        "groups": [{"key": g, "label": lbl,
                    "features": [k for k, gg in FEATURES.items() if gg == g]}
                   for g, lbl in GROUPS.items()],
        "features": [{"key": k, "group": g, "label": FEATURE_LABELS_TH.get(k, k)}
                     for k, g in FEATURES.items()],
    }


# ---------------------------------------------------------------------------
# Exceptions / error body
# ---------------------------------------------------------------------------
def error_detail(feature: Optional[str], hint: Optional[str] = None) -> Dict[str, Any]:
    return {"code": "llm_external_only", "feature": feature or "",
            "message": MESSAGE_TH, "hint": hint or ""}


class SystemLLMDisabled(Exception):
    """Raised by the central guard when a billed LLM call is not allowed."""

    def __init__(self, feature: Optional[str] = None, hint: Optional[str] = None):
        self.feature = feature
        self.hint = hint or ""
        super().__init__(f"system LLM disabled for feature={feature!r}")

    @property
    def detail(self) -> Dict[str, Any]:
        return error_detail(self.feature, self.hint)


# ---------------------------------------------------------------------------
# State: db handle + cache
# ---------------------------------------------------------------------------
_db = None
_cache: Optional[Tuple[float, Dict[str, Any]]] = None


def init(db) -> None:
    """Called once by server.py. Safe to call again (e.g. tests)."""
    global _db
    _db = db
    invalidate_cache()


def invalidate_cache() -> None:
    global _cache
    _cache = None


def default_enabled() -> bool:
    return (os.environ.get("SYSTEM_LLM_DEFAULT") or "").strip().lower() in ("on", "1", "true", "yes")


def _normalize(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    doc = dict(doc or {})
    feats = doc.get("features") or {}
    clean = {k: bool(v) for k, v in feats.items()
             if k in ALL_KEYS and isinstance(v, bool)}
    se = doc.get("system_llm_enabled")
    return {
        "id": DOC_ID,
        "system_llm_enabled": default_enabled() if se is None else bool(se),
        "features": clean,
        "admin_bypass": bool(doc.get("admin_bypass", False)),
        "external_hint": doc.get("external_hint") or "",
        "updated_at": doc.get("updated_at"),
        "updated_by": doc.get("updated_by"),
        "stored": bool(doc),
    }


async def get_policy(force: bool = False) -> Dict[str, Any]:
    """Normalized stored policy (cached <= CACHE_TTL_SECONDS)."""
    global _cache
    now = time.monotonic()
    if not force and _cache is not None and now - _cache[0] < CACHE_TTL_SECONDS:
        return _cache[1]
    raw = None
    if _db is not None:
        try:
            raw = await _db[COLLECTION].find_one({"id": DOC_ID}, {"_id": 0})
        except Exception as e:  # db down -> fail closed to the default
            logger.error("[llm_policy] could not read policy: %s", e)
            raw = None
    pol = _normalize(raw)
    _cache = (now, pol)
    return pol


def _bool_or_none(v):
    return v if isinstance(v, bool) else None


def validate_update(patch: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a partial update. Raises ValueError with a message on bad input.

    Accepted keys: system_llm_enabled (bool), admin_bypass (bool),
    external_hint (str|None, <= 2000 chars), features ({key: bool|None});
    a ``None`` feature value removes the override.
    """
    if not isinstance(patch, dict):
        raise ValueError("body must be an object")
    allowed = {"system_llm_enabled", "admin_bypass", "external_hint", "features"}
    unknown = set(patch) - allowed
    if unknown:
        raise ValueError(f"unknown field(s): {sorted(unknown)}")
    out: Dict[str, Any] = {}
    for k in ("system_llm_enabled", "admin_bypass"):
        if k in patch:
            if not isinstance(patch[k], bool):
                raise ValueError(f"{k} must be true/false")
            out[k] = patch[k]
    if "external_hint" in patch:
        h = patch["external_hint"]
        if h is not None and not isinstance(h, str):
            raise ValueError("external_hint must be a string")
        h = (h or "").strip()
        if len(h) > 2000:
            raise ValueError("external_hint too long (max 2000)")
        out["external_hint"] = h
    if "features" in patch:
        f = patch["features"]
        if not isinstance(f, dict):
            raise ValueError("features must be an object")
        bad = [k for k in f if k not in ALL_KEYS]
        if bad:
            raise ValueError(f"unknown feature key(s): {sorted(bad)}")
        for k, v in f.items():
            if v is not None and not isinstance(v, bool):
                raise ValueError(f"features.{k} must be true, false or null")
        out["features"] = dict(f)
    return out


async def update_policy(patch: Dict[str, Any], updated_by: Optional[str] = None) -> Dict[str, Any]:
    """Apply a validated partial update; invalidates the cache. Returns new policy."""
    clean = validate_update(patch)
    if _db is None:
        raise RuntimeError("llm_policy.init(db) was not called")
    current = await _db[COLLECTION].find_one({"id": DOC_ID}, {"_id": 0}) or {}
    feats = dict(current.get("features") or {})
    for k, v in (clean.pop("features", None) or {}).items():
        if v is None:
            feats.pop(k, None)
        else:
            feats[k] = v
    new_doc = {k: v for k, v in current.items()}
    new_doc.update(clean)
    new_doc["id"] = DOC_ID
    new_doc["features"] = feats
    if "system_llm_enabled" not in new_doc:
        # Freeze the current effective default into the doc so it is explicit.
        new_doc["system_llm_enabled"] = default_enabled()
    new_doc.setdefault("admin_bypass", False)
    new_doc.setdefault("external_hint", "")
    new_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    new_doc["updated_by"] = updated_by
    await _db[COLLECTION].replace_one({"id": DOC_ID}, new_doc, upsert=True)
    invalidate_cache()
    return await get_policy(force=True)


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------
def is_admin(user: Any) -> bool:
    if user is None:
        return False
    role = user.get("role") if isinstance(user, dict) else getattr(user, "role", None)
    role = getattr(role, "value", role)
    return str(role or "").lower() == "admin"


def _user_label(user: Any) -> Optional[str]:
    if user is None:
        return None
    if isinstance(user, dict):
        return user.get("email") or user.get("id")
    return getattr(user, "email", None) or getattr(user, "id", None)


def effective(policy: Dict[str, Any], feature: Optional[str], user: Any = None) -> bool:
    """Pure decision: feature override > group override > master switch;
    admin_bypass + admin user -> True."""
    if policy.get("admin_bypass") and is_admin(user):
        return True
    feats = policy.get("features") or {}
    if feature and feature in feats:
        return bool(feats[feature])
    g = group_of(feature)
    if g and g in feats:
        return bool(feats[g])
    return bool(policy.get("system_llm_enabled"))


def effective_map(policy: Dict[str, Any], user: Any = None) -> Dict[str, bool]:
    return {k: effective(policy, k, user) for k in FEATURES}


async def is_system_llm_allowed(feature: str, user: Any = None) -> bool:
    if user is None:
        user = _current_user.get()
    return effective(await get_policy(), feature, user)


async def require_system_llm(feature: str, user: Any = None) -> None:
    """Raise HTTPException(409, llm_external_only) unless allowed; on success
    mark the current context as granted for ``feature`` (the central guard
    then lets the LLM calls of this request / its background jobs through)."""
    if user is None:
        user = _current_user.get()
    pol = await get_policy()
    if not effective(pol, feature, user):
        raise HTTPException(status_code=409, detail=error_detail(feature, pol.get("external_hint")))
    _add_grant(feature)


# ---------------------------------------------------------------------------
# Context: grants, current user, route feature
# ---------------------------------------------------------------------------
# contextvars are copied into asyncio.create_task / asyncio.to_thread /
# Starlette BackgroundTasks (same task or run_in_threadpool), so a grant made
# by the endpoint survives into the background jobs it starts.
_grants: contextvars.ContextVar[frozenset] = contextvars.ContextVar("llm_grants", default=frozenset())
_current_user: contextvars.ContextVar[Any] = contextvars.ContextVar("llm_user", default=None)
_route_feature: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("llm_route_feature", default=None)


def _add_grant(feature: str) -> None:
    _grants.set(_grants.get() | {feature})


def current_grants() -> frozenset:
    return _grants.get()


def set_current_user(user: Any) -> None:
    """server.get_current_user calls this so the guard knows the caller
    (admin_bypass) even for call sites without an explicit check."""
    _current_user.set(user)


def current_route_feature() -> Optional[str]:
    return _route_feature.get()


# Request path -> feature fallback for call sites that have no
# require_system_llm yet. First match wins. Paths are matched against the
# full URL path (with the /api prefix). Keep specific patterns first.
ROUTE_FEATURES: Tuple[Tuple[re.Pattern, str], ...] = tuple((re.compile(p), f) for p, f in (
    # --- conjoint (routes/conjoint.py) ---
    (r"^/api/conjoint/studies/[^/]+/(generate-images|generate-single-image|generate-profile-image"
     r"|generate-product-from-results|generate-shelf-simulation)", "conjoint.images"),
    (r"^/api/admin/conjoint-image-settings", "conjoint.images"),
    (r"^/api/conjoint/studies/[^/]+/(export-thesis|thesis)", "conjoint.thesis"),
    (r"^/api/conjoint/studies/[^/]+/qualitative", "conjoint.qualitative"),
    (r"^/api/conjoint/", "conjoint.interpretation"),
    # --- brand equity (routes/brand_equity.py) ---
    (r"^/api/brand-equity/(studies/[^/]+/)?(extract-visual-identity|visual-identity|logo)", "be.visual_identity"),
    (r"^/api/brand-equity/studies/[^/]+/thesis", "be.thesis"),
    (r"^/api/brand-equity/thesis", "be.thesis"),
    (r"^/api/brand-equity/studies/[^/]+/(regenerate-questions|questions)", "be.questions"),
    (r"^/api/brand-equity/", "be.ai_analyze"),
    # --- customer value (routes/customer_value.py, prefix /cv) ---
    (r"^/api/cv/.*image", "cv.image"),
    (r"^/api/cv/", "cv.ai"),
    # --- journey (routes/journey*.py + legacy server.py endpoints) ---
    (r"^/api/journey", "journey.ai"),
    (r"^/api/(generate-journey-map|journey-map/)", "journey.ai"),
    # --- behavior / perception (server.py) ---
    (r"^/api/generate-behavior-image", "behavior.image"),
    (r"^/api/(generate-behavior-analysis|behavior-analysis/)", "behavior.ai"),
    (r"^/api/perception/generate-illustration", "perception.image"),
    (r"^/api/perception/", "perception.ai"),
    # --- CMS (routes/cms.py) ---
    (r"^/api/cms/ai/generate-image", "cms.image"),
    (r"^/api/cms/ai/translate", "translate"),
    (r"^/api/cms/", "cms.ai"),
    # --- content / surveys / translate (server.py) ---
    (r"^/api/admin/test-image-generation", "content.image"),
    (r"^/api/content/", "content.ai"),
    (r"^/api/surveys/", "survey.ai"),
    (r"^/api/translate", "translate"),
    # --- documents (server.py) ---
    (r"^/api/format-editor/replace-citations", "docs.citation"),
    (r"^/api/format-editor/analyze-file", "docs.ref_extract"),
    (r"^/api/format-editor/", "docs.format"),
    (r"^/api/journal-finder", "docs.journal_finder"),
))


def feature_for_path(path: str) -> Optional[str]:
    for rx, feat in ROUTE_FEATURES:
        if rx.search(path or ""):
            return feat
    return None


class RouteFeatureMiddleware:
    """Pure-ASGI middleware: tags the request context with the feature its
    path maps to, and resets user / grants for the request."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)
        t1 = _route_feature.set(feature_for_path(scope.get("path", "")))
        t2 = _grants.set(frozenset())
        t3 = _current_user.set(None)
        try:
            await self.app(scope, receive, send)
        finally:
            for var, tok in ((_route_feature, t1), (_grants, t2), (_current_user, t3)):
                try:
                    var.reset(tok)
                except ValueError:
                    pass


# ---------------------------------------------------------------------------
# Central guard decision (used by the server.py monkey-patches)
# ---------------------------------------------------------------------------
def _decide(pol: Dict[str, Any], kind: str) -> None:
    if _grants.get():
        return
    user = _current_user.get()
    feat = _route_feature.get()
    if feat is None and kind == "image":
        feat = "images"
    if effective(pol, feat, user):
        return
    logger.warning("[llm_policy] blocked billed %s call feature=%s user=%s",
                   kind, feat, _user_label(user))
    raise SystemLLMDisabled(feat, pol.get("external_hint"))


async def check_billed_call(kind: str = "chat") -> None:
    """Raise SystemLLMDisabled unless some effective rule allows a billed call.

    Order: (1) context grant from require_system_llm -> allow;
    (2) route feature known (RouteFeatureMiddleware) -> effective(route feature);
    (3) no route feature: image calls -> effective(group "images"),
        chat calls -> master switch. admin_bypass applies in (2)/(3).
    """
    if _grants.get():
        return
    _decide(await get_policy(), kind)


def check_billed_call_sync(kind: str = "chat") -> None:
    """Same decision for a *sync* entry point (cannot await the db): uses the
    cached policy, or the default policy if nothing is cached."""
    if _grants.get():
        return
    pol = _cache[1] if _cache is not None else _normalize(None)
    _decide(pol, kind)


def public_view(policy: Dict[str, Any], user: Any = None) -> Dict[str, Any]:
    """Body of GET /api/platform/llm-policy."""
    out = {
        "system_llm_enabled": bool(policy.get("system_llm_enabled")),
        "features": effective_map(policy, user),
        "external_hint": policy.get("external_hint") or "",
        "registry": registry(),
    }
    if is_admin(user):
        out["overrides"] = dict(policy.get("features") or {})
        out["admin_bypass"] = bool(policy.get("admin_bypass"))
        out["updated_at"] = policy.get("updated_at")
        out["updated_by"] = policy.get("updated_by")
        out["default_when_unset"] = default_enabled()
    return out
