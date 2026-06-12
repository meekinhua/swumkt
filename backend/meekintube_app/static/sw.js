// Service worker — แคช "เปลือกแอป" (UI) ให้เปิดแบบออฟไลน์ได้ (mounted under a sub-path)
const CACHE = "vdl-shell-v37";
const BASE = new URL(self.registration.scope).pathname;  // e.g. "/api/meekintube/"
const SHELL = [
  BASE,
  BASE + "static/style.css",
  BASE + "static/db.js",
  BASE + "static/app.js",
  BASE + "logo.png",
  BASE + "icon-192.png",
  BASE + "icon-512.png",
  BASE + "manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // API / media / thumb -> network only
  if (url.pathname.startsWith(BASE + "api/") ||
      url.pathname.startsWith(BASE + "media/") ||
      url.pathname.startsWith(BASE + "thumb/")) {
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(BASE)));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
