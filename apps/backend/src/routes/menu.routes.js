const express  = require('express')
const prisma   = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const router   = express.Router()

// ── Helper: resuelve restaurantId del request o devuelve 400 explícito ─────
// El catálogo es público (lo consume la tienda online), pero NO puede listarse
// sin contexto de tenant — sin esta guarda Prisma trataría `restaurantId:
// undefined` como "sin filtro" y devolvería items de todos los restaurantes.
function resolveRestaurantId(req, res) {
  const id = req.user?.restaurantId || req.restaurantId;
  if (!id) {
    res.status(400).json({
      error: 'Restaurante no identificado. Envíe x-restaurant-id, x-restaurant-slug o subdominio.',
      code: 'TENANT_REQUIRED',
    });
    return null;
  }
  return id;
}

function getTodayDay() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', weekday: 'long'
  }).format(new Date()).toUpperCase()
}

function isMenuItemActiveToday(item, todayDay) {
  const activeDays = Array.isArray(item.activeDays) ? item.activeDays : []
  if (activeDays.length === 0) return !item.isPromo
  return activeDays.includes(todayDay)
}

// ── Categorías ────────────────────────────────────────────────────────────

router.get('/categories', async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req, res);
    if (!restaurantId) return;

    const adminMode = req.query.admin === 'true' || req.query.admin === '1';
    const categories = await prisma.category.findMany({
      where: {
        restaurantId,
        ...(adminMode ? {} : { isActive: true }),
      },
      include: {
        // Default route por categoría (Printer Groups). El TPV lo
        // consume al cobrar para enrutar items sin override propio.
        printerGroups: {
          include: { printerGroup: { select: { id: true, name: true } } },
        },
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

// ── Helper: sincroniza las variantes (MenuItemVariant) de un item a partir
// de los Grupos de Variantes (VariantTemplate) marcados en el admin.
// El TPV solo abre el selector de sabores cuando el item tiene
// hasVariants=true Y al menos una variante, así que mantenemos ese flag
// alineado con la selección. Es idempotente: reemplaza el set completo,
// de modo que marcar/desmarcar grupos agrega o quita variantes.
async function syncItemVariantsFromTemplates(menuItemId, restaurantId, variantTemplateIds) {
  const ids = Array.isArray(variantTemplateIds)
    ? [...new Set(variantTemplateIds.filter(Boolean))]
    : [];

  const templates = ids.length
    ? await prisma.variantTemplate.findMany({
        where: { id: { in: ids }, restaurantId },
        include: { options: { orderBy: { sortOrder: 'asc' } } },
      })
    : [];

  // Respeta el orden en que se seleccionaron los grupos y deduplica
  // opciones repetidas por nombre (dos grupos con "BBQ" → una sola).
  const byId = new Map(templates.map((t) => [t.id, t]));
  const seen = new Set();
  const data = [];
  for (const id of ids) {
    const tpl = byId.get(id);
    if (!tpl) continue;
    for (const opt of tpl.options) {
      const key = opt.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      data.push({ menuItemId, name: opt.name, price: opt.price, sortOrder: data.length });
    }
  }

  await prisma.$transaction([
    prisma.menuItemVariant.deleteMany({ where: { menuItemId } }),
    ...(data.length ? [prisma.menuItemVariant.createMany({ data })] : []),
    prisma.menuItem.update({
      where: { id: menuItemId },
      data: { hasVariants: data.length > 0 },
    }),
  ]);
}

// ── Items ─────────────────────────────────────────────────────────────────

router.get('/items', async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req, res);
    if (!restaurantId) return;

    const { categoryId, favorites, admin } = req.query
    const adminMode = admin === 'true' || admin === '1'
    const where = { restaurantId }
    if (!adminMode) where.isAvailable = true
    if (categoryId) where.categoryId = categoryId
    // ?favorites=true filtra solo los pinned por el admin. El TPV lo
    // usa para el tile "★ Favoritos" del catálogo drill-down.
    if (favorites === 'true' || favorites === '1') where.isFavorite = true

    const items = await prisma.menuItem.findMany({
      where,
      include: {
        category: {
          select: {
            id: true, name: true,
            // El default route del item se hereda de su categoría si
            // el item no tiene override propio. Lo incluimos para que
            // el TPV resuelva todo client-side al cobrar.
            printerGroups: {
              include: { printerGroup: { select: { id: true, name: true } } },
            },
          },
        },
        modifierGroups: { include: { modifiers: true } },
        variants: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        complements: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        printerGroups: {
          include: { printerGroup: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ isFavorite: 'desc' }, { isPromo: 'desc' }, { isPopular: 'desc' }, { name: 'asc' }],
    })

    // Filtrar por día actual en timezone México. Si activeDays está vacío,
    // los platillos regulares quedan siempre visibles; las promos sin día
    // configurado siguen ocultas como antes.
    const todayDay = getTodayDay()
    const filtered = adminMode ? items : items.filter(item => isMenuItemActiveToday(item, todayDay))

    res.json(filtered)
  } catch (e) { res.status(500).json({ error: 'Error al obtener menu' }) }
})

router.get('/items/:id', async (req, res) => {
  try {
    const restaurantId = resolveRestaurantId(req, res);
    if (!restaurantId) return;

    // findFirst en lugar de findUnique para que el filtro restaurantId aplique
    // (findUnique con campo no-único en where puede ignorarlo silenciosamente).
    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.id, restaurantId },
      include: {
        category: true,
        variants: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        complements: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
        modifierGroups: { include: { modifiers: true }, orderBy: { position: 'asc' } },
      },
    })
    if (!item) return res.status(404).json({ error: 'Platillo no encontrado' })

    // Reconstruye qué Grupos de Variantes están aplicados para que el form
    // del admin re-marque los checkboxes. Sin esto el form mandaría
    // variantTemplateIds=[] al re-editar y el sync borraría las variantes.
    // Un grupo se considera aplicado si todos los nombres de sus opciones
    // existen entre las variantes del item (las creamos a partir de ellos).
    const templates = await prisma.variantTemplate.findMany({
      where: { restaurantId },
      include: { options: { select: { name: true } } },
    })
    const variantNames = new Set(item.variants.map((v) => v.name.trim().toLowerCase()))
    const variantTemplates = templates
      .filter((t) =>
        t.options.length > 0 &&
        t.options.every((o) => variantNames.has(o.name.trim().toLowerCase())))
      .map((t) => ({ id: t.id, name: t.name }))

    res.json({ ...item, variantTemplates })
  } catch (e) { res.status(500).json({ error: 'Error al obtener platillo' }) }
})

