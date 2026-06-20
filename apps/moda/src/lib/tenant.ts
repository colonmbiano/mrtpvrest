// Identidad del tenant para MODA+ (restaurantId = cuenta retail, locationId = sucursal/caja).
// El JWT del empleado ya lleva ambos horneados, pero los persistimos para mandar
// x-restaurant-id / x-location-id en cada request (y para el login por PIN, que
// scope-a por sucursal vía x-location-id antes de tener token).

export interface Tenant {
  restaurantId: string | null;
  locationId: string | null;
}

export function getTenant(): Tenant {
  if (typeof window === "undefined") return { restaurantId: null, locationId: null };
  return {
    restaurantId: localStorage.getItem("moda-restaurant-id") || localStorage.getItem("restaurantId"),
    locationId: localStorage.getItem("moda-location-id") || localStorage.getItem("locationId"),
  };
}

export function setTenant(t: Partial<Tenant>): void {
  if (typeof window === "undefined") return;
  if (t.restaurantId) localStorage.setItem("moda-restaurant-id", t.restaurantId);
  if (t.locationId) localStorage.setItem("moda-location-id", t.locationId);
}

export function clearTenant(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("moda-restaurant-id");
  localStorage.removeItem("moda-location-id");
}

// Identificador estable de esta caja (para idempotencia / registro de dispositivo).
export function getDeviceKey(): string {
  if (typeof window === "undefined") return "moda-ssr";
  let key = localStorage.getItem("moda-device-key");
  if (!key) {
    const rnd = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    key = `moda-${rnd}`;
    localStorage.setItem("moda-device-key", key);
  }
  return key;
}
