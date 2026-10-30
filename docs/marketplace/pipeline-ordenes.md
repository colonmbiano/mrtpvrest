# Pipeline de ordenes, ledger y despacho marketplace

Implementacion local en `feature/marketplace-hibrido`. No se aplico el esquema,
genero cliente Prisma, conecto una BD/pasarela, arranco una app ni desplego codigo.

## Limites de los componentes

`apps/backend/src/lib/marketplace-orders.js` exporta las funciones solicitadas
`createMarketplaceOrder` y `confirmMarketplacePayment`, ademas de una fabrica
`createMarketplaceOrdersService` para inyectar Prisma, reloj, claves de PIN y
pasarela. Los imports no cargan el paquete de BD ni realizan llamadas externas.

`POST /api/marketplace/orders` y `GET /api/marketplace/orders/:id/status` se
incorporan al router publico existente. El catalogo conserva sus reglas y rutas.
No hay endpoint publico para declarar pagado un pedido, obtener el PIN de pickup
o hacerse pasar por un repartidor.

La confirmacion es un servicio interno para un llamador backend confiable; aun
asi consulta el pago al proveedor y verifica identidad, estado aprobado, orden,
collector, moneda, monto y comision. El webhook legacy de
`marketplace-payments.routes.js` y el router legacy de despacho conservan sus
almacenes en memoria: **no llaman este pipeline ni leen sus snapshots Prisma**.
Sus contratos HTTP no se sustituyeron en esta tarea. Para consumir el flujo
persistente, sus adaptadores deben invocar los servicios internos aqui descritos,
resolviendo previamente la identidad autenticada del comercio o repartidor.
Estas pruebas no demuestran una integracion movil/webhook extremo a extremo.

## Creacion y precios

Firma publica del modulo:

```js
createMarketplaceOrder({
  storeSlug, restaurantId, items, deliveryAddress, customer,
  paymentMethod, deliveryFee, tip, prismaClient, idempotencyKey,
});
```

`restaurantId` es opcional: se resuelve desde el slug publicado y, si se recibe,
debe coincidir exactamente. La allowlist `MARKETPLACE_STORE_SLUGS` se aplica en
el servidor; vacia impide crear pedidos sin cargar Prisma. Se exigen restaurante
activo y tenant con webstore habilitada y sin modo demo.

Solo se aceptan articulos `{menuItemId, quantity, notes?}`, de 1 a 50 lineas
distintas, cantidades enteras 1..99 y notas de hasta 300 caracteres. Se rechazan
precios enviados por el comprador, variantes, productos por peso y productos
con modificadores obligatorios: requieren un contrato de opciones mas amplio.
Los productos deben ser vendibles online y pertenecer a una categoria activa
del mismo restaurante. El precio se obtiene del catalogo global, con su ventana
horaria de promocion; este flujo no agrega overrides locales de promociones ni
promos por cantidad que el catalogo actual tampoco proyecta.

La sucursal se elige exclusivamente en el servidor: primera por ID entre las
activas del restaurante con `hasDelivery: true`. No se puede forzar una sucursal
de otra tienda desde el body. El contrato actual admite DELIVERY y MXN.

La direccion puede ser texto o `{address, lat, lng}`. Nombre, telefono y email
opcional se guardan como snapshots en Order. Se verifica apertura, pedido minimo
y tarifa autoritativa con `computeDeliveryFee`; DISTANCE y ZONES requieren GPS,
y DISTANCE tambien origen configurado. Un `deliveryFee` recibido es una cotizacion
a comparar, nunca la fuente del precio. Una tarifa diferente devuelve 409.

Todos los calculos del pipeline usan centavos enteros y un maximo operativo de
1,000,000 MXN por orden. La comision porcentual usa aritmetica BigInt con redondeo
half-up y hasta seis decimales de tasa. La comision queda acotada al subtotal.
Order conserva sus campos Float legacy, mientras el intento de pago y las lineas
del ledger usan Decimal(18,2); el snapshot financiero usa centavos JSON enteros.

## ONLINE, CASH e idempotencia

ONLINE se guarda inicialmente con pago PENDING; el enum legacy de Order usa CARD
y el pipeline conserva ONLINE. Se crea un MarketplacePayment pendiente y se llama
a `createPaymentPreference` con pasarela autenticada y split del servidor. La
llamada externa ocurre fuera de la transaccion de BD. No se crea despacho ni
captura contable hasta que el backend verifica el pago aprobado.

CASH crea el despacho inmediatamente, con pago PENDING. No llama a la pasarela,
crea un pago capturado ni utiliza GATEWAY_ESCROW. Incluso tras verificar la
entrega mantiene el pago pendiente de conciliacion de efectivo. Este contrato
no incorpora cobro de efectivo, caja ni dispersiones: no presenta una entrega
fisica como evidencia de fondos recibidos.

