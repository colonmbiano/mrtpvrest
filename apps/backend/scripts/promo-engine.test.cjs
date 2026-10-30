'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeLocationSales, applyAutoPromos, PromoEngineError } = require('../src/lib/promo-engine');

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

const sale = (locationId, menuItemId, quantity = 1, price = 100) => ({ locationId, menuItemId, quantity, price });
function analyze(salesHistory, overrides = {}) {
  return analyzeLocationSales({ locationId: 'A', salesHistory, thresholdUnits: 10,
    discountPercent: 25, activeDays: ['FRIDAY'], ...overrides });
}
function item(locationId = 'A', menuItemId = 'p1', extra = {}) {
  return { locationId, menuItemId, price: 100, isPromo: false, promoSource: null,
    promoPrice: null, activeDays: [], version: 0, ...extra };
}

// Location-keyed in-memory adapter. No ORM, app imports, jobs or network.
function adapterFixture(rows, beforeWrite) {
  const state = structuredClone(rows);
  const reads = [];
  const writes = [];
  const snapshots = [];
  const adapter = {
    async getLocationItems(query) {
      reads.push(query);
      const found = state.filter(row => row.locationId === query.locationId && query.menuItemIds.includes(row.menuItemId));
      const result = freeze(structuredClone(found));
      snapshots.push(result);
      return result;
    },
    async compareAndSetLocationPromo(command) {
      writes.push(command);
      if (beforeWrite) await beforeWrite(command, state);
      const row = state.find(candidate => Object.entries(command.where).every(([key, value]) => candidate[key] === value));
      if (!row) return { count: 0 };
      Object.assign(row, structuredClone(command.data));
      return { count: 1 };
    },
  };
  return { adapter, state, reads, writes, snapshots };
}

test('analysis aggregates only the requested location and groups repeated item sales', () => {
  const recommendations = analyze([
    sale('A', 'p1', 4), sale('A', 'p1', 5), sale('A', 'p2', 10),
    sale('B', 'p1', 100, 999), sale('B', 'other', 0),
  ]);
  assert.deepEqual(recommendations, [{ locationId: 'A', menuItemId: 'p1', unitsSold: 9,
    thresholdUnits: 10, price: 100, discountPercent: 25, promoPrice: 75, activeDays: ['FRIDAY'] }]);
});

test('threshold is strict: below qualifies, equal and above do not', () => {
  assert.equal(analyze([sale('A', 'p1', 9)]).length, 1);
  assert.equal(analyze([sale('A', 'p1', 10)]).length, 0);
  assert.equal(analyze([sale('A', 'p1', 11)]).length, 0);
  assert.equal(analyze([sale('A', 'p1', 0)], { thresholdUnits: 0 }).length, 0);
});

test('zero-sales catalog rows qualify; absent catalog items are not invented', () => {
  assert.equal(analyze([sale('A', 'p1', 0)])[0].unitsSold, 0);
  assert.deepEqual(analyze([]), []);
  assert.deepEqual(analyze([sale('B', 'p1', 0)]), []);
});

test('locations keep independent thresholds, prices and discount rules for the same item ID', () => {
  const rows = freeze([sale('A', 'shared', 2, 100), sale('B', 'shared', 2, 200)]);
  assert.equal(analyze(rows)[0].promoPrice, 75);
  assert.deepEqual(analyze(rows, { locationId: 'B', thresholdUnits: 2 }), []);
  assert.equal(analyze(rows, { locationId: 'B', thresholdUnits: 3, discountPercent: 10 })[0].promoPrice, 180);
});

test('analysis output is deterministic across input order, canonicalizes days and deduplicates them', () => {
  const rows = [sale('A', 'z', 1), sale('A', 'a', 2), sale('A', 'a', 1)];
  const options = { activeDays: ['SUNDAY', 'MONDAY', 'SUNDAY'] };
  const result = analyze(rows, options);
  assert.deepEqual(result, analyze([...rows].reverse(), options));
  assert.deepEqual(result.map(row => row.menuItemId), ['a', 'z']);
  assert.deepEqual(result[0].activeDays, ['MONDAY', 'SUNDAY']);
  assert.deepEqual(analyze([sale('A', 'p1')], { activeDays: [] })[0].activeDays, []);
});

