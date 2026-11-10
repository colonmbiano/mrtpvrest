# Aislamiento Multi-tenant — Tenant Guard

> Implementa la "Prisma Client Extension global" descrita en el ARD §7
> (Blindaje Multi-tenant). Garantiza que las queries de un restaurante no
> puedan leer ni mutar datos de otro (prevención de IDOR a nivel de ORM).

## El problema

Hasta su introducción, el aislamiento entre tenants dependía de que **cada
query** escribiera a mano `where: { restaurantId }`. Un solo olvido = fuga de
datos entre restaurantes. Con ~50 archivos de rutas eso es insostenible y es el
riesgo #1 para vender como SaaS multi-tenant.

## La solución

Una **Prisma Client Extension** (`packages/database/tenant-guard.js`) intercepta
todas las operaciones sobre modelos que tienen columna `restaurantId` y aplica
el filtro automáticamente. El restaurante "activo" del request viaja por
`AsyncLocalStorage`, que el backend rellena por petición
(`apps/backend/src/middleware/tenant-context.middleware.js`, montado justo
después de `tenant.middleware.js`).

```
request → tenant.middleware (resuelve restaurantId)
        → tenant-context.middleware (abre AsyncLocalStorage)
        → routers/handlers → prisma.*  ← el guard inyecta restaurantId
```

### Modelos protegidos

Los 21 modelos con columna `restaurantId` (lista en `SCOPED_MODELS`). Un test
(`apps/backend/__tests__/tenant-guard.test.js`) valida que la lista siga en
sync con `schema.prisma`, así que si agregas un modelo con `restaurantId` el CI
te avisará de actualizar `SCOPED_MODELS`.

> Los modelos hijos (p.ej. `OrderItem`) no llevan `restaurantId` propio; quedan
> protegidos indirectamente porque sólo se acceden vía su padre ya scopeado.
> Los modelos a nivel de plataforma (`Tenant`, `Plan`, `Subscription`…) no se
> tocan.

## Modos — variable `TENANT_GUARD_MODE`

| Modo | Comportamiento | Uso |
|------|----------------|-----|
| `off` | Passthrough total. | Apagar el guard por completo. |
| `warn` *(default)* | **No altera las queries**; sólo loguea cuando una query scopeada corre **sin** filtro `restaurantId` habiendo contexto de tenant. Cero cambios de comportamiento. | Producción durante el rollout / observación. |
| `enforce` | Inyecta `restaurantId` en `where`/`data` automáticamente. | Objetivo final en producción. |

## Rollout recomendado (seguro)

1. **Deploy con `warn` (default).** No cambia nada. Observa los logs
   `[tenant-guard] … sin filtro restaurantId` durante unos días.
2. **Corrige** las queries que aparezcan (o confía en que `enforce` las cubra —
   el guard respeta cualquier `restaurantId` explícito que ya pongas).
3. **Activa `enforce`** poniendo `TENANT_GUARD_MODE=enforce` en el backend
   (Railway). El guard pasa a inyectar el filtro automáticamente.

## Escape hatch — operaciones legítimamente cross-tenant

Algunas operaciones deben cruzar tenants a propósito:

- **Resolución de identidad** en login (`auth.middleware.js`): busca al
  User/Employee/Device por id antes de saber su tenant. Ya está envuelto en
  `runWithBypass()`.
- **Panel SUPER_ADMIN / jobs de plataforma**: cuando no hay `restaurantId` en
  contexto el guard hace passthrough automáticamente. Si necesitas cruzar
  tenants *teniendo* un restaurantId en contexto, envuelve la operación:

```js
const { runWithBypass } = require('@mrtpvrest/database');
const all = await runWithBypass(() => prisma.order.findMany());
```

## Limitaciones conocidas

- **`$queryRaw` / `$executeRaw`** no pasan por extensiones de Prisma — el SQL
  crudo debe seguir filtrando por `restaurantId` a mano.
