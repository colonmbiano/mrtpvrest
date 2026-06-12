import { test, expect } from '@playwright/test';

// El KDS es una app independiente (apps/kds, puerto 3009) desde que /kds
// salió del TPV. Flujo de vinculación: login admin → sucursal → estaciones
// → KdsScreen (vista de cocina).
const KDS_URL = process.env.KDS_URL ?? 'http://localhost:3009';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

test.describe('KDS (Kitchen Display System)', () => {
  test('KDS se vincula como pantalla de cocina y muestra la vista vacía', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(KDS_URL);

    // Paso 1: login de admin
    await expect(page.getByText(/inicia sesión como admin/i)).toBeVisible({ timeout: 15_000 });
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /continuar/i }).click();

    // Paso 2: elegir sucursal (el seed tiene al menos una activa)
    await expect(page.getByText(/elige sucursal/i)).toBeVisible({ timeout: 15_000 });
    // Los botones de sucursal contienen <p> (nombre + restaurante);
    // el botón "Atrás" solo tiene un icono.
    await page.locator('button', { has: page.locator('p') }).first().click();

    // Paso 3: estaciones — "Cocina central" viene preseleccionado
    await expect(page.getByText(/qué muestra esta pantalla/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /vincular pantalla/i }).click();

    // KdsScreen: sin órdenes en el seed → estado vacío de la estación
    await expect(
      page.getByText(/sin pedidos pendientes/i).first()
    ).toBeVisible({ timeout: 20_000 });

    // No unhandled React/JS errors should have fired
    const fatalErrors = consoleErrors.filter(
      (e) => e.includes('Uncaught') || e.includes('Unhandled')
    );
    expect(fatalErrors, `Errores fatales en consola: ${fatalErrors.join('\n')}`).toHaveLength(0);
  });
});
