# Retiros y liquidacion de repartidores

Implementacion local: `apps/backend/src/lib/marketplace-driver-payouts.js`.
HTTP: `apps/backend/src/routes/marketplace.routes.js`. No inicia servicios ni
transferencias, y no depende del allowlist del catalogo publico.

## Saldo, efectivo y reservas

La fuente es el ledger persistido en Prisma, filtrado por `restaurantId`,
`beneficiaryId` del repartidor y `COURIER_PAYABLE`. Se reutiliza
`getDriverBalance`: CREDIT menos DEBIT, con tarifas y propinas efectivamente
asentadas. Los importes de API admiten numero o string decimal con hasta dos
decimales; los calculos usan centavos enteros/BigInt y columnas Decimal(18,2).
No se redondean silenciosamente importes de retiro con precision adicional.

`availableAmount = balance - SUM(solicitudes PENDING)`.
Las solicitudes pendientes reservan saldo sin debitar el ledger. Una solicitud
no genera un pago, y una reserva no es otra ganancia. Los limites por solicitud
son 0.01 a 100000.00 MXN por defecto, configurables solo en servidor mediante
`createDriverPayoutsService({minAmount, maxAmount})` o `payoutOptions` del router.
La configuracion se valida y no admite un maximo superior a 1000000.00 MXN.

`cashOnHand` es el efectivo bruto de pedidos DELIVERY/DELIVERED asignados al
repartidor, con metodo `CASH` o `CASH_ON_DELIVERY` y `cashCollected: false`.
No se deduce ese efectivo de ganancias ni se marca cobrado desde esta API.
Cualquier monto pendiente bloquea solicitud y aprobacion con
`409 CASH_RECONCILIATION_REQUIRED`. Solo la conciliacion real de caja mediante
el flujo existente y `cashCollected: true` permite continuar. Se revalida al
aprobar, aunque no hubiera efectivo pendiente al solicitar.

Todo se calcula por restaurante: no se compensan saldos ni efectivo de otros
comercios. La asignacion Marketplace proviene del snapshot persistido del
despacho, mientras que los canales legacy usan `deliveryDriverId`.

## Autorizacion

Los tres endpoints usan `authenticate` antes del servicio. La ruta publica del
catalogo sigue sin cargar Prisma/autenticacion al atender una allowlist vacia.
El servicio vuelve a exigir identidad humana activa, rol, restaurante autorizado,
tenant real del restaurante y repartidor activo de ese restaurante.

- Crear: solo el repartidor autenticado para su propio ID.
- Consultar: el propio repartidor, ADMIN o SUPER_ADMIN.
- Aprobar: exclusivamente ADMIN o SUPER_ADMIN. OWNER, MANAGER y el permiso
  `canManageDriverCash` no conceden esta aprobacion por si solos.

Un administrador con sucursal asignada solamente puede operar repartidores de
esa sucursal. El restaurante se obtiene de la identidad autenticada; el query
opcional `restaurantId` solamente puede cambiarlo SUPER_ADMIN. Este requiere
indicarlo si su identidad no tiene restaurante. No se otorga acceso entre tenants
para identidades compartidas. Se ignoran headers publicos de seleccion de tienda
como fuente de autoridad, y se rechazan identidades, saldos o conciliaciones
inyectados en el body.

## Contrato HTTP

Todas las respuestas tienen `Cache-Control: no-store`.

### Solicitar

`POST /api/marketplace/drivers/:id/payout-request`

Header obligatorio `Idempotency-Key`: 1 a 200 caracteres ASCII visibles sin
espacios. Body:

```json
{ "amount": "75.50", "currency": "MXN" }
```

`currency` es opcional y solo admite MXN. Se responde `201` al crear, `200` al
repetir la misma solicitud:

```json
{
  "payout": {
    "id": "payout-id",
    "restaurantId": "restaurant-id",
    "driverId": "driver-id",
    "amount": 75.5,
    "amountCents": 7550,
    "currency": "MXN",
    "status": "PENDING",
    "requestedAt": "2026-10-22T12:00:00.000Z",
    "paidAt": null,
    "paymentReference": null
  },
  "idempotent": false
}
```

La clave es unica por restaurante/repartidor, respaldada por BD. Un hash del
importe normalizado y alcance rechaza reutilizarla con otro contenido (`409`).
Los reintentos no crean otra reserva, incluso tras reiniciar el proceso. Al
repetir una solicitud ya pagada tambien se verifica su asiento original.

### Consultar

`GET /api/marketplace/drivers/:id/payouts?limit=50&cursor=<id>`

Retorna `{driverId, restaurantId, currency, balance, balanceCents, cashOnHand,
cashOnHandCents, reservedAmount, availableAmount, payouts, nextCursor}`.
`availableAmount` se limita a cero si hay saldo insuficiente para las reservas;
`balance` conserva cualquier saldo negativo real. `limit` acepta 1 a 100.
Orden: `requestedAt DESC, id DESC`; `nextCursor` permite continuar y vale null
al terminar. El cursor debe pertenecer al mismo repartidor/restaurante.
La lista excluye claves de idempotencia, hashes y datos bancarios. Las reservas
se suman sobre todas las solicitudes pendientes, no solo la pagina consultada.

