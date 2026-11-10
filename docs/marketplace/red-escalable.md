# Red de repartidores: carga acotada a lo vivo (C6)

Corte: 10 de noviembre de 2026. Hallazgo #4 de la auditoría: cada petición de la red (un repartidor pidiendo
ofertas, mandando su GPS, aceptando, recogiendo; Ops reasignando) cargaba **todo** el histórico de tareas, ofertas y
asignaciones dentro de una transacción con un bloqueo global. A las 5,000 filas la red respondía 503 para siempre, y
cada GPS hacía fila detrás de todo lo demás.

## Qué cambió (`apps/backend/src/lib/marketplace-network-prisma.js`)

| Antes | Ahora |
| --- | --- |
| Cargaba todas las tareas, ofertas y asignaciones | Solo tareas vivas (`WAITING_READY`, `OFFERING`, `ASSIGNED`, `PICKED_UP`, `REASSIGNING`), sus ofertas vigentes o aceptadas y sus asignaciones |
| 503 permanente al pasar de 5,000 filas por tabla | Límite solo para lo vivo: 2,000 tareas activas a la vez; el histórico no cuenta |
| `FOR UPDATE` sobre todas las órdenes de la red | Solo sobre las órdenes cargadas |
| El GPS pasaba por el motor y el bloqueo global | `updatePresence()`: una transacción corta que escribe solo la fila del repartidor y la liga a su asignación activa |
| `pg_advisory_xact_lock` bloqueante: las peticiones en fila ocupaban conexiones del pool | Fila FIFO en el proceso + `pg_try_advisory_xact_lock` entre instancias; esperar no ocupa conexiones. Pasados 15 s: 503 `NETWORK_BUSY` |
| Una ola de ofertas = un `INSERT` por oferta; expirar = un `UPDATE` por oferta | `createMany` por lote y un `UPDATE … WHERE id = ANY(...)` por estado |
| Cada GPS nuevo reescribía y subía de versión a todos los repartidores (la presencia se copiaba a su payload) | La presencia y "en línea" son derivados de su tabla y no se guardan en el repartidor |

Lo terminado no se mueve a otra tabla: se queda donde está y simplemente ya no se carga. Para verlo:

- **Ops** (`GET /api/marketplace/v1/ops/dispatch`): las vivas salen del motor y las terminadas de su tabla
  (`archived()`), mezcladas por id con el mismo cursor y filtros (`status`, `merchantId`, `dispatchMode`).
- **Una tarea o una oferta concreta**: las rutas que nombran una tarea (`/dispatch/tasks/:id`,
  `/couriers/tasks/:id/pickup|deliver`, …) o una oferta (`/couriers/offers/:id/accept`) la cargan aunque ya no esté
  viva, para responder igual que antes (p. ej. 409 a una oferta que ganó otro, en vez de 404).
- La vista de Ops de una tarea **viva** ya no lista sus ofertas expiradas o rechazadas; solo vigentes y aceptadas.

## Lo que se conservó a propósito

Un solo bloqueo para las decisiones del motor. Esas decisiones cruzan tareas: un repartidor solo puede tener una
asignación activa y las olas de ofertas reparten entre todos los repartidores. Con un bloqueo por tarea, dos pedidos
podrían quedar asignados al mismo repartidor al mismo tiempo. Con la carga acotada, el bloqueo dura ~50 ms por
petición (~20 decisiones por segundo por red). Si la red crece más allá de eso, el siguiente paso es partirla por
zona (un bloqueo por zona), no quitar el bloqueo.

## Base de datos

Migración `20261110060000_network_live_indexes` (solo índices, compatible hacia atrás):
`marketplace_network_tasks(status, id)`, `marketplace_network_offers(taskId, status)`,
`marketplace_network_assignments(taskId)`.

## Evidencia

- Prueba de carga en PostgreSQL desechable (`marketplace-network-load-postgres.test.cjs --disposable`, 5/5), con
  6,000 tareas entregadas, 12,000 ofertas históricas, 12 pedidos vivos y 50 repartidores:
  - la red responde y oferta los 12 vivos (antes: 503 por pasar de 5,000 filas);
  - 5 rondas en las que los 50 mandan GPS y piden ofertas **en el mismo instante** (500 llamadas): cero errores; GPS
    p95 ≈ 150 ms; ofertas p95 ≈ 2.7–2.9 s (ráfaga de 50 decisiones en fila; con sondeos repartidos en el tiempo la
    espera es la de una petición);
  - los 50 aceptan a la vez: 12 asignaciones, ningún pedido con dos repartidores ni repartidor con dos pedidos;
  - Ops pagina las 6,000 entregadas desde la tabla.
- Suite de red en PostgreSQL desechable 11/11 (aceptación concurrente, PIN, reinicio del proceso, cancelación del TPV).
- Unitarias: `marketplace-network-prisma` 18/18 (6 nuevas de C6), `dispatch` 22, `ops-dispatch-v1` 50,
  `hybrid-policy` 71, `tracking-v1` 72, `multistop` 16, `network-pin` 10, `couriers-v1` 25.
