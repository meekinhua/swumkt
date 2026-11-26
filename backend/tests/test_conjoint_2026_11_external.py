"""External-LLM workflow for every conjoint AI feature (plan §B, 2026-11).

Runs the real `routes/conjoint.py` router under FastAPI's TestClient with an
in-memory Mongo (mongomock-motor) and the real `lib/llm_policy`. Needs neither
a MongoDB server, nor an LLM key, nor `emergentintegrations`.

The `server` module is replaced by a small stub while the router factory runs
(it only reads User/UserRole/ConjointSurveyResponse/compress_base64_image/
initialize_default_prompts from it).
"""
import asyncio
import io
import os
import sys
import types
import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.chdir(os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pydantic import BaseModel  # noqa: E402

mongomock_motor = pytest.importorskip("mongomock_motor")

from routes import conjoint as CJ  # noqa: E402
from lib import llm_policy  # noqa: E402


# ---------------------------------------------------------------------------
# app fixture
# ---------------------------------------------------------------------------
class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"


class User(BaseModel):
    id: str
    full_name: str = "Test User"
    email: str = "t@example.com"
    role: UserRole = UserRole.USER
    can_export_thesis: bool = False


class ConjointSurveyResponse(BaseModel):
    study_id: str
    respondent_id: Optional[str] = None
    respondent_email: Optional[str] = None
    responses: List[Dict[str, Any]]
    demographics: Optional[Dict[str, Any]] = None
    duration_sec: Optional[int] = 0


USERS = {
    "owner": User(id="owner", can_export_thesis=True),
    "owner_nowl": User(id="owner_nowl"),
    "stranger": User(id="stranger", can_export_thesis=True),
    "admin": User(id="admin", role=UserRole.ADMIN),
}

DEFAULT_QUAL_PROMPT = {
    "id": "conjoint-qualitative-analysis",
    "system_message": "You are an expert marketing researcher specializing in Conjoint Analysis.",
    "prompt_template": "Analyze:\n{combined_data}\nOutput JSON {{\"attributes\": []}}. Respond in {target_language}.",
    "model_provider": "anthropic",
    "model_name": "claude-sonnet-4-20250514",
}


@pytest.fixture(scope="module")
def env():
    os.environ.pop("SYSTEM_LLM_DEFAULT", None)
    client_db = mongomock_motor.AsyncMongoMockClient()["cj_test"]

    stub = types.ModuleType("server")
    stub.User = User
    stub.UserRole = UserRole
    stub.ConjointSurveyResponse = ConjointSurveyResponse
    stub.compress_base64_image = lambda b, **k: b

    async def _init_prompts():
        if not await client_db.llm_prompts.find_one({"id": DEFAULT_QUAL_PROMPT["id"]}):
            await client_db.llm_prompts.insert_one(dict(DEFAULT_QUAL_PROMPT))
    stub.initialize_default_prompts = _init_prompts

    async def get_current_user(x_user: Optional[str] = Header(None)):
        if x_user not in USERS:
            raise HTTPException(status_code=401, detail="no auth")
        return USERS[x_user]

    async def get_current_user_optional(x_user: Optional[str] = Header(None)):
        return USERS.get(x_user)

    saved = sys.modules.get("server")
    sys.modules["server"] = stub
    try:
        # A fresh router: the module-level APIRouter would otherwise collect
        # duplicate routes if another test module already ran the factory.
        CJ.conjoint_router = CJ.APIRouter(tags=["conjoint"])
        router = CJ.get_conjoint_routes(client_db, get_current_user, get_current_user_optional)
    finally:
        if saved is not None:
            sys.modules["server"] = saved
        else:
            sys.modules.pop("server", None)
    app = FastAPI()
    app.include_router(router, prefix="/api")
    llm_policy.init(client_db)
    return TestClient(app), client_db


def H(user):
    return {"X-User": user}


# ---------------------------------------------------------------------------
# synthetic study with KNOWN utilities (numeric price → WTP is defined)
# ---------------------------------------------------------------------------
def build_study(n_resp=60, n_sets=8, alts=3, seed=5, public=False):
    attrs = [
        CJ.ConjointAttribute(id="brand", name="Brand", levels=[
            CJ.AttributeLevel(id="b0", value="A"), CJ.AttributeLevel(id="b1", value="B"),
            CJ.AttributeLevel(id="b2", value="C")]),
        CJ.ConjointAttribute(id="price", name="ราคา", levels=[
            CJ.AttributeLevel(id="p0", value="฿100"), CJ.AttributeLevel(id="p1", value="฿150"),
            CJ.AttributeLevel(id="p2", value="฿200")]),
        CJ.ConjointAttribute(id="qual", name="Quality", levels=[
            CJ.AttributeLevel(id="q0", value="Good"), CJ.AttributeLevel(id="q1", value="Bad")]),
    ]
    sets = asyncio.run(CJ.generate_d_optimal_design(attrs, alts, n_sets))
    sid = str(uuid.uuid4())
    study = {
        "id": sid, "title": "ชาเขียว CBC", "description": "ทดสอบ", "product_category": "drink",
        "creator_id": "owner", "status": "active", "is_public_result": public,
        "attributes": [a.model_dump() for a in attrs], "choice_sets": [c.model_dump() for c in sets],
        "alternatives_per_set": alts, "design_method": "d-optimal",
        "demographics_to_capture": ["gender"], "respondent_count": n_resp,
    }
    u = {"b0": 0.6, "b1": 0.3, "b2": 0.0, "p0": 0.0, "p1": -1.0, "p2": -2.0, "q0": 1.0, "q1": 0.0}
    rng = np.random.default_rng(seed)
    t0 = datetime(2026, 11, 1, tzinfo=timezone.utc)
    responses = []
    for r in range(n_resp):
        ch = []
        for cs in study["choice_sets"]:
            v = np.array([sum(u[l] for l in p["attribute_levels"].values()) for p in cs["profiles"]])
            ch.append({"choice_set_id": cs["id"],
                       "selected_profile_id": cs["profiles"][int(np.argmax(v + rng.gumbel(size=len(v))))]["id"]})
        responses.append({"id": f"resp{r}", "study_id": sid, "respondent_id": f"r{r}", "responses": ch,
                          "demographics": {"gender": "F" if r % 2 else "M"},
                          "duration_sec": int(rng.integers(90, 300)),
                          "submitted_at": t0 + timedelta(hours=r)})
    return study, responses


@pytest.fixture()
def seeded(env):
    client, db = env

    async def _seed(study, responses):
        for c in ("conjoint_studies", "conjoint_responses", "analysis_cache", "platform_settings",
                  "ai_interp_jobs", "thesis_jobs"):
            await db[c].delete_many({})
        await db.conjoint_studies.insert_one(dict(study))
        await db.conjoint_responses.insert_many([dict(r) for r in responses])
        return study, responses

    def seed(**kw):
        study, responses = build_study(**kw)
        out = asyncio.run(_seed(study, responses))
        llm_policy.invalidate_cache()
        return out
    return client, db, seed


def set_policy(db, **doc):
    async def _s():
        await db.platform_settings.delete_many({})
        await db.platform_settings.insert_one({"id": "llm", **doc})
    asyncio.run(_s())
    llm_policy.invalidate_cache()


def assert_external_only(resp):
    assert resp.status_code == 409, resp.text
    d = resp.json()["detail"]
    assert d["code"] == "llm_external_only"
    assert d["message"]


# ===========================================================================
# a. system-LLM paths are refused with llm_external_only when the switch is off
# ===========================================================================
SYSTEM_PATHS = [
    ("post", "/ai-interpretation", {"method": "mnl"}),
    ("post", "/export-thesis", {"methods": ["mnl"], "chapters": [3, 4]}),
    ("post", "/qualitative-analysis", {"qualitative_data": [{"type": "interview", "content": "ราคาสำคัญ"}]}),
    ("post", "/generate-images", None),
    ("post", "/generate-single-image", {"attribute_id": "brand", "level_id": "b0"}),
    ("post", "/generate-product-from-results", {}),
    ("post", "/generate-shelf-simulation", {"product_image_url": "data:image/png;base64,AAAA",
                                            "environment_type": "auto"}),
]


@pytest.mark.parametrize("method,path,body", SYSTEM_PATHS)
def test_system_paths_refused_when_policy_off(seeded, method, path, body):
    client, db, seed = seeded
    study, _ = seed()
    r = getattr(client, method)(f"/api/conjoint/studies/{study['id']}{path}", json=body, headers=H("owner"))
    assert_external_only(r)


def test_profile_image_refused_when_policy_off(seeded):
    client, db, seed = seeded
    study, _ = seed()
    cs = study["choice_sets"][0]
    r = client.post(f"/api/conjoint/studies/{study['id']}/generate-profile-image",
                    json={"choice_set_id": cs["id"], "profile_id": cs["profiles"][0]["id"]}, headers=H("owner"))
    assert_external_only(r)


def test_refusal_happens_before_any_job_is_created(seeded):
    client, db, seed = seeded
    study, _ = seed()
    client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation", json={"method": "mnl"}, headers=H("owner"))
    client.post(f"/api/conjoint/studies/{study['id']}/export-thesis", json={"methods": ["mnl"]}, headers=H("owner"))

    async def counts():
        return await db.ai_interp_jobs.count_documents({}), await db.thesis_jobs.count_documents({})
    assert asyncio.run(counts()) == (0, 0)


def test_policy_on_creates_job_and_failure_is_recorded_not_swallowed(seeded):
    """With the switch ON the job starts; without emergentintegrations the
    background call fails and the job records that error (and no cache row)."""
    client, db, seed = seeded
    study, _ = seed()
    set_policy(db, system_llm_enabled=True)
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation", json={"method": "counting"},
                    headers=H("owner"))
    assert r.status_code == 200 and r.json()["status"] == "processing"
    job = client.get(f"/api/conjoint/studies/{study['id']}/ai-interpretation-status/{r.json()['job_id']}",
                     headers=H("owner")).json()
    assert job["status"] == "failed"


