// expenses.routes.js
//
// Gastos operativos del local (luz, agua, sueldos, propinas pagadas en
// efectivo, etc.) — distintos de compras de inventario que viven en
// /api/purchases. Capturados desde el TPV con foto del ticket o manual.
//
// Regla clave — solo el efectivo de caja toca el corte del cajero:
//   - CASH_DRAWER    → DEBE existir un CashShift abierto en la location y se
//                      crea ShiftExpense vinculado para que el corte cuadre.
//   - CASH_VAULT     → sale de la bolsa de EFECTIVO de la bóveda.
//   - CORPORATE_CARD → sale de la bolsa DIGITAL de la bóveda.
//   - TRANSFER       → sale de la bolsa DIGITAL de la bóveda.
// Los tres últimos no crean ShiftExpense ni exigen turno abierto: el corte
// del cajero no se mueve. Ver src/lib/vault.js.

const express = require('express');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { round2 } = require('../lib/money');
const { applyVaultMovement, vaultDenied, channelForMethod } = require('../lib/vault');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

// Gate del módulo de inventario (donde viven gastos operativos).
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

// Threshold por encima del cual un CASHIER necesita PIN admin para
// autorizar el gasto. Pensado para que el cajero pueda meter compras
// rápidas (un cilindro de gas, propinas chicas) sin escalar siempre,
// pero gastos grandes pasen por supervisión.
const CASHIER_LIMIT_PER_EXPENSE = 500; // MXN

// Roles permitidos. CASHIER tiene tope; admins/managers no.
const ALLOWED_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];

const VALID_PAYMENT_METHODS = ['CASH_DRAWER', 'CASH_VAULT', 'CORPORATE_CARD', 'TRANSFER'];
const VALID_SETTLEMENT = ['PAID', 'PENDING'];

// ── GET /api/expenses ────────────────────────────────────────────────────
// Lista los gastos del restaurant (filtros opcionales: from, to, categoryId).
router.get('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { from, to, categoryId, locationId } = req.query;
    const where = { restaurantId };
    if (locationId) where.locationId = String(locationId);
    if (categoryId) where.categoryId = String(categoryId);
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = new Date(String(from));
      if (to)   where.occurredAt.lte = new Date(String(to));
    }

    const list = await prisma.operatingExpense.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });

    res.json(list);
  } catch (e) {
    console.error('GET /api/expenses:', e);
    res.status(500).json({ error: 'Error al listar gastos: ' + e.message });
  }
});

