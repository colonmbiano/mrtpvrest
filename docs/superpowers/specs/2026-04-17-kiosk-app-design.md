# Kiosko de Autoservicio (`apps/kiosk`) — Design Spec

**Fecha:** 2026-04-17
**Autor:** colonmbiano (+ Claude)
**Estado:** Aprobado — pendiente plan de implementación

---

## 1. Objetivo

Crear una nueva aplicación en el monorepo (`apps/kiosk`) que permita a los comensales pedir y pagar solos en un pedestal táctil vertical dentro del restaurante. El kiosko:

- Opera **sin token de autenticación** (dispositivo público).
- Se vincula una sola vez a un `restaurantId` + `locationId` vía login admin (token se descarta).
- Consume los endpoints públicos existentes de `/api/store/*`.
- Soporta 3 estilos visuales seleccionables por el tenant (OLED Premium, Fast-Food Pop, Boutique Restaurant).

## 2. Alcance

**Dentro del alcance:**
- Scaffold completo de `apps/kiosk` (Next.js 14, Tailwind, TS, puerto 3006).
- 6 pantallas táctiles: `/setup`, `/`, `/order-type`, `/menu`, `/checkout`, `/success`.
- Selector de estilo por tenant desde panel admin (`mi-marca`).
- Ajuste mínimo de backend (`store.routes.js`) para aceptar `source: 'KIOSK'` y `tableNumber`.
- Migración Prisma: añadir `kioskStyle` a `Restaurant`.
- Pagos simulados ("Pagar en caja" / "Código QR" con modal placeholder).

**Fuera del alcance:**
- Integración real de pagos (Conekta/Stripe).
- Modo kiosco del navegador / fullscreen managed.
- Impresión de tickets al cliente (eso lo hace el TPV).
- Detección de inactividad avanzada (cámara/proximidad).
- i18n (solo español por ahora).

## 3. Arquitectura

### 3.1 Stack

Alineado con `apps/tpv` y `apps/admin`:

- Next.js `14.2.35` (App Router, `src/app/` layout).
- React 18.
- Tailwind CSS 3.4 + globals CSS con variables (compatibilidad con el sistema de admin/saas).
- TypeScript 5.
- `axios` para el fetch wrapper (consistente con admin/tpv, aunque `apps/client` usa `fetch` nativo — en el kiosko usamos `axios` por los interceptores).
- `@mrtpvrest/config` (compartido del monorepo).

### 3.2 Estructura de archivos

```
apps/kiosk/
├── package.json                       # name: "@mrtpvrest/kiosk", port 3006
├── tsconfig.json
├── next.config.js                     # ignora TS/ESLint errors en build (match admin)
├── tailwind.config.ts
├── postcss.config.mjs
├── next-env.d.ts
├── .env.local.example                 # NEXT_PUBLIC_API_URL
├── .gitignore
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # RootLayout + ThemeProvider + AccentInjector + KioskStyleInjector
│   │   ├── globals.css                # 3 bloques de theme vars (oled/pop/boutique) + DM Sans/Mono + Poppins + Cormorant
│   │   ├── page.tsx                   # Idle Screen
│   │   ├── setup/page.tsx             # Login admin + selector sucursal + purga token
│   │   ├── order-type/page.tsx        # DINE_IN vs TAKEOUT
│   │   ├── menu/page.tsx              # Categorías + grid productos + carrito flotante
│   │   ├── checkout/page.tsx          # Resumen + mesa (DINE_IN) o nombre (TAKEOUT) + pago simulado
│   │   └── success/page.tsx           # Confirmación + auto-reinicio 10s
│   ├── components/
│   │   ├── ThemeProvider.tsx          # Copia de admin (theme oscuro + accent)
│   │   ├── AccentInjector.tsx         # Copia de admin (lee mb-accent de localStorage)
│   │   ├── KioskStyleInjector.tsx     # Lee kiosk-style de localStorage → aplica data-kiosk-style en <html>
│   │   ├── IdleGuard.tsx              # Redirige a / tras 90s de inactividad
│   │   ├── SetupGuard.tsx             # Redirige a /setup si no hay restaurantId
│   │   ├── Icon.tsx                   # SVGs inline (no emoji, per design system)
│   │   ├── Numpad.tsx                 # Teclado numérico táctil (mesa)
│   │   └── VariantPicker.tsx          # Modal selección de variante/complementos
│   └── lib/
│       ├── api.ts                     # axios con x-restaurant-id / x-location-id headers
│       ├── cart.ts                    # useReducer + sessionStorage persistence
│       └── format.ts                  # fmt($), totales
```

