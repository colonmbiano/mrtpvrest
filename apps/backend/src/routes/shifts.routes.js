const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();

// Gate: solo empleados/usuarios con permiso pueden abrir/cerrar turnos
const requireCanManageShifts = (req, res, next) => {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN') return next();
  if (req.user?.canManageShifts === true) return next();
  return res.status(403).json({
    error: 'No tienes permisos para gestionar turnos de caja',
    code: 'CANNOT_MANAGE_SHIFTS',
  });
};

// Asegura que la sucursal esté identificada en el request
const requireLocation = (req, res, next) => {
  if (!req.locationId) return res.status(400).json({ error: 'Sucursal no identificada' });
  next();
};

// ── GET staff clock-in activo de la sucursal (widget "Turno actual") ─────
// Devuelve empleados con EmployeeShift abierto (endAt = null) en esta sucursal.
router.get('/staff-active', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const shifts = await prisma.employeeShift.findMany({
      where: {
        endAt: null,
        employee: { locationId: req.locationId },
      },
      include: { employee: { select: { id: true, name: true, role: true, tables: true } } },
      orderBy: { startAt: 'asc' },
      take: 20,
    });
    res.json(shifts.map(s => ({
      id: s.employee.id,
      name: s.employee.name,
      role: s.employee.role,
      tables: s.employee.tables,
      startAt: s.startAt,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Alias histórico — el frontend del admin llama a /api/shifts/current
router.get('/current', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { openedAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET turno activo actual de la sucursal ───────────────────────────────
router.get('/active', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      include: { expenses: { orderBy: { createdAt: 'desc' } } },
      orderBy: { openedAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST abrir turno (solo en la sucursal del request) ───────────────────
router.post('/open', authenticate, requireTenantAccess, requireLocation, requireCanManageShifts, async (req, res) => {
  try {
    const { openingFloat, employeeId: bodyEmployeeId, employeeName: bodyEmployeeName, blindClose } = req.body;

    // Resolver qué Employee abre el turno.
    // CashShift.openedById es FK a Employee — NO podemos pasarle un User admin.
    let openedByEmployeeId = null;
    let openedByEmployeeName = bodyEmployeeName || null;

    if (req.user?.isEmployee) {
      openedByEmployeeId = req.user.id;
      openedByEmployeeName = openedByEmployeeName || req.user.name || 'Cajero';
    } else if (bodyEmployeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: bodyEmployeeId, locationId: req.locationId, isActive: true },
      });
      if (!emp) return res.status(400).json({ error: 'employeeId inválido para esta sucursal', code: 'INVALID_EMPLOYEE' });
      openedByEmployeeId = emp.id;
      openedByEmployeeName = openedByEmployeeName || emp.name;
    } else {
      return res.status(400).json({ error: 'Se requiere employeeId en el body cuando el caller no es un Employee', code: 'EMPLOYEE_ID_REQUIRED' });
    }

    // Cerrar cualquier turno abierto previo en ESTA sucursal
    await prisma.cashShift.updateMany({
      where: { isOpen: true, locationId: req.locationId },
      data: { isOpen: false, closedAt: new Date() }
    });

    const shift = await prisma.cashShift.create({
      data: {
        locationId: req.locationId,
        employeeId: openedByEmployeeId,
        employeeName: openedByEmployeeName,
        openedById: openedByEmployeeId,
        openingFloat: openingFloat || 0,
        isOpen: true,
        blindClose: !!blindClose,
      },
      include: { expenses: true }
    });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST cerrar turno (solo el de la sucursal del request) ───────────────
router.post('/:id/close', authenticate, requireTenantAccess, requireLocation, requireCanManageShifts, async (req, res) => {
  try {
    const { closingFloat, notes, employeeId: bodyEmployeeId } = req.body;
    const shiftId = req.params.id;

    const shift = await prisma.cashShift.findFirst({
      where: { id: shiftId, locationId: req.locationId },
      include: { expenses: true }
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });

    // Resolver Employee que cierra (closedById FK a Employee)
    let closedByEmployeeId = null;
    if (req.user?.isEmployee) {
      closedByEmployeeId = req.user.id;
    } else if (bodyEmployeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: bodyEmployeeId, locationId: req.locationId, isActive: true },
      });
      if (!emp) return res.status(400).json({ error: 'employeeId inválido para esta sucursal' });
      closedByEmployeeId = emp.id;
    }

    // Solo órdenes de este turno (scoped por shiftId con fallback temporal)
    const orders = await prisma.order.findMany({
      where: {
        locationId: req.locationId,
        status: 'DELIVERED',
        OR: [
          { shiftId: shift.id },
          // Fallback para órdenes antiguas sin shiftId, dentro de la ventana del turno
          { shiftId: null, createdAt: { gte: shift.openedAt } },
        ],
        source: { in: ['TPV', 'WAITER', 'ONLINE'] },
      }
    });

    const pmMap = {
      CASH: 'totalCash', CASH_ON_DELIVERY: 'totalCash',
      CARD_PRESENT: 'totalCard', CARD: 'totalCard',
      TRANSFER: 'totalTransfer', SPEI: 'totalTransfer', OXXO: 'totalTransfer',
      COURTESY: 'totalCourtesy',
    };

    const totals = { totalCash: 0, totalCard: 0, totalTransfer: 0, totalCourtesy: 0 };
    for (const order of orders) {
      const key = pmMap[order.paymentMethod];
      if (key) totals[key] += Number(order.total);
    }

    const totalExpenses = shift.expenses.reduce((s, e) => s + e.amount, 0);
    const totalSales = Object.values(totals).reduce((a, b) => a + b, 0);

    // Snapshot para Cierre Ciego: Calculamos lo que DEBERÍA haber en efectivo
    const expectedCash = shift.openingFloat + totals.totalCash - totalExpenses;

    const closed = await prisma.cashShift.update({
      where: { id: shiftId },
      data: {
        isOpen: false,
        closedAt: new Date(),
        closedById: closedByEmployeeId,
        closingFloat: closingFloat || 0,
        notes: notes || null,
        expectedCash,
        ...totals,
        totalExpenses,
        totalSales,
        ordersCount: orders.length,
      },
      include: { expenses: true }
    });
    res.json(closed);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST agregar gasto al turno (scoped a sucursal) ──────────────────────
router.post('/:id/expenses', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const { description, amount, category } = req.body;

    // Validar que el turno pertenece a esta sucursal
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      select: { id: true },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });

    const expense = await prisma.shiftExpense.create({
      data: {
        shiftId: req.params.id,
        description,
        amount: Number(amount),
        category: category || 'OTHER'
      }
    });
    res.json(expense);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE gasto (validado por sucursal del turno padre) ─────────────────
router.delete('/expenses/:id', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const expense = await prisma.shiftExpense.findUnique({
      where: { id: req.params.id },
      include: { shift: { select: { locationId: true } } },
    });
    if (!expense || expense.shift?.locationId !== req.locationId) {
      return res.status(404).json({ error: 'Gasto no encontrado' });
    }
    await prisma.shiftExpense.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de turnos de la sucursal (admin) ───────────────────────
router.get('/', authenticate, requireTenantAccess, requireAdmin, requireLocation, async (req, res) => {
  try {
    const shifts = await prisma.cashShift.findMany({
      where: { locationId: req.locationId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { expenses: true }
    });
    res.json(shifts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET un turno específico (scoped a sucursal) ──────────────────────────
router.get('/:id', authenticate, requireTenantAccess, requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      include: { expenses: { orderBy: { createdAt: 'desc' } } }
    });
    if (!shift) return res.status(404).json({ error: 'No encontrado' });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;