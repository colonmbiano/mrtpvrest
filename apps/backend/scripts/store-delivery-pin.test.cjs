'use strict';

// PIN de entrega de pedidos propios a domicilio (STORE_DELIVERY_PIN_MODE).
//   node --test apps/backend/scripts/store-delivery-pin.test.cjs
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
  storeDeliveryPinConfig, createStoreDeliveryPin, createMemoryPinAttempts, createPrismaPinAttempts, deriveStoreDeliveryPin,
  appliesTo, MAX_FAILURES, FAILURE_WINDOW_MS,
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

test('repartidor: required exige PIN correcto; optional acepta app vieja sin PIN', async () => {
  const required = make('required');
  await assert.rejects(required.assertCourierPin(ORDER, undefined), { code: 'DELIVERY_PIN_REQUIRED', statusCode: 409 });
  await assert.rejects(required.assertCourierPin(ORDER, '000000' === pinOf() ? '111111' : '000000'), { code: 'INVALID_DELIVERY_PIN', statusCode: 400 });
  assert.equal(await required.assertCourierPin(ORDER, pinOf()), true);
  const optional = make('optional');
  assert.equal(await optional.assertCourierPin(ORDER, undefined), true);
  await assert.rejects(optional.assertCourierPin(ORDER, '12'), { code: 'INVALID_DELIVERY_PIN' });
  await assert.rejects(optional.assertCourierPin(ORDER, 123456), { code: 'INVALID_DELIVERY_PIN' });
  assert.equal(await make('off').assertCourierPin(ORDER, 'lo-que-sea'), true);
  assert.equal(await required.assertCourierPin({ ...ORDER, source: 'MARKETPLACE' }, undefined), true);
});

