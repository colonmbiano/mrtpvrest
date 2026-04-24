// routes/saas-billing-webhook.routes.js
//
// Webhook público de Stripe para suscripciones B2B SaaS.
//
// IMPORTANTE: se monta en src/index.js ANTES de express.json() con
// express.raw({ type: 'application/json' }) — la verificación de firma
// exige el body crudo exacto. Si se parsea como JSON antes, falla la
// verificación y todos los eventos se rechazan.
//
// Eventos MVP manejados:
//   · checkout.session.completed       → primera suscripción
//   · customer.subscription.updated    → cambios de plan / renovación / trial end
//   · customer.subscription.deleted    → cancelación definitiva
const express = require('express')
const {
  getStripe,
  verifyWebhook,
  upsertLocalSubscriptionFromStripe,
  markSubscriptionCancelled,
} = require('../lib/saas-stripe')

const router = express.Router()

router.post('/', async (req, res) => {
  const signature = req.headers['stripe-signature']
  if (!signature) return res.status(400).json({ error: 'Falta stripe-signature' })

  let event
  try {
    event = verifyWebhook(req.body, signature)
  } catch (err) {
    console.error('[billing-webhook] signature invalid:', err.message)
    return res.status(400).json({ error: 'Signature inválida' })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode !== 'subscription' || !session.subscription) break
        const stripe = getStripe()
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription)
        // Propagar metadata de la Session al sub si no estaba (safety net)
        if (!stripeSub.metadata?.tenantId && session.metadata?.tenantId) {
          stripeSub.metadata = { ...stripeSub.metadata, ...session.metadata }
        }
        await upsertLocalSubscriptionFromStripe(stripeSub)
        break
      }

      case 'customer.subscription.updated': {
        await upsertLocalSubscriptionFromStripe(event.data.object)
        break
      }

      case 'customer.subscription.deleted': {
        await markSubscriptionCancelled(event.data.object)
        break
      }

      default:
        // ignorados silenciosamente (invoice.*, payment_intent.*, etc.)
        break
    }
  } catch (err) {
    console.error('[billing-webhook] handler error for', event.type, err)
    // 500 para que Stripe reintente con backoff
    return res.status(500).json({ error: 'handler failed' })
  }

  return res.json({ received: true })
})

module.exports = router
