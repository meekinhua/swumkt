"""sitectl — `llm`, `research` and `health` commands (plan 2026-11, WP5).

No network: the HTTP layer is a fake session injected into `Api` (or swapped in for
`requests.Session` when going through `main()`), so these tests pin down request
construction, the before/after diff, the "turning the system LLM on needs a yes" rule
and the file handling of `research prompt` / `research import`.
"""
import importlib.util
import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
_spec = importlib.util.spec_from_file_location("sitectl_under_test", BACKEND / "scripts" / "sitectl.py")
sitectl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sitectl)

from lib import api_keys  # noqa: E402

BASE = "http://fake.test"
CJ = "3ca7a2b6-c2bc-4e8f-9d0a-6f5b5af46248"
BE = "demo-sim-chathai-001"

REGISTRY = {
    "groups": [{"key": "research", "label": "งานวิจัย", "features": ["conjoint.interpretation", "be.ai_analyze", "cv.ai"]},
               {"key": "images", "label": "ภาพ", "features": ["cv.image", "cms.image"]},
               {"key": "content", "label": "เนื้อหา", "features": ["translate", "cms.ai"]}],
    "features": [{"key": "conjoint.interpretation", "group": "research"}, {"key": "be.ai_analyze", "group": "research"},
                 {"key": "cv.ai", "group": "research"}, {"key": "cv.image", "group": "images"},
                 {"key": "cms.image", "group": "images"}, {"key": "translate", "group": "content"},
                 {"key": "cms.ai", "group": "content"}],
}


# ---------------------------------------------------------------- fakes
class FakeResp:
    def __init__(self, status=200, body=None, text=None, ctype="application/json"):
        self.status_code = status
        self._body = body
        self.text = text if text is not None else json.dumps(body if body is not None else {}, ensure_ascii=False)
        self.headers = {"content-type": ctype}

    def json(self):
        if self._body is None:
            raise ValueError("no json")
        return self._body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class FakeServer:
    """Just enough of the platform: llm-policy (GET/PUT with the real merge semantics),
    study lists/details/results and the external-prompt / import endpoints."""

    def __init__(self):
        self.calls = []
        self.policy = {"system_llm_enabled": False, "features": {}, "admin_bypass": False, "external_hint": ""}
        self.put_ignored = False       # simulate a server that accepts but does not apply
        self.routes = {}               # (method, path) -> FakeResp | callable(call)

    # --- policy
    def policy_doc(self):
        p = self.policy
        reg_feats = {f["key"]: f["group"] for f in REGISTRY["features"]}
        eff = {}
        for k, g in reg_feats.items():
            eff[k] = p["features"].get(k, p["features"].get(g, p["system_llm_enabled"]))
        return {"system_llm_enabled": p["system_llm_enabled"], "features": eff, "external_hint": p["external_hint"],
                "registry": REGISTRY, "overrides": dict(p["features"]), "admin_bypass": p["admin_bypass"],
                "updated_at": "2026-11-26T10:00:00+00:00", "updated_by": "admin@swu.ac.th"}

    def request(self, method, url, headers=None, timeout=None, **kw):
        path = url.split("/api", 1)[1]
        call = {"method": method, "path": path.split("?")[0], "json": kw.get("json"),
                "params": kw.get("params"), "headers": headers or {}}
        self.calls.append(call)
        if path == "/platform/llm-policy":
            if method == "GET":
                return FakeResp(200, self.policy_doc())
            if method == "PUT":
                if not self.put_ignored:
                    patch = kw["json"]
                    for k in ("system_llm_enabled", "admin_bypass", "external_hint"):
                        if k in patch:
                            self.policy[k] = patch[k]
                    for k, v in (patch.get("features") or {}).items():
                        if v is None:
                            self.policy["features"].pop(k, None)
                        else:
                            self.policy["features"][k] = v
                return FakeResp(200, self.policy_doc())
        if path == "/health":
            return FakeResp(200, {"status": "ok", "version": "2026.11", "time": "2026-11-26T10:00:00+00:00"})
        r = self.routes.get((method, call["path"]))
        if callable(r):
            return r(call)
        if r is not None:
            return r
        return FakeResp(404, {"detail": "Not Found"})

    def sent(self, method=None):
        return [c for c in self.calls if method is None or c["method"] == method]