test('decimal arithmetic rounds half up exactly once, including binary floating-point traps', () => {
  const cases = [
    [19.99, 15, 16.99], [1.5, 33, 1.01], [2.5, 33, 1.68],
    [100.555, 10, 90.5], [123.45, 0.1, 123.33], [1e10, 15, 8_500_000_000],
  ];
  for (const [price, discountPercent, expected] of cases) {
    assert.equal(analyze([sale('A', 'p1', 0, price)], { discountPercent })[0].promoPrice, expected);
  }
});

test('prices rounding to zero or back to regular price never become invalid promos', () => {
  assert.deepEqual(analyze([sale('A', 'p1', 0, 0.01)], { discountPercent: 1 }), []);
  assert.deepEqual(analyze([sale('A', 'p1', 0, 1)], { discountPercent: 99.9 }), []);
  assert.deepEqual(analyze([sale('A', 'p1', 0, 1e-7)]), []);
});

test('analysis is immutable and never freezes or changes caller-owned input', () => {
  const rows = [sale('A', 'p1')];
  const days = ['FRIDAY'];
  const before = structuredClone(rows);
  const result = analyze(rows, { activeDays: days });
  assert.deepEqual(rows, before); assert.equal(Object.isFrozen(rows), false);
  days.push('MONDAY'); assert.deepEqual(result[0].activeDays, ['FRIDAY']);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result[0])); assert.ok(Object.isFrozen(result[0].activeDays));
  assert.throws(() => result.push({}), TypeError);
  assert.throws(() => { result[0].promoPrice = 1; }, TypeError);
  assert.throws(() => result[0].activeDays.push('SUNDAY'), TypeError);
  analyze(freeze(rows), { activeDays: freeze(days) });
});

test('invalid owner settings fail even when history is empty', () => {
  for (const locationId of ['', ' ', null, 1, ' A ']) assert.throws(() => analyze([], { locationId }), { code: 'INVALID_ID' });
  for (const thresholdUnits of [-1, 1.5, NaN, Infinity, '10', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => analyze([], { thresholdUnits }), { code: 'INVALID_UNITS' });
  }
  for (const discountPercent of [0, -1, 100, 101, NaN, Infinity, '10']) assert.throws(() => analyze([], { discountPercent }), { code: 'INVALID_DISCOUNT' });
  for (const activeDays of [null, 'MONDAY', ['MON'], ['monday'], [1]]) assert.throws(() => analyze([], { activeDays }), { code: 'INVALID_ACTIVE_DAYS' });
});

test('invalid target sales reject missing scope, bad units, inconsistent prices and overflow', () => {
  assert.throws(() => analyze(null), { code: 'INVALID_SALES_HISTORY' });
  assert.throws(() => analyze([null]), { code: 'INVALID_SALES_HISTORY' });
  assert.throws(() => analyze([{ menuItemId: 'x', quantity: 1, price: 10 }]), { code: 'INVALID_ID' });
  for (const quantity of [-1, 0.5, NaN, '1']) assert.throws(() => analyze([sale('A', 'p1', quantity)]), { code: 'INVALID_UNITS' });
  for (const price of [0, -1, NaN, Infinity, '100', 1e16]) assert.throws(() => analyze([sale('A', 'p1', 0, price)]), { code: 'INVALID_PRICE' });
  assert.throws(() => analyze([sale('A', 'p1', 1, 100), sale('A', 'p1', 1, 200)]), { code: 'INCONSISTENT_PRICE' });
  assert.throws(() => analyze([sale('A', 'p1', Number.MAX_SAFE_INTEGER), sale('A', 'p1', 1)]), { code: 'INVALID_UNITS' });
});

test('another location does not affect aggregation or target-specific field validation', () => {
  const rows = [sale('A', 'p1', 1), { locationId: 'B', quantity: -1, price: null }];
  assert.equal(analyze(rows)[0].unitsSold, 1);
});

test('apply activates only location-specific promo fields and preserves descriptions', async () => {
  const f = adapterFixture([item('A', 'p1', { description: 'Owner text' }), item('B', 'p1')]);
  const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
  assert.equal(result.applied.length, 1); assert.equal(result.skipped.length, 0);
  assert.equal(f.state[0].isPromo, true); assert.equal(f.state[0].promoPrice, 75);
  assert.deepEqual(f.state[0].activeDays, ['FRIDAY']); assert.equal(f.state[0].promoSource, 'AUTO');
  assert.equal(f.state[0].description, 'Owner text'); assert.equal(f.state[0].version, 1);
  assert.equal(f.state[1].isPromo, false); assert.equal(f.state[1].version, 0);
  assert.deepEqual(f.reads[0], { locationId: 'A', menuItemIds: ['p1'] });
  assert.deepEqual(f.writes[0].where, { locationId: 'A', menuItemId: 'p1', price: 100, isPromo: false, promoSource: null, version: 0 });
  assert.deepEqual(Object.keys(f.writes[0].data).sort(), ['activeDays', 'isPromo', 'promoPrice', 'promoSource', 'version']);
});

