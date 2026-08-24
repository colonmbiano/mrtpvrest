// sw.js — Service worker del TPV (PWA / Web build).
//
// Permite que la aplicación funcione como una app de escritorio en PC (Chrome/Edge)
// o tablet, abriendo en 0ms incluso si el servidor de Railway o el internet se caen.
//
// Estrategias:
//  - Precache de la App Shell básica al instalar.
//  - Cache-First (con revalidación en segundo plano) para assets estáticos (JS, CSS, fuentes, imágenes).
//  - Stale-While-Revalidate para lecturas de catálogo, mesas, zonas y empleados.
//  - Fallback de navegación HTML para que un F5 sin red nunca muestre error de navegador.

const VERSION = 'tpv-sw-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE  = `${VERSION}-data`;

const PRECACHE_URLS = [
  '/',
  '/locked/',
  '/hub/',
  '/setup/',
  '/pos/menu/',
  '/meseros/',
  '/meseros/mis-mesas/',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache best-effort parcial:', err);
      })
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
  return (
    url.pathname.startsWith('/api/menu') ||
    url.pathname.startsWith('/api/store') ||
    url.pathname.startsWith('/api/tables') ||
    url.pathname.startsWith('/api/zones') ||
    url.pathname.startsWith('/api/employees/sync')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // POST/PUT van por la cola outbox de apiOrQueue

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // 1. Datos de lectura (catálogo, mesas, empleados) → Stale-While-Revalidate
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

  // 2. Mismo origen: App Shell, chunks de JS, CSS, fuentes locales e imágenes
  if (url.origin === self.location.origin) {
    const isNavigation = req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html');

    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(req);

        // Si ya está en caché, responder de inmediato y revalidar en segundo plano
        if (cached) {
          fetch(req)
            .then((res) => {
              if (res.ok) cache.put(req, res.clone()).catch(() => {});
            })
            .catch(() => {});
          return cached;
        }

        // Si no está en caché, buscar en la red y guardar copia
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        } catch (err) {
          // Si es navegación (ej. F5 o cambio de ruta offline) y falló la red,
          // devolver la App Shell raíz para que Next.js client-side router hidrate
          if (isNavigation) {
            const fallback = (await cache.match(req)) || (await cache.match('/')) || (await cache.match('/locked/'));
            if (fallback) return fallback;
          }
          throw err;
        }
      })
    );
  }
});
