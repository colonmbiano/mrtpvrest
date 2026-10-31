# Auditoria y metricas globales de marketplace

Servicio: `apps/backend/src/lib/saas-marketplace.js`.
Endpoint: `GET /api/saas/marketplace/overview`.

## Autorizacion y alcance

La ruta ejecuta authenticate y requireSuperAdmin antes de cualquier consulta o
scope global. Rechaza tambien cuentas inactivas y dispositivos. Usa no-store
incluso en respuestas de autenticacion denegada. Despues de autorizar abre
runWithBypass exclusivamente alrededor de la lectura para que un contexto de
tenant previo no trunque las cifras de plataforma; al terminar lo restaura.
Las rutas publicas de planes y las demas protecciones SaaS se conservan.

La vista no admite parametros: filtros enviados por query producen 400; un
header de restaurante no convierte esta vista global en una vista parcial.
Sin autenticacion responde 401, sin permisos 403 y ante errores financieros/BD
responde 503 generico, sin mensajes de conexion ni resultados parciales.

El servicio getMarketplaceOverview({prismaClient, ledgerStore}) es un componente
interno: su llamador debe aplicar la autorizacion y contexto global apropiados.
No importa el cliente real ni inicia conexiones. La ruta usa el cliente existente
y el ledger persistente; no utiliza un fallback automatico en memoria.

## Definiciones de metricas

- gmvTotal: suma del total de Order para source MARKETPLACE, paymentStatus PAID y
  status distinto de CANCELLED. Es el importe bruto del pedido, incluidos envio
  y propina; no solo el subtotal de productos. Excluye pendientes, efectivo aun
  no conciliado que sigue PENDING y ordenes totalmente REFUNDED. No descuenta
  reembolsos parciales mientras el pedido conserva PAID: no es GMV neto de devoluciones.
- totalOrders: todos los pedidos source MARKETPLACE, incluidas ordenes pendientes,
  canceladas y reembolsadas. Se cuentan una vez, independientemente de cuantos
  asientos de captura, liquidacion o ajuste existan para la misma orden.
- platformFees: CREDIT menos DEBIT realmente asentados en PLATFORM_FEES. No se
  estima aplicando una tasa fija al GMV; una captura sin liquidacion no gana
  automaticamente una comision. Ajustes/reversiones reducen la cifra.
- balances: CREDIT menos DEBIT en GATEWAY_ESCROW, MERCHANT_PAYABLE y COURIER_PAYABLE,
  respetando la convencion del ledger actual. Incluye los eventos financieros de
  ordenes que despues fueron canceladas/reembolsadas. No se recortan saldos negativos.
- activeMerchants: restaurantes activos con hasWebStore habilitado, pertenecientes
  a tenants reales. Puede incluir comercios sin ventas: mide habilitacion actual,
  no actividad de ventas ni la allowlist del catalogo publico.

Se excluyen cuentas demo y el tenant de sistema mrtpvrest-platform de todos los
conjuntos. Se incluyen comercios historicos que tienen ordenes marketplace aunque
hayan deshabilitado su webstore o el restaurante: sus obligaciones no desaparecen.
Otras ordenes ONLINE/TPV que no tienen source MARKETPLACE quedan fuera.

La lista merchants incluye tiendas con webstore y/o historial marketplace, con
id, slug, name, businessType, isActive, createdAt, orderCount, gmv y gmvCents.
isActive expresa restaurante activo y webstore habilitada. La lectura pagina de
200 en 200 por ID, pero devuelve la lista completa y no trunca los totales.

## Ledger y transacciones recientes

El ledger se filtra por el pedido de su pago, su source MARKETPLACE y el tenant
real. Sus agregados agrupan cuenta/tipo/moneda en BD. La suma global de debitos
y creditos debe coincidir; si no, la vista falla con error de integridad.

