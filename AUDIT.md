# Auditoría MRTPVREST — 2026-04-22

> Revisión completa del monorepo a raíz de un bug persistente en el flujo de
> registro/onboarding del admin, donde los deploys de Vercel llegan a `Ready`
> pero el navegador del usuario sigue sirviendo código viejo en múltiples
> navegadores, incógnito, y con cache-busting.
>
> Este documento reemplaza al bucle de PRs reactivos: identifica la causa raíz
> más probable del síntoma actual (infra, no código) y lista la deuda técnica
> real que importa atacar después.

---

## TL;DR

1. **El bug que ves ahora no es de código.** Las últimas 5 merges son correctas. El síntoma (`Ruta no encontrada`, `No hay una sucursal seleccionada`) es coherente con una **configuración de Vercel incorrecta**: env vars faltantes, o un custom-domain alias amarrado a un deploy viejo. Verificar eso en el dashboard primero.
2. **Hay deuda técnica real** que no es urgente hoy pero que te va a morder: datos mock en el schema de Prisma, aislamiento multi-tenant débil, fallbacks a `localhost` en producción, endpoints duplicados.
3. **Los fixes de los PRs #26–#29 siguen siendo correctos** y deben quedarse. Solo no surtirán efecto hasta que la capa de infra esté bien.

---

## 1. Lo que probablemente bloquea el bug de hoy

Ninguna de estas hipótesis requiere cambiar código:

### A. `NEXT_PUBLIC_API_URL` no está seteado en Vercel
El frontend admin cae al fallback (`https://api.mrtpvrest.com` en `lib/api.ts`, o peor, `http://localhost:3001` en `verify-email/page.tsx`, `onboarding/page.tsx`, `login/page.tsx`, `OnboardingChecklist.tsx`, `TrialBanner.tsx`). Si el valor real no está en Production env, las llamadas a `/api/admin/locations` fallan silenciosamente → la sucursal parece "no existir" aunque sí está en la DB.

**Verificación:**
Vercel dashboard → proyecto `mrtpvrest-admin` → **Settings → Environment Variables**. Debe existir:
```
NEXT_PUBLIC_API_URL = https://<tu-backend-railway>.railway.app   (Production)
```
Repetir para `mrtpvrest-tpv`, `mrtpvrest-saas-admin`, `mrtpvrest-saas-client`.

### B. Custom domain amarrado a deploy viejo
El alias `admin.mrtpvrest.com` puede estar pinneado a un deployment específico y no al "Current production". Esto explicaría por qué Vercel dice `Ready` en builds nuevos pero el dominio sigue sirviendo el bundle de hace días.

**Verificación:**
Vercel → proyecto `mrtpvrest-admin` → **Settings → Domains**. El dominio debe decir:
- **"Production"** al lado (auto-update con cada push a master).
- NO: "Preview Branch" o un commit SHA específico.

### C. CDN/Cloudflare cacheando
Si tu DNS pasa por Cloudflare u otro CDN frente a Vercel, puede haber TTL largo.
**Verificación:** Cloudflare → **Caching → Purge Everything**.

