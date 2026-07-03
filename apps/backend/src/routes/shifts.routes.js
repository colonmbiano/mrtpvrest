const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireModule, MODULES } = require('../lib/modules');
const { validateBody } = require('../lib/validate');
const { openShiftSchema, closeShiftSchema } = require('../schemas/shifts.schema');
const { summarizePayments, cashCutSummary, round2 } = require('../lib/money');
const { sendCashCutEmail } = require('../lib/cash-cut-mailer');
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

// ── Gating del efectivo esperado de un turno ABIERTO ─────────────────────
// Reusa liveShiftTotals (mismo cálculo que el cierre, ya contempla cashIns) y
// decide si REVELAR los campos sensibles del corte (totalCash/totalSales/
// expectedCash). El corte ciego los oculta para que el cajero no "cuadre"
// tecleando el número exacto; se revelan si el turno NO es ciego, o si el
// empleado está privilegiado: permiso explícito canViewExpectedCash, o rol
// admin/owner/super_admin SIEMPRE QUE el restaurante no haya apagado ese
// override (RestaurantConfig.adminCanViewExpectedCash, default true). Los
// campos no sensibles (tarjeta/transferencia/gastos/ingresos) van siempre.
async function gateExpectedCash(shift, req) {
  const live = await liveShiftTotals(shift);

  const restaurantId = req.restaurantId || req.user?.restaurantId;
  let adminMayView = true;
  if (restaurantId) {
    const cfg = await prisma.restaurantConfig.findUnique({
      where: { restaurantId },
      select: { adminCanViewExpectedCash: true },
    });
    if (cfg) adminMayView = cfg.adminCanViewExpectedCash !== false;
  }

  const role = req.user?.role;
  const isAdminRole = role === 'ADMIN' || role === 'OWNER' || role === 'SUPER_ADMIN';
  // El permiso explícito por empleado SIEMPRE concede; el override por rol
  // admin queda sujeto al flag del restaurante.
  const privileged =
    req.user?.canViewExpectedCash === true || (isAdminRole && adminMayView);
  const reveal = !shift.blindClose || privileged;

  return {
    ...shift,
    ...live,
    // Sensibles al corte ciego → null si este empleado no puede verlos.
    totalCash: reveal ? live.totalCash : null,
    totalSales: reveal ? live.totalSales : null,
    expectedCash: reveal ? live.expectedCash : null,
    canRevealExpected: reveal,
  };
}

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
    res.json(shift ? await gateExpectedCash(shift, req) : null);
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
    res.json(shift ? await gateExpectedCash(shift, req) : null);
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
        // Corte CIEGO por default: el cajero no debe ver el efectivo esperado
        // (solo lo ve un rol admin/owner por la vía privilegiada de
        // gateExpectedCash, o quien tenga el permiso canViewExpectedCash). Solo
        // se abre en modo no-ciego si el caller manda blindClose:false explícito.
        blindClose: blindClose !== false,
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

// Mapea el corte del TPV de restaurante a la forma `cut` del correo y lo
// dispara (best-effort) vía el helper compartido. El arqueo va completo aunque
// el turno sea ciego: el correo llega a la bandeja del dueño (privilegiada).
function emailRestaurantCashCut(req, closed) {
  const closingFloat = closed.closingFloat;
  const variance = (closingFloat === null || closingFloat === undefined)
    ? null
    : Number(closingFloat) - Number(closed.expectedCash || 0);
  return sendCashCutEmail({
    restaurantId: req.restaurantId || req.user?.restaurantId,
    locationId: closed.locationId,
    closedByName: req.user?.name || closed.employeeName || 'Cajero',
    closedAt: closed.closedAt,
    adminUrl: `${process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.mrtpvrest.com'}/admin/reportes/cortes`,
    cut: {
      ordersCount: closed.ordersCount,
      totalCash: closed.totalCash,
      totalCard: closed.totalCard,
      totalTransfer: closed.totalTransfer,
      totalCourtesy: closed.totalCourtesy,
      totalSales: closed.totalSales,
      openingFloat: closed.openingFloat,
      totalCashIn: closed.totalCashIn,
      totalExpenses: closed.totalExpenses,
      expectedCash: closed.expectedCash,
      closingFloat,
      variance,
      notes: closed.notes,
    },
  });
}

