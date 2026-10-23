'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const forbidden = () => { throw new Error('Offline suite forbids network and external database access'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};

const { createQuoteService, TTL_MS } = require('../src/lib/marketplace-quote');
const { createMarketplaceOrderOrchestrator, MarketplaceOrderOrchestratorError } = require('../src/lib/marketplace-order-orchestrator');
const { verifyPin } = require('../src/lib/marketplace-dispatch');
const createRouter = require('../src/routes/marketplace-orders-v1.routes');
const NOW = new Date('2026-10-23T12:00:00.000Z');
const KEY = 'order-key-0123456789abcdef0123456789';
const SECRET = 'offline-order-pin-key-at-least-thirty-two-bytes';
const ACCOUNT = 'account-1';
const checkCode = (expected, status) => error => error instanceof MarketplaceOrderOrchestratorError
  && error.code === expected && (status === undefined || error.statusCode === status);

function match(row, where = {}) {
  return Object.entries(where).every(([key, value]) => value && typeof value === 'object'
    ? 'in' in value ? value.in.includes(row[key]) : match(row[key], value) : row[key] === value);
}
function project(row, select) {
  if (!row) return null;
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).map(([key, spec]) => [key,
    spec === true ? structuredClone(row[key]) : project(row[key], spec.select)]));
}

