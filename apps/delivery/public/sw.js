// sw.js — Service Worker mínimo de MB Delivery.
// Objetivo: installability PWA + offline básico del app shell.
// REGLA DE ORO: nunca cachear las llamadas a la API ni el tracking GPS;
// esas siempre van a la red para no servir datos de pedidos/ubicación stale.

const CACHE = "mb-delivery-v3";
const APP_SHELL = ["/", "/manifest.webmanifest"];

// ── Web Push: notificación de pedidos al celular del repartidor ────────────
// El backend (web-push/VAPID) manda un JSON { title, body, tag, url }. Esto
// funciona con la app CERRADA: el sistema despierta al SW y muestra la
// notificación nativa (Android Chrome/PWA; iOS 16.4+ con la PWA instalada).
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "MB Delivery";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || undefined, // mismo tag = reemplaza (no acumula) la notificación
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [180, 80, 180],
      data: { url: data.url || "/" },
    })
  );
});

// Tocar la notificación abre (o enfoca) la app del repartidor.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(url).catch(() => {}); return client.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // addAll falla en bloque si un recurso da 404; los metemos uno a uno
      // tolerando fallos para no romper la instalación del SW.
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 1) Cross-origin (incluye el backend cloud de la API) → dejar pasar a la red.
  if (url.origin !== self.location.origin) return;

  // 2) Nunca cachear API ni tracking GPS aunque vivieran en el mismo origen.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/gps/")) return;

  // 3) Navegaciones (HTML) → network-first con fallback al shell offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // 4) Estáticos same-origin (JS/CSS/fuentes/iconos) → stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
