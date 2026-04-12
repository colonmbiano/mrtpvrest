const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router  = express.Router()

router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
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

router.get('/sales', authenticate, requireAdmin, async (req, res) => {
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

router.get('/top-items', authenticate, requireAdmin, async (req, res) => {
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

// GET /api/reports/by-day?days=30 — ventas agrupadas por día
router.get('/by-day', authenticate, requireAdmin, async (req, res) => {
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

module.exports = router