async function fixture(options = {}) {
  let clock = new Date(NOW); let queue = Promise.resolve(); let sequence = 0;
  let state = { quotes: new Map(), references: new Map(), orders: [], pipelines: [], counter: 0, events: [],
    restaurants: [{ id: 'r1', slug: 'store-one', isActive: true }],
    locations: [{ id: 'l1', restaurantId: 'r1', isActive: true }],
    products: [{ id: 'burger', restaurantId: 'r1', price: 999 }, { id: 'fries', restaurantId: 'r1', price: 999 }] };
  const calls = []; const hooks = {}; const transactions = new WeakMap();
  const merchant = { id: 'm1', restaurantId: 'r1', locationId: 'l1', slug: 'store-one', status: 'ACTIVE', open: true,
    currency: 'MXN', commissionBps: 1000, prepMinutes: 15, deliveryPolicy: 'SHARED_ONLY',
    zones: [{ id: 'z1', feeCents: 3000, active: true, polygon: [
      { lat: 19.40, lng: -99.17 }, { lat: 19.40, lng: -99.13 }, { lat: 19.44, lng: -99.13 }, { lat: 19.44, lng: -99.17 }] }] };
  const savedAddress = { id: 'addr1', accountId: ACCOUNT, address: 'Direccion sintetica 123', lat: 19.42, lng: -99.15 };
  function transactionState(tx) {
    assert.ok(transactions.has(tx), 'Port must receive the exact active transaction');
    return transactions.get(tx);
  }
  async function before(name, args) { calls.push({ name, args }); if (hooks[name]) await hooks[name](args); }
  const quoteStore = {
    async save(quote) { state.quotes.set(quote.id, structuredClone(quote)); },
    async findByIdempotencyKey(key) { return structuredClone([...state.quotes.values()].find(quote => quote.idempotencyKeyHash === key) ?? null); },
    async findById(args) {
      await before('quote.find', args);
      const quote = transactionState(args.tx).quotes.get(args.quoteId);
      return structuredClone(quote?.accountId === args.accountId ? quote : null);
    },
    async findOrderReference(args) {
      await before('reference.find', args);
      const ref = transactionState(args.tx).references.get(args.requestKeyHash);
      return structuredClone(ref?.accountId === args.accountId ? ref : null);
    },
    async consume(args) {
      await before('quote.consume', args);
      const draft = transactionState(args.tx); const quote = draft.quotes.get(args.quoteId);
      if (!quote || quote.accountId !== args.accountId || quote.status !== 'ACTIVE' || new Date(quote.expiresAt) <= args.at) return { count: 0 };
      quote.status = 'CONSUMED'; quote.orderId = args.orderId;
      draft.references.set(args.requestKeyHash, { accountId: args.accountId, orderId: args.orderId, restaurantId: args.restaurantId });
      if (hooks.afterConsume) await hooks.afterConsume(args);
      return { count: 1 };
    },
  };
  const addresses = { async resolve(accountId, id, { tx } = {}) {
    if (tx) transactionState(tx);
    await before('address.resolve', { accountId, id, tx });
    return id === savedAddress.id && accountId === savedAddress.accountId ? structuredClone(savedAddress) : null;
  } };
  const merchants = { async resolve(id, { tx }) {
    transactionState(tx); await before('merchant.resolve', { id, tx });
    return id === merchant.id ? structuredClone(merchant) : null;
  } };
  const prismaClient = { async $transaction(work, transactionOptions) {
    const previous = queue; let release;
    queue = new Promise(resolve => { release = resolve; }); await previous;
    calls.push({ name: '$transaction', args: transactionOptions });
    const draft = structuredClone(state); const tx = {};
    transactions.set(tx, draft);
    try {
      if (hooks.begin) await hooks.begin();
      for (const [model, collection] of [['restaurant', 'restaurants'], ['location', 'locations'], ['menuItem', 'products']]) {
        tx[model] = { async findFirst(args) { await before(`${model}.find`, args); return project(draft[collection].find(row => match(row, args.where)), args.select); },
          async findMany(args) { await before(`${model}.findMany`, args); return draft[collection].filter(row => match(row, args.where)).map(row => project(row, args.select)); } };
      }
      tx.counter = { async updateMany(args) { assert.equal(args.where.restaurantId, 'r1');
        if (!draft.counter) return { count: 0 }; draft.counter++; return { count: 1 }; },
      async findFirst() { return { value: draft.counter }; }, async create(args) { draft.counter = args.data.value; return { value: draft.counter }; } };
      tx.order = { async count() { return draft.orders.length; }, async create(args) {
        await before('order.create', args);
        if (draft.orders.some(order => order.id === args.data.id || order.clientOrderId === args.data.clientOrderId)) {
          throw Object.assign(new Error('Duplicate order'), { code: 'P2002' });
        }
        draft.orders.push(structuredClone(args.data)); return project(args.data, args.select);
      } };
      tx.marketplaceOrderPipeline = { async create(args) { await before('pipeline.create', args); draft.pipelines.push(structuredClone(args.data)); return structuredClone(args.data); },
        async findFirst(args) {
          await before('pipeline.find', args);
          const row = draft.pipelines.find(row => match(row, args.where));
          return row ? project({ ...row, order: draft.orders.find(order => order.id === row.orderId) }, args.select) : null;
        } };
      const result = await work(tx);
      if (hooks.commit) await hooks.commit();
      state = draft;
      return result;
    } finally { transactions.delete(tx); release(); }
  } };
  const outbox = { async append({ event, tx }) { await before('outbox.append', { event, tx }); transactionState(tx).events.push(structuredClone(event)); } };
  const catalog = { async loadMerchant() { return structuredClone(merchant); }, async loadListings(_id, ids) {
    return [{ merchantId: 'm1', menuItemId: 'burger', name: 'Hamburguesa', unitPriceCents: 1999, published: true, available: true },
      { merchantId: 'm1', menuItemId: 'fries', name: 'Papas', unitPriceCents: 1005, published: true, available: true }].filter(row => ids.includes(row.menuItemId));
  } };
  const quotes = createQuoteService({ catalog, addresses, quoteStore, now: () => clock });
  const quoteRequest = { merchantId: 'm1', fulfillment: options.fulfillment ?? 'DELIVERY', items: [
    { menuItemId: 'burger', quantity: 3 }, { menuItemId: 'fries', quantity: 1 }] };
  if (quoteRequest.fulfillment === 'DELIVERY') quoteRequest.deliveryAddressId = 'addr1';
  const quoted = await quotes.createQuote({ accountId: ACCOUNT, idempotencyKey: `quote-${KEY}`, body: quoteRequest });
  const ports = { quoteStore, prismaClient, merchants, addresses, outbox, pinSecrets: { test: SECRET }, activePinKeyId: 'test',
    now: () => clock, newId: () => `order-${++sequence}` };
  const service = createMarketplaceOrderOrchestrator({ ...ports, ...options.service });
  function input(patch = {}) {
    return { quoteId: quoted.quoteId, ...(quoteRequest.fulfillment === 'DELIVERY' ? { deliveryAddressId: 'addr1' } : {}),
      paymentMethod: 'ONLINE', customer: { name: 'Persona sintetica', phone: '5555555555', email: 'buyer@example.invalid' }, ...patch };
  }
  const f = { service, ports, calls, hooks, merchant, savedAddress, input, quoted, quotes, quoteRequest,
    get state() { return state; }, get quote() { return state.quotes.get(quoted.quoteId); },
    setTime(date) { clock = new Date(date); }, advance(ms) { clock = new Date(clock.getTime() + ms); },
    create(patch = {}, args = {}) { return service.createOrder({ accountId: ACCOUNT, idempotencyKey: KEY, body: input(patch), ...args }); } };
  calls.length = 0;
  return f;
}

function http(f, options = {}) {
  let handler;
  createRouter({ Router: () => ({ post(route, fn) { assert.equal(route, '/'); handler = fn; } }), service: f?.service,
    resolveAccount: () => ACCOUNT, ...options });
  return async ({ body = f?.input(), headers = { 'idempotency-key': KEY }, ...req } = {}) => {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body, headers, ...req }, res); return res;
  };
}

