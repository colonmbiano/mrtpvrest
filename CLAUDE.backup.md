# CLAUDE.md — mrtpvrest

## Workflow de Git

**Trabajamos directamente sobre `master`. Sin ramas de feature ni PRs.**

1. **Commits**: directo a `master`. No crear ramas `claude/…`, `feat/…`, etc.
2. **Push**: `git push origin master`. Si falla por estar detrás: `git pull --rebase origin master` y reintentar.
3. **Pull requests**: no crear PRs salvo que el usuario lo pida explícitamente.
4. Si el harness asigna una rama `claude/…`, ignorarla y trabajar sobre `master`.
5. Al inicio de sesión: `git checkout master && git pull --ff-only origin master`.

**Excepciones**: migraciones de BD, borrado masivo o cambios en CI/infra → pedir confirmación antes de commitear.

---

## Descripción del Proyecto

**mrtpvrest** es un SaaS multi-tenant de punto de venta (POS) para restaurantes.  
Stack: pnpm workspaces + Turborepo · Node ≥ 20 · TypeScript (apps Next.js) + JavaScript (backend Express).

---

## Estructura del Monorepo

```
mrtpvrest/
├── apps/
│   ├── admin/          # Panel de administración del restaurante (puerto 3002)
│   ├── backend/        # API REST + WebSockets (Express + Socket.io)
│   ├── tpv/            # Terminal punto de venta web/Android (puerto 3005)
│   ├── saas/           # Dashboard SaaS para gestión de tenants
│   ├── landing/        # Página de marketing
│   ├── client/         # App de pedidos para clientes
│   ├── kiosk/          # Kiosco de auto-servicio
│   └── mobile-tpv/     # Variante mobile (scaffold)
├── packages/
│   ├── database/       # Prisma ORM — schema + cliente compartido (@mrtpvrest/database)
│   ├── config/         # Tailwind base + tsconfig base (@mrtpvrest/config)
│   └── types/          # Tipos TypeScript compartidos (@mrtpvrest/types)
├── tests/
│   └── e2e/            # Suite Playwright (13 tests, todos pasando)
└── CLAUDE.md
```

---

## Apps en Detalle

### `apps/admin` — Panel Administrador (Next.js 14, puerto 3002)

Auth: JWT en `localStorage` (`accessToken`, `refreshToken`, `restaurantId`, `locationId`) + cookie `mb-role` para el middleware Edge de Next.js.

Rutas principales bajo `app/(admin)/admin/`:

| Ruta | Propósito |
|------|-----------|
| `/admin` | Dashboard con métricas en tiempo real |
| `/admin/pedidos` | Gestión de órdenes |
| `/admin/empleados` | CRUD de empleados (PIN, rol, permisos) |
| `/admin/menu` `/admin/categorias` `/admin/variantes` | Gestión de menú |
| `/admin/inventario` | Inventario, proveedores, recetas |
| `/admin/reportes` `/admin/reportes/ia` | Reportes + análisis con IA (Gemini) |
| `/admin/logistica` `/admin/rastreo` | Logística y rastreo GPS de repartidores |
| `/admin/billing` | Suscripción Stripe B2B |
| `/admin/modulos` | Activar/desactivar módulos SaaS del tenant |
| `/admin/banners` `/admin/integraciones` | Banners y configuración de integraciones |
| `/admin/mi-marca` | Configuración general de la marca |

**lib/api.ts**: `baseURL: ""` en browser (Next.js rewrites proxian a la API). El interceptor inyecta automáticamente `Authorization`, `x-restaurant-id`, `x-location-id` desde `localStorage`.

---

### `apps/backend` — API REST (Express 4 + Socket.io)

Rutas en `src/routes/` (20 archivos):

| Archivo | Área |
|---------|------|
| `auth.routes.js` | Login, registro, refresh JWT |
| `employees.routes.js` | CRUD empleados + PIN login + **DELETE /:id** |
| `orders.routes.js` | Órdenes (crear, actualizar estado) |
| `dashboard.routes.js` | Métricas y analytics |
| `kds.routes.js` | Kitchen Display System |
| `menu.routes.js` | Productos, categorías |
| `inventory.routes.js` | Stock, recetas, lotes, movimientos |
| `delivery.routes.js` | Pedidos delivery |
| `logistics.routes.js` `gps.routes.js` `driver-cash.routes.js` | Repartidores y caja |
| `shifts.routes.js` | Turnos de caja |
| `locations.routes.js` `admin.routes.js` | Sucursales y configuración admin |
| `saas.routes.js` `modules.routes.js` `tenant.routes.js` | Multi-tenant SaaS |
| `saas-billing.routes.js` `saas-billing-webhook.routes.js` | Stripe B2B |
| `ai.routes.js` | Análisis con Google Gemini |
| `loyalty.routes.js` `kiosk.routes.js` `store.routes.js` | Fidelidad, kiosco, tienda web |

Integraciones externas: **Stripe** (suscripciones B2B), **MercadoPago** (pagos de clientes), **Cloudinary** (imágenes), **Google Gemini** (IA), **Resend/SMTP** (email), **Web Push** (notificaciones), **OpenAI**.

Middleware de auth (`src/middleware/auth.middleware.js`): `authenticate` → `requireTenantAccess` → `requireAdmin`.  
El tenant se identifica por los headers `x-restaurant-id` y `x-location-id`.

---

### `apps/tpv` — Terminal POS (Next.js 14 + Capacitor, puerto 3005)

Auth: JWT en `localStorage` (`restaurantId`, `locationId` para vincular el dispositivo; `accessToken` del empleado tras login con PIN).

