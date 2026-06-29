// payables.routes.js
//
// Cuentas por pagar: deudas (OperatingExpense + PurchaseOrder con
// settlementStatus=PENDING) que aún no se pagan. Un PENDING NO tocó caja al
// crearse; se liquidan (total o por abonos) vía:
//   - POST /api/expenses/:id/settle
//   - POST /api/purchases/:id/settle
//
// Además gestiona el estado de cuenta por proveedor y los gastos recurrentes
// (plantillas que generan una cuenta por pagar cada periodo).

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const { pick } = require('../lib/validate');
const { round2: r2 } = require('../lib/money');
const { generateDueRecurring } = require('../services/recurring-expenses.service');
const router = express.Router();

router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

const VALID_FREQ = ['MONTHLY', 'BIWEEKLY', 'WEEKLY'];

// ── GET /api/payables ──────────────────────────────────────────────────────
// Deudas pendientes (gastos + compras) con saldo, ordenadas por vencimiento.
router.get('/', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { locationId } = req.query;
    const locFilter = locationId ? { locationId: String(locationId) } : {};

    const [expenses, purchases] = await Promise.all([
      prisma.operatingExpense.findMany({
        where: { restaurantId, settlementStatus: 'PENDING', ...locFilter },
        include: {
          supplier: { select: { id: true, name: true } },
          category: { select: { id: true, name: true, icon: true, color: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { occurredAt: 'asc' }],
        take: 500,
      }),
      prisma.purchaseOrder.findMany({
        where: { settlementStatus: 'PENDING', location: { restaurantId }, ...locFilter },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: 500,
      }),
    ]);

    const items = [
      ...expenses.map((e) => {
        const remaining = r2(Number(e.amount) - Number(e.paidAmount || 0));
        return {
          kind: 'EXPENSE', id: e.id, concept: e.concept,
          amount: e.amount, paidAmount: e.paidAmount || 0, remaining,
          dueDate: e.dueDate, supplier: e.supplier, category: e.category,
          occurredAt: e.occurredAt, settleUrl: `/api/expenses/${e.id}/settle`,
        };
      }),
      ...purchases.map((p) => {
        const remaining = r2(Number(p.totalAmount) - Number(p.paidAmount || 0));
        return {
          kind: 'PURCHASE', id: p.id, concept: `Compra ${p.poNumber}`,
          amount: p.totalAmount, paidAmount: p.paidAmount || 0, remaining,
          dueDate: p.dueDate, supplier: p.supplier, category: null,
          occurredAt: p.createdAt, settleUrl: `/api/purchases/${p.id}/settle`,
        };
      }),
    ];

    // Agrupado por proveedor (por SALDO pendiente).
    const bySupplier = {};
    for (const it of items) {
      const key = it.supplier?.id || '__none__';
      if (!bySupplier[key]) bySupplier[key] = { supplier: it.supplier || null, total: 0, count: 0 };
      bySupplier[key].total = r2(bySupplier[key].total + it.remaining);
      bySupplier[key].count += 1;
    }

    const total = r2(items.reduce((s, i) => s + i.remaining, 0));
    res.json({ items, total, count: items.length, bySupplier: Object.values(bySupplier) });
  } catch (e) {
    console.error('GET /api/payables:', e);
    res.status(500).json({ error: 'Error al listar cuentas por pagar: ' + e.message });
  }
});

// ── GET /api/payables/supplier/:supplierId ──────────────────────────────────
// Estado de cuenta: deuda actual + historial (pendientes y pagados) del proveedor.
router.get('/supplier/:supplierId', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { supplierId } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, restaurantId },
      select: { id: true, name: true, phone: true },
    });
    if (!supplier) return res.status(404).json({ error: 'Proveedor no encontrado' });

    const [exp, pos] = await Promise.all([
      prisma.operatingExpense.findMany({
        where: { restaurantId, supplierId },
        orderBy: { occurredAt: 'desc' }, take: 200,
        select: { id: true, concept: true, amount: true, paidAmount: true, settlementStatus: true, dueDate: true, occurredAt: true, settledAt: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { supplierId, location: { restaurantId } },
        orderBy: { createdAt: 'desc' }, take: 200,
        select: { id: true, poNumber: true, totalAmount: true, paidAmount: true, settlementStatus: true, dueDate: true, createdAt: true, settledAt: true },
      }),
    ]);

    const items = [
      ...exp.map((e) => ({
        kind: 'EXPENSE', id: e.id, concept: e.concept, amount: e.amount,
        paidAmount: e.paidAmount || 0, remaining: r2(Number(e.amount) - Number(e.paidAmount || 0)),
        status: e.settlementStatus, dueDate: e.dueDate, date: e.occurredAt, settledAt: e.settledAt,
      })),
      ...pos.map((p) => ({
        kind: 'PURCHASE', id: p.id, concept: `Compra ${p.poNumber}`, amount: p.totalAmount,
        paidAmount: p.paidAmount || 0, remaining: r2(Number(p.totalAmount) - Number(p.paidAmount || 0)),
        status: p.settlementStatus, dueDate: p.dueDate, date: p.createdAt, settledAt: p.settledAt,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const pendingTotal = r2(items.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.remaining, 0));
    res.json({ supplier, pendingTotal, items });
  } catch (e) {
    console.error('GET /api/payables/supplier/:id:', e);
    res.status(500).json({ error: 'Error en estado de cuenta: ' + e.message });
  }
});

// ── Gastos recurrentes ──────────────────────────────────────────────────────

// GET /api/payables/recurring — plantillas del restaurant.
router.get('/recurring', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const list = await prisma.recurringExpense.findMany({
      where: { restaurantId },
      orderBy: [{ isActive: 'desc' }, { nextDueAt: 'asc' }],
    });
    res.json(list);
  } catch (e) {
    console.error('GET /api/payables/recurring:', e);
    res.status(500).json({ error: 'Error: ' + e.message });
  }
});

