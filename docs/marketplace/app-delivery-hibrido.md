# App de repartidores: estado global y sincronizacion hibrida

Implementacion local en `feature/marketplace-hibrido`. Cambios propios de esta
tarea: los dos stores, `src/lib/marketplaceDispatch.ts`, `src/lib/offline.ts` y
`scripts/delivery-dispatch.test.mjs`, todos bajo `apps/delivery`, mas este documento.
Las pantallas y componentes con cambios de otro agente no se editaron.

## Estado global

`useDeliveryStore` mantiene `driver`, `orders`, `history`, `isOnline`, `isShared`
y `presence`. `isOnline` es la disponibilidad operativa del repartidor; no equivale
a `navigator.onLine`, que indica conectividad del dispositivo.

- `setIsShared(boolean)` cambia la preferencia de participar en la red compartida.
  Comienza en `false` y se conserva para la misma cuenta.
- `setPresence({ lat, lng }, observedAt?)` recibe una muestra GPS, sin iniciar un
  watcher ni enviar peticiones. Requiere driver y disponibilidad online, coordenadas
  finitas dentro de rango y timestamp reciente. Acepta latitud/longitud cero.
- Cada muestra contiene `lat`, `lng`, `observedAt`, `expiresAt`; su vigencia es
  `PRESENCE_TTL_MS = 90_000`. No se aceptan muestras futuras, vencidas o anteriores
  a la ultima muestra. `getPresence(now?)` devuelve `null` al alcanzar el vencimiento.
  Los consumidores deben usar este getter para no mostrar el objeto almacenado
  cuando ya caduco. No hay un temporizador de GPS creado por el store.
- `setIsOnline(false)` y `clearPresence()` borran la muestra.
- Cambiar la identidad del driver o ejecutar `logout()` limpia presencia,
  disponibilidad, preferencia compartida, ordenes e historial; tambien retira las
  acciones PIN de la cola para no reutilizarlas con otra cuenta. Actualizar los
  datos del mismo driver no elimina su trabajo pendiente.

La clave persistente sigue siendo `delivery-app-storage`, ahora version 1. Solo
se guardan `driver`, `orders`, `history`, `isShared`. Disponibilidad y GPS nunca
se restauran: tras recargar se exige una nueva activacion y muestra. La migracion
desde version 0 ignora antiguos valores online/GPS y normaliza `isShared`.

Ejemplo de consumo por la capa de interfaz:

```ts
const state = useDeliveryStore.getState();
state.setDriver(driverAutenticado);
state.setIsShared(true);
state.setIsOnline(true);
state.setPresence({ lat, lng });
const currentPosition = useDeliveryStore.getState().getPresence();
```

El store representa estado local, no un acuse del servidor. La interfaz debe
enviar/confirmar disponibilidad usando `updateCourierPresence` y llamar a
`setDriver`/`logout` en su ciclo de sesion. Esta tarea no sustituye el estado
React local que ya existe en `page.tsx` ni conecta automaticamente sus watchers.

## Cola offline

`useOfflineStore` conserva los tipos existentes (`CONFIRM_DELIVERY`,
`MARK_ERRAND_DONE`, `LOG_EXPENSE`, `CHAT_MESSAGE`) y agrega:

| Accion | Datos permitidos |
| --- | --- |
| `CONFIRM_PICKUP_PIN` | `courierId`, `taskId`, `pickupPin` |
| `CONFIRM_DELIVERY_PIN` | `courierId`, `taskId`, `deliveryPin`, `paymentMethod`, `cashCollected` |

Las acciones PIN exigen identificadores no vacios y cuatro digitos ASCII, conservando
ceros iniciales. `paymentMethod` admite `CASH`, `TRANSFER` o `CARD_ONLINE` y
`cashCollected` debe ser booleano. Al encolar se copia y proyecta el payload; no
se incorporan campos adicionales al registro PIN.

Cada elemento lleva ID estable, `timestamp`, `retryCount`, `synced` y, para PIN,
`expiresAt`. `addToQueue` devuelve el ID. Para una misma tarea, courier y fase,
un segundo toque devuelve la accion pendiente existente; no cambia su clave,
payload ni vencimiento mientras este en espera.

`PIN_QUEUE_TTL_MS = 15 minutos` limita la retencion local. Se puede solicitar un
vencimiento menor, pero no ampliar ese maximo al encolar. **No representa el TTL
del PIN en el servidor** ni extiende una oferta. Las ofertas no se aceptan offline.

Se persisten `queue` y `lastSync` bajo `delivery-offline-storage`, version 1;
`syncInProgress` siempre arranca en `false`. La migracion conserva trabajo legacy.
Al hidratar, las acciones PIN vencidas, incompletas o ya fallidas se normalizan;
se sobrescribe el almacenamiento sin sus codigos. La caducidad tambien se revisa
al consultar pendientes y antes de cada replay. Con la app cerrada no corre un
proceso que borre localStorage: la limpieza se aplica al volver a ejecutarla.

Los fallos definitivos permanecen visibles con `failureReason` y solo IDs de
courier/tarea, sin PIN: `EXPIRED`, `REJECTED`, `MAX_RETRIES`, `UNKNOWN_TYPE`.
`getUnsynced()` los excluye del replay. `removeFailed(id)` permite descartarlos
explicitamente. `markSynced(id)` retira de inmediato la accion confirmada y las
fallidas de esa misma fase/tarea que ya quedaron resueltas por la confirmacion.
No quedan codigos esperando un temporizador de limpieza tras un acuse.

## Cliente y sincronizacion

