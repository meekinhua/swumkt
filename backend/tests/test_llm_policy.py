"""System-LLM policy (plan 2026-11 §A) — `lib/llm_policy.py`, the central guard
in `server.py`, the /api/platform/llm-policy endpoints and the new API-key
scopes. Needs neither MongoDB nor an LLM key: pure tests first, then the real
app on mongomock-motor with a fake `emergentintegrations` (scripts/dev_sim.py).
"""
import asyncio
import contextvars
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi import HTTPException  # noqa: E402

from lib import api_keys, llm_policy  # noqa: E402


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def mockdb(monkeypatch):
    from mongomock_motor import AsyncMongoMockClient
    monkeypatch.delenv("SYSTEM_LLM_DEFAULT", raising=False)
    db = AsyncMongoMockClient()["llm_policy_unit"]
    prev = llm_policy._db
    llm_policy.init(db)
    yield db
    llm_policy.init(prev)


@pytest.fixture
def nodb(monkeypatch):
    monkeypatch.delenv("SYSTEM_LLM_DEFAULT", raising=False)
    prev = llm_policy._db
    llm_policy.init(None)
    yield
    llm_policy.init(prev)


ADMIN = {"role": "admin", "email": "a@x"}
STUDENT = {"role": "current_student", "email": "s@x"}


# ---- pure: defaults and precedence ----------------------------------------

def test_default_is_off_without_db(nodb):
    for key in llm_policy.FEATURES:
        assert run(llm_policy.is_system_llm_allowed(key, STUDENT)) is False
    pol = run(llm_policy.get_policy())
    assert pol["system_llm_enabled"] is False and pol["stored"] is False


def test_env_default_on_flips_the_default(nodb, monkeypatch):
    monkeypatch.setenv("SYSTEM_LLM_DEFAULT", "on")
    llm_policy.invalidate_cache()
    assert run(llm_policy.is_system_llm_allowed("be.thesis", STUDENT)) is True
    monkeypatch.setenv("SYSTEM_LLM_DEFAULT", "off")
    llm_policy.invalidate_cache()
    assert run(llm_policy.is_system_llm_allowed("be.thesis", STUDENT)) is False


def test_stored_master_switch_beats_env_default(mockdb, monkeypatch):
    monkeypatch.setenv("SYSTEM_LLM_DEFAULT", "on")
    run(mockdb.platform_settings.insert_one({"id": "llm", "system_llm_enabled": False}))
    llm_policy.invalidate_cache()
    assert run(llm_policy.is_system_llm_allowed("translate")) is False


def test_override_precedence_feature_then_group_then_master():
    pol = {"system_llm_enabled": False, "features": {"research": True, "be.ai_analyze": False}}
    assert llm_policy.effective(pol, "conjoint.interpretation") is True   # group
    assert llm_policy.effective(pol, "be.ai_analyze") is False            # feature beats group
    assert llm_policy.effective(pol, "translate") is False                # master
    pol = {"system_llm_enabled": True, "features": {"images": False, "cms.image": True}}
    assert llm_policy.effective(pol, "conjoint.images") is False
    assert llm_policy.effective(pol, "cms.image") is True
    assert llm_policy.effective(pol, "docs.format") is True
    # unknown / missing feature -> master switch
    assert llm_policy.effective(pol, None) is True
    assert llm_policy.effective(pol, "not.registered") is True


def test_admin_bypass_only_for_admins():
    pol = {"system_llm_enabled": False, "features": {"thesis": False}, "admin_bypass": True}
    assert llm_policy.effective(pol, "be.thesis", ADMIN) is True
    assert llm_policy.effective(pol, "be.thesis", STUDENT) is False
    assert llm_policy.effective(pol, "be.thesis", None) is False

    class R:  # enum-like role, as on the server User model
        value = "admin"

    class U:
        role = R()
    assert llm_policy.effective(pol, "be.thesis", U()) is True
    pol["admin_bypass"] = False
    assert llm_policy.effective(pol, "be.thesis", ADMIN) is False


