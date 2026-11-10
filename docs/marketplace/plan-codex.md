# Plan de Codex — Mercadito Colorines

> Archivo para Codex: `docs/marketplace/plan-codex.md`.
> Para empezar, dile a Codex: **"Lee docs/marketplace/plan-codex.md y haz la siguiente tarea pendiente."**
> Fecha: 9 de noviembre de 2026 · Base revisada: `master` en `bee7b2f` (auditoría del Mercadito).

## 1. Contexto en 30 segundos

Mercadito Colorines es el marketplace de MRTPVREST: clientes piden a varios negocios, el pedido entra
al TPV del negocio y lo entrega un repartidor con el código de 6 dígitos del cliente. Una auditoría
del 9/nov encontró 21 problemas. Se reparten así:

- **Claude** hace las 8 tareas riesgosas (dinero, cancelaciones, concurrencia, red de repartidores): C1–C8.
- **Codex (tú)** haces las 13 tareas acotadas de este archivo: X1–X13.

Trabajamos en paralelo sobre el mismo repo. Este archivo te dice qué hacer, en qué orden, qué archivos
son tuyos y cuáles no debes tocar.

## 2. Reglas (obligatorias en todas las tareas)

1. **Una rama y un PR por tarea**, desde `master`: `codex/<ID>-<nombre-corto>` (ej. `codex/X2-ci-marketplace`).
2. Antes de editar: `pnpm agent start --agent Codex --task "<ID> <tarea>"`.
   Al terminar: `pnpm agent handoff --agent Codex --notes "<qué cambió y qué probaste>"`. Lee `docs/agent-collab.md`.
3. Lee `CLAUDE.md` antes de la primera tarea. Sus reglas de dinero, webhooks, sockets y base de datos aplican siempre.
4. **Toca solo los archivos que nombra la tarea.** Si necesitas otro, explícalo en el PR. Nunca edites los
   archivos de la sección 4 ("Archivos de Claude").
5. **Migraciones solo aditivas**: columna nullable o con default, creada con `prisma migrate dev` y su carpeta en
   `packages/database/prisma/migrations/`. Nunca `prisma db push`. Fusionar a `master` despliega y migra solo.
   Mantén iguales los dos schemas (`packages/database/prisma/schema.prisma` y `apps/backend/prisma/schema.prisma`).
6. **Multi-tenant**: filtra siempre por `restaurantId`. Modelo nuevo con `restaurantId` → agrégalo a
   `SCOPED_MODELS` en `packages/database/tenant-guard.js`.
7. **Pruebas**: agrega o actualiza pruebas en cada tarea. Antes del PR corre
   `node scripts/test-marketplace-all.mjs` y el `tsc --noEmit` de cada app que toques.
8. **Respeta los "Espera a"**: no empieces una tarea hasta que su dependencia esté fusionada en `master`
   (sección 5 dice cómo saberlo).
9. **Nada de textos legales inventados**: donde falte un dato, deja un marcador entre corchetes.
10. En el PR, separa lo que probaste **con mocks**, **con PostgreSQL desechable** y **en navegador**.
    Usa la plantilla de la sección 7.

## 3. Decisiones ya tomadas (no las vuelvas a preguntar)

| Tema | Decisión |
| --- | --- |
| Pedido sin aceptar | Se cancela y reembolsa solo a los 15 minutos (lo hace Claude en C2) |
| Cancelación de pedido pagado | Reembolso total, envío incluido (Claude, C1) |
| Entrega sin código desde caja | Se conserva el permiso, con **motivo obligatorio** y registro (tu tarea X6) |
| Comisión | 0% durante el piloto |
| Comisión en línea vía Mercado Pago | Pospuesta a la ola 2 (Claude, C3) |
| Cupones, puntos y propina en el Mercadito | No existen todavía; el cupón se rechaza con mensaje (tu tarea X4) |
| Aviso de privacidad y términos | Codex arma páginas con marcadores; el responsable legal lo define Alex con un abogado |
| Pago al repartidor independiente | 100% del envío, pago diario (Claude, C8) |

## 4. Archivos de Claude (no editar)

