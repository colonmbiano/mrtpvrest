import { test, expect, type Page } from '@playwright/test';

/**
 * TPV E2E Test: DINE_IN Rounds & Combined Payment.
 * 
 * This test covers the full lifecycle of a restaurant order:
 * 1. Login with PIN.
 * 2. Starting a Dine-In order.
 * 3. Selecting an available or dirty table.
 * 4. Adding a first round of items and sending to kitchen.
 * 5. Verifying history visibility (previous rounds).
 * 6. Adding a second round.
 * 7. Processing combined payment for all rounds.
 */

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const EMPLOYEE_PIN = process.env.EMPLOYEE_PIN ?? '1228';

test.describe('TPV Operational Flows', () => {

  /**
   * Helper to handle the initial setup redirect if it appears.
   */
  async function handleInitialSetup(page: Page) {
    const setupTitle = page.getByRole('heading', { name: 'Configuración Inicial' });
    if (await setupTitle.isVisible()) {
      console.log('Detected Initial Setup screen. Configuring...');
      await page.getByLabel('Correo Electrónico').fill(ADMIN_EMAIL);
      await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
      await page.getByRole('button', { name: 'Continuar' }).click();
      
      await expect(page.getByRole('heading', { name: 'Seleccionar Sucursal' })).toBeVisible({ timeout: 15000 });
      await page.locator('select').selectOption({ index: 0 });
      await page.getByRole('button', { name: 'Continuar' }).click();
      
      await expect(page.getByText('¿Qué será este dispositivo?')).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: /Caja Principal/ }).click();
      await page.getByRole('button', { name: /Vincular como/ }).click();
      
      await expect(page).toHaveURL(/\/locked/, { timeout: 20000 });
    }
  }

  test.beforeEach(async ({ page }) => {
    // Navigate to Lock Screen
    await page.goto('/locked');
    
    // Check for Setup Redirect
    if (page.url().includes('/setup')) {
      await handleInitialSetup(page);
    }

    // Ensure we are on the PIN screen
    if (!page.url().includes('/locked')) {
        await page.goto('/locked');
    }

    // Enter PIN Digit by Digit
    await page.waitForSelector('button:has-text("1")');
    for (const digit of EMPLOYEE_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click();
    }
    
    // Verify Successful Login to Hub
    await expect(page).toHaveURL(/\/hub/);

    // Handle Workspace Selection if present
    const workspaceButton = page.getByRole('button', { name: /Seleccionar/i });
    if (await workspaceButton.isVisible()) {
      await workspaceButton.click();
    }
  });

  test('Dine-In: Multiple Rounds and Combined Payment', async ({ page }) => {
    // 1. Select "Comer Aquí" (Dine-In) from Hub
    await page.getByRole('button', { name: /Comer Aquí/i }).click();
    await expect(page).toHaveURL(/\/order-type/);
    
    // 2. Pick a Free Table
    const freeTable = page
      .getByRole('button', { name: /Mesa/i })
      .filter({ hasNotText: '+ RONDA' })
      .first();

    await expect(freeTable).toBeVisible();
    await freeTable.click();
    
    // 3. Handle Guest Count Modal (Step 2 of Dine-In flow)
    const guestsModalTitle = page.getByRole('heading', { name: /¿Cuántos comensales?/i });
    if (await guestsModalTitle.isVisible()) {
      await page.getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: /Empezar orden/i }).click();
    }
    
    // 4. Verify we are in the Menu/Catalog
    await expect(page).toHaveURL(/\/menu/);

    // 5. Handle Catalog Navigation (Categories vs Products)
    // If we are in drilldown mode, we see categories first.
    const favoritesTile = page.getByRole('button', { name: /Favoritos/i });
    const categories = page.locator('button').filter({ hasText: /items?|productos/i });

    if (await favoritesTile.isVisible({ timeout: 10000 })) {
      await favoritesTile.click();
    } else if (await categories.count() > 0) {
      await categories.first().click();
    }

    // 6. Add Round 1 (2 products)
    const productCards = page.locator('.product-card');
    await expect(productCards.first()).toBeVisible({ timeout: 10000 });

    await productCards.nth(0).click();
    await productCards.nth(1).click();
    
    // 7. Verify Ticket State
    const sidebar = page.locator('aside');
    await expect(sidebar).toContainText('Ticket 1');
    await expect(sidebar).not.toContainText('Ticket vacío');
    
    // 8. Send Round 1 to Kitchen
    await page.getByRole('button', { name: /Cocina/i }).click();
    
    // Verify success toast and UI state change
    await expect(page.getByText(/Pedido enviado/i)).toBeVisible();
    
    // Current ticket section should be empty, History section should appear
    await expect(page.getByText(/Rondas anteriores/i)).toBeVisible();
    await expect(page.getByText(/Ticket vacío/i)).toBeVisible();
    
    // 9. Add Round 2 (1 product)
    await productCards.nth(2).click();
    
    // Verify "Nueva ronda" separator appears in Sidebar
    await expect(page.getByText(/Nueva ronda/i)).toBeVisible();
    
    // 10. Open Payment Modal
    await page.getByRole('button', { name: /Cobrar Ticket/i }).click();
    
    // Verify Payment Modal structure
    const paymentModal = page.locator('.fixed.inset-0.z-\\[170\\]'); // PaymentModal z-index
    await expect(paymentModal).toBeVisible();
    
    // 11. Process Payment with Cash
    await page.getByRole('button', { name: /Efectivo/i }).click();
    
    // Confirm payment
    await page.getByRole('button', { name: /Confirmar Pago|Pagar/i }).click();
    
    // 12. Final Validation: Success and Reset
    await expect(page.getByText(/Cobro procesado/i)).toBeVisible();
    
    // Sidebar should return to initial empty state for a new order
    await expect(page.getByText(/Rondas anteriores/i)).not.toBeVisible();
    await expect(page.getByText(/Ticket vacío/i)).toBeVisible();
  });

});
