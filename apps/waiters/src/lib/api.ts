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
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId   = localStorage.getItem("locationId");

    // Priorizar sessionStorage (más seguro), fallback a localStorage
    const token =
      sessionStorage.getItem("tpv-access-token") ||
      localStorage.getItem("accessToken") ||
      localStorage.getItem("tpv-employee-token");

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

