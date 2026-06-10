const BASE = new URL(".", document.baseURI).pathname;  // e.g. "/api/meekintube/"
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const IC = (name) => `<svg class="ic"><use href="#i-${name}"/></svg>`;
function setIcon(el, name) { const u = el && el.querySelector("use"); if (u) u.setAttribute("href", "#i-" + name); }
const urlsEl = $("#urls");
const jobsEl = $("#jobs");
const dlBtn = $("#dlBtn");
const autoPlayEl = $("#autoplay");

// ---------- แท็บ ----------
function showTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".tabpage").forEach((p) => { p.hidden = p.id !== "tab-" + name; });
  if (name === "library") loadFiles();
  window.scrollTo({ top: 0 });
}
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  showTab(t.dataset.tab);
  if (t.dataset.tab === "home") loadHomeFeed();   // คลิกแท็บหน้าแรก → รีเฟรชฟีดแนะนำ
}));
// โลโก้ = กลับหน้าแรก
document.querySelector(".brand")?.addEventListener("click", () => { showTab("home"); loadHomeFeed(); });

// ---------- service worker ----------
const APP_VER = "v31";
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register(BASE + "sw.js", { scope: BASE }).catch(() => {});
  // มีเวอร์ชันใหม่ activate (claim) → รีโหลดให้ใช้โค้ดใหม่ทันที (สำคัญบน iOS ที่อัปเดตยาก)
  let _reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (_reloaded) return; _reloaded = true; location.reload();
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const ft = document.querySelector(".foot");
  if (ft) ft.textContent += " • " + APP_VER;
});

// ---------- ติดตั้ง PWA ----------
let deferredPrompt = null;
const installBtn = $("#installBtn");
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt = null; installBtn.hidden = true;
});
window.addEventListener("appinstalled", () => { installBtn.hidden = true; });

// ---------- ปุ่มหลัก ----------
$("#pasteBtn").addEventListener("click", async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (t) urlsEl.value = (urlsEl.value.trim() ? urlsEl.value.trim() + "\n" : "") + t.trim();
  } catch { alert("อ่านคลิปบอร์ดไม่ได้ — วางเองด้วย Ctrl+V ได้เลย"); }
});
$("#clearBtn").addEventListener("click", () => { urlsEl.value = ""; });
$("#openBtn").addEventListener("click", () => {
  fetch(BASE + "api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
});

async function startDownload(urls, opts = {}) {
  if (!serverOnline) { showTab("download"); alert("ออฟไลน์ — เปิดเซิร์ฟเวอร์ (ดับเบิลคลิก launcher) ก่อนจึงจะดาวน์โหลดได้"); return []; }
  const quality = document.querySelector('input[name="q"]:checked').value;
  const whole = $("#whole").checked;
  const live = opts.live !== undefined ? opts.live : autoPlayEl.checked;
  try {
    const r = await fetch(BASE + "api/download", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls, quality, whole, live }),
    });
    const j = await r.json();
    return j.ids || [];
  } catch { alert("ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจว่า launcher เปิดอยู่"); return []; }
}

dlBtn.addEventListener("click", async () => {
  const urls = urlsEl.value.split("\n").map((s) => s.trim()).filter(Boolean);
  if (!urls.length) { alert("ยังไม่ได้ใส่ URL"); return; }
  dlBtn.disabled = true; dlBtn.textContent = "กำลังส่งคำสั่ง…";
  await startDownload(urls);
  dlBtn.disabled = false; dlBtn.innerHTML = IC("download") + " ดาวน์โหลด";
});

function esc(s) { return (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// =====================================================================
//  พรีวิวสด = เล่นไฟล์ในเครื่องที่กำลังโหลด ผ่าน player ของเราเอง
// =====================================================================
// ===== โหลด /media รอบเดียว → เล่นสด + เก็บลงเครื่องพร้อมกัน (server ส่งออก 1x, ไม่เพิ่ม CPU) =====
const liveHandled = new Set();   // job.id ที่ถูกสตรีม (เล่น+เก็บ) แล้ว — กันโหลดซ้ำ
const AUDIO_EXTS = ["mp3", "m4a", "opus", "ogg", "wav", "aac"];
function guessMime(ext) {
  ext = (ext || "").toLowerCase();
  return ({ webm: "video/webm", mkv: "video/x-matroska", mov: "video/quicktime",
    mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg", wav: "audio/wav" })[ext] || "video/mp4";
}
function stopStream(v) {
  if (!v) return;
  if (v.__abort) { try { v.__abort.abort(); } catch {} v.__abort = null; }
  if (v.__streamUrl) { URL.revokeObjectURL(v.__streamUrl); v.__streamUrl = null; }
}
// ดาวน์โหลดไฟล์รอบเดียวจากเซิร์ฟเวอร์ แล้ว: (ก) เล่นสดด้วย growing-blob, (ข) เก็บลง IndexedDB
async function streamPlayAndStore(job, videoEl) {
  if (job.id) liveHandled.add(job.id);
  stopStream(videoEl);
  const ext = (job.rel.split(".").pop() || "mp4").toLowerCase();
  const audio = AUDIO_EXTS.includes(ext);
  const mime = guessMime(ext);
  const ctrl = new AbortController();
  videoEl.__abort = ctrl;
  const url = BASE + "media/" + job.rel.split("/").map(encodeURIComponent).join("/");
  const resp = await fetch(url, { signal: ctrl.signal });
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0, blobBytes = -1, started = false;

  const setBlob = (autoplay) => {
    const t = videoEl.currentTime, wasPlaying = !videoEl.paused;
    const u = URL.createObjectURL(new Blob(chunks, { type: mime }));
    const old = videoEl.__streamUrl; videoEl.__streamUrl = u;
    const onMeta = () => {
      videoEl.removeEventListener("loadedmetadata", onMeta);
      try { if (t > 0 && (!videoEl.duration || t < videoEl.duration)) videoEl.currentTime = t; } catch {}
      if (wasPlaying || autoplay) videoEl.play().catch(() => {});
      if (old) URL.revokeObjectURL(old);
    };
    videoEl.addEventListener("loadedmetadata", onMeta);
    videoEl.src = u;
    blobBytes = received;
  };
  // เล่นจน blob หมดแต่ยังโหลดไม่จบ → ผูก blob ใหม่ที่ใหญ่ขึ้น (จุดที่อาจสะดุดเล็กน้อย)
  const onEnded = () => { if (received > blobBytes) setBlob(true); };
  videoEl.addEventListener("ended", onEnded);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.length;
      if (!started && received > 1200000) { started = true; setBlob(true); }
    }
  } catch (e) {
    videoEl.removeEventListener("ended", onEnded);
    if (ctrl.signal.aborted) return null;     // ผู้ใช้ปิด/เปลี่ยนคลิป
    throw e;
  }
  videoEl.removeEventListener("ended", onEnded);

  // เก็บลงเครื่อง (IndexedDB)
  const id = ytId(job.rel) || job.rel;
  const finalBlob = new Blob(chunks, { type: mime });
  removeTombstone(id);
  if (!(await LibDB.has(id))) {
    const meta = { id, name: job.title || baseName(job.rel), ext, size: finalBlob.size, kind: audio ? "audio" : "video", addedAt: Date.now() };
    if (!audio) { const th = await makeThumb(finalBlob).catch(() => null); if (th) meta.thumb = th; }
    await LibDB.put(meta, finalBlob);
    if (!$("#tab-library").hidden) loadFiles();
  }
  purgeServer(job.rel);   // เก็บลงเครื่องแล้ว → ลบไฟล์บนเซิร์ฟเวอร์ (คืนพื้นที่)
  setBlob(!started);      // ผูกไฟล์เต็ม (seek ได้ทั้งคลิป)
  return finalBlob;
}

function makeLivePreview(job) {
  const wrap = document.createElement("div");
  wrap.className = "livewrap";
  const v = document.createElement("video");
  v.className = "livevid";
  v.controls = true; v.muted = true; v.playsInline = true; v.preload = "auto";
  const bar = document.createElement("div");
  bar.className = "livebar";
  bar.innerHTML = `<span class="livedot"><i></i> LIVE</span>
    <button class="ghost mini openfull">${IC("full")} เต็มจอ</button>`;
  bar.querySelector(".openfull").addEventListener("click", () => { v.requestFullscreen?.(); });
  wrap.appendChild(v);
  wrap.appendChild(bar);
  // โหลดรอบเดียว → เล่นสด + เก็บลงเครื่องพร้อมกัน
  streamPlayAndStore(job, v).catch(() => {});
  return wrap;
}

// =====================================================================
//  รายการงานดาวน์โหลด (in-place render)
// =====================================================================
const STATE_TH = { queued: "รอคิว", running: "กำลังโหลด", done: "เสร็จ ✓", error: "ผิดพลาด" };
const cards = new Map();
const autoOpened = new Set();
const prevState = new Map();
const lastJob = new Map();   // id -> job ล่าสุด (ให้ปุ่มพรีวิวอ่าน rel ปัจจุบัน)

function openPreview(card, job) {
  const box = card.querySelector(".player");
  const btn = card.querySelector(".playbtn");
  if (box.childNodes.length || !job.rel) return;
  box.appendChild(makeLivePreview(job));
  btn.textContent = "ซ่อนพรีวิว";
  btn.classList.add("on");
}
function closePreview(card) {
  const box = card.querySelector(".player");
  const btn = card.querySelector(".playbtn");
  box.querySelectorAll("video").forEach((v) => { stopStream(v); v.pause(); v.removeAttribute("src"); v.load(); });
  box.innerHTML = "";
  btn.textContent = "พรีวิว";
  btn.classList.remove("on");
}
function createCard(job) {
  const card = document.createElement("div");
  card.className = "job " + job.state;
  card.innerHTML = `
    <div class="top">
      <div class="meta"><div class="title"></div><div class="url"></div></div>
      <div class="right"><button class="playbtn ghost">พรีวิว</button><div class="state"></div></div>
    </div>
    <div class="bar"><i></i></div>
    <div class="err"></div>
    <div class="player"></div>`;
  const btn = card.querySelector(".playbtn");
  btn.addEventListener("click", () => {
    const j = lastJob.get(job.id) || job;
    if (card.querySelector(".player").childNodes.length) closePreview(card);
    else if (j.rel) openPreview(card, j);
    else alert("รอเริ่มโหลดสักครู่ แล้วพรีวิวจะเล่นได้");
  });
  jobsEl.prepend(card);
  cards.set(job.id, card);
  return card;
}
function updateCard(card, job) {
  card.className = "job " + job.state;
  card.querySelector(".title").textContent = job.title || job.note || "(กำลังอ่านข้อมูล…)";
  card.querySelector(".url").textContent = job.url;
  const speed = job.state === "running" && job.speed ? " • " + job.speed : "";
  const st = card.querySelector(".state");
  st.textContent = (STATE_TH[job.state] || job.state) + speed;
  st.className = "state " + job.state;
  card.querySelector(".bar > i").style.width = Math.round(job.pct || 0) + "%";
  card.querySelector(".err").textContent = job.error || "";
  // เปิดพรีวิวสดอัตโนมัติ เมื่อไฟล์เริ่มมีแล้ว (โหมด live + ติ๊ก autoplay)
  const btn = card.querySelector(".playbtn");
  btn.style.display = job.rel || job.live ? "" : "none";
  if (job.live && job.rel && autoPlayEl.checked && !autoOpened.has(job.id) && !liveHandled.has(job.id)) {
    autoOpened.add(job.id);
    openPreview(card, job);
  }
}
function renderJobs(jobs) {
  const seen = new Set();
  let justFinished = false;
  for (const job of jobs) {
    seen.add(job.id);
    lastJob.set(job.id, job);
    let card = cards.get(job.id);
    if (!card) card = createCard(job);
    updateCard(card, job);
    if (prevState.get(job.id) !== "done" && job.state === "done") {
      justFinished = true;
      ingestJob(job);   // โหลดเสร็จ → ดูดไฟล์เข้าเครื่อง (IndexedDB) แล้วลบสำเนาบนเซิร์ฟเวอร์
    }
    prevState.set(job.id, job.state);
  }
  for (const [id, card] of cards) {
    if (!seen.has(id)) { card.remove(); cards.delete(id); autoOpened.delete(id); prevState.delete(id); lastJob.delete(id); liveHandled.delete(id); }
  }
  // badge นับงานที่กำลังโหลด
  const active = jobs.filter((j) => j.state === "running" || j.state === "queued").length;
  const badge = $("#jobBadge");
  if (badge) { badge.hidden = active === 0; badge.textContent = active; }
}
async function pollJobs() {
  try { const r = await fetch(BASE + "api/status"); renderJobs(await r.json()); } catch {}
}
setInterval(pollJobs, 800);
pollJobs();

// =====================================================================
//  คลังวิดีโอในเครื่อง (เก็บใน IndexedDB → เล่นออฟไลน์ได้)
// =====================================================================
const gridEl = $("#grid");
const searchEl = $("#search");
const emptyLib = $("#emptyLib");
let allFiles = [];        // meta records จาก IndexedDB
let gridUrls = [];        // object URLs ของรูปย่อ (ไว้ revoke)

function fmtSize(b) {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b >= 1e3) return (b / 1e3).toFixed(0) + " KB";
  return (b || 0) + " B";
}
function clearGridUrls() { gridUrls.forEach((u) => URL.revokeObjectURL(u)); gridUrls = []; }

function renderGrid() {
  const q = (searchEl.value || "").toLowerCase().trim();
  const list = allFiles.filter((f) => !q || (f.name || "").toLowerCase().includes(q));
  emptyLib.hidden = allFiles.length !== 0;
  clearGridUrls();
  gridEl.innerHTML = list.map((f) => {
    let inner, cls = "thumb";
    if (f.kind === "audio") { inner = IC("music"); cls += " audio"; }
    else if (f.thumb) { const u = URL.createObjectURL(f.thumb); gridUrls.push(u); inner = `<img src="${u}"><span class="badge">${esc(f.ext)}</span>`; }
    else { inner = `<span class="badge">${esc(f.ext)}</span>`; cls += " noimg"; }
    return `<div class="cell" data-id="${esc(f.id)}" title="${esc(f.name)}">
      <div class="${cls}">${inner}
        <button class="addpl" title="เพิ่มไปเพลย์ลิสต์">${IC("add")}</button>
        <button class="delhere" title="ลบออกจากเครื่อง">${IC("trash")}</button></div>
      <div class="cap">${esc(f.name)}</div>
      <div class="capsub">${fmtSize(f.size)}</div>
    </div>`;
  }).join("");
  gridEl.querySelectorAll(".cell").forEach((c, i) => {
    const f = allFiles.find((x) => x.id === c.dataset.id);
    c.querySelector(".delhere").addEventListener("click", (ev) => { ev.stopPropagation(); deleteFile(f, c); });
    c.querySelector(".addpl").addEventListener("click", (ev) => { ev.stopPropagation(); openAddToPlaylist(f); });
    c.addEventListener("click", () => { if (f) { setQueueDevice(list, i); playDevice(f); } });
  });
}
async function loadFiles() {
  try { allFiles = await LibDB.allMeta(); renderGrid(); } catch (e) { console.warn(e); }
}
async function deleteFile(f, cell) {
  if (!f) return;
  if (!confirm(`ลบวิดีโอนี้ออกจากเครื่อง?\n\n${f.name}`)) return;
  try {
    await LibDB.del(f.id);
    addTombstone(f.id);                          // กันถูก sync นำเข้ากลับ
    allFiles = allFiles.filter((x) => x.id !== f.id);
    cell.remove();
    emptyLib.hidden = allFiles.length !== 0;
  } catch { alert("ลบไม่สำเร็จ"); }
}
// เล่นไฟล์ในเครื่องจาก IndexedDB (blob) — ออฟไลน์ได้
async function playDevice(meta) {
  try {
    const blob = await LibDB.getBlob(meta.id);
    if (!blob) { alert("ไฟล์หายไปจากเครื่อง"); return; }
    // ถ้ายังไม่มีคิว (หรือคลิปนี้ไม่อยู่ในคิว) → ตั้งคิวเป็นทั้งคลัง เพื่อให้ปุ่มถัดไป/ก่อนหน้าใช้ได้
    if (!pmQueue.some((q) => q.kind === "device" && q.ref === meta.id)) {
      await ensureFiles();
      const idx = allFiles.findIndex((f) => f.id === meta.id);
      if (idx >= 0) setQueueDevice(allFiles, idx);
    }
    openPlayerSrc(URL.createObjectURL(blob), meta.name, true, meta.id);
    setNowPlayingDevice(meta);
  } catch { alert("เปิดไฟล์ไม่ได้"); }
}
searchEl.addEventListener("input", renderGrid);
$("#refreshBtn").addEventListener("click", () => { loadFiles(); migrateServerLibrary(); });
loadFiles();

// ---- ดูดไฟล์ที่โหลดเสร็จจากเซิร์ฟเวอร์ → เก็บในเครื่อง (IndexedDB) ----
const ingesting = new Set();
function baseName(rel) { return (rel.split("/").pop() || rel).replace(/\.\w+$/, ""); }
// ลบไฟล์บนเซิร์ฟเวอร์ถาวร หลังเก็บลงเครื่องแล้ว (คืนพื้นที่ดิสก์)
function purgeServer(rel) {
  fetch(BASE + "api/purge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rel }) }).catch(() => {});
}
// tombstone: รหัสที่ผู้ใช้ลบไปแล้ว (กันถูกนำเข้ากลับตอน sync จากเซิร์ฟเวอร์)
function tombstones() { try { return new Set(JSON.parse(localStorage.getItem("mkt_removed") || "[]")); } catch { return new Set(); } }
function addTombstone(id) { const s = tombstones(); s.add(id); localStorage.setItem("mkt_removed", JSON.stringify([...s])); }
function removeTombstone(id) { const s = tombstones(); if (s.delete(id)) localStorage.setItem("mkt_removed", JSON.stringify([...s])); }

async function ingestJob(job) {
  if (!job || !job.rel) return;
  if (liveHandled.has(job.id)) return;     // สตรีม (เล่น+เก็บ) จัดการไปแล้ว ไม่ต้องโหลดซ้ำ
  const id = ytId(job.rel) || job.rel;
  if (ingesting.has(id)) return;
  ingesting.add(id);
  try {
    removeTombstone(id);                         // โหลดใหม่ = ตั้งใจเก็บ
    if (await LibDB.has(id)) { purgeServer(job.rel); return; }   // มีในเครื่องแล้ว → ลบสำเนาบนเซิร์ฟเวอร์
    const resp = await fetch(BASE + "media/" + job.rel.split("/").map(encodeURIComponent).join("/"));
    const blob = await resp.blob();
    const ext = (job.rel.split(".").pop() || "mp4").toLowerCase();
    const audio = ["mp3", "m4a", "opus", "ogg", "wav", "aac"].includes(ext);
    const meta = { id, name: job.title || baseName(job.rel), ext, size: blob.size, kind: audio ? "audio" : "video", addedAt: Date.now() };
    if (!audio) { const t = await makeThumb(blob).catch(() => null); if (t) meta.thumb = t; }
    await LibDB.put(meta, blob);
    purgeServer(job.rel);                         // เก็บลงเครื่องแล้ว → ลบไฟล์บนเซิร์ฟเวอร์
    if (!$("#tab-library").hidden) loadFiles();
  } catch (e) { console.warn("ingest failed", e); }
  finally { ingesting.delete(id); }
}
// สร้างรูปย่อฝั่งเครื่องจากวิดีโอ (ไม่ต้องใช้ ffmpeg)
function makeThumb(blob) {
  return new Promise((res, rej) => {
    const v = document.createElement("video"); v.muted = true; v.preload = "auto";
    const url = URL.createObjectURL(blob); v.src = url;
    const fail = () => { URL.revokeObjectURL(url); rej(new Error("thumb")); };
    const to = setTimeout(fail, 20000);
    v.onloadeddata = () => { try { v.currentTime = Math.min(2, (v.duration || 6) / 3); } catch {} };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas"); const W = 480;
        const ar = (v.videoWidth && v.videoHeight) ? v.videoHeight / v.videoWidth : 9 / 16;
        c.width = W; c.height = Math.round(W * ar);
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => { clearTimeout(to); URL.revokeObjectURL(url); res(b); }, "image/jpeg", 0.72);
      } catch (e) { clearTimeout(to); fail(); }
    };
    v.onerror = () => { clearTimeout(to); fail(); };
  });
}
// นำเข้าไฟล์ที่ยังค้างบนเซิร์ฟเวอร์เข้าเครื่อง (ครั้งเดียว / ตอนกดรีเฟรช)
let migrating = false;
async function migrateServerLibrary() {
  if (migrating) return;
  migrating = true;
  try {
    const files = await (await fetch(BASE + "api/files")).json();
    const dead = tombstones();
    for (const f of files) {
      const id = ytId(f.rel) || f.rel;
      if (dead.has(id)) continue;                          // ผู้ใช้ลบไปแล้ว — ปล่อยไว้บนเซิร์ฟเวอร์
      if (await LibDB.has(id)) { purgeServer(f.rel); continue; }  // มีในเครื่องแล้ว → ลบบนเซิร์ฟเวอร์
      await ingestJob({ rel: f.rel, title: f.name });      // ยังไม่มี → นำเข้าแล้ว purge (ในตัว)
    }
    loadFiles();
  } catch (e) { /* ออฟไลน์/ไม่มีเซิร์ฟเวอร์ ก็ข้ามไป */ }
  finally { migrating = false; }
}

