# Informe: estructura del TPV (`apps/tpv`)

> Fecha: 2026-04-28
> Branch base: `claude/cleanup-optimize-tokens-cXUAJ`
> Objetivo: mapear cómo está seccionado el TPV y proponer cómo fraccionar los `page.tsx` grandes en módulos independientes.

---

## Mapa general

```
apps/tpv/src/
├── app/                                 # Router de Next.js (App Router)
│   ├── layout.tsx                       (46 líneas) — root layout
│   ├── page.tsx.bak                     (88 KB)   — ⚠️ backup huérfano
│   ├── globals.css / main.css           — ver nota abajo
│   │
│   ├── (cashier)/                       # Grupo de rutas: cajero (TPV principal)
│   │   ├── layout.tsx                   (140 líneas) — header + lock screen + sidebar ticket
│   │   └── page.tsx                     (95 líneas)  — catálogo/grid (✅ ya modularizado)
│   │
│   ├── (kiosk)/kiosk/page.tsx           (581 líneas) — kiosko autoservicio
│   ├── (waiter)/
│   │   ├── layout.tsx                   (65 líneas)
│   │   └── meseros/
│   │       ├── page.tsx                 (102) — listado de meseros
│   │       ├── mis-mesas/page.tsx       (89)
│   │       └── [id]/
│   │           ├── page.tsx             (134)
│   │           └── orden/page.tsx       (276)
│   │
│   ├── kds/page.tsx                     (404 líneas) — pantalla de cocina
│   ├── setup/page.tsx                   (706 líneas) — wizard de onboarding
│   ├── spa/page.tsx                     (292 líneas) — versión SPA paralela
│   └── v2/page.tsx                      (548 líneas) — siguiente versión del POS
│
├── components/
│   ├── admin/   (8 archivos)            — drivers, mesas, ingredientes, KDS, sidebar admin
│   ├── delivery/ (2)                    — GPS tracker, PWA banner
│   ├── layouts/ (4)                     — Bar, Cafe, Restaurant, Retail (variantes vertical)
│   ├── modals/ (10)                     — todos los modales del cajero
│   ├── pos/ (10)                        — primitivos del cajero clásico
│   ├── tpv/ (8)                         — primitivos del POS v2 (POSShell, SideRail, ProductGrid…)
│   └── ui/ (5)                          — Button, Input, Badge, Chip, BaseModal
│
├── contexts/ModalContext.tsx
├── hooks/   (4)                         — useTPVAuth, useLocation, useTpvConfig, usePinLock
├── store/   (4)                         — authStore, ticketStore, themeStore, usePOSStore
├── lib/     (3)                         — api, auth, config
└── middleware.ts                        — sólo whitelistea /kiosk como pública
```

---

## Lo que ya está bien modularizado

- **`(cashier)/page.tsx` (95 líneas)** ya importa `CategoryRail`, `ProductCard`, `TicketLine`, `OrderTypeToggle`, `Button` desde `components/`. No requiere atención.
- **`(cashier)/layout.tsx`** delega lock screen, sidebar ticket, drawer de pedidos y menú de config a componentes propios.
- **`v2/page.tsx`** ya importa `POSShell`, `SideRail`, `CategoryTabs`, `ProductGrid`, `TicketPanel`, `ModalStack` y los `layouts/*` (Retail/Bar/Cafe). Su monto (548 líneas) viene mayormente de **estado y handlers**, no de JSX duplicado.

---

## Lo que pesa y se puede partir

### 1. `apps/tpv/src/app/page.tsx.bak` (88 KB) — quick win
Backup del monolito antiguo. La ruta real ya no se usa (el routing entra por los grupos `(cashier)` / `(kiosk)` / `(waiter)`). **Borrar.** Solo está consumiendo tokens al cargar el árbol del repo.

### 2. `setup/page.tsx` (706 líneas) — el peor candidato

**Estructura interna:**
- `SetupContent()` — 350 líneas con 4 estados/pantallas: `login` → `pick` → `appearance` → `saving`
- `AppearanceStep()` — paso de selección de tema, ya separado pero en el mismo archivo
- `ModeCard()`, `PreviewBlock()` — sub-componentes locales del paso "appearance"
- `Page`, `Card`, `Heading`, `SectionLabel`, `Label`, `Input`, `PrimaryButton` — **7 mini-primitivos UI** definidos in-line (líneas 585-700) que deberían vivir en `components/ui/` o en un `components/setup/` propio
- Wrapper `SetupPage` con Suspense

**Propuesta de split:**
```
app/setup/page.tsx                   (~80 líneas, sólo Suspense + router de pasos)
app/setup/_components/
  LoginStep.tsx                      (login + alreadyLinked + select restaurante/sucursal)
  PickStep.tsx
  AppearanceStep.tsx                 (extraer también ModeCard + PreviewBlock)
  SavingStep.tsx
  primitives.tsx                     (Page, Card, Heading, SectionLabel, Label, Input, PrimaryButton)
app/setup/_hooks/
  useSetupFlow.ts                    (todo el state machine + handlers HTTP)
```

