const router  = require('express').Router();
const prisma   = require('@mrtpvrest/database').prisma;
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { authenticate, requireSuperAdmin } = require('../middleware/auth.middleware');

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS PÚBLICAS (sin auth)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/saas/register — Onboarding público
router.post('/register', async (req, res) => {
  const {
    restaurantName, slug, phone, address, logoUrl,
    planId, adminName, email, password
  } = req.body;

  if (!restaurantName || !slug || !planId || !adminName || !email || !password) {
    return res.status(400).json({
      error: 'Campos requeridos: restaurantName, slug, planId, adminName, email, password'
    });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const existing = await prisma.restaurant.findUnique({ where: { slug: slug.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'El slug ya está en uso. Elige otro nombre.' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: 'Plan no encontrado o inactivo' });
    }

    const emailTaken = await prisma.user.findUnique({ where: { email } });
    if (emailTaken) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
    }

    const now         = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);

    const passwordHash = await bcrypt.hash(password, 12);

    const [restaurant, user] = await prisma.$transaction(async (tx) => {
      const rest = await tx.restaurant.create({
        data: {
          slug:     slug.toLowerCase(),
          name:     restaurantName,
          logoUrl:  logoUrl || null,
          isActive: true,
          config: {
            create: {
              phone:             phone   || '',
              address:           address || '',
              estimatedDelivery: 40,
              isOpen:            true,
              pointsPerTen:      1,
              pointsValuePesos:  0.10,
            }
          },
          subscription: {
            create: {
              planId,
              status:             'TRIAL',
              trialEndsAt,
              currentPeriodStart: now,
              currentPeriodEnd:   trialEndsAt,
              priceSnapshot:      plan.price,
              paymentGateway:     'MANUAL',
            }
          }
        }
      });

      const usr = await tx.user.create({
        data: {
          restaurantId: rest.id,
          name:         adminName,
          email:        email.toLowerCase(),
          passwordHash,
          role:         'ADMIN',
          isActive:     true,
        }
      });

      return [rest, usr];
    });

    const accessToken  = jwt.sign(
      { userId: user.id, restaurantId: restaurant.id },
      process.env.JWT_SECRET,
      { expiresIn: '365d' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '365d' }
    );

    await prisma.refreshToken.create({
      data: {
        token:     refreshToken,
        userId:    user.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.status(201).json({
      user: {
        id:             user.id,
        name:           user.name,
        email:          user.email,
        role:           user.role,
        restaurantId:   restaurant.id,
        restaurantSlug: restaurant.slug,
      },
      accessToken,
      refreshToken,
      restaurant: {
        id:   restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        subscription: {
          status:    'TRIAL',
          trialEndsAt,
          plan:      plan.displayName,
          trialDays: plan.trialDays,
        }
      }
    });

  } catch (e) {
    if (e.code === 'P2002') {
      return res.status(409).json({ error: 'El slug o email ya está registrado' });
    }
    console.error('Error en /saas/register:', e);
    res.status(500).json({ error: 'Error al registrar. Intenta de nuevo.' });
  }
});

// GET /api/saas/plans — público (usado en onboarding sin token)
router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.plan.findMany({
      where:   { isActive: true },
      orderBy: { price: 'asc' }
    });
    res.json(plans);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RUTAS PROTEGIDAS — requieren SUPER_ADMIN
// ─────────────────────────────────────────────────────────────────────────────
router.use(authenticate, requireSuperAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// PLANES (gestión — SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/saas/plans
router.post('/plans', async (req, res) => {
  const {
    name, displayName, price, trialDays,
    maxLocations, maxEmployees,
    hasKDS, hasLoyalty, hasInventory, hasReports, hasAPIAccess
  } = req.body;

  if (!name || !displayName || price == null) {
    return res.status(400).json({ error: 'name, displayName y price son requeridos' });
  }

  try {
    const plan = await prisma.plan.create({
      data: {
        name: name.toUpperCase(),
        displayName,
        price,
        trialDays:    trialDays    ?? 15,
        maxLocations: maxLocations ?? 1,
        maxEmployees: maxEmployees ?? 5,
        hasKDS:       hasKDS       ?? false,
        hasLoyalty:   hasLoyalty   ?? false,
        hasInventory: hasInventory ?? false,
        hasReports:   hasReports   ?? false,
        hasAPIAccess: hasAPIAccess ?? false,
      }
    });
    res.status(201).json(plan);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Ya existe un plan con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/saas/plans/:id
router.patch('/plans/:id', async (req, res) => {
  const allowed = [
    'displayName', 'price', 'trialDays', 'maxLocations', 'maxEmployees',
    'hasKDS', 'hasLoyalty', 'hasInventory', 'hasReports', 'hasAPIAccess', 'isActive'
  ];
  const data = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });

  try {
    const plan = await prisma.plan.update({ where: { id: req.params.id }, data });
    res.json(plan);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Plan no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TENANTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/saas/tenants
router.get('/tenants', async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        subscription: { include: { plan: true } },
        restaurants:  { select: { id: true, slug: true, name: true, isActive: true } },
        _count:       { select: { restaurants: true, users: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const now = Date.now();
    const result = tenants.map(t => ({
      ...t,
      subscription: t.subscription ? {
        ...t.subscription,
        daysLeft: t.subscription.trialEndsAt
          ? Math.max(0, Math.ceil((new Date(t.subscription.trialEndsAt) - now) / (1000*60*60*24)))
          : null,
      } : null,
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/saas/tenants  — crea Tenant + Restaurant + Subscription (superadmin)
router.post('/tenants', async (req, res) => {
  const { name, slug, ownerEmail, logoUrl, planId } = req.body;

  if (!name || !slug || !planId) {
    return res.status(400).json({ error: 'name, slug y planId son requeridos' });
  }

  try {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const now         = new Date();
    const trialEndsAt = new Date(now);
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays);
    const cleanSlug = slug.toLowerCase();

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug:       cleanSlug,
        ownerEmail: ownerEmail || '',
        logoUrl:    logoUrl || null,
        subscription: {
          create: {
            planId,
            status:             'TRIAL',
            trialEndsAt,
            currentPeriodStart: now,
            currentPeriodEnd:   trialEndsAt,
            priceSnapshot:      plan.price,
            paymentGateway:     'MANUAL',
          }
        },
        restaurants: {
          create: {
            slug:     cleanSlug,
            name,
            isActive: true,
          }
        }
      },
      include: { subscription: { include: { plan: true } }, restaurants: true }
    });

    res.status(201).json(tenant);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'El slug ya está en uso' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saas/tenants/:id
router.get('/tenants/:id', async (req, res) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: { include: { plan: true } },
        restaurants:  { include: { config: true, _count: { select: { locations: true, orders: true } } } },
        _count:       { select: { users: true } }
      }
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
    res.json(tenant);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/saas/tenants/:id/status  — activar / pausar / suspender
router.patch('/tenants/:id/status', async (req, res) => {
  const { status } = req.body;

  const validStatuses = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'status inválido. Valores: ' + validStatuses.join(', ') });
  }

  try {
    const subData = {};
    if (status) {
      subData.status = status;
      if (status === 'SUSPENDED') subData.pausedAt    = new Date();
      if (status === 'CANCELLED') subData.cancelledAt = new Date();
    }

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...(Object.keys(subData).length ? { subscription: { update: subData } } : {})
      },
      include: { subscription: { include: { plan: true } } }
    });

    res.json(tenant);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tenant no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/saas/tenants/:id/plan  — cambiar plan de un tenant
router.patch('/tenants/:id/plan', async (req, res) => {
  const { planId } = req.body;
  if (!planId) return res.status(400).json({ error: 'planId es requerido' });

  try {
    const plan = await prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) return res.status(404).json({ error: 'Plan no encontrado' });

    const now       = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        subscription: {
          update: {
            planId,
            priceSnapshot:      plan.price,
            status:             'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd:   periodEnd,
          }
        }
      },
      include: { subscription: { include: { plan: true } } }
    });

    res.json(tenant);
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tenant no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/saas/tenants/:id/gift-days — regalar N días (extiende trial o período pagado)
router.post('/tenants/:id/gift-days', async (req, res) => {
  const days = Number(req.body?.days);
  if (!Number.isFinite(days) || days <= 0 || days > 365) {
    return res.status(400).json({ error: 'days debe ser un número entre 1 y 365' });
  }

  try {
    const sub = await prisma.subscription.findUnique({ where: { tenantId: req.params.id } });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' });

    const ms = days * 86400000;
    const now = Date.now();

    // Extender currentPeriodEnd desde su valor actual (o desde hoy si ya venció)
    const periodBase = sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > now
      ? new Date(sub.currentPeriodEnd) : new Date();
    const newPeriodEnd = new Date(periodBase.getTime() + ms);

    const data = { currentPeriodEnd: newPeriodEnd };

    if (sub.status === 'TRIAL') {
      // Mantener TRIAL y extender trialEndsAt también
      const trialBase = sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > now
        ? new Date(sub.trialEndsAt) : new Date();
      data.trialEndsAt = new Date(trialBase.getTime() + ms);
    } else if (['EXPIRED', 'SUSPENDED', 'PAST_DUE'].includes(sub.status)) {
      // Reactivar al regalar días
      data.status = 'ACTIVE';
    }

    const updated = await prisma.subscription.update({
      where: { tenantId: req.params.id },
      data,
    });

    res.json({
      ok: true,
      status: updated.status,
      trialEndsAt: updated.trialEndsAt,
      currentPeriodEnd: updated.currentPeriodEnd,
      daysGifted: days,
    });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tenant no encontrado' });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saas/tenants/:id/invoices  — historial de facturas
router.get('/tenants/:id/invoices', async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { tenantId: req.params.id }
    });
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada para este tenant' });

    const invoices = await prisma.invoice.findMany({
      where:   { subscriptionId: sub.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(invoices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/saas/tenants/:id  — eliminar tenant y todos sus datos
router.delete('/tenants/:id', async (req, res) => {
  try {
    await prisma.tenant.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tenant no encontrado' })
    res.status(500).json({ error: e.message })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// MRR
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/saas/mrr
router.get('/mrr', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const active = await prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
      select: { priceSnapshot: true, planId: true, plan: { select: { displayName: true, name: true } } }
    });

    const total = active.reduce((sum, s) => sum + s.priceSnapshot, 0);

    // Desglose por plan — keyed por `name` (STARTER/PRO/ENTERPRISE) y displayName
    const byPlan = {};
    for (const s of active) {
      const key = (s.plan?.name || s.plan?.displayName || 'UNKNOWN').toUpperCase();
      if (!byPlan[key]) byPlan[key] = { count: 0, mrr: 0, displayName: s.plan?.displayName };
      byPlan[key].count += 1;
      byPlan[key].mrr   += s.priceSnapshot;
    }

    // Growth MoM basado en facturas pagadas. Si aún no hay historia suficiente, devolvemos null.
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [thisAgg, lastAgg] = await Promise.all([
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: { status: 'PAID', paidAt: { gte: thisMonthStart } },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: { status: 'PAID', paidAt: { gte: lastMonthStart, lt: thisMonthStart } },
      }),
    ]);

    const thisRevenue = thisAgg._sum.amount || 0;
    const lastRevenue = lastAgg._sum.amount || 0;
    const growth = lastRevenue > 0
      ? Math.round(((thisRevenue - lastRevenue) / lastRevenue) * 1000) / 10
      : null;

    res.json({
      mrr:          Math.round(total * 100) / 100,
      activeCount:  active.length,
      byPlan,
      growth,
      revenueThisMonth: Math.round(thisRevenue * 100) / 100,
      revenueLastMonth: Math.round(lastRevenue * 100) / 100,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PLATAFORMA — métricas globales (SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/saas/health — snapshot de la plataforma
router.get('/health', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const [tenantCount, activeSub, orderCount24h, revenue24hAgg] = await Promise.all([
      prisma.tenant.count(),
      prisma.subscription.count({ where: { status: { in: ['ACTIVE', 'TRIAL'] } } }),
      prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.order.aggregate({
        _sum: { total: true },
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, paymentStatus: 'PAID' },
      }),
    ]);

    res.json({
      tenantCount,
      activeSubscriptions: activeSub,
      orders24h: orderCount24h,
      gmv24h: Math.round((revenue24hAgg._sum.total || 0) * 100) / 100,
      // Health checks reales — si más adelante se agregan sondas, se integran aquí.
      metrics: [],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saas/top-tenants?limit=5 — tenants con mayor MRR
router.get('/top-tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 50);

    const subs = await prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
      orderBy: { priceSnapshot: 'desc' },
      take: limit,
      include: {
        plan: { select: { name: true, displayName: true } },
        tenant: {
          select: {
            id: true, name: true, slug: true, logoUrl: true,
            _count: { select: { restaurants: true } },
          }
        }
      }
    });

    const result = subs
      .filter(s => s.tenant)
      .map(s => ({
        id: s.tenant.id,
        name: s.tenant.name,
        slug: s.tenant.slug,
        logoUrl: s.tenant.logoUrl,
        plan: s.plan?.name || null,
        planDisplay: s.plan?.displayName || null,
        restaurants: s.tenant._count.restaurants,
        mrr: s.priceSnapshot,
      }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saas/new-tenants?days=30&limit=5 — signups recientes
router.get('/new-tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const days  = Math.min(parseInt(req.query.days,  10) || 30, 365);
    const limit = Math.min(parseInt(req.query.limit, 10) || 5,  50);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const tenants = await prisma.tenant.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, slug: true, logoUrl: true, createdAt: true,
        subscription: { select: { status: true, plan: { select: { name: true, displayName: true } } } },
      }
    });

    res.json(tenants);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/saas/invoices?limit=60 — facturas recientes cross-tenant
router.get('/invoices', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 500);

    const invoices = await prisma.invoice.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        subscription: {
          include: {
            plan: { select: { name: true, displayName: true } },
            tenant: { select: { id: true, name: true, slug: true, logoUrl: true } }
          }
        }
      }
    });

    res.json(invoices);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SAAS LOGS — visible al SUPER_ADMIN cross-tenant
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/saas/logs?level=&tenantId=&limit=100
router.get('/logs', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const where = {};
    if (req.query.level)    where.level    = String(req.query.level).toUpperCase();
    if (req.query.tenantId) where.tenantId = String(req.query.tenantId);

    const logs = await prisma.saasLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(logs);
  } catch (e) {
    // Si el modelo aún no existe en la base (migración pendiente), degradamos a lista vacía.
    if (e?.code === 'P2021' || /does not exist/i.test(e?.message || '')) return res.json([]);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SAAS API KEYS — CRUD (SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

function generateApiKey() {
  const raw = crypto.randomBytes(24).toString('base64url');
  return `mrtp_${raw}`;
}
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// GET /api/saas/api-keys
router.get('/api-keys', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const keys = await prisma.saasApiKey.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(keys.map(k => ({
      id: k.id,
      tenantId: k.tenantId,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      active: k.active,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
      requests24h: k.requests24h,
      createdAt: k.createdAt,
    })));
  } catch (e) {
    if (e?.code === 'P2021' || /does not exist/i.test(e?.message || '')) return res.json([]);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/saas/api-keys — emite una nueva key. La key en claro sólo se devuelve aquí.
router.post('/api-keys', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, tenantId, scopes } = req.body;
  if (!name) return res.status(400).json({ error: 'name es requerido' });

  try {
    const key    = generateApiKey();
    const prefix = key.slice(0, 14);
    const hash   = hashKey(key);

    const created = await prisma.saasApiKey.create({
      data: {
        name,
        tenantId: tenantId || null,
        prefix,
        hash,
        scopes: Array.isArray(scopes) ? scopes : [],
        active: true,
      }
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      tenantId: created.tenantId,
      prefix: created.prefix,
      scopes: created.scopes,
      active: created.active,
      createdAt: created.createdAt,
      // Sólo se muestra una vez.
      key,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/saas/api-keys/:id — revoca (soft) y marca inactivo
router.delete('/api-keys/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const updated = await prisma.saasApiKey.update({
      where: { id: req.params.id },
      data:  { active: false, revokedAt: new Date() },
    });
    res.json({ ok: true, id: updated.id });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'API key no encontrada' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
