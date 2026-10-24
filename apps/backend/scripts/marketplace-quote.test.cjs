'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createQuoteService, assertQuoteUsable, MarketplaceQuoteError, TTL_MS } = require('../src/lib/marketplace-quote');
const createRouter = require('../src/routes/marketplace-quotes.routes');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../src/lib/marketplace-buyer-identity');
const jwt = require('jsonwebtoken');

// A regression must fail offline rather than reach a provider or a database.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const NOW = new Date('2026-10-23T12:00:00.000Z');
const KEY = 'quote-key-0123456789abcdef0123456789';
const ACCOUNT = 'acc-1';
const square = (minLat, minLng, maxLat, maxLng) => [
  { lat: minLat, lng: minLng }, { lat: minLat, lng: maxLng }, { lat: maxLat, lng: maxLng }, { lat: maxLat, lng: minLng }];
const INSIDE = { lat: 19.42, lng: -99.15 };
const OUTSIDE = { lat: 19.6, lng: -99.15 };
const ADDRESSES = new Map([['addr-in', INSIDE], ['addr-out', OUTSIDE]]);

// Fake ports. Listings for every merchant are returned on purpose, so the service must filter them.
function world() {
  const state = {
    merchant: { id: 'm1', status: 'ACTIVE', open: true, currency: 'MXN', minOrderCents: 0, freeDeliveryFromCents: null,
      commissionBps: 1000, prepMinutes: 20,
      zones: [{ id: 'z1', name: 'Centro', feeCents: 3000, active: true, polygon: square(19.40, -99.17, 19.44, -99.13) }] },
    listings: [
      { merchantId: 'm1', menuItemId: 'burger', name: 'Hamburguesa', unitPriceCents: 1999, published: true, available: true },
      { merchantId: 'm1', menuItemId: 'fries', name: 'Papas', unitPriceCents: 1005, published: true, available: true },
      { merchantId: 'm1', menuItemId: 'tenth', name: 'Dulce', unitPriceCents: 10, published: true, available: true },
      { merchantId: 'm1', menuItemId: 'hidden', name: 'Oculto', unitPriceCents: 500, published: false, available: true },
      { merchantId: 'm2', menuItemId: 'foreign', name: 'Ajeno', unitPriceCents: 500, published: true, available: true },
    ],
  };
  const saved = new Map();
  const byKey = new Map();
  const store = {
    saved,
    async save(quote) {
      if (byKey.has(quote.idempotencyKeyHash)) throw Object.assign(new Error('duplicate'), { code: 'DUPLICATE' });
      saved.set(quote.id, structuredClone(quote));
      byKey.set(quote.idempotencyKeyHash, quote.id);
      return quote;
    },
    async findByIdempotencyKey(hash) {
      const id = byKey.get(hash);
      return id ? structuredClone(saved.get(id)) : null;
    },
  };
  const catalog = {
    async loadMerchant(id) { return id === state.merchant.id ? structuredClone(state.merchant) : null; },
    async loadListings(_merchantId, ids) { return structuredClone(state.listings.filter(row => ids.includes(row.menuItemId))); },
  };
  const addresses = {
    async resolve(accountId, id) { return accountId === ACCOUNT ? ADDRESSES.get(id) ?? null : null; },
  };
  const service = createQuoteService({ catalog, addresses, quoteStore: store, now: () => NOW });
  return { state, store, catalog, addresses, service };
}

const request = (patch = {}) => ({ merchantId: 'm1', fulfillment: 'DELIVERY', deliveryAddressId: 'addr-in',
  items: [{ menuItemId: 'burger', quantity: 3 }, { menuItemId: 'fries', quantity: 1 }], ...patch });
const quote = (w, body = request(), key = KEY, accountId = ACCOUNT) => w.service.createQuote({ accountId, idempotencyKey: key, body });
function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof MarketplaceQuoteError && error.code === code
    && (statusCode === undefined || error.statusCode === statusCode));
}

