'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const forbidden = () => { throw new Error('Offline tracking suite forbids network, app and external database access'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};

const { createMarketplaceTrackingService, MarketplaceTrackingError } = require('../src/lib/marketplace-tracking-v1');
const { hashPin, atomicAcceptOffer, confirmPickup } = require('../src/lib/marketplace-dispatch');
const createRouter = require('../src/routes/marketplace-tracking-v1.routes');
const NOW = new Date('2026-10-23T19:00:00.000Z');
const TOKEN = crypto.createHmac('sha256', 'offline-synthetic-pin-key-at-least-thirty-two-bytes')
  .update(JSON.stringify(['marketplace-order-v1', 'tracking', 'account-1', 'order-1'])).digest('hex');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const ago = ms => new Date(NOW.getTime() - ms);
const errorIs = (code, status) => error => error instanceof MarketplaceTrackingError && error.code === code && error.statusCode === status;

function fixture(options = {}) {
  let date = new Date(NOW); const calls = []; const hooks = {};
  const record = { orderId: 'order-1', restaurantId: 'r1', trackingTokenHash: hash(TOKEN), trackingExpiresAt: new Date(NOW.getTime() + 86400000),
    order: { id: 'order-1', restaurantId: 'r1', locationId: 'branch-2', source: 'MARKETPLACE', status: 'ON_THE_WAY',
      customerPhone: 'PRIVATE-CUSTOMER-PHONE', deliveryAddress: 'PRIVATE-DELIVERY-ADDRESS' },
    task: { id: 'task-1', orderId: 'order-1', restaurantId: 'r1', locationId: 'branch-2', status: 'PICKED_UP', pickedUpAt: ago(60000),
      currentAssignmentId: 'assignment-1', pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321'),
      currentAssignment: { id: 'assignment-1', taskId: 'task-1', courierId: 'courier-1', restaurantId: 'r1', status: 'ACTIVE',
        pickedUpAt: ago(60000), name: 'PRIVATE-COURIER-NAME', phone: 'PRIVATE-COURIER-PHONE' } } };
  const records = new Map([['order-1', record], ['other-order', { ...structuredClone(record), orderId: 'other-order', trackingTokenHash: hash('a'.repeat(64)),
    order: { ...structuredClone(record.order), id: 'other-order', restaurantId: 'r2', locationId: 'foreign-branch' } }]]);
  const locations = new Map([
    ['branch-2', { id: 'branch-2', restaurantId: 'r1', latitude: 20.1234, longitude: -100.4321, phone: 'PRIVATE-BRANCH-PHONE' }],
    ['branch-1', { id: 'branch-1', restaurantId: 'r1', latitude: 10, longitude: -80 }],
    ['foreign-branch', { id: 'foreign-branch', restaurantId: 'r2', latitude: 35, longitude: -110 }],
  ]);
  const presence = { courierId: 'courier-1', assignmentId: 'assignment-1', taskId: 'task-1', orderId: 'order-1',
    lat: 20.12, lng: -100.43, lastSeenAt: ago(10000), isOnline: true,
    phone: 'PRIVATE-COURIER-PHONE', name: 'PRIVATE-COURIER-NAME', history: [{ lat: 80, lng: 80, orderId: 'other-order' }] };
  const presences = new Map([['courier-1', presence], ['foreign-courier', { courierId: 'foreign-courier', taskId: 'foreign-task', lat: 80, lng: 80 }]]);
  const ports = {
    taskStore: { async findByOrderId(args) {
      calls.push({ method: 'task.findByOrderId', args });
      if (hooks.task) await hooks.task(args);
      // Deliberately ignore the token filter to verify the service's own checks.
      return structuredClone(records.get(args.orderId) ?? null);
    } },
    locationStore: { async findById(args) {
      calls.push({ method: 'location.findById', args });
      if (hooks.location) await hooks.location(args);
      return structuredClone(locations.get(args.locationId) ?? null);
    } },
    presenceStore: { async findForAssignment(args) {
      calls.push({ method: 'presence.findForAssignment', args });
      if (hooks.presence) await hooks.presence(args);
      // Return extra PII and foreign history intentionally: only coordinates may escape.
      return structuredClone(presences.get(args.courierId) ?? null);
    } }, now: () => date,
  };
  const service = createMarketplaceTrackingService({ ...ports, ...options });
  return { service, ports, calls, hooks, record, records, locations, presence, presences,
    setTime(value) { date = value; }, advance(ms) { date = new Date(date.getTime() + ms); },
    read(patch = {}) { return service.getOrderTracking({ orderId: 'order-1', trackingToken: TOKEN, ...patch }); } };
}