// ── POST /api/expenses ───────────────────────────────────────────────────
// Body: { categoryId?, concept, amount, paymentMethod, occurredAt?,
//         photoUrl?, notes?, locationId? }
//
// Cuando paymentMethod=CASH_DRAWER:
//   1. Busca CashShift abierto en la location (rechaza si no hay)
//   2. Crea OperatingExpense + ShiftExpense vinculado en una transacción
//   3. Incrementa CashShift.totalExpenses cache
router.post('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const userId       = req.user?.id || null;
    const userRole     = req.user?.role || 'CUSTOMER';
    const userLocationId = req.locationId || req.user?.locationId;

    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para registrar gastos' });
    }

    const {
      categoryId,
      concept,
      amount,
      paymentMethod,
      occurredAt,
      photoUrl,
      notes,
      locationId: bodyLocationId,
      settlementStatus,
      supplierId,
      dueDate,
      employeeId,
      payrollDays,
      payrollRate,
    } = req.body || {};

    // Validaciones
    if (!concept || typeof concept !== 'string' || concept.trim().length === 0) {
      return res.status(400).json({ error: 'concept requerido' });
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ error: 'amount debe ser > 0' });
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido' });
    }
    const settlement = settlementStatus || 'PAID';
    if (!VALID_SETTLEMENT.includes(settlement)) {
      return res.status(400).json({ error: 'settlementStatus inválido' });
    }
    // PENDING = deuda a pagar después: no exige turno ni toca caja al crearse.
    const isPending = settlement === 'PENDING';
    const locationId = bodyLocationId || userLocationId;
    if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

    // Si se indica proveedor, validar que pertenezca al restaurant.
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({
        where: { id: supplierId, restaurantId },
        select: { id: true },
      });
      if (!supplier) return res.status(400).json({ error: 'Proveedor no pertenece a este restaurant' });
    }

    // Pago de sueldo asignado a un trabajador: validar que el empleado sea del
    // restaurante (por su location) antes de ligar el gasto. Anti-IDOR
    // cross-tenant, mismo patrón que payroll.routes.
    let salaryEmployeeId = null;
    if (employeeId) {
      const emp = await prisma.employee.findFirst({
        where: { id: String(employeeId), location: { restaurantId } },
        select: { id: true },
      });
      if (!emp) return res.status(400).json({ error: 'Trabajador no pertenece a este restaurante' });
      salaryEmployeeId = emp.id;
    }
    const days = payrollDays != null && Number.isFinite(Number(payrollDays)) ? Number(payrollDays) : null;
    const rate = payrollRate != null && Number.isFinite(Number(payrollRate)) ? Number(payrollRate) : null;

    // Tope para cashier — si excede, debe haber sido autorizado por admin
    // (frontend pide PIN y vuelve a postear con header x-admin-authorized).
    if (userRole === 'CASHIER' && amt > CASHIER_LIMIT_PER_EXPENSE) {
      const authHeader = req.headers['x-admin-authorized'];
      if (authHeader !== 'true') {
        return res.status(402).json({
          error: `Gasto excede el límite de cajero ($${CASHIER_LIMIT_PER_EXPENSE}). Se requiere autorización de admin.`,
          code: 'ADMIN_AUTH_REQUIRED',
          limit: CASHIER_LIMIT_PER_EXPENSE,
        });
      }
    }

    // Canal de bóveda del método (null si es CASH_DRAWER). Un gasto PENDING no
    // la toca todavía: el dinero sale al liquidar, no al registrar la deuda.
    const vaultChannel = isPending ? null : channelForMethod(paymentMethod);
    // Sacar EFECTIVO de la bóveda exige rol de mando o PIN admin. El canal
    // digital no lleva candado (ver lib/vault.js).
    if (vaultChannel === 'CASH') {
      const denied = vaultDenied(req, userRole);
      if (denied) return res.status(402).json(denied);
    }

    // Si es CASH_DRAWER y NO es deuda pendiente, debe haber turno abierto.
    // Un gasto PENDING no toca caja todavía (no exige turno).
    let cashShiftId = null;
    if (!isPending && paymentMethod === 'CASH_DRAWER') {
      const openShift = await prisma.cashShift.findFirst({
        where: { locationId, isOpen: true },
        orderBy: { openedAt: 'desc' },
      });
      if (!openShift) {
        return res.status(409).json({
          error: 'No hay turno de caja abierto. Abre un turno antes de registrar gastos en efectivo.',
          code: 'NO_OPEN_SHIFT',
        });
      }
      cashShiftId = openShift.id;
    }

    // createdBy es FK a la tabla `users`, pero el TPV se autentica como
    // Employee (req.user.id = id de empleado, que NO existe en users). Setear
    // createdById con un id de empleado violaba la FK y devolvía 500 en CADA
    // guardado desde caja. Solo lo seteamos si el id corresponde a un User
    // real (caso admin web); para empleados del TPV queda null. La atribución
    // de gastos en efectivo sigue siendo recuperable vía CashShift.openedBy.
    let createdById = null;
    if (userId) {
      // Resolución de identidad del actor (bypass del tenant-guard: un
      // SUPER_ADMIN tiene restaurantId null y enforce lo dejaría en null).
      const u = await runWithBypass(() => prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }));
      if (u) createdById = u.id;
    }

    // Transacción: OperatingExpense + (opcional) ShiftExpense + actualizar
    // cache de CashShift.totalExpenses.
    const result = await prisma.$transaction(async (tx) => {
      const expense = await tx.operatingExpense.create({
        data: {
          restaurantId,
          locationId,
          categoryId: categoryId || null,
          concept: concept.trim(),
          amount: amt,
          paymentMethod,
          occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
          photoUrl: photoUrl || null,
          notes: notes || null,
          createdById,
          cashShiftId,
          settlementStatus: settlement,
          supplierId: supplierId || null,
          dueDate: dueDate ? new Date(dueDate) : null,
          employeeId: salaryEmployeeId,
          payrollDays: days,
          payrollRate: rate,
        },
      });

      if (cashShiftId) {
        // Determinar nombre de categoría para la fila legible en el cierre
        let categoryLabel = 'OTHER';
        if (categoryId) {
          const cat = await tx.operatingExpenseCategory.findUnique({
            where: { id: categoryId },
            select: { name: true },
          });
          if (cat?.name) categoryLabel = cat.name;
        }
        await tx.shiftExpense.create({
          data: {
            shiftId: cashShiftId,
            description: expense.concept,
            amount: amt,
            category: categoryLabel,
            operatingExpenseId: expense.id,
          },
        });
        await tx.cashShift.update({
          where: { id: cashShiftId },
          data: { totalExpenses: { increment: amt } },
        });
      }

      // Sale de la bóveda (efectivo acumulado o banco), NO de la gaveta. Sin
      // ShiftExpense y sin tocar CashShift.totalExpenses — el corte del
      // cajero queda intacto, que es justamente el punto.
      if (vaultChannel) {
        await applyVaultMovement(tx, {
          restaurantId,
          locationId,
          type: 'WITHDRAWAL',
          channel: vaultChannel,
          source: 'EXPENSE',
          amount: amt,
          description: expense.concept,
          operatingExpenseId: expense.id,
          createdById: userId,
          createdByName: req.user?.name || null,
          occurredAt: expense.occurredAt,
        });
      }

      return expense;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/expenses:', e);
    res.status(500).json({ error: 'Error al registrar gasto: ' + e.message });
  }
});

