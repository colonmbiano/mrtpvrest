// ─────────────────────────────────────────────────────────────────────────────
// mailer.js — Servicio de email via Resend (HTTP API, no SMTP)
// Railway bloquea puertos SMTP (465/587) — Resend usa HTTPS
// ─────────────────────────────────────────────────────────────────────────────

const { Resend } = require('resend')

let resend = null
function getResend() {
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

async function sendEmail(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[mailer] Skipped (no RESEND_API_KEY): ${to} — ${subject}`)
    return
  }
  const from = `${process.env.SMTP_FROM_NAME || 'MRTPVREST'} <${process.env.SMTP_FROM_EMAIL || 'noreply@mrtpvrest.com'}>`
  const { data, error } = await getResend().emails.send({ from, to, subject, html })
  if (error) throw new Error(error.message)
  console.log(`[mailer] Enviado → ${to} (id: ${data.id})`)
  return data
}

// ── Templates ─────────────────────────────────────────────────────────────────

function verificationEmailHtml(ownerName, tenantName, verifyUrl) {
  return `
    <div style="font-family:'DM Sans',Inter,sans-serif;max-width:560px;margin:0 auto;background:#080810;color:#f0f0f8;border-radius:16px;overflow:hidden;border:1px solid #1e1e30;">
      <div style="background:linear-gradient(135deg,#7c3aed,#9f67ff);padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;color:#fff;">
          MRTPVREST
        </h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">Hola, ${ownerName} 👋</p>
        <p style="color:#6b6b90;margin:0 0 8px;">
          Tu cuenta de <strong style="color:#f0f0f8">${tenantName}</strong> fue creada. Solo falta verificar tu email para activarla.
        </p>
        <p style="color:#4a4a6a;font-size:13px;margin:0 0 32px;">
          Este enlace expira en <strong style="color:#f0f0f8">24 horas</strong>.
        </p>
        <a href="${verifyUrl}"
          style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#9f67ff);color:#fff;padding:16px 32px;border-radius:12px;font-weight:900;text-decoration:none;font-size:15px;letter-spacing:-0.3px;box-shadow:0 4px 20px rgba(124,58,237,0.4);">
          VERIFICAR MI CUENTA →
        </a>
        <p style="color:#4a4a6a;font-size:12px;margin:32px 0 0;">
          Si no creaste esta cuenta, ignora este mensaje.
        </p>
      </div>
      <div style="padding:16px 32px;border-top:1px solid #1e1e30;color:#4a4a6a;font-size:12px;">
        MRTPVREST · Sistema de punto de venta para restaurantes
      </div>
    </div>
  `
}

function trialReminderHtml(tenantName, daysLeft, billingUrl) {
  const urgency = daysLeft === 1 ? 'Último día' : daysLeft === 3 ? 'Quedan 3 días' : 'Quedan 7 días'
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#f97316;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#000">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">${urgency}</p>
        <p style="color:#9ca3af;margin:0 0 24px;">Tu prueba gratuita de <strong style="color:#fff">${tenantName}</strong> vence en <strong style="color:#f97316">${daysLeft} día${daysLeft > 1 ? 's' : ''}</strong>.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Para seguir usando MRTPVREST sin interrupciones, elige tu plan ahora.</p>
        <a href="${billingUrl}"
          style="display:inline-block;background:#f97316;color:#000;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          VER PLANES →
        </a>
      </div>
    </div>
  `
}

function trialExpiredHtml(tenantName, billingUrl) {
  return `
    <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;color:#fff;border-radius:16px;overflow:hidden;">
      <div style="background:#dc2626;padding:24px 32px;">
        <h1 style="margin:0;font-size:20px;font-weight:900;letter-spacing:-0.5px;">MRTPV<span style="color:#fff">REST</span></h1>
      </div>
      <div style="padding:32px;">
        <p style="font-size:24px;font-weight:900;margin:0 0 8px;">Tu período de prueba venció</p>
        <p style="color:#9ca3af;margin:0 0 24px;">El acceso de <strong style="color:#fff">${tenantName}</strong> ha sido pausado.</p>
        <p style="color:#9ca3af;margin:0 0 32px;">Reactiva tu cuenta eligiendo un plan para seguir recibiendo pedidos.</p>
        <a href="${billingUrl}"
          style="display:inline-block;background:#dc2626;color:#fff;padding:14px 28px;border-radius:12px;font-weight:900;text-decoration:none;font-size:14px;">
          REACTIVAR AHORA →
        </a>
      </div>
    </div>
  `
}

module.exports = { sendEmail, verificationEmailHtml, trialReminderHtml, trialExpiredHtml }