test('exact cents: 3 x 19.99 + 10.05 plus 30.00 zone fee, 10% commission', async () => {
  const w = world();
  const r = await quote(w);
  assert.equal(r.subtotal, '70.02');
  assert.equal(r.deliveryFee, '30.00');
  assert.equal(r.total, '100.02');
  assert.equal(r.discount, '0.00');
  assert.equal(r.tip, '0.00');
  assert.equal(r.estimatedReadyMinutes, 20);
  assert.equal(r.deliveryAvailability, 'AVAILABLE');
  assert.deepEqual(r.items.find(line => line.menuItemId === 'burger'), { menuItemId: 'burger', name: 'Hamburguesa',
    quantity: 3, unitPrice: '19.99', lineTotal: '59.97' });
  const s = w.store.saved.get(r.quoteId).priceSnapshot;
  // 7002 * 10% = 700.2 cents -> 700 (commission). Merchant gets 6302. Courier gets the 3000 fee.
  assert.equal(s.commissionCents, 700);
  assert.equal(s.merchantPayoutCents, 6302);
  assert.equal(s.courierPayoutCents, 3000);
  assert.equal(s.merchantPayoutCents + s.commissionCents, s.subtotalCents);
});

test('commission rounds half up: 1005 cents at 10% is 101 cents', async () => {
  const w = world();
  const r = await quote(w, request({ items: [{ menuItemId: 'fries', quantity: 1 }], fulfillment: 'PICKUP', deliveryAddressId: undefined }));
  const s = w.store.saved.get(r.quoteId).priceSnapshot;
  assert.equal(s.commissionCents, 101);
  assert.equal(s.merchantPayoutCents, 904);
  assert.equal(r.subtotal, '10.05');
});

test('decimal strings carry no float noise: 3 x 0.10 is 0.30', async () => {
  const w = world();
  const r = await quote(w, request({ fulfillment: 'PICKUP', deliveryAddressId: undefined, items: [{ menuItemId: 'tenth', quantity: 3 }] }));
  assert.equal(r.subtotal, '0.30');
  assert.equal(r.total, '0.30');
  assert.equal(r.items[0].unitPrice, '0.10');
  assert.equal(r.items[0].lineTotal, '0.30');
  // 30 * 10% = 3 cents exactly; 0.30 - 0.03 = 0.27 to the merchant.
  assert.equal(w.store.saved.get(r.quoteId).priceSnapshot.commissionCents, 3);
});

test('commission split is exact and half-up for every subtotal from 1 to 1000 cents', async () => {
  const w = world();
  for (let cents = 1; cents <= 1000; cents++) {
    w.state.listings = [{ merchantId: 'm1', menuItemId: 'burger', name: 'X', unitPriceCents: cents, published: true, available: true }];
    const r = await quote(w, request({ fulfillment: 'PICKUP', deliveryAddressId: undefined, items: [{ menuItemId: 'burger', quantity: 1 }] }),
      `${KEY}-${cents}`);
    const s = w.store.saved.get(r.quoteId).priceSnapshot;
    assert.equal(s.commissionCents, Math.floor((cents * 1000 + 5000) / 10000), `commission for ${cents}`);
    assert.equal(s.commissionCents + s.merchantPayoutCents, cents);
  }
});

test('pickup has no fee, needs no address and skips zone coverage', async () => {
  const w = world();
  const r = await quote(w, request({ fulfillment: 'PICKUP', deliveryAddressId: undefined }));
  assert.equal(r.deliveryFee, '0.00');
  assert.equal(r.total, r.subtotal);
  assert.equal(r.deliveryAvailability, 'NOT_APPLICABLE');
});

test('delivery outside every zone is rejected and nothing is stored', async () => {
  const w = world();
  await rejects(quote(w, request({ deliveryAddressId: 'addr-out' })), 'DELIVERY_OUT_OF_RANGE', 409);
  assert.equal(w.store.saved.size, 0);
});

test('an address not owned by the account is not found', async () => {
  const w = world();
  await rejects(quote(w, request(), KEY, 'acc-2'), 'ADDRESS_NOT_FOUND', 404);
});

test('free-delivery threshold removes the fee but zone coverage is still required', async () => {
  const w = world();
  w.state.merchant.freeDeliveryFromCents = 5000;
  const r = await quote(w);
  assert.equal(r.deliveryFee, '0.00');
  assert.equal(r.total, '70.02');
  await rejects(quote(w, request({ deliveryAddressId: 'addr-out' }), `${KEY}-out`), 'DELIVERY_OUT_OF_RANGE', 409);
});

