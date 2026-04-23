/**
 * tables.routes.js — Mesas físicas + estado del piso (Dine-in).
 *
 * Convenciones:
 *   - Las mesas son del local (locationId), no del restaurante padre.
 *   - El status (AVAILABLE/OCCUPIED/DIRTY) es denormalizado: lo cambian las
 *     transiciones de orden (open/cobro) y este endpoint manualmente.
 *
 * Rutas:
 *   GET    /api/tables                     → lista con activeOrder embebida
 *   POST   /api/tables                     → crea mesa
 *   PATCH  /api/tables/:id                 → actualiza name/x/y/status/isActive
 *   DELETE /api/tables/:id                 → soft delete (isActive=false)
 *   POST   /api/tables/bulk-positions      → guarda layout (x,y de varias)
 *   POST   /api/tables/:id/clear           → DIRTY → AVAILABLE (mesa limpia)
 */

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess, requireRole } = require('../middleware/auth.middleware');
const router = express.Router();

const VALID_STATUS = ['AVAILABLE', 'OCCUPIED', 'DIRTY'];

// Roles que pueden gestionar mesas (admin-like del TPV).
const MANAGE_ROLES = ['ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

router.use(authenticate, requireTenantAccess);

// ── GET listar mesas (con orden activa si está OCCUPIED) ────────────────────
// Visible a cualquier rol autenticado del TPV: meseros y cajeros también
// necesitan saber qué mesas hay.
router.get('/', async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const tables = await prisma.table.findMany({
      where: { locationId: req.locationId, isActive: true },
      orderBy: { name: 'asc' },
    });

    // Para cada mesa OCCUPIED, traer la orden activa (status=OPEN) más reciente
    // con resumen liviano para que el TPV pinte el estado sin segunda llamada.
    const occupiedIds = tables.filter(t => t.status === 'OCCUPIED').map(t => t.id);
    const activeOrders = occupiedIds.length
      ? await prisma.order.findMany({
          where: { tableId: { in: occupiedIds }, status: 'OPEN' },
          select: {
            id: true, orderNumber: true, total: true, customerName: true,
            createdAt: true, tableId: true,
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [];
    const orderByTable = {};
    for (const o of activeOrders) {
      if (!orderByTable[o.tableId]) orderByTable[o.tableId] = o;
    }

    res.json(tables.map(t => ({ ...t, activeOrder: orderByTable[t.id] || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST crear mesa ────────────────────────────────────────────────────────
router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, x, y } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const table = await prisma.table.create({
      data: {
        locationId: req.locationId,
        name: name.trim(),
        x: Number.isFinite(Number(x)) ? Number(x) : 0,
        y: Number.isFinite(Number(y)) ? Number(y) : 0,
      },
    });
    res.status(201).json({ ...table, activeOrder: null });
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una mesa con ese nombre en esta sucursal' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH actualizar mesa (nombre, posición, status manual, soft delete) ────
router.patch('/:id', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const existing = await prisma.table.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Mesa no encontrada' });

    const { name, x, y, status, isActive } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (x !== undefined && Number.isFinite(Number(x))) data.x = Number(x);
    if (y !== undefined && Number.isFinite(Number(y))) data.y = Number(y);
    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Usa uno de: ${VALID_STATUS.join(', ')}` });
      }
      data.status = status;
    }
    if (isActive !== undefined) data.isActive = !!isActive;

    const table = await prisma.table.update({ where: { id: existing.id }, data });
    res.json(table);
  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe una mesa con ese nombre' });
    }
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE soft delete ──────────────────────────────────────────────────────
router.delete('/:id', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const existing = await prisma.table.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Mesa no encontrada' });

    // No permitir borrar mesa con cuenta abierta — primero hay que cerrar la
    // cuenta o reasignarla manualmente.
    const openOrder = await prisma.order.findFirst({
      where: { tableId: existing.id, status: 'OPEN' },
      select: { id: true },
    });
    if (openOrder) {
      return res.status(400).json({
        error: 'La mesa tiene una cuenta abierta; ciérrala antes de eliminarla',
        openOrderId: openOrder.id,
      });
    }

    await prisma.table.update({
      where: { id: existing.id },
      data: { isActive: false, status: 'AVAILABLE' },
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST bulk-positions: guardar layout completo tras drag-drop ─────────────
// Body: { positions: [{ id, x, y }, ...] }
router.post('/bulk-positions', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    const { positions } = req.body || {};
    if (!Array.isArray(positions)) {
      return res.status(400).json({ error: 'positions debe ser un array' });
    }
    const ids = positions.map(p => p.id).filter(Boolean);

    // Verificar que todas las mesas pertenezcan a esta sucursal (anti-cross-tenant).
    const owned = await prisma.table.findMany({
      where: { id: { in: ids }, locationId: req.locationId },
      select: { id: true },
    });
    const ownedSet = new Set(owned.map(t => t.id));

    const updates = positions
      .filter(p => ownedSet.has(p.id) && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)))
      .map(p => prisma.table.update({
        where: { id: p.id },
        data: { x: Number(p.x), y: Number(p.y) },
      }));

    await prisma.$transaction(updates);
    res.json({ ok: true, updated: updates.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /:id/clear: marcar mesa como limpia (DIRTY → AVAILABLE) ────────────
router.post('/:id/clear', async (req, res) => {
  try {
    const existing = await prisma.table.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!existing) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (existing.status === 'OCCUPIED') {
      return res.status(400).json({ error: 'La mesa está ocupada, no puede marcarse como limpia' });
    }

    const table = await prisma.table.update({
      where: { id: existing.id },
      data: { status: 'AVAILABLE' },
    });
    res.json(table);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
