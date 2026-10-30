'use strict';

const SNAPSHOT = { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 15000 };
const CASH_PAGE_SIZE = 200;
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const ORDER_SELECT = { id: true, restaurantId: true, orderNumber: true, status: true, orderType: true,
  paymentMethod: true, paymentStatus: true, total: true, deliveryFee: true, tip: true,
  cashCollected: true, updatedAt: true,
  marketplacePipeline: { select: { currency: true } },
  restaurant: { select: { config: { select: { currency: true } } } } };

class DriverBalanceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'DriverBalanceError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, statusCode = 400) {
  if (!ok) throw new DriverBalanceError(code, message, statusCode);
}
function identifier(value) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value,
    'INVALID_DRIVER_SCOPE', 'Identificador invalido');
  return value;
}
function amount(value) {
  // Decimal sums remain exact; tolerate only IEEE noise on legacy Float order fields.
  if (typeof value === 'number') {
    const scaled = value * 100;
    check(Number.isFinite(scaled) && scaled >= 0 && Number.isSafeInteger(Math.round(scaled))
      && Math.abs(scaled - Math.round(scaled)) <= 0.000001,
    'INVALID_FINANCIAL_DATA', 'Importe financiero invalido', 503);
    return BigInt(Math.round(scaled));
  }
  const text = typeof value === 'string' || value && typeof value.toFixed === 'function' ? String(value) : '';
  check(/^\d+(?:\.\d{1,2})?$/.test(text), 'INVALID_FINANCIAL_DATA', 'Importe financiero invalido', 503);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function safeNumber(cents) {
  check(cents <= BigInt(Number.MAX_SAFE_INTEGER) && cents >= -BigInt(Number.MAX_SAFE_INTEGER),
    'BALANCE_LIMIT_EXCEEDED', 'Saldo excede la precision soportada', 503);
  return Number(cents);
}
function currency(row) {
  const value = row.marketplacePipeline?.currency ?? row.restaurant?.config?.currency;
  check(CURRENCIES.has(value), 'INVALID_CURRENCY', 'Moneda de entrega no disponible', 503);
  return value;
}
function assignedOrders(driverId, restaurantId) {
  const pipelineScope = restaurantId ? { restaurantId } : {};
  return { ...(restaurantId ? { restaurantId } : {}), orderType: 'DELIVERY',
    OR: [
      { source: { not: 'MARKETPLACE' }, deliveryDriverId: driverId },
      { source: 'MARKETPLACE', marketplacePipeline: { is: { ...pipelineScope,
        dispatch: { path: ['task', 'currentAssignment', 'courierId'], equals: driverId } } } },
      // Marketplace que entrega un repartidor propio (política MANUAL, lib/marketplace-store-delivery.js).
      { source: 'MARKETPLACE', deliveryDriverId: driverId, marketplacePipeline: { is: { ...pipelineScope,
        dispatch: { path: ['task', 'deliveryPolicy'], equals: 'MANUAL' } } } },
    ] };
}
function database(prismaClient) {
  check(prismaClient && typeof prismaClient.order?.findMany === 'function',
    'BALANCE_UNAVAILABLE', 'Persistencia financiera no disponible', 503);
  return prismaClient;
}
function readSnapshot(prismaClient, work) {
  // Root clients get a consistent read; TransactionClient callers join their existing snapshot.
  return typeof prismaClient.$transaction === 'function' ? prismaClient.$transaction(work, SNAPSHOT) : work(prismaClient);
}

function memoryTotals(ledgerStore, driverId, restaurantId) {
  check(typeof ledgerStore?.getAllTransactions === 'function', 'INVALID_LEDGER_STORE', 'Almacen contable invalido', 503);
  const transactions = ledgerStore.getAllTransactions();
  check(Array.isArray(transactions), 'INVALID_LEDGER_STORE', 'Almacen contable invalido', 503);
  let credits = 0n; let debits = 0n; const ids = new Set();
  for (const transaction of transactions) {
    check(Array.isArray(transaction?.entries), 'INVALID_LEDGER_STORE', 'Almacen contable invalido', 503);
    for (const entry of transaction.entries) {
      check(entry && typeof entry === 'object', 'INVALID_LEDGER_STORE', 'Almacen contable invalido', 503);
      if (entry.account !== 'COURIER_PAYABLE') continue;
      // The existing pure ledger supports metadata; the Prisma writer uses explicit columns.
      const restaurants = [entry.restaurantId, entry.metadata?.restaurantId, transaction.restaurantId].filter(value => value != null);
      const drivers = [entry.beneficiaryId, entry.metadata?.beneficiaryId, entry.metadata?.driverId, entry.metadata?.courierId].filter(value => value != null);
      check(restaurants.length && drivers.length && restaurants.every(value => value === restaurants[0])
        && drivers.every(value => value === drivers[0]), 'UNSCOPED_LEDGER_ENTRY', 'Asiento sin identidad contable coherente', 503);
      if (restaurants[0] !== restaurantId || drivers[0] !== driverId) continue;
      check((entry.currency ?? transaction.currency) === 'MXN' && (!entry.currency || !transaction.currency || entry.currency === transaction.currency),
        'UNSUPPORTED_CURRENCY', 'No se pueden mezclar monedas en el saldo', 503);
      check(['CREDIT', 'DEBIT'].includes(entry.type) && (!entry.id || !ids.has(entry.id)),
        'INVALID_FINANCIAL_DATA', 'Asiento financiero invalido', 503);
      if (entry.id) ids.add(entry.id);
      const value = amount(entry.amount);
      check(value > 0n, 'INVALID_FINANCIAL_DATA', 'Asiento financiero invalido', 503);
      if (entry.type === 'CREDIT') credits += value; else debits += value;
    }
  }
  return { credits, debits };
}

async function prismaTotals(tx, driverId, restaurantId) {
  check(typeof tx.marketplaceLedgerEntry?.groupBy === 'function', 'BALANCE_UNAVAILABLE', 'Persistencia contable no disponible', 503);
  const groups = await tx.marketplaceLedgerEntry.groupBy({ by: ['type', 'currency'],
    where: { restaurantId, beneficiaryId: driverId, account: 'COURIER_PAYABLE' }, _sum: { amount: true } });
  check(Array.isArray(groups), 'INVALID_FINANCIAL_DATA', 'Agrupacion contable invalida', 503);
  let credits = 0n; let debits = 0n; const seen = new Set();
  for (const group of groups) {
    check(group.currency === 'MXN', 'UNSUPPORTED_CURRENCY', 'No se pueden mezclar monedas en el saldo', 503);
    check(['CREDIT', 'DEBIT'].includes(group.type) && !seen.has(group.type), 'INVALID_FINANCIAL_DATA', 'Agrupacion contable invalida', 503);
    seen.add(group.type);
    const value = amount(group._sum?.amount);
    check(value > 0n, 'INVALID_FINANCIAL_DATA', 'Agrupacion contable invalida', 503);
    if (group.type === 'CREDIT') credits += value; else debits += value;
  }
  return { credits, debits };
}

async function pendingCash(tx, driverId, restaurantId) {
  let cash = 0n; let count = 0; let after; const seen = new Set();
  for (;;) {
    const rows = await tx.order.findMany({ where: { ...assignedOrders(driverId, restaurantId),
      status: 'DELIVERED', paymentMethod: { in: ['CASH', 'CASH_ON_DELIVERY'] }, cashCollected: false, ...(after ? { id: { gt: after } } : {}) },
    select: { id: true, restaurantId: true, total: true, cashCollected: true, status: true, paymentMethod: true,
      marketplacePipeline: { select: { currency: true } }, restaurant: { select: { config: { select: { currency: true } } } } },
    orderBy: { id: 'asc' }, take: CASH_PAGE_SIZE });
    check(Array.isArray(rows) && rows.length <= CASH_PAGE_SIZE, 'INVALID_FINANCIAL_DATA', 'Pagina de efectivo invalida', 503);
    for (const row of rows) {
      check(typeof row.id === 'string' && row.id && !seen.has(row.id) && row.restaurantId === restaurantId
        && row.cashCollected === false && row.status === 'DELIVERED' && ['CASH', 'CASH_ON_DELIVERY'].includes(row.paymentMethod),
      'INVALID_FINANCIAL_DATA', 'Entrega fuera del alcance esperado', 503);
      check(currency(row) === 'MXN', 'UNSUPPORTED_CURRENCY', 'No se pueden mezclar monedas en el saldo', 503);
      seen.add(row.id); cash += amount(row.total); count++;
    }
    if (rows.length < CASH_PAGE_SIZE) break;
    after = rows.at(-1).id;
  }
  return { cash, count };
}

/** Read-only, per-restaurant liability. Cash custody is reported separately, never netted automatically. */
async function getDriverBalance({ driverId, restaurantId, prismaClient, ledgerStore } = {}) {
  identifier(driverId); identifier(restaurantId); database(prismaClient);
  const memory = ledgerStore === undefined ? null : memoryTotals(ledgerStore, driverId, restaurantId);
  return readSnapshot(prismaClient, async tx => {
    const { credits, debits } = memory || await prismaTotals(tx, driverId, restaurantId);
    const { cash, count } = await pendingCash(tx, driverId, restaurantId);
    return { driverId, restaurantId, currency: 'MXN', totalCredits: safeNumber(credits) / 100,
      totalDebits: safeNumber(debits) / 100, balance: safeNumber(credits - debits) / 100,
      cashInHand: safeNumber(cash) / 100, pendingCashOrders: count,
      totalCreditsCents: safeNumber(credits), totalDebitsCents: safeNumber(debits),
      balanceCents: safeNumber(credits - debits), cashInHandCents: safeNumber(cash) };
  });
}

/** Trusted internal callers may omit restaurantId for a driver's global history.
 * HTTP callers always supply their authorized restaurant scope.
 */
async function getDriverDeliveryHistory({ driverId, limit = 50, prismaClient, restaurantId } = {}) {
  identifier(driverId); if (restaurantId !== undefined) identifier(restaurantId);
  check(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_LIMIT', 'limit debe estar entre 1 y 100');
  database(prismaClient);
  const rows = await prismaClient.order.findMany({ where: { ...assignedOrders(driverId, restaurantId), status: 'DELIVERED' },
    select: ORDER_SELECT, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: limit });
  check(Array.isArray(rows) && rows.length <= limit, 'INVALID_FINANCIAL_DATA', 'Historial invalido', 503);
  const seen = new Set();
  return rows.map(row => {
    check(typeof row.id === 'string' && !seen.has(row.id) && row.orderType === 'DELIVERY' && row.status === 'DELIVERED'
      && typeof row.restaurantId === 'string' && (!restaurantId || row.restaurantId === restaurantId)
      && Number.isFinite(new Date(row.updatedAt).getTime()) && typeof row.cashCollected === 'boolean',
    'INVALID_FINANCIAL_DATA', 'Entrega fuera del alcance esperado', 503);
    seen.add(row.id);
    return { id: row.id, restaurantId: row.restaurantId, orderNumber: row.orderNumber, status: row.status,
      currency: currency(row), paymentMethod: row.paymentMethod, paymentStatus: row.paymentStatus,
      total: safeNumber(amount(row.total)) / 100, deliveryFee: safeNumber(amount(row.deliveryFee)) / 100,
      tip: safeNumber(amount(row.tip)) / 100, cashCollected: row.cashCollected,
      cashPending: ['CASH', 'CASH_ON_DELIVERY'].includes(row.paymentMethod) && !row.cashCollected ? safeNumber(amount(row.total)) / 100 : 0,
      updatedAt: new Date(row.updatedAt).toISOString() };
  });
}

/** Scope is resolved from authenticated server identity, independent of public catalog headers. */
function resolveDriverAccess(req) {
  const user = req.user;
  check(user, 'UNAUTHENTICATED', 'Autenticacion requerida', 401);
  check(user.isActive === true && !user.isDevice, 'DRIVER_FORBIDDEN', 'Acceso no autorizado', 403);
  const driverId = identifier(req.params?.id);
  const self = user.role === 'DELIVERY' && user.id === driverId;
  const staff = ['OWNER', 'ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role) || user.canManageDriverCash === true;
  check(self || staff, 'DRIVER_FORBIDDEN', 'Acceso no autorizado', 403);
  const query = req.query || {};
  check(Object.keys(query).every(key => ['restaurantId', 'limit'].includes(key)), 'INVALID_QUERY', 'Parametros invalidos');
  if (query.restaurantId !== undefined) identifier(query.restaurantId);
  const restaurantId = query.restaurantId ?? user.restaurantId;
  identifier(restaurantId);
  check(self || user.role === 'SUPER_ADMIN' || restaurantId === user.restaurantId, 'DRIVER_FORBIDDEN', 'Restaurante no autorizado', 403);
  return { driverId, restaurantId };
}

module.exports = { getDriverBalance, getDriverDeliveryHistory, resolveDriverAccess, DriverBalanceError };
