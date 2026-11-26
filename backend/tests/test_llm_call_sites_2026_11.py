"""WP5 (plan 2026-11) — every LLM call site outside conjoint / brand-equity behaves under the
admin switch: 409 llm_external_only when off, reaches the (fake) LLM when on, policy refusals are
never swallowed into 500s, and the `external-prompt` companions return the SAME prompt the system
path sends. Needs neither MongoDB nor an LLM key (mongomock-motor + the dev_sim fake LLM).
"""
import ast
import asyncio
import base64
import io
import json
import os
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi import HTTPException  # noqa: E402

from lib import external_prompts as ext  # noqa: E402
from lib import llm_policy  # noqa: E402

FAKE_JSON_REPLY = json.dumps({
    "suggestions": [{"label": "ที่จอดรถเพียงพอ", "weight": 2, "rationale": "r", "principle": "kotler-value"}],
    "need": "n", "want": "w", "buying_power": "b", "is_real_demand": True, "demand_verdict": "v",
    "tips": ["t"], "summary": "s", "checklist": ["a", "b"],
}, ensure_ascii=False)

SDL_YAML = textwrap.dedent("""\
    survey: "ความพึงพอใจร้านกาแฟ"
    type: perception
    description: "สำรวจความพึงพอใจ"
    demographics:
      collect: true
      auto_fill: true
      fields:
        - birth_sex
        - age_group
    sections:
      - name: "ประสบการณ์"
        description: "เกี่ยวกับการใช้บริการ"
        questions:
          - text: "คุณมาร้านบ่อยแค่ไหน?"
            type: multiple_choice_single
            required: yes
            data_type: nominal
            options:
              - "ทุกวัน"
              - "สัปดาห์ละครั้ง"
          - text: "ให้คะแนนรสชาติ"
            type: rating_scale
            scale: "1-5"
            labels:
              "1": "แย่"
              "5": "ดีเยี่ยม"
            required: yes
            data_type: scale
""")


# ---------------------------------------------------------------- pure
def test_policy_refusal_detection():
    assert ext.is_policy_refusal(llm_policy.SystemLLMDisabled("translate"))
    assert ext.is_policy_refusal(HTTPException(409, detail=llm_policy.error_detail("cv.ai")))
    assert not ext.is_policy_refusal(HTTPException(409, detail="conflict"))
    assert not ext.is_policy_refusal(HTTPException(500, detail=llm_policy.error_detail("cv.ai")))
    assert not ext.is_policy_refusal(RuntimeError("x"))


def test_llm_if_allowed_is_soft(monkeypatch):
    async def deny(feature, user=None):
        raise HTTPException(409, detail=llm_policy.error_detail(feature))

    async def ok(feature, user=None):
        return None

    async def boom(feature, user=None):
        raise HTTPException(403, detail="nope")
    monkeypatch.setattr(llm_policy, "require_system_llm", deny)
    assert asyncio.run(ext.llm_if_allowed("docs.format")) is False
    monkeypatch.setattr(llm_policy, "require_system_llm", ok)
    assert asyncio.run(ext.llm_if_allowed("docs.format")) is True
    monkeypatch.setattr(llm_policy, "require_system_llm", boom)
    with pytest.raises(HTTPException):
        asyncio.run(ext.llm_if_allowed("docs.format"))


def test_translate_prompt_contents():
    system, user = ext.translate_prompts("สวัสดี", "en")
    assert "English" in system and "สวัสดี" in user
    # unknown code is passed through (same behaviour as the old inline code)
    assert "xx" in ext.translate_prompts("a", "xx")[0]


def test_survey_prompt_embeds_inputs():
    system, prompt = ext.survey_sdl_prompts("ร้านกาแฟ", "perception", 7, "th")
    assert "ร้านกาแฟ" in prompt and "Thai" in prompt and "7" in prompt and "perception" in prompt
    assert "Survey Definition Language" in prompt and "YAML" in system


def test_journey_prompt_and_parse_roundtrip():
    p = ext.journey_user_prompt("ลูกค้าเดินเข้าร้าน", "บริบท", "th", "B", "linear")
    assert "ลูกค้าเดินเข้าร้าน" in p and "Thai" in p and "linear sequential" in p and "บริบท" in p
    analysis, mermaid = ext.parse_journey_response("ANALYSIS:\nสรุป\n\nMERMAID:\n```mermaid\ngraph TD\nA-->B\n```")
    assert analysis == "สรุป" and mermaid.startswith("graph TD")
    # no mermaid at all -> placeholder (the import endpoint refuses before calling this)
    assert ext.parse_journey_response("just text")[1].startswith("graph TD")


def test_payload_shape_is_the_plan_b_shape():
    pay = ext.single_part_payload(feature="translate", title="t", system_prompt="S", prompt="P",
                                  expected_format="markdown", filename="f.md")
    assert set(pay) >= {"feature", "title", "instructions_th", "expected_format", "parts", "filename"}
    part = pay["parts"][0]
    assert part["key"] == "main" and part["system_prompt"] == "S" and part["prompt"] == "P"
    assert "json_example" not in part
    pay = ext.single_part_payload(feature="cv.ai", title="t", system_prompt="", prompt="P",
                                  expected_format="json", filename="f.md", json_example="{}")
    assert pay["parts"][0]["json_example"] == "{}"