test('repartidor: 10 fallos bloquean el pedido 15 min, incluso con el PIN correcto', async () => {
  let clock = 0;
  const svc = make('required', { now: () => clock });
  const wrong = pinOf() === '000000' ? '111111' : '000000';
  for (let i = 0; i < 10; i++) await assert.rejects(svc.assertCourierPin(ORDER, wrong), { code: 'INVALID_DELIVERY_PIN' });
  await assert.rejects(svc.assertCourierPin(ORDER, pinOf()), { code: 'DELIVERY_PIN_LOCKED', statusCode: 429 });
  // Otro pedido no queda bloqueado.
  assert.equal(await svc.assertCourierPin({ ...ORDER, id: 'o2' }, deriveStoreDeliveryPin('o2', SECRET)), true);
  clock += 15 * 60 * 1000 + 1;
  assert.equal(await svc.assertCourierPin(ORDER, pinOf()), true);
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

// ── Marketplace que entrega un repartidor propio (orden v1, tarea MANUAL) ─────

const { hashPin } = require('../src/lib/marketplace-dispatch');
const { storeDeliveredMarketplace, networkMarketplace, courierView } = require('../src/lib/marketplace-store-delivery');
const MARKETPLACE_PIN = '730415';
const byStore = (task = {}, extra = {}) => ({ ...ORDER, source: 'MARKETPLACE', marketplacePipeline: { restaurantId: 'r1',
  deliveryPinHash: hashPin(MARKETPLACE_PIN), dispatch: { task: { orderId: 'o1', restaurantId: 'r1', deliveryPolicy: 'MANUAL', ...task } } }, ...extra });

test('marketplace: solo la tarea MANUAL del mismo pedido y restaurante la entrega la tienda', () => {
  assert.equal(storeDeliveredMarketplace(byStore()), true);
  assert.equal(storeDeliveredMarketplace(byStore({ deliveryPolicy: 'SHARED_ONLY' })), false);
  assert.equal(storeDeliveredMarketplace(byStore({ orderId: 'otro' })), false);
  assert.equal(storeDeliveredMarketplace(byStore({ restaurantId: 'r2' })), false);
  assert.equal(storeDeliveredMarketplace(byStore({}, { orderType: 'TAKEOUT' })), false);
  assert.equal(storeDeliveredMarketplace({ ...byStore(), marketplacePipeline: null }), false);
  assert.equal(networkMarketplace(byStore({ deliveryPolicy: 'SHARED_ONLY' })), true);
  assert.equal(networkMarketplace(byStore()), false);
  assert.equal(networkMarketplace(ORDER), false);
});

test('marketplace: el PIN del comprador es obligatorio aun en off y comparte el freno de intentos', async () => {
  let clock = 0;
  const svc = make('off', { now: () => clock });
  const order = byStore();
  assert.equal(svc.requiresPin(order), true);
  assert.equal(svc.requiresPin(byStore({ deliveryPolicy: 'SHARED_ONLY' })), false);
  await assert.rejects(svc.assertCourierPin(order, undefined), { code: 'DELIVERY_PIN_REQUIRED', statusCode: 409 });
  await assert.rejects(svc.assertCourierPin(order, '12345'), { code: 'INVALID_DELIVERY_PIN' });
  // El PIN propio de la tienda no sirve para un pedido del marketplace.
  await assert.rejects(svc.assertCourierPin(order, pinOf()), { code: 'INVALID_DELIVERY_PIN' });
  assert.equal(await svc.assertCourierPin(order, MARKETPLACE_PIN), true);
  for (let i = 0; i < 10; i++) await assert.rejects(svc.assertCourierPin(order, '000000'), { code: 'INVALID_DELIVERY_PIN' });
  await assert.rejects(svc.assertCourierPin(order, MARKETPLACE_PIN), { code: 'DELIVERY_PIN_LOCKED' });
  clock += 15 * 60 * 1000 + 1;
  assert.equal(await svc.assertCourierPin(order, MARKETPLACE_PIN), true);
  // El comprador lo ve en su seguimiento del marketplace, no aquí.
  assert.equal(svc.pinForCustomer(order), null);
});

test('marketplace: la vista del repartidor quita el pipeline (hashes de PIN) y marca deliveredByStore', () => {
  const view = courierView(byStore());
  assert.equal(view.deliveredByStore, true);
  assert.equal('marketplacePipeline' in view, false);
  assert.equal(JSON.stringify(view).includes(hashPin(MARKETPLACE_PIN)), false);
  assert.deepEqual(courierView({ ...ORDER, marketplacePipeline: null }), ORDER);
});

// ── Freno compartido (G8): el backend lo guarda en PostgreSQL ────────────────

test('freno: dos instancias del backend con el mismo almacén comparten el bloqueo', async () => {
  let clock = 0;
  const attempts = createMemoryPinAttempts();
  const a = make('required', { now: () => clock, attempts });
  const b = make('required', { now: () => clock, attempts });
  const wrong = pinOf() === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) await assert.rejects(a.assertCourierPin(ORDER, wrong), { code: 'INVALID_DELIVERY_PIN' });
  for (let i = 0; i < 5; i++) await assert.rejects(b.assertCourierPin(ORDER, wrong), { code: 'INVALID_DELIVERY_PIN' });
  await assert.rejects(a.assertCourierPin(ORDER, pinOf()), { code: 'DELIVERY_PIN_LOCKED' });
  await assert.rejects(b.assertCourierPin(ORDER, pinOf()), { code: 'DELIVERY_PIN_LOCKED' });
  clock += FAILURE_WINDOW_MS + 1;
  assert.equal(await b.assertCourierPin(ORDER, pinOf()), true);
});

function fakePrismaAttempts(row = null) {
  const calls = [];
  return { calls, prisma: {
    deliveryPinAttempt: {
      async findFirst(args) { calls.push(['findFirst', args]); return row; },
      async deleteMany(args) { calls.push(['deleteMany', args]); return { count: 1 }; },
    },
    async $executeRaw(strings, ...values) { calls.push(['executeRaw', strings.join('?'), values]); return 1; },
  } };
}

test('freno en PostgreSQL: lectura acotada al comercio y al pedido, y regla de la ventana', async () => {
  const key = { restaurantId: 'r1', orderId: 'o1' };
  const at = 1_000_000_000_000;
  const full = fakePrismaAttempts({ failures: MAX_FAILURES, windowStart: new Date(at - 60_000) });
  assert.equal(await createPrismaPinAttempts(full).isLocked(key, at), true);
  assert.deepEqual(full.calls[0][1].where, { restaurantId: 'r1', orderId: 'o1' });
  // Ventana vencida o pocos fallos: no bloquea. Sin fila: no bloquea.
  assert.equal(await createPrismaPinAttempts(fakePrismaAttempts({ failures: MAX_FAILURES,
    windowStart: new Date(at - FAILURE_WINDOW_MS - 1) })).isLocked(key, at), false);
  assert.equal(await createPrismaPinAttempts(fakePrismaAttempts({ failures: MAX_FAILURES - 1,
    windowStart: new Date(at) })).isLocked(key, at), false);
  assert.equal(await createPrismaPinAttempts(fakePrismaAttempts(null)).isLocked(key, at), false);
});

test('freno en PostgreSQL: el fallo es un solo INSERT … ON CONFLICT y el acierto borra la fila del pedido', async () => {
  const f = fakePrismaAttempts();
  const store = createPrismaPinAttempts(f);
  const at = 1_000_000_000_000;
  await store.recordFailure({ restaurantId: 'r1', orderId: 'o1' }, at);
  const [, sql, values] = f.calls[0];
  assert.match(sql, /INSERT INTO "delivery_pin_attempts"/);
  assert.match(sql, /ON CONFLICT \("restaurantId", "orderId"\) DO UPDATE/);
  assert.deepEqual(values.slice(0, 2), ['r1', 'o1']);
  // Fechas: alta y updatedAt (ahora), dos comparaciones con el vencimiento y el nuevo inicio de ventana.
  assert.deepEqual(values.filter(v => v instanceof Date).map(d => d.getTime()).sort((x, y) => x - y),
    [at - FAILURE_WINDOW_MS, at - FAILURE_WINDOW_MS, at, at, at, at]);
  await store.clear({ restaurantId: 'r1', orderId: 'o1' });
  assert.deepEqual(f.calls[1], ['deleteMany', { where: { restaurantId: 'r1', orderId: 'o1' } }]);
});