def test_registry_groups_cover_every_feature():
    assert set(llm_policy.FEATURES.values()) <= set(llm_policy.GROUPS)
    reg = llm_policy.registry()
    assert {f["key"] for f in reg["features"]} == set(llm_policy.FEATURES)
    for k in ("conjoint.interpretation", "be.thesis", "conjoint.images", "translate", "docs.format"):
        assert k in llm_policy.FEATURES


@pytest.mark.parametrize("path,feature", [
    ("/api/conjoint/studies/s1/ai-interpretation", "conjoint.interpretation"),
    ("/api/conjoint/studies/s1/export-thesis", "conjoint.thesis"),
    ("/api/conjoint/studies/s1/qualitative-analysis", "conjoint.qualitative"),
    ("/api/conjoint/studies/s1/generate-profile-image", "conjoint.images"),
    ("/api/brand-equity/studies/s1/ai-analyze", "be.ai_analyze"),
    ("/api/brand-equity/studies/s1/thesis-ai-start", "be.thesis"),
    ("/api/brand-equity/studies/s1/regenerate-questions", "be.questions"),
    ("/api/brand-equity/studies/s1/extract-visual-identity", "be.visual_identity"),
    ("/api/cv/studies/s1/generate-image", "cv.image"),
    ("/api/cv/studies/s1/ai-analysis", "cv.ai"),
    ("/api/journey/studies/s1/codebook/extract", "journey.ai"),
    ("/api/cms/ai/generate-image", "cms.image"),
    ("/api/cms/ai/generate-text", "cms.ai"),
    ("/api/translate", "translate"),
    ("/api/surveys/ai-generate", "survey.ai"),
    ("/api/content/c1/ai-rearrange", "content.ai"),
    ("/api/format-editor/replace-citations", "docs.citation"),
    ("/api/format-editor/format", "docs.format"),
    ("/api/generate-behavior-image", "behavior.image"),
    ("/api/perception/generate-questions", "perception.ai"),
    ("/api/health", None),
    ("/api/auth/login", None),
])
def test_route_feature_fallback_mapping(path, feature):
    assert llm_policy.feature_for_path(path) == feature
    if feature:
        assert feature in llm_policy.FEATURES


# ---- pure: validation, update, cache --------------------------------------

@pytest.mark.parametrize("patch", [
    {"features": {"nope": True}},
    {"features": {"translate": "yes"}},
    {"features": ["translate"]},
    {"system_llm_enabled": "true"},
    {"admin_bypass": 1},
    {"external_hint": 5},
    {"external_hint": "x" * 2001},
    {"something_else": True},
    [],
])
def test_validate_update_rejects_bad_input(patch):
    with pytest.raises(ValueError):
        llm_policy.validate_update(patch)


def test_update_records_author_and_null_removes_override(mockdb):
    pol = run(llm_policy.update_policy(
        {"system_llm_enabled": True, "features": {"images": False, "translate": False},
         "external_hint": " ใช้ ChatGPT "}, updated_by="boss@x"))
    assert pol["features"] == {"images": False, "translate": False}
    assert pol["updated_by"] == "boss@x" and pol["updated_at"]
    assert pol["external_hint"] == "ใช้ ChatGPT"
    pol = run(llm_policy.update_policy({"features": {"translate": None}}, updated_by="b2"))
    assert pol["features"] == {"images": False}
    assert pol["system_llm_enabled"] is True          # untouched by a partial update
    doc = run(mockdb.platform_settings.find_one({"id": "llm"}, {"_id": 0}))
    assert doc["features"] == {"images": False} and doc["updated_by"] == "b2"


def test_cache_is_invalidated_by_update_but_not_by_raw_db_writes(mockdb):
    assert run(llm_policy.is_system_llm_allowed("translate")) is False
    run(mockdb.platform_settings.insert_one({"id": "llm", "system_llm_enabled": True}))
    # within the TTL the cached (default OFF) policy is still served ...
    assert run(llm_policy.is_system_llm_allowed("translate")) is False
    llm_policy.invalidate_cache()
    assert run(llm_policy.is_system_llm_allowed("translate")) is True
    # ... while update_policy invalidates immediately
    run(llm_policy.update_policy({"system_llm_enabled": False}))
    assert run(llm_policy.is_system_llm_allowed("translate")) is False
    assert llm_policy.CACHE_TTL_SECONDS <= 15


