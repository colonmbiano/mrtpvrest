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
 *
 * IMPORTANTE: la sesión PIN viva NO se persiste tras un reload completo.
 * Por eso los tests de middleware posteriores al login usan el request context
 * compartido del navegador (mismas cookies) en vez de page.goto(), que montaría
 * SyncInitializer y pediría un PIN fresco por diseño.
 */
const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
const WAITER_PIN = process.env.WAITER_PIN ?? '1111';
const CASHIER_PIN = process.env.CASHIER_PIN ?? '1112';
const KITCHEN_PIN = process.env.KITCHEN_PIN ?? '1113';

function redirectPath(location: string | undefined): string {
  if (!location) return '';
  return new URL(location, TPV_URL).pathname;
}

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
        const response = await page.context().request.get(`${TPV_URL}${route}`, {
          maxRedirects: 0,
        });
        expect([307, 308]).toContain(response.status());
        expect(redirectPath(response.headers().location), `${route} debería exigir PIN`).toBe('/locked');
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

      const response = await page.context().request.get(`${TPV_URL}/pos/order-type`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
    });

    test('NO puede entrar al cierre de caja — rebota a /hub', async ({ page }) => {
      const response = await page.context().request.get(`${TPV_URL}/cierre`, {
        maxRedirects: 0,
      });
      expect([307, 308]).toContain(response.status());
      expect(redirectPath(response.headers().location)).toBe('/hub');
    });
  });

  test.describe('CASHIER', () => {
    test.beforeEach(async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);
    });

    test('Puede operar el POS', async ({ page }) => {
      expect(await getTPVCookie(page, 'tpv-role')).toBe('CASHIER');

      const response = await page.context().request.get(`${TPV_URL}/pos/order-type`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
    });

    test('Puede entrar al cierre de caja', async ({ page }) => {
      const response = await page.context().request.get(`${TPV_URL}/cierre`, {
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
    });
  });

  test.describe('KITCHEN', () => {
    test('NO puede operar el POS — el middleware lo retiene en /hub', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, KITCHEN_PIN);

      expect(await getTPVCookie(page, 'tpv-role')).toBe('KITCHEN');

      const response = await page.context().request.get(`${TPV_URL}/pos/menu`, {
        maxRedirects: 0,
      });
      expect([307, 308]).toContain(response.status());
      expect(redirectPath(response.headers().location)).toBe('/hub');
    });
  });

  test.describe('Logout', () => {
    test('Cambiar empleado limpia cookies y vuelve a exigir PIN', async ({ page }) => {
      await injectTPVDevice(page);
      await enterPIN(page, CASHIER_PIN);

      // No hacemos page.goto() post-login: un reload completo pide PIN fresco
      // intencionalmente. Usamos el flujo real de la UI desde /pos/order-type.
      await page.waitForURL(/\/pos\/order-type/, { timeout: 20_000 });
      await page.getByRole('button', { name: 'Menú', exact: true }).click();
      await page.getByRole('button', { name: /cambiar empleado/i }).click();

      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
      expect(await getTPVCookie(page, 'tpv-session-active')).toBeFalsy();
      expect(await getTPVCookie(page, 'tpv-role')).toBeFalsy();

      // Deep-link tras logout vuelve al PIN pad, no al POS.
      await page.goto(`${TPV_URL}/pos/menu`);
      await expect(page).toHaveURL(/\/locked/, { timeout: 10_000 });
    });
  });
});
