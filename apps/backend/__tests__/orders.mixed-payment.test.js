'use strict';

// Tests de PUT /api/orders/:id/payment con COBRO MIXTO (split-tender): la orden
// se paga con >1 método a la vez. El servidor re-valida que los renglones cuadren
// con el total REAL de la orden y persiste un payment_transactions por método
// dentro de la misma $transaction que cierra la orden.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { update: jest.fn(), findFirst: jest.fn() },
    paymentTransaction: { deleteMany: jest.fn(), createMany: jest.fn() },
    cashShift: { findFirst: jest.fn() },
  };
  return {
    prisma: {
      order: { findFirst: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Cajero', restaurantId: 'r1', tenantId: 't1', role: 'CASHIER' };
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));

jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const orderRoutes = require('../src/routes/orders.routes');

const tx = prisma.__tx;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.order.update.mockImplementation(async ({ data }) => ({
    id: 'o1', restaurantId: 'r1', locationId: 'loc1', ...data,
  }));
  // Cobro atribuye al turno abierto: por default, sin turno abierto (no estampa
  // shiftId, no altera las aserciones existentes de este archivo).
  tx.order.findFirst.mockResolvedValue({ locationId: 'loc1' });
  tx.cashShift.findFirst.mockResolvedValue(null);
});

describe('PUT /:id/payment · cobro mixto', () => {
  test('renglones que cuadran → MIXED, crea payment_transactions, cobra efectivo', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', total: 300 });
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ payments: [{ method: 'CASH', amount: 180 }, { method: 'CARD', amount: 120 }] });

    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe('MIXED');
    expect(res.body.paymentStatus).toBe('PAID');
    expect(res.body.cashCollected).toBe(true);

    // Re-cobro idempotente: borra renglones previos y reescribe el desglose.
    expect(tx.paymentTransaction.deleteMany).toHaveBeenCalledWith({ where: { orderId: 'o1' } });
    expect(tx.paymentTransaction.createMany).toHaveBeenCalledTimes(1);
    const created = tx.paymentTransaction.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(2);
    expect(created.map((p) => [p.method, p.amount])).toEqual([['CASH', 180], ['CARD', 120]]);
    expect(created.every((p) => p.status === 'PAID' && p.gateway === 'MANUAL')).toBe(true);
  });

  test('sin efectivo en la mezcla → cashCollected false', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', total: 300 });
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ payments: [{ method: 'CARD', amount: 200 }, { method: 'TRANSFER', amount: 100 }] });

    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe('MIXED');
    expect(res.body.cashCollected).toBe(false);
  });

  test('propina: la suma debe cuadrar con total + tip; se persiste la propina', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', total: 300 });
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ payments: [{ method: 'CASH', amount: 130 }, { method: 'CARD', amount: 200 }], tip: 30 });

    expect(res.status).toBe(200);
    expect(res.body.tip).toBe(30);
  });

  test('renglones que NO cuadran → 400 TENDER_MISMATCH, sin tocar la orden', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', total: 300 });
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ payments: [{ method: 'CASH', amount: 100 }, { method: 'CARD', amount: 50 }] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TENDER_MISMATCH');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.order.update).not.toHaveBeenCalled();
  });

  test('orden inexistente con payments → 404', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    const res = await request(makeApp())
      .put('/api/orders/oX/payment')
      .send({ payments: [{ method: 'CASH', amount: 300 }] });

    expect(res.status).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('método único legacy → no crea payment_transactions', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(200);
    expect(res.body.paymentMethod).toBe('CASH');
    expect(res.body.cashCollected).toBe(true);
    // Sin renglones: no se re-lee la orden ni se escriben payment_transactions.
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    expect(tx.paymentTransaction.createMany).not.toHaveBeenCalled();
  });

  test('body vacío (ni método ni payments) → 400 de validación', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({});
    expect(res.status).toBe(400);
  });
});
