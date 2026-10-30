'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSettlementsV1Service, SettlementsV1Error, allocate } = require('../src/lib/marketplace-settlements-v1');
const createRouter = require('../src/routes/marketplace-settlements-v1.routes');

// Offline by construction: any network call from this suite is a failure.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const KEY = 'refund-key-0123456789abcdef0123456789';
const REASON = 'Cliente reporto cobro duplicado';
const DUP = () => Object.assign(new Error('unique violation'), { code: 'DUPLICATE' });
const clone = value => structuredClone(value);
const SUPER = { accountId: 'sa-1', roles: ['SUPER_ADMIN'] };
const FINANCE = { accountId: 'fin-1', roles: ['FINANCE'] };
const OWNER = { accountId: 'owner-1', roles: ['MERCHANT_OWNER'], merchantIds: ['m1'] };
const STAFF = { accountId: 'staff-1', roles: ['STAFF'], merchantIds: ['m1'] };

// Settled or not, the parts always sum to the total: 6302 + 700 + 3000 = 10002.
function order(patch = {}) {
  return { orderId: 'o1', paymentStatus: 'PAID', totalCents: 10002, merchantPayoutCents: 6302, platformFeeCents: 700,
    courierPayoutCents: 3000, settled: false, refundedCents: 0, refundedParts: { merchant: 0, platform: 0, courier: 0 },
    paymentProviderId: '555', currency: 'MXN', ...patch };
}

function world() {
  const state = { orders: new Map([['o1', order()]]), refunds: new Map(), ledger: new Map(), outbox: new Map(),
    settlements: [
      { id: 's1', merchantId: 'm1', periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-07T00:00:00Z'),
        grossSalesCents: 50000, commissionCents: 5000, netPayoutCents: 45000, status: 'PAID', externalTransferId: 'tr-1',
        paidAt: new Date('2026-10-08T10:00:00Z') },
      { id: 's2', merchantId: 'm1', periodStart: new Date('2026-10-08T00:00:00Z'), periodEnd: new Date('2026-10-14T00:00:00Z'),
        grossSalesCents: 30000, commissionCents: 3000, netPayoutCents: 27000, status: 'PENDING', externalTransferId: null, paidAt: null },
      { id: 's3', merchantId: 'm2', periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-07T00:00:00Z'),
        grossSalesCents: 1, commissionCents: 0, netPayoutCents: 1, status: 'PAID', externalTransferId: 'tr-x', paidAt: null },
    ],
    providerDown: false, providerStatus: 'approved', forceCasFail: false };
  const calls = { provider: 0 };
  const providerMemo = new Map();
  const settlementStore = {
    async listByMerchant(merchantId, { limit }) {
      return clone(state.settlements.filter(row => row.merchantId === merchantId).slice(0, limit));
    },
  };
  const orderStore = {
    async findOrder(orderId) { return clone(state.orders.get(orderId) ?? null); },
    async applyRefund(_tx, { orderId, expectedRefundedCents, refundedCents, refundedParts, paymentStatus }) {
      if (state.forceCasFail) return false;
      const current = state.orders.get(orderId);
      if (!current || current.refundedCents !== expectedRefundedCents) return false;
      Object.assign(current, { refundedCents, refundedParts: clone(refundedParts), paymentStatus });
      return true;
    },
  };
  const ledgerStore = {
    async post(_tx, { idempotencyKey, transaction }) {
      if (state.ledger.has(idempotencyKey)) throw DUP();
      state.ledger.set(idempotencyKey, clone(transaction));
    },
  };
  const refundStore = {
    async findByKey(keyHash) { return clone([...state.refunds.values()].find(row => row.keyHash === keyHash) ?? null); },
    async insert(_tx, row) {
      if ([...state.refunds.values()].some(other => other.keyHash === row.keyHash)) throw DUP();
      state.refunds.set(row.id, clone(row));
    },
  };
  const outboxStore = {
    async append(_tx, event) {
      if (state.outbox.has(event.eventKey)) throw DUP();
      state.outbox.set(event.eventKey, clone(event));
    },
  };
  const paymentGateway = {
    async refundPayment({ paymentId, amountCents, idempotencyKey }) {
      calls.provider++;
      if (state.providerDown) throw new Error(`provider timeout for ${paymentId}`);
      // The provider returns the same refund for the same idempotency key, as the real API does.
      if (!providerMemo.has(idempotencyKey)) {
        providerMemo.set(idempotencyKey, { id: `pr-${providerMemo.size + 1}`, status: state.providerStatus, amountCents });
      }
      return clone(providerMemo.get(idempotencyKey));
    },
  };
  const merchantAccess = {
    async canManage(actor, merchantId) {
      return actor.roles.includes('ADMIN') || (actor.roles.includes('MERCHANT_OWNER') && (actor.merchantIds || []).includes(merchantId));
    },
  };
  // Rolls every store back when the callback throws, like a real transaction.
  const unitOfWork = {
    async run(fn) {
      const snapshot = { orders: clone([...state.orders]), refunds: clone([...state.refunds]),
        ledger: clone([...state.ledger]), outbox: clone([...state.outbox]) };
      try {
        return await fn({});
      } catch (error) {
        state.orders = new Map(snapshot.orders);
        state.refunds = new Map(snapshot.refunds);
        state.ledger = new Map(snapshot.ledger);
        state.outbox = new Map(snapshot.outbox);
        throw error;
      }
    },
  };
  const service = createSettlementsV1Service({ settlementStore, ledgerStore, orderStore, outboxStore, refundStore, paymentGateway,
    merchantAccess, unitOfWork, now: () => new Date('2026-10-23T12:00:00Z') });
  return { state, calls, service, orderStore, ledgerStore, refundStore, outboxStore, paymentGateway, settlementStore };
}

