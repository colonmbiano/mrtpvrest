/**
 * zones.routes.js — Zonas/áreas configurables del salón.
 *
 * Cada Location define su propio set de zonas (Terraza, Mostrador, Barra,
 * Patio, etc.). Las mesas pueden estar en una zona o quedarse sin zona
 * (Table.zoneId = null) para casos no contemplados (mesas extra de un día
 * especial, mesas heredadas sin clasificar).
 *
 * Rutas:
 *   GET    /api/zones        → lista de zonas activas del local con count de mesas
 *   POST   /api/zones        → crea zona
 *   PATCH  /api/zones/:id    → actualiza name/icon/order/isActive
 *   DELETE /api/zones/:id    → soft delete (isActive=false). Las mesas que
 *                              apuntaban a la zona quedan con zoneId=null por
 *                              ON DELETE SET NULL pero aquí solo desactivamos
 *                              la zona (no la borramos), así no perdemos la
 *                              relación si se reactiva.
 */

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

const MANAGE_ROLES = ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

router.use(authenticate, requireTenantAccess);

// ── GET listar zonas ────────────────────────────────────────────────────────
// Visible a cualquier rol del TPV — meseros y cajeros también filtran por
// zona en sus pantallas.
router.get('/', async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const zones = await prisma.zone.findMany({
      where: { locationId: req.locationId, isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { tables: { where: { isActive: true } } } } },
    });

    res.json(zones.map(z => ({
      id: z.id,
      name: z.name,
      icon: z.icon,
      order: z.order,
      isActive: z.isActive,
      tablesCount: z._count.tables,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST crear zona ────────────────────────────────────────────────────────
router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, icon, order } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const zone = await prisma.zone.create({
      data: {
        locationId: req.locationId,
        name: name.trim(),
        icon: icon?.trim() || null,
        order: Number.isFinite(Number(order)) ? Number(order) : 0,
      },
    });
    res.status(201).json({ ...zone, tablesCount: 0 });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una zona con ese nombre en esta sucursal' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH actualizar zona ──────────────────────────────────────────────────
router.patch('/:id', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const existing = await prisma.zone.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Zona no encontrada' });

    const { name, icon, order, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ error: 'Nombre no puede estar vacío' });
      data.name = String(name).trim();
    }
    if (icon !== undefined) data.icon = icon ? String(icon).trim() : null;
    if (order !== undefined && Number.isFinite(Number(order))) data.order = Number(order);
    if (isActive !== undefined) data.isActive = !!isActive;

    const zone = await prisma.zone.update({ where: { id: existing.id }, data });
    res.json(zone);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una zona con ese nombre' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE soft delete ─────────────────────────────────────────────────────
// No eliminamos en duro para conservar el historial de mesas que pertenecían
// a esta zona. La FK Table.zoneId queda intacta; al volver a activarla
// reaparece el filtro y las mesas siguen vinculadas.
router.delete('/:id', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const existing = await prisma.zone.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Zona no encontrada' });

    await prisma.zone.update({
      where: { id: existing.id },
      data: { isActive: false },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
