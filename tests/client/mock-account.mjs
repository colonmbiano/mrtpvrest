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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  if (path.startsWith(id) && req.method === 'POST' && req.headers.origin !== ORIGIN) return send(res, 403, { error: 'ORIGIN_FORBIDDEN', code: 'ORIGIN_FORBIDDEN' });

  if (path === id + '/register' && req.method === 'POST') {
    const b = await body(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (b.role !== 'BUYER' || !email.includes('@') || String(b.password || '').length < 12) return send(res, 400, { error: 'INVALID_SIGNUP', code: 'INVALID_SIGNUP' });
    if (!accounts.has(email)) {
      accounts.set(email, { id: 'acc-' + (accounts.size + 1), name: b.fullName, email, password: b.password, verified: false,
        addresses: [{ id: 'addr-1', address: 'Av. Juárez 100, Centro', lat: 19.19, lng: -100.13 },
          { id: 'addr-2', address: 'Calle Pino 22, La Peña', lat: 19.2, lng: -100.12 }] });
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

  // Catálogo vacío para la portada.
  if (path === '/api/marketplace/stores' || path === '/api/marketplace/products') return send(res, 200, { items: [], page: 1, pageSize: 12, total: 0 });
  return send(res, 404, { error: 'not found' });
});
server.listen(PORT, '127.0.0.1');
