'use strict';
const { usesPackaging } = require('../lib/order-packaging');

// Tenant-scoped catalog loaded once per request. Missing costs are warnings,
// never silently presented as a complete recipe.
async function loadRecipeCosting(prisma, restaurantId) {
  const [ingredients, subRecipes] = await Promise.all([
    prisma.ingredient.findMany({ where: { restaurantId } }),
    prisma.subRecipe.findMany({ where: { restaurantId }, include: { items: true } }),
  ]);
  return createRecipeCosting(ingredients, subRecipes);
}

function createRecipeCosting(ingredients, subRecipes) {
  const ingredientById = new Map(ingredients.map(i => [i.id, i]));
  const subById = new Map(subRecipes.map(s => [s.id, s]));

  function expand(item, quantity, unit, path, warnings, leaves) {
    if (quantity === 0) return;
    if (!Number.isFinite(quantity) || quantity < 0) {
      warnings.add('INVALID_QUANTITY'); return;
    }
    if (item.ingredientId) {
      const ingredient = ingredientById.get(item.ingredientId);
      if (!ingredient) { warnings.add('MISSING_INGREDIENT'); return; }
      if (ingredient.baseUnit !== unit) warnings.add('UNIT_MISMATCH');
      if (!(Number(ingredient.cost) > 0)) warnings.add('MISSING_PRICE');
      const existing = leaves.get(ingredient.id);
      leaves.set(ingredient.id, { ingredient, quantity: quantity + (existing?.quantity || 0) });
      return;
    }
    const id = item.nestedSubRecipeId || item.subRecipeId;
    const sub = subById.get(id);
    if (!sub) { warnings.add('MISSING_SUBRECIPE'); return; }
    if (path.includes(id) || path.length > 5) { warnings.add('SUBRECIPE_CYCLE_OR_DEPTH'); return; }
    if (sub.yieldUnit !== unit) warnings.add('UNIT_MISMATCH');
    const yieldQty = Number(sub.yieldQty);
    const retention = 1 - Number(sub.marginErrorPct || 0) / 100;
    if (!(yieldQty > 0 && retention > 0 && retention <= 1)) {
      warnings.add('INVALID_YIELD'); return;
    }
    if (!sub.items?.length) warnings.add('EMPTY_SUBRECIPE');
    for (const child of sub.items || []) {
      expand(child, Number(child.qty) * quantity / yieldQty / retention,
        child.unit, [...path, id], warnings, leaves);
    }
  }

  function recipe(recipe, orderType = 'TAKEOUT') {
    const warnings = new Set();
    const leaves = new Map();
    if (!recipe.items?.length) warnings.add('EMPTY_RECIPE');
    for (const item of recipe.items || []) {
      const quantity = Number(item.quantity) * (1 + Number(item.wastagePercent || 0) / 100);
      expand(item, quantity, item.unit, [], warnings, leaves);
    }
    const consumption = [...leaves.values()].filter(r => usesPackaging(orderType) || !r.ingredient.isPackaging);
    const totalCost = consumption.reduce((sum, row) => sum + row.quantity * Number(row.ingredient.cost || 0), 0);
    return { totalCost: Number(totalCost.toFixed(4)), costWarnings: [...warnings], consumption };
  }

  // Counts are actual containers for the entire order, not counts per dish.
  // Each provided ingredient replaces its baseline consumption, including zero.
  function packagingPreview(lines, counts, orderType = 'TAKEOUT') {
    const warnings = new Set();
    const quantities = new Map();
    for (const line of lines) {
      const result = recipe(line.recipe, orderType);
      result.costWarnings.forEach(w => warnings.add(w));
      for (const row of result.consumption) {
        quantities.set(row.ingredient.id, (quantities.get(row.ingredient.id) || 0) + row.quantity * line.quantity);
      }
    }
    const before = [...quantities].reduce((sum, [id, qty]) => sum + qty * Number(ingredientById.get(id).cost || 0), 0);
    const seen = new Set();
    for (const count of counts) {
      const ingredient = ingredientById.get(count.ingredientId);
      if (!ingredient || !ingredient.isPackaging || ingredient.baseUnit !== 'PIECE') {
        throw new Error('Empaque por pieza no encontrado en este restaurante');
      }
      if (seen.has(ingredient.id)) throw new Error('Empaque duplicado');
      seen.add(ingredient.id);
      if (!Number.isSafeInteger(count.quantity) || count.quantity < 0 || count.quantity > 10000) {
        throw new Error('Cantidad de empaque inválida');
      }
      if (count.quantity > 0 && !(Number(ingredient.cost) > 0)) warnings.add('MISSING_PRICE');
      if (!usesPackaging(orderType) && count.quantity > 0) throw new Error('Los pedidos de mesa no incluyen desechables');
      quantities.set(ingredient.id, count.quantity);
    }
    const consumption = [...quantities].map(([id, quantity]) => ({ ingredientId: id, quantity, cost: quantity * Number(ingredientById.get(id).cost || 0) }));
    const after = consumption.reduce((sum, row) => sum + row.cost, 0);
    return { baseCost: Number(before.toFixed(4)), totalCost: Number(after.toFixed(4)), packagingAdjustment: Number((after - before).toFixed(4)), costWarnings: [...warnings], consumption };
  }
  return { recipe, packagingPreview };
}

module.exports = { createRecipeCosting, loadRecipeCosting };
