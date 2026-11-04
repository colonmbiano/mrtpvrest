// API aislada para las pruebas de la cuenta del comprador: identidad, libreta de
// direcciones v1 y un catálogo vacío. Todo en memoria; nunca habla con producción.
// La sesión es una cookie de este host (como __Host-mrtpv_market en la API real).
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

const PORT = 4328;
const ORIGIN = 'http://127.0.0.1:4327';
const accounts = new Map(); // email -> { id, name, email, password, verified, addresses }
const sessions = new Map(); // session -> email
const links = new Map(); // token -> { email, purpose }
const outbox = []; // { email, purpose, token } — solo para las pruebas
const hex = () => randomBytes(32).toString('hex');
// Tiendas publicadas del simulador (las de "Mis pedidos").
const STORES = {
  'tacos-don-pepe': { name: 'Tacos Don Pepe' },
  'pizzeria-colorines': { name: 'Pizzería Colorines' },
  'cafe-del-lago': { name: 'Café del Lago' },
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
const publicAccount = a => ({ id: a.id, name: a.name, email: a.email, emailVerified: a.verified,
  profiles: [{ role: 'BUYER', status: a.verified ? 'APPROVED' : 'PENDING_EMAIL' }] });
function sessionOf(req) {
  const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('mock_session='));
  const email = raw && sessions.get(raw.slice('mock_session='.length));
  return email ? accounts.get(email) : null;
}
function bearerOf(req) {
  const match = /^Bearer tok-(.+)$/.exec(req.headers.authorization || '');
  return match ? [...accounts.values()].find(a => a.id === match[1]) : null;
}
async function body(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

const server = createServer(async (req, res) => {
  // CORS con credenciales: origen exacto, nunca '*'.
  if (req.headers.origin === ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key, X-Buyer-Id, X-Guest-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const id = '/api/marketplace/identity';

  // Solo pruebas: el "correo" más reciente enviado a una dirección.
  if (path === '/__test/outbox') {
    const email = url.searchParams.get('email');
    const purpose = url.searchParams.get('purpose');
    return send(res, 200, outbox.filter(m => m.email === email && m.purpose === purpose).at(-1) || null);
  }
  if (path === '/__test/health') return send(res, 200, { ok: true });
  // Solo pruebas: los navegadores suscritos a los avisos de una cuenta.
  if (path === '/__test/push') return send(res, 200, accounts.get(url.searchParams.get('email'))?.push || []);

  // Llave pública VAPID de ejemplo (la de la documentación de web-push), nunca una real.
  if (path === '/api/notifications/vapid-public-key') {
    return send(res, 200, { key: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U' });
  }

  if (path.startsWith(id) && req.method === 'POST' && req.headers.origin !== ORIGIN) return send(res, 403, { error: 'ORIGIN_FORBIDDEN', code: 'ORIGIN_FORBIDDEN' });

  if (path === id + '/register' && req.method === 'POST') {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (b.role !== 'BUYER' || !email.includes('@') || String(b.password || '').length < 12) return send(res, 400, { error: 'INVALID_SIGNUP', code: 'INVALID_SIGNUP' });
    if (!accounts.has(email)) {
      const accountId = 'acc-' + (accounts.size + 1);
      accounts.set(email, { id: accountId, name: b.fullName, email, password: b.password, verified: false,
        addresses: [{ id: 'addr-1', address: 'Av. Juárez 100, Centro', lat: 19.19, lng: -100.13 },
          { id: 'addr-2', address: 'Calle Pino 22, La Peña', lat: 19.2, lng: -100.12 }],
        // Mis pedidos: uno por recoger, uno en camino y uno entregado (del más reciente al más viejo).
        orders: [
          { orderId: `${accountId}-o1`, orderNumber: '1041', status: 'READY', total: '185.00', currency: 'MXN', fulfillment: 'PICKUP',
            placedAt: '2026-11-02T18:30:00.000Z', merchant: { name: 'Tacos Don Pepe', slug: 'tacos-don-pepe' },
            items: [{ menuItemId: 'm1', name: 'Tacos al pastor', quantity: 3 }, { menuItemId: 'm2', name: 'Agua de horchata', quantity: 1 }] },
          { orderId: `${accountId}-o2`, orderNumber: '877', status: 'ON_THE_WAY', total: '240.50', currency: 'MXN', fulfillment: 'DELIVERY',
            placedAt: '2026-11-01T20:05:00.000Z', merchant: { name: 'Pizzería Colorines', slug: 'pizzeria-colorines' },
            items: [{ menuItemId: 'm3', name: 'Pizza hawaiana', quantity: 1 }] },
          { orderId: `${accountId}-o3`, orderNumber: '12', status: 'DELIVERED', total: '99.00', currency: 'MXN', fulfillment: 'DELIVERY',
            placedAt: '2026-10-28T14:00:00.000Z', merchant: { name: 'Café del Lago', slug: 'cafe-del-lago' },
            items: [{ menuItemId: 'm4', name: 'Capuchino', quantity: 2 }] },
        ] });
      const token = hex(); links.set(token, { email, purpose: 'verify' }); outbox.push({ email, purpose: 'verify', token });
    }
    return send(res, 202, { message: 'ok' });
  }
  if (path === id + '/verify-email' && req.method === 'POST') {
    const b = await body(req);
    const link = links.get(b.token);
    if (!link || link.purpose !== 'verify') return send(res, 400, { error: 'INVALID_TOKEN', code: 'INVALID_TOKEN' });
    links.delete(b.token);
    accounts.get(link.email).verified = true;
    return send(res, 200, { verified: true });
  }
  if ((path === id + '/resend-verification' || path === id + '/password/forgot') && req.method === 'POST') {
    const b = await body(req);
    const account = accounts.get(String(b.email || '').trim().toLowerCase());
    const purpose = path.endsWith('forgot') ? 'reset' : 'verify';
    if (account && (purpose === 'reset' ? account.verified : !account.verified)) {
      const token = hex(); links.set(token, { email: account.email, purpose }); outbox.push({ email: account.email, purpose, token });
    }
    return send(res, 202, { message: 'ok' });
  }
  if (path === id + '/password/reset' && req.method === 'POST') {
    const b = await body(req);
    const link = links.get(b.token);
    if (!link || link.purpose !== 'reset' || String(b.password || '').length < 12) return send(res, 400, { error: 'INVALID_TOKEN', code: 'INVALID_TOKEN' });
    links.delete(b.token);
    accounts.get(link.email).password = b.password;
    for (const [s, email] of sessions) if (email === link.email) sessions.delete(s);
    return send(res, 200, { success: true });
  }
  if (path === id + '/login' && req.method === 'POST') {
    const b = await body(req);
    const account = accounts.get(String(b.email || '').trim().toLowerCase());
    if (!account || !account.verified || account.password !== b.password) return send(res, 401, { error: 'INVALID_CREDENTIALS', code: 'INVALID_CREDENTIALS' });
    const session = hex(); sessions.set(session, account.email);
    return send(res, 200, { account: publicAccount(account) }, { 'Set-Cookie': `mock_session=${session}; HttpOnly; SameSite=Strict; Path=/` });
  }
  if (path === id + '/me' && req.method === 'GET') {
    const account = sessionOf(req);
    return account ? send(res, 200, { account: publicAccount(account) }) : send(res, 401, { error: 'UNAUTHENTICATED', code: 'UNAUTHENTICATED' });
  }
  if (path === id + '/token' && req.method === 'POST') {
    const account = sessionOf(req);
    if (!account) return send(res, 401, { error: 'UNAUTHENTICATED', code: 'UNAUTHENTICATED' });
    return send(res, 200, { token: 'tok-' + account.id, tokenType: 'Bearer', expiresIn: 900 });
  }
  if (path === id + '/logout' && req.method === 'POST') {
    const raw = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('mock_session='));
    if (raw) sessions.delete(raw.slice('mock_session='.length));
    return send(res, 200, { success: true }, { 'Set-Cookie': 'mock_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (path.startsWith('/api/marketplace/v1/addresses')) {
    const account = bearerOf(req);
    if (!account) return send(res, 401, { error: 'Token de comprador requerido', errorCode: 'INVALID_BUYER_IDENTITY' });
    if (req.method === 'GET') return send(res, 200, { addresses: account.addresses });
    if (req.method === 'DELETE') {
      account.addresses = account.addresses.filter(a => `/api/marketplace/v1/addresses/${a.id}` !== path);
      res.writeHead(204); res.end(); return;
    }
  }

  // Mis pedidos (solo Bearer). Páginas de 2 para probar "ver anteriores".
  if (path === '/api/marketplace/v1/orders' && req.method === 'GET') {
    const account = bearerOf(req);
    if (!account) return send(res, 401, { error: 'Inicia sesion para ver tus pedidos', errorCode: 'INVALID_BUYER_IDENTITY' });
    const before = url.searchParams.get('before');
    const older = account.orders.filter(o => !before || o.placedAt < before);
    const page = older.slice(0, 2);
    return send(res, 200, { orders: page, nextBefore: older.length > 2 ? page.at(-1).placedAt : null });
  }
  const orderPath = /^\/api\/marketplace\/v1\/orders\/([^/]+)\/(codes|tracking)$/.exec(path);
  if (orderPath && req.method === 'GET') {
    const account = bearerOf(req);
    const order = account?.orders.find(o => o.orderId === orderPath[1]);
    if (!account) return send(res, 401, { error: 'Token de comprador invalido', errorCode: 'INVALID_BUYER_IDENTITY' });
    if (!order) return send(res, 404, { error: 'Orden no encontrada', errorCode: 'ORDER_NOT_FOUND' });
    if (orderPath[2] === 'codes') {
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED') return send(res, 409, { error: 'La orden ya termino', errorCode: 'ORDER_CLOSED' });
      return send(res, 200, { orderId: order.orderId, pickupPin: '123456', deliveryPin: '654321' });
    }
    // Sin GPS en las pruebas: en camino sale como ubicación no actualizada.
    return send(res, 200, { orderId: order.orderId, status: order.status, taskStatus: null, origin: null, courierLocation: null,
      isStale: order.status === 'ON_THE_WAY' });
  }

  // Tiendas favoritas (solo Bearer). Solo las tiendas publicadas del simulador.
  if (path === '/api/marketplace/v1/favorites' || path.startsWith('/api/marketplace/v1/favorites/')) {
    const account = bearerOf(req);
    if (!account) return send(res, 401, { error: 'Inicia sesion para guardar tiendas favoritas', errorCode: 'INVALID_BUYER_IDENTITY' });
    account.favorites ||= [];
    if (req.method === 'GET' && path === '/api/marketplace/v1/favorites') {
      return send(res, 200, { merchants: account.favorites.map(slug => ({ slug, name: STORES[slug].name, logo: null, open: true, addedAt: '2026-11-02T10:00:00.000Z' })) });
    }
    const slug = decodeURIComponent(path.slice('/api/marketplace/v1/favorites/'.length));
    if (req.method === 'PUT') {
      if (!STORES[slug]) return send(res, 404, { error: 'Tienda no encontrada', errorCode: 'MERCHANT_NOT_FOUND' });
      const created = !account.favorites.includes(slug);
      if (created) account.favorites.unshift(slug);
      return send(res, created ? 201 : 200, { slug, favorite: true });
    }
    if (req.method === 'DELETE') { account.favorites = account.favorites.filter(s => s !== slug); res.writeHead(204); res.end(); return; }
  }

  // Avisos de los pedidos de la cuenta (solo Bearer).
  if (path === '/api/marketplace/v1/push' && (req.method === 'PUT' || req.method === 'DELETE')) {
    const account = bearerOf(req);
    if (!account) return send(res, 401, { error: 'Inicia sesion para activar los avisos', errorCode: 'INVALID_BUYER_IDENTITY' });
    const b = await body(req);
    account.push ||= [];
    if (req.method === 'PUT') {
      const endpoint = b.subscription?.endpoint;
      if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !b.subscription?.keys?.p256dh || !b.subscription?.keys?.auth) {
        return send(res, 400, { error: 'Suscripcion invalida', errorCode: 'INVALID_SUBSCRIPTION' });
      }
      if (!account.push.includes(endpoint)) account.push.push(endpoint);
      return send(res, 200, { subscribed: true });
    }
    account.push = account.push.filter(e => e !== b.endpoint);
    res.writeHead(204); res.end(); return;
  }

  // Página de tienda mínima para las pruebas del corazón de favoritas.
  const storeSlug = url.searchParams.get('r');
  if (path === '/api/store/info' && STORES[storeSlug]) {
    return send(res, 200, { id: 'r-' + storeSlug, slug: storeSlug, name: STORES[storeSlug].name, hasWebStore: true, isOpen: true,
      primaryColor: '#a73520', currency: 'MXN', currencyLocale: 'es-MX' });
  }
  if (path === '/api/store/menu' && STORES[storeSlug]) {
    return send(res, 200, { categories: [{ id: 'c1', name: 'Menú', items: [
      { id: 'm1', name: 'Tacos al pastor', description: 'Con piña y cilantro.', price: 20 },
      { id: 'm4', name: 'Capuchino', description: 'Café con leche espumada.', price: 45 }] }] });
  }
  if (path === '/api/store/locations') return send(res, 200, []);

  // Catálogo vacío para la portada.
  if (path === '/api/marketplace/stores' || path === '/api/marketplace/products') return send(res, 200, { items: [], page: 1, pageSize: 12, total: 0 });
  return send(res, 404, { error: 'not found' });
});
server.listen(PORT, '127.0.0.1');
