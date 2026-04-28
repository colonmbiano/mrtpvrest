import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { 
        primary: 'var(--color-primary, #ff5c35)',
        'primary-light': 'color-mix(in srgb, var(--color-primary, #ff5c35) 20%, white)',
        accent: "var(--color-primary, #ff5c35)",
        brand: "var(--color-primary, #ff5c35)",
        surface: {
          0: "#ffffff",
          1: "#f8f9fa",
          2: "#f1f3f5",
          3: "#e9ecef",
        }
      },
      fontFamily: { 
        syne: ["var(--font-syne)", "sans-serif"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-syne)", "sans-serif"],
      },
      borderRadius: {
        'saas': '32px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'premium': '0 20px 40px -10px rgba(0,0,0,0.05)',
      },
      keyframes: {
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        }
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-out forwards',
      }
    },
  },
  plugins: [],
};

export default config;
