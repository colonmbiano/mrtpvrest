'use strict';

jest.mock('@mrtpvrest/database', () => ({ prisma: {
  order: { findUnique: jest.fn() },
  orderRound: { findUnique: jest.fn() },
  $transaction: jest.fn(),
} }));
jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { id: 'u1', restaurantId: 'r1', role: 'CASHIER' };
    req.locationId = 'loc1';
    next();
  },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
  requirePermission: () => (_req, _res, next) => next(),
  userHasPermission: () => true,
  hasValidOverride: () => false,
}));
jest.mock('../src/middleware/shift.middleware', () => ({
  requireActiveShift: (_req, _res, next) => next(),
}));
const { createHash } = require('node:crypto');
const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const routes = require('../src/routes/orders.routes');
const app = express();
app.use(express.json());
app.use('/api/orders', routes);
const payload = { clientOrderId: 'round-command-1', items: [{ menuItemId: 'm1', quantity: 1 }] };
const roundId = `tpv-${createHash('sha256').update(JSON.stringify(['r1', 'o1', payload.clientOrderId])).digest('hex')}`;

beforeEach(() => {
  jest.resetAllMocks();
  prisma.order.findUnique.mockResolvedValue({
    id: 'o1', restaurantId: 'r1', locationId: 'loc1', status: 'DELIVERED', paymentStatus: 'PAID',
    total: 40, items: [{ id: 'line-1', quantity: 2 }],
  });
  prisma.orderRound.findUnique.mockResolvedValue({ id: roundId, orderId: 'o1', roundNumber: 2 });
});

test.each(['items', 'rounds'])('acknowledges persisted %s even after account payment, without new writes', async (path) => {
  const response = await request(app).post(`/api/orders/o1/${path}`).send(payload);
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ total: 40, lastRound: { id: roundId } });
  expect(prisma.orderRound.findUnique).toHaveBeenCalledWith({ where: { id: roundId } });
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test.each([{ restaurantId: 'other' }, { locationId: 'other' }])('rejects out-of-scope replay %j', async (scope) => {
  prisma.order.findUnique.mockResolvedValueOnce({ id: 'o1', restaurantId: 'r1', locationId: 'loc1', ...scope });
  const response = await request(app).post('/api/orders/o1/items').send(payload);
  expect(response.status).toBe(403);
  expect(prisma.orderRound.findUnique).not.toHaveBeenCalled();
});

test('a different command cannot append to a paid order', async () => {
  prisma.orderRound.findUnique.mockResolvedValueOnce(null);
  const response = await request(app).post('/api/orders/o1/items').send(payload);
  expect(response.status).toBe(400);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test('rejects oversized command IDs before querying', async () => {
  const response = await request(app).post('/api/orders/o1/items').send({ ...payload, clientOrderId: 'x'.repeat(121) });
  expect(response.status).toBe(400);
  expect(prisma.order.findUnique).not.toHaveBeenCalled();
});
