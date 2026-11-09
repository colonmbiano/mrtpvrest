'use strict';

// C2: pedidos del Mercadito sin aceptar. La tarea periódica y la cancelación compartida
// (createMarketplaceCancellation().cancelOrder) con dobles en memoria.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMarketplaceCancellation } = require('../src/lib/marketplace-cancel');
const { createMarketplacePendingJob, ttlMinutes } = require('../src/jobs/marketplacePending.job');

const NOW = new Date('2026-11-09T18:00:00Z');
const silent = { info() {}, error() {} };
const clone = value => structuredClone(value);

// ── cancelOrder ──────────────────────────────────────────────────────────────
function world(order) {
  const state = { order: clone(order), audits: [], emits: [], restored: [], notified: [], reservations: [], completed: [] };
  const tx = {
    order: {
      findFirst: async ({ where }) => (state.order.id === where.id && state.order.restaurantId === where.restaurantId
        && state.order.source === where.source ? clone(state.order) : null),
      updateMany: async ({ where, data }) => {
        if (state.order.id !== where.id || state.order.status !== where.status || state.order.restaurantId !== where.restaurantId) return { count: 0 };
        Object.assign(state.order, clone(data)); return { count: 1 };
      },
    },
    restaurant: { findFirst: async () => ({ tenantId: 't1' }) },
  };
  // Transacción con reversión: si el trabajo lanza, el estado vuelve atrás.
  const transaction = async (_prisma, work) => {
    const before = clone(state);
    try { return await work(tx); } catch (error) { Object.assign(state, before); throw error; }
  };
  const settlements = {
    reserveCancellationRefund: async (db, input) => {
      assert.equal(db, tx, 'la reserva va en la TX de la cancelación');
      if (state.reserveError) throw state.reserveError;
      const reservation = { id: 'rf1', orderId: input.orderId, amountCents: 13000, status: 'PENDING', input };
      state.reservations.push(reservation); return reservation;
    },
    completeRefund: async reservation => { state.completed.push(reservation.id); return { status: 'POSTED', amountCents: 13000, refundId: reservation.id }; },
    recoverRefunds: async () => ({ items: [] }),
  };
  const io = { to: room => ({ emit: (event, payload) => state.emits.push([room, event, payload.status]) }) };
  const audit = { AUDIT_EVENTS: { ORDER_CANCEL: 'ORDER_CANCEL' }, record: async (req, event, details) => state.audits.push({ req, event, details }) };
  const cancellation = createMarketplaceCancellation({ prisma: {}, settlements, deps: { transaction, audit,
    restoreInventory: async (_db, id) => { state.restored.push(id); },
    notifyOrderStatus: async (o, status) => { state.notified.push([o.id, status]); } } });
  return { state, cancellation, io };
}
const PAID = { id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', orderType: 'DELIVERY', orderNumber: 'M-7',
  status: 'PENDING_MERCHANT', paymentStatus: 'PAID', paymentProvider: 'MERCADOPAGO', paymentProviderId: '555', total: 130, notes: 'Sin cebolla' };
const CASH = { ...PAID, paymentStatus: 'PENDING', paymentProvider: null, paymentProviderId: null };
const ACTOR = { id: 'system-marketplace-pending', name: 'Mercadito: sin respuesta del comercio' };
const input = (w, extra = {}) => w.cancellation.cancelOrder({ orderId: 'o1', restaurantId: 'r1', fromStatuses: ['PENDING_MERCHANT'],
  reason: 'Sin respuesta del comercio en 15 minutos', actor: ACTOR, note: '⏱ Cancelado automáticamente', io: w.io, logger: silent, ...extra });

