'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplaceSettlementsPrisma, financialParts } = require('../src/lib/marketplace-settlements-prisma');
const { createMarketplacePaymentGateway } = require('../src/lib/marketplace-payment-gateway');
const { buildOrderCaptureTransaction } = require('../src/lib/marketplace-ledger');
const { createDriverPayoutsService } = require('../src/lib/marketplace-driver-payouts');
const createRouter = require('../src/routes/marketplace-settlements-v1.routes');

const clone = value => structuredClone(value);
const SUPER = { accountId: 'super', isActive: true, roles: ['SUPER_ADMIN'] };
const OWNER = { accountId: 'owner', isActive: true, roles: ['MERCHANT_OWNER'], tenantId: 'tenant1', restaurantId: 'r1' };
const KEY = 'refund-0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-10-26T06:00:00Z');
const body = amountCents => ({ reason: 'Producto no disponible', ...(amountCents === undefined ? {} : { amountCents }) });

function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(item => matches(row, item));
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      if ('in' in value) return value.in.includes(row[key]);
      if ('lte' in value) return row[key] !== null && new Date(row[key]) <= value.lte;
      if ('is' in value) return matches(row[key], value.is);
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}
function fixture() {
  let date = NOW;
  let state = { refunds: [], outbox: [], lines: [], restaurant: { id: 'r1', tenantId: 'tenant1', isActive: true },
    pipeline: { orderId: 'o1', restaurantId: 'r1', currency: 'MXN', paymentMethod: 'ONLINE', collectorId: '55',
      dispatch: { task: { deliveryPolicy: 'MANUAL' } },
      settlement: { totalCents: 13000, subtotalCents: 10000, deliveryFeeCents: 3000, platformFeeCents: 1000,
        merchantPayoutCents: 9000, courierPayoutCents: 3000 },
      order: { id: 'o1', restaurantId: 'r1', source: 'MARKETPLACE', status: 'DELIVERED', paymentStatus: 'PAID',
        paymentProvider: 'MERCADOPAGO', paymentProviderId: '555' } },
    payment: { id: 'p1', restaurantId: 'r1', orderId: 'o1', amount: '130.00', currency: 'MXN', status: 'CAPTURED',
      provider: 'MERCADOPAGO', providerPaymentId: '555' } };
  const capture = buildOrderCaptureTransaction({ orderId: 'o1', amount: 130 });
  state.lines = capture.entries.map((entry, i) => ({ ...entry, restaurantId: 'r1', orderId: 'o1', paymentId: 'p1',
    transactionId: capture.id, transactionHash: capture.hash, idempotencyKey: 'capture', lineNumber: i + 1,
    eventType: 'ORDER_CAPTURED', beneficiaryId: null, currency: 'MXN', referenceId: null, createdAt: NOW }));
  const flags = { outboxFailure: false, providerDown: false, wrongProvider: false, collector: '55' };
  const provider = new Map(); const calls = [];
  const list = name => ({
    async findFirst({ where }) { return clone(state[name].find(row => matches(row, where)) || null); },
    async findUnique({ where }) { return this.findFirst({ where }); },
    async findMany({ where, take }) { return clone(state[name].filter(row => matches(row, where)).slice(0, take)); },
    async create({ data }) {
      if (name === 'outbox' && flags.outboxFailure) throw new Error('outbox unavailable');
      if (state[name].some(row => row.id === data.id || data.keyHash && row.keyHash === data.keyHash
        || data.activeOrderId && row.activeOrderId === data.activeOrderId || data.eventKey && row.eventKey === data.eventKey)) {
        throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      }
      const row = { leaseToken: null, leaseUntil: null, publishedAt: null, attempts: 0, status: 'PENDING', createdAt: date, ...clone(data) };
      state[name].push(row); return clone(row);
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of state[name]) if (matches(row, where)) {
        for (const [key, value] of Object.entries(data)) row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment : clone(value);
        count++;
      }
      return { count };
    },
  });
  const db = {
    $queryRaw: async () => [{ id: 'o1' }],
    restaurant: { findFirst: async ({ where }) => matches(state.restaurant, where) ? clone(state.restaurant) : null },
    marketplaceOrderPipeline: { findFirst: async ({ where }) => matches(state.pipeline, where) ? clone(state.pipeline) : null },
    order: { updateMany: async ({ where, data }) => { if (!matches(state.pipeline.order, where)) return { count: 0 };
      Object.assign(state.pipeline.order, clone(data)); return { count: 1 }; } },
    marketplacePayment: {
      findFirst: async ({ where }) => matches(state.payment, where) ? clone(state.payment) : null,
      updateMany: async ({ where, data }) => { if (!matches(state.payment, where)) return { count: 0 };
        Object.assign(state.payment, clone(data)); return { count: 1 }; },
    },
    marketplaceRefund: list('refunds'), marketplaceFinanceOutbox: list('outbox'),
    marketplaceLedgerEntry: { ...list('lines'),
      createMany: async ({ data }) => { state.lines.push(...clone(data)); return { count: data.length }; },
      groupBy: async ({ where, take }) => [...new Set(state.lines.filter(row => matches(row, where)).map(row => row.orderId))]
        .slice(0, take).map(orderId => ({ orderId, _max: { createdAt: date } })),
    },
  };
  let previous = Promise.resolve();
  const prisma = { ...db, $transaction: async work => {
    let release; const turn = new Promise(resolve => { release = resolve; }); const wait = previous; previous = turn;
    await wait; const old = clone(state);
    try { return await work(db); } catch (error) { state = old; throw error; } finally { release(); }
  } };
  const getGateway = async () => ({ collectorId: flags.collector, refundPayment: async args => {
    calls.push(clone(args)); if (flags.providerDown) throw new Error('provider down');
    if (!provider.has(args.idempotencyKey)) provider.set(args.idempotencyKey, { id: 'rf' + provider.size,
      status: 'approved', paymentId: args.paymentId, amountCents: args.amountCents });
    return { ...provider.get(args.idempotencyKey), ...(flags.wrongProvider ? { paymentId: 'wrong' } : {}) };
  } });
  const service = () => createMarketplaceSettlementsPrisma({ prisma, getGateway, now: () => date });
  return { get state() { return state; }, flags, calls, provider, prisma, getGateway, service,
    advance: ms => { date = new Date(date.getTime() + ms); } };
}
const rejects = (promise, code) => assert.rejects(promise, error => error.code === code);
const refund = (w, amount, key = KEY, actor = SUPER) => w.service().refundOrder(actor, 'o1', key, body(amount));

