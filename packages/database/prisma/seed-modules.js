// prisma/seed-modules.js — Seed de módulos opcionales por plan
// Ejecutar: node packages/database/prisma/seed-modules.js
require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

// Módulos disponibles en la plataforma
const MODULE_KIOSK    = 'KIOSK'
const MODULE_DELIVERY = 'DELIVERY'
const MODULE_WEBSTORE = 'WEBSTORE'
const MODULE_LOYALTY  = 'LOYALTY'
const MODULE_KDS      = 'KDS'
const MODULE_REPORTS  = 'REPORTS'

const planModules = {
  BASIC:     [],
  PRO:       [MODULE_KIOSK, MODULE_DELIVERY, MODULE_LOYALTY, MODULE_KDS, MODULE_REPORTS],
  UNLIMITED: [MODULE_KIOSK, MODULE_DELIVERY, MODULE_WEBSTORE, MODULE_LOYALTY, MODULE_KDS, MODULE_REPORTS],
}

async function main() {
  console.log('🌱 Actualizando módulos por plan...\n')

  for (const [planName, modules] of Object.entries(planModules)) {
    const plan = await prisma.plan.findUnique({ where: { name: planName } })
    if (!plan) {
      console.log(`⚠️  Plan "${planName}" no encontrado, salteando.`)
      continue
    }
    await prisma.plan.update({
      where: { name: planName },
      data:  { allowedModules: modules },
    })
    console.log(`✅ ${planName.padEnd(10)} → [${modules.join(', ') || '—'}]`)
  }

  console.log('\n🎉 Módulos actualizados correctamente.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
