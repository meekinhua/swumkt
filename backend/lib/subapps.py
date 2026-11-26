"""Co-hosted sub-apps — one registry so they cannot collide with the main platform.

Several independent apps are deployed on the same host as SWUMKT, each under its
own URL prefix (``/api/<name>/`` — the only path family the ingress routes to
this backend). This module is the single source of truth for which prefixes are
taken and for the namespaces each sub-app must stay inside. See ``SUBAPPS.md``
at the repo root for the rules a sub-app team follows.

What the main platform guarantees to every sub-app registered here
------------------------------------------------------------------
* No main-platform API route is ever defined under its URL prefix
  (``assert_no_route_collisions`` fails start-up otherwise).
* The platform's paid LLM can never be called from a request under its prefix
  (``lib.llm_policy`` treats these paths as no-LLM routes).
* The main service worker neither intercepts its requests nor deletes its
  caches (``frontend/public/service-worker.js`` mirrors ``SUBAPP_NAMES``).
* Its data namespaces (Mongo collection prefix / own database, object-storage
  prefix, env-var prefix, browser-storage prefix) are reserved for it.
"""
from __future__ import annotations

import importlib.util
import logging
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SubApp:
    name: str                      # url-safe, lowercase
    title: str
    mount: str                     # URL prefix served by this backend
    spa_alias: Optional[str]       # short path in the React app that redirects to `mount`
    db_prefix: str                 # Mongo collections it may create in the shared DB
    env_prefix: str                # environment variables it may read
    storage_prefix: str            # object-storage key prefix and browser-storage key prefix
    auto_mount: bool = False       # mounted by mount_auto_subapps(); False = mounted by hand in server.py


SUBAPPS: Dict[str, SubApp] = {a.name: a for a in (
    SubApp("yolo", "YOLO Detect", "/api/yolo", None, "yolo_", "YOLO_", "yolo"),
    SubApp("meekintube", "meekinTube", "/api/meekintube", "/meekintube", "meekintube_", "MEEKIN_", "meekintube"),
    SubApp("swudorm", "SwuDorm", "/api/swudorm", "/swudorm", "swudorm_", "SWUDORM_", "swudorm", auto_mount=True),
)}
SUBAPP_NAMES = tuple(SUBAPPS)


def subapp_for_path(path: str) -> Optional[SubApp]:
    p = path or ""
    for a in SUBAPPS.values():
        if p == a.mount or p.startswith(a.mount + "/"):
            return a
    return None


def is_subapp_path(path: str) -> bool:
    return subapp_for_path(path) is not None


def owner_of_collection(name: str) -> Optional[SubApp]:
    """Which sub-app owns a Mongo collection name (None = main platform)."""
    for a in SUBAPPS.values():
        if (name or "").startswith(a.db_prefix):
            return a
    return None


def assert_no_route_collisions(route_paths: Iterable[str]) -> None:
    """Fail fast if the main platform defines a route inside a sub-app's prefix."""
    bad: List[str] = sorted({p for p in route_paths if p and is_subapp_path(p)})
    if bad:
        raise RuntimeError(
            "Main-platform routes collide with a reserved sub-app prefix "
            f"(see backend/lib/subapps.py): {bad}")


def _load_asgi(app_dir: Path, name: str):
    """Load `<name>_app/asgi.py` under a unique module name.

    A plain ``import asgi`` / ``from server import app`` would collide with the
    main backend's own modules already in ``sys.modules`` (this bit meekintube
    once), so the package is loaded as ``subapp_<name>`` and must use relative
    imports internally."""
    pkg_name = f"subapp_{name}"
    init = app_dir / "__init__.py"
    spec = importlib.util.spec_from_file_location(
        pkg_name, init if init.exists() else app_dir / "asgi.py",
        submodule_search_locations=[str(app_dir)])
    pkg = importlib.util.module_from_spec(spec)
    sys.modules[pkg_name] = pkg
    spec.loader.exec_module(pkg)
    if init.exists():
        sub = importlib.util.spec_from_file_location(f"{pkg_name}.asgi", app_dir / "asgi.py")
        mod = importlib.util.module_from_spec(sub)
        sys.modules[f"{pkg_name}.asgi"] = mod
        sub.loader.exec_module(mod)
    else:
        mod = pkg
    return getattr(mod, "app")


def mount_auto_subapps(app, root_dir: Path) -> List[str]:
    """Mount every ``auto_mount`` sub-app whose files are present. Never raises:
    a broken sub-app must not take the main platform down.

    Layouts accepted in ``backend/``:
      * ``<name>_app/asgi.py`` exposing ``app`` (any ASGI app; a WSGI/Flask app
        must be wrapped by the sub-app itself, e.g. with a2wsgi) — dynamic app;
      * ``<name>_static/`` with an ``index.html`` — static PWA.
    The dynamic app wins when both exist (it can serve its own static files).
    """
    mounted: List[str] = []
    for a in SUBAPPS.values():
        if not a.auto_mount:
            continue
        try:
            app_dir = Path(root_dir) / f"{a.name}_app"
            static_dir = Path(root_dir) / f"{a.name}_static"
            if (app_dir / "asgi.py").exists():
                app.mount(a.mount, _load_asgi(app_dir, a.name), name=a.name)
            elif (static_dir / "index.html").exists():
                from fastapi.staticfiles import StaticFiles
                app.mount(a.mount, StaticFiles(directory=str(static_dir), html=True), name=a.name)
            else:
                continue
            mounted.append(a.name)
            logger.info("[SUBAPP] mounted %s at %s", a.name, a.mount)
        except Exception as e:  # noqa: BLE001 - isolation is the point
            logger.error("[SUBAPP] %s failed to mount (main platform unaffected): %s", a.name, e)
    return mounted