### Aprobar y asentar pago confirmado

`POST /api/marketplace/payouts/:payoutId/approve`

Header obligatorio `Idempotency-Key`. Body:

```json
{ "paymentReference": "BANK-CONFIRMATION-123", "confirmPaid": true }
```

El administrador declara que el pago externo ya se realizo. La referencia es
obligatoria, de 1 a 200 caracteres ASCII sin espacios exteriores; es unica por
restaurante. Esta funcion **no envia transferencias ni verifica una referencia
contra un banco/proveedor**. Es el registro contable de un pago manual confirmado
por una identidad administrativa, que queda en `approvedBy` y `paidAt`.

Tras revalidar saldo disponible, todas las reservas y efectivo pendiente, cambia
`PENDING` a `PAID` y registra la liquidacion en una sola transaccion. Responde
`200 {payout, idempotent}` con el recibo proyectado. Una segunda confirmacion con
la misma clave/contenido verifica las lineas persistidas y devuelve el mismo
retiro; una confirmacion diferente devuelve `409`. La misma clave de aprobacion
o referencia no puede liquidar dos retiros del restaurante.

No existe expiracion automatica ni liberacion de reservas por timeout. Una
solicitud sigue pendiente si falla una aprobacion; no se elimina ni se crea otro
retiro como recuperacion. Ante conflicto transaccional, repetir la misma operacion
con su misma clave. Si se hizo un pago externo y fallo el registro, conciliar esa
misma referencia antes de operar; esta API nunca ordena otro desembolso.

## Escritura contable y concurrencia

Modelo `MarketplaceDriverPayout`, registrado en el tenant guard, con relacion a
restaurante/repartidor, solicitud, hashes, confirmacion y claves unicas.
`MarketplaceLedgerEntry.payoutId` es opcional y tiene FK compuesta con
`restaurantId` al retiro. Se conservan las FKs obligatorias de pago/orden y todas
las restricciones existentes. Ambos schemas Prisma son identicos byte a byte.

Solicitud y aprobacion usan aislamiento Serializable y bloquean la fila del
restaurante con SQL parametrizado `FOR UPDATE` antes de leer saldos/reservas.
Esto serializa solicitudes iniciales y aprobaciones del mismo comercio sin
depender de un mutex del proceso. Lecturas usan RepeatableRead. No hay llamadas
de red dentro de transacciones ni reintentos automaticos de conflictos.

La aprobacion asigna el importe a lotes de saldo por pago original, restando
debitos ya asentados. Recorre origenes por `paymentId` en paginas de 200; cada
origen exige pago CAPTURED, MXN, misma orden/restaurante y canal MARKETPLACE.
Puede producir varias transacciones contables por retiro, cada una de dos lineas:

| Cuenta | Tipo | Importe |
| --- | --- | --- |
| COURIER_PAYABLE, beneficiario repartidor | DEBIT | Porcion del retiro |
| PAYOUT_CLEARING | CREDIT | Misma porcion |

`PAYOUT_CLEARING` identifica pagos externos confirmados para su conciliacion
financiera; no aumenta comisiones ni simula otra captura de pasarela. Cada par
tiene evento `PAYOUT_DISBURSED`, hash, clave estable, numero de linea y referencia
al retiro. La suma de todas las porciones coincide con el importe solicitado.
Un fallo revierte todas las porciones y el cambio de estado. Nunca se modifican
lineas originales, capturas, pagos ni pedidos.

El escritor original `recordLedgerTransaction` sigue exigiendo el importe
completo del pago para sus eventos de orden. No se debilito para admitir retiros
parciales: estos usan su escritor dedicado, con saldo, reservas y origenes
comprobados. Al repetir una aprobacion se validan importes, cuentas, beneficiario,
claves, hash, fechas y suma completa. Asientos faltantes/corruptos fallan sin
insertar lineas para ocultar el problema. La auditoria SuperAdmin incluye las
nuevas transacciones por sus pagos originales; GMV y platformFees no cambian.

## Verificacion aislada

- `node apps/backend/scripts/driver-payouts.test.cjs`: **32/32 PASS**.
- Regresiones: balance **22/22**, ordenes **36/36**, SuperAdmin **19/19**,
  catalogo **17/17**, incidencias/evidencia **29/29**: PASS.
- Sintaxis Node y validacion WASM local de ambos schemas: PASS.

Las pruebas usan Prisma in-memory con rollback, unicidad y ejecucion serial,
inspeccion de filtros/SQL, y handlers del router con autenticacion inyectada.
Cubren concurrencia simulada, bloqueo por ambos metodos de efectivo, precision,
reservas, autorizacion, idempotencia persistente, fallos parciales, paginacion,
auditoria y el recorrido del codigo de orden ONLINE con PIN hasta el retiro.
No prueban PostgreSQL real, concurrencia entre procesos, JWT criptografico,
transporte HTTP, pagos bancarios ni integracion con una BD desplegada.

No se instalaron dependencias, conectaron servicios, iniciaron apps, ejecutaron
migraciones ni regeneraron clientes Prisma. Antes de habilitarlo en staging
aislado sera necesario revisar/aplicar la migracion y generar ambos clientes.
