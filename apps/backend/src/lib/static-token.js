'use strict';

// Tokens fijos de endpoints internos (BOT_ALERT_TOKEN, BOT_METRICS_TOKEN). Se leen
// del header, igual que bot-auth.middleware (Authorization: Bearer o X-Bot-Token).
// `?token=` solo con allowQuery: una URL termina en logs e historiales (el registro
// de accesos la oculta, ver access-log.js).
const crypto = require('crypto');

function presentedToken(req, { allowQuery = false } = {}) {
  const header = String(req.headers.authorization || '');
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const botHeader = String(req.headers['x-bot-token'] || '').trim();
  if (botHeader) return botHeader;
  return allowQuery && typeof req.query?.token === 'string' ? req.query.token : '';
}

const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();

// Compara en tiempo constante; los sha256 miden lo mismo, así no se filtra el largo.
function matchesStaticToken(req, expected, options) {
  const presented = presentedToken(req, options);
  if (!expected || !presented) return false;
  return crypto.timingSafeEqual(digest(presented), digest(expected));
}

module.exports = { matchesStaticToken };
