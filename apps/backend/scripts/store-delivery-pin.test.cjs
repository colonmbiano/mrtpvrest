'use strict';

// PIN de entrega de pedidos propios a domicilio (STORE_DELIVERY_PIN_MODE).
//   node --test apps/backend/scripts/store-delivery-pin.test.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
  storeDeliveryPinConfig, createStoreDeliveryPin, deriveStoreDeliveryPin, appliesTo,
} = require('../src/lib/store-delivery-pin');
const { createDeliveryIncidentsService } = require('../src/lib/delivery-incidents');

const SECRET = 'x'.repeat(40);
const ORDER = { id: 'o1', restaurantId: 'r1', orderType: 'DELIVERY', source: 'ONLINE', status: 'ON_THE_WAY' };
const pinOf = (order = ORDER) => deriveStoreDeliveryPin(order.id, SECRET);
const make = (mode, extra = {}) => createStoreDeliveryPin({ config: { mode, secret: SECRET, misconfigured: false }, ...extra });

// ── Configuración ────────────────────────────────────────────────────────────

test('config: off por defecto; modos válidos solo con secreto de 32+ bytes', () => {
  assert.equal(storeDeliveryPinConfig({}).mode, 'off');
  assert.deepEqual(storeDeliveryPinConfig({ STORE_DELIVERY_PIN_MODE: 'required', STORE_DELIVERY_PIN_SECRET: SECRET }),
    { mode: 'required', secret: SECRET, misconfigured: false });
  assert.equal(storeDeliveryPinConfig({ STORE_DELIVERY_PIN_MODE: ' Optional ', STORE_DELIVERY_PIN_SECRET: SECRET }).mode, 'optional');
  const short = storeDeliveryPinConfig({ STORE_DELIVERY_PIN_MODE: 'required', STORE_DELIVERY_PIN_SECRET: 'corto' });
  assert.equal(short.mode, 'off'); assert.equal(short.secret, null); assert.equal(short.misconfigured, true);
  assert.equal(storeDeliveryPinConfig({ STORE_DELIVERY_PIN_MODE: 'siempre', STORE_DELIVERY_PIN_SECRET: SECRET }).mode, 'off');
});

// ── Derivación ───────────────────────────────────────────────────────────────

test('derivación: 6 dígitos, estable por pedido y distinta entre pedidos', () => {
  const pin = pinOf();
  assert.match(pin, /^\d{6}$/);
  assert.equal(deriveStoreDeliveryPin('o1', SECRET), pin);
  const many = new Set(Array.from({ length: 200 }, (_, i) => deriveStoreDeliveryPin(`o${i}`, SECRET)));
  assert.ok(many.size > 190, 'los PIN se reparten entre pedidos');
});

test('derivación: espacio de nombres propio, nunca el del marketplace', () => {
  // Mismo cálculo que marketplace-orders.js (`marketplace:${orderId}:delivery`).
  const marketplace = String(crypto.createHmac('sha256', SECRET).update('marketplace:o1:delivery')
    .digest().readUInt32BE(0) % 1000000).padStart(6, '0');
  assert.notEqual(pinOf(), marketplace);
});

test('alcance: solo pedidos a domicilio que no son del marketplace', () => {
  assert.equal(appliesTo(ORDER), true);
  assert.equal(appliesTo({ ...ORDER, orderType: 'TAKEOUT' }), false);
  assert.equal(appliesTo({ ...ORDER, source: 'MARKETPLACE' }), false);
  assert.equal(appliesTo(null), false);
});

// ── Lo que ve el comprador ───────────────────────────────────────────────────

test('comprador: ve el PIN de su pedido activo; nunca en off, terminados u otros tipos', () => {
  const svc = make('optional');
  assert.equal(svc.pinForCustomer(ORDER), pinOf());
  assert.equal(svc.pinForCustomer({ ...ORDER, status: 'PENDING' }), pinOf());
  assert.equal(svc.pinForCustomer({ ...ORDER, status: 'DELIVERED' }), null);
  assert.equal(svc.pinForCustomer({ ...ORDER, status: 'CANCELLED' }), null);
  assert.equal(svc.pinForCustomer({ ...ORDER, source: 'MARKETPLACE' }), null);
  assert.equal(make('off').pinForCustomer(ORDER), null);
  assert.equal(make('off').requiresPin(ORDER), false);
  assert.equal(svc.requiresPin(ORDER), true);
});

// ── Verificación del repartidor ──────────────────────────────────────────────

test('repartidor: required exige PIN correcto; optional acepta app vieja sin PIN', () => {
  const required = make('required');
  assert.throws(() => required.assertCourierPin(ORDER, undefined), { code: 'DELIVERY_PIN_REQUIRED', statusCode: 409 });
  assert.throws(() => required.assertCourierPin(ORDER, '000000' === pinOf() ? '111111' : '000000'), { code: 'INVALID_DELIVERY_PIN', statusCode: 400 });
  assert.equal(required.assertCourierPin(ORDER, pinOf()), true);
  const optional = make('optional');
  assert.equal(optional.assertCourierPin(ORDER, undefined), true);
  assert.throws(() => optional.assertCourierPin(ORDER, '12'), { code: 'INVALID_DELIVERY_PIN' });
  assert.throws(() => optional.assertCourierPin(ORDER, 123456), { code: 'INVALID_DELIVERY_PIN' });
  assert.equal(make('off').assertCourierPin(ORDER, 'lo-que-sea'), true);
  assert.equal(required.assertCourierPin({ ...ORDER, source: 'MARKETPLACE' }, undefined), true);
});

