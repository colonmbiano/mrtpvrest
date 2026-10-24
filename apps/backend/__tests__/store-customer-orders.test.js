'use strict';

// Tests de GET /api/store/customer/orders: el historial incluye las incidencias
// de ruta persistidas, proyectadas a campos seguros para el comprador.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    order: { findMany: jest.fn() },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', role: req.headers['x-test-role'] || 'CUSTOMER', restaurantId: 'r1' };
    next();
  },
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const storeRoutes = require('../src/routes/store.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/store', storeRoutes);
  return app;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /api/store/customer/orders', () => {
  test('pide solo campos seguros de las incidencias, acotado al cliente y su restaurante', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await request(makeApp()).get('/api/store/customer/orders');

    const [args] = prisma.order.findMany.mock.calls[0];
    expect(args.where).toEqual({ userId: 'u1', restaurantId: 'r1' });
    expect(args.select.deliveryIncidents.select).toEqual({ id: true, type: true, occurredAt: true, callAttempts: true });
    // Nada del texto libre del repartidor, foto ni ids internos.
    for (const field of ['reason', 'notes', 'photoBase64', 'courierId', 'actorId']) {
      expect(args.select.deliveryIncidents.select[field]).toBeUndefined();
    }
  });

  test('responde las incidencias como `incidents` y siempre como arreglo', async () => {
    const occurredAt = new Date('2026-10-23T19:05:00Z');
    prisma.order.findMany.mockResolvedValue([
      { id: 'o1', status: 'ON_THE_WAY', deliveryIncidents: [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt, callAttempts: 3 }] },
      { id: 'o2', status: 'DELIVERED', deliveryIncidents: undefined },
    ]);

    const res = await request(makeApp()).get('/api/store/customer/orders');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'o1', status: 'ON_THE_WAY', incidents: [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt: occurredAt.toISOString(), callAttempts: 3 }] },
      { id: 'o2', status: 'DELIVERED', incidents: [] },
    ]);
    expect(res.body[0].deliveryIncidents).toBeUndefined();
  });

  test('solo clientes pueden consultar su historial', async () => {
    const res = await request(makeApp()).get('/api/store/customer/orders').set('x-test-role', 'ADMIN');
    expect(res.status).toBe(403);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
