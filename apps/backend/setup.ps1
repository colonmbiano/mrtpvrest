# setup.ps1 — Crea toda la estructura faltante
# Ejecutar desde la carpeta backend/: powershell -ExecutionPolicy Bypass -File setup.ps1

Write-Host "🔧 Creando estructura de carpetas..." -ForegroundColor Cyan

# Crear carpetas
New-Item -ItemType Directory -Force -Path "src\routes"    | Out-Null
New-Item -ItemType Directory -Force -Path "src\services"  | Out-Null
New-Item -ItemType Directory -Force -Path "src\middleware" | Out-Null
New-Item -ItemType Directory -Force -Path "src\utils"     | Out-Null

# Mover archivos sueltos a sus carpetas
if (Test-Path "src\orders.routes.js")      { Move-Item -Force "src\orders.routes.js"      "src\routes\orders.routes.js" }
if (Test-Path "src\loyverse.service.js")   { Move-Item -Force "src\loyverse.service.js"   "src\services\loyverse.service.js" }
if (Test-Path "src\printer.service.js")    { Move-Item -Force "src\printer.service.js"    "src\services\printer.service.js" }
if (Test-Path "src\whatsapp.service.js")   { Move-Item -Force "src\whatsapp.service.js"   "src\services\whatsapp.service.js" }

Write-Host "📁 Carpetas y archivos movidos" -ForegroundColor Green

# ── src/utils/prisma.js ───────────────────────────────────────────────────
@'
const { PrismaClient } = require('@prisma/client')
const globalForPrisma = global
const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
module.exports = prisma
'@ | Set-Content "src\utils\prisma.js" -Encoding UTF8
Write-Host "✅ src/utils/prisma.js" -ForegroundColor Green

# ── src/middleware/auth.middleware.js ─────────────────────────────────────
@'
const jwt    = require('jsonwebtoken')
const prisma = require('../utils/prisma')

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token de acceso requerido' })
    }
    const token = authHeader.split(' ')[1]
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' })
    }
    req.user = user
    next()
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Token invalido' })
  }
}

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso restringido a administradores' })
  }
  next()
}

const requireKitchenOrAdmin = (req, res, next) => {
  if (!['ADMIN', 'KITCHEN'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acceso restringido' })
  }
  next()
}

module.exports = { authenticate, requireAdmin, requireKitchenOrAdmin }
'@ | Set-Content "src\middleware\auth.middleware.js" -Encoding UTF8
Write-Host "✅ src/middleware/auth.middleware.js" -ForegroundColor Green

# ── src/services/loyalty.service.js ──────────────────────────────────────
@'
const prisma = require('../utils/prisma')

const TIERS = [
  { name: 'GOLD',   min: 1500 },
  { name: 'SILVER', min: 500  },
  { name: 'BRONZE', min: 0    },
]

function getTier(totalEarned) {
  return TIERS.find(t => totalEarned >= t.min)?.name || 'BRONZE'
}

async function addLoyaltyPoints(userId, order) {
  try {
    const config = await prisma.restaurantConfig.findUnique({ where: { id: 'main' } })
    const pointsPerTen = config?.pointsPerTen || 1
    const base = order.subtotal - order.discount
    const pointsEarned = Math.floor(base / 10) * pointsPerTen
    if (pointsEarned <= 0) return
    const loyalty = await prisma.loyaltyAccount.findUnique({ where: { userId } })
    if (!loyalty) return
    const newTotal = loyalty.totalEarned + pointsEarned
    const newTier  = getTier(newTotal)
    await prisma.$transaction([
      prisma.loyaltyAccount.update({
        where: { userId },
        data: { points: { increment: pointsEarned }, totalEarned: { increment: pointsEarned }, tier: newTier },
      }),
      prisma.loyaltyTransaction.create({
        data: {
          account:     { connect: { userId } },
          type:        'EARNED',
          points:      pointsEarned,
          description: `Puntos por pedido ${order.orderNumber}`,
          orderId:     order.id,
        },
      }),
      prisma.order.update({ where: { id: order.id }, data: { pointsEarned } }),
    ])
    console.log(`Puntos agregados: ${pointsEarned} a usuario ${userId}`)
  } catch (error) {
    console.error('Error al agregar puntos:', error)
  }
}

module.exports = { addLoyaltyPoints, getTier }
'@ | Set-Content "src\services\loyalty.service.js" -Encoding UTF8
Write-Host "✅ src/services/loyalty.service.js" -ForegroundColor Green

# ── src/routes/auth.routes.js ─────────────────────────────────────────────
@'
const express    = require('express')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const { z }      = require('zod')
const prisma     = require('../utils/prisma')
const { authenticate } = require('../middleware/auth.middleware')
const rateLimit  = require('express-rate-limit')

const router = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
})

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' })
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
  return { accessToken, refreshToken }
}

