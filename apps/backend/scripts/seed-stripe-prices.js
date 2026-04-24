// scripts/seed-stripe-prices.js
//
// Crea (o actualiza) los 3 Products + Prices en Stripe para los planes
// BASIC / PRO / UNLIMITED, y persiste el stripePriceId resultante en la
// tabla plans de la DB.
//
// Idempotente: si ya existe un Product con metadata.planName=<name>, lo
// reutiliza. Si ya existe un Price activo con el mismo unit_amount/interval,
// también lo reutiliza en vez de crear duplicados.
//
// Uso:
//   STRIPE_SECRET_KEY=sk_test_xxx DATABASE_URL=... node scripts/seed-stripe-prices.js
require('dotenv').config()
const { prisma } = require('@mrtpvrest/database')

const CURRENCY = (process.env.STRIPE_CURRENCY || 'usd').toLowerCase()
const INTERVAL = 'month'

async function findOrCreateProduct(stripe, plan) {
  const existing = await stripe.products.search({
    query: `metadata['planName']:'${plan.name}'`,
    limit: 1,
  })
  if (existing.data[0]) {
    const p = existing.data[0]
    if (p.name !== plan.displayName || !p.active) {
      await stripe.products.update(p.id, { name: plan.displayName, active: true })
    }
    return p
  }
  return stripe.products.create({
    name:        plan.displayName,
    description: `Plan ${plan.displayName} · MRTPVREST SaaS`,
    metadata:    { planName: plan.name, planId: plan.id },
  })
}

async function findOrCreatePrice(stripe, product, plan) {
  const unitAmount = Math.round(plan.price * 100) // USD → cents
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 })
  const match = prices.data.find(p =>
    p.currency === CURRENCY &&
    p.unit_amount === unitAmount &&
    p.recurring?.interval === INTERVAL
  )
  if (match) return match
  return stripe.prices.create({
    product:     product.id,
    currency:    CURRENCY,
    unit_amount: unitAmount,
    recurring:   { interval: INTERVAL },
    metadata:    { planName: plan.name, planId: plan.id },
  })
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('✖ Falta STRIPE_SECRET_KEY')
    process.exit(1)
  }
  const Stripe = require('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })

  const plans = await prisma.plan.findMany({
    where: { isActive: true, name: { in: ['BASIC', 'PRO', 'UNLIMITED'] } },
    orderBy: { price: 'asc' },
  })
  if (!plans.length) {
    console.error('✖ No hay planes activos BASIC/PRO/UNLIMITED en la DB — corre seed-plans.js primero.')
    process.exit(1)
  }

  console.log('🌱 Seeding Stripe products + prices para', plans.length, 'plan(es)...\n')

  for (const plan of plans) {
    const product = await findOrCreateProduct(stripe, plan)
    const price   = await findOrCreatePrice(stripe, product, plan)
    await prisma.plan.update({
      where: { id: plan.id },
      data:  { stripePriceId: price.id },
    })
    console.log(
      `✅ ${plan.name.padEnd(10)} → product ${product.id} · price ${price.id} · $${plan.price}/mo ${CURRENCY.toUpperCase()}`
    )
  }

  console.log('\n🎉 Listo. plans.stripePriceId actualizado en la DB.')
}

main()
  .catch(err => { console.error('✖ Error:', err); process.exit(1) })
  .finally(() => prisma.$disconnect())
