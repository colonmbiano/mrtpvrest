const express = require('express');
const { prisma } = require('@mrtpvrest/database');
const { authenticate } = require('../middleware/auth.middleware');
const router = express.Router();

// GET /api/workspaces/me
// Devuelve los espacios de trabajo (locations) accesibles por el empleado logueado.
// Para multi-restaurant del mismo tenant, también incluye el agrupado por restaurant.
router.get('/me', authenticate, async (req, res) => {
  try {
    const employeeId = req.user?.id;
    const tenantId = req.user?.tenantId;
    const restaurantId = req.user?.restaurantId;

    if (!tenantId) return res.status(400).json({ error: 'Tenant no identificado' });

    // Para super-admins / owners: todos los restaurants del tenant
    // Para staff regular: solo el restaurant donde pertenece
    const isOwner = req.user?.role === 'OWNER' || req.user?.role === 'ADMIN';

    const restaurants = await prisma.restaurant.findMany({
      where: isOwner
        ? { tenantId, isActive: true }
        : { tenantId, id: restaurantId, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        businessType: true,
        accentColor: true,
        logoUrl: true,
        locations: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            address: true,
            isActive: true,
          },
        },
      },
    });

    // Aplanar a "workspaces" (cada location es un workspace)
    const workspaces = [];
    for (const r of restaurants) {
      for (const loc of r.locations) {
        // Stats opcionales — orders abiertas y ventas del día
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const [openOrders, salesAgg] = await Promise.all([
          prisma.order.count({
            where: { locationId: loc.id, status: { in: ['OPEN', 'PENDING', 'PREPARING'] } },
          }).catch(() => 0),
          prisma.order.aggregate({
            where: { locationId: loc.id, createdAt: { gte: today }, status: { not: 'CANCELLED' } },
            _sum: { total: true },
          }).catch(() => ({ _sum: { total: 0 } })),
        ]);

        workspaces.push({
          id: loc.id,
          restaurantId: r.id,
          restaurantName: r.name,
          businessType: r.businessType,
          accentColor: r.accentColor,
          logoUrl: r.logoUrl,
          name: loc.name,
          address: loc.address,
          openOrders,
          salesToday: Number(salesAgg._sum?.total || 0),
          isOpen: true,
        });
      }
    }

    res.json({ workspaces, employee: { id: employeeId, role: req.user?.role } });
  } catch (e) {
    console.error('Error en /api/workspaces/me:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
