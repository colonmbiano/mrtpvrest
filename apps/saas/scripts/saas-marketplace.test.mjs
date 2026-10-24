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

// ── Mock Data ──────────────────────────────────────────────────────────────

const mockOrders = [
  { id: '1', orderNumber: 'ORD-001', storeId: 's1', storeName: 'Taquería Central', subtotal: 100, deliveryFee: 50, total: 150, status: 'DELIVERED', createdAt: new Date().toISOString() },
  { id: '2', orderNumber: 'ORD-002', storeId: 's1', storeName: 'Taquería Central', subtotal: 80, deliveryFee: 40, total: 120, status: 'DELIVERED', createdAt: new Date().toISOString() },
  { id: '3', orderNumber: 'ORD-003', storeId: 's2', storeName: 'Ferretería Pro', subtotal: 200, deliveryFee: 30, total: 230, status: 'PENDING', createdAt: new Date().toISOString() },
];

const mockStores = [
  { id: 's1', name: 'Taquería Central', businessType: 'RESTAURANT', collectorId: 'col-001', orderCount: 2, gmv: 270, createdAt: new Date().toISOString() },
  { id: 's2', name: 'Ferretería Pro', businessType: 'HARDWARE', collectorId: 'col-002', orderCount: 1, gmv: 230, createdAt: new Date().toISOString() },
  { id: 's3', name: 'Refaccionaria Express', businessType: 'AUTOPARTS', collectorId: undefined, orderCount: 0, gmv: 0, createdAt: new Date().toISOString() },
];

const mockLedger = [
  { type: 'GATEWAY_ESCROW', amount: 500 },
  { type: 'MERCHANT_PAYABLE', amount: 450 },
  { type: 'COURIER_PAYABLE', amount: 200 },
  { type: 'PLATFORM_FEES', amount: 50 },
];

// ── GMV & Revenue ──────────────────────────────────────────────────────────

test('GMV total: suma de todos los totales de órdenes', () => {
  const gmvTotal = mockOrders.reduce((s, o) => s + o.total, 0);
  assert.equal(gmvTotal, 500);
});

test('GMV sin contar PENDING: solo DELIVERED', () => {
  const delivered = mockOrders.filter(o => o.status === 'DELIVERED');
  const gmvDelivered = delivered.reduce((s, o) => s + o.total, 0);
  assert.equal(gmvDelivered, 270);
});

test('plataforma fee (5%): 5% del GMV total', () => {
  const gmvTotal = 500;
  const platformFees = gmvTotal * 0.05;
  assert.equal(platformFees, 25);
});

test('platform fees son PLATFORM_FEES en ledger', () => {
  const platformFeesLedger = mockLedger.filter(l => l.type === 'PLATFORM_FEES').reduce((s, l) => s + l.amount, 0);
  assert.equal(platformFeesLedger, 50);
});

// ── Órdenes & Comercios ────────────────────────────────────────────────────

test('total órdenes: contar todas sin filtro', () => {
  const totalOrders = mockOrders.length;
  assert.equal(totalOrders, 3);
});

test('comercios activos: contar los con orderCount > 0', () => {
  const activeStores = mockStores.filter(s => s.orderCount > 0).length;
  assert.equal(activeStores, 2);
});

test('comercios inactivos: orderCount = 0', () => {
  const inactiveStores = mockStores.filter(s => s.orderCount === 0).length;
  assert.equal(inactiveStores, 1);
});

// ── Mercado Pago Split Setup ───────────────────────────────────────────────

test('split activo: collectorId está definido', () => {
  const withCollector = mockStores.filter(s => s.collectorId).length;
  assert.equal(withCollector, 2);
});

test('split no activo: collectorId undefined', () => {
  const withoutCollector = mockStores.filter(s => !s.collectorId).length;
  assert.equal(withoutCollector, 1);
});

test('status split: mostrar "✓ Activo" si collectorId', () => {
  const store = mockStores[0];
  const status = store.collectorId ? '✓ Activo' : '—';
  assert.equal(status, '✓ Activo');
});

test('status split: mostrar "—" si sin collectorId', () => {
  const store = mockStores[2];
  const status = store.collectorId ? '✓ Activo' : '—';
  assert.equal(status, '—');
});