def test_import_cleaning():
    assert ext.strip_code_fence("```yaml\na: 1\n```") == "a: 1"
    assert ext.strip_code_fence("plain") == "plain"
    with pytest.raises(ext.ExternalImportError):
        ext.clean_text_import("   ")
    with pytest.raises(ext.ExternalImportError):
        ext.clean_text_import("```\nshort\n```", min_chars=20)
    stamp = ext.external_stamp("  ChatGPT   5 ", {"id": "u1"})
    assert stamp["source"] == "external" and stamp["model_label"] == "ChatGPT 5" and stamp["imported_by"] == "u1"


def test_cv_builders_embed_study_data():
    from routes import customer_value as cv
    study = {"industry": "food", "brands": [
        {"id": "b1", "name": "ร้านเรา", "is_ours": True,
         "benefits": {"functional": [{"label": "รสชาติดี", "checked": True, "weight": 3}]},
         "costs": {"money": [{"label": "แพง", "checked": True, "weight": 2}]}},
        {"id": "b2", "name": "คู่แข่ง", "is_ours": False}]}
    req = type("R", (), {"brand_id": "b1", "category": "money"})()
    system, prompt, is_cost = cv._cv_suggest_prompts(study, study["brands"][0], req)
    assert is_cost and "ร้านเรา" in prompt and "แพง" in prompt and "JSON" in system
    req2 = type("R", (), {"brand_id": "b1", "category": "functional"})()
    _, prompt2, is_cost2 = cv._cv_suggest_prompts(study, study["brands"][0], req2)
    assert not is_cost2 and "รสชาติดี" in prompt2
    system, prompt = cv._cv_analysis_prompts(study)
    assert "ร้านเรา" in prompt and "คู่แข่ง" in prompt and "Net Value" in prompt
    system, prompt = cv._cv_needs_prompts(study, type("N", (), {"need": "หิว", "want": "", "buying_power": ""})())
    assert "หิว" in prompt and "ร้านเรา" in prompt
    system, prompt = cv._cv_step_prompts(study, type("S", (), {"step": "stp"})())
    assert "STP" in prompt
    img = cv._cv_image_prompt(study, study["brands"][0], type("I", (), {"extra_prompt": "สีฟ้า"})())
    assert "รสชาติดี" in img and "สีฟ้า" in img


def test_cms_builders_and_full_parse():
    from routes import cms
    req = cms.AITextRequest(base_prompt="เขียนข่าว", extra_prompt="สั้นๆ")
    p = cms._cms_text_prompt(req, "CTX")
    assert "เขียนข่าว" in p and "สั้นๆ" in p and "CTX" in p
    full_req = cms.AIFullRequest(description="งานประกวด", post_type="article", category="การประกวด")
    fp = cms._cms_full_prompt(full_req, "")
    assert "งานประกวด" in fp and "บทความวิจัยตลาด" in fp and "การประกวด" in fp
    out = cms._cms_parse_full('```json\n{"title":"หัว","hero_title_lines":["a","b","c"],"hero_accent_idx":5,'
                              '"excerpt":"e","category":"c","body_md":"# x"}\n```', None)
    assert out["title"] == "หัว" and out["hero_title_lines"] == ["a", "b"] and out["hero_accent_idx"] == 1
    bad = cms._cms_parse_full("ไม่ใช่ json", "cat")
    assert bad["parse_warning"] and bad["body_md"] == "ไม่ใช่ json" and bad["category"] == "cat"
    assert "Thai" in cms._cms_translate_prompt(cms.AITranslateRequest(text="hi", to="th"))
    assert "Source" in cms._cms_summarize_prompt(cms.AISummarizeRequest(sources=[]), "DATA")


@pytest.mark.parametrize("module", ["doc_formatter", "citation_replacer", "citation_style_formatter", "ref_extract"])
def test_doc_libs_import_without_emergentintegrations(module):
    """The four document libs must import on a machine that lacks the package."""
    code = ("import sys; sys.modules['emergentintegrations'] = None; sys.modules['emergentintegrations.llm'] = None; "
            "sys.modules['emergentintegrations.llm.chat'] = None; "
            f"sys.path.insert(0, {str(BACKEND)!r}); import lib.{module} as m; print('ok')")
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=str(BACKEND))
    assert r.returncode == 0 and "ok" in r.stdout, r.stderr


