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
const { buildInsumosWorkbook, buildRecetasWorkbook } = require('../services/recipe-template.service');
const { importInsumosFromBuffer, importRecetasFromBuffer, computeCostPerBase, norm } = require('../services/recipe-import.service');
const { recordCostChange } = require('../services/cost-history.service');
const multer = require('multer');
const router = express.Router();

// Multer en memoria, sólo .xlsx, 10MB.
const uploadXlsx = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx');
    cb(ok ? null : new Error('Sólo se aceptan archivos .xlsx'), ok);
  },
});

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
// IMPORT · plantillas Excel personalizadas (descarga)
// ═══════════════════════════════════════════════════════════════════════
//
// Generan un .xlsx PRE-LLENADO con los datos que el restaurante ya tiene,
// para que el cliente edite/complete y luego lo suba — sin empezar de cero.

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function sendWorkbook(res, wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(Buffer.from(buffer));
}

// GET /api/recipes/import/template/insumos — plantilla de insumos pre-llenada
// con los Ingredient existentes (filtrada por sucursal si se pasa x-location-id).
router.get('/import/template/insumos', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const locationId = req.headers['x-location-id'] || req.query.locationId || undefined;

    const where = { restaurantId, isActive: true };
    if (locationId) where.locationId = locationId;

    const [ingredients, types] = await Promise.all([
      prisma.ingredient.findMany({
        where,
        include: {
          type: { select: { name: true } },
          category: { select: { name: true } },
          supplier: { select: { name: true } },
        },
        orderBy: [{ type: { name: 'asc' } }, { name: 'asc' }],
      }),
      prisma.ingredientType.findMany({
        where: { restaurantId, isActive: true },
        select: { name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const wb = buildInsumosWorkbook({ ingredients, typeNames: types.map((t) => t.name) });
    await sendWorkbook(res, wb, 'plantilla-insumos.xlsx');
  } catch (e) {
    console.error('GET /api/recipes/import/template/insumos:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/recipes/import/template/recetas — plantilla de recetas pre-llenada
// con los MenuItem del menú (nombre + precio) y las subrecetas existentes.
router.get('/import/template/recetas', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const [menuItems, subRecipes] = await Promise.all([
      prisma.menuItem.findMany({
        where: { restaurantId },
        select: {
          id: true, name: true, price: true,
          category: { select: { name: true, sortOrder: true } },
          recipe: {
            select: {
              priceDelivery: true, platformCommissionPct: true,
              items: {
                select: {
                  quantity: true, unit: true, wastagePercent: true,
                  ingredient: { select: { name: true, baseUnit: true } },
                  subRecipe: { select: { name: true, yieldUnit: true } },
                },
              },
            },
          },
        },
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
      }),
      prisma.subRecipe.findMany({
        where: { restaurantId },
        select: {
          name: true, yieldQty: true, yieldUnit: true, marginErrorPct: true,
          items: {
            select: {
              qty: true, unit: true,
              ingredient: { select: { name: true, baseUnit: true } },
              nestedSubRecipe: { select: { name: true, yieldUnit: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const wb = buildRecetasWorkbook({ menuItems, subRecipes });
    await sendWorkbook(res, wb, 'plantilla-recetas.xlsx');
  } catch (e) {
    console.error('GET /api/recipes/import/template/recetas:', e);
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// IMPORT · subir plantilla llena → preview (read-only) → confirm (escribe)
// ═══════════════════════════════════════════════════════════════════════

// Construye un Map normalizado nombre→registro para matching insensible.
function nameMap(rows) {
  const m = new Map();
  for (const r of rows) m.set(norm(r.name), r);
  return m;
}

// ── INSUMOS ──────────────────────────────────────────────────────────────
// POST /api/recipes/import/insumos/preview — parsea + clasifica (no escribe).
router.post('/import/insumos/preview', requireAdmin, uploadXlsx.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.headers['x-location-id'] || req.query.locationId || undefined;

    const { insumos, error } = await importInsumosFromBuffer(req.file.buffer);
    if (error) return res.status(400).json({ error });

    const existing = await prisma.ingredient.findMany({
      where: { restaurantId, ...(locationId ? { locationId } : {}) },
      select: { id: true, name: true },
    });
    const byName = nameMap(existing);

    const rows = insumos.map((it) => ({
      ...it,
      cost: computeCostPerBase(it),
      status: byName.has(norm(it.name)) ? 'update' : 'new',
    }));
    res.json({
      insumos: rows,
      summary: {
        total: rows.length,
        nuevos: rows.filter((r) => r.status === 'new').length,
        actualizar: rows.filter((r) => r.status === 'update').length,
      },
    });
  } catch (e) {
    console.error('POST import/insumos/preview:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recipes/import/insumos/confirm — escribe los insumos revisados.
router.post('/import/insumos/confirm', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'No hay insumos para guardar' });

    // Pre-cargar taxonomía y proveedores; crear los que falten.
    const [types, cats, suppliers] = await Promise.all([
      prisma.ingredientType.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
      prisma.ingredientCategory.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
      prisma.supplier.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);
    const typeMap = nameMap(types), catMap = nameMap(cats), supMap = nameMap(suppliers);

    async function ensure(map, name, createFn) {
      if (!name) return null;
      const key = norm(name);
      if (map.has(key)) return map.get(key).id;
      const created = await createFn(name);
      map.set(key, { id: created.id, name });
      return created.id;
    }

    let created = 0, updated = 0;
    const changedBy = req.user?.id ?? null;

    for (const it of items) {
      const name = String(it.name || '').trim();
      if (!name) continue;
      const cost = Number(it.cost) || computeCostPerBase(it) || 0;
      const baseUnit = ['GRAM', 'ML', 'PIECE'].includes(it.baseUnit) ? it.baseUnit : 'PIECE';
      const conversionFactor = (Number(it.pesoBruto) > 0 && Number(it.pesoNeto) > 0) ? Number(it.pesoBruto) / Number(it.pesoNeto) : 1;

      const typeId = await ensure(typeMap, it.type, (n) => prisma.ingredientType.create({ data: { restaurantId, name: n } }));
      const categoryId = await ensure(catMap, it.category, (n) => prisma.ingredientCategory.create({ data: { restaurantId, name: n } }));
      const supplierId = await ensure(supMap, it.supplier, (n) => prisma.supplier.create({ data: { restaurantId, name: n } }));

      const existing = await prisma.ingredient.findFirst({
        where: { restaurantId, locationId, name: { equals: name, mode: 'insensitive' } },
        select: { id: true },
      });

      const data = {
        name, baseUnit, typeId, categoryId, supplierId,
        purchaseUnit: it.purchaseUnit || null,
        purchaseCost: it.purchaseCost != null ? Number(it.purchaseCost) : null,
        purchaseQty: it.purchaseQty != null ? Number(it.purchaseQty) : 1,
        pesoBruto: it.pesoBruto != null ? Number(it.pesoBruto) : null,
        pesoNeto: it.pesoNeto != null ? Number(it.pesoNeto) : null,
        conversionFactor,
        cost,
        ...(it.minStock != null ? { minStock: Number(it.minStock) } : {}),
      };

      if (existing) {
        await prisma.$transaction(async (tx) => {
          await recordCostChange(tx, existing.id, { cost, purchaseCost: data.purchaseCost, purchaseUnit: data.purchaseUnit, conversionFactor }, { changedBy, reason: 'bulk_import' });
          await tx.ingredient.update({
            where: { id: existing.id },
            data: { ...data, ...(it.stock != null ? { stock: Number(it.stock) } : {}), isPendingReview: false },
          });
        });
        updated++;
      } else {
        await prisma.$transaction(async (tx) => {
          const ing = await tx.ingredient.create({
            data: { restaurantId, locationId, ...data, stock: it.stock != null ? Number(it.stock) : 0, isPendingReview: cost <= 0 },
          });
          await tx.ingredientCostHistory.create({
            data: { ingredientId: ing.id, cost, purchaseCost: data.purchaseCost, purchaseUnit: data.purchaseUnit, conversionFactor, changedBy, reason: 'bulk_import' },
          });
        });
        created++;
      }
    }
    res.json({ ok: true, created, updated });
  } catch (e) {
    console.error('POST import/insumos/confirm:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── RECETAS (platos + subrecetas) ──────────────────────────────────────────
// POST /api/recipes/import/recetas/preview — parsea + clasifica (no escribe).
router.post('/import/recetas/preview', requireAdmin, uploadXlsx.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.headers['x-location-id'] || req.query.locationId || undefined;

    const { platos, subrecetas, error } = await importRecetasFromBuffer(req.file.buffer);
    if (error) return res.status(400).json({ error });

    const [menu, ings, subs] = await Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
      prisma.ingredient.findMany({ where: { restaurantId, ...(locationId ? { locationId } : {}) }, select: { id: true, name: true } }),
      prisma.subRecipe.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);
    const menuByName = nameMap(menu);
    const ingByName = nameMap(ings);
    const subByName = nameMap(subs);
    // Subrecetas definidas en este archivo cuentan como "existirán".
    const sheetSubNames = new Set(subrecetas.map((s) => norm(s.name)));

    const newIngredients = new Set();
    const newSubRecipes = new Set();
    const resolveItem = (it) => {
      if (it.isSub) {
        const known = subByName.has(norm(it.component)) || sheetSubNames.has(norm(it.component));
        if (!known) newSubRecipes.add(it.component);
        return { ...it, status: known ? 'ok' : 'new-sub' };
      }
      const known = ingByName.has(norm(it.component));
      if (!known) newIngredients.add(it.component);
      return { ...it, status: known ? 'ok' : 'new-ing' };
    };

    const platosOut = platos.map((d) => ({
      ...d,
      menuItemId: menuByName.get(norm(d.name))?.id || null,
      status: menuByName.has(norm(d.name)) ? 'ok' : 'no-match',
      items: d.items.map(resolveItem),
    }));
    const subsOut = subrecetas.map((s) => ({
      ...s,
      status: subByName.has(norm(s.name)) ? 'update' : 'new',
      items: s.items.map(resolveItem),
    }));

    res.json({
      platos: platosOut,
      subrecetas: subsOut,
      summary: {
        platos: platosOut.length,
        platosSinMatch: platosOut.filter((d) => d.status === 'no-match').length,
        subrecetas: subsOut.length,
        ingredientesNuevos: newIngredients.size,
        subrecetasNuevas: newSubRecipes.size,
      },
    });
  } catch (e) {
    console.error('POST import/recetas/preview:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/recipes/import/recetas/confirm — escribe subrecetas + recetas,
// auto-creando insumos y subrecetas faltantes (isPendingReview).
router.post('/import/recetas/confirm', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const platos = Array.isArray(req.body?.platos) ? req.body.platos : [];
    const subrecetas = Array.isArray(req.body?.subrecetas) ? req.body.subrecetas : [];
    if (platos.length === 0 && subrecetas.length === 0) {
      return res.status(400).json({ error: 'No hay recetas para guardar' });
    }

    const [ings, subs, menu] = await Promise.all([
      prisma.ingredient.findMany({ where: { restaurantId, ...(locationId ? { locationId } : {}) }, select: { id: true, name: true } }),
      prisma.subRecipe.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
      prisma.menuItem.findMany({ where: { restaurantId }, select: { id: true, name: true } }),
    ]);
    const ingByName = nameMap(ings);
    const subByName = nameMap(subs);
    const menuByName = nameMap(menu);

    const stats = { ingredientesCreados: 0, subrecetasGuardadas: 0, recetasGuardadas: 0, platosSinMatch: 0 };

    // Helper: obtiene/crea un Ingredient por nombre (pendiente de revisión).
    async function getIngredientId(name, unit) {
      const key = norm(name);
      if (ingByName.has(key)) return ingByName.get(key).id;
      const baseUnit = ['GRAM', 'ML', 'PIECE'].includes(unit) ? unit : 'PIECE';
      const ing = await prisma.ingredient.create({
        data: { restaurantId, locationId: locationId || null, name, baseUnit, cost: 0, stock: 0, isPendingReview: true },
      });
      ingByName.set(key, { id: ing.id, name });
      stats.ingredientesCreados++;
      return ing.id;
    }
    // Helper: obtiene/crea un SubRecipe por nombre (vacío si no existe).
    async function getSubRecipeId(name, unit) {
      const key = norm(name);
      if (subByName.has(key)) return subByName.get(key).id;
      const yieldUnit = ['GRAM', 'ML', 'PIECE'].includes(unit) ? unit : 'GRAM';
      const sr = await prisma.subRecipe.create({
        data: { restaurantId, name, yieldQty: 1, yieldUnit, isPendingReview: true },
      });
      subByName.set(key, { id: sr.id, name });
      return sr.id;
    }

    // 1) SUBRECETAS — asegurar existencia (pass A) y luego rellenar items (pass B).
    for (const s of subrecetas) await getSubRecipeId(s.name, s.yieldUnit);
    for (const s of subrecetas) {
      const id = subByName.get(norm(s.name)).id;
      const itemsData = [];
      for (const it of s.items) {
        if (!it.component || it.qty == null) continue;
        if (it.isSub) {
          itemsData.push({ nestedSubRecipeId: await getSubRecipeId(it.component, it.unit), qty: Number(it.qty), unit: it.unit, notes: null });
        } else {
          itemsData.push({ ingredientId: await getIngredientId(it.component, it.unit), qty: Number(it.qty), unit: it.unit, notes: null });
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.subRecipe.update({
          where: { id },
          data: {
            yieldQty: s.yieldQty != null ? Number(s.yieldQty) : 1,
            yieldUnit: ['GRAM', 'ML', 'PIECE'].includes(s.yieldUnit) ? s.yieldUnit : 'GRAM',
            marginErrorPct: Number(s.marginErrorPct) || 0,
            isPendingReview: false,
          },
        });
        await tx.subRecipeItem.deleteMany({ where: { subRecipeId: id } });
        if (itemsData.length) await tx.subRecipeItem.createMany({ data: itemsData.map((d) => ({ ...d, subRecipeId: id })) });
      });
      stats.subrecetasGuardadas++;
    }

    // 2) PLATOS — upsert Recipe por MenuItem.
    for (const d of platos) {
      const menuItemId = d.menuItemId || menuByName.get(norm(d.name))?.id;
      if (!menuItemId) { stats.platosSinMatch++; continue; }

      const itemsData = [];
      for (const it of d.items) {
        if (!it.component || it.qty == null) continue;
        if (it.isSub) {
          itemsData.push({ subRecipeId: await getSubRecipeId(it.component, it.unit), quantity: Number(it.qty), unit: it.unit, wastagePercent: Number(it.wastage) || 0 });
        } else {
          itemsData.push({ ingredientId: await getIngredientId(it.component, it.unit), quantity: Number(it.qty), unit: it.unit, wastagePercent: Number(it.wastage) || 0 });
        }
      }

      await prisma.$transaction(async (tx) => {
        const existing = await tx.recipe.findUnique({ where: { menuItemId } });
        const meta = {
          restaurantId,
          priceDelivery: d.priceDelivery != null ? Number(d.priceDelivery) : null,
          platformCommissionPct: d.commission != null ? Number(d.commission) : null,
        };
        const r = existing
          ? await tx.recipe.update({ where: { id: existing.id }, data: meta })
          : await tx.recipe.create({ data: { ...meta, menuItemId } });
        await tx.recipeItem.deleteMany({ where: { recipeId: r.id } });
        if (itemsData.length) await tx.recipeItem.createMany({ data: itemsData.map((x) => ({ ...x, recipeId: r.id })) });

        // Si el platillo trae precio de mesa distinto, actualizar MenuItem.price.
        if (d.priceMesa != null && Number(d.priceMesa) > 0) {
          await tx.menuItem.update({ where: { id: menuItemId }, data: { price: Number(d.priceMesa) } });
        }
      });
      stats.recetasGuardadas++;
    }

    res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('POST import/recetas/confirm:', e);
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
