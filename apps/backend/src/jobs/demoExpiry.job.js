// ─────────────────────────────────────────────────────────────────────────────
// demoExpiry.job.js — Cron diario de vencimiento de cuentas DEMO
// Corre a las 3:00am MX (hora valle, justo antes del purge de no-verificados).
//
// Las demos (Tenant.isDemo = true) se crean desde el panel SaaS (/demos) con un
// trial corto y `demoExpiresAt`. Este job las mantiene ordenadas en dos etapas,
// para no ensuciar métricas ni dejar demos activas para siempre:
//
//   1. PAUSA: demo vencida (demoExpiresAt < ahora) cuya suscripción sigue viva
//      → status = EXPIRED. Esto apaga login/tienda (misma semántica que un trial
//      vencido) pero conserva los datos por si el prospecto pide reactivarla.
//   2. PURGA: demo vencida hace más de GRACE_DAYS → borrado duro (cascada), igual
//      que unverifiedPurge. Como son demos desechables, se borran aunque tengan
//      órdenes de prueba.
//
// Orden de borrado respeta las FKs sin cascade hacia tenant (users → restaurants
// → tenant); subscriptions/tenant_modules caen en cascada al borrar el tenant.
// ─────────────────────────────────────────────────────────────────────────────

const cron   = require('node-cron')
const prisma = require('@mrtpvrest/database').prisma
const log    = require('../lib/logger')('demoExpiry')

// Días de gracia tras el vencimiento antes del borrado definitivo.
const GRACE_DAYS = 7

async function runDemoExpiryJob() {
  const now       = new Date()
  const purgeFrom = new Date(now.getTime() - GRACE_DAYS * 86400000)
  let paused = 0
  let purged = 0

  try {
    // 1. PAUSA — demos vencidas todavía no expiradas en su suscripción.
    const toPause = await prisma.tenant.findMany({
      where: {
        isDemo:        true,
        demoExpiresAt: { lt: now },
        subscription:  { status: { notIn: ['EXPIRED', 'CANCELLED'] } },
      },
      select: { id: true, name: true },
    })

    for (const t of toPause) {
      try {
        await prisma.subscription.update({
          where: { tenantId: t.id },
          data:  { status: 'EXPIRED' },
        })
        paused++
        log.info('demoExpiry.paused', { tenantId: t.id, name: t.name })
      } catch (e) {
        log.error('demoExpiry.pause.failed', { tenantId: t.id, err: e && e.message })
      }
    }

    // 2. PURGA — demos vencidas hace más de GRACE_DAYS.
    const toPurge = await prisma.tenant.findMany({
      where: {
        isDemo:        true,
        demoExpiresAt: { lt: purgeFrom },
      },
      select: { id: true, name: true },
    })

    for (const t of toPurge) {
      try {
        await prisma.$transaction([
          prisma.user.deleteMany({ where: { tenantId: t.id } }),
          prisma.restaurant.deleteMany({ where: { tenantId: t.id } }), // cascada a config/location/banners/menú/etc.
          prisma.tenant.delete({ where: { id: t.id } }),               // cascada a subscription/tenant_modules
        ])
        purged++
        log.info('demoExpiry.purged', { tenantId: t.id, name: t.name })
      } catch (e) {
        log.error('demoExpiry.purge.failed', { tenantId: t.id, err: e && e.message })
      }
    }

    log.info('demoExpiry.done', { paused, purged })
  } catch (e) {
    log.error('demoExpiry.error', { err: e && e.message })
  }
  return { paused, purged }
}

function startDemoExpiryJob() {
  cron.schedule('0 3 * * *', runDemoExpiryJob, { timezone: 'America/Mexico_City' })
  log.info('demoExpiry.cron', { msg: 'registrado — diario 3:00am MX' })
}

module.exports = { startDemoExpiryJob, runDemoExpiryJob }
