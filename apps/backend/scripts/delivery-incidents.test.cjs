'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDeliveryIncidentsService } = require('../src/lib/delivery-incidents');

const NOW = new Date('2026-10-22T12:00:00Z');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1cAAAAASUVORK5CYII=';
const DRIVER = { id: 'd1', role: 'DELIVERY', isActive: true, restaurantId: 'r1', tenantId: 't1', locationId: 'l1' };
const OWNER = { id: 'u1', role: 'OWNER', isActive: true, restaurantId: 'r1', tenantId: 't1' };
function setup() {
  const state = { order: [{ id: 'o1', restaurantId: 'r1', locationId: 'l1', deliveryDriverId: 'd1',
    orderType: 'DELIVERY', source: 'ONLINE', status: 'ON_THE_WAY', deliveryFee: 10, notes: '',
    total: 110, orderNumber: 4, paymentMethod: 'CASH', paymentStatus: 'PENDING', cashCollected: false,
    restaurant: { tenantId: 't1' }, items: [], user: null }], deliveryIncident: [], deliveryEvidence: [],
    employee: [{ id: 'd1', role: 'DELIVERY', isActive: true, location: { restaurantId: 'r1' } }],
    driverCashMovement: [], orderStatusHistory: [] };
  const calls = []; const events = []; const warnings = []; const hooks = {};
  function match(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(part => match(row, part));
      if (value && typeof value === 'object' && !(value instanceof Date)) {
        if ('gt' in value) return row[key] > value.gt;
        return row[key] && match(row[key], value);
      }
      return value instanceof Date ? row[key]?.getTime() === value.getTime() : row[key] === value;
    });
  }
  function project(row, select) {
    if (!row) return null;
    if (!select) return structuredClone(row);
    return Object.fromEntries(Object.entries(select).map(([key, value]) => [key,
      value === true ? structuredClone(row[key]) : row[key] == null ? null : project(row[key], value.select)]));
  }
  let transactionActive = false; let queue = Promise.resolve(); let sequence = 0;
  const client = {};
  for (const name of Object.keys(state)) {
    client[name] = {
      async findFirst(args) { calls.push({ name, method: 'findFirst', args: structuredClone(args) });
        return project(state[name].find(row => match(row, args.where)), args.select); },
      async findMany(args) { calls.push({ name, method: 'findMany', args: structuredClone(args) });
        const rows = state[name].filter(row => match(row, args.where)).sort((a, b) => a.loggedAt - b.loggedAt || a.id.localeCompare(b.id));
        return rows.slice(0, args.take).map(row => project(row, args.select)); },
      async create(args) {
        calls.push({ name, method: 'create', args: structuredClone(args) });
        assert.equal(transactionActive, true); await hooks.beforeWrite?.(name, 'create');
        const row = { id: `row-${String(++sequence).padStart(4, '0')}`, ...structuredClone(args.data) };
        if (name === 'deliveryIncident' && row.idempotencyKey != null) assert.ok(!state[name].some(old =>
          old.restaurantId === row.restaurantId && old.orderId === row.orderId && old.idempotencyKey === row.idempotencyKey));
        if (name === 'deliveryEvidence') assert.ok(!state[name].some(old => old.orderId === row.orderId));
        state[name].push(row); return structuredClone(row);
      },
      async updateMany(args) {
        calls.push({ name, method: 'updateMany', args: structuredClone(args) });
        assert.equal(transactionActive, true); await hooks.beforeWrite?.(name, 'updateMany');
        let count = 0; for (const row of state[name]) if (match(row, args.where)) { Object.assign(row, structuredClone(args.data)); count++; }
        return { count };
      },
    };
  }
  client.$queryRaw = async (strings, ...values) => {
    assert.equal(transactionActive, true); const sql = strings.join('?');
    assert.match(sql, /FROM "orders"/); assert.match(sql, /"restaurantId" = \? FOR UPDATE/);
    calls.push({ method: '$queryRaw', sql, values });
    await hooks.beforeLock?.();
    return state.order.filter(row => row.id === values[0] && row.restaurantId === values[1]).map(({ id }) => ({ id }));
  };
  const prisma = { ...client, $transaction(work, options) {
    const run = queue.then(async () => {
      calls.push({ method: '$transaction', options }); const snapshot = structuredClone(state);
      transactionActive = true;
      try { return await work(client); }
      catch (error) { for (const name of Object.keys(state)) state[name] = snapshot[name]; throw error; }
      finally { transactionActive = false; }
    });
    queue = run.catch(() => {}); return run;
  } };
  const io = { to(room) { assert.equal(transactionActive, false); return { emit(event, data) {
    if (hooks.socketError) throw Error('socket down'); events.push({ room, event, data });
  } }; } };
  const service = createDeliveryIncidentsService({ now: () => new Date(NOW), logger: { warn(...args) { warnings.push(args); } } });
  const incident = (overrides = {}) => ({ orderId: 'o1', courierId: 'd1', taskId: 'task1', incident: {
    type: 'CUSTOMER_UNREACHABLE', reason: 'Sin respuesta', notes: 'Se llamo dos veces',
    timestamp: NOW.getTime() - 86400000, callAttempts: 2, photo: PNG, ...overrides } });
  const args = { orderId: 'o1', actor: DRIVER, restaurantId: 'r1', prismaClient: prisma };
  return { state, calls, events, warnings, hooks, prisma, service, io, incident, args,
    log: (overrides = {}) => service.logIncident({ ...args, body: incident(), io, idempotencyKey: 'incident-o1-123', ...overrides }),
    list: (overrides = {}) => service.listIncidents({ ...args, ...overrides }),
    status: (body, overrides = {}) => service.updateStatus({ ...args, driverId: 'd1', body, ...overrides }) };
}

