# Auditoría de diseño y navegación móvil — Panel admin tenant

**Fecha:** 2026-07-14 · **Alcance:** `apps/admin` (panel del tenant) · **Objetivo:** viewport 360–390 px (celular).

Análisis estático del código: el shell de navegación se revisó a mano y las 50 pantallas + ~40 subcomponentes se barrieron con agentes en paralelo buscando antipatrones a 375 px (rejillas de columnas fijas sin breakpoint, filas `flex` sin `flex-wrap`, tablas crudas sin scroll, anchos en píxeles, acciones ocultas, tap targets < 44 px). Validado con `tsc --noEmit` (0 errores). **No se hizo QA visual en dispositivo** (el admin requiere backend + auth + tenant); se recomienda una pasada visual en las pantallas marcadas.

## Veredicto

La base es sólida: el design system (`@/components/ds`) fue pensado para móvil — modales que se vuelven *bottom-sheet* (`overlay.tsx:22`), `DataTable` con `overflow-x-auto` + `hideBelowMd`, botones `min-h-11`, `PageShell` en 48/50 pantallas. El daño se concentraba en (1) un patrón de navegación sistémico, (2) huecos del shell móvil, y (3) ~6 editores de datos con rejillas de ancho fijo.

---

## Cambios aplicados en esta pasada

### Navegación / shell

- **`PageHeader` es `hidden md:flex`** (`ds/page.tsx:41`) → las acciones primarias no se renderizan en móvil. Se añadió el bloque `md:hidden` faltante (patrón ya usado en el repo) en las pantallas sin fallback:
  - `mi-cuenta/page.tsx` — botón **Guardar**.
  - `inventario/boveda/page.tsx` — **Depósito o retiro**.
  - `zonas/page.tsx` — **Nueva zona**.
  - `tienda/page.tsx` — **Guardar tienda**.
  - `promociones/page.tsx` — se agregó **Quitar todas** al bloque móvil (antes solo exponía "Analizar todas").
  - `pedidos/page.tsx` — se agregó el toggle **Lista/Kanban** al bloque móvil.
- **`MobileAdminChrome.tsx`** — la hoja "Más" ahora incluye un pie de cuenta con:
  - **Cerrar sesión** (antes solo existía en el `Sidebar` desktop-only; en móvil no había forma de salir).
  - **Cambio de marca / restaurante** (para tenants multi-marca; antes solo en el sidebar).
  - **Tema del panel** (`ThemeToggle`).
  - El avatar del header móvil ahora es un botón que abre la hoja "Más" (antes era un `<div>` inerte).
  - Etiquetas del bottom-nav `text-[9px]` → `text-[10px]`.
- **`(admin)/layout.tsx`** — se eliminó el andamiaje muerto de navegación móvil (`mobileNavOpen`, overlay y hamburguesa que nunca se disparaban; `<AdminTopbar>` se montaba sin `onOpenMenu`).

### Átomos del design system (propagan a todo el panel)

- **`ds/form.tsx` · `Segmented`** — se añadió `flex-wrap` para tolerar > 4 opciones (antes se partía/desbordaba en `whatsapp` con 6 pestañas y en el selector de período de `reportes/ia`).
- **`ds/button.tsx` · `IconButton`** — tamaño por defecto `36` → `40` px (más cerca del mínimo táctil).

### Editores de rejilla fija (el `<select>` principal ya no se aplasta)

Se reemplazaron los `gridTemplateColumns` en píxeles por un patrón responsive: el control principal ocupa su propia fila en móvil (`col-span-full sm:col-span-1`) y el resto baja a una segunda fila.

- `inventario/recetas/_components/RecipeEditor.tsx` — escandallo (antes el select de ingrediente caía a ~45 px).
- `inventario/subrecetas/_components/SubRecipeEditor.tsx` — mismo patrón.
- `inventario/compras/_components/PurchaseTab.tsx` — subtotal y borrar ya no se aplastan a `col-span-1`.
- `inventario/compras/_components/ScanReviewModal.tsx` — el select de asociación ya no cae a ~58 px.
- `components/admin/ModifierGroupsEditor.tsx` — fila de modificador con `flex-wrap` + `min-w-0` en el nombre + tap target de borrar 24 → 32 px.

### Otras pantallas (P0)

- `menu/_components/EditableList.tsx` — editar/eliminar pasaban de `opacity-0 group-hover:opacity-100` (invisibles al tacto) a visibles en móvil, con hover-reveal solo en `md:`.
- `caja-repartidores/page.tsx` — el **total del pedido** dejó de estar en `hidden sm:block`: ahora es visible en móvil (se confirmaban cobros en efectivo sin ver el monto).
- `empleados/page.tsx` — la barra flotante de acciones masivas pasa a full-width + `flex-wrap` en móvil (antes 5 hijos sin envolver recortaban "Eliminar" y la X fuera de pantalla).
- `rastreo/page.tsx` — el mapa `h-[520px]` fijo → `h-[62vh] min-h-[340px]`; el overlay de ruta pasa de tapar la esquina superior derecha a una barra inferior en móvil (`inset-x-3 bottom-3`, top-right en `md:`).

