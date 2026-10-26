'use strict';

// Adaptadores Prisma de la API v1 del marketplace (cotización y orden de recoger
// en tienda). Sin BD: Prisma es un fake que registra las consultas.
//   node --test apps/backend/scripts/marketplace-v1-prisma.test.cjs
// La prueba contra PostgreSQL real se corrió en una base local desechable.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  marketplaceV1Config, createMarketplaceV1Adapters, createMarketplaceV1Services,
} = require('../src/lib/marketplace-v1-prisma');
const { APPROVED_MERCHANT } = require('../src/lib/marketplace-catalog');

const NOW = new Date('2026-10-24T18:00:00.000Z');
const OPEN = { isOpen: true, scheduleEnabled: false, businessHours: null, timezone: 'America/Mexico_City',
  currency: 'MXN', minOrderAmount: 50, freeDeliveryFrom: null, estimatedDelivery: 25 };

function fakePrisma({ restaurant = { id: 'r1', slug: 'tienda', config: OPEN, locations: [{ id: 'l1' }] }, items = [], promoConfig = null } = {}) {
  const calls = [];
  const quotes = new Map();
  const prisma = {
    calls,
    restaurant: { async findFirst(args) { calls.push(['restaurant.findFirst', args]); return restaurant; } },
    menuItem: { async findMany(args) { calls.push(['menuItem.findMany', args]); return items; } },
    restaurantConfig: { async findFirst(args) { calls.push(['restaurantConfig.findFirst', args]); return promoConfig; } },
    marketplaceQuote: {
      async create({ data }) {
        if ([...quotes.values()].some(q => q.idempotencyKeyHash === data.idempotencyKeyHash)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        quotes.set(data.id, { ...data });
      },
      async findUnique({ where }) { return [...quotes.values()].find(q => q.idempotencyKeyHash === where.idempotencyKeyHash) ?? null; },
      async findFirst(args) { calls.push(['marketplaceQuote.findFirst', args]); return null; },
      async updateMany(args) { calls.push(['marketplaceQuote.updateMany', args]); return { count: 1 }; },
    },
  };
  return prisma;
}

const item = (extra = {}) => ({ id: 'm1', restaurantId: 'r1', name: 'Taco', price: 85.5, isPromo: false, promoPrice: null,
  promoStartTime: null, promoEndTime: null, isAvailable: true, availableOnline: true, soldByWeight: false, isCombo: false,
  category: { isActive: true, restaurantId: 'r1' }, variants: [], modifierGroups: [], ...extra });

test('apagado por defecto; la comisión se lee del entorno y se valida', () => {
  assert.deepEqual(marketplaceV1Config({}), { enabled: false, commissionBps: null, onlinePayments: false, notificationUrl: null, delivery: false });
  assert.deepEqual(marketplaceV1Config({ MARKETPLACE_V1_ORDERS_ENABLED: 'true', MARKETPLACE_COMMISSION_BPS: '1500' }),
    { enabled: true, commissionBps: 1500, onlinePayments: false, notificationUrl: null, delivery: false });
  // La entrega a domicilio tiene su propia bandera.
  assert.equal(marketplaceV1Config({ MARKETPLACE_V1_DELIVERY_ENABLED: 'true' }).delivery, true);
  assert.equal(marketplaceV1Config({ MARKETPLACE_V1_DELIVERY_ENABLED: '1' }).delivery, false);
  // El pago en línea exige su propia bandera y una URL https del webhook.
  const hook = 'https://api.example.test/api/marketplace/v1/webhooks/mercadopago';
  assert.equal(marketplaceV1Config({ MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED: 'true', MARKETPLACE_MP_NOTIFICATION_URL: hook }).onlinePayments, true);
  assert.equal(marketplaceV1Config({ MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED: 'true' }).onlinePayments, false);
  assert.equal(marketplaceV1Config({ MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED: 'true',
    MARKETPLACE_MP_NOTIFICATION_URL: 'http://api.example.test/hook' }).onlinePayments, false);
  for (const bad of ['10001', '-5', '15%', '1.5', '']) {
    assert.equal(marketplaceV1Config({ MARKETPLACE_COMMISSION_BPS: bad }).commissionBps, null, bad);
  }
  assert.equal(createMarketplaceV1Services({ prisma: fakePrisma(), env: {} }), null);
});

test('el comercio es el restaurante aprobado del directorio, con horario y montos en centavos', async () => {
  const prisma = fakePrisma();
  const { catalog } = createMarketplaceV1Adapters({ prisma, commissionBps: 1200, now: () => NOW });
  const merchant = await catalog.loadMerchantBySlug('tienda');
  assert.deepEqual(prisma.calls[0][1].where, { slug: 'tienda', isActive: true, ...APPROVED_MERCHANT });
  assert.deepEqual(merchant, { id: 'r1', slug: 'tienda', status: 'ACTIVE', open: true, currency: 'MXN', commissionBps: 1200,
    minOrderCents: 5000, freeDeliveryFromCents: null, delivery: null, prepMinutes: 25 });
  // Sin la bandera de domicilio ni siquiera se leen zonas ni campos de envío.
  assert.equal('deliveryZones' in prisma.calls[0][1].select, false);
  assert.equal('deliveryMode' in prisma.calls[0][1].select.config.select, false);
  // Sin configuración la tienda está cerrada; sin comisión configurada no se manda el campo (la cotización falla 503).
  const closed = createMarketplaceV1Adapters({ prisma: fakePrisma({ restaurant: { id: 'r1', slug: 'tienda', config: null } }), now: () => NOW });
  const noConfig = await closed.catalog.loadMerchant('r1');
  assert.equal(noConfig.open, false);
  assert.equal('commissionBps' in noConfig, false);
  const missing = createMarketplaceV1Adapters({ prisma: fakePrisma({ restaurant: null }), now: () => NOW });
  assert.equal(await missing.catalog.loadMerchant('r1'), null);
});

const POLYGON = [{ lat: 19.4, lng: -99.17 }, { lat: 19.4, lng: -99.13 }, { lat: 19.44, lng: -99.13 }, { lat: 19.44, lng: -99.17 }];
const DELIVERY = { deliveryMode: 'ZONES', deliveryFee: 25, originLat: 19.42, originLng: -99.15, deliveryBaseFee: 20,
  deliveryPerKm: 5, deliveryFreeRadiusKm: null, deliveryMaxKm: 8 };
// La tarifa de zona llega como Decimal de Prisma: un objeto con valueOf, no un número.
const decimal = value => ({ valueOf: () => value, toString: () => String(value) });

test('con la bandera de domicilio el comercio trae la regla de envío de la tienda', async () => {
  const restaurant = { id: 'r1', slug: 'tienda', config: { ...OPEN, ...DELIVERY },
    locations: [{ id: 'l1', hasDelivery: true }],
    deliveryZones: [{ id: 'z1', name: 'Centro', fee: decimal(30), active: true, polygon: POLYGON }] };
  const prisma = fakePrisma({ restaurant });
  const { catalog } = createMarketplaceV1Adapters({ prisma, commissionBps: 1200, deliveryEnabled: true, now: () => NOW });
  const merchant = await catalog.loadMerchant('r1');
  assert.deepEqual(merchant.delivery, { ...DELIVERY,
    deliveryZones: [{ id: 'z1', name: 'Centro', fee: 30, active: true, polygon: POLYGON }] });
  const select = prisma.calls[0][1].select;
  assert.deepEqual(select.deliveryZones.where, { active: true });
  assert.deepEqual(select.deliveryZones.orderBy, [{ priority: 'asc' }, { id: 'asc' }]);
  // La misma sucursal que recibirá la orden: la primera activa.
  assert.deepEqual(select.locations.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
  assert.equal(select.locations.take, 1);
  // Fuera del modo ZONES las zonas no cuentan; sin domicilio en la sucursal no hay envío.
  const flat = fakePrisma({ restaurant: { ...restaurant, config: { ...OPEN, ...DELIVERY, deliveryMode: 'FLAT' } } });
  assert.deepEqual((await createMarketplaceV1Adapters({ prisma: flat, deliveryEnabled: true, now: () => NOW })
    .catalog.loadMerchant('r1')).delivery.deliveryZones, []);
  const pickupOnly = fakePrisma({ restaurant: { ...restaurant, locations: [{ id: 'l1', hasDelivery: false }] } });
  assert.equal((await createMarketplaceV1Adapters({ prisma: pickupOnly, deliveryEnabled: true, now: () => NOW })
    .catalog.loadMerchant('r1')).delivery, null);
  const noLocation = fakePrisma({ restaurant: { ...restaurant, locations: [] } });
  assert.equal((await createMarketplaceV1Adapters({ prisma: noLocation, deliveryEnabled: true, now: () => NOW })
    .catalog.loadMerchant('r1')).delivery, null);
});

test('la dirección de la cotización y la orden sale de la libreta del comprador', async () => {
  const prisma = fakePrisma();
  const rows = [{ id: 'a1', accountId: 'guest:a', address: 'Calle 1 #2, Centro', lat: 19.42, lng: -99.15 }];
  const seen = [];
  const tx = { marketplaceBuyerAddress: { async findFirst(args) { seen.push(['tx', args]); return rows.find(r => r.id === args.where.id && r.accountId === args.where.accountId) ?? null; } } };
  prisma.marketplaceBuyerAddress = { async findFirst(args) { seen.push(['db', args]); return tx.marketplaceBuyerAddress.findFirst(args); } };
  const { addresses } = createMarketplaceV1Adapters({ prisma, now: () => NOW });
  assert.deepEqual(await addresses.resolve('guest:a', 'a1'), { id: 'a1', address: 'Calle 1 #2, Centro', lat: 19.42, lng: -99.15, accountId: 'guest:a' });
  // Dentro de la transacción de la orden se lee con el cliente de la transacción.
  assert.equal((await addresses.resolve('guest:a', 'a1', { tx })).id, 'a1');
  assert.equal(seen.at(-1)[0], 'tx');
  // La dirección de otra cuenta no existe para este comprador.
  assert.equal(await addresses.resolve('guest:b', 'a1'), null);
});

test('solo se venden productos simples, disponibles en línea y con precio', async () => {
  const items = [
    item(),
    item({ id: 'variante', variants: [{ id: 'v1' }] }),
    item({ id: 'obligatorio', modifierGroups: [{ id: 'g1' }] }),
    item({ id: 'peso', soldByWeight: true }),
    item({ id: 'combo', isCombo: true }),
    item({ id: 'oculto', availableOnline: false }),
    item({ id: 'categoria-inactiva', category: { isActive: false, restaurantId: 'r1' } }),
    item({ id: 'categoria-ajena', category: { isActive: true, restaurantId: 'otro' } }),
    item({ id: 'gratis', price: 0 }),
    item({ id: 'agotado', isAvailable: false }),
  ];
  const prisma = fakePrisma({ items });
  const { catalog } = createMarketplaceV1Adapters({ prisma, now: () => NOW });
  const rows = await catalog.loadListings('r1', items.map(i => i.id));
  assert.deepEqual(prisma.calls[0][1].where, { restaurantId: 'r1', id: { in: items.map(i => i.id) } });
  const byId = Object.fromEntries(rows.map(r => [r.menuItemId, r]));
  assert.deepEqual(byId.m1, { merchantId: 'r1', menuItemId: 'm1', name: 'Taco', published: true, available: true, unitPriceCents: 8550 });
  for (const id of ['variante', 'obligatorio', 'peso', 'combo', 'oculto', 'categoria-inactiva', 'categoria-ajena', 'gratis']) {
    assert.equal(byId[id].published, false, id);
  }
  assert.equal(byId.agotado.published, true);
  assert.equal(byId.agotado.available, false);
});

test('el precio de promoción se respeta solo dentro de su ventana, igual que el catálogo', async () => {
  const promo = item({ isPromo: true, promoPrice: 70 });
  const inside = createMarketplaceV1Adapters({ prisma: fakePrisma({ items: [promo] }), now: () => NOW });
  assert.equal((await inside.catalog.loadListings('r1', ['m1']))[0].unitPriceCents, 7000);
  const windowed = fakePrisma({ items: [promo], promoConfig: { promoStartTime: '06:00', promoEndTime: '07:00', timezone: 'America/Mexico_City' } });
  const outside = createMarketplaceV1Adapters({ prisma: windowed, now: () => NOW });
  assert.equal((await outside.catalog.loadListings('r1', ['m1']))[0].unitPriceCents, 8550);
});

test('la cotización se guarda una vez por clave y la orden la consume con CAS', async () => {
  const prisma = fakePrisma();
  const { quoteStore } = createMarketplaceV1Adapters({ prisma, now: () => NOW });
  const quote = { id: 'q1', accountId: 'guest:a', merchantId: 'r1', fulfillment: 'PICKUP', deliveryAddressId: null,
    status: 'ACTIVE', currency: 'MXN', itemsSnapshot: [], priceSnapshot: {}, requestHash: 'h', idempotencyKeyHash: 'k',
    createdAt: NOW, expiresAt: new Date(NOW.getTime() + 300000) };
  await quoteStore.save(quote);
  await assert.rejects(quoteStore.save({ ...quote, id: 'q2' }), e => e.code === 'DUPLICATE');
  assert.equal((await quoteStore.findByIdempotencyKey('k')).id, 'q1');
  await quoteStore.consume({ quoteId: 'q1', accountId: 'guest:a', orderId: 'o1', restaurantId: 'r1', requestKeyHash: 'rk', at: NOW });
  const consume = prisma.calls.find(c => c[0] === 'marketplaceQuote.updateMany')[1];
  assert.deepEqual(consume.where, { id: 'q1', accountId: 'guest:a', merchantId: 'r1', status: 'ACTIVE', expiresAt: { gt: NOW } });
  assert.deepEqual(consume.data, { status: 'CONSUMED', consumedAt: NOW, orderId: 'o1', requestKeyHash: 'rk' });
  await quoteStore.findOrderReference({ accountId: 'guest:a', requestKeyHash: 'rk' });
  assert.deepEqual(prisma.calls.find(c => c[0] === 'marketplaceQuote.findFirst')[1].where,
    { accountId: 'guest:a', requestKeyHash: 'rk', orderId: { not: null } });
});

test('la orden entra a la primera sucursal activa del comercio aprobado', async () => {
  const prisma = fakePrisma();
  const { merchants } = createMarketplaceV1Adapters({ prisma, now: () => NOW });
  // MANUAL: la entregan los repartidores propios de la tienda, sin oferta a la red.
  assert.deepEqual(await merchants.resolve('r1'), { id: 'r1', status: 'ACTIVE', restaurantId: 'r1', locationId: 'l1', slug: 'tienda',
    deliveryPolicy: 'MANUAL' });
  const query = prisma.calls[0][1];
  assert.deepEqual(query.where, { id: 'r1', isActive: true, ...APPROVED_MERCHANT });
  assert.deepEqual(query.select.locations.orderBy, [{ createdAt: 'asc' }, { id: 'asc' }]);
});

test('sin Mercado Pago conectado el pago en línea se rechaza antes de crear nada', async () => {
  const prisma = fakePrisma();
  const v1 = createMarketplaceV1Services({ prisma, now: () => NOW,
    env: { MARKETPLACE_V1_ORDERS_ENABLED: 'true', MARKETPLACE_COMMISSION_BPS: '1500', MARKETPLACE_PIN_SECRET: 'p'.repeat(40) } });
  await assert.rejects(v1.orderService.createOrder({ accountId: 'guest:a', idempotencyKey: 'k'.repeat(32),
    body: { quoteId: 'q1', paymentMethod: 'ONLINE', customer: { name: 'Ana', phone: '5512345678' } } }),
  e => e.code === 'ONLINE_PAYMENT_UNAVAILABLE' && e.statusCode === 409);
  assert.equal(prisma.calls.length, 0);
});

test('el seguimiento responde el estado real de la orden con el token del comprador', async () => {
  const crypto = require('node:crypto');
  const token = 'a1'.repeat(32);
  const order = { id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', status: 'PENDING_MERCHANT' };
  const pipeline = { orderId: 'o1', restaurantId: 'r1', dispatch: null, order,
    trackingTokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    trackingExpiresAt: new Date(NOW.getTime() + 86400000) };
  const calls = [];
  const prisma = {
    marketplaceOrderPipeline: { async findFirst(args) {
      calls.push(args.where);
      return args.where.orderId === pipeline.orderId && args.where.trackingTokenHash === pipeline.trackingTokenHash
        ? structuredClone(pipeline) : null;
    } },
    location: { async findFirst({ where }) { return where.id === 'l1' && where.restaurantId === 'r1' ? { id: 'l1', restaurantId: 'r1' } : null; } },
  };
  const v1 = createMarketplaceV1Services({ prisma, now: () => NOW,
    env: { MARKETPLACE_V1_ORDERS_ENABLED: 'true', MARKETPLACE_COMMISSION_BPS: '1500', MARKETPLACE_PIN_SECRET: 'p'.repeat(40) } });
  const view = await v1.trackingService.getOrderTracking({ orderId: 'o1', trackingToken: token });
  assert.deepEqual(view, { orderId: 'o1', status: 'PENDING_MERCHANT', taskStatus: null, origin: null, courierLocation: null, isStale: false });
  assert.deepEqual(calls[0], { orderId: 'o1', trackingTokenHash: pipeline.trackingTokenHash, order: { is: { source: 'MARKETPLACE' } } });
  // El comercio la acepta y la prepara en el TPV: el comprador lo ve.
  for (const status of ['CONFIRMED', 'PREPARING', 'READY']) {
    order.status = status;
    assert.equal((await v1.trackingService.getOrderTracking({ orderId: 'o1', trackingToken: token })).status, status);
  }
  // Token ajeno, orden ajena o token vencido: 404 sin decir si la orden existe.
  await assert.rejects(v1.trackingService.getOrderTracking({ orderId: 'o1', trackingToken: 'b2'.repeat(32) }), e => e.statusCode === 404);
  await assert.rejects(v1.trackingService.getOrderTracking({ orderId: 'o2', trackingToken: token }), e => e.statusCode === 404);
  pipeline.trackingExpiresAt = new Date(NOW.getTime() - 1);
  await assert.rejects(v1.trackingService.getOrderTracking({ orderId: 'o1', trackingToken: token }), e => e.statusCode === 404);
  await assert.rejects(v1.trackingService.getOrderTracking({ orderId: 'o1', trackingToken: 'corto' }), e => e.statusCode === 401);
});
