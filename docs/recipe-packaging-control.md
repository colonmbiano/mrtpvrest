# Costeo y empaques por pedido

## Implementado en esta rama

- GET /api/recipes y GET /api/recipes/by-menu-item/:id incluyen subrecetas anidadas, rendimiento, merma y alertas de costos incompletos.
- POST /api/recipes/packaging-preview (admin) calcula consumo y costos con empaques reales por pedido. No modifica inventario ni históricos.
- Body: lines [{recipeId, quantity}], packaging [{ingredientId, quantity}]. Las cantidades de packaging son absolutas por pedido, reemplazan el consumo base del insumo y aceptan cero.
- Dos volcanes: lines con quantity2; packaging con hamburguesero0, charola7x7 cantidad1 y bolsa1. Los dos papeles permanecen. Burrito con papas: misma sustitución para una pieza; el aluminio permanece.
- Empaques requieren isPackaging=true y baseUnit=PIECE; cantidades enteras. IDs de recetas e insumos se resuelven solo en el restaurante autenticado.

## Pendiente para activar en ventas

Esta rama es una base de backend y simulador. NO automatiza inventario ni cobro de pedidos.

1. Agregar selector de presentación, grupo compartido y bolsas utilizadas en TPV. Persistir plan estructurado y versionado por orden.
2. Integrar el mismo plan en assertStockAvailable y discountInventory, incluyendo combos, modificadores, rondas y pedidos offline.
3. Congelar costo al cobrar; cancelaciones restauran movimientos reales.
4. Verificar idempotencia, cancelación, split de cuentas y aislamiento multi-tenant antes del despliegue.
5. Mostrar costWarnings en UI; un precio cero no confirma una receta completa.

No interpretar notas libres para decidir empaques; no aplicar indirectos como consumo físico.

## Manual reutilizable para restaurantes

- Descarga desde Inventario > Recetas, en escritorio y móvil: `/manuales/manual-costeo-recetas.pdf`.
- Fuente de consulta: `docs/manuales/manual-costeo-recetas.md`.
- Fuente de edición y generación: `docs/manuales/generar_manual.py` (Python 3 + ReportLab).
- Regenerar desde la raíz con `python3 docs/manuales/generar_manual.py`; revisar visualmente el PDF y commitear ambos resultados.
- Los ejemplos son ficticios. No incorporar exports de restaurantes, tickets, identificadores, precios privados ni datos de empleados.
- La guía distingue reglas operativas de automatizaciones todavía pendientes. Actualizar su alcance cuando se conecte el simulador con ventas e inventario.
