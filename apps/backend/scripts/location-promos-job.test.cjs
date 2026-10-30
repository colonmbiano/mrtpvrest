'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, NOW, DAY } = require('./helpers/promo-prisma-fixture.cjs');
const { runLocationPromosJob } = require('../src/jobs/locationPromos.job');

function logger() {
  const events = [];
  return { events, ...Object.fromEntries(['info', 'warn', 'error'].map(level => [level,
    (event, fields) => events.push({ level, event, ...fields })])) };
}
const writes = f => f.calls.filter(call => ['updateMany', 'createMany'].includes(call.method));
const run = (f, options = {}) => runLocationPromosJob({ prismaClient: f.prisma, now: NOW, logger: logger(), ...options });
const onlyA = f => { for (const row of f.state.location) if (row.id !== 'A') row.locationPromoEnabled = false; };

function freshJob() {
  const filename = path.resolve(__dirname, '../src/jobs/locationPromos.job.js');
  const imports = [];
  const sandbox = { module: { exports: {} }, Date, process: { env: {} }, require(name) {
    imports.push(name);
    if (!['../lib/promo-engine', '../lib/promo-adapter-prisma', '../lib/runtime-policy'].includes(name)) {
      throw new Error(`Forbidden runtime dependency in offline test: ${name}`);
    }
    return require(path.resolve(path.dirname(filename), name));
  } };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, { filename });
  return { ...sandbox.module.exports, imports };
}

test('full run uses real domain engine/adapter, isolates restaurants/locations and leaves global menu unchanged', async () => {
  const f = fixture(); const before = structuredClone(f.state.menuItem); const log = logger();
  const result = await run(f, { logger: log });
  assert.equal(result.seen, 3); assert.equal(result.succeeded, 3); assert.equal(result.failed, 0);
  assert.equal(result.applied, 3); assert.equal(result.planned, 0);
  assert.deepEqual(f.state.menuItem, before);
  assert.deepEqual(f.state.locationMenuItemPromo.map(row => [row.locationId, row.menuItemId, row.promoPrice]),
    [['A', 'm1', '75.00'], ['A', 'm2', '150.00'], ['B', 'm2', '150.00']]);
  assert.ok(f.state.locationMenuItemPromo.every(row => row.restaurantId === 'r1' && row.promoSource === 'AUTO'));
  assert.equal(result.results.find(row => row.locationId === 'A').skipped.MANUAL_PROMO, 1);
  assert.equal(log.events[0].event, 'location_promos.started');
  assert.equal(log.events.at(-1).event, 'location_promos.finished');
});

test('discovery requires active AND either enabled flag, with explicit bounded projection', async () => {
  const f = fixture();
  f.state.location.find(row => row.id === 'A').locationPromoEnabled = false;
  Object.assign(f.state.location.find(row => row.id === 'B'), { locationPromoEnabled: false, autoPromoEnabled: true });
  const result = await run(f);
  assert.deepEqual(result.results.map(row => row.locationId), ['B', 'C']);
  const query = f.calls[0].args;
  assert.deepEqual(query.where, { isActive: true, OR: [{ locationPromoEnabled: true }, { autoPromoEnabled: true }] });
  assert.deepEqual(query.select, { id: true, restaurantId: true });
  assert.equal(query.take, 100); assert.deepEqual(query.orderBy, { id: 'asc' });
});

test('seven-day cutoff is shared by every location and sales are restaurant/location scoped', async () => {
  const f = fixture(); await run(f);
  const queries = f.calls.filter(call => call.method === 'groupBy').map(call => call.args.where.order.is);
  assert.equal(queries.length, 3);
  for (const query of queries) {
    assert.equal(query.createdAt.gte.getTime(), NOW - 7 * DAY);
    assert.equal(query.createdAt.lt.getTime(), NOW.getTime());
    assert.equal(query.restaurantId, query.locationId === 'C' ? 'r2' : 'r1');
    assert.equal(query.paymentStatus, 'PAID'); assert.equal(query.refundedAmount, 0);
  }
});

