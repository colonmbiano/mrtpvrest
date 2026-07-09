// whatsapp-upsell.routes.js — Reglas de sugerencias de venta (upsell) del bot.
//
// Endpoints (todos admin + scoped al restaurante del token):
//   GET    /            → reglas con métricas (ofrecidas, aceptadas, conversión, ingresos)
//   POST   /            → crear o actualizar una regla (id presente = update)
//   DELETE /:id         → eliminar una regla
//
// La regla apunta a (menuItemId, variantId); nombre y precio se resuelven
// contra el menú vivo al ofrecer — aquí solo se valida que el producto (y el
// disparador) pertenezcan al restaurante.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { pick } = require('../lib/validate');
const router = express.Router();

function rid(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

const VALID_TRIGGERS = ['ALWAYS', 'CATEGORY', 'ITEM'];

// ── Listado con métricas ─────────────────────────────────────────────────────
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const rules = await prisma.upsellRule.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });

    // Resolver nombres de producto/variante/disparador en queries únicas.
    const itemIds = [...new Set([
      ...rules.map((r) => r.menuItemId),
      ...rules.filter((r) => r.triggerType === 'ITEM' && r.triggerId).map((r) => r.triggerId),
    ])];
    const categoryIds = [...new Set(rules.filter((r) => r.triggerType === 'CATEGORY' && r.triggerId).map((r) => r.triggerId))];

    const [items, categories] = await Promise.all([
      itemIds.length
        ? prisma.menuItem.findMany({
            where: { restaurantId, id: { in: itemIds } },
            select: { id: true, name: true, variants: { select: { id: true, name: true } } },
          })
        : [],
      categoryIds.length
        ? prisma.category.findMany({ where: { restaurantId, id: { in: categoryIds } }, select: { id: true, name: true } })
        : [],
    ]);
    const itemById = new Map(items.map((i) => [i.id, i]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const totals = { offers: 0, accepts: 0, revenue: 0 };
    const serialized = rules.map((rule) => {
      const item = itemById.get(rule.menuItemId);
      const variant = rule.variantId ? item?.variants?.find((v) => v.id === rule.variantId) : null;
      const offers = rule.offerCount;
      const accepts = rule.acceptCount;
      const revenue = Number(rule.revenue) || 0;
      totals.offers += offers;
      totals.accepts += accepts;
      totals.revenue += revenue;
      return {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        menuItemId: rule.menuItemId,
        variantId: rule.variantId,
        productName: item ? `${item.name}${variant ? ` (${variant.name})` : ''}` : '(producto eliminado)',
        productMissing: !item,
        triggerType: rule.triggerType,
        triggerId: rule.triggerId,
        triggerName:
          rule.triggerType === 'CATEGORY'
            ? categoryById.get(rule.triggerId)?.name || '(categoría eliminada)'
            : rule.triggerType === 'ITEM'
              ? itemById.get(rule.triggerId)?.name || '(producto eliminado)'
              : null,
        minSubtotal: Number(rule.minSubtotal) || 0,
        offerText: rule.offerText,
        offerCount: offers,
        acceptCount: accepts,
        conversion: offers > 0 ? Math.round((accepts / offers) * 100) : 0,
        revenue,
      };
    });

    res.json({ rules: serialized, totals });
  } catch (e) {
    console.error('[wa-upsell] list:', e.message);
    res.status(500).json({ error: 'Error al obtener sugerencias' });
  }
});

// ── Crear / actualizar ───────────────────────────────────────────────────────
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const body = pick(req.body, [
      'id', 'name', 'enabled', 'menuItemId', 'variantId', 'triggerType', 'triggerId', 'minSubtotal', 'offerText',
    ]);

    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: 'Ponle un nombre a la sugerencia' });

    const triggerType = VALID_TRIGGERS.includes(body.triggerType) ? body.triggerType : 'ALWAYS';
    const triggerId = triggerType === 'ALWAYS' ? null : String(body.triggerId || '');
    if (triggerType !== 'ALWAYS' && !triggerId) {
      return res.status(400).json({ error: 'Elige la categoría o producto que dispara la sugerencia' });
    }

    // El producto sugerido debe existir y ser del restaurante.
    const item = await prisma.menuItem.findFirst({
      where: { restaurantId, id: String(body.menuItemId || '') },
      select: { id: true, variants: { select: { id: true } } },
    });
    if (!item) return res.status(400).json({ error: 'Producto sugerido inválido' });
    const variantId = body.variantId
      ? item.variants.find((v) => v.id === body.variantId)?.id || null
      : null;
    if (body.variantId && !variantId) return res.status(400).json({ error: 'Variante inválida' });

    // El disparador también debe pertenecer al restaurante.
    if (triggerType === 'CATEGORY') {
      const cat = await prisma.category.findFirst({ where: { restaurantId, id: triggerId }, select: { id: true } });
      if (!cat) return res.status(400).json({ error: 'Categoría disparadora inválida' });
    }
    if (triggerType === 'ITEM') {
      const trig = await prisma.menuItem.findFirst({ where: { restaurantId, id: triggerId }, select: { id: true } });
      if (!trig) return res.status(400).json({ error: 'Producto disparador inválido' });
    }

    const data = {
      name,
      enabled: body.enabled !== false,
      menuItemId: item.id,
      variantId,
      triggerType,
      triggerId,
      minSubtotal: Math.max(0, Number(body.minSubtotal) || 0),
      offerText: body.offerText ? String(body.offerText).slice(0, 300) : null,
    };

    let rule;
    if (body.id) {
      const updated = await prisma.upsellRule.updateMany({
        where: { id: String(body.id), restaurantId },
        data,
      });
      if (updated.count === 0) return res.status(404).json({ error: 'Sugerencia no encontrada' });
      rule = await prisma.upsellRule.findFirst({ where: { id: String(body.id), restaurantId } });
    } else {
      rule = await prisma.upsellRule.create({ data: { restaurantId, ...data } });
    }

    res.json({ ok: true, rule: { id: rule.id } });
  } catch (e) {
    console.error('[wa-upsell] save:', e.message);
    res.status(500).json({ error: 'Error al guardar la sugerencia' });
  }
});

// ── Eliminar ─────────────────────────────────────────────────────────────────
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = rid(req);
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const deleted = await prisma.upsellRule.deleteMany({
      where: { id: req.params.id, restaurantId },
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Sugerencia no encontrada' });

    res.json({ ok: true });
  } catch (e) {
    console.error('[wa-upsell] delete:', e.message);
    res.status(500).json({ error: 'Error al eliminar la sugerencia' });
  }
});

module.exports = router;