// POST /api/payables/recurring — crear plantilla.
router.post('/recurring', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const body = pick(req.body, ['locationId', 'categoryId', 'supplierId', 'concept', 'amount', 'frequency', 'dayOfMonth', 'nextDueAt', 'isActive']);
    const concept = String(body.concept || '').trim();
    const amount = Number(body.amount);
    const frequency = body.frequency || 'MONTHLY';
    if (!concept) return res.status(400).json({ error: 'concept requerido' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'amount debe ser > 0' });
    if (!VALID_FREQ.includes(frequency)) return res.status(400).json({ error: 'frequency inválida' });

    const locationId = body.locationId || req.locationId || req.headers['x-location-id'] || null;
    if (!locationId) return res.status(400).json({ error: 'locationId requerido' });

    const nextDueAt = body.nextDueAt ? new Date(body.nextDueAt) : new Date();
    if (isNaN(nextDueAt.getTime())) return res.status(400).json({ error: 'nextDueAt inválida' });

    const created = await prisma.recurringExpense.create({
      data: {
        restaurantId,
        locationId,
        categoryId: body.categoryId || null,
        supplierId: body.supplierId || null,
        concept,
        amount,
        frequency,
        dayOfMonth: body.dayOfMonth != null ? Number(body.dayOfMonth) : null,
        nextDueAt,
        isActive: body.isActive != null ? Boolean(body.isActive) : true,
        createdById: req.user?.id || null,
      },
    });
    res.status(201).json(created);
  } catch (e) {
    console.error('POST /api/payables/recurring:', e);
    res.status(500).json({ error: 'Error al crear recurrente: ' + e.message });
  }
});

// PATCH /api/payables/recurring/:id — editar / activar / desactivar.
router.patch('/recurring/:id', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { id } = req.params;

    const data = pick(req.body, ['locationId', 'categoryId', 'supplierId', 'concept', 'amount', 'frequency', 'dayOfMonth', 'nextDueAt', 'isActive']);
    if (data.amount != null) data.amount = Number(data.amount);
    if (data.dayOfMonth != null) data.dayOfMonth = Number(data.dayOfMonth);
    if (data.nextDueAt != null) data.nextDueAt = new Date(data.nextDueAt);
    if (data.isActive != null) data.isActive = Boolean(data.isActive);
    if (data.frequency != null && !VALID_FREQ.includes(data.frequency)) {
      return res.status(400).json({ error: 'frequency inválida' });
    }

    const upd = await prisma.recurringExpense.updateMany({ where: { id, restaurantId }, data });
    if (upd.count === 0) return res.status(404).json({ error: 'Recurrente no encontrado' });
    res.json({ ok: true, id });
  } catch (e) {
    console.error('PATCH /api/payables/recurring/:id:', e);
    res.status(500).json({ error: 'Error al actualizar recurrente: ' + e.message });
  }
});

// DELETE /api/payables/recurring/:id
router.delete('/recurring/:id', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const upd = await prisma.recurringExpense.deleteMany({ where: { id: req.params.id, restaurantId } });
    if (upd.count === 0) return res.status(404).json({ error: 'Recurrente no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/payables/recurring/:id:', e);
    res.status(500).json({ error: 'Error al eliminar recurrente: ' + e.message });
  }
});

// POST /api/payables/recurring/run — materializa las plantillas vencidas en
// cuentas por pagar (OperatingExpense PENDING) y avanza nextDueAt. Idempotente:
// el WHERE condicional sobre nextDueAt evita doble generación en corridas
// concurrentes. Pensado para un cron diario (o botón manual en el admin).
router.post('/recurring/run', async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const result = await generateDueRecurring({ restaurantId });
    res.json(result);
  } catch (e) {
    console.error('POST /api/payables/recurring/run:', e);
    res.status(500).json({ error: 'Error al generar recurrentes: ' + e.message });
  }
});

module.exports = router;
