# MRTPVREST Delivery v3 — rediseño para Marketplace híbrido

**Estado:** interfaz y contrato de presencia/ofertas actualizados en la rama
`feature/marketplace-hibrido`. No se publicó APK, PWA, OTA ni producción.

## Experiencia de repartidor

La app conserva la autenticación y los flujos de TPV/KDS propios, y estrena
`CourierDashboard` como inicio móvil:

- Cabecera con identidad del repartidor, avisos, cerrar sesión y conectividad real.
- Indicadores de **trabajo actual** (en camino, pendientes de recogida,
  pedidos sin asignar). No se presentan ventas como ganancias del repartidor.
- **Mi ruta:** órdenes de la tienda, estado, detalles, chat, acciones
  de recogida/entrega que reutilizan el flujo existente, y pool sin asignar.
- **Marketplace:** ofertas propias y compartidas, sueldo ofertado en MXN,
  segundos restantes calculados sobre el vencimiento real, refresco y
  conflictos 409/410.
- Accesos móviles a Inicio, Ofertas, Mapa y Caja. Se conservan las pantallas
  anteriores para cobro, PIN, evidencia, incidentes, caja, chat y reportes.
- Diseño de alto contraste, tarjetas táctiles grandes y navegación consistente.

## Contrato del backend corregido

**Presencia**
`POST /api/marketplace/dispatch/couriers/me/presence` acepta
`{courierId, isOnline, lat?, lng?, accuracy?, acceptingShared}`.

La versión anterior enviaba `name`, `isShared` y coordenadas ficticias
`0,0` al activar la red. Esos datos no pertenecen al contrato real.

Ahora conectar con la red compartida solicita permiso del dispositivo
y una ubicación GPS actual. Solo después de un acuse `success: true`
se informa que la conexión está activa; la presencia se renueva
cada 55 s (el ranker backend descarta muestras mayores de 90 s).
Sin GPS o conectividad se muestra error y se pausa localmente. Al
desconectar se envía `acceptingShared: false` y no se generan más muestras.
Si fallara la comunicación, la última muestra del servidor expira por TTL.

**Ofertas**
`GET /api/marketplace/dispatch/couriers/me/offers` devuelve el
contrato **real**: `{id,taskId,payoutAmount,currency,source,expiresAt}`.
La pantalla anterior leía campos no entregados (cliente, comercio,
direcciones, distancia, orderNumber) y podía fallar al pintar.
El nuevo adaptador valida identidad, fuente OWN/SHARED, importe MXN
y vencimiento; la UI no inventa rutas o clientes.

Al aceptar, el backend devuelve `taskId` y `assignment` y es el único que
decide mediante CAS. No se agrega una orden falsa a la ruta del TPV.
Hasta contar con el endpoint enriquecido de asignación, la app muestra
que falta la dirección y pide confirmación con operaciones antes de salir.

## Lo que falta antes de aceptar repartidores reales externos

1. **Identidad:** actualmente la app exige QR/PIN de una sucursal.
   Crear onboarding y autenticación de courier independiente del tenant,
   validación de documentos, vehículo, estado y afiliaciones.
2. **Ruta enriquecida:** exponer exclusivamente al courier asignado
   punto de recogida, comercio, destino autorizado, contacto mínimo,
   ETA y detalles de su tarea. Ofertas previas requieren información
   suficiente para decidir sin exponer datos privados indebidamente.
3. **Multi-comercio:** permitir agrupación de dos o más recogidas con
   secuencia validada en el backend y estados por cada suborden; hoy el
   Marketplace agrupa carritos y el despacho asigna una tarea a la vez.
4. **Presencia productiva:** guardar estado en infraestructura persistente,
   permisos GPS/Capacitor e indicadores de disponibilidad reales, con
   conciliación al recuperar conexión o cerrar sesión.
5. **Finanzas:** integrar ganancias netas y liquidaciones verificadas en
   ledger por marketplace vs tienda. El dashboard intencionadamente no
   asume que el importe de venta pertenece al repartidor.
6. **Fin a fin:** staging independiente, pruebas E2E de ofertas + recogida
   PIN + entrega PIN + incidencia, cálculos de efectivo, offline y reintentos.

## Comprobaciones

- Suite `node apps/delivery/scripts/delivery-dispatch.test.mjs`: 47 casos PASS
  después de actualizar los contratos de pruebas a los del router real.
- Comprobación TypeScript aislada: 0 diagnósticos en los cuatro archivos
  tocados de runtime y sus dependencias importadas.
- Transpilación de `page.tsx`, `CourierDashboard.tsx`,
  `MarketplaceOffers.tsx`, `marketplaceDispatch.ts`: 0 errores.
- No se ejecutaron builds Android, instalaciones, migraciones ni despliegues.
