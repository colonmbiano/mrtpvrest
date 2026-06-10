'use strict';

const createLogger = require('../lib/logger');
const { recordSystemLog } = require('../lib/system-log');
const { GENERIC_MESSAGE } = require('./error.middleware');

const log = createLogger('legacy-http-error');

// Compatibilidad durante la migración de handlers antiguos que todavía hacen
// res.status(500).json(...). Evita filtrar mensajes internos y registra el
// correlationId sin cambiar contratos 4xx ni rutas exitosas.
function legacyErrorResponseMiddleware(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (res.statusCode < 500) return originalJson(body);

    const internalMessage =
      body && typeof body === 'object' && typeof body.error === 'string'
        ? body.error
        : 'Legacy 5xx response';
    const errorCode =
      body && typeof body === 'object' && (body.errorCode || body.code)
        ? body.errorCode || body.code
        : 'INTERNAL_ERROR';

    log.error('legacy_5xx_response', {
      correlationId: req.correlationId,
      errorCode,
      statusCode: res.statusCode,
      path: req.originalUrl || req.path,
      method: req.method,
      internalMessage,
    });

    recordSystemLog({
      level: 'CRITICAL',
      message: internalMessage,
      path: req.originalUrl || req.path,
      method: req.method,
      tenantId: req.user?.tenantId ?? req.tenant?.tenantId ?? null,
      metadata: {
        correlationId: req.correlationId,
        errorCode,
        statusCode: res.statusCode,
        restaurantId: req.user?.restaurantId ?? req.restaurantId ?? null,
        locationId: req.user?.locationId ?? req.locationId ?? null,
        legacyResponse: true,
      },
    }).catch(() => {});

    return originalJson({
      error: GENERIC_MESSAGE,
      message: GENERIC_MESSAGE,
      errorCode,
      code: errorCode,
      correlationId: req.correlationId,
    });
  };

  next();
}

module.exports = legacyErrorResponseMiddleware;