// ── POST /api/expenses/:id/settle ────────────────────────────────────────
// Liquida (total o PARCIAL) un gasto PENDIENTE. Body: { paymentMethod, amount?, occurredAt? }.
//   - amount omitido → liquida el saldo restante completo.
//   - amount < saldo → ABONO parcial (queda PENDIENTE con paidAmount mayor).
// Cada abono en efectivo (CASH_DRAWER) crea un ShiftExpense por ese monto y
// golpea la caja del día. Idempotente: el WHERE condicional incluye paidAmount,
// así un doble-tap con el mismo saldo observado no abona dos veces.
router.post('/:id/settle', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { id } = req.params;
    const userRole = req.user?.role || 'CUSTOMER';
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para liquidar gastos' });
    }
    const { paymentMethod, amount, occurredAt } = req.body || {};
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido' });
    }

    const expense = await prisma.operatingExpense.findFirst({
      where: { id, restaurantId },
      select: { id: true, amount: true, paidAmount: true, concept: true, locationId: true, categoryId: true, settlementStatus: true },
    });
    if (!expense) return res.status(404).json({ error: 'Gasto no encontrado' });
    if (expense.settlementStatus !== 'PENDING') {
      return res.status(409).json({ error: 'El gasto ya fue liquidado', code: 'ALREADY_SETTLED' });
    }

    const prevPaid = Number(expense.paidAmount || 0);
    const remaining = round2(Number(expense.amount) - prevPaid);
    const reqAmt = amount != null ? Number(amount) : remaining;
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    const pay = round2(Math.min(reqAmt, remaining));        // nunca sobre-pagar
    const newPaid = round2(prevPaid + pay);
    const fully = newPaid >= Number(expense.amount) - 0.005; // tolerancia de centavos

    // Tope del cajero también al LIQUIDAR (no solo al crear): un pago en
    // efectivo grande requiere autorización admin, igual que la creación.
    if (userRole === 'CASHIER' && pay > CASHIER_LIMIT_PER_EXPENSE && req.headers['x-admin-authorized'] !== 'true') {
      return res.status(402).json({
        error: `Pago excede el límite de cajero ($${CASHIER_LIMIT_PER_EXPENSE}). Se requiere autorización de admin.`,
        code: 'ADMIN_AUTH_REQUIRED',
        limit: CASHIER_LIMIT_PER_EXPENSE,
      });
    }

    // Abonar desde la bóveda tiene los mismos candados que crear un gasto con ella.
    const vaultChannel = channelForMethod(paymentMethod);
    if (vaultChannel) {
      if (vaultChannel === 'CASH') {
        const denied = vaultDenied(req, userRole);
        if (denied) return res.status(402).json(denied);
      }
      // La bóveda es por sucursal; un gasto legacy sin locationId no tiene de
      // dónde salir. Mejor 400 explícito que un 500 por violación de FK.
      if (!expense.locationId) {
        return res.status(400).json({ error: 'El gasto no tiene sucursal; no se puede pagar desde la bóveda.' });
      }
    }

    // Si el abono es en efectivo, debe haber turno abierto en su location.
    let cashShiftId = null;
    if (paymentMethod === 'CASH_DRAWER') {
      const openShift = await prisma.cashShift.findFirst({
        where: { locationId: expense.locationId, isOpen: true },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      });
      if (!openShift) {
        return res.status(409).json({
          error: 'No hay turno de caja abierto. Abre un turno antes de pagar en efectivo.',
          code: 'NO_OPEN_SHIFT',
        });
      }
      cashShiftId = openShift.id;
    }

    const settledAt = occurredAt ? new Date(occurredAt) : new Date();

    const applied = await prisma.$transaction(async (tx) => {
      // El WHERE incluye el paidAmount observado: si otra petición ya abonó, el
      // count es 0 y no duplicamos el cargo (idempotente ante doble-tap).
      const upd = await tx.operatingExpense.updateMany({
        where: { id, settlementStatus: 'PENDING', paidAmount: prevPaid },
        data: {
          paidAmount: newPaid,
          ...(fully ? {
            settlementStatus: 'PAID',
            settledAt,
            settledMethod: paymentMethod,
            settledShiftId: cashShiftId,
          } : {}),
        },
      });
      if (upd.count === 0) return false;

      if (cashShiftId) {
        let categoryLabel = 'OTHER';
        if (expense.categoryId) {
          const cat = await tx.operatingExpenseCategory.findUnique({
            where: { id: expense.categoryId },
            select: { name: true },
          });
          if (cat?.name) categoryLabel = cat.name;
        }
        await tx.shiftExpense.create({
          data: {
            shiftId: cashShiftId,
            description: fully ? expense.concept : `${expense.concept} (abono)`,
            amount: pay,
            category: categoryLabel,
            operatingExpenseId: expense.id,
          },
        });
        await tx.cashShift.update({
          where: { id: cashShiftId },
          data: { totalExpenses: { increment: pay } },
        });
      }

      // Abono pagado desde la bóveda. El updateMany condicional de arriba ya
      // nos protege del doble-tap, así que aquí no hace falta otra guarda de
      // idempotencia.
      if (vaultChannel) {
        await applyVaultMovement(tx, {
          restaurantId,
          locationId: expense.locationId,
          type: 'WITHDRAWAL',
          channel: vaultChannel,
          source: 'SETTLEMENT',
          amount: pay,
          description: fully ? expense.concept : `${expense.concept} (abono)`,
          operatingExpenseId: expense.id,
          createdById: req.user?.id || null,
          createdByName: req.user?.name || null,
          occurredAt: settledAt,
        });
      }
      return true;
    });

    if (!applied) {
      return res.status(409).json({ error: 'El saldo cambió o ya fue liquidado', code: 'STALE_OR_SETTLED' });
    }
    res.json({ ok: true, id, paid: pay, paidAmount: newPaid, remaining: round2(Number(expense.amount) - newPaid), fully, settledMethod: paymentMethod });
  } catch (e) {
    console.error('POST /api/expenses/:id/settle:', e);
    res.status(500).json({ error: 'Error al liquidar gasto: ' + e.message });
  }
});

