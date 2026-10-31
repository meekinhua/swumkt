/* meekin Tunes — the Spotify-style front-end of meekin Music.
   ../core.js (window.MeekinMusic) does search, recommendations, the library and playback;
   this file only draws the UI.

   The video host #ph is handed to player.attach() once and is never moved in the DOM.
   Switching between the mini player and the full "now playing" screen only restyles it
   (left/top/width/height). While a song is loaded it stays on screen at 200x200 CSS px or
   larger and above everything else: menus and toasts sit below it in z-order and are
   placed in the free space beside it. */
(function () {
  "use strict";

  const MM = window.MeekinMusic;
  const main = document.getElementById("main");
  if (!MM) {
    main.innerHTML = '<div class="state"><h3>โหลดไม่สำเร็จ</h3><p>ลองโหลดหน้านี้ใหม่อีกครั้ง</p></div>';
    return;
  }
  const api = MM.api, recs = MM.recs, lib = MM.lib, player = MM.player, util = MM.util;
  const esc = util.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const npEl = $("#np"), ph = $("#ph"), dock = $("#dock");

  /* ---------------- icons (own drawings) ---------------- */
  const ic = inner => '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + inner + "</svg>";
  const S = (d, w) => '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  const F = d => '<path d="' + d + '" fill="currentColor"/>';
  const HEART = "M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z";
  const REPEAT = "M4 11.5V9.5A2.5 2.5 0 0 1 6.5 7H19M16 4l3 3-3 3M20 12.5v2a2.5 2.5 0 0 1-2.5 2.5H5M8 20l-3-3 3-3";
  const IC = {
    home: ic(S("M4 10.4 12 4l8 6.4V20h-5.2v-5.6H9.2V20H4z")),
    homeF: ic(F("M3 10 12 2.8 21 10v11h-7v-6h-4v6H3z")),
    search: ic(S("M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.4 15.4 20 20")),
    searchF: ic(S("M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.4 15.4 20 20", 3)),
    lib: ic(S("M5 4v16M10 4v16M14.5 4.8l5 14.6")),
    libF: ic(S("M5 4v16M10 4v16M14.5 4.8l5 14.6", 3)),
    plus: ic(S("M12 5v14M5 12h14")),
    heart: ic(S(HEART)),
    heartF: ic('<path d="' + HEART + '" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'),
    more: ic(F("M12 3.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 6.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 6.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z")),
    play: ic(F("M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z")),
    pause: ic(F("M6.5 4.5h3.8v15H6.5zM13.7 4.5h3.8v15h-3.8z")),
    next: ic(F("M5.5 5.6v12.8a.7.7 0 0 0 1.1.6l9.4-6.4a.7.7 0 0 0 0-1.2L6.6 5a.7.7 0 0 0-1.1.6zM16.5 5H19v14h-2.5z")),
    prev: ic(F("M18.5 5.6v12.8a.7.7 0 0 1-1.1.6L8 12.6a.7.7 0 0 1 0-1.2L17.4 5a.7.7 0 0 1 1.1.6zM5 5h2.5v14H5z")),
    shuffle: ic(S("M3.5 7h3.2c2.6 0 3.8 1.6 5.3 5s2.7 5 5.3 5h3.2M3.5 17h3.2c1.4 0 2.4-.5 3.2-1.3M13.8 8.3c.8-.8 1.8-1.3 3.2-1.3h3.5M18 4.5 20.5 7 18 9.5M18 14.5l2.5 2.5-2.5 2.5")),
    repeat: ic(S(REPEAT)),
    repeat1: ic(S(REPEAT) + '<path d="M11 10.6l1.5-1v5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    down: ic(S("M6 9l6 6 6-6")),
    up: ic(S("M6 15l6-6 6 6")),
    left: ic(S("M15 5l-7 7 7 7")),
    right: ic(S("M9 5l7 7-7 7")),
    close: ic(S("M6 6l12 12M18 6 6 18")),
    clock: ic(S("M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 8v4.4l2.8 1.8")),
    gear: ic(S("M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4")),
    queue: ic(S("M4 6h12M4 11h12M4 16h6") + F("M14 13.5v6.2l5-3.1z")),
    playNext: ic(S("M4 6h9M4 11h9M4 16h6M15.5 12.5h5.5M18.5 10l2.5 2.5-2.5 2.5")),
    queueAdd: ic(S("M4 6h12M4 11h12M4 16h7M17 14v6M14 17h6")),
    plAdd: ic(S("M4 6h11M4 11h11M4 16h7M18 13v7M14.5 16.5h7")),
    user: ic(S("M12 4.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5")),
    radio: ic(F("M12 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4z") + S("M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.7 5.7a9 9 0 0 0 0 12.6M18.3 5.7a9 9 0 0 1 0 12.6")),
    trash: ic(S("M4.5 7h15M9.5 7V4.8h5V7M6.8 7l.9 12.5h8.6l.9-12.5")),
    edit: ic(S("M4 20h4.2L19 9.2 14.8 5 4 15.8zM13 6.8l4.2 4.2")),
    check: ic(S("M5 12.5l4.5 4.5L19 7", 2.6)),
    addCircle: ic(S("M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 8v8M8 12h8", 1.7)),
    checkCircle: ic(F("M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z") + '<path d="M7.8 12.3l2.8 2.8 5.6-5.8" fill="none" stroke="#04221e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    minus: ic(S("M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM8 12h8")),
    note: ic(S("M9 17.5V6l10-2v11.5") + F("M6.5 15a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM16.5 13a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z")),
    pin: ic(F("M14.5 3.5l6 6-2.2.9-3.4 3.4.2 3.7-1.6 1.6-3.2-3.2L6 20.2l-1.1.1.1-1.1 4.3-4.3-3.2-3.2 1.6-1.6 3.7.2 3.4-3.4z")),
    lock: ic(S("M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13z")),
    tv: ic(S("M3.5 5.5h17v11h-17zM8 20h8")),
    swap: ic(S("M7 4 4 7l3 3M4 7h12M17 20l3-3-3-3M20 17H8")),
    expand: ic(S("M14 4h6v6M10 20H4v-6M20 4l-6.5 6.5M4 20l6.5-6.5"))
  };
  const EQ = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
  const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#2dd4bf"/><g fill="#06302b">' +
    '<rect x="13" y="27" width="7.5" height="22" rx="3.75"/><rect x="23.8" y="15" width="7.5" height="34" rx="3.75"/>' +
    '<rect x="34.6" y="22" width="7.5" height="27" rx="3.75"/><rect x="45.4" y="31" width="7.5" height="18" rx="3.75"/></g></svg>';
  const BG_NOTE = "เพลงจะหยุดเมื่อล็อกหน้าจอหรือสลับไปแอปอื่น เพราะข้อกำหนดของ YouTube ไม่อนุญาตให้แอปภายนอกเล่นเพลงเบื้องหลัง";

  /* ---------------- this app's own small stores (core keeps the shared library) ---------------- */
  function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  const store = {
    recent: lsGet("tunes_recent", []),     // recently opened playlists/albums/mixes/artists/genres
    saved: lsGet("tunes_saved", []),       // albums / playlists saved to "your library"
    avatars: lsGet("tunes_avatars", {}),   // artist name (lower case) -> {id, avatar}
    gart: lsGet("tunes_gart", {})          // genre key -> {t: thumb, at}
  };
  function remember(entry) {
    store.recent = [entry].concat(store.recent.filter(r => r.key !== entry.key)).slice(0, 24);
    lsSet("tunes_recent", store.recent);
  }
  function forget(key) { store.recent = store.recent.filter(r => r.key !== key); lsSet("tunes_recent", store.recent); }
  function renameRecent(key, title) { store.recent.forEach(r => { if (r.key === key) { r.title = title; if (r.route) r.route.title = title; } }); lsSet("tunes_recent", store.recent); }
  const isSaved = id => store.saved.some(a => a.id === id);
  function toggleSaved(a) {
    if (isSaved(a.id)) store.saved = store.saved.filter(x => x.id !== a.id);
    else store.saved.unshift({ id: a.id, title: a.title || "", owner: a.owner || "", thumb: a.thumb || "", count: a.count || 0 });
    lsSet("tunes_saved", store.saved);
    return isSaved(a.id);
  }
  function rememberAvatar(name, id, avatar) {
    if (!name || !avatar) return;
    store.avatars[name.toLowerCase()] = { id: id || "", avatar };
    const keys = Object.keys(store.avatars);
    if (keys.length > 300) keys.slice(0, keys.length - 300).forEach(k => delete store.avatars[k]);
    lsSet("tunes_avatars", store.avatars);
  }

  /* ---------------- helpers ---------------- */
  function hue(s) {
    s = String(s || ""); let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) % 360;
  }
  function hexHue(hex) {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); if (!m) return 200;
    const r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return 0;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = Math.round(h * 60); return h < 0 ? h + 360 : h;
  }
  const mmss = s => { s = Math.max(0, Math.floor(s || 0)); const m = Math.floor(s / 60), x = s % 60; return m + ":" + (x < 10 ? "0" : "") + x; };
  function greeting() { const h = new Date().getHours(); return h >= 5 && h < 12 ? "สวัสดีตอนเช้า" : h >= 12 && h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น"; }
  function ago(t) {
    const m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return "เมื่อสักครู่"; if (m < 60) return m + " นาทีที่แล้ว";
    const h = Math.floor(m / 60); if (h < 24) return h + " ชั่วโมงที่แล้ว";
    const d = Math.floor(h / 24); if (d < 30) return d + " วันที่แล้ว";
    try { return new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short" }); } catch (e) { return ""; }
  }
  function totalDur(songs) {
    const s = songs.reduce((a, x) => a + (x.sec || 0), 0); if (!s) return "";
    const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
    return h ? "ประมาณ " + h + " ชม. " + m + " นาที" : m + " นาที";
  }
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, "");
  const sel = v => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, "\\$&"));
  const navH = () => $("#tabs").offsetHeight || 0;

  /* ---------------- covers ---------------- */
  const imgTag = (src, cls) => (src ? '<img class="' + (cls || "sq") + '" src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : "");
  const ytCls = src => (/i\.ytimg\.com\/vi\/[^/]+\/(hq|sd|maxres|0)/.test(src || "") ? "yt" : "sq");
  const x = extra => (extra ? " " + extra : "");
  function cover(src, extra) { return '<div class="cv' + x(extra) + '">' + (src ? imgTag(src, ytCls(src)) : '<span class="cv-ph">' + IC.note + "</span>") + "</div>"; }
  const songCover = (s, extra) => cover(s.thumb || util.thumb(s.id), extra);
  const likedCover = extra => '<div class="cv liked' + x(extra) + '">' + IC.heartF + "</div>";
  function plCover(p, extra) {
    const t = (p && p.songs || []).slice(0, 4);
    if (t.length >= 4) return '<div class="cv mosaic' + x(extra) + '">' + t.map(s => imgTag(util.thumb(s.id, "small"), "sq")).join("") + "</div>";
    if (t.length) return cover(t[0].thumb || util.thumb(t[0].id), extra);
    return '<div class="cv empty' + x(extra) + '"><span class="cv-ph">' + IC.note + "</span></div>";
  }
  function artistCover(a, extra) {
    const known = store.avatars[(a.name || "").toLowerCase()];
    const av = a.avatar || (known && known.avatar) || "";
    const ini = Array.from((a.name || "?").trim())[0] || "?";
    return '<div class="cv round' + x(extra) + '" style="--h:' + hue(a.name || a.id) + '"' + (av ? "" : ' data-avname="' + esc(a.name || "") + '"') + ">" +
      (av ? imgTag(av, "sq") : '<span class="cv-ini">' + esc(ini.toUpperCase()) + "</span>") + "</div>";
  }
  const mixCover = (thumb, id, label, extra) => '<div class="cv mix' + x(extra) + '" style="--h:' + hue(id) + '">' + imgTag(thumb, "yt") + '<span class="mix-band">' + esc(label) + "</span></div>";
  const genreCover = (g, extra) => '<div class="cv genre' + x(extra) + '" style="--c:' + esc(g.color) + '"><span>' + esc(g.name) + "</span></div>";
  const chartCover = (which, extra) => '<div class="cv chart' + x(extra) + '" style="--h:' + (which === "th" ? 172 : 262) + '"><b>Top 100</b><small>' + (which === "th" ? "ไทย" : "ทั่วโลก") + "</small></div>";

  /* ---------------- registry: songs lists and links drawn on screen ---------------- */
  const REG = {}; let regN = 0;
  function reg(o, scope) { const k = (scope || "p") + (++regN); REG[k] = o; return k; }
  function clearReg(scope) { Object.keys(REG).forEach(k => { if (k.charAt(0) === scope) delete REG[k]; }); }

  /* ---------------- building blocks ---------------- */
  function songCard(s, k, i) {
    return '<div class="card" data-a="song" data-k="' + k + '" data-i="' + i + '" data-sid="' + esc(s.id) + '" role="button" tabindex="0">' +
      songCover(s) + '<div class="card-b"><div class="card-t"><b>' + esc(s.title) + "</b><small>" + esc(s.artist) + "</small></div>" +
      '<button class="ib sm" data-a="smenu" data-k="' + k + '" data-i="' + i + '" aria-label="ตัวเลือกของเพลงนี้">' + IC.more + "</button></div></div>";
  }
  function ctxCard(o) {
    const k = reg({ route: o.route });
    return '<button class="card' + (o.round ? " artist" : "") + '" data-a="go" data-k="' + k + '">' + o.cover +
      '<div class="card-t"><b>' + esc(o.title) + "</b>" + (o.sub ? "<small>" + esc(o.sub) + "</small>" : "") + "</div></button>";
  }
  function trackRow(s, k, i, o) {
    o = o || {};
    const sub = o.sub != null ? o.sub : esc(s.artist) + (s.dur ? " • " + esc(s.dur) : "");
    return '<div class="row' + (o.hide ? " xtra" : "") + (o.cls ? " " + o.cls : "") + '" data-a="song" data-k="' + k + '" data-i="' + i + '" data-sid="' + esc(s.id) + '" role="button" tabindex="0">' +
      (o.num ? '<span class="n"><em>' + (i + 1) + "</em>" + EQ + "</span>" : "") +
      songCover(s, "th") + '<div class="meta"><b>' + esc(s.title) + "</b><small>" + sub + "</small></div>" +
      '<button class="ib" data-a="smenu" data-k="' + k + '" data-i="' + i + '" aria-label="ตัวเลือกของเพลงนี้">' + IC.more + "</button></div>";
  }
  function tileHTML(t) {
    const k = reg({ route: t.route });
    return '<button class="tile" data-a="go" data-k="' + k + '" data-kind="' + (t.kind || "music") + '">' + t.cover + "<b>" + esc(t.title) + "</b></button>";
  }
  function lrow(o) {
    const k = reg({ route: o.route });
    return '<button class="lrow" data-a="go" data-k="' + k + '">' + o.cover + '<span class="lr-t"><b>' + esc(o.title) + "</b><small>" + (o.subHTML || esc(o.sub || "")) + "</small></span></button>";
  }
  function genreTile(g) {
    const k = reg({ route: { name: "genre", key: g.key } });
    const art = store.gart[g.key];
    return '<button class="gtile" data-a="go" data-k="' + k + '" data-g="' + esc(g.key) + '" style="--c:' + esc(g.color) + '"><span>' + esc(g.name) + "</span>" +
      '<div class="gt-art">' + (art && art.t ? imgTag(art.t, "") : IC.note) + "</div></button>";
  }
  function topbar(title, withPlay) {
    return '<div class="topbar"><button class="ib tb-back" data-a="back" aria-label="ย้อนกลับ">' + IC.left + '</button><b class="tb-t">' + esc(title) + "</b>" +
      (withPlay ? '<button class="bigplay xs tb-play" data-a="play-page" aria-label="เล่น">' + IC.play + "</button>" : "") + "</div>";
  }
  function bindTopbar(threshold) {
    const tb = $(".topbar", main); if (!tb) return;
    const th = threshold || 210;
    const upd = () => { const o = Math.max(0, Math.min(1, (main.scrollTop - th) / 60)); tb.style.setProperty("--o", o.toFixed(3)); tb.classList.toggle("solid", o > 0.9); };
    main.onscroll = upd; upd();
  }
  const shufBtn = () => '<button class="ib tog' + (player.shuffle ? " on" : "") + '" data-a="shuffle" aria-label="สุ่มเพลง" aria-pressed="' + player.shuffle + '">' + IC.shuffle + "</button>";
  const bigPlay = () => '<button class="bigplay" data-a="play-page" aria-label="เล่น">' + IC.play + "</button>";
  const skRow = () => '<div class="row sk"><span class="n"></span><i class="skb th"></i><div class="meta"><i class="skb l1"></i><i class="skb l2"></i></div></div>';
  const skRows = n => Array.from({ length: n }, skRow).join("");
  const skCards = (n, round) => '<div class="hrow">' + Array.from({ length: n }, () => '<div class="card sk' + (round ? " artist" : "") + '"><i class="skb cv"></i><i class="skb l1"></i><i class="skb l2"></i></div>').join("") + "</div>";
  function emptyState(title, text, extra) {
    return '<div class="state">' + IC.note + "<h3>" + esc(title) + "</h3>" + (text ? "<p>" + esc(text) + "</p>" : "") + (extra || "") + "</div>";
  }
  function errState(title, text) {
    const off = navigator.onLine === false;
    return '<div class="state"><h3>' + esc(off ? "ไม่มีการเชื่อมต่ออินเทอร์เน็ต" : title) + "</h3><p>" + esc(off ? "ตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง" : text || "เซิร์ฟเวอร์เพลงไม่ตอบสนอง ลองใหม่อีกครั้ง") + "</p>" +
      '<button class="btn pri" data-a="retry">ลองอีกครั้ง</button></div>';
  }
  function plRoute(al) { return { name: "pl", id: al.id, title: al.title || "", thumb: al.thumb || "", owner: al.owner || "" }; }
  function artistRouteFor(s) {
    // the uploader channel is the artist only when its name matches; labels upload for many artists
    const a = String(s.artist || "").trim(), al = a.toLowerCase();
    const ch = String(s.channel || "").replace(/\s*-\s*Topic$/i, "").replace(/\s*VEVO$/i, "").trim().toLowerCase();
    if (s.artistId && (!ch || !al || ch === al || ch.indexOf(al) >= 0 || al.indexOf(ch) >= 0)) return { name: "artist", id: s.artistId, q: a };
    return { name: "artist", id: "", q: a, fb: s.artistId || "" };
  }

  // chart playlists, read from the home section list (core does not export the ids)
  const SEC0 = recs.home();
  const CH_TH = (SEC0.find(s => s.key === "chartTH") || {}).playlist || "";
  const CH_GL = (SEC0.find(s => s.key === "chartGlobal") || {}).playlist || "";
  const isChart = id => !!id && (id === CH_TH || id === CH_GL);
  // charts keep this app's own Thai names; the server's English title and owner are not shown
  const chartTitle = id => (!isChart(id) ? "" : id === CH_TH ? "Top 100 เพลงฮิตในไทย" : "Top 100 ทั่วโลก");
  const mixMem = {};

  /* ---------------- lazy artist pictures and genre art ---------------- */
  const avQueue = []; let avBusy = false;
  function lazyAvatars(root, tok) {
    $$(".cv.round[data-avname]", root).forEach(el => { if (el.dataset.avname) avQueue.push({ el, n: el.dataset.avname, tok }); });
    pumpAv();
  }
  function setAv(el, src) {
    if (!src || !el.isConnected) return;
    el.removeAttribute("data-avname");
    el.innerHTML = imgTag(src, "sq");
  }
  function pumpAv() {
    if (avBusy) return;
    const job = avQueue.shift(); if (!job) return;
    if (job.tok !== navTok || !job.el.isConnected) { pumpAv(); return; }
    const hit = store.avatars[job.n.toLowerCase()];
    if (hit) { setAv(job.el, hit.avatar); pumpAv(); return; }
    avBusy = true;
    api.searchArtists(job.n).then(r => {
      const a = r && (r.find(z => z.name.toLowerCase() === job.n.toLowerCase()) || r[0]);
      if (a && a.avatar) { rememberAvatar(job.n, a.id, a.avatar); setAv(job.el, a.avatar); }
    }).catch(() => {}).then(() => { avBusy = false; setTimeout(pumpAv, 150); });
  }
  const gQueue = []; let gBusy = false;
  function lazyGenreArt(root, tok) {
    const els = $$(".gtile[data-g]", root).filter(el => { const a = store.gart[el.dataset.g]; return !(a && a.t && Date.now() - a.at < 864e5 * 3); });
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) { els.forEach(el => gQueue.push({ el, tok })); pumpG(); return; }
    const io = new IntersectionObserver(ents => {
      ents.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); gQueue.push({ el: en.target, tok }); pumpG(); } });
    }, { root: main, rootMargin: "120px" });
    els.forEach(el => io.observe(el));
  }
  function pumpG() {
    if (gBusy) return;
    const job = gQueue.shift(); if (!job) return;
    if (job.tok !== navTok || !job.el.isConnected) { pumpG(); return; }
    gBusy = true;
    const key = job.el.dataset.g;
    api.genre(key).then(songs => {
      if (!songs || !songs.length) return;
      const t = songs[0].thumb || util.thumb(songs[0].id);
      store.gart[key] = { t, at: Date.now() }; lsSet("tunes_gart", store.gart);
      $$('.gtile[data-g="' + sel(key) + '"] .gt-art').forEach(a => { a.innerHTML = imgTag(t, ""); });
    }).catch(() => {}).then(() => { gBusy = false; setTimeout(pumpG, 250); });
  }

  /* ================= router (history stack) ================= */
  let navTok = 0, cur = null, pendingRestore = null;
  const scrollMem = {};
  const pageAt = {};           // history index -> page, to know what "back" leads to
  const PAGES = {};
  let pageCtx = null;          // the list the page's big play button plays
  let pageMeta = null;         // extra info of the open album / artist

  let pendingGo = null;        // a page to open once history is back on the bottom sheet
  function saveScroll() { if (cur) scrollMem[cur.idx] = main.scrollTop; }
  function go(page, opt) {
    opt = opt || {};
    if (!page.tab) page.tab = (cur && cur.page.tab) || "home";
    // from stacked sheets (now playing + queue) step back to the bottom one first, so the page
    // replaces all of them and no sheet entry is left behind for Back to reopen
    if (cur.layers.length > 1) { pendingGo = { page, opt }; history.go(-(cur.layers.length - 1)); return; }
    saveScroll();
    const prevLayers = cur.layers;
    const replace = prevLayers.length > 0 || !!opt.replace;   // a page opened from a sheet takes the sheet's place
    const st = { page, layers: [], idx: replace ? cur.idx : cur.idx + 1 };
    try { if (replace) history.replaceState(st, ""); else history.pushState(st, ""); } catch (e) {}
    cur = st;
    delete scrollMem[st.idx];
    pageAt[st.idx] = page;
    if (prevLayers.length) applyLayers(prevLayers, []);
    renderPage(page, false);
  }
  function pushLayer(name) {
    const st = { page: cur.page, layers: cur.layers.concat(name), idx: cur.idx + 1 };
    saveScroll();
    try { history.pushState(st, ""); } catch (e) {}
    cur = st;
  }
  function goBack() { if (cur.idx > 0) history.back(); else go({ name: "home", tab: "home" }, { replace: true }); }
  window.addEventListener("popstate", e => {
    const st = e.state && e.state.page ? e.state : { page: { name: "home", tab: "home" }, layers: [], idx: 0 };
    const prev = cur;
    // a menu that is closed, or a player sheet with no song loaded (after a reload), cannot be
    // shown again: Forward onto such an entry is undone, other entries drop those layers
    const want = st.layers || [];
    const layers = want.filter(l => (l === "modal" ? MD.open : !!player.current));
    if (layers.length < want.length && (st.idx || 0) > prev.idx) { history.back(); return; }
    const samePage = JSON.stringify(prev.page) === JSON.stringify(st.page);
    if (!samePage) saveScroll();
    cur = { page: st.page, layers, idx: st.idx || 0 };
    if (layers.length < want.length) try { history.replaceState(cur, ""); } catch (err) {}
    pageAt[cur.idx] = cur.page;
    applyLayers(prev.layers, cur.layers);
    if (!samePage) renderPage(cur.page, true);
    if (pendingGo) { const g = pendingGo; pendingGo = null; go(g.page, g.opt); }
  });
  function applyLayers(from, to) {
    const has = (l, n) => l.indexOf(n) >= 0;
    if (has(from, "modal") && !has(to, "modal") && MD.open) hideModal();
    if (has(from, "queue") && !has(to, "queue")) setQueueView(false);
    if (has(from, "np") && !has(to, "np")) setMode(player.current ? "mini" : "none");
    if (!has(from, "np") && has(to, "np") && player.current) setMode("full");
    if (!has(from, "queue") && has(to, "queue") && player.current) setQueueView(true);
  }
  function renderPage(page, restoring) {
    const tok = ++navTok;
    clearReg("p");
    pageCtx = null; pageMeta = null;
    main.onscroll = null;
    syncNav(page.tab || "home");
    const R = PAGES[page.name] || PAGES.home;
    try { R(page, tok); } catch (err) { console.error(err); main.innerHTML = errState("แสดงหน้านี้ไม่ได้"); }
    const y = restoring ? scrollMem[cur.idx] || 0 : 0;
    main.scrollTop = y;
    pendingRestore = y > 0 ? { tok, y } : null;
    markPlaying(); updatePlayButtons();
  }
  function afterAsync(tok) {
    if (tok !== navTok) return;
    if (pendingRestore && pendingRestore.tok === tok) main.scrollTop = pendingRestore.y;
    markPlaying(); updatePlayButtons();
  }
  function refreshPage() {
    const y = main.scrollTop;
    scrollMem[cur.idx] = y;
    renderPage(cur.page, true);
  }
  ["touchstart", "wheel", "keydown"].forEach(ev => main.addEventListener(ev, () => { pendingRestore = null; }, { passive: true }));
  function syncNav(tab) { $$('[data-a="tab"]').forEach(b => b.classList.toggle("on", b.dataset.tab === tab)); }
  function tabTo(tab) {
    if (cur.page.name === tab) {
      main.scrollTo({ top: 0, behavior: "smooth" });
      if (tab === "search") { const inp = $("#sInput"); if (inp) inp.focus(); }
      return;
    }
    go({ name: tab, tab });
  }

  /* ================= pages ================= */
  const CHIPS = [["all", "ทั้งหมด"], ["music", "เพลง"], ["artists", "ศิลปิน"]];

  function homeTiles(mixes) {
    const T = [], seen = {};
    const add = t => { if (t && T.length < 8 && !seen[t.key]) { seen[t.key] = 1; T.push(t); } };
    add({ key: "liked", title: "เพลงที่ถูกใจ", cover: likedCover(), route: { name: "liked" } });
    store.recent.forEach(r => {
      if (!r || !r.key || !r.route || r.key === "liked") return;
      if (r.key.indexOf("upl:") === 0 && !lib.playlists.some(p => "upl:" + p.id === r.key)) return;
      const ct = r.key.indexOf("pl:") === 0 ? chartTitle(r.key.slice(3)) : "";
      add({ key: r.key, title: ct || r.title, cover: recentCover(r), route: r.route, kind: r.round ? "artists" : "music" });
    });
    lib.playlists.forEach(p => add({ key: "upl:" + p.id, title: p.name, cover: plCover(p), route: { name: "upl", id: p.id } }));
    lib.artists.forEach(a => add({ key: "artist:" + a.id, title: a.name, cover: artistCover(a), route: { name: "artist", id: a.id, q: a.name }, kind: "artists" }));
    (mixes || []).forEach((m, i) => add({ key: m.id, title: "เดลี่มิกซ์ " + (i + 1), cover: mixCover(m.thumb, m.id, "เดลี่มิกซ์ " + (i + 1)), route: { name: "mix", id: m.id, title: "เดลี่มิกซ์ " + (i + 1) } }));
    if (T.length < 8 && CH_TH) add({ key: "pl:" + CH_TH, title: chartTitle(CH_TH), cover: chartCover("th"), route: { name: "pl", id: CH_TH, title: chartTitle(CH_TH) } });
    if (T.length < 8 && CH_GL) add({ key: "pl:" + CH_GL, title: chartTitle(CH_GL), cover: chartCover("gl"), route: { name: "pl", id: CH_GL, title: chartTitle(CH_GL) } });
    api.GENRES.forEach(g => { if (T.length < 8) add({ key: "genre:" + g.key, title: g.name, cover: genreCover(g), route: { name: "genre", key: g.key } }); });
    return T;
  }
  function recentCover(r) {
    if (r.round) return artistCover({ name: r.title, avatar: r.thumb });
    if (r.key.indexOf("upl:") === 0) return plCover(lib.playlists.find(p => "upl:" + p.id === r.key));
    if (r.key.indexOf("genre:") === 0) { const g = api.GENRES.find(z => "genre:" + z.key === r.key); return g ? genreCover(g) : cover(""); }
    if (r.key === "pl:" + CH_TH || r.key === "pl:" + CH_GL) return chartCover(r.key === "pl:" + CH_TH ? "th" : "gl");
    if (r.key.indexOf("mix:") === 0) return mixCover(r.thumb, r.key, r.title);
    return cover(r.thumb);
  }
  function secHead(sec) {
    const more = sec.playlist ? '<button class="more" data-a="go" data-k="' + reg({ route: { name: "pl", id: sec.playlist, title: sec.title } }) + '">ดูทั้งหมด</button>' : "";
    return '<div class="sec-h"><div>' + (sec.subtitle ? "<small>" + esc(sec.subtitle) + "</small>" : "") + "<h2>" + esc(sec.title) + "</h2></div>" + more + "</div>";
  }
  function secBody(sec, data) {
    switch (sec.kind) {
      case "mixes":
        return '<div class="hrow">' + data.map((m, i) => ctxCard({ cover: mixCover(m.thumb, m.id, "เดลี่มิกซ์ " + (i + 1)), title: "เดลี่มิกซ์ " + (i + 1),
          sub: m.subtitle || m.title, route: { name: "mix", id: m.id, title: "เดลี่มิกซ์ " + (i + 1) } })).join("") + "</div>";
      case "artists":
        return '<div class="hrow">' + data.map(a => ctxCard({ cover: artistCover(a), title: a.name, sub: "ศิลปิน", round: true,
          route: { name: "artist", id: a.id || "", q: a.name, fb: (a.seed && a.seed.artistId) || "" } })).join("") + "</div>";
      case "genres":
        return '<div class="hrow">' + data.map(genreTile).join("") + "</div>";
      case "albums":
        return '<div class="hrow">' + data.map(al => ctxCard({ cover: cover(al.thumb), title: al.title, sub: al.owner, route: plRoute(al) })).join("") + "</div>";
      default: {
        const list = data.slice(0, 24);
        const k = reg({ songs: list, ctx: { key: "home:" + sec.key, label: sec.title } });
        return '<div class="hrow">' + list.map((s, i) => songCard(s, k, i)).join("") + "</div>";
      }
    }
  }

  PAGES.home = function (page, tok) {
    const chip = page.chip || "all";
    main.innerHTML = '<div class="page home" id="home" data-chip="' + chip + '">' +
      '<header class="home-head"><h1>' + greeting() + '</h1><div class="hh-btns">' +
      '<button class="ib" data-a="nav" data-to="history" aria-label="ประวัติการฟัง">' + IC.clock + "</button>" +
      '<button class="ib" data-a="nav" data-to="settings" aria-label="การตั้งค่าและข้อมูลแอป">' + IC.gear + "</button></div></header>" +
      '<div class="chips" role="group" aria-label="ตัวกรอง">' + CHIPS.map(c => '<button class="chip' + (c[0] === chip ? " on" : "") + '" data-a="home-chip" data-chip="' + c[0] + '">' + c[1] + "</button>").join("") + "</div>" +
      '<div class="tiles" id="hTiles"></div><div id="hSecs"></div>' +
      '<p class="artists-empty">ยังไม่มีศิลปินที่นี่ ฟังเพลงหรือกด “ติดตาม” ในหน้าศิลปิน แล้วศิลปินจะมาอยู่ตรงนี้</p></div>';
    const homeEl = $("#home"), box = $("#hSecs");
    let mixes = null;
    const checkArt = () => homeEl.classList.toggle("no-art", !$('[data-kind="artists"]', homeEl));
    const drawTiles = () => { const t = $("#hTiles"); t.innerHTML = homeTiles(mixes).map(tileHTML).join(""); lazyAvatars(t, tok); checkArt(); };
    drawTiles();

    function addSec(sec) {
      const el = document.createElement("section");
      el.className = "sec";
      el.dataset.kind = sec.kind === "artists" ? "artists" : "music";
      box.appendChild(el);
      const run = () => {
        el.innerHTML = secHead(sec) + skCards(6, sec.kind === "artists");
        let p; try { p = Promise.resolve(sec.load()); } catch (e) { p = Promise.reject(e); }
        p.then(data => {
          if (tok !== navTok) return;
          if (data == null) throw new Error("no data");
          if (!data.length) { if (sec.emptyHTML) el.innerHTML = secHead(sec) + sec.emptyHTML; else el.remove(); checkArt(); return; }
          if (sec.kind === "mixes") {
            mixes = data;
            data.forEach((m, i) => { mixMem[m.id] = Object.assign({}, m, { label: "เดลี่มิกซ์ " + (i + 1) }); });
            drawTiles();
          }
          el.innerHTML = secHead(sec) + secBody(sec, data);
          if (sec.kind === "artists") lazyAvatars(el, tok);
          if (sec.kind === "genres") lazyGenreArt(el, tok);
          checkArt(); afterAsync(tok);
        }).catch(() => {
          if (tok !== navTok) return;
          el.innerHTML = secHead(sec) + '<div class="sec-err"><span>โหลดส่วนนี้ไม่สำเร็จ</span><button class="btn ghost sm" data-a="retry-sec">ลองอีกครั้ง</button></div>';
        });
      };
      el._retry = run;
      run();
    }

    const secs = recs.home();
    const mixSec = secs.find(s => s.key === "mixes");
    const mixHint = text => '<div class="hint-card">' + IC.note + "<p>" + text + "</p></div>";
    if (mixSec) addSec({ key: "made", title: "สร้างมาเพื่อคุณ", kind: "mixes", load: mixSec.load,
      emptyHTML: mixHint("ฟังเพลงเพิ่มอีกสักหน่อย แล้วเดลี่มิกซ์ของคุณจะมาอยู่ตรงนี้") });
    else box.insertAdjacentHTML("beforeend", '<section class="sec" data-kind="music"><div class="sec-h"><h2>สร้างมาเพื่อคุณ</h2></div>' +
      mixHint("ฟังเพลงที่ชอบสักสองสามเพลง แล้วเดลี่มิกซ์ของคุณจะมาอยู่ตรงนี้") + "</section>");
    if (lib.artists.length) addSec({ key: "followed", title: "ศิลปินที่คุณติดตาม", kind: "artists", load: () => Promise.resolve(lib.artists.slice(0, 20)) });
    secs.forEach(s => { if (s.key !== "mixes") addSec(s); });
    checkArt();
  };
  function setHomeChip(c) {
    const h = $("#home"); if (!h) return;
    h.dataset.chip = c;
    $$(".chip", h).forEach(b => b.classList.toggle("on", b.dataset.chip === c));
    cur.page.chip = c;
    try { history.replaceState(cur, ""); } catch (e) {}
  }

  PAGES.search = function (page, tok) {
    const q0 = page.q || "";
    main.innerHTML = '<div class="page search"><header class="s-head"><h1>ค้นหา</h1></header>' +
      '<div class="sbox-wrap"><form class="sbox" id="sForm" role="search" autocomplete="off">' + IC.search +
      '<input id="sInput" type="search" enterkeyhint="search" placeholder="อยากฟังอะไร" aria-label="ค้นหาเพลง ศิลปิน หรืออัลบั้ม" value="' + esc(q0) + '">' +
      '<button type="button" class="ib" data-s="clear" aria-label="ล้างคำค้นหา"' + (q0 ? "" : " hidden") + ">" + IC.close + "</button></form></div>" +
      '<div id="sBody"></div></div>';
    const form = $("#sForm"), input = $("#sInput"), body = $("#sBody"), xb = $('[data-s="clear"]');
    let tmr = 0;

    function browse() {
      body.dataset.mode = "browse";
      const rs = lib.searches.slice(0, 6);
      body.innerHTML = (rs.length ? '<section class="sec" style="margin-top:12px"><div class="sec-h"><h2>การค้นหาล่าสุด</h2><button class="more" data-s="rs-clear">ล้างทั้งหมด</button></div>' +
        rs.map(q => '<div class="sug" data-s="q" data-q="' + esc(q) + '" role="button" tabindex="0">' + IC.clock + "<span>" + esc(q) + '</span><button class="ib sm" data-s="rs-rm" data-q="' + esc(q) + '" aria-label="ลบออกจากประวัติค้นหา">' + IC.close + "</button></div>").join("") + "</section>" : "") +
        '<section class="sec"><div class="sec-h"><h2>เรียกดูทั้งหมด</h2></div><div class="gtiles">' + api.GENRES.map(genreTile).join("") + "</div></section>";
      lazyGenreArt(body, tok);
    }
    function suggestions(v) {
      body.dataset.mode = "sug";
      const first = '<div class="sug" data-s="q" data-q="' + esc(v) + '" role="button" tabindex="0">' + IC.search + "<span>ค้นหา “" + esc(v) + "”</span></div>";
      body.innerHTML = '<div style="padding-top:4px">' + first + "</div>";
      api.suggest(v).then(list => {
        if (tok !== navTok || body.dataset.mode !== "sug" || input.value.trim() !== v) return;
        body.innerHTML = '<div style="padding-top:4px">' + first + (list || []).filter(s => s && s !== v).slice(0, 8)
          .map(s => '<div class="sug" data-s="q" data-q="' + esc(s) + '" role="button" tabindex="0">' + IC.search + "<span>" + esc(s) + "</span></div>").join("") + "</div>";
      }).catch(() => {});
    }
    function runSearch(q) {
      body.dataset.mode = "results";
      body.innerHTML = '<div class="res-top"><section><h2>ผลลัพธ์ยอดนิยม</h2><div class="topcard"><i class="skb" style="width:92px;height:92px;margin-bottom:16px"></i><i class="skb l1"></i><i class="skb l2"></i></div></section>' +
        "<section><h2>เพลง</h2>" + skRows(4) + "</section></div>";
      api.searchAll(q).then(r => {
        if (tok !== navTok || body.dataset.mode !== "results") return;
        if (!r || !r.ok) { body.innerHTML = errState("ค้นหาไม่สำเร็จ"); return; }
        drawResults(q, r);
        afterAsync(tok);
      }).catch(() => { if (tok === navTok && body.dataset.mode === "results") body.innerHTML = errState("ค้นหาไม่สำเร็จ"); });
    }
    function drawResults(q, r) {
      const songs = r.songs, artists = r.artists, albums = r.albums;
      if (!songs.length && !artists.length && !albums.length) {
        body.innerHTML = emptyState("ไม่พบผลลัพธ์สำหรับ “" + q + "”", "ลองตรวจตัวสะกด หรือใช้คำค้นหาที่สั้นลง"); return;
      }
      const nq = norm(q), a0 = artists[0], an = a0 ? norm(a0.name) : "";
      const topArtist = a0 && an.length > 1 && (an === nq || an.indexOf(nq) >= 0 || nq.indexOf(an) >= 0) ? a0 : null;
      const ks = reg({ songs, ctx: { key: "search:" + q, label: "ผลการค้นหา “" + q + "”" } });
      let top = "";
      if (topArtist) {
        const kr = reg({ route: { name: "artist", id: topArtist.id, q: topArtist.name } });
        top = '<div class="topcard" data-a="go" data-k="' + kr + '" role="button" tabindex="0">' + artistCover(topArtist, "tc-cv") +
          '<b class="tc-t">' + esc(topArtist.name) + '</b><span class="tc-s"><em>ศิลปิน</em>' + (topArtist.subs ? "<span>" + esc(topArtist.subs) + " ผู้ติดตาม</span>" : "") + "</span>" +
          '<button class="bigplay sm tc-play" data-a="play-artist" data-id="' + esc(topArtist.id) + '" aria-label="เล่นเพลงยอดนิยมของ ' + esc(topArtist.name) + '">' + IC.play + "</button></div>";
      } else if (songs[0]) {
        const s = songs[0];
        top = '<div class="topcard" data-a="song" data-k="' + ks + '" data-i="0" data-sid="' + esc(s.id) + '" role="button" tabindex="0">' + songCover(s, "tc-cv") +
          '<b class="tc-t">' + esc(s.title) + '</b><span class="tc-s"><em>เพลง</em><span>' + esc(s.artist) + "</span></span>" +
          '<button class="ib tc-more" data-a="smenu" data-k="' + ks + '" data-i="0" aria-label="ตัวเลือกของเพลงนี้">' + IC.more + "</button>" +
          '<button class="bigplay sm tc-play" data-a="song" data-k="' + ks + '" data-i="0" aria-label="เล่น">' + IC.play + "</button></div>";
      }
      body.innerHTML = '<div class="res-top">' +
        (top ? '<section class="res-a"><h2>ผลลัพธ์ยอดนิยม</h2>' + top + "</section>" : "") +
        (songs.length ? '<section class="res-b"><h2>เพลง</h2><div class="tracks" id="sSongs">' + songs.map((s, i) => trackRow(s, ks, i, { hide: i >= 5 })).join("") + "</div>" +
          (songs.length > 5 ? '<button class="more-btn" data-s="more">ดูเพลงทั้งหมด (' + songs.length + ")</button>" : "") + "</section>" : "") + "</div>" +
        (artists.length ? '<section class="sec"><div class="sec-h"><h2>ศิลปิน</h2></div><div class="hrow">' + artists.map(a => ctxCard({ cover: artistCover(a), title: a.name,
          sub: "ศิลปิน", round: true, route: { name: "artist", id: a.id, q: a.name } })).join("") + "</div></section>" : "") +
        (albums.length ? '<section class="sec"><div class="sec-h"><h2>อัลบั้ม</h2></div><div class="hrow">' + albums.map(al => ctxCard({ cover: cover(al.thumb), title: al.title,
          sub: al.owner, route: plRoute(al) })).join("") + "</div></section>" : "");
      artists.forEach(a => rememberAvatar(a.name, a.id, a.avatar));
    }
    function submitQ(v) {
      v = String(v || "").trim(); if (!v) return;
      lib.rememberSearch(v);
      input.blur();
      if (v === q0) { input.value = v; runSearch(v); } else go({ name: "search", q: v, tab: "search" });
    }

    input.addEventListener("input", () => {
      xb.hidden = !input.value;
      clearTimeout(tmr);
      const v = input.value.trim();
      if (!v) { browse(); return; }
      tmr = setTimeout(() => { if (tok === navTok) suggestions(v); }, 220);
    });
    form.addEventListener("submit", e => { e.preventDefault(); submitQ(input.value); });
    main.querySelector(".search").addEventListener("click", e => {
      const t = e.target.closest("[data-s]"); if (!t) return;
      const s = t.dataset.s;
      if (s === "clear") { input.value = ""; xb.hidden = true; input.focus(); browse(); }
      else if (s === "q") submitQ(t.dataset.q);
      else if (s === "rs-rm") { e.stopPropagation(); lib.removeSearch(t.dataset.q); browse(); }
      else if (s === "rs-clear") { lib.clearSearches(); browse(); }
      else if (s === "more") { $("#sSongs").classList.add("all"); t.remove(); }
    });
    if (q0) runSearch(q0); else browse();
  };

  PAGES.library = function (page) {
    const f = page.filter || "";
    const chips = [["pl", "เพลย์ลิสต์"], ["ar", "ศิลปิน"], ["al", "อัลบั้ม"]];
    main.innerHTML = '<div class="page lib"><header class="lib-head"><button class="avatar" data-a="nav" data-to="settings" aria-label="การตั้งค่าและข้อมูลแอป">m</button>' +
      '<h1>คลังของคุณ</h1><button class="ib" data-a="nav" data-to="history" aria-label="ประวัติการฟัง">' + IC.clock + "</button>" +
      '<button class="ib" data-a="new-pl" aria-label="สร้างเพลย์ลิสต์">' + IC.plus + "</button></header>" +
      '<div class="chips" role="group" aria-label="ตัวกรอง">' + (f ? '<button class="chip x" data-a="lib-filter" data-f="" aria-label="ล้างตัวกรอง">' + IC.close + "</button>" : "") +
      chips.filter(c => !f || c[0] === f).map(c => '<button class="chip' + (c[0] === f ? " on" : "") + '" data-a="lib-filter" data-f="' + c[0] + '">' + c[1] + "</button>").join("") + "</div>" +
      '<div id="libList"></div></div>';
    const parts = [];
    if (!f || f === "pl") {
      parts.push(lrow({ cover: likedCover("lr-cv"), title: "เพลงที่ถูกใจ", subHTML: '<span class="pin">' + IC.pin + "</span>เพลย์ลิสต์ • " + lib.liked.length + " เพลง", route: { name: "liked" } }));
      lib.playlists.forEach(p => parts.push(lrow({ cover: plCover(p, "lr-cv"), title: p.name, sub: "เพลย์ลิสต์ • " + p.songs.length + " เพลง", route: { name: "upl", id: p.id } })));
    }
    if (!f || f === "ar") lib.artists.forEach(a => parts.push(lrow({ cover: artistCover(a, "lr-cv"), title: a.name, sub: "ศิลปิน", route: { name: "artist", id: a.id, q: a.name } })));
    if (!f || f === "al") store.saved.forEach(al => parts.push(isChart(al.id)
      ? lrow({ cover: chartCover(al.id === CH_TH ? "th" : "gl", "lr-cv"), title: chartTitle(al.id), sub: "ชาร์ต • meekin Tunes", route: plRoute(al) })
      : lrow({ cover: cover(al.thumb, "lr-cv"), title: al.title || "อัลบั้ม", sub: "อัลบั้ม" + (al.owner ? " • " + al.owner : ""), route: plRoute(al) })));
    let html = parts.join("");
    if ((!f || f === "pl") && !lib.playlists.length)
      html += '<button class="lrow" data-a="new-pl"><span class="cv add lr-cv">' + IC.plus + '</span><span class="lr-t"><b>สร้างเพลย์ลิสต์</b><small>รวมเพลงที่ชอบไว้ด้วยกัน</small></span></button>';
    if (f === "ar" && !lib.artists.length)
      html += emptyState("ยังไม่ได้ติดตามศิลปิน", "กด “ติดตาม” ในหน้าศิลปิน แล้วศิลปินจะมาอยู่ที่นี่", '<button class="btn pri" data-a="tab" data-tab="search">ค้นหาศิลปิน</button>');
    if (f === "al" && !store.saved.length)
      html += emptyState("ยังไม่มีอัลบั้มที่บันทึกไว้", "กดปุ่ม + ในหน้าอัลบั้มหรือเพลย์ลิสต์เพื่อเก็บไว้ที่นี่");
    if (!f) {
      const H = lib.history.slice(0, 5).map(h => h.s);
      const k = reg({ songs: H, ctx: { key: "hist", label: "เล่นล่าสุด" } });
      html += '<section class="sec lib-recent"><div class="sec-h"><h2>เล่นล่าสุด</h2>' + (lib.history.length ? '<button class="more" data-a="nav" data-to="history">ดูทั้งหมด</button>' : "") + "</div>" +
        (H.length ? '<div class="tracks">' + H.map((s, i) => trackRow(s, k, i)).join("") + '</div><div class="tools"><button class="btn ghost sm" data-a="clear-hist">ล้างประวัติ</button></div>'
          : '<p class="muted" style="padding:0 var(--pad)">เพลงที่ฟังเกิน 30 วินาทีจะแสดงที่นี่</p>') + "</section>";
    }
    $("#libList").innerHTML = html;
    lazyAvatars($("#libList"), navTok);
  };
  function setLibFilter(f) { cur.page.filter = f || ""; try { history.replaceState(cur, ""); } catch (e) {} renderPage(cur.page, false); }

  /* collection page: playlists, albums, charts, mixes, genres, liked songs, user playlists */
  function collection(tok, spec) {
    const h = spec.hue != null ? spec.hue : 200;
    const hc = spec.color || "hsl(" + h + " 44% 34%)", hc2 = "hsl(" + h + " 38% 20%)";
    main.innerHTML = '<div class="page coll" style="--hc:' + esc(hc) + ";--hc2:" + hc2 + '">' + topbar(spec.title, true) +
      '<header class="c-head"><div class="c-cover" id="cCover">' + spec.cover + '</div><div class="c-info">' +
      (spec.kind ? '<small class="c-kind">' + esc(spec.kind) + "</small>" : "") + '<h1 class="c-title" id="cTitle">' + esc(spec.title) + "</h1>" +
      '<p class="c-sub" id="cSub">' + (spec.sub || "") + "</p></div></header>" +
      '<div class="c-actions"><div class="ca-left">' + (spec.left || "") + '</div><div class="ca-right">' + shufBtn() + bigPlay() + "</div></div>" +
      '<div class="tracks" id="cTracks">' + skRows(8) + "</div></div>";
    pageCtx = { key: spec.key, label: spec.ctxLabel || spec.title, songs: null };
    bindTopbar(innerWidth >= 900 ? 230 : 300);
    let p; try { p = Promise.resolve(spec.load()); } catch (e) { p = Promise.reject(e); }
    p.then(r => {
      if (tok !== navTok) return;
      if (r == null) { $("#cTracks").innerHTML = errState("โหลดเพลงไม่สำเร็จ"); return; }
      const songs = Array.isArray(r) ? r : r.songs || [];
      if (!Array.isArray(r) && spec.onMeta) spec.onMeta(r, songs);
      pageCtx.songs = songs;
      pageCtx.label = spec.ctxLabel || $("#cTitle").textContent;
      if (spec.sub2) $("#cSub").innerHTML = spec.sub2(songs);
      if (!songs.length) { $("#cTracks").innerHTML = spec.empty || emptyState("ยังไม่มีเพลง", ""); afterAsync(tok); return; }
      const k = reg({ songs, ctx: { key: spec.key, label: pageCtx.label }, plId: spec.plId });
      $("#cTracks").innerHTML = songs.map((s, i) => trackRow(s, k, i, { num: true })).join("");
      afterAsync(tok);
    }).catch(err => { if (tok === navTok) { console.error(err); $("#cTracks").innerHTML = errState("โหลดเพลงไม่สำเร็จ"); } });
  }
  function setTitle(t) { const a = $("#cTitle"), b = $(".tb-t", main); if (a) a.textContent = t; if (b) b.textContent = t; }

  PAGES.liked = function (page, tok) {
    collection(tok, {
      key: "liked", hue: 238, title: "เพลงที่ถูกใจ", kind: "เพลย์ลิสต์", cover: likedCover(),
      load: () => lib.liked.slice(),
      sub2: songs => "<b>คุณ</b> • " + songs.length + " เพลง",
      empty: emptyState("เพลงที่คุณถูกใจจะอยู่ที่นี่", "กดรูปหัวใจที่เพลงไหนก็ได้ เพื่อเก็บไว้ฟังทีหลัง", '<button class="btn pri" data-a="tab" data-tab="search">ค้นหาเพลง</button>')
    });
  };
  PAGES.upl = function (page, tok) {
    const p = lib.playlists.find(z => z.id === page.id);
    if (!p) { main.innerHTML = '<div class="page">' + topbar("") + '<div style="height:80px"></div>' + emptyState("ไม่พบเพลย์ลิสต์นี้", "อาจถูกลบไปแล้ว") + "</div>"; bindTopbar(); return; }
    remember({ key: "upl:" + p.id, title: p.name, route: { name: "upl", id: p.id } });
    collection(tok, {
      key: "upl:" + p.id, hue: hue(p.id), title: p.name, kind: "เพลย์ลิสต์", cover: plCover(p), plId: p.id,
      left: '<button class="ib" data-a="upl-menu" aria-label="ตัวเลือกของเพลย์ลิสต์">' + IC.more + "</button>",
      load: () => p.songs.slice(),
      sub2: songs => "<b>เพลย์ลิสต์ของคุณ</b> • " + songs.length + " เพลง" + (totalDur(songs) ? " • " + totalDur(songs) : ""),
      empty: emptyState("เพลย์ลิสต์นี้ยังว่างอยู่", "กด ⋮ ที่เพลงไหนก็ได้ แล้วเลือก “เพิ่มลงเพลย์ลิสต์”", '<button class="btn pri" data-a="tab" data-tab="search">ค้นหาเพลง</button>')
    });
  };
  PAGES.pl = function (page, tok) {
    const chart = isChart(page.id), saved = isSaved(page.id);
    const chTitle = chartTitle(page.id), chOwner = chart ? "meekin Tunes" : "";
    pageMeta = { id: page.id, title: chTitle || page.title || "", owner: chOwner || page.owner || "", thumb: page.thumb || "", count: 0 };
    collection(tok, {
      key: "pl:" + page.id, hue: hue(page.id), title: chTitle || page.title || "เพลย์ลิสต์", kind: chart ? "ชาร์ต" : "อัลบั้ม",
      cover: chart ? chartCover(page.id === CH_TH ? "th" : "gl") : cover(page.thumb),
      sub: pageMeta.owner ? "<b>" + esc(pageMeta.owner) + "</b>" : "",
      left: '<button class="ib save' + (saved ? " on" : "") + '" data-a="save-album" aria-label="' + (saved ? "ลบออกจากคลังของคุณ" : "บันทึกลงคลังของคุณ") + '">' + (saved ? IC.checkCircle : IC.addCircle) + "</button>",
      load: () => api.playlist(page.id),
      onMeta: (d, songs) => {
        const title = chTitle || d.title || page.title || "เพลย์ลิสต์";
        setTitle(title);
        pageMeta.title = title; pageMeta.owner = chOwner || d.owner || page.owner || ""; pageMeta.count = d.count || songs.length;
        if (!pageMeta.thumb && songs[0]) { pageMeta.thumb = songs[0].thumb; if (!chart) $("#cCover").innerHTML = cover(songs[0].thumb); }
        if (page.title !== title) { page.title = title; try { history.replaceState(cur, ""); } catch (e) {} }
        remember({ key: "pl:" + page.id, title, thumb: pageMeta.thumb, route: plRoute(pageMeta) });
        if (isSaved(page.id)) { const s = store.saved.find(z => z.id === page.id); if (s && (!s.title || !s.thumb)) { Object.assign(s, { title, thumb: pageMeta.thumb, owner: pageMeta.owner }); lsSet("tunes_saved", store.saved); } }
      },
      sub2: songs => (pageMeta.owner ? "<b>" + esc(pageMeta.owner) + "</b> • " : "") + songs.length + " เพลง" + (totalDur(songs) ? " • " + totalDur(songs) : "")
    });
  };
  PAGES.mix = function (page, tok) {
    const m = mixMem[page.id];
    const label = page.title || (m && m.label) || "มิกซ์";
    const seedId = String(page.id || "").replace(/^mix:/, "");
    const thumb = (m && m.thumb) || util.thumb(seedId);
    remember({ key: page.id, title: label, thumb, route: { name: "mix", id: page.id, title: label } });
    collection(tok, {
      key: page.id, hue: hue(page.id), title: label, kind: "มิกซ์", cover: mixCover(thumb, page.id, label),
      sub: m && m.subtitle ? esc(m.subtitle) : "",
      load: () => (m ? m.songs.slice() : api.radio(seedId, (lib.history.find(z => z.s.id === seedId) || {}).s).then(r => {
        if (!r) return null;
        const h = lib.history.find(z => z.s.id === seedId);
        return util.uniqSongs((h ? [h.s] : []).concat(r));
      })),
      sub2: songs => "<b>สร้างมาเพื่อคุณ</b> • " + (m && m.subtitle ? esc(m.subtitle) + " • " : "") + songs.length + " เพลง"
    });
  };
  PAGES.genre = function (page, tok) {
    const g = api.GENRES.find(z => z.key === page.key);
    if (!g) { main.innerHTML = '<div class="page">' + topbar("") + '<div style="height:80px"></div>' + emptyState("ไม่พบแนวเพลงนี้", "") + "</div>"; bindTopbar(); return; }
    remember({ key: "genre:" + g.key, title: g.name, route: { name: "genre", key: g.key } });
    collection(tok, {
      key: "genre:" + g.key, hue: hexHue(g.color), color: g.color, title: g.name, kind: "แนวเพลง", cover: genreCover(g),
      load: () => api.genre(g.key),
      sub2: songs => "<b>meekin Tunes</b> • " + songs.length + " เพลง"
    });
  };

  PAGES.artist = function (page, tok) {
    const h0 = hue(page.q || page.id);
    main.innerHTML = '<div class="page artist" style="--hc:hsl(' + h0 + " 30% 28%);--hc2:hsl(" + h0 + ' 30% 18%)">' + topbar(page.q || "") +
      '<header class="ar-hero"><div class="ar-shade"></div><h1>' + esc(page.q || "") + '</h1></header><div style="height:16px"></div>' + skRows(5) + "</div>";
    bindTopbar(240);
    const known = page.q && store.avatars[page.q.toLowerCase()];
    const idP = page.id ? Promise.resolve(page.id)
      : known && known.id ? Promise.resolve(known.id)
      : api.artistId(page.q).then(id => id || page.fb || null, () => page.fb || null);
    idP.then(id => {
      if (tok !== navTok) return;
      if (!id) {
        main.innerHTML = '<div class="page">' + topbar(page.q || "") + '<div style="height:80px"></div>' + emptyState("ไม่พบหน้าศิลปิน", page.q ? "ไม่พบศิลปินชื่อ “" + page.q + "”" : "") + "</div>";
        bindTopbar(); return;
      }
      if (page.id !== id) { page.id = id; try { history.replaceState(cur, ""); } catch (e) {} }
      return api.artist(id).then(ar => {
        if (tok !== navTok) return;
        if (!ar) { main.innerHTML = '<div class="page">' + topbar(page.q || "") + '<div style="height:80px"></div>' + errState("โหลดหน้าศิลปินไม่สำเร็จ") + "</div>"; bindTopbar(); return; }
        drawArtist(ar, tok);
      });
    }).catch(err => {
      if (tok !== navTok) return;
      console.error(err);
      main.innerHTML = '<div class="page">' + topbar(page.q || "") + '<div style="height:80px"></div>' + errState("โหลดหน้าศิลปินไม่สำเร็จ") + "</div>"; bindTopbar();
    });
  };
  function drawArtist(ar, tok) {
    const songs = (ar.top.length ? ar.top : ar.latest).slice(0, 10);
    const h = hue(ar.id);
    const wide = innerWidth >= 900;
    const hero = wide && ar.banner ? ar.banner : ar.avatar || ar.banner;
    pageCtx = { key: "artist:" + ar.id, label: ar.name, songs };
    pageMeta = { id: ar.id, name: ar.name, avatar: ar.avatar };
    rememberAvatar(ar.name, ar.id, ar.avatar);
    remember({ key: "artist:" + ar.id, title: ar.name, thumb: ar.avatar, round: true, route: { name: "artist", id: ar.id, q: ar.name } });
    const following = lib.isFollowing(ar.id);
    const kt = reg({ songs, ctx: { key: pageCtx.key, label: ar.name } });
    const latest = ar.latest.slice(0, 16);
    const kl = latest.length ? reg({ songs: latest, ctx: { key: "artist-new:" + ar.id, label: ar.name + " · ล่าสุด" } }) : "";
    main.innerHTML = '<div class="page artist" style="--hc:hsl(' + h + " 35% 28%);--hc2:hsl(" + h + ' 35% 18%)">' + topbar(ar.name, true) +
      '<header class="ar-hero">' + (hero ? '<img src="' + esc(hero) + '" alt="">' : "") + '<div class="ar-shade"></div><h1>' + esc(ar.name) +
      (ar.verified ? ' <span title="บัญชียืนยันแล้ว">' + IC.check + "</span>" : "") + "</h1></header>" +
      (ar.subs ? '<p class="ar-subs">' + esc(ar.subs) + " ผู้ติดตาม</p>" : "") +
      '<div class="c-actions"><div class="ca-left"><button class="follow' + (following ? " on" : "") + '" data-a="follow" aria-pressed="' + following + '">' + (following ? "กำลังติดตาม" : "ติดตาม") + "</button></div>" +
      '<div class="ca-right">' + shufBtn() + bigPlay() + "</div></div>" +
      '<section class="sec" style="margin-top:12px"><div class="sec-h"><h2>ยอดนิยม</h2></div>' +
      (songs.length ? '<div class="tracks" id="arTop">' + songs.map((s, i) => trackRow(s, kt, i, { num: true, hide: i >= 5 })).join("") + "</div>" +
        (songs.length > 5 ? '<button class="more-btn" data-a="ar-more">ดูเพิ่มเติม</button>' : "") : '<p class="muted" style="padding:0 var(--pad)">ยังไม่พบเพลงของศิลปินนี้</p>') + "</section>" +
      (ar.albums.length ? '<section class="sec"><div class="sec-h"><h2>ผลงาน</h2></div><div class="hrow">' + ar.albums.map(al => ctxCard({ cover: cover(al.thumb), title: al.title,
        sub: al.count ? al.count + " เพลง" : "เพลย์ลิสต์", route: plRoute(al) })).join("") + "</div></section>" : "") +
      (latest.length ? '<section class="sec"><div class="sec-h"><h2>ล่าสุด</h2></div><div class="hrow">' + latest.map((s, i) => songCard(s, kl, i)).join("") + "</div></section>" : "") +
      (ar.about ? '<section class="sec"><div class="sec-h"><h2>เกี่ยวกับ</h2></div><p class="about-t">' + esc(ar.about) + "</p></section>" : "") + "</div>";
    bindTopbar(wide ? 260 : Math.min(innerWidth * 0.88, 420) - 90);
    afterAsync(tok);
  }

  PAGES.history = function (page, tok) {
    const H = lib.history;
    const songs = H.map(h => h.s);
    main.innerHTML = '<div class="page plain">' + topbar("ประวัติการฟัง") +
      '<header class="plain-head"><h1>ประวัติการฟัง</h1>' + (H.length ? '<button class="btn ghost sm" data-a="clear-hist">ล้างประวัติ</button>' : "") + "</header>" +
      '<div class="tracks" id="hList"></div></div>';
    bindTopbar(40);
    pageCtx = { key: "hist", label: "ประวัติการฟัง", songs };
    if (!H.length) { $("#hList").innerHTML = emptyState("ยังไม่มีประวัติการฟัง", "เพลงที่ฟังเกิน 30 วินาทีจะแสดงที่นี่"); return; }
    const k = reg({ songs, ctx: { key: "hist", label: "ประวัติการฟัง" } });
    $("#hList").innerHTML = H.map((h, i) => trackRow(h.s, k, i, { sub: esc(h.s.artist) + " • " + esc(ago(h.at)) + (h.n > 1 ? " • ฟัง " + h.n + " ครั้ง" : "") })).join("");
    afterAsync(tok);
  };

  PAGES.settings = function () {
    main.innerHTML = '<div class="page plain">' + topbar("การตั้งค่า") + '<header class="plain-head"><h1>การตั้งค่า</h1></header><div class="plain-in">' +
      '<div class="about-card">' + LOGO + "<div><b>meekin Tunes</b><small>เวอร์ชัน 1 · ส่วนหนึ่งของ meekin Music</small></div></div>" +
      "<h2>การเล่นเพลง</h2>" +
      '<p class="note">' + IC.lock + "<span>" + esc(BG_NOTE) + "</span></p>" +
      '<p class="note" style="margin-top:8px">' + IC.tv + "<span>เพลงเล่นผ่านเครื่องเล่นวิดีโอแบบฝังของ YouTube วิดีโอจึงแสดงบนจออยู่ตลอดเวลาที่เล่นเพลง</span></p>" +
      "<h2>ข้อมูลของคุณ</h2>" +
      "<p>ประวัติการฟัง เพลงที่ถูกใจ ศิลปินที่ติดตาม และเพลย์ลิสต์ เก็บไว้ในเครื่องนี้เท่านั้น และใช้ร่วมกับหน้าตาอีกแบบของ meekin Music</p>" +
      '<button class="set-row" data-a="clear-hist">' + IC.trash + "<span>ล้างประวัติการฟัง</span></button>" +
      '<button class="set-row" data-a="nav" data-to="history">' + IC.clock + "<span>ดูประวัติการฟัง</span>" + IC.right + "</button>" +
      "<h2>หน้าตาแอป</h2>" +
      '<a class="set-row" href="../ytm/">' + IC.swap + "<span>เปลี่ยนไปใช้หน้าตาอีกแบบ</span>" + IC.right + "</a>" +
      "</div></div>";
    bindTopbar(40);
  };

  /* ================= playback UI ================= */
  let ctx = { key: "", label: "" };
  let mode = "none";            // "none" | "mini" | "full"
  let phRect = null;            // where the video host is (target, not mid-animation)
  const VV = window.visualViewport;
  let viewPaused = false;       // paused by guardView because the host was out of sight
  let seekDrag = false;
  const E = {};                 // cached elements of the dock and the sheet

  function setCtx(c) {
    ctx = { key: c.key || "", label: c.label || "" };
    E.npFrom.textContent = ctx.label || "meekin Tunes";
    E.qFrom.textContent = ctx.label ? "ถัดไปจาก: " + ctx.label : "ถัดไป";
  }
  function startPlayback(s, opts) {
    if (mode === "none") setMode("mini");
    player.play(s, opts);
  }
  function playFrom(k, i) {
    const L = REG[k]; if (!L || !L.songs || !L.songs[i]) return;
    const s = L.songs[i];
    if (player.current && player.current.id === s.id && ctx.key === L.ctx.key) {
      if (player.state !== "playing" && player.state !== "buffering") player.play_();
      return;
    }
    setCtx(L.ctx);
    startPlayback(s, { queue: L.songs, index: i });
  }
  function playPage() {
    if (!pageCtx) return;
    if (player.current && ctx.key === pageCtx.key) { player.toggle(); return; }
    const songs = pageCtx.songs;
    if (!songs) { toast("กำลังโหลดเพลง…"); return; }
    if (!songs.length) { toast("ยังไม่มีเพลงให้เล่น"); return; }
    const i = player.shuffle ? Math.floor(Math.random() * songs.length) : 0;
    setCtx(pageCtx);
    startPlayback(songs[i], { queue: songs, index: i });
  }
  function playArtist(id) {
    toast("กำลังโหลดเพลงของศิลปิน…");
    api.artist(id).then(ar => {
      if (!ar) throw new Error("artist");
      const songs = ar.top.length ? ar.top : ar.latest;
      if (!songs.length) { toast("ไม่พบเพลงของศิลปินนี้"); return; }
      setCtx({ key: "artist:" + id, label: ar.name });
      startPlayback(songs[0], { queue: songs, index: 0 });
    }).catch(() => toast("โหลดเพลงของศิลปินไม่สำเร็จ"));
  }
  function startRadio(s) {
    const key = "radio:" + s.id;
    setCtx({ key, label: "วิทยุ · " + s.title });
    startPlayback(s, { queue: [s], index: 0 });
    toast("เริ่มวิทยุจาก “" + s.title + "”");
    // core already tops the queue up from the song's radio; add the rest of the mix too
    // (or the artist's songs when the mix servers are down)
    relatedSongs(s).then(r => {
      if (!r || !player.current || player.current.id !== s.id || ctx.key !== key) return;
      const have = {}; player.queue.forEach(z => { have[z.id] = 1; });
      r.forEach(z => { if (!have[z.id]) { have[z.id] = 1; player.addToQueue(z); } });
    }).catch(() => {});
  }

  function setMode(m) {
    if (m === mode) { layoutPlayer(); return; }
    const first = mode === "none";
    mode = m;
    const b = document.body;
    b.classList.toggle("has-song", m !== "none");
    b.classList.toggle("m-full", m === "full");
    b.classList.toggle("m-mini", m === "mini");
    b.classList.toggle("m-none", m === "none");
    npEl.setAttribute("aria-hidden", m === "full" ? "false" : "true");
    if (m !== "full") npEl.classList.remove("qv");
    if (first) { ph.classList.add("na"); layoutPlayer(); void ph.offsetWidth; ph.classList.remove("na"); }
    else layoutPlayer();
    if (m === "full") { loadRelated(); renderQueueSoon(); }
    if (MD.open) placeModal();
  }
  function sizeArt() {
    const W = innerWidth, H = innerHeight;
    const a = W >= 900 && H >= 620 ? Math.min((W - 96 - 48 - 2) / 2, H - 340, 560) : Math.min(W - 48, H - 320, 440);
    document.documentElement.style.setProperty("--art", Math.max(200, Math.floor(a)) + "px");
  }
  function layoutPlayer() {
    if (mode === "none") { ph.style.visibility = "hidden"; phRect = null; viewPaused = false; return; }
    let x, y, w, h;
    if (mode === "full") {
      // offsets ignore the sheet's slide transform, so this is where the slot ends up
      const a = E.npArt; let el = a; x = 0; y = 0;
      while (el && el !== npEl) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      w = a.offsetWidth; h = a.offsetHeight;
    } else {
      const r = E.dockSlot.getBoundingClientRect();
      x = r.left; y = r.top; w = r.width; h = r.height;
    }
    w = Math.max(200, w); h = Math.max(200, h);
    phRect = { x, y, w, h };
    const st = ph.style;
    st.visibility = "visible"; st.left = x + "px"; st.top = y + "px"; st.width = w + "px"; st.height = h + "px";
    guardView();
  }
  /* The on-screen keyboard (iOS, and browsers that ignore interactive-widget) and pinch zoom
     shrink only the visual viewport, so the page does not move but the video host can end up
     out of sight. Pause while less than 200x200 of it can be seen; play on once it is back. */
  function hostInView() {
    if (!VV || !phRect) return true;
    const w = Math.min(phRect.x + phRect.w, VV.offsetLeft + VV.width) - Math.max(phRect.x, VV.offsetLeft);
    const h = Math.min(phRect.y + phRect.h, VV.offsetTop + VV.height) - Math.max(phRect.y, VV.offsetTop);
    return w >= 199 && h >= 199;
  }
  function guardView() {
    if (!player.current) { viewPaused = false; return; }
    if (!hostInView()) {
      if (player.state === "playing" || player.state === "buffering") { viewPaused = true; player.pause(); }
    } else if (viewPaused) {
      // a pause sent while buffering leaves the state at "buffering", so test for "not playing"
      viewPaused = false;
      if (player.state !== "playing" && !document.hidden) player.play_();
    }
  }
  function openNP() { if (!player.current || mode === "full") return; pushLayer("np"); setMode("full"); }
  function closeNP() {
    const i = cur.layers.indexOf("np");
    if (i < 0) { setMode(player.current ? "mini" : "none"); return; }
    history.go(-(cur.layers.length - i));
  }
  function openQueue() {
    if (!player.current) return;
    if (mode !== "full") { pushLayer("np"); setMode("full"); }
    if (cur.layers.indexOf("queue") < 0) { pushLayer("queue"); setQueueView(true); }
  }
  function setQueueView(on) {
    npEl.classList.toggle("qv", !!on);
    if (on) { renderQueue(); E.npScroll.scrollTop = 0; }
    layoutPlayer();
  }

  function onTrack(s) {
    if (!s) return;
    if (mode === "none") setMode("mini");
    document.body.classList.remove("blocked");
    const h = hue(s.id);
    dock.style.setProperty("--h", h); npEl.style.setProperty("--h", h);
    E.dTitle.textContent = s.title; E.dArtist.textContent = s.artist;
    E.npTitle.textContent = s.title; E.npArtist.textContent = s.artist;
    E.qiTitle.textContent = s.title; E.qiArtist.textContent = s.artist;
    E.npArtist.setAttribute("aria-label", "ไปที่ศิลปิน " + s.artist);
    E.npFrom.textContent = ctx.label || "meekin Tunes";
    document.title = s.title + " · " + s.artist + " — meekin Tunes";
    onTime({ cur: 0, dur: s.sec || 0 });
    updateHearts(); markPlaying(); updatePlayButtons();
    if (mode === "full") loadRelated();
    renderQueueSoon();
  }
  let lastPlaying = null;
  function onState(st) {
    const playing = st === "playing" || st === "buffering";
    document.body.classList.toggle("is-playing", playing);
    if (st === "playing") document.body.classList.remove("blocked");
    if (playing) guardView();
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      $$("[data-pp]").forEach(b => { b.innerHTML = playing ? IC.pause : IC.play; b.setAttribute("aria-label", playing ? "หยุดชั่วคราว" : "เล่น"); });
    }
    updatePlayButtons();
  }
  function onTime(t) {
    if (seekDrag) return;
    const d = t.dur || 0, c = Math.min(t.cur || 0, d || Infinity), p = d ? Math.min(1000, Math.round(c / d * 1000)) : 0;
    E.seeks.forEach(el => { el.value = p; el.style.setProperty("--p", p / 10 + "%"); });
    E.dProg.style.width = p / 10 + "%";
    setTimes(c, d);
  }
  function setTimes(c, d) { E.npCur.textContent = E.dCur.textContent = mmss(c); E.npDur.textContent = E.dDur.textContent = mmss(d); }
  function bindSeek(el) {
    const dur = () => player.time.dur || (player.current && player.current.sec) || 0;
    el.addEventListener("input", () => { seekDrag = true; el.style.setProperty("--p", el.value / 10 + "%"); setTimes(el.value / 1000 * dur(), dur()); });
    el.addEventListener("change", () => { const d = dur(); if (d && player.current) player.seek(el.value / 1000 * d); seekDrag = false; });
    ["pointerup", "pointercancel", "touchend"].forEach(ev => el.addEventListener(ev, () => setTimeout(() => { seekDrag = false; }, 400)));
    el.addEventListener("click", e => e.stopPropagation());
  }
  function updateHearts() {
    const s = player.current, on = !!(s && lib.isLiked(s.id));
    $$("[data-heart]").forEach(b => { b.classList.toggle("on", on); b.innerHTML = on ? IC.heartF : IC.heart; b.setAttribute("aria-label", on ? "เลิกถูกใจ" : "ถูกใจ"); b.setAttribute("aria-pressed", on); });
  }
  function syncToggles() {
    $$('[data-a="shuffle"]').forEach(b => { b.classList.toggle("on", player.shuffle); b.setAttribute("aria-pressed", player.shuffle); });
    const r = player.repeat;
    $$('[data-a="repeat"]').forEach(b => {
      b.classList.toggle("on", r !== "off"); b.innerHTML = r === "one" ? IC.repeat1 : IC.repeat;
      b.setAttribute("aria-label", r === "off" ? "เล่นซ้ำ: ปิด" : r === "all" ? "เล่นซ้ำ: ทั้งหมด" : "เล่นซ้ำ: เพลงนี้");
    });
  }
  function markPlaying() {
    const id = player.current ? player.current.id : "";
    $$(".on[data-sid]").forEach(el => { if (el.dataset.sid !== id) el.classList.remove("on"); });
    if (id) $$('[data-sid="' + sel(id) + '"]').forEach(el => el.classList.add("on"));
  }
  function updatePlayButtons() {
    const playing = player.state === "playing" || player.state === "buffering";
    const mine = !!(pageCtx && player.current && ctx.key === pageCtx.key);
    $$('[data-a="play-page"]', main).forEach(b => { b.innerHTML = mine && playing ? IC.pause : IC.play; b.setAttribute("aria-label", mine && playing ? "หยุดชั่วคราว" : "เล่น"); });
  }

  // the song's radio mix; when the mix servers fail, more songs by the same artist
  function relatedSongs(s) {
    return api.radio(s.id, s).catch(() => null).then(r => {
      if (r && r.length) return r;
      return api.searchSongs(s.artist).catch(() => null).then(x => (x ? x.filter(z => z.id !== s.id) : r));
    });
  }
  const RELERR = '<p class="muted">โหลดเพลงที่เกี่ยวข้องไม่สำเร็จ <button class="more" data-a="rel-retry">ลองอีกครั้ง</button></p>';
  let relFor = null, relTok = 0;
  function loadRelated() {
    const s = player.current; if (!s || relFor === s.id) return;
    relFor = s.id; const t = ++relTok;
    E.npRel.innerHTML = skRows(4);
    relatedSongs(s).then(r => {
      if (t !== relTok) return;
      if (!r) { relFor = null; E.npRel.innerHTML = RELERR; return; }
      const list = r.slice(0, 20);
      if (!list.length) { E.npRel.innerHTML = '<p class="muted">ไม่มีเพลงที่เกี่ยวข้อง</p>'; return; }
      clearReg("n");
      const k = reg({ songs: list, ctx: { key: "rel:" + s.id, label: "เพลงที่เกี่ยวข้องกับ " + s.title } }, "n");
      E.npRel.innerHTML = list.map((z, i) => trackRow(z, k, i)).join("");
      markPlaying();
    }, () => { if (t === relTok) { relFor = null; E.npRel.innerHTML = RELERR; } });
  }
  let qRaf = 0;
  function renderQueueSoon() { if (!qRaf) qRaf = requestAnimationFrame(() => { qRaf = 0; renderQueue(); }); }
  function renderQueue() {
    if (!npEl.classList.contains("qv") || mode !== "full") return;
    const s = player.current;
    E.qNow.innerHTML = s ? '<div class="row on qrow" data-sid="' + esc(s.id) + '">' + songCover(s, "th") + '<div class="meta"><b>' + esc(s.title) + "</b><small>" + esc(s.artist) + "</small></div></div>" : "";
    const Q = player.queue, up = player.upNext().slice(0, 120);
    E.qList.innerHTML = up.length ? up.map(z => {
      const qi = Q.indexOf(z);
      return '<div class="row qrow" data-a="qjump" data-qi="' + qi + '" role="button" tabindex="0">' + songCover(z, "th") + '<div class="meta"><b>' + esc(z.title) + "</b><small>" + esc(z.artist) + "</small></div>" +
        '<button class="ib" data-a="qrm" data-qi="' + qi + '" aria-label="ลบ ' + esc(z.title) + ' ออกจากคิว">' + IC.close + "</button></div>";
    }).join("") : '<p class="muted">ไม่มีเพลงในคิว เมื่อจบเพลงนี้จะเล่นวิทยุจากเพลงนี้ต่อให้อัตโนมัติ</p>';
  }

  /* ================= menus, dialogs, toast ================= */
  const MD = { el: $("#modal"), panel: $("#modal .mp"), open: false, acts: null, after: null };
  function openModal(html, acts) {
    if (!MD.open) { MD.open = true; pushLayer("modal"); MD.el.classList.add("on"); }
    setModal(html, acts);
  }
  function setModal(html, acts) {
    MD.panel.innerHTML = html; MD.acts = acts || {}; MD.panel.scrollTop = 0;
    placeModal();
    const f = $("input", MD.panel);
    if (f) setTimeout(() => { f.focus(); f.select(); }, 60); else { const b = $("button", MD.panel); if (b) b.focus({ preventScroll: true }); }
  }
  function closeModal(after) {
    if (!MD.open) { if (after) after(); return; }
    MD.after = after || null;
    history.back();
  }
  function hideModal() {
    MD.open = false; MD.el.classList.remove("on"); MD.panel.innerHTML = ""; MD.acts = null;
    const a = MD.after; MD.after = null;
    if (a) setTimeout(a, 0);
  }
  MD.panel.addEventListener("click", e => {
    const b = e.target.closest("[data-m]"); if (!b || !MD.acts) return;
    const fn = MD.acts[b.dataset.m]; if (fn) fn(b, e);
  });
  MD.panel.addEventListener("submit", e => { e.preventDefault(); if (MD.acts && MD.acts.submit) MD.acts.submit(e.target); });

  // the largest screen area not covered by the video host
  function freeRect() {
    const W = innerWidth, H = innerHeight, nh = navH();
    if (mode === "none" || !phRect) return { l: 0, t: 0, r: W, b: H - nh };
    const p = phRect, m = 8;
    const c = [
      { l: 0, t: 0, r: W, b: p.y - m },
      { l: 0, t: p.y + p.h + m, r: W, b: mode === "mini" ? H - nh : H },
      { l: 0, t: 0, r: p.x - m, b: mode === "mini" ? H - nh : H },
      { l: p.x + p.w + m, t: 0, r: W, b: mode === "mini" ? H - nh : H }
    ].filter(z => z.r - z.l >= 260 && z.b - z.t >= 150);
    c.sort((a, b) => (b.r - b.l) * (b.b - b.t) - (a.r - a.l) * (a.b - a.t));
    return c[0] || { l: 0, t: 0, r: W, b: Math.max(150, p.y - m) };
  }
  function placeModal() {
    if (!MD.open) return;
    const z = freeRect(), p = MD.panel, W = innerWidth, H = innerHeight;
    const zw = z.r - z.l, zh = z.b - z.t;
    const w = Math.max(240, Math.min(zw - 16, W < 600 ? 560 : 420));
    p.style.width = w + "px";
    p.style.left = Math.round(z.l + (zw - w) / 2) + "px";
    p.style.maxHeight = Math.max(140, zh - 16) + "px";
    if (W < 600) { p.style.top = ""; p.style.transform = ""; p.style.bottom = Math.round(H - z.b + 8) + "px"; }
    else { p.style.bottom = ""; p.style.top = Math.round(z.t + zh / 2) + "px"; p.style.transform = "translateY(-50%)"; }
  }
  let toastT = 0;
  function toast(msg) {
    const el = $("#toast"), z = freeRect();
    el.textContent = msg;
    el.style.left = Math.round((z.l + z.r) / 2) + "px";
    el.style.bottom = Math.round(innerHeight - z.b + 12) + "px";
    el.style.maxWidth = Math.max(160, z.r - z.l - 32) + "px";
    el.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("on"), 2400);
  }

  function songMenu(s, opt) {
    opt = opt || {};
    const liked = lib.isLiked(s.id);
    const items = [["next", IC.playNext, "เล่นถัดไป"], ["queue", IC.queueAdd, "เพิ่มในคิว"],
      ["like", liked ? IC.heartF : IC.heart, liked ? "เลิกถูกใจ" : "ถูกใจ", liked ? "ac" : ""], ["pl", IC.plAdd, "เพิ่มลงเพลย์ลิสต์"]];
    if (opt.plId) items.push(["rm", IC.minus, "ลบออกจากเพลย์ลิสต์นี้"]);
    items.push(["artist", IC.user, "ไปที่ศิลปิน"], ["radio", IC.radio, "เริ่มวิทยุจากเพลงนี้"]);
    openModal('<div class="mh">' + songCover(s, "mh-cv") + '<div class="meta"><b>' + esc(s.title) + "</b><small>" + esc(s.artist) + "</small></div></div>" +
      items.map(it => '<button class="mi' + (it[3] ? " " + it[3] : "") + '" data-m="' + it[0] + '">' + it[1] + "<span>" + it[2] + "</span></button>").join(""), {
      next() { if (player.current) player.playNext(s); else { setCtx({ key: "one:" + s.id, label: s.title }); startPlayback(s); } toast("จะเล่นเพลงนี้ถัดไป"); closeModal(); },
      queue() { if (player.current) player.addToQueue(s); else { setCtx({ key: "one:" + s.id, label: s.title }); startPlayback(s); } toast("เพิ่มในคิวแล้ว"); closeModal(); },
      like() { const on = lib.toggleLike(s); toast(on ? "เพิ่มในเพลงที่ถูกใจแล้ว" : "ลบออกจากเพลงที่ถูกใจแล้ว"); closeModal(); },
      pl() { pickPlaylist(s); },
      rm() { lib.removeFromPlaylist(opt.plId, s.id); toast("ลบออกจากเพลย์ลิสต์แล้ว"); closeModal(() => { if (cur.page.name === "upl") refreshPage(); }); },
      artist() { closeModal(() => go(artistRouteFor(s))); },
      radio() { closeModal(() => startRadio(s)); }
    });
  }
  function pickPlaylist(s) {
    const pls = lib.playlists.slice();
    setModal('<div class="mt">เพิ่มลงเพลย์ลิสต์</div><button class="mi" data-m="new"><span class="cv add">' + IC.plus + "</span><span>สร้างเพลย์ลิสต์ใหม่</span></button>" +
      pls.map((p, i) => '<button class="mi" data-m="add" data-i="' + i + '">' + plCover(p) + "<span>" + esc(p.name) + "<small>" + p.songs.length + " เพลง" +
        (p.songs.some(z => z.id === s.id) ? " • มีเพลงนี้แล้ว" : "") + "</small></span></button>").join(""), {
      new() {
        askName("ตั้งชื่อเพลย์ลิสต์", "เพลย์ลิสต์ของฉัน #" + (lib.playlists.length + 1), "สร้าง", name => {
          const p = lib.newPlaylist(name); lib.addToPlaylist(p.id, s); refreshSide();
          toast("เพิ่มลง “" + p.name + "” แล้ว"); closeModal(() => { if (cur.page.name === "library") refreshPage(); });
        });
      },
      add(b) {
        const p = pls[+b.dataset.i]; if (!p) return;
        const ok = lib.addToPlaylist(p.id, s);
        toast(ok ? "เพิ่มลง “" + p.name + "” แล้ว" : "มีเพลงนี้ใน “" + p.name + "” อยู่แล้ว");
        closeModal(() => { if (ok && cur.page.name === "upl" && cur.page.id === p.id) refreshPage(); });
      }
    });
  }
  function askName(title, value, okLabel, onOk) {
    openModal('<form class="mform"><div class="mt">' + esc(title) + '</div><input name="n" maxlength="80" value="' + esc(value) + '" placeholder="ชื่อเพลย์ลิสต์" autocomplete="off" enterkeyhint="done" aria-label="ชื่อเพลย์ลิสต์">' +
      '<div class="mbtns"><button type="button" class="btn ghost" data-m="no">ยกเลิก</button><button type="submit" class="btn pri">' + esc(okLabel) + "</button></div></form>", {
      no() { closeModal(); },
      submit(form) { const v = form.elements.n.value.trim() || "เพลย์ลิสต์ของฉัน #" + (lib.playlists.length + 1); onOk(v); }
    });
  }
  function confirmBox(title, text, okLabel, onOk) {
    openModal('<div class="mt">' + esc(title) + '</div><p class="mtext">' + esc(text) + '</p><div class="mbtns"><button class="btn ghost" data-m="no">ยกเลิก</button><button class="btn pri" data-m="ok">' + esc(okLabel) + "</button></div>",
      { no() { closeModal(); }, ok() { onOk(); } });
  }
  function newPlaylist() {
    askName("ตั้งชื่อเพลย์ลิสต์", "เพลย์ลิสต์ของฉัน #" + (lib.playlists.length + 1), "สร้าง", name => {
      const p = lib.newPlaylist(name); refreshSide(); toast("สร้าง “" + p.name + "” แล้ว");
      closeModal(() => go({ name: "upl", id: p.id, tab: "library" }));
    });
  }
  function uplMenu() {
    const p = cur.page.name === "upl" ? lib.playlists.find(z => z.id === cur.page.id) : null; if (!p) return;
    openModal('<div class="mh">' + plCover(p, "mh-cv") + '<div class="meta"><b>' + esc(p.name) + "</b><small>" + p.songs.length + " เพลง</small></div></div>" +
      '<button class="mi" data-m="rename">' + IC.edit + "<span>เปลี่ยนชื่อ</span></button>" +
      '<button class="mi" data-m="del">' + IC.trash + "<span>ลบเพลย์ลิสต์</span></button>", {
      rename() {
        askName("เปลี่ยนชื่อเพลย์ลิสต์", p.name, "บันทึก", v => {
          lib.renamePlaylist(p.id, v); p.name = v; renameRecent("upl:" + p.id, v); refreshSide();
          toast("เปลี่ยนชื่อแล้ว"); closeModal(() => refreshPage());
        });
      },
      del() {
        confirmBox("ลบเพลย์ลิสต์นี้?", "“" + p.name + "” จะถูกลบออกจากเครื่องนี้ และกู้คืนไม่ได้", "ลบ", () => {
          lib.deletePlaylist(p.id); forget("upl:" + p.id); refreshSide(); toast("ลบเพลย์ลิสต์แล้ว");
          closeModal(() => {
            const before = pageAt[cur.idx - 1];
            if (before && before.name === "library") history.back();
            else go({ name: "library", tab: "library" }, { replace: true });
          });
        });
      }
    });
  }
  function clearHistory() {
    if (!lib.history.length) { toast("ยังไม่มีประวัติการฟัง"); return; }
    confirmBox("ล้างประวัติการฟัง?", "เพลงที่เล่นล่าสุด และคำแนะนำที่สร้างจากประวัติจะถูกล้างออก", "ล้าง", () => {
      lib.clearHistory(); toast("ล้างประวัติแล้ว"); closeModal(() => refreshPage());
    });
  }
  function toggleSaveAlbum(btn) {
    if (!pageMeta || !pageMeta.id) return;
    const on = toggleSaved(pageMeta);
    btn.classList.toggle("on", on); btn.innerHTML = on ? IC.checkCircle : IC.addCircle;
    btn.setAttribute("aria-label", on ? "ลบออกจากคลังของคุณ" : "บันทึกลงคลังของคุณ");
    toast(on ? "บันทึกลงคลังของคุณแล้ว" : "ลบออกจากคลังของคุณแล้ว");
  }
  function toggleFollowArtist(btn) {
    if (!pageMeta || !pageMeta.name) return;
    const on = lib.toggleFollow({ id: pageMeta.id, name: pageMeta.name, avatar: pageMeta.avatar });
    btn.classList.toggle("on", on); btn.textContent = on ? "กำลังติดตาม" : "ติดตาม"; btn.setAttribute("aria-pressed", on);
    toast(on ? "ติดตาม " + pageMeta.name + " แล้ว" : "เลิกติดตาม " + pageMeta.name + " แล้ว");
  }
  function refreshSide() {
    clearReg("s");
    const box = $("#sidePls"); if (!box) return;
    box.innerHTML = lib.playlists.map(p => '<button class="sn-pl" data-a="go" data-k="' + reg({ route: { name: "upl", id: p.id, tab: "library" } }, "s") + '">' + esc(p.name) + "</button>").join("");
  }

  /* ================= shell ================= */
  function buildShell() {
    const tabs = [["home", "หน้าหลัก", IC.home, IC.homeF], ["search", "ค้นหา", IC.search, IC.searchF], ["library", "คลังของคุณ", IC.lib, IC.libF]];
    $("#tabs").innerHTML = tabs.map(t => '<button class="tab" data-a="tab" data-tab="' + t[0] + '"><span class="off-i">' + t[2] + '</span><span class="on-i">' + t[3] + "</span><span>" + t[1] + "</span></button>").join("");
    $("#side").innerHTML = '<div class="brand">' + LOGO + "<span>meekin Tunes</span></div>" +
      tabs.map(t => '<button class="sn" data-a="tab" data-tab="' + t[0] + '"><span class="off-i">' + t[2] + '</span><span class="on-i">' + t[3] + "</span>" + t[1] + "</button>").join("") +
      '<div class="sn-sep"></div><button class="sn" data-a="new-pl"><span class="sq">' + IC.plus + "</span>สร้างเพลย์ลิสต์</button>" +
      '<button class="sn" data-a="nav" data-to="liked"><span class="lk">' + IC.heartF + "</span>เพลงที่ถูกใจ</button>" +
      '<div class="sn-pls" id="sidePls"></div><p class="sn-note">' + esc(BG_NOTE) + "</p>";
    dock.innerHTML =
      '<div class="dk-card" data-a="np-open">' +
        '<div class="dk-meta"><b id="dTitle"></b><small id="dArtist"></small><small class="hint">แตะที่วิดีโอเพื่อเริ่มเล่น ' + "→</small></div>" +
        '<div class="dk-ctl">' +
          '<button class="ib heart" data-a="like-cur" data-heart aria-label="ถูกใจ">' + IC.heart + "</button>" +
          '<button class="ib tog only-d" data-a="shuffle" aria-label="สุ่มเพลง">' + IC.shuffle + "</button>" +
          '<button class="ib only-d" data-a="prev" aria-label="เพลงก่อนหน้า">' + IC.prev + "</button>" +
          '<button class="pp" data-a="pp" data-pp aria-label="เล่น">' + IC.play + "</button>" +
          '<button class="ib" data-a="next" aria-label="เพลงถัดไป">' + IC.next + "</button>" +
          '<button class="ib tog only-d" data-a="repeat" aria-label="เล่นซ้ำ: ปิด">' + IC.repeat + "</button>" +
        "</div>" +
        '<div class="dk-seek"><span id="dCur">0:00</span><input class="rng" id="dSeek" type="range" min="0" max="1000" value="0" aria-label="ตำแหน่งในเพลง"><span id="dDur">0:00</span></div>' +
        '<div class="dk-extra"><button class="ib" data-a="q-open" aria-label="คิวเพลง">' + IC.queue + '</button><button class="ib" data-a="np-open" aria-label="เปิดหน้าจอกำลังเล่น">' + IC.expand + "</button></div>" +
        '<div class="dk-prog"><i id="dProg"></i></div>' +
        '<button class="ib dk-up" data-a="np-open" aria-label="เปิดหน้าจอกำลังเล่น">' + IC.up + "</button>" +
      "</div>" +
      '<div id="dockSlot" aria-hidden="true"></div>';
    npEl.innerHTML =
      '<header class="np-head"><button class="ib" data-a="np-close" aria-label="ย่อหน้าจอกำลังเล่น">' + IC.down + "</button>" +
        '<div class="np-from"><small>กำลังเล่นจาก</small><b id="npFrom">meekin Tunes</b></div>' +
        '<button class="ib" data-a="np-menu" aria-label="ตัวเลือกของเพลงนี้">' + IC.more + "</button></header>" +
      '<div class="np-art-area"><div id="npArt" aria-hidden="true"></div>' +
        '<div class="np-qinfo"><b id="qiTitle"></b><small id="qiArtist"></small><p class="hint">แตะที่วิดีโอเพื่อเริ่มเล่น</p>' +
          '<div class="qi-c"><button class="ib" data-a="prev" aria-label="เพลงก่อนหน้า">' + IC.prev + '</button><button class="pp" data-a="pp" data-pp aria-label="เล่น">' + IC.play + "</button>" +
          '<button class="ib" data-a="next" aria-label="เพลงถัดไป">' + IC.next + "</button></div></div></div>" +
      '<p class="np-hint">แตะที่วิดีโอเพื่อเริ่มเล่น</p>' +
      '<div class="np-scroll">' +
        '<div class="np-main">' +
          '<div class="np-tr"><div class="np-tt"><h2 id="npTitle"></h2><button id="npArtist" data-a="np-artist"></button></div>' +
            '<button class="ib heart" data-a="like-cur" data-heart aria-label="ถูกใจ">' + IC.heart + "</button></div>" +
          '<div class="seek"><input class="rng" id="npSeek" type="range" min="0" max="1000" value="0" aria-label="ตำแหน่งในเพลง">' +
            '<div class="times"><span id="npCur">0:00</span><span id="npDur">0:00</span></div></div>' +
          '<div class="ctrls">' +
            '<button class="ib tog" data-a="shuffle" aria-label="สุ่มเพลง">' + IC.shuffle + "</button>" +
            '<button class="ib" data-a="prev" aria-label="เพลงก่อนหน้า">' + IC.prev + "</button>" +
            '<button class="pp" data-a="pp" data-pp aria-label="เล่น">' + IC.play + "</button>" +
            '<button class="ib" data-a="next" aria-label="เพลงถัดไป">' + IC.next + "</button>" +
            '<button class="ib tog" data-a="repeat" aria-label="เล่นซ้ำ: ปิด">' + IC.repeat + "</button>" +
          "</div>" +
          '<div class="np-act"><button class="pill" data-a="radio-cur">' + IC.radio + "<span>วิทยุจากเพลงนี้</span></button>" +
            '<button class="pill" data-a="q-open">' + IC.queue + "<span>ถัดไป</span></button></div>" +
        "</div>" +
        '<div class="np-lists">' +
          '<section class="np-rel"><h3>เพลงที่เกี่ยวข้อง</h3><div id="npRel"></div></section>' +
          '<section class="np-q"><div class="qh"><button class="ib" data-a="q-close" aria-label="กลับ">' + IC.left + "</button><h3>คิวเพลง</h3></div>" +
            '<h4>กำลังเล่น</h4><div id="qNow"></div><h4 id="qFrom">ถัดไป</h4><div id="qList"></div></section>' +
        "</div>" +
      "</div>";
    ["dTitle", "dArtist", "dProg", "dCur", "dDur", "npFrom", "npTitle", "npArtist", "npCur", "npDur", "npRel", "qNow", "qList", "qFrom", "qiTitle", "qiArtist", "npArt", "dockSlot"]
      .forEach(id => { E[id] = document.getElementById(id); });
    E.npScroll = $(".np-scroll", npEl);
    E.seeks = [$("#npSeek"), $("#dSeek")];
    E.seeks.forEach(bindSeek);
    refreshSide();
    syncToggles();
  }

  /* ================= events ================= */
  document.addEventListener("click", e => {
    const t = e.target.closest("[data-a]");
    if (!t || t.disabled || !document.body.contains(t)) return;
    const a = t.dataset.a, k = t.dataset.k, i = +t.dataset.i;
    switch (a) {
      case "song": playFrom(k, i); break;
      case "smenu": { const L = REG[k]; if (L && L.songs && L.songs[i]) songMenu(L.songs[i], { plId: L.plId }); break; }
      case "go": { const R = REG[k]; if (R && R.route) go(Object.assign({}, R.route)); break; }
      case "back": goBack(); break;
      case "tab": tabTo(t.dataset.tab); break;
      case "nav": go({ name: t.dataset.to }); break;
      case "home-chip": setHomeChip(t.dataset.chip); break;
      case "lib-filter": setLibFilter(t.dataset.f); break;
      case "new-pl": newPlaylist(); break;
      case "upl-menu": uplMenu(); break;
      case "save-album": toggleSaveAlbum(t); break;
      case "follow": toggleFollowArtist(t); break;
      case "shuffle": player.setShuffle(!player.shuffle); syncToggles(); toast(player.shuffle ? "เปิดสุ่มเพลง" : "ปิดสุ่มเพลง"); break;
      case "repeat": { const r = player.cycleRepeat(); syncToggles(); toast(r === "off" ? "ปิดเล่นซ้ำ" : r === "all" ? "เล่นซ้ำทั้งหมด" : "เล่นซ้ำเพลงนี้"); break; }
      case "pp": player.toggle(); break;
      case "next": player.next(); break;
      case "prev": player.prev(); break;
      case "like-cur": { const s = player.current; if (s) { const on = lib.toggleLike(s); toast(on ? "เพิ่มในเพลงที่ถูกใจแล้ว" : "ลบออกจากเพลงที่ถูกใจแล้ว"); } break; }
      case "np-open": openNP(); break;
      case "np-close": closeNP(); break;
      case "np-menu": if (player.current) songMenu(player.current); break;
      case "np-artist": if (player.current) go(artistRouteFor(player.current)); break;
      case "q-open": openQueue(); break;
      case "q-close": if (cur.layers[cur.layers.length - 1] === "queue") history.back(); else setQueueView(false); break;
      case "qjump": { const qi = +t.dataset.qi; if (qi >= 0) player.playAt(qi); break; }
      case "qrm": { const qi = +t.dataset.qi; if (qi >= 0) player.removeAt(qi); break; }
      case "radio-cur": if (player.current) startRadio(player.current); break;
      case "rel-retry": relFor = null; loadRelated(); break;
      case "play-page": playPage(); break;
      case "play-artist": playArtist(t.dataset.id); break;
      case "ar-more": { const box = $("#arTop"); if (box) { const on = box.classList.toggle("all"); t.textContent = on ? "แสดงน้อยลง" : "ดูเพิ่มเติม"; } break; }
      case "retry": renderPage(cur.page, false); break;
      case "retry-sec": { const s = t.closest("section.sec"); if (s && s._retry) s._retry(); break; }
      case "modal-close": closeModal(); break;
      case "clear-hist": clearHistory(); break;
    }
  });
  document.addEventListener("contextmenu", e => {
    const t = e.target.closest('[data-a="song"]'); if (!t) return;
    const L = REG[t.dataset.k]; if (!L || !L.songs) return;
    e.preventDefault(); songMenu(L.songs[+t.dataset.i], { plId: L.plId });
  });
  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
    if (e.key === "Escape") { if (cur.layers.length) { e.preventDefault(); history.back(); } return; }
    if (typing) return;
    if ((e.key === "Enter" || e.key === " ") && tag !== "button" && tag !== "a" && e.target.getAttribute && e.target.getAttribute("role") === "button") { e.preventDefault(); e.target.click(); return; }
    if (e.key === " " && tag !== "button" && player.current) { e.preventDefault(); player.toggle(); }
  });
  document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG") t.classList.add("bad"); }, true);
  // swipe the sheet's header down to close it
  (function () {
    let y0 = null;
    npEl.addEventListener("touchstart", e => { y0 = e.target.closest(".np-head") ? e.touches[0].clientY : null; }, { passive: true });
    npEl.addEventListener("touchend", e => { if (y0 != null && e.changedTouches[0].clientY - y0 > 70) closeNP(); y0 = null; }, { passive: true });
  })();
  let rzRaf = 0;
  const relayout = () => { if (!rzRaf) rzRaf = requestAnimationFrame(() => { rzRaf = 0; sizeArt(); layoutPlayer(); placeModal(); }); };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", relayout);
  if (VV) { VV.addEventListener("resize", relayout); VV.addEventListener("scroll", relayout); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) viewPaused = false; });

  MM.on("track", onTrack);
  MM.on("state", onState);
  MM.on("time", onTime);
  MM.on("queue", () => { renderQueueSoon(); syncToggles(); });
  MM.on("like", () => { updateHearts(); if (cur.page.name === "liked" || cur.page.name === "library") refreshPage(); });
  MM.on("blocked", () => { document.body.classList.add("blocked"); });
  MM.on("error", err => toast((err && err.message ? err.message : "เล่นเพลงนี้ไม่ได้") + (err && err.final ? "" : " — ข้ามไปเพลงถัดไป")));

  /* ================= start ================= */
  buildShell();
  sizeArt();
  player.attach(ph);           // once; the iframe is created inside on the first play
  if ("ResizeObserver" in window) { const ro = new ResizeObserver(relayout); ro.observe(E.npArt); ro.observe(E.dockSlot); }
  const st0 = history.state && history.state.page ? history.state : null;
  const dead = st0 && st0.layers ? st0.layers.length : 0;   // sheets and menus do not survive a reload
  cur = { page: st0 ? st0.page : { name: "home", tab: "home" }, layers: [], idx: st0 ? st0.idx || 0 : 0 };
  pageAt[cur.idx] = cur.page;
  if (!dead) try { history.replaceState(cur, "", location.href); } catch (e) {}
  renderPage(cur.page, false);
  // back onto the entry they were opened from, so the next Back really leaves this page
  if (dead) history.go(-dead);

  // for testing from the console
  window.Tunes = { go, get mode() { return mode; }, get rect() { return phRect; }, openNP, openQueue, freeRect };
})();
