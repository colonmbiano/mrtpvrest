'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, input, NOW } = require('./helpers/marketplace-orders-fixture.cjs');
const { getMarketplaceOverview } = require('../src/lib/saas-marketplace');
const { createLedgerTransaction, createInMemoryLedgerStore } = require('../src/lib/marketplace-ledger');
const { runWithTenant, runWithBypass, getTenantContext } = require('../../../packages/database/tenant-guard');

globalThis.fetch = async () => { throw new Error('Offline suite forbids network'); };

function setup() {
  const f = fixture(); const ledger = createInMemoryLedgerStore(); let sequence = 0;
  f.state.restaurant.forEach((row, index) => Object.assign(row, { name: `Comercio ${index + 1}`, businessType: 'RESTAURANT',
    createdAt: new Date(NOW), tenant: { ...row.tenant, slug: `tenant-${index + 1}` } }));
  const template = f.state.restaurant[0];
  f.state.restaurant.push({ ...structuredClone(template), id: 'historical', slug: 'historical', isActive: false,
    tenant: { hasWebStore: false, isDemo: false, slug: 'historical-tenant' } },
  { ...structuredClone(template), id: 'zero', slug: 'zero' },
  { ...structuredClone(template), id: 'demo', slug: 'demo', tenant: { hasWebStore: true, isDemo: true, slug: 'demo-tenant' } },
  { ...structuredClone(template), id: 'platform', slug: 'platform', tenant: { hasWebStore: true, isDemo: false, slug: 'mrtpvrest-platform' } });
  const order = (id, restaurantId, total, extra = {}) => ({ id, restaurantId, total, paymentStatus: 'PAID', status: 'DELIVERED',
    source: 'MARKETPLACE', orderType: 'DELIVERY', customerEmail: 'PRIVATE EMAIL', customerPhone: 'PRIVATE PHONE', ...extra });
  f.state.order = [order('a', 'r1', 115), order('b', 'r2', 230, { status: 'PREPARING' }),
    order('pending', 'r1', 500, { paymentStatus: 'PENDING' }), order('cancelled', 'r1', 50, { status: 'CANCELLED' }),
    order('refunded', 'r1', 115, { paymentStatus: 'REFUNDED' }), order('old', 'historical', 30),
    order('legacy', 'r1', 999, { source: 'ONLINE' }), order('demo-order', 'demo', 999), order('system-order', 'platform', 999)];
  function transaction(orderId, eventType, entries) {
    const row = f.state.order.find(row => row.id === orderId); const paymentId = `payment-${orderId}`;
    if (!f.state.marketplacePayment.some(row => row.id === paymentId)) f.state.marketplacePayment.push({ id: paymentId,
      orderId, restaurantId: row.restaurantId, status: 'CAPTURED' });
    const record = createLedgerTransaction({ orderId, eventType, entries,
      createdAt: new Date(NOW.getTime() + sequence++ * 1000) });
    ledger.record(record, `event-${record.id}`);
    f.state.marketplaceLedgerEntry.push(...record.entries.map((entry, index) => ({ ...entry, amount: entry.amount.toFixed(2),
      restaurantId: row.restaurantId, orderId, paymentId, transactionId: record.id, transactionHash: record.hash,
      idempotencyKey: `event-${record.id}`, lineNumber: index + 1, currency: 'MXN', eventType,
      createdAt: new Date(record.createdAt), metadata: { privateToken: 'PRIVATE TOKEN' }, description: 'PRIVATE DESCRIPTION' })));
    return record;
  }
  const capture = (orderId, amount) => transaction(orderId, 'ORDER_CAPTURED', [
    { account: 'CUSTOMER_RECEIVABLE', type: 'DEBIT', amount }, { account: 'GATEWAY_ESCROW', type: 'CREDIT', amount }]);
  capture('a', 115);
  transaction('a', 'ORDER_SETTLED', [{ account: 'GATEWAY_ESCROW', type: 'DEBIT', amount: 115 },
    { account: 'MERCHANT_PAYABLE', type: 'CREDIT', amount: 95 }, { account: 'COURIER_PAYABLE', type: 'CREDIT', amount: 15 },
    { account: 'PLATFORM_FEES', type: 'CREDIT', amount: 5 }]);
  capture('b', 230); capture('old', 30);
  transaction('a', 'PAYOUT_DISBURSED', [{ account: 'COURIER_PAYABLE', type: 'DEBIT', amount: 10 }, { account: 'GATEWAY_ESCROW', type: 'CREDIT', amount: 10 }]);
  transaction('a', 'MANUAL_ADJUSTMENT', [{ account: 'PLATFORM_FEES', type: 'DEBIT', amount: 1 }, { account: 'GATEWAY_ESCROW', type: 'CREDIT', amount: 1 }]);
  capture('legacy', 999); capture('demo-order', 999); capture('system-order', 999);
  f.hooks.beforeWrite = () => assert.fail('Overview must be read-only');
  return Object.assign(f, { ledger, transaction });
}
const overview = (f, extra = {}) => getMarketplaceOverview({ prismaClient: f.prisma, ...extra });

