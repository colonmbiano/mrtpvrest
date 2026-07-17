/**
 * Retail multigiro — ferretería, de punta a punta contra el stack real.
 *
 * Maneja la app de caja (apps/moda) en un navegador de verdad, contra el backend
 * y Postgres de verdad. No hay mocks: los precios los resuelve el servidor.
 *
 * Qué prueba y por qué (cada assert cubre algo que se rompe en SILENCIO):
 *
 *  1. El giro llega y des-modiza la UI — si `retailGiro` no viajara en el
 *     catálogo, la app caería a ROPA y pintaría "Talla/Color" en una ferretería.
 *  2. Escaneo por código de barras — era el prerequisito muerto: mapCatalogToProducts
 *     tiraba `barcode` y doScan nunca lo comparaba. Un POS de ferretería sin
 *     escaneo no existe.
 *  3. Cantidad decimal en granel — 2.5 m deben cobrarse como 2.5, no redondeados.
 *  4. Captura por caja — 2 cajas de 100 deben mandar 200 unidades base, no 2 ni
 *     400. Es la conversión que puede duplicarse en silencio.
 *  5. Escalón de mayoreo server-side — esas 200 deben disparar el tier de
 *     minQty 100 y bajar el precio unitario. Como el precio lo pone el backend,
 *     el total del ticket es la prueba de que la cantidad convertida llegó bien.
 *
 * El punto 5 es el que da valor real: el total delata los tres errores posibles
 * de la conversión. Si llegaran 2 → sin tier, $5.00. Si 400 → $720. Solo 200
 * da $360.
 *
 * Datos: apps/backend/scripts/e2e-seed-retail.js (idempotente) deja los ids en
 * .auth/moda.json.
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const MODA_URL = process.env.MODA_URL ?? 'http://localhost:3012';
const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SEED_FILE = path.join(__dirname, '.auth/moda.json');

type Seed = {
  restaurantId: string;
  locationId: string;
  locationName: string;
  restaurantName: string;
  pin: string;
  skus: Record<string, { id: string; sku: string; barcode: string; price: number; tier?: { minQty: number; price: number } }>;
};

function readSeed(): Seed {
  if (!fs.existsSync(SEED_FILE)) {
    throw new Error(
      `Falta ${SEED_FILE}. Corre primero:\n` +
      `  node apps/backend/scripts/e2e-seed-retail.js`,
    );
  }
  return JSON.parse(fs.readFileSync(SEED_FILE, 'utf-8'));
}

/**
 * Vincula la caja a la sucursal del seed y la deja en el PIN pad.
 *
 * Doble navegación (mismo motivo que injectTPVDevice en helpers.ts): con
 * addInitScript no hay garantía de que localStorage esté escrito antes de que
 * el primer fetch del catálogo salga. Se navega una vez para tener origen,
 * se inyecta con evaluate(), y se navega de nuevo ya con todo puesto.
 *
 * `moda-api-url` apunta la app al backend local: getApiUrl() lo respeta y
 * sanitizeApiUrl deja pasar http contra localhost (host privado).
 */
async function linkModaDevice(page: Page, seed: Seed) {
  await page.goto(MODA_URL);
  await page.waitForLoadState('domcontentloaded');

  await page.evaluate(([s, api]) => {
    const seedData = s as Seed;
    localStorage.setItem('moda-api-url', api as string);
    localStorage.setItem('moda-restaurant-id', seedData.restaurantId);
    localStorage.setItem('moda-location-id', seedData.locationId);
    localStorage.setItem('moda-location-name', seedData.locationName);
    localStorage.setItem('moda-restaurant-name', seedData.restaurantName);
    // Sin tickets viejos: el POS los persiste y un carrito previo desviaría los totales.
    localStorage.removeItem('moda-pos-tickets');
    // OJO: NO se siembra 'moda-giro'. Debe llegar del backend con el catálogo;
    // si lo pusiéramos a mano, el test pasaría aunque el backend no lo mandara.
    localStorage.removeItem('moda-giro');
  }, [seed, API_URL] as const);

  await page.goto(MODA_URL);
}

/** Teclea el PIN y entra. El pad no auto-envía: hay botón "Entrar". */
async function loginPin(page: Page, pin: string) {
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeVisible({ timeout: 20_000 });
  for (const d of pin) {
    await page.getByRole('button', { name: d, exact: true }).click({ delay: 60 });
  }
  await page.getByRole('button', { name: 'Entrar' }).click();
  // Al entrar carga el catálogo y aparece la pantalla de venta.
  await expect(page.getByPlaceholder(/Escanea o escribe/i)).toBeVisible({ timeout: 20_000 });
}

/** Escanea un código y espera a que la línea entre al carrito. */
async function scan(page: Page, code: string) {
  const input = page.getByPlaceholder(/Escanea o escribe/i);
  await input.fill(code);
  await input.press('Enter');
}

/** Total que pinta el POS, como número. */
async function readTotal(page: Page): Promise<number> {
  const raw = await page.getByTestId('sale-total').innerText();
  return Number(raw.replace(/[^0-9.-]/g, ''));
}

