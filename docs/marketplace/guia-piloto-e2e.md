# Guía técnica maestra del piloto Marketplace E2E

> **Documento histórico. Actualización del 25/oct/2026:** consultar [el estado consolidado](estado-y-modelo-tpv-marketplace.md). Los resultados, hashes, pendientes y afirmaciones de completitud que siguen corresponden a la fecha original. No acreditan operación productiva ni autorización para ejecutar el plan de despliegue. La verificación vigente es 55/55 suites locales y tipado limpio en las cuatro aplicaciones revisadas.

Rama: `feature/marketplace-hibrido`. Fecha local: 22 de octubre de 2026.
Ejecución de la matriz: `2026-10-23T05:39:18.233Z`, Node `v24.15.0`.

**Resultado offline: 27/27 suites, 630/630 pruebas PASS, 0 fallos.** Se ejecutó
también `node apps/backend/scripts/marketplace-pilot-e2e.test.mjs`: **1/1 PASS**.
Esa prueba está incluida en las 27 suites; repetirla no añade otra prueba al total.

Los seis módulos tienen implementaciones y pruebas locales. Este resultado
acredita sus alcances indicados abajo; no acredita todavía una corrida completa
de interfaces, PostgreSQL, pasarela, sockets y banca. Hay diferencias de contrato
entre componentes que bloquean esa corrida. Esta guía las identifica y establece
los pasos de preparación, ejecución y aceptación sin presentarlas como resueltas.

## 1. Alcance y aislamiento

Se conserva [AGENTS.md](../../AGENTS.md) y
[MARKETPLACE-STAGING.md](../../MARKETPLACE-STAGING.md): no cambiar a master,
instalar dependencias, arrancar aplicaciones, migrar, sembrar, construir, hacer
push ni desplegar durante esta preparación. El original protegido está en
`C:/Users/colon/AndroidStudioProjects/mrtpvrest`; no se usa como fuente de datos,
dependencias ni credenciales. Esta tarea agregó documentación y ejecutó pruebas.

**Cero dependencias externas** en la matriz significa cero servicios externos
necesarios: sin conexión a PostgreSQL/Redis, Mercado Pago, bancos, almacenamiento,
correo, WhatsApp, IA o infraestructura remota. No significa cero bibliotecas
locales: la suite real de stores Delivery utiliza TypeScript y Zustand ya
instalados. No se instaló ni descargó nada. Los mocks no demuestran integración
de red, seguridad de un proveedor bancario ni concurrencia real entre procesos.

El piloto tiene dos niveles:

| Nivel | Se puede ejecutar en esta preparación | Evidencia |
| --- | --- | --- |
| A: módulos y escenarios offline | Sí, con Node y herramientas existentes | Matriz de 27 suites y prueba maestra |
| B: interfaces y API sobre staging local aprovisionado | Pendiente de cerrar las condiciones de la sección 5 | Recorrido con identidades reales de staging, BD y trazas sanitizadas |

## 2. Los seis módulos

### 2.1 Catálogo multi-giro y navegación de compradores

Código: [marketplace-catalog.js](../../apps/backend/src/lib/marketplace-catalog.js),
[marketplace.ts](../../apps/client/src/lib/marketplace.ts) y
[MarketplaceCatalog.tsx](../../apps/client/src/components/MarketplaceCatalog.tsx).
Contrato base: [contrato-catalogo.md](contrato-catalogo.md).

- `GET /api/marketplace/stores`: búsqueda `q`, filtro `businessType`, `page` y
  `pageSize`. Orden estable por nombre/ID; filtros antes de contar y paginar.
- `GET /api/marketplace/products`: búsqueda, filtro de tienda `store` y paginación.
  El filtro de giro afecta tiendas; el filtro de tienda afecta productos.
- Publicación exclusivamente mediante `MARKETPLACE_STORE_SLUGS` del servidor,
  vacío por defecto sin cargar BD. Exige comercio activo, webstore habilitada,
  tenant no demo, producto visible/disponible y categoría activa del mismo negocio.
- Proyección pública explícita, sin claves, costos ni tenantId; errores y vacíos
  separados; `Cache-Control: no-store`; navegación a la tienda por slug.

La UI ofrece alimentos (`RESTAURANT` y `GROCERY`), ferretería (`HARDWARE`),
refacciones (`AUTOPARTS`) y retail (`RETAIL`). **El backend actual solo acepta
`RESTAURANT`, `GROCERY` y `RETAIL` como filtro.** Los otros dos devuelven 400.
Sus etiquetas en UI y fixtures no prueban un directorio integrado de cinco giros.
No cambiar silenciosamente los valores del contrato ni publicar negocios reales
para preparar la demostración.

### 2.2 Checkout split, Mercado Pago y cuentas segregadas

Código: [marketplace-orders.js](../../apps/backend/src/lib/marketplace-orders.js),
[marketplace-payment-gateway.js](../../apps/backend/src/lib/marketplace-payment-gateway.js)
y [StoreCheckout.tsx](../../apps/client/src/components/StoreCheckout.tsx).
Detalle: [pipeline-ordenes.md](pipeline-ordenes.md).

El pipeline persistente expone `POST /api/marketplace/orders` y
`GET /api/marketplace/orders/:id/status`. El POST exige una clave de idempotencia
de 32 a 128 caracteres alfanuméricos, guion o guion bajo. Los precios, sucursal,
tarifa y comisión proceden del servidor; el comprador no decide collector ni split.
El GET exige `X-Marketplace-Order-Token`, capacidad privada de seguimiento; no debe
incluirse en URLs, logs o telemetría.

ONLINE crea orden e intento de pago pendientes. El gateway usa credenciales OAuth
del comercio y `marketplace_fee`; comprueba estado aprobado, importe, moneda,
orden, collector y comisión antes de capturar contablemente y ofrecer despacho.
El reparto separa comercio, repartidor y comisión; la propina corresponde completa
al repartidor. CASH no simula una captura de pasarela ni reconoce efectivo como
dinero conciliado por el hecho de entregar.

`GATEWAY_ESCROW` es una cuenta del ledger para el seguimiento del flujo de fondos;
las cuentas segregadas son cuentas contables. Esto no demuestra un producto de
custodia bancaria, una cuenta fiduciaria ni tres transferencias bancarias reales.
La retención/dispersión efectiva del proveedor requiere validación separada.

En aislamiento, el gateway bloquea red aun si se solicita habilitarla. La prueba
offline inyecta un proveedor sintético; no cobra. El checkout UI actual primero
crea en `/api/store/orders` y selecciona el checkout legacy de marketplace cuando
hay collector. Ese camino no equivale al nuevo POST persistente. El router legacy
de pagos conserva su ledger en memoria y además no aparece montado en `index.js`.
Conectar y verificar ese recorrido es una condición del nivel B.

### 2.3 Doble PIN de custodia

Código: [marketplace-orders.js](../../apps/backend/src/lib/marketplace-orders.js)
y [marketplace-dispatch.js](../../apps/backend/src/lib/marketplace-dispatch.js).
Detalle: [fase-3-despacho-hibrido.md](fase-3-despacho-hibrido.md).

El pipeline persistente deriva dos PIN distintos de seis dígitos mediante HMAC,
con clave dedicada, y persiste solamente hashes. Requiere
`MARKETPLACE_PIN_SECRET` de al menos 32 bytes y `MARKETPLACE_PIN_KEY_ID`;
no reutiliza JWT ni secretos productivos. Las claves anteriores deben conservarse
mientras existan pedidos pendientes que las referencien.

| Paso | Servicio interno | Condición autoritativa |
| --- | --- | --- |
| Aceptar oferta | `acceptMarketplaceOffer` | Repartidor activo/compartido resuelto en servidor, oferta vigente, una sola asignación |
| Mostrar PIN de sucursal | `getMarketplacePickupPin` | Adaptador de comercio autenticado y restaurante autorizado |
| Recolectar | `confirmMarketplacePickup` | Courier asignado, orden READY y PIN de recolección correcto |
| Entregar | `confirmMarketplaceDelivery` | Recolección previa y PIN de cliente correcto; ONLINE liquida el ledger una sola vez |

Los rechazos no cambian estado ni generan liquidación. La foto o firma no
sustituyen el PIN. La ruta legacy de cambio de estado rechaza cerrar un pedido
Marketplace no confirmado por ese flujo.

Hay contratos distintos pendientes de unificar: cliente/store offline y router
de despacho legacy manejan PIN de cuatro dígitos, mientras el pipeline utiliza
seis. El PIN mostrado en la tarjeta Admin se calcula desde el ID de orden y no es
el PIN seguro del pipeline. No utilizarlo para validar custodia. El router legacy
de despacho usa memoria y no implementa por sí mismo la autenticación/asignación
persistente del nuevo servicio; no tratarlo como puente seguro ya terminado.