def make_api(server, token="swk_testtoken000"):
    api = sitectl.Api(BASE, token)
    api.s = server
    return api


def ns(**kw):
    base = dict(dry_run=False, yes=False, json=False)
    base.update(kw)
    return type("A", (), base)()


@pytest.fixture
def srv():
    return FakeServer()


@pytest.fixture(autouse=True)
def no_tty(monkeypatch):
    monkeypatch.setattr(sys.stdin, "isatty", lambda: False, raising=False)


# ---------------------------------------------------------------- scopes / deny-list
def test_every_mapped_path_is_covered_by_the_documented_scopes():
    """The research/llm commands must work with `mint_api_key.py --preset operator|research`."""
    ok_ops = {"research": {"research.read", "research.ai"},
              "operator": {"platform.settings", "research.read", "research.ai"}}
    ident = "S1"
    for tool, cfg in sitectl.RESEARCH_TOOLS.items():
        for key in ("list", "study", "results"):
            need = api_keys.required_scope("GET", "/api" + cfg[key].format(id=ident))
            assert need == "research.read", (tool, key, need)
        for fname, feat in sitectl.RESEARCH_FEATURES[tool].items():
            method, path = feat["prompt"][0], feat["prompt"][1].format(id=ident)
            need = api_keys.required_scope(method, "/api" + path)
            assert need == "research.read", (tool, fname, "prompt", need)
            imp_m, imp_p = feat["import"]
            need = api_keys.required_scope(imp_m, "/api" + imp_p.format(id=ident))
            assert need == "research.ai", (tool, fname, "import", need)
            sitectl._check_denied(path)
            sitectl._check_denied(imp_p.format(id=ident))
    for m in ("GET", "PUT"):
        assert api_keys.required_scope(m, "/api" + sitectl.LLM_POLICY_PATH) == "platform.settings"
    sitectl._check_denied(sitectl.LLM_POLICY_PATH)
    sitectl._check_denied(sitectl.HEALTH_PATH)
    assert ok_ops["research"] <= ok_ops["operator"]


# ---------------------------------------------------------------- health
def test_health_ok_and_json(srv, capsys):
    assert sitectl.cmd_health(make_api(srv, None), ns()) == 0
    out = capsys.readouterr().out
    assert "ok" in out and "2026.11" in out
    assert "Authorization" not in srv.calls[0]["headers"]  # no credential needed or sent
    assert sitectl.cmd_health(make_api(srv, None), ns(json=True)) == 0
    assert json.loads(capsys.readouterr().out)["status"] == "ok"


def test_health_failure_exit_code():
    class Down:
        def request(self, *a, **k):
            raise ConnectionError("refused")
    api = sitectl.Api(BASE, None)
    api.s = Down()
    assert sitectl.cmd_health(api, ns()) == 1


# ---------------------------------------------------------------- llm status
def test_llm_status_human_and_json(srv, capsys):
    srv.policy.update(system_llm_enabled=True, features={"images": False}, external_hint="ใช้ ChatGPT")
    assert sitectl.cmd_llm_status(make_api(srv), ns()) == 0
    out = capsys.readouterr().out
    assert "ON" in out and "images=off" in out and "ใช้ ChatGPT" in out
    assert "off  images" in out and "on   research" in out
    assert srv.calls[0]["method"] == "GET" and srv.calls[0]["path"] == "/platform/llm-policy"
    assert sitectl.cmd_llm_status(make_api(srv), ns(json=True)) == 0
    assert json.loads(capsys.readouterr().out)["overrides"] == {"images": False}


def test_llm_status_user_view_is_rejected_for_writes(srv):
    doc = srv.policy_doc()
    doc.pop("overrides")
    srv.routes[("GET", "/platform/llm-policy")] = FakeResp(200, doc)   # never reached: handled in request()
    # the fake server answers policy paths itself, so call llm_view directly
    with pytest.raises(SystemExit):
        sitectl.llm_view(doc)


# ---------------------------------------------------------------- llm on / off
def test_llm_off_sends_put_without_confirmation_and_reads_back(srv, capsys):
    srv.policy["system_llm_enabled"] = True
    assert sitectl.cmd_llm_master(make_api(srv), ns(), False) == 0
    puts = srv.sent("PUT")
    assert len(puts) == 1 and puts[0]["json"] == {"system_llm_enabled": False}
    out = capsys.readouterr().out
    assert "was: true" in out and "now: false" in out and "read back" in out
    assert srv.policy["system_llm_enabled"] is False
    # PUT is followed by a GET (read-back)
    assert [c["method"] for c in srv.calls] == ["GET", "PUT", "GET"]


