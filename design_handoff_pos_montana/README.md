# Handoff: MRTPVREST · TPV Restaurante (Punto de Venta)

> Paquete de diseño para implementar el TPV multi-rol (cajero + mesero) en
> **Next.js 14 (App Router) + Tailwind CSS** dentro del monorepo Turborepo
> existente, usando los tokens `surf` / `tx` / `bd` / `iris` y las fuentes
> Syne / DM Sans / DM Mono ya configuradas con `next/font/google`.

---

## 0 · Cómo usar este paquete

Los archivos en `reference/` son **prototipos HTML** creados como referencia
visual y de comportamiento. **NO son código de producción para copiar
directamente**. Tu tarea es **reproducirlos pixel-perfect** dentro del
codebase Next.js usando los componentes, tokens y patrones que ya tienes.

- Tokens del prototipo (`reference/tokens.css`) → mapéalos a tu paleta
  `surf/tx/bd/iris` (tabla en §3).
- Componentes JSX del prototipo (`reference/*.jsx`) → úsalos como spec de
  layout, estados y lógica. Reescríbelos como **Server / Client Components**
  de Next.js. La lógica `useState` actual es válida tal cual en Client
  Components (`'use client'`).
- HTML compilado (`reference/*.html`) → ábrelo en el browser para inspeccionar
  comportamiento real (clicks, drawers, modales, toggles).
- Screenshots (`screenshots/`) → la verdad sobre el layout final por pantalla.

**Fidelidad: alta (hi-fi).** Colores, tipografías, espaciados y radios son
finales. Reproduce 1:1.

---

## 1 · Stack objetivo

| Pieza | Versión / decisión |
|---|---|
| Framework | Next.js 14 · App Router |
| Monorepo | pnpm + Turborepo |
| Estilos | Tailwind CSS + variables CSS |
| Tokens propios | `surf-*`, `tx-*`, `bd-*`, `iris-*` |
| Tipografías | `Syne` (display) · `DM Sans` (body) · `DM Mono` (números/tickets) — vía `next/font/google` |
| Componentes | Sin shadcn / sin Material — **componentes propios** |
| Iconos | SVG inline (las definiciones están en cada archivo `*-frame*.jsx`, función `Icon` / `MIcon`) |
| Estado cliente | React `useState`/`useReducer` para prototipo. Producción: capa de datos a definir (Zustand / Server Actions / TanStack Query — según convención del repo) |

---

## 2 · Estructura recomendada en tu app

```
apps/pos/
├── app/
│   ├── (cashier)/
│   │   ├── layout.tsx         ← shell del TPV (tema, dark/light)
│   │   ├── page.tsx           ← Catálogo + Ticket (pantalla principal)
│   │   ├── lock/page.tsx      ← Lock screen / PIN
│   │   ├── orders/page.tsx    ← (opcional) listado pedidos como ruta
│   │   └── @modals/           ← parallel routes para cobro, drawer, menú
│   ├── (waiter)/
│   │   ├── layout.tsx
│   │   ├── page.tsx           ← Plano del salón
│   │   ├── mesas/page.tsx     ← Mis mesas (lista priorizada)
│   │   ├── mesa/[id]/page.tsx ← Detalle de mesa
│   │   └── comanda/[id]/page.tsx
│   └── globals.css            ← @tailwind + variables --surf/--tx/...
├── components/
│   ├── pos/
│   │   ├── ProductCard.tsx
│   │   ├── TicketLine.tsx
│   │   ├── OrderTabs.tsx
│   │   ├── OrderTypeToggle.tsx
│   │   ├── PaymentModal.tsx
│   │   ├── OrdersDrawer.tsx
│   │   ├── ConfigMenu.tsx
│   │   └── CategoryRail.tsx
│   ├── waiter/
│   │   ├── FloorPlan.tsx      ← incluye <TableIcon> SVG perspectiva
│   │   ├── TableCard.tsx
│   │   ├── MyTablesList.tsx
│   │   ├── TableDetail.tsx
│   │   ├── KitchenFeed.tsx
│   │   └── ShiftSummary.tsx
│   └── ui/
│       ├── Button.tsx         ← .btn-primary / .btn-ghost / .btn-soft
│       ├── Chip.tsx
│       ├── Input.tsx
│       ├── Badge.tsx
│       └── BottomSheet.tsx
└── lib/
    ├── tokens.ts              ← exporta los tokens si necesitas TS
    └── data/                  ← mocks de productos, mesas, etc
```