function http(f, options = {}) {
  let handler;
  createRouter({ Router: () => ({ get(route, fn) { assert.equal(route, '/orders/:id/tracking'); handler = fn; } }), service: f?.service, ...options });
  return async ({ params = { id: 'order-1' }, headers = { 'x-marketplace-order-token': TOKEN }, ...req } = {}) => {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params, headers, ...req }, res); return res;
  };
}

test('offline guards reject sockets, HTTP, fetch and database initialization', () => {
  assert.throws(() => fetch('https://example.invalid'), /Offline tracking/);
  assert.throws(() => require('node:net').connect(1, '127.0.0.1'), /Offline tracking/);
  assert.throws(() => require('node:https').get('https://example.invalid'), /Offline tracking/);
  assert.throws(() => require('@mrtpvrest/database'), /Offline tracking/);
});

test('valid tracking token returns only branch origin and fresh GPS for the picked-up assignment', async () => {
  const f = fixture();
  assert.deepEqual(await f.read(), { orderId: 'order-1', status: 'ON_THE_WAY', taskStatus: 'PICKED_UP',
    origin: { lat: 20.1234, lng: -100.4321 }, courierLocation: { lat: 20.12, lng: -100.43 }, isStale: false });
  assert.deepEqual(f.calls.find(call => call.method === 'location.findById').args, { locationId: 'branch-2', restaurantId: 'r1' });
  assert.deepEqual(f.calls.find(call => call.method === 'presence.findForAssignment').args,
    { courierId: 'courier-1', assignmentId: 'assignment-1', taskId: 'task-1', orderId: 'order-1', restaurantId: 'r1', locationId: 'branch-2' });
  const tokenRead = f.calls.find(call => call.method === 'task.findByOrderId').args;
  assert.equal(tokenRead.trackingTokenHash, hash(TOKEN)); assert.equal(JSON.stringify(f.calls).includes(TOKEN), false);
});

test('origin follows the actual order location, including a second branch of the same restaurant', async () => {
  const f = fixture(); f.record.order.locationId = 'branch-1'; f.record.task.locationId = 'branch-1';
  assert.deepEqual((await f.read()).origin, { lat: 10, lng: -80 });
  f.locations.get('branch-1').latitude = 12; f.locations.get('branch-1').longitude = -81;
  assert.deepEqual((await f.read()).origin, { lat: 12, lng: -81 });
});

test('GPS may use coordinate zero and valid geographic boundary values without false fallbacks', async () => {
  const f = fixture(); Object.assign(f.locations.get('branch-2'), { latitude: 0, longitude: 0 });
  Object.assign(f.presence, { lat: 90, lng: -180 }); const result = await f.read();
  assert.deepEqual(result.origin, { lat: 0, lng: 0 }); assert.deepEqual(result.courierLocation, { lat: 90, lng: -180 });
});

for (const [field, value] of [['latitude', null], ['latitude', undefined], ['latitude', '20'], ['latitude', 91],
  ['longitude', 181], ['longitude', NaN], ['longitude', Infinity], ['id', 'foreign-branch'], ['restaurantId', 'r2']]) {
  test(`invalid or foreign Location ${field}=${String(value)} yields no invented origin`, async () => {
    const f = fixture(); f.locations.get('branch-2')[field] = value;
    assert.equal((await f.read()).origin, null);
  });
}

test('missing Location returns null origin and never selects another branch or global constants', async () => {
  const f = fixture(); f.locations.delete('branch-2'); const result = await f.read();
  assert.equal(result.origin, null); assert.deepEqual(result.courierLocation, { lat: 20.12, lng: -100.43 });
  assert.equal(f.calls.filter(call => call.method === 'location.findById').length, 1);
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/marketplace-tracking-v1.js'), 'utf8');
  assert.doesNotMatch(source, /RESTAURANT_LAT|RESTAURANT_LNG|process\.env/);
});