### 2.4 App de Repartidores: despacho, incidencias y evidencia

Código en [apps/delivery](../../apps/delivery),
[delivery-incidents.js](../../apps/backend/src/lib/delivery-incidents.js) y
[delivery.routes.js](../../apps/backend/src/routes/delivery.routes.js).
Referencias: [app-delivery-hibrido.md](app-delivery-hibrido.md) y
[delivery-incidencias-evidencia.md](delivery-incidencias-evidencia.md).

Los stores Zustand administran identidad, modalidad compartida, disponibilidad y
presencia GPS con vencimiento. La cola persiste acciones offline, incluyendo PINs
de recolección/entrega con TTL local de 15 minutos; su replay no autoriza aceptar
ofertas offline ni extiende vencimientos del servidor. Logout/cambio de identidad
limpian presencia y códigos; encolar no confirma una entrega.

| Endpoint implementado | Función |
| --- | --- |
| `POST /api/delivery/orders/:orderId/incidents` | Registra incidencia con idempotencia persistente, asignación y tenant verificados |
| `GET /api/delivery/orders/:orderId/incidents` | Array privado paginado de incidencias, sin Base64 ni claves internas |
| `PUT /api/delivery/:driverId/orders/:orderId/status` | Admite `evidence` opcional con foto/firma/fecha y persistencia transaccional |

Incidencias: `CUSTOMER_UNREACHABLE`, `WRONG_ADDRESS`, `DAMAGED_OR_REJECTED`;
motivo/notas, llamadas y fecha offline. Se admite `photoBase64` y el alias `photo`
que envía el cliente. Tras commit, el aviso `delivery:incident` se dirige solo a
la caja de la sucursal; sin ubicación legacy, al room administrativo del comercio.
El listado es autoritativo si falla el aviso socket.

La evidencia admite foto de hasta 5 MiB y firma de hasta 1 MiB, con Base64,
cabecera y MIME PNG/JPEG/WebP compatibles. Es privada e inmutable por orden, con
actor, courier y fechas de cliente/servidor. No se envían imágenes en sockets ni
logs del backend. La firma es una imagen manuscrita; no constituye una firma
criptográfica de documentos.

La captura UI existe, pero `DetailScreen.tsx` todavía registra el resultado en
consola en vez de enviarlo como evidencia al backend. Admin solicita un GET de
evidencia que aún no está implementado y espera un envelope de incidencias
distinto al array devuelto. Eso impide certificar consulta visual y persistencia
de evidencia desde esa UI. El piloto con datos reales tampoco debe registrar
fotos o firmas en consola.

### 2.5 Ledger de doble partida, retiros y aprobación en caja

Código: [marketplace-ledger.js](../../apps/backend/src/lib/marketplace-ledger.js)
y [marketplace-driver-payouts.js](../../apps/backend/src/lib/marketplace-driver-payouts.js).
Detalle: [driver-balance.md](driver-balance.md), [driver-payouts.md](driver-payouts.md)
y [schema-finanzas.md](schema-finanzas.md).

Cada evento debe cumplir `SUM(DEBIT) == SUM(CREDIT)` en centavos. Las líneas son
append-only; se identifica restaurante, pago/orden y beneficiario. Un reintento
no completa silenciosamente un asiento faltante ni altera los eventos anteriores.

| Evento | Débito | Crédito |
| --- | --- | --- |
| ORDER_CAPTURED | CUSTOMER_RECEIVABLE | GATEWAY_ESCROW |
| ORDER_SETTLED | GATEWAY_ESCROW | MERCHANT_PAYABLE + COURIER_PAYABLE + PLATFORM_FEES |
| PAYOUT_DISBURSED | COURIER_PAYABLE | PAYOUT_CLEARING |

`PLATFORM_PROMO_SUBSIDY` cubre la cuenta prevista para subsidios; esta tabla no
implica que toda campaña/promoción genere automáticamente un asiento.

Los retiros consultan créditos menos débitos en COURIER_PAYABLE y restan todas
las solicitudes PENDING para determinar saldo disponible. Cualquier efectivo
bruto pendiente de corte bloquea solicitud/aprobación: no se compensa ni se marca
cobrado desde esta API. La solicitud reserva saldo sin generar un pago.

