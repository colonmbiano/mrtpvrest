// upsell.js — Sugerencias de venta del chatbot ("¿le agregas unas papas?").
//
// Antes del checkout, el motor pide una oferta aplicable. La regla solo apunta
// a un (menuItemId, variantId): el nombre y el precio se resuelven contra el
// menú VIVO (misma fuente de verdad del bot) — si el producto ya no está
// disponible, la regla simplemente no se ofrece. Las métricas por regla
// (ofrecidas, aceptadas, ingresos) se actualizan aquí.

// Clave de línea de carrito (producto+variante) para comparar contra reglas.
function lineKey(menuItemId, variantId) {
  return `${menuItemId}:${variantId || ''}`;
}

/**
 * Elige la oferta de upsell aplicable al carrito, o null si no hay.
 * Rota entre reglas (las menos ofrecidas primero) e incrementa offerCount.
 *
 * @param {object} p
 * @param {object} p.prisma
 * @param {string} p.restaurantId
 * @param {Array<{menuItemId, variantId, name, unitPrice, quantity}>} p.cart
 * @param {() => Promise<Array>} p.loadMenu — menú agrupado de catalog.loadMenu
 * @returns {Promise<{ruleId, menuItemId, variantId, name, unitPrice, offerText}|null>}
 */
async function pickOffer({ prisma, restaurantId, cart, loadMenu }) {
  if (!cart || cart.length === 0) return null;

  const rules = await prisma.upsellRule.findMany({
    where: { restaurantId, enabled: true },
    orderBy: { offerCount: 'asc' }, // rotación pareja entre reglas
  });
  if (rules.length === 0) return null;

  const menu = await loadMenu();
  const lines = menu.flatMap((cat) => cat.lines);
  const categoryByItem = new Map();
  for (const cat of menu) {
    for (const line of cat.lines) categoryByItem.set(line.menuItemId, cat.id);
  }

  const cartKeys = new Set(cart.map((i) => lineKey(i.menuItemId, i.variantId)));
  const cartItemIds = new Set(cart.map((i) => i.menuItemId));
  const cartCategoryIds = new Set(
    cart.map((i) => categoryByItem.get(i.menuItemId)).filter(Boolean)
  );
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  for (const rule of rules) {
    if (subtotal < Number(rule.minSubtotal || 0)) continue;
    if (rule.triggerType === 'CATEGORY' && !cartCategoryIds.has(rule.triggerId)) continue;
    if (rule.triggerType === 'ITEM' && !cartItemIds.has(rule.triggerId)) continue;
    // No sugerir algo que ya lleva.
    if (cartKeys.has(lineKey(rule.menuItemId, rule.variantId))) continue;
    // El producto debe seguir vivo en el menú (de ahí salen nombre y precio).
    const line = lines.find(
      (l) => l.menuItemId === rule.menuItemId && (l.variantId || null) === (rule.variantId || null)
    );
    if (!line) continue;

    // Cuenta la oferta (scope explícito por restaurantId).
    await prisma.upsellRule.updateMany({
      where: { id: rule.id, restaurantId },
      data: { offerCount: { increment: 1 } },
    });

    return {
      ruleId: rule.id,
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      name: line.name,
      unitPrice: line.unitPrice,
      offerText: rule.offerText || null,
    };
  }

  return null;
}

/**
 * Registra que el cliente aceptó la sugerencia (conversión + ingreso).
 * El ingreso se atribuye al aceptar; la validación real del precio la hace
 * createBotOrder al crear la orden, como con cualquier línea del carrito.
 */
async function recordAccept({ prisma, restaurantId, ruleId, amount }) {
  await prisma.upsellRule.updateMany({
    where: { id: ruleId, restaurantId },
    data: {
      acceptCount: { increment: 1 },
      revenue: { increment: Number(amount) || 0 },
    },
  });
}

module.exports = { pickOffer, recordAccept };
