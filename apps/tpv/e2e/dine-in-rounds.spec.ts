import { test, expect, type Page } from '@playwright/test';
import { injectTPVDevice, enterPIN } from '../../../tests/e2e/helpers';

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
    // Inject the TPV device linking configuration to skip setup wizard
    await injectTPVDevice(page);

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

    // Enter PIN and log in using standard E2E helper
    await enterPIN(page, EMPLOYEE_PIN);

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
    
    // 2. Pick a Table (Free or Occupied)
    const tableBtn = page
      .locator('.fixed.inset-0.z-\\[150\\]')
      .getByRole('button')
      .filter({ hasText: /Mesa/i })
      .first();

    await expect(tableBtn).toBeVisible();
    await tableBtn.click();
    
    // 3. Handle Guest Count Modal (Step 2 of Dine-In flow, only appears for Free tables)
    const guestsModalTitle = page.getByRole('heading', { name: /¿Cuántos comensales?/i });
    try {
      await guestsModalTitle.waitFor({ state: 'visible', timeout: 2000 });
      await page.getByRole('button', { name: '2', exact: true }).click();
      await page.getByRole('button', { name: /Empezar orden/i }).click();
    } catch (e) {
      // Guest modal didn't appear (table was occupied/dirty or already has an open order)
    }

    // 4. Verify we are in the Menu/Catalog
    await expect(page).toHaveURL(/\/menu/);

    // 5. Handle Catalog Navigation (Categories vs Products)
    const productCards = page.locator('main button').filter({ hasText: '$' });

    // Wait for product cards to load and be visible
    await expect(productCards.first()).toBeVisible({ timeout: 15000 });
    
    if (await productCards.count() === 0) {
      console.log('No products visible, looking for categories or favorites...');
      const favoritesTile = page.getByRole('button', { name: /Favoritos/i });
      const categoryTiles = page.locator('button').filter({ hasText: /items?/i });

      if (await favoritesTile.isVisible()) {
        await favoritesTile.click();
      } else {
        await categoryTiles.first().waitFor({ state: 'visible', timeout: 10000 });
        await categoryTiles.first().click();
      }
    }

    // Helper to safely click a product and handle its modifier modal if it appears
    async function addProduct(nameRegex: RegExp) {
      await page.getByRole('button', { name: nameRegex }).first().click();
      const agregarBtn = page.getByRole('button', { name: 'Agregar', exact: true });
      try {
        await agregarBtn.waitFor({ state: 'visible', timeout: 1500 });
        await agregarBtn.click();
      } catch (e) {
        // Modal did not open, which means the product was added directly
      }
    }

    // 6. Add Round 1 (2 products)
    await expect(productCards.first()).toBeVisible({ timeout: 15000 });
    console.log(`Selecting products. Count: ${await productCards.count()}`);

    await addProduct(/Burger de Res Clásica/i);
    await addProduct(/Taco Pastor/i);
    
    // 7. Verify Ticket State
    const sidebar = page.locator('aside:not(.border-r)');
    await expect(sidebar).toContainText('ID: 1');
    await expect(sidebar).not.toContainText('Ticket vacío');
    
    // 8. Send Round 1 to Kitchen
    await page.getByRole('button', { name: /Guardar Orden/i }).click();
    
    // Verify success toast and UI state change
    await expect(page.getByText(/Pedido enviado/i)).toBeVisible();
    
    // Current ticket section should be empty, History section should appear
    await expect(page.getByText(/Rondas anteriores/i)).toBeVisible();
    await expect(page.getByText(/Nueva ronda/i)).not.toBeVisible();
    
    // 9. Add Round 2 (1 product)
    await addProduct(/Taco Bisteck/i);
    
    // Verify "Nueva ronda" separator appears in Sidebar
    await expect(page.getByText(/Nueva ronda/i)).toBeVisible();
    
    // 10. Open Payment Modal
    await page.getByRole('button', { name: 'Cobrar', exact: true }).click();
    
    // Verify Payment Modal structure
    const paymentModal = page.locator('.fixed.inset-0.z-\\[100\\]'); // PaymentModal z-index
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
