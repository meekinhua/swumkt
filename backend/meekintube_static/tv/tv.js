/* meekinTube TV — remote-driven 10-foot UI.

   One script, three shells:
     tizen   — packaged in a Samsung .wgt; files are local, so the YouTube
               player is framed from https://swumkt.org (player.html).
     android — Xiaomi / Android TV WebView loading the hosted page; the app
               calls window.meekinBack() / window.meekinKey() and exposes
               window.MeekinAndroid.exit().
     web     — any browser (desktop testing, TV browser fallback).

   Written for old TV engines (Tizen 5 = Chromium 63): no optional chaining,
   no nullish coalescing, no Array.flat, no Object.fromEntries.
   Data comes from the same public Invidious/Piped instances and the same
   localStorage keys as the phone/desktop meekinTube (../index.html). */
(function () {
  "use strict";

  /* ================= shell & config ================= */
  var VERSION = "1.0.0";
  var QS = new URLSearchParams(location.search);
  var HOSTED_BASE = "https://swumkt.org/api/meekintube/tv/";
  var PACKAGED = !/^https?:$/.test(location.protocol);
  var SHELL = (window.tizen && window.tizen.application) ? "tizen"
    : ((window.MeekinAndroid || QS.get("shell") === "android") ? "android" : (QS.get("shell") || "web"));
  var PLAYER_URL = QS.get("player") || (PACKAGED ? HOSTED_BASE + "player.html"
    : new URL("player.html", location.href).href);
  var PLAYER_ORIGIN = new URL(PLAYER_URL).origin;

  function $(id) { return document.getElementById(id); }
  var stage = $("stage"), main = $("main"), rowsEl = $("rows"), playerEl = $("player");

  /* ================= small helpers ================= */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function decodeEntities(s) { var t = document.createElement("textarea"); t.innerHTML = s; return t.value; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function fmtViews(n) {
    n = Number(n); if (!isFinite(n) || n < 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return "" + n;
  }
  function fmtDur(s) {
    s = Number(s); if (!isFinite(s) || s <= 0) return "";
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    function p(v) { return v < 10 ? "0" + v : "" + v; }
    return h ? h + ":" + p(m) + ":" + p(x) : m + ":" + p(x);
  }
  function durToSec(d) {
    if (!d) return 0; var p = String(d).split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + (p[1] || 0);
  }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function uniq(list) { var seen = {}, out = []; list.forEach(function (v) { if (v && v.id && !seen[v.id]) { seen[v.id] = 1; out.push(v); } }); return out; }
  function lite(v) { return { id: v.id, title: v.title, channel: v.channel, views: v.views, age: v.age, dur: v.dur }; }
  function thumb(id) { return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg"; }
  function sec(v) { return v.sec || durToSec(v.dur); }
  function sameCh(a, b) { return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase(); }
  // titles sometimes carry object-replacement and zero-width characters that render as boxes on TVs
  function clean(s) { return String(s || "").replace(/[\u0000-\u001f​-‏‪-‮⁠-⁤﻿￼�]/g, "").trim(); }

  /* ================= data: public instances ================= */
  // Only instances that answer browsers with CORS (checked 2026-10-30); yewtu.be,
  // inv.nadeko.net and invidious.nerdvpn.de refuse cross-origin requests, so on a
  // slow TV they only add failed round trips.
  var INVIDIOUS = ["https://yt.chocolatemoo53.com"];
  var PIPED = ["https://api.piped.private.coffee", "https://pipedapi.kavin.rocks", "https://pipedapi.reallyaweso.me"];
  var downUntil = {};                      // instance -> time it may be retried
  function ordered(list) {
    var now = Date.now();
    return list.filter(function (b) { return !(downUntil[b] > now); })
      .concat(list.filter(function (b) { return downUntil[b] > now; }));
  }
  function fetchJSON(url, ms) {
    return new Promise(function (resolve, reject) {
      var done = false, ctrl = window.AbortController ? new AbortController() : null;
      var t = setTimeout(function () { if (done) return; done = true; if (ctrl) ctrl.abort(); reject(new Error("timeout")); }, ms);
      fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status); return r.json();
      }).then(function (j) { if (done) return; done = true; clearTimeout(t); resolve(j); },
        function (e) { if (done) return; done = true; clearTimeout(t); reject(e); });
    });
  }
  async function tryBases(list, path, ms, parse) {
    var bases = ordered(list);
    for (var i = 0; i < bases.length; i++) {
      try {
        var out = parse(await fetchJSON(bases[i] + path, ms));
        if (out && out.length) return out;
      } catch (e) { downUntil[bases[i]] = Date.now() + 120000; }
    }
    return null;
  }
  var memo = {}, inflight = {};
  function cached(key, ttl, fn) {
    var c = memo[key];
    if (c && Date.now() - c.t < ttl) return Promise.resolve(c.v);
    if (inflight[key]) return inflight[key];
    var p = fn().then(function (v) { delete inflight[key]; if (v) memo[key] = { t: Date.now(), v: v }; return v; },
      function (e) { delete inflight[key]; throw e; });
    inflight[key] = p; return p;
  }
  function fromInv(a) {
    if (!Array.isArray(a)) return null;
    return a.filter(function (x) { return x && x.videoId && x.type !== "channel" && x.type !== "playlist"; }).map(function (x) {
      return { id: x.videoId, title: clean(x.title) || "(ไม่มีชื่อ)", channel: clean(x.author), views: fmtViews(x.viewCount),
        age: x.publishedText || "", dur: fmtDur(x.lengthSeconds), sec: Number(x.lengthSeconds) || 0 };
    });
  }
  function pipedId(u) { var m = /[?&]v=([A-Za-z0-9_-]{11})/.exec(u || ""); return m ? m[1] : null; }
  function fromPiped(a) {
    if (a && a.items) a = a.items;
    if (!Array.isArray(a)) return null;
    return a.map(function (x) {
      var id = pipedId(x.url);
      return id && { id: id, title: clean(x.title) || "(ไม่มีชื่อ)", channel: clean(x.uploaderName), views: fmtViews(x.views),
        age: x.uploadedDate || "", dur: fmtDur(x.duration), sec: Number(x.duration) > 0 ? Number(x.duration) : 0 };
    }).filter(Boolean);
  }

  var api = {
    search: function (q) {
      return cached("s:" + q, 600000, async function () {
        var e = encodeURIComponent(q);
        return (await tryBases(INVIDIOUS, "/api/v1/search?type=video&q=" + e, 8000, fromInv))
          || (await tryBases(PIPED, "/search?filter=videos&q=" + e, 8000, fromPiped));
      });
    },
    trending: function () {
      var r = settings.region || "TH";
      return cached("t:" + r, 900000, async function () {
        return (await tryBases(PIPED, "/trending?region=" + r, 9000, fromPiped))
          || (await tryBases(INVIDIOUS, "/api/v1/trending?region=" + r, 9000, fromInv));
      });
    },
    suggest: function (q) {
      return cached("g:" + q, 600000, async function () {
        var e = encodeURIComponent(q);
        var r = await tryBases(INVIDIOUS, "/api/v1/search/suggestions?q=" + e, 4000, function (j) { return j && j.suggestions; });
        if (!r) r = await tryBases(PIPED, "/suggestions?query=" + e, 4000, function (j) { return Array.isArray(j) ? j : null; });
        return (r || []).map(function (s) { return decodeEntities(String(s)); });
      });
    },
    related: async function (v) {
      var q = (v.title || v.channel || "").split(/\s+/).slice(0, 6).join(" ").trim() || v.channel || "";
      var res = null;
      try { res = q ? await api.search(q) : null; } catch (e) { res = null; }
      if (!res) { try { res = await api.trending(); } catch (e) { res = null; } }
      return (res || []).filter(function (x) { return x.id !== v.id; }).slice(0, 25);
    },
    shorts: async function () {
      var qs = ["shorts ตลก", "shorts ไทย", "#shorts", "shorts สัตว์เลี้ยง", "shorts อาหาร"];
      var all = await Promise.all(qs.map(function (q) { return api.search(q).catch(function () { return null; }); }));
      var out = [];
      all.forEach(function (r) { (r || []).forEach(function (v) { var s = sec(v); if (s > 0 && s <= 75) out.push(v); }); });
      return shuffle(uniq(out));
    },
    channel: async function (name) {
      var r = await api.search(name);
      if (!r) return null;
      var mine = r.filter(function (v) { return sameCh(v.channel, name); });
      return mine.length >= 4 ? mine : r;
    }
  };

  /* ================= stored state (shared keys with ../index.html) ================= */
  var store = {
    history: arr(lsGet("mytube_history", [])),
    later: arr(lsGet("mytube_watchlater", [])),
    playlists: arr(lsGet("mytube_playlists", [])),
    subs: arr(lsGet("mytube_subs", [])),
    videos: arr(lsGet("mytube_videos", [])),
    searches: arr(lsGet("mytube_tv_searches", [])),
    progress: lsGet("mytube_tv_progress", {}) || {}
  };
  var settings = Object.assign({ autoplay: true, region: "TH" }, lsGet("mytube_tv_settings", {}) || {});
  function saveSettings() { lsSet("mytube_tv_settings", settings); }

  function pushHistory(v) {
    store.history = store.history.filter(function (x) { return x.id !== v.id; });
    store.history.unshift(lite(v));
    if (store.history.length > 200) store.history.length = 200;
    lsSet("mytube_history", store.history);
  }
  function isLater(id) { return store.later.some(function (x) { return x.id === id; }); }
  function toggleLater(v) {
    if (isLater(v.id)) { store.later = store.later.filter(function (x) { return x.id !== v.id; }); toast("นำออกจาก ดูภายหลัง แล้ว"); }
    else { store.later.unshift(lite(v)); toast("เพิ่มใน ดูภายหลัง แล้ว ✓"); }
    lsSet("mytube_watchlater", store.later);
  }
  function isSub(name) { return !!name && store.subs.some(function (s) { return sameCh(s, name); }); }
  function toggleSub(name) {
    if (!name) return;
    if (isSub(name)) { store.subs = store.subs.filter(function (s) { return !sameCh(s, name); }); toast("เลิกติดตาม " + name + " แล้ว"); }
    else { store.subs.unshift(name); toast("ติดตาม " + name + " แล้ว ✓"); }
    lsSet("mytube_subs", store.subs);
    homeStale = true;     // the "from your subscriptions" shelf changes
  }
  function saveProgress(id, t, d) {
    if (!id || !(d > 0)) return;
    if (t > d - 20) delete store.progress[id];
    else if (t > 15) store.progress[id] = { t: Math.floor(t), d: Math.floor(d), at: Date.now() };
    var keys = Object.keys(store.progress);
    if (keys.length > 300) {
      keys.sort(function (a, b) { return store.progress[a].at - store.progress[b].at; });
      keys.slice(0, keys.length - 300).forEach(function (k) { delete store.progress[k]; });
    }
    lsSet("mytube_tv_progress", store.progress);
  }
  function progressOf(id) { var p = store.progress[id]; return p && p.d > 0 ? p : null; }

  /* ================= scaling ================= */
  var fitWH = "";
  function fit() {
    var w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return;            // started hidden / no window yet: keep the last scale
    if (w + "x" + h === fitWH) return;
    fitWH = w + "x" + h;
    var s = Math.min(w / 1920, h / 1080);
    stage.style.transform = "translate(" + ((w - 1920 * s) / 2) + "px," + ((h - 1080 * s) / 2) + "px) scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  /* ================= toast ================= */
  var toastTimer = null;
  function toast(msg, ms) {
    // nothing may be drawn over the YouTube player, so during playback
    // messages go into the controls strip (or the Shorts side panel)
    if (!playerEl.hidden) { playerNote(msg, false, ms || 3000); return; }
    var t = $("toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
  }

  /* ================= focus engine =================
     Our own focus (class "focused"), never the browser's, so nothing scrolls
     on its own and the YouTube frame can never take the keys. Arrow keys pick
     the nearest focusable in that direction by on-screen geometry; shelves
     keep the focused tile at the left edge, so moving between shelves lands on
     each shelf's remembered tile. */
  var focused = null, lastFk = {};
  function isVisible(e) { return !!e && (e.offsetParent !== null || e.offsetWidth > 0 || e.offsetHeight > 0); }
  function layer() { if (!$("modal").hidden) return "modal"; if (!playerEl.hidden) return "player"; return "main"; }
  function candidates() {
    var L = layer(), list;
    if (L === "modal") list = $("modalActions").querySelectorAll(".f");
    else if (L === "player") list = playerEl.querySelectorAll(".f");
    else list = document.querySelectorAll("#rail .f, #rows .view.active .f");
    return Array.prototype.filter.call(list, isVisible);
  }
  function findFk(root, fk) {
    if (!fk) return null;
    return Array.prototype.find.call(root.querySelectorAll("[data-fk]"), function (x) { return x.dataset.fk === fk; }) || null;
  }
  function setFocus(e, opts) {
    if (!e) return;
    // while a dialog is open focus stays in it; anything else (player events,
    // late loads) only changes where focus returns when the dialog closes
    if (!$("modal").hidden && !e.closest("#modal")) { modalReturn = e; return; }
    if (focused && focused !== e) focused.classList.remove("focused");
    focused = e; e.classList.add("focused");
    stage.classList.toggle("rail-open", !!e.closest("#rail") && layer() === "main");
    if (!(opts && opts.noScroll)) reveal(e);
    onFocus(e);
  }
  function pick(cur, list, dir) {
    var r = cur.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    var best = null, bs = Infinity;
    for (var i = 0; i < list.length; i++) {
      var e = list[i]; if (e === cur) continue;
      var b = e.getBoundingClientRect(); if (!b.width && !b.height) continue;
      var bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2, gap, cross, ov;
      if (dir === "left" || dir === "right") {
        if (dir === "right" ? bx <= cx + 1 : bx >= cx - 1) continue;
        gap = dir === "right" ? b.left - r.right : r.left - b.right;
        ov = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        cross = ov > 0 ? 0 : Math.abs(by - cy);
      } else {
        if (dir === "down" ? by <= cy + 1 : by >= cy - 1) continue;
        gap = dir === "down" ? b.top - r.bottom : r.top - b.bottom;
        ov = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        cross = (ov > 0 ? 0 : Math.abs(bx - cx)) + Math.abs(b.left - r.left) * 0.05;
      }
      var s = Math.max(gap, -20) + cross * 3;
      if (s < bs) { bs = s; best = e; }
    }
    return best;
  }
  function move(dir) {
    var list = candidates(), cur = focused;
    if (!cur || list.indexOf(cur) < 0) { focusDefault(); return; }
    var inRail = !!cur.closest("#rail");
    if (inRail) {
      if (dir === "right") { enterContent(); return; }
      if (dir === "left") return;
      list = list.filter(function (e) { return !!e.closest("#rail"); });
    }
    // up/down stay inside the on-screen keyboard; Right is the way to the results
    var kb = cur.closest(".kb");
    if (kb && (dir === "up" || dir === "down")) list = list.filter(function (e) { return kb.contains(e); });
    if (views[current]) views[current]._pendingFk = null;   // user is steering: drop any pending restore
    // Remote presses arrive faster than the slide animations finish. Jump every
    // running slide to its end before measuring, or geometry is read mid-flight
    // and focus lands one tile off; then re-enable so the next slide animates.
    stage.classList.add("snap"); void stage.offsetWidth;
    var best = pick(cur, list, dir);
    stage.classList.remove("snap"); void stage.offsetWidth;
    if (!best) { if (dir === "left" && layer() === "main" && !inRail) focusRail(); return; }
    if (!inRail && best.closest("#rail")) { focusRail(); return; }
    setFocus(best);
  }
  function focusDefault() {
    var L = layer();
    if (L === "main") { enterContent(); return; }
    var list = candidates(); if (list.length) setFocus(list[0]);
  }
  function focusRail() {
    var name = railName();
    setFocus(document.querySelector('#rail .rail-item[data-view="' + name + '"]') || document.querySelector("#rail .f"));
  }
  function enterContent() {
    var v = views[current]; if (!v) return;
    var t = findFk(v, lastFk[current]);
    if ((!t || !isVisible(t)) && current === "search") t = v.querySelector(".kb-keys .f");
    if (!t || !isVisible(t)) t = Array.prototype.find.call(v.querySelectorAll(".f"), isVisible);
    if (t) setFocus(t); else focusRail();
  }
  function offsetWithin(e, anc) { var y = 0; while (e && e !== anc) { y += e.offsetTop; e = e.offsetParent; } return y; }
  function keepVisible(scroller, clipH, target) {
    var top = offsetWithin(target, scroller), h = target.offsetHeight, y = scroller._y || 0;
    if (top < y + 20) y = Math.max(0, top - 40);
    else if (top + h > y + clipH - 20) y = top + h - clipH + 60;
    scroller._y = y; scroller.style.transform = "translateY(" + (-y) + "px)";
  }
  function reveal(e) {
    var tile = e.closest(".tile"), track = e.closest(".track");
    if (tile && track && !e.closest(".grid")) {
      var tiles = track.children, x = tile.offsetLeft - tiles[0].offsetLeft;
      track.style.transform = "translateX(" + (-x) + "px)";
      for (var i = 0; i < tiles.length; i++) tiles[i].classList.toggle("before", tiles[i].offsetLeft < tile.offsetLeft);
    }
    var ys = e.closest(".yscroll");
    if (ys) keepVisible(ys, ys.parentNode.clientHeight, tile || e);
    var view = e.closest(".view");
    if (view && view.dataset.scroll === "rows") {
      var row = e.closest(".row") || e.closest(".view-head");
      var first = view.querySelector(".row, .view-head");
      var y = (!row || row === first) ? 0 : offsetWithin(row, view) - 30;
      view.style.transform = "translateY(" + (-Math.max(0, y)) + "px)";
    } else if (view && view.dataset.scroll === "free") {
      keepVisible(view, $("viewport").clientHeight, e);
    }
  }
  function onFocus(e) {
    var L = layer();
    if (L === "main" && !e.closest("#rail") && current) lastFk[current] = e.dataset.fk;
    if (L === "main" && e._v) showHero(e._v, e._ctx ? e._ctx.title : "");
    else if (L === "main" && e.classList.contains("skel")) showHero(null, e._ctx ? e._ctx.title : "");
    if (L === "player") playerEl.classList.toggle("deep", !!e.closest(".osd-upnext"));
    var row = e.closest(".row"), view = e.closest(".view");
    if (row && view && view.dataset.scroll === "rows") nearRows(view, row);
  }

  /* ================= hero ================= */
  var heroTimer = null;
  function showHero(v, kicker) {
    $("heroKicker").textContent = kicker || "";
    if (!v) { $("heroTitle").textContent = "กำลังโหลด…"; $("heroMeta").innerHTML = ""; return; }
    $("heroTitle").textContent = v.title || "";
    var bits = [];
    if (v.channel) bits.push("<b>" + esc(v.channel) + "</b>");
    if (v.views) bits.push(esc(v.views) + " ครั้ง");
    if (v.age) bits.push(esc(v.age));
    if (v.dur) bits.push(esc(v.dur));
    var p = progressOf(v.id);
    $("heroMeta").innerHTML = (p ? '<span class="hero-badge">ดูต่อจาก ' + fmtDur(p.t) + "</span>" : "")
      + bits.join('<span class="sep">•</span>');
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () { heroImage(v.id); }, 160);
  }
  function heroImage(id) {
    var img = $("heroImg");
    if (img._id === id) return;
    img._id = id; img.classList.remove("on");
    var probe = new Image();
    function use(src) { if (img._id !== id) return; img.src = src; img.classList.add("on"); }
    probe.onload = function () { if (probe.naturalWidth <= 120) use(thumb(id)); else use(probe.src); };
    probe.onerror = function () { use(thumb(id)); };
    probe.src = "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg";
  }

  /* ================= tiles & shelves ================= */
  function makeTile(v, ctx) {
    var t = el("div", "f tile");
    t._v = v; t._ctx = ctx; t.dataset.fk = ctx.key + ":" + v.id;
    var p = progressOf(v.id);
    t.innerHTML = '<div class="thumb"><img alt="" data-src="' + thumb(v.id) + '">'
      + (v.dur ? '<span class="dur">' + esc(v.dur) + "</span>" : "")
      + (p ? '<div class="wbar"><i style="width:' + Math.min(100, Math.round(p.t / p.d * 100)) + '%"></i></div>' : "")
      + '</div><div class="t-title">' + esc(v.title) + '</div><div class="t-meta">'
      + esc(v.channel) + (v.views ? " • " + esc(v.views) + " ครั้ง" : "") + "</div>";
    var img = t.querySelector("img");
    img.onerror = function () { img.onerror = null; img.src = "https://i.ytimg.com/vi/" + v.id + "/mqdefault.jpg"; };
    return t;
  }
  function skelTile(ctx, i) {
    var t = el("div", "f tile skel", '<div class="thumb"></div><div class="t-title"></div>');
    t._ctx = ctx; t.dataset.fk = ctx.key + ":skel" + i;
    return t;
  }
  function noteTile(ctx, text, act) {
    var t = el("div", "f tile note", '<div class="thumb">' + esc(text) + "</div>");
    t._ctx = ctx; t.dataset.fk = ctx.key + ":note"; if (act) t._act = act;
    return t;
  }
  function hydrate(root) {
    Array.prototype.forEach.call(root.querySelectorAll("img[data-src]"), function (img) {
      img.src = img.getAttribute("data-src"); img.removeAttribute("data-src");
    });
  }
  function makeRow(d) {
    var row = el("div", "row" + (d.shorts ? " shorts" : ""));
    row._def = d; row.dataset.key = d.key;
    row.innerHTML = '<div class="row-title">' + esc(d.title) + (d.sub ? "<small>" + esc(d.sub) + "</small>" : "") + '</div><div class="track"></div>';
    row._ctx = { key: d.key, title: d.title, shorts: !!d.shorts, items: [] };
    if (d.items) { row._state = "done"; fillRow(row, d.items); }
    else {
      row._state = "idle";
      var track = row.querySelector(".track");
      for (var i = 0; i < 6; i++) track.appendChild(skelTile(row._ctx, i));
    }
    return row;
  }
  function trackIndexOfFocus(row) {
    if (!focused || !row.contains(focused)) return -1;
    var tile = focused.closest(".tile"), kids = row.querySelector(".track").children;
    return Array.prototype.indexOf.call(kids, tile);
  }
  function refocusInRow(row, idx) {
    var kids = row.querySelector(".track").children;
    if (kids.length) setFocus(kids[Math.max(0, Math.min(idx, kids.length - 1))]);
  }
  function fillRow(row, items) {
    var idx = trackIndexOfFocus(row), track = row.querySelector(".track");
    var ctx = row._ctx; ctx.items = items;
    track.innerHTML = ""; track.style.transform = "";
    items.forEach(function (v) { track.appendChild(makeTile(v, ctx)); });
    if (row._near) hydrate(row);
    // Back into a rebuilt view: the tile to return to only exists once its row loads
    var view = row.closest(".view"), pend = view && view._pendingFk;
    var hit = pend && idx >= 0 ? findFk(row, pend) : null;
    if (hit) { view._pendingFk = null; setFocus(hit); }
    else if (idx >= 0) refocusInRow(row, idx);
  }
  function noteRow(row, text, retry) {
    var idx = trackIndexOfFocus(row), track = row.querySelector(".track");
    track.innerHTML = ""; track.style.transform = "";
    track.appendChild(noteTile(row._ctx, text, retry));
    if (idx >= 0) refocusInRow(row, 0);
  }
  function removeRow(row) {
    if (focused && row.contains(focused)) {
      var next = row.nextElementSibling || row.previousElementSibling;
      var t = next && next.querySelector(".f");
      row.remove();
      if (t) setFocus(t); else enterContent();
      return;
    }
    row.remove();
  }
  function loadRow(row) {
    if (row._state !== "idle") return;
    row._state = "loading";
    var d = row._def;
    Promise.resolve(d.q ? api.search(d.q) : d.load()).then(function (items) {
      if (!row.parentNode) return;
      row._state = "done";
      if (items === null && !d.local) { failRow(row); return; }
      if (!items || !items.length) {
        if (d.hideEmpty) removeRow(row); else noteRow(row, d.emptyText || "ยังไม่มีวิดีโอในหมวดนี้");
        return;
      }
      fillRow(row, items);
    }, function () { if (row.parentNode) { row._state = "done"; failRow(row); } });
  }
  function failRow(row) {
    noteRow(row, "โหลดไม่สำเร็จ · กด OK เพื่อลองใหม่", function () {
      row._state = "idle";
      var track = row.querySelector(".track"); track.innerHTML = "";
      for (var i = 0; i < 6; i++) track.appendChild(skelTile(row._ctx, i));
      refocusInRow(row, 0);
      loadRow(row);
    });
  }
  function nearRows(view, row) {
    var rows = view.querySelectorAll(".row"), k = Math.max(0, Array.prototype.indexOf.call(rows, row));
    for (var i = 0; i < rows.length; i++) {
      if (i <= k + 3) loadRow(rows[i]);
      if (i >= k - 1 && i <= k + 2 && !rows[i]._near) { rows[i]._near = true; hydrate(rows[i]); }
    }
  }

  /* ================= views ================= */
  var views = {}, current = null, stack = [];
  // Home is kept alive between visits; when its shelves go out of date it is
  // marked stale and rebuilt on the next visit, never torn down while showing.
  var homeStale = false;
  var TOP = ["search", "home", "subs", "library", "settings"];
  function railName() {
    if (TOP.indexOf(current) >= 0) return current;
    for (var i = stack.length - 1; i >= 0; i--) if (TOP.indexOf(stack[i].name) >= 0) return stack[i].name;
    return "home";
  }
  function markRail() {
    var n = railName();
    Array.prototype.forEach.call(document.querySelectorAll("#rail .rail-item"), function (b) {
      b.classList.toggle("active", b.dataset.view === n);
    });
  }
  function showView(name, args, o) {
    o = o || {};
    if (o.push && current) stack.push({ name: current, args: views[current] && views[current]._args, fk: focused && focused.dataset.fk });
    var v;
    if (name === "home") {
      if (homeStale && views.home) { views.home.remove(); delete views.home; }
      homeStale = false;
      v = views.home || (views.home = buildHome());
      refreshContinue();
    }
    else if (name === "search") { v = views.search || (views.search = buildSearch()); }
    else {
      if (views[name]) views[name].remove();
      v = views[name] = BUILD[name](args || {});
    }
    v._args = args;
    if (!v.parentNode) rowsEl.appendChild(v);
    Array.prototype.forEach.call(rowsEl.children, function (c) { c.classList.toggle("active", c === v); });
    current = name;
    main.classList.toggle("nohero", !v.querySelector(".row"));
    markRail();
    if (v.dataset.scroll === "rows") nearRows(v, v.querySelector(".row"));
    if (o.restoreFk) {
      var t = findFk(v, o.restoreFk);
      if (t && isVisible(t)) { setFocus(t); return; }
      // not loaded yet: sit on that shelf and let fillRow land on the tile
      var rk = o.restoreFk.slice(0, o.restoreFk.indexOf(":"));
      var prow = rk ? Array.prototype.find.call(v.querySelectorAll(".row"), function (r) { return r.dataset.key === rk; }) : null;
      var sk = prow && prow.querySelector(".track .f");
      if (sk) { v._pendingFk = o.restoreFk; setFocus(sk); return; }
    }
    if (o.focus === "rail") focusRail();
    else if (o.focus !== "none") enterContent();
  }
  function go(name) {
    if (name === "shorts") { openShortsFeed(); return; }
    stack = [];
    if (name !== "home" && name !== "search") delete lastFk[name];
    showView(name);
  }
  function open(name, args) { showView(name, args, { push: true }); }
  function goBack() {
    if (stack.length) { var s = stack.pop(); showView(s.name, s.args, { restoreFk: s.fk }); return; }
    if (focused && !focused.closest("#rail")) { focusRail(); return; }
    if (current !== "home") { showView("home", null, { focus: "rail" }); return; }
    confirmExit();
  }
  function viewEl(name, scroll) { var v = el("div", "view"); v.dataset.name = name; v.dataset.scroll = scroll; return v; }
  function headEl(title, sub) { return el("div", "view-head", "<h2>" + esc(title) + "</h2>" + (sub ? "<p>" + esc(sub) + "</p>" : "")); }

  /* ---- home ---- */
  var CATS = [
    { key: "music", title: "เพลง", q: "เพลงฮิต ล่าสุด official mv" },
    { key: "gaming", title: "เกม", q: "เกม เล่นเกม gameplay" },
    { key: "news", title: "ข่าว", q: "ข่าว ล่าสุด วันนี้" },
    { key: "cooking", title: "ทำอาหาร", q: "ทำอาหาร สูตรอาหาร รายการทำอาหาร" },
    { key: "docs", title: "สารคดี", q: "สารคดี documentary" },
    { key: "travel", title: "ท่องเที่ยว", q: "เที่ยว ทริปท่องเที่ยว vlog" },
    { key: "podcast", title: "พอดแคสต์", q: "พอดแคสต์ podcast" },
    { key: "sports", title: "กีฬา", q: "กีฬา ไฮไลท์ highlights" }
  ];
  async function forYou() {
    var seeds = [];
    store.history.forEach(function (h) {
      var k = (h.channel || "").trim() || (h.title || "").trim();
      if (k && seeds.indexOf(k) < 0 && seeds.length < 3) seeds.push(k);
    });
    var recs = [];
    if (seeds.length) {
      var rr = await Promise.all(seeds.map(function (s) { return api.search(s).catch(function () { return null; }); }));
      rr.forEach(function (r) { if (r) recs = recs.concat(r.slice(0, 8)); });
    } else {
      var v = await api.search("ไวรัล ล่าสุด").catch(function () { return null; });
      if (v) recs = recs.concat(v);
    }
    var t = await api.trending().catch(function () { return null; });
    if (t) recs = recs.concat(t.slice(5, 15));
    var seen = {}; store.history.forEach(function (h) { seen[h.id] = 1; });
    var out = shuffle(uniq(recs)).filter(function (v) { return !seen[v.id]; });
    return out.length ? out : null;
  }
  async function subsFeed() {
    var chans = store.subs.slice(0, 6);
    if (!chans.length) return [];
    var rr = await Promise.all(chans.map(function (c) { return api.channel(c).catch(function () { return null; }); }));
    var lists = rr.map(function (r) { return (r || []).slice(0, 5); }), out = [];
    for (var i = 0; i < 5; i++) lists.forEach(function (l) { if (l[i]) out.push(l[i]); });
    return uniq(out);
  }
  function continueItems() { return store.history.slice(0, 20); }
  function buildHome() {
    var v = viewEl("home", "rows");
    var defs = [];
    if (continueItems().length) defs.push({ key: "continue", title: "ดูต่อ", items: continueItems() });
    defs.push({ key: "foryou", title: "แนะนำสำหรับคุณ", load: forYou });
    defs.push({ key: "trending", title: "มาแรงในไทย", load: function () { return api.trending(); } });
    defs.push({ key: "shorts", title: "Shorts", shorts: true, load: function () { return api.shorts(); } });
    if (store.subs.length) defs.push({ key: "subsfeed", title: "จากช่องที่คุณติดตาม", load: subsFeed, hideEmpty: true, local: true });
    CATS.forEach(function (c) { defs.push(c); });
    defs.forEach(function (d) { v.appendChild(makeRow(d)); });
    return v;
  }
  function refreshContinue() {
    var v = views.home; if (!v) return;
    var items = continueItems(), row = v.querySelector('.row[data-key="continue"]');
    if (row) { if (items.length) fillRow(row, items); else removeRow(row); return; }
    if (items.length) {
      row = makeRow({ key: "continue", title: "ดูต่อ", items: items });
      row._near = true; hydrate(row);
      v.insertBefore(row, v.firstChild);
    }
  }

  /* ---- library ---- */
  function buildLibrary() {
    var v = viewEl("library", "rows");
    var defs = [];
    if (store.history.length) defs.push({ key: "history", title: "ประวัติการดู", sub: store.history.length + " คลิป", items: store.history.slice(0, 40) });
    if (store.later.length) defs.push({ key: "later", title: "ดูภายหลัง", sub: store.later.length + " คลิป", items: store.later.slice(0, 60) });
    store.playlists.forEach(function (p, i) {
      if (p && arr(p.items).length) defs.push({ key: "pl" + i, title: p.name || "เพลย์ลิสต์", sub: "เพลย์ลิสต์ · " + p.items.length + " คลิป", items: p.items.slice(0, 60) });
    });
    if (store.videos.length) defs.push({ key: "mine", title: "วิดีโอที่เพิ่มไว้", items: store.videos.map(lite).slice(0, 60) });
    if (!defs.length) {
      v.dataset.scroll = "free";
      v.appendChild(headEl("คลังของฉัน"));
      v.appendChild(el("div", "empty-state", "ยังไม่มีอะไรในคลัง<br>ดูวิดีโอสักคลิป แล้วจะขึ้นใน <b>ประวัติการดู</b> ที่นี่<br>กดค้างปุ่ม OK บนวิดีโอเพื่อเพิ่มใน <b>ดูภายหลัง</b>"));
      return v;
    }
    defs.forEach(function (d) { v.appendChild(makeRow(d)); });
    return v;
  }

  /* ---- subscriptions ---- */
  function buildSubs() {
    var v = viewEl("subs", "rows");
    if (!store.subs.length) {
      v.dataset.scroll = "free";
      v.appendChild(headEl("การติดตาม"));
      v.appendChild(el("div", "empty-state", "ยังไม่ได้ติดตามช่องไหน<br>ระหว่างดูวิดีโอ กด <b>OK</b> เพื่อเปิดแถบควบคุม แล้วเลือก <b>ติดตาม</b><br>หรือกดค้าง OK บนวิดีโอใดก็ได้"));
      return v;
    }
    var head = headEl("การติดตาม", store.subs.length + " ช่อง");
    var pills = el("div", "");
    pills.style.marginTop = "26px";
    store.subs.slice(0, 12).forEach(function (name, i) {
      var b = el("button", "f pill", esc(name));
      b.dataset.fk = "subs:ch" + i;
      b._act = function () { open("channel", { name: name }); };
      pills.appendChild(b);
    });
    head.appendChild(pills);
    v.appendChild(head);
    store.subs.slice(0, 10).forEach(function (name, i) {
      v.appendChild(makeRow({ key: "sub" + i, title: name, load: function () { return api.channel(name); } }));
    });
    return v;
  }

  /* ---- channel ---- */
  function buildChannel(args) {
    var name = args.name || "";
    var v = viewEl("channel", "rows");
    var head = headEl(name, "ช่อง");
    var btn = el("button", "f pill" + (isSub(name) ? " on" : ""), isSub(name) ? "✓ ติดตามแล้ว" : "+ ติดตาม");
    btn.dataset.fk = "channel:follow";
    btn.style.marginTop = "26px";
    btn._act = function () {
      toggleSub(name);
      btn.textContent = isSub(name) ? "✓ ติดตามแล้ว" : "+ ติดตาม";
      btn.classList.toggle("on", isSub(name));
    };
    head.appendChild(btn);
    v.appendChild(head);
    v.appendChild(makeRow({ key: "ch-latest", title: "วิดีโอจาก " + name, load: function () { return api.channel(name); } }));
    v.appendChild(makeRow({ key: "ch-pop", title: "ยอดนิยม", load: async function () {
      var r = await api.search(name + " ยอดนิยม");
      if (!r) return null;
      var mine = r.filter(function (x) { return sameCh(x.channel, name); });
      return mine.length >= 3 ? mine : r;
    } }));
    return v;
  }

  /* ---- settings ---- */
  var REGIONS = [["TH", "ไทย"], ["US", "สหรัฐฯ"], ["JP", "ญี่ปุ่น"], ["KR", "เกาหลีใต้"], ["GB", "สหราชอาณาจักร"]];
  function buildSettings() {
    var v = viewEl("settings", "free");
    v.appendChild(headEl("ตั้งค่า"));
    var list = el("div", "set-list");
    function item(fk, label, val, act) {
      var b = el("button", "f set-item", "<span>" + esc(label) + '</span><span class="val">' + esc(val) + "</span>");
      b.dataset.fk = fk; b._act = act; list.appendChild(b); return b;
    }
    item("set:autoplay", "เล่นวิดีโอถัดไปอัตโนมัติ", settings.autoplay ? "เปิด" : "ปิด", function () {
      settings.autoplay = !settings.autoplay; saveSettings(); this.querySelector(".val").textContent = settings.autoplay ? "เปิด" : "ปิด";
    });
    var ri = Math.max(0, REGIONS.map(function (r) { return r[0]; }).indexOf(settings.region));
    item("set:region", "ภูมิภาคของ “มาแรง”", REGIONS[ri][1], function () {
      ri = (ri + 1) % REGIONS.length; settings.region = REGIONS[ri][0]; saveSettings();
      this.querySelector(".val").textContent = REGIONS[ri][1];
      homeStale = true;
    });
    item("set:clearHist", "ล้างประวัติการดู", store.history.length + " คลิป", function () {
      var b = this;
      ask("ล้างประวัติการดูทั้งหมด?", "ประวัติ " + store.history.length + " คลิปและตำแหน่งที่ดูค้างไว้จะหายไป", "ล้าง", function () {
        store.history = []; store.progress = {}; lsSet("mytube_history", []); lsSet("mytube_tv_progress", {});
        b.querySelector(".val").textContent = "0 คลิป"; toast("ล้างประวัติแล้ว");
        homeStale = true;
      });
    });
    item("set:clearLater", "ล้างรายการ ดูภายหลัง", store.later.length + " คลิป", function () {
      var b = this;
      ask("ล้างรายการ ดูภายหลัง?", "", "ล้าง", function () {
        store.later = []; lsSet("mytube_watchlater", []); b.querySelector(".val").textContent = "0 คลิป"; toast("ล้างแล้ว");
      });
    });
    item("set:clearSearch", "ล้างประวัติการค้นหา", store.searches.length + " คำ", function () {
      store.searches = []; lsSet("mytube_tv_searches", []); this.querySelector(".val").textContent = "0 คำ"; toast("ล้างแล้ว");
      if (views.search) { views.search.remove(); delete views.search; }
    });
    v.appendChild(list);
    v.appendChild(el("div", "about",
      "<b>meekinTube TV " + VERSION + "</b> · " + esc(SHELL) + (PACKAGED ? " (แพ็กเกจ)" : "") + "<br>"
      + "เครื่องเล่น: YouTube embedded player ผ่าน " + esc(new URL(PLAYER_URL).host) + "<br>"
      + "การเล่นวิดีโออยู่ภายใต้ YouTube Terms of Service (youtube.com/t/terms) และ Google Privacy Policy (policies.google.com/privacy)<br>"
      + "ผลค้นหาและหมวด “มาแรง” มาจากบริการสาธารณะ Invidious / Piped · ประวัติและรายการต่าง ๆ เก็บไว้ในเครื่องนี้เท่านั้น<br>"
      + "ปุ่มรีโมต: ลูกศรเลื่อน · OK เลือก · กดค้าง OK = ตัวเลือก · BACK ย้อนกลับ · ปุ่มเล่น/หยุดบนรีโมตใช้ได้ระหว่างดู"));
    return v;
  }

  var BUILD = { library: buildLibrary, subs: buildSubs, channel: buildChannel, settings: buildSettings };

  /* ================= search ================= */
  var TH1 = "กขคฆงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลวศษสหฬอฮ".split("");
  var TH2 = "ะัาำิีึืุูเแโใไ็่้๊๋์ๆฤฯ".split("");
  var ABC = "abcdefghijklmnopqrstuvwxyz0123456789-.&'#?".split("");
  var MARKS = "ัิีึืุู็่้๊๋์";
  var S = { q: "", page: "th1", lastQ: null, sugTimer: null, liveTimer: null, el: null, token: 0 };
  var POPULAR = ["เพลงฮิต", "ข่าววันนี้", "ทำอาหาร", "เกม", "ตลก", "สารคดี", "ฟุตบอล", "การ์ตูน"];
  // the search view is built before it is attached, so look inside it, not in document
  function sq(id) { return S.el.querySelector("#" + id); }

  function buildSearch() {
    var v = viewEl("search", "none");
    v.innerHTML =
      '<div class="search">'
      + '<div class="kb">'
      + '<div class="query"><svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16a6.47 6.47 0 0 0 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14"/></svg><span class="q-text"></span><span class="caret"></span></div>'
      + '<div class="kb-tabs"></div><div class="kb-keys"></div><div class="kb-actions"></div>'
      + "</div>"
      + '<div class="s-right"><div class="s-label" id="sChipsLabel"></div><div class="s-chips" id="sChips"></div>'
      + '<div class="s-results"><div class="yscroll"><div class="s-label" id="sResLabel"></div><div class="grid" id="sGrid"></div></div></div></div>'
      + "</div>";
    S.el = v;
    var tabs = v.querySelector(".kb-tabs");
    [["th1", "ก-ฮ"], ["th2", "สระ ่ ้"], ["abc", "ABC 123"], ["native", "⌨ คีย์บอร์ดทีวี"]].forEach(function (t) {
      var b = el("button", "f kb-tab", esc(t[1]));
      b.dataset.fk = "kbtab:" + t[0]; b.dataset.page = t[0];
      b._act = function () { if (t[0] === "native") openNative(); else { S.page = t[0]; renderKeys(); } };
      tabs.appendChild(b);
    });
    var acts = v.querySelector(".kb-actions");
    [["space", "เว้นวรรค"], ["bksp", "⌫ ลบ"], ["clear", "ล้าง"], ["go", "ค้นหา"]].forEach(function (a) {
      var b = el("button", "f key wide" + (a[0] === "go" ? " go" : ""), esc(a[1]));
      b.dataset.fk = "kbact:" + a[0];
      b._act = function () {
        if (a[0] === "space") typeChar(" ");
        else if (a[0] === "bksp") backspace();
        else if (a[0] === "clear") { S.q = ""; queryChanged(); }
        else if (S.q.trim()) runSearch(S.q.trim(), true);
      };
      acts.appendChild(b);
    });
    renderKeys();
    renderQuery();
    showIdleChips();
    showTrendingResults();
    return v;
  }
  function renderKeys() {
    var box = S.el.querySelector(".kb-keys"), chars = S.page === "th2" ? TH2 : (S.page === "abc" ? ABC : TH1);
    var hadKey = focused && box.contains(focused);
    box.innerHTML = "";
    chars.forEach(function (c, i) {
      var b = el("button", "f key", esc(MARKS.indexOf(c) >= 0 ? "◌" + c : c));
      b.dataset.fk = "kb:" + S.page + ":" + i;
      b._act = function () { typeChar(c); };
      box.appendChild(b);
    });
    Array.prototype.forEach.call(S.el.querySelectorAll(".kb-tab"), function (t) { t.classList.toggle("on", t.dataset.page === S.page); });
    if (hadKey) setFocus(box.firstChild);
  }
  function renderQuery() {
    var q = S.el.querySelector(".q-text");
    q.innerHTML = S.q ? esc(S.q) : '<span class="q-ph">ค้นหาวิดีโอ</span>';
  }
  function typeChar(c) { if (S.q.length < 80) { S.q += c; queryChanged(); } }
  function backspace() { if (S.q) { S.q = S.q.slice(0, -1); queryChanged(); } }
  function queryChanged() {
    renderQuery();
    clearTimeout(S.sugTimer); clearTimeout(S.liveTimer);
    var q = S.q.trim();
    if (!q) { showIdleChips(); return; }
    S.sugTimer = setTimeout(function () {
      api.suggest(q).then(function (list) {
        if (S.q.trim() !== q) return;
        renderChips(list.length ? "คำแนะนำ" : "", list.slice(0, 8), "sug");
      });
    }, 300);
    if (q.length >= 2) S.liveTimer = setTimeout(function () { if (S.q.trim() === q) runSearch(q, false); }, 1300);
  }
  function renderChips(label, list, kind) {
    sq("sChipsLabel").textContent = label;
    var box = sq("sChips"), had = focused && box.contains(focused);
    box.innerHTML = "";
    list.forEach(function (s, i) {
      var b = el("button", "f pill", esc(s));
      b.dataset.fk = "chip:" + kind + i;
      b._act = function () { S.q = s; renderQuery(); runSearch(s, true); };
      box.appendChild(b);
    });
    if (had) { if (box.firstChild) setFocus(box.firstChild); else enterSearchKeys(); }
  }
  function enterSearchKeys() { var k = S.el.querySelector(".kb-keys .f"); if (k) setFocus(k); }
  function showIdleChips() {
    if (store.searches.length) renderChips("ค้นหาล่าสุด", store.searches.slice(0, 8), "recent");
    else renderChips("ลองค้นหา", POPULAR, "pop");
  }
  function renderGrid(label, items, key) {
    sq("sResLabel").textContent = label;
    var grid = sq("sGrid"), had = focused && grid.contains(focused);
    grid.innerHTML = "";
    var ys = grid.parentNode; ys._y = 0; ys.style.transform = "";
    var ctx = { key: key, title: label, items: items || [] };
    (items || []).forEach(function (v) { grid.appendChild(makeTile(v, ctx)); });
    hydrate(grid);
    if (had) { if (grid.firstChild) setFocus(grid.firstChild); else enterSearchKeys(); }
  }
  function showTrendingResults() {
    sq("sResLabel").textContent = "มาแรงตอนนี้";
    api.trending().then(function (t) { if (S.lastQ === null && t) renderGrid("มาแรงตอนนี้", t.slice(0, 18), "strend"); });
  }
  function runSearch(q, remember) {
    S.lastQ = q;
    var tok = ++S.token;
    if (remember) {
      store.searches = [q].concat(store.searches.filter(function (s) { return s !== q; })).slice(0, 20);
      lsSet("mytube_tv_searches", store.searches);
    }
    sq("sResLabel").textContent = "กำลังค้นหา “" + q + "” …";
    api.search(q).then(function (r) {
      if (tok !== S.token) return;
      if (!r) { renderGrid("ค้นหาไม่สำเร็จ — บริการค้นหาสาธารณะอาจล่มชั่วคราว ลองอีกครั้ง", [], "search"); return; }
      renderGrid("ผลการค้นหา “" + q + "”", r, "search");
    }, function () { if (tok === S.token) renderGrid("ค้นหาไม่สำเร็จ ลองอีกครั้ง", [], "search"); });
  }
  /* the TV's own keyboard: Thai, voice, whatever the set offers */
  var nativeInput = $("nativeInput");
  function openNative() {
    nativeInput.value = S.q;
    nativeInput.classList.add("show");
    setTimeout(function () { nativeInput.focus(); }, 30);
  }
  function closeNative(submit) {
    nativeInput.classList.remove("show");
    nativeInput.blur();
    try { window.focus(); } catch (e) {}
    if (submit && S.q.trim()) runSearch(S.q.trim(), true);
  }
  nativeInput.addEventListener("input", function () { S.q = nativeInput.value.slice(0, 80); queryChanged(); });
  nativeInput.addEventListener("blur", function () { nativeInput.classList.remove("show"); });
  function nativeOpen() { return document.activeElement === nativeInput || nativeInput.classList.contains("show"); }
  function nativeKey(e) {
    var c = e.keyCode;
    if (c === 13 || c === 65376) { e.preventDefault(); closeNative(true); }
    else if (c === 27 || c === 10009 || c === 65385) { e.preventDefault(); closeNative(false); }
    else if (c === 38 || c === 40) { e.preventDefault(); closeNative(false); handle(c === 38 ? "up" : "down"); }
  }

  /* ================= modal ================= */
  var modalReturn = null, modalIsExit = false;
  function modal(title, text, buttons, defIdx) {
    modalReturn = focused; modalIsExit = false;
    $("modalTitle").textContent = title || "";
    $("modalText").textContent = text || "";
    $("modalText").hidden = !text;
    var box = $("modalActions"); box.innerHTML = "";
    buttons.forEach(function (b, i) {
      var x = el("button", "f modal-btn", esc(b.label));
      x.dataset.fk = "modal:" + i;
      x._act = function () { closeModal(); if (b.act) b.act(); };
      box.appendChild(x);
    });
    $("modal").hidden = false;
    stage.classList.remove("rail-open");
    setFocus(box.children[defIdx || 0], { noScroll: true });
  }
  function closeModal() {
    $("modal").hidden = true;
    var r = modalReturn; modalReturn = null;
    if (r && isVisible(r)) setFocus(r, { noScroll: true }); else focusDefault();
  }
  function ask(title, text, okLabel, fn) { modal(title, text, [{ label: okLabel, act: fn }, { label: "ยกเลิก" }], 1); }
  function confirmExit() {
    modal("ออกจาก meekinTube?", "", [{ label: "ออก", act: exitApp }, { label: "ยกเลิก" }], 1);
    modalIsExit = true;
  }
  // Android shell: a WebMessageListener object injected only into https://swumkt.org frames
  function toAndroid(msg) {
    var a = window.MeekinAndroid;
    if (a && a.postMessage) { try { a.postMessage(msg); return true; } catch (e) {} }
    // old WebViews without WebMessageListener: the app catches and cancels this navigation
    if (SHELL === "android" && /; wv\)/.test(navigator.userAgent)) {
      try { location.href = "meekin://" + msg.replace(":", "/"); return true; } catch (e) {}
    }
    return false;
  }
  function exitApp() {
    if (SHELL === "tizen") { try { window.tizen.application.getCurrentApplication().exit(); return; } catch (e) {} }
    if (toAndroid("exit")) return;
    try { window.close(); } catch (e) {}
    toast("ปิดแท็บนี้ หรือกดปุ่ม HOME บนรีโมตเพื่อออก");
  }
  function openOptions(tile) {
    var v = tile._v, ctx = tile._ctx || {};
    var btns = [{ label: "▶ เล่น", act: function () { playFromTile(tile); } },
      { label: isLater(v.id) ? "นำออกจาก ดูภายหลัง" : "+ ดูภายหลัง", act: function () { toggleLater(v); } }];
    if (v.channel) {
      btns.push({ label: "ไปที่ช่อง " + v.channel, act: function () { if (!playerEl.hidden) closePlayer(); open("channel", { name: v.channel }); } });
      btns.push({ label: (isSub(v.channel) ? "เลิกติดตาม " : "ติดตาม ") + v.channel, act: function () { toggleSub(v.channel); } });
    }
    if (ctx.key === "continue" || ctx.key === "history") {
      btns.push({ label: "นำออกจากประวัติ", act: function () {
        store.history = store.history.filter(function (x) { return x.id !== v.id; });
        delete store.progress[v.id];
        lsSet("mytube_history", store.history); lsSet("mytube_tv_progress", store.progress);
        var row = tile.closest(".row");
        if (row) { var rest = (row._ctx.items || []).filter(function (x) { return x.id !== v.id; }); if (rest.length) fillRow(row, rest); else removeRow(row); }
        toast("นำออกแล้ว");
      } });
    }
    modal(v.title, v.channel, btns, 0);
  }

  /* ================= player ================= */
  var P = { frame: null, booted: false, pending: [], bootTimer: null, v: null, queue: [], qi: 0, related: [],
    state: -1, cur: 0, dur: 0, buf: 0, started: false, shorts: false, osdTimer: null, ret: null,
    lastSave: 0, seekAt: 0, seekRun: 0, errTimer: null, blocked: false, noteTimer: null,
    gen: 0,              // bumped by every play()/closePlayer(); late async results check it
    wasPlaying: false, shortsLoading: false };

  function ensureFrame() {
    if (P.frame) return;
    var f = document.createElement("iframe");
    f.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
    f.setAttribute("tabindex", "-1");
    f.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    f.title = "YouTube player";
    f.src = PLAYER_URL;
    $("ytHost").appendChild(f);
    P.frame = f;
    P.bootTimer = setTimeout(function () {
      if (P.booted) return;
      if (!playerEl.hidden) {
        $("playerSpinner").hidden = true;
        playerMsg("โหลดเครื่องเล่นไม่ได้", "ตรวจสอบอินเทอร์เน็ต แล้วลองใหม่ (" + new URL(PLAYER_URL).host + ")");
      }
      resetFrame();       // the next play() builds a fresh frame instead of waiting on a dead one
    }, 15000);
  }
  function resetFrame() {
    clearTimeout(P.bootTimer);
    if (P.frame && P.frame.parentNode) P.frame.parentNode.removeChild(P.frame);
    P.frame = null; P.booted = false; P.pending = [];
  }
  function pcmd(m) {
    m.meekin = 1;
    if (!P.frame) return;
    if (!P.booted) { if (m.cmd === "load") P.pending = [m]; else P.pending.push(m); return; }
    try { P.frame.contentWindow.postMessage(m, PLAYER_ORIGIN); } catch (e) {}
  }
  window.addEventListener("message", function (e) {
    if (!P.frame || e.source !== P.frame.contentWindow || e.origin !== PLAYER_ORIGIN) return;
    var m = e.data; if (!m || m.meekin !== 1) return;
    if (m.ev === "boot") {
      P.booted = true; clearTimeout(P.bootTimer);
      var q = P.pending; P.pending = [];
      q.forEach(pcmd);
    } else if (m.ev === "state") onState(m.s);
    else if (m.ev === "time") {
      P.cur = Date.now() - P.seekAt < 1500 ? P.cur : (m.cur || 0);
      P.dur = m.dur || P.dur; P.buf = m.buf || 0;
      drawProgress();
      if (P.state === 1 && P.v && Date.now() - P.lastSave > 5000) { P.lastSave = Date.now(); saveProgress(P.v.id, P.cur, P.dur); }
    } else if (m.ev === "error") {
      if (playerEl.hidden) return;
      onError(m.code);
      if (m.code === "api") resetFrame();   // the API script never loaded in that frame
    } else if (m.ev === "blocked") {
      if (playerEl.hidden) return;
      P.blocked = true; $("playerSpinner").hidden = true;
      playerMsg("กด OK เพื่อเริ่มเล่น", "ทีวีนี้ไม่อนุญาตให้เล่นอัตโนมัติ");
    }
  });

  function playerNote(text, isErr, ms) {
    var n = P.shorts ? $("sideNote") : $("osdNote");
    $("osdNote").textContent = ""; $("sideNote").textContent = "";
    clearTimeout(P.noteTimer);
    if (!text) return;
    n.textContent = text; n.classList.toggle("err", !!isErr);
    if (!P.shorts && !playerEl.hidden) osdShow();
    if (ms) P.noteTimer = setTimeout(function () { n.textContent = ""; }, ms);
  }
  function playerMsg(text, small) { playerNote(text ? text + (small ? " · " + small : "") : "", true, 0); }
  function upcoming() {
    var seen = {}; seen[P.v.id] = 1;
    return P.queue.slice(P.qi + 1).concat(P.related).filter(function (v) {
      if (!v || !v.id || seen[v.id]) return false; seen[v.id] = 1; return true;
    }).slice(0, 20);
  }
  function drawUpnext() {
    // rebuilt when related videos arrive: keep the user on the tile they had
    var track = $("upnextTrack");
    var had = focused && track.contains(focused);
    var oldId = had && focused._v ? focused._v.id : null;
    var oldIdx = had ? Array.prototype.indexOf.call(track.children, focused.closest(".tile")) : -1;
    track.innerHTML = ""; track.style.transform = "";
    var items = upcoming(), ctx = { key: "upnext", title: "ถัดไป", items: items };
    items.forEach(function (v) { track.appendChild(makeTile(v, ctx)); });
    hydrate(track);
    if (!had) return;
    var t = oldId ? Array.prototype.find.call(track.children, function (x) { return x._v && x._v.id === oldId; }) : null;
    if (!t && track.children.length) t = track.children[Math.min(Math.max(oldIdx, 0), track.children.length - 1)];
    if (t) setFocus(t); else setFocus(findFk(playerEl, "osd:toggle"), { noScroll: true });
  }
  function drawButtons() {
    var l = $("btnLater"), s = $("btnSub");
    l.textContent = isLater(P.v.id) ? "✓ ดูภายหลัง" : "+ ดูภายหลัง"; l.classList.toggle("on", isLater(P.v.id));
    s.textContent = isSub(P.v.channel) ? "✓ ติดตามแล้ว" : "ติดตาม"; s.classList.toggle("on", isSub(P.v.channel));
    s.hidden = !P.v.channel;
  }
  function drawProgress() {
    var d = P.dur || 0, c = Math.min(P.cur || 0, d || 0), pct = d ? c / d * 100 : 0;
    // live streams arrive with no length; YouTube then reports a duration that
    // grows with the stream, so show "live" rather than a bar that is always full
    var live = P.v && !sec(P.v) && d > 0 && d - c < 60;
    $("progressFill").style.width = (live ? 100 : pct) + "%";
    $("progressKnob").style.left = (live ? 100 : pct) + "%";
    $("progressBuf").style.width = Math.min(100, (P.buf || 0) * 100) + "%";
    $("timeCur").textContent = live ? "● สด" : (fmtDur(c) || "0:00");
    $("timeDur").textContent = live ? "ถ่ายทอดสด" : (fmtDur(d) || (P.v && P.v.dur) || "0:00");
  }
  function setPlayIcon(playing) {
    // <svg> has no .hidden property, so toggle the attribute ([hidden] is display:none)
    function vis(s, show) { if (show) s.removeAttribute("hidden"); else s.setAttribute("hidden", ""); }
    Array.prototype.forEach.call(playerEl.querySelectorAll(".i-play"), function (s) { vis(s, !playing); });
    Array.prototype.forEach.call(playerEl.querySelectorAll(".i-pause"), function (s) { vis(s, playing); });
  }

  function play(v, o) {
    o = o || {};
    P.gen++;
    ensureFrame();
    if (playerEl.hidden) {
      P.ret = o.ret || focused;
      playerEl.hidden = false;
      stage.classList.remove("rail-open");
      clearTimeout(toastTimer); $("toast").classList.remove("show");   // nothing may sit over the video
    }
    if (P.v && P.v.id !== v.id && P.started) saveProgress(P.v.id, P.cur, P.dur);
    clearTimeout(P.errTimer);
    P.v = v; P.queue = o.queue || P.queue || [v]; P.qi = o.index != null ? o.index : Math.max(0, P.queue.indexOf(v));
    P.state = -1; P.cur = 0; P.dur = sec(v); P.buf = 0; P.started = false; P.blocked = false; P.wasPlaying = false;
    P.shorts = !!o.shorts;
    playerEl.classList.toggle("shorts", P.shorts);
    $("osdTitle").textContent = v.title || ""; $("osdChannel").textContent = v.channel || "";
    $("shortTitle").textContent = v.title || ""; $("shortCh").textContent = v.channel || "";
    playerMsg(""); $("playerSpinner").hidden = false;
    drawProgress(); drawButtons(); setPlayIcon(true);
    var start = o.start;
    if (start == null && !P.shorts) {
      var p = progressOf(v.id);
      if (p && p.t > 30 && p.t < p.d - 30) { start = p.t; toast("เล่นต่อจาก " + fmtDur(p.t)); }
    }
    pcmd({ cmd: "load", id: v.id, start: start || 0 });
    if (start) P.cur = start;
    if (P.shorts) { playerEl.classList.remove("osd", "deep"); setFocus(findFk(playerEl, "osd:stoggle"), { noScroll: true }); }
    else { osdShow("osd:toggle"); }
    P.related = [];
    drawUpnext();
    if (!P.shorts) {
      var id = v.id;
      api.related(v).then(function (r) { if (P.v && P.v.id === id && !playerEl.hidden) { P.related = r; drawUpnext(); } });
    }
  }
  function playFromTile(tile) {
    var v = tile._v, ctx = tile._ctx || {}, items = ctx.items && ctx.items.length ? ctx.items : [v];
    var idx = Math.max(0, items.map(function (x) { return x.id; }).indexOf(v.id));
    if (ctx.key === "upnext") {
      var qi = P.queue.map(function (x) { return x.id; }).indexOf(v.id);
      if (qi < 0) { P.queue.splice(P.qi + 1, 0, v); qi = P.qi + 1; }
      play(v, { queue: P.queue, index: qi });
      return;
    }
    // the player keeps its own copy: inserting into it must not touch the shelf
    // or the cached search results the shelf came from
    play(v, { queue: items.slice(), index: idx, shorts: !!ctx.shorts, ret: tile });
  }
  function onState(s) {
    P.state = s;
    $("playerSpinner").hidden = true;      // from here on YouTube draws its own buffering state
    toAndroid(s === 1 || s === 3 ? "keepon:1" : "keepon:0");
    if (s === 1) P.wasPlaying = true;
    else if (s === 2 || s === 0) P.wasPlaying = false;
    if (s === 1) {
      if (P.blocked || $("osdNote").classList.contains("err")) playerMsg("");
      P.blocked = false; setPlayIcon(true);
      if (!P.started) { P.started = true; pushHistory(P.v); }
      armOsd();
    } else if (s === 2) {
      setPlayIcon(false);
      if (!P.shorts && !playerEl.classList.contains("osd")) osdShow("osd:toggle");
      clearTimeout(P.osdTimer);
    } else if (s === 0) {
      setPlayIcon(false);
      saveProgress(P.v.id, P.dur, P.dur);
      if (P.shorts) shortsStep(1);
      else if (settings.autoplay) {
        var n = upcoming()[0], gen = P.gen;
        if (n) {
          toast("ถัดไป: " + n.title);
          setTimeout(function () { if (gen === P.gen && P.state === 0 && !playerEl.hidden && $("modal").hidden) next(); }, 1500);
        } else osdShow("osd:toggle");
      } else osdShow("osd:toggle");
    }
  }
  var ERRORS = {
    "2": "รหัสวิดีโอไม่ถูกต้อง",
    "5": "เครื่องเล่นของทีวีเล่นวิดีโอนี้ไม่ได้",
    "100": "ไม่พบวิดีโอ หรือเป็นวิดีโอส่วนตัว",
    "101": "เจ้าของวิดีโอไม่อนุญาตให้เล่นนอก YouTube",
    "150": "เจ้าของวิดีโอไม่อนุญาตให้เล่นนอก YouTube",
    "152": "YouTube ไม่รับที่มาของเครื่องเล่นนี้",
    "153": "YouTube ไม่ได้รับ Referer — เครื่องเล่นต้องโหลดจาก https://swumkt.org",
    "api": "โหลด YouTube Player API ไม่ได้"
  };
  function onError(code) {
    $("playerSpinner").hidden = true;
    // Shorts can always move on: shortsStep fetches more when the queue runs out
    var canSkip = P.shorts || !!upcoming()[0], gen = P.gen;
    playerMsg(ERRORS[String(code)] || ("เล่นไม่ได้ (รหัส " + code + ")"), canSkip ? "จะเล่นคลิปถัดไปใน 4 วินาที" : "");
    if (canSkip) P.errTimer = setTimeout(function () {
      if (gen !== P.gen || playerEl.hidden || !$("modal").hidden) return;
      if (P.shorts) shortsStep(1); else next();
    }, 4000);
  }
  function osdShow(fk) {
    if (P.shorts || playerEl.hidden) return;
    playerEl.classList.add("osd");
    var t = (fk && findFk(playerEl, fk))
      || ((!focused || !playerEl.contains(focused)) ? findFk(playerEl, "osd:toggle") : null);
    if (t) setFocus(t, { noScroll: true });    // setFocus parks it in modalReturn while a dialog is open
    armOsd();
  }
  function osdHide() { playerEl.classList.remove("osd", "deep"); }
  function armOsd() {
    clearTimeout(P.osdTimer);
    if (P.shorts) return;
    P.osdTimer = setTimeout(function () { if (P.state === 1) osdHide(); }, playerEl.classList.contains("deep") ? 10000 : 5000);
  }
  function togglePlay() {
    // while buffering (3) the video counts as playing if it was playing before
    var playing = P.state === 1 || (P.state === 3 && P.wasPlaying);
    if (P.blocked || !playing) pcmd({ cmd: "play" }); else pcmd({ cmd: "pause" });
  }
  function seekBy(d) {
    var dur = P.dur || sec(P.v) || 0;
    var t = Math.max(0, P.cur + d); if (dur) t = Math.min(dur - 1, t);
    P.cur = t; P.seekAt = Date.now();
    pcmd({ cmd: "seek", t: t });
    drawProgress();
  }
  function seekStep() {
    var now = Date.now();
    P.seekRun = now - P.seekAt < 700 ? P.seekRun + 1 : 0;
    return [10, 10, 20, 30, 30, 60][Math.min(P.seekRun, 5)];
  }
  function next() {
    var n = upcoming()[0]; if (!n) { toast("ไม่มีคลิปถัดไป"); return; }
    var qi = P.queue.map(function (x) { return x.id; }).indexOf(n.id);
    if (qi < 0) { P.queue.splice(P.qi + 1, 0, n); qi = P.qi + 1; }
    play(n, { queue: P.queue, index: qi });
  }
  function prev() {
    if (P.cur > 5 || P.qi <= 0) { seekBy(-P.cur); return; }
    play(P.queue[P.qi - 1], { queue: P.queue, index: P.qi - 1 });
  }
  function shortsStep(d) {
    var i = P.qi + d;
    if (i < 0) { toast("นี่คือคลิปแรก"); return; }
    if (i >= P.queue.length) {
      if (P.shortsLoading) return;              // one fetch at a time; extra Down presses wait
      var gen = P.gen, q = P.queue;
      P.shortsLoading = true;
      api.shorts().then(function (more) {
        P.shortsLoading = false;
        if (gen !== P.gen || playerEl.hidden || !P.shorts) return;   // closed or moved on meanwhile
        var seen = {}; q.forEach(function (x) { seen[x.id] = 1; });
        var add = (more || []).filter(function (x) { return !seen[x.id]; });
        if (!add.length) { toast("หมด Shorts แล้ว"); return; }
        P.queue = q.concat(add); play(P.queue[i], { queue: P.queue, index: i, shorts: true });
      }, function () { P.shortsLoading = false; });
      return;
    }
    play(P.queue[i], { queue: P.queue, index: i, shorts: true });
  }
  function closePlayer() {
    P.gen++;
    if (P.v && P.started) saveProgress(P.v.id, P.cur, P.dur);
    clearTimeout(P.osdTimer); clearTimeout(P.errTimer);
    pcmd({ cmd: "stop" });
    toAndroid("keepon:0");
    playerEl.hidden = true; osdHide(); playerEl.classList.remove("shorts");
    playerMsg(""); $("playerSpinner").hidden = true;
    P.shorts = false; P.shortsLoading = false;
    if (current === "home") refreshContinue();
    var r = P.ret; P.ret = null;
    if (r && isVisible(r)) setFocus(r); else focusDefault();
  }
  var shortsReq = 0;
  function openShortsFeed() {
    toast("กำลังโหลด Shorts…");
    var from = focused, view = current, gen = P.gen, tok = ++shortsReq;
    api.shorts().then(function (list) {
      // drop it if the user started something else, opened a dialog or changed screens meanwhile
      if (tok !== shortsReq || gen !== P.gen || !playerEl.hidden || layer() !== "main" || current !== view) return;
      if (!list || !list.length) { toast("โหลด Shorts ไม่สำเร็จ ลองใหม่อีกครั้ง"); return; }
      play(list[0], { queue: list, index: 0, shorts: true, ret: from && isVisible(from) ? from : null });
    }, function () { if (tok === shortsReq) toast("โหลด Shorts ไม่สำเร็จ ลองใหม่อีกครั้ง"); });
  }
  function playerAction(act) {
    switch (act) {
      case "toggle": togglePlay(); break;
      case "rew": seekBy(-10); break;
      case "ff": seekBy(10); break;
      case "next": next(); break;
      case "prev": prev(); break;
      case "seekbar": togglePlay(); break;
      case "later": toggleLater(P.v); drawButtons(); break;
      case "sub": toggleSub(P.v.channel); drawButtons(); break;
      case "channel": var ch = P.v.channel; closePlayer(); if (ch) open("channel", { name: ch }); break;
      case "sprev": shortsStep(-1); break;
      case "snext": shortsStep(1); break;
    }
  }
  function playerKey(k) {
    if (P.shorts) {
      if (k === "up") shortsStep(-1);
      else if (k === "down") shortsStep(1);
      else if (k === "enter") togglePlay();
      else if (k === "left") seekBy(-5);
      else if (k === "right") seekBy(5);
      else if (k === "back") closePlayer();
      return;
    }
    var osd = playerEl.classList.contains("osd");
    if (!osd) {
      if (k === "left" || k === "right") { seekBy(k === "left" ? -seekStep() : seekStep()); osdShow("osd:progress"); }
      else if (k === "enter" || k === "up") { if (P.blocked) togglePlay(); osdShow("osd:toggle"); }
      else if (k === "down") { osdShow(); var f = $("upnextTrack").querySelector(".f"); if (f) setFocus(f); }
      else if (k === "back") closePlayer();
      return;
    }
    if (k === "back") { osdHide(); return; }
    if (focused && focused.id === "progressBar" && (k === "left" || k === "right")) {
      seekBy(k === "left" ? -seekStep() : seekStep()); armOsd(); return;
    }
    if (k === "enter") activate(focused);
    else move(k);
    armOsd();
  }
  function mediaKey(k) {
    if (playerEl.hidden) {
      if ((k === "play" || k === "playpause") && focused && focused._v) playFromTile(focused);
      return;
    }
    if (k === "playpause") togglePlay();
    else if (k === "play") pcmd({ cmd: "play" });
    else if (k === "pause") pcmd({ cmd: "pause" });
    else if (k === "stop") closePlayer();
    else if (k === "ff") { seekBy(seekStep()); osdShow("osd:progress"); }
    else if (k === "rew") { seekBy(-seekStep()); osdShow("osd:progress"); }
    else if (k === "next" || k === "chup") { if (P.shorts) shortsStep(1); else next(); }
    else if (k === "prev" || k === "chdown") { if (P.shorts) shortsStep(-1); else prev(); }
  }

  /* ================= activation & keys ================= */
  function activate(e) {
    if (!e) return;
    if (e._act) { e._act.call(e); return; }
    if (e.classList.contains("rail-item")) { go(e.dataset.view); return; }
    if (e._v) { playFromTile(e); return; }
    if (e.dataset.act) playerAction(e.dataset.act);
  }
  var KEYCODES = {
    37: "left", 38: "up", 39: "right", 40: "down", 13: "enter", 10009: "back", 27: "back", 461: "back",
    415: "play", 19: "pause", 10252: "playpause", 179: "playpause", 413: "stop", 178: "stop",
    417: "ff", 412: "rew", 10233: "next", 176: "next", 10232: "prev", 177: "prev", 427: "chup", 428: "chdown"
  };
  var KEYNAMES = {
    ArrowLeft: "left", ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", Enter: "enter",
    Escape: "back", GoBack: "back", BrowserBack: "back", MediaPlayPause: "playpause", MediaPlay: "play",
    MediaPause: "pause", MediaStop: "stop", MediaFastForward: "ff", MediaRewind: "rew",
    MediaTrackNext: "next", MediaTrackPrevious: "prev", ChannelUp: "chup", ChannelDown: "chdown"
  };
  var MEDIA = { play: 1, pause: 1, playpause: 1, stop: 1, ff: 1, rew: 1, next: 1, prev: 1, chup: 1, chdown: 1 };
  function searchActive() { return layer() === "main" && current === "search" && focused && !focused.closest("#rail"); }
  function keyOf(e) {
    var k = KEYNAMES[e.key] || KEYCODES[e.keyCode];
    if (k) return k;
    if (e.keyCode === 8) return (searchActive() && S.q) ? "bksp" : "back";
    if (e.keyCode === 32 && !searchActive()) return "playpause";
    return null;
  }
  function handle(k) {
    // Android: Back that hid the soft keyboard never reached the page, so the
    // input can still hold DOM focus here; get out of it first
    if (nativeOpen() && (k === "back" || k === "up" || k === "down")) { closeNative(false); if (k === "back") return; }
    if (MEDIA[k]) { if (layer() === "modal") closeModal(); mediaKey(k); return; }
    var L = layer();
    if (L === "modal") {
      // Android TV: pressing Back repeatedly must end at the TV home screen,
      // so Back on the exit dialog leaves instead of toggling it shut
      if (k === "back" && modalIsExit && SHELL === "android") exitApp();
      else if (k === "back") closeModal(); else if (k === "enter") activate(focused); else move(k);
      return;
    }
    if (L === "player") { playerKey(k); return; }
    if (k === "back") goBack();
    else if (k === "enter") activate(focused);
    else if (k === "bksp") backspace();
    else move(k);
  }
  /* long-press OK on a video tile opens its options; a short press plays it */
  var hold = null, lastMove = 0;
  document.addEventListener("keydown", function (e) {
    if (document.activeElement === nativeInput) { nativeKey(e); return; }
    var k = keyOf(e);
    if (!k) {
      if (searchActive() && e.key && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); typeChar(e.key); }
      return;
    }
    e.preventDefault();
    var L = layer();
    // options menu only outside the player: a dialog over the video would cover it
    if (k === "enter" && focused && focused._v && L === "main") {
      if (e.repeat || hold) return;
      var t = focused;
      hold = { el: t, fired: false, timer: setTimeout(function () { if (hold) { hold.fired = true; openOptions(t); } }, 650) };
      return;
    }
    if (e.repeat && (k === "enter" || k === "back")) return;   // a held Back must not walk out of the app
    if (e.repeat && (k === "up" || k === "down" || k === "left" || k === "right")) {
      var now = Date.now(); if (now - lastMove < 110) return; lastMove = now;
    }
    handle(k);
  });
  document.addEventListener("keyup", function (e) {
    if (!hold || (keyOf(e) !== "enter")) return;
    var h = hold; hold = null; clearTimeout(h.timer);
    if (!h.fired && focused === h.el) activate(h.el);
  });
  /* hooks for app shells (Android WebView: Back and media keys never reach the page) */
  window.meekinBack = function () { handle("back"); return true; };
  window.meekinKey = function (name) { var k = KEYNAMES[name] || name; if (k) handle(k); return true; };
  // the app went to the background: YouTube's terms forbid background playback
  window.meekinPause = function () { if (!playerEl.hidden) pcmd({ cmd: "pause" }); return true; };

  /* pointer (Samsung Smart Remote pointer, mouse when testing on a PC) */
  // browsers also fire hover events when content slides under a resting
  // pointer; only a pointer that actually moved should steal focus
  stage.addEventListener("mousemove", function (e) {
    if (!e.movementX && !e.movementY) return;
    var f = e.target.closest && e.target.closest(".f");
    if (f && f !== focused && candidates().indexOf(f) >= 0) setFocus(f, { noScroll: true });
  });
  stage.addEventListener("click", function (e) {
    var f = e.target.closest && e.target.closest(".f");
    if (f && candidates().indexOf(f) >= 0) { setFocus(f, { noScroll: true }); activate(f); return; }
    if (layer() === "player" && (e.target.id === "playerShield" || e.target.id === "ytHost")) {
      if (playerEl.classList.contains("osd")) osdHide(); else osdShow("osd:toggle");
    }
  });
  stage.addEventListener("contextmenu", function (e) {
    var f = e.target.closest && e.target.closest(".tile");
    if (f && f._v && layer() === "main") { e.preventDefault(); openOptions(f); }
  });
  var wheelAt = 0;
  stage.addEventListener("wheel", function (e) {
    var now = Date.now(); if (now - wheelAt < 180) return; wheelAt = now;
    handle(e.deltaY > 0 ? "down" : "up");
  }, { passive: true });

  /* the YouTube frame must never hold keyboard focus */
  setInterval(function () {
    var a = document.activeElement;
    if (a && a.tagName === "IFRAME") { try { a.blur(); window.focus(); } catch (e) {} }
    fit();   // some WebViews resize after load without a resize event
  }, 1000);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && !playerEl.hidden) pcmd({ cmd: "pause" });
  });

  /* ================= boot ================= */
  if (SHELL === "tizen") {
    try {
      var want = ["MediaPlayPause", "MediaPlay", "MediaPause", "MediaStop", "MediaRewind", "MediaFastForward",
        "MediaTrackPrevious", "MediaTrackNext", "ChannelUp", "ChannelDown"];
      var sup = window.tizen.tvinputdevice.getSupportedKeys().map(function (x) { return x.name; });
      var list = want.filter(function (n) { return sup.indexOf(n) >= 0; });
      if (window.tizen.tvinputdevice.registerKeyBatch) window.tizen.tvinputdevice.registerKeyBatch(list);
      else list.forEach(function (n) { window.tizen.tvinputdevice.registerKey(n); });
    } catch (e) {}
  }
  document.documentElement.setAttribute("data-shell", SHELL);
  showView("home");
  var splashOff = function () { var s = $("splash"); if (s && !s.classList.contains("gone")) { s.classList.add("gone"); setTimeout(function () { s.remove(); }, 500); } };
  setTimeout(splashOff, 2500);
  var firstRow = views.home.querySelector(".row");
  if (firstRow && firstRow._state === "done") setTimeout(splashOff, 400);
  else {
    var poll = setInterval(function () {
      var r = views.home && views.home.querySelector(".row");
      if (!r || r._state === "done") { clearInterval(poll); splashOff(); }
    }, 200);
  }
  // let tests and shells see what's going on
  window.meekinTV = { version: VERSION, shell: SHELL, playerUrl: PLAYER_URL, api: api, store: store };
})();