Claude trabaja en estos archivos. Si una tarea tuya los necesita, espera a que su PR esté en `master`
y entonces solo **llama** a sus funciones; no cambies su lógica.

- `apps/backend/src/lib/order-status.js`
- `apps/backend/src/routes/orders.routes.js` → solo el handler `PUT /:id/status` hasta que C1 esté fusionado
- `apps/backend/src/lib/marketplace-cancel.js` (nuevo, C1)
- `apps/backend/src/lib/marketplace-settlements-v1.js`, `marketplace-settlements-prisma.js`, `marketplace-ledger.js`
- `apps/backend/src/jobs/marketplacePending.job.js` (nuevo, C2) y `apps/backend/src/lib/marketplace-v1-notify.js`
- `apps/backend/src/lib/marketplace-payment-gateway.js`, `marketplace-v1-payments.js`
- `apps/backend/src/lib/marketplace-quote.js` y `marketplace-order-orchestrator.js` → excepto el cambio pequeño de X4
- `apps/backend/src/lib/marketplace-network-prisma.js`, `marketplace-dispatch.js`, `routes/marketplace-dispatch.routes.js` (C6–C7, ola 3)
- `apps/backend/src/lib/marketplace-driver-payouts.js` (C8)
- `apps/backend/src/lib/marketplace-commissions.js` (C5) → X14 solo llama a `GET /api/marketplace/v1/merchant/commissions`

## 5. Orden de trabajo y estado

Haz las tareas en este orden. Actualiza la columna **Estado** en este archivo dentro de tu PR
(`Pendiente` → `En curso` → `PR abierto` → `Fusionado`).

**Cómo saber si una dependencia de Claude ya está en master:** busca en `git log origin/master --oneline`
un commit cuyo mensaje empiece con su ID (ej. `C1:`), o que exista el archivo nuevo que menciona la sección 4
(ej. `apps/backend/src/lib/marketplace-cancel.js`). Si no está, salta a la siguiente tarea sin dependencia.

| Orden | ID | Ola | Tarea | Espera a | Estado |
| --- | --- | --- | --- | --- | --- |
| 1 | X2 | 1 | Suites del marketplace en CI | — | Fusionado |
| 2 | X3 | 1 | Pedido legado detrás de bandera | X2 | Fusionado |
| 3 | X4 | 1 | Cupón rechazado con mensaje | X2 | PR abierto |
| 4 | X5 | 1 | Alarma y contador en el TPV | X2 | Fusionado |
| 5 | X1 | 1 | Aviso de privacidad, términos y aceptación | X2 | Pendiente |
| 6 | X6 | 1 | Entrega sin código con motivo | C1 | Pendiente |
| 7 | X9 | 2 | Límite de intentos en Redis | X2 | Pendiente |
| 8 | X10 | 2 | Tokens del repartidor | X2 | Pendiente |
| 9 | X11 | 2 | Regla de SQL crudo | X2 | Pendiente |
| 10 | X7 | 2 | Cancelar desde la cuenta y WhatsApp a la tienda | C2 | Pendiente |
| 11 | X8 | 2 | Sucursal por cobertura | C4 | Pendiente |
| 12 | X13 | 3 | Botón Verificar y documentos del repartidor | X2 | Pendiente |
| 13 | X12 | 3 | Ofertas con zona y distancia | C6 | Pendiente |
| 14 | X14 | 2 | Comisiones del comercio en el admin | C5 | Pendiente |

Rutas de backend relativas a `apps/backend/src` salvo que se diga otra cosa.

---

## 6. Tareas

### X2 · Suites del marketplace en CI  (va primero)

**Por qué:** CI hoy corre 7 de 32 suites del marketplace; hay 4 pruebas rotas que nadie ve.

**Haz:**
1. En `.github/workflows/ci-backend.yml`, agrega un paso que corra `node scripts/test-marketplace-all.mjs`
   después de `pnpm install --frozen-lockfile`, con la misma BD de pruebas que ya usa el workflow.
