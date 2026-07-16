'use strict';

// Atribución del cobro al turno ABIERTO (no al de creación de la cuenta).
//
// Bug que cubre: una cuenta abierta en un turno y cobrada en OTRO (mesa que
// quedó a deber y se salda días después, o un merge hacia una cuenta vieja)
// quedaba pegada al turno de creación —ya cerrado— y su dinero no entraba a
// NINGÚN corte. El cobro debe (re)estampar Order.shiftId con el turno abierto
// de la sucursal en el momento de cobrar. Ver openShiftIdForCobro.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    order: { update: jest.fn(), findFirst: jest.fn() },
    paymentTransaction: { deleteMany: jest.fn(), createMany: jest.fn() },
    cashShift: { findFirst: jest.fn() },
  };
  return {
    prisma: {
      order: { findFirst: jest.fn(), update: jest.fn() },
      cashShift: { findFirst: jest.fn() },
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
const { openShiftIdForCobro } = orderRoutes;

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
  tx.order.findFirst.mockResolvedValue({ locationId: 'loc1' });
});

describe('openShiftIdForCobro', () => {
  test('devuelve el id del turno ABIERTO de la sucursal', async () => {
    const client = { cashShift: { findFirst: jest.fn().mockResolvedValue({ id: 'shiftNOW' }) } };
    const id = await openShiftIdForCobro(client, 'loc1');
    expect(id).toBe('shiftNOW');
    // Debe filtrar por sucursal + turno abierto.
    const where = client.cashShift.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ locationId: 'loc1', isOpen: true });
  });

  test('sin turno abierto → null (el caller NO pisa el shiftId existente)', async () => {
    const client = { cashShift: { findFirst: jest.fn().mockResolvedValue(null) } };
    expect(await openShiftIdForCobro(client, 'loc1')).toBeNull();
  });

  test('sin locationId → null y no consulta la BD', async () => {
    const client = { cashShift: { findFirst: jest.fn() } };
    expect(await openShiftIdForCobro(client, null)).toBeNull();
    expect(client.cashShift.findFirst).not.toHaveBeenCalled();
  });
});

describe('PUT /:id/payment · atribución de turno', () => {
  test('re-estampa shiftId con el turno ABIERTO al cobrar', async () => {
    tx.cashShift.findFirst.mockResolvedValue({ id: 'shiftNOW' });

    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CARD' });

    expect(res.status).toBe(200);
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data.shiftId).toBe('shiftNOW');
    expect(res.body.shiftId).toBe('shiftNOW');
  });

  test('sin turno abierto → NO toca shiftId (no lo pisa con null)', async () => {
    tx.cashShift.findFirst.mockResolvedValue(null);

    const res = await request(makeApp())
      .put('/api/orders/o1/payment')
      .send({ paymentMethod: 'CASH' });

    expect(res.status).toBe(200);
    const data = tx.order.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('shiftId');
  });
});