// Where compartido de las órdenes que entran al corte de un turno. Lo usan el
// cierre (performShiftClose) y el cálculo en vivo (liveShiftTotals) para no
// desincronizarse. Regla de atribución del efectivo al turno:
//  - NO-delivery (comer aquí / para llevar): pagan al momento, así que
//    createdAt ≈ cobro. Se atribuyen por shiftId o, en su defecto, por fecha de
//    creación dentro de la ventana del turno (criterio de siempre).
//  - DELIVERY: el efectivo entra al cajón cuando el repartidor LIQUIDA, no
//    cuando se creó la orden — a veces días después, en OTRO turno. Se atribuye
//    por fecha de COBRO (paidAt) al turno abierto en ese momento. Atribuir por
//    createdAt dejaba el efectivo de una entrega vieja cobrada hoy SIN turno
//    (quedaba booked a un turno ya cerrado que no la capturó) → SOBRANTE
//    FANTASMA en el cierre de hoy. Solo cuenta delivery ya PAGADO: una entrega
//    repartida pero sin liquidar no tiene efectivo en el cajón todavía, así que
//    no debe inflar el esperado.
function shiftOrdersWhere(shift) {
  const paidWindow = { gte: shift.openedAt };
  // Turno ya cerrado (recompute histórico): acota el cobro a su ventana real
  // para no barrer cobros de turnos posteriores.
  if (shift.closedAt) paidWindow.lte = shift.closedAt;
  return {
    locationId: shift.locationId,
    status: 'DELIVERED',
    // Todas las fuentes de venta real entran al corte (TPV, mesero, tienda
    // online, WhatsApp, kiosko). Dejarlas fuera hacía que su efectivo apareciera
    // como sobrante inexplicable y las ventas totales salieran cortas.
    source: { in: ['TPV', 'WAITER', 'ONLINE', 'WHATSAPP', 'KIOSK'] },
    OR: [
      { orderType: { not: 'DELIVERY' }, shiftId: shift.id },
      // Fallback para órdenes no-delivery antiguas sin shiftId, dentro de la ventana.
      { orderType: { not: 'DELIVERY' }, shiftId: null, createdAt: { gte: shift.openedAt } },
      // Delivery: por fecha de cobro (liquidación del repartidor), no de creación.
      { orderType: 'DELIVERY', paymentStatus: 'PAID', paidAt: paidWindow },
    ],
  };
}

