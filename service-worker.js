const CACHE_NAME = "experience-hub-pwa-20260723-manual-blueprint-708";
const APP_SHELL = [
  "/icons/vibe-logo.jpg",
  "/icons/vibe-logo.png",
  "/icons/vibe-icon-192.png",
  "/icons/vibe-icon-512.png",
  "/icons/vibe-apple-touch.png"
];

const NETWORK_ONLY_PATHS = new Set([
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/reset.html"
]);

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
  if (NETWORK_ONLY_PATHS.has(url.pathname) || request.mode === "navigate" || ["document", "script", "style", "manifest"].includes(request.destination)) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => new Response("App shell unavailable. Reconnect and reload Vibe.", { status: 504 })));
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
