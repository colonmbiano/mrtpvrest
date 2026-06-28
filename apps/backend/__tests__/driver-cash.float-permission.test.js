'use strict';

// Permiso de POST /:driverId/float (asignar fondo de cambio desde el modal del
// TPV). El endpoint debe aceptar a quien gestiona la caja del repartidor:
// roles financieros O un cajero con el permiso granular `manage_driver_cash`
// (requireDriverCashManager) — NO requireAdmin. Antes el cajero recibía 403
// aunque el front ya le mostraba el modal "Asignar fondo".
//
// authenticate se mockea para derivar req.user de headers de prueba; el gate
// requireDriverCashManager es interno del router (no se mockea), así que estos
// tests ejercitan el gate real.

jest.mock('@mrtpvrest/database', () => {
  const tx = {
    driverCashMovement: { create: jest.fn(async (a) => ({ id: 'm1', ...a.data })) },
    shiftCashIn: { create: jest.fn(async () => ({ id: 'sci1' })) },
    cashShift: { update: jest.fn(async () => ({})) },
  };
  return {
    prisma: {
      employee: { findFirst: jest.fn() },
      cashShift: { findFirst: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(tx)),
      __tx: tx,
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = {
      id: 'u1',
      name: 'Cajero',
      restaurantId: 'r1',
      role: req.headers['x-test-role'] || 'CASHIER',
      canManageDriverCash: req.headers['x-test-perm'] === '1',
    };
    req.restaurantId = 'r1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const driverCashRoutes = require('../src/routes/driver-cash.routes');

const tx = prisma.__tx;

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/driver-cash', driverCashRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Mau', locationId: 'loc1' });
  prisma.cashShift.findFirst.mockResolvedValue(null); // sin turno → solo crea el FLOAT
});

describe('POST /:driverId/float — permiso (requireDriverCashManager)', () => {
  test('cajero SIN manage_driver_cash → 403', async () => {
    const res = await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .set('x-test-role', 'CASHIER')
      .send({ amount: 500, source: 'EXTERNO' })
      .expect(403);

    expect(res.body.requiredPermission).toBe('manage_driver_cash');
    expect(tx.driverCashMovement.create).not.toHaveBeenCalled();
  });

  test('cajero CON manage_driver_cash → asigna el fondo (200)', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .set('x-test-role', 'CASHIER')
      .set('x-test-perm', '1')
      .send({ amount: 500, source: 'EXTERNO' })
      .expect(200);

    expect(tx.driverCashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ driverId: 'd1', type: 'FLOAT', amount: 500 }),
    }));
  });

  test('rol financiero (MANAGER) sin el permiso granular → 200', async () => {
    await request(makeApp())
      .post('/api/driver-cash/d1/float')
      .set('x-test-role', 'MANAGER')
      .send({ amount: 300, source: 'EXTERNO' })
      .expect(200);

    expect(tx.driverCashMovement.create).toHaveBeenCalled();
  });
});
