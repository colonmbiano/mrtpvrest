import { test, expect } from '@playwright/test';
import { injectTPVDevice, enterPIN } from './helpers';

/**
 * 07 — Meseros v2: mesa → ronda 1 → ronda 2 → pedir cuenta.
 *
 * Cubre el criterio de aceptación de Fase 3 del plan Meseros v2: una mesa
 * con cuenta abierta acumula rondas en UNA sola orden (OrderRound) y el
 * mesero puede pedir la cuenta desde su pantalla.
 *
 * Depende del seed:
 *   - Empleado "E2E Mesero" (WAITER, PIN $WAITER_PIN / 1111).
 *   - Mesas "Mesa 1"/"Mesa 2" y menú "E2E Burger" ($100) / "E2E Postre" ($50)
 *     sin variantes (alta directa, sin configurador).
 *   - CashShift abierto (requireActiveShift gatea POST /api/orders/tpv).
 */

const TPV_URL = process.env.TPV_URL ?? 'http://localhost:3005';
const WAITER_PIN = process.env.WAITER_PIN ?? '1111';

test.describe('Meseros — rondas y cuenta', () => {
  test.beforeEach(async ({ page }) => {
    await injectTPVDevice(page);
    await page.goto(TPV_URL);
    await enterPIN(page, WAITER_PIN);
    // Pre-compila la ruta dinámica /meseros/[id] (placeholder "_" de
    // generateStaticParams). En `next dev` el primer hit la compila
    // on-demand (~7s); sin este warm-up, el tap a una mesa real corría
    // contra esa compilación y a veces excedía el timeout del click
    // (flake). Un goto usa el timeout de navegación (30s), no el del click.
    await page.goto(`${TPV_URL}/meseros/_/`);
    // El WAITER puede aterrizar en / (modo préstamo) o en /meseros según
    // deviceRole; navegamos explícito a la sala para no depender de eso.
    await page.goto(`${TPV_URL}/meseros`);
    await expect(page.getByText(/gestión de salón/i)).toBeVisible({ timeout: 15_000 });
  });

  test('mesa libre → 2 rondas en una sola cuenta → pedir cuenta', async ({ page }) => {
    test.setTimeout(120_000);

    // 1. Tomar una mesa LIBRE de la grilla (tiles = links a /meseros/[id];
    //    la nav inferior queda fuera de <main>).
    const freeTile = page
      .locator('main a[href^="/meseros/"]')
      .filter({ hasText: /libre/i })
      .first();
    await expect(freeTile).toBeVisible({ timeout: 15_000 });
    await freeTile.click();

    // 2. Detalle de mesa sin cuenta → abrir comanda.
    await page.getByRole('button', { name: /abrir comanda/i }).click({ timeout: 15_000 });

    // 3. RONDA 1: agregar burger y enviar a cocina.
    await page.getByRole('button', { name: /E2E Burger/i }).first().click({ timeout: 15_000 });
    await page.getByRole('button', { name: /enviar a cocina/i }).click();
    await expect(page.getByText(/comanda enviada a cocina/i)).toBeVisible({ timeout: 15_000 });

    // 4. De regreso en el detalle: la mesa quedó OCUPADA con la cuenta
    //    abierta (la orden es OPEN con ronda 1 — el bug de orderType la
    //    dejaba como TAKEOUT y la mesa seguía libre).
    await expect(page.getByText(/ocupada/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/cuenta acumulada/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('$100').first()).toBeVisible();

    // 5. RONDA 2: agregar postre a la MISMA cuenta.
    await page.getByRole('button', { name: /agregar más productos/i }).click();
    await expect(page.getByText(/esta ronda se sumará/i)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /E2E Postre/i }).first().click({ timeout: 15_000 });
    await page.getByRole('button', { name: /agregar a la mesa/i }).click();
    await expect(page.getByText(/ronda agregada/i)).toBeVisible({ timeout: 15_000 });

    // 6. El detalle muestra UNA cuenta con las 2 rondas y el total sumado.
    await expect(page.getByText(/ronda 1/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/ronda 2/i)).toBeVisible();
    await expect(page.getByText('$150').first()).toBeVisible();

    // 7. Pedir cuenta — queda marcada como solicitada (la imprime caja;
    //    el cobro es del TPV principal, fuera de este flujo).
    await page.getByRole('button', { name: /pedir cuenta/i }).click();
    await expect(page.getByRole('button', { name: /cuenta solicitada/i })).toBeVisible({ timeout: 15_000 });
  });
});
