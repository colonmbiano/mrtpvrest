import sharedConfig from "@mrtpvrest/config/tailwind";
import type { Config } from "tailwindcss";

const config: Config = {
  presets: [sharedConfig],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/config/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          500: '#ff5c35',
        }
      }
    },
  },
  plugins: [],
};

export default config;
