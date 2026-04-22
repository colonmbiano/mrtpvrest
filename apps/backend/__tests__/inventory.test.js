'use strict';

// Mock heavy dependencies before require
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    supplier: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    ingredient: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn(), findUnique: jest.fn() },
    inventoryMovement: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
    location: { findUnique: jest.fn() },
    pushSubscription: { findMany: jest.fn() },
  },
}));

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authenticate: (req, _res, next) => { req.user = { id: 'u1', restaurantId: 'r1', tenantId: 't1', role: 'ADMIN' }; next(); },
  requireAdmin: (_req, _res, next) => next(),
  requireTenantAccess: (_req, _res, next) => next(),
}));

const express = require('express');
const request = require('supertest');
const { prisma } = require('@mrtpvrest/database');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/inventory', require('../src/routes/inventory.routes'));
  return app;
}

describe('GET /api/inventory/alerts', () => {
  it('returns low-stock ingredients', async () => {
    prisma.ingredient.findMany.mockResolvedValue([
      { id: 'i1', name: 'Tomate', unit: 'kg', stock: 0.5, minStock: 1 },
      { id: 'i2', name: 'Cebolla', unit: 'kg', stock: 5, minStock: 1 },
    ]);

    const app = buildApp();
    const res = await request(app)
      .get('/api/inventory/alerts')
      .set('x-location-id', 'loc1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Tomate');
  });

  it('returns 400 when locationId missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/inventory/alerts');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/inventory/movements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('records IN movement and returns no lowStock', async () => {
    const ingredient = { id: 'i1', locationId: 'loc1', stock: 5, minStock: 2, name: 'Tomate', unit: 'kg' };
    const updated = { id: 'i1', name: 'Tomate', unit: 'kg', stock: 8, minStock: 2 };
    const movement = { id: 'm1', ingredientId: 'i1', type: 'IN', quantity: 3 };

    prisma.ingredient.findUnique.mockResolvedValue(ingredient);
    prisma.$transaction.mockResolvedValue([movement, updated]);
    prisma.pushSubscription.findMany.mockResolvedValue([]);

    const app = buildApp();
    const res = await request(app)
      .post('/api/inventory/movements')
      .set('x-location-id', 'loc1')
      .send({ ingredientId: 'i1', type: 'IN', quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.lowStock).toBe(false);
    expect(res.body.ingredient.stock).toBe(8);
  });

  it('records OUT movement and flags lowStock', async () => {
    const ingredient = { id: 'i1', locationId: 'loc1', stock: 1.5, minStock: 2, name: 'Tomate', unit: 'kg' };
    const updated = { id: 'i1', name: 'Tomate', unit: 'kg', stock: 0.5, minStock: 2 };
    const movement = { id: 'm1', ingredientId: 'i1', type: 'OUT', quantity: 1 };

    prisma.ingredient.findUnique.mockResolvedValue(ingredient);
    prisma.$transaction.mockResolvedValue([movement, updated]);
    prisma.pushSubscription.findMany.mockResolvedValue([]);
    prisma.location.findUnique.mockResolvedValue(null);

    const app = buildApp();
    const res = await request(app)
      .post('/api/inventory/movements')
      .set('x-location-id', 'loc1')
      .send({ ingredientId: 'i1', type: 'OUT', quantity: 1 });

    expect(res.status).toBe(201);
    expect(res.body.lowStock).toBe(true);
  });

  it('returns 409 when OUT exceeds current stock', async () => {
    prisma.ingredient.findUnique.mockResolvedValue({
      id: 'i1', locationId: 'loc1', stock: 0.5, minStock: 2, name: 'Tomate', unit: 'kg',
    });

    const app = buildApp();
    const res = await request(app)
      .post('/api/inventory/movements')
      .set('x-location-id', 'loc1')
      .send({ ingredientId: 'i1', type: 'OUT', quantity: 5 });

    expect(res.status).toBe(409);
  });

  it('returns 400 on invalid type', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/inventory/movements')
      .set('x-location-id', 'loc1')
      .send({ ingredientId: 'i1', type: 'INVALID', quantity: 1 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when locationId missing', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/api/inventory/movements')
      .send({ ingredientId: 'i1', type: 'IN', quantity: 1 });

    expect(res.status).toBe(400);
  });
});
