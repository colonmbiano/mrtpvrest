import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ["selector", '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        // Design Tokens (Handoff Montana)
        surf: {
          0: "var(--bg)",
          1: "var(--surface-1)",
          2: "var(--surface-2)",
          3: "var(--surface-3)",
          hover: "var(--surface-hover)",
        },
        tx: {
          pri: "var(--text-primary)",
          sec: "var(--text-secondary)",
          mut: "var(--text-muted)",
          dis: "var(--text-disabled)",
          main: "var(--text-primary)", // Added to match code usage
        },
        bd: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
          main: "var(--border)", // Added to match code usage
        },
        iris: {
          500: "var(--brand)",
          600: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          glow: "var(--brand-glow)",
          fg: "var(--brand-fg)",
        },

        // Semantic Status
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger:  { DEFAULT: "var(--danger)",  soft: "var(--danger-soft)"  },
        info:    { DEFAULT: "var(--info)",    soft: "var(--info-soft)"    },

        // Legacy compatibility aliases
        background: "var(--bg)",
        foreground: "var(--text-primary)",
        bgApp: "var(--bg)",
        accent: "var(--brand)", // Added for convenience
        err: "var(--danger)",   // Added for convenience
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
      },
      fontFamily: {
        sans:    ["var(--font-dm-sans)", "DM Sans", "system-ui", "sans-serif"],
        display: ["var(--font-syne)",    "Syne",   "sans-serif"],
        syne:    ["var(--font-syne)",    "Syne",   "sans-serif"],
        mono:    ["var(--font-dm-mono)", "DM Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        glow: "var(--shadow-glow)",
      },
    },
  },
  plugins: [],
};
export default config;