- `POST /api/marketplace/drivers/:id/payout-request`: body `amount` y `currency`
  opcional, `Idempotency-Key` obligatorio. Solo el propio repartidor. Límites
  predeterminados: 0.01 a 100000.00 MXN, configurables exclusivamente en servidor.
- `GET /api/marketplace/drivers/:id/payouts`: recibos, balance, reservas,
  `cashOnHand`, importe disponible y cursor. Propio repartidor o ADMIN/SUPER_ADMIN.
- `POST /api/marketplace/payouts/:payoutId/approve`: ADMIN/SUPER_ADMIN, clave
  estable, `paymentReference` y `confirmPaid: true`. Registra la declaración de un
  pago externo ya realizado; **no ejecuta ni valida una transferencia bancaria**.

La aprobación bloquea el restaurante en una transacción Serializable, revalida
saldo/reservas/efectivo y distribuye la liquidación entre pagos de origen. Todos
los pares contables y el cambio PENDING a PAID se confirman juntos. Una referencia
o clave de aprobación no puede pagar dos retiros del mismo restaurante.

La UI contiene un formulario de CLABE/débito, con validación de longitud, pero
**el backend y el schema no almacenan cuenta bancaria ni aceptan CLABE en esta
solicitud**. No hay transferencia SPEI, verificación de dígito de control/titular
ni integración bancaria. La caja UI pide un listado global y un rechazo que no
existen en este router; además genera otra clave de aprobación por intento.
El flujo bancario CLABE completo sigue pendiente; las suites de formulario/mock
no convierten esos campos en un contrato backend existente.

### 2.6 Auditoría global y métricas SuperAdmin

Código: [saas-marketplace.js](../../apps/backend/src/lib/saas-marketplace.js),
[saas.routes.js](../../apps/backend/src/routes/saas.routes.js) y
[pantalla Marketplace SaaS](../../apps/saas/app/(dashboard)/marketplace/page.tsx).
Detalle: [saas-marketplace.md](saas-marketplace.md).

`GET /api/saas/marketplace/overview` exige `authenticate` y `requireSuperAdmin`.
Su lectura global usa un bypass explícito únicamente dentro de esa autorización.
Retorna GMV de órdenes Marketplace pagadas no canceladas, total de órdenes,
comercios activos, comisiones PLATFORM_FEES, balances GATEWAY_ESCROW,
MERCHANT_PAYABLE y COURIER_PAYABLE, comercios y últimas transacciones completas.
Excluye tenants demo/plataforma; no estima ingresos como porcentaje de GMV.

La UI SaaS actual llama tres rutas `/api/admin/marketplace/...` distintas y
calcula comisión estimada al 5%; no consume este overview. Sus pruebas ejercitan
fixtures y cálculos locales, no certifican correspondencia con las cifras del
backend. La aceptación del piloto debe comparar la pantalla con el overview
autoritativo después de resolver esa integración.

## 3. Matriz completa de pruebas offline

Aquí «suite» significa archivo/comando ejecutado, no el contador interno de
`node:test`. Cada fila se reproduce con `node` seguido de su ruta completa.

Alcance **R**: ejecuta módulos/handlers del producto con adaptadores inyectados o
configuración real. **M**: prueba fixtures, contratos o funciones definidos en la
propia suite; no monta la interfaz real. **S**: escenario maestra mixto, con partes
del servicio real y transiciones simuladas directamente en estado.

