# Auditoría de Configuraciones del TPV

Auditoría de las pantallas de configuración, modales, redundancias, claridad y
flujo del TPV. Documenta los hallazgos y marca qué se arregló en este PR y qué
queda como trabajo recomendado.

## Resumen

El TPV tiene buena cobertura funcional de configuración pero sufre de
**fragmentación**: la misma configuración vive en varios lugares, conviven dos
sistemas de modales, y la persistencia está repartida entre Zustand,
localStorage directo y cookies sin una fuente de verdad única.

---

## ✅ Arreglado en este PR — Apariencia unificada

**Problema:** los 4 controles de apariencia (tamaño de letra, ancho del panel
ticket, paleta, modo nocturno) estaban implementados dos veces, y el mapeo
`small/medium/large → px` estaba escrito tres veces:

- `components/pos/ConfigMenu.tsx` (rail POS)
- `app/admin/apariencia/page.tsx` (panel admin)
- `components/tpv/ModalRoot.tsx` (boot)

**Bugs derivados:**

1. `/admin/apariencia` NO emitía `ui-scale-changed`, así que cambiar el tamaño
   de letra desde el admin dejaba el picker del rail POS desincronizado hasta
   recargar (el evento nativo `storage` no se dispara en la misma pestaña).
2. `/pos/menu/layout.tsx` aplicaba un ancho de panel **distinto** al anunciado:
   los pickers mostraban `320 / 380 / 440px` pero el panel aplicaba
   `300 / 320 / 400px`. El usuario nunca obtenía el ancho prometido.

**Solución:** se creó `src/lib/appearance.ts` como fuente única de verdad
(tipos, defaults, labels, lectura/escritura + emisión de eventos). Todos los
consumidores ahora lo usan:

- `ConfigMenu.tsx`, `app/admin/apariencia/page.tsx` → pickers comparten lógica.
- `ModalRoot.tsx` → aplica al boot y reacciona en caliente a `ui-scale-changed`.
- `app/pos/menu/layout.tsx` → usa `sidebarPresetToPx`, ahora coincide con los
  labels (320 / 380 / 440px).

---

## ✅ Arreglado — Claves de tenant consolidadas

**Problema:** `activeRestaurantId` / `activeLocationId` eran duplicados exactos
de `restaurantId` / `locationId`. El Hub escribía ambos juegos en paralelo con
el mismo valor, y el fallback `restaurantId || activeRestaurantId` estaba
copiado en 3 sitios (`lib/api.ts`, `centro/costos`, `centro/mermas`). Riesgo de
divergencia silenciosa en consultas multi-tenant.

**Solución:** nuevo `src/lib/tenant.ts` como acceso centralizado:

- `getRestaurantId()` / `getLocationId()` / `getTenantIds()` leen las canónicas
  con fallback a las legacy `active*` (compatibilidad con dispositivos sin
  rotar). Único lugar donde vive el fallback.
- `setTenant()` escribe solo las canónicas → no se vuelven a crear llaves
  paralelas.
- El Hub deja de escribir `activeRestaurantId` / `activeLocationId` (mantiene
  `activeWorkspaceId` / `activeWorkspaceName`, que son flag/nombre de workspace,
  no tenant).
- `api.ts`, `centro/costos`, `centro/mermas`, `useNotifications` y `kiosk` leen
  vía los getters. Las llaves legacy quedan solo como fallback de lectura y se
  podrán eliminar cuando toda la flota haya rotado.

---

## ✅ Arreglado — Configuradores de producto duplicados (código muerto)

**Problema:** la auditoría reportó `VariantPickerModal` vs
`ProductConfiguratorModal` como modales redundantes para seleccionar variantes.
Al investigar resultó peor: el configurador **vivo** está inline en
`app/pos/menu/page.tsx`, y había **tres** archivos muertos sin referencias que
lo duplicaban:

- `components/modals/VariantPickerModal.tsx` (100% sin uso)
- `components/modals/ProductConfiguratorModal.tsx` (100% sin uso)
- `components/pos/ModifierPickerModal.tsx` (componente default muerto; solo se
  usaban sus dos constantes de prefijo)