// Exercise the actual router AND auth middleware; only JWT verification and DB are injected.
// This is not an HTTP server, cryptographic JWT verification or database integration test.
function http(f) {
  const routes = []; const actors = { driver: DRIVER, owner: OWNER,
    outsider: { ...DRIVER, id: 'd2' }, tenant: { ...DRIVER, restaurantId: 'r2', tenantId: 't2' },
    inactive: { ...OWNER, isActive: false }, waiter: { ...OWNER, role: 'WAITER' } };
  const db = { ...f.prisma, user: { async findUnique({ where }) { return actors[where.id] || null; } },
    employee: { ...f.prisma.employee, async findUnique() { return null; } } };
  function load(relative, dependencies) {
    const file = path.join(__dirname, relative); const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, console: { error() {}, warn() {} },
      process: { env: {} }, require(name) { if (Object.hasOwn(dependencies, name)) return dependencies[name]; throw Error(`Unexpected dependency ${name}`); } }, { filename: file });
    return module.exports;
  }
  const auth = load('../src/middleware/auth.middleware.js', {
    jsonwebtoken: { verify(token) { if (!actors[token]) throw Error('invalid token'); return { id: token }; } },
    '@mrtpvrest/database': { prisma: db, runWithBypass: fn => fn() },
    '../lib/auth-metrics': { increment() {} }, '../lib/permissions': { PERM_TO_FLAG: {} },
    '../lib/logger': () => ({ warn() {} }),
  });
  const router = {};
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) router[method] = (route, ...handlers) => routes.push({ method, route, handlers });
  load('../src/routes/delivery.routes.js', {
    express: { Router: () => router }, bcryptjs: {}, jsonwebtoken: {}, '@mrtpvrest/database': { prisma: f.prisma },
    '../middleware/auth.middleware': auth, '../utils/dayRange': {},
    '../services/notifications.service': { notifyOrderStatus: async () => {}, sendPushToDriver: async () => {}, notifyDriversNewDeliveryOrder: async () => {} },
    '../lib/delivery-incidents': require('../src/lib/delivery-incidents'),
    // PIN de pedidos propios: real; sin STORE_DELIVERY_PIN_MODE queda en off.
    '../lib/store-delivery-pin': require('../src/lib/store-delivery-pin'),
  });
  return { routes, auth, async request(method = 'post', route = '/orders/:orderId/incidents', overrides = {}) {
    const entry = routes.find(item => item.method === method && item.route === route); assert.ok(entry);
    const req = { method: method.toUpperCase(), params: { orderId: 'o1', driverId: 'd1' },
      body: f.incident(), query: {}, headers: { authorization: 'Bearer driver', 'idempotency-key': 'key-1' },
      restaurantId: 'r1', restaurant: { tenantId: 't1' }, app: { get: () => f.io }, ...overrides,
      get(name) { return this.headers[name.toLowerCase()]; } };
    const res = { statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; },
      set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
    async function invoke(i) { if (!entry.handlers[i]) return; let next;
      await entry.handlers[i](req, res, () => { next = invoke(i + 1); return next; }); if (next) await next; }
    await invoke(0); return res;
  } };
}