### 3.3 Selector de estilo (sistema de theming)

**3 presets** con paletas completas. Activados mediante atributo `data-kiosk-style` en `<html>`:

| Preset | `data-kiosk-style` | Fuente | Paleta (fondo · surf · accent · text · muted) | `accentColor` tenant |
|---|---|---|---|---|
| **OLED Premium** | `oled` | DM Sans + DM Mono | `#080810 · #0e0e18 · var(--brand-primary) · #eaeaf6 · #6868a0` | ✅ override via `--brand-primary` |
| **Fast-Food Pop** | `pop` | Poppins 700/800/900 | `#FFF8E7 · #FFFFFF · #DC2626 · #1a1a1a · #666666` (secundario amarillo `#FFC72C`) | ❌ paleta rígida |
| **Boutique Restaurant** | `boutique` | Cormorant Garamond + DM Mono labels | `#F5EFE4 · #FFFCF5 · #C9A86B · #1F2D1F · #8a7a5a` | ❌ paleta rígida |

`globals.css` define los 3 bloques como selectores `[data-kiosk-style="oled"]`, `[data-kiosk-style="pop"]`, `[data-kiosk-style="boutique"]`. Tailwind consume las variables mediante utilities (`bg-surf`, `text-fg`, etc. vía plugin o `@apply`).

**Carga de fuentes:** importadas en `globals.css` vía `@import url('https://fonts.googleapis.com/css2?...')`:
- DM Sans + DM Mono (OLED)
- Poppins 700/800/900 (Pop)
- Cormorant Garamond 600/700 + DM Mono (Boutique)

Todas se cargan siempre (cache compartido). El preset activo decide cuál usar vía `font-family` en `[data-kiosk-style="..."]`.

El tenant elige el preset desde `apps/admin/app/(admin)/admin/mi-marca/page.tsx` → nueva sección "Estilo del Kiosko" con 3 tarjetas de preview (miniatura del menú). Al hacer clic se guarda `kioskStyle` en la tabla `Restaurant`.

## 4. Flujo de pantallas

### 4.1 `/setup` — Vinculación del dispositivo

1. Admin ingresa email + password.
2. `POST /api/auth/login` devuelve `accessToken`, `user`.
3. `GET /api/tenant/me` devuelve tenant con campos `accentColor`, `kioskStyle`, y `locations: [{id, name, address}]`.
4. UI muestra lista de sucursales del tenant (tarjetas grandes táctiles).
5. Admin selecciona una sucursal.
6. **Persistir en localStorage:**
   - `kiosk-restaurant-id` = `tenant.id`
   - `kiosk-restaurant-name` = `tenant.name`
   - `kiosk-location-id` = `location.id`
   - `kiosk-location-name` = `location.name`
   - `mb-accent` = `tenant.accentColor` (si existe)
   - `kiosk-style` = `tenant.kioskStyle` (default `'oled'`)
7. **Purga de credenciales (crítico):**
   - `localStorage.removeItem('accessToken')`
   - `localStorage.removeItem('refreshToken')`
   - `localStorage.removeItem('user')`
   - `document.cookie = 'mb-role=; path=/; max-age=0; SameSite=Lax'`
8. Redirect a `/`.

