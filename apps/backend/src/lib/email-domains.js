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

// Dominios que tratan el sufijo "+etiqueta" del local-part como subdirección y
// lo entregan a la MISMA bandeja (RFC 5233). Para ellos, user+x@dom y user@dom
// son la misma persona. Gmail además ignora los puntos del local-part.
const PLUS_SUBADDRESS_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com',
  'proton.me', 'protonmail.com',
  'yahoo.com', 'fastmail.com',
])
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])

/**
 * Canonicaliza un email para deduplicación y lookup de login. Sin esto, un bot
 * evade el chequeo de "email ya registrado" (y la auto-purga) creando variantes
 * infinitas de una misma bandeja: colon+1@gmail.com, colon+2@gmail.com,
 * c.o.l.o.n@gmail.com… todas Gmail reales (no caen en la denylist de
 * desechables) pero el mismo inbox. Es el mismo abuso de registro masivo, por
 * otra puerta. Solo se normaliza para proveedores que de hecho colapsan esas
 * variantes a una sola bandeja, para no romper la entrega a dominios propios
 * que sí tratan "+tag" como dirección literal.
 * @param {string} email
 * @returns {string} email canónico en minúsculas (o '' si es inválido).
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return ''
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0) return trimmed
  let local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  if (PLUS_SUBADDRESS_DOMAINS.has(domain)) {
    const plus = local.indexOf('+')
    if (plus >= 0) local = local.slice(0, plus)
  }
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '')
  }
  return local ? `${local}@${domain}` : trimmed
}

module.exports = {
  isDisposableEmail,
  normalizeEmail,
  DISPOSABLE_DOMAINS,
  BLOCKED_TLDS,
  PLUS_SUBADDRESS_DOMAINS,
}
