const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { notifyLowStock } = require('../services/notifications.service');
const { recordCostChange } = require('../services/cost-history.service');
const router = express.Router();

// ── PROVEEDORES (Nivel Marca) ─────────────────────────────────────────────

router.get('/suppliers', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }, // Global por Marca
      orderBy: { name: 'asc' }
    });
    res.json(suppliers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/suppliers', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.create({
      data: { ...req.body, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/suppliers/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      data: req.body
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INGREDIENTES (Nivel Sucursal) ─────────────────────────────────────────

// GET /api/inventory/alerts — ingredientes con stock <= minStock (widget dashboard)
router.get('/alerts', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const items = await prisma.ingredient.findMany({
      where: { locationId, minStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, stock: true, minStock: true },
      orderBy: { name: 'asc' },
    });
    const alerts = items
      .filter(i => i.stock <= i.minStock)
      .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));
    res.json(alerts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/ingredients', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const ingredients = await prisma.ingredient.findMany({
      where: { locationId },
      include: {
        supplier: true,
        type: { select: { id: true, name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
      orderBy: { name: 'asc' }
    });
    res.json(ingredients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const VALID_BASE_UNITS = ['GRAM', 'ML', 'PIECE'];

router.post('/ingredients', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId   = req.headers['x-location-id'] || req.query.locationId;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const {
      name, unit, stock, minStock, supplierId,
      purchaseUnit, purchaseCost, conversionFactor,
      // Nuevos (taxonomía + factor corrección + packaging)
      typeId, categoryId, baseUnit, pesoBruto, pesoNeto, isPackaging, purchaseQty,
    } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const ingredient = await prisma.$transaction(async (tx) => {
      const created = await tx.ingredient.create({
        data: {
          restaurantId,
          locationId,
          name,
          unit,
          stock: parseFloat(stock) || 0,
          minStock: parseFloat(minStock) || 0,
          cost,
          purchaseUnit: purchaseUnit || null,
          purchaseQty: purchaseQty != null ? parseFloat(purchaseQty) : 1,
          purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
          conversionFactor: factor,
          supplierId: supplierId || null,
          typeId: typeId || null,
          categoryId: categoryId || null,
          baseUnit: VALID_BASE_UNITS.includes(baseUnit) ? baseUnit : 'PIECE',
          pesoBruto: pesoBruto != null ? parseFloat(pesoBruto) : null,
          pesoNeto:  pesoNeto  != null ? parseFloat(pesoNeto)  : null,
          isPackaging: Boolean(isPackaging),
        }
      })
      if (cost > 0 || (purchaseCost != null && parseFloat(purchaseCost) > 0)) {
        await tx.ingredientCostHistory.create({
          data: {
            ingredientId: created.id,
            cost,
            purchaseCost: purchaseCost != null ? parseFloat(purchaseCost) : null,
            purchaseUnit: purchaseUnit || null,
            conversionFactor: factor,
            changedBy: req.user?.id ?? null,
            reason: 'manual_update',
          },
        })
      }
      return created
    });
    res.json(ingredient);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ingredients/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const {
      name, unit, stock, minStock, supplierId, purchaseUnit, purchaseCost, conversionFactor,
      typeId, categoryId, baseUnit, pesoBruto, pesoNeto, isPackaging, purchaseQty,
    } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const data = {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(stock !== undefined && { stock: parseFloat(stock) }),
      ...(minStock !== undefined && { minStock: parseFloat(minStock) }),
      ...(supplierId !== undefined && { supplierId: supplierId || null }),
      ...(purchaseUnit !== undefined && { purchaseUnit: purchaseUnit || null }),
      ...(purchaseQty !== undefined && { purchaseQty: parseFloat(purchaseQty) }),
      ...(purchaseCost !== undefined && { purchaseCost: parseFloat(purchaseCost), conversionFactor: factor, cost }),
      ...(purchaseCost === undefined && req.body.cost !== undefined && { cost: parseFloat(req.body.cost) }),
      // Nuevos
      ...(typeId !== undefined && { typeId: typeId || null }),
      ...(categoryId !== undefined && { categoryId: categoryId || null }),
      ...(baseUnit !== undefined && VALID_BASE_UNITS.includes(baseUnit) && { baseUnit }),
      ...(pesoBruto !== undefined && { pesoBruto: pesoBruto === null ? null : parseFloat(pesoBruto) }),
      ...(pesoNeto !== undefined && { pesoNeto: pesoNeto === null ? null : parseFloat(pesoNeto) }),
      ...(isPackaging !== undefined && { isPackaging: Boolean(isPackaging) }),
    };
    const ingredient = await prisma.$transaction(async (tx) => {
      // Registrar cost history ANTES del update — captura el estado anterior
      // y compara contra el nuevo. Si no hay cambio relevante, no inserta nada.
      await recordCostChange(
        tx,
        req.params.id,
        {
          cost: data.cost,
          purchaseCost: data.purchaseCost,
          purchaseUnit: data.purchaseUnit,
          conversionFactor: data.conversionFactor,
        },
        {
          changedBy: req.user?.id ?? null,
          reason: 'manual_update',
        },
      )
      return tx.ingredient.update({
        where: { id: req.params.id, locationId },
        data,
      })
    })
    res.json(ingredient);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ingrediente no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/ingredients/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    await prisma.ingredient.delete({ where: { id: req.params.id, locationId } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ingrediente no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/bulk-confirm', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'No hay ingredientes para confirmar' });

    const results = await Promise.all(items.map(async item => {
      const { name, totalCost, quantityFound, unit } = item;
      const factor = parseFloat(quantityFound) || 1;
      const cost = parseFloat(totalCost) / factor;
      const addedStock = parseFloat(quantityFound) || 0;

      const existing = await prisma.ingredient.findFirst({
        where: { locationId, name: { equals: name, mode: 'insensitive' } }
      });

      if (existing) {
        return prisma.$transaction(async (tx) => {
          await recordCostChange(
            tx,
            existing.id,
            { cost, purchaseCost: parseFloat(totalCost), conversionFactor: factor },
            { changedBy: req.user?.id ?? null, reason: 'bulk_import' },
          )
          return tx.ingredient.update({
            where: { id: existing.id },
            data: {
              cost,
              purchaseCost: parseFloat(totalCost),
              conversionFactor: factor,
              stock: existing.stock + addedStock,
              ...(unit && { unit }),
            },
          })
        })
      }

      // En el create no hay history previo, pero queremos el primer datapoint
      // para que la gráfica de costos arranque desde la primera compra.
      return prisma.$transaction(async (tx) => {
        const created = await tx.ingredient.create({
          data: {
            restaurantId, locationId, name,
            unit: unit || 'pz',
            stock: addedStock,
            minStock: 0,
            cost,
            purchaseCost: parseFloat(totalCost),
            conversionFactor: factor,
          }
        })
        await tx.ingredientCostHistory.create({
          data: {
            ingredientId: created.id,
            cost,
            purchaseCost: parseFloat(totalCost),
            conversionFactor: factor,
            changedBy: req.user?.id ?? null,
            reason: 'bulk_import',
          },
        })
        return created
      })
    }));

    res.json({ ok: true, count: results.length });
  } catch (e) {
    console.error('bulk-confirm error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── MOVIMIENTOS DE INVENTARIO (IN / OUT / ADJUST) ─────────────────────────
//
// Movimientos quedan asociados al ingrediente; el scope por sucursal se
// resuelve via ingredient.locationId. Actualizamos el stock del ingrediente
// atómicamente en la misma transacción.

// Movimientos · ahora leen y escriben StockMovement (libro mayor unificado).
// Mantener la API pública {type, quantity} para no romper el admin UI
// existente — internamente mapeamos:
//   IN     → reason=PURCHASE,    delta=+qty
//   OUT    → reason=ADJUSTMENT,  delta=-qty  (usar /api/waste para mermas)
//   ADJUST → reason=PHYSICAL_COUNT, delta=newStock-oldStock
const MOVEMENT_TYPES = new Set(['IN', 'OUT', 'ADJUST']);

const TYPE_TO_REASON = {
  IN:     'PURCHASE',
  OUT:    'ADJUSTMENT',
  ADJUST: 'PHYSICAL_COUNT',
};

// Vista legacy del shape que la UI vieja esperaba.
function toLegacyMovement(sm) {
  // Inferir el tipo legacy desde el reason.
  let type = 'OUT';
  if (sm.reason === 'PURCHASE') type = 'IN';
  else if (sm.reason === 'PHYSICAL_COUNT') type = 'ADJUST';
  else if (sm.delta > 0) type = 'IN';
  return {
    id: sm.id,
    ingredientId: sm.ingredientId,
    type,
    quantity: Math.abs(Number(sm.delta || 0)),
    reason: sm.notes || sm.reason,
    orderId: sm.refType === 'order' ? sm.refId : null,
    createdAt: sm.createdAt,
    ingredient: sm.ingredient,
  };
}

router.get('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const take = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const where = { locationId };
    if (req.query.ingredientId) where.ingredientId = String(req.query.ingredientId);
    if (req.query.type) {
      const t = String(req.query.type).toUpperCase();
      if (MOVEMENT_TYPES.has(t)) {
        if (t === 'IN') where.delta = { gt: 0 };
        else if (t === 'OUT') where.delta = { lt: 0 };
        else if (t === 'ADJUST') where.reason = 'PHYSICAL_COUNT';
      }
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        ingredient: { select: { id: true, name: true, unit: true, stock: true, minStock: true } },
      },
    });
    res.json(movements.map(toLegacyMovement));
  } catch (e) {
    console.error('GET /inventory/movements:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const userId = req.user?.id || null;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { ingredientId, type, quantity, reason, orderId } = req.body || {};
    const typeU = String(type || '').toUpperCase();
    const qty = Number(quantity);

    if (!ingredientId) return res.status(400).json({ error: 'ingredientId requerido' });
    if (!MOVEMENT_TYPES.has(typeU)) {
      return res.status(400).json({ error: `type inválido. Valores: ${[...MOVEMENT_TYPES].join(', ')}` });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ error: 'quantity debe ser un número positivo' });
    }

    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
      select: { id: true, locationId: true, stock: true, minStock: true, name: true, unit: true, baseUnit: true },
    });
    if (!ingredient || ingredient.locationId !== locationId) {
      return res.status(404).json({ error: 'Ingrediente no encontrado en esta sucursal' });
    }

    // Mapear type legacy → delta y nuevo stock.
    let delta;
    if (typeU === 'IN') {
      delta = qty;
    } else if (typeU === 'OUT') {
      if (ingredient.stock - qty < 0) {
        return res.status(409).json({ error: 'Stock insuficiente', current: ingredient.stock });
      }
      delta = -qty;
    } else { // ADJUST: quantity es el stock absoluto nuevo
      delta = qty - Number(ingredient.stock);
    }

    const newStock = Number(ingredient.stock) + delta;

    const [updated, movement] = await prisma.$transaction([
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: { stock: newStock },
        select: { id: true, name: true, unit: true, stock: true, minStock: true },
      }),
      prisma.stockMovement.create({
        data: {
          ingredientId,
          locationId,
          delta,
          unit: ingredient.baseUnit,
          reason: TYPE_TO_REASON[typeU],
          refType: orderId ? 'order' : null,
          refId: orderId || null,
          balanceAfter: newStock,
          userId,
          notes: reason || null,
        },
      }),
    ]);

    const lowStock = updated.minStock > 0 && updated.stock <= updated.minStock;
    if (lowStock) notifyLowStock(updated, locationId).catch(() => {});

    res.status(201).json({ movement: toLegacyMovement({ ...movement, ingredient: updated }), ingredient: updated, lowStock });
  } catch (e) {
    console.error('POST /inventory/movements:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── RECETAS (Nivel Marca) ──────────────────────────────────────────────────

router.get('/recipes/:menuItemId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const recipes = await prisma.recipeItem.findMany({
      where: {
        menuItemId: req.params.menuItemId,
        menuItem: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
      },
      include: { ingredient: true }
    });
    res.json(recipes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
