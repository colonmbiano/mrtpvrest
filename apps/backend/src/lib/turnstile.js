// Verificación de Cloudflare Turnstile (CAPTCHA anti-bot) para el registro
// self-serve. Diseño:
// - Si TURNSTILE_SECRET_KEY NO está configurada (dev/local/test), la
//   verificación se OMITE con un warning. Así el flujo no se rompe antes de
//   configurar las llaves; en producción basta con setear la env para activarlo.
// - Si la llave está presente, se exige un token válido. Falla CERRADA: ante
//   token ausente/ inválido o error de red al validar, el registro se rechaza.
//
// Esto cierra el vector de spam que metió ~72 tenants basura en un día (un bot
// pegándole directo a POST /api/auth/register).

const axios = require('axios')
const log = require('./logger')('turnstile')

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

let warnedMissing = false

/**
 * Verifica un token de Turnstile contra Cloudflare.
 * @param {string} token  El valor `cf-turnstile-response` enviado por el cliente.
 * @param {string} [remoteip]  IP del cliente (opcional, mejora el scoring).
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string}>}
 */
async function verifyTurnstile(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    // En producción la ausencia de la key es una MISCONFIGURACIÓN, no un modo
    // dev: fallar abierto reabriría el vector de spam de bots que esto cerró.
    // Fallamos cerrado salvo opt-out explícito (TURNSTILE_OPTIONAL=true).
    if (process.env.NODE_ENV === 'production' && process.env.TURNSTILE_OPTIONAL !== 'true') {
      log.error('turnstile.misconfigured', {
        msg: 'TURNSTILE_SECRET_KEY ausente en producción — registro bloqueado. ' +
             'Configura la key en el entorno o setea TURNSTILE_OPTIONAL=true para omitir a propósito.',
      })
      return { ok: false, reason: 'captcha-misconfigured' }
    }
    if (!warnedMissing) {
      log.warn('turnstile.disabled', { msg: 'TURNSTILE_SECRET_KEY ausente — CAPTCHA desactivado (dev/opt-out)' })
      warnedMissing = true
    }
    return { ok: true, skipped: true }
  }
  if (!token || typeof token !== 'string') {
    return { ok: false, reason: 'missing-token' }
  }
  try {
    const params = new URLSearchParams()
    params.append('secret', secret)
    params.append('response', token)
    if (remoteip) params.append('remoteip', remoteip)

    const { data } = await axios.post(VERIFY_URL, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000,
    })
    if (data && data.success) return { ok: true }
    const reason = (data && data['error-codes'] && data['error-codes'].join(',')) || 'failed'
    return { ok: false, reason }
  } catch (e) {
    // Falla de red al validar: por seguridad, fallar cerrado (rechazar).
    log.error('turnstile.verify.error', { err: e && e.message })
    return { ok: false, reason: 'verify-error' }
  }
}

module.exports = { verifyTurnstile }
