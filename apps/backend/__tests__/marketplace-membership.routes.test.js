'use strict';

// Módulo "marketplace" por negocio y solicitud de directorio:
//  - GET  /api/modules incluye MARKETPLACE (catálogo único de módulos).
//  - GET/POST /api/modules/marketplace/membership: el negocio ve y pide entrar.
//  - GET /api/saas/marketplace/memberships y POST .../:restaurantId/review: la
//    plataforma (SUPER_ADMIN) revisa. Prisma va mockeado; sin BD.

const mockRows = new Map();
let mockModules = [];
let mockRole = 'OWNER';

jest.mock('@mrtpvrest/database', () => {
  const pick = (row) => row && { restaurantId: row.restaurantId, status: row.status, requestedAt: row.requestedAt,
    reviewedAt: row.reviewedAt ?? null, reviewNote: row.reviewNote ?? null };
  return {
    runWithBypass: (fn) => fn(),
    prisma: {
      restaurant: {
        findUnique: jest.fn(async ({ where }) => (where.id === 'r1'
          ? { tenantId: 't1', tenant: { enabledModules: mockModules, subscription: null } } : null)),
        findFirst: jest.fn(async ({ where }) => (where.id === 'r1' ? { id: 'r1', tenant: { isDemo: false } } : null)),
      },
      tenant: {
        findUnique: jest.fn(async () => ({ enabledModules: mockModules, subscription: null })),
      },
      marketplaceMerchantMembership: {
        findUnique: jest.fn(async ({ where }) => pick(mockRows.get(where.restaurantId)) ?? null),
        create: jest.fn(async ({ data }) => { mockRows.set(data.restaurantId, { ...data }); return pick(mockRows.get(data.restaurantId)); }),
        updateMany: jest.fn(async ({ where, data }) => {
          const row = mockRows.get(where.restaurantId);
          if (!row || row.status !== where.status) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        findMany: jest.fn(async ({ where }) => [...mockRows.values()]
          .filter((row) => !where.status || row.status === where.status)
          .map((row) => ({ ...pick(row), restaurant: { id: row.restaurantId, name: 'Tokki Boba', slug: 'tokki',
            isActive: true, tenant: { name: 'Tokki', isDemo: false, enabledModules: mockModules, subscription: null } } }))),
      },
    },
  };
});

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', role: mockRole, restaurantId: 'r1', tenantId: 't1', isActive: true };
    req.restaurantId = 'r1';
    next();
  },
  requireRole: (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'rol' })),
  requireSuperAdmin: (req, res, next) => (req.user.role === 'SUPER_ADMIN' ? next() : res.status(403).json({ error: 'super' })),
}));

jest.mock('../src/middleware/module.middleware', () => ({ invalidateModuleCache: jest.fn() }));

const express = require('express');
const request = require('supertest');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/modules', require('../src/routes/modules.routes'));
  app.use('/api/saas', require('../src/routes/saas.routes'));
  return app;
}

beforeEach(() => {
  mockRows.clear();
  mockModules = [];
  mockRole = 'OWNER';
});

it('el negocio ve el módulo Marketplace entre sus módulos opcionales', async () => {
  const res = await request(makeApp()).get('/api/modules');
  expect(res.status).toBe(200);
  expect(res.body.modules.map((m) => m.key)).toContain('MARKETPLACE');
});

it('sin el módulo activo el negocio no puede pedir entrar al directorio', async () => {
  const app = makeApp();
  const status = await request(app).get('/api/modules/marketplace/membership');
  expect(status.body).toEqual({ moduleEnabled: false,
    membership: { status: 'NONE', requestedAt: null, reviewedAt: null, reviewNote: null } });
  const res = await request(app).post('/api/modules/marketplace/membership');
  expect(res.status).toBe(403);
  expect(res.body.errorCode).toBe('MODULE_REQUIRED');
});

it('con el módulo, el negocio solicita y la plataforma aprueba', async () => {
  mockModules = ['marketplace'];
  const app = makeApp();
  const requested = await request(app).post('/api/modules/marketplace/membership');
  expect(requested.status).toBe(201);
  expect(requested.body.membership.status).toBe('PENDING');
  // Un cajero no puede pedirlo; un negocio no puede revisar solicitudes.
  mockRole = 'CASHIER';
  expect((await request(app).post('/api/modules/marketplace/membership')).status).toBe(403);
  mockRole = 'OWNER';
  expect((await request(app).get('/api/saas/marketplace/memberships')).status).toBe(403);

  mockRole = 'SUPER_ADMIN';
  const list = await request(app).get('/api/saas/marketplace/memberships?status=PENDING');
  expect(list.status).toBe(200);
  expect(list.body).toEqual([expect.objectContaining({ restaurantId: 'r1', status: 'PENDING', moduleEnabled: true,
    restaurant: expect.objectContaining({ slug: 'tokki' }) })]);
  const approved = await request(app).post('/api/saas/marketplace/memberships/r1/review')
    .send({ decision: 'APPROVE', note: 'Listo' });
  expect(approved.status).toBe(200);
  expect(approved.body.membership).toMatchObject({ status: 'APPROVED', reviewNote: 'Listo' });
  const invalid = await request(app).post('/api/saas/marketplace/memberships/r1/review').send({ decision: 'APPROVE' });
  expect(invalid.status).toBe(409);
  expect(invalid.body.errorCode).toBe('INVALID_TRANSITION');

  mockRole = 'OWNER';
  const mine = await request(app).get('/api/modules/marketplace/membership');
  expect(mine.body).toMatchObject({ moduleEnabled: true, membership: { status: 'APPROVED' } });
});
