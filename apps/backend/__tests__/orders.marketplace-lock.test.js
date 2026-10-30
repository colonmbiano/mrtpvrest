'use strict';

// Pedidos del marketplace en el TPV: la caja no edita sus productos ni montos (agregar,
// cambiar cantidad, quitar, descuento, dividir, juntar, cambiar tipo) y no los cobra si
// aún no se aceptan o si ya se pagaron en línea. Prisma va mockeado: sin BD.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    orderItem: { findUnique: jest.fn() },
    table: { update: jest.fn() },
    stockMovement: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: 'CASHIER' };
    req.restaurantId = 'r1';
    req.locationId = 'l1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));
jest.mock('../src/middleware/shift.middleware', () => ({ requireActiveShift: (_req, _res, next) => next() }));
jest.mock('../src/services/notifications.service', () => ({ notifyOrderStatus: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../src/lib/print-claim', () => ({ claimKitchenPrint: jest.fn(), releaseKitchenPrint: jest.fn() }));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { marketplaceEditBlock, marketplaceChargeBlock } = require('../src/lib/marketplace-order-lock');
const ordersRoutes = require('../src/routes/orders.routes');

const MARKET = { id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', status: 'CONFIRMED',
  paymentStatus: 'PENDING', subtotal: 177.5, discount: 0, deliveryFee: 25, total: 202.5, items: [] };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', ordersRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.order.findFirst.mockResolvedValue({ ...MARKET });
  prisma.order.findUnique.mockResolvedValue({ ...MARKET });
  prisma.orderItem.findUnique.mockResolvedValue({ id: 'i1', orderId: 'o1', quantity: 1, roundId: null, modifiers: [], order: { ...MARKET } });
  prisma.$transaction.mockImplementation(work => work(prisma));
});

describe('reglas :: pedidos del marketplace en caja', () => {
  it('solo se bloquea el marketplace; los demás canales siguen igual', () => {
    expect(marketplaceEditBlock({ source: 'TPV' })).toBeNull();
    expect(marketplaceEditBlock({ source: 'ONLINE', status: 'PENDING' })).toBeNull();
    expect(marketplaceEditBlock({ source: 'MARKETPLACE' }).body.code).toBe('MARKETPLACE_ORDER_LOCKED');
    expect(marketplaceChargeBlock({ source: 'ONLINE', paymentStatus: 'PAID' })).toBeNull();
    expect(marketplaceChargeBlock(null)).toBeNull();
  });

  it('cobro en caja: no por aceptar ni esperando pago ni ya pagado; sí aceptado en efectivo', () => {
    expect(marketplaceChargeBlock({ source: 'MARKETPLACE', status: 'PENDING_MERCHANT' }).body.code).toBe('MARKETPLACE_NOT_ACCEPTED');
    expect(marketplaceChargeBlock({ source: 'MARKETPLACE', status: 'PENDING_PAYMENT' }).body.code).toBe('MARKETPLACE_NOT_ACCEPTED');
    expect(marketplaceChargeBlock({ source: 'MARKETPLACE', status: 'READY', paymentStatus: 'PAID' }).body.code).toBe('MARKETPLACE_ALREADY_PAID');
    expect(marketplaceChargeBlock({ source: 'MARKETPLACE', status: 'READY', paymentStatus: 'PENDING' })).toBeNull();
  });
});

describe('rutas :: la caja no edita productos de un pedido del marketplace', () => {
  const cases = [
    ['agregar productos', app => request(app).post('/api/orders/o1/items').send({ items: [{ menuItemId: 'm1', quantity: 1 }] })],
    ['cambiar cantidad', app => request(app).put('/api/orders/items/i1').send({ quantity: 3 })],
    ['quitar producto', app => request(app).delete('/api/orders/items/i1')],
    ['quitar un extra', app => request(app).delete('/api/orders/items/i1/modifiers/mod1')],
    ['descuento', app => request(app).put('/api/orders/o1/discount').send({ type: 'fixed', value: 10 })],
    ['cambiar tipo', app => request(app).patch('/api/orders/o1/type').send({ type: 'TAKEOUT' })],
    ['juntar cuentas', app => request(app).post('/api/orders/o2/merge/o1')],
    ['dividir cuenta', app => request(app).post('/api/orders/o1/split').send({ items: [{ id: 'i1', quantity: 1 }] })],
  ];
  it.each(cases)('%s responde 409 MARKETPLACE_ORDER_LOCKED', async (_name, call) => {
    if (_name === 'juntar cuentas') {
      prisma.order.findUnique.mockImplementation(async ({ where }) => (where.id === 'o1' ? { ...MARKET }
        : { ...MARKET, id: 'o2', source: 'TPV' }));
    }
    const res = await call(makeApp());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('MARKETPLACE_ORDER_LOCKED');
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('rutas :: cobro en caja de un pedido del marketplace', () => {
  it('por aceptar o ya pagado en línea no se cobra', async () => {
    prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, status: 'PENDING_MERCHANT' });
    const early = await request(makeApp()).put('/api/orders/o1/payment').send({ paymentMethod: 'CASH' });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('MARKETPLACE_NOT_ACCEPTED');
    prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, status: 'READY', paymentStatus: 'PAID' });
    const paid = await request(makeApp()).put('/api/orders/o1/payment').send({ paymentMethod: 'CASH' });
    expect(paid.status).toBe(409);
    expect(paid.body.code).toBe('MARKETPLACE_ALREADY_PAID');
    // Se revisa dentro de la transacción del cobro, antes de escribir nada.
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
