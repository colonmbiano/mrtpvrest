/**
 * api.ts
 * Axios singleton para el TPV.
 * - Inyecta x-restaurant-id, x-location-id y Authorization en cada request.
 * - Token: prioriza sessionStorage (más seguro vs XSS) con fallback a localStorage.
 * - Interceptor 401: limpia solo credenciales de empleado, NUNCA el setup del dispositivo.
 */
import axios from "axios";
import { getApiUrl } from "@/lib/config";
import { getTenantIds } from "@/lib/tenant";
import { consumePendingOverride } from "@/lib/overrideTokens";
import { getToken, setToken, initTokenVault } from "@/lib/token-vault";

const api = axios.create();

// Hidratar el vault del token lo antes posible (api.ts se importa en todo el
// árbol). En APK con plugin esto migra el JWT legacy al Keystore.
if (typeof window !== "undefined") void initTokenVault();

// ── Request interceptor ────────────────────────────────────────────────
api.interceptors.request.use(async (config) => {
  config.baseURL = getApiUrl();

  if (typeof window !== "undefined") {
    // Llaves de tenant centralizadas en lib/tenant.ts: lee las canónicas
    // (restaurantId/locationId) con fallback a las legacy 'active...' para
    // dispositivos que aún no han rotado tras la migración.
    const { restaurantId, locationId } = getTenantIds();

    // Token vía token-vault: secure storage nativo en APK con plugin,
    // fallback legacy (sessionStorage/localStorage) en web y APKs viejos.
    const token = await getToken();

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
      console.warn("[api] Petición sin restaurantId →", url, "(revisa selección de workspace en el Hub)");
    }

    if (restaurantId) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId)   config.headers["x-location-id"]   = locationId;
    if (token)        config.headers["Authorization"]    = `Bearer ${token}`;

    // RBAC · override token de supervisor. Si hay uno pendiente (recién
    // emitido por verify-permission), lo adjuntamos a esta request mutante
    // y lo consumimos (one-shot). verify-permission no lo necesita.
    const method = String(config.method ?? "get").toLowerCase();
    const isMutating = ["post", "put", "patch", "delete"].includes(method);
    if (isMutating && !url.includes("/api/employees/verify-permission")) {
      const overrideToken = consumePendingOverride();
      if (overrideToken) config.headers["x-override-token"] = overrideToken;
    }
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
        // Limpiar credenciales de empleado (vault cubre secure storage +
        // llaves legacy; los removeItem directos quedan por los datos no-token)
        void setToken(null);
        sessionStorage.removeItem("tpv-employee");
        localStorage.removeItem("tpv-employee");
        localStorage.removeItem("kdsEmployee");
        // restaurantId y locationId NO se borran — son config del dispositivo
      }
    }
    return Promise.reject(error);
  }
);

export default api;

