// Notificaciones internas de plataforma dirigidas al SUPER_ADMIN.
//
// El destinatario se resuelve dinámicamente desde la BD (el user SUPER_ADMIN
// activo más antiguo), con fallback a la env ADMIN_ALERT_EMAIL. Así "todas las
// notificaciones le llegan al admin" sin hardcodear el correo: si mañana cambia
// el super-admin, cambia el destinatario solo. Cacheado 5 min para no pegarle a
// la BD en cada evento.
//
// Uso:
//   const { notifyPlatformAdmin } = require('./platform-notify')
//   notifyPlatformAdmin({ subject, title, lines: [...], ctaUrl, ctaLabel })
//     .catch(() => {})   // best-effort, nunca bloquear el flujo principal

const { prisma, runWithBypass } = require('@mrtpvrest/database')
const { sendEmail, platformAlertHtml } = require('../utils/mailer')
const log = require('./logger')('platform-notify')

const TTL_MS = 5 * 60 * 1000
let cachedEmail = null
let cachedAt = 0

async function getSuperAdminEmail() {
  const now = Date.now()
  if (cachedEmail && now - cachedAt < TTL_MS) return cachedEmail
  try {
    // Lookup cross-tenant legítimo (SUPER_ADMIN vive en el tenant de plataforma):
    // runWithBypass para no chocar con el tenant-guard en ENFORCE.
    const admin = await runWithBypass(() => prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN', isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    }))
    cachedEmail = admin?.email || process.env.ADMIN_ALERT_EMAIL || null
    cachedAt = now
  } catch (err) {
    log.error('super_admin_lookup_failed', { err: err.message })
    // No cacheamos el fallo (dejamos cachedAt viejo) para reintentar pronto.
    return process.env.ADMIN_ALERT_EMAIL || null
  }
  return cachedEmail
}

async function notifyPlatformAdmin({ subject, title = null, lines = [], ctaUrl = null, ctaLabel = null }) {
  const to = await getSuperAdminEmail()
  if (!to) {
    log.warn('no_recipient', { subject })
    return false
  }
  try {
    await sendEmail(to, subject, platformAlertHtml({ title: title || subject, lines, ctaUrl, ctaLabel }))
    return true
  } catch (err) {
    log.error('send_failed', { subject, err: err.message })
    return false
  }
}

module.exports = { getSuperAdminEmail, notifyPlatformAdmin }
