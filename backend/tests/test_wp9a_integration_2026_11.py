"""WP9a — cross-package integration checks (2026-11-26). Pure: no Mongo, no LLM, no server."""
import os
import re
import sys

import pytest

BACKEND = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, BACKEND)
sys.path.insert(0, os.path.join(BACKEND, "scripts"))

from lib import api_keys  # noqa: E402


# ---------------------------------------------------------------- A1 scopes
@pytest.mark.parametrize("method,path,scope", [
    ("POST", "/api/conjoint/studies/s1/export-thesis/no-ai", "research.read"),
    ("POST", "/api/conjoint/studies/s1/simulate", "research.read"),
    ("GET", "/api/conjoint/studies/s1/wtp", "research.read"),
    ("GET", "/api/conjoint/studies/s1/ai-interpretation", "research.read"),
    ("POST", "/api/brand-equity/studies/s1/coding/import-csv", "research.ai"),
    ("DELETE", "/api/brand-equity/studies/s1/coding", "research.ai"),
    ("GET", "/api/brand-equity/studies/s1/coding/codeframe.csv", "research.read"),
    # still refused
    ("POST", "/api/conjoint/studies/s1/export-thesis", None),          # system LLM
    ("POST", "/api/conjoint/studies/s1/ai-interpretation", None),       # system LLM
    ("POST", "/api/brand-equity/studies/s1/ai-analyze", None),          # system LLM
    ("DELETE", "/api/brand-equity/studies/s1", None),
    ("POST", "/api/alumni/admin/ghosts/g1/merge-into", None),
])
def test_scope_rules(method, path, scope):
    assert api_keys.required_scope(method, path) == scope


def test_research_read_cannot_write():
    writes = [("POST", "/api/brand-equity/studies/s1/coding/import-csv"),
              ("DELETE", "/api/brand-equity/studies/s1/coding"),
              ("POST", "/api/conjoint/studies/s1/ai-interpretation/external-import"),
              ("POST", "/api/brand-equity/studies/s1/thesis-ai/external-import")]
    for m, p in writes:
        need = api_keys.required_scope(m, p)
        assert need == "research.ai", (m, p, need)
        assert not api_keys.scope_allows(["research.read"], need)


def test_every_sitectl_research_path_is_a_real_route_with_the_intended_scope():
    """Re-verified against the routes (the CLI agent had to guess the conjoint ones)."""
    import sitectl
    route_src = open(os.path.join(BACKEND, "routes/conjoint.py"), encoding="utf-8").read() \
        + open(os.path.join(BACKEND, "routes/brand_equity.py"), encoding="utf-8").read()
    declared = set()
    for m in re.finditer(r'@(conjoint_router|brand_equity_router)\.(get|post|put|delete|api_route)\("([^"]+)"'
                         r'(?:,\s*methods=\[([^\]]+)\])?', route_src):
        router, verb, path, methods = m.groups()
        full = ("/brand-equity" if router == "brand_equity_router" else "") + path
        full = re.sub(r"\{[^}]+\}", "{id}", full)
        verbs = [v.strip(' "\'') for v in methods.split(",")] if methods else [verb.upper()]
        for v in verbs:
            declared.add((v.upper(), full))

    def check(method, path, scope):
        norm = re.sub(r"\{[^}]+\}", "{id}", path)
        assert (method, norm) in declared, f"sitectl uses {method} {path} — no such route"
        real = "/api" + path.replace("{id}", "abc123")
        assert api_keys.required_scope(method, real) == scope, (method, path)

    for tool, cfg in sitectl.RESEARCH_TOOLS.items():
        for k in ("list", "study", "results"):
            check("GET", cfg[k], "research.read")
    for tool, feats in sitectl.RESEARCH_FEATURES.items():
        for name, f in feats.items():
            check(f["prompt"][0], f["prompt"][1], "research.read")
            check(f["import"][0], f["import"][1], "research.ai")


