// ── Bulk Promos (NxM, p.ej. "3x2 alitas") — CRUD de administración ──────────
// La APLICACIÓN del descuento vive en orders.routes (al crear orden / agregar
// ronda) vía lib/bulk-promo.js. Aquí solo se gestiona la definición de promos
// desde /admin. Todo scopeado por restaurantId (multi-tenant).
const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { pick } = require('../lib/validate');

const router = express.Router();

router.use(authenticate, requireTenantAccess);

// Serializa una promo con sus categorías (ids + nombres) para el admin.
function serialize(promo) {
  return {
    id: promo.id,
    name: promo.name,
    buyQuantity: promo.buyQuantity,
    payQuantity: promo.payQuantity,
    isActive: promo.isActive,
    startsAt: promo.startsAt,
    endsAt: promo.endsAt,
    createdAt: promo.createdAt,
    categories: (promo.categories || []).map((c) => ({
      id: c.categoryId,
      name: c.category?.name || null,
    })),
  };
}

const INCLUDE_CATS = { categories: { include: { category: { select: { name: true } } } } };

// Normaliza buy/pay: enteros, pay < buy y >= 0. Devuelve null si inválido.
function normalizeNxM(buy, pay) {
  const b = Math.floor(Number(buy));
  const p = Math.floor(Number(pay));
  if (!Number.isFinite(b) || !Number.isFinite(p)) return null;
  if (b < 2 || p < 1 || p >= b) return null;
  return { buyQuantity: b, payQuantity: p };
}

// Filtra los categoryIds a SOLO los que existen en este restaurante (defensa:
// no se puede enlazar una categoría de otro tenant al pool de la promo).
async function validCategoryIds(restaurantId, categoryIds) {
  const ids = [...new Set((Array.isArray(categoryIds) ? categoryIds : []).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await prisma.category.findMany({
    where: { id: { in: ids }, restaurantId },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// ── GET /api/bulk-promos — todas las promos del restaurante ─────────────────
router.get('/', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const promos = await prisma.bulkPromo.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE_CATS,
    });
    res.json(promos.map(serialize));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/bulk-promos — crear ───────────────────────────────────────────
router.post('/', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const data = pick(req.body, ['name', 'isActive']);
    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    const nxm = normalizeNxM(req.body.buyQuantity ?? 3, req.body.payQuantity ?? 2);
    if (!nxm) return res.status(400).json({ error: 'NxM inválido: se requiere comprar ≥2 y pagar menos de lo que se compra' });

    const catIds = await validCategoryIds(restaurantId, req.body.categoryIds);
    if (catIds.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos una categoría elegible' });
    }

    const promo = await prisma.bulkPromo.create({
      data: {
        restaurantId,
        name: String(data.name).trim(),
        buyQuantity: nxm.buyQuantity,
        payQuantity: nxm.payQuantity,
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
        startsAt: req.body.startsAt ? new Date(req.body.startsAt) : null,
        endsAt: req.body.endsAt ? new Date(req.body.endsAt) : null,
        categories: { create: catIds.map((categoryId) => ({ categoryId })) },
      },
      include: INCLUDE_CATS,
    });
    res.status(201).json(serialize(promo));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/bulk-promos/:id — actualizar ───────────────────────────────────
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const existing = await prisma.bulkPromo.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Promo no encontrada' });

    const data = {};
    if (req.body.name !== undefined) {
      if (!String(req.body.name).trim()) return res.status(400).json({ error: 'El nombre no puede ir vacío' });
      data.name = String(req.body.name).trim();
    }
    if (req.body.buyQuantity !== undefined || req.body.payQuantity !== undefined) {
      const nxm = normalizeNxM(
        req.body.buyQuantity ?? existing.buyQuantity,
        req.body.payQuantity ?? existing.payQuantity,
      );
      if (!nxm) return res.status(400).json({ error: 'NxM inválido: se requiere comprar ≥2 y pagar menos de lo que se compra' });
      data.buyQuantity = nxm.buyQuantity;
      data.payQuantity = nxm.payQuantity;
    }
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.startsAt !== undefined) data.startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
    if (req.body.endsAt !== undefined) data.endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null;

    // Categorías: si vienen, reemplazamos el pool completo (delete + create) en
    // una transacción junto al update de los escalares.
    let catIds = null;
    if (req.body.categoryIds !== undefined) {
      catIds = await validCategoryIds(restaurantId, req.body.categoryIds);
      if (catIds.length === 0) return res.status(400).json({ error: 'Selecciona al menos una categoría elegible' });
    }

    const promo = await prisma.$transaction(async (tx) => {
      if (catIds) {
        await tx.bulkPromoCategory.deleteMany({ where: { bulkPromoId: existing.id } });
        await tx.bulkPromoCategory.createMany({
          data: catIds.map((categoryId) => ({ bulkPromoId: existing.id, categoryId })),
        });
      }
      await tx.bulkPromo.update({ where: { id: existing.id }, data });
      return tx.bulkPromo.findUnique({ where: { id: existing.id }, include: INCLUDE_CATS });
    });
    res.json(serialize(promo));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/bulk-promos/:id ─────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const existing = await prisma.bulkPromo.findFirst({ where: { id: req.params.id, restaurantId } });
    if (!existing) return res.status(404).json({ error: 'Promo no encontrada' });
    // Las filas de bulk_promo_categories caen por ON DELETE CASCADE.
    await prisma.bulkPromo.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
