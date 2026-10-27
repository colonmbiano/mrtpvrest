'use strict';

// Rutas del repartidor con PIN de entrega de pedidos propios
// (STORE_DELIVERY_PIN_MODE=required): marca requiresDeliveryPin en sus pedidos,
// verificación sin efectos y la ruta antigua /deliver.

const SECRET = 'y'.repeat(40);
const PREVIOUS_ENV = { mode: process.env.STORE_DELIVERY_PIN_MODE, secret: process.env.STORE_DELIVERY_PIN_SECRET };
process.env.STORE_DELIVERY_PIN_MODE = 'required';
process.env.STORE_DELIVERY_PIN_SECRET = SECRET;
afterAll(() => {
  for (const [key, value] of [['STORE_DELIVERY_PIN_MODE', PREVIOUS_ENV.mode], ['STORE_DELIVERY_PIN_SECRET', PREVIOUS_ENV.secret]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    employee: { findFirst: jest.fn() },
    order: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    // Freno de intentos en PostgreSQL (delivery_pin_attempts).
    deliveryPinAttempt: { findFirst: jest.fn().mockResolvedValue(null), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'd1', role: 'DELIVERY', restaurantId: 'r1' };
    req.restaurantId = 'r1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

jest.mock('../src/services/notifications.service', () => ({
  sendPushToDriver: jest.fn(), notifyDriversNewDeliveryOrder: jest.fn(), notifyOrderStatus: jest.fn(),
  notifyOrderStatusById: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { deriveStoreDeliveryPin } = require('../src/lib/store-delivery-pin');
const deliveryRoutes = require('../src/routes/delivery.routes');

const ORDER = { id: 'o1', restaurantId: 'r1', orderType: 'DELIVERY', source: 'ONLINE', status: 'ON_THE_WAY',
  deliveryDriverId: 'd1', items: [], user: null };
const PIN = deriveStoreDeliveryPin('o1', SECRET);
const WRONG = PIN === '000000' ? '111111' : '000000';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/delivery', deliveryRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Repartidor', locationId: 'l1' });
  prisma.order.findFirst.mockResolvedValue({ ...ORDER });
});

test('los pedidos del repartidor indican si requieren PIN (marketplace y mostrador no)', async () => {
  prisma.order.findMany.mockResolvedValue([
    { ...ORDER, restaurant: null },
    { ...ORDER, id: 'o2', source: 'MARKETPLACE', restaurant: null },
    { ...ORDER, id: 'o3', orderType: 'TAKEOUT', restaurant: null },
  ]);
  const res = await request(makeApp()).get('/api/delivery/d1/orders');
  expect(res.status).toBe(200);
  expect(res.body.map((o) => [o.id, o.requiresDeliveryPin])).toEqual([['o1', true], ['o2', false], ['o3', false]]);
  // El PIN nunca viaja al repartidor: lo dicta el cliente.
  expect(JSON.stringify(res.body)).not.toContain(PIN);
});

test('verificación sin efectos: acepta el PIN correcto y rechaza los demás', async () => {
  const ok = await request(makeApp()).post('/api/delivery/d1/orders/o1/delivery-pin').send({ deliveryPin: PIN });
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ ok: true, required: true });
  const bad = await request(makeApp()).post('/api/delivery/d1/orders/o1/delivery-pin').send({ deliveryPin: WRONG });
  expect(bad.status).toBe(400);
  expect(bad.body.code).toBe('INVALID_DELIVERY_PIN');
  // El fallo se cuenta en PostgreSQL, compartido entre instancias del backend.
  expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  expect(prisma.$executeRaw.mock.calls[0].slice(1, 3)).toEqual(['r1', 'o1']);
  const empty = await request(makeApp()).post('/api/delivery/d1/orders/o1/delivery-pin').send({});
  expect(empty.status).toBe(400);
  expect(prisma.order.update).not.toHaveBeenCalled();
});

test('ruta antigua /deliver también exige el PIN al repartidor', async () => {
  const missing = await request(makeApp()).put('/api/delivery/d1/orders/o1/deliver').send({});
  expect(missing.status).toBe(409);
  expect(missing.body.code).toBe('DELIVERY_PIN_REQUIRED');
  expect(prisma.order.update).not.toHaveBeenCalled();

  prisma.order.update.mockResolvedValue({ ...ORDER, status: 'DELIVERED', paymentMethod: 'CARD', total: 100, items: [] });
  const ok = await request(makeApp()).put('/api/delivery/d1/orders/o1/deliver').send({ deliveryPin: PIN });
  expect(ok.status).toBe(200);
  expect(prisma.order.update).toHaveBeenCalledTimes(1);
});