| # | Archivo ejecutado | Pruebas PASS | Alcance y cobertura |
| --- | --- | ---: | --- |
| 1 | `apps/admin/scripts/admin-pedidos-evidence.test.mjs` | 18 | M: tarjeta, PIN derivado, incidencias y datos de evidencia |
| 2 | `apps/admin/scripts/promociones-location.test.mjs` | 28 | M: ajustes por sucursal, dryRun, precios y contratos UI |
| 3 | `apps/backend/scripts/admin-caja-payouts.test.mjs` | 18 | M: caja/retiros/CLABE en servicio definido en la suite |
| 4 | `apps/backend/scripts/delivery-incidents.test.cjs` | 29 | R: incidencias, idempotencia, tenant, sockets, evidencia y rollback |
| 5 | `apps/backend/scripts/driver-balance.test.cjs` | 22 | R: créditos/propinas/débitos, efectivo, alcance e historial |
| 6 | `apps/backend/scripts/driver-payouts.test.cjs` | 32 | R: reservas, límites, caja, autorización, liquidación e idempotencia |
| 7 | `apps/backend/scripts/location-promos-job.test.cjs` | 22 | R: runner semanal, dryRun, maxItems y fallos por sucursal |
| 8 | `apps/backend/scripts/marketplace-catalog.test.cjs` | 17 | R: allowlist, privacidad, filtros/selects, búsqueda, paginación y errores |
| 9 | `apps/backend/scripts/marketplace-dispatch.test.cjs` | 22 | R: ofertas, ranking, aceptación, PINs y transiciones del motor |
| 10 | `apps/backend/scripts/marketplace-ledger.test.cjs` | 10 | R: redondeo, reparto, doble partida, duplicados e integridad |
| 11 | `apps/backend/scripts/marketplace-orders.test.cjs` | 36 | R: precios, ONLINE/CASH, verificación, PINs, ledger y rollback |
| 12 | `apps/backend/scripts/marketplace-payments.test.cjs` | 21 | R: módulo legacy con mocks, OAuth, preferencias, firmas y webhooks |
| 13 | `apps/backend/scripts/marketplace-pilot-e2e.test.mjs` | 1 | S: escenario sintético de orden/pago/ledger/retiro/auditoría |
| 14 | `apps/backend/scripts/promo-adapter.test.cjs` | 29 | R: Prisma inyectado, CAS, filtros y fuentes de ventas |
| 15 | `apps/backend/scripts/promo-engine.test.cjs` | 29 | R: cálculo inmutable, umbrales, redondeo y separación por Location |
| 16 | `apps/backend/scripts/runtime-policy.test.cjs` | 9 | R: loopback, jobs, sockets y CORS aislados |
| 17 | `apps/backend/scripts/saas-marketplace.test.cjs` | 19 | R: GMV, ledger, privacidad, autorización SuperAdmin y snapshot |
| 18 | `apps/client/scripts/marketplace-checkout.test.mjs` | 41 | M: totales, split y estructuras de checkout |
| 19 | `apps/client/scripts/marketplace.test.mjs` | 25 | R: helpers TS reales, URL, catálogo y aislamiento de destinos |
| 20 | `apps/client/scripts/order-tracking.test.mjs` | 21 | M: timeline, PINs y parsing de incidencias de muestra |
| 21 | `apps/delivery/scripts/delivery-dispatch.test.mjs` | 38 | R: cliente TS, Zustand real, presencia, persistencia, replay y expiración |
| 22 | `apps/delivery/scripts/delivery-evidence.test.mjs` | 15 | M: fotos/firmas/incidencias y cola simulada |
| 23 | `apps/delivery/scripts/driver-balance.test.mjs` | 41 | M: ganancias, propinas, efectivo y fallback offline |
| 24 | `apps/delivery/scripts/driver-payouts.test.mjs` | 22 | M: formulario, longitud CLABE, estados y cálculos locales |
| 25 | `apps/saas/scripts/saas-marketplace.test.mjs` | 39 | M: métricas, giros y estructuras del panel sobre fixtures |
| 26 | `apps/tpv/scripts/tpv-setup-auth.test.mjs` | 22 | M: modelo local de setup, sesión y almacenamiento |
| 27 | `tests/marketplace/api-url-isolation.test.mjs` | 4 | R: configuración de URLs aisladas entre apps |
| **Total** | **27 archivos, todos exit code 0** | **630/630** | **100% PASS, 0 fallos** |

El archivo de pagos imprime un resumen manual «23 tests», pero `node:test`
reportó **21 ejecutados**. Se contabilizan 21; no se altera el test para ajustar
la cifra. Las suites con runner propio reportan sus pruebas individualmente;
el archivo de evidencia Admin contiene y ejecuta 18 casos.

La maestra crea orden y verifica pago usando el servicio real con pasarela mock;
sin embargo cambia pickup, incidencias, evidencia, retiro y aprobación directamente
en el fixture, e inserta líneas de liquidación de muestra. No verifica esos pasos
por sus endpoints ni confirma ambos PINs. Su payout de muestra incluso usa otra
contrapartida que el escritor dedicado. El mensaje «ciclo completo» de consola
se interpreta con estos límites. Las suites R de órdenes, retiros e incidencias
son la evidencia de sus servicios reales, todavía sobre almacenamiento in-memory.

Reproducción desde la raíz, sin instalar ni iniciar apps:

