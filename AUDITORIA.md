# Auditoría MRTPVREST · 2026-05-07

> **Branch:** master · **Commit:** 372eb60 · **Stack:** Express + Prisma 7 · Next.js 16 + React 19 · Capacitor 8 · Vercel + Railway

11 apps · 3 packages · >85K LOC

---

## 1 · Resumen ejecutivo

Monorepo bien estructurado (pnpm workspace + Turbo) con 11 apps y 3 packages compartidos. La parte robusta es el TPV (Capacitor APK ya unificado en estética **diseño operativo**) y el backend Express con Prisma 7 sobre Supabase Postgres (driver-adapter pattern). Los puntos críticos están en **seguridad de endpoints públicos**, manejo de errores uniforme, deuda de tipado en `apps/admin/` y **duplicación de código** entre `apps/waiters`, `apps/tpv/(waiter)` y `apps/kds/(waiter)`.

### Hallazgos P0 (3)
- `GET /api/orders/:id` sin auth.
- Multi-tenancy laxo en `/api/menu/*` público.
- 245 `res.status(500)` sin códigos específicos.

### Hallazgos P1 (5)
- Duplicación waiters / kds / tpv.
- Sin rate-limit global en auth.
- JWT expiry sin métricas.
- 162 `any` en admin TS.
- Sin retry/backoff en `lib/api.ts`.

### Cleanup inmediato
- `apps/mobile-tpv/` (0 LOC).
- `apps/DELIVERY.pen` (60 KB).
- `apps/tpvcomplete.pen` (924 KB).

### Resuelto en esta sesión
- UI diseño operativo unificada en TPV (locked, cierre, admin/pagos, admin/seguridad, (waiter), OrdenClient, OrderTypeSelector).
- `/admin` 404 → landing creada.
- RBAC `/(waiter)` permite OWNER/ADMIN/MANAGER + hidratación Zustand antes de validar.
- `scan-menu` Gemini key (era Groq) + modelo `gemini-2.5-flash` (era 2.0 deprecado).
- `JSX.Element` → `React.ReactNode` (build Vercel admin).
- `/hub` auto-skipea workspace persistido.
- Modal editar impresora ahora tiene botón Test.
- `/hub` user pill con dropdown (placeholder eliminado).
- `(waiter)` "Llevar" ahora navega `/pos/menu` con TAKEOUT.
- `apps/client` build forzado a `--webpack` (next-pwa incompatible con Turbopack).

---

## 2 · Arquitectura

```
monorepo (pnpm + Turbo, packageManager: pnpm@9.15.0)
├── apps/
│   ├── tpv          ★ Capacitor APK · Next.js 16 · 18.2K LOC · tablet-principal
│   ├── admin        ★ Vercel web · 13.2K LOC · Sidebar w-64
│   ├── backend      ★ Railway · Express + Prisma 7 · 12.1K LOC
│   ├── saas         Vercel · super-admin de tenants
│   ├── delivery     Vercel + APK · GPS tracking + offline
│   ├── kiosk        Vercel + APK · autoservicio
│   ├── kds          Vercel + APK · cocina (mono OK)
│   ├── client       Vercel · tienda online (PWA next-pwa)
│   ├── landing      Vercel · marketing pure
│   ├── waiters      🟡 duplica /(waiter) del TPV
│   └── mobile-tpv   ❌ 0 LOC, eliminar
├── packages/
│   ├── config       tailwind base + tsconfig base
│   ├── database     Prisma 7 + adapter-pg + index.js
│   └── types        types compartidos
└── .github/workflows/
    ├── build-android-apk.yml   (auto en push a apps/tpv/**)
    └── ci-tpv.yml              (lint + test + build TPV)
```

---

## 3 · Backend (Express + Prisma)

### Seguridad & multi-tenancy

| Sev. | Archivo · línea | Issue |
|---|---|---|
| **P0** | `routes/orders.routes.js:69` | `GET /api/orders/:id` sin `authenticate` ni `requireTenantAccess`. Cualquiera puede leer detalle de cualquier orden. |
| **P0** | `routes/menu.routes.js:8,64,96,178` | GETs públicos del catálogo no validan que se pase `x-restaurant-id`; el filtro `req.user?.restaurantId || req.restaurantId` con `req.user` indefinido produce listados cruzados. |
| **P0** | Routes (245 sitios) | Patrón `catch(e){ res.status(500).json({error:e.message}) }`. Imposible debuggear y filtra detalles internos. |
| **P1** | `routes/auth.routes.js:72-89` | `/my-locations` y `/me` usan `authenticate` pero no `requireTenantAccess`. |
| **P1** | `middleware/auth.middleware.js:11,64` | JWT expiry capturado sin métricas. No hay rate-limit global; sólo PIN login está protegido. |
| **P2** | CORS | Origin allowlist por hostname pero no valida puerto. Bajo riesgo; revisar al exponer subdominios nuevos. |

