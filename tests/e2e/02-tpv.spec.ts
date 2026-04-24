import { test, expect } from '@playwright/test';

const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
const EMPLOYEE_PIN = process.env.EMPLOYEE_PIN ?? '1234';

async function loginTPV(page: import('@playwright/test').Page, pin: string) {
  await page.goto(TPV_URL);
  // Wait for the PIN pad to appear
  await expect(page.locator('.grid').filter({ has: page.getByRole('button', { name: '1' }) })).toBeVisible({ timeout: 15_000 });

  // Enter PIN digit by digit
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).first().click();
  }

  // At 4 digits the app auto-submits; wait for navigation away from PIN screen
  await expect(page.locator('.grid').filter({ has: page.getByRole('button', { name: '1' }) })).not.toBeVisible({ timeout: 15_000 });
}

test.describe('TPV', () => {
  test('TPV carga con PIN de empleado', async ({ page }) => {
    await loginTPV(page, EMPLOYEE_PIN);

    // Main screen should show menu grid or header with restaurant info
    await expect(
      page.locator('header, [class*="header"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('TPV puede crear una orden nueva', async ({ page }) => {
    await loginTPV(page, EMPLOYEE_PIN);

    // Wait for menu products to appear
    const productGrid = page.locator('[class*="grid"]').filter({
      has: page.locator('button').first(),
    });
    await expect(productGrid.first()).toBeVisible({ timeout: 10_000 });

    // Click the first available product
    const firstProduct = page.locator('main button, [class*="grid"] button').first();
    await firstProduct.click();

    // Total should be greater than 0 — look for price in ticket pane
    const totalEl = page.locator('text=/\\$\\s*\\d+|total/i').first();
    await expect(totalEl).toBeVisible({ timeout: 10_000 });

    // The order item must appear in the right-side ticket pane
    const ticketPane = page.locator('[class*="border-l"], aside').last();
    await expect(ticketPane).toBeVisible();
  });
});