const RegisterSchema = z.object({
  name:     z.string().min(2),
  email:    z.string().email(),
  phone:    z.string().optional(),
  password: z.string().min(8),
})

router.post('/register', async (req, res) => {
  try {
    const data = RegisterSchema.parse(req.body)
    const exists = await prisma.user.findFirst({ where: { email: data.email } })
    if (exists) return res.status(409).json({ error: 'El email ya esta registrado' })
    const passwordHash = await bcrypt.hash(data.password, 12)
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({ data: { name: data.name, email: data.email, phone: data.phone, passwordHash } })
      await tx.loyaltyAccount.create({ data: { userId: newUser.id, qrCode: `QR-${newUser.id.slice(-8).toUpperCase()}` } })
      return newUser
    })
    const { accessToken, refreshToken } = generateTokens(user.id)
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30*24*60*60*1000) } })
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken })
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Datos invalidos', details: error.errors })
    console.error(error)
    res.status(500).json({ error: 'Error al crear la cuenta' })
  }
})

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email y contrasena requeridos' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.isActive) return res.status(401).json({ error: 'Credenciales incorrectas' })
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' })
    const { accessToken, refreshToken } = generateTokens(user.id)
    await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + 30*24*60*60*1000) } })
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken, refreshToken })
  } catch (error) {
    res.status(500).json({ error: 'Error al iniciar sesion' })
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' })
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) return res.status(401).json({ error: 'Token invalido o expirado' })
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const tokens  = generateTokens(payload.userId)
    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({ data: { token: tokens.refreshToken, userId: payload.userId, expiresAt: new Date(Date.now() + 30*24*60*60*1000) } })
    res.json(tokens)
  } catch (error) {
    res.status(401).json({ error: 'Token invalido' })
  }
})

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true,
        loyalty: { select: { points: true, tier: true, qrCode: true, totalEarned: true } },
      },
    })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener perfil' })
  }
})

router.post('/logout', authenticate, async (req, res) => {
  try {
    const { refreshToken } = req.body
    if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } })
    res.json({ message: 'Sesion cerrada' })
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar sesion' })
  }
})

module.exports = router
'@ | Set-Content "src\routes\auth.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/auth.routes.js" -ForegroundColor Green

# ── src/routes/menu.routes.js ─────────────────────────────────────────────
@'
const express  = require('express')
const prisma   = require('../utils/prisma')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const axios    = require('axios')
const router   = express.Router()

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
    res.json(categories)
  } catch (e) { res.status(500).json({ error: 'Error al obtener categorias' }) }
})

router.get('/items', async (req, res) => {
  try {
    const { categoryId } = req.query
    const where = { isAvailable: true }
    if (categoryId) where.categoryId = categoryId
    const items = await prisma.menuItem.findMany({
      where,
      include: { category: { select: { id: true, name: true } }, modifierGroups: { include: { modifiers: true } } },
      orderBy: [{ isPopular: 'desc' }, { name: 'asc' }],
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: 'Error al obtener menu' }) }
})