2. Arregla 3 pruebas de orden de montaje:
   - test 71 de `apps/backend/scripts/marketplace-hybrid-policy.test.cjs`
   - test 50 de `apps/backend/scripts/marketplace-ops-dispatch-v1.test.cjs`
   - test 68 de `apps/backend/scripts/marketplace-tracking-v1.test.cjs`

   Fallan porque buscan la primera aparición de `app.use('/api/marketplace',` y encuentran
   `app.use('/api/marketplace', require('./lib/marketplace-owner-settings').settingsMiddleware())`
   en `index.js` (línea ~174). Deben ignorar ese middleware y comparar contra el montaje de `marketplace.routes`.
3. Revisa el test 30 de `apps/backend/scripts/marketplace-orders.test.cjs` (adaptador legado). Arréglalo o márcalo
   `skip` con la razón en un comentario.
4. Confirma que `scripts/test-marketplace-all.mjs` incluye todas las suites `apps/backend/scripts/marketplace-*.test.cjs`;
   agrega las que falten.

**Listo cuando:** CI en verde con todas las suites del marketplace.

### X3 · Pedido legado detrás de bandera

**Por qué:** además del pedido v1 sigue montado el pedido legado anónimo `POST /api/marketplace/orders`.

**Haz:** en `routes/marketplace.routes.js`, `POST /orders` solo responde si
`process.env.MARKETPLACE_LEGACY_ORDERS_ENABLED === 'true'`. Sin ella: `404` con
`{ errorCode: 'LEGACY_ORDERS_DISABLED' }`. `GET /orders/:id/status` sigue funcionando.

**Listo cuando:** prueba con supertest de ambos casos.

### X4 · Cupón rechazado con mensaje

**Por qué:** la cotización acepta `couponCode` y lo ignora en silencio.

**Haz:** en `lib/marketplace-quote.js` (función `normalize`), si llega `couponCode` responde `409`
`COUPON_NOT_SUPPORTED` con el mensaje "Los cupones aún no aplican en Mercadito Colorines". Es el único cambio
permitido en ese archivo. Confirma que el checkout v1 de `apps/client` no envía `couponCode`
(`src/components/StoreCheckout.tsx`, `src/lib/marketplaceV1Checkout.ts`).

**Listo cuando:** `apps/backend/scripts/marketplace-quote.test.cjs` cubre el rechazo.

### X5 · Alarma y contador en el TPV

**Por qué:** si nadie ve un pedido por aceptar, el cliente espera; hoy el TPV avisa una sola vez.

**Haz:** en `apps/tpv`, para pedidos del marketplace en `PENDING_MERCHANT`:
- alarma que se repite cada 30 s hasta aceptar o rechazar;
- contador de minutos esperando en cada tarjeta;
- banner rojo si alguno lleva más de 5 minutos;
- botón "Activar sonido" mientras el navegador bloquee el audio.

Archivos: `src/hooks/useNotifications.ts`, `src/components/pos/WebOrdersPanel.tsx`, `src/lib/webOrders.ts`.
No toques el backend (Claude cancela solo a los 15 min en C2).

**Listo cuando:** `src/__tests__/webOrders.test.ts` cubre el contador y el banner.

### X1 · Aviso de privacidad, términos y aceptación

**Por qué:** se piden nombre, teléfono, correo, dirección y GPS sin aviso de privacidad (LFPDPPP) ni términos.

**Haz:**
1. Páginas `/privacidad` y `/terminos` en `apps/client/src/app`, enlazadas en el pie de
   `src/components/MarketplaceHomeV2.tsx` y en `src/components/account/AccountUi.tsx`.
2. Aviso de privacidad con: responsable, datos que se recaban (nombre, teléfono, correo, dirección, ubicación GPS),
   finalidades, transferencias a comercios y repartidores, derechos ARCO y contacto. Usa marcadores
   `[RESPONSABLE]`, `[DOMICILIO]`, `[CORREO ARCO]`, `[FECHA DE ÚLTIMA ACTUALIZACIÓN]`.
3. Términos con apartados para cliente, comercio y repartidor independiente (relación de prestación de servicio,
   no laboral), también con marcadores donde falte un dato.
4. Casilla obligatoria "Acepto el aviso de privacidad y los términos" en
   `src/components/account/BuyerSignup.tsx`, `src/components/account/CourierSignup.tsx` y en el primer inicio de
   `apps/delivery/src/components/delivery/screens/CourierAuthScreen.tsx`.
