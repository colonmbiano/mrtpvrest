/**
 * catalogPrefsStore.ts
 * Preferencias de vista del catálogo POS. Persisten en localStorage por
 * dispositivo (Tab8 mesero puede usar densidad distinta a tablet principal cajero).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type CatalogViewMode = "drilldown" | "flat";
export type CatalogDensity = 3 | 4 | 6;

interface CatalogPrefsState {
  viewMode: CatalogViewMode;
  density: CatalogDensity;
  setViewMode: (mode: CatalogViewMode) => void;
  setDensity: (density: CatalogDensity) => void;
}

export const useCatalogPrefs = create<CatalogPrefsState>()(persist(
  (set) => ({
    viewMode: "drilldown",
    density: 4,
    setViewMode: (viewMode) => set({ viewMode }),
    setDensity: (density) => set({ density }),
  }),
  {
    name: "tpv-catalog-prefs",
    storage: createJSONStorage(() =>
      typeof window === "undefined" ? (undefined as any) : window.localStorage,
    ),
  },
));

// Clases Tailwind responsivas por densidad. Mobile siempre 2 cols mínimo;
// los breakpoints superiores crecen según preferencia.
export const densityGridClasses: Record<CatalogDensity, string> = {
  3: "grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4",
  6: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-6",
};
