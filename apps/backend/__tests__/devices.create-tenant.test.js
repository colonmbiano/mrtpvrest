'use strict';

// POST /api/devices/create — la sucursal tiene que ser del tenant de quien vincula.
//
// Antes el Device tomaba el tenantId del restaurante del usuario y el locationId
// del body sin cruzarlos: un admin podía dar de alta un Device en la sucursal de
// otro comercio y /api/devices/auth le firmaba un JWT con ese restaurante ajeno.
// Ahora el tenant sale de la sucursal y solo SUPER_ADMIN puede cruzar tenants.
//
// Se usa el middleware de auth real (authenticate + requireTenantAccess); el
// tenantMiddleware se emula con lo mínimo que deja en el request.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'jwt-de-pruebas-devices';

// Emulación del tenant-guard en modo enforce: fuera de runWithBypass, las
// consultas a Location quedan atadas al restaurante del contexto del request.
const mockGuard = { restaurantId: null, bypass: 0 };

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    employee: { findUnique: jest.fn() },
    device: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    location: { findUnique: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  },
  runWithBypass: jest.fn(async (fn) => {
    mockGuard.bypass += 1;
    try {
      return await fn();
    } finally {
      mockGuard.bypass -= 1;
    }
  }),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { prisma } = require('@mrtpvrest/database');

const USERS = {
  'u-admin-a': {
    id: 'u-admin-a', name: 'Admin A', email: 'a@example.com', role: 'ADMIN',
    isActive: true, restaurantId: 'rest-a', tenantId: 'ten-a',
  },
  // SUPER_ADMIN cuya cuenta cuelga del tenant A: el Device no debe heredar ese tenant.
  'u-super': {
    id: 'u-super', name: 'Soporte', email: 'soporte@example.com', role: 'SUPER_ADMIN',
    isActive: true, restaurantId: 'rest-a', tenantId: 'ten-a',
  },
};

const REST_A = { id: 'rest-a', tenantId: 'ten-a', isActive: true };
const REST_A2 = { id: 'rest-a2', tenantId: 'ten-a', isActive: true };
const REST_B = { id: 'rest-b', tenantId: 'ten-b', isActive: true };

const LOCATIONS = {
  'loc-a1': { id: 'loc-a1', isActive: true, restaurant: REST_A },
  'loc-a2': { id: 'loc-a2', isActive: true, restaurant: REST_A2 },
  'loc-b': { id: 'loc-b', isActive: true, restaurant: REST_B },
  'loc-a-off': { id: 'loc-a-off', isActive: false, restaurant: REST_A },
  'loc-a-rest-off': { id: 'loc-a-rest-off', isActive: true, restaurant: { ...REST_A, isActive: false } },
  'loc-b-off': { id: 'loc-b-off', isActive: false, restaurant: REST_B },
};

const RESTAURANTS = { 'rest-a': REST_A, 'rest-a2': REST_A2, 'rest-b': REST_B };

// `restaurantId`: restaurante que el tenantMiddleware habría resuelto (header
// x-restaurant-id o JWT). Como el real, solo acepta x-location-id si la sucursal
// es de ese restaurante.
function buildApp({ restaurantId = null } = {}) {
  mockGuard.restaurantId = restaurantId;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (restaurantId) {
      req.restaurantId = restaurantId;
      req.restaurant = RESTAURANTS[restaurantId];
      const loc = LOCATIONS[req.headers['x-location-id']];
      if (loc && loc.restaurant.id === restaurantId) req.locationId = loc.id;
    }
    next();
  });
  app.use('/api/devices', require('../src/routes/devices.routes'));
  return app;
}

function userJwt(userId) {
  return `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET)}`;
}

function createDevice(app, { auth, body, headers = {} }) {
  return request(app)
    .post('/api/devices/create')
    .set('Authorization', auth)
    .set(headers)
    .send(body);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGuard.restaurantId = null;
  mockGuard.bypass = 0;
  prisma.user.findUnique.mockImplementation(async ({ where }) => USERS[where.id] || null);
  prisma.employee.findUnique.mockResolvedValue(null);
  prisma.location.findUnique.mockImplementation(async ({ where }) => {
    const loc = LOCATIONS[where.id];
    if (!loc) return null;
    if (!mockGuard.bypass && mockGuard.restaurantId && loc.restaurant.id !== mockGuard.restaurantId) {
      return null;
    }
    return loc;
  });
  prisma.tenant.findUnique.mockImplementation(async ({ where }) => ({ id: where.id }));
  prisma.device.create.mockImplementation(async ({ data }) => ({ id: 'dev-new', ...data }));
});

