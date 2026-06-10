const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const router  = express.Router()

// Tenant de sistema — se excluye del listado visible de marcas.
const PLATFORM_TENANT_SLUG = 'mrtpvrest-platform'

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
    const allowed = [
      'basicPlanPrice', 'proPlanPrice', 'unlimitedPlanPrice', 'trialDays',
      'currency', 'supportEmail',
      'openRegistration', 'autoTrial', 'maintenanceMode', 'whatsappEnabled',
    ];
    const data = {};
    for (const f of allowed) if (req.body[f] !== undefined) data[f] = req.body[f];

    const config = await prisma.globalConfig.upsert({
      where:  { id: 'saas-config' },
      update: data,
      create: { id: 'saas-config', ...data },
    });
    res.json(config);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONFIGURACIÓN DEL RESTAURANTE (PARA EL DUEÑO Y LA APP) ────────────────

router.get('/config', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const [config, restaurant] = await Promise.all([
      prisma.restaurantConfig.findUnique({ where: { restaurantId } }),
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, logoUrl: true, slug: true }
      })
    ]);
    res.set('Cache-Control', 'no-store');
    res.json({
      ...(config || {}),
      name: restaurant?.name || 'Nuevo Restaurante',
      logoUrl: restaurant?.logoUrl || null,
      slug: restaurant?.slug || null
    });
  } catch (e) { res.status(500).json({ error: 'Error al obtener configuracion' }) }
})

router.put('/brand', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
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

router.put('/config', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const VALID_FIELDS = [
      'phone','whatsappNumber','address','countryCode','deliveryFee','freeDeliveryFrom',
      'minOrderAmount','estimatedDelivery','isOpen','closedMessage',
      'pointsPerTen','pointsValuePesos','storefrontTheme',
      'centralWarehouseEnabled',
      // Horario de atención (businessHours llega como JSON serializado)
      'scheduleEnabled','timezone','businessHours',
      // Envío por distancia
      'deliveryMode','originLat','originLng','deliveryBaseFee','deliveryPerKm',
      'deliveryFreeRadiusKm','deliveryMaxKm',
    ];
    // Numéricos que SÍ admiten null (campos opcionales en el schema).
    const NULLABLE_NUMERIC = new Set([
      'freeDeliveryFrom','originLat','originLng','deliveryFreeRadiusKm','deliveryMaxKm',
    ]);
    // Numéricos NOT NULL (con default): un vacío se interpreta como 0.
    const NUMERIC_NOT_NULL = new Set([
      'deliveryFee','minOrderAmount','estimatedDelivery','pointsPerTen',
      'pointsValuePesos','deliveryBaseFee','deliveryPerKm',
    ]);
    const data = {};
    for (const [k, v] of Object.entries(req.body)) {
      if (!VALID_FIELDS.includes(k)) continue;
      if (NULLABLE_NUMERIC.has(k)) {
        if (v === '' || v === null || v === undefined) { data[k] = null; continue; }
        const n = Number(v);
        data[k] = Number.isNaN(n) ? null : n;
      } else if (NUMERIC_NOT_NULL.has(k)) {
        const n = Number(v);
        data[k] = Number.isNaN(n) ? 0 : n;
      } else {
        data[k] = v;
      }
    }
    const config = await prisma.restaurantConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...data },
      update: data
    });
    res.json(config);
  } catch (e) { res.status(500).json({ error: 'Error al guardar configuracion' }) }
})

// ── BITÁCORA DE ACCESO ─────────────────────────────────────────────────
// BUG-13 (QA): la pantalla /admin/seguridad consume GET /api/admin/access-log
// para mostrar los últimos N eventos. Antes el endpoint no existía y devolvía
// 404; el frontend caía a [] silenciosamente y mostraba "Sin eventos".
router.get('/access-log', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    const rows = await prisma.accessLog.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(rows.map(r => ({
      id:           r.id,
      action:       r.action,
      employeeName: r.actorName,
      createdAt:    r.createdAt,
      metadata:     r.reason || r.resource || null,
    })));
  } catch (e) {
    console.error('access-log error:', e?.message || e);
    res.status(500).json({ error: 'Error al cargar la bitácora' });
  }
});

// ── GESTIÓN DE SUCURSALES ───────────────────────────────────────────────

