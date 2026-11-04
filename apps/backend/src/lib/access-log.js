'use strict';

// Registro de accesos (morgan) sin secretos. Algunos webhooks todavía reciben su
// token en la query string (el bot de WhatsApp llama a /api/bot-alert?token=...) y
// el formato `combined` escribe la URL completa y el Referer en los logs de Railway.
// Aquí los valores de esos parámetros se reemplazan por [REDACTED].
const morgan = require('morgan');

const SENSITIVE_PARAM = /^(token|access_token|refresh_token|id_token|api_?key|key|secret|password|signature|sig|hub\.verify_token)$/i;

function paramName(raw) {
  try { return decodeURIComponent(raw.replace(/\+/g, ' ')); } catch { return raw; }
}

function redactUrl(url) {
  const raw = String(url ?? '');
  const q = raw.indexOf('?');
  if (q === -1) return raw;
  const query = raw.slice(q + 1).split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1 || !SENSITIVE_PARAM.test(paramName(pair.slice(0, eq)))) return pair;
    return `${pair.slice(0, eq)}=[REDACTED]`;
  });
  return `${raw.slice(0, q + 1)}${query.join('&')}`;
}

// Reemplaza los tokens :url y :referrer de morgan, que usan `combined` y `dev`.
morgan.token('url', (req) => redactUrl(req.originalUrl || req.url));
morgan.token('referrer', (req) => {
  const referrer = req.headers.referer || req.headers.referrer;
  return referrer ? redactUrl(referrer) : undefined;
});

function accessLog({ format = process.env.NODE_ENV === 'production' ? 'combined' : 'dev', stream } = {}) {
  return morgan(format, stream ? { stream } : undefined);
}

module.exports = { accessLog, redactUrl };
