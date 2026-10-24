'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createMarketplaceWebhooksV1Service, MarketplaceWebhookError, verifySignature, decide } = require('../src/lib/marketplace-webhooks-v1');
const createRouter = require('../src/routes/marketplace-webhooks-v1.routes');

// Offline by construction: any network call from this suite is a failure.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const SECRET = 'marketplace-webhook-test-secret-0123456789';
const clone = value => structuredClone(value);
const DUP = () => Object.assign(new Error('unique violation'), { code: 'DUPLICATE' });

// Manifest signed exactly as Mercado Pago documents it: id, request-id and ts.
function sign({ dataId = '555', requestId = 'req-1', ts = '1700000000', secret = SECRET } = {}) {
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  return { headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId }, query: { 'data.id': dataId } };
}
const note = (patch = {}) => ({ action: 'payment.updated', type: 'payment', data: { id: '555' }, ...patch });
// One delivery: headers, query and body. The secret is passed to handle() separately, as the route does.
function delivery({ requestId = 'req-1', dataId = '555', secret = SECRET, body = note() } = {}) {
  return { ...sign({ dataId, requestId, secret }), body };
}

// Ports share one state. unitOfWork rolls the state back on throw, like a real transaction.
function world() {
  const state = { events: new Map(), orders: new Map(), outbox: new Map(), payments: new Map(), gatewayDown: false };
  state.orders.set('o1', { orderId: 'o1', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING', collectorId: '123',
    currency: 'MXN', totalCents: 10002, platformFeeCents: 700, paidPaymentId: null });
  state.payments.set('555', { id: '555', status: 'approved', orderId: 'o1', collectorId: '123', currency: 'MXN',
    amountCents: 10002, marketplaceFeeCents: 700 });
  const calls = { gateway: 0 };
  const duplicateEvent = (provider, eventId) => [...state.events.values()].some(e => e.provider === provider && e.eventId === eventId);
  const webhookStore = {
    async findEvent(provider, eventId) {
      return clone([...state.events.values()].find(e => e.provider === provider && e.eventId === eventId) ?? null);
    },
    async insertEvent(_tx, row) {
      if (duplicateEvent(row.provider, row.eventId)) throw DUP();
      state.events.set(row.id, clone(row));
      return clone(row);
    },
    async updateEvent(_tx, id, patch) { state.events.set(id, { ...state.events.get(id), ...patch }); },
  };
  const paymentGateway = {
    async getPayment(id) {
      calls.gateway++;
      if (state.gatewayDown) throw new Error('provider timeout at 10.0.0.9');
      return clone(state.payments.get(id) ?? null);
    },
  };
  const orderStore = {
    async findOrder(orderId) { return clone(state.orders.get(orderId) ?? null); },
    async markPaidIfPending(_tx, { orderId, paymentId }) {
      const order = state.orders.get(orderId);
      if (!order || order.status !== 'PENDING_PAYMENT' || order.paymentStatus !== 'PENDING') return false;
      Object.assign(order, { status: 'PENDING_MERCHANT', paymentStatus: 'PAID', paidPaymentId: paymentId });
      return true;
    },
  };
  const outboxStore = {
    async append(_tx, event) {
      if (state.outbox.has(event.eventKey)) throw DUP();
      state.outbox.set(event.eventKey, clone(event));
    },
  };
  const unitOfWork = {
    async run(fn) {
      const snapshot = { events: clone([...state.events]), orders: clone([...state.orders]), outbox: clone([...state.outbox]) };
      try {
        return await fn({});
      } catch (error) {
        state.events = new Map(snapshot.events);
        state.orders = new Map(snapshot.orders);
        state.outbox = new Map(snapshot.outbox);
        throw error;
      }
    },
  };
  const service = createMarketplaceWebhooksV1Service({ webhookStore, paymentGateway, orderStore, outboxStore, unitOfWork,
    now: () => new Date('2026-10-23T12:00:00Z') });
  return { state, calls, service, webhookStore, orderStore, outboxStore, paymentGateway };
}

const deliver = (w, options = {}) => w.service.handle({ ...delivery(options), secret: options.secret ?? SECRET });
function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof MarketplaceWebhookError && error.code === code
    && (statusCode === undefined || error.statusCode === statusCode));
}

