// src/routes/dashboard.routes.js
//
// Endpoints unificados que alimentan el admin dashboard (/admin/restaurant-dashboard).
// Todos respetan el patrón de tenant: `req.user?.restaurantId || req.restaurantId`,
// y requieren JWT + rol ADMIN/SUPER_ADMIN.
//
// Los endpoints que reciben `?period=HOY|7D|30D|AÑO` devuelven el agregado del
// periodo y el agregado del periodo INMEDIATAMENTE anterior bajo la misma
// longitud de ventana, para que el front pueda pintar deltas.

const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');

const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

const PERIODS = new Set(['HOY', '7D', '30D', 'AÑO', 'ANIO', 'ANO']);

function getRestaurantId(req) {
  return req.user?.restaurantId || req.restaurantId || null;
}

function getLocationId(req) {
  return req.locationId || req.headers['x-location-id'] || req.query.locationId || null;
}

// Devuelve { from, to, prevFrom, prevTo } para un período dado, normalizando
// a zona horaria del servidor (Railway corre en UTC; las fechas que se guardan
// son DateTime, la agregación por día sólo se usa para gráficas).
function getPeriodRange(periodRaw) {
  const period = String(periodRaw || 'HOY').toUpperCase();
  const now = new Date();
  const to = new Date(now);

  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  if (period === '7D') {
    from.setDate(from.getDate() - 6);
  } else if (period === '30D') {
    from.setDate(from.getDate() - 29);
  } else if (period === 'AÑO' || period === 'ANIO' || period === 'ANO') {
    from.setMonth(0, 1);
    from.setHours(0, 0, 0, 0);
  }

  // Periodo anterior: misma longitud justo antes de `from`
  const lengthMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - lengthMs);

  return { from, to, prevFrom, prevTo, period };
}

function pctDelta(curr, prev) {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10; // 1 decimal
}

function requireRestaurant(req, res) {
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) {
    res.status(400).json({ error: 'Restaurante no identificado' });
    return null;
  }
  return restaurantId;
}

// ── GET /api/dashboard/stats?period=HOY|7D|30D|AÑO ──────────────────────────
// KPIs principales (ventas, pedidos, ticket promedio, tiempo prep.) con deltas
// vs el periodo inmediato anterior de la misma longitud.
router.get('/stats', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const { from, to, prevFrom, prevTo } = getPeriodRange(req.query.period);

    const baseWhere = {
      restaurantId,
      status: { not: 'CANCELLED' },
      ...(locationId ? { locationId } : {}),
    };

    const [curr, prev] = await Promise.all([
      prisma.order.aggregate({
        where: { ...baseWhere, createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true },
      }),
      prisma.order.aggregate({
        where: { ...baseWhere, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true },
      }),
    ]);

    // Tiempo promedio en preparación: tiempo entre createdAt y el momento en
    // que el pedido llegó a READY. Si no tenemos historial, calculamos el
    // tiempo transcurrido desde la creación de los pedidos aún activos.
    const activeOrders = await prisma.order.findMany({
      where: {
        ...baseWhere,
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] },
      },
      select: { createdAt: true },
      take: 200,
    });
    const nowMs = Date.now();
    const waitMinutes = activeOrders.length
      ? activeOrders.reduce((s, o) => s + (nowMs - new Date(o.createdAt).getTime()) / 60000, 0) / activeOrders.length
      : 0;

    const currSales = curr._sum.total || 0;
    const prevSales = prev._sum.total || 0;
    const currOrders = curr._count.id || 0;
    const prevOrders = prev._count.id || 0;
    const currAvg = curr._avg.total || 0;
    const prevAvg = prev._avg.total || 0;

    res.json({
      period: String(req.query.period || 'HOY').toUpperCase(),
      sales:       { value: currSales,  prev: prevSales,  delta: pctDelta(currSales,  prevSales) },
      orders:      { value: currOrders, prev: prevOrders, delta: pctDelta(currOrders, prevOrders) },
      averageTicket: {
        value: Math.round(currAvg),
        prev:  Math.round(prevAvg),
        delta: pctDelta(currAvg, prevAvg),
      },
      prepMinutes: { value: Math.round(waitMinutes * 10) / 10, activeCount: activeOrders.length },
    });
  } catch (e) {
    console.error('dashboard/stats', e);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ── GET /api/dashboard/sales-by-day?days=7 ──────────────────────────────────
// Devuelve ventas agrupadas por día (ISO yyyy-mm-dd) junto con la misma
// longitud de ventana previa para comparar semana vs semana pasada.
router.get('/sales-by-day', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const days = Math.max(1, Math.min(parseInt(req.query.days) || 7, 90));

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    from.setDate(from.getDate() - days + 1);

    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - days);
    const prevTo = new Date(from);
    prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);

    const baseWhere = {
      restaurantId,
      status: { not: 'CANCELLED' },
      ...(locationId ? { locationId } : {}),
    };

    const [orders, prevOrders] = await Promise.all([
      prisma.order.findMany({
        where: { ...baseWhere, createdAt: { gte: from } },
        select: { total: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { ...baseWhere, createdAt: { gte: prevFrom, lte: prevTo } },
        select: { total: true },
      }),
    ]);

    const map = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + i);
      map[d.toISOString().split('T')[0]] = { revenue: 0, orders: 0 };
    }
    for (const o of orders) {
      const key = new Date(o.createdAt).toISOString().split('T')[0];
      if (map[key]) {
        map[key].revenue += o.total || 0;
        map[key].orders += 1;
      }
    }

    const prevRevenue = prevOrders.reduce((s, o) => s + (o.total || 0), 0);
    const prevCount = prevOrders.length;
    const currRevenue = orders.reduce((s, o) => s + (o.total || 0), 0);

    res.json({
      days,
      series: Object.entries(map).map(([date, v]) => ({ date, ...v })),
      totals: {
        current:  { revenue: currRevenue, orders: orders.length },
        previous: { revenue: prevRevenue, orders: prevCount },
        delta:    pctDelta(currRevenue, prevRevenue),
      },
    });
  } catch (e) {
    console.error('dashboard/sales-by-day', e);
    res.status(500).json({ error: 'Error al obtener ventas por día' });
  }
});