test('cancela un pedido pagado por aceptar, reserva en la TX y reembolsa después', async () => {
  const w = world(PAID);
  const done = await input(w);
  assert.equal(done.outcome, 'CANCELLED'); assert.equal(done.refund.status, 'POSTED');
  assert.equal(w.state.order.status, 'CANCELLED');
  assert.equal(w.state.order.notes, 'Sin cebolla — ⏱ Cancelado automáticamente');
  assert.equal(w.state.reservations[0].input.actorId, 'system-marketplace-pending');
  assert.deepEqual(w.state.completed, ['rf1']);
  assert.equal(w.state.audits[0].req.user.isDevice, true); assert.equal(w.state.audits[0].req.user.tenantId, 't1');
  assert.equal(w.state.audits[0].details.after.refundCents, 13000);
  assert.deepEqual(w.state.restored, ['o1']); assert.deepEqual(w.state.notified, [['o1', 'CANCELLED']]);
  assert(w.state.emits.some(([room, event]) => room === 'restaurant:r1:location:l1:admins' && event === 'order:updated'));
});

test('un pedido en efectivo se cancela sin reembolso', async () => {
  const w = world(CASH);
  const done = await input(w);
  assert.equal(done.outcome, 'CANCELLED'); assert.equal(done.refund, null); assert.equal(w.state.reservations.length, 0);
});

test('si ya se aceptó o no es del Mercadito, no se toca', async () => {
  for (const order of [{ ...PAID, status: 'CONFIRMED' }, { ...PAID, source: 'TPV' }, { ...PAID, restaurantId: 'r2' }]) {
    const w = world(order);
    const done = await input(w);
    assert.equal(done.outcome, 'SKIPPED'); assert.equal(w.state.reservations.length, 0);
    assert.equal(w.state.audits.length, 0); assert.equal(w.state.notified.length, 0);
  }
});

test('si la caja lo acepta en el mismo instante, gana la caja y la reserva se revierte', async () => {
  const w = world(PAID);
  const original = w.cancellation.reserveRefund;
  w.cancellation.reserveRefund = async (...args) => { const r = await original(...args); w.state.order.status = 'CONFIRMED'; return r; };
  const done = await input(w);
  assert.equal(done.outcome, 'SKIPPED'); assert.equal(done.reason, 'ORDER_CHANGED');
  // La TX de la cancelación se revierte entera: la reserva desaparece y no hay reembolso ni aviso.
  assert.equal(w.state.reservations.length, 0);
  assert.equal(w.state.completed.length, 0); assert.equal(w.state.notified.length, 0);
});

test('si otro camino ganó la reserva, se omite; otros errores se propagan', async () => {
  const w = world(PAID);
  w.state.reserveError = Object.assign(new Error('Unique'), { code: 'P2002' });
  assert.equal((await input(w)).reason, 'CANCELLATION_IN_PROGRESS');
  w.state.reserveError = Object.assign(new Error('Sin captura'), { code: 'LEDGER_INTEGRITY_ERROR' });
  await assert.rejects(input(w), error => error.code === 'LEDGER_INTEGRITY_ERROR');
  assert.equal(w.state.order.status, 'PENDING_MERCHANT');
});

test('sin motivo o sin estados de origen no se cancela nada', async () => {
  const w = world(PAID);
  await assert.rejects(input(w, { reason: 'no' }), error => error.code === 'REASON_REQUIRED');
  await assert.rejects(input(w, { fromStatuses: [] }));
  assert.equal(w.state.order.status, 'PENDING_MERCHANT');
});

