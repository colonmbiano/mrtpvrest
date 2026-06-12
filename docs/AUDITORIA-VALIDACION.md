# Validación de la auditoría externa vs el repo real (2026-06-12)

Se validó el "Playbook de Auditoría" (reporte compass) contra el código real
con seis barridos paralelos. Veredicto: **los temas del reporte son correctos,
pero subestimó lo que ya existe**. Este doc registra qué ya estaba cubierto,
qué hallazgos son reales, y el plan de remediación priorizado.

## Falsos faltantes (ya existían en el repo)

| Afirmación del reporte | Realidad |
|---|---|
| "No hay tests" | 18 suites backend (~167 tests, threshold 95% en money/validate), 6 en TPV, 7 specs E2E Playwright |
| "No hay rate limiting" | `src/lib/rate-limiters.js` + limiters en login, PIN y overrides |
| "WebSockets sin defensas" | Handshake JWT + `canJoinRestaurant` (usa restaurantId del token, no del query), emisiones desde BD, CORS allowlist |
| "Falta IDOR/BOLA" | Patrón dominante `findFirst({ id, restaurantId })`; muestreo 8/10 endpoints validan, 2 públicos por diseño |
| "Considerar RLS Postgres" | Decisión documentada: acceso solo vía backend/Prisma; RLS-on sin políticas bloquea el anon key (ver docs/TENANCY.md) |
| "SQLi en $queryRaw" | Cero raw queries en apps/backend/src |
| "Falta idempotencia offline" | `clientOrderId` en órdenes/rondas + header `Idempotency-Key` en replays del outbox |

## Hallazgos reales confirmados

### P0 — dinero y stock
1. ~~Cancelar orden no restauraba stock~~ → **ARREGLADO** (`restoreInventoryForCancelledOrder`
   en orders.routes.js: repone desde los StockMovements SALE, neteado e idempotente).
2. ~~Cupones: race en `maxUses` (READ sin lock → más usos que el tope)~~ → **ARREGLADO**
   (consumo condicional `updateMany WHERE usedCount < maxUses` dentro de la tx del pedido).
3. ~~Puntos: saldo podía quedar negativo y la redención corría fuera de tx con
   `.catch(()=>null)`~~ → **ARREGLADO** (decremento condicional `WHERE points >= used`
   + movimiento REDEEMED en la misma `$transaction` que crea la orden).
4. ~~Tenant-guard con 3 modelos fuera de SCOPED_MODELS (Customer, DriverNotice,
   DriverShiftRequest)~~ → **ARREGLADO**. ~~Promover a enforce~~ → **HECHO
   (2026-06-12)**: 11h de logs en warn mostraban un solo patrón
   (User.findUnique en lookups de identidad), se envolvió en runWithBypass
   (commit 3bc4fb4) y se activó `TENANT_GUARD_MODE=enforce` en Railway.
   Rollback: volver la variable a `warn`.

### P0/P1 — webhooks de pago
5. ~~Kiosk webhooks sin idempotencia (doble emit de sockets → doble impresión)
   y eventos tardíos podían degradar órdenes pagadas~~ → **ARREGLADO**:
   `applyPaymentResult` usa updateMany condicional (`paymentStatus != PAID`);
   solo el primer PAID gana y emite; no-PAID nunca pisa una orden pagada.
   Mismo guard en el webhook web de payments.routes.js (`rejected` tardío ya
   no cancela órdenes pagadas).
6. ~~SaaS MP: invoice y subscription fuera de transacción~~ → **ARREGLADO**
   (`syncAuthorizedPaymentFromMercadoPago` envuelve ambas en `$transaction`
   con el dedupe por externalId adentro).
7. ~~Cero tests de webhooks~~ → **PARCIAL**: agregados 4 tests del kiosk
   webhook (idempotencia, no-downgrade, externalReference mismatch). Faltan
   tests de los webhooks SaaS.

**Pendiente con `db push` coordinado** (Railway NO aplica migraciones en
deploy — solo `prisma generate`; el constraint sin código que lo maneje o
viceversa rompe los webhooks):
- UNIQUE en `Invoice.externalId` y considerar tabla `WebhookEvent` con
  UNIQUE(provider, eventId) para dedupe duro por evento.
- Nota de diseño: los kiosk webhooks no verifican firma porque las llaves son
  per-restaurant y no se almacena webhook secret por restaurante; el patrón
  actual (re-fetch del pago contra la API de la pasarela + comparar
  externalReference) es la alternativa documentada por Stripe y no confía en
  el payload. Si algún día se guardan webhook secrets por restaurante,
  agregar la firma como primera barrera.