def test_policy_turned_off_between_request_and_job_reports_external_only(seeded, monkeypatch):
    client, db, seed = seeded
    study, _ = seed()
    calls = {"n": 0}
    real = llm_policy.require_system_llm

    async def flip(feature, user=None):
        calls["n"] += 1
        if calls["n"] > 1:   # the background re-check
            raise HTTPException(status_code=409, detail=llm_policy.error_detail(feature))
        return None
    monkeypatch.setattr(llm_policy, "require_system_llm", flip)
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation", json={"method": "counting"},
                    headers=H("owner"))
    job = client.get(f"/api/conjoint/studies/{study['id']}/ai-interpretation-status/{r.json()['job_id']}",
                     headers=H("owner")).json()
    monkeypatch.setattr(llm_policy, "require_system_llm", real)
    assert job["status"] == "failed" and job["error_code"] == "llm_external_only"
    assert "AI" in job["error"] or job["error"]


def test_policy_error_inside_broad_except_is_not_turned_into_500(seeded, monkeypatch):
    """The central guard raising SystemLLMDisabled deep inside an image call must
    surface as the policy error, not 'Image generation failed'."""
    client, db, seed = seeded
    study, _ = seed()
    assert CJ._is_policy_error(llm_policy.SystemLLMDisabled("conjoint.images"))
    assert CJ._is_policy_error(HTTPException(409, detail=llm_policy.error_detail("x")))
    assert not CJ._is_policy_error(RuntimeError("boom"))
    assert CJ._job_error_fields(llm_policy.SystemLLMDisabled("conjoint.thesis"))["error_code"] == "llm_external_only"


