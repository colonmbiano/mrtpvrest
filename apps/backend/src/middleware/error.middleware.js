'use strict';

const AppError = require('../lib/app-error');
const createLogger = require('../lib/logger');
const { recordSystemLog } = require('../lib/system-log');

const log = createLogger('http-error');
const GENERIC_MESSAGE = 'Ocurrió un error al procesar la solicitud';

function safePayload(body) {
  try {
    const serialized = JSON.stringify(body);
    if (serialized.length > 2000) return serialized.slice(0, 2000) + '...';
    return JSON.parse(serialized);
  } catch {
    return null;
  }
}

function errorMiddleware(err, req, res, _next) {
  const statusCode = Number(err?.statusCode || err?.status || 500);
  const operational = err instanceof AppError || err?.isOperational === true;
  const errorCode =
    err?.errorCode || err?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const publicMessage =
    operational && typeof err.message === 'string' ? err.message : GENERIC_MESSAGE;
  const isCritical = statusCode >= 500;

  log.error('request_failed', {
    correlationId: req.correlationId,
    errorCode,
    statusCode,
    path: req.originalUrl || req.path,
    method: req.method,
    err,
  });

  recordSystemLog({
    level: err?.level || (isCritical ? 'CRITICAL' : 'ERROR'),
    message: err?.message || 'Error sin mensaje',
    stack: err?.stack || null,
    path: req.originalUrl || req.path,
    method: req.method,
    tenantId: req.user?.tenantId ?? req.tenant?.tenantId ?? null,
    metadata: {
      correlationId: req.correlationId,
      errorCode,
      statusCode,
      ip: req.ip,
      userId: req.user?.id ?? null,
      role: req.user?.role ?? null,
      restaurantId: req.user?.restaurantId ?? req.restaurantId ?? null,
      locationId: req.user?.locationId ?? req.locationId ?? null,
      isDevice: Boolean(req.user?.isDevice),
      body: isCritical && req.body ? safePayload(req.body) : null,
    },
  }).catch(() => {});

  if (res.headersSent) return;
  res.status(statusCode).json({
    error: publicMessage,
    message: publicMessage,
    errorCode,
    code: errorCode,
    correlationId: req.correlationId,
  });
}

module.exports = errorMiddleware;
module.exports.GENERIC_MESSAGE = GENERIC_MESSAGE;
