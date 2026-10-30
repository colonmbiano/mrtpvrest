# Entrega Codex: G1–G8

Corte: 26/oct/2026. Rama `feature/marketplace-hibrido`. Implementación local del reparto de trabajo con Claude; las banderas nuevas nacen apagadas. Esta entrega acompaña al informe de seguridad y sustituye las descripciones anteriores de red/Ops sin persistencia.

## Entregado

| Tarea | Resultado | Evidencia |
| --- | --- | --- |
| G1 | Tareas, ofertas, asignaciones, repartidores, afiliaciones, comercios y presencia guardados en PostgreSQL. Transacciones, exclusión mutua y control de versión; órdenes MANUAL y pendientes excluidas | Fixtures y 11 escenarios PostgreSQL, incluidos dos aceptantes simultáneos y recuperación desde otro proceso Node |
| G2 | `Location.latitude` y `longitude` opcionales, editables en admin, con validación de pareja/rangos y alcance del comercio | 14 pruebas HTTP; tipos de admin; recuperación de tarea al completar coordenadas en PostgreSQL |
| G3 | Diez PIN incorrectos por etapa en 15 minutos bloquean con 429. Contadores separados y durables, incluso cuando la respuesta es un error | Pruebas de PIN, rollback, no exposición de hashes y reinicio de proceso |
| G4 | SaaS usa `/api/saas/marketplace/overview`, ya existente y protegido para SUPER_ADMIN; se retiran endpoints inexistentes y comisión ficticia del 5% | Pruebas del helper, permisos y tipos de SaaS |
| G5 | La pestaña de red solo se monta con `NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED=true` | Cuatro pruebas de renderizado y tipos de delivery |
| G6 | Ops usa los stores de G1 para listar, aprobar repartidores y reasignar con historial y control de versión | Fixtures de permisos y PostgreSQL con reasignación, conservación de historial y nuevas ofertas |
| G7 | Reserva durable de reembolso antes de llamar a la pasarela; conciliación contable, reintentos, recuperación y outbox con lease. MANUAL abona subtotal menos comisión más envío al comercio, cero a la red | 21 pruebas nuevas con mocks y ocho escenarios PostgreSQL con pasarela simulada |
| G8 | Informe de avisos Next/sharp/axios, confianza JWT y límites de PIN | Inspección y fuentes oficiales; dependencias y lockfile sin cambios |

## Contrato para Claude C5

`createNetworkPersistence({ prisma }).presenceStore.findForAssignment({ courierId, assignmentId, taskId, orderId, restaurantId, locationId })` devuelve la presencia solo cuando todos los identificadores coinciden, la tarea está recogida y la asignación sigue activa. Devuelve `null` en otro caso. Incluye `lat`, `lng`, `accuracy` cuando existe y `lastSeenAt`; el seguimiento conserva su filtro de antigüedad.

La sucursal usa `latitude`/`longitude` nullable. Una sucursal sin coordenadas conserva sus flujos normales; su tarea de red espera sin bloquear otros comercios y vuelve a evaluarse cuando se completan.

La asignación se refleja transaccionalmente en `MarketplaceOrderPipeline.dispatch.task.currentAssignment` y `dispatch.assignment`. Incidencias y saldo siguen leyendo esos campos: no fue necesario modificar sus ramas de red ni MANUAL. Cancelar/reembolsar la orden invalida la tarea; entregar desde caja también cierra la asignación y libera al repartidor.

Modelos añadidos: `MarketplaceNetworkTask`, `MarketplaceNetworkOffer`, `MarketplaceNetworkAssignment`, `MarketplaceNetworkCourier`, `MarketplaceNetworkMerchant`, `MarketplaceNetworkAffiliation`, `MarketplaceNetworkPresence`, `MarketplaceNetworkTrip`, `MarketplaceRefund`, `MarketplaceFinanceOutbox`. Modelos con `restaurantId` registrados en tenant-guard. El esquema queda liberado para la siguiente fase de Claude.

## Activación y límites de operación