describe('POST /api/devices/create — sucursal de otro tenant', () => {
  it('responde 403 y no crea el Device', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-b', deviceType: 'KDS', restaurantId: 'rest-a' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('La sucursal no pertenece a tu negocio');
    expect(prisma.device.create).not.toHaveBeenCalled();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('responde 403 aunque el request no traiga restaurante resuelto', async () => {
    // Sin header ni contexto el código anterior tomaba el tenant de req.user.restaurantId.
    const res = await createDevice(buildApp(), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-b', deviceType: 'POS', restaurantId: 'rest-b' },
    });

    expect(res.status).toBe(403);
    expect(prisma.device.create).not.toHaveBeenCalled();
  });

  it('una sucursal ajena desactivada también responde como ajena', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-b-off', deviceType: 'KDS' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('La sucursal no pertenece a tu negocio');
    expect(prisma.device.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/devices/create — sucursal del mismo tenant', () => {
  it('responde 200 y el Device toma el tenant y la sucursal de la sucursal', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-a1', deviceType: 'KDS', restaurantId: 'rest-a' },
      headers: { 'x-restaurant-id': 'rest-a', 'x-location-id': 'loc-a1' },
    });

    expect(res.status).toBe(200);
    expect(prisma.device.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.device.create.mock.calls[0][0];
    expect(data).toMatchObject({ tenantId: 'ten-a', locationId: 'loc-a1', type: 'KDS', isActive: true });
    expect(data.deviceToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body).toEqual({ deviceId: 'dev-new', deviceToken: data.deviceToken, name: data.name });
  });

  it('acepta la sucursal de otro restaurante del mismo tenant', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-a2', deviceType: 'POS' },
    });

    expect(res.status).toBe(200);
    expect(prisma.device.create.mock.calls[0][0].data).toMatchObject({ tenantId: 'ten-a', locationId: 'loc-a2' });
  });

  // Lo que mandan hoy los clientes que vinculan: TPV y Tokki (CAJA/MESERO, solo
  // body), KDS y kiosko (body más x-restaurant-id y x-location-id).
  it.each([
    ['TPV caja', { locationId: 'loc-a1', deviceType: 'CAJA', restaurantId: 'rest-a' }, {}],
    ['TPV mesero', { locationId: 'loc-a1', deviceType: 'MESERO', restaurantId: 'rest-a' }, {}],
    ['KDS', { locationId: 'loc-a1', deviceType: 'KDS', restaurantId: 'rest-a' },
      { 'x-restaurant-id': 'rest-a', 'x-location-id': 'loc-a1' }],
    ['kiosko', { locationId: 'loc-a1', deviceType: 'KIOSK', restaurantId: 'rest-a' },
      { 'x-restaurant-id': 'rest-a', 'x-location-id': 'loc-a1' }],
  ])('sigue vinculando el cliente %s', async (_name, body, headers) => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'), body, headers,
    });

    expect(res.status).toBe(200);
    expect(prisma.device.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'ten-a', locationId: 'loc-a1', type: body.deviceType,
    });
  });

  it.each([
    ['la sucursal', 'loc-a-off'],
    ['el restaurante', 'loc-a-rest-off'],
  ])('responde 403 si %s está desactivado', async (_what, locationId) => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId, deviceType: 'KDS' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Sucursal o restaurante desactivado');
    expect(prisma.device.create).not.toHaveBeenCalled();
  });

  it('responde 404 si la sucursal no existe', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-nada', deviceType: 'KDS' },
    });

    expect(res.status).toBe(404);
    expect(prisma.device.create).not.toHaveBeenCalled();
  });

  it('responde 400 sin locationId', async () => {
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { deviceType: 'KDS' },
    });

    expect(res.status).toBe(400);
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
  });

  it('conserva el 409 ORPHAN_TENANT si el tenant de la sucursal no existe', async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-admin-a'),
      body: { locationId: 'loc-a1', deviceType: 'KDS' },
    });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ORPHAN_TENANT', tenantId: 'ten-a', restaurantId: 'rest-a' });
    expect(prisma.device.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/devices/create — SUPER_ADMIN', () => {
  it('puede vincular en otro tenant y el Device queda en el tenant de la sucursal', async () => {
    // Su request resuelve el restaurante de su propia cuenta (rest-a): sin el
    // bypass, el guard escondería la sucursal del tenant B.
    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: userJwt('u-super'),
      body: { locationId: 'loc-b', deviceType: 'CAJA', restaurantId: 'rest-b' },
    });

    expect(res.status).toBe(200);
    expect(prisma.device.create.mock.calls[0][0].data).toMatchObject({ tenantId: 'ten-b', locationId: 'loc-b' });
  });

  it('tampoco vincula en una sucursal desactivada', async () => {
    const res = await createDevice(buildApp(), {
      auth: userJwt('u-super'),
      body: { locationId: 'loc-b-off', deviceType: 'KDS' },
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Sucursal o restaurante desactivado');
    expect(prisma.device.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/devices/create — JWT de Device', () => {
  it('un Device no puede vincular otros Devices', async () => {
    prisma.device.findUnique.mockResolvedValue({
      id: 'dev-kds', type: 'KDS', isActive: true, locationId: 'loc-a1', tenantId: 'ten-a',
      location: { restaurantId: 'rest-a' },
    });
    const deviceAuth = `Bearer ${jwt.sign(
      { userId: 'dev-kds', deviceId: 'dev-kds', isDevice: true, role: 'KITCHEN', restaurantId: 'rest-a' },
      process.env.JWT_SECRET,
    )}`;

    const res = await createDevice(buildApp({ restaurantId: 'rest-a' }), {
      auth: deviceAuth,
      body: { locationId: 'loc-a1', deviceType: 'POS' },
    });

    expect(res.status).toBe(403);
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
    expect(prisma.device.create).not.toHaveBeenCalled();
  });
});
