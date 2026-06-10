'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    printer: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { role: req.get('x-test-role') || 'CASHIER', tenantId: 'tenant-1' };
    req.locationId = 'location-1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (req, res, next) => {
    if (['ADMIN', 'SUPER_ADMIN'].includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  },
  requireRole: (...roles) => (req, res, next) => {
    if (roles.includes(req.user?.role)) return next();
    return res.status(403).json({ error: 'Acceso restringido' });
  },
}));

jest.mock('../src/services/printer.service', () => ({
  printTest: jest.fn(),
  kickDrawer: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const printerRoutes = require('../src/routes/printers.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/printers', printerRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.printer.findMany.mockResolvedValue([]);
  prisma.printer.create.mockResolvedValue({ id: 'printer-1' });
});

describe('printer route permissions', () => {
  test.each(['CASHIER', 'WAITER', 'MANAGER', 'ADMIN', 'OWNER'])(
    '%s can read operational printer configuration',
    async (role) => {
      await request(makeApp())
        .get('/api/printers')
        .set('x-test-role', role)
        .expect(200);
    },
  );

  test('cashier cannot create printer configuration', async () => {
    await request(makeApp())
      .post('/api/printers')
      .set('x-test-role', 'CASHIER')
      .send({ name: 'Cocina' })
      .expect(403);
  });
});
