# Plan de cierre de brechas — Auditoría Tienda Online MRTPVREST

> Documento maestro ejecutable. Cada feature ya incorpora las correcciones de la verificación adversarial: donde el revisor encontró una falla, el plan final ya refleja el fix. **Push directo a `master` permitido**; **migraciones a prod son MANUALES** (`prisma migrate deploy` coordinado con el deploy del backend — Railway solo corre `prisma generate`).

---

## 1. Resumen ejecutivo

**Score de auditoría: 75/100** — 24 dimensiones evaluadas:

- **15 Listo** — la tubería existe end-to-end (totales server-side, cancelación que repone inventario, webhooks idempotentes, impresión LAN, snapshots inmutables de modificadores, notas de cocina backend, canal por `orderType`, etc.).
- **6 Parcial** — existe la base pero falta exponerla o desacoplarla (combo como texto en `description`, `availableOnline` que conflaciona web+kiosk, reportes solo por nombre de producto, ausencia de validación de stock preventiva, sin estado de empaque, sin checklist).
- **3 No existe** — combos configurables reales, máquina de estados de orden con guardrails, reportes por dimensión (variante/extra/combo/canal).

**Hallazgos críticos verificados en código** que el plan ataca:

1. **Cliente sin nota a cocina ni "quitar ingrediente"** en el `ProductModal` del storefront, aunque el backend ya persiste `OrderItem.notes` y procesa modificadores `priceAdd=0`.
2. **Un extra agotado se puede pedir**: `Modifier` no tiene `isAvailable`; no hay forma de apagar "Tocino" sin borrarlo.
3. **Oversell silencioso**: `discountInventory` corre **fuera** de la `$transaction`, con `try/catch` que se traga errores y decremento sin guard de negativos; `store.routes` ni siquiera descuenta.
4. **Combo = texto en `description`**: no hay estructura, el cliente no elige principal/guarnición/bebida, la comanda no desglosa por estación.
5. **`PUT /:id/status` es cambio libre** sin máquina de estados.
6. **Reportes solo por nombre de producto** (`groupBy(['name'])`), sin variante/extra/combo/canal (este último ya existe parcial y sin consumir en UI).

**Principio transversal validado en los 11 diseños:** ninguna feature viola las reglas duras de `CLAUDE.md` (tenancy/`SCOPED_MODELS`, migración manual sin `db push`, totales server-side, anti mass-assignment, sockets desde BD, sin `@db.Money`/`Float` nuevos). Las correcciones del verdict son de **correctness/feasibility/grounding**, no de reglas duras — salvo el caso de stock (regresión silenciosa) y combos (FK que rompía wipe-all), que **ya están corregidos abajo**.

---

## 2. Quick Wins (~24 h, bajo riesgo) — `verdict: ok`

Bundle de 3 mejoras storefront/cocina. Cero schema, cero migración. Backend opcional mínimo.

### QW1 — Desglose de combo a la comanda
- **Objetivo:** que la comanda de cocina imprima el desglose del combo en vez de texto fijo.
- **Estado:** ya implementado end-to-end (`printer-tcp.ts:927-931` imprime `(kitchenDetail)`; `comboKitchenDetail()` solo puebla para `isPromo`; tests en `printer-tcp.test.ts:231-282`). **Solo está apagado** por `TicketConfig.kitchenShowItemDescription` (`@default(false)`).
- **Cómo encenderlo (sin migración de default ni backfill):**
  - **Recomendado:** UPDATE puntual a `TicketConfig.kitchenShowItemDescription=true` por tenant que lo quiera + dejarlo como recomendación en `/admin/tickets` (toggle ya existe en `TicketFormatTab.tsx:324`).
  - **Opcional (sucursales nuevas ON):** agregar `kitchenShowItemDescription: true` al `ticketConfig.create(...)` de auto-creación (`printers.routes.js:50-57`). **Nota corregida:** el auto-create es **lazy** (solo en `GET /ticket-config`), así que "nacen encendidas" aplica tras el primer read (el TPV hace ese GET al arrancar; si se quiere incondicional, crear la fila en el alta de la sucursal).
- **Riesgo:** NO cambiar el `@default(false)` de la columna (evita migración de default + backfill que ensuciaría comandas de tenants que usan `description` como texto largo).

### QW2 — Chip "Abierto · ~X min" en el header del storefront
- **Objetivo:** indicador persistente de estado/tiempo de entrega en `apps/client`.
- **100% frontend.** `GET /api/store/info` ya devuelve `isOpen/nextOpen/estimatedDelivery`.
- **Cambios (`MochiTheme.tsx` + paridad `MundialistaTheme.tsx`):**
  - Ampliar el `type Info` con `isOpen?: boolean` (por consistencia del payload; **nota:** `Header` está tipado como `any`, así que no fuerza `tsc` — la rama "Cerrado" es hardening no alcanzable porque `page.tsx:206` corta en `isOpen===false` antes de montar el tema).
  - Renderizar chip pill verde "Abierto" + (`estimatedDelivery ? · ~${estimatedDelivery} min`).
  - **Corrección obligatoria:** condicionar el sufijo `~X min` a `orderMode==='DELIVERY'` (es tiempo de **entrega**, no aplica en Recoger/TAKEOUT).
- **Paridad:** aplicar a **ambos** temas activos (Mochi ~85 tenants + Mundialista) en el mismo PR.

### QW3 — "Desde $X" en cards de productos con variantes
- **Objetivo:** mostrar el precio mínimo real (variante más barata) en vez del `price` base (a menudo 0/placeholder).
- **100% frontend.** `/menu` ya entrega `variants:[{id,name,price}]` ordenadas asc → `vmin = p.variants[0].price`.
- **Cambios (`ProductCard` de Mochi y Mundialista):** mostrar `Desde {fmt(vmin)}` cuando hay variantes; prefijo pequeño "Desde". **Guard:** filtrar variantes con `price>0` antes del `Math.min` (cae a `price` si min==0) para evitar "Desde $0".
- **Corrección obligatoria (efecto colateral de carrito):** el stepper `+` de la card reincrementa con `p.price` (base, a veces $0) — al hacer "Desde $X" visible, ese desajuste card-vs-carrito se nota más. **Fix:** ocultar el stepper `+/-` en la card para productos con `needsModal(p)` (forzar que toda reincorporación pase por el modal, que sí fija `variants[].price`). No hay fuga de dinero (backend recalcula con `computeOrderTotals`), pero es UX que QW3 amplifica.

**Tests QW:** unit de `fromMinVariantPrice(p)` (QW3); render de `Header` con/sin `estimatedDelivery` (QW2); reusar tests de impresión existentes (QW1) + manual APK de una comanda de combo. **Esfuerzo:** M (real ~24 h con paridad de temas).

