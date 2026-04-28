import type { Palette } from "@/store/usePOSStore";

export type Location = {
  id: string;
  name: string;
  address: string | null;
};

export type Restaurant = {
  id: string;
  name: string;
  accentColor: string | null;
  locations: Location[];
};

export type Step = "login" | "pick" | "appearance" | "saving";

export const PALETTES: { id: Palette; label: string; color: string; sub: string }[] = [
  { id: "green",  label: "Verde Esmeralda", color: "#10b981", sub: "Energía · Frescura" },
  { id: "purple", label: "Morado Real",     color: "#7c3aed", sub: "Premium · Creativo"  },
  { id: "orange", label: "Naranja Brand",   color: "#ff5c35", sub: "Cálido · Dinámico"   },
];
