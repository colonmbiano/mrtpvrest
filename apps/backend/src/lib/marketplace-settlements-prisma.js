'use strict';

// Adaptadores financieros v1. La reserva se confirma ANTES de llamar a la
// pasarela; la clave estable permite recuperarla sin volver a cobrar/reembolsar.
// No se inicia ningún worker ni se conecta a la BD al importar este módulo.
const { randomUUID } = require('node:crypto');
const { createSettlementsV1Service, SettlementsV1Error, allocate, refundLedger } = require('./marketplace-settlements-v1');
const { createMarketplacePaymentGateway } = require('./marketplace-payment-gateway');
const { buildOrderSettlementTransaction, recordLedgerTransaction } = require('./marketplace-ledger');
const { cents, MAX_CENTS } = require('./marketplace-order-money');

const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 };
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const PARTS = ['merchant', 'platform', 'courier'];
const emptyParts = () => ({ merchant: 0, platform: 0, courier: 0 });
function check(ok, code, message, status = 409) {
  if (!ok) throw new SettlementsV1Error(code, message, status);
}
function int(value) { return Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS; }
function actorId(actor) {
  check(actor?.isActive === true && actor.isDevice !== true && ID.test(actor.accountId || '')
    && Array.isArray(actor.roles), 'UNAUTHENTICATED', 'Sesion humana activa requerida', 401);
  return actor.accountId;
}
function finance(actor) {
  actorId(actor);
  check(actor.roles.some(role => ['SUPER_ADMIN', 'FINANCE'].includes(role)), 'REFUND_FORBIDDEN', 'Operacion financiera no autorizada', 403);
}
function result(row, replayed) {
  const d = row.data;
  return { refundId: row.id, orderId: row.orderId, amountCents: row.amountCents,
    refundedCents: d.refundedCents, remainingCents: d.remainingCents,
    paymentStatus: d.paymentStatus, status: row.status, replayed };
}

// Reparto propio: la tienda conserva TODO el envío. La red solo recibe una
// cuenta por pagar si existe una asignación de red y el snapshot lo respalda.
function financialParts(pipeline) {
  const s = pipeline.settlement;
  check(s && [s.totalCents, s.subtotalCents, s.deliveryFeeCents, s.platformFeeCents].every(int),
    'ORDER_INTEGRITY_ERROR', 'Snapshot financiero invalido', 503);
  const manual = pipeline.dispatch?.task?.deliveryPolicy === 'MANUAL';
  const parts = manual
    ? { merchant: s.subtotalCents - s.platformFeeCents + s.deliveryFeeCents, platform: s.platformFeeCents, courier: 0 }
    : { merchant: s.merchantPayoutCents, platform: s.platformFeeCents, courier: s.courierPayoutCents };
  check(PARTS.every(part => int(parts[part])) && PARTS.reduce((sum, part) => sum + parts[part], 0) === s.totalCents,
    'ORDER_INTEGRITY_ERROR', 'Distribucion financiera inconsistente', 503);
  return parts;
}