---

## 3. Fase A — Personalización

Cuatro features que dan al cliente control real sobre su pedido. Dos requieren migración aditiva trivial; dos son cero-schema.

### A.1 — Quitar ingredientes ("SIN X" gratis) — `verdict: needs-fix → corregido`

- **Objetivo:** modificadores "SIN cebolla" gratuitos sin duplicar productos.
- **Decisión:** convención de `ModifierGroup` "Quitar" con `Modifier.priceAdd=0` + un **único flag cosmético** `ModifierGroup.groupType String @default("ADD")` (valores `"ADD"|"REMOVE"`). NO se toca `Modifier`/`OrderItemModifier` ni el camino de dinero/inventario.

- **Schema + migración:**
  - `ModifierGroup.groupType String @default("ADD")`. Migración `add_modifier_group_type`: `ALTER TABLE "modifier_groups" ADD COLUMN "groupType" TEXT NOT NULL DEFAULT 'ADD';`
  - String libre (no enum Prisma, consistente con `saleUnit`/`storefrontTheme`). `migrate dev` → `migrate deploy` MANUAL. **No re-tocar el `.sql` tras generarlo** (checksum = sha256 del archivo; no normalizar EOL/BOM; verificar `git diff` limpio).
  - **Tenancy:** `ModifierGroup` NO tiene `restaurantId` (scope sube por `menuItem`) → **NO entra a `SCOPED_MODELS`**, no se toca `tenant-guard.test.js`.

- **Backend:**
  - `menu.routes.js` CRUD de modifier-groups: agregar `groupType` al **destructuring explícito** (no `data: req.body`) con whitelist `'ADD'|'REMOVE'` (default `'ADD'`).
  - `store.routes.js` (~284): incluir `groupType` en el select de modifier-groups del menú público.
  - **`orders.routes.js`: SIN cambios funcionales.** Un "SIN" fluye como `Modifier` con `priceAdd=0` → `applyFreeModifiers` charge=0 → persistido en `OrderItemModifier`. Los REMOVE viajan **solo por `modifiers`, nunca por `notes`**.

- **CORRECCIÓN OBLIGATORIA #1 (inventario — alta):** `discountInventory` matchea `ModifierIngredient` **por nombre** sin saber el grupo. Si un REMOVE se nombra igual que un `ModifierIngredient` mapeado, descontaría stock fantasma. **Fix:** forzar **server-side** la convención de naming `Sin X` en el POST/PUT de modifiers de grupos `REMOVE` (normalizar/validar prefijo `Sin `). **Regla dura documentada:** `ModifierIngredient` jamás debe mapear un nombre que empiece con `Sin `/`SIN `.

- **CORRECCIÓN OBLIGATORIA #2 (impresión — media):** para marcar `removal` en reimpresión de órdenes persistidas (donde `OrderItemModifier` no guarda `groupType` y `modifierId` puede ser `SetNull`), derivar **exclusivamente del prefijo del name** (`Sin `/`SIN `), **NUNCA de `priceAdd===0`** (los ADD gratuitos por `freeModifiersLimit` también son `priceAdd=0` → falsos positivos).

- **CORRECCIÓN #3 (grounding):** el soporte de impresión de "SIN" **NO existe hoy**; `printer-tcp.ts:932-935` imprime `+ {name}` para todo modifier. Hay que agregar el branch `removal → SIN {name}`. (La línea 131 es un sample hardcodeado, no evidencia de soporte.)

- **Frontend:** chips negativos "Sin {name}" sin badge de precio en `ProductModal.tsx` (client), configurador TPV (`modifiers.ts` + `ProductConfigSheet`), editor admin por producto (`ModifierGroupsEditor` con selector "Tipo de grupo"). En `admin/inventario/extras`: filtrar/marcar grupos REMOVE como "Quitar — no descuenta" (evita que el dueño los mapee → doble descuento).

- **Tests:** total no alterado con `priceAdd=0`; orden con REMOVE → 0 `StockMovement` por ese SIN; cancelación no repone los SIN; `groupType` inválido se normaliza a `'ADD'`; `TicketModifier{removal:true}` imprime `SIN {name}` sin monto; cart key distingue con-vs-sin; `tenant-guard.test.js` sigue verde.
- **Riesgos:** convención de naming load-bearing (mitigado forzándola server-side); temas storefront custom deben esconder precio si `priceAdd===0 && REMOVE`. **Esfuerzo:** M.

### A.2 — Nota a cocina en el modal del cliente — `verdict: needs-fix → corregido`

- **Objetivo:** campo de nota por línea en el `ProductModal` del storefront → `OrderItem.notes` (tubería backend ya existe: `store.routes.js:546` desestructura `notes`, `:629-632` fusiona en `finalNotes`).
- **Schema:** ninguno.

- **CORRECCIÓN OBLIGATORIA #1 (cobertura — alta):** `ProductModal+StoreCheckout` **NO son toda la tienda**. `normalizeTheme` (`page.tsx:67`) manda todo lo que no sea MOCHI/MUNDIALISTA a **DEFAULT → `StorefrontClient` legacy** (Kawaii/Halo/Brutalist), que **no usa `ProductModal`** ni incluye `notes` en su `items.map` (`StorefrontClient.tsx:113`). **Decisión de alcance:** Fase A cubre **solo MOCHI/MUNDIALISTA** (declararlo explícitamente). Cubrir DEFAULT/legacy es trabajo adicional (sube a M) → follow-up documentado, no parte de este PR.

- **Backend (`store.routes.js`, dentro del `items.map`):**
  - Cap de longitud server-side **obligatorio** (hoy solo `.trim()`): `typeof itemNotes === 'string' ? itemNotes.trim().slice(0,200) : ''`. El cap acota **solo el texto libre del cliente** (vector real de abuso); los complementos ya están validados contra el menú.
  - **CORRECCIÓN #2 (inyección ESC/POS — baja, pero barata):** strippear caracteres de control: `.replace(/[\x00-\x1F\x7F]/g,' ')`. El `maxLength` del textarea es bypasseable por POST directo.
  - Mantener construcción campo-por-campo (no `data: req.body`).

