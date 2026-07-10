// expenses-reports.routes.js
//
// Agregaciones de OperatingExpense + PurchaseOrder para dashboard admin.
// Útil para "gasto del mes por categoría", "top categorías", "compras vs
// gastos generales", "comparativa mes anterior".

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const { requireFeatureFlag } = require('../lib/modules');
const { localDayRange } = require('../utils/dayRange');
const router = express.Router();

// Reportes son feature premium del plan.
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasReports', 'Reportes IA'));

// Util · rango seguro en hora de México (default: mes actual). El servidor
// corre en UTC; sin esto los límites caían a las 18:00 MX.
function resolveRange(query) {
  const pad = (n) => String(n).padStart(2, '0');
  const mxNow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
  const [y, m] = mxNow.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = localDayRange(`${y}-${pad(m)}-01`).from;
  const monthEnd = localDayRange(`${y}-${pad(m)}-${pad(lastDay)}`).to;

  const isDate = (v) => v && /^\d{4}-\d{2}-\d{2}/.test(String(v));
  const from = isDate(query.from) ? localDayRange(String(query.from)).from : monthStart;
  const to = isDate(query.to) ? localDayRange(String(query.to)).to : monthEnd;
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

    // Gastos de REPARTIDOR (DriverCashMovement EXPENSE). No tienen FK a tenant,
    // así que se scopean por los repartidores de la(s) sucursal(es). Son un
    // tercer origen distinto de OperatingExpense y PurchaseOrder (no se
    // doblan): el reporte los ignoraba por completo. La categoría ya es
    // canónica (GASOLINA/COMPRAS/MANTENIMIENTO/CASETAS/OTROS) tras la Fase 1.
    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        ...(req.query.locationId
          ? { locationId: String(req.query.locationId) }
          : { location: { restaurantId } }),
      },
      select: { id: true },
    });
    const driverIds = drivers.map((d) => d.id);
    const [driverExp, driverExpPrev] = driverIds.length
      ? await Promise.all([
          prisma.driverCashMovement.findMany({
            where: { driverId: { in: driverIds }, type: 'EXPENSE', createdAt: { gte: from, lte: to } },
            select: { amount: true, category: true },
          }),
          prisma.driverCashMovement.findMany({
            where: { driverId: { in: driverIds }, type: 'EXPENSE', createdAt: { gte: prevFrom, lte: prevTo } },
            select: { amount: true },
          }),
        ])
      : [[], []];

    const sumOp = opExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const sumPo = purchases.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const sumDrv = driverExp.reduce((s, m) => s + Number(m.amount || 0), 0);
    const sumOpPrev = opExpensesPrev.reduce((s, e) => s + Number(e.amount || 0), 0);
    const sumPoPrev = purchasesPrev.reduce((s, p) => s + Number(p.totalAmount || 0), 0);
    const sumDrvPrev = driverExpPrev.reduce((s, m) => s + Number(m.amount || 0), 0);

    // Breakdown por payment method (gastos + compras + repartidor). El gasto
    // del repartidor se paga del efectivo que trae → cuenta como CASH_DRAWER.
    // CASH_VAULT (efectivo acumulado que ya salió de la caja) es gasto real y
    // suma al grandTotal, pero no golpea el corte de ningún turno.
    // El `?? 0` evita un NaN silencioso si se agrega otro método al enum.
    const byMethod = { CASH_DRAWER: 0, CASH_VAULT: 0, CORPORATE_CARD: 0, TRANSFER: 0 };
    const addMethod = (m, amt) => { byMethod[m] = (byMethod[m] ?? 0) + amt; };
    for (const e of opExpenses) addMethod(e.paymentMethod, Number(e.amount || 0));
    for (const p of purchases) addMethod(p.paymentMethod, Number(p.totalAmount || 0));
    byMethod.CASH_DRAWER += sumDrv;

    // Top categorías UNIFICADAS por nombre — junta los 3 orígenes:
    // OperatingExpense (su categoría), PurchaseOrder (→ COMPRAS) y gasto de
    // repartidor (su categoría canónica). Las COMPRAS de compra y de repartidor
    // se funden en un solo bucket.
    const catMap = {};
    const addCat = (name, icon, color, amount) => {
      const label = (name || 'Sin categoría').toString();
      const key = label.toUpperCase();
      if (!catMap[key]) catMap[key] = { name: label, icon: icon || '📝', color: color || null, total: 0, count: 0 };
      catMap[key].total += Number(amount || 0);
      catMap[key].count += 1;
    };
    for (const e of opExpenses) addCat(e.category?.name, e.category?.icon, e.category?.color, e.amount);
    for (const p of purchases) addCat('COMPRAS', '🛒', '#88D66C', p.totalAmount);
    for (const m of driverExp) addCat(m.category, null, null, m.amount);
    const topCategories = Object.values(catMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

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
      driverExpenses: {
        total: sumDrv,
        previousTotal: sumDrvPrev,
        delta: sumDrv - sumDrvPrev,
        deltaPct: sumDrvPrev > 0 ? ((sumDrv - sumDrvPrev) / sumDrvPrev) * 100 : null,
        count: driverExp.length,
      },
      grandTotal: sumOp + sumPo + sumDrv,
      previousGrandTotal: sumOpPrev + sumPoPrev + sumDrvPrev,
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

    const drivers = await prisma.employee.findMany({
      where: {
        role: 'DELIVERY',
        ...(req.query.locationId ? { locationId: String(req.query.locationId) } : { location: { restaurantId } }),
      },
      select: { id: true },
    });
    const driverIds = drivers.map((d) => d.id);

    const [opExpenses, purchases, driverExp] = await Promise.all([
      prisma.operatingExpense.findMany({
        where: { restaurantId, occurredAt: { gte: from, lte: to } },
        select: { amount: true, occurredAt: true },
      }),
      prisma.purchaseOrder.findMany({
        where: { ...locFilter, receivedAt: { gte: from, lte: to } },
        select: { totalAmount: true, receivedAt: true },
      }),
      driverIds.length
        ? prisma.driverCashMovement.findMany({
            where: { driverId: { in: driverIds }, type: 'EXPENSE', createdAt: { gte: from, lte: to } },
            select: { amount: true, createdAt: true },
          })
        : Promise.resolve([]),
    ]);

    // Bucketear por día (YYYY-MM-DD)
    const buckets = new Map();
    // Fecha natural en México (no UTC) para que el bucket diario cuadre.
    function dateKey(d) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(d));
    }
    function bucket(k) {
      if (!buckets.has(k)) buckets.set(k, { date: k, opExpenses: 0, purchases: 0, driver: 0, total: 0 });
      return buckets.get(k);
    }
    const retotal = (b) => { b.total = b.opExpenses + b.purchases + b.driver; };
    for (const e of opExpenses) {
      const b = bucket(dateKey(e.occurredAt));
      b.opExpenses += Number(e.amount || 0);
      retotal(b);
    }
    for (const p of purchases) {
      const b = bucket(dateKey(p.receivedAt));
      b.purchases += Number(p.totalAmount || 0);
      retotal(b);
    }
    for (const m of driverExp) {
      const b = bucket(dateKey(m.createdAt));
      b.driver += Number(m.amount || 0);
      retotal(b);
    }

    // Rellenar días faltantes con 0 (para que la sparkline sea continua)
    const result = [];
    // `from` ya es medianoche de México; iteramos día a día desde ahí.
    const cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
      const k = dateKey(cursor);
      result.push(buckets.get(k) || { date: k, opExpenses: 0, purchases: 0, driver: 0, total: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.json({ range: { from, to }, days: result });
  } catch (e) {
    console.error('GET /api/reports/expenses-daily:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
