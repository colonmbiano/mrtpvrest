'use strict';

const { round2 } = require('./money');
const audit = require('./audit-logger');

function controlError(message, code, status = 409) {
  return Object.assign(new Error(message), { status, code });
}

function requiredReason(value, label = 'Escribe el motivo de la operación.') {
  const reason = typeof value === 'string' ? value.trim().slice(0, 500) : '';
  if (reason.length < 5) throw controlError(label, 'REASON_REQUIRED', 400);
  return reason;
}

async function assertOpenPaymentPeriod(tx, order, restaurantId) {
  if (!order || order.restaurantId !== restaurantId) throw controlError('Pedido no encontrado.', 'ORDER_NOT_FOUND', 404);
  const periods = [];
  if (order.shiftId) periods.push({ id: order.shiftId });
  if (order.paidAt) periods.push({ openedAt: { lte: order.paidAt }, closedAt: { gte: order.paidAt } });
  if (periods.length) {
    const closed = await tx.cashShift.findFirst({
      where: { locationId: order.locationId, isOpen: false, OR: periods }, select: { id: true },
    });
    if (closed) throw controlError('El cobro pertenece a un corte cerrado. Conserva el histórico y registra una incidencia para conciliación.', 'CLOSED_SHIFT_LOCKED');
  }
  if (order.deliveryDriverId) {
    const approved = await tx.driverCashMovement.findFirst({
      where: { orderId: order.id, driverId: order.deliveryDriverId, type: 'INCOME', category: 'DELIVERY', approved: true },
      select: { id: true },
    });
    if (approved) throw controlError('El repartidor ya liquidó este pedido. Su corte no puede reescribirse.', 'CLOSED_DRIVER_CUT_LOCKED');
  }
}

const DIGITAL_METHODS = {
  TRANSFER: ['TRANSFER', 'SPEI', 'OXXO'], CARD: ['CARD', 'CARD_PRESENT'],
};

function digitalPaymentEntries(order) {
  const tenders = (order.payments || []).filter((p) => p.status === 'PAID');
  return Object.entries(DIGITAL_METHODS).flatMap(([method, aliases]) => {
    const amount = round2(tenders.length
      ? tenders.filter((p) => aliases.includes(p.method)).reduce((n, p) => n + Number(p.amount), 0)
      : aliases.includes(order.paymentMethod) ? Number(order.total) : 0);
    if (amount <= 0) return [];
    const prefix = method === 'TRANSFER' ? 'transfer' : 'card';
    return [{ id: order.id, orderNumber: order.orderNumber, method, amount,
      customerName: order.customerName || null, driverId: order.deliveryDriverId || null,
      paidAt: order.paidAt, verified: order[`${prefix}Verified`] === true,
      verifiedAt: order[`${prefix}VerifiedAt`] || null,
      verifiedBy: order[`${prefix}VerifiedBy`] || null,
      reference: order[`${prefix}VerificationReference`] || null }];
  });
}

async function verifyOrderPayment(tx, order, body, req) {
  if (order.paymentStatus !== 'PAID') throw controlError('Confirma primero el pago del pedido.', 'PAYMENT_NOT_PAID');
  const method = body.method || (order.paymentMethod === 'CARD' || order.paymentMethod === 'CARD_PRESENT' ? 'CARD' : 'TRANSFER');
  const entry = digitalPaymentEntries(order).find((p) => p.method === method);
  if (!entry) throw controlError('El pedido no tiene un cobro con ese método.', 'PAYMENT_METHOD_MISMATCH', 400);
  const verified = body.verified !== false;
  const reference = verified ? requiredReason(body.reference, 'Escribe la referencia del banco o de la terminal (mínimo 5 caracteres).') : null;
  const reason = verified ? null : requiredReason(body.reason, 'Escribe por qué se retira la verificación.');
  const prefix = method === 'TRANSFER' ? 'transfer' : 'card';
  const updated = await tx.order.update({
    where: { id: order.id, restaurantId: order.restaurantId, paymentStatus: 'PAID' },
    data: { [`${prefix}Verified`]: verified, [`${prefix}VerifiedAt`]: verified ? new Date() : null,
      [`${prefix}VerifiedBy`]: verified ? (req.user?.name || req.user?.id) : null,
      [`${prefix}VerificationReference`]: reference },
  });
  await audit.record(req, audit.AUDIT_EVENTS.PAYMENT_VERIFY, {
    resource: `order:${order.id}`, reason,
    before: { method, verified: entry.verified, reference: entry.reference },
    after: { method, verified, reference, amount: entry.amount },
  }, tx);
  return updated;
}