- **Frontend (client):**
  - `cartStore.ts`: `note?: string` en `CartLine`/`AddInput`.
  - `ProductModal.tsx`: `<textarea maxLength={200}>` "Nota para la cocina (opcional)", placeholder "Sin cebolla, sin picante…".
  - **CORRECCIÓN #3 (dedup):** preferir **edición de nota por línea en el carrito** (patrón kiosk `set-notes`) en vez de meter la nota en la `key` de dedup — evita líneas fantasma por diferencias triviales de texto. Si se mantiene en la key, normalizar agresivo (trim + collapse espacios + lowercase) y documentar el trade-off.
  - **CORRECCIÓN #4 (re-add):** en `cartStore.add` la nota **se conserva sola** al incrementar una línea existente (los campos del `AddInput` se ignoran para líneas existentes). "Propagar note en el +" es **cosmético, no anti-pérdida**; hay 3 call-sites (`StoreCheckout:333`, `MochiTheme:626`, `MundialistaTheme:719`), no 1.
  - `StoreCheckout.tsx`: `notes: l.note || undefined` en el body del POST; mostrar la nota en el resumen.

- **Tests:** item con `notes` persiste y contiene el texto; cap a 200; tipo inválido (`{evil:1}`) → orden sin error; control-chars stripeados; nota visible en KDS y comanda térmica (gated por `showNotes`).
- **Riesgos:** `notes` mezcla nota cliente + "Complementos: …" (comportamiento actual, documentar); productos sin modal quedan sin nota (limitación conocida). **Esfuerzo:** S.

### A.3 — Marcar extra/modificador como agotado — `verdict: ok`

- **Objetivo:** apagar un extra ("Tocino" agotado) sin borrarlo ni perder su mapeo de inventario.
- **Schema + migración:** `Modifier.isAvailable Boolean @default(true)` (espejo de `MenuItemVariant.isAvailable`). Migración `add_modifier_is_available`: `ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;`. **Tenancy:** `Modifier` NO tiene `restaurantId` → **NO a `SCOPED_MODELS`** (agregarlo rompería el assert `{extra:[]}`). Scope sube por `group.menuItem.restaurantId`. Editar el schema canónico `packages/database/prisma/schema.prisma` (la copia espejo `apps/backend/prisma` era código muerto y se borró).

- **Semántica resuelta (filtro vs mostrar):** el endpoint público `GET /api/store/menu` **NO filtra** por `isAvailable` — expone el flag y el modal pinta el extra **deshabilitado, no oculto**. El filtro `where:{isAvailable:true}` solo en superficies que oculten (futuro kiosk si se decide).

- **Backend:**
  - `store.routes.js`: agregar `isAvailable` al select de modifiers; en `addItemToOrder` **bloquear server-side** que se seleccione un modifier no disponible (filtrar `allowedModifierIds` por `m.isAvailable`, error "no disponible" si el cliente lo fuerza). **Corrección de justificación:** esto es validación de **disponibilidad/pertenencia**, NO consumo de recurso agotable → **no** requiere estar en la `$transaction` ni re-chequeo condicional (esa regla es para cupones/puntos/stock).
  - `recipes.routes.js`: `PATCH /modifiers/availability` (body `{name, isAvailable}`, `updateMany where:{name, group:{menuItem:{restaurantId}}}`, coerción `!!`). **Corrección obligatoria:** inicializar el acumulador del GET por nombre con `isAvailable:true` y usar `e.isAvailable = e.isAvailable && (m.isAvailable !== false)` (un `undefined` no debe marcar falso "agotado").
  - `menu.routes.js` PUT `/modifiers/:id`: aceptar `isAvailable` en el destructuring (control fino por producto).

- **Frontend:** toggle "Disponible/Agotado" en `admin/inventario/extras` (por NOMBRE, copy explícito) + checkbox en `ModifierGroupsEditor` (por id). En `ProductModal.tsx` client: botón `disabled` + badge "Agotado", `toggleMod` no-op si `isAvailable===false`.
- **CORRECCIÓN (edge case modal):** un grupo `required` con **todas** las opciones agotadas dejaría al cliente trabado en `handleAdd`. **Fix:** tratar ese grupo como satisfecho/omitible cuando no hay opciones disponibles.
- **ALCANCE TPV (decisión):** Fase 1 cubre **solo storefront**. El cajero/mesero **podrá seguir vendiendo** el extra agotado (el TPV no filtra ni valida `isAvailable`). Si se quiere "agotado de verdad", incluir en una fase posterior el filtro UI en `apps/tpv/lib/modifiers.ts` + validación server-side en el endpoint de orden del TPV. **Declararlo explícitamente.**

- **Checklist operativo estricto (evita el 500 documentado en `store.routes.js:281-282`):** (1) `migrate dev` local; (2) commit; (3) `migrate deploy` MANUAL a prod (verificar la columna existe); (4) **recién entonces** push del backend que lee `isAvailable`.
- **Tests:** `tenant-guard` verde; PATCH apaga todas las filas del tenant y no toca otro restaurante; `store/menu` devuelve `isAvailable`; `addItemToOrder` rechaza modifier agotado; PUT `/modifiers/:id` persiste. **Esfuerzo:** M.

### A.4 — Validación de stock real al crear la orden — `verdict: needs-fix → corregido`

- **Objetivo:** bloqueo preventivo anti-oversell server-side, **opt-in por tenant**. Hoy NO hay protección: `discountInventory` corre **fuera** de la `$transaction`, con `try/catch` que traga errores y decremento sin guard; `store.routes` no descuenta.
- **Schema + migración:** `RestaurantConfig.blockOnInsufficientStock Boolean @default(false)` (junto a `centralWarehouseEnabled`). Migración aditiva. Sin modelos nuevos → `SCOPED_MODELS` intacto (`Ingredient`/`Recipe`/`ModifierIngredient` ya scoped; `StockMovement`/`RecipeItem` correctamente fuera).

- **Backend — `lib/stock.js` (nuevo, módulo puro):**
  - `computeNeededByIngredient(...)` puro: reusa la lógica de recetas/variante/`ModifierIngredient`/`SubRecipe` de `discountInventory`. Devuelve `Map<ingredientId, {needed, name, baseUnit}>`.
  - **CORRECCIÓN OBLIGATORIA #1 (regresión path OFF — alta):** **DOS consumidores distintos**, no uno:
    - `consumeStockBestEffort(tx, ...)` para path **OFF**: comportamiento legacy EXACTO (`update {decrement}`, **sin** guard, **sin** throw, mismo `StockMovement`). El path OFF jamás usa el helper que puede throw ni el `updateMany` condicional.
    - `consumeStockOrThrow(tx, ...)` para path **ON**: `updateMany({where:{id, stock:{gte:needed}}, data:{decrement:needed}})`; si `count===0` → throw `INSUFFICIENT_STOCK` → rollback de toda la tx.
    - Tests de paridad obligatorios: flag OFF + stock insuficiente → `StockMovement` SALE se crea igual que hoy y el stock queda negativo (idéntico).
  - **CORRECCIÓN #4 (deadlocks — media):** ordenar los updates **por `ingredientId`** (determinístico) para evitar deadlocks entre tx concurrentes. Capturar `P2034`/`40P01` → **503** (reintenta), no 500. Garantiza **NO-oversell**, no fairness (con N ingredientes, dos órdenes concurrentes pueden ambas fallar).