### Segunda pasada (seguimiento)

- `reportes/ia/_components/ChatPanel.tsx` — el chat ahora renderiza el markdown del backend (`**negritas**` y `[texto](enlace)`) como nodos React (sin dependencias ni `innerHTML`) y agrega `break-words` (URLs/tokens largos ya no desbordan la burbuja).
- `reportes/ia/_components/SedesTable.tsx` · `reportes/repartidores/page.tsx` — columnas secundarias marcadas `hideBelowMd` para reducir el scroll horizontal en móvil (SedesTable deja Sede+Ventas; el reporte de repartidores oculta Teléfono/Envío/Hora).
- `tienda/_components/ScheduleCard.tsx` · `promociones/page.tsx` — filas de horario con `flex-wrap` (los `input[type=time]` ya no se recortan).
- `ds/form.tsx` · `Toggle` — área táctil ampliada con hit-slop (`before:-inset-2`) sin cambiar el tamaño visual.
- `billing/page.tsx` — KPIs de suscripción a 1 columna en móvil (`grid-cols-1 sm:grid-cols-2 md:grid-cols-4`); el rango de fechas del período ya no se amontona.
- `MobileAdminChrome.tsx` · `AdminTopbar.tsx` — se quitó el punto rojo de notificaciones (estaba hardcodeado siempre encendido = alerta falsa permanente). Si se quiere un indicador real, conectarlo a estado de pedidos.
- `components/dashboard/widgets.tsx` — etiquetas horarias del heatmap `text-[8px]` → `text-[9px]` (el rediseño compacto móvil sigue pendiente).

---

## Pendientes recomendados (no incluidos)

Requieren decisión de producto o QA visual; ninguno bloquea el uso:

| Pantalla / componente | Hallazgo | Sev. |
|---|---|---|
| `components/dashboard/widgets.tsx:145` | Heatmap de horas pico `min-w-[560px]` + labels `text-[8px]` (scroll obligatorio, ilegible). Rediseñar a vista compacta móvil. | P1 |
| `zonas/page.tsx` · `DeliveryZoneMap.tsx` | Editor de polígonos: mapa de altura fija + flujo dibujar-abajo/guardar-arriba. Reordenar en móvil. | P1 |
| `ds/button.tsx` · `IconButton` | Subir de 40 → 44 px para cumplir HIG/Material del todo (evaluar impacto en filas densas). | P2 |
| `ventas/importar/page.tsx:206` | Grid de stats `grid-cols-3` algo apretado en móvil (funcional). | P2 |
| `AdminTopbar.tsx:136` | El buscador ⌘K de secciones es desktop-only; en móvil no hay búsqueda entre ~45 secciones. | P2 |
| `PageHeader` (`ds/page.tsx:41`) | Refactor estructural: auto-render de `actions` en móvil para retirar los ~14 bloques `md:hidden`. Mayor apalancamiento pero toca muchas pantallas → hacer con QA visual (PR propio). | — |

**Refactor estructural recomendado (mayor apalancamiento):** hacer que `PageHeader` renderice `actions` en un contenedor visible en móvil, y retirar los ~14 bloques `md:hidden` duplicados por pantalla. Elimina de raíz la clase "acción perdida", pero toca muchas pantallas con tratamientos móviles heterogéneos → hacerlo con QA viser. En esta pasada se optó por los fixes por pantalla (menor riesgo).

---

## Reglas de no-regresión (móvil)

- Toda acción primaria de una pantalla debe ser alcanzable en móvil. `PageHeader` es desktop-only; da la acción en celular con el prop **`mobileActions`** de `PageHeader` (ver `mi-cuenta`, `boveda`, `zonas`, `tienda`). Para tratamientos móviles a medida (varios botones, indicadores, previews) sigue valiendo un bloque `md:hidden` propio (ver `menu`, `empleados`, `pedidos`).
- Funciones de cuenta (salir, cambiar marca/sucursal, tema) viven en la hoja "Más" de `MobileAdminChrome` **y** en el `Sidebar` desktop — mantener ambas en paridad.
- Editores de filas: no usar `gridTemplateColumns` en píxeles sin variante móvil. El control principal (`<select>`/nombre) debe poder ocupar su fila (`col-span-full sm:col-span-1`).
- Filas `flex` con 3+ hijos y contenido de texto: incluir `flex-wrap` o `overflow-x-auto`.
- No ocultar información crítica (montos, totales) con `hidden sm:block` en flujos de cobro.
- Tap targets interactivos ≥ 40 px (idealmente 44).
