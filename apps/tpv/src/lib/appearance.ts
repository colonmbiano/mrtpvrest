/**
 * Fuente única de verdad para los ajustes de apariencia del TPV que se
 * persisten en `localStorage`: tamaño de letra (`uiScale`) y ancho del
 * panel ticket (`sidebarWidth`).
 *
 * Antes esta lógica estaba triplicada (ConfigMenu del rail POS,
 * /admin/apariencia y ModalRoot), cada copia con su propio mapeo
 * small/medium/large → px. Peor: /admin/apariencia NO emitía el evento
 * `ui-scale-changed`, así que cambiar la letra desde el panel admin dejaba
 * el picker del rail desincronizado hasta recargar (el evento nativo
 * `storage` no se dispara en la misma pestaña). Centralizar aquí elimina la
 * duplicación y garantiza que TODA escritura emita el evento de sync.
 */

export type UiScale = "small" | "medium" | "large";
export type SidebarWidthPreset = "S" | "M" | "L";

// Claves localStorage (mantienen los nombres históricos para no romper
// preferencias ya guardadas en dispositivos en producción).
const UI_SCALE_KEY = "uiScale";
const SIDEBAR_WIDTH_KEY = "sidebarWidth";

// Eventos in-app para sincronizar pickers montados en la misma pestaña.
export const UI_SCALE_CHANGED_EVENT = "ui-scale-changed";
export const SIDEBAR_WIDTH_CHANGED_EVENT = "sidebar-width-changed";

// Defaults: tipografía compacta y panel medio out-of-the-box.
export const DEFAULT_UI_SCALE: UiScale = "small";
export const DEFAULT_SIDEBAR_PRESET: SidebarWidthPreset = "M";

export const UI_SCALE_PX: Record<UiScale, string> = {
  small: "13px",
  medium: "16px",
  large: "19px",
};

export const UI_SCALE_LABELS: Record<UiScale, { label: string; px: string }> = {
  small: { label: "Chico", px: "13px" },
  medium: { label: "Mediano", px: "16px" },
  large: { label: "Grande", px: "19px" },
};

export const SIDEBAR_WIDTH_LABELS: Record<
  SidebarWidthPreset,
  { label: string; px: number }
> = {
  S: { label: "Estrecho", px: 320 },
  M: { label: "Medio", px: 380 },
  L: { label: "Amplio", px: 440 },
};

// ── Tamaño de letra ─────────────────────────────────────────────────────────

export function readUiScale(): UiScale {
  if (typeof window === "undefined") return DEFAULT_UI_SCALE;
  const v = localStorage.getItem(UI_SCALE_KEY);
  return v === "medium" || v === "large" ? v : DEFAULT_UI_SCALE;
}

/** Aplica el tamaño al DOM (sistema externo, sin setState). */
export function applyUiScale(scale: UiScale): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.uiScale = scale;
  document.documentElement.style.fontSize = UI_SCALE_PX[scale];
}

/**
 * Persiste el tamaño, lo aplica al DOM y emite `ui-scale-changed` para que
 * cualquier picker montado (rail o admin) se sincronice sin recargar.
 */
export function setUiScale(scale: UiScale): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(UI_SCALE_KEY, scale);
    window.dispatchEvent(new Event(UI_SCALE_CHANGED_EVENT));
  }
  applyUiScale(scale);
}

// ── Ancho del panel ticket ──────────────────────────────────────────────────

export function readSidebarPreset(): SidebarWidthPreset {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_PRESET;
  const v = localStorage.getItem(SIDEBAR_WIDTH_KEY);
  return v === "S" || v === "L" ? v : DEFAULT_SIDEBAR_PRESET;
}

/** Píxeles del preset, útil para componentes que aplican el ancho real. */
export function sidebarPresetToPx(preset: SidebarWidthPreset): number {
  return SIDEBAR_WIDTH_LABELS[preset].px;
}

/**
 * Persiste el preset y emite `sidebar-width-changed` para que SidebarTicket
 * reajuste el ancho sin recargar.
 */
export function setSidebarPreset(preset: SidebarWidthPreset): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, preset);
    window.dispatchEvent(new Event(SIDEBAR_WIDTH_CHANGED_EVENT));
  }
}