5. Backend: `POST /api/marketplace/identity/register` exige la aceptación y guarda `termsAcceptedAt`
   (columna nullable nueva en `marketplace_accounts`, migración aditiva).
6. Mientras existan marcadores sin llenar, las páginas muestran un aviso visible "Documento en revisión".

**Listo cuando:** no se puede crear cuenta sin aceptar. No inventes datos del responsable.

### X6 · Entrega sin código con motivo  (espera a C1)

**Por qué:** la caja puede marcar entregado un pedido del Mercadito sin el código del cliente, sin dejar rastro.

**Haz:** cuando el personal de tienda marca entregado un pedido `source: 'MARKETPLACE'` sin el código —
en `routes/delivery.routes.js` y en `PUT /orders/:id/status` `READY → DELIVERED` — exige `reason` de 5 a 200
caracteres y registra con `audit.record` (de `lib/audit-logger.js`) un evento nuevo
`MARKETPLACE_DELIVERED_WITHOUT_PIN` con quién, cuándo y el motivo. En el TPV pide el motivo en un modal.
Solo aplica al Mercadito; los pedidos propios de la tienda no cambian.

**Listo cuando:** pruebas de los dos caminos (sin motivo → 422; con motivo → entregado y auditado).

### X9 · Límite de intentos en Redis

**Haz:** en `routes/marketplace-identity.routes.js`, usa un store de Redis para `signupLimit`, `authLimit`,
`mailLimit` y `tokenLimit` cuando exista `REDIS_URL`, siguiendo el patrón de
`middleware/idempotency.middleware.js`; sin `REDIS_URL` o si Redis falla, memoria.

**Listo cuando:** prueba del respaldo a memoria.

### X10 · Tokens del repartidor

**Haz:**
1. Revoca los tokens Bearer del repartidor al cambiar o restablecer la contraseña: columna nullable
   `passwordChangedAt` en `marketplace_accounts`, actualizada en el cambio/restablecimiento, y rechazo en
   `lib/marketplace-courier-identity.js` de tokens con `iat` anterior.
2. Documenta en `docs/marketplace/` cómo y cuándo poner `MARKETPLACE_ACCEPT_STORE_JWT=false`, y agrega una prueba
   de ese modo en `apps/backend/scripts/marketplace-jwt.test.cjs`.

**Listo cuando:** un token emitido antes del cambio de contraseña recibe 401. Pide revisión a Claude en el PR.

### X11 · Regla de SQL crudo

**Haz:** `CLAUDE.md` dice que no hay SQL crudo, pero hoy hay 11 `$queryRaw` y 1 `$queryRawUnsafe` en
`apps/backend/src`. Lista cada uno en `docs/TENANCY.md` (archivo, propósito, cómo filtra por restaurante) y corrige
la regla de `CLAUDE.md`. No cambies lógica. (El `$queryRawUnsafe` de `marketplace-network-prisma.js` lo cambia
Claude en C6; solo documéntalo.)

**Listo cuando:** la tabla de `docs/TENANCY.md` cubre las 12 consultas.

### X7 · Cancelar desde la cuenta y WhatsApp a la tienda  (espera a C2)

**Haz:**
1. `POST /api/marketplace/v1/orders/:id/cancel` en `routes/marketplace-orders-v1.routes.js`, usando la función compartida de
   cancelación que deja C2 en `lib/marketplace-cancel.js`, con el comprador como actor (reglas y reembolso en
   `docs/marketplace/cancelacion-reembolso.md`). Solo en `PENDING_PAYMENT` o
   `PENDING_MERCHANT` y solo el dueño de la cuenta.
2. En `apps/client`: botón "Cancelar pedido" en `src/components/account/MyOrders.tsx` y
   `src/components/MarketplaceTrackingModal.tsx` en esos estados.
3. Botón "WhatsApp de la tienda" que abre `https://wa.me/<teléfono>` con el teléfono del comercio. Agrega el
   teléfono a la vista pública de `lib/marketplace-merchants-v1.js` si falta (lista blanca de campos).

