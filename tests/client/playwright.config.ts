import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'mesa-menu.spec.ts',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../../test-results/client',
  use: { launchOptions: { executablePath: process.env.TEST_CHROMIUM_PATH, args: process.env.TEST_CHROMIUM_PATH ? ['--no-sandbox', '--disable-dev-shm-usage'] : [] }, baseURL: 'http://127.0.0.1:4317', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    { command: 'node tests/client/mock-store.mjs', cwd: '../..', url: 'http://127.0.0.1:4318/api/store/info', reuseExistingServer: false },
    { command: 'node node_modules/next/dist/bin/next dev --port 4317 --hostname 127.0.0.1 --webpack', env: { NEXT_PUBLIC_API_URL: 'http://127.0.0.1:4318' }, cwd: '../../apps/client', url: 'http://127.0.0.1:4317', timeout: 180_000, reuseExistingServer: false },
  ],
});