test('dryRun computes the same plan and manual skips without any writes or state changes', async () => {
  const f = fixture(); const before = structuredClone(f.state);
  const result = await run(f, { dryRun: true });
  assert.equal(result.planned, 3); assert.equal(result.applied, 0); assert.equal(result.dryRun, true);
  assert.equal(result.results.find(row => row.locationId === 'A').skipped.MANUAL_PROMO, 1);
  assert.equal(writes(f).length, 0); assert.deepEqual(f.state, before);
});

test('maxItems prioritizes lowest sales; manual promotions consume no slot', async () => {
  const f = fixture(); onlyA(f); f.state.location[0].autoPromoMaxItems = 1;
  const result = await run(f);
  assert.equal(result.applied, 1);
  assert.deepEqual(f.state.locationMenuItemPromo.map(row => row.menuItemId), ['m2']);
  assert.equal(result.results[0].skipped.MANUAL_PROMO, 1);
});

test('cap ties use stable item order and dryRun respects the same cap', async () => {
  const f = fixture(); onlyA(f); f.state.location[0].autoPromoMaxItems = 1;
  f.state.menuItem.push({ ...f.state.menuItem[0], id: 'm0', price: 40 });
  const preview = await run(f, { dryRun: true });
  assert.equal(preview.planned, 1); assert.equal(writes(f).length, 0);
  await run(f); assert.deepEqual(f.state.locationMenuItemPromo.map(row => row.menuItemId), ['m0']);
});

test('per-location threshold, discount, days and uncapped zero are used independently', async () => {
  const f = fixture(); Object.assign(f.state.location.find(row => row.id === 'B'), {
    autoPromoThreshold: 101, autoPromoDiscount: 10, autoPromoActiveDays: ['MONDAY'], autoPromoMaxItems: 0,
  });
  await run(f);
  const a = f.state.locationMenuItemPromo.find(row => row.locationId === 'A' && row.menuItemId === 'm1');
  const b = f.state.locationMenuItemPromo.find(row => row.locationId === 'B' && row.menuItemId === 'm1');
  assert.equal(a.promoPrice, '75.00'); assert.deepEqual(a.activeDays, ['FRIDAY']);
  assert.equal(b.promoPrice, '90.00'); assert.deepEqual(b.activeDays, ['MONDAY']);
});

test('one location failure rolls back all its writes and later locations continue', async () => {
  const f = fixture(); const log = logger();
  f.hooks.beforeCreate = args => {
    if (args.data[0].locationId === 'A' && args.data[0].menuItemId === 'm2') throw new Error('secret-db-host-and-token');
  };
  const result = await run(f, { logger: log });
  assert.equal(result.failed, 1); assert.equal(result.succeeded, 2); assert.equal(result.applied, 1);
  assert.deepEqual(f.state.locationMenuItemPromo.map(row => row.locationId), ['B']);
  assert.equal(result.results[0].errorCode, 'PROMO_JOB_FAILED');
  assert.ok(!JSON.stringify(log.events).includes('secret-db-host-and-token'));
  assert.equal(log.events.at(-1).level, 'warn');
  assert.ok(f.calls.filter(call => call.method === '$transaction').every(call => call.options.isolationLevel === 'RepeatableRead'));
});

test('invalid settings fail only the affected location before mutations', async () => {
  for (const config of [{ autoPromoMaxItems: -1 }, { autoPromoMaxItems: '1' }, { autoPromoDiscount: 100 },
    { autoPromoActiveDays: ['NEVER'] }, { autoPromoThreshold: -1 }]) {
    const f = fixture(); Object.assign(f.state.location[0], config);
    const result = await run(f);
    assert.equal(result.failed, 1); assert.equal(result.succeeded, 2);
    assert.ok(f.state.locationMenuItemPromo.every(row => row.locationId !== 'A'));
  }
});

