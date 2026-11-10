'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const settings = require('../src/lib/marketplace-owner-settings');
const createRouter = require('../src/routes/marketplace-owner-settings.routes');
const env = { MARKETPLACE_V1_ORDERS_ENABLED: 'true', MARKETPLACE_V1_DELIVERY_ENABLED: 'true', MARKETPLACE_COMMISSION_BPS: '1500', MARKETPLACE_PIN_SECRET: 'x'.repeat(32) };
const base = settings.defaults(env);
function database() {
  let state = { row: null, history: [] };
  function client(get) {
    return { globalConfig: {
      findUnique: async () => structuredClone(get().row),
      upsert: async () => { get().row ||= { marketplaceSettings: null, marketplaceSettingsVersion: 0 }; },
      updateMany: async ({ where, data }) => {
        if (get().row.marketplaceSettingsVersion !== where.marketplaceSettingsVersion) return { count: 0 };
        get().row.marketplaceSettings = structuredClone(data.marketplaceSettings);
        get().row.marketplaceSettingsVersion++;
        return { count: 1 };
      },
    }, systemLog: {
      create: async ({ data }) => { get().history.unshift({ ...data, id: String(get().history.length), createdAt: new Date().toISOString() }); },
      findMany: async () => structuredClone(get().history),
    } };
  }
  const db = client(() => state);
  db.$transaction = async action => {
    const next = structuredClone(state);
    const result = await action(client(() => next));
    state = next;
    return result;
  };
  return db;
}
test('no persisted override preserves deployed settings and never returns secret values', async () => {
  const value = await settings.getOwnerSettings(database(), env);
  assert.deepEqual(value.settings, base);
  assert.equal(value.version, 0);
  assert.equal(value.persisted, false);
  assert.ok(!JSON.stringify(value).includes(env.MARKETPLACE_PIN_SECRET));
});
test('save persists settings with actor audit; stale writes and unknown keys are rejected', async () => {
  const db = database();
  const value = { ...base, commissionBps: 0, maxDeliveryKm: 3 };
  const saved = await settings.saveOwnerSettings(db, { version: 0, settings: value }, 'owner', env);
  assert.deepEqual(saved.settings, value);
  assert.equal(saved.version, 1);
  assert.equal(saved.history[0].metadata.actorId, 'owner');
  assert.deepEqual(saved.history[0].metadata.before, base);
  await assert.rejects(settings.saveOwnerSettings(db, { version: 0, settings: base }, 'owner', env), { code: 'SETTINGS_CHANGED' });
  assert.equal((await settings.getOwnerSettings(db, env)).history.length, 1);
  for (const invalid of [{ ...base, maxDeliveryKm: 6 }, { ...base, maxDeliveryKm: 0 }, { ...base, commissionBps: -1 },
    { ...base, commissionBps: 1.5 }, { ...base, ordersEnabled: 'true' }, { ...base, secret: 'leak' }]) {
    await assert.rejects(settings.saveOwnerSettings(db, { version: 1, settings: invalid }, 'owner', env), { code: 'INVALID_SETTINGS' });
  }
});
test('enabling orders requires a PIN signing key and audit failure rolls back the change', async () => {
  await assert.rejects(settings.saveOwnerSettings(database(), { version: 0, settings: base }, 'owner', {}), { code: 'PIN_REQUIRED' });
  const db = database();
  const transaction = db.$transaction;
  db.$transaction = action => transaction(tx => { tx.systemLog.create = async () => { throw new Error('audit unavailable'); }; return action(tx); });
  await assert.rejects(settings.saveOwnerSettings(db, { version: 0, settings: base }, 'owner', env));
  assert.equal((await settings.readSettings(db, env)).version, 0);
});
test('request contexts isolate simultaneous settings; existing orders retain services during a pause', async () => {
  await Promise.all([1000, 2000].map(commissionBps => settings.context.run({ persisted: true, settings: { ...base, ordersEnabled: false, commissionBps } }, async () => {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settings.ordersAllowed(), false);
    const runtime = settings.runtimeEnv(env);
    assert.equal(runtime.MARKETPLACE_COMMISSION_BPS, String(commissionBps));
    assert.equal(runtime.MARKETPLACE_V1_ORDERS_ENABLED, 'true');
    assert.equal(env.MARKETPLACE_COMMISSION_BPS, '1500');
  })));
  assert.equal(settings.ordersAllowed(), true);
  assert.equal(settings.runtimeEnv(env), env);
  settings.context.run({ persisted: false, settings: { ...base, ordersEnabled: false } }, () => {
    // Before the first panel save, the v1 environment gate must not disable legacy orders.
    assert.equal(settings.ordersAllowed(), true);
    assert.equal(settings.runtimeEnv(env), env);
  });
});
test('settings endpoint rejects customers, staff, inactive users and devices', async () => {
  for (const user of [undefined, { role: 'OWNER', id: 'x', isActive: true }, { role: 'SUPER_ADMIN', id: 'x', isActive: false },
    { role: 'SUPER_ADMIN', id: 'x', isActive: true, isDevice: true }]) {
    const app = express();
    app.use(express.json(), (req, _res, next) => { req.user = user; next(); });
    app.use(createRouter({ prisma: database(), runWithBypass: fn => fn() }));
    assert.equal((await request(app).get('/')).status, 403);
    assert.equal((await request(app).patch('/').send({ version: 0, settings: base })).status, 403);
  }
});
test('a pause blocks quote and order POST but keeps reading existing order codes', async () => {
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => settings.context.run({ persisted: true, settings: { ...base, ordersEnabled: false } }, next));
  app.use('/quotes', require('../src/routes/marketplace-quotes.routes')({ service: { createQuote: () => assert.fail('paused') } }));
  app.use('/orders', require('../src/routes/marketplace-orders-v1.routes')({ resolveAccount: async () => 'buyer',
    service: { createOrder: () => assert.fail('paused'), codesForAccount: async () => ({ pickupPin: 'test' }) } }));
  app.use('/legacy', require('../src/routes/marketplace.routes')({ env: { MARKETPLACE_LEGACY_ORDERS_ENABLED: 'true' } }));
  assert.equal((await request(app).post('/quotes').send({})).body.errorCode, 'ORDERS_PAUSED');
  assert.equal((await request(app).post('/orders').send({})).body.errorCode, 'ORDERS_PAUSED');
  assert.equal((await request(app).post('/legacy/orders').send({})).body.errorCode, 'ORDERS_PAUSED');
  assert.equal((await request(app).get('/orders/old/codes').set('Authorization', 'Bearer test')).status, 200);
});