def test_require_system_llm_409_body_and_grant(mockdb):
    run(llm_policy.update_policy({"external_hint": "hint!"}))

    async def denied():
        await llm_policy.require_system_llm("be.thesis", STUDENT)
    with pytest.raises(HTTPException) as ei:
        run(denied())
    assert ei.value.status_code == 409
    d = ei.value.detail
    assert d["code"] == "llm_external_only" and d["feature"] == "be.thesis"
    assert d["hint"] == "hint!" and d["message"]

    run(llm_policy.update_policy({"features": {"thesis": True}}))

    async def allowed():
        await llm_policy.require_system_llm("be.thesis", STUDENT)
        return llm_policy.current_grants()
    assert run(allowed()) == frozenset({"be.thesis"})


# ---- pure: grant propagation ------------------------------------------------

def test_grant_survives_create_task_and_to_thread(mockdb):
    """Master OFF; only the grant can let these calls through."""
    run(llm_policy.update_policy({"features": {"cv.ai": True}}))

    async def scenario():
        # no grant yet -> blocked
        with pytest.raises(llm_policy.SystemLLMDisabled):
            await llm_policy.check_billed_call("chat")
        await llm_policy.require_system_llm("cv.ai", STUDENT)

        async def bg():
            await asyncio.sleep(0)
            await llm_policy.check_billed_call("chat")
            return "task-ok"

        def in_thread():
            llm_policy.check_billed_call_sync("chat")
            # a fresh loop inside the worker thread (what the LlmChat patch does)
            loop = asyncio.new_event_loop()
            try:
                return loop.run_until_complete(bg())
            finally:
                loop.close()

        t = asyncio.create_task(bg())
        r1 = await t
        r2 = await asyncio.to_thread(in_thread)
        return r1, r2
    assert run(scenario()) == ("task-ok", "task-ok")


def test_grant_does_not_leak_out_of_a_child_task(mockdb):
    run(llm_policy.update_policy({"features": {"cv.ai": True}}))

    async def scenario():
        async def child():
            await llm_policy.require_system_llm("cv.ai", STUDENT)
        await asyncio.create_task(child())
        return llm_policy.current_grants()
    assert run(scenario()) == frozenset()


def test_guard_uses_route_feature_and_user(mockdb):
    run(llm_policy.update_policy({"system_llm_enabled": True,
                                  "features": {"images": False}, "admin_bypass": True}))

    def in_ctx(feature, user, kind):
        async def go():
            llm_policy._route_feature.set(feature)
            llm_policy.set_current_user(user)
            await llm_policy.check_billed_call(kind)
            return True
        ctx = contextvars.copy_context()
        try:
            return ctx.run(lambda: asyncio.run(go()))
        except llm_policy.SystemLLMDisabled as e:
            return e
    assert in_ctx("translate", STUDENT, "chat") is True
    e = in_ctx("conjoint.images", STUDENT, "image")
    assert isinstance(e, llm_policy.SystemLLMDisabled) and e.feature == "conjoint.images"
    # an image call on an unmapped route falls back to the images group
    assert isinstance(in_ctx(None, STUDENT, "image"), llm_policy.SystemLLMDisabled)
    assert in_ctx(None, STUDENT, "chat") is True
    assert in_ctx("conjoint.images", ADMIN, "image") is True   # admin_bypass


# ---- API keys: new scopes ---------------------------------------------------

def test_new_scopes_exist_and_wildcard_does_not_cover_them():
    for s in ("platform.settings", "research.read", "research.ai"):
        assert s in api_keys.SCOPES
        assert not api_keys.scope_allows([api_keys.WILDCARD], s)
        assert api_keys.scope_allows([s], s)
    assert api_keys.scope_allows([api_keys.WILDCARD], "cms.posts.write")


