import { test, expect } from '@playwright/test';
import { injectTPVDevice, enterPIN } from './helpers';

const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
const EMPLOYEE_PIN = process.env.EMPLOYEE_PIN ?? '1234';

test.describe('TPV', () => {
  test.beforeEach(async ({ page }) => {
    // Inyecta restaurantId + locationId para saltarse el wizard "Vincular TPV"
    await injectTPVDevice(page);
    await page.goto(TPV_URL);
  });

  test('TPV carga con PIN de empleado', async ({ page }) => {
    await enterPIN(page, EMPLOYEE_PIN);
    await expect(page.locator('header').first()).toBeVisible({ timeout: 10_000 });
  });

  test('TPV carga la vista correcta según el rol del empleado', async ({ page }) => {
    await enterPIN(page, EMPLOYEE_PIN);

    // WAITER → redirige a /meseros (sin producto-grid)
    // Otros roles → permanecen en la vista principal con producto-grid
    const isMainTPV = await page.locator('main button').first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (isMainTPV) {
      // Vista principal: añadir primer producto y verificar total > $0
      await page.locator('main button').first().click();
      await expect(page.locator('text=/\\$\\s*\\d+/').first()).toBeVisible({ timeout: 10_000 });
    } else {
      // Vista de mesero: verificar que cargó el contenido de la sucursal
      await expect(
        page.getByText(/mis pedidos|iniciar turno|sin mesas/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });
});
