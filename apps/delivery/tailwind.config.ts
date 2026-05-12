import sharedConfig from "@mrtpvrest/config/tailwind";
import type { Config } from "tailwindcss";

// MIGRACIÓN: alineado con apps/tpv y apps/kds. Mismos design tokens
// (surf/tx/iris/success) para que componentes compartan look-and-feel.
// Aliases `halo-*` se conservan apuntando a las mismas vars CSS, así los
// componentes existentes siguen renderizando sin reescribir todo.
const config: Config = {
  presets: [sharedConfig as unknown as Partial<Config>],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sistema unificado (mismo que TPV/KDS)
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
        },
        bd: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        iris: {
          500: "var(--brand)",
          600: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          glow: "var(--brand-glow)",
          fg: "var(--brand-fg)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          hover: "var(--brand-hover)",
          soft: "var(--brand-soft)",
          glow: "var(--brand-glow)",
          fg: "var(--brand-fg)",
        },
        success: { DEFAULT: "var(--success)", soft: "var(--success-soft)" },
        warning: { DEFAULT: "var(--warning)", soft: "var(--warning-soft)" },
        danger:  { DEFAULT: "var(--danger)",  soft: "var(--danger-soft)"  },
        info:    { DEFAULT: "var(--info)",    soft: "var(--info-soft)"    },

        // Legacy aliases — apuntan a las mismas vars de arriba para que
        // bg-halo-* siga funcionando mientras se migra el código.
        halo: {
          bg: 'var(--bg)',
          card: 'var(--surface-1)',
          primary: 'var(--brand)',
          success: 'var(--success)',
          muted: 'var(--text-muted)',
          border: 'var(--border)',
        },
        orange: {
          500: 'var(--brand)',
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["DM Mono", "JetBrains Mono", "monospace"],
      },
      borderRadius: {
        '3xl': '24px',
        '4xl': '32px',
      },
    },
  },
  plugins: [],
};

export default config;
