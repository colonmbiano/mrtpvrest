import axios from "axios";

// Copia aislada del marketplace (NEXT_PUBLIC_MARKETPLACE_ISOLATED=true, ver
// MARKETPLACE-STAGING.md): solo vale la API loopback horneada, nunca producción.
// Sin URL loopback válida se usa un destino bloqueado para que el fallo sea visible.
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

export const API_URL = isolatedApiUrl() ?? (process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com");

function headers() {
  if (typeof window === "undefined") return {};
  const h: Record<string, string> = {};
  const rid = localStorage.getItem("kiosk-restaurant-id");
  const lid = localStorage.getItem("kiosk-location-id");
  const tid = localStorage.getItem("kiosk-terminal-id");
  if (rid) h["x-restaurant-id"] = rid;
  if (lid) h["x-location-id"]   = lid;
  if (tid) h["x-kiosk-terminal-id"] = tid;
  return h;
}

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  config.headers = { ...config.headers, ...headers() } as any;
  return config;
});

export default api;
