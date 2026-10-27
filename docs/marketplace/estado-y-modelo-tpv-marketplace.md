# MRTPVREST Marketplace: estado actual y pendientes

**Corte:** 25 de octubre de 2026, actualizado el 26/oct con la aceptación en navegador (America/Mexico_City).
**Rama:** `feature/marketplace-hibrido`.
**Base funcional revisada:** `47060daf` (reparto propio aceptado en navegador; ver la sección correspondiente).
**Estado:** integración local avanzada; todavía no certificada para operación productiva.

**Actualización Codex G1–G8 (26/oct):** [entrega, pruebas y pendientes](entrega-codex-g1-g8.md). Red y Ops ya tienen persistencia PostgreSQL; finanzas cuenta con adaptadores de conciliación/reembolso y recuperación. Probados en base desechable, aún sin aceptación de navegador de esos cambios ni publicación por Codex. Los apartados históricos siguientes conservan su fecha y alcance.

Este es el punto de entrada vigente. Sustituye los resúmenes de preparación del 22/oct y la declaración de “100% completado” del informe backend del 23/oct. Los informes anteriores conservan evidencia histórica, no el estado de hoy.

## Modelo del producto

El TPV sigue siendo el producto base. Marketplace es un canal opcional por negocio: comparte menú, restaurante, sucursal, cocina y pedidos con el TPV. Las órdenes llevan `source: MARKETPLACE`. El módulo y la aprobación del comercio controlan su presencia en el directorio.

La primera operación integrada usa recogida en tienda o entrega por repartidores propios. La red compartida automática es una etapa posterior. El carrito multitienda de demostración sigue siendo un flujo de prueba; no acredita un cobro productivo multicomercio.

## Cambios consolidados

| Área | Implementado | Límite actual / siguiente cierre |
| --- | --- | --- |
| Catálogo y comprador | Tiendas, productos, filtros, navegación, carrito y experiencia de prueba. Directorio público v1 (`/api/marketplace/v1/merchants`) conectado a la BD desde `47060daf`: antes respondía siempre 503 y la tienda nunca activaba el checkout v1. El checkout v1 ofrece solo efectivo o pago en línea y oculta propina, cupón y cliente frecuente | El adaptador real v1 admite productos simples; variantes, modificadores obligatorios, combos y venta por peso no están integrados en esa compra. La orden v1 no cobra propina, cupón ni puntos |
| TPV y KDS | Recepción, aceptación/rechazo y etiqueta de Marketplace; pedidos pendientes de pago separados de los que requieren aceptación; etiqueta correcta de "Pagado en línea"; aviso inmediato por socket (`order:new`) cuando el pedido queda por aceptar (`47060daf`) | Recorrido aceptado en navegador el 26/oct, salvo el aviso por socket. Ver riesgos abiertos de "Cobrar" y de edición del pedido |
| Comercios | Módulo por negocio, solicitud, aprobación y directorio aprobado | Aplicar migraciones/configuración en el entorno objetivo antes de habilitar |
| Cotización y orden v1 | Adaptadores Prisma, precios del servidor, snapshots, consumo de cotización e idempotencia | Activación explícita; falta certificar el entorno de operación |
| Pago en línea | Preferencia Mercado Pago, firma/deduplicación del webhook, captura contable y paso a pendiente de aceptación | Pasarela simulada en las pruebas; pendiente validación con cuenta sandbox y webhook del entorno objetivo |
| Direcciones y envío | Libreta del comprador, ubicación seleccionada y tarifa de la tienda FLAT/DISTANCE/ZONES | Pendiente comprobación visual de zonas, cobertura y direcciones |
| Repartidores propios | Bolsa, toma/asignación, entrega con PIN del comprador, protección de intentos, conservación de pago online y efectivo en el corte | Aceptado en navegador el 26/oct (efectivo y pago en línea simulado). La caja conserva el override sin PIN; ver "Reglas vigentes del reparto propio" |
| Seguimiento | Estado real de la orden y token del comprador; deja de consultar y oculta el código al quedar entregado o cancelado. C5: en camino, mapa con el repartidor y la sucursal (si tiene coordenadas). Reparto propio: último aviso GPS de la app del repartidor etiquetado con ESE pedido; red: presencia de G1 solo con `MARKETPLACE_NETWORK_ENABLED=true`. Señal de 90 s o más se oculta y se marca vieja. Aceptado en navegador con base desechable | La app del repartidor solo manda GPS con permiso de ubicación; no se probó en navegador. El índice `DriverLocation(driverId, orderId, createdAt)` llega con la migración `20261027000000` |
| Red compartida y rutas multitienda | G1 conecta tareas, ofertas, asignaciones y presencia a PostgreSQL; 11 escenarios de reparto unitario aprobados, incluido reinicio de proceso y concurrencia | Bandera apagada; v1 conserva MANUAL. Pendientes selección de comercios, aceptación en navegador y escalado. Multitienda sigue en demostración/staging |
| Panel Ops | G6 conecta listado, aprobación y reasignación auditada a los stores transaccionales | Probado con fixtures y PostgreSQL; pendiente aceptación de navegador y activación del entorno |
| Liquidaciones/reembolsos | G7 añade adaptadores reales, reserva durable, conciliación y recuperación; ocho escenarios PostgreSQL aprobados con pasarela simulada | Pendientes Mercado Pago sandbox real y publicador del outbox. Obligación contable no equivale a transferencia bancaria |

