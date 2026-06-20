import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surf: {
          DEFAULT: "var(--surf-1)",
          1: "var(--surf-1)",
          2: "var(--surf-2)",
          3: "var(--surf-3)",
        },
        bd: { 1: "var(--bd-1)" },
        tx: {
          DEFAULT: "var(--tx-hi)",
          hi: "var(--tx-hi)",
          mut: "var(--tx-mut)",
          dim: "var(--tx-dim)",
        },
        brand: {
          DEFAULT: "var(--brand-primary)",
          primary: "var(--brand-primary)",
          soft: "var(--iris-soft)",
          glow: "var(--iris-glow)",
        },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        err: { DEFAULT: "var(--err)", soft: "var(--err-soft)" },
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "Syne", "sans-serif"],
        mono: ["var(--font-dm-mono)", "DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
