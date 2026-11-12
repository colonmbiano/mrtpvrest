import { linkingApi } from './api';

interface LinkContext {
  authToken: string;
  restaurantId: string;
  locationId: string;
}

// Ambos pasos pasan por el resolvedor de restaurante del servidor, incluso
// el canje del deviceToken. No depender de la tienda guardada en la tablet.
export async function linkKdsDevice(context: LinkContext) {
  const { authToken, restaurantId, locationId } = context;
  const options = { headers: {
    Authorization: `Bearer ${authToken}`,
    'x-restaurant-id': restaurantId,
    'x-location-id': locationId,
  } };
  const { data: device } = await linkingApi.post<{ deviceId: string; deviceToken: string }>(
    '/api/devices/create', { restaurantId, locationId, deviceType: 'KDS' }, options);
  const { data: auth } = await linkingApi.post<{ accessToken: string; restaurantId: string; locationId: string }>(
    '/api/devices/auth', { deviceToken: device.deviceToken }, options);
  if (!auth.accessToken || auth.restaurantId !== restaurantId || auth.locationId !== locationId) {
    throw new Error('La vinculación no corresponde a la tienda y sucursal seleccionadas. Vuelve a intentarlo.');
  }
  return { device, auth };
}
