/**
 * overrideTokens.ts — Puente entre la autorización de supervisor (override)
 * y el enforcement RBAC del backend.
 *
 * Cuando un supervisor autoriza una acción vía ManagerOverrideModal, el
 * backend (POST /api/employees/verify-permission) devuelve un override token
 * (JWT corto). Lo guardamos aquí como "pendiente" y el interceptor de `api`
 * lo adjunta como header `x-override-token` en la SIGUIENTE request mutante
 * (la acción que se está reintentando), consumiéndolo de inmediato (one-shot).
 *
 * Es one-shot a propósito: un override autoriza una acción puntual, no una
 * sesión. Si expira (TTL del JWT) el backend simplemente lo rechaza.
 */

interface PendingOverride {
  token: string;
  permission: string;
  exp: number; // epoch ms
}

let pending: PendingOverride | null = null;

/** Guarda el token recién emitido para adjuntarlo a la próxima acción. */
export function setPendingOverride(
  permission: string,
  token: string,
  ttlMs = 15 * 60 * 1000,
) {
  pending = { token, permission, exp: Date.now() + ttlMs };
}

/** Devuelve y descarta el token pendiente si sigue vigente. */
export function consumePendingOverride(): string | null {
  if (!pending) return null;
  if (Date.now() > pending.exp) {
    pending = null;
    return null;
  }
  const { token } = pending;
  pending = null;
  return token;
}

/** Limpia cualquier override pendiente (ej. al cancelar el flujo). */
export function clearPendingOverride() {
  pending = null;
}
