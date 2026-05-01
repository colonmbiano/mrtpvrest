const express  = require('express')
const prisma   = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
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

router.post('/categories', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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

router.put('/categories/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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

router.delete('/categories/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
      restaurantId: req.user?.restaurantId || req.restaurantId
    }
    if (categoryId) where.categoryId = categoryId

    const items = await prisma.menuItem.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        modifierGroups: { include: { modifiers: true } }
      },
      orderBy: [{ isPromo: 'desc' }, { isPopular: 'desc' }, { name: 'asc' }],
    })

    // Filtrar promos por día actual en timezone México
    const todayDay = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', weekday: 'long'
    }).format(new Date()).toUpperCase() // → "MONDAY", "TUESDAY", etc.

    const filtered = items.filter(item => {
      if (!item.isPromo) return true
      return item.activeDays.includes(todayDay)
    })

    res.json(filtered)
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

router.post('/items', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { categoryId, name, description, imageUrl, price, preparationTime, isPopular, isPromo, activeDays } = req.body
    if (!categoryId || !name || price === undefined) return res.status(400).json({ error: 'Faltan campos requeridos' })

    const category = await prisma.category.findUnique({ where: { id: categoryId, restaurantId: req.user?.restaurantId || req.restaurantId } });
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
        isPromo: isPromo || false,
        activeDays: activeDays || [],
        restaurantId: req.user?.restaurantId || req.restaurantId
      },
    })
    res.status(201).json(item)
  } catch (e) { res.status(500).json({ error: 'Error al crear platillo' }) }
})

router.put('/items/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, isAvailable, isPopular, imageUrl, categoryId, isPromo, activeDays } = req.body
    const item = await prisma.menuItem.update({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.restaurantId
      },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isPopular !== undefined && { isPopular }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isPromo !== undefined && { isPromo }),
        ...(activeDays !== undefined && { activeDays }),
      },
    })
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al actualizar platillo' }) }
})