test('minimum order is enforced', async () => {
  const w = world();
  w.state.merchant.minOrderCents = 10000;
  await rejects(quote(w), 'MINIMUM_ORDER', 409);
});

test('closed merchants and unpublished merchants cannot be quoted', async () => {
  const w = world();
  w.state.merchant.open = false;
  await rejects(quote(w), 'MERCHANT_CLOSED', 409);
  w.state.merchant.open = true;
  w.state.merchant.status = 'SUSPENDED';
  await rejects(quote(w, request(), `${KEY}-s`), 'MERCHANT_NOT_FOUND', 404);
});

test('invalid commission configuration fails closed', async () => {
  const w = world();
  w.state.merchant.commissionBps = 10001;
  await rejects(quote(w), 'INVALID_COMMISSION', 503);
  assert.equal(w.store.saved.size, 0);
});

test('items from another merchant are rejected even when the catalog returns them', async () => {
  const w = world();
  await rejects(quote(w, request({ items: [{ menuItemId: 'foreign', quantity: 1 }] })), 'ITEM_NOT_AVAILABLE', 409);
  assert.equal(w.store.saved.size, 0);
});

test('unpublished, unknown and unavailable items are rejected as a whole basket', async () => {
  const w = world();
  await rejects(quote(w, request({ items: [{ menuItemId: 'hidden', quantity: 1 }] })), 'ITEM_NOT_AVAILABLE', 409);
  await rejects(quote(w, request({ items: [{ menuItemId: 'burger', quantity: 1 }, { menuItemId: 'ghost', quantity: 1 }] }), `${KEY}-g`),
    'ITEM_NOT_AVAILABLE', 409);
  w.state.listings.find(row => row.menuItemId === 'burger').available = false;
  await rejects(quote(w, request(), `${KEY}-a`), 'ITEM_NOT_AVAILABLE', 409);
  assert.equal(w.store.saved.size, 0);
});

test('price snapshot is frozen when the catalog changes after quoting', async () => {
  const w = world();
  const r = await quote(w);
  w.state.listings.find(row => row.menuItemId === 'burger').unitPriceCents = 2500;
  assert.equal(w.store.saved.get(r.quoteId).itemsSnapshot[0].unitPriceCents, 1999);
  const replayed = await quote(w);
  assert.equal(replayed.total, '100.02');
  const fresh = await quote(w, request(), `${KEY}-new`);
  // 3 x 25.00 + 10.05 = 85.05; the old quote kept 70.02 at quote time.
  assert.equal(fresh.subtotal, '85.05');
});

test('client-supplied money fields and prices are rejected, never trusted', async () => {
  const w = world();
  await rejects(quote(w, request({ total: 1 })), 'INVALID_QUOTE_REQUEST', 400);
  await rejects(quote(w, request({ deliveryFee: 0 }), `${KEY}-f`), 'INVALID_QUOTE_REQUEST', 400);
  await rejects(quote(w, request({ items: [{ menuItemId: 'burger', quantity: 1, price: 1 }] }), `${KEY}-p`), 'INVALID_ITEMS', 400);
  assert.equal(w.store.saved.size, 0);
});

test('invalid request shapes are rejected with 400 codes', async () => {
  const cases = [
    [{ items: [] }, 'INVALID_ITEMS'],
    [{ items: Array.from({ length: 51 }, (_, i) => ({ menuItemId: `i${i}`, quantity: 1 })) }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: 0 }] }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: 100 }] }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: '2' }] }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: 1.5 }] }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: 1 }, { menuItemId: 'burger', quantity: 2 }] }, 'INVALID_ITEMS'],
    [{ items: [{ menuItemId: 'burger', quantity: 1, modifiers: [{ id: 'x' }] }] }, 'INVALID_ITEMS'],
    [{ fulfillment: 'SHIPPING' }, 'INVALID_QUOTE_REQUEST'],
    [{ merchantId: '' }, 'INVALID_QUOTE_REQUEST'],
    [{ deliveryAddressId: undefined }, 'ADDRESS_REQUIRED'],
    [{ fulfillment: 'PICKUP' }, 'INVALID_QUOTE_REQUEST'],
  ];
  for (const [patch, code] of cases) {
    const w = world();
    await rejects(quote(w, request(patch)), code, 400);
  }
});

