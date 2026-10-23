# Schema de finanzas del marketplace

Modelado local de Fase 4 basado en `fase-4-finanzas-ledger.md` y en las constantes
del motor puro `apps/backend/src/lib/marketplace-ledger.js`.

Los cambios son identicos en:

- `packages/database/prisma/schema.prisma`
- `apps/backend/prisma/schema.prisma`

Solo se actualizaron los schemas y este documento. No se ejecutaron migraciones,
`db push`, generacion de cliente, consultas de BD ni integraciones de pago.
Las tablas todavia no estan aprovisionadas por este cambio.

## MarketplacePayment

Tabla `marketplace_payments`: un intento de pago de una orden de una sola tienda.
Una orden puede tener varios intentos; la unicidad no se coloca sobre `orderId`.
No sustituye al modelo existente `PaymentTransaction` ni altera sus escrituras.

| Campos | Significado |
| --- | --- |
| `id` | Clave primaria CUID; admite un identificador explicito del escritor. |
| `restaurantId`, `orderId`, `order` | Pertenencia obligatoria a una orden y su restaurante mediante FK compuesta. El tenant se deriva de `Order.restaurant.tenantId`. |
| `provider` | Nombre del proveedor; predeterminado `MERCADOPAGO`. No contiene claves de acceso. |
| `providerPaymentId` | ID externo, columna `provider_payment_id`. Nullable mientras el proveedor no lo haya asignado. |
| `providerStatus` | Estado externo para conciliacion; separado del estado interno tipado. |
| `idempotencyKey` | Clave unica, estable y emitida por el servidor para crear el intento de pago. No es el ID de una entrega del webhook. |
| `status` | Enum `MarketplacePaymentStatus`: `PENDING`, `CAPTURED`, `FAILED`, `CANCELLED`, `REFUNDED`. Predeterminado `PENDING`; no se implementan transiciones en esta tarea. |
| `amount`, `currency` | Importe bruto capturado/esperado en `Decimal(18,2)` y moneda `Char(3)`, predeterminada `MXN`. No usar `Float` para persistir dinero. |
| `capturedAt`, `refundedAt` | Momentos opcionales de captura y reembolso. |
| `createdAt`, `updatedAt` | Auditoria temporal con `Timestamptz(3)`. |
| `ledgerEntries` | Lineas contables asociadas al pago. |

La clave unica `(provider, providerPaymentId)` impide asociar un mismo pago externo
con dos intentos, incluso de tiendas distintas. PostgreSQL permite varios valores
NULL en ese indice: los intentos aun sin ID externo se distinguen mediante
`idempotencyKey`. El escritor debe rechazar IDs externos vacios y normalizar la
identidad del proveedor. No se guardan tokens OAuth ni firmas de webhook.

Se agrega `Order.marketplacePayments` y la clave unica compuesta
`Order.(id, restaurantId)` requerida por la nueva relacion. Aunque `Order.id` ya es
unico, la referencia compuesta evita vincular un pago con el restaurante equivocado.
La clave unica de pago `(id, restaurantId, orderId)` permite la misma comprobacion
para las lineas contables. Las relaciones usan `Restrict` al borrar o actualizar
sus claves: borrar una orden no debe arrastrar su historial financiero.

Indices adicionales: `(orderId, restaurantId)` para acceso/FK por orden y
`(restaurantId, status, createdAt)` para conciliacion por tienda y estado.

## MarketplaceLedgerEntry

Tabla `marketplace_ledger_entries`: **una linea** de debito o credito. Un asiento
completo contiene al menos dos lineas con el mismo `transactionId`. No se agrega
un tercer modelo de cabecera: los datos del evento se repiten en sus lineas.

| Campos | Significado |
| --- | --- |
| `id` | UUID de la linea, compatible con `entries[].id` del motor puro. |
| `paymentId`, `restaurantId`, `orderId`, `payment` | FK compuesta al mismo pago, restaurante y orden; no permite mezclar sus identidades. |
| `transactionId`, `transactionHash` | `transaction.id` y `transaction.hash` del motor; el hash SHA-256 se guarda como `Char(64)` y se repite en todas las lineas del asiento. |
| `idempotencyKey` | Clave estable del evento contable dentro de ese pago. Debe diferenciar captura, liquidacion, reembolso y cada ajuste individual. |
| `lineNumber` | Posicion estable, comenzando en 1, asignada a cada linea al persistir el asiento. |
| `eventType` | Enum `MarketplaceLedgerEventType`, alineado con `EVENT_TYPES` del motor. |
| `account` | Enum `MarketplaceLedgerAccount`, alineado con `ACCOUNT_TYPES`. |
| `beneficiaryId` | Snapshot del identificador del comercio o repartidor para las cuentas por pagar; sin datos de contacto. Nullable para cuentas sin beneficiario individual. |
| `type` | Enum `MarketplaceLedgerEntryType`: `DEBIT` o `CREDIT`. |
| `amount`, `currency` | Monto positivo de la linea en `Decimal(18,2)` y moneda `Char(3)`, predeterminada `MXN`. El signo lo representa `type`. |
| `referenceId`, `description` | Referencia externa y descripcion del evento; corresponden a los campos del mismo nombre en la transaccion del motor. |
| `metadata` | JSON opcional con campos de auditoria permitidos. No guardar payloads completos de pasarela, credenciales ni informacion personal. |
| `createdAt` | Fecha del asiento en `Timestamptz(3)`. El escritor mapea `transaction.createdAt` a todas sus lineas. No hay `updatedAt`. |

