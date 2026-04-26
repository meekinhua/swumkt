"""
Alumni Phase 2 Backend Tests
Scope: Discover (Mystery Match), Feed (posts/reactions/comments), Jobs Directory, Reviews.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://family-tree-hub-41.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

STUDENT1 = ("student1@swu.ac.th", "student123")
BAS = ("bas66@g.swu.ac.th", "alumni123")
DIN = ("din58@g.swu.ac.th", "alumni123")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    j = r.json()
    return j["access_token"], j["user"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def stu():
    tok, u = _login(*STUDENT1)
    return {"token": tok, "user": u, "headers": _h(tok)}


@pytest.fixture(scope="module")
def bas():
    tok, u = _login(*BAS)
    return {"token": tok, "user": u, "headers": _h(tok)}


@pytest.fixture(scope="module")
def din():
    tok, u = _login(*DIN)
    return {"token": tok, "user": u, "headers": _h(tok)}


# ============ DISCOVER ============

class TestDiscover:
    def test_mystery_match_default_range(self, stu):
        r = requests.get(f"{API}/alumni/discover/mystery-match", headers=stu["headers"], timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "match" in d
        if d["match"] is not None:
            assert "user_id" in d["match"] or "id" in d["match"]
            assert "reasons" in d and isinstance(d["reasons"], list)

    def test_mystery_match_with_hop_filter(self, stu):
        r = requests.get(
            f"{API}/alumni/discover/mystery-match",
            headers=stu["headers"],
            params={"min_hops": 2, "max_hops": 4},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        if d.get("match") and d.get("distance") is not None:
            assert 2 <= d["distance"] <= 4

    def test_skip_then_excluded(self, stu):
        # Get a candidate first
        r1 = requests.get(f"{API}/alumni/discover/mystery-match", headers=stu["headers"], timeout=30).json()
        if not r1.get("match"):
            pytest.skip("no candidate to skip")
        cand_id = r1["match"].get("user_id") or r1["match"].get("id")
        if not cand_id:
            pytest.skip("match has no user_id")
        # Skip
        rsk = requests.post(f"{API}/alumni/discover/skip/{cand_id}", headers=stu["headers"], timeout=20)
        assert rsk.status_code == 200
        # Subsequent calls (loop a few times) should not return same id repeatedly
        seen = set()
        for _ in range(6):
            r = requests.get(f"{API}/alumni/discover/mystery-match", headers=stu["headers"], timeout=30).json()
            m = r.get("match")
            if m:
                mid = m.get("user_id") or m.get("id")
                seen.add(mid)
        assert cand_id not in seen, f"skipped user {cand_id} still appeared in matches: {seen}"


# ============ FEED ============

class TestFeed:
    def test_create_plain_post_awards_xp(self, stu):
        before = requests.get(f"{API}/alumni/me", headers=stu["headers"]).json()["profile"]
        xp_before = before.get("xp", 0)
        r = requests.post(
            f"{API}/alumni/feed/posts",
            headers=stu["headers"],
            json={"kind": "plain", "content": "TEST_POST_phase2_hi"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        post = r.json()
        assert post["id"]
        assert post["kind"] == "plain"
        assert post["content"] == "TEST_POST_phase2_hi"
        pytest.feed_post_id = post["id"]

        after = requests.get(f"{API}/alumni/me", headers=stu["headers"]).json()["profile"]
        assert after.get("xp", 0) >= xp_before + 5

    def test_create_post_invalid_kind(self, stu):
        r = requests.post(
            f"{API}/alumni/feed/posts",
            headers=stu["headers"],
            json={"kind": "garbage_kind", "content": "x"},
            timeout=20,
        )
        assert r.status_code == 400

    def test_list_posts_enriched(self, stu):
        r = requests.get(f"{API}/alumni/feed/posts", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "posts" in d
        assert any(p["id"] == pytest.feed_post_id for p in d["posts"])
        target = next(p for p in d["posts"] if p["id"] == pytest.feed_post_id)
        assert "author" in target and target["author"] is not None
        assert "reaction_count" in target
        assert "my_reactions" in target
        assert "comment_count" in target

    def test_list_posts_kind_filter(self, stu):
        r = requests.get(
            f"{API}/alumni/feed/posts",
            headers=stu["headers"],
            params={"kind": "plain"},
            timeout=20,
        )
        assert r.status_code == 200
        for p in r.json()["posts"]:
            assert p["kind"] == "plain"

    def test_react_toggle(self, bas):
        pid = pytest.feed_post_id
        # Add reaction
        r = requests.post(
            f"{API}/alumni/feed/posts/{pid}/react",
            headers=bas["headers"],
            json={"emoji": "❤️"},
            timeout=20,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["reaction_count"] >= 1
        # Toggle off
        r2 = requests.post(
            f"{API}/alumni/feed/posts/{pid}/react",
            headers=bas["headers"],
            json={"emoji": "❤️"},
            timeout=20,
        )
        assert r2.status_code == 200
        d2 = r2.json()
        # Should drop
        assert d2["reaction_count"] == d["reaction_count"] - 1

    def test_react_notifies_author(self, bas, stu):
        pid = pytest.feed_post_id
        # Add reaction by bas
        requests.post(
            f"{API}/alumni/feed/posts/{pid}/react",
            headers=bas["headers"],
            json={"emoji": "🔥"},
            timeout=20,
        )
        n = requests.get(f"{API}/alumni/notifications", headers=stu["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "post_reaction" in kinds

    def test_create_comment_and_notify(self, bas, stu):
        pid = pytest.feed_post_id
        r = requests.post(
            f"{API}/alumni/feed/posts/{pid}/comments",
            headers=bas["headers"],
            json={"content": "TEST_COMMENT phase2"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["content"] == "TEST_COMMENT phase2"
        assert c.get("author") is not None
        # comment count increment
        listr = requests.get(f"{API}/alumni/feed/posts", headers=stu["headers"]).json()
        target = next(p for p in listr["posts"] if p["id"] == pid)
        assert target["comment_count"] >= 1
        # notification
        n = requests.get(f"{API}/alumni/notifications", headers=stu["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "post_comment" in kinds

    def test_list_comments_enriched(self, stu):
        pid = pytest.feed_post_id
        r = requests.get(f"{API}/alumni/feed/posts/{pid}/comments", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 1
        for c in d["comments"]:
            assert "author" in c

    def test_delete_post_only_by_author(self, bas, stu):
        pid = pytest.feed_post_id
        # bas is not author -> 403
        r = requests.delete(f"{API}/alumni/feed/posts/{pid}", headers=bas["headers"], timeout=20)
        assert r.status_code == 403
        # author deletes
        r2 = requests.delete(f"{API}/alumni/feed/posts/{pid}", headers=stu["headers"], timeout=20)
        assert r2.status_code == 200


# ============ JOBS ============

class TestJobs:
    def test_post_job_awards_xp(self, stu):
        before = requests.get(f"{API}/alumni/me", headers=stu["headers"]).json()["profile"]
        xp_before = before.get("xp", 0)
        r = requests.post(
            f"{API}/alumni/jobs",
            headers=stu["headers"],
            json={
                "title": "TEST_JOB Marketing Lead",
                "company": "TEST_CO",
                "description": "TEST description for phase 2",
                "kind": "hiring",
                "level": "mid",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        job = r.json()
        assert job["id"]
        assert job["active"] is True
        assert job["interest_count"] == 0
        pytest.job_id = job["id"]
        after = requests.get(f"{API}/alumni/me", headers=stu["headers"]).json()["profile"]
        assert after.get("xp", 0) >= xp_before + 30

    def test_list_jobs(self, stu):
        r = requests.get(f"{API}/alumni/jobs", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert any(j["id"] == pytest.job_id for j in d["jobs"])

    def test_list_jobs_kind_filter(self, stu):
        r = requests.get(f"{API}/alumni/jobs", headers=stu["headers"], params={"kind": "hiring"}, timeout=20)
        assert r.status_code == 200
        for j in r.json()["jobs"]:
            assert j["kind"] == "hiring"

    def test_express_interest_idempotent_and_notify(self, bas, stu):
        jid = pytest.job_id
        r = requests.post(f"{API}/alumni/jobs/{jid}/interest", headers=bas["headers"], timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["interest_count"] >= 1
        # Idempotent
        r2 = requests.post(f"{API}/alumni/jobs/{jid}/interest", headers=bas["headers"], timeout=20)
        assert r2.status_code == 200
        assert "Already" in r2.json().get("message", "")
        # Notification to poster
        n = requests.get(f"{API}/alumni/notifications", headers=stu["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "job_interest" in kinds

    def test_express_interest_self_rejected(self, stu):
        jid = pytest.job_id
        r = requests.post(f"{API}/alumni/jobs/{jid}/interest", headers=stu["headers"], timeout=20)
        assert r.status_code == 400

    def test_delete_job_soft(self, stu):
        jid = pytest.job_id
        r = requests.delete(f"{API}/alumni/jobs/{jid}", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        # Now should NOT be in active list
        listr = requests.get(f"{API}/alumni/jobs", headers=stu["headers"]).json()
        assert not any(j["id"] == jid for j in listr["jobs"])


# ============ REVIEWS ============

class TestReviews:
    def test_get_review_tags(self, stu):
        r = requests.get(f"{API}/alumni/reviews/tags", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "tags" in d and isinstance(d["tags"], list) and len(d["tags"]) > 0

    def test_post_review_self_rejected(self, stu):
        r = requests.post(
            f"{API}/alumni/reviews",
            headers=stu["headers"],
            json={"subject_user_id": stu["user"]["id"], "rating": 5, "tags": ["ใจดี"]},
            timeout=20,
        )
        assert r.status_code == 400

    def test_post_review_awards_xp_and_updates_subject(self, bas, stu):
        # Bas reviews student1
        before_subject = requests.get(f"{API}/alumni/me", headers=stu["headers"]).json()["profile"]
        before_bas = requests.get(f"{API}/alumni/me", headers=bas["headers"]).json()["profile"]
        xp_bas_before = before_bas.get("xp", 0)
        rw_before = before_bas.get("reviews_written", 0)

        r = requests.post(
            f"{API}/alumni/reviews",
            headers=bas["headers"],
            json={
                "subject_user_id": stu["user"]["id"],
                "rating": 5,
                "tags": ["ใจดี", "ช่วยเหลือเก่ง"],
                "comment": "TEST_REVIEW phase2 great mentor",
                "anonymous": False,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        rev = r.json()
        assert rev["rating"] == 5

        # XP and counter for reviewer increased on FIRST review only.
        # Subject's review_avg + count updated
        listr = requests.get(f"{API}/alumni/reviews/user/{stu['user']['id']}", headers=stu["headers"]).json()
        assert listr["total"] >= 1
        assert listr["average_rating"] > 0

        # Notification to subject
        n = requests.get(f"{API}/alumni/notifications", headers=stu["headers"]).json()
        kinds = [x["kind"] for x in n["notifications"]]
        assert "review_received" in kinds

        # XP delta — only assert if this was new (first time)
        after_bas = requests.get(f"{API}/alumni/me", headers=bas["headers"]).json()["profile"]
        if after_bas.get("reviews_written", 0) > rw_before:
            assert after_bas.get("xp", 0) >= xp_bas_before + 25

    def test_post_review_upsert_no_duplicate(self, bas, stu):
        # Same reviewer, same subject -> upsert (rating change)
        r = requests.post(
            f"{API}/alumni/reviews",
            headers=bas["headers"],
            json={
                "subject_user_id": stu["user"]["id"],
                "rating": 4,
                "tags": ["ตอบเร็ว"],
                "comment": "TEST_REVIEW updated",
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # Count still 1 (just from bas)
        listr = requests.get(f"{API}/alumni/reviews/user/{stu['user']['id']}", headers=stu["headers"]).json()
        bas_reviews = [rv for rv in listr["reviews"] if rv.get("reviewer_id") == bas["user"]["id"]]
        assert len(bas_reviews) == 1
        assert bas_reviews[0]["rating"] == 4

    def test_anonymous_review_masks_reviewer(self, din, stu):
        # Din reviews student1 anonymously
        r = requests.post(
            f"{API}/alumni/reviews",
            headers=din["headers"],
            json={
                "subject_user_id": stu["user"]["id"],
                "rating": 5,
                "tags": ["mentor ที่ดี"],
                "comment": "TEST_REVIEW anonymous",
                "anonymous": True,
            },
            timeout=20,
        )
        assert r.status_code == 200, r.text
        listr = requests.get(f"{API}/alumni/reviews/user/{stu['user']['id']}", headers=stu["headers"]).json()
        anon_revs = [rv for rv in listr["reviews"] if rv.get("anonymous")]
        assert len(anon_revs) >= 1
        for rv in anon_revs:
            assert rv["reviewer"]["name"] == "ศิษย์เก่า MKT"
            assert rv["reviewer"]["anonymous"] is True

    def test_list_reviews_summary_fields(self, stu):
        r = requests.get(f"{API}/alumni/reviews/user/{stu['user']['id']}", headers=stu["headers"], timeout=20)
        assert r.status_code == 200
        d = r.json()
        assert "average_rating" in d
        assert "rating_breakdown" in d
        assert "top_tags" in d
        assert isinstance(d["top_tags"], list)
        # rating_breakdown keys 1..5
        for k in ["1", "2", "3", "4", "5"]:
            assert k in d["rating_breakdown"]