test('quote expires exactly five minutes after creation', async () => {
  assert.equal(TTL_MS, 5 * 60 * 1000);
  const w = world();
  const r = await quote(w);
  assert.equal(new Date(r.expiresAt).getTime() - NOW.getTime(), TTL_MS);
});

test('expiry is enforced at the TTL boundary', async () => {
  const w = world();
  const r = await quote(w);
  const stored = w.store.saved.get(r.quoteId);
  assert.equal(assertQuoteUsable(stored, new Date(NOW.getTime() + TTL_MS - 1)), true);
  assert.throws(() => assertQuoteUsable(stored, new Date(NOW.getTime() + TTL_MS)),
    error => error.code === 'QUOTE_EXPIRED' && error.statusCode === 409);
});

test('revoked quotes are not usable', async () => {
  const w = world();
  const r = await quote(w);
  const stored = { ...w.store.saved.get(r.quoteId), status: 'REVOKED' };
  assert.throws(() => assertQuoteUsable(stored, NOW), error => error.code === 'QUOTE_NOT_ACTIVE');
});

test('replay after expiry returns the stored expired quote without repricing', async () => {
  const w = world();
  const r = await quote(w);
  w.state.listings.find(row => row.menuItemId === 'burger').unitPriceCents = 2500;
  const later = createQuoteService({ catalog: w.catalog, addresses: w.addresses, quoteStore: w.store,
    now: () => new Date(NOW.getTime() + 10 * 60 * 1000) });
  const replayed = await later.createQuote({ accountId: ACCOUNT, idempotencyKey: KEY, body: request() });
  assert.equal(replayed.quoteId, r.quoteId);
  assert.equal(replayed.total, '100.02');
  assert.equal(replayed.expiresAt, r.expiresAt);
});

test('same key and same body return one quote; the store keeps one row', async () => {
  const w = world();
  const first = await quote(w);
  const second = await quote(w);
  assert.equal(second.quoteId, first.quoteId);
  assert.equal(w.store.saved.size, 1);
});

test('same key with a different body is a conflict', async () => {
  const w = world();
  await quote(w);
  await rejects(quote(w, request({ items: [{ menuItemId: 'burger', quantity: 4 }, { menuItemId: 'fries', quantity: 1 }] })),
    'IDEMPOTENCY_CONFLICT', 409);
  assert.equal(w.store.saved.size, 1);
});

test('a concurrent duplicate insert resolves to the quote that won', async () => {
  const w = world();
  const winner = await quote(w);
  const real = w.store.findByIdempotencyKey;
  let calls = 0;
  // The first lookup misses, as if the winner had not committed yet. The retry after DUPLICATE sees it.
  w.store.findByIdempotencyKey = async hash => (calls++ === 0 ? null : real(hash));
  const loser = await quote(w);
  assert.equal(loser.quoteId, winner.quoteId);
  assert.equal(w.store.saved.size, 1);
});

test('keys are scoped per account', async () => {
  const w = world();
  const a = await quote(w, request({ fulfillment: 'PICKUP', deliveryAddressId: undefined }));
  const b = await quote(w, request({ fulfillment: 'PICKUP', deliveryAddressId: undefined }), KEY, 'acc-2');
  assert.notEqual(a.quoteId, b.quoteId);
  assert.equal(w.store.saved.size, 2);
});

test('anonymous requests and malformed keys are rejected before pricing', async () => {
  const w = world();
  await rejects(w.service.createQuote({ accountId: undefined, idempotencyKey: KEY, body: request() }), 'UNAUTHENTICATED', 401);
  await rejects(quote(w, request(), 'short'), 'INVALID_IDEMPOTENCY_KEY', 400);
  await rejects(w.service.createQuote({ accountId: ACCOUNT, body: request() }), 'INVALID_IDEMPOTENCY_KEY', 400);
  assert.equal(w.store.saved.size, 0);
});

