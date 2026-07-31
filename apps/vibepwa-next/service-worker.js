const CACHE = "vibe-next-20260731-functional-audit-1";
const SHELL = [
  "./index.html",
  "./manual.html",
  "./styles.css",
  "./src/app.js",
  "./src/api.js",
  "./src/i18n.js",
  "./src/manual.js",
  "./src/icons.js",
  "./src/direct-upload.js",
  "./src/upload-queue.js",
  "./src/zip.js",
  "/icons/vibe-icon-192.png",
  "/icons/vibe-icon-512.png",
  "/icons/vibe-logo.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok && url.origin === self.location.origin) {
          caches.open(CACHE).then((cache) => cache.put(event.request, response.clone())).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html"))),
  );
});
