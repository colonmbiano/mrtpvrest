# MRTPVREST — Claude Context File

## Proyecto
SaaS POS multi-tenant para restaurantes y negocios en LATAM.
- **Tenant de prueba:** Master Burger's (`slug: master-burguers`)
- **Super Admin:** `super@mrtpvrest.com` / `SuperAdmin1234!`
- **Repositorio:** `colonmbiano/mrtpvrest` (monorepo)

---

## Estructura del Monorepo

```
apps/
  admin/       → Panel de administración (dark theme, CSS variables)
  tpv/         → Terminal Punto de Venta (desplegado en tpv.masterburguers.com)
  client/      → App cliente (online ordering)
  delivery/    → App de repartidores
  backend/     → API Express (desplegado en Railway)
packages/
  database/    → Prisma schema compartido
  types/       → Tipos TypeScript compartidos
  config/      → Configuración compartida
```

---

## Reglas Críticas — Leer Antes de Cualquier Cambio

### 1. Dos schemas de Prisma — SIEMPRE sincronizados
Cualquier cambio de schema DEBE aplicarse en AMBOS archivos:
- `packages/database/prisma/schema.prisma`
- `apps/backend/prisma/schema.prisma`

**Nunca modificar uno sin el otro.**

### 2. Migraciones — Solo `db push`
```bash
# ✅ CORRECTO
npx prisma db push

# ❌ NUNCA usar esto
npx prisma migrate dev
```

### 3. Multi-tenancy — Siempre usar esta expresión
```typescript
// ✅ CORRECTO — soporta tanto middleware de Employee como User
req.user?.restaurantId || req.restaurantId

// ❌ INCORRECTO — rompe auth de empleados
req.restaurantId
```

### 4. Imports de Prisma — Solo desde el paquete compartido
```typescript
// ✅ CORRECTO
import { prisma } from '@mrtpvrest/database'

// ❌ INCORRECTO
import { PrismaClient } from '@prisma/client'
```

### 5. Prisma Binary Target (Railway)
El schema debe incluir:
```prisma
binaryTargets = ["native", "debian-openssl-3.0.x"]
```

---

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Base de datos | PostgreSQL (Railway) |
| ORM | Prisma |
| Frontend | React + Vite |
| Package manager | pnpm (monorepo) |
| Deploy backend | Railway |
| Deploy frontends | Vercel |
| Email | Resend API (Railway bloquea SMTP) |
| Auth TPV | PIN de empleado (tabla `Employee`) |
| Auth Admin | Email/password (tabla `User`) |

---

## Autenticación

El middleware de auth acepta tokens de **dos tablas distintas**:
- `Employee` → Login por PIN (TPV, KDS, Delivery)
- `User` → Login email/password (Admin, Super Admin)

`JWT_SECRET="escribe-cualquier-texto-largo-aqui-min-32-chars"`

Rutas protegidas por Super Admin usan `requireSuperAdmin`. Endpoints en `/api/saas/`.

---

## Despliegues

| App | URL | Plataforma |
|-----|-----|-----------|
| Backend | Railway | Railway |
| Admin | Vercel | Vercel |
| TPV | tpv.masterburguers.com | Vercel |
| Client | Vercel | Vercel |
| Delivery | Vercel | Vercel |

---

## Convenciones de Código

- **Windows CMD** para comandos locales (no PowerShell)
- Git push: `git add . && git commit -m "mensaje" && git push`
- Preferir **scripts Node.js** para cambios en masa, no edición manual
- Código **completo y listo para producción** — sin snippets parciales
- Bulk changes en rutas → script que itera los 17 archivos de `/api/`

---

## Módulos Implementados

### Backend (`/api/`)
- `auth` — registro, login, verificación email
- `orders` — pedidos con soporte delivery
- `employees` — gestión + PIN auth + turnos
- `shifts` — `CashShift`, `ShiftExpense`
- `saas` — planes, suscripciones, facturas (11 endpoints)
- `orders/:id/confirm-cash` — confirmación de efectivo por cajero

### Admin Panel
- Dark theme con sistema de CSS variables
- Sidebar component
- Onboarding 3 pasos con campo `businessType`
- businessType opciones: Restaurante, Abarrotes, Carnicería, Pollería, Otro

### TPV (`tpv.masterburguers.com`)
- Login por PIN
- Tab "💵 Efectivo" para confirmar pagos de delivery
- Config modal con gestión de impresoras

### KDS / Delivery / Client
- Implementados, desplegados en Vercel

---

## ImpresoraS
- Printer agent local: `~/printer-agent` (Linux Mint 22.3, Node v18.19.1)
- `npm init -y` y `npm install axios net` ya ejecutados
- Modelo `Printer` necesita campos pendientes: `connectionType`, `usbPort`, `bluetoothAddress`

---

## Integraciones Pendientes / En Progreso

| Integración | Estado |
|-------------|--------|
| Whapi.cloud (WhatsApp) | Parcial — necesita reconexión |
| Claude Vision API | Planeado (menu scanning) |
| MercadoPago | Diseñado |
| Stripe | Diseñado |
| Rappi / Uber Eats / DiDi | Panel diseñado |

---

## Modelos Prisma — Referencia Rápida

```
Restaurant   → tenant principal
Plan         → planes SaaS
Subscription → suscripción de tenant a plan
Invoice      → facturación SaaS
Employee     → staff con PIN
User         → admin/superadmin con email
CashShift    → turno de caja
ShiftExpense → gastos de turno
Order        → pedido (campos: cashCollected, cashCollectedAt, cashCollectedBy)
Printer      → impresoras WiFi/USB/BT
```

---

## Lo que NO Hacer

- ❌ No usar `migrate dev` — siempre `db push`
- ❌ No importar `@prisma/client` directamente en apps — usar `@mrtpvrest/database`
- ❌ No usar solo `req.restaurantId` — siempre con fallback
- ❌ No modificar un schema de Prisma sin el otro
- ❌ No usar PowerShell — solo CMD en Windows
- ❌ No instalar paquetes con npm en el monorepo — usar pnpm
- ❌ No hardcodear `restaurantId` en rutas — viene del token JWT

---

## Comandos Frecuentes

```bash
# Instalar dependencias
pnpm install

# Push de schema (desde packages/database o apps/backend)
npx prisma db push

# Generar cliente Prisma
npx prisma generate

# Dev backend
pnpm --filter backend dev

# Dev admin
pnpm --filter admin dev

# Build general
pnpm build
```