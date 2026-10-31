'use strict';

// Pago en línea de la orden v1 del marketplace con Mercado Pago: link de pago y
// webhook. Sin BD, sin red y sin credenciales: Prisma es un fake en memoria, la
// pasarela es falsa y los avisos se firman con un secreto de prueba.
//   node --test apps/backend/scripts/marketplace-v1-payments.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createMarketplaceV1Payments, checkoutLink } = require('../src/lib/marketplace-v1-payments');
const { MarketplaceGatewayError } = require('../src/lib/marketplace-payment-gateway');

const NOW = new Date('2026-10-24T18:00:00.000Z');
const SECRET = 'test-webhook-secret-0123456789';
const HOOK = 'https://api.example.test/api/marketplace/v1/webhooks/mercadopago';
const SETTLEMENT = { subtotalCents: 17100, deliveryFeeCents: 0, totalCents: 17100, tipCents: 0, commissionBps: 1500,
  commissionCents: 2565, platformFeeCents: 2565, merchantPayoutCents: 14535, courierPayoutCents: 0 };
const silent = { warn() {} };

function fakeDb() {
  const db = {
    pipeline: { orderId: 'o1', restaurantId: 'r1', paymentMethod: 'ONLINE', collectorId: null, checkoutUrl: null,
      currency: 'MXN', settlement: SETTLEMENT },
    order: { id: 'o1', restaurantId: 'r1', source: 'MARKETPLACE', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING',
      paymentProviderId: null },
    payments: [], events: [], ledger: [],
  };
  const matches = (row, where) => Object.entries(where).every(([k, v]) => {
    if (v && typeof v === 'object' && 'is' in v) return true;
    if (v && typeof v === 'object' && 'not' in v) return row[k] !== v.not;
    return row[k] === v;
  });
  const pipelineView = () => ({ ...db.pipeline, order: { status: db.order.status, paymentStatus: db.order.paymentStatus,
    paymentProviderId: db.order.paymentProviderId } });
  const prisma = {
    db,
    async $transaction(work) {
      const snapshot = JSON.stringify({ pipeline: db.pipeline, order: db.order, payments: db.payments, events: db.events, ledger: db.ledger });
      try { return await work(prisma); } catch (error) {
        Object.assign(db, JSON.parse(snapshot));
        throw error;
      }
    },
    marketplaceOrderPipeline: {
      async findFirst({ where }) { return matches(db.pipeline, where) && db.order.source === 'MARKETPLACE' ? pipelineView() : null; },
      async updateMany({ where, data }) {
        if (!matches(db.pipeline, where)) return { count: 0 };
        Object.assign(db.pipeline, data); return { count: 1 };
      },
    },
    order: {
      async updateMany({ where, data }) {
        if (!matches(db.order, { ...where, id: where.id })) return { count: 0 };
        Object.assign(db.order, data); return { count: 1 };
      },
    },
    marketplacePayment: {
      async findFirst({ where }) { return db.payments.find(p => matches(p, where)) ?? null; },
      async create({ data }) { const row = { id: `pay_${db.payments.length + 1}`, providerPaymentId: null, ...data }; db.payments.push(row); return row; },
      async updateMany({ where, data }) {
        const row = db.payments.find(p => matches(p, where));
        if (!row) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    },
    marketplaceLedgerEntry: {
      async findMany({ where }) { return db.ledger.filter(l => l.paymentId === where.paymentId && l.idempotencyKey === where.idempotencyKey); },
      async createMany({ data }) { db.ledger.push(...data); return { count: data.length }; },
    },
    marketplaceWebhookEvent: {
      async findUnique({ where }) {
        const { provider, eventId } = where.provider_eventId;
        return db.events.find(e => e.provider === provider && e.eventId === eventId) ?? null;
      },
      async create({ data }) {
        if (db.events.some(e => e.provider === data.provider && e.eventId === data.eventId)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        db.events.push({ ...data }); return data;
      },
      async update({ where, data }) { Object.assign(db.events.find(e => e.id === where.id), data); },
    },
  };
  return prisma;
}

function fakeGateway({ collectorId = '777', payment = null, configured = true, createFails = false } = {}) {
  const calls = { preferences: [], payments: [] };
  const getGateway = async ({ restaurantId }) => {
    if (!configured) throw new MarketplaceGatewayError('PAYMENT_NOT_CONFIGURED');
    return {
      collectorId,
      async createPreference(args) {
        calls.preferences.push({ restaurantId, ...args });
        if (createFails) throw new MarketplaceGatewayError();
        return { id: 'pref-1', initPoint: 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1' };
      },
      async getPayment(id) { calls.payments.push({ restaurantId, id }); return payment; },
    };
  };
  return { getGateway, calls };
}

function signed(dataId, requestId = 'req-1', ts = '1729790000') {
  const v1 = crypto.createHmac('sha256', SECRET).update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`).digest('hex');
  return { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId };
}
const approved = (extra = {}) => ({ id: '9001', status: 'approved', orderId: 'o1', collectorId: '777', amountCents: 17100,
  currency: 'MXN', marketplaceFeeCents: 2565, ...extra });

test('solo links https de Mercado Pago sirven como página de pago', () => {
  assert.equal(checkoutLink('https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1'), 'https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=1');
  for (const bad of ['http://www.mercadopago.com.mx/x', 'https://mercadopago.com.mx.evil.test/x', 'nope']) assert.equal(checkoutLink(bad), null);
});

test('se sabe si el comercio tiene Mercado Pago conectado antes de crear la orden', async () => {
  const yes = createMarketplaceV1Payments({ prisma: fakeDb(), notificationUrl: HOOK, getGateway: fakeGateway().getGateway });
  assert.equal(await yes.acceptsOnline('r1'), true);
  const no = createMarketplaceV1Payments({ prisma: fakeDb(), notificationUrl: HOOK, getGateway: fakeGateway({ configured: false }).getGateway });
  assert.equal(await no.acceptsOnline('r1'), false);
});

test('el link fija cobrador y registro de pago, cobra la comisión y avisa al webhook del comercio', async () => {
  const prisma = fakeDb();
  const gw = fakeGateway();
  const payments = createMarketplaceV1Payments({ prisma, notificationUrl: HOOK, getGateway: gw.getGateway, now: () => NOW });
  const checkout = await payments.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' });
  assert.deepEqual(checkout, { status: 'READY', url: 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-1' });
  assert.equal(prisma.db.pipeline.collectorId, '777');
  assert.equal(prisma.db.order.paymentProviderRef, 'pref-1');
  assert.deepEqual(prisma.db.payments.map(p => [p.idempotencyKey, p.status, p.amount, p.currency]),
    [['marketplace-v1:o1:checkout', 'PENDING', '171.00', 'MXN']]);
  const pref = gw.calls.preferences[0];
  assert.equal(pref.marketplaceFee, 25.65);
  assert.equal(pref.idempotencyKey, 'marketplace-v1:o1:checkout');
  assert.equal(pref.notificationUrl, `${HOOK}?merchant=r1`);
  assert.deepEqual(pref.items.map(i => [i.id, i.unit_price, i.quantity]), [['products', 171, 1]]);
  // Repetir no crea otra preferencia ni otro registro.
  assert.deepEqual(await payments.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' }), checkout);
  assert.equal(gw.calls.preferences.length, 1);
  assert.equal(prisma.db.payments.length, 1);
});

test('si la preferencia falla la orden queda esperando el link y se completa al reintentar', async () => {
  const prisma = fakeDb();
  const failing = createMarketplaceV1Payments({ prisma, notificationUrl: HOOK, logger: silent,
    getGateway: fakeGateway({ createFails: true }).getGateway });
  assert.deepEqual(await failing.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' }), { status: 'PENDING', url: null });
  assert.equal(prisma.db.pipeline.checkoutUrl, null);
  const retry = createMarketplaceV1Payments({ prisma, notificationUrl: HOOK, getGateway: fakeGateway().getGateway });
  assert.equal((await retry.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' })).status, 'READY');
  assert.equal(prisma.db.payments.length, 1);
  // Si el comercio cambió de cuenta de Mercado Pago, no se cobra a otro cobrador.
  const other = fakeDb(); other.db.pipeline.collectorId = '555';
  const changed = createMarketplaceV1Payments({ prisma: other, notificationUrl: HOOK, logger: silent, getGateway: fakeGateway().getGateway });
  assert.deepEqual(await changed.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' }), { status: 'PENDING', url: null });
});

async function paidSetup(payment = approved()) {
  const prisma = fakeDb();
  const gw = fakeGateway({ payment });
  const payments = createMarketplaceV1Payments({ prisma, notificationUrl: HOOK, getGateway: gw.getGateway, now: () => NOW });
  await payments.ensureCheckout({ orderId: 'o1', restaurantId: 'r1' });
  return { prisma, gw, payments };
}
const notify = (payments, { dataId = '9001', requestId = 'req-1', merchant = 'r1', body } = {}) => payments.webhooks.handle({
  headers: signed(dataId, requestId), query: { 'data.id': dataId, type: 'payment', ...(merchant ? { merchant } : {}) },
  body: body ?? { type: 'payment', action: 'payment.updated', data: { id: dataId } }, secret: SECRET });

test('un pago aprobado que coincide pasa la orden a por aceptar y queda en el libro', async () => {
  const { prisma, gw, payments } = await paidSetup();
  assert.deepEqual(await notify(payments), { status: 'PROCESSED' });
  assert.deepEqual(gw.calls.payments, [{ restaurantId: 'r1', id: '9001' }]);
  assert.equal(prisma.db.order.status, 'PENDING_MERCHANT');
  assert.equal(prisma.db.order.paymentStatus, 'PAID');
  assert.equal(prisma.db.order.paymentProviderId, '9001');
  assert.equal(prisma.db.payments[0].status, 'CAPTURED');
  assert.equal(prisma.db.payments[0].providerPaymentId, '9001');
  assert.deepEqual(prisma.db.ledger.map(l => [l.account, l.type, l.amount]),
    [['CUSTOMER_RECEIVABLE', 'DEBIT', '171.00'], ['GATEWAY_ESCROW', 'CREDIT', '171.00']]);
  assert.equal(prisma.db.events[0].outcome, 'PAID');
  // La misma entrega repetida no hace nada; otra entrega del mismo pago ya lo encuentra pagado.
  assert.deepEqual(await notify(payments), { status: 'DUPLICATE' });
  assert.deepEqual(await notify(payments, { requestId: 'req-2' }), { status: 'ALREADY_PAID' });
  assert.equal(prisma.db.ledger.length, 2);
});

test('un pago que no coincide no toca la orden', async () => {
  for (const [label, payment, outcome] of [
    ['monto', approved({ amountCents: 100 }), 'MISMATCH'],
    ['comisión', approved({ marketplaceFeeCents: 0 }), 'MISMATCH'],
    ['cobrador', approved({ collectorId: '999' }), 'MISMATCH'],
    ['orden', approved({ orderId: 'otra' }), 'UNMATCHED'],
    ['pendiente', approved({ status: 'pending' }), 'NOT_APPROVED'],
  ]) {
    const { prisma, payments } = await paidSetup(payment);
    assert.deepEqual(await notify(payments), { status: outcome }, label);
    assert.equal(prisma.db.order.status, 'PENDING_PAYMENT', label);
    assert.equal(prisma.db.payments[0].status, 'PENDING', label);
    assert.equal(prisma.db.ledger.length, 0, label);
    assert.equal(prisma.db.events[0].outcome, outcome, label);
  }
});

test('sin firma válida o sin comercio en la URL, nada cambia', async () => {
  const { prisma, gw, payments } = await paidSetup();
  await assert.rejects(payments.webhooks.handle({ headers: { 'x-signature': 'ts=1,v1=' + '0'.repeat(64), 'x-request-id': 'r' },
    query: { 'data.id': '9001', merchant: 'r1' }, body: { type: 'payment', data: { id: '9001' } }, secret: SECRET }),
  e => e.code === 'INVALID_SIGNATURE');
  assert.deepEqual(await notify(payments, { merchant: null }), { status: 'PAYMENT_NOT_FOUND' });
  assert.equal(gw.calls.payments.length, 0);
  assert.equal(prisma.db.order.status, 'PENDING_PAYMENT');
});
