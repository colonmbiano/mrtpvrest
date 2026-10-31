'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPin, confirmPickup, confirmDelivery, assertNetworkPin } = require('../src/lib/marketplace-dispatch');
const { createMultiStopEngine } = require('../src/lib/marketplace-multistop');

const NOW = new Date('2026-10-25T18:00:00Z');
const WINDOW = 15 * 60 * 1000;
const isLocked = error => error.code === 'DELIVERY_PIN_LOCKED' && error.statusCode === 429;
const task = () => ({ id: 't1', status: 'ASSIGNED', pickupPinHash: hashPin('123456'), deliveryPinHash: hashPin('654321') });

test('recogida: diez fallos bloquean incluso el PIN correcto y no cambian el estado', () => {
  const record = task();
  for (let n = 0; n < 10; n++) assert.throws(() => confirmPickup({ task: record, pickupPin: '000000', now: NOW }), { code: 'INVALID_PIN' });
  assert.equal(record.pinAttempts.pickup.failures, 10);
  assert.throws(() => confirmPickup({ task: record, pickupPin: '123456', now: NOW }), isLocked);
  assert.equal(record.status, 'ASSIGNED');
});

test('entrega: el PIN de recogida falla, el límite bloquea y expira exactamente a los 15 minutos', () => {
  const record = task();
  confirmPickup({ task: record, pickupPin: '123456', now: NOW });
  for (let n = 0; n < 10; n++) assert.throws(() => confirmDelivery({ task: record, deliveryPin: '123456', now: NOW }), { code: 'INVALID_PIN' });
  assert.throws(() => confirmDelivery({ task: record, deliveryPin: '654321', now: new Date(+NOW + WINDOW - 1) }), isLocked);
  confirmDelivery({ task: record, deliveryPin: '654321', now: new Date(+NOW + WINDOW) });
  assert.equal(record.status, 'DELIVERED');
  assert.equal(record.pinAttempts.delivery, undefined);
});

test('los contadores por etapa y por pedido son independientes', () => {
  const record = task();
  record.pinAttempts = { delivery: { failures: 9, windowStartedAt: NOW.toISOString() } };
  assert.throws(() => confirmPickup({ task: record, pickupPin: '000000', now: NOW }));
  confirmPickup({ task: record, pickupPin: '123456', now: NOW });
  assert.equal(record.pinAttempts.pickup, undefined);
  assert.equal(record.pinAttempts.delivery.failures, 9);
  const other = task();
  confirmPickup({ task: other, pickupPin: '123456', now: NOW });
  assert.equal(other.status, 'PICKED_UP');
});

test('el contador serializado sobrevive a reconstrucción y no contiene el código fallido', () => {
  let record = task();
  for (let n = 0; n < 10; n++) {
    assert.throws(() => confirmPickup({ task: record, pickupPin: '000000', now: NOW }));
    record = JSON.parse(JSON.stringify(record));
  }
  assert.throws(() => confirmPickup({ task: record, pickupPin: '123456', now: NOW }), isLocked);
  assert.equal(JSON.stringify(record.pinAttempts).includes('000000'), false);
});

test('PIN vacío, mal formado y no numérico también consumen intentos', () => {
  const record = task();
  for (const pin of ['', null, undefined, 123456, 'abc', '123', '1234567']) {
    assert.throws(() => confirmPickup({ task: record, pickupPin: pin, now: NOW }), { code: 'INVALID_PIN' });
  }
  assert.equal(record.pinAttempts.pickup.failures, 7);
});

test('ventana expirada inicia un contador nuevo; reloj atrasado no elimina bloqueo', () => {
  const record = task();
  record.pinAttempts = { pickup: { failures: 10, windowStartedAt: NOW.toISOString() } };
  assert.throws(() => confirmPickup({ task: record, pickupPin: '123456', now: new Date(+NOW - 1000) }), isLocked);
  assert.throws(() => confirmPickup({ task: record, pickupPin: '000000', now: new Date(+NOW + WINDOW) }));
  assert.equal(record.pinAttempts.pickup.failures, 1);
  assert.equal(record.pinAttempts.pickup.windowStartedAt, new Date(+NOW + WINDOW).toISOString());
});