- **Backend — integración:**
  - `orders.routes.js` POST `/tpv` y `addRoundHandler`: cargar catálogo de recetas **fuera** de la tx; **CORRECCIÓN #2 (alta):** agregar la lectura de config (hoy NO existe en `/tpv`): `const config = await prisma.restaurantConfig.findUnique({where:{restaurantId}, select:{blockOnInsufficientStock:true}})`. Si flag ON → `consumeStockOrThrow` dentro de la tx; si OFF → `consumeStockBestEffort`. Mapear `INSUFFICIENT_STOCK` → 409 (checkout) o 503 (replay con `idempotency-key`).
  - `store.routes.js` POST `/orders`: **CORRECCIÓN #3 (idempotencia — alta):** en TPV la protección anti-doble-decremento la da el **dedup por `clientOrderId`** (`:545-558`), **NO** el header `Idempotency-Key` (que solo cachea 2xx). `store.routes` **no tiene dedup por `clientOrderId`** → **no habilitar el flag aquí** sin antes añadir idempotencia real al checkout (o documentar el riesgo de doble venta por doble-submit). El bloqueo aporta más valor aquí (cliente paga antes de recibir), pero la idempotencia es precondición.

- **CORRECCIÓN #6 (combos — media):** el bloqueo es **no-op para combos** sin `Recipe` propia (gap real, no edge case — combos consumen componentes). Para cobertura en kiosko hay que **modelar la receta del combo**. Reflejarlo en el texto del toggle para no dar falsa cobertura.
- **CORRECCIÓN #7 (notificación):** en el path de bloqueo la orden se **revirtió** (rollback) → NO pasar `order` a `notifyIngredientShortage`; notificar con `restaurantId/locationId/ingredientName` y `.catch` que loguea (permitido, no es dinero).
- **CORRECCIÓN #8 (paridad de nombres):** verificar que `flatMods[].name` (de `applyFreeModifiers`) == el name persistido en `OrderItemModifier` e incluye los gratis (que igual consumen). Test de paridad pre-tx vs legacy.

- **Frontend:** toggle "Bloquear venta sin stock suficiente" en ajustes de inventario (default OFF, copy: recomendado para tienda en línea, riesgoso en TPV offline). Manejo de 409 `INSUFFICIENT_STOCK` con **`ConfirmModal` in-app** (no `window.confirm`, frágil en APK) en TPV/client/kiosk.
- **Riesgos:** inventario desfasado rechaza cobros legítimos (default OFF mitiga); unidades `IngredientBaseUnit` heredan supuesto preexistente (documentar, no resolver aquí). **Esfuerzo:** L.

---

## 4. Fase B — Combos configurables — `verdict: needs-fix → corregido`

- **Objetivo:** combos REALES (cliente elige principal/guarnición/bebida), desglose por estación a cocina/KDS, descuento por componente, combo-builder en admin. Hoy "combo" = `MenuItem.isPromo` + texto en `description`.

- **Modelo de datos** (combo = `MenuItem` con `isCombo=true` + estructura colgada):
  - `MenuItem.isCombo Boolean @default(false)` + relación `comboComponents`.
  - **`ComboComponent`** (slot: "Principal"/"Guarnición"/"Bebida", `minSelect`/`maxSelect`/`isRequired`/`sortOrder`, FK `menuItemId` Cascade). Sin `restaurantId`.
  - **`ComboOption`** (opción elegible → `optionMenuItemId` a un `MenuItem` real, `priceDelta`, `isAvailable`, `sortOrder`). Sin `restaurantId`.
  - **`ComboSelection`** (hija de `OrderItem`, snapshot: `componentId?`/`optionId?` SetNull, `optionMenuItemId` String suelto, `name`, `priceDelta`). Espejo de `OrderItemModifier`.
  - **Tenancy:** los 3 modelos nuevos son hijos **sin `restaurantId`** → **NO a `SCOPED_MODELS`** (el test usa regex `restaurantId String`; no califican). Validación cruzada obligatoria: `optionMenuItemId` debe pertenecer al **mismo `restaurantId`** que el combo (anti-IDOR).

- **CORRECCIÓN OBLIGATORIA #1 (FK que rompe wipe-all — alta):** `ComboOption.optionMenuItemId` **NUNCA `onDelete:Restrict`** (rompería `DELETE /items/:id` y `wipe-all`, y la suite E2E). Usar **`onDelete:Cascade`** (o `SetNull` nullable). `ComboSelection.optionMenuItemId` = **String suelto sin FK** (snapshot histórico). Agregar limpieza de `combo_options` en el delete/wipe-all handler **antes** del `menuItem.delete` (como ya se hace con `orderItem.deleteMany`).

- **Backend:**
  - `money.js`: `resolveComboSelection(menuItem, comboSelections)` puro (espejo de `resolveVariantSelection`), **re-lee `priceDelta` de DB** (anti-manipulación), valida min/max y pertenencia, lanza Error con `.code` → 400.
  - **CORRECCIÓN #2 (inventario web/kiosk — alta):** **declarar Fase 1: descuento de inventario por componente SOLO en TPV** (`orders.routes.js`). `store.routes.js`/kiosk tienen su **propia** lógica inline que NO llama `discountInventory` ni `money.js` — las órdenes web/kiosk **hoy no descuentan inventario**. Afirmar lo contrario es falso. Inventario en web = refactor aparte (reusar `money.js` + agregar `discountInventory` en `store.routes`).
  - **CORRECCIÓN #5 (doble conteo — media):** en `discountInventory`, si `oi` es de un `MenuItem isCombo`, **saltar la receta del header** y descontar **solo** las recetas de los `optionMenuItemId` de sus `ComboSelection`. Test explícito de combo-con-recipe-propia.
  - **CORRECCIÓN #3 (atomicidad — alta):** las `ComboSelection` SÍ van en la `$transaction` del `OrderItem` (correcto). Pero `discountInventory` corre **fuera** de la tx y traga errores — **no describirlo como transaccional/idempotente**; documentar la limitación preexistente.
  - **CORRECCIÓN #6 (addRound — media):** `addRoundHandler` es copia completa del create. **Extraer un helper único `resolveCartItem`** (con `resolveComboSelection` + persistencia de `ComboSelection`) y usarlo en create **Y** addRound. Test obligatorio: "agregar combo en ronda 2" (DINE_IN).
  - **CORRECCIÓN #4 (dedup — media):** incluir la huella de `comboSelections` (`componentId:optionId` ordenados) en `buildItemSig` (anti-multitap, `orders.routes.js:796`) y en `modifierKey` de `ticketStore` (`:260-269`) — si no, dos combos del mismo precio con distinto contenido se fusionan/descartan.
  - **CORRECCIÓN #7 (schema — baja):** acotar `comboSelections` en `cartItemSchema`: `.max(20)` slots, `z.string().min(1).max(40)` en ids.
  - **CORRECCIÓN #8 (includes — baja):** tocar las **DOS** fuentes de menú: `menu.routes.js` GET `/items` y `/items/:id` **Y** el `findMany` de `store.routes.js:261`, para que cada cliente reciba `comboComponents.options`.
  - CRUD combo-builder (`menu.routes.js`): POST/PUT/DELETE `/items/:id/combo-components` y `/combo-components/:cid/options` con `pick()` (no `data: req.body`).

