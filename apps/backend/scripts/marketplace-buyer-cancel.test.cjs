'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express'), request = require('supertest');
const { createBuyerCancellation } = require('../src/lib/marketplace-buyer-cancel');
const router = require('../src/routes/marketplace-orders-v1.routes');

function setup(status = 'PENDING_MERCHANT', outcome = 'CANCELLED') {
  const calls = [];
  const prisma = {
    marketplaceQuote: { findFirst: async ({ where }) => where.accountId === 'buyer1' && where.orderId === 'order1' ? { restaurantId: 'r1' } : null },
    order: { findFirst: async ({ where }) => { assert.equal(where.restaurantId, 'r1'); assert.equal(where.source, 'MARKETPLACE'); return { status }; } },
  };
  const cancel = createBuyerCancellation({ prisma, cancellation: { cancelOrder: async args => { calls.push(args); return { outcome }; } } });
  const app = express();
  app.use(express.json());
  app.use('/api/marketplace/v1/orders', router({
    resolveAccount: async req => req.headers.authorization?.slice(7),
    buyerCancellation: cancel,
  }));
  return { app, calls };
}

test('el comprador dueño cancela solo antes de aceptar usando el servicio compartido', async () => {
  for (const state of ['PENDING_PAYMENT', 'PENDING_MERCHANT']) {
    const { app, calls } = setup(state);
    const res = await request(app).post('/api/marketplace/v1/orders/order1/cancel').set('Authorization', 'Bearer buyer1').send({});
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'CANCELLED');
    assert.equal(calls[0].actor.id, 'buyer-buyer1');
    assert.deepEqual(calls[0].fromStatuses, ['PENDING_PAYMENT', 'PENDING_MERCHANT']);
  }
});

test('otra cuenta recibe 404 y una orden aceptada o que cambió no se cancela', async () => {
  const other = setup();
  assert.equal((await request(other.app).post('/api/marketplace/v1/orders/order1/cancel').set('Authorization', 'Bearer buyer2')).status, 404);
  assert.equal(other.calls.length, 0);
  for (const state of ['CONFIRMED', 'READY', 'CANCELLED', 'DELIVERED']) {
    const f = setup(state);
    assert.equal((await request(f.app).post('/api/marketplace/v1/orders/order1/cancel').set('Authorization', 'Bearer buyer1')).status, 409);
    assert.equal(f.calls.length, 0);
  }
  const raced = setup('PENDING_MERCHANT', 'SKIPPED');
  assert.equal((await request(raced.app).post('/api/marketplace/v1/orders/order1/cancel').set('Authorization', 'Bearer buyer1')).status, 409);
});

test('un invitado y un request sin sesión no cancelan aunque falsifiquen accountId', async () => {
  const f = setup();
  for (const token of ['', 'guest:buyer1']) {
    const call = request(f.app).post('/api/marketplace/v1/orders/order1/cancel');
    if (token) call.set('Authorization', 'Bearer ' + token);
    assert.equal((await call.send({ accountId: 'buyer1' })).status, 401);
  }
  assert.equal(f.calls.length, 0);
});
