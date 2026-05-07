import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getApiUrl } from "./config";

// En el browser usamos paths relativos ("") para que pasen por el rewrite
// de next.config.js (same-origin, sin CORS). En SSR/Node seguimos usando la
// URL absoluta porque no hay proxy.
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

// ── Retry layer ────────────────────────────────────────────────────────────
// Reintenta automáticamente cuando el backend devuelve 5xx, 429 o cuando la
// red falla sin respuesta. Solo aplica a métodos seguros (GET/HEAD/OPTIONS)
// para no causar efectos duplicados en POST/PUT/DELETE.

type RetriableConfig = InternalAxiosRequestConfig & { __retryCount?: number };

const MAX_RETRIES = 3;
const SAFE_METHODS = new Set(["get", "head", "options"]);

function isRetryableError(error: AxiosError): boolean {
  // Error de red (sin response) — DNS, timeout, CORS preflight roto.
  if (!error.response) return true;
  const status = error.response.status;
  // 5xx servidor caído + 429 rate limit. 408 timeout también.
  return status === 408 || status === 429 || (status >= 500 && status < 600);
}

function backoffDelayMs(attempt: number, retryAfterHeader: string | undefined): number {
  // Si el server pide Retry-After (segundos), respetarlo.
  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, 10_000);
    }
  }
  // Exponencial: 300 · 3^n con jitter ±25%.
  const base = 300 * Math.pow(3, attempt);
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.min(base + jitter, 10_000);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    // 401 → logout y redirect (preservar comportamiento actual)
    if (error.response?.status === 401 && typeof window !== "undefined") {
      if (!window.location.pathname.includes("/login")) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("user");
        document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
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
    const delay = backoffDelayMs(config.__retryCount - 1, retryAfter);
    await sleep(delay);

    return api.request(config);
  }
);

export default api;
