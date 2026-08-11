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
 *   GET    /api/tables/:id                 → detalle con activeOrder + items
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
      include: { zone: { select: { id: true, name: true, icon: true, isActive: true } } },
    });

    // La orden OPEN es la fuente de verdad. Consultamos todas las mesas para
    // tolerar un status AVAILABLE desfasado y evitar que Meseros Lite muestre
    // una mesa con cuenta como libre o con cero articulos.
    const tableIds = tables.map(t => t.id);
    const activeOrders = tableIds.length
      ? await prisma.order.findMany({
          where: {
            tableId: { in: tableIds },
            status: 'OPEN',
            paymentStatus: { not: 'PAID' },
          },
          select: {
            id: true, orderNumber: true, status: true,
            paymentStatus: true, total: true, customerName: true,
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

    res.json(tables.map(t => {
      const activeOrder = orderByTable[t.id] || null;
      return {
        ...t,
        status: activeOrder ? 'OCCUPIED' : t.status,
        activeOrder,
      };
    }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET detalle de una mesa (con orden activa + items) ─────────────────────
// Usado por la pantalla de detalle de meseros (/meseros/[id]) para mostrar la
// cuenta acumulada en vivo sin pedir el endpoint general.
router.get('/:id', async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const table = await prisma.table.findFirst({
      where: { id: req.params.id, locationId: req.locationId, isActive: true },
      include: { zone: { select: { id: true, name: true, icon: true, isActive: true } } },
    });
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });

    let activeOrder = null;
    if (table.status === 'OCCUPIED') {
      activeOrder = await prisma.order.findFirst({
        where: {
          tableId: table.id,
          status: 'OPEN',
          paymentStatus: { not: 'PAID' },
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          subtotal: true,
          discount: true,
          customerName: true,
          createdAt: true,
          // roundId + rounds: la pantalla de meseros agrupa la comanda por
          // ronda ("Ronda 2 · 21:14") para distinguir lo recién enviado.
          items: {
            select: { id: true, name: true, price: true, quantity: true, subtotal: true, roundId: true },
            orderBy: { id: 'asc' },
          },
          rounds: {
            select: { id: true, roundNumber: true, createdAt: true },
            orderBy: { roundNumber: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }
    res.json({ ...table, activeOrder });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST crear mesa ────────────────────────────────────────────────────────
router.post('/', requireRole(...MANAGE_ROLES), async (req, res) => {
  try {
    if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });

    const { name, x, y, zoneId, capacity } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    // Validar zona (opcional): si llega zoneId, debe pertenecer al mismo
    // location para no crear cross-tenant.
    if (zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: zoneId, locationId: req.locationId, isActive: true },
        select: { id: true },
      });
      if (!zone) return res.status(400).json({ error: 'Zona inválida' });
    }

    // Capacidad: clamp 1..50 — más de 50 es seguramente un dedazo del admin.
    const cap = Number(capacity);
    const safeCapacity = Number.isFinite(cap) && cap >= 1 && cap <= 50
      ? Math.floor(cap)
      : 4;

    const table = await prisma.table.create({
      data: {
        locationId: req.locationId,
        name: name.trim(),
        x: Number.isFinite(Number(x)) ? Number(x) : 0,
        y: Number.isFinite(Number(y)) ? Number(y) : 0,
        zoneId: zoneId || null,
        capacity: safeCapacity,
      },
      include: { zone: { select: { id: true, name: true, icon: true, isActive: true } } },
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

    const { name, x, y, status, isActive, zoneId, capacity } = req.body || {};
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (x !== undefined && Number.isFinite(Number(x))) data.x = Number(x);
    if (y !== undefined && Number.isFinite(Number(y))) data.y = Number(y);
    if (capacity !== undefined) {
      const cap = Number(capacity);
      if (!Number.isFinite(cap) || cap < 1 || cap > 50) {
        return res.status(400).json({ error: 'Capacidad inválida (1..50)' });
      }
      data.capacity = Math.floor(cap);
    }
    if (status !== undefined) {
      if (!VALID_STATUS.includes(status)) {
        return res.status(400).json({ error: `Status inválido. Usa uno de: ${VALID_STATUS.join(', ')}` });
      }
      data.status = status;
    }
    if (isActive !== undefined) data.isActive = !!isActive;
    // zoneId puede ser null explícito (mover mesa a "Sin zona") o un id de
    // zona del mismo local. Cualquier otra cosa se valida y rechaza.
    if (zoneId !== undefined) {
      if (zoneId === null || zoneId === '') {
        data.zoneId = null;
      } else {
        const zone = await prisma.zone.findFirst({
          where: { id: zoneId, locationId: req.locationId, isActive: true },
          select: { id: true },
        });
        if (!zone) return res.status(400).json({ error: 'Zona inválida' });
        data.zoneId = zoneId;
      }
    }

    const table = await prisma.table.update({
      where: { id: existing.id },
      data,
      include: { zone: { select: { id: true, name: true, icon: true, isActive: true } } },
    });
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