---

## 3 · Mapeo de tokens (prototipo → tu Tailwind)

El prototipo usa variables `--bg`, `--surface-1`…`--surface-3`,
`--text-primary`/`secondary`/`muted`, `--border`/`--border-strong`, `--brand`
(con 3 paletas swap-eables). En tu app ya tienes `surf`, `tx`, `bd`, `iris`
— alinéalos así:

| Prototipo (CSS var) | Tu token Tailwind | Hex (modo oscuro) | Hex (modo claro) |
|---|---|---|---|
| `--bg` | `surf-0` / `bg-surf-0` | `#0b0d10` | `#f6f7f9` |
| `--surface-1` | `surf-1` / `bg-surf-1` | `#11141a` | `#ffffff` |
| `--surface-2` | `surf-2` | `#171b22` | `#f1f3f6` |
| `--surface-3` | `surf-3` | `#1f242d` | `#e6e9ee` |
| `--surface-hover` | `surf-hover` | `#262c37` | `#dde0e6` |
| `--text-primary` | `tx-pri` | `#e8eaee` | `#0e1116` |
| `--text-secondary` | `tx-sec` | `#9aa0ab` | `#4b5563` |
| `--text-muted` | `tx-mut` | `#6b7280` | `#6b7280` |
| `--text-disabled` | `tx-dis` | `#4b525c` | `#9ca3af` |
| `--border` | `bd-DEFAULT` | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.08)` |
| `--border-strong` | `bd-strong` | `rgba(255,255,255,0.12)` | `rgba(15,23,42,0.16)` |
| `--brand` | `iris-500` | `#10b981` (emerald) · `#6366f1` (indigo) · `#f97316` (amber) | igual |
| `--brand-hover` | `iris-600` | `#059669` / `#4f46e5` / `#ea580c` | |
| `--brand-soft` | `iris-soft` | `iris-500 @ 14%` | |
| `--brand-glow` | `iris-glow` | `iris-500 @ 30-32%` | |
| `--brand-fg` | `iris-fg` | `#ffffff` | |

**Estado / status (no cambian con el tema brand):**

| Var | Hex | Uso |
|---|---|---|
| `--success` | `#10b981` | Mesa libre, confirmaciones |
| `--warning` | `#f59e0b` | Mesa con aviso (sin postre 45m) |
| `--danger` | `#ef4444` | Mesa con cuenta pidiendo, errores |
| `--info` | `#3b82f6` | Notificaciones neutras |

Cada uno tiene su `*-soft` con alpha 0.14 para fondos.

**Radios (Tailwind extend):**

| Var | px | Tailwind sugerido |
|---|---|---|
| `--radius-sm` | 8 | `rounded-sm` |
| `--radius-md` | 12 | `rounded-md` |
| `--radius-lg` | 16 | `rounded-lg` |
| `--radius-xl` | 20 | `rounded-xl` |
| `--radius-pill` | 9999 | `rounded-full` |

**Sombras:**

```css
--shadow-sm: 0 1px 2px rgba(0,0,0,0.4);          /* dark */
             0 1px 2px rgba(15,23,42,0.05);      /* light */
--shadow-md: 0 6px 18px rgba(0,0,0,0.45);
             0 6px 18px rgba(15,23,42,0.07);
--shadow-lg: 0 18px 40px -8px rgba(0,0,0,0.6);
             0 18px 40px -8px rgba(15,23,42,0.12);
```

**Tipografía** (el prototipo usa Geist; tú usas las equivalencias):