// ── GET /api/dashboard/live-orders ──────────────────────────────────────────
// Pedidos activos en tiempo real: estados NUEVO, PREP, LISTO, RUTA.
router.get('/live-orders', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(locationId ? { locationId } : {}),
        status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        total: true,
        orderType: true,
        tableNumber: true,
        customerName: true,
        createdAt: true,
        items: { select: { quantity: true, menuItem: { select: { name: true } } } },
      },
    });

    res.json(orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total || 0,
      orderType: o.orderType,
      tableNumber: o.tableNumber,
      createdAt: o.createdAt,
      customer: o.customerName ? { name: o.customerName } : null,
      items: o.items,
    })));
  } catch (e) {
    console.error('dashboard/live-orders', e);
    res.status(500).json({ error: 'Error al obtener pedidos en vivo' });
  }
});

// ── GET /api/dashboard/top-items?period=...&limit=5 ─────────────────────────
router.get('/top-items', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const limit = Math.min(parseInt(req.query.limit) || 5, 20);
    const { from } = getPeriodRange(req.query.period);

    const items = await prisma.orderItem.groupBy({
      by: ['name'],
      where: {
        order: {
          restaurantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: from },
          ...(locationId ? { locationId } : {}),
        },
      },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    res.json(items.map(i => ({
      name: i.name,
      quantity: i._sum.quantity || 0,
      total: i._sum.subtotal || 0,
    })));
  } catch (e) {
    console.error('dashboard/top-items', e);
    res.status(500).json({ error: 'Error al obtener top productos' });
  }
});

// ── GET /api/dashboard/hourly-distribution?period=HOY|7D|30D|AÑO ────────────
// Devuelve un arreglo de 24 horas con el número de pedidos en cada franja.
router.get('/hourly-distribution', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const { from, to } = getPeriodRange(req.query.period);

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: from, lte: to },
        ...(locationId ? { locationId } : {}),
      },
      select: { createdAt: true },
    });

    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    for (const o of orders) {
      const h = new Date(o.createdAt).getHours();
      if (buckets[h]) buckets[h].count += 1;
    }

    res.json({
      period: String(req.query.period || 'HOY').toUpperCase(),
      total: orders.length,
      buckets,
    });
  } catch (e) {
    console.error('dashboard/hourly-distribution', e);
    res.status(500).json({ error: 'Error al obtener distribución por hora' });
  }
});

// ── GET /api/dashboard/active-shift ────────────────────────────────────────
// Turno activo + empleados con clock-in abierto.
router.get('/active-shift', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = getLocationId(req);
    if (!locationId) return res.json({ shift: null, staff: [] });

    const [shift, staff] = await Promise.all([
      prisma.cashShift.findFirst({
        where: { isOpen: true, locationId },
        orderBy: { openedAt: 'desc' },
      }),
      prisma.employeeShift.findMany({
        where: { endAt: null, employee: { locationId } },
        include: { employee: { select: { id: true, name: true, role: true, tables: true } } },
        orderBy: { startAt: 'asc' },
        take: 20,
      }),
    ]);

    res.json({
      shift,
      staff: staff.map(s => ({
        id: s.employee.id,
        name: s.employee.name,
        role: s.employee.role,
        tables: s.employee.tables,
        startAt: s.startAt,
      })),
    });
  } catch (e) {
    console.error('dashboard/active-shift', e);
    res.status(500).json({ error: 'Error al obtener turno activo' });
  }
});