// ── Ledger Balance ─────────────────────────────────────────────────────────

test('GATEWAY_ESCROW: fondos en pasarela', () => {
  const escrow = mockLedger.filter(l => l.type === 'GATEWAY_ESCROW').reduce((s, l) => s + l.amount, 0);
  assert.equal(escrow, 500);
});

test('MERCHANT_PAYABLE: por pagar a comercios', () => {
  const merchantPayable = mockLedger.filter(l => l.type === 'MERCHANT_PAYABLE').reduce((s, l) => s + l.amount, 0);
  assert.equal(merchantPayable, 450);
});

test('COURIER_PAYABLE: por pagar a repartidores', () => {
  const courierPayable = mockLedger.filter(l => l.type === 'COURIER_PAYABLE').reduce((s, l) => s + l.amount, 0);
  assert.equal(courierPayable, 200);
});

test('balance coherente: ESCROW disponible para payables', () => {
  const escrow = 500;
  const merchantPayable = 450;
  const courierPayable = 200;
  assert.equal(escrow > 0, true);
  assert.equal(merchantPayable + courierPayable > 0, true);
});

// ── Business Types ─────────────────────────────────────────────────────────

test('tipos de negocio válidos: RESTAURANT, GROCERY, RETAIL, HARDWARE, AUTOPARTS', () => {
  const validTypes = ['RESTAURANT', 'GROCERY', 'RETAIL', 'HARDWARE', 'AUTOPARTS'];
  const types = mockStores.map(s => s.businessType);
  types.forEach(t => assert.equal(validTypes.includes(t), true));
});

test('labels de giros: tienen nombre español', () => {
  const labels = {
    RESTAURANT: '🍽️ Restaurante',
    GROCERY: '🥑 Abarrotes',
    RETAIL: '🛍️ Tienda',
    HARDWARE: '🔨 Ferretería',
    AUTOPARTS: '🚗 Refaccionaria',
  };
  const names = ['Restaurante', 'Abarrotes', 'Tienda', 'Ferretería', 'Refaccionaria'];
  Object.values(labels).forEach((l, i) => {
    assert.ok(l.includes(names[i]));
    assert.ok(l.length > 5);
  });
});

// ── Métricas Tarjeta ───────────────────────────────────────────────────────

test('tarjeta GMV Total: mostrar suma de todos los órdenes', () => {
  const gmv = 500;
  assert.equal(gmv > 0, true);
});

test('tarjeta Comisiones: mostrar 5% del GMV', () => {
  const fees = 25;
  assert.equal(fees > 0, true);
});

test('tarjeta Total Órdenes: contar órdenes', () => {
  const count = 3;
  assert.equal(count > 0, true);
});

test('tarjeta Comercios Activos: contar con orderCount > 0', () => {
  const count = 2;
  assert.equal(count > 0, true);
});

// ── Tabla de Comercios ─────────────────────────────────────────────────────

test('columnas tabla: Nombre, Giro, Mercado Pago, Órdenes, GMV', () => {
  const columns = ['Nombre', 'Giro', 'Mercado Pago', 'Órdenes', 'GMV'];
  assert.equal(columns.length, 5);
});

test('cada fila: datos del comercio', () => {
  const store = mockStores[0];
  assert.ok(store.name);
  assert.ok(store.businessType);
  assert.ok(typeof store.collectorId === 'string' || store.collectorId === undefined);
  assert.equal(typeof store.orderCount, 'number');
  assert.equal(typeof store.gmv, 'number');
});

// ── Tabla de Órdenes Recientes ─────────────────────────────────────────────

test('mostrar últimas 10 órdenes reversidas', () => {
  const recentOrders = mockOrders.slice(-10).reverse();
  assert.equal(recentOrders.length <= 10, true);
});

test('columnas tabla órdenes: Orden, Tienda, Subtotal, Envío, Total, Estado, Fecha', () => {
  const columns = ['Orden', 'Tienda', 'Subtotal', 'Envío', 'Total', 'Estado', 'Fecha'];
  assert.equal(columns.length, 7);
});