for (const trackingToken of [undefined, null, '', 'bad', 'a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), ['a'.repeat(64)], 1]) {
  test(`missing or malformed token (${String(trackingToken)}) returns 401 before any store access`, async () => {
    const f = fixture(); await assert.rejects(f.read({ trackingToken }), errorIs('INVALID_TRACKING_TOKEN', 401));
    assert.equal(f.calls.length, 0);
  });
}

test('wrong, expired and absent order capabilities all hide order existence with 404', async () => {
  for (const mutate of [f => { f.record.trackingTokenHash = hash('b'.repeat(64)); },
    f => { f.record.trackingExpiresAt = NOW; }, f => { f.record.trackingExpiresAt = ago(1); },
    f => { f.record.trackingExpiresAt = 'invalid'; }, f => { delete f.record.trackingExpiresAt; },
    f => { f.records.clear(); }]) {
    const f = fixture(); mutate(f); await assert.rejects(f.read(), errorIs('ORDER_NOT_FOUND', 404));
    assert.equal(f.calls.some(call => call.method !== 'task.findByOrderId'), false);
  }
});

test('a token cannot authorize a different order or a substituted tenant/order record', async () => {
  const f = fixture(); await assert.rejects(f.read({ orderId: 'other-order' }), errorIs('ORDER_NOT_FOUND', 404));
  for (const mutate of [record => { record.order.id = 'other-order'; }, record => { record.orderId = 'other-order'; },
    record => { record.restaurantId = 'r2'; }, record => { record.order.source = 'ONLINE'; }, record => { record.order.locationId = null; },
    record => { record.trackingTokenHash = 'not-a-hash'; }]) {
    const g = fixture(); mutate(g.record); await assert.rejects(g.read(), errorIs('ORDER_NOT_FOUND', 404));
    assert.equal(g.calls.some(call => call.method === 'presence.findForAssignment'), false);
  }
});

for (const status of ['PENDING_PAYMENT', 'PENDING_MERCHANT', 'PENDING', 'WAITING_READY', 'OFFERING', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED']) {
  test(`order ${status} never exposes courier GPS even with a fresh picked-up task`, async () => {
    const f = fixture(); f.record.order.status = status; const result = await f.read();
    assert.equal(result.courierLocation, null); assert.equal(result.isStale, false);
    assert.equal(f.calls.some(call => call.method === 'presence.findForAssignment'), false);
  });
}

for (const status of ['WAITING_READY', 'OFFERING', 'ASSIGNED', 'REASSIGNING', 'DELIVERED', 'CANCELLED', 'FAILED']) {
  test(`task ${status} cannot expose GPS based only on Order.status=ON_THE_WAY`, async () => {
    const f = fixture(); f.record.task.status = status;
    assert.equal((await f.read()).courierLocation, null);
    assert.equal(f.calls.some(call => call.method === 'presence.findForAssignment'), false);
  });
}

test('only real confirmPickup enables GPS, accepting an offer does not', async () => {
  const f = fixture(); const task = f.record.task;
  task.status = 'OFFERING'; task.currentAssignmentId = null; task.currentAssignment = null; delete task.pickedUpAt;
  f.record.order.status = 'READY';
  const offer = { id: 'offer', taskId: task.id, courierId: 'courier-1', source: 'SHARED', status: 'OFFERED',
    payoutAmount: 30, expiresAt: new Date(NOW.getTime() + 30000) };
  atomicAcceptOffer({ task, offer, courierId: 'courier-1', now: ago(3000) });
  assert.equal((await f.read()).courierLocation, null);
  const pickup = confirmPickup({ task, pickupPin: '123456', now: ago(1000) }); f.record.order.status = pickup.orderStatusUpdate;
  f.presence.assignmentId = task.currentAssignmentId; f.presence.lastSeenAt = ago(500);
  assert.deepEqual((await f.read()).courierLocation, { lat: 20.12, lng: -100.43 });
});

test('unassigned, cancelled, mismatched and foreign assignments or tasks never trigger presence reads', async () => {
  for (const mutate of [t => { t.currentAssignment = null; }, t => { t.currentAssignmentId = null; },
    t => { t.currentAssignment.status = 'CANCELLED'; }, t => { t.currentAssignment.id = 'old-assignment'; },
    t => { t.currentAssignment.taskId = 'foreign-task'; }, t => { t.currentAssignment.restaurantId = 'r2'; },
    t => { t.currentAssignment.courierId = null; }, t => { t.restaurantId = 'r2'; },
    t => { t.locationId = 'foreign-branch'; }, t => { t.orderId = 'other-order'; },
    t => { t.pickedUpAt = null; }, t => { t.currentAssignment.pickedUpAt = 'invalid'; },
    t => { t.pickedUpAt = new Date(NOW.getTime() + 1); }]) {
    const f = fixture(); mutate(f.record.task); const result = await f.read();
    assert.equal(result.courierLocation, null); assert.equal(f.calls.some(call => call.method === 'presence.findForAssignment'), false);
  }
});

test('no task returns origin and order status without courier data', async () => {
  const f = fixture(); f.record.task = null; const result = await f.read();
  assert.equal(result.taskStatus, null); assert.equal(result.courierLocation, null); assert.equal(result.isStale, false);
});

for (const age of [0, 1, 89999, 90000, 90001, 3600000]) {
  test(`signal age ${age} ms obeys the strict <90s limit`, async () => {
    const f = fixture(); f.record.task.pickedUpAt = ago(7200000); f.record.task.currentAssignment.pickedUpAt = ago(7200000);
    f.presence.lastSeenAt = ago(age); const result = await f.read();
    assert.equal(result.isStale, age >= 90000); assert.deepEqual(result.courierLocation, age >= 90000 ? null : { lat: 20.12, lng: -100.43 });
    if (age >= 90000) { assert.equal(JSON.stringify(result).includes('lastSeenAt'), false); assert.equal(JSON.stringify(result).includes('20.12,'), false); }
  });
}

test('missing, future, invalid and pre-pickup signals are stale without historical or phantom coordinates', async () => {
  for (const lastSeenAt of [undefined, null, 'invalid', 0, new Date(NOW.getTime() + 1), ago(60001)]) {
    const f = fixture(); f.presence.lastSeenAt = lastSeenAt; const result = await f.read();
    assert.equal(result.isStale, true); assert.equal(result.courierLocation, null);
  }
  const f = fixture(); f.presences.delete('courier-1');
  assert.equal((await f.read()).isStale, true); assert.equal(f.calls.filter(call => call.method === 'presence.findForAssignment').length, 1);
});

test('unbound or other-order signals are never used even when courier and timestamp look valid', async () => {
  for (const field of ['courierId', 'assignmentId', 'taskId', 'orderId']) {
    for (const value of [undefined, 'foreign']) {
      const f = fixture(); f.presence[field] = value; const result = await f.read();
      assert.equal(result.courierLocation, null); assert.equal(result.isStale, true);
    }
  }
});

test('malformed GPS and explicitly offline or expired presence cannot leak a previous valid position', async () => {
  for (const mutate of [p => { p.lat = NaN; }, p => { p.lng = Infinity; }, p => { p.lat = '20.12'; },
    p => { p.lng = null; }, p => { p.lat = -91; }, p => { p.lng = 181; }, p => { p.isOnline = false; },
    p => { p.expiresAt = NOW; }, p => { p.expiresAt = 'invalid'; }]) {
    const f = fixture(); mutate(f.presence); const result = await f.read();
    assert.equal(result.isStale, true); assert.equal(result.courierLocation, null);
  }
});

test('public projection excludes all PII, hashes, assignment identifiers and history returned by adapters', async () => {
  const f = fixture(); const result = await f.read(); const encoded = JSON.stringify(result);
  assert.deepEqual(Object.keys(result).sort(), ['courierLocation', 'isStale', 'orderId', 'origin', 'status', 'taskStatus'].sort());
  for (const secret of ['PRIVATE', 'courier-1', 'assignment-1', 'history', 'other-order', 'trackingToken', 'pickupPin', 'deliveryPin', TOKEN, 'lastSeenAt']) {
    assert.equal(encoded.includes(secret), false, secret);
  }
  assert.deepEqual(Object.keys(result.courierLocation).sort(), ['lat', 'lng']);
});

test('completion, cancellation or reassignment during presence retrieval suppresses GPS', async () => {
  for (const mutate of [f => { f.record.order.status = 'DELIVERED'; f.record.task.status = 'DELIVERED'; },
    f => { f.record.order.status = 'CANCELLED'; }, f => { f.record.task.currentAssignment.status = 'CANCELLED'; },
    f => { f.record.task.currentAssignmentId = 'new-assignment'; f.record.task.currentAssignment.id = 'new-assignment'; },
    f => { f.record.task.currentAssignment.courierId = 'foreign-courier'; },
    f => { f.record.task.pickedUpAt = ago(2000); }]) {
    const f = fixture(); f.hooks.presence = () => mutate(f); const result = await f.read();
    assert.equal(result.courierLocation, null); assert.equal(f.calls.filter(call => call.method === 'task.findByOrderId').length, 2);
  }
});

test('new pickup during a read does not release GPS that was read before authorization existed', async () => {
  const f = fixture(); f.record.order.status = 'PREPARING'; f.record.task.status = 'ASSIGNED';
  f.hooks.location = () => { f.record.order.status = 'ON_THE_WAY'; f.record.task.status = 'PICKED_UP'; };
  const result = await f.read(); assert.equal(result.courierLocation, null); assert.equal(result.isStale, true);
  assert.equal(f.calls.some(call => call.method === 'presence.findForAssignment'), false);
});

test('expiration and revocation while reading origin/presence fail closed at the final authorization check', async () => {
  for (const mutate of [f => { f.record.trackingTokenHash = hash('b'.repeat(64)); },
    f => { f.record.trackingExpiresAt = NOW; }, f => { f.records.delete('order-1'); }]) {
    const f = fixture(); f.hooks.presence = () => mutate(f);
    await assert.rejects(f.read(), errorIs('ORDER_NOT_FOUND', 404));
  }
});

test('a signal that becomes stale during the request is not returned as fresh', async () => {
  const f = fixture(); let reads = 0;
  f.hooks.task = () => { if (++reads === 2) f.advance(80000); };
  const result = await f.read(); assert.equal(result.isStale, true); assert.equal(result.courierLocation, null);
});

test('a branch change during the request does not return the previous branch origin or GPS', async () => {
  const f = fixture(); f.hooks.presence = () => { f.record.order.locationId = 'branch-1'; f.record.task.locationId = 'branch-1'; };
  const result = await f.read(); assert.equal(result.origin, null); assert.equal(result.courierLocation, null);
});

test('invalid clocks and missing ports are controlled 503 errors without network fallbacks', async () => {
  const f = fixture({ now: () => new Date('invalid') }); await assert.rejects(f.read(), errorIs('INVALID_CLOCK', 503));
  assert.equal(f.calls.length, 0);
  const noPorts = createMarketplaceTrackingService();
  await assert.rejects(noPorts.getOrderTracking({ orderId: 'order-1', trackingToken: TOKEN }), errorIs('TRACKING_UNAVAILABLE', 503));
});

test('the service is read-only and does not change tracking records or presence', async () => {
  const f = fixture(); const before = structuredClone({ record: f.record, presence: f.presence, locations: f.locations });
  await f.read(); assert.deepEqual({ record: f.record, presence: f.presence, locations: f.locations }, before);
});

test('HTTP route returns no-store, token-specific Vary, a safe view and 200', async () => {
  const f = fixture(); const res = await http(f)();
  assert.equal(res.statusCode, 200); assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers.vary, 'X-Marketplace-Order-Token'); assert.equal(res.body.isStale, false);
  assert.deepEqual(res.body.origin, { lat: 20.1234, lng: -100.4321 });
});

test('HTTP does not accept staff identity, query tokens or courier IDs instead of the tracking header', async () => {
  const f = fixture(); const request = http(f);
  const result = await request({ headers: {}, user: { id: 'staff', role: 'SUPER_ADMIN' }, query: { trackingToken: TOKEN, courierId: 'courier-1' } });
  assert.equal(result.statusCode, 401); assert.equal(result.body.errorCode, 'INVALID_TRACKING_TOKEN'); assert.equal(f.calls.length, 0);
  const invalid = await request({ headers: { 'x-marketplace-order-token': ['a'.repeat(64)] } }); assert.equal(invalid.statusCode, 401);
});

test('HTTP token and order cannot be swapped to retrieve another customer location', async () => {
  const f = fixture(); const request = http(f);
  const result = await request({ params: { id: 'other-order' } });
  assert.equal(result.statusCode, 404); assert.equal(result.body.errorCode, 'ORDER_NOT_FOUND');
  assert.equal(f.calls.some(call => call.method === 'presence.findForAssignment'), false);
});

test('HTTP stale view has isStale:true and no historical coordinates or timestamps', async () => {
  const f = fixture(); f.presence.lastSeenAt = ago(90001); const res = await http(f)();
  assert.equal(res.statusCode, 200); assert.equal(res.body.isStale, true); assert.equal(res.body.courierLocation, null);
  assert.equal(res.body.lastSeenAt, undefined); assert.equal(JSON.stringify(res.body).includes('history'), false);
});

test('HTTP hides internal adapter errors and sets no-store on errors', async () => {
  for (const hook of ['task', 'location', 'presence']) {
    const f = fixture(); f.hooks[hook] = () => { throw new Error('PRIVATE database credential'); };
    const res = await http(f)(); assert.equal(res.statusCode, 503); assert.equal(res.body.errorCode, 'TRACKING_UNAVAILABLE');
    assert.equal(JSON.stringify(res.body).includes('PRIVATE'), false); assert.equal(res.headers['cache-control'], 'no-store');
  }
});

test('default router without store adapters stays offline and returns controlled 401 or 503', async () => {
  const request = http(undefined);
  assert.equal((await request({ headers: {} })).statusCode, 401);
  assert.equal((await request()).statusCode, 503);
});

test('v1 tracking mounts before the legacy marketplace without starting the application', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const mount = source.indexOf("app.use('/api/marketplace/v1', require('./routes/marketplace-tracking-v1.routes')())");
  assert.ok(mount > 0); assert.ok(mount < source.indexOf("app.use('/api/marketplace',"));
});
