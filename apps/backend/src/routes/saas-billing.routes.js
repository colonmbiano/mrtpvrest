// routes/saas-billing.routes.js
//
// Endpoints B2B SaaS billing:
//   POST /api/saas/billing/checkout  → crea Checkout Session (mode: subscription)
//   POST /api/saas/billing/portal    → URL del Stripe Billing Portal
//   GET  /api/saas/billing/status    → estado local de la suscripción del tenant
//
// Webhook (público, raw body) va en saas-billing-webhook.routes.js y se monta
// ANTES de express.json() en src/index.js.
const express = require('express')
const { prisma } = require('@mrtpvrest/database')
const { authenticate, requireAdmin } = require('../middleware/auth.middleware')
const {
  createSubscriptionCheckout,
  createBillingPortalSession,
} = require('../lib/saas-stripe')

const router = express.Router()

function getTenantId(req) {
  return (
    req.user?.tenantId ||
    req.restaurant?.tenantId ||
    req.tenant?.id ||
    null
  )
}

function resolveUrl(kind, req) {
  const base = process.env.FRONTEND_URL || 'http://localhost:3002'
  const map = {
    success: process.env.STRIPE_CHECKOUT_SUCCESS_URL || `${base}/billing?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel:  process.env.STRIPE_CHECKOUT_CANCEL_URL  || `${base}/billing?status=cancel`,
    portal:  process.env.STRIPE_BILLING_PORTAL_RETURN_URL || `${base}/billing`,
  }
  return map[kind]
}

// ── POST /checkout ────────────────────────────────────────────────────────
router.post('/checkout', authenticate, requireAdmin, async (req, res) => {
  const tenantId = getTenantId(req)
  if (!tenantId) return res.status(400).json({ error: 'Tenant no resuelto para el usuario' })

  const { planId } = req.body || {}
  if (!planId) return res.status(400).json({ error: 'planId requerido' })

  try {
    const result = await createSubscriptionCheckout({
      tenantId,
      planId,
      successUrl: resolveUrl('success', req),
      cancelUrl:  resolveUrl('cancel', req),
    })
    if (result.error) return res.status(400).json({ error: result.error })
    return res.json({ url: result.url, sessionId: result.sessionId })
  } catch (err) {
    console.error('[billing] checkout error:', err)
    return res.status(500).json({ error: 'No se pudo crear checkout', detail: err.message })
  }
})

// ── POST /portal ──────────────────────────────────────────────────────────
router.post('/portal', authenticate, requireAdmin, async (req, res) => {
  const tenantId = getTenantId(req)
  if (!tenantId) return res.status(400).json({ error: 'Tenant no resuelto para el usuario' })

  try {
    const { url } = await createBillingPortalSession({
      tenantId,
      returnUrl: resolveUrl('portal', req),
    })
    return res.json({ url })
  } catch (err) {
    console.error('[billing] portal error:', err)
    return res.status(500).json({ error: 'No se pudo abrir billing portal', detail: err.message })
  }
})

// ── GET /status ───────────────────────────────────────────────────────────
router.get('/status', authenticate, async (req, res) => {
  const tenantId = getTenantId(req)
  if (!tenantId) return res.status(400).json({ error: 'Tenant no resuelto para el usuario' })

  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, stripeCustomerId: true, ownerEmail: true },
    }),
    prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { select: { id: true, name: true, displayName: true, price: true, stripePriceId: true } } },
    }),
  ])

  return res.json({ tenant, subscription })
})

module.exports = router
