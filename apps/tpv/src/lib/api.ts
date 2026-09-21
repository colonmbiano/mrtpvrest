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
import {
  isBackendCircuitOpen,
  markBackendAvailable,
  markBackendUnavailable,
} from "@/lib/backend-availability";

export const TPV_AUTH_REQUIRED_EVENT = "tpv-auth-required";
export const AUTH_TOKEN_MISSING = "AUTH_TOKEN_MISSING";
export const BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE";

const api = axios.create({
  // El primer fallo abre el circuito y las siguientes operaciones críticas
  // caen al outbox de inmediato. Este tope evita que una lectura aislada se
  // quede esperando indefinidamente antes de poder activar ese modo local.
  timeout: 15_000,
});

function isPublicRequest(url: string): boolean {
  return (
    url.includes("/api/employees/login") ||
    url.includes("/api/auth/login") ||
    url.includes("/api/devices/identity") ||
    url.includes("/api/tpv/config") ||
    url.includes("/health") ||
    (typeof window !== "undefined" &&
      window.location.pathname.startsWith("/setup") &&
      url.includes("/api/locations/"))
  );
}

function localRequestError(code: string, message: string, config: unknown) {
  return Object.assign(new Error(message), { code, config, isLocal: true });
}

export function requestOnlineAuthentication(reason = "token_missing"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(TPV_AUTH_REQUIRED_EVENT, { detail: { reason } }),
  );
}

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

    const url = String(config.url ?? "");
    // Escaneos IA y cargas de imágenes son operaciones largas. Mantienen su
    // propio margen sin alargar la espera de caja ante una caída del backend.
    if ((url.includes("/api/ai/") || url.includes("/api/upload/") ||
        (typeof FormData !== "undefined" && config.data instanceof FormData)) &&
        config.timeout === api.defaults.timeout) {
      config.timeout = 120_000;
    }
    const isPublic = isPublicRequest(url);
    const hasExplicitAuthorization = Boolean(
      config.headers.get("Authorization"),
    );

    if (!isPublic && isBackendCircuitOpen()) {
      return Promise.reject(
        localRequestError(
          BACKEND_UNAVAILABLE,
          "Servidor temporalmente no disponible; operación en modo local",
          config,
        ),
      );
    }

    // Token vía token-vault: secure storage nativo en APK con plugin,
    // fallback legacy (sessionStorage/localStorage) en web y APKs viejos.
    const token = await getToken();

    // Tenant identification: si falta tenant en una llamada autenticada
    // (no /setup, no login público), avisar en consola para diagnosticar
    // rápido el origen del 400/403 sin romper la request.
    const isTenantOptional =
      url.includes("/api/auth/login") ||
      url.includes("/api/employees/login") ||
      url.includes("/api/locations/") ||
      url.includes("/api/tpv/config") ||
      url.includes("/api/workspaces/me") ||
      (typeof window !== "undefined" && window.location.pathname.startsWith("/setup"));

    // Nunca mandar una petición protegida sin Bearer. Antes el adapter sí la
    // enviaba y un 401 limpiaba solo el vault, dejando la UI como autenticada:
    // ese era el bucle de `token_missing` observado en las tablets.
    if (!isPublic && !token && !hasExplicitAuthorization) {
      return Promise.reject(
        localRequestError(
          AUTH_TOKEN_MISSING,
          "Se requiere PIN para renovar la sesión online",
          config,
        ),
      );
    }

    if (!restaurantId && !isTenantOptional) {
      console.warn("[api] Petición sin restaurantId →", url, "(revisa selección de workspace en el Hub)");
    }

    if (restaurantId && !config.headers["x-restaurant-id"]) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId && !config.headers["x-location-id"])   config.headers["x-location-id"]   = locationId;
    if (token && !hasExplicitAuthorization) config.headers.set("Authorization", `Bearer ${token}`);

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
  (r) => {
    markBackendAvailable();
    return r;
  },
  async (error) => {
    const status = Number(error?.response?.status ?? 0);
    const isLocalFailure =
      error?.code === AUTH_TOKEN_MISSING ||
      error?.code === BACKEND_UNAVAILABLE;

    if (!isLocalFailure) {
      if (status > 0 && status < 500) markBackendAvailable();
      else if (status >= 500 || !error?.response) markBackendUnavailable();
    }

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
        url.includes("/api/devices/identity") ||
        url.includes("/api/tpv/config");

      if (!isLoginUrl && !isPublicRoute) {
        // Limpiar credenciales de empleado (vault cubre secure storage +
        // llaves legacy; los removeItem directos quedan por los datos no-token)
        await setToken(null);
        sessionStorage.removeItem("tpv-employee");
        localStorage.removeItem("tpv-employee");
        localStorage.removeItem("kdsEmployee");
        localStorage.removeItem("currentEmployeeId");
        localStorage.removeItem("currentEmployeeName");
        localStorage.removeItem("currentEmployeeRole");
        const secureParam = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `tpv-session-active=; path=/; max-age=0; SameSite=Lax${secureParam}`;
        document.cookie = `tpv-role=; path=/; max-age=0; SameSite=Lax${secureParam}`;
        requestOnlineAuthentication(
          String(error?.response?.data?.code ?? "unauthorized"),
        );
        // restaurantId y locationId NO se borran — son config del dispositivo
      }
    }
    return Promise.reject(error);
  }
);

export default api;

