/**
 * Proyecto "setup" — corre UNA vez antes de los demás tests.
 * Hace login como admin, lee el estado del browser y lo guarda en
 * .auth/admin.json para que los tests lo inyecten via addInitScript.
 *
 * Por qué no usamos page.context().storageState():
 *   El admin app usa same-origin proxy (Next.js rewrite) y guarda auth
 *   solo en localStorage. Playwright's storageState devuelve `origins: []`
 *   en algunos entornos HTTPS — leemos los valores directamente.
 */
import { test as setup, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
export const ADMIN_AUTH_FILE = path.join(__dirname, '.auth/admin.json');

setup('autenticar admin y guardar sesión', async ({ page }) => {
  await page.goto(`${ADMIN_URL}/login`);
  await page.locator('input[type="email"]').fill(process.env.ADMIN_EMAIL ?? '');
  await page.locator('input[type="password"]').fill(process.env.ADMIN_PASSWORD ?? '');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

  // Espera a que localStorage tenga el accessToken
  await page.waitForFunction(() => !!localStorage.getItem('accessToken'), { timeout: 8_000 });

  // Lee todo lo que necesitan los tests de admin y TPV
  const authData = await page.evaluate(async () => {
    const accessToken = localStorage.getItem('accessToken') ?? '';
    const refreshToken = localStorage.getItem('refreshToken') ?? '';
    const user = localStorage.getItem('user') ?? '';
    const restaurantId = localStorage.getItem('restaurantId') ?? '';
    const mbRole = document.cookie.match(/mb-role=([^;]*)/)?.[1] ?? 'ADMIN';

    // Obtiene la primera sucursal disponible para el TPV
    let locationId = '';
    let locationName = '';
    let restaurantName = '';
    try {
      const resp = await fetch('/api/admin/locations', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (resp.ok) {
        const locs = await resp.json();
        if (Array.isArray(locs) && locs.length > 0) {
          locationId = locs[0].id ?? '';
          locationName = locs[0].name ?? '';
        }
      }
      const configResp = await fetch('/api/admin/config', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (configResp.ok) {
        const cfg = await configResp.json();
        restaurantName = cfg.name ?? cfg.restaurantName ?? '';
      }
    } catch (_) { /* opcional — el TPV funciona sin nombre */ }

    return { accessToken, refreshToken, user, restaurantId, mbRole, locationId, locationName, restaurantName };
  });

  fs.mkdirSync(path.dirname(ADMIN_AUTH_FILE), { recursive: true });
  fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(authData, null, 2));

  console.log(`\n✅ Auth guardada: restaurantId=${authData.restaurantId} locationId=${authData.locationId}`);
});
