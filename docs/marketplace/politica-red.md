# Pedidos del Mercadito a la red de repartidores (C7)

Corte: 10 de noviembre de 2026. Hallazgo #3 de la auditoría: todos los pedidos v1 nacían en política MANUAL, así
que la red de repartidores independientes nunca recibía un pedido real. Ahora el pedido toma la política que el
comercio eligió para su sucursal.

## Cómo decide

| Situación | Quién entrega |
| --- | --- |
| La red apagada (`MARKETPLACE_NETWORK_ENABLED` distinto de `true`) | Repartidores propios de la tienda, desde la caja (MANUAL) |
| La sucursal nunca abrió "Despacho" en el admin, o eligió Manual | Igual: MANUAL |
| Eligió "Solo red compartida" (`SHARED_ONLY`) | Repartidores independientes verificados de la red |
| Eligió "Solo repartidores del negocio" (`OWN_ONLY`) | Repartidores de la red afiliados a ese comercio |
| Eligió "Propios y fallback a red" (`OWN_THEN_SHARED`) | Primero sus afiliados; si nadie acepta en N segundos, la red |

Nunca se pasa a la red por inferencia: hace falta una política de red explícita y válida en la fila de la sucursal
(`marketplace_network_merchants`).

## Flujo

1. **Registro:** la primera vez que el dueño abre "Despacho" en el admin (`GET /api/marketplace/v1/merchants/me/delivery-policy`),
   si el restaurante es comercio aprobado del Mercadito, su sucursal se registra en la red con política **MANUAL**
   (nada cambia todavía). Antes la fila solo nacía con un pedido de red, y un pedido solo iba a la red si la fila
   existía: nunca pasaba.
2. **Elección:** el dueño elige la política y guarda (`PUT .../merchants/:id/delivery-policy`).
3. **Pedido:** `merchants.resolve` (`lib/marketplace-v1-prisma.js`) lee esa política; la tarea se liga a la fila de
   la red de la sucursal (ahí viven política y afiliaciones) y paga al repartidor el 100% del envío.
4. **Sin oferta antes de tiempo:** la tarea nace `WAITING_READY` y sin oferta. La red no busca repartidor mientras el
   comercio no acepta ni mientras cocina; empieza cuando la caja marca el pedido **LISTO**. (Antes nacía `OFFERING`
   con una oferta que la red nunca leía, y el comprador veía "buscando repartidor" antes de que la tienda aceptara.)
5. **Entrega:** el repartidor acepta, recoge con el PIN de recogida y entrega con el del cliente; la orden queda
   ENTREGADA y el seguimiento del cliente usa su GPS (ligado al pedido).

La caja no ofrece asignar repartidor propio a un pedido de la red (`lib/marketplace-store-delivery.js` ya separa
"entrega la tienda" de "va por la red").

## Evidencia

- PostgreSQL desechable con el guard en ENFORCE (`marketplace-v1-network-postgres.test.cjs --disposable`, 4/4): el
  dueño abre Despacho (queda MANUAL) y elige "solo red"; con la red apagada sigue MANUAL; sin oferta en
  PENDING_MERCHANT, CONFIRMED y PREPARING; al marcar LISTO, oferta de $35.00 (todo el envío) al repartidor verificado;
  PIN de recogida incorrecto rechazado; recoge, GPS ligado al pedido, entrega con PIN; orden ENTREGADA.
- Unitarias: `marketplace-order-orchestrator` 61/61 (tareas sin oferta; ligada a la fila de red; sin política =
  MANUAL), `marketplace-v1-prisma` 19/19 (política explícita, inválida, ausente o red apagada), `hybrid-policy` 71,
  red 18, dispatch 22, ops 50, tracking 72; jest backend 958/958.
