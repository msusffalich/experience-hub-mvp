const CACHE_NAME = "experience-hub-pwa-20260528-vibeapp-sync-sim-474";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/icons/vibe-logo.jpg",
  "/icons/vibe-logo.png",
  "/icons/vibe-icon-192.png",
  "/icons/vibe-icon-512.png",
  "/icons/vibe-apple-touch.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/reset.html") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => new Response("Reset page unavailable", { status: 504 })));
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === "navigate" || request.destination === "document") {
          return caches.match("/index.html");
        }
        return new Response("", { status: 504, statusText: "Offline asset unavailable" });
      }))
  );
});

