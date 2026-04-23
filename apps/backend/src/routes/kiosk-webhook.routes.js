// routes/kiosk-webhook.routes.js — Webhook público de MercadoPago (sin tenant middleware)
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { MercadoPagoConfig, Payment } = require('mercadopago')

async function getMPClientForRestaurant(restaurantId) {
  const integration = await prisma.integrationConfig.findUnique({
    where: { restaurantId_type: { restaurantId, type: 'MERCADOPAGO' } },
  })

  let accessToken = null
  if (integration?.enabled && integration.config) {
    try {
      const cfg = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config
      accessToken = cfg.accessToken || null
    } catch (_) {}
  }

  if (!accessToken) accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MercadoPago no configurado')

  return new MercadoPagoConfig({ accessToken })
}

router.post('/', async (req, res) => {
  try {
    const { type, data } = req.body

    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ received: true })
    }

    // Para buscar el pago necesitamos un token MP. Intentamos con el env var
    // global primero; si falla, buscamos el restaurante por external_reference.
    let mpClient
    try {
      mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN || '' })
    } catch (_) {
      return res.status(200).json({ received: true })
    }

    const paymentClient = new Payment(mpClient)
    const payment = await paymentClient.get({ id: data.id })

    const orderId     = payment.external_reference
    const mpStatus    = payment.status
    const mpPaymentId = String(payment.id)

    if (!orderId) return res.status(200).json({ received: true })

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(200).json({ received: true })

    // Si hay un token configurado por restaurante, lo usamos para re-verificar
    try {
      const restaurantClient = await getMPClientForRestaurant(order.restaurantId)
      if (restaurantClient) {
        const verifiedPayment = await new Payment(restaurantClient).get({ id: data.id })
        if (verifiedPayment.external_reference !== orderId) {
          return res.status(200).json({ received: true })
        }
      }
    } catch (_) {
      // Continúa con la info ya obtenida
    }

    let paymentStatus = 'PENDING'
    let orderStatus   = order.status

    if (mpStatus === 'approved') {
      paymentStatus = 'PAID'
      orderStatus   = 'CONFIRMED'
    } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
      paymentStatus = 'FAILED'
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        mpPaymentId,
        mpStatus,
        paymentStatus,
        status: orderStatus,
        paidAt: mpStatus === 'approved' ? new Date() : undefined,
      },
    })

    const io = req.app.get('io')
    if (io && mpStatus === 'approved') {
      io.to(`restaurant:${order.restaurantId}`).emit('order:paid', { orderId, source: 'KIOSK' })
      io.to(`restaurant:${order.restaurantId}`).emit('new:order',  { orderId, source: 'KIOSK' })
    }

    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[kiosk-webhook] error:', err)
    res.status(200).json({ received: true })
  }
})

module.exports = router
