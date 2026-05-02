# Plan: Completar TPV alineado con `apps/tpvcomplete.pen`

> **Para agentes:** sub-skill recomendada `superpowers:executing-plans`. Tareas marcadas `- [x]` ya están hechas y empujadas a `origin/master`. Continuar desde la primera `- [ ]`.

**Goal:** Cerrar el gap entre el archivo de diseño `apps/tpvcomplete.pen` (11 frames) y la implementación en `apps/tpv`. Las pantallas críticas de operación diaria (Hub, Cierre, Reportes) ya están listas; quedan refinamientos de POS/KDS/Meseros y secciones admin.

**Stack:** Next.js 14 App Router · Tailwind · Zustand · TypeScript · backend Express + Prisma. Cookies `tpv-device-linked` + `tpv-session-active`. Auth via `useAuthStore` (PIN offline-first). API client en `apps/tpv/src/lib/api.ts`.

**Diseño:** abrir `apps/tpvcomplete.pen` con `mcp__pencil__open_document`, luego `get_screenshot` por nodeId. IDs relevantes:
- `T8WfV` Hub · `gcUb9` Cierre · `pXWJr` Reportes · `ANTLd` POS
- `v6zVvJ` KDS · `lG6SJ` Meseros · `JJuHG` OrderType · `ZksX6` Admin · `wNV9I`/`qRu4a` Setup · `VrFon` Locked

---

## Estado actual

### ✅ Completado y pushed

- [x] **Hub multi-workspace** (`/hub`) — `T8WfV`
  - Backend: `GET /api/workspaces/me` en `apps/backend/src/routes/workspaces.routes.js`
  - UI: `apps/tpv/src/app/hub/page.tsx`
  - Middleware: protege `/hub`
  - `/locked` redirige a `/hub` post-PIN
- [x] **Cierre de Turno - Corte Ciego** (`/cierre`) — `gcUb9`
  - Reutiliza endpoints existentes `GET /api/shifts/current` + `POST /api/shifts/:id/close`
  - UI: `apps/tpv/src/app/cierre/page.tsx`
  - Draft persistence en localStorage
  - Middleware: protege `/cierre`
- [x] **Reportes de Ventas** (`/admin/reportes`) — `pXWJr`
  - Reutiliza `GET /api/reports/{dashboard,by-day,top-products}`
  - UI: `apps/tpv/src/app/admin/reportes/page.tsx`
  - Link añadido a `apps/tpv/src/app/admin/layout.tsx`
- [x] **ProductCard bento tile** — `ANTLd` aesthetic
  - `apps/tpv/src/components/pos/ProductCard.tsx`
  - 12-color palette con hash determinístico, contraste auto, botón circular `+`

---

## Tareas pendientes

### Tier 1 — Refinar POS/KDS/Meseros (auditoría 🟡4)

#### Task 1: Panel de Orden lateral en POS (alta prioridad)
**Files:**
- Crear: `apps/tpv/src/app/pos/layout.tsx`
- Crear: `apps/tpv/src/components/pos/OrderPanel.tsx`
- Modificar: `apps/tpv/src/app/pos/menu/page.tsx` (envolver en grid)

**Pencil ANTLd derecha:** Order #138 con items + subtotal + IVA + propina + descuento + total grande verde + botón "Cobrar" naranja primario.

- [x] **Step 1:** Crear `pos/layout.tsx` con grid `[1fr_400px]` que envuelva `{children}` en la columna izq y renderice `<OrderPanel />` en la der. Layout sticky a la altura completa.
- [x] **Step 2:** Crear `OrderPanel.tsx` que lea `useTicketStore.getActiveTicket()` y muestre:
  - Header: `Order #${ticket.id.slice(-3)}` + badge tipo de orden + botón cerrar
  - Lista scroll de items con qty controls + price + remove
  - Footer fijo: subtotal, IVA 16%, propina (input), descuento (input), TOTAL grande
  - Botón primario "Cobrar" → push a `/pos/checkout` (TODO: ruta no existe aún)
- [ ] **Step 3:** Verificar responsive: en mobile el panel se vuelve drawer (modal bottom sheet).

#### Task 2: Modal Numpad PIN para confirmar entrega en KDS
**Files:**
- Modificar: `apps/tpv/src/app/kds/page.tsx`

**Pencil v6zVvJ:** modal central con numpad PIN cuando se va a marcar orden como entregada (auditoria + RBAC).

- [x] **Step 1:** En `KDSPage`, cuando se hace click en botón "ENTREGAR" de una card, abrir modal con `<NumpadPIN />` (componente ya existe en `components/NumpadPIN.tsx`).
- [x] **Step 2:** Validar PIN contra `useAuthStore.loginEmployee` (silent re-auth). Si OK → POST `/api/kds/orders/:id/deliver`, refresh.
- [x] **Step 3:** Mostrar nombre del empleado que entregó en la orden cerrada.

#### Task 3: Header rico de Meseros + counts en categorías
**Files:**
- Modificar: `apps/tpv/src/app/(waiter)/meseros/[id]/orden/page.tsx`
- Posiblemente: `apps/tpv/src/components/pos/CategoryRail.tsx`

**Pencil lG6SJ:** Header muestra "Mesa 4 · 2 invitados", estados promo, sucursal, total acumulado. Categorías con count "BURGERS 8".

- [x] **Step 1:** Reemplazar el `ChevronLeft + nombre` por header con grid: izq info mesa + center stats acumulados + right botón cerrar mesa.
- [x] **Step 2:** Modificar `CategoryRail` para aceptar prop `counts: Record<string, number>` y mostrar pill numérico junto a cada categoría.
- [x] **Step 3:** Calcular counts iterando `products` por `categoryId`.

---

### Tier 2 — Secciones Admin faltantes 🟢5

El sidebar del Pencil `pXWJr` muestra estas rutas — solo están **Reportes**, **Menú**, **Impresoras**, **Tickets**. Faltan:

#### Task 4: `/admin/usuarios` (gestión de empleados)
**Files:**
- Crear: `apps/tpv/src/app/admin/usuarios/page.tsx`
- Backend ya tiene: `GET /api/employees`, `POST /api/employees`, `PUT /api/employees/:id`, `DELETE /api/employees/:id`

- [x] **Step 1:** Tabla con columnas: nombre, role, email, last sync, isActive toggle, acciones (edit/delete).
- [x] **Step 2:** Botón "+ Nuevo empleado" abre modal con form (name, role, pin, permissions checkboxes).
- [x] **Step 3:** Añadir link al sidebar en `apps/tpv/src/app/admin/layout.tsx`.

#### Task 5: `/admin/pagos` (configuración pagos e impuestos)
**Files:**
- Crear: `apps/tpv/src/app/admin/pagos/page.tsx`

- [x] **Step 1:** Form: IVA % default, propina sugerida %, métodos de pago habilitados (toggles: efectivo, tarjeta, transferencia, vales, cortesía).
- [x] **Step 2:** PUT a `/api/admin/config` (endpoint ya admite `taxRate` etc.).
- [x] **Step 3:** Añadir link al sidebar.

#### Task 6: `/admin/seguridad` (RBAC + auditoría)
**Files:**
- Crear: `apps/tpv/src/app/admin/seguridad/page.tsx`

- [x] **Step 1:** Sección 1: matriz de permisos por rol (heredar de `ROLE_DEFAULTS` en `employees.routes.js`).
- [x] **Step 2:** Sección 2: tabla AccessLog últimos 100 (modelo ya existe en Prisma).
- [x] **Step 3:** Toggles para: requerir PIN supervisor en void, cancelar orden, descuento >X%.
- [x] **Step 4:** Añadir link al sidebar.

---

### Tier 3 — Cleanup 🟢6

#### Task 7: Eliminar rutas legacy
**Files:**
- Eliminar: `apps/tpv/src/app/spa/` (carpeta completa)
- Eliminar: `apps/tpv/src/app/v2/` (carpeta completa)

- [x] **Step 1:** Verificar con `grep -r "from.*['\"].*spa\|v2['\"]" apps/tpv/src` que no haya imports activos.
- [x] **Step 2:** Si limpio, `rm -rf apps/tpv/src/app/spa apps/tpv/src/app/v2`.
- [x] **Step 3:** Build check: `cd apps/tpv && npm run build`.

---

### Tier 4 — Pulido fino (opcional)

#### Task 8: Auditar diseño de pantallas existentes vs Pencil
- [ ] `/setup` (steps Login/Location/Device) vs `wNV9I` + `qRu4a`
- [ ] `/locked` vs `VrFon` (numpad y dot indicators)
- [ ] `/pos/order-type` vs `JJuHG` (6 cards Comer Aquí/Llevar/Domicilio/Drive/Reserva/Rápido)
- [ ] `/admin/impresoras` vs `ZksX6` (sidebar + grid devices + side preview ticket)

Para cada uno: tomar screenshot de implementación corriendo, comparar lado-a-lado con `get_screenshot` del Pencil, listar diferencias visuales, aplicar correcciones quirúrgicas.

---

## Verificación final

Tras cada batch de tareas:

```bash
cd apps/tpv
npx tsc --noEmit -p tsconfig.json   # debe decir: TypeScript: No errors found
npm test                             # 23/23 pass mínimo
```

Commit con mensaje descriptivo apuntando al frame del Pencil (`Closes ANTLd from tpvcomplete.pen` etc.) y push a `origin/master`.

## Convenciones aprendidas (de commits previos)

- **Paleta tokens:** `#0C0C0E` bg, `#1A1A1A` cards, `#2E2E2E` borders, `#FF8400` primary, `#88D66C` success, `#FFB84D` warning, `#FF5C33` danger, `#B8B9B6` muted, `#666` tertiary.
- **Tipografía:** `JetBrains Mono` para UI tactical/admin, `Outfit` para headings cuando aplica.
- **Patrón header dark:** `#1A1A1A` con `border-bottom: 1px solid #2E2E2E`.
- **Pills/chips:** `rounded-full`, `padding: [6,12]`, `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.08)`.
- **Glows decorativos:** `radial-gradient(circle, ${color}30 0%, transparent 70%)` absolutos esquinas.
- **Cards:** `rounded-2xl`, `bg #1A1A1A`, `border 1px solid #2E2E2E`, padding 20-24.
