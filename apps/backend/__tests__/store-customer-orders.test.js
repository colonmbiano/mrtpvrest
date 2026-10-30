'use strict';

// Tests de GET /api/store/customer/orders: el historial incluye las incidencias
// de ruta persistidas, proyectadas a campos seguros para el comprador.

// Modo y secreto del PIN fijados aquí (process.env se comparte entre archivos de jest).
const PIN_SECRET = 'z'.repeat(40);
const PREVIOUS_ENV = { mode: process.env.STORE_DELIVERY_PIN_MODE, secret: process.env.STORE_DELIVERY_PIN_SECRET };
process.env.STORE_DELIVERY_PIN_MODE = 'optional';
process.env.STORE_DELIVERY_PIN_SECRET = PIN_SECRET;
afterAll(() => {
  for (const [key, value] of [['STORE_DELIVERY_PIN_MODE', PREVIOUS_ENV.mode], ['STORE_DELIVERY_PIN_SECRET', PREVIOUS_ENV.secret]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

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
const { deriveStoreDeliveryPin } = require('../src/lib/store-delivery-pin');

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
    expect(args.select.source).toBe(true);
    expect(args.select.deliveryIncidents.select).toEqual({ id: true, type: true, occurredAt: true, callAttempts: true });
    // Nada del texto libre del repartidor, foto ni ids internos.
    for (const field of ['reason', 'notes', 'photoBase64', 'courierId', 'actorId']) {
      expect(args.select.deliveryIncidents.select[field]).toBeUndefined();
    }
  });

  test('responde incidencias como `incidents` y el PIN de entrega solo en pedidos propios activos', async () => {
    const occurredAt = new Date('2026-10-23T19:05:00Z');
    prisma.order.findMany.mockResolvedValue([
      { id: 'o1', status: 'ON_THE_WAY', orderType: 'DELIVERY', source: 'ONLINE', deliveryIncidents: [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt, callAttempts: 3 }] },
      { id: 'o2', status: 'DELIVERED', orderType: 'DELIVERY', source: 'ONLINE', deliveryIncidents: undefined },
      { id: 'o3', status: 'ON_THE_WAY', orderType: 'DELIVERY', source: 'MARKETPLACE', deliveryIncidents: [] },
    ]);

    const res = await request(makeApp()).get('/api/store/customer/orders');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { id: 'o1', status: 'ON_THE_WAY', orderType: 'DELIVERY', deliveryPin: deriveStoreDeliveryPin('o1', PIN_SECRET), incidents: [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt: occurredAt.toISOString(), callAttempts: 3 }] },
      { id: 'o2', status: 'DELIVERED', orderType: 'DELIVERY', deliveryPin: null, incidents: [] },
      // Marketplace: su PIN vive en el flujo de seguimiento propio, aquí nunca.
      { id: 'o3', status: 'ON_THE_WAY', orderType: 'DELIVERY', deliveryPin: null, incidents: [] },
    ]);
    expect(res.body[0].deliveryIncidents).toBeUndefined();
    expect(res.body[0].source).toBeUndefined();
  });

  test('solo clientes pueden consultar su historial', async () => {
    const res = await request(makeApp()).get('/api/store/customer/orders').set('x-test-role', 'ADMIN');
    expect(res.status).toBe(403);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
