'use strict';

// C7: un pedido v1 de un comercio con política de red llega a un repartidor independiente
// verificado y se entrega con PIN, en PostgreSQL desechable con el guard en ENFORCE.
// Usa la resolución real del comercio (merchants.resolve) y la preparación real de la tarea
// (prepareDispatch); la orden se inserta como la deja el orquestador.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMarketplaceV1Adapters } = require('../src/lib/marketplace-v1-prisma');
const { prepareDispatch } = require('../src/lib/marketplace-order-orchestrator');
const { createNetworkPersistence } = require('../src/lib/marketplace-network-prisma');
const { hashPin } = require('../src/lib/marketplace-dispatch');
const createDispatchRouter = require('../src/routes/marketplace-dispatch.routes');
const { database } = require('./helpers/marketplace-postgres.cjs');

async function run() {
  const { base, prisma } = database();
  const tag = 'c7_' + randomUUID().slice(0, 8);
  let at = new Date('2026-11-10T18:00:00Z');
  const now = () => new Date(at);
  const network = () => createNetworkPersistence({ prisma, now });
  let checks = 0; const pass = text => { checks++; console.log('PASS ' + text); };
  const courierId = tag + '_courier';
  try {
    const tenant = await base.tenant.create({ data: { name: tag, slug: tag, ownerEmail: tag + '@example.test', enabledModules: ['marketplace'] } });
    const restaurant = await base.restaurant.create({ data: { tenantId: tenant.id, name: tag, slug: tag } });
    await base.marketplaceMerchantMembership.create({ data: { restaurantId: restaurant.id, status: 'APPROVED' } });
    const location = await base.location.create({ data: { restaurantId: restaurant.id, name: 'Colorines', slug: tag, latitude: 19.17, longitude: -100.07, hasDelivery: true } });
    const adapters = (networkDispatch = true) => createMarketplaceV1Adapters({ prisma, networkDispatch, now });

    // 1) Sin política elegida: MANUAL (reparto propio), como hasta hoy.
    assert.equal((await adapters().merchants.resolve(restaurant.id)).deliveryPolicy, 'MANUAL');
    // El dueño abre "Despacho" en el admin: su sucursal se registra en la red como MANUAL.
    const routes = new Map();
    createDispatchRouter({ persistence: network(), networkEnabled: true, now, authenticate: (req, res, next) => next(),
      Router: () => ({ use() {}, get: (path, fn) => routes.set('GET ' + path, fn), post: (path, fn) => routes.set('POST ' + path, fn),
        put: (path, fn) => routes.set('PUT ' + path, fn) }) });
    const call = async (key, extra = {}) => {
      const res = { statusCode: 200, set() { return this; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
      await routes.get(key)({ user: { id: tag + '_owner', role: 'ADMIN', restaurantId: restaurant.id, isActive: true, isDevice: false },
        headers: {}, query: {}, params: {}, body: {}, ...extra }, res);
      return res;
    };
    const read = await call('GET /merchants/me/delivery-policy');
    assert.equal(read.statusCode, 200); assert.equal(read.body.deliveryPolicy, 'MANUAL');
    const networkMerchantId = read.body.merchantId;
    assert.equal((await base.marketplaceNetworkMerchant.findUnique({ where: { id: networkMerchantId } })).locationId, location.id);
    assert.equal((await adapters().merchants.resolve(restaurant.id)).deliveryPolicy, 'MANUAL', 'registrarse no lo manda a la red');
    // Elige "Solo red compartida" y guarda.
    const saved = await call('PUT /merchants/:id/delivery-policy', { params: { id: networkMerchantId },
      body: { deliveryPolicy: 'SHARED_ONLY', fallbackSeconds: 30, maxDistanceKm: 10 } });
    assert.equal(saved.statusCode, 200);
    const outsider = await call('GET /merchants/me/delivery-policy', { user: { id: 'x', role: 'ADMIN', restaurantId: 'otro', isActive: true } });
    assert.equal(outsider.statusCode, 404, 'un restaurante sin membresía aprobada no se registra');
    assert.equal((await adapters(false).merchants.resolve(restaurant.id)).deliveryPolicy, 'MANUAL', 'con la red apagada sigue MANUAL');
    const merchant = await adapters().merchants.resolve(restaurant.id);
    assert.equal(merchant.deliveryPolicy, 'SHARED_ONLY'); assert.equal(merchant.dispatchMerchantId, networkMerchantId);
    pass('al abrir Despacho la sucursal se registra MANUAL; al elegir "solo red" la orden toma esa política y se liga a su fila (red apagada: MANUAL)');

    // 2) El pedido en efectivo nace por aceptar, con la tarea esperando y sin oferta.
    const orderId = tag + '_order';
    const dispatch = prepareDispatch({ orderId, merchant, at: now(), pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321'),
      quote: { currency: 'MXN', priceSnapshot: { courierPayoutCents: 3500 } } });
    assert.equal(dispatch.task.status, 'WAITING_READY'); assert.equal(dispatch.offer, null);
    await base.order.create({ data: { id: orderId, restaurantId: restaurant.id, locationId: location.id, orderNumber: tag, source: 'MARKETPLACE',
      orderType: 'DELIVERY', status: 'PENDING_MERCHANT', paymentMethod: 'CASH', subtotal: 120, deliveryFee: 35, total: 155,
      marketplacePipeline: { create: { storeSlug: tag, requestHash: 'a'.repeat(64), trackingTokenHash: 'b'.repeat(64),
        trackingExpiresAt: new Date('2026-12-01'), pinKeyId: 'v1', pickupPinHash: dispatch.task.pickupPinHash, deliveryPinHash: dispatch.task.deliveryPinHash,
        paymentMethod: 'CASH', settlement: { subtotalCents: 12000, deliveryFeeCents: 3500, totalCents: 15500, courierPayoutCents: 3500, platformFeeCents: 0 },
        dispatch: { task: dispatch.task, offer: null } } } } });

    // 3) Repartidor independiente verificado y en línea, cerca de la sucursal.
    await base.marketplaceNetworkCourier.create({ data: { id: courierId, accountId: courierId + '_acc', status: 'ACTIVE', verificationStatus: 'VERIFIED',
      version: 0, payload: { id: courierId, accountId: courierId + '_acc', status: 'ACTIVE', verificationStatus: 'VERIFIED', version: 0, isShared: true, isActive: true } } });
    await network().updatePresence(courierId, { isOnline: true, lat: 19.171, lng: -100.071, acceptingShared: true });
    const offersFor = () => network().run(async r => { await network().tick(r); return r.engine.offersForCourier(courierId).filter(o => o.taskId === dispatch.task.id); });

    for (const status of ['PENDING_MERCHANT', 'CONFIRMED', 'PREPARING']) {
      await base.order.update({ where: { id: orderId }, data: { status } });
      assert.deepEqual(await offersFor(), [], `sin oferta en ${status}`);
    }
    pass('no se busca repartidor mientras el comercio no acepta ni mientras cocina');

    // 4) La caja lo marca LISTO: la red lo oferta al repartidor con el 100% del envío.
    await base.order.update({ where: { id: orderId }, data: { status: 'READY' } });
    const [offer] = await offersFor();
    assert(offer, 'oferta al marcar LISTO'); assert.equal(offer.payoutAmount, 35); assert.equal(offer.source, 'SHARED');
    const task = await base.marketplaceNetworkTask.findUnique({ where: { id: dispatch.task.id } });
    assert.equal(task.merchantId, networkMerchantId);
    assert.equal(await base.marketplaceNetworkMerchant.count({ where: { restaurantId: restaurant.id } }), 1, 'no se inventa otro comercio de red');
    pass('al marcar LISTO la red oferta al repartidor verificado $35.00 (todo el envío), ligada al comercio de red');

    // 5) Acepta, recoge con el PIN de recogida y entrega con el del cliente.
    await network().run(r => r.engine.acceptOffer({ offerId: offer.id, courierId }), { offerIds: [offer.id] });
    await assert.rejects(network().run(r => r.engine.confirmPickup({ taskId: dispatch.task.id, courierId, pickupPin: '000000' })), e => e.code === 'INVALID_PIN');
    await network().run(r => r.engine.confirmPickup({ taskId: dispatch.task.id, courierId, pickupPin: '123456' }));
    assert.equal((await base.order.findUnique({ where: { id: orderId } })).status, 'ON_THE_WAY');
    await network().updatePresence(courierId, { isOnline: true, lat: 19.18, lng: -100.08 });
    const presence = await base.marketplaceNetworkPresence.findUnique({ where: { courierId } });
    assert.equal(presence.orderId, orderId, 'el GPS queda ligado al pedido para el seguimiento del cliente');
    await network().run(r => r.engine.confirmDelivery({ taskId: dispatch.task.id, courierId, deliveryPin: '654321' }), { taskIds: [dispatch.task.id] });
    assert.equal((await base.order.findUnique({ where: { id: orderId } })).status, 'DELIVERED');
    const pipeline = await base.marketplaceOrderPipeline.findUnique({ where: { orderId } });
    assert.equal(pipeline.dispatch.task.status, 'DELIVERED'); assert.equal(pipeline.dispatch.assignment.courierId, courierId);
    pass('el repartidor acepta, recoge y entrega con PIN; la orden queda ENTREGADA y el pipeline lo refleja');

    console.log(`Pedido v1 por la red (PostgreSQL desechable): ${checks}/${checks} escenarios PASS`);
  } finally {
    try {
      await base.marketplaceNetworkCourier.updateMany({ where: { id: courierId }, data: { status: 'SUSPENDED' } });
      const row = await base.marketplaceNetworkCourier.findUnique({ where: { id: courierId } });
      if (row) await base.marketplaceNetworkCourier.update({ where: { id: courierId }, data: { payload: { ...row.payload, status: 'SUSPENDED', isActive: false } } });
    } catch (error) { console.error('limpieza:', error.message); }
    await base.$disconnect();
  }
}
if (require.main === module) {
  if (!process.argv.includes('--disposable')) { console.error('Requiere --disposable y el cluster temporal documentado.'); process.exitCode = 2; }
  else run().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
