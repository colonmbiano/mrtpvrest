'use strict';

jest.mock('@mrtpvrest/database', () => {
  const prisma = {
    restaurant: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn(), update: jest.fn() },
    tenantModule: { upsert: jest.fn() },
  };
  // El update legacy + sync de TenantModule corren en una transacción; el tx
  // expuesto es el mismo cliente mock.
  prisma.$transaction = jest.fn((cb) => cb(prisma));
  return { prisma };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', tenantId: 'tenant-1', restaurantId: 'restaurant-1', role: 'ADMIN' };
    req.restaurantId = 'restaurant-1';
    next();
  },
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/middleware/module.middleware', () => ({
  invalidateModuleCache: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const moduleRoutes = require('../src/routes/modules.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/modules', moduleRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('module routes', () => {
  test('GET /api/modules maps plan module keys to admin module states', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ tenantId: 'tenant-1' });
    prisma.tenant.findUnique.mockResolvedValue({
      enabledModules: [],
      subscription: {
        plan: {
          name: 'PREMIUM',
          displayName: 'Premium',
          allowedModules: ['client_menu', 'delivery', 'kds', 'kiosk', 'loyalty_advanced'],
          hasKDS: true,
          hasLoyalty: true,
          hasReports: true,
        },
      },
    });

    const res = await request(makeApp()).get('/api/modules').expect(200);
    const byKey = Object.fromEntries(res.body.modules.map((moduleInfo) => [moduleInfo.key, moduleInfo]));

    expect(byKey.WEBSTORE).toEqual(expect.objectContaining({ allowedByPlan: true, enabled: true, toggledOn: true }));
    expect(byKey.DELIVERY).toEqual(expect.objectContaining({ allowedByPlan: true, enabled: true, toggledOn: true }));
    expect(byKey.KDS).toEqual(expect.objectContaining({ allowedByPlan: true, enabled: true, toggledOn: true }));
    expect(byKey.KIOSK).toEqual(expect.objectContaining({ allowedByPlan: true, enabled: true, toggledOn: true }));
    expect(byKey.LOYALTY).toEqual(expect.objectContaining({ allowedByPlan: true, enabled: true, toggledOn: true }));
  });

  test('PATCH /api/modules/:key stores the canonical plan key', async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ tenantId: 'tenant-1' });
    prisma.tenant.findUnique
      .mockResolvedValueOnce({
        subscription: {
          plan: {
            allowedModules: ['client_menu'],
            hasKDS: false,
            hasLoyalty: false,
            hasReports: false,
          },
        },
      })
      .mockResolvedValueOnce({ enabledModules: [] });
    prisma.tenant.update.mockResolvedValue({ enabledModules: ['client_menu'] });

    await request(makeApp()).patch('/api/modules/WEBSTORE').send({ enabled: true }).expect(200);

    // Los flags legacy derivados se sincronizan con el array: webstore (client_menu)
    // → hasWebStore true; delivery ausente → hasDelivery false. hasInventory no se toca.
    expect(prisma.tenant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { enabledModules: ['client_menu'], hasDelivery: false, hasWebStore: true },
    }));

    // Dual-write: la fuente canónica TenantModule se sincroniza con webstore activo.
    expect(prisma.tenantModule.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { tenantId_moduleKey: { tenantId: 'tenant-1', moduleKey: 'webstore' } },
      update: expect.objectContaining({ enabled: true }),
    }));
  });
});
