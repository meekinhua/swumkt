// ====================================================================
//  YOLO Detect — mobile field app
// ====================================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const PERSON_CLASS = "0";
const state = {
  engine: "device",        // device (on-device, offline) | server
  size: 320,               // on-device input size
  mode: "people",          // people | all | custom
  conf: 0.35,
  showBoxes: true,
  keepAwake: true,
  running: false,
  facing: "environment",
  peak: 0,
  sum: 0,
  samples: 0,
};

let detector = null;     // OnDeviceDetector instance (lazy)

async function ensureDetector() {
  if (!detector) detector = new OnDeviceDetector();
  if (!detector.ready) {
    await detector.init({ size: state.size, onStatus: (m) => conn(m, "ok") });
  } else {
    detector.setSize(state.size);
  }
}

// class ids as a Set for the on-device detector (null = all)
function classIdSet() {
  if (state.mode === "all") return null;
  if (state.mode === "people") return new Set([0]);
  const ids = Array.from($("#classFilter").selectedOptions).map((o) => parseInt(o.value, 10));
  return ids.length ? new Set(ids) : null;
}

// ---------- connection status pill ----------
let connTimer = null;
function conn(text, cls = "") {
  const el = $("#connStatus");
  el.textContent = text;
  el.className = "conn show " + cls;
  clearTimeout(connTimer);
  if (cls !== "err") connTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

// ---------- class list (from embedded COCO names → works offline) ----------
(function populateClasses() {
  const sel = $("#classFilter");
  (window.COCO_NAMES || []).forEach((name, id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = name;
    sel.appendChild(o);
  });
  conn("พร้อมใช้งาน", "ok");
})();

// ---------- view switching ----------
$$(".tabbtn").forEach((b) =>
  b.addEventListener("click", () => switchView(b.dataset.view))
);
function switchView(name) {
  $$(".tabbtn").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.remove("active"));
  $("#view-" + name).classList.add("active");
  if (name !== "live") stopCamera();
  if (name === "log") renderLog();
}

// ---------- settings sheet ----------
$("#settingsBtn").addEventListener("click", openSheet);
$("#closeSheet").addEventListener("click", closeSheet);
$("#sheetBackdrop").addEventListener("click", closeSheet);
function openSheet() { $("#settingsSheet").hidden = false; $("#sheetBackdrop").hidden = false; }
function closeSheet() { $("#settingsSheet").hidden = true; $("#sheetBackdrop").hidden = true; }

// engine segmented control (on-device vs server)
$$("#engineSeg .seg-btn").forEach((b) =>
  b.addEventListener("click", async () => {
    $$("#engineSeg .seg-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.engine = b.dataset.engine;
    $("#sizeField").hidden = state.engine !== "device";
    if (state.running) { stopCamera(); await startCamera(); }
  })
);

// input-size segmented control (on-device)
$$("#sizeSeg .seg-btn").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#sizeSeg .seg-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.size = parseInt(b.dataset.size, 10);
    if (detector) detector.setSize(state.size);
  })
);

