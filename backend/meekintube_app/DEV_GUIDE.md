# meekinTube — Developer Handoff Guide

> สำหรับ dev agent ที่จะนำไปติดตั้ง/พัฒนาต่อบน Emergent platform
> A self-hosted PWA to **search, watch, and download** YouTube / Facebook videos,
> with a fully **client-side (offline) library**. Built with Flask (thin backend) + vanilla JS PWA.

---

## 1. What it is (1-paragraph)

A single-user web app. The **browser** is the UI + the **library store** (downloaded videos live in
IndexedDB on the device → playable offline). The **server** only does the things a browser physically
*cannot*: run `yt-dlp` to download videos, and proxy YouTube's search/suggest/related APIs (which block
CORS from browsers). When a download finishes, the client pulls the file into IndexedDB and tells the
server to **delete its copy** (so server disk never fills). It's a PWA → installable on mobile, with
lock-screen media controls (Media Session API) and playlists.

---

## 2. ⚠️ Critical constraints — DO NOT "fix" these (they're intentional)

These were proven during development. Don't waste effort trying to move them client-side.

| Thing | Why it MUST stay server-side |
|---|---|
| **Downloading** (`yt-dlp`) | A browser cannot run yt-dlp, and YouTube media (googlevideo.com) is **CORS-blocked** for browser fetch. No WASM/Pyodide fixes this — the wall is CORS + process execution, not compute. |
| **Search / suggest / related / home feed** | They call YouTube InnerTube / suggest APIs which **block CORS** from browser origins. Must be proxied through the server. |

Everything else is already client-side: UI, the video **library (IndexedDB)**, playback (Blob URLs),
**thumbnails** (generated in-browser via Canvas), offline app shell (service worker).

So: **server = thin gateway used only when ONLINE to acquire new content.** Once a video is on the
device, the app works fully offline without the server.

---

## 3. Tech stack

- **Backend:** Python 3 + Flask (single file `server.py`, ~700 lines). No DB. Threaded dev server.
- **Frontend:** Vanilla JS (no framework/build step) — `static/app.js`, `db.js`, `index.html`, `style.css`, `sw.js`.
- **Client storage:** IndexedDB (`db.js` — stores: `meta`, `blobs`, `playlists`).
- **System tools (must be in PATH):** `yt-dlp`, `ffmpeg`, `node` (node is the JS runtime yt-dlp needs to
  decode YouTube signatures — without it MANY clips fail).

---

## 4. Project structure

```
webapp/
  server.py              # Flask backend (download + YT-API proxy + static + /media + /purge)
  requirements.txt       # Flask, send2trash
  DEV_GUIDE.md           # this file
  make_icons*.py         # dev-only: regenerate PWA icons from a source image
  static/
    index.html           # app shell (SVG icon sprite + 3 tabs + player modal + sheet)
    style.css            # all styles (mobile-first; bottom nav on mobile, top tabs on desktop)
    app.js               # all app logic (~950 lines)
    db.js                # IndexedDB wrapper (window.LibDB)
    sw.js                # service worker (offline app shell)
    manifest.webmanifest # PWA manifest
    logo.png             # wordmark logo (header + hero)
    icon-192/512.png, icon-maskable-512.png  # PWA icons
```
Run-time data folder (NOT in repo): `../video/` — transient download staging, auto-purged.

---

## 5. Run locally

```bash
cd webapp
pip install -r requirements.txt          # Flask + send2trash
pip install -U yt-dlp                     # downloader
# ensure ffmpeg + node are installed and in PATH (apt/brew/winget/pkg)
python server.py                          # serves http://127.0.0.1:8787
#   --lan        bind 0.0.0.0 (let phones on same Wi-Fi reach it)
#   --no-open    don't auto-open a browser
# env: PORT / MEEKIN_PORT (default 8787), MEEKIN_VIDEO_DIR (default ../video)
```
Open `http://localhost:8787`. (PWA install/offline/Media-Session require **HTTPS** on mobile — localhost is treated as secure, a LAN http IP is NOT.)

---

## 6. HTTP API (all same-origin)