test('disabled/deactivated location discovered earlier is rechecked under scoped lock', async () => {
  for (const field of ['locationPromoEnabled', 'isActive']) {
    const f = fixture(); f.hooks.onLock = (sql, values, state) => {
      if (sql.includes('"locations"') && values[0] === 'A') state.location[0][field] = false;
    };
    const result = await run(f);
    assert.equal(result.skipped, 1); assert.equal(result.failed, 0);
    assert.equal(result.results[0].reason, 'LOCATION_CHANGED');
    assert.ok(!f.calls.some(call => call.method === 'groupBy' && call.args.where.order.is.locationId === 'A'));
  }
});

test('CAS conflicts preserve owner changes without preventing other recommendations', async () => {
  const f = fixture(); onlyA(f); let raced = false;
  f.hooks.beforeWrite = (model, args, state) => {
    if (model === 'locationMenuItemPromo' && args.where.menuItemId === 'm1' && !raced) {
      raced = true;
      state.locationMenuItemPromo.push({ restaurantId: 'r1', locationId: 'A', menuItemId: 'm1',
        isPromo: true, promoPrice: '50.00', promoSource: 'MANUAL', activeDays: [], version: 0 });
    }
  };
  const result = await run(f);
  assert.equal(result.results[0].skipped.CONFLICT, 1); assert.equal(result.applied, 1);
  assert.equal(f.state.locationMenuItemPromo.find(row => row.menuItemId === 'm1').promoPrice, '50.00');
});

test('repeat runs are idempotent: identical automatic overrides do not advance versions', async () => {
  const f = fixture(); await run(f); const before = structuredClone(f.state); const count = writes(f).length;
  const result = await run(f);
  assert.equal(result.applied, 0); assert.equal(result.results[0].skipped.UNCHANGED, 2);
  assert.equal(writes(f).length, count); assert.deepEqual(f.state, before);
});

test('keyset discovery processes more than a page once each without offset or unbounded query', async () => {
  const f = fixture(); const template = f.state.location[0];
  f.state.location = Array.from({ length: 105 }, (_, i) => ({ ...template,
    id: `L${String(i).padStart(3, '0')}`, autoPromoThreshold: 0 }));
  const result = await run(f);
  assert.equal(result.succeeded, 105); assert.equal(new Set(result.results.map(row => row.locationId)).size, 105);
  const pages = f.calls.filter(call => call.model === 'location' && Object.keys(call.args.select).length === 2);
  assert.equal(pages.length, 2); assert.equal(pages[1].args.where.id.gt, 'L099');
  assert.ok(pages.every(call => call.args.take === 100 && !('skip' in call.args)));
});

test('no eligible locations is a successful empty run', async () => {
  const f = fixture(); f.state.location = [];
  const result = await run(f);
  assert.equal(result.seen, 0); assert.equal(result.failed, 0); assert.equal(writes(f).length, 0);
});

test('discovery errors reject once, log safe codes and release the in-process lock', async () => {
  const f = fixture(); const log = logger(); const find = f.prisma.location.findMany;
  f.prisma.location.findMany = async () => { throw Object.assign(new Error('sensitive detail'), { code: 'P2021' }); };
  await assert.rejects(run(f, { logger: log }), { code: 'P2021' });
  assert.equal(log.events.at(-1).errorCode, 'P2021'); assert.ok(!JSON.stringify(log.events).includes('sensitive detail'));
  f.prisma.location.findMany = find; assert.equal((await run(f)).succeeded, 3);
});

test('malformed discovery pages are rejected rather than looping or crossing unknown scopes', async () => {
  for (const rows of [[{ id: 'A' }], [{ id: 'A', restaurantId: 'r1' }, { id: 'A', restaurantId: 'r1' }]]) {
    const f = fixture(); f.prisma.location.findMany = async () => rows;
    await assert.rejects(run(f), { code: 'INVALID_LOCATION_PAGE' }); assert.equal(writes(f).length, 0);
  }
});

