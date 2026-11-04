'use strict';

// Mis pedidos del comprador (app del cliente): GET /api/marketplace/v1/orders y los
// adaptadores Prisma de la lista y del seguimiento por cuenta. Sin BD: Prisma es un fake.

const express = require('express');
const request = require('supertest');
const { createMarketplaceV1Adapters } = require('../src/lib/marketplace-v1-prisma');
const { BuyerIdentityError } = require('../src/lib/marketplace-buyer-identity');

function app({ buyerOrders, resolveAccount } = {}) {
  const a = express();
  a.use('/api/marketplace/v1/orders', require('../src/routes/marketplace-orders-v1.routes')({ buyerOrders, resolveAccount }));
  return a;
}
const bearer = async req => {
  if (req.headers.authorization === 'Bearer buyer') return 'acc-1';
  if (req.headers['x-buyer-id']) return 'guest:abc';
  throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Token de comprador invalido');
};

describe('GET /api/marketplace/v1/orders', () => {
  it('lista los pedidos de la cuenta del Bearer, sin caché', async () => {
    const listForAccount = jest.fn(async () => ({ orders: [{ orderId: 'o1' }], nextBefore: null }));
    const res = await request(app({ buyerOrders: { listForAccount }, resolveAccount: bearer }))
      .get('/api/marketplace/v1/orders').set('Authorization', 'Bearer buyer');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.vary).toMatch(/Authorization/);
    expect(res.body).toEqual({ orders: [{ orderId: 'o1' }], nextBefore: null });
    expect(listForAccount).toHaveBeenCalledWith({ accountId: 'acc-1', limit: 20, before: null });
  });

  it('sin Bearer no hay historial: ni anónimo ni con id de invitado', async () => {
    const listForAccount = jest.fn();
    const a = app({ buyerOrders: { listForAccount }, resolveAccount: bearer });
    const anonymous = await request(a).get('/api/marketplace/v1/orders');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.errorCode).toBe('INVALID_BUYER_IDENTITY');
    expect((await request(a).get('/api/marketplace/v1/orders').set('X-Buyer-Id', 'guest-browser')).status).toBe(401);
    expect((await request(a).get('/api/marketplace/v1/orders').set('Authorization', 'Bearer otro')).status).toBe(401);
    expect(listForAccount).not.toHaveBeenCalled();
  });

  it('acota el límite y valida el cursor before', async () => {
    const listForAccount = jest.fn(async () => ({ orders: [], nextBefore: null }));
    const a = app({ buyerOrders: { listForAccount }, resolveAccount: bearer });
    await request(a).get('/api/marketplace/v1/orders?limit=500').set('Authorization', 'Bearer buyer');
    expect(listForAccount.mock.calls[0][0].limit).toBe(50);
    await request(a).get('/api/marketplace/v1/orders?limit=0&before=2026-10-30T10:00:00.000Z').set('Authorization', 'Bearer buyer');
    expect(listForAccount.mock.calls[1][0]).toEqual({ accountId: 'acc-1', limit: 20, before: new Date('2026-10-30T10:00:00.000Z') });
    const bad = await request(a).get('/api/marketplace/v1/orders?before=ayer').set('Authorization', 'Bearer buyer');
    expect(bad.status).toBe(400);
    expect(bad.body.errorCode).toBe('INVALID_CURSOR');
  });

  it('sin la bandera v1 (sin servicios) responde 503', async () => {
    const saved = process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    delete process.env.MARKETPLACE_V1_ORDERS_ENABLED;
    let a;
    jest.isolateModules(() => {
      a = express();
      a.use('/api/marketplace/v1/orders', require('../src/routes/marketplace-orders-v1.routes')({ resolveAccount: bearer }));
    });
    const res = await request(a).get('/api/marketplace/v1/orders').set('Authorization', 'Bearer buyer');
    if (saved !== undefined) process.env.MARKETPLACE_V1_ORDERS_ENABLED = saved;
    expect(res.status).toBe(503);
    expect(res.body.errorCode).toBe('ORDERS_UNAVAILABLE');
  });
});

