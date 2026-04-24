// lib/saas-stripe.js
//
// Motor de suscripciones B2B SaaS (MRTPVREST → Tenant).
// NO confundir con lib/payment-providers/stripe.js (ese cobra órdenes del
// kiosko a clientes finales, por-tenant con sus propias keys).
// Aquí se usa UNA cuenta Stripe central de MRTPVREST para los 3 planes.
const { prisma } = require('@mrtpvrest/database')

let _stripe = null
function getStripe() {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY no configurado — no se puede iniciar billing SaaS')
  }
  const Stripe = require('stripe')
  _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  return _stripe
}

// ── Mapeo de estados Stripe → SubscriptionStatus del schema ───────────────
function mapStripeStatus(stripeStatus) {
  switch (stripeStatus) {
    case 'trialing':           return 'TRIAL'
    case 'active':             return 'ACTIVE'
    case 'past_due':           return 'PAST_DUE'
    case 'unpaid':             return 'PAST_DUE'
    case 'paused':             return 'SUSPENDED'
    case 'canceled':           return 'CANCELLED'
    case 'incomplete':         return 'TRIAL'
    case 'incomplete_expired': return 'EXPIRED'
    default:                   return 'TRIAL'
  }
}

// ── Customer reuse ────────────────────────────────────────────────────────
async function getOrCreateCustomerForTenant(tenantId) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, ownerEmail: true, stripeCustomerId: true },
  })
  if (!tenant) throw new Error('Tenant no encontrado: ' + tenantId)

  if (tenant.stripeCustomerId) return tenant.stripeCustomerId

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email:    tenant.ownerEmail,
    name:     tenant.name,
    metadata: { tenantId: tenant.id },
  })
  await prisma.tenant.update({
    where: { id: tenantId },
    data:  { stripeCustomerId: customer.id },
  })
  return customer.id
}

// ── Checkout Session (mode: subscription) ────────────────────────────────
async function createSubscriptionCheckout({ tenantId, planId, successUrl, cancelUrl }) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan)                return { error: 'PLAN_NOT_FOUND' }
  if (!plan.isActive)       return { error: 'PLAN_INACTIVE' }
  if (!plan.stripePriceId)  return { error: 'PLAN_HAS_NO_STRIPE_PRICE' }

  const customerId = await getOrCreateCustomerForTenant(tenantId)
  const stripe     = getStripe()

  const session = await stripe.checkout.sessions.create({
    mode:       'subscription',
    customer:   customerId,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url:  cancelUrl,
    subscription_data: {
      metadata: { tenantId, planId },
    },
    metadata: { tenantId, planId },
    allow_promotion_codes: true,
  })

  return { url: session.url, sessionId: session.id }
}

// ── Billing Portal (gestión de tarjeta / cancelación / facturas) ─────────
async function createBillingPortalSession({ tenantId, returnUrl }) {
  const customerId = await getOrCreateCustomerForTenant(tenantId)
  const stripe     = getStripe()
  const portal = await stripe.billingPortal.sessions.create({
    customer:   customerId,
    return_url: returnUrl,
  })
  return { url: portal.url }
}

// ── Upsert de Subscription local a partir de un objeto Stripe ────────────
async function upsertLocalSubscriptionFromStripe(stripeSub) {
  // tenantId viene del metadata de la subscription (fijado en checkout).
  const tenantId = stripeSub.metadata?.tenantId
  const planId   = stripeSub.metadata?.planId
  if (!tenantId) {
    console.warn('[saas-stripe] Stripe subscription sin metadata.tenantId — ignorando', stripeSub.id)
    return null
  }

  // Resolver plan: metadata → price → plan.
  let plan = null
  if (planId) {
    plan = await prisma.plan.findUnique({ where: { id: planId } })
  }
  if (!plan) {
    const priceId = stripeSub.items?.data?.[0]?.price?.id
    if (priceId) plan = await prisma.plan.findUnique({ where: { stripePriceId: priceId } })
  }
  if (!plan) {
    console.warn('[saas-stripe] No encontré plan para suscripción', stripeSub.id)
    return null
  }

  const status             = mapStripeStatus(stripeSub.status)
  const currentPeriodStart = new Date(stripeSub.current_period_start * 1000)
  const currentPeriodEnd   = new Date(stripeSub.current_period_end * 1000)
  const trialEndsAt        = stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000) : null
  const cancelledAt        = stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : null
  const priceSnapshot      = (stripeSub.items?.data?.[0]?.price?.unit_amount ?? 0) / 100

  const data = {
    tenantId,
    planId: plan.id,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt,
    cancelledAt,
    priceSnapshot,
    externalId:     stripeSub.id,
    paymentGateway: 'STRIPE',
  }

  // Tenant.subscription es @unique, así que upsert por tenantId funciona 1:1.
  const existing = await prisma.subscription.findUnique({ where: { tenantId } })
  if (existing) {
    return prisma.subscription.update({ where: { tenantId }, data })
  }
  return prisma.subscription.create({ data })
}

async function markSubscriptionCancelled(stripeSub) {
  const tenantId = stripeSub.metadata?.tenantId
  const externalId = stripeSub.id
  const where = tenantId ? { tenantId } : { externalId }
  const existing = await prisma.subscription.findUnique({ where })
  if (!existing) return null
  return prisma.subscription.update({
    where: { id: existing.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: stripeSub.canceled_at ? new Date(stripeSub.canceled_at * 1000) : new Date(),
    },
  })
}

// ── Verificación de webhook (raw body) ───────────────────────────────────
function verifyWebhook(rawBody, signature) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET no configurado')
  const stripe = getStripe()
  return stripe.webhooks.constructEvent(rawBody, signature, secret)
}

module.exports = {
  getStripe,
  mapStripeStatus,
  getOrCreateCustomerForTenant,
  createSubscriptionCheckout,
  createBillingPortalSession,
  upsertLocalSubscriptionFromStripe,
  markSubscriptionCancelled,
  verifyWebhook,
}
