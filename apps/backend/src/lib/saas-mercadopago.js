// lib/saas-mercadopago.js
//
// Motor de suscripciones B2B SaaS via Mercado Pago PreApproval.
// No confundir con lib/payment-providers/mercadopago.js, que cobra ordenes
// finales del kiosko/tienda por tenant. Aqui se usa una cuenta central.
const crypto = require('crypto')
const { prisma } = require('@mrtpvrest/database')
const { MercadoPagoConfig, PreApproval } = require('mercadopago')

let _client = null
function getMercadoPagoClient() {
  if (_client) return _client
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado - no se puede iniciar billing SaaS')
  }
  _client = new MercadoPagoConfig({ accessToken })
  return _client
}

function getPreApprovalClient() {
  return new PreApproval(getMercadoPagoClient())
}

// Los planes guardan `price` en MXN (la divisa de cobro por defecto), así que
// el monto se envía a Mercado Pago tal cual, sin conversión.
function getBillingCurrency() {
  return process.env.MERCADOPAGO_CURRENCY_ID || process.env.SAAS_BILLING_CURRENCY || 'MXN'
}

function addMonths(date, months = 1) {
  const copy = new Date(date)
  const day = copy.getDate()
  copy.setMonth(copy.getMonth() + months)
  if (copy.getDate() < day) copy.setDate(0)
  return copy
}

function makeExternalReference({ tenantId, planId }) {
  return `tenant:${tenantId}:plan:${planId}`
}

function parseExternalReference(value) {
  const match = String(value || '').match(/^tenant:([^:]+):plan:([^:]+)$/)
  if (!match) return { tenantId: null, planId: null }
  return { tenantId: match[1], planId: match[2] }
}

function mapPreapprovalStatus(status) {
  switch (status) {
    case 'authorized': return 'ACTIVE'
    case 'paused': return 'SUSPENDED'
    case 'cancelled':
    case 'canceled': return 'CANCELLED'
    case 'pending': return 'PAST_DUE'
    default: return 'PAST_DUE'
  }
}

function mapAuthorizedPaymentStatus(authorizedPayment) {
  const paymentStatus = authorizedPayment?.payment?.status
  if (paymentStatus === 'approved') return 'PAID'
  if (paymentStatus === 'rejected' || paymentStatus === 'cancelled') return 'FAILED'
  if (paymentStatus === 'refunded' || paymentStatus === 'charged_back') return 'REFUNDED'
  if (authorizedPayment?.status === 'processed') return 'PAID'
  return 'PENDING'
}

function resolveCurrentPeriod(preapproval, existing) {
  const now = new Date()
  const nextPaymentDate = preapproval?.next_payment_date ? new Date(preapproval.next_payment_date) : null
  const currentPeriodEnd = nextPaymentDate && !Number.isNaN(nextPaymentDate.getTime())
    ? nextPaymentDate
    : addMonths(now, 1)

  const currentPeriodStart = existing?.currentPeriodStart && existing.currentPeriodStart < currentPeriodEnd
    ? existing.currentPeriodStart
    : now

  return { currentPeriodStart, currentPeriodEnd }
}

