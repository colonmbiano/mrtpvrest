# Revisión de factibilidad — Venta por unidad de medida + cobro por peso

> **Estado:** revisado contra el código real (2026-06-13). **Veredicto: factible**, riesgo bajo en
> backend/frontend, con una corrección **bloqueante** ya incorporada abajo.

## Resumen ejecutivo

El plan de 4 prompts es técnicamente sólido y su lectura del código es precisa. Cambios aplicados a los
prompts tras la revisión:

1. **🔴 Bloqueante corregido — `db push` → migraciones.** El documento original ordenaba "siempre `db push`,
   nunca `migrate dev`". El `CLAUDE.md` lo **prohíbe** (ya causó drift en prod; existe
   `20260612210000_reconcile_db_push_drift`, y Railway no aplica migraciones solas). Reemplazado por el flujo
   `prisma migrate dev` (local) + `prisma migrate deploy` (manual a prod). El cambio `Int→Float` es un
   `ALTER COLUMN TYPE double precision` (ensanchamiento sin pérdida), así que la migración es limpia.

2. **🟡 Guard de canales incompleto — corregido.** El plan solo cubría tienda online y WhatsApp. Verificado:
   también crean órdenes con cantidad libre el **kiosko** (`kiosk.routes.js`) y el bot de WhatsApp vive en
   `services/whatsapp-bot/` (hace `prisma.order.create` directo, **no** pasa por `routes/`). Los tres deben
   rechazar pesables. `order-dictation` (voz) y `sales-import` (CSV) quedan fuera de alcance documentado.

3. **🟡 Redondeo — matizado.** El total de la orden ya pasa por `round2` en `computeOrderTotals`
   (`lib/money.js`); el gap real es el `subtotal` **persistido por línea** (`orders.routes.js` ~561 y ~876),
   que sí hay que redondear.

4. **🟡 Cap oculto en PUT items.** `PUT /api/orders/items/:id` (~línea 988) además del `parseInt` aplica
   `Math.min(99, ...)`; para pesables hay que saltarse ambos, no solo el `parseInt`.

Lo demás del plan (doble schema, admin `EditableList` sin renderizar, gates `if(!editItem)`, store del TPV con
merge `quantity + 1`, impresión) se confirmó fiel al código y es directo de implementar.

---

# Prompts Claude Code — Venta por unidad de medida + cobro por peso

**Orden de ejecución:** 1 → 2 → 3 → 4. Corre cada prompt en una sesión limpia (`/clear` entre cada uno).
**Dependencia:** el Prompt 1 (DB + backend) debe quedar aplicado antes de los demás.

Reglas permanentes que cada prompt repite (porque `/clear` borra contexto):
- **Doble schema Prisma**: `packages/database/prisma/schema.prisma` **y** `apps/backend/prisma/schema.prisma` deben quedar idénticos. El schema **fuente de verdad** (donde viven las migraciones y desde el cual el backend hace `generate` y `migrate`) es `packages/database/prisma/schema.prisma`.
- **PROHIBIDO `prisma db push`** (override del documento original): el `CLAUDE.md` del proyecto lo veta porque ya causó drift en prod (existe la migración `20260612210000_reconcile_db_push_drift` para reconciliarlo). Flujo obligatorio: `prisma migrate dev` para generar la migración → `prisma migrate deploy` MANUAL contra prod, coordinado con el deploy del backend (Railway **no** aplica migraciones solo, únicamente corre `prisma generate`).
- Tenant pattern: `req.user?.restaurantId || req.restaurantId`.
- Imports del paquete compartido vía `@mrtpvrest/database`.

> Nota abierta (no bloquea): `pz` y `unidad` se comportan idéntico. Los prompts mantienen los 4 valores; si decides colapsar a `pz`, quita "unidad" del selector en el Prompt 2 y del enum de validación en el Prompt 1.

