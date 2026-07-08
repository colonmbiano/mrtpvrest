/**
 * Colores para chart.js leídos de los tokens CSS en runtime,
 * para que las gráficas respeten tema (light/dark) y acento del tenant.
 * Llamar dentro de useEffect/useMemo cliente (usa getComputedStyle).
 */

function cssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function chartColors() {
  return {
    accent: cssVar("--brand-primary", "#22c55e"),
    accentSoft: cssVar("--accent-soft", "rgba(34,197,94,.10)"),
    accentGlow: cssVar("--accent-glow", "rgba(34,197,94,.22)"),
    ok: cssVar("--ok", "#16a34a"),
    warn: cssVar("--warn", "#d97706"),
    err: cssVar("--err", "#dc2626"),
    info: cssVar("--info", "#2563eb"),
    text: cssVar("--tx", "#0f172a"),
    textMuted: cssVar("--tx-mut", "#64748b"),
    grid: cssVar("--bd-1", "#e2e8f0"),
    surface: cssVar("--surf-1", "#ffffff"),
  };
}

/** Serie categórica ordenada para gráficas multi-serie. */
export function chartSeries(): string[] {
  const c = chartColors();
  return [c.accent, c.info, c.warn, c.err, c.ok, c.textMuted];
}
