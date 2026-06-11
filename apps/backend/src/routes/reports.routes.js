const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const { localDayRange } = require('../utils/dayRange')
const DAY_MS = 86_400_000
const router  = express.Router()

router.get('/dashboard', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { from, to, days } = req.query;
    const where = { restaurantId: req.user?.restaurantId || req.restaurantId, status: { not: 'CANCELLED' } };
    // Rango en hora de México (servidor en UTC). Preferimos `days` (lo resuelve
    // el server) sobre from/to del cliente para no depender de su zona horaria.
    if (days) {
      const n = Math.max(1, Math.min(parseInt(days) || 7, 366));
      where.createdAt = {
        gte: new Date(localDayRange().from.getTime() - (n - 1) * DAY_MS),
        lte: localDayRange().to,
      };
    } else if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = localDayRange(String(from)).from;
      if (to)   where.createdAt.lte = localDayRange(String(to)).to;
    }

    const [summary, topItems, recentOrders] = await Promise.all([
      prisma.order.aggregate({
        where,
        _sum: { total: true, discount: true },
        _count: { id: true },
        _avg: { total: true }
      }),
      prisma.orderItem.groupBy({
        by: ['name'],
        where: { order: where },
        _sum: { quantity: true, subtotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, orderNumber: true, total: true, status: true, orderType: true, createdAt: true }
      })
    ]);

    res.json({
      totalRevenue: summary._sum.total || 0,
      totalOrders:  summary._count.id  || 0,
      averageTicket: summary._avg.total || 0,
      totalDiscount: summary._sum.discount || 0,
      topItems,
      recentOrders,
    });
  } catch (e) { res.status(500).json({ error: 'Error al generar dashboard' }); }
});

router.get('/sales', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { from, to } = req.query
    const where = { restaurantId, status: { not: 'CANCELLED' } }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to)
    }
    const summary = await prisma.order.aggregate({ where, _sum: { total: true, discount: true }, _count: { id: true }, _avg: { total: true } })
    res.json({ totalRevenue: summary._sum.total || 0, totalOrders: summary._count.id || 0, averageTicket: summary._avg.total || 0 })
  } catch (e) { res.status(500).json({ error: 'Error al generar reporte' }) }
})

router.get('/top-items', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const items = await prisma.orderItem.groupBy({
      by: ['name'],
      where: { order: { restaurantId } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: 'Error al obtener top platillos' }) }
})

// GET /api/reports/top-products?period=HOY|7D|30D|AÑO&limit=5
// Usado por el widget "Top del día" del admin dashboard.
router.get('/top-products', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const period = String(req.query.period || 'HOY').toUpperCase();
    const limit  = Math.min(parseInt(req.query.limit) || 5, 20);
    const locationId = req.headers['x-location-id'] || req.query.locationId || undefined;

    // Día natural en hora de México (el servidor corre en UTC).
    const todayFrom = localDayRange().from;
    let from = todayFrom;
    if (period === '7D')  from = new Date(todayFrom.getTime() - 6 * DAY_MS);
    if (period === '30D') from = new Date(todayFrom.getTime() - 29 * DAY_MS);
    if (period === 'AÑO' || period === 'ANIO' || period === 'ANO') {
      from = localDayRange(`${new Date().getUTCFullYear()}-01-01`).from; // año en curso, 1-ene MX
    }

    const orderWhere = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: { gte: from },
      ...(locationId ? { locationId } : {}),
    };

    // BUG-8: rankear por ingreso (subtotal), no por unidades. Así los
    // ítems gratis (Aderezo Extra $0, cortesías) no inflan el ranking.
    // Adicionalmente filtramos out cualquier producto cuyo subtotal
    // agregado sea <= 0 para no mostrarlos como "top".
    const items = await prisma.orderItem.groupBy({
      by: ['name'],
      where: { order: orderWhere, subtotal: { gt: 0 } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { subtotal: 'desc' } },
      take: limit,
    });

    res.json(items.map(i => ({
      name: i.name,
      quantity: i._sum.quantity || 0,
      total: i._sum.subtotal || 0,
    })));
  } catch (e) { res.status(500).json({ error: 'Error al obtener top productos' }); }
});

