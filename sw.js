/**
 * SW.JS — Finance Sinking Fund
 * Deliberately minimal. This app's real data lives behind POST requests
 * to the Apps Script API, which must NEVER be served from cache (stale
 * balances/loans would be actively misleading). So this service worker
 * only exists to satisfy the browser's install criteria and to keep the
 * app shell (this HTML/CSS/JS file + icons) available if the network
 * drops mid-session — not to make the app "work offline" in any real
 * sense.
 *
 * STRATEGY:
 * - Only GET requests are ever touched. POST (every API call) always
 *   passes straight to the network, untouched by this file.
 * - Navigation/shell requests: network-first, falling back to the last
 *   cached copy only if the network fails entirely (e.g. no signal).
 *   This avoids ever showing a stale UI when the network is fine.
 */
const CACHE_NAME = 'geetee-shell-v1';
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // addAll() is all-or-nothing — one missing/404 asset (e.g. an icon
      // that hasn't been deployed yet) would otherwise fail the entire
      // install. Caching each asset independently means a single missing
      // file just gets skipped instead of blocking the service worker
      // from installing at all.
      return Promise.all(
        SHELL_ASSETS.map(function (url) {
          return cache.add(url).catch(function (err) {
            console.warn('SW: could not cache', url, err);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  // Never intercept non-GET requests — this is what protects every
  // API call (doPost to the GAS /exec endpoint) from ever being
  // touched by this service worker.
  if (event.request.method !== 'GET') return;

  // Never cache the API endpoint even if it were ever called via GET.
  if (event.request.url.indexOf('/exec') !== -1) return;

  event.respondWith(
    fetch(event.request)
      .then(function (response) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, copy);
        });
        return response;
      })
      .catch(function () {
        return caches.match(event.request).then(function (cached) {
          return cached || caches.match('/');
        });
      })
  );
});
