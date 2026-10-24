# Primer pedido local — Master Burguer's y Tokki Boba

## Estado
**Pedido de PRUEBA funcional en la PC. No es un pedido productivo.**

Esta etapa habilita una experiencia end-to-end verificable sin crear
clientes, órdenes, cobros, movimientos de inventario o trabajos KDS/TPV
en la base real.

### Recorrido
1. Visitar el Marketplace local en `http://127.0.0.1:4103/`.
2. Pulsar **Armar pedido de prueba** en Master Burguer's o Tokki Boba.
3. En `/comercio/master-burguer-s` o `/comercio/tokki-bobba`,
   elegir tamaños y modificadores y agregar al carrito.
4. Revisar total y pulsar **Crear primer pedido de prueba**.
5. POST `/api/pedido-prueba` vuelve a consultar el menú público,
   valida artículos, cantidades, variantes y modificadores y recalcula
   los importes en centavos.
6. Se guarda una instantánea inmutable sin datos personales en
   `.marketplace-local/pedidos-prueba/<id>.json`, excluido de Git.
7. `/pedido-prueba/<id>` presenta comprobante, total y detalle.

### Datos y límites
- GET exclusivamente de la API pública del storefront:
  `https://api.mrtpvrest.com/api/store/info?r=<slug>` y
  `https://api.mrtpvrest.com/api/store/menu?r=<slug>`.
- Slugs permitidos: `master-burguer-s` y `tokki-bobba` solamente.
- No usar API keys, credenciales de tienda, conexión PostgreSQL, redis,
  teléfonos, domicilios, datos de pago ni cookies productivas.
- El catálogo y los importes cambian según lo publicado en cada tienda.
- Si un producto requiere variantes/modificadores, el checkout de prueba
  debe seleccionar las opciones válidas. No simular combos no soportados.
- El checkout simula únicamente recogida y no implementa reparto.
- Prohibido convertir una orden de prueba en pedido real automáticamente.

### Protecciones de entorno
Los pedidos de prueba se niegan si no se cumplen **TODAS** estas condiciones:
- `NODE_ENV=development`
- `NEXT_PUBLIC_MARKETPLACE_ISOLATED=true`
- `MARKETPLACE_LIVE_PREVIEW=true`
- Host y URL local loopback (localhost/127.0.0.1).
- Origin exacto del mismo Host para POST.

La bandera `MARKETPLACE_LIVE_PREVIEW` solo está en el
`apps/client/.env.local` ignorado y **nunca** se debe habilitar en
Vercel Preview o producción.

### Validaciones ejecutadas
- `pnpm --filter @mrtpvrest/client run type-check`: OK.
- ESLint específico de las nuevas rutas/componentes: OK.
- `node --test apps/client/scripts/marketplace-first-order.test.mjs`:
  5 pruebas aprobadas.
- Prueba HTTP local end-to-end: 2 Matcha Milk Tea de 12 oz con tapioca,
  total $150.00 MXN, folio de prueba emitido, comprobante renderizado.
- Petición POST de origen externo: 403.
- Cantidad 999: 400.
- Precio cliente falsificado: ignorado; precio recalculado.
- **No se hizo ningún POST a endpoints de órdenes reales**.

### Antes de permitir el primer pedido REAL
1. Crear PostgreSQL de staging y aplicar migraciones allí; comprobar
   aislamiento tenant y reversibilidad. No utilizar datos ni secretos
   de Master/Tokki de producción.
2. Integrar registro/autenticación real de compradores y consentimiento.
3. Checkout productivo transaccional con variantes y modificadores,
   impuestos, envío, horarios y stock; idempotencia y control de concurrencia.
4. Confirmar merchant ID y ubicación, y publicación autorizada de negocios.
5. Conectar creación de orden, TPV/KDS, aceptación por negocio y seguimiento
   sobre infraestructura de staging; pruebas de fallos y reintentos.
6. Activar repartidores propios/compartidos y asignación con aceptación, GPS
   y PIN de entrega con autorización multi-tenant.
7. Configurar pagos en sandbox, webhooks firmados, liquidaciones, contracargos
   y prueba de cancelaciones/reembolsos.
8. Realizar E2E de la compra en staging con el negocio y luego habilitación
   progresiva en producción bajo aprobación explícita del titular.

No utilizar el simulador como evidencia de que un pedido real llegó a cocina.

## Carrito multi-tienda — actualización

El Marketplace local permite **un único carrito compartido entre Master Burguer's
y Tokki Boba**. Al visitar la segunda tienda, los productos de la primera
permanecen en el mismo carrito mediante almacenamiento local del navegador.
Hay una sola confirmación de prueba.

- Página tienda: `/comercio/master-burguer-s` y `/comercio/tokki-bobba`.
- POST `/api/pedido-prueba-multi` (solo desarrollo, loopback + origen válido).
- El servidor vuelve a consultar los dos menús públicos, calcula todas las
  líneas en centavos e impide productos cruzados de otros comercios.
- Una única escritura JSON con exclusión de colisiones:
  `.marketplace-local/pedidos-prueba/multi-<id>.json`.
  Guarda una compra padre con ID aleatorio y una orden hija (ID independiente)
  por tienda; si alguna tienda falla **no se guarda nada**.
- El comprobante conjunto está en `/compra-prueba/<id>`; desglosa subtotal
  y líneas por negocio, además del total de productos.
- Reglas del prototipo: máximo dos negocios permitidos, 25 líneas diferentes
  en la compra, 15 por tienda y 10 unidades por línea.
- Los importes que muestra el navegador son informativos; el servidor calcula
  otra vez precios y promociones usando los menús públicos antes de confirmar.
- No se calcula envío, no hay pagos, no hay cancelaciones/reparto reales y las
  órdenes no llegan al TPV/KDS ni a ningún restaurante.
- La activación productiva requerirá órdenes por merchant en PostgreSQL,
  transacciones y saga/idempotencia, autorización y validación de ubicación,
  estados independientes, repartidores y políticas de pagos/reembolsos.

Pruebas: `node --test apps/client/scripts/marketplace-multi-order.test.mjs`
y script local ignorado `.marketplace-local/test_multi_purchase.py`. Casos
cubiertos: carrito por dos negocios, subtotales independientes, promoción
actual, variaciones, solicitud sin precio de confianza, validación de
producto y merchant, falla de cualquiera de las tiendas, no persistencia
parcial y comprobante de compra agrupada.

### Validación visual del carrito multi-tienda
- Chrome/Playwright: añadir hamburguesa en Master, ir a la portada,
  comprobar acceso al carrito persistido, volver a Master, navegar a Tokki,
  añadir Matcha Milk Tea con tapioca y completar checkout.
- El recibo local confirmó ambos negocios y dos órdenes hijas.
- Prueba HTTP: `POST /api/pedido-prueba-multi` devolvió 201,
  subtotal Master $199, subtotal Tokki $150, total $349.
- Solicitud CSRF desde otro Origin: 403; cantidad inválida y tienda
  desconocida: 400.
- Captura y scripts E2E quedan en `.marketplace-local/`, fuera de Git.
