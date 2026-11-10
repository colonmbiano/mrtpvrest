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
        if ('is' in value) return value.is === null ? actual == null : actual != null && matches(actual, value.is);
        if ('notIn' in value) return !value.notIn.includes(actual);
        if ('gt' in value) return actual > value.gt;
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
        findMany: async ({ where, take, orderBy } = {}) => {
          const rows = find(where);
          if (orderBy?.id) rows.sort((a, b) => (a.id < b.id ? -1 : 1) * (orderBy.id === 'desc' ? -1 : 1));
          return clone(rows.slice(0, take).map(row => hydrate(db, table, row)));
        },
        findFirst: async ({ where } = {}) => clone(find(where)[0] || null),
        findUnique: async ({ where }) => clone(find(where)[0] || null),
        createMany: async ({ data }) => {
          for (const row of data) {
            const key = row.id || row.courierId;
            if (db[table].has(key)) throw Object.assign(new Error('Duplicado'), { code: 'P2002' });
            db[table].set(key, clone(row));
          }
          return { count: data.length };
        },
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
    const sql = strings => strings.join('?');
    tx.$executeRaw = async (strings, ...values) => {
      const text = sql(strings); hooks.queries.push(text); hooks.values = values;
      if (text.startsWith('UPDATE marketplace_network_offers')) {
        if (hooks.conflictTable === 'marketplaceNetworkOffer') return 0;
        const [status, , ids] = values; let n = 0;
        for (const id of ids) { const row = db.marketplaceNetworkOffer.get(id); if (row) { row.status = status; row.payload = { ...row.payload, status }; n++; } }
        return n;
      }
      return 1;
    };
    tx.$queryRaw = async (strings, ...values) => {
      const text = sql(strings); hooks.queries.push(text);
      if (text.includes('pg_try_advisory_xact_lock')) {
        if (hooks.lockBusy > 0) { hooks.lockBusy--; return [{ locked: false }]; }
        return [{ locked: true }];
      }
      hooks.lockedOrders = values[0]; return [];
    };
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
  assert.ok(f.hooks.queries.some(q => q.includes('pg_try_advisory_xact_lock')));
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

// ── C6: solo lo vivo entra al motor ─────────────────────────────────────────
async function deliver(f) {
  await f.accept();
  await f.persistence.run(r => r.engine.confirmPickup({ taskId: 'task1', courierId: 'courier1', pickupPin: '123456' }));
  await f.persistence.run(r => r.engine.confirmDelivery({ taskId: 'task1', courierId: 'courier1', deliveryPin: '654321' }));
  assert.equal(f.task().status, 'DELIVERED');
}

test('C6: una tarea entregada ya no se carga ni bloquea su orden; se carga si la petición la nombra', async () => {
  const f = fixture(); await deliver(f);
  f.hooks.lockedOrders = undefined;
  const live = await f.persistence.run(async r => ({ tasks: [...r.store.tasks.keys()], orders: [...r.store.orders.keys()],
    offers: r.store.offers.size, assignments: r.store.assignments.size }));
  assert.deepEqual(live, { tasks: [], orders: [], offers: 0, assignments: 0 });
  assert.equal(f.hooks.lockedOrders, undefined, 'sin órdenes vivas no hay FOR UPDATE');
  const named = await f.persistence.run(r => r.engine.taskFor('task1'), { taskIds: ['task1'] });
  assert.equal(named.status, 'DELIVERED');
  assert.deepEqual(f.hooks.lockedOrders, ['order1']);
  assert.match(f.hooks.queries.at(-1), /FOR UPDATE OF o/);
});

test('C6: Ops ve las terminadas desde la tabla, mezcladas por id con las vivas y con sus filtros', async () => {
  const f = fixture(); await deliver(f);
  const ops = createMarketplaceOpsDispatchService(createNetworkOpsPorts(f.persistence));
  const admin = { id: 'super1', roles: ['SUPER_ADMIN'], isActive: true };
  const delivered = await ops.listDispatch(admin, { status: 'DELIVERED' });
  assert.deepEqual(delivered.items.map(t => [t.id, t.status]), [['task1', 'DELIVERED']]);
  assert.equal((await ops.listDispatch(admin, {})).items.length, 1);
  assert.equal((await ops.listDispatch(admin, { status: 'OFFERING' })).items.length, 0);
  assert.equal((await ops.listDispatch(admin, { status: 'DELIVERED', merchantId: 'otro' })).items.length, 0);
});

