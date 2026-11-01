/* meekin Music core — the engine shared by the two music front-ends:
     music/ytm/      a YouTube-Music-style app
     music/tunes/    a Spotify-style app
   Each front-end only draws UI; everything below is common:

   MeekinMusic.api      search (songs / artists / albums), suggestions, charts,
                        new releases, genres, artist pages, albums, song radio (RD mix)
   MeekinMusic.recs     music-only home sections built from the listener's own history
   MeekinMusic.lib      history, liked songs, followed artists, user playlists (localStorage)
   MeekinMusic.player   queue, shuffle/repeat, endless radio, Media Session, and two ways to
                        play: the song's audio stream in an <audio> element (default; keeps
                        playing with the screen locked) or the YouTube player in ../tv/player.html
                        (player.setVideo(true), and the fallback when a song has no audio stream)
   MeekinMusic.util     formatting and helpers

   Songs, streams and charts come from the same public Invidious/Piped instances as meekinTube.
   Audio streams play outside YouTube's player (YouTube's API terms allow playback only through it);
   they are what makes background play possible. While the video player is the one playing, the UI
   keeps its embed rules (>= 200x200, nothing drawn over it).

   Song object: { id, title, artist, artistId, sec, dur, views, thumb, raw }
   Events (player.on): "track" (song), "state" ("playing"|"paused"|"buffering"|"ended"|"idle"),
   "time" ({cur, dur}), "queue" ({queue, index}),
   "error" ({code, message, song, final}; final = playback stopped instead of skipping on),
   "blocked" (the browser refused to start playback: ask the user to tap play), "like" (song id),
   "engine" ({engine: "audio"|"video", video, fallback}: what plays the current song),
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

  /* A song plays one of two ways (P.engine):
     "audio"  its audio stream (AAC, itag 140) through the Invidious instance's proxy, in an <audio>
              element of this page. The default: it goes on with the screen locked or the app in the
              background, and the lock screen, notification and headset controls drive it.
     "video"  the YouTube embedded player in ../tv/player.html, when the listener wants the music video
              (player.setVideo) or when no audio stream loads. Mobile browsers pause it when the page is
              hidden, so hiding the page hands a playing video over to "audio" at the same spot. */
  const P = {
    frame: null, booted: false, pending: [], host: null, art: null,
    queue: [], index: -1, radioSeed: null,
    qgen: 0,                         // bumped whenever the whole queue is replaced
    radioLoading: -1,                // qgen of the queue whose radio is being fetched, -1 = none
    playWhenRadio: null,             // gen of a "play next" that is waiting for that fetch
    state: "idle", cur: 0, dur: 0, counted: false, gen: 0,
    loading: false,                  // video: a load was sent and the new song has not reported yet
    errRun: 0,                       // songs in a row that failed to play
    shuffle: false, repeat: "off",   // "off" | "all" | "one"
    order: null,                     // shuffled play order of queue indexes
    engine: "audio",                 // what plays the current song: "audio" | "video"
    video: !!lsGet("mm_video", false),   // the listener chose to watch the videos
    want: "play",                    // the listener's last play / pause, honoured by a song still loading
    rung: 0,                         // audio source tried: 0 = the API's stream URL, 1 = /latest_version
    refetched: false,                // this song's stream broke after playing and a new URL was fetched once
    aload: 0,                        // bumped by every audio or video load; stale callbacks compare it
    asrc: "",                        // the stream URL the <audio> element holds for this song
    sounded: false,                  // the stream of this load has played (the stall watchdog is off)
    seekTo: 0,                       // a position to jump to once the stream's metadata is in
    fellBack: false,                 // no audio stream loaded, so this song plays as a video
    noVideo: false,                  // the video failed for this song, so it must not fall back to it
    handedOff: false,                // the page was hidden while the video played: back to it when shown
    vpauseT: 0,                      // when the video was last paused in view (a tap on the video itself)
    vhold: false,                    // the video was loaded to stay paused and has not reported a pause yet
    stallT: 0
  };

  /* ---------------- audio streams ---------------- */
  // The API's stream URLs send every range request to the companion server that made them.
  // /latest_version picks a companion per request, and a browser stops a media load whose data
  // switches origin (a seek then stalls), so it is only the second choice.
  const streams = {};   // id -> { url, t }
  function freshStream(id) {
    const c = streams[id]; if (!c) return null;
    const m = /[?&]expire=(\d+)/.exec(c.url);
    const left = m ? Number(m[1]) * 1000 - Date.now() : c.t + 20 * 60000 - Date.now();
    return left > 10 * 60000 ? c.url : null;
  }
  function resolveStream(id) {
    const hit = freshStream(id);
    if (hit) return Promise.resolve(hit);
    const key = "stream:" + id;
    if (inflight[key]) return inflight[key];
    const p = (async () => {
      // not tryBases: one video without a stream must not mark the instance down for search
      for (const base of ordered(INV)) {
        try {
          const j = await fetchJSON(base + "/api/v1/videos/" + encodeURIComponent(id) + "?local=true&fields=adaptiveFormats", 9000);
          const a = (j && j.adaptiveFormats || []).filter(f => f && f.url && /^audio\/mp4/.test(f.type || ""));
          const f = a.find(x => String(x.itag) === "140") || a.sort((x, y) => (y.bitrate || 0) - (x.bitrate || 0))[0];
          if (f) { const url = f.url.charAt(0) === "/" ? base + f.url : f.url; streams[id] = { url, t: Date.now() }; return url; }
        } catch (e) {}
      }
      return null;
    })();
    inflight[key] = p;
    p.then(() => { delete inflight[key]; }, () => { delete inflight[key]; });
    return p;
  }
  const latestUrl = id => INV[0] + "/latest_version?id=" + encodeURIComponent(id) + "&itag=140&local=true";

  const A = document.createElement("audio");
  A.preload = "auto";
  A.hidden = true;
  (document.body || document.documentElement).appendChild(A);
  // iOS lets an <audio> element play without a tap only after it has played inside one: play a
  // zero-length clip on the first touch, so a song that starts after a fetch or behind the lock screen may play
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
  let unlocked = false;
  function unlock() {
    if (unlocked || P.asrc) return;
    unlocked = true;
    try { A.src = SILENT; const p = A.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  }
  ["touchend", "click", "keydown"].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));

  // the element's events count only while it holds this song's stream (not the unlock clip, not an old song)
  const live = () => P.engine === "audio" && !!P.asrc && A.src === P.asrc;
  // P.want follows the element when the browser or the system pauses or resumes it (headphones unplugged,
  // a call): showing the page again or switching to the video must not start a song the listener cannot hear
  A.addEventListener("playing", () => {
    if (!live()) return;
    unlocked = true; P.sounded = true; if (!A.paused) P.want = "play";
    clearStall(); setState("playing"); prefetchNext();
  });
  A.addEventListener("waiting", () => { if (live() && !A.paused) setState("buffering"); });
  A.addEventListener("pause", () => { if (live() && !A.ended) { P.want = "pause"; setState("paused"); } });
  A.addEventListener("ended", () => { if (!live()) return; setState("ended"); afterEnd(); });
  // not while a start position waits for the metadata: a new src first reports the position reset to 0
  A.addEventListener("timeupdate", () => { if (live() && !P.seekTo) tick(A.currentTime, A.duration); });
  A.addEventListener("loadedmetadata", () => {
    if (!live()) return;
    if (P.seekTo > 0) { try { A.currentTime = P.seekTo; } catch (e) {} }
    P.seekTo = 0;
    if (A.duration > 0 && isFinite(A.duration)) { P.dur = A.duration; emit("time", { cur: P.cur, dur: P.dur }); ms.position(); }
  });
  // code 1 = aborted (a newer load replaced it), not a failure
  A.addEventListener("error", () => { if (live() && A.error && A.error.code !== 1) audioFailed(P.aload); });

  function setState(s) {
    P.state = s;
    if (s === "playing") P.errRun = 0;
    emit("state", s);
    ms.state();
  }
  // a time report from either player
  function tick(cur, dur) {
    P.cur = cur || 0;
    if (dur > 0 && isFinite(dur)) P.dur = dur;
    emit("time", { cur: P.cur, dur: P.dur });
    ms.position();
    const s = current();
    // count a play once 30 s (or half of a short song) has been heard
    if (s && !P.counted && P.state === "playing" && (P.cur >= 30 || (P.dur && P.cur >= P.dur / 2))) { P.counted = true; lib.played(s); }
  }
  function clearStall() { clearTimeout(P.stallT); P.stallT = 0; }
  function playAudio() {
    const p = A.play();
    if (p && p.catch) p.catch(e => {
      // AbortError: a newer load replaced this one. NotAllowedError: the browser wants a tap first
      if (!live() || !e || e.name !== "NotAllowedError") return;
      clearStall(); P.want = "pause"; setState("paused"); emit("blocked", current());
    });
    // no sound 15 s after asking a stream that has not played yet: try the next source (a stream that errors
    // says so sooner). "Not played" rather than "at 0": a load that starts partway seeks before any sound
    if (P.sounded) return;
    const tok = P.aload;
    clearStall();
    P.stallT = setTimeout(() => { if (tok === P.aload && live() && !A.paused && !P.sounded) audioFailed(tok); }, 15000);
  }
  function loadAudio(start) {
    const s = current(); if (!s) return;
    const tok = ++P.aload;
    if (P.engine !== "audio") { P.engine = "audio"; if (P.frame) cmd({ cmd: "stop" }); }
    P.asrc = ""; P.sounded = false; P.seekTo = start > 0 ? start : 0; clearStall();
    showEngine();
    setState(P.want === "play" ? "buffering" : "paused");
    const go = url => {
      if (tok !== P.aload) return;
      if (!url) { audioFailed(tok); return; }
      A.src = url; P.asrc = A.src;
      if (P.want !== "play") { setState("paused"); return; }
      playAudio();
    };
    if (P.rung > 0) go(latestUrl(s.id));
    else {
      // a stream fetched ahead is set at once: when a song ends behind the lock screen the next one must
      // start inside the "ended" event, before the browser has a chance to suspend the page
      const hit = freshStream(s.id);
      if (hit) go(hit); else resolveStream(s.id).then(go, () => go(null));
    }
  }
  function audioFailed(tok) {
    if (tok !== P.aload || P.engine !== "audio") return;
    clearStall();
    const s = current(); if (!s) return;
    delete streams[s.id];
    // a stream that played and then broke (its URL expired during a long pause, its server went away):
    // a new URL from the API first, once per song, since /latest_version tends to stall on the seek back
    if (P.rung === 0 && P.sounded && !P.refetched) { P.refetched = true; loadAudio(P.cur); return; }
    if (P.rung === 0) { P.rung = 1; loadAudio(P.cur); return; }
    // no audio stream: the video can still play it while the page is in view
    if (!document.hidden && !P.noVideo) { P.fellBack = true; loadVideo(P.cur); return; }
    failed("stream");
  }
  function loadVideo(start) {
    const s = current(); if (!s) return;
    ++P.aload;
    P.engine = "video"; P.asrc = ""; P.seekTo = 0; P.vpauseT = 0; clearStall();
    try { A.pause(); A.removeAttribute("src"); A.load(); } catch (e) {}
    showEngine();
    ensureFrame();
    P.loading = true;
    setState(P.want === "play" ? "buffering" : "paused");
    cmd({ cmd: "load", id: s.id, start: start > 0 ? start : 0 });
    P.vhold = P.want !== "play";
    if (P.vhold) cmd({ cmd: "pause" });
  }
  // the frame could not get YouTube's player script and says so only once: the next video gets a new frame
  function dropFrame() {
    try { if (P.frame && P.frame.parentNode) P.frame.parentNode.removeChild(P.frame); } catch (e) {}
    P.frame = null; P.booted = false; P.pending = [];
  }
  function prefetchNext() {
    const i = nextIndex();
    if (i >= 0 && i !== P.index && P.queue[i]) resolveStream(P.queue[i].id).catch(() => {});
  }
  // the album art the host shows in place of the video while the audio plays
  const ART = ["maxresdefault", "hq720", "mqdefault"];
  const artUrl = (id, k) => "https://i.ytimg.com/vi/" + id + "/" + ART[k] + ".jpg";
  function ensureArt() {
    if (P.art || !P.host) return;
    if (!document.getElementById("mm-core-css")) {
      const st = document.createElement("style");
      st.id = "mm-core-css";
      st.textContent = ".mm-art{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;background:#000;display:none;border:0}" +
        "[data-mm-engine=audio]>.mm-art{display:block}[data-mm-engine=audio]>iframe{visibility:hidden}";
      document.head.appendChild(st);
    }
    const im = document.createElement("img");
    im.className = "mm-art"; im.alt = ""; im.decoding = "async";
    // 16:9 thumbnails only (the 4:3 ones have letterbox bars that show in a square cover). The big ones
    // are missing for some videos; a missing one may still load, as YouTube's 120x90 grey placeholder
    // sent with a 404. mqdefault (320x180) always exists
    const small = () => {
      const k = Number(im.dataset.step || 0) + 1;
      if (im.dataset.id && k < ART.length) { im.dataset.step = String(k); im.src = artUrl(im.dataset.id, k); }
    };
    im.addEventListener("error", small);
    im.addEventListener("load", () => { if (im.naturalWidth && im.naturalWidth <= 120) small(); });
    P.art = im;
  }
  function showEngine() {
    const s = current();
    if (P.host) {
      ensureArt();
      if (P.art.parentNode !== P.host) P.host.appendChild(P.art);
      P.host.setAttribute("data-mm-engine", P.engine);
      if (s && P.art.dataset.id !== s.id) { P.art.dataset.id = s.id; P.art.dataset.step = "0"; P.art.src = artUrl(s.id, 0); }
    }
    emit("engine", { engine: P.engine, video: P.video, fallback: P.fellBack });
  }

  /* ---------------- the video player (../tv/player.html) ---------------- */
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
    if (m.ev === "boot") { P.booted = true; const q = P.pending; P.pending = []; q.forEach(cmd); return; }
    // the song moved to the audio player: what the video still reports is stale, and it must stay quiet
    if (P.engine !== "video") { if (m.ev === "state" && m.s === 1) cmd({ cmd: "stop" }); return; }
    if (m.ev === "state") {
      // the frame's messages carry no video id: until the new song reports (unstarted / buffering),
      // a time tick still in flight belongs to the song that was playing before
      if (m.s === -1 || m.s === 3) P.loading = false;
      if (m.s === 1 && !P.loading) {
        // YouTube starts a song it was told to load paused when the pause came before its player was
        // ready, or right after the load: pause it again
        if (P.vhold) { P.vhold = false; cmd({ cmd: "pause" }); return; }
        // a play made on the video itself (it can be tapped) is the listener's: locking the screen hands it over
        P.want = "play";
      }
      if (m.s === 2) P.vhold = false;
      setState(STATES[m.s] || "idle");
      // a pause made on the video itself (it can be tapped) is the listener's: hiding the page must not
      // start the song again. One that comes with the screen locking is the browser's (see visibilitychange)
      if (P.state === "paused" && !document.hidden) P.vpauseT = Date.now();
      // fetch the audio ahead, so locking the screen can start it without waiting for the network
      if (P.state === "playing") resolveStream(current().id).catch(() => {});
      if (P.state === "ended") afterEnd();
    } else if (m.ev === "time") {
      if (P.loading) { if ((m.cur || 0) > 1.5) return; P.loading = false; }   // a new song starts at 0
      tick(m.cur, m.dur);
    } else if (m.ev === "error") {
      // the video won't play here (not embeddable, player script blocked...): the audio may,
      // unless the audio is what failed first
      if (m.code === "api") dropFrame();
      if (!P.fellBack) { P.noVideo = true; P.rung = 0; loadAudio(P.cur); return; }
      failed(m.code);
    } else if (m.ev === "blocked") emit("blocked", current());
  });
  const ERR = { "2": "รหัสเพลงไม่ถูกต้อง", "5": "เครื่องเล่นมีปัญหา", "100": "ไม่พบเพลงนี้แล้ว",
    "101": "เจ้าของไม่อนุญาตให้เล่นนอก YouTube", "150": "เจ้าของไม่อนุญาตให้เล่นนอก YouTube",
    "153": "YouTube ไม่ได้รับ Referer", "api": "โหลดเครื่องเล่นไม่ได้", "stream": "โหลดเสียงเพลงนี้ไม่ได้" };
  // a song that cannot be played either way
  function failed(code) {
    const s = current();
    P.errRun++;
    // skip unplayable songs like a music app does, but not forever: when the stream server is down
    // every song fails alike, so a run of failures stops instead of racing through the queue
    const stop = P.errRun > 3;
    emit("error", { code, message: ERR[String(code)] || ("เล่นไม่ได้ (" + code + ")"), song: s, final: stop });
    if (stop) { pauseNow(); setState("paused"); return; }
    const gen = P.gen;
    // in view, leave a moment to read the message; behind the lock screen nobody reads it
    if (document.hidden) skipBroken(); else setTimeout(() => { if (gen === P.gen) skipBroken(); }, 2500);
  }

  /* ---------------- queue ---------------- */
  function current() { return P.queue[P.index] || null; }
  function startAt(i) {
    if (i < 0 || i >= P.queue.length) return;
    P.index = i; P.cur = 0; P.dur = P.queue[i].sec || 0; P.counted = false; P.gen++;
    P.want = "play"; P.rung = 0; P.refetched = false; P.fellBack = false; P.noVideo = false;
    emit("track", P.queue[i]);
    emit("queue", { queue: P.queue, index: P.index });
    ms.meta(P.queue[i]);
    // a hidden page cannot play the video: audio now, the video once the page is shown again
    P.handedOff = P.video && document.hidden;
    if (P.video && !document.hidden) loadVideo(0); else loadAudio(0);
    maybeExtendRadio();
  }
  function pauseNow() {
    P.want = "pause"; clearStall();
    if (P.engine === "audio") { try { A.pause(); } catch (e) {} } else cmd({ cmd: "pause" });
    // the stream URL is still being fetched: no "pause" event will come to end the "buffering"
    if (P.engine === "audio" && !live() && P.state === "buffering") setState("paused");
  }
  function resume() {
    if (!current()) return;
    P.want = "play";
    // a hidden page cannot play the video (play on the lock screen): the audio, the video once shown again
    if (P.engine === "video" && document.hidden && !P.fellBack) { P.handedOff = true; P.rung = 0; loadAudio(P.cur); return; }
    if (P.engine === "video") { P.vhold = false; cmd({ cmd: "play" }); return; }
    // nothing loaded yet, or the stream broke: load it again from where it was, from the API's stream again
    if (!P.asrc || A.error) { P.rung = 0; loadAudio(P.cur); return; }
    playAudio();
  }
  function seekTo(t) {
    if (P.engine === "video") { cmd({ cmd: "seek", t }); return; }
    if (P.asrc && A.readyState > 0) { try { A.currentTime = t; } catch (e) {} } else P.seekTo = t;
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
    const restart = () => { seekTo(0); P.cur = 0; emit("time", { cur: 0, dur: P.dur }); ms.position(); };
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
        if (want) { pauseNow(); setState("ended"); }
        return;
      }
      const start = P.queue.length;
      P.queue = P.queue.concat(add);
      if (P.shuffle) P.order = (P.order || []).concat(shuffled(add.map((_, k) => start + k)));
      emit("queue", { queue: P.queue, index: P.index });
      // shuffle: begin at the first new entry of the play order, so none of the new songs is skipped
      if (want) startAt(P.shuffle ? P.order[P.order.length - add.length] : start);
      else prefetchNext();
    };
    api.radio(seed.id, seed).then(done, () => done(null));
  }
  function makeOrder() {
    const rest = shuffled(P.queue.map((_, i) => i).filter(i => i !== P.index));
    P.order = [P.index].concat(rest);
  }
  const player = {
    // host: where the video (or, while the audio plays, the album art) is drawn
    attach(host) {
      P.host = host;
      if (P.frame && P.frame.parentNode !== host) host.appendChild(P.frame);
      ensureArt();
      if (P.art.parentNode !== host) host.appendChild(P.art);
      host.setAttribute("data-mm-engine", P.engine);
    },
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
      if (P.state === "playing" || P.state === "buffering") pauseNow(); else resume();
    },
    play_() { resume(); },
    pause() { pauseNow(); },
    next() { P.errRun = 0; next(false); },
    prev() { P.errRun = 0; prev(); },
    seek(t) {
      t = Math.max(0, Math.min(Number(t) || 0, (P.dur || 0) - 1));
      P.cur = t; seekTo(t);
      emit("time", { cur: t, dur: P.dur }); ms.position();
    },
    // watch the music video (true) or listen to the audio only (false, the default); remembered
    setVideo(on) {
      P.video = !!on;
      lsSet("mm_video", P.video);
      P.handedOff = false;
      // a song shown paused (the video tapped to pause it, say) stays paused in the other player
      if (P.state === "paused") P.want = "pause";
      if (current() && P.video && P.engine === "audio" && !document.hidden) { P.noVideo = false; loadVideo(P.cur); }
      else if (current() && !P.video && P.engine === "video") { P.fellBack = false; P.rung = 0; loadAudio(P.cur); }
      else showEngine();
      return P.video;
    },
    playNext(s) {
      if (!current()) { player.play(s); return; }
      P.queue.splice(P.index + 1, 0, lite(s));
      if (P.shuffle && P.order) { P.order = P.order.map(i => (i > P.index ? i + 1 : i)); P.order.splice(P.order.indexOf(P.index) + 1, 0, P.index + 1); }
      emit("queue", { queue: P.queue, index: P.index });
      prefetchNext();
    },
    addToQueue(s) {
      if (!current()) { player.play(s); return; }
      P.queue.push(lite(s));
      if (P.shuffle && P.order) P.order.push(P.queue.length - 1);
      emit("queue", { queue: P.queue, index: P.index });
      prefetchNext();
    },
    removeAt(i) {
      if (i === P.index || i < 0 || i >= P.queue.length) return;
      P.queue.splice(i, 1);
      if (i < P.index) P.index--;
      if (P.order) P.order = P.order.filter(x => x !== i).map(x => (x > i ? x - 1 : x));
      emit("queue", { queue: P.queue, index: P.index });
      prefetchNext();
    },
    setShuffle(v) {
      P.shuffle = !!v; P.order = P.shuffle && current() ? (makeOrder(), P.order) : null;
      emit("queue", { queue: P.queue, index: P.index }); emit("mode", { shuffle: P.shuffle, repeat: P.repeat });
      prefetchNext();
      return P.shuffle;
    },
    cycleRepeat() {
      P.repeat = P.repeat === "off" ? "all" : P.repeat === "all" ? "one" : "off";
      emit("mode", { shuffle: P.shuffle, repeat: P.repeat });
      if (P.repeat === "off" && current()) maybeExtendRadio();   // autoplay resumes near the end of the queue
      prefetchNext();
      return P.repeat;
    },
    get queue() { return P.queue; }, get index() { return P.index; }, get current() { return current(); },
    get state() { return P.state; }, get time() { return { cur: P.cur, dur: P.dur }; },
    get shuffle() { return P.shuffle; }, get repeat() { return P.repeat; },
    // "audio" | "video": what plays the current song; video: the listener's choice; fallback: a video
    // only because this song has no audio stream (it stops when the screen locks)
    get engine() { return P.engine; }, get video() { return P.video; }, get fallback() { return P.fellBack; },
    upNext() {
      if (P.shuffle && P.order) { const at = P.order.indexOf(P.index); return P.order.slice(at + 1).map(i => P.queue[i]); }
      return P.queue.slice(P.index + 1);
    }
  };

  /* Media Session: lock screen, notification, headset and car controls. They drive the <audio>
     element behind the lock screen as well. No seekbackward / seekforward handlers: iOS would put
     10-second skip buttons on the lock screen in place of previous / next song. */
  const ms = {
    ok: "mediaSession" in navigator,
    meta(s) {
      if (!ms.ok || !s) return;
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.artist, album: "meekin Music",
          artwork: [{ src: thumb(s.id, "small"), sizes: "320x180", type: "image/jpeg" }, { src: thumb(s.id), sizes: "480x360", type: "image/jpeg" }] });
      } catch (e) {}
    },
    state() {
      if (!ms.ok) return;
      const on = P.state === "playing" || (P.state === "buffering" && P.want === "play");
      try { navigator.mediaSession.playbackState = on ? "playing" : (current() ? "paused" : "none"); } catch (e) {}
    },
    position() {
      if (!ms.ok || !navigator.mediaSession.setPositionState || !(P.dur > 0)) return;
      try { navigator.mediaSession.setPositionState({ duration: P.dur, position: Math.max(0, Math.min(P.cur, P.dur)), playbackRate: 1 }); } catch (e) {}
    },
    init() {
      if (!ms.ok) return;
      const h = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (e) {} };
      h("play", () => resume());
      h("pause", () => pauseNow());
      h("stop", () => pauseNow());
      h("previoustrack", () => player.prev());
      h("nexttrack", () => player.next());
      h("seekto", d => { if (d && d.seekTime != null) player.seek(d.seekTime); });
    }
  };
  ms.init();
  document.addEventListener("visibilitychange", () => {
    if (!current()) return;
    if (document.hidden) {
      // mobile browsers pause a video behind the lock screen: carry on with the audio from the same spot,
      // unless the listener paused the video by tapping it (more than a moment before the page was hidden)
      const tapped = P.state === "paused" && P.vpauseT > 0 && Date.now() - P.vpauseT > 1500;
      if (P.engine === "video" && !P.fellBack && P.want === "play" && !tapped) { P.handedOff = true; P.rung = 0; loadAudio(P.cur); }
    } else if (P.handedOff) {
      // shown again: back to the video the listener chose
      P.handedOff = false;
      if (P.video && P.engine === "audio" && !P.noVideo) loadVideo(P.cur);
    }
  });

  window.MeekinMusic = {
    api, recs, lib, player, on,
    util: { fmtDur, fmtCount, thumb, clean, isMusic, uniqSongs, shuffled,
      esc: s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])) },
    PLAYER_URL
  };
})();
