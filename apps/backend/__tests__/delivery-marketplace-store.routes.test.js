'use strict';

// Rutas del repartidor con pedidos del marketplace que entrega la tienda (orden v1,
// tarea MANUAL): bolsa, tomar, asignar, lista, verificación del PIN y /deliver.
// Los de la red compartida no entran al flujo de la tienda. Prisma va mockeado.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    employee: { findFirst: jest.fn() },
    order: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
  sendPushToDriver: jest.fn().mockResolvedValue(undefined), notifyDriversNewDeliveryOrder: jest.fn().mockResolvedValue(undefined),
  notifyOrderStatus: jest.fn().mockResolvedValue(undefined), notifyOrderStatusById: jest.fn().mockResolvedValue(undefined),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const { hashPin } = require('../src/lib/marketplace-dispatch');
const deliveryRoutes = require('../src/routes/delivery.routes');

const PIN = '615204';
const HASH = hashPin(PIN);
const pipeline = (policy = 'MANUAL', id = 'o1') => ({ restaurantId: 'r1', deliveryPinHash: HASH,
  dispatch: { task: { orderId: id, restaurantId: 'r1', deliveryPolicy: policy, status: 'WAITING_READY', pickupPinHash: HASH, deliveryPinHash: HASH } } });
const MARKET = { id: 'o1', restaurantId: 'r1', locationId: 'l1', orderType: 'DELIVERY', source: 'MARKETPLACE', status: 'READY',
  deliveryDriverId: null, deliveryFee: 30, notes: null, total: 115.5, items: [], user: null, marketplacePipeline: pipeline() };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/delivery', deliveryRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  prisma.employee.findFirst.mockResolvedValue({ id: 'd1', name: 'Repartidor', locationId: 'l1' });
});

test('bolsa: sin pedidos por aceptar ni de la red; los de la tienda salen sin el pipeline', async () => {
  prisma.order.findMany.mockResolvedValue([
    { id: 'p1', restaurantId: 'r1', orderType: 'DELIVERY', source: 'ONLINE', status: 'READY', restaurant: null, marketplacePipeline: null },
    { ...MARKET, restaurant: null },
    { ...MARKET, id: 'o2', restaurant: null, marketplacePipeline: pipeline('SHARED_ONLY', 'o2') },
  ]);
  const res = await request(makeApp()).get('/api/delivery/available-orders');
  expect(res.status).toBe(200);
  expect(res.body.map(o => [o.id, o.deliveredByStore ?? false])).toEqual([['p1', false], ['o1', true]]);
  expect(JSON.stringify(res.body)).not.toContain(HASH);
  expect(prisma.order.findMany.mock.calls[0][0].where.status.notIn).toEqual(
    expect.arrayContaining(['DELIVERED', 'CANCELLED', 'PENDING_PAYMENT', 'PENDING_MERCHANT']));
});

test('tomar: la red y lo que la tienda no ha aceptado no se toman; lo de la tienda sí', async () => {
  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, marketplacePipeline: pipeline('SHARED_ONLY') });
  const network = await request(makeApp()).post('/api/delivery/d1/claim/o1').send({});
  expect(network.status).toBe(409);
  expect(network.body.code).toBe('NETWORK_DELIVERY');
  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, status: 'PENDING_MERCHANT' });
  const early = await request(makeApp()).post('/api/delivery/d1/claim/o1').send({});
  expect(early.status).toBe(409);
  expect(early.body.code).toBe('ORDER_NOT_ACCEPTED');
  expect(prisma.order.updateMany).not.toHaveBeenCalled();

  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET }).mockResolvedValueOnce({ ...MARKET, marketplacePipeline: undefined,
    deliveryDriverId: 'd1', status: 'ON_THE_WAY' });
  prisma.order.updateMany.mockResolvedValue({ count: 1 });
  const ok = await request(makeApp()).post('/api/delivery/d1/claim/o1').send({});
  expect(ok.status).toBe(200);
  const where = prisma.order.updateMany.mock.calls[0][0].where;
  expect(where.status.notIn).toEqual(expect.arrayContaining(['PENDING_PAYMENT', 'PENDING_MERCHANT']));
  expect(prisma.order.updateMany.mock.calls[0][0].data).toMatchObject({ deliveryDriverId: 'd1', status: 'ON_THE_WAY' });
});

