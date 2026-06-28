import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { getApiUrl } from "./config";
import { getRefreshToken, rotateRefreshToken, clearRefreshToken } from "./auth";

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

type RetriableConfig = InternalAxiosRequestConfig & {
  __retryCount?: number;
  __didRefresh?: boolean;
};

// ── Refresh de access token ────────────────────────────────────────────────
// El access token dura 15 min. En vez de botar al usuario al primer 401, lo
// renovamos con el refreshToken (válido 30 días) vía POST /api/auth/refresh,
// que rota ambos tokens. Un único refresh en vuelo a la vez: si varias
// peticiones reciben 401 al mismo tiempo, todas esperan la misma promesa.
let refreshPromise: Promise<string | null> | null = null;

function hardLogout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("accessToken");
  clearRefreshToken();
  localStorage.removeItem("user");
  document.cookie = "mb-role=; path=/; max-age=0; SameSite=Lax";
  if (!window.location.pathname.includes("/login")) {
    window.location.href = "/login";
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    // axios "crudo" (sin el instance `api`) para no recursar en este interceptor.
    const { data } = await axios.post(
      `${baseURL}/api/auth/refresh`,
      { refreshToken },
      { headers: { "Content-Type": "application/json" } }
    );
    if (!data?.accessToken) return null;
    localStorage.setItem("accessToken", data.accessToken);
    if (data.refreshToken) rotateRefreshToken(data.refreshToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

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

    // 401 → intentar renovar el access token una sola vez; si falla, logout.
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const reqConfig = config as RetriableConfig | undefined;
      const url = reqConfig?.url || "";
      // No intentar refrescar para el propio login/refresh ni si ya reintentamos.
      const isAuthEndpoint = url.includes("/auth/refresh") || url.includes("/auth/login");

      if (reqConfig && !reqConfig.__didRefresh && !isAuthEndpoint) {
        if (!refreshPromise) refreshPromise = refreshAccessToken();
        let newToken: string | null = null;
        try {
          newToken = await refreshPromise;
        } finally {
          refreshPromise = null;
        }

        if (newToken) {
          reqConfig.__didRefresh = true;
          reqConfig.headers = reqConfig.headers ?? {};
          reqConfig.headers.Authorization = `Bearer ${newToken}`;
          return api.request(reqConfig);
        }
      }

      hardLogout();
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
