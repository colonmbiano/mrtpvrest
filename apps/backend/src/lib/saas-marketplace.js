'use strict';

const { ACCOUNT_TYPES, EVENT_TYPES } = require('./marketplace-ledger');
const PLATFORM_SLUG = 'mrtpvrest-platform';
const REAL_TENANT = { isDemo: false, slug: { not: PLATFORM_SLUG } };
const ORDER_SCOPE = { source: 'MARKETPLACE', restaurant: { is: { tenant: { is: REAL_TENANT } } } };
const LEDGER_SCOPE = { payment: { is: { order: { is: ORDER_SCOPE } } } };
const PAGE_SIZE = 200;
const RECENT_LIMIT = 20;
const MAX_LINES = 20;

class MarketplaceOverviewError extends Error {
  constructor(code) { super('Auditoria marketplace no disponible'); this.name = 'MarketplaceOverviewError'; this.code = code; this.statusCode = 503; }
}
function check(ok, code = 'INVALID_MARKETPLACE_DATA') { if (!ok) throw new MarketplaceOverviewError(code); }
function id(value) { return typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value; }
function cents(value) {
  // PostgreSQL numeric/Prisma Decimal are consumed as decimal strings, never accumulated as Float.
  const text = typeof value === 'number' || typeof value === 'string' || value && typeof value.toFixed === 'function' ? String(value) : '';
  check(/^\d+(?:\.\d{1,2})?$/.test(text), 'INVALID_AMOUNT');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function safe(value) {
  check(value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= -BigInt(Number.MAX_SAFE_INTEGER), 'OVERVIEW_LIMIT_EXCEEDED');
  return Number(value);
}
function iso(value) {
  check((value instanceof Date || typeof value === 'string' && value.length > 0) && Number.isFinite(new Date(value).getTime()), 'INVALID_TIMESTAMP');
  return new Date(value).toISOString();
}
function emptyTotals() {
  return Object.fromEntries(Object.keys(ACCOUNT_TYPES).map(account => [account, { credit: 0n, debit: 0n }]));
}
function add(totals, account, type, value, currency) {
  check(Object.hasOwn(totals, account) && ['DEBIT', 'CREDIT'].includes(type), 'INVALID_LEDGER_ACCOUNT');
  check(currency === 'MXN', 'UNSUPPORTED_CURRENCY');
  const amount = cents(value); check(amount > 0n, 'INVALID_AMOUNT');
  totals[account][type === 'CREDIT' ? 'credit' : 'debit'] += amount;
}
function ledgerMetrics(totals) {
  const debits = Object.values(totals).reduce((sum, row) => sum + row.debit, 0n);
  const credits = Object.values(totals).reduce((sum, row) => sum + row.credit, 0n);
  check(debits === credits, 'UNBALANCED_LEDGER');
  const net = account => totals[account].credit - totals[account].debit;
  const balancesCents = Object.fromEntries(['GATEWAY_ESCROW', 'MERCHANT_PAYABLE', 'COURIER_PAYABLE'].map(account => [account, safe(net(account))]));
  return { platformFees: safe(net('PLATFORM_FEES')) / 100, platformFeesCents: safe(net('PLATFORM_FEES')),
    balances: Object.fromEntries(Object.entries(balancesCents).map(([account, amount]) => [account, amount / 100])), balancesCents,
    ledgerIntegrity: { balanced: true, totalDebitsCents: safe(debits), totalCreditsCents: safe(credits) } };
}
function projectTransaction(lines) {
  check(lines.length >= 2 && lines.length <= MAX_LINES, 'INVALID_LEDGER_TRANSACTION');
  const ordered = [...lines].sort((a, b) => a.lineNumber - b.lineNumber);
  const first = ordered[0];
  check(id(first.transactionId) && id(first.orderId) && id(first.restaurantId) && Object.hasOwn(EVENT_TYPES, first.eventType), 'INVALID_LEDGER_TRANSACTION');
  let debit = 0n; let credit = 0n;
  const entries = ordered.map((line, index) => {
    check(line.lineNumber === index + 1 && ['transactionId', 'orderId', 'restaurantId', 'paymentId', 'eventType', 'currency', 'transactionHash', 'idempotencyKey']
      .every(key => line[key] === first[key]) && iso(line.createdAt) === iso(first.createdAt), 'INCONSISTENT_LEDGER_TRANSACTION');
    check(Object.hasOwn(ACCOUNT_TYPES, line.account) && ['DEBIT', 'CREDIT'].includes(line.type) && line.currency === 'MXN', 'INVALID_LEDGER_ACCOUNT');
    const amount = cents(line.amount); check(amount > 0n, 'INVALID_AMOUNT');
    if (line.type === 'DEBIT') debit += amount; else credit += amount;
    return { account: line.account, type: line.type, amount: safe(amount) / 100, amountCents: safe(amount) };
  });
  check(debit === credit, 'UNBALANCED_LEDGER');
  return { id: first.transactionId, orderId: first.orderId, restaurantId: first.restaurantId, eventType: first.eventType,
    currency: first.currency, amount: safe(debit) / 100, amountCents: safe(debit), createdAt: iso(first.createdAt), entries };
}

async function readMerchants(tx) {
  const merchants = []; const seen = new Set(); let after;
  for (;;) {
    const rows = await tx.restaurant.findMany({ where: { tenant: { is: REAL_TENANT },
      OR: [{ tenant: { is: { hasWebStore: true } } }, { orders: { some: { source: 'MARKETPLACE' } } }],
      ...(after ? { id: { gt: after } } : {}) },
    select: { id: true, slug: true, name: true, businessType: true, isActive: true, createdAt: true,
      tenant: { select: { hasWebStore: true } } }, orderBy: { id: 'asc' }, take: PAGE_SIZE });
    check(Array.isArray(rows) && rows.length <= PAGE_SIZE);
    for (const row of rows) {
      check(id(row.id) && !seen.has(row.id) && typeof row.slug === 'string' && typeof row.name === 'string'
        && typeof row.isActive === 'boolean' && typeof row.tenant?.hasWebStore === 'boolean');
      seen.add(row.id);
      merchants.push({ id: row.id, slug: row.slug, name: row.name, businessType: row.businessType,
        isActive: row.isActive && row.tenant.hasWebStore, createdAt: iso(row.createdAt), orderCount: 0, gmv: 0, gmvCents: 0 });
    }
    if (rows.length < PAGE_SIZE) return merchants;
    after = rows.at(-1).id;
  }
}

async function orderMetrics(tx, merchants) {
  // Per-order numeric rounding avoids SUM(Float) drift; parameters are bound, with no caller SQL.
  const rows = await tx.$queryRaw`SELECT o."restaurantId", COUNT(*)::bigint AS "totalOrders",
    COALESCE(SUM(ROUND(o."total"::numeric, 2)) FILTER
      (WHERE o."paymentStatus" = 'PAID' AND o."status" <> 'CANCELLED'), 0) AS "gmv",
    COUNT(*) FILTER (WHERE COALESCE(p."currency", c."currency", '') <> 'MXN')::bigint AS "invalidCurrencyCount"
    FROM "orders" o
    JOIN "restaurants" r ON r."id" = o."restaurantId"
    JOIN "tenants" t ON t."id" = r."tenantId"
    LEFT JOIN "marketplace_order_pipelines" p ON p."orderId" = o."id" AND p."restaurantId" = o."restaurantId"
    LEFT JOIN "RestaurantConfig" c ON c."restaurantId" = r."id"
    WHERE o."source" = 'MARKETPLACE' AND t."isDemo" = false AND t."slug" <> ${PLATFORM_SLUG}
    GROUP BY o."restaurantId"`;
  check(Array.isArray(rows));
  const byId = new Map(merchants.map(row => [row.id, row])); const seen = new Set();
  let count = 0n; let gmv = 0n;
  for (const row of rows) {
    check(byId.has(row.restaurantId) && !seen.has(row.restaurantId), 'INVALID_MERCHANT_SCOPE');
    check(String(row.invalidCurrencyCount) === '0', 'UNSUPPORTED_CURRENCY');
    check(/^\d+$/.test(String(row.totalOrders)), 'INVALID_ORDER_COUNT');
    const orderCount = BigInt(String(row.totalOrders)); const amount = cents(row.gmv);
    count += orderCount; gmv += amount; seen.add(row.restaurantId);
    Object.assign(byId.get(row.restaurantId), { orderCount: safe(orderCount), gmv: safe(amount) / 100, gmvCents: safe(amount) });
  }
  return { totalOrders: safe(count), gmvTotal: safe(gmv) / 100, gmvTotalCents: safe(gmv) };
}

async function prismaLedger(tx) {
  const groups = await tx.marketplaceLedgerEntry.groupBy({ by: ['account', 'type', 'currency'], where: LEDGER_SCOPE, _sum: { amount: true } });
  check(Array.isArray(groups));
  const totals = emptyTotals(); const seen = new Set();
  for (const group of groups) {
    const key = `${group.account}:${group.type}:${group.currency}`;
    check(!seen.has(key), 'INVALID_LEDGER_GROUP'); seen.add(key);
    add(totals, group.account, group.type, group._sum?.amount, group.currency);
  }
  const metrics = ledgerMetrics(totals);
  const recent = await tx.marketplaceLedgerEntry.groupBy({ by: ['transactionId'], where: LEDGER_SCOPE,
    _max: { createdAt: true }, orderBy: [{ _max: { createdAt: 'desc' } }, { transactionId: 'desc' }], take: RECENT_LIMIT });
  check(Array.isArray(recent) && recent.length <= RECENT_LIMIT);
  const ids = recent.map(row => row.transactionId);
  check(ids.every(id) && new Set(ids).size === ids.length, 'INVALID_LEDGER_TRANSACTION');
  if (!ids.length) return { ...metrics, recentTransactions: [] };
  const lines = await tx.marketplaceLedgerEntry.findMany({ where: { ...LEDGER_SCOPE, transactionId: { in: ids } },
    select: { transactionId: true, transactionHash: true, idempotencyKey: true, restaurantId: true, orderId: true,
      paymentId: true, eventType: true, lineNumber: true, account: true, type: true, amount: true, currency: true, createdAt: true },
    orderBy: [{ transactionId: 'asc' }, { lineNumber: 'asc' }], take: RECENT_LIMIT * MAX_LINES + 1 });
  check(Array.isArray(lines) && lines.length <= RECENT_LIMIT * MAX_LINES, 'INVALID_LEDGER_TRANSACTION');
  const grouped = new Map(ids.map(value => [value, []]));
  for (const line of lines) { check(grouped.has(line.transactionId), 'INVALID_LEDGER_TRANSACTION'); grouped.get(line.transactionId).push(line); }
  return { ...metrics, recentTransactions: recent.map(row => {
    const transaction = projectTransaction(grouped.get(row.transactionId));
    check(transaction.createdAt === iso(row._max?.createdAt), 'INCONSISTENT_LEDGER_TRANSACTION');
    return transaction;
  }) };
}

async function memoryLedger(tx, transactions) {
  check(Array.isArray(transactions), 'INVALID_LEDGER_STORE');
  const ids = [...new Set(transactions.map(row => { check(row && id(row.orderId), 'INVALID_LEDGER_STORE'); return row.orderId; }))];
  const orders = new Map();
  for (let i = 0; i < ids.length; i += PAGE_SIZE) {
    const batch = ids.slice(i, i + PAGE_SIZE);
    const rows = await tx.order.findMany({ where: { ...ORDER_SCOPE, id: { in: batch } },
      select: { id: true, restaurantId: true }, take: PAGE_SIZE });
    check(Array.isArray(rows) && rows.length <= batch.length);
    for (const row of rows) { check(batch.includes(row.id) && id(row.restaurantId) && !orders.has(row.id)); orders.set(row.id, row.restaurantId); }
  }
  const totals = emptyTotals(); const seen = new Set(); const projected = [];
  for (const transaction of transactions) {
    if (!orders.has(transaction.orderId)) continue;
    check(id(transaction.id) && !seen.has(transaction.id) && Array.isArray(transaction.entries), 'INVALID_LEDGER_STORE');
    const restaurantId = orders.get(transaction.orderId);
    check(!transaction.restaurantId || transaction.restaurantId === restaurantId, 'INVALID_MERCHANT_SCOPE');
    seen.add(transaction.id);
    const lines = transaction.entries.map((entry, index) => {
      check(entry && (!entry.restaurantId || entry.restaurantId === restaurantId)
        && (!entry.metadata?.restaurantId || entry.metadata.restaurantId === restaurantId)
        && (!entry.currency || entry.currency === transaction.currency), 'INVALID_MERCHANT_SCOPE');
      add(totals, entry.account, entry.type, entry.amount, transaction.currency);
      return { transactionId: transaction.id, transactionHash: transaction.hash, orderId: transaction.orderId, restaurantId,
        eventType: transaction.eventType, currency: transaction.currency, createdAt: transaction.createdAt,
        lineNumber: index + 1, account: entry.account, type: entry.type, amount: entry.amount };
    });
    projected.push(projectTransaction(lines));
  }
  projected.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id === b.id ? 0 : a.id > b.id ? -1 : 1));
  return { ...ledgerMetrics(totals), recentTransactions: projected.slice(0, RECENT_LIMIT) };
}

/** Trusted SuperAdmin service. The HTTP adapter supplies explicit cross-tenant context after auth.
 * Memory injection replaces only the ledger; order/merchant facts always come from Prisma.
 */
async function getMarketplaceOverview({ prismaClient, ledgerStore } = {}) {
  check(prismaClient && typeof prismaClient.$transaction === 'function', 'DATABASE_UNAVAILABLE');
  let transactions;
  if (ledgerStore !== undefined) {
    check(typeof ledgerStore?.getAllTransactions === 'function', 'INVALID_LEDGER_STORE');
    transactions = structuredClone(ledgerStore.getAllTransactions());
  }
  return prismaClient.$transaction(async tx => {
    const merchants = await readMerchants(tx);
    const metrics = await orderMetrics(tx, merchants);
    const ledger = ledgerStore === undefined ? await prismaLedger(tx) : await memoryLedger(tx, transactions);
    return { currency: 'MXN', ...metrics, activeMerchants: merchants.filter(row => row.isActive).length,
      ...ledger, merchants, recentTransactionsLimit: RECENT_LIMIT };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 20000 });
}

module.exports = { getMarketplaceOverview, MarketplaceOverviewError };
