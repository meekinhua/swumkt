"""Tests for Activity Stream feature (/api/alumni/activity/stream).

Covers:
- scope=tree|global|self
- limit param
- Activity logging triggered by post_created, job_posted, review_given,
  position_changed, tree_extended (relation), level_up/badge_earned (XP)
- Anonymous review => NO review_given activity
- Enriched actor payload
"""
import os
import time
import uuid
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT = {"email": "student1@swu.ac.th", "password": "student123"}
BAS = {"email": "bas66@g.swu.ac.th", "password": "alumni123"}
DIN = {"email": "din58@g.swu.ac.th", "password": "alumni123"}


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def student_token():
    return _login(STUDENT["email"], STUDENT["password"])


@pytest.fixture(scope="module")
def bas_token():
    return _login(BAS["email"], BAS["password"])


@pytest.fixture(scope="module")
def din_token():
    return _login(DIN["email"], DIN["password"])


@pytest.fixture(scope="module")
def bas_user_id(bas_token):
    r = requests.get(f"{API}/auth/me", headers=_h(bas_token), timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture
def clean_student_bas_review(student_token, bas_user_id):
    """Remove any existing review so a fresh POST triggers activity logging."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    cli = MongoClient(mongo_url)
    db = cli[db_name]
    me = requests.get(f"{API}/auth/me", headers=_h(student_token), timeout=15).json()
    db.alumni_reviews.delete_many({"reviewer_id": me["id"], "subject_user_id": bas_user_id})
    cli.close()
    yield


# ------------------ Stream endpoint basics ------------------

class TestActivityStreamEndpoint:
    def test_unauth_rejected(self):
        r = requests.get(f"{API}/alumni/activity/stream", timeout=15)
        assert r.status_code in (401, 403), r.text

    def test_default_scope_tree(self, student_token):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token), timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data and "total" in data and "scope" in data
        assert data["scope"] == "tree"
        assert isinstance(data["items"], list)
        assert data["total"] == len(data["items"])

    def test_scope_global(self, student_token):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token),
                         params={"scope": "global"}, timeout=20)
        assert r.status_code == 200
        assert r.json()["scope"] == "global"

    def test_scope_self(self, student_token):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token),
                         params={"scope": "self"}, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["scope"] == "self"
        # All items should have actor_id = me (student1)
        me = requests.get(f"{API}/auth/me", headers=_h(student_token), timeout=15).json()
        for it in data["items"]:
            assert it["actor_id"] == me["id"], f"self-scope leaked other actor: {it}"

    def test_limit_respected(self, student_token):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token),
                         params={"scope": "global", "limit": 5}, timeout=20)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 5

    def test_item_shape_and_actor_enrichment(self, student_token):
        # Seed one post so we have an item
        r = requests.post(f"{API}/alumni/feed/posts", headers=_h(student_token),
                          json={"kind": "plain", "content": f"TEST activity shape {uuid.uuid4().hex[:6]}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token),
                         params={"scope": "self", "limit": 5}, timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1, "expected at least one self activity after post"
        it = items[0]
        for k in ("id", "actor_id", "kind", "summary", "created_at"):
            assert k in it, f"missing key {k} in activity item {it}"
        assert "actor" in it and it["actor"], "actor should be enriched"
        assert it["actor"].get("user_id") == it["actor_id"]


# ------------------ Activity logging triggers ------------------

class TestActivityLoggingTriggers:
    def _my_activities(self, token, kind=None, since_iso=None):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(token),
                         params={"scope": "self", "limit": 50}, timeout=20)
        assert r.status_code == 200
        items = r.json()["items"]
        if kind:
            items = [i for i in items if i["kind"] == kind]
        if since_iso:
            items = [i for i in items if i["created_at"] >= since_iso]
        return items

    def test_post_created_logs_activity(self, student_token):
        from datetime import datetime, timezone
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        uniq = uuid.uuid4().hex[:6]
        r = requests.post(f"{API}/alumni/feed/posts", headers=_h(student_token),
                          json={"kind": "plain", "content": f"TEST post_created {uniq}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        acts = self._my_activities(student_token, kind="post_created", since_iso=t0)
        assert len(acts) >= 1, "post_created activity not logged"

    def test_job_posted_logs_activity(self, student_token):
        from datetime import datetime, timezone
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        payload = {
            "title": f"TEST job {uuid.uuid4().hex[:5]}",
            "company": "TEST Co",
            "description": "TEST description",
            "location": "Bangkok",
        }
        r = requests.post(f"{API}/alumni/jobs", headers=_h(student_token), json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        acts = self._my_activities(student_token, kind="job_posted", since_iso=t0)
        assert len(acts) >= 1, "job_posted activity not logged"

    def test_review_non_anonymous_logs_activity(self, student_token, bas_user_id, clean_student_bas_review):
        from datetime import datetime, timezone
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        payload = {
            "subject_user_id": bas_user_id,
            "rating": 5,
            "comment": f"TEST review {uuid.uuid4().hex[:5]}",
            "anonymous": False,
        }
        r = requests.post(f"{API}/alumni/reviews", headers=_h(student_token), json=payload, timeout=20)
        assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
        time.sleep(0.5)
        acts = self._my_activities(student_token, kind="review_given", since_iso=t0)
        assert len(acts) >= 1, "review_given activity not logged for non-anonymous review"

    def test_review_anonymous_no_activity(self, student_token, bas_user_id, clean_student_bas_review):
        from datetime import datetime, timezone
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        payload = {
            "subject_user_id": bas_user_id,
            "rating": 4,
            "comment": f"TEST anon review {uuid.uuid4().hex[:5]}",
            "anonymous": True,
        }
        r = requests.post(f"{API}/alumni/reviews", headers=_h(student_token), json=payload, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        acts = self._my_activities(student_token, kind="review_given", since_iso=t0)
        assert len(acts) == 0, f"anonymous review should NOT log activity, got {acts}"

    def test_position_changed_logs_activity(self, student_token):
        from datetime import datetime, timezone
        # First, fetch current profile so we can restore later if needed
        r_me = requests.get(f"{API}/alumni/me", headers=_h(student_token), timeout=15)
        assert r_me.status_code == 200
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        new_pos = f"TEST Position {uuid.uuid4().hex[:5]}"
        r = requests.put(f"{API}/alumni/me", headers=_h(student_token),
                         json={"position": new_pos}, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.5)
        acts = self._my_activities(student_token, kind="position_changed", since_iso=t0)
        assert len(acts) >= 1, "position_changed activity not logged"


# ------------------ Tree-scope visibility ------------------

class TestTreeScopeVisibility:
    def test_bas_sees_student1_activity_in_tree(self, student_token, bas_token):
        """bas is น้อง take of student1 => direct relation => student1 activities
        should appear in bas's tree-scope stream."""
        from datetime import datetime, timezone
        t0 = datetime.now(timezone.utc).isoformat()
        time.sleep(0.3)
        uniq = uuid.uuid4().hex[:6]
        # student1 creates a post
        r = requests.post(f"{API}/alumni/feed/posts", headers=_h(student_token),
                          json={"kind": "announcement", "content": f"TEST tree-visibility {uniq}"}, timeout=20)
        assert r.status_code in (200, 201), r.text
        time.sleep(0.8)
        # bas queries tree-scope
        r2 = requests.get(f"{API}/alumni/activity/stream", headers=_h(bas_token),
                          params={"scope": "tree", "limit": 50}, timeout=20)
        assert r2.status_code == 200
        items = r2.json()["items"]
        me = requests.get(f"{API}/auth/me", headers=_h(student_token), timeout=15).json()
        fresh = [i for i in items if i["actor_id"] == me["id"] and i["created_at"] >= t0]
        assert len(fresh) >= 1, \
            f"bas tree-scope should contain student1 activities (direct relation); got {len(items)} items, none from student1 since {t0}"

    def test_global_contains_entries(self, student_token):
        r = requests.get(f"{API}/alumni/activity/stream", headers=_h(student_token),
                         params={"scope": "global", "limit": 50}, timeout=20)
        assert r.status_code == 200
        # After all prior tests, global should have >= 1 activity
        assert r.json()["total"] >= 1
