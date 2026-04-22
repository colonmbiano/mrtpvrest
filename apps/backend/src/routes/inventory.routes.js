const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { notifyLowStock } = require('../services/notifications.service');
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
      include: { supplier: true },
      orderBy: { name: 'asc' }
    });
    res.json(ingredients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ingredients', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { name, unit, stock, minStock, supplierId, purchaseUnit, purchaseCost, conversionFactor } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const ingredient = await prisma.ingredient.create({
      data: { name, unit, stock: parseFloat(stock) || 0, minStock: parseFloat(minStock) || 0,
        cost, purchaseUnit: purchaseUnit || null, purchaseCost: purchaseCost ? parseFloat(purchaseCost) : null,
        conversionFactor: factor, supplierId: supplierId || null, locationId }
    });
    res.json(ingredient);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/ingredients/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    const { name, unit, stock, minStock, supplierId, purchaseUnit, purchaseCost, conversionFactor } = req.body;
    const factor = parseFloat(conversionFactor) || 1;
    const cost = purchaseCost ? parseFloat(purchaseCost) / factor : parseFloat(req.body.cost) || 0;
    const data = {
      ...(name !== undefined && { name }),
      ...(unit !== undefined && { unit }),
      ...(stock !== undefined && { stock: parseFloat(stock) }),
      ...(minStock !== undefined && { minStock: parseFloat(minStock) }),
      ...(supplierId !== undefined && { supplierId: supplierId || null }),
      ...(purchaseUnit !== undefined && { purchaseUnit: purchaseUnit || null }),
      ...(purchaseCost !== undefined && { purchaseCost: parseFloat(purchaseCost), conversionFactor: factor, cost }),
      ...(purchaseCost === undefined && req.body.cost !== undefined && { cost: parseFloat(req.body.cost) }),
    };
    const ingredient = await prisma.ingredient.update({
      where: { id: req.params.id, locationId },
      data
    });
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
        return prisma.ingredient.update({
          where: { id: existing.id },
          data: {
            cost,
            purchaseCost: parseFloat(totalCost),
            conversionFactor: factor,
            stock: existing.stock + addedStock,
            ...(unit && { unit }),
          }
        });
      }

      return prisma.ingredient.create({
        data: {
          locationId, name,
          unit: unit || 'pz',
          stock: addedStock,
          minStock: 0,
          cost,
          purchaseCost: parseFloat(totalCost),
          conversionFactor: factor,
        }
      });
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

const MOVEMENT_TYPES = new Set(['IN', 'OUT', 'ADJUST']);

router.get('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const take = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const where = { ingredient: { locationId } };
    if (req.query.ingredientId) where.ingredientId = String(req.query.ingredientId);
    if (req.query.type && MOVEMENT_TYPES.has(String(req.query.type).toUpperCase())) {
      where.type = String(req.query.type).toUpperCase();
    }

    const movements = await prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        ingredient: { select: { id: true, name: true, unit: true, stock: true, minStock: true } },
      },
    });
    res.json(movements);
  } catch (e) {
    console.error('GET /inventory/movements:', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/movements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
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
      select: { id: true, locationId: true, stock: true, minStock: true, name: true, unit: true },
    });
    if (!ingredient || ingredient.locationId !== locationId) {
      return res.status(404).json({ error: 'Ingrediente no encontrado en esta sucursal' });
    }

    // Delta final aplicado al stock según el tipo.
    // ADJUST interpreta quantity como stock absoluto nuevo; IN suma; OUT resta.
    let stockUpdate;
    let movementQty = qty;
    if (typeU === 'IN') {
      stockUpdate = { stock: { increment: qty } };
    } else if (typeU === 'OUT') {
      if (ingredient.stock - qty < 0) {
        return res.status(409).json({ error: 'Stock insuficiente', current: ingredient.stock });
      }
      stockUpdate = { stock: { decrement: qty } };
    } else { // ADJUST
      stockUpdate = { stock: qty };
      movementQty = qty - ingredient.stock; // delta registrado
    }

    const [movement, updated] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          ingredientId,
          type: typeU,
          quantity: movementQty,
          reason: reason || '',
          orderId: orderId || null,
        },
      }),
      prisma.ingredient.update({
        where: { id: ingredientId },
        data: stockUpdate,
        select: { id: true, name: true, unit: true, stock: true, minStock: true },
      }),
    ]);

    const lowStock = updated.minStock > 0 && updated.stock <= updated.minStock;

    if (lowStock) notifyLowStock(updated, locationId).catch(() => {});

    res.status(201).json({ movement, ingredient: updated, lowStock });
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
