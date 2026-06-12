# meekintube update v31 → v38 — deploy notes for the dev agent

This folder is a drop-in replacement for `/app/backend/meekintube_app/` in the swumkt repo
(already pushed to `main` as commits e4faaff, 6a3da88, c4f5784, 397b933, 432d3dc — if the repo is
current you may already have these files; this zip is the same content as a convenience).

All paths in this build are already rewritten for the mount at **`/api/meekintube/`**
(BASE prefix in app.js/sw.js/index.html/manifest) — do NOT re-run any path rewriting.

## What changed (frontend `static/` + one new endpoint in `server.py`)

- **v33** — Watch/Download mode toggle (watch = instant YouTube embed, no download; download =
  old stream+store). Playlists accept remote items straight from search/home/related cards.
  Spotify-style background audio: hands off `<video>` → hidden `<audio>` on app-switch/screen-lock,
  Media Session + queue auto-next keep working in background.
- **v34** — Mode switch moved into the fixed topbar (was hidden under the sticky tab bar).
- **v35** — Topbar z-index 60→70 (autocomplete was painted under the tab bar); bigger mobile
  search (16px input font stops iOS focus-zoom); TV/keyboard support (focusable cards, red focus
  ring, Enter to play, arrow-key grid navigation, TV-remote Back closes the player); watch history
  in `localStorage.mkt_history`; home feed seeds = history interleaved with downloaded library.
- **v36/v37** — Watch mode embeds **instantly** (old `showEmbed` path) and auto-falls back to the
  classic download+stream when the embed cannot play (label-blocked MVs): a parallel
  **`GET /api/embedok?id=`** oEmbed probe (NEW endpoint in `server.py`) plus an `enablejsapi`
  `onError` listener on the embed iframe — either signal triggers a one-shot `playFromUrl()`.


- **v38** — Full-screen mobile search overlay; now-playing queue UI in the player with prev/next
  track buttons; Spotify-style autoplay toggle (queue ends -> keep playing related videos
  endlessly). Frontend-only; no new endpoints. See DEV_GUIDE.md section 15.
Full details: `DEV_GUIDE.md` §12–§14.

## Deploy checklist (production swumkt.org)

1. Replace `backend/meekintube_app/` with this folder (or just redeploy from `main`).
2. The FastAPI mount in `backend/server.py` (the `/api/meekintube` WSGI block) is unchanged —
   no edits needed there.
3. **`ffmpeg` and `yt-dlp` (and ideally `node`) must be installed on the production host** —
   the earlier installs were preview-only (apt/pip do not persist a fresh deploy).
   Without them: search and the new embed-fallback streaming both fail.
4. After deploy verify: `/api/meekintube/` loads and the page footer shows **v38**;
   `/api/meekintube/api/config` → `{"ffmpeg": true, "ytdlp": true}`;
   `/api/meekintube/api/embedok?id=jNQXAC9IVRw` → `{"ok": true}`.
