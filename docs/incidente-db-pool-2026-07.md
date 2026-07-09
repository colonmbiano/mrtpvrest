# Incidente: agotamiento del pool de conexiones a Supabase (P0)

**Fecha de análisis:** 2026-07-09
**Origen:** export de errores del system-log (`mrtpvrest-errors-2026-07-09T22_22_16.json`).
**Estado:** requiere acción de infraestructura en Railway (no es fix de código).

## Síntoma

~11 de los 50 errores CRITICAL del período (11-jun → 9-jul) son la misma causa raíz.
Clusters recientes: **2-jul 06:05–06:55** y **7-jul 05:20**.

| Mensaje | Veces | Endpoints afectados |
|---|---|---|
| `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15` | 7 | `/api/orders/admin?scope=active`, `/api/orders/:id` |
| `Query read timeout` | 3 | `/api/orders/admin?scope=active`, `/api/shifts` |
| `timeout exceeded when trying to connect` | 1 | `/api/orders/admin?scope=active` |

Además, varios 500 opacos (`Error interno` en `/api/gps/live`, `/api/delivery/*`;
`Error al obtener menu`; `Error al obtener configuracion`) **caen dentro de esas
mismas ventanas de saturación** → son colaterales del pool, no bugs propios.
Al resolver el pool deberían desaparecer.

## Causa raíz (verificada en código)

El `DATABASE_URL` de producción apunta al **pooler de Supabase en modo SESSION**
(el mensaje `session mode` es concluyente; endpoint session = puerto **5432** del
pooler). En session mode cada cliente toma un slot server-side hasta que cierra, y
el plan tiene un tope de **15** slots (`pool_size: 15`, seteado en Railway).

El backend abre **un pool de `pg` por instancia** vía `@prisma/adapter-pg`
([`packages/database/index.js:31`](../packages/database/index.js)):

```js
max: Number(process.env.DB_POOL_MAX || 10),   // default 10; en prod override a 15
```

Consumidores que compiten por esos 15 slots:

1. **Backend escalado**: `N_instancias × DB_POOL_MAX`. Con 2 instancias y `DB_POOL_MAX=15` ya son 30 > 15.
2. **Worker `masterbot-whatsapp`** (repo aparte, Railway): hoy importa `prisma`
   directo y abre su propio pool contra el mismo pooler
   (ver `docs/whatsapp-bot-saas-plan.md` §9.1). La Fase 2 (quitarle `DATABASE_URL`,
   dejarlo API-only) sigue pendiente → sigue comiendo slots.
3. **Seeds/scripts** corridos contra prod (`seed.ts`, `seed-tiers.js`,
   `delete-demo-tenant.js`, `extend-trial.js`, etc.) crean su **propio**
   `PrismaClient` → pool adicional mientras corren.

La query pesada `orders/admin?scope=active`
([`orders.routes.js:501`](../apps/backend/src/routes/orders.routes.js)) trae hasta
200 órdenes con `items→menuItem`, `table`, `user` y **no tiene índice que la
cubra** (el model `Order` solo indexa `tableId`/`customerId`/`createdById`). Bajo
carga tarda cerca del `statement_timeout` de 12s → mantiene la conexión ocupada →
acelera el agotamiento.

## Fix (ordenado por efectividad)

### 1. Cambiar el pooler a TRANSACTION mode (fix de raíz, sin código)
En Railway, servicio **backend**, apuntar `DATABASE_URL` al pooler en modo
transaction:
- host `...pooler.supabase.com`, **puerto `6543`**, agregar `?pgbouncer=true`.

Transaction mode multiplexa muchos clientes sobre pocas conexiones server-side →
elimina `EMAXCONNSESSION`.

⚠️ **Requisito al migrar a transaction mode:** `prisma migrate deploy` necesita
una conexión **directa/session** (DDL con estado no funciona sobre pgbouncer
transaction). Hoy `schema.prisma` **no** declara `directUrl`
([`packages/database/prisma/schema.prisma:11-13`](../packages/database/prisma/schema.prisma)).
Hay que:
- añadir `directUrl = env("DIRECT_URL")` al `datasource`, y
- setear `DIRECT_URL` en Railway apuntando al puerto **5432** directo (para migraciones).

### 2. Bajar `DB_POOL_MAX` (paliativo inmediato si se queda en session mode)
Hoy está en 15 (override; el default del código es 10). Bajar a **5–8** por
instancia y asegurar que `N_instancias × DB_POOL_MAX + pool_bot + seeds < 15`.
Con transaction mode (fix 1) esto deja de ser crítico y 10 es seguro.

### 3. Índice para `scope=active` (recorta los query timeouts)
Añadir a `model Order` en `schema.prisma`:

```prisma
@@index([restaurantId, status, createdAt])
```

(o el más selectivo `@@index([restaurantId, locationId, status, createdAt])`).
Cubre el filtro `restaurantId (+locationId) + status IN (...) ORDER BY createdAt desc`
y también beneficia `GET /table/:tableId/open`.
**Flujo (según CLAUDE.md, prohibido `db push`):** `prisma migrate dev` local →
`prisma migrate deploy` MANUAL contra prod coordinado con el deploy.

### 4. Recortar consumidores de sesión
- Acelerar la Fase 2 del bot (`docs/whatsapp-bot-saas-plan.md` §9.6-C): quitarle
  `DATABASE_URL` al `masterbot-whatsapp` y dejarlo API-only.
- No correr seeds/scripts contra prod en horario pico.

## Lo que NO es la causa (ya resuelto)

- Los errores de `prisma.modifier(Group).delete()` con
  `order_item_modifiers_modifierId_fkey` (4 eventos, todos ≤ 20-jun) **ya están
  arreglados**: la migración
  `packages/database/prisma/migrations/20260620020000_modifier_setnull_on_delete/`
  hace `modifierId` nullable + `ON DELETE SET NULL`. Verificar solo que se aplicó
  en prod con `prisma migrate deploy`.
- Los rechazos de CORS a `tauri.localhost` ya no ocurren: el origen está en el
  allowlist ([`index.js`](../apps/backend/src/index.js), `isTauri`).