// =====================================================================
//  เพลย์ลิสต์ (เก็บใน IndexedDB — ออฟไลน์ได้)
// =====================================================================
const libVideos = $("#libVideos"), libPlaylists = $("#libPlaylists");
const plGrid = $("#plGrid"), emptyPl = $("#emptyPl");
const plListView = $("#plListView"), plDetail = $("#plDetail");
const sheet = $("#sheet"), sheetList = $("#sheetList");
let plGridUrls = [], plDetailUrls = [], sheetVideo = null;

$$(".lt").forEach((b) => b.addEventListener("click", () => showLibView(b.dataset.lv)));
function showLibView(v) {
  $$(".lt").forEach((b) => b.classList.toggle("active", b.dataset.lv === v));
  libVideos.hidden = v !== "videos";
  libPlaylists.hidden = v !== "playlists";
  $("#search").style.display = v === "videos" ? "" : "none";
  if (v === "playlists") { plDetail.hidden = true; plListView.hidden = false; loadPlaylists(); }
}

async function ensureFiles() { if (!allFiles.length) { try { allFiles = await LibDB.allMeta(); } catch {} } }
function newId(p) { return p + Math.random().toString(36).slice(2, 9); }

async function loadPlaylists() {
  await ensureFiles();
  const pls = await LibDB.plAll();
  emptyPl.hidden = pls.length !== 0;
  plGridUrls.forEach((u) => URL.revokeObjectURL(u)); plGridUrls = [];
  plGrid.innerHTML = pls.map((pl) => {
    const items = (pl.items || []).map((id) => allFiles.find((f) => f.id === id)).filter(Boolean);
    const cover = items.find((f) => f.thumb);
    let thumb = "";
    if (cover) { const u = URL.createObjectURL(cover.thumb); plGridUrls.push(u); thumb = `<img src="${u}">`; }
    const n = pl.items ? pl.items.length : 0;
    return `<div class="cell plcell" data-id="${esc(pl.id)}">
      <div class="thumb pl${cover ? "" : " noimg"}">${thumb}<span class="pl-badge">${IC("playlist")} ${n}</span></div>
      <div class="cap">${esc(pl.name)}</div>
      <div class="capsub">${n} วิดีโอ</div>
    </div>`;
  }).join("");
  plGrid.querySelectorAll(".plcell").forEach((c) => c.addEventListener("click", () => openPlaylist(c.dataset.id)));
}
async function newPlaylist() {
  const name = (prompt("ชื่อเพลย์ลิสต์:") || "").trim();
  if (!name) return null;
  const pl = { id: newId("pl_"), name, items: [], createdAt: Date.now() };
  await LibDB.plPut(pl);
  return pl;
}
$("#newPlBtn").addEventListener("click", async () => { if (await newPlaylist()) loadPlaylists(); });

