// Código de entrega de pedidos propios en la app del repartidor.
//   node --test apps/delivery/scripts/store-delivery-pin.test.mjs   (Node >= 22.18)
import test from 'node:test';
import assert from 'node:assert/strict';
import { needsStoreDeliveryPin, isDeliveryPinRejection, withDeliveryPin } from '../src/lib/storeDeliveryPin.ts';

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
