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
    const locationId = bodyLocationId || userLocationId;
    if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

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

    // Si es CASH_DRAWER, debe haber turno abierto
    let cashShiftId = null;
    if (paymentMethod === 'CASH_DRAWER') {
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