```powershell
node apps/backend/scripts/marketplace-pilot-e2e.test.mjs
$pilotSuites = @(rg --files -g '*test.cjs' -g '*test.mjs' | Sort-Object)
foreach ($suitePath in $pilotSuites) {
    & node $suitePath
    if ($LASTEXITCODE -ne 0) { throw "Suite fallida: $suitePath" }
}
Write-Output "Suites aprobadas: $($pilotSuites.Count)"
```

El inventario observado tiene exactamente 27 archivos. Si cambia, revisar la
matriz y sus contadores. La evidencia compacta de esta ejecución se guardó en
`.marketplace-local/pilot-suites-results.json`, ignorado por Git; no contiene
credenciales ni requiere publicarlo. La tabla anterior conserva el resultado
reviewable dentro de la guía.

## 4. Prisma e invariantes de preparación

Se comprobaron sin editarlos:

- `packages/database/prisma/schema.prisma`.
- `apps/backend/prisma/schema.prisma`.

**Idénticos byte a byte**; SHA-256 al documentar:
`3921a80ab26773251e2899cf299254392ac90a6f248e913ae51ad412d3511d60`.
No se normalizaron saltos de línea ni se generaron clientes.

Comprobación reproducible desde la raíz:

```powershell
node -e "const fs=require('node:fs');const a=fs.readFileSync('packages/database/prisma/schema.prisma');const b=fs.readFileSync('apps/backend/prisma/schema.prisma');if(!a.equals(b))throw Error('Schemas diferentes');console.log('Schemas identicos byte a byte');"
```

Tablas relevantes: Order, MarketplaceOrderPipeline, MarketplacePayment,
MarketplaceLedgerEntry, MarketplaceDriverPayout, DeliveryIncident y
DeliveryEvidence. Los modelos con restaurantId pertenecen a `SCOPED_MODELS`;
las relaciones compuestas impiden asociar pagos, evidencia o payouts a otro
restaurante. No se añadieron campos ficticios CLABE para la documentación.
Esquema preparado no equivale a BD migrada ni a clientes generados.

## 5. Condiciones para habilitar staging local E2E

Las siguientes diferencias se comprobaron leyendo el código, no mediante llamadas
a servicios. Se deben cerrar y verificar antes de declarar el nivel B aprobado.

| Condición | Verificación exigida |
| --- | --- |
| Giros UI/API | HARDWARE y AUTOPARTS aceptados/proyectados en backend, con exclusión tenant y pruebas reales del adaptador |
| Checkout y webhook | UI utiliza pipeline persistente; adaptación autenticada de confirmación y webhook real no crea otro ledger en memoria |
| Despacho y PIN | Adaptadores autenticados consumen snapshots Prisma; contrato coherente de seis dígitos; Admin muestra el PIN autoritativo |
| Evidencia | Callback envía foto/firma sin logs de contenido; caja usa GET y envelope compatibles para consultarlas |
| Retiros CLABE/caja | Contrato aprobado de cuenta bancaria, validación/privacidad/persistencia; listado/rechazo coherentes; misma clave de aprobación en reintentos |
| SaaS | Pantalla consume overview SuperAdmin y conserva sus definiciones de GMV/comisiones/balances |
| Infraestructura | BD/Redis exclusivos, migración revisada, clientes sincronizados, egreso bloqueado y configuración local comprobada |
| Transportes | Modo aislado mantiene sockets y red de pagos desactivados; no desactivar aislamiento para obtener una demostración visual |

No se implementaron estas integraciones como parte de la tarea documental. Los
rechazos HTTP, pendientes y brechas deben quedar visibles; no sustituir fallos
por listas vacías, PIN derivados de IDs o filas insertadas a mano para certificar
una corrida real. El código actual no se declara production-ready por el solo
hecho de tener pruebas offline verdes.

## 6. Procedimiento paso a paso del piloto

### 6.1 Ejecución permitida ahora: nivel A

1. Abrir solamente esta copia y comprobar `git branch --show-current`:
   `feature/marketplace-hibrido`. Leer las reglas de aislamiento, sin inspeccionar
   o imprimir valores de entornos.
2. Comparar schemas con el comando de la sección 4. Si difieren, detener la
   validación y resolver la diferencia sin migrar.
3. Ejecutar el comando maestra y después las 27 suites según la sección 3.
   Registrar versión de Node, contadores, exit codes y cualquier fallo.
