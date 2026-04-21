/**
 * Service worker — simple shell cache for offline boot.
 *
 * Strategy:
 *   - Network-first for /api/* (never cache API responses; Dexie owns those)
 *   - Cache-first for static assets: /_next/static/*, fonts, images
 *   - Stale-while-revalidate for HTML pages — serve cached shell instantly,
 *     refresh cache in background.
 *
 * Registered from client at first page load.
 */

const CACHE = "budget-ledger-v1";
const APP_SHELL = ["/", "/sign-in", "/sign-up", "/app"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache Supabase or our API
  if (url.pathname.startsWith("/api/") || url.hostname.includes("supabase")) return;

  // Static assets — cache-first
  if (url.pathname.startsWith("/_next/static/") ||
      url.pathname.match(/\.(woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/)) {
    event.respondWith(
      caches.open(CACHE).then(c =>
        c.match(req).then(hit => hit || fetch(req).then(res => {
          c.put(req, res.clone()); return res;
        }))
      )
    );
    return;
  }

  // HTML — stale-while-revalidate
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      caches.open(CACHE).then(c =>
        c.match(req).then(hit => {
          const fresh = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || fresh;
        })
      )
    );
  }
});