@pytest.mark.parametrize("method,path,scope", [
    ("GET", "/api/platform/llm-policy", "platform.settings"),
    ("PUT", "/api/platform/llm-policy", "platform.settings"),
    ("GET", "/api/conjoint/studies", "research.read"),
    ("GET", "/api/conjoint/studies/s1", "research.read"),
    ("GET", "/api/conjoint/studies/s1/results", "research.read"),
    ("GET", "/api/conjoint/studies/s1/statistical-analysis", "research.read"),
    ("GET", "/api/conjoint/studies/s1/export-responses", "research.read"),
    ("GET", "/api/conjoint/studies/s1/export-thesis-download", "research.read"),
    ("GET", "/api/brand-equity/studies", "research.read"),
    ("GET", "/api/brand-equity/studies/s1/dashboard", "research.read"),
    ("GET", "/api/brand-equity/studies/s1/responses", "research.read"),
    ("GET", "/api/brand-equity/thesis-eligible", "research.read"),
    ("GET", "/api/conjoint/studies/s1/ai-interpretation/external-prompt", "research.read"),
    ("POST", "/api/conjoint/studies/s1/ai-interpretation/external-prompt", "research.read"),
    ("POST", "/api/brand-equity/studies/s1/ai-analyze/external-prompt", "research.read"),
    ("GET", "/api/brand-equity/studies/s1/thesis/external-pack", "research.read"),
    ("POST", "/api/conjoint/studies/s1/ai-interpretation/external-import", "research.ai"),
    ("POST", "/api/brand-equity/studies/s1/thesis/external-import", "research.ai"),
    ("POST", "/api/brand-equity/studies/s1/thesis/external-pack", "research.ai"),
    ("POST", "/api/conjoint/studies/s1/external-pack", "research.ai"),
])
def test_new_scope_rules(method, path, scope):
    assert api_keys.required_scope(method, path) == scope


@pytest.mark.parametrize("method,path", [
    # writes / system-LLM triggers stay out of reach
    ("POST", "/api/conjoint/studies"),
    ("POST", "/api/conjoint/studies/s1/ai-interpretation"),
    ("POST", "/api/conjoint/studies/s1/export-thesis"),
    ("PUT", "/api/conjoint/studies/s1/attributes"),
    ("DELETE", "/api/conjoint/studies/s1"),
    ("DELETE", "/api/brand-equity/studies/s1/purge"),
    ("POST", "/api/brand-equity/studies/s1/ai-analyze"),
    ("POST", "/api/brand-equity/studies/s1/thesis-ai-start"),
    ("PUT", "/api/brand-equity/studies/s1"),
    ("POST", "/api/platform/llm-policy"),
    ("DELETE", "/api/platform/llm-policy"),
    # admin stays hard-denied, including module admin endpoints
    ("GET", "/api/admin/ai-settings"),
    ("PUT", "/api/admin/ai-settings"),
    ("POST", "/api/conjoint/admin/sync-all-respondent-counts"),
    ("POST", "/api/brand-equity/admin/cleanup-decoys"),
    ("GET", "/api/admin/conjoint-image-settings"),
    # traversal is refused, not normalised
    ("GET", "/api/conjoint/studies/../../admin/users"),
    ("GET", "/api/conjoint/studies/s1/%2e%2e/x"),
    # public / other modules not covered
    ("GET", "/api/brand-equity/public/tok"),
    ("GET", "/api/cv/studies"),
])
def test_paths_outside_new_scopes_stay_refused(method, path):
    assert api_keys.required_scope(method, path) is None


def test_existing_content_keys_do_not_gain_research_or_platform_access():
    for path, method in (("/api/platform/llm-policy", "PUT"),
                         ("/api/conjoint/studies", "GET"),
                         ("/api/brand-equity/studies/s1/thesis/external-import", "POST")):
        needed = api_keys.required_scope(method, path)
        for scopes in ([api_keys.WILDCARD], ["cms.read"], list(k for k in api_keys.SCOPES
                                                               if k.startswith("cms."))):
            assert not api_keys.scope_allows(scopes, needed), (scopes, path)
    # research.read does not imply research.ai or platform.settings
    assert not api_keys.scope_allows(["research.read"], "research.ai")
    assert not api_keys.scope_allows(["research.read", "research.ai"], "platform.settings")