La ruta POST exige `Idempotency-Key` de 32..128 caracteres alfanumericos,
guion o guion bajo. Debe ser aleatoria y privada. Un mismo slug y clave devuelve
la misma orden, token y PIN de entrega. Cambiar el payload con esa clave devuelve
409. El modulo puede generar una clave si un llamador interno no la proporciona;
un llamador que necesite reintentos debe conservar su propia clave.

La preferencia usa una clave estable por orden. Un timeout conserva la orden y
su intento pendientes, y devuelve 503 con `recovery.orderId/trackingToken`.
Repetir la solicitud con la misma clave retoma la preferencia. No hay reintentos
automaticos ni se mantiene un lock de BD durante la llamada externa. La clave
se envia al proveedor; la deduplicacion externa depende de su contrato, no de un
mock ni de una transaccion local. Preferencias de una orden conservan la misma
referencia externa y solo un pago puede capturar esa orden.

## Captura, liquidacion y persistencia

`confirmMarketplacePayment({orderId, paymentId, prismaClient})` no acepta un
estado o monto del cliente. Carga la orden persistida y consulta el pago usando
las credenciales OAuth del comercio. Tras verificarlo, bloquea la Order por
ID/restaurante y comprueba nuevamente el snapshot financiero.

Una transaccion Serializable actualiza Order y MarketplacePayment, persiste el
asiento ORDER_CAPTURED y crea el snapshot de despacho mediante `createOffer`.
Si una escritura falla, todo ese bloque revierte. Unicidad por proveedor/pago y
por evento/linea impide reutilizar un pago externo o duplicar lineas contables.
Un reintento valido verifica el asiento original completo y conserva la oferta.
Un asiento incompleto o desaparecido produce error de integridad; no se repara
silenciosamente. Conflictos de BD se propagan sin bucles de reintento.

`recordLedgerTransaction` se agrega a marketplace-ledger. Verifica montos
positivos con precision de centavos, moneda, identidad de pago/orden/restaurante,
hash del asiento y suma exacta DEBIT == CREDIT. Inserta todas las lineas juntas,
sin `skipDuplicates`, UPDATE ni DELETE de lineas. Las correcciones financieras
requieren otro evento, no editar el historial. Los permisos y CHECK/controles de
inmutabilidad de una BD real siguen siendo responsabilidad del aprovisionamiento.

La captura usa CUSTOMER_RECEIVABLE (debito) y GATEWAY_ESCROW (credito).
ORDER_SETTLED se registra solamente al verificar entrega ONLINE: debita escrow
y acredita al comercio, courier y plataforma, omitiendo cuentas de monto cero.
El restaurante y el courier beneficiarios quedan fijados en sus respectivas
lineas. El courier recibe 100% del envio mas la propina segun el snapshot.
La contabilidad no ejecuta transferencias de dinero a beneficiarios.

## PINs y transiciones de despacho

Se agrega `createOffer` al motor marketplace-dispatch. Produce una oferta de red
SHARED no asignada, con expiracion de 30 segundos, y una tarea OFFERING; no cambia
Order a ON_THE_WAY. En este pipeline se utiliza la red compartida; no se agrega
un selector de afiliaciones propias ni se cambia la evaluacion legacy de fallback.

Funciones internas persistentes adicionales:

- `getMarketplacePickupPin({orderId, restaurantId, prismaClient})`: solo para
  adaptadores backend de comercios autenticados; restaurantId debe resolverse
  desde esa identidad, no aceptar el del navegador como autorizacion.
- `acceptMarketplaceOffer({orderId, offerId, courier, prismaClient})`: exige
  identidad de courier activa y compartida resuelta por el backend. Bloqueo de
  Order, oferta vigente y estado OFFERING admiten una sola asignacion.
- `confirmMarketplacePickup({orderId, courier, pickupPin, prismaClient})`: solo el
  courier asignado, PIN correcto y Order READY pueden moverla a ON_THE_WAY.
- `confirmMarketplaceDelivery({orderId, courier, deliveryPin, prismaClient})`:
  solo tras pickup y PIN correcto marca DELIVERED y liquida ONLINE. Repetir una
  entrega ya asentada no crea otro evento financiero.
- `refreshMarketplaceOffer({orderId, restaurantId, prismaClient})`: renueva una
  oferta expirada sin asignacion, conserva task/PINs y cambia el offerId. Una
  oferta antigua no puede aceptar la renovada. No se agrega ningun job de renovacion.

`courier` tiene `{id,isActive,isShared}` y constituye una identidad **confiable
del adaptador servidor**. Ninguna ruta nueva recibe ese objeto desde un body.
Estos servicios no realizan onboarding ni autenticacion de repartidores.

