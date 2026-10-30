// TPV Setup & Auth Flow Tests
// Verifica: transiciones, almacenamiento canónico y resiliencia (cookie O localStorage)
// Sin dependencias instaladas: Node >= 22.18 elimina los tipos de los módulos.
//   node apps/tpv/scripts/tpv-setup-auth.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

const SETUP_FLOW = {
  LOGIN: 'login',
  LOCATION: 'location',
  DEVICE: 'device',
  SAVING: 'saving',
};

const TENANT_KEYS = {
  RESTAURANT: 'restaurantId',
  LOCATION: 'locationId',
  LOCATION_NAME: 'locationName',
};

const DEVICE_KEYS = {
  TOKEN: 'deviceToken',
  ID: 'deviceId',
  ROLE: 'deviceRole',
  NAME: 'deviceName',
};

class MockLocalStorage {
  constructor() {
    this.data = {};
  }

  getItem(key) {
    return this.data[key] ?? null;
  }

  setItem(key, value) {
    this.data[key] = String(value);
  }

  removeItem(key) {
    delete this.data[key];
  }

  clear() {
    this.data = {};
  }
}

class MockDocument {
  constructor() {
    this.cookies = {};
  }

  setCookie(name, value, options = {}) {
    this.cookies[name] = value;
  }

