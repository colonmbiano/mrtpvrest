// DEPRECATED — Meseros v2 unifica el personal en Employee/EmployeeShift.
// Ningún cliente del monorepo llama ya a /api/waiters (el TPV usa
// /api/employees/login y /api/employees/me/*). Este router queda solo por
// compatibilidad con clientes externos viejos mientras se confirma que no
// queda tráfico; eliminar junto con los modelos Waiter/WaiterShift
// (ver packages/database/scripts/migrate-waiters-to-employees.js).
//
// Mientras viva, TODO endpoint queda tenant-scoped: el PIN se busca solo en
// la sucursal del request y los recursos :id se validan contra esa sucursal.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireModule, MODULES } = require('../lib/modules');
const router = express.Router();

// Gate: módulo "waiters" en plan.allowedModules. Warn-only por default.
router.use(authenticate, requireTenantAccess, requireModule(MODULES.MODULE_WAITERS));

const bcrypt = require('bcryptjs');

// Rate-limit del login con PIN — misma convención que /api/employees/login
// (PIN de 4 dígitos = 10000 combinaciones; sin esto la fuerza bruta tarda <1min).
const pinLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.locationId || 'no-loc'}`,
  message: { error: 'Demasiados intentos de PIN. Espera 15 minutos.' },
});

// Sucursal del request — el interceptor del TPV manda x-location-id y el
// tenant middleware la deja en req.locationId. Sin sucursal no hay scope.
function resolveLocationId(req) {
  return req.locationId || req.headers['x-location-id'] || null;
}

// Busca la "entidad mesero" (Waiter legacy o Employee rol WAITER) SOLO dentro
// de la sucursal dada. Un :id de otra sucursal/tenant devuelve null (404 para
// no filtrar existencia).
async function findWaiterEntity(id, locationId) {
  const waiter = await prisma.waiter.findFirst({ where: { id, locationId } });
  if (waiter) return { ...waiter, type: 'WAITER_TABLE' };

  const emp = await prisma.employee.findFirst({ where: { id, locationId } });
  if (emp && emp.role === 'WAITER') return { ...emp, type: 'EMPLOYEE_TABLE' };

  return null;
}

// POST login con PIN — scoped a la sucursal del request.
router.post('/login', pinLoginLimiter, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN requerido' });
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada. Envía header x-location-id.' });

    // 1. Tabla Waiter (legacy/simple) — solo meseros de ESTA sucursal.
    const waiter = await prisma.waiter.findFirst({ where: { pin, isActive: true, locationId } });
    if (waiter) {
      return res.json({ waiter: { id: waiter.id, name: waiter.name, tables: waiter.tables } });
    }

    // 2. Tabla Employee (SaaS/Advanced) — mismo scope de sucursal.
    const candidates = await prisma.employee.findMany({ where: { role: 'WAITER', isActive: true, locationId } });
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
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const entity = await findWaiterEntity(req.params.id, locationId);
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
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const entity = await findWaiterEntity(req.params.id, locationId);
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
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const entity = await findWaiterEntity(req.params.id, locationId);
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

// GET pedidos activos del mesero (por mesa) — scoped a la sucursal.
router.get('/:id/orders', async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const entity = await findWaiterEntity(req.params.id, locationId);
    if (!entity) return res.status(404).json({ error: 'No encontrado' });

    const tables = entity.tables || [];
    const orders = await prisma.order.findMany({
      where: {
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
        source: 'WAITER',
        locationId,
        ...(tables.length > 0 ? { tableNumber: { in: tables.map(Number) } } : {})
      },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET todos los meseros (admin) — solo los de la sucursal del request.
router.get('/', requireAdmin, async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const waiters = await prisma.waiter.findMany({
      where: { locationId },
      include: { shifts: { where: { endAt: null }, take: 1 } },
      orderBy: { name: 'asc' }
    });
    res.json(waiters);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST crear mesero (admin) — PIN único POR SUCURSAL, no global.
router.post('/', requireAdmin, async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { name, pin, tables } = req.body;
    if (!name || !pin) return res.status(400).json({ error: 'Nombre y PIN requeridos' });
    const existing = await prisma.waiter.findFirst({ where: { pin, locationId } });
    if (existing) return res.status(400).json({ error: 'PIN ya en uso en esta sucursal' });
    const waiter = await prisma.waiter.create({
      data: { name, pin, tables: tables || [], isActive: true, locationId }
    });
    res.json(waiter);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST guardar foto del mesero — solo si pertenece a la sucursal.
router.post('/:id/photo', async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { photo } = req.body; // base64
    if (!photo) return res.status(400).json({ error: 'Foto requerida' });
    const owned = await prisma.waiter.findFirst({ where: { id: req.params.id, locationId }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: 'Mesero no encontrado' });
    const waiter = await prisma.waiter.update({
      where: { id: req.params.id },
      data: { photo }
    });
    res.json({ ok: true, photo: waiter.photo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET verificar PIN admin — config de ESTA sucursal (no findFirst global).
router.post('/verify-admin-pin', async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const { pin } = req.body;
    const config = await prisma.ticketConfig.findFirst({ where: { locationId } });
    const adminPin = config?.adminPin || '0000';
    res.json({ valid: pin === adminPin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT actualizar mesero (admin) — scoped a sucursal.
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const owned = await prisma.waiter.findFirst({ where: { id: req.params.id, locationId }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: 'Mesero no encontrado' });
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

// DELETE mesero (admin) — scoped a sucursal.
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const locationId = resolveLocationId(req);
    if (!locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
    const owned = await prisma.waiter.findFirst({ where: { id: req.params.id, locationId }, select: { id: true } });
    if (!owned) return res.status(404).json({ error: 'Mesero no encontrado' });
    await prisma.waiter.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
