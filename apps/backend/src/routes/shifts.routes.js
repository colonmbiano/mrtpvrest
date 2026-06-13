const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireModule, MODULES } = require('../lib/modules');
const { validateBody } = require('../lib/validate');
const { openShiftSchema, closeShiftSchema } = require('../schemas/shifts.schema');
const { summarizePayments, cashCutSummary } = require('../lib/money');
const audit = require('../lib/audit-logger');
const router = express.Router();

// Gate: módulo "cash_shift" en plan.allowedModules. Si el plan no lo
// incluye, el cajero no puede abrir/cerrar turnos (todo el flujo de
// caja queda gateado contra el plan).
router.use(authenticate, requireTenantAccess, requireModule(MODULES.MODULE_CASH_SHIFT));

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
router.get('/staff-active', requireLocation, async (req, res) => {
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
router.get('/current', requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      include: {
        expenses: { orderBy: { createdAt: 'desc' } },
        cashIns: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { openedAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET turno activo actual de la sucursal ───────────────────────────────
router.get('/active', requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      include: {
        expenses: { orderBy: { createdAt: 'desc' } },
        cashIns: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { openedAt: 'desc' }
    });
    res.json(shift || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST abrir turno (solo en la sucursal del request) ───────────────────
router.post('/open', requireLocation, requireCanManageShifts, validateBody(openShiftSchema), async (req, res) => {
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
      include: { expenses: true, cashIns: true }
    });
    // Auditoría best-effort: nunca bloquea ni rompe la apertura del turno.
    audit.record(req, audit.AUDIT_EVENTS.SHIFT_OPEN, {
      resource: `cashShift:${shift.id}`,
      after: {
        openingFloat: shift.openingFloat,
        blindClose: shift.blindClose,
        employeeName: shift.employeeName,
        locationId: shift.locationId,
      },
    }).catch(() => {});
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST cerrar turno (solo el de la sucursal del request) ───────────────
router.post('/:id/close', requireLocation, requireCanManageShifts, validateBody(closeShiftSchema), async (req, res) => {
  try {
    const { closingFloat, notes, employeeId: bodyEmployeeId } = req.body;
    const shiftId = req.params.id;

    const shift = await prisma.cashShift.findFirst({
      where: { id: shiftId, locationId: req.locationId },
      include: { expenses: true, cashIns: true }
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
        // Todas las fuentes de venta real entran al corte. WhatsApp y Kiosko
        // quedaban fuera, así que sus ventas en efectivo aparecían como sobrante
        // inexplicable en el cajón y las ventas totales salían cortas.
        source: { in: ['TPV', 'WAITER', 'ONLINE', 'WHATSAPP', 'KIOSK'] },
      }
    });

    const totals = summarizePayments(orders);

    const totalExpenses = shift.expenses.reduce((s, e) => s + e.amount, 0);
    const totalCashIn = shift.cashIns.reduce((s, c) => s + c.amount, 0);
    const totalSales = Object.values(totals).reduce((a, b) => a + b, 0);

    // Snapshot para Cierre Ciego: Calculamos lo que DEBERÍA haber en efectivo.
    // Los ingresos de efectivo (cambio que el cajero metió a la gaveta) suman
    // al esperado — de lo contrario aparecerían como sobrante inexplicable.
    const { expectedCash } = cashCutSummary({
      openingFloat: shift.openingFloat,
      totalCash: totals.totalCash,
      totalExpenses,
      totalCashIn,
    });

    const now = new Date();

    // Clock-out automático: cerrar el turno de caja CIERRA también a todo el
    // staff con turno laboral abierto en la sucursal (meseros, cajero, etc.).
    // Es la "conexión directa" pedida: un solo botón de cierre apaga la caja
    // y saca a todos los meseros de un jalón. EmployeeShift no tiene
    // restaurantId (no es SCOPED_MODEL), así que filtramos por los empleados
    // de esta sucursal — mismo patrón que /staff-active.
    const locationStaff = await prisma.employee.findMany({
      where: { locationId: req.locationId },
      select: { id: true },
    });
    const staffIds = locationStaff.map((e) => e.id);

    // El cierre de caja y el clock-out masivo van en una sola $transaction:
    // o cierra todo o no cierra nada (no dejar caja cerrada con meseros vivos).
    const [closed, clockOut] = await prisma.$transaction([
      prisma.cashShift.update({
        where: { id: shiftId },
        data: {
          isOpen: false,
          closedAt: now,
          closedById: closedByEmployeeId,
          closingFloat: closingFloat || 0,
          notes: notes || null,
          expectedCash,
          ...totals,
          totalExpenses,
          totalCashIn,
          totalSales,
          ordersCount: orders.length,
        },
        include: { expenses: true, cashIns: true }
      }),
      prisma.employeeShift.updateMany({
        where: { employeeId: { in: staffIds }, endAt: null },
        data: { endAt: now },
      }),
    ]);
    const staffClockedOut = clockOut.count;
    // Auditoría best-effort del cierre de caja (quién, cuánto, cuántas órdenes).
    audit.record(req, audit.AUDIT_EVENTS.SHIFT_CLOSE, {
      resource: `cashShift:${closed.id}`,
      before: { openingFloat: shift.openingFloat },
      after: {
        closingFloat: closed.closingFloat,
        expectedCash: closed.expectedCash,
        totalSales: closed.totalSales,
        totalExpenses: closed.totalExpenses,
        totalCashIn: closed.totalCashIn,
        ordersCount: closed.ordersCount,
        staffClockedOut,
      },
    }).catch(() => {});

    // Corte ciego: el cajero NO debe ver el efectivo esperado ni el desfase.
    // Persistimos expectedCash en la BD (para admin/historial y para el
    // endpoint /reveal con PIN), pero lo ocultamos en la respuesta al cajero.
    // El ticket de cierre que imprime el TPV refleja esto: sin arqueo si es ciego.
    if (closed.blindClose) {
      res.json({ ...closed, expectedCash: null, staffClockedOut });
    } else {
      res.json({ ...closed, staffClockedOut });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST revelar arqueo de un corte ciego (requiere PIN de admin) ────────
// Devuelve el efectivo esperado y el desfase de un turno SOLO si el PIN
// corresponde a un empleado con privilegios (ADMIN/OWNER/MANAGER o
// canManageShifts) de la sucursal. Así el cajero no ve el desfase en un
// corte ciego, pero un supervisor puede revelarlo/reimprimirlo en sitio.
router.post('/:id/reveal', requireLocation, async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN requerido', code: 'PIN_REQUIRED' });

    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });

    // Validar PIN contra empleados de la sucursal (bcrypt o legacy/offlinePin).
    // Mismo patrón que el login por PIN (employees.routes login).
    const candidates = await prisma.employee.findMany({
      where: { locationId: req.locationId, isActive: true },
      select: { id: true, name: true, role: true, canManageShifts: true, pin: true, offlinePin: true },
    });
    const sha256Pin = crypto.createHash('sha256').update(String(pin)).digest('hex');
    let emp = null;
    for (const c of candidates) {
      if (c.pin && c.pin.startsWith('$2')) {
        if (await bcrypt.compare(String(pin), c.pin)) { emp = c; break; }
      } else if (c.pin && c.pin === String(pin)) { emp = c; break; }
      else if (c.offlinePin && c.offlinePin === sha256Pin) { emp = c; break; }
    }
    if (!emp) return res.status(401).json({ error: 'PIN incorrecto', code: 'INVALID_PIN' });

    const privileged =
      ['ADMIN', 'SUPER_ADMIN', 'OWNER', 'MANAGER'].includes(emp.role) || emp.canManageShifts === true;
    if (!privileged) {
      return res.status(403).json({ error: 'Este PIN no tiene permiso para ver el arqueo', code: 'NOT_AUTHORIZED' });
    }

    const expectedCash = Number(shift.expectedCash || 0);
    const variance = Number(shift.closingFloat || 0) - expectedCash;
    res.json({
      revealedBy: emp.name,
      expectedCash,
      variance,
      openingFloat: shift.openingFloat,
      closingFloat: shift.closingFloat,
      totalCash: shift.totalCash,
      totalExpenses: shift.totalExpenses,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST agregar gasto al turno (scoped a sucursal) ──────────────────────
router.post('/:id/expenses', requireLocation, async (req, res) => {
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
router.delete('/expenses/:id', requireLocation, async (req, res) => {
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

// ── POST ingresar efectivo a caja (cambio/feria, scoped a sucursal) ──────
// Contraparte de los gastos: registra efectivo que el cajero METE a la
// gaveta y que no proviene de una venta. Suma al efectivo esperado del corte.
router.post('/:id/cash-ins', requireLocation, async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Monto inválido', code: 'INVALID_AMOUNT' });
    }

    // Validar que el turno pertenece a esta sucursal y sigue abierto.
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      select: { id: true, isOpen: true },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });
    if (!shift.isOpen) return res.status(409).json({ error: 'El turno ya está cerrado', code: 'SHIFT_CLOSED' });

    const cashIn = await prisma.shiftCashIn.create({
      data: {
        shiftId: req.params.id,
        description: String(description || 'Ingreso de efectivo').slice(0, 200),
        amount: amt,
        category: category || 'CHANGE',
      }
    });
    res.json(cashIn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE ingreso de efectivo (validado por sucursal del turno padre) ───
router.delete('/cash-ins/:id', requireLocation, async (req, res) => {
  try {
    const cashIn = await prisma.shiftCashIn.findUnique({
      where: { id: req.params.id },
      include: { shift: { select: { locationId: true } } },
    });
    if (!cashIn || cashIn.shift?.locationId !== req.locationId) {
      return res.status(404).json({ error: 'Ingreso no encontrado' });
    }
    await prisma.shiftCashIn.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET historial de turnos de la sucursal (admin) ───────────────────────
router.get('/', requireAdmin, requireLocation, async (req, res) => {
  try {
    const shifts = await prisma.cashShift.findMany({
      where: { locationId: req.locationId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { expenses: true, cashIns: true }
    });
    res.json(shifts);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET un turno específico (scoped a sucursal) ──────────────────────────
router.get('/:id', requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      include: {
        expenses: { orderBy: { createdAt: 'desc' } },
        cashIns: { orderBy: { createdAt: 'desc' } },
      }
    });
    if (!shift) return res.status(404).json({ error: 'No encontrado' });
    res.json(shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;