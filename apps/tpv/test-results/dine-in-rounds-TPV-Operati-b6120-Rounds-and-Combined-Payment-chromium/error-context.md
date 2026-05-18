# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dine-in-rounds.spec.ts >> TPV Operational Flows >> Dine-In: Multiple Rounds and Combined Payment
- Location: apps\tpv\e2e\dine-in-rounds.spec.ts:75:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('aside')
Expected substring: "Ticket 1"
Error: strict mode violation: locator('aside') resolved to 2 elements:
    1) <aside class="hidden md:flex w-20 flex-col items-center py-8 gap-10 shrink-0 relative z-30 bg-[#0a0a0c] border-r border-white/5">…</aside> aka getByRole('complementary').filter({ hasText: /^E$/ })
    2) <aside class="w-full md:shrink-0 border-l border-white/5 bg-[#0a0a0c] flex flex-col h-full min-h-0 relative z-20">…</aside> aka getByText('Ticket 1·Mesa 1Orden en')

Call log:
  - Expect "toContainText" with timeout 5000ms
  - waiting for locator('aside')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - button "Ir al panel de ventas" [ref=e5] [cursor=pointer]:
        - img [ref=e6]
      - navigation [ref=e12]:
        - button "Ventas" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
        - button "Abiertos" [ref=e18] [cursor=pointer]:
          - img [ref=e19]
        - button "Repartidores" [ref=e22] [cursor=pointer]:
          - img [ref=e23]
        - button "Sucursal" [ref=e28] [cursor=pointer]:
          - img [ref=e29]
        - button "Cierre" [ref=e34] [cursor=pointer]:
          - img [ref=e35]
        - button "Gastos" [ref=e37] [cursor=pointer]:
          - img [ref=e38]
      - generic [ref=e41]:
        - button "Notificaciones" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
        - button "E" [ref=e48] [cursor=pointer]
    - generic [ref=e49]:
      - banner [ref=e50]:
        - generic [ref=e51]:
          - heading "Master Burguer's" [level=1] [ref=e52]
          - generic [ref=e53]: PRINCIPAL
        - generic [ref=e54]:
          - img [ref=e55]
          - textbox "Buscar platillo o categoría..." [ref=e58]
        - generic [ref=e59]:
          - generic [ref=e60] [cursor=pointer]:
            - generic [ref=e61]: Eduardo gutierrez
            - generic [ref=e62]: TURNO ACTIVO
          - button "Abrir configuración" [ref=e63] [cursor=pointer]: E
      - main [ref=e64]:
        - generic [ref=e65]:
          - generic [ref=e67]:
            - button "En Mesa" [ref=e68] [cursor=pointer]:
              - img [ref=e69]
              - generic [ref=e72]: En Mesa
            - button "Para Llevar" [ref=e73] [cursor=pointer]:
              - img [ref=e74]
              - generic [ref=e77]: Para Llevar
            - button "Domicilio" [ref=e78] [cursor=pointer]:
              - img [ref=e79]
              - generic [ref=e84]: Domicilio
          - generic [ref=e85]:
            - generic [ref=e86]:
              - img [ref=e87]
              - text: Comensal
            - button "1 2" [ref=e92] [cursor=pointer]:
              - generic [ref=e93]: "1"
              - generic [ref=e94]: "2"
            - button "2" [ref=e95] [cursor=pointer]:
              - generic [ref=e96]: "2"
            - button "Compartido" [ref=e97] [cursor=pointer]:
              - img [ref=e98]
              - generic [ref=e104]: Compartido
          - generic [ref=e106]:
            - generic [ref=e107]:
              - img
              - textbox "Buscar producto..." [ref=e108]
            - button "Ajustes de vista del catálogo" [ref=e109] [cursor=pointer]:
              - img [ref=e110]
          - generic [ref=e113]:
            - button "Volver a categorías" [ref=e114] [cursor=pointer]:
              - img [ref=e115]
              - text: Volver
            - heading "Las angus" [level=2] [ref=e117]
          - generic [ref=e119]:
            - button "Hamburguesa Angus 150gr $105" [ref=e120] [cursor=pointer]:
              - generic [ref=e122]:
                - generic [ref=e123]: Hamburguesa Angus 150gr
                - generic [ref=e125]: $105
              - img [ref=e127]
            - button "Hamburguesa Angus 250gr $135" [active] [ref=e128] [cursor=pointer]:
              - generic [ref=e130]:
                - generic [ref=e131]: Hamburguesa Angus 250gr
                - generic [ref=e133]: $135
              - img [ref=e135]
    - complementary [ref=e137]:
      - generic [ref=e139]:
        - generic [ref=e140]:
          - button "Ticket 1 · Mesa 1" [ref=e141] [cursor=pointer]:
            - generic [ref=e142]: Ticket 1
            - generic [ref=e143]: ·
            - generic [ref=e144]: Mesa 1
          - button "Cambiar mesa" [ref=e145] [cursor=pointer]:
            - img [ref=e146]
        - button [ref=e150] [cursor=pointer]:
          - img [ref=e151]
      - generic [ref=e152]:
        - generic [ref=e153]:
          - heading "Orden en curso" [level=2] [ref=e154]
          - generic [ref=e155]: "ID: 1"
        - generic [ref=e156]:
          - generic [ref=e157]:
            - img [ref=e158]
            - generic [ref=e161]: Mesa 1
            - generic [ref=e162]: · 2 comensales
          - button "Limpiar ticket" [ref=e163] [cursor=pointer]:
            - img [ref=e164]
      - generic [ref=e167]:
        - generic [ref=e168]:
          - generic [ref=e169]:
            - button [ref=e170] [cursor=pointer]:
              - img [ref=e171]
            - generic [ref=e172]: "1"
            - button [ref=e173] [cursor=pointer]:
              - img [ref=e174]
          - generic [ref=e175]:
            - generic [ref=e177]: Hamburguesa Angus 150gr
            - button "Agregar nota" [ref=e178] [cursor=pointer]:
              - img [ref=e179]
              - generic [ref=e181]: Agregar nota
            - generic [ref=e182]:
              - generic [ref=e183]: $105.00 / u.
              - generic [ref=e184]: $105.00
        - generic [ref=e185]:
          - generic [ref=e186]:
            - button [ref=e187] [cursor=pointer]:
              - img [ref=e188]
            - generic [ref=e189]: "1"
            - button [ref=e190] [cursor=pointer]:
              - img [ref=e191]
          - generic [ref=e192]:
            - generic [ref=e194]: Hamburguesa Angus 250gr
            - button "Agregar nota" [ref=e195] [cursor=pointer]:
              - img [ref=e196]
              - generic [ref=e198]: Agregar nota
            - generic [ref=e199]:
              - generic [ref=e200]: $135.00 / u.
              - generic [ref=e201]: $135.00
      - generic [ref=e203]:
        - button "Cobrar Ticket" [ref=e204] [cursor=pointer]
        - generic [ref=e205]:
          - button "Cocina" [ref=e206] [cursor=pointer]:
            - img [ref=e207]
            - text: Cocina
          - button "% Descuento" [ref=e212] [cursor=pointer]:
            - generic [ref=e213]: "%"
            - text: Descuento
          - button "Cerrar" [ref=e214] [cursor=pointer]:
            - img [ref=e215]
            - text: Cerrar
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e223] [cursor=pointer]:
    - img [ref=e224]
  - alert [ref=e227]