router.get('/locations', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locations = await prisma.location.findMany({ where: { restaurantId } });
    res.json(locations);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/admin/locations/:id — detalle de una sucursal.
// SUPER_ADMIN puede leer cualquier sucursal (provisión de TPV cross-tenant).
// ADMIN solo dentro de su restaurante.
router.get('/locations/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location) return res.status(404).json({ error: 'Sucursal no encontrada' });

    if (req.user?.role !== 'SUPER_ADMIN') {
      const restaurantId = req.restaurantId || req.user?.restaurantId;
      if (!restaurantId || location.restaurantId !== restaurantId) {
        return res.status(404).json({ error: 'Sucursal no encontrada' });
      }
    }

    res.json(location);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/locations', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, slug, address, phone, autoPromoEnabled, autoPromoThreshold, autoPromoDiscount, hasDelivery, hasTakeaway, hasTableMap } = req.body;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { _count: { select: { locations: true } } }
    });
    if (restaurant._count.locations >= restaurant.maxLocations) {
      return res.status(403).json({ error: `Límite de sucursales alcanzado (${restaurant.maxLocations}).` });
    }
    // Tomamos businessName del restaurant padre — nunca usar mocks.
    const location = await prisma.location.create({
      data: {
        restaurantId,
        name,
        slug: slug.toLowerCase(),
        address,
        phone,
        ...(autoPromoEnabled !== undefined && { autoPromoEnabled }),
        ...(autoPromoThreshold !== undefined && { autoPromoThreshold }),
        ...(autoPromoDiscount !== undefined && { autoPromoDiscount }),
        ...(hasDelivery !== undefined && { hasDelivery: Boolean(hasDelivery) }),
        ...(hasTakeaway !== undefined && { hasTakeaway: Boolean(hasTakeaway) }),
        ...(hasTableMap !== undefined && { hasTableMap: Boolean(hasTableMap) }),
        ticketConfig: { create: { businessName: restaurant.name, header: restaurant.name } },
      },
    });
    res.json(location);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/locations/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const { name, address, phone, autoPromoEnabled, autoPromoThreshold, autoPromoDiscount, autoPromoMaxItems, isCentralWarehouse, hasDelivery, hasTakeaway, hasTableMap } = req.body;
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location || location.restaurantId !== restaurantId)
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    const data = {
      ...(name && { name }),
      ...(address !== undefined && { address }),
      ...(phone !== undefined && { phone }),
      ...(autoPromoEnabled !== undefined && { autoPromoEnabled }),
      ...(autoPromoThreshold !== undefined && { autoPromoThreshold }),
      ...(autoPromoDiscount !== undefined && { autoPromoDiscount }),
      ...(autoPromoMaxItems !== undefined && { autoPromoMaxItems: Math.max(0, parseInt(autoPromoMaxItems, 10) || 0) }),
      ...(isCentralWarehouse !== undefined && { isCentralWarehouse: Boolean(isCentralWarehouse) }),
      ...(hasDelivery !== undefined && { hasDelivery: Boolean(hasDelivery) }),
      ...(hasTakeaway !== undefined && { hasTakeaway: Boolean(hasTakeaway) }),
      ...(hasTableMap !== undefined && { hasTableMap: Boolean(hasTableMap) }),
    };
    // Sólo una Bodega Central por restaurant: si se marca esta, se desmarca el resto.
    const updated = await prisma.$transaction(async (tx) => {
      if (isCentralWarehouse === true) {
        await tx.location.updateMany({
          where: { restaurantId, isCentralWarehouse: true, NOT: { id: req.params.id } },
          data: { isCentralWarehouse: false },
        });
      }
      return tx.location.update({ where: { id: req.params.id }, data });
    });

    // Si cambió el descuento, re-aplicar el nuevo % a las promos vigentes para
    // que el cambio sea visible de inmediato (antes sólo se reflejaba al volver
    // a correr "Analizar"). isPromo/promoPrice son a nivel restaurante, así que
    // se recalculan todos los platillos en promo usando el precio regular.
    const newDiscount = Number(autoPromoDiscount);
    if (autoPromoDiscount !== undefined && Number.isFinite(newDiscount) && newDiscount !== location.autoPromoDiscount) {
      const promoItems = await prisma.menuItem.findMany({
        where: { restaurantId, isPromo: true },
        select: { id: true, price: true },
      });
      const factor = Math.min(100, Math.max(0, newDiscount)) / 100;
      await Promise.all(promoItems.map(item => {
        const promoPrice = parseFloat(Math.max(0, item.price * (1 - factor)).toFixed(2));
        return prisma.menuItem.update({ where: { id: item.id }, data: { promoPrice } });
      }));
    }

    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/locations/:id', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location || location.restaurantId !== restaurantId)
      return res.status(404).json({ error: 'Sucursal no encontrada' });
    await prisma.location.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GESTIÓN DE TENANTS (SUPER_ADMIN) ──────────────────

