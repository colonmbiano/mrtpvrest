const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

const bcrypt = require('bcryptjs');

// Helper para buscar "entidad mesero" (sea Waiter o Employee con rol WAITER)
async function findWaiterEntity(id) {
  let waiter = await prisma.waiter.findUnique({ where: { id } });
  if (waiter) return { ...waiter, type: 'WAITER_TABLE' };

  let emp = await prisma.employee.findUnique({ where: { id } });
  if (emp && emp.role === 'WAITER') return { ...emp, type: 'EMPLOYEE_TABLE' };

  return null;
}

// POST login con PIN
router.post('/login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });

    // 1. Intentar en tabla Waiter (legacy/simple)
    const waiter = await prisma.waiter.findFirst({ where: { pin, isActive: true } });
    if (waiter) {
      return res.json({ waiter: { id: waiter.id, name: waiter.name, tables: waiter.tables } });
    }

    // 2. Intentar en tabla Employee (SaaS/Advanced)
    const candidates = await prisma.employee.findMany({ where: { role: 'WAITER', isActive: true } });
    for (const c of candidates) {
      const isMatch = c.pin.startsWith('$2') ? await bcrypt.compare(pin, c.pin) : c.pin === pin;
      if (isMatch) {
        return res.json({ waiter: { id: c.id, name: c.name, tables: c.tables } });
      }
    }

    return res.status(401).json({ error: 'PIN incorrecto' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST iniciar turno
router.post('/:id/shift/start', async (req, res) => {
  try {
    const entity = await findWaiterEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Mesero no encontrado' });

    if (entity.type === 'WAITER_TABLE') {
      await prisma.waiterShift.updateMany({
        where: { waiterId: req.params.id, endAt: null },
        data: { endAt: new Date() }
      });
      const shift = await prisma.waiterShift.create({ data: { waiterId: req.params.id } });
      return res.json(shift);
    } else {
      // Es un Employee. Usamos EmployeeShift.
      await prisma.employeeShift.updateMany({
        where: { employeeId: req.params.id, endAt: null },
        data: { endAt: new Date() }
      });
      const shift = await prisma.employeeShift.create({ data: { employeeId: req.params.id } });
      return res.json(shift);
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST terminar turno
router.post('/:id/shift/end', async (req, res) => {
  try {
    const entity = await findWaiterEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Mesero no encontrado' });

    if (entity.type === 'WAITER_TABLE') {
      await prisma.waiterShift.updateMany({ where: { waiterId: req.params.id, endAt: null }, data: { endAt: new Date() } });
    } else {
      await prisma.employeeShift.updateMany({ where: { employeeId: req.params.id, endAt: null }, data: { endAt: new Date() } });
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET turno activo
router.get('/:id/shift', async (req, res) => {
  try {
    const entity = await findWaiterEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'Mesero no encontrado' });

    let shift = null;
    if (entity.type === 'WAITER_TABLE') {
      shift = await prisma.waiterShift.findFirst({ where: { waiterId: req.params.id, endAt: null }, orderBy: { startAt: 'desc' } });
    } else {
      shift = await prisma.employeeShift.findFirst({ where: { employeeId: req.params.id, endAt: null }, orderBy: { startAt: 'desc' } });
    }
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET pedidos activos del mesero (por mesa)
router.get('/:id/orders', async (req, res) => {
  try {
    const entity = await findWaiterEntity(req.params.id);
    if (!entity) return res.status(404).json({ error: 'No encontrado' });

    const tables = entity.tables || [];
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
router.get('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const waiters = await prisma.waiter.findMany({
      include: { shifts: { where: { endAt: null }, take: 1 } },
      orderBy: { name: 'asc' }
    });
    res.json(waiters);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear mesero (admin)
router.post('/', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
router.put('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
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
router.delete('/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    await prisma.waiter.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
