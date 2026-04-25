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

        // SPA Theme Variables
        bgApp: "var(--bg-app)",
        surf: {
          1: "var(--surf-1)",
          2: "var(--surf-2)",
          3: "var(--surf-3)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          glow: "var(--accent-glow)",
        },
        tx: {
          main: "var(--tx-main)",
          mut: "var(--tx-mut)",
          dim: "var(--tx-dim)",
        },
        bd: {
          main: "var(--bd-main)",
        },
        ok: "var(--ok)",
        warn: "var(--warn)",
        err: "var(--err)",
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
