// routes/kiosk-webhook.routes.js — Webhooks públicos de pasarelas de pago
// Montado sin tenantMiddleware para que las pasarelas puedan notificar sin
// mandar x-restaurant-id. Cada pasarela resuelve el restaurante a partir
// del external_reference / client_reference_id del pago.
const express = require('express')
const router  = express.Router()
const { prisma } = require('@mrtpvrest/database')
const { getProviderForRestaurant } = require('../lib/payment-providers')

async function applyPaymentResult(orderId, { status, rawStatus, providerId }, io) {
  const order = await prisma.order.findUnique({ where: { id: orderId } })
  if (!order) return

  let orderStatus = order.status
  if (status === 'PAID')   orderStatus = 'CONFIRMED'

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentProviderId:     providerId,
      paymentProviderStatus: rawStatus,
      paymentStatus:         status,
      status:                orderStatus,
      paidAt: status === 'PAID' ? new Date() : undefined,
    },
  })

  if (io && status === 'PAID') {
    io.to(`restaurant:${order.restaurantId}`).emit('order:paid', { orderId, source: 'KIOSK' })
    io.to(`restaurant:${order.restaurantId}`).emit('new:order',  { orderId, source: 'KIOSK' })
  }
}

// ─── POST /api/kiosk/webhook/mercadopago ────────────────────────────────────
router.post('/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body
    if (type !== 'payment' || !data?.id) return res.status(200).json({ received: true })

    // MP no manda el external_reference en el webhook — hay que consultar el pago
    // primero. Usamos un provider temporal con cualquier token válido para
    // averiguar el orderId, luego usamos el provider del restaurante real.
    // Si el restaurante tiene su propio MP, lo ideal es buscar por pref→order.
    // Estrategia: intentamos con el primer restaurante que tenga la preference
    // asociada (si guardamos paymentProviderRef = preference.id al crear la orden,
    // podemos relacionar, pero MP webhook solo manda payment.id no preference.id).
    //
    // Solución: se hace lookup genérico con el env var MP_ACCESS_TOKEN como
    // fallback, o con el primer MP habilitado. Luego re-verificamos con el
    // token del restaurante real.

    // 1. Consulta inicial del pago con cualquier MP disponible
    const fallback = await prisma.integrationConfig.findFirst({
      where: { type: 'MERCADOPAGO', enabled: true },
    })
    if (!fallback) return res.status(200).json({ received: true })

    const { instantiateFromIntegration } = require('../lib/payment-providers')
    const tempProvider = instantiateFromIntegration(fallback)
    const firstLookup  = await tempProvider.getPayment(data.id)
    const orderId      = firstLookup.externalReference
    if (!orderId) return res.status(200).json({ received: true })

    // 2. Re-verificar con el provider del restaurante dueño
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(200).json({ received: true })

    const restaurantProvider = await getProviderForRestaurant(order.restaurantId, 'MERCADOPAGO')
    let verified = firstLookup
    if (restaurantProvider) {
      try {
        verified = await restaurantProvider.getPayment(data.id)
        if (verified.externalReference !== orderId) {
          return res.status(200).json({ received: true })
        }
      } catch (_) {
        // sigue con firstLookup
      }
    }

    await applyPaymentResult(orderId, verified, req.app.get('io'))
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[kiosk-webhook:mercadopago] error:', err)
    res.status(200).json({ received: true })
  }
})

// ─── POST /api/kiosk/webhook/stripe ─────────────────────────────────────────
router.post('/stripe', async (req, res) => {
  try {
    const event = req.body
    const relevantTypes = [
      'checkout.session.completed',
      'checkout.session.async_payment_succeeded',
      'checkout.session.async_payment_failed',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
    ]
    if (!relevantTypes.includes(event?.type)) return res.status(200).json({ received: true })

    const session = event.data?.object ?? {}
    const orderId = session.client_reference_id || session.metadata?.orderId
    if (!orderId) return res.status(200).json({ received: true })

    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return res.status(200).json({ received: true })

    const provider = await getProviderForRestaurant(order.restaurantId, 'STRIPE')
    if (!provider) return res.status(200).json({ received: true })

    const lookupId = session.payment_intent || session.id
    const result   = await provider.getPayment(lookupId).catch(() => null)
    if (!result || result.externalReference !== orderId) {
      return res.status(200).json({ received: true })
    }

    await applyPaymentResult(orderId, result, req.app.get('io'))
    res.status(200).json({ received: true })
  } catch (err) {
    console.error('[kiosk-webhook:stripe] error:', err)
    res.status(200).json({ received: true })
  }
})

module.exports = router