for (const type of ['CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DAMAGED_OR_REJECTED']) {
  test(`persists ${type}, offline timestamp, photo alias and a scoped event after commit`, async () => {
    const f = setup(); const body = f.incident({ type }); const before = structuredClone(body);
    const result = await f.log({ body }); assert.equal(result.success, true); assert.equal(f.state.deliveryIncident.length, 1);
    assert.equal(f.state.deliveryIncident[0].type, type); assert.equal(f.state.deliveryIncident[0].photoBase64, PNG);
    assert.equal(f.state.deliveryIncident[0].occurredAt.getTime(), body.incident.timestamp);
    assert.equal(result.loggedAt.getTime(), NOW.getTime()); assert.deepEqual(body, before);
    assert.equal(f.events.length, 1); assert.equal(f.events[0].event, 'delivery:incident');
    assert.equal(f.events[0].room, 'restaurant:r1:location:l1:admins');
    assert.ok(!JSON.stringify(f.events).includes('base64')); assert.ok(!JSON.stringify(f.events).includes('Se llamo'));
  });
}
test('same key and content replay the exact receipt; concurrent submissions create one row and event', async () => {
  const f = setup(); const results = await Promise.all([f.log(), f.log(), f.log()]);
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
  assert.equal(f.state.deliveryIncident.length, 1); assert.equal(f.events.length, 1);
});
test('changing content, courier or actor cannot reuse an idempotency key', async () => {
  const f = setup(); await f.log();
  await assert.rejects(f.log({ body: f.incident({ notes: 'changed' }) }), { code: 'IDEMPOTENCY_CONFLICT', statusCode: 409 });
  await assert.rejects(f.log({ actor: OWNER }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.state.deliveryIncident.length, 1); assert.equal(f.events.length, 1);
});
test('optional key allows distinct incidents; normalized photoBase64 alias replays photo', async () => {
  const f = setup(); await f.log(); const body = f.incident(); body.incident.photoBase64 = PNG; delete body.incident.photo;
  await f.log({ body }); assert.equal(f.state.deliveryIncident.length, 1);
  await f.log({ idempotencyKey: undefined }); assert.equal(f.state.deliveryIncident.length, 2);
});
test('idempotency survives service recreation and keys remain scoped to their order and restaurant', async () => {
  const f = setup(); const first = await f.log();
  const restarted = createDeliveryIncidentsService({ now: () => new Date(NOW.getTime() + 1000) });
  const replay = await restarted.logIncident({ ...f.args, body: f.incident(), io: f.io, idempotencyKey: 'incident-o1-123' });
  assert.deepEqual(replay, first); assert.equal(f.events.length, 1);
  f.state.order.push({ ...structuredClone(f.state.order[0]), id: 'o2', restaurantId: 'r2', locationId: 'l2',
    restaurant: { tenantId: 't2' }, deliveryDriverId: 'd2' });
  const actor = { ...DRIVER, id: 'd2', restaurantId: 'r2', tenantId: 't2', locationId: 'l2' };
  await f.log({ orderId: 'o2', restaurantId: 'r2', actor, body: { ...f.incident(), orderId: 'o2', courierId: 'd2' } });
  assert.equal(f.state.deliveryIncident.length, 2);
  assert.equal((await f.list()).length, 1);
  assert.equal(f.events[1].room, 'restaurant:r2:location:l2:admins');
});
test('invalid inputs fail with 400 and no persistence or event', async () => {
  const bad = [{ type: 'OTHER' }, { callAttempts: -1 }, { callAttempts: 1.5 }, { callAttempts: '2' },
    { notes: 'x'.repeat(4001) }, { timestamp: 'bad' }, { timestamp: NOW.getTime() + 600001 },
    { photo: 'data:image/svg+xml;base64,PHN2Zz4=' }, { photo: 'data:image/png;base64,aGVsbG8=' },
    { photo: PNG.replace('image/png', 'image/jpeg') }, { photo: PNG, photoBase64: 'different' },
    { photo: 'A'.repeat(7 * 1024 * 1024 + 200) }];
  for (const incident of bad) { const f = setup(); await assert.rejects(f.log({ body: f.incident(incident) }), error => error.statusCode === 400);
    assert.equal(f.state.deliveryIncident.length, 0); assert.equal(f.events.length, 0); }
  const f = setup(); for (const idempotencyKey of ['', 'has space', 'bad\nkey', ['array'], 'a'.repeat(201)])
    await assert.rejects(f.log({ idempotencyKey }), { code: 'INVALID_IDEMPOTENCY_KEY' });
  await assert.rejects(f.log({ body: { ...f.incident(), orderId: 'other' } }), { code: 'ORDER_ID_MISMATCH' });
});
test('missing, inactive, device, unauthorized role, missing scope and forged tenant are rejected', async () => {
  const actors = [null, { ...DRIVER, isActive: false }, { ...DRIVER, isDevice: true }, { ...DRIVER, role: 'WAITER' },
    { ...DRIVER, restaurantId: null }, { ...DRIVER, tenantId: null }, { ...DRIVER, tenantId: 't2' }];
  for (const actor of actors) { const f = setup(); await assert.rejects(f.log({ actor }), e => [401, 403].includes(e.statusCode));
    assert.equal(f.state.deliveryIncident.length, 0); }
});
test('other driver, restaurant, branch and non-delivery order cannot read or write incidents', async () => {
  const f = setup(); await f.log();
  for (const overrides of [{ actor: { ...DRIVER, id: 'd2' } }, { restaurantId: 'r2' },
    { actor: { ...OWNER, locationId: 'l2' } }]) {
    await assert.rejects(f.log(overrides)); await assert.rejects(f.list(overrides));
  }
  f.state.order[0].orderType = 'DINE_IN'; await assert.rejects(f.list(), { code: 'ORDER_NOT_FOUND' });
});
test('staff may record for the assigned courier, never a spoofed courier', async () => {
  const f = setup(); await f.log({ actor: OWNER });
  await assert.rejects(f.log({ actor: OWNER, body: { ...f.incident(), courierId: 'd2' } }), { code: 'COURIER_FORBIDDEN' });
  assert.equal((await f.list({ actor: OWNER })).length, 1);
});
test('list has bounded projection, deterministic keyset pagination and no image/idempotency hashes', async () => {
  const f = setup(); for (let i = 0; i < 5; i++) await f.log({ idempotencyKey: `key-${i}` });
  const first = await f.list({ limit: 2 }); const second = await f.list({ limit: 2, cursor: first[1].id });
  const third = await f.list({ limit: 2, cursor: second[1].id });
  assert.equal(new Set([...first, ...second, ...third].map(row => row.id)).size, 5);
  assert.equal(first[0].hasPhoto, true); assert.equal(first[0].timestamp, NOW.getTime() - 86400000);
  for (const field of ['photoBase64', 'requestHash', 'idempotencyKey']) assert.equal(first[0][field], undefined);
  await assert.rejects(f.list({ limit: 101 }), { code: 'INVALID_LIMIT' });
  await assert.rejects(f.list({ cursor: 'other-order-incident' }), { code: 'INVALID_CURSOR' });
  const query = f.calls.find(call => call.method === 'findMany').args;
  assert.equal(query.where.restaurantId, 'r1'); assert.equal(query.where.orderId, 'o1'); assert.equal(query.take, 2);
});
test('socket outage cannot undo a persisted incident or expose media in errors', async () => {
  const f = setup(); f.hooks.socketError = true;
  assert.equal((await f.log()).success, true); assert.equal(f.state.deliveryIncident.length, 1);
  assert.equal(f.warnings.length, 1); assert.ok(!JSON.stringify(f.warnings).includes('base64'));
});
test('orders without a legacy location notify only the authenticated restaurant admin room', async () => {
  const f = setup(); f.state.order[0].locationId = null; await f.log();
  assert.equal(f.events[0].room, 'restaurant:r1:admins');
});
test('photo and signature persist atomically with status, audit and pending cash', async () => {
  const f = setup(); const evidence = { photoBase64: PNG, signatureBase64: PNG, deliveredAt: NOW.getTime() - 60000 };
  const input = { status: 'DELIVERED', paymentMethod: 'CASH', evidence }; const before = structuredClone(input);
  const { order, changed } = await f.status(input); assert.equal(changed, true); assert.deepEqual(input, before);
  assert.equal(order.status, 'DELIVERED'); assert.equal(order.paymentStatus, 'PENDING'); assert.equal(order.cashCollected, false);
  assert.equal(f.state.deliveryEvidence.length, 1); assert.equal(f.state.deliveryEvidence[0].photoBase64, PNG);
  assert.equal(f.state.deliveryEvidence[0].signatureBase64, PNG); assert.equal(order.evidence.hasSignature, true);
  assert.ok(!JSON.stringify(order).includes('base64')); assert.equal(f.state.driverCashMovement.length, 1);
  assert.match(f.state.orderStatusHistory[0].note, /evidenceId/);
});
test('photo only, raw base64, signature only and absent deliveredAt are accepted', async () => {
  for (const evidence of [{ photoBase64: PNG.split(',')[1] }, { signatureBase64: PNG }]) {
    const f = setup(); const result = await f.status({ status: 'DELIVERED', evidence });
    assert.equal(result.order.evidence.deliveredAt.getTime(), NOW.getTime());
    assert.equal(f.state.deliveryEvidence.length, 1);
  }
});
test('status retries preserve original evidence, confirmed payments and a single cash movement', async () => {
  const f = setup(); const body = { status: 'DELIVERED', paymentMethod: 'CASH', evidence: { photoBase64: PNG } };
  await Promise.all([f.status(body), f.status(body)]); assert.equal(f.state.deliveryEvidence.length, 1);
  assert.equal(f.state.driverCashMovement.length, 1); assert.equal(f.state.orderStatusHistory.length, 1);
  Object.assign(f.state.order[0], { paymentStatus: 'PAID', cashCollected: true });
  const replay = await f.status(body); assert.equal(replay.order.paymentStatus, 'PAID'); assert.equal(replay.order.cashCollected, true);
  assert.equal(replay.changed, false);
  await assert.rejects(f.status({ ...body, evidence: { signatureBase64: PNG } }), { code: 'EVIDENCE_CONFLICT' });
});
test('evidence rollback when order, status audit or cash write fails', async () => {
  for (const failure of ['order', 'orderStatusHistory', 'driverCashMovement']) {
    const f = setup(); f.hooks.beforeWrite = name => { if (name === failure) throw Error('storage unavailable'); };
    await assert.rejects(f.status({ status: 'DELIVERED', paymentMethod: 'CASH', evidence: { photoBase64: PNG } }));
    assert.equal(f.state.order[0].status, 'ON_THE_WAY'); assert.equal(f.state.deliveryEvidence.length, 0);
    assert.equal(f.state.orderStatusHistory.length, 0); assert.equal(f.state.driverCashMovement.length, 0);
  }
});
test('invalid evidence, method, status, future time, image size or regressions cannot change order', async () => {
  for (const body of [{ status: 'DELIVERED', evidence: {} }, { status: 'ON_THE_WAY', evidence: { photoBase64: PNG } },
    { status: 'DELIVERED', evidence: null }, { status: 'DELIVERED', evidence: { photoBase64: 'url' } },
    { status: 'DELIVERED', paymentMethod: 'INVALID' }, { status: 'CANCELLED' },
    { status: 'DELIVERED', evidence: { photoBase64: PNG, deliveredAt: NOW.getTime() + 900000 } },
    { status: 'DELIVERED', evidence: { signatureBase64: 'A'.repeat(1500000) } }]) {
    const f = setup(); await assert.rejects(f.status(body), e => e.statusCode === 400);
    assert.equal(f.state.order[0].status, 'ON_THE_WAY'); assert.equal(f.state.deliveryEvidence.length, 0);
  }
  const f = setup(); f.state.order[0].status = 'DELIVERED';
  await assert.rejects(f.status({ status: 'ON_THE_WAY' }), { code: 'INVALID_TRANSITION' });
});
test('existing calls without evidence preserve status response and transfer-pending behavior', async () => {
  const f = setup(); const result = await f.status({ status: 'DELIVERED', paymentMethod: 'TRANSFER_PENDING' });
  assert.equal(result.order.paymentMethod, 'TRANSFER'); assert.equal(result.order.paymentStatus, 'PENDING');
  assert.equal(result.order.evidence, undefined); assert.equal(f.state.deliveryEvidence.length, 0);
  const paid = setup(); assert.equal((await paid.status({ status: 'DELIVERED', paymentMethod: 'CARD' })).order.paymentStatus, 'PAID');
  const moving = setup(); moving.state.order[0].status = 'READY';
  assert.equal((await moving.status({ status: 'ON_THE_WAY' })).order.status, 'ON_THE_WAY');
});
test('pending shipping fee, inactive driver, unauthorized driver and cancelled order block evidence', async () => {
  for (const change of [f => { f.state.order[0].notes = 'ENVÍO POR ASIGNAR'; f.state.order[0].deliveryFee = 0; },
    f => { f.state.employee[0].isActive = false; }, f => { f.state.order[0].deliveryDriverId = 'd2'; },
    f => { f.state.order[0].status = 'CANCELLED'; }]) {
    const f = setup(); change(f); await assert.rejects(f.status({ status: 'DELIVERED', evidence: { photoBase64: PNG } }));
    assert.equal(f.state.deliveryEvidence.length, 0);
  }
});
test('evidence rejects foreign restaurant, tenant, branch, driver and device before any write', async () => {
  for (const overrides of [{ restaurantId: 'r2' }, { actor: { ...DRIVER, tenantId: 't2' } },
    { actor: { ...OWNER, locationId: 'l2' } }, { driverId: 'd2' }, { actor: { ...DRIVER, isDevice: true } }]) {
    const f = setup(); await assert.rejects(f.status({ status: 'DELIVERED', evidence: { photoBase64: PNG } }, overrides));
    assert.equal(f.state.deliveryEvidence.length, 0); assert.equal(f.state.order[0].status, 'ON_THE_WAY');
    assert.equal(f.state.driverCashMovement.length, 0);
  }
});
test('assignment is rechecked under the order lock rather than trusting a stale client', async () => {
  const f = setup(); f.hooks.beforeLock = () => { f.state.order[0].deliveryDriverId = 'd2'; };
  await assert.rejects(f.log(), { code: 'COURIER_FORBIDDEN' }); assert.equal(f.events.length, 0);
});
test('Marketplace incidents use durable task assignment, never legacy deliveryDriverId', async () => {
  const f = setup(); Object.assign(f.state.order[0], { source: 'MARKETPLACE', deliveryDriverId: 'other', marketplacePipeline: {
    restaurantId: 'r1', dispatch: { task: { orderId: 'o1', restaurantId: 'r1', currentAssignment: { courierId: 'd1' } } } } });
  await f.log(); assert.equal((await f.list()).length, 1);
  await assert.rejects(f.status({ status: 'DELIVERED', evidence: { photoBase64: PNG } }), { code: 'PIN_CONFIRMATION_REQUIRED' });
  assert.equal(f.state.order[0].status, 'ON_THE_WAY');
  f.state.order[0].status = 'DELIVERED';
  await f.status({ status: 'DELIVERED', evidence: { photoBase64: PNG } }); assert.equal(f.state.deliveryEvidence.length, 1);
  assert.equal(f.state.driverCashMovement.length, 0); assert.equal(f.state.orderStatusHistory.length, 0);
});
test('HTTP routes run actual authenticate and tenant middleware; forged/missing/inactive tokens cannot persist', async () => {
  const f = setup(); const h = http(f);
  for (const token of ['', 'forged', 'inactive', 'waiter', 'outsider', 'tenant']) {
    const res = await h.request('post', '/orders/:orderId/incidents', { headers: token ? { authorization: `Bearer ${token}` } : {} });
    assert.ok([401, 403].includes(res.statusCode), `${token}: ${res.statusCode}`);
  }
  assert.equal(f.state.deliveryIncident.length, 0);
  for (const route of h.routes.filter(row => row.route.includes('/incidents') || row.route.endsWith('/status'))) {
    assert.equal(route.handlers[0], h.auth.authenticate); assert.equal(route.handlers[1], h.auth.requireTenantAccess);
  }
  assert.equal((await h.request('get', '/orders/:orderId/incidents', { headers: { authorization: 'Bearer outsider' } })).statusCode, 403);
  assert.equal((await h.request('put', '/:driverId/orders/:orderId/status', { headers: { authorization: 'Bearer outsider' },
    body: { status: 'DELIVERED', evidence: { photoBase64: PNG } } })).statusCode, 403);
  assert.equal(f.state.deliveryEvidence.length, 0);
});
test('HTTP incident response, safe list, validation and immutable delivery evidence work through real handlers', async () => {
  const f = setup(); const h = http(f);
  const created = await h.request(); assert.equal(created.statusCode, 200); assert.equal(created.body.success, true);
  const replay = await h.request(); assert.deepEqual(replay.body, created.body); assert.equal(f.events.length, 1);
  const list = await h.request('get'); assert.equal(list.body.length, 1); assert.equal(list.headers['Cache-Control'], 'no-store');
  assert.equal((await h.request('get', '/orders/:orderId/incidents', { query: { limit: '1junk' } })).statusCode, 400);
  const status = await h.request('put', '/:driverId/orders/:orderId/status', {
    body: { status: 'DELIVERED', paymentMethod: 'CASH', evidence: { signatureBase64: PNG } } });
  assert.equal(status.statusCode, 200); assert.equal(status.body.status, 'DELIVERED'); assert.equal(status.body.evidence.hasSignature, true);
  assert.ok(!JSON.stringify(f.events).includes('base64'));
});
test('unavailable schema/client fails closed with 503; internal errors do not leak storage payload', async () => {
  const f = setup(); delete f.prisma.deliveryEvidence;
  await assert.rejects(f.log(), { statusCode: 503 }); assert.equal(f.state.deliveryIncident.length, 0);
  const g = setup(); g.hooks.beforeWrite = () => { throw Error('postgres://private:imageBase64'); };
  const response = await http(g).request(); assert.equal(response.statusCode, 500);
  assert.ok(!JSON.stringify(response.body).includes('private')); assert.equal(g.events.length, 0);
});
test('schemas are byte-identical and include tenant-bound incident/evidence relations and unique keys', () => {
  const a = fs.readFileSync(path.join(__dirname, '../../../packages/database/prisma/schema.prisma'));
  const b = fs.readFileSync(path.join(__dirname, '../prisma/schema.prisma')); assert.ok(a.equals(b));
  const source = a.toString(); assert.match(source, /model DeliveryIncident \{/); assert.match(source, /model DeliveryEvidence \{/);
  assert.match(source, /@@unique\(\[restaurantId, orderId, idempotencyKey\]\)/);
  const { SCOPED_MODELS } = require('../../../packages/database/tenant-guard');
  assert.ok(SCOPED_MODELS.has('DeliveryIncident')); assert.ok(SCOPED_MODELS.has('DeliveryEvidence'));
});
test('tenant guard enforces explicit restaurant scope for every incident/evidence CRUD operation', async () => {
  const { tenantGuard, runWithTenant, SCOPED_MODELS } = require('../../../packages/database/tenant-guard');
  const schema = fs.readFileSync(path.join(__dirname, '../../../packages/database/prisma/schema.prisma'), 'utf8');
  const scoped = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm)]
    .filter(match => /\n\s*restaurantId\s+String/.test(match[2])).map(match => match[1]);
  assert.deepEqual(new Set(scoped), SCOPED_MODELS);
  const guard = tenantGuard({ mode: 'enforce' }).query.$allModels.$allOperations;
  for (const model of ['DeliveryIncident', 'DeliveryEvidence']) {
    await runWithTenant({ restaurantId: 'r1' }, async () => {
      const received = await guard({ model, operation: 'findMany', args: { where: { orderId: 'o1' } }, query: args => args });
      assert.equal(received.where.restaurantId, 'r1');
      const created = await guard({ model, operation: 'create', args: { data: { orderId: 'o1' } }, query: args => args });
      assert.equal(created.data.restaurantId, 'r1');
    });
  }
});