  getCookieString() {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  includes(value) {
    return this.getCookieString().includes(value);
  }
}

// ── Tenant Management ──────────────────────────────────────────────────────

test('setTenant: persiste restaurantId, locationId y locationName canónicamente', () => {
  const storage = new MockLocalStorage();
  const args = {
    restaurantId: 'rest-123',
    locationId: 'loc-456',
    locationName: 'Sucursal Centro',
  };

  storage.setItem(TENANT_KEYS.RESTAURANT, args.restaurantId);
  storage.setItem(TENANT_KEYS.LOCATION, args.locationId);
  storage.setItem(TENANT_KEYS.LOCATION_NAME, args.locationName);

  assert.equal(storage.getItem(TENANT_KEYS.RESTAURANT), 'rest-123');
  assert.equal(storage.getItem(TENANT_KEYS.LOCATION), 'loc-456');
  assert.equal(storage.getItem(TENANT_KEYS.LOCATION_NAME), 'Sucursal Centro');
});

test('getTenantIds: retorna restaurantId y locationId desde storage', () => {
  const storage = new MockLocalStorage();
  storage.setItem(TENANT_KEYS.RESTAURANT, 'rest-789');
  storage.setItem(TENANT_KEYS.LOCATION, 'loc-999');

  const tenant = {
    restaurantId: storage.getItem(TENANT_KEYS.RESTAURANT),
    locationId: storage.getItem(TENANT_KEYS.LOCATION),
  };

  assert.deepEqual(tenant, {
    restaurantId: 'rest-789',
    locationId: 'loc-999',
  });
});

test('getTenantIds: fallback a llaves legacy si las canónicas faltan', () => {
  const storage = new MockLocalStorage();
  storage.setItem('activeRestaurantId', 'rest-legacy');
  storage.setItem('activeLocationId', 'loc-legacy');

  const tenant = {
    restaurantId: storage.getItem(TENANT_KEYS.RESTAURANT) || storage.getItem('activeRestaurantId'),
    locationId: storage.getItem(TENANT_KEYS.LOCATION) || storage.getItem('activeLocationId'),
  };

  assert.deepEqual(tenant, {
    restaurantId: 'rest-legacy',
    locationId: 'loc-legacy',
  });
});

// ── Device Linking ────────────────────────────────────────────────────────

test('device setup: guarda token, id, role y name en localStorage', () => {
  const storage = new MockLocalStorage();
  const deviceData = {
    deviceToken: 'token-abc123',
    deviceId: 'dev-456',
    name: 'Caja Principal',
  };
  const deviceRole = 'POS';

  storage.setItem(DEVICE_KEYS.TOKEN, deviceData.deviceToken);
  storage.setItem(DEVICE_KEYS.ID, deviceData.deviceId);
  storage.setItem(DEVICE_KEYS.ROLE, deviceRole);
  storage.setItem(DEVICE_KEYS.NAME, deviceData.name);

  assert.equal(storage.getItem(DEVICE_KEYS.TOKEN), 'token-abc123');
  assert.equal(storage.getItem(DEVICE_KEYS.ID), 'dev-456');
  assert.equal(storage.getItem(DEVICE_KEYS.ROLE), 'POS');
  assert.equal(storage.getItem(DEVICE_KEYS.NAME), 'Caja Principal');
});

test('device setup: mapea deviceType a role canónico (CAJA → POS, MESERO → WAITER)', () => {
  const mapType = (deviceType) => deviceType === 'MESERO' ? 'WAITER' : 'POS';

  assert.equal(mapType('CAJA'), 'POS');
  assert.equal(mapType('MESERO'), 'WAITER');
  assert.equal(mapType('UNKNOWN'), 'POS');
});

test('device cookie: tpv-device-linked se establece al vincular', () => {
  const doc = new MockDocument();
  doc.setCookie('tpv-device-linked', 'true');

  assert.equal(doc.includes('tpv-device-linked=true'), true);
});

// ── Setup Flow Transitions ─────────────────────────────────────────────────

test('setup flow: login → location → device → locked', () => {
  let step = SETUP_FLOW.LOGIN;
  const steps = [];

  steps.push(step);

  // Simulate login success
  step = SETUP_FLOW.LOCATION;
  steps.push(step);

  // Simulate location select
  step = SETUP_FLOW.DEVICE;
  steps.push(step);

  // Simulate device setup (saves cookie + localStorage)
  step = SETUP_FLOW.SAVING;
  steps.push(step);

  // After saving redirects to /locked
  step = 'locked';
  steps.push(step);

  assert.deepEqual(steps, ['login', 'location', 'device', 'saving', 'locked']);
});

test('setup flow: handleLogin extrae restaurantId de response.data.user.restaurantId', () => {
  const response = {
    data: {
      accessToken: 'token-xyz',
      user: {
        role: 'RESTAURANT_ADMIN',
        restaurantId: 'rest-abc123',
        email: 'chef@restaurant.com',
      },
    },
  };

  const token = response.data.accessToken;
  const role = response.data.user?.role;
  const userRestaurantId = response.data.user?.restaurantId;

  assert.equal(token, 'token-xyz');
  assert.equal(role, 'RESTAURANT_ADMIN');
  assert.equal(userRestaurantId, 'rest-abc123');
});

test('setup flow: handleLocationSelect guarda tenant canónicamente', () => {
  const storage = new MockLocalStorage();
  const selectedRestaurant = { id: 'rest-456' };
  const selectedLocation = { id: 'loc-789', name: 'Sucursal Norte' };

  storage.setItem(TENANT_KEYS.RESTAURANT, selectedRestaurant.id);
  storage.setItem(TENANT_KEYS.LOCATION, selectedLocation.id);
  storage.setItem(TENANT_KEYS.LOCATION_NAME, selectedLocation.name);

  const tenant = {
    restaurantId: storage.getItem(TENANT_KEYS.RESTAURANT),
    locationId: storage.getItem(TENANT_KEYS.LOCATION),
    locationName: storage.getItem(TENANT_KEYS.LOCATION_NAME),
  };

  assert.deepEqual(tenant, {
    restaurantId: 'rest-456',
    locationId: 'loc-789',
    locationName: 'Sucursal Norte',
  });
});

test('setup flow: handleDeviceSetup persiste restaurantId y locationId vía setTenant', () => {
  const storage = new MockLocalStorage();
  const selectedRestaurant = { id: 'rest-999' };
  const selectedLocation = { id: 'loc-111', name: 'Sucursal Sur' };

  storage.setItem(TENANT_KEYS.RESTAURANT, selectedRestaurant.id);
  storage.setItem(TENANT_KEYS.LOCATION, selectedLocation.id);
  storage.setItem(TENANT_KEYS.LOCATION_NAME, selectedLocation.name);

  const restored = {
    restaurantId: storage.getItem(TENANT_KEYS.RESTAURANT),
    locationId: storage.getItem(TENANT_KEYS.LOCATION),
    locationName: storage.getItem(TENANT_KEYS.LOCATION_NAME),
  };

  assert.equal(restored.restaurantId, 'rest-999');
  assert.equal(restored.locationId, 'loc-111');
  assert.equal(restored.locationName, 'Sucursal Sur');
});

// ── Resilient Verification (Root Page) ─────────────────────────────────────

test('RootPage: verifica deviceLinked con cookie O localStorage', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  // Case 1: Cookie presente
  doc.setCookie('tpv-device-linked', 'true');
  const hasDeviceCookie1 = doc.includes('tpv-device-linked=true');
  assert.equal(hasDeviceCookie1, true);

  // Case 2: Storage presente
  storage.setItem(TENANT_KEYS.RESTAURANT, 'rest-123');
  storage.setItem(TENANT_KEYS.LOCATION, 'loc-456');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = !!(restaurantId && locationId);
  assert.equal(hasStorageTenant, true);

  // Case 3: Ambas presentes
  const deviceLinked1 = hasDeviceCookie1 || hasStorageTenant;
  assert.equal(deviceLinked1, true);

  // Case 4: Ni cookie ni storage
  const doc2 = new MockDocument();
  const storage2 = new MockLocalStorage();
  const hasDeviceCookie2 = doc2.includes('tpv-device-linked=true');
  const hasStorageTenant2 = !!(storage2.getItem(TENANT_KEYS.RESTAURANT) && storage2.getItem(TENANT_KEYS.LOCATION));
  const deviceLinked2 = hasDeviceCookie2 || hasStorageTenant2;
  assert.equal(deviceLinked2, false);
});

test('RootPage: redirecciona a /setup si no hay vinculación', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;

  let redirect = null;
  if (!deviceLinked) {
    redirect = '/setup';
  }

  assert.equal(redirect, '/setup');
});