router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { slug: { not: PLATFORM_TENANT_SLUG } },
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

// ─────────────────────────────────────────────────────────────────────────────
// BYOK — API key de Groq Cloud del cliente
// ─────────────────────────────────────────────────────────────────────────────

const { encryptSecret, decryptSecret, maskSecret } = require('../lib/secret-crypto');

// GET /api/admin/ai-key — estado: si hay key, muestra máscara + validación
router.get('/ai-key', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        aiApiKey: true,
        aiKeyValidatedAt: true,
        tenant: { select: { subscription: { select: { status: true, trialEndsAt: true } } } },
      },
    });
    if (!r) return res.status(404).json({ error: 'Restaurante no encontrado' });
    const sub = r.tenant?.subscription;
    const trialActive = sub?.status === 'TRIAL' && sub.trialEndsAt && new Date(sub.trialEndsAt) > new Date();
    let masked = null;
    let decryptable = true;
    if (r.aiApiKey) {
      try {
        const plain = decryptSecret(r.aiApiKey);
        if (!plain) decryptable = false;
        else masked = maskSecret(plain);
      } catch {
        decryptable = false;
      }
    }
    res.json({
      configured: Boolean(r.aiApiKey),
      decryptable,
      masked,
      validatedAt: r.aiKeyValidatedAt,
      trialActive,
      trialEndsAt: sub?.trialEndsAt || null,
      subscriptionStatus: sub?.status || null,
    });
  } catch (e) {
    console.error('GET /admin/ai-key:', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// POST /api/admin/ai-key — guarda nueva key (previa validación contra Groq)
router.post('/ai-key', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    const { apiKey } = req.body || {};
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 20) {
      return res.status(400).json({ error: 'API key inválida.' });
    }
    const trimmed = apiKey.trim();
    if (/^AIza/i.test(trimmed)) {
      return res.status(400).json({
        error: 'Esta integracion usa Groq Cloud. Pega una API key que empiece con gsk_, no una key de Google AI Studio.',
        code: 'WRONG_PROVIDER',
      });
    }
    if (!/^gsk_/i.test(trimmed)) {
      return res.status(400).json({
        error: 'API key invalida. Debe ser una key de Groq Cloud que empiece con gsk_.',
        code: 'WRONG_PROVIDER',
      });
    }

    // Validar contra Groq con una llamada trivial
    try {
      const { GROQ_BASE_URL, GROQ_MODEL } = require('../services/groq-error');
      const OpenAI = require('openai');
      const probe = new OpenAI({ apiKey: trimmed, baseURL: GROQ_BASE_URL });
      const result = await probe.chat.completions.create({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      });
      if (!result?.choices?.length) throw new Error('Respuesta vacía de Groq');
    } catch (probeErr) {
      const msg = probeErr?.message || 'La API key no fue aceptada por Groq Cloud.';
      return res.status(422).json({ error: `No pude validar la API key: ${msg}`, code: 'KEY_INVALID' });
    }

    // Cifrar y persistir
    let encrypted;
    try {
      encrypted = encryptSecret(trimmed);
    } catch (e) {
      if (e.code === 'CRYPTO_UNCONFIGURED') {
        return res.status(503).json({ error: 'Cifrado no configurado en el servidor (falta AI_ENCRYPTION_KEY).' });
      }
      throw e;
    }
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { aiApiKey: encrypted, aiKeyValidatedAt: new Date() },
    });
    res.json({ ok: true, masked: maskSecret(trimmed), validatedAt: new Date() });
  } catch (e) {
    console.error('POST /admin/ai-key:', e);
    res.status(500).json({ error: e.message || 'Error al guardar la API key' });
  }
});