> **Canales de alta de orden afectados por el peso (revisión de código 2026-06-13):** el cobro por peso solo está soportado en el **TPV**. TODOS los demás canales que crean órdenes con cantidad libre deben **rechazar** productos pesables (no truncar con `parseInt`). Ubicaciones reales verificadas:
> - `apps/backend/src/routes/orders.routes.js` — TPV (soporta peso; se modifica en el Prompt 1).
> - `apps/backend/src/routes/store.routes.js` (~línea 603, `parseInt(quantity)`) — tienda online → **guard**.
> - `apps/backend/src/routes/kiosk.routes.js` (~línea 124, `item.quantity || 1`) — kiosko autoservicio → **guard** (el documento original lo omitía).
> - `apps/backend/src/services/whatsapp-bot/order.js` (~línea 54) y `.../nlu.js` (~línea 63) — bot de WhatsApp. **OJO:** el bot crea la orden con `prisma.order.create` directo en `services/whatsapp-bot/`, NO pasa por `routes/`; el guard de `store.routes` NO lo cubre.
> - Fuera de alcance (solo dejar nota, no romper): `apps/backend/src/services/order-dictation.service.js` (dictado por voz, cantidad entera — el peso por voz es inviable, mantener entero/guard) y `apps/backend/src/routes/sales-import.routes.js` (~línea 241, `Math.round(qty)` — import histórico CSV, dejar como está).

---

## PROMPT 1 — Base de datos + Backend