test('offline guards reject sockets, HTTP, fetch and real database imports', () => {
  assert.throws(() => fetch('https://example.invalid'), /Offline suite/);
  assert.throws(() => require('node:http').request('http://127.0.0.1'), /Offline suite/);
  assert.throws(() => require('node:net').connect(1, '127.0.0.1'), /Offline suite/);
  assert.throws(() => require('@mrtpvrest/database'), /Offline suite/);
});

test('real quote service feeds ONLINE creation with exact snapshots, nested items and pending delivery', async () => {
  const f = await fixture(); const priceSnapshot = structuredClone(f.quote.priceSnapshot); const result = await f.create({ notes: 'Sin cebolla' });
  assert.equal(result.status, 'PENDING_PAYMENT'); assert.equal(result.paymentStatus, 'PENDING');
  assert.equal(result.quoteId, f.quote.id); assert.equal(result.orderId, 'order-1');
  assert.equal(result.subtotal, '70.02'); assert.equal(result.deliveryFee, '30.00'); assert.equal(result.total, '100.02');
  assert.equal(result.commissionBps, 1000); assert.equal(result.commission, '7.00');
  assert.equal(result.merchantPayout, '63.02'); assert.equal(result.courierPayout, '30.00');
  assert.equal(result.dispatch.status, 'WAITING_READY'); assert.equal(result.idempotent, false);
  assert.deepEqual(result.items[0], { menuItemId: 'burger', name: 'Hamburguesa', quantity: 3, unitPrice: '19.99', lineTotal: '59.97' });
  const order = f.state.orders[0]; const pipeline = f.state.pipelines[0];
  assert.equal(order.source, 'MARKETPLACE'); assert.equal(order.restaurantId, 'r1'); assert.equal(order.locationId, 'l1');
  assert.equal(order.paymentMethod, 'CARD'); assert.equal(order.notes, 'Sin cebolla'); assert.equal(order.orderNumber, '1');
  assert.equal(order.deliveryAddress, f.savedAddress.address); assert.equal(order.deliveryLat, f.savedAddress.lat);
  assert.equal(order.items.create[0].price, 19.99); assert.equal(order.items.create[0].subtotal, 59.97);
  assert.equal(pipeline.dispatch.offer, null); assert.equal(f.quote.status, 'CONSUMED');
  for (const [key, value] of Object.entries(priceSnapshot)) assert.deepEqual(pipeline.settlement[key], value);
  assert.equal(f.state.events.length, 1); assert.equal(f.state.events[0].room, 'restaurant:r1:location:l1');
  assert.equal(f.calls.find(call => call.name === '$transaction').args.isolationLevel, 'Serializable');
});

test('CASH creates pending merchant order, OFFERING task and no false paid state', async () => {
  const f = await fixture(); const result = await f.create({ paymentMethod: 'CASH' });
  assert.equal(result.status, 'PENDING_MERCHANT'); assert.equal(result.paymentMethod, 'CASH'); assert.equal(result.paymentStatus, 'PENDING');
  assert.equal(result.dispatch.status, 'OFFERING'); assert.equal(f.state.pipelines[0].dispatch.offer.source, 'SHARED');
  assert.equal(f.state.orders[0].status, 'PENDING_MERCHANT'); assert.equal(f.state.events.length, 1);
});

test('PICKUP creates no DeliveryTask, has no address lookup, and preserves zero delivery cents', async () => {
  const f = await fixture({ fulfillment: 'PICKUP' }); const result = await f.create({ paymentMethod: 'CASH' });
  assert.equal(result.dispatch, null); assert.equal(result.deliveryFee, '0.00'); assert.equal(result.courierPayout, '0.00');
  assert.equal(result.total, '70.02'); assert.equal(f.state.orders[0].orderType, 'TAKEOUT');
  assert.equal(f.state.orders[0].deliveryAddress, null); assert.equal(f.calls.some(call => call.name === 'address.resolve'), false);
});

for (const policy of ['OWN_ONLY', 'OWN_THEN_SHARED', 'MANUAL']) {
  test(`CASH dispatch respects ${policy} without publishing a shared offer`, async () => {
    const f = await fixture(); f.merchant.deliveryPolicy = policy;
    const result = await f.create({ paymentMethod: 'CASH' }); const dispatch = f.state.pipelines[0].dispatch;
    assert.equal(dispatch.offer, null); assert.equal(dispatch.task.deliveryPolicy, policy);
    assert.equal(result.dispatch.status, policy === 'MANUAL' ? 'WAITING_READY' : 'OFFERING');
  });
}

