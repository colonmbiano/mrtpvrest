// Denylist de dominios de email no aptos para el registro self-serve:
// desechables / temp-mail y dominios reservados de prueba (RFC 2606 / 6761).
// Bloquearlos corta el patrón del spam masivo (userNNNN@example.com, temp-mail
// tipo temzo.tech) sin afectar a restaurantes reales con dominios legítimos.
//
// Mantener acotado a alto impacto: no es una lista exhaustiva del universo de
// temp-mail (eso requeriría una dependencia que se actualice), sino los
// dominios que de hecho se usaron para abusar + los reservados que jamás son
// correos reales.

const DISPOSABLE_DOMAINS = new Set([
  // Reservados RFC 2606 (no entregan correo) — los usó el bot del abuso
  'example.com', 'example.org', 'example.net',
  // Temp-mail / desechables conocidos
  'test.com', 'temzo.tech',
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', 'yopmail.com', 'yopmail.fr',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'getnada.com', 'maildrop.cc',
  'trashmail.com', 'mailnesia.com', 'mohmal.com', 'fakeinbox.com', 'dispostable.com',
  'mailcatch.com', 'throwawaymail.com', 'tempr.email', 'discard.email', 'mailtemp.net',
  'emailondeck.com', 'spambog.com', 'mintemail.com', 'einrot.com', 'inboxbear.com',
  'tmpmail.org', 'tmpmail.net', 'moakt.com', 'mytemp.email', 'tmail.ws', 'mailbox.in.ua',
])

// TLDs reservados que nunca son emails reales (RFC 6761 / 2606).
const BLOCKED_TLDS = ['.local', '.test', '.invalid', '.example', '.localhost']

/**
 * @param {string} email
 * @returns {boolean} true si el email es desechable / de prueba / inválido.
 */
function isDisposableEmail(email) {
  if (!email || typeof email !== 'string') return true
  const at = email.lastIndexOf('@')
  if (at < 0) return true
  const domain = email.slice(at + 1).trim().toLowerCase()
  if (!domain || /\s/.test(domain)) return true
  if (DISPOSABLE_DOMAINS.has(domain)) return true
  if (BLOCKED_TLDS.some((tld) => domain.endsWith(tld))) return true
  return false
}

module.exports = { isDisposableEmail, DISPOSABLE_DOMAINS, BLOCKED_TLDS }