**Listo cuando:** otro comprador recibe 404 y un pedido ya aceptado no se cancela.

### X8 · Sucursal por cobertura  (espera a C4)

**Haz:** en `lib/marketplace-v1-prisma.js`, reemplaza `FIRST_LOCATION` (sucursal más antigua):
- a domicilio: la sucursal activa con `hasDelivery` que cubre la dirección y está más cerca
  (usa `lib/marketplace-delivery-coverage.js`);
- para recoger: el cliente elige sucursal, validada contra el restaurante.

Con una sola sucursal, el comportamiento no cambia.

**Listo cuando:** `apps/backend/scripts/marketplace-v1-prisma.test.cjs` cubre dos sucursales.

### X13 · Botón Verificar y documentos del repartidor

**Haz:**
1. En `apps/saas/app/(dashboard)/marketplace/CourierApplicationsSection.tsx`: botón "Verificar para despacho" para
   repartidores aprobados cuyo `MarketplaceNetworkCourier` está en `PENDING_VERIFICATION`. Resuelve el `courierId`
   por `accountId` y llama `POST /api/marketplace/v1/ops/couriers/:id/approve` (ya existe).
2. **PR aparte:** carga de INE, licencia y foto de placa desde `apps/delivery`, con almacenamiento privado
   (sin URL pública) y vista solo para `SUPER_ADMIN`. Si no hay almacenamiento privado disponible, entrega solo el
   botón y dilo en el PR.

**Listo cuando:** se puede verificar a un repartidor sin SQL ni `curl`.

### X14 · Comisiones del comercio en el admin  (espera a C5)

En `apps/admin`, una pantalla de solo lectura "Comisiones del Mercadito" dentro de la sección del Mercadito que ya
existe. Llama `GET /api/marketplace/v1/merchant/commissions?period=AAAA-MM` (lo dejó C5; contrato en
`docs/marketplace/comisiones-efectivo.md`) y muestra: selector de mes (últimos 12), totales del mes (pedidos
entregados, ventas, comisión), estado (`OPEN` mes en curso, `TO_ISSUE` por emitir, `ISSUED` por pagar, `PAID` pagado
con referencia), la tabla de líneas (folio, fecha, subtotal, comisión) y el historial. Si `pendingCount > 0`, aviso
de pedidos sin cerrar. Usa los átomos de `components/warmtech` (`StatCard`, `StatusBadge`, `DataCard`) y
`lib/format.ts` para pesos; el acento con `var(--brand-primary)`. No toques el backend: ni emitir ni pagar se hace
desde el admin.

**Listo cuando:** prueba del módulo que valida la respuesta y formatea; captura en navegador con datos simulados.

### X12 · Ofertas con zona y distancia  (espera a C6)

**Haz:** la oferta de red que ve el repartidor antes de aceptar incluye nombre de la tienda, colonia de recogida y
distancias aproximadas a la recogida y a la entrega, redondeadas a 0.5 km. **Sin dirección exacta ni datos del
cliente antes de aceptar.** Muéstralo en `apps/delivery/src/components/delivery/MarketplaceOffers.tsx` en lugar de
"Ruta sin publicar". Coordina con Claude el campo nuevo de la proyección (archivo de C6).

**Listo cuando:** una prueba confirma que la oferta no expone datos del cliente.

---

## 7. Plantilla del PR

```markdown
## <ID> · <tarea>

**Qué cambió**
- …

**Archivos**
- …

**Pruebas**
- Con mocks: …
- Con PostgreSQL desechable: … (o "no aplica")
- En navegador: … (o "no aplica")
- `node scripts/test-marketplace-all.mjs`: <resultado>

**Migración**: <nombre de la carpeta> · aditiva: sí/no (o "ninguna")

**Pendiente o dudas**
- …
```

## 8. Cuándo detenerte y preguntar

- La tarea necesita cambiar un archivo de la sección 4.
- Una migración tendría que ser `NOT NULL` sin default, renombrar o borrar algo.
- Una prueba existente falla y no es por tu cambio.
- Falta un dato de negocio o legal: no lo inventes; deja marcador y pregúntalo en el PR.
