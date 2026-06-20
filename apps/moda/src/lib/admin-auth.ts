// Sesión del ADMIN (dueño) — namespace propio en localStorage para NO chocar con
// la sesión de caja (PIN) que vive en el token-vault. El dueño entra con
// email/contraseña en /admin; los cajeros siguen en / con PIN.

export const ADMIN_KEYS = {
  token: "moda-admin-token",
  user: "moda-admin-user",
  restaurantId: "moda-admin-restaurantId",
  locationId: "moda-admin-locationId",
  locationName: "moda-admin-locationName",
  restaurantName: "moda-admin-restaurantName",
} as const;

export interface AdminUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  restaurantId?: string | null;
}

export function getAdminUser(): AdminUser | null {
  if (typeof window === "undefined") return null;
  try {
    const u = localStorage.getItem(ADMIN_KEYS.user);
    return u ? (JSON.parse(u) as AdminUser) : null;
  } catch {
    return null;
  }
}

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_KEYS.token);
}

export function isAdminAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(localStorage.getItem(ADMIN_KEYS.token) && localStorage.getItem(ADMIN_KEYS.restaurantId));
}

export function getAdminLocationName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ADMIN_KEYS.locationName) || "";
}

export function adminLogout(): void {
  if (typeof window === "undefined") return;
  Object.values(ADMIN_KEYS).forEach((k) => localStorage.removeItem(k));
  window.location.href = "/admin/login";
}