test('PINs have six digits, use HMAC domain separation, and persist only hashes', async () => {
  const f = await fixture(); const result = await f.create(); const pipeline = f.state.pipelines[0];
  for (const pin of [result.pickupPin, result.deliveryPin]) assert.match(pin, /^\d{6}$/);
  assert.notEqual(result.pickupPin, result.deliveryPin); assert.match(result.trackingToken, /^[a-f0-9]{64}$/);
  assert.equal(verifyPin(result.pickupPin, pipeline.pickupPinHash), true); assert.equal(verifyPin(result.deliveryPin, pipeline.deliveryPinHash), true);
  const expected = crypto.createHmac('sha256', SECRET).update(JSON.stringify(['marketplace-order-v1', 'pickup', ACCOUNT, result.orderId])).digest().readUInt32BE(0) % 1000000;
  assert.equal(result.pickupPin, String(expected).padStart(6, '0'));
  assert.equal(crypto.createHash('sha256').update(result.trackingToken).digest('hex'), pipeline.trackingTokenHash);
  const raw = JSON.stringify(pipeline);
  assert.equal(raw.includes('"pickupPin":'), false); assert.equal(raw.includes('"deliveryPin":'), false);
  assert.equal(raw.includes('"trackingToken":'), false); assert.equal(raw.includes(SECRET), false); assert.equal(raw.includes(KEY), false);
});

test('same account/key/body replays the order and stable credentials even after quote expiry and deletion', async () => {
  const f = await fixture(); const first = await f.create(); f.advance(TTL_MS + 1); f.state.quotes.clear();
  const replay = await f.create(); assert.deepEqual(replay, { ...first, idempotent: true });
  assert.equal(f.state.orders.length, 1); assert.equal(f.state.pipelines.length, 1); assert.equal(f.state.events.length, 1);
  assert.equal(f.state.counter, 1); assert.equal(f.calls.filter(call => call.name === 'quote.find').length, 1);
});

test('replay reflects persisted order status without another dispatch or notification', async () => {
  const f = await fixture(); await f.create(); f.state.orders[0].status = 'PREPARING';
  assert.equal((await f.create()).status, 'PREPARING'); assert.equal(f.state.events.length, 1);
});

test('reusing a key with changed body conflicts instead of replaying a different operation', async () => {
  const f = await fixture(); await f.create();
  for (const patch of [{ paymentMethod: 'CASH' }, { notes: 'Cambio' }, { quoteId: 'another' },
    { customer: { name: 'Otra persona', phone: '5555555555' } }, { deliveryAddressId: 'other' }]) {
    await assert.rejects(f.create(patch), checkCode('IDEMPOTENCY_CONFLICT', 409));
  }
  assert.equal(f.state.orders.length, 1); assert.equal(f.state.references.size, 1);
});

test('consumed quote cannot create another order under a different key', async () => {
  const f = await fixture(); await f.create();
  await assert.rejects(f.create({}, { idempotencyKey: `${KEY}-second` }), checkCode('QUOTE_NOT_ACTIVE', 409));
  assert.equal(f.state.orders.length, 1);
});

test('missing, foreign and expired quotes return exact public errors before any write', async () => {
  const f = await fixture();
  await assert.rejects(f.create({ quoteId: 'missing' }), checkCode('QUOTE_NOT_FOUND', 404));
  await assert.rejects(f.create({}, { accountId: 'another-account' }), checkCode('QUOTE_NOT_FOUND', 404));
  f.advance(TTL_MS);
  await assert.rejects(f.create(), checkCode('QUOTE_EXPIRED', 409));
  assert.equal(f.state.orders.length, 0); assert.equal(f.state.references.size, 0);
});

test('one millisecond before expiry is usable and invalid expiry dates are rejected', async () => {
  const f = await fixture(); f.advance(TTL_MS - 1); assert.equal((await f.create()).status, 'PENDING_PAYMENT');
  const g = await fixture(); g.quote.expiresAt = 'invalid';
  await assert.rejects(g.create(), checkCode('QUOTE_EXPIRED', 409));
});

test('expired and revoked quote statuses cannot be consumed', async () => {
  for (const [status, expected] of [['EXPIRED', 'QUOTE_EXPIRED'], ['REVOKED', 'QUOTE_NOT_ACTIVE']]) {
    const f = await fixture(); f.quote.status = status;
    await assert.rejects(f.create(), checkCode(expected, 409)); assert.equal(f.state.orders.length, 0);
  }
});

test('a quote that expires during preparation or writes rolls everything back', async () => {
  for (const name of ['merchant.resolve', 'pipeline.create']) {
    const f = await fixture(); f.hooks[name] = () => f.advance(TTL_MS);
    await assert.rejects(f.create(), checkCode('QUOTE_EXPIRED', 409));
    assert.equal(f.state.orders.length, 0); assert.equal(f.state.pipelines.length, 0); assert.equal(f.state.events.length, 0);
    assert.equal(f.state.counter, 0); assert.equal(f.quote.status, 'ACTIVE');
  }
});

