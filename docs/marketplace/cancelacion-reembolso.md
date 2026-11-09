# Cancelación de pedidos del Mercadito y reembolso (C1)

Corte: 9 de noviembre de 2026. Código: `apps/backend/src/lib/marketplace-cancel.js`,
`apps/backend/src/routes/orders.routes.js` (`PUT /api/orders/:id/status`) y
`apps/backend/src/lib/marketplace-settlements-prisma.js` (`reserveCancellationRefund`, `completeRefund`).

## Quién puede cancelar

Aplica solo a pedidos con `source: 'MARKETPLACE'`. El motivo (5 caracteres o más) ya es obligatorio para
cualquier cancelación.

| Estado del pedido | Pago | Caja (`CASHIER`) | Gerente, administrador, dueño, SUPER_ADMIN | Mesero, cocina, otros |
| --- | --- | --- | --- | --- |
| Por aceptar (`PENDING_MERCHANT`) | En línea o efectivo | Sí | Sí | No (403 `MARKETPLACE_CANCEL_FORBIDDEN`) |
| Aceptado o después | En efectivo / sin pagar | Sí | Sí | No (403 `MARKETPLACE_CANCEL_FORBIDDEN`) |
| Aceptado o después | Pagado en línea | No (403 `MARKETPLACE_CANCEL_REQUIRES_MANAGER`) | Sí | No |

El rol se vuelve a validar dentro de la transacción: si otra caja aceptó el pedido entre la lectura y la
cancelación, aplica la regla del estado nuevo.

## Reembolso

Todo pedido pagado en línea con Mercado Pago que se cancela se reembolsa **completo, envío incluido**
(decisión del 9/nov).

1. Dentro de la misma transacción `Serializable` que pasa la orden a `CANCELLED`, se crea la reserva del
   reembolso (`marketplace_refunds`, estado `PENDING`). Si la reserva no se puede crear (pago no capturado,
   libro inconsistente, otro reembolso en curso), la orden **no** se cancela y la caja recibe el error.
2. Después del commit se llama a Mercado Pago con una clave estable. Si responde, se asienta el reembolso en
   el libro, la orden y el pago pasan a `REFUNDED` y se escribe el evento `OrderRefunded`.
3. Si Mercado Pago falla, la orden queda cancelada y la reserva `PENDING`. La respuesta del TPV trae
   `refund.status: "PENDING"`. La recupera `POST /api/marketplace/v1/ops/finance/recover` (SUPER_ADMIN) y,
   con C2, la tarea periódica.

La clave del reembolso sale del id de la orden. Caja, la tarea de pedidos sin aceptar (C2) y la cancelación
del comprador (X7) comparten la misma reserva: una orden nunca se reembolsa dos veces. Si dos caminos
cancelan al mismo tiempo, el que pierde recibe 409 `CANCELLATION_IN_PROGRESS`.

Los pedidos pagados en línea no pasan por el candado de corte cerrado (`assertOpenPaymentPeriod`): el
dinero está en Mercado Pago, no en el cajón, y el reembolso se registra en el libro del marketplace.

El cliente recibe el aviso "fue cancelado. Te devolvemos el total, envío incluido…" en lugar del genérico.

## Respuesta de la ruta

`PUT /api/orders/:id/status` con `{ status: 'CANCELLED', reason }` devuelve la orden y, si hubo reembolso,
`refund: { status: 'POSTED' | 'PENDING', amountCents, refundId, errorCode? }`.

## Evidencia

- `apps/backend/scripts/marketplace-cancel.test.cjs`: reglas por rol y estado, delegación y errores.
- `apps/backend/scripts/marketplace-settlements-prisma.test.cjs`: reserva en la TX de quien cancela, reserva
  compartida entre caminos, recuperación tras caída de la pasarela.
- `apps/backend/__tests__/orders.marketplace-cancel.test.js`: la ruta completa con supertest.
- `apps/backend/scripts/marketplace-settlements-postgres.test.cjs --disposable`: PostgreSQL 16 desechable con
  el guard en ENFORCE, 9/9 escenarios (incluye la cancelación y la reversión si la reserva falla).
- Pendiente: prueba con cuenta sandbox real de Mercado Pago y aceptación en navegador desde el TPV.