## Historial reciente verificable

| Commit | Entrega |
| --- | --- |
| `4fb33d98` | Pedidos Marketplace en TPV y KDS |
| `90ef55c5` | Módulo por negocio y aprobación de comercios |
| `dc20efdc` | Cotización y orden v1 conectadas a Prisma, inicialmente recogida |
| `d43556d7` | Pago online y webhook v1 |
| `b7ae7564` | Seguimiento con estado real |
| `dc365be2` | Direcciones y tarifa de entrega |
| `195e040d` | Reparto propio con PIN del comprador |
| `6526b939` | Consolidación del estado y verificador ampliado |
| `47060daf` | Correcciones de la aceptación en navegador: directorio v1, etiqueta de pagado en el TPV, seguimiento, checkout v1 y aviso inmediato al TPV |
| `62765ba8` | TPV: sin "Cobrar" ni edición de productos en pedidos del marketplace |
| `38c90c4b`, `ada677b8` | G1–G8 de Codex: red y Ops persistentes, coordenadas de sucursal, PIN de la red, panel SaaS, pestaña de la red, finanzas e informe de seguridad |
| `5a16fe42` | C5: GPS en el seguimiento v1 e índice de `DriverLocation` |
| `cac66c31` | TPV: el mesero en una comandera entra directo al salón (prueba E2E intermitente) |
| (este commit) | C7: activación, migración y reversión |

Al inicio de esta consolidación había 13 commits por delante de la referencia local `origin/feature/marketplace-hibrido`. No se consultó de nuevo el remoto; ese número no certifica su estado actual. La consolidación documental se guarda después de esta base.

## Aceptación en navegador del reparto propio (26/oct)

Recorrido real con las apps del repo en loopback (tienda 4103, TPV 4105, repartidor 4107, KDS 4109 y backend 4100). Contra una PostgreSQL **desechable** con las 98 migraciones aplicadas desde cero; se borró al terminar. Usuarios y credenciales de prueba creados solo para ese recorrido. Mercado Pago simulado: la red de salida del backend quedó bloqueada y el aviso de pago se mandó firmado con un secreto de prueba.

