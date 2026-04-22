// Sentry opcional. Se activa cuando SENTRY_DSN está definida Y el paquete
// @sentry/node está instalado. Se evita require directo para no romper si el
// paquete no está — el scaffold queda listo para activar en prod:
//   1. pnpm add @sentry/node --filter @mrtpvrest/backend
//   2. set SENTRY_DSN en el entorno Railway
// Sin ambas, noop total.

const log = require('./logger')('sentry');

let Sentry = null;
let enabled = false;

function init() {
  if (!process.env.SENTRY_DSN) {
    log.debug('disabled', { reason: 'SENTRY_DSN no definido' });
    return { enabled: false, Sentry: null };
  }
  try {
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/node');
  } catch (e) {
    log.warn('module.missing', { hint: 'Instala @sentry/node para activar', err: e.message });
    return { enabled: false, Sentry: null };
  }
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    });
    enabled = true;
    log.info('initialized', { environment: process.env.NODE_ENV });
  } catch (e) {
    log.error('init.failed', { err: e });
  }
  return { enabled, Sentry };
}

function requestHandler() {
  if (enabled && Sentry?.Handlers?.requestHandler) return Sentry.Handlers.requestHandler();
  return (_req, _res, next) => next();
}

function errorHandler() {
  if (enabled && Sentry?.Handlers?.errorHandler) return Sentry.Handlers.errorHandler();
  return (err, _req, _res, next) => next(err);
}

function captureException(err, context) {
  if (enabled && Sentry?.captureException) Sentry.captureException(err, context);
}

module.exports = { init, requestHandler, errorHandler, captureException };
