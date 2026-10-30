'use strict';

// Adaptador completo con un Prisma transaccional simulado. No acredita bloqueo
// real de PostgreSQL: esa concurrencia se prueba aparte en el cluster desechable.
const test = require('node:test');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const Module = require('node:module');
const forbidden = () => { throw new Error('Suite local: red y base externa prohibidas'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};
const { hashPin } = require('../src/lib/marketplace-dispatch');
const { createNetworkPersistence, createNetworkOpsPorts } = require('../src/lib/marketplace-network-prisma');
const { createMarketplaceOpsDispatchService } = require('../src/lib/marketplace-ops-dispatch-v1');
const createRouter = require('../src/routes/marketplace-dispatch.routes');
const NOW = new Date('2026-10-26T18:00:00Z');
const tables = ['marketplaceNetworkTask', 'marketplaceNetworkOffer', 'marketplaceNetworkAssignment',
  'marketplaceNetworkCourier', 'marketplaceNetworkMerchant', 'marketplaceNetworkAffiliation',
  'marketplaceNetworkTrip', 'marketplaceNetworkPresence', 'order', 'marketplaceOrderPipeline'];
const clone = value => structuredClone(value);

function fixture({ policy = 'SHARED_ONLY', status = 'READY' } = {}) {
  let state = Object.fromEntries(tables.map(name => [name, new Map()]));
  let currentTime = new Date(NOW);
  const hooks = { commits: 0, rollbacks: 0, conflictTable: null, beforeCommit: null, queries: [] };
  const seed = { id: 'task1', orderId: 'order1', restaurantId: 'r1', locationId: 'l1', merchantId: 'm1',
    deliveryPolicy: policy, status: 'WAITING_READY', version: 0, payoutAmount: 35,
    pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321'), createdAt: NOW.toISOString() };
  state.order.set('order1', { id: 'order1', restaurantId: 'r1', locationId: 'l1', status,
    source: 'MARKETPLACE', orderType: 'DELIVERY', location: { id: 'l1', latitude: 19.43, longitude: -99.13 } });
  state.marketplaceOrderPipeline.set('pipeline1', { id: 'pipeline1', orderId: 'order1', restaurantId: 'r1',
    currency: 'MXN', courierPayoutCents: 3500, dispatch: { task: seed, offer: null } });
  for (const id of ['courier1', 'courier2']) {
    const payload = { id, accountId: `account-${id}`, status: 'ACTIVE', verificationStatus: 'VERIFIED',
      version: 0, isShared: true, isOnline: true, isActive: true };
    state.marketplaceNetworkCourier.set(id, { id, accountId: payload.accountId, status: payload.status,
      verificationStatus: payload.verificationStatus, version: 0, payload });
    state.marketplaceNetworkPresence.set(id, { courierId: id, assignmentId: null, taskId: null, orderId: null,
      restaurantId: null, locationId: null, lastSeenAt: NOW,
      payload: { lat: 19.43, lng: -99.13, lastSeenAt: NOW.toISOString(), isOnline: true, acceptingShared: true, accuracy: 10 } });
  }
  function hydrate(db, table, row) {
    if (table !== 'order') return row;
    return { ...row, marketplacePipeline: [...db.marketplaceOrderPipeline.values()].find(p => p.orderId === row.id) || null,
      marketplaceNetworkTask: [...db.marketplaceNetworkTask.values()].find(t => t.orderId === row.id) || null };
  }
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(part => matches(row, part));
      if (key === 'AND') return value.every(part => matches(row, part));
      const actual = row?.[key];
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('isNot' in value) return actual !== value.isNot;
        if ('is' in value) return actual != null && matches(actual, value.is);
        if ('equals' in value) {
          const target = value.path ? value.path.reduce((v, k) => v?.[k], actual) : actual;
          return isDeepStrictEqual(target, value.equals);
        }
        if ('in' in value) return value.in.includes(actual);
        return matches(actual, value);
      }
      return actual === value;
    });
  }
  function api(db) {
    const tx = {};
    for (const table of tables) {
      const find = where => [...db[table].values()].filter(row => matches(hydrate(db, table, row), where));
      tx[table] = {
        findMany: async ({ where, take } = {}) => clone(find(where).slice(0, take).map(row => hydrate(db, table, row))),
        findFirst: async ({ where } = {}) => clone(find(where)[0] || null),
        findUnique: async ({ where }) => clone(find(where)[0] || null),
        create: async ({ data }) => {
          const key = data.id || data.courierId;
          if (db[table].has(key)) throw Object.assign(new Error('Duplicado'), { code: 'P2002' });
          db[table].set(key, clone(data)); return clone(data);
        },
        updateMany: async ({ where, data }) => {
          if (hooks.conflictTable === table) return { count: 0 };
          const rows = find(where);
          for (const row of rows) Object.assign(row, clone(data));
          return { count: rows.length };
        },
        upsert: async ({ where, create, update }) => {
          const row = find(where)[0];
          if (row) { Object.assign(row, clone(update)); return clone(row); }
          const key = create.id || create.courierId; db[table].set(key, clone(create)); return clone(create);
        },
      };
    }
    tx.$executeRawUnsafe = async sql => { hooks.queries.push(sql); return 1; };
    tx.$queryRawUnsafe = async sql => { hooks.queries.push(sql); return []; };
    return tx;
  }
  const prisma = { $transaction: async work => {
    const draft = clone(state);
    try {
      const result = await work(api(draft));
      if (hooks.beforeCommit) await hooks.beforeCommit();
      state = draft; hooks.commits++;
      return result;
    } catch (error) { hooks.rollbacks++; throw error; }
  } };
  for (const table of tables) prisma[table] = new Proxy({}, { get: (_, method) => (...args) => api(state)[table][method](...args) });
  const now = () => new Date(currentTime);
  const persistence = createNetworkPersistence({ prisma, now });
  const task = () => state.marketplaceNetworkTask.get('task1')?.payload;
  const pipeline = () => state.marketplaceOrderPipeline.get('pipeline1');
  const offer = async () => persistence.run(async r => { await persistence.tick(r); return r.engine.offersForCourier('courier1')[0]; });
  const accept = async () => { const row = await offer(); return persistence.run(r => r.engine.acceptOffer({ offerId: row.id, courierId: 'courier1' })); };
  return { prisma, persistence, now, hooks, task, pipeline, offer, accept,
    state: () => state, advance: ms => { currentTime = new Date(+currentTime + ms); } };
}

