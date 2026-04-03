// ─────────────────────────────────────────────────────────────────────────────
// tenant.routes.js — Wizard de onboarding y estado de suscripción del tenant
// Todas las rutas requieren JWT
// ─────────────────────────────────────────────────────────────────────────────

const router  = require('express').Router()
const prisma  = require('../utils/prisma')
const { authenticate } = require('../middleware/auth.middleware')
const multer  = require('multer')
const { scanMenuFromImages } = require('../services/ai.service')

router.use(authenticate)

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenant/me — datos del tenant + subscription + onboardingStep
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const tenantId = req.user.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Este usuario no está asociado a ningún tenant' })

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: { include: { plan: true } },
        restaurants:  { select: { id: true, slug: true, name: true } },
      }
    })
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' })

    const sub = tenant.subscription
    const daysLeft = sub?.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - Date.now()) / (1000 * 60 * 60 * 24)))
      : null

    res.json({
      id:             tenant.id,
      name:           tenant.name,
      slug:           tenant.slug,
      ownerEmail:     tenant.ownerEmail,
      logoUrl:        tenant.logoUrl,
      primaryColor:   tenant.primaryColor,
      onboardingStep: tenant.onboardingStep,
      onboardingDone: tenant.onboardingDone,
      restaurants:    tenant.restaurants,
      subscription: sub ? {
        status:      sub.status,
        plan:        sub.plan?.displayName,
        planName:    sub.plan?.name,
        trialEndsAt: sub.trialEndsAt,
        paidUntil:   sub.currentPeriodEnd,
        daysLeft,
      } : null,
    })
  } catch (e) {
    console.error('GET /tenant/me:', e)
    res.status(500).json({ error: 'Error al obtener datos del tenant' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tenant/subscription — estado del trial (días restantes, plan)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/subscription', async (req, res) => {
  const tenantId = req.user.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Sin tenant asociado' })

  try {
    const sub = await prisma.subscription.findUnique({
      where:   { tenantId },
      include: { plan: true },
    })
    if (!sub) return res.status(404).json({ error: 'Suscripción no encontrada' })

    const now      = Date.now()
    const daysLeft = sub.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(sub.trialEndsAt) - now) / (1000 * 60 * 60 * 24)))
      : null
    const isExpired = sub.status === 'TRIAL' && sub.trialEndsAt && new Date(sub.trialEndsAt) < new Date()

    res.json({
      status:      sub.status,
      plan:        sub.plan?.displayName,
      planName:    sub.plan?.name,
      trialEndsAt: sub.trialEndsAt,
      paidUntil:   sub.currentPeriodEnd,
      daysLeft,
      isExpired,
      features: {
        hasKDS:       sub.plan?.hasKDS,
        hasLoyalty:   sub.plan?.hasLoyalty,
        hasInventory: sub.plan?.hasInventory,
        hasReports:   sub.plan?.hasReports,
        hasAPIAccess: sub.plan?.hasAPIAccess,
        maxLocations: sub.plan?.maxLocations,
        maxEmployees: sub.plan?.maxEmployees,
      }
    })
  } catch (e) {
    console.error('GET /tenant/subscription:', e)
    res.status(500).json({ error: 'Error al obtener suscripción' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/tenant/onboarding — avanza el wizard y guarda datos del paso
// Body: { step, data: { logoUrl?, primaryColor?, menuImported?, employees? } }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/onboarding', async (req, res) => {
  const tenantId = req.user.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Sin tenant asociado' })

  const { step, data = {} } = req.body
  if (step === undefined) return res.status(400).json({ error: 'step es requerido' })

  const TOTAL_STEPS = 3
  const nextStep    = Math.min(step + 1, TOTAL_STEPS)
  const isDone      = nextStep >= TOTAL_STEPS

  try {
    const updateData = { onboardingStep: nextStep, onboardingDone: isDone }

    if (data.logoUrl)      updateData.logoUrl      = data.logoUrl
    if (data.primaryColor) updateData.primaryColor = data.primaryColor

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data:  updateData,
      select: { id: true, onboardingStep: true, onboardingDone: true, logoUrl: true, primaryColor: true }
    })

    res.json({ ok: true, tenant })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Tenant no encontrado' })
    console.error('PUT /tenant/onboarding:', e)
    res.status(500).json({ error: 'Error al guardar progreso' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tenant/onboarding/employees — crea empleados durante el wizard
// No requiere locationId (se asigna luego al configurar sucursales)
// Body: { employees: [{ name, pin, role }] }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/onboarding/employees', async (req, res) => {
  const { restaurantId } = req.user
  if (!restaurantId) return res.status(400).json({ error: 'Sin restaurante asociado' })

  const { employees } = req.body
  if (!Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({ error: 'Se requiere al menos un empleado' })
  }

  const ROLE_DEFAULTS = {
    CASHIER: { canCharge: true,  canDiscount: true,  canModifyTickets: true,  canDeleteTickets: false, canConfigSystem: false },
    COOK:    { canCharge: false, canDiscount: false, canModifyTickets: false, canDeleteTickets: false, canConfigSystem: false },
  }

  try {
    // Verificar que ningún PIN esté en uso en el restaurante
    const pins = employees.map(e => e.pin)
    const existing = await prisma.employee.findFirst({
      where: { pin: { in: pins } }
    })
    if (existing) {
      return res.status(400).json({ error: `El PIN ${existing.pin} ya está en uso` })
    }

    const created = await prisma.$transaction(
      employees.map(e => {
        const defaults = ROLE_DEFAULTS[e.role] || ROLE_DEFAULTS.CASHIER
        return prisma.employee.create({
          data: {
            name:             e.name,
            pin:              e.pin,
            role:             e.role || 'CASHIER',
            isActive:         true,
            tables:           [],
            scheduleDays:     [],
            ...defaults,
          }
        })
      })
    )

    res.status(201).json({ ok: true, employees: created })
  } catch (e) {
    if (e.code === 'P2002') return res.status(400).json({ error: 'Algún PIN ya está en uso' })
    console.error('POST /tenant/onboarding/employees:', e)
    res.status(500).json({ error: 'Error al crear empleados' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tenant/import-menu — importa menú desde imagen o PDF con IA
// Multipart field: menu (image/jpeg, image/png, image/webp, application/pdf)
// ─────────────────────────────────────────────────────────────────────────────
const _menuUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Tipo de archivo no permitido. Use imágenes (jpeg/png/webp) o PDF.'))
  },
})

router.post('/import-menu', _menuUpload.single('menu'), async (req, res) => {
  const { restaurantId } = req.user
  if (!restaurantId) return res.status(400).json({ error: 'Sin restaurante asociado' })
  if (!req.file)    return res.status(400).json({ error: 'Se requiere un archivo en el campo "menu"' })

  try {
    const base64 = req.file.buffer.toString('base64')
    // scanMenuFromImages expects an array of base64 strings
    // NOTE: the service hardcodes image/jpeg as mimeType; PDF support requires a future service update
    const result = await scanMenuFromImages([base64])

    const { categories = [], items = [] } = result

    // Upsert categories
    const categoryMap = {}
    for (let i = 0; i < categories.length; i++) {
      const name = categories[i]
      const cat = await prisma.category.upsert({
        where:  { restaurantId_name: { restaurantId, name } },
        update: { sortOrder: i },
        create: { restaurantId, name, sortOrder: i },
      })
      categoryMap[name] = cat.id
    }

    // Create menu items
    const created = []
    for (const item of items) {
      const categoryId = categoryMap[item.category] ?? null
      const menuItem = await prisma.menuItem.create({
        data: {
          restaurantId,
          categoryId,
          name:        item.name,
          description: item.description ?? '',
          price:       item.price ?? 0,
          isAvailable: true,
        },
      })
      created.push(menuItem)
    }

    res.json({ ok: true, categories: categories.length, items: created.length })
  } catch (e) {
    console.error('POST /tenant/import-menu:', e)
    res.status(500).json({ error: 'Error al importar el menú' })
  }
})

module.exports = router
