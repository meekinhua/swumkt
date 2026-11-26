# Co-hosted sub-apps (meekinTube, YOLO, future projects) — how not to collide

Several independent projects are deployed on the **same host and the same backend process**
as the SWUMKT platform. Each lives under its own URL prefix. The registry is
`backend/lib/subapps.py`; this page is the contract for a sub-app team.

| Sub-app | URL prefix | Short link | Mongo prefix | Env prefix | Storage / browser prefix |
|---|---|---|---|---|---|
| YOLO Detect | `/api/yolo/` | – | `yolo_` | `YOLO_` | `yolo` |
| meekinTube | `/api/meekintube/` | `/meekintube` | `meekintube_` | `MEEKIN_` | `meekintube` |

**Nothing is reserved yet for the dormitory project** (working name SwuDorm; the name is not final and it is
not being deployed yet). When its name is decided, register it as described under "Adding another sub-app";
the examples below use `<name>` / `<NAME>` for it.

Only `/api/*` reaches this backend through the ingress, which is why every prefix starts with `/api/`.

## Shipping a new sub-app — no edits to main-platform feature files

Put the app in **its own folder** and once registered it is mounted automatically at `/api/<name>/`:

- `backend/<name>_app/asgi.py` exposing `app` (FastAPI/Starlette, or Flask wrapped with `a2wsgi`), **or**
- `backend/<name>_static/index.html` for a static PWA.

Do not edit `backend/server.py`, `frontend/src/App.js` or anything under `backend/routes`, `backend/lib`,
`frontend/src` — that is what causes merge conflicts between the two projects. If the mount fails the
main platform still starts and logs `[SUBAPP] <name> failed to mount`.

## Rules for a sub-app

1. **URLs.** Everything under your prefix. Use **relative** asset and API paths (`./app.js`, `api/rooms`),
   or read the base from `location.pathname`; never assume the app is at `/`.
2. **Python modules.** The package is loaded as `subapp_<name>`. Use relative imports (`from .models import …`).
   Never `import server`, `import routes`, `import lib` — those names belong to the main backend.
3. **Database.** Either your own database (`<NAME>_DB_NAME`, same `MONGO_URL`) or collections named
   `<name>_*` in the shared one. Never read or write a collection without your prefix — `users`,
   `surveys`, `alumni_*`, `brand_*`, `conjoint_*`, `cms_*`, `platform_settings` … are the main platform's.
4. **Auth.** Sub-apps do not share the platform login by default. Do not read the browser's `token`
   key and do not mint JWTs with the platform's `JWT_SECRET`. If single sign-on is wanted, ask for a
   verify endpoint instead of reading the secret.
5. **Browser storage** is shared by the whole origin. Prefix every `localStorage` / `sessionStorage` /
   IndexedDB / Cache Storage name with your name (e.g. `<name>:token`, cache `<name>-cache-v1`).
   Keys the main platform already uses: `token`, `pending_invite_code`, `be_lang`, `perception_questions`,
   caches `swumkt-cache-*`.
6. **Service worker.** Register with scope `/api/<name>/` only. When cleaning old caches, delete only
   names starting with your own prefix — never `caches.keys()` → delete all.
7. **Environment variables** start with `<NAME>_`. Do not reuse `JWT_SECRET`, `EMERGENT_LLM_KEY`,
   `DB_NAME`, `CORS_ORIGINS`, `ALUMNI_OPTOUT_SALT`.
8. **No platform LLM.** Calls to the platform's paid LLM from a request under a sub-app prefix are
   refused unconditionally. Bring your own key under `<NAME>_…` and call your provider directly.
9. **Object storage / uploads.** Keys under `<name>/…`.
10. **Dependencies.** One Python environment is shared: add to `backend/requirements.txt` without
    changing existing pins; if a pin must change, coordinate first.
11. **Process hygiene.** No module-level work that can fail or block start-up, no background threads
    started at import, no `logging.basicConfig`, no `os.chdir`, no `sys.path` edits.
12. **Git.** Work on your own branch; touch only `backend/<name>_*`, `backend/tests/test_<name>_*`
    and a `requirements.txt` append.

## What the main platform guarantees (enforced by `backend/tests/test_subapps_isolation.py`)

- No main route is defined under a reserved prefix (start-up fails otherwise).
- The main service worker neither intercepts sub-app requests nor deletes sub-app caches.
- LLM billing cannot be triggered from a sub-app path.
- A broken sub-app cannot stop the main platform from starting.

## Adding another sub-app

Three small edits, done once by the main-platform owner when the name is final:

1. one `SubApp(...)` line in `backend/lib/subapps.py` (a commented example is there);
2. the prefix in `SUBAPP_PREFIXES` in `frontend/public/service-worker.js`;
3. optionally a short-link redirect route in `frontend/src/App.js`, and a row in the table above.

`backend/tests/test_subapps_isolation.py` fails if 1 and 2 disagree.