async function createMercadoPagoSubscriptionCheckout({ tenantId, planId, successUrl }) {
  const [tenant, plan, existing] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, ownerEmail: true },
    }),
    prisma.plan.findUnique({ where: { id: planId } }),
    prisma.subscription.findUnique({ where: { tenantId } }),
  ])

  if (!tenant) return { error: 'TENANT_NOT_FOUND' }
  if (!tenant.ownerEmail) return { error: 'TENANT_HAS_NO_OWNER_EMAIL' }
  if (!plan) return { error: 'PLAN_NOT_FOUND' }
  if (!plan.isActive) return { error: 'PLAN_INACTIVE' }
  if (!Number.isFinite(Number(plan.price)) || Number(plan.price) <= 0) {
    return { error: 'PLAN_HAS_INVALID_PRICE' }
  }

  const chargeAmount = Number(plan.price)

  const preapproval = getPreApprovalClient()
  const body = {
    reason: `MRTPVREST - ${plan.displayName || plan.name}`,
    external_reference: makeExternalReference({ tenantId, planId }),
    payer_email: tenant.ownerEmail,
    auto_recurring: {
      frequency: 1,
      frequency_type: 'months',
      transaction_amount: chargeAmount,
      currency_id: getBillingCurrency(),
    },
    back_url: successUrl,
    status: 'pending',
  }

  const mpSub = await preapproval.create({ body })
  if (!mpSub?.id || !mpSub?.init_point) {
    return { error: 'MERCADOPAGO_SUBSCRIPTION_WITHOUT_INIT_POINT' }
  }

  // IMPORTANTE: no mutamos la suscripción vigente aquí. El preapproval recién
  // creado está en estado `pending` — el cliente todavía no paga. Si tocáramos
  // plan/estado/externalId ahora, un checkout abandonado dejaría al tenant con
  // el plan nuevo sin haber pagado y perdería la referencia a su suscripción
  // anterior. La fuente de verdad es el webhook (upsertLocalSubscriptionFrom-
  // MercadoPago), que actualiza/crea la suscripción cuando MP confirma el pago.
  // Solo cuando el tenant NO tiene ninguna suscripción creamos un registro
  // PAST_DUE (sin acceso) para poder resolver portal/estado mientras tanto.
  if (!existing) {
    const now = new Date()
    await prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'PAST_DUE',
        currentPeriodStart: now,
        currentPeriodEnd: addMonths(now, 1),
        trialEndsAt: null,
        cancelledAt: null,
        priceSnapshot: chargeAmount,
        externalId: mpSub.id,
        paymentGateway: 'MERCADOPAGO',
      },
    })
  }

  return {
    url: mpSub.init_point,
    sessionId: mpSub.id,
    preapprovalId: mpSub.id,
  }
}

async function getMercadoPagoSubscriptionUrl({ tenantId }) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } })
  if (!subscription?.externalId || subscription.paymentGateway !== 'MERCADOPAGO') {
    throw new Error('MERCADOPAGO_SUBSCRIPTION_NOT_FOUND')
  }

  const mpSub = await getPreApprovalClient().get({ id: subscription.externalId })
  const url = mpSub?.init_point || mpSub?.back_url
  if (!url) throw new Error('MERCADOPAGO_PORTAL_UNAVAILABLE')
  return { url }
}

async function upsertLocalSubscriptionFromMercadoPago(preapproval) {
  if (!preapproval?.id) return null

  const parsed = parseExternalReference(preapproval.external_reference)
  let tenantId = parsed.tenantId
  let planId = parsed.planId

  let existing = null
  if (tenantId) {
    existing = await prisma.subscription.findUnique({ where: { tenantId } })
  }
  if (!existing) {
    existing = await prisma.subscription.findFirst({ where: { externalId: preapproval.id } })
    tenantId = tenantId || existing?.tenantId || null
    planId = planId || existing?.planId || null
  }
  if (!tenantId || !planId) {
    console.warn('[saas-mercadopago] PreApproval sin referencia local - ignorando', preapproval.id)
    return null
  }

  const plan = await prisma.plan.findUnique({ where: { id: planId } })
  if (!plan) {
    console.warn('[saas-mercadopago] No encontre plan para preapproval', preapproval.id)
    return null
  }

  const { currentPeriodStart, currentPeriodEnd } = resolveCurrentPeriod(preapproval, existing)
  const status = mapPreapprovalStatus(preapproval.status)

  const data = {
    tenantId,
    planId: plan.id,
    status,
    currentPeriodStart,
    currentPeriodEnd,
    trialEndsAt: status === 'ACTIVE' ? null : existing?.trialEndsAt || null,
    cancelledAt: status === 'CANCELLED' ? new Date() : null,
    priceSnapshot: Number(preapproval.auto_recurring?.transaction_amount || plan.price),
    externalId: preapproval.id,
    paymentGateway: 'MERCADOPAGO',
  }

  if (existing) {
    return prisma.subscription.update({ where: { id: existing.id }, data })
  }
  return prisma.subscription.create({ data })
}