test('an approved payment moves the payment and order to PAID and writes one PaymentConfirmed event', async () => {
  const w = world();
  assert.deepEqual(await deliver(w), { status: 'PROCESSED' });
  const order = w.state.orders.get('o1');
  assert.equal(order.status, 'PENDING_MERCHANT');
  assert.equal(order.paymentStatus, 'PAID');
  assert.equal(order.paidPaymentId, '555');
  const events = [...w.state.outbox.values()];
  assert.equal(events.length, 1);
  assert.equal(events[0].eventType, 'PaymentConfirmed');
  assert.deepEqual(events[0].payload, { orderId: 'o1', paymentId: '555' });
  assert.equal([...w.state.events.values()][0].outcome, 'PAID');
});

test('the amount and collector come from the provider, not from the notification body', async () => {
  const w = world();
  // The body carries no amounts. A forged amount in extra fields changes nothing.
  const result = await w.service.handle({ ...delivery({ body: note({ transaction_amount: 1 }) }), secret: SECRET });
  assert.equal(result.status, 'PROCESSED');
  assert.equal(w.calls.gateway, 1);
});

test('a signature made with another secret is rejected before anything is read or stored', async () => {
  const w = world();
  // Signed by an attacker with their own secret, then checked against the server's secret.
  const forged = delivery({ secret: 'a-different-secret-entirely-000' });
  await rejects(w.service.handle({ ...forged, secret: SECRET }), 'INVALID_SIGNATURE', 401);
  assert.equal(w.calls.gateway, 0);
  assert.equal(w.state.events.size, 0);
});

test('a missing or short secret fails closed with 503, never a default', async () => {
  const w = world();
  for (const secret of [undefined, null, '', 'short']) {
    await rejects(w.service.handle({ ...delivery(), secret }), 'WEBHOOK_SECRET_UNAVAILABLE', 503);
  }
  assert.equal(w.calls.gateway, 0);
});

test('the signature binds the request id, the data id and the body id', async () => {
  const w = world();
  const signed = delivery({ requestId: 'req-1' });
  await rejects(w.service.handle({ ...signed, headers: { ...signed.headers, 'x-request-id': 'req-2' }, secret: SECRET }),
    'INVALID_SIGNATURE', 401);
  await rejects(w.service.handle({ ...signed, query: { 'data.id': '777' }, secret: SECRET }), 'INVALID_SIGNATURE', 401);
  await rejects(w.service.handle({ ...signed, body: note({ data: { id: '999' } }), secret: SECRET }), 'INVALID_SIGNATURE', 401);
  assert.equal(w.calls.gateway, 0);
});

test('malformed or missing signature parts are 401', async () => {
  const w = world();
  const base = delivery();
  const cases = [
    { headers: {} },
    { headers: { ...base.headers, 'x-signature': 'ts=abc,v1=' + 'a'.repeat(64) } },
    { headers: { ...base.headers, 'x-signature': 'ts=1700000000,v1=short' } },
    { headers: { ...base.headers, 'x-signature': 'v1=' + 'a'.repeat(64) } },
    { query: {} },
    { query: { 'data.id': 'bad id!' } },
  ];
  for (const patch of cases) {
    await rejects(w.service.handle({ ...base, ...patch, secret: SECRET }), 'INVALID_SIGNATURE', 401);
  }
  assert.equal(w.calls.gateway, 0);
});

test('verifySignature uses the documented manifest and lowercases alphanumeric ids', () => {
  const signed = sign({ dataId: 'ABC123', requestId: 'req-x' });
  assert.deepEqual(verifySignature({ ...signed, secret: SECRET }), { dataId: 'ABC123', requestId: 'req-x' });
});

test('a repeated delivery is a DUPLICATE and never reaches the provider again', async () => {
  const w = world();
  assert.equal((await deliver(w)).status, 'PROCESSED');
  assert.deepEqual(await deliver(w), { status: 'DUPLICATE' });
  assert.equal(w.calls.gateway, 1);
  assert.equal(w.state.outbox.size, 1);
});