# ===========================================================================
# b/c. interpretation: external-prompt == system prompt; import → same cache
# ===========================================================================
def test_interpretation_external_prompt_matches_system_builder(seeded):
    client, db, seed = seeded
    study, responses = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-prompt",
                    json={"method": "mnl"}, headers=H("owner"))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["feature"] == "conjoint.interpretation" and body["expected_format"] == "markdown"
    part = body["parts"][0]
    summary = asyncio.run(CJ._prepare_analysis_summary(study, responses, "mnl", False))
    sys_msg, prompt = CJ._build_interpretation_prompt(CJ._humanize_internal_labels(summary))
    assert part["system_prompt"] == sys_msg
    assert part["prompt"] == prompt
    assert "Brand" in part["prompt"]            # data embedded, self-contained
    assert body["filename"].endswith(".md")
    # Legacy generate-prompt uses the same builder.
    legacy = client.post(f"/api/conjoint/studies/{study['id']}/generate-prompt", json={"method": "mnl"},
                         headers=H("owner")).json()
    assert prompt in legacy["prompt"]


def test_interpretation_external_prompt_works_with_policy_off(seeded):
    client, db, seed = seeded
    study, _ = seed()
    set_policy(db, system_llm_enabled=False)
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-prompt",
                    json={"method": "counting", "compare_all": False}, headers=H("owner"))
    assert r.status_code == 200


