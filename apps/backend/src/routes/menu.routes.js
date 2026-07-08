const express  = require('express')
const prisma   = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const { pick } = require('../lib/validate')
const { PromoPriceValidationError, resolvePromoPricing } = require('../lib/promo-price')
const { isPromoWindowOpen } = require('../lib/promo-window')
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

// Normaliza la unidad de venta a PIECE | WEIGHT | ORDER. Acepta el valor
// explícito `saleUnit`; si no viene, lo deriva del booleano legacy
// `soldByWeight` (WEIGHT/PIECE). Default PIECE.
function normalizeSaleUnit(saleUnit, soldByWeight) {
  const v = String(saleUnit || '').toUpperCase()
  if (v === 'PIECE' || v === 'WEIGHT' || v === 'ORDER') return v
  if (saleUnit === undefined && soldByWeight !== undefined) return soldByWeight ? 'WEIGHT' : 'PIECE'
  return 'PIECE'
}

// Unidad de medida mostrada (etiqueta libre). Sanea: trim, minúsculas-ish,
// máx 12 chars. Si no viene, la deriva de la unidad de venta (kg/orden/pz)
// para un default coherente. No se valida contra una lista cerrada a
// propósito (el admin puede usar "bolsa", "lata", "docena", etc.).
function normalizeMeasureUnit(unit, saleUnit) {
  if (typeof unit === 'string' && unit.trim()) return unit.trim().slice(0, 12)
  if (saleUnit === 'WEIGHT') return 'kg'
  if (saleUnit === 'ORDER') return 'orden'
  return 'pz'
}

function getTodayDay() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', weekday: 'long'
  }).format(new Date()).toUpperCase()
}

function isMenuItemActiveToday(item, todayDay) {
  const activeDays = Array.isArray(item.activeDays) ? item.activeDays : []
  // Sin agenda configurada → siempre visible (promo o no). La agenda por días
  // solo restringe cuando el admin la configura explícitamente.
  if (activeDays.length === 0) return true
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
      // Allowlist (no req.body directo): restaurantId/relaciones quedan fuera.
      data: pick(req.body, ['name', 'description', 'imageUrl', 'sortOrder', 'isActive'])
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
        comboComponents: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
              // Trae la estación (printerGroups) de cada opción de combo: item-override
              // o el default de su categoría. El TPV rutea cada componente del combo a
              // su estación en la comanda (explosión por estación en printer-tcp).
              include: { optionMenuItem: { select: {
                id: true, name: true, imageUrl: true,
                printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } },
                category: { select: { printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } } } },
              } } },
            },
          },
        },
      },
      orderBy: [{ isFavorite: 'desc' }, { isPromo: 'desc' }, { isPopular: 'desc' }, { name: 'asc' }],
    })

    // Filtrar por día actual en timezone México. Si activeDays está vacío,
    // los platillos regulares quedan siempre visibles; las promos sin día
    // configurado siguen ocultas como antes.
    const todayDay = getTodayDay()
    let filtered = adminMode ? items : items.filter(item => isMenuItemActiveToday(item, todayDay))

    // Ventana horaria de promos (config del restaurante): fuera del horario,
    // los platillos promo se ocultan del catálogo (igual que activeDays).
    if (!adminMode && !(await isPromoWindowOpen(prisma, restaurantId))) {
      filtered = filtered.filter(item => !item.isPromo)
    }

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
        modifierGroups: { include: { modifiers: true } },
        comboComponents: {
          orderBy: { sortOrder: 'asc' },
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
              include: { optionMenuItem: { select: {
                id: true, name: true, imageUrl: true,
                printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } },
                category: { select: { printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } } } },
              } } },
            },
          },
        },
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
    const { categoryId, name, description, imageUrl, imageFit, price, preparationTime, isPopular, isPromo, promoPrice, activeDays, variantTemplateIds, variantMultiSelect, variantMinSelection, variantMaxSelection, availableOnline, availableOnKiosk, isCombo, soldByWeight, saleUnit, unit } = req.body
    if (!categoryId || !name || price === undefined) return res.status(400).json({ error: 'Faltan campos requeridos' })
    // Unidad de venta (comportamiento) normalizada; soldByWeight deriva de ella.
    const sUnit = normalizeSaleUnit(saleUnit, soldByWeight)
    // Unidad de medida MOSTRADA (etiqueta libre, cosmética).
    const measureUnit = normalizeMeasureUnit(unit, sUnit)

    const category = await prisma.category.findUnique({ where: { id: categoryId, restaurantId: req.user?.restaurantId || req.restaurantId } });
    if (!category) return res.status(400).json({ error: 'Categoría inválida para este restaurante' });
    const regularPrice = parseFloat(price)
    const promo = resolvePromoPricing({ isPromo, promoPrice, regularPrice })

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name,
        description,
        imageUrl,
        imageFit: imageFit === 'contain' ? 'contain' : 'cover',
        price: regularPrice,
        preparationTime: preparationTime || 15,
        availableOnline: availableOnline === undefined ? true : !!availableOnline,
        availableOnKiosk: availableOnKiosk === undefined ? true : !!availableOnKiosk,
        isCombo: !!isCombo,
        isPopular: isPopular || false,
        isPromo: promo.isPromo,
        promoPrice: promo.promoPrice,
        activeDays: activeDays || [],
        variantMultiSelect: !!variantMultiSelect,
        variantMinSelection: Math.max(0, parseInt(variantMinSelection, 10) || 0),
        variantMaxSelection: Math.max(0, parseInt(variantMaxSelection, 10) || 0),
        saleUnit: sUnit,
        soldByWeight: sUnit === 'WEIGHT',
        unit: measureUnit,
        restaurantId: req.user?.restaurantId || req.restaurantId
      },
    })
    if (variantTemplateIds !== undefined) {
      await syncItemVariantsFromTemplates(item.id, item.restaurantId, variantTemplateIds)
    }
    res.status(201).json(item)
  } catch (e) {
    if (e instanceof PromoPriceValidationError) return res.status(400).json({ error: e.message })
    res.status(500).json({ error: 'Error al crear platillo' })
  }
})

