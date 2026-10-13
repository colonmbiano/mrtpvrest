// Scoped recipes override the global recipe for the same modifier name.
// Shared by the stock pre-check, payment consumption and cost simulation.
function selectModifierMappings(rows, menuItemId, name) {
  const named = rows.filter(row => row.name === name);
  const scoped = menuItemId ? named.filter(row => row.menuItemId === menuItemId) : [];
  return scoped.length ? scoped : named.filter(row => row.menuItemId == null);
}

async function resolveModifierIngredients(prisma, restaurantId, menuItemId, modifiers, expandSubRecipe) {
  if (!modifiers?.length) return [];
  const ids = [...new Set(modifiers.map(m => m.modifierId).filter(Boolean))];
  const definitions = ids.length ? await prisma.modifier.findMany({
    where: { id: { in: ids }, group: { menuItemId, menuItem: { restaurantId } } },
    select: { id: true, group: { select: { groupType: true, maxSelection: true } } },
  }) : [];
  const byId = new Map(definitions.map(m => [m.id, m]));
  const selections = modifiers.map(m => {
    const definition = byId.get(m.modifierId);
    const match = definition?.group?.groupType === 'QUANTITY'
      ? /^(\d+) (.+)$/.exec(m.name || '') : null;
    const quantity = match ? Number(match[1]) : 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 ||
        (match && definition.group.maxSelection > 0 && quantity > definition.group.maxSelection)) {
      throw Object.assign(new Error('Cantidad inválida en modificador'), { status: 409 });
    }
    return { name: match ? match[2] : m.name, quantity };
  }).filter(m => m.name && !/^sin\s/i.test(m.name));
  if (!selections.length) return [];
  const rows = await prisma.modifierIngredient.findMany({
    where: { restaurantId, name: { in: [...new Set(selections.map(m => m.name))] },
      OR: [{ menuItemId: null }, ...(menuItemId ? [{ menuItemId }] : [])] },
    include: { ingredient: true },
  });
  const flatItems = [];
  for (const selection of selections) {
    for (const row of selectModifierMappings(rows, menuItemId, selection.name)) {
      const qty = Number(row.quantity) * (1 + Number(row.wastagePercent || 0) / 100) * selection.quantity;
      if (row.ingredientId && row.ingredient) {
        if (row.ingredient.restaurantId !== restaurantId) {
          throw Object.assign(new Error('Insumo fuera del restaurante'), { status: 409 });
        }
        flatItems.push({ ingredient: row.ingredient, qtyToConsumePerUnit: qty });
      } else if (row.subRecipeId) {
        const expanded = await expandSubRecipe(prisma, row.subRecipeId, qty, restaurantId);
        flatItems.push(...expanded.map(item => ({
          ingredient: item.ingredient, qtyToConsumePerUnit: item.qtyToConsume,
        })));
      }
    }
  }
  return flatItems;
}

module.exports = { selectModifierMappings, resolveModifierIngredients };