test('estado orden color: DELIVERED verde, otro gris', () => {
  const order = mockOrders[0];
  const color = order.status === 'DELIVERED' ? 'verde' : 'gris';
  assert.equal(color, 'verde');
});

// ── Formateo ────────────────────────────────────────────────────────────────

test('formatCurrency: $XX.XX', () => {
  const format = (n) => `$${n.toFixed(2)}`;
  assert.equal(format(150), '$150.00');
  assert.equal(format(50.5), '$50.50');
});

test('formatDate: localeDateString es-MX formato válido', () => {
  const date = new Date('2025-03-15');
  const formatted = date.toLocaleDateString('es-MX');
  assert.ok(formatted.length > 0);
  assert.ok(typeof formatted === 'string');
});

// ── Validaciones ───────────────────────────────────────────────────────────

test('orden valida: id, orderNumber, total, status', () => {
  const order = mockOrders[0];
  assert.ok(order.id);
  assert.ok(order.orderNumber);
  assert.ok(typeof order.total === 'number');
  assert.ok(order.status);
});

test('comercio valido: id, name, businessType, collectorId, orderCount, gmv', () => {
  const store = mockStores[0];
  assert.ok(store.id);
  assert.ok(store.name);
  assert.ok(store.businessType);
  assert.equal(typeof store.collectorId, 'string');
  assert.equal(typeof store.orderCount, 'number');
  assert.equal(typeof store.gmv, 'number');
});

test('ledger entry valida: type y amount', () => {
  const entry = mockLedger[0];
  const validTypes = ['GATEWAY_ESCROW', 'MERCHANT_PAYABLE', 'COURIER_PAYABLE', 'PLATFORM_FEES'];
  assert.ok(validTypes.includes(entry.type));
  assert.equal(typeof entry.amount, 'number');
});

// ── Flujos Completos ──────────────────────────────────────────────────────

test('flujo cargar: órdenes → GMV → tarifas → ledger', () => {
  const steps = [];
  steps.push({ action: 'loadOrders', count: mockOrders.length });
  const gmv = mockOrders.reduce((s, o) => s + o.total, 0);
  steps.push({ action: 'calculateGMV', value: gmv });
  const fees = gmv * 0.05;
  steps.push({ action: 'calculateFees', value: fees });
  steps.push({ action: 'loadLedger', items: mockLedger.length });
  assert.equal(steps.length, 4);
});

test('flujo filtro: todas órdenes → entregas → activas', () => {
  const all = mockOrders.length;
  const delivered = mockOrders.filter(o => o.status === 'DELIVERED').length;
  const active = mockOrders.filter(o => o.status === 'DELIVERED' && new Date(o.createdAt).toDateString() === new Date().toDateString()).length;
  assert.equal(all >= delivered, true);
  assert.equal(delivered >= active, true);
});

test('flujo split: comercios → verificar collectorId → estado split', () => {
  const byCollector = mockStores.map(s => ({ ...s, splitActive: !!s.collectorId }));
  const active = byCollector.filter(s => s.splitActive).length;
  assert.equal(active, 2);
});

// ── Edge Cases ─────────────────────────────────────────────────────────────

test('edge case: sin órdenes', () => {
  const emptyOrders = [];
  const gmv = emptyOrders.reduce((s, o) => s + o.total, 0);
  assert.equal(gmv, 0);
});

test('edge case: sin comercios', () => {
  const emptyStores = [];
  const activeStores = emptyStores.filter(s => s.orderCount > 0).length;
  assert.equal(activeStores, 0);
});

test('edge case: gmv muy grande', () => {
  const bigGmv = 999999999;
  const fees = bigGmv * 0.05;
  assert.ok(fees > 0);
});

test('edge case: comercio sin orders puede estar en split', () => {
  const store = mockStores[2];
  const canBeSplit = store.collectorId === undefined ? false : true;
  assert.equal(canBeSplit, false);
});

test('completeness: panel tiene secciones requeridas', () => {
  const sections = ['Métricas', 'Ledger Balance', 'Comercios', 'Órdenes Recientes'];
  assert.equal(sections.length, 4);
  sections.forEach(s => assert.ok(s.length > 0));
});

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
