// Worker propio que next-pwa agrega al service worker de producción (customWorkerDir).
// Muestra los avisos push (estado de los pedidos de la cuenta del comprador del
// marketplace y de los pedidos de la tienda) y, al tocarlos, abre su enlace.
// Solo enlaces del mismo origen: un aviso nunca abre otro sitio.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'Tu pedido';
  const url = data && data.data && typeof data.data.url === 'string' ? data.data.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    // Un aviso nuevo del mismo pedido reemplaza al anterior y vuelve a sonar.
    renotify: typeof data.tag === 'string',
    data: { url },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data && event.notification.data.url || '/', self.location.origin); } catch { return; }
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(self.location.origin) && 'focus' in w);
    if (open) return open.navigate(target.href).then((w) => (w || open).focus());
    return self.clients.openWindow(target.href);
  }));
});
