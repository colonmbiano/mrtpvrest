'use strict';

// Mocks antes de require()
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    tenant:     { findUnique: jest.fn() },
    location:   { findUnique: jest.fn(), findFirst: jest.fn() },
  },
}));

const jwt = require('jsonwebtoken');
const { prisma } = require('@mrtpvrest/database');
const tenantMiddleware = require('../src/middleware/tenant.middleware');

const JWT_SECRET = 'test-secret';
process.env.JWT_SECRET = JWT_SECRET;

const makeReq = (overrides = {}) => ({
  headers: {},
  query:   {},
  hostname: 'api.mrtpvrest.com',
  path:    '/api/admin/locations',
  ...overrides,
});

const makeRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('tenantMiddleware — IGNORED_SUBDOMAINS', () => {
  test('subdominio "tpv" NO se interpreta como slug de restaurante', async () => {
    const req = makeReq({ hostname: 'tpv.mrtpvrest.com' });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    // No debe haber intentado buscar restaurante por slug "tpv"
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'tpv' } })
    );
    // Sin tenant resuelto y sin SUPER_ADMIN → 404
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  test.each(['app', 'pos', 'kds', 'kiosk', 'client', 'delivery', 'landing', 'saas', 'cdn'])(
    'subdominio "%s" tampoco se usa como slug',
    async (sub) => {
      const req = makeReq({ hostname: `${sub}.mrtpvrest.com` });
      const res = makeRes();
      await tenantMiddleware(req, res, jest.fn());
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { slug: sub } })
      );
    }
  );

  test('subdominio de restaurante real SÍ se usa como slug', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null); // no existe → 404, pero se intentó
    const req = makeReq({ hostname: 'masterburguer.mrtpvrest.com' });
    await tenantMiddleware(req, makeRes(), jest.fn());
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'masterburguer' } })
    );
  });
});

describe('tenantMiddleware — SUPER_ADMIN bypass', () => {
  test('SUPER_ADMIN sin restaurante resuelto → next() (no 404)', async () => {
    const token = jwt.sign(
      { userId: 'u1', role: 'SUPER_ADMIN', restaurantId: null, tenantId: null },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('ADMIN normal sin restaurante resuelto → 404 (sin bypass)', async () => {
    const token = jwt.sign(
      { userId: 'u2', role: 'ADMIN', restaurantId: null, tenantId: 't1' },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('Restaurante no identificado'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('SUPER_ADMIN con restaurantId válido en JWT sí carga el contexto', async () => {
    const restaurant = {
      id: 'r1', tenantId: 't1', isActive: true, config: {},
    };
    prisma.restaurant.findUnique.mockResolvedValue(restaurant);
    prisma.tenant.findUnique.mockResolvedValue({ id: 't1', subscription: null });

    const token = jwt.sign(
      { userId: 'u1', role: 'SUPER_ADMIN', restaurantId: 'r1', tenantId: 't1' },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();

    await tenantMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.restaurantId).toBe('r1');
    expect(req.restaurant).toEqual(restaurant);
  });

  test('Sin Authorization header → 404 (no hay rol que evaluar)', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('tenantMiddleware — fallback por tenantId del JWT', () => {
  test('ADMIN con restaurantId stale resuelve por tenantId', async () => {
    // findUnique por id falla (restaurantId stale)
    prisma.restaurant.findUnique.mockResolvedValue(null);
    // findFirst por tenantId encuentra el restaurant real
    const restaurant = { id: 'r-real', tenantId: 't-1', isActive: true, config: {} };
    prisma.restaurant.findFirst.mockResolvedValue(restaurant);
    prisma.tenant.findUnique.mockResolvedValue({ id: 't-1', subscription: null });

    const token = jwt.sign(
      { userId: 'u1', role: 'ADMIN', restaurantId: 'r-stale', tenantId: 't-1' },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();

    await tenantMiddleware(req, makeRes(), next);

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't-1', isActive: true } })
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.restaurantId).toBe('r-real');
  });

  test('ADMIN sin restaurantId pero con tenantId también funciona', async () => {
    const restaurant = { id: 'r-tenant-default', tenantId: 't-9', isActive: true, config: {} };
    prisma.restaurant.findFirst.mockResolvedValue(restaurant);
    prisma.tenant.findUnique.mockResolvedValue({ id: 't-9', subscription: null });

    const token = jwt.sign(
      { userId: 'u9', role: 'ADMIN', restaurantId: null, tenantId: 't-9' },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();

    await tenantMiddleware(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.restaurantId).toBe('r-tenant-default');
  });

  test('ADMIN sin tenantId y sin restaurant resoluble → 404', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    prisma.restaurant.findFirst.mockResolvedValue(null);

    const token = jwt.sign(
      { userId: 'u', role: 'ADMIN', restaurantId: 'r-stale', tenantId: null },
      JWT_SECRET
    );
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = makeRes();
    const next = jest.fn();

    await tenantMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('tenantMiddleware — globalPaths', () => {
  test('/api/auth/login bypasea sin tocar BD', async () => {
    const req = makeReq({ path: '/api/auth/login' });
    const next = jest.fn();
    await tenantMiddleware(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });

  test('/api/saas/tpv-configs bypasea sin tocar BD', async () => {
    const req = makeReq({ path: '/api/saas/tpv-configs' });
    const next = jest.fn();
    await tenantMiddleware(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
});