def test_interpretation_import_is_served_from_the_same_cache_when_llm_off(seeded):
    client, db, seed = seeded
    study, _ = seed()
    text = "```markdown\n## สรุปผล\nคุณลักษณะที่สำคัญที่สุดคือราคา ผู้บริโภคชอบราคาต่ำ และให้ความสำคัญกับคุณภาพรองลงมา\n```"
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-import",
                    json={"method": "mnl", "compare_all": False, "content": text, "model_label": "ChatGPT-5"},
                    headers=H("owner"))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["source"] == "external" and out["model_label"] == "ChatGPT-5"
    assert out["interpretation"].startswith("## สรุปผล")      # fence stripped
    assert out["summary_data"]["method"] == "mnl"

    row = asyncio.run(db.analysis_cache.find_one({"study_id": study["id"], "method": "ai_mnl_single"}))
    assert row["schema_version"] == CJ.ANALYSIS_CACHE_VERSION
    assert row["respondent_count"] == study["respondent_count"]
    assert row["results"]["imported_by"] == "owner"

    # System path with the LLM OFF: the cached (external) text is still readable.
    r2 = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation", json={"method": "mnl"},
                     headers=H("owner"))
    assert r2.status_code == 200 and r2.json()["cached"] is True
    assert r2.json()["source"] == "external"
    # A different method variant is a different key → still refused.
    assert_external_only(client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation",
                                     json={"method": "mnl", "compare_all": True}, headers=H("owner")))


def test_interpretation_import_invalidates_like_system_rows(seeded):
    """A new respondent bumps respondent_count → the imported row is a miss, like a system row."""
    client, db, seed = seeded
    study, _ = seed()
    client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-import",
                json={"method": "counting", "content": "x" * 80}, headers=H("owner"))
    asyncio.run(db.conjoint_studies.update_one({"id": study["id"]}, {"$inc": {"respondent_count": 1}}))
    assert_external_only(client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation",
                                     json={"method": "counting"}, headers=H("owner")))


