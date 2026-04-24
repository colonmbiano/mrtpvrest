import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';

const TEST_EMPLOYEE_NAME = 'Test Playwright';
const TEST_EMPLOYEE_PIN = '9999';

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });
}

test.describe('Gestión de Empleados', () => {
  test('Admin puede crear un empleado nuevo', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    // Wait for the employee list to load
    await expect(page.getByText(/empleado|personal/i).first()).toBeVisible({ timeout: 10_000 });

    // Open the new employee form
    await page.getByRole('button', { name: /nuevo empleado/i }).click();

    // Fill in the form
    // Name field — label "Nombre completo" is above the input
    const nameLabel = page.locator('label', { hasText: 'Nombre completo' });
    const nameInput = nameLabel.locator('~ input, + input');
    await nameInput.fill(TEST_EMPLOYEE_NAME);

    // PIN field — label "PIN (4-6 dígitos)"
    const pinLabel = page.locator('label', { hasText: 'PIN' });
    const pinInput = pinLabel.locator('~ input, + input');
    await pinInput.fill(TEST_EMPLOYEE_PIN);

    // Select role "Mesero" (default, but click to be explicit)
    await page.getByRole('button', { name: /mesero/i }).click();

    // Save
    await page.getByRole('button', { name: /guardar/i }).click();

    // Employee should appear in the list
    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test('El empleado creado puede hacer login en TPV', async ({ page }) => {
    await page.goto(TPV_URL);

    // Wait for PIN pad
    await expect(
      page.locator('.grid').filter({ has: page.getByRole('button', { name: '9' }) })
    ).toBeVisible({ timeout: 15_000 });

    // Enter PIN 9999
    for (const digit of TEST_EMPLOYEE_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).first().click();
    }

    // Should auto-submit and show main TPV screen
    await expect(
      page.locator('header, [class*="header"]').first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Admin puede eliminar el empleado de prueba', async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${ADMIN_URL}/admin/empleados`);

    // Wait for list
    await expect(page.getByText(TEST_EMPLOYEE_NAME)).toBeVisible({ timeout: 15_000 });

    // Click the delete button on the test employee's card
    const employeeCard = page.locator('[class*="grid"] > *').filter({
      has: page.getByText(TEST_EMPLOYEE_NAME),
    });
    const deleteBtn = employeeCard.locator('button').filter({ hasText: /🗑|eliminar|borrar/i });
    await deleteBtn.click();

    // Confirm deletion if a dialog appears
    const confirmBtn = page.getByRole('button', { name: /confirmar|sí|eliminar/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    // Employee should no longer appear
    await expect(page.getByText(TEST_EMPLOYEE_NAME)).not.toBeVisible({ timeout: 15_000 });
  });
});