### P1 — TPV/Capacitor
8. Tokens en localStorage/sessionStorage (sin secure storage nativo) — pendiente.
9. ~~`usesCleartextTraffic="true"` + `allowMixedContent: true`; override de API
   URL sin validar~~ → **ARREGLADO** en TPV, KDS y delivery: cleartext fuera
   del manifest principal y de capacitor.config (la impresión LAN no se afecta:
   va por socket TCP nativo puerto 9100, no por la pila HTTP); builds debug lo
   re-habilitan vía `src/debug/AndroidManifest.xml` para dev contra backend
   http local. `getApiUrl` (TPV) y el override del KDS ahora validan: https
   siempre, http solo hacia hosts privados (localhost/10.x/192.168.x/172.16-31).
   ⚠️ El manifest y capacitor.config requieren **APK release nuevo** de las
   3 apps; la validación de URL sale por OTA (tpv/delivery) sin esperar APK.
10. ~~Verificar que el backend honre `Idempotency-Key` en `PUT /:id/payment`~~
    → **VERIFICADO OK**: `idempotency.middleware.js` dedupea cualquier método
    mutante con ese header (el outbox lo manda en todos los replays), scoped
    por tenant, TTL 1h. Caveat conocido y documentado en el archivo: cache en
    memoria — si Railway escala a multi-instancia hay que migrarlo a Redis.

### P1 — WebSockets
11. ~~Sin revalidación post-handshake~~ → **ARREGLADO**: sweep periódico
    (`SOCKET_REVALIDATE_MS`, default 5 min) en `lib/socket-guard.js` que
    desconecta sockets de User/Employee/Device desactivados (espeja la
    resolución de auth.middleware).
12. ~~Sin rate limiting; joins sin validar pertenencia~~ → **ARREGLADO**:
    tope de conexiones por IP (`SOCKET_MAX_CONN_PER_IP`, default 40), rate
    limit de eventos por socket (`SOCKET_EVENTS_PER_MIN`, default 60, ignora
    sin desconectar), y `join:order`/`join:location:*` verifican contra la BD
    que el id pertenece al restaurante del socket.

### P1 — CI/CD y dependencias
13. ~~Sin Dependabot~~ → **ARREGLADO**: `.github/dependabot.yml` (npm semanal,
    minor/patch agrupados, majors a mano; github-actions semanal). Las 17 vulns
    de `pnpm audit` (6 HIGH: @xmldom/xmldom x4, qs) llegarán como PRs al
    activarse; revisarlas y mergear.
14. ~~Sin bloques `permissions`~~ → **ARREGLADO**: GITHUB_TOKEN read-only
    top-level en los 11 workflows (el job de commit de APKs conserva su
    `contents: write` a nivel job). ~~Actions sin pin a SHA~~ → **ARREGLADO**:
    las 9 actions distintas pineadas a commit SHA con comentario `# vN`
    (Dependabot github-actions las mantiene). Pendiente: promover E2E a gate
    (requiere configurar los secrets del workflow primero).

### P2
- Migración `Float` → `Decimal` en ~50 campos monetarios (round2 server-side
  mitiga en los bordes; planificar como proyecto aparte con migración de datos)
  — pendiente.
- ~~Allowlist en los 3 endpoints con `data: req.body`~~ → **ARREGLADO**:
  helper `pick()` en `lib/validate.js` aplicado a banners (POST/PUT),
  categories (PUT) y suppliers (POST/PUT).
- ~~Sanitizar Morgan~~ → **FALSO POSITIVO**: index.js usa `combined`/`dev`,
  formatos que no incluyen headers; Authorization nunca se loguea.
- Firma criptográfica del bundle OTA + SSL pinning — pendiente.
- Dead-letter / límite de reintentos en el outbox offline del TPV — pendiente.

## Orden de ejecución sugerido para lo pendiente

1. Promover E2E a gate (configurar secrets del workflow primero).
2. UNIQUE constraints de webhooks + tests SaaS (con db push coordinado).
3. Tokens del TPV a secure storage nativo (requiere plugin + APK).
4. Migración Decimal (proyecto aparte).

> Nota de método: la validación fue por muestreo con agentes de lectura. Los
> archivo:línea son guía; cada fix debe re-verificar su contexto al implementarse.
