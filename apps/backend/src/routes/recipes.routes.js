// recipes.routes.js
//
// CRUD para el módulo de costeo/recetario:
//   · Recipe       — escandallo final 1:1 con MenuItem (margen, comisión)
//   · SubRecipe    — preparaciones base (salsas, mezclas) reusables
//   · RecipeItem   — línea de ingrediente o subreceta dentro de Recipe/SubRecipe
//
// El endpoint legacy /api/inventory/recipes/:menuItemId sigue vivo para
// no romper la UI vieja; estos nuevos endpoints son la API moderna.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

// Todas las rutas de recetas requieren el plan tener hasInventory.
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const VALID_BASE_UNITS = ['GRAM', 'ML', 'PIECE'];

// ═══════════════════════════════════════════════════════════════════════
// RECIPE · escandallo final 1:1 con MenuItem
// ═══════════════════════════════════════════════════════════════════════

// GET /api/recipes — lista todas las recetas con totalCost calculado.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const recipes = await prisma.recipe.findMany({
      where: { restaurantId },
      include: {
        menuItem: { select: { id: true, name: true, price: true, imageUrl: true, categoryId: true } },
        items: {
          include: {
            ingredient: { select: { id: true, name: true, baseUnit: true, cost: true } },
            subRecipe:  { select: { id: true, name: true, yieldUnit: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Anexar totalCost computed por receta (sum de items con su cost).
    const enriched = recipes.map((r) => {
      const totalCost = (r.items || []).reduce((acc, it) => {
        const wastage = 1 + (Number(it.wastagePercent || 0) / 100);
        const qty = Number(it.quantity || 0) * wastage;
        const unitCost = it.ingredient ? Number(it.ingredient.cost || 0) : 0;
        // TODO: cost de subreceta cuando hagamos expansión recursiva
        return acc + qty * unitCost;
      }, 0);
      return { ...r, totalCost: Number(totalCost.toFixed(4)) };
    });

    res.json(enriched);
  } catch (e) {
    console.error('GET /api/recipes:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/recipes/by-menu-item/:menuItemId — lee o devuelve null.
router.get('/by-menu-item/:menuItemId', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const recipe = await prisma.recipe.findFirst({
      where: { menuItemId: req.params.menuItemId, restaurantId },
      include: {
        menuItem: { select: { id: true, name: true, price: true, imageUrl: true } },
        items: {
          include: {
            ingredient: { select: { id: true, name: true, baseUnit: true, cost: true } },
            subRecipe:  { select: { id: true, name: true, yieldUnit: true } },
          },
        },
      },
    });
    res.json(recipe);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recipes — UPSERT por menuItemId. Reemplaza items completos.
// Body: {
//   menuItemId, marginErrorPct?, targetMarginPct?, priceDelivery?,
//   platformCommissionPct?, items: [{ ingredientId? | subRecipeId?, quantity, unit, wastagePercent? }]
// }
router.post('/', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const {
      menuItemId,
      marginErrorPct = 0,
      targetMarginPct,
      priceDelivery,
      platformCommissionPct,
      items = [],
    } = req.body || {};

    if (!menuItemId) return res.status(400).json({ error: 'menuItemId requerido' });

    // Verificar que el MenuItem pertenece al restaurant
    const mi = await prisma.menuItem.findFirst({ where: { id: menuItemId, restaurantId } });
    if (!mi) return res.status(404).json({ error: 'MenuItem no encontrado' });

    const normalizedItems = validateItems(items);
    if (normalizedItems.error) return res.status(400).json({ error: normalizedItems.error });

    const recipe = await prisma.$transaction(async (tx) => {
      // Upsert manual (Recipe.menuItemId @unique)
      const existing = await tx.recipe.findUnique({ where: { menuItemId } });
      const data = {
        restaurantId,
        marginErrorPct: Number(marginErrorPct) || 0,
        targetMarginPct: targetMarginPct != null ? Number(targetMarginPct) : null,
        priceDelivery: priceDelivery != null ? Number(priceDelivery) : null,
        platformCommissionPct: platformCommissionPct != null ? Number(platformCommissionPct) : null,
      };
      const r = existing
        ? await tx.recipe.update({ where: { id: existing.id }, data })
        : await tx.recipe.create({ data: { ...data, menuItemId } });

      // Reemplazo total de items para esta Recipe
      await tx.recipeItem.deleteMany({ where: { recipeId: r.id } });
      if (normalizedItems.data.length > 0) {
        await tx.recipeItem.createMany({
          data: normalizedItems.data.map((it) => ({ ...it, recipeId: r.id })),
        });
      }

      return r;
    });

    res.json(recipe);
  } catch (e) {
    console.error('POST /api/recipes:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const r = await prisma.recipe.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!r) return res.status(404).json({ error: 'Receta no encontrada' });
    await prisma.recipe.delete({ where: { id: r.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SUBRECIPE · preparaciones base reusables
// ═══════════════════════════════════════════════════════════════════════

router.get('/subrecipes', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const list = await prisma.subRecipe.findMany({
      where: { restaurantId },
      include: {
        items: {
          include: {
            ingredient: { select: { id: true, name: true, baseUnit: true, cost: true } },
            nestedSubRecipe: { select: { id: true, name: true, yieldUnit: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/subrecipes/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const sub = await prisma.subRecipe.findFirst({
      where: { id: req.params.id, restaurantId },
      include: {
        items: {
          include: {
            ingredient: { select: { id: true, name: true, baseUnit: true, cost: true } },
            nestedSubRecipe: { select: { id: true, name: true, yieldUnit: true } },
          },
        },
      },
    });
    if (!sub) return res.status(404).json({ error: 'Sub-receta no encontrada' });
    res.json(sub);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/subrecipes', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { name, description, yieldQty, yieldUnit, marginErrorPct = 0, items = [] } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name requerido' });
    if (!Number.isFinite(Number(yieldQty)) || Number(yieldQty) <= 0) {
      return res.status(400).json({ error: 'yieldQty debe ser > 0' });
    }
    if (!VALID_BASE_UNITS.includes(yieldUnit)) {
      return res.status(400).json({ error: 'yieldUnit inválido' });
    }
    const normalized = validateSubRecipeItems(items);
    if (normalized.error) return res.status(400).json({ error: normalized.error });

    const result = await prisma.$transaction(async (tx) => {
      const sub = await tx.subRecipe.create({
        data: {
          restaurantId,
          name: name.trim(),
          description: description || null,
          yieldQty: Number(yieldQty),
          yieldUnit,
          marginErrorPct: Number(marginErrorPct) || 0,
        },
      });
      if (normalized.data.length > 0) {
        await tx.subRecipeItem.createMany({
          data: normalized.data.map((it) => ({ ...it, subRecipeId: sub.id })),
        });
      }
      return sub;
    });
    res.json(result);
  } catch (e) {
    console.error('POST /api/recipes/subrecipes:', e);
    res.status(500).json({ error: e.message });
  }
});

router.put('/subrecipes/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const existing = await prisma.subRecipe.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Sub-receta no encontrada' });

    const { name, description, yieldQty, yieldUnit, marginErrorPct, items } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description || null;
    if (yieldQty !== undefined) data.yieldQty = Number(yieldQty);
    if (yieldUnit !== undefined) {
      if (!VALID_BASE_UNITS.includes(yieldUnit)) return res.status(400).json({ error: 'yieldUnit inválido' });
      data.yieldUnit = yieldUnit;
    }
    if (marginErrorPct !== undefined) data.marginErrorPct = Number(marginErrorPct) || 0;

    let normalized = null;
    if (items !== undefined) {
      normalized = validateSubRecipeItems(items);
      if (normalized.error) return res.status(400).json({ error: normalized.error });
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.subRecipe.update({ where: { id: existing.id }, data });
      if (normalized) {
        await tx.subRecipeItem.deleteMany({ where: { subRecipeId: existing.id } });
        if (normalized.data.length > 0) {
          await tx.subRecipeItem.createMany({
            data: normalized.data.map((it) => ({ ...it, subRecipeId: existing.id })),
          });
        }
      }
      return updated;
    });
    res.json(result);
  } catch (e) {
    console.error('PUT /api/recipes/subrecipes:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/subrecipes/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const sub = await prisma.subRecipe.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!sub) return res.status(404).json({ error: 'Sub-receta no encontrada' });

    // Defensiva: si está usada en alguna Recipe, rechazar y forzar a que
    // el usuario la quite primero (evita borrar receta de un plato vivo).
    const usage = await prisma.recipeItem.count({ where: { subRecipeId: sub.id } });
    if (usage > 0) {
      return res.status(409).json({
        error: `Esta sub-receta está usada en ${usage} receta(s). Quítala de ahí primero.`,
        code: 'IN_USE',
      });
    }
    await prisma.subRecipe.delete({ where: { id: sub.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TAXONOMÍA · IngredientType + IngredientCategory (por restaurant)
// ═══════════════════════════════════════════════════════════════════════

router.get('/types', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const list = await prisma.ingredientType.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/types', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name requerido' });
    const created = await prisma.ingredientType.create({
      data: { restaurantId, name: String(name).trim().toUpperCase() },
    });
    res.json(created);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un tipo con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/types/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const existing = await prisma.ingredientType.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Tipo no encontrado' });
    const { name, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim().toUpperCase();
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const updated = await prisma.ingredientType.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un tipo con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

// Soft delete — preserva referencias históricas de Ingredient.typeId.
router.delete('/types/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const existing = await prisma.ingredientType.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Tipo no encontrado' });
    await prisma.ingredientType.update({ where: { id: existing.id }, data: { isActive: false } });
    res.json({ ok: true, mode: 'soft-delete' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/categories', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const list = await prisma.ingredientCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(list);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { name, color } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name requerido' });
    const created = await prisma.ingredientCategory.create({
      data: { restaurantId, name: String(name).trim().toUpperCase(), color: color || null },
    });
    res.json(created);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const existing = await prisma.ingredientCategory.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });
    const { name, color, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim().toUpperCase();
    if (color !== undefined) data.color = color || null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);
    const updated = await prisma.ingredientCategory.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const existing = await prisma.ingredientCategory.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Categoría no encontrada' });
    await prisma.ingredientCategory.update({ where: { id: existing.id }, data: { isActive: false } });
    res.json({ ok: true, mode: 'soft-delete' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers de validación
// ═══════════════════════════════════════════════════════════════════════

function validateItems(items) {
  if (!Array.isArray(items)) return { error: 'items debe ser array' };
  const out = [];
  for (const raw of items) {
    const qty = Number(raw?.quantity);
    if (!Number.isFinite(qty) || qty <= 0) return { error: 'quantity inválida en item' };

    const hasIng = Boolean(raw?.ingredientId);
    const hasSub = Boolean(raw?.subRecipeId);
    if (hasIng === hasSub) return { error: 'cada item debe tener ingredientId XOR subRecipeId' };

    const unit = raw?.unit && VALID_BASE_UNITS.includes(raw.unit) ? raw.unit : 'GRAM';
    out.push({
      ingredientId: hasIng ? String(raw.ingredientId) : null,
      subRecipeId:  hasSub ? String(raw.subRecipeId)  : null,
      quantity: qty,
      unit,
      wastagePercent: Number(raw?.wastagePercent) || 0,
      notes: raw?.notes || null,
    });
  }
  return { data: out };
}

function validateSubRecipeItems(items) {
  if (!Array.isArray(items)) return { error: 'items debe ser array' };
  const out = [];
  for (const raw of items) {
    const qty = Number(raw?.qty);
    if (!Number.isFinite(qty) || qty <= 0) return { error: 'qty inválida en item' };

    const hasIng = Boolean(raw?.ingredientId);
    const hasNested = Boolean(raw?.nestedSubRecipeId);
    if (hasIng === hasNested) return { error: 'cada item debe tener ingredientId XOR nestedSubRecipeId' };

    const unit = raw?.unit && VALID_BASE_UNITS.includes(raw.unit) ? raw.unit : 'GRAM';
    out.push({
      ingredientId: hasIng ? String(raw.ingredientId) : null,
      nestedSubRecipeId: hasNested ? String(raw.nestedSubRecipeId) : null,
      qty,
      unit,
      notes: raw?.notes || null,
    });
  }
  return { data: out };
}

module.exports = router;
