// ─────────────────────────────────────────────────────────────────────────────
// trialExpiry.job.js — Cron diario de vencimiento de trials
// Corre a las 9am. Envía recordatorios D-7, D-3, D-1 y expira trials vencidos.
// ─────────────────────────────────────────────────────────────────────────────

const cron   = require('node-cron')
const prisma = require('@mrtpvrest/database').prisma
const { sendEmail, trialReminderHtml, trialExpiredHtml } = require('../utils/mailer')

// ── Job principal ─────────────────────────────────────────────────────────────
async function runTrialExpiryJob() {
  console.log('[trialExpiry] Iniciando job...')
  const now = new Date()

  try {
    // 1. Expirar trials vencidos (trialEndsAt < ahora y status=TRIAL)
    const expired = await prisma.subscription.findMany({
      where: {
        status:      'TRIAL',
        trialEndsAt: { lt: now },
      },
      include: { tenant: true }
    })

    for (const sub of expired) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data:  { status: 'EXPIRED' },
      })
      if (sub.tenant?.ownerEmail) {
        const billingUrl = `${process.env.FRONTEND_URL || 'https://admin.mrtpvrest.com'}/admin/billing`
        await sendEmail(
          sub.tenant.ownerEmail,
          `Tu prueba de ${sub.tenant.name} ha vencido — MRTPVREST`,
          trialExpiredHtml(sub.tenant.name, billingUrl)
        )
      }
      console.log(`[trialExpiry] Expirado: ${sub.tenant?.name}`)
    }

    // 2. Recordatorios D-7, D-3, D-1
    const REMINDER_DAYS = [7, 3, 1]
    for (const days of REMINDER_DAYS) {
      const from = new Date(now); from.setDate(from.getDate() + days);     from.setHours(0, 0, 0, 0)
      const to   = new Date(now); to.setDate(to.getDate()   + days + 1);   to.setHours(0, 0, 0, 0)

      const expiring = await prisma.subscription.findMany({
        where: {
          status:      'TRIAL',
          trialEndsAt: { gte: from, lt: to },
        },
        include: { tenant: true }
      })

      for (const sub of expiring) {
        if (sub.tenant?.ownerEmail) {
          const billingUrl = `${process.env.FRONTEND_URL || 'https://admin.mrtpvrest.com'}/admin/billing`
          await sendEmail(
            sub.tenant.ownerEmail,
            `Tu prueba vence en ${days} día${days > 1 ? 's' : ''} — ${sub.tenant.name}`,
            trialReminderHtml(sub.tenant.name, days, billingUrl)
          )
        }
        console.log(`[trialExpiry] Recordatorio D-${days}: ${sub.tenant?.name}`)
      }
    }

    console.log(`[trialExpiry] Job completado. Expirados: ${expired.length}`)
  } catch (e) {
    console.error('[trialExpiry] Error en job:', e)
  }
}

// ── Registro del cron ─────────────────────────────────────────────────────────
function startTrialExpiryJob() {
  // Corre todos los días a las 9:00am
  cron.schedule('0 9 * * *', runTrialExpiryJob, { timezone: 'America/Mexico_City' })
  console.log('[trialExpiry] Cron registrado — diario 9:00am MX')
}

module.exports = { startTrialExpiryJob, runTrialExpiryJob }