// mode segmented control
$$("#modeSeg .seg-btn").forEach((b) =>
  b.addEventListener("click", () => {
    $$("#modeSeg .seg-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    state.mode = b.dataset.mode;
    $("#classField").hidden = state.mode !== "custom";
    $("#liveLabel").textContent = state.mode === "people" ? "คน" : "วัตถุ";
    $("#hudMain").querySelector(".hud-icon").textContent = state.mode === "people" ? "👥" : "🎯";
    pushSettings();
  })
);
$("#classFilter").addEventListener("change", pushSettings);

$("#conf").addEventListener("input", (e) => {
  state.conf = parseFloat(e.target.value);
  $("#confVal").textContent = state.conf.toFixed(2);
  pushSettings();
});
$("#wakeToggle").addEventListener("change", (e) => {
  state.keepAwake = e.target.checked;
  if (state.running) state.keepAwake ? requestWake() : releaseWake();
});
$("#boxToggle").addEventListener("change", (e) => {
  state.showBoxes = e.target.checked;
  if (!state.showBoxes) octx.clearRect(0, 0, overlay.width, overlay.height);
});

function classesParam() {
  if (state.mode === "people") return PERSON_CLASS;
  if (state.mode === "all") return "";
  return Array.from($("#classFilter").selectedOptions).map((o) => o.value).join(",");
}

// ====================================================================
//  LIVE camera + websocket
// ====================================================================
const video = $("#video");
const overlay = $("#overlay");
const octx = overlay.getContext("2d");
const grab = document.createElement("canvas");
const gctx = grab.getContext("2d");

let ws = null, stream = null, waiting = false, lastSend = 0, lastFrame = performance.now();
let wakeLock = null;

$("#startBtn").addEventListener("click", () => (state.running ? stopCamera() : startCamera()));
$("#flipBtn").addEventListener("click", flipCamera);
$("#snapBtn").addEventListener("click", snapshot);

async function startCamera() {
  try {
    conn("กำลังเปิดกล้อง…");
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    sizeCanvas();
    state.running = true;
    state.peak = 0; state.sum = 0; state.samples = 0;
    $("#idle").hidden = true;
    $("#snapBtn").disabled = false;
    const b = $("#startBtn");
    b.classList.add("running");
    b.innerHTML = "⏹<span>หยุด</span>";
    if (state.keepAwake) requestWake();
    if (state.engine === "device") {
      await ensureDetector();
    } else {
      openWs();
    }
    requestAnimationFrame(loop);
    conn("เริ่มนับแล้ว", "ok");
  } catch (e) {
    conn("เปิดกล้องไม่ได้: " + e.message, "err");
    alert("เปิดกล้องไม่ได้: " + e.message + "\n\nบนมือถือต้องเปิดผ่าน HTTPS และอนุญาตสิทธิ์กล้อง");
  }
}

function stopCamera() {
  state.running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  if (ws) { ws.close(); ws = null; }
  octx.clearRect(0, 0, overlay.width, overlay.height);
  $("#idle").hidden = false;
  $("#snapBtn").disabled = true;
  const b = $("#startBtn");
  b.classList.remove("running");
  b.innerHTML = "▶<span>เริ่มนับ</span>";
  $("#fpsStat").textContent = "— FPS";
  releaseWake();
}

async function flipCamera() {
  state.facing = state.facing === "environment" ? "user" : "environment";
  if (state.running) { stopCamera(); await startCamera(); }
}

function sizeCanvas() {
  overlay.width = video.videoWidth || 1280;
  overlay.height = video.videoHeight || 720;
  grab.width = 640;
  grab.height = Math.round((640 * overlay.height) / overlay.width) || 480;
}

function openWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/detect`);
  ws.onopen = pushSettings;
  ws.onmessage = (ev) => {
    waiting = false;
    const d = JSON.parse(ev.data);
    if (d.error) { conn(d.error, "err"); return; }
    if (state.showBoxes) drawBoxes(d.detections, grab.width, grab.height);
    updateHud(d);
  };
  ws.onclose = () => { if (state.running) conn("การเชื่อมต่อหลุด", "err"); };
}

function pushSettings() {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(JSON.stringify({ conf: state.conf, classes: classesParam() }));
}

async function loop() {
  if (!state.running) return;
  const now = performance.now();

  if (state.engine === "device") {
    // on-device inference — serialized (await before next frame)
    if (detector && detector.ready && !waiting && video.readyState >= 2) {
      waiting = true;
      try {
        const res = await detector.detect(video, { conf: state.conf, classIds: classIdSet() });
        if (state.showBoxes) drawBoxes(res.detections, res.fw, res.fh);
        updateHud(res);
      } catch (e) {
        conn("ตรวจจับล้มเหลว: " + e.message, "err");
      }
      waiting = false;
    }
  } else {
    // server inference — throttled frame send over WebSocket
    if (ws && ws.readyState === WebSocket.OPEN && !waiting && now - lastSend > 80 && video.readyState >= 2) {
      gctx.drawImage(video, 0, 0, grab.width, grab.height);
      ws.send(JSON.stringify({ image: grab.toDataURL("image/jpeg", 0.6), conf: state.conf, classes: classesParam() }));
      waiting = true;
      lastSend = now;
    }
  }
  requestAnimationFrame(loop);
}

let curCount = 0;
function updateHud(d) {
  curCount = state.mode === "people" ? (d.counts.person || 0) : d.total;
  $("#liveCount").textContent = curCount;
  state.peak = Math.max(state.peak, curCount);
  state.sum += curCount; state.samples++;
  $("#peakCount").textContent = state.peak;
  $("#avgCount").textContent = (state.sum / state.samples).toFixed(1);

  const now = performance.now();
  const fps = 1000 / (now - lastFrame); lastFrame = now;
  $("#fpsStat").textContent = `${fps.toFixed(1)} FPS`;

  // class chips (non-people modes)
  const chips = $("#liveChips");
  if (state.mode === "people") { chips.innerHTML = ""; return; }
  chips.innerHTML = "";
  Object.entries(d.counts).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => {
    const el = document.createElement("div");
    el.className = "chip";
    el.innerHTML = `${n} <b>${c}</b>`;
    chips.appendChild(el);
  });
}

function drawBoxes(dets, fw, fh) {
  const sx = overlay.width / (fw || grab.width), sy = overlay.height / (fh || grab.height);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  octx.lineWidth = Math.max(2, overlay.width / 320);
  octx.font = `${Math.max(14, overlay.width / 40)}px sans-serif`;
  for (const d of dets) {
    const [x1, y1, x2, y2] = d.box;
    const X = x1 * sx, Y = y1 * sy, W = (x2 - x1) * sx, H = (y2 - y1) * sy;
    octx.strokeStyle = "#22c55e";
    octx.strokeRect(X, Y, W, H);
  }
}

// ---------- wake lock ----------
async function requestWake() {
  try { if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen"); } catch {}
}
function releaseWake() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.running && state.keepAwake) requestWake();
});

// ====================================================================
//  Count log (localStorage)
// ====================================================================
const LOG_KEY = "yolo_count_log";
function getLog() { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { return []; } }
function setLog(l) { localStorage.setItem(LOG_KEY, JSON.stringify(l)); }

function snapshot() {
  const entry = {
    t: new Date().toISOString(),
    count: curCount,
    peak: state.peak,
    mode: state.mode,
    label: state.mode === "people" ? "คน" : "วัตถุ",
  };
  const log = getLog();
  log.unshift(entry);
  setLog(log);
  if (navigator.vibrate) navigator.vibrate(40);
  showToast(`บันทึกแล้ว: ${entry.count} ${entry.label}`);
}

function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 1600);
}

function renderLog() {
  const list = $("#logList");
  const log = getLog();
  if (!log.length) { list.innerHTML = '<div class="log-empty">ยังไม่มีบันทึก<br>กด 📸 บันทึก ขณะนับสด</div>'; return; }
  list.innerHTML = "";
  for (const e of log) {
    const d = new Date(e.t);
    const when = d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
    const el = document.createElement("div");
    el.className = "log-item";
    el.innerHTML = `<div><div class="val">${e.count} <small>${e.label}</small></div>
      <div class="when">${when}</div></div>
      <div class="what">สูงสุด ${e.peak}</div>`;
    list.appendChild(el);
  }
}

$("#clearLog").addEventListener("click", () => {
  if (confirm("ล้างบันทึกทั้งหมด?")) { setLog([]); renderLog(); }
});
$("#exportCsv").addEventListener("click", () => {
  const log = getLog();
  if (!log.length) { showToast("ไม่มีข้อมูลให้ส่งออก"); return; }
  const rows = [["datetime", "count", "peak", "mode"]];
  for (const e of log) rows.push([e.t, e.count, e.peak, e.mode]);
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `count-log-${Date.now()}.csv`;
  a.click();
});

// ====================================================================
//  Image upload
// ====================================================================
setupDrop($("#imgDrop"), $("#imgInput"), handleImage);
async function handleImage(file) {
  if (state.engine === "device") {
    try {
      conn("กำลังโหลดเครื่องตรวจจับ…");
      await ensureDetector();
      conn("กำลังตรวจจับ…");
      const img = await loadImage(file);
      const res = await detector.detect(img, { conf: state.conf, classIds: classIdSet() });
      $("#imgResult").src = annotate(img, res.detections);
      renderGrid("#counts-image", res.counts, res.total);
      conn(`เสร็จ · ${res.infer_ms} ms (on-device)`, "ok");
    } catch (e) { conn("ผิดพลาด: " + e.message, "err"); }
    return;
  }
  conn("กำลังตรวจจับ…");
  const fd = new FormData();
  fd.append("file", file); fd.append("conf", state.conf); fd.append("classes", classesParam());
  try {
    const d = await (await fetch("/api/detect/image", { method: "POST", body: fd })).json();
    if (d.error) return conn(d.error, "err");
    $("#imgResult").src = d.image;
    renderGrid("#counts-image", d.counts, d.total);
    conn(`เสร็จ · ${d.infer_ms} ms`, "ok");
  } catch (e) { conn("ผิดพลาด: " + e.message, "err"); }
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// draw image + detection boxes on a canvas, return a data URL
function annotate(img, dets) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  x.lineWidth = Math.max(2, c.width / 320);
  x.font = `${Math.max(14, c.width / 45)}px sans-serif`;
  x.textBaseline = "bottom";
  for (const d of dets) {
    const [x1, y1, x2, y2] = d.box;
    x.strokeStyle = "#22c55e";
    x.strokeRect(x1, y1, x2 - x1, y2 - y1);
    const label = `${d.name} ${d.conf}`;
    const tw = x.measureText(label).width + 8;
    x.fillStyle = "#22c55e";
    x.fillRect(x1, y1 - 20, tw, 20);
    x.fillStyle = "#06210f";
    x.fillText(label, x1 + 4, y1 - 3);
  }
  return c.toDataURL("image/jpeg", 0.9);
}

// ====================================================================
//  Video upload
// ====================================================================
setupDrop($("#vidDrop"), $("#vidInput"), handleVideo);
async function handleVideo(file) {
  conn("กำลังประมวลผลวิดีโอ…");
  $("#vidProgress").hidden = false;
  const fd = new FormData();
  fd.append("file", file); fd.append("conf", state.conf); fd.append("classes", classesParam());
  try {
    const d = await (await fetch("/api/detect/video", { method: "POST", body: fd })).json();
    $("#vidProgress").hidden = true;
    if (d.error) return conn(d.error, "err");
    $("#vidResult").src = d.video_url;
    renderGrid("#counts-video", d.counts, d.total);
    conn(`เสร็จ · ${d.frames} เฟรม · ${d.elapsed_s}s`, "ok");
  } catch (e) { $("#vidProgress").hidden = true; conn("ผิดพลาด: " + e.message, "err"); }
}

function renderGrid(sel, counts, total) {
  const el = $(sel);
  el.innerHTML = "";
  if (total !== undefined) el.appendChild(card("ทั้งหมด", total, "total"));
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([n, c]) => el.appendChild(card(n, c)));
  if (!Object.keys(counts).length && !total) el.innerHTML = '<p style="color:var(--muted)">ไม่พบวัตถุ</p>';
}
function card(label, n, extra = "") {
  const d = document.createElement("div");
  d.className = "count-card " + extra;
  d.innerHTML = `<div class="n">${n}</div><div class="label">${label}</div>`;
  return d;
}

function setupDrop(zone, input, onFile) {
  zone.addEventListener("click", () => input.click());
  input.addEventListener("change", () => input.files[0] && onFile(input.files[0]));
  ["dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", (e) => { e.preventDefault(); zone.classList.remove("drag"); if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]); });
}

// keep overlay sized on rotation
window.addEventListener("resize", () => { if (state.running) sizeCanvas(); });

// ---------- service worker ----------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/api/yolo/sw.js", { scope: "/api/yolo/" }).catch(() => {});

// ---------- on-device self-test (open with #selftest) ----------
// Loads the model and runs one inference on a blank frame to verify the
// in-browser engine works end-to-end. Logs to console.
async function selfTest() {
  try {
    console.log("[selftest] crossOriginIsolated =", self.crossOriginIsolated);
    await ensureDetector();
    const c = document.createElement("canvas");
    c.width = 640; c.height = 480;
    const x = c.getContext("2d");
    x.fillStyle = "#888"; x.fillRect(0, 0, 640, 480);
    const res = await detector.detect(c, { conf: 0.25 });
    console.log(`[selftest] OK — engine ran in browser. infer_ms=${res.infer_ms}, threads=${ort.env.wasm.numThreads}, detections=${res.total}`);
    conn(`self-test ผ่าน · ${res.infer_ms}ms · ${ort.env.wasm.numThreads} thread`, "ok");
  } catch (e) {
    console.error("[selftest] FAILED:", e);
    conn("self-test ล้มเหลว: " + e.message, "err");
  }
}
if (location.hash === "#selftest") window.addEventListener("load", selfTest);
