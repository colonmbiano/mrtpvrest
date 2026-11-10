'use strict';

const STAFF = new Set(['CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN']);

function overrideReason(order, status, actor, value) {
  if (order.source !== 'MARKETPLACE' || status !== 'DELIVERED' || order.status === 'DELIVERED' || actor?.role === 'DELIVERY') return null;
  if (!STAFF.has(actor?.role)) {
    throw Object.assign(new Error('Solo el personal de tienda puede registrar una entrega sin código.'), {
      code: 'MARKETPLACE_DELIVERY_OVERRIDE_FORBIDDEN', statusCode: 403,
    });
  }
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length < 5 || reason.length > 200) {
    throw Object.assign(new Error('Escribe un motivo de 5 a 200 caracteres para entregar sin código.'), {
      code: 'DELIVERY_REASON_REQUIRED', statusCode: 422,
    });
  }
  return reason;
}

async function recordOverride(req, order, reason, tx) {
  const audit = require('./audit-logger');
  await audit.record(req, audit.AUDIT_EVENTS.MARKETPLACE_DELIVERED_WITHOUT_PIN, {
    resource: 'order:' + order.id, reason,
    before: { status: order.status }, after: { status: 'DELIVERED' },
  }, tx);
}

module.exports = { overrideReason, recordOverride };