async function mercadoPagoRequest(path) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MERCADOPAGO_ACCESS_TOKEN no configurado')

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = payload?.message || payload?.error || response.statusText
    throw new Error(`Mercado Pago API ${response.status}: ${detail}`)
  }
  return payload
}

async function getAuthorizedPayment(id) {
  return mercadoPagoRequest(`/authorized_payments/${encodeURIComponent(id)}`)
}

async function syncAuthorizedPaymentFromMercadoPago(authorizedPayment) {
  if (!authorizedPayment?.id) return null

  let subscription = authorizedPayment.preapproval_id
    ? await prisma.subscription.findFirst({ where: { externalId: String(authorizedPayment.preapproval_id) } })
    : null

  if (!subscription && authorizedPayment.preapproval_id) {
    const mpSub = await getPreApprovalClient().get({ id: String(authorizedPayment.preapproval_id) })
    subscription = await upsertLocalSubscriptionFromMercadoPago(mpSub)
  }
  if (!subscription) {
    console.warn('[saas-mercadopago] Authorized payment sin subscription local - ignorando', authorizedPayment.id)
    return null
  }

  const status = mapAuthorizedPaymentStatus(authorizedPayment)
  const periodStart = authorizedPayment.debit_date
    ? new Date(authorizedPayment.debit_date)
    : new Date(authorizedPayment.date_created || Date.now())
  const periodEnd = addMonths(periodStart, 1)
  const paidAt = status === 'PAID'
    ? new Date(authorizedPayment.last_modified || authorizedPayment.debit_date || Date.now())
    : null
  const externalId = String(authorizedPayment.id)

  const existingInvoice = await prisma.invoice.findFirst({ where: { externalId } })
  const invoiceData = {
    subscriptionId: subscription.id,
    amount: Number(authorizedPayment.transaction_amount || subscription.priceSnapshot),
    currency: authorizedPayment.currency_id || getBillingCurrency(),
    status,
    paidAt,
    periodStart,
    periodEnd,
    externalId,
  }

  const invoice = existingInvoice
    ? await prisma.invoice.update({ where: { id: existingInvoice.id }, data: invoiceData })
    : await prisma.invoice.create({ data: invoiceData })

  if (status === 'PAID') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'ACTIVE',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: null,
        cancelledAt: null,
      },
    })
  } else if (status === 'FAILED') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    })
  }

  return invoice
}

function verifyMercadoPagoWebhook({ headers, query }) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET
  if (!secret) return true

  const xSignature = headers['x-signature']
  const xRequestId = headers['x-request-id']
  if (!xSignature || !xRequestId) return false

  const parts = String(xSignature).split(',')
  let ts = null
  let hash = null
  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key?.trim() === 'ts') ts = value?.trim()
    if (key?.trim() === 'v1') hash = value?.trim()
  }
  if (!ts || !hash) return false

  let dataId = query['data.id'] || query.id || ''
  if (typeof dataId === 'string' && /[a-z]/i.test(dataId)) dataId = dataId.toLowerCase()

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex')
  if (expected.length !== hash.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
}

async function handleMercadoPagoWebhook(body) {
  const topic = body?.type || body?.topic || ''
  const resourceId = body?.data?.id || body?.id

  if (!resourceId) return { ignored: true, reason: 'NO_RESOURCE_ID' }

  if (topic === 'subscription_preapproval') {
    const mpSub = await getPreApprovalClient().get({ id: String(resourceId) })
    await upsertLocalSubscriptionFromMercadoPago(mpSub)
    return { received: true, topic }
  }

  if (topic === 'subscription_authorized_payment') {
    const authorizedPayment = await getAuthorizedPayment(String(resourceId))
    await syncAuthorizedPaymentFromMercadoPago(authorizedPayment)
    return { received: true, topic }
  }

  return { ignored: true, topic }
}

module.exports = {
  getMercadoPagoClient,
  getBillingCurrency,
  createMercadoPagoSubscriptionCheckout,
  getMercadoPagoSubscriptionUrl,
  upsertLocalSubscriptionFromMercadoPago,
  getAuthorizedPayment,
  syncAuthorizedPaymentFromMercadoPago,
  verifyMercadoPagoWebhook,
  handleMercadoPagoWebhook,
}