def test_interpretation_import_rejects_empty_and_strangers(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-import",
                    json={"method": "mnl", "content": "  สั้น "}, headers=H("owner"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "external_import_invalid"
    r = client.post(f"/api/conjoint/studies/{study['id']}/ai-interpretation/external-import",
                    json={"method": "mnl", "content": "y" * 100}, headers=H("stranger"))
    assert r.status_code == 403


# ===========================================================================
# qualitative (JSON feature)
# ===========================================================================
def test_qualitative_external_prompt_and_tolerant_json_import(seeded):
    client, db, seed = seeded
    study, _ = seed()
    qd = [{"type": "interview", "content": "ลูกค้าบอกว่าราคาและรสชาติสำคัญ"}]
    p = client.post(f"/api/conjoint/studies/{study['id']}/qualitative-analysis/external-prompt",
                    json={"qualitative_data": qd, "target_language": "th"}, headers=H("owner"))
    assert p.status_code == 200, p.text
    part = p.json()["parts"][0]
    assert p.json()["expected_format"] == "json" and part["json_example"]
    built = CJ._build_qualitative_prompt(DEFAULT_QUAL_PROMPT, [CJ.QualitativeInput(**qd[0])], "th")
    assert part["prompt"] == built["prompt"] and part["system_prompt"] == built["system_message"]
    assert "ราคาและรสชาติ" in part["prompt"]

    pasted = ('นี่คือผลลัพธ์ครับ:\n```json\n{"attributes": [{"name": "ราคา", "levels": '
              '[{"value": "59 บาท"}, {"value": "79 บาท"},]}], "recommendations": "ทดสอบ"}\n```\nหวังว่าจะช่วยได้')
    r = client.post(f"/api/conjoint/studies/{study['id']}/qualitative-analysis/external-import",
                    json={"content": pasted, "model_label": "Claude", "qualitative_data": qd}, headers=H("owner"))
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["suggested_attributes"][0]["name"] == "ราคา"
    assert [l["value"] for l in out["suggested_attributes"][0]["levels"]] == ["59 บาท", "79 บาท"]
    assert out["source"] == "external"
    doc = asyncio.run(db.conjoint_studies.find_one({"id": study["id"]}))
    assert doc["suggested_attributes"][0]["name"] == "ราคา"
    assert doc["llm_analysis"]["source"] == "external" and doc["llm_analysis"]["model_label"] == "Claude"
    assert doc["qualitative_data"][0]["content"] == qd[0]["content"]


def test_qualitative_import_clear_thai_error_on_garbage(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/qualitative-analysis/external-import",
                    json={"content": "ขอโทษครับ ผมทำไม่ได้"}, headers=H("owner"))
    assert r.status_code == 422
    assert "JSON" in r.json()["detail"]["message"]
    r = client.post(f"/api/conjoint/studies/{study['id']}/qualitative-analysis/external-import",
                    json={"content": '{"foo": 1}'}, headers=H("owner"))
    assert r.status_code == 422 and "attributes" in r.json()["detail"]["message"]


# ===========================================================================
# d. thesis: external prompt / pack / import → .docx with disclosure; no-AI doc
# ===========================================================================
def _docx_text(content: bytes) -> str:
    from docx import Document
    d = Document(io.BytesIO(content))
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            parts.append(" | ".join(c.text for c in row.cells))
    return "\n".join(parts)


def test_thesis_external_prompt_is_the_system_prompt_per_chapter(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/external-prompt",
                    json={"methods": ["mnl"], "chapters": [3, 4, 5]}, headers=H("owner"))
    assert r.status_code == 200, r.text
    b = r.json()
    assert [p["key"] for p in b["parts"]] == ["ch3", "ch4", "ch5"]
    ch3 = b["parts"][0]["prompt"]
    # Chapter 3 now carries the fielded design, not a generic "random assignment".
    assert "Full-profile, random assignment" not in ch3
    assert "จำนวนชุดคำถาม (choice tasks) ต่อผู้ตอบ: 8" in ch3
    assert "ไม่ได้สุ่มลำดับ" in ch3
    # Chapter 4 receives the demographics it asks the writer to describe.
    assert "เพศ" in b["parts"][1]["prompt"] and "30 คน" in b["parts"][1]["prompt"]
    assert b["cache_key"] == "thesis_mnl_3_4_5"


def test_thesis_external_pack_contains_tables_prompts_and_steps(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/external-pack",
                    json={"methods": ["mnl", "counting"], "chapters": [3, 4, 5]}, headers=H("owner"))
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    md = r.text
    for needle in ("ขั้นตอนการใช้งาน", "ข้อเท็จจริงของการศึกษา", "ตารางผลการวิเคราะห์",
                   "| คุณลักษณะ | ระดับ | β | SE | z | p | 95% CI |", "McFadden ρ²",
                   "สมการของวิธีที่ใช้", "พรอมต์บทที่ 3", "พรอมต์บทที่ 5", "คำสั่งระบบ",
                   "ความเต็มใจจ่าย", "Krinsky"):
        assert needle in md, needle


def test_thesis_external_import_renders_docx_with_disclosure(seeded):
    client, db, seed = seeded
    study, _ = seed()
    base = {"methods": ["mnl"], "chapters": [3, 4]}
    ch3 = "## บทที่ 3 ระเบียบวิธีวิจัย\n\n" + "เนื้อหาบทที่สามที่เขียนด้วย AI ภายนอก " * 6
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/external-import",
                    json={**base, "part_key": "ch3", "content": ch3, "model_label": "Gemini 2.5 Pro"},
                    headers=H("owner"))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "partial" and r.json()["chapters_missing"] == [4]
    ch4 = "## บทที่ 4 ผลการศึกษา\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n" + "ผลการศึกษา " * 20
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/external-import",
                    json={**base, "parts": [{"part_key": "4", "content": ch4}], "model_label": "Gemini 2.5 Pro"},
                    headers=H("owner"))
    assert r.json()["status"] == "ready" and r.json()["chapters_present"] == [3, 4]

    # With the system LLM off, export-thesis now reports the cached (external) doc as ready.
    s = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis", json=base, headers=H("owner")).json()
    assert s["status"] == "ready" and s["source"] == "external"

    d = client.get(f"/api/conjoint/studies/{study['id']}/export-thesis-download",
                   params={"cache_key": r.json()["cache_key"]}, headers=H("owner"))
    assert d.status_code == 200
    text = _docx_text(d.content)
    assert "การเปิดเผยการใช้ปัญญาประดิษฐ์" in text and "Gemini 2.5 Pro" in text
    assert "บทที่ 3 ระเบียบวิธีวิจัย" in text and "บทที่ 4 ผลการศึกษา" in text


