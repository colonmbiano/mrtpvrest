# Costeo y empaques por pedido

## Implementado en esta rama

- GET /api/recipes y GET /api/recipes/by-menu-item/:id incluyen subrecetas anidadas, rendimiento, merma y alertas de costos incompletos.
- POST /api/recipes/packaging-preview (admin) calcula consumo y costos con empaques reales por pedido. No modifica inventario ni históricos.
- Body: lines [{recipeId, quantity}], packaging [{ingredientId, quantity}]. Las cantidades de packaging son absolutas por pedido, reemplazan el consumo base del insumo y aceptan cero.
- Dos volcanes: lines con quantity2; packaging con hamburguesero0, charola7x7 cantidad1 y bolsa1. Los dos papeles permanecen. Burrito con papas: misma sustitución para una pieza; el aluminio permanece.
- Empaques requieren isPackaging=true y baseUnit=PIECE; cantidades enteras. IDs de recetas e insumos se resuelven solo en el restaurante autenticado.

## Empaques en pedidos del TPV

- DINE_IN excluye todos los insumos marcados `isPackaging`, incluidos los contenidos en subrecetas y extras. Sí consume alimentos, salsas y guarniciones. La validación de existencias sigue la misma regla. TAKEOUT y DELIVERY conservan el empaque de su receta.
- En Tickets > Empaques, se muestran las cantidades consumidas por todo el pedido. Cambiar una caja por una charola requiere caja 0 y charola 1; las bolsas se capturan por pedido. La agrupación física la decide quien despacha, sin inferirla de notas libres.
- GET /api/orders/:id/packaging devuelve cantidades, costo registrado y revisión del pedido. PUT recibe `{revision, packaging:[{ingredientId, quantity}]}`. Cada cantidad enviada reemplaza ese insumo; los no enviados conservan su consumo.
- Los insumos por PIECE requieren enteros; GRAM/ML se capturan en su unidad de inventario. No convertir centímetros de aluminio a gramos sin una equivalencia medida.
- El descuento base se registra al crear el pedido/ronda. Guardar empaques ajusta solo la diferencia en una transacción con bloqueo del pedido, movimientos y costos por producto. Reintentar el mismo plan no duplica consumo. Los costos de compras posteriores no revalúan lo ya consumido.
- Para pedidos remotos que aún no registraron inventario, el panel ofrece **Registrar consumo del pedido** (POST /:id/packaging/initialize). Usa las recetas de sus productos, extras y componentes. Esta acción descuenta insumos; abrir el panel no lo hace.
- Cambiar una cuenta abierta entre mesa y llevar reconcilia sus empaques. Las rondas usan el tipo persistido del pedido.
- Cancelar repone el consumo neto registrado, incluidos ajustes; reintentos se serializan. Este flujo supone empaques recuperables: el registro de desechables ya usados como merma sigue siendo operativo.
- El ajuste actualiza `costSnapshot` de los productos afectados sin cambiar precios o total del cliente. Un empaque compartido nuevo se atribuye a la primera línea elegible; la contribución exacta se evalúa por pedido, no por la línea individual que recibió esa bolsa/charola.
- Si falla la conexión, el TPV conserva un borrador local; el operador debe reintentar al recuperar conexión. El servidor rechaza una revisión vieja con cambios distintos. No se confirma inventario offline.

## Límites actuales

- Los pedidos entregados/cancelados no admiten ajustes desde este panel. No se corrigen ventas históricas automáticamente.
- Cuentas divididas/transferidas con movimientos que ya no corresponden a sus líneas quedan bloqueadas para ajuste: requieren reconciliar su inventario. No se inventa una distribución entre tickets.
- El stock de una receta incompleta sigue siendo parcial; costo cero no confirma una receta completa. Falta mostrar todas las advertencias de costeo en la interfaz.
- La selección de combinaciones del 3x2 de alitas/boneless es un cambio independiente.
- No aplicar indirectos como consumo físico. Mantener correctamente la clasificación `isPackaging` de los insumos.

## Manual reutilizable para restaurantes

- Descarga desde Inventario > Recetas, en escritorio y móvil: `/manuales/manual-costeo-recetas.pdf`.
- Fuente de consulta: `docs/manuales/manual-costeo-recetas.md`.
- Fuente de edición y generación: `docs/manuales/generar_manual.py` (Python 3 + ReportLab).
- Regenerar desde la raíz con `python3 docs/manuales/generar_manual.py`; revisar visualmente el PDF y commitear ambos resultados.
- Los ejemplos son ficticios. No incorporar exports de restaurantes, tickets, identificadores, precios privados ni datos de empleados.
- La guía distingue reglas operativas de automatizaciones todavía pendientes. Actualizar su alcance cuando se conecte el simulador con ventas e inventario.