// An explicit actor: null means anonymous. Only a missing actor falls back to SUPER.
const refund = (w, options = {}) => w.service.refundOrder('actor' in options ? options.actor : SUPER, options.orderId ?? 'o1',
  options.key ?? KEY, options.body ?? { reason: REASON });
function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof SettlementsV1Error && error.code === code
    && (statusCode === undefined || error.statusCode === statusCode));
}
const pesos = entry => Math.round(entry.amount * 100);
const entriesOf = tx => tx.entries.map(entry => ({ account: entry.account, type: entry.type, cents: pesos(entry) }));

test('a merchant lists its own settlements in the public shape, and other merchants are never included', async () => {
  const w = world();
  const { items } = await w.service.listMerchantSettlements(OWNER, { merchantId: 'm1' });
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { settlementId: 's1', merchantId: 'm1', periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-10-07T00:00:00.000Z', grossSalesCents: 50000, commissionCents: 5000, netPayoutCents: 45000,
    status: 'PAID', externalTransferId: 'tr-1', paidAt: '2026-10-08T10:00:00.000Z' });
  assert.equal(items[1].paidAt, null);
  assert.equal(items.some(item => item.merchantId === 'm2'), false);
});

test('settlements are 403 for a merchant the actor does not manage, and for staff', async () => {
  const w = world();
  await rejects(w.service.listMerchantSettlements(OWNER, { merchantId: 'm2' }), 'MERCHANT_FORBIDDEN', 403);
  await rejects(w.service.listMerchantSettlements(STAFF, { merchantId: 'm1' }), 'MERCHANT_FORBIDDEN', 403);
});

test('settlement queries validate their parameters', async () => {
  const w = world();
  const bad = [{}, { merchantId: 'm1', sort: 'asc' }, { merchantId: 'm1', limit: '0' }, { merchantId: 'm1', limit: '101' },
    { merchantId: ['m1', 'm2'] }, { merchantId: 'm1', limit: 'abc' }];
  for (const query of bad) {
    await rejects(w.service.listMerchantSettlements(OWNER, query), 'INVALID_QUERY', 400);
  }
  await rejects(w.service.listMerchantSettlements(null, { merchantId: 'm1' }), 'UNAUTHENTICATED', 401);
});

test('refunds are restricted to SUPER_ADMIN and FINANCE', async () => {
  const w = world();
  await rejects(refund(w, { actor: OWNER }), 'REFUND_FORBIDDEN', 403);
  await rejects(refund(w, { actor: STAFF }), 'REFUND_FORBIDDEN', 403);
  await rejects(refund(w, { actor: null }), 'UNAUTHENTICATED', 401);
  assert.equal(w.state.refunds.size, 0);
  assert.equal(w.calls.provider, 0);
});