test('C6: la presencia GPS escribe solo la fila del repartidor, sin el bloqueo de la red, y se liga a su tarea', async () => {
  const f = fixture(); await f.accept();
  const locks = f.hooks.queries.filter(q => q.includes('pg_try_advisory_xact_lock')).length;
  const presence = await f.persistence.updatePresence('courier1', { isOnline: true, lat: 19.44, lng: -99.14, accuracy: 8 });
  assert.equal(presence.lat, 19.44); assert.equal(presence.acceptingShared, true, 'conserva la preferencia previa');
  assert.equal(f.hooks.queries.filter(q => q.includes('pg_try_advisory_xact_lock')).length, locks);
  const row = f.state().marketplaceNetworkPresence.get('courier1');
  assert.equal(row.taskId, 'task1'); assert.equal(row.orderId, 'order1'); assert.equal(row.assignmentId, f.task().currentAssignmentId);
  assert.equal(row.payload.isOnline, true);
  const other = await f.persistence.updatePresence('courier2', { isOnline: false });
  assert.equal(other.lat, null); assert.equal(f.state().marketplaceNetworkPresence.get('courier2').taskId, null);
  const blocked = f.state().marketplaceNetworkCourier.get('courier2'); blocked.verificationStatus = 'PENDING_VERIFICATION';
  await assert.rejects(f.persistence.updatePresence('courier2', { isOnline: true, lat: 1, lng: 1 }), { code: 'COURIER_FORBIDDEN' });
  // El motor lee la presencia nueva en la siguiente corrida.
  const seen = await f.persistence.run(r => r.store.couriers.get('courier1').presence.lat);
  assert.equal(seen, 19.44);
});

test('C6: la ruta de presencia usa el camino directo y valida como antes', async () => {
  const f = fixture();
  const { routes, response, req } = routeFixture(f.persistence);
  const ok = response();
  await routes.get('POST /couriers/me/presence')({ ...req, body: { isOnline: true, lat: 19.5, lng: -99.2 } }, ok);
  assert.equal(ok.statusCode, 200); assert.equal(ok.payload.presence.lat, 19.5);
  assert.equal(f.state().marketplaceNetworkPresence.get('courier1').payload.lat, 19.5);
  const bad = response();
  await routes.get('POST /couriers/me/presence')({ ...req, body: { isOnline: true, lat: 999, lng: 0 } }, bad);
  assert.equal(bad.statusCode, 422); assert.equal(bad.payload.errorCode, 'INVALID_PRESENCE');
  const spoof = response();
  await routes.get('POST /couriers/me/presence')({ ...req, body: { isOnline: false, courierId: 'courier2' } }, spoof);
  assert.equal(spoof.statusCode, 403);
  const staff = response();
  await routes.get('POST /couriers/me/presence')({ ...req, user: { ...req.user, role: 'ADMIN' }, body: { isOnline: false } }, staff);
  assert.equal(staff.statusCode, 403);
});

test('C6: consultar una tarea ya entregada por HTTP sigue respondiendo', async () => {
  const f = fixture(); await deliver(f);
  const { routes, response, req } = routeFixture(f.persistence); const res = response();
  await routes.get('GET /dispatch/tasks/:id')({ ...req, params: { id: 'task1' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.status, 'DELIVERED');
});

test('C6: si el bloqueo de la red está tomado se suelta la transacción y se reintenta, sin ocupar la conexión', async () => {
  const f = fixture(); f.hooks.lockBusy = 3;
  const before = f.hooks.rollbacks;
  const offers = await f.persistence.run(async r => { await f.persistence.tick(r); return r.engine.offersForCourier('courier1'); });
  assert.equal(offers.length, 1);
  assert.equal(f.hooks.rollbacks - before, 3, 'tres intentos ocupados se revierten');
});

test('C6: una ola guarda sus ofertas en lote, la expiración va en un UPDATE por lote y el GPS no reescribe repartidores', async () => {
  const f = fixture();
  await f.offer();
  const offers = [...f.state().marketplaceNetworkOffer.values()];
  assert.equal(offers.length, 2);
  const courierVersion = f.state().marketplaceNetworkCourier.get('courier1').version;
  assert.equal(f.state().marketplaceNetworkCourier.get('courier1').payload.presence, undefined, 'la presencia no se copia al repartidor');
  await f.persistence.updatePresence('courier1', { isOnline: true, lat: 19.431, lng: -99.131 });
  f.advance(31000);
  await f.offer();
  assert.equal(f.state().marketplaceNetworkCourier.get('courier1').version, courierVersion, 'un GPS nuevo no sube la versión del repartidor');
  for (const old of offers) {
    const row = f.state().marketplaceNetworkOffer.get(old.id);
    assert.equal(row.status, 'EXPIRED'); assert.equal(row.payload.status, 'EXPIRED');
  }
  assert(f.hooks.queries.some(q => q.startsWith('UPDATE marketplace_network_offers')));
  assert.equal([...f.state().marketplaceNetworkOffer.values()].filter(o => o.status === 'OFFERED').length, 2);
});
