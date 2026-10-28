import { expect, test } from '@playwright/test';

const tableToken = 'dGFibGUtdGVzdC43.test-signature';

test.beforeEach(async ({ page }) => {
  await page.goto(`/demo/mesa?t=${tableToken}&l=loc-test`);
  await expect(page.getByRole('heading', { name: 'Elige y pide desde tu mesa' })).toBeVisible();
});

test('categorías y búsqueda global por nombre, descripción y acentos', async ({ page }) => {
  const nav = page.getByRole('navigation', { name: 'Categorías del menú' });
  await expect(nav.getByRole('button', { name: 'Sin productos' })).toHaveCount(0);
  await nav.getByRole('button', { name: 'Bebidas', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Limonada', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hamburguesa clásica', exact: true })).toHaveCount(0);
  const search = page.getByRole('searchbox');
  await search.fill('clasica');
  await expect(page.getByRole('heading', { name: 'Hamburguesa clásica', exact: true })).toBeVisible();
  await search.fill('limon mineral');
  await expect(page.getByRole('heading', { name: 'Limonada', exact: true })).toBeVisible();
  await search.fill('postres');
  await expect(page.getByRole('heading', { name: 'Pastel de chocolate', exact: true })).toBeVisible();
  await search.fill('xyz-sin-resultados');
  await page.getByRole('button', { name: 'Ver todo el menú' }).click();
  await expect(search).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Hamburguesa clásica', exact: true })).toBeVisible();
});

test('agregar y quitar desde el menú y revisar sin pantalla intermedia', async ({ page }) => {
  await page.getByRole('button', { name: 'Agregar Hamburguesa clásica', exact: true }).click();
  await page.getByRole('button', { name: 'Agregar Hamburguesa clásica', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('2 productos en tu pedido. Subtotal $190.');
  await page.getByRole('button', { name: 'Quitar uno de Hamburguesa clásica', exact: true }).click();
  await page.getByRole('button', { name: /Revisar pedido/ }).click();
  await expect(page.getByRole('heading', { name: 'Confirma tu pedido' })).toBeVisible();
  await expect(page.getByPlaceholder('Dirección de entrega')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '🔗 Compartir mi pedido' })).toHaveCount(0);
  await expect(page.getByLabel('Tu teléfono', { exact: true })).toBeHidden();
  await page.getByText('Teléfono y correo (opcional)', { exact: true }).click();
  await expect(page.getByLabel('Tu teléfono', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Quitar uno de Hamburguesa clásica', exact: true }).last().click();
  await expect(page.getByText('Tu carrito está vacío')).toBeVisible();
});

test('las opciones requeridas no se omiten y las notas se conservan', async ({ page }) => {
  await page.getByRole('button', { name: 'Elegir opciones de Hamburguesa a tu gusto' }).click();
  await page.getByRole('button', { name: /^Agregar ·/ }).click();
  await expect(page.getByText('Selecciona una opción en "Término".')).toBeVisible();
  await page.getByRole('button', { name: /Bien cocida/ }).click();
  await page.getByPlaceholder(/sin cebolla/i).fill('Sin sal');
  await page.getByRole('button', { name: /^Agregar ·/ }).click();
  await page.getByRole('button', { name: /Editar 1 de Hamburguesa a tu gusto/ }).click();
  await expect(page.getByText('Nota: Sin sal')).toBeVisible();
  await page.getByRole('button', { name: /Agregar uno de Hamburguesa a tu gusto/ }).click();
  await expect(page.getByText('Nota: Sin sal')).toBeVisible();
});

test('confirmación envía mesa, sucursal y combo sin cambiar la preparación', async ({ page }) => {
  await page.getByRole('button', { name: 'Elegir opciones de Combo de hamburguesa' }).click();
  await page.getByRole('button', { name: /Refresco/ }).click();
  await page.getByPlaceholder(/sin cebolla/i).fill('Sin hielo');
  await page.getByRole('button', { name: /^Agregar ·/ }).click();
  await page.getByRole('button', { name: /Revisar pedido/ }).click();
  await page.getByRole('button', { name: /Agregar uno de Combo/ }).click();
  await page.getByLabel('Tu nombre para identificar el pedido').fill('Ana');
  let submitted: Record<string, any> | undefined;
  await page.route('**/api/store/orders?*', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ json: { id: 'order-test', orderNumber: 'TEST-001', status: 'PENDING' } });
  });
  await page.getByRole('button', { name: /ENVIAR A COCINA/ }).click();
  await expect(page.getByRole('heading', { name: '¡Pedido enviado!' })).toBeVisible();
  expect(submitted).toMatchObject({ customerName: 'Ana', orderType: 'DINE_IN', tableToken, locationId: 'loc-test', items: [
    { menuItemId: 'combo', quantity: 2, notes: 'Sin hielo', comboSelections: [{ componentId: 'drink-choice', optionId: 'cola-option' }] },
  ] });
  await page.getByRole('button', { name: 'Listo' }).click();
  await expect(page.getByRole('status')).toHaveText('0 productos en tu pedido. Subtotal $0.');
});

test('controles utilizables y sin desbordamiento en celular estrecho', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('menu.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('button', { name: 'Agregar Hamburguesa clásica', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const plus = await page.getByRole('button', { name: 'Agregar Hamburguesa clásica', exact: true }).boundingBox();
  expect(plus?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: /Revisar pedido/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: /ENVIAR A COCINA/ })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('confirmacion-320.png') });
});