describe('GET /api/marketplace/v1/orders/:id/codes', () => {
  const { MarketplaceOrderOrchestratorError } = require('../src/lib/marketplace-order-orchestrator');
  function codesApp(codesForAccount) {
    const a = express();
    a.use('/api/marketplace/v1/orders', require('../src/routes/marketplace-orders-v1.routes')({
      service: { codesForAccount, createOrder: jest.fn() }, resolveAccount: bearer }));
    return a;
  }

  it('entrega los códigos a la cuenta del Bearer, sin caché', async () => {
    const codesForAccount = jest.fn(async ({ orderId }) => ({ orderId, pickupPin: '123456', deliveryPin: '654321' }));
    const res = await request(codesApp(codesForAccount)).get('/api/marketplace/v1/orders/o1/codes').set('Authorization', 'Bearer buyer');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ orderId: 'o1', pickupPin: '123456', deliveryPin: '654321' });
    expect(codesForAccount).toHaveBeenCalledWith({ accountId: 'acc-1', orderId: 'o1' });
  });

  it('sin Bearer o con id de invitado no hay códigos; los errores del orquestador conservan su estado', async () => {
    const codesForAccount = jest.fn(async () => { throw new MarketplaceOrderOrchestratorError('ORDER_CLOSED', 'La orden ya termino', 409); });
    const a = codesApp(codesForAccount);
    expect((await request(a).get('/api/marketplace/v1/orders/o1/codes')).status).toBe(401);
    expect((await request(a).get('/api/marketplace/v1/orders/o1/codes').set('X-Buyer-Id', 'guest-browser')).status).toBe(401);
    expect(codesForAccount).not.toHaveBeenCalled();
    const closed = await request(a).get('/api/marketplace/v1/orders/o1/codes').set('Authorization', 'Bearer buyer');
    expect(closed.status).toBe(409);
    expect(closed.body.errorCode).toBe('ORDER_CLOSED');
  });
});

