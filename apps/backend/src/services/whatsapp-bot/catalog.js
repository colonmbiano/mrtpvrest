// catalog.js — Acceso al menú y helpers de selección para el chatbot.
//
// El menú se presenta numerado (1, 2, 3...) porque en WhatsApp responder con un
// número es mucho más confiable que interpretar lenguaje libre. Cada producto
// con variantes se "aplana": cada variante es una línea seleccionable propia
// (ej. "Pizza (Chica)", "Pizza (Grande)") con su precio efectivo.

const { isPromoWindowOpen } = require('../../lib/promo-window');

// Precio efectivo de un producto sin variante (respeta promociones).
function effectivePrice(item) {
  return item.isPromo && item.promoPrice ? item.promoPrice : item.price;
}

/**
 * Carga el menú activo del restaurante y lo agrupa por categoría.
 * Multi-tenant: filtra SIEMPRE por restaurantId de forma explícita.
 * @returns {Promise<Array<{ id, name, lines: Array<{ menuItemId, variantId, name, unitPrice }> }>>}
 */
async function loadMenu(prisma, restaurantId) {
  const [categories, rawItems, promoOpen] = await Promise.all([
    prisma.category.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.menuItem.findMany({
      where: { restaurantId, isAvailable: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        isPromo: true,
        promoPrice: true,
        categoryId: true,
        variants: {
          where: { isAvailable: true },
          orderBy: { price: 'asc' },
          select: { id: true, name: true, price: true },
        },
      },
    }),
    isPromoWindowOpen(prisma, restaurantId),
  ]);

  // Ventana horaria de promos: fuera del horario, los platillos promo se
  // ocultan del menú del bot (mismo criterio que TPV y tienda).
  const items = promoOpen ? rawItems : rawItems.filter((i) => !i.isPromo);

  // Convierte un producto en sus líneas seleccionables (1 por variante, o 1
  // sola si no tiene variantes).
  const toLines = (item) => {
    if (item.variants && item.variants.length > 0) {
      return item.variants.map((v) => ({
        menuItemId: item.id,
        variantId: v.id,
        name: `${item.name} (${v.name})`,
        unitPrice: v.price,
      }));
    }
    return [{
      menuItemId: item.id,
      variantId: null,
      name: item.name,
      unitPrice: effectivePrice(item),
    }];
  };

  const grouped = categories
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      lines: items.filter((i) => i.categoryId === cat.id).flatMap(toLines),
    }))
    .filter((cat) => cat.lines.length > 0);

  // Productos disponibles sin categoría activa → categoría sintética "Menú".
  const shownItemIds = new Set(
    categories.flatMap((cat) => items.filter((i) => i.categoryId === cat.id).map((i) => i.id))
  );
  const orphanLines = items.filter((i) => !shownItemIds.has(i.id)).flatMap(toLines);
  if (orphanLines.length > 0) {
    grouped.push({ id: '__sin_categoria__', name: 'Menú', lines: orphanLines });
  }

  return grouped;
}

// Interpreta una respuesta como índice 1-based dentro de una lista. Devuelve el
// elemento elegido o null si la entrada no es un número válido en rango.
function pickByNumber(list, text) {
  const n = parseInt(String(text).trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > list.length) return null;
  return list[n - 1];
}

// Parsea una cantidad de unidades (1..50). Acepta dígitos sueltos.
function parseQuantity(text) {
  const match = String(text).trim().match(/\d+/);
  if (!match) return null;
  const n = parseInt(match[0], 10);
  if (!Number.isInteger(n) || n < 1 || n > 50) return null;
  return n;
}

module.exports = { loadMenu, effectivePrice, pickByNumber, parseQuantity };