test('importa política de red explícita y conserva pipeline y asignación después de reconstruir el adaptador', async () => {
  const f = fixture(); await f.accept();
  const restored = createNetworkPersistence({ prisma: f.prisma, now: f.now });
  const task = await restored.run(r => r.engine.taskFor('task1'));
  assert.equal(task.status, 'ASSIGNED');
  assert.equal(task.currentAssignment.courierId, 'courier1');
  assert.equal(f.pipeline().dispatch.task.currentAssignmentId, task.currentAssignmentId);
  assert.equal(f.pipeline().dispatch.assignment.id, task.currentAssignmentId);
  assert.equal(f.state().marketplaceNetworkAssignment.size, 1);
  assert.ok(f.hooks.queries.some(q => q.includes('pg_advisory_xact_lock')));
  assert.ok(f.hooks.queries.some(q => q.includes('FOR UPDATE')));
});

for (const [policy, status] of [['MANUAL', 'READY'], ['SHARED_ONLY', 'PENDING_PAYMENT'], ['SHARED_ONLY', 'PENDING_MERCHANT']]) {
  test(`${policy}/${status}: no importa ni ofrece la orden y no altera su pipeline`, async () => {
    const f = fixture({ policy, status }); const before = clone(f.pipeline());
    const offers = await f.persistence.run(async r => { await f.persistence.tick(r); return r.engine.offersForCourier('courier1'); });
    assert.deepEqual(offers, []); assert.equal(f.state().marketplaceNetworkTask.size, 0);
    assert.deepEqual(f.pipeline(), before); assert.equal(f.state().order.get('order1').status, status);
  });
}

test('cada PIN fallido hace commit del contador, bloqueo sobrevive recreación y se desbloquea tras 15 minutos', async () => {
  const f = fixture(); await f.accept();
  const baseline = f.hooks.commits;
  for (let n = 0; n < 10; n++) {
    await assert.rejects(f.persistence.run(r => r.engine.confirmPickup({ taskId: 'task1', courierId: 'courier1', pickupPin: '000000' })), { code: 'INVALID_PIN' });
    assert.equal(f.task().pinAttempts.pickup.failures, n + 1);
    assert.equal(f.task().status, 'ASSIGNED');
    assert.equal(f.state().order.get('order1').status, 'READY');
  }
  assert.equal(f.hooks.commits, baseline + 10);
  const restored = createNetworkPersistence({ prisma: f.prisma, now: f.now });
  await assert.rejects(restored.run(r => r.engine.confirmPickup({ taskId: 'task1', courierId: 'courier1', pickupPin: '123456' })), { code: 'DELIVERY_PIN_LOCKED', statusCode: 429 });
  f.advance(15 * 60 * 1000);
  await restored.run(r => r.engine.confirmPickup({ taskId: 'task1', courierId: 'courier1', pickupPin: '123456' }));
  assert.equal(f.task().status, 'PICKED_UP'); assert.equal(f.state().order.get('order1').status, 'ON_THE_WAY');
  assert.equal(f.task().pinAttempts.pickup, undefined);
});

test('error ajeno al PIN revierte toda la transacción', async () => {
  const f = fixture(); await f.accept(); const before = clone(f.state());
  await assert.rejects(f.persistence.run(r => {
    r.store.tasks.get('task1').status = 'DELIVERED'; throw new Error('fallo sintético');
  }), /fallo sintético/);
  assert.deepEqual(f.state(), before); assert.equal(f.hooks.rollbacks, 1);
});

