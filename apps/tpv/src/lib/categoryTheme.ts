/**
 * categoryTheme.ts
 * Tonos semánticos y planos (flat) por familia de producto para el TPV.
 *
 * "Simplicidad Radical": fondos sólidos oscuros que respetan la marca
 * obsidiana, con un acento de alto contraste por familia para que el
 * cajero identifique el tipo de producto de un vistazo:
 *   - Bebidas               → azul frío
 *   - Comida (default)      → naranja/rojo cálido
 *   - Modificadores / extras → verde salvia
 *
 * Sin gradientes ni sombras: solo color sólido + acento.
 */

export type CategoryToneKey = "food" | "drink" | "modifier" | "neutral";

export interface CategoryTone {
  key: CategoryToneKey;
  /** Fondo sólido del tile (flat, sin degradado). */
  tile: string;
  /** Acento de alto contraste: precio, botón "+", franja, chip activo. */
  accent: string;
  /** Texto/iconos sobre el acento. */
  accentFg: string;
}

const TONES: Record<CategoryToneKey, CategoryTone> = {
  food: { key: "food", tile: "#1d1411", accent: "#ff8a3d", accentFg: "#0a0a0c" },
  drink: { key: "drink", tile: "#0f1822", accent: "#4d9fff", accentFg: "#0a0a0c" },
  modifier: { key: "modifier", tile: "#12181a", accent: "#88d66c", accentFg: "#0a0a0c" },
  neutral: { key: "neutral", tile: "#161619", accent: "#ffb84d", accentFg: "#0a0a0c" },
};

// Palabras clave para clasificar por nombre de categoría (sin acentos).
const DRINK_KW = [
  "bebida", "refresco", "cerveza", "cafe", "jugo", "agua", "coctel",
  "licor", "vino", "soda", "smoothie", "malteada", "frapp", "limonada",
  "michelada", "drink",
];
const MODIFIER_KW = [
  "modificador", "complement", "extra", "salsa", "aderezo", "topping",
  "guarni", "acompan", "adicion",
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Devuelve el tono semántico para una categoría. Sin coincidencia explícita
 * de bebida o modificador, se asume comida (acento cálido), que es el caso
 * dominante en un restaurante.
 */
export function categoryTone(category?: string | null): CategoryTone {
  if (!category) return TONES.neutral;
  const c = normalize(category);
  if (DRINK_KW.some((kw) => c.includes(kw))) return TONES.drink;
  if (MODIFIER_KW.some((kw) => c.includes(kw))) return TONES.modifier;
  return TONES.food;
}