router.delete('/items/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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

router.get('/variant-templates', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const templates = await prisma.variantTemplate.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId }, // Filtrado por Tenant
      include: { options: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(templates);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/variant-templates', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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

router.post('/variant-templates/:id/options', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    
    // Verificar que el template pertenezca al restaurante
    const template = await prisma.variantTemplate.findUnique({
      where: { id },
    });
    
    if (!template) return res.status(404).json({ error: 'Template no encontrado' });
    if (template.restaurantId !== (req.user?.restaurantId || req.restaurantId)) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    
    const option = await prisma.variantTemplateOption.create({
      data: {
        templateId: id,
        name,
        price: parseFloat(price) || 0,
        sortOrder: 0
      }
    });
    
    res.status(201).json(option);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/variant-templates/:id/options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, price, sortOrder } = req.body;
    
    const option = await prisma.variantTemplateOption.update({
      where: { id: req.params.optionId },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(sortOrder !== undefined && { sortOrder })
      }
    });
    
    res.json(option);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/variant-templates/:id/options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.variantTemplateOption.delete({
      where: { id: req.params.optionId }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Modificadores (Grupos y opciones) ─────────────────────────────────────
//
// Estructura: MenuItem → ModifierGroup[] → Modifier[].
// El tenant scoping se verifica subiendo por la relación: cada grupo
// pertenece a un MenuItem, que tiene restaurantId directo.

async function assertItemBelongsToTenant(itemId, restaurantId) {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    select: { id: true, restaurantId: true },
  });
  if (!item) return { error: 'Platillo no encontrado', code: 404 };
  if (item.restaurantId !== restaurantId) return { error: 'No autorizado', code: 403 };
  return { item };
}

async function assertGroupBelongsToTenant(groupId, restaurantId) {
  const group = await prisma.modifierGroup.findUnique({
    where: { id: groupId },
    select: { id: true, menuItem: { select: { restaurantId: true } } },
  });
  if (!group) return { error: 'Grupo no encontrado', code: 404 };
  if (group.menuItem.restaurantId !== restaurantId) return { error: 'No autorizado', code: 403 };
  return { group };
}

async function assertModifierBelongsToTenant(modifierId, restaurantId) {
  const modifier = await prisma.modifier.findUnique({
    where: { id: modifierId },
    select: { id: true, group: { select: { menuItem: { select: { restaurantId: true } } } } },
  });
  if (!modifier) return { error: 'Modificador no encontrado', code: 404 };
  if (modifier.group.menuItem.restaurantId !== restaurantId) {
    return { error: 'No autorizado', code: 403 };
  }
  return { modifier };
}

router.post('/items/:itemId/modifier-groups', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertItemBelongsToTenant(req.params.itemId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    const { name, required, multiSelect, minSelection, maxSelection, freeModifiersLimit } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });

    const group = await prisma.modifierGroup.create({
      data: {
        menuItemId: req.params.itemId,
        name,
        required: !!required,
        multiSelect: !!multiSelect,
        minSelection: parseInt(minSelection) || 0,
        maxSelection: parseInt(maxSelection) || 0,
        freeModifiersLimit: parseInt(freeModifiersLimit) || 0,
      },
      include: { modifiers: true },
    });
    res.status(201).json(group);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/modifier-groups/:groupId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertGroupBelongsToTenant(req.params.groupId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    const { name, required, multiSelect, minSelection, maxSelection, freeModifiersLimit } = req.body;
    const group = await prisma.modifierGroup.update({
      where: { id: req.params.groupId },
      data: {
        ...(name !== undefined && { name }),
        ...(required !== undefined && { required: !!required }),
        ...(multiSelect !== undefined && { multiSelect: !!multiSelect }),
        ...(minSelection !== undefined && { minSelection: parseInt(minSelection) || 0 }),
        ...(maxSelection !== undefined && { maxSelection: parseInt(maxSelection) || 0 }),
        ...(freeModifiersLimit !== undefined && { freeModifiersLimit: parseInt(freeModifiersLimit) || 0 }),
      },
      include: { modifiers: true },
    });
    res.json(group);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/modifier-groups/:groupId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertGroupBelongsToTenant(req.params.groupId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    await prisma.modifierGroup.delete({ where: { id: req.params.groupId } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/modifier-groups/:groupId/modifiers', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertGroupBelongsToTenant(req.params.groupId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    const { name, priceAdd, isDefault } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });

    const modifier = await prisma.modifier.create({
      data: {
        groupId: req.params.groupId,
        name,
        priceAdd: parseFloat(priceAdd) || 0,
        isDefault: !!isDefault,
      },
    });
    res.status(201).json(modifier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/modifiers/:modifierId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertModifierBelongsToTenant(req.params.modifierId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    const { name, priceAdd, isDefault } = req.body;
    const modifier = await prisma.modifier.update({
      where: { id: req.params.modifierId },
      data: {
        ...(name !== undefined && { name }),
        ...(priceAdd !== undefined && { priceAdd: parseFloat(priceAdd) || 0 }),
        ...(isDefault !== undefined && { isDefault: !!isDefault }),
      },
    });
    res.json(modifier);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/modifiers/:modifierId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertModifierBelongsToTenant(req.params.modifierId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    await prisma.modifier.delete({ where: { id: req.params.modifierId } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Menú Público (sin auth) ────────────────────────────────────────────────

router.get('/public/:slug/menu', async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: req.params.slug },
      select: { id: true, name: true, logoUrl: true, isActive: true }
    })
    if (!restaurant || !restaurant.isActive)
      return res.status(404).json({ error: 'Restaurante no encontrado' })

    const todayDay = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City', weekday: 'long'
    }).format(new Date()).toUpperCase()

    const categories = await prisma.category.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isAvailable: true },
          orderBy: [{ isPromo: 'desc' }, { isPopular: 'desc' }, { name: 'asc' }],
          select: {
            id: true, name: true, description: true,
            price: true, imageUrl: true,
            isPopular: true, isPromo: true, activeDays: true,
          }
        }
      }
    })

    // Filtrar promos inactivas hoy de cada categoría
    const filtered = categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item =>
          !item.isPromo || item.activeDays.includes(todayDay)
        )
      }))
      .filter(cat => cat.items.length > 0)

    res.json({
      restaurant: { name: restaurant.name, logoUrl: restaurant.logoUrl },
      categories: filtered,
      todayDay,
    })
  } catch (e) {
    console.error('GET /menu/public/:slug/menu', e)
    res.status(500).json({ error: 'Error al obtener menú' })
  }
})

// ... Repetir lógica para DELETE y UPDATE ...

module.exports = router