import { test, expect } from '@playwright/test';
import { injectTPVDevice, enterPIN, getTPVCookie } from './helpers';

/**
 * Contrato de seguridad del TPV (apps/tpv/src/middleware.ts):
 *   - Sin cookie `tpv-device-linked`  → todo redirige a /setup.
 *   - Sin cookie `tpv-session-active` → /hub, /pos, /cierre, /meseros → /locked.
 *   - Por rol (cookie `tpv-role`):
 *       /pos    → CASHIER, WAITER, ADMIN, OWNER, MANAGER, SUPER_ADMIN
 *       /cierre → CASHIER, ADMIN, OWNER, MANAGER, SUPER_ADMIN (sin WAITER/KITCHEN)
 *     Un rol no autorizado rebota a /hub.
 *   - /kds ya NO existe en el TPV: el KDS es una app independiente (apps/kds).
 * El backend sigue siendo la autoridad real (requireRole por endpoint);
 * esto valida la defensa en profundidad del front.
 */
const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
const WAITER_PIN = process.env.WAITER_PIN ?? '1111';   // seed: E2E Mesero
const CASHIER_PIN = process.env.CASHIER_PIN ?? '1112'; // seed: E2E Cajero
const KITCHEN_PIN = process.env.KITCHEN_PIN ?? '1113'; // seed: E2E Cocina

test.describe('Validación de Roles (Seguridad)', () => {
  test.describe('Dispositivo sin vincular', () => {
    test('Cualquier ruta protegida redirige a /setup', async ({ page }) => {
      await page.goto(`${TPV_URL}/pos/menu`);
      await expect(page).toHaveURL(/\/setup/, { timeout: 10_000 });

      await page.goto(`${TPV_URL}/hub`);
      await expect(page).toHaveURL(/\/setup/, { timeout: 10_000 });
    });
  });

  test.describe('Vinculado sin sesión de empleado', () => {
    test('Rutas autenticadas redirigen a /locked (PIN pad)', async ({ page }) => {
      await injectTPVDevice(page);

      for (const route of ['/pos/menu', '/hub', '/cierre', '/meseros']) {
        await page.goto(`${TPV_URL}${route}`);
        await expect(page, `${route} debería exigir PIN`).toHaveURL(/\/locked/, { timeout: 10_000 });
      }
    });
  });

  test.describe('WAITER', () => {
    test.beforeEach(async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, WAITER_PIN);
    });

    test('Puede operar el POS (toma de pedidos)', async ({ page }) => {
      expect(await getTPVCookie(page, 'tpv-role')).toBe('WAITER');

      await page.goto(`${TPV_URL}/pos/order-type`);
      await expect(page).toHaveURL(/\/pos\//, { timeout: 10_000 });
    });

    test('NO puede entrar al cierre de caja — rebota a /hub', async ({ page }) => {
      await page.goto(`${TPV_URL}/cierre`);

      // El middleware lo expulsa de /cierre; el Hub puede re-enrutarlo a /pos.
      await page.waitForURL((url) => !url.pathname.startsWith('/cierre'), { timeout: 10_000 });
      await expect(page).not.toHaveURL(/\/cierre/);
    });
  });

  test.describe('CASHIER', () => {
    test.beforeEach(async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);
    });

    test('Puede operar el POS', async ({ page }) => {
      expect(await getTPVCookie(page, 'tpv-role')).toBe('CASHIER');

      await page.goto(`${TPV_URL}/pos/order-type`);
      await expect(page).toHaveURL(/\/pos\//, { timeout: 10_000 });
    });

    test('Puede entrar al cierre de caja', async ({ page }) => {
      await page.goto(`${TPV_URL}/cierre`);
      await expect(page).toHaveURL(/\/cierre/, { timeout: 10_000 });
    });
  });

  test.describe('KITCHEN', () => {
    test('NO puede operar el POS — el middleware lo retiene en /hub', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, KITCHEN_PIN);

      expect(await getTPVCookie(page, 'tpv-role')).toBe('KITCHEN');

      // El Hub re-intenta mandarlo a /pos y el middleware lo rebota en
      // ciclo — goto puede ser interrumpido por esas navegaciones.
      await page.goto(`${TPV_URL}/pos/menu`).catch(() => {});
      await page.waitForURL((url) => !url.pathname.startsWith('/pos'), { timeout: 10_000 });
      await expect(page).not.toHaveURL(/\/pos/);
    });
  });

  test.describe('Logout', () => {
    test('Cerrar sesión limpia cookies y vuelve a exigir PIN', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);

      // /hub?force=true muestra el selector de workspaces con "Cerrar sesión"
      await page.goto(`${TPV_URL}/hub?force=true`);
      await page.getByRole('button', { name: /cerrar sesión/i }).first().click();

      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
      expect(await getTPVCookie(page, 'tpv-session-active')).toBeFalsy();
      expect(await getTPVCookie(page, 'tpv-role')).toBeFalsy();

      // Deep-link tras logout vuelve al PIN pad, no al POS
      await page.goto(`${TPV_URL}/pos/menu`);
      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
    });
  });
});
