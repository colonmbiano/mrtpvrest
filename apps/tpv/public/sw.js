// sw.js — Service worker mínimo del TPV (web build).
//
// SOLO se registra en el web build (Vercel). En Capacitor NO se registra
// porque el WebView ya sirve los assets desde el APK y un SW activo puede
// generar conflictos de cache.
//
// Estrategias:
//  - precache de la app shell al `install` (best-effort, no bloquea install).
//  - GET de la propia origin → cache-first (fallback red), para que la app
//    arranque offline cuando ya se cargó al menos una vez.
//  - GET /api/menu/* y /api/store/* → stale-while-revalidate, así el menú
//    se ve instantáneo aunque la red esté caída.
//  - Resto (POST/PUT/etc., otros orígenes) → pass-through.
//
// Importante: el outbox de la app (apiOrQueue + useOfflineStore) sigue
// siendo el mecanismo principal de offline-write. El SW solo cubre reads
// y la app shell.

const VERSION = 'tpv-sw-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE  = `${VERSION}-data`;

const SHELL_URLS = ['/', '/locked', '/hub', '/setup'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(SHELL_URLS).catch(() => { /* best-effort */ })
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isDataRequest(url) {
  return url.pathname.startsWith('/api/menu') || url.pathname.startsWith('/api/store');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT/etc — el outbox de la app

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Stale-while-revalidate para datos del catálogo
  if (isDataRequest(url)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Cache-first para mismos orígenes (HTML/JS/CSS/fuentes locales)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) {
          // Re-validar en background sin bloquear respuesta.
          fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()).catch(() => {}); })
            .catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch (err) {
          // Como último recurso, devolver la shell raíz si la pedían y no hay red.
          if (req.headers.get('accept')?.includes('text/html')) {
            const fallback = await cache.match('/');
            if (fallback) return fallback;
          }
          throw err;
        }
      })
    );
  }
});
