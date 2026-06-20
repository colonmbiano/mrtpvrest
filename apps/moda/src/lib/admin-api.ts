// Cliente HTTP del admin (dueño). Self-contained: usa el token/tenant del
// namespace admin (admin-auth) y NO el token-vault de la caja. Devuelve la forma
// axios `{ data }` y lanza errores con forma `{ response: { data, status } }`
// para reusar tal cual la pantalla de catálogo portada del admin web.

import { getApiUrl } from "./config";
import { ADMIN_KEYS } from "./admin-auth";

type Method = "GET" | "POST" | "PUT" | "DELETE";

interface AxiosLikeError {
  response?: { data?: unknown; status?: number };
  message: string;
}

async function request<T>(method: Method, path: string, data?: unknown): Promise<{ data: T }> {
  const base = getApiUrl();
  const headers: Record<string, string> = {};
  if (typeof window !== "undefined") {
    const token = localStorage.getItem(ADMIN_KEYS.token);
    const restaurantId = localStorage.getItem(ADMIN_KEYS.restaurantId);
    const locationId = localStorage.getItem(ADMIN_KEYS.locationId);
    if (token) headers["Authorization"] = `Bearer ${token}`;
    if (restaurantId) headers["x-restaurant-id"] = restaurantId;
    if (locationId) headers["x-location-id"] = locationId;
  }
  if (data !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
  } catch (e) {
    const err: AxiosLikeError = { response: { status: 0 }, message: "No se pudo conectar con el servidor" };
    void e;
    throw err;
  }

  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.includes("/admin/login")) {
      Object.values(ADMIN_KEYS).forEach((k) => localStorage.removeItem(k));
      window.location.href = "/admin/login";
    }
    const err: AxiosLikeError = {
      response: { data: payload, status: res.status },
      message: (payload as { error?: string })?.error || res.statusText || "Error de red",
    };
    throw err;
  }

  return { data: payload as T };
}

const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, data?: unknown) => request<T>("POST", path, data),
  put: <T = unknown>(path: string, data?: unknown) => request<T>("PUT", path, data),
  delete: <T = unknown>(path: string, data?: unknown) => request<T>("DELETE", path, data),
};

export default api;
