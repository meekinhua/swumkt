// ====================================================================
//  Pipe counting — backend returns circle positions; the frontend draws
//  the numbered overlay and lets the user fix the result by hand.
//  Modes:  "region" = lasso a free-form area to detect inside
//          "edit"   = tap empty to ADD a pipe, tap a pipe to REMOVE it
//  Numbering is computed client-side in tidy reading order (rows L→R).
//  Reuses from app.js: $, conn, loadImage, setupDrop, getLog, setLog, showToast.
// ====================================================================
(function () {
  const pipeImg = $("#pipeImg");
  const overlay = $("#pipeOverlay");
  const ctx = overlay.getContext("2d");
  const stage = $("#pipeStage");
  const controls = $("#pipeControls");
  const countWrap = $("#pipeCountWrap");
  const countEl = $("#pipeCount");
  const diaInput = $("#pipeDia");
  const sensInput = $("#pipeSens");

  let work = null;        // clean working canvas (sent to backend)
  let circles = [];       // [{x,y,r}] in work-canvas px
  let poly = null;        // committed lasso polygon [{x,y}]
  let path = null;        // lasso path being drawn
  let mode = "region";    // region | edit
  let lastCount = null;

  // ---- import ----
  setupDrop($("#pipeDrop"), $("#pipeInput"), handlePipe);

  async function handlePipe(file) {
    try {
      const img = await loadImage(file);
      const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.round(img.naturalWidth * s);
      const H = Math.round(img.naturalHeight * s);
      work = document.createElement("canvas");
      work.width = W; work.height = H;
      work.getContext("2d").drawImage(img, 0, 0, W, H);
      pipeImg.src = work.toDataURL("image/jpeg", 0.9);
      overlay.width = W; overlay.height = H;
      circles = []; poly = null; path = null;

      const dia = Math.max(20, Math.min(220, Math.round(W * 0.07)));
      diaInput.value = dia; $("#pipeDiaVal").textContent = dia;

      stage.hidden = false; controls.hidden = false;
      await recount();
    } catch (e) {
      conn("เปิดรูปไม่ได้: " + e.message, "err");
    }
  }

  // ---- geometry helpers ----
  function toCanvas(e) {
    const r = overlay.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * overlay.width / r.width,
      y: (e.clientY - r.top) * overlay.height / r.height,
    };
  }
  function medianR() {
    if (!circles.length) return Math.max(6, parseInt(diaInput.value, 10) / 2);
    const rs = circles.map((c) => c.r).sort((a, b) => a - b);
    return rs[rs.length >> 1];
  }
  function polyArea(pts) {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
      a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    return Math.abs(a / 2);
  }
  function hitTest(p) {
    // index of the circle under p (nearest center within its radius), else -1
    let best = -1, bestD = Infinity;
    for (let i = 0; i < circles.length; i++) {
      const c = circles[i];
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d <= Math.max(c.r, 12) && d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---- tidy reading order: cluster into rows by y, sort each row by x ----
  function ordered() {
    if (!circles.length) return [];
    const medR = medianR();
    const rowGap = medR * 1.25;
    const byY = [...circles].sort((a, b) => a.y - b.y);
    const rows = [];
    for (const c of byY) {
      const last = rows[rows.length - 1];
      if (last && c.y - last.meanY <= rowGap) {
        last.items.push(c); last.sum += c.y; last.meanY = last.sum / last.items.length;
      } else {
        rows.push({ items: [c], sum: c.y, meanY: c.y });
      }
    }
    const out = [];
    for (const r of rows) { r.items.sort((a, b) => a.x - b.x); out.push(...r.items); }
    return out;
  }

  // ---- render overlay (circles + numbers + lasso) ----
  function render() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (poly && poly.length >= 3) {
      ctx.lineWidth = Math.max(2, overlay.width / 360);
      ctx.strokeStyle = "#ffd24a";
      ctx.fillStyle = "rgba(255,210,74,0.10)";
      tracePath(poly, true); ctx.fill(); ctx.stroke();
    }

    const list = ordered();
    circles = list; // keep stored order in sync with displayed numbers
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      ctx.lineWidth = Math.max(2, c.r * 0.12);
      ctx.strokeStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.stroke();

      const txt = String(i + 1);
      const fs = Math.max(11, c.r * 0.95);
      ctx.font = `bold ${fs}px system-ui, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.lineWidth = Math.max(2, fs / 5);
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(txt, c.x, c.y);
      ctx.fillStyle = "#ffe14a";
      ctx.fillText(txt, c.x, c.y);
    }

    lastCount = list.length;
    countEl.textContent = list.length;
    countWrap.hidden = false;
  }

  function tracePath(pts, closed) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
  }

  // ---- pointer handling ----
  overlay.addEventListener("pointerdown", (e) => {
    if (!work) return;
    overlay.setPointerCapture(e.pointerId);
    const p = toCanvas(e);
    if (mode === "edit") {
      const i = hitTest(p);
      if (i >= 0) circles.splice(i, 1);            // remove wrong detection
      else circles.push({ x: p.x, y: p.y, r: medianR() }); // add missed pipe
      render();
    } else {
      path = [p]; // start lasso
    }
  });
  overlay.addEventListener("pointermove", (e) => {
    if (mode !== "region" || !path) return;
    const p = toCanvas(e);
    const last = path[path.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) > 4) path.push(p);
    render();                       // base layer
    ctx.lineWidth = Math.max(2, overlay.width / 360);
    ctx.strokeStyle = "#ffd24a";
    tracePath(path, false); ctx.stroke();
  });
  overlay.addEventListener("pointerup", () => {
    if (mode !== "region" || !path) return;
    const pts = path; path = null;
    if (pts.length >= 3 && polyArea(pts) > 300) { poly = pts; recount(); }
    else { poly = null; render(); }
  });

  // ---- ON-DEVICE detect via Web Worker (OpenCV.js, off main thread) ----
  let worker = null, workerReady = null, busy = false;

  function ensureWorker() {
    if (workerReady) return workerReady;
    workerReady = new Promise((resolve, reject) => {
      try { worker = new Worker("/api/yolo/opencv_worker.js"); }
      catch (e) { reject(new Error("สร้าง worker ไม่ได้: " + e.message)); return; }
      const to = setTimeout(() => reject(new Error("OpenCV โหลดนานเกินไป (timeout)")), 180000);
      worker.addEventListener("message", (e) => {
        if (e.data && e.data.type === "ready") { clearTimeout(to); resolve(worker); }
        else if (e.data && e.data.type === "fatal") { clearTimeout(to); reject(new Error(e.data.message)); }
      });
      worker.addEventListener("error", (e) => { clearTimeout(to); reject(new Error(e.message || "worker error")); });
    });
    return workerReady;
  }

  function detectViaWorker(imageData, params) {
    return new Promise((resolve, reject) => {
      const onMsg = (e) => {
        if (!e.data) return;
        if (e.data.type === "result") { worker.removeEventListener("message", onMsg); resolve(e.data.circles); }
        else if (e.data.type === "error") { worker.removeEventListener("message", onMsg); reject(new Error(e.data.message)); }
      };
      worker.addEventListener("message", onMsg);
      // transfer the pixel buffer to avoid copying ~10MB
      worker.postMessage({ type: "detect", imageData, params }, [imageData.data.buffer]);
    });
  }

  function inPoly(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  async function recount() {
    if (!work || busy) return;
    busy = true;
    try {
      const first = !workerReady;
      if (first) conn("กำลังโหลดเครื่องตรวจจับ (ครั้งแรก ~11MB)…");
      await ensureWorker();
      conn("กำลังตรวจจับท่อ…");

      const wctx = work.getContext("2d");
      const imageData = wctx.getImageData(0, 0, work.width, work.height);
      const d = Math.max(6, parseInt(diaInput.value, 10));
      const params = {
        minR: Math.max(3, Math.round(d * 0.35)),
        maxR: Math.max(Math.round(d * 0.35) + 1, Math.round(d * 0.70)),
        minDist: Math.max(5, Math.round(d * 0.60)),
        param2: Math.min(60, Math.max(12, 60 - parseInt(sensInput.value, 10) * 0.48)),
      };
      const raw = await detectViaWorker(imageData, params);
      circles = raw
        .map(([x, y, r]) => ({ x, y, r }))
        .filter((c) => !poly || inPoly(c.x, c.y, poly));
      render();
      conn(`ตรวจพบ ${circles.length} ท่อ (on-device) · แก้ไขเพิ่ม/ลบได้`, "ok");
    } catch (e) {
      conn("ผิดพลาด: " + e.message, "err");
    } finally {
      busy = false;
    }
  }

  // ---- mode switch ----
  $$("#pipeModeSeg .seg-btn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#pipeModeSeg .seg-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      mode = b.dataset.pmode;
      $("#pipeModeHint").textContent =
        mode === "edit"
          ? "แตะที่ว่าง = เพิ่มท่อ · แตะวงที่มีอยู่ = ลบ (เลขจะรันใหม่ให้)"
          : "ลากนิ้ววาดรอบพื้นที่ที่จะนับ (อิสระ)";
      overlay.style.cursor = mode === "edit" ? "pointer" : "crosshair";
    })
  );

  // ---- controls ----
  diaInput.addEventListener("input", () => ($("#pipeDiaVal").textContent = diaInput.value));
  sensInput.addEventListener("input", () => ($("#pipeSensVal").textContent = sensInput.value));
  diaInput.addEventListener("change", recount);
  sensInput.addEventListener("change", recount);
  $("#pipeRecount").addEventListener("click", recount);
  $("#pipeClearRoi").addEventListener("click", () => { poly = null; recount(); });
  $("#pipeNew").addEventListener("click", () => {
    stage.hidden = true; controls.hidden = true; countWrap.hidden = true;
    work = null; circles = []; poly = null; lastCount = null; $("#pipeInput").value = "";
  });
  $("#pipeSave").addEventListener("click", () => {
    if (lastCount == null) { showToast("ยังไม่มีผลนับ"); return; }
    const log = getLog();
    log.unshift({ t: new Date().toISOString(), count: lastCount, peak: lastCount, mode: "pipes", label: "ท่อ" });
    setLog(log);
    if (navigator.vibrate) navigator.vibrate(40);
    showToast(`บันทึกแล้ว: ${lastCount} ท่อ`);
  });

  // ---- on-device health check (open with #pipetest) ----
  async function pipeSelfTest() {
    try {
      const c = document.createElement("canvas"); c.width = 400; c.height = 400;
      const x = c.getContext("2d");
      x.fillStyle = "#2a3a3a"; x.fillRect(0, 0, 400, 400);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        x.fillStyle = "#9ab"; x.beginPath(); x.arc(70 + j * 130, 70 + i * 130, 50, 0, 7); x.fill();
        x.fillStyle = "#111"; x.beginPath(); x.arc(70 + j * 130, 70 + i * 130, 40, 0, 7); x.fill();
      }
      work = c; poly = null; diaInput.value = 100; sensInput.value = 50;
      await recount();
      console.log(`[pipetest] OpenCV.js ran on-device (worker) — detected ${circles.length} (expect ~9)`);
    } catch (e) {
      console.error("[pipetest] FAILED:", e);
    }
  }
  if (location.hash === "#pipetest") window.addEventListener("load", pipeSelfTest);
})();