router.get('/items/:id', async (req, res) => {
  try {
    const item = await prisma.menuItem.findUnique({
      where: { id: req.params.id },
      include: { category: true, modifierGroups: { include: { modifiers: true } } },
    })
    if (!item) return res.status(404).json({ error: 'Platillo no encontrado' })
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al obtener platillo' }) }
})

router.post('/items', authenticate, requireAdmin, async (req, res) => {
  try {
    const { categoryId, name, description, imageUrl, price, preparationTime, isPopular } = req.body
    if (!categoryId || !name || price === undefined) return res.status(400).json({ error: 'Faltan campos requeridos' })
    const item = await prisma.menuItem.create({
      data: { categoryId, name, description, imageUrl, price: parseFloat(price), preparationTime: preparationTime || 15, isPopular: isPopular || false },
    })
    res.status(201).json(item)
  } catch (e) { res.status(500).json({ error: 'Error al crear platillo' }) }
})

router.put('/items/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, price, isAvailable, isPopular, imageUrl } = req.body
    const item = await prisma.menuItem.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isPopular !== undefined && { isPopular }),
        ...(imageUrl !== undefined && { imageUrl }),
      },
    })
    res.json(item)
  } catch (e) { res.status(500).json({ error: 'Error al actualizar platillo' }) }
})

router.post('/sync-loyverse', authenticate, requireAdmin, async (req, res) => {
  try {
    const headers = { Authorization: `Bearer ${process.env.LOYVERSE_API_TOKEN}` }
    const base = 'https://api.loyverse.com/v1.0'
    const { data: catData } = await axios.get(`${base}/categories`, { headers })
    let synced = { categories: 0, items: 0 }
    for (const cat of (catData.categories || [])) {
      await prisma.category.upsert({ where: { loyverseId: cat.id }, create: { name: cat.name, loyverseId: cat.id }, update: { name: cat.name } })
      synced.categories++
    }
    const { data: itemData } = await axios.get(`${base}/items`, { headers })
    for (const item of (itemData.items || [])) {
      const category = item.category_id ? await prisma.category.findUnique({ where: { loyverseId: item.category_id } }) : null
      if (category) {
        const price = item.variants?.[0]?.default_price || 0
        await prisma.menuItem.upsert({
          where: { loyverseId: item.id },
          create: { name: item.item_name, description: item.description, price: parseFloat(price), categoryId: category.id, loyverseId: item.id },
          update: { name: item.item_name, price: parseFloat(price) },
        })
        synced.items++
      }
    }
    res.json({ message: 'Sync con Loyverse completado', synced })
  } catch (e) {
    res.status(500).json({ error: 'Error al sincronizar con Loyverse', detail: e.message })
  }
})

module.exports = router
'@ | Set-Content "src\routes\menu.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/menu.routes.js" -ForegroundColor Green

# ── src/routes/loyalty.routes.js ─────────────────────────────────────────
@'
const express = require('express')
const prisma  = require('../utils/prisma')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router  = express.Router()

router.get('/points', authenticate, async (req, res) => {
  try {
    const loyalty = await prisma.loyaltyAccount.findUnique({
      where: { userId: req.user.id },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    })
    if (!loyalty) return res.status(404).json({ error: 'Cuenta de lealtad no encontrada' })
    res.json(loyalty)
  } catch (e) { res.status(500).json({ error: 'Error al obtener puntos' }) }
})

router.post('/coupon/validate', authenticate, async (req, res) => {
  try {
    const { code, orderAmount } = req.body
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } })
    if (!coupon || !coupon.isActive) return res.status(404).json({ error: 'Cupon no valido' })
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return res.status(400).json({ error: 'Cupon expirado' })
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Cupon agotado' })
    if (orderAmount < coupon.minOrderAmount) return res.status(400).json({ error: `Minimo $${coupon.minOrderAmount}` })
    const discount = coupon.discountType === 'PERCENTAGE' ? orderAmount * (coupon.discountValue / 100) : coupon.discountValue
    res.json({ valid: true, coupon: { id: coupon.id, code: coupon.code }, discountMXN: discount })
  } catch (e) { res.status(500).json({ error: 'Error al validar cupon' }) }
})

