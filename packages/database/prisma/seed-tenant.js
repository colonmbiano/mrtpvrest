// prisma/seed-tenant.js — Crea Master Burger's como primer tenant
// Ejecutar: node prisma/seed-tenant.js
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Creando tenant: Master Burger's...\n")

  // 1. Obtener plan PRO
  const plan = await prisma.plan.findUnique({ where: { name: 'PRO' } })
  if (!plan) throw new Error('Plan PRO no encontrado. Corre seed-plans.js primero.')
  console.log(`✅ Plan encontrado: ${plan.displayName} — $${plan.price}/mes`)

  // 2. Fechas
  const now      = new Date()
  const yearEnd  = new Date(now)
  yearEnd.setFullYear(yearEnd.getFullYear() + 1)

  // 3. Restaurante + Subscription (upsert seguro por slug)
  const existing = await prisma.restaurant.findUnique({
    where:   { slug: 'master-burguers' },
    include: { subscription: true }
  })

  let restaurant

  if (existing) {
    // Actualizar subscription si ya existe
    restaurant = await prisma.restaurant.update({
      where: { slug: 'master-burguers' },
      data: {
        name:     "Master Burger's",
        domain:   'masterburguers.com',
        isActive: true,
        subscription: existing.subscription
          ? {
              update: {
                planId:             plan.id,
                status:             'ACTIVE',
                trialEndsAt:        null,
                currentPeriodStart: now,
                currentPeriodEnd:   yearEnd,
                priceSnapshot:      59,
                paymentGateway:     'MANUAL',
              }
            }
          : {
              create: {
                planId:             plan.id,
                status:             'ACTIVE',
                trialEndsAt:        null,
                currentPeriodStart: now,
                currentPeriodEnd:   yearEnd,
                priceSnapshot:      59,
                paymentGateway:     'MANUAL',
              }
            }
      },
      include: { subscription: { include: { plan: true } } }
    })
    console.log('♻️  Restaurante ya existía — actualizado')
  } else {
    restaurant = await prisma.restaurant.create({
      data: {
        slug:     'master-burguers',
        name:     "Master Burger's",
        domain:   'masterburguers.com',
        isActive: true,
        subscription: {
          create: {
            planId:             plan.id,
            status:             'ACTIVE',
            trialEndsAt:        null,
            currentPeriodStart: now,
            currentPeriodEnd:   yearEnd,
            priceSnapshot:      59,
            paymentGateway:     'MANUAL',
          }
        }
      },
      include: { subscription: { include: { plan: true } } }
    })
    console.log('✅ Restaurante creado')
  }

  const sub = restaurant.subscription
  console.log(`\n   ID          : ${restaurant.id}`)
  console.log(`   Slug        : ${restaurant.slug}`)
  console.log(`   Dominio     : ${restaurant.domain}`)
  console.log(`   Plan        : ${sub.plan.displayName} — $${sub.priceSnapshot}/mes`)
  console.log(`   Estado sub  : ${sub.status}`)
  console.log(`   Periodo     : ${sub.currentPeriodStart.toLocaleDateString('es-MX')} → ${sub.currentPeriodEnd.toLocaleDateString('es-MX')}`)
  console.log(`   Gateway     : ${sub.paymentGateway}`)

  console.log("\n🎉 Tenant Master Burger's listo.")
  console.log('─────────────────────────────────────────────────')
  console.log(`Restaurant ID : ${restaurant.id}`)
  console.log(`Header        : X-Restaurant-ID: ${restaurant.id}`)
  console.log(`Subdominio    : master-burguers.mrtpvrest.com`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
