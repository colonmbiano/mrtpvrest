'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceCancelBlock, isOnlinePaidMarketplaceOrder, cancellationActorId,
  createMarketplaceCancellation } = require('../src/lib/marketplace-cancel');

const paid = status => ({ id: 'o1', source: 'MARKETPLACE', status, paymentStatus: 'PAID',
  paymentProvider: 'MERCADOPAGO', paymentProviderId: '555' });
const cash = status => ({ id: 'o1', source: 'MARKETPLACE', status, paymentStatus: 'PENDING', paymentProvider: null });

test('pagado en línea = Mercadito + PAID + Mercado Pago con id de pago', () => {
  assert.equal(isOnlinePaidMarketplaceOrder(paid('CONFIRMED')), true);
  assert.equal(isOnlinePaidMarketplaceOrder(cash('CONFIRMED')), false);
  assert.equal(isOnlinePaidMarketplaceOrder({ ...paid('CONFIRMED'), source: 'TPV' }), false);
  assert.equal(isOnlinePaidMarketplaceOrder({ ...paid('CONFIRMED'), paymentProviderId: null }), false);
  assert.equal(isOnlinePaidMarketplaceOrder({ ...paid('CONFIRMED'), paymentStatus: 'REFUNDED' }), false);
});

test('mesero, cocina y roles desconocidos no cancelan pedidos del Mercadito', () => {
  for (const role of ['WAITER', 'KITCHEN', 'DELIVERY', undefined]) {
    assert.equal(marketplaceCancelBlock(paid('PENDING_MERCHANT'), role)?.body.code, 'MARKETPLACE_CANCEL_FORBIDDEN');
    assert.equal(marketplaceCancelBlock(cash('CONFIRMED'), role)?.body.code, 'MARKETPLACE_CANCEL_FORBIDDEN');
  }
});

test('la caja rechaza un pedido por aceptar, pagado o no', () => {
  assert.equal(marketplaceCancelBlock(paid('PENDING_MERCHANT'), 'CASHIER'), null);
  assert.equal(marketplaceCancelBlock(cash('PENDING_MERCHANT'), 'CASHIER'), null);
});

test('aceptado y pagado en línea: solo gerencia', () => {
  for (const status of ['CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY']) {
    const blocked = marketplaceCancelBlock(paid(status), 'CASHIER');
    assert.equal(blocked.status, 403); assert.equal(blocked.body.code, 'MARKETPLACE_CANCEL_REQUIRES_MANAGER');
    for (const role of ['MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN']) assert.equal(marketplaceCancelBlock(paid(status), role), null);
  }
  // Aceptado en efectivo: la caja puede cancelarlo (no hay dinero que devolver por la pasarela).
  assert.equal(marketplaceCancelBlock(cash('CONFIRMED'), 'CASHIER'), null);
});

test('los pedidos que no son del Mercadito no cambian', () => {
  assert.equal(marketplaceCancelBlock({ id: 'o1', source: 'TPV', status: 'CONFIRMED' }, 'WAITER'), null);
  assert.equal(marketplaceCancelBlock({ id: 'o1', status: 'CONFIRMED' }, 'KITCHEN'), null);
});

test('el actor del reembolso usa solo caracteres válidos', () => {
  assert.equal(cancellationActorId({ id: 'ck1a2b3' }), 'staff-ck1a2b3');
  assert.equal(cancellationActorId({ id: 'dev:pos/1' }), 'staff-devpos1');
  assert.equal(cancellationActorId({}), 'staff-unknown');
});

test('reserva y finalización delegan en finanzas; la finalización nunca lanza', async () => {
  const calls = [];
  const settlements = {
    reserveCancellationRefund: async (tx, input) => { calls.push(['reserve', tx, input]); return { id: 'rf1', orderId: 'o1', amountCents: 13000 }; },
    completeRefund: async () => { throw Object.assign(new Error('down'), { code: 'PROVIDER_REFUND_PENDING' }); },
  };
  const cancel = createMarketplaceCancellation({ settlements });
  const reservation = await cancel.reserveRefund('tx', { order: paid('PENDING_MERCHANT'), restaurantId: 'r1',
    user: { id: 'u1' }, reason: 'Rechazado por el comercio' });
  assert.deepEqual(calls[0], ['reserve', 'tx', { orderId: 'o1', restaurantId: 'r1', actorId: 'staff-u1', reason: 'Rechazado por el comercio' }]);
  const silent = { error: () => {} };
  assert.deepEqual(await cancel.completeRefund(reservation, silent),
    { status: 'PENDING', amountCents: 13000, refundId: 'rf1', errorCode: 'PROVIDER_REFUND_PENDING' });
  assert.equal(await cancel.completeRefund(null), null);
  settlements.completeRefund = async () => ({ status: 'POSTED', amountCents: 13000, refundId: 'rf1' });
  assert.deepEqual(await cancel.completeRefund(reservation), { status: 'POSTED', amountCents: 13000, refundId: 'rf1' });
});

test('si otro camino ganó la reserva al mismo tiempo, responde 409 en lugar de un error de base', async () => {
  const settlements = { reserveCancellationRefund: async () => { throw Object.assign(new Error('Unique'), { code: 'P2002' }); } };
  const cancel = createMarketplaceCancellation({ settlements });
  await assert.rejects(cancel.reserveRefund('tx', { order: paid('PENDING_MERCHANT'), restaurantId: 'r1', user: { id: 'u1' }, reason: 'Motivo largo' }),
    error => error.status === 409 && error.code === 'CANCELLATION_IN_PROGRESS');
  settlements.reserveCancellationRefund = async () => { throw Object.assign(new Error('x'), { code: 'REFUND_IN_PROGRESS', statusCode: 409 }); };
  await assert.rejects(cancel.reserveRefund('tx', { order: paid('PENDING_MERCHANT'), restaurantId: 'r1', user: { id: 'u1' }, reason: 'Motivo largo' }),
    error => error.code === 'REFUND_IN_PROGRESS');
});
