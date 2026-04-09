const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

// ── PROVEEDORES (Nivel Marca) ─────────────────────────────────────────────

router.get('/suppliers', authenticate, requireAdmin, async (req, res) => {
  try {
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }, // Global por Marca
      orderBy: { name: 'asc' }
    });
    res.json(suppliers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/suppliers', authenticate, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.create({
      data: { ...req.body, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/suppliers/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId },
      data: req.body
    });
    res.json(supplier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INGREDIENTES (Nivel Sucursal) ─────────────────────────────────────────

router.get('/ingredients', authenticate, requireAdmin, async (req, res) => {
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

router.post('/ingredients', authenticate, requireAdmin, async (req, res) => {
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

router.put('/ingredients/:id', authenticate, requireAdmin, async (req, res) => {
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

router.delete('/ingredients/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const locationId = req.headers['x-location-id'] || req.query.locationId;
    await prisma.ingredient.delete({ where: { id: req.params.id, locationId } });
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Ingrediente no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/bulk-confirm', authenticate, requireAdmin, async (req, res) => {
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

router.get('/movements', authenticate, requireAdmin, async (req, res) => {
  res.json([]); // TODO: Implementar lógica de movimientos
});

router.get('/alerts', authenticate, requireAdmin, async (req, res) => {
  res.json([]); // TODO: Implementar lógica de alertas
});

// ── RECETAS (Nivel Marca) ──────────────────────────────────────────────────

router.get('/recipes/:menuItemId', authenticate, requireAdmin, async (req, res) => {
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