def test_llm_on_needs_confirmation_and_refuses_in_a_pipe(srv, capsys):
    assert sitectl.cmd_llm_master(make_api(srv), ns(), True) == 1
    assert srv.sent("PUT") == []
    out = capsys.readouterr().out
    assert "PAID" in out and "--yes" in out and "system_llm_enabled" in out   # the diff was shown first
    assert srv.policy["system_llm_enabled"] is False


def test_llm_on_with_yes_dry_run_and_interactive(srv, monkeypatch, capsys):
    assert sitectl.cmd_llm_master(make_api(srv), ns(dry_run=True), True) == 0
    assert srv.sent("PUT") == [] and "nothing sent" in capsys.readouterr().out
    assert sitectl.cmd_llm_master(make_api(srv), ns(yes=True), True) == 0
    assert srv.policy["system_llm_enabled"] is True and len(srv.sent("PUT")) == 1
    # interactive "n" refuses, "y" accepts
    srv2 = FakeServer()
    monkeypatch.setattr(sys.stdin, "isatty", lambda: True, raising=False)
    monkeypatch.setattr("builtins.input", lambda *_: "n")
    assert sitectl.cmd_llm_master(make_api(srv2), ns(), True) == 1 and srv2.sent("PUT") == []
    monkeypatch.setattr("builtins.input", lambda *_: "y")
    assert sitectl.cmd_llm_master(make_api(srv2), ns(), True) == 0 and len(srv2.sent("PUT")) == 1


def test_llm_noop_sends_nothing(srv, capsys):
    assert sitectl.cmd_llm_master(make_api(srv), ns(), False) == 0   # already off
    assert srv.sent("PUT") == [] and "nothing to do" in capsys.readouterr().out


def test_llm_read_back_mismatch_is_reported(srv, capsys):
    srv.put_ignored = True
    srv.policy["system_llm_enabled"] = True
    assert sitectl.cmd_llm_master(make_api(srv), ns(), False) == 2
    assert "differs" in capsys.readouterr().out


# ---------------------------------------------------------------- llm set / bypass / hint
def test_llm_set_group_and_feature_and_default(srv, capsys):
    # master off: turning a group ON spends money -> confirmation
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="on")) == 1
    assert srv.sent("PUT") == []
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="on", yes=True)) == 0
    assert srv.sent("PUT")[0]["json"] == {"features": {"images": True}}
    assert srv.policy["features"] == {"images": True}
    # turning it off again needs no confirmation
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="off")) == 0
    assert srv.sent("PUT")[1]["json"] == {"features": {"images": False}}
    # default removes the override (null)
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="default")) == 0
    assert srv.sent("PUT")[2]["json"] == {"features": {"images": None}}
    assert srv.policy["features"] == {}
    out = capsys.readouterr().out
    assert "overrides.images" in out


def test_llm_set_feature_on_when_group_already_on_is_not_a_cost_increase(srv):
    srv.policy.update(system_llm_enabled=True, features={"research": True})
    # cv.ai is already effectively on via the group -> explicit on changes nothing spend-wise
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="cv.ai", state="on")) == 0
    assert srv.sent("PUT")[0]["json"] == {"features": {"cv.ai": True}}


def test_llm_set_removing_an_off_override_while_master_on_asks(srv):
    srv.policy.update(system_llm_enabled=True, features={"images": False})
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="default")) == 1  # would re-enable images
    assert srv.sent("PUT") == []
    assert sitectl.cmd_llm_set(make_api(srv), ns(key="images", state="default", yes=True)) == 0


def test_llm_set_unknown_key_fails_before_any_put(srv):
    with pytest.raises(SystemExit) as e:
        sitectl.cmd_llm_set(make_api(srv), ns(key="imagez", state="on", yes=True))
    assert "images" in str(e.value) or "valid groups" in str(e.value)
    assert srv.sent("PUT") == []


