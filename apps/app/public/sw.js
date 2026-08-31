/* sw.js — Opus OS service worker (PWA Week 3–4)
 * Strategies (fail-safe by design):
 *  - NEVER intercepts /api/* (realtime, auth, payments must always hit the network)
 *  - Navigations: network-first, offline.html fallback (deploys never serve a stale app)
 *  - Same-origin static assets: stale-while-revalidate
 * Bump CACHE_VERSION on every deploy.
 */
const CACHE_VERSION = 'opus-v1';
const PRECACHE = `${CACHE_VERSION}-precache`;
const RUNTIME = `${CACHE_VERSION}-runtime`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_URLS = ['/', OFFLINE_URL, '/manifest.json', '/opus-logo.svg', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // mutations always hit the network

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // cross-origin (GA, Razorpay, fonts) — bypass
  if (url.pathname.startsWith('/api/')) return; // never cache API — auth/realtime/payments

  // Navigations: network-first with offline fallback (stale app shell is worse than offline page)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => (await caches.match(req)) || (await caches.match(OFFLINE_URL)) || Response.error())
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});
