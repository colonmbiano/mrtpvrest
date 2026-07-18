// Cliente HTTP de MRTPV Retail. Adjunta Authorization (JWT del empleado) + cabeceras de
// tenant en cada request, y normaliza errores (status + payload) para la UI.

import { getApiUrl } from "./config";
import { getTenant } from "./tenant";
import { getToken } from "./token-vault";

export interface ApiError extends Error {
  status?: number;
  data?: unknown;
}

interface ApiOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export async function apiFetch<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const base = getApiUrl();
  const { restaurantId, locationId } = getTenant();
  const headers: Record<string, string> = { ...(opts.headers || {}) };

  if (opts.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (restaurantId && !headers["x-restaurant-id"]) headers["x-restaurant-id"] = restaurantId;
  if (locationId && !headers["x-location-id"]) headers["x-location-id"] = locationId;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  let res: Response;
  try {
    res = await fetch(base + path, { ...opts, headers, signal: ctrl.signal });
  } catch (e) {
    const err: ApiError = new Error("No se pudo conectar con el servidor");
    err.status = 0;
    err.data = e instanceof Error ? e.message : String(e);
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) ||
      res.statusText ||
      "Error de red";
    const err: ApiError = new Error(String(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}
