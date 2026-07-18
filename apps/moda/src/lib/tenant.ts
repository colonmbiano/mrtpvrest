// Identidad del tenant para MRTPV Retail (restaurantId = cuenta retail, locationId = sucursal/caja).
// El JWT del empleado ya lleva ambos horneados, pero los persistimos para mandar
// x-restaurant-id / x-location-id en cada request (y para el login por PIN, que
// scope-a por sucursal vía x-location-id antes de tener token).

import { DEFAULT_GIRO, isGiro, type Giro } from "./giro";

export interface Tenant {
  restaurantId: string | null;
  locationId: string | null;
  /** Giro del tenant (RestaurantConfig.retailGiro). Cachea la última respuesta
   *  de GET /api/retail/v1/catalog para que la UI no parpadee de ropa a
   *  ferretería en cada arranque. */
  giro: Giro;
}

export function getTenant(): Tenant {
  if (typeof window === "undefined") return { restaurantId: null, locationId: null, giro: DEFAULT_GIRO };
  return {
    restaurantId: localStorage.getItem("moda-restaurant-id") || localStorage.getItem("restaurantId"),
    locationId: localStorage.getItem("moda-location-id") || localStorage.getItem("locationId"),
    giro: getGiro(),
  };
}

export function setTenant(t: Partial<Tenant>): void {
  if (typeof window === "undefined") return;
  if (t.restaurantId) localStorage.setItem("moda-restaurant-id", t.restaurantId);
  if (t.locationId) localStorage.setItem("moda-location-id", t.locationId);
  if (t.giro) setGiro(t.giro);
}

export function clearTenant(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("moda-restaurant-id");
  localStorage.removeItem("moda-location-id");
  localStorage.removeItem("moda-giro");
}

// ── Giro ─────────────────────────────────────────────────────────────────────
// Fuente de verdad: RestaurantConfig.retailGiro, que llega en la respuesta del
// catálogo. Aquí solo se cachea. Un valor desconocido (tenant nuevo, rollback
// del backend, localStorage manipulado) cae al default ROPA en vez de romper.

export function getGiro(): Giro {
  if (typeof window === "undefined") return DEFAULT_GIRO;
  const raw = localStorage.getItem("moda-giro");
  return isGiro(raw) ? raw : DEFAULT_GIRO;
}

export function setGiro(g: Giro): void {
  if (typeof window === "undefined") return;
  if (isGiro(g)) localStorage.setItem("moda-giro", g);
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
