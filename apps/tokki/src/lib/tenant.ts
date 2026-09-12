/**
 * tenant.ts — acceso centralizado a la identidad de tenant del TPV
 * (restaurante + sucursal) persistida en localStorage.
 *
 * Llaves canónicas (las que escribe el flujo actual y espera el interceptor
 * de `api.ts`):
 *   - `restaurantId`
 *   - `locationId`
 *   - `locationName`
 *
 * Llaves legacy (`activeRestaurantId` / `activeLocationId`): eran duplicados
 * exactos de las canónicas que el Hub escribía en paralelo. Ya NO se escriben;
 * los getters las leen solo como fallback para dispositivos que aún no han
 * vuelto a seleccionar workspace tras la migración. Se pueden eliminar por
 * completo una vez que toda la flota haya rotado.
 *
 * Nota: `activeWorkspaceId` / `activeWorkspaceName` NO son tenant — son el
 * flag de "workspace seleccionado" y su nombre para mostrar. Viven en el Hub.
 */

const RESTAURANT_KEY = "restaurantId";
const LOCATION_KEY = "locationId";
const LOCATION_NAME_KEY = "locationName";

// Legacy — solo lectura de fallback.
const LEGACY_RESTAURANT_KEY = "activeRestaurantId";
const LEGACY_LOCATION_KEY = "activeLocationId";

export function getRestaurantId(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(RESTAURANT_KEY) ||
    localStorage.getItem(LEGACY_RESTAURANT_KEY)
  );
}

export function getLocationId(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem(LOCATION_KEY) ||
    localStorage.getItem(LEGACY_LOCATION_KEY)
  );
}

export function getLocationName(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LOCATION_NAME_KEY);
}

export interface TenantIds {
  restaurantId: string | null;
  locationId: string | null;
}

export function getTenantIds(): TenantIds {
  return { restaurantId: getRestaurantId(), locationId: getLocationId() };
}

/**
 * Persiste la identidad de tenant canónica. Única vía de escritura: evita que
 * vuelvan a aparecer llaves paralelas. `locationName` es opcional porque hay
 * flujos (ej. selección de sucursal) que aún no conocen el nombre.
 */
export function setTenant(args: {
  restaurantId: string;
  locationId: string;
  locationName?: string;
}): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(RESTAURANT_KEY, args.restaurantId);
  localStorage.setItem(LOCATION_KEY, args.locationId);
  if (args.locationName !== undefined) {
    localStorage.setItem(LOCATION_NAME_KEY, args.locationName);
  }
}