test('60 simultaneous duplicate requests across service instances produce one committed order', async () => {
  const f = await fixture(); const second = createMarketplaceOrderOrchestrator(f.ports);
  const results = await Promise.all(Array.from({ length: 60 }, (_, index) => (index % 2 ? second : f.service).createOrder({
    accountId: ACCOUNT, idempotencyKey: KEY, body: f.input() })));
  assert.equal(new Set(results.map(row => row.orderId)).size, 1); assert.equal(results.filter(row => !row.idempotent).length, 1);
  assert.equal(f.state.orders.length, 1); assert.equal(f.state.references.size, 1); assert.equal(f.state.pipelines.length, 1);
  assert.equal(f.state.events.length, 1); assert.equal(f.state.counter, 1);
});

test('two different keys racing to consume one quote have only one winner', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.create(), f.create({}, { idempotencyKey: `${KEY}-other` })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.statusCode, 409);
  assert.equal(f.state.orders.length, 1); assert.equal(f.state.events.length, 1);
});

for (const name of ['order.create', 'pipeline.create', 'outbox.append', 'quote.consume', 'afterConsume', 'commit']) {
  test(`atomic rollback when ${name} fails, followed by a successful retry`, async () => {
    const f = await fixture(); f.hooks[name] = () => { throw new Error(`synthetic failure ${name}`); };
    await assert.rejects(f.create(), /synthetic failure/);
    assert.equal(f.state.orders.length, 0); assert.equal(f.state.pipelines.length, 0); assert.equal(f.state.events.length, 0);
    assert.equal(f.state.references.size, 0); assert.equal(f.state.counter, 0); assert.equal(f.quote.status, 'ACTIVE');
    delete f.hooks[name]; assert.equal((await f.create()).idempotent, false); assert.equal(f.state.orders.length, 1);
  });
}

test('quote consume CAS losing after order writes rolls back both order and pipeline', async () => {
  const f = await fixture();
  const service = createMarketplaceOrderOrchestrator({ ...f.ports, quoteStore: { ...f.ports.quoteStore, consume: async () => ({ count: 0 }) } });
  await assert.rejects(service.createOrder({ accountId: ACCOUNT, idempotencyKey: KEY, body: f.input() }), checkCode('QUOTE_CONFLICT', 409));
  assert.equal(f.state.orders.length, 0); assert.equal(f.state.events.length, 0); assert.equal(f.quote.status, 'ACTIVE');
});

for (const errorCode of ['P2002', 'P2034', 'P2028']) {
  test(`bounded transaction retry handles ${errorCode} without duplicate orders`, async () => {
    const f = await fixture(); let attempts = 0;
    f.hooks.commit = () => { if (attempts++ === 0) throw Object.assign(new Error('retryable'), { code: errorCode }); };
    const result = await f.create(); assert.equal(result.idempotent, false);
    assert.equal(f.calls.filter(call => call.name === '$transaction').length, 2); assert.equal(f.state.orders.length, 1);
    assert.equal(f.state.counter, 1); assert.equal(f.state.events.length, 1);
  });
}

test('persistent transaction conflicts stop after three attempts and return 409', async () => {
  const f = await fixture(); f.hooks.begin = () => { throw Object.assign(new Error('conflict'), { code: 'P2034' }); };
  await assert.rejects(f.create(), checkCode('ORDER_CONFLICT', 409));
  assert.equal(f.calls.filter(call => call.name === '$transaction').length, 3); assert.equal(f.state.orders.length, 0);
});

test('snapshot integrity rejects fractional, negative, overflowing, unbalanced and mismatched line money', async () => {
  const mutations = [s => { s.subtotalCents = 1.5; }, s => { s.deliveryFeeCents = -1; }, s => { s.totalCents = 100000001; },
    s => { s.totalCents++; }, s => { s.merchantPayoutCents++; }, s => { s.courierPayoutCents++; },
    s => { s.commissionBps = 10001; }, s => { s.commissionBps = '1000'; }];
  for (const mutate of mutations) {
    const f = await fixture(); mutate(f.quote.priceSnapshot);
    await assert.rejects(f.create(), checkCode('QUOTE_INTEGRITY_ERROR', 503)); assert.equal(f.state.orders.length, 0);
  }
  for (const mutate of [q => { q.itemsSnapshot[0].lineCents++; }, q => { q.currency = 'USD'; },
    q => { q.itemsSnapshot.push(q.itemsSnapshot[0]); }, q => { q.itemsSnapshot = []; }]) {
    const f = await fixture(); mutate(f.quote); await assert.rejects(f.create(), checkCode('QUOTE_INTEGRITY_ERROR', 503));
  }
});

