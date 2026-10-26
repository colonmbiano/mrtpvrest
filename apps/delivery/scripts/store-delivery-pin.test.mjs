// Código de entrega de pedidos propios en la app del repartidor.
//   node --test apps/delivery/scripts/store-delivery-pin.test.mjs   (Node >= 22.18)
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsStoreDeliveryPin, isDeliveryPinRejection, withDeliveryPin, isNetworkOrder, marketplaceCollection } from '../src/lib/storeDeliveryPin.ts';

const OWN = { id: 'o1', requiresDeliveryPin: true, source: 'ONLINE' };

test('solo pedidos propios que el servidor marca piden el código', () => {
  assert.equal(needsStoreDeliveryPin(OWN), true);
  assert.equal(needsStoreDeliveryPin({ ...OWN, requiresDeliveryPin: false }), false);
  assert.equal(needsStoreDeliveryPin({ ...OWN, requiresDeliveryPin: 'true' }), false);
  // Marketplace: PIN del despacho, no este.
  assert.equal(needsStoreDeliveryPin({ ...OWN, source: 'MARKETPLACE' }), false);
  assert.equal(needsStoreDeliveryPin({ ...OWN, taskId: 't1' }), false);
  assert.equal(needsStoreDeliveryPin(null), false);
});

test('el código viaja solo al entregar un pedido que lo requiere', () => {
  const data = { orderId: 'o1', status: 'DELIVERED', driverId: 'd1', paymentMethod: 'CASH' };
  assert.deepEqual(withDeliveryPin(data, OWN, 'DELIVERED', '123456'), { ...data, deliveryPin: '123456' });
  assert.deepEqual(withDeliveryPin(data, OWN, 'ON_THE_WAY', '123456'), data);
  assert.deepEqual(withDeliveryPin(data, { ...OWN, source: 'MARKETPLACE' }, 'DELIVERED', '123456'), data);
  assert.deepEqual(withDeliveryPin(data, OWN, 'DELIVERED', undefined), data);
});

test('rechazos del servidor que obligan a pedir el código otra vez', () => {
  for (const code of ['INVALID_DELIVERY_PIN', 'DELIVERY_PIN_REQUIRED', 'DELIVERY_PIN_LOCKED']) {
    assert.equal(isDeliveryPinRejection(code), true, code);
  }
  for (const code of ['SHIPPING_FEE_PENDING', 'ORDER_CONFLICT', undefined, 42]) {
    assert.equal(isDeliveryPinRejection(code), false, String(code));
  }
});

// Marketplace que entrega la tienda: el servidor lo marca deliveredByStore y siempre pide el código.
const BY_STORE = { id: 'o2', requiresDeliveryPin: true, source: 'MARKETPLACE', deliveredByStore: true, paymentStatus: 'PENDING' };

test('marketplace que entrega la tienda sigue el flujo propio con el código del cliente', () => {
  assert.equal(isNetworkOrder(BY_STORE), false);
  assert.equal(needsStoreDeliveryPin(BY_STORE), true);
  const data = { orderId: 'o2', status: 'DELIVERED', driverId: 'd1' };
  assert.deepEqual(withDeliveryPin(data, BY_STORE, 'DELIVERED', '654321'), { ...data, deliveryPin: '654321' });
  // La red: tarea del despacho, aunque el pedido diga deliveredByStore.
  assert.equal(isNetworkOrder({ source: 'MARKETPLACE' }), true);
  assert.equal(isNetworkOrder({ ...BY_STORE, taskId: 't1' }), true);
  assert.equal(isNetworkOrder({ ...BY_STORE, deliveredByStore: 'true' }), true);
  assert.equal(isNetworkOrder(OWN), false);
  assert.equal(isNetworkOrder(null), false);
});

test('cobro del marketplace que entrega la tienda: pagado en línea o solo efectivo', () => {
  assert.equal(marketplaceCollection(BY_STORE), 'CASH_ONLY');
  assert.equal(marketplaceCollection({ ...BY_STORE, paymentStatus: 'PAID' }), 'PREPAID');
  assert.equal(marketplaceCollection(OWN), null);
  assert.equal(marketplaceCollection({ source: 'MARKETPLACE', paymentStatus: 'PAID' }), null);
  assert.equal(marketplaceCollection(undefined), null);
});
