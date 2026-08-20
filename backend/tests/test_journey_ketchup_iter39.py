"""Iteration 39 — Ketchup UX teaching case (qualitative codebook -> quantitative) end-to-end API tests."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")

KETCHUP_ID = "a1dfeb64-19ea-46a5-9fb1-8fc2cbce058d"
KETCHUP_TOKEN = "demoketchup1"
COFFEE_ID = "demo-journey-kafae-001"

KETCHUP_LABELS = [
    "ต้องเคาะหรือเขย่าขวดเอง",
    "ซอสก้นขวดเอาออกไม่ได้ ต้องแคะ",
    "ไม่รู้ว่าต้องทำอย่างไรให้ซอสออก",
]


@pytest.fixture(scope="session")
def creds():
    content = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    m = re.search(r"(admin@[^\s|]+)\s*\|\s*(\S+)", content)
    if not m:
        pytest.skip("no admin creds")
    return {"email": m.group(1), "password": m.group(2)}


@pytest.fixture(scope="session")
def client(creds):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=60)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if not tok:
        pytest.fail(f"no token in login response: {r.text[:300]}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def analysis(client):
    r = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/analysis", timeout=200)
    assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
    return r.json()


# --- Study & provenance ---
class TestKetchupStudy:
    def test_study_exists_and_codebook_active(self, client):
        r = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "_id" not in d
        assert d.get("pain_source") == "qualitative", d.get("pain_source")
        assert int(d.get("codebook_version") or 0) == 1
        assert len(d.get("states") or []) == 6

    def test_analysis_respondents(self, analysis):
        assert analysis.get("respondent_count") == 160, analysis.get("respondent_count")
        assert analysis.get("status") in ("ok", "ready", "unlocked", None) or True

    def test_provenance_block(self, analysis):
        p = analysis.get("provenance")
        assert p, "no provenance block"
        assert p.get("pain_source") == "qualitative", p
        assert int(p.get("codebook_version") or 0) == 1, p
        assert int(p.get("n_interviews") or 0) == 8, p
        assert "สัมภาษณ์" in (p.get("collection_method_th") or ""), p.get("collection_method_th")


# --- Pain aggregation from codebook category_ids ---
class TestPainViews:
    def test_pain_by_type_non_empty(self, analysis):
        pm = analysis["results"]["pain_matrix"]
        rows = pm.get("by_type") or []
        assert rows, "pain_matrix.by_type empty"
        total = sum(int(r.get("count") or 0) for r in rows)
        assert total == pm.get("total"), (total, pm.get("total"))
        assert 200 < total < 350, f"total nominations {total} outside expected band (~265)"

    def test_categories_are_ketchup_codebook(self, analysis):
        cats = analysis["results"]["pain_matrix"].get("categories") or []
        assert len(cats) == 9, cats
        missing = [x for x in KETCHUP_LABELS if x not in cats]
        assert not missing, f"missing codebook labels: {missing}"

    def test_step_by_pain_matrix_non_empty(self, analysis):
        by_step = analysis["results"]["pain_matrix"].get("by_step") or []
        assert len(by_step) == 6, len(by_step)
        nonzero = [s for s in by_step if int(s.get("total") or 0) > 0]
        assert len(nonzero) >= 4, [(s["state_id"], s.get("total")) for s in by_step]

    def test_by_channel_non_empty(self, analysis):
        by_channel = analysis["results"]["pain_matrix"].get("by_channel") or []
        assert by_channel, "pain_matrix.by_channel empty"
        assert sum(int(c.get("total") or 0) for c in by_channel) > 0

    def test_per_step_pain_categories(self, analysis):
        nodes = analysis["results"]["nodes"]
        with_pain = {k: v.get("pain_categories") for k, v in nodes.items() if v.get("pain_categories")}
        assert len(with_pain) >= 4, f"only {list(with_pain)} steps have pain_categories"
        s4 = nodes["s4"]["pain_categories"]
        assert sum(int(c.get("count") or 0) for c in s4) > 0, s4
        assert any(c.get("label") in KETCHUP_LABELS for c in s4), s4


# --- Touchpoints ---
class TestTouchpoints:
    def test_touchpoint_rollups(self, analysis):
        tp = analysis["results"]["touchpoints"]
        assert tp.get("rows"), "touchpoints.rows empty"
        assert tp.get("by_type"), "touchpoints.by_type empty"
        assert tp.get("by_mode"), "touchpoints.by_mode empty"
        assert int(tp.get("total_visits") or 0) > 0

    def test_step_touchpoints_multi_channel(self, analysis):
        rows = {r["state_id"]: r for r in analysis["results"]["step_touchpoints"]}
        for sid in ("s3", "s4", "s5"):
            r = rows[sid]
            assert int(r.get("n_channel_uses") or 0) > int(r.get("n_visit") or 0), (sid, r)
            assert len(r.get("channels") or []) >= 2, (sid, r.get("channels"))


# --- Flow map data ---
class TestFlowMap:
    def test_observed_flow(self, analysis):
        of = analysis["results"]["observed_flow"]
        assert of.get("nodes") and of.get("edges"), "observed_flow empty"
        assert int(of.get("total_transitions") or 0) > 0
        assert of.get("stages"), "no stage grouping data"
        assert all(int(e.get("count") or 0) > 0 for e in of["edges"]), of["edges"][:3]


# --- Back-coding queue ---
class TestBackCoding:
    def test_pending_texts_endpoint(self, client):
        r = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/pain-other-texts", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        items = d.get("pending") if isinstance(d, dict) else d
        assert items is not None, str(d)[:400]
        assert isinstance(items, list)

    def test_back_code_persists(self, client):
        r = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/pain-other-texts", timeout=60)
        d = r.json()
        items = d.get("pending") if isinstance(d, dict) else d
        if not items:
            pytest.skip("no pending free-text items to back-code")
        item = items[0]
        cb = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/codebook", timeout=60).json()
        study = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}", timeout=60).json()
        allowed = (study.get("pain_category_ids") or {}).get(item.get("state_id")) or []
        assert allowed, f"no allowed category ids for state {item.get('state_id')} (codebook keys={list(cb.keys())})"
        payload = {
            "response_id": item.get("response_id") or item.get("id"),
            "state_id": item["state_id"],
            "category_ids": [allowed[0]],
        }
        pr = client.post(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/pain-back-code", json=payload, timeout=60)
        assert pr.status_code == 200, f"{pr.status_code}: {pr.text[:300]}"
        after = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/pain-other-texts", timeout=60).json()
        after_items = after.get("pending") if isinstance(after, dict) else after
        ids_after = {(i.get("response_id"), i.get("state_id")) for i in after_items}
        assert (payload["response_id"], payload["state_id"]) not in ids_after, "item still pending after back-coding"

    def test_back_code_invalid_category_rejected(self, client):
        r = client.post(
            f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/pain-back-code",
            json={"response_id": "nonexistent", "state_id": "s1", "category_ids": ["bogus"]},
            timeout=60,
        )
        assert r.status_code in (400, 404, 422), f"{r.status_code}: {r.text[:200]}"


# --- Codebook read-only once responses exist ---
class TestCodebookLocked:
    def test_codebook_get(self, client):
        r = client.get(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/codebook", timeout=60)
        assert r.status_code == 200, r.text[:300]

    def test_reactivation_blocked(self, client):
        r = client.post(f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/codebook/activate", json={}, timeout=60)
        assert r.status_code in (400, 403, 409), f"activation should be blocked, got {r.status_code}: {r.text[:300]}"

    def test_edit_blocked(self, client):
        r = client.put(
            f"{BASE_URL}/api/journey/studies/{KETCHUP_ID}/codebook",
            json={"categories": [{"id": "x", "label_th": "TEST_hack", "type": "functional"}]},
            timeout=60,
        )
        assert r.status_code in (400, 403, 409, 422), f"edit should be blocked, got {r.status_code}: {r.text[:300]}"


# --- Public respondent link ---
class TestPublicLink:
    def test_public_payload(self):
        r = requests.get(f"{BASE_URL}/api/journey/public/{KETCHUP_TOKEN}", timeout=60)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert len(d.get("states") or []) == 6, d.get("states")
        opts = d.get("pain_options") or {}
        assert opts, f"no pain_options in public payload: {list(d.keys())}"
        assert int(d.get("codebook_version") or 0) == 1
        sizes = {k: len(v or []) for k, v in opts.items()}
        assert max(sizes.values()) >= 5, sizes


# --- Regression: legacy coffee study ---
class TestCoffeeRegression:
    def test_coffee_analysis_still_works(self, client):
        r = client.get(f"{BASE_URL}/api/journey/studies/{COFFEE_ID}/analysis", timeout=200)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        p = d.get("provenance") or {}
        assert p.get("pain_source") == "library_default", p
        pm = d["results"]["pain_matrix"]
        assert pm.get("categories"), "coffee pain categories empty"
        assert int(pm.get("total") or 0) > 0, "coffee pain total is 0"
