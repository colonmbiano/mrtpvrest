// ─────────────────────────────────────────────────────────────────────────────
// TPV runtime config
// Nivel 1 — URL del backend resolvible en caliente (sin rebuildear APK).
// Nivel 2 — Config remota por sucursal cacheada con TTL + refresh on-focus.
// ─────────────────────────────────────────────────────────────────────────────

export type OrderType = "DINE_IN" | "TAKEOUT" | "DELIVERY";

export interface TpvRemoteConfig {
  apiUrl:            string | null;
  allowedOrderTypes: OrderType[];
  lockTimeoutSec:    number;
  accentColor:       string | null;
  extra:             Record<string, unknown>;
  updatedAt:         string | null;
}

export const DEFAULT_API_URL = "https://api.mrtpvrest.com";
export const DEFAULT_CONFIG: TpvRemoteConfig = {
  apiUrl:            null,
  allowedOrderTypes: ["DINE_IN", "TAKEOUT", "DELIVERY"],
  lockTimeoutSec:    0,
  accentColor:       null,
  extra:             {},
  updatedAt:         null,
};

const LS_API_URL_OVERRIDE = "apiBaseUrl";       // fijo por el usuario en /setup
const LS_REMOTE_CONFIG    = "tpvRemoteConfig";  // JSON serializado
const LS_REMOTE_FETCHED   = "tpvRemoteConfigFetchedAt"; // epoch ms

export const REMOTE_CONFIG_TTL_MS = 5 * 60 * 1000;

// Eventos — el App layout los escucha para reaplicar UI al cambiar la config.
export const REMOTE_CONFIG_CHANGED = "tpv-remote-config-changed";

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

// ── API URL (Nivel 1) ────────────────────────────────────────────────────────

/**
 * Resolución en orden:
 *   1. Override manual guardado en /setup → localStorage.apiBaseUrl
 *   2. apiUrl servido por la config remota cacheada
 *   3. NEXT_PUBLIC_API_URL bakeado en el APK
 *   4. DEFAULT_API_URL (última red de seguridad)
 */
export function getApiUrl(): string {
  const baked = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  if (typeof window === "undefined") return baked;

  const override = safe(() => localStorage.getItem(LS_API_URL_OVERRIDE), null);
  if (override && override.trim()) return override.trim();

  const cached = getCachedRemoteConfig();
  if (cached?.apiUrl && cached.apiUrl.trim()) return cached.apiUrl.trim();

  return baked;
}

export function setApiUrlOverride(url: string | null): void {
  if (typeof window === "undefined") return;
  if (url && url.trim()) localStorage.setItem(LS_API_URL_OVERRIDE, url.trim());
  else localStorage.removeItem(LS_API_URL_OVERRIDE);
  window.dispatchEvent(new Event(REMOTE_CONFIG_CHANGED));
}

export function getApiUrlOverride(): string {
  if (typeof window === "undefined") return "";
  return safe(() => localStorage.getItem(LS_API_URL_OVERRIDE) || "", "");
}

// ── Remote config (Nivel 2) ──────────────────────────────────────────────────

export function getCachedRemoteConfig(): TpvRemoteConfig | null {
  if (typeof window === "undefined") return null;
  const raw = safe(() => localStorage.getItem(LS_REMOTE_CONFIG), null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TpvRemoteConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return null;
  }
}

export function getEffectiveConfig(): TpvRemoteConfig {
  return getCachedRemoteConfig() ?? DEFAULT_CONFIG;
}

export function setCachedRemoteConfig(cfg: TpvRemoteConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_REMOTE_CONFIG, JSON.stringify(cfg));
  localStorage.setItem(LS_REMOTE_FETCHED, String(Date.now()));
  window.dispatchEvent(new Event(REMOTE_CONFIG_CHANGED));
}

export function clearCachedRemoteConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_REMOTE_CONFIG);
  localStorage.removeItem(LS_REMOTE_FETCHED);
  window.dispatchEvent(new Event(REMOTE_CONFIG_CHANGED));
}

export function remoteConfigAgeMs(): number {
  if (typeof window === "undefined") return Infinity;
  const raw = safe(() => localStorage.getItem(LS_REMOTE_FETCHED), null);
  if (!raw) return Infinity;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return Infinity;
  return Date.now() - ts;
}

export function isRemoteConfigFresh(ttlMs = REMOTE_CONFIG_TTL_MS): boolean {
  return remoteConfigAgeMs() < ttlMs;
}

/**
 * Pide la config al backend usando la instancia de axios dada. Nunca tira:
 * si hay error de red, deja la cache como esté y devuelve null.
 * Llamar esto después del /setup (cuando ya hay x-restaurant-id + x-location-id).
 */
export async function fetchRemoteConfig(api: {
  get: (url: string) => Promise<{ data: unknown }>;
}): Promise<TpvRemoteConfig | null> {
  try {
    const { data } = await api.get("/api/tpv/config");
    const d = (data ?? {}) as Partial<TpvRemoteConfig>;
    const cfg: TpvRemoteConfig = {
      apiUrl:            typeof d.apiUrl === "string" ? d.apiUrl : null,
      allowedOrderTypes: Array.isArray(d.allowedOrderTypes) && d.allowedOrderTypes.length > 0
        ? (d.allowedOrderTypes as OrderType[])
        : DEFAULT_CONFIG.allowedOrderTypes,
      lockTimeoutSec:    Number.isFinite(d.lockTimeoutSec) ? Number(d.lockTimeoutSec) : 0,
      accentColor:       typeof d.accentColor === "string" ? d.accentColor : null,
      extra:             (d.extra && typeof d.extra === "object") ? (d.extra as Record<string, unknown>) : {},
      updatedAt:         typeof d.updatedAt === "string" ? d.updatedAt : null,
    };
    setCachedRemoteConfig(cfg);
    return cfg;
  } catch {
    return null;
  }
}

/**
 * Refetch si la cache pasó el TTL. Llamar en `focus` o en arranque.
 */
export async function maybeRefreshRemoteConfig(api: {
  get: (url: string) => Promise<{ data: unknown }>;
}): Promise<TpvRemoteConfig | null> {
  if (isRemoteConfigFresh()) return null;
  return fetchRemoteConfig(api);
}