def test_doc_libs_do_not_swallow_policy_refusal():
    """A refusal raised by the guard inside the LLM call must propagate, not become a fallback."""
    import types
    fake = types.ModuleType("emergentintegrations.llm.chat")

    class UserMessage:
        def __init__(self, text=None, **kw):
            self.text = text

    class LlmChat:
        def __init__(self, **kw):
            pass

        def with_model(self, *a):
            return self

        def with_params(self, **kw):
            return self

        async def send_message(self, m):
            raise llm_policy.SystemLLMDisabled("docs.citation")
    fake.LlmChat, fake.UserMessage, fake.ImageContent = LlmChat, UserMessage, object
    saved = {k: sys.modules.get(k) for k in ("emergentintegrations", "emergentintegrations.llm",
                                              "emergentintegrations.llm.chat")}
    pkg = types.ModuleType("emergentintegrations")
    pkg.__path__ = []
    sub = types.ModuleType("emergentintegrations.llm")
    sub.__path__ = []
    sys.modules.update({"emergentintegrations": pkg, "emergentintegrations.llm": sub,
                        "emergentintegrations.llm.chat": fake})
    try:
        from lib.ref_extract import RefExtract
        ex = RefExtract(api_key="k", model="gpt-4o")
        with pytest.raises(llm_policy.SystemLLMDisabled):
            asyncio.run(ex.extract_from_text("Smith, J. (2020). A very long reference title for testing. Journal of X, 1(2), 3-4. " * 3))
    finally:
        for k, v in saved.items():
            if v is None:
                sys.modules.pop(k, None)
            else:
                sys.modules[k] = v


# ---------------------------------------------------------------- static: gate before try
SERVER_GATES = {
    "ai_generate_survey": "survey.ai", "ai_rearrange_content": "content.ai", "translate_text": "translate",
    "generate_journey_map": "journey.ai", "generate_behavior_analysis": "behavior.ai",
    "generate_behavior_image": "behavior.image", "generate_perception_questions": "perception.ai",
    "generate_perception_analysis": "perception.ai", "generate_perception_illustration": "perception.image",
    "find_journals": "docs.journal_finder", "fetch_author_guidelines": "docs.format",
    "replace_citations_with_keys": "docs.citation", "reformat_document_with_ai": "docs.format",
    "test_image_generation": "content.image",
}


def _func(tree, name):
    for n in ast.walk(tree):
        if isinstance(n, (ast.AsyncFunctionDef, ast.FunctionDef)) and n.name == name:
            return n
    raise AssertionError(name)


def _is_require(stmt):
    return (isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Await)
            and isinstance(stmt.value.value, ast.Call)
            and getattr(stmt.value.value.func, "attr", "") == "require_system_llm")


@pytest.mark.parametrize("fn,key", sorted(SERVER_GATES.items()))
def test_server_endpoint_gates_before_try(fn, key):
    tree = ast.parse((BACKEND / "server.py").read_text(encoding="utf-8"))
    f = _func(tree, fn)
    gate_idx = next(i for i, s in enumerate(f.body) if _is_require(s))
    first_try = next((i for i, s in enumerate(f.body) if isinstance(s, ast.Try)), 10 ** 6)
    assert gate_idx < first_try, f"{fn}: require_system_llm must come before the try block"
    call = f.body[gate_idx].value.value
    assert call.args[0].value == key
    # the broad except of the endpoint must let policy refusals through
    src = ast.get_source_segment((BACKEND / "server.py").read_text(encoding="utf-8"), f)
    assert "SystemLLMDisabled" in src or "except HTTPException" in src or fn in ("translate_text",), fn


def test_every_registered_key_used_by_wp5_exists():
    used = set(SERVER_GATES.values()) | {"cv.ai", "cv.image", "cms.ai", "cms.image", "translate",
                                         "docs.ref_extract"}
    assert used <= set(llm_policy.FEATURES)


