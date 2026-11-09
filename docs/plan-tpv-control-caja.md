# Control operativo del TPV — 2026-11-09

Alcance autorizado: completar las seis mejoras revisadas con Alex.

- [x] Liquidación de repartidor: efectivo contado, diferencia, motivo, receptor y turno. Corte manual y cierre general consistentes.
- [x] Protección de pagos de períodos cerrados: impedir anular/cambiar cobros históricos; motivo y auditoría para cambios permitidos.
- [x] Conciliación de transferencias y tarjetas: folio, importe, referencia, verificador y fecha; lista por turno y avisos previos al cierre.
- [x] Responsables de domicilios: asignación visible y alertas sobre pedidos sin responsable, sin impedir registrar un pedido antes de asignarlo.
- [x] Gastos: comprobante adjunto o justificación pendiente, categorías unificadas y autorización del servidor para importes mayores al límite existente.
- [x] Bitácora: motivos de cancelaciones/descuentos y trazabilidad de fondos, cortes y verificaciones.

Reglas: no inventar conteos de efectivo ni verificaciones bancarias; no modificar los cortes históricos del 7/8 de noviembre. Migraciones aditivas y compatibles. Cambios de dinero mediante PR con pruebas y E2E antes de integrar; verificar después los despliegues.

Validación prevista: regresiones de liquidación/rollback/tenant, protección de períodos cerrados, permisos de verificación y gastos; UI del conteo y conciliación; compilaciones TPV/admin y E2E del proyecto.

Implementado: 942 pruebas de backend en ejecución completa; 105 regresiones financieras tras los últimos ajustes; 5 pruebas de las pantallas de fondos y precierre. Validación SQL/rollback con PostgreSQL añadida al CI, pendiente de ejecutar junto con builds y E2E antes de integrar.
