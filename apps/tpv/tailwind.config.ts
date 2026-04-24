import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Alias legacy (no romper componentes existentes)
        background: "var(--bg)",
        foreground: "var(--tx)",

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
        iris: {
          200: "var(--iris-200)",
          300: "var(--iris-300)",
          400: "var(--iris-400)",
          500: "var(--iris-500)",
          600: "var(--iris-600)",
          soft: "var(--iris-soft)",
          glow: "var(--iris-glow)",
        },
        ok:   { DEFAULT: "var(--ok)",   soft: "var(--ok-soft)"   },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        err:  { DEFAULT: "var(--err)",  soft: "var(--err-soft)"  },
        info: { DEFAULT: "var(--info)", soft: "var(--info-soft)" },
      },
      fontFamily: {
        sans:    ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        display: ["var(--font-syne)",    "Syne",   "sans-serif"],
        syne:    ["var(--font-syne)",    "Syne",   "sans-serif"],
        mono:    ["var(--font-dm-mono)", "DM Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        iris: "0 4px 20px var(--iris-glow)",
      },
    },
  },
  safelist: [
    { pattern: /grid-cols-(3|4|5|6)/ },
    { pattern: /text-(xs|sm|base|lg)/ },
  ],
  plugins: [],
};
export default config;