def test_llm_bypass_on_asks_off_does_not(srv):
    assert sitectl.cmd_llm_bypass(make_api(srv), ns(state="on")) == 1
    assert sitectl.cmd_llm_bypass(make_api(srv), ns(state="on", yes=True)) == 0
    assert srv.policy["admin_bypass"] is True
    assert sitectl.cmd_llm_bypass(make_api(srv), ns(state="off")) == 0
    assert srv.policy["admin_bypass"] is False
    assert [c["json"] for c in srv.sent("PUT")] == [{"admin_bypass": True}, {"admin_bypass": False}]


def test_llm_hint_is_free_and_shows_diff(srv, capsys):
    assert sitectl.cmd_llm_hint(make_api(srv), ns(text="ใช้ Claude ของคุณเอง")) == 0
    assert srv.sent("PUT")[0]["json"] == {"external_hint": "ใช้ Claude ของคุณเอง"}
    assert "ใช้ Claude ของคุณเอง" in capsys.readouterr().out


def test_llm_spend_risk_helper():
    feats = {f["key"]: f["group"] for f in REGISTRY["features"]}
    off = {"system_llm_enabled": False, "admin_bypass": False, "external_hint": "", "overrides": {}}
    on = dict(off, system_llm_enabled=True)
    assert "EVERY" in sitectl.llm_spend_risk(off, on, feats)
    assert sitectl.llm_spend_risk(on, off, feats) is None
    assert sitectl.llm_spend_risk(off, dict(off, overrides={"images": True}), feats).startswith("allows")
    assert sitectl.llm_spend_risk(off, dict(off, admin_bypass=True), feats)
    assert sitectl.llm_spend_risk(off, dict(off, external_hint="x"), feats) is None
    assert sitectl.llm_effective(dict(on, overrides={"images": False, "cms.image": True}), "cms.image", feats) is True
    assert sitectl.llm_effective(dict(on, overrides={"images": False}), "cv.image", feats) is False


# ---------------------------------------------------------------- research list / show
def _studies(srv):
    srv.routes[("GET", "/conjoint/studies")] = FakeResp(200, {"studies": [
        {"id": CJ, "title": "กาแฟกระป๋อง", "status": "active", "respondent_count": 60, "created_at": "2026-11-26T09:47:35"}]})
    srv.routes[("GET", "/brand-equity/studies")] = FakeResp(200, {"studies": [
        {"id": BE, "title": "ชาไทย", "brand": {"name": "ชาไทยมะลิ"}, "status": "collecting", "response_count": 183,
         "created_at": "2026-02-03T09:00:00+00:00"}], "total": 1})


def test_research_list_both_tools_and_filter(srv, capsys):
    _studies(srv)
    assert sitectl.cmd_research_list(make_api(srv), ns(tool=None)) == 0
    out = capsys.readouterr().out
    assert CJ in out and BE in out and "60" in out and "183" in out
    assert [c["path"] for c in srv.calls] == ["/conjoint/studies", "/brand-equity/studies"]
    srv.calls.clear()
    assert sitectl.cmd_research_list(make_api(srv), ns(tool="brand-equity", json=True)) == 0
    data = json.loads(capsys.readouterr().out)
    assert [d["tool"] for d in data] == ["brand-equity"] and data[0]["n"] == 183
    assert [c["path"] for c in srv.calls] == ["/brand-equity/studies"]


def test_research_list_empty(srv, capsys):
    srv.routes[("GET", "/conjoint/studies")] = FakeResp(200, {"studies": []})
    assert sitectl.cmd_research_list(make_api(srv), ns(tool="conjoint")) == 0
    assert "no studies" in capsys.readouterr().out


CJ_STUDY = {"id": CJ, "title": "กาแฟ", "status": "active", "respondent_count": 60,
            "attributes": [{"id": "a1", "name": "ราคา"}, {"id": "a2", "name": "แบรนด์"}]}
CJ_RESULTS = {"respondent_count": 60,
              "importance_scores": {"a1": {"name": "ราคา", "importance": 60.8}, "a2": {"name": "แบรนด์", "importance": 39.2}},
              "part_worths": {"a1": {"name": "ราคา", "levels": {"l1": {"value": "15 บาท", "utility": 54.6},
                                                                  "l2": {"value": "35 บาท", "utility": 15.2}}}}}