```
Contexto: monorepo mrtpvrest. Voy a agregar "unidad de venta" a los productos y cobro por peso real.
Modelo: unit ∈ {pz, unidad, g, kg}. pz/unidad son enteros; g/kg son pesables (cantidad decimal).
El precio se interpreta literal por la unidad elegida, así que subtotal = price × quantity en todos los casos.

REGLAS PERMANENTES (obligatorias):
- Hay DOBLE schema de Prisma. Edita AMBOS y déjalos idénticos:
  - packages/database/prisma/schema.prisma  (FUENTE DE VERDAD: migraciones + generate viven aquí)
  - apps/backend/prisma/schema.prisma
- PROHIBIDO `prisma db push` (el CLAUDE.md lo veta: ya causó drift en prod, hay una migración de
  reconciliación 20260612210000_reconcile_db_push_drift). Genera SIEMPRE migración con `prisma migrate dev`
  y aplícala a prod con `prisma migrate deploy` MANUAL (Railway no aplica migraciones, solo `prisma generate`).
- Tenant pattern: req.user?.restaurantId || req.restaurantId.

1) PRISMA (en AMBOS schemas):
   - Modelo MenuItem: agrega `unit String @default("pz")` (junto a barcode / hasVariants).
   - Modelo OrderItem: cambia `quantity Int` → `quantity Float`.
   - Modelo OrderItem: agrega `unit String @default("pz")` (snapshot denormalizado para comanda/recibo/reimpresión).
   Luego genera la migración con `prisma migrate dev` (NO db push) contra el schema fuente de verdad y regenera el cliente.
   Comandos esperados (los scripts ya existen):
     - Generar migración (local): `pnpm --filter @mrtpvrest/backend db:migrate`
       (= `prisma migrate dev --schema=../../packages/database/prisma/schema.prisma --name add_unit_and_decimal_quantity`)
     - Regenerar cliente: `pnpm --filter @mrtpvrest/database db:generate`
     - Aplicar a prod (MANUAL, coordinado con deploy): `pnpm --filter @mrtpvrest/database db:migrate` (= `prisma migrate deploy`)
   Confirma en el SQL generado que el cambio Int→Float es un ALTER COLUMN TYPE double precision (ensanchamiento sin pérdida).
   Deja la carpeta de migración nueva commiteada bajo packages/database/prisma/migrations.

2) apps/backend/src/routes/menu.routes.js:
   - Helper local `normUnit(u)`: valida contra {pz, unidad, g, kg}; default "pz" si inválido/ausente.
   - POST /items: acepta `unit` del body y persiste `unit: normUnit(unit)`.
   - PUT /items/:id: `...(unit !== undefined && { unit: normUnit(unit) })`.

3) apps/backend/src/routes/orders.routes.js:
   - Helpers: `isWeighable(unit)` (g|kg) y `parseQty(raw, unit)`:
       * pesable → parseFloat(raw); exige > 0; NO redondear el peso.
       * no pesable → Math.max(1, parseInt(raw, 10)).
   - Helper `round2(n)` = Math.round(n * 100) / 100.
   - En el alta de orden del TPV: para cada item resuelve unit del payload, con fallback al menuItem.unit consultado.
     Usa parseQty(item.quantity, unit). Persiste `unit` en el OrderItem creado.
   - IMPORTANTE (redondeo de dinero): el TOTAL de la orden ya pasa por round2 dentro de `computeOrderTotals`
     (lib/money.js:117-119), así que el corte de caja ya está cubierto. Lo que NO se redondea hoy es el
     `subtotal` PERSISTIDO por línea (orders.routes.js: `subtotal: unitPrice * item.quantity` en el create ~561,
     y `subtotal: price * qty` en el add-to-order ~876). Aplica round2() a ESE subtotal de línea para que el
     OrderItem.subtotal guardado no quede como 153.60000001.
   - PUT /api/orders/items/:id (~línea 988): hoy hace `Math.max(1, Math.min(99, parseInt(quantity,10)...))`.
     Cuando el OrderItem.unit sea pesable: usa parseQty con el unit del OrderItem (decimal, > 0) y NO apliques
     el tope Math.min(99) ni el parseInt — esos solo deben seguir aplicando a los no pesables.

4) GUARD canales sin soporte de peso (no solo comentario). En CADA canal que crea órdenes con cantidad
   libre y NO es el TPV: si el menuItem.unit es pesable (g|kg), RECHAZA el item con HTTP 400 y mensaje claro
   ("Este producto se vende por peso y solo puede cobrarse desde el TPV"), en vez de truncar con parseInt.
   Define un helper compartido `isWeighable(unit)` (o reutilízalo) para no duplicar la lógica.
   Canales verificados que DEBEN llevar el guard (ubicaciones reales):
   - apps/backend/src/routes/store.routes.js (~línea 603, hoy `Math.max(1, parseInt(quantity) || 1)`) — tienda online.
   - apps/backend/src/routes/kiosk.routes.js (~línea 124, hoy `item.quantity || 1`) — kiosko autoservicio.
   - apps/backend/src/services/whatsapp-bot/order.js (~línea 54) y .../nlu.js (~línea 63) — bot de WhatsApp.
     OJO: el bot hace `prisma.order.create` directo en services/whatsapp-bot/ (NO pasa por routes/), así que
     el guard de store.routes NO lo cubre; hay que añadirlo aquí explícitamente (idealmente al cargar el menú
     en catalog.js o al resolver cada línea, marcando/filtrando los pesables con un mensaje al cliente).
   NO en alcance (no romper, solo dejar como está): order-dictation.service.js (dictado por voz, entero) y
   sales-import.routes.js (~línea 241, Math.round — import histórico).

Verificación:
- prisma studio / DB muestra menu_items.unit y order_items.quantity como float.
- No queda ningún parseInt(quantity) en el path de cobro del TPV que trunque el peso.
- Reportes/finanzas que suman quantity siguen compilando.
No toques admin ni TPV en este prompt.
```

---

## PROMPT 2 — Admin: selector de unidad + variantes/complementos inline

