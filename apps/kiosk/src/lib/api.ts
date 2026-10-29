import axios, { type InternalAxiosRequestConfig } from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.mrtpvrest.com";

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
