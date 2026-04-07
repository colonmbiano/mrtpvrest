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
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const ingredients = await prisma.ingredient.findMany({
      where: { locationId: req.locationId }, // Stock Local
      include: { supplier: true },
      orderBy: { name: 'asc' }
    });
    res.json(ingredients);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/ingredients', authenticate, requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const ingredient = await prisma.ingredient.create({
      data: { ...req.body, locationId: req.locationId }
    });
    res.json(ingredient);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
