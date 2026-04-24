import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';

const TEST_DRIVER_NAME = 'Repartidor Test';
const TEST_DRIVER_PIN = '8888';

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
}

test.describe('Gestión de Repartidores', () => {
  test('Admin puede crear un repartidor', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByRole('button', { name: /nuevo empleado/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /nuevo empleado/i }).click();

    // Fill name
    const nameLabel = page.locator('label', { hasText: 'Nombre completo' });
    await nameLabel.locator('~ input, + input').fill(TEST_DRIVER_NAME);

    // Fill PIN
    const pinLabel = page.locator('label', { hasText: 'PIN' });
    await pinLabel.locator('~ input, + input').fill(TEST_DRIVER_PIN);

    // Select "Repartidor" role
    await page.getByRole('button', { name: /repartidor/i }).click();

    await page.getByRole('button', { name: /guardar/i }).click();

    // Driver must appear with "Repartidor" role label
    await expect(page.getByText(TEST_DRIVER_NAME)).toBeVisible({ timeout: 15_000 });
    const driverCard = page.locator('[class*="grid"] > *').filter({
      has: page.getByText(TEST_DRIVER_NAME),
    });
    await expect(driverCard.getByText(/repartidor/i)).toBeVisible();
  });

  test('El repartidor puede hacer login en TPV', async ({ page }) => {
    await page.goto(TPV_URL);

    await expect(
      page.locator('.grid').filter({ has: page.getByRole('button', { name: '8' }) })
    ).toBeVisible({ timeout: 15_000 });

    for (const digit of TEST_DRIVER_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).first().click();
    }

    // Should reach main TPV screen or show that the user is logged in
    await expect(
      page.locator('header, [class*="header"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Admin puede eliminar el repartidor de prueba', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    await expect(page.getByText(TEST_DRIVER_NAME)).toBeVisible({ timeout: 15_000 });

    const driverCard = page.locator('[class*="grid"] > *').filter({
      has: page.getByText(TEST_DRIVER_NAME),
    });
    const deleteBtn = driverCard.locator('button').filter({ hasText: /🗑|eliminar|borrar/i });
    await deleteBtn.click();

    const confirmBtn = page.getByRole('button', { name: /confirmar|sí|eliminar/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.getByText(TEST_DRIVER_NAME)).not.toBeVisible({ timeout: 15_000 });
  });
});