test('conflicto del pipeline revierte también un contador de PIN sin confirmar', async () => {
  const f = fixture(); await f.accept(); const before = clone(f.state());
  f.hooks.conflictTable = 'marketplaceOrderPipeline';
  await assert.rejects(f.persistence.run(r => r.engine.confirmPickup({ taskId: 'task1', courierId: 'courier1', pickupPin: '000000' })), { code: 'NETWORK_PIPELINE_CONFLICT' });
  assert.deepEqual(f.state(), before);
});

test('reasignación Ops no conserva arrays obsoletos que resuciten ofertas o asignaciones', async () => {
  const f = fixture(); await f.accept(); const oldAssignment = f.task().currentAssignmentId;
  const ops = createMarketplaceOpsDispatchService(createNetworkOpsPorts(f.persistence));
  await ops.reassign({ id: 'super1', roles: ['SUPER_ADMIN'], isActive: true }, 'task1', { reason: 'Nueva ruta' });
  assert.equal(f.task().offers, undefined); assert.equal(f.task().assignments, undefined);
  assert.equal(f.state().marketplaceNetworkAssignment.get(oldAssignment).status, 'REASSIGNED');
  await f.accept();
  const accepted = [...f.state().marketplaceNetworkOffer.values()].filter(o => o.status === 'ACCEPTED').map(o => o.id);
  await f.persistence.run(async r => { await f.persistence.tick(r); });
  assert.equal(f.state().marketplaceNetworkAssignment.get(oldAssignment).status, 'REASSIGNED');
  assert.equal([...f.state().marketplaceNetworkAssignment.values()].filter(a => a.status === 'ACTIVE').length, 1);
  for (const id of accepted) assert.equal(f.state().marketplaceNetworkOffer.get(id).status, 'ACCEPTED');
});

function routeFixture(persistence) {
  const routes = new Map();
  createRouter({ persistence, networkEnabled: true, authenticate: (req, res, next) => next(),
    Router: () => ({ use() {}, get: (path, fn) => routes.set(`GET ${path}`, fn),
      post: (path, fn) => routes.set(`POST ${path}`, fn), put: (path, fn) => routes.set(`PUT ${path}`, fn) }) });
  const response = () => ({ statusCode: 200, payload: undefined, sent: 0, set() { return this; },
    status(v) { this.statusCode = v; return this; }, json(v) { this.payload = clone(v); this.sent++; return this; } });
  const req = { user: { id: 'courier1', role: 'DELIVERY', isActive: true, isDevice: false }, headers: {}, query: {}, body: {}, params: {} };
  return { routes, response, req };
}

test('HTTP no emite éxito antes de que PostgreSQL confirme la transacción', async () => {
  const f = fixture(); let release; let entered;
  const atCommit = new Promise(resolve => { entered = resolve; });
  f.hooks.beforeCommit = () => { entered(); return new Promise(resolve => { release = resolve; }); };
  const { routes, response, req } = routeFixture(f.persistence); const res = response();
  const pending = routes.get('GET /couriers/me/offers')(req, res);
  await atCommit;
  assert.equal(res.sent, 0); assert.equal(f.state().marketplaceNetworkOffer.size, 0);
  release(); await pending;
  assert.equal(res.sent, 1); assert.equal(res.statusCode, 200); assert.equal(res.payload.offers.length, 1);
  assert.doesNotMatch(JSON.stringify(res.payload), /PinHash|pinAttempts|123456|654321/);
});

test('HTTP devuelve solo error si falla el commit posterior al handler', async () => {
  const f = fixture(); f.hooks.beforeCommit = () => { throw new Error('commit fallido'); };
  const { routes, response, req } = routeFixture(f.persistence); const res = response();
  await routes.get('GET /couriers/me/offers')(req, res);
  assert.equal(res.sent, 1); assert.equal(res.statusCode, 503);
  assert.equal(res.payload.errorCode, 'DISPATCH_UNAVAILABLE');
  assert.equal(f.state().marketplaceNetworkOffer.size, 0);
});

test('HTTP PIN incorrecto confirma contador pero jamás anuncia entrega exitosa', async () => {
  const f = fixture(); await f.accept();
  const { routes, response, req } = routeFixture(f.persistence); const res = response();
  await routes.get('POST /couriers/tasks/:id/pickup')({ ...req, params: { id: 'task1' }, body: { pickupPin: '000000' } }, res);
  assert.equal(res.statusCode, 400); assert.equal(res.payload.errorCode, 'INVALID_PIN'); assert.equal(res.sent, 1);
  assert.equal(f.task().pinAttempts.pickup.failures, 1);
  assert.equal(f.state().order.get('order1').status, 'READY');
});
