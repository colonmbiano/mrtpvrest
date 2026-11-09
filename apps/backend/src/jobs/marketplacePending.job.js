// ─────────────────────────────────────────────────────────────────────────────
// marketplacePending.job.js — Pedidos del Mercadito que el comercio no atiende (C2).
//
// Un pedido del Mercadito queda "por aceptar" (PENDING_MERCHANT) hasta que la caja lo acepta o lo
// rechaza. Si nadie responde, el cliente —que muchas veces ya pagó en línea— espera sin fin. Este
// barrido, cada minuto:
//   1. Cancela los pedidos por aceptar que llevan más de MARKETPLACE_PENDING_MERCHANT_TTL_MIN
//      minutos esperando (15 por defecto, decisión del 9/nov/2026; 0 apaga la cancelación). El
//      reloj corre desde que el pedido llegó al comercio: paidAt si se pagó en línea, createdAt si
//      es en efectivo. Si se pagó en línea, se reembolsa completo, envío incluido.
//   2. Cada 5 minutos termina los reembolsos que quedaron PENDING porque Mercado Pago no respondió.
//
// Conservador a propósito:
//   · Solo PENDING_MERCHANT. Un pedido aceptado (CONFIRMED o después) nunca se toca.
//   · PENDING_PAYMENT no se toca: el comercio no lo ve y el cliente aún puede pagarlo; el reloj de
//     15 minutos empieza cuando el pago llega.
//   · La cancelación es condicional sobre el estado y la reserva del reembolso va en la misma TX
//     (lib/marketplace-cancel.js): si la caja acepta en el mismo instante, gana la caja. Varias
//     instancias del backend comparten la reserva por orden: nunca hay dos reembolsos.
//
// Corre sin contexto de tenant (barre todos los comercios): el tenant-guard hace passthrough sin
// contexto, ver docs/TENANCY.md. Cada consulta filtra igualmente por restaurantId.
// ─────────────────────────────────────────────────────────────────────────────

const cron = require('node-cron')
const log = require('../lib/logger')('marketplacePending')
const { createMarketplaceCancellation } = require('../lib/marketplace-cancel')

const DEFAULT_TTL_MIN = 15
const BATCH_LIMIT = 100
const RECOVERY_EVERY_MIN = 5
// Actor de sistema: aparece en la auditoría y en la reserva del reembolso.
const SYSTEM_ACTOR = Object.freeze({ id: 'system-marketplace-pending', name: 'Mercadito: sin respuesta del comercio' })
const RECOVERY_ACTOR = Object.freeze({ accountId: 'system-marketplace-pending', roles: ['SUPER_ADMIN'], isActive: true })

function ttlMinutes(env = process.env) {
  const raw = env.MARKETPLACE_PENDING_MERCHANT_TTL_MIN
  if (raw === undefined || raw === '') return DEFAULT_TTL_MIN
  const value = Number(raw)
  return Number.isFinite(value) ? value : DEFAULT_TTL_MIN
}

function cancelNote(ttl) {
  return `⏱ Cancelado automáticamente: el comercio no respondió en ${ttl} min.`
}

function createMarketplacePendingJob({ prisma, cancellation, env = process.env, now = () => new Date(), logger = log } = {}) {
  const db = prisma || require('@mrtpvrest/database').prisma
  const cancel = cancellation || createMarketplaceCancellation({ prisma: db })
  let running = false

  async function cancelStale(io) {
    const ttl = ttlMinutes(env)
    const result = { cancelled: 0, refunded: 0, refundsPending: 0, skipped: 0, failed: 0 }
    if (ttl <= 0) return result
    const cutoff = new Date(now().getTime() - ttl * 60000)
    const stale = await db.order.findMany({
      where: { source: 'MARKETPLACE', status: 'PENDING_MERCHANT',
        OR: [{ paidAt: { lt: cutoff } }, { paidAt: null, createdAt: { lt: cutoff } }] },
      select: { id: true, restaurantId: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH_LIMIT,
    })
    for (const order of stale) {
      try {
        const done = await cancel.cancelOrder({ orderId: order.id, restaurantId: order.restaurantId,
          fromStatuses: ['PENDING_MERCHANT'], reason: `Sin respuesta del comercio en ${ttl} minutos`,
          actor: SYSTEM_ACTOR, note: cancelNote(ttl), io, logger })
        if (done.outcome !== 'CANCELLED') { result.skipped++; continue }
        result.cancelled++
        if (done.refund?.status === 'POSTED') result.refunded++
        else if (done.refund) result.refundsPending++
        logger.info?.('marketplacePending.cancelled', { orderId: order.id, restaurantId: order.restaurantId,
          ttlMin: ttl, refund: done.refund?.status || null })
      } catch (error) {
        // Un pedido con problema (p. ej. pago sin captura en el libro) no frena el resto; se reintenta
        // en la siguiente corrida y queda en el log para revisarlo.
        result.failed++
        logger.error?.('marketplacePending.order.failed', { orderId: order.id, code: error?.code, err: error?.message })
      }
    }
    return result
  }

  async function recover() {
    try {
      const { items } = await cancel.recoverRefunds(RECOVERY_ACTOR, { limit: 25 })
      const posted = items.filter(item => item.status === 'POSTED').length
      if (items.length) logger.info?.('marketplacePending.refunds.recovered', { checked: items.length, posted })
      return { checked: items.length, posted }
    } catch (error) {
      logger.error?.('marketplacePending.refunds.failed', { code: error?.code, err: error?.message })
      return { checked: 0, posted: 0, error: error?.code || 'RECOVERY_FAILED' }
    }
  }

  // Una corrida a la vez por instancia; otra instancia en paralelo es segura (ver cabecera).
  async function run(io = null, { withRecovery = false } = {}) {
    if (running) return { busy: true }
    running = true
    try {
      let stale
      try { stale = await cancelStale(io) } catch (error) {
        logger.error?.('marketplacePending.query.failed', { err: error?.message })
        stale = { error: 'QUERY_FAILED' }
      }
      const refunds = withRecovery ? await recover() : null
      if (stale.cancelled || stale.failed || stale.skipped) logger.info?.('marketplacePending.done', { ...stale })
      return { ...stale, ...(refunds ? { recovery: refunds } : {}) }
    } finally { running = false }
  }

  return { run, cancelStale, recover }
}

function startMarketplacePendingJob(io = null) {
  const job = createMarketplacePendingJob()
  const ttl = ttlMinutes()
  const task = cron.schedule('* * * * *', () => {
    const minute = new Date().getMinutes()
    return job.run(io, { withRecovery: minute % RECOVERY_EVERY_MIN === 0 })
  })
  log.info('marketplacePending.cron', { ttlMin: ttl, msg: ttl > 0
    ? `registrado — cada minuto; cancela a los ${ttl} min y recupera reembolsos cada ${RECOVERY_EVERY_MIN} min`
    : 'cancelación apagada (MARKETPLACE_PENDING_MERCHANT_TTL_MIN <= 0); solo recupera reembolsos' })
  return task
}

module.exports = { startMarketplacePendingJob, createMarketplacePendingJob, ttlMinutes, DEFAULT_TTL_MIN }
