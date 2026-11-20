/*
 * KoopKITA service worker.
 * Privacy rule: NEVER cache authenticated pages, API responses or files —
 * they may contain financial records or personal data. Only static build assets
 * and the offline fallback page are cached. Navigations go to the network and
 * fall back to /offline when the device is offline.
 */
const CACHE = "koopkita-static-v2";
const OFFLINE_URL = "/offline";
// /buka is the static start page (loading screen, no personal data): served from the cache at once.
const START_URL = "/buka";
const PRECACHE = [OFFLINE_URL, START_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate" && url.pathname === START_URL) {
    // show the cached loading screen immediately; refresh the cached copy in the background
    const update = fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(START_URL, res.clone()));
      return res;
    });
    event.respondWith(caches.match(START_URL).then((hit) => hit || update).catch(() => caches.match(OFFLINE_URL)));
    event.waitUntil(update.catch(() => {}));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  // immutable, content-hashed build assets only
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
