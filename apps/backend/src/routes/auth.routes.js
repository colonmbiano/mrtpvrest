const express    = require('express')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const crypto     = require('crypto')
const { z }      = require('zod')
const prisma     = require('@mrtpvrest/database').prisma
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
  const accessToken  = jwt.sign({ userId, restaurantId, role, tenantId }, process.env.JWT_SECRET,         { expiresIn: '15m' })
  const refreshToken = jwt.sign({ userId },                               process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
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

// DEPRECATED alias (audit M1). Canónico: GET /api/admin/locations.
// Mantenido para compatibilidad con APK mobile-tpv ya distribuida.
// Responde el mismo payload reducido (id/name/slug) que el mobile consume.
router.get('/my-locations', authenticate, async (req, res) => {
  try {
    if (!req.user.restaurantId) {
      return res.status(400).json({ error: 'Este usuario no está asociado a ninguna marca.' });
    }
    const locations = await prisma.location.findMany({
      where: { restaurantId: req.user.restaurantId },
      select: { id: true, name: true, slug: true }
    });
    res.set('Deprecation', 'true');
    res.set('Link', '</api/admin/locations>; rel="successor-version"');
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

// POST /api/auth/register-tenant (canónico)
// POST /api/auth/register (alias retrocompatible — clientes antiguos)
router.post(['/register-tenant', '/register'], registerLimiter, async (req, res) => {
  const { restaurantName, ownerName, email, password, planId: requestedPlanId } = req.body

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

    // Resolución de plan: el solicitado por el cliente si es válido; si no,
    // BASIC; si tampoco, el primer activo más barato. Si no hay ninguno, 500.
    let plan = null
    if (requestedPlanId) {
      plan = await prisma.plan.findFirst({ where: { id: requestedPlanId, isActive: true } })
    }
    if (!plan) plan = await prisma.plan.findFirst({ where: { name: 'BASIC', isActive: true } })
    if (!plan) plan = await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } })
    if (!plan) return res.status(500).json({ error: 'No hay planes activos configurados' })

    const now         = new Date()
    const trialEndsAt = new Date(now)
    trialEndsAt.setDate(trialEndsAt.getDate() + plan.trialDays)
    const passwordHash = await bcrypt.hash(password, 12)

    const { tenant, restaurant, user, location } = await prisma.$transaction(async (tx) => {
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

      // 3.5. Location default "Principal" — sin esto, el onboarding y el TPV
      // no tienen sucursal que seleccionar y quedan bloqueados pidiendo al
      // usuario que "inicie sesión de nuevo".
      const loc = await tx.location.create({
        data: {
          restaurantId: r.id,
          name:         'Principal',
          slug:         'principal',
          isActive:     true,
          ticketConfig: { create: { businessName: restaurantName, header: restaurantName } },
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

      return { tenant: t, restaurant: r, user: u, location: loc }
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
      location: location ? {
        id:   location.id,
        name: location.name,
        slug: location.slug,
      } : null,
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

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKEN — POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken requerido' })

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

    // Verificar que el token existe en BD y no ha expirado
    const stored = await prisma.refreshToken.findFirst({
      where: { token: refreshToken, userId: payload.userId }
    })
    if (!stored) return res.status(401).json({ error: 'Refresh token inválido o revocado', code: 'TOKEN_INVALID' })
    if (stored.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {})
      return res.status(401).json({ error: 'Refresh token expirado', code: 'TOKEN_EXPIRED' })
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, restaurantId: true, tenantId: true, isActive: true }
    })
    if (!user || !user.isActive) return res.status(401).json({ error: 'Usuario inactivo' })

    // Rotar: eliminar el token anterior y emitir uno nuevo
    const newTokens = generateTokens(user.id, user.restaurantId, user.role, user.tenantId)
    await prisma.refreshToken.delete({ where: { id: stored.id } })
    await prisma.refreshToken.create({
      data: { token: newTokens.refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    })

    res.json({ accessToken: newTokens.accessToken, refreshToken: newTokens.refreshToken })
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'Refresh token expirado', code: 'TOKEN_EXPIRED' })
    res.status(401).json({ error: 'Refresh token inválido' })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// CAMBIAR CONTRASEÑA — PUT /api/auth/change-password
// ─────────────────────────────────────────────────────────────────────────────
router.put('/change-password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'currentPassword y newPassword son requeridos' })
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' })

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } })
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const valid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'La contraseña actual es incorrecta' })

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    res.json({ ok: true, message: 'Contraseña actualizada correctamente' })
  } catch (e) {
    console.error('Error en /change-password:', e)
    res.status(500).json({ error: 'Error al cambiar la contraseña' })
  }
})

// POST /api/auth/logout — eliminar refresh token
router.post('/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body
  try {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken, userId: req.user.id }
      })
    }
    res.json({ ok: true })
  } catch { res.json({ ok: true }) }
})

module.exports = router