def test_thesis_external_import_rejects_bad_part_key(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/external-import",
                    json={"methods": ["mnl"], "chapters": [3, 4], "part_key": "ch9", "content": "x" * 200},
                    headers=H("owner"))
    assert r.status_code == 422


def test_thesis_paths_keep_the_whitelist_rule(seeded):
    client, db, seed = seeded
    study, _ = seed()
    for path in ("/export-thesis/external-pack", "/export-thesis/no-ai", "/export-thesis/external-prompt"):
        assert client.post(f"/api/conjoint/studies/{study['id']}{path}", json={"methods": ["mnl"]},
                           headers=H("stranger")).status_code == 403
    asyncio.run(db.conjoint_studies.update_one({"id": study["id"]}, {"$set": {"creator_id": "owner_nowl"}}))
    assert client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/no-ai", json={"methods": ["mnl"]},
                       headers=H("owner_nowl")).status_code == 403
    assert client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/no-ai", json={"methods": ["mnl"]},
                       headers=H("admin")).status_code == 200


def test_no_ai_thesis_document(seeded):
    client, db, seed = seeded
    study, _ = seed()
    r = client.post(f"/api/conjoint/studies/{study['id']}/export-thesis/no-ai",
                    json={"methods": ["mnl", "linear_regression"], "chapters": [3, 4, 5]}, headers=H("owner"))
    assert r.status_code == 200, r.text
    assert "wordprocessingml" in r.headers["content-type"]
    text = _docx_text(r.content)
    assert "ไม่มีการใช้ปัญญาประดิษฐ์" in text
    assert "บทที่ 3 ระเบียบวิธีวิจัย" in text and "บทที่ 4 ผลการศึกษา" in text
    assert "modified Fedorov" in text and "8 ชุด" in text
    assert "ข้อมูลทั่วไปของผู้ตอบแบบสอบถาม" in text
    assert "SE (robust)" in text           # OLS table
    assert "ความเต็มใจจ่าย" in text         # numeric price → WTP table
    from docx import Document
    assert len(Document(io.BytesIO(r.content)).inline_shapes) >= 1   # importance figure


# ===========================================================================
# e. images: prompts only + the existing upload slot
# ===========================================================================
def test_image_external_prompts_and_upload_slot(seeded, monkeypatch):
    client, db, seed = seeded
    study, _ = seed()
    sid = study["id"]
    r = client.post(f"/api/conjoint/studies/{sid}/generate-single-image/external-prompt",
                    json={"attribute_id": "brand", "level_id": "b0", "additional_prompt": "studio"},
                    headers=H("owner"))
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["expected_format"] == "image" and b["parts"][0]["prompt"].startswith("studio ")
    assert b["parts"][0]["prompt"] == CJ._level_image_prompt(
        CJ.DEFAULT_LEVEL_IMAGE_SETTINGS, study["attributes"][0], study["attributes"][0]["levels"][0],
        None, "studio", False)
    assert b["upload"]["url"].endswith("/upload-image")

    allp = client.post(f"/api/conjoint/studies/{sid}/generate-images/external-prompt", headers=H("owner")).json()
    assert len(allp["parts"]) == 8

    cs = study["choice_sets"][0]
    pr = client.post(f"/api/conjoint/studies/{sid}/generate-profile-image/external-prompt",
                     json={"choice_set_id": cs["id"], "profile_id": cs["profiles"][0]["id"]}, headers=H("owner")).json()
    assert "Brand:" in pr["parts"][0]["prompt"] and pr["upload"]["url"].endswith("/upload-profile-image")

    prod = client.post(f"/api/conjoint/studies/{sid}/generate-product-from-results/external-prompt",
                       json={}, headers=H("owner")).json()
    assert {p["key"] for p in prod["parts"]} == {"image_prompt", "prompt_writer"}
    assert prod["optimal_features"]
    shelf = client.post(f"/api/conjoint/studies/{sid}/generate-shelf-simulation/external-prompt",
                        json={"environment_type": "auto"}, headers=H("owner")).json()
    assert shelf["environment_type"] == "convenience_store"

    # The existing upload endpoints accept an image made elsewhere for the same slot.
    import lib.image_normalize as IN

    async def passthrough(url, *a, **k):
        return url
    monkeypatch.setattr(IN, "normalize_image_for_storage", passthrough)
    up = client.post(f"/api/conjoint/studies/{sid}/upload-image",
                     json={"attribute_id": "brand", "level_id": "b0", "image_url": "data:image/png;base64,AAA"},
                     headers=H("owner"))
    assert up.status_code == 200
    doc = asyncio.run(db.conjoint_studies.find_one({"id": sid}))
    assert doc["attributes"][0]["levels"][0]["image_url"] == "data:image/png;base64,AAA"
    up2 = client.post(f"/api/conjoint/studies/{sid}/upload-profile-image",
                      json={"choice_set_id": cs["id"], "profile_id": cs["profiles"][0]["id"],
                            "image_url": "data:image/png;base64,BBB"}, headers=H("owner"))
    assert up2.status_code == 200