router.post('/items', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { categoryId, name, description, imageUrl, price, preparationTime, isPopular, isPromo, activeDays, variantTemplateIds } = req.body
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
    if (variantTemplateIds !== undefined) {
      await syncItemVariantsFromTemplates(item.id, item.restaurantId, variantTemplateIds)
    }
    res.status(201).json(item)
  } catch (e) { res.status(500).json({ error: 'Error al crear platillo' }) }
})

router.put('/items/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, isAvailable, isPopular, isFavorite, imageUrl, categoryId, isPromo, activeDays, variantTemplateIds } = req.body
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
        ...(isFavorite !== undefined && { isFavorite: !!isFavorite }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isPromo !== undefined && { isPromo }),
        ...(activeDays !== undefined && { activeDays }),
      },
    })
    if (variantTemplateIds !== undefined) {
      await syncItemVariantsFromTemplates(
        item.id,
        req.user?.restaurantId || req.restaurantId,
        variantTemplateIds,
      )
    }
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al actualizar platillo' }) }
})

// PATCH dedicado para el toggle ⭐ desde /admin/menu — lighter que un PUT
// completo y más fácil de auditar. Body: { isFavorite: boolean }.
router.patch('/items/:id/favorite', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { isFavorite } = req.body || {};
    if (typeof isFavorite !== 'boolean') {
      return res.status(400).json({ error: 'isFavorite debe ser boolean' });
    }
    const item = await prisma.menuItem.update({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.restaurantId,
      },
      data: { isFavorite },
      select: { id: true, isFavorite: true },
    });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error al actualizar favorito' });
  }
});

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
    const restaurantId = resolveRestaurantId(req, res);
    if (!restaurantId) return;

    // Las variantes pertenecen a un producto que ya pertenece al restaurante.
    // Filtramos por la relación menuItem.restaurantId para no exponer variantes
    // de productos de otros tenants.
    const variants = await prisma.menuItemVariant.findMany({
      where: {
        menuItemId: req.params.id,
        menuItem: { restaurantId }
      },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(variants);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/variants', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertItemBelongsToTenant(req.params.id, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { name, price } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const variant = await prisma.menuItemVariant.create({
      data: { menuItemId: req.params.id, name, price: parseFloat(price) || 0 },
    });
    await prisma.menuItem.update({ where: { id: req.params.id }, data: { hasVariants: true } });
    res.status(201).json(variant);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/variants/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, price, isAvailable } = req.body;
    const variant = await prisma.menuItemVariant.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price: parseFloat(price) || 0 }),
        ...(isAvailable !== undefined && { isAvailable: !!isAvailable }),
      },
    });
    res.json(variant);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/variants/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const variant = await prisma.menuItemVariant.delete({ where: { id: req.params.id } });
    const remaining = await prisma.menuItemVariant.count({ where: { menuItemId: variant.menuItemId, isAvailable: true } });
    await prisma.menuItem.update({ where: { id: variant.menuItemId }, data: { hasVariants: remaining > 0 } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/items/:id/complements', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertItemBelongsToTenant(req.params.id, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { name, price } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const complement = await prisma.menuItemComplement.create({
      data: { menuItemId: req.params.id, name, price: parseFloat(price) || 0 },
    });
    res.status(201).json(complement);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/items/complements/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, price, isAvailable } = req.body;
    const complement = await prisma.menuItemComplement.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(price !== undefined && { price: parseFloat(price) || 0 }),
        ...(isAvailable !== undefined && { isAvailable: !!isAvailable }),
      },
    });
    res.json(complement);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/items/complements/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.menuItemComplement.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... El resto de sub-entidades se filtran por su relación con MenuItem ...

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

router.put('/variant-templates/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const template = await prisma.variantTemplate.update({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.restaurantId,
      },
      data: { name },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(template);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/variant-templates/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.variantTemplate.delete({
      where: {
        id: req.params.id,
        restaurantId: req.user?.restaurantId || req.restaurantId,
      },
    });
    res.json({ ok: true });
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

router.put('/variant-templates/options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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

router.delete('/variant-templates/options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
            price: true, promoPrice: true, imageUrl: true,
            isPopular: true, isPromo: true, activeDays: true,
            complements: {
              where: { isAvailable: true },
              select: { id: true, name: true, price: true, sortOrder: true },
              orderBy: { sortOrder: 'asc' },
            },
          }
        }
      }
    })

    // Filtrar promos inactivas hoy de cada categoría
    const filtered = categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => isMenuItemActiveToday(item, todayDay))
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
