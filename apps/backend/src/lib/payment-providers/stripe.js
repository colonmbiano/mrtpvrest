// lib/payment-providers/stripe.js
//
// Implementación de Stripe vía Checkout Sessions. El SDK se carga lazy para
// no obligar a tener `stripe` instalado si no se usa esta pasarela.
const { PaymentProvider } = require('./base')

function lazyStripe(secretKey) {
  const Stripe = require('stripe')
  return new Stripe(secretKey, { apiVersion: '2024-06-20' })
}

function normalizeStatus(raw) {
  if (raw === 'succeeded' || raw === 'paid' || raw === 'complete') return 'PAID'
  if (raw === 'canceled' || raw === 'failed')                      return 'FAILED'
  if (raw === 'refunded')                                          return 'REFUNDED'
  return 'PENDING'
}

class StripeProvider extends PaymentProvider {
  static get key()    { return 'STRIPE' }
  static get label()  { return 'Stripe' }
  static get fields() { return ['secretKey', 'publicKey', 'webhookSecret'] }

  constructor(opts) {
    super(opts)
    if (!this.config?.secretKey) throw new Error('Stripe: falta secretKey')
    this.stripe = lazyStripe(this.config.secretKey)
  }

  async createCheckout({ order, items, backUrl, notificationUrl, currency = 'mxn' }) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id:  order.id,
      line_items: items.map(it => ({
        quantity: it.quantity,
        price_data: {
          currency,
          unit_amount: Math.round(it.unitPrice * 100),
          product_data: { name: it.title },
        },
      })),
      success_url: `${backUrl}?status=success&orderId=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${backUrl}?status=failure&orderId=${order.id}`,
      metadata:    { orderId: order.id, notificationUrl },
    })

    return {
      checkoutUrl: session.url,
      providerRef: session.id,
    }
  }

  async getPayment(sessionOrPaymentId) {
    // En Stripe el webhook envía normalmente session.id; resolvemos ambos.
    let session = null
    let paymentIntent = null

    if (sessionOrPaymentId.startsWith('cs_')) {
      session = await this.stripe.checkout.sessions.retrieve(sessionOrPaymentId, {
        expand: ['payment_intent'],
      })
      paymentIntent = session.payment_intent
    } else if (sessionOrPaymentId.startsWith('pi_')) {
      paymentIntent = await this.stripe.paymentIntents.retrieve(sessionOrPaymentId)
    }

    const status    = normalizeStatus(session?.payment_status || paymentIntent?.status)
    const rawStatus = session?.payment_status || paymentIntent?.status || 'unknown'

    return {
      status,
      rawStatus,
      externalReference: session?.client_reference_id || paymentIntent?.metadata?.orderId || null,
      providerId:        paymentIntent?.id || session?.id,
    }
  }

  verifyWebhook(rawBody, signature) {
    if (!this.config.webhookSecret) return null
    return this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret)
  }
}

module.exports = { StripeProvider }
