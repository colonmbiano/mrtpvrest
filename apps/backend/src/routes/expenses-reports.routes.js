// expenses-reports.routes.js
//
// Agregaciones de OperatingExpense + PurchaseOrder para dashboard admin.
// Útil para "gasto del mes por categoría", "top categorías", "compras vs
// gastos generales", "comparativa mes anterior".

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const router = express.Router();

// Reportes son feature premium del plan.
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasReports', 'Reportes IA'));

// Util · rango ISO seguro (default: mes actual).
function resolveRange(query) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  let from = query.from ? new Date(String(query.from)) : monthStart;
  let to = query.to ? new Date(String(query.to)) : monthEnd;
  if (isNaN(from.getTime())) from = monthStart;
  if (isNaN(to.getTime())) to = monthEnd;
  return { from, to };
}

// ── GET /api/reports/expenses-summary ────────────────────────────────────
// Resumen del rango: total OperatingExpense, total PurchaseOrder, breakdown
// por método de pago, comparativa con el rango ANTERIOR de igual duración.
router.get('/expenses-summary', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { from, to } = resolveRange(req.query);
    const durationMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - durationMs - 1);
    const prevTo = new Date(from.getTime() - 1);

    const locFilter = req.query.locationId
      ? { locationId: String(req.query.locationId) }
      : { location: { restaurantId } };

    // OperatingExpense — periodo actual y anterior
    const [opExpenses, opExpensesPrev] = await Promise.all([
      prisma.operatingExpense.findMany({
        where: { restaurantId, occurredAt: { gte: from, lte: to } },
        select: { amount: true, paymentMethod: true, categoryId: true, category: { select: { name: true, color: true, icon: true } } },
      }),
      prisma.operatingExpense.findMany({
        where: { restaurantId, occurredAt: { gte: prevFrom, lte: prevTo } },
        select: { amount: true },
      }),
    ]);

    // PurchaseOrder — periodo actual y anterior
    const [purchases, purchasesPrev] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { ...locFilter, receivedAt: { gte: from, lte: to } },
        select: { totalAmount: true, paymentMethod: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { ...locFilter, receivedAt: { gte: prevFrom, lte: prevTo } },
        select: { totalAmount: true },
      }),
    ]);

    const sumOp = opExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const sumPo = purchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const sumOpPrev = opExpensesPrev.reduce((s, e) => s + Number(e.amount || 0), 0);
    const sumPoPrev = purchasesPrev.reduce((s, p) => s + Number(p.totalAmount || 0), 0);

    // Breakdown por payment method (combinando gastos + compras)
    const byMethod = { CASH_DRAWER: 0, CORPORATE_CARD: 0, TRANSFER: 0 };
    for (const e of opExpenses) byMethod[e.paymentMethod] += Number(e.amount || 0);
    for (const p of purchases) byMethod[p.paymentMethod] += Number(p.totalAmount || 0);

    // Top categorías de OperatingExpense
    const byCategory = {};
    for (const e of opExpenses) {
      const key = e.categoryId || 'NONE';
      if (!byCategory[key]) {
        byCategory[key] = {
          categoryId: e.categoryId,
          name: e.category?.name || 'Sin categoría',
          icon: e.category?.icon || '📝',
          color: e.category?.color || null,
          total: 0,
          count: 0,
        };
      }
      byCategory[key].total += Number(e.amount || 0);
      byCategory[key].count += 1;
    }
    const topCategories = Object.values(byCategory)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    res.json({
      range: { from, to },
      previous: { from: prevFrom, to: prevTo },
      operatingExpenses: {
        total: sumOp,
        previousTotal: sumOpPrev,
        delta: sumOp - sumOpPrev,
        deltaPct: sumOpPrev > 0 ? ((sumOp - sumOpPrev) / sumOpPrev) * 100 : null,
        count: opExpenses.length,
      },
      purchases: {
        total: sumPo,
        previousTotal: sumPoPrev,
        delta: sumPo - sumPoPrev,
        deltaPct: sumPoPrev > 0 ? ((sumPo - sumPoPrev) / sumPoPrev) * 100 : null,
        count: purchases.length,
      },
      grandTotal: sumOp + sumPo,
      previousGrandTotal: sumOpPrev + sumPoPrev,
      byPaymentMethod: byMethod,
      topCategories,
    });
  } catch (e) {
    console.error('GET /api/reports/expenses-summary:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/reports/expenses-daily ──────────────────────────────────────
// Serie temporal diaria (para sparkline / chart).
// Devuelve [{ date, opExpenses, purchases, total }, ...] día a día.
router.get('/expenses-daily', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { from, to } = resolveRange(req.query);

    const locFilter = req.query.locationId
      ? { locationId: String(req.query.locationId) }
      : { location: { restaurantId } };

    const [opExpenses, purchases] = await Promise.all([
      prisma.operatingExpense.findMany({
        where: { restaurantId, occurredAt: { gte: from, lte: to } },
        select: { amount: true, occurredAt: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { ...locFilter, receivedAt: { gte: from, lte: to } },
        select: { totalAmount: true, receivedAt: true },
      }),
    ]);

    // Bucketear por día (YYYY-MM-DD)
    const buckets = new Map();
    function dateKey(d) {
      return new Date(d).toISOString().slice(0, 10);
    }
    function bucket(k) {
      if (!buckets.has(k)) buckets.set(k, { date: k, opExpenses: 0, purchases: 0, total: 0 });
      return buckets.get(k);
    }
    for (const e of opExpenses) {
      const b = bucket(dateKey(e.occurredAt));
      b.opExpenses += Number(e.amount || 0);
      b.total = b.opExpenses + b.purchases;
    }
    for (const p of purchases) {
      const b = bucket(dateKey(p.receivedAt));
      b.purchases += Number(p.totalAmount || 0);
      b.total = b.opExpenses + b.purchases;
    }

    // Rellenar días faltantes con 0 (para que la sparkline sea continua)
    const result = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    while (cursor <= end) {
      const k = dateKey(cursor);
      result.push(buckets.get(k) || { date: k, opExpenses: 0, purchases: 0, total: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({ range: { from, to }, days: result });
  } catch (e) {
    console.error('GET /api/reports/expenses-daily:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
