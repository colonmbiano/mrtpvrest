import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3002';
const SAAS_URL = process.env.SAAS_URL ?? 'http://localhost:3003';
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

test.describe('Autenticación', () => {
  // El super admin tiene su propio dominio: saas.mrtpvrest.com con login independiente
  test('Super Admin puede iniciar sesión', async ({ page }) => {
    await page.goto(`${SAAS_URL}/login`);

    await page.locator('input[type="email"]').fill(SUPERADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(SUPERADMIN_PASSWORD);
    await page.getByRole('button', { name: /ingresar|entrar|acceso/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    // La SAAS central muestra tenants o marcas después de login
    await expect(
      page.locator('body').getByText(/tenant|marca|restaurante|dashboard/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Admin de restaurante puede iniciar sesión', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

    // Sidebar must load with at least one nav section
    const nav = page.locator('nav, aside, [class*="sidebar"]').first();
    await expect(nav).toBeVisible({ timeout: 10_000 });
  });

  test('Login con credenciales incorrectas muestra error', async ({ page }) => {
    await page.goto(`${ADMIN_URL}/login`);

    await page.locator('input[type="email"]').fill('nadie@invalido.com');
    await page.locator('input[type="password"]').fill('contrasena_incorrecta_999');
    await page.locator('button[type="submit"]').click();

    // Should remain on login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    // Error div appears with red styling (color: #ef4444)
    const errorDiv = page.locator('div').filter({
      hasText: /credencial|incorrecto|inválido|error|no encontrado|unauthorized/i,
    }).first();
    await expect(errorDiv).toBeVisible({ timeout: 10_000 });
  });
});
