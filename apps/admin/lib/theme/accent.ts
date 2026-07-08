/**
 * Derivación de la familia de acento por tenant.
 * A partir de un hex (localStorage['mb-accent'] o el verde default)
 * se calculan --brand-primary/secondary y --accent-soft/glow/contrast,
 * de modo que gradientes, glows y texto sobre el acento siempre
 * queden sincronizados con el color de marca del tenant.
 */

type Rgb = { r: number; g: number; b: number };

function hexToRgb(hex: string): Rgb | null {
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m || !m[1]) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Mezcla el color con negro (amt 0..1) para derivar el secundario. */
function darken(rgb: Rgb, amt: number): Rgb {
  return { r: rgb.r * (1 - amt), g: rgb.g * (1 - amt), b: rgb.b * (1 - amt) };
}

/** Luminancia relativa WCAG para decidir el color de texto sobre el acento. */
function luminance({ r, g, b }: Rgb): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export type AccentVars = Record<string, string>;

export function deriveAccent(hex: string, theme: "light" | "dark"): AccentVars | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { r, g, b } = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
  const softAlpha = theme === "dark" ? 0.16 : 0.1;
  const glowAlpha = theme === "dark" ? 0.34 : 0.22;
  return {
    "--brand-primary": rgbToHex(rgb),
    "--brand-secondary": rgbToHex(darken(rgb, 0.18)),
    "--accent-soft": `rgba(${r},${g},${b},${softAlpha})`,
    "--accent-glow": `rgba(${r},${g},${b},${glowAlpha})`,
    "--accent-contrast": luminance(rgb) > 0.45 ? "#0b1220" : "#ffffff",
  };
}

/** Aplica (o limpia, con hex=null) la familia de acento en <html>. */
export function applyAccent(hex: string | null) {
  const root = document.documentElement;
  const vars = ["--brand-primary", "--brand-secondary", "--accent-soft", "--accent-glow", "--accent-contrast"];
  if (!hex) {
    vars.forEach((v) => root.style.removeProperty(v));
    return;
  }
  const theme = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const derived = deriveAccent(hex, theme);
  if (!derived) return;
  Object.entries(derived).forEach(([k, v]) => root.style.setProperty(k, v));
}
