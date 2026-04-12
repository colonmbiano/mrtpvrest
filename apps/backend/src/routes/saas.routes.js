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
router.get('/mrr', async (req, res) => {
  try {
    const active = await prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAST_DUE'] } },
      select: { priceSnapshot: true, planId: true, plan: { select: { displayName: true } } }
    });

    const total = active.reduce((sum, s) => sum + s.priceSnapshot, 0);

    // Desglose por plan
    const byPlan = {};
    for (const s of active) {
      const key = s.plan.displayName;
      if (!byPlan[key]) byPlan[key] = { count: 0, mrr: 0 };
      byPlan[key].count += 1;
      byPlan[key].mrr   += s.priceSnapshot;
    }

    res.json({
      mrr:          Math.round(total * 100) / 100,
      activeCount:  active.length,
      byPlan,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