function http(f) {
  const routes = new Map(); const guards = []; const authCalls = []; let bypasses = 0;
  const accounts = { root: { id: 'root', role: 'SUPER_ADMIN', isActive: true },
    owner: { id: 'owner', role: 'ADMIN', isActive: true }, driver: { id: 'driver', role: 'DELIVERY', isActive: true },
    inactive: { id: 'inactive', role: 'SUPER_ADMIN', isActive: false }, device: { id: 'device', role: 'SUPER_ADMIN', isActive: true, isDevice: true } };
  const authenticate = (req, res, next) => {
    authCalls.push('authenticate'); req.user = accounts[req.headers?.authorization?.replace('Bearer ', '')];
    return req.user ? next() : res.status(401).json({ errorCode: 'UNAUTHENTICATED' });
  };
  const requireSuperAdmin = (req, res, next) => {
    authCalls.push('requireSuperAdmin'); return req.user?.role === 'SUPER_ADMIN' ? next() : res.status(403).json({ errorCode: 'FORBIDDEN' });
  };
  const router = { get: (route, ...handlers) => routes.set(route, handlers), use: (...handlers) => guards.push(handlers), post() {}, put() {}, patch() {}, delete() {} };
  const transaction = f.prisma.$transaction;
  f.prisma.$transaction = (...args) => {
    assert.equal(getTenantContext()?.bypass, true, 'Platform query must run in explicit post-auth bypass');
    return transaction(...args);
  };
  const sandbox = { module: { exports: {} }, process: { env: {} }, Buffer, console,
    require(name) {
      if (name === 'express') return { Router: () => router };
      if (name === '@mrtpvrest/database') return { prisma: f.prisma, runWithBypass: work => { bypasses++; return runWithBypass(work); } };
      if (name === '../middleware/auth.middleware') return { authenticate, requireSuperAdmin };
      if (name === '../lib/tenantModules') return { VALID_MODULE_KEYS: [] };
      if (name === '../lib/promo') return {};
      if (name === '../lib/saas-marketplace') return require('../src/lib/saas-marketplace');
      if (name === 'crypto') return require('node:crypto');
      throw new Error(`Forbidden route import: ${name}`);
    } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/routes/saas.routes.js'), 'utf8'), sandbox);
  return { routes, authCalls, guards, get bypasses() { return bypasses; }, async request(extra = {}) {
    const req = { headers: { authorization: 'Bearer root' }, query: {}, ...extra };
    const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const handlers = routes.get('/marketplace/overview');
    async function invoke(index) {
      if (!handlers[index]) return;
      let next;
      await handlers[index](req, res, () => { next = invoke(index + 1); return next; });
      if (next) await next;
    }
    await invoke(0); return res;
  } };
}

test('GMV counts paid noncancelled orders once; counters and historical merchants remain distinct', async () => {
  const f = setup(); const result = await overview(f);
  assert.equal(result.gmvTotal, 375); assert.equal(result.gmvTotalCents, 37500); assert.equal(result.totalOrders, 6);
  assert.equal(result.activeMerchants, 3); assert.equal(result.merchants.length, 4);
  assert.equal(result.merchants.find(row => row.id === 'r1').gmv, 115); assert.equal(result.merchants.find(row => row.id === 'r1').orderCount, 4);
  assert.equal(result.merchants.find(row => row.id === 'zero').orderCount, 0);
  assert.equal(result.merchants.find(row => row.id === 'historical').isActive, false);
});

test('ledger fees and balances use credit minus debit including payout and fee reversal postings', async () => {
  const result = await overview(setup());
  assert.equal(result.platformFees, 4); assert.equal(result.platformFeesCents, 400);
  assert.deepEqual(result.balances, { GATEWAY_ESCROW: 271, MERCHANT_PAYABLE: 95, COURIER_PAYABLE: 5 });
  assert.equal(result.ledgerIntegrity.balanced, true);
  assert.equal(result.ledgerIntegrity.totalDebitsCents, result.ledgerIntegrity.totalCreditsCents);
  assert.equal(result.currency, 'MXN');
});

test('memory ledger produces the same authoritative totals and excludes hidden/nonmarketplace order links', async () => {
  const f = setup(); const sql = await overview(f); const before = f.ledger.getAllTransactions();
  const memory = await overview(f, { ledgerStore: f.ledger });
  assert.equal(memory.gmvTotal, sql.gmvTotal); assert.equal(memory.platformFees, sql.platformFees);
  assert.deepEqual(memory.balances, sql.balances); assert.deepEqual(memory.merchants, sql.merchants);
  assert.equal(memory.recentTransactions.length, 6); assert.deepEqual(f.ledger.getAllTransactions(), before);
});

test('recent transactions represent complete balanced events, never individual line totals', async () => {
  const result = await overview(setup());
  assert.equal(result.recentTransactions.length, 6);
  const settlement = result.recentTransactions.find(row => row.eventType === 'ORDER_SETTLED');
  assert.equal(settlement.amount, 115); assert.equal(settlement.entries.length, 4);
  for (const tx of result.recentTransactions) {
    const sum = type => tx.entries.filter(row => row.type === type).reduce((total, row) => total + row.amountCents, 0);
    assert.equal(sum('DEBIT'), sum('CREDIT')); assert.equal(sum('DEBIT'), tx.amountCents);
  }
  assert.equal(result.recentTransactions[0].eventType, 'MANUAL_ADJUSTMENT');
});

test('no transactions/orders returns zero actual metrics while eligible stores remain visible', async () => {
  const f = setup(); f.state.order = []; f.state.marketplaceLedgerEntry = []; f.state.marketplacePayment = [];
  const result = await overview(f);
  assert.equal(result.gmvTotal, 0); assert.equal(result.platformFees, 0); assert.equal(result.totalOrders, 0);
  assert.equal(result.activeMerchants, 3); assert.deepEqual(result.recentTransactions, []);
  assert.ok(Object.values(result.balances).every(value => value === 0));
});

test('capture and settlement do not multiply GMV and a captured unfulfilled order creates no estimated platform fee', async () => {
  const f = setup(); const result = await overview(f);
  assert.equal(result.merchants.find(row => row.id === 'r2').gmv, 230); assert.equal(result.platformFees, 4);
  assert.notEqual(result.platformFees, result.gmvTotal * 0.05);
});

test('merchant pagination includes more than one page without dropping global counts or zero-sales stores', async () => {
  const f = setup(); const template = f.state.restaurant.find(row => row.id === 'zero');
  f.state.restaurant.push(...Array.from({ length: 205 }, (_, i) => ({ ...structuredClone(template), id: `z${String(i).padStart(3, '0')}` })));
  const result = await overview(f); assert.equal(result.merchants.length, 209); assert.equal(result.activeMerchants, 208); assert.equal(result.gmvTotal, 375);
  const pages = f.calls.filter(call => call.model === 'restaurant' && call.method === 'findMany');
  assert.equal(pages.length, 2); assert.equal(pages[0].args.take, 200); assert.ok(pages[1].args.where.id.gt);
});

test('recent history is capped by logical transaction count with deterministic timestamp/ID order', async () => {
  const f = setup();
  for (let i = 0; i < 25; i++) f.transaction('b', 'MANUAL_ADJUSTMENT', [
    { account: 'GATEWAY_ESCROW', type: 'DEBIT', amount: 0.01 }, { account: 'PLATFORM_FEES', type: 'CREDIT', amount: 0.01 }]);
  const result = await overview(f); assert.equal(result.recentTransactions.length, 20); assert.equal(result.recentTransactionsLimit, 20);
  assert.equal(result.platformFees, 4.25); assert.equal(result.gmvTotal, 375);
  const times = result.recentTransactions.map(row => Date.parse(row.createdAt));
  assert.ok(times.every((value, i) => i === 0 || value <= times[i - 1]));
});

test('queries use exact source/tenant scopes, bounded projections, numeric SQL and one read snapshot', async () => {
  const f = setup(); await overview(f);
  assert.equal(f.calls[0].options.isolationLevel, 'RepeatableRead'); assert.equal(f.calls[0].options.timeout, 20000);
  const sql = f.calls.find(call => call.method === '$queryRaw');
  assert.deepEqual(sql.values, ['mrtpvrest-platform']); assert.match(sql.sql, /o\."source" = 'MARKETPLACE'/);
  assert.match(sql.sql, /ROUND\(o\."total"::numeric, 2\)/); assert.match(sql.sql, /"paymentStatus" = 'PAID'/);
  assert.match(sql.sql, /"status" <> 'CANCELLED'/); assert.match(sql.sql, /LEFT JOIN "RestaurantConfig"/);
  assert.match(sql.sql, /t\."isDemo" = false/);
  const grouped = f.calls.find(call => call.method === 'groupBy').args;
  assert.equal(grouped.where.payment.is.order.is.source, 'MARKETPLACE');
  const detail = f.calls.find(call => call.model === 'marketplaceLedgerEntry' && call.method === 'findMany').args;
  assert.equal(detail.take, 401); assert.equal(detail.select.metadata, undefined); assert.equal(detail.select.description, undefined);
});

test('projections discard credentials, customers, raw descriptions, metadata and dispatcher PINs', async () => {
  const f = setup(); const result = await overview(f);
  const serialized = JSON.stringify(result);
  for (const secret of ['PRIVATE', 'accessToken', 'customerEmail', 'customerPhone', 'collectorId', 'metadata', 'transactionHash', 'pickupPin']) assert.ok(!serialized.includes(secret), secret);
});

test('mixed currencies or unsafe monetary ranges fail rather than creating a mislabeled global total', async () => {
  const f = setup(); f.state.restaurant[1].config.currency = 'USD';
  await assert.rejects(overview(f), { code: 'UNSUPPORTED_CURRENCY' });
  const unsafe = setup(); unsafe.state.order.find(row => row.id === 'b').total = Number.MAX_SAFE_INTEGER;
  await assert.rejects(overview(unsafe), error => error.statusCode === 503);
});

test('ledger currency mismatch and a globally unbalanced posting group fail closed', async () => {
  const f = setup(); f.state.marketplaceLedgerEntry[0].currency = 'USD';
  await assert.rejects(overview(f), { code: 'UNSUPPORTED_CURRENCY' });
  const broken = setup(); broken.state.marketplaceLedgerEntry.pop();
  // Pop a hidden transaction line first; deleting an eligible line must still be detected.
  broken.state.marketplaceLedgerEntry.splice(0, 1);
  await assert.rejects(overview(broken), { code: 'UNBALANCED_LEDGER' });
});

test('invalid in-memory ledger data cannot silently return empty success or merge duplicate transactions', async () => {
  const f = setup(); await assert.rejects(overview(f, { ledgerStore: {} }), { code: 'INVALID_LEDGER_STORE' });
  const tx = f.ledger.getAllTransactions()[0];
  await assert.rejects(overview(f, { ledgerStore: { getAllTransactions: () => [tx, tx] } }), { code: 'INVALID_LEDGER_STORE' });
  await assert.rejects(overview(f, { ledgerStore: { getAllTransactions: () => [{ ...tx, restaurantId: 'other' }] } }), { code: 'INVALID_MERCHANT_SCOPE' });
});

test('an unbalanced recent transaction is rejected even if another transaction hides the global difference', async () => {
  const f = setup();
  const a = f.state.marketplaceLedgerEntry.find(row => row.orderId === 'a' && row.eventType === 'ORDER_CAPTURED' && row.type === 'DEBIT');
  const b = f.state.marketplaceLedgerEntry.find(row => row.orderId === 'b' && row.type === 'DEBIT');
  a.amount = '116.00'; b.amount = '229.00';
  await assert.rejects(overview(f), { code: 'UNBALANCED_LEDGER' });
});

test('real pipeline capture/verified delivery produces GMV once and platform fee only on settlement', async () => {
  const f = fixture(); f.state.restaurant.forEach((row, i) => Object.assign(row, { name: `Store ${i}`, businessType: 'RESTAURANT',
    createdAt: new Date(NOW), tenant: { ...row.tenant, slug: `real-${i}` } }));
  const order = await f.service.createMarketplaceOrder({ ...input(), prismaClient: f.prisma }); f.approved(order.id);
  const paid = await f.service.confirmMarketplacePayment({ orderId: order.id, paymentId: 'pay-1', prismaClient: f.prisma });
  const before = await overview(f); assert.equal(before.gmvTotal, 28.70); assert.equal(before.platformFees, 0);
  const courier = { id: 'd1', isActive: true, isShared: true }; const args = { orderId: order.id, courier, prismaClient: f.prisma };
  await f.service.acceptMarketplaceOffer({ ...args, offerId: paid.dispatch.offerId }); f.state.order[0].status = 'READY';
  const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  await f.service.confirmMarketplacePickup({ ...args, pickupPin }); await f.service.confirmMarketplaceDelivery({ ...args, deliveryPin: order.deliveryPin });
  const after = await overview(f); assert.equal(after.gmvTotal, 28.70); assert.equal(after.platformFees, 1.29);
  assert.equal(after.balances.COURIER_PAYABLE, 3); assert.equal(after.balances.MERCHANT_PAYABLE, 24.41); assert.equal(after.balances.GATEWAY_ESCROW, 0);
});

test('route registers authenticate and requireSuperAdmin before all global audit reads', async () => {
  const f = setup(); const route = http(f); const response = await route.request();
  assert.equal(response.statusCode, 200); assert.equal(response.body.gmvTotal, 375);
  assert.deepEqual(route.authCalls, ['authenticate', 'requireSuperAdmin']); assert.equal(route.bypasses, 1);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('missing/forged authentication and non-SuperAdmin roles cannot enter bypass or query finance', async () => {
  const f = setup(); const route = http(f);
  for (const [token, status] of [['', 401], ['invalid', 401], ['owner', 403], ['driver', 403], ['inactive', 403], ['device', 403]]) {
    const response = await route.request({ headers: { authorization: `Bearer ${token}` }, user: { role: 'SUPER_ADMIN' } });
    assert.equal(response.statusCode, status); assert.equal(response.headers['Cache-Control'], 'no-store');
  }
  assert.equal(route.bypasses, 0); assert.equal(f.calls.length, 0);
});

test('global route explicitly bypasses tenant context only inside the authorized read and restores it', async () => {
  const f = setup(); const route = http(f);
  await runWithTenant({ restaurantId: 'r1', correlationId: 'audit-request' }, async () => {
    const response = await route.request({ headers: { authorization: 'Bearer root', 'x-restaurant-id': 'r1' }, restaurantId: 'r1' });
    assert.ok(response.body.merchants.some(row => row.id === 'r2'));
    assert.equal(getTenantContext().restaurantId, 'r1'); assert.equal(getTenantContext().bypass, undefined);
  });
});

test('unsupported filters and unavailable persistence return safe 400/503 without retries or partial success', async () => {
  const f = setup(); const route = http(f);
  assert.equal((await route.request({ query: { restaurantId: 'r1' } })).statusCode, 400); assert.equal(f.calls.length, 0);
  let count = 0; f.prisma.$transaction = async () => { count++; throw new Error('postgres://private:secret'); };
  const failure = await route.request(); assert.equal(failure.statusCode, 503); assert.equal(count, 1);
  assert.ok(!JSON.stringify(failure.body).includes('private')); assert.equal(failure.headers['Cache-Control'], 'no-store');
});
