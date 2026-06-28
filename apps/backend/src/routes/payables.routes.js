// payables.routes.js
//
// Cuentas por pagar: deudas registradas que aún no se han pagado, unificando
// gastos operativos (OperatingExpense) y compras de inventario (PurchaseOrder)
// con settlementStatus=PENDING. Un PENDING NO tocó caja al crearse; aquí se
// listan para liquidarlos vía:
//   - POST /api/expenses/:id/settle
//   - POST /api/purchases/:id/settle
//
// La liquidación es la que recién golpea la caja del día en que se paga.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasInventory', 'Inventario y costeo'));

// ── GET /api/payables ──────────────────────────────────────────────────────
// Lista deudas pendientes (gastos + compras), ordenadas por vencimiento.
// Query opcional: locationId.
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
      ...expenses.map((e) => ({
        kind: 'EXPENSE',
        id: e.id,
        concept: e.concept,
        amount: e.amount,
        dueDate: e.dueDate,
        supplier: e.supplier,
        category: e.category,
        occurredAt: e.occurredAt,
        settleUrl: `/api/expenses/${e.id}/settle`,
      })),
      ...purchases.map((p) => ({
        kind: 'PURCHASE',
        id: p.id,
        concept: `Compra ${p.poNumber}`,
        amount: p.totalAmount,
        dueDate: p.dueDate,
        supplier: p.supplier,
        category: null,
        occurredAt: p.createdAt,
        settleUrl: `/api/purchases/${p.id}/settle`,
      })),
    ];

    // Agrupado por proveedor para la vista de admin.
    const bySupplier = {};
    for (const it of items) {
      const key = it.supplier?.id || '__none__';
      if (!bySupplier[key]) {
        bySupplier[key] = { supplier: it.supplier || null, total: 0, count: 0 };
      }
      bySupplier[key].total += Number(it.amount) || 0;
      bySupplier[key].count += 1;
    }

    const total = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    res.json({ items, total, count: items.length, bySupplier: Object.values(bySupplier) });
  } catch (e) {
    console.error('GET /api/payables:', e);
    res.status(500).json({ error: 'Error al listar cuentas por pagar: ' + e.message });
  }
});

module.exports = router;
