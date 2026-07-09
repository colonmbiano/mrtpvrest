'use strict';

// Tests de las rutas CRUD de zonas de entrega (/api/delivery-zones).
// Mockeamos Prisma y el auth middleware.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    deliveryZone: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', role: 'ADMIN' };
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireAdmin: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const zonesRoutes = require('../src/routes/delivery-zones.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/delivery-zones', zonesRoutes);
  return app;
}

const SQUARE = [
  { lat: 19.40, lng: -99.16 },
  { lat: 19.44, lng: -99.16 },
  { lat: 19.44, lng: -99.12 },
  { lat: 19.40, lng: -99.12 },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/delivery-zones', () => {
  test('lista las zonas del restaurante con fee numérico', async () => {
    prisma.deliveryZone.findMany.mockResolvedValue([
      { id: 'z1', name: 'Centro', fee: { toString: () => '35' }, color: '#22c55e', polygon: SQUARE, active: true, priority: 0 },
    ]);

    const res = await request(makeApp()).get('/api/delivery-zones');

    expect(res.status).toBe(200);
    expect(res.body.zones).toHaveLength(1);
    expect(res.body.zones[0]).toMatchObject({ id: 'z1', name: 'Centro', fee: 35, active: true });
    expect(prisma.deliveryZone.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: 'r1' } })
    );
  });
});

describe('POST /api/delivery-zones', () => {
  test('crea una zona válida', async () => {
    prisma.deliveryZone.create.mockResolvedValue({
      id: 'new1', name: 'Norte', fee: 40, color: '#3b82f6', polygon: SQUARE, active: true, priority: 0,
    });

    const res = await request(makeApp())
      .post('/api/delivery-zones')
      .send({ name: 'Norte', fee: 40, color: '#3b82f6', polygon: SQUARE });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, zone: { id: 'new1', fee: 40 } });
    const data = prisma.deliveryZone.create.mock.calls[0][0].data;
    expect(data.restaurantId).toBe('r1');
    expect(data.polygon).toHaveLength(4);
  });

  test('rechaza un polígono con menos de 3 puntos sin tocar la BD', async () => {
    const res = await request(makeApp())
      .post('/api/delivery-zones')
      .send({ name: 'Mala', fee: 10, polygon: [{ lat: 19.4, lng: -99.1 }, { lat: 19.5, lng: -99.2 }] });

    expect(res.status).toBe(400);
    expect(prisma.deliveryZone.create).not.toHaveBeenCalled();
  });

  test('rechaza nombre vacío', async () => {
    const res = await request(makeApp())
      .post('/api/delivery-zones')
      .send({ name: '  ', fee: 10, polygon: SQUARE });

    expect(res.status).toBe(400);
    expect(prisma.deliveryZone.create).not.toHaveBeenCalled();
  });

  test('color inválido cae al verde por defecto', async () => {
    prisma.deliveryZone.create.mockResolvedValue({ id: 'x', name: 'X', fee: 0, color: '#22c55e', polygon: SQUARE, active: true, priority: 0 });

    await request(makeApp())
      .post('/api/delivery-zones')
      .send({ name: 'X', polygon: SQUARE, color: 'no-es-color' });

    expect(prisma.deliveryZone.create.mock.calls[0][0].data.color).toBe('#22c55e');
  });

  test('update por id scoped al restaurante; 404 si no existe', async () => {
    prisma.deliveryZone.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(makeApp())
      .post('/api/delivery-zones')
      .send({ id: 'ajeno', name: 'X', polygon: SQUARE });

    expect(res.status).toBe(404);
    expect(prisma.deliveryZone.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ajeno', restaurantId: 'r1' } })
    );
  });
});

describe('DELETE /api/delivery-zones/:id', () => {
  test('elimina scoped al restaurante', async () => {
    prisma.deliveryZone.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(makeApp()).delete('/api/delivery-zones/z1');

    expect(res.status).toBe(200);
    expect(prisma.deliveryZone.deleteMany).toHaveBeenCalledWith({ where: { id: 'z1', restaurantId: 'r1' } });
  });

  test('404 si la zona no es del restaurante', async () => {
    prisma.deliveryZone.deleteMany.mockResolvedValue({ count: 0 });
    const res = await request(makeApp()).delete('/api/delivery-zones/ajeno');
    expect(res.status).toBe(404);
  });
});
