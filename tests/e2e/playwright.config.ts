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
    // 1) Corre primero: genera .auth/admin.json (lo leen TODOS los helpers
    //    del TPV — injectTPVDevice necesita restaurantId/locationId del seed)
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
    // 3) Tests de validación de roles y seguridad — también usan
    //    injectTPVDevice, así que dependen del setup (antes corrían en
    //    paralelo y reventaban con ENOENT .auth/admin.json)
    {
      name: 'security',
      testMatch: '06-role-security.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // 3b) Flujo de meseros (mesa → rondas → cuenta) — usa .auth del setup
    {
      name: 'meseros',
      testMatch: '07-meseros-rondas.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // 4) Resto — 02-tpv usa injectTPVDevice; 01/03 no, pero serializar
    //    detrás del setup es inocuo
    {
      name: 'chromium',
      testMatch: '{01-login,02-tpv,03-kds}.spec.ts',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // 5) Retail multigiro (app moda / ferretería). NO depende del setup: se
    //    vincula con su propio seed (.auth/moda.json de e2e-seed-retail.js) y no
    //    toca el tenant de restaurante de los demás specs.
    //
    //    Artefactos SIEMPRE encendidos, a diferencia del resto: este flujo es el
    //    que se revisa a ojo (`playwright show-report` → video del cajero
    //    operando, o el trace paso a paso con el DOM de cada momento). Cuesta
    //    unos MB por corrida; para una caja que maneja dinero, ver la venta
    //    ocurrir vale más que eso.
    {
      name: 'moda-retail',
      testMatch: '08-moda-ferreteria.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.MODA_URL ?? 'http://localhost:3012',
        video: 'on',
        screenshot: 'on',
        trace: 'on',
      },
    },
  ],
});