### Resultado esperado tras arreglar A + B + C
- El wizard `/admin/configurar-negocio` funciona (auto-resuelve / auto-crea sucursal gracias al PR #28).
- El selector de planes aparece en `/register` (PR #26).
- El alias `/api/auth/register` deja de tirar 404 (PR #27).
- El SW viejo queda desregistrado al primer load (PR #29).

Si **después** de esto el wizard sigue bloqueado, hay un bug de código que aún no detectamos y vuelvo a cavar.

---

## 2. Hallazgos por severidad

### 🔴 Críticos

| # | Hallazgo | Dónde | Impacto | Fix sugerido |
|---|----------|-------|---------|--------------|
| C1 | Datos mock en Prisma schema | `packages/database/prisma/schema.prisma:685-703` — `TicketConfig.businessName default "Master Burger's"`, `subheader default "A chuparse los dedos"` | Cualquier sucursal sin config propia imprime tickets con el nombre del restaurante demo | Quitar defaults o hacerlos NULL; setear `businessName` desde el restaurant al crear la location |
| C2 | Aislamiento multi-tenant débil | `User.tenantId`, `User.restaurantId`, `Restaurant.tenantId` son todos `String?` | Usuarios legacy orphan no tiran error, solo devuelven arrays vacíos engañosos — confunde diagnóstico | Hacerlos `String` requerido (tras backfill); agregar guard `req.user.tenantId === resource.tenantId` en endpoints |
| C3 | Fallback a `localhost` en producción | `apps/admin/lib/api.ts:3`, `verify-email/page.tsx:8`, `onboarding/page.tsx:6`, `components/OnboardingChecklist.tsx`, `components/TrialBanner.tsx` | Si se pierde el env var, el frontend habla con un servidor que no existe → timeouts silenciosos, UX rota sin error claro | Centralizar en un único `lib/config.ts#getApiUrl()` que **tire error loud** si falta el env, no silencioso |

### 🟠 Altos

| # | Hallazgo | Dónde | Impacto | Fix sugerido |
|---|----------|-------|---------|--------------|
| H1 | SUPER_ADMIN redirige a `http://localhost:3005` en prod | `apps/admin/middleware.ts:24-25` — usa `NEXT_PUBLIC_SAAS_URL` sin fallback prod | SUPER_ADMIN que abra `admin.mrtpvrest.com` se manda a localhost | Fallback a `https://saas.mrtpvrest.com` en prod |
| H2 | `typescript: { ignoreBuildErrors: true }` y `eslint: { ignoreDuringBuilds: true }` | `apps/admin/next.config.js:3-7` | Regresiones silenciosas; TS errors que deberían bloquear deploy no lo hacen | Quitarlos, arreglar los errores que aparezcan |
| H3 | TPV diverge entre web y APK | `apps/tpv/next.config.mjs:4-6` — `output: 'export'` cuando `CAPACITOR_BUILD=true`, SSR en web | Dos flujos de build, comportamiento potencialmente distinto | Documentar explícitamente qué features NO están en la APK; ideal: forzar static en ambos |

### 🟡 Medios

| # | Hallazgo | Dónde | Impacto | Fix |
|---|----------|-------|---------|-----|
| M1 | 3 endpoints casi idénticos para listar locations | `auth.routes.js:66`, `admin.routes.js:111`, `locations.routes.js` | Tres fuentes de verdad, se pueden desincronizar | Consolidar a uno |
| M2 | `LoyaltyAccount` no tiene `restaurantId`, solo `userId UNIQUE` | `schema.prisma` | Un user que pertenezca a dos restaurantes comparte puntos entre ellos | Añadir `restaurantId` al compuesto |
| M3 | Saas app sin `middleware.ts` | `apps/saas/` | No hay protección de ruta a nivel app; confía en el login del cliente | Agregar middleware que exija SUPER_ADMIN |
| M4 | `apps/kiosk` sin `vercel.json` | `apps/kiosk/` | App huérfana, posiblemente no se despliega | Decidir: deploy o borrar |
| M5 | `emailVerifiedAt` no bloquea login | `auth.routes.js:26-64` | Usuario que no hizo clic en el email puede loguear | OK para testing; en producción, bloquear o advertir |
| M6 | Permissive CORS: `/\.railway\.app$/` | `apps/backend/src/index.js` | Cualquier subdomain de railway.app puede hablar con tu backend | Limitar a URLs específicos |
| M7 | Onboarding email: flujo "Revisa tu email" sin path alternativo | `apps/admin/app/register/page.tsx` | Si el email no llega, el usuario tiene que inferir que puede ir directo a `/login` | Agregar link "¿ya activaste? Ir a login" en la pantalla 3 |

### 🔵 Info (no requiere acción inmediata)

- Cinco Next.js apps, arquitectura coherente pero con cierta redundancia (landing, client, saas-client parece todo marketing/online).
- No hay dependencias de `next-pwa` / `serwist` / `workbox` — los SWs son manuales.
- Backend con fallback CORS a `'http://localhost:3001'` — esperado para dev, correcto.

---

## 3. Top 5 riesgos

1. **🔴 Env vars no verificados en Vercel** — probablemente *la* causa del bug que te tiene atrapado. 5 min de revisión.
2. **🔴 Mock data en schema** — cualquier cliente nuevo ve "Master Burger's" en sus tickets si no configura el businessName.
3. **🔴 Aislamiento tenant débil** — bomba de tiempo. Cuando tengas 5 clientes reales, uno va a ver data del otro por accidente.
4. **🟠 SUPER_ADMIN → localhost en prod** — tu cuenta principal puede quedar bloqueada en un redirect.
5. **🟠 `ignoreBuildErrors: true`** — cada regresión de TS entra a master silenciosamente.

---

## 4. Roadmap sugerido

### Fase 0 — Infra (tú, HOY)
- [ ] Verificar env vars en Vercel para los 4 proyectos.
- [ ] Verificar Domains aliasing en Vercel.
- [ ] Purge Cloudflare si aplica.
- [ ] Confirmar que el bug desaparece (o no).

### Fase 1 — Higiene crítica (1 PR consolidado, ~2h)
- [ ] Quitar defaults mock de `TicketConfig` en `schema.prisma` (+ migración de back-fill).
- [ ] Centralizar `getApiUrl()` en `apps/admin/lib/config.ts` (mismo patrón que ya tiene el TPV). Tirar error si falta env var.
- [ ] Eliminar el fallback a `localhost:3001` de los 5 archivos del admin; todos leen del helper central.
- [ ] `middleware.ts` del admin con fallback correcto para `NEXT_PUBLIC_SAAS_URL`.

### Fase 2 — Multi-tenant hardening (1 PR, ~3-4h)
- [ ] Migración que haga back-fill: `UPDATE users SET tenantId = restaurants.tenantId FROM restaurants WHERE users.restaurantId = restaurants.id AND users.tenantId IS NULL`.
- [ ] Schema: hacer `User.tenantId`, `User.restaurantId`, `Restaurant.tenantId` NOT NULL.
- [ ] Middleware `requireTenantAccess` en backend que valide que `req.user.tenantId === resource.tenantId` para todo lo que devuelva data de location/restaurant/order.

### Fase 3 — Limpieza (1 PR, ~1h)
- [ ] Consolidar los 3 endpoints de locations a uno (`/api/admin/locations` para consumir, los otros redirigen o se borran).
- [ ] Quitar `ignoreBuildErrors`, arreglar lo que salga.
- [ ] Decidir qué hacer con `apps/kiosk` (deploy o borrar).
- [ ] Agregar `restaurantId` al unique de `LoyaltyAccount`.

### Fase 4 — Observabilidad (1 PR, ~2h)
- [ ] Sentry / Logflare / cualquier collector para el backend y frontend. Sin esto, diagnosticar el próximo bug va a ser igual de doloroso que este.
- [ ] Logs estructurados en `/api/auth/register-tenant` y `/api/admin/locations` (los dos que más intenté debuggear a ciegas).

---

## 5. Qué ya está arreglado (últimas 5 PRs)

Estos PRs deben quedarse. Solo no surten efecto hasta que la infra esté bien:

| PR | Commit | Qué arregla |
|----|--------|-------------|
| #22 | `71125f9` | TPV remote config (N1 runtime apiUrl + N2 per-location) |
| #23 | `d557a40` | SUPER_ADMIN puede vincular TPV a cualquier sucursal cross-tenant |
| #24 | `2fec464` | `/setup` no depende de endpoint inexistente `/api/tenant/restaurants/:id/locations` |
| #25 | `4ddeb68` | Expone error real del backend en `/setup` (HTTP status + body) |
| #26 | `77bb426` | Selector de planes en `/register` + fix URL `/api/auth/register` → `/register-tenant` |
| #27 | `6615406` | Alias `/api/auth/register` → `/register-tenant` (belt-and-suspenders) |
| #28 | `c3430d1` | `/register-tenant` crea Location "Principal"; wizard auto-resuelve/crea sucursal |
| #29 | `960bf82` | Desregistra el SW global que cacheaba bundles viejos |

---

## 6. Mi recomendación concreta

1. **Infra primero** (Fase 0). Verifica env vars + domains ahora. Dame screenshot si quieres un segundo par de ojos.
2. **Si el bug desaparece** → Fase 1 y 2 en PRs separados pero en la misma semana. Fase 3-4 cuando respires.
3. **Si el bug sigue** → abrimos DevTools Network en el admin, capturamos qué response exacto da `/api/admin/locations`, y de ahí tiro el siguiente PR con certeza, no a ciegas.

No hago más fixes reactivos hasta cerrar Fase 0. Lo que sea que haga encima de una base mal conectada va a fallar igual.

---

*Auditoría generada el 2026-04-22 a partir del estado del branch `master` (`960bf82`) y la conversación operativa con el usuario.*
