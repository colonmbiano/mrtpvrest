const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const router  = express.Router()

router.get('/dashboard', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const where = { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId, status: { not: 'CANCELLED' } };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
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

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    if (period === '7D')  from.setDate(from.getDate() - 6);
    if (period === '30D') from.setDate(from.getDate() - 29);
    if (period === 'AÑO' || period === 'ANIO' || period === 'ANO') {
      from.setMonth(0, 1);
    }

    const orderWhere = {
      restaurantId,
      status: { not: 'CANCELLED' },
      createdAt: { gte: from },
      ...(locationId ? { locationId } : {}),
    };

    const items = await prisma.orderItem.groupBy({
      by: ['name'],
      where: { order: orderWhere },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    res.json(items.map(i => ({
      name: i.name,
      quantity: i._sum.quantity || 0,
      total: i._sum.subtotal || 0,
    })));
  } catch (e) { res.status(500).json({ error: 'Error al obtener top productos' }); }
});

// GET /api/reports/by-day?days=30 — ventas agrupadas por día
router.get('/by-day', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const days  = parseInt(req.query.days) || 30
    const from  = new Date(); from.setDate(from.getDate() - days + 1); from.setHours(0,0,0,0)
    const orders = await prisma.order.findMany({
      where: { restaurantId: req.user?.restaurantId || req.user?.restaurantId || req.restaurantId, status: { not: 'CANCELLED' }, createdAt: { gte: from } },
      select: { total: true, createdAt: true }
    })

    // Agrupar por día
    const map = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(from); d.setDate(d.getDate() + i)
      const key = d.toISOString().split('T')[0]
      map[key] = { revenue: 0, orders: 0 }
    }
    for (const o of orders) {
      const key = new Date(o.createdAt).toISOString().split('T')[0]
      if (map[key]) { map[key].revenue += o.total || 0; map[key].orders += 1 }
    }

    const result = Object.entries(map).map(([date, v]) => ({ date, ...v }))
    res.json(result)
  } catch (e) { res.status(500).json({ error: 'Error al generar reporte por día' }) }
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
