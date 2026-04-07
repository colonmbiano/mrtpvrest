const express = require('express')
const prisma  = require('../utils/prisma')
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
    const restaurantId = req.user.restaurantId;
    const config = await prisma.restaurantConfig.findUnique({
      where: { restaurantId }
    });
    res.json({
      ...(config || {}),
      name: req.restaurant?.name || 'Nuevo Restaurante',
      logoUrl: req.restaurant?.logoUrl || null
    });
  } catch (e) { res.status(500).json({ error: 'Error al obtener configuracion' }) }
})

router.put('/brand', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, logoUrl } = req.body;
    const updated = await prisma.restaurant.update({
      where: { id: req.user.restaurantId },
      data: { ...(name && { name }), ...(logoUrl !== undefined && { logoUrl }) }
    });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: 'Error al actualizar marca' }) }
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

// ── GESTIÓN DE TENANTS (SUPER_ADMIN) ──────────────────

router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await prisma.restaurant.findMany({
      include: {
        _count: { select: { orders: true, users: true, menuItems: true, locations: true } },
        locations: { select: { id: true, name: true, slug: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(tenants);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, slug, email, password, plan, maxLocations, subscriptionEndsAt, isTrial } = req.body;
    if (!name || !slug) return res.status(400).json({ error: 'Nombre y Slug requeridos' });

    let endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    if (isTrial && !endsAt) {
      const globalConfig = await prisma.globalConfig.upsert({ where: { id: 'saas-config' }, update: {}, create: { id: 'saas-config' } });
      endsAt = new Date();
      endsAt.setDate(endsAt.getDate() + globalConfig.trialDays);
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug: slug.toLowerCase().replace(/\s+/g, '-'),
        plan: plan || 'BASIC',
        subscriptionStatus: isTrial ? 'TRIAL' : 'ACTIVE',
        maxLocations: parseInt(maxLocations) || 1,
        subscriptionEndsAt: endsAt,
        config: { create: { } }
      }
    });

    if (email && password) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          name: `Admin ${name}`, email, passwordHash: hashedPassword,
          role: 'ADMIN', restaurantId: restaurant.id
        }
      });
    }
    res.status(201).json({ ok: true, restaurant });
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'El slug o email ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/tenants/:id/gift', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.body;
    const current = await prisma.restaurant.findUnique({ where: { id: req.params.id } });
    let newDate = current.subscriptionEndsAt && new Date(current.subscriptionEndsAt) > new Date() ? new Date(current.subscriptionEndsAt) : new Date();
    newDate.setDate(newDate.getDate() + days);
    const updated = await prisma.restaurant.update({
      where: { id: req.params.id },
      data: { subscriptionEndsAt: newDate, subscriptionStatus: 'ACTIVE', isActive: true }
    });
    res.json({ ok: true, expiresAt: updated.subscriptionEndsAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Falta el ID del restaurante' });

    const { name, plan, subscriptionStatus, subscriptionEndsAt, isActive, logoUrl, domain } = req.body;

    // 1. Actualizar campos directos del Restaurant
    const restaurantData = {};
    if (name !== undefined)     restaurantData.name     = name;
    if (isActive !== undefined) restaurantData.isActive = isActive === true || isActive === 'true';
    if (logoUrl !== undefined)  restaurantData.logoUrl  = logoUrl || null;
    if (domain !== undefined)   restaurantData.domain   = domain  || null;

    // 2. Actualizar Subscription si viene algún campo relacionado
    const subData = {};
    if (subscriptionStatus !== undefined) subData.status           = subscriptionStatus;
    if (subscriptionEndsAt !== undefined) subData.currentPeriodEnd = subscriptionEndsAt ? new Date(subscriptionEndsAt) : new Date();

    // Si viene plan (nombre del plan), buscar su ID y actualizar
    if (plan !== undefined) {
      const planRecord = await prisma.plan.findFirst({ where: { name: plan } });
      if (planRecord) subData.planId = planRecord.id;
    }

    if (Object.keys(subData).length > 0) {
      restaurantData.subscription = { update: subData };
    }

    const updated = await prisma.restaurant.update({
      where: { id },
      data: restaurantData,
      include: { subscription: { include: { plan: true } } }
    });

    res.json(updated);
  } catch (e) {
    console.error('Error actualizando restaurante:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.restaurant.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router
