# Cron semanal de promociones por sucursal

Implementacion: `apps/backend/src/jobs/locationPromos.job.js`.

## Uso y registro

El modulo exporta `runLocationPromosJob({ prismaClient, dryRun = false })` y
`startLocationPromosCronJob()`. Importarlo no carga Prisma, crea conexiones ni
registra temporizadores. El runner requiere un cliente raiz con transacciones
interactivas; no acepta un cliente de transaccion como sustituto.

El registro explicito programa los domingos a las **02:15 America/Mexico_City**
(`15 2 * * 0`), sin ejecucion inmediata. Devuelve el ScheduledTask de node-cron,
que permite `stop()`, `start()` y `destroy()`. Registrar dos veces devuelve la
misma tarea; tras destruirla se puede registrar otra. Una tarea detenida se
reanuda con su propio `start()`.

El metodo de registro respeta `resolveRuntimePolicy`: con jobs deshabilitados o
modo aislado devuelve `null` sin cargar cron, logger ni Prisma. La combinacion
aislado + jobs habilitados sigue siendo un error de configuracion. El runner
manual no usa variables de entorno: opera exclusivamente sobre el cliente
inyectado, incluso para pruebas offline.

No se modificaron `autoPromos.job.js`, `runtime-policy.js` ni el arranque del
backend. Este cron se registra llamando explicitamente a su metodo de inicio
en un entorno habilitado; **no queda activado automaticamente por este cambio**.
La llamada y la validacion real del scheduler quedan para un arranque autorizado.
No se iniciaron servidores, timers reales ni conexiones durante esta tarea.

Tambien se aceptan `logger` y `now` opcionales en el runner para observabilidad y
pruebas deterministas. El registrador admite `cron`, `prismaClient`, `logger` y
`env` inyectados; sin ellos usa las dependencias existentes, y carga el cliente
de base de datos solamente al llegar el primer tick.

## Flujo y aislamiento

1. Descubre sucursales con `isActive: true` y al menos una bandera habilitada:
   `locationPromoEnabled` o `autoPromoEnabled`. Lee solamente `id/restaurantId`,
   en paginas de 100 ordenadas por ID, usando `id > ultimoId`, sin OFFSET.
2. Cada sucursal usa su propia transaccion RepeatableRead, con espera maxima de
   5 segundos y duracion maxima de 30 segundos. Bloquea la identidad y actividad
   de Location con `FOR SHARE`, parametros enlazados y filtro de restaurante.
   Relee las banderas y ajustes dentro de la transaccion. Una sucursal desactivada,
   eliminada o que apago ambas reglas despues del descubrimiento se omite.
3. `collectLocationSalesHistory` recibe sucursal, restaurante y exactamente 7 dias.
   Todas las sucursales comparten un mismo instante de corte. Se mantienen los
   filtros de pedidos pagados, no cancelados y sin reembolso, catalogo vendible,
   categorias activas, ventas cero explicitas y limite de 5000 articulos del
   adaptador. La ventana es `[corte - 7 dias, corte)`.
4. `analyzeLocationSales` usa los ajustes actuales de esa sucursal:
   `autoPromoThreshold`, `autoPromoDiscount` y `autoPromoActiveDays`.
5. `autoPromoMaxItems = 0` significa sin tope; un valor positivo limita las
   recomendaciones automaticas del lote. Primero se eligen los articulos con
   menos ventas y, en empate, por ID. Las promociones manuales no consumen cupos.
6. `applyAutoPromos` usa `createPrismaPromoAdapter` ligado al restaurante y a la
   misma transaccion. Solo escribe overrides locales via CAS. Preserva promociones
   manuales/globales, cambios de precio y versiones concurrentes. Una ejecucion
   repetida con iguales valores omite los overrides como `UNCHANGED`.

El limite aplica al lote de recomendaciones, igual que en el endpoint manual;
no desactiva promociones anteriores que dejaron de ser candidatas. Tampoco
introduce caducidad ni cambia los dias configurados por el dueno.

La compatibilidad con `autoPromoEnabled` no modifica el flag ni los datos globales.
El endpoint de ajustes existente deshabilita ese flag legacy al activar la regla
local. Si se registra tambien el job legacy, este conserva su comportamiento
global anterior; este modulo no lo desactiva ni controla sus efectos.

## Simulacion, fallos y concurrencia

`dryRun: true` ejecuta lectura, analisis, tope y comprobaciones de promociones
manuales, precios e idempotencia; sustituye solamente el CAS de escritura.
No crea overrides ni incrementa versiones. `planned` indica cambios propuestos,
no garantiza que una ejecucion posterior conserve el mismo estado.

Un fallo de una sucursal revierte todas sus escrituras y permite continuar con
las siguientes. El runner devuelve `seen`, `succeeded`, `failed`, `skipped`,
`applied`, `planned`, `cutoff`, `dryRun` y `results` con resumen por sucursal.
Los conflictos CAS se cuentan como omisiones; errores de transaccion marcan esa
sucursal como fallida. No hay reintentos automaticos.

Un fallo del descubrimiento invalida la ejecucion y se propaga al llamador;
las sucursales previamente confirmadas permanecen confirmadas. El callback cron
captura ese error para evitar rechazos sin manejar. Una futura ejecucion puede
repetir el trabajo de forma idempotente.

`noOverlap: true` evita ticks simultaneos del scheduler local. Adicionalmente, el
runner rechaza otra ejecucion en curso con el mismo cliente (`PROMO_JOB_RUNNING`).
No hay un mutex distribuido entre replicas: las transacciones y CAS protegen las
escrituras por sucursal; un conflicto entre replicas puede requerir una nueva
ejecucion explicita o el siguiente tick. El catalogo, paginas y transacciones
estan acotados; el resumen conserva una entrada por sucursal procesada.

## Logs y evidencia

Eventos estructurados: `location_promos.started`, `location_finished`, `finished`,
`failed`, `registered` y `cron_failed`, todos con prefijo `location_promos.`.
Los resumenes incluyen IDs de sucursal/restaurante, conteos, estado y codigos de
error; no incluyen clientes, pedidos, historial, credenciales, mensajes de error
ni stacks. Los fallos desconocidos se registran como `PROMO_JOB_FAILED`. Un fallo
del sink de logs no revierte transacciones ni impide seguir procesando.

Verificacion reproducible, sin red y con Node instalado:

```text
node apps/backend/scripts/location-promos-job.test.cjs
node apps/backend/scripts/promo-adapter.test.cjs
node apps/backend/scripts/promo-engine.test.cjs
```

Resultado: **22/22** pruebas del job, **29/29** del adaptador y **29/29** del motor.
El mock Prisma en memoria se comparte en
`apps/backend/scripts/helpers/promo-prisma-fixture.cjs`. Se ejercitan el motor y
adaptador reales con persistencia simulada, incluyendo rollback por sucursal,
dryRun, tope, desempates, flags, aislamiento, paginacion, CAS, idempotencia,
concurrencia local y lifecycle del cron mediante scheduler falso.

Estos resultados no equivalen a integracion PostgreSQL ni a una ejecucion real de
node-cron. No se ejecutaron migraciones, generacion del cliente, builds, servicios
ni despliegues. El uso real requiere el esquema de overrides y ajustes locales
ya definido en ambos schemas y un cliente Prisma generado compatible; su
aplicacion a una base aislada sigue pendiente de la fase autorizada de entorno.
