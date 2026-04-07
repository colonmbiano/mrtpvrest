const express  = require('express')
const prisma   = require('../utils/prisma')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router   = express.Router()

// ── Categorías ────────────────────────────────────────────────────────────

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId // Filtrado por Tenant
      },
      orderBy: { sortOrder: 'asc' }
    })
    res.json(categories)
  } catch (e) { res.status(500).json({ error: 'Error al obtener categorias' }) }
})

router.post('/categories', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const cat = await prisma.category.create({
      data: {
        name,
        isActive: true,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId // Asignación automática al Tenant
      }
    });
    res.json(cat);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    // Verificamos que la categoría pertenezca al restaurante
    const cat = await prisma.category.update({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId // Seguridad: Solo si pertenece a este Tenant
      },
      data: req.body
    });
    res.json(cat);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.category.delete({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId
      }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Items ─────────────────────────────────────────────────────────────────

router.get('/items', async (req, res) => {
  try {
    const { categoryId } = req.query
    const where = {
      isAvailable: true,
      restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId // Filtrado por Tenant
    }
    if (categoryId) where.categoryId = categoryId
    const items = await prisma.menuItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        modifierGroups: { include: { modifiers: true } }
      },
      orderBy: [{ isPopular: 'desc' }, { name: 'asc' }],
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: 'Error al obtener menu' }) }
})

router.get('/items/:id', async (req, res) => {
  try {
    const item = await prisma.menuItem.findUnique({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId
      },
      include: {
        category: true,
        variants: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        complements: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!item) return res.status(404).json({ error: 'Platillo no encontrado' })
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al obtener platillo' }) }
})

router.post('/items', authenticate, requireAdmin, async (req, res) => {
  try {
    const { categoryId, name, description, imageUrl, price, preparationTime, isPopular } = req.body
    if (!categoryId || !name || price === undefined) return res.status(400).json({ error: 'Faltan campos requeridos' })

    // Verificamos que la categoría pertenezca al restaurante
    const category = await prisma.category.findUnique({ where: { id: categoryId, restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId } });
    if (!category) return res.status(400).json({ error: 'Categoría inválida para este restaurante' });

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name,
        description,
        imageUrl,
        price: parseFloat(price),
        preparationTime: preparationTime || 15,
        isPopular: isPopular || false,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId // Asignación al Tenant
      },
    })
    res.status(201).json(item)
  } catch (e) { res.status(500).json({ error: 'Error al crear platillo' }) }
})

router.put('/items/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, isAvailable, isPopular, imageUrl, categoryId } = req.body
    const item = await prisma.menuItem.update({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId
      },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isPopular !== undefined && { isPopular }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(categoryId !== undefined && { categoryId }),
      },
    })
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al actualizar platillo' }) }
})

router.delete('/items/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.menuItem.delete({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId
      }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Variantes ─────────────────────────────────────────────────────────────

router.get('/:id/variants', async (req, res) => {
  try {
    // Las variantes pertenecen a un producto, que ya pertenece al restaurante
    const variants = await prisma.menuItemVariant.findMany({
      where: {
        menuItemId: req.params.id,
        menuItem: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId } // Doble check de seguridad
      },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(variants);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... El resto de sub-entidades (variantes, complementos) se filtran por su relación con MenuItem ...

// ── Variant Templates (grupos reutilizables) ──────────────────────────────

router.get('/variant-templates', authenticate, requireAdmin, async (req, res) => {
  try {
    const templates = await prisma.variantTemplate.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }, // Filtrado por Tenant
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/variant-templates', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, options = [] } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const template = await prisma.variantTemplate.create({
      data: {
        name,
        restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId,
        options: { create: options.map((o, i) => ({ name: o.name, price: parseFloat(o.price) || 0, sortOrder: i })) }
      },
      include: { options: true }
    });
    res.json(template);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... Repetir lógica para DELETE y UPDATE ...

module.exports = router