// ── tarea periódica ──────────────────────────────────────────────────────────
function jobWorld({ env = {}, rows = [{ id: 'o1', restaurantId: 'r1' }, { id: 'o2', restaurantId: 'r2' }], outcomes = {} } = {}) {
  const calls = { findMany: [], cancel: [], recover: [] };
  const prisma = { order: { findMany: async args => { calls.findMany.push(args); return rows; } } };
  const cancellation = {
    cancelOrder: async args => {
      calls.cancel.push(args);
      const outcome = outcomes[args.orderId] || { outcome: 'CANCELLED', refund: { status: 'POSTED' } };
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    recoverRefunds: async (actor, options) => { calls.recover.push([actor, options]); return { items: [{ status: 'POSTED' }, { status: 'PENDING' }] }; },
  };
  const job = createMarketplacePendingJob({ prisma, cancellation, env, now: () => NOW, logger: silent });
  return { job, calls };
}

test('el TTL por defecto es 15 minutos; se puede cambiar o apagar por variable', () => {
  assert.equal(ttlMinutes({}), 15);
  assert.equal(ttlMinutes({ MARKETPLACE_PENDING_MERCHANT_TTL_MIN: '20' }), 20);
  assert.equal(ttlMinutes({ MARKETPLACE_PENDING_MERCHANT_TTL_MIN: '0' }), 0);
  assert.equal(ttlMinutes({ MARKETPLACE_PENDING_MERCHANT_TTL_MIN: 'abc' }), 15);
});

test('busca pedidos por aceptar con 15 minutos desde el pago o desde la creación si no hay pago', async () => {
  const { job, calls } = jobWorld();
  const result = await job.run();
  const where = calls.findMany[0].where;
  const cutoff = new Date(NOW.getTime() - 15 * 60000);
  assert.deepEqual(where, { source: 'MARKETPLACE', status: 'PENDING_MERCHANT',
    OR: [{ paidAt: { lt: cutoff } }, { paidAt: null, createdAt: { lt: cutoff } }] });
  assert.equal(calls.cancel.length, 2);
  assert.deepEqual(calls.cancel[0].fromStatuses, ['PENDING_MERCHANT']);
  assert.equal(calls.cancel[0].reason, 'Sin respuesta del comercio en 15 minutos');
  assert.equal(calls.cancel[0].actor.id, 'system-marketplace-pending');
  assert.equal(result.cancelled, 2); assert.equal(result.refunded, 2);
});

test('un pedido que falla no frena a los demás y los omitidos se cuentan', async () => {
  const { job, calls } = jobWorld({ rows: [{ id: 'o1', restaurantId: 'r1' }, { id: 'o2', restaurantId: 'r1' }, { id: 'o3', restaurantId: 'r1' }],
    outcomes: { o1: new Error('boom'), o2: { outcome: 'SKIPPED' } } });
  const result = await job.run();
  assert.equal(calls.cancel.length, 3);
  assert.deepEqual({ cancelled: result.cancelled, skipped: result.skipped, failed: result.failed }, { cancelled: 1, skipped: 1, failed: 1 });
});

test('reembolsos pendientes de Mercado Pago se cuentan aparte', async () => {
  const { job } = jobWorld({ rows: [{ id: 'o1', restaurantId: 'r1' }], outcomes: { o1: { outcome: 'CANCELLED', refund: { status: 'PENDING' } } } });
  const result = await job.run();
  assert.equal(result.refundsPending, 1); assert.equal(result.refunded, 0);
});

test('con TTL 0 no cancela nada, pero la recuperación de reembolsos sigue', async () => {
  const { job, calls } = jobWorld({ env: { MARKETPLACE_PENDING_MERCHANT_TTL_MIN: '0' } });
  const result = await job.run(null, { withRecovery: true });
  assert.equal(calls.findMany.length, 0); assert.equal(result.cancelled, 0);
  assert.deepEqual(result.recovery, { checked: 2, posted: 1 });
  assert.deepEqual(calls.recover[0], [{ accountId: 'system-marketplace-pending', roles: ['SUPER_ADMIN'], isActive: true }, { limit: 25 }]);
});

test('la recuperación solo corre cuando se pide y una corrida no se encima con otra', async () => {
  const { job, calls } = jobWorld();
  await job.run();
  assert.equal(calls.recover.length, 0);
  const [first, second] = await Promise.all([job.run(), job.run()]);
  assert.equal(second.busy, true); assert.equal(first.cancelled, 2);
});