test('snapshot amounts and names are used unchanged after live catalog prices change', async () => {
  const f = await fixture(); f.state.products.forEach(item => { item.price = 5000; item.name = 'Changed'; });
  f.merchant.commissionBps = 9000;
  const result = await f.create(); assert.equal(result.total, '100.02'); assert.equal(result.commissionBps, 1000);
  assert.equal(result.items[0].name, 'Hamburguesa'); assert.equal(f.state.orders[0].items.create[0].price, 19.99);
});

test('free delivery and fractional-decimal prices retain exact two-digit formatting', async () => {
  const f = await fixture(); const s = f.quote.priceSnapshot;
  f.quote.itemsSnapshot = [{ menuItemId: 'burger', name: 'Dulce', quantity: 3, unitPriceCents: 10, lineCents: 30 }];
  Object.assign(s, { subtotalCents: 30, deliveryFeeCents: 0, commissionBps: 1000, commissionCents: 3, merchantPayoutCents: 27, courierPayoutCents: 0, totalCents: 30 });
  const result = await f.create(); assert.equal(result.subtotal, '0.30'); assert.equal(result.total, '0.30');
  assert.equal(result.deliveryFee, '0.00'); assert.equal(result.commission, '0.03'); assert.equal(result.merchantPayout, '0.27');
});

test('unknown request fields, prices and spoofed authority reject before touching transaction ports', async () => {
  const f = await fixture();
  for (const patch of [{ total: 1 }, { subtotalCents: 1 }, { items: [] }, { price: 0 }, { commissionBps: 0 },
    { restaurantId: 'r2' }, { accountId: 'other' }, { status: 'PAID' }, { pickupPin: '123456' }, { trackingToken: 'forged' }]) {
    await assert.rejects(f.create(patch), checkCode('INVALID_ORDER_REQUEST', 422));
  }
  assert.equal(f.calls.length, 0);
});

test('validation of account, key, quote, payment, customer and notes is strict and offline', async () => {
  const f = await fixture();
  for (const accountId of [null, undefined, '', ' ']) await assert.rejects(f.create({}, { accountId }), checkCode('UNAUTHENTICATED', 401));
  for (const idempotencyKey of [undefined, '', 'short', 'x'.repeat(129), ['bad']]) {
    await assert.rejects(f.create({}, { idempotencyKey }), checkCode('INVALID_IDEMPOTENCY_KEY', 422));
  }
  for (const [patch, code] of [[{ quoteId: '' }, 'INVALID_QUOTE_ID'], [{ paymentMethod: 'PAID' }, 'INVALID_PAYMENT_METHOD'],
    [{ customer: null }, 'INVALID_CUSTOMER'], [{ customer: { name: 'P', phone: '1' } }, 'INVALID_CUSTOMER'],
    [{ customer: { name: 'P', phone: '5555555555', email: 'invalid' } }, 'INVALID_CUSTOMER'],
    [{ notes: 'x'.repeat(1001) }, 'INVALID_NOTES'], [{ notes: {} }, 'INVALID_NOTES']]) await assert.rejects(f.create(patch), checkCode(code));
  assert.equal(f.calls.length, 0);
});

test('non-object order bodies and invalid address IDs fail with controlled validation errors', async () => {
  const f = await fixture();
  for (const body of [null, undefined, [], 'invalid', 1]) {
    await assert.rejects(f.create({}, { body }), checkCode('INVALID_ORDER_REQUEST', 422));
  }
  for (const deliveryAddressId of [null, 1, [], ' ']) await assert.rejects(f.create({ deliveryAddressId }), checkCode('INVALID_ADDRESS', 422));
  assert.equal(f.calls.length, 0);
});

test('address must match quote and still belong to the authenticated account', async () => {
  const f = await fixture(); await assert.rejects(f.create({ deliveryAddressId: 'other' }), checkCode('QUOTE_ADDRESS_MISMATCH', 409));
  f.savedAddress.accountId = 'another'; await assert.rejects(f.create(), checkCode('ADDRESS_NOT_FOUND', 404));
  assert.equal(f.state.orders.length, 0);
  const pickup = await fixture({ fulfillment: 'PICKUP' });
  await assert.rejects(pickup.create({ deliveryAddressId: 'addr1' }), checkCode('QUOTE_ADDRESS_MISMATCH', 409));
});

test('merchant mapping, location ownership and item restaurant membership are checked without repricing', async () => {
  for (const mutate of [f => { f.merchant.status = 'SUSPENDED'; }, f => { f.merchant.restaurantId = 'r2'; },
    f => { f.state.locations[0].restaurantId = 'r2'; }, f => { f.state.locations[0].isActive = false; },
    f => { f.state.restaurants[0].isActive = false; }, f => { f.merchant.slug = 'forged'; }]) {
    const f = await fixture(); mutate(f); await assert.rejects(f.create(), checkCode('MERCHANT_NOT_FOUND', 404));
    assert.equal(f.state.orders.length, 0);
  }
  const f = await fixture(); f.state.products[0].restaurantId = 'r2';
  await assert.rejects(f.create(), checkCode('QUOTE_ITEMS_UNAVAILABLE', 409));
});

