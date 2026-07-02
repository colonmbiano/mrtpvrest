const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware')
const { requireFeatureFlag } = require('../lib/modules')
const router  = express.Router()

// Gate: hasLoyalty del plan. Warn-only por default (ENFORCE_PLAN_FLAGS).
router.use(authenticate, requireTenantAccess, requireFeatureFlag('hasLoyalty', 'Loyalty / Puntos'))

router.get('/points', async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId
    if (!restaurantId) return res.status(400).json({ error: 'Usuario sin restaurante' })
    const loyalty = await prisma.loyaltyAccount.findUnique({
      where: { userId_restaurantId: { userId: req.user.id, restaurantId } },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 10 } },
    })
    if (!loyalty) return res.status(404).json({ error: 'Cuenta de lealtad no encontrada' })
    res.json(loyalty)
  } catch (e) { res.status(500).json({ error: 'Error al obtener puntos' }) }
})

router.post('/coupon/validate', async (req, res) => {
  try {
    const { code, orderAmount } = req.body
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } })
    if (!coupon || !coupon.isActive) return res.status(404).json({ error: 'Cupon no valido' })
    if (coupon.expiresAt && coupon.expiresAt < new Date()) return res.status(400).json({ error: 'Cupon expirado' })
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: 'Cupon agotado' })
    if (orderAmount < Number(coupon.minOrderAmount)) return res.status(400).json({ error: `Minimo $${Number(coupon.minOrderAmount)}` })
    // Number(): campos Decimal desde la Etapa 1 de la migración Float→Decimal.
    const discount = coupon.discountType === 'PERCENTAGE' ? orderAmount * (Number(coupon.discountValue) / 100) : Number(coupon.discountValue)
    res.json({ valid: true, coupon: { id: coupon.id, code: coupon.code }, discountMXN: discount })
  } catch (e) { res.status(500).json({ error: 'Error al validar cupon' }) }
})

router.get('/customers', requireAdmin, async (req, res) => {
  try {
    const accounts = await prisma.loyaltyAccount.findMany({
      where: { restaurantId: req.user.restaurantId },
      orderBy: { totalEarned: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } } },
    })
    res.json(accounts)
  } catch (e) { res.status(500).json({ error: 'Error al obtener clientes' }) }
})

// ── Recompensas (Fase 3): catálogo canjeable por puntos ───────────────────
// Una recompensa otorga producto gratis (menuItemId) O descuento fijo en $
// (discountAmount) — exactamente uno. El canje real vive en el checkout web
// (store.routes.js /orders, param redeemRewardId).

function normalizeRewardBody(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const description = typeof body.description === 'string' ? (body.description.trim() || null) : null
  const pointsCost = Math.floor(Number(body.pointsCost))
  const menuItemId = typeof body.menuItemId === 'string' && body.menuItemId ? body.menuItemId : null
  const rawDiscount = body.discountAmount != null && body.discountAmount !== '' ? Number(body.discountAmount) : null
  const discountAmount = rawDiscount != null && Number.isFinite(rawDiscount) && rawDiscount > 0
    ? Math.round(rawDiscount * 100) / 100
    : null
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Math.floor(Number(body.sortOrder)) : 0
  const isActive = body.isActive === undefined ? true : Boolean(body.isActive)

  if (!name) return { error: 'Nombre requerido' }
  if (!Number.isFinite(pointsCost) || pointsCost <= 0) return { error: 'pointsCost debe ser un entero > 0' }
  if (!menuItemId && discountAmount == null) return { error: 'La recompensa debe dar un producto (menuItemId) o un descuento (discountAmount)' }
  if (menuItemId && discountAmount != null) return { error: 'Producto y descuento son excluyentes: manda solo uno' }
  return { data: { name, description, pointsCost, menuItemId, discountAmount, sortOrder, isActive } }
}

router.get('/rewards', requireAdmin, async (req, res) => {
  try {
    const rewards = await prisma.loyaltyReward.findMany({
      where: { restaurantId: req.user.restaurantId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { menuItem: { select: { id: true, name: true, price: true } } },
    })
    res.json(rewards)
  } catch (e) { res.status(500).json({ error: 'Error al obtener recompensas' }) }
})

router.post('/rewards', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId
    const norm = normalizeRewardBody(req.body || {})
    if (norm.error) return res.status(400).json({ error: norm.error })
    if (norm.data.menuItemId) {
      const mi = await prisma.menuItem.findFirst({ where: { id: norm.data.menuItemId, restaurantId } })
      if (!mi) return res.status(400).json({ error: 'El producto no pertenece a este restaurante' })
    }
    const reward = await prisma.loyaltyReward.create({ data: { ...norm.data, restaurantId } })
    res.status(201).json(reward)
  } catch (e) { res.status(500).json({ error: 'Error al crear recompensa' }) }
})

router.put('/rewards/:id', requireAdmin, async (req, res) => {
  try {
    const restaurantId = req.user.restaurantId
    const norm = normalizeRewardBody(req.body || {})
    if (norm.error) return res.status(400).json({ error: norm.error })
    if (norm.data.menuItemId) {
      const mi = await prisma.menuItem.findFirst({ where: { id: norm.data.menuItemId, restaurantId } })
      if (!mi) return res.status(400).json({ error: 'El producto no pertenece a este restaurante' })
    }
    const updated = await prisma.loyaltyReward.updateMany({
      where: { id: req.params.id, restaurantId },
      data: norm.data,
    })
    if (updated.count === 0) return res.status(404).json({ error: 'Recompensa no encontrada' })
    res.json(await prisma.loyaltyReward.findFirst({ where: { id: req.params.id, restaurantId } }))
  } catch (e) { res.status(500).json({ error: 'Error al actualizar recompensa' }) }
})

router.delete('/rewards/:id', requireAdmin, async (req, res) => {
  try {
    const deleted = await prisma.loyaltyReward.deleteMany({
      where: { id: req.params.id, restaurantId: req.user.restaurantId },
    })
    if (deleted.count === 0) return res.status(404).json({ error: 'Recompensa no encontrada' })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Error al eliminar recompensa' }) }
})

router.post('/coupons', requireAdmin, async (req, res) => {
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
