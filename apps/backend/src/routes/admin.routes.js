const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router  = express.Router()

// Middleware para verificar si es SUPER_ADMIN (Tú)
const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'SUPER_ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Super Administrador' });
  }
};

// ── CONFIGURACIÓN GLOBAL DEL SAAS (SUPER_ADMIN) ───────────────────────────

router.get('/global-config', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const config = await prisma.globalConfig.upsert({
      where: { id: 'saas-config' },
      update: {},
      create: { id: 'saas-config' }
    });
    res.json(config);
  } catch (e) {
    console.error("Error Global Config:", e.message);
    res.status(500).json({ error: "Falla en base de datos SaaS" });
  }
});

router.put('/global-config', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const config = await prisma.globalConfig.update({
      where: { id: 'saas-config' },
      data: req.body
    });
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONFIGURACIÓN DEL RESTAURANTE (PARA EL DUEÑO Y LA APP) ────────────────

router.get('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const [config, restaurant] = await Promise.all([
      prisma.restaurantConfig.findUnique({ where: { restaurantId } }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, logoUrl: true }
      })
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...(config || {}),
      name: restaurant?.name || 'Nuevo Restaurante',
      logoUrl: restaurant?.logoUrl || null
    });
  } catch (e) { res.status(500).json({ error: 'Error al obtener configuracion' }) }
})

router.put('/brand', authenticate, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { name, logoUrl } = req.body;
    const data = {};
    if (name !== undefined && name !== null) data.name = name;
    if (logoUrl !== undefined) data.logoUrl = logoUrl || null;
    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data,
      select: { id: true, name: true, logoUrl: true }
    });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Error al actualizar marca: ' + e.message }) }
})

router.put('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId;
    const VALID_FIELDS = [
      'phone','whatsappNumber','address','deliveryFee','freeDeliveryFrom',
      'minOrderAmount','estimatedDelivery','isOpen','closedMessage',
      'pointsPerTen','pointsValuePesos'
    ];
    const data = Object.fromEntries(
      Object.entries(req.body).filter(([k]) => VALID_FIELDS.includes(k))
    );
    const config = await prisma.restaurantConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...data },
      update: data
    });
    res.json(config);
  } catch (e) { res.status(500).json({ error: 'Error al guardar configuracion' }) }
})

// ── GESTIÓN DE SUCURSALES ───────────────────────────────────────────────

router.get('/locations', authenticate, requireAdmin, async (req, res) => {
  try {
    const locations = await prisma.location.findMany({ where: { restaurantId: req.user.restaurantId } });
    res.json(locations);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/locations', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, slug, address, phone } = req.body;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.user.restaurantId },
      include: { _count: { select: { locations: true } } }
    });
    if (restaurant._count.locations >= restaurant.maxLocations) {
      return res.status(403).json({ error: `Límite de sucursales alcanzado (${restaurant.maxLocations}).` });
    }
    const location = await prisma.location.create({
      data: { restaurantId: req.user.restaurantId, name, slug: slug.toLowerCase(), address, phone, ticketConfig: { create: { businessName: name } } }
    });
    res.json(location);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/locations/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone } = req.body;
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location || location.restaurantId !== req.user.restaurantId)
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    const updated = await prisma.location.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(address !== undefined && { address }), ...(phone !== undefined && { phone }) }
    });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/locations/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location || location.restaurantId !== req.user.restaurantId)
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GESTIÓN DE TENANTS (SUPER_ADMIN) ──────────────────

router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        restaurants: {
          include: {
            _count: { select: { orders: true, menuItems: true, locations: true } },
            locations: { select: { id: true, name: true, slug: true } }
          }
        },
        _count: { select: { users: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, slug, email, password, plan: planName, subscriptionEndsAt, isTrial } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Nombre y Slug requeridos' });

    const cleanSlug = slug.toLowerCase().replace(/\s+/g, '-');

    // Buscar plan por nombre o usar el primero activo
    let planRecord = planName
      ? await prisma.plan.findFirst({ where: { name: planName.toUpperCase(), isActive: true } })
      : null;
    if (!planRecord) planRecord = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
    if (!planRecord) return res.status(400).json({ error: 'No hay planes activos configurados' });

    const now      = new Date();
    const endsAt   = subscriptionEndsAt ? new Date(subscriptionEndsAt)
      : isTrial    ? new Date(now.getTime() + planRecord.trialDays * 86400000)
      : null;
    const status   = isTrial ? 'TRIAL' : 'ACTIVE';

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: cleanSlug,
        ownerEmail: email || '',
        subscription: {
          create: {
            planId:             planRecord.id,
            status,
            trialEndsAt:        isTrial ? endsAt : null,
            currentPeriodStart: now,
            currentPeriodEnd:   endsAt || new Date(now.getTime() + 30 * 86400000),
            priceSnapshot:      planRecord.price,
            paymentGateway:     'MANUAL',
          }
        },
        restaurants: {
          create: {
            slug:     cleanSlug,
            name,
            isActive: true,
            config:   { create: {} }
          }
        }
      },
      include: { subscription: { include: { plan: true } }, restaurants: true }
    });

    if (email && password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: {
          tenantId:     tenant.id,
          restaurantId: tenant.restaurants[0]?.id,
          name:         `Admin ${name}`,
          email,
          passwordHash: hashedPassword,
          role:         'ADMIN',
          isActive:     true,
        }
      });
    }

    res.status(201).json({ ok: true, tenant });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'El slug o email ya existe' });
    res.status(500).json({ error: e.message });
  }
});

// Regalar días de suscripción — opera sobre la Subscription del Tenant
router.post('/tenants/:id/gift', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const sub = await prisma.subscription.findUnique({ where: { tenantId: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const base   = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > new Date()
      ? new Date(sub.currentPeriodEnd) : new Date();
    const newEnd = new Date(base.getTime() + days * 86400000);

    const updated = await prisma.subscription.update({
      where: { tenantId: req.params.id },
      data:  { currentPeriodEnd: newEnd, status: 'ACTIVE' }
    });
    res.json({ ok: true, expiresAt: updated.currentPeriodEnd });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, plan: planName, subscriptionStatus, subscriptionEndsAt, isActive, logoUrl } = req.body;

    // 1. Datos del Tenant
    const tenantData = {};
    if (name      !== undefined) tenantData.name      = name;
    if (logoUrl   !== undefined) tenantData.logoUrl   = logoUrl || null;
    if (isActive  !== undefined) {
      // Propagar isActive a todos los restaurantes del tenant
      await prisma.restaurant.updateMany({
        where: { tenantId: id },
        data:  { isActive: isActive === true || isActive === 'true' }
      });
    }

    // 2. Datos de Subscription
    const subData = {};
    if (subscriptionStatus !== undefined) subData.status           = subscriptionStatus;
    if (subscriptionEndsAt !== undefined) subData.currentPeriodEnd = subscriptionEndsAt ? new Date(subscriptionEndsAt) : new Date();
    if (planName !== undefined) {
      const planRecord = await prisma.plan.findFirst({ where: { name: planName.toUpperCase() } });
      if (planRecord) subData.planId = planRecord.id;
    }
    if (Object.keys(subData).length > 0) {
      tenantData.subscription = { update: subData };
    }

    const updated = await prisma.tenant.update({
      where:   { id },
      data:    tenantData,
      include: { subscription: { include: { plan: true } }, restaurants: true }
    });

    res.json(updated);
  } catch (e) {
    console.error('Error actualizando tenant:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.tenant.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router