BE_STUDY = {"id": BE, "title": "ชาไทย", "status": "collecting", "response_count": 183}
BE_DASH = {"aggregate": {"composite": {"awareness": 55.0, "overall": 57.0, "_measured": ["awareness"]},
                         "reliability": {"quality": {"alpha": 0.885}, "awareness": {"alpha": None}},
                         "sample_adequacy": {"message": "มีผู้ตอบ 183 คน"}},
           "responses_filtered": 183, "waves": 2, "ai_cache": {"coding": {}}}


def test_summarize_study_is_compact_and_ordered():
    s = sitectl.summarize_study("conjoint", CJ_STUDY, CJ_RESULTS)
    assert s["n_responses"] == 60 and s["attributes"] == 2
    assert [r["attribute"] for r in s["importance"]] == ["ราคา", "แบรนด์"]
    assert s["best_level"] == {"ราคา": "15 บาท"}
    b = sitectl.summarize_study("brand-equity", BE_STUDY, BE_DASH)
    assert b["n_responses"] == 183 and b["composite"] == {"awareness": 55.0, "overall": 57.0}
    assert b["reliability_alpha"] == {"quality": 0.885} and b["ai_cache"] == ["coding"]
    # missing results must not crash
    assert sitectl.summarize_study("conjoint", CJ_STUDY, {})["importance"] == []


def test_research_show_paths_and_output(srv, capsys):
    srv.routes[("GET", f"/conjoint/studies/{CJ}")] = FakeResp(200, CJ_STUDY)
    srv.routes[("GET", f"/conjoint/studies/{CJ}/results")] = FakeResp(200, CJ_RESULTS)
    srv.routes[("GET", f"/brand-equity/studies/{BE}")] = FakeResp(200, BE_STUDY)
    srv.routes[("GET", f"/brand-equity/studies/{BE}/dashboard")] = FakeResp(200, BE_DASH)
    assert sitectl.cmd_research_show(make_api(srv), ns(tool="conjoint", study_id=CJ)) == 0
    out = capsys.readouterr().out
    assert "responses : 60" in out and "ราคา" in out and "60.8" in out
    assert sitectl.cmd_research_show(make_api(srv), ns(tool="brand-equity", study_id=BE)) == 0
    out = capsys.readouterr().out
    assert "overall 57.0" in out and "quality 0.885" in out
    assert sitectl.cmd_research_show(make_api(srv), ns(tool="brand-equity", study_id=BE, json=True)) == 0
    assert json.loads(capsys.readouterr().out)["responses_filtered"] == 183
    assert [c["path"] for c in srv.calls][:2] == [f"/conjoint/studies/{CJ}", f"/conjoint/studies/{CJ}/results"]


def test_research_show_unknown_study_and_unsafe_id(srv):
    with pytest.raises(SystemExit) as e:
        sitectl.cmd_research_show(make_api(srv), ns(tool="conjoint", study_id="nope"))
    assert "no conjoint study" in str(e.value)
    with pytest.raises(SystemExit):
        sitectl.cmd_research_show(make_api(srv), ns(tool="conjoint", study_id="../../admin/users"))
    assert srv.calls == [] or all(".." not in c["path"] for c in srv.calls)


# ---------------------------------------------------------------- research prompt
PACK = {"feature": "conjoint.interpretation", "title": "ตีความผล", "instructions_th": "ขั้นตอน 1 2 3",
        "expected_format": "markdown",
        "parts": [{"key": "main", "title": "ตีความ", "system_prompt": "SYS ```code``` ", "prompt": "ข้อมูล: ราคา 60.8%"}],
        "filename": "conjoint-x-interpretation-prompt.md"}


def test_render_prompt_pack_is_self_contained_and_fences_safely():
    md = sitectl.render_prompt_pack(PACK)
    assert "# ตีความผล" in md and "part key: `main`" in md and "ข้อมูล: ราคา 60.8%" in md and "ขั้นตอน 1 2 3" in md
    assert "````text" in md  # the system prompt contains ``` so a longer fence is used
    multi = dict(PACK, parts=PACK["parts"] + [{"key": "ch4", "title": "t", "prompt": "p", "json_example": "{}"}])
    md2 = sitectl.render_prompt_pack(multi)
    assert "Part 2/2" in md2 and "JSON example" in md2