function createMarketplaceSettlementsPrisma({ prisma, getGateway = createMarketplacePaymentGateway,
  env = process.env, now = () => new Date() } = {}) {
  check(prisma?.$transaction && prisma.marketplaceRefund && prisma.marketplaceFinanceOutbox,
    'SETTLEMENTS_UNAVAILABLE', 'Persistencia financiera no disponible', 503);
  const at = () => { const date = now(); check(date instanceof Date && Number.isFinite(date.getTime()),
    'INVALID_CLOCK', 'Reloj invalido', 503); return date; };
  async function transaction(work) {
    for (let retry = 0; ; retry++) {
      try { return await prisma.$transaction(work, TX); }
      catch (error) { if (error?.code !== 'P2034' || retry >= 2) throw error; }
    }
  }
  async function canManage(actor, restaurantId, db = prisma) {
    actorId(actor);
    const restaurant = await db.restaurant.findFirst({ where: { id: restaurantId, isActive: true },
      select: { id: true, tenantId: true } });
    if (!restaurant) return false;
    if (actor.roles.includes('SUPER_ADMIN')) return true;
    return actor.roles.some(role => ['ADMIN', 'MERCHANT_OWNER', 'FINANCE'].includes(role))
      && actor.tenantId === restaurant.tenantId
      && (actor.restaurantId === restaurantId || actor.merchantIds?.includes(restaurantId));
  }
  async function pipeline(db, orderId, lock = false) {
    check(ID.test(orderId), 'INVALID_ORDER', 'Orden invalida', 400);
    if (lock) {
      const scope = await db.marketplaceOrderPipeline.findFirst({ where: { orderId }, select: { restaurantId: true } });
      check(scope, 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
      // Mismo orden de locks que retiros: comercio, después orden. Las reservas
      // de retiro y de reembolso no pueden consumir la misma obligación.
      await db.$queryRaw`SELECT "id" FROM "restaurants" WHERE "id" = ${scope.restaurantId} FOR UPDATE`;
      await db.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} AND "restaurantId" = ${scope.restaurantId} FOR UPDATE`;
    }
    const row = await db.marketplaceOrderPipeline.findFirst({ where: { orderId, order: { is: { source: 'MARKETPLACE' } } },
      include: { order: true } });
    check(row && row.order?.id === orderId && row.order.restaurantId === row.restaurantId,
      'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    check(row.currency === 'MXN', 'ORDER_INTEGRITY_ERROR', 'Moneda no compatible', 503);
    return row;
  }
  async function authorized(actor, row, db) {
    check(await canManage(actor, row.restaurantId, db), 'MERCHANT_FORBIDDEN', 'No tienes permiso sobre este comercio', 403);
  }
  async function captured(db, row) {
    check(row.paymentMethod === 'ONLINE' && row.order.paymentProvider === 'MERCADOPAGO' && row.order.paymentProviderId,
      'NO_PROVIDER_PAYMENT', 'La orden no tiene pago en el proveedor', 409);
    const payment = await db.marketplacePayment.findFirst({ where: { restaurantId: row.restaurantId,
      orderId: row.orderId, providerPaymentId: row.order.paymentProviderId, provider: 'MERCADOPAGO' } });
    check(payment && ['CAPTURED', 'REFUNDED'].includes(payment.status) && payment.currency === 'MXN'
      && cents(payment.amount) === row.settlement.totalCents, 'ORDER_NOT_PAID', 'Pago capturado no encontrado', 409);
    return payment;
  }
  async function ledger(db, row, payment) {
    const lines = await db.marketplaceLedgerEntry.findMany({ where: { restaurantId: row.restaurantId,
      orderId: row.orderId, paymentId: payment.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    const captures = lines.filter(line => line.eventType === 'ORDER_CAPTURED');
    check(captures.length === 2 && captures.some(line => line.type === 'DEBIT' && line.account === 'CUSTOMER_RECEIVABLE'
      && cents(line.amount) === row.settlement.totalCents) && captures.some(line => line.type === 'CREDIT'
      && line.account === 'GATEWAY_ESCROW' && cents(line.amount) === row.settlement.totalCents),
    'LEDGER_INTEGRITY_ERROR', 'La captura no esta respaldada en el libro', 503);
    return lines;
  }
  async function refunded(db, row) {
    const rows = await db.marketplaceRefund.findMany({ where: { restaurantId: row.restaurantId,
      orderId: row.orderId, status: 'POSTED' } });
    const parts = emptyParts(); let total = 0;
    for (const item of rows) {
      check(int(item.amountCents) && PARTS.every(part => int(item.data?.allocation?.[part])),
        'REFUND_INTEGRITY_ERROR', 'Historial de reembolsos inconsistente', 503);
      total += item.amountCents;
      for (const part of PARTS) parts[part] += item.data.allocation[part];
    }
    check(total <= row.settlement.totalCents && PARTS.reduce((sum, part) => sum + parts[part], 0) === total,
      'REFUND_INTEGRITY_ERROR', 'Historial de reembolsos inconsistente', 503);
    return { total, parts };
  }
  async function append(db, row, eventType, id, payload) {
    return db.marketplaceFinanceOutbox.create({ data: { id: randomUUID(), restaurantId: row.restaurantId,
      orderId: row.orderId, eventKey: `${eventType}:${id}`, eventType, payload, availableAt: at() } });
  }
  async function reserve({ actor, orderId, request, requestHash, keyHash }) {
    finance(actor);
    return transaction(async db => {
      const row = await pipeline(db, orderId, true); await authorized(actor, row, db);
      const old = await db.marketplaceRefund.findFirst({ where: { restaurantId: row.restaurantId, keyHash } });
      if (old) {
        check(old.requestHash === requestHash && old.orderId === orderId, 'IDEMPOTENCY_CONFLICT', 'Clave usada para otro reembolso');
        return old;
      }
      const active = await db.marketplaceRefund.findFirst({ where: { restaurantId: row.restaurantId, activeOrderId: orderId } });
      check(!active, 'REFUND_IN_PROGRESS', 'Hay un reembolso pendiente de conciliacion');
      const payment = await captured(db, row); const lines = await ledger(db, row, payment);
      const prior = await refunded(db, row); const parts = financialParts(row);
      const remaining = row.settlement.totalCents - prior.total;
      check(remaining > 0 && row.order.paymentStatus === 'PAID', 'ORDER_ALREADY_REFUNDED', 'La orden no tiene saldo reembolsable');
      const amount = request.amountCents ?? remaining;
      check(int(amount) && amount > 0 && amount <= remaining, 'REFUND_EXCEEDS_PAYMENT', 'El reembolso excede el saldo');
      const balances = Object.fromEntries(PARTS.map(part => [part, parts[part] - prior.parts[part]]));
      const allocation = allocate(amount, balances);
      const settled = lines.some(line => line.eventType === 'ORDER_SETTLED');
      if (settled && allocation.courier > 0) {
        const payable = lines.filter(line => line.account === 'COURIER_PAYABLE')
          .reduce((sum, line) => sum + (line.type === 'CREDIT' ? 1 : -1) * cents(line.amount), 0);
        check(payable >= allocation.courier, 'PAYOUT_RECONCILIATION_REQUIRED', 'Concilia primero el retiro del repartidor');
        const pending = await db.marketplaceDriverPayout.count({ where: { restaurantId: row.restaurantId, status: 'PENDING' } });
        check(pending === 0, 'PAYOUT_RECONCILIATION_REQUIRED', 'Hay retiros pendientes que reservan el saldo');
      }
      const id = randomUUID();
      const data = { actorId: actor.accountId, reason: request.reason, paymentId: payment.id,
        providerPaymentId: payment.providerPaymentId, collectorId: row.collectorId, allocation, settled,
        courierId: row.dispatch?.task?.currentAssignment?.courierId ?? row.dispatch?.assignment?.courierId ?? null,
        previousRefundedCents: prior.total, refundedCents: prior.total + amount, remainingCents: remaining - amount,
        paymentStatus: remaining === amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED' };
      check(data.collectorId, 'PAYMENT_INTEGRITY_ERROR', 'Cobrador del pago no registrado', 503);
      return db.marketplaceRefund.create({ data: { id, restaurantId: row.restaurantId, orderId, keyHash, requestHash,
        activeOrderId: orderId, amountCents: amount, data, status: 'PENDING' } });
    });
  }
  async function complete(reservation) {
    if (reservation.status === 'POSTED') return result(reservation, true);
    const gateway = await getGateway({ restaurantId: reservation.restaurantId, prismaClient: prisma, env });
    check(String(gateway.collectorId) === String(reservation.data.collectorId),
      'PAYMENT_CONFIGURATION_CHANGED', 'Cambio la cuenta del cobrador', 503);
    const response = await gateway.refundPayment({ paymentId: reservation.data.providerPaymentId,
      amountCents: reservation.amountCents, idempotencyKey: `marketplace-refund:${reservation.keyHash}` });
    check(response?.status === 'approved' && response.id && String(response.paymentId) === String(reservation.data.providerPaymentId)
      && response.amountCents === reservation.amountCents, 'PROVIDER_REFUND_PENDING', 'Reembolso pendiente de confirmacion', 503);
    return transaction(async db => {
      const row = await pipeline(db, reservation.orderId, true);
      const current = await db.marketplaceRefund.findFirst({ where: { id: reservation.id, restaurantId: reservation.restaurantId } });
      if (current?.status === 'POSTED') return result(current, true);
      check(current?.status === 'PENDING' && current.activeOrderId === row.orderId, 'REFUND_CONFLICT', 'La reserva cambio');
      const prior = await refunded(db, row);
      check(prior.total === current.data.previousRefundedCents, 'REFUND_CONFLICT', 'Cambio el saldo de la orden');
      const payment = await captured(db, row);
      const tx = refundLedger({ orderId: row.orderId, amount: current.amountCents,
        allocation: current.data.allocation, settled: current.data.settled });
      await recordLedgerTransaction({ transaction: tx, paymentId: payment.id, restaurantId: row.restaurantId,
        idempotencyKey: `refund:${current.id}`, courierId: current.data.courierId, prismaClient: db,
        reservedAmountCents: current.amountCents });
      if (current.data.paymentStatus === 'REFUNDED') {
        const changed = await db.order.updateMany({ where: { id: row.orderId, restaurantId: row.restaurantId,
          paymentStatus: 'PAID' }, data: { paymentStatus: 'REFUNDED' } });
        check(changed.count === 1, 'REFUND_CONFLICT', 'Cambio el estado del pago');
        await db.marketplacePayment.updateMany({ where: { id: payment.id, restaurantId: row.restaurantId, status: 'CAPTURED' },
          data: { status: 'REFUNDED', refundedAt: at() } });
      }
      const changed = await db.marketplaceRefund.updateMany({ where: { id: current.id, restaurantId: row.restaurantId, status: 'PENDING' },
        data: { status: 'POSTED', activeOrderId: null, providerRefundId: String(response.id) } });
      check(changed.count === 1, 'REFUND_CONFLICT', 'Cambio el reembolso');
      const posted = { ...current, status: 'POSTED', activeOrderId: null, providerRefundId: String(response.id) };
      await append(db, row, 'OrderRefunded', current.id, { orderId: row.orderId, refundId: current.id,
        amountCents: current.amountCents, paymentStatus: current.data.paymentStatus });
      return result(posted, false);
    });
  }
  const refundCoordinator = { refund: async input => complete(await reserve(input)) };
  async function reconcileOrder(actor, orderId) {
    finance(actor);
    return transaction(async db => {
      const row = await pipeline(db, orderId, true); await authorized(actor, row, db);
      check(row.order.status === 'DELIVERED', 'ORDER_NOT_DELIVERED', 'La orden no esta entregada');
      const payment = await captured(db, row); const lines = await ledger(db, row, payment);
      const existing = lines.find(line => line.eventType === 'ORDER_SETTLED');
      if (existing) return { orderId, transactionId: existing.transactionId, replayed: true };
      check(!await db.marketplaceRefund.findFirst({ where: { restaurantId: row.restaurantId, activeOrderId: orderId } }),
        'REFUND_IN_PROGRESS', 'Hay un reembolso pendiente de conciliacion');
      const prior = await refunded(db, row); const original = financialParts(row);
      const remaining = row.settlement.totalCents - prior.total;
      check(remaining > 0, 'ORDER_ALREADY_REFUNDED', 'La orden no tiene saldo para liquidar');
      const parts = Object.fromEntries(PARTS.map(part => [part, original[part] - prior.parts[part]]));
      const courierId = row.dispatch?.task?.currentAssignment?.courierId ?? row.dispatch?.assignment?.courierId;
      check(parts.courier === 0 || courierId, 'COURIER_NOT_ASSIGNED', 'Falta la asignacion de red', 503);
      const tx = buildOrderSettlementTransaction({ orderId, referenceId: payment.providerPaymentId, settlement: {
        customerTotal: remaining / 100, merchantPayout: parts.merchant / 100,
        courierPayout: parts.courier / 100, platformFee: parts.platform / 100 } });
      await recordLedgerTransaction({ transaction: tx, paymentId: payment.id, restaurantId: row.restaurantId,
        idempotencyKey: `settlement-v1:${orderId}`, courierId, prismaClient: db, reservedAmountCents: remaining });
      await append(db, row, 'OrderSettled', orderId, { orderId, merchantPayoutCents: parts.merchant,
        courierPayoutCents: parts.courier, platformFeeCents: parts.platform });
      return { orderId, transactionId: tx.id, replayed: false };
    });
  }
  const settlementStore = {
    async listByMerchant(merchantId, { limit }) {
      const groups = await prisma.marketplaceLedgerEntry.groupBy({ by: ['orderId'],
        where: { restaurantId: merchantId, eventType: 'ORDER_SETTLED' },
        _max: { createdAt: true }, orderBy: { _max: { createdAt: 'desc' } }, take: limit });
      return Promise.all(groups.map(async group => {
        const lines = await prisma.marketplaceLedgerEntry.findMany({ where: { restaurantId: merchantId, orderId: group.orderId,
          eventType: { in: ['ORDER_CAPTURED', 'ORDER_SETTLED', 'ORDER_REFUNDED'] } } });
        const balance = account => lines.filter(line => line.account === account)
          .reduce((sum, line) => sum + (line.type === 'CREDIT' ? 1 : -1) * cents(line.amount), 0);
        return { id: `order:${group.orderId}`, merchantId, periodStart: group._max.createdAt, periodEnd: group._max.createdAt,
          grossSalesCents: 0 - balance('CUSTOMER_RECEIVABLE'), commissionCents: balance('PLATFORM_FEES'),
          netPayoutCents: balance('MERCHANT_PAYABLE'), status: 'ACCRUED', paidAt: null, externalTransferId: null };
      }));
    },
  };
  // Los puertos de escritura simples no se usan en producción: refundCoordinator
  // dirige la reserva/confirmación para evitar llamadas externas dentro de una TX.
  const service = createSettlementsV1Service({ settlementStore, merchantAccess: { canManage }, refundCoordinator,
    unitOfWork: { run: transaction }, orderStore: { findOrder: orderId => pipeline(prisma, orderId) },
    refundStore: { findByKey: keyHash => prisma.marketplaceRefund.findUnique({ where: { keyHash } }) },
    ledgerStore: { post: recordLedgerTransaction }, outboxStore: { append }, paymentGateway: { getGateway }, now });
  async function recoverRefunds(actor, { limit = 25 } = {}) {
    finance(actor); check(actor.roles.includes('SUPER_ADMIN'), 'REFUND_FORBIDDEN', 'Recuperacion global solo para SUPER_ADMIN', 403);
    check(Number.isInteger(limit) && limit > 0 && limit <= 100, 'INVALID_LIMIT', 'Limite invalido', 400);
    const rows = await prisma.marketplaceRefund.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: limit });
    const results = [];
    for (const row of rows) {
      try { results.push(await complete(row)); }
      catch (error) { results.push({ refundId: row.id, status: 'PENDING', errorCode: error.code || 'PROVIDER_UNAVAILABLE' }); }
    }
    return { items: results };
  }
  async function drainOutbox({ publish, limit = 25 } = {}) {
    check(typeof publish === 'function' && Number.isInteger(limit) && limit > 0 && limit <= 100,
      'INVALID_PUBLISHER', 'Publicador y limite requeridos', 400);
    const date = at();
    const eligible = { status: 'PENDING', availableAt: { lte: date }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: date } }] };
    const rows = await prisma.marketplaceFinanceOutbox.findMany({ where: eligible, orderBy: { createdAt: 'asc' }, take: limit });
    const results = [];
    for (const row of rows) {
      const token = randomUUID();
      const claim = await prisma.marketplaceFinanceOutbox.updateMany({ where: { ...eligible, id: row.id, restaurantId: row.restaurantId },
        data: { leaseToken: token, leaseUntil: new Date(date.getTime() + 60000), attempts: { increment: 1 } } });
      if (claim.count !== 1) continue;
      try {
        // Entrega al menos una vez: el consumidor deduplica por eventKey.
        await publish({ eventKey: row.eventKey, restaurantId: row.restaurantId, orderId: row.orderId,
          eventType: row.eventType, payload: row.payload });
        const ack = await prisma.marketplaceFinanceOutbox.updateMany({ where: { id: row.id, restaurantId: row.restaurantId, leaseToken: token },
          data: { status: 'PUBLISHED', publishedAt: at(), leaseToken: null, leaseUntil: null } });
        results.push({ eventKey: row.eventKey, published: ack.count === 1 });
      } catch {
        await prisma.marketplaceFinanceOutbox.updateMany({ where: { id: row.id, restaurantId: row.restaurantId, leaseToken: token },
          data: { availableAt: new Date(at().getTime() + Math.min(3600000, 1000 * 2 ** Math.min(row.attempts, 12))), leaseToken: null, leaseUntil: null } });
        results.push({ eventKey: row.eventKey, published: false });
      }
    }
    return results;
  }
  return { ...service, reconcileOrder, recoverRefunds, drainOutbox, settlementStore };
}

module.exports = { createMarketplaceSettlementsPrisma, financialParts };
