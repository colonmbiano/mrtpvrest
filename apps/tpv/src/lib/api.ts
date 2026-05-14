/**
 * api.ts
 * Axios singleton para el TPV.
 * - Inyecta x-restaurant-id, x-location-id y Authorization en cada request.
 * - Token: prioriza sessionStorage (más seguro vs XSS) con fallback a localStorage.
 * - Interceptor 401: limpia solo credenciales de empleado, NUNCA el setup del dispositivo.
 */
import axios from "axios";
import { getApiUrl } from "@/lib/config";

const api = axios.create();

// ── Request interceptor ────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();

  if (typeof window !== "undefined") {
    // BUG FIX: Sincronización robusta de headers.
    // Intentamos leer primero las llaves estándar (restaurantId).
    // Si no existen (ej: el usuario acaba de cambiar de sucursal en el Hub),
    // caemos a las llaves 'active...' para no perder el contexto.
    const restaurantId = localStorage.getItem("restaurantId") || localStorage.getItem("activeRestaurantId");
    const locationId   = localStorage.getItem("locationId")   || localStorage.getItem("activeLocationId");

    // Priorizar sessionStorage (más seguro), fallback a localStorage
    const token =
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("tpv-employee-token");

    // Tenant identification: si falta tenant en una llamada autenticada
    // (no /setup, no login público), avisar en consola para diagnosticar
    // rápido el origen del 400/403 sin romper la request.
    const url = String(config.url ?? "");
    const isTenantOptional =
      url.includes("/api/auth/login") ||
      url.includes("/api/employees/login") ||
      url.includes("/api/locations/") ||
      url.includes("/api/tpv/config") ||
      url.includes("/api/workspaces/me") ||
      (typeof window !== "undefined" && window.location.pathname.startsWith("/setup"));

    if (!restaurantId && !isTenantOptional) {
      console.warn("[api] Petición sin restaurantId →", url, "(revisa Hub / activeRestaurantId)");
    }

    if (restaurantId) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId)   config.headers["x-location-id"]   = locationId;
    if (token)        config.headers["Authorization"]    = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor ────────────────────────────────────────────────
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    if (typeof window !== "undefined" && error?.response?.status === 401) {
      const url = String(error?.config?.url ?? "");

      // No limpiar sesión si la propia petición de login falla
      const isLoginUrl =
        url.includes("/api/employees/login") ||
        url.includes("/api/auth/login");

      // No redirigir si estamos en setup o en rutas de configuración pública
      const isPublicRoute =
        window.location.pathname.startsWith("/setup") ||
        url.includes("/api/locations/") ||
        url.includes("/api/tpv/config");

      if (!isLoginUrl && !isPublicRoute) {
        // Limpiar credenciales de empleado
        sessionStorage.removeItem("tpv-access-token");
        sessionStorage.removeItem("tpv-employee");
        localStorage.removeItem("accessToken");
        localStorage.removeItem("tpv-employee-token");
        localStorage.removeItem("tpv-employee");
        localStorage.removeItem("kdsEmployee");
        // restaurantId y locationId NO se borran — son config del dispositivo
      }
    }
    return Promise.reject(error);
  }
);

export default api;

