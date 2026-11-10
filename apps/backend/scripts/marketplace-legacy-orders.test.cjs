'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const createRouter = require('../src/routes/marketplace.routes');
const { fixture, input, NOW, PIN_SECRET } = require('./helpers/marketplace-orders-fixture.cjs');

function appFor(f, env) {
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace', createRouter({
    env, storeSlugs: 'alpha', getPrisma: () => f.prisma,
    orderOptions: { now: () => new Date(NOW), pinSecrets: { test: PIN_SECRET }, activePinKeyId: 'test' },
  }));
  return app;
}

test('legacy creation is disabled before loading persistence unless the flag is exactly true', async () => {
  for (const value of [undefined, '', 'false', 'TRUE', ' true ']) {
    const f = fixture();
    const app = appFor(f, { MARKETPLACE_LEGACY_ORDERS_ENABLED: value });
    const result = await request(app).post('/api/marketplace/orders').send({});
    assert.equal(result.status, 404);
    assert.deepEqual(result.body, { errorCode: 'LEGACY_ORDERS_DISABLED' });
    assert.equal(f.calls.length, 0);
    assert.equal(result.headers['cache-control'], 'no-store');
  }
});

test('explicit legacy activation permits a priced cash order and disabling it preserves tracking', async () => {
  const f = fixture();
  const { idempotencyKey, ...body } = input({ paymentMethod: 'CASH' });
  const created = await request(appFor(f, { MARKETPLACE_LEGACY_ORDERS_ENABLED: 'true' }))
    .post('/api/marketplace/orders').set('Idempotency-Key', idempotencyKey).send(body);
  assert.equal(created.status, 201);
  assert.equal(f.state.order.length, 1);
  const tracked = await request(appFor(f, {})).get('/api/marketplace/orders/' + created.body.id + '/status')
    .set('x-marketplace-order-token', created.body.trackingToken);
  assert.equal(tracked.status, 200);
  assert.equal(tracked.body.id, created.body.id);
});
