const express    = require('express')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const crypto     = require('crypto')
const { z }      = require('zod')
const { prisma, runWithBypass } = require('@mrtpvrest/database')
const { authenticate } = require('../middleware/auth.middleware')
const rateLimit  = require('express-rate-limit')
const { refreshLimiter, resendVerifyLimiter } = require('../lib/rate-limiters')
const { sendEmail, verificationEmailHtml } = require('../utils/mailer')
const { verifyTurnstile } = require('../lib/turnstile')
const { isDisposableEmail, normalizeEmail } = require('../lib/email-domains')
const log = require('../lib/logger')('auth')

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

    // Lookup por email canónico (mismo criterio que el registro). Fallback a la
    // forma cruda en minúsculas para cuentas legacy guardadas con puntos/+tag
    // antes de la normalización — así no se regresiona su login.
    const normEmail = normalizeEmail(email)
    const rawEmail  = String(email).trim().toLowerCase()
    const include   = { restaurant: true, tenant: true } // Info de restaurante y tenant
    let user = await runWithBypass(() => prisma.user.findUnique({ where: { email: normEmail }, include }))
    if (!user && rawEmail && rawEmail !== normEmail) {
      user = await runWithBypass(() => prisma.user.findUnique({ where: { email: rawEmail }, include }))
    }

    if (!user || !user.isActive) return res.status(401).json({ error: 'Credenciales incorrectas o cuenta inactiva' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })

    // Primer login después de verificar: enviamos email de bienvenida con links de descarga
    if (user.role === 'ADMIN' && user.tenant && user.tenant.emailVerifiedAt && !user.tenant.welcomeEmailSent) {
      const { welcomeEmailHtml, sendEmail } = require('../utils/mailer')
      try {
        await prisma.tenant.update({
          where: { id: user.tenant.id },
          data: { welcomeEmailSent: true }
        })
        const downloadsUrl = `${process.env.FRONTEND_URL || 'https://admin.mrtpvrest.com'}/descargas`
        sendEmail(
          user.email,
          `¡Bienvenido a ${user.tenant.name}! Descarga tus aplicaciones`,
          welcomeEmailHtml(user.name, user.tenant.name, downloadsUrl)
        ).catch(err => log.error('login.welcome_email.failed', { err, email: user.email }))
      } catch (e) {
        log.error('login.welcome_email_update.failed', { err: e, email: user.email })
      }
    }

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
    log.error('login.failed', { err: error, email: req.body?.email })
    res.status(500).json({ error: 'Error al iniciar sesion' })
  }
})

