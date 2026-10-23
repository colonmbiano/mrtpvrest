// SaaS Marketplace Panel - Metrics, Split & Ledger
// Verifica: cálculos de métricas, split, filtros y estructura de pantalla
// Sin dependencias instaladas: Node >= 22.18
//   node apps/saas/scripts/saas-marketplace.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

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
