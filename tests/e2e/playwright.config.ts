import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env.test') });

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { outputFolder: '../e2e-report', open: 'never' }]],
  outputDir: 'results',
  use: {
    baseURL: process.env.ADMIN_URL ?? 'http://localhost:3002',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    // 1) Corre primero: genera .auth/admin.json
    {
      name: 'setup',
      testMatch: 'auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // 2) Tests de empleados y repartidores — esperan el setup
    {
      name: 'admin-autenticado',
      testMatch: '{04-empleados,05-repartidor}.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // 3) Tests de validación de roles y seguridad
    {
      name: 'security',
      testMatch: '06-role-security.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    // 4) Resto sin dependencias
    {
      name: 'chromium',
      testMatch: '{01-login,02-tpv,03-kds}.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
