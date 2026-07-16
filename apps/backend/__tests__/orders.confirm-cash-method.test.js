'use strict';

// Tests de PUT /api/orders/:id/confirm-cash: liquidar un pendiente de cobro.
// El método es opcional y por defecto es CASH (efectivo que trae el repartidor).
// Para una "transferencia pendiente" el cajero confirma con paymentMethod:
// 'TRANSFER' y entonces NO debe contar como efectivo (no marca cashCollected ni
// abre el cajón) — de lo contrario descuadraría la caja del repartidor.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { update: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    cashShift: { findFirst: jest.fn() },
  },
}));

const mockKick = jest.fn(() => Promise.resolve());
jest.mock('../src/services/printer.service', () => ({
  kickCashDrawerForLocation: (...args) => mockKick(...args),
}));

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

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', orderRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.order.update.mockImplementation(async ({ data }) => ({
    id: 'o1', restaurantId: 'r1', locationId: 'loc1', orderNumber: 101, total: 250, ...data,
  }));
  // Cobro atribuye al turno abierto: por default, sin turno abierto (no estampa
  // shiftId, no altera las aserciones existentes de este archivo).
  prisma.order.findFirst.mockResolvedValue({ locationId: 'loc1' });
  prisma.cashShift.findFirst.mockResolvedValue(null);
});

describe('PUT /api/orders/:id/confirm-cash', () => {
  it('sin método: liquida como EFECTIVO (cashCollected) y abre el cajón', async () => {
    const res = await request(makeApp()).put('/api/orders/o1/confirm-cash').send({});
    expect(res.status).toBe(200);
    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.paymentMethod).toBe('CASH');
    expect(data.cashCollected).toBe(true);
    expect(data.cashCollectedAt).toBeInstanceOf(Date);
    expect(data.paymentStatus).toBe('PAID');
    expect(data.paidAt).toBeInstanceOf(Date);
    expect(data.status).toBe('DELIVERED');
    expect(mockKick).toHaveBeenCalledTimes(1);
  });

  it('método TRANSFER: marca PAGADO pero NO como efectivo y NO abre el cajón', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/confirm-cash')
      .send({ paymentMethod: 'TRANSFER' });
    expect(res.status).toBe(200);
    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.paymentMethod).toBe('TRANSFER');
    expect(data.cashCollected).toBe(false);
    expect(data.cashCollectedAt).toBeNull();
    expect(data.paymentStatus).toBe('PAID');
    expect(data.paidAt).toBeInstanceOf(Date);
    expect(mockKick).not.toHaveBeenCalled();
  });

  it('método inválido cae a EFECTIVO (no rompe la caja con un valor basura)', async () => {
    const res = await request(makeApp())
      .put('/api/orders/o1/confirm-cash')
      .send({ paymentMethod: 'BITCOIN' });
    expect(res.status).toBe(200);
    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.paymentMethod).toBe('CASH');
    expect(data.cashCollected).toBe(true);
    expect(mockKick).toHaveBeenCalledTimes(1);
  });
});
