# Auditoría combinada — Tokki POS

> Estado final: P0, P1 y P2 corregidos. Evidencia posterior en `07-options-fixed.png`, `08-home-fixed.png`, `09-payment-fixed.png` y `10-tablet-installed.png`.

Fecha: 2026-09-07  
Dispositivo: Hyundai HT8LAB1PBKLTM, Android 11  
Pantalla física: 1280 × 800, densidad 1.5  
Área útil de la WebView: 854 × 462 CSS px

## Alcance

Flujo de venta para llevar: entrada al catálogo, captura de nombre, selección y personalización de producto, carrito, cobro en efectivo y confirmación.

## Fortalezas

- La paleta, las formas y la mascota tienen una identidad Tokki consistente.
- El catálogo y el pedido mantienen una separación visual clara cuando hay espacio suficiente.
- El nombre para llevar está etiquetado y forma parte de los datos de impresión.
- Los cálculos de subtotal, IVA, total, efectivo recibido y cambio funcionan en la vista de prueba.
- Los botones principales tienen áreas táctiles amplias.

## Hallazgos priorizados

### P0 — Bloqueos funcionales

1. La tablet instalada no puede cargar categorías ni productos. Ambas peticiones responden 404 porque el `restaurantId` guardado ya no existe o no es válido en el backend de producción. No se puede iniciar una venta.
2. En el área útil real de 854 × 462, el modal de pago corta el teclado, el cambio y `Confirmar Pago`. El contenedor oculta el exceso, por lo que el cobro puede quedar imposible de completar.
3. `Confirmar Pago` no crea ni sincroniza una orden real: solamente muestra el mensaje “Pago guardado localmente”, intenta imprimir y limpia el carrito. No hay llamada al backend ni escritura en la cola offline.

### P1 — Riesgos altos

4. El botón `Enviar` no tiene ninguna acción conectada.
5. El diseño fue afinado a 1280 × 800 CSS px, pero la Hyundai entrega solo 854 × 462 CSS px por su densidad y las barras del sistema. El encabezado invade el panel del pedido; buscador, impresora y perfil compiten por un ancho que no existe.
6. Los errores de menú se convierten en “No encontramos productos”, lo que parece un catálogo vacío y oculta la falla real. Faltan estado de error, reintento y acceso claro para volver a vincular el negocio.
7. El campo de nombre es obligatorio, pero no hay texto que lo indique ni explicación cuando `Cobrar` está desactivado.

### P2 — Claridad y accesibilidad

8. La personalización coloca toppings y notas debajo del primer pliegue, pero oculta la barra de desplazamiento; no queda claro que hay más opciones.
9. Los títulos de producto se parten o truncan demasiado en el ancho real, reduciendo la velocidad de lectura.
10. Los métodos de pago y opciones no comunican su estado seleccionado con `aria-pressed` o controles semánticos equivalentes. Algunos radios están anidados dentro de botones.
11. Los controles `+`, `−`, borrar y el selector “Para llevar” carecen de nombres accesibles completos. Los tonos pastel y estados desactivados necesitan medición de contraste.
12. La notificación superior tapa temporalmente el encabezado y parte del contexto del pedido en la pantalla baja.

## Recorrido auditado

1. Inicio real en tablet — crítico: aplicación abierta, pero sin catálogo por error de identificación del restaurante.
2. Catálogo a tamaño real — en riesgo: identidad clara, distribución comprimida y encabezado amontonado.
3. Personalización — crítico: contenido importante queda debajo del pliegue sin señal de desplazamiento.
4. Carrito — en riesgo: cálculos correctos, pero poco espacio para varios productos y textos truncados.
5. Pago — crítico: el área inferior del flujo queda cortada en la Hyundai.
6. Efectivo y cambio — parcial: el cálculo funciona, pero la confirmación no persiste una orden real.

## Orden recomendado de corrección

1. Reparar la vinculación con un `restaurantId` válido y mostrar errores de conexión con reintento.
2. Rediseñar para el viewport real 854 × 462, con encabezado compacto y panel de pedido más estrecho.
3. Convertir cobro y personalización en vistas adaptables con acciones siempre visibles y contenido desplazable.
4. Conectar `Enviar` y `Confirmar Pago` al flujo real de órdenes y a la cola offline.
5. Añadir mensajes de validación, estados semánticos y revisar contraste/lectura táctil.

## Límites de evidencia

- La app instalada no permitió auditar ventas con datos reales porque el tenant guardado es inválido.
- La navegación con lector de pantalla, teclado físico y medición automática de contraste requieren pruebas adicionales; no se afirma conformidad WCAG completa.
