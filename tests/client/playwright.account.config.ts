import { defineConfig, devices } from '@playwright/test';

// Cuenta del comprador del marketplace: la tienda con el catálogo y las cuentas
// encendidos contra una API simulada (mock-account.mjs). Puertos propios para no
// chocar con las pruebas del menú QR.
export default defineConfig({
  testDir: '.',
  testMatch: 'account.spec.ts',
  timeout: 45_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/client-account',
  use: { launchOptions: { executablePath: process.env.TEST_CHROMIUM_PATH, args: process.env.TEST_CHROMIUM_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] }, baseURL: 'http://127.0.0.1:4327', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    { command: 'node tests/client/mock-account.mjs', cwd: '../..', url: 'http://127.0.0.1:4328/__test/health', reuseExistingServer: false },
    { command: 'node node_modules/next/dist/bin/next dev --port 4327 --hostname 127.0.0.1 --webpack',
      env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4328', NEXT_PUBLIC_MARKETPLACE_CATALOG: 'true', NEXT_PUBLIC_MARKETPLACE_ACCOUNTS: 'true' },
      cwd: '../../apps/client', url: 'http://127.0.0.1:4327/cuenta/entrar', timeout: 180_000, reuseExistingServer: false },
  ],
});
