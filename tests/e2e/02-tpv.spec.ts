import { test, expect } from '@playwright/test';
import { injectTPVDevice, enterPIN, typePIN, getTPVCookie } from './helpers';

const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
// PIN determinista del seed (E2E Cajero, rol CASHIER)
const CASHIER_PIN = process.env.CASHIER_PIN ?? '1112';

test.describe('TPV', () => {
  test('TPV sin vincular redirige al wizard /setup', async ({ page }) => {
    await page.goto(TPV_URL);
    await expect(page).toHaveURL(/\/setup/, { timeout: 15_000 });
    // El wizard arranca en el paso de login (email/contraseña del admin)
    await expect(page.locator('input[type="email"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('TPV vinculado muestra lock screen y un cajero entra con PIN', async ({ page }) => {
    await injectTPVDevice(page);
    await expect(page).toHaveURL(/\/locked/, { timeout: 15_000 });

    await enterPIN(page, CASHIER_PIN);

    // CASHIER aterriza en /pos (shift/open sin turno; order-type con turno)
    // pasando por el Hub, que auto-selecciona el único workspace del seed.
    await expect(page).toHaveURL(/\/(pos|hub)/, { timeout: 20_000 });
    expect(await getTPVCookie(page, 'tpv-session-active')).toBe('true');
    expect(await getTPVCookie(page, 'tpv-role')).toBe('CASHIER');
  });

  test('PIN incorrecto muestra error y no abre sesión', async ({ page }) => {
    await injectTPVDevice(page);
    await expect(page).toHaveURL(/\/locked/, { timeout: 15_000 });

    await typePIN(page, '0000');

    await expect(page.getByText(/PIN incorrecto/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/locked/);
    expect(await getTPVCookie(page, 'tpv-session-active')).toBeUndefined();
  });
});
