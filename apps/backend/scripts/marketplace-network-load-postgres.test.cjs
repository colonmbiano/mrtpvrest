'use strict';

// C6: carga de la red en PostgreSQL desechable. 6,000 tareas históricas, 12 pedidos vivos y
// 50 repartidores mandando GPS y pidiendo ofertas a la vez. Antes de C6 la red cargaba todo el
// histórico en cada petición y respondía 503 al pasar de 5,000 filas.
// Requiere --disposable (mismo cluster que las demás suites *-postgres).
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createNetworkPersistence, createNetworkOpsPorts } = require('../src/lib/marketplace-network-prisma');
const { createMarketplaceOpsDispatchService } = require('../src/lib/marketplace-ops-dispatch-v1');
const { hashPin } = require('../src/lib/marketplace-dispatch');
const { database } = require('./helpers/marketplace-postgres.cjs');

const HISTORY = 6000;
const LIVE = 12;
const COURIERS = 50;
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))];

async function run() {
  const { base, prisma } = database();
  const tag = 'load_' + randomUUID().slice(0, 8);
  let at = new Date('2026-11-10T18:00:00Z');
  const now = () => new Date(at);
  const persistence = () => createNetworkPersistence({ prisma, now });
  let checks = 0; const pass = text => { checks++; console.log('PASS ' + text); };
  const couriers = Array.from({ length: COURIERS }, (_, i) => `${tag}_c${i}`);
  try {
    const tenant = await base.tenant.create({ data: { name: tag, slug: tag, ownerEmail: tag + '@example.test' } });
    const restaurant = await base.restaurant.create({ data: { tenantId: tenant.id, name: tag, slug: tag } });
    const location = await base.location.create({ data: { restaurantId: restaurant.id, name: 'Sucursal carga', slug: tag, latitude: 19.4, longitude: -99.1 } });
    const orderBase = { restaurantId: restaurant.id, locationId: location.id, source: 'MARKETPLACE', orderType: 'DELIVERY',
      paymentMethod: 'CASH', subtotal: 100, deliveryFee: 30, total: 130 };

    // ── histórico: 6,000 pedidos entregados con su tarea, asignación y dos ofertas ──
    const started = Date.now();
    for (let from = 0; from < HISTORY; from += 1000) {
      const n = Array.from({ length: Math.min(1000, HISTORY - from) }, (_, i) => from + i);
      await base.order.createMany({ data: n.map(i => ({ ...orderBase, id: `${tag}_h${i}`, orderNumber: `${tag}_h${i}`, status: 'DELIVERED' })) });
      await base.marketplaceNetworkTask.createMany({ data: n.map(i => ({ id: `${tag}_h${i}_task`, orderId: `${tag}_h${i}`,
        restaurantId: restaurant.id, locationId: location.id, merchantId: location.id, status: 'DELIVERED', version: 5,
        payload: { id: `${tag}_h${i}_task`, orderId: `${tag}_h${i}`, restaurantId: restaurant.id, locationId: location.id,
          merchantId: location.id, status: 'DELIVERED', dispatchMode: 'SHARED', version: 5, currentAssignmentId: `${tag}_h${i}_a`,
          currentAssignment: { id: `${tag}_h${i}_a`, taskId: `${tag}_h${i}_task`, courierId: `${tag}_c${i % COURIERS}`, source: 'SHARED', status: 'COMPLETED', payoutAmount: 30, currency: 'MXN' } } })) });
      await base.marketplaceNetworkAssignment.createMany({ data: n.map(i => ({ id: `${tag}_h${i}_a`, taskId: `${tag}_h${i}_task`,
        restaurantId: restaurant.id, courierId: `${tag}_c${i % COURIERS}`, status: 'COMPLETED',
        payload: { id: `${tag}_h${i}_a`, taskId: `${tag}_h${i}_task`, courierId: `${tag}_c${i % COURIERS}`, source: 'SHARED', status: 'COMPLETED' } })) });
      await base.marketplaceNetworkOffer.createMany({ data: n.flatMap(i => [0, 1].map(k => ({ id: `${tag}_h${i}_o${k}`,
        taskId: `${tag}_h${i}_task`, restaurantId: restaurant.id, courierId: `${tag}_c${(i + k) % COURIERS}`,
        status: k ? 'EXPIRED' : 'ACCEPTED', expiresAt: new Date('2026-10-01'),
        payload: { id: `${tag}_h${i}_o${k}`, taskId: `${tag}_h${i}_task`, status: k ? 'EXPIRED' : 'ACCEPTED' } }))) });
    }

    // ── 50 repartidores verificados en línea ──
    await base.marketplaceNetworkCourier.createMany({ data: couriers.map(id => ({ id, accountId: id + '_acc', status: 'ACTIVE',
      verificationStatus: 'VERIFIED', version: 0, payload: { id, accountId: id + '_acc', status: 'ACTIVE', verificationStatus: 'VERIFIED',
        version: 0, isShared: true, isActive: true } })) });
    await base.marketplaceNetworkPresence.createMany({ data: couriers.map(courierId => ({ courierId, lastSeenAt: now(),
      payload: { lat: 19.4, lng: -99.1, accuracy: 10, lastSeenAt: now().toISOString(), isOnline: true, acceptingShared: true } })) });

    // ── 12 pedidos vivos listos para la red ──
    const live = [];
    for (let i = 0; i < LIVE; i++) {
      const id = `${tag}_live${i}`; const taskId = id + '_task';
      const task = { id: taskId, orderId: id, restaurantId: restaurant.id, locationId: location.id, merchantId: location.id,
        deliveryPolicy: 'SHARED_ONLY', status: 'WAITING_READY', pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321'),
        payoutAmount: 30, currency: 'MXN', fallbackSeconds: 30, maxDistanceKm: 10 };
      await base.order.create({ data: { ...orderBase, id, orderNumber: id, status: 'READY',
        marketplacePipeline: { create: { storeSlug: tag, requestHash: 'a'.repeat(64), trackingTokenHash: 'b'.repeat(64),
          trackingExpiresAt: new Date('2026-12-01'), pinKeyId: 'test', pickupPinHash: task.pickupPinHash, deliveryPinHash: task.deliveryPinHash,
          paymentMethod: 'CASH', settlement: { subtotalCents: 10000, totalCents: 13000, courierPayoutCents: 3000 }, dispatch: { task, offer: null } } } } });
      live.push(task);
    }
    console.log(`   semilla: ${HISTORY} tareas históricas, ${HISTORY * 2} ofertas, ${COURIERS} repartidores en ${Date.now() - started} ms`);

    // 1) Con más de 5,000 tareas históricas la red responde y oferta lo vivo.
    const t0 = Date.now();
    const loaded = await persistence().run(async r => {
      await r.engine.tick();
      for (const task of r.store.tasks.values()) if (task.status === 'WAITING_READY') { try { r.engine.startDispatch({ taskId: task.id }); } catch {} }
      return { tasks: r.store.tasks.size, mine: [...r.store.tasks.keys()].filter(id => id.startsWith(tag)).length };
    });
    const firstRun = Date.now() - t0;
    assert.equal(loaded.mine, LIVE, 'solo las vivas de este comercio entran al motor');
    assert(loaded.tasks < 1000, 'el histórico no se carga');
    const offered = await base.marketplaceNetworkTask.count({ where: { restaurantId: restaurant.id, status: 'OFFERING' } });
    assert.equal(offered, LIVE);
    pass(`con ${HISTORY} tareas históricas la red no responde 503: carga ${loaded.mine} vivas y las oferta (${firstRun} ms)`);

    // 2) 50 repartidores: 5 rondas de GPS + pedir ofertas, todos a la vez.
    const presenceTimes = []; const pollTimes = []; const failures = [];
    for (let round = 0; round < 5; round++) {
      at = new Date(at.getTime() + 2000);
      await Promise.all(couriers.flatMap((id, i) => [
        (async () => { const s = Date.now(); try { await persistence().updatePresence(id, { isOnline: true, lat: 19.4 + i / 1e4, lng: -99.1, accuracy: 5 }); }
          catch (e) { failures.push(e.code || e.message); } presenceTimes.push(Date.now() - s); })(),
        (async () => { const s = Date.now(); const p = persistence();
          try { await p.run(async r => { await p.tick(r); return r.engine.offersForCourier(id).length; }); }
          catch (e) { failures.push(e.code || e.message); } pollTimes.push(Date.now() - s); })(),
      ]));
    }
    assert.deepEqual(failures, [], 'ningún 503 ni conflicto');
    const saved = await base.marketplaceNetworkPresence.findUnique({ where: { courierId: couriers[7] } });
    assert.equal(saved.payload.lat, 19.4 + 7 / 1e4);
    pass(`50 repartidores × 5 rondas (GPS + ofertas a la vez), 500 llamadas sin error · GPS p95 ${percentile(presenceTimes, 0.95)} ms · ofertas p95 ${percentile(pollTimes, 0.95)} ms`);

    // 3) Todos aceptan a la vez: cada pedido queda con un solo repartidor y nadie con dos.
    const offers = await base.marketplaceNetworkOffer.findMany({ where: { restaurantId: restaurant.id, status: 'OFFERED',
      taskId: { in: live.map(t => t.id) } } });
    // Cada repartidor intenta aceptar una oferta suya, los 50 a la vez.
    // El repartidor i va por el pedido i % 12: varios compiten por cada pedido.
    const firstOffer = new Map(couriers.map((id, i) => [id, offers.find(o => o.courierId === id && o.taskId === live[i % LIVE].id)]));
    assert.equal(firstOffer.size, COURIERS);
    const attempts = [...firstOffer.values()].map(offer => persistence().run(r => r.engine.acceptOffer({ offerId: offer.id, courierId: offer.courierId }), { offerIds: [offer.id] }));
    const settled = await Promise.allSettled(attempts);
    // 409/410: otro ganó la oferta; 403 COURIER_FORBIDDEN: ese repartidor ya tomó otro pedido.
    const unexpected = settled.filter(s => s.status === 'rejected' && ![409, 410].includes(s.reason?.statusCode) && s.reason?.code !== 'COURIER_FORBIDDEN').map(s => s.reason?.code || s.reason?.message);
    assert.deepEqual(unexpected, []);
    const active = await base.marketplaceNetworkAssignment.findMany({ where: { restaurantId: restaurant.id, status: 'ACTIVE' } });
    assert.equal(new Set(active.map(a => a.taskId)).size, active.length, 'un repartidor por pedido');
    assert.equal(new Set(active.map(a => a.courierId)).size, active.length, 'nadie con dos pedidos');
    assert.equal(active.length, LIVE, 'cada pedido quedó con un repartidor');
    pass(`${attempts.length} repartidores aceptan a la vez: ${active.length} asignaciones, ninguna duplicada por pedido ni por repartidor`);

    // 4) El GPS se liga a la tarea asignada para el seguimiento del cliente.
    const assigned = active[0];
    await persistence().updatePresence(assigned.courierId, { isOnline: true, lat: 19.41, lng: -99.11 });
    const linked = await base.marketplaceNetworkPresence.findUnique({ where: { courierId: assigned.courierId } });
    assert.equal(linked.taskId, assigned.taskId); assert.equal(linked.assignmentId, assigned.id);
    pass('la presencia directa queda ligada a la asignación activa');

    // 5) Ops recorre el histórico por páginas desde la tabla.
    const ops = createMarketplaceOpsDispatchService({ ...createNetworkOpsPorts(persistence()), now });
    const admin = { id: 'platform', accountId: 'platform', roles: ['SUPER_ADMIN'], isActive: true };
    const page1 = await ops.listDispatch(admin, { status: 'DELIVERED', merchantId: location.id, limit: '100' });
    assert.equal(page1.items.length, 100); assert(page1.nextCursor);
    const page2 = await ops.listDispatch(admin, { status: 'DELIVERED', merchantId: location.id, limit: '100', cursor: page1.nextCursor });
    assert.equal(page2.items.length, 100); assert(page2.items[0].id > page1.items.at(-1).id);
    const mixed = await ops.listDispatch(admin, { merchantId: location.id, limit: '100' });
    assert.equal(mixed.items.length, 100);
    pass('Ops pagina 6,000 entregadas desde la tabla y mezcla vivas con terminadas por id');

    console.log(`Red PostgreSQL desechable (carga): ${checks}/${checks} escenarios PASS`);
  } finally {
    // El cluster es compartido entre corridas: retirar lo vivo de esta corrida para no inflar la siguiente.
    try {
      await base.order.updateMany({ where: { id: { startsWith: tag + '_live' } }, data: { status: 'CANCELLED' } });
      await base.marketplaceNetworkTask.updateMany({ where: { id: { startsWith: tag + '_live' } }, data: { status: 'CANCELLED' } });
      await base.marketplaceNetworkOffer.updateMany({ where: { taskId: { startsWith: tag + '_live' }, status: 'OFFERED' }, data: { status: 'EXPIRED' } });
      // El motor lee el estado del payload: suspender en columna y payload.
      for (const id of couriers) await base.marketplaceNetworkCourier.update({ where: { id }, data: { status: 'SUSPENDED',
        payload: { id, accountId: id + '_acc', status: 'SUSPENDED', verificationStatus: 'VERIFIED', version: 1, isShared: true, isActive: false } } });
    } catch (error) { console.error('limpieza:', error.message); }
    await base.$disconnect();
  }
}
if (require.main === module) {
  if (!process.argv.includes('--disposable')) { console.error('Requiere --disposable y el cluster temporal documentado.'); process.exitCode = 2; }
  else run().catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { run };
