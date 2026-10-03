# Promo 10 Tacos — Master Burguer's

Producto activado por instrucción del usuario el 2 de octubre de 2026 en `master-burguer-s`, categoría Tacos:
`0b1a54a4-f709-4318-91d9-a0d8fb4c0a59`.

Precio base: $250. Descripción: «Arma tu orden con 10 tacos. Puedes combinarlos entre Pastor, Chuleta y Campechano.»

Grupo `Elige tus 10 tacos`, tipo `QUANTITY`, requerido, mínimo y máximo 10.
Pastor, Chuleta y Campechano cuestan $0 adicionales. Pastor está habilitado en
este grupo por instrucción del usuario; su disponibilidad en el taco individual
se conserva.

TPV, captura de meseros y tienda permiten cantidades, muestran el total y tienen
atajos para elegir diez unidades del mismo guiso. Cada unidad viaja como una
ocurrencia del ID del modificador. El servidor valida la suma y disponibilidad
y guarda un desglose compacto: `4 Pastor`, `3 Chuleta`, `3 Campechano`.
La cantidad de la línea representa paquetes, cada uno con esa combinación.
No se necesitan columnas ni migraciones nuevas.

## Publicación pendiente

Publicar backend, TPV y tienda juntos antes de habilitar el producto. Las
versiones anteriores del selector sólo permiten elegir cada opción una vez.
Disponibilidad y venta online ya están habilitadas por instrucción del usuario; el soporte de cantidades continúa pendiente de publicación.
Kiosco permanece deshabilitado porque su configurador no incluye cantidades.
Comprobar una orden 4/3/3 y una orden de dos paquetes en TPV, tienda y KDS.
El desglose utiliza los modificadores existentes en las órdenes; la verificación
visual de KDS e impresión sigue pendiente.

## Validación realizada

- Backend: 12 pruebas de cantidades y resolución de combos.
- TPV: 8 pruebas de cantidades y desglose de combos.
- TypeScript de TPV y tienda sin errores.
- Sintaxis de las rutas backend modificadas correcta.

Script de creación: `node apps/backend/scripts/setup-master-taco-promo.js` muestra
el plan; `--apply` crea un borrador inactivo y rechaza duplicados.

## Revisión de continuidad — 2 de octubre de 2026

Se consultó el catálogo conectado y se confirmó un único `Promo 10 Tacos` en
Tacos, precio 250, disponible en TPV y online. Grupo requerido `QUANTITY` con
mínimo/máximo 10; Pastor, Chuleta y Campechano disponibles, sin cargo adicional.
No se ejecutó el script de creación ni se modificaron datos o esquemas: el
producto ya existía. No se crearon productos para combinaciones individuales.

Se corrigió la firma de protección contra pedidos repetidos de la tienda para
incluir el nombre guardado con cantidades: 4/3/3 y 3/4/3 ya no se confunden.
El TPV prioriza el nombre guardado de la selección sobre el nombre del catálogo
al mostrar pedidos enviados y al imprimir cancelaciones, conservando el desglose.
La tienda exige el total del grupo de cantidades incluso si todos los guisos
están agotados. KDS muestra `item.modifiers[].name`, que contiene el desglose
compacto generado por backend; no requiere migración.

En esta revisión pasaron cinco pruebas backend de cantidades y dos del TPV.
La publicación y la comprobación visual de una orden real en KDS/impresora
siguen pendientes; esta revisión no realizó despliegues ni generó ventas.

## Publicado — 2 de octubre de 2026, hora de México

La publicación pendiente descrita arriba quedó resuelta para el commit
`f067eceb9d56620dd4ad7b619a2ae3fdb0017b79` en `master`.

- Backend Railway: `89f7efb9-2bca-46a2-bfc7-4bce59d08036`, SUCCESS; `/health` HTTP 200.
- TPV Vercel: `dpl_DDQ52VLTY5RchWFkphfEeoiwRsME`, READY, `https://tpv.mrtpvrest.com`.
- Tienda Vercel: `dpl_uGBfUoTY4pbEcWLkXuhVRQSfnEv8`, READY, `https://master-burguer-s.mrtpvrest.com`.
- OTA Android producción: versión `0.2.473`, publicada por el workflow del mismo commit;
  comprobada en `/api/ota/check`. Checksum SHA-256:
  `f03e9adcdc968f7917454dfd09de0577bd0f652c41a185b8df6de06966849cbb`.
- CI Backend: 76 suites y 635 pruebas aprobadas. CI TPV, tienda y APK Android: success.

Comprobación en la tienda publicada: los tres accesos rápidos completan 10;
con 9 se bloquea agregar; la mezcla 4 Pastor / 3 Chuleta / 3 Campechano suma
10 y aparece desglosada en el carrito por $250. Se retiró el carrito de prueba
sin confirmar ventas ni enviar comandas.

Se compactó también la presentación del carrito TPV y la comanda local para
mostrar las cantidades, conservando los diez IDs en el payload. La firma
anti doble envío de TPV incluye el desglose guardado igual que la tienda.
No se agregaron migraciones ni se modificó el catálogo durante la publicación.
La instalación efectiva de OTA en cada tablet y la impresión física/KDS con
una orden real requieren comprobación en el establecimiento.