- **Frontend:** combo-builder en `admin/menu/page.tsx` (pestaña 'combo'); selector guiado por slot (radio/checkbox) en `ProductModal.tsx` (client) + TPV + kiosk; comanda imprime desglose REAL por estación (`printer-tcp.ts` agrupa por `printerGroup` del `optionMenuItem`: bebida→BAR, principal→KITCHEN); KDS renderiza `comboSelections`.
- **Riesgos:** superficie XL (TPV+client+kiosk+admin+KDS+backend); desplegar backend+migración **antes** que las apps. **Esfuerzo:** XL.

---

## 5. Fase C — Operación

Tres features de cocina/empaque. C.1 es **dependencia dura** de C.2 y C.3.

### C.1 — Estado "En empaque" + máquina de estados con guardrails — `verdict: needs-fix → corregido`

- **Objetivo:** agregar `PACKING` al enum `OrderStatus` y convertir `PUT /:id/status` (hoy cambio libre) en máquina de estados con transiciones válidas por rol.
- **Schema + migración:** `ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PACKING';` **al final del enum** (orden de declaración Postgres, como se hizo con `OPEN`). `ADD VALUE` corre fuera de tx (Prisma lo emite así, no envolver a mano). **CORRECCIÓN (grounding — alta):** generar la migración desde **`packages/database`** (schema canónico, líneas reales: enum `:697`). La copia stale `apps/backend/prisma` era código muerto y se borró: el enum se edita en un solo lugar. **REFUNDED NO va a `OrderStatus`** (ya es `PaymentStatus`, ortogonal — decisión correcta).

- **Backend — `lib/order-status.js` (nuevo, fuente única):** `ORDER_STATUSES`, `ACTIVE_ORDER_STATUSES` (+PACKING), `ALLOWED_TRANSITIONS`, `ROLE_TRANSITIONS`, `canTransition(from,to,role)`. Permite A→A no-op idempotente.

- **Máquina de estados:** `PENDING→CONFIRMED|CANCELLED`; `CONFIRMED→PREPARING|CANCELLED`; `PREPARING→READY|CANCELLED`; `READY→PACKING|ON_THE_WAY|DELIVERED|CANCELLED`; `PACKING→ON_THE_WAY|DELIVERED|CANCELLED`; `ON_THE_WAY→DELIVERED|CANCELLED`; `DELIVERED`/`CANCELLED` terminales; `OPEN→CANCELLED`.

- **CORRECCIÓN OBLIGATORIA #1 (alcance honesto — alta):** `canTransition` gobierna **solo** `PUT /orders/:id/status`. El status se escribe directo en ≥8 caminos que **lo evaden**: `delivery.routes.js:191/253` (assign/driver), `orders.routes.js:1474` (confirm-payment), `:1566` (confirm-cash), `:1994` (merge). **Declararlo explícitamente** como "system transitions" exentas, o centralizar la escritura en un helper único `transitionOrderStatus(tx, ...)`. (El CANCELLED de merge `:1994` NO repone inventario — decidir si debe.)
- **CORRECCIÓN #2 (SUPER_ADMIN — alta):** agregar `SUPER_ADMIN` (y `ADMIN` donde falte) a **todas** las transiciones, o bypass (como `requireTenantAccess`). Sin esto, el operador del SaaS recibe 403.
- **CORRECCIÓN #3 (DELIVERY — alta):** **quitar DELIVERY** de la matriz del endpoint de orders — el repartidor mueve estado por `delivery.routes.js` (con ownership-check `findDriverOrder`). Listarlo en orders es inimplementable/inseguro.
- **CORRECCIÓN #6 (roles — media):** documentar que `ROLE_TRANSITIONS` opera sobre el **string crudo** de `req.user.role` (de `Employee.role` libre + device token KDS→KITCHEN/POS→CASHIER), NO sobre el enum `Role` de `User` (que solo tiene CUSTOMER/ADMIN/KITCHEN/SUPER_ADMIN).
- **CORRECCIÓN #7 (no-op A→A — baja):** retornar 200 **antes** de emitir socket y `notifyOrderStatus`, para no duplicar push/WhatsApp en replays del outbox.

- **Backend integración:** `orders.routes.js:1605-1668` llama `canTransition` tras leer `existing.status`; 409 `INVALID_TRANSITION` si falla. **Preservar el guard de CANCELLED** (`restoreInventoryForCancelledOrder` solo en `status==='CANCELLED' && existing.status!=='CANCELLED'`). Centralizar `ACTIVE_ORDER_STATUSES` importándolo (eliminar inline en `orders.routes.js:382` y `dashboard.routes.js:28`, +PACKING). `notifications.service.js`: entrada `PACKING` en `MESSAGES` (decisión de producto si se quiere silencioso).

- **Frontend:** `admin/pedidos` columna "En empaque" + `NEXT_STATUS` con `READY→PACKING→ON_THE_WAY`, **CORRECCIÓN #5 (media): condicionar PACKING por `orderType`** (no DINE_IN; delivery avanza a ON_THE_WAY vía `assignDriver`, no el botón). Capturar 409 con toast. `client/StoreCheckout` y `tpv/ACTIVE_STATUSES`: mapear PACKING. **KDS sin cambios** (es listener TCP, no consume el enum).
- **Tests:** tabla de transiciones, matriz de roles, A→A no-op, 409/403, `cancel-restore` no regresiona, `tenant-guard` verde.
- **Orden de deploy:** migración enum → `migrate deploy` manual → backend con Zod+lógica → apps con mapeos. **Esfuerzo:** M.

### C.2 — Vista/checklist de empaque por pedido — `verdict: needs-fix → corregido`