### 3. `(kiosk)/kiosk/page.tsx` (581 líneas)

Mini-app standalone con su propia state machine de pantallas (`menu | item | cart | checkout | success | …`).

**Estructura:**
- `KioskPage()` con 11 useState (categories, cart, selectedItem, screen, checkoutUrl, paymentProvider, orderId, tableNumber, etc.)
- `ItemModal()` — modal de selección de variantes/opciones (ya separado pero en el mismo archivo)
- Helpers `formatPrice`, `cartTotal`

**Propuesta de split:**
```
app/(kiosk)/kiosk/page.tsx           (orquestador, ~120 líneas)
app/(kiosk)/kiosk/_components/
  MenuScreen.tsx
  CartScreen.tsx
  CheckoutScreen.tsx
  SuccessScreen.tsx
  ItemModal.tsx                      (ya está aislado, sólo extraerlo)
app/(kiosk)/kiosk/_hooks/
  useKioskCart.ts                    (cart + helpers)
  useKioskCheckout.ts                (flujo de pago)
```

### 4. `kds/page.tsx` (404 líneas)

Una sola función `KDSPage` con 9 useState mezclando: estación, polling de órdenes, modal de mensajes, auth de empleado (PIN).

**Propuesta:**
- Extraer `useKDSAuth()` (auth + employee + PIN gate) → `hooks/`
- Extraer `useOrdersPolling(station)` → `hooks/`
- Extraer `<MessageModal />` → `components/admin/` (ya hay `KDSMessages.tsx`, podría fusionarse)
- Helper `getUrgency` → `lib/`
- Resultado: page de ~150 líneas centrada en composición.

### 5. `(waiter)/meseros/[id]/orden/page.tsx` (276 líneas)
Más equilibrada. Vale la pena revisarla pero no es prioridad.

### 6. `spa/page.tsx` (292 líneas)
Ya tiene `LoginScreen`, `MainPOS`, `POSGrid`, `CartPanel` definidos en el mismo archivo. **¿Es necesario?** Hay tres versiones del POS conviviendo:
- `(cashier)/page.tsx` (clásico)
- `v2/page.tsx` (siguiente versión)
- `spa/page.tsx` (variante SPA)

**Pregunta abierta:** ¿`spa` y `v2` son experimentos vivos o se puede borrar uno? Ahorro grande si alguno está deprecado.

---

## Otras cosas menores

- **`apps/tpv/src/app/main.css`** (3 líneas: `@tailwind base/components/utilities`) — `globals.css` ya tiene esas mismas tres directivas. No se importa desde ningún lado verificable. Candidato a borrar.
- **`apps/tpv/CLAUDE.MD`** (mayúsculas) y **`README.md`** conviven. En filesystems case-sensitive (CI Linux) son archivos diferentes. Consolidar a uno.
- **`v2/page.tsx`** tiene `MOCK_CATEGORIES` y `MOCK_PRODUCTS` hardcodeados (líneas 42, 49). Si esto es para desarrollo, mover a `__fixtures__/`. Si es producción, eliminar el mock.

---

## Plan recomendado (priorizado por relación valor/riesgo)

| # | Acción | Riesgo | Beneficio |
|---|--------|--------|-----------|
| 1 | Borrar `page.tsx.bak`, `main.css` | Nulo | -88 KB, menos ruido |
| 2 | Confirmar si `spa/page.tsx` o uno de los POS está deprecado y borrar | Bajo (si lo confirmas) | -300 líneas |
| 3 | Modularizar `setup/page.tsx` (4 steps + primitivos) | Medio | El archivo crítico de onboarding queda navegable |
| 4 | Modularizar `kiosk/page.tsx` (4 screens + 2 hooks) | Medio | Cada pantalla testeable aislada |
| 5 | Modularizar `kds/page.tsx` (2 hooks + modal) | Bajo | Quita 250 líneas del componente principal |
| 6 | Consolidar `CLAUDE.MD` ↔ `README.md` | Nulo | Coherencia |
| 7 | Decidir sobre los mocks en `v2/page.tsx` | Depende del estado del feature | Quita ambigüedad de qué es prod vs demo |

---

## Patrón sugerido para los splits

Next.js App Router permite carpetas con prefijo `_` (underscore) que **no generan rutas**. Es la convención correcta para co-locar componentes y hooks específicos de una página:

```
app/setup/
  page.tsx                 # delgado, sólo orquesta
  _components/             # NO se rutean
    LoginStep.tsx
    AppearanceStep.tsx
  _hooks/
    useSetupFlow.ts
```

Esto mantiene cohesión local (todo lo del setup vive junto) sin contaminar `components/` con piezas que sólo usa una página.

---

## Preguntas abiertas (necesarias antes de tocar código)

1. ¿`spa/page.tsx`, `v2/page.tsx`, o ambos son deprecados/experimentales?
2. ¿`(cashier)/page.tsx` es la versión activa en producción?
3. ¿Los mocks en `v2/page.tsx` son sólo para desarrollo o se quedaron por error?
