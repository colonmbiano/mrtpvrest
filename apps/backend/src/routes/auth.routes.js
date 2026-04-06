const express    = require('express')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const crypto     = require('crypto')
const { z }      = require('zod')
const prisma     = require('../utils/prisma')
const { authenticate } = require('../middleware/auth.middleware')
const rateLimit  = require('express-rate-limit')
const { sendEmail, verificationEmailHtml } = require('../utils/mailer')

const router = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Aumentamos un poco para pruebas
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
})

const generateTokens = (userId, restaurantId, role, tenantId = null) => {
  const accessToken = jwt.sign({ userId, restaurantId, role, tenantId }, process.env.JWT_SECRET, { expiresIn: '365d' })
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '365d' })
  return { accessToken, refreshToken }
}

// LOGIN GLOBAL (SaaS)
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' })

    const user = await prisma.user.findUnique({
      where: { email },
      include: { restaurant: true } // Traemos la info del restaurante al que pertenece
    })

    if (!user || !user.isActive) return res.status(401).json({ error: 'Credenciales incorrectas o cuenta inactiva' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })

    // Generamos tokens con el contexto del restaurante y tenant del usuario
    const { accessToken, refreshToken } = generateTokens(user.id, user.restaurantId, user.role, user.tenantId)

    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30*24*60*60*1000) }
    })

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        restaurantId: user.restaurantId,
        restaurantSlug: user.restaurant?.slug
      },
      accessToken,
      refreshToken
    })
  } catch (error) {
    console.error('Error Login:', error);
    res.status(500).json({ error: 'Error al iniciar sesion' })
  }
})

// NUEVA RUTA: Obtener sucursales para el "Registro de App" (Usado por TPV y Delivery)
router.get('/my-locations', authenticate, async (req, res) => {
  try {
    if (!req.user.restaurantId) {
      return res.status(400).json({ error: 'Este usuario no está asociado a ninguna marca.' });
    }
    const locations = await prisma.location.findMany({
      where: { restaurantId: req.user.restaurantId },
      select: { id: true, name: true, slug: true }
    });
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar sucursales' });
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, restaurantId: true,
        loyalty: { select: { points: true, tier: true, qrCode: true, totalEarned: true } },
      },
    })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener perfil' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRO SELF-SERVE — crea Tenant + Restaurant + Subscription(TRIAL) + User
// POST /api/auth/register-tenant
// ─────────────────────────────────────────────────────────────────────────────

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados registros desde esta IP. Intenta en 1 hora.' },
})

