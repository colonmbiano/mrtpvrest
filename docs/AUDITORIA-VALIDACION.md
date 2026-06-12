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
   DriverShiftRequest)~~ → **ARREGLADO**. Pendiente operativo: promover
   `TENANT_GUARD_MODE=enforce` en Railway tras revisar los warnings acumulados.

### P0/P1 — webhooks de pago (pendiente)
5. Kiosk webhooks (Stripe y MP) sin verificación de firma. Mitigante: revalidan
   el pago contra la API de la pasarela (`externalReference === orderId`), pero
   falta la firma como primera barrera.
6. Sin idempotencia por `event.id` en los 4 webhooks de pago; sin UNIQUE en
   `Invoice.externalId` / `Order.paymentProviderId`; en SaaS MP el update de
   invoice y el de subscription van fuera de transacción.
7. Cero tests de webhooks.

### P1 — TPV/Capacitor (pendiente)
8. Tokens en localStorage/sessionStorage (sin secure storage nativo).
9. `usesCleartextTraffic="true"` + `allowMixedContent: true`; el override de API
   URL en /setup acepta http:// sin validar.
10. Verificar que el backend honre `Idempotency-Key` en `PUT /:id/payment`
    (el outbox lo manda, pero los pagos no llevan clientOrderId).

### P1 — WebSockets (pendiente)
11. Sin revalidación post-handshake (empleado desactivado sigue recibiendo
    eventos hasta reconectar; REST sí revalida `isActive`).
12. Sin rate limiting en Socket.io; `join:order` / `join:location:*` no validan
    pertenencia del id (hoy mitigado por el guard del handshake).

### P1 — CI/CD y dependencias (pendiente)
13. `pnpm audit`: 17 vulnerabilidades (6 HIGH: @xmldom/xmldom x4, qs). Sin
    Dependabot/Renovate.
14. Actions sin pin a SHA; sin bloques `permissions`; E2E no es gate.

### P2 (pendiente)
- Migración `Float` → `Decimal` en ~50 campos monetarios (round2 server-side
  mitiga en los bordes; planificar como proyecto aparte con migración de datos).
- Allowlist en los 3 endpoints con `data: req.body` (banners, categories,
  suppliers — todos requieren admin, riesgo acotado).
- Firma criptográfica del bundle OTA + SSL pinning.
- Dead-letter / límite de reintentos en el outbox offline del TPV.
- Sanitizar Morgan en nivel debug (Authorization header).

## Orden de ejecución sugerido para lo pendiente

1. Webhooks: firma kiosk + idempotencia `event.id` + tx + tests (dinero).
2. `TENANT_GUARD_MODE=enforce` en Railway (tras ventana de observación de warns).
3. Capacitor: cleartext/mixed content + validación https del override.
4. Sockets: revalidación periódica + rate limit + validar joins.
5. Dependabot + pin SHA + permissions en workflows.
6. Migración Decimal (proyecto aparte).

> Nota de método: la validación fue por muestreo con agentes de lectura. Los
> archivo:línea son guía; cada fix debe re-verificar su contexto al implementarse.
