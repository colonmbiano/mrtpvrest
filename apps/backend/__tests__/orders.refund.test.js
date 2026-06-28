'use strict';

// Tests de POST /api/orders/:id/refund: reembolsar un ticket YA cobrado (total o
// parcial) por un error de cobro, validando el monto server-side, el guard
// atómico anti-doble-reembolso y el cuadre de caja (ShiftExpense del cajón o
// DriverCashMovement EXPENSE del repartidor) en la misma $transaction.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { updateMany: jest.fn(), findUnique: jest.fn() },
    driverCashMovement: { create: jest.fn() },
    cashShift: { findFirst: jest.fn() },
    shiftExpense: { create: jest.fn() },
  };
  return {
    prisma: {
      order: { findFirst: jest.fn() },
      // restoreInventoryForCancelledOrder lee de aquí; [] ⇒ no-op.
      stockMovement: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', name: 'Dueño', restaurantId: 'r1', tenantId: 't1', role: 'OWNER' };
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

// El reembolso audita ORDER_REFUND; aislamos el logger (la BD está mockeada).
jest.mock('../src/lib/audit-logger', () => ({
  AUDIT_EVENTS: { ORDER_REFUND: 'ORDER_REFUND' },
  record: jest.fn(async () => ({ id: 'a1' })),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const audit = require('../src/lib/audit-logger');
const orderRoutes = require('../src/routes/orders.routes');

const tx = prisma.__tx;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  return app;
}

// Orden base: venta de mostrador PAGADA en efectivo, sin reembolsos previos.
function baseOrder(overrides = {}) {
  return {
    id: 'o1',
    restaurantId: 'r1',
    locationId: 'loc1',
    orderNumber: 101,
    total: 200,
    refundedAmount: 0,
    paymentStatus: 'PAID',
    paymentMethod: 'CASH',
    cashCollected: true,
    deliveryDriverId: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.order.updateMany.mockResolvedValue({ count: 1 });
  tx.order.findUnique.mockImplementation(async () => ({ id: 'o1', paymentStatus: 'REFUNDED' }));
  tx.driverCashMovement.create.mockResolvedValue({ id: 'm1' });
  tx.shiftExpense.create.mockResolvedValue({ id: 'e1' });
  tx.cashShift.findFirst.mockResolvedValue({ id: 's1' });
  prisma.stockMovement.findMany.mockResolvedValue([]);
});

describe('POST /api/orders/:id/refund', () => {
  test('reembolso TOTAL en efectivo de mostrador → ShiftExpense REFUND + paymentStatus REFUNDED', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Cobré de más' })
      .expect(200);

    // Sin `amount` ⇒ reembolsa el saldo restante (total).
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'o1', restaurantId: 'r1', paymentStatus: 'PAID' }),
      data: expect.objectContaining({
        refundedAmount: { increment: 200 },
        paymentStatus: 'REFUNDED',
      }),
    }));
    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shiftId: 's1', amount: 200, category: 'REFUND' }),
    }));
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(res.body.refund).toEqual(expect.objectContaining({ amount: 200, type: 'FULL', method: 'CASH' }));
    expect(res.body.shiftAdjusted).toBe('expense_created');
    expect(res.body.cashAdjusted).toBeNull();
  });

  test('reembolso TOTAL repone inventario (best-effort)', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());

    await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Error' })
      .expect(200);

    expect(prisma.stockMovement.findMany).toHaveBeenCalled();
  });

  test('reembolso PARCIAL no marca REFUNDED ni repone inventario', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ amount: 50, reason: 'Producto faltante' })
      .expect(200);

    const data = tx.order.updateMany.mock.calls[0][0].data;
    expect(data.refundedAmount).toEqual({ increment: 50 });
    expect(data.paymentStatus).toBeUndefined(); // sigue PAID
    expect(tx.shiftExpense.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ amount: 50, category: 'REFUND' }),
    }));
    expect(prisma.stockMovement.findMany).not.toHaveBeenCalled();
    expect(res.body.refund.type).toBe('PARTIAL');
  });

  test('delivery cobrado en efectivo por repartidor → DriverCashMovement EXPENSE/DELIVERY', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ deliveryDriverId: 'd1' }));

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Cliente devolvió' })
      .expect(200);

    expect(tx.driverCashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        driverId: 'd1', type: 'EXPENSE', category: 'DELIVERY', amount: 200, orderId: 'o1',
      }),
    }));
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(res.body.cashAdjusted).toBe('created');
  });

  test('efectivo de mostrador sin turno abierto → no_open_shift (el reembolso igual se aplica)', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());
    tx.cashShift.findFirst.mockResolvedValue(null);

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Error' })
      .expect(200);

    expect(tx.order.updateMany).toHaveBeenCalled();
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(res.body.shiftAdjusted).toBe('no_open_shift');
  });

  test('reembolso por TRANSFERENCIA no mueve efectivo físico', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ paymentMethod: 'TRANSFER', cashCollected: false }));

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Devolución bancaria' })
      .expect(200);

    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(res.body.refund.method).toBe('TRANSFER');
    expect(res.body.shiftAdjusted).toBeNull();
    expect(res.body.cashAdjusted).toBeNull();
  });

  test('el monto NUNCA confía del cliente: rechaza un reembolso que excede el saldo', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ amount: 500, reason: 'Error' })
      .expect(400);

    expect(res.body.code).toBe('REFUND_EXCEEDS_TOTAL');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('respeta lo ya reembolsado: parcial previo limita el saldo disponible', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ refundedAmount: 150 }));

    // Quedan 50; pedir 80 excede.
    await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ amount: 80, reason: 'Error' })
      .expect(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('orden ya reembolsada por completo → 409', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ refundedAmount: 200 }));

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Error' })
      .expect(409);

    expect(res.body.code).toBe('ALREADY_REFUNDED');
  });

  test('guard atómico: si la fila ya no cumple la condición → 409 REFUND_CONFLICT', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());
    tx.order.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Error' })
      .expect(409);

    expect(res.body.code).toBe('REFUND_CONFLICT');
    expect(tx.shiftExpense.create).not.toHaveBeenCalled();
  });

  test('rechaza una orden que no está pagada', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder({ paymentStatus: 'PENDING' }));

    await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ reason: 'Error' })
      .expect(400);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('exige motivo (auditoría)', async () => {
    await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ amount: 50 })
      .expect(400);

    expect(prisma.order.findFirst).not.toHaveBeenCalled();
  });

  test('audita ORDER_REFUND con monto, tipo y motivo', async () => {
    prisma.order.findFirst.mockResolvedValue(baseOrder());

    await request(makeApp())
      .post('/api/orders/o1/refund')
      .send({ amount: 50, reason: 'Sobrecobro' })
      .expect(200);

    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      'ORDER_REFUND',
      expect.objectContaining({
        reason: 'Sobrecobro',
        after: expect.objectContaining({ amount: 50, type: 'PARTIAL' }),
      }),
    );
  });
});