# ---- the real app (mongomock + fake emergentintegrations) -------------------

@pytest.fixture(scope="module")
def sim():
    """Import server.py once with the dev_sim environment; undo env/sys.modules after."""
    import motor.motor_asyncio as mma
    saved_env = dict(os.environ)
    saved_client = mma.AsyncIOMotorClient
    saved_mods = set(sys.modules)
    sys.path.insert(0, str(BACKEND / "scripts"))
    import dev_sim
    calls = []
    dev_sim.install_fake_emergentintegrations(reply="FAKE", calls=calls, with_image_module=True)
    dev_sim.prepare_sim_env(db_name="llm_policy_it")
    os.environ.pop("SYSTEM_LLM_DEFAULT", None)
    import server
    from fastapi import BackgroundTasks, Depends
    from fastapi.testclient import TestClient

    # Test-only endpoints that make billed calls through the patched library.
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration
    import emergentintegrations.image as ei_image
    bg_results = []

    async def _chat():
        return await LlmChat(api_key="k").send_message(UserMessage(text="hi"))

    async def plain_chat(user=Depends(server.get_current_user)):
        return {"text": await _chat()}

    async def granted_bg(background_tasks: BackgroundTasks, user=Depends(server.get_current_user)):
        await llm_policy.require_system_llm("cv.ai", user)

        async def job():
            try:
                bg_results.append(await _chat())
            except llm_policy.SystemLLMDisabled as e:
                bg_results.append(e)

        def sync_job():
            try:
                llm_policy.check_billed_call_sync("chat")
                bg_results.append("sync-ok")
            except llm_policy.SystemLLMDisabled as e:
                bg_results.append(e)
        background_tasks.add_task(job)
        background_tasks.add_task(sync_job)
        t = asyncio.create_task(_chat())
        return {"text": await t}

    async def image_openai(user=Depends(server.get_current_user)):
        imgs = await OpenAIImageGeneration(api_key="k").generate_images(prompt="p")
        return {"n": len(imgs)}

    async def image_module(user=Depends(server.get_current_user)):
        await ei_image.generate_image("p")
        return {"ok": True}

    async def multimodal(user=Depends(server.get_current_user)):
        text, imgs = await LlmChat(api_key="k").send_message_multimodal_response(UserMessage(text="x"))
        return {"n": len(imgs)}

    app = server.app
    app.add_api_route("/api/zz-test/chat", plain_chat, methods=["POST"])
    app.add_api_route("/api/zz-test/granted-bg", granted_bg, methods=["POST"])
    app.add_api_route("/api/zz-test/image-openai", image_openai, methods=["POST"])
    app.add_api_route("/api/zz-test/image-module", image_module, methods=["POST"])
    app.add_api_route("/api/zz-test/multimodal", multimodal, methods=["POST"])
    app.add_api_route("/api/conjoint/zz-test-chat", plain_chat, methods=["POST"])

    users = asyncio.run(dev_sim.seed_users(server))
    client = TestClient(app)

    def login(email, pw):
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    ns = type("Sim", (), {})()
    ns.server, ns.client, ns.calls, ns.bg = server, client, calls, bg_results
    ns.admin = login(dev_sim.ADMIN_EMAIL, dev_sim.ADMIN_PASSWORD)
    ns.user = login(dev_sim.USER_EMAIL, dev_sim.USER_PASSWORD)
    ns.users = users

    def set_policy(doc):
        asyncio.run(server.db.platform_settings.delete_many({}))
        if doc is not None:
            asyncio.run(server.db.platform_settings.insert_one(dict(doc, id="llm")))
        llm_policy.init(server.db)
    ns.set_policy = set_policy

    def mint(scopes):
        doc, key = api_keys.build_key_document("t", scopes, "test")
        asyncio.run(server.db[api_keys.COLLECTION].insert_one(dict(doc)))
        return {"Authorization": f"Bearer {key}"}
    ns.mint = mint
    yield ns

    llm_policy.init(None)
    mma.AsyncIOMotorClient = saved_client
    os.environ.clear()
    os.environ.update(saved_env)
    for m in [m for m in sys.modules if m.startswith("emergentintegrations")]:
        if m not in saved_mods:
            del sys.modules[m]


