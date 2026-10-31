/* meekin Music core — the engine shared by the two music front-ends:
     music/ytm/      a YouTube-Music-style app
     music/tunes/    a Spotify-style app
   Each front-end only draws UI; everything below is common:

   MeekinMusic.api      search (songs / artists / albums), suggestions, charts,
                        new releases, genres, artist pages, albums, song radio (RD mix)
   MeekinMusic.recs     music-only home sections built from the listener's own history
   MeekinMusic.lib      history, liked songs, followed artists, user playlists (localStorage)
   MeekinMusic.player   queue, shuffle/repeat, endless radio, Media Session, and the
                        YouTube player in ../tv/player.html driven by postMessage
   MeekinMusic.util     formatting and helpers

   Rules this file enforces for both apps (YouTube API Services terms):
   - playback only through the official embedded player, which the UI must keep
     visible at 200x200 px or larger with nothing drawn over it;
   - no background playback: when the page is hidden (screen locked, app switched)
     the player is paused;
   - songs come from the same public Invidious/Piped instances as meekinTube.

   Song object: { id, title, artist, artistId, sec, dur, views, thumb, raw }
   Events (player.on): "track" (song), "state" ("playing"|"paused"|"buffering"|"ended"|"idle"),
   "time" ({cur, dur}), "queue" ({queue, index}),
   "error" ({code, message, song, final}; final = playback stopped instead of skipping on),
   "blocked" (autoplay refused: ask the user to tap the video), "like" (song id),
   "mode" ({shuffle, repeat}), "library" (key: "liked", "playlists"… changed in another tab or app) */
