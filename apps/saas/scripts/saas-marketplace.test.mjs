// SaaS Marketplace Panel - Metrics, Split & Ledger
// Verifica: cálculos de métricas, split, filtros y estructura de pantalla
// Fixtures offline; usa el compilador TypeScript local para probar la lógica de producción.
//   node apps/saas/scripts/saas-marketplace.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const forbidden = () => { throw new Error('Offline SaaS suite forbids network and external persistence'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};
const ts = require('typescript');
const source = readFileSync(new URL('../lib/marketplaceDispatchAudit.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { fileName: 'marketplaceDispatchAudit.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.equal((compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const module = { exports: {} };
vm.runInNewContext(compiled.outputText, { module, exports: module.exports, require: forbidden, fetch: forbidden });
const { DISPATCH_STATUSES, classifyDispatchTask, filterDispatchTasks, countDispatchTasks, mergeDispatchTasks,
  parseDispatchPage, loadDispatchPage, dispatchLoadError } = module.exports;
const plain = value => JSON.parse(JSON.stringify(value));

// Las métricas reales de la pantalla se verifican en marketplace-overview.test.mjs.

// Dispatch audit: these tests execute the exact module imported by the UI.
const dispatchTasks = [
  { taskId: 't0', taskStatus: 'WAITING_READY', dispatchMode: null, attempts: 0 },
  { taskId: 't1', taskStatus: 'OFFERING', dispatchMode: 'OWN', attempts: 1 },
  { taskId: 't2', taskStatus: 'ASSIGNED', dispatchMode: 'OWN', attempts: 2 },
  { taskId: 't3', taskStatus: 'PICKED_UP', dispatchMode: 'SHARED', attempts: 1 },
  { taskId: 't4', taskStatus: 'DELIVERED', dispatchMode: 'SHARED', attempts: 3 },
  { taskId: 't5', taskStatus: 'REASSIGNING', dispatchMode: null, attempts: 0 },
  { taskId: 't6', taskStatus: 'FAILED', dispatchMode: 'OWN', attempts: 2 },
  { taskId: 't7', taskStatus: 'CANCELLED', dispatchMode: null, attempts: 0 },
];
const apiRow = (task = dispatchTasks[1]) => ({ id: task.taskId, status: task.taskStatus, dispatchMode: task.dispatchMode, attempts: task.attempts });

test('dispatch offline guards reject fetch, sockets, HTTP and persistence imports', () => {
  for (const work of [() => fetch('https://example.invalid'), () => require('node:net').connect(1, '127.0.0.1'),
    () => require('node:https').request('https://example.invalid'), () => require('@mrtpvrest/database')]) assert.throws(work, /Offline SaaS suite/);
});

for (const task of dispatchTasks) {
  test(`dispatch ${task.taskStatus}: correct active classification and exact status filter`, () => {
    const expectedActive = ['WAITING_READY', 'OFFERING', 'ASSIGNED', 'PICKED_UP', 'REASSIGNING'].includes(task.taskStatus);
    assert.equal(classifyDispatchTask(task).active, expectedActive);
    assert.deepEqual(plain(filterDispatchTasks(dispatchTasks, task.taskStatus)), [task]);
    assert.equal(countDispatchTasks([task]).byStatus[task.taskStatus], 1);
  });
}

test('dispatch alert: REASSIGNING is highlighted even with zero attempts', () => {
  for (const dispatchMode of ['OWN', 'SHARED', null]) {
    assert.equal(classifyDispatchTask({ taskId: 'manual', taskStatus: 'REASSIGNING', dispatchMode, attempts: 0 }).needsAttention, true);
  }
});

test('dispatch alert: two attempts is the inclusive threshold regardless of network mode', () => {
  for (const dispatchMode of ['OWN', 'SHARED', null]) for (const attempts of [0, 1, 2, 3, 100]) {
    assert.equal(classifyDispatchTask({ taskId: 'retry', taskStatus: 'OFFERING', dispatchMode, attempts }).needsAttention, attempts >= 2);
  }
});

test('dispatch ACTIVE excludes DELIVERED, FAILED and CANCELLED and leaves source data untouched', () => {
  const before = structuredClone(dispatchTasks);
  assert.deepEqual(plain(filterDispatchTasks(dispatchTasks, 'ACTIVE').map(task => task.taskId)), ['t0', 't1', 't2', 't3', 't5']);
  assert.deepEqual(plain(filterDispatchTasks(dispatchTasks, 'ALL')), dispatchTasks);
  assert.deepEqual(dispatchTasks, before);
  assert.throws(() => filterDispatchTasks(dispatchTasks, 'PREPARING'), /INVALID_DISPATCH_FILTER/);
});

test('dispatch counts: totals, alerts, OWN/SHARED/unassigned and every status reconcile exactly', () => {
  const counts = countDispatchTasks(dispatchTasks);
  assert.deepEqual(plain(counts), { total: 8, active: 5, attention: 4, own: 3, shared: 2, unassigned: 3,
    byStatus: Object.fromEntries(DISPATCH_STATUSES.map(status => [status, 1])) });
  assert.equal(counts.own + counts.shared + counts.unassigned, counts.total);
  assert.equal(Object.values(counts.byStatus).reduce((sum, count) => sum + count, 0), counts.total);
  const active = countDispatchTasks(filterDispatchTasks(dispatchTasks, 'ACTIVE'));
  assert.equal(active.total, 5); assert.equal(active.attention, 2); assert.equal(active.byStatus.DELIVERED, 0);
});

test('dispatch empty results have zero counts and all status buckets remain available', () => {
  const counts = countDispatchTasks([]);
  assert.equal(counts.total, 0); assert.equal(counts.active, 0); assert.equal(counts.attention, 0);
  assert.equal(counts.own, 0); assert.equal(counts.shared, 0); assert.equal(counts.unassigned, 0);
  assert.ok(Object.values(counts.byStatus).every(value => value === 0));
  for (const filter of ['ALL', 'ACTIVE', ...DISPATCH_STATUSES]) assert.equal(filterDispatchTasks([], filter).length, 0);
});

test('dispatch projection maps backend id/status and omits contacts, GPS, tokens and assignments', () => {
  const rows = dispatchTasks.map(task => ({ ...apiRow(task), phone: 'PRIVATE-PHONE', gps: { lat: 1, lng: 1 },
    trackingToken: 'PRIVATE-TOKEN', currentAssignment: { courierId: 'private-courier' } }));
  const page = parseDispatchPage({ items: rows, nextCursor: 'next-page' });
  assert.deepEqual(plain(page.items), dispatchTasks); assert.equal(page.nextCursor, 'next-page');
  assert.ok(!JSON.stringify(page).includes('PRIVATE')); assert.ok(!JSON.stringify(page).includes('courierId'));
  assert.equal(parseDispatchPage({ items: [], nextCursor: null }).items.length, 0);
});

test('dispatch malformed pages, ambiguous task identifiers and invalid attempts fail closed', () => {
  const valid = apiRow();
  const invalidRows = [null, [], {}, { ...valid, id: '' }, { ...valid, id: ' padded ' }, { ...valid, id: 'bad\n' },
    { ...valid, id: 'x'.repeat(129) }, { ...valid, status: 'ON_THE_WAY' }, { ...valid, dispatchMode: 'MANUAL' },
    { ...valid, dispatchMode: undefined }, { ...valid, attempts: -1 }, { ...valid, attempts: 1.5 },
    { ...valid, attempts: '2' }, { ...valid, attempts: NaN }, { ...valid, attempts: Number.MAX_SAFE_INTEGER + 1 }];
  for (const row of invalidRows) assert.throws(() => parseDispatchPage({ items: [row], nextCursor: null }), /INVALID_DISPATCH_RESPONSE/);
  for (const page of [null, [], {}, { items: {} }, { items: [] }, { items: [], nextCursor: '' },
    { items: [], nextCursor: ['one', 'two'] }, { items: [], nextCursor: 'x'.repeat(513) },
    { items: [valid, valid], nextCursor: null }, { items: Array.from({ length: 101 }, (_, i) => ({ ...valid, id: `task-${i}` })), nextCursor: null }]) {
    assert.throws(() => parseDispatchPage(page), /INVALID_DISPATCH_RESPONSE/);
  }
});

test('dispatch pagination merges repeated tasks by latest observation without double counting or mutation', () => {
  const previous = structuredClone(dispatchTasks.slice(0, 3)); const before = structuredClone(previous);
  const updated = { ...dispatchTasks[1], taskStatus: 'REASSIGNING', attempts: 2 };
  const result = mergeDispatchTasks(previous, [updated, dispatchTasks[3]]);
  assert.equal(result.length, 4); assert.equal(result.find(task => task.taskId === updated.taskId).taskStatus, 'REASSIGNING');
  assert.equal(countDispatchTasks(result).attention, 2); assert.deepEqual(previous, before);
});

test('dispatch GET uses the authenticated Ops route, limit, exact backend status and opaque cursor', async () => {
  const calls = []; const signal = new AbortController().signal;
  const api = { get: async (url, config) => { calls.push({ url, config }); return { data: { items: [apiRow(dispatchTasks[5])], nextCursor: null } }; } };
  const page = await loadDispatchPage(api, { filter: 'REASSIGNING', cursor: 'page-two', signal });
  assert.equal(page.items[0].taskStatus, 'REASSIGNING');
  assert.equal(calls[0].url, '/api/marketplace/v1/ops/dispatch');
  assert.deepEqual(plain(calls[0].config.params), { limit: 100, status: 'REASSIGNING', cursor: 'page-two' });
  assert.equal(calls[0].config.signal, signal);
});

test('dispatch ACTIVE and ALL are local groups and never sent as unsupported backend status values', async () => {
  for (const filter of ['ACTIVE', 'ALL']) {
    const api = { get: async (url, config) => {
      assert.deepEqual(plain(config.params), { limit: 100 }); return { data: { items: dispatchTasks.map(apiRow), nextCursor: null } };
    } };
    const page = await loadDispatchPage(api, { filter });
    assert.equal(page.items.length, 8); assert.equal(filterDispatchTasks(page.items, filter).length, filter === 'ACTIVE' ? 5 : 8);
  }
});

test('dispatch invalid filters/cursors fail before requests; bad server filtering and repeated cursors are rejected', async () => {
  const never = { get: forbidden };
  await assert.rejects(loadDispatchPage(never, { filter: 'UNKNOWN' }), /INVALID_DISPATCH_FILTER/);
  for (const cursor of ['', 'bad cursor', 'x'.repeat(513)]) await assert.rejects(loadDispatchPage(never, { cursor }), /INVALID_DISPATCH_CURSOR/);
  await assert.rejects(loadDispatchPage({ get: async () => ({ data: { items: [apiRow(dispatchTasks[0])], nextCursor: null } }) },
    { filter: 'DELIVERED' }), /INVALID_DISPATCH_RESPONSE/);
  await assert.rejects(loadDispatchPage({ get: async () => ({ data: { items: [], nextCursor: 'same' } }) },
    { cursor: 'same' }), /INVALID_DISPATCH_RESPONSE/);
});

test('dispatch HTTP failures remain errors, with authorized-access messaging and no adapter details', async () => {
  for (const status of [401, 403, 422, 503]) {
    const error = Object.assign(new Error('PRIVATE-ADAPTER-DETAILS'), { response: { status } });
    await assert.rejects(loadDispatchPage({ get: async () => { throw error; } }), value => value === error);
    const message = dispatchLoadError(error); assert.ok(!message.includes('PRIVATE'));
    assert.match(message, status === 401 || status === 403 ? /autorización/ : /cargar/);
  }
});