async function openPlaylist(id) {
  await ensureFiles();
  const pl = await LibDB.plGet(id);
  if (!pl) return;
  const items = (pl.items || []).map((vid) => allFiles.find((f) => f.id === vid)).filter(Boolean);
  plDetailUrls.forEach((u) => URL.revokeObjectURL(u)); plDetailUrls = [];
  plListView.hidden = true; plDetail.hidden = false;
  plDetail.innerHTML = `
    <div class="pl-head">
      <button class="iconbtn pl-back">${IC("back")}</button>
      <div class="pl-title">${esc(pl.name)}</div>
      <button class="iconbtn pl-del" title="ลบเพลย์ลิสต์">${IC("trash")}</button>
    </div>
    <button class="primary pl-playall"${items.length ? "" : " disabled"}>${IC("play")} เล่นทั้งหมด (${items.length})</button>
    <div class="grid pl-items"></div>
    ${items.length ? "" : '<p class="empty">ยังไม่มีวิดีโอ — เพิ่มจากปุ่ม + บนการ์ดในแท็บวิดีโอ</p>'}`;
  const grid = plDetail.querySelector(".pl-items");
  grid.innerHTML = items.map((f) => {
    let thumb = "";
    if (f.kind === "audio") thumb = IC("music");
    else if (f.thumb) { const u = URL.createObjectURL(f.thumb); plDetailUrls.push(u); thumb = `<img src="${u}">`; }
    return `<div class="cell" data-id="${esc(f.id)}">
      <div class="thumb${f.kind === "audio" ? " audio" : (f.thumb ? "" : " noimg")}">${thumb}<button class="plremove" title="เอาออกจากเพลย์ลิสต์">${IC("close")}</button></div>
      <div class="cap">${esc(f.name)}</div></div>`;
  }).join("");
  plDetail.querySelector(".pl-back").addEventListener("click", () => { plDetail.hidden = true; plListView.hidden = false; });
  plDetail.querySelector(".pl-del").addEventListener("click", async () => {
    if (confirm(`ลบเพลย์ลิสต์ "${pl.name}"?\n(วิดีโอในเครื่องไม่ถูกลบ)`)) { await LibDB.plDel(id); plDetail.hidden = true; plListView.hidden = false; loadPlaylists(); }
  });
  if (items.length) plDetail.querySelector(".pl-playall").addEventListener("click", () => { setQueueDevice(items, 0); playDevice(items[0]); });
  grid.querySelectorAll(".cell").forEach((c, i) => {
    c.querySelector(".plremove").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      pl.items = (pl.items || []).filter((x) => x !== c.dataset.id);
      await LibDB.plPut(pl); openPlaylist(id);
    });
    c.addEventListener("click", () => { setQueueDevice(items, i); playDevice(items[i]); });
  });
}

