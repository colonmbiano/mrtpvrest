'use strict';

// Pedido de mesa por confirmar (QR desde internet a una mesa libre, ver
// store.routes POST /orders): la caja lo acepta o lo rechaza con
// PUT /api/orders/:id/status.
//
// - Aceptar quita la marca, ocupa la mesa y AHORA sí emite order:new para que
//   cocina/KDS lo vean y la tablet imprima la comanda.
// - Rechazar lo cancela SIN liberar la mesa: nunca la ocupó y quizá ya hay gente
//   sentada con otra cuenta.
// - Mientras espera, ninguna tablet puede reclamar su impresión de cocina.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findFirst: jest.fn(), update: jest.fn() },
    table: { update: jest.fn() },
    stockMovement: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
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

jest.mock('../src/services/notifications.service', () => ({
  notifyOrderStatus: jest.fn().mockResolvedValue(undefined),
  notifyDriversNewDeliveryOrder: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/lib/audit-logger', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  AUDIT_EVENTS: { ORDER_CANCEL: 'ORDER_CANCEL' },
}));

jest.mock('../src/lib/print-claim', () => ({
  claimKitchenPrint: jest.fn().mockResolvedValue(true),
  releaseKitchenPrint: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { claimKitchenPrint } = require('../src/lib/print-claim');
const orderRoutes = require('../src/routes/orders.routes');

function fakeIo() {
  const emitted = [];
  return {
    emitted,
    to: (room) => ({ emit: (event) => emitted.push({ room, event }) }),
  };
}

function makeApp(io) {
  const app = express();
  app.use(express.json());
  if (io) app.set('io', io);
  app.use('/api/orders', orderRoutes);
  return app;
}

const ORDER = {
  id: 'o1', restaurantId: 'r1', locationId: 'loc1', tableId: 't7',
  orderType: 'DINE_IN', orderNumber: 3001, total: 140,
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.order.update.mockImplementation(async ({ data }) => ({ ...ORDER, ...data }));
  prisma.table.update.mockResolvedValue({});
  prisma.stockMovement.findMany.mockResolvedValue([]);
});

const newOrderRooms = (io) => io.emitted.filter((e) => e.event === 'order:new').map((e) => e.room);

describe('PUT /api/orders/:id/status · mesa por confirmar', () => {
  test('aceptar: quita la marca, ocupa la mesa y manda el pedido a cocina', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PENDING', awaitingTableConfirmation: true });
    const io = fakeIo();

    const res = await request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'CONFIRMED', awaitingTableConfirmation: false },
    });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't7' }, data: { status: 'OCCUPIED' } });
    expect(newOrderRooms(io)).toEqual([
      'restaurant:r1:kitchen',
      'restaurant:r1:location:loc1:admins',
      'restaurant:r1:location:loc1:kitchen',
    ]);
  });

  test('aceptar un pedido que ya quedó CONFIRMED por otro camino también lo resuelve', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'CONFIRMED', awaitingTableConfirmation: true });
    const io = fakeIo();

    const res = await request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });

    expect(res.status).toBe(200);
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ status: 'CONFIRMED', awaitingTableConfirmation: false });
    expect(newOrderRooms(io)).toHaveLength(3);
  });

  test('rechazar: cancela sin liberar la mesa y sin mandar nada a cocina', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PENDING', awaitingTableConfirmation: true });
    const io = fakeIo();

    const res = await request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: 'CANCELLED', awaitingTableConfirmation: false },
    });
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(newOrderRooms(io)).toEqual([]);
  });

  test('un pedido normal de mesa cancelado sí libera la mesa (sin cambios)', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PENDING', awaitingTableConfirmation: false });
    const io = fakeIo();

    const res = await request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CANCELLED' });

    expect(res.status).toBe(200);
    expect(prisma.order.update.mock.calls[0][0].data).toEqual({ status: 'CANCELLED' });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't7' }, data: { status: 'AVAILABLE' } });
    expect(newOrderRooms(io)).toEqual([]);
  });

  test('un pedido normal confirmado no re-emite order:new', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', status: 'PENDING', awaitingTableConfirmation: false });
    const io = fakeIo();

    await request(makeApp(io)).put('/api/orders/o1/status').send({ status: 'CONFIRMED' });

    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(newOrderRooms(io)).toEqual([]);
  });
});

describe('POST /api/orders/:id/claim-kitchen-print · mesa por confirmar', () => {
  test('mientras espera confirmación nadie reclama la comanda', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', awaitingTableConfirmation: true });

    const res = await request(makeApp()).post('/api/orders/o1/claim-kitchen-print');

    expect(res.body).toEqual({ claimed: false, reason: 'TABLE_CONFIRMATION_PENDING' });
    expect(claimKitchenPrint).not.toHaveBeenCalled();
  });

  test('ya confirmado, el reclamo sigue el camino normal', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1', awaitingTableConfirmation: false });

    const res = await request(makeApp()).post('/api/orders/o1/claim-kitchen-print');

    expect(res.body).toEqual({ claimed: true });
    expect(claimKitchenPrint).toHaveBeenCalledWith('r1:o1');
  });
});