Las seis cuentas son `GATEWAY_ESCROW`, `CUSTOMER_RECEIVABLE`, `MERCHANT_PAYABLE`,
`COURIER_PAYABLE`, `PLATFORM_FEES` y `PLATFORM_PROMO_SUBSIDY`. Los eventos son
`ORDER_CAPTURED`, `ORDER_SETTLED`, `ORDER_REFUNDED`, `PAYOUT_DISBURSED` y
`MANUAL_ADJUSTMENT`. Los dos ultimos conservan compatibilidad con las constantes
existentes; este cambio no implementa dispersiones ni ajustes.

Para `MERCHANT_PAYABLE`, el escritor debe fijar el restaurante beneficiario;
para `COURIER_PAYABLE`, el identificador validado del repartidor al liquidar.
No derivarlo posteriormente de una asignacion mutable de la orden. Cada linea
sigue perteneciendo al restaurante de su pago, incluidas comisiones de plataforma.

La clave unica `(paymentId, idempotencyKey, lineNumber)` evita repetir una linea
del mismo evento. `transactionId` no es unico porque agrupa varias lineas.
Indices: `transactionId`, `(restaurantId, orderId, createdAt)` y
`(restaurantId, account, beneficiaryId, createdAt)`. El indice unico de las lineas
tambien permite localizar sus registros por `paymentId`.

## Reglas pendientes del escritor y de una futura migracion

El schema declara tipos, claves, relaciones e indices. **No garantiza por si solo
la inmutabilidad ni que la suma de debitos sea igual a la de creditos.** Antes de
habilitar persistencia o pagos se requiere:

1. Insertar todas las lineas y cambiar el estado del pago en una sola transaccion
   de BD. Exigir balance exacto por `transactionId` y moneda, al menos dos lineas
   y coherencia de pago, orden, evento, hash y clave de idempotencia en el grupo.
2. Usar claves estables por evento, por ejemplo una derivada de proveedor, ID de
   pago y `ORDER_CAPTURED`; para ajustes repetibles incluir una referencia unica
   del ajuste. Un UUID nuevo por cada reintento no resuelve la idempotencia.
   Ante conflicto verificar el asiento existente completo, no insertar solo las
   lineas que falten. El ID externo unico no basta para procesar distintos eventos
   del mismo pago ni reemplaza validacion de firma del webhook.
3. Validar importes positivos y hasta dos decimales **antes** de insertar, moneda
   ISO 4217 mayuscula igual a la del pago, `lineNumber >= 1`, hash de 64 caracteres
   hexadecimales, beneficiarios y transiciones de estado. Prisma no expresa aqui
   los CHECK ni el balance entre filas; deben revisarse en una migracion futura.
4. Aplicar permisos/controles de BD para impedir UPDATE/DELETE de lineas y
   registrar correcciones mediante asientos compensatorios nuevos. Omitir
   `updatedAt`, usar `Object.freeze` o guardar un hash no impide modificaciones en
   BD. Conservar tambien la identidad e importes originales del pago una vez capturado.
5. Antes de exponer rutas, incorporar ambos modelos al aislamiento de acceso y
   revisar `packages/database/tenant-guard.js`: esta tarea no modifica su registro
   `SCOPED_MODELS`. Resolver `restaurantId` desde identidad autorizada, aplicar
   filtros explicitos y comprobar permisos de conciliacion de plataforma aparte.
6. Escribir el adaptador de persistencia. El motor actual produce numeros JS;
   revisar limites y convertir importes a decimales exactos sin introducir calculos
   Float al persistir. El desglose de comercio, repartidor y plataforma queda
   representado por sus lineas contables, no por recalculos posteriores del plan.

No se crean cuentas de proveedor, datos productivos ni una politica nueva de
reembolsos. El ciclo y las cuentas siguen la especificacion de Fase 4.

## Verificacion local

- Ambos schemas se validaron con el validador WASM de Prisma **7.8.0** ya instalado
  en esta copia, cargado en memoria con red y subprocesos bloqueados. No se ejecuto
  el entrypoint de la CLI ni se cargo `prisma.config.ts`/archivos de entorno. No se
  modifico la instalacion de Prisma. Su CLI habitual intento usar un subproceso y
  fue bloqueada; la validacion efectiva se realizo directamente con el WASM.
- Comparacion byte por byte y SHA-256 de los dos archivos para verificar sincronizacion.
- Los tres enums del ledger se compararon con `ACCOUNT_TYPES`, `ENTRY_TYPES` y
  `EVENT_TYPES` del modulo puro; coinciden.
- `git diff --check` de los archivos de esta tarea. No se validaron restricciones
  ni comportamiento de transacciones en una BD real; no se genero una migracion.