test('MANUAL asigna subtotal menos comisión más envío a la tienda y cero a la red', () => {
  assert.deepEqual(financialParts(fixture().state.pipeline), { merchant: 12000, platform: 1000, courier: 0 });
});
test('conciliación persiste obligación balanceada, idempotente, y no declara pago bancario', async () => {
  const w = fixture(); const first = await w.service().reconcileOrder(SUPER, 'o1');
  assert.equal(first.replayed, false); assert.equal((await w.service().reconcileOrder(SUPER, 'o1')).replayed, true);
  const lines = w.state.lines.filter(line => line.eventType === 'ORDER_SETTLED');
  assert.equal(lines.length, 3); assert.equal(lines.some(line => line.account === 'COURIER_PAYABLE'), false);
  assert.equal(lines.find(line => line.account === 'MERCHANT_PAYABLE').amount, '120.00');
  const { items } = await w.service().listMerchantSettlements(OWNER, { merchantId: 'r1' });
  assert.equal(items[0].netPayoutCents, 12000); assert.equal(items[0].status, 'ACCRUED'); assert.equal(items[0].paidAt, null);
  assert.equal(w.state.outbox.length, 1);
});
test('permisos: dueño lee su comercio; FINANCE necesita alcance; anónimo y dispositivo rechazados', async () => {
  const w = fixture();
  await rejects(w.service().listMerchantSettlements({ ...OWNER, restaurantId: 'r2' }, { merchantId: 'r1' }), 'MERCHANT_FORBIDDEN');
  await rejects(refund(w, 100, KEY, OWNER), 'REFUND_FORBIDDEN');
  await rejects(refund(w, 100, KEY, { accountId: 'f1', roles: ['FINANCE'], isActive: true, tenantId: 'other', restaurantId: 'r1' }), 'MERCHANT_FORBIDDEN');
  await rejects(refund(w, 100, KEY, { ...SUPER, isDevice: true }), 'UNAUTHENTICATED');
  assert.equal(w.calls.length, 0);
});
test('reembolso parcial y final sobreviven recreación del servicio y conservan el historial', async () => {
  const w = fixture(); const first = await refund(w, 5000); assert.equal(first.status, 'POSTED');
  assert.equal(first.remainingCents, 8000); assert.equal(w.state.pipeline.order.paymentStatus, 'PAID');
  const replay = await refund(w, 5000); assert.equal(replay.replayed, true); assert.equal(w.calls.length, 1);
  const final = await refund(w, undefined, KEY + 'b'); assert.equal(final.paymentStatus, 'REFUNDED');
  assert.equal(w.state.payment.status, 'REFUNDED'); assert.equal(w.state.pipeline.order.paymentStatus, 'REFUNDED');
  assert.equal(w.state.refunds.length, 2); assert.equal(w.state.outbox.length, 2);
});
test('clave repetida con otro importe se rechaza antes de tocar la pasarela', async () => {
  const w = fixture(); await refund(w, 100); await rejects(refund(w, 200), 'IDEMPOTENCY_CONFLICT'); assert.equal(w.calls.length, 1);
});
test('caída de pasarela deja reserva durable que bloquea una clave competidora', async () => {
  const w = fixture(); w.flags.providerDown = true; await assert.rejects(refund(w, 5000));
  assert.equal(w.state.refunds[0].status, 'PENDING'); assert.equal(w.state.refunds[0].activeOrderId, 'o1');
  await rejects(refund(w, 5000, KEY + 'other'), 'REFUND_IN_PROGRESS');
  w.flags.providerDown = false; assert.equal((await refund(w, 5000)).status, 'POSTED');
  assert.equal(w.calls[0].idempotencyKey, w.calls[1].idempotencyKey);
});
test('fallo contable después del proveedor revierte ledger/outbox y recupera el mismo reembolso', async () => {
  const w = fixture(); w.flags.outboxFailure = true; await assert.rejects(refund(w, 5000));
  assert.equal(w.state.lines.length, 2); assert.equal(w.state.refunds[0].status, 'PENDING');
  assert.equal(w.provider.size, 1); w.flags.outboxFailure = false;
  const recovery = await w.service().recoverRefunds(SUPER); assert.equal(recovery.items[0].status, 'POSTED');
  assert.equal(w.provider.size, 1); assert.equal(w.state.outbox.length, 1);
});
test('dos claves simultáneas no producen dos reembolsos externos contra el mismo saldo', async () => {
  const w = fixture(); const results = await Promise.allSettled([refund(w, 10000), refund(w, 10000, KEY + 'b')]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1); assert.equal(w.provider.size, 1);
});
test('misma clave simultánea finaliza una vez; proveedor recibe la misma clave estable', async () => {
  const w = fixture(); await Promise.all([refund(w, 5000), refund(w, 5000)]);
  assert.equal(w.state.refunds.length, 1); assert.equal(w.state.outbox.length, 1); assert.equal(w.provider.size, 1);
  assert.equal(w.state.lines.filter(row => row.eventType === 'ORDER_REFUNDED').length, 2);
});
test('recuperación global requiere SUPER_ADMIN', async () => {
  const w = fixture(); await rejects(w.service().recoverRefunds({ ...OWNER, roles: ['FINANCE'] }), 'REFUND_FORBIDDEN');
});
test('respuesta de otro pago y cambio de cobrador no se asientan', async () => {
  const w = fixture(); w.flags.wrongProvider = true; await rejects(refund(w, 100), 'PROVIDER_REFUND_PENDING');
  assert.equal(w.state.lines.length, 2); w.flags.wrongProvider = false; w.flags.collector = '66';
  await rejects(refund(w, 100), 'PAYMENT_CONFIGURATION_CHANGED'); assert.equal(w.state.lines.length, 2);
});
test('conciliación no corre antes de entrega ni con reserva de reembolso abierta', async () => {
  const w = fixture(); w.state.pipeline.order.status = 'READY'; await rejects(w.service().reconcileOrder(SUPER, 'o1'), 'ORDER_NOT_DELIVERED');
  w.state.pipeline.order.status = 'DELIVERED'; w.flags.providerDown = true; await assert.rejects(refund(w, 100));
  await rejects(w.service().reconcileOrder(SUPER, 'o1'), 'REFUND_IN_PROGRESS');
});
test('reembolso tras liquidación revierte cuentas y conserva cero payable de red para MANUAL', async () => {
  const w = fixture(); await w.service().reconcileOrder(SUPER, 'o1'); await refund(w);
  const entries = w.state.lines.filter(line => line.eventType === 'ORDER_REFUNDED');
  assert.equal(entries.some(line => line.account === 'COURIER_PAYABLE'), false);
  const { items } = await w.service().listMerchantSettlements(OWNER, { merchantId: 'r1' });
  assert.equal(items[0].netPayoutCents, 0); assert.equal(items[0].commissionCents, 0); assert.equal(items[0].grossSalesCents, 0);
});
test('reembolso antes de liquidación distribuye solo el saldo restante', async () => {
  const w = fixture(); await refund(w, 6500); await w.service().reconcileOrder(SUPER, 'o1');
  const { items } = await w.service().listMerchantSettlements(OWNER, { merchantId: 'r1' });
  assert.equal(items[0].netPayoutCents, 6000); assert.equal(items[0].commissionCents, 500);
});
test('no se reembolsa sin captura íntegra ni snapshot balanceado', async () => {
  const w = fixture(); w.state.lines.pop(); await rejects(refund(w, 100), 'LEDGER_INTEGRITY_ERROR');
  const bad = fixture(); bad.state.pipeline.settlement.totalCents++; await rejects(refund(bad, 100), 'ORDER_NOT_PAID');
  assert.equal(w.calls.length + bad.calls.length, 0);
});
test('outbox sobrevive error del consumidor; reintenta con misma eventKey y confirma una vez', async () => {
  const w = fixture(); await refund(w, 100); const events = [];
  const failure = await w.service().drainOutbox({ publish: async event => { events.push(event); throw new Error('consumer unavailable'); } });
  assert.equal(failure[0].published, false); assert.equal(w.state.outbox[0].status, 'PENDING');
  assert.deepEqual(await w.service().drainOutbox({ publish: async () => {} }), []);
  w.advance(2000); const done = await w.service().drainOutbox({ publish: async event => { events.push(event); } });
  assert.equal(done[0].published, true); assert.equal(events[0].eventKey, events[1].eventKey);
  assert.equal(w.state.outbox[0].attempts, 2);
});
test('dos consumidores no publican una misma reserva vigente; un lease vencido se recupera', async () => {
  const w = fixture(); await refund(w, 100); let calls = 0;
  await Promise.all([w.service().drainOutbox({ publish: async () => { calls++; } }), w.service().drainOutbox({ publish: async () => { calls++; } })]);
  assert.equal(calls, 1);
  Object.assign(w.state.outbox[0], { status: 'PENDING', leaseToken: 'crashed', leaseUntil: new Date(NOW.getTime() + 1000) });
  assert.deepEqual(await w.service().drainOutbox({ publish: async () => { calls++; } }), []);
  w.advance(1001); await w.service().drainOutbox({ publish: async () => { calls++; } }); assert.equal(calls, 2);
});
test('pasarela de reembolso usa clave estable, valida identidad/importe y respeta apagado por defecto', async () => {
  const requests = [];
  const prismaClient = { integrationConfig: { findFirst: async () => ({ restaurantId: 'r1', mode: 'sandbox',
    config: JSON.stringify({ accessToken: 'synthetic-test-only', collectorId: '55' }) }) } };
  const request = async (url, options) => { requests.push({ url, options }); return { ok: true,
    json: async () => ({ id: 'rf1', payment_id: '555', amount: 10, status: 'approved' }) }; };
  const off = await createMarketplacePaymentGateway({ restaurantId: 'r1', prismaClient, request, env: {} });
  await rejects(off.refundPayment({ paymentId: '555', amountCents: 1000, idempotencyKey: KEY }), 'PAYMENT_NETWORK_DISABLED');
  assert.equal(requests.length, 0);
  const on = await createMarketplacePaymentGateway({ restaurantId: 'r1', prismaClient, request, env: { MARKETPLACE_PAYMENT_NETWORK_ENABLED: 'true' } });
  const value = await on.refundPayment({ paymentId: '555', amountCents: 1000, idempotencyKey: KEY });
  assert.equal(value.status, 'approved'); assert.equal(requests[0].options.headers['X-Idempotency-Key'], KEY);
  assert.equal(JSON.parse(requests[0].options.body).amount, 10);
  await rejects(on.refundPayment({ paymentId: '555', amountCents: 500, idempotencyKey: KEY }), 'INVALID_REFUND_RESPONSE');
});

