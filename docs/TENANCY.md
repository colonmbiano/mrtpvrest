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