router.post('/register-tenant', registerLimiter, async (req, res) => {
  const { restaurantName, ownerName, email, password } = req.body

  if (!restaurantName || !ownerName || !email || !password) {
    return res.status(400).json({ error: 'restaurantName, ownerName, email y password son requeridos' })
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
  }

  // Slug a partir del nombre del restaurante
  const slug = restaurantName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  try {
    // Validaciones previas
    const [emailTaken, slugTaken] = await Promise.all([
      prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
      prisma.tenant.findUnique({ where: { slug } }),
    ])

    if (emailTaken) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
    if (slugTaken)  return res.status(409).json({ error: 'Ese nombre de restaurante ya está registrado' })

    // Buscamos el plan BASIC (o el primero activo si no existe)
    let plan = await prisma.plan.findFirst({ where: { name: 'BASIC', isActive: true } })
    if (!plan) plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } })
    if (!plan) return res.status(500).json({ error: 'No hay planes activos configurados' })

    const now         = new Date()
    const trialEndsAt = new Date(now)
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays)
    const passwordHash = await bcrypt.hash(password, 12)

    const { tenant, restaurant, user } = await prisma.$transaction(async (tx) => {
      // 1. Tenant
      const t = await tx.tenant.create({
        data: {
          name:          restaurantName,
          slug,
          ownerEmail:    email.toLowerCase(),
          onboardingStep: 0,
          onboardingDone: false,
        }
      })

      // 2. Subscription ligada al Tenant
      await tx.subscription.create({
        data: {
          tenantId:           t.id,
          planId:             plan.id,
          status:             'TRIAL',
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd:   trialEndsAt,
          priceSnapshot:      plan.price,
          paymentGateway:     'MANUAL',
        }
      })

      // 3. Restaurant ligado al Tenant
      const r = await tx.restaurant.create({
        data: {
          tenantId: t.id,
          slug,
          name:     restaurantName,
          isActive: true,
          config: {
            create: {
              estimatedDelivery: 40,
              isOpen:            true,
              pointsPerTen:      1,
              pointsValuePesos:  0.10,
            }
          }
        }
      })

      // 4. User ADMIN ligado a Tenant + Restaurant
      const u = await tx.user.create({
        data: {
          tenantId:     t.id,
          restaurantId: r.id,
          name:         ownerName,
          email:        email.toLowerCase(),
          passwordHash,
          role:         'ADMIN',
          isActive:     true,
        }
      })

      return { tenant: t, restaurant: r, user: u }
    })

    const { accessToken, refreshToken } = generateTokens(user.id, restaurant.id, user.role, tenant.id)
    await prisma.refreshToken.create({
      data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30*24*60*60*1000) }
    })

    // Generar token de verificación de email (24h)
    const verificationToken  = crypto.randomBytes(32).toString('hex')
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        emailVerificationToken:  verificationToken,
        emailVerificationExpiry: verificationExpiry,
      }
    })

    // Enviar email (sin bloquear la respuesta)
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/verify-email?token=${verificationToken}`
    sendEmail(
      email.toLowerCase(),
      `Verifica tu cuenta de ${restaurantName} — MRTPVREST`,
      verificationEmailHtml(ownerName, restaurantName, verifyUrl)
    ).catch(err => console.error('[register-tenant] Error enviando email:', err.message))

    res.status(201).json({
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
      tenant: {
        id:             tenant.id,
        name:           tenant.name,
        slug:           tenant.slug,
        onboardingStep: tenant.onboardingStep,
      },
      restaurant: {
        id:   restaurant.id,
        slug: restaurant.slug,
      },
      subscription: {
        status:     'TRIAL',
        trialEndsAt,
        plan:       plan.displayName,
        trialDays:  plan.trialDays,
      },
      accessToken,
      refreshToken,
    })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'El email o nombre ya está registrado' })
    console.error('Error en /auth/register-tenant:', e)
    res.status(500).json({ error: 'Error al registrar. Intenta de nuevo.' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICAR EMAIL — GET /api/auth/verify-email/:token
// ─────────────────────────────────────────────────────────────────────────────
router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params
  if (!token) return res.status(400).json({ error: 'Token requerido' })

  try {
    const tenant = await prisma.tenant.findFirst({
      where: { emailVerificationToken: token }
    })

    if (!tenant) {
      return res.status(404).json({ error: 'Token inválido o ya fue usado' })
    }

    if (tenant.emailVerificationExpiry && tenant.emailVerificationExpiry < new Date()) {
      return res.status(410).json({ error: 'El enlace ha expirado. Solicita uno nuevo.' })
    }

    const updated = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        emailVerifiedAt:         new Date(),
        emailVerificationToken:  null,
        emailVerificationExpiry: null,
      },
      select: { isOnboarded: true }
    })

    res.json({ ok: true, message: 'Email verificado correctamente', isOnboarded: updated.isOnboarded })
  } catch (e) {
    console.error('Error en /verify-email:', e)
    res.status(500).json({ error: 'Error al verificar' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// REENVIAR EMAIL DE VERIFICACIÓN — POST /api/auth/resend-verification
// ─────────────────────────────────────────────────────────────────────────────
router.post('/resend-verification', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true }
    })
    if (!user?.tenant) return res.status(404).json({ error: 'Tenant no encontrado' })
    if (user.tenant.emailVerifiedAt) return res.status(400).json({ error: 'El email ya está verificado' })

    const verificationToken  = crypto.randomBytes(32).toString('hex')
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.tenant.update({
      where: { id: user.tenant.id },
      data: { emailVerificationToken: verificationToken, emailVerificationExpiry: verificationExpiry }
    })

    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/verify-email?token=${verificationToken}`
    await sendEmail(
      user.tenant.ownerEmail,
      `Verifica tu cuenta de ${user.tenant.name} — MRTPVREST`,
      verificationEmailHtml(user.name, user.tenant.name, verifyUrl)
    )

    res.json({ ok: true, message: 'Email reenviado' })
  } catch (e) {
    console.error('Error en /resend-verification:', e)
    res.status(500).json({ error: 'Error al reenviar' })
  }
})

module.exports = router
