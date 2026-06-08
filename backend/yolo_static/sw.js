// Minimal service worker — caches the app shell so the PWA is installable
// and loads instantly. API/WS calls always go to the network.
const CACHE = "yolo-detect-v12";
// Core app shell — must cache for install to succeed.
const SHELL = [
  "/api/yolo/",
  "/api/yolo/index.html",
  "/api/yolo/styles.css",
  "/api/yolo/app.js",
  "/api/yolo/detector.js",
  "/api/yolo/pipes.js",
  "/api/yolo/opencv_worker.js",
  "/api/yolo/manifest.webmanifest",
  "/api/yolo/icons/icon-192.png",
  "/api/yolo/icons/icon-512.png",
];
// Heavy on-device engine assets (~21MB) — best-effort so install never fails.
const ENGINE = [
  "/api/yolo/models/yolo11n.onnx",
  "/api/yolo/vendor/ort/ort.wasm.min.js",
  "/api/yolo/vendor/ort/ort-wasm-simd-threaded.wasm",
  "/api/yolo/vendor/ort/ort-wasm-simd-threaded.mjs",
  // on-device pipe counting (OpenCV.js)
  "/api/yolo/vendor/opencv/opencv.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await c.addAll(SHELL);
      await Promise.allSettled(ENGINE.map((u) => c.add(u)));
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache API or websocket traffic
  if (url.pathname.startsWith("/api/detect") || url.pathname.startsWith("/ws")) return;
  if (e.request.method !== "GET") return;
  // Cache-first for the app shell, fall back to network
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