// ----- bottom sheet: เพิ่มไปเพลย์ลิสต์ -----
sheet.querySelectorAll("[data-sheet-close]").forEach((el) => el.addEventListener("click", () => { sheet.hidden = true; document.body.style.overflow = ""; }));
$("#sheetNew").addEventListener("click", async () => {
  const pl = await newPlaylist();
  if (pl && sheetVideo) { pl.items.push(sheetVideo.id); await LibDB.plPut(pl); }
  renderSheet();
});
async function openAddToPlaylist(f) {
  sheetVideo = f;
  await renderSheet();
  sheet.hidden = false; document.body.style.overflow = "hidden";
}
async function renderSheet() {
  const pls = await LibDB.plAll();
  if (!pls.length) { sheetList.innerHTML = `<div class="sheet-empty">ยังไม่มีเพลย์ลิสต์ — กดสร้างใหม่ด้านล่าง</div>`; return; }
  sheetList.innerHTML = pls.map((pl) => {
    const has = sheetVideo && (pl.items || []).includes(sheetVideo.id);
    return `<button class="sheet-item${has ? " has" : ""}" data-id="${esc(pl.id)}">
      <span class="si-name">${esc(pl.name)}</span><span class="si-mark">${has ? IC("check") : IC("add")}</span></button>`;
  }).join("");
  sheetList.querySelectorAll(".sheet-item").forEach((b) => b.addEventListener("click", async () => {
    const pl = await LibDB.plGet(b.dataset.id); if (!pl) return;
    pl.items = pl.items || [];
    if (pl.items.includes(sheetVideo.id)) pl.items = pl.items.filter((x) => x !== sheetVideo.id);
    else pl.items.push(sheetVideo.id);
    await LibDB.plPut(pl); renderSheet();
  }));
}

// =====================================================================
//  ค้นหา YouTube (ใช้ yt-dlp ytsearch — ไม่ต้องมี API key)
// =====================================================================
const ytForm = $("#ytForm");
const ytq = $("#ytq");
const ytResults = $("#ytResults");
const ytStatus = $("#ytStatus");

function fmtDur(s) {
  s = Math.floor(s || 0);
  if (!s) return "";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(ss).padStart(2, "0");
}
function fmtViews(n) {
  if (!n) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M ครั้ง";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K ครั้ง";
  return n + " ครั้ง";
}

// ---- autocomplete แนะนำคำค้น ----
const suggestEl = $("#suggest");
let sugItems = [], sugIndex = -1, sugTimer = null, sugSeq = 0;

function closeSuggest() {
  suggestEl.hidden = true; suggestEl.innerHTML = ""; sugItems = []; sugIndex = -1;
  ytq.setAttribute("aria-expanded", "false");
}
function renderSuggest() {
  if (!sugItems.length) { closeSuggest(); return; }
  suggestEl.innerHTML = sugItems.map((s, i) =>
    `<div class="sg${i === sugIndex ? " active" : ""}" data-i="${i}">🔍 ${esc(s)}</div>`).join("");
  suggestEl.hidden = false;
  ytq.setAttribute("aria-expanded", "true");
  suggestEl.querySelectorAll(".sg").forEach((el) => {
    el.addEventListener("mousedown", (e) => {   // mousedown ก่อน blur
      e.preventDefault();
      ytq.value = sugItems[+el.dataset.i];
      closeSuggest();
      ytForm.requestSubmit();
    });
  });
}
async function fetchSuggest() {
  const q = ytq.value.trim();
  if (q.length < 2) { closeSuggest(); return; }
  const seq = ++sugSeq;
  try {
    const list = await (await fetch(BASE + "api/suggest?q=" + encodeURIComponent(q))).json();
    if (seq !== sugSeq || document.activeElement !== ytq) return;
    sugItems = Array.isArray(list) ? list.slice(0, 10) : [];
    sugIndex = -1;
    renderSuggest();
  } catch { closeSuggest(); }
}
ytq.addEventListener("input", () => { clearTimeout(sugTimer); sugTimer = setTimeout(fetchSuggest, 150); });
ytq.addEventListener("focus", () => { if (ytq.value.trim().length >= 2) fetchSuggest(); });
ytq.addEventListener("blur", () => setTimeout(closeSuggest, 120));
ytq.addEventListener("keydown", (e) => {
  if (suggestEl.hidden || !sugItems.length) return;
  if (e.key === "ArrowDown") { e.preventDefault(); sugIndex = (sugIndex + 1) % sugItems.length; renderSuggest(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); sugIndex = (sugIndex - 1 + sugItems.length) % sugItems.length; renderSuggest(); }
  else if (e.key === "Enter") { if (sugIndex >= 0) { e.preventDefault(); ytq.value = sugItems[sugIndex]; closeSuggest(); ytForm.requestSubmit(); } }
  else if (e.key === "Escape") { closeSuggest(); }
});

// การ์ดวิดีโอ (ใช้ร่วมกันทั้งผลค้นหา + ฟีดหน้าแรก)
function renderVideoCards(list) {
  ytResults.innerHTML = list.map((v) => {
    const sub = esc(v.channel) + (v.views ? " • " + fmtViews(v.views) : (v.meta ? " • " + esc(v.meta) : ""));
    return `<div class="cell ytcell" data-url="${esc(v.url)}" data-title="${esc(v.title)}" title="${esc(v.title)}">
      <div class="thumb"><img loading="lazy" src="${esc(v.thumb)}" onerror="this.parentNode.classList.add('noimg')">
        ${v.duration ? `<span class="badge">${fmtDur(v.duration)}</span>` : ""}
        <button class="dlhere" title="โหลดคลิปนี้">${IC("download")}</button>
      </div>
      <div class="cap">${esc(v.title)}</div>
      <div class="capsub">${sub}</div>
    </div>`;
  }).join("");
  const qItems = list.map((v) => ({ url: v.url, title: v.title }));
  ytResults.querySelectorAll(".ytcell").forEach((c, i) => {
    const url = c.dataset.url, title = c.dataset.title;
    c.querySelector(".dlhere").addEventListener("click", async (ev) => {
      ev.stopPropagation();
      const btn = ev.currentTarget; btn.classList.add("busy");
      await startDownload([url]); btn.classList.remove("busy"); btn.classList.add("done"); setIcon(btn, "check");
      setTimeout(() => { btn.classList.remove("done"); setIcon(btn, "download"); }, 1600);
    });
    c.addEventListener("click", () => { setQueueRemote(qItems, i); playFromUrl(url, title); });
  });
}

// ฟีดหน้าแรก = วิดีโอแนะนำจากคลิปในคลัง
let homeSeq = 0;
async function loadHomeFeed() {
  const hint = $("#homeHint");
  const seq = ++homeSeq;
  if (hint) hint.hidden = true;
  ytResults.innerHTML = "";
  // seeds จากคลังในเครื่อง (IndexedDB)
  let metas = [];
  try { metas = await LibDB.allMeta(); } catch {}
  const libIds = new Set(metas.map((m) => m.id));
  const seeds = metas.map((m) => m.id).filter((id) => /^[\w-]{11}$/.test(id)).slice(0, 6);
  if (!seeds.length) {            // คลังว่าง → โชว์หน้าต้อนรับ
    ytStatus.textContent = "";
    if (hint) hint.hidden = false;
    return;
  }
  ytStatus.textContent = "กำลังโหลดวิดีโอแนะนำจากคลังของคุณ…";
  try {
    const list = await (await fetch(BASE + "api/home?ids=" + seeds.join(","))).json();
    if (seq !== homeSeq) return;
    const filtered = (Array.isArray(list) ? list : []).filter((v) => !libIds.has(v.id));
    if (!filtered.length) { ytStatus.textContent = "เปิดเซิร์ฟเวอร์เพื่อโหลดวิดีโอแนะนำ"; return; }
    ytStatus.textContent = "▶ แนะนำสำหรับคุณ — จากคลังของคุณ";
    renderVideoCards(filtered);
  } catch {
    if (seq !== homeSeq) return;
    ytStatus.textContent = "📴 ออฟไลน์ — ดูคลังที่บันทึกไว้ได้ที่แท็บ 🎞️ คลัง";
  }
}

ytForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  closeSuggest();
  const q = ytq.value.trim();
  if (!q) return;
  showTab("home");
  if (!serverOnline) { ytStatus.textContent = "📴 ต้องเปิดเซิร์ฟเวอร์ก่อนจึงจะค้นหาได้ — คลังที่บันทึกไว้ดูได้ที่แท็บ 🎞️ คลัง"; ytResults.innerHTML = ""; return; }
  const hint = $("#homeHint"); if (hint) hint.hidden = true;
  homeSeq++;   // ยกเลิกฟีดที่ค้างอยู่
  ytStatus.textContent = "กำลังค้นหา…";
  ytResults.innerHTML = "";
  try {
    const r = await fetch(BASE + "api/search?n=12&q=" + encodeURIComponent(q));
    const list = await r.json();
    if (list.error) { ytStatus.textContent = "ค้นหาไม่สำเร็จ: " + list.error; return; }
    if (!list.length) { ytStatus.textContent = "ไม่พบผลลัพธ์"; return; }
    ytStatus.textContent = `พบ ${list.length} รายการ — แตะการ์ดเพื่อเล่นทันที • ปุ่มมุมรูปเพื่อโหลดเก็บ`;
    renderVideoCards(list);
  } catch (err) {
    ytStatus.textContent = "ค้นหาไม่สำเร็จ — ตรวจว่า launcher เปิดอยู่";
  }
});

// =====================================================================
//  สถานะเซิร์ฟเวอร์ (ใช้เฉพาะตอนค้นหา/ดาวน์โหลด — ส่วนอื่นเป็น client-side)
// =====================================================================
let serverOnline = true;
const srvDot = $("#srvDot");
const offlineNote = $("#offlineNote");
function applyServerState() {
  document.body.classList.toggle("srv-off", !serverOnline);
  if (srvDot) srvDot.title = serverOnline ? "เซิร์ฟเวอร์: ออนไลน์" : "ออฟไลน์ — ดูคลังได้ปกติ (ค้นหา/โหลดต้องเปิดเซิร์ฟเวอร์)";
  if (offlineNote) offlineNote.hidden = serverOnline;
}
async function pingServer() {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 3000);
    await fetch(BASE + "api/config", { cache: "no-store", signal: c.signal });
    clearTimeout(t);
    serverOnline = true;
  } catch { serverOnline = false; }
  applyServerState();
}
window.addEventListener("online", pingServer);
window.addEventListener("offline", () => { serverOnline = false; applyServerState(); });
setInterval(pingServer, 20000);
pingServer();

// โหลดฟีดหน้าแรกตอนเปิดแอป
loadHomeFeed();

// =====================================================================
//  Custom Player — เล่นไฟล์ในเครื่องแบบ YouTube
// =====================================================================
const modal = $("#player");
const vid = $("#vid");
const stage = $("#stage");
const bigplay = $("#bigplay");
const seek = $("#seek");
const played = $("#played");
const buffered = $("#buffered");
const thumbdot = $("#thumbdot");
const timeEl = $("#time");
const btnPlay = $("#btnPlay");
const btnMute = $("#btnMute");
const volBar = $("#volBar");
const btnSpeed = $("#btnSpeed");
const btnFull = $("#btnFull");
const btnPip = $("#btnPip");
const nowTitle = $("#nowTitle");
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

function fmtTime(t) {
  if (!isFinite(t)) return "0:00";
  t = Math.max(0, Math.floor(t));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}

const vloading = $("#vloading");
const vloadingText = $("#vloadingText");
let playToken = 0;   // กันการเล่นซ้อนเมื่อคลิกหลายคลิป

function showLoading(msg) { vloadingText.textContent = msg; vloading.hidden = false; }
function hideLoading() { vloading.hidden = true; }

function setVidSource(rel) {
  vid.dataset.rel = rel;
  vid.src = BASE + "media/" + rel.split("/").map(encodeURIComponent).join("/");
}

// ---- วิดีโอแนะนำ (related) ----
const relatedEl = $("#related");
const relatedHead = $("#relatedHead");
function ytId(s) {
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;   // เป็น id ตรงๆ อยู่แล้ว
  const m = s.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)
        || s.match(/\[([\w-]{11})\]/);   // จากชื่อไฟล์ local "ชื่อ [ID].mp4"
  return m ? m[1] : null;
}
let relatedToken = 0;
async function loadRelated(idOrUrl) {
  const id = ytId(idOrUrl);
  relatedEl.innerHTML = ""; relatedHead.hidden = true;
  if (!id) return;
  const token = ++relatedToken;
  try {
    const list = await (await fetch(BASE + "api/related?id=" + id)).json();
    if (token !== relatedToken || !Array.isArray(list) || !list.length) return;
    relatedHead.hidden = false;
    relatedEl.innerHTML = list.map((v) => `
      <div class="rcard" data-url="${esc(v.url)}" data-title="${esc(v.title)}" title="${esc(v.title)}">
        <div class="rthumb"><img loading="lazy" src="${esc(v.thumb)}" onerror="this.style.opacity=0"></div>
        <div class="rcap">${esc(v.title)}</div>
        <div class="rsub">${esc(v.channel)}${v.meta ? " • " + esc(v.meta) : ""}</div>
      </div>`).join("");
    const rItems = list.map((v) => ({ url: v.url, title: v.title }));
    relatedEl.querySelectorAll(".rcard").forEach((c, i) =>
      c.addEventListener("click", () => { setQueueRemote(rItems, i); playFromUrl(c.dataset.url, c.dataset.title); }));
  } catch {}
}