test('same global item ID may receive different automatic promos in A and B', async () => {
  const f = adapterFixture([item('A'), item('B')]);
  await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
  await applyAutoPromos({ locationId: 'B', recommendations: analyze([sale('B', 'p1')], { locationId: 'B', discountPercent: 10 }), adapter: f.adapter });
  assert.equal(f.state[0].promoPrice, 75); assert.equal(f.state[1].promoPrice, 90);
  assert.equal(f.writes[0].where.locationId, 'A'); assert.equal(f.writes[1].where.locationId, 'B');
});

test('active manual promotions and unknown provenance are preserved without any writes', async () => {
  for (const promoSource of ['MANUAL', null, undefined, 'OTHER']) {
    const original = item('A', 'p1', { isPromo: true, promoSource, promoPrice: 80, activeDays: ['SUNDAY'] });
    const f = adapterFixture([original]);
    const before = structuredClone(f.state);
    const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
    assert.equal(result.skipped[0].reason, 'MANUAL_PROMO'); assert.deepEqual(f.state, before);
    assert.equal(f.writes.length, 0);
  }
});

test('an inactive manual flag does not block an owner-authorized automatic promotion', async () => {
  const f = adapterFixture([item('A', 'p1', { isPromo: false, promoSource: 'MANUAL' })]);
  const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
  assert.equal(result.applied.length, 1); assert.equal(f.state[0].promoSource, 'AUTO');
});

test('manual promo created after read wins the CAS even if a legacy writer fails to bump version', async () => {
  const f = adapterFixture([item()], (_command, state) => {
    state[0].isPromo = true; state[0].promoSource = 'MANUAL'; state[0].promoPrice = 81; state[0].activeDays = ['SUNDAY'];
  });
  const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
  assert.equal(result.applied.length, 0); assert.equal(result.skipped[0].reason, 'CONFLICT');
  assert.equal(f.state[0].promoPrice, 81); assert.deepEqual(f.state[0].activeDays, ['SUNDAY']);
});

test('version changes are detected atomically without overwriting a newer automatic rule', async () => {
  const f = adapterFixture([item()], (_command, state) => { state[0].version++; });
  const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: f.adapter });
  assert.equal(result.skipped[0].reason, 'CONFLICT'); assert.equal(f.state[0].isPromo, false);
});

test('changed regular price and deleted item are skipped rather than repriced from stale data', async () => {
  const f = adapterFixture([item('A', 'p1', { price: 120 })]);
  const result = await applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1'), sale('A', 'missing')]), adapter: f.adapter });
  assert.deepEqual(result.skipped.map(row => row.reason), ['NOT_FOUND', 'PRICE_CHANGED']);
  assert.equal(f.writes.length, 0);
});

test('reapplying the same automatic rule is idempotent and does not advance version', async () => {
  const f = adapterFixture([item()]); const recommendations = analyze([sale('A', 'p1')]);
  await applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter });
  const result = await applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter });
  assert.equal(result.skipped[0].reason, 'UNCHANGED'); assert.equal(f.writes.length, 1); assert.equal(f.state[0].version, 1);
});

test('existing automatic promos can be updated to a new owner-approved discount and days', async () => {
  const f = adapterFixture([item('A', 'p1', { isPromo: true, promoSource: 'AUTO', promoPrice: 90 })]);
  const recommendations = analyze([sale('A', 'p1')], { activeDays: ['MONDAY', 'TUESDAY'] });
  const result = await applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter });
  assert.equal(result.applied.length, 1); assert.equal(f.state[0].promoPrice, 75);
  assert.deepEqual(f.state[0].activeDays, ['MONDAY', 'TUESDAY']);
});

test('foreign and duplicate recommendations reject the entire batch before adapter access', async () => {
  const f = adapterFixture([item()]);
  const own = analyze([sale('A', 'p1')]);
  const foreign = analyze([sale('B', 'p2')], { locationId: 'B' });
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations: [...own, ...foreign], adapter: f.adapter }), { code: 'LOCATION_MISMATCH' });
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations: [...own, ...own], adapter: f.adapter }), { code: 'DUPLICATE_RECOMMENDATION' });
  assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});

