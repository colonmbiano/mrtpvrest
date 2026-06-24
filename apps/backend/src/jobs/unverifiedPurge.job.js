// ─────────────────────────────────────────────────────────────────────────────
// unverifiedPurge.job.js — Cron diario de limpieza de tenants no verificados
// Corre a las 3:30am MX (hora valle). Borra tenants que:
//   - nunca verificaron su email (emailVerifiedAt IS NULL),
//   - tienen más de GRACE_HOURS (48h) de antigüedad,
//   - y NO tienen ninguna orden real (guard duro contra borrar negocios vivos).
//
// Esto hace que el spam de registro no PERSISTA: aunque un bot logre crear una
// cuenta, si no verifica (los temp-mail/example.com no reciben correo) se
// auto-elimina en 48h. Orden de borrado respeta las FKs sin cascade hacia
// tenant (users → restaurants → tenant); subscriptions/tenant_modules caen en
// cascada al borrar el tenant.
// ─────────────────────────────────────────────────────────────────────────────

const cron   = require('node-cron')
const prisma = require('@mrtpvrest/database').prisma
const log    = require('../lib/logger')('unverifiedPurge')

const GRACE_HOURS = 48

async function runUnverifiedPurgeJob() {
  const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000)
  let purged = 0
  try {
    const candidates = await prisma.tenant.findMany({
      where: {
        emailVerifiedAt: null,
        createdAt:       { lt: cutoff },
      },
      select: { id: true, name: true, restaurants: { select: { id: true } } },
    })

    for (const t of candidates) {
      try {
        const restaurantIds = t.restaurants.map((r) => r.id)
        // Guard: jamás borrar un tenant con órdenes reales.
        if (restaurantIds.length > 0) {
          const orders = await prisma.order.count({ where: { restaurantId: { in: restaurantIds } } })
          if (orders > 0) continue
        }
        await prisma.$transaction([
          prisma.user.deleteMany({ where: { tenantId: t.id } }),
          prisma.restaurant.deleteMany({ where: { tenantId: t.id } }), // cascada a config/location/categorías/etc.
          prisma.tenant.delete({ where: { id: t.id } }),               // cascada a subscriptions/tenant_modules
        ])
        purged++
        log.info('unverifiedPurge.deleted', { tenantId: t.id, name: t.name })
      } catch (e) {
        // Un tenant que no se pueda borrar (FK inesperada) no debe frenar al resto.
        log.error('unverifiedPurge.tenant.failed', { tenantId: t.id, err: e && e.message })
      }
    }

    log.info('unverifiedPurge.done', { candidates: candidates.length, purged })
  } catch (e) {
    log.error('unverifiedPurge.error', { err: e && e.message })
  }
  return purged
}

function startUnverifiedPurgeJob() {
  cron.schedule('30 3 * * *', runUnverifiedPurgeJob, { timezone: 'America/Mexico_City' })
  log.info('unverifiedPurge.cron', { msg: 'registrado — diario 3:30am MX' })
}

module.exports = { startUnverifiedPurgeJob, runUnverifiedPurgeJob }
