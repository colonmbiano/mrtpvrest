'use strict';

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    table: {
      findMany: jest.fn(),
    },
    order: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => {
    req.user = { role: 'WAITER', restaurantId: 'restaurant-1' };
    req.locationId = 'location-1';
    next();
  },
  requireTenantAccess: (_req, _res, next) => next(),
  requireRole: () => (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');
const tableRoutes = require('../src/routes/tables.routes');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/tables', tableRoutes);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/tables', () => {
  test('una orden OPEN prevalece sobre un status AVAILABLE desfasado', async () => {
    prisma.table.findMany.mockResolvedValue([
      {
        id: 'table-7',
        name: 'Mesa 7',
        status: 'AVAILABLE',
        zone: { id: 'zone-1', name: 'Salon' },
      },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-7',
        tableId: 'table-7',
        orderNumber: 'TPV-000007',
        status: 'OPEN',
        paymentStatus: 'PENDING',
        total: 420,
        _count: { items: 6 },
        createdAt: new Date(),
      },
    ]);

    const response = await request(makeApp()).get('/api/tables').expect(200);

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tableId: { in: ['table-7'] },
          status: 'OPEN',
          paymentStatus: { not: 'PAID' },
        },
      }),
    );
    expect(response.body[0]).toMatchObject({
      id: 'table-7',
      status: 'OCCUPIED',
      activeOrder: {
        id: 'order-7',
        total: 420,
        _count: { items: 6 },
      },
    });
  });
});
