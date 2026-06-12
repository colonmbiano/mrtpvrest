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

const express = require('express');
const { prisma, runWithBypass } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

// Gate del módulo de inventario (donde viven las compras).
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const CASHIER_LIMIT_PER_PURCHASE = 1000; // MXN
const ALLOWED_ROLES = ['CASHIER', 'WAITER', 'KITCHEN', 'ADMIN', 'MANAGER', 'OWNER', 'SUPER_ADMIN'];
const VALID_PAYMENT_METHODS = ['CASH_DRAWER', 'CORPORATE_CARD', 'TRANSFER'];

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
    } = req.body || {};

    // Validaciones
    if (!supplierId) return res.status(400).json({ error: 'supplierId requerido' });
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: 'paymentMethod inválido' });
    }
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

    // Si CASH_DRAWER, validar turno abierto
    let cashShiftId = null;
    if (paymentMethod === 'CASH_DRAWER') {
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

      return po;
    });

    res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/purchases:', e);
    res.status(500).json({ error: 'Error al registrar compra: ' + e.message });
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
