"""
Alumni Network Module — Backend Tests
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://soft-delete-conjoint.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT1 = ("student1@swu.ac.th", "student123")
FAH = ("fah61@g.swu.ac.th", "alumni123")
DIN = ("din58@g.swu.ac.th", "alumni123")
BAITOEY = ("baitoey66@g.swu.ac.th", "alumni123")
ADMIN = ("admin@swu.ac.th", "admin123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"], r.json()["user"]


@pytest.fixture(scope="module")
def student1_auth():
    token, user = _login(*STUDENT1)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def fah_auth():
    token, user = _login(*FAH)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


@pytest.fixture(scope="module")
def baitoey_auth():
    token, user = _login(*BAITOEY)
    return {"token": token, "user": user, "headers": {"Authorization": f"Bearer {token}"}}


# ============ PUBLIC STATS ============

class TestPublicStats:
    def test_stats_public_no_auth(self):
        r = requests.get(f"{API}/alumni/stats", timeout=20)
        assert r.status_code == 200
        data = r.json()
        for key in ["alumni", "current", "companies", "connections", "jobs_referred", "new_today"]:
            assert key in data, f"Missing key {key} in stats: {data}"
        assert isinstance(data["alumni"], int)
        assert data["alumni"] >= 9  # 9 seeded


# ============ ME / PROFILE ============

class TestMe:
    def test_me_returns_registered_for_student1(self, student1_auth):
        r = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["registered"] is True
        assert data["profile"] is not None
        assert data["profile"]["gen"] == 64
        assert data["profile"]["nickname"] == "ภูมิ"

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/alumni/me", timeout=20)
        assert r.status_code in (401, 403)

    def test_update_me(self, student1_auth):
        original = requests.get(f"{API}/alumni/me", headers=student1_auth["headers"]).json()["profile"]
        new_bio = "TEST_bio_update_12345"
        r = requests.put(
            f"{API}/alumni/me",
            headers=student1_auth["headers"],
            json={"bio": new_bio},
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["bio"] == new_bio
        # revert
        requests.put(
            f"{API}/alumni/me",
            headers=student1_auth["headers"],
            json={"bio": original.get("bio") or ""},
            timeout=20,
        )

    def test_register_duplicate(self, student1_auth):
        # student1 already has a profile -> should return 400
        r = requests.post(
            f"{API}/alumni/register",
            headers=student1_auth["headers"],
            json={"student_id": "64XXXXX", "gen": 64, "nickname": "test"},
            timeout=20,
        )
        assert r.status_code == 400


# ============ PROFILE BY USER ID ============

class TestProfile:
    def test_get_fah_profile(self, student1_auth, fah_auth):
        fah_user_id = fah_auth["user"]["id"]
        r = requests.get(
            f"{API}/alumni/profile/{fah_user_id}",
            headers=student1_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["gen"] == 61
        assert data["nickname"] == "ฟ้า"

    def test_get_profile_not_found(self, student1_auth):
        r = requests.get(
            f"{API}/alumni/profile/nonexistent-id-xxx",
            headers=student1_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 404


# ============ TREE ============

class TestTree:
    def test_tree_me_student1_full_chain(self, student1_auth):
        r = requests.get(f"{API}/alumni/tree/me", headers=student1_auth["headers"], timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["root"]["nickname"] == "ภูมิ"
        ancestors = data["ancestors"]
        descendants = data["descendants"]

        # Expect 5 ancestors at distances 1..5
        distances_up = sorted([a["distance"] for a in ancestors])
        assert distances_up == [1, 2, 3, 4, 5], f"Expected [1..5], got {distances_up}; ancestors={ancestors}"

        # Check labels
        label_by_dist = {1: "พี่ take", 2: "ปู่", 3: "ทวด", 4: "เทียด", 5: "เทียดทวด"}
        for a in ancestors:
            assert a["relation"] == label_by_dist[a["distance"]]

        # Check nicknames
        nick_by_dist = {a["distance"]: a["nickname"] for a in ancestors}
        assert nick_by_dist[1] == "ฟ้า"
        assert nick_by_dist[2] == "ดิน"
        assert nick_by_dist[3] == "แพร"
        assert nick_by_dist[4] == "กันต์"
        assert nick_by_dist[5] == "พี่อิ๊ก"

        # Descendants: 3 total — ใบเตย+บาส at dist 1, มายด์ at dist 2
        assert len(descendants) == 3, f"Expected 3 descendants, got {len(descendants)}: {descendants}"
        dist1 = [d["nickname"] for d in descendants if d["distance"] == 1]
        dist2 = [d["nickname"] for d in descendants if d["distance"] == 2]
        assert set(dist1) == {"ใบเตย", "บาส"}
        assert dist2 == ["มายด์"]

        assert data["total"] == 1 + 5 + 3

    def test_tree_by_user_id(self, student1_auth, fah_auth):
        fah_user_id = fah_auth["user"]["id"]
        r = requests.get(
            f"{API}/alumni/tree/{fah_user_id}",
            headers=student1_auth["headers"],
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["root"]["nickname"] == "ฟ้า"
        # ฟ้า has ancestors (ดิน, แพร, กันต์, พี่อิ๊ก) = 4
        assert len(data["ancestors"]) == 4


# ============ SEARCH ============

class TestSearch:
    def test_search_by_nickname(self, student1_auth):
        r = requests.get(
            f"{API}/alumni/search",
            params={"q": "ฟ้า"},
            headers=student1_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["total"] >= 1
        nicks = [x.get("nickname") for x in data["results"]]
        assert "ฟ้า" in nicks

    def test_search_by_gen(self, student1_auth):
        r = requests.get(
            f"{API}/alumni/search",
            params={"gen": 66},
            headers=student1_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        # ใบเตย(66) and บาส(66)
        assert data["total"] >= 2


# ============ RELATIONS (Mark / Confirm / Pending) ============

class TestRelations:
    def test_mark_confirm_relation_flow(self, student1_auth, fah_auth):
        """
        Use admin or create a fresh flow. Since student1 already has confirmed take with ฟ้า,
        we instead test by trying to mark again (should 400) then testing pending list.
        """
        fah_user_id = fah_auth["user"]["id"]
        r = requests.post(
            f"{API}/alumni/relations",
            headers=student1_auth["headers"],
            json={"to_user_id": fah_user_id, "kind": "take"},
            timeout=20,
        )
        # Already exists from seed -> expect 400
        assert r.status_code == 400

    def test_mark_self_forbidden(self, student1_auth):
        r = requests.post(
            f"{API}/alumni/relations",
            headers=student1_auth["headers"],
            json={"to_user_id": student1_auth["user"]["id"], "kind": "take"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_pending_relations_list(self, student1_auth):
        r = requests.get(
            f"{API}/alumni/relations/pending",
            headers=student1_auth["headers"],
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert "pending" in data
        assert "total" in data
        assert isinstance(data["pending"], list)


# ============ INVITES ============

class TestInvites:
    def test_create_invite(self, student1_auth):
        r = requests.post(
            f"{API}/alumni/invites",
            headers=student1_auth["headers"],
            json={
                "invitee_email": "TEST_invite@example.com",
                "invitee_name": "TEST_NAME",
                "relation_hint": "น้อง take",
            },
            timeout=20,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["invitee_email"] == "TEST_invite@example.com"
        assert data["code"]
        assert data["status"] == "sent"

    def test_list_invites(self, student1_auth):
        r = requests.get(f"{API}/alumni/invites", headers=student1_auth["headers"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "invites" in data
        assert isinstance(data["invites"], list)
        assert data["total"] >= 1

    def test_invite_requires_identifier(self, student1_auth):
        r = requests.post(
            f"{API}/alumni/invites",
            headers=student1_auth["headers"],
            json={},
            timeout=20,
        )
        assert r.status_code == 400
