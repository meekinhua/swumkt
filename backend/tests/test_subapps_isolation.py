"""Co-hosted sub-apps (SwuDorm, meekinTube, YOLO) must not collide with the main platform."""
import os
import re
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
sys.path.insert(0, str(BACKEND))

from lib import subapps  # noqa: E402
from lib import llm_policy  # noqa: E402


def test_swudorm_is_reserved_with_its_own_namespaces():
    a = subapps.SUBAPPS["swudorm"]
    assert a.mount == "/api/swudorm" and a.spa_alias == "/swudorm"
    assert (a.db_prefix, a.env_prefix, a.storage_prefix) == ("swudorm_", "SWUDORM_", "swudorm")
    assert a.auto_mount


def test_namespaces_do_not_overlap_between_subapps():
    apps = list(subapps.SUBAPPS.values())
    for field in ("mount", "db_prefix", "env_prefix", "storage_prefix"):
        vals = [getattr(a, field) for a in apps]
        assert len(set(vals)) == len(vals), field
        for x in vals:
            assert not any(y != x and y.startswith(x) for y in vals), (field, x)


def test_path_matching_is_exact_on_the_segment():
    assert subapps.is_subapp_path("/api/swudorm")
    assert subapps.is_subapp_path("/api/swudorm/rooms/1")
    assert not subapps.is_subapp_path("/api/swudormitory")
    assert not subapps.is_subapp_path("/api/surveys")
    assert subapps.owner_of_collection("swudorm_rooms").name == "swudorm"
    assert subapps.owner_of_collection("surveys") is None


def test_route_collision_check():
    subapps.assert_no_route_collisions(["/api/surveys", "/api/health"])
    with pytest.raises(RuntimeError):
        subapps.assert_no_route_collisions(["/api/swudorm/anything"])


def test_main_route_decorators_stay_out_of_subapp_prefixes():
    """Static scan of every route decorator in the main backend."""
    pat = re.compile(r"@\w+\.(?:get|post|put|patch|delete|api_route)\(\s*[\"']([^\"']+)[\"']")
    prefixes = {"alumni.py": "/alumni", "alumni_phase2.py": "/alumni", "brand_equity.py": "/brand-equity",
                "cms.py": "/cms", "content_ops.py": "/cms", "customer_value.py": "/cv",
                "journey.py": "/journey", "media.py": "/media", "projects.py": "/projects", "share.py": "/share"}
    found = []
    for f in [BACKEND / "server.py", *sorted((BACKEND / "routes").glob("*.py")), *sorted((BACKEND / "lib").glob("*routes*.py"))]:
        for m in pat.finditer(f.read_text(encoding="utf-8")):
            found.append("/api" + prefixes.get(f.name, "") + m.group(1))
    assert len(found) > 300
    assert [p for p in found if subapps.is_subapp_path(p)] == []


def test_main_collections_do_not_use_a_subapp_prefix():
    pat = re.compile(r"\bdb\.([a-z_][a-z0-9_]*)\.")
    names = set()
    for f in [BACKEND / "server.py", *(BACKEND / "routes").glob("*.py"), *(BACKEND / "lib").glob("*.py")]:
        names.update(pat.findall(f.read_text(encoding="utf-8")))
    assert len(names) > 40
    assert sorted(n for n in names if subapps.owner_of_collection(n)) == []


def test_platform_llm_is_never_available_under_a_subapp_prefix():
    for a in subapps.SUBAPPS.values():
        assert llm_policy.feature_for_path(a.mount + "/api/ask") == llm_policy.NO_LLM
    assert llm_policy.feature_for_path("/api/translate") != llm_policy.NO_LLM


def test_service_worker_lists_every_subapp_and_only_deletes_its_own_caches():
    sw = (REPO / "frontend" / "public" / "service-worker.js").read_text(encoding="utf-8")
    listed = re.search(r"SUBAPP_PREFIXES\s*=\s*\[([^\]]*)\]", sw).group(1)
    assert sorted(re.findall(r"'([^']+)'", listed)) == sorted(a.mount for a in subapps.SUBAPPS.values())
    assert "cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME" in sw
    # the fetch handler bails out for sub-app paths before any respondWith
    fetch = sw[sw.index("addEventListener('fetch'"):]
    assert fetch.index("isSubappPath(url.pathname)") < fetch.index("respondWith")


def test_spa_alias_routes_exist_in_the_frontend():
    app_js = (REPO / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
    for a in subapps.SUBAPPS.values():
        if a.spa_alias:
            assert f'path="{a.spa_alias}' in app_js and f'to="{a.mount}/"' in app_js, a.name


def _client(tmp_path, files):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    for rel, text in files.items():
        p = tmp_path / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    app = FastAPI()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    mounted = subapps.mount_auto_subapps(app, tmp_path)
    return TestClient(app), mounted


def test_static_subapp_is_mounted_from_its_own_folder(tmp_path):
    client, mounted = _client(tmp_path, {"swudorm_static/index.html": "<h1>dorm</h1>"})
    assert mounted == ["swudorm"]
    assert "dorm" in client.get("/api/swudorm/").text
    assert client.get("/api/health").json() == {"status": "ok"}


def test_asgi_subapp_is_loaded_under_its_own_module_name(tmp_path):
    sys.modules.pop("subapp_swudorm", None)
    client, mounted = _client(tmp_path, {
        "swudorm_app/__init__.py": "",
        "swudorm_app/models.py": "ROOMS = ['A101']\n",
        "swudorm_app/asgi.py": (
            "from fastapi import FastAPI\nfrom .models import ROOMS\napp = FastAPI()\n"
            "@app.get('/rooms')\ndef rooms():\n    return ROOMS\n"),
    })
    assert mounted == ["swudorm"]
    assert client.get("/api/swudorm/rooms").json() == ["A101"]
    assert "subapp_swudorm" in sys.modules and "asgi" not in sys.modules


def test_a_broken_subapp_does_not_stop_the_platform(tmp_path):
    sys.modules.pop("subapp_swudorm", None)
    client, mounted = _client(tmp_path, {"swudorm_app/asgi.py": "raise RuntimeError('boom')\n"})
    assert mounted == []
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/swudorm/").status_code == 404


def test_nothing_is_mounted_when_the_folders_are_absent(tmp_path):
    client, mounted = _client(tmp_path, {})
    assert mounted == []