test('reloj o contador inválido falla cerrado sin borrar evidencia', () => {
  const record = task();
  assert.throws(() => confirmPickup({ task: record, pickupPin: '123456', now: new Date('bad') }), { code: 'PIN_STATE_INVALID' });
  record.pinAttempts = { pickup: { failures: -1, windowStartedAt: NOW.toISOString() } };
  assert.throws(() => confirmPickup({ task: record, pickupPin: '123456', now: NOW }), { code: 'PIN_STATE_INVALID' });
  assert.equal(record.pinAttempts.pickup.failures, -1);
});

function multiFixture() {
  let date = NOW;
  const store = Object.fromEntries(['tasks', 'orders', 'couriers', 'merchants', 'offers', 'assignments'].map(k => [k, new Map()]));
  for (const id of ['a', 'b']) {
    store.tasks.set(id, { id, merchantId: id, restaurantId: id, locationId: id, orderId: id,
      status: 'OFFERING', dispatchMode: 'SHARED', version: 1, pickupLat: 19.19, pickupLng: -100.13,
      pickupPinHash: hashPin(id === 'a' ? '123456' : '234567') });
    store.merchants.set(id, { id, restaurantId: id, locationId: id, name: id, pickupAddress: id,
      allowMultistopShared: true, deliveryPolicy: 'SHARED_ONLY' });
    store.orders.set(id, { id, restaurantId: id, locationId: id, status: 'READY', checkoutGroupId: 'g1',
      customerId: 'c1', deliveryAddress: 'destino', groupDeliveryPinHash: hashPin('654321') });
  }
  store.couriers.set('d1', { id: 'd1', isActive: true, isShared: true, isOnline: true,
    presence: { lat: 19.19, lng: -100.13, acceptingShared: true, lastSeenAt: NOW.toISOString() } });
  const engine = createMultiStopEngine({ store, now: () => date });
  const created = engine.createTrip({ checkoutGroupId: 'g1', taskIds: ['a', 'b'], payoutAmount: 40 });
  let view = engine.accept({ offerId: created.offerId, courierId: 'd1' });
  return { store, engine, trip: () => engine.trips.get(view.id), view: () => view, advance: ms => { date = new Date(+date + ms); },
    pickup: (taskId, pickupPin) => view = engine.pickup({ tripId: view.id, taskId, courierId: 'd1', pickupPin, expectedVersion: view.version }),
    deliver: deliveryPin => view = engine.deliver({ tripId: view.id, courierId: 'd1', deliveryPin, expectedVersion: view.version }) };
}

test('multistop: cada recogida usa el contador persistible de su tarea', () => {
  const f = multiFixture();
  for (let n = 0; n < 10; n++) assert.throws(() => f.pickup('a', '000000'), { code: 'INVALID_PICKUP_PIN' });
  assert.throws(() => f.pickup('a', '123456'), isLocked);
  assert.equal(f.store.tasks.get('a').pinAttempts.pickup.failures, 10);
  assert.equal(f.store.tasks.get('b').pinAttempts, undefined);
  f.advance(WINDOW);
  f.pickup('a', '123456');
  f.pickup('b', '234567');
  assert.equal(f.view().pickedCount, 2);
});

test('multistop: PIN grupal separado, límite persistible y desbloqueo', () => {
  const f = multiFixture();
  f.pickup('a', '123456'); f.pickup('b', '234567');
  for (let n = 0; n < 10; n++) assert.throws(() => f.deliver('123456'), { code: 'INVALID_DELIVERY_PIN' });
  assert.throws(() => f.deliver('654321'), isLocked);
  assert.equal(f.trip().pinAttempts.delivery.failures, 10);
  const restored = JSON.parse(JSON.stringify(f.trip()));
  assert.throws(() => assertNetworkPin({ record: restored, kind: 'delivery', pin: '654321', expectedHash: restored.deliveryPinHash, now: NOW }), isLocked);
  f.advance(WINDOW); f.deliver('654321');
  assert.equal(f.view().status, 'DELIVERED');
});

test('multistop: respuestas públicas nunca contienen hashes ni contadores de PIN', () => {
  const f = multiFixture();
  assert.throws(() => f.pickup('a', '000000'));
  for (const result of [f.view(), f.engine.listAssigned('d1'), f.engine.offersFor('d1'), f.pickup('a', '123456')]) {
    assert.doesNotMatch(JSON.stringify(result), /PinHash|pinAttempts|windowStartedAt|123456|654321/);
  }
});