**Si ya hay `kiosk-restaurant-id` al cargar `/setup`**: mostrar banner "Este dispositivo ya está vinculado a {nombre}. ¿Desvincular?" con botón explícito (evita desvinculaciones accidentales).

### 4.2 `/` — Idle Screen

- Fondo radial suave (en OLED), sólido en Pop/Boutique.
- Logo + nombre del restaurante centrados.
- Texto "TOCA PARA ORDENAR" pulsante (2s fade).
- Cualquier tap en el viewport navega a `/order-type`.
- **Guard**: si no hay `kiosk-restaurant-id`, redirige a `/setup`.
- Fetch `GET /api/store/info` en mount para refrescar nombre/logo (silencioso — si falla, usa localStorage).

### 4.3 `/order-type`

- Título "¿Cómo prefieres tu orden?".
- Dos botones gigantes (50% cada uno):
  - "Comer aquí" → `orderType=DINE_IN` → `/menu?t=dine_in`
  - "Para llevar" → `orderType=TAKEOUT` → `/menu?t=takeout`
- Botón "← Cancelar" pequeño abajo (vuelve a `/`).

### 4.4 `/menu`

**Layout 2 columnas:**
- **Izquierda (30%)**: lista vertical de categorías (scrollable sin scrollbar visible). Categoría activa resaltada con el accent del preset.
- **Derecha (70%)**: grid 2×N de tarjetas de producto (imagen + nombre + precio + botón `+`). Scroll vertical.

**Tarjeta de producto:**
- Tap directo si el producto no tiene variantes ni complementos requeridos: agrega al carrito (cantidad 1).
- Tap abre `VariantPicker` modal si tiene `variants.length > 0` o algún `complements[i].isRequired === true`.
- Complementos NO requeridos: ignorados en v1 del kiosko (se podrían añadir después como sección opcional del modal).

**Carrito flotante:**
- Barra inferior fija, 100px altura, estilo solid-fill del accent.
- Muestra `{qty} productos · ${total}`.
- Tap izquierdo: abre drawer derecho con items editables (−/+/eliminar).
- Tap botón "Continuar →": navega a `/checkout?t=<type>`.

**Datos:** `GET /api/store/menu` → `{categories: [{id, name, items: [...]}], items: [...]}`.

**Guard**: si no hay `kiosk-restaurant-id`, redirige a `/setup`.

### 4.5 `/checkout`

**Layout 2 paneles:**

**Izquierda (55%)** — Resumen:
- Lista de items con cantidad, precio unitario, subtotal por item.
- Editar cantidad (botones − / + táctiles grandes).
- Subtotal, total (DM Mono grande, color accent).

**Derecha (45%)** — depende de `orderType`:
- **DINE_IN:**
  - Label "Número de mesa".
  - Display grande del número tipeado.
  - `Numpad` 3×4 (dígitos 0–9, ⌫ borrar, ✓ confirmar).
  - Validación: 1–999.
- **TAKEOUT:**
  - Input de nombre (teclado nativo del sistema, `autofocus`).
  - Placeholder "Tu nombre (para cantar tu orden)".

**Botones de pago (abajo, full width):**
- "💵 Pagar en caja" (primary) → POST orden con `paymentMethod: 'CASH'` → `/success`.
- "📱 Código QR" (secondary) → modal con QR placeholder (SVG estático in-line con patrón QR genérico, ~300×300px) + texto "Escanea para pagar (simulado)" + botón "Listo" → POST con `paymentMethod: 'CARD'` → `/success`.

**Body del POST** (`/api/store/orders`):
```json
{
  "items": [{ "menuItemId": "...", "variantId": null, "quantity": 2 }],
  "customerName": "Juan",
  "orderType": "DINE_IN",
  "tableNumber": 12,
  "paymentMethod": "CASH",
  "source": "KIOSK"
}
```

**Guard**: carrito vacío → redirige a `/menu`; sin `kiosk-restaurant-id` → `/setup`.

