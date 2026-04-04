const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const router = express.Router();

// POST login con PIN
router.post('/login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });
    const waiter = await prisma.waiter.findFirst({ where: { pin, isActive: true } });
    if (!waiter) return res.status(401).json({ error: 'PIN incorrecto' });
    res.json({ waiter: { id: waiter.id, name: waiter.name, tables: waiter.tables } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST iniciar turno
router.post('/:id/shift/start', async (req, res) => {
  try {
    const waiter = await prisma.waiter.findUnique({ where: { id: req.params.id } });
    if (!waiter) return res.status(404).json({ error: 'Mesero no encontrado' });
    // Cerrar turno anterior si existe
    await prisma.waiterShift.updateMany({
      where: { waiterId: req.params.id, endAt: null },
      data: { endAt: new Date() }
    });
    const shift = await prisma.waiterShift.create({
      data: { waiterId: req.params.id }
    });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST terminar turno
router.post('/:id/shift/end', async (req, res) => {
  try {
    await prisma.waiterShift.updateMany({
      where: { waiterId: req.params.id, endAt: null },
      data: { endAt: new Date() }
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET turno activo
router.get('/:id/shift', async (req, res) => {
  try {
    const shift = await prisma.waiterShift.findFirst({
      where: { waiterId: req.params.id, endAt: null },
      orderBy: { startAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET pedidos activos del mesero (por mesa)
router.get('/:id/orders', async (req, res) => {
  try {
    const waiter = await prisma.waiter.findUnique({ where: { id: req.params.id } });
    if (!waiter) return res.status(404).json({ error: 'No encontrado' });
    const tables = waiter.tables || [];
    const orders = await prisma.order.findMany({
      where: {
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        source: 'WAITER',
        ...(tables.length > 0 ? { tableNumber: { in: tables.map(Number) } } : {})
      },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET todos los meseros (admin)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const waiters = await prisma.waiter.findMany({
      include: { shifts: { where: { endAt: null }, take: 1 } },
      orderBy: { name: 'asc' }
    });
    res.json(waiters);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear mesero (admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, pin, tables } = req.body;
    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });
    const existing = await prisma.waiter.findFirst({ where: { pin } });
    if (existing) return res.status(400).json({ error: 'PIN ya en uso' });
    const waiter = await prisma.waiter.create({
      data: { name, pin, tables: tables || [], isActive: true }
    });
    res.json(waiter);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST guardar foto del mesero
router.post('/:id/photo', async (req, res) => {
  try {
    const { photo } = req.body; // base64
    if (!photo) return res.status(400).json({ error: 'Foto requerida' });
    const waiter = await prisma.waiter.update({
      where: { id: req.params.id },
      data: { photo }
    });
    res.json({ ok: true, photo: waiter.photo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET verificar PIN admin
router.post('/verify-admin-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const config = await prisma.ticketConfig.findFirst();
    const adminPin = config?.adminPin || '0000';
    res.json({ valid: pin === adminPin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT actualizar mesero (admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, pin, tables, isActive } = req.body;
    const data = {};
    if (name !== undefined)     data.name = name;
    if (pin !== undefined)      data.pin = pin;
    if (tables !== undefined)   data.tables = tables;
    if (isActive !== undefined) data.isActive = isActive;
    const waiter = await prisma.waiter.update({ where: { id: req.params.id }, data });
    res.json(waiter);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE mesero (admin)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await prisma.waiter.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