test('a new delivery of an already paid payment is ALREADY_PAID and writes no second event', async () => {
  const w = world();
  await deliver(w, { requestId: 'req-1' });
  assert.deepEqual(await deliver(w, { requestId: 'req-2' }), { status: 'ALREADY_PAID' });
  assert.equal(w.state.outbox.size, 1);
  assert.equal(w.state.orders.get('o1').paidPaymentId, '555');
});

test('a race where two deliveries pass the lookup is settled by the unique event insert', async () => {
  const w = world();
  // Another transaction recorded this event first. The lookup misses, as if it had not committed yet.
  w.state.events.set('pre', { id: 'pre', provider: 'MERCADOPAGO', eventId: '555:req-1', outcome: 'PAID' });
  w.webhookStore.findEvent = async () => null;
  assert.deepEqual(await deliver(w, { requestId: 'req-1' }), { status: 'DUPLICATE' });
  assert.equal(w.state.outbox.size, 0);
  assert.equal(w.state.orders.get('o1').status, 'PENDING_PAYMENT');
});

test('a pending, rejected or cancelled payment never changes the order', async () => {
  for (const status of ['pending', 'rejected', 'cancelled', 'refunded']) {
    const w = world();
    w.state.payments.get('555').status = status;
    assert.deepEqual(await deliver(w), { status: 'NOT_APPROVED' }, status);
    assert.equal(w.state.orders.get('o1').paymentStatus, 'PENDING');
    assert.equal(w.state.outbox.size, 0);
  }
});

test('a payment for an unknown order is UNMATCHED and audited, answered as success', async () => {
  const w = world();
  w.state.payments.get('555').orderId = 'ghost';
  assert.deepEqual(await deliver(w), { status: 'UNMATCHED' });
  assert.equal(w.state.orders.get('o1').status, 'PENDING_PAYMENT');
  assert.equal([...w.state.events.values()][0].outcome, 'UNMATCHED');
});

test('a payment the provider does not know is recorded and answered without retry loops', async () => {
  const w = world();
  assert.deepEqual(await deliver(w, { dataId: '404', body: note({ data: { id: '404' } }) }), { status: 'PAYMENT_NOT_FOUND' });
  assert.equal(w.state.outbox.size, 0);
});

test('amount, collector, currency and fee must all match the order or nothing changes', async () => {
  const mismatches = [
    ['amountCents', 10001], ['collectorId', '999'], ['currency', 'USD'], ['marketplaceFeeCents', 701],
  ];
  for (const [field, value] of mismatches) {
    const w = world();
    w.state.payments.get('555')[field] = value;
    assert.deepEqual(await deliver(w), { status: 'MISMATCH' }, field);
    assert.equal(w.state.orders.get('o1').paymentStatus, 'PENDING', field);
    assert.equal(w.state.outbox.size, 0, field);
  }
});

test('a second, different approved payment for a paid order is a PAYMENT_CONFLICT that keeps the first', async () => {
  const w = world();
  Object.assign(w.state.orders.get('o1'), { status: 'PENDING_MERCHANT', paymentStatus: 'PAID', paidPaymentId: '111' });
  w.state.payments.set('556', { id: '556', status: 'approved', orderId: 'o1', collectorId: '123', currency: 'MXN',
    amountCents: 10002, marketplaceFeeCents: 700 });
  assert.deepEqual(await deliver(w, { dataId: '556', body: note({ data: { id: '556' } }) }), { status: 'PAYMENT_CONFLICT' });
  assert.equal(w.state.orders.get('o1').paidPaymentId, '111');
  assert.equal(w.state.outbox.size, 0);
});

test('decide() is a pure function of the provider payment and the stored order', () => {
  const order = { orderId: 'o1', collectorId: '123', currency: 'MXN', totalCents: 10002, platformFeeCents: 700, paidPaymentId: null };
  const payment = { id: '555', status: 'approved', orderId: 'o1', collectorId: '123', currency: 'MXN', amountCents: 10002, marketplaceFeeCents: 700 };
  assert.equal(decide(payment, order), 'PAID');
  assert.equal(decide(null, order), 'PAYMENT_NOT_FOUND');
  assert.equal(decide(payment, null), 'UNMATCHED');
});

