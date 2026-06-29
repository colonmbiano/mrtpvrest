// expenses.routes.js
//
// Gastos operativos del local (luz, agua, sueldos, propinas pagadas en
// efectivo, etc.) — distintos de compras de inventario que viven en
// /api/purchases. Capturados desde el TPV con foto del ticket o manual.
//
// Regla clave:
//   - paymentMethod=CASH_DRAWER  → DEBE existir un CashShift abierto en la
//                                  location y se crea ShiftExpense vinculado
//                                  para que el corte de caja cuadre.
//   - CORPORATE_CARD / TRANSFER → solo registro contable; no toca caja.

const express = require('express');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { round2 } = require('../lib/money');
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

const VALID_PAYMENT_METHODS = ['CASH_DRAWER', 'CORPORATE_CARD', 'TRANSFER'];
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
