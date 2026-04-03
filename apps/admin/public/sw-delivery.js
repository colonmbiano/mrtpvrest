const CACHE = 'delivery-v1';
const OFFLINE_URLS = [
  '/repartidor',
  '/manifest-delivery.json',
  '/logo.png',
];

// Instalar — cachear recursos base
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activar — limpiar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls — network only, pero guardar en cache si hay respuesta
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          // Cachear respuesta de pedidos del repartidor
          if (url.pathname.includes('/orders') && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(cache => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request)) // sin señal: usar cache
    );
    return;
  }

  // Páginas y assets — network first, cache fallback
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request) || caches.match('/repartidor'))
  );
});

// Sync en background cuando vuelve la señal
self.addEventListener('sync', e => {
  if (e.tag === 'sync-orders') {
    e.waitUntil(syncPendingUpdates());
  }
});

async function syncPendingUpdates() {
  const cache = await caches.open(CACHE);
  const pending = await cache.match('pending-updates');
  if (!pending) return;
  const updates = await pending.json();
  for (const u of updates) {
    try {
      await fetch(u.url, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(u.body) });
    } catch {}
  }
  await cache.delete('pending-updates');
}