async function shiftControlSummary(tx, shift, restaurantId) {
  const end = shift.closedAt || new Date();
  const drivers = await tx.employee.findMany({
    where: { locationId: shift.locationId, role: 'DELIVERY' }, select: { id: true, name: true },
  });
  const movements = drivers.length ? await tx.driverCashMovement.findMany({
    where: { driverId: { in: drivers.map((d) => d.id) }, approved: false },
  }) : [];
  const driverReceipts = drivers.flatMap((driver) => {
    const pending = movements.filter((m) => m.driverId === driver.id);
    if (!pending.length) return [];
    const sum = (type) => pending.filter((m) => m.type === type).reduce((n, m) => n + Number(m.amount), 0);
    return [{ driverId: driver.id, name: driver.name, movements: pending.length,
      expectedCash: round2(sum('FLOAT') + sum('INCOME') - sum('EXPENSE') - sum('RETURN')) }];
  });
  const orders = await tx.order.findMany({
    where: { restaurantId, locationId: shift.locationId,
      OR: [{ paidAt: { gte: shift.openedAt, lte: end } },
        { createdAt: { gte: shift.openedAt, lte: end } }] },
    include: { payments: { select: { method: true, amount: true, status: true } } },
  });
  const unverified = orders.filter((o) => o.paymentStatus === 'PAID' && o.status !== 'CANCELLED')
    .flatMap(digitalPaymentEntries).filter((p) => !p.verified);
  const unassigned = orders.filter((o) => o.orderType === 'DELIVERY' && !o.deliveryDriverId
    && !['CANCELLED', 'PENDING_PAYMENT', 'PENDING_MERCHANT'].includes(o.status));
  const settling = new Set(movements.filter((m) => m.type === 'INCOME' && m.category === 'DELIVERY').map((m) => m.orderId));
  const unpaid = orders.filter((o) => o.paymentStatus !== 'PAID' && o.status !== 'CANCELLED' && !settling.has(o.id));
  const expenses = drivers.length ? await tx.driverCashMovement.findMany({
    where: { driverId: { in: drivers.map((d) => d.id) }, type: 'EXPENSE',
      OR: [{ shiftId: shift.id }, { shiftId: null, createdAt: { gte: shift.openedAt, lte: end } }] },
  }) : [];
  const missingReceipts = expenses.filter((m) => !m.photoUrl && m.receiptStatus !== 'EXCEPTION');
  const warnings = [
    { code: 'UNVERIFIED_PAYMENTS', count: unverified.length, amount: round2(unverified.reduce((n, p) => n + p.amount, 0)), label: 'Pagos digitales sin verificar' },
    { code: 'UNASSIGNED_DELIVERIES', count: unassigned.length, label: 'Domicilios sin responsable' },
    { code: 'UNPAID_ORDERS', count: unpaid.length, amount: round2(unpaid.reduce((n, o) => n + Number(o.total), 0)), label: 'Pedidos sin cobrar' },
    { code: 'MISSING_RECEIPTS', count: missingReceipts.length, amount: round2(missingReceipts.reduce((n, m) => n + Number(m.amount), 0)), label: 'Gastos sin comprobante o excepción autorizada' },
  ].filter((w) => w.count > 0);
  const responsibles = await tx.employee.findMany({
    where: { locationId: shift.locationId, isActive: true }, select: { id: true, name: true, role: true },
  });
  return { driverReceipts, warnings, unverifiedPayments: unverified, responsibles,
    unassignedDeliveries: unassigned.map((o) => ({ id: o.id, orderNumber: o.orderNumber, total: o.total, status: o.status })),
    missingReceipts: missingReceipts.map((m) => ({ id: m.id, driverId: m.driverId, amount: m.amount, description: m.description })) };
}

module.exports = { controlError, requiredReason, assertOpenPaymentPeriod, digitalPaymentEntries,
  verifyOrderPayment, shiftControlSummary };