/**
 * Cobra la venta completa en efectivo.
 *
 * El checkout arranca con `lines` vacío ⇒ remaining = total ⇒ el botón de
 * cobrar queda con pointer-events-none. Hay que "Agregar pago" primero: con el
 * monto vacío aplica el restante completo.
 */
async function cobrarEnEfectivo(page: Page) {
  await page.getByRole('button', { name: /^Cobrar/i }).click();
  await page.getByRole('button', { name: /Agregar pago/i }).click();
  // Ya con remaining=0 el botón se activa y su texto pasa a "Cobrar $X".
  await page.getByRole('button', { name: /^Cobrar \$/i }).click();
  await expect(page.getByTestId('sale-success-total')).toBeVisible({ timeout: 25_000 });
}

test.describe('Retail multigiro · ferretería', () => {
  test.beforeEach(async ({ page }) => {
    const seed = readSeed();
    await linkModaDevice(page, seed);
    await loginPin(page, seed.pin);
  });

  test('el giro llega del backend y des-modiza la UI', async ({ page }) => {
    // Los encabezados del carrito son la señal más barata de que el giro mandó:
    // en ROPA dirían "Talla" y "Color"; en ferretería, "Medida" y "Presentación".
    await expect(page.getByText('Medida', { exact: true })).toBeVisible();
    await expect(page.getByText('Presentación', { exact: true })).toBeVisible();
    await expect(page.getByText('Talla', { exact: true })).toHaveCount(0);
  });

  test('escanear por código de barras agrega el artículo correcto', async ({ page }) => {
    const seed = readSeed();
    await scan(page, seed.skus.pieza.barcode);

    // El SKU en la línea prueba que resolvió por barcode y no por otra cosa.
    await expect(page.getByText(seed.skus.pieza.sku)).toBeVisible({ timeout: 10_000 });
    expect(await readTotal(page)).toBeCloseTo(seed.skus.pieza.price, 2);
  });

  test('granel: cobra 2.5 metros como 2.5, no redondeado', async ({ page }) => {
    const seed = readSeed();
    await scan(page, seed.skus.granel.barcode);
    await expect(page.getByText(seed.skus.granel.sku)).toBeVisible({ timeout: 10_000 });

    // En unidad MTS el carrito da input libre en vez del stepper de ±1.
    const qty = page.getByTestId('cart-qty-input').first();
    await qty.fill('2.5');
    await qty.blur();

    // 2.5 × 18.50 = 46.25. Si redondeara a 3 daría 55.50.
    expect(await readTotal(page)).toBeCloseTo(2.5 * seed.skus.granel.price, 2);
  });

  test('por caja: 2 cajas de 100 mandan 200 y disparan el mayoreo', async ({ page }) => {
    const seed = readSeed();
    const caja = seed.skus.caja;
    await scan(page, caja.barcode);
    await expect(page.getByText(caja.sku)).toBeVisible({ timeout: 10_000 });

    // Cambiar a captura por caja no altera la cantidad real (sigue en 1 pza).
    await page.getByTestId('cart-package-toggle').first().click();

    const qty = page.getByTestId('cart-qty-input').first();
    await qty.fill('2');
    await qty.blur();

    // El POS pinta el precio de lista (no conoce los tiers): 200 × 2.50 = 500.
    // El backend es quien aplica el escalón — se verifica abajo con el cobro.
    expect(await readTotal(page)).toBeCloseTo(200 * caja.price, 2);

    // Cobro: aquí manda el servidor.
    await cobrarEnEfectivo(page);

    // 200 ≥ minQty 100 ⇒ unitario 1.80 ⇒ 200 × 1.80 = 360.
    // Si la conversión no ocurriera (2 pza) no habría tier: $5.00.
    // Si se duplicara (400 pza) daría $720. Solo 200 da 360.
    const esperado = 200 * caja.tier!.price;
    await expect(page.getByTestId('sale-success-total')).toContainText(esperado.toFixed(2));
  });

  test('el backend descuenta el stock con la cantidad decimal', async ({ page, request }) => {
    const seed = readSeed();
    const before = await request.get(`${API_URL}/api/retail/v1/stock?locationId=${seed.locationId}`, {
      headers: { 'x-restaurant-id': seed.restaurantId },
    });
    expect(before.ok()).toBeTruthy();

    await scan(page, seed.skus.granel.barcode);
    await expect(page.getByText(seed.skus.granel.sku)).toBeVisible({ timeout: 10_000 });
    const qty = page.getByTestId('cart-qty-input').first();
    await qty.fill('2.5');
    await qty.blur();
    await cobrarEnEfectivo(page);

    const after = await request.get(`${API_URL}/api/retail/v1/stock?locationId=${seed.locationId}`, {
      headers: { 'x-restaurant-id': seed.restaurantId },
    });
    const rows = (await after.json()) as Array<{ skuId: string; qty: string | number }>;
    const row = rows.find((r) => r.skuId === seed.skus.granel.id);
    const prev = ((await before.json()) as Array<{ skuId: string; qty: string | number }>)
      .find((r) => r.skuId === seed.skus.granel.id);

    // El descuento debe ser exactamente 2.5, no 2 ni 3.
    expect(Number(prev!.qty) - Number(row!.qty)).toBeCloseTo(2.5, 3);
  });
});