test('refund input is strict: idempotency key, reason, amount and no extra fields', async () => {
  const w = world();
  await rejects(refund(w, { key: 'short' }), 'INVALID_IDEMPOTENCY_KEY', 400);
  await rejects(refund(w, { body: { reason: REASON, total: 1 } }), 'INVALID_REFUND', 422);
  await rejects(refund(w, { body: { reason: 'no' } }), 'INVALID_REFUND', 422);
  await rejects(refund(w, { body: { reason: ' padded reason ' } }), 'INVALID_REFUND', 422);
  for (const amountCents of [0, -1, 1.5, '100', 100000001]) {
    await rejects(refund(w, { body: { reason: REASON, amountCents } }), 'INVALID_REFUND', 422);
  }
  assert.equal(w.calls.provider, 0);
});

test('only a paid order with a provider payment can be refunded', async () => {
  const missing = world();
  await rejects(refund(missing, { orderId: 'ghost' }), 'ORDER_NOT_FOUND', 404);
  const unpaid = world();
  unpaid.state.orders.set('o1', order({ paymentStatus: 'PENDING' }));
  await rejects(refund(unpaid), 'ORDER_NOT_PAID', 409);
  const cash = world();
  cash.state.orders.set('o1', order({ paymentProviderId: null }));
  await rejects(refund(cash), 'NO_PROVIDER_PAYMENT', 409);
  assert.equal(unpaid.calls.provider + cash.calls.provider, 0);
});

test('a full refund of an unsettled order reverses escrow against the customer receivable, balanced', async () => {
  const w = world();
  const result = await refund(w);
  assert.equal(result.amountCents, 10002);
  assert.equal(result.refundedCents, 10002);
  assert.equal(result.remainingCents, 0);
  assert.equal(result.paymentStatus, 'REFUNDED');
  assert.equal(result.replayed, false);
  assert.equal(w.calls.provider, 1);
  const [tx] = [...w.state.ledger.values()];
  assert.equal(tx.eventType, 'ORDER_REFUNDED');
  assert.deepEqual(entriesOf(tx), [
    { account: 'GATEWAY_ESCROW', type: 'DEBIT', cents: 10002 },
    { account: 'CUSTOMER_RECEIVABLE', type: 'CREDIT', cents: 10002 },
  ]);
  assert.deepEqual(w.state.orders.get('o1').refundedParts, { merchant: 6302, platform: 700, courier: 3000 });
  assert.equal(w.state.outbox.size, 1);
});

test('a partial refund leaves a remainder, which can be refunded once, and then no more is possible', async () => {
  const w = world();
  const first = await refund(w, { body: { reason: REASON, amountCents: 3000 }, key: `${KEY}-a` });
  assert.equal(first.refundedCents, 3000);
  assert.equal(first.paymentStatus, 'PARTIALLY_REFUNDED');
  assert.equal(first.remainingCents, 7002);
  const rest = await refund(w, { key: `${KEY}-b` });
  assert.equal(rest.amountCents, 7002);
  assert.equal(rest.paymentStatus, 'REFUNDED');
  const parts = w.state.orders.get('o1').refundedParts;
  assert.equal(parts.merchant + parts.platform + parts.courier, 10002, 'the parts add up to exactly what was paid');
  await rejects(refund(w, { key: `${KEY}-c` }), 'ORDER_ALREADY_REFUNDED', 409);
});

test('an amount above the remaining refundable balance is rejected with 409', async () => {
  const w = world();
  await rejects(refund(w, { body: { reason: REASON, amountCents: 10003 } }), 'REFUND_EXCEEDS_PAYMENT', 409);
  await refund(w, { body: { reason: REASON, amountCents: 10000 }, key: `${KEY}-a` });
  await rejects(refund(w, { body: { reason: REASON, amountCents: 3 }, key: `${KEY}-b` }), 'REFUND_EXCEEDS_PAYMENT', 409);
  assert.equal(w.calls.provider, 1);
});

test('a settled order reverses the payables in proportion, with exact cents and a balanced entry', async () => {
  const w = world();
  w.state.orders.set('o1', order({ settled: true }));
  await refund(w, { body: { reason: REASON, amountCents: 1000 } });
  const [tx] = [...w.state.ledger.values()];
  assert.deepEqual(entriesOf(tx), [
    { account: 'MERCHANT_PAYABLE', type: 'DEBIT', cents: 630 },
    { account: 'COURIER_PAYABLE', type: 'DEBIT', cents: 300 },
    { account: 'PLATFORM_FEES', type: 'DEBIT', cents: 70 },
    { account: 'CUSTOMER_RECEIVABLE', type: 'CREDIT', cents: 1000 },
  ]);
  assert.equal(tx.entries.some(entry => entry.account === 'GATEWAY_ESCROW'), false);
});

