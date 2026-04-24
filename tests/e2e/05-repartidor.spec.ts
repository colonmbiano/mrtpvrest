import { test, expect } from '@playwright/test';
import { injectAdminAuth, injectTPVDevice, enterPIN } from './helpers';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const TPV_URL   = process.env.TPV_URL   ?? 'http://localhost:3005';

const TEST_DRIVER_NAME = 'Repartidor Test';
const TEST_DRIVER_PIN  = '8888';

test.describe('Gestión de Repartidores', () => {
  test('Admin puede crear un repartidor', async ({ page, context }) => {
    await injectAdminAuth(page, context);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByRole('button', { name: /nuevo empleado/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /nuevo empleado/i }).click();

    await page.locator('label', { hasText: 'Nombre completo' })
      .locator('~ input, + input').fill(TEST_DRIVER_NAME);

    await page.locator('label', { hasText: 'PIN' })
      .locator('~ input, + input').fill(TEST_DRIVER_PIN);

    const modal = page.locator('.fixed.inset-0, [class*="fixed inset-0"]').last();
    await modal.getByRole('button', { name: /repartidor/i }).click();
    await page.getByRole('button', { name: /guardar/i }).click();

    await expect(page.getByText(TEST_DRIVER_NAME)).toBeVisible({ timeout: 15_000 });
    const card = page.locator('[class*="grid"] > *').filter({ has: page.getByText(TEST_DRIVER_NAME) });
    await expect(card.getByText(/repartidor/i).first()).toBeVisible();
  });

  test('El repartidor puede hacer login en TPV', async ({ page }) => {
    await injectTPVDevice(page);
    await page.goto(TPV_URL);
    await enterPIN(page, TEST_DRIVER_PIN);
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Admin puede eliminar el repartidor de prueba', async ({ page, context }) => {
    // Aceptar cualquier dialog (confirm/alert) durante todo el test
    page.on('dialog', d => d.accept());

    await injectAdminAuth(page, context);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByText(TEST_DRIVER_NAME)).toBeVisible({ timeout: 15_000 });

    const card = page.locator('[class*="grid"] > *').filter({ has: page.getByText(TEST_DRIVER_NAME) }).first();
    // El botón de eliminar es el último de la tarjeta (Historial | Editar | 🗑️)
    await card.locator('button').last().click();

    await expect(page.getByText(TEST_DRIVER_NAME)).not.toBeVisible({ timeout: 15_000 });
  });
});
