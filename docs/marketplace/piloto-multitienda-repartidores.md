# Piloto controlado de rutas agrupadas (2–4 tiendas)

**Rama:** `feature/marketplace-hibrido`
**Alcance:** código local y pruebas offline. **NO hay reparto productivo ni APK.**

## Qué se implementó

Una compra multi-comercio debe disponer de una identidad de checkout
única `checkoutGroupId`, varias órdenes secundarias y una tarea de despacho
por tienda. Un **único repartidor** puede aceptar el lote completo y recoger
cada paquete por separado. La entrega al cliente se confirma una sola vez
con un PIN común del checkout.

Secuencia:

1. Comercio confirma su orden como `READY`; despacho normal la coloca
   en `OFFERING` con `dispatchMode: SHARED`.
2. Operador de plataforma autenticado (`SUPER_ADMIN`) agrupa **de 2 a 4
   tareas de tiendas diferentes** mediante `POST /ops/multi-trips`.
3. Verificación server-side de todas las tareas y órdenes:
   mismo `checkoutGroupId`, cliente, destino y hash del PIN final;
   tenant correcto, tienda con `allowMultistopShared=true`, política
   que acepta compartidos, órdenes listas, ubicaciones/PIN válidos y
   ninguna asignación activa.
4. Se crea una oferta multi-stop, con TTL (10–120 segundos), tarifa
   **ofrecida**, número de recogidas y sin revelar cliente/destino.
5. Repartidor con sesión `DELIVERY`, afiliación compartida, presencia
   GPS vigente y disponibilidad acepta todas las tareas de forma
   síncrona mediante un CAS **en un único proceso**.
6. Se publican las direcciones de recogida solamente al repartidor
   asignado. Cada parada exige PIN de recogida propio. El estado
   `ON_THE_WAY` se aplica **solo a la orden de la tienda recogida**.
7. Cuando están confirmadas todas las recogidas, el cliente/destino
   queda disponible para esa asignación.
8. PIN de entrega del checkout valida la entrega conjunta. Las órdenes
   subordinadas pasan a `DELIVERED`, junto con el estado de sus tareas.
   Repetir una entrega no duplica estados.

Los estados de las órdenes de Master y Tokki **siguen separados**, aunque
la compra del cliente tenga un checkout unificado y un único repartidor.
No se registra liquidación financiera: `payoutAmount` es oferta, no pago.

## API de staging

Prefijo montado por el backend:
`/api/marketplace/dispatch`

| Actor | Método y recurso |
|---|---|
| SUPER_ADMIN | POST `/ops/multi-trips` |
| Courier | GET `/couriers/me/multi-offers` |
| Courier | POST `/couriers/multi-offers/:offerId/accept` |
| Courier asignado | GET `/couriers/me/multi-trips` |
| Courier asignado | POST `/couriers/multi-trips/:tripId/stops/:taskId/pickup` |
| Courier asignado | POST `/couriers/multi-trips/:tripId/deliver` |

`pickup` y `deliver` exigen `expectedVersion` y PIN de 4–6 dígitos.
No aceptar los PIN offline ni guardar estos códigos en localStorage.
El frontend consume `marketplaceMultiStop.ts` y muestra el recorrido
en `MultiStopPanel` desde la pestaña Marketplace de la app Delivery.

**Bloqueo de producción (fail-closed):** el router registra estas rutas
solo con `NODE_ENV != production`, `MARKETPLACE_IDENTITY_MODE=staging`
y `MARKETPLACE_MULTISTOP_STAGING_ENABLED=true`. La app presenta las
acciones únicamente con `NEXT_PUBLIC_MULTISTOP_PILOT=true`.
No activar estas banderas en los servicios productivos.

Para el futuro staging, las credenciales y la base deberán ser exclusivas.
Los IDs de pedido y las claves hash se originarán exclusivamente en el
backend; **no existe endpoint público que acepte o genere PIN de checkout**.
Las órdenes simuladas de `apps/client` NO alimentan este motor de despacho.

## Límites: por qué todavía no es reparto real

- El almacén actual de `marketplace-dispatch` usa `Map` en memoria,
  no Prisma/PostgreSQL ni bloqueo interproceso. El CAS solo es atómico
  dentro de **un proceso Node**. Si se reinicia se pierde la asignación.
- Falta incorporar `checkoutGroupId`, hash del PIN común y permiso de
  multistop en el pipeline persistente de compra y esquema migrado.
- Falta idempotencia persistente y auditoría de cambios en BD, outbox,
  recuperación de rutas, conciliación de pago/cash, reembolsos y
  notificaciones confiables a TPV/KDS por cada tienda.
- El login actual de Delivery sigue atado a QR/PIN de sucursal.
  Repartidores independientes necesitan identidad/verificación
  separados, permiso de acceso a tareas y onboarding completo.
- Se necesita validación física de distancias, tiempos de preparación,
  capacidad de transporte, política de alimentos y compatibilidad de
  ruta antes de aprobar agrupaciones. No se optimizan rutas automáticamente.
- Las pruebas offline no equivalen a QA en Android/Capacitor,
  geolocalización real, operación de calle ni flujos de dinero.

## Evidencia

Ejecutar desde la raíz, sin conexiones externas:

`node --test apps/backend/scripts/marketplace-multistop.test.cjs`

La suite recorre preparación, creación, verificación multi-tenant, oferta,
aceptación competitiva, privacidad, caducidad, GPS, PIN por tienda,
desbloqueo del destino, PIN final, reintentos y bloqueos de producción.
También comprobar los tests existentes de despacho y la comprobación
semántica de TypeScript en el workspace de Delivery.

No se ejecutaron migraciones, seeds, builds APK ni cambios productivos.
