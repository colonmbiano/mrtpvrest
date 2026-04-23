# Arquitectura MRTPVREST — Fase 2: Centro de Mando SaaS (UI & Mutaciones)

**Rol:** Senior Next.js Developer & UI/UX Expert.
**Objetivo:** Actualizar el dashboard principal del proyecto `saas-admin` para ocultar el "Tenant de Plataforma" de las métricas y crear una interfaz interactiva (Toggles/Switches) para controlar los módulos de cada cliente en tiempo real.

## Contexto
En la Fase 1 actualizamos el esquema de Prisma añadiendo `hasInventory`, `hasDelivery`, `hasWebStore` (Booleanos) y `whatsappNumber` (String). Ahora necesitamos que el panel de administración global (SaaS Admin) pueda leer y modificar estos campos visualmente, sin recargar la página.

> **Nota de arquitectura:** MRTPVREST no usa Server Actions; el frontend `apps/saas` es una app Next.js de Client Components que consume un backend REST en `apps/backend` vía axios. Por eso las mutaciones se hacen como `PATCH` a endpoints en `saas.routes.js`, con refresco local en cliente (sin `revalidatePath`). El espíritu del plan se mantiene (optimistic updates, rollback en error, `useTransition` para estado de carga).

## Paso 1 — Filtro Anti-Plataforma (Data Fetching)
✅ Ya implementado en el commit `025dadc` — `fix(saas): exclude platform tenant from listings and metrics`.

El filtro vive en `apps/backend/src/routes/saas.routes.js` como constante reutilizable:

```js
const PLATFORM_TENANT_SLUG = 'mrtpvrest-platform';
const excludePlatform = { slug: { not: PLATFORM_TENANT_SLUG } };
```

Se aplica a:
- `GET /api/saas/tenants`
- `GET /api/saas/health` (`tenantCount` + `activeSubscriptions`)
- `GET /api/saas/top-tenants`
- `GET /api/saas/new-tenants`
- `GET /api/admin/tenants`

Las tarjetas de métricas del dashboard (`apps/saas/app/(dashboard)/dashboard/page.tsx`) y de marcas (`apps/saas/app/(dashboard)/marcas/page.tsx`) se calculan client-side sobre el array ya filtrado, así que reflejan el cambio automáticamente.

## Paso 2 — Mutación en backend (equivalente al Server Action)
Nuevo endpoint en `apps/backend/src/routes/saas.routes.js`:

```
PATCH /api/saas/tenants/:id/modules
Auth: SUPER_ADMIN
Body (parcial): {
  hasInventory?: boolean,
  hasDelivery?:  boolean,
  hasWebStore?:  boolean,
  whatsappNumber?: string | null,
  themeConfig?:  Record<string, unknown>
}
```

- Acepta campos opcionales; solo persiste los enviados.
- Excluye al tenant de plataforma vía `{ id, ...excludePlatform }` en el `where`.
- Responde con el tenant actualizado (+ subscription + plan).

## Paso 3 — UI interactiva (tabla de Marcas)
- **Componente cliente nuevo:** `apps/saas/components/TenantModulesToggle.tsx`.
  - Tres switches estilo pill (Tienda Web / Reparto / Inventario).
  - Input inline para `whatsappNumber` con ✎ / Enter para guardar, Escape para cancelar.
  - Usa `useTransition` para deshabilitar controles durante el request.
  - Optimistic update con rollback si el PATCH falla.
- **Integración:** `apps/saas/app/(dashboard)/marcas/page.tsx`
  - Nueva columna "Módulos & Web" antes de "Acciones".
  - `onUpdated(patch)` hace merge en el array `tenants` local para mantener el dashboard en sync sin refetch.
  - `onError` dispara el `showToast` ya existente.

## Paso 4 — Verificación
- `pnpm --filter @mrtpvrest/saas typecheck`
- `pnpm --filter @mrtpvrest/backend lint` (o la tarea equivalente).
- Probar manualmente:
  1. Login como SUPER_ADMIN.
  2. Ir a `/marcas`.
  3. Togglear los 3 switches de una marca y confirmar persistencia (refresh → estado respetado).
  4. Editar `whatsappNumber`, guardar con Enter, confirmar que aparece en la UI y se persiste.
  5. Verificar que el tenant `mrtpvrest-platform` NO aparece ni en la lista ni en las métricas.
