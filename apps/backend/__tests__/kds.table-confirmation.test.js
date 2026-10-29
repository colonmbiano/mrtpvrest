'use strict';

// El KDS no muestra pedidos de mesa por confirmar (QR desde internet a una mesa
// libre): cocina los ve hasta que la caja los acepta.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    printerGroup: { findMany: jest.fn() },
    order: { findMany: jest.fn() },
    kdsItemStatus: { findMany: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', role: 'KITCHEN' };
    req.locationId = 'loc1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/lib/modules', () => ({
  requireFeatureFlag: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/kds', require('../src/routes/kds.routes'));
  return app;
}

test('GET /api/kds/orders/:station excluye los pedidos de mesa por confirmar', async () => {
  prisma.printerGroup.findMany.mockResolvedValue([]);
  prisma.order.findMany.mockResolvedValue([]);
  prisma.kdsItemStatus.findMany.mockResolvedValue([]);

  const res = await request(makeApp()).get('/api/kds/orders/KITCHEN');

  expect(res.status).toBe(200);
  expect(prisma.order.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ awaitingTableConfirmation: false, locationId: 'loc1' }),
    }),
  );
});