test('all tenant-scoped queries/writes use the merchant resolved from the quote', async () => {
  const f = await fixture(); await f.create(); await f.create();
  for (const call of f.calls.filter(call => ['location.find', 'menuItem.findMany', 'pipeline.find'].includes(call.name))) {
    assert.equal(call.args.where.restaurantId, 'r1');
  }
  for (const call of f.calls.filter(call => ['order.create', 'pipeline.create'].includes(call.name))) assert.equal(call.args.data.restaurantId, 'r1');
});

test('different accounts can use the same Idempotency-Key without reading each other orders', async () => {
  const f = await fixture(); const first = await f.create();
  await assert.rejects(f.create({}, { accountId: 'account-2' }), checkCode('QUOTE_NOT_FOUND', 404));
  const quote2 = structuredClone(f.quote); quote2.id = 'quote-2'; quote2.accountId = 'account-2'; quote2.status = 'ACTIVE';
  f.state.quotes.set(quote2.id, quote2); f.savedAddress.accountId = 'account-2';
  const second = await f.create({ quoteId: quote2.id }, { accountId: 'account-2' });
  assert.notEqual(first.orderId, second.orderId); assert.notEqual(first.trackingToken, second.trackingToken);
  assert.notEqual(f.state.orders[0].clientOrderId, f.state.orders[1].clientOrderId);
  assert.equal(f.state.orders.length, 2);
});

test('key rotation replays using the original key and fails closed if that key is removed', async () => {
  const f = await fixture(); const first = await f.create();
  const rotated = createMarketplaceOrderOrchestrator({ ...f.ports, activePinKeyId: 'new', pinSecrets: { test: SECRET, new: `${SECRET}-new` } });
  const replay = await rotated.createOrder({ accountId: ACCOUNT, idempotencyKey: KEY, body: f.input() });
  assert.equal(replay.pickupPin, first.pickupPin); assert.equal(replay.trackingToken, first.trackingToken);
  const lost = createMarketplaceOrderOrchestrator({ ...f.ports, activePinKeyId: 'new', pinSecrets: { new: `${SECRET}-new` } });
  await assert.rejects(lost.createOrder({ accountId: ACCOUNT, idempotencyKey: KEY, body: f.input() }), checkCode('PIN_KEY_UNAVAILABLE', 503));
  assert.equal(f.state.orders.length, 1);
});

test('missing PIN keys or invalid clock fail without consuming a quote or creating an order', async () => {
  for (const service of [{ pinSecrets: {} }, { pinSecrets: { test: 'short' } }, { now: () => new Date('invalid') }]) {
    const f = await fixture({ service });
    await assert.rejects(f.create(), checkCode(service.now ? 'INVALID_CLOCK' : 'PIN_KEY_UNAVAILABLE', 503));
    assert.equal(f.state.orders.length, 0); assert.equal(f.quote.status, 'ACTIVE');
  }
});

test('PIN derivation preserves leading zeros in six-digit codes', async () => {
  const orderId = Array.from({ length: 1000 }, (_, index) => `leading-${index}`).find(id =>
    crypto.createHmac('sha256', SECRET).update(JSON.stringify(['marketplace-order-v1', 'pickup', ACCOUNT, id])).digest().readUInt32BE(0) % 1000000 < 100000);
  assert.ok(orderId);
  const f = await fixture({ service: { newId: () => orderId } }); const result = await f.create();
  assert.match(result.pickupPin, /^0\d{5}$/); assert.equal(verifyPin(result.pickupPin, f.state.pipelines[0].pickupPinHash), true);
});

test('injected dispatch port failures roll back and cannot skip pickup or initialize an assigned task', async () => {
  for (const prepareTask of [async () => { throw new Error('dispatch failure'); }, async args => ({ task: {
    id: 'task', orderId: args.orderId, restaurantId: 'r1', status: 'ASSIGNED', pickupPinHash: args.pickupPinHash, deliveryPinHash: args.deliveryPinHash } })]) {
    const f = await fixture({ service: { dispatchEngine: { prepareTask } } });
    await assert.rejects(f.create()); assert.equal(f.state.orders.length, 0); assert.equal(f.quote.status, 'ACTIVE');
  }
});

test('without an external outbox port the pipeline durably stores a pending notification in the same commit', async () => {
  const f = await fixture({ service: { outbox: undefined } }); const result = await f.create();
  const events = f.state.pipelines[0].settlement.orchestration.outbox;
  assert.equal(events.length, 1); assert.equal(events[0].orderId, result.orderId); assert.equal(events[0].status, 'PENDING');
  assert.equal(JSON.stringify(events).includes(result.pickupPin), false); assert.equal(f.state.events.length, 0);
});

