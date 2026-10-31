/* meekin Music — YouTube-Music-style front-end (music/ytm/).
   Draws UI only; search, recommendations, library and the player are ../core.js (window.MeekinMusic).

   Player rules kept here (YouTube API Services terms):
   - player.attach(#ph) once; #ph is never moved in the DOM. Mini player <-> "now playing"
     only change #ph's CSS (body.np-open), so playback never reloads.
   - #ph stays >= 200x200 and on top of everything (z-index 70) while a song is loaded;
     menus, dialogs and toasts are placed so they never overlap it.
   - no background play (core.js pauses on visibilitychange); see the note in settings. */
(function () {
  "use strict";
  const M = window.MeekinMusic;
  const view = document.getElementById("view");
  if (!M) { view.innerHTML = '<div class="state"><h3>โหลดระบบเพลงไม่สำเร็จ</h3><p>ลองรีเฟรชหน้านี้อีกครั้ง</p></div>'; return; }
  const { api, recs, lib, player, util } = M;
  const esc = util.esc;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const body = document.body;
  const topEl = $("#top"), host = $("#ph"), sheet = $("#sheet"), scrim = $("#scrim"), toastEl = $("#toast");

  player.attach(host);   // once, never again

  /* ---------------- helpers ---------------- */
  const ic = (n, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>';
  const fmt = s => util.fmtDur(s) || "0:00";
  // keep these two in step with the media queries in app.css
  const isDesk = () => window.matchMedia("(min-width:900px) and (min-height:560px)").matches;
  const isSideDock = () => window.matchMedia("(orientation:landscape) and (max-height:559.98px)").matches;   // player dock = column on the right
  const initial = n => esc((String(n || "?").trim().charAt(0) || "?").toUpperCase());
  const plural = n => n + " เพลง";
  function img(src, alt) { return src ? '<img src="' + esc(src) + '" alt="' + esc(alt || "") + '" loading="lazy" decoding="async">' : ""; }
  const EQ = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';

  let navTok = 0;                 // bumps on every screen change; late async results check it
  let route = "";                 // current route string, e.g. "artist/UC..."
  let npOpen = false, sheetOpen = false, sheetHandler = null;
  let pageCtx = {};               // data the current page's buttons act on
  let pendingY = 0;               // scroll position to restore once content is tall enough
  let artistqFix = null;          // { from, to }: an artistq route resolved while an overlay entry was on top

  // song lists rendered on screen: key -> { songs, ctx }. "p…" = page lists, "r…" = related panel
  const LISTS = new Map(); let listSeq = 0;
  function regList(songs, ctx, kind) { const k = (kind || "p") + (++listSeq); LISTS.set(k, { songs: songs || [], ctx: ctx || {} }); return k; }
  function dropLists(kind) { for (const k of Array.from(LISTS.keys())) if (k.charAt(0) === kind) LISTS.delete(k); }
  const MIXES = new Map();

  /* ---------------- markup builders ---------------- */
  function rowHTML(s, k, i, o) {
    o = o || {};
    return '<div class="row" role="button" tabindex="0" data-k="' + k + '" data-i="' + i + '" data-id="' + esc(s.id) + '">' +
      (o.rank ? '<div class="rank">' + (i + 1) + '</div>' : "") +
      '<div class="th">' + img(s.thumb || util.thumb(s.id)) + EQ + '</div>' +
      '<div class="meta"><div class="t">' + esc(s.title) + '</div><div class="a">' + esc(s.artist) +
      (o.noDur || !s.dur ? "" : " · " + esc(s.dur)) + '</div></div>' +
      '<button class="more" data-more aria-label="ตัวเลือกเพิ่มเติม">' + ic("more") + '</button></div>';
  }
  function cardHTML(s, k, i) {
    return '<div class="card" role="button" tabindex="0" data-k="' + k + '" data-i="' + i + '" data-id="' + esc(s.id) + '">' +
      '<div class="cv sq">' + img(s.thumb || util.thumb(s.id)) + EQ + '</div>' +
      '<div class="ct"><div class="meta"><div class="t">' + esc(s.title) + '</div><div class="a">' + esc(s.artist) + '</div></div>' +
      '<button class="more" data-more aria-label="ตัวเลือกเพิ่มเติม">' + ic("more") + '</button></div></div>';
  }
  function mixHTML(m, key) {
    return '<div class="card mix" role="button" tabindex="0" data-mix="' + esc(key) + '">' +
      '<div class="cv sq">' + img(m.thumb) + '<div class="mixlbl"><small>มิกซ์</small>' + esc(m.title.replace(/^มิกซ์ของ\s*/, "")) + '</div></div>' +
      '<div class="ct"><div class="meta"><div class="t">' + esc(m.title) + '</div><div class="a">' + esc(m.subtitle || (m.songs.length + " เพลง")) + '</div></div></div></div>';
  }
  function avHTML(a) {
    // a.id may be the uploader (e.g. a label) rather than the artist: then look the picture up by name
    const own = a.id && !(a.seed && a.seed.channel && !sameArtist(a.seed.channel, a.name));
    const lazy = a.avatar ? "" : own ? ' data-aid="' + esc(a.id) + '"' : ' data-aname="' + esc(a.name) + '"';
    return '<div class="av" role="button" tabindex="0" data-artist="' + esc(a.id || "") + '" data-name="' + esc(a.name) + '"' +
      (a.seed && a.seed.channel ? ' data-ch="' + esc(a.seed.channel) + '"' : "") + lazy + '>' +
      '<div class="ph">' + (a.avatar ? img(a.avatar) : initial(a.name)) + '</div><div class="nm">' + esc(a.name) + '</div>' +
      (a.subs ? '<div class="sb">ผู้ติดตาม ' + esc(a.subs) + '</div>' : "") + '</div>';
  }
  function albumHTML(p, chart) {
    return '<div class="card alb" role="button" tabindex="0" data-go="' + esc(mk("playlist", p.id, chart ? "chart" : "")) + '">' +
      '<div class="cv sq">' + img(p.thumb) + '</div>' +
      '<div class="ct"><div class="meta"><div class="t">' + esc(p.title) + '</div><div class="a">' + esc([p.owner, p.count ? p.count + " เพลง" : ""].filter(Boolean).join(" · ")) + '</div></div></div></div>';
  }
  function tileHTML(g) {
    return '<button class="tile" style="--c:' + esc(g.color) + '" data-go="' + esc(mk("genre", g.key)) + '">' + esc(g.name) + '</button>';
  }
  function skRows(n) { let h = ""; for (let i = 0; i < n; i++) h += '<div class="sk-row"><div class="sk th"></div><div class="l"><div class="sk sk-line" style="width:70%"></div><div class="sk sk-line" style="width:40%"></div></div></div>'; return h; }
  function skCards(n, w) { let h = ""; for (let i = 0; i < n; i++) h += '<div class="sk-card"' + (w ? ' style="width:' + w + 'px"' : "") + '><div class="sk cv"' + (w ? ' style="width:' + w + 'px;height:' + w + 'px"' : "") + '></div><div class="sk sk-line" style="width:85%;margin-top:10px"></div><div class="sk sk-line" style="width:55%"></div></div>'; return h; }
  function skCircles(n) { let h = ""; for (let i = 0; i < n; i++) h += '<div class="av"><div class="sk ph" style="background-size:200% 100%"></div><div class="sk sk-line" style="width:70%;margin:10px auto 0"></div></div>'; return h; }
  function stateHTML(icon, title, text, btn) {
    return '<div class="state">' + ic(icon) + '<h3>' + esc(title) + '</h3>' + (text ? '<p>' + esc(text) + '</p>' : "") + (btn || "") + '</div>';
  }
  const retryBtn = '<button class="btn pri" data-act="retry">' + ic("repeat") + ' ลองใหม่</button>';
  function secHTML(o) {
    return '<section class="sec"' + (o.id ? ' id="' + o.id + '"' : "") + (o.key ? ' data-sec="' + esc(o.key) + '"' : "") + '>' +
      '<div class="sec-h"><div class="ttl">' + (o.sub ? '<div class="sec-sub">' + esc(o.sub) + '</div>' : "") + '<h2>' + esc(o.title) + '</h2></div>' +
      (o.more || "") + (o.arrows ? '<div class="arrows"><button class="ic-btn" data-act="scrl" data-dir="-1" aria-label="เลื่อนซ้าย">' + ic("chev-left") + '</button><button class="ic-btn" data-act="scrl" data-dir="1" aria-label="เลื่อนขวา">' + ic("chev-right") + '</button></div>' : "") +
      '</div><div class="sec-b">' + (o.body || "") + '</div></section>';
  }
  function colHeader(o) {
    // o: { cover (html), title, sub, k (list key), extra (html), iconCover }
    return '<div class="col-h"><div class="col-cv' + (o.iconCover ? " icon" : "") + '">' + o.cover + '</div>' +
      '<div class="col-info"><h1>' + esc(o.title) + '</h1>' + (o.sub ? '<div class="col-sub">' + esc(o.sub) + '</div>' : "") +
      '<div class="btns">' + (o.k ? '<button class="btn pri" data-act="playall" data-k="' + o.k + '">' + ic("play") + ' เล่น</button>' +
      '<button class="btn" data-act="shuffleall" data-k="' + o.k + '">' + ic("shuffle") + ' สุ่ม</button>' : "") + (o.extra || "") + '</div></div></div>';
  }
  function mosaic(songs) {
    const s = (songs || []).filter(Boolean);
    if (!s.length) return "";
    if (s.length < 4) return '<div class="sq" style="width:100%;height:100%">' + img(s[0].thumb || util.thumb(s[0].id)) + '</div>';
    return '<div class="mosaic">' + s.slice(0, 4).map(x => '<div>' + img(x.thumb || util.thumb(x.id)) + '</div>').join("") + '</div>';
  }

  /* ---------------- routes & history ---------------- */
  function mk(name) {
    const a = Array.prototype.slice.call(arguments, 1).map(x => (x == null ? "" : String(x)));
    while (a.length && !a[a.length - 1]) a.pop();
    return [name].concat(a.map(encodeURIComponent)).join("/");
  }
  function parse(r) {
    const p = String(r || "home").split("/");
    return { name: p[0] || "home", args: p.slice(1).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } }) };
  }
  const hashRoute = () => location.hash.replace(/^#\/?/, "") || "home";
  const urlFor = r => location.pathname + location.search + "#/" + r;
  const cur = () => (history.state && history.state.app ? history.state : null);
  function overlayDepth() { const s = cur(); return s ? (s.np ? 1 : 0) + (s.sh ? 1 : 0) : 0; }
  function saveScroll() { const s = cur(); if (s && !s.np && !s.sh) history.replaceState(Object.assign({}, s, { y: window.scrollY }), ""); }

  let popWait = [];
  function popBack(n) {
    return new Promise(res => {
      let done = false;
      const fin = () => { if (!done) { done = true; res(); } };
      popWait.push(fin);
      setTimeout(fin, 600);    // in case the browser has nothing to go back to
      history.go(-(n || 1));
    });
  }
  const unwind = () => { const d = overlayDepth(); return d ? popBack(d) : Promise.resolve(); };

  function go(r, opts) {
    opts = opts || {};
    if (overlayDepth()) { unwind().then(() => go(r, opts)); return; }
    if (!opts.replace && r === route) return;     // already here: unwinding closed "now playing" / the menu
    const c = cur();
    if (opts.replace) history.replaceState({ app: 1, r, y: 0, d: c ? c.d || 0 : 0 }, "", urlFor(r));
    else { saveScroll(); history.pushState({ app: 1, r, y: 0, d: (c ? c.d || 0 : 0) + 1 }, "", urlFor(r)); }
    render(r, 0);
  }
  function goBack() {
    const c = cur();
    if (c && c.d > 0) history.back(); else go("home", { replace: true });
  }

  window.addEventListener("popstate", e => {
    const st = e.state && e.state.app ? e.state : { app: 1, r: hashRoute(), y: 0, d: 0 };
    // Forward (or history left from before a reload) onto a menu / "now playing" entry that is not on screen:
    // step back off it, so the current entry always matches what is shown (closeSheet / overlayDepth rely on it).
    // Such an entry always sits on top of the one it was opened from. popWait resolves on that next popstate.
    if ((st.sh && !sheetOpen) || (st.np && !player.current)) { history.back(); return; }
    if (!st.sh && sheetOpen) hideSheet();
    const wantNP = !!st.np && !!player.current;
    if (wantNP !== npOpen) setNP(wantNP);
    if (artistqFix && st.r === artistqFix.from && route === artistqFix.to) {
      // the artist page is already showing: just give the page entry its resolved route
      if (!st.np && !st.sh) { history.replaceState(Object.assign({}, st, { r: route }), "", urlFor(route)); artistqFix = null; }
    } else if (st.r !== route) render(st.r, st.y || 0);
    const w = popWait; popWait = []; w.forEach(f => f());
  });

  const TAB_OF = { home: "home", genre: "home", explore: "explore", new: "explore", charts: "explore", moods: "explore",
    library: "library", liked: "library", mypl: "library", history: "library" };

  function render(r, y) {
    navTok++;
    const tok = navTok;
    route = r;
    artistqFix = null;
    dropLists("p"); MIXES.clear();
    pageCtx = {};
    const { name, args } = parse(r);
    const tab = TAB_OF[name] || "";
    $$("[data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
    body.dataset.page = name;
    topEl.classList.remove("clear", "tt", "solid");
    view.innerHTML = "";
    pendingY = y || 0;
    window.scrollTo(0, 0);
    (ROUTES[name] || ROUTES.home)(args, tok);
    refreshSide();
    filled(tok);
  }
  function filled(tok) {
    markPlaying();
    if (tok !== navTok || !pendingY) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= pendingY - 4) { window.scrollTo(0, pendingY); pendingY = 0; }
  }
  function rerender() { const y = window.scrollY; render(route, y); }

  /* ---------------- top bar ---------------- */
  function topRoot() {
    topEl.innerHTML =
      '<button class="brand" data-go="home" aria-label="meekin Music หน้าแรก"><svg class="logo" aria-hidden="true"><use href="#logo"/></svg><span class="wm"><b>meekin</b> Music</span></button>' +
      '<div class="top-search d-only" role="button" tabindex="0" data-go="search">' + ic("search") + '<span>ค้นหาเพลง ศิลปิน อัลบั้ม</span></div>' +
      '<div class="top-act"><button class="ic-btn m-only" data-go="search" aria-label="ค้นหา">' + ic("search") + '</button>' +
      '<button class="ic-btn" data-go="settings" aria-label="ตั้งค่า">' + ic("gear") + '</button></div>';
  }
  function topSub(title, clear) {
    topEl.innerHTML = '<button class="ic-btn" data-act="back" aria-label="ย้อนกลับ">' + ic("back") + '</button>' +
      '<div class="top-title">' + esc(title || "") + '</div>' +
      '<div class="top-search d-only" role="button" tabindex="0" data-go="search">' + ic("search") + '<span>ค้นหาเพลง ศิลปิน อัลบั้ม</span></div>' +
      '<div class="top-act"><button class="ic-btn m-only" data-go="search" aria-label="ค้นหา">' + ic("search") + '</button>' +
      '<button class="ic-btn" data-go="settings" aria-label="ตั้งค่า">' + ic("gear") + '</button></div>';
    topEl.classList.add(clear ? "clear" : "tt");   // title shows once the page's own heading scrolls away
  }
  function setTopTitle(t) { const el = $(".top-title", topEl); if (el) el.textContent = t || ""; }
  window.addEventListener("scroll", () => {
    const lim = topEl.classList.contains("clear") ? 150 : topEl.classList.contains("tt") ? 70 : 4;
    topEl.classList.toggle("solid", window.scrollY > lim);
  }, { passive: true });

  /* ---------------- home ---------------- */
  const homeCache = {};   // section key -> { t, v } so "back" to home does not reshuffle everything
  function chipsHTML(sel) {
    return '<div class="chips" role="tablist" aria-label="อารมณ์และแนวเพลง">' + api.GENRES.map(g =>
      '<button class="chip' + (g.key === sel ? " on" : "") + '" role="tab" aria-selected="' + (g.key === sel) + '" data-act="chip" data-key="' + esc(g.key) + '">' + esc(g.name) + '</button>').join("") + '</div>';
  }
  function homeSkeleton(kind) {
    if (kind === "grid") return '<div class="qgrid">' + skRows(8) + '</div>';
    if (kind === "mixes") return '<div class="hs">' + skCards(3, 184) + '</div>';
    if (kind === "artists") return '<div class="hs">' + skCircles(5) + '</div>';
    if (kind === "genres") return '<div class="tiles">' + api.GENRES.map(tileHTML).join("") + '</div>';
    return '<div class="hs">' + skCards(5) + '</div>';
  }
  function fillSection(el, sec, data, tok) {
    if (tok !== navTok) return;
    if (!data || !data.length) { el.remove(); checkHomeEmpty(tok); return; }
    const b = $(".sec-b", el), h = $(".sec-h", el);
    let more = "";
    if (sec.kind === "grid") {
      const k = regList(data);
      b.innerHTML = '<div class="qgrid">' + data.map((s, i) => rowHTML(s, k, i, { noDur: true })).join("") + '</div>';
      more = '<button class="pill" data-act="playall" data-k="' + k + '">' + ic("play") + ' เล่นทั้งหมด</button>';
    } else if (sec.kind === "songs") {
      const k = regList(data);
      b.innerHTML = '<div class="hs">' + data.slice(0, 24).map((s, i) => cardHTML(s, k, i)).join("") + '</div>';
      if (sec.playlist) more = '<button class="pill" data-go="' + esc(mk("playlist", sec.playlist, "chart")) + '">ดูทั้งหมด</button>';
    } else if (sec.kind === "mixes") {
      b.innerHTML = '<div class="hs">' + data.map((m, i) => { const key = sec.key + i; MIXES.set(key, m); return mixHTML(m, key); }).join("") + '</div>';
    } else if (sec.kind === "artists") {
      b.innerHTML = '<div class="hs">' + data.map(avHTML).join("") + '</div>';
      observeAvatars(b);
    } else if (sec.kind === "genres") {
      b.innerHTML = '<div class="tiles">' + data.map(tileHTML).join("") + '</div>';
      more = '<button class="pill" data-go="moods">ดูทั้งหมด</button>';
    } else if (sec.kind === "albums") {
      b.innerHTML = '<div class="hs">' + data.map(p => albumHTML(p)).join("") + '</div>';
    }
    if (more) h.insertAdjacentHTML("beforeend", more);
    if (sec.kind !== "grid" || isDesk()) h.insertAdjacentHTML("beforeend", '<div class="arrows"><button class="ic-btn" data-act="scrl" data-dir="-1" aria-label="เลื่อนซ้าย">' + ic("chev-left") + '</button><button class="ic-btn" data-act="scrl" data-dir="1" aria-label="เลื่อนขวา">' + ic("chev-right") + '</button></div>');
    filled(tok);
  }
  function checkHomeEmpty(tok) {
    const box = $("#secs");
    if (!box || tok !== navTok) return;
    if (!box.querySelector(".sec")) box.innerHTML = stateHTML("note", "โหลดเพลงไม่สำเร็จ", "ตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่อีกครั้ง", retryBtn);
  }
  const ROUTES = {};
  ROUTES.home = (args, tok) => {
    topRoot();
    view.innerHTML = '<div class="page">' + chipsHTML(null) + '<div id="secs"></div></div>';
    const box = $("#secs");
    const secs = recs.home();
    pageCtx.retry = () => { Object.keys(homeCache).forEach(k => delete homeCache[k]); rerender(); };
    secs.forEach(sec => {
      box.insertAdjacentHTML("beforeend", secHTML({ key: sec.key, title: sec.title, sub: sec.subtitle, body: homeSkeleton(sec.kind) }));
      const el = box.lastElementChild;
      const c = homeCache[sec.key];
      if (c && Date.now() - c.t < 600000) { fillSection(el, sec, c.v, tok); return; }
      Promise.resolve().then(sec.load).then(v => {
        if (v && v.length) homeCache[sec.key] = { t: Date.now(), v };
        fillSection(el, sec, v, tok);
      }, () => fillSection(el, sec, null, tok));
    });
  };

  /* ---------------- genre (chip / tile) ---------------- */
  ROUTES.genre = (args, tok) => {
    const g = api.GENRES.find(x => x.key === args[0]);
    if (!g) { ROUTES.home([], tok); return; }
    topRoot();
    view.innerHTML = '<div class="page">' + chipsHTML(g.key) +
      '<div class="genre-band" style="--c:' + esc(g.color) + '"><h1>' + esc(g.name) + '</h1><div class="btns" id="gBtns"></div></div>' +
      '<div class="list" id="gList">' + skRows(10) + '</div></div>';
    const chip = $(".chip.on"); if (chip) chip.scrollIntoView({ inline: "center", block: "nearest" });
    pageCtx.retry = rerender;
    api.genre(g.key).then(list => {
      if (tok !== navTok) return;
      const box = $("#gList");
      if (!list || !list.length) { box.innerHTML = stateHTML("note", list ? "ไม่พบเพลงในหมวดนี้" : "โหลดเพลงไม่สำเร็จ", list ? "" : "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", list ? "" : retryBtn); return; }
      const k = regList(list);
      $("#gBtns").innerHTML = '<button class="btn pri" data-act="playall" data-k="' + k + '">' + ic("play") + ' เล่น</button><button class="btn" data-act="shuffleall" data-k="' + k + '">' + ic("shuffle") + '</button>';
      box.innerHTML = list.map((s, i) => rowHTML(s, k, i)).join("");
      filled(tok);
    }, () => { if (tok === navTok) $("#gList").innerHTML = stateHTML("note", "โหลดเพลงไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); });
  };

  /* ---------------- explore ---------------- */
  ROUTES.explore = (args, tok) => {
    topRoot();
    view.innerHTML = '<div class="page"><h1 class="pg-title">สำรวจ</h1><div class="ex-btns">' +
      '<button class="ex-b" data-go="new">' + ic("spark") + '<span>เพลงใหม่</span></button>' +
      '<button class="ex-b" data-go="charts">' + ic("chart") + '<span>ชาร์ต</span></button>' +
      '<button class="ex-b" data-go="moods">' + ic("mood") + '<span>อารมณ์และแนวเพลง</span></button></div>' +
      secHTML({ id: "exNew", title: "เพลงใหม่", sub: "มาแรงสัปดาห์นี้", body: '<div class="hs">' + skCards(5) + '</div>' }) +
      secHTML({ id: "exChart", title: "ชาร์ตเพลงฮิตในไทย", sub: "Top 100 ประจำสัปดาห์", body: '<div class="qgrid">' + skRows(8) + '</div>' }) +
      secHTML({ id: "exMoods", title: "อารมณ์และแนวเพลง", more: '<button class="pill" data-go="moods">ดูทั้งหมด</button>', arrows: true, body: '<div class="tiles">' + api.GENRES.map(tileHTML).join("") + '</div>' }) +
      secHTML({ id: "exGlobal", title: "ชาร์ตทั่วโลก", sub: "Top 100 Global", body: '<div class="hs">' + skCards(5) + '</div>' }) + '</div>';
    const fail = id => { const el = $("#" + id); if (el && tok === navTok) $(".sec-b", el).innerHTML = '<div class="inline-err">' + ic("info") + ' โหลดไม่สำเร็จ <button class="pill" data-act="retry">ลองใหม่</button></div>'; };
    pageCtx.retry = rerender;
    api.newReleases().then(list => {
      if (tok !== navTok) return;
      if (!list || !list.length) return fail("exNew");
      const k = regList(list), el = $("#exNew");
      $(".sec-b", el).innerHTML = '<div class="hs">' + list.slice(0, 20).map((s, i) => cardHTML(s, k, i)).join("") + '</div>';
      $(".sec-h", el).insertAdjacentHTML("beforeend", '<button class="pill" data-go="new">ดูทั้งหมด</button>');
      filled(tok);
    }, () => fail("exNew"));
    api.charts("th").then(c => {
      if (tok !== navTok) return;
      if (!c || !c.songs.length) return fail("exChart");
      const list = c.songs.slice(0, 20), k = regList(c.songs), el = $("#exChart");
      $(".sec-b", el).innerHTML = '<div class="qgrid">' + list.map((s, i) => rowHTML(s, k, i, { rank: true, noDur: true })).join("") + '</div>';
      $(".sec-h", el).insertAdjacentHTML("beforeend", '<button class="pill" data-go="' + esc(mk("playlist", c.id, "chart")) + '">ดูทั้งหมด</button>');
      filled(tok);
    }, () => fail("exChart"));
    api.charts("global").then(c => {
      if (tok !== navTok) return;
      if (!c || !c.songs.length) return fail("exGlobal");
      const k = regList(c.songs), el = $("#exGlobal");
      $(".sec-b", el).innerHTML = '<div class="hs">' + c.songs.slice(0, 20).map((s, i) => cardHTML(s, k, i)).join("") + '</div>';
      $(".sec-h", el).insertAdjacentHTML("beforeend", '<button class="pill" data-go="' + esc(mk("playlist", c.id, "chart")) + '">ดูทั้งหมด</button>');
      filled(tok);
    }, () => fail("exGlobal"));
  };
  ROUTES.new = (args, tok) => {
    topSub("เพลงใหม่");
    view.innerHTML = '<div class="page"><h1 class="pg-title">เพลงใหม่</h1><div class="sec-sub pad">มิวสิกวิดีโอและเพลงใหม่ที่มาแรงในสัปดาห์นี้</div><div class="btns pad" id="nBtns" style="margin:14px 0 6px"></div><div class="list" id="nList">' + skRows(10) + '</div></div>';
    pageCtx.retry = rerender;
    api.newReleases().then(list => {
      if (tok !== navTok) return;
      if (!list || !list.length) { $("#nList").innerHTML = stateHTML("spark", "โหลดเพลงใหม่ไม่สำเร็จ", "ลองใหม่อีกครั้งในอีกสักครู่", retryBtn); return; }
      const k = regList(list);
      $("#nBtns").innerHTML = '<button class="btn pri" data-act="playall" data-k="' + k + '">' + ic("play") + ' เล่นทั้งหมด</button><button class="btn" data-act="shuffleall" data-k="' + k + '">' + ic("shuffle") + ' สุ่ม</button>';
      $("#nList").innerHTML = list.map((s, i) => rowHTML(s, k, i)).join("");
      filled(tok);
    }, () => { if (tok === navTok) $("#nList").innerHTML = stateHTML("spark", "โหลดเพลงใหม่ไม่สำเร็จ", "ลองใหม่อีกครั้งในอีกสักครู่", retryBtn); });
  };
  ROUTES.charts = (args, tok) => {
    const which = args[0] === "global" ? "global" : "th";
    topSub("ชาร์ต");
    view.innerHTML = '<div class="page"><h1 class="pg-title">ชาร์ต</h1><div class="seg">' +
      '<button class="chip' + (which === "th" ? " on" : "") + '" data-act="chart" data-w="th">ไทย</button>' +
      '<button class="chip' + (which === "global" ? " on" : "") + '" data-act="chart" data-w="global">ทั่วโลก</button></div>' +
      '<div class="btns pad" id="cBtns" style="margin:12px 0 6px"></div><div class="list" id="cList">' + skRows(12) + '</div></div>';
    pageCtx.retry = rerender;
    const fail = () => { if (tok === navTok) $("#cList").innerHTML = stateHTML("chart", "โหลดชาร์ตไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); };
    api.charts(which).then(c => {
      if (tok !== navTok) return;
      if (!c || !c.songs.length) return fail();
      const k = regList(c.songs);
      $("#cBtns").innerHTML = '<button class="btn pri" data-act="playall" data-k="' + k + '">' + ic("play") + ' เล่นทั้งหมด</button><button class="btn" data-act="shuffleall" data-k="' + k + '">' + ic("shuffle") + ' สุ่ม</button>';
      $("#cList").innerHTML = c.songs.map((s, i) => rowHTML(s, k, i, { rank: true })).join("");
      filled(tok);
    }, fail);
  };
  ROUTES.moods = () => {
    topSub("อารมณ์และแนวเพลง");
    view.innerHTML = '<div class="page"><h1 class="pg-title">อารมณ์และแนวเพลง</h1><div class="tilegrid" style="margin-top:12px">' + api.GENRES.map(tileHTML).join("") + '</div></div>';
  };

  /* ---------------- library ---------------- */
  ROUTES.library = (args, tok) => {
    topRoot();
    const hist = util.uniqSongs(lib.history.map(h => h.s)).slice(0, 15);
    const pls = lib.playlists, arts = lib.artists;
    let h = '<div class="page"><h1 class="pg-title">คลังเพลง</h1>';
    if (hist.length) {
      const k = regList(hist);
      h += secHTML({ title: "ฟังล่าสุด", more: '<button class="pill" data-go="history">ดูทั้งหมด</button>', arrows: true, body: '<div class="hs">' + hist.map((s, i) => cardHTML(s, k, i)).join("") + '</div>' });
    }
    h += '<div class="lib-list">' +
      '<div class="arow" role="button" tabindex="0" data-go="liked"><div class="ph tile-ic">' + ic("heart-fill") + '</div><div class="meta"><div class="t">เพลงที่ถูกใจ</div><div class="a">' + plural(lib.liked.length) + '</div></div></div>' +
      '<div class="arow" role="button" tabindex="0" data-act="newpl"><div class="ph tile-ic plain">' + ic("plus") + '</div><div class="meta"><div class="t">สร้างเพลย์ลิสต์ใหม่</div></div></div>' +
      pls.map(p => '<div class="arow" role="button" tabindex="0" data-go="' + esc(mk("mypl", p.id)) + '"><div class="ph sqr plain">' + (p.songs[0] ? img(p.songs[0].thumb || util.thumb(p.songs[0].id)) : ic("note")) + '</div>' +
        '<div class="meta"><div class="t">' + esc(p.name) + '</div><div class="a">เพลย์ลิสต์ · ' + plural(p.songs.length) + '</div></div>' +
        '<button class="more" data-plmore="' + esc(p.id) + '" aria-label="ตัวเลือกเพลย์ลิสต์">' + ic("more") + '</button></div>').join("") +
      '<div class="arow" role="button" tabindex="0" data-go="history"><div class="ph tile-ic plain">' + ic("clock") + '</div><div class="meta"><div class="t">ประวัติการฟัง</div><div class="a">' + plural(lib.history.length) + '</div></div></div>' +
      '</div>';
    h += secHTML({ title: "ศิลปินที่ติดตาม", body: arts.length ? arts.map(a => '<div class="arow" role="button" tabindex="0" data-go="' + esc(mk("artist", a.id)) + '"><div class="ph">' + (a.avatar ? img(a.avatar) : initial(a.name)) + '</div><div class="meta"><div class="t">' + esc(a.name) + '</div><div class="a">ศิลปิน</div></div></div>').join("")
      : '<p class="sec-sub pad">ยังไม่ได้ติดตามศิลปิน — กด “ติดตาม” ที่หน้าศิลปินเพื่อเก็บไว้ที่นี่</p>' });
    if (!hist.length && !lib.liked.length && !pls.length) h += stateHTML("lib", "คลังเพลงยังว่างอยู่", "เพลงที่ถูกใจ เพลย์ลิสต์ และประวัติการฟังจะแสดงที่นี่", '<button class="btn pri" data-go="home">ไปหาเพลงฟัง</button>');
    view.innerHTML = h + '</div>';
  };
  function songListPage(o, tok) {
    // o: { title, sub, songs, cover, iconCover, ctx, extra, empty }
    const k = regList(o.songs, o.ctx);
    view.innerHTML = '<div class="page">' + colHeader({ cover: o.cover, iconCover: o.iconCover, title: o.title, sub: o.sub, k: o.songs.length ? k : "", extra: o.extra }) +
      '<div class="list">' + (o.songs.length ? o.songs.map((s, i) => rowHTML(s, k, i)).join("") : o.empty) + '</div></div>';
    filled(tok);
  }
  ROUTES.liked = (args, tok) => {
    topSub("เพลงที่ถูกใจ");
    songListPage({ title: "เพลงที่ถูกใจ", sub: plural(lib.liked.length) + " · เก็บไว้ในเครื่องนี้", songs: lib.liked.slice(), cover: ic("heart-fill"), iconCover: true,
      empty: stateHTML("heart", "ยังไม่มีเพลงที่ถูกใจ", "กดรูปหัวใจในหน้ากำลังเล่น หรือเลือก “ถูกใจ” จากเมนู ⋮ ของเพลง") }, tok);
  };
  ROUTES.history = (args, tok) => {
    topSub("ประวัติการฟัง");
    const songs = lib.history.map(h => h.s);
    songListPage({ title: "ประวัติการฟัง", sub: plural(songs.length), songs, cover: ic("clock"), iconCover: true,
      extra: songs.length ? '<button class="btn" data-act="clearhist">' + ic("trash") + ' ล้างประวัติ</button>' : "",
      empty: stateHTML("clock", "ยังไม่มีประวัติการฟัง", "เพลงที่ฟังเกิน 30 วินาทีจะถูกบันทึกไว้ที่นี่") }, tok);
  };
  ROUTES.mypl = (args, tok) => {
    const p = lib.playlists.find(x => x.id === args[0]);
    topSub(p ? p.name : "เพลย์ลิสต์");
    if (!p) { view.innerHTML = stateHTML("note", "ไม่พบเพลย์ลิสต์นี้", "อาจถูกลบไปแล้ว", '<button class="btn pri" data-go="library">ไปที่คลังเพลง</button>'); return; }
    pageCtx.pl = p;
    songListPage({ title: p.name, sub: "เพลย์ลิสต์ของฉัน · " + plural(p.songs.length), songs: p.songs.slice(), ctx: { pid: p.id },
      cover: mosaic(p.songs) || ic("note"), iconCover: !p.songs.length,
      extra: '<button class="ic-btn" data-plmore="' + esc(p.id) + '" aria-label="ตัวเลือกเพลย์ลิสต์" style="background:rgba(255,255,255,.1)">' + ic("more") + '</button>',
      empty: stateHTML("pl-add", "ยังไม่มีเพลงในเพลย์ลิสต์นี้", "กด ⋮ ที่เพลงใดก็ได้ แล้วเลือก “เพิ่มลงเพลย์ลิสต์”") }, tok);
  };

  /* ---------------- remote playlist / album / chart ---------------- */
  ROUTES.playlist = (args, tok) => {
    const id = args[0], chart = args[1] === "chart";
    topSub("");
    view.innerHTML = '<div class="page"><div class="col-h"><div class="col-cv sk"></div><div class="col-info" style="width:100%;max-width:420px"><div class="sk sk-line" style="height:22px;width:70%;margin:0 auto 10px"></div><div class="sk sk-line" style="width:40%;margin:0 auto"></div></div></div><div class="list">' + skRows(10) + '</div></div>';
    pageCtx.retry = rerender;
    const fail = () => { if (tok === navTok) view.innerHTML = stateHTML("note", "โหลดเพลย์ลิสต์ไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); };
    api.playlist(id).then(p => {
      if (tok !== navTok) return;
      if (!p) return fail();
      setTopTitle(p.title);
      pageCtx.remote = p;
      const k = regList(p.songs);
      const saved = lib.playlists.some(x => x.src === p.id);
      view.innerHTML = '<div class="page">' + colHeader({ cover: p.songs[0] ? '<div class="sq" style="width:100%;height:100%">' + img(p.songs[0].thumb) + '</div>' : ic("note"), iconCover: !p.songs.length,
        title: p.title, sub: [p.owner, plural(p.songs.length)].filter(Boolean).join(" · "), k: p.songs.length ? k : "",
        extra: !p.songs.length ? "" : saved ? '<button class="btn on" disabled>' + ic("check") + ' บันทึกแล้ว</button>' : '<button class="btn" data-act="savepl">' + ic("save") + ' บันทึก</button>' }) +
        '<div class="list">' + (p.songs.length ? p.songs.map((s, i) => rowHTML(s, k, i, { rank: chart })).join("") : stateHTML("note", "เพลย์ลิสต์นี้ว่างเปล่า", "")) + '</div></div>';
      filled(tok);
    }, fail);
  };

  /* ---------------- artist ---------------- */
  function sameArtist(a, b) {
    const n = x => String(x || "").toLowerCase().replace(/\s*-\s*topic$/, "").replace(/official|channel|vevo|music|ช่อง/g, "").replace(/[^a-z0-9฀-๿]/g, "");
    const x = n(a), y = n(b);
    return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0);
  }
  // song.artistId is the uploader's channel; use it when that channel is the artist, otherwise look the name up
  function openArtist(s) {
    if (!s) return;
    if (s.artistId && (!s.channel || sameArtist(s.channel, s.artist))) go(mk("artist", s.artistId));
    else go(mk("artistq", s.artist, s.artistId || ""));
  }
  ROUTES.artistq = (args, tok) => {
    const name = args[0] || "", fallback = args[1] || "";
    topSub(name, true);
    view.innerHTML = artistSkeleton();
    api.artistId(name).then(id => id || fallback, () => fallback).then(id => {
      if (tok !== navTok) return;
      if (!id) { topEl.classList.remove("clear"); view.innerHTML = stateHTML("person", "ไม่พบหน้าศิลปิน", "ไม่พบช่องของ “" + name + "”", '<button class="btn pri" data-go="' + esc(mk("search", name)) + '">ค้นหา “' + esc(name) + '”</button>'); return; }
      const r = mk("artist", id), from = route;
      route = r;
      // "now playing" or a menu may have been opened meanwhile: only the page entry may take the new route
      if (!overlayDepth()) history.replaceState(Object.assign({}, cur(), { r }), "", urlFor(r));
      else artistqFix = { from, to: r };
      loadArtist(id, tok);
    });
  };
  ROUTES.artist = (args, tok) => { topSub("", true); view.innerHTML = artistSkeleton(); loadArtist(args[0], tok); };
  function artistSkeleton() {
    return '<div class="ar-hero"><div class="ar-bn"></div><div class="ar-head"><div class="ar-av sk"></div><div class="sk sk-line" style="width:180px;height:24px;margin-top:16px"></div><div class="sk sk-line" style="width:110px"></div></div></div>' +
      '<div class="page">' + secHTML({ title: "เพลงยอดนิยม", body: '<div class="list">' + skRows(5) + '</div>' }) + '</div>';
  }
  function loadArtist(id, tok) {
    pageCtx.retry = rerender;
    api.artist(id).then(a => {
      if (tok !== navTok) return;
      if (!a) { topEl.classList.remove("clear"); view.innerHTML = stateHTML("person", "โหลดหน้าศิลปินไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); return; }
      pageCtx.artist = a;
      setTopTitle(a.name);
      const all = util.uniqSongs(a.top.concat(a.latest));
      pageCtx.artistSongs = all;
      const following = lib.isFollowing(a.id);
      const kTop = regList(a.top), kNew = regList(a.latest);
      let h = '<div class="ar-hero"><div class="ar-bn">' + img(a.banner) + '</div><div class="ar-head">' +
        '<div class="ar-av">' + (a.avatar ? img(a.avatar, a.name) : initial(a.name)) + '</div>' +
        '<div><h1>' + esc(a.name) + '</h1>' + (a.subs ? '<div class="ar-subs">ผู้ติดตาม ' + esc(a.subs) + ' คน</div>' : "") +
        '<div class="btns"><button class="btn ' + (following ? "on" : "pri") + '" data-act="follow" aria-pressed="' + following + '">' + (following ? ic("check") + " ติดตามแล้ว" : "ติดตาม") + '</button>' +
        (all.length ? '<button class="btn" data-act="ashuffle">' + ic("shuffle") + ' สุ่มเพลง</button><button class="btn" data-act="aradio">' + ic("radio") + ' วิทยุ</button>' : "") +
        '</div></div></div></div><div class="page">';
      if (a.top.length) {
        h += secHTML({ title: "เพลงยอดนิยม", more: a.top.length > 5 ? '<button class="pill" data-act="topall">ดูทั้งหมด</button>' : "",
          body: '<div class="list" id="arTop">' + a.top.slice(0, 5).map((s, i) => rowHTML(s, kTop, i)).join("") + '</div>' });
        pageCtx.kTop = kTop;
      }
      if (a.latest.length) h += secHTML({ title: "เพลงล่าสุด", arrows: true, body: '<div class="hs">' + a.latest.map((s, i) => cardHTML(s, kNew, i)).join("") + '</div>' });
      if (a.albums.length) h += secHTML({ title: "อัลบั้มและเพลย์ลิสต์", arrows: true, body: '<div class="hs">' + a.albums.map(p => albumHTML(p)).join("") + '</div>' });
      // the artist's own channel may hold no music (labels often upload it): look the name up instead
      if (!all.length) h += secHTML({ id: "arFound", title: "เพลงของ " + a.name, body: '<div class="list">' + skRows(5) + '</div>' });
      if (a.about) h += secHTML({ title: "เกี่ยวกับ", body: '<div class="ar-about" data-act="about">' + esc(a.about) + '</div>' });
      view.innerHTML = h + '</div>';
      filled(tok);
      if (!all.length) {
        api.searchSongs(a.name).catch(() => null).then(found => {
          if (tok !== navTok) return;
          const box = $("#arFound");
          const list = (found || []).filter(x => sameArtist(x.artist, a.name) || sameArtist(x.channel, a.name));
          const songs = list.length ? list : (found || []);
          if (!songs.length) { $(".sec-b", box).innerHTML = stateHTML("note", found ? "ยังไม่พบเพลงของศิลปินนี้" : "โหลดเพลงไม่สำเร็จ", found ? "" : "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", found ? "" : retryBtn); return; }
          pageCtx.artistSongs = songs;
          const k = regList(songs);
          $(".sec-b", box).innerHTML = '<div class="list">' + songs.map((x, i) => rowHTML(x, k, i)).join("") + '</div>';
          $(".ar-head .btns").insertAdjacentHTML("beforeend", '<button class="btn" data-act="ashuffle">' + ic("shuffle") + ' สุ่มเพลง</button><button class="btn" data-act="aradio">' + ic("radio") + ' วิทยุ</button>');
          filled(tok);
        });
      }
    }, () => { if (tok === navTok) { topEl.classList.remove("clear"); view.innerHTML = stateHTML("person", "โหลดหน้าศิลปินไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); } });
  }
  // round avatars on home: fetch the channel picture only when the avatar scrolls into view
  const avIO = "IntersectionObserver" in window ? new IntersectionObserver(ents => ents.forEach(en => {
    if (!en.isIntersecting) return;
    avIO.unobserve(en.target);
    const el = en.target;
    const idP = el.dataset.aid ? Promise.resolve(el.dataset.aid) : api.artistId(el.dataset.aname);
    const retry = () => { if (!el.dataset.tried && el.isConnected) { el.dataset.tried = "1"; setTimeout(() => { if (el.isConnected) avIO.observe(el); }, 8000); } };
    idP.then(id => {
      if (!id) return null;
      if (!el.dataset.aid) { el.dataset.artist = id; el.removeAttribute("data-ch"); }   // a tap now goes straight there
      return api.artist(id);
    }).then(a => { if (a && a.avatar && el.isConnected) $(".ph", el).innerHTML = img(a.avatar); else retry(); }, retry);
  }), { rootMargin: "120px" }) : null;
  function observeAvatars(root) { if (avIO) $$("[data-aid],[data-aname]", root).forEach(el => avIO.observe(el)); }

  /* ---------------- search ---------------- */
  let sugSeq = 0, searchData = null;
  ROUTES.search = (args, tok) => {
    const q = args[0] || "", tab = args[1] || "all";
    topEl.innerHTML = '<button class="ic-btn" data-act="back" aria-label="ย้อนกลับ">' + ic("back") + '</button>' +
      '<form class="sbox" id="sForm" role="search" action="#"><input id="sIn" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="120" placeholder="ค้นหาเพลง ศิลปิน อัลบั้ม" aria-label="ค้นหา" value="' + esc(q) + '">' +
      '<button type="button" class="ic-btn" id="sClr" aria-label="ล้างคำค้นหา"' + (q ? "" : " hidden") + '>' + ic("close") + '</button></form>' +
      '<div class="top-act d-only"><button class="ic-btn" data-go="settings" aria-label="ตั้งค่า">' + ic("gear") + '</button></div>';
    view.innerHTML = '<div class="page"><div id="sSug"></div><div id="sRes"></div></div>';
    const input = $("#sIn"), clr = $("#sClr"), sug = $("#sSug"), res = $("#sRes");
    let timer = 0;
    const showMode = mode => { sug.hidden = mode === "res"; res.hidden = mode !== "res"; };
    const recents = () => {
      clearTimeout(timer); sugSeq++;      // drop any suggestion still on its way for text that is gone now
      showMode("sug");
      const list = lib.searches;
      sug.innerHTML = list.length ? '<div class="s-head"><span>การค้นหาล่าสุด</span><button data-act="clearsearch">ล้างทั้งหมด</button></div><div class="s-list">' +
        list.map(x => '<div class="s-item" role="button" tabindex="0" data-q="' + esc(x) + '">' + ic("clock") + '<span class="tx">' + esc(x) + '</span>' +
          '<button class="ic-btn" data-rmq="' + esc(x) + '" aria-label="ลบ ' + esc(x) + ' ออกจากประวัติ">' + ic("close") + '</button></div>').join("") + '</div>'
        : '<div class="state">' + ic("search") + '<h3>ค้นหาเพลงที่อยากฟัง</h3><p>พิมพ์ชื่อเพลง ศิลปิน หรืออัลบั้ม</p></div>';
    };
    pageCtx.recents = recents;
    const suggest = v => {
      showMode("sug");
      const seq = ++sugSeq;
      const draw = list => {
        if (seq !== sugSeq || tok !== navTok || input.value.trim() !== v) return;
        const items = [v].concat((list || []).filter(x => x && x.toLowerCase() !== v.toLowerCase())).slice(0, 9);
        sug.innerHTML = '<div class="s-list">' + items.map(x => '<div class="s-item" role="button" tabindex="0" data-q="' + esc(x) + '">' + ic("search") + '<span class="tx">' + esc(x) + '</span>' +
          '<button class="ic-btn" data-fillq="' + esc(x) + '" aria-label="ใช้คำนี้">' + ic("fill") + '</button></div>').join("") + '</div>';
      };
      draw([]);
      api.suggest(v).then(draw, () => {});
    };
    input.addEventListener("input", () => {
      const v = input.value.trim();
      clr.hidden = !input.value;
      clearTimeout(timer);
      if (!v) { recents(); return; }
      if (v === q && searchData) { sugSeq++; showMode("res"); return; }
      timer = setTimeout(() => suggest(v), 180);
    });
    $("#sForm").addEventListener("submit", e => { e.preventDefault(); runQuery(input.value); });
    clr.addEventListener("click", () => { input.value = ""; clr.hidden = true; recents(); input.focus(); });
    pageCtx.runQuery = runQuery;
    pageCtx.fill = v => { input.value = v + " "; input.focus(); input.dispatchEvent(new Event("input")); };
    if (!q) { recents(); setTimeout(() => { if (tok === navTok) input.focus(); }, 60); return; }
    showMode("res");
    searchData = null;
    res.innerHTML = '<div class="chips flat">' + ["ทั้งหมด", "เพลง", "ศิลปิน", "อัลบั้ม"].map((n, i) => '<span class="chip' + (i ? "" : " on") + '">' + n + '</span>').join("") + '</div>' +
      '<div class="top-res"><div class="ph sk"></div><div class="meta"><div class="sk sk-line" style="width:60%"></div><div class="sk sk-line" style="width:35%"></div></div></div>' + skRows(6);
    pageCtx.retry = rerender;
    api.searchAll(q).then(r => {
      if (tok !== navTok) return;
      searchData = r; pageCtx.q = q;
      drawResults(q, tab, tok);
    }, () => { if (tok === navTok) res.innerHTML = stateHTML("search", "ค้นหาไม่สำเร็จ", "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่", retryBtn); });
  };
  function runQuery(v) {
    v = String(v || "").trim();
    if (!v) return;
    lib.rememberSearch(v);
    const inp = $("#sIn"); if (inp) inp.blur();
    go(mk("search", v), { replace: parse(route).name === "search" && !!parse(route).args[0] });
  }
  function drawResults(q, tab, tok) {
    const r = searchData, res = $("#sRes");
    if (!r || !res) return;
    const tabs = [["all", "ทั้งหมด"], ["songs", "เพลง"], ["artists", "ศิลปิน"], ["albums", "อัลบั้ม"]];
    let h = '<div class="chips flat" role="tablist">' + tabs.map(t => '<button class="chip' + (t[0] === tab ? " on" : "") + '" role="tab" aria-selected="' + (t[0] === tab) + '" data-act="stab" data-st="' + t[0] + '">' + t[1] + '</button>').join("") + '</div>';
    if (!r.ok) { res.innerHTML = h + stateHTML("search", "ค้นหาไม่สำเร็จ", "เซิร์ฟเวอร์เพลงไม่ตอบสนอง ลองใหม่อีกครั้ง", retryBtn); return; }
    const none = !r.songs.length && !r.artists.length && !r.albums.length;
    if (none) { res.innerHTML = h + stateHTML("search", "ไม่พบผลลัพธ์", "ไม่พบเพลง ศิลปิน หรืออัลบั้มสำหรับ “" + q + "” ลองใช้คำอื่น"); return; }
    const kS = regList(r.songs);
    const artRow = a => '<div class="arow" role="button" tabindex="0" data-artist="' + esc(a.id) + '" data-name="' + esc(a.name) + '"><div class="ph">' + (a.avatar ? img(a.avatar) : initial(a.name)) + '</div><div class="meta"><div class="t">' + esc(a.name) + '</div><div class="a">ศิลปิน' + (a.subs ? " · ผู้ติดตาม " + esc(a.subs) : "") + '</div></div></div>';
    const albRow = p => '<div class="arow" role="button" tabindex="0" data-go="' + esc(mk("playlist", p.id)) + '"><div class="ph sqr plain">' + img(p.thumb) + '</div><div class="meta"><div class="t">' + esc(p.title) + '</div><div class="a">' + esc(["เพลย์ลิสต์", p.owner, p.count ? p.count + " เพลง" : ""].filter(Boolean).join(" · ")) + '</div></div></div>';
    const empty = t => stateHTML("search", "ไม่พบ" + t, "ลองดูแท็บอื่นหรือใช้คำค้นหาอื่น");
    if (tab === "songs") h += r.songs.length ? '<div class="list">' + r.songs.map((s, i) => rowHTML(s, kS, i)).join("") + '</div>' : empty("เพลง");
    else if (tab === "artists") h += r.artists.length ? r.artists.map(artRow).join("") : empty("ศิลปิน");
    else if (tab === "albums") h += r.albums.length ? r.albums.map(albRow).join("") : empty("อัลบั้ม");
    else {
      const ql = q.trim().toLowerCase();
      const art = r.artists.find(a => a.name.toLowerCase() === ql);
      if (art) h += '<div class="top-res" role="button" tabindex="0" data-artist="' + esc(art.id) + '" data-name="' + esc(art.name) + '"><div class="ph round">' + (art.avatar ? img(art.avatar) : initial(art.name)) + '</div><div class="meta"><div class="t">' + esc(art.name) + '</div><div class="a">ศิลปิน' + (art.subs ? " · ผู้ติดตาม " + esc(art.subs) : "") + '</div></div></div>';
      else if (r.songs[0]) { const s = r.songs[0]; h += '<div class="top-res" role="button" tabindex="0" data-k="' + kS + '" data-i="0" data-id="' + esc(s.id) + '"><div class="ph">' + img(s.thumb) + '</div><div class="meta"><div class="t">' + esc(s.title) + '</div><div class="a">เพลง · ' + esc(s.artist) + (s.dur ? " · " + esc(s.dur) : "") + '</div><span class="btn pri">' + ic("play") + ' เล่น</span></div></div>'; }
      if (r.songs.length) h += secHTML({ title: "เพลง", more: r.songs.length > 5 ? '<button class="pill" data-act="stab" data-st="songs">ดูทั้งหมด</button>' : "", body: '<div class="list">' + r.songs.slice(0, 5).map((s, i) => rowHTML(s, kS, i)).join("") + '</div>' });
      if (r.artists.length) h += secHTML({ title: "ศิลปิน", arrows: true, body: '<div class="hs">' + r.artists.map(avHTML).join("") + '</div>' });
      if (r.albums.length) h += secHTML({ title: "อัลบั้มและเพลย์ลิสต์", arrows: true, body: '<div class="hs">' + r.albums.map(p => albumHTML(p)).join("") + '</div>' });
    }
    res.innerHTML = h;
    filled(tok);
  }

  /* ---------------- settings ---------------- */
  ROUTES.settings = () => {
    topSub("ตั้งค่า");
    view.innerHTML = '<div class="page"><h1 class="pg-title">ตั้งค่า</h1>' +
      '<div class="set-card"><svg class="logo" aria-hidden="true"><use href="#logo"/></svg><div><h2>meekin Music</h2><p>ฟังเพลงพร้อมดูวิดีโอผ่านเครื่องเล่นแบบฝังอย่างเป็นทางการ · เวอร์ชัน 1</p></div></div>' +
      '<div class="set-note">' + ic("info") + '<span>เพลงจะหยุดเมื่อล็อกหน้าจอหรือสลับไปแอปอื่น เพราะข้อกำหนดของ YouTube ไม่อนุญาตให้แอปภายนอกเล่นเบื้องหลัง</span></div>' +
      '<button class="set-row" data-act="clearhist">' + ic("clock") + '<span>ล้างประวัติการฟัง</span><small class="sec-sub">' + plural(lib.history.length) + '</small></button>' +
      '<button class="set-row" data-act="clearsearch">' + ic("search") + '<span>ล้างประวัติการค้นหา</span><small class="sec-sub">' + lib.searches.length + ' รายการ</small></button>' +
      '<a class="set-row" href="../">' + ic("spark") + '<span>เปลี่ยนหน้าตาแอป</span>' + ic("chev-right") + '</a>' +
      '<a class="set-row" href="../../">' + ic("home") + '<span>กลับไปที่ meekinTube</span>' + ic("chev-right") + '</a>' +
      '<p class="set-foot">ประวัติการฟัง เพลงที่ถูกใจ ศิลปินที่ติดตาม และเพลย์ลิสต์ เก็บไว้ในเครื่องนี้เท่านั้น และใช้ร่วมกับหน้าตาแบบอื่นของ meekin Music</p></div>';
  };

  /* ---------------- desktop side list ---------------- */
  function refreshSide() {
    const box = $("#sidePl");
    if (!box) return;
    const { name, args } = parse(route);
    box.innerHTML = '<button data-go="liked" class="' + (name === "liked" ? "on" : "") + '"><div class="t">เพลงที่ถูกใจ</div><div class="s">อัตโนมัติ · ' + plural(lib.liked.length) + '</div></button>' +
      lib.playlists.map(p => '<button data-go="' + esc(mk("mypl", p.id)) + '" class="' + (name === "mypl" && args[0] === p.id ? "on" : "") + '"><div class="t">' + esc(p.name) + '</div><div class="s">' + plural(p.songs.length) + '</div></button>').join("");
  }

  /* ---------------- playing ---------------- */
  function playList(k, i, opts) {
    const L = LISTS.get(k);
    if (!L || !L.songs[i]) return;
    player.play(L.songs[i], { queue: L.songs, index: i });
    if (!(opts && opts.stay)) openNP();
  }
  function playAll(k, shuffle) {
    const L = LISTS.get(k);
    if (!L || !L.songs.length) return;
    let q = L.songs.slice();
    if (shuffle) q = util.shuffled(q);
    player.play(q[0], { queue: q, index: 0 });
    openNP();
  }
  // songs like s: YouTube's radio mix for it, or (when the mix source is down) more songs by the same artist
  function similar(s) {
    return api.radio(s.id, s).catch(() => null).then(r => {
      if (r && r.length) return { songs: r, how: "radio" };
      return api.searchSongs(s.artist).catch(() => null).then(x => {
        const list = (x || []).filter(y => y.id !== s.id);
        return { songs: list, how: list.length ? "artist" : (x || r ? "none" : "error") };
      });
    });
  }
  function addMissing(list, max) {
    const have = new Set(player.queue.map(x => x.id));
    list.filter(x => !have.has(x.id)).slice(0, max).forEach(x => player.addToQueue(x));
  }
  function startRadio(s) {
    const c = player.current;
    if (c && c.id === s.id) {
      // already playing: keep it going where it is and replace the rest of the queue (high to low keeps indexes valid)
      for (let i = player.queue.length - 1; i >= 0; i--) if (i !== player.index) player.removeAt(i);
    } else player.play(s);   // core tops the queue up with this song's radio; add the rest of the mix too
    openNP();
    toast("เริ่มวิทยุจาก “" + s.title + "”");
    similar(s).then(r => { const c = player.current; if (c && c.id === s.id) addMissing(r.songs, 25); });
  }
  // core keeps "up next" filled from the song's radio; if that source fails, top up with similar songs
  let topupFor = "";
  function ensureUpNext() {
    const c = player.current;
    if (!c || player.repeat !== "off" || topupFor === c.id || player.queue.length - player.index > 3) return;
    topupFor = c.id;
    setTimeout(() => {
      const cc = player.current;
      if (!cc || cc.id !== c.id || player.queue.length - player.index > 3) return;
      similar(c).then(r => { const x = player.current; if (x && x.id === c.id && player.queue.length - player.index <= 3) addMissing(r.songs, 15); });
    }, 6000);
  }
  function markPlaying() {
    const c = player.current, id = c ? c.id : "";
    $$("#view [data-id], #npPanel [data-id]").forEach(el => el.classList.toggle("on", !!id && el.dataset.id === id && !el.classList.contains("q")));
    $$("#npPanel .row.q").forEach(el => el.classList.toggle("on", +el.dataset.q === player.index));
  }

  /* ---------------- now playing ---------------- */
  let npTab = "queue", relFor = "", relList = null, qTimer = 0;
  function openNP() {
    if (!player.current || npOpen) return;
    saveScroll();
    history.pushState(Object.assign({}, cur() || { app: 1, r: route, d: 0 }, { np: 1, sh: 0 }), "", location.href);
    setNP(true);
  }
  function closeNP() {
    if (!npOpen) return;
    const s = cur();
    if (s && s.np) popBack(s.sh ? 2 : 1); else setNP(false);
  }
  function setNP(open) {
    npOpen = open;
    body.classList.toggle("np-open", open);
    $("#np").setAttribute("aria-hidden", open ? "false" : "true");
    if (open) renderPanel();
  }
  function renderPanel() {
    if (!npOpen) return;
    $$(".np-tabs button").forEach(b => { const on = b.dataset.nt === npTab; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    if (npTab === "queue") renderQueue(); else renderRelated();
  }
  function qRow(s, i, now) {
    return '<div class="row q' + (now ? " on" : "") + '" role="button" tabindex="0" data-q="' + i + '" data-id="' + esc(s.id) + '">' +
      '<div class="th">' + img(s.thumb || util.thumb(s.id)) + EQ + '</div>' +
      '<div class="meta"><div class="t">' + esc(s.title) + '</div><div class="a">' + esc(s.artist) + (s.dur ? " · " + esc(s.dur) : "") + '</div></div>' +
      (now ? "" : '<button class="ic-btn rm" data-rm="' + i + '" aria-label="ลบออกจากคิว">' + ic("close") + '</button>') +
      '<button class="more" data-more aria-label="ตัวเลือกเพิ่มเติม">' + ic("more") + '</button></div>';
  }
  function renderQueue() {
    const panel = $("#npPanel"), c = player.current;
    if (!c) { panel.innerHTML = stateHTML("queue-add", "ยังไม่มีเพลงในคิว", ""); return; }
    const q = player.queue, up = player.upNext().slice(0, 150);
    panel.innerHTML = '<div class="q-h">กำลังเล่น</div>' + qRow(c, player.index, true) +
      (up.length ? '<div class="q-h">ถัดไป<span>' + plural(player.upNext().length) + (player.shuffle ? " · สุ่ม" : "") + '</span></div>' + up.map(s => qRow(s, q.indexOf(s))).join("")
        : '<div class="q-h">ถัดไป</div><p class="q-note">กำลังหาเพลงที่คล้ายกันมาเล่นต่อ…</p>') +
      '<p class="q-note">' + ic("radio") + ' เมื่อคิวหมด จะเล่นต่อด้วยเพลงที่คล้ายกันโดยอัตโนมัติ</p>';
  }
  function renderRelated() {
    const panel = $("#npPanel"), c = player.current;
    if (!c) { panel.innerHTML = ""; return; }
    const draw = () => {
      dropLists("r");
      const L = relList;
      if (!L || !L.songs.length) {
        const failed = !L || L.how === "error";
        panel.innerHTML = stateHTML("radio", failed ? "โหลดเพลงที่เกี่ยวข้องไม่สำเร็จ" : "ไม่พบเพลงที่เกี่ยวข้อง", failed ? "ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" : "", failed ? '<button class="btn" data-act="relretry">ลองใหม่</button>' : "");
        if (failed) relFor = "";
        return;
      }
      const k = regList(L.songs, { related: true }, "r");
      panel.innerHTML = '<div class="q-h">' + (L.how === "radio" ? "เพลงที่คล้ายกับ “" + esc(c.title) + "”" : "เพลงอื่นจาก " + esc(c.artist)) + '</div>' +
        L.songs.map((s, i) => rowHTML(s, k, i)).join("");
      markPlaying();
    };
    if (relFor === c.id && relList) { draw(); return; }
    relFor = c.id; relList = null;
    panel.innerHTML = skRows(8);
    const id = c.id;
    similar(c).then(r => { if (relFor !== id) return; relList = r; if (npTab === "related") draw(); });
  }
  function scheduleQueue() { if (qTimer) return; qTimer = requestAnimationFrame(() => { qTimer = 0; if (npOpen && npTab === "queue") renderQueue(); }); }

  /* player events */
  M.on("track", s => {
    body.classList.add("has-track");
    $("#miniT").textContent = s.title; $("#miniA").textContent = s.artist;
    $("#npT").textContent = s.title; $("#npA").textContent = s.artist;
    $("#npT").title = s.title;
    const bg = $("#npBgImg"); bg.src = util.thumb(s.id, "small");
    setTimes(0, s.sec || 0);
    updateLike(); updateModes(); hideHint();
    if (npOpen) renderPanel();
    markPlaying();
    ensureUpNext();
  });
  M.on("state", st => {
    const on = st === "playing" || st === "buffering";
    body.classList.toggle("is-playing", on);
    body.classList.toggle("is-buffering", st === "buffering");
    if (st === "playing") hideHint();
  });
  M.on("time", t => setTimes(t.cur, t.dur));
  M.on("queue", () => { scheduleQueue(); updateModes(); });
  M.on("like", () => { updateLike(); const n = parse(route).name; if (n === "liked" || n === "library") rerender(); else refreshSide(); });
  M.on("blocked", () => { $("#miniHint").hidden = false; $("#npHint").hidden = false; });
  M.on("error", e => toast((e && e.message ? e.message : "เล่นเพลงนี้ไม่ได้") + (e && e.final ? "" : " · กำลังข้ามไปเพลงถัดไป")));
  function hideHint() { $("#miniHint").hidden = true; $("#npHint").hidden = true; }

  const seeks = [{ el: $("#npSeek"), cur: $("#npCur"), dur: $("#npDur"), drag: false }, { el: $("#miniSeek"), cur: $("#miniCur"), dur: $("#miniDur"), drag: false }];
  function setTimes(c, d) {
    const p = d > 0 ? Math.max(0, Math.min(1, c / d)) : 0;
    seeks.forEach(x => {
      if (x.drag) return;
      x.el.value = Math.round(p * 1000);
      x.el.style.setProperty("--p", (p * 100).toFixed(2) + "%");
      x.cur.textContent = fmt(c); x.dur.textContent = fmt(d);
    });
    $("#miniProg").style.width = (p * 100).toFixed(2) + "%";
  }
  seeks.forEach(x => {
    const start = () => { x.drag = true; };
    x.el.addEventListener("pointerdown", start);
    x.el.addEventListener("input", () => {
      x.drag = true;
      const d = player.time.dur, v = +x.el.value / 1000;
      x.el.style.setProperty("--p", (v * 100).toFixed(2) + "%");
      x.cur.textContent = fmt(v * d);
    });
    x.el.addEventListener("change", () => {
      const d = player.time.dur;
      if (d > 0 && player.current) player.seek(+x.el.value / 1000 * d);
      x.drag = false;
    });
    x.el.addEventListener("pointerup", () => setTimeout(() => { x.drag = false; }, 300));
    x.el.addEventListener("pointercancel", () => { x.drag = false; });
  });
  function updateLike() {
    const c = player.current, on = !!c && lib.isLiked(c.id);
    [$("#npLike"), $("#miniLike")].forEach(b => {
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
      b.setAttribute("aria-label", on ? "เลิกถูกใจ" : "ถูกใจ");
      b.innerHTML = ic(on ? "heart-fill" : "heart");
    });
  }
  function updateModes() {
    const sh = player.shuffle, rp = player.repeat;
    $$('[data-act="shuffle"]').forEach(b => { b.classList.toggle("on", sh); b.setAttribute("aria-pressed", sh); b.setAttribute("aria-label", "สุ่มเพลง: " + (sh ? "เปิด" : "ปิด")); });
    $$('[data-act="repeat"]').forEach(b => {
      b.classList.toggle("on", rp !== "off");
      b.innerHTML = ic(rp === "one" ? "repeat1" : "repeat");
      b.setAttribute("aria-label", "เล่นซ้ำ: " + (rp === "off" ? "ปิด" : rp === "all" ? "ทั้งหมด" : "เพลงเดียว"));
    });
  }

  /* ---------------- sheet: menus and small dialogs ---------------- */
  // Placed so it never covers the player box: above the mini player, beside the player column (phone in
  // landscape), or below the video in "now playing".
  function hostRect() { return body.classList.contains("has-track") ? host.getBoundingClientRect() : null; }
  function overlaps(a, r) { return !!r && a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top; }
  function placeFloating(el, gap) {
    const vw = window.innerWidth, vh = window.innerHeight, desk = isDesk(), r = hostRect();
    const topLimit = topEl.getBoundingClientRect().bottom + 8;
    let w = desk ? Math.min(420, vw - 32) : vw;
    let left = 0, bottom = 0, maxH = vh * 0.82;
    if (desk) {
      bottom = 24;
      left = npOpen ? Math.max(r ? r.right + 24 : 24, vw - w - 24) : Math.max(16, (vw + 240 - w) / 2);
    }
    if (r && left < r.right && left + w > r.left) {     // shares columns with the player
      if (!npOpen && isSideDock()) w = Math.max(0, r.left - gap);         // player column on the right: fill the space left of it
      else if (!npOpen) bottom = Math.max(bottom, vh - r.top + gap);      // mini player at the bottom: sit above it
      else maxH = Math.min(maxH, vh - bottom - r.bottom - gap);          // video at the top: stay below it
    }
    maxH = Math.min(maxH, vh - bottom - topLimit);
    el.style.top = "auto"; el.style.right = "auto";
    el.style.left = left + "px"; el.style.width = w + "px";
    el.style.bottom = bottom + "px"; el.style.maxHeight = Math.max(120, Math.floor(maxH)) + "px";
    el.classList.toggle("float", bottom > 0);
  }
  function openSheet(html, handler) {
    sheetHandler = handler || null;
    sheet.innerHTML = '<div class="sh-grab" aria-hidden="true"></div>' + html;
    if (!sheetOpen) {
      history.pushState(Object.assign({}, cur() || { app: 1, r: route, d: 0 }, { sh: 1 }), "", location.href);
      sheetOpen = true;
    }
    scrim.hidden = false; sheet.hidden = false;
    sheet.scrollTop = 0;
    placeFloating(sheet, 8);
    const f = sheet.querySelector("input, .sh-item");
    if (f && f.tagName !== "INPUT" && isDesk()) f.focus({ preventScroll: true });
  }
  function hideSheet() { sheetOpen = false; sheetHandler = null; sheet.hidden = true; scrim.hidden = true; sheet.innerHTML = ""; }
  function closeSheet() {
    if (!sheetOpen) return Promise.resolve();
    const s = cur();
    if (s && s.sh) return popBack(1);
    hideSheet(); return Promise.resolve();
  }
  scrim.addEventListener("click", () => closeSheet());
  sheet.addEventListener("click", e => {
    const b = e.target.closest("[data-sh]");
    if (b && sheetHandler) sheetHandler(b.dataset.sh, b);
  });
  window.addEventListener("resize", () => { if (sheetOpen) placeFloating(sheet, 8); });

  function songHead(s) {
    return '<div class="sh-head"><div class="th">' + img(s.thumb || util.thumb(s.id)) + '</div><div class="meta"><div class="t">' + esc(s.title) + '</div><div class="a">' + esc(s.artist) + '</div></div></div>';
  }
  const shItem = (act, icon, label, extra) => '<button class="sh-item" data-sh="' + act + '"' + (extra || "") + '>' + ic(icon) + '<span>' + esc(label) + '</span></button>';
  function songMenu(s, ctx) {
    ctx = ctx || {};
    const liked = lib.isLiked(s.id);
    const isCur = player.current && player.current.id === s.id;
    let h = songHead(s);
    if (!isCur) h += shItem("next", "queue-next", "เล่นถัดไป") + shItem("queue", "queue-add", "เพิ่มในคิว");
    h += shItem("like", liked ? "heart-fill" : "heart", liked ? "เลิกถูกใจ" : "ถูกใจ") +
      shItem("pl", "pl-add", "เพิ่มลงเพลย์ลิสต์") + shItem("artist", "person", "ไปที่ศิลปิน") + shItem("radio", "radio", "เริ่มวิทยุจากเพลงนี้");
    if (ctx.pid) h += shItem("unpl", "trash", "ลบออกจากเพลย์ลิสต์นี้");
    if (ctx.qi != null && ctx.qi !== player.index) h += shItem("unq", "close", "ลบออกจากคิว");
    openSheet(h, act => {
      if (act === "next") { player.playNext(s); closeSheet(); toast("จะเล่นเพลงนี้ถัดไป"); }
      else if (act === "queue") { player.addToQueue(s); closeSheet(); toast("เพิ่มในคิวแล้ว"); }
      else if (act === "like") { const on = lib.toggleLike(s); closeSheet(); toast(on ? "เพิ่มในเพลงที่ถูกใจแล้ว" : "นำออกจากเพลงที่ถูกใจแล้ว"); }
      else if (act === "pl") pickPlaylist(s);
      else if (act === "artist") openArtist(s);          // go() closes the menu (and now playing) first
      else if (act === "radio") closeSheet().then(() => startRadio(s));
      else if (act === "unpl") { lib.removeFromPlaylist(ctx.pid, s.id); closeSheet().then(rerender); toast("ลบออกจากเพลย์ลิสต์แล้ว"); }
      else if (act === "unq") { player.removeAt(ctx.qi); closeSheet(); }
    });
  }
  function pickPlaylist(s) {
    const pls = lib.playlists;
    openSheet('<div class="sh-title">บันทึกลงเพลย์ลิสต์</div>' + shItem("new", "plus", "เพลย์ลิสต์ใหม่") +
      pls.map(p => '<button class="sh-item" data-sh="add" data-pid="' + esc(p.id) + '"><span class="mini-mo">' + (p.songs[0] ? img(p.songs[0].thumb || util.thumb(p.songs[0].id)) : ic("note")) + '</span><span>' + esc(p.name) + '</span><span class="c">' + plural(p.songs.length) + '</span></button>').join(""),
      (act, el) => {
        if (act === "new") askName("เพลย์ลิสต์ใหม่", "", name => {
          const p = lib.newPlaylist(name); lib.addToPlaylist(p.id, s);
          closeSheet().then(afterLibChange); toast("เพิ่มลงใน “" + p.name + "” แล้ว");
        });
        else if (act === "add") {
          const p = lib.playlists.find(x => x.id === el.dataset.pid);
          const ok = lib.addToPlaylist(el.dataset.pid, s);
          closeSheet().then(afterLibChange);
          toast(ok ? "เพิ่มลงใน “" + (p ? p.name : "") + "” แล้ว" : "มีเพลงนี้ในเพลย์ลิสต์แล้ว");
        }
      });
  }
  function afterLibChange() { refreshSide(); const n = parse(route).name; if (n === "library" || n === "mypl") rerender(); }
  function askName(title, value, done) {
    openSheet('<form class="sh-form" action="#"><h3>' + esc(title) + '</h3><input name="n" maxlength="60" autocomplete="off" placeholder="ชื่อเพลย์ลิสต์" value="' + esc(value) + '" aria-label="ชื่อเพลย์ลิสต์">' +
      '<div class="sh-btns"><button type="button" class="btn" data-sh="cancel">ยกเลิก</button><button type="submit" class="btn pri">บันทึก</button></div></form>',
      act => { if (act === "cancel") closeSheet(); });
    const f = $("form", sheet);
    f.addEventListener("submit", e => { e.preventDefault(); const v = f.n.value.trim(); if (!v) { f.n.focus(); return; } done(v.slice(0, 60)); });
    setTimeout(() => { if (f.isConnected) { f.n.focus(); f.n.select(); } }, 60);
  }
  function confirmSheet(title, text, okLabel, fn) {
    openSheet('<div class="sh-form"><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p><div class="sh-btns"><button class="btn" data-sh="cancel">ยกเลิก</button><button class="btn danger" data-sh="ok">' + esc(okLabel) + '</button></div></div>',
      act => { if (act === "cancel") closeSheet(); else if (act === "ok") fn(); });
  }
  function playlistMenu(pid) {
    const p = lib.playlists.find(x => x.id === pid);
    if (!p) return;
    openSheet('<div class="sh-head"><div class="th" style="display:grid;place-items:center">' + (p.songs[0] ? img(p.songs[0].thumb || util.thumb(p.songs[0].id)) : ic("note")) + '</div><div class="meta"><div class="t">' + esc(p.name) + '</div><div class="a">' + plural(p.songs.length) + '</div></div></div>' +
      (p.songs.length ? shItem("play", "play", "เล่น") + shItem("shuffle", "shuffle", "สุ่มเล่น") + shItem("queue", "queue-add", "เพิ่มทั้งหมดในคิว") : "") +
      shItem("rename", "edit", "เปลี่ยนชื่อ") + shItem("delete", "trash", "ลบเพลย์ลิสต์"),
      act => {
        if (act === "play" || act === "shuffle") {
          const q = act === "shuffle" ? util.shuffled(p.songs) : p.songs.slice();
          closeSheet().then(() => { player.play(q[0], { queue: q, index: 0 }); openNP(); });
        } else if (act === "queue") { p.songs.forEach(x => player.addToQueue(x)); closeSheet(); toast("เพิ่ม " + plural(p.songs.length) + " ในคิวแล้ว"); }
        else if (act === "rename") askName("เปลี่ยนชื่อเพลย์ลิสต์", p.name, name => { lib.renamePlaylist(p.id, name); closeSheet().then(afterLibChange); toast("เปลี่ยนชื่อแล้ว"); });
        else if (act === "delete") confirmSheet("ลบเพลย์ลิสต์?", "“" + p.name + "” และรายการเพลงในนั้นจะถูกลบออกจากเครื่องนี้", "ลบ", () => {
          lib.deletePlaylist(p.id);
          closeSheet().then(() => { toast("ลบเพลย์ลิสต์แล้ว"); if (parse(route).name === "mypl") go("library", { replace: true }); else afterLibChange(); refreshSide(); });
        });
      });
  }

  /* ---------------- toast ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    const vw = window.innerWidth, vh = window.innerHeight, r = hostRect();
    const dock = r && !npOpen ? $("#dock").getBoundingClientRect() : null;
    const side = !!dock && isSideDock();              // player dock is a column on the right: centre in the space left of it
    const span = side ? dock.left : vw;
    toastEl.style.left = side ? span / 2 + "px" : "";
    toastEl.style.maxWidth = side ? Math.max(120, Math.min(span - 32, 440)) + "px" : "";
    const h = toastEl.offsetHeight || 40, w = toastEl.offsetWidth || 240;
    const box = b => ({ left: (span - w) / 2, right: (span + w) / 2, top: vh - b - h, bottom: vh - b });
    let bottom;
    if (npOpen) bottom = 24;
    else if (dock && !side) bottom = vh - dock.top + 12;   // above the player dock
    else bottom = (isDesk() ? 0 : $("#nav").offsetHeight) + 12;
    if (overlaps(box(bottom), r)) bottom = r.top > vh / 2 ? vh - r.top + 12 : 24;
    if (overlaps(box(bottom), r)) { toastEl.style.bottom = "auto"; toastEl.style.top = (topEl.getBoundingClientRect().bottom + 8) + "px"; }
    else { toastEl.style.top = "auto"; toastEl.style.bottom = bottom + "px"; }
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
  }

  /* ---------------- clicks ---------------- */
  function actions(act, el, e) {
    switch (act) {
      case "toggle": player.toggle(); break;
      case "next": player.next(); break;
      case "prev": player.prev(); break;
      case "shuffle": { const on = player.setShuffle(!player.shuffle); updateModes(); toast(on ? "เปิดการสุ่มเพลง" : "ปิดการสุ่มเพลง"); break; }
      case "repeat": { const r = player.cycleRepeat(); updateModes(); toast(r === "off" ? "ปิดการเล่นซ้ำ" : r === "all" ? "เล่นซ้ำทั้งคิว" : "เล่นซ้ำเพลงนี้"); break; }
      case "like": { const c = player.current; if (c) { const on = lib.toggleLike(c); toast(on ? "เพิ่มในเพลงที่ถูกใจแล้ว" : "นำออกจากเพลงที่ถูกใจแล้ว"); } break; }
      case "opennp": openNP(); break;
      case "closenp": closeNP(); break;
      case "npmore": if (player.current) songMenu(player.current, { qi: player.index }); break;
      case "npartist": openArtist(player.current); break;
      case "nptab": npTab = el.dataset.nt; renderPanel(); $(".np-side").scrollTop = 0; if (!isDesk()) { const t = $(".np-tabs"); const b = $(".np-body"); if (t.offsetTop < b.scrollTop) b.scrollTop = t.offsetTop; } break;
      case "relretry": relFor = ""; renderRelated(); break;
      case "back": goBack(); break;
      case "retry": if (pageCtx.retry) pageCtx.retry(); else rerender(); break;
      case "playall": playAll(el.dataset.k, false); break;
      case "shuffleall": playAll(el.dataset.k, true); break;
      case "chip": {
        const key = el.dataset.key, n = parse(route).name;
        if (n === "genre" && parse(route).args[0] === key) { const c = cur(); if (c && c.d > 0) history.back(); else go("home", { replace: true }); }
        else go(mk("genre", key), { replace: n === "genre" });
        break;
      }
      case "chart": go(mk("charts", el.dataset.w === "global" ? "global" : ""), { replace: true }); break;
      case "stab": {
        const q = pageCtx.q; if (!q) break;
        const t = el.dataset.st;
        history.replaceState(Object.assign({}, cur(), { r: mk("search", q, t === "all" ? "" : t) }), "", urlFor(mk("search", q, t === "all" ? "" : t)));
        route = cur().r;
        drawResults(q, t, navTok); window.scrollTo(0, 0);
        break;
      }
      case "clearsearch": confirmSheet("ล้างประวัติการค้นหา?", "คำค้นหาล่าสุดทั้งหมดจะถูกลบ", "ล้าง", () => { lib.clearSearches(); closeSheet().then(() => { if (pageCtx.recents) pageCtx.recents(); else rerender(); toast("ล้างประวัติการค้นหาแล้ว"); }); }); break;
      case "clearhist": confirmSheet("ล้างประวัติการฟัง?", "ประวัติการฟังทั้งหมดในเครื่องนี้จะถูกลบ และคำแนะนำจะเริ่มใหม่", "ล้าง", () => { lib.clearHistory(); Object.keys(homeCache).forEach(k => delete homeCache[k]); closeSheet().then(() => { rerender(); toast("ล้างประวัติการฟังแล้ว"); }); }); break;
      case "newpl": askName("เพลย์ลิสต์ใหม่", "", name => { const p = lib.newPlaylist(name); closeSheet().then(() => { refreshSide(); go(mk("mypl", p.id)); toast("สร้าง “" + p.name + "” แล้ว"); }); }); break;
      case "savepl": {
        const p = pageCtx.remote; if (!p) break;
        const done = () => { el.disabled = true; el.className = "btn on"; el.innerHTML = ic("check") + " บันทึกแล้ว"; };
        if (lib.playlists.some(x => x.src === p.id)) { done(); toast("บันทึกเพลย์ลิสต์นี้ไว้แล้ว"); break; }
        const mine = lib.newPlaylist(p.title.slice(0, 60));
        // remember where it came from, so it is saved only once; store it now, because addToPlaylist re-reads storage
        mine.src = p.id; lib.save("playlists");
        p.songs.forEach(s => lib.addToPlaylist(mine.id, s));
        done(); refreshSide(); toast("บันทึก “" + mine.name + "” ลงคลังเพลงแล้ว");
        break;
      }
      case "follow": {
        const a = pageCtx.artist; if (!a) break;
        const on = lib.toggleFollow(a);
        el.className = "btn " + (on ? "on" : "pri"); el.setAttribute("aria-pressed", on);
        el.innerHTML = on ? ic("check") + " ติดตามแล้ว" : "ติดตาม";
        toast(on ? "ติดตาม " + a.name + " แล้ว" : "เลิกติดตาม " + a.name + " แล้ว");
        break;
      }
      case "ashuffle": { const s = pageCtx.artistSongs; if (s && s.length) { const q = util.shuffled(s); player.play(q[0], { queue: q, index: 0 }); openNP(); } break; }
      case "aradio": { const a = pageCtx.artist, list = pageCtx.artistSongs || []; const seed = a && (a.top[0] || a.latest[0] || list[0]); if (seed) startRadio(seed); break; }
      case "topall": {
        const a = pageCtx.artist, box = $("#arTop"); if (!a || !box) break;
        box.innerHTML = a.top.map((s, i) => rowHTML(s, pageCtx.kTop, i)).join(""); el.remove(); markPlaying();
        break;
      }
      case "about": el.classList.toggle("open"); break;
      case "scrl": {
        const sec = el.closest(".sec"), sc = sec && sec.querySelector(".hs, .qgrid, .tiles");
        if (sc) sc.scrollBy({ left: (+el.dataset.dir) * sc.clientWidth * 0.85, behavior: "smooth" });
        break;
      }
    }
  }
  function songFrom(el) {
    const q = el.closest("[data-q]");
    if (q) { const i = +q.dataset.q; return { s: player.queue[i], ctx: { qi: i } }; }
    const r = el.closest("[data-k][data-i]");
    if (!r) return null;
    const L = LISTS.get(r.dataset.k);
    return L ? { s: L.songs[+r.dataset.i], ctx: L.ctx } : null;
  }
  function openArtistEl(el) {
    const id = el.dataset.artist, name = el.dataset.name || "";
    if (id) openArtist({ artistId: id, artist: name, channel: el.dataset.ch || "" });
    else if (name) go(mk("artistq", name));
  }
  document.addEventListener("click", e => {
    if (e.target.closest("#sheet")) return;
    const t = e.target;
    let el;
    if ((el = t.closest("[data-more]"))) { const f = songFrom(el); if (f && f.s) songMenu(f.s, f.ctx); return; }
    if ((el = t.closest("[data-plmore]"))) { playlistMenu(el.dataset.plmore); return; }
    if ((el = t.closest("[data-rm]"))) { player.removeAt(+el.dataset.rm); return; }
    if ((el = t.closest("[data-rmq]"))) { const v = el.dataset.rmq; lib.removeSearch(v); if (pageCtx.recents) pageCtx.recents(); return; }
    if ((el = t.closest("[data-fillq]"))) { if (pageCtx.fill) pageCtx.fill(el.dataset.fillq); return; }
    if ((el = t.closest("[data-act]"))) { actions(el.dataset.act, el, e); return; }
    if ((el = t.closest("[data-q]"))) {
      if (el.classList.contains("s-item")) { if (pageCtx.runQuery) pageCtx.runQuery(el.dataset.q); return; }
      const i = +el.dataset.q; if (i !== player.index) player.playAt(i); return;
    }
    if ((el = t.closest("[data-k][data-i]"))) { const L = LISTS.get(el.dataset.k); playList(el.dataset.k, +el.dataset.i, { stay: npOpen || (L && L.ctx.related) }); return; }
    if ((el = t.closest("[data-mix]"))) { const m = MIXES.get(el.dataset.mix); if (m && m.songs.length) { player.play(m.songs[0], { queue: m.songs, index: 0 }); openNP(); } return; }
    if ((el = t.closest("[data-artist]"))) { openArtistEl(el); return; }
    if ((el = t.closest("[data-go]"))) {
      e.preventDefault();
      const r = el.dataset.go, n = parse(r).name;
      if (r === route && el.dataset.tab) {          // tapping the current tab: back to the top (and refresh home)
        if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: "smooth" });
        else if (n === "home") { Object.keys(homeCache).forEach(k => delete homeCache[k]); rerender(); }
        return;
      }
      if (r === route) return;
      go(r);
    }
  });
  // keyboard: Enter/Space on role=button items, Space toggles play, Escape closes overlays
  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
    if (e.key === "Escape") { if (sheetOpen) { closeSheet(); e.preventDefault(); } else if (npOpen) { closeNP(); e.preventDefault(); } return; }
    if (typing) return;
    if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute && e.target.getAttribute("role") === "button" && tag !== "button") {
      e.preventDefault(); e.target.click(); return;
    }
    if (e.key === " " && tag !== "button" && player.current) { e.preventDefault(); player.toggle(); }
  });

  /* ---------------- boot ---------------- */
  (function boot() {
    const r = hashRoute();
    const s = history.state && history.state.app ? history.state : null;
    if (s && s.r === r && ROUTES[parse(r).name]) {
      // a reload: this entry already has its route, depth and scroll; "now playing" and menus start closed
      history.replaceState({ app: 1, r, y: s.y || 0, d: s.d || 0 }, "", urlFor(r));
      render(r, s.y || 0);
    } else {
      // a fresh visit / deep link: put home underneath so "back" stays in the app
      history.replaceState({ app: 1, r: "home", y: 0, d: 0 }, "", urlFor("home"));
      if (r !== "home" && ROUTES[parse(r).name]) { history.pushState({ app: 1, r, y: 0, d: 1 }, "", urlFor(r)); render(r, 0); }
      else render("home", 0);
    }
    updateModes(); updateLike();
  })();
})();