// Helper compartido: ejecuta el cierre de un turno YA cargado (con
// include {expenses, cashIns}). Lo usan POST /:id/close (turno por id) y
// POST /current/close (turno abierto resuelto por sucursal, para la cola
// offline que no conoce el id de servidor). Guard de doble cierre + corte +
// clock-out de staff + cortes de repartidor en una sola $transaction.
async function performShiftClose(req, res, shift) {
    const { closingFloat, notes, employeeId: bodyEmployeeId } = req.body;
    const shiftId = shift.id;

    // Guard de doble cierre: si ya está cerrado, no re-corremos el clock-out
    // ni los cortes de repartidor. El Idempotency-Key global cubre el replay
    // exacto; esto cubre cualquier otra vía (defensa en profundidad).
    if (!shift.isOpen) {
      return res.status(409).json({ error: 'El turno ya está cerrado', code: 'SHIFT_ALREADY_CLOSED' });
    }

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

    // Órdenes de este turno. Atribución del efectivo por shiftOrdersWhere:
    // no-delivery por turno/creación, delivery por fecha de cobro (paidAt).
    const orders = await prisma.order.findMany({
      where: shiftOrdersWhere(shift),
      // Cobro mixto: traer el desglose para sumar la porción de cada método a su
      // bucket (sin esto, una orden MIXED no entraría a ningún bucket del corte).
      include: { payments: { select: { method: true, amount: true, status: true } } },
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
      select: { id: true, role: true, name: true },
    });
    const staffIds = locationStaff.map((e) => e.id);

    // Corte automático de repartidores: cerrar la caja también CIERRA la caja de
    // cada repartidor de la sucursal con movimientos pendientes. Se calcula su
    // corte (DriverCashCut) y se aprueban sus movimientos en la MISMA
    // $transaction que el cierre — mismo criterio que POST /driver-cash/:id/cut
    // (toma exactamente los movimientos approved=false y los marca por id, para
    // que un movimiento creado durante el cierre no quede aprobado sin contar).
    const drivers = locationStaff.filter((e) => e.role === 'DELIVERY');
    const driverCuts = [];
    for (const d of drivers) {
      const movs = await prisma.driverCashMovement.findMany({
        where: { driverId: d.id, approved: false },
        select: { id: true, type: true, amount: true },
      });
      if (movs.length === 0) continue;
      const sumType = (t) => movs.filter((m) => m.type === t).reduce((s, m) => s + m.amount, 0);
      const float = sumType('FLOAT');
      const income = sumType('INCOME');
      const expense = sumType('EXPENSE');
      const returned = sumType('RETURN');
      driverCuts.push({
        driverId: d.id,
        driverName: d.name || 'Repartidor',
        totalFloat: float,
        totalIncome: income,
        totalExpense: expense,
        totalReturn: returned,
        balance: float + income - expense - returned,
        movements: movs.length,
        movementIds: movs.map((m) => m.id),
      });
    }

    // El cierre de caja, el clock-out masivo y los cortes de repartidor van en
    // una sola $transaction: o cierra todo o no cierra nada (no dejar caja
    // cerrada con meseros vivos ni cortes de repartidor a medias).
    const tx = [
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
    ];
    for (const dc of driverCuts) {
      tx.push(prisma.driverCashCut.create({
        data: {
          driverId: dc.driverId,
          driverName: dc.driverName,
          totalFloat: dc.totalFloat,
          totalIncome: dc.totalIncome,
          totalExpense: dc.totalExpense,
          totalReturn: dc.totalReturn,
          balance: dc.balance,
          movements: dc.movements,
          notes: `Corte automático al cierre de caja ${shiftId}`,
        },
      }));
      tx.push(prisma.driverCashMovement.updateMany({
        where: { id: { in: dc.movementIds } },
        data: { approved: true, approvedAt: now },
      }));
      tx.push(prisma.driverShiftRequest.updateMany({
        where: { driverId: dc.driverId, status: 'PENDING' },
        data: { status: 'RESOLVED', resolvedAt: now },
      }));
    }
    const [closed, clockOut] = await prisma.$transaction(tx);
    const staffClockedOut = clockOut.count;
    const driversCut = driverCuts.length;
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
        driversCut,
      },
    }).catch(() => {});

    // Correo del corte al dueño (best-effort, no se await-ea). El cierre ya está
    // confirmado en la BD; el correo es secundario y nunca debe bloquear la
    // respuesta al cajero ni revertir nada. Sale solo si el restaurante lo activó.
    emailRestaurantCashCut(req, closed).catch((e) => console.error('[cash-cut-email]', e?.message || e));

    // Corte ciego: el cajero NO debe ver el efectivo esperado ni el desfase.
    // Persistimos expectedCash en la BD (para admin/historial y para el
    // endpoint /reveal con PIN), pero lo ocultamos en la respuesta al cajero.
    // El ticket de cierre que imprime el TPV refleja esto: sin arqueo si es ciego.
    if (closed.blindClose) {
      res.json({ ...closed, expectedCash: null, staffClockedOut, driversCut });
    } else {
      res.json({ ...closed, staffClockedOut, driversCut });
    }
}

