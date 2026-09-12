import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          fg: "var(--brand-fg)",
        },
        surface: {
          1: "var(--surface-1)",
          2: "var(--surface-2)",
        }
      }
    },
  },
  plugins: [],
};
export default config;