test('missing adapters fail closed rather than loading a real database', async () => {
  const f = await fixture(); const service = createMarketplaceOrderOrchestrator();
  await assert.rejects(service.createOrder({ accountId: ACCOUNT, idempotencyKey: KEY, body: f.input() }), checkCode('ORDERS_UNAVAILABLE', 503));
});

test('replay rejects corrupted ownership, missing pipeline, PIN key and financial snapshot', async () => {
  for (const mutate of [f => { f.state.pipelines.length = 0; },
    f => { f.state.pipelines[0].settlement.orchestration.accountId = 'foreign'; },
    f => { f.state.pipelines[0].pickupPinHash = 'a'.repeat(64); },
    f => { f.state.pipelines[0].settlement.totalCents++; }]) {
    const f = await fixture(); await f.create(); mutate(f); await assert.rejects(f.create());
    assert.equal(f.state.orders.length, 1);
  }
});

test('HTTP POST returns 201 creation, 200 replay, no-store and no internal hashes/credentials', async () => {
  const f = await fixture(); const request = http(f); const first = await request(); const replay = await request();
  assert.equal(first.statusCode, 201); assert.equal(replay.statusCode, 200); assert.equal(first.body.orderId, replay.body.orderId);
  assert.equal(first.headers['cache-control'], 'no-store'); assert.equal(first.body.pickupPinHash, undefined);
  assert.equal(first.body.restaurantId, undefined); assert.equal(first.body.customer, undefined);
  assert.equal(first.body.pinKeyId, undefined); assert.equal(first.body.settlement, undefined);
});

test('HTTP maps quote and validation errors and hides internal database failures', async () => {
  const f = await fixture(); const request = http(f);
  assert.equal((await request({ body: f.input({ quoteId: 'missing' }) })).statusCode, 404);
  assert.equal((await request({ body: f.input({ total: 1 }) })).statusCode, 422);
  assert.equal((await request({ headers: {} })).body.errorCode, 'INVALID_IDEMPOTENCY_KEY');
  f.advance(TTL_MS);
  const expired = await request(); assert.equal(expired.statusCode, 409); assert.equal(expired.body.errorCode, 'QUOTE_EXPIRED');
  f.setTime(NOW); f.hooks.begin = () => { throw new Error('PRIVATE postgres secret'); };
  const failed = await request(); assert.equal(failed.statusCode, 503); assert.equal(failed.body.errorCode, 'ORDERS_UNAVAILABLE');
  assert.equal(JSON.stringify(failed.body).includes('PRIVATE'), false);
});

test('default HTTP account resolution rejects staff sessions and client account spoofing', async () => {
  const f = await fixture(); const request = http(f, { resolveAccount: undefined });
  const res = await request({ user: { id: ACCOUNT, role: 'OWNER', isActive: true }, body: f.input({ accountId: ACCOUNT }) });
  assert.equal(res.statusCode, 401); assert.equal(res.body.errorCode, 'UNAUTHENTICATED'); assert.equal(f.state.orders.length, 0);
});

test('authenticated HTTP without persistence ports returns a controlled 503', async () => {
  const f = await fixture(); const request = http(undefined);
  const res = await request({ body: f.input() }); assert.equal(res.statusCode, 503); assert.equal(res.body.errorCode, 'ORDERS_UNAVAILABLE');
});

test('schemas remain byte-identical with both new states and an unapplied additive SQL migration', () => {
  const root = path.resolve(__dirname, '../../..');
  const canonical = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'));
  const backend = fs.readFileSync(path.join(root, 'apps/backend/prisma/schema.prisma'));
  assert.equal(canonical.equals(backend), true);
  assert.equal(crypto.createHash('sha256').update(canonical).digest('hex'), crypto.createHash('sha256').update(backend).digest('hex'));
  const statuses = canonical.toString().match(/enum OrderStatus \{([^}]+)\}/)[1];
  assert.match(statuses, /\bPENDING_PAYMENT\b/); assert.match(statuses, /\bPENDING_MERCHANT\b/);
  const migration = fs.readFileSync(path.join(root, 'packages/database/prisma/migrations/20261023190000_marketplace_order_states/migration.sql'), 'utf8');
  assert.match(migration, /ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT'/); assert.match(migration, /ADD VALUE IF NOT EXISTS 'PENDING_MERCHANT'/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE/i);
});

test('v1 orders router mounts before legacy and tenant middleware without initializing index.js', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const mount = source.indexOf("app.use('/api/marketplace/v1/orders', require('./routes/marketplace-orders-v1.routes')())");
  assert.ok(mount > 0); assert.ok(mount < source.indexOf("app.use('/api/marketplace',"));
});
