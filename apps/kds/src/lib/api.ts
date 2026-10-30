// Axios singleton para el KDS app independiente.
// Inyecta accessToken (JWT del Device o User) + headers de tenant.
import axios from "axios";

const DEFAULT_API_URL = "https://api.mrtpvrest.com";

// https siempre; http solo hacia hosts privados/dev (backend local). El APK
// release además bloquea cleartext a nivel manifest.
function isSafeApiUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    if (u.protocol !== "http:") return false;
    const h = u.hostname;
    return (
      h === "localhost" || h === "127.0.0.1" || h === "10.0.2.2" ||
      h.endsWith(".local") || /^10\./.test(h) || /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  } catch {
    return false;
  }
}

// Copia aislada del marketplace (NEXT_PUBLIC_MARKETPLACE_ISOLATED=true, ver
// MARKETPLACE-STAGING.md): solo vale la API loopback horneada; se ignoran el
// override de /setup y DEFAULT_API_URL. Sin URL loopback válida, destino bloqueado.
export const BLOCKED_API_URL = "http://127.0.0.1:9";

export function isolatedApiUrl(): string | null {
  if (process.env.NEXT_PUBLIC_MARKETPLACE_ISOLATED !== "true") return null;
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL || "");
    const loopback = u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
    return loopback && (u.protocol === "http:" || u.protocol === "https:") ? u.origin : BLOCKED_API_URL;
  } catch {
    return BLOCKED_API_URL;
  }
}

export function getApiUrl(): string {
  const isolated = isolatedApiUrl();
  if (isolated) return isolated;
  // Override manual via /setup → localStorage.apiBaseUrl
  if (typeof window !== "undefined") {
    const o = localStorage.getItem("apiBaseUrl");
    if (o && o.trim() && isSafeApiUrl(o.trim())) return o.trim();
  }
  return process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
}

const api = axios.create();

api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
    if (restaurantId) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId) config.headers["x-location-id"] = locationId;
  }
  return config;
});

export default api;
