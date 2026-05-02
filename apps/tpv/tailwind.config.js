import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary
        primary: "#FF8400",
        "primary-soft": "rgba(255, 132, 0, 0.15)",

        // Semantic
        success: "#88D66C",
        "success-soft": "rgba(136, 214, 108, 0.15)",
        danger: "#FF5C33",
        "danger-soft": "rgba(255, 92, 51, 0.15)",

        // Neutral
        background: "#0C0C0E",
        card: "#131316",
        foreground: "#FFFFFF",
        "foreground-secondary": "#B8B9B6",
        border: "#27272A",
        muted: "#2E2E2E",
      },
      fontFamily: {
        primary: ["JetBrains Mono", "monospace"],
        secondary: ["Geist", "sans-serif"],
      },
      borderRadius: {
        m: "16px",
        pill: "999px",
      },
      boxShadow: {
        glow: "0 4px 20px rgba(255, 132, 0, 0.4)",
        "glow-sm": "0 2px 8px rgba(255, 132, 0, 0.2)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
} satisfies Config

export default config