| Method/Path | Purpose |
|---|---|
| `GET /` , `/static/<f>` , `/sw.js` , `/manifest.webmanifest` , `/<icon>.png` , `/logo.png` | static app shell |
| `GET /api/config` | health/ping (client uses to detect online) |
| `GET /api/search?q=&n=` | YouTube search (yt-dlp `ytsearchN:`) |
| `GET /api/suggest?q=` | search autocomplete (Google suggest proxy) |
| `GET /api/related?id=<11-char>` | related videos (InnerTube `/next`, `lockupViewModel`) |
| `GET /api/home?ids=id,id,...` | home feed = aggregated related of the client's library seeds |
| `POST /api/download` `{urls[],quality,whole,live}` | start yt-dlp job(s) → returns `{ids[]}` |
| `GET /api/status` | poll all jobs `[{id,state,pct,speed,title,rel,...}]` |
| `GET /media/<relpath>` | serve a staging file; supports **Range**, and **tail-streams** a still-downloading file (reports final size via yt-dlp progress) |
| `GET /thumb/<relpath>` | server-side ffmpeg thumbnail (legacy; client now makes its own thumbs) |
| `GET /api/files` | list staging files (used by client to import/cleanup) |
| `POST /api/purge` `{rel}` | **permanently delete** a staging file after client stored it (frees disk) |
| `POST /api/delete` `{rel}` | move a staging file to Recycle Bin (user-initiated) |
| `POST /api/open` | open the staging folder in OS file manager (desktop helper) |
| `POST /api/clear` | clear finished/errored jobs from memory |

---

## 7. Key flows (so you understand the code)

- **Single-transfer download+play (`streamPlayAndStore` in app.js):** one `fetch('/media/..')` is read as a
  stream → fed to a growing-Blob `<video>` (live playback) AND accumulated → stored to IndexedDB → then
  `/api/purge` deletes the server copy. Server uploads each file **once** (1× egress). `liveHandled` Set
  dedupes so the same job isn't fetched twice.
- **Library (IndexedDB):** `LibDB` (db.js). `meta` store = {id, name, thumb(Blob), size, kind, ext, addedAt};
  `blobs` store = id→video Blob; `playlists` store = {id, name, items[], createdAt}. id = the YouTube 11-char id
  (or the rel path for non-YT). Thumbnails generated client-side (`makeThumb` → Canvas frame grab).
- **Media Session (lock screen):** metadata + artwork + play/pause/seekto/prev/next. **Note:** seekbackward/
  seekforward handlers are intentionally NOT set — on iOS they replace the prev/next-track buttons.
  prev/next use a `pmQueue`/`pmIndex` set from whatever list was clicked (library / search / related / playlist).
- **Offline:** `sw.js` caches the app shell; `/api//media//thumb` are network-only. App detects server
  reachability (`pingServer`) and disables search/download UI when offline; library still plays from IndexedDB.
- **Auto-update:** `controllerchange` → `location.reload()` so a new SW version takes over (important on iOS).
  There's a version label at the page bottom (`APP_VER` in app.js); bump `CACHE` in sw.js + `APP_VER` together
  on each release.

---

## 8. 🎯 TASK: serve under a sub-directory (e.g. `https://app.emergent…/meekintube/`)

The app currently assumes it lives at the **origin root** (`/`). To mount it under a sub-path you must
prefix every absolute path. Two parts:

### 8a. Determine how the platform's proxy routes
- **If the proxy STRIPS the prefix** before forwarding to Flask (Flask still sees `/api/...`): you only
  need the **frontend** changes (8b). Server stays unchanged. ← simplest, prefer this.
- **If the proxy KEEPS the prefix** (Flask sees `/meekintube/api/...`): also do the **server** change (8c).

### 8b. Frontend changes (always needed)
1. **`index.html`** — make asset refs relative (drop leading `/`): `static/style.css`, `static/db.js`,
   `static/app.js`, `logo.png`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest`.
   (Or add `<base href="/meekintube/">` and keep them relative.)
2. **`app.js` + `db.js`** — introduce a base prefix and use it for ALL network calls:
   ```js
   const BASE = new URL('.', document.baseURI).pathname;   // e.g. "/meekintube/"
   // then replace every absolute call:  fetch("/api/x")  ->  fetch(BASE+"api/x")
   //   /media/..  ->  BASE+"media/.."     /thumb/..  ->  BASE+"thumb/.."
   ```
   There are ~20 such call sites (grep for `"/api`, `"/media/`, `"/thumb/`).
3. **Service worker registration** (app.js):
   ```js
   navigator.serviceWorker.register(BASE+"sw.js", { scope: BASE });
   ```
4. **`sw.js`** — make SHELL paths and the network-only check use the scope:
   ```js
   const BASE = self.registration.scope ? new URL(self.registration.scope).pathname : "/";
   // SHELL: [BASE, BASE+"static/style.css", ...]; navigate fallback: caches.match(BASE);
   // network-only test: url.pathname.startsWith(BASE+"api/") || .."media/" || .."thumb/"
   ```
