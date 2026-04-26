import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0a',
        ink2: '#111111',
        ink3: '#1a1a1a',
        line: 'rgba(255,255,255,0.08)',
        line2: 'rgba(255,255,255,0.14)',
        brand: {
          DEFAULT: '#ff5c35',
          50: '#fff3ee',
          100: '#ffd9c8',
          400: '#ff7a55',
          500: '#ff5c35',
          600: '#e64618',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        brand: '0 10px 40px -10px rgba(255,92,53,0.5)',
      },
    },
  },
  plugins: [],
}

export default config