// DELETE /api/admin/ai-key — remueve la key del restaurante
router.delete('/ai-key', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user?.restaurantId || req.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { aiApiKey: null, aiKeyValidatedAt: null },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /admin/ai-key:', e);
    res.status(500).json({ error: e.message || 'Error' });
  }
});

// ── MOTOR DE PROMOCIONES AUTOMÁTICAS ──────────────────────────────────────────

// GET /api/admin/promos — Lista items en promo y config por sucursal
router.get('/promos', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [locations, menuItems] = await Promise.all([
      prisma.location.findMany({
        where: { restaurantId },
        select: {
          id: true, name: true,
          autoPromoEnabled: true,
          autoPromoThreshold: true,
          autoPromoDiscount: true,
          autoPromoMaxItems: true,
        }
      }),
      prisma.menuItem.findMany({
        where: { restaurantId },
        include: { category: { select: { name: true } } },
        orderBy: [{ isPromo: 'desc' }, { updatedAt: 'desc' }]
      })
    ]);

    // Ventas de los últimos 7 días para enriquecer la respuesta
    const recentOrders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: { gte: sevenDaysAgo },
        status: { notIn: ['CANCELLED'] }
      },
      include: { items: { select: { menuItemId: true, quantity: true } } }
    });

    const salesCount = {};
    for (const order of recentOrders) {
      for (const item of order.items) {
        salesCount[item.menuItemId] = (salesCount[item.menuItemId] || 0) + item.quantity;
      }
    }

    const enrichedItems = menuItems.map(item => ({
      ...item,
      soldLast7Days: salesCount[item.id] || 0,
    }));
    const promoItems = enrichedItems.filter(item => item.isPromo);

    res.json({ locations, promoItems, menuItems: enrichedItems });
  } catch (e) {
    console.error('GET /admin/promos:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/promos/trigger — Dispara el motor manualmente para una o todas las sucursales
router.post('/promos/trigger', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const { locationId } = req.body; // Opcional: solo para una sucursal específica

    // Verificar que la sucursal pertenece al restaurante
    if (locationId) {
      const loc = await prisma.location.findUnique({ where: { id: locationId } });
      if (!loc || loc.restaurantId !== restaurantId) {
        return res.status(404).json({ error: 'Sucursal no encontrada' });
      }
    }

    // Importar el motor y ejecutar en background (no bloqueamos la respuesta)
    const { runAutoPromos } = require('../jobs/autoPromos.job');
    res.json({ ok: true, message: 'Motor de promociones iniciado. Los cambios se aplicarán en segundos.' });

    // Ejecutar en background después de responder
    setImmediate(() => {
      runAutoPromos({ restaurantId, locationId }).catch(e =>
        console.error('Error en trigger manual de promos:', e)
      );
    });
  } catch (e) {
    console.error('POST /admin/promos/trigger:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/promos/clear — Quita la promo de TODOS los platillos del restaurante
router.post('/promos/clear', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });

    const result = await prisma.menuItem.updateMany({
      where: { restaurantId, isPromo: true },
      data: { isPromo: false, promoPrice: null },
    });

    res.json({ ok: true, cleared: result.count });
  } catch (e) {
    console.error('POST /admin/promos/clear:', e);
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/admin/promos/:itemId — Activar/desactivar promo manualmente en un item
router.put('/promos/:itemId', authenticate, requireTenantAccess, requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const { isPromo, promoPrice } = req.body;

    const item = await prisma.menuItem.findUnique({ where: { id: req.params.itemId } });
    if (!item || item.restaurantId !== restaurantId) {
      return res.status(404).json({ error: 'Platillo no encontrado' });
    }

    const enabled = Boolean(isPromo);
    let nextPromoPrice = null;
    if (enabled) {
      nextPromoPrice = promoPrice == null || promoPrice === ''
        ? Math.round(item.price * 0.85 * 100) / 100
        : Number(promoPrice);

      if (!Number.isFinite(nextPromoPrice) || nextPromoPrice <= 0 || nextPromoPrice >= item.price) {
        return res.status(400).json({ error: 'El precio promocional debe ser mayor a 0 y menor al precio regular.' });
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: req.params.itemId },
      data: {
        isPromo: enabled,
        promoPrice: nextPromoPrice,
      }
    });

    res.json(updated);
  } catch (e) {
    console.error('PUT /admin/promos/:itemId:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router