(function () {
  "use strict";

  /* ---------------- network ---------------- */
  // Only instances that answer browsers with CORS (checked 2026-10-30).
  const INV = ["https://yt.chocolatemoo53.com"];
  // pipedapi.kavin.rocks sends no CORS headers, so browsers can't use it
  const PIPED = ["https://api.piped.private.coffee"];
  const QS = new URLSearchParams(location.search);
  // resolved against core.js itself (music/core.js -> tv/player.html), not the page that loads it
  const SELF = (document.currentScript && document.currentScript.src) || location.href;
  const PLAYER_URL = (function () {
    const def = new URL("../tv/player.html", SELF).href;
    const asked = QS.get("player");
    if (!asked) return def;
    try { const u = new URL(asked, location.href); return u.origin === location.origin ? u.href : def; }   // only this site
    catch (e) { return def; }
  })();
  const PLAYER_ORIGIN = new URL(PLAYER_URL).origin;
  const CHART_TH = "PL4fGSI1pDJn5gHpWhR17s41BbppFJFf08";      // Top 100 Songs Thailand (YouTube Music Global Charts)
  const CHART_GLOBAL = "PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i";  // Top 100 Songs Global

  const down = {};
  function ordered(list) {
    const now = Date.now();
    return list.filter(b => !(down[b] > now)).concat(list.filter(b => down[b] > now));
  }
  function fetchJSON(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal })
      .then(r => { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .finally(() => clearTimeout(t));
  }
  async function tryBases(list, path, ms, parse) {
    for (const base of ordered(list)) {
      try {
        const out = parse(await fetchJSON(base + path, ms));
        if (out && out.length) return out;
      } catch (e) { down[base] = Date.now() + 120000; }
    }
    return null;
  }
  const memo = {}, inflight = {};
  // keep(v), optional: false for a result worth returning but not worth remembering (empty or partly failed)
  function cached(key, ttl, fn, keep) {
    const c = memo[key];
    if (c && Date.now() - c.t < ttl) return Promise.resolve(c.v);
    if (inflight[key]) return inflight[key];
    const p = fn().then(v => { delete inflight[key]; if (v && !(Array.isArray(v) && !v.length) && (!keep || keep(v))) memo[key] = { t: Date.now(), v }; return v; },
      e => { delete inflight[key]; throw e; });
    inflight[key] = p;
    return p;
  }

  /* ---------------- songs ---------------- */
  function clean(s) {
    if (s === "null" || s == null) return "";
    return String(s).replace(/[\u0000-\u001f​-‏‪-‮⁠-⁤﻿￼�]/g, "").trim();
  }
  function fmtDur(s) {
    s = Number(s); if (!isFinite(s) || s <= 0) return "";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    const p = v => (v < 10 ? "0" + v : "" + v);
    return h ? h + ":" + p(m) + ":" + p(x) : m + ":" + p(x);
  }
  function fmtCount(n) {
    n = Number(n); if (!isFinite(n) || n <= 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return "" + n;
  }
  function thumb(id, size) {
    // hq = 480x360 (4:3 with bars), mq = 320x180; sd/maxres often missing
    return "https://i.ytimg.com/vi/" + id + "/" + (size === "small" ? "mqdefault" : "hqdefault") + ".jpg";
  }
  const LABELISH = /official|records|music|entertainment|genierock|gmm|grammy|rs\s?music|vevo|studio|channel|label|\btv\b|\bent\b/i;
  const THAI = /[฀-๿]/;
  const NOISE = [
    /[\(\[【「（]\s*(official\s*)?(music\s*)?(video|mv|m\/v|audio|lyrics?(\s*video)?|visuali[sz]er|teaser|performance\s*video|special\s*video)[^\)\]】」）]*[\)\]】」）]/gi,
    /[\(\[【「（]\s*(hd|4k|hq|lyrics?|official|mv|เนื้อเพลง|คาราโอเกะ)\s*[\)\]】」）]/gi,
    /\s*「[^」]*」/g, /\s*【[^】]*】/g
  ];
  function stripNoise(t) {
    NOISE.forEach(r => { t = t.replace(r, ""); });
    return t.replace(/\s{2,}/g, " ").trim();
  }
  // Split a video title into song + artist. International titles say "Artist - Song";
  // Thai ones usually "Song - Artist" (e.g. "แสงสุดท้าย - bodyslam"), so the channel name
  // decides when it matches a side, and otherwise the script of each side does.
  function parseTitle(rawTitle, author) {
    const ch = clean(author).replace(/\s*-\s*Topic$/i, "").replace(/\s*VEVO$/i, "").trim();
    let t = stripNoise(clean(rawTitle)).replace(/\s*[|｜]\s*(official|mv|audio|lyric|เนื้อเพลง|cover|ost|live)\b.*$/i, "");
    let title = t, artist = ch;
    const m = /^(.{1,80}?)\s+[-–—≠]\s+(.{1,})$/.exec(t);
    if (m) {
      const a = m[1].trim(), b = m[2].trim(), cl = ch.toLowerCase().slice(0, 6), al = a.toLowerCase(), bl = b.toLowerCase();
      if (cl.length > 1 && bl.indexOf(cl) >= 0) { title = a; artist = ch; }
      else if (cl.length > 1 && al.indexOf(cl) >= 0) { title = b; artist = ch; }
      else if (!ch || LABELISH.test(ch)) {
        const ta = THAI.test(a), tb = THAI.test(b);
        if ((ta && !tb) || (ta && tb)) { title = a; artist = b; } else { title = b; artist = a; }
      }
    }
    title = title.replace(/\s*[|｜].*$/, "").trim() || t;
    artist = artist.replace(/\s*[|｜].*$/, "").trim();
    if (!artist || artist.toLowerCase() === title.toLowerCase()) artist = ch || artist;
    return { title, artist: artist || "ไม่ทราบศิลปิน" };
  }
  const norm = x => clean(x).replace(/\s*-\s*Topic$/i, "").replace(/\s*VEVO$/i, "").replace(/official/ig, "").replace(/\s+/g, "").toLowerCase();
  function song(id, rawTitle, author, authorId, sec, views) {
    const p = parseTitle(rawTitle, author);
    const own = authorId && norm(author) && norm(p.artist).indexOf(norm(author).slice(0, 8)) === 0;
    return { id, title: p.title, artist: p.artist, artistId: own ? authorId : "", sec: Number(sec) || 0,
      dur: fmtDur(sec), views: fmtCount(views), thumb: thumb(id), raw: clean(rawTitle), channel: clean(author) };
  }
  function fromInv(list) {
    if (!Array.isArray(list)) return null;
    return list.filter(x => x && x.videoId && x.type !== "channel" && x.type !== "playlist")
      .map(x => song(x.videoId, x.title, x.author, x.authorId, x.lengthSeconds, x.viewCount));
  }
  function pipedId(u) { const m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(u || ""); return m ? m[1] : null; }
  function pipedCh(u) { const m = /\/channel\/(UC[\w-]{22})/.exec(u || ""); return m ? m[1] : ""; }
  function fromPiped(list) {
    if (list && list.items) list = list.items;
    if (!Array.isArray(list)) return null;
    return list.map(x => { const id = pipedId(x.url); return id && song(id, x.title, x.uploaderName, pipedCh(x.uploaderUrl), x.duration > 0 ? x.duration : 0, x.views); })
      .filter(Boolean);
  }
  function fixImg(u) {
    if (!u) return "";
    if (u.indexOf("//") === 0) return "https:" + u;
    if (u.charAt(0) === "/") return INV[0] + u;
    return u;
  }
  function pickImg(list, want) {
    if (!Array.isArray(list) || !list.length) return "";
    const sorted = list.slice().sort((a, b) => (a.width || 0) - (b.width || 0));
    return fixImg((sorted.find(t => (t.width || 0) >= want) || sorted[sorted.length - 1]).url);
  }

  // Music, not talk: a score from duration, channel and title words. Topic/VEVO channels
  // are music; "Official MV/Audio" titles count for it; reactions, news, episodes and the like against.
  const POS = /official|\bmv\b|m\/v|audio|lyric|เนื้อเพลง|เพลง|cover|\bost\b|o\.s\.t|feat\.?|\bft\.|remix|acoustic|session|live\s+at|unplugged|คาราโอเกะ|single|ver\.|version/i;
  // never a song, whatever else the title says (a reaction often quotes "Official MV")
  const NEG = /reaction|review|รีวิว|podcast|พอดแคสต์|gameplay|สัมภาษณ์|interview|trailer|vlog|unbox|tutorial|how to|full episode|asmr|shorts?\b|#shorts|behind the scenes|เบื้องหลัง|\blive\b.*\d{1,2}\s*(ต\.ค|พ\.ย|ธ\.ค|ม\.ค|ก\.พ|มี\.ค|เม\.ย|พ\.ค|มิ\.ย|ก\.ค|ส\.ค|ก\.ย)/i;
  // talk-show / series words that also turn up in song titles, OST credits and artist names
  // ("เพลงประกอบซีรีส์", "บทเรียนสอนใจ", HIGHLIGHT): they count against only without a song marker
  const NEG_SOFT = /ข่าว|\bnews\b|วิเคราะห์|\bep\.?\s?\d|ตอนที่|ตัวอย่าง|รายการ|highlight|ไฮไลท์|สอน|ฉบับเต็ม|ซีรีส์|ละคร\s*ep/i;
  const SONG = /official\s*(mv|m\/v|music\s*video|audio|lyric)|เพลงประกอบ|\bost\b|o\.s\.t/i;
  function isMusic(s, opts) {
    if (!s || !s.id) return false;
    const long = opts && opts.allowLong;
    if (!s.sec && !(opts && opts.unknownLength)) return false;   // live streams carry no length
    if (s.sec && (s.sec < 75 || s.sec > (long ? 5400 : 660))) return false;
    const ch = s.channel || "";
    if (/\s-\s*Topic$/i.test(ch) || /vevo/i.test(ch)) return true;   // these channels post only songs
    let score = 0;
    if (POS.test(s.raw)) score += 2;
    if (NEG.test(s.raw) || (NEG_SOFT.test(s.raw) && !SONG.test(s.raw))) score -= 4;
    if (s.sec >= 120 && s.sec <= 420) score += 1;          // a typical song length
    return score >= 1;
  }
  function onlyMusic(list, opts) {
    const seen = {};
    return (list || []).filter(s => {
      if (!isMusic(s, opts)) return false;
      const k = s.id; if (seen[k]) return false; seen[k] = 1; return true;
    });
  }
  function uniqSongs(list) {
    const seen = {};
    return (list || []).filter(s => s && s.id && !seen[s.id] && (seen[s.id] = 1));
  }
  function shuffled(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ---------------- data ---------------- */
  const GENRES = [
    { key: "relax", name: "ผ่อนคลาย", q: "เพลงฟังสบาย chill acoustic official", color: "#0e7490" },
    { key: "workout", name: "ออกกำลังกาย", q: "เพลงมันส์ ออกกำลังกาย official mv", color: "#b91c1c" },
    { key: "focus", name: "โฟกัส", q: "lofi focus music instrumental", color: "#4338ca", long: true },
    { key: "sad", name: "เศร้า", q: "เพลงเศร้า อกหัก official mv", color: "#475569" },
    { key: "party", name: "ปาร์ตี้", q: "เพลงแดนซ์ ปาร์ตี้ official mv", color: "#c026d3" },
    { key: "love", name: "รัก", q: "เพลงรัก หวานๆ official mv", color: "#db2777" },
    { key: "thaipop", name: "T-Pop", q: "T-POP official mv", color: "#ea580c" },
    { key: "luktung", name: "ลูกทุ่ง", q: "เพลงลูกทุ่ง ใหม่ล่าสุด official mv", color: "#ca8a04" },
    { key: "rock", name: "ร็อก", q: "เพลงร็อค ไทย official mv", color: "#7f1d1d" },
    { key: "hiphop", name: "ฮิปฮอป", q: "thai hip hop official mv", color: "#1d4ed8" },
    { key: "kpop", name: "K-Pop", q: "kpop official mv", color: "#9333ea" },
    { key: "indie", name: "อินดี้", q: "เพลงอินดี้ ไทย official", color: "#15803d" },
    { key: "jazz", name: "แจ๊ส", q: "jazz music official audio", color: "#92400e" },
    { key: "classic", name: "เพลงยุค 90", q: "เพลงยุค 90 ฮิต official", color: "#0f766e" }
  ];
  const api = {
    searchSongs(q) {
      return cached("ss:" + q, 600000, async () => {
        const e = encodeURIComponent(q);
        const sources = [
          [INV, "/api/v1/search?type=video&q=" + e, fromInv],
          [PIPED, "/search?filter=music_songs&q=" + e, fromPiped],
          [PIPED, "/search?filter=videos&q=" + e, fromPiped]
        ];
        // a source whose results are all filtered out (reactions, long videos) falls through to the next
        let answered = false;
        for (const [list, path, parse] of sources) {
          const r = await tryBases(list, path, 8000, parse);
          if (!r) continue;
          answered = true;
          const m = onlyMusic(r);
          if (m.length) return m;
        }
        return answered ? [] : null;   // [] = no songs, null = network down
      });
    },
    searchArtists(q) {
      return cached("sa:" + q, 600000, async () => {
        const r = await tryBases(INV, "/api/v1/search?type=channel&q=" + encodeURIComponent(q), 8000, a =>
          Array.isArray(a) ? a.filter(x => x && x.type === "channel" && x.authorId).map(x => ({
            id: x.authorId, name: clean(x.author).replace(/\s*-\s*Topic$/i, ""), topic: /\s-\s*Topic$/i.test(x.author || ""),
            subs: fmtCount(x.subCount), avatar: pickImg(x.authorThumbnails, 176), verified: !!x.authorVerified })) : null);
        if (!r) return null;
        // one entry per artist name; the real channel (with subscribers) before the auto-made "Topic" one
        const best = {};
        r.forEach(a => { const k = a.name.toLowerCase(); if (!best[k] || (best[k].topic && !a.topic)) best[k] = a; });
        const ql = q.toLowerCase();
        return r.filter(a => best[a.name.toLowerCase()] === a)
          .sort((x, y) => (y.name.toLowerCase() === ql) - (x.name.toLowerCase() === ql));
      });
    },
    searchAlbums(q) {
      return cached("sp:" + q, 600000, async () =>
        await tryBases(INV, "/api/v1/search?type=playlist&q=" + encodeURIComponent(q), 8000, a =>
          Array.isArray(a) ? a.filter(x => x && x.playlistId).map(x => ({
            id: x.playlistId, title: clean(x.title), owner: clean(x.author), count: x.videoCount,
            thumb: fixImg(x.playlistThumbnail) || (x.videos && x.videos[0] ? thumb(x.videos[0].videoId) : "") })) : null));
    },
    async searchAll(q) {
      const r = await Promise.all([api.searchSongs(q).catch(() => null), api.searchArtists(q).catch(() => null), api.searchAlbums(q).catch(() => null)]);
      return { songs: r[0] || [], artists: (r[1] || []).slice(0, 6), albums: (r[2] || []).slice(0, 8), ok: !!(r[0] || r[1] || r[2]) };
    },
    suggest(q) {
      return cached("sg:" + q, 600000, async () => {
        const e = encodeURIComponent(q);
        const r = (await tryBases(INV, "/api/v1/search/suggestions?q=" + e, 4000, j => j && j.suggestions))
          || (await tryBases(PIPED, "/suggestions?query=" + e, 4000, j => (Array.isArray(j) ? j : null)));
        const t = document.createElement("textarea");
        return (r || []).map(s => { t.innerHTML = String(s); return t.value; });
      });
    },
    playlist(id) {
      return cached("pl:" + id, 1800000, async () => {
        const r = await tryBases(INV, "/api/v1/playlists/" + id, 10000, j => (j && Array.isArray(j.videos) ? [j] : null));
        if (!r) return null;
        const j = r[0];
        return { id, title: clean(j.title), owner: clean(j.author), count: j.videoCount,
          songs: fromInv(j.videos).filter(s => s.sec > 0) };
      }, v => v.songs.length > 0);   // an empty answer is returned, not remembered, so "retry" refetches
    },
    charts(which) { return api.playlist(which === "global" ? CHART_GLOBAL : CHART_TH); },
    // "song radio": YouTube's own mix for that song (RD + id), music-filtered
    // seed (optional): the song itself, so the artist can top up a thin radio
    radio(id, seed) {
      return cached("rd:" + id, 1800000, async () => {
        const mix = await tryBases(INV, "/api/v1/mixes/RD" + id, 9000, j => (j && Array.isArray(j.videos) ? fromInv(j.videos) : null));
        let out = mix ? onlyMusic(mix) : [];
        if (out.length < 8) {
          const [rec, rel] = await Promise.all([
            tryBases(INV, "/api/v1/videos/" + id + "?fields=recommendedVideos", 9000, j => (j && j.recommendedVideos ? fromInv(j.recommendedVideos) : null)).catch(() => null),
            tryBases(PIPED, "/streams/" + id, 9000, j => (j && j.relatedStreams ? fromPiped(j.relatedStreams) : null)).catch(() => null)
          ]);
          out = out.concat(onlyMusic(rec || []), onlyMusic(rel || [], { unknownLength: true }));
        }
        if (out.length < 8 && seed && seed.artist && seed.artist !== "ไม่ทราบศิลปิน") {
          const more = await api.searchSongs(seed.artist).catch(() => null);
          out = out.concat(shuffled(more || []));
        }
        out = uniqSongs(out).filter(s => s.id !== id);
        return out.length ? out : null;
      });
    },
    newReleases() {
      return cached("nr", 1800000, async () => {
        const qs = ["official mv เพลงใหม่", "official mv", "official audio"];
        const r = await Promise.all(qs.map(q => tryBases(INV, "/api/v1/search?type=video&date=week&sort=view_count&q=" + encodeURIComponent(q), 8000, fromInv).catch(() => null)));
        const all = [].concat.apply([], r.map(x => x || []));
        return all.length ? onlyMusic(all) : null;
      });
    },
    genre(key) {
      const g = GENRES.find(x => x.key === key);
      if (!g) return Promise.resolve(null);
      return cached("gn:" + key, 1800000, async () => {
        const r = await tryBases(INV, "/api/v1/search?type=video&q=" + encodeURIComponent(g.q), 8000, fromInv);
        return r ? onlyMusic(r, { allowLong: g.long }) : null;
      });
    },
    artist(id) {
      return cached("ar:" + id, 1800000, async () => {
        const info = await tryBases(INV, "/api/v1/channels/" + id, 9000, j => (j && j.authorId ? [j] : null));
        if (!info) return null;
        const j = info[0];
        const [pop, latest, pls] = await Promise.all([
          tryBases(INV, "/api/v1/channels/" + id + "/videos?sort_by=popular", 10000, x => (x && x.videos ? [x] : null)).catch(() => null),
          tryBases(INV, "/api/v1/channels/" + id + "/videos?sort_by=newest", 10000, x => (x && x.videos ? [x] : null)).catch(() => null),
          tryBases(INV, "/api/v1/channels/" + id + "/playlists", 10000, x => (x && x.playlists ? [x] : null)).catch(() => null)
        ]);
        const name = clean(j.author).replace(/\s*-\s*Topic$/i, "");
        const mine = list => onlyMusic(fromInv(list && list[0] ? list[0].videos : []) || []).map(s => Object.assign(s, { artist: name, artistId: id }));
        return {
          id, name, subs: fmtCount(j.subCount), verified: !!j.authorVerified,
          avatar: pickImg(j.authorThumbnails, 512), banner: pickImg(j.authorBanners, 1060), about: clean(j.description || ""),
          top: mine(pop).slice(0, 20), latest: mine(latest).slice(0, 20),
          albums: (pls && pls[0] ? pls[0].playlists : []).filter(p => p && p.playlistId).slice(0, 20).map(p => ({
            id: p.playlistId, title: clean(p.title), owner: name, count: p.videoCount,
            thumb: fixImg(p.playlistThumbnail) || (p.videos && p.videos[0] ? thumb(p.videos[0].videoId) : "") })),
          // a list that failed to load (not one that is really empty): show the page, but don't remember it
          partial: !pop || !latest || !pls
        };
      }, v => !v.partial);
    },
    // name -> channel id for songs that only know their artist's name
    async artistId(name) {
      if (!name) return null;
      const r = await api.searchArtists(name).catch(() => null);
      if (!r || !r.length) return null;
      const hit = r.find(a => a.name.toLowerCase() === name.toLowerCase()) || r[0];
      return hit.id;
    },
    GENRES
  };

  /* ---------------- library (this device only) ---------------- */
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const lite = s => ({ id: s.id, title: s.title, artist: s.artist, artistId: s.artistId || "", sec: s.sec || 0, dur: s.dur || fmtDur(s.sec), thumb: s.thumb || thumb(s.id), raw: s.raw || s.title, channel: s.channel || "" });
  const lib = {
    history: lsGet("mytube_music_history", []),      // [{s: song, at, n}], newest first
    liked: lsGet("mytube_music_liked", []),          // [song]
    artists: lsGet("mytube_music_artists", []),      // [{id, name, avatar}]
    playlists: lsGet("mytube_music_playlists", []),  // [{id, name, songs: [song]}]
    searches: lsGet("mytube_music_searches", []),
    save(k) { lsSet("mytube_music_" + k, lib[k]); },
    // Both apps (and any other open tab) share these keys and each writes its whole list,
    // so every change starts from what is stored now, not from the copy read at page load.
    fresh(k) {
      let v;
      try { const raw = localStorage.getItem("mytube_music_" + k); v = raw == null ? [] : JSON.parse(raw); }
      catch (e) { return; }   // no storage (or a broken value): keep this page's copy
      if (Array.isArray(v)) lib[k] = v;
    },
    played(s) {
      lib.fresh("history");
      const i = lib.history.findIndex(h => h.s.id === s.id);
      const n = i >= 0 ? lib.history[i].n + 1 : 1;
      if (i >= 0) lib.history.splice(i, 1);
      lib.history.unshift({ s: lite(s), at: Date.now(), n });
      if (lib.history.length > 400) lib.history.length = 400;
      lib.save("history");
    },
    isLiked(id) { return lib.liked.some(s => s.id === id); },
    toggleLike(s) {
      lib.fresh("liked");
      if (lib.isLiked(s.id)) lib.liked = lib.liked.filter(x => x.id !== s.id);
      else lib.liked.unshift(lite(s));
      lib.save("liked");
      emit("like", s.id);
      return lib.isLiked(s.id);
    },
    isFollowing(id) { return lib.artists.some(a => a.id === id); },
    toggleFollow(a) {
      lib.fresh("artists");
      if (lib.isFollowing(a.id)) lib.artists = lib.artists.filter(x => x.id !== a.id);
      else lib.artists.unshift({ id: a.id, name: a.name, avatar: a.avatar || "" });
      lib.save("artists");
      return lib.isFollowing(a.id);
    },
    newPlaylist(name) {
      lib.fresh("playlists");
      const p = { id: "pl_" + Date.now(), name: name || "เพลย์ลิสต์ของฉัน", songs: [] };
      lib.playlists.unshift(p); lib.save("playlists"); return p;
    },
    addToPlaylist(pid, s) {
      lib.fresh("playlists");
      const p = lib.playlists.find(x => x.id === pid);
      if (!p || p.songs.some(x => x.id === s.id)) return false;
      p.songs.push(lite(s)); lib.save("playlists"); return true;
    },
    removeFromPlaylist(pid, id) {
      lib.fresh("playlists");
      const p = lib.playlists.find(x => x.id === pid);
      if (!p) return; p.songs = p.songs.filter(x => x.id !== id); lib.save("playlists");
    },
    deletePlaylist(pid) { lib.fresh("playlists"); lib.playlists = lib.playlists.filter(x => x.id !== pid); lib.save("playlists"); },
    removeSearch(q) { lib.fresh("searches"); lib.searches = lib.searches.filter(x => x !== q); lib.save("searches"); },
    clearSearches() { lib.searches = []; lib.save("searches"); },
    renamePlaylist(pid, name) {
      lib.fresh("playlists");
      const p = lib.playlists.find(x => x.id === pid);
      if (!p || !String(name || "").trim()) return false;
      p.name = String(name).trim().slice(0, 80); lib.save("playlists"); return true;
    },
    rememberSearch(q) {
      lib.fresh("searches");
      lib.searches = [q].concat(lib.searches.filter(x => x !== q)).slice(0, 15); lib.save("searches");
    },
    // artists by plays, recent plays weighing more
    topArtists(n) {
      const score = {}, meta = {};
      const now = Date.now();
      lib.history.forEach(h => {
        const k = h.s.artist; if (!k) return;
        const days = (now - h.at) / 864e5;
        score[k] = (score[k] || 0) + h.n * Math.exp(-days / 30);
        if (!meta[k] || (!meta[k].artistId && h.s.artistId)) meta[k] = h.s;
      });
      lib.liked.forEach(s => { score[s.artist] = (score[s.artist] || 0) + 1.5; if (!meta[s.artist]) meta[s.artist] = s; });
      return Object.keys(score).sort((a, b) => score[b] - score[a]).slice(0, n || 8)
        .map(k => ({ name: k, id: meta[k].artistId || "", seed: meta[k] }));
    },
    clearHistory() { lib.history = []; lib.save("history"); }
  };
  // another tab or the other app changed the library: take its copy and tell the UI ("library" event, key name)
  window.addEventListener("storage", e => {
    if (e.storageArea && e.storageArea !== window.localStorage) return;
    const keys = e.key == null ? ["history", "liked", "artists", "playlists", "searches"]   // storage cleared
      : e.key.indexOf("mytube_music_") === 0 ? [e.key.slice(13)] : [];
    keys.forEach(k => { if (Array.isArray(lib[k])) { lib.fresh(k); emit("library", k); } });
  });

  /* ---------------- recommendations (music only) ----------------
     Built on this device from what the listener plays and likes. Each section is
     { key, title, subtitle, kind: "songs"|"grid"|"mixes"|"artists"|"albums"|"genres", load() }
     so a UI can draw skeletons first and fill sections as they arrive. */
  const recentIds = () => { const s = {}; lib.history.slice(0, 25).forEach(h => { s[h.s.id] = 1; }); return s; };
  const recs = {
    hasHistory() { return lib.history.length > 0 || lib.liked.length > 0; },
    async quickPicks() {
      const seeds = lib.history.slice(0, 3).map(h => h.s.id).concat(lib.liked.slice(0, 2).map(s => s.id));
      let out = [];
      if (seeds.length) {
        const bySeed = {}; lib.history.slice(0, 3).forEach(h => { bySeed[h.s.id] = h.s; }); lib.liked.slice(0, 2).forEach(x => { bySeed[x.id] = x; });
        const mixes = await Promise.all(seeds.map(id => api.radio(id, bySeed[id]).catch(() => null)));
        mixes.forEach(m => { out = out.concat((m || []).slice(0, 12)); });
      }
      if (out.length < 12) {
        const c = await api.charts("th").catch(() => null);
        if (c) out = out.concat(shuffled(c.songs).slice(0, 20));
      }
      const skip = recentIds();
      return shuffled(uniqSongs(out).filter(s => !skip[s.id])).slice(0, 20);
    },
    listenAgain() {
      // songs played more than once, then recent ones
      const h = lib.history.slice().sort((a, b) => (b.n - a.n) || (b.at - a.at));
      return Promise.resolve(uniqSongs(h.map(x => x.s)).slice(0, 16));
    },
    async mixesForYou() {
      // one "mix" per favourite artist: YouTube's radio for a song of theirs
      const top = lib.topArtists(6);
      const mixes = await Promise.all(top.map(async a => {
        const r = await api.radio(a.seed.id, a.seed).catch(() => null);
        if (!r || r.length < 5) return null;
        const songs = uniqSongs([a.seed].concat(r));
        return { id: "mix:" + a.seed.id, title: "มิกซ์ของ " + a.name, subtitle: songs.slice(1, 4).map(s => s.artist).filter((v, i, x) => x.indexOf(v) === i).join(", "),
          thumb: a.seed.thumb || thumb(a.seed.id), songs };
      }));
      return mixes.filter(Boolean);
    },
    async fromArtists() {
      const top = lib.topArtists(4).concat(lib.artists.slice(0, 4).map(a => ({ name: a.name, id: a.id })));
      const done = {}, out = [];
      for (const a of top) {
        if (done[a.name]) continue; done[a.name] = 1;
        const id = a.id || await api.artistId(a.name);
        if (!id) continue;
        const ar = await api.artist(id).catch(() => null);
        if (ar) out.push.apply(out, ar.latest.slice(0, 5));
      }
      return shuffled(uniqSongs(out)).slice(0, 20);
    },
    favouriteArtists() {
      return Promise.resolve(lib.topArtists(10).map(a => ({ id: a.id, name: a.name, avatar: "", seed: a.seed })));
    },
    home() {
      const S = [];
      if (recs.hasHistory()) {
        S.push({ key: "quick", title: "เพลงด่วน", subtitle: "เริ่มฟังจากเพลงที่คุณชอบ", kind: "grid", load: recs.quickPicks });
        S.push({ key: "again", title: "ฟังอีกครั้ง", kind: "songs", load: recs.listenAgain });
        S.push({ key: "mixes", title: "มิกซ์สำหรับคุณ", kind: "mixes", load: recs.mixesForYou });
        S.push({ key: "artists", title: "ศิลปินที่คุณฟังบ่อย", kind: "artists", load: recs.favouriteArtists });
        S.push({ key: "fresh", title: "ใหม่จากศิลปินที่คุณชอบ", kind: "songs", load: recs.fromArtists });
      }
      S.push({ key: "chartTH", title: "Top 100 เพลงฮิตในไทย", subtitle: "ชาร์ตประจำสัปดาห์", kind: "songs", load: () => api.charts("th").then(c => c && c.songs), playlist: CHART_TH });
      S.push({ key: "new", title: "เพลงใหม่สัปดาห์นี้", kind: "songs", load: api.newReleases });
      S.push({ key: "genres", title: "อารมณ์และแนวเพลง", kind: "genres", load: () => Promise.resolve(GENRES) });
      S.push({ key: "chartGlobal", title: "Top 100 ทั่วโลก", kind: "songs", load: () => api.charts("global").then(c => c && c.songs), playlist: CHART_GLOBAL });
      if (!recs.hasHistory()) S.push({ key: "quick", title: "ลองฟังเพลงเหล่านี้", kind: "grid", load: recs.quickPicks });
      return S;
    }
  };

  /* ---------------- player ---------------- */
  const listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }

  const P = {
    frame: null, booted: false, pending: [], host: null,
    queue: [], index: -1, radioSeed: null,
    qgen: 0,                         // bumped whenever the whole queue is replaced
    radioLoading: -1,                // qgen of the queue whose radio is being fetched, -1 = none
    playWhenRadio: null,             // gen of a "play next" that is waiting for that fetch
    state: "idle", cur: 0, dur: 0, counted: false, gen: 0,
    loading: false,                  // a load was sent and the new song has not reported yet
    errRun: 0,                       // songs in a row that failed to play
    shuffle: false, repeat: "off",   // "off" | "all" | "one"
    order: null                      // shuffled play order of queue indexes
  };
  function ensureFrame() {
    if (P.frame || !P.host) return;
    const f = document.createElement("iframe");
    f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.title = "YouTube player";
    f.src = PLAYER_URL;
    P.host.appendChild(f);
    P.frame = f;
  }
  function cmd(m) {
    m.meekin = 1;
    if (!P.frame) return;
    if (!P.booted) { if (m.cmd === "load") P.pending = P.pending.filter(x => x.cmd !== "load"); P.pending.push(m); return; }
    try { P.frame.contentWindow.postMessage(m, PLAYER_ORIGIN); } catch (e) {}
  }
  const STATES = { "-1": "idle", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "idle" };
  window.addEventListener("message", e => {
    if (!P.frame || e.source !== P.frame.contentWindow || e.origin !== PLAYER_ORIGIN) return;
    const m = e.data; if (!m || m.meekin !== 1) return;
    if (m.ev === "boot") { P.booted = true; const q = P.pending; P.pending = []; q.forEach(cmd); }
    else if (m.ev === "state") {
      // the frame's messages carry no video id: until the new song reports (unstarted / buffering),
      // a time tick still in flight belongs to the song that was playing before
      if (m.s === -1 || m.s === 3) P.loading = false;
      P.state = STATES[m.s] || "idle";
      if (P.state === "playing") P.errRun = 0;
      // hidden page: a load started by a timer, radio or autoplay (player.html asks to play on every
      // load) must not play in the background, whatever the state was when the page was hidden
      if (document.hidden && (P.state === "playing" || P.state === "buffering")) cmd({ cmd: "pause" });
      emit("state", P.state);
      ms.state();
      if (P.state === "ended") afterEnd();
    } else if (m.ev === "time") {
      if (P.loading) { if ((m.cur || 0) > 1.5) return; P.loading = false; }   // a new song starts at 0
      P.cur = m.cur || 0; P.dur = m.dur || P.dur;
      emit("time", { cur: P.cur, dur: P.dur });
      ms.position();
      const s = current();
      // count a play once 30 s (or half of a short song) has been heard
      if (s && !P.counted && P.state === "playing" && (P.cur >= 30 || (P.dur && P.cur >= P.dur / 2))) { P.counted = true; lib.played(s); }
    } else if (m.ev === "error") {
      const s = current();
      P.errRun++;
      // skip unplayable songs like a music app does, but not forever: a page-level failure
      // (no Referer, player script not loading) hits every song alike, and so does a run of failures
      const stop = P.errRun > 3 || String(m.code) === "153" || m.code === "api";
      emit("error", { code: m.code, message: ERR[String(m.code)] || ("เล่นไม่ได้ (" + m.code + ")"), song: s, final: stop });
      if (stop) return;
      const gen = P.gen;
      setTimeout(() => { if (gen === P.gen) skipBroken(); }, 2500);
    } else if (m.ev === "blocked") emit("blocked", current());
  });
  const ERR = { "2": "รหัสเพลงไม่ถูกต้อง", "5": "เครื่องเล่นมีปัญหา", "100": "ไม่พบเพลงนี้แล้ว",
    "101": "เจ้าของไม่อนุญาตให้เล่นนอก YouTube", "150": "เจ้าของไม่อนุญาตให้เล่นนอก YouTube",
    "153": "YouTube ไม่ได้รับ Referer", "api": "โหลดเครื่องเล่นไม่ได้" };

  function current() { return P.queue[P.index] || null; }
  function startAt(i) {
    if (i < 0 || i >= P.queue.length) return;
    P.index = i; P.cur = 0; P.dur = P.queue[i].sec || 0; P.counted = false; P.gen++; P.loading = true;
    ensureFrame();
    cmd({ cmd: "load", id: P.queue[i].id, start: 0 });
    emit("track", P.queue[i]);
    emit("queue", { queue: P.queue, index: P.index });
    ms.meta(P.queue[i]);
    maybeExtendRadio();
  }
  function nextIndex() {
    if (P.repeat === "one") return P.index;
    if (P.shuffle && P.order) {
      const at = P.order.indexOf(P.index);
      if (at >= 0 && at < P.order.length - 1) return P.order[at + 1];
      return P.repeat === "all" ? P.order[0] : -1;
    }
    if (P.index < P.queue.length - 1) return P.index + 1;
    return P.repeat === "all" ? 0 : -1;
  }
  function afterEnd() { next(true); }
  function next(auto) {
    const repeatOne = P.repeat === "one";
    if (!auto && repeatOne) P.repeat = "all";                // a manual skip leaves "repeat one"
    const i = nextIndex();
    if (!auto && repeatOne) P.repeat = "one";
    // (with "repeat all" a one-song queue gives i === P.index: that song plays again)
    if (i >= 0) { startAt(i); return; }
    // end of the queue: keep going with radio for the last song, like YouTube Music / Spotify autoplay
    extendRadio(true);
  }
  // leave a song that cannot be played: like next(true), except that "repeat one" must not reload it
  function skipBroken() {
    const r = P.repeat;
    if (r === "one") P.repeat = "all";
    const i = nextIndex();
    P.repeat = r;
    if (i >= 0 && i !== P.index) startAt(i); else extendRadio(true);
  }
  function prev() {
    const restart = () => { cmd({ cmd: "seek", t: 0 }); P.cur = 0; emit("time", { cur: 0, dur: P.dur }); };
    if (P.cur > 4) return restart();
    // shuffle: the start is the first song of the play order, which need not be queue index 0
    if (P.shuffle && P.order) { const at = P.order.indexOf(P.index); return at > 0 ? startAt(P.order[at - 1]) : restart(); }
    if (P.index <= 0) return restart();
    startAt(P.index - 1);
  }
  function maybeExtendRadio() {
    // top the queue up before it runs out, so "up next" is never empty; with repeat on it
    // never runs out (it loops), and radio appended at the end would stop it from looping
    if (P.repeat !== "off") return;
    const at = P.shuffle && P.order ? P.order.indexOf(P.index) : -1;
    const left = at >= 0 ? P.order.length - 1 - at : P.queue.length - 1 - P.index;   // songs still to come
    if (left < 3) extendRadio(false);
  }
  function extendRadio(thenPlay) {
    const seed = current() || P.queue[P.queue.length - 1];
    if (!seed) return;
    // this queue's radio is already on its way: a "play next" waits for it instead of being dropped
    if (P.radioLoading === P.qgen) { if (thenPlay) P.playWhenRadio = P.gen; return; }
    const qg = P.qgen, gen = P.gen;
    P.radioLoading = qg;
    const done = r => {
      if (P.radioLoading === qg) P.radioLoading = -1;
      if (qg !== P.qgen) return;              // the queue was replaced meanwhile: this radio is for another song
      const want = (thenPlay && gen === P.gen) || P.playWhenRadio === P.gen;
      P.playWhenRadio = null;
      const have = {}; P.queue.forEach(s => { have[s.id] = 1; });
      const skip = recentIds();
      const add = (r || []).filter(s => !have[s.id] && !skip[s.id]).slice(0, 15);
      if (!add.length) {
        // nothing to go on with: stop, so the player and the UI agree (a manual "next" may find the song playing)
        if (want) { cmd({ cmd: "pause" }); emit("state", "ended"); }
        return;
      }
      const start = P.queue.length;
      P.queue = P.queue.concat(add);
      if (P.shuffle) P.order = (P.order || []).concat(shuffled(add.map((_, k) => start + k)));
      emit("queue", { queue: P.queue, index: P.index });
      // shuffle: begin at the first new entry of the play order, so none of the new songs is skipped
      if (want) startAt(P.shuffle ? P.order[P.order.length - add.length] : start);
    };
    api.radio(seed.id, seed).then(done, () => done(null));
  }
  function makeOrder() {
    const rest = shuffled(P.queue.map((_, i) => i).filter(i => i !== P.index));
    P.order = [P.index].concat(rest);
  }
  const player = {
    attach(host) { P.host = host; if (P.frame && P.frame.parentNode !== host) host.appendChild(P.frame); },
    // play a song; queue defaults to just that song (radio fills the rest)
    play(s, opts) {
      opts = opts || {};
      const q = (opts.queue && opts.queue.length ? opts.queue : [s]).map(lite);
      P.queue = q; P.qgen++; P.errRun = 0;   // radio still on its way for the old queue is dropped
      let i = opts.index != null ? opts.index : q.findIndex(x => x.id === s.id);
      if (i < 0) { P.queue.unshift(lite(s)); i = 0; }
      if (P.shuffle) { P.index = i; makeOrder(); }
      startAt(i);
    },
    playAt(i) { P.errRun = 0; startAt(i); },
    toggle() {
      if (!current()) return;
      cmd({ cmd: P.state === "playing" || P.state === "buffering" ? "pause" : "play" });
    },
    play_() { cmd({ cmd: "play" }); },
    pause() { cmd({ cmd: "pause" }); },
    next() { P.errRun = 0; next(false); },
    prev() { P.errRun = 0; prev(); },
    seek(t) { t = Math.max(0, Math.min(Number(t) || 0, (P.dur || 0) - 1)); P.cur = t; cmd({ cmd: "seek", t }); emit("time", { cur: t, dur: P.dur }); },
    playNext(s) {
      if (!current()) { player.play(s); return; }
      P.queue.splice(P.index + 1, 0, lite(s));
      if (P.shuffle && P.order) { P.order = P.order.map(i => (i > P.index ? i + 1 : i)); P.order.splice(P.order.indexOf(P.index) + 1, 0, P.index + 1); }
      emit("queue", { queue: P.queue, index: P.index });
    },
    addToQueue(s) {
      if (!current()) { player.play(s); return; }
      P.queue.push(lite(s));
      if (P.shuffle && P.order) P.order.push(P.queue.length - 1);
      emit("queue", { queue: P.queue, index: P.index });
    },
    removeAt(i) {
      if (i === P.index || i < 0 || i >= P.queue.length) return;
      P.queue.splice(i, 1);
      if (i < P.index) P.index--;
      if (P.order) P.order = P.order.filter(x => x !== i).map(x => (x > i ? x - 1 : x));
      emit("queue", { queue: P.queue, index: P.index });
    },
    setShuffle(v) {
      P.shuffle = !!v; P.order = P.shuffle && current() ? (makeOrder(), P.order) : null;
      emit("queue", { queue: P.queue, index: P.index }); emit("mode", { shuffle: P.shuffle, repeat: P.repeat });
      return P.shuffle;
    },
    cycleRepeat() {
      P.repeat = P.repeat === "off" ? "all" : P.repeat === "all" ? "one" : "off";
      emit("mode", { shuffle: P.shuffle, repeat: P.repeat });
      if (P.repeat === "off" && current()) maybeExtendRadio();   // autoplay resumes near the end of the queue
      return P.repeat;
    },
    get queue() { return P.queue; }, get index() { return P.index; }, get current() { return current(); },
    get state() { return P.state; }, get time() { return { cur: P.cur, dur: P.dur }; },
    get shuffle() { return P.shuffle; }, get repeat() { return P.repeat; },
    upNext() {
      if (P.shuffle && P.order) { const at = P.order.indexOf(P.index); return P.order.slice(at + 1).map(i => P.queue[i]); }
      return P.queue.slice(P.index + 1);
    }
  };

  /* Media Session: lock-screen / notification / headset controls while the app is open.
     (YouTube's terms forbid background playback, so locking the screen pauses — see below.) */
  const ms = {
    ok: "mediaSession" in navigator,
    meta(s) {
      if (!ms.ok || !s) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: "meekin Music",
          artwork: [{ src: thumb(s.id, "small"), sizes: "320x180", type: "image/jpeg" }, { src: thumb(s.id), sizes: "480x360", type: "image/jpeg" }] });
      } catch (e) {}
    },
    state() { if (ms.ok) try { navigator.mediaSession.playbackState = P.state === "playing" ? "playing" : (current() ? "paused" : "none"); } catch (e) {} },
    position() {
      if (!ms.ok || !navigator.mediaSession.setPositionState || !(P.dur > 0)) return;
      try { navigator.mediaSession.setPositionState({ duration: P.dur, position: Math.min(P.cur, P.dur), playbackRate: 1 }); } catch (e) {}
    },
    init() {
      if (!ms.ok) return;
      const h = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) {} };
      // a headset button, media key or lock-screen control can fire while the page is hidden:
      // whatever starts playback works only while it is visible ("pause" always works)
      h("play", () => { if (!document.hidden) player.play_(); });
      h("pause", () => player.pause());
      h("previoustrack", () => { if (!document.hidden) player.prev(); });
      h("nexttrack", () => { if (!document.hidden) player.next(); });
      h("seekto", d => { if (d && d.seekTime != null) player.seek(d.seekTime); });
      h("seekbackward", d => player.seek(P.cur - ((d && d.seekOffset) || 10)));
      h("seekforward", d => player.seek(P.cur + ((d && d.seekOffset) || 10)));
    }
  };
  ms.init();
  // no background playback (YouTube API Services policy III.I.9)
  // Pause whenever a song is loaded, not only while "playing": a song still buffering would start
  // behind the lock screen. Songs loaded later while hidden are paused by the "state" handler.
  document.addEventListener("visibilitychange", () => { if (document.hidden && current()) player.pause(); });

  window.MeekinMusic = {
    api, recs, lib, player, on,
    util: { fmtDur, fmtCount, thumb, clean, isMusic, uniqSongs, shuffled,
      esc: s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) },
    PLAYER_URL
  };
})();
