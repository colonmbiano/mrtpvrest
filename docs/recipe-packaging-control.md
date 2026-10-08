# Costeo y empaques por pedido

## Reglas operativas

- Las mesas consumen alimentos y salsas, sin los insumos marcados `isPackaging`. Para llevar y domicilio usan los empaques de receta.
- Un producto marcado `MenuItem.isPackagingProduct` representa un desechable **vendido aparte**. Su receta consume su propio contenedor incluso en mesa. No debe contener alimentos, ni duplicar un platillo. Se vende por pieza.
- Disponibilidad del extra: `isAvailable=true`, `availableOnline=false`, `availableOnKiosk=false` para venta exclusiva desde el TPV del local.
- Abrir un pedido, agregar rondas o guardar su plan de empaques **no descuenta inventario**. El consumo, los movimientos y el costo histórico se registran en la misma transacción que marca el pedido pagado.
- Después de pagar, los extras se venden en un ticket nuevo. No se vuelve a cobrar ni descontar la comida del ticket anterior.

## Panel del TPV

En Tickets > Empaques y en el cobro de un pedido ya sincronizado, se revisan cantidades antes de pagar. Dos volcanes pueden compartir una charola: hamburgueseros 0, charola 1; se conservan los papeles. Las bolsas se cuentan por pedido.

`GET /api/orders/:id/packaging` devuelve cantidades previstas, extras vendidos por separado, costo y revisión. `PUT` recibe `{revision, packaging:[{ingredientId, quantity}]}`. Guarda cantidades absolutas en `Order.packagingPlan`, sin tocar stock ni el total del cliente. Los extras vendidos son adicionales y no se pueden anular desde este panel.

Las piezas requieren enteros; GRAM/ML usan la unidad de inventario. La receta, la sucursal y los insumos se validan en el restaurante autenticado. Una revisión vieja con cambios distintos se rechaza. Si cambian los productos, cantidades o recetas, se invalida el plan anterior y se recalculan los empaques de receta; el panel avisa para revisarlos.

Sin conexión se conserva el borrador local para reintentar; no se confirma consumo offline. Un pedido nuevo que se crea y cobra en una sola operación usa sus recetas. Para agrupar empaques manualmente primero debe estar guardado/sincronizado como pedido abierto.

## Integridad al cobrar

- Cobro directo TPV, pago mixto, confirmaciones de caja, cuenta de empleado, terminal y pagos verificados de tienda/kiosco/delivery llaman al mismo servicio.
- El bloqueo del pedido y los `costSnapshot` existentes evitan aplicar otra vez sus recetas. Los pedidos antiguos con consumo previo conservan lo ya registrado y no permiten editar empaques desde este panel.
- El stock insuficiente revierte una operación de caja cuando la configuración lo exige. Un pago ya confirmado por una pasarela registra la existencia real, incluso negativa: no se puede rechazar retroactivamente el dinero ya cobrado. Un fallo técnico devuelve error para que la pasarela reintente.
- Las cancelaciones reponen el consumo neto registrado, sin recalcular recetas actuales. Los empaques usados que no se recuperen deben registrarse como merma operativa.
- La agrupación conserva el costo total del pedido. Un empaque sustituto sin presencia en las recetas se atribuye a la primera línea de comida; no se reparte sobre los extras vendidos.
- No se reconsumen ventas históricas importadas. No aplicar nómina, renta u otros indirectos como consumo físico.

## Migración y configuración

La migración aditiva agrega `MenuItem.isPackagingProduct` (false por defecto) y `Order.packagingPlan` (nullable). Se despliega con Prisma y es compatible con el código anterior. Después del despliegue se deben marcar explícitamente los productos extra existentes; nunca inferir la excepción por nombre o por una receta incompleta.

## Costeo y manual

`GET /api/recipes` y `/by-menu-item/:id` incluyen subrecetas anidadas, rendimiento, merma y alertas de costos incompletos. `POST /api/recipes/packaging-preview` es un simulador de costos, sin escrituras de stock.

El manual descargable está en Inventario > Recetas (`/manuales/manual-costeo-recetas.pdf`). Sus ejemplos son ficticios; no publicar datos de restaurantes ni empleados. Sus fuentes están en `docs/manuales/`. Este documento describe el alcance actualizado de la integración con pedidos.

La selección de combinaciones del 3x2 de alitas/boneless es un cambio independiente. Una receta incompleta sigue produciendo costos y consumos parciales; costo cero no acredita que esté completa.