| Caso | Resultado |
| --- | --- |
| Efectivo a domicilio: compra con dirección y punto en el mapa, aceptación en TPV, cocina en KDS, el repartidor propio lo toma y entrega con el código del comprador | Aprobado. El seguimiento muestra cada estado; el efectivo entra al corte del repartidor |
| Código equivocado al entregar | Rechazado por el servidor ("El código de entrega no coincide") |
| Pago en línea simulado | Mientras espera el pago no aparece en la bolsa. El aviso firmado lo deja pagado y por aceptar. Al entregar, la app muestra "Pagado en línea · No cobres nada" y la orden conserva PAID |
| Asignar repartidor antes de aceptar | Bloqueado (409 `ORDER_NOT_ACCEPTED`); la caja ve el mensaje |
| Rechazo en el TPV | Orden cancelada; el comprador ve "Cancelado" sin código |
| Aislamiento entre comercios | El repartidor de otro comercio ve 0 pedidos y recibe 404 al intentar tomar uno ajeno |
| Libreta de direcciones | La dirección del primer pedido aparece en "Mis direcciones" y se reutiliza |

Corregido en `47060daf`, a partir de esta prueba:
- El directorio v1 respondía siempre 503, así que la tienda nunca activaba el checkout del marketplace.
- La pantalla principal del TPV mostraba "Por cobrar" en pedidos ya pagados en línea.
- El seguimiento del comprador seguía mostrando el código y consultando después de entregado.
- El checkout arrastraba las notas del pedido anterior.
- El checkout mostraba propina, cupón y puntos que la orden v1 no cobra, y "Usa tu ubicación" con tarifa fija.
- Se agregó el aviso inmediato al TPV.

Lo que esta prueba **no** cubrió o dejó abierto:
- El aviso inmediato al TPV (`order:new`) solo tiene pruebas automáticas existentes; no se observó en el navegador. Tampoco tienen pruebas nuevas el repo del directorio v1 ni el notificador.
- **Riesgo de doble cobro:** las cuentas abiertas del TPV muestran "Cobrar" en pedidos del marketplace aún por aceptar y en pedidos ya pagados en línea.
- **Riesgo de descuadre:** "Ver detalle" abre el pedido del marketplace en el editor del TPV y permite cambiar productos, aunque el cobro y la liquidación se calcularon con la cotización.
- Cancelar desde la caja un pedido pagado en línea no reembolsa (pendiente 4).
- La tarea de despacho MANUAL se queda en `WAITING_READY` aunque la orden se entregue; el seguimiento usa el estado de la orden, así que solo es cosmético.

## Verificación repetida el 25/oct

- `node scripts/test-marketplace-all.mjs`: **55/55 suites aprobadas**, **1.218 pruebas con recuento explícito**, más **5 scripts aprobados sin recuento normalizado**, cero fallos.
- El verificador incluye ahora 17 suites omitidas: adaptadores v1, pagos, direcciones, aprobación, identidad, PIN propio, demostración multitienda y rutas HTTP con Prisma/pasarela simulados.
- El contador dejó de inventar una prueba para cada script sin resumen. Los totales anteriores no son directamente comparables.
- `tsc --noEmit --incremental false`: **sin errores en client, delivery, admin y saas**. El bloqueo histórico de lectura de los tipos React no se reprodujo.
- Prueba de recepción web del TPV (`src/__tests__/webOrders.test.ts`): **3/3 aprobadas**, ejecutadas por separado; no incluidas en el total del verificador.
- Ambos schemas Prisma son idénticos: SHA-256 `937501d87d6b9d5b3b651db8833ad92be52c76585d10cb9c707fbd449567441c`.
- Hay **98 directorios de migración**. Su existencia no acredita aplicación en ninguna base.
- Claude dejó registrados ensayos E2E con PostgreSQL desechable para los pasos 3a–3e. Esta consolidación repitió las pruebas locales con fixtures/mocks, no esos ensayos de base de datos ni los recorridos de navegador.
- El verificador valida únicamente las suites enumeradas. No ejecuta todo el monorepo ni certifica bloqueo de red, disponibilidad de servicios, navegador, despliegue o producción.
- **26/oct, después de `47060daf`:** estos totales son del 25/oct y no se repitieron completos, porque la copia compartida tiene trabajo de ChatGPT sin commit (G1–G8). Sí pasan las suites tocadas por `47060daf`: adaptadores v1, pagos v1, webhooks v1, comercios v1, cotización, incidencias de entrega y checkout del cliente, más `tsc` de client y TPV.

## Activación y entornos

