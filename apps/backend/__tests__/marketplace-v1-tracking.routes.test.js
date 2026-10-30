'use strict';

// GET /api/marketplace/v1/orders/:id/tracking con el servicio por defecto: con la
// bandera v1 lee la orden real (estado) por el token del comprador; sin ella, 503.
// Prisma va mockeado: sin BD.

const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

const TOKEN = 'c3'.repeat(32);
const ENV_KEYS = ['MARKETPLACE_V1_ORDERS_ENABLED', 'MARKETPLACE_COMMISSION_BPS', 'MARKETPLACE_PIN_SECRET'];
const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
});

const mockOrder = { id: 'o1', restaurantId: 'r1', locationId: 'l1', source: 'MARKETPLACE', status: 'PREPARING' };
jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    marketplaceOrderPipeline: {
      findFirst: jest.fn(async ({ where }) => (where.orderId === 'o1'
        && where.trackingTokenHash === require('crypto').createHash('sha256').update('c3'.repeat(32)).digest('hex')
        ? { orderId: 'o1', restaurantId: 'r1', dispatch: null, order: { ...mockOrder },
          // ISO y no Date: jest corre en otro contexto y structuredClone cambiaría el realm del Date.
          trackingTokenHash: where.trackingTokenHash, trackingExpiresAt: new Date(Date.now() + 3600000).toISOString() }
        : null)),
    },
    location: { findFirst: jest.fn(async () => ({ id: 'l1', restaurantId: 'r1' })) },
  },
}));

function appWith(env) {
  let app;
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  // Cada caso carga los módulos de cero: el servicio por defecto se arma con este env.
  jest.isolateModules(() => {
    const router = require('../src/routes/marketplace-tracking-v1.routes')();
    app = express();
    app.use('/api/marketplace/v1', router);
  });
  return app;
}

it('con la bandera v1 responde el estado real de la orden con el token del comprador', async () => {
  const app = appWith({ MARKETPLACE_V1_ORDERS_ENABLED: 'true', MARKETPLACE_COMMISSION_BPS: '1500', MARKETPLACE_PIN_SECRET: 'p'.repeat(40) });
  const res = await request(app).get('/api/marketplace/v1/orders/o1/tracking').set('X-Marketplace-Order-Token', TOKEN);
  expect(res.status).toBe(200);
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.body).toEqual({ orderId: 'o1', status: 'PREPARING', taskStatus: null, origin: null, courierLocation: null, isStale: false });
  const other = await request(app).get('/api/marketplace/v1/orders/o1/tracking').set('X-Marketplace-Order-Token', 'd4'.repeat(32));
  expect(other.status).toBe(404);
  const missing = await request(app).get('/api/marketplace/v1/orders/o1/tracking');
  expect(missing.status).toBe(401);
  expect(crypto.createHash('sha256').update(TOKEN).digest('hex')).toHaveLength(64);
});

it('sin la bandera v1 el seguimiento sigue respondiendo 503', async () => {
  const app = appWith({});
  const res = await request(app).get('/api/marketplace/v1/orders/o1/tracking').set('X-Marketplace-Order-Token', TOKEN);
  expect(res.status).toBe(503);
  expect(res.body.errorCode).toBe('TRACKING_UNAVAILABLE');
});
