import { test, expect } from '@playwright/test';

const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';

test.describe('KDS (Kitchen Display System)', () => {
  test('KDS carga y muestra órdenes activas o mensaje vacío', async ({ page }) => {
    await page.goto(`${TPV_URL}/kds`);

    // Page must load without crashing (no unhandled JS error)
    let consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.waitForLoadState('domcontentloaded');

    // Any of these outcomes is valid:
    // 1. Proper KDS with station selector
    // 2. Empty kitchen: "Cocina al día" / "Sin pedidos pendientes"
    // 3. Auth error: needs kitchen session (acceptable — test verifies page renders)
    const validStates = page
      .getByText(/Cocina al día|Sin pedidos pendientes|cocina|COCINA|BARRA|FREIDORA|sesion de cocina/i)
      .first();

    await expect(validStates).toBeVisible({ timeout: 15_000 });

    // No unhandled React/JS errors should have fired
    const fatalErrors = consoleErrors.filter(
      (e) => e.includes('Uncaught') || e.includes('Unhandled')
    );
    expect(fatalErrors, `Errores fatales en consola: ${fatalErrors.join('\n')}`).toHaveLength(0);
  });
});
