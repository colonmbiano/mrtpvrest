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
 *   - Una recarga completa exige PIN de nuevo (SyncInitializer). Las rutas
 *     permitidas se recorren con la UI; las prohibidas se consultan sin seguir
 *     redirects para comprobar el middleware sin destruir la sesión del SPA.
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

      await expect(page).toHaveURL(/\/pos\/order-type\/?$/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();
    });

    test('NO puede entrar al cierre de caja — rebota a /hub', async ({ page }) => {
      const response = await page.request.get(`${TPV_URL}/cierre/`, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location).pathname).toBe('/hub');
      expect(await getTPVCookie(page, 'tpv-role')).toBe('WAITER');
    });
  });

  test.describe('CASHIER', () => {
    test.beforeEach(async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);
    });

    test('Puede operar el POS', async ({ page }) => {
      expect(await getTPVCookie(page, 'tpv-role')).toBe('CASHIER');

      await expect(page).toHaveURL(/\/pos\/order-type\/?$/, { timeout: 20_000 });
      await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();
    });

    test('Puede entrar al cierre de caja', async ({ page }) => {
      await expect(page).toHaveURL(/\/pos\/order-type\/?$/, { timeout: 20_000 });
      await page.getByRole('button', { name: 'Menú', exact: true }).click();
      await page.getByRole('button', { name: 'Corte de caja', exact: true }).click();
      await expect(page).toHaveURL(/\/cierre/, { timeout: 10_000 });
      expect(await getTPVCookie(page, 'tpv-session-active')).toBe('true');
    });
  });

  test.describe('KITCHEN', () => {
    test('NO puede operar el POS — el middleware lo retiene en /hub', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, KITCHEN_PIN);

      expect(await getTPVCookie(page, 'tpv-role')).toBe('KITCHEN');

      const response = await page.request.get(`${TPV_URL}/pos/menu/`, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(new URL(response.headers().location).pathname).toBe('/hub');
    });
  });

  test.describe('Logout', () => {
    test('Cerrar sesión limpia cookies y vuelve a exigir PIN', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);

      // Usar el cierre real de la sesión desde la pantalla operativa. Un solo
      // workspace ya no muestra el selector de /hub, ni siquiera con force.
      await expect(page).toHaveURL(/\/pos\/order-type\/?$/, { timeout: 20_000 });
      await page.getByRole('button', { name: 'Menú', exact: true }).click();
      await page.getByRole('button', { name: 'Cambiar empleado', exact: true }).click();

      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
      expect(await getTPVCookie(page, 'tpv-session-active')).toBeFalsy();
      expect(await getTPVCookie(page, 'tpv-role')).toBeFalsy();

      // Deep-link tras logout vuelve al PIN pad, no al POS
      await page.goto(`${TPV_URL}/pos/menu`);
      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
    });
  });

  test('Recargar una sesión exige PIN y limpia las cookies de empleado', async ({ page }) => {
    await injectTPVDevice(page);
    await enterPIN(page, CASHIER_PIN);
    await expect(page).toHaveURL(/\/pos\/order-type\/?$/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Nueva venta' })).toBeVisible();

    await page.reload();

    await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
    expect(await getTPVCookie(page, 'tpv-session-active')).toBeFalsy();
    expect(await getTPVCookie(page, 'tpv-role')).toBeFalsy();
    await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible();
  });
});
