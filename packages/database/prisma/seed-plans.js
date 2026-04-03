// prisma/seed-plans.js — Seed de planes SaaS
// Ejecutar: node prisma/seed-plans.js
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const plans = [
  {
    name:         'BASIC',
    displayName:  'Básico',
    price:        29,
    trialDays:    15,
    maxLocations: 1,
    maxEmployees: 5,
    hasKDS:       false,
    hasLoyalty:   false,
    hasInventory: false,
    hasReports:   false,
    hasAPIAccess: false,
  },
  {
    name:         'PRO',
    displayName:  'Pro',
    price:        59,
    trialDays:    15,
    maxLocations: 3,
    maxEmployees: 20,
    hasKDS:       true,
    hasLoyalty:   true,
    hasInventory: true,
    hasReports:   true,
    hasAPIAccess: false,
  },
  {
    name:         'UNLIMITED',
    displayName:  'Ilimitado',
    price:        99,
    trialDays:    15,
    maxLocations: 999,
    maxEmployees: 999,
    hasKDS:       true,
    hasLoyalty:   true,
    hasInventory: true,
    hasReports:   true,
    hasAPIAccess: true,
  },
]

async function main() {
  console.log('🌱 Seeding planes SaaS...\n')

  for (const plan of plans) {
    const result = await prisma.plan.upsert({
      where:  { name: plan.name },
      create: plan,
      update: {
        displayName:  plan.displayName,
        price:        plan.price,
        maxLocations: plan.maxLocations,
        maxEmployees: plan.maxEmployees,
        hasKDS:       plan.hasKDS,
        hasLoyalty:   plan.hasLoyalty,
        hasInventory: plan.hasInventory,
        hasReports:   plan.hasReports,
        hasAPIAccess: plan.hasAPIAccess,
      },
    })
    console.log(`✅ Plan ${result.displayName.padEnd(10)} — $${result.price}/mes | ${result.maxLocations} sucursal(es) | KDS:${result.hasKDS} Loyalty:${result.hasLoyalty} Inventario:${result.hasInventory}`)
  }

  console.log('\n🎉 Planes creados/actualizados.')
  console.log('──────────────────────────────────────────────────────')
  console.log('Siguiente: node prisma/seed-tenant.js  (crea Master Burger\'s)')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