test('allocate() splits any amount exactly, never above a holder balance, for every amount', () => {
  const holders = [
    { merchant: 6302, platform: 700, courier: 3000 },
    { merchant: 1, platform: 1, courier: 1 },
    { merchant: 0, platform: 5, courier: 0 },
    { merchant: 333, platform: 333, courier: 334 },
  ];
  for (const remaining of holders) {
    const total = remaining.merchant + remaining.platform + remaining.courier;
    for (let amount = 1; amount <= total; amount++) {
      const base = allocate(amount, remaining);
      assert.equal(base.merchant + base.platform + base.courier, amount, `sum for ${amount}`);
      for (const part of ['merchant', 'platform', 'courier']) {
        assert.ok(base[part] >= 0 && base[part] <= remaining[part], `${part} bound for ${amount}`);
      }
    }
  }
  assert.throws(() => allocate(7, { merchant: 3, platform: 3, courier: 0 }), error => error.code === 'REFUND_EXCEEDS_PAYMENT');
});

test('the same key and the same request replay the stored refund without a second provider call or ledger write', async () => {
  const w = world();
  const first = await refund(w, { body: { reason: REASON, amountCents: 2000 } });
  const again = await refund(w, { body: { reason: REASON, amountCents: 2000 } });
  assert.equal(again.replayed, true);
  assert.equal(again.refundId, first.refundId);
  assert.equal(w.calls.provider, 1);
  assert.equal(w.state.ledger.size, 1);
  assert.equal(w.state.orders.get('o1').refundedCents, 2000);
});

test('the same key with a different request is an IDEMPOTENCY_CONFLICT', async () => {
  const w = world();
  await refund(w, { body: { reason: REASON, amountCents: 2000 } });
  await rejects(refund(w, { body: { reason: REASON, amountCents: 2500 } }), 'IDEMPOTENCY_CONFLICT', 409);
  assert.equal(w.state.ledger.size, 1);
});

test('keys are scoped per actor, so two actors cannot replay each other', async () => {
  const w = world();
  const a = await refund(w, { actor: SUPER, body: { reason: REASON, amountCents: 1000 } });
  const b = await refund(w, { actor: FINANCE, body: { reason: REASON, amountCents: 1000 } });
  assert.notEqual(a.refundId, b.refundId);
  assert.equal(w.state.orders.get('o1').refundedCents, 2000);
});

test('a concurrent change to the order is a 409 and nothing is written', async () => {
  const w = world();
  w.state.forceCasFail = true;
  await rejects(refund(w), 'ORDER_CONFLICT', 409);
  assert.equal(w.state.ledger.size, 0);
  assert.equal(w.state.refunds.size, 0);
  assert.equal(w.state.orders.get('o1').refundedCents, 0);
});

test('a failure while posting the ledger rolls back the order, the refund and the outbox', async () => {
  const w = world();
  w.ledgerStore.post = async () => { throw new Error('ledger lock timeout'); };
  await assert.rejects(refund(w), error => error.message === 'ledger lock timeout');
  assert.equal(w.state.orders.get('o1').refundedCents, 0);
  assert.equal(w.state.orders.get('o1').paymentStatus, 'PAID');
  assert.equal(w.state.refunds.size, 0);
  assert.equal(w.state.outbox.size, 0);
});

test('a failure while writing the outbox rolls back the ledger entry too', async () => {
  const w = world();
  w.outboxStore.append = async () => { throw new Error('outbox table locked'); };
  await assert.rejects(refund(w), error => error.message === 'outbox table locked');
  assert.equal(w.state.ledger.size, 0);
  assert.equal(w.state.orders.get('o1').refundedCents, 0);
});

test('a provider outage or a pending provider refund records nothing', async () => {
  const down = world();
  down.state.providerDown = true;
  await assert.rejects(refund(down), error => error.message.includes('provider timeout'));
  assert.equal(down.state.ledger.size, 0);
  const pending = world();
  pending.state.providerStatus = 'in_process';
  await rejects(refund(pending), 'PROVIDER_REFUND_PENDING', 503);
  assert.equal(pending.state.ledger.size, 0);
});

