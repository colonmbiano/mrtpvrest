# Cuentas locales del TPV — 2026-09-22

## Alcance

Sin PC obligatoria: cuenta y comandos pendientes en un snapshot IndexedDB del
propio TPV. Guardar, reabrir, añadir rondas, cobrar y conservar tickets cobrados
durante una caída. El ACK persiste el alias local/servidor antes de replayear
dependencias. Se conserva el aislamiento de restaurante, sucursal y empleado.

Las rondas usan una clave persistente de deduplicación en OrderRound. El servidor
continúa calculando precios y detiene la conciliación si cambia el importe.
No se permite descartar comandos que dejarían cuentas locales huérfanas.

## Comprobación

- TPV: TypeScript y ESLint sin errores; exportación Capacitor de 41 páginas.
- TPV: 14 suites y 178 pruebas aprobadas, incluida recuperación del almacenamiento, ronda, cobro,
  remapeo de IDs, disco lleno, separación de sucursales y conflictos.
- Backend: cuatro suites de cobros/rondas, 24 pruebas aprobadas; chequeo sintáctico
  de 194 archivos JavaScript aprobado. Prisma está mockeado en estas pruebas.
- Navegador, sesión anterior: API local devuelve 503; guardar cuenta de $20,
  recargar, entrar con PIN y volver a ver la cuenta abierta funcionó.
- Sesión actual: servidor local HTTP 200, pero Browser Use bloqueó la navegación
  a su página interna de error (data URL). No se completó el E2E visual de cobro.
  No se enviaron ventas sintéticas a producción.

## Límites y operación

Requiere dispositivo vinculado y catálogo/PIN previamente almacenados. No borrar
datos ni desinstalar con operaciones pendientes. Una cuenta local pertenece al
dispositivo: no hay todavía coordinación offline entre tablets. Ante conflicto
de importe/mesa/cobro, la cola pausa conservando los registros para conciliación.

Pendientes: paridad de promociones dinámicas, edición/anulación de líneas locales,
división/movimiento/renombrado offline, cargos a empleados offline, cola durable
de impresión y verificación con hardware real. Registrar pago no equivale a
autorizar un pago bancario sin conexión. No se afirma independencia total del
backend ni E2E completo de turno/cocina/cobro/corte.

Los cambios ajenos de admin, IA, GPS, Tokki, esquema y print-claim quedan fuera
del commit de esta entrega.
