// ─────────────────────────────────────────────────────────────────────────────
// trialExpiry.job.js — Cron diario de vencimiento de trials
// Corre a las 9am. Envía recordatorios D-7, D-3, D-1 y expira trials vencidos.
// ─────────────────────────────────────────────────────────────────────────────

const cron       = require('node-cron')
const nodemailer = require('nodemailer')
const prisma     = require('../utils/prisma')

// ── Mailer ────────────────────────────────────────────────────────────────────
function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
}

async function sendEmail(to, subject, html) {
  if (!process.env.SMTP_USER) {
    console.log(`[trialExpiry] Email skipped (no SMTP): ${to} — ${subject}`)
    return
  }
  try {
    const transport = createTransport()
    await transport.sendMail({
      from: `MRTPVREST <${process.env.SMTP_USER}>`,
      to, subject, html,
    })
    console.log(`[trialExpiry] Email sent → ${to}`)
  } catch (e) {
    console.error(`[trialExpiry] Error sending to ${to}:`, e.message)
  }
}

// ── Templates ─────────────────────────────────────────────────────────────────
function reminderHtml(tenantName, daysLeft) {
  const urgency = daysLeft === 1 ? '🚨 Último día' : daysLeft === 3 ? '⚠️ Quedan 3 días' : '📅 Quedan 7 días'
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#f97316;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#fff">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">${urgency}</p>
        <p style="color:#9ca3af;margin:0 0 24px;">Tu prueba gratuita de <strong style="color:#fff">${tenantName}</strong> vence en <strong style="color:#f97316">${daysLeft} día${daysLeft > 1 ? 's' : ''}</strong>.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Para seguir usando MRTPVREST sin interrupciones, elige tu plan ahora.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://admin.mrtpvrest.com'}/admin/billing"
          style="display:inline-block;background:#f97316;color:#000;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          VER PLANES →
        </a>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #1f1f1f;color:#6b7280;font-size:12px;">
        Recibes este email porque tienes una cuenta activa en MRTPVREST.
      </div>
    </div>
  `
}

function expiredHtml(tenantName) {
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#dc2626;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#fff">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">Tu período de prueba venció</p>
        <p style="color:#9ca3af;margin:0 0 24px;">El acceso de <strong style="color:#fff">${tenantName}</strong> ha sido pausado.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Reactiva tu cuenta eligiendo un plan para seguir recibiendo pedidos.</p>
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://admin.mrtpvrest.com'}/admin/billing"
          style="display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          REACTIVAR AHORA →
        </a>
      </div>
    </div>
  `
}

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
        await sendEmail(
          sub.tenant.ownerEmail,
          `Tu prueba de ${sub.tenant.name} ha vencido — MRTPVREST`,
          expiredHtml(sub.tenant.name)
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
          await sendEmail(
            sub.tenant.ownerEmail,
            `Tu prueba vence en ${days} día${days > 1 ? 's' : ''} — ${sub.tenant.name}`,
            reminderHtml(sub.tenant.name, days)
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
