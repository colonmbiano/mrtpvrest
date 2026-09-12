/** @jest-environment jsdom */

const { clearLinkedDeviceCookie, hasLinkedDevice } = require('../lib/device-link');

const link = {
  deviceId: 'device-1',
  locationId: 'location-1',
  restaurantId: 'restaurant-1',
};

beforeEach(() => {
  localStorage.clear();
  clearLinkedDeviceCookie();
});

test('restaura la marca aunque el token ya esté en el almacén seguro nativo', () => {
  Object.entries(link).forEach(([key, value]) => localStorage.setItem(key, value));

  expect(hasLinkedDevice()).toBe(true);
  expect(document.cookie).toContain('tpv-device-linked=true');
});

test('no considera vinculada una instalación incompleta', () => {
  localStorage.setItem('deviceId', link.deviceId);
  localStorage.setItem('restaurantId', link.restaurantId);

  expect(hasLinkedDevice()).toBe(false);
  expect(document.cookie).not.toContain('tpv-device-linked=true');
});
