# Balance e historial de repartidores

Implementacion: `apps/backend/src/lib/marketplace-driver-balance.js`.
Consultas de solo lectura; no crean payouts, ejecutan transferencias, registran
cortes ni cambian el estado de pagos/ordenes.

## Saldo por restaurante

`getDriverBalance({driverId, restaurantId, prismaClient, ledgerStore})` requiere
ambas identidades y un cliente Prisma inyectado para consultar el efectivo.
Sin ledgerStore utiliza MarketplaceLedgerEntry, filtrando por restaurante,
beneficiaryId del repartidor y cuenta COURIER_PAYABLE.

El saldo es la suma de CREDIT menos la suma de DEBIT. Incluye la tarifa y el
100% de la propina acreditadas al repartidor por la liquidacion de la entrega.
Los debitos de payouts ya asentados reducen el saldo; intenciones de pago aun
no contabilizadas no lo cambian. Otros debitos compensatorios de esa cuenta
tambien reducen la obligacion. Un saldo negativo se devuelve como tal.

El efectivo pendiente se calcula aparte: suma del total bruto de las ordenes
DELIVERY, DELIVERED, paymentMethod CASH, cashCollected false, asignadas al mismo
repartidor y restaurante. Incluye productos, envio y propina del total de la
orden; no resta automaticamente las ganancias ni interpreta un reembolso como
evidencia de que el repartidor devolvio efectivo. Al registrar el corte mediante
el flujo existente y marcar cashCollected, esa orden deja de contarse.

Para ordenes marketplace se utiliza la asignacion vigente del snapshot Prisma
`dispatch.task.currentAssignment.courierId`. Para otros canales se utiliza
Order.deliveryDriverId. Un valor legacy desactualizado nunca reemplaza la
asignacion del pipeline marketplace.

Respuesta de ejemplo sintetico:

```json
{
  "driverId": "d1",
  "restaurantId": "r1",
  "currency": "MXN",
  "totalCredits": 23.5,
  "totalDebits": 5,
  "balance": 18.5,
  "cashInHand": 300.3,
  "pendingCashOrders": 2,
  "totalCreditsCents": 2350,
  "totalDebitsCents": 500,
  "balanceCents": 1850,
  "cashInHandCents": 30030
}
```

Se suman centavos con BigInt y se devuelven tambien enteros seguros en los campos
Cents. No se mezclan divisas: el saldo del ledger marketplace actual es MXN y un
importe de otra moneda produce error. Los importes Decimal mantienen precision
exacta; los Float legacy solo toleran ruido de representacion binaria, no fracciones
reales de centavo. Un saldo fuera del rango de enteros seguros falla explicitamente.

El ledger se agrega en BD por tipo y moneda. Las ordenes de efectivo se leen en
paginas de 200 por ID, sin OFFSET ni limite que trunque el total. Un cliente raiz
usa una transaccion RepeatableRead con maxWait 5 s y timeout 15 s; un cliente de
transaccion se une a la transaccion del llamador.

## Ledger en memoria

ledgerStore es una dependencia opcional explicita para tests o llamadores que
ya poseen ese almacen. Debe implementar getAllTransactions(). Cada linea de
COURIER_PAYABLE debe identificar restaurante y beneficiario mediante columnas
restaurantId/beneficiaryId o metadata.restaurantId y metadata.driverId/courierId/
beneficiaryId, compatibles con createInMemoryLedgerStore.

Identidades faltantes/contradictorias, IDs de linea repetidos o importes invalidos
producen error; no se atribuye el saldo global de la cuenta a un driver arbitrario.
El efectivo sigue consultandose mediante prismaClient. El snapshot de memoria y
el de BD son fuentes independientes; no existe atomicidad distribuida entre ellos.
La ruta normal usa exclusivamente el ledger Prisma y no recurre a memoria ante
un fallo de BD.

## Historial

`getDriverDeliveryHistory({driverId, limit = 50, prismaClient, restaurantId})`
devuelve un array de entregas DELIVERED, ordenado por updatedAt descendente y
desempate por ID descendente. limit acepta enteros 1..100. restaurantId es una
extension opcional para acotar el historial; omitirlo queda reservado a llamadores
internos autorizados para consultar al mismo driver entre restaurantes.

Cada fila incluye id, restaurantId, orderNumber, status, currency, paymentMethod,
paymentStatus, total, deliveryFee, tip, cashCollected, cashPending y updatedAt ISO.
updatedAt es la fecha de actualizacion de Order, no una nueva fecha de entrega.
Se proyecta la moneda por orden: snapshot marketplace o configuracion del
restaurante en canales legacy. No se incluyen direcciones, telefonos, clientes,
PINs, hashes, GPS, datos de pasarela ni el JSON de despacho.

## Endpoints y autorizacion

- `GET /api/marketplace/drivers/:id/balance?restaurantId=r1`
- `GET /api/marketplace/drivers/:id/history?restaurantId=r1&limit=50`

Ambos usan el middleware JWT authenticate existente, cargado solamente cuando se
solicita una ruta de driver. No se vuelve privado el catalogo y consultar catalogo
no carga ese middleware ni el cliente de BD de estas rutas.

Un DELIVERY activo puede consultar solo su propio ID, incluso su propia actividad
en otro restaurante de la red compartida. ADMIN, OWNER y MANAGER pueden consultar
drivers dentro de su restaurante; tambien se admite el permiso explicito
canManageDriverCash. SUPER_ADMIN puede elegir el restaurante. Sin restaurantId en
query se utiliza el de la identidad autenticada. Las rutas siempre acotan el
historial a ese restaurante; los headers de tenant o req.restaurantId sin verificar
no amplian acceso. Se rechazan dispositivos, clientes CUSTOMER y cuentas inactivas.

La allowlist del catalogo publico no gobierna estos datos privados: una identidad
autorizada conserva acceso financiero a su restaurante aunque no este publicado.
Un driver sin movimientos devuelve saldo cero e historial vacio; no se inventan
ganancias. Las rutas responden con Cache-Control no-store, 400 ante parametros
invalidos, 401 sin autenticacion, 403 sin permisos y 503 generico ante fallos de
datos/BD. No muestran mensajes privados del proveedor ni realizan reintentos.

## Verificacion

```text
node apps/backend/scripts/driver-balance.test.cjs
node apps/backend/scripts/marketplace-orders.test.cjs
node apps/backend/scripts/marketplace-catalog.test.cjs
```

Resultados: 22/22, 36/36 y 17/17, respectivamente; total 75/75.
La suite nueva cubre saldo/propinas/payouts, efectivo pendiente, entregas compartidas,
aislamiento, precision, paginacion, autorizacion y privacidad. Reutiliza el pipeline
real para completar entregas ONLINE y CASH con Prisma/pasarela en memoria.
El mock compartido ahora admite agrupacion y filtros JSON; su comparacion de fechas
respeta el desempate por ID. Las aserciones existentes de ordenes/catalogo se conservan.

Estas pruebas no son integracion PostgreSQL ni validacion JWT contra una cuenta
real: el middleware de autenticacion se inyecta en los tests HTTP. No se modificaron
schemas, dependencias, entornos, apps de interfaz ni servicios; no se ejecutaron
migraciones, builds, servidores, conexiones, push o despliegues.