recentTransactions contiene como maximo 20 asientos logicos, no 20 lineas. Se
seleccionan primero sus transactionId por createdAt descendente y desempate por
ID descendente; despues se leen sus lineas completas con un limite defensivo.
Cada asiento debe contener 2..20 lineas coherentes y balanceadas. Cada elemento
expone id, orderId, restaurantId, eventType, currency, amount, amountCents,
createdAt y entries con cuenta, tipo e importe. amount es el total de un lado
del asiento, no la suma de debitos mas creditos.

La verificacion de consistencia cubre agregados y asientos recientes; no prueba
que todo pedido tenga su evento contable ni constituye una auditoria criptografica
de todo el historial. La contabilidad no se corrige durante una consulta.
No se exponen clientes, direccion, telefono, correo, credenciales, collector,
payloads de pasarela, descripciones privadas, metadata o PINs.

## Precision, snapshot y memoria

GMV y conteos usan una consulta SQL parametrizada con las tablas definidas en el
schema: orders, restaurants, tenants, marketplace_order_pipelines y RestaurantConfig.
El total de cada orden se convierte a numeric y redondea individualmente a dos
decimales antes de sumar; se evita acumular Float del esquema legacy. No se
construye SQL con parametros de un navegador.

El resto de las sumas usa centavos BigInt y Decimal exactos, con conversion a
enteros seguros solo al serializar. La respuesta incluye gmvTotalCents,
platformFeesCents, balancesCents y ledgerIntegrity con los totales en centavos.
La moneda soportada es MXN, igual que el pipeline financiero existente. Datos de
otra moneda, importes invalidos o cifras fuera del rango seguro fallan; no hay
conversion FX ni mezcla de divisas.

El cliente raiz abre una unica transaccion RepeatableRead con maxWait 5 s y
timeout 20 s, para leer comercios, ordenes y ledger en el mismo snapshot. No se
hacen llamadas externas ni escrituras. No hay reintentos automaticos ni fallback
a ceros cuando falta una tabla o falla una consulta.

ledgerStore opcional debe implementar getAllTransactions() con transacciones del
motor puro. Se toma una copia y se resuelve cada orderId contra Prisma para
excluir demos, sistema y otros canales. Una identidad de restaurante contradictoria,
transacciones duplicadas o asientos invalidos producen error. Las metricas de
ordenes y comercios siguen saliendo de Prisma; el ledger nunca se usa como contador
de ventas. Memoria y BD no comparten atomicidad distribuida; esta inyeccion es
explicita y la ruta productiva utiliza exclusivamente persistencia Prisma.

## Evidencia local

Comandos ejecutados sin red:

```text
node apps/backend/scripts/saas-marketplace.test.cjs
node apps/backend/scripts/marketplace-orders.test.cjs
node apps/backend/scripts/driver-balance.test.cjs
node apps/backend/scripts/marketplace-catalog.test.cjs
```

Resultados: 19/19, 36/36, 22/22 y 17/17: **94/94 PASS**. Se comprobo tambien la
sintaxis de los archivos JavaScript/CJS afectados y git diff --check.

La suite nueva cubre ambos adaptadores de ledger, sumas globales, payouts y
ajustes, comercios historicos, exclusiones, paginacion, privacidad, transacciones
recientes completas y autorizacion antes del bypass. Incluye captura/entrega
del pipeline real sobre Prisma y pasarela simulados. El mock compartido soporta
ahora las relaciones y agregados usados en la auditoria; las aserciones previas
no se eliminaron.

Los tests de rutas cargan el archivo real en VM con Router y autenticacion
inyectados, sin arrancar Express. El contexto AsyncLocalStorage/bypass usado en
ellos es el real del tenant guard. No equivalen a validar JWT ni ejecutar el SQL,
los joins o el aislamiento contra PostgreSQL real.

No se modificaron schemas, entornos, secretos, dependencias ni frontend; no se
ejecutaron migraciones, builds, servidores, conexiones, pushes ni despliegues.