`marketplaceDispatch.ts` valida GPS y formato PIN, filtra ofertas vencidas y
normaliza fechas ISO a milisegundos e `id` a `offerId` cuando corresponde. Se
conservan los resultados especificos de aceptacion 409 y 410. No se encola la
aceptacion de ofertas ni se cambia optimistamente el estado de una orden.

`confirmPickupPin`/`confirmDeliveryPin` encolan cuando `navigator.onLine` es falso
o Axios reporta un fallo de conexion reconocido sin respuesta (`ERR_NETWORK`,
`ECONNABORTED`, `ETIMEDOUT`). Una respuesta HTTP de rechazo no se convierte en
una accion offline nueva. Encolar devuelve `{ success: false, queued: true,
queueId, error }`: **no confirma un PIN ni autoriza `ON_THE_WAY`/`DELIVERED`**.
La interfaz puede distinguir pendiente de rechazo mediante `queued`.

Se alinearon las rutas con el montaje actual del router backend:

| Operacion | Ruta bajo `/api/marketplace/dispatch/couriers` |
| --- | --- |
| Presencia | `POST /me/presence` |
| Ofertas | `GET /me/offers` |
| Aceptar | `POST /offers/:offerId/accept` |
| Recoger | `POST /tasks/:taskId/pickup` |
| Entregar | `POST /tasks/:taskId/deliver` |

Los IDs de ruta se codifican como segmentos. Tanto el cliente online como el
replay reconocen acuses `ok: true` o `success: true`; un 200 sin acuse no confirma
el PIN. No se agregaron URLs productivas ni clientes de red nuevos.

`performSync()` es invocable para pruebas; `initBackgroundSync()` conserva el
intervalo existente de cinco segundos, que solo se crea al invocarlo. El proceso:

1. Comprueba conectividad y un bloqueo local de sincronizacion.
2. Revisa expiracion y existencia de cada accion justo antes de enviarla; logout
   o un cambio de cuenta durante una peticion evita enviar los siguientes PIN.
3. Mantiene recogida antes de entrega para el mismo courier/tarea, incluso si
   la cola llega en orden invertido. Una recogida pendiente o rechazada bloquea
   esa entrega, pero no las tareas independientes. Corregir el PIN y recibir un
   acuse desbloquea la entrega; la correccion tiene un ID nuevo.
4. Envia los PIN al mismo endpoint online con `Idempotency-Key` igual al ID de
   cola, estable entre reintentos. Nunca usa los helpers que volverian a encolar.
5. Solo retira acciones PIN tras acuse. Los 4xx definitivos se marcan `REJECTED`;
   408/429 y fallos transitorios se reintentan hasta diez intentos por accion.
   Un tipo desconocido queda fallido, no se da por sincronizado silenciosamente.
6. Libera el bloqueo con `finally` y conserva `lastSync` como fecha de la ultima
   tanda intentada, aunque hubiera acciones fallidas. No imprime errores Axios
   que pudieran incluir el PIN en su configuracion de peticion.

El bloqueo es de la instancia actual: no coordina dos pestanas. Una clave enviada
por el cliente tampoco garantiza idempotencia en el servidor; el router actual
esta montado antes del middleware general de idempotencia. La verificacion
transaccional, autenticacion de courier y reconciliacion de respuestas perdidas
siguen siendo responsabilidad del backend y deben revisarse antes de usar datos
reales. No se implementa una liquidacion contable desde la cola del navegador.

## Evidencia y limites de verificacion

Comando solicitado, ejecutado sin iniciar aplicaciones:

```powershell
node apps/delivery/scripts/delivery-dispatch.test.mjs
```

Resultado: **38 pruebas, 38 PASS, 0 FAIL, 0 omitidas**. Esto es el 100% de los casos
ejecutados; no se midio cobertura porcentual de lineas.

La suite anterior copiaba las funciones. Ahora transpila en memoria los cuatro
modulos TypeScript de produccion con TypeScript instalado, ejecuta sus acciones
usando el store vanilla y el middleware `persist` reales de Zustand y simula solo
API, reloj, navegador y almacenamiento. El adaptador `create` usa `createStore`;
no monta hooks React. La carga de dependencias esta restringida y ningun timer o
cliente Axios real se inicializa. No se leen `.env` ni se inicia sincronizacion
en segundo plano durante las pruebas.

Se comprueban presencia, privacidad/rehidratacion, expiraciones exactas, formatos,
payloads, CAS/410, trabajo offline, deduplicacion, claves de replay, orden de PIN,
reintentos limitados, errores definitivos, cambio de cuenta, limpieza de codigos
y compatibilidad de los endpoints legacy de entrega y gastos.

Chequeo semantico focalizado de los cuatro modulos: **0 diagnosticos**, usando
declaraciones React ya instaladas y un tipo de API en memoria. El `tsc` completo
de `apps/delivery` no pasa por dependencias/declaraciones locales ausentes
(React, Axios y Capacitor, entre otras); no se instalaron ni repararon paquetes.
No se declara tipada ni verificada visualmente la aplicacion completa.

Pendientes concretos de integracion: conectar los stores y el estado pendiente/
fallido a las pantallas; enriquecer la respuesta backend de ofertas/aceptacion
con los campos de tienda/orden requeridos por la interfaz; persistir/aplicar
`isShared` server-side (el handler de presencia actual no lo guarda). No se
afirma que los mocks prueben estos flujos HTTP reales ni el dispositivo GPS.

No se ejecutaron builds, migraciones, instalaciones, push, despliegues ni llamadas
a servicios; se mantuvieron intactos el original, los secretos y las protecciones.