# ---------------------------------------------------------------- A6 CMS defaults
def test_cms_default_tool_cards_point_at_real_routes():
    src = open(os.path.join(BACKEND, "routes/cms.py"), encoding="utf-8").read()
    app = open(os.path.join(BACKEND, "..", "frontend/src/App.js"), encoding="utf-8").read()
    routes = set(re.findall(r'path="([^"]+)"', app))
    cards = re.findall(r'\{"tag": "[A-Z]+", "t": "([^"]+)", "s": "[^"]*", "p": "([^"]+)"\}', src)
    assert len(cards) >= 8
    by = dict(cards)
    assert by["Customer Journey"] == "/market-research/customer-journey"
    assert by["Customer Perception"] == "/market-research/customer-perception"
    assert by["Customer Behavior"] == "/market-research/customer-behavior"
    assert by["Survey Builder"] == "/surveys/create"
    for title, p in cards:
        assert p in routes, f"{title} → {p} is not a frontend route"


# ---------------------------------------------------------------- A7 alumni
def test_alumni_public_inviter_card_is_a_whitelist():
    from routes.alumni import public_inviter_card
    alum = {"user_id": "u", "nickname": "ต้น", "name": "ต้น ใจดี", "gen": 60, "role": "alumni",
            "position": "PM", "company": "ACME", "avatar_url": "a", "avatar_hue": 1, "verified": True,
            "student_id": "60123456", "email": "t@x", "bio": "private", "interests": {"mentor": True},
            "xp": 900, "invited_by": "z", "privacy_settings": {"show_company_to_juniors": False}}
    card = public_inviter_card(alum)
    for k in ("student_id", "email", "bio", "interests", "xp", "invited_by", "privacy_settings", "company"):
        assert k not in card
    assert card["nickname"] == "ต้น" and card["gen"] == 60
    alum["privacy_settings"]["show_company_to_juniors"] = True
    assert public_inviter_card(alum)["company"] == "ACME"
    assert public_inviter_card(None) is None


def test_alumni_texts_use_saitech_vocabulary():
    src = open(os.path.join(BACKEND, "routes/alumni.py"), encoding="utf-8").read()
    code = "\n".join(l for l in src.splitlines() if not l.strip().startswith("#"))
    assert "เข้ามาในตระกูล" not in code and "ตำนานตระกูล" not in code


# ---------------------------------------------------------------- A9 dev_sim smart fake
def test_dev_sim_smart_reply_survey_and_qualitative():
    import dev_sim
    from lib import external_prompts as XP
    sysm, pr = XP.survey_sdl_prompts("ร้านกาแฟ", "perception", 5, "th")
    import yaml
    doc = yaml.safe_load(dev_sim.smart_reply(sysm, pr))
    assert doc["sections"] and doc["sections"][0]["questions"]


def _qual_prompt():
    from routes.conjoint import _build_qualitative_prompt
    tmpl = ("Analyze the following qualitative data to identify the most important product/service attributes "
            "and their levels for a Choice-Based Conjoint Analysis study.\n{combined_data}\n"
            'Return JSON {{"attributes": [{{"name": "", "levels": [{{"value": ""}}]}}]}} in {target_language}')
    return _build_qualitative_prompt({"prompt_template": tmpl}, [{"type": "interview", "content": "ชอบราคาถูก"}])


def test_dev_sim_smart_reply_conjoint_qualitative_and_fallback():
    import json
    import dev_sim
    from routes.conjoint import _qualitative_suggestions
    built = _qual_prompt()
    out = json.loads(dev_sim.smart_reply(built["system_message"], built["prompt"]))
    sugg = _qualitative_suggestions(out)
    assert len(sugg) >= 2 and all(len(a.levels) >= 2 for a in sugg)
    assert dev_sim.smart_reply("", "เขียนบทที่ 4") is None        # markdown features get FAKE_REPLY


# ---------------------------------------------------------------- A8 dev requirements
def test_dev_requirements_listed_separately():
    req = open(os.path.join(BACKEND, "requirements.txt"), encoding="utf-8").read().lower()
    dev = open(os.path.join(BACKEND, "requirements-dev.txt"), encoding="utf-8").read().lower()
    assert "mongomock-motor" not in req and "mongomock-motor" in dev


# ---------------------------------------------------------------- body limit
def test_body_limit_paths():
    from lib.body_limit import path_is_limited
    assert path_is_limited("/api/conjoint/studies/s/ai-interpretation/external-import")
    assert path_is_limited("/api/brand-equity/studies/s/coding/import-csv")
    assert not path_is_limited("/api/brand-equity/studies/s/dashboard")
