# MRTPVREST Marketplace: estado actual y pendientes

**Corte:** 25 de octubre de 2026 (America/Mexico_City).
**Rama:** `feature/marketplace-hibrido`.
**Base funcional revisada:** `195e040d`.
**Estado:** integración local avanzada; todavía no certificada para operación productiva.

Este es el punto de entrada vigente. Sustituye los resúmenes de preparación del 22/oct y la declaración de “100% completado” del informe backend del 23/oct. Los informes anteriores conservan evidencia histórica, no el estado de hoy.

## Modelo del producto

El TPV sigue siendo el producto base. Marketplace es un canal opcional por negocio: comparte menú, restaurante, sucursal, cocina y pedidos con el TPV. Las órdenes llevan `source: MARKETPLACE`. El módulo y la aprobación del comercio controlan su presencia en el directorio.

La primera operación integrada usa recogida en tienda o entrega por repartidores propios. La red compartida automática es una etapa posterior. El carrito multitienda de demostración sigue siendo un flujo de prueba; no acredita un cobro productivo multicomercio.

## Cambios consolidados

| Área | Implementado | Límite actual / siguiente cierre |
| --- | --- | --- |
| Catálogo y comprador | Tiendas, productos, filtros, navegación, carrito y experiencia de prueba | El adaptador real v1 admite productos simples; variantes, modificadores obligatorios, combos y venta por peso no están integrados en esa compra |
| TPV y KDS | Recepción, aceptación/rechazo y etiqueta de Marketplace; pedidos pendientes de pago separados de los que requieren aceptación | Validar el recorrido visual completo con todas las aplicaciones juntas |
| Comercios | Módulo por negocio, solicitud, aprobación y directorio aprobado | Aplicar migraciones/configuración en el entorno objetivo antes de habilitar |
| Cotización y orden v1 | Adaptadores Prisma, precios del servidor, snapshots, consumo de cotización e idempotencia | Activación explícita; falta certificar el entorno de operación |
| Pago en línea | Preferencia Mercado Pago, firma/deduplicación del webhook, captura contable y paso a pendiente de aceptación | Pasarela simulada en las pruebas; pendiente validación con cuenta sandbox y webhook del entorno objetivo |
| Direcciones y envío | Libreta del comprador, ubicación seleccionada y tarifa de la tienda FLAT/DISTANCE/ZONES | Pendiente comprobación visual de zonas, cobertura y direcciones |
| Repartidores propios | Bolsa, toma/asignación, entrega con PIN del comprador, protección de intentos, conservación de pago online y efectivo en el corte | Integración local terminada el 25/oct; pendiente aceptación conjunta comprador/TPV/repartidor |
| Seguimiento | Estado real de la orden y token del comprador | El adaptador actual no entrega GPS: presencia devuelve null y la consulta de sucursal no obtiene coordenadas |
| Red compartida y rutas multitienda | Motor híbrido, concurrencia, fallback, afiliaciones y pruebas de rutas de staging | El router de despacho utiliza mapas en memoria; falta persistencia y alimentación desde órdenes reales |
| Panel Ops | Interfaz, permisos, listado y reasignación auditada implementados y probados con fixtures | Montado sin stores transaccionales de operación; no certificarlo como funcional con datos reales |
| Liquidaciones/reembolsos | Contratos, lógica de partida doble y pruebas | Faltan adaptadores de operación para los puertos del servicio y validación de liquidación/reembolso real |

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

Al inicio de esta consolidación había 13 commits por delante de la referencia local `origin/feature/marketplace-hibrido`. No se consultó de nuevo el remoto; ese número no certifica su estado actual. La consolidación documental se guarda después de esta base.

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

## Activación y entornos

Las rutas v1 siguen detrás de banderas explícitas: `MARKETPLACE_V1_ORDERS_ENABLED`, `MARKETPLACE_V1_DELIVERY_ENABLED`, `MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED`; la pasarela requiere además `MARKETPLACE_PAYMENT_NETWORK_ENABLED`. El directorio aprobado usa `MARKETPLACE_DIRECTORY_APPROVED`. Esto describe el código, no los valores efectivos de los entornos.

El registro local documenta autorizaciones posteriores a la preparación inicial para instalar, arrancar en loopback, hacer commits locales y probar en PostgreSQL desechable. No equivalen a autorización para cambiar producción. En esta consolidación no se instalaron paquetes, cambiaron entornos, arrancaron aplicaciones, ejecutaron migraciones ni desplegaron recursos.

La protección de push sigue configurada. Las migraciones de estas integraciones no están acreditadas como aplicadas en producción. El estado remoto de previews y servicios debe comprobarse antes de publicar; no se infiere de una rama ni de una captura histórica.

## Pendientes ordenados

1. **Cerrar aceptación del flujo con reparto propio.** Un comercio aprobado, compra de productos compatibles, orden en TPV/KDS, aceptación, preparación, asignación, PIN y entrega. Cubrir efectivo y pago online simulado, reintentos, rechazo, PIN incorrecto y aislamiento entre comercios.
2. **Completar persistencia del despacho compartido y Ops.** Guardar tareas/ofertas/asignaciones, conectar órdenes y couriers reales, recuperar estado tras reinicio y verificar concurrencia en PostgreSQL. Conservar separada la ruta propia MANUAL que ya funciona en código.
3. **Conectar GPS real y alta de cuentas para el entorno elegido.** Coordenadas de sucursal, presencia del repartidor, asociación con la tarea, privacidad y caducidad; revisar la identidad de staging antes de habilitar cuentas reales.
4. **Integrar liquidaciones y reembolsos.** Stores transaccionales, permisos por comercio, conciliación, reintentos y validación con pasarela sandbox; comprobar recuperación de eventos pendientes.
5. **Cerrar revisión de seguridad y compatibilidad.** Revalidar dependencias y avisos actuales, secretos propios del marketplace, separación de PIN de recogida/entrega y límites de intentos en todos los caminos. El bloqueo del PIN de reparto propio está implementado; no extender esa conclusión a toda la red compartida.
6. **Preparar publicación controlada.** Verificar destinos, variables y automatizaciones remotas; plan de migración y reversión; ejecutar aceptación en staging persistente y conservar evidencia. Publicar requiere una instrucción explícita.
7. **Confirmar configuración comercial antes de habilitar ventas.** Comisión efectiva, responsables de aprobación, alcance de red compartida y reglas de liquidación. El código configurable no confirma una decisión de negocio.

## Coordinación y entrega entre agentes

- Codex dejó implementados contratos/backend, permisos y paneles; Claude completó las integraciones TPV/Prisma y reparto propio. El paso 3e figura como terminado en `195e040d`.
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