describe('adaptadores Prisma de Mis pedidos', () => {
  const at = minutes => new Date(Date.UTC(2026, 9, 30, 12, minutes));
  function fakePrisma({ quotes = [], orders = [], pipeline = null } = {}) {
    const calls = [];
    return {
      calls,
      marketplaceQuote: {
        async findMany(args) { calls.push(['quote.findMany', args]); return quotes.slice(0, args.take); },
        async findFirst(args) {
          calls.push(['quote.findFirst', args]);
          return quotes.find(q => q.orderId === args.where.orderId && q.accountId === args.where.accountId) ?? null;
        },
      },
      order: { async findMany(args) { calls.push(['order.findMany', args]); return orders.filter(o => args.where.id.in.includes(o.id)); } },
      marketplaceOrderPipeline: { async findFirst(args) { calls.push(['pipeline.findFirst', args]); return pipeline; } },
      driverLocation: { async findFirst() { return null; } },
    };
  }
  const quote = (n, extra = {}) => ({ orderId: `o${n}`, accountId: 'acc-1', consumedAt: at(60 - n), fulfillment: 'PICKUP', currency: 'MXN',
    itemsSnapshot: [{ menuItemId: `m${n}`, name: `Producto ${n}`, quantity: n, unitPriceCents: 1000, pin: 'PRIVADO' }],
    merchant: { name: `Tienda ${n}`, slug: `tienda-${n}` }, ...extra });
  const order = n => ({ id: `o${n}`, orderNumber: 100 + n, status: 'PREPARING', paymentStatus: 'PENDING', total: '123.5',
    createdAt: at(1), deliveryAddress: 'PRIVADA', customerPhone: 'PRIVADO', pickupPinHash: 'x'.repeat(64) });

  it('lista solo cotizaciones de la cuenta que ya son orden, con proyección explícita', async () => {
    const prisma = fakePrisma({ quotes: [quote(1), quote(2)], orders: [order(1), order(2)] });
    const { buyerOrders } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    const result = await buyerOrders.listForAccount({ accountId: 'acc-1', limit: 20 });
    const [findMany] = prisma.calls.find(c => c[0] === 'quote.findMany').slice(1);
    expect(findMany.where).toEqual({ accountId: 'acc-1', orderId: { not: null } });
    expect(findMany.orderBy).toEqual([{ consumedAt: 'desc' }, { id: 'desc' }]);
    expect(prisma.calls.find(c => c[0] === 'order.findMany')[1].where).toEqual({ id: { in: ['o1', 'o2'] }, source: 'MARKETPLACE' });
    expect(result).toEqual({ nextBefore: null, orders: [
      { orderId: 'o1', orderNumber: '101', status: 'PREPARING', paymentStatus: 'PENDING', total: '123.50', currency: 'MXN',
        fulfillment: 'PICKUP', placedAt: at(59).toISOString(), merchant: { name: 'Tienda 1', slug: 'tienda-1' },
        items: [{ menuItemId: 'm1', name: 'Producto 1', quantity: 1 }] },
      expect.objectContaining({ orderId: 'o2', orderNumber: '102' }),
    ] });
    const text = JSON.stringify(result);
    for (const secret of ['PRIVADO', 'PRIVADA', 'x'.repeat(64)]) expect(text).not.toContain(secret);
  });

  it('pagina hacia atrás con before y omite órdenes que ya no son del marketplace', async () => {
    const prisma = fakePrisma({ quotes: [quote(1), quote(2), quote(3)], orders: [order(1), order(3)] });
    const { buyerOrders } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    const first = await buyerOrders.listForAccount({ accountId: 'acc-1', limit: 2 });
    expect(first.orders.map(o => o.orderId)).toEqual(['o1']);
    expect(first.nextBefore).toBe(at(58).toISOString());
    await buyerOrders.listForAccount({ accountId: 'acc-1', limit: 2, before: new Date(first.nextBefore) });
    expect(prisma.calls.filter(c => c[0] === 'quote.findMany')[1][1].where.consumedAt).toEqual({ lt: at(58) });
    const empty = await createMarketplaceV1Adapters({ prisma: fakePrisma(), commissionBps: 1500 }).buyerOrders.listForAccount({ accountId: 'acc-1' });
    expect(empty).toEqual({ orders: [], nextBefore: null });
  });

  it('el seguimiento por cuenta exige la cotización de esa cuenta y no filtra por token', async () => {
    const pipeline = { orderId: 'o1', restaurantId: 'r1', trackingTokenHash: 'h'.repeat(64), trackingExpiresAt: at(90), dispatch: null,
      order: { id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', status: 'READY', orderType: 'TAKEOUT', deliveryDriverId: null } };
    const prisma = fakePrisma({ quotes: [quote(1)], pipeline });
    const { tracking } = createMarketplaceV1Adapters({ prisma, commissionBps: 1500 });
    const record = await tracking.taskStore.findByOrderIdForAccount({ orderId: 'o1', accountId: 'acc-1' });
    expect(record).toEqual(expect.objectContaining({ orderId: 'o1', accountId: 'acc-1' }));
    expect(prisma.calls.find(c => c[0] === 'pipeline.findFirst')[1].where).toEqual({ orderId: 'o1', order: { is: { source: 'MARKETPLACE' } } });
    expect(await tracking.taskStore.findByOrderIdForAccount({ orderId: 'o1', accountId: 'acc-2' })).toBeNull();
    expect(prisma.calls.filter(c => c[0] === 'pipeline.findFirst')).toHaveLength(1);
    // El seguimiento por token sigue filtrando por su hash.
    await tracking.taskStore.findByOrderId({ orderId: 'o1', trackingTokenHash: 'h'.repeat(64) });
    expect(prisma.calls.filter(c => c[0] === 'pipeline.findFirst')[1][1].where.trackingTokenHash).toBe('h'.repeat(64));
  });
});
