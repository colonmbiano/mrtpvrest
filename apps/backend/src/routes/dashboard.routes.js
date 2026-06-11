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
const { localDayRange } = require('../utils/dayRange');

const DAY_MS = 86_400_000;
const router = express.Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

const PERIODS = new Set(['HOY', '7D', '30D', '90D', '1Y', 'AÑO', 'ANIO', 'ANO', 'HISTORICO', 'HIST']);

// Estados que cuentan como "pedido activo / en curso". Deben coincidir con
// los valores del enum OrderStatus en packages/database/prisma/schema.prisma
// (PENDING, CONFIRMED, PREPARING, READY, ON_THE_WAY, DELIVERED, CANCELLED,
// OPEN). Antes estaba 'DELIVERING' — no existe en el enum y Prisma reventaba
// toda la ruta con PrismaClientValidationError.
const ACTIVE_ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY', 'OPEN'];

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
  const to = new Date();

  // Anclamos el inicio del periodo a la medianoche de México (el servidor
  // corre en UTC; antes `setHours(0,0,0,0)` partía el día a las 18:00 MX y
  // las ventas de la tarde caían fuera del "HOY").
  const todayFrom = localDayRange().from;
  let from = todayFrom;

  if (period === '7D') {
    from = new Date(todayFrom.getTime() - 6 * DAY_MS);
  } else if (period === '30D') {
    from = new Date(todayFrom.getTime() - 29 * DAY_MS);
  } else if (period === '90D') {
    from = new Date(todayFrom.getTime() - 89 * DAY_MS);
  } else if (period === '1Y' || period === 'AÑO' || period === 'ANIO' || period === 'ANO') {
    // "AÑO" = últimos 365 días rolling — siempre captura datos recientes.
    from = new Date(todayFrom.getTime() - 364 * DAY_MS);
  } else if (period === 'HISTORICO' || period === 'HIST') {
    // "Histórico" = desde siempre. Usamos epoch para que el aggregate
    // tome todos los pedidos sin filtro inferior.
    from = new Date(Date.UTC(2000, 0, 1));
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
    // Aislamos esta query en su propio try/catch: un status inválido en el
    // enum no debe tumbar todo el dashboard (antes de este guard, un
    // PrismaClientValidationError aquí devolvía 500 al frontend completo).
    let activeOrders = [];
    try {
      activeOrders = await prisma.order.findMany({
        where: {
          ...baseWhere,
          status: { in: ACTIVE_ORDER_STATUSES },
        },
        select: { createdAt: true },
        take: 200,
      });
    } catch (err) {
      console.error('dashboard/stats activeOrders fallback:', err.message);
      activeOrders = [];
    }
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

    // Ventana anclada a la medianoche de México (el servidor corre en UTC).
    const from = new Date(localDayRange().from.getTime() - (days - 1) * DAY_MS);
    const prevFrom = new Date(from.getTime() - days * DAY_MS);
    const prevTo = new Date(from.getTime() - 1);

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

    // Key del bucket = fecha natural en México (no UTC), si no los pedidos de
    // la noche caen en el día siguiente del gráfico.
    const mxKey = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(d));
    const map = {};
    for (let i = 0; i < days; i++) {
      map[mxKey(new Date(from.getTime() + i * DAY_MS))] = { revenue: 0, orders: 0 };
    }
    for (const o of orders) {
      const key = mxKey(o.createdAt);
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
        status: { in: ACTIVE_ORDER_STATUSES },
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
      // `total` se mantiene por compatibilidad con consumidores existentes;
      // `revenue` es el nombre que usa el panel de Reportes IA.
      total: i._sum.subtotal || 0,
      revenue: i._sum.subtotal || 0,
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
    const { from, to, prevFrom, prevTo } = getPeriodRange(req.query.period || '30D');

    const [currSales, prevSales, topItems] = await Promise.all([
      prisma.order.aggregate({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum: { total: true }
      }),
      prisma.orderItem.groupBy({
        by: ['name'],
        where: { order: { restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: from } } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 3
      })
    ]);

    const insights = [];
    const salesDelta = pctDelta(currSales._sum.total || 0, prevSales._sum.total || 0);

    // Insight 1: Ventas Generales
    if (salesDelta > 5) {
      insights.push({
        kind: 'CRECIMIENTO',
        variant: 'ok',
        title: `Ventas arriba ${salesDelta}%`,
        body: `Tus ingresos han subido comparado con el periodo anterior. Se han procesado ${currSales._count.id} pedidos con un ticket promedio de $${Math.round(currSales._avg.total || 0)}.`,
        cta: 'Ver detalle'
      });
    } else if (salesDelta < -5) {
      insights.push({
        kind: 'ALERTA',
        variant: 'warn',
        title: `Caída de ingresos (${Math.abs(salesDelta)}%)`,
        body: `Las ventas están por debajo del periodo anterior. Considera lanzar una promoción relámpago para reactivar el flujo.`,
        cta: 'Crear Promo'
      });
    }

    // Insight 2: Producto Estrella
    if (topItems.length > 0) {
      insights.push({
        kind: 'TENDENCIA',
        variant: 'info',
        title: `"${topItems[0].name}" es tu estrella`,
        body: `Es el producto más vendido con ${topItems[0]._sum.quantity} unidades en este periodo. ¿Has pensado en subirle un poco el precio o armar un combo?`,
        cta: 'Ajustar Menú'
      });
    }

    // Insight 3: Eficiencia
    insights.push({
      kind: 'LOGÍSTICA',
      variant: 'info',
      title: 'Ticket promedio estable',
      body: `Tu ticket promedio se mantiene en $${Math.round(currSales._avg.total || 0)}. Un pequeño incremento en complementos podría subirlo un 10%.`,
      cta: 'Ver Sugerencias'
    });

    res.json(insights);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/dashboard/suggested-actions?period=30D ─────────────────────────
// Genera 0-4 acciones sugeridas a partir de señales reales del periodo:
//  · Sede con peor caída de ventas → plan de acción
//  · Producto top → idea de combo/upsell
//  · Ingredientes bajo mínimo → orden de compra
//  · Sede con ticket promedio muy por debajo de la mediana → coaching
//
// Cada acción incluye un `prompt` listo para mandar al asistente Mesero,
// para que el botón del frontend pueda accionar la conversación.
router.get('/suggested-actions', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = requireRestaurant(req, res);
    if (!restaurantId) return;
    const locationId = getLocationId(req);
    const { from, to, prevFrom, prevTo } = getPeriodRange(req.query.period || '30D');

    const baseWhere = { restaurantId, status: { not: 'CANCELLED' } };

    const [locations, currByLoc, prevByLoc, topItems, lowStock] = await Promise.all([
      prisma.location.findMany({
        where: { restaurantId, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.order.groupBy({
        by: ['locationId'],
        where: { ...baseWhere, createdAt: { gte: from, lte: to } },
        _sum: { total: true },
        _avg: { total: true },
        _count: { id: true },
      }),
      prisma.order.groupBy({
        by: ['locationId'],
        where: { ...baseWhere, createdAt: { gte: prevFrom, lte: prevTo } },
        _sum: { total: true },
      }),
      prisma.orderItem.groupBy({
        by: ['name'],
        where: {
          order: {
            restaurantId,
            status: { not: 'CANCELLED' },
            createdAt: { gte: from, lte: to },
            ...(locationId ? { locationId } : {}),
          },
        },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 1,
      }),
      locationId
        ? prisma.ingredient.findMany({
            where: { locationId, isActive: true, minStock: { gt: 0 } },
            select: { id: true, name: true, unit: true, stock: true, minStock: true },
          })
        : Promise.resolve([]),
    ]);

    const currMap = Object.fromEntries(currByLoc.map(r => [r.locationId, r]));
    const prevMap = Object.fromEntries(prevByLoc.map(r => [r.locationId, r]));

    const sedes = locations.map(loc => {
      const c = currMap[loc.id];
      const p = prevMap[loc.id];
      const sales = c?._sum.total || 0;
      const prev = p?._sum.total || 0;
      return {
        id: loc.id,
        name: loc.name,
        sales,
        avgTicket: Math.round(c?._avg.total || 0),
        orders: c?._count.id || 0,
        delta: pctDelta(sales, prev),
      };
    });

    const actions = [];
    let n = 1;

    // 1) Sede con peor caída (delta <= -10%, prioriza la más fuerte)
    const dropping = sedes
      .filter(s => s.sales > 0 && s.delta <= -10)
      .sort((a, b) => a.delta - b.delta);
    if (dropping[0]) {
      const s = dropping[0];
      actions.push({
        n: n++,
        title: `Revisar caída en ${s.name}`,
        sub: `Ventas ${Math.abs(s.delta)}% por debajo del periodo anterior`,
        cta: 'Crear plan de acción',
        prompt: `La sede "${s.name}" cayó ${Math.abs(s.delta)}% en ventas vs el periodo anterior. Analiza posibles causas (turnos, productos, días) y propón un plan de acción concreto.`,
      });
    }

    // 2) Producto top → combo / upsell
    if (topItems[0]) {
      const t = topItems[0];
      actions.push({
        n: n++,
        title: `Capitalizar "${t.name}"`,
        sub: `${t._sum.quantity || 0} unidades — es tu producto más vendido`,
        cta: 'Sugerir combo',
        prompt: `Mi producto más vendido es "${t.name}" con ${t._sum.quantity || 0} unidades en este periodo. Propón 2-3 combos o estrategias de upsell concretas para subir el ticket promedio.`,
      });
    }

    // 3) Inventario bajo (solo si hay sede activa)
    if (lowStock.length > 0) {
      const critical = lowStock
        .filter(i => i.stock <= i.minStock)
        .sort((a, b) => (a.stock / (a.minStock || 1)) - (b.stock / (b.minStock || 1)));
      if (critical.length > 0) {
        const top3 = critical.slice(0, 3).map(i => i.name).join(', ');
        actions.push({
          n: n++,
          title: `Reabastecer ${critical.length} ingrediente${critical.length > 1 ? 's' : ''}`,
          sub: `${top3}${critical.length > 3 ? ` y ${critical.length - 3} más` : ''} bajo mínimo`,
          cta: 'Generar orden de compra',
          prompt: `Tengo ${critical.length} ingredientes por debajo del stock mínimo: ${critical.slice(0, 5).map(i => `${i.name} (${i.stock}/${i.minStock} ${i.unit || ''})`).join(', ')}. ¿Cuáles priorizo y cuánto debo pedir?`,
        });
      }
    }

    // 4) Coaching en sede con ticket promedio muy bajo vs mediana
    const tickets = sedes.map(s => s.avgTicket).filter(t => t > 0).sort((a, b) => a - b);
    if (tickets.length >= 2) {
      const median = tickets[Math.floor(tickets.length / 2)];
      const lowTicket = sedes
        .filter(s => s.avgTicket > 0 && s.avgTicket < median * 0.85)
        .sort((a, b) => a.avgTicket - b.avgTicket)[0];
      if (lowTicket && median > 0) {
        const diff = Math.round((1 - lowTicket.avgTicket / median) * 100);
        actions.push({
          n: n++,
          title: `Coaching · encargado ${lowTicket.name}`,
          sub: `Ticket promedio ${diff}% bajo la mediana del restaurante`,
          cta: 'Crear plan de acción',
          prompt: `El ticket promedio de "${lowTicket.name}" ($${lowTicket.avgTicket}) está ${diff}% por debajo de la mediana de mis sedes ($${median}). ¿Qué pasos concretos sigue el encargado para mejorar upsell y cierre de mesa?`,
        });
      }
    }

    res.json(actions.slice(0, 4));
  } catch (e) {
    console.error('dashboard/suggested-actions', e);
    res.status(500).json({ error: 'Error al obtener acciones sugeridas' });
  }
});

module.exports = router;
