'use strict';

jest.mock('../src/services/order-inventory.service', () => ({
  ...jest.requireActual('../src/services/order-inventory.service'),
  consumePaidOrder: jest.fn().mockResolvedValue(undefined),
}));

// Tests de PUT /api/orders/:id/confirm-cash: liquidar un pendiente de cobro.
// El método es opcional y por defecto es CASH (efectivo que trae el repartidor).
// Para una "transferencia pendiente" el cajero confirma con paymentMethod:
// 'TRANSFER' y entonces NO debe contar como efectivo (no marca cashCollected ni
// abre el cajón) — de lo contrario descuadraría la caja del repartidor.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn() },
    driverCashMovement: { findFirst: jest.fn() },
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

let mockOrder;
beforeEach(() => {
  jest.clearAllMocks();
  mockOrder = { id: 'o1', restaurantId: 'r1', locationId: 'loc1', orderNumber: '101',
    total: 250, status: 'DELIVERED', paymentStatus: 'PENDING', paymentMethod: 'CASH', paidAt: null };
  prisma.$transaction = jest.fn(work => work(prisma));
  prisma.order.findFirst.mockImplementation(async () => ({ ...mockOrder }));
  prisma.order.updateMany.mockImplementation(async ({ data }) => {
    Object.assign(mockOrder, data); return { count: 1 };
  });
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'shift1' });
  prisma.driverCashMovement.findFirst.mockResolvedValue(null);
});

describe('PUT /api/orders/:id/confirm-cash', () => {
  it('sin método: liquida como EFECTIVO (cashCollected) y abre el cajón', async () => {
    const res = await request(makeApp()).put('/api/orders/o1/confirm-cash').send({});
    expect(res.status).toBe(200);
    const data = prisma.order.updateMany.mock.calls[0][0].data;
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
    const data = prisma.order.updateMany.mock.calls[0][0].data;
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
    const data = prisma.order.updateMany.mock.calls[0][0].data;
    expect(data.paymentMethod).toBe('CASH');
    expect(data.cashCollected).toBe(true);
    expect(mockKick).toHaveBeenCalledTimes(1);
  });
});

test('reintento de un cobro pagado conserva turno y fecha sin abrir el cajón', async () => {
  Object.assign(mockOrder, { paymentStatus: 'PAID', shiftId: 'saturday', paidAt: new Date('2026-11-08T06:31:00Z') });
  const res = await request(makeApp()).put('/api/orders/o1/confirm-cash').send({}).expect(200);
  expect(res.body.shiftId).toBe('saturday');
  expect(res.body.paidAt).toBe('2026-11-08T06:31:00.000Z');
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
  expect(mockKick).not.toHaveBeenCalled();
});

test('un cobro pagado no permite cambiar de método por confirm-cash', async () => {
  Object.assign(mockOrder, { paymentStatus: 'PAID', paidAt: new Date() });
  await request(makeApp()).put('/api/orders/o1/confirm-cash').send({ paymentMethod: 'TRANSFER' }).expect(409);
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
});

test('un corte legacy aprobado recupera su fecha y turno; no entra al turno de hoy', async () => {
  mockOrder.deliveryDriverId = 'd1';
  const original = new Date('2026-11-08T06:31:00Z');
  prisma.driverCashMovement.findFirst.mockResolvedValue({ amount: 250, approvedAt: original });
  prisma.cashShift.findFirst.mockResolvedValue({ id: 'saturday' });
  const res = await request(makeApp()).put('/api/orders/o1/confirm-cash').send({}).expect(200);
  expect(res.body.shiftId).toBe('saturday');
  expect(res.body.paidAt).toBe(original.toISOString());
  expect(mockKick).not.toHaveBeenCalled();
  expect(prisma.cashShift.findFirst.mock.calls[0][0].where.openedAt).toEqual({ lte: original });
});

test('sin turno abierto no marca el cobro en un turno cerrado', async () => {
  prisma.cashShift.findFirst.mockResolvedValue(null);
  await request(makeApp()).put('/api/orders/o1/confirm-cash').send({}).expect(409);
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
});

test('un cobro concurrente que pierde el guard no se vuelve a confirmar', async () => {
  prisma.order.updateMany.mockResolvedValue({ count: 0 });
  await request(makeApp()).put('/api/orders/o1/confirm-cash').send({}).expect(409);
  expect(mockKick).not.toHaveBeenCalled();
});

test('confirm-payment tampoco puede volver a fechar o mover un cobro liquidado', async () => {
  Object.assign(mockOrder, { paymentStatus: 'PAID', shiftId: 'saturday', paidAt: new Date('2026-11-08T06:31:00Z') });
  const res = await request(makeApp()).post('/api/orders/o1/confirm-payment').send({}).expect(200);
  expect(res.body.order.shiftId).toBe('saturday');
  expect(res.body.order.paidAt).toBe('2026-11-08T06:31:00.000Z');
  expect(prisma.order.updateMany).not.toHaveBeenCalled();
});