- El guard usa `extendedWhereUnique` (GA desde Prisma 5) para añadir
  `restaurantId` al `where` de `findUnique`/`update`/`delete`. En `enforce`, un
  `update`/`delete` sobre un id de otro tenant lanza `P2025` (record not found),
  que es justo el comportamiento seguro: **no muta nada**.


## Inventario de SQL crudo del backend

El inventario actual contiene diez llamadas queryRaw, una queryRawUnsafe y dos escrituras o bloqueos executeRaw. La referencia a queryRaw en vault.routes.js es un comentario. El total ejecutable de lecturas es once. El plan señalaba doce lecturas. El conteo ejecutable actual es once.

Las consultas etiquetadas enlazan parámetros. Ninguna de estas APIs recibe el filtro automático de la extensión de Prisma.

| Archivo | API | Propósito | Alcance y autorización |
| --- | --- | --- | --- |
| `apps/backend/src/lib/delivery-incidents.js` | `$queryRaw` | Bloquear pedido antes de modificar entrega o incidencia | Filtra id y restaurantId resuelto y valida el repartidor o el personal dentro de la transacción. |
| `apps/backend/src/jobs/locationPromos.job.js` | `$queryRaw` | Bloqueo compartido de sucursal para la promoción periódica | Filtra id, restaurantId de la sucursal descubierta e isActive. |
| `apps/backend/src/lib/marketplace-settlements-prisma.js` | `$queryRaw` | Bloquear el restaurante durante la operación financiera | Usa id del restaurante obtenido del pedido y valida acceso del actor. |
| `apps/backend/src/lib/marketplace-settlements-prisma.js` | `$queryRaw` | Bloquear el pedido de la operación financiera | Filtra id y restaurantId del alcance resuelto antes de leer y escribir el ledger. |
| `apps/backend/src/lib/marketplace-orders.js` | `$queryRaw` | Bloquear pedido legado para transiciones | Filtra id, restaurantId de su pipeline y source MARKETPLACE. |
| `apps/backend/src/lib/marketplace-orders.js` | `$queryRaw` | Serializar creación y replays por comercio | Bloquea id del restaurante activo, resuelto por slug publicado y política de tenant. |
| `apps/backend/src/lib/marketplace-network-prisma.js` | `$queryRawUnsafe` | Bloquear las órdenes cargadas por la red compartida | SQL constante global, sin parámetros del cliente ni filtro de restaurante. Carga limitada a 5001 órdenes con política de red y autorización en los puertos del servicio. C6 sustituye este alcance global. |
| `apps/backend/src/lib/marketplace-driver-payouts.js` | `$queryRaw` | Bloquear el restaurante antes de reservar un retiro | Filtra id del restaurante activo y revalida identidad y acceso a ese restaurante. |
| `apps/backend/src/lib/saas-marketplace.js` | `$queryRaw` | Métricas globales de pedidos y GMV | Excepción global de SuperAdmin en bypass explícito. Une pipelines por orderId y restaurantId, excluye demos y valida moneda y comercios resultantes. |
| `apps/backend/src/lib/promo-adapter-prisma.js` | `$queryRaw` | Bloqueo compartido de sucursal en el adaptador | Filtra id, restaurantId resuelto e isActive. |
| `apps/backend/src/lib/promo-adapter-prisma.js` | `$queryRaw` | Bloqueo compartido de producto antes de aplicar promoción | Filtra id y restaurantId validado y vuelve a leer elegibilidad dentro de la transacción. |
| `apps/backend/src/lib/pin-attempts.js` | `$executeRaw` | Incremento atómico de intentos de PIN | Inserta restaurantId y orderId enlazados y usa su clave compuesta en ON CONFLICT. |
| `apps/backend/src/lib/marketplace-network-prisma.js` | `$executeRawUnsafe` | Exclusión mutua del coordinador de red | SQL constante de advisory lock global. No recibe datos del cliente. C6 reemplaza la coordinación global. |

La prueba marketplace-raw-sql-doc.test.cjs compara las llamadas ejecutables con estas filas. Una llamada nueva requiere documentar su propósito y alcance en este inventario.