def test_health_needs_no_auth(sim):
    r = sim.client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["version"] and body["time"]


def test_guard_blocks_by_default_and_returns_409(sim):
    sim.set_policy(None)
    n = len(sim.calls)
    r = sim.client.post("/api/zz-test/chat", headers=sim.user)
    assert r.status_code == 409
    d = r.json()["detail"]
    assert d["code"] == "llm_external_only" and "message" in d and "hint" in d
    assert len(sim.calls) == n            # nothing reached the (fake) provider


def test_guard_passes_when_master_on(sim):
    sim.set_policy({"system_llm_enabled": True})
    r = sim.client.post("/api/zz-test/chat", headers=sim.user)
    assert r.status_code == 200 and r.json()["text"] == "FAKE"


def test_feature_override_applies_to_unannotated_endpoint_via_path(sim):
    sim.set_policy({"system_llm_enabled": True, "features": {"research": False}})
    r = sim.client.post("/api/conjoint/zz-test-chat", headers=sim.user)
    assert r.status_code == 409 and r.json()["detail"]["feature"] == "conjoint.interpretation"
    assert sim.client.post("/api/zz-test/chat", headers=sim.user).status_code == 200
    sim.set_policy({"system_llm_enabled": False, "features": {"conjoint.interpretation": True}})
    assert sim.client.post("/api/conjoint/zz-test-chat", headers=sim.user).status_code == 200
    assert sim.client.post("/api/zz-test/chat", headers=sim.user).status_code == 409


def test_admin_bypass_via_get_current_user(sim):
    sim.set_policy({"system_llm_enabled": False, "admin_bypass": True})
    assert sim.client.post("/api/zz-test/chat", headers=sim.admin).status_code == 200
    assert sim.client.post("/api/zz-test/chat", headers=sim.user).status_code == 409


def test_grant_reaches_background_tasks_create_task_and_threadpool(sim):
    sim.set_policy({"system_llm_enabled": False, "features": {"cv.ai": True}})
    sim.bg.clear()
    r = sim.client.post("/api/zz-test/granted-bg", headers=sim.user)
    assert r.status_code == 200 and r.json()["text"] == "FAKE"
    assert sim.bg == ["FAKE", "sync-ok"]
    # without the override the explicit check refuses up front
    sim.set_policy(None)
    sim.bg.clear()
    r = sim.client.post("/api/zz-test/granted-bg", headers=sim.user)
    assert r.status_code == 409 and r.json()["detail"]["feature"] == "cv.ai"
    assert sim.bg == []


def test_image_entry_points_are_guarded(sim):
    sim.set_policy({"system_llm_enabled": True, "features": {"images": False}})
    for path in ("/api/zz-test/image-openai", "/api/zz-test/image-module", "/api/zz-test/multimodal"):
        r = sim.client.post(path, headers=sim.user)
        assert r.status_code == 409, path
    sim.set_policy({"system_llm_enabled": True})
    for path in ("/api/zz-test/image-openai", "/api/zz-test/image-module", "/api/zz-test/multimodal"):
        assert sim.client.post(path, headers=sim.user).status_code == 200, path


