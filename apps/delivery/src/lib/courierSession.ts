// Sesión del repartidor INDEPENDIENTE (red del marketplace), distinta del
// repartidor de tienda (que usa accessToken + x-restaurant-id). El APK es
// Capacitor (origen https://localhost, cross-site), así que NO puede usar la
// cookie same-site de identidad: autentica con un token Bearer de courier
// (POST /api/marketplace/identity/courier/token, ver backend marketplace-courier-identity).
//
// El ALTA se hace en la web (mrtpvrest.com/registro): /register exige Origin
// same-site + captcha, que el APK no puede cumplir. El APK solo inicia sesión.

import { getApiUrl } from "./config";

const TOKEN_KEY = "courierToken";
const EXP_KEY = "courierTokenExp"; // epoch ms
const MODE_KEY = "deliveryMode"; // 'store' | 'courier'

// Margen para no usar un token a punto de expirar (reloj/red).
const EXPIRY_SKEW_MS = 30_000;

export class CourierAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.name = "CourierAuthError";
    this.code = code;
    this.status = status;
  }
}

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function getDeliveryMode(): "store" | "courier" | null {
  const value = safe(() => localStorage.getItem(MODE_KEY), null);
  return value === "store" || value === "courier" ? value : null;
}

export function setDeliveryMode(mode: "store" | "courier"): void {
  safe(() => localStorage.setItem(MODE_KEY, mode), undefined);
}

export function getCourierToken(): string | null {
  const token = safe(() => localStorage.getItem(TOKEN_KEY), null);
  if (!token) return null;
  const exp = Number(safe(() => localStorage.getItem(EXP_KEY), null));
  if (Number.isFinite(exp) && exp > 0 && Date.now() >= exp - EXPIRY_SKEW_MS) return null;
  return token;
}

export function courierSessionActive(): boolean {
  return getCourierToken() !== null;
}

export function clearCourierSession(): void {
  safe(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXP_KEY);
    localStorage.removeItem(MODE_KEY);
  }, undefined);
}

export interface CourierProfile {
  courierId: string;
  name?: string | null;
  vehicleType?: string | null;
  verificationStatus: string; // 'PENDING_VERIFICATION' | 'VERIFIED' | ...
  status: string;             // 'ACTIVE' | 'SUSPENDED' | ...
  maxActiveTasks?: number;
}

/**
 * Perfil del courier en la red (id + estado de verificación). El APK lo necesita
 * para conocer su courierId y saber si ya está verificado para despachar.
 * Requiere sesión courier activa (Bearer). Lanza CourierAuthError.
 */
export async function getCourierProfile(): Promise<CourierProfile> {
  const token = getCourierToken();
  if (!token) throw new CourierAuthError("UNAUTHENTICATED", 401);
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/marketplace/v1/couriers/me/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new CourierAuthError("NETWORK", 0);
  }
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof (data as { courierId?: unknown }).courierId !== "string") {
    const code = (data as { errorCode?: string; error?: string }).errorCode
      || (data as { error?: string }).error || "PROFILE_FAILED";
    throw new CourierAuthError(String(code), res.status);
  }
  return data as CourierProfile;
}

function storeCourierSession(token: string, expiresInSeconds: unknown): void {
  const ttl = Number(expiresInSeconds);
  const expiresAt = Number.isFinite(ttl) && ttl > 0 ? Date.now() + ttl * 1000 : 0;
  safe(() => {
    localStorage.removeItem("accessToken");
    localStorage.setItem(TOKEN_KEY, token);
    if (expiresAt) localStorage.setItem(EXP_KEY, String(expiresAt)); else localStorage.removeItem(EXP_KEY);
    localStorage.setItem(MODE_KEY, "courier");
  }, undefined);
}

/**
 * Inicia sesión como repartidor independiente. Guarda el token Bearer de courier
 * y marca deliveryMode='courier'. Lanza CourierAuthError con el código del backend
 * (INVALID_CREDENTIALS 401, COURIER_PROFILE_REQUIRED 403, etc.).
 */
export async function courierLogin(email: string, password: string, termsAccepted = false): Promise<{ token: string; expiresIn: number }> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/marketplace/identity/courier/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, termsAccepted }),
    });
  } catch {
    throw new CourierAuthError("NETWORK", 0);
  }
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  if (!res.ok || typeof (data as { token?: unknown }).token !== "string") {
    const code = (data as { code?: string; error?: string }).code
      || (data as { error?: string }).error || "LOGIN_FAILED";
    throw new CourierAuthError(String(code), res.status);
  }
  const token = (data as { token: string }).token;
  const expiresIn = Number((data as { expiresIn?: unknown }).expiresIn) || 0;
  storeCourierSession(token, expiresIn);
  return { token, expiresIn };
}
