import type { Page, BrowserContext } from '@playwright/test';
import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const TPV_URL   = process.env.TPV_URL   ?? 'http://localhost:3005';
const AUTH_FILE = path.join(__dirname, '.auth/admin.json');

function readAuth() {
  return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
}

/**
 * Inyecta la sesión de admin en el browser.
 *
 * Por qué usamos el patrón de doble-navegación:
 *   addInitScript no garantiza que localStorage esté listo cuando el interceptor
 *   de axios dispara la primera petición. La solución fiable: navegar una vez
 *   a ADMIN_URL (para establecer el origen), inyectar via evaluate(), y dejar
 *   que el test navegue a la URL destino — localStorage ya estará poblado.
 */
export async function injectAdminAuth(page: Page, context: BrowserContext) {
  const auth = readAuth();
  const domain = new URL(ADMIN_URL).hostname;

  // Cookie mb-role para el middleware de Next.js (edge)
  await context.addCookies([{
    name: 'mb-role',
    value: auth.mbRole || 'ADMIN',
    domain,
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'Lax',
  }]);

  // 1ª navegación: establece el origen para poder escribir en localStorage
  await page.goto(ADMIN_URL);
  await page.waitForLoadState('domcontentloaded');

  // Inyectar auth en localStorage del origen admin
  await page.evaluate((a: Record<string, string>) => {
    if (a.accessToken)   localStorage.setItem('accessToken',   a.accessToken);
    if (a.refreshToken)  localStorage.setItem('refreshToken',  a.refreshToken);
    if (a.user)          localStorage.setItem('user',          a.user);
    if (a.restaurantId)  localStorage.setItem('restaurantId',  a.restaurantId);
    if (a.locationId)    localStorage.setItem('locationId',    a.locationId);
    if (a.locationName)  localStorage.setItem('locationName',  a.locationName);
    if (a.restaurantName) localStorage.setItem('restaurantName', a.restaurantName);
  }, auth as Record<string, string>);
  // El test navega a la URL destino después de llamar a esta función
}

/**
 * Inyecta la vinculación de sucursal en el TPV y navega a la raíz.
 *
 * Por qué no usamos addInitScript:
 *   Next.js App Router ejecuta el useEffect de la página ANTES de que
 *   addInitScript pueda poblar localStorage en algunos entornos SSR.
 *   La solución confiable: navegar a la URL (deja que redirija a /setup),
 *   luego inyectar via page.evaluate() y navegar de nuevo a /.
 */
export async function injectTPVDevice(page: Page) {
  const auth = readAuth();

  // 1ª navegación: el TPV redirige a /setup porque localStorage está vacío
  await page.goto(TPV_URL);
  await page.waitForLoadState('domcontentloaded');

  // Inyectar los valores de vinculación en el localStorage del origen TPV
  await page.evaluate((a: Record<string, string>) => {
    if (a.restaurantId)   localStorage.setItem('restaurantId',   a.restaurantId);
    if (a.locationId)     localStorage.setItem('locationId',     a.locationId);
    if (a.restaurantName) localStorage.setItem('restaurantName', a.restaurantName || 'Restaurante');
    if (a.locationName)   localStorage.setItem('locationName',   a.locationName  || 'Sucursal');
  }, auth as Record<string, string>);

  // 2ª navegación: ahora el useEffect encuentra los valores y muestra el PIN pad
  await page.goto(TPV_URL);
}

/**
 * Espera el PIN pad, entra los dígitos uno a uno y pulsa "Ingresar".
 * El TPVLockScreen (renderizado cuando isConfigured=true) requiere un clic
 * explícito en el botón de submit — no hay auto-envío al llegar a 4 dígitos.
 */
export async function enterPIN(page: Page, pin: string) {
  await expect(page.locator('[class*="grid-cols-3"]').first()).toBeVisible({ timeout: 15_000 });

  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).first().click();
  }

  await page.getByRole('button', { name: /ingresar/i }).click();

  // Espera que aparezca el header del TPV tras el login exitoso
  await expect(page.locator('header').first()).toBeVisible({ timeout: 15_000 });
}