- `MARKETPLACE_NETWORK_ENABLED=true`: conecta despacho, registro de repartidores y Ops a los adaptadores persistentes. Requiere migración y cliente Prisma regenerado en el entorno autorizado.
- `NEXT_PUBLIC_MARKETPLACE_NETWORK_ENABLED=true`: muestra la red en delivery; por sí sola no activa backend ni aprueba un repartidor.
- La sesión global de courier requiere cuenta verificada, solicitud aprobada y aprobación de Ops. Las mutaciones por cookie validan `MARKETPLACE_IDENTITY_ORIGIN`; personal usa su resolutor de permisos.
- `MARKETPLACE_FINANCE_ENABLED=true`: conecta los adaptadores financieros. `/ops/orders/:id/settle` registra obligaciones contables; `/ops/orders/:id/refund` reserva y reembolsa con clave idempotente; `/ops/finance/recover` recupera reservas pendientes, solo SUPER_ADMIN. Se conservan las barreras de red de la pasarela.
- El outbox ofrece `drainOutbox({ publish, limit })`. El consumidor debe deduplicar por `eventKey`. **Falta seleccionar e inyectar el publicador del entorno**: el router por defecto informa `publisherConfigured:false`, conserva eventos pendientes y no afirma que se entregaron. No hay worker automático activado.
- Las liquidaciones se muestran `ACCRUED`, no como transferencia bancaria realizada. No se implementa ni afirma dispersión bancaria.
- La primera versión de red serializa operaciones con un bloqueo PostgreSQL y carga hasta 5.000 filas por colección, incluido historial. Al excederlo falla de forma cerrada. Antes de aumentar volumen hay que particionar consultas/colas y definir retención, con nuevas pruebas de concurrencia.
- Expiración y nuevas ofertas se evalúan al consultar la red/Ops; no se inicia un proceso periódico adicional. El cliente debe seguir consultando para recibir ofertas.
- Multitienda sigue limitada a demostración/staging: persisten sus agregados y contadores, pero la alimentación real aún no incluye todos los datos de grupo/comercio que requiere crear un viaje. La aceptación PostgreSQL de esta entrega cubre reparto unitario.
- Las órdenes v1 siguen naciendo **MANUAL**. Activar la bandera no cambia su política. La selección de comercios/políticas y su alimentación desde checkout requieren la decisión del usuario y la integración posterior correspondiente.

## Verificación reproducible

- `node scripts/test-marketplace-all.mjs`: **61/61 suites**, **1.250 pruebas con recuento**, cinco scripts adicionales sin recuento normalizado, cero fallos. Incluye seis suites nuevas; no incluye PostgreSQL.
- Backend Jest: **86/86 suites, 693/693 pruebas**. Se usó `--forceExit` en la repetición final porque el módulo existente de impresión deja reintentos Redis abiertos después de terminar. Esto no se presenta como cierre limpio de todos los recursos del backend.
- `tsc --noEmit --incremental false`: admin, saas y delivery sin errores. Revisión React aplicada a las tres pantallas cambiadas.
- `node apps/backend/scripts/marketplace-network-postgres.test.cjs --disposable`: **11/11**. Exclusión MANUAL/pendientes, aprobación y versión estable, expiración, aceptación concurrente, reinicio real con bloqueo PIN, recogida/presencia/entrega, reasignación, cancelación, coordenadas y cierre desde TPV.
- `node apps/backend/scripts/marketplace-settlements-postgres.test.cjs --disposable`: **8/8**. Alcance comercial, reparto MANUAL, conciliación, reembolsos parciales/finales, concurrencia e idempotencia, recuperación de reserva y leases del outbox. Proveedor simulado.
- **100 migraciones** aplicadas desde cero tras incorporar la migración adicional del trabajo de Claude. La nueva `20261025100000_marketplace_network_persistence` se aplicó otra vez directamente sin error.
- Comparación con una base separada de las 99 migraciones anteriores: **sin desfase nuevo** respecto al schema. Persiste el desfase previo ajeno a esta entrega; no se afirma cero desfase total.
- Ambas copias del schema son idénticas en CRLF. SHA-256: `8fcc0576e71f783f0439466bc706ad326352d45836ceb7aaa2fbf921e039f9de`.
- Ensayos exclusivamente en PostgreSQL temporal, loopback puerto 55449. El clúster se detuvo y borró al finalizar; no se aplicaron cambios a bases reales.

Para repetir PostgreSQL hay que crear un clúster desechable con ese usuario/puerto, aplicar migraciones y generar el cliente temporal en `.marketplace-local/codex-g1/client`. Los scripts tienen destino fijo de prueba, exigen `--disposable` y no cargan `.env`.

## Dónde estamos y qué falta

**Implementado localmente y probado con mocks:** G1–G7; G8 entregado como informe. **Probado en base desechable:** persistencia de red y finanzas, con los alcances anteriores. **Aceptado en navegador:** el reparto propio documentado por Claude; la red nueva y estas pantallas no tienen aceptación nueva de navegador. **Desplegado por esta entrega:** ninguno; solo commit local, sin push.

Siguientes cierres del plan compartido: C5 GPS con el puerto ya entregado, C6 Mercado Pago sandbox con credenciales de prueba, C7 checklist del entorno y reversión. Además: conectar consumidor del outbox, aceptar red/finanzas en navegador y resolver los hallazgos del [informe G8](auditoria-seguridad-codex-2026-10-26.md) antes de certificar operación. No se actualizaron dependencias sin autorización.

Decisiones pendientes del usuario: comisión efectiva, comercios/políticas de red, regla del PIN en caja, cobertura del envío gratis, credenciales sandbox y publicación. Los cambios ajenos de Claude y su actividad de publicación se registran por separado en el tablero local; este documento no certifica su estado de producción.
