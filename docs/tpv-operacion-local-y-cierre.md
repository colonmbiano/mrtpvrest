# Operación local y cierre de turno

Fecha: 2026-11-21. Estado: propuesta técnica; operación LAN pendiente de implementar.

## Objetivo

Tomar pedidos, cobrar e imprimir sin esperar a internet. Compartir operaciones
entre los equipos del local y enviar un respaldo incremental a la nube. Al cerrar,
confirmar un corte consistente sin reenviar ni reconstruir todos los tickets.

No se ha confirmado la causa del incidente reportado: las comprobaciones públicas
posteriores respondieron, pero no se dispone de trazas de producción del cierre.

## Evidencia en el código

- `apps/tpv/src/lib/offline.ts`: `apiOrQueue` intenta primero la nube cuando está
  disponible, espera hasta 15 segundos y después encola. No es operación local
  como camino principal. El replay es secuencial y el cierre espera pendientes
  anteriores de la cola del equipo; no conoce las colas de los demás equipos.
- `apps/tpv/src/components/admin/ShiftModal.tsx`: un cierre encolado ya puede
  marcarse localmente como cerrado; eso no confirma el cierre en otras cajas.
- `apps/backend/src/routes/shifts.routes.js`: el cierre liquida repartidores,
  consume inventario a través de esa liquidación, revisa pendientes y vuelve a
  leer las ventas para calcular totales dentro de una transacción Serializable.
  Después espera los movimientos de bóveda antes de responder.
- `apps/backend/src/lib/cash-control.js`: la revisión vuelve a leer órdenes del
  período. Antes de este ajuste tanto revisión como cierre traían todas sus
  columnas escalares aunque solo requieren un subconjunto.
- Ya existe persistencia local y deduplicación por clave de operación. Esto
  sirve como base, pero no equivale a sincronización entre equipos por LAN.

## Arquitectura propuesta

Un coordinador local por sucursal, con base de datos durable, recibe operaciones
de caja, meseros y cocina por la red interna. Cada equipo persiste primero su
operación en una cola durable. El coordinador confirma su recepción y distribuye
solo los cambios a los equipos interesados. La nube recibe lotes incrementales
desde una cola persistente del coordinador, también durante el turno.

Guardar únicamente el resumen al final no basta: se conservan pedidos, partidas,
pagos, cancelaciones, descuentos, responsables y auditoría para reconstruir el
corte, reimprimir y conciliar. El cierre añade un resumen sellado; no sustituye
el historial. Impresión y generación de reportes no bloquean la venta.

Cada operación lleva `operationId`, restaurante, sucursal, `shiftId`, equipo,
secuencia local y versión esperada de la cuenta. El receptor deduplica y confirma
la operación dentro de la misma transacción que la aplica. Se envían cambios
desde la última secuencia confirmada, con lotes acotados y reintentos con espera.
La nube valida permisos y reglas; un total recibido del cliente no es suficiente
para aceptar un corte. Los identificadores de turno se preservan en cada replay.

El coordinador es la autoridad de las cuentas compartidas: dos equipos no pueden
cobrar la misma versión. Si un equipo pierde también la LAN, conserva operaciones
propias pendientes y no confirma cambios o cobros de cuentas compartidas cuyo
estado no puede verificar. Al recuperar conexión, los conflictos quedan visibles.
La PC/equipo que alojará este servicio debe definirse antes del piloto; no se
asume que Android, Windows 7 y navegadores puedan hospedar el mismo servicio.

## Cierre consistente

1. El coordinador pasa el turno de ABIERTO a CERRANDO y bloquea nuevas operaciones
   de ese turno. Cada equipo conectado entrega pendientes y confirma su última
   secuencia; los equipos desconectados quedan identificados como pendientes.
2. Con todos los equipos conciliados se validan cuentas, pagos y repartidores,
   y se sella el corte en una transacción local. Los acumulados incrementales se
   cotejan con el registro de operaciones. El resumen mantiene las reglas actuales
   de pagos mixtos, atribución de entregas e inventario.
3. Se distribuye un evento pequeño con turno, versión y estado CERRADO. Los equipos
   actualizan su estado sin descargar todos los tickets. Al reconectarse consultan
   la versión y recuperan eventos perdidos; el socket solo no garantiza entrega.
4. La nube confirma el respaldo en segundo plano. La UI distingue cierre local,
   respaldo pendiente y respaldo confirmado. No anuncia un cierre definitivo
   global mientras faltan equipos; una excepción requiere conciliación explícita.

Una venta tardía conserva el turno de origen y va a conciliación si ya fue sellado;
nunca se reasigna automáticamente al siguiente turno. Un nuevo turno necesita un
identificador distinto y una transición explícita. La cola sigue drenando tras
salir del PIN, bajo identidad de dispositivo y atribución original del empleado;
actualmente el replay depende de una sesión autenticada de empleado.

## Entregas y validación

1. Ajuste inmediato en esta rama: proyecciones de lectura para revisión y cierre,
   preservando totales y detalle de transferencias. Reduce datos innecesarios;
   no implementa LAN ni demuestra la causa del incidente. Mantiene la transacción
   y todos los controles contables actuales.
2. Instrumentar tiempos por etapa, número de tickets, tamaño de respuesta, esperas
   de DB, reintentos y longitud/antigüedad de colas. Correlacionar por sucursal y
   turno, sin registrar datos personales o secretos.
3. Implementar coordinador, almacenamiento, protocolo versionado, acumulados y
   barrera de cierre detrás de una configuración por sucursal. Piloto en un local;
   comparar cortes con el sistema vigente antes de migrar autoridad.
4. Verificar cortes de internet y LAN, reinicio durante cobro/cierre, respuesta
   perdida, operación duplicada, cobros simultáneos, equipo atrasado, cambio de
   turno, pagos mixtos, liquidación de pedidos anteriores y recuperación de respaldo.

Metas de piloto: guardar una venta local sin esperar WAN; ningún cobro duplicado;
ningún cierre confirmado con operaciones desconocidas; totales idénticos al
historial; sincronización por cambios y respuesta de cierre sin tickets completos.
Medir percentiles con carga representativa antes de fijar un SLA o afirmar una
mejora de velocidad. La prueba unitaria de 2000 tickets de esta rama verifica
importes y proyección; no es una prueba de carga de PostgreSQL ni de varios equipos.
