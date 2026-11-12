import { linkingApi } from '../api';
import { linkKdsDevice } from '../link-device';

afterEach(() => jest.restoreAllMocks());

test('la creación y el canje envían la tienda elegida, sin depender de la sesión anterior', async () => {
  const calls: Array<{ url?: string; restaurant: unknown; location: unknown; authorization: unknown }> = [];
  const adapter = jest.spyOn(linkingApi, 'post');
  adapter.mockImplementation(async (url, _body, options) => {
    const headers = options?.headers as Record<string, string>;
    calls.push({ url, restaurant: headers['x-restaurant-id'], location: headers['x-location-id'], authorization: headers.Authorization });
    if (!headers['x-restaurant-id']) throw new Error('Restaurante no identificado');
    return { data: url === '/api/devices/create' ? { deviceId: 'new-device', deviceToken: 'new-secret' }
      : { accessToken: 'new-access', restaurantId: 'new-store', locationId: 'new-location' } };
  });
  const result = await linkKdsDevice({ authToken: 'admin', restaurantId: 'new-store', locationId: 'new-location' });
  expect(calls).toEqual(['/api/devices/create', '/api/devices/auth'].map(url => ({
    url, restaurant: 'new-store', location: 'new-location', authorization: 'Bearer admin',
  })));
  expect(result.auth.accessToken).toBe('new-access');
  expect(adapter.mock.calls[1]?.[1]).toEqual({ deviceToken: 'new-secret' });
});

test('un fallo de canje no devuelve una vinculación incompleta', async () => {
  jest.spyOn(linkingApi, 'post').mockResolvedValueOnce({ data: { deviceId: 'd', deviceToken: 'secret' } })
    .mockRejectedValueOnce(new Error('Sin conexión'));
  await expect(linkKdsDevice({ authToken: 'admin', restaurantId: 'r', locationId: 'l' })).rejects.toThrow('Sin conexión');
});

test('rechaza un canje que pertenece a otra tienda', async () => {
  jest.spyOn(linkingApi, 'post').mockResolvedValueOnce({ data: { deviceId: 'd', deviceToken: 'secret' } })
    .mockResolvedValueOnce({ data: { accessToken: 'token', restaurantId: 'otro', locationId: 'l' } });
  await expect(linkKdsDevice({ authToken: 'admin', restaurantId: 'r', locationId: 'l' })).rejects.toThrow('no corresponde');
});
