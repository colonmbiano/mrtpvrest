'use strict';

// C8: corte diario del repartidor independiente en PostgreSQL desechable, de punta a punta:
// la red entrega un pedido en efectivo y uno en línea (y uno se cancela), el pedido en línea se
// liquida en el libro, el job emite el corte del día y el comercio lo paga. La billetera y el libro
// deben cuadrar. Requiere --disposable.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createNetworkPersistence } = require('../src/lib/marketplace-network-prisma');
const { createCourierPayouts } = require('../src/lib/marketplace-courier-payouts');
const { createMarketplaceSettlementsPrisma } = require('../src/lib/marketplace-settlements-prisma');
const { buildOrderCaptureTransaction, recordLedgerTransaction } = require('../src/lib/marketplace-ledger');
const { hashPin } = require('../src/lib/marketplace-dispatch');
const { database } = require('./helpers/marketplace-postgres.cjs');

async function run() {
  const { base, prisma } = database();
  const tag = 'c8_' + randomUUID().slice(0, 8);
  let at = new Date('2026-11-09T20:00:00Z'); // 9/nov 14:00 CDMX
  const now = () => new Date(at);
  const network = () => createNetworkPersistence({ prisma, now });
  let checks = 0; const pass = text => { checks++; console.log('PASS ' + text); };
  const courierId = tag + '_courier';
  try {
    const tenant = await base.tenant.create({ data: { name: tag, slug: tag, ownerEmail: tag + '@example.test' } });
    const restaurant = await base.restaurant.create({ data: { tenantId: tenant.id, name: tag, slug: tag } });
    const location = await base.location.create({ data: { restaurantId: restaurant.id, name: 'Colorines', slug: tag, latitude: 19.17, longitude: -100.07 } });
    const merchantId = tag + '_nm';
    await base.marketplaceNetworkMerchant.create({ data: { id: merchantId, restaurantId: restaurant.id, locationId: location.id,
      payload: { id: merchantId, restaurantId: restaurant.id, locationId: location.id, deliveryPolicy: 'SHARED_ONLY', fallbackSeconds: 30, maxDistanceKm: 10 } } });
    await base.marketplaceNetworkCourier.create({ data: { id: courierId, accountId: courierId + '_acc', status: 'ACTIVE', verificationStatus: 'VERIFIED',
      version: 0, payload: { id: courierId, accountId: courierId + '_acc', name: 'Luis', status: 'ACTIVE', verificationStatus: 'VERIFIED', version: 0, isShared: true, isActive: true } } });

    async function order(key, method, { subtotal, fee }) {
      const id = `${tag}_${key}`; const taskId = id + '_task';
      const task = { id: taskId, orderId: id, restaurantId: restaurant.id, locationId: location.id, merchantId, deliveryPolicy: 'SHARED_ONLY',
        fallbackSeconds: 30, maxDistanceKm: 10, status: 'WAITING_READY', dispatchMode: 'SHARED', version: 0,
        pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321'), payoutAmount: fee / 100, currency: 'MXN' };
      await base.order.create({ data: { id, restaurantId: restaurant.id, locationId: location.id, orderNumber: id, source: 'MARKETPLACE',
        orderType: 'DELIVERY', status: 'READY', paymentMethod: 'CASH', paymentStatus: method === 'ONLINE' ? 'PAID' : 'PENDING',
        ...(method === 'ONLINE' ? { paymentProvider: 'MERCADOPAGO', paymentProviderId: String(Date.now()) + key } : {}),
        subtotal: subtotal / 100, deliveryFee: fee / 100, total: (subtotal + fee) / 100,
        marketplacePipeline: { create: { storeSlug: tag, requestHash: 'a'.repeat(64), trackingTokenHash: 'b'.repeat(64),
          trackingExpiresAt: new Date('2026-12-01'), pinKeyId: 'v1', pickupPinHash: task.pickupPinHash, deliveryPinHash: task.deliveryPinHash,
          paymentMethod: method, collectorId: method === 'ONLINE' ? '55' : null, currency: 'MXN',
          settlement: { subtotalCents: subtotal, deliveryFeeCents: fee, totalCents: subtotal + fee, platformFeeCents: 0, commissionCents: 0,
            merchantPayoutCents: subtotal, courierPayoutCents: fee, tipCents: 0 },
          dispatch: { task, offer: null } } } } });
      if (method === 'ONLINE') {
        const created = await base.order.findUnique({ where: { id } });
        const payment = await base.marketplacePayment.create({ data: { restaurantId: restaurant.id, orderId: id, provider: 'MERCADOPAGO',
          providerPaymentId: created.paymentProviderId, status: 'CAPTURED', amount: ((subtotal + fee) / 100).toFixed(2), currency: 'MXN', idempotencyKey: id + '_capture' } });
        await recordLedgerTransaction({ transaction: buildOrderCaptureTransaction({ orderId: id, amount: (subtotal + fee) / 100 }),
          paymentId: payment.id, restaurantId: restaurant.id, idempotencyKey: id + '_capture', prismaClient: prisma });
      }
      return { id, taskId };
    }
    async function deliver({ taskId }) {
      const offer = await network().run(async r => { await network().tick(r); return r.engine.offersForCourier(courierId).find(o => o.taskId === taskId); });
      assert(offer, 'oferta para ' + taskId);
      await network().run(r => r.engine.acceptOffer({ offerId: offer.id, courierId }), { offerIds: [offer.id] });
      await network().run(r => r.engine.confirmPickup({ taskId, courierId, pickupPin: '123456' }));
      at = new Date(at.getTime() + 20 * 60000);
      await network().run(r => r.engine.confirmDelivery({ taskId, courierId, deliveryPin: '654321' }), { taskIds: [taskId] });
    }

    await network().updatePresence(courierId, { isOnline: true, lat: 19.171, lng: -100.071, acceptingShared: true });
    const cash = await order('cash', 'CASH', { subtotal: 12000, fee: 3500 });
    const online = await order('online', 'ONLINE', { subtotal: 16000, fee: 4000 });
    await deliver(cash);
    await network().updatePresence(courierId, { isOnline: true, lat: 19.171, lng: -100.071, acceptingShared: true });
    await deliver(online);
    // Un tercero lo acepta pero la tienda lo cancela: no cuenta.
    await network().updatePresence(courierId, { isOnline: true, lat: 19.171, lng: -100.071, acceptingShared: true });
    const cancelled = await order('cancelled', 'CASH', { subtotal: 9000, fee: 3000 });
    const offer = await network().run(async r => { await network().tick(r); return r.engine.offersForCourier(courierId).find(o => o.taskId === cancelled.taskId); });
    await network().run(r => r.engine.acceptOffer({ offerId: offer.id, courierId }), { offerIds: [offer.id] });
    await base.order.update({ where: { id: cancelled.id }, data: { status: 'CANCELLED' } });
    await network().run(async r => { await network().tick(r); });
    assert.equal((await base.marketplaceNetworkTask.findUnique({ where: { id: cancelled.taskId } })).status, 'CANCELLED');
    pass('la red entrega un pedido en efectivo y uno en línea; el tercero se cancela');

    // El pedido en línea se liquida en el libro: COURIER_PAYABLE 40.00 para el repartidor.
    const finance = createMarketplaceSettlementsPrisma({ prisma, now, getGateway: async () => ({}) });
    await finance.reconcileOrder({ accountId: 'finance', roles: ['SUPER_ADMIN'], isActive: true }, online.id);
    const payable = await base.marketplaceLedgerEntry.findMany({ where: { orderId: online.id, account: 'COURIER_PAYABLE' } });
    assert.deepEqual(payable.map(e => [e.type, String(e.amount), e.beneficiaryId]), [['CREDIT', '40', courierId]]);

    // Al día siguiente, el job emite el corte del 9.
    at = new Date('2026-11-10T09:17:00Z');
    const payouts = () => createCourierPayouts({ prisma, now });
    const [first, second] = await Promise.all([payouts().issueDay({}), payouts().issueDay({})]);
    assert.equal(first.created + second.created, 1, 'dos instancias emiten una sola vez');
    const row = await base.marketplaceCourierPayout.findFirst({ where: { restaurantId: restaurant.id, courierId } });
    assert.equal(row.businessDate, '2026-11-09');
    assert.deepEqual({ d: row.deliveriesCount, e: row.earningsCents, cc: row.cashCollectedCents, ctm: row.cashToMerchantCents, on: row.onlineEarningsCents, net: row.netCents },
      { d: 2, e: 7500, cc: 15500, ctm: 12000, on: 4000, net: -8000 });
    pass('corte del 9/nov: 2 entregas, ganó $75 (todo el envío), cobró $155 en efectivo, entrega $80 netos al comercio');

    const courierActor = { accountId: courierId + '_acc', roles: ['COURIER'] };
    const before = await payouts().wallet(courierActor, { days: 3 });
    assert.equal(before.totals.ledgerPayableCents, 4000); assert.equal(before.totals.owedToMerchantsCents, 8000);
    assert.equal(before.days.find(d => d.businessDate === '2026-11-09').items[0].direction, 'COURIER_PAYS');

    const owner = { accountId: tag + '_owner', roles: ['ADMIN'], tenantId: tenant.id, restaurantId: restaurant.id };
    const pays = await Promise.allSettled([payouts().markPaid(owner, row.id, { reference: 'Efectivo recibido en caja' }),
      payouts().markPaid(owner, row.id, { reference: 'Otro registro' })]);
    assert.equal(pays.filter(p => p.status === 'fulfilled').length, 1);
    const won = pays.find(p => p.status === 'fulfilled').value;
    assert.equal(won.disbursedCents, 4000);
    const disbursed = await base.marketplaceLedgerEntry.findMany({ where: { orderId: online.id, eventType: 'PAYOUT_DISBURSED' } });
    assert.equal(disbursed.length, 2);
    assert.equal(disbursed.filter(e => e.type === 'DEBIT').reduce((s, e) => s + Number(e.amount), 0),
      disbursed.filter(e => e.type === 'CREDIT').reduce((s, e) => s + Number(e.amount), 0));
    const after = await payouts().wallet(courierActor, { days: 3 });
    assert.equal(after.totals.ledgerPayableCents, 0, 'la billetera y el libro cuadran después del pago');
    assert.equal(after.totals.owedToMerchantsCents, 0);
    pass('el comercio marca pagado (dos clics a la vez: uno gana); COURIER_PAYABLE baja a 0 con PAYOUT_DISBURSED balanceado');

    await assert.rejects(base.marketplaceCourierPayout.update({ where: { id: row.id }, data: { netCents: 1 } }));
    await assert.rejects(base.marketplaceCourierPayout.update({ where: { id: row.id }, data: { paidAt: null } }));
    pass('los CHECK de la tabla rechazan un neto que no cuadra y pagado sin fecha');

    console.log(`Pagos al repartidor (PostgreSQL desechable): ${checks}/${checks} escenarios PASS`);
  } finally {
    try {
      const row = await base.marketplaceNetworkCourier.findUnique({ where: { id: courierId } });
      if (row) await base.marketplaceNetworkCourier.update({ where: { id: courierId }, data: { status: 'SUSPENDED', payload: { ...row.payload, status: 'SUSPENDED', isActive: false } } });
    } catch (error) { console.error('limpieza:', error.message); }
    await base.$disconnect();
  }
}
if (require.main === module) {
  if (!process.argv.includes('--disposable')) { console.error('Requiere --disposable y el cluster temporal documentado.'); process.exitCode = 2; }
  else run().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
