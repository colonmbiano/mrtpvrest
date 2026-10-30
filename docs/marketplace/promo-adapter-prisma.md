# Adaptador Prisma y API de promociones por sucursal

`apps/backend/src/lib/promo-adapter-prisma.js` implementa el contrato de
`motor-promociones.md` con inyeccion de cliente Prisma. No instancia clientes,
carga entornos ni registra jobs al importarlo. Los handlers se montan en
`locations.routes.js` usando `authenticate`, `requireTenantAccess`, `requireAdmin`.

## Persistencia local

Los schemas de `packages/database/prisma` y `apps/backend/prisma` se mantienen
identicos y agregan `LocationMenuItemPromo` (`location_menu_item_promos`):

- Clave unica `(locationId, menuItemId)` y scope explicito `restaurantId`.
- FKs compuestas a `Location.(id, restaurantId)` y `MenuItem.(id, restaurantId)`:
  la BD impide asociar una sucursal con un articulo de otro restaurante.
- `isPromo`, `promoPrice Decimal(18,2)`, `activeDays`, `promoSource`, `version` y
  fechas de auditoria. Los indices cubren ambas FKs y la lectura por restaurante.
- Relaciones inversas y claves compuestas en Location/MenuItem, mas registro
  de `LocationMenuItemPromo` en el tenant guard; no se usa bypass.

Location incorpora `locationPromoEnabled`, `autoPromoActiveDays` y
`autoPromoVersion`. Umbral, descuento y limite reutilizan sus campos existentes.
El flag nuevo es distinto de `autoPromoEnabled`, que habilita el job legacy de
alcance global. Guardar reglas por esta API desactiva ese flag legacy en la
sucursal y configura solo `locationPromoEnabled`. No se modifica el job.

**No se ejecutaron migraciones, db push ni generacion del cliente Prisma.** Para
usar estos modelos en una BD se requiere desplegar el esquema y regenerar el
cliente mediante el flujo de staging autorizado. Antes de eso, una incompatibilidad
de tablas/cliente produce 503; no existe fallback a memoria ni a escrituras globales.

## Adaptador

```js
const { createPrismaPromoAdapter } = require('./promo-adapter-prisma');
const adapter = createPrismaPromoAdapter({ prismaClient, restaurantId });
```

`restaurantId` se obtiene del contexto autorizado, no de las recomendaciones.
Ambos metodos exigen una sucursal activa de ese restaurante:

- `getLocationItems({ locationId, menuItemIds })` lee articulos disponibles de
  categorias activas del mismo restaurante, con precio regular positivo. Une
  los overrides de esa ubicacion; si no existen, devuelve version 0 y estado
  no promocional. La lectura no crea filas. Una promocion global se considera
  manual por procedencia desconocida y tiene prioridad sobre el override local.
- `compareAndSetLocationPromo({ where, data })` comprueba version, precio,
  flag y procedencia. Un update local usa el par de IDs y `restaurantId`.
  La primera activacion utiliza `createMany(skipDuplicates: true)` tras fallar
  el update del estado inicial; un registro manual concurrente no se sobrescribe.

Las operaciones usan transacciones `RepeatableRead`, espera maxima de 5 segundos
y timeout de 30 segundos. Si se inyecta un cliente de transaccion, participan en
esa transaccion sin abrir otra anidada. El CAS adquiere locks `FOR SHARE` sobre
sucursal y articulo mediante SQL parametrizado; vuelve a comprobar el precio y
que el articulo global no este en promocion antes de escribir solo el override.
Los cambios de configuracion, desactivaciones o promociones globales concurrentes
no quedan separados de su comprobacion por una ventana de escritura insegura.

Todos los escritores de promociones locales deben avanzar `version` y registrar
`promoSource`. Una condicion que pierde el CAS devuelve `{ count: 0 }`; un conflicto
de transaccion se propaga para devolver 409 desde HTTP, sin bucles automaticos.
Promociones manuales activas/programadas y origen desconocido siguen protegidos.

## Ventas de una sucursal

```js
const { collectLocationSalesHistory } = require('./promo-adapter-prisma');
const history = await collectLocationSalesHistory({ locationId, days: 7, prismaClient });
```

`days` admite enteros de 1 a 365, predeterminado 7. La funcion resuelve la sucursal,
deriva su restaurante y agrega `OrderItem.quantity` en BD por `menuItemId`.
El parametro adicional `restaurantId` permite fijar el scope autorizado; las rutas
siempre lo proporcionan. La funcion exportada no sustituye autenticacion.
Para pruebas se acepta `now: Date`, sin alterar el reloj global.

Se cuentan ordenes con `paymentStatus=PAID`, `status != CANCELLED`, sin importe
reembolsado, y `createdAt` en `[now - days * 24h, now)`, incluyendo el limite
inferior y excluyendo el superior. No se mezclan ventas de otras sucursales,
restaurantes, ordenes impagadas ni reembolsadas total/parcialmente. Las cantidades
son unidades enteras, no kilos ni pesos monetarios.

