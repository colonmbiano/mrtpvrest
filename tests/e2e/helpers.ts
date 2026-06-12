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
 * Vincula el TPV como dispositivo de la sucursal del seed y lo deja en
 * /locked listo para enterPIN().
 *
 * El middleware del TPV (apps/tpv/src/middleware.ts) enruta por cookies:
 *   - sin `tpv-device-linked`  → /setup (wizard de vinculación)
 *   - sin `tpv-session-active` → /locked (PIN pad)
 * El login por PIN (POST /api/employees/login) necesita el header
 * x-location-id, que el interceptor de api.ts lee de localStorage. Por eso
 * seteamos la cookie de vinculación (vía document.cookie, igual que el
 * wizard real) + restaurantId/locationId y navegamos de nuevo.
 *
 * No recibe `context`: se obtiene de page.context() para que la firma sea
 * de un solo argumento (compatible con todos los specs).
 */
export async function injectTPVDevice(page: Page) {
  const auth = readAuth();

  // 1ª navegación: sin cookie, el middleware manda a /setup
  await page.goto(TPV_URL);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate((a: Record<string, string>) => {
    // tpv-device-linked NO es httpOnly (el wizard la escribe con document.cookie)
    document.cookie = 'tpv-device-linked=true; path=/; SameSite=Lax';
    localStorage.setItem('restaurantId', a.restaurantId);
    localStorage.setItem('locationId',   a.locationId);
    localStorage.setItem('locationName', a.locationName || 'Sucursal');
  }, auth as Record<string, string>);

  // 2ª navegación: ya hay device, sin sesión → /locked (PIN pad)
  await page.goto(TPV_URL);
}

/**
 * Teclea un PIN en el NumpadPIN de /locked. El numpad tiene autoSubmit:
 * al capturar el 4º dígito envía solo (no existe botón "Ingresar").
 */
export async function typePIN(page: Page, pin: string) {
  // Espera el numpad (botón dígito "1") — hidratación de /locked
  await expect(
    page.getByRole('button', { name: '1', exact: true })
  ).toBeVisible({ timeout: 15_000 });

  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click({ delay: 80 });
  }
}

/**
 * Login completo por PIN: teclea el PIN y espera a salir de /locked.
 * Tras validar, el TPV navega a /hub; con un solo workspace el Hub
 * auto-selecciona y redirige a /pos/shift/open (sin turno) o
 * /pos/order-type (turno abierto). Roles sin acceso a /pos (KITCHEN,
 * DELIVERY) rebotan a /hub vía middleware.
 */
export async function enterPIN(page: Page, pin: string) {
  await typePIN(page, pin);

  await page.waitForURL(
    (url) => !url.pathname.startsWith('/locked') && !url.pathname.startsWith('/setup'),
    { timeout: 20_000 },
  );
}

/** Lee una cookie del contexto por nombre (origen TPV). */
export async function getTPVCookie(page: Page, name: string) {
  const cookies = await page.context().cookies(TPV_URL);
  return cookies.find((c) => c.name === name)?.value;
}
