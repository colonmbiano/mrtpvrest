'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { marketplaceDeliveryCoverage: coverage } = require('../src/lib/marketplace-delivery-coverage');
const origin = { originLat: 0, originLng: 0 };
const north = km => ({ lat: km / 6371 * 180 / Math.PI, lng: 0 });

test('five km cap applies to every tariff without rounding before the boundary', () => {
  for (const deliveryMode of ['FLAT', 'DISTANCE', 'ZONES']) {
    for (const deliveryMaxKm of [null, 10, 100]) {
      const rule = { ...origin, deliveryMode, deliveryMaxKm, freeDeliveryFrom: 0 };
      assert.equal(coverage(rule, north(4.9999)).error, null);
      assert.equal(coverage(rule, north(5.0001)).error, 'DELIVERY_OUT_OF_RANGE');
    }
  }
});
test('a smaller store radius including zero remains authoritative', () => {
  assert.equal(coverage({ ...origin, deliveryMaxKm: 2 }, north(2.01)).error, 'DELIVERY_OUT_OF_RANGE');
  assert.equal(coverage({ ...origin, deliveryMaxKm: 0 }, north(0.01)).error, 'DELIVERY_OUT_OF_RANGE');
});
test('missing or invalid coordinates fail closed', () => {
  for (const rule of [null, {}, { originLat: null, originLng: 0 }, { originLat: 91, originLng: 0 }]) {
    assert.equal(coverage(rule, north(1)).error, 'DELIVERY_UNAVAILABLE');
  }
  for (const destination of [null, {}, { lat: NaN, lng: 0 }, { lat: 0, lng: 181 }]) {
    assert.equal(coverage(origin, destination).error, 'ADDRESS_NOT_FOUND');
  }
});
