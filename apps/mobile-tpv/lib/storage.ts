import * as SecureStore from 'expo-secure-store';

/**
 * Keys used to persist auth + device-binding state in the Expo SecureStore.
 * Keep these names stable across releases — they are the only source of truth
 * for "is this device paired?" checks on app bootstrap.
 *
 * SecureStore keys must match /^[A-Za-z0-9._-]+$/.
 */
export const StorageKeys = {
  accessToken: 'mrtpv.accessToken',
  refreshToken: 'mrtpv.refreshToken',
  restaurantId: 'mrtpv.restaurantId',
  restaurantSlug: 'mrtpv.restaurantSlug',
  locationId: 'mrtpv.locationId',
} as const;

export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys];

export async function setItem(key: StorageKey, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function getItem(key: StorageKey): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function deleteItem(key: StorageKey): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}

/**
 * Snapshot of every auth-related value in storage. Useful during bootstrap
 * to decide where to route the user (Setup vs Pin).
 */
export async function getAuthSnapshot() {
  const [accessToken, refreshToken, restaurantId, restaurantSlug, locationId] =
    await Promise.all([
      getItem(StorageKeys.accessToken),
      getItem(StorageKeys.refreshToken),
      getItem(StorageKeys.restaurantId),
      getItem(StorageKeys.restaurantSlug),
      getItem(StorageKeys.locationId),
    ]);

  return { accessToken, refreshToken, restaurantId, restaurantSlug, locationId };
}

/**
 * Persist the post-login payload returned by /api/auth/login.
 */
export async function saveLoginPayload(payload: {
  accessToken: string;
  refreshToken: string;
  restaurantId: string;
  restaurantSlug: string;
}): Promise<void> {
  await Promise.all([
    setItem(StorageKeys.accessToken, payload.accessToken),
    setItem(StorageKeys.refreshToken, payload.refreshToken),
    setItem(StorageKeys.restaurantId, payload.restaurantId),
    setItem(StorageKeys.restaurantSlug, payload.restaurantSlug),
  ]);
}

export async function saveLocationId(locationId: string): Promise<void> {
  await setItem(StorageKeys.locationId, locationId);
}

/**
 * Wipe all device binding state. Used on logout or unpair.
 */
export async function clearAll(): Promise<void> {
  await Promise.all(
    Object.values(StorageKeys).map((k) => deleteItem(k as StorageKey)),
  );
}