# ===========================================================================
# practitioner tools + defects fixed in routes
# ===========================================================================
def test_export_long_xlsx_has_codebook_and_reestimates(seeded):
    client, db, seed = seeded
    study, responses = seed()
    r = client.get(f"/api/conjoint/studies/{study['id']}/export-long", headers=H("owner"))
    assert r.status_code == 200
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(r.content))
    assert {"README", "data_long", "codebook", "design", "data_quality"} <= set(wb.sheetnames)
    rows = list(wb["data_long"].values)
    header = rows[0]
    assert len(rows) - 1 == 60 * 8 * 3
    for col in ("respondent_id", "situation_id", "task", "alt", "chosen", "Brand", "Brand__code", "demo_gender"):
        assert col in header

    # Re-estimate a conditional logit from the export alone → same β as the platform's MNL.
    import pandas as pd
    from statsmodels.discrete.conditional_models import ConditionalLogit
    df = pd.DataFrame(rows[1:], columns=header)
    df = df[df.usable == 1]
    X = pd.DataFrame({
        "Brand_A": (df["Brand__code"] == 1).astype(float), "Brand_B": (df["Brand__code"] == 2).astype(float),
        "p100": (df["ราคา__code"] == 1).astype(float), "p150": (df["ราคา__code"] == 2).astype(float),
        "Good": (df["Quality__code"] == 1).astype(float)})
    res = ConditionalLogit(df["chosen"].astype(int), X, groups=df["situation_id"]).fit(disp=False)
    mnl = CJ.calculate_mnl_analysis(study, responses)
    assert abs(res.params["Brand_A"] - mnl["coefficients"]["Brand_A"]) < 1e-4
    assert abs(res.params["Good"] - mnl["coefficients"]["Quality_Good"]) < 1e-4

    csv = client.get(f"/api/conjoint/studies/{study['id']}/export-long", params={"format": "csv"},
                     headers=H("owner"))
    assert csv.status_code == 200 and "respondent_id" in csv.text.splitlines()[0]


def test_data_quality_and_wtp_endpoints(seeded):
    client, db, seed = seeded
    study, _ = seed(n_resp=80)
    q = client.get(f"/api/conjoint/studies/{study['id']}/data-quality", headers=H("owner")).json()
    assert q["n_responses"] == 80 and "counts" in q
    w = client.get(f"/api/conjoint/studies/{study['id']}/wtp", headers=H("owner")).json()
    assert w["status"] in ("ok", "warning") and w["price_attribute_id"] == "price"
    assert w["price_coefficient"] < 0


def test_simulate_endpoint(seeded):
    client, db, seed = seeded
    study, _ = seed(n_resp=60)
    body = {"method": "mnl", "products": [
        {"name": "X", "levels": {"brand": "b0", "price": "p0", "qual": "q0"}},
        {"name": "Y", "levels": {"brand": "b2", "price": "p2", "qual": "q1"}}]}
    r = client.post(f"/api/conjoint/studies/{study['id']}/simulate", json=body, headers=H("owner"))
    assert r.status_code == 200, r.text
    shares = [p["share"] for p in r.json()["products"]]
    assert abs(sum(shares) - 1) < 1e-9 and shares[0] > 0.9
    r = client.post(f"/api/conjoint/studies/{study['id']}/simulate",
                    json={**body, "rule": "first_choice"}, headers=H("owner"))
    assert r.status_code == 400


def test_share_content_requires_ownership(seeded):
    client, db, seed = seeded
    study, _ = seed()
    body = {"title": "t", "research_type": "quantitative", "study_id": study["id"], "respondent_count": 60,
            "statistical_method": "mnl", "importance_scores": {}, "part_worths": {}}
    r = client.post(f"/api/conjoint/studies/{study['id']}/share-content", json=body, headers=H("stranger"))
    assert r.status_code == 403
