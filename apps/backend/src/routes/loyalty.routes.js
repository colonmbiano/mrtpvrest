const express = require('express')
const prisma  = require('@mrtpvrest/database').prisma
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