- **Objetivo:** checklist por pedido en KDS para gate `PACKING→READY`. **Depende de C.1.**
- **Schema:** `OrderPackingCheck` (hija de `Order`, `@@unique([orderId, checkKey])`, `checked`, `checkedAt`, `checkedById` String suelto, `onDelete:Cascade`). Sin `restaurantId` → **NO a `SCOPED_MODELS`**.
- **CORRECCIÓN OBLIGATORIA #1 (grounding — alta):** editar **`packages/database/prisma/schema.prisma`** (canónico: enum `:697`, `KdsItemStatus :2399`, Order relations `:864-867`) — único schema del repo. Agregar relación inversa `packingChecks` en `Order`.
- **CORRECCIÓN #2 (precedente — media):** `KdsItemStatus`/`KdsMessage` usan `orderId String` **suelto sin `@relation`**. Aquí se introduce FK relacional con `onDelete:Cascade` (mejor integridad/cleanup) — afirmarlo como decisión propia, no "idéntico al precedente".

- **Lista canónica de checks (fija en backend):** `DRINKS_COMPLETE`, `SAUCES_PACKED`, `TICKET_PRINTED`, `ADDRESS_CONFIRMED`, `PAYMENT_CONFIRMED`. Los derivables se **pre-calculan** en el GET (auto-sugeridos); el operador confirma.

- **Backend (`kds.routes.js`):**
  - `GET /packing/orders`: órdenes en `PACKING` + merge con los 5 checks. **CORRECCIÓN #4 (tenancy — media):** agregar `restaurantId` **explícito** en el `where` del `findMany` (no confiar solo en enforce; regla del proyecto).
  - `PUT /packing/:orderId/check`: `pick(req.body,['checkKey','checked'])`; validar `checkKey` ∈ canónica; `findFirst({where:{id, restaurantId, status:'PACKING'}})`. Dentro de **una `$transaction`**: upsert + contar 5 en true + `order.update({where:{id, status:'PACKING'}, data:{status:'READY'}})` condicional. **CORRECCIÓN #7 (auditoría — baja):** `checkedById` siempre de `req.user`, nunca `req.body`.
  - **CORRECCIÓN #3 (conteo bugueado — media):** al redirigir el "todos los items done" de READY→PACKING (`kds.routes.js:157/169`), **corregir** el conteo (`distinct` por `orderItemId`, no `allDone.length >= items.length` que cuenta duplicados por estación).
  - **CORRECCIÓN #6 (flag obligatorio — baja):** gatear el redirect READY→PACKING tras `hasPackingStage` **obligatorio** (no opcional) — sin esto los ~85 tenants sin empaque quedan atascados en PACKING.
  - **CORRECCIÓN #5 (orden de deploy — media):** enum PACKING en BD **antes** que el Zod/lógica (si no, `PUT /:id/status` con PACKING → 500).

- **Frontend (KDS):** pestaña "Empaque" con cards de 5 toggles grandes; al completar el último, el backend ya avanzó a READY. Admin: badge PACKING solo-lectura.
- **CORRECCIÓN #8 (PAYMENT_CONFIRMED — baja):** en DELIVERY con cobro en destino (COD), `PAYMENT_CONFIRMED` = auto read-only **informativo, NO requerido** para avanzar (no mezclar confirmación de pago real con checklist físico).
- **Tests:** `tenant-guard` verde; checkKey inválido→400; orden de otro tenant→404; no-PACKING→409; 5 checks→READY una vez (idempotente); upsert no duplica. **Esfuerzo:** M.

### C.3 — Consolidado de producción en KDS — `verdict: needs-fix → corregido`

- **Objetivo:** "modo Consolidado" en KDS: sumatorio de items pendientes por estación ("12 Papas, 8 Burger").
- **Arquitectura:** Fase 1 **100% cliente** (deriva del estado `orders` ya polleado); Fase 2 opcional = endpoint `/orders/:station/summary`. Cero schema.

- **CORRECCIÓN OBLIGATORIA #1 (combos infeasible en Fase 1 — alta):** el payload de `GET /orders/:station` **NO incluye `isPromo`/`description`** (solo el detalle `/orders/:id`). **Mover el sub-conteo de combos a Fase 2** (endpoint), o ampliar el select de `menuItem` en `/orders/:station` (pre-requisito backend explícito). Fase 1 cliente-only = solo línea `menuItem` sin desglose.
- **CORRECCIÓN #2 (tests — alta):** `apps/kds` **NO tiene jest**. Extraer `buildProductionSummary` a módulo puro `apps/kds/src/lib/production-summary.ts` (sin React) y scaffold jest+ts-jest como pre-requisito documentado (o co-ubicar donde ya corre jest).
- **CORRECCIÓN #4 (agrupación — media):** agregar `menuItemId: string` a la interfaz `KdsOrderItem` (hoy ausente; el campo SÍ viaja en el payload, `kds.routes.js:109`) y **agrupar siempre por `menuItemId`** (no por nombre, que fusiona homónimos). Eliminar fallback por nombre.
- **CORRECCIÓN #3 (firma — media):** **quitar el parámetro `station`** de `buildProductionSummary` — los `orders` en estado **ya son de una sola estación** (`/orders/${station}` filtra server-side). Consolidado multi-estación requiere Fase 2.
- **CORRECCIÓN #5 (done parcial — baja):** fijar en test que `quantity>1 + done=true` resta la cantidad **completa** (todo-o-nada por `orderItem`; no hay done por unidad).
- **CORRECCIÓN #6 (config — baja):** `viewMode` con default `'cards'` en el fallback + guarda de validación en `readKdsDisplayConfig`.

- **Backend (Fase 2 opcional):** extraer `resolveStationItems` (helper compartido, no duplicar ruteo) + `GET /orders/:station/summary` (agregado en JS, sin `$queryRaw`). **Tenancy:** `Order` ya scoped; `KdsItemStatus` correctamente fuera.
- **Tests:** unit de `buildProductionSummary` (suma pendientes, excluye done, agrupa por id); regresión del endpoint actual. **Esfuerzo:** S (Fase 1) / M (con endpoint).

---

## 6. Fase D — Inteligencia

Dos features de visibilidad/reporting. Ambas cero-schema o aditiva trivial.

### D.1 — Visibilidad por canal (online/TPV/kiosk/QR/delivery) — `verdict: needs-fix → corregido`

- **Objetivo:** desacoplar kiosk de web (hoy ambos comparten `availableOnline`). MVP: `availableOnKiosk`.
- **Schema + migración:** `MenuItem.availableOnKiosk Boolean @default(true)` (`ADD COLUMN IF NOT EXISTS ... DEFAULT true`). `MenuItem` ya en `SCOPED_MODELS` → agregar columna no cambia la lista. **Decisión:** columnas booleanas, NO JSON (filtros en `where` de Prisma, tipados, indexables). **Diferir** `availableOnDelivery`/`availableOnTableQr` (canales inexistentes hoy).