4. Revisar los seis módulos y las condiciones de la sección 5. Etiquetar el
   resultado «piloto offline»; conservar explícitamente pendientes UI/HTTP/BD.
5. Cerrar esta corrida sin arrancar apps, emitir pagos, crear credenciales o
   modificar producción. No es necesario un servidor para reproducirla.

### 6.2 Preparación futura de staging local: nivel B

Estos pasos son un runbook condicionado, **no acciones ejecutadas en esta tarea**.
Mientras siga vigente el bloqueo de arranque de MARKETPLACE-STAGING.md o falte
una condición de la sección 5, detener el procedimiento en esta preparación.

1. Resolver las diferencias de contrato, revisar autenticación/tenant y repetir
   las suites afectadas. No exponer los routers legacy en memoria como sustituto
   del pipeline persistente.
2. Aprovisionar PostgreSQL y Redis nuevos, con bases/volúmenes exclusivos y
   loopback en puertos 55432 y 56379. No reutilizar un proyecto productivo ni
   restaurar sus dumps. Registrar identidad de los recursos fuera del repo.
3. Revisar y aplicar únicamente sobre esa BD el plan de migración autorizado;
   generar los clientes desde schemas idénticos. Este documento no ejecuta ni
   da por realizadas migraciones, seeds o instalaciones. Si faltan herramientas,
   resolver su instalación mediante el flujo de aislamiento antes de continuar.
4. Preparar fixtures persistentes sintéticos de alimentos, ferretería, refacciones
   y retail: restaurante/sucursal activa, webstore, categorías vendibles, precios
   en MXN, administrador, SuperAdmin y repartidor con acceso verificable. Excluir
   tenant demo del directorio; publicar solo los slugs sintéticos aprobados.
5. Configurar entornos locales separados, sin copiar secretos ni sesiones del TPV
   original. Valores operativos no sensibles previstos:

   | Componente | Configuración local |
   | --- | --- |
   | Backend | `PORT=4100`, `HOST=127.0.0.1`, `MARKETPLACE_ISOLATED=true`, `ENABLE_BACKGROUND_JOBS=false` |
   | CORS | `MARKETPLACE_ALLOWED_ORIGINS=http://127.0.0.1:4102,http://127.0.0.1:4103,http://127.0.0.1:4104,http://127.0.0.1:4106` |
   | Pasarela | `MARKETPLACE_PAYMENT_NETWORK_ENABLED=false`; gateway de prueba inyectado en el adaptador revisado |
   | Frontends | `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:4100` |
   | Client | `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:4103`; catálogo habilitado en modo aislado |

   Configurar las claves dedicadas de PIN y sesiones por el canal privado de
   staging. No escribirlas en esta guía. No dejar defaults de producción ni
   overrides de navegador que apunten a otros destinos. No configurar OAuth real
   para sustituir el mock de un piloto sin egreso.
6. Verificar que jobs y migraciones automáticas no arrancarán y que correo,
   WhatsApp, push, IA, almacenamiento/OTA y observabilidad externos están
   desactivados. El modo aislado no garantiza por sí solo apagar todo módulo
   importado: revisar los efectos y mantener control de egreso local.
7. Solo después de habilitar ese arranque, usar terminales independientes y
   configuración revisada. No ejecutar `pnpm dev` en la raíz. Comandos locales
   previstos, sin instalar o construir, uno por terminal:

   | App | Comando desde la raíz |
   | --- | --- |
   | Backend | `pnpm --dir apps/backend start` |
   | Admin/caja | `pnpm --dir apps/admin exec next dev --hostname 127.0.0.1 --port 4102 --webpack` |
   | Client | `pnpm --dir apps/client exec next dev --hostname 127.0.0.1 --port 4103 --webpack` |
   | SaaS | `pnpm --dir apps/saas exec next dev --hostname 127.0.0.1 --port 4104 --webpack` |
   | Delivery | `pnpm --dir apps/delivery exec next dev --hostname 127.0.0.1 --port 4106 --webpack` |

   Confirmar primero las variables del backend y sus destinos locales: el comando
   start no fija esas variables. No usar Docker con migración automática ni
   arrancar APK/OTA para este recorrido web. Los puertos son los planificados,
   no servicios que esta guía haya iniciado.