// ── POST cerrar el turno ABIERTO de la sucursal (sin id) ─────────────────
// Para la cola offline: el cliente no conoce el id de servidor si el turno se
// abrió sin red. Resolvemos el turno abierto por locationId (igual que GET
// /active). Si no hay ninguno abierto devolvemos 2xx idempotente — el goal
// "turno cerrado" ya se cumple, así la cola marca synced y no reintenta en
// bucle. DECLARADO ANTES de /:id/close (Express casa por orden: /:id casaría
// 'current' como id).
router.post('/current/close', requireLocation, requireCanManageShifts, validateBody(closeShiftSchema), async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      include: { expenses: true, cashIns: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) return res.json({ closed: false, reason: 'no_open_shift' });
    return await performShiftClose(req, res, shift);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST agregar gasto al turno ABIERTO de la sucursal (sin id, cola offline)
router.post('/current/expenses', requireLocation, async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      select: { id: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) return res.json({ skipped: true, reason: 'no_open_shift' });
    const expense = await prisma.shiftExpense.create({
      data: { shiftId: shift.id, description, amount: Number(amount), category: category || 'OTHER' },
    });
    res.json(expense);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST ingresar efectivo al turno ABIERTO de la sucursal (sin id, cola offline)
router.post('/current/cash-ins', requireLocation, async (req, res) => {
  try {
    const { description, amount, category } = req.body;
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'Monto inválido', code: 'INVALID_AMOUNT' });
    }
    const shift = await prisma.cashShift.findFirst({
      where: { isOpen: true, locationId: req.locationId },
      select: { id: true },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) return res.json({ skipped: true, reason: 'no_open_shift' });
    const cashIn = await prisma.shiftCashIn.create({
      data: {
        shiftId: shift.id,
        description: String(description || 'Ingreso de efectivo').slice(0, 200),
        amount: amt,
        category: category || 'CHANGE',
      },
    });
    res.json(cashIn);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST cerrar turno por id (solo el de la sucursal del request) ─────────
router.post('/:id/close', requireLocation, requireCanManageShifts, validateBody(closeShiftSchema), async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      include: { expenses: true, cashIns: true },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });
    return await performShiftClose(req, res, shift);
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

// ── POST previsualizar el corte EN VIVO de un turno ABIERTO (PIN admin) ───
// El corte ciego oculta los totales al cajero hasta el cierre. Este endpoint
// deja a un supervisor (PIN con privilegios) ver la venta total y el efectivo
// esperado ANTES de cerrar, SIN tocar el turno. A diferencia de /reveal —que
// lee los snapshots guardados, en 0/null hasta cerrar— aquí se calcula en vivo
// con el MISMO criterio que el cierre (liveShiftTotals). Opcionalmente recibe
// countedCash para mostrar el desfase tentativo contra lo contado.
router.post('/:id/preview', requireLocation, async (req, res) => {
  try {
    const { pin, countedCash } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN requerido', code: 'PIN_REQUIRED' });

    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      include: { expenses: true, cashIns: true },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });

    // Validar PIN contra empleados de la sucursal (bcrypt o legacy/offlinePin).
    // Mismo patrón que /reveal y el login por PIN.
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
      return res.status(403).json({ error: 'Este PIN no tiene permiso para ver el total', code: 'NOT_AUTHORIZED' });
    }

    const totals = await liveShiftTotals(shift);
    const counted = Number(countedCash);
    const variance = Number.isFinite(counted) ? counted - totals.expectedCash : null;
    res.json({
      revealedBy: emp.name,
      isOpen: shift.isOpen,
      openingFloat: shift.openingFloat,
      ...totals, // totalCash/Card/Transfer/Courtesy, totalExpenses, totalCashIn, totalSales, expectedCash, ordersCount
      countedCash: Number.isFinite(counted) ? counted : null,
      variance,
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
// Totales EN VIVO de un turno abierto, calculados desde las órdenes con el
// MISMO criterio que el cierre (summarizePayments + cashCutSummary). Los turnos
// guardan totalCash/totalSales/expectedCash en 0/null hasta cerrarse, así que
// sin esto las vistas de cortes muestran $0 para el turno en curso aunque ya
// haya ventas cobradas. Sólo se llama para turnos abiertos (normalmente 1).
async function liveShiftTotals(shift) {
  const orders = await prisma.order.findMany({
    where: shiftOrdersWhere(shift),
    // Cobro mixto: el desglose por método permite sumar la porción en efectivo
    // de una orden MIXED al efectivo esperado (ver lib/money.summarizePayments).
    select: {
      paymentMethod: true,
      total: true,
      payments: { select: { method: true, amount: true, status: true } },
    },
  });
  const totals = summarizePayments(orders);
  const totalExpenses = (shift.expenses || []).reduce((s, e) => s + e.amount, 0);
  const totalCashIn = (shift.cashIns || []).reduce((s, c) => s + c.amount, 0);
  const totalSales = Object.values(totals).reduce((a, b) => a + b, 0);
  const { expectedCash } = cashCutSummary({
    openingFloat: shift.openingFloat,
    totalCash: totals.totalCash,
    totalExpenses,
    totalCashIn,
  });
  return { ...totals, totalExpenses, totalCashIn, totalSales, expectedCash, ordersCount: orders.length };
}

// ── Liquidación por responsable (modelo de CAJA ÚNICA) ───────────────────
// No existen cajas contables separadas: el repartidor es solo un RESPONSABLE
// temporal de movimientos de la caja única del turno. Esta función arma su
// rendición de cuentas SIN crear cuentas nuevas ni doble-contar:
//   - Fondo recibido    = movimientos FLOAT del responsable en la ventana
//     (salida de caja única con responsable; ya reflejada vía cashIns/gastos).
//   - Compras comprobadas = movimientos EXPENSE (ya restan del turno vía
//     ShiftExpense espejado — aquí solo se ATRIBUYEN al responsable).
//   - Cobros de pedidos  = porción en EFECTIVO de las órdenes DELIVERY que él
//     entregó, cobradas en la ventana del turno (fuente: las ÓRDENES de la caja
//     única — ya cuentan en totalCash; aquí solo se atribuyen, no se suman de
//     nuevo). Se usa paidAt, igual que shiftOrdersWhere.
//   Sobrante de fondo   = fondo − compras
//   Total a entregar    = cobros + sobrante
// entregadoReal/diferencia quedan null hasta que exista captura del conteo por
// responsable al cierre (v2); la UI los muestra como "$____".
async function shiftDriverLiquidation(shift) {
  const end = shift.closedAt || new Date();
  const drivers = await prisma.employee.findMany({
    where: { locationId: shift.locationId, role: 'DELIVERY' },
    select: { id: true, name: true },
  });
  if (drivers.length === 0) return [];
  const ids = drivers.map((d) => d.id);
  const [movs, orders] = await Promise.all([
    prisma.driverCashMovement.findMany({
      where: {
        driverId: { in: ids },
        type: { in: ['FLOAT', 'EXPENSE'] },
        createdAt: { gte: shift.openedAt, lte: end },
      },
      select: { driverId: true, type: true, amount: true },
    }),
    prisma.order.findMany({
      where: {
        locationId: shift.locationId,
        status: 'DELIVERED',
        orderType: 'DELIVERY',
        paymentStatus: 'PAID',
        paidAt: { gte: shift.openedAt, lte: end },
        deliveryDriverId: { in: ids },
        source: { in: ['TPV', 'WAITER', 'ONLINE', 'WHATSAPP', 'KIOSK'] },
      },
      select: {
        deliveryDriverId: true,
        paymentMethod: true,
        total: true,
        payments: { select: { method: true, amount: true, status: true } },
      },
    }),
  ]);
  // Porción en efectivo de una orden (los métodos no-efectivo no pasan por las
  // manos del responsable). Mismo criterio de tenders que summarizePayments.
  const cashOf = (o) => {
    const tenders = (o.payments || []).filter((p) => p && p.status !== 'FAILED' && p.status !== 'REFUNDED');
    if (tenders.length > 0) {
      return tenders
        .filter((p) => p.method === 'CASH' || p.method === 'CASH_ON_DELIVERY')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }
    return o.paymentMethod === 'CASH' || o.paymentMethod === 'CASH_ON_DELIVERY' ? Number(o.total) || 0 : 0;
  };
  return drivers
    .map((d) => {
      const dm = movs.filter((m) => m.driverId === d.id);
      const fondo = round2(dm.filter((m) => m.type === 'FLOAT').reduce((s, m) => s + m.amount, 0));
      const compras = round2(dm.filter((m) => m.type === 'EXPENSE').reduce((s, m) => s + m.amount, 0));
      const dOrders = orders.filter((o) => o.deliveryDriverId === d.id);
      const cobros = round2(dOrders.reduce((s, o) => s + cashOf(o), 0));
      const sobrante = round2(fondo - compras);
      return {
        driverId: d.id,
        driverName: d.name,
        fondo,
        compras,
        sobrante,
        cobros,
        pedidos: dOrders.length,
        totalAEntregar: round2(cobros + sobrante),
        entregadoReal: null,
        diferencia: null,
      };
    })
    .filter((l) => l.fondo !== 0 || l.compras !== 0 || l.cobros !== 0);
}

// ── GET liquidación por responsable de un turno (scoped a sucursal) ──────
router.get('/:id/liquidation', requireLocation, async (req, res) => {
  try {
    const shift = await prisma.cashShift.findFirst({
      where: { id: req.params.id, locationId: req.locationId },
      select: { id: true, locationId: true, openedAt: true, closedAt: true },
    });
    if (!shift) return res.status(404).json({ error: 'Turno no encontrado en esta sucursal' });
    res.json(await shiftDriverLiquidation(shift));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/', requireAdmin, requireLocation, async (req, res) => {
  try {
    const shifts = await prisma.cashShift.findMany({
      where: { locationId: req.locationId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { expenses: true, cashIns: true }
    });
    // Enriquecer los turnos ABIERTOS con sus totales en vivo (ventas ya
    // cobradas, efectivo esperado) — los cerrados ya traen su snapshot.
    const enriched = await Promise.all(shifts.map(async (s) =>
      s.isOpen ? { ...s, ...(await liveShiftTotals(s)) } : s
    ));
    res.json(enriched);
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
// Exportado para pruebas unitarias de la regla de atribución del efectivo.
module.exports.shiftOrdersWhere = shiftOrdersWhere;
module.exports.shiftDriverLiquidation = shiftDriverLiquidation;