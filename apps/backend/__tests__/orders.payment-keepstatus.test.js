'use strict';

// Tests del flag `keepStatus` en PUT /api/orders/:id/payment.
//
// El cobro desde el kanban del admin marca la orden PAID pero NO la salta a
// DELIVERED (un pedido puede pagarse por anticipado sin haberse entregado).
// Sin el flag, el cobro cierra la orden en DELIVERED (comportamiento del TPV),
// por lo que el default no cambia para ningún caller existente.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { update: jest.fn() },
    paymentTransaction: { deleteMany: jest.fn(), createMany: jest.fn() },
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
    id: 'o1', restaurantId: 'r1', locationId: 'loc1', status: 'PREPARING', ...data,
  }));
});

describe('PUT /:id/payment · keepStatus', () => {
  test('keepStatus:true → marca PAID sin forzar DELIVERED (conserva el estado)', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CASH', keepStatus: true });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('PAID');
    expect(res.body.cashCollected).toBe(true);
    // El estado NO se toca: el mock arranca en PREPARING y así se queda.
    expect(res.body.status).toBe('PREPARING');
    // El update no debe incluir la clave `status` en su data.
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
    expect(data.paymentStatus).toBe('PAID');
  });

  test('sin keepStatus → sigue cerrando en DELIVERED (default del TPV)', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(200);
    expect(res.body.paymentStatus).toBe('PAID');
    expect(res.body.status).toBe('DELIVERED');
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.status).toBe('DELIVERED');
  });

  test('keepStatus:true emite el socket order:updated con el estado conservado', async () => {
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    const app = makeApp();
    app.set('io', { to });

    const res = await request(app)
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CARD', keepStatus: true });

    expect(res.status).toBe(200);
    expect(to).toHaveBeenCalledWith('restaurant:r1:location:loc1:admins');
    expect(emit).toHaveBeenCalledWith('order:updated', expect.objectContaining({
      id: 'o1', paymentStatus: 'PAID', status: 'PREPARING',
    }));
  });
});