def test_policy_endpoints(sim):
    sim.set_policy(None)
    c = sim.client
    assert c.get("/api/platform/llm-policy").status_code in (401, 403)
    r = c.get("/api/platform/llm-policy", headers=sim.user)
    assert r.status_code == 200
    body = r.json()
    assert body["system_llm_enabled"] is False
    assert set(body["features"]) == set(llm_policy.FEATURES)
    assert "registry" in body and "external_hint" in body and "overrides" not in body

    assert c.put("/api/platform/llm-policy", headers=sim.user,
                 json={"system_llm_enabled": True}).status_code == 403
    assert c.put("/api/platform/llm-policy", headers=sim.admin,
                 json={"features": {"nope": True}}).status_code == 422
    assert c.put("/api/platform/llm-policy", headers=sim.admin,
                 json={"features": {"translate": "on"}}).status_code == 422

    r = c.put("/api/platform/llm-policy", headers=sim.admin,
              json={"features": {"research": True, "be.thesis": True}, "external_hint": "ใช้ Gemini"})
    assert r.status_code == 200
    b = r.json()
    assert b["features"]["conjoint.interpretation"] is True and b["features"]["be.thesis"] is True
    assert b["features"]["translate"] is False
    assert b["overrides"] == {"research": True, "be.thesis": True}
    assert b["updated_by"] == "admin@swu.ac.th"
    r = c.put("/api/platform/llm-policy", headers=sim.admin, json={"features": {"research": None}})
    assert r.json()["overrides"] == {"be.thesis": True}
    # a user sees the effective map immediately (cache invalidated on update)
    b = c.get("/api/platform/llm-policy", headers=sim.user).json()
    assert b["features"]["conjoint.interpretation"] is False and b["features"]["be.thesis"] is True
    assert b["external_hint"] == "ใช้ Gemini"


def test_api_key_scope_gate_end_to_end(sim):
    sim.set_policy(None)
    c = sim.client
    content = sim.mint([api_keys.WILDCARD])
    platform = sim.mint(["platform.settings"])
    research = sim.mint(["research.read"])
    assert c.get("/api/platform/llm-policy", headers=content).status_code == 403
    assert c.get("/api/platform/llm-policy", headers=platform).status_code == 200
    r = c.put("/api/platform/llm-policy", headers=platform, json={"external_hint": "via key"})
    assert r.status_code == 200 and r.json()["external_hint"] == "via key"
    assert c.get("/api/admin/ai-settings", headers=platform).status_code == 403
    assert c.get("/api/conjoint/studies", headers=platform).status_code == 403
    assert c.get("/api/conjoint/studies", headers=content).status_code == 403
    assert c.get("/api/conjoint/studies", headers=research).status_code == 200
    assert c.get("/api/brand-equity/studies", headers=research).status_code == 200
    assert c.post("/api/conjoint/studies", headers=research,
                  json={"title": "x"}).status_code == 403
    assert c.put("/api/platform/llm-policy", headers=research,
                 json={"system_llm_enabled": True}).status_code == 403


# ---- WP9a integration --------------------------------------------------------

def test_api_key_never_spends_even_with_admin_bypass(sim):
    """A key's principal is role ADMIN; with admin_bypass it used to pass the
    guard. Keys must never trigger billed calls."""
    sim.set_policy({"system_llm_enabled": False, "admin_bypass": True, "features": {}})
    key_user = sim.server._principal_for_key({"id": "k1", "label": "t", "fingerprint": "swk_x"})
    pol = asyncio.run(llm_policy.get_policy())
    assert llm_policy.is_admin(key_user) and llm_policy.is_api_key_principal(key_user)
    assert llm_policy.effective(pol, "conjoint.interpretation", key_user) is False
    sim.set_policy({"system_llm_enabled": True, "features": {}})
    pol = asyncio.run(llm_policy.get_policy())
    assert llm_policy.effective(pol, "conjoint.interpretation", key_user) is False
    with pytest.raises(Exception) as e:
        asyncio.run(llm_policy.require_system_llm("conjoint.interpretation", key_user))
    assert getattr(e.value, "status_code", None) == 409
    # Display: a key sees the site's effective policy, not "all off".
    view = llm_policy.public_view(pol, key_user)
    assert view["features"]["conjoint.interpretation"] is True and "overrides" in view
    # End to end: a key with a scope that reaches a billed test route is refused by the guard.
    n = len(sim.calls)
    platform = sim.mint(["platform.settings"])
    assert sim.client.get("/api/platform/llm-policy", headers=platform).json()["features"]["cv.ai"] is True
    sim.set_policy(None)


