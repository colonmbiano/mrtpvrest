/**
 * config.ts
 * Configuración del doble pantalla, persistida en localStorage. Apagada por
 * defecto. Al guardar se emite un CustomEvent para refrescar otras ventanas
 * del mismo origen (la pantalla de cliente escucha tanto este evento como el
 * evento nativo `storage`).
 */

export const DUAL_SCREEN_CONFIG_KEY = "mrtpvrest:dual-screen-config";
export const DUAL_SCREEN_CONFIG_EVENT = "dual-screen-config-change";

export type PromoSource = "local" | "remote";

export interface PromoSlide {
  id: string;
  source: PromoSource;
  title?: string;
  subtitle?: string;
  imageUrl?: string; // promos remotas: url de Cloudinary; locales: undefined (blob en IndexedDB)
  updatedAt?: string;
}

export interface DualScreenConfig {
  enabled: boolean;
  welcomeMessage: string;
  thankYouMessage: string;
  showLogo: boolean;
  logoUrl?: string;
  promosEnabled: boolean;
  promoIntervalSec: number;
  promos: PromoSlide[];
}

export const DEFAULT_DUAL_SCREEN_CONFIG: DualScreenConfig = {
  enabled: false,
  welcomeMessage: "¡Bienvenido!",
  thankYouMessage: "¡Gracias por su compra!",
  showLogo: true,
  logoUrl: undefined,
  promosEnabled: false,
  promoIntervalSec: 8,
  promos: [],
};

export function getDualScreenConfig(): DualScreenConfig {
  if (typeof window === "undefined") return { ...DEFAULT_DUAL_SCREEN_CONFIG };
  try {
    const raw = localStorage.getItem(DUAL_SCREEN_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_DUAL_SCREEN_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_DUAL_SCREEN_CONFIG,
      ...parsed,
      promos: Array.isArray(parsed?.promos) ? parsed.promos : [],
    };
  } catch {
    return { ...DEFAULT_DUAL_SCREEN_CONFIG };
  }
}

export function setDualScreenConfig(patch: Partial<DualScreenConfig>): DualScreenConfig {
  const current = getDualScreenConfig();
  const next: DualScreenConfig = { ...current, ...patch };
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DUAL_SCREEN_CONFIG_KEY, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(DUAL_SCREEN_CONFIG_EVENT));
    } catch {
      /* storage lleno o no disponible — ignorar */
    }
  }
  return next;
}

export function newPromoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `promo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Determina si una promo es local. `source !== "remote"` mantiene
 * compatibilidad con datos previos que no tuvieran el campo `source`.
 */
export function isLocal(p: PromoSlide): boolean {
  return p.source !== "remote";
}
