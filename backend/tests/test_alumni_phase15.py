"""
Alumni Phase 1.5 Backend Tests
Scope: invites viral loop, notifications, trivia, throwback, privacy, level/XP, leaderboard.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://soft-delete-conjoint.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT1 = ("student1@swu.ac.th", "student123")
BAS = ("bas66@g.swu.ac.th", "alumni123")
DIN = ("din58@g.swu.ac.th", "alumni123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j["user"]


@pytest.fixture(scope="module")
def student1_auth():
    tok, u = _login(*STUDENT1)
    return {"token": tok, "user": u, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def bas_auth():
    tok, u = _login(*BAS)
    return {"token": tok, "user": u, "headers": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def din_auth():
    tok, u = _login(*DIN)
    return {"token": tok, "user": u, "headers": {"Authorization": f"Bearer {tok}"}}


# ============ /me (level + streak) ============

class TestMeLevel:
    def test_me_returns_level(self, student1_auth):
        r = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        p = data["profile"]
        assert p is not None
        assert "level" in p, "profile must expose level"
        assert isinstance(p["level"], int)
        assert p["level"] >= 1
        # XP 1240 -> Lv.5 per thresholds [0,100,300,600,1000,1500,...]
        if p.get("xp", 0) >= 1000 and p.get("xp", 0) < 1500:
            assert p["level"] == 5
        # streak_days present
        assert "streak_days" in p


# ============ INVITES VIRAL LOOP ============

class TestInvitesViralLoop:
    def test_create_invite_and_increment_counter(self, student1_auth):
        me_before = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"]).json()["profile"]
        ic_before = me_before.get("invite_count", 0)
        xp_before = me_before.get("xp", 0)

        r = requests.post(
            f"{API}/alumni/invites",
            headers=student1_auth["headers"],
            json={"invitee_name": "TEST_Friend", "relation_hint": "น้อง take"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        inv = r.json()
        assert "code" in inv and len(inv["code"]) >= 6
        assert inv["share_url"].endswith(inv["code"])
        assert inv["share_url"].startswith("/alumni/invite/")
        assert inv["status"] == "sent"
        pytest.invite_code_student1 = inv["code"]

        me_after = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"]).json()["profile"]
        assert me_after.get("invite_count", 0) == ic_before + 1
        # +5 XP for invite_sent
        assert me_after.get("xp", 0) >= xp_before + 5

    def test_preview_invite_public_no_auth(self):
        code = pytest.invite_code_student1
        r = requests.get(f"{API}/alumni/invites/preview/{code}", timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["code"] == code
        assert data["inviter"] is not None
        assert data["inviter"].get("nickname") == "ภูมิ"
        assert data["relation_hint"] == "น้อง take"
        # status becomes opened on first call
        assert data["status"] in ("opened", "sent")

    def test_preview_invite_invalid_returns_404(self):
        r = requests.get(f"{API}/alumni/invites/preview/NOTEXIST_ABC123", timeout=20)
        assert r.status_code == 404

    def test_accept_invite_self_rejected(self, student1_auth):
        code = pytest.invite_code_student1
        r = requests.post(
            f"{API}/alumni/invites/accept/{code}",
            headers=student1_auth["headers"], timeout=20,
        )
        assert r.status_code == 400

    def test_accept_invite_by_other_user(self, student1_auth, bas_auth):
        # Student1 creates a new invite, Bas accepts
        r = requests.post(
            f"{API}/alumni/invites",
            headers=student1_auth["headers"],
            json={"invitee_name": "TEST_BAS_Accept"},
            timeout=20,
        )
        assert r.status_code == 200
        code = r.json()["code"]

        me_stu_before = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"]).json()["profile"]
        xp_before = me_stu_before.get("xp", 0)

        r2 = requests.post(
            f"{API}/alumni/invites/accept/{code}",
            headers=bas_auth["headers"], timeout=20,
        )
        assert r2.status_code == 200, r2.text
        body = r2.json()
        assert body.get("relation_pending") is True
        assert body.get("inviter_id") == student1_auth["user"]["id"]

        # Inviter awarded +100 XP
        me_stu_after = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"]).json()["profile"]
        assert me_stu_after.get("xp", 0) >= xp_before + 100

        # Inviter should have an invite_accepted notification
        n = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "invite_accepted" in kinds

        # Accepter should have welcome notification
        n2 = requests.get(f"{API}/alumni/notifications", headers=bas_auth["headers"]).json()
        kinds2 = [x["kind"] for x in n2["notifications"]]
        assert "welcome" in kinds2


# ============ NOTIFICATIONS ============

class TestNotifications:
    def test_list_notifications_structure(self, student1_auth):
        r = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "notifications" in d and "unread" in d
        assert isinstance(d["notifications"], list)
        assert isinstance(d["unread"], int)

    def test_mark_relation_creates_notification_for_target(self, din_auth, student1_auth):
        # din marks student1 (won't duplicate; delete existing first if any)
        din_id = din_auth["user"]["id"]
        stu_id = student1_auth["user"]["id"]
        # Try creating a mentor relation (less likely to exist)
        r = requests.post(
            f"{API}/alumni/relations",
            headers=din_auth["headers"],
            json={"to_user_id": stu_id, "kind": "mentor"},
            timeout=20,
        )
        if r.status_code == 400 and "already exists" in r.text.lower():
            pytest.skip("mentor relation already exists; skipping dup create")
        assert r.status_code == 200, r.text
        rel_id = r.json()["id"]

        # Student1 should see a mark_request notification
        n = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "mark_request" in kinds
        pytest.test_relation_id = rel_id

    def test_mark_one_read(self, student1_auth):
        n = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"]).json()
        unread_items = [x for x in n["notifications"] if not x.get("read")]
        if not unread_items:
            pytest.skip("no unread items")
        target = unread_items[0]
        nid = target["id"]
        r = requests.put(f"{API}/alumni/notifications/{nid}/read", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        n2 = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"]).json()
        updated = next((x for x in n2["notifications"] if x["id"] == nid), None)
        assert updated is not None and updated.get("read") is True

    def test_mark_all_read(self, student1_auth):
        r = requests.put(f"{API}/alumni/notifications/read-all", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        n = requests.get(f"{API}/alumni/notifications", headers=student1_auth["headers"]).json()
        assert n["unread"] == 0

    def test_relation_confirmed_notification_and_xp(self, din_auth, student1_auth):
        rel_id = getattr(pytest, "test_relation_id", None)
        if not rel_id:
            pytest.skip("no test relation to confirm")
        # Student1 (to_user) confirms
        r = requests.put(
            f"{API}/alumni/relations/{rel_id}/confirm",
            headers=student1_auth["headers"],
            json={"accept": True},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # Din (from_user) should receive a relation_confirmed notif
        n = requests.get(f"{API}/alumni/notifications", headers=din_auth["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "relation_confirmed" in kinds
        # Cleanup: delete the relation
        requests.delete(f"{API}/alumni/relations/{rel_id}", headers=student1_auth["headers"])


# ============ TRIVIA ============

class TestTrivia:
    def test_daily_trivia_generation(self, student1_auth):
        r = requests.get(f"{API}/alumni/trivia/daily", headers=student1_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # student1 has full tree so should get a question
        if d.get("question") is None and "message" in d:
            pytest.skip(f"no trivia generable: {d}")
        assert "id" in d
        assert "question" in d and isinstance(d["question"], str)
        assert "options" in d and len(d["options"]) == 4
        # correct_index hidden if unanswered
        assert "correct_index" not in d or d.get("answered") is True
        pytest.trivia_id = d["id"]
        pytest.trivia_answered_already = bool(d.get("answered"))

    def test_daily_trivia_idempotent(self, student1_auth):
        r1 = requests.get(f"{API}/alumni/trivia/daily", headers=student1_auth["headers"]).json()
        r2 = requests.get(f"{API}/alumni/trivia/daily", headers=student1_auth["headers"]).json()
        if r1.get("question") is None:
            pytest.skip("no question")
        assert r1["id"] == r2["id"]

    def test_answer_trivia(self, student1_auth):
        qid = getattr(pytest, "trivia_id", None)
        if not qid:
            pytest.skip("no trivia id")
        if getattr(pytest, "trivia_answered_already", False):
            # Already answered today — second attempt must 400
            r = requests.post(
                f"{API}/alumni/trivia/answer",
                headers=student1_auth["headers"],
                json={"question_id": qid, "answer_index": 0}, timeout=20,
            )
            assert r.status_code == 400
            return
        r = requests.post(
            f"{API}/alumni/trivia/answer",
            headers=student1_auth["headers"],
            json={"question_id": qid, "answer_index": 0}, timeout=20,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "is_correct" in d
        assert "correct_index" in d
        assert "xp_earned" in d
        assert "trivia_streak" in d
        if d["is_correct"]:
            assert d["xp_earned"] == 10
        else:
            assert d["xp_earned"] == 0

    def test_answer_trivia_second_time_rejected(self, student1_auth):
        qid = getattr(pytest, "trivia_id", None)
        if not qid:
            pytest.skip("no trivia id")
        r = requests.post(
            f"{API}/alumni/trivia/answer",
            headers=student1_auth["headers"],
            json={"question_id": qid, "answer_index": 1}, timeout=20,
        )
        assert r.status_code == 400


# ============ LEADERBOARD IQ ============

class TestLeaderboardIQ:
    def test_iq_leaderboard(self, student1_auth):
        r = requests.get(f"{API}/alumni/leaderboard/iq", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "leaderboard" in d and isinstance(d["leaderboard"], list)
        for item in d["leaderboard"]:
            assert "trivia_streak" in item
            assert item["trivia_streak"] >= 1


# ============ THROWBACK ============

class TestThrowback:
    def test_throwback_random(self, student1_auth):
        r = requests.get(f"{API}/alumni/throwback/random?count=3", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        assert len(d["items"]) <= 3
        if d["items"]:
            for i in d["items"]:
                assert "caption" in i
                assert "nickname" in i or "name" in i


# ============ PRIVACY ============

class TestPrivacy:
    def test_privacy_partial_update_merges(self, student1_auth):
        # First, set some explicit state
        r1 = requests.put(
            f"{API}/alumni/privacy",
            headers=student1_auth["headers"],
            json={"show_in_feed": True, "mask_student_id": True},
            timeout=20,
        )
        assert r1.status_code == 200
        base = r1.json()["privacy_settings"]
        # partial toggle
        r2 = requests.put(
            f"{API}/alumni/privacy",
            headers=student1_auth["headers"],
            json={"show_in_feed": False},
            timeout=20,
        )
        assert r2.status_code == 200
        merged = r2.json()["privacy_settings"]
        assert merged["show_in_feed"] is False
        assert merged["mask_student_id"] == base["mask_student_id"]  # preserved
        # restore
        requests.put(
            f"{API}/alumni/privacy",
            headers=student1_auth["headers"],
            json={"show_in_feed": True}, timeout=20,
        )
