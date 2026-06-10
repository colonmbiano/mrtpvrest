'use strict';

const { prisma } = require('@mrtpvrest/database');
const createLogger = require('./logger');

const log = createLogger('audit');

const AUDIT_EVENTS = Object.freeze({
  SHIFT_OPEN: 'SHIFT_OPEN',
  SHIFT_CLOSE: 'SHIFT_CLOSE',
  ORDER_CANCEL: 'ORDER_CANCEL',
  DISCOUNT_APPLIED: 'DISCOUNT_APPLIED',
});

const VALID_EVENTS = new Set(Object.values(AUDIT_EVENTS));

function actorFromRequest(req) {
  if (req.user?.isDevice) {
    return { actorType: 'SYSTEM', actorId: req.user.id, actorName: req.user.name };
  }
  if (req.user?.isEmployee) {
    return { actorType: 'EMPLOYEE', actorId: req.user.id, actorName: req.user.name };
  }
  if (req.user?.id) {
    return { actorType: 'USER', actorId: req.user.id, actorName: req.user.name };
  }
  return { actorType: 'SYSTEM', actorId: null, actorName: 'SYSTEM' };
}

function buildAuditData(req, event, details = {}) {
  if (!VALID_EVENTS.has(event)) {
    throw new Error(`Evento de auditoría no soportado: ${event}`);
  }

  const tenantId =
    req.user?.tenantId ||
    req.restaurant?.tenantId ||
    req.tenant?.tenantId ||
    req.tenant?.id;
  if (!tenantId) throw new Error(`tenantId requerido para auditoría ${event}`);

  return {
    tenantId,
    restaurantId: req.restaurantId || req.user?.restaurantId || null,
    locationId: req.locationId || req.user?.locationId || null,
    ...actorFromRequest(req),
    action: event,
    resource: details.resource || null,
    before: details.before ?? null,
    after: details.after ?? null,
    reason: details.reason || null,
    correlationId: req.correlationId || null,
    ipAddress: req.ip || null,
    userAgent: req.get?.('user-agent') || null,
  };
}

async function record(req, event, details = {}, db = prisma) {
  const data = buildAuditData(req, event, details);
  const created = await db.accessLog.create({
    data,
    select: { id: true, action: true, createdAt: true, correlationId: true },
  });
  log.info('business_event', {
    correlationId: data.correlationId,
    auditId: created.id,
    action: event,
    resource: data.resource,
    restaurantId: data.restaurantId,
    locationId: data.locationId,
    actorId: data.actorId,
  });
  return created;
}

module.exports = { AUDIT_EVENTS, buildAuditData, record };
