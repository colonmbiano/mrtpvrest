/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["DM Mono", "monospace"] },
      colors: {
        // Acento de MRTPV Retail: NARANJA (coincide con el logo). Antes era verde
        // (#3c7d5d…). Escala naranja de Tailwind. Los verdes de ÉXITO/stock viven
        // en otros tokens (--ok), no aquí, así que "disponible" sigue verde.
        brand: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412" },
        ink: { 900: "var(--ink-900)", 700: "var(--ink-700)", 500: "var(--ink-500)", 400: "var(--ink-400)" },
        line: "var(--line)",
        surf: "var(--app)",
        card: "var(--card)",
        titlebar: "var(--titlebar)",
      },
    },
  },
  plugins: [],
};
