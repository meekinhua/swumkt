"""Customer Value Lab backend tests"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass

ADMIN = {"email": "admin@swu.ac.th", "password": "admin123"}
STUDENT = {"email": "student1@swu.ac.th", "password": "student123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT)


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ----------------------------- CRUD -----------------------------
class TestCVCrud:
    created_id = None

    def test_create_study_admin(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_CV_admin", "industry": "food"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_CV_admin"
        assert d["industry"] == "food"
        assert len(d["brands"]) == 2
        assert d["brands"][0]["is_ours"] is True
        assert "id" in d
        TestCVCrud.created_id = d["id"]

    def test_get_study(self, admin_token):
        sid = TestCVCrud.created_id
        r = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == sid
        assert "scores" in d
        assert "industry_range" in d
        # NEW: doc has needs/process/lens defaults
        assert "needs" in d and set(d["needs"].keys()) >= {"need", "want", "buying_power"}
        assert "process" in d and set(d["process"].keys()) >= {"research", "stp", "fourps", "engagement", "returns"}
        assert "lens" in d and "self_sell" in d["lens"]
        # NEW: brand benefits structure
        b0 = d["brands"][0]
        assert set(b0["benefits"].keys()) >= {"functional", "economic", "love_belonging", "esteem_status"}
        assert set(b0["costs"].keys()) >= {"inconvenience", "risk"}
        # scores per brand
        for b in d["brands"]:
            assert b["id"] in d["scores"]
            sc = d["scores"][b["id"]]
            assert "benefit_total" in sc and "cost_total" in sc and "net_value" in sc
            bd = sc["breakdown"]
            for k in ("love_belonging", "esteem_status", "psychological", "money", "inconvenience", "risk"):
                assert k in bd, f"missing breakdown key {k}: {bd}"

    def test_list_studies_admin_sees_created(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/cv/studies", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        ids = [s["id"] for s in r.json().get("studies", [])]
        assert TestCVCrud.created_id in ids

    def test_update_study_brands(self, admin_token):
        sid = TestCVCrud.created_id
        # fetch current then update
        cur = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token)).json()
        brands = cur["brands"]
        # add a checked functional benefit to brand 0
        brands[0]["benefits"]["functional"] = [
            {"label": "TEST_factor", "weight": 3, "checked": True}
        ]
        brands[0]["price_value"] = 200
        r = requests.put(
            f"{BASE_URL}/api/cv/studies/{sid}",
            headers=_h(admin_token),
            json={"brands": brands, "title": "TEST_CV_admin_updated"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] == "TEST_CV_admin_updated"
        # verify persistence
        g = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token)).json()
        assert g["title"] == "TEST_CV_admin_updated"
        assert g["brands"][0]["benefits"]["functional"][0]["label"] == "TEST_factor"
        # functional weight 3 → cat=3 → benefit_total = (3+0+0)/3*10 = 10.0
        sc = g["scores"][g["brands"][0]["id"]]
        assert sc["benefit_total"] == 10.0

    def test_soft_delete_and_trash_and_restore(self, admin_token):
        sid = TestCVCrud.created_id
        r = requests.delete(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # not in list
        lst = requests.get(f"{BASE_URL}/api/cv/studies", headers=_h(admin_token)).json()
        assert sid not in [s["id"] for s in lst["studies"]]
        # in trash
        tr = requests.get(f"{BASE_URL}/api/cv/studies/trash", headers=_h(admin_token)).json()
        assert sid in [s["id"] for s in tr["studies"]]
        # restore
        r2 = requests.post(f"{BASE_URL}/api/cv/studies/{sid}/restore", headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        lst2 = requests.get(f"{BASE_URL}/api/cv/studies", headers=_h(admin_token)).json()
        assert sid in [s["id"] for s in lst2["studies"]]


# ----------------------------- AUTH/OWNERSHIP -----------------------------
class TestCVOwnership:
    def test_student_cannot_view_admin_study(self, admin_token, student_token):
        # create study as admin
        cr = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_owner_admin", "industry": "generic"},
        ).json()
        sid = cr["id"]
        # student tries
        r = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(student_token), timeout=15)
        assert r.status_code == 403, f"expected 403 got {r.status_code} {r.text}"
        # cleanup
        requests.delete(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token))

    def test_student_list_only_own(self, admin_token, student_token):
        # admin creates a study
        cr = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_ownerlist_admin", "industry": "generic"},
        ).json()
        admin_sid = cr["id"]
        # student creates own
        s = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(student_token),
            json={"title": "TEST_ownerlist_student", "industry": "generic"},
        ).json()
        student_sid = s["id"]
        lst = requests.get(f"{BASE_URL}/api/cv/studies", headers=_h(student_token)).json()
        ids = [x["id"] for x in lst["studies"]]
        assert student_sid in ids
        assert admin_sid not in ids
        # cleanup
        requests.delete(f"{BASE_URL}/api/cv/studies/{admin_sid}", headers=_h(admin_token))
        requests.delete(f"{BASE_URL}/api/cv/studies/{student_sid}", headers=_h(student_token))


# ----------------------------- AI -----------------------------
class TestCVAI:
    @pytest.fixture(scope="class")
    def study(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_ai_study", "industry": "food"},
        ).json()
        yield r
        requests.delete(f"{BASE_URL}/api/cv/studies/{r['id']}", headers=_h(admin_token))

    @pytest.mark.parametrize("cat", ["functional", "economic", "love_belonging", "esteem_status", "money", "inconvenience", "risk"])
    def test_ai_suggest(self, admin_token, study, cat):
        brand_id = study["brands"][0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-suggest",
            headers=_h(admin_token),
            json={"brand_id": brand_id, "category": cat},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["category"] == cat
        assert d["is_cost"] == (cat in ("money", "inconvenience", "risk"))
        sugg = d.get("suggestions", [])
        assert len(sugg) >= 1, f"no suggestions returned: {d}"
        s0 = sugg[0]
        assert s0.get("label")
        assert s0.get("weight") in (1, 2, 3)
        assert "rationale" in s0
        assert "principle" in s0

    def test_ai_suggest_invalid_category(self, admin_token, study):
        brand_id = study["brands"][0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-suggest",
            headers=_h(admin_token),
            json={"brand_id": brand_id, "category": "bogus"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_ai_suggest_old_psychological_category_rejected(self, admin_token, study):
        """The old 'psychological' category is split into love_belonging+esteem_status.
        Calling with 'psychological' must return 400."""
        brand_id = study["brands"][0]["id"]
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-suggest",
            headers=_h(admin_token),
            json={"brand_id": brand_id, "category": "psychological"},
            timeout=15,
        )
        assert r.status_code == 400, f"expected 400 for legacy psychological, got {r.status_code}"

    def test_ai_analysis(self, admin_token, study):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-analysis",
            headers=_h(admin_token),
            json={},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        md = r.json().get("analysis", "")
        assert isinstance(md, str) and len(md) > 50
        # persisted
        g = requests.get(f"{BASE_URL}/api/cv/studies/{study['id']}", headers=_h(admin_token)).json()
        assert g.get("ai_analysis"), "ai_analysis not persisted"

    @pytest.mark.slow
    def test_generate_image(self, admin_token, study):
        brand_id = study["brands"][0]["id"]
        t0 = time.time()
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/generate-image",
            headers=_h(admin_token),
            json={"brand_id": brand_id},
            timeout=180,
        )
        elapsed = time.time() - t0
        print(f"image gen elapsed {elapsed:.1f}s")
        assert r.status_code == 200, r.text
        d = r.json()
        url = d.get("image_url", "")
        assert url.startswith("/api/files/") or url.startswith("data:image"), f"unexpected url {url[:80]}"
        # persisted on brand
        g = requests.get(f"{BASE_URL}/api/cv/studies/{study['id']}", headers=_h(admin_token)).json()
        b = next(b for b in g["brands"] if b["id"] == brand_id)
        assert b.get("image_url"), "image_url not persisted"


# ----------------------------- NEEDS / STEP / PERSIST -----------------------------
class TestCVNeedsAndProcess:
    """Tests for new CBS04 modules: Need/Want/Demand, 5-step process, Marketing Lens."""

    @pytest.fixture(scope="class")
    def study(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_needs_study", "industry": "food"},
        ).json()
        yield r
        requests.delete(f"{BASE_URL}/api/cv/studies/{r['id']}", headers=_h(admin_token))

    def test_ai_needs(self, admin_token, study):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-needs",
            headers=_h(admin_token),
            json={"need": "หิว", "want": "ก๋วยเตี๋ยวเรือ", "buying_power": "นักศึกษามีเงิน 50 บาท/มื้อ"},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        result = r.json().get("result", {})
        assert isinstance(result, dict) and result, f"empty result: {r.text}"
        # required keys
        for k in ("need", "want", "buying_power", "is_real_demand", "demand_verdict", "tips"):
            assert k in result, f"missing key {k} in {result.keys()}"
        assert isinstance(result["is_real_demand"], bool)
        assert isinstance(result["tips"], list)
        assert len(result["tips"]) >= 1

    @pytest.mark.parametrize("step", ["research", "stp", "fourps", "engagement", "returns"])
    def test_ai_step(self, admin_token, study, step):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-step",
            headers=_h(admin_token),
            json={"step": step},
            timeout=120,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["step"] == step
        result = d.get("result", {})
        assert "summary" in result and isinstance(result["summary"], str) and result["summary"].strip()
        assert "checklist" in result and isinstance(result["checklist"], list) and len(result["checklist"]) >= 1

    def test_ai_step_invalid(self, admin_token, study):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies/{study['id']}/ai-step",
            headers=_h(admin_token),
            json={"step": "bogus_step"},
            timeout=15,
        )
        assert r.status_code == 400

    def test_put_persists_needs_process_lens(self, admin_token, study):
        sid = study["id"]
        payload = {
            "needs": {"need": "TEST_need_x", "want": "TEST_want_y", "buying_power": "TEST_bp_z"},
            "process": {
                "research": {"notes": "TEST_notes_research", "done": True},
                "stp": {"notes": "", "done": False},
                "fourps": {"notes": "", "done": False},
                "engagement": {"notes": "", "done": False},
                "returns": {"notes": "", "done": False},
            },
            "lens": {"self_sell": 75},
        }
        r = requests.put(
            f"{BASE_URL}/api/cv/studies/{sid}",
            headers=_h(admin_token),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200, r.text
        # verify persistence with GET
        g = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token)).json()
        assert g["needs"]["need"] == "TEST_need_x"
        assert g["needs"]["want"] == "TEST_want_y"
        assert g["process"]["research"]["notes"] == "TEST_notes_research"
        assert g["process"]["research"]["done"] is True
        assert g["lens"]["self_sell"] == 75


# ----------------------------- SCORING (psychological cap) -----------------------------
class TestCVScoring:
    @pytest.fixture(scope="class")
    def study(self, admin_token):
        r = requests.post(
            f"{BASE_URL}/api/cv/studies",
            headers=_h(admin_token),
            json={"title": "TEST_score_study", "industry": "food"},
        ).json()
        yield r
        requests.delete(f"{BASE_URL}/api/cv/studies/{r['id']}", headers=_h(admin_token))

    def test_psychological_is_capped_sum_of_love_and_esteem(self, admin_token, study):
        """psychological = min(10, love_belonging + esteem_status). love=6 + esteem=5 → capped to 10."""
        sid = study["id"]
        cur = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token)).json()
        brands = cur["brands"]
        b0 = brands[0]
        b0["benefits"]["love_belonging"] = [
            {"label": "TEST_love_3", "weight": 3, "checked": True},
            {"label": "TEST_love_3b", "weight": 3, "checked": True},
        ]  # love = min(10, 6) = 6
        b0["benefits"]["esteem_status"] = [
            {"label": "TEST_esteem_3", "weight": 3, "checked": True},
            {"label": "TEST_esteem_2", "weight": 2, "checked": True},
        ]  # esteem = min(10, 5) = 5
        r = requests.put(
            f"{BASE_URL}/api/cv/studies/{sid}",
            headers=_h(admin_token),
            json={"brands": brands},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/cv/studies/{sid}", headers=_h(admin_token)).json()
        bd = g["scores"][b0["id"]]["breakdown"]
        assert bd["love_belonging"] == 6.0, bd
        assert bd["esteem_status"] == 5.0, bd
        # psychological should be capped at 10
        assert bd["psychological"] == 10.0, f"psychological should be capped to 10, got {bd['psychological']}"
