# MRTPVREST - Guía de Contexto

## Stack Tecnológico
- **Frontend:** Next.js 14 (App Router), TailwindCSS, Lucide React.
- **Backend:** Node.js (Express), Prisma ORM, Supabase (PostgreSQL).
- **IA:** Estrategia Híbrida (Groq Llama 3.1 para texto/chat, Gemini 1.5 Flash para visión).
- **Monorepo:** Apps en `apps/*` (tpv, backend, admin, saas, kds, kiosk, delivery, meseros-lite, client, landing) y librerías en `packages/{config,database,types}`.

## Identidad Visual (diseño operativo)
- **Fuentes:** Syne (Títulos), Outfit (Cuerpo).
- **Colores:** Fondo: #0C0C0E (Obsidiana), Acento: #FFB84D (Ámbar Miel), Éxito: #88D66C (Verde Salvia).
- **Estilo:** Glassmorphism, bordes redondeados (3xl/full), transparencias sutiles.

## Reglas de Desarrollo
1. **No Placeholders:** Siempre entrega el código completo y listo para producción.
2. **Naming:** Variables en camelCase, componentes en PascalCase.
3. **Multi-tenancy:** Siempre filtrar consultas por `restaurantId`. El guard de Prisma (`packages/database/tenant-guard.js`, ver `docs/TENANCY.md`) corre en **ENFORCE** en producción — pero el filtro explícito sigue siendo la práctica esperada. Implicaciones:
   - Lookups de identidad legítimamente cross-tenant (login por email, refresh, resolver al actor) van en `runWithBypass(...)` — sin eso, enforce los rompe (SUPER_ADMIN tiene `restaurantId` null). Patrón de referencia: `auth.middleware.js`.
   - Modelo nuevo con columna `restaurantId` → agregarlo a `SCOPED_MODELS` (el test `tenant-guard.test.js` falla si se te olvida; no lo ignores).
   - El SQL crudo (`$queryRaw`) NO pasa por el guard. Hoy hay cero raw queries en el backend; si agregas una, filtra por tenant a mano.
4. **Resiliencia:** Manejar errores 429/500 con respuestas controladas 503.

## Reglas de seguridad e integridad (post-auditoría 2026-06)

Implementadas y desplegadas — los cambios futuros NO deben regresionarlas.
Detalle y estado: `docs/AUDITORIA-VALIDACION.md`.

**Dinero y stock**
- Totales SIEMPRE server-side (`lib/money.js` → `computeOrderTotals`). Nunca confiar en `req.body.total`.
- Cancelar una orden repone inventario vía `restoreInventoryForCancelledOrder` (orders.routes): repone desde los `StockMovement` SALE, no recalcula recetas. Cualquier flujo nuevo de cancelación debe pasar por ahí (y solo en la transición real → CANCELLED).
- Cupones/puntos: el consumo va en la **misma `$transaction`** que crea la orden, con re-chequeo condicional en el WHERE (`usedCount < maxUses`, `points >= usados`). Prohibido validar en READ y consumir después, y prohibido `.catch(() => null)` en operaciones de dinero.

**Webhooks de pago**
- Idempotentes: `updateMany` condicional — solo el primer PAID gana y emite sockets; un evento no-PAID nunca degrada una orden pagada. Multi-escritura (invoice + subscription) en una sola `$transaction`.
- La BD respalda: UNIQUE en `invoices.externalId`, `subscriptions.externalId` y `orders.paymentProviderId`. No quitarlos.
- Stripe SaaS verifica firma con **raw body** (`express.raw` ANTES de `express.json` en index.js — no mover ese mount). Kiosk no usa firma por diseño: re-fetch del pago contra la API de la pasarela + `externalReference === orderId`.

**API**
- Nunca `data: req.body` directo a Prisma: usar `pick(req.body, [...campos])` de `lib/validate.js` (mass assignment).
- Replays del outbox del TPV se dedupean por header `Idempotency-Key` (`idempotency.middleware.js`, in-memory TTL 1h — migrar a Redis si Railway escala a multi-instancia).

**Sockets (lib/socket-guard.js)**
- Handlers de eventos entrantes nuevos: gatear con `allowEvent()` (rate limit) y validar contra la BD que el id del payload pertenece al restaurante del socket (`orderBelongsToRestaurant` / `locationBelongsToRestaurant`).
- Emisiones: el `restaurantId`/`locationId` del room sale de la BD o de `req`, NUNCA del payload del cliente.
- Un sweep periódico desconecta principales desactivados — no crear caminos de socket que esquiven `socket.data.user`.

**Apps Capacitor (tpv/kds/delivery)**
- Release es **https-only**: no re-agregar `usesCleartextTraffic`/`allowMixedContent` ni `cleartext` en capacitor.config. Dev contra backend http local usa los builds debug (overlay `src/debug/AndroidManifest.xml`).
- El JWT del TPV vive en `lib/token-vault.ts` (Keystore en APK nuevo, fallback legacy en web/APKs viejos). Todo acceso al token pasa por el vault — nunca `localStorage.getItem("accessToken")` directo. URLs de API se validan con `sanitizeApiUrl` (https siempre; http solo hosts privados).
- La impresión LAN es TCP nativo puerto 9100 (no HTTP) — los cambios de red del WebView no la afectan.

**Base de datos**
- **Prohibido `prisma db push` para cambios de schema**: causó drift (migración `20260612210000_reconcile_db_push_drift` lo reconcilió). Flujo: migración con `prisma migrate dev` → `prisma migrate deploy` MANUAL contra prod (Railway NO aplica migraciones, solo `prisma generate`) coordinado con el deploy del backend.
- Campos de dinero: NO usar `@db.Money` ni agregar `Float` nuevos; la migración a `Decimal` está planificada por etapas en `docs/plan-decimal-migration.md`.

**CI/CD**
- Actions pineadas a commit SHA con comentario `# vN` (Dependabot las actualiza). No volver a tags mutables.
- `permissions: contents: read` top-level en todo workflow nuevo; escrituras a nivel de job.
- E2E corre como gate en PRs a master; tras cambios grandes con push directo, dispararlo a mano (`gh workflow run e2e.yml`).
- El keystore de firma del APK release vive en GitHub Secrets (KEYSTORE_*) y el respaldo local en `C:\Users\colon\mrtpv-keystore\` — no perderlo, no commitearlo.

## Git Workflow (overrides parent CLAUDE.md)

**Push directo a `master` está permitido y es el flujo preferido en este proyecto.**
Esto anula explícitamente la regla "Never push directly to main" del `C:\Users\colon\Downloads\CLAUDE.md` (que pertenece a otro proyecto, Antigravity Kit).

- Para hotfixes pequeños: commitear y `git push origin master` directamente.
- Master push dispara los deploys de Vercel (admin, tpv, landing, saas, delivery, client) y Railway (backend).
- PRs siguen siendo válidos para cambios grandes o cuando se quiera review formal, pero no son obligatorios.

## Comandos Frecuentes
- Dev: `pnpm dev`
- Build TPV: `pnpm --filter @mrtpvrest/tpv build`
- Deploy: Push directo a `master` (Vercel + Railway lo recogen automáticamente).
