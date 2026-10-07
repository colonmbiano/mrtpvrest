const { parseVariantsFromItem } = require('../lib/parse-variant');
const { usesPackaging } = require('../lib/order-packaging');

// ─────────────────────────────────────────────────────────────────────────
// expandSubRecipeToIngredients · devuelve los ingredientes finales (hojas)
// que se consumen al usar `qtyRequested` unidades de una SubRecipe.
//
// Ejemplo: SubRecipe "Salsa Verde" rinde 800g, con marginError 5%, e items:
//   - tomate    400g
//   - cebolla   100g
// Si una Recipe pide 100g de Salsa Verde:
//   factor = 100 / 800 = 0.125
//   adjMargen = 0.125 / (1 - 0.05) = 0.131578... (necesitas preparar 5% extra
//   de bruto para obtener 100g netos tras la pérdida)
//   tomate consumido  = 0.131578 × 400 = 52.63g
//   cebolla consumida = 0.131578 × 100 = 13.16g
//
// Recursivo: si un SubRecipeItem apunta a otra SubRecipe (nested), aplica
// el mismo cálculo en cadena. `visited` previene loops; `depth` cap defensivo.
async function expandSubRecipeToIngredients(prisma, subRecipeId, qtyRequested, restaurantId, visited = new Set(), depth = 0) {
  if (depth > 5) {
    console.warn(`[expandSubRecipe] profundidad ${depth} excedida en ${subRecipeId}`);
    return [];
  }
  if (visited.has(subRecipeId)) {
    console.warn(`[expandSubRecipe] loop detectado en ${subRecipeId}, saltando`);
    return [];
  }
  visited.add(subRecipeId);

  const sub = await prisma.subRecipe.findFirst({
    where: { id: subRecipeId, restaurantId },
    include: { items: { include: { ingredient: true } } },
  });
  if (!sub || !sub.items || sub.items.length === 0) return [];

  const yieldQty = Number(sub.yieldQty || 0);
  if (yieldQty <= 0) return [];
  const marginPct = Number(sub.marginErrorPct || 0);
  const adjustedFactor = qtyRequested / yieldQty / Math.max(0.001, 1 - marginPct / 100);

  const out = [];
  for (const item of sub.items) {
    const itemQty = Number(item.qty || 0) * adjustedFactor;
    if (item.ingredientId && item.ingredient) {
      out.push({ ingredient: item.ingredient, qtyToConsume: itemQty });
    } else if (item.nestedSubRecipeId) {
      const nested = await expandSubRecipeToIngredients(
        prisma, item.nestedSubRecipeId, itemQty, restaurantId, new Set(visited), depth + 1,
      );
      out.push(...nested);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// discountInventory · descuenta ingredientes consumidos por una orden y
// persiste el snapshot de costo (CMV) en cada OrderItem.
//
// Cambios vs versión legacy:
//   1. Lee `Recipe` (escandallo final) cuando existe, con fallback a la
//      vieja `RecipeItem.menuItemId` directa para items sin Recipe formal.
//   2. Crea `StockMovement` con balanceAfter cacheado + refType='order'.
//   3. Solo escribe en `StockMovement`. El antiguo `InventoryMovement` ya
//      fue retirado tras migrar todos los consumidores (voice-agent +
//      /api/inventory/movements ahora también usan StockMovement).
//   4. Actualiza `OrderItem.costSnapshot` con el CMV unitario al cobrar
//      (snapshot inmutable — reportes históricos no recalculan).
//   5. Expansión recursiva de SubRecipe: si un RecipeItem apunta a una
//      SubRecipe, se calcula el consumo proporcional de cada ingrediente
//      hoja (incluyendo nested SubRecipes hasta profundidad 5).
// resolveRecipeFlatItems · resuelve la receta de un MenuItem (variante en el
// nombre "Producto (Grande)" y/o en notes "Variantes: X" — se parsea con el
// helper central lib/parse-variant, con fallback a la base/legacy) y devuelve la
// lista plana de ingredientes a consumir POR UNIDAD. Compartido por
// discountInventory para el header del platillo O para cada componente de un
// combo — misma lógica.
async function resolveRecipeFlatItems(prisma, menuItemId, nameForMatch, restaurantId, notesForMatch) {
  const recipes = await prisma.recipe.findMany({
    where: { menuItemId, restaurantId, isActive: true },
    select: { id: true, variantId: true, variant: { select: { name: true } } },
  });
  let chosenRecipeId = null;
  if (recipes.length > 0) {
    const variantRecipes = recipes.filter((r) => r.variantId && r.variant);
    if (variantRecipes.length > 0) {
      const base = recipes.find((r) => !r.variantId);
      // 1) Match exacto contra las variantes registradas en la línea (nombre
      //    "(Grande)" o notes "Variantes: Grande") — cubre el multi-select,
      //    que solo vive en notes y el includes() legacy nunca casaba.
      const parsed = parseVariantsFromItem(nameForMatch, notesForMatch).map((v) => v.toLowerCase());
      let match = parsed.length
        ? variantRecipes.find((r) => parsed.includes(r.variant.name.toLowerCase()))
        : null;
      // 2) Heurística legacy: nombre de la variante contenido en el nombre.
      if (!match) {
        const nm = (nameForMatch || '').toLowerCase();
        match = nm ? variantRecipes.find((r) => nm.includes(r.variant.name.toLowerCase())) : null;
      }
      chosenRecipeId = (match || base || recipes[0]).id;
    } else {
      chosenRecipeId = recipes[0].id; // solo receta base
    }
  }
  const recipeItems = await prisma.recipeItem.findMany({
    where: chosenRecipeId ? { recipeId: chosenRecipeId } : { menuItemId, menuItem: { restaurantId } },
    include: { ingredient: true, recipe: true },
  });
  const flatItems = [];
  let recipeIdSnap = null;
  for (const r of recipeItems) {
    if (r.recipeId && !recipeIdSnap) recipeIdSnap = r.recipeId;
    const wastageFactor = 1 + (Number(r.wastagePercent || 0) / 100);
    const qtyPerUnit = Number(r.quantity) * wastageFactor;
    if (r.ingredientId && r.ingredient) {
      flatItems.push({ ingredient: r.ingredient, qtyToConsumePerUnit: qtyPerUnit });
    } else if (r.subRecipeId) {
      const expanded = await expandSubRecipeToIngredients(prisma, r.subRecipeId, qtyPerUnit, restaurantId);
      for (const exp of expanded) {
        flatItems.push({ ingredient: exp.ingredient, qtyToConsumePerUnit: exp.qtyToConsume });
      }
    }
  }
  return { flatItems, recipeIdSnap };
}

async function resolveOrderLineItems(prisma, oi, restaurantId) {
      // Combo: descontar las recetas de los COMPONENTES elegidos (cada
      // ComboSelection.optionMenuItemId es un MenuItem real con su receta), NO la
      // receta del header del combo (evita doble/falso conteo). Items normales:
      // su propia receta, con la variante embebida en oi.name. Misma lógica de
      // receta/subreceta vía resolveRecipeFlatItems.
      const comboSels = await prisma.comboSelection.findMany({
        where: { orderItemId: oi.id },
        select: { optionMenuItemId: true },
      });
      const flatItems = [];
      let recipeIdSnap = null;
      if (comboSels.length > 0) {
        for (const cs of comboSels) {
          const r = await resolveRecipeFlatItems(prisma, cs.optionMenuItemId, '', restaurantId);
          flatItems.push(...r.flatItems);
          if (r.recipeIdSnap && !recipeIdSnap) recipeIdSnap = r.recipeIdSnap;
        }
      } else {
        const r = await resolveRecipeFlatItems(prisma, oi.menuItemId, oi.name, restaurantId, oi.notes);
        flatItems.push(...r.flatItems);
        recipeIdSnap = r.recipeIdSnap;
      }

      // Consumo por MODIFICADORES (extras): cada modificador de la línea puede
      // consumir insumos (Papas Gajo Extra → 150g papa, etc.). Se mapea por
      // NOMBRE a nivel restaurante (order_item_modifiers guarda el nombre). El
      // extra aplica por unidad del platillo, igual que la receta.
      const oiModifiers = await prisma.orderItemModifier.findMany({
        where: { orderItemId: oi.id },
        select: { name: true },
      });
      if (oiModifiers.length > 0) {
        const names = [...new Set(oiModifiers.map((m) => m.name))];
        const modMaps = await prisma.modifierIngredient.findMany({
          where: { restaurantId, name: { in: names } },
          include: { ingredient: true },
        });
        const byName = new Map();
        for (const mm of modMaps) {
          if (!byName.has(mm.name)) byName.set(mm.name, []);
          byName.get(mm.name).push(mm);
        }
        for (const om of oiModifiers) {
          const maps = byName.get(om.name) || [];
          for (const mm of maps) {
            const wf = 1 + (Number(mm.wastagePercent || 0) / 100);
            const q = Number(mm.quantity) * wf;
            if (mm.ingredientId && mm.ingredient) {
              flatItems.push({ ingredient: mm.ingredient, qtyToConsumePerUnit: q });
            } else if (mm.subRecipeId) {
              const expanded = await expandSubRecipeToIngredients(prisma, mm.subRecipeId, q, restaurantId);
              for (const exp of expanded) {
                flatItems.push({ ingredient: exp.ingredient, qtyToConsumePerUnit: exp.qtyToConsume });
              }
            }
          }
        }
      }

  return { flatItems, recipeIdSnap };
}

async function applyInventory(prisma, orderItems, orderId, restaurantId, locationId, orderType) {
  if (!Array.isArray(orderItems) || orderItems.length === 0) return;
  if (!locationId) {
    console.warn('[discountInventory] locationId requerido; abortando descuento');
    return;
  }

  try {
    const cfg = await prisma.restaurantConfig.findUnique({ where: { restaurantId }, select: { blockOnInsufficientStock: true } });
    for (const oi of orderItems) {
      const { flatItems, recipeIdSnap } = await resolveOrderLineItems(prisma, oi, restaurantId);

      // DINE_IN consumes food, including sauces, but no disposable supplies.
      const applicableItems = flatItems.filter(fi => usesPackaging(orderType) || !fi.ingredient.isPackaging);

      // Si dos paths (ingrediente directo + sub-receta) consumen el mismo
      // ingrediente, agregamos las cantidades en una sola operación de
      // descuento — evita race / multiple StockMovements del mismo ingrediente.
      const aggregated = new Map(); // ingredientId → { ingredient, qtyPerUnit }
      for (const fi of applicableItems) {
        const id = fi.ingredient.id;
        const existing = aggregated.get(id);
        if (existing) {
          existing.qtyPerUnit += fi.qtyToConsumePerUnit;
        } else {
          aggregated.set(id, { ingredient: fi.ingredient, qtyPerUnit: fi.qtyToConsumePerUnit });
        }
      }

      let cmvUnitario = 0;

      // Multiplicador del consumo: para productos por peso, la receta está
      // definida POR KG, así que se descuenta proporcional a los kg vendidos
      // (weightKg). Para productos por pieza, por unidades (quantity).
      const consumptionMultiplier = oi.weightKg != null
        ? Number(oi.weightKg)
        : Number(oi.quantity || 1);

      for (const [, { ingredient, qtyPerUnit }] of [...aggregated].sort(([a], [b]) => a.localeCompare(b))) {
        const needed = qtyPerUnit * consumptionMultiplier;
        const unitCost = Number(ingredient.cost || 0);
        cmvUnitario += qtyPerUnit * unitCost; // CMV por 1 unidad del MenuItem

        // 1. Decremento de stock + lectura del nuevo balance.
        const changed = await prisma.ingredient.updateMany({
          where: { id: ingredient.id, restaurantId,
            ...(cfg?.blockOnInsufficientStock && needed > 0 ? { stock: { gte: needed } } : {}),
          },
          data: { stock: { decrement: needed } },
        });
        if (!changed.count) throw Object.assign(new Error(`Sin stock suficiente de ${ingredient.name}`), { status: 409 });
        const updated = await prisma.ingredient.findFirst({
          where: { id: ingredient.id, restaurantId },
          select: { id: true, stock: true, baseUnit: true, locationId: true },
        });

        // 2. StockMovement.
        const ingLocationId = updated.locationId || locationId;
        await prisma.stockMovement.create({
          data: {
            ingredientId: ingredient.id,
            locationId: ingLocationId,
            delta: -needed,
            unit: updated.baseUnit,
            reason: 'SALE',
            refType: 'order',
            refId: orderId,
            balanceAfter: Number(updated.stock),
            unitCostAtMove: unitCost,
            notes: `Venta orderItem ${oi.id}`,
          },
        });

      }

      // 4. Snapshot de costo en el OrderItem. Inmutable.
      {
        await prisma.orderItem.update({
          where: { id: oi.id },
          data: {
            costSnapshot: Number(cmvUnitario.toFixed(4)),
            recipeIdSnap,
          },
        });
      }
    }
  } catch (e) {
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// assertStockAvailable · pre-check de stock ANTES de crear la orden. Recorre las
// líneas resueltas (no necesita orderItem.id: usa _modifiers con nombres) y suma
// el consumo por ingrediente con la MISMA lógica de receta/subreceta/modificador
// que discountInventory. Lanza { code:'INSUFFICIENT_STOCK' } si algún insumo no
// alcanza. Read-only (no escribe). Gate preventivo opt-in
// (RestaurantConfig.blockOnInsufficientStock); NO reemplaza el descuento real,
// que sigue en discountInventory post-cobro. Si la lógica de discountInventory
// cambia, replicarlo aquí (duplicación consciente para no tocar el path legacy).
async function assertStockAvailable(prisma, resolvedItems, restaurantId, orderType = 'TAKEOUT') {
  if (!Array.isArray(resolvedItems) || resolvedItems.length === 0) return;

  const needByIngredient = new Map(); // ingredientId -> { needed, name }
  const addNeed = (ingredient, qty) => {
    if (!ingredient || !(qty > 0) || (!usesPackaging(orderType) && ingredient.isPackaging)) return;
    const cur = needByIngredient.get(ingredient.id);
    if (cur) cur.needed += qty;
    else needByIngredient.set(ingredient.id, { needed: qty, name: ingredient.name });
  };

  for (const line of resolvedItems) {
    const multiplier = line.weightKg != null ? Number(line.weightKg) : Number(line.quantity || 1);
    if (!(multiplier > 0)) continue;

    // Combo: el consumo sale de los COMPONENTES elegidos (no del header); item
    // normal: su propia receta (variante embebida en line.name). Misma lógica de
    // receta/subreceta que discountInventory vía resolveRecipeFlatItems.
    const recipeSources = (line._comboSelections && line._comboSelections.length)
      ? line._comboSelections.map((s) => ({ menuItemId: s.optionMenuItemId, name: '', notes: '' }))
      : [{ menuItemId: line.menuItemId, name: line.name, notes: line.notes }];
    for (const src of recipeSources) {
      const { flatItems } = await resolveRecipeFlatItems(prisma, src.menuItemId, src.name, restaurantId, src.notes);
      for (const fi of flatItems) addNeed(fi.ingredient, fi.qtyToConsumePerUnit * multiplier);
    }

    // Modificadores con consumo (mapeados por nombre).
    const modNames = [...new Set((line._modifiers || []).map((m) => m.name).filter(Boolean))];
    if (modNames.length > 0) {
      const modMaps = await prisma.modifierIngredient.findMany({
        where: { restaurantId, name: { in: modNames } },
        include: { ingredient: true },
      });
      for (const mm of modMaps) {
        const wf = 1 + (Number(mm.wastagePercent || 0) / 100);
        const q = Number(mm.quantity) * wf;
        if (mm.ingredientId && mm.ingredient) {
          addNeed(mm.ingredient, q * multiplier);
        } else if (mm.subRecipeId) {
          const expanded = await expandSubRecipeToIngredients(prisma, mm.subRecipeId, q, restaurantId);
          for (const exp of expanded) addNeed(exp.ingredient, exp.qtyToConsume * multiplier);
        }
      }
    }
  }

  if (needByIngredient.size === 0) return;

  const ids = [...needByIngredient.keys()];
  const stocks = await prisma.ingredient.findMany({
    where: { id: { in: ids }, restaurantId },
    select: { id: true, name: true, stock: true },
  });
  const stockById = new Map(stocks.map((s) => [s.id, s]));
  for (const [id, need] of needByIngredient) {
    const available = Number(stockById.get(id)?.stock || 0);
    if (need.needed > available + 1e-6) {
      const err = new Error(`Sin stock suficiente de "${need.name}".`);
      err.code = 'INSUFFICIENT_STOCK';
      err.ingredientName = need.name;
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// restoreInventoryForCancelledOrder · revierte el stock descontado por una
// orden al cancelarla. No recalcula recetas (pueden haber cambiado desde la
// venta): repone exactamente lo que registran los StockMovements SALE de la
// orden, neteado contra reversiones previas (ADJUSTMENT con el mismo ref)
// para que reintentos o dobles llamadas no dupliquen la reposición.
//
// Órdenes que nunca descontaron inventario (web/kiosko/storefront, o items
// sin receta) no tienen movimientos SALE → no-op. La reversión usa reason
// ADJUSTMENT porque el enum no tiene un valor de cancelación; el refType
// 'order' + notes dejan el rastro auditable.
async function restoreInventoryForCancelledOrder(prisma, orderId, restaurantId) {
  if (restaurantId) {
    return prisma.$transaction(async tx => {
      const locked = await tx.order.updateMany({ where: { id: orderId, restaurantId }, data: { updatedAt: new Date() } });
      if (!locked.count) return;
      // Reuse the legacy loop inside the single locked transaction.
      const scoped = { ingredient: tx.ingredient, stockMovement: tx.stockMovement, $transaction: work => work(tx) };
      return restoreInventoryForCancelledOrder(scoped, orderId);
    }, { timeout: 30000 });
  }
  const movements = await prisma.stockMovement.findMany({
    where: { refType: 'order', refId: orderId, reason: { in: ['SALE', 'ADJUSTMENT'] } },
    select: { ingredientId: true, delta: true },
  });
  if (movements.length === 0) return;

  // Neto por ingrediente: SALE aporta negativo, reversiones previas positivo.
  const netByIngredient = new Map();
  for (const m of movements) {
    netByIngredient.set(m.ingredientId, (netByIngredient.get(m.ingredientId) || 0) + Number(m.delta || 0));
  }

  const restorePromises = [];
  for (const [ingredientId, net] of netByIngredient) {
    if (net >= 0) continue; // nada pendiente de reponer
    const toRestore = -net;

    restorePromises.push(
      prisma.$transaction(async (tx) => {
        const updated = await tx.ingredient.update({
          where: { id: ingredientId },
          data: { stock: { increment: toRestore } },
          select: { id: true, stock: true, baseUnit: true, locationId: true },
        });
        await tx.stockMovement.create({
          data: {
            ingredientId,
            locationId: updated.locationId,
            delta: toRestore,
            unit: updated.baseUnit,
            reason: 'ADJUSTMENT',
            refType: 'order',
            refId: orderId,
            balanceAfter: Number(updated.stock),
            notes: 'Reversión por cancelación de orden',
          },
        });
      })
    );
  }
  await Promise.all(restorePromises);
}


// Lock the order before reading snapshots. Concurrent retries/packing edits
// serialize on this row; stock, ledger and cost snapshots commit together.
async function discountInventory(prisma, orderItems, orderId, restaurantId, locationId) {
  if (!orderItems?.length || !locationId) return;
  return prisma.$transaction(async tx => {
    const locked = await tx.order.updateMany({
      where: { id: orderId, restaurantId }, data: { updatedAt: new Date() },
    });
    if (!locked.count) return;
    const order = await tx.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order || order.status === 'CANCELLED') return;
    const pending = await tx.orderItem.findMany({
      where: { orderId, id: { in: orderItems.map(i => i.id) }, costSnapshot: null },
    });
    await applyInventory(tx, pending, orderId, restaurantId, locationId, order.orderType);
  }, { timeout: 30000 });
}

module.exports = { resolveOrderLineItems, discountInventory, assertStockAvailable, restoreInventoryForCancelledOrder, resolveRecipeFlatItems };