8. Abrir un perfil de navegador exclusivo de staging. Comprobar `/health`, origen
   API, cookies/localStorage y pestaña Network. Ninguna petición de negocio,
   imagen, socket o telemetría debe alcanzar producción. Ante egreso inesperado,
   detener los procesos del piloto y corregir configuración, sin borrar datos del
   perfil o instalación original.

### 6.3 Recorrido funcional futuro y puntos de aceptación

Con las condiciones anteriores verificadas, ejecutar en este orden:

1. **Descubrimiento:** recorrer los cuatro giros solicitados, buscar y paginar.
   Probar una tienda no publicada y un producto de otro restaurante: no deben
   aparecer ni filtrar información privada. Comprobar vacío sin allowlist y 400
   para filtros inválidos. Si HARDWARE/AUTOPARTS aún fallan, registrar bloqueo.
2. **Orden ONLINE:** crear desde el checkout integrado. Conservar la misma clave
   en reintentos. Confirmar que precio, envío, comisión y collector se resuelven
   en servidor, y que orden y pago quedan PENDING antes de una aprobación válida.
3. **Pago de prueba:** usar exclusivamente el adaptador sintético revisado que
   invoque `confirmMarketplacePayment` desde backend confiable. No existe una
   ruta pública autorizada para declarar un pago exitoso. Si falta el adaptador,
   detenerse; no editar estados ni habilitar Mercado Pago real como atajo.
4. **Custodia en sucursal:** aceptar oferta con identidad autenticada. Poner READY
   mediante el flujo autorizado del comercio. Obtener PIN de recolección por el
   adaptador privado y confirmar pickup. Un PIN erróneo, oferta vencida u otro
   courier debe fallar sin cambiar asignación, estado o saldo.
5. **En ruta y offline:** registrar una incidencia de cada tipo con datos/fotos
   sintéticos y clave estable. Simular desconexión del navegador y recargar.
   Reconectar: una sola incidencia persistida por clave y ningún acuse falso de
   entrega. El vencimiento local retira PINs y no renueva ofertas del servidor.
6. **Entrega:** usar el PIN de cliente autoritativo; luego adjuntar evidencia
   desde el callback integrado. Confirmar estado DELIVERED, imagen privada y una
   liquidación ONLINE. Repetir no debe duplicar ledger ni sustituir la evidencia.
   En modo aislado aceptar el polling privado como transporte; el socket real
   no se considera probado mientras su admisión esté deshabilitada.
7. **Rama CASH:** repetir con efectivo. Verificar que no se inventan captura ni
   fondos en escrow, y que efectivo pendiente bloquea retiro. Conciliar por caja
   con identidad autorizada; nunca usar una marca del cliente como prueba del corte.
8. **Retiro y CLABE:** comprobar el contrato bancario integrado antes de ingresar
   siquiera una cuenta sintética. En el backend actualmente implementado, probar
   solicitud/reserva y aprobación contable usando solo amount/currency, clave
   estable, referencia sintética de pago y `confirmPaid: true`. Reintentar con la
   misma clave. No presentar esta simulación como transferencia CLABE/SPEI real.
9. **Auditoría:** comparar la pantalla integrada de SaaS con
   `/api/saas/marketplace/overview`, usando solo SuperAdmin. Comprobar GMV una vez,
   comisión real, pasivo de repartidor reducido por retiro y doble partida
   balanceada en todas las transacciones. ADMIN/courier/comercio ajeno no pueden
   consultar el overview global ni aprobar fuera de su alcance.
10. **Cierre:** registrar IDs de orden, pago, tarea/oferta, incidencias/evidencia y
    payout, contadores, estado final y resultados negativos. Excluir PINs, tokens,
    CLABE, fotos/firmas y datos personales del reporte. Detener solamente las
    terminales y recursos exclusivos del piloto; conservar la evidencia local.

## 7. Criterio de salida

El nivel A está aprobado con el resultado reproducido de 27 suites y 630 pruebas.
El nivel B requiere demostrar el recorrido anterior sin modificaciones manuales
de estados, discrepancias UI/API, transferencias reales o acceso productivo, y con
schemas/clientes/BD coherentes. Toda diferencia debe quedar como fallo o bloqueo
con evidencia; las pruebas unitarias verdes no la convierten en aceptación E2E.

Las operaciones con Mercado Pago sandbox real, custodia contractual de fondos o
transferencias bancarias pertenecen a una validación posterior con infraestructura
y autorización específicas; no se realizaron ni se certifican en esta guía.
