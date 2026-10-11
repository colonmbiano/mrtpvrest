'use strict';

// Tests de PUT /api/orders/:id/correct-payment-method: corregir el método de
// pago de una orden YA pagada y reconciliar la caja del repartidor en la misma
// transacción (crear/quitar el movimiento DELIVERY/INCOME ligado a la orden,
// respetando cortes ya cerrados).

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { update: jest.fn() },
    driverCashMovement: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  return {
    prisma: {
      order: { findUnique: jest.fn() },
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

// Orden base: delivery PAGADA por transferencia, con repartidor asignado.
function baseOrder(overrides = {}) {
  return {
    id: 'o1',
    restaurantId: 'r1',
    locationId: 'loc1',
    orderNumber: 101,
    total: 250,
    paymentStatus: 'PAID',
    paymentMethod: 'TRANSFER',
    deliveryDriverId: 'd1',
    cashCollectedAt: null,
    cashCollectedBy: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  tx.order.update.mockImplementation(async ({ data }) => ({ id: 'o1', ...data }));
});

describe('PUT /api/orders/:id/correct-payment-method', () => {
  test('TRANSFER → CASH crea el movimiento DELIVERY/INCOME en la caja del repartidor', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    tx.driverCashMovement.findFirst.mockResolvedValue(null);
    tx.driverCashMovement.create.mockResolvedValue({ id: 'm1' });

    const res = await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'CASH' })
      .expect(200);

    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'o1' },
      data: expect.objectContaining({ paymentMethod: 'CASH', cashCollected: true }),
    }));
    expect(tx.driverCashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        driverId: 'd1', type: 'INCOME', category: 'DELIVERY', amount: 250, orderId: 'o1',
      }),
    }));
    expect(res.body.cashAdjusted).toBe('created');
  });

  test('no duplica el ingreso si ya existe un movimiento para esa orden', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder());
    tx.driverCashMovement.findFirst.mockResolvedValue({ id: 'm1', approved: false });

    const res = await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'CASH' })
      .expect(200);

    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(res.body.cashAdjusted).toBe('exists');
  });

  test('CASH → TRANSFER retira el movimiento si el corte aún no se cierra', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder({ paymentMethod: 'CASH' }));
    tx.driverCashMovement.findFirst.mockResolvedValue({ id: 'm1', approved: false });

    const res = await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'TRANSFER' })
      .expect(200);

    expect(tx.driverCashMovement.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: 'TRANSFER', cashCollected: false }),
    }));
    expect(res.body.cashAdjusted).toBe('removed');
  });

  test('CASH → TRANSFER NO toca un corte ya cerrado (movimiento aprobado)', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder({ paymentMethod: 'CASH' }));
    tx.driverCashMovement.findFirst.mockResolvedValue({ id: 'm1', approved: true });

    const res = await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'TRANSFER' })
      .expect(200);

    expect(tx.driverCashMovement.delete).not.toHaveBeenCalled();
    expect(res.body.cashAdjusted).toBe('locked');
  });

  test('orden sin liquidar (PENDING): corrige el método sin tocar la caja del repartidor', async () => {
    // Efectivo sin liquidar marcado por error: un admin lo corrige a transferencia
    // ANTES de cobrar. Solo cambia la etiqueta; no marca cobrada ni mueve la caja.
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({ paymentMethod: 'CASH', paymentStatus: 'PENDING' }),
    );

    const res = await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'TRANSFER' })
      .expect(200);

    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: 'TRANSFER', cashCollected: false }),
    }));
    // La caja del repartidor no se toca: la orden aún no se ha liquidado.
    expect(tx.driverCashMovement.findFirst).not.toHaveBeenCalled();
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
    expect(tx.driverCashMovement.delete).not.toHaveBeenCalled();
    expect(res.body.cashAdjusted).toBeNull();
  });

  test('rechaza corregir una orden cancelada', async () => {
    prisma.order.findUnique.mockResolvedValue(
      baseOrder({ paymentMethod: 'CASH', status: 'CANCELLED' }),
    );

    await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'TRANSFER' })
      .expect(400);

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  test('rechaza si el método nuevo es igual al actual', async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder({ paymentMethod: 'CASH' }));

    await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'CASH' })
      .expect(400);
  });

  test('rechaza un método inválido', async () => {
    await request(makeApp())
      .put('/api/orders/o1/correct-payment-method')
      .send({ paymentMethod: 'BITCOIN' })
      .expect(400);

    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