def test_research_prompt_post_writes_file_with_server_name(srv, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    srv.routes[("POST", f"/conjoint/studies/{CJ}/ai-interpretation/external-prompt")] = FakeResp(200, PACK)
    rc = sitectl.cmd_research_prompt(make_api(srv), ns(tool="conjoint", study_id=CJ, feature="interpretation",
                                                         out=None, body='{"method":"mnl"}', query=None))
    assert rc == 0
    f = tmp_path / "conjoint-x-interpretation-prompt.md"
    assert f.is_file() and "ข้อมูล: ราคา 60.8%" in f.read_text(encoding="utf-8")
    call = srv.calls[0]
    assert call["method"] == "POST" and call["json"] == {"method": "mnl"}
    out = capsys.readouterr().out
    assert "research import conjoint" in out and "--part main" in out and str(CJ) in out


def test_research_prompt_get_uses_params_and_dash_o_prints(srv, capsys, tmp_path):
    srv.routes[("GET", f"/brand-equity/studies/{BE}/thesis-ai/external-pack")] = FakeResp(
        200, dict(PACK, feature="be.thesis", parts=[{"key": "ch3", "title": "บท 3", "prompt": "P3"}]))
    rc = sitectl.cmd_research_prompt(make_api(srv), ns(tool="brand-equity", study_id=BE, feature="thesis",
                                                         out="-", body=None, query=["wave=2"]))
    assert rc == 0
    call = srv.calls[0]
    assert call["method"] == "GET" and call["params"] == {"format": "json", "wave": "2"} and call["json"] is None
    assert "P3" in capsys.readouterr().out
    assert list(tmp_path.iterdir()) == []


def test_research_prompt_thesis_default_body_and_override(srv, tmp_path):
    srv.routes[("POST", f"/conjoint/studies/{CJ}/export-thesis/external-prompt")] = FakeResp(200, PACK)
    out = tmp_path / "t.md"
    sitectl.cmd_research_prompt(make_api(srv), ns(tool="conjoint", study_id=CJ, feature="thesis", out=str(out),
                                                    body='{"chapters":[4]}', query=None))
    assert srv.calls[0]["json"] == {"methods": ["mnl"], "chapters": [4]}   # default merged, override wins
    assert out.is_file()


def test_research_prompt_markdown_pack_response_is_written_raw(srv, tmp_path):
    srv.routes[("GET", f"/brand-equity/studies/{BE}/thesis-ai/external-pack")] = FakeResp(
        200, None, text="# pack\nraw markdown", ctype="text/markdown; charset=utf-8")
    out = tmp_path / "p.md"
    assert sitectl.cmd_research_prompt(make_api(srv), ns(tool="brand-equity", study_id=BE, feature="thesis",
                                                           out=str(out), body=None, query=None)) == 0
    assert out.read_text(encoding="utf-8") == "# pack\nraw markdown"


def test_research_prompt_errors_and_overwrite_guard(srv, tmp_path, capsys):
    path = f"/brand-equity/studies/{BE}/ai-analyze/external-prompt"
    srv.routes[("GET", path)] = FakeResp(400, {"detail": "ยังไม่มีคำตอบ"})
    assert sitectl.cmd_research_prompt(make_api(srv), ns(tool="brand-equity", study_id=BE, feature="analyze",
                                                           out=str(tmp_path / "a.md"), body=None, query=None)) == 1
    assert "ยังไม่มีคำตอบ" in capsys.readouterr().out
    srv.routes[("GET", path)] = FakeResp(200, PACK)
    existing = tmp_path / "a.md"
    existing.write_text("old", encoding="utf-8")
    args = dict(tool="brand-equity", study_id=BE, feature="analyze", out=str(existing), body=None, query=None)
    assert sitectl.cmd_research_prompt(make_api(srv), ns(**args)) == 1 and existing.read_text() == "old"
    assert sitectl.cmd_research_prompt(make_api(srv), ns(yes=True, **args)) == 0 and existing.read_text() != "old"
    with pytest.raises(SystemExit):
        sitectl.cmd_research_prompt(make_api(srv), ns(tool="conjoint", study_id=CJ, feature="analyze",
                                                        out="-", body=None, query=None))
    with pytest.raises(SystemExit):
        sitectl.cmd_research_prompt(make_api(srv), ns(tool="conjoint", study_id=CJ, feature="thesis",
                                                        out="-", body="[1,2]", query=None))
    with pytest.raises(SystemExit):
        sitectl.cmd_research_prompt(make_api(srv), ns(tool="conjoint", study_id=CJ, feature="thesis",
                                                        out="-", body=None, query=["novalue"]))


def test_safe_filename_keeps_thai_and_strips_paths():
    assert sitectl._safe_filename("../../etc/passwd", "x.md") == "passwd"
    assert sitectl._safe_filename("conjoint-กาแฟ-prompt.md", "x.md") == "conjoint-กาแฟ-prompt.md"
    assert sitectl._safe_filename(None, "fallback.md") == "fallback.md"


# ---------------------------------------------------------------- research import
def _answer(tmp_path, text="## ตีความ\n" + "ราคาสำคัญที่สุด " * 10, name="answer.md"):
    f = tmp_path / name
    f.write_text(text, encoding="utf-8")
    return f


def test_research_import_request_construction(srv, tmp_path, capsys):
    f = _answer(tmp_path)
    path = f"/conjoint/studies/{CJ}/ai-interpretation/external-import"
    srv.routes[("POST", path)] = FakeResp(200, {"source": "external", "model_label": "ChatGPT-5", "imported_at": "t"})
    rc = sitectl.cmd_research_import(make_api(srv), ns(
        tool="conjoint", study_id=CJ, feature="interpretation", file=str(f), model_label="ChatGPT-5",
        part=None, body='{"method":"mnl"}', query=None, yes=True))
    assert rc == 0
    call = srv.calls[0]
    assert call["method"] == "POST" and call["path"] == path
    assert call["json"]["part_key"] == "main" and call["json"]["model_label"] == "ChatGPT-5"
    assert call["json"]["method"] == "mnl" and call["json"]["content"].startswith("## ตีความ")
    assert "imported" in capsys.readouterr().out


def test_research_import_needs_confirmation_and_dry_run(srv, tmp_path, capsys):
    f = _answer(tmp_path)
    args = dict(tool="conjoint", study_id=CJ, feature="interpretation", file=str(f), model_label=None,
                part=None, body=None, query=None)
    assert sitectl.cmd_research_import(make_api(srv), ns(**args)) == 1       # non-tty, no --yes
    assert srv.calls == []
    assert sitectl.cmd_research_import(make_api(srv), ns(dry_run=True, **args)) == 0
    assert srv.calls == [] and "nothing sent" in capsys.readouterr().out


def test_research_import_thesis_and_analyze_need_a_part(srv, tmp_path):
    f = _answer(tmp_path)
    for tool, sid, feat in (("conjoint", CJ, "thesis"), ("brand-equity", BE, "analyze"), ("brand-equity", BE, "thesis")):
        with pytest.raises(SystemExit) as e:
            sitectl.cmd_research_import(make_api(srv), ns(tool=tool, study_id=sid, feature=feat, file=str(f),
                                                            model_label=None, part=None, body=None, query=None, yes=True))
        assert "--part" in str(e.value)
    assert srv.calls == []
    srv.routes[("POST", f"/brand-equity/studies/{BE}/thesis-ai/external-import")] = FakeResp(200, {"ok": True})
    assert sitectl.cmd_research_import(make_api(srv), ns(tool="brand-equity", study_id=BE, feature="thesis", file=str(f),
                                                           model_label=None, part="ch3", body=None, query=None, yes=True)) == 0
    assert srv.calls[0]["json"]["part_key"] == "ch3"


def test_research_import_server_rejection_is_readable(srv, tmp_path, capsys):
    f = _answer(tmp_path)
    srv.routes[("POST", f"/brand-equity/studies/{BE}/ai-analyze/external-import")] = FakeResp(422, {"detail": {
        "code": "external_import_invalid", "message": "อ่าน JSON ไม่ได้", "errors": ["ขาดส่วน coding", "ขาดส่วน themes"]}})
    rc = sitectl.cmd_research_import(make_api(srv), ns(tool="brand-equity", study_id=BE, feature="analyze", file=str(f),
                                                         model_label=None, part="p1", body=None, query=None, yes=True))
    assert rc == 1
    out = capsys.readouterr().out
    assert "422" in out and "อ่าน JSON ไม่ได้" in out and "ขาดส่วน themes" in out


def test_research_import_file_checks(srv, tmp_path):
    base = dict(tool="conjoint", study_id=CJ, feature="interpretation", model_label=None, part=None, body=None,
                query=None, yes=True)
    with pytest.raises(SystemExit):
        sitectl.cmd_research_import(make_api(srv), ns(file=str(tmp_path / "missing.md"), **base))
    empty = _answer(tmp_path, "   \n", "empty.md")
    with pytest.raises(SystemExit):
        sitectl.cmd_research_import(make_api(srv), ns(file=str(empty), **base))
    big = tmp_path / "big.md"
    big.write_bytes(b"x" * (sitectl.MAX_IMPORT_BYTES + 1))
    with pytest.raises(SystemExit):
        sitectl.cmd_research_import(make_api(srv), ns(file=str(big), **base))
    binary = tmp_path / "bin.md"
    binary.write_bytes(b"\xff\xfe\x00\x01" * 10)
    with pytest.raises(SystemExit):
        sitectl.cmd_research_import(make_api(srv), ns(file=str(binary), **base))
    assert srv.calls == []


# ---------------------------------------------------------------- through main(): argv, flags, credential
@pytest.fixture
def cli(monkeypatch, tmp_path, srv):
    """Run `sitectl.main([...])` against the fake server; credential only from the environment."""
    monkeypatch.setattr(sitectl, "CRED_PATH", tmp_path / "creds.json")
    monkeypatch.setenv("SWUMKT_API", BASE)
    monkeypatch.setenv("SWUMKT_API_KEY", "swk_envkey_0000")
    monkeypatch.setattr(sitectl.requests, "Session", lambda: srv)

    def run(*argv):
        return sitectl.main(list(argv))
    return run


def test_main_flags_work_before_and_after_the_subcommand(cli, srv):
    assert cli("llm", "on") == 1                       # refused: no tty, no --yes
    assert srv.sent("PUT") == []
    assert cli("--yes", "llm", "on") == 0              # flag BEFORE the subcommand (was silently dropped)
    assert srv.policy["system_llm_enabled"] is True
    srv.policy["system_llm_enabled"] = False
    assert cli("llm", "on", "--yes") == 0              # flag AFTER
    assert srv.policy["system_llm_enabled"] is True
    assert cli("--dry-run", "llm", "off") == 0
    assert srv.policy["system_llm_enabled"] is True    # dry-run before the subcommand honoured


def test_main_sends_the_key_and_never_prints_it(cli, srv, capsys):
    assert cli("llm", "status") == 0
    assert cli("health") == 0
    with pytest.raises(SystemExit) as e:                # no routes on the fake -> readable error, no traceback
        cli("research", "list")
    assert "could not list" in str(e.value)
    out = capsys.readouterr()
    assert "swk_envkey_0000" not in out.out and "swk_envkey_0000" not in out.err
    assert srv.calls[0]["headers"]["Authorization"] == "Bearer swk_envkey_0000"


def test_main_llm_set_and_hint_parse(cli, srv):
    assert cli("llm", "set", "images", "off") == 0
    assert srv.policy["features"] == {"images": False}
    assert cli("llm", "hint", "ใช้ ChatGPT") == 0 and srv.policy["external_hint"] == "ใช้ ChatGPT"
    with pytest.raises(SystemExit):
        cli("llm", "set", "images", "maybe")
    with pytest.raises(SystemExit):
        cli("research", "prompt", "nonsense-tool", "x", "y")


def test_main_research_prompt_then_import_roundtrip(cli, srv, tmp_path):
    srv.routes[("GET", f"/brand-equity/studies/{BE}/ai-analyze/external-prompt")] = FakeResp(
        200, dict(PACK, feature="be.ai_analyze", parts=[{"key": "p1", "title": "t", "prompt": "P"}]))
    out = tmp_path / "prompt.md"
    assert cli("research", "prompt", "brand-equity", BE, "analyze", "-o", str(out)) == 0
    assert out.is_file()
    ans = tmp_path / "ans.json"
    ans.write_text('{"coding": {}}', encoding="utf-8")
    srv.routes[("POST", f"/brand-equity/studies/{BE}/ai-analyze/external-import")] = FakeResp(200, {"ok": True})
    assert cli("research", "import", "brand-equity", BE, "analyze", "--file", str(ans), "--part", "p1",
               "--model-label", "Claude", "--yes") == 0
    sent = srv.sent("POST")[0]["json"]
    assert sent == {"part_key": "p1", "content": '{"coding": {}}', "model_label": "Claude"}