test('forged prices, thresholds and days are rejected before any read or write', async () => {
  const f = adapterFixture([item()]); const [rec] = analyze([sale('A', 'p1')]);
  for (const change of [{ promoPrice: 1 }, { unitsSold: 10 }, { thresholdUnits: 0 }, { activeDays: ['BAD'] }]) {
    await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations: [{ ...rec, ...change }], adapter: f.adapter }), PromoEngineError);
  }
  assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
});

test('foreign, duplicate or unversioned adapter snapshots reject before any write', async () => {
  let writes = 0;
  const recommendations = analyze([sale('A', 'p1')]);
  for (const rows of [[item('B')], [item(), item()], [item('A', 'p1', { version: undefined })], [item('A', 'unrequested')]]) {
    const adapter = { getLocationItems: async () => rows, compareAndSetLocationPromo: async () => { writes++; return { count: 1 }; } };
    await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations, adapter }), PromoEngineError);
  }
  assert.equal(writes, 0);
});

test('apply never mutates recommendations or read snapshots and returns deeply frozen summaries', async () => {
  const f = adapterFixture([item()]);
  const recommendations = freeze(structuredClone(analyze([sale('A', 'p1')])));
  const before = structuredClone(recommendations);
  const result = await applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter });
  assert.deepEqual(recommendations, before); assert.equal(f.snapshots[0][0].isPromo, false);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.applied)); assert.ok(Object.isFrozen(result.skipped));
  assert.ok(Object.isFrozen(result.applied[0])); assert.ok(Object.isFrozen(result.applied[0].activeDays));
  assert.throws(() => result.applied[0].activeDays.push('SUNDAY'), TypeError);
  assert.ok(Object.isFrozen(f.writes[0])); assert.ok(Object.isFrozen(f.writes[0].where)); assert.ok(Object.isFrozen(f.writes[0].data));
});

test('an empty batch needs no adapter and performs no effects', async () => {
  assert.deepEqual(await applyAutoPromos({ locationId: 'A', recommendations: [] }), { locationId: 'A', applied: [], skipped: [] });
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations: analyze([sale('A', 'p1')]), adapter: {} }), { code: 'INVALID_ADAPTER' });
});

test('adapter read/write errors propagate without retries or implicit success', async () => {
  const recommendations = analyze([sale('A', 'p1')]); let reads = 0; let writes = 0;
  const readFailure = { getLocationItems: async () => { reads++; throw new Error('read failed'); }, compareAndSetLocationPromo: async () => { writes++; } };
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations, adapter: readFailure }), /read failed/);
  assert.equal(reads, 1); assert.equal(writes, 0);
  const writeFailure = { getLocationItems: async () => [item()], compareAndSetLocationPromo: async () => { writes++; throw new Error('write failed'); } };
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations, adapter: writeFailure }), /write failed/);
  assert.equal(writes, 1);
});

test('CAS must acknowledge exactly zero or one row; broad/global write counts are rejected', async () => {
  const recommendations = analyze([sale('A', 'p1')]);
  for (const count of [2, -1, true, undefined]) {
    await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations,
      adapter: { getLocationItems: async () => [item()], compareAndSetLocationPromo: async () => ({ count }) } }), { code: 'INVALID_ADAPTER_RESULT' });
  }
});

test('concurrent applications share a location version; at most one identical rule is applied', async () => {
  const f = adapterFixture([item()]); const recommendations = analyze([sale('A', 'p1')]);
  const outcomes = await Promise.all([1, 2].map(() => applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter })));
  assert.equal(outcomes.reduce((sum, row) => sum + row.applied.length, 0), 1);
  assert.equal(f.state[0].version, 1);
  assert.equal(outcomes.reduce((sum, row) => sum + row.skipped.length, 0), 1);
});

test('a later adapter failure does not pretend to roll back already acknowledged writes', async () => {
  const f = adapterFixture([item('A', 'p1'), item('A', 'p2')], command => {
    if (command.where.menuItemId === 'p2') throw new Error('second write failed');
  });
  const recommendations = analyze([sale('A', 'p1'), sale('A', 'p2')]);
  await assert.rejects(applyAutoPromos({ locationId: 'A', recommendations, adapter: f.adapter }), /second write failed/);
  assert.equal(f.state[0].isPromo, true); assert.equal(f.state[1].isPromo, false);
  assert.equal(f.writes.length, 2);
});