// GET /api/reports/by-day
// Params (todos opcionales):
//   ?days=30                    → últimos N días (legacy, retrocompatible)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD  → rango custom
//   ?bucket=day|week|month      → granularidad (auto si no se pasa)
//
// Auto-bucket: ≤90 días → day, ≤730 → week, sino → month. Evita devolver
// 1500 puntos al frontend para rangos de varios años.
router.get('/by-day', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId
    const { from: fromParam, to: toParam, days: daysParam, bucket: bucketParam } = req.query

    // Rangos anclados a la medianoche de México (el servidor corre en UTC).
    let from, to
    if (fromParam) {
      from = localDayRange(fromParam).from
    } else {
      const days = parseInt(daysParam) || 30
      from = new Date(localDayRange().from.getTime() - (days - 1) * DAY_MS)
    }
    to = toParam ? localDayRange(toParam).to : localDayRange().to

    const rangeMs = to.getTime() - from.getTime()
    const rangeDays = Math.max(1, Math.ceil(rangeMs / 86_400_000))

    let bucket = (bucketParam || '').toLowerCase()
    if (!['day', 'week', 'month'].includes(bucket)) {
      bucket = rangeDays <= 90 ? 'day' : rangeDays <= 730 ? 'week' : 'month'
    }

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: 'CANCELLED' },
        createdAt: { gte: from, lte: to },
      },
      select: { total: true, createdAt: true },
    })

    // Builder de la key del bucket según granularidad. La key se usa
    // como label en el chart y debe ser ordenable lexicográficamente.
    function bucketKey(d) {
      const dt = new Date(d)
      if (bucket === 'day') return dt.toISOString().split('T')[0]
      if (bucket === 'month') {
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      }
      // week: ISO week start (lunes). Truncamos al lunes 00:00 UTC.
      const day = dt.getUTCDay() || 7 // domingo=0→7 para que la semana arranque lunes
      const monday = new Date(dt)
      monday.setUTCDate(dt.getUTCDate() - day + 1)
      return monday.toISOString().split('T')[0]
    }

    // Pre-llena buckets vacíos para que el chart tenga continuidad
    // (sin gaps invisibles que confundan al cajero).
    const map = {}
    if (bucket === 'day') {
      const cursor = new Date(from)
      while (cursor <= to) {
        map[bucketKey(cursor)] = { revenue: 0, orders: 0 }
        cursor.setDate(cursor.getDate() + 1)
      }
    } else if (bucket === 'week') {
      const cursor = new Date(from)
      while (cursor <= to) {
        map[bucketKey(cursor)] = { revenue: 0, orders: 0 }
        cursor.setDate(cursor.getDate() + 7)
      }
    } else {
      const cursor = new Date(from.getFullYear(), from.getMonth(), 1)
      while (cursor <= to) {
        map[bucketKey(cursor)] = { revenue: 0, orders: 0 }
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    for (const o of orders) {
      const key = bucketKey(o.createdAt)
      if (!map[key]) map[key] = { revenue: 0, orders: 0 }
      map[key].revenue += o.total || 0
      map[key].orders += 1
    }

    const result = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, bucket, ...v }))
    res.json(result)
  } catch (e) { res.status(500).json({ error: 'Error al generar reporte por día' }) }
})

// GET /api/reports/range-bounds — fecha del primer y último pedido.
// El frontend la usa para el botón "Todo el histórico" sin tener que
// adivinar desde cuándo hay datos.
router.get('/range-bounds', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId
    const bounds = await prisma.order.aggregate({
      where: { restaurantId, status: { not: 'CANCELLED' } },
      _min: { createdAt: true },
      _max: { createdAt: true },
      _count: { id: true },
    })
    res.json({
      from: bounds._min.createdAt,
      to: bounds._max.createdAt,
      totalOrders: bounds._count.id,
    })
  } catch (e) { res.status(500).json({ error: 'Error al obtener rango' }) }
})

// GET /api/reports/saved — reportes guardados por el usuario. Devuelve [] hasta
// que exista el modelo de persistencia; el frontend renderiza empty-state.
router.get('/saved', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    res.json([]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router
