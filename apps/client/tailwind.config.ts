import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { 
        accent: "var(--primary, #ff5c35)",
        brand: "var(--primary, #ff5c35)",
        surface: {
          0: "#ffffff",
          1: "#f8f9fa",
          2: "#f1f3f5",
          3: "#e9ecef",
        }
      },
      fontFamily: { 
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "sans-serif"],
      },
      borderRadius: {
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'premium': '0 20px 40px -10px rgba(0,0,0,0.05)',
      }
    },
  },
  plugins: [],
};

export default config;
