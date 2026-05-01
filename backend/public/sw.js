/**
 * Service worker — offline-first shell cache.
 *
 * Strategy:
 *   /_next/static/* + fonts/images  → cache-first (immutable bundles)
 *   HTML navigation                 → stale-while-revalidate; fall back to /app shell
 *   /api/*  + supabase.*            → network-only (Dexie owns offline writes)
 *   POST/PUT/PATCH/DELETE           → pass through (Dexie's pending-ops queue handles these)
 */

const CACHE = "budget-ledger-v2";

const PRECACHE = [
  "/",
  "/app",
  "/sign-in",
  "/sign-up",
];

// ---- install: precache shell pages ----------------------------------------

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.allSettled(PRECACHE.map((url) => c.add(url)))
    )
  );
  // Take control immediately — don't wait for old SW clients to close.
  self.skipWaiting();
});

// ---- activate: delete old caches ------------------------------------------

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---- fetch -----------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request: req } = event;

  // Only intercept GET requests.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API calls or Supabase — let the app's Dexie layer handle offline.
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("supabase.io")
  ) return;

  // Immutable static assets — cache-first, no network fallback needed.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.match(/\.(woff2?|ttf|otf|png|jpe?g|svg|webp|ico|gif)$/)
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Google Fonts — cache-first (the stylesheets contain cache-busting params).
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(cacheFirst(req));
    return;
  }

  // HTML navigation — stale-while-revalidate with /app shell fallback.
  if (req.headers.get("accept")?.includes("text/html")) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

// ---- helpers ---------------------------------------------------------------

/** Return cached response immediately; fetch + cache in background. */
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  if (cached) {
    // Serve cache instantly; update in background.
    event_update_in_background(networkPromise);
    return cached;
  }

  // No cache hit — wait for the network.
  const fresh = await networkPromise;
  if (fresh) return fresh;

  // Both cache and network failed (truly offline with no shell cached).
  // Fall back to the cached /app shell so the React app can boot.
  const shell = await cache.match("/app") || await cache.match("/");
  if (shell) return shell;

  // Last resort: generic offline page.
  return new Response("<h1>Offline</h1><p>You are offline and this page is not cached yet.</p>", {
    headers: { "content-type": "text/html" },
  });
}

// Fire-and-forget — update cache in background without blocking the response.
function event_update_in_background(promise) {
  if (promise && typeof promise.catch === "function") promise.catch(() => {});
}

/** Return from cache; on miss, fetch and cache. */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Static asset fetch failed offline — nothing useful to return.
    return new Response("", { status: 503, statusText: "Service Unavailable" });
  }
}