Los PINs son seis digitos distintos por finalidad, derivados con HMAC y una
clave dedicada. Solo hashes SHA-256 se persisten en pipeline/despacho. El PIN de
pickup nunca aparece en respuestas publicas, preferencias ni ledger. Se necesita
`MARKETPLACE_PIN_SECRET` de al menos 32 bytes y `MARKETPLACE_PIN_KEY_ID` (default
v1); no hay fallback a JWT, claves de IA ni un secreto de pruebas. La fabrica
admite un keyring `pinSecrets` para mantener claves antiguas al rotar; debe
conservarse mientras haya ordenes pendientes referidas a su pinKeyId.

GET status exige `X-Marketplace-Order-Token`: capacidad privada retornada al crear
la orden, con validez de 14 dias. Solo se guarda su hash. El estado publico incluye
importes, estados, IDs de tarea/oferta y el PIN de entrega para el comprador
autorizado; no expone direccion, telefono, email, hashes, collector, asignacion
del courier ni GPS. Ambas rutas usan Cache-Control: no-store. No poner tokens o
PINs en URLs, logs ni telemetria.

## Configuracion de la pasarela

El nuevo adaptador `marketplace-payment-gateway.js` usa IntegrationConfig del
restaurante, tipo MERCADOPAGO habilitado, modo sandbox o production. Su JSON
contiene accessToken OAuth del comercio y collectorId; opcionalmente
marketplaceCommissionRate (default 0.05), marketplaceCommissionFixed (default 0)
y marketplaceNotificationUrl. Los datos comerciales se obtienen en servidor;
el body publico no admite collector ni comisiones.

La pasarela usa el endpoint fijo de Mercado Pago, timeout de 10 segundos y no
sigue redirects. Verifica HTTPS/dominio Mercado Pago del enlace de checkout y
utiliza sandbox_init_point en sandbox. Las llamadas de red requieren
MARKETPLACE_PAYMENT_NETWORK_ENABLED=true y estan bloqueadas en modo aislado,
incluso con ese flag. No se cambio ninguna variable de entorno ni credencial.

El builder legacy sin gateway sigue siendo un simulador para sus consumidores
anteriores. El nuevo pipeline siempre inyecta gateway y no utiliza sus IDs o URLs
sinteticos. La validacion legacy de firmas/webhooks no se reutiliza como prueba
de un pago aprobado: este pipeline hace consulta autoritativa.

## Esquema y evidencia

Ambos schemas Prisma se mantienen byte a byte identicos. Se agrega
MarketplaceOrderPipeline, relacionado por `(orderId,restaurantId)` con Order,
que guarda requestHash, capacidad de seguimiento hasheada/caducidad, pinKeyId,
hashes de PIN, snapshot financiero y un snapshot JSON acotado de tarea/oferta/
asignacion vigente. La fila se actualiza solo bajo el lock de su Order.
No es un historial de ofertas: solo conserva la oferta actual.

MarketplacePayment, MarketplaceLedgerEntry y MarketplaceOrderPipeline quedan
registrados en SCOPED_MODELS del tenant guard. Todas sus operaciones financieras
aplican ademas filtros o datos explicitos de restaurante/orden/pago.

Comprobaciones realizadas:

| Suite offline | Resultado real de node:test |
| --- | ---: |
| marketplace-orders.test.cjs | 36/36 |
| marketplace-ledger.test.cjs | 10/10 |
| marketplace-payments.test.cjs | 21/21 |
| marketplace-dispatch.test.cjs | 22/22 |
| marketplace-catalog.test.cjs | 17/17 |

Total: 106 pruebas. El banner manual de pagos anuncia 23; el runner realmente
ejecuta 21 y ese es el conteo utilizado aqui. Se preservan las aserciones del
catalogo; su Router falso ahora admite POST y su prueba de no importar BD sigue
ejercitando especificamente las dos rutas de catalogo.

La nueva suite usa motor, builder, ledger y servicios reales con Prisma/pasarela
en memoria; global fetch se bloquea. Verifica rollback, captura concurrente,
replay completo/incompleto, alcance de tiendas, precios, split, flujo de PINs,
liquidacion, capacidades, expiracion y renovacion. No demuestra MVCC/locks de
PostgreSQL ni efectos de una cuenta real de Mercado Pago.

Los dos schemas pasan el validador WASM de Prisma 7.8.0 ya instalado, ejecutado
directamente en memoria con imports restringidos a su WASM. No se ejecuto su CLI,
configuracion de entorno, generacion, migracion ni subprocess. El uso contra BD
requiere aplicar el esquema y generar el cliente en la fase de entorno autorizada.

Comando solicitado y ejecutado:

```text
node apps/backend/scripts/marketplace-orders.test.cjs
```
