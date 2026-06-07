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
+ `inputMode="numeric"` estaba repetida en varios editores de PIN.

**Solución:** nuevo `src/components/ui/PinInput.tsx`, un wrapper agnóstico de
estilo (reenvía `className`/`style`/`placeholder` al `<input>`) con variante
`masked`. Aplicado al único editor de PIN **vivo** que quedó tras limpiar el
código muerto: el `EmployeeModal` inline de `app/admin/usuarios/page.tsx`.

## ✅ Arreglado — Sistema de modales muerto eliminado

**Problema:** la app tenía dos arquitecturas de modal. Al verificar resultó que
**toda** la basada en `ModalStack` + `ModalContext` estaba muerta: el único
componente que montaba `<ModalStack>` era `TPVLayoutWrapper`, que no se usaba en
ningún lado (pertenecía a la antigua página raíz, conservada como
`page.tsx.bak`). Ninguna pantalla llamaba `openPayment`/`openDiscount`/etc. Los
flujos vivos están inline en las páginas admin y en `components/pos/`.

**Solución:** se eliminaron 14 archivos muertos:
- `components/tpv/ModalStack.tsx`, `components/tpv/TPVLayoutWrapper.tsx`,
  `contexts/ModalContext.tsx`
- `components/modals/`: PaymentModal, DiscountModal, OrderDetailModal,
  ProductModal, CategoryModal, EmployeeModal, ReportModal, ConfirmModal,
  ChangeOrderTypeModal, TicketConfigModal
- `app/page.tsx.bak` (backup obsoleto)
- `ModalRoot` dejó de envolver en `<ModalProvider>`.

`components/modals/CatalogSettingsSheet.tsx` se conserva (lo usa
`pos/menu/layout`).

## ✅ Arreglado — TPVConfigModal e IngredientShortageModal muertos

Al borrar `ModalStack` quedaron sin importadores (eran rendereados solo por él):

- `components/admin/TPVConfigModal.tsx` (~1000 líneas)
- `components/admin/IngredientShortageModal.tsx`

Se eliminaron. Esto resuelve de un solo golpe varios hallazgos de la auditoría
porque vivían dentro de TPVConfigModal:

- **Display config huérfana**: su pestaña "Pantalla" escribía
  `tpv-display-config` (`gridSize`, `sound`, `showImages`, `fontSize`) que
  **nadie leía** — el catálogo vivo usa `useCatalogPrefs` (density/viewMode) vía
  `CatalogSettingsSheet`. El cajero cambiaba esos ajustes y no pasaba nada.
- **Tickets/cocina duplicados**: el editor vivo es `app/admin/tickets/page.tsx`.
- **Ruteo de impresoras** dentro de TPVConfigModal (capa redundante).
- **Overlay anidado** (form de impresora dentro del modal).

> ⚠️ Hueco abierto: `components/settings/DualScreenSettings.tsx` (config de
> doble pantalla, feature viva) solo se montaba dentro de TPVConfigModal, así
> que **ya era inalcanzable** en la app actual. El archivo se conserva sin
> borrar; falta **surfacearlo en una página admin viva** (p.ej. una nueva
> `admin/pantalla` o dentro de `admin/apariencia`). Decisión pendiente.

---

## Pendiente — recomendaciones (no incluidas en este PR)

Refactors mayores que requieren decisiones de diseño y se dejan fuera por
riesgo/alcance:

### Redundancias / huecos

- **Doble pantalla sin UI**: re-montar `DualScreenSettings` en una página admin
  viva (ver arriba).
- **Ruteo de impresoras en 3 sitios**: `admin/impresoras` (directo),
  `admin/grupos-impresoras` (grupo) y `PrinterCategoriesModal`. Precedencia poco
  clara → elegir modelo canónico.
- **Dos sistemas de permisos** (legacy + "Phase 10") en `admin/usuarios`.
- **Configurador inline duplicado**: `app/pos/menu/page.tsx` reimplementa la
  lógica de grupos/variantes/validación; convendría extraer un componente
  compartido. (Los duplicados muertos ya se eliminaron.)

### Arquitectura de modales

- Los modales restantes (`ShiftModal`, `DriverMovementsModal`,
  `PrinterCategoriesModal`, y los `components/pos/` de pago/descuento) usan
  overlay propio en vez de un `BaseModal` común. → unificar sobre `BaseModal`.

### Claridad

- Botón "probar impresora" escondido dentro del form de edición.
- Variantes vs Modificadores vs Complementos (3 sistemas en `admin/menu`) sin
  guía de uso; "3 sin costo" ambiguo.
- "Cancelar" en el modal de pago se confunde con "cancelar la orden".
- Modo claro experimental con bugs conocidos sigue visible.
- El editor de categoría tiene campo `icon` en el modelo pero no en el form.

### Flujo

- Setup wizard sin botón "atrás"; rol de dispositivo permanente sin
  confirmación (exige reinstalar para cambiar).
- Zonas configurables en `admin/mesas` y `TPVConfigModal`, pero no se pueden
  crear desde Mesas.
- Sin confirmación/estado de carga en descuento, cobro y "agregar al ticket".
- `ReportModal` acepta rangos de fecha inválidos.
- Cambiar de tab pierde cambios no guardados en `TPVConfigModal`.
