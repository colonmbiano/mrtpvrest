// routes/kiosk-webhook.routes.js — Webhook público de MercadoPago (sin tenant middleware)
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { MercadoPagoConfig, Payment } = require('mercadopago')

function getMPClient() {
  if (!process.env.MP_ACCESS_TOKEN) throw new Error('MP_ACCESS_TOKEN no configurado')
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
}

router.post('/', async (req, res) => {
  try {
    const { type, data } = req.body

    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ received: true })
    }

    const mp = getMPClient()
    const paymentClient = new Payment(mp)
    const payment = await paymentClient.get({ id: data.id })

    const orderId     = payment.external_reference
    const mpStatus    = payment.status
    const mpPaymentId = String(payment.id)

    if (!orderId) return res.status(200).json({ received: true })

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(200).json({ received: true })

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

    // Notificar cocina
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
