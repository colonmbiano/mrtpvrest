/**
 * logistics.routes.js — FASE 4: Flota, turnos (Ride) y gastos operativos.
 *
 * Todas las rutas requieren autenticación + tenant + gate hasDelivery.
 * Las entidades se scopean por req.user.tenantId (inyectado por authenticate).
 *
 * Rutas:
 *   GET    /api/logistics/vehicles              → lista vehículos del tenant
 *   POST   /api/logistics/vehicles              → crea un vehículo
 *   PATCH  /api/logistics/vehicles/:id          → actualiza (incl. deshabilitar)
 *   GET    /api/logistics/rides?status=open     → lista turnos (open|closed|all)
 *   POST   /api/logistics/rides                 → inicia un turno
 *   POST   /api/logistics/rides/:id/close       → cierra el turno (endTime/endMileage)
 *   POST   /api/logistics/expenses              → registra un gasto (opcionalmente atado a un ride)
 */

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');

const router = express.Router();

const VEHICLE_TYPES = ['MOTO', 'CARRO', 'BICI'];
const EXPENSE_CATEGORIES = ['GASOLINA', 'REFACCION', 'PONCHADURA', 'OTROS'];

// ── Gate: el módulo sólo es usable si el tenant activó hasDelivery ───────────
async function requireDeliveryEnabled(req, res, next) {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(403).json({ error: 'Tenant no resoluble' });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { hasDelivery: true },
    });
    if (!tenant?.hasDelivery) {
      return res.status(403).json({
        error: 'Módulo de Logística no activado para este tenant',
        code: 'DELIVERY_MODULE_DISABLED',
      });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.use(authenticate, requireTenantAccess, requireDeliveryEnabled);

// ── Vehículos ────────────────────────────────────────────────────────────────
router.get('/vehicles', async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    res.json(vehicles);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/vehicles', async (req, res) => {
  try {
    const { name, plate, type } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Nombre requerido' });

    const finalType = VEHICLE_TYPES.includes(type) ? type : 'MOTO';

    const vehicle = await prisma.vehicle.create({
      data: {
        tenantId: req.user.tenantId,
        name: name.trim(),
        plate: plate?.trim() || null,
        type: finalType,
      },
    });
    res.status(201).json(vehicle);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/vehicles/:id', async (req, res) => {
  try {
    const existing = await prisma.vehicle.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Vehículo no encontrado' });

    const { name, plate, type, isActive } = req.body;
    const vehicle = await prisma.vehicle.update({
      where: { id: existing.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(plate !== undefined ? { plate: plate ? String(plate).trim() : null } : {}),
        ...(type !== undefined && VEHICLE_TYPES.includes(type) ? { type } : {}),
        ...(isActive !== undefined ? { isActive: !!isActive } : {}),
      },
    });
    res.json(vehicle);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Rides / Turnos ───────────────────────────────────────────────────────────
router.get('/rides', async (req, res) => {
  try {
    const status = String(req.query.status || 'all');
    const where = { tenantId: req.user.tenantId };
    if (status === 'open') where.endTime = null;
    else if (status === 'closed') where.endTime = { not: null };

    const rides = await prisma.ride.findMany({
      where,
      include: {
        vehicle: { select: { id: true, name: true, type: true, plate: true } },
      },
      orderBy: { startTime: 'desc' },
      take: 100,
    });

    // Hidratar nombre del empleado (FK blanda a Employee.id)
    const empIds = Array.from(new Set(rides.map(r => r.employeeId).filter(Boolean)));
    const employees = empIds.length
      ? await prisma.employee.findMany({
          where: { id: { in: empIds } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const byId = Object.fromEntries(employees.map(e => [e.id, e]));

    res.json(rides.map(r => ({ ...r, employee: byId[r.employeeId] || null })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/rides', async (req, res) => {
  try {
    const { employeeId, vehicleId, startMileage } = req.body;
    if (!employeeId) return res.status(400).json({ error: 'employeeId requerido' });
    if (!vehicleId) return res.status(400).json({ error: 'vehicleId requerido' });

    // Validar que el vehículo pertenezca al tenant (anti-cross-tenant)
    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId: req.user.tenantId, isActive: true },
    });
    if (!vehicle) return res.status(400).json({ error: 'Vehículo no válido o inactivo' });

    // Validar que el empleado exista (FK blanda, así que sólo chequeamos presencia)
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, isActive: true },
    });
    if (!employee || !employee.isActive) {
      return res.status(400).json({ error: 'Empleado no válido o inactivo' });
    }

    // Cerrar cualquier ride previo del mismo empleado/vehículo abierto
    await prisma.ride.updateMany({
      where: {
        tenantId: req.user.tenantId,
        endTime: null,
        OR: [{ employeeId }, { vehicleId }],
      },
      data: { endTime: new Date() },
    });

    const mileage = startMileage != null ? parseInt(startMileage, 10) : null;
    const ride = await prisma.ride.create({
      data: {
        tenantId: req.user.tenantId,
        employeeId,
        vehicleId,
        startMileage: Number.isFinite(mileage) ? mileage : null,
      },
      include: { vehicle: { select: { id: true, name: true, type: true } } },
    });
    res.status(201).json(ride);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/rides/:id/close', async (req, res) => {
  try {
    const ride = await prisma.ride.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!ride) return res.status(404).json({ error: 'Turno no encontrado' });
    if (ride.endTime) return res.status(400).json({ error: 'Turno ya cerrado' });

    const { endMileage } = req.body;
    const mileage = endMileage != null ? parseInt(endMileage, 10) : null;

    const updated = await prisma.ride.update({
      where: { id: ride.id },
      data: {
        endTime: new Date(),
        endMileage: Number.isFinite(mileage) ? mileage : null,
      },
    });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Gastos operativos ────────────────────────────────────────────────────────
router.post('/expenses', async (req, res) => {
  try {
    const { amount, category, description, rideId } = req.body;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    if (!EXPENSE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoría inválida' });
    }

    // Si se adjunta un ride, validar que pertenezca al tenant
    if (rideId) {
      const ride = await prisma.ride.findFirst({
        where: { id: rideId, tenantId: req.user.tenantId },
        select: { id: true },
      });
      if (!ride) return res.status(400).json({ error: 'Ride no pertenece al tenant' });
    }

    const expense = await prisma.expense.create({
      data: {
        tenantId: req.user.tenantId,
        rideId: rideId || null,
        amount: parsedAmount,
        category,
        description: description?.trim() || null,
      },
    });
    res.status(201).json(expense);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