Las rutas v1 siguen detrás de banderas explícitas, todas apagadas por defecto. Prender una bandera **no basta**: cada una necesita sus variables y datos, o responde 503/409 sin una causa obvia. La tabla describe el código, no los valores efectivos de ningún entorno.

| Bandera (`=true`) | Qué activa | Necesita además | Sin eso |
| --- | --- | --- | --- |
| `MARKETPLACE_V1_ORDERS_ENABLED` | Cotización, orden, seguimiento, libreta de direcciones y directorio público v1 | `MARKETPLACE_COMMISSION_BPS` (entero 0–10000). `MARKETPLACE_PIN_SECRET` (32+ bytes). Opcional `MARKETPLACE_PIN_KEY_ID` (por defecto `v1`). Para comprador con sesión: `MARKETPLACE_BUYER_JWT_SECRET` o, en su defecto, `JWT_SECRET` | Sin comisión la cotización responde 503; sin el secreto del PIN la orden responde 503. Sin la bandera todo v1 responde 503 y la tienda usa su checkout normal |
| `MARKETPLACE_V1_DELIVERY_ENABLED` | Entrega a domicilio de la orden v1, con repartidores propios y el PIN del comprador | La bandera de órdenes. En la tienda: `deliveryMode` (FLAT, DISTANCE o ZONES). DISTANCE requiere el origen (`originLat`/`originLng`); ZONES requiere zonas activas. La primera sucursal activa con `hasDelivery` | Cotizar a domicilio responde 409 `DELIVERY_UNAVAILABLE` (solo recoger) |
| `MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED` | Pago en línea con Mercado Pago y su webhook v1 | `MARKETPLACE_MP_NOTIFICATION_URL` (https, la URL pública del webhook v1). `MARKETPLACE_MP_WEBHOOK_SECRET` (o `MERCADOPAGO_WEBHOOK_SECRET`). `MARKETPLACE_PAYMENT_NETWORK_ENABLED=true` y `MARKETPLACE_ISOLATED` distinto de `true`. Por comercio, una integración MERCADOPAGO activa (token, `collectorId`, modo sandbox/production) | Sin URL https el pago en línea queda apagado (409). Sin secreto el webhook responde 503. Sin red el link de pago queda pendiente |
| `MARKETPLACE_DIRECTORY_APPROVED` | Catálogo de la portada (`/api/marketplace/stores`) por aprobación: comercios APPROVED con el módulo `marketplace` | Aprobación del comercio en el panel SaaS y el módulo en su tenant | La portada solo lista los slugs de `MARKETPLACE_STORE_SLUGS`. El directorio v1 y la cotización exigen comercio aprobado siempre, con o sin esta bandera |

En el cliente, el checkout v1 se activa con `NEXT_PUBLIC_MARKETPLACE_CATALOG=true` (o el modo aislado) más `NEXT_PUBLIC_API_URL`. Además, `GET /api/marketplace/v1/merchants/:slug` debe responder, lo que exige la bandera de órdenes. El PIN de los pedidos propios de la tienda (no marketplace) sigue con `STORE_DELIVERY_PIN_MODE` y `STORE_DELIVERY_PIN_SECRET`.

### Reglas vigentes del reparto propio

- La orden v1 a domicilio nace con política MANUAL: nunca se ofrece a la red compartida. El repartidor es `Order.deliveryDriverId`.
- No sale a reparto (bolsa, tomar, asignar) mientras está `PENDING_PAYMENT` o `PENDING_MERCHANT`.
- El repartidor solo la cierra con el código del comprador. Es siempre obligatorio, con freno de 10 intentos fallidos en 15 minutos.
- **Override de la caja:** el personal de la tienda (caja, gerente, administrador, dueño) puede marcar entregado un pedido del marketplace **sin el código**. Puede hacerlo desde la ruta del repartidor y desde el cambio de estado del TPV (`READY → DELIVERED`), igual que con los pedidos propios. Es una decisión abierta del usuario: si se quiere el código también en caja, hay que bloquear esos dos caminos para `source: MARKETPLACE`.

