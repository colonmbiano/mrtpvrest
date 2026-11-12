import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios';
import api, { linkingApi } from '../api';

const saved = { accessToken: 'old-device-token', restaurantId: 'old-restaurant', locationId: 'old-location' };
let seen: InternalAxiosRequestConfig;
const adapter: AxiosAdapter = async config => {
  seen = config;
  return { config, status: 200, statusText: 'OK', headers: {}, data: {} };
};
beforeEach(() => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => saved[key as keyof typeof saved] || null,
  } });
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('vincular otra tienda no envía la sesión ni la sucursal anterior', async () => {
  await linkingApi.post('/api/auth/login', { email: 'admin@example.test', password: 'test' }, { adapter });
  expect(seen.headers.get('Authorization')).toBeUndefined();
  expect(seen.headers.get('x-restaurant-id')).toBeUndefined();
  expect(seen.headers.get('x-location-id')).toBeUndefined();
});
test('conserva las credenciales explícitas de la nueva tienda', async () => {
  await linkingApi.get('/api/admin/locations', { adapter, headers: {
    Authorization: 'Bearer new-admin-token', 'x-restaurant-id': 'new-restaurant',
  } });
  expect(seen.headers.get('Authorization')).toBe('Bearer new-admin-token');
  expect(seen.headers.get('x-restaurant-id')).toBe('new-restaurant');
  expect(seen.headers.get('x-location-id')).toBeUndefined();
});
test('la consulta normal de cocina conserva la sesión actual', async () => {
  await api.get('/api/kds/history', { adapter });
  expect(seen.headers.get('Authorization')).toBe('Bearer old-device-token');
  expect(seen.headers.get('x-restaurant-id')).toBe('old-restaurant');
  expect(seen.headers.get('x-location-id')).toBe('old-location');
});
