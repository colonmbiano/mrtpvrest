#!/usr/bin/env node
// extend-trial.js — Extiende el trial de un tenant por N días (default 30).
//
// Actualiza Subscription.trialEndsAt y Subscription.currentPeriodEnd para que
// ni el cron de trialExpiry ni el tenantMiddleware bloqueen al tenant.
//
// Uso (desde packages/database o con la ruta completa):
//   node prisma/extend-trial.js --slug master-burguers
//   node prisma/extend-trial.js --email owner@acme.com --days 30
//   node prisma/extend-trial.js --tenant-id clx123abc
//
// Requiere DATABASE_URL en el entorno (usa .env del paquete automáticamente).

require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

function parseArgs(argv) {
  const args = { days: 30 }
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i]
    const val = argv[i + 1]
    switch (key) {
      case '--slug':       args.slug = val; i++; break
      case '--email':      args.email = val; i++; break
      case '--tenant-id':  args.tenantId = val; i++; break
      case '--days':       args.days = parseInt(val, 10); i++; break
      case '-h':
      case '--help':       args.help = true; break
    }
  }
  return args
}

function printHelp() {
  console.log(`
extend-trial.js — Extiende el trial de un tenant.

Opciones:
  --slug <slug>         Slug del tenant (ej: master-burguers)
  --email <email>       ownerEmail del tenant
  --tenant-id <id>      ID directo del tenant
  --days <n>            Días a extender (default 30)
  -h, --help            Mostrar ayuda
`)
}

async function findTenant({ slug, email, tenantId }) {
  if (tenantId) return prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } })
  if (slug)     return prisma.tenant.findUnique({ where: { slug }, include: { subscription: true } })
  if (email)    return prisma.tenant.findFirst({ where: { ownerEmail: email }, include: { subscription: true } })
  return null
}

async function main() {
  const args = parseArgs(process.argv)

  if (args.help || (!args.slug && !args.email && !args.tenantId)) {
    printHelp()
    process.exit(args.help ? 0 : 1)
  }

  if (!Number.isFinite(args.days) || args.days <= 0) {
    console.error(`❌ --days debe ser un entero positivo (recibido: ${args.days})`)
    process.exit(1)
  }

  const tenant = await findTenant(args)
  if (!tenant) {
    console.error('❌ Tenant no encontrado con los filtros proporcionados.')
    process.exit(1)
  }
  if (!tenant.subscription) {
    console.error(`❌ Tenant ${tenant.slug} no tiene Subscription. Crea una antes de extender.`)
    process.exit(1)
  }

  const sub = tenant.subscription
  const now = new Date()

  // Partimos del mayor entre "ahora" y la fecha actual — así +30 días siempre
  // te da al menos 30 días desde hoy, sin recortar tiempo ya concedido.
  const baseTrial  = sub.trialEndsAt && sub.trialEndsAt > now ? sub.trialEndsAt : now
  const basePeriod = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now

  const msPerDay = 86_400_000
  const newTrialEndsAt      = new Date(baseTrial.getTime()  + args.days * msPerDay)
  const newCurrentPeriodEnd = new Date(basePeriod.getTime() + args.days * msPerDay)

  // Si estaba EXPIRED por el cron, lo devolvemos a TRIAL.
  const nextStatus = sub.status === 'EXPIRED' ? 'TRIAL' : sub.status

  console.log(`\n🎯 Tenant: ${tenant.name} (${tenant.slug})`)
  console.log(`   ownerEmail       : ${tenant.ownerEmail}`)
  console.log(`   Estado actual    : ${sub.status}${nextStatus !== sub.status ? ` → ${nextStatus}` : ''}`)
  console.log(`   trialEndsAt      : ${sub.trialEndsAt?.toISOString() ?? 'null'} → ${newTrialEndsAt.toISOString()}`)
  console.log(`   currentPeriodEnd : ${sub.currentPeriodEnd?.toISOString() ?? 'null'} → ${newCurrentPeriodEnd.toISOString()}`)
  console.log(`   Días agregados   : +${args.days}\n`)

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      trialEndsAt:      newTrialEndsAt,
      currentPeriodEnd: newCurrentPeriodEnd,
      status:           nextStatus,
    },
  })

  console.log(`✅ Subscription ${updated.id} actualizada.`)
  console.log(`   Nuevo vencimiento: ${updated.currentPeriodEnd.toLocaleDateString('es-MX')}`)
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
