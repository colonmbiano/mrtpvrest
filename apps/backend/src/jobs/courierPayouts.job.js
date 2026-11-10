// ─────────────────────────────────────────────────────────────────────────────
// courierPayouts.job.js — Corte diario del repartidor independiente (C8).
//
// Cada madrugada (03:17 hora de la Ciudad de México) emite el corte del día anterior por cada
// repartidor de la red y cada comercio con el que entregó (lib/marketplace-courier-payouts.js):
// cuánto ganó (100% del envío), cuánto efectivo cobró y quién le paga a quién. El comercio lo marca
// pagado desde su panel. Emitir dos veces el mismo día no duplica nada (único por comercio,
// repartidor y día), así que correr en varias instancias es seguro. Si la madrugada falla, la
// corrida siguiente también revisa el día anterior a ese (2 días hacia atrás).
// Solo corre con la red encendida (MARKETPLACE_NETWORK_ENABLED=true).
// ─────────────────────────────────────────────────────────────────────────────

const cron = require('node-cron')
const log = require('../lib/logger')('courierPayouts')
const { createCourierPayouts } = require('../lib/marketplace-courier-payouts')
const { dateOf, previousDate } = require('../lib/mx-calendar')

const SCHEDULE = '17 3 * * *'
const LOOKBACK_DAYS = 2

function createCourierPayoutsJob({ payouts, now = () => new Date(), logger = log } = {}) {
  const service = payouts || createCourierPayouts({ now })
  let running = false
  async function run() {
    if (running) return { busy: true }
    running = true
    try {
      const results = []
      let day = dateOf(now())
      for (let i = 0; i < LOOKBACK_DAYS; i++) {
        day = previousDate(day)
        try {
          const result = await service.issueDay({ date: day })
          results.push(result)
          if (result.created || result.excluded) logger.info?.('courierPayouts.issued', result)
        } catch (error) {
          results.push({ businessDate: day, error: error?.code || 'ISSUE_FAILED' })
          logger.error?.('courierPayouts.failed', { businessDate: day, code: error?.code, err: error?.message })
        }
      }
      return { results }
    } finally { running = false }
  }
  return { run }
}

function startCourierPayoutsJob(env = process.env) {
  if (env.MARKETPLACE_NETWORK_ENABLED !== 'true') {
    log.info('courierPayouts.cron', { msg: 'red apagada: no se emiten cortes de repartidores' })
    return null
  }
  const job = createCourierPayoutsJob()
  const task = cron.schedule(SCHEDULE, () => job.run(), { timezone: 'America/Mexico_City' })
  log.info('courierPayouts.cron', { msg: 'registrado — 03:17 CDMX, emite el corte del día anterior' })
  return task
}

module.exports = { createCourierPayoutsJob, startCourierPayoutsJob, SCHEDULE }