// ---- fallback: ฝัง player ของ YouTube/FB เมื่อโหลดไฟล์ไม่ได้ ----
function embedUrlFor(url) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`;
  if (/facebook\.com|fb\.watch/.test(url))
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
  return null;
}
function showEmbed(url, name) {
  const embed = embedUrlFor(url);
  if (!embed) return false;
  clearEmbed();
  hideLoading();
  const ifr = document.createElement("iframe");
  ifr.className = "embedframe";
  ifr.src = embed;
  ifr.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";
  ifr.allowFullscreen = true;
  stage.appendChild(ifr);
  stage.classList.add("embedding");
  stage.style.removeProperty("--va");   // embed → กลับเป็น 16/9 มาตรฐาน
  nowTitle.textContent = (name || "") + "  ·  ▶ เล่นผ่าน YouTube (ดาวน์โหลดไม่ได้)";
  loadRelated(url);
  return true;
}
function clearEmbed() {
  stage.querySelectorAll(".embedframe").forEach((e) => e.remove());
  stage.classList.remove("embedding");
}

let curBlobUrl = null;
function revokeBlobUrl() { if (curBlobUrl) { URL.revokeObjectURL(curBlobUrl); curBlobUrl = null; } }

function openPlayer(f) {
  playToken++;
  hideLoading();
  clearEmbed();
  stopStream(vid);
  revokeBlobUrl();
  setVidSource(f.rel);
  nowTitle.textContent = f.name;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  vid.play().catch(() => {});
  loadRelated(f.rel);   // ดึงจาก [ID] ในชื่อไฟล์
}

// เล่นจาก URL ตรงๆ (blob: ของไฟล์ในเครื่อง) — ออฟไลน์ได้
function openPlayerSrc(url, name, isBlob, libId) {
  playToken++;
  hideLoading();
  clearEmbed();
  stopStream(vid);
  revokeBlobUrl();
  if (isBlob) curBlobUrl = url;
  stage.style.removeProperty("--va");
  vid.dataset.rel = "";
  vid.src = url;
  nowTitle.textContent = name || "";
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  vid.play().catch(() => {});
  loadRelated(libId || "");   // related จาก YouTube id (ถ้ามี — ต้องออนไลน์)
}

// โหลดวิดีโอใหม่โดยคงตำแหน่งเดิม — ใช้เป็น safety net เฉพาะตอนจบก่อนเวลาจริง
function reloadKeepTime(v) {
  const t = v.currentTime, wasPlaying = !v.paused, src = v.src;
  if (!src) return;
  const onLoaded = () => {
    v.removeEventListener("loadedmetadata", onLoaded);
    try { if (t > 0 && (!v.duration || t < v.duration)) v.currentTime = t; } catch {}
    if (wasPlaying) v.play().catch(() => {});
  };
  v.addEventListener("loadedmetadata", onLoaded);
  v.src = "";          // ล้างก่อน
  v.load();
  v.src = src;         // ตั้งใหม่ → บังคับโหลดสด (ได้ขนาดไฟล์ล่าสุด)
  v.load();
}
let lastRecover = 0;
function recoverIfPremature(v) {
  if (!v.dataset.rel) return;
  const now = (window.performance && performance.now()) || 0;
  if (now - lastRecover < 3000) return;   // กันรีโหลดถี่เกิน
  // จบก่อนถึงเวลาจริง (เบราว์เซอร์ค้างที่ขนาดไฟล์ตอนเริ่มโหลด) → โหลดไฟล์เต็มต่อ
  if (v.duration && isFinite(v.duration) && v.currentTime < v.duration - 1.5) {
    lastRecover = now;
    reloadKeepTime(v);
  }
}
// เฉพาะ 'ended' ที่ยังไม่ถึงเวลาจริง (ไม่ผูก 'error' เพื่อกัน reload วน)
vid.addEventListener("ended", () => recoverIfPremature(vid));
// ปรับสัดส่วนเวที player ตามวิดีโอจริง (กันแนวตั้ง/แนวนอนล้นหรือเล็กเกินไป)
vid.addEventListener("loadedmetadata", () => {
  if (vid.videoWidth && vid.videoHeight) stage.style.setProperty("--va", vid.videoWidth + " / " + vid.videoHeight);
});
// ===== Media Session — คอนโทรลบน lock screen / notification (แบบ Spotify) =====
let pmQueue = [], pmIndex = -1;   // คิว: {kind:'device'|'remote', ref, name, meta?}
let msArtUrl = null;
function setNowPlaying(title, artUrl) {
  if (!("mediaSession" in navigator)) return;
  try {
    const artwork = artUrl ? [96, 192, 384, 512].map((s) => ({ src: artUrl, sizes: s + "x" + s, type: "image/jpeg" })) : [];
    navigator.mediaSession.metadata = new MediaMetadata({ title: title || "meekinTube", artist: "meekinTube", album: "meekinTube", artwork });
  } catch {}
}
function setNowPlayingDevice(meta) {
  if (msArtUrl) { URL.revokeObjectURL(msArtUrl); msArtUrl = null; }
  let art = null;
  if (meta && meta.thumb) { art = URL.createObjectURL(meta.thumb); msArtUrl = art; }
  setNowPlaying(meta && meta.name, art);
}
function setNowPlayingRemote(title, ytid) {
  if (msArtUrl) { URL.revokeObjectURL(msArtUrl); msArtUrl = null; }
  setNowPlaying(title, ytid ? `https://i.ytimg.com/vi/${ytid}/hqdefault.jpg` : null);
}
function updatePositionState() {
  if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = vid.duration;
  if (d && isFinite(d) && d > 0) {
    try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(Math.max(0, vid.currentTime), d), playbackRate: vid.playbackRate || 1 }); } catch {}
  }
}
function setQueueDevice(list, i) { pmQueue = list.map((f) => ({ kind: "device", ref: f.id, name: f.name, meta: f })); pmIndex = i; }
function setQueueRemote(items, i) { pmQueue = items.map((x) => ({ kind: "remote", ref: x.url, name: x.title })); pmIndex = i; }
function playQueueItem(i) {
  if (i < 0 || i >= pmQueue.length) return;
  pmIndex = i;
  const it = pmQueue[i];
  if (it.kind === "device") { const m = allFiles.find((f) => f.id === it.ref) || it.meta; if (m) playDevice(m); }
  else playFromUrl(it.ref, it.name);
}
function playAdjacent(dir) { if (pmQueue.length) playQueueItem(pmIndex + dir); }

if ("mediaSession" in navigator) {
  const ms = navigator.mediaSession;
  const H = (a, fn) => { try { ms.setActionHandler(a, fn); } catch {} };
  H("play", () => vid.play());
  H("pause", () => vid.pause());
  // ไม่ตั้ง seekbackward/seekforward — ไม่งั้น iOS เอาปุ่มเลื่อนมาแทนปุ่มเปลี่ยนคลิปบน lock screen
  H("seekbackward", null);
  H("seekforward", null);
  H("seekto", (d) => { if (d.fastSeek && "fastSeek" in vid) vid.fastSeek(d.seekTime); else vid.currentTime = d.seekTime; updatePositionState(); });
  H("previoustrack", () => playAdjacent(-1));
  H("nexttrack", () => playAdjacent(1));
  H("stop", () => closePlayer());
}
vid.addEventListener("play", () => { try { navigator.mediaSession.playbackState = "playing"; } catch {} updatePositionState(); });
vid.addEventListener("pause", () => { try { navigator.mediaSession.playbackState = "paused"; } catch {} });
vid.addEventListener("loadedmetadata", updatePositionState);
vid.addEventListener("seeked", updatePositionState);
vid.addEventListener("ratechange", updatePositionState);
// จบคลิปจริง → เล่นถัดไปในคิวอัตโนมัติ (แบบ Spotify)
vid.addEventListener("ended", () => {
  if (vid.duration && isFinite(vid.duration) && vid.currentTime >= vid.duration - 1.5 &&
      pmIndex >= 0 && pmIndex < pmQueue.length - 1) {
    playAdjacent(1);
  }
});