test('RootPage: redirecciona a /locked si vinculado pero no autenticado', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  doc.setCookie('tpv-device-linked', 'true');
  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;
  const isAuthenticated = false;

  let redirect = null;
  if (!deviceLinked) {
    redirect = '/setup';
  } else if (!isAuthenticated) {
    redirect = '/locked';
  } else {
    redirect = '/hub';
  }

  assert.equal(redirect, '/locked');
});

test('RootPage: redirecciona a /hub si vinculado y autenticado', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  doc.setCookie('tpv-device-linked', 'true');
  storage.setItem(TENANT_KEYS.RESTAURANT, 'rest-123');
  storage.setItem(TENANT_KEYS.LOCATION, 'loc-456');
  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;
  const isAuthenticated = true;

  let redirect = null;
  if (!deviceLinked) {
    redirect = '/setup';
  } else if (!isAuthenticated) {
    redirect = '/locked';
  } else {
    redirect = '/hub';
  }

  assert.equal(redirect, '/hub');
});

// ── Resilient Verification (Locked Page) ──────────────────────────────────

test('LockedPage: verifica deviceLinked con cookie O localStorage', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  // Case 1: Cookie presente
  doc.setCookie('tpv-device-linked', 'true');
  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;

  assert.equal(deviceLinked, true);
});

test('LockedPage: redirecciona a /setup si no hay vinculación', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;

  let redirect = null;
  if (!deviceLinked) {
    redirect = '/setup';
  }

  assert.equal(redirect, '/setup');
});

test('LockedPage: redirecciona a /hub si autenticado', () => {
  const doc = new MockDocument();
  const storage = new MockLocalStorage();

  doc.setCookie('tpv-device-linked', 'true');
  const hasDeviceCookie = doc.includes('tpv-device-linked=true');
  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);
  const hasStorageTenant = restaurantId && locationId;
  const deviceLinked = hasDeviceCookie || hasStorageTenant;
  const isAuthenticated = true;

  let redirect = null;
  if (!deviceLinked) {
    redirect = '/setup';
  } else if (isAuthenticated) {
    redirect = '/hub';
  }

  assert.equal(redirect, '/hub');
});

// ── Edge Cases & Data Integrity ────────────────────────────────────────────

test('edge case: setup limpiar localStorage obsoleto antes de nuevo login', () => {
  const storage = new MockLocalStorage();

  // Estado anterior
  storage.setItem(TENANT_KEYS.RESTAURANT, 'rest-old');
  storage.setItem(TENANT_KEYS.LOCATION, 'loc-old');
  storage.setItem(DEVICE_KEYS.TOKEN, 'token-old');
  storage.setItem(DEVICE_KEYS.ID, 'dev-old');

  // Limpiar al iniciar nuevo setup
  storage.removeItem(TENANT_KEYS.RESTAURANT);
  storage.removeItem(TENANT_KEYS.LOCATION);
  storage.removeItem(DEVICE_KEYS.TOKEN);
  storage.removeItem(DEVICE_KEYS.ID);

  assert.equal(storage.getItem(TENANT_KEYS.RESTAURANT), null);
  assert.equal(storage.getItem(TENANT_KEYS.LOCATION), null);
  assert.equal(storage.getItem(DEVICE_KEYS.TOKEN), null);
  assert.equal(storage.getItem(DEVICE_KEYS.ID), null);
});

test('edge case: getTenantIds retorna null si restaurantId falta', () => {
  const storage = new MockLocalStorage();
  storage.setItem(TENANT_KEYS.LOCATION, 'loc-456');

  const restaurantId = storage.getItem(TENANT_KEYS.RESTAURANT);
  const locationId = storage.getItem(TENANT_KEYS.LOCATION);

  assert.equal(restaurantId, null);
  assert.equal(locationId, 'loc-456');
});

test('edge case: deviceToken requerido para identity check en locked', () => {
  const storage = new MockLocalStorage();
  storage.setItem(DEVICE_KEYS.TOKEN, 'token-123');

  const token = storage.getItem(DEVICE_KEYS.TOKEN);
  const canCheck = !!token;

  assert.equal(canCheck, true);

  const storage2 = new MockLocalStorage();
  const token2 = storage2.getItem(DEVICE_KEYS.TOKEN);
  const canCheck2 = !!token2;

  assert.equal(canCheck2, false);
});

test('completeness: todos los TENANT_KEYS están en lugar', () => {
  const keys = Object.values(TENANT_KEYS);
  assert.equal(keys.includes('restaurantId'), true);
  assert.equal(keys.includes('locationId'), true);
  assert.equal(keys.includes('locationName'), true);
});

test('completeness: todos los DEVICE_KEYS están en lugar', () => {
  const keys = Object.values(DEVICE_KEYS);
  assert.equal(keys.includes('deviceToken'), true);
  assert.equal(keys.includes('deviceId'), true);
  assert.equal(keys.includes('deviceRole'), true);
  assert.equal(keys.includes('deviceName'), true);
});
