# Consumo de modificadores por producto

El mapeo global por nombre no distingue las porciones de productos diferentes.
Un mapeo con `menuItemId` reemplaza todas las filas globales de ese nombre para
ese producto; no se suman ambos. Sin mapeo propio se conserva el global.

El mismo resolvedor sirve al chequeo de existencias y al consumo al cobrar.
Solo se interpreta el prefijo de cantidad cuando el ID del modificador sigue
perteneciendo a un grupo QUANTITY de ese producto y restaurante. Las etiquetas
ADD que empiezan con números conservan su nombre completo. Los modificadores
eliminados sin ID conservan la búsqueda exacta del nombre guardado; no se infiere
una cantidad a partir del texto libre.

## Administración

- GET /api/recipes/modifiers conserva el catálogo global.
- GET /api/recipes/modifiers?menuItemId=ID devuelve el consumo efectivo del producto,
  con `inherited` indicando si usa el global.
- POST /api/recipes/modifiers acepta `{ name, menuItemId, items }`.
  Omitir menuItemId o enviarlo null edita exclusivamente el global.
  items vacío elimina el mapeo de ese ámbito y restablece la herencia global.
- Se validan restaurante, pertenencia del modificador y unidades de insumos/subrecetas.
- El editor visual actual sigue editando el global. La configuración por producto
  está disponible mediante la API administrativa; no aparece aún como selector en UI.

Las recetas base duplicadas se consultan y editan prefiriendo la activa. No se
reactivan automáticamente las archivadas ni se modifican sus ingredientes.

## Publicación

1. Aplicar la migración aditiva y regenerar Prisma.
2. Publicar el backend y verificar que todos los procesos usan el nuevo resolvedor.
3. Cargar por API las porciones confirmadas por producto.
4. Comprobar una simulación y un cobro de prueba controlado, incluidas cantidades
   de grupos QUANTITY, pre-check y cancelación.

No cargar filas con menuItemId mientras existan procesos de la versión anterior:
esa versión las trataría como globales. Tampoco volver a un backend anterior
con esas filas activas. Retirar primero los mapeos por producto si se revierte.
La migración no carga datos de ningún negocio, y este cambio no reescribe costos
históricos ni movimientos de ventas ya registradas.

La activación permanece pendiente de los gates de publicación del PR de inventario.
Las porciones no confirmadas y los productos sin receta deben permanecer pendientes.
