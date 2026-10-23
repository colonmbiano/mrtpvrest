# Motor de politicas de despacho hibrido

Alcance local del 23 de octubre de 2026, rama `feature/marketplace-hibrido`.
Archivos de esta tarea: motor y router de despacho, montaje en `index.js`,
pruebas de despacho y su fixture aislado. Sin migraciones ni servicios arrancados.

## Reglas implementadas

- `OWN_ONLY`: ofertas a afiliaciones activas del comercio/sucursal exactos, con
  `canTakeOwnOrders=true`. Un booleano global `isAffiliated` no concede acceso.
- `SHARED_ONLY`: ofertas a couriers activos, online, inscritos en plataforma
  (`isShared=true`) y con presencia `acceptingShared=true`. Un afiliado tambien
  puede participar; su asignacion conserva `source=SHARED`.
- `OWN_THEN_SHARED`: ventana propia desde `offeringStartedAt`, independiente de
  la fecha de creacion del pedido. Al llegar al plazo se invalidan ofertas propias
  y se ofrecen tareas compartidas. Rechazos, ausencia de personal y TTL de una
  oferta no acortan la ventana. El valor cero pasa directamente a red compartida.
- `MANUAL`: permanece en `WAITING_READY` hasta que un operador solicita red
  compartida o selecciona un courier propio. El polling conserva esa seleccion.

Politica y limites quedan fotografiados en cada tarea al comenzar. Cambiar la
configuracion del comercio afecta tareas nuevas. `fallbackSeconds` es un entero
de 0 a 3600 y `maxDistanceKm` un numero finito mayor que cero y hasta 100.
El radio se aplica tanto a couriers propios como compartidos. Se descartan
presencias invalidas, futuras, mayores de 90 segundos, offline o fuera de radio.
La distancia usa Haversine; todavia no representa distancia por carretera.

La tarifa ofertada proviene del servidor (`task.payoutAmount`); cambiar de red
conserva tarifa y moneda. Una asignacion propia cancelada por conmutacion queda
en el historial y pierde el derecho a confirmar pickup. Un courier ocupado no
puede aceptar otra tarea, incluso si conserva una oferta anterior.

## API v1

El mismo router se monta en `/api/marketplace/v1` y en el prefijo legacy
`/api/marketplace/dispatch`. Todas sus operaciones requieren autenticacion;
los identificadores del body o query nunca sustituyen la identidad verificada.
El administrador debe pertenecer al restaurante y a la sucursal cuando tenga
`locationId`. `SUPER_ADMIN` tiene acceso global explicito.

| Metodo | Ruta relativa a v1 | Entrada |
| --- | --- | --- |
| PUT | `/merchants/:id/delivery-policy` | `deliveryPolicy`, `fallbackSeconds`, `maxDistanceKm` |
| POST | `/dispatch/tasks/:id/start` | `expectedVersion` opcional |
| POST | `/dispatch/tasks/:id/assign-own` | `courierId`, `expectedVersion` opcional |
| POST | `/dispatch/tasks/:id/request-shared` | `expectedVersion` opcional |
| GET | `/dispatch/tasks/:id` | Administrador autorizado o courier asignado |
| GET | `/couriers/me/offers` | Solo ofertas propias elegibles |
| POST | `/couriers/me/presence` | Disponibilidad, coordenadas, precision, opt-in compartido |
| POST | `/couriers/offers/:id/accept` | Identidad de la sesion |
| POST | `/couriers/tasks/:id/pickup` | `pickupPin`, `expectedVersion` opcional |
| POST | `/couriers/tasks/:id/deliver` | `deliveryPin`, `expectedVersion` opcional |

El operador puede forzar red compartida bajo cualquiera de las cuatro politicas
antes de pickup, incluso despues de aceptar una oferta propia. La conmutacion
repetida ya en red compartida es idempotente. Despues de pickup o en estados
terminales se devuelve 409. `expectedVersion` protege decisiones del operador
contra una lectura obsoleta. Una oferta lleva la version de su ola y no puede
aceptarse tras una conmutacion. Solo un ganador puede asignarse por tarea.

Aceptar y cambiar de red no actualizan `Order.status`. Confirmar pickup requiere
el courier asignado, PIN valido y `Order.status=READY`; solo entonces cambia a
`ON_THE_WAY`. Entregar exige pickup previo y PIN de entrega valido.

## Adaptador y limites de integracion

`createHybridDispatchEngine({store, now})` trabaja sobre el almacen Map existente
del router. Sus colecciones son `merchants`, `tasks`, `orders`, `couriers`,
`affiliations`, `offers` y `assignments`. Comercio, identidades, afiliaciones,
orden, ubicacion y tarifa deben provisionarse por un adaptador confiable del
servidor; los endpoints de presencia no crean ni habilitan couriers.

El CAS implementado es sincronico sobre un almacen autoritativo compartido:
checks y escrituras no contienen `await`. El alcance de esa atomicidad es **un
proceso**, no varias instancias ni persistencia ante reinicios. No hay tablas
DeliveryTask/Affiliation/MarketplaceMerchant integradas en el esquema actual.
El router arranca con colecciones vacias: no fabrica comercios o tareas y no
importa Prisma. El checkout persistente de `marketplace-orders.js` conserva su
flujo SHARED existente y no queda conectado automaticamente a estos Maps.

Para usar este motor con el checkout real hace falta un adaptador de persistencia
que cargue politica y afiliaciones, use transaccion/CAS e indice unico de
asignacion activa y guarde task/offer/assignment/Order y outbox en el mismo commit.
Las pruebas de esta tarea no demuestran concurrencia real de PostgreSQL.

`engine.tick()` evalua vencimientos y renueva ofertas. El polling autenticado de
ofertas y consulta de tareas lo invoca; aceptar tambien comprueba el deadline.
Sin trafico no se ejecuta un job en segundo plano. Un futuro worker autorizado
debe llamar a `tick()` para emitir ofertas proactivas durante periodos sin polling.
Importar el motor o crear el router no arranca temporizadores ni servicios.

## Verificacion offline

```powershell
node --test apps/backend/scripts/marketplace-hybrid-policy.test.cjs apps/backend/scripts/marketplace-dispatch.test.cjs
node --test apps/backend/scripts/marketplace-orders.test.cjs apps/backend/scripts/marketplace-payments.test.cjs apps/backend/scripts/marketplace-ledger.test.cjs
```

La suite nueva bloquea conexiones de sockets, HTTP/HTTPS, fetch y carga de Prisma,
database, Express y dotenv. Usa reloj inyectado, Maps sinteticos y un Router
simulado; no abre puertos ni inicializa la aplicacion. Cubre las cuatro politicas,
limites temporales, renovacion de olas, afiliaciones y sucursales, opt-in, GPS,
concurrencia entre aceptacion/conmutacion/pickup, historial, PINs y autorizacion.

La suite previa conserva sus 22 casos; el caso que antes permitia fallback temprano
por rechazo ahora exige respetar la ventana configurada. Sus fixtures HTTP usan
identidades autenticadas y ordenes vinculadas al almacen del motor.

Resultado ejecutado: **155/155 pruebas aprobadas**, cero fallos y cero omitidas:
66 de politica hibrida, 22 de despacho previo y 67 de pedidos/pagos/ledger.
`node --check` paso para motor, router, montaje, suite y fixture nuevos;
`git diff --check` no reporto errores de whitespace. No se instalaron dependencias,
arrancaron servidores ni conectaron bases o proveedores.