def test_no_llm_routes_refuse_billed_calls_even_with_a_grant():
    for p in ("/api/conjoint/studies/s/ai-interpretation/external-prompt",
              "/api/conjoint/studies/s/export-thesis/external-pack",
              "/api/brand-equity/studies/s/ai-analyze/external-import",
              "/api/conjoint/studies/s/export-thesis/no-ai", "/api/conjoint/studies/s/export-long",
              "/api/conjoint/studies/s/wtp", "/api/conjoint/studies/s/simulate",
              "/api/conjoint/studies/s/data-quality", "/api/brand-equity/studies/s/coding",
              "/api/brand-equity/studies/s/coding/import-csv", "/api/brand-equity/studies/s/export/raw",
              "/api/brand-equity/extract-identity/external-prompt"):
        assert llm_policy.feature_for_path(p) == llm_policy.NO_LLM, p
    assert llm_policy.feature_for_path("/api/brand-equity/extract-identity") == "be.visual_identity"
    assert llm_policy.feature_for_path("/api/conjoint/studies/s/ai-interpretation") == "conjoint.interpretation"
    assert llm_policy.NO_LLM not in llm_policy.FEATURES
    assert llm_policy.FEATURES["be.visual_identity"] == "research"

    async def run():
        t = llm_policy._route_feature.set(llm_policy.NO_LLM)
        g = llm_policy._grants.set(frozenset({"conjoint.interpretation"}))
        try:
            with pytest.raises(llm_policy.SystemLLMDisabled):
                await llm_policy.check_billed_call("chat")
            with pytest.raises(llm_policy.SystemLLMDisabled):
                llm_policy.check_billed_call_sync("image")
        finally:
            llm_policy._grants.reset(g)
            llm_policy._route_feature.reset(t)
    asyncio.run(run())


def test_api_key_on_optional_auth_route_is_scoped_not_anonymous(sim):
    """research.read must reach optional-auth reads of a PRIVATE study (WTP,
    interpretation prompt); a key without the scope is refused, not downgraded."""
    import uuid as _uuid
    sid = str(_uuid.uuid4())
    asyncio.run(sim.server.db.conjoint_studies.insert_one({
        "id": sid, "title": "priv", "creator_id": "someone-else", "is_public_result": False,
        "attributes": [], "choice_sets": [], "respondent_count": 0}))
    research = sim.mint(["research.read"])
    content = sim.mint(["cms.*"])
    r = sim.client.get(f"/api/conjoint/studies/{sid}/wtp", headers=research)
    assert r.status_code == 200, r.text                     # not 401 any more
    r = sim.client.get(f"/api/conjoint/studies/{sid}/ai-interpretation", headers=research)
    assert r.status_code == 200 and r.json() == {"cached": False}
    assert sim.client.get(f"/api/conjoint/studies/{sid}/wtp", headers=content).status_code == 403
    # research.read cannot start a system interpretation (POST is not in its scope).
    assert sim.client.post(f"/api/conjoint/studies/{sid}/ai-interpretation", headers=research,
                           json={"method": "mnl"}).status_code == 403
    # Anonymous still sees only public studies.
    assert sim.client.get(f"/api/conjoint/studies/{sid}/wtp").status_code == 401


def test_body_size_limit_on_import_endpoints(sim):
    big = "x" * (2 * 1024 * 1024 + 10)
    r = sim.client.post("/api/conjoint/studies/s/ai-interpretation/external-import",
                        headers=sim.admin, json={"content": big})
    assert r.status_code == 413 and r.json()["detail"]["code"] == "payload_too_large"
    # Small bodies pass through untouched (404 from the route, not 413).
    r = sim.client.post("/api/conjoint/studies/nope/ai-interpretation/external-import",
                        headers=sim.admin, json={"content": "y" * 100})
    assert r.status_code in (404, 422)
