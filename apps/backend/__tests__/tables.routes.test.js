'use strict';

process.env.TABLE_QR_SECRET = 'llave-de-pruebas-para-el-qr-de-mesa';

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
const { OPEN_TABLE_STATUSES } = require('../src/lib/table-status');

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
          status: { in: OPEN_TABLE_STATUSES },
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

  test('un pedido del QR de mesa aun en PENDING ocupa la mesa', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 'table-3', name: 'Mesa 3', status: 'AVAILABLE', zone: null },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-qr',
        tableId: 'table-3',
        orderNumber: 'WEB-000012',
        status: 'PENDING',
        paymentStatus: 'PENDING',
        total: 180,
        _count: { items: 2 },
        createdAt: new Date(),
      },
    ]);

    const response = await request(makeApp()).get('/api/tables').expect(200);

    expect(response.body[0]).toMatchObject({
      id: 'table-3',
      status: 'OCCUPIED',
      activeOrder: { id: 'order-qr', total: 180 },
    });
  });

  test('una cuenta que cocina avanzo a PREPARING sigue ocupando la mesa', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 'table-9', name: 'Mesa 9', status: 'AVAILABLE', zone: null },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-9',
        tableId: 'table-9',
        orderNumber: 'TPV-000009',
        status: 'PREPARING',
        paymentStatus: 'PENDING',
        total: 95,
        _count: { items: 1 },
        createdAt: new Date(),
      },
    ]);

    const response = await request(makeApp()).get('/api/tables').expect(200);

    expect(response.body[0]).toMatchObject({ id: 'table-9', status: 'OCCUPIED' });
  });
});

// ── GET /api/tables/qr ──────────────────────────────────────────────────────
// El panel arma el QR con esto. El token ata el pedido al tableId real, así que
// renombrar la mesa no reasigna el papel pegado ni hay ambigüedad entre dos
// mesas con el mismo número.
describe('GET /api/tables/qr', () => {
  const { verifyTableToken } = require('../src/lib/table-qr');

  test('cada mesa sale con un token que resuelve a su id', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 't-2', name: 'Mesa 2', locationId: 'loc1' },
      { id: 't-10', name: 'Mesa 10', locationId: 'loc1' },
    ]);

    const response = await request(makeApp()).get('/api/tables/qr').expect(200);

    expect(response.body).toHaveLength(2);
    for (const row of response.body) {
      expect(verifyTableToken(row.qrToken)).toEqual({ tableId: row.id, number: row.number });
    }
  });

  test('orden natural: Mesa 2 antes que Mesa 10', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 't-10', name: 'Mesa 10', locationId: 'loc1' },
      { id: 't-2', name: 'Mesa 2', locationId: 'loc1' },
    ]);

    const response = await request(makeApp()).get('/api/tables/qr').expect(200);

    expect(response.body.map((t) => t.name)).toEqual(['Mesa 2', 'Mesa 10']);
  });

  test('mesa sin número en el nombre también recibe token', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: 't-barra', name: 'Barra', locationId: 'loc1' },
    ]);

    const response = await request(makeApp()).get('/api/tables/qr').expect(200);

    expect(response.body[0].number).toBeNull();
    expect(verifyTableToken(response.body[0].qrToken)).toEqual({ tableId: 't-barra', number: null });
  });

  test('solo mesas activas de la sucursal del token', async () => {
    prisma.table.findMany.mockResolvedValue([]);

    await request(makeApp()).get('/api/tables/qr').expect(200);

    expect(prisma.table.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locationId: 'location-1', isActive: true } }),
    );
  });
});