### Rutas IA

| Endpoint | Resolver | Estado |
|---|---|---|
| `POST /api/ai/scan-menu` | `resolveGeminiKey()` | ✅ arreglado en esta sesión · gemini-2.5-flash |
| `POST /api/ai/scan-inventory` | `resolveGeminiKey()` | ✅ |
| `POST /api/ai/assistant` | `resolveGroqKey()` (BYOK) | ✅ |
| `POST /api/ai/agent` | `resolveAiKey()` | 🟡 verificar si voice-agent.service usa Gemini o Groq dentro |

> **Nota:** `ai.service.js` hace `JSON.parse` de la respuesta de Gemini sin try/catch anidado; si el modelo devuelve formato inválido el handler responde 500 opaco.

### Servicios & tests

- **printer.service.js:** ESC/POS + KDS native, buen manejo de timeouts. Logs `console.log` sin logger central.
- **assistant.service.js:** Groq Llama 3.1 con 4 tools read-only; bien acotado.
- **voice-agent.service.js:** Claude tool_use, sin validación de montos.
- **Tests:** solo `__tests__/notifications.test.js`. Cobertura cero en auth, órdenes, IA, multi-tenancy.

### Prisma 7

- Driver-adapter activo (`previewFeatures = ["driverAdapters"]`) con `@prisma/adapter-pg` + connection string Supabase.
- Logging condicional por `NODE_ENV` (dev: error+warn, prod: error). OK.
- Sin carpeta `migrations/` visible — Railway aplica auto-deploy del schema. Documentar.

---

## 4 · Admin web (apps/admin)