// DEPRECATED alias (audit M1). Canónico: GET /api/admin/locations.
// El código fuente del app mobile-tpv (Expo/React Native) se retiró del
// monorepo, pero este endpoint se preserva para APKs históricos ya
// distribuidos que siguen pegándole desde campo.
// Responde el mismo payload reducido (id/name/slug) que el mobile consumía.
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
    // Identidad propia (id del token): bypass del tenant-guard — un
    // SUPER_ADMIN tiene restaurantId null y enforce lo dejaría sin perfil.
    const user = await runWithBypass(() => prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, restaurantId: true,
        // Loyalty es ahora array (una cuenta por restaurant). Devolvemos
        // la del restaurant del usuario si existe.
        loyalty: {
          where: req.user.restaurantId ? { restaurantId: req.user.restaurantId } : undefined,
          select: { points: true, tier: true, qrCode: true, totalEarned: true, restaurantId: true },
          take: 1,
        },
      },
    }))
    const payload = user ? { ...user, loyalty: user.loyalty?.[0] || null } : null
    res.json(payload)
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

  // Anti-bot capa 1: CAPTCHA (Cloudflare Turnstile). Solo se exige si
  // TURNSTILE_SECRET_KEY está configurada; si no, se omite (dev/test). Cierra
  // el vector que metió ~72 tenants basura en un día vía script automatizado.
  const captcha = await verifyTurnstile(req.body?.turnstileToken, req.ip)
  if (!captcha.ok) {
    log.warn('register.captcha.fail', { reason: captcha.reason, ip: req.ip })
    return res.status(400).json({
      error: 'Verificación anti-bot fallida. Recarga la página e intenta de nuevo.',
      code:  'CAPTCHA_FAILED',
    })
  }

  // Anti-bot capa 2: rechazar emails desechables / dominios de prueba
  // (example.com, temp-mail, .local/.test, …). El bot del abuso usó justamente
  // userNNNN@example.com y temp-mail, que además nunca pueden verificar.
  if (isDisposableEmail(email)) {
    log.warn('register.disposable_email', { email: String(email).toLowerCase(), ip: req.ip })
    return res.status(400).json({
      error: 'Usa un correo electrónico real. No se permiten correos temporales o de prueba.',
      code:  'DISPOSABLE_EMAIL',
    })
  }

  // Email canónico: colapsa variantes de la misma bandeja (Gmail +/. y
  // subdirecciones) para que el chequeo de duplicado y la auto-purga no se
  // puedan evadir con colon+1@gmail.com, c.o.l.o.n@gmail.com, etc. Se almacena
  // y se notifica a esta forma (entregable al mismo inbox).
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return res.status(400).json({ error: 'Correo electrónico no válido' })
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
      runWithBypass(() => prisma.user.findUnique({ where: { email: normalizedEmail } })),
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
          ownerEmail:    normalizedEmail,
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

      // 3.6. Categorías de gastos operativos default. Permite al cajero
      // empezar a registrar gastos desde el TPV sin pasar por admin. El
      // user puede agregar/quitar las suyas después en /admin.
      const DEFAULT_EXPENSE_CATEGORIES = [
        { name: 'LUZ',              icon: '💡', color: '#fbbf24' },
        { name: 'AGUA',             icon: '💧', color: '#3b82f6' },
        { name: 'INTERNET',         icon: '📡', color: '#06b6d4' },
        { name: 'GAS',              icon: '🔥', color: '#f97316' },
        { name: 'MANTENIMIENTO',    icon: '🔧', color: '#6b7280' },
        { name: 'SUELDOS',          icon: '💼', color: '#a16207' },
        { name: 'PROPINAS_PAGADAS', icon: '🪙', color: '#84cc16' },
        { name: 'OTROS',            icon: '📝', color: '#9ca3af' },
      ];
      await tx.operatingExpenseCategory.createMany({
        data: DEFAULT_EXPENSE_CATEGORIES.map(c => ({ ...c, restaurantId: r.id })),
        skipDuplicates: true,
      });

      // 4. User ADMIN ligado a Tenant + Restaurant
      const u = await tx.user.create({
        data: {
          tenantId:     t.id,
          restaurantId: r.id,
          name:         ownerName,
          email:        normalizedEmail,
          passwordHash,
          role:         'ADMIN',
          isActive:     true,
        }
      })

      // 5. Employee ADMIN default para el TPV (PIN 1234)
      // Esto permite que el dueño pueda entrar al TPV inmediatamente tras registrarse.
      const defaultPin = "1234";
      const pinHash = await bcrypt.hash(defaultPin, 10);
      const offlinePin = crypto.createHash('sha256').update(defaultPin).digest('hex');

      await tx.employee.create({
        data: {
          locationId: loc.id,
          name:       ownerName,
          pin:        pinHash,
          offlinePin: offlinePin,
          role:       'ADMIN',
          isActive:   true,
          canCharge: true, canDiscount: true, canModifyTickets: true, canDeleteTickets: true,
          canConfigSystem: true, canTakeDelivery: true, canTakeTakeout: true, canManageShifts: true,
          canCancelItems: true, canApplyDiscounts: true, canReopenTables: true, canManageUsers: true
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

    log.info('register.tenant.ok', {
      tenantId: tenant.id,
      restaurantId: restaurant.id,
      userId: user.id,
      locationId: location?.id || null,
      planId: plan.id,
      planName: plan.name,
      email: normalizedEmail,
    })

    // Enviar email (sin bloquear la respuesta)
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3002'}/verify-email?token=${verificationToken}`
    sendEmail(
      normalizedEmail,
      `Verifica tu cuenta de ${restaurantName} — MRTPVREST`,
      verificationEmailHtml(ownerName, restaurantName, verifyUrl)
    ).catch(err => log.error('register.email.failed', { tenantId: tenant.id, err }))

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
    log.error('register.tenant.failed', { err: e, email: req.body?.email })
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
router.post('/resend-verification', resendVerifyLimiter, authenticate, async (req, res) => {
  try {
    const user = await runWithBypass(() => prisma.user.findUnique({
      where: { id: req.user.id },
      include: { tenant: true }
    }))
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
router.post('/refresh', refreshLimiter, async (req, res) => {
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

    const user = await runWithBypass(() => prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, restaurantId: true, tenantId: true, isActive: true }
    }))
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
    const user = await runWithBypass(() => prisma.user.findUnique({ where: { id: req.user.id } }))
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
