// purchases.routes.js
//
// Compras de inventario capturadas desde el TPV (foto del ticket o manual).
// Distinto de /api/expenses que es para gastos operativos sin inventario.
//
// Una compra crea, en una sola transacción:
//   1. PurchaseOrder (status=RECEIVED, totalAmount calculado)
//   2. N PurchaseOrderItem (uno por línea)
//   3. N StockMovement (reason=PURCHASE, delta positivo, balanceAfter)
//   4. Actualiza Ingredient.stock en cada uno
//   5. Si paymentMethod=CASH_DRAWER:
//      - PurchaseOrder.cashShiftId = turno abierto
//      - ShiftExpense vinculado al PurchaseOrder (description="Compra: ...")
//      - CashShift.totalExpenses += totalAmount
//   5'. Si el pago NO es CASH_DRAWER (compra en tienda pagada con el dinero
//      acumulado del negocio): sale de la bóveda, de su bolsa de efectivo
//      (CASH_VAULT) o digital (CORPORATE_CARD / TRANSFER). El stock sube
//      igual, pero el corte del cajero no se mueve. Ver lib/vault.js.

const express = require('express');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { round2 } = require('../lib/money');
const { applyVaultMovement, vaultDenied, channelForMethod } = require('../lib/vault');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

// Gate del módulo de inventario (donde viven las compras).
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const CASHIER_LIMIT_PER_PURCHASE = 1000; // MXN
const ALLOWED_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];
const VALID_PAYMENT_METHODS = ['CASH_DRAWER', 'CASH_VAULT', 'CORPORATE_CARD', 'TRANSFER'];
const VALID_SETTLEMENT = ['PAID', 'PENDING'];

// Genera un PO number único por location: PO-YYYYMMDD-XXXX.
async function nextPoNumber(tx, locationId) {
  const today = new Date();
  const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `PO-${yyyymmdd}-`;
  const last = await tx.purchaseOrder.findFirst({
    where: { locationId, poNumber: { startsWith: prefix } },
    orderBy: { poNumber: 'desc' },
    select: { poNumber: true },
  });
  const lastNum = last?.poNumber ? parseInt(last.poNumber.slice(-4), 10) : 0;
  const next = String((lastNum || 0) + 1).padStart(4, '0');
  return `${prefix}${next}`;
}