- **Backend:**
  - **CORRECCIÓN OBLIGATORIA #1 (señal de canal — alta):** **NO** detectar el canal del POST por el header `x-kiosk-terminal-id`. El POST `/orders` ya tiene la señal canónica `source` en el **body** (`store.routes.js:476`), y todo el handler (horario `:484`, rate-limit `:505`, mínimo `:658`) se decide con `source==='KIOSK'`. Definir helper `resolveChannel(req)`: en **POST** usar `source` (respaldo header); en **GET** (sin body) usar el header. Mapear canal→flag en **un solo lugar** y reusarlo en el `where` del GET `/menu` (`:262`) **Y** en el `findFirst` del guard del POST (`:554`) — si no, un producto oculto en kiosk se pide por POST directo.
  - **CORRECCIÓN #2 (grounding — media):** `menu.routes.js` SÍ usa `pick()` (`:109`, categorías); las rutas `/items` usan allowlist por **destructuring**. Sumar `availableOnKiosk` ahí (no abrir `data: req.body`).
  - `menu.routes.js` POST/PUT `/items`: aceptar `availableOnKiosk` (`=== undefined ? true : !!`).

- **Frontend:** dos toggles en `admin/menu` ("Mostrar en tienda en línea" / "Mostrar en kiosko"), copy actualizado. Client/kiosk **sin cambios de código** (desacople 100% server-side; el kiosk ya manda su señal). **CORRECCIÓN #4 (baja):** el admin recibe `availableOnKiosk` vía `GET /api/menu/items` (usa `include` → trae la columna) para hidratar el form y un Pill "Sin kiosko".
- **CORRECCIÓN #3 (paridad — decisión de producto):** ofrecer en la **misma migración** un backfill opcional `UPDATE menu_items SET "availableOnKiosk" = "availableOnline";` para no reintroducir en kiosk productos que el operador creía ocultos (el `DEFAULT true` puro es no-destructivo pero sorprende al operador existente).
- **Tests:** GET `/menu` con/sin header kiosk filtra por el flag correcto; POST `/orders` de item oculto en kiosk → error; web sin header sigue usando `availableOnline`; flags independientes. **Esfuerzo:** S.

### D.2 — Reportes por variante, extra/modificador, combo y canal — `verdict: needs-fix → corregido`

- **Objetivo:** reportes por dimensión en admin. Hoy solo `groupBy(['name'])`. Canal ya existe parcial (`dashboard.routes.js:407`) sin consumir en UI. **Cero schema, cero migración** (todo derivado).
- **Realidad del dato:** Canal = `Order.orderType` (groupBy nativo). Extra = `OrderItemModifier` (groupBy nativo, **sin `restaurantId`** → where anidado `orderItem.order.restaurantId` **obligatorio**). Variante = texto en `OrderItem.notes` ("Variantes: X") **+ embebida en `OrderItem.name`** ("Producto (Grande)"). Combo = `OrderItem` con `menuItem.isPromo=true`.

- **Backend (`reports.routes.js`, 4 endpoints):**
  - `GET /by-channel`: `order.groupBy(['orderType'])` con rango `from/to` (reusar/extraer helper de `dashboard.routes.js:407`).
  - `GET /by-modifier`: `orderItemModifier.groupBy(['name'], where:{orderItem:{order:{restaurantId, status:{not:'CANCELLED'}, createdAt}}}, _sum:{priceAdd})`. **El where anidado es el único aislamiento** (no scoped).
  - `GET /by-combo`: **CORRECCIÓN #2 (alta):** agrupar por **`menuItemId`** (no por `name`, que lleva sufijo de variante "(Grande)" y fragmenta el mismo combo); resolver nombre canónico vía `MenuItem`. Filtrar `menuItem.isPromo:true`.
  - `GET /by-variant`: **CORRECCIÓN #1 (alta):** cubrir **AMBAS** fuentes — el sufijo `(...)` de `OrderItem.name` (variante single-select embebida por `resolveVariantSelection`, la más vendida) **Y** la línea "Variantes:" de `notes`. Solo parsear notes omite la variante de tamaño canónica. **CORRECCIÓN #4 (OOM — media):** cap server-side **duro** (`take` ~20000) + período acotado por default (**NO HIST**) + prefiltro `notes contains 'Variantes:'`.
  - **CORRECCIÓN #3 (parser — media):** **reusar el parser existente** `parseShippingVariant` (`driver-cash.routes.js:919`, ya testeado) — extraerlo a `lib/parse-variant.js` compartido, NO crear un regex divergente.
  - **CORRECCIÓN #6 (helper — baja):** replicar `getLocationId` en `reports.routes.js` (vive en `dashboard.routes.js:34`).

- **Frontend:** pantalla `/admin/reportes/dimensiones` con `SectionTabs` (Canal|Variantes|Extras|Combos), selector de período, `DataCard`/tablas token-driven, export PDF.
- **CORRECCIÓN #5 (doble conteo — media):** rotular cada tabla como **"ingreso atribuible a esta dimensión"** (NO ventas totales) — `subtotal` **ya incluye** `priceAdd` y precios de variante (`money.js:100`); nunca sumar las 4 tablas como independientes. `by-modifier` sobre `priceAdd` es el slice del extra (correcto aislado).
- **Tenancy:** cero modelos nuevos; aislamiento de `by-modifier` por where anidado (test que falla si se quita el filtro = guard anti-fuga). Cero `$queryRaw`.
- **Tests:** `parse-variant` (multilínea, sin confundir "Complementos:"); `by-modifier` arma el where anidado (assert); `by-combo` agrupa por id; `by-channel` excluye CANCELLED. **Esfuerzo:** M.

---

## 7. Secuencia recomendada (respetando dependencias)

