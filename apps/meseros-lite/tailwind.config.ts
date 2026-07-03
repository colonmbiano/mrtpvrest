import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/store/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface-1)",
        "surface-2": "var(--surface-2)",
        "surface-3": "var(--surface-3)",
        brand: "var(--brand)",
        "brand-fg": "var(--brand-fg)",
        success: "var(--success)",
        danger: "var(--danger)",
        warning: "var(--warning)",
        info: "var(--info)",
        cleaning: "var(--cleaning)",
        ready: "var(--ready)",
      },
      borderRadius: {
        soft: "var(--radius-md)",
        card: "var(--radius-lg)",
        panel: "var(--radius-xl)",
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        strong: "var(--shadow-strong)",
      },
      fontFamily: {
        sans: ["var(--font-onest)", "system-ui", "sans-serif"],
        display: ["var(--font-schibsted)", "system-ui", "sans-serif"],
        mono: ["var(--font-dm-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