| Sev. | Issue | Acción |
|---|---|---|
| **P1** | 162 `any` + `useState<any>` repetidos (Sidebar, menu, mi-marca) | Tipar gradualmente; empezar por Sidebar. |
| **P1** | `lib/api.ts` sin retry/backoff ni interceptores de 5xx | Agregar retry exponencial para idempotentes. |
| **P1** | `integraciones/page.tsx` guarda `config` JSON sin validación de schema | Validar con Zod antes de PUT. |
| **P2** | Paleta mixta en `mi-marca` y `banners` (#111, #ff5c35) | Migrar a vars CSS diseño operativo. |
| **P2** | `console.log` en `mi-marca/page.tsx:246-251` | Eliminar. |
| **P2** | `confirm()` nativo en `bulkDelete()` y `deleteItem()` | Reemplazar con dialog accesible. |
| **P2** | `NEXT_PUBLIC_SUPABASE_*` en `.env.local.example` pero no en Vercel | Setear con `vercel env` si se va a usar Storage. |

---

## 5 · Frontends secundarios

| App | Estado | Hallazgo |
|---|---|---|
| `saas` | ✅ Activa | Next.js 16, sin Capacitor. Build OK. |
| `delivery` | ✅ Activa | Dual web + APK. `ignoreBuildErrors:true` oculta TS. |
| `kiosk` | ✅ Activa | Sistema de diseño propio (OLED/POP) — divergente. |
| `kds` | 🟡 Duplicada | Contiene `(waiter)/meseros` copiado del TPV. |
| `landing` | ✅ Activa | Pure Next + CSS custom. Sin Tailwind. |
| `client` | ✅ Activa | PWA next-pwa@5. Build forzado a webpack (esta sesión). |
| `waiters` | 🟡 Duplicada | ~Idéntica a `tpv/(waiter)` con CSS vars distintas. Sin `vercel.json`. |
| `mobile-tpv` | ❌ Muerta | 0 LOC. Eliminar. |
| `DELIVERY.pen` | ❌ Basura | Export Pen 60 KB. |
| `tpvcomplete.pen` | ❌ Basura | Export Pen 924 KB. |

### Sistema de diseño

Tres estilos coexistiendo:
- **diseño operativo** (TPV, admin, /admin TPV)
- **OLED/POP** (kiosk)
- **CSS vars genéricos** (waiters, kds parcial)

Recomendado consolidar tokens en `@mrtpvrest/config` y exponerlos a todas las apps.

### CI/CD

- `build-android-apk.yml` — disparo automático en push a `apps/tpv/**`. Tiempo medio ~1m45s.
- `ci-tpv.yml` — lint + test + build solo del TPV. **Otras apps no tienen CI.**
- `turbo.json` excluye `delivery/client/landing` del task `build` (raro; revisar).
- Workflow advierte sobre actions Node 20 deprecadas (forzar Node 24 en junio 2026).

---

## 6 · Plan priorizado

### P0 · esta semana

1. **Cerrar `GET /api/orders/:id`:** agregar `authenticate + requireTenantAccess`. Validar que el ticket pertenece al `restaurantId/locationId` del token.
2. **Sanear `routes/menu.routes.js`:** reescribir el patrón `req.user?.restaurantId || req.restaurantId` → exigir header `x-restaurant-id` + middleware que rechaza si vacío. Filtrar listados por ese id.
3. **Logger central:** introducir Pino o Winston. Reemplazar todos los `console.error`/`console.log` de routes y services. Incluir `requestId` y tenant info.
4. **Errores tipados:** agregar enum/factory `HttpError(code, message)`. Reemplazar `res.status(500).json({error:e.message})` por `sendError(res, err)` con códigos específicos (401/403/404/409/422). Empezar por `orders`, `shifts`, `menu`, `printers`.
5. **Eliminar basura:** borrar `apps/mobile-tpv/`, `apps/DELIVERY.pen`, `apps/tpvcomplete.pen`. Añadir `*.pen` al `.gitignore`.

### P1 · próximas dos semanas

1. **Decidir destino de `apps/waiters`:** mergear hacia `tpv/(waiter)` o promover como APK independiente. Si se mantiene, agregar `vercel.json` y CI.
2. **Limpiar `apps/kds/(waiter)`:** eliminar la ruta duplicada del KDS — solo debe contener pantalla de cocina.
3. **Rate limiting global:** `express-rate-limit` en `/api/auth/*`, `/api/employees/login`, `/api/ai/*`.
4. **Validación Zod en handlers POST/PUT:** empezar por `orders`, `shifts`, `integraciones`, `config`. Schema compartido en `packages/types`.
5. **Retry/backoff en `apps/admin/lib/api.ts`:** 3 intentos exponenciales para 5xx en GETs idempotentes.
6. **Tipar Sidebar/Menu admin:** reducir `any`; types compartidos en `packages/types` (`Restaurant`, `Location`, `MenuItem`, `Employee`).
7. **Tests:** Vitest+Supertest para `routes/auth`, `routes/orders`, `routes/printers`, `resolveGeminiKey`/`resolveGroqKey`. Coverage objetivo 30% inicial.
8. **JWT expiry métricas:** contador en `auth.middleware.js` y log estructurado.

### P2 · sprint siguiente

1. **Consolidar tokens de diseño:** mover paleta diseño operativo (#0a0a0c, #ffb84d, #88D66C, Outfit) a `packages/config/tokens.css`. Importar desde admin/tpv/saas/delivery.
2. **Migrar `mi-marca` y `banners` a diseño operativo:** aplicar el patrón ya usado en `tpv/admin/*`.
3. **CI ampliado:** workflows para admin, saas, backend (lint + type-check + test). Matrix con caching pnpm + Turbo remote.
4. **Forzar Node 24 en build-android-apk.yml:** evitar el deprecation warning de junio 2026. Set `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.
5. **Documentación:** crear `ARCHITECTURE.md` con diagrama por app, deploy target, dependencias entre packages, flow de auth/RBAC.
6. **Validación JSON en integraciones:** Zod schema por proveedor (Stripe, MercadoPago, etc.).
7. **Reemplazar `confirm()`** nativos por dialog accesible reusable en `packages/ui` (a crear).

---

## 7 · Ejecución sugerida

| Semana | Foco | Métrica de éxito |
|---|---|---|
| 1 | P0 · seguridad endpoints + logger | 0 endpoints de orders/menu sin auth · logger central activo |
| 2 | P1 · cleanup duplicación + Zod base | 1 sola ruta `(waiter)` · 5 handlers validados |
| 3 | P1 · tests + rate limit | Coverage ≥30% en routes críticas · rate limit en auth |
| 4 | P2 · tokens compartidos + CI ampliado | Paleta única importada en 4 apps · CI verde en admin/saas |

---

## 8 · Riesgos al no actuar

- **Filtración de pedidos** entre tenants vía `/api/orders/:id` y `/api/menu/*` sin auth.
- **Ceguera en producción:** 245 errores 500 opacos sin códigos hacen imposible diagnosticar incidentes.
- **Deuda exponencial** de duplicación waiters/tpv/kds: cualquier feature de meseros termina en 3 lugares.
- **Builds rotos** al actualizar Node (deprecation Node 20 actions GitHub).

---

_Generado · MRTPVREST · master @ 372eb60 · 2026-05-07_