router.get('/customers', authenticate, requireAdmin, async (req, res) => {
  try {
    const accounts = await prisma.loyaltyAccount.findMany({
      orderBy: { totalEarned: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    })
    res.json(accounts)
  } catch (e) { res.status(500).json({ error: 'Error al obtener clientes' }) }
})

router.post('/coupons', authenticate, requireAdmin, async (req, res) => {
  try {
    const { code, description, discountType, discountValue, minOrderAmount, maxUses, expiresAt } = req.body
    const coupon = await prisma.coupon.create({
      data: { code: code.toUpperCase(), description, discountType, discountValue: parseFloat(discountValue), minOrderAmount: parseFloat(minOrderAmount || 0), maxUses: maxUses || null, expiresAt: expiresAt ? new Date(expiresAt) : null },
    })
    res.status(201).json(coupon)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'El codigo de cupon ya existe' })
    res.status(500).json({ error: 'Error al crear cupon' })
  }
})

module.exports = router
'@ | Set-Content "src\routes\loyalty.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/loyalty.routes.js" -ForegroundColor Green

# ── src/routes/payments.routes.js ────────────────────────────────────────
@'
const express = require('express')
const prisma  = require('../utils/prisma')
const router  = express.Router()

router.post('/webhook', async (req, res) => {
  try {
    const event = req.body
    if (event.type === 'order.paid') {
      await prisma.order.updateMany({ where: { conektaOrderId: event.data.object.id }, data: { paymentStatus: 'PAID' } })
    }
    res.json({ received: true })
  } catch (e) { res.status(500).json({ error: 'Error en webhook' }) }
})

module.exports = router
'@ | Set-Content "src\routes\payments.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/payments.routes.js" -ForegroundColor Green

# ── src/routes/reports.routes.js ─────────────────────────────────────────
@'
const express = require('express')
const prisma  = require('../utils/prisma')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router  = express.Router()

router.get('/sales', authenticate, requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query
    const where = { status: { not: 'CANCELLED' } }
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to)   where.createdAt.lte = new Date(to)
    }
    const summary = await prisma.order.aggregate({ where, _sum: { total: true, discount: true }, _count: { id: true }, _avg: { total: true } })
    res.json({ totalRevenue: summary._sum.total || 0, totalOrders: summary._count.id || 0, averageTicket: summary._avg.total || 0 })
  } catch (e) { res.status(500).json({ error: 'Error al generar reporte' }) }
})

router.get('/top-items', authenticate, requireAdmin, async (req, res) => {
  try {
    const items = await prisma.orderItem.groupBy({
      by: ['name'], _sum: { quantity: true, subtotal: true }, orderBy: { _sum: { quantity: 'desc' } }, take: 10,
    })
    res.json(items)
  } catch (e) { res.status(500).json({ error: 'Error al obtener top platillos' }) }
})

module.exports = router
'@ | Set-Content "src\routes\reports.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/reports.routes.js" -ForegroundColor Green

# ── src/routes/admin.routes.js ───────────────────────────────────────────
@'
const express = require('express')
const prisma  = require('../utils/prisma')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const router  = express.Router()

router.get('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const config = await prisma.restaurantConfig.findUnique({ where: { id: 'main' } })
    res.json(config || {})
  } catch (e) { res.status(500).json({ error: 'Error al obtener configuracion' }) }
})

router.put('/config', authenticate, requireAdmin, async (req, res) => {
  try {
    const config = await prisma.restaurantConfig.upsert({ where: { id: 'main' }, create: { id: 'main', name: 'Mi Restaurante', ...req.body }, update: req.body })
    res.json(config)
  } catch (e) { res.status(500).json({ error: 'Error al guardar configuracion' }) }
})

router.patch('/toggle', authenticate, requireAdmin, async (req, res) => {
  try {
    const current = await prisma.restaurantConfig.findUnique({ where: { id: 'main' } })
    const config  = await prisma.restaurantConfig.update({ where: { id: 'main' }, data: { isOpen: !current?.isOpen } })
    res.json({ isOpen: config.isOpen })
  } catch (e) { res.status(500).json({ error: 'Error al cambiar estado' }) }
})

module.exports = router
'@ | Set-Content "src\routes\admin.routes.js" -Encoding UTF8
Write-Host "✅ src/routes/admin.routes.js" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Todo listo! Ahora ejecuta: npm run dev" -ForegroundColor Yellow