router.put('/items/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId
    const { name, description, price, isAvailable, isPopular, isFavorite, imageUrl, imageFit, categoryId, isPromo, promoPrice, activeDays, variantTemplateIds, variantMultiSelect, variantMinSelection, variantMaxSelection, availableOnline, availableOnKiosk, isCombo, soldByWeight, saleUnit, unit } = req.body
    const existingItem = await prisma.menuItem.findFirst({
      where: { id: req.params.id, restaurantId },
      select: { price: true, isPromo: true, promoPrice: true },
    })
    if (!existingItem) return res.status(404).json({ error: 'Platillo no encontrado' })

    const regularPrice = price === undefined ? existingItem.price : parseFloat(price)
    const promo = resolvePromoPricing({
      isPromo,
      promoPrice,
      regularPrice,
      currentIsPromo: existingItem.isPromo,
      currentPromoPrice: existingItem.promoPrice,
    })
    const item = await prisma.menuItem.update({
      where: {
        id: req.params.id,
        restaurantId
      },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(availableOnline !== undefined && { availableOnline: !!availableOnline }),
        ...(availableOnKiosk !== undefined && { availableOnKiosk: !!availableOnKiosk }),
        ...(isCombo !== undefined && { isCombo: !!isCombo }),
        ...(isPopular !== undefined && { isPopular }),
        ...(isFavorite !== undefined && { isFavorite: !!isFavorite }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(imageFit !== undefined && { imageFit: imageFit === 'contain' ? 'contain' : 'cover' }),
        ...(categoryId !== undefined && { categoryId }),
        isPromo: promo.isPromo,
        promoPrice: promo.promoPrice,
        ...(activeDays !== undefined && { activeDays }),
        ...(variantMultiSelect !== undefined && { variantMultiSelect: !!variantMultiSelect }),
        ...(variantMinSelection !== undefined && { variantMinSelection: Math.max(0, parseInt(variantMinSelection, 10) || 0) }),
        ...(variantMaxSelection !== undefined && { variantMaxSelection: Math.max(0, parseInt(variantMaxSelection, 10) || 0) }),
        // saleUnit (o soldByWeight legacy) → mantener ambos sincronizados.
        ...((saleUnit !== undefined || soldByWeight !== undefined) && (() => {
          const sUnit = normalizeSaleUnit(saleUnit, soldByWeight)
          return { saleUnit: sUnit, soldByWeight: sUnit === 'WEIGHT' }
        })()),
        ...(unit !== undefined && { unit: normalizeMeasureUnit(unit, normalizeSaleUnit(saleUnit, soldByWeight)) }),
      },
    })
    if (variantTemplateIds !== undefined) {
      await syncItemVariantsFromTemplates(
        item.id,
        restaurantId,
        variantTemplateIds,
      )
    }
    res.json(item)
  } catch (e) {
    if (e instanceof PromoPriceValidationError) return res.status(400).json({ error: e.message })
    res.status(500).json({ error: 'Error al actualizar platillo' })
  }
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
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const itemId = req.params.id;

    // Borrar primero los OrderItem que referencian este MenuItem (FK sin cascade
    // para preservar historial en producción). En la operación de eliminar un
    // platillo desde admin lo sacrificamos a propósito: si el admin lo borra,
    // se borra también su huella en órdenes pasadas.
    await prisma.$transaction(async (tx) => {
      await tx.orderItem.deleteMany({ where: { menuItemId: itemId, menuItem: { restaurantId } } });
      await tx.menuItem.delete({ where: { id: itemId, restaurantId } });
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Wipe completo del menú del tenant ─────────────────────────────────────
// Endpoint destructivo: nukea menuItems + categorías + variant templates de
// un tenant. Pensado para tests / reset de demo. Requiere body { confirm: "BORRAR" }
// para evitar disparos accidentales.
router.post('/wipe-all', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (req.body?.confirm !== 'BORRAR') {
      return res.status(400).json({ error: 'Confirmación inválida. Envía { confirm: "BORRAR" }.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) OrderItems que referencian menuItems de este tenant — necesario por
      //    la FK sin cascade entre OrderItem.menuItem y MenuItem.
      const oi = await tx.orderItem.deleteMany({ where: { menuItem: { restaurantId } } });
      // 2) MenuItems del tenant — cascadea variants, complements, modifier
      //    groups, modifiers, printerGroups, recipe y recipeItems.
      const mi = await tx.menuItem.deleteMany({ where: { restaurantId } });
      // 3) Categorías del tenant.
      const cat = await tx.category.deleteMany({ where: { restaurantId } });
      // 4) Plantillas de variantes (cascadea sus options).
      const vt = await tx.variantTemplate.deleteMany({ where: { restaurantId } });
      return { orderItems: oi.count, menuItems: mi.count, categories: cat.count, variantTemplates: vt.count };
    });

    res.json({ ok: true, deleted: result });
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

// "cebolla" -> "Sin cebolla"; "Sin cebolla" -> "Sin cebolla" (idempotente). Los
// modificadores de grupos REMOVE deben empezar con "Sin " para que la impresión
// los marque como quitar y para que jamás colisionen con un ModifierIngredient.
function ensureSinPrefix(name) {
  const t = String(name).trim();
  return /^sin\s/i.test(t) ? t : `Sin ${t}`;
}

router.post('/items/:itemId/modifier-groups', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertItemBelongsToTenant(req.params.itemId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });

    const { name, required, multiSelect, minSelection, maxSelection, freeModifiersLimit, groupType } = req.body;
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
        groupType: groupType === 'REMOVE' ? 'REMOVE' : 'ADD',
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

    const { name, required, multiSelect, minSelection, maxSelection, freeModifiersLimit, groupType } = req.body;
    const group = await prisma.modifierGroup.update({
      where: { id: req.params.groupId },
      data: {
        ...(name !== undefined && { name }),
        ...(required !== undefined && { required: !!required }),
        ...(multiSelect !== undefined && { multiSelect: !!multiSelect }),
        ...(minSelection !== undefined && { minSelection: parseInt(minSelection) || 0 }),
        ...(maxSelection !== undefined && { maxSelection: parseInt(maxSelection) || 0 }),
        ...(freeModifiersLimit !== undefined && { freeModifiersLimit: parseInt(freeModifiersLimit) || 0 }),
        ...(groupType !== undefined && { groupType: groupType === 'REMOVE' ? 'REMOVE' : 'ADD' }),
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

    // En grupos REMOVE el modificador es gratis y con prefijo "Sin " forzado.
    const grp = await prisma.modifierGroup.findUnique({ where: { id: req.params.groupId }, select: { groupType: true } });
    const isRemoval = grp?.groupType === 'REMOVE';

    const modifier = await prisma.modifier.create({
      data: {
        groupId: req.params.groupId,
        name: isRemoval ? ensureSinPrefix(name) : name,
        priceAdd: isRemoval ? 0 : (parseFloat(priceAdd) || 0),
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

    const { name, priceAdd, isDefault, isAvailable } = req.body;
    const modifier = await prisma.modifier.update({
      where: { id: req.params.modifierId },
      data: {
        ...(name !== undefined && { name }),
        ...(priceAdd !== undefined && { priceAdd: parseFloat(priceAdd) || 0 }),
        ...(isDefault !== undefined && { isDefault: !!isDefault }),
        ...(isAvailable !== undefined && { isAvailable: !!isAvailable }),
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

// ── COMBOS: componentes (slots) y opciones ─────────────────────────────────
async function assertComboComponentBelongsToTenant(componentId, restaurantId) {
  const comp = await prisma.comboComponent.findUnique({
    where: { id: componentId },
    select: { id: true, menuItem: { select: { restaurantId: true } } },
  });
  if (!comp) return { error: 'Componente no encontrado', code: 404 };
  if (comp.menuItem.restaurantId !== restaurantId) return { error: 'No autorizado', code: 403 };
  return { ok: true };
}
async function assertComboOptionBelongsToTenant(optionId, restaurantId) {
  const opt = await prisma.comboOption.findUnique({
    where: { id: optionId },
    select: { id: true, component: { select: { menuItem: { select: { restaurantId: true } } } } },
  });
  if (!opt) return { error: 'Opción no encontrada', code: 404 };
  if (opt.component.menuItem.restaurantId !== restaurantId) return { error: 'No autorizado', code: 403 };
  return { ok: true };
}

router.post('/items/:itemId/combo-components', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertItemBelongsToTenant(req.params.itemId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { name, minSelect, maxSelect, isRequired, sortOrder } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const component = await prisma.comboComponent.create({
      data: {
        menuItemId: req.params.itemId,
        name,
        minSelect: Number.isFinite(parseInt(minSelect)) ? parseInt(minSelect) : 1,
        maxSelect: Number.isFinite(parseInt(maxSelect)) ? parseInt(maxSelect) : 1,
        isRequired: isRequired === undefined ? true : !!isRequired,
        sortOrder: parseInt(sortOrder) || 0,
      },
      include: { options: true },
    });
    res.status(201).json(component);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/combo-components/:componentId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertComboComponentBelongsToTenant(req.params.componentId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { name, minSelect, maxSelect, isRequired, sortOrder } = req.body;
    const component = await prisma.comboComponent.update({
      where: { id: req.params.componentId },
      data: {
        ...(name !== undefined && { name }),
        ...(minSelect !== undefined && { minSelect: parseInt(minSelect) || 0 }),
        ...(maxSelect !== undefined && { maxSelect: parseInt(maxSelect) || 0 }),
        ...(isRequired !== undefined && { isRequired: !!isRequired }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) || 0 }),
      },
      include: { options: true },
    });
    res.json(component);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/combo-components/:componentId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertComboComponentBelongsToTenant(req.params.componentId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    await prisma.comboComponent.delete({ where: { id: req.params.componentId } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/combo-components/:componentId/options', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertComboComponentBelongsToTenant(req.params.componentId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { optionMenuItemId, priceDelta, isAvailable, sortOrder } = req.body;
    if (!optionMenuItemId) return res.status(400).json({ error: 'optionMenuItemId requerido' });
    // Anti-IDOR: la opción debe apuntar a un producto del MISMO restaurante.
    const opt = await assertItemBelongsToTenant(optionMenuItemId, restaurantId);
    if (opt.error) return res.status(opt.code).json({ error: 'La opción no pertenece a este restaurante' });
    const option = await prisma.comboOption.create({
      data: {
        componentId: req.params.componentId,
        optionMenuItemId,
        priceDelta: parseFloat(priceDelta) || 0,
        isAvailable: isAvailable === undefined ? true : !!isAvailable,
        sortOrder: parseInt(sortOrder) || 0,
      },
      include: { optionMenuItem: { select: { id: true, name: true } } },
    });
    res.status(201).json(option);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/combo-options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertComboOptionBelongsToTenant(req.params.optionId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    const { priceDelta, isAvailable, sortOrder } = req.body;
    const option = await prisma.comboOption.update({
      where: { id: req.params.optionId },
      data: {
        ...(priceDelta !== undefined && { priceDelta: parseFloat(priceDelta) || 0 }),
        ...(isAvailable !== undefined && { isAvailable: !!isAvailable }),
        ...(sortOrder !== undefined && { sortOrder: parseInt(sortOrder) || 0 }),
      },
    });
    res.json(option);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/combo-options/:optionId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    const check = await assertComboOptionBelongsToTenant(req.params.optionId, restaurantId);
    if (check.error) return res.status(check.code).json({ error: check.error });
    await prisma.comboOption.delete({ where: { id: req.params.optionId } });
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
            price: true, promoPrice: true, imageUrl: true, imageFit: true,
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

    // Filtrar promos inactivas hoy de cada categoría. La ventana horaria de
    // promos también aplica: fuera de ella los platillos promo se ocultan.
    const promoOpen = await isPromoWindowOpen(prisma, restaurant.id)
    const filtered = categories
      .map(cat => ({
        ...cat,
        items: cat.items.filter(item => isMenuItemActiveToday(item, todayDay) && (promoOpen || !item.isPromo))
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
