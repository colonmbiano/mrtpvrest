/**
 * themeStore.ts
 * Store dedicado exclusivamente al tema visual del TPV.
 * Separado del auth y carrito para reducir re-renders en componentes de UI.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Palette = "orange" | "green" | "purple" | "amber";
export type Mode = "dark" | "light";

// Legacy theme-id → { palette, mode }
const LEGACY_THEME_MAP: Record<string, { palette: Palette; mode: Mode }> = {
  dark:        { palette: "orange", mode: "dark"  },
  light:       { palette: "orange", mode: "light" },
  green:       { palette: "green",  mode: "dark"  },
  purple:      { palette: "purple", mode: "dark"  },
  amber:       { palette: "amber",  mode: "dark"  },
  orange:      { palette: "orange", mode: "dark"  },
  "concepto-1":{ palette: "orange", mode: "dark"  },
  "concepto-2":{ palette: "purple", mode: "dark"  },
  "concepto-3":{ palette: "orange", mode: "light" },
  naranja:     { palette: "orange", mode: "light" },
  amarillo:    { palette: "amber",  mode: "light" },
};

const applyDocAttrs = (palette: Palette, mode: Mode) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", palette);
  document.documentElement.setAttribute("data-mode", mode);
};

// Migra paletas obsoletas guardadas en localStorage. Cualquier valor que ya
// no exista en el tipo Palette colapsa a "orange" — la paleta por defecto.
const normalizePalette = (p: unknown): Palette => {
  if (p === "orange" || p === "green" || p === "purple" || p === "amber") return p;
  return "orange";
};

interface ThemeState {
  palette: Palette;
  mode: Mode;
  themeChosen: boolean;
  /** Legacy shim: id de tema anterior */
  theme: string;

  setPalette: (p: Palette) => void;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  setThemeChosen: (chosen: boolean) => void;
  /** Legacy: recibe id string y lo mapea a palette+mode */
  setTheme: (theme: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      palette: "orange",
      mode: "dark",
      themeChosen: false,
      theme: "orange",

      setPalette: (palette) => {
        set({ palette, theme: palette });
        applyDocAttrs(palette, get().mode);
      },

      setMode: (mode) => {
        set({ mode });
        applyDocAttrs(get().palette, mode);
      },

      toggleMode: () => {
        const next: Mode = get().mode === "dark" ? "light" : "dark";
        set({ mode: next });
        applyDocAttrs(get().palette, next);
      },

      setThemeChosen: (chosen) => set({ themeChosen: chosen }),

      setTheme: (theme) => {
        const target = LEGACY_THEME_MAP[theme] ?? {
          palette: "orange" as Palette,
          mode: "dark" as Mode,
        };
        set({ palette: target.palette, mode: target.mode, theme });
        applyDocAttrs(target.palette, target.mode);
      },
    }),
    {
      name: "tpv-theme",
      // v1: el default pasó de verde a naranja. Los equipos con el verde
      // guardado (era el default; la app no distingue si se eligió) pasan
      // al naranja; quien lo quiera puede volver a elegirlo en Apariencia.
      version: 1,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ThemeState>;
        if (version < 1 && state.palette === "green") {
          return { ...state, palette: "orange", theme: "orange" } as ThemeState;
        }
        return state as ThemeState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Migra valores obsoletos persistidos por versiones previas y
        // re-aplica los attrs al <html>. Sin esto, un cajero con "orange"
        // viejo en localStorage quedaba con un data-theme inválido.
        const safePalette = normalizePalette(state.palette);
        if (safePalette !== state.palette) state.palette = safePalette;
        applyDocAttrs(safePalette, state.mode);
      },
    }
  )
);