### 4.6 `/success`

- Check verde animado.
- `ORDEN #KIOSK-XXXXXX` en DM Mono enorme.
- Mensaje:
  - DINE_IN: "Tu orden llegará a la mesa {n}. Pasa por caja a pagar."
  - TAKEOUT: "Pasa por tu comida cuando escuches '{nombre}'."
- Countdown "Volviendo al inicio en 10…9…" + auto-redirect a `/` + limpia `sessionStorage('kiosk-cart')`.
- Botón "Nueva orden" reinicia inmediatamente.

## 5. Estado y persistencia

| Clave | Storage | Ciclo de vida | Tipo |
|---|---|---|---|
| `kiosk-restaurant-id` | localStorage | Setup → desvinculación | string |
| `kiosk-restaurant-name` | localStorage | Setup → desvinculación | string |
| `kiosk-location-id` | localStorage | Setup → desvinculación | string |
| `kiosk-location-name` | localStorage | Setup → desvinculación | string |
| `mb-accent` | localStorage | Setup → desvinculación | string (hex) |
| `kiosk-style` | localStorage | Setup → desvinculación | `'oled' \| 'pop' \| 'boutique'` |
| `kiosk-cart` | sessionStorage | Menu → Success (se limpia) | `CartItem[]` |

**Idle timeout**: en `/menu` y `/checkout`, cualquier movimiento/tap resetea un timer de 90s. Al expirar → `/` + limpia carrito.

## 6. Cambios al backend

Archivo: `apps/backend/src/routes/store.routes.js` — handler `POST /orders`.

**Cambios (~8 líneas):**

1. Leer `source` y `tableNumber` del body:
   ```js
   const { source: rawSource, tableNumber: rawTableNumber, ...rest } = req.body;
   ```
2. Whitelist de `source`:
   ```js
   const source = ['ONLINE', 'KIOSK'].includes(rawSource) ? rawSource : 'ONLINE';
   ```
3. Whitelist de `orderType`:
   ```js
   const VALID_TYPES = ['DELIVERY', 'TAKEOUT', 'DINE_IN'];
   const resolvedOrderType = VALID_TYPES.includes(orderType) ? orderType : 'DELIVERY';
   ```
4. Parse seguro de `tableNumber`:
   ```js
   const tableNumber = resolvedOrderType === 'DINE_IN' && rawTableNumber
     ? Math.max(1, Math.min(999, parseInt(rawTableNumber) || 0)) || null
     : null;
   ```
5. Prefijo de `orderNumber`:
   ```js
   const prefix = source === 'KIOSK' ? 'KIOSK-' : 'WEB-';
   const orderNumber = prefix + Date.now().toString().slice(-6);
   ```
6. Pasar `source` y `tableNumber` al `prisma.order.create({ data: {...} })` (reemplazar hardcode `source: 'ONLINE'`).

**Retrocompatibilidad:** si el cliente no manda `source`, sigue siendo `'ONLINE'`. `apps/client` no se toca.

### 6.1 Migración Prisma

Añadir a `Restaurant` en `packages/database/prisma/schema.prisma`:

```prisma
model Restaurant {
  // ...
  kioskStyle String @default("oled")  // 'oled' | 'pop' | 'boutique'
  // ...
}
```

Migración: `pnpm --filter @mrtpvrest/database prisma migrate dev --name add_restaurant_kiosk_style`.

### 6.2 Exponer `kioskStyle`

- `GET /api/tenant/me` → incluir `kioskStyle` en la respuesta (para que el setup del kiosko lo lea).
- `GET /api/store/info` → incluir `kioskStyle` (para re-sincronizar en cada idle si el admin lo cambió).
- `PATCH /api/tenant/me` (o el endpoint existente que usa `mi-marca`) → aceptar `kioskStyle` en el body con la misma whitelist.

## 7. Cambios en `apps/admin`