test('retiros no reservan un saldo que ya tiene reembolso pendiente de conciliación', async () => {
  const actor = { id: 'driver', role: 'DELIVERY', isActive: true, restaurantId: 'r1', tenantId: 'tenant1' };
  const db = { $queryRaw: async () => [{ id: 'r1' }],
    restaurant: { findFirst: async () => ({ id: 'r1', tenantId: 'tenant1', isActive: true }) },
    employee: { findFirst: async () => ({ id: 'driver' }) }, marketplaceLedgerEntry: {},
    marketplaceDriverPayout: { findFirst: async () => null }, marketplaceRefund: { count: async () => 1 } };
  await rejects(createDriverPayoutsService().requestDriverPayout({ actor, driverId: 'driver', amount: '1.00',
    idempotencyKey: 'request', prismaClient: { ...db, $transaction: async work => work(db) } }), 'REFUND_RECONCILIATION_REQUIRED');
});

function routes(options) {
  const handlers = new Map();
  createRouter({ ...options, Router: () => ({ get: (url, fn) => handlers.set('GET ' + url, fn),
    post: (url, fn) => handlers.set('POST ' + url, fn) }) });
  return async (method, url, request = {}) => {
    const response = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await handlers.get(method + ' ' + url)({ params: { id: 'o1' }, headers: {}, body: {}, ...request }, response);
    return response;
  };
}
test('rutas reales permanecen apagadas sin bandera y no cargan Prisma', async () => {
  const request = routes({ env: {}, resolveActor: async () => SUPER });
  const response = await request('POST', '/ops/orders/:id/settle');
  assert.equal(response.statusCode, 503); assert.equal(response.body.errorCode, 'SETTLEMENTS_UNAVAILABLE');
});
test('rutas habilitadas usan adaptadores, validan permisos y declaran si hay publicador', async () => {
  const w = fixture(); let actor = SUPER;
  const request = routes({ env: { MARKETPLACE_FINANCE_ENABLED: 'true' }, prisma: w.prisma, getGateway: w.getGateway,
    resolveActor: async () => actor });
  const response = await request('POST', '/ops/orders/:id/settle'); assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  actor = OWNER; assert.equal((await request('POST', '/ops/finance/recover')).statusCode, 403);
  actor = SUPER; const recovered = await request('POST', '/ops/finance/recover');
  assert.equal(recovered.statusCode, 200); assert.equal(recovered.body.publisherConfigured, false);
  assert.equal((await request('POST', '/ops/finance/recover', { body: { unexpected: true } })).statusCode, 400);
});

module.exports = { fixture };