test('asignar desde la caja: mismas reglas, y el estado se vuelve a exigir en el update', async () => {
  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, status: 'PENDING_PAYMENT' });
  const early = await request(makeApp()).put('/api/delivery/assign').send({ orderId: 'o1', driverId: 'd1' });
  expect(early.status).toBe(409);
  expect(early.body.code).toBe('ORDER_NOT_ACCEPTED');
  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET, marketplacePipeline: pipeline('SHARED_ONLY') });
  expect((await request(makeApp()).put('/api/delivery/assign').send({ orderId: 'o1', driverId: 'd1' })).body.code).toBe('NETWORK_DELIVERY');
  expect(prisma.order.update).not.toHaveBeenCalled();

  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET });
  prisma.order.update.mockResolvedValueOnce({ ...MARKET, marketplacePipeline: undefined, deliveryDriverId: 'd1', status: 'ON_THE_WAY' });
  const ok = await request(makeApp()).put('/api/delivery/assign').send({ orderId: 'o1', driverId: 'd1' });
  expect(ok.status).toBe(200);
  expect(prisma.order.update.mock.calls[0][0].where).toMatchObject({ id: 'o1', restaurantId: 'r1',
    status: { notIn: ['PENDING_PAYMENT', 'PENDING_MERCHANT'] } });
  // Si cambió de estado entre la revisión y el update: 409, no 500.
  prisma.order.findFirst.mockResolvedValueOnce({ ...MARKET });
  prisma.order.update.mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'P2025' }));
  const raced = await request(makeApp()).put('/api/delivery/assign').send({ orderId: 'o1', driverId: 'd1' });
  expect(raced.status).toBe(409);
  expect(raced.body.code).toBe('ORDER_CONFLICT');
});

test('lista del repartidor: pide el PIN, marca deliveredByStore y nunca manda los hashes', async () => {
  prisma.order.findMany.mockResolvedValue([{ ...MARKET, deliveryDriverId: 'd1', status: 'ON_THE_WAY', restaurant: null }]);
  const res = await request(makeApp()).get('/api/delivery/d1/orders');
  expect(res.status).toBe(200);
  expect(res.body[0]).toMatchObject({ id: 'o1', requiresDeliveryPin: true, deliveredByStore: true });
  expect(res.body[0]).not.toHaveProperty('marketplacePipeline');
  expect(JSON.stringify(res.body)).not.toContain(HASH);
});

test('verificación del PIN: compara con el del comprador sin cambiar el pedido', async () => {
  prisma.order.findFirst.mockResolvedValue({ ...MARKET, deliveryDriverId: 'd1', status: 'ON_THE_WAY' });
  const ok = await request(makeApp()).post('/api/delivery/d1/orders/o1/delivery-pin').send({ deliveryPin: PIN });
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ ok: true, required: true });
  expect(prisma.order.findFirst.mock.calls[0][0].include.marketplacePipeline).toBeDefined();
  const bad = await request(makeApp()).post('/api/delivery/d1/orders/o1/delivery-pin').send({ deliveryPin: '000000' });
  expect(bad.status).toBe(400);
  expect(bad.body.code).toBe('INVALID_DELIVERY_PIN');
  expect(prisma.order.update).not.toHaveBeenCalled();
});

test('/deliver (ruta antigua) no cierra pedidos del marketplace', async () => {
  prisma.order.findFirst.mockResolvedValue({ ...MARKET, deliveryDriverId: 'd1', status: 'ON_THE_WAY' });
  const res = await request(makeApp()).put('/api/delivery/d1/orders/o1/deliver').send({ deliveryPin: PIN });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('PIN_CONFIRMATION_REQUIRED');
  expect(prisma.order.update).not.toHaveBeenCalled();
});