Se devuelven filas con `locationId`, `menuItemId`, cantidad agregada y **precio
regular actual**, incluyendo cantidad cero para articulos disponibles sin ventas.
No se usa el precio historico del renglon de orden. Se consulta un maximo de
5001 articulos para detectar exceso y devolver 413 sobre 5000; nunca se trunca
silenciosamente el analisis. No se leen datos personales de clientes ni modelos
completos. La lectura se hace en una transaccion consistente.

## PUT /api/locations/:id/promo-settings

Body completo:

```json
{
  "enabled": true,
  "thresholdUnits": 10,
  "discountPercent": 15,
  "activeDays": ["FRIDAY", "SATURDAY"],
  "maxItems": 0
}
```

`enabled`, `thresholdUnits`, `discountPercent` y `activeDays` son obligatorios;
`maxItems` es opcional, predeterminado 0 (sin limite adicional). Enteros no negativos
deben caber en Int de PostgreSQL. Descuento estrictamente entre 0 y 100 y dias
canones de semana siguen el motor puro. Se rechazan claves desconocidas,
incluidos IDs/tenant/version, y coerciones de strings a booleanos/numeros.

Devuelve la configuracion publica con `locationId`, `enabled`, `thresholdUnits`,
`discountPercent`, `activeDays`, `maxItems` y `version`. Se incrementa la version
en una transaccion y solo se actualiza la sucursal del restaurante autorizado.

## POST /api/locations/:id/run-promo-engine

Body `{ "dryRun": true }` o `{ "dryRun": false }`; ausente/null equivale a
`dryRun: true`. Cualquier otro campo o booleano expresado como string es 400.
No se aceptan recomendaciones/precios del navegador: se calculan desde ventas
y configuracion persistida del dueno.

- Simulacion: devuelve `dryRun: true`, `locationId`, version, recomendaciones,
  `planned` y `skipped`. `planned` es una prevision, nunca un acuse de escritura.
  Se leen snapshots y se ejecutan los guardas del motor con un CAS de simulacion
  que no llama al escritor Prisma. No se crean overrides ni se cambian reglas.
- Ejecucion: requiere `locationPromoEnabled=true`. Devuelve `dryRun: false`,
  version y resumen `applied`/`skipped` del motor. Un CAS perdido queda omitido;
  un error aborta la transaccion completa y revierte escrituras previas de esa tanda.
- `maxItems > 0` elige los candidatos no manuales con menos unidades vendidas,
  desempata por ID y limita ese conjunto. Las promociones manuales protegidas
  no consumen ese limite y se muestran como omitidas.

La configuracion se mantiene bajo lock compartido durante la tanda para que un
PUT concurrente no mezcle dos reglas del dueno dentro de la misma ejecucion.
Simular estando desactivado esta permitido; ejecutar estando desactivado devuelve
409 `PROMOS_DISABLED`. El motor no retira automaticas que ya no sean recomendadas.

## Autorizacion, errores y alcance

ADMIN requiere restaurante propio, tenant real correspondiente y, si tiene una
sucursal asignada, ese mismo ID. SUPER_ADMIN puede seleccionar explicitamente el
restaurante por el contexto habitual del servidor. Se valida la sucursal activa
por restaurante en todas las lecturas/escrituras. No se confia solo en headers
de tenant ni se acepta scope en el body.

Los endpoints responden `Cache-Control: no-store`. Sin sesion: 401; rol/contexto
no autorizado: 403; sucursal inexistente/ajena/inactiva: 404; entrada invalida:
400; catalogo demasiado grande: 413; regla desactivada o conflicto transaccional:
409. Fallos internos/BD/cliente incompatibles: 503 `PROMO_UNAVAILABLE`, sin filtrar
mensajes de conexion, SQL ni credenciales. No se hacen reintentos internos.

Persistir overrides no conecta por si solo sus precios con catalogo, TPV o cobro;
esas superficies conservan sus lectores actuales. Esta tarea entrega almacenamiento,
adaptador y operaciones administrativas completos, sin modificar precios globales
para simular esa integracion.

## Verificacion offline

```powershell
node apps/backend/scripts/promo-adapter.test.cjs
node apps/backend/scripts/promo-engine.test.cjs
```

Suite del adaptador/rutas: **29/29 PASS**. Motor puro: **29/29 PASS**. El mock
Prisma evalua filtros, selects, agregacion, CAS y unicidad local, y simula rollback
de transacciones. Las rutas reales se cargan con dependencias inyectadas y se
comprueba la cadena de autenticacion/tenant/administrador sin iniciar Express.

Ambos schemas pasan validacion offline con el WASM de Prisma 7.8.0 instalado y
comparacion byte por byte. No se instancia Prisma ni se conecta una BD para probar;
los mocks no prueban locks reales de PostgreSQL ni concurrencia HTTP. No se
ejecutaron migraciones, instalaciones, builds, servidores, push ni despliegues.