5. **`manifest.webmanifest`** — `"start_url": "/meekintube/"`, `"scope": "/meekintube/"`, icon `src` relative.

### 8c. Server change (only if the proxy keeps the prefix)
Mount the WSGI app under the prefix without rewriting routes:
```python
from werkzeug.middleware.dispatcher import DispatcherMiddleware
from werkzeug.exceptions import NotFound
PREFIX = os.environ.get("MEEKIN_BASE", "/meekintube")
application = DispatcherMiddleware(NotFound(), {PREFIX: app})
# serve `application` (e.g. via gunicorn/uvicorn) instead of app.run()
```

---

## 9. Production / platform notes for the dev agent

- **Use a real WSGI server** (gunicorn) instead of Flask's dev server. Keep `threaded=True` semantics —
  `/media` tail-streaming holds a worker while a download is in progress, so use enough workers/threads
  (e.g. `gunicorn -k gthread -w 2 --threads 16 server:app`).
- **HTTPS is required** for PWA install + service worker + Media Session on mobile. Emergent likely
  terminates TLS for you — good. (Without HTTPS the app still *runs*, but can't install/offline.)
- **Multi-user caveat:** this was built single-user. State that's currently GLOBAL and would need
  per-session isolation for multi-tenant use:
  - `JOBS` dict (download jobs) — shared across all clients.
  - The staging dir `MEEKIN_VIDEO_DIR` — shared; concurrent downloads from different users mix here.
  - The library itself is **per-browser (IndexedDB)** so it's naturally per-user; only the *server staging*
    + jobs are shared. For multi-user: namespace the staging dir + JOBS by a session/user id.
- **No auth.** Add auth at the platform/proxy layer if exposing publicly (the server can run yt-dlp + delete
  files under the staging dir — don't expose it unauthenticated to the internet).
- **`ffmpeg` + `node` must be in the container/image.** Missing `node` = most YouTube clips fail
  (yt-dlp uses it via `--js-runtimes node`). Missing `ffmpeg` = quality merges fail.
- **`send2trash`** needs a desktop trash; in headless Linux it may error — `/api/delete` falls back to
  permanent `os.remove`. `/api/purge` already does permanent delete. Fine for servers.

---

## 10. Nice-to-have backlog (optional, not required)
- "Audio-only / listen mode" — iOS shows next/prev-track on lock screen only for **audio** elements; video
  gets ±-seconds skip. An `<audio>` playback mode would give true Spotify-style controls on iOS.
- Storage-usage meter (uses `navigator.storage.estimate()` — already in `LibDB.usage()`).
- Drag-reorder playlists; resume-position memory; download queue limits.

---

## 11. Quick verify checklist after deploy
1. App loads, bottom-of-page shows version label (e.g. `v31`).
2. Search returns results (needs server + node).
3. Tap a result → it streams + saves to library; `/api/files` shows it briefly then it's purged.
4. Library tab plays the saved video offline (stop the server → still plays).
5. (mobile + HTTPS) "Add to Home Screen" → opens standalone → lock screen shows title/artwork + prev/next.

---

## 12. What's new in v33-v34 (2026-06-12)

- **Watch/Download mode toggle** (`#modeSwitch` in the fixed topbar, icon-only labels on mobile; persisted in `localStorage.mkt_mode`, default = watch).
  Watch mode: tapping an online video card opens the **YouTube embed player immediately** (autoplay, no
  download, no server job) via `playEmbed()`. Download mode = old behavior (`playFromUrl` stream+store).
- **Playlists accept remote items**: the `+` button now also appears on search-result / home-feed cards and
  on related cards in the player. Playlist `items[]` entries are now either a string (device id, legacy) or
  `{remote:true, id, title, url}`. Remote items render with an `i.ytimg.com` thumbnail + "YouTube" badge and
  play according to the current mode. Mixed queues use `setQueueMixed()`/`playEntry()`.
- **Background audio (Spotify-style)**: on `visibilitychange→hidden` while our player is playing a local
  blob, playback hands off to a hidden `<audio>` (`bgAudio`) at the same time position (audio keeps playing
  with the screen off / app in background); on return it hands back to the `<video>` in sync. Media Session
  handlers (`play/pause/seekto`, position state) target `activeMedia()`. Auto-next from the queue keeps
  working in background (`bgAudio.ended` → `playAdjacent(1)`; `openPlayerSrc` routes to `bgAudio` while
  hidden). `bgAudio` is unlocked on the first user gesture (silent WAV) so iOS allows `play()` later.
  Note: does NOT apply to the YouTube embed (watch mode) — YouTube pauses embeds in background by design.