test('invalid invocation fails before querying or loading runtime dependencies', async () => {
  const job = freshJob(); const f = fixture();
  await assert.rejects(job.runLocationPromosJob({ prismaClient: f.prisma, dryRun: 'false' }), /dryRun/);
  await assert.rejects(job.runLocationPromosJob({ prismaClient: f.prisma, now: new Date(NaN) }), /cutoff/);
  await assert.rejects(job.runLocationPromosJob({ prismaClient: {} }), /root Prisma/);
  assert.equal(f.calls.length, 0); assert.equal(job.imports.length, 3);
});

test('concurrent runs using the same client are rejected without leaving a stale guard', async () => {
  const f = fixture(); const original = f.prisma.location.findMany; let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  f.prisma.location.findMany = async args => { entered(); await gate; return original(args); };
  const first = run(f); await started;
  await assert.rejects(run(f), { code: 'PROMO_JOB_RUNNING' });
  release(); await first; assert.equal((await run(f)).failed, 0);
});

test('import and disabled/isolated registration never load Prisma, logger, cron or timers', () => {
  const job = freshJob();
  assert.equal(job.startLocationPromosCronJob({ env: { ENABLE_BACKGROUND_JOBS: 'false' } }), null);
  assert.equal(job.startLocationPromosCronJob({ env: { MARKETPLACE_ISOLATED: 'true' } }), null);
  assert.throws(() => job.startLocationPromosCronJob({ env: { MARKETPLACE_ISOLATED: 'true', ENABLE_BACKGROUND_JOBS: 'true' } }), /cannot run/);
  assert.equal(job.imports.length, 3);
});

test('cron registers weekly in Mexico time once, does not run immediately, and returns a lifecycle handle', async () => {
  const job = freshJob(); const f = fixture(); const log = logger(); const registrations = [];
  const cron = { schedule(expression, tick, options) {
    const task = { state: 'idle', getStatus() { return this.state; }, stop() { this.state = 'stopped'; }, destroy() { this.state = 'destroyed'; } };
    registrations.push({ expression, tick, options, task }); return task;
  } };
  const options = { cron, prismaClient: f.prisma, logger: log, env: { ENABLE_BACKGROUND_JOBS: 'true' } };
  const task = job.startLocationPromosCronJob(options);
  assert.equal(job.startLocationPromosCronJob(options), task); assert.equal(registrations.length, 1);
  assert.equal(registrations[0].expression, '15 2 * * 0');
  assert.equal(registrations[0].options.timezone, 'America/Mexico_City');
  assert.equal(registrations[0].options.noOverlap, true); assert.equal(f.calls.length, 0);
  await registrations[0].tick(); assert.equal(f.state.locationMenuItemPromo.length > 0, true);
  task.stop(); assert.equal(task.getStatus(), 'stopped');
  task.destroy(); assert.notEqual(job.startLocationPromosCronJob(options), task); assert.equal(registrations.length, 2);
  assert.equal(job.imports.length, 3);
});

test('cron catches discovery errors to avoid an unhandled rejection', async () => {
  const job = freshJob(); const f = fixture(); const log = logger(); let tick;
  f.prisma.location.findMany = async () => { throw new Error('db password'); };
  job.startLocationPromosCronJob({ prismaClient: f.prisma, logger: log, env: {},
    cron: { schedule(_expression, callback) { tick = callback; return { getStatus: () => 'idle' }; } } });
  await assert.doesNotReject(tick());
  assert.equal(log.events.at(-1).event, 'location_promos.cron_failed');
  assert.ok(!JSON.stringify(log.events).includes('db password'));
});

test('logging sink failure does not lose committed promotions or block remaining locations', async () => {
  const f = fixture(); const fail = () => { throw new Error('log unavailable'); };
  const result = await run(f, { logger: { info: fail, warn: fail, error: fail } });
  assert.equal(result.failed, 0); assert.equal(result.applied, 3);
});