test('a concurrent duplicate insert resolves to the winner when the request matches', async () => {
  const w = world();
  const winner = await refund(w, { body: { reason: REASON, amountCents: 2000 } });
  const real = w.refundStore.findByKey;
  let calls = 0;
  // The first lookup misses, as if the winner had not committed yet. The insert then hits the unique key.
  w.refundStore.findByKey = async keyHash => (calls++ === 0 ? null : real(keyHash));
  const loser = await refund(w, { body: { reason: REASON, amountCents: 2000 } });
  assert.equal(loser.refundId, winner.refundId);
  assert.equal(loser.replayed, true);
  assert.equal(w.state.ledger.size, 1);
});

test('the refund outbox event carries the order, refund and amount', async () => {
  const w = world();
  const result = await refund(w, { body: { reason: REASON, amountCents: 2500 } });
  const event = w.state.outbox.get(`OrderRefunded:${result.refundId}`);
  assert.equal(event.eventType, 'OrderRefunded');
  assert.deepEqual(event.payload, { orderId: 'o1', refundId: result.refundId, amountCents: 2500, paymentStatus: 'PARTIALLY_REFUNDED' });
});

test('without ports both operations fail closed with 503', async () => {
  const none = createSettlementsV1Service({});
  await rejects(none.listMerchantSettlements(OWNER, { merchantId: 'm1' }), 'SETTLEMENTS_UNAVAILABLE', 503);
  await rejects(none.refundOrder(SUPER, 'o1', KEY, { reason: REASON }), 'SETTLEMENTS_UNAVAILABLE', 503);
});

function routes(options = {}) {
  const handlers = new Map();
  createRouter({
    Router: () => ({
      get: (p, fn) => handlers.set(`GET ${p}`, fn),
      post: (p, fn) => handlers.set(`POST ${p}`, fn),
    }),
    ...options,
  });
  return handlers;
}
async function call(handler, { params = {}, query = {}, body, headers = {} } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  await handler({ params, query, body, headers }, res);
  return res;
}

test('route: a settlement list is 200 for the owner, 403 for another merchant, with no-store', async () => {
  const w = world();
  const owner = routes({ service: w.service, resolveActor: () => OWNER }).get('GET /merchant/settlements');
  const ok = await call(owner, { query: { merchantId: 'm1' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.items.length, 2);
  assert.equal(ok.headers['Cache-Control'], 'no-store');
  const denied = await call(owner, { query: { merchantId: 'm2' } });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.headers['Cache-Control'], 'no-store');
});

test('route: a new refund is 201, an idempotent replay is 200, and anonymous is 401', async () => {
  const w = world();
  const post = routes({ service: w.service, resolveActor: () => SUPER }).get('POST /ops/orders/:id/refund');
  const created = await call(post, { params: { id: 'o1' }, headers: { 'idempotency-key': KEY }, body: { reason: REASON, amountCents: 500 } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.status, 'POSTED');
  assert.equal(created.headers['Cache-Control'], 'no-store');
  const replay = await call(post, { params: { id: 'o1' }, headers: { 'idempotency-key': KEY }, body: { reason: REASON, amountCents: 500 } });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.replayed, true);
  const anonymous = await call(routes({ service: w.service }).get('POST /ops/orders/:id/refund'),
    { params: { id: 'o1' }, headers: { 'idempotency-key': KEY }, body: { reason: REASON } });
  assert.equal(anonymous.statusCode, 401);
});

test('route: an owner refunding is 403, and an unexpected failure is 503 without leaking details', async () => {
  const w = world();
  const asOwner = await call(routes({ service: w.service, resolveActor: () => OWNER }).get('POST /ops/orders/:id/refund'),
    { params: { id: 'o1' }, headers: { 'idempotency-key': KEY }, body: { reason: REASON } });
  assert.equal(asOwner.statusCode, 403);
  assert.equal(asOwner.body.errorCode, 'REFUND_FORBIDDEN');
  w.paymentGateway.refundPayment = async () => { throw new Error('connection to db-internal failed'); };
  const broken = await call(routes({ service: w.service, resolveActor: () => SUPER }).get('POST /ops/orders/:id/refund'),
    { params: { id: 'o1' }, headers: { 'idempotency-key': KEY }, body: { reason: REASON } });
  assert.equal(broken.statusCode, 503);
  assert.equal(broken.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(broken.body).includes('db-internal'), false);
});

test('the settlements router is mounted under /api/marketplace/v1', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1',\s*require\('\.\/routes\/marketplace-settlements-v1\.routes'\)\(\)\)/);
});
