import { test, expect } from '@playwright/test';
import { injectAdminAuth, injectTPVDevice, enterPIN } from './helpers';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const TPV_URL   = process.env.TPV_URL   ?? 'http://localhost:3005';

const TEST_EMPLOYEE_NAME = 'Test Playwright';
const TEST_EMPLOYEE_PIN  = '9999';

test.describe('Gestión de Empleados', () => {
  test('Admin puede crear un empleado nuevo', async ({ page, context }) => {
    await injectAdminAuth(page, context);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByRole('button', { name: /nuevo empleado/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /nuevo empleado/i }).click();

    // Nombre
    await page.locator('label', { hasText: 'Nombre completo' })
      .locator('~ input, + input').fill(TEST_EMPLOYEE_NAME);

    // PIN
    await page.locator('label', { hasText: 'PIN' })
      .locator('~ input, + input').fill(TEST_EMPLOYEE_PIN);

    // Rol Mesero — acotado al modal para evitar el botón de filtro en la lista
    const modal = page.locator('.fixed.inset-0, [class*="fixed inset-0"]').last();
    await modal.getByRole('button', { name: /mesero/i }).click();

    await page.getByRole('button', { name: /guardar/i }).click();

    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test('El empleado creado puede hacer login en TPV', async ({ page }) => {
    await injectTPVDevice(page);
    await page.goto(TPV_URL);
    await enterPIN(page, TEST_EMPLOYEE_PIN);
    await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });
  });

  test('Admin puede eliminar el empleado de prueba', async ({ page, context }) => {
    // Aceptar cualquier dialog (confirm/alert) durante todo el test
    page.on('dialog', d => d.accept());

    await injectAdminAuth(page, context);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 15_000 });

    const card = page.locator('[class*="grid"] > *').filter({ has: page.getByText(TEST_EMPLOYEE_NAME) }).first();
    // El botón de eliminar es el último de la tarjeta (Historial | Editar | 🗑️)
    await card.locator('button').last().click();

    await expect(page.getByText(TEST_EMPLOYEE_NAME)).not.toBeVisible({ timeout: 15_000 });
  });
});
