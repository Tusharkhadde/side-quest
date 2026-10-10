/* Side Quest service worker.
 * Goal: once a quest is running, the trail has no signal, and that must not matter.
 * - App shell pages are network-first with a cache fallback.
 * - Next.js static assets are cache-first (they are content-hashed).
 * - The active quest itself lives in localStorage, so it is always available.
 * - API calls are never cached: quests and photo checks are not stored here.
 */
const VERSION = "sq-v1";
const SHELL = ["/", "/quest", "/voice", "/finish", "/journal", "/settings", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => Promise.allSettled(SHELL.map((u) => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// When a quest starts, make sure every page the quest needs is fresh in cache.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "quest-active") {
    event.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(["/voice", "/finish", "/quest"].map((u) => c.add(u)))));
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/best_hours.json") return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  if (req.mode === "navigate" || req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(url.pathname, copy));
          return res;
        })
        .catch(() => caches.match(url.pathname).then((hit) => hit || caches.match("/")))
    );
  }
});