```
Contexto: archivo apps/admin/app/(admin)/admin/menu/page.tsx. El backend ya acepta `unit` en menu items
y ya existen los endpoints de variantes/complementos. Dos features sobre el MISMO formulario de producto.

FEATURE A — Unidad de venta:
- form state: agrega `unit: "pz"` en openForm (alta, edición y reset).
- Nuevo selector segmentado "Unidad de venta" con 4 botones: Pieza(pz) / Unidad(unidad) / Gramo(g) / Kilogramo(kg).
  Reutiliza el patrón de botones segmentados que ya se usa para imageFit.
- La etiqueta "Precio Base" pasa a ser dinámica según form.unit:
  "Precio por pieza" / "Precio por unidad" / "Precio por gramo" / "Precio por kilogramo".
- Incluye `unit` en el payload de saveItem y al cargar un item existente en openForm.

FEATURE B — Variantes y complementos inline al CREAR (sin guardar el item primero):
- Edita los arrays `variants` y `complements` del state LOCALMENTE dentro del modal (alta y edición),
  sin llamadas API por fila. Filas nuevas llevan id temporal `tmp_<n>`.
- Renderiza el EditableList (ya definido en el archivo pero hoy NO se pinta) con el switch de pestañas
  activeTab ('variants'/'complements') que ya existe en state. Cada fila: nombre + precio + editar/eliminar,
  más una mini-form "Agregar" (nombre + precio) que hace push al array local. Visible en crear y editar.
  Usa la UI del resto del formulario (WarmTech).
- Quita los gates `if (!editItem) return` de los handlers addVariant/addComplement.
- Snapshots para diff: en openForm (edición) guarda originalVariants/originalComplements (copias). En alta = [].
- saveItem "de un solo golpe":
   1. POST/PUT del item → obtén `id`.
   2. Reconcilia variantes: filas tmp_ → POST /api/menu/:id/variants;
      filas con id real y {name,price} cambiados → PUT /api/menu/variants/:id;
      ids en originalVariants ausentes ahora → DELETE /api/menu/variants/:id.
   3. Misma reconciliación para complementos
      (POST /api/menu/items/:id/complements, PUT/DELETE /api/menu/items/complements/:id).
   4. fetchData() y cierra modal.
- MANEJO DE ERROR (importante): el flujo NO es transaccional. Si el POST del item tuvo éxito pero falla
  un sub-POST de variante/complemento: NO cierres el modal. Cambia el modal a modo EDICIÓN con el `id`
  real recién creado, conserva las filas locales (las que fallaron siguen como tmp_), y muestra el error
  con extractErrorMessage para reintentar Guardar. Así no se pierde contexto ni queda un producto a medias.
- No toques el flag hasVariants manualmente: los endpoints de variantes ya lo mantienen.

El patrón "crear item y luego crear variantes en loop" ya existe en el escaneo IA (~líneas 199-204); reaprovéchalo.
Verificación: crear producto nuevo con unidad kg + 2 variantes + 1 complemento, Guardar UNA vez, y que todo
persista (GET /api/menu/items/:id). Reabrir en edición, editar/eliminar una variante y agregar otra, Guardar,
y verificar PUT/DELETE/POST correctos. hasVariants debe quedar true.
```

---

## PROMPT 3 — TPV: store + WeightModal + línea de ticket

