#!/usr/bin/env python3
"""dev_sim — boot the REAL FastAPI app locally with no MongoDB and no LLM.

What it does (all in-process, nothing touches production code paths):

* MongoDB  -> mongomock-motor (``motor.motor_asyncio.AsyncIOMotorClient`` is
  replaced before ``server`` is imported; data lives in memory and is lost on
  exit).
* LLM      -> a fake ``emergentintegrations`` package injected into
  ``sys.modules``: ``LlmChat.send_message`` returns canned text,
  ``send_message_multimodal_response`` / ``OpenAIImageGeneration.generate_images``
  return a 1x1 PNG. Every call is appended to ``FAKE_LLM_CALLS`` and logged as
  ``[FAKE-LLM]`` so you can see whether the policy guard let a call through.
  The real server.py monkey-patch (policy guard + throttle) is applied to it.
* Object storage -> in-memory dict (uploads / ``/api/files/...`` work).
* Seeds: an admin and a normal user (credentials printed), one conjoint study
  with synthetic responses (via the real HTTP endpoints), and the simulated
  brand-equity study from ``scripts/seed_simulated_brand_study.py``.
* Optionally serves ``frontend/build`` at ``/`` (SPA fallback) so a browser
  smoke test runs against one origin.

Commands
--------
Backend only (default port 18090)::

    cd backend && /home/user/venv/bin/python scripts/dev_sim.py
    curl -s localhost:18090/api/health
    curl -s -XPOST localhost:18090/api/auth/login -H 'content-type: application/json' \\
         -d '{"email":"admin@swu.ac.th","password":"admin1234"}'

With the frontend on the same origin — the frontend reads its API base from
``REACT_APP_BACKEND_URL`` at BUILD time (several files fall back to the old
preview host when it is empty), so build it pointing at the sim::

    cd frontend && REACT_APP_BACKEND_URL=http://localhost:18090 CI=true yarn build
    cd ../backend && /home/user/venv/bin/python scripts/dev_sim.py --port 18090
    # open http://localhost:18090/

Options: ``--port N``, ``--host H``, ``--no-seed``, ``--no-frontend``,
``--llm-policy on|off`` (writes the stored policy at boot; default: leave the
built-in default, i.e. OFF), ``--frontend-dir PATH``.

Importable helpers (used by tests/test_llm_policy.py)::

    from scripts.dev_sim import install_fake_emergentintegrations, prepare_sim_env
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import logging
import os
import sys
import types
import uuid
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

ADMIN_EMAIL = "admin@swu.ac.th"      # also the owner used by seed_simulated_brand_study.py
ADMIN_PASSWORD = "admin1234"
USER_EMAIL = "student@swu.ac.th"
USER_PASSWORD = "student1234"

FAKE_REPLY = "[FAKE-LLM] นี่คือข้อความจำลองจาก dev_sim — ไม่ได้เรียก LLM จริง"
# 1x1 transparent PNG
PNG_1x1_B64 = ("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA"
               "60e6kgAAAABJRU5ErkJggg==")

FAKE_LLM_CALLS: List[Dict[str, Any]] = []


# ---------------------------------------------------------------------------
# Fake emergentintegrations
# ---------------------------------------------------------------------------
def install_fake_emergentintegrations(reply: str = FAKE_REPLY, calls: List[Dict[str, Any]] = None,
                                      with_image_module: bool = False) -> Dict[str, types.ModuleType]:
    """Inject a minimal fake ``emergentintegrations`` into sys.modules.

    Returns the created modules. Idempotent per process only if you do not
    mind replacing the previous fake (tests call it once per module).
    """
    log = calls if calls is not None else FAKE_LLM_CALLS

    class UserMessage:
        def __init__(self, text: str = None, file_contents=None, **kw):
            self.text = text
            self.file_contents = file_contents or []

    class ImageContent:
        def __init__(self, image_base64: str = None, **kw):
            self.image_base64 = image_base64

    class FileContentWithMimeType:
        def __init__(self, file_path: str = None, mime_type: str = None, **kw):
            self.file_path, self.mime_type = file_path, mime_type

    class LlmChat:
        def __init__(self, api_key: str = None, session_id: str = None,
                     system_message: str = None, **kw):
            self.api_key, self.session_id, self.system_message = api_key, session_id, system_message
            self.provider, self.model, self.params = None, None, {}

        def with_model(self, provider, model):
            self.provider, self.model = provider, model
            return self

        def with_params(self, **kw):
            self.params.update(kw)
            return self

        async def send_message(self, user_message):
            text = getattr(user_message, "text", user_message)
            log.append({"kind": "chat", "model": self.model, "session": self.session_id,
                        "prompt": (text or "")[:200]})
            logging.getLogger("dev_sim").info("[FAKE-LLM] chat model=%s session=%s",
                                              self.model, self.session_id)
            return reply

        async def send_message_multimodal_response(self, user_message):
            log.append({"kind": "image", "model": self.model, "session": self.session_id})
            logging.getLogger("dev_sim").info("[FAKE-LLM] multimodal model=%s", self.model)
            return reply, [{"mime_type": "image/png", "data": PNG_1x1_B64}]

    class OpenAIImageGeneration:
        def __init__(self, api_key: str = None, **kw):
            self.api_key = api_key

        async def generate_images(self, prompt: str = "", model: str = None,
                                  number_of_images: int = 1, **kw):
            log.append({"kind": "image", "model": model, "prompt": (prompt or "")[:200]})
            logging.getLogger("dev_sim").info("[FAKE-LLM] generate_images model=%s", model)
            return [base64.b64decode(PNG_1x1_B64) for _ in range(max(1, number_of_images))]

    def mk(name):
        m = types.ModuleType(name)
        m.__path__ = []  # mark as package
        m.__dict__["__fake_dev_sim__"] = True
        return m

    root = mk("emergentintegrations")
    llm = mk("emergentintegrations.llm")
    chat = mk("emergentintegrations.llm.chat")
    oa = mk("emergentintegrations.llm.openai")
    ig = mk("emergentintegrations.llm.openai.image_generation")
    chat.LlmChat, chat.UserMessage, chat.ImageContent = LlmChat, UserMessage, ImageContent
    chat.FileContentWithMimeType = FileContentWithMimeType
    ig.OpenAIImageGeneration = OpenAIImageGeneration
    root.llm, llm.chat, llm.openai, oa.image_generation = llm, chat, oa, ig
    mods = {m.__name__: m for m in (root, llm, chat, oa, ig)}
    if with_image_module:
        im = mk("emergentintegrations.image")

        async def generate_image(*a, **kw):
            log.append({"kind": "image", "model": "emergentintegrations.image"})
            return base64.b64decode(PNG_1x1_B64)
        im.generate_image = generate_image
        root.image = im
        mods[im.__name__] = im
    sys.modules.update(mods)
    return mods


# ---------------------------------------------------------------------------
# Environment (call BEFORE importing server)
# ---------------------------------------------------------------------------
_OBJSTORE: Dict[str, Any] = {}


def patch_object_storage() -> None:
    from lib import object_storage as osm

    osm._storage_key = "dev-sim"
    osm.init_storage_sync = lambda: "dev-sim"

    def _put(path, data, content_type):
        _OBJSTORE[path] = (bytes(data), content_type)
        return {"path": path, "size": len(data), "etag": uuid.uuid4().hex}

    def _get(path):
        if path not in _OBJSTORE:
            raise RuntimeError("404 not found")
        return _OBJSTORE[path]
    osm._do_put, osm._do_get = _put, _get


def prepare_sim_env(db_name: str = "swumkt_sim") -> None:
    """Env vars + mongomock motor + fake LLM + in-memory object storage."""
    os.environ.setdefault("MONGO_URL", "mongodb://dev-sim.invalid:27017")
    os.environ["DB_NAME"] = os.environ.get("DEV_SIM_DB_NAME", db_name)
    os.environ.setdefault("JWT_SECRET", "dev-sim-" + "x" * 40)
    os.environ.setdefault("EMERGENT_LLM_KEY", "sk-emergent-dev-sim-fake")
    os.environ.setdefault("CORS_ORIGINS", "*")
    os.environ.setdefault("FRONTEND_URL", "http://localhost:18090")
    if not (os.environ.get("VAPID_PRIVATE_KEY") and os.environ.get("VAPID_PUBLIC_KEY")):
        # notification_service refuses to import without a key pair; make a
        # throwaway P-256 pair (push delivery itself is not exercised here).
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        k = ec.generate_private_key(ec.SECP256R1())
        b64 = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()  # noqa: E731
        os.environ["VAPID_PRIVATE_KEY"] = b64(k.private_numbers().private_value.to_bytes(32, "big"))
        os.environ["VAPID_PUBLIC_KEY"] = b64(k.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

    import motor.motor_asyncio as mma
    from mongomock_motor import AsyncMongoMockClient

    class _SimClient(AsyncMongoMockClient):
        """Ignore pymongo pool kwargs mongomock does not understand."""
        def __init__(self, *a, **kw):
            for k in ("maxPoolSize", "minPoolSize", "maxIdleTimeMS", "waitQueueTimeoutMS",
                      "serverSelectionTimeoutMS", "connectTimeoutMS", "socketTimeoutMS"):
                kw.pop(k, None)
            super().__init__(*a, **kw)
    mma.AsyncIOMotorClient = _SimClient

    if "emergentintegrations" not in sys.modules:
        install_fake_emergentintegrations()
    patch_object_storage()


# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
async def seed_users(server) -> Dict[str, Dict[str, str]]:
    from datetime import datetime, timezone
    out = {}
    for email, pw, role, name in ((ADMIN_EMAIL, ADMIN_PASSWORD, "admin", "Sim Admin"),
                                  (USER_EMAIL, USER_PASSWORD, "student", "Sim Student")):
        existing = await server.db.users.find_one({"email": email})
        if existing:
            out[role] = {"email": email, "password": pw, "id": existing["id"]}
            continue
        uid = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await server.db.users.insert_one({
            "id": uid, "email": email, "full_name": name, "role": role,
            "user_type": "regular", "auth_method": "email",
            "password": server.hash_password(pw),
            "can_export_thesis": role == "admin",
            "created_at": now, "updated_at": now,
        })
        out[role] = {"email": email, "password": pw, "id": uid}
    return out


async def seed_conjoint(app, admin_token: str, n_resp: int = 60) -> str:
    """One small conjoint study with synthetic logit responses, created through
    the real endpoints so the stored shape is exactly what production writes."""
    import random
    import httpx
    H = {"Authorization": f"Bearer {admin_token}"}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://sim") as c:
        r = await c.post("/api/conjoint/studies", headers=H, json={
            "title": "DEMO · กาแฟกระป๋อง (ข้อมูลจำลอง)",
            "description": "สร้างโดย dev_sim — ข้อมูลจำลอง", "product_category": "เครื่องดื่ม"})
        r.raise_for_status()
        sid = r.json()["study_id"]
        attrs = [
            {"name": "แบรนด์", "levels": [{"value": "A"}, {"value": "B"}, {"value": "C"}]},
            {"name": "ราคา", "levels": [{"value": "15 บาท"}, {"value": "25 บาท"}, {"value": "35 บาท"}]},
            {"name": "ความหวาน", "levels": [{"value": "หวานน้อย"}, {"value": "หวานปกติ"}]},
        ]
        r = await c.put(f"/api/conjoint/studies/{sid}/attributes", headers=H, json={"attributes": attrs})
        r.raise_for_status()
        r = await c.post(f"/api/conjoint/studies/{sid}/generate-design", headers=H,
                         json={"alternatives_per_set": 3, "number_of_sets": 8})
        r.raise_for_status()
        r = await c.put(f"/api/conjoint/studies/{sid}/status", headers=H,
                        json={"status": "active", "reason": "dev_sim seed"})
        r.raise_for_status()
        survey = (await c.get(f"/api/conjoint/survey/{sid}")).json()
        # true utilities by level value
        util = {"A": 0.6, "B": 0.2, "C": 0.0, "15 บาท": 1.2, "25 บาท": 0.5, "35 บาท": 0.0,
                "หวานน้อย": 0.4, "หวานปกติ": 0.0}
        lvl_value = {l["id"]: l["value"] for a in survey["attributes"] for l in a["levels"]}
        rng = random.Random(4242)
        import math
        for i in range(n_resp):
            answers = []
            for cs in survey["choice_sets"]:
                # utility + Gumbel(0,1) noise -> multinomial-logit choices
                us = [sum(util.get(lvl_value.get(lid), 0) for lid in p["attribute_levels"].values())
                      - math.log(-math.log(rng.random())) for p in cs["profiles"]]
                best = max(range(len(us)), key=lambda k: us[k])
                answers.append({"choice_set_id": cs["id"],
                                "selected_profile_id": cs["profiles"][best]["id"]})
            r = await c.post(f"/api/conjoint/survey/{sid}/response", json={
                "respondent_id": f"sim-{i}", "responses": answers,
                "demographics": {"age": rng.choice(["18-24", "25-34", "35-44"]),
                                 "gender": rng.choice(["male", "female"])},
                "duration_sec": rng.randint(90, 400)})
            r.raise_for_status()
        return sid


async def seed_brand_equity(server) -> str:
    """Run scripts/seed_simulated_brand_study.py against the sim db.

    That script runs ``asyncio.run(main())`` at import time and opens its own
    motor client, so its source is exec'd without the last line, with the
    client pointed at the sim db.
    """
    src = (BACKEND_DIR / "scripts" / "seed_simulated_brand_study.py").read_text(encoding="utf-8")
    src = src.replace("\nasyncio.run(main())", "\n# (dev_sim: main() awaited by caller)")
    ns: Dict[str, Any] = {"__name__": "seed_simulated_brand_study_sim"}
    cwd = os.getcwd()
    try:
        exec(compile(src, "seed_simulated_brand_study.py", "exec"), ns)
    finally:
        os.chdir(cwd)

    class _Client:
        def __init__(self, *a, **kw):
            pass

        def __getitem__(self, name):
            return server.db
    ns["AsyncIOMotorClient"] = _Client
    await ns["main"]()
    return ns["STUDY_ID"]


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
def mount_frontend(app, build_dir: Path) -> bool:
    index = build_dir / "index.html"
    if not index.exists():
        return False
    from fastapi.responses import FileResponse, JSONResponse

    root = build_dir.resolve()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def _spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse({"detail": "Not Found"}, status_code=404)
        target = (root / full_path).resolve()
        if full_path and target.is_file() and str(target).startswith(str(root)):
            return FileResponse(str(target))
        return FileResponse(str(index))
    return True


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Run the SWUMKT backend with mongomock + fake LLM.")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=int(os.environ.get("DEV_SIM_PORT", 18090)))
    p.add_argument("--no-seed", action="store_true")
    p.add_argument("--no-frontend", action="store_true")
    p.add_argument("--frontend-dir", default=str(REPO_DIR / "frontend" / "build"))
    p.add_argument("--llm-policy", choices=["on", "off"], default=None,
                   help="store system_llm_enabled at boot (default: built-in default, OFF)")
    a = p.parse_args(argv)

    os.chdir(BACKEND_DIR)
    prepare_sim_env()
    logging.basicConfig(level=logging.INFO)
    import server  # noqa: E402  (after prepare_sim_env)
    from lib import llm_policy

    app = server.app
    info: Dict[str, Any] = {}

    async def _seed():
        users = await seed_users(server)
        info["users"] = users
        if a.llm_policy:
            await llm_policy.update_policy({"system_llm_enabled": a.llm_policy == "on"},
                                           updated_by="dev_sim")
        if a.no_seed:
            return
        token = server.create_access_token(users["admin"]["id"], ADMIN_EMAIL, "admin")
        try:
            info["conjoint"] = await seed_conjoint(app, token)
        except Exception as e:  # keep the sim usable even if a module changed
            logging.exception("[dev_sim] conjoint seed failed")
            info["conjoint"] = f"FAILED: {e}"
        try:
            info["brand_equity"] = await seed_brand_equity(server)
        except Exception as e:
            logging.exception("[dev_sim] brand-equity seed failed")
            info["brand_equity"] = f"FAILED: {e}"

    @app.on_event("startup")
    async def _dev_sim_seed():
        await _seed()
        print("\n" + "=" * 70)
        print(f" dev_sim ready on http://{a.host}:{a.port}")
        print(f"   admin : {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print(f"   user  : {USER_EMAIL} / {USER_PASSWORD}")
        print(f"   conjoint study    : {info.get('conjoint', '-')}")
        print(f"   brand-equity study: {info.get('brand_equity', '-')}")
        print(f"   frontend          : {'served at /' if info.get('frontend') else 'not served'}")
        print(f"   system LLM policy : {'ON' if (await llm_policy.get_policy())['system_llm_enabled'] else 'OFF'}"
              " (fake LLM — nothing is billed either way)")
        print("=" * 70 + "\n", flush=True)

    if not a.no_frontend:
        info["frontend"] = mount_frontend(app, Path(a.frontend_dir))

    import uvicorn
    uvicorn.run(app, host=a.host, port=a.port, log_level="info")
    return 0


if __name__ == "__main__":
    sys.exit(main())