Flujo de inicio:
1. Si no hay `restaurantId`/`locationId` → redirige a `/setup` (wizard de vinculación).
2. Con IDs → muestra PIN pad (`TPVLockScreen`). PIN requiere clic explícito en **"Ingresar"** (no auto-submit).
3. Según rol del empleado:
   - `COOK` → redirige a `/kds`
   - `WAITER` → redirige a `/meseros`
   - Otros → permanece en la vista principal del TPV

**Capacitor**: el TPV se exporta estáticamente (`next build → out/`) y se empaqueta como APK Android vía Gradle. CI/CD en `.github/workflows/build-android-apk.yml` (se dispara en push a master cuando cambia `apps/tpv/**`).

---

### `apps/saas` — Dashboard SaaS

Gestión de tenants: módulos por plan (`hasInventory`, `hasDelivery`, `hasWebStore`, `whatsappNumber`), suscripciones Stripe, logs.

---

## Base de Datos (Prisma)

Schema: `packages/database/prisma/schema.prisma`  
47 modelos. Modelos principales:

| Área | Modelos |
|------|---------|
| Multi-tenant | `Tenant`, `Plan`, `Subscription`, `Invoice`, `SaasApiKey` |
| Restaurante | `Restaurant`, `Location`, `RestaurantConfig`, `GlobalConfig` |
| Usuarios | `User` |
| Empleados | `Employee`, `EmployeeShift`, `CashShift`, `ShiftExpense` |
| Meseros | `Waiter`, `WaiterShift` |
| Menú | `MenuItem`, `MenuItemVariant`, `MenuItemComplement`, `MenuCategory` |
| Órdenes | `Order`, `OrderItem`, `OrderItemModifier`, `OrderStatusHistory`, `OrderRound` |
| Inventario | `Ingredient`, `InventoryBatch`, `InventoryMovement`, `RecipeItem`, `Supplier` |
| Logística | `Vehicle`, `Ride`, `Expense`, `DriverLocation`, `DriverRoute`, `DriverCashMovement`, `DriverCashCut` |
| Mesas/KDS | `Table`, `KdsItemStatus`, `KdsMessage`, `TpvRemoteConfig` |
| Fidelidad | `LoyaltyAccount`, `LoyaltyTransaction`, `Coupon` |
| Otros | `Banner`, `Printer`, `TicketConfig`, `PushSubscription`, `IntegrationConfig`, `ExternalOrder` |

Comandos:
```bash
pnpm db:generate   # genera el cliente Prisma
pnpm db:push       # aplica el schema a la BD sin migración
```

---

## Tests E2E (Playwright)

```
tests/e2e/
├── playwright.config.ts   # 30s timeout, retries en CI, reporte HTML
├── auth.setup.ts          # login admin → guarda .auth/admin.json
├── helpers.ts             # injectAdminAuth(), injectTPVDevice(), enterPIN()
├── 01-login.spec.ts       # Super admin (saas) + admin restaurante + credenciales inválidas
├── 02-tpv.spec.ts         # PIN login + vista según rol
├── 03-kds.spec.ts         # KDS carga correctamente
├── 04-empleados.spec.ts   # Crear mesero → login TPV → eliminar
└── 05-repartidor.spec.ts  # Crear repartidor → login TPV → eliminar
```

**Estado actual: 13/13 tests pasando.**

Comandos:
```bash
pnpm test:e2e          # headless
pnpm test:e2e:ui       # modo UI/debug
pnpm test:e2e:report   # ver reporte HTML
```

Variables de entorno necesarias en `tests/e2e/.env.test` (no commitear):
```
ADMIN_URL=https://admin.mrtpvrest.com
SAAS_URL=https://saas.mrtpvrest.com
TPV_URL=https://tpv.mrtpvrest.com
SUPERADMIN_EMAIL=...
SUPERADMIN_PASSWORD=...
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
EMPLOYEE_PIN=...
```

Detalles de helpers:
- **`injectAdminAuth(page, context)`**: navega a `ADMIN_URL` (establece origen), inyecta `accessToken`, `refreshToken`, `user`, `restaurantId`, `locationId`, `restaurantName` via `page.evaluate()`. También inyecta cookie `mb-role` para el middleware Edge.
- **`injectTPVDevice(page)`**: doble-navegación a `TPV_URL` para inyectar `restaurantId` + `locationId` + nombres via `page.evaluate()`.
- **`enterPIN(page, pin)`**: espera el PIN pad, entra dígitos, pulsa **"Ingresar"**, espera `<header>`.

---

## CI/CD

`.github/workflows/build-android-apk.yml`:
- Disparo: push/PR a `master` con cambios en `apps/tpv/**`
- Pipeline: Node 20 → pnpm install → Java 17 + Android SDK → `next build` (export estático) → Gradle `assembleDebug`
- Artefacto: `app-debug.apk` (14 días de retención)

---

## URLs de Producción

| Servicio | URL |
|----------|-----|
| Admin | https://admin.mrtpvrest.com |
| TPV | https://tpv.mrtpvrest.com |
| API | https://api.mrtpvrest.com |
| SaaS | https://saas.mrtpvrest.com |

---

## Variables de Entorno del Backend

Archivo `apps/backend/.env` (no commitear):

```
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_REFRESH_SECRET=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
RESEND_API_KEY=...
SMTP_USER=...
SMTP_FROM_NAME=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_EMAIL=...
GOOGLE_AI_API_KEY=...
FRONTEND_URL=https://admin.mrtpvrest.com
CORS_ORIGINS=https://admin.mrtpvrest.com,https://tpv.mrtpvrest.com,...
```