function closePlayer() {
  playToken++;   // ยกเลิก polling ที่ค้างอยู่
  stopStream(vid);
  vid.pause(); vid.removeAttribute("src"); vid.load();
  clearEmbed();
  revokeBlobUrl();
  try { navigator.mediaSession.playbackState = "none"; navigator.mediaSession.metadata = null; } catch {}
  stage.style.removeProperty("--va");
  relatedToken++; relatedEl.innerHTML = ""; relatedHead.hidden = true;
  modal.hidden = true;
  hideLoading();
  document.body.style.overflow = "";
}
modal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closePlayer));

// คลิกผลค้นหา → เริ่มโหลด progressive แล้วสตรีมไฟล์ที่กำลังโตเข้า player ทันที
async function playFromUrl(url, name) {
  const token = ++playToken;
  stopStream(vid); revokeBlobUrl(); clearEmbed();
  vid.removeAttribute("src"); vid.load(); vid.dataset.rel = "";
  nowTitle.textContent = name || "";
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  showLoading("กำลังเริ่ม…");
  loadRelated(url);
  const ids = await startDownload([url], { live: true });
  if (token !== playToken) return;
  if (!ids.length) { if (!showEmbed(url, name)) showLoading("เริ่มไม่สำเร็จ"); return; }
  const jid = ids[0];
  liveHandled.add(jid);                       // กันการ์ดในแท็บเปิดพรีวิวซ้ำ
  // รอจนเซิร์ฟเวอร์เริ่มเขียนไฟล์ (มี rel)
  let job = null;
  for (let i = 0; i < 90; i++) {
    if (token !== playToken) return;
    try { job = (await (await fetch(BASE + "api/status")).json()).find((j) => j.id === jid); } catch {}
    if (job && job.rel) break;
    if (job && job.state === "error") {
      if (!showEmbed(url, job.title || name)) showLoading("เล่นไม่ได้: " + (job.error || "ไม่ทราบสาเหตุ"));
      return;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  if (token !== playToken) return;
  if (!job || !job.rel) { if (!showEmbed(url, name)) showLoading("รอนานเกินไป — ลองใหม่อีกครั้ง"); return; }
  nowTitle.textContent = job.title || name || "";
  setNowPlayingRemote(job.title || name, ytId(url));
  showLoading("กำลังสตรีม + บันทึกลงเครื่อง…");
  const onPlaying = () => { hideLoading(); vid.removeEventListener("playing", onPlaying); };
  vid.addEventListener("playing", onPlaying);
  try {
    await streamPlayAndStore(job, vid);   // โหลดรอบเดียว: เล่น + เก็บ
    if (token === playToken) hideLoading();
  } catch (e) {
    vid.removeEventListener("playing", onPlaying);
    if (token === playToken && !showEmbed(url, job.title || name)) showLoading("เล่นไม่ได้");
  }
}

function togglePlay() { if (vid.paused) vid.play(); else vid.pause(); }
btnPlay.addEventListener("click", togglePlay);
bigplay.addEventListener("click", togglePlay);
vid.addEventListener("click", togglePlay);
vid.addEventListener("play", () => { setIcon(btnPlay, "pause"); stage.classList.add("playing"); });
vid.addEventListener("pause", () => { setIcon(btnPlay, "play"); stage.classList.remove("playing"); });

vid.addEventListener("timeupdate", () => {
  const d = vid.duration || 0;
  played.style.width = (d ? (vid.currentTime / d) * 100 : 0) + "%";
  thumbdot.style.left = (d ? (vid.currentTime / d) * 100 : 0) + "%";
  timeEl.textContent = fmtTime(vid.currentTime) + " / " + fmtTime(d);
});
vid.addEventListener("progress", () => {
  if (vid.buffered.length && vid.duration) {
    buffered.style.width = (vid.buffered.end(vid.buffered.length - 1) / vid.duration) * 100 + "%";
  }
});

// ลาก/คลิกไทม์ไลน์
let scrubbing = false;
function seekFromX(clientX) {
  const r = seek.getBoundingClientRect();
  const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  if (vid.duration) vid.currentTime = frac * vid.duration;
}
seek.addEventListener("pointerdown", (e) => { scrubbing = true; seek.setPointerCapture(e.pointerId); seekFromX(e.clientX); });
seek.addEventListener("pointermove", (e) => { if (scrubbing) seekFromX(e.clientX); });
seek.addEventListener("pointerup", () => { scrubbing = false; });

// เสียง
function applyMuteIcon() { setIcon(btnMute, (vid.muted || vid.volume === 0) ? "volmute" : "vol"); }
btnMute.addEventListener("click", () => { vid.muted = !vid.muted; applyMuteIcon(); });
volBar.addEventListener("input", () => { vid.volume = +volBar.value; vid.muted = +volBar.value === 0; applyMuteIcon(); });
vid.addEventListener("volumechange", () => { volBar.value = vid.muted ? 0 : vid.volume; applyMuteIcon(); });

// ความเร็ว
btnSpeed.addEventListener("click", () => {
  const i = SPEEDS.indexOf(vid.playbackRate);
  const next = SPEEDS[(i + 1) % SPEEDS.length];
  vid.playbackRate = next;
  btnSpeed.textContent = (next % 1 === 0 ? next : next) + "×";
});

// เต็มจอ / PiP
btnFull.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else stage.requestFullscreen?.();
});
btnPip.addEventListener("click", async () => {
  try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await vid.requestPictureInPicture(); } catch {}
});
stage.addEventListener("dblclick", () => btnFull.click());

// คีย์ลัด (เฉพาะตอนเปิด player)
document.addEventListener("keydown", (e) => {
  if (modal.hidden) return;
  if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === "escape") { closePlayer(); return; }
  if (k === " " || k === "k") { e.preventDefault(); togglePlay(); }
  else if (k === "arrowright") vid.currentTime += 5;
  else if (k === "arrowleft") vid.currentTime -= 5;
  else if (k === "l") vid.currentTime += 10;
  else if (k === "j") vid.currentTime -= 10;
  else if (k === "arrowup") { e.preventDefault(); vid.volume = Math.min(1, vid.volume + 0.1); }
  else if (k === "arrowdown") { e.preventDefault(); vid.volume = Math.max(0, vid.volume - 0.1); }
  else if (k === "m") { vid.muted = !vid.muted; applyMuteIcon(); }
  else if (k === "f") btnFull.click();
  else if (k >= "0" && k <= "9" && vid.duration) vid.currentTime = (parseInt(k, 10) / 10) * vid.duration;
});