El registro local documenta autorizaciones posteriores a la preparación inicial para instalar, arrancar en loopback, hacer commits locales y probar en PostgreSQL desechable. No equivalen a autorización para cambiar producción. En esta consolidación no se instalaron paquetes, cambiaron entornos, arrancaron aplicaciones, ejecutaron migraciones ni desplegaron recursos.

La protección de push sigue configurada. Las migraciones de estas integraciones no están acreditadas como aplicadas en producción. El estado remoto de previews y servicios debe comprobarse antes de publicar; no se infiere de una rama ni de una captura histórica.

## Pendientes ordenados

1. **Cerrar los pendientes de la aceptación del reparto propio.** El recorrido ya se aceptó en navegador el 26/oct. Falta:
   - Ver el aviso inmediato al TPV en pantalla.
   - Agregar pruebas al directorio v1 y al notificador.
   - Quitar "Cobrar" en pedidos del marketplace por aceptar o ya pagados.
   - Impedir editar productos de un pedido del marketplace desde el TPV.
   - Decidir el override de la caja sin código (ver "Reglas vigentes del reparto propio").
2. **Completar persistencia del despacho compartido y Ops.** Guardar tareas/ofertas/asignaciones, conectar órdenes y couriers reales, recuperar estado tras reinicio y verificar concurrencia en PostgreSQL. Conservar separada la ruta propia MANUAL que ya funciona en código.
3. **Alta de cuentas para el entorno elegido.** El GPS del seguimiento ya está conectado (C5); falta revisar la identidad de staging antes de habilitar cuentas reales de repartidores de la red.
4. **Integrar liquidaciones y reembolsos.** Stores transaccionales, permisos por comercio, conciliación, reintentos y validación con pasarela sandbox; comprobar recuperación de eventos pendientes.
5. **Cerrar revisión de seguridad y compatibilidad.** Revalidar dependencias y avisos actuales, secretos propios del marketplace, separación de PIN de recogida/entrega y límites de intentos en todos los caminos. El bloqueo del PIN de reparto propio está implementado; no extender esa conclusión a toda la red compartida.
6. **Preparar publicación controlada.** El plan está en [activacion-migracion-reversion.md](activacion-migracion-reversion.md) (C7): qué dispara el merge, las 9 migraciones y sus riesgos, verificaciones previas en producción, fases de activación por bandera y reversión. Publicar requiere una instrucción explícita.
7. **Confirmar configuración comercial antes de habilitar ventas.** Comisión efectiva, responsables de aprobación, alcance de red compartida y reglas de liquidación. El código configurable no confirma una decisión de negocio.

## Coordinación y entrega entre agentes

- Codex dejó implementados contratos/backend, permisos y paneles; Claude completó las integraciones TPV/Prisma y reparto propio. El paso 3e figura como terminado en `195e040d` y su aceptación en navegador en `47060daf`.
- Desde el 25/oct rige el plan de reparto ChatGPT (G1–G8) + Claude (C1–C7), registrado en `MARKETPLACE-TRABAJO.md`. La fase 1 de Claude (C1–C4) está terminada; G1–G8 de ChatGPT estaban en curso al cierre de esta actualización.
- Esta consolidación actualiza documentación y verificador; no asigna una nueva funcionalidad ni envía tareas a otros chats.
- La copia es compartida: registrar archivos y responsable antes de cada tarea; trabajar en secuencia cuando se solapen. No hacer commits globales que absorban trabajo ajeno en curso.
- Registrar por separado: implementado, probado con mocks, probado con base desechable, aceptado en navegador y desplegado.
- La cola M01–M09 y los IDs de Orca pertenecen al arranque histórico. No prueban que hoy exista un coordinador o trabajador activo.

## Referencias

- [Registro técnico histórico de backend](backend-v1-plan-completado.md)
- [Contrato de catálogo](contrato-catalogo.md)
- [Plan técnico](MRTPVREST_Marketplace_Plan_Tecnico_v1.md)
- [Verificador local](../../scripts/test-marketplace-all.mjs)
- [Guía de colaboración](../agent-collab.md)
