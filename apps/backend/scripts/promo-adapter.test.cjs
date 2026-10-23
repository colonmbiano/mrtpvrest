'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createPrismaPromoAdapter, collectLocationSalesHistory, createPromoLocationHandlers } = require('../src/lib/promo-adapter-prisma');
const { analyzeLocationSales, applyAutoPromos } = require('../src/lib/promo-engine');
const NOW = new Date('2026-10-22T12:00:00Z');
const DAY = 86400000;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    const value = row?.[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) return value === expected;
    if ('is' in expected) return value != null && matches(value, expected.is);
    return Object.entries(expected).every(([operator, bound]) => ({
      in: () => bound.includes(value), notIn: () => !bound.includes(value),
      gt: () => value > bound, gte: () => value >= bound, lt: () => value < bound, lte: () => value <= bound,
    })[operator]());
  });
}
const project = (row, select) => Object.fromEntries(Object.keys(select).map(key => [key, structuredClone(row[key])]));

function fixture() {
  let state = {
    restaurant: [{ id: 'r1', tenantId: 'tenant1' }, { id: 'r2', tenantId: 'tenant2' }],
    location: ['A', 'B', 'C', 'OFF'].map(id => ({ id, restaurantId: id === 'C' ? 'r2' : 'r1', isActive: id !== 'OFF',
      locationPromoEnabled: true, autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 25,
      autoPromoMaxItems: 0, autoPromoActiveDays: ['FRIDAY'], autoPromoVersion: 0 })),
    menuItem: [
      { id: 'm1', restaurantId: 'r1', price: 100 }, { id: 'm2', restaurantId: 'r1', price: 200 },
      { id: 'manual', restaurantId: 'r1', price: 80, isPromo: true, promoPrice: 60 },
      { id: 'hidden', restaurantId: 'r1', price: 100, isAvailable: false },
      { id: 'inactive-category', restaurantId: 'r1', price: 100, categoryActive: false },
      { id: 'free', restaurantId: 'r1', price: 0 }, { id: 'foreign', restaurantId: 'r2', price: 999 },
    ].map(row => ({ isAvailable: true, isPromo: false, promoPrice: null, activeDays: [], categoryActive: true, ...row })),
    locationMenuItemPromo: [], order: [], orderItem: [],
  };
  function order(id, locationId, extra = {}, quantity = 10, menuItemId = 'm1') {
    state.order.push({ id, locationId, restaurantId: locationId === 'C' ? 'r2' : 'r1', status: 'DELIVERED',
      paymentStatus: 'PAID', refundedAmount: 0, createdAt: new Date(NOW - DAY), ...extra });
    state.orderItem.push({ id: `line-${id}`, orderId: id, menuItemId, quantity, price: 1 });
  }
  order('paid-A', 'A', {}, 2); order('paid-B', 'B', {}, 100);
  order('foreign', 'C', {}, 1000, 'foreign');
  order('cancelled', 'A', { status: 'CANCELLED' });
  order('pending', 'A', { paymentStatus: 'PENDING' });
  order('refund', 'A', { refundedAmount: 1 });
  order('old', 'A', { createdAt: new Date(NOW - 7 * DAY - 1) });
  order('begin', 'A', { createdAt: new Date(NOW - 7 * DAY) }, 1);
  order('end', 'A', { createdAt: new Date(NOW) });
  const calls = [];
  let queued = Promise.resolve();
  const hooks = {};
  function materialize(model, row) {
    if (model === 'menuItem') return { ...row, category: { restaurantId: row.restaurantId, isActive: row.categoryActive } };
    if (model === 'orderItem') return { ...row,
      menuItem: state.menuItem.find(item => item.id === row.menuItemId), order: state.order.find(order => order.id === row.orderId) };
    return row;
  }
  function client(isRoot) {
    const api = {};
    for (const name of ['restaurant', 'location', 'menuItem', 'locationMenuItemPromo']) {
      api[name] = {
        async findMany(args) {
          calls.push({ model: name, method: 'findMany', args });
          let rows = state[name].map(row => materialize(name, row)).filter(row => matches(row, args.where));
          if (args.orderBy) rows.sort((a, b) => a.id < b.id ? -1 : 1);
          if (args.take !== undefined) rows = rows.slice(0, args.take);
          return rows.map(row => project(row, args.select));
        },
        async findFirst(args) { const rows = await api[name].findMany(args); return rows[0] || null; },
        async updateMany(args) {
          calls.push({ model: name, method: 'updateMany', args });
          assert.notEqual(name, 'menuItem', 'Global MenuItem mutation is forbidden');
          if (hooks.beforeWrite) await hooks.beforeWrite(name, args, state);
          let count = 0;
          for (const row of state[name]) if (matches(row, args.where)) {
            for (const [key, value] of Object.entries(args.data)) row[key] = typeof value === 'object' && value && 'increment' in value
              ? row[key] + value.increment : structuredClone(value);
            count++;
          }
          return { count };
        },
        async createMany(args) {
          calls.push({ model: name, method: 'createMany', args });
          assert.equal(name, 'locationMenuItemPromo'); assert.equal(args.skipDuplicates, true);
          if (hooks.beforeCreate) await hooks.beforeCreate(args, state);
          let count = 0;
          for (const row of args.data) if (!state[name].some(old => old.locationId === row.locationId && old.menuItemId === row.menuItemId)) {
            state[name].push(structuredClone(row)); count++;
          }
          return { count };
        },
      };
    }
    api.orderItem = { async groupBy(args) {
      calls.push({ model: 'orderItem', method: 'groupBy', args });
      const sum = new Map();
      for (const row of state.orderItem.map(row => materialize('orderItem', row)).filter(row => matches(row, args.where))) {
        sum.set(row.menuItemId, (sum.get(row.menuItemId) || 0) + row.quantity);
      }
      return [...sum].map(([menuItemId, quantity]) => ({ menuItemId, _sum: { quantity } }));
    } };
    api.$queryRaw = async (strings, ...values) => {
      const sql = strings.join('?'); calls.push({ method: '$queryRaw', sql, values });
      assert.match(sql, /FOR SHARE/);
      if (hooks.onLock) await hooks.onLock(sql, values, state);
      const rows = sql.includes('"locations"') ? state.location : state.menuItem;
      return rows.filter(row => row.id === values[0] && row.restaurantId === values[1]
        && (!sql.includes('"isActive"') || row.isActive)).map(({ id }) => ({ id }));
    };
    if (isRoot) api.$transaction = async (work, options) => {
      const previous = queued; let release; queued = new Promise(resolve => { release = resolve; }); await previous;
      calls.push({ method: '$transaction', options });
      const before = structuredClone(state);
      try { return await work(client(false)); } catch (error) { state = before; throw error; } finally { release(); }
    };
    return api;
  }
  const prisma = client(true);
  return { prisma, calls, hooks, get state() { return state; },
    adapter: createPrismaPromoAdapter({ prismaClient: prisma, restaurantId: 'r1' }) };
}
const recommendations = (locationId = 'A', menuItemId = 'm1', price = 100) => analyzeLocationSales({ locationId,
  salesHistory: [{ locationId, menuItemId, quantity: 1, price }], thresholdUnits: 10, discountPercent: 25, activeDays: ['FRIDAY'] });