// ── POST /api/purchases ──────────────────────────────────────────────────
// Body: {
//   supplierId, locationId?, paymentMethod,
//   items: [{ ingredientId, qty, unitPrice, unit? }],
//   photoUrl?, notes?, occurredAt?
// }
router.post('/', async (req, res) => {
  try {
    const restaurantId   = req.restaurantId || req.user?.restaurantId;
    const userId         = req.user?.id || null;
    const userRole       = req.user?.role || 'CUSTOMER';
    const userLocationId = req.locationId || req.user?.locationId;

    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para registrar compras' });
    }

    const {
      supplierId,
      locationId: bodyLocationId,
      paymentMethod,
      items,
      photoUrl,
      notes,
      occurredAt,
      settlementStatus,
      dueDate,
    } = req.body || {};

    // Validaciones
    if (!supplierId) return res.status(400).json({ error: 'supplierId requerido' });
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido' });
    }
    const settlement = settlementStatus || 'PAID';
    if (!VALID_SETTLEMENT.includes(settlement)) {
      return res.status(400).json({ error: 'settlementStatus inválido' });
    }
    // PENDING = la mercancía se recibe (sube stock) pero el pago queda a deber:
    // no exige turno ni crea ShiftExpense hasta liquidarse.
    const isPending = settlement === 'PENDING';
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items requerido (mínimo 1)' });
    }
    const locationId = bodyLocationId || userLocationId;
    if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

    // Validar y normalizar items
    const normalized = [];
    for (const raw of items) {
      const ingredientId = raw?.ingredientId;
      const qty = Number(raw?.qty);
      const unitPrice = Number(raw?.unitPrice);
      if (!ingredientId) return res.status(400).json({ error: 'item sin ingredientId' });
      if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: `qty inválida para ${ingredientId}` });
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return res.status(400).json({ error: `unitPrice inválido para ${ingredientId}` });
      normalized.push({ ingredientId, qty, unitPrice });
    }

    const totalAmount = normalized.reduce((s, it) => s + it.qty * it.unitPrice, 0);

    // Tope cashier
    if (userRole === 'CASHIER' && totalAmount > CASHIER_LIMIT_PER_PURCHASE) {
      const authHeader = req.headers['x-admin-authorized'];
      if (authHeader !== 'true') {
        return res.status(402).json({
          error: `Compra excede el límite de cajero ($${CASHIER_LIMIT_PER_PURCHASE}). Se requiere autorización admin.`,
          code: 'ADMIN_AUTH_REQUIRED',
          limit: CASHIER_LIMIT_PER_PURCHASE,
        });
      }
    }

    // Compra pagada desde la bóveda: no exige turno abierto (ese es el punto —
    // se compró en la tienda un martes con dinero del viernes). Sacar efectivo
    // sí exige permiso; el canal digital no (ver lib/vault.js).
    const vaultChannel = isPending ? null : channelForMethod(paymentMethod);
    if (vaultChannel === 'CASH') {
      const denied = vaultDenied(req, userRole);
      if (denied) return res.status(402).json(denied);
    }

    // Si CASH_DRAWER y NO es deuda pendiente, validar turno abierto.
    let cashShiftId = null;
    if (!isPending && paymentMethod === 'CASH_DRAWER') {
      const openShift = await prisma.cashShift.findFirst({
        where: { locationId, isOpen: true },
        orderBy: { openedAt: 'desc' },
      });
      if (!openShift) {
        return res.status(409).json({
          error: 'No hay turno de caja abierto. Abre un turno antes de comprar con efectivo.',
          code: 'NO_OPEN_SHIFT',
        });
      }
      cashShiftId = openShift.id;
    }

    // Verificar que todos los Ingredients existen y pertenecen al restaurant
    const ingredientIds = normalized.map(i => i.ingredientId);
    const dbIngredients = await prisma.ingredient.findMany({
      where: { id: { in: ingredientIds }, restaurantId },
      select: { id: true, name: true, baseUnit: true, stock: true, locationId: true },
    });
    if (dbIngredients.length !== ingredientIds.length) {
      return res.status(400).json({ error: 'Uno o más ingredientes no pertenecen a este restaurant' });
    }
    const ingredientMap = new Map(dbIngredients.map(i => [i.id, i]));

    // Buscar Supplier
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, restaurantId },
      select: { id: true, name: true },
    });
    if (!supplier) return res.status(400).json({ error: 'Supplier no pertenece a este restaurant' });

    // PurchaseOrder.createdBy y StockMovement.user son FKs a la tabla `users`,
    // pero el TPV se autentica como Employee (req.user.id = id de empleado, que
    // NO existe en users). Setear estos campos con un id de empleado violaba la
    // FK y devolvía 500 al recibir la compra desde caja. Resolvemos a un User
    // real solo si existe (caso admin web); para empleados del TPV queda null.
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

    // ── Transacción ──
    const result = await prisma.$transaction(async (tx) => {
      const poNumber = await nextPoNumber(tx, locationId);

      // 1. PurchaseOrder
      const po = await tx.purchaseOrder.create({
        data: {
          locationId,
          supplierId,
          poNumber,
          status: 'RECEIVED',
          paymentMethod,
          cashShiftId,
          totalAmount,
          notes: notes || null,
          receivedAt: occurredAt ? new Date(occurredAt) : new Date(),
          createdById,
          settlementStatus: settlement,
          dueDate: dueDate ? new Date(dueDate) : null,
        },
      });

      // 2. PurchaseOrderItem + 3. StockMovement + 4. Ingredient.stock UPDATE
      for (const it of normalized) {
        const ing = ingredientMap.get(it.ingredientId);
        const lineTotal = it.qty * it.unitPrice;

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            ingredientId: it.ingredientId,
            qtyOrdered: it.qty,
            qtyReceived: it.qty,
            unitPrice: it.unitPrice,
            lineTotal,
          },
        });

        const updated = await tx.ingredient.update({
          where: { id: it.ingredientId },
          data: { stock: { increment: it.qty } },
          select: { stock: true, baseUnit: true, locationId: true },
        });

        await tx.stockMovement.create({
          data: {
            ingredientId: it.ingredientId,
            locationId: updated.locationId || locationId,
            delta: it.qty,
            unit: updated.baseUnit,
            reason: 'PURCHASE',
            refType: 'purchaseOrder',
            refId: po.id,
            balanceAfter: Number(updated.stock),
            unitCostAtMove: it.unitPrice,
            userId: createdById,
            notes: `Compra ${poNumber} · ${supplier.name}`,
          },
        });
      }

      // 5. ShiftExpense vinculado (solo si CASH_DRAWER)
      if (cashShiftId) {
        await tx.shiftExpense.create({
          data: {
            shiftId: cashShiftId,
            description: `Compra: ${supplier.name} (${poNumber})`,
            amount: totalAmount,
            category: 'PURCHASE',
            purchaseOrderId: po.id,
          },
        });
        await tx.cashShift.update({
          where: { id: cashShiftId },
          data: { totalExpenses: { increment: totalAmount } },
        });
      }

      // 5'. Bóveda: la compra sale del dinero acumulado. Sin ShiftExpense.
      if (vaultChannel) {
        await applyVaultMovement(tx, {
          restaurantId,
          locationId,
          type: 'WITHDRAWAL',
          channel: vaultChannel,
          source: 'PURCHASE',
          amount: totalAmount,
          description: `Compra: ${supplier.name} (${poNumber})`,
          purchaseOrderId: po.id,
          createdById: userId,
          createdByName: req.user?.name || null,
          occurredAt: po.receivedAt,
        });
      }

      return po;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/purchases:', e);
    res.status(500).json({ error: 'Error al registrar compra: ' + e.message });
  }
});