// ── GET /api/expenses/payroll-employees ──────────────────────────────────
// Trabajadores activos del restaurante con su tarifa diaria (si tienen perfil
// de pago). Lo consume la pestaña "Sueldos" del TPV para sugerir el monto
// (tarifa × días). No exige el módulo payroll ni manage_users: pagar el sueldo
// es parte del flujo de caja (mismo gate que registrar un gasto). El tope de
// cajero + PIN admin de POST / sigue protegiendo montos grandes.
router.get('/payroll-employees', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const employees = await prisma.employee.findMany({
      where: { isActive: true, location: { restaurantId } },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, role: true,
        payProfile: { select: { payType: true, dailyRate: true } },
      },
    });
    res.json(employees.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      payType: e.payProfile?.payType || null,
      dailyRate: e.payProfile?.dailyRate != null ? Number(e.payProfile.dailyRate) : null,
    })));
  } catch (e) {
    console.error('GET /api/expenses/payroll-employees:', e);
    res.status(500).json({ error: 'Error al listar trabajadores: ' + e.message });
  }
});

// ── GET /api/expenses/salary-report?from=&to= ────────────────────────────
// Total pagado por trabajador (gastos ligados a un empleado) en el rango.
// Agrupa por employeeId sumando monto y días. Ordena de mayor a menor pagado.
router.get('/salary-report', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { from, to } = req.query;
    const where = { restaurantId, employeeId: { not: null } };
    if (from || to) {
      where.occurredAt = {};
      if (from) where.occurredAt.gte = new Date(String(from));
      if (to)   where.occurredAt.lte = new Date(String(to));
    }

    const grouped = await prisma.operatingExpense.groupBy({
      by: ['employeeId'],
      where,
      _sum: { amount: true, payrollDays: true },
      _count: { _all: true },
    });

    const ids = grouped.map((g) => g.employeeId).filter(Boolean);
    const emps = ids.length
      ? await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } })
      : [];
    const byId = new Map(emps.map((e) => [e.id, e]));

    const rows = grouped.map((g) => ({
      employeeId: g.employeeId,
      name: byId.get(g.employeeId)?.name || '—',
      role: byId.get(g.employeeId)?.role || null,
      totalPaid: round2(Number(g._sum.amount || 0)),
      totalDays: Number(g._sum.payrollDays || 0),
      payments: g._count._all,
    })).sort((a, b) => b.totalPaid - a.totalPaid);

    res.json({
      from: from || null,
      to: to || null,
      totalPaid: round2(rows.reduce((s, r) => s + r.totalPaid, 0)),
      employees: rows,
    });
  } catch (e) {
    console.error('GET /api/expenses/salary-report:', e);
    res.status(500).json({ error: 'Error al generar reporte de sueldos: ' + e.message });
  }
});

// ── GET /api/expenses/categories ─────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const list = await prisma.operatingExpenseCategory.findMany({
      where: { restaurantId, isActive: true },
      orderBy: { name: 'asc' },
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Error: ' + e.message });
  }
});

module.exports = router;
