/* ==========================================================================
   Nite-Run Service Worker
   --------------------------------------------------------------------------
   Strategy:
   - HTML / JS / CSS / JSON  → network-first (always fresh when online,
                               falls back to cache when offline).
   - Images / fonts / icons  → cache-first (instant load, refreshed lazily).
   - Firebase / Firestore    → bypass (never cached).

   When you ship a new version of the app, bump CACHE_VERSION below and
   every installed PWA will purge old caches and refresh on next open.
   ========================================================================== */

const CACHE_VERSION = 'v1';
const RUNTIME_CACHE  = 'niterun-runtime-' + CACHE_VERSION;
const STATIC_CACHE   = 'niterun-static-'  + CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/app.html',
  '/auth.html',
  '/styles.css',
  '/app.css',
  '/auth.css',
  '/script.js',
  '/app.js',
  '/auth.js',
  '/i18n.js',
  '/site-config.js',
  '/firebase-config.js',
  '/manifest.webmanifest',
  '/assets/images/icons/icon-192.png',
  '/assets/images/icons/icon-512.png',
  '/assets/images/icons/icon180.jpg'
];

/* -------- Install: pre-cache critical shell -------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

/* -------- Activate: purge old caches -------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* -------- Allow page to ask SW to skip waiting (for "Update ready" toast) -------- */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* -------- Helpers -------- */
function isNavigationRequest(req) {
  return req.mode === 'navigate' ||
         (req.method === 'GET' && req.headers.get('accept') &&
          req.headers.get('accept').includes('text/html'));
}

function isAppCode(url) {
  return /\.(?:js|css|json|webmanifest)$/.test(url.pathname);
}

function isStaticAsset(url) {
  return /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|otf|eot)$/i.test(url.pathname);
}

function isThirdPartyOrApi(url) {
  if (url.origin !== self.location.origin) return true;
  return /firestore\.googleapis|firebase|google\.com|gstatic\.com|googleapis\.com|cloudfunctions/.test(url.host);
}

/* -------- Fetch routing -------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (isThirdPartyOrApi(url)) {
    return;
  }

  if (isNavigationRequest(req) || isAppCode(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(req));
    return;
  }
});

/* network-first, with cache fallback (used for HTML/JS/CSS) */
function networkFirst(request) {
  return fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    })
    .catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (isNavigationRequest(request)) {
          return caches.match('/app.html') || caches.match('/index.html');
        }
        return new Response('', { status: 503, statusText: 'offline' });
      });
    });
}

/* cache-first, refresh in background (used for images/fonts/icons) */
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    const networkPromise = fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => cached);
    return cached || networkPromise;
  });
}