// ── POST /api/purchases/:id/settle ───────────────────────────────────────
// Liquida (total o PARCIAL) una compra PENDIENTE. Body: { paymentMethod, amount?, occurredAt? }.
// amount omitido → paga el saldo; amount < saldo → ABONO (queda PENDIENTE).
// Cada abono en efectivo crea un ShiftExpense por ese monto. Idempotente (el
// WHERE condicional incluye paidAmount).
router.post('/:id/settle', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { id } = req.params;
    const userRole = req.user?.role || 'CUSTOMER';
    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(403).json({ error: 'Rol sin permiso para liquidar compras' });
    }
    const { paymentMethod, amount, occurredAt } = req.body || {};
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido' });
    }

    const po = await prisma.purchaseOrder.findFirst({
      where: { id, location: { restaurantId } },
      select: { id: true, totalAmount: true, paidAmount: true, poNumber: true, locationId: true, settlementStatus: true, supplier: { select: { name: true } } },
    });
    if (!po) return res.status(404).json({ error: 'Compra no encontrada' });
    if (po.settlementStatus !== 'PENDING') {
      return res.status(409).json({ error: 'La compra ya fue liquidada', code: 'ALREADY_SETTLED' });
    }

    const prevPaid = Number(po.paidAmount || 0);
    const remaining = round2(Number(po.totalAmount) - prevPaid);
    const reqAmt = amount != null ? Number(amount) : remaining;
    if (!Number.isFinite(reqAmt) || reqAmt <= 0) {
      return res.status(400).json({ error: 'amount inválido' });
    }
    const pay = round2(Math.min(reqAmt, remaining));
    const newPaid = round2(prevPaid + pay);
    const fully = newPaid >= Number(po.totalAmount) - 0.005;

    if (userRole === 'CASHIER' && pay > CASHIER_LIMIT_PER_PURCHASE && req.headers['x-admin-authorized'] !== 'true') {
      return res.status(402).json({
        error: `Pago excede el límite de cajero ($${CASHIER_LIMIT_PER_PURCHASE}). Se requiere autorización de admin.`,
        code: 'ADMIN_AUTH_REQUIRED',
        limit: CASHIER_LIMIT_PER_PURCHASE,
      });
    }

    const vaultChannel = channelForMethod(paymentMethod);
    if (vaultChannel === 'CASH') {
      const denied = vaultDenied(req, userRole);
      if (denied) return res.status(402).json(denied);
    }

    let cashShiftId = null;
    if (paymentMethod === 'CASH_DRAWER') {
      const openShift = await prisma.cashShift.findFirst({
        where: { locationId: po.locationId, isOpen: true },
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
      const upd = await tx.purchaseOrder.updateMany({
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
        await tx.shiftExpense.create({
          data: {
            shiftId: cashShiftId,
            description: `Compra: ${po.supplier?.name || ''} (${po.poNumber})${fully ? '' : ' (abono)'}`,
            amount: pay,
            category: 'PURCHASE',
            purchaseOrderId: po.id,
          },
        });
        await tx.cashShift.update({
          where: { id: cashShiftId },
          data: { totalExpenses: { increment: pay } },
        });
      }

      // Abono pagado desde la bóveda (efectivo acumulado o banco).
      if (vaultChannel) {
        await applyVaultMovement(tx, {
          restaurantId,
          locationId: po.locationId,
          type: 'WITHDRAWAL',
          channel: vaultChannel,
          source: 'SETTLEMENT',
          amount: pay,
          description: `Compra: ${po.supplier?.name || ''} (${po.poNumber})${fully ? '' : ' (abono)'}`,
          purchaseOrderId: po.id,
          createdById: req.user?.id || null,
          createdByName: req.user?.name || null,
          occurredAt: settledAt,
        });
      }
      return true;
    });

    if (!applied) {
      return res.status(409).json({ error: 'El saldo cambió o ya fue liquidada', code: 'STALE_OR_SETTLED' });
    }
    res.json({ ok: true, id, paid: pay, paidAmount: newPaid, remaining: round2(Number(po.totalAmount) - newPaid), fully, settledMethod: paymentMethod });
  } catch (e) {
    console.error('POST /api/purchases/:id/settle:', e);
    res.status(500).json({ error: 'Error al liquidar compra: ' + e.message });
  }
});

