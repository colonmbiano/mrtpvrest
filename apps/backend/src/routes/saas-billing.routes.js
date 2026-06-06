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
const {
  getBillingCurrency,
  createMercadoPagoSubscriptionCheckout,
  getMercadoPagoSubscriptionUrl,
  verifyMercadoPagoWebhook,
  handleMercadoPagoWebhook,
} = require('../lib/saas-mercadopago')

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
    mpSuccess: process.env.MERCADOPAGO_SUBSCRIPTION_BACK_URL || `${base}/admin/billing?status=success`,
  }
  return map[kind]
}

function getBillingProvider() {
  const configured = String(process.env.SAAS_BILLING_PROVIDER || '').trim().toUpperCase()
  if (configured === 'MERCADOPAGO' || configured === 'STRIPE') return configured
  // Solo auto-seleccionar Mercado Pago si existe un token DEDICADO de billing
  // SaaS (MERCADOPAGO_ACCESS_TOKEN). NO usar MP_ACCESS_TOKEN genérico: ese se
  // usa para cobrar pedidos del kiosko/tienda y su sola presencia no debe
  // desviar las suscripciones SaaS de Stripe a Mercado Pago.
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) return 'MERCADOPAGO'
  return 'STRIPE'
}

router.post('/mercadopago/webhook', async (req, res) => {
  if (!verifyMercadoPagoWebhook({ headers: req.headers, query: req.query || {} })) {
    return res.status(401).json({ error: 'Mercado Pago webhook signature invalid' })
  }

  try {
    const result = await handleMercadoPagoWebhook(req.body || {})
    return res.status(200).json(result)
  } catch (err) {
    console.error('[billing-mp-webhook] handler error:', err)
    return res.status(500).json({ error: 'handler failed' })
  }
})

// ── POST /checkout ────────────────────────────────────────────────────────
router.post('/checkout', authenticate, requireAdmin, async (req, res) => {
  const tenantId = getTenantId(req)
  if (!tenantId) return res.status(400).json({ error: 'Tenant no resuelto para el usuario' })

  const { planId } = req.body || {}
  if (!planId) return res.status(400).json({ error: 'planId requerido' })

  try {
    const provider = getBillingProvider()
    const result = provider === 'MERCADOPAGO'
      ? await createMercadoPagoSubscriptionCheckout({
          tenantId,
          planId,
          successUrl: resolveUrl('mpSuccess', req),
        })
      : await createSubscriptionCheckout({
          tenantId,
          planId,
          successUrl: resolveUrl('success', req),
          cancelUrl:  resolveUrl('cancel', req),
        })
    if (result.error) return res.status(400).json({ error: result.error })
    return res.json({ url: result.url, sessionId: result.sessionId, provider })
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
    // El portal debe abrirse con el gateway con el que se contrató la
    // suscripción del tenant, NO con el provider global por defecto. Así un
    // suscriptor Stripe existente conserva su portal aunque la plataforma haya
    // cambiado el provider por defecto a Mercado Pago (y viceversa).
    const subscription = await prisma.subscription.findUnique({
      where: { tenantId },
      select: { paymentGateway: true },
    })
    const provider = subscription?.paymentGateway || getBillingProvider()
    const { url } = provider === 'MERCADOPAGO'
      ? await getMercadoPagoSubscriptionUrl({ tenantId })
      : await createBillingPortalSession({
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

  const billingProvider = getBillingProvider()
  return res.json({
    tenant,
    subscription,
    billingProvider,
    // Los precios de los planes están en MXN para ambos proveedores.
    billingCurrency: getBillingCurrency(),
  })
})

module.exports = router