test('missing ports fail closed with 503', async () => {
  const service = createQuoteService({});
  await rejects(service.createQuote({ accountId: ACCOUNT, idempotencyKey: KEY, body: request() }), 'QUOTES_UNAVAILABLE', 503);
});

test('route: guest request resolves an identity and missing pricing adapters still fail closed with 503', async () => {
  const handlers = new Map();
  createRouter({ Router: () => ({ post: (p, fn) => handlers.set(`POST ${p}`, fn) }) });
  const res = await invoke(handlers.get('POST /'), { body: request(), headers: { 'idempotency-key': KEY } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'QUOTES_UNAVAILABLE');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('route: authenticated request returns 201 with the quote', async () => {
  const w = world();
  const handler = routeHandler({ service: w.service, resolveAccount: () => ACCOUNT });
  const res = await invoke(handler, { body: request(), headers: { 'idempotency-key': KEY } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.total, '100.02');
  assert.match(res.body.quoteId, /^[0-9a-f-]{36}$/);
});

test('route: missing store is 503 QUOTES_UNAVAILABLE', async () => {
  const handler = routeHandler({ resolveAccount: () => ACCOUNT });
  const res = await invoke(handler, { body: request(), headers: { 'idempotency-key': KEY } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'QUOTES_UNAVAILABLE');
});

test('route: validation errors map to 400 and unexpected errors do not leak details', async () => {
  const w = world();
  const handler = routeHandler({ service: w.service, resolveAccount: () => ACCOUNT });
  const bad = await invoke(handler, { body: request({ total: 1 }), headers: { 'idempotency-key': KEY } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.errorCode, 'INVALID_QUOTE_REQUEST');

  const broken = createQuoteService({ catalog: { loadMerchant: async () => { throw new Error('connection to db-internal failed'); },
    loadListings: async () => [] }, addresses: w.addresses, quoteStore: w.store, now: () => NOW });
  const failing = routeHandler({ service: broken, resolveAccount: () => ACCOUNT });
  const res = await invoke(failing, { body: request(), headers: { 'idempotency-key': KEY } });
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'QUOTES_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('db-internal'), false);
});

test('the quotes route is mounted at /api/marketplace/v1/quotes', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1\/quotes',\s*require\('\.\/routes\/marketplace-quotes\.routes'\)\(\)\)/);
});

function routeHandler(options) {
  const handlers = new Map();
  createRouter({ Router: () => ({ post: (p, fn) => handlers.set(`POST ${p}`, fn) }), ...options });
  return handlers.get('POST /');
}
async function invoke(handler, req) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  await handler({ ...req, body: req.body, headers: req.headers || {} }, res);
  return res;
}

test('merchantSlug resolves the server merchant ID and preserves exact pricing snapshots', async () => {
  const w = world(); w.state.merchant.slug = 'store-one';
  const requestedSlugs = [];
  w.catalog.loadMerchantBySlug = async slug => { requestedSlugs.push(slug); return structuredClone(w.state.merchant); };
  const result = await quote(w, request({ merchantId: undefined, merchantSlug: 'store-one' }));
  assert.equal(result.merchantId, 'm1'); assert.equal(result.total, '100.02');
  assert.deepEqual(requestedSlugs, ['store-one']); assert.equal(w.store.saved.get(result.quoteId).merchantId, 'm1');
  w.catalog.loadMerchantBySlug = () => { throw new Error('Replay must not resolve/reprice again'); };
  assert.equal((await quote(w, request({ merchantId: undefined, merchantSlug: 'store-one' }))).quoteId, result.quoteId);
});

test('merchantSlug is strictly an alternative and never a caller-controlled merchant ID', async () => {
  for (const merchantSlug of ['', '../other', 'Bad_Slug', ['store-one'], 'x'.repeat(101), null]) {
    const w = world(); await rejects(quote(w, request({ merchantId: undefined, merchantSlug })), 'INVALID_QUOTE_REQUEST', 400);
  }
  const w = world();
  await rejects(quote(w, request({ merchantSlug: 'store-one' })), 'INVALID_QUOTE_REQUEST', 400);
  await rejects(quote(w, request({ merchantId: undefined, merchantSlug: 'store-one' })), 'QUOTES_UNAVAILABLE', 503);
  assert.equal(w.store.saved.size, 0);
});

test('unknown or mismatched slug resolution fails without pricing a different merchant', async () => {
  const w = world();
  for (const merchant of [null, { ...w.state.merchant, slug: 'other-slug' }, { ...w.state.merchant, slug: 'store-one', status: 'SUSPENDED' }]) {
    w.catalog.loadMerchantBySlug = async () => merchant;
    await rejects(quote(w, request({ merchantId: undefined, merchantSlug: 'store-one' })), 'MERCHANT_NOT_FOUND', 404);
  }
  assert.equal(w.store.saved.size, 0);
});

test('slug requests still reject client money and cross-merchant items', async () => {
  const w = world(); w.catalog.loadMerchantBySlug = async () => ({ ...w.state.merchant, slug: 'store-one' });
  await rejects(quote(w, request({ merchantId: undefined, merchantSlug: 'store-one', total: 1 })), 'INVALID_QUOTE_REQUEST', 400);
  await rejects(quote(w, request({ merchantId: undefined, merchantSlug: 'store-one', items: [{ menuItemId: 'foreign', quantity: 1 }] })), 'ITEM_NOT_AVAILABLE', 409);
});

const BUYER_SECRET = 'offline-buyer-jwt-test-key-with-at-least-32-bytes';
const buyerOptions = { jwtSecret: () => BUYER_SECRET, now: () => NOW };
const signedBuyer = (patch = {}, options = {}) => jwt.sign({ userId: ACCOUNT, role: 'CUSTOMER', exp: NOW.getTime() / 1000 + 60, ...patch }, BUYER_SECRET, options);

test('default quote route verifies a storefront Bearer JWT and resolves its real buyer ID', async () => {
  const w = world(); const handler = routeHandler({ service: w.service, buyerOptions });
  const result = await invoke(handler, { body: request(), headers: { 'idempotency-key': KEY, authorization: `Bearer ${signedBuyer()}` } });
  assert.equal(result.statusCode, 201); assert.equal(w.store.saved.get(result.body.quoteId).accountId, ACCOUNT);
});

test('verified Bearer identity takes precedence over unsigned buyer or guest headers', async () => {
  const resolve = createBuyerAccountResolver({ ...buyerOptions, allowGuest: true });
  assert.equal(await resolve({ headers: { authorization: `Bearer ${signedBuyer()}`, 'x-buyer-id': 'untrusted-other', 'x-guest-id': 'guest' } }), ACCOUNT);
});

test('invalid, expired, untrusted, device and staff JWTs never downgrade to a guest identity', async () => {
  const handler = routeHandler({ buyerOptions, service: { createQuote: () => { throw new Error('must not price'); } } });
  const tokens = ['invalid', signedBuyer({ exp: NOW.getTime() / 1000 - 1 }), signedBuyer({ nbf: NOW.getTime() / 1000 + 60 }),
    signedBuyer({ role: 'SUPER_ADMIN' }), signedBuyer({ isDevice: true }), signedBuyer({ isActive: false }),
    signedBuyer({}, { algorithm: 'HS384' }), jwt.sign({ userId: ACCOUNT, role: 'CUSTOMER' }, BUYER_SECRET),
    jwt.sign({ userId: ACCOUNT, role: 'CUSTOMER', exp: NOW.getTime() / 1000 + 60 }, 'other-secret')];
  for (const token of tokens) {
    const res = await invoke(handler, { body: request(), headers: { authorization: `Bearer ${token}`, 'x-buyer-id': 'guest', 'x-guest-id': 'guest' } });
    assert.equal(res.statusCode, 401); assert.equal(res.body.errorCode, 'INVALID_BUYER_IDENTITY');
  }
});

test('Bearer requires a configured signing secret and never prints verifier errors or tokens', async () => {
  const handler = routeHandler({ buyerOptions: { jwtSecret: () => undefined }, service: {} });
  const res = await invoke(handler, { headers: { authorization: `Bearer ${signedBuyer()}` } });
  assert.equal(res.statusCode, 503); assert.equal(res.body.errorCode, 'BUYER_AUTH_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes(BUYER_SECRET), false); assert.equal(JSON.stringify(res.body).includes(signedBuyer()), false);
});

test('X-Buyer-Id and X-Guest-Id share an isolated stable guest namespace, not registered accounts', async () => {
  const quotes = createBuyerAccountResolver({ allowGuest: true }); const orders = createBuyerAccountResolver();
  const a = await quotes({ headers: { 'x-guest-id': 'synthetic-browser-session' } });
  const b = await orders({ headers: { 'x-buyer-id': 'synthetic-browser-session' } });
  assert.equal(a, b); assert.match(a, /^guest:[a-f0-9]{58}$/); assert.equal(a.length, 64);
  const spoofedRegistered = await orders({ headers: { 'x-buyer-id': ACCOUNT } });
  assert.notEqual(spoofedRegistered, ACCOUNT); assert.notEqual(spoofedRegistered, a);
  assert.equal(await orders({ headers: { 'x-guest-id': 'synthetic-browser-session' } }), null);
});

test('default quote route prices real guest requests without 401 and preserves per-guest idempotency', async () => {
  for (const header of ['x-buyer-id', 'x-guest-id']) {
    const w = world(); const handler = routeHandler({ service: w.service });
    const req = { body: request({ fulfillment: 'PICKUP', deliveryAddressId: undefined }), headers: { 'idempotency-key': KEY, [header]: 'synthetic-session' } };
    const first = await invoke(handler, req); const replay = await invoke(handler, req);
    assert.equal(first.statusCode, 201); assert.equal(replay.body.quoteId, first.body.quoteId);
    assert.match(w.store.saved.get(first.body.quoteId).accountId, /^guest:/);
    const other = await invoke(handler, { ...req, headers: { ...req.headers, [header]: 'another-session' } });
    assert.equal(other.statusCode, 201); assert.notEqual(other.body.quoteId, first.body.quoteId);
  }
});

test('IP/UA guest fallback is stable for quoting, bounded and unavailable for placing orders', async () => {
  const quotes = createBuyerAccountResolver({ allowGuest: true }); const orders = createBuyerAccountResolver();
  const req = { ip: '127.0.0.9', socket: { remoteAddress: '127.0.0.1' }, headers: { 'user-agent': 'Offline Browser', 'x-forwarded-for': 'attacker' } };
  const first = await quotes(req);
  assert.equal(await quotes(req), first); assert.equal(await orders(req), null);
  assert.notEqual(await quotes({ ...req, headers: { 'user-agent': 'Another Browser' } }), first);
  assert.equal(await quotes({ ...req, headers: { ...req.headers, 'x-forwarded-for': 'other' } }), first);
  assert.equal(first.includes('127.0.0.1'), false);
  assert.notEqual(await quotes({ headers: {} }), await quotes({ headers: {} }));
});

test('IP/UA fallback reaches the real quote service as a guest instead of rejecting anonymous buyers', async () => {
  const w = world(); const handler = routeHandler({ service: w.service });
  const req = { ip: '127.0.0.1', headers: { 'idempotency-key': KEY, 'user-agent': 'Offline Browser' },
    body: request({ fulfillment: 'PICKUP', deliveryAddressId: undefined }) };
  const res = await invoke(handler, req); const replay = await invoke(handler, req);
  assert.equal(res.statusCode, 201); assert.equal(replay.body.quoteId, res.body.quoteId);
});

test('malformed explicit credentials fail closed and injected identity resolvers retain precedence', async () => {
  const resolve = createBuyerAccountResolver({ allowGuest: true });
  for (const headers of [{ authorization: ['Bearer token'] }, { authorization: 'Basic token' }, { authorization: 'Bearer ' },
    { 'x-buyer-id': '' }, { 'x-buyer-id': ['other'] }, { 'x-guest-id': '\r\ninvalid' }, { 'x-guest-id': 'x'.repeat(129) }]) {
    await assert.rejects(resolve({ headers }), error => error instanceof BuyerIdentityError && error.statusCode === 401);
  }
  const w = world(); const handler = routeHandler({ service: w.service, resolveAccount: () => ACCOUNT });
  const res = await invoke(handler, { body: request(), headers: { authorization: 'invalid', 'idempotency-key': KEY } });
  assert.equal(res.statusCode, 201);
});
