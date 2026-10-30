'use strict';

// Merchant settlements (read) and auditable refunds (write), plan §3, §6, §7.
// Money is integer cents throughout. The ledger builder is pesos-based, so entries are checked in
// cents first and converted at the boundary. Ports: settlementStore, ledgerStore, orderStore,
// outboxStore, refundStore, paymentGateway, merchantAccess and unitOfWork. No network or database here.
const crypto = require('node:crypto');
const { ACCOUNT_TYPES, ENTRY_TYPES, EVENT_TYPES, createLedgerTransaction } = require('./marketplace-ledger');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_CENTS = 100000000;
const REFUND_ROLES = ['SUPER_ADMIN', 'FINANCE'];
const PAID_STATUSES = ['PAID', 'PARTIALLY_REFUNDED'];
const PARTS = ['merchant', 'platform', 'courier'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const REFUND_FIELDS = ['amountCents', 'reason'];

class SettlementsV1Error extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.name = 'SettlementsV1Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function fail(code, message, statusCode) {
  throw new SettlementsV1Error(code, message, statusCode);
}
function check(ok, code, message, statusCode = 422) {
  if (!ok) fail(code, message, statusCode);
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
function portsReady(ports) {
  check(ports.settlementStore && ports.ledgerStore && ports.orderStore && ports.outboxStore && ports.refundStore
    && ports.paymentGateway && ports.merchantAccess && ports.unitOfWork, 'SETTLEMENTS_UNAVAILABLE', 'Liquidaciones no disponibles', 503);
}
function requireActor(actor) {
  check(actor && typeof actor.accountId === 'string' && Array.isArray(actor.roles), 'UNAUTHENTICATED', 'Sesion requerida', 401);
}
const isCents = value => Number.isSafeInteger(value) && value >= 0 && value <= MAX_CENTS;

// Splits an amount across the three payable accounts in proportion to what each still holds.
// Integer arithmetic with BigInt. Leftover cents go to the holders that still have capacity,
// in order of largest fractional part, so the split is exact and never exceeds a holder's balance.
function allocate(amount, remaining) {
  const total = PARTS.reduce((sum, part) => sum + remaining[part], 0);
  check(amount > 0 && amount <= total, 'REFUND_EXCEEDS_PAYMENT', 'El reembolso excede lo pagado', 409);
  const base = {};
  const fraction = {};
  let used = 0;
  for (const part of PARTS) {
    const numerator = BigInt(amount) * BigInt(remaining[part]);
    base[part] = Number(numerator / BigInt(total));
    fraction[part] = numerator % BigInt(total);
    used += base[part];
  }
  let leftover = amount - used;
  const order = [...PARTS].sort((a, b) => (fraction[a] === fraction[b] ? PARTS.indexOf(a) - PARTS.indexOf(b)
    : fraction[a] > fraction[b] ? -1 : 1));
  for (let i = 0; leftover > 0; i++) {
    const part = order[i % order.length];
    if (base[part] < remaining[part]) {
      base[part]++;
      leftover--;
    }
  }
  return base;
}

function refundView(refund) {
  return {
    refundId: refund.id,
    orderId: refund.orderId,
    amountCents: refund.amountCents,
    refundedCents: refund.refundedCents,
    remainingCents: refund.remainingCents,
    paymentStatus: refund.paymentStatus,
    status: 'POSTED',
  };
}

function settlementView(row) {
  return {
    settlementId: row.id,
    merchantId: row.merchantId,
    periodStart: new Date(row.periodStart).toISOString(),
    periodEnd: new Date(row.periodEnd).toISOString(),
    grossSalesCents: row.grossSalesCents,
    commissionCents: row.commissionCents,
    netPayoutCents: row.netPayoutCents,
    status: row.status,
    externalTransferId: row.externalTransferId ?? null,
    paidAt: row.paidAt ? new Date(row.paidAt).toISOString() : null,
  };
}

function parseListQuery(query) {
  check(query && typeof query === 'object' && !Array.isArray(query), 'INVALID_QUERY', 'Parametros invalidos', 400);
  const keys = ['merchantId', 'limit'];
  check(Object.keys(query).every(key => keys.includes(key)) && Object.values(query).every(value => typeof value === 'string'),
    'INVALID_QUERY', 'Parametros invalidos', 400);
  check(typeof query.merchantId === 'string' && query.merchantId.length > 0 && query.merchantId.length <= 64,
    'INVALID_QUERY', 'merchantId requerido', 400);
  let limit = DEFAULT_LIMIT;
  if (query.limit !== undefined) {
    check(/^[1-9]\d*$/.test(query.limit) && Number(query.limit) <= MAX_LIMIT, 'INVALID_QUERY', `limit debe estar entre 1 y ${MAX_LIMIT}`, 400);
    limit = Number(query.limit);
  }
  return { merchantId: query.merchantId, limit };
}

function parseRefundBody(body) {
  check(plain(body, REFUND_FIELDS), 'INVALID_REFUND', 'Solicitud de reembolso invalida');
  check(typeof body.reason === 'string' && body.reason.trim() === body.reason && body.reason.length >= 3 && body.reason.length <= 200,
    'INVALID_REFUND', 'Motivo invalido');
  check(body.amountCents === undefined || (Number.isSafeInteger(body.amountCents) && body.amountCents > 0 && body.amountCents <= MAX_CENTS),
    'INVALID_REFUND', 'amountCents invalido');
  return { amountCents: body.amountCents ?? null, reason: body.reason };
}

// Ledger lines for a refund. Unsettled orders reverse escrow. Settled orders reverse the payables
// that the settlement already credited.
function refundLedger({ orderId, amount, allocation, settled }) {
  const entries = [];
  if (settled) {
    if (allocation.merchant > 0) entries.push({ account: ACCOUNT_TYPES.MERCHANT_PAYABLE, type: ENTRY_TYPES.DEBIT, amount: allocation.merchant / 100 });
    if (allocation.courier > 0) entries.push({ account: ACCOUNT_TYPES.COURIER_PAYABLE, type: ENTRY_TYPES.DEBIT, amount: allocation.courier / 100 });
    if (allocation.platform > 0) entries.push({ account: ACCOUNT_TYPES.PLATFORM_FEES, type: ENTRY_TYPES.DEBIT, amount: allocation.platform / 100 });
  } else {
    entries.push({ account: ACCOUNT_TYPES.GATEWAY_ESCROW, type: ENTRY_TYPES.DEBIT, amount: amount / 100 });
  }
  entries.push({ account: ACCOUNT_TYPES.CUSTOMER_RECEIVABLE, type: ENTRY_TYPES.CREDIT, amount: amount / 100 });
  return createLedgerTransaction({ eventType: EVENT_TYPES.ORDER_REFUNDED, orderId, currency: 'MXN',
    description: `Reembolso de orden ${orderId}`, entries });
}

function createSettlementsV1Service(ports = {}) {
  const { settlementStore, ledgerStore, orderStore, outboxStore, refundStore, paymentGateway, merchantAccess, unitOfWork,
    now = () => new Date() } = ports;
  const ready = () => portsReady({ settlementStore, ledgerStore, orderStore, outboxStore, refundStore, paymentGateway, merchantAccess, unitOfWork });

  async function listMerchantSettlements(actor, query) {
    requireActor(actor);
    ready();
    const { merchantId, limit } = parseListQuery(query);
    check(await merchantAccess.canManage(actor, merchantId) === true, 'MERCHANT_FORBIDDEN', 'No tienes permiso sobre este comercio', 403);
    const rows = await settlementStore.listByMerchant(merchantId, { limit });
    // The store is queried for this merchant only. Rows of another merchant are dropped here as a second guard.
    const items = rows.filter(row => row.merchantId === merchantId).map(settlementView);
    return { items, limit };
  }

  async function refundOrder(actor, orderId, idempotencyKey, body) {
    requireActor(actor);
    check(actor.roles.some(role => REFUND_ROLES.includes(role)), 'REFUND_FORBIDDEN', 'Operacion de reembolso no autorizada', 403);
    ready();
    check(typeof orderId === 'string' && orderId.length > 0 && orderId.length <= 64, 'INVALID_ORDER', 'Orden invalida', 400);
    check(typeof idempotencyKey === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(idempotencyKey), 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key invalido', 400);
    const request = parseRefundBody(body);
    const requestHash = digest(JSON.stringify({ orderId, ...request }));
    const keyHash = digest(`${actor.accountId}:${idempotencyKey}`);

    // El adaptador persistente reserva primero y recupera el reembolso después
    // de reinicios. La vía de puertos simple se conserva para fixtures existentes.
    if (ports.refundCoordinator) return ports.refundCoordinator.refund({
      actor, orderId, request, requestHash, keyHash,
    });

    // A replay returns the stored refund and never repeats the provider call or the ledger write.
    const existing = await refundStore.findByKey(keyHash);
    if (existing) {
      check(existing.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otro reembolso', 409);
      return { ...refundView(existing), replayed: true };
    }

    const order = await orderStore.findOrder(orderId);
    check(order, 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    check(isCents(order.totalCents) && isCents(order.refundedCents), 'ORDER_INTEGRITY_ERROR', 'Importes de la orden inconsistentes', 503);
    // Checked before the paid status: a fully refunded order is REFUNDED, which is not a paid status.
    check(order.refundedCents < order.totalCents, 'ORDER_ALREADY_REFUNDED', 'La orden ya fue reembolsada por completo', 409);
    check(PAID_STATUSES.includes(order.paymentStatus), 'ORDER_NOT_PAID', 'La orden no esta pagada', 409);
    check(order.paymentProviderId, 'NO_PROVIDER_PAYMENT', 'La orden no tiene pago en el proveedor', 409);
    const remaining = order.totalCents - order.refundedCents;
    const amount = request.amountCents ?? remaining;
    check(amount <= remaining, 'REFUND_EXCEEDS_PAYMENT', 'El reembolso excede lo pagado', 409);

    const remainingParts = {
      merchant: order.merchantPayoutCents - order.refundedParts.merchant,
      platform: order.platformFeeCents - order.refundedParts.platform,
      courier: order.courierPayoutCents - order.refundedParts.courier,
    };
    const allocation = allocate(amount, remainingParts);
    const ledgerTransaction = refundLedger({ orderId, amount, allocation, settled: order.settled === true });
    const refundId = crypto.randomUUID();
    const refundedCents = order.refundedCents + amount;
    const paymentStatus = refundedCents === order.totalCents ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    const refundedParts = {
      merchant: order.refundedParts.merchant + allocation.merchant,
      platform: order.refundedParts.platform + allocation.platform,
      courier: order.refundedParts.courier + allocation.courier,
    };

    // Provider first, keyed by the client's Idempotency-Key. A retry after a later failure reuses the provider refund.
    const providerRefund = await paymentGateway.refundPayment({ paymentId: order.paymentProviderId, amountCents: amount,
      idempotencyKey: `marketplace-refund:${keyHash}` });
    check(providerRefund && providerRefund.status === 'approved', 'PROVIDER_REFUND_PENDING', 'Reembolso pendiente en el proveedor', 503);

    const at = now();
    const refund = { id: refundId, keyHash, requestHash, orderId, amountCents: amount, reason: request.reason, actorId: actor.accountId,
      providerRefundId: providerRefund.id, allocation, ledgerTransactionId: ledgerTransaction.id, refundedCents, paymentStatus,
      remainingCents: order.totalCents - refundedCents, createdAt: at };
    try {
      await unitOfWork.run(async tx => {
        const applied = await orderStore.applyRefund(tx, { orderId, expectedRefundedCents: order.refundedCents, refundedCents,
          refundedParts, paymentStatus });
        check(applied === true, 'ORDER_CONFLICT', 'La orden cambio; intenta de nuevo', 409);
        await ledgerStore.post(tx, { idempotencyKey: `refund:${refundId}`, transaction: ledgerTransaction });
        await refundStore.insert(tx, refund);
        await outboxStore.append(tx, { eventKey: `OrderRefunded:${refundId}`, aggregateType: 'MarketplaceOrder', aggregateId: orderId,
          eventType: 'OrderRefunded', payload: { orderId, refundId, amountCents: amount, paymentStatus }, createdAt: at });
      });
    } catch (error) {
      // A concurrent request with the same key won the refund insert. Return its result.
      if (error?.code === 'DUPLICATE') {
        const winner = await refundStore.findByKey(keyHash);
        if (winner && winner.requestHash === requestHash) return { ...refundView(winner), replayed: true };
        fail('IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otro reembolso', 409);
      }
      throw error;
    }
    return { ...refundView(refund), replayed: false };
  }

  return { listMerchantSettlements, refundOrder, allocate };
}

module.exports = { SettlementsV1Error, createSettlementsV1Service, allocate, refundLedger };