**Solución:** se movieron las dos constantes (`COMPLEMENT_MODIFIER_PREFIX`,
`VARIANT_MODIFIER_PREFIX`) a `src/lib/modifiers.ts`, se actualizaron los dos
importadores vivos (`pos/menu/page.tsx`, `SidebarTicket.tsx`) y se eliminaron
los tres archivos muertos.

## ✅ Arreglado — Componente de PIN reutilizable

**Problema:** la regla "solo dígitos, máx 6" (`replace(/\D/g, "").slice(0, 6)`)
+ `inputMode="numeric"` estaba copiada en `EmployeeModal` y `DiscountModal`, con
mensajes inconsistentes (label "4-6 dígitos" vs error "al menos 4 dígitos").

**Solución:** nuevo `src/components/ui/PinInput.tsx` con variantes `masked`
(PIN de autorización, type=password) e icono de candado. Lo usan `EmployeeModal`
y `modals/DiscountModal`. Se alineó el mensaje de validación a "PIN de 4 a 6
dígitos".

> Nota: `components/modals/TicketConfigModal.tsx` (que también reimplementaba el
> PIN) resultó ser código muerto — el editor de tickets vivo es
> `app/admin/tickets/page.tsx`. Queda como dead-code a eliminar (ver pendientes).

---

## Pendiente — recomendaciones (no incluidas en este PR)

Refactors mayores que requieren decisiones de diseño y se dejan fuera por
riesgo/alcance:

### Redundancias

- **Display config repartida en 3 mecanismos**: `useThemeStore` (Zustand),
  localStorage (`uiScale`, `sidebarWidth`) y `tpv-display-config`
  (`gridSize`, `sound`, `showImages`, `fontSize`). Además `gridSize`/`fontSize`
  se solapan con `CatalogSettingsSheet` y el tab display de `TPVConfigModal`.
- **Config de tickets/cocina duplicada**: `TicketConfigModal` ↔ tab Cocina de
  `TPVConfigModal`. → una sola fuente.
- **Ruteo de impresoras en 3-4 sitios**: `admin/impresoras` (directo),
  `admin/grupos-impresoras` (grupo), `PrinterCategoriesModal`, form de
  `TPVConfigModal`. Precedencia poco clara.
- **Dos sistemas de permisos** (legacy + "Phase 10") en `admin/usuarios`.
- **Configurador inline duplicado**: `app/pos/menu/page.tsx` reimplementa la
  lógica de grupos/variantes/validación; convendría extraer un componente
  compartido. (Los duplicados muertos ya se eliminaron.)
- **Dead code**: `components/modals/TicketConfigModal.tsx` y los dos
  DiscountModal/PaymentModal paralelos (`components/modals/` vs
  `components/pos/`) — revisar y eliminar los no usados.

### Arquitectura de modales

- **Dos sistemas**: 10 modales usan `BaseModal` + `ModalContext` + `ModalStack`;
  9 usan overlay propio fuera del stack (ProductConfigurator, VariantPicker,
  CatalogSettingsSheet, TicketConfigModal, TPVConfigModal, ShiftModal,
  IngredientShortageModal, DriverMovementsModal, PrinterCategoriesModal).
  Resultado: sin stacking consistente, riesgo de z-index, escape inconsistente.
- `TPVConfigModal` abre el form de impresora como **overlay anidado** dentro de
  sí mismo.

### Claridad

- Botón "probar impresora" escondido dentro del form de edición.
- Variantes vs Modificadores vs Complementos (3 sistemas en `admin/menu`) sin
  guía de uso; "3 sin costo" ambiguo.
- "Cancelar" en `PaymentModal` se confunde con "cancelar la orden".
- Modo claro experimental con bugs conocidos sigue visible.
- `CategoryModal` tiene campo `icon` en el modelo pero no en el formulario.

### Flujo

- Setup wizard sin botón "atrás"; rol de dispositivo permanente sin
  confirmación (exige reinstalar para cambiar).
- Zonas configurables en `admin/mesas` y `TPVConfigModal`, pero no se pueden
  crear desde Mesas.
- Sin confirmación/estado de carga en descuento, cobro y "agregar al ticket".
- `ReportModal` acepta rangos de fecha inválidos.
- Cambiar de tab pierde cambios no guardados en `TPVConfigModal`.