async function apply(f, locationId = 'A', recs = recommendations(locationId)) {
  return applyAutoPromos({ locationId, recommendations: recs, adapter: f.adapter });
}
function request(body, extra = {}) {
  return { params: { id: 'A' }, restaurantId: 'r1', user: { id: 'owner1', role: 'ADMIN', restaurantId: 'r1', tenantId: 'tenant1' }, body, ...extra };
}
function response() {
  return { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
async function endpoint(f, operation, req) {
  const res = response();
  await createPromoLocationHandlers({ prismaClient: f.prisma, now: () => NOW })[operation](req, res);
  return res;
}
const settings = { enabled: true, thresholdUnits: 10, discountPercent: 20, activeDays: ['MONDAY'], maxItems: 2 };
const writes = f => f.calls.filter(call => ['updateMany', 'createMany'].includes(call.method));

test('history counts only paid non-cancelled unrefunded sales from the selected location and time window', async () => {
  const f = fixture();
  const rows = await collectLocationSalesHistory({ locationId: 'A', prismaClient: f.prisma, now: NOW });
  assert.equal(rows.find(row => row.menuItemId === 'm1').quantity, 3);
  assert.equal(rows.find(row => row.menuItemId === 'm1').price, 100, 'Current price, not historical order price');
  assert.equal(rows.find(row => row.menuItemId === 'm2').quantity, 0);
  assert.deepEqual(rows.map(row => row.menuItemId).sort(), ['m1', 'm2', 'manual']);
  assert.ok(rows.every(row => row.locationId === 'A')); assert.ok(Object.isFrozen(rows));
  assert.equal(writes(f).length, 0);
});

test('history preserves filters, projection, date bounds, aggregation and catalog limit', async () => {
  const f = fixture(); await collectLocationSalesHistory({ locationId: 'A', days: 2, restaurantId: 'r1', prismaClient: f.prisma, now: NOW });
  const saleQuery = f.calls.find(call => call.method === 'groupBy').args;
  assert.deepEqual(saleQuery.by, ['menuItemId']); assert.deepEqual(saleQuery._sum, { quantity: true });
  assert.equal(saleQuery.where.order.is.locationId, 'A'); assert.equal(saleQuery.where.order.is.restaurantId, 'r1');
  assert.equal(saleQuery.where.menuItem.is.restaurantId, 'r1'); assert.equal(saleQuery.where.order.is.paymentStatus, 'PAID');
  assert.equal(saleQuery.where.order.is.createdAt.gte.getTime(), NOW - 2 * DAY);
  assert.equal(saleQuery.where.order.is.createdAt.lt.getTime(), NOW.getTime());
  assert.deepEqual(saleQuery.where.order.is.status, { notIn: ['CANCELLED'] });
  const itemQuery = f.calls.find(call => call.model === 'menuItem').args;
  assert.equal(itemQuery.take, 5001); assert.equal(itemQuery.where.category.is.restaurantId, 'r1');
  assert.ok(!itemQuery.select.description); assert.ok(!itemQuery.select.aiApiKey);
});

test('history excludes another tenant and rejects invalid windows before reading', async () => {
  const f = fixture();
  for (const days of [0, -1, 1.5, 366, '7']) await assert.rejects(collectLocationSalesHistory({ locationId: 'A', days, prismaClient: f.prisma }), { code: 'INVALID_DAYS' });
  assert.equal(f.calls.length, 0);
  await assert.rejects(collectLocationSalesHistory({ locationId: 'C', restaurantId: 'r1', prismaClient: f.prisma }), { code: 'LOCATION_NOT_FOUND' });
});

test('adapter reads are scoped to location/restaurant and never materialize overrides', async () => {
  const f = fixture();
  const rows = await f.adapter.getLocationItems({ locationId: 'A', menuItemIds: ['m1', 'manual', 'foreign'] });
  assert.equal(rows.length, 2); assert.equal(rows.find(row => row.menuItemId === 'm1').version, 0);
  assert.equal(rows.find(row => row.menuItemId === 'manual').promoSource, 'MANUAL');
  assert.equal(writes(f).length, 0);
  assert.deepEqual(f.calls.find(call => call.model === 'locationMenuItemPromo').args.where,
    { locationId: 'A', restaurantId: 'r1', menuItemId: { in: ['m1', 'manual', 'foreign'] } });
});

test('first CAS creates only the requested local override with decimal cents and no global mutation', async () => {
  const f = fixture(); const before = structuredClone(f.state.menuItem);
  assert.equal((await apply(f)).applied.length, 1);
  assert.equal(f.state.locationMenuItemPromo.length, 1);
  assert.deepEqual(f.state.menuItem, before);
  const row = f.state.locationMenuItemPromo[0];
  assert.equal(row.restaurantId, 'r1'); assert.equal(row.locationId, 'A'); assert.equal(row.promoPrice, '75.00'); assert.equal(row.version, 1);
  assert.ok(f.calls.some(call => call.sql?.includes('"menu_items"') && call.values[1] === 'r1'));
});

test('A and B can hold different prices for the same item and repeated application is a no-op', async () => {
  const f = fixture(); await apply(f);
  await apply(f, 'B', recommendations('B').map(rec => ({ ...rec, discountPercent: 10, promoPrice: 90 })));
  const before = writes(f).length; const result = await apply(f);
  assert.equal(result.skipped[0].reason, 'UNCHANGED'); assert.equal(writes(f).length, before);
  assert.deepEqual(f.state.locationMenuItemPromo.map(row => row.locationId), ['A', 'B']);
  assert.deepEqual(f.state.locationMenuItemPromo.map(row => row.promoPrice), ['75.00', '90.00']);
});

test('an active manual override and a global owner promotion always win', async () => {
  const f = fixture();
  f.state.locationMenuItemPromo.push({ restaurantId: 'r1', locationId: 'A', menuItemId: 'm1', isPromo: true, promoSource: 'MANUAL', promoPrice: '60.00', activeDays: ['SUNDAY'], version: 3 });
  const recs = [...recommendations(), ...recommendations('A', 'manual', 80)];
  const result = await apply(f, 'A', recs);
  assert.ok(result.skipped.every(row => row.reason === 'MANUAL_PROMO')); assert.equal(writes(f).length, 0);
});

test('manual override racing the first activation is never overwritten or duplicated', async () => {
  const f = fixture(); let raced = false;
  f.hooks.beforeWrite = (model, _args, state) => {
    if (model === 'locationMenuItemPromo' && !raced) { raced = true;
      state.locationMenuItemPromo.push({ restaurantId: 'r1', locationId: 'A', menuItemId: 'm1', isPromo: true, promoSource: 'MANUAL', promoPrice: '50.00', activeDays: [], version: 0 }); }
  };
  const result = await apply(f);
  assert.equal(result.skipped[0].reason, 'CONFLICT'); assert.equal(f.state.locationMenuItemPromo.length, 1);
  assert.equal(f.state.locationMenuItemPromo[0].promoPrice, '50.00');
});

test('global manual price or regular price changed after analysis stops local activation', async () => {
  for (const change of [{ isPromo: true }, { price: 120 }]) {
    const f = fixture(); f.hooks.onLock = (sql, _values, state) => {
      if (sql.includes('"menu_items"')) Object.assign(state.menuItem[0], change);
    };
    const result = await apply(f);
    assert.equal(result.skipped[0].reason, 'CONFLICT'); assert.equal(f.state.locationMenuItemPromo.length, 0);
  }
});

test('CAS compares version, manual flags and restaurant/location identity atomically', async () => {
  const f = fixture(); await apply(f);
  const initial = f.state.locationMenuItemPromo[0];
  const command = { where: { locationId: 'A', menuItemId: 'm1', price: 100, version: 0, isPromo: false, promoSource: null },
    data: { isPromo: true, promoPrice: 70, activeDays: [], promoSource: 'AUTO', version: 1 } };
  assert.deepEqual(await f.adapter.compareAndSetLocationPromo(command), { count: 0 });
  assert.equal(initial.promoPrice, '75.00');
  const update = f.calls.filter(call => call.method === 'updateMany' && call.model === 'locationMenuItemPromo').at(-1).args.where;
  assert.equal(update.restaurantId, 'r1'); assert.equal(update.locationId, 'A'); assert.equal(update.version, 0);
});

test('invalid CAS payloads, missing days and unsafe versions reject before a write', async () => {
  const f = fixture();
  const where = { locationId: 'A', menuItemId: 'm1', price: 100, version: 0, isPromo: false, promoSource: null };
  const data = { isPromo: true, promoPrice: 75, activeDays: [], promoSource: 'AUTO', version: 1 };
  for (const change of [{ promoPrice: 75.001 }, { activeDays: undefined }, { activeDays: ['BAD'] }, { version: 3 }, { isPromo: false }]) {
    await assert.rejects(f.adapter.compareAndSetLocationPromo({ where, data: { ...data, ...change } }));
  }
  assert.equal(writes(f).length, 0);
});

test('adapter refuses another restaurant location and inactive locations', async () => {
  const f = fixture();
  for (const locationId of ['C', 'OFF', 'missing']) {
    await assert.rejects(f.adapter.getLocationItems({ locationId, menuItemIds: ['m1'] }), { code: 'LOCATION_NOT_FOUND' });
  }
  assert.equal(writes(f).length, 0);
});

test('raw lock statements keep hostile identifier content in bound values, never SQL', async () => {
  const f = fixture(); const hostile = "a'; DROP TABLE menu_items; --";
  f.state.location.push({ ...f.state.location[0], id: hostile });
  await apply(f, hostile, recommendations(hostile));
  const lock = f.calls.find(call => call.sql?.includes('"locations"'));
  assert.equal(lock.values[0], hostile); assert.ok(!lock.sql.includes(hostile));
});

test('PUT saves owner settings only on the authorized location and disables the legacy global job flag', async () => {
  const f = fixture(); const untouched = structuredClone(f.state.location[1]);
  f.state.location[0].autoPromoEnabled = true;
  const res = await endpoint(f, 'settings', request(settings));
  assert.equal(res.statusCode, 200); assert.equal(res.body.enabled, true); assert.equal(res.body.discountPercent, 20);
  assert.equal(res.body.version, 1); assert.equal(f.state.location[0].autoPromoEnabled, false);
  assert.equal(f.state.location[0].locationPromoEnabled, true); assert.deepEqual(f.state.location[1], untouched);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('PUT rejects malformed rules and mass-assignment keys before transaction writes', async () => {
  for (const change of [{ enabled: 'true' }, { thresholdUnits: -1 }, { discountPercent: 100 }, { activeDays: ['BAD'] },
    { maxItems: 1.5 }, { restaurantId: 'r2' }, { version: 5 }]) {
    const f = fixture(); const res = await endpoint(f, 'settings', request({ ...settings, ...change }));
    assert.equal(res.statusCode, 400); assert.equal(writes(f).length, 0);
  }
});

test('both handlers require authentication, admin role, restaurant identity and tenant ownership', async () => {
  for (const operation of ['settings', 'run']) for (const change of [
    { user: null }, { user: { role: 'DELIVERY', restaurantId: 'r1', tenantId: 'tenant1' } },
    { restaurantId: 'r2' }, { user: { role: 'ADMIN', restaurantId: 'r1', tenantId: 'tenant2' } },
    { user: { role: 'ADMIN', restaurantId: 'r1', tenantId: 'tenant1', locationId: 'B' } },
  ]) {
    const f = fixture(); const res = await endpoint(f, operation, request(operation === 'settings' ? settings : { dryRun: false }, change));
    assert.ok([401, 403].includes(res.statusCode)); assert.equal(writes(f).length, 0);
  }
});

test('both endpoints return 404 for foreign or inactive locations without writes', async () => {
  for (const operation of ['settings', 'run']) for (const locationId of ['C', 'OFF', 'missing']) {
    const f = fixture(); const res = await endpoint(f, operation, request(operation === 'settings' ? settings : {}, { params: { id: locationId } }));
    assert.equal(res.statusCode, 404); assert.equal(writes(f).length, 0);
  }
});

test('POST dryRun defaults true and performs no materialization or promo writes', async () => {
  const f = fixture(); const res = await endpoint(f, 'run', request(undefined));
  assert.equal(res.statusCode, 200); assert.equal(res.body.dryRun, true);
  assert.equal(res.body.recommendations.find(row => row.menuItemId === 'm1').unitsSold, 3);
  assert.equal(writes(f).length, 0); assert.equal(f.state.locationMenuItemPromo.length, 0);
});

test('POST applies local promos and preserves global owner promotions and other branches', async () => {
  const f = fixture(); const before = structuredClone(f.state.menuItem);
  const res = await endpoint(f, 'run', request({ dryRun: false }));
  assert.equal(res.statusCode, 200); assert.equal(res.body.dryRun, false);
  assert.equal(res.body.applied.length, 2); assert.equal(res.body.skipped[0].reason, 'MANUAL_PROMO');
  assert.ok(f.state.locationMenuItemPromo.every(row => row.locationId === 'A' && row.restaurantId === 'r1'));
  assert.deepEqual(f.state.menuItem, before);
});

test('POST enforces disabled rule on execution but still allows preview', async () => {
  const f = fixture(); f.state.location[0].locationPromoEnabled = false;
  assert.equal((await endpoint(f, 'run', request({ dryRun: false }))).statusCode, 409);
  assert.equal((await endpoint(f, 'run', request({ dryRun: true }))).statusCode, 200);
  assert.equal(writes(f).length, 0);
});

test('POST respects per-location maxItems by units sold, with zero sellers first', async () => {
  const f = fixture(); f.state.location[0].autoPromoMaxItems = 1;
  f.state.menuItem.find(item => item.id === 'manual').id = 'aaa-manual';
  const res = await endpoint(f, 'run', request({ dryRun: true }));
  assert.equal(res.body.planned.length, 1); assert.equal(res.body.planned[0].menuItemId, 'm2');
  assert.equal(res.body.skipped[0].reason, 'MANUAL_PROMO');
});

test('POST rejects string dryRun and caller-supplied recommendations', async () => {
  for (const body of [{ dryRun: 'false' }, { recommendations: [] }, [], null]) {
    const f = fixture(); const res = await endpoint(f, 'run', request(body));
    if (body === null) assert.equal(res.statusCode, 200); // null is an absent optional body
    else assert.equal(res.statusCode, 400);
    assert.equal(writes(f).length, 0);
  }
});

test('POST rolls back the entire location run if a later override write fails', async () => {
  const f = fixture(); f.hooks.beforeCreate = args => { if (args.data[0].menuItemId === 'm2') throw new Error('private DB connection failure'); };
  const res = await endpoint(f, 'run', request({ dryRun: false }));
  assert.equal(res.statusCode, 503); assert.equal(f.state.locationMenuItemPromo.length, 0);
  assert.deepEqual(res.body, { error: 'Motor de promociones temporalmente no disponible', errorCode: 'PROMO_UNAVAILABLE' });
});

test('transaction conflicts return 409 without internal errors or automatic retry loops', async () => {
  const f = fixture(); let attempts = 0;
  f.hooks.beforeCreate = () => { attempts++; throw Object.assign(new Error('secret SQL'), { code: 'P2034' }); };
  const res = await endpoint(f, 'run', request({ dryRun: false }));
  assert.equal(res.statusCode, 409); assert.equal(res.body.errorCode, 'PROMO_CONFLICT'); assert.equal(attempts, 1);
});

test('route registration preserves authenticate, tenant and admin guards on both new endpoints', () => {
  const f = fixture(); const registered = [];
  const auth = { authenticate() {}, requireTenantAccess() {}, requireAdmin() {} };
  const router = Object.fromEntries(['get', 'put', 'post'].map(method => [method, (...args) => registered.push({ method, args })]));
  const filename = path.resolve(__dirname, '../src/routes/locations.routes.js');
  const module = { exports: {} };
  const isolatedRequire = name => {
    if (name === 'express') return { Router: () => router };
    if (name === '@mrtpvrest/database') return { prisma: f.prisma };
    if (name.includes('auth.middleware')) return auth;
    if (name.includes('logger')) return () => ({ info() {}, error() {} });
    if (name.includes('promo-adapter-prisma')) return require('../src/lib/promo-adapter-prisma');
    throw new Error('Unexpected app dependency');
  };
  vm.runInNewContext('(function(require,module){' + fs.readFileSync(filename, 'utf8') + '\n})', {})(isolatedRequire, module);
  for (const url of ['/:id/promo-settings', '/:id/run-promo-engine']) {
    const route = registered.find(row => row.args[0] === url);
    assert.ok(route); assert.deepEqual(route.args.slice(1, 4), [auth.authenticate, auth.requireTenantAccess, auth.requireAdmin]);
    assert.equal(typeof route.args[4], 'function');
  }
  assert.equal(f.calls.length, 0, 'Importing routes must not call Prisma');
});

test('new model is registered in tenant guard and both Prisma schemas remain byte-identical', () => {
  const root = path.resolve(__dirname, '../../..');
  const one = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'));
  const two = fs.readFileSync(path.join(root, 'apps/backend/prisma/schema.prisma'));
  assert.ok(one.equals(two)); assert.match(one.toString(), /model LocationMenuItemPromo \{/);
  assert.ok(require('../../../packages/database/tenant-guard').SCOPED_MODELS.has('LocationMenuItemPromo'));
});

test('oversized catalog is rejected instead of silently truncating sales or recommendations', async () => {
  const f = fixture(); const seed = f.state.menuItem[0];
  f.state.menuItem = Array.from({ length: 5001 }, (_, index) => ({ ...seed, id: `item-${index}` }));
  await assert.rejects(collectLocationSalesHistory({ locationId: 'A', prismaClient: f.prisma, now: NOW }), { code: 'CATALOG_TOO_LARGE' });
  assert.equal(f.calls.filter(call => call.method === 'groupBy').length, 0); assert.equal(writes(f).length, 0);
});

test('SUPER_ADMIN may explicitly choose a restaurant without weakening normal owner checks', async () => {
  const f = fixture();
  const res = await endpoint(f, 'settings', request(settings,
    { params: { id: 'C' }, restaurantId: 'r2', user: { id: 'super', role: 'SUPER_ADMIN' } }));
  assert.equal(res.statusCode, 200); assert.equal(res.body.locationId, 'C');
  const mutation = writes(f)[0].args.where;
  assert.equal(mutation.restaurantId, 'r2'); assert.equal(mutation.id, 'C');
});

test('transaction scope and timeout are explicit for adapter reads and writes', async () => {
  const f = fixture(); await apply(f);
  const transactions = f.calls.filter(call => call.method === '$transaction');
  assert.ok(transactions.length >= 2);
  assert.ok(transactions.every(call => call.options.isolationLevel === 'RepeatableRead' && call.options.timeout === 30000 && call.options.maxWait === 5000));
});