| # | Item | Por qué va aquí |
|---|------|-----------------|
| **0** | **Quick Wins** | Cero schema/migración, valor inmediato, riesgo mínimo. Calienta el flujo de deploy storefront. **Primer PR (ver §8).** |
| **1** | **A.2 Nota a cocina** | S, cero schema, tubería backend ya existe. Solo cobertura MOCHI/MUNDIALISTA. |
| **2** | **A.3 Extra agotado** | M, migración aditiva trivial, independiente. Cierra una brecha visible ("se puede pedir un agotado"). |
| **3** | **A.1 Quitar ingredientes** | M, migración aditiva. Independiente de A.3 pero comparte el camino de modifiers/impresión — agrupar mentalmente. |
| **4** | **D.1 Visibilidad kiosk** | S, migración aditiva, autocontenido. Desbloquea operación multi-canal sin tocar features grandes. |
| **5** | **A.4 Validación de stock** | L. Va **antes** de combos porque combos amplía la superficie de inventario; tener `lib/stock.js` y los dos consumidores estabilizados primero reduce el riesgo de B. |
| **6** | **B Combos configurables** | XL. Depende del motor de recetas/inventario (A.4 idealmente desplegado). Es la base de la receta-por-componente. |
| **7** | **C.1 Estado PACKING + máquina** | M. **Dependencia dura de C.2 y C.3.** Va antes que el checklist y el consolidado. |
| **8** | **C.2 Checklist de empaque** | M. Requiere C.1 (estado de origen PACKING + flag `hasPackingStage`). |
| **9** | **C.3 Consolidado KDS** | S/M. Fase 1 independiente; el desglose de combos (Fase 2) se beneficia de B desplegado. |
| **10** | **D.2 Reportes por dimensión** | M. Va al final: `by-variant`/`by-combo` reportan sobre datos que B (combos) y A.1 (variantes/modifiers) ya generaron con estructura más limpia. Funciona hoy, pero reporta mejor después. |

**Razonamiento de orden duro:** A.4 (stock) **antes** de B (combos) por la superficie de inventario compartida; C.1 (PACKING) **antes** de C.2/C.3 por dependencia de estado; D.2 al final porque es lectura pura y se enriquece con lo anterior.

---

## 8. Primer PR recomendado — Quick Wins (mejor valor/riesgo)

**Por qué:** cero schema, cero migración manual a prod, cero riesgo de tenancy/dinero, `verdict: ok`. Tres mejoras visibles (combo a cocina, chip "Abierto", "Desde $X") en ~24 h. Es el calentamiento ideal del pipeline de deploy storefront antes de las features con migración.

**Checklist concreto:**

- [ ] **QW1:** UPDATE puntual `TicketConfig.kitchenShowItemDescription=true` para Master Burguer's (y los tenants que lo pidan); verificar en `/admin/tickets` que el toggle refleja. (Opcional: `kitchenShowItemDescription:true` en el `ticketConfig.create` lazy de `printers.routes.js:50-57`.)
- [ ] **QW1 verificación:** imprimir una comanda real de un combo (`isPromo` + `description`) en el TPV/APK y confirmar el desglose entre paréntesis. NO tocar `@default(false)` del schema.
- [ ] **QW2:** ampliar `type Info` con `isOpen?: boolean` en `MochiTheme.tsx` y `MundialistaTheme.tsx`; renderizar chip pill "Abierto" + `~X min`; **condicionar `~X min` a `orderMode==='DELIVERY'`**.
- [ ] **QW3:** en `ProductCard` de ambos temas, `Desde {fmt(min(variants.price>0))}` con fallback a `price`; **ocultar el stepper `+/-` cuando `needsModal(p)`**.
- [ ] **Paridad:** QW2 y QW3 aplicados a **ambos** temas activos en el mismo PR (evitar divergencia visual).
- [ ] **Tests:** unit `fromMinVariantPrice` (con/sin variantes, min==0); render `Header` (con/sin `estimatedDelivery`, TAKEOUT omite sufijo); reusar `printer-tcp.test.ts:231-282`.
- [ ] **tsc en worktree:** recordar el junction de `node_modules` al padre (PowerShell) antes de `tsc` — `type Info` ampliado debe compilar.
- [ ] Commit + `git push origin master` (deploy Vercel client automático). Cerrar el agente Codex concurrente antes de operar git.

---

## 9. Verificación EN VIVO recomendada (antes de implementar)

Probar contra la tienda corriendo para **confirmar las tres brechas** que el plan ataca — son la justificación empírica de Fase A y B:

1. **Modal del cliente sin nota ni quitar:** abrir un producto en el storefront (tema MOCHI o MUNDIALISTA) → confirmar que el `ProductModal` **no tiene campo de nota** ni opción de "quitar ingrediente". (Valida A.1 y A.2.) **Verificar también** qué tema sirve el tenant: si cae a DEFAULT/legacy (`StorefrontClient`), A.2 NO aplica ahí — confirma el recorte de alcance a MOCHI/MUNDIALISTA.

2. **Extra agotado se puede pedir:** tomar un extra existente, simular agotamiento (o solo intentar), y confirmar que **hoy se puede agregar al carrito y pedir** un extra que debería estar agotado — no hay `isAvailable` en `Modifier`. (Valida A.3.)

3. **Comanda de combo no desglosa:** crear un pedido con un combo (`MenuItem.isPromo`) y mandar a imprimir/KDS → confirmar que la comanda **no desglosa** principal/guarnición/bebida por estación (sale el nombre del combo, el desglose vive solo en `description` y solo si `kitchenShowItemDescription` está ON). (Valida QW1 + B.)

**Tenant de prueba:** Master Burguer's, sucursal Principal. Si se prueba en tablet, recordar el flujo de OTA (la versión de rama puede pisar master) y `CAPACITOR_OTA_DISABLED=true` para ver cambios web locales.

---

## 10. Notas operativas transversales (aplican a toda feature con migración)

- **Migración:** `prisma migrate dev` desde **`packages/database`** (schema canónico) → commit → `prisma migrate deploy` **MANUAL** a prod **antes** del push del backend que lee la columna nueva → verificar la columna en prod. **Prohibido `prisma db push`.** No re-tocar el `.sql` generado (checksum sha256; no normalizar EOL/BOM; `git diff` limpio).
- **Schema único:** el schema vive **solo** en `packages/database/prisma/schema.prisma`. La copia espejo `apps/backend/prisma/schema.prisma` era código muerto (nada la leía: `build`/`db:migrate`/`db:seed` del backend, el Dockerfile, nixpacks y el CI apuntan todos al canónico) y se borró. No recrearla.
- **Tenancy:** ningún modelo nuevo de estos diseños lleva `restaurantId` → ninguno entra a `SCOPED_MODELS`; correr `tenant-guard.test.js` en cada PR para confirmar verde. Mantener el filtro `restaurantId` **explícito** aunque enforce lo inyecte (regla del proyecto).
- **Dinero:** totales siempre server-side (`computeOrderTotals`); precios re-leídos de DB; nada de `req.body.total`; nada de `.catch(()=>null)` en stock/dinero; `pick()`/destructuring, nunca `data: req.body`.
- **Git:** push directo a master permitido y preferido; PR solo para cambios grandes (B Combos amerita PR). Revisar `git diff --stat` antes de commitear (WIP ajeno se barre a master). Cerrar el agente Codex concurrente antes de operar git.