test('repartidor: 10 fallos bloquean el pedido 15 min, incluso con el PIN correcto', () => {
  let clock = 0;
  const svc = make('required', { now: () => clock });
  const wrong = pinOf() === '000000' ? '111111' : '000000';
  for (let i = 0; i < 10; i++) assert.throws(() => svc.assertCourierPin(ORDER, wrong), { code: 'INVALID_DELIVERY_PIN' });
  assert.throws(() => svc.assertCourierPin(ORDER, pinOf()), { code: 'DELIVERY_PIN_LOCKED', statusCode: 429 });
  // Otro pedido no queda bloqueado.
  assert.equal(svc.assertCourierPin({ ...ORDER, id: 'o2' }, deriveStoreDeliveryPin('o2', SECRET)), true);
  clock += 15 * 60 * 1000 + 1;
  assert.equal(svc.assertCourierPin(ORDER, pinOf()), true);
});

// ── Integración con updateStatus (ruta que usa la app, en línea y sin conexión) ──

function setup(mode, orderOverrides = {}) {
  const state = {
    order: [{ ...ORDER, locationId: 'l1', deliveryDriverId: 'd1', deliveryFee: 10, notes: '', total: 110,
      orderNumber: 4, paymentMethod: 'CASH', paymentStatus: 'PENDING', cashCollected: false,
      restaurant: { tenantId: 't1' }, items: [], user: null, ...orderOverrides }],
    employee: [{ id: 'd1', role: 'DELIVERY', isActive: true, location: { restaurantId: 'r1' } }],
    deliveryEvidence: [], deliveryIncident: [], driverCashMovement: [], orderStatusHistory: [],
  };
  const match = (row, where = {}) => Object.entries(where).every(([key, value]) =>
    value && typeof value === 'object' ? row[key] && match(row[key], value) : row[key] === value);
  const project = (row, select) => (!row ? null : !select ? structuredClone(row)
    : Object.fromEntries(Object.entries(select).map(([k, v]) => [k, v === true ? structuredClone(row[k])
      : row[k] == null ? null : project(row[k], v.select)])));
  const client = {};
  for (const name of Object.keys(state)) {
    client[name] = {
      async findFirst(args) { return project(state[name].find(row => match(row, args.where)), args.select); },
      async create(args) { const row = { id: `${name}-${state[name].length + 1}`, ...args.data }; state[name].push(row); return row; },
      async updateMany(args) { let count = 0; for (const row of state[name]) if (match(row, args.where)) { Object.assign(row, args.data); count++; } return { count }; },
    };
  }
  client.$queryRaw = async (_strings, ...values) => state.order.filter(r => r.id === values[0] && r.restaurantId === values[1]).map(({ id }) => ({ id }));
  const prisma = { ...client, async $transaction(work) {
    const snapshot = structuredClone(state);
    try { return await work(client); } catch (error) { for (const n of Object.keys(state)) state[n] = snapshot[n]; throw error; }
  } };
  const service = createDeliveryIncidentsService({ now: () => new Date('2026-10-23T12:00:00Z'), logger: { warn() {} },
    storeDeliveryPin: make(mode) });
  const actor = { id: 'd1', role: 'DELIVERY', isActive: true, restaurantId: 'r1', tenantId: 't1', locationId: 'l1' };
  const status = (body, who = actor) => service.updateStatus({ orderId: 'o1', driverId: 'd1', body, actor: who, restaurantId: 'r1', prismaClient: prisma });
  return { state, status };
}

test('updateStatus: required rechaza sin PIN o con PIN incorrecto y no escribe nada', async () => {
  const { state, status } = setup('required');
  await assert.rejects(status({ status: 'DELIVERED', paymentMethod: 'CASH' }), { code: 'DELIVERY_PIN_REQUIRED', statusCode: 409 });
  await assert.rejects(status({ status: 'DELIVERED', paymentMethod: 'CASH', deliveryPin: '99999' }), { code: 'INVALID_DELIVERY_PIN', statusCode: 400 });
  assert.equal(state.order[0].status, 'ON_THE_WAY');
  assert.equal(state.orderStatusHistory.length, 0);
  assert.equal(state.driverCashMovement.length, 0);
});

test('updateStatus: con el PIN correcto entrega y registra el cobro', async () => {
  const { state, status } = setup('required');
  const { order, changed } = await status({ status: 'DELIVERED', paymentMethod: 'CASH', deliveryPin: pinOf() });
  assert.equal(changed, true);
  assert.equal(order.status, 'DELIVERED');
  assert.equal(state.driverCashMovement.length, 1);
});

test('updateStatus: el personal de la tienda conserva su override y ON_THE_WAY no pide PIN', async () => {
  const owner = { id: 'u1', role: 'OWNER', isActive: true, restaurantId: 'r1', tenantId: 't1' };
  const staff = setup('required');
  assert.equal((await staff.status({ status: 'DELIVERED', paymentMethod: 'CASH' }, owner)).order.status, 'DELIVERED');
  const courier = setup('required', { status: 'READY' });
  assert.equal((await courier.status({ status: 'ON_THE_WAY' })).order.status, 'ON_THE_WAY');
});

test('updateStatus: sin servicio de PIN o en off se conserva el flujo anterior', async () => {
  const { status } = setup('off');
  assert.equal((await status({ status: 'DELIVERED', paymentMethod: 'CASH' })).order.status, 'DELIVERED');
});