```
Contexto: app TPV (apps/tpv). El backend ya persiste unit y quantity decimal; el admin ya marca productos
por peso. Falta el flujo de captura y cobro por peso en el TPV. Accent #ff5c35, tema dark bg-gray-900.

1) apps/tpv/src/store/ticketStore.ts:
   - Agrega `unit?: string` a Product (y por herencia a CartItem).
   - Exporta helpers:
     * isWeighable(unit) → unit === "g" || unit === "kg".
     * formatQty(qty, unit) → pesable: hasta 3 decimales sin ceros sobrantes + sufijo (kg/g);
       no pesable: entero sin decimales.
   - addItemToActive: generaliza el merge `ci.quantity + 1` → `ci.quantity + (tagged.quantity ?? 1)`
     para respetar el peso/cantidad entrante. El tap normal sigue pasando quantity: 1.
   - changeItemQty: mantén el filtro quantity > 0 (sigue siendo el stepper ±1 para no pesables).
   - Nueva acción setItemQty(index, qty): fija el peso ABSOLUTO de una línea (para pesables).

2) Nuevo componente apps/tpv/src/components/WeightModal.tsx (o la carpeta de modales del POS):
   - Teclado numérico táctil con el estilo del POS (bg-gray-800, accent #ff5c35).
   - Props: name, price, unit; callback onConfirm(weight) y onClose.
   - Muestra precio/unidad, el peso capturado, y el TOTAL EN VIVO = price × weight.
   - Botones 0-9, punto decimal, borrar, limpiar. Confirmar deshabilitado si weight <= 0.

3) apps/tpv/src/app/pos/menu/page.tsx (handler de tap del grid):
   - Si el producto isWeighable(unit) → abre WeightModal.
     Al confirmar: addItemToActive({ ...product, quantity: peso, subtotal: price*peso, unit }).
   - Productos no pesables conservan el flujo actual (configurador de variantes/modificadores o add directo).

4) apps/tpv/src/components/TicketLine.tsx:
   - Acepta prop `unit`. Si es pesable: reemplaza el stepper ±1 por un control que muestra
     formatQty(qty, unit) y, al tocarlo, reabre WeightModal en modo set ABSOLUTO (no ±1).
   - El renglón de precio muestra "precio / kg" (o /g). El subtotal usa price × quantity (ya soporta decimales).
   - No pesables: stepper ±1 como hoy.

5) apps/tpv/src/components/SidebarTicket.tsx:
   - Pasa `unit` a cada TicketLine y cablea setItemQty.
   - buildItemsPayload: incluye `unit` y envía `quantity` decimal SIN redondear.
   - changePreviousItemQty: permite decimal para pesables (baja prioridad, inclúyelo).

Verificación (pnpm --filter @mrtpvrest/tpv build):
- Tap a un producto kg ($320) → modal → 0.480 → línea muestra "0.48 kg" y subtotal $153.60.
- Agregar de nuevo el mismo producto SUMA el peso. Editar el peso desde la línea reabre el modal.
- Producto pz sigue con stepper ±1 y enteros (regresión).
No toques impresión en este prompt.
```

---

## PROMPT 4 — TPV: impresión (comanda + recibo)

```
Contexto: apps/tpv/src/lib/printer-tcp.ts. Los OrderItem ya traen `unit` y quantity decimal.
Falta reflejar el peso en comanda y recibo.

- Tipo TicketItem: agrega `unit?: string`.
- Helper local fmtQty(quantity, unit): pesable → hasta 3 decimales sin ceros sobrantes + sufijo;
  no pesable → entero.
- Comanda: el formato `${item.quantity}x ${name}` para pesables pasa a `${fmtQty(quantity, unit)} ${name}`
  (ej. "0.48 kg Arrachera"). No pesables conservan "2x Hamburguesa".
- Recibo de cliente (cuerpo de items): mismo formato de cantidad. El cálculo price × quantity ya soporta decimales;
  asegúrate de que el importe impreso por línea esté redondeado a 2 decimales.

Verificación: reabrir una orden con un item pesable y reimprimir comanda y recibo; debe mostrar el peso
("0.48 kg Arrachera") y el importe correcto sin decimales basura.
```

---

## Verificación end-to-end (después de los 4)

1. Admin: crear "Arrachera", unidad **kg**, precio 320 → persiste (`GET /api/menu/items`).
2. TPV: tap → WeightModal → 0.480 → línea `0.48 kg`, subtotal `$153.60`; sumar peso; editar peso desde la línea.
3. Cobrar → el `OrderItem` queda `quantity=0.48`, `unit="kg"`, total correcto y **redondeado a 2 decimales**.
4. Reabrir orden y reimprimir comanda/recibo con el peso.
5. Regresión: producto `pz` con stepper ±1 y enteros; reportes/finanzas suman `quantity` sin romperse.
6. Confirmar que ningún `parseInt(quantity)` en el path de cobro trunca el peso.
7. Feature B: crear producto + 2 variantes + 1 complemento con un solo Guardar; reabrir, editar/eliminar/agregar, Guardar; reconciliación correcta; `hasVariants=true`.
8. Guard: intentar pedir un producto pesable desde tienda online, **kiosko** y bot de WhatsApp → 400 / rechazo con mensaje claro en los tres.
9. DB: la migración nueva está en packages/database/prisma/migrations y `prisma migrate deploy` corre limpio (NO se usó db push).
```