// ── GET /api/dashboard/channels-payments?period=HOY|7D|30D|AÑO ──────────────
// Distribución de ventas por canal (orderType) y por método de pago.
router.get('/channels-payments', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const { from, to } = getPeriodRange(req.query.period);

    const where = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: { gte: from, lte: to },
      ...(locationId ? { locationId } : {}),
    };

    const [byType, byPayment, totalAgg] = await Promise.all([
      prisma.order.groupBy({
        by: ['orderType'],
        where,
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.groupBy({
        by: ['paymentMethod'],
        where: { ...where, paymentStatus: 'PAID' },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where,
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    const total = totalAgg._sum.total || 0;

    res.json({
      period: String(req.query.period || 'HOY').toUpperCase(),
      total,
      totalOrders: totalAgg._count.id || 0,
      channels: byType.map(r => ({
        key: r.orderType || 'OTRO',
        total: r._sum.total || 0,
        count: r._count.id || 0,
        pct: total > 0 ? Math.round(((r._sum.total || 0) / total) * 100) : 0,
      })),
      payments: byPayment.map(r => ({
        key: r.paymentMethod || 'OTRO',
        total: r._sum.total || 0,
        count: r._count.id || 0,
        pct: total > 0 ? Math.round(((r._sum.total || 0) / total) * 100) : 0,
      })),
    });
  } catch (e) {
    console.error('dashboard/channels-payments', e);
    res.status(500).json({ error: 'Error al obtener canales y pagos' });
  }
});

// ── GET /api/dashboard/low-inventory ───────────────────────────────────────
// Ingredientes con stock por debajo de su mínimo, en la sucursal activa.
router.get('/low-inventory', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const locationId = getLocationId(req);
    if (!locationId) return res.json([]);

    const items = await prisma.ingredient.findMany({
      where: { locationId, isActive: true, minStock: { gt: 0 } },
      select: { id: true, name: true, unit: true, stock: true, minStock: true },
      orderBy: { name: 'asc' },
    });

    const alerts = items
      .filter(i => i.stock <= i.minStock)
      .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));

    res.json(alerts);
  } catch (e) {
    console.error('dashboard/low-inventory', e);
    res.status(500).json({ error: 'Error al obtener inventario bajo' });
  }
});

// ── GET /api/dashboard/sales-by-location?period=HOY|7D|30D|AÑO ─────────────
// Agregado de ventas por sucursal en el período; devuelve `[]` cuando aún no
// hay pedidos para que el frontend renderice "Sin datos" sin fallbacks falsos.
router.get('/sales-by-location', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const { from, to, prevFrom, prevTo } = getPeriodRange(req.query.period);

    const locations = await prisma.location.findMany({
      where:  { restaurantId, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    if (locations.length === 0) return res.json([]);

    const baseWhere = { restaurantId, status: { not: 'CANCELLED' } };

    const [curr, prev] = await Promise.all([
      prisma.order.groupBy({
        by: ['locationId'],
        where: { ...baseWhere, createdAt: { gte: from, lte: to } },
        _sum:   { total: true },
        _count: { id: true },
        _avg:   { total: true },
      }),
      prisma.order.groupBy({
        by: ['locationId'],
        where: { ...baseWhere, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum:   { total: true },
      }),
    ]);

    const byId      = Object.fromEntries(curr.map(r => [r.locationId, r]));
    const prevById  = Object.fromEntries(prev.map(r => [r.locationId, r]));

    const result = locations.map(loc => {
      const c = byId[loc.id];
      const p = prevById[loc.id];
      const currSales = c?._sum.total || 0;
      const prevSales = p?._sum.total || 0;
      return {
        id:        loc.id,
        name:      loc.name,
        slug:      loc.slug,
        sales:     currSales,
        orders:    c?._count.id || 0,
        avgTicket: Math.round(c?._avg.total || 0),
        delta:     pctDelta(currSales, prevSales),
      };
    }).sort((a, b) => b.sales - a.sales);

    res.json(result);
  } catch (e) {
    console.error('dashboard/sales-by-location', e);
    res.status(500).json({ error: 'Error al calcular ventas por sucursal' });
  }
});

// ── GET /api/dashboard/insights?period=30D ─────────────────────────────────
// Devuelve insights detectados automáticamente. Hoy se entrega vacío para que
// el frontend muestre empty-state; cuando el pipeline de análisis esté activo
// se poblará desde el mismo endpoint.
router.get('/insights', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
