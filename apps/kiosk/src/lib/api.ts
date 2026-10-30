import axios, { type InternalAxiosRequestConfig } from "axios";

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
  // JWT del Device KIOSK (setup). El backend solo acepta `source: "KIOSK"`
  // con él; sin él, el pedido entra con las reglas de la tienda en línea.
  const jwt = localStorage.getItem("kiosk-device-jwt");
  if (rid) h["x-restaurant-id"] = rid;
  if (lid) h["x-location-id"]   = lid;
  if (tid) h["x-kiosk-terminal-id"] = tid;
  if (jwt) h["Authorization"] = `Bearer ${jwt}`;
  return h;
}

// Canjea el deviceToken permanente por un JWT nuevo (el JWT vence a los 30 días).
export async function refreshDeviceJwt(): Promise<string | null> {
  const deviceToken = localStorage.getItem("kiosk-device-token");
  if (!deviceToken) return null;
  const { data } = await axios.post(`${API_URL}/api/devices/auth`, { deviceToken });
  if (!data?.accessToken) return null;
  localStorage.setItem("kiosk-device-jwt", data.accessToken);
  return data.accessToken;
}

const api = axios.create({ baseURL: API_URL });
api.interceptors.request.use((config) => {
  config.headers = { ...config.headers, ...headers() } as any;
  return config;
});

// JWT vencido: se renueva una vez y se reintenta la misma petición (el backend
// responde 401 antes de crear nada, así que reintentar no duplica el pedido).
api.interceptors.response.use(undefined, async (error) => {
  const config = error?.config as (InternalAxiosRequestConfig & { _deviceRetry?: boolean }) | undefined;
  if (
    error?.response?.status !== 401 ||
    error.response.data?.code !== "KIOSK_DEVICE_TOKEN_INVALID" ||
    !config || config._deviceRetry
  ) {
    throw error;
  }
  config._deviceRetry = true;
  const jwt = await refreshDeviceJwt().catch(() => null);
  if (!jwt) throw error;
  return api(config);
});

export default api;
