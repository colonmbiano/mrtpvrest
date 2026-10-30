# Incidencias en ruta y evidencia de entrega

Implementacion local en `feature/marketplace-hibrido`. Servicio:
`apps/backend/src/lib/delivery-incidents.js`; rutas en `delivery.routes.js`.

## Contrato HTTP privado

Todas las rutas pasan por `authenticate` y `requireTenantAccess`. Ademas, el
servicio verifica identidad humana activa, rol, restaurante real y tenant de
la orden. Un repartidor solamente accede a su asignacion actual; caja, gerente,
administrador y propietario acceden a su restaurante y, si tienen sucursal
asignada, solamente a esa sucursal. SuperAdmin necesita un restaurante explicito
si su identidad no tiene uno. No se concede acceso por identificadores del body.

### Registrar incidencia

`POST /api/delivery/orders/:orderId/incidents`

```json
{
  "orderId": "order-id",
  "courierId": "driver-id",
  "incident": {
    "type": "CUSTOMER_UNREACHABLE",
    "reason": "Sin respuesta",
    "notes": "Se intento contactar al cliente",
    "callAttempts": 2,
    "timestamp": 1792670340000
  }
}
```

Tipos aceptados: `CUSTOMER_UNREACHABLE`, `WRONG_ADDRESS`,
`DAMAGED_OR_REJECTED`. `orderId` del body es opcional; si aparece, debe coincidir
con la ruta. `reason` y `notes` son opcionales, con limites de 500 y 4000 caracteres.
`callAttempts` admite enteros de 0 a 1000, con 0 por defecto.

`incident.photoBase64` es opcional. Se admite tambien `incident.photo`, usado
actualmente por la cola offline de Delivery; enviar ambos con distinto contenido
es un error. `taskId` del cliente no concede permisos ni sustituye la asignacion.
Para pedidos Marketplace, la asignacion se obtiene del snapshot persistido
`marketplacePipeline.dispatch.task.currentAssignment`, verificando orden y
restaurante del task; no del campo legacy `deliveryDriverId`.

`timestamp` admite milisegundos Unix o fecha ISO con zona horaria. Se conserva la
fecha historica de la cola offline; se rechazan fechas invalidas o mayores que
la hora del servidor mas cinco minutos. Si falta, se usa la hora del servidor.
`loggedAt` siempre corresponde al registro en servidor.

Header opcional `Idempotency-Key`: de 1 a 200 caracteres ASCII visibles sin espacios.
La clave es persistente, unica por restaurante y orden, no expira en memoria y
devuelve el mismo recibo en reintentos. Un hash SHA-256 del contenido normalizado,
incluido el actor, impide reutilizarla con otro contenido (`409`). Sin clave,
cada solicitud genera una incidencia diferente. La clave que ya envia Delivery
(`incident-<orderId>-<timestamp>`) es compatible.

Respuesta:

```json
{ "success": true, "incidentId": "incident-id", "loggedAt": "2026-10-22T12:00:00.000Z" }
```

Tras el commit se emite `delivery:incident` al room
`restaurant:<restaurantId>:location:<locationId>:admins`. Solo para ordenes legacy
sin sucursal se usa `restaurant:<restaurantId>:admins`. El evento lleva el recibo,
orden, repartidor, tipo, restaurante y sucursal; excluye fotos, notas y firmas.
Los reintentos idempotentes no vuelven a emitirlo. Socket.IO es un aviso de mejor
esfuerzo, no un outbox: una caida tras el commit puede perder la notificacion;
el registro persistente y su GET son la fuente de verdad. Un fallo de socket no
convierte una incidencia guardada en un error de sincronizacion.

### Consultar incidencias

`GET /api/delivery/orders/:orderId/incidents?limit=50&cursor=<incidentId>`

Devuelve un array ordenado por `loggedAt`, luego `id`, ascendente. `limit` acepta
1 a 100; `cursor` es el ultimo ID recibido y debe pertenecer a la misma orden y
restaurante. Para seguir, usar el ultimo ID; un array vacio termina la consulta.
Incluye tipo, motivo, notas, llamadas, actor/repartidor, fechas, `timestamp`,
`hasPhoto`, MIME y longitud de foto. Las imagenes se conservan en la auditoria;
el listado excluye el Base64, hashes y claves de idempotencia para acotar respuesta
y exposicion de datos. No se agrego una URL publica para descargar evidencia.
Se responde con `Cache-Control: no-store`.

### Entregar con evidencia

`PUT /api/delivery/:driverId/orders/:orderId/status`

Conserva `status`, `paymentMethod` y la respuesta de orden existentes. El objeto
opcional `evidence` admite `photoBase64`, `signatureBase64` y `deliveredAt`:

```json
{
  "status": "DELIVERED",
  "paymentMethod": "CASH",
  "evidence": {
    "deliveredAt": "2026-10-22T11:59:00.000Z",
    "signatureBase64": "data:image/png;base64,..."
  }
}
```