```

# Test source

```ts
  25  |   async function handleInitialSetup(page: Page) {
  26  |     const setupTitle = page.getByRole('heading', { name: 'Configuración Inicial' });
  27  |     if (await setupTitle.isVisible()) {
  28  |       console.log('Detected Initial Setup screen. Configuring...');
  29  |       await page.getByLabel('Correo Electrónico').fill(ADMIN_EMAIL);
  30  |       await page.getByLabel('Contraseña').fill(ADMIN_PASSWORD);
  31  |       await page.getByRole('button', { name: 'Continuar' }).click();
  32  |       
  33  |       await expect(page.getByRole('heading', { name: 'Seleccionar Sucursal' })).toBeVisible({ timeout: 15000 });
  34  |       await page.locator('select').selectOption({ index: 0 });
  35  |       await page.getByRole('button', { name: 'Continuar' }).click();
  36  |       
  37  |       await expect(page.getByText('¿Qué será este dispositivo?')).toBeVisible({ timeout: 10000 });
  38  |       await page.getByRole('button', { name: /Caja Principal/ }).click();
  39  |       await page.getByRole('button', { name: /Vincular como/ }).click();
  40  |       
  41  |       await expect(page).toHaveURL(/\/locked/, { timeout: 20000 });
  42  |     }
  43  |   }
  44  | 
  45  |   test.beforeEach(async ({ page }) => {
  46  |     // Navigate to Lock Screen
  47  |     await page.goto('/locked');
  48  |     
  49  |     // Check for Setup Redirect
  50  |     if (page.url().includes('/setup')) {
  51  |       await handleInitialSetup(page);
  52  |     }
  53  | 
  54  |     // Ensure we are on the PIN screen
  55  |     if (!page.url().includes('/locked')) {
  56  |         await page.goto('/locked');
  57  |     }
  58  | 
  59  |     // Enter PIN Digit by Digit
  60  |     await page.waitForSelector('button:has-text("1")');
  61  |     for (const digit of EMPLOYEE_PIN) {
  62  |       await page.getByRole('button', { name: digit, exact: true }).click();
  63  |     }
  64  |     
  65  |     // Verify Successful Login to Hub
  66  |     await expect(page).toHaveURL(/\/hub/);
  67  | 
  68  |     // Handle Workspace Selection if present
  69  |     const workspaceButton = page.getByRole('button', { name: /Seleccionar/i });
  70  |     if (await workspaceButton.isVisible()) {
  71  |       await workspaceButton.click();
  72  |     }
  73  |   });
  74  | 
  75  |   test('Dine-In: Multiple Rounds and Combined Payment', async ({ page }) => {
  76  |     // 1. Select "Comer Aquí" (Dine-In) from Hub
  77  |     await page.getByRole('button', { name: /Comer Aquí/i }).click();
  78  |     await expect(page).toHaveURL(/\/order-type/);
  79  |     
  80  |     // 2. Pick a Free Table
  81  |     const freeTable = page
  82  |       .getByRole('button', { name: /Mesa/i })
  83  |       .filter({ hasNotText: '+ RONDA' })
  84  |       .first();
  85  | 
  86  |     await expect(freeTable).toBeVisible();
  87  |     await freeTable.click();
  88  |     
  89  |     // 3. Handle Guest Count Modal (Step 2 of Dine-In flow)
  90  |     const guestsModalTitle = page.getByRole('heading', { name: /¿Cuántos comensales?/i });
  91  |     if (await guestsModalTitle.isVisible()) {
  92  |       await page.getByRole('button', { name: '2', exact: true }).click();
  93  |       await page.getByRole('button', { name: /Empezar orden/i }).click();
  94  |     }
  95  |     
  96  |     // 4. Verify we are in the Menu/Catalog
  97  |     await expect(page).toHaveURL(/\/menu/);
  98  | 
  99  |     // 5. Handle Catalog Navigation (Categories vs Products)
  100 |     // If no products are visible, we must click a category or favorites
  101 |     const productCards = page.locator('.product-card');
  102 |     
  103 |     if (await productCards.count() === 0) {
  104 |       console.log('No products visible, looking for categories or favorites...');
  105 |       const favoritesTile = page.getByRole('button', { name: /Favoritos/i });
  106 |       const categoryTiles = page.locator('button').filter({ hasText: /items?/i });
  107 | 
  108 |       if (await favoritesTile.isVisible()) {
  109 |         await favoritesTile.click();
  110 |       } else {
  111 |         await categoryTiles.first().waitFor({ state: 'visible', timeout: 10000 });
  112 |         await categoryTiles.first().click();
  113 |       }
  114 |     }
  115 | 
  116 |     // 6. Add Round 1 (2 products)
  117 |     await expect(productCards.first()).toBeVisible({ timeout: 15000 });
  118 |     console.log(`Selecting products. Count: ${await productCards.count()}`);
  119 | 
  120 |     await productCards.nth(0).click();
  121 |     await productCards.nth(1).click();
  122 |     
  123 |     // 7. Verify Ticket State
  124 |     const sidebar = page.locator('aside');
> 125 |     await expect(sidebar).toContainText('Ticket 1');
      |                           ^ Error: expect(locator).toContainText(expected) failed
  126 |     await expect(sidebar).not.toContainText('Ticket vacío');
  127 |     
  128 |     // 8. Send Round 1 to Kitchen
  129 |     await page.getByRole('button', { name: /Cocina/i }).click();
  130 |     
  131 |     // Verify success toast and UI state change
  132 |     await expect(page.getByText(/Pedido enviado/i)).toBeVisible();
  133 |     
  134 |     // Current ticket section should be empty, History section should appear
  135 |     await expect(page.getByText(/Rondas anteriores/i)).toBeVisible();
  136 |     await expect(page.getByText(/Ticket vacío/i)).toBeVisible();
  137 |     
  138 |     // 9. Add Round 2 (1 product)
  139 |     await productCards.nth(2).click();
  140 |     
  141 |     // Verify "Nueva ronda" separator appears in Sidebar
  142 |     await expect(page.getByText(/Nueva ronda/i)).toBeVisible();
  143 |     
  144 |     // 10. Open Payment Modal
  145 |     await page.getByRole('button', { name: /Cobrar Ticket/i }).click();
  146 |     
  147 |     // Verify Payment Modal structure
  148 |     const paymentModal = page.locator('.fixed.inset-0.z-\\[170\\]'); // PaymentModal z-index
  149 |     await expect(paymentModal).toBeVisible();
  150 |     
  151 |     // 11. Process Payment with Cash
  152 |     await page.getByRole('button', { name: /Efectivo/i }).click();
  153 |     
  154 |     // Confirm payment
  155 |     await page.getByRole('button', { name: /Confirmar Pago|Pagar/i }).click();
  156 |     
  157 |     // 12. Final Validation: Success and Reset
  158 |     await expect(page.getByText(/Cobro procesado/i)).toBeVisible();
  159 |     
  160 |     // Sidebar should return to initial empty state for a new order
  161 |     await expect(page.getByText(/Rondas anteriores/i)).not.toBeVisible();
  162 |     await expect(page.getByText(/Ticket vacío/i)).toBeVisible();
  163 |   });
  164 | 
  165 | });
  166 | 
```