| Rol | Prototipo | Tu app |
|---|---|---|
| Display (titulares grandes, ORDEN #1042, valores hero) | Geist | **Syne** — peso 600/700 |
| Body / UI | Geist | **DM Sans** — peso 400/500/600/700 |
| Mono / números / tickets / IDs | Geist Mono | **DM Mono** — `font-feature-settings: "tnum"` |

`tnum` (tabular-nums) es **crítico** en montos, totales, contadores de mesas
y tiempos. Aplícalo en `.mono` y donde hay números cambiantes.

---

## 4 · Pantallas

### 4.1 TPV principal — Catálogo + Ticket
**Archivo de referencia:** `reference/TPV Profesional v2 Interactivo.html`
**JSX:** `frame-main.jsx`
**Screenshot:** `screenshots/01-tpv-main-emerald-dark.png`, `03-tpv-with-ticket.png`

**Layout (1280×800, ratio 16:10, formato tablet apaisado):**

- Grid de **2 columnas**: izquierda flex `1 1 auto` (catálogo), derecha
  `420px` fija (ticket).
- Header izquierda: logo "MRTPVREST · SUCURSAL CENTRO" + breadcrumb "Catálogo
  · Punto de venta" + barra de búsqueda + botón "Pedidos abiertos" con
  badge contador + chip "TURNO ABIERTO · Lucía P. · 04:32h".
- Hamburguesa (☰) en esquina sup-izq → abre `ConfigMenu` (drawer izquierdo).
- Riel de categorías horizontal (`Todos · Tacos · Tortas · Bowls · Bebidas
  · Postres`) con underline animado en activa.
- Grid de productos `repeat(3, 1fr)` con gap 12px. Cards con
  - placeholder rayado diagonal (135deg, repeating gradient)
  - nombre (DM Sans 600, 14px, color `tx-pri`)
  - precio (DM Mono 700, 14px, color `tx-pri`)
  - badge `-17%` opcional en esquina sup-der pill verde

**Ticket (columna derecha, fondo `surf-1`, borde izquierdo `bd`):**

- Tabs de tickets arriba (`T1 +`) — pestaña activa con underline `iris-500`,
  cerrar con `×` en hover.
- Header `ORDEN #1042 · BORRADOR` en eyebrow (`tx-mut`, uppercase, tracking-widest).
- Toggle tipo de orden: 3 botones segmentados `Mesa | Llevar | Domicilio`
  (uno activo en `iris-500`).
- 2 inputs: `Cliente` y `Tel` (`Input` token, h-38px, `surf-2`, focus border `iris`).
- Lista de líneas: cantidad (stepper `+/1/-` vertical, ancho 28px) + nombre
  + precio unit + total + botón `×` (eliminar).
- Footer fijo: `Subtotal`, `Descuento` opcional, `TOTAL` (DM Display, 32px,
  número en DM Mono).
- CTA grande: `Procesar cobro · $XX.XX` (h-56, full-width, `iris-500`,
  texto blanco 600).
- Botones secundarios bajo el CTA: `🍳 Cocina · 🏷 Desc. · ❌ Limpiar`.

**Interacciones:**
1. Click en card → suma a ticket. Si ya existe la línea, incrementa qty.
2. Buscar filtra cards por nombre.
3. Click categoría filtra.
4. `+/-` en línea ajusta qty (mínimo 1; `−` en 1 elimina la línea).
5. CTA cobrar → abre `PaymentModal` (§4.4).
6. `Pedidos abiertos` → abre `OrdersDrawer` (§4.5).
7. ☰ → abre `ConfigMenu` (§4.6).

---

### 4.2 Vista mesero móvil — Plano del salón
**Archivo:** `Vista Mesero Móvil.html` · JSX: `waiter-mobile.jsx`
**Screenshot:** `screenshots/06-mobile-floor.png`

Renderizado **dentro de marco iOS 402×874**. Tu implementación móvil real
ocupa el viewport completo del navegador.

**Layout vertical:**

1. Header: eyebrow `VISTA` + título "Salón · Sucursal Centro" + campana de
   notificaciones con badge.
2. Toggle de zona (segmentado `Terraza · Salón`) + toggle de modo
   (icono mapa / icono grid).
3. Strip de stats 4-col: `Libres · Ocupadas · Avisos · Cuenta` con
   números grandes coloreados (success / iris / warning / danger).
4. **Plano** (mode=plan): card fondo `surf-1`, grid sutil 24px, mesas
   posicionadas absolutas con `<TableIcon>` SVG en perspectiva 3/4
   (4 patas, superficie trapezoidal — definición en `waiter-mobile.jsx`,
   función `TableIcon`). El color del trazo es el `border` del estado:
   - `free`: `success`
   - `occupied`: `iris`
   - `kitchen`: `warning` (con badge campanita)
   - `served`: `info`
   - `bill`: `danger` (con badge "$")
   - `dirty`: `tx-mut`
   Etiquetas dentro: `M5` (DM Sans 800, 13px), `6p` asientos, `78m`
   cronómetro (DM Mono).
5. Bottom nav (h-72, `surf-1`, borde sup): `Salón · Mis mesas · Llevar`
   (Llevar es el CTA naranja de acceso rápido).

**Interacciones:**
- Tap mesa → push a `TableDetail` (§4.3).
- Toggle zona / toggle vista (plano vs grid 3-col).
- Drawer de avisos en vivo (campana arriba a la der.).

---

### 4.3 Detalle de mesa
**Screenshot:** `screenshots/08-mobile-detail.png`

- Header con back arrow + eyebrow `TERRAZA` + título `Mesa M5`.
- Hero card horizontal: avatar redondo con ID, etiqueta de estado
  (`PIDIÓ CUENTA`, color del estado), comensales · `desde 19:24`,
  cronómetro grande (`78 min en mesa`).
- Chip de alerta si aplica (rojo "Pidió cuenta", amber "Sin postre 45m"…).
- Card "CUENTA ACUMULADA · $1840" + subtítulo `Items se modifican desde el
  TPV principal`.
- Grid 2×2 de acciones: `Pedir cuenta · Llamar TPV · Dividir cuenta ·
  Cambiar mesa` (cada uno: icono arriba 20px, label DM Sans 600, h-72,
  `surf-2`, borde `bd`).
- CTA sticky inferior: `+ Agregar a la comanda` (h-56, `iris-500`).

---

### 4.4 Comanda (solo agregar)
**Screenshot:** `screenshots/09-mobile-comanda.png`

Igual al catálogo del TPV, adaptado a vertical:
- Header back + eyebrow `COMANDA NUEVA · SOLO AGREGAR` + `Mesa M5`.
- Buscador.
- Riel de categorías horizontal scroll.
- Grid 2-col de productos con badge `+` en esquina sup-der de cada card.
- Bottom-sheet sticky: contador `🛒 0 · Comanda $0.00 ›` (tap abre sheet
  con todas las líneas y modificadores) + CTA `Enviar a cocina`.

---

### 4.5 Modal de pago
**Screenshot:** `screenshots/04-tpv-payment-modal.png`
**JSX:** `frame-payment.jsx`

Modal centrado, ancho ~560px, fondo `surf-1`, sombra `lg`.
- Tabs `Efectivo · Tarjeta · QR` (segmentado).
- **Efectivo**: input grande del recibido (DM Mono 32px) + grid de chips
  de denominación rápida `$50 · $100 · $200 · $500 · Exacto`. Calcula
  cambio en tiempo real.
- **Tarjeta**: input total (read-only) + 4 chips de tipo de tarjeta + CTA
  `Cobrar`.
- **QR**: placeholder QR + total + countdown.
- Footer: `Cancelar` (ghost) + `Confirmar cobro · $XX` (iris).

---

### 4.6 Menú de configuración
**Screenshot:** `screenshots/02-tpv-menu-config.png`
**JSX:** `frame-extras.jsx`

Drawer izquierdo (w-360, h-full, `surf-1`).
Secciones (eyebrows `tx-mut tracking-widest`):
- `MENÚ` → header sucursal + versión.
- `SESIÓN` → Mi cuenta · Turno (con tiempo abierto).
- `OPERACIONES` → Repartidores · Mesas y salones · Impresoras.
- `APARIENCIA` → 3 chips de tema (`Esmeralda · Índigo · Ámbar`, cada uno
  con su dot de color) + toggle dark/light.
- Footer: `Cerrar sesión` (rojo).

---

### 4.7 Drawer pedidos abiertos
**Screenshot:** `screenshots/05-tpv-orders-drawer.png`
**JSX:** `frame-orders.jsx`

Drawer derecho ~440px. Lista de pedidos con:
- Tipo (chip `Mesa M5 · Llevar · Domicilio`).
- ID, hora, total (DM Mono).
- Estado (chip color: `Cocina · Listo · En camino · Entregado`).
- Para domicilios: selector de repartidor (avatar + nombre + ETA).
- Acciones por fila: `Ver · Cobrar · Imprimir`.

---

### 4.8 Lock / PIN
**JSX:** `frame-lock.jsx`

Centrado, fondo con grano sutil.
- Logo + sucursal.
- Avatar del cajero seleccionable (3-4 chips).
- Numpad 3×4 grande (DM Mono 28px, h-72 cada tecla, `surf-2` con hover
  `surf-3`).
- 4 dots de PIN arriba que se llenan al tipear.
- Bloqueo automático tras 60s inactividad (configurable).

---

## 5 · Componentes UI base (reusables)

Reescríbelos en `components/ui/`. El prototipo los define en `tokens.css`:

```css
.btn { h-38, px-14, gap-8, rounded-md, font-13/600, transition-150 }
  .btn-primary { bg-iris-500 text-iris-fg hover:bg-iris-600 }
  .btn-ghost   { transparent text-tx-sec border-bd hover:bg-surf-2 }
  .btn-soft    { bg-surf-2 text-tx-pri border-bd hover:bg-surf-3 }
.chip   { h-26, px-10, rounded-full, font-11/600, bg-surf-2 text-tx-sec }
.input  { h-38, px-12, rounded-md, bg-surf-2 border-bd, focus:border-iris }
.card   { bg-surf-1 border-bd rounded-lg }
.eyebrow{ font-10/600 uppercase tracking-widest text-tx-mut }
.mono   { font-DM-Mono, font-feature-settings: "tnum" }
.tnum   { font-variant-numeric: tabular-nums }
```

Convertir 1:1 a Tailwind o a CSS modules; **mantener exactamente las
mismas medidas**.

---

## 6 · Animaciones / transiciones

| Elemento | Propiedad | Duración | Easing |
|---|---|---|---|
| Hover en cards / botones | `bg`, `border`, `transform` | 150ms | `ease` |
| Drawers (pedidos / menú) | `transform: translateX` | 240ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Modal pago (entrada) | `opacity` + `scale 0.96 → 1` | 200ms | `ease-out` |
| Bottom-sheet móvil | `transform: translateY` | 280ms | `cubic-bezier(0.32, 0.72, 0, 1)` |
| Toast | fade + slide-up | 200ms | `ease-out` |
| Underline tabs | `transform: translateX` + width | 200ms | `ease` |

---

## 7 · Estado / lógica del prototipo

El prototipo guarda en `useState` (cliente):

```ts
type OrderType = 'mesa' | 'llevar' | 'domicilio';

interface Line {
  productId: string;
  qty: number;
  price: number;
  modifiers?: Modifier[];
  notes?: string;
}

interface Ticket {
  id: string;          // T1, T2…
  number: number;      // 1042
  status: 'borrador' | 'enviado' | 'cocina' | 'listo' | 'cobrado';
  type: OrderType;
  table?: string;      // M5
  customer?: { name: string; phone: string };
  lines: Line[];
  discount?: number;
}

interface Table {
  id: string;          // M5
  zone: 'Terraza' | 'Salón' | 'Barra';
  shape: 'round' | 'square' | 'rect';
  seats: number;
  state: 'free' | 'occupied' | 'kitchen' | 'served' | 'bill' | 'dirty';
  elapsed?: number;    // minutos
  ticket?: number;     // total acumulado
  since?: string;      // '20:01'
  alert?: string;
  warn?: string;
  kitchenAlert?: string;
  mine?: boolean;      // pertenece a mí (mesero actual)
}
```

Para producción mapea a tu data layer (Server Actions + Postgres / TanStack
Query / lo que use el monorepo). El shape de los tipos es estable.

---

## 8 · Asuntos pendientes / decisiones para el equipo

1. **Persistencia de tema/modo**: el prototipo lo guarda en
   `data-theme`/`data-mode` en `<html>`. En tu app puedes usar cookie +
   `next-themes` (o equivalente) para evitar flash en SSR.
2. **Imágenes de productos**: el prototipo usa placeholder rayado. Cuando
   tengas CDN, sustituye `<div class="img-placeholder">` por
   `<Image>` de `next/image` con `fill` + `sizes`.
3. **Iconografía**: las funciones `Icon`/`MIcon` en los JSX exportan SVG
   inline con stroke `currentColor`. Si tu repo usa `lucide-react` o un
   set propio, mapea cada nombre — son equivalentes a Lucide
   (`bell`, `flame`, `clock`, `map`, `grid`, `list`, `chevron-right`, etc).
4. **Responsive**: el TPV está diseñado para tablet apaisado 1280×800. La
   vista mesero está diseñada para móvil vertical. **No mezclar**
   responsividad — son surfaces distintas con rutas distintas.
5. **i18n**: todas las strings están en español. Si vas multi-idioma,
   extrae a `next-intl` antes de duplicar copy.
6. **Lock screen / PIN**: define cómo persiste el bloqueo (cookie HTTP-only
   con session token + auto-lock tras N segundos inactivo).

---

## 9 · Archivos en este paquete

```
design_handoff_pos_montana/
├── README.md                        ← este archivo
├── reference/
│   ├── TPV Profesional v2 Interactivo.html   ← prototipo TPV (clickable)
│   ├── Vista Mesero Móvil.html               ← prototipo mesero móvil
│   ├── Vista Mesero.html                     ← prototipo mesero tablet
│   ├── tokens.css                            ← tokens canónicos
│   ├── frame-main.jsx                        ← TPV principal
│   ├── frame-extras.jsx                      ← menú config + KDS + setup
│   ├── frame-lock.jsx                        ← lock / PIN
│   ├── frame-orders.jsx                      ← drawer pedidos
│   ├── frame-payment.jsx                     ← modal pago
│   ├── waiter.jsx                            ← mesero tablet
│   ├── waiter-mobile.jsx                     ← mesero móvil (incl. <TableIcon>)
│   ├── data.jsx                              ← mocks de productos/categorías
│   ├── proto.jsx                             ← bootstrap React del prototipo
│   ├── ios-frame.jsx                         ← (solo prototipo, no portar)
│   └── design-canvas.jsx                     ← (solo prototipo, no portar)
└── screenshots/
    ├── 01-tpv-main-emerald-dark.png
    ├── 02-tpv-menu-config.png
    ├── 03-tpv-with-ticket.png
    ├── 04-tpv-payment-modal.png
    ├── 05-tpv-orders-drawer.png
    ├── 06-mobile-floor.png
    ├── 07-mobile-mis-mesas.png
    ├── 08-mobile-detail.png
    └── 09-mobile-comanda.png
```

---

## 10 · Checklist de implementación sugerido

- [ ] Configurar tokens en `tailwind.config.ts` (paletas `surf/tx/bd/iris`)
      + `globals.css` con variables CSS por modo y tema.
- [ ] Componentes UI base (`Button`, `Chip`, `Input`, `Card`, `Badge`,
      `BottomSheet`, `Drawer`, `Modal`).
- [ ] Layout `(cashier)` con header + ☰ + tabs de tickets.
- [ ] `ProductCard` + grid + categorías + búsqueda.
- [ ] Panel `Ticket` con líneas, tipo de orden, totales.
- [ ] `PaymentModal` con tabs efectivo/tarjeta/QR.
- [ ] `ConfigMenu` drawer (sesión, operaciones, apariencia).
- [ ] `OrdersDrawer` con asignación de repartidor.
- [ ] Layout `(waiter)` mobile-first con bottom nav.
- [ ] `FloorPlan` con `<TableIcon>` SVG y posiciones absolutas.
- [ ] `TableDetail` + acciones 2×2.
- [ ] `Comanda` (solo agregar) con bottom-sheet.
- [ ] `LockScreen` con numpad y avatares.
- [ ] Persistencia de tema/modo en cookie SSR-safe.
- [ ] QA con los screenshots como referencia 1:1.
