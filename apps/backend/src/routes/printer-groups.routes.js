/**
 * /api/printer-groups — CRUD de Printer Groups.
 *
 * Un grupo agrupa N impresoras (térmicas + KDS) que reciben las mismas
 * comandas. Las relaciones M:N a Printer / Category / MenuItem se
 * gestionan con replaceAll por simplicidad: el cliente manda el array
 * deseado y el backend hace deleteMany + createMany dentro de una
 * transacción.
 *
 * Aislación multi-tenant: todas las queries filtran por
 * `req.locationId` resuelto del JWT/header. Un admin de otra sucursal
 * NO puede leer ni modificar los grupos de otra location.
 */

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireRole, requireTenantAccess } = require('../middleware/auth.middleware');

const router = express.Router();
router.use(authenticate, requireTenantAccess);

const MANAGE_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
const requireAdmin = requireRole(...MANAGE_ROLES);

// ── GET /api/printer-groups — Lista con miembros y categorías ────────────
router.get('/', async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const groups = await prisma.printerGroup.findMany({
      where: { locationId: req.locationId },
      include: {
        members: {
          include: {
            printer: { select: { id: true, name: true, type: true, ip: true } },
          },
        },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        items: {
          include: {
            menuItem: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/printer-groups — Crea un nuevo grupo ───────────────────────
// Body: { name, printerIds?: [], categoryIds?: [] }
router.post('/', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { name, printerIds = [], categoryIds = [] } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    // Validar que los printers / categorías pertenecen a este tenant —
    // evita que un cliente meta IDs de otra sucursal en su request.
    if (printerIds.length > 0) {
      const owned = await prisma.printer.count({
        where: { id: { in: printerIds }, locationId: req.locationId },
      });
      if (owned !== printerIds.length) {
        return res.status(400).json({ error: 'Una o más impresoras no pertenecen a esta sucursal' });
      }
    }
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (categoryIds.length > 0 && restaurantId) {
      const owned = await prisma.category.count({
        where: { id: { in: categoryIds }, restaurantId },
      });
      if (owned !== categoryIds.length) {
        return res.status(400).json({ error: 'Una o más categorías no pertenecen a este restaurante' });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const group = await tx.printerGroup.create({
        data: { locationId: req.locationId, name: name.trim() },
      });

      if (printerIds.length > 0) {
        await tx.printerGroupMember.createMany({
          data: printerIds.map((pid) => ({ printerGroupId: group.id, printerId: pid })),
          skipDuplicates: true,
        });
      }
      if (categoryIds.length > 0) {
        await tx.categoryPrinterGroup.createMany({
          data: categoryIds.map((cid) => ({ printerGroupId: group.id, categoryId: cid })),
          skipDuplicates: true,
        });
      }

      return tx.printerGroup.findUnique({
        where: { id: group.id },
        include: {
          members:    { include: { printer: { select: { id: true, name: true, type: true } } } },
          categories: { include: { category: { select: { id: true, name: true } } } },
        },
      });
    });

    res.status(201).json(created);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un grupo con ese nombre en esta sucursal' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/printer-groups/:id — Actualiza nombre + replace M:N ───────
router.patch('/:id', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { name, printerIds, categoryIds } = req.body || {};

    const existing = await prisma.printerGroup.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Validar ownership de los nuevos arrays.
    if (Array.isArray(printerIds) && printerIds.length > 0) {
      const owned = await prisma.printer.count({
        where: { id: { in: printerIds }, locationId: req.locationId },
      });
      if (owned !== printerIds.length) {
        return res.status(400).json({ error: 'Una o más impresoras no pertenecen a esta sucursal' });
      }
    }
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (Array.isArray(categoryIds) && categoryIds.length > 0 && restaurantId) {
      const owned = await prisma.category.count({
        where: { id: { in: categoryIds }, restaurantId },
      });
      if (owned !== categoryIds.length) {
        return res.status(400).json({ error: 'Una o más categorías no pertenecen a este restaurante' });
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (typeof name === 'string' && name.trim()) {
        await tx.printerGroup.update({
          where: { id: existing.id },
          data: { name: name.trim() },
        });
      }
      if (Array.isArray(printerIds)) {
        await tx.printerGroupMember.deleteMany({ where: { printerGroupId: existing.id } });
        if (printerIds.length > 0) {
          await tx.printerGroupMember.createMany({
            data: printerIds.map((pid) => ({ printerGroupId: existing.id, printerId: pid })),
            skipDuplicates: true,
          });
        }
      }
      if (Array.isArray(categoryIds)) {
        await tx.categoryPrinterGroup.deleteMany({ where: { printerGroupId: existing.id } });
        if (categoryIds.length > 0) {
          await tx.categoryPrinterGroup.createMany({
            data: categoryIds.map((cid) => ({ printerGroupId: existing.id, categoryId: cid })),
            skipDuplicates: true,
          });
        }
      }

      return tx.printerGroup.findUnique({
        where: { id: existing.id },
        include: {
          members:    { include: { printer: { select: { id: true, name: true, type: true } } } },
          categories: { include: { category: { select: { id: true, name: true } } } },
        },
      });
    });

    res.json(updated);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un grupo con ese nombre' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/printer-groups/:id ───────────────────────────────────────
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const existing = await prisma.printerGroup.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Grupo no encontrado' });

    // Las FKs CASCADE limpian member/category/item links automáticamente.
    await prisma.printerGroup.delete({ where: { id: existing.id } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/menu/items/:id/printer-groups — Override item-level ────────
// replaceAll del array de groups asignados al item. Body: { groupIds: [] }
router.post('/by-item/:menuItemId', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { groupIds = [] } = req.body || {};
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ error: 'groupIds debe ser array' });
    }
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const item = await prisma.menuItem.findFirst({
      where: { id: req.params.menuItemId, restaurantId },
    });
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });

    if (groupIds.length > 0) {
      const owned = await prisma.printerGroup.count({
        where: { id: { in: groupIds }, locationId: req.locationId },
      });
      if (owned !== groupIds.length) {
        return res.status(400).json({ error: 'Uno o más grupos no pertenecen a esta sucursal' });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.menuItemPrinterGroup.deleteMany({ where: { menuItemId: item.id } });
      if (groupIds.length > 0) {
        await tx.menuItemPrinterGroup.createMany({
          data: groupIds.map((gid) => ({ menuItemId: item.id, printerGroupId: gid })),
          skipDuplicates: true,
        });
      }
    });

    const fresh = await prisma.menuItem.findUnique({
      where: { id: item.id },
      include: {
        printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } },
      },
    });
    res.json(fresh);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/printer-groups/by-category/:categoryId — Default route ────
// Setea (replaceAll) los groups que cubren a una Categoría. Cada item
// sin override hereda este default al momento del enrutamiento.
router.post('/by-category/:categoryId', requireAdmin, async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { groupIds = [] } = req.body || {};
    if (!Array.isArray(groupIds)) {
      return res.status(400).json({ error: 'groupIds debe ser array' });
    }
    const restaurantId = req.user?.restaurantId || req.restaurantId;

    const category = await prisma.category.findFirst({
      where: { id: req.params.categoryId, restaurantId },
    });
    if (!category) return res.status(404).json({ error: 'Categoría no encontrada' });

    if (groupIds.length > 0) {
      const owned = await prisma.printerGroup.count({
        where: { id: { in: groupIds }, locationId: req.locationId },
      });
      if (owned !== groupIds.length) {
        return res.status(400).json({ error: 'Uno o más grupos no pertenecen a esta sucursal' });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.categoryPrinterGroup.deleteMany({ where: { categoryId: category.id } });
      if (groupIds.length > 0) {
        await tx.categoryPrinterGroup.createMany({
          data: groupIds.map((gid) => ({ categoryId: category.id, printerGroupId: gid })),
          skipDuplicates: true,
        });
      }
    });

    const fresh = await prisma.category.findUnique({
      where: { id: category.id },
      include: {
        printerGroups: { include: { printerGroup: { select: { id: true, name: true } } } },
      },
    });
    res.json(fresh);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