test('non-payment topics are ignored after the signature is checked', async () => {
  const w = world();
  assert.deepEqual(await deliver(w, { body: note({ type: 'merchant_order' }) }), { status: 'IGNORED' });
  assert.equal(w.calls.gateway, 0);
  assert.equal(w.state.events.size, 0);
});

test('invalid notification bodies are 400 and never reach the provider', async () => {
  const w = world();
  for (const body of [null, [], 'payment']) {
    await rejects(w.service.handle({ ...delivery(), body, secret: SECRET }), 'INVALID_NOTIFICATION', 400);
  }
  assert.equal(w.calls.gateway, 0);
});

test('a failure while writing the outbox rolls back the event, the payment and the order together', async () => {
  const w = world();
  w.outboxStore.append = async () => { throw new Error('outbox table locked'); };
  await assert.rejects(deliver(w), error => error.message === 'outbox table locked');
  assert.equal(w.state.orders.get('o1').status, 'PENDING_PAYMENT');
  assert.equal(w.state.orders.get('o1').paymentStatus, 'PENDING');
  assert.equal(w.state.events.size, 0, 'no audit row survives a rolled-back delivery');
  assert.equal(w.state.outbox.size, 0);
});

test('a provider outage stores nothing and is retried by the provider', async () => {
  const w = world();
  w.state.gatewayDown = true;
  await assert.rejects(deliver(w), error => error.message.includes('provider timeout'));
  assert.equal(w.state.events.size, 0);
  assert.equal(w.state.orders.get('o1').status, 'PENDING_PAYMENT');
});

test('without ports the service fails closed with 503', async () => {
  const none = createMarketplaceWebhooksV1Service({});
  await rejects(none.handle({ ...delivery(), secret: SECRET }), 'WEBHOOKS_UNAVAILABLE', 503);
});

function routes(options = {}) {
  const handlers = new Map();
  createRouter({ Router: () => ({ post: (p, fn) => handlers.set(`POST ${p}`, fn) }), ...options });
  return handlers.get('POST /mercadopago');
}
async function call(handler, req) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  await handler({ headers: req.headers || {}, query: req.query || {}, body: req.body }, res);
  return res;
}

test('route: a valid delivery returns 200 with no-store', async () => {
  const w = world();
  const handler = routes({ service: w.service, webhookSecret: () => SECRET });
  const res = await call(handler, delivery());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { status: 'PROCESSED' });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('route: a bad signature is 401 and a missing secret is 503, both with no-store', async () => {
  const w = world();
  const bad = await call(routes({ service: w.service, webhookSecret: () => SECRET }), { ...delivery({ secret: 'wrong-secret-value-000000' }) });
  assert.equal(bad.statusCode, 401);
  assert.equal(bad.body.errorCode, 'INVALID_SIGNATURE');
  assert.equal(bad.headers['Cache-Control'], 'no-store');
  const unset = await call(routes({ service: w.service, webhookSecret: () => null }), delivery());
  assert.equal(unset.statusCode, 503);
  assert.equal(unset.body.errorCode, 'WEBHOOK_SECRET_UNAVAILABLE');
});

test('route: a provider outage is 503 without leaking the internal error', async () => {
  const w = world();
  w.state.gatewayDown = true;
  const res = await call(routes({ service: w.service, webhookSecret: () => SECRET }), delivery());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.errorCode, 'WEBHOOK_UNAVAILABLE');
  assert.equal(JSON.stringify(res.body).includes('10.0.0.9'), false);
});

test('route: the default secret comes only from the environment and is never a built-in value', async () => {
  const keys = ['MARKETPLACE_MP_WEBHOOK_SECRET', 'MERCADOPAGO_WEBHOOK_SECRET'];
  const saved = keys.map(key => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    const w = world();
    const res = await call(routes({ service: w.service }), delivery({ secret: 'test_webhook_secret' }));
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.errorCode, 'WEBHOOK_SECRET_UNAVAILABLE');
    assert.equal(w.calls.gateway, 0);
  } finally {
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
  }
});

test('the webhook router is mounted under /api/marketplace/v1/webhooks', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1\/webhooks',\s*require\('\.\/routes\/marketplace-webhooks-v1\.routes'\)\(\)\)/);
});
