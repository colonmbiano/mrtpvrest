'use strict';

const { randomUUID } = require('node:crypto');
const { runWithTenant } = require('@mrtpvrest/database');

const CORRELATION_HEADER = 'x-correlation-id';
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeCorrelationId(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  return SAFE_CORRELATION_ID.test(trimmed) ? trimmed : null;
}

function correlationIdMiddleware(req, res, next) {
  const correlationId =
    normalizeCorrelationId(req.headers[CORRELATION_HEADER]) || randomUUID();

  req.correlationId = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  runWithTenant({ correlationId }, () => next());
}

module.exports = correlationIdMiddleware;
module.exports.CORRELATION_HEADER = CORRELATION_HEADER;
module.exports.normalizeCorrelationId = normalizeCorrelationId;
