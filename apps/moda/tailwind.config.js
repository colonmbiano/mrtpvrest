/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["DM Mono", "monospace"] },
      colors: {
        brand: { 50: "#f1f7f3", 100: "#e3f0e8", 200: "#c7e0d2", 500: "#4f9070", 600: "#3c7d5d", 700: "#316449", 800: "#284f3a" },
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