// ── GET /api/purchases ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { from, to, supplierId, locationId } = req.query;
    const where = { location: { restaurantId } };
    if (locationId) where.locationId = String(locationId);
    if (supplierId) where.supplierId = String(supplierId);
    if (from || to) {
      where.receivedAt = {};
      if (from) where.receivedAt.gte = new Date(String(from));
      if (to)   where.receivedAt.lte = new Date(String(to));
    }

    const list = await prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        items: { include: { ingredient: { select: { id: true, name: true, baseUnit: true } } } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(list);
  } catch (e) {
    console.error('GET /api/purchases:', e);
    res.status(500).json({ error: 'Error al listar compras: ' + e.message });
  }
});

// ── GET /api/purchases/lookup/suppliers ──────────────────────────────────
// Listado simple de proveedores para el modal del TPV. Sin requireAdmin
// (el TPV es operado por CASHIER+ que necesitan ver el catálogo).
router.get('/lookup/suppliers', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const suppliers = await prisma.supplier.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(suppliers);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/purchases/lookup/ingredients ────────────────────────────────
// Listado de ingredientes con info mínima para autocomplete. Filtra por
// location del cajero si se pasa, sino todos del restaurant.
router.get('/lookup/ingredients', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.query.locationId || req.locationId || req.user?.locationId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const ingredients = await prisma.ingredient.findMany({
      where: { restaurantId, isActive: true, ...(locationId ? { locationId } : {}) },
      select: {
        id: true, name: true, baseUnit: true, unit: true,
        category: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(ingredients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