En `apps/admin/app/(admin)/admin/mi-marca/page.tsx`:

Nueva sección **"Estilo del Kiosko"** (debajo de la sección de accent color existente):

- Título + descripción breve.
- 3 tarjetas (grid de 3 columnas) con preview miniaturizado del menú en cada estilo.
- Radio-style selection (borde accent en la seleccionada).
- Guardar al hacer clic (PATCH inmediato, feedback "Guardado ✓").

Preview cards: reutilizar los mockups HTML ya diseñados en la sesión (simplificados a un rectángulo con paleta + tipografía representativa). Estáticos, sin interacción.

## 8. Seguridad

- **No hay token persistente** en el kiosko después del setup.
- Endpoints de `/api/store/*` son públicos por diseño (ya en producción para `apps/client`).
- El backend valida precios server-side (ya lo hace, línea 167–199 de `store.routes.js`) — no se confía en nada del cliente.
- El kiosko no tiene acceso a endpoints admin ni a otros tenants.
- `x-restaurant-id` en headers solo resuelve datos del propio restaurante (validación ya existente en `resolveStore`).
- El setup requiere credenciales admin válidas → no cualquiera puede vincular un dispositivo.

## 9. Testing manual

1. **Setup:** vincular con credenciales válidas → token purgado → IDs guardados.
2. **Setup 2:** intentar navegar a `/menu` sin vincular → redirect a `/setup`.
3. **Idle → flujo completo:** tap → order-type → menu → agregar 2 productos → checkout → mesa 5 → pagar en caja → success → auto-reinicio.
4. **Variantes:** producto con variantes abre modal, se agrega la variante elegida.
5. **Carrito:** agregar 3, eliminar 1, editar cantidad, total recalcula.
6. **Idle timeout:** dejar la pantalla en `/menu` 90s → vuelve a `/` y limpia carrito.
7. **DINE_IN:** orden llega a KDS con `tableNumber` y `source: KIOSK`, visible en panel admin con prefijo `KIOSK-`.
8. **TAKEOUT:** orden llega con `customerName` y sin `tableNumber`.
9. **Selector de estilo:** cambiar de OLED → Pop desde `mi-marca`, recargar kiosko, cambia la paleta y tipografía.
10. **Resincronización de estilo:** cambiar estilo mientras kiosko está en `/` (idle) → `GET /api/store/info` lo detecta y aplica sin recargar.

## 10. Orden de implementación sugerido

1. **Backend** — migración Prisma + endpoints (`/api/store/orders` source/tableNumber, `/api/tenant/me` + `/api/store/info` kioskStyle).
2. **Admin** — selector de estilo en `mi-marca`.
3. **Kiosk — Fase 1** — scaffold + layout base + ThemeProvider + Idle Screen + commit.
4. **Kiosk — Fase 2a** — `/setup` (login + selector sucursal + purga token).
5. **Kiosk — Fase 2b** — `/order-type` + `/menu` (con carrito).
6. **Kiosk — Fase 2c** — `/checkout` + `/success`.
7. **Kiosk — Fase 3** — 3 themes en CSS + `KioskStyleInjector`.
8. **Testing manual end-to-end.**

## 11. Decisiones tomadas durante el diseño

- Setup con login admin + purga inmediata de token (dispositivo público, sin token vivo).
- Reutilizar `POST /api/store/orders` en lugar de crear endpoint nuevo (consistencia con `apps/client`).
- `orderType` elegido por el usuario final (patrón McDonald's), no forzado.
- 3 estilos como presets rígidos seleccionables por tenant (no customización libre — evita kioskos feos).
- OLED respeta `accentColor` del tenant; Pop y Boutique tienen paleta fija (híbrido).
- Carrito en `sessionStorage` (no localStorage) — se pierde al reiniciar navegador, lo cual es correcto para un kiosko público.
- Idle timeout 90s en flujos activos; Idle Screen no tiene timeout.
