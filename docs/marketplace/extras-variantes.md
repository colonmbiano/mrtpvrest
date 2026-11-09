# Variantes y extras en el Mercadito (C4)

Corte: 9 de noviembre de 2026. Antes, el Mercadito solo vendía productos simples: cualquier producto con
variantes o con grupos de modificadores obligatorios desaparecía del catálogo, y los extras opcionales se
ignoraban. Ahora se venden con el precio que calcula el servidor.

## Qué se vende

| Producto | Mercadito |
| --- | --- |
| Simple | Sí |
| Con variantes (Sencilla, Doble…) | Sí |
| Con modificadores (extras, sin cebolla, salsas) | Sí, obligatorios y opcionales |
| Combo | No |
| Venta por peso | No |
| Complementos (`complement:` en el carrito) | No; el checkout usa el camino de la tienda |

## Reglas de precio (`apps/backend/src/lib/marketplace-item-options.js`)

- El comprador solo manda ids: `{ menuItemId, quantity, variantId?, modifierIds? }`. Cualquier campo de precio se
  rechaza.
- La variante reemplaza el precio del producto, como en la tienda en línea. Agotada o ajena: 409.
- Cada modificador debe ser del producto y estar disponible. Por grupo: mínimo = 1 si es obligatorio o
  `minSelection`; máximo = `maxSelection`, o 1 si el grupo no es de selección múltiple. Solo los grupos
  `QUANTITY` aceptan repetir una opción ("2 Salsa verde").
- `freeModifiersLimit`: las primeras N opciones del grupo no cobran, las más baratas primero (la misma regla que
  `lib/money.js` en el TPV). La tienda en línea hoy cobra todas; por eso la cotización puede salir más barata que el
  carrito, y el cliente paga la cotización.
- Un mismo producto puede ir en varias líneas con opciones distintas; la misma configuración dos veces se rechaza.

## Dónde queda

- Cotización: `items[].variantId` y `items[].modifiers` (nombre y precio agregado) en la respuesta.
- Pedido: el nombre lleva la variante ("Hamburguesa (Doble)") y cada modificador es un `OrderItemModifier`, así que
  el TPV y la cocina lo ven igual que un pedido de la tienda. Si un modificador se borra del menú entre la
  cotización y la orden, se guarda con su nombre y precio y sin enlace (`modifierId` nulo).
- Catálogo público v1 (`/api/marketplace/v1/merchants/:slug/catalog`): `variants` (disponibles, con precio) y
  `modifiers` con `min`, `max`, `freeCount` y `repeatable`.
- Cliente: `apps/client/src/lib/marketplaceV1Checkout.ts` manda variante y modificadores; sigue mandando al
  checkout normal los carritos con combos, complementos o productos por peso.

## Evidencia

- `apps/backend/scripts/marketplace-item-options.test.cjs` 9/9; `marketplace-quote` 51/51;
  `marketplace-order-orchestrator` 59/59 (nueva: pedido con variante, extras y un modificador borrado);
  `marketplace-v1-prisma` 17/17; `marketplace-merchants-v1` 21/21; cliente `marketplace-checkout` 80/80; `tsc` del
  cliente sin errores; jest del backend 954/954.
- PostgreSQL 16 desechable con el guard en ENFORCE: catálogo real con variantes y grupos, cotización
  129 + queso gratis + tocino 20 = 149.00, pedido con `OrderItemModifier` y modificador borrado sin enlace.
- Pendiente: probar en navegador un pedido con extras de punta a punta (tienda → TPV → cocina).
