'use strict';

const { createHash } = require('node:crypto');
const { getDriverBalance } = require('./marketplace-driver-balance');
const { createLedgerTransaction } = require('./marketplace-ledger');

const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 20000 };
const PAGE = 200;
const PAYOUT_SELECT = { id: true, restaurantId: true, driverId: true, amount: true, currency: true,
  status: true, requestedAt: true, paidAt: true, paymentReference: true };

class DriverPayoutError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'DriverPayoutError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, statusCode = 400) {
  if (!ok) throw new DriverPayoutError(code, message, statusCode);
}
function identifier(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value), 'INVALID_ID', 'Identificador invalido');
  return value;
}
function key(value) {
  check(typeof value === 'string' && /^[\x21-\x7e]{1,200}$/.test(value), 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key requerido');
  return value;
}
function money(value, stored = false) {
  const source = typeof value === 'string' || typeof value === 'number' || stored && value && typeof value.toFixed === 'function' ? String(value) : '';
  check(/^\d{1,16}(?:\.\d{1,2})?$/.test(source), stored ? 'INVALID_FINANCIAL_DATA' : 'INVALID_AMOUNT',
    'Importe invalido; usa como maximo dos decimales', stored ? 503 : 400);
  const [whole, fraction = ''] = source.split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  check(result <= BigInt(Number.MAX_SAFE_INTEGER), 'AMOUNT_LIMIT_EXCEEDED', 'Importe fuera de rango', stored ? 503 : 400);
  return result;
}
function decimal(cents) { return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function admin(actor) { return ['ADMIN', 'SUPER_ADMIN'].includes(actor?.role); }
function scope({ actor, restaurantId }, operation, driverId) {
  check(actor?.id && actor.isActive === true && !actor.isDevice, 'UNAUTHENTICATED', 'Identidad humana activa requerida', 401);
  check(operation === 'request' ? actor.role === 'DELIVERY' && actor.id === driverId
    : operation === 'approve' ? admin(actor) : admin(actor) || actor.role === 'DELIVERY' && actor.id === driverId,
  'PAYOUT_FORBIDDEN', 'Operacion de retiro no autorizada', 403);
  const rid = restaurantId ?? actor.restaurantId;
  identifier(rid);
  check(actor.role === 'SUPER_ADMIN' || actor.restaurantId === rid && actor.tenantId,
    'TENANT_FORBIDDEN', 'Restaurante no autorizado', 403);
  return rid;
}
function database(client) {
  check(typeof client?.$transaction === 'function' && client.marketplaceDriverPayout
    && client.marketplaceLedgerEntry && client.employee && client.restaurant,
  'PAYOUT_UNAVAILABLE', 'Persistencia de retiros no disponible', 503);
  return client;
}
async function merchant(tx, restaurantId, actor, lock = false) {
  if (lock) {
    // One stable lock also serializes the first reservation, before any request exists.
    const rows = await tx.$queryRaw`SELECT "id" FROM "restaurants" WHERE "id" = ${restaurantId} AND "isActive" = true FOR UPDATE`;
    check(rows.length === 1, 'RESTAURANT_NOT_FOUND', 'Restaurante no disponible', 404);
  }
  const row = await tx.restaurant.findFirst({ where: { id: restaurantId }, select: { id: true, tenantId: true, isActive: true } });
  check(row?.isActive === true && (actor.role === 'SUPER_ADMIN' || row.tenantId === actor.tenantId),
    'TENANT_FORBIDDEN', 'Restaurante no autorizado', 403);
}
async function driver(tx, driverId, restaurantId, actor) {
  const row = await tx.employee.findFirst({ where: { id: driverId, role: 'DELIVERY', isActive: true,
    location: { is: { restaurantId, ...(actor.locationId && actor.role !== 'DELIVERY' ? { id: actor.locationId } : {}) } } },
  select: { id: true } });
  check(row, 'DRIVER_NOT_FOUND', 'Repartidor no autorizado en el restaurante o sucursal', 404);
}
function payoutView(row) {
  const value = money(row.amount, true);
  return { ...Object.fromEntries(Object.keys(PAYOUT_SELECT).map(field => [field, row[field]])),
    amount: Number(value) / 100, amountCents: Number(value) };
}
async function finances(tx, driverId, restaurantId) {
  const balance = await getDriverBalance({ driverId, restaurantId, prismaClient: tx });
  const groups = await tx.marketplaceDriverPayout.groupBy({ by: ['currency'],
    where: { restaurantId, driverId, status: 'PENDING' }, _sum: { amount: true } });
  let reserved = 0n;
  check(groups.length <= 1, 'INVALID_RESERVATIONS', 'Reservas inconsistentes', 503);
  for (const group of groups) {
    check(group.currency === 'MXN', 'INVALID_RESERVATIONS', 'Moneda de reserva invalida', 503);
    reserved += money(group._sum.amount, true);
  }
  const available = BigInt(balance.balanceCents) - reserved;
  return { balance, reserved, available };
}
function requireCashReconciled(balance) {
  check(balance.cashInHandCents === 0, 'CASH_RECONCILIATION_REQUIRED', 'Entrega y concilia el efectivo pendiente antes del retiro', 409);
}

/** Allocate existing payable lots without changing the original capture/settlement writer. */
async function allocate(tx, payout, at) {
  let remaining = money(payout.amount, true); let after;
  const payable = { restaurantId: payout.restaurantId, beneficiaryId: payout.driverId, account: 'COURIER_PAYABLE' };
  for (;;) {
    const candidates = await tx.marketplaceLedgerEntry.groupBy({ by: ['paymentId'],
      where: { ...payable, type: 'CREDIT', ...(after ? { paymentId: { gt: after } } : {}) },
      orderBy: [{ paymentId: 'asc' }], take: PAGE });
    check(candidates.length <= PAGE, 'LEDGER_INTEGRITY_ERROR', 'Origenes contables inconsistentes', 503);
    const ids = candidates.map(row => identifier(row.paymentId));
    check(new Set(ids).size === ids.length && ids.every(id => !after || id > after),
      'LEDGER_INTEGRITY_ERROR', 'Pagina contable inconsistente', 503);
    if (!ids.length) break;
    const groups = await tx.marketplaceLedgerEntry.groupBy({ by: ['paymentId', 'orderId', 'type', 'currency'],
      where: { ...payable, paymentId: { in: ids } }, _sum: { amount: true } });
    const lots = new Map(); const seen = new Set();
    for (const row of groups) {
      const identity = `${row.paymentId}:${row.type}`;
      check(ids.includes(row.paymentId) && row.currency === 'MXN' && ['DEBIT', 'CREDIT'].includes(row.type)
        && !seen.has(identity), 'LEDGER_INTEGRITY_ERROR', 'Origen contable invalido', 503);
      seen.add(identity);
      const lot = lots.get(row.paymentId) || { orderId: identifier(row.orderId), net: 0n };
      check(lot.orderId === row.orderId, 'LEDGER_INTEGRITY_ERROR', 'Pago vinculado a distintas ordenes', 503);
      const value = money(row._sum.amount, true);
      lot.net += row.type === 'CREDIT' ? value : -value; lots.set(row.paymentId, lot);
    }
    for (const paymentId of ids) {
      const lot = lots.get(paymentId);
      check(lot, 'LEDGER_INTEGRITY_ERROR', 'Origen contable faltante', 503);
      if (lot.net <= 0n) continue;
      const amount = lot.net < remaining ? lot.net : remaining;
      const payment = await tx.marketplacePayment.findFirst({ where: { id: paymentId,
        restaurantId: payout.restaurantId, orderId: lot.orderId }, select: { id: true, status: true, currency: true, amount: true } });
      const order = await tx.order.findFirst({ where: { id: lot.orderId, restaurantId: payout.restaurantId,
        source: 'MARKETPLACE' }, select: { id: true } });
      check(order && payment?.status === 'CAPTURED' && payment.currency === 'MXN' && money(payment.amount, true) >= amount,
        'LEDGER_INTEGRITY_ERROR', 'Pago de origen no disponible para liquidacion', 503);
      const transaction = createLedgerTransaction({ eventType: 'PAYOUT_DISBURSED', orderId: lot.orderId,
        referenceId: payout.id, currency: 'MXN', createdAt: at, entries: [
          { account: 'COURIER_PAYABLE', type: 'DEBIT', amount: Number(amount) / 100 },
          { account: 'PAYOUT_CLEARING', type: 'CREDIT', amount: Number(amount) / 100 },
        ] });
      const data = transaction.entries.map((entry, i) => ({ id: entry.id, restaurantId: payout.restaurantId,
        orderId: lot.orderId, paymentId, payoutId: payout.id, transactionId: transaction.id,
        transactionHash: transaction.hash, idempotencyKey: `driver-payout:${payout.id}`, lineNumber: i + 1,
        eventType: 'PAYOUT_DISBURSED', account: entry.account, beneficiaryId: entry.account === 'COURIER_PAYABLE' ? payout.driverId : null,
        type: entry.type, amount: decimal(amount), currency: 'MXN', referenceId: payout.id,
        description: 'Liquidacion de repartidor confirmada por administrador', createdAt: at }));
      const inserted = await tx.marketplaceLedgerEntry.createMany({ data });
      check(inserted.count === 2, 'LEDGER_INTEGRITY_ERROR', 'Liquidacion incompleta', 503);
      remaining -= amount;
      if (remaining === 0n) return;
    }
    if (ids.length < PAGE) break;
    after = ids.at(-1);
  }
  throw new DriverPayoutError('LEDGER_INTEGRITY_ERROR', 'El ledger no respalda el retiro completo', 503);
}

async function verifyPosted(tx, payout) {
  const transactions = new Map(); let after; let total = 0n;
  for (;;) {
    const rows = await tx.marketplaceLedgerEntry.findMany({ where: { restaurantId: payout.restaurantId,
      payoutId: payout.id, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: 'asc' }, take: PAGE });
    check(rows.length <= PAGE, 'LEDGER_INTEGRITY_ERROR', 'Pagina contable invalida', 503);
    for (const line of rows) {
      check(!after || line.id > after, 'LEDGER_INTEGRITY_ERROR', 'Pagina contable invalida', 503);
      const group = transactions.get(line.transactionId) || []; group.push(line); transactions.set(line.transactionId, group);
    }
    if (rows.length < PAGE) break;
    after = rows.at(-1).id;
  }
  for (const [transactionId, lines] of transactions) {
    lines.sort((a, b) => a.lineNumber - b.lineNumber);
    const [debit, credit] = lines;
    check(lines.length === 2 && debit.lineNumber === 1 && credit.lineNumber === 2
      && debit.type === 'DEBIT' && debit.account === 'COURIER_PAYABLE' && debit.beneficiaryId === payout.driverId
      && credit.type === 'CREDIT' && credit.account === 'PAYOUT_CLEARING' && credit.beneficiaryId === null,
    'LEDGER_INTEGRITY_ERROR', 'Liquidacion persistida incompleta', 503);
    const amount = money(debit.amount, true);
    check(amount > 0n && amount === money(credit.amount, true), 'LEDGER_INTEGRITY_ERROR', 'Liquidacion desbalanceada', 503);
    const hash = createHash('sha256').update(`${transactionId}:${debit.orderId}:PAYOUT_DISBURSED:${Number(amount) / 100}:${new Date(payout.paidAt).toISOString()}`).digest('hex');
    check(lines.every(line => line.restaurantId === payout.restaurantId && line.payoutId === payout.id
      && line.currency === 'MXN' && line.paymentId === debit.paymentId && line.orderId === debit.orderId
      && line.eventType === 'PAYOUT_DISBURSED' && line.transactionHash === hash && line.referenceId === payout.id
      && line.idempotencyKey === `driver-payout:${payout.id}` && new Date(line.createdAt).getTime() === new Date(payout.paidAt).getTime()),
    'LEDGER_INTEGRITY_ERROR', 'Liquidacion persistida inconsistente', 503);
    total += amount;
  }
  check(total === money(payout.amount, true), 'LEDGER_INTEGRITY_ERROR', 'Falta la liquidacion original', 503);
}

function createDriverPayoutsService({ minAmount = '0.01', maxAmount = '100000.00', now = () => new Date() } = {}) {
  const minimum = money(minAmount); const maximum = money(maxAmount);
  check(minimum > 0n && maximum >= minimum && maximum <= 100000000n,
    'INVALID_PAYOUT_LIMITS', 'Limites de retiro invalidos');
  async function requestDriverPayout({ driverId, restaurantId, actor, amount, currency = 'MXN', idempotencyKey, prismaClient }) {
    identifier(driverId); const rid = scope({ actor, restaurantId }, 'request', driverId); key(idempotencyKey);
    const value = money(amount);
    check(currency === 'MXN', 'UNSUPPORTED_CURRENCY', 'Moneda no soportada');
    check(value >= minimum && value <= maximum, 'PAYOUT_LIMIT_EXCEEDED', 'Importe fuera de los limites de retiro');
    const requestHash = digest({ driverId, restaurantId: rid, amount: decimal(value), currency });
    return database(prismaClient).$transaction(async tx => {
      await merchant(tx, rid, actor, true); await driver(tx, driverId, rid, actor);
      const previous = await tx.marketplaceDriverPayout.findFirst({ where: { restaurantId: rid, driverId, requestKey: idempotencyKey } });
      if (previous) {
        check(previous.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'Clave usada para otro retiro', 409);
        if (previous.status === 'PAID') await verifyPosted(tx, previous);
        return { payout: payoutView(previous), idempotent: true };
      }
      const { balance, available } = await finances(tx, driverId, rid);
      requireCashReconciled(balance);
      check(value <= available, 'INSUFFICIENT_AVAILABLE_BALANCE', 'Saldo disponible insuficiente', 409);
      const payout = await tx.marketplaceDriverPayout.create({ data: { restaurantId: rid, driverId, amount: decimal(value),
        currency, status: 'PENDING', requestKey: idempotencyKey, requestHash, requestedBy: actor.id, requestedAt: now() } });
      return { payout: payoutView(payout), idempotent: false };
    }, TX);
  }

  async function approveDriverPayout({ payoutId, restaurantId, actor, idempotencyKey, paymentReference, confirmPaid, prismaClient }) {
    identifier(payoutId); const rid = scope({ actor, restaurantId }, 'approve'); key(idempotencyKey);
    check(confirmPaid === true && typeof paymentReference === 'string' && paymentReference.length >= 1
      && paymentReference.length <= 200 && paymentReference.trim() === paymentReference && /^[\x20-\x7e]+$/.test(paymentReference),
    'PAYMENT_CONFIRMATION_REQUIRED', 'Confirma el pago externo e indica su referencia');
    const approvalHash = digest({ payoutId, restaurantId: rid, paymentReference, confirmPaid: true });
    return database(prismaClient).$transaction(async tx => {
      await merchant(tx, rid, actor, true);
      const payout = await tx.marketplaceDriverPayout.findFirst({ where: { id: payoutId, restaurantId: rid } });
      check(payout, 'PAYOUT_NOT_FOUND', 'Retiro no encontrado', 404);
      check(payout.currency === 'MXN', 'LEDGER_INTEGRITY_ERROR', 'Moneda de liquidacion inconsistente', 503);
      await driver(tx, payout.driverId, rid, actor);
      if (payout.status === 'PAID') {
        check(payout.approvalKey === idempotencyKey && payout.approvalHash === approvalHash,
          'IDEMPOTENCY_CONFLICT', 'El retiro ya fue liquidado con otra confirmacion', 409);
        await verifyPosted(tx, payout);
        return { payout: payoutView(payout), idempotent: true };
      }
      check(payout.status === 'PENDING' && payout.currency === 'MXN', 'PAYOUT_CONFLICT', 'El retiro no esta pendiente', 409);
      const duplicate = await tx.marketplaceDriverPayout.findFirst({ where: { restaurantId: rid,
        OR: [{ approvalKey: idempotencyKey }, { paymentReference }] }, select: { id: true } });
      check(!duplicate, 'IDEMPOTENCY_CONFLICT', 'La confirmacion ya se uso para otro retiro', 409);
      check(await tx.marketplaceLedgerEntry.count({ where: { restaurantId: rid, payoutId } }) === 0,
        'LEDGER_INTEGRITY_ERROR', 'Un retiro pendiente ya tiene asientos', 503);
      const { balance, reserved, available } = await finances(tx, payout.driverId, rid);
      const value = money(payout.amount, true);
      check(value > 0n && reserved >= value && available >= 0n, 'INSUFFICIENT_AVAILABLE_BALANCE', 'El saldo ya no respalda las reservas', 409);
      requireCashReconciled(balance);
      const at = now(); await allocate(tx, payout, at);
      const updated = await tx.marketplaceDriverPayout.updateMany({ where: { id: payoutId, restaurantId: rid, status: 'PENDING' },
        data: { status: 'PAID', paidAt: at, approvedBy: actor.id, approvalKey: idempotencyKey, approvalHash, paymentReference } });
      check(updated.count === 1, 'PAYOUT_CONFLICT', 'El retiro cambio durante la aprobacion', 409);
      return { payout: payoutView({ ...payout, status: 'PAID', paidAt: at, paymentReference }), idempotent: false };
    }, TX);
  }

  async function listDriverPayouts({ driverId, restaurantId, actor, prismaClient, limit = 50, cursor }) {
    identifier(driverId); const rid = scope({ actor, restaurantId }, 'list', driverId);
    check(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_LIMIT', 'Limite invalido');
    if (cursor !== undefined) identifier(cursor);
    return database(prismaClient).$transaction(async tx => {
      await merchant(tx, rid, actor); await driver(tx, driverId, rid, actor);
      const where = { restaurantId: rid, driverId };
      if (cursor) {
        const previous = await tx.marketplaceDriverPayout.findFirst({ where: { ...where, id: cursor }, select: { id: true, requestedAt: true } });
        check(previous, 'INVALID_CURSOR', 'Cursor invalido');
        where.OR = [{ requestedAt: { lt: previous.requestedAt } }, { requestedAt: previous.requestedAt, id: { lt: cursor } }];
      }
      const rows = await tx.marketplaceDriverPayout.findMany({ where, select: PAYOUT_SELECT,
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: limit + 1 });
      const { balance, reserved, available } = await finances(tx, driverId, rid);
      return { driverId, restaurantId: rid, currency: 'MXN', balance: balance.balance, balanceCents: balance.balanceCents,
        cashOnHand: balance.cashInHand, cashOnHandCents: balance.cashInHandCents,
        reservedAmount: Number(reserved) / 100, availableAmount: Number(available > 0n ? available : 0n) / 100,
        payouts: rows.slice(0, limit).map(payoutView), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
    }, { ...TX, isolationLevel: 'RepeatableRead' });
  }
  return { requestDriverPayout, approveDriverPayout, listDriverPayouts };
}

module.exports = { createDriverPayoutsService, DriverPayoutError };
