import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getApiUrl } from "./config";

// En el browser usamos paths relativos ("") para pasar por el rewrite de
// next.config.js (same-origin, sin CORS). En SSR/Node usamos la URL absoluta.
const baseURL = typeof window === "undefined" ? getApiUrl() : "";

const api = axios.create({ baseURL });

// ── Request interceptor: auth + tenant headers ─────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    const restaurantId = localStorage.getItem("restaurantId");
    const locationId = localStorage.getItem("locationId");

    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (restaurantId) config.headers["x-restaurant-id"] = restaurantId;
    if (locationId) config.headers["x-location-id"] = locationId;
  }
  return config;
});

// ── Retry para métodos seguros (5xx / 429 / red caída) ─────────────────────
type RetriableConfig = InternalAxiosRequestConfig & { __retryCount?: number };
const MAX_RETRIES = 3;
const SAFE_METHODS = new Set(["get", "head", "options"]);

function isRetryableError(error: AxiosError): boolean {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function backoffDelayMs(attempt: number, retryAfter: string | undefined): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 10_000);
  }
  const base = 300 * Math.pow(3, attempt);
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.min(base + jitter, 10_000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // 401 → limpiar sesión y mandar a login.
    if (error.response?.status === 401 && typeof window !== "undefined") {
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (!config || !config.method) return Promise.reject(error);
    const method = config.method.toLowerCase();
    if (!SAFE_METHODS.has(method)) return Promise.reject(error);
    if (!isRetryableError(error)) return Promise.reject(error);

    config.__retryCount = (config.__retryCount ?? 0) + 1;
    if (config.__retryCount > MAX_RETRIES) return Promise.reject(error);

    const retryAfter = error.response?.headers?.["retry-after"];
    await sleep(backoffDelayMs(config.__retryCount - 1, retryAfter));
    return api.request(config);
  },
);

export default api;