# ---------------------------------------------------------------- integration (sim app)
@pytest.fixture(scope="module")
def sim():
    import motor.motor_asyncio as mma
    saved_env = dict(os.environ)
    saved_client = mma.AsyncIOMotorClient
    saved_mods = set(sys.modules)
    sys.path.insert(0, str(BACKEND / "scripts"))
    import dev_sim
    calls = []
    dev_sim.install_fake_emergentintegrations(reply=FAKE_JSON_REPLY, calls=calls, with_image_module=True)
    dev_sim.prepare_sim_env(db_name="llm_call_sites_it")
    os.environ.pop("SYSTEM_LLM_DEFAULT", None)
    import server
    from fastapi.testclient import TestClient
    users = asyncio.run(dev_sim.seed_users(server))
    client = TestClient(server.app)

    def login(email, pw):
        r = client.post("/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, r.text
        return {"Authorization": f"Bearer {r.json()['access_token']}"}

    ns = type("Sim", (), {})()
    ns.server, ns.client, ns.calls = server, client, calls
    ns.admin = login(dev_sim.ADMIN_EMAIL, dev_sim.ADMIN_PASSWORD)
    ns.user = login(dev_sim.USER_EMAIL, dev_sim.USER_PASSWORD)
    ns.users = users

    def set_policy(doc):
        asyncio.run(server.db.platform_settings.delete_many({}))
        if doc is not None:
            asyncio.run(server.db.platform_settings.insert_one(dict(doc, id="llm")))
        llm_policy.init(server.db)
    ns.set_policy = set_policy
    yield ns

    llm_policy.init(None)
    mma.AsyncIOMotorClient = saved_client
    os.environ.clear()
    os.environ.update(saved_env)
    # leave a clean slate for the next module that imports the server with its own fake LLM
    for m in [m for m in sys.modules if m not in saved_mods and
              (m == "server" or m.startswith(("emergentintegrations", "routes.")))]:
        del sys.modules[m]


def _docx_b64(paragraphs):
    from docx import Document
    d = Document()
    for p in paragraphs:
        d.add_paragraph(p)
    buf = io.BytesIO()
    d.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def _gated_requests(sim):
    """(label, method, path, json_body, auth, feature)"""
    docx = _docx_b64(["As shown before (Smith, 2020), brands matter."] * 3 + ["References", "Smith, J. (2020). Title of a paper. Journal, 1(2), 3-4."])
    A, U = sim.admin, sim.user
    cid = "no-such-content"
    sid = "no-such-study"
    return [
        ("translate", "POST", "/api/translate", {"text": "hello", "target_language": "th"}, None, "translate"),
        ("survey", "POST", "/api/surveys/ai-generate", {"description": "กาแฟ"}, U, "survey.ai"),
        ("rearrange", "POST", f"/api/content/{cid}/ai-rearrange", None, U, "content.ai"),
        ("journey", "POST", "/api/generate-journey-map", {"raw_data": "x"}, U, "journey.ai"),
        ("behavior", "POST", "/api/generate-behavior-analysis", {"raw_data": "x"}, U, "behavior.ai"),
        ("behavior-img", "POST", "/api/generate-behavior-image", {"analysis_text": "x"}, U, "behavior.image"),
        ("perc-q", "POST", "/api/perception/generate-questions", {"topic": "t"}, U, "perception.ai"),
        ("perc-a", "POST", "/api/perception/generate-analysis", {"interview_data": "t"}, U, "perception.ai"),
        ("perc-img", "POST", "/api/perception/generate-illustration", {"analysis_text": "t"}, U, "perception.image"),
        ("journals", "POST", "/api/journal-finder", {"topic": "t", "abstract": "a", "keywords": "k"}, U, "docs.journal_finder"),
        ("guidelines", "POST", "/api/format-editor/fetch-guidelines", {"journal_name": "J"}, U, "docs.format"),
        ("replace-cit", "POST", "/api/format-editor/replace-citations",
         {"file_base64": docx, "file_name": "a.docx", "bib_content": "@article{smith2020,author={Smith, J.},title={Title of a paper},year={2020},journal={Journal}}"}, U, "docs.citation"),
        ("reformat", "POST", "/api/format-editor/reformat-with-ai",
         {"file_base64": docx, "file_name": "a.docx", "format_style": "APA"}, U, "docs.format"),
        ("img-playground", "POST", "/api/admin/test-image-generation", {"prompt": "p", "model": "nanobanana"}, A, "content.image"),
        ("cv-suggest", "POST", f"/api/cv/studies/{sid}/ai-suggest", {"brand_id": "b", "category": "money"}, U, "cv.ai"),
        ("cv-analysis", "POST", f"/api/cv/studies/{sid}/ai-analysis", None, U, "cv.ai"),
        ("cv-needs", "POST", f"/api/cv/studies/{sid}/ai-needs", {"need": "n"}, U, "cv.ai"),
        ("cv-step", "POST", f"/api/cv/studies/{sid}/ai-step", {"step": "stp"}, U, "cv.ai"),
        ("cv-image", "POST", f"/api/cv/studies/{sid}/generate-image", {"brand_id": "b"}, U, "cv.image"),
        ("cms-text", "POST", "/api/cms/ai/generate-text", {"base_prompt": "x"}, A, "cms.ai"),
        ("cms-full", "POST", "/api/cms/ai/generate-full", {"description": "x"}, A, "cms.ai"),
        ("cms-image", "POST", "/api/cms/ai/generate-image", {"prompt": "x"}, A, "cms.image"),
        ("cms-summ", "POST", "/api/cms/ai/summarize", {"sources": []}, A, "cms.ai"),
        ("cms-trans", "POST", "/api/cms/ai/translate", {"text": "hi", "to": "th"}, A, "translate"),
    ]


@pytest.fixture(autouse=True)
def _clean_generated_templates():
    """fetch-guidelines writes backend/templates/custom/j_template.docx; do not leave it in the repo."""
    yield
    for f in (BACKEND / "templates" / "custom").glob("j_template.docx"):
        f.unlink()


def _call(sim, method, path, body, auth):
    kw = {"headers": auth or {}}
    if body is not None:
        kw["json"] = body
    return sim.client.request(method, path, **kw)


def test_all_gated_endpoints_return_409_when_policy_off(sim):
    sim.set_policy({"system_llm_enabled": False, "features": {}, "admin_bypass": False, "external_hint": "ใช้ ChatGPT"})
    before = len(sim.calls)
    reqs = _gated_requests(sim)
    assert len(reqs) >= 24
    for label, method, path, body, auth, feature in reqs:
        r = _call(sim, method, path, body, auth)
        assert r.status_code == 409, (label, r.status_code, r.text[:200])
        d = r.json()["detail"]
        assert d["code"] == "llm_external_only" and d["feature"] == feature, (label, d)
        assert d["hint"] == "ใช้ ChatGPT"
    assert len(sim.calls) == before, "no LLM call may be made while the policy is off"


def test_gated_endpoints_reach_the_llm_when_policy_on(sim):
    sim.set_policy({"system_llm_enabled": True, "features": {}})
    labels_that_need_data = {"rearrange", "cv-suggest", "cv-analysis", "cv-needs", "cv-step", "cv-image"}
    for label, method, path, body, auth, feature in _gated_requests(sim):
        if label in labels_that_need_data:
            continue  # exercised with real data below
        before = len(sim.calls)
        r = _call(sim, method, path, body, auth)
        assert r.status_code != 409, (label, r.text[:200])
        if label == "cms-summ":
            assert r.status_code == 400  # gate passed; no sources to summarise (needs real data)
            continue
        if label in ("cms-full", "translate", "perc-q", "cms-text", "cms-trans"):
            assert r.status_code == 200, (label, r.status_code, r.text[:300])
        assert len(sim.calls) > before, f"{label}: expected a fake LLM call (status {r.status_code})"


def test_per_feature_override_off_while_master_on(sim):
    sim.set_policy({"system_llm_enabled": True, "features": {"translate": False}})
    r = _call(sim, "POST", "/api/translate", {"text": "hi", "target_language": "th"}, None)
    assert r.status_code == 409 and r.json()["detail"]["feature"] == "translate"
    r = _call(sim, "POST", "/api/perception/generate-questions", {"topic": "t"}, sim.user)
    assert r.status_code == 200
    # CMS translate follows the `translate` key, CMS text follows `cms.ai`
    r = _call(sim, "POST", "/api/cms/ai/translate", {"text": "hi", "to": "th"}, sim.admin)
    assert r.status_code == 409
    r = _call(sim, "POST", "/api/cms/ai/generate-text", {"base_prompt": "x"}, sim.admin)
    assert r.status_code == 200


def test_admin_bypass_lets_admin_use_system_llm(sim):
    sim.set_policy({"system_llm_enabled": False, "features": {}, "admin_bypass": True})
    assert _call(sim, "POST", "/api/cms/ai/generate-text", {"base_prompt": "x"}, sim.admin).status_code == 200
    assert _call(sim, "POST", "/api/perception/generate-questions", {"topic": "t"}, sim.user).status_code == 409


def test_translate_refusal_is_not_a_translation_failed_500(sim):
    """The regression the WP1 agent reproduced: refusal must not become 'Translation failed'."""
    sim.set_policy({"system_llm_enabled": False})
    r = _call(sim, "POST", "/api/translate", {"text": "hi", "target_language": "th"}, None)
    assert r.status_code == 409 and "Translation failed" not in r.text


def test_central_guard_refusal_inside_try_propagates_as_409(sim, monkeypatch):
    """Even if a refusal is raised from INSIDE the endpoint (policy flipped mid-request /
    unannotated path), the broad except must not turn it into a 500."""
    sim.set_policy({"system_llm_enabled": True})
    from emergentintegrations.llm.chat import LlmChat

    async def refuse(self, msg):
        raise llm_policy.SystemLLMDisabled("translate")
    monkeypatch.setattr(LlmChat, "send_message", refuse)
    for path, body, auth in [
        ("/api/translate", {"text": "hi", "target_language": "th"}, None),
        ("/api/perception/generate-questions", {"topic": "t"}, sim.user),
        ("/api/generate-behavior-analysis", {"raw_data": "x"}, sim.user),
        ("/api/generate-journey-map", {"raw_data": "x"}, sim.user),
        ("/api/cms/ai/generate-text", {"base_prompt": "x"}, sim.admin),
        ("/api/cms/ai/translate", {"text": "hi", "to": "en"}, sim.admin),
    ]:
        r = _call(sim, "POST", path, body, auth)
        assert r.status_code == 409, (path, r.status_code, r.text[:200])
        assert r.json()["detail"]["code"] == "llm_external_only"


# ---- customer value (real study) ------------------------------------------------
def _make_cv_study(sim):
    r = sim.client.post("/api/cv/studies", headers=sim.user, json={"title": "ร้านกาแฟ", "industry": "food"})
    assert r.status_code == 200, r.text
    return r.json()


def test_cv_endpoints_with_policy_on_and_external_flow(sim):
    sim.set_policy({"system_llm_enabled": True})
    study = _make_cv_study(sim)
    sid = study["id"]
    brand_id = study["brands"][0]["id"]
    base = f"/api/cv/studies/{sid}"
    before = len(sim.calls)
    r = sim.client.post(f"{base}/ai-suggest", headers=sim.user, json={"brand_id": brand_id, "category": "money"})
    assert r.status_code == 200 and r.json()["suggestions"][0]["label"] == "ที่จอดรถเพียงพอ"
    r = sim.client.post(f"{base}/ai-analysis", headers=sim.user)
    assert r.status_code == 200 and r.json()["analysis"]
    r = sim.client.post(f"{base}/ai-needs", headers=sim.user, json={"need": "หิว"})
    assert r.status_code == 200 and r.json()["result"]["need"] == "n"
    r = sim.client.post(f"{base}/ai-step", headers=sim.user, json={"step": "stp"})
    assert r.status_code == 200 and r.json()["result"]["summary"] == "s"
    r = sim.client.post(f"{base}/generate-image", headers=sim.user, json={"brand_id": brand_id})
    assert r.status_code == 200 and r.json()["image_url"]
    assert len(sim.calls) - before == 5

    # the prompt the system sent == the prompt external-prompt returns (same builder)
    sent = [c for c in sim.calls[before:] if c["kind"] == "chat"]
    sim.set_policy({"system_llm_enabled": False})   # external-prompt works with the switch OFF
    r = sim.client.post(f"{base}/ai-suggest/external-prompt", headers=sim.user,
                        json={"brand_id": brand_id, "category": "money"})
    assert r.status_code == 200, r.text
    pay = r.json()
    assert pay["feature"] == "cv.ai" and pay["expected_format"] == "json"
    part = pay["parts"][0]
    assert part["key"] == "main" and part["system_prompt"] and part["json_example"]
    assert sent[0]["prompt"] == part["prompt"][:200]
    r = sim.client.post(f"{base}/ai-analysis/external-prompt", headers=sim.user)
    assert r.status_code == 200 and "Net Value" in r.json()["parts"][0]["prompt"]
    assert sim.client.get(f"{base}/ai-analysis/external-prompt", headers=sim.user).status_code == 200
    assert sent[1]["prompt"] == r.json()["parts"][0]["prompt"][:200]
    r = sim.client.post(f"{base}/ai-needs/external-prompt", headers=sim.user, json={"need": "หิว"})
    assert r.status_code == 200 and "หิว" in r.json()["parts"][0]["prompt"]
    r = sim.client.post(f"{base}/ai-step/external-prompt", headers=sim.user, json={"step": "fourps"})
    assert r.status_code == 200 and "4Ps" in r.json()["parts"][0]["prompt"]
    assert sim.client.post(f"{base}/ai-step/external-prompt", headers=sim.user, json={"step": "zzz"}).status_code == 400
    r = sim.client.post(f"{base}/generate-image/external-prompt", headers=sim.user, json={"brand_id": brand_id})
    assert r.status_code == 200 and r.json()["expected_format"] == "image-prompt"
    # ownership still enforced
    other = sim.admin  # admin may; a different non-owner may not -> use a bogus id
    assert sim.client.post(f"/api/cv/studies/nope/ai-analysis/external-prompt", headers=other).status_code == 404

    # imports: parse-only for suggestions/needs/step, stored for analysis
    r = sim.client.post(f"{base}/ai-suggest/external-import", headers=sim.user,
                        json={"brand_id": brand_id, "category": "money", "content": "```json\n" + FAKE_JSON_REPLY + "\n```",
                              "model_label": "ChatGPT 5"})
    assert r.status_code == 200 and r.json()["suggestions"] and r.json()["source"] == "external"
    r = sim.client.post(f"{base}/ai-suggest/external-import", headers=sim.user,
                        json={"brand_id": brand_id, "category": "money", "content": "ขอโทษ ทำไม่ได้"})
    assert r.status_code == 422
    r = sim.client.post(f"{base}/ai-needs/external-import", headers=sim.user, json={"content": FAKE_JSON_REPLY})
    assert r.status_code == 200 and r.json()["result"]["want"] == "w"
    assert sim.client.post(f"{base}/ai-needs/external-import", headers=sim.user, json={"content": "no json here at all"}).status_code == 422
    r = sim.client.post(f"{base}/ai-step/external-import", headers=sim.user, json={"step": "stp", "content": FAKE_JSON_REPLY})
    assert r.status_code == 200 and r.json()["result"]["checklist"]
    md = "## วิเคราะห์\n" + "ข้อความวิเคราะห์ " * 10
    r = sim.client.post(f"{base}/ai-analysis/external-import", headers=sim.user,
                        json={"content": md, "model_label": "Claude"})
    assert r.status_code == 200 and r.json()["analysis"] == md.strip() and r.json()["model_label"] == "Claude"
    stored = asyncio.run(sim.server.db.cv_studies.find_one({"id": sid}, {"_id": 0}))
    assert stored["ai_analysis"] == md.strip() and stored["ai_analysis_source"]["source"] == "external"
    assert sim.client.post(f"{base}/ai-analysis/external-import", headers=sim.user, json={"content": " "}).status_code == 422


def test_cv_policy_off_gate_runs_before_study_lookup(sim):
    sim.set_policy({"system_llm_enabled": False})
    study = _make_cv_study(sim)
    r = sim.client.post(f"/api/cv/studies/{study['id']}/ai-analysis", headers=sim.user)
    assert r.status_code == 409
    stored = asyncio.run(sim.server.db.cv_studies.find_one({"id": study["id"]}, {"_id": 0}))
    assert not stored.get("ai_analysis"), "nothing may be written when refused"


# ---- CMS -------------------------------------------------------------------------
def test_cms_external_prompts_match_system_prompts(sim):
    sim.set_policy({"system_llm_enabled": True})
    before = len(sim.calls)
    assert sim.client.post("/api/cms/ai/generate-text", headers=sim.admin,
                           json={"base_prompt": "เขียนข่าวงานเลี้ยง", "extra_prompt": "สั้น"}).status_code == 200
    assert sim.client.post("/api/cms/ai/translate", headers=sim.admin, json={"text": "สวัสดี", "to": "en"}).status_code == 200
    sent = [c for c in sim.calls[before:] if c["kind"] == "chat"]
    sim.set_policy({"system_llm_enabled": False})
    r = sim.client.post("/api/cms/ai/generate-text/external-prompt", headers=sim.admin,
                        json={"base_prompt": "เขียนข่าวงานเลี้ยง", "extra_prompt": "สั้น"})
    assert r.status_code == 200
    assert sent[0]["prompt"] == r.json()["parts"][0]["prompt"][:200]
    assert r.json()["feature"] == "cms.ai"
    r = sim.client.post("/api/cms/ai/translate/external-prompt", headers=sim.admin, json={"text": "สวัสดี", "to": "en"})
    assert r.status_code == 200 and r.json()["feature"] == "translate"
    assert sent[1]["prompt"] == r.json()["parts"][0]["prompt"][:200]
    assert "English" in r.json()["parts"][0]["prompt"]
    # non-admin refused
    assert sim.client.post("/api/cms/ai/translate/external-prompt", headers=sim.user,
                           json={"text": "x", "to": "en"}).status_code == 403
    r = sim.client.post("/api/cms/ai/generate-image/external-prompt", headers=sim.admin, json={"prompt": "ร้านกาแฟ"})
    assert r.status_code == 200 and "ร้านกาแฟ" in r.json()["parts"][0]["prompt"]
    assert sim.client.post("/api/cms/ai/summarize/external-prompt", headers=sim.admin,
                           json={"sources": []}).status_code == 400
    r = sim.client.post("/api/cms/ai/generate-full/external-prompt", headers=sim.admin,
                        json={"description": "งานประกวด", "post_type": "insight"})
    assert r.status_code == 200 and r.json()["expected_format"] == "json" and "งานประกวด" in r.json()["parts"][0]["prompt"]
    assert sim.client.post("/api/cms/ai/generate-full/external-prompt", headers=sim.admin,
                           json={"description": "  "}).status_code == 400


def test_cms_generate_full_external_import(sim):
    sim.set_policy({"system_llm_enabled": False})
    body = {"title": "หัวข้อ", "hero_title_lines": ["บรรทัดหนึ่ง", "บรรทัดสอง"], "hero_accent_idx": 0,
            "excerpt": "สรุป", "category": "การประกวด", "body_md": "# เนื้อหา"}
    r = sim.client.post("/api/cms/ai/generate-full/external-import", headers=sim.admin,
                        json={"content": "นี่คือคำตอบ:\n```json\n" + json.dumps(body, ensure_ascii=False) + "\n```",
                              "model_label": "Gemini"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["title"] == "หัวข้อ" and out["hero_title_lines"] == body["hero_title_lines"]
    assert out["source"] == "external" and out["model_label"] == "Gemini"
    assert sim.client.post("/api/cms/ai/generate-full/external-import", headers=sim.admin,
                           json={"content": "ไม่ใช่ JSON เลยนะครับ ขอโทษที"}).status_code == 422
    assert sim.client.post("/api/cms/ai/generate-full/external-import", headers=sim.user,
                           json={"content": "{}"}).status_code == 403


# ---- server.py external-prompt / import -------------------------------------------
def test_translate_external_prompt_is_anonymous_and_matches(sim):
    sim.set_policy({"system_llm_enabled": True})
    before = len(sim.calls)
    r = sim.client.post("/api/translate", json={"text": "สวัสดีครับ", "target_language": "en"})
    assert r.status_code == 200
    sent = sim.calls[before]
    sim.set_policy({"system_llm_enabled": False})
    r = sim.client.post("/api/translate/external-prompt", json={"text": "สวัสดีครับ", "target_language": "en"})
    assert r.status_code == 200
    part = r.json()["parts"][0]
    assert sent["prompt"] == part["prompt"][:200] and "English" in part["system_prompt"]
    assert r.json()["filename"].endswith(".md") and r.json()["instructions_th"]


def test_survey_external_prompt_and_import(sim):
    sim.set_policy({"system_llm_enabled": True})
    before = len(sim.calls)
    sim.client.post("/api/surveys/ai-generate", headers=sim.user, json={"description": "ร้านกาแฟ", "target_language": "th"})
    sent = sim.calls[before]
    sim.set_policy({"system_llm_enabled": False})
    req = {"description": "ร้านกาแฟ", "target_language": "th"}
    r = sim.client.post("/api/surveys/ai-generate/external-prompt", headers=sim.user, json=req)
    assert r.status_code == 200, r.text
    assert sent["prompt"] == r.json()["parts"][0]["prompt"][:200]
    assert r.json()["expected_format"] == "yaml"
    r = sim.client.post("/api/surveys/ai-generate/external-import", headers=sim.user,
                        json={"content": "```yaml\n" + SDL_YAML + "```", "model_label": "ChatGPT 5"})
    assert r.status_code == 200, r.text
    survey = r.json()
    assert survey["title"] == "ความพึงพอใจร้านกาแฟ" and survey["sections"][0]["questions"]
    stored = asyncio.run(sim.server.db.surveys.find_one({"id": survey["id"]}, {"_id": 0}))
    assert stored["source"] == "external" and stored["model_label"] == "ChatGPT 5"
    assert stored["created_by"] == sim.users["current_student"]["id"]
    r = sim.client.post("/api/surveys/ai-generate/external-import", headers=sim.user,
                        json={"content": "ขอโทษ ฉันทำแบบสอบถามให้ไม่ได้ครับ ลองใหม่อีกครั้งนะ ขอบคุณมาก"})
    assert r.status_code == 422 and r.json()["detail"]


def test_journey_map_external_prompt_and_import(sim):
    sim.set_policy({"system_llm_enabled": False})
    req = {"raw_data": "ลูกค้าเล่าว่า...", "target_language": "th", "journey_type": "A", "journey_style": "linear"}
    r = sim.client.post("/api/generate-journey-map/external-prompt", headers=sim.user, json=req)
    assert r.status_code == 200
    part = r.json()["parts"][0]
    assert "ลูกค้าเล่าว่า" in part["prompt"] and "Mermaid" in part["system_prompt"] + part["prompt"]
    text = "ANALYSIS:\nสรุปการเดินทาง\n\nMERMAID:\n```mermaid\ngraph TD\n  A-->B\n```"
    r = sim.client.post("/api/generate-journey-map/external-import", headers=sim.user,
                        json={"content": text, "raw_data": "ลูกค้าเล่าว่า...", "model_label": "Claude"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["mermaid_code"].startswith("graph TD") and out["analysis_summary"] == "สรุปการเดินทาง"
    assert out["qualitative_run_id"]
    stored = asyncio.run(sim.server.db.qualitative_runs.find_one({"id": out["qualitative_run_id"]}, {"_id": 0}))
    assert stored["source"] == "external" and stored["owner_id"] == sim.users["current_student"]["id"]
    r = sim.client.post("/api/generate-journey-map/external-import", headers=sim.user,
                        json={"content": "ไม่มีแผนภาพอะไรเลยในคำตอบนี้ ขอโทษด้วยครับ", "raw_data": "x"})
    assert r.status_code == 422


def test_behavior_and_perception_external_prompts(sim):
    sim.set_policy({"system_llm_enabled": False})
    r = sim.client.post("/api/generate-behavior-analysis/external-prompt", headers=sim.user,
                        json={"raw_data": "ซื้อกาแฟทุกเช้า", "target_language": "th"})
    assert r.status_code == 200 and "ซื้อกาแฟทุกเช้า" in r.json()["parts"][0]["prompt"]
    assert r.json()["parts"][0]["system_prompt"]
    r = sim.client.post("/api/perception/generate-questions/external-prompt", headers=sim.user,
                        json={"topic": "แบรนด์ A", "perspective": "ความน่าเชื่อถือ"})
    assert r.status_code == 200 and "แบรนด์ A" in r.json()["parts"][0]["prompt"]
    r = sim.client.post("/api/perception/generate-analysis/external-prompt", headers=sim.user,
                        json={"interview_data": "ผู้ให้ข้อมูลคนที่ 1 ..."})
    assert r.status_code == 200 and "ผู้ให้ข้อมูลคนที่ 1" in r.json()["parts"][0]["prompt"]
    assert r.json()["feature"] == "perception.ai"


# ---- documents: gate cleanly / degrade gracefully ----------------------------------
def test_analyze_file_degrades_gracefully_when_off_and_uses_llm_when_on(sim):
    docx = _docx_b64(["Intro text about marketing (Smith, 2020)."] * 5 +
                     ["References", "Smith, J. (2020). Title of a paper about brands. Journal of Marketing, 1(2), 3-4. " * 2])
    sim.set_policy({"system_llm_enabled": False})
    before = len(sim.calls)
    r = sim.client.post("/api/format-editor/analyze-file", json={"file_base64": docx, "file_name": "a.docx"})
    assert r.status_code == 200, r.text
    assert r.json()["word_count"] > 0 and r.json()["bib_content"] is None
    assert len(sim.calls) == before, "no LLM call while off: structure analysis still works"
    sim.set_policy({"system_llm_enabled": True})
    r = sim.client.post("/api/format-editor/analyze-file", json={"file_base64": docx, "file_name": "a.docx"})
    assert r.status_code == 200
    assert len(sim.calls) > before, "reference extraction should reach the (fake) LLM when allowed"


def test_format_with_journal_name_skips_detection_when_off(sim):
    sim.set_policy({"system_llm_enabled": False})
    before = len(sim.calls)
    r = sim.client.post("/api/format-editor/format", headers=sim.user,
                        json={"original_text": "ทดสอบ (Smith, 2020)", "journal_name": "Journal of Marketing",
                              "format_style": "APA"})
    assert r.status_code != 409, r.text
    assert len(sim.calls) == before