Si se envia evidencia, debe contener foto o firma y el estado debe ser
`DELIVERED`. La muestra abrevia el Base64; el servidor exige contenido valido.
`deliveredAt` sigue las mismas reglas de fecha que las incidencias y se distingue
del `recordedAt` de servidor. La evidencia se persiste en una fila inmutable por
orden, junto al actor y repartidor. Repetirla devuelve su recibo; intentar
reemplazarla devuelve `409 EVIDENCE_CONFLICT`. La respuesta anade solamente
`evidence: { id, deliveredAt, recordedAt, hasPhoto, hasSignature }`, sin imagenes.

Para ordenes legacy, estado, evidencia, historial de estado y movimiento de
efectivo pendiente se escriben en una sola transaccion. El bloqueo `FOR UPDATE`
de la orden precede a la comprobacion de asignacion; se revalida dentro de la
transaccion. Un fallo revierte todas esas escrituras. Una entrega repetida no
revierte una conciliacion posterior de caja ni crea otro ingreso. Se conserva
`TRANSFER_PENDING` como `TRANSFER` pendiente. El efectivo sigue pendiente de
corte, y no se acepta retroceder desde entrega ni cambiar ordenes canceladas.
Se mantiene el bloqueo de envio sin cotizar.

Los pedidos Marketplace deben confirmar entrega por su flujo de PIN y ledger:
esta ruta devuelve `409 PIN_CONFIRMATION_REQUIRED` si todavia no estan entregados.
Tras esa confirmacion admite adjuntar evidencia con `status: DELIVERED` y sin
`paymentMethod`; no vuelve a liquidar, cambiar pagos ni crear movimiento legacy.
La ruta exige ademas que el repartidor activo pertenezca al restaurante; no abre
acceso entre tenants para identidades compartidas. Un puente de autenticacion
para repartidores de otros restaurantes requiere un alcance separado.

## Almacenamiento y limites

Modelos nuevos `DeliveryIncident` y `DeliveryEvidence` en ambos schemas Prisma,
identicos byte a byte. Ambos incluyen `restaurantId`, estan registrados en
`SCOPED_MODELS` y referencian `Order(id, restaurantId)` por FK compuesta. Las
relaciones usan `Restrict` para no eliminar auditoria incidentalmente. Indices
por restaurante/orden y fecha soportan autorizacion y paginacion; claves unicas
respaldan idempotencia e inmutabilidad. Los identificadores de actor y repartidor
son snapshots de auditoria, sin borrado en cascada por cambios de personal.

Imagenes privadas almacenadas como data URI en columnas de texto, sin proveedor
externo: foto hasta 5 MiB, firma hasta 1 MiB decodificados. Se aceptan PNG, JPEG y
WebP, con Base64 canonico y cabecera binaria compatible con el MIME declarado;
tambien Base64 puro identificable. No se aceptan SVG, URLs ni otros MIME. Esto
valida formato/cabecera y tamanio, no ejecuta un decodificador completo de imagen.
No se cambian el limite global de JSON ni secretos. Las imagenes nunca se
incluyen en socket ni logs del servicio. La firma es una imagen de firma, no una
firma criptografica de documentos.

Errores de contrato: `400`; identidad ausente/inactiva/dispositivo: `401`;
tenant, rol o asignacion no autorizada: `403`; orden/repartidor no encontrado:
`404`; conflicto de idempotencia/evidencia/estado/PIN/envio: `409`.
Cliente Prisma sin los modelos: `503 DELIVERY_STORAGE_UNAVAILABLE`.
Errores internos devuelven un mensaje generico, sin serializar argumentos Prisma
o fotos.

## Evidencia de verificacion local

- `node apps/backend/scripts/delivery-incidents.test.cjs`: **29/29 PASS**.
- `node apps/backend/scripts/marketplace-orders.test.cjs`: **36/36 PASS**.
- `node --check` del servicio, rutas y suite: PASS.
- Ambos schemas validados con el WASM instalado de Prisma: PASS; bytes identicos.

Las pruebas usan adaptadores in-memory con rollback y ejecucion serial, inspeccion
del SQL parametrizado y mocks de Socket.IO. Se ejecutan los handlers reales del
router y el middleware de autenticacion/tenant real, con verificacion JWT y
resolucion de identidad inyectadas. No prueban PostgreSQL real, concurrencia entre
procesos, transporte HTTP/socket ni firma JWT criptografica. Incluyen tres tipos,
reinicio de servicio y reintentos concurrentes, aislamiento, paginacion, rollback,
evidencia, efectivo y preservacion del requisito de PIN.

No se conectaron servicios, iniciaron aplicaciones, generaron clientes Prisma ni
ejecutaron migraciones. Antes de habilitarlo en un entorno aislado aprovisionado,
sera necesario revisar/aplicar la migracion y regenerar los clientes. La UI actual
de Delivery recoge evidencia, pero su callback aun debe enviarla en el payload
de cambio de estado; este trabajo implementa el backend, no esa conexion de UI.
