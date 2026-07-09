import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Alias legacy (no romper componentes existentes)
        background: "var(--bg)",
        foreground: "var(--tx)",
        surface: "var(--surf-1)",
        "surface-2": "var(--surf-2)",
        border: "var(--bd-1)",
        "border-2": "var(--bd-2)",
        muted: "var(--tx-mut)",
        "muted-2": "var(--tx-dim)",
        primary: "var(--brand-primary)",

        // Design System · MRTPVREST
        bg: "var(--bg)",
        surf: {
          DEFAULT: "var(--surf-1)",
          1: "var(--surf-1)",
          2: "var(--surf-2)",
          3: "var(--surf-3)",
        },
        bd: {
          1: "var(--bd-1)",
          2: "var(--bd-2)",
        },
        tx: {
          DEFAULT: "var(--tx)",
          hi: "var(--tx-hi)",
          mid: "var(--tx-mid)",
          mut: "var(--tx-mut)",
          dim: "var(--tx-dim)",
        },
        accent: {
          DEFAULT: "var(--brand-primary)",
          soft: "var(--accent-soft)",
          glow: "var(--accent-glow)",
          contrast: "var(--accent-contrast)",
        },
        // @deprecated — puente para páginas no migradas; borrar en cleanup final
        iris: {
          400: "var(--brand-secondary)",
          500: "var(--brand-primary)",
          600: "var(--brand-secondary)",
          soft: "var(--accent-soft)",
          glow: "var(--accent-glow)",
        },
        ok:   { DEFAULT: "var(--ok)",   soft: "var(--ok-soft)"   },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        err:  { DEFAULT: "var(--err)",  soft: "var(--err-soft)"  },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
        sb: {
          bg: "var(--sb-bg)",
          surf: "var(--sb-surf)",
          bd: "var(--sb-bd)",
          tx: "var(--sb-tx)",
          mut: "var(--sb-mut)",
          dim: "var(--sb-dim)",
        },
      },
      borderRadius: {
        "ds-sm": "var(--r-sm)",
        "ds-md": "var(--r-md)",
        "ds-lg": "var(--r-lg)",
        "ds-xl": "var(--r-xl)",
      },
      fontFamily: {
        sans:    ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        display: ["var(--font-syne)",    "Syne",    "sans-serif"],
        syne:    ["var(--font-syne)",    "Syne",    "sans-serif"],
        mono:    ["var(--font-dm-mono)", "DM Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-md)",
        "card-sm": "var(--shadow-sm)",
        "card-lg": "var(--shadow-lg)",
        glow: "0 4px 20px var(--accent-glow)",
        // @deprecated — puente; borrar en cleanup final
        iris: "0 4px 20px var(--accent-glow)",
      },
    },
  },
  plugins: [],
};
export default config;
