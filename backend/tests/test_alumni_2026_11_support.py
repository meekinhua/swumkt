"""Shared fixtures for the 2026-11 alumni tests (no tests here).

Builds a minimal FastAPI app that mounts ONLY the alumni routers on a
mongomock-motor database with a fake `get_current_user` (header X-User).
Needs neither MongoDB nor an LLM key.
"""
import asyncio
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, "/app/backend")
os.chdir("/app/backend")

import pytest  # noqa: E402
from fastapi import APIRouter, FastAPI, Header, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402


def run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class Env:
    def __init__(self):
        from lib import ttl_cache
        ttl_cache._store.clear()
        from routes.alumni import get_alumni_routes
        from routes.alumni_phase2 import get_phase2_routes

        self.db = AsyncMongoMockClient()["alumni_2026_11_test"]
        self.users = {}

        async def get_current_user(x_user: str = Header(None)):
            u = self.users.get(x_user)
            if not u:
                raise HTTPException(status_code=401, detail="no user")
            return u

        async def get_optional_user(x_user: str = Header(None)):
            return self.users.get(x_user)

        api = APIRouter(prefix="/api")
        r1, helpers = get_alumni_routes(self.db, get_current_user, get_optional_user, None)
        api.include_router(r1)
        api.include_router(get_phase2_routes(self.db, get_current_user, get_optional_user, helpers))
        app = FastAPI()
        app.include_router(api)
        self.helpers = helpers
        self.client = TestClient(app)

    # ---- people
    def user(self, uid, name=None, role="alumni"):
        u = SimpleNamespace(id=uid, email=f"{uid}@g.swu.ac.th", full_name=name or uid.title(), role=role)
        self.users[uid] = u
        run(self.db.users.insert_one({"id": uid, "email": u.email, "full_name": u.full_name, "role": role}))
        return u

    def member(self, uid, gen, nickname=None, gender=None, name=None, role="alumni", platform_role="alumni"):
        self.user(uid, name=name, role=platform_role)
        r = self.post(uid, "/alumni/register", {"student_id": f"{gen}{abs(hash(uid)) % 10**6:06d}", "gen": gen,
                                               "nickname": nickname or uid, "role": role,
                                               "kinship_gender": gender})
        assert r.status_code == 200, r.text
        return r.json()

    def admin(self, uid="admin"):
        return self.user(uid, role="admin")

    # ---- http
    def h(self, uid):
        return {"X-User": uid} if uid else {}

    def get(self, uid, path, **kw):
        return self.client.get("/api" + path, headers=self.h(uid), **kw)

    def post(self, uid, path, json=None, **kw):
        return self.client.post("/api" + path, headers=self.h(uid), json=json, **kw)

    def put(self, uid, path, json=None, **kw):
        return self.client.put("/api" + path, headers=self.h(uid), json=json, **kw)

    def delete(self, uid, path, **kw):
        return self.client.delete("/api" + path, headers=self.h(uid), **kw)

    # ---- shortcuts
    def claim(self, uid, junior, senior):
        return self.post(uid, "/alumni/relations/claim", {"junior_id": junior, "senior_id": senior})

    def respond(self, uid, rid, accept=True):
        return self.put(uid, f"/alumni/relations/{rid}/respond", {"accept": accept})

    def link(self, junior, senior):
        """Fully confirmed real↔real link."""
        r = self.claim(junior, junior, senior)
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        r2 = self.respond(senior, rid, True)
        assert r2.status_code == 200 and r2.json()["status"] == "confirmed", r2.text
        return rid

    def ghost(self, uid, name, gen, attach_as="senior", to=None, gender=None, force=True):
        body = {"display_name": name, "gen": gen, "force": force, "gender": gender}
        if attach_as:
            body["attach"] = {"as": attach_as, "to": to}
        r = self.post(uid, "/alumni/ghosts", body)
        assert r.status_code == 200, r.text
        return r.json()

    def rel(self, rid):
        return run(self.db.alumni_relations.find_one({"id": rid}, {"_id": 0}))


@pytest.fixture
def env():
    return Env()
