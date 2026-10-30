'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, input, NOW } = require('./helpers/marketplace-orders-fixture.cjs');
const { createDriverPayoutsService } = require('../src/lib/marketplace-driver-payouts');
const { getDriverBalance } = require('../src/lib/marketplace-driver-balance');
const { createLedgerTransaction, recordLedgerTransaction } = require('../src/lib/marketplace-ledger');
const { getMarketplaceOverview } = require('../src/lib/saas-marketplace');
const createRouter = require('../src/routes/marketplace.routes');

globalThis.fetch = async () => { throw Error('Offline tests forbid network'); };
const DRIVER = { id: 'd1', role: 'DELIVERY', isActive: true, restaurantId: 'r1', tenantId: 't1', locationId: 'l1' };
const ADMIN = { id: 'admin1', role: 'ADMIN', isActive: true, restaurantId: 'r1', tenantId: 't1' };
const ROOT = { id: 'root', role: 'SUPER_ADMIN', isActive: true };
function setup(options = {}) {
  const f = fixture();
  f.state.restaurant.forEach((row, i) => Object.assign(row, { tenantId: `t${i + 1}`, name: `Store ${i}`,
    createdAt: new Date(NOW), businessType: 'RESTAURANT', tenant: { ...row.tenant, slug: `tenant-${i}` } }));
  f.state.location.push({ id: 'l3', restaurantId: 'r1', isActive: true });
  f.state.employee.push({ id: 'd1', role: 'DELIVERY', isActive: true, locationId: 'l1' },
    { id: 'd2', role: 'DELIVERY', isActive: true, locationId: 'l1' },
    { id: 'd3', role: 'DELIVERY', isActive: true, locationId: 'l2' });
  function earn(suffix, value, restaurantId = 'r1', driverId = 'd1') {
    const orderId = `o-${suffix}`; const paymentId = `p-${suffix}`;
    f.state.order.push({ id: orderId, restaurantId, locationId: restaurantId === 'r1' ? 'l1' : 'l2',
      source: 'MARKETPLACE', deliveryDriverId: null, orderType: 'DELIVERY', orderNumber: suffix,
      status: 'DELIVERED', paymentMethod: 'CARD', paymentStatus: 'PAID', cashCollected: false,
      total: Number(value), deliveryFee: Number(value), tip: 0, updatedAt: new Date(NOW) });
    f.state.marketplaceOrderPipeline.push({ orderId, restaurantId, currency: 'MXN',
      dispatch: { task: { orderId, restaurantId, currentAssignment: { courierId: driverId } } } });
    f.state.marketplacePayment.push({ id: paymentId, restaurantId, orderId, status: 'CAPTURED', currency: 'MXN', amount: String(value) });
    const transaction = createLedgerTransaction({ eventType: 'ORDER_SETTLED', orderId, createdAt: new Date(NOW), entries: [
      { account: 'GATEWAY_ESCROW', type: 'DEBIT', amount: Number(value) }, { account: 'COURIER_PAYABLE', type: 'CREDIT', amount: Number(value) } ] });
    f.state.marketplaceLedgerEntry.push(...transaction.entries.map((entry, index) => ({ ...entry, restaurantId,
      orderId, paymentId, payoutId: null, beneficiaryId: entry.account === 'COURIER_PAYABLE' ? driverId : null,
      transactionId: transaction.id, transactionHash: transaction.hash, idempotencyKey: `earn-${suffix}`, lineNumber: index + 1,
      eventType: transaction.eventType, currency: 'MXN', amount: String(value), referenceId: null, createdAt: new Date(NOW) })));
  }
  earn('a', '60.10'); earn('b', '40.25'); earn('other-driver', '500.00', 'r1', 'd2'); earn('other-store', '900.00', 'r2', 'd3');
  const service = createDriverPayoutsService({ now: () => new Date(NOW), ...options });
  const args = { actor: DRIVER, driverId: 'd1', restaurantId: 'r1', prismaClient: f.prisma };
  const request = (overrides = {}) => service.requestDriverPayout({ ...args, amount: '40.00', idempotencyKey: 'request-key-1', ...overrides });
  const approve = (payoutId, overrides = {}) => service.approveDriverPayout({ payoutId, actor: ADMIN,
    restaurantId: 'r1', prismaClient: f.prisma, idempotencyKey: `approval-${payoutId}`, paymentReference: `BANK-${payoutId}`,
    confirmPaid: true, ...overrides });
  const list = (overrides = {}) => service.listDriverPayouts({ ...args, ...overrides });
  return Object.assign(f, { service, args, earn, request, approve, list });
}
function http(f) {
  const routes = new Map(); let authCalls = 0; let dbLoads = 0;
  const users = { driver: DRIVER, admin: ADMIN, root: ROOT, outsider: { ...DRIVER, id: 'd2' },
    tenant: { ...DRIVER, restaurantId: 'r2', tenantId: 't2' }, owner: { ...ADMIN, role: 'OWNER' },
    manager: { ...ADMIN, role: 'MANAGER', canManageDriverCash: true }, inactive: { ...DRIVER, isActive: false },
    device: { ...ADMIN, isDevice: true } };
  const authenticate = (req, res, next) => {
    authCalls++; req.user = users[req.headers.authorization];
    return req.user ? next() : res.status(401).json({ errorCode: 'UNAUTHENTICATED' });
  };
  createRouter({ storeSlugs: '', getPrisma: () => { dbLoads++; return f.prisma; }, authenticate,
    payoutOptions: { now: () => new Date(NOW) }, Router: () => ({
      get: (route, ...handlers) => routes.set(`get ${route}`, handlers),
      post: (route, ...handlers) => routes.set(`post ${route}`, handlers),
    }) });
  return { get authCalls() { return authCalls; }, get dbLoads() { return dbLoads; }, routes, async request(kind = 'request', overrides = {}) {
    const [method, route] = kind === 'list' ? ['get', '/drivers/:id/payouts'] : kind === 'approve'
      ? ['post', '/payouts/:payoutId/approve'] : ['post', '/drivers/:id/payout-request'];
    const req = { params: { id: 'd1', payoutId: f.state.marketplaceDriverPayout[0]?.id }, query: {},
      headers: { authorization: kind === 'approve' ? 'admin' : 'driver', 'idempotency-key': `http-${kind}` },
      body: kind === 'approve' ? { paymentReference: 'BANK-HTTP', confirmPaid: true } : { amount: '20.00' }, ...overrides };
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const handlers = routes.get(`${method} ${route}`);
    async function invoke(i) { if (!handlers[i]) return; let next;
      await handlers[i](req, res, () => { next = invoke(i + 1); return next; }); if (next) await next; }
    await invoke(0); return res;
  } };
}
function cents(amount) { const [whole, fraction = ''] = String(amount).split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')); }

test('request reserves exact courier fees/tips without moving ledger or mixing other drivers/stores', async () => {
  const f = setup(); const before = structuredClone(f.state.marketplaceLedgerEntry);
  const result = await f.request(); assert.equal(result.payout.amount, 40); assert.equal(result.payout.amountCents, 4000);
  assert.equal(result.payout.status, 'PENDING'); assert.equal(result.idempotent, false);
  assert.deepEqual(f.state.marketplaceLedgerEntry, before);
  const list = await f.list(); assert.equal(list.balance, 100.35); assert.equal(list.reservedAmount, 40); assert.equal(list.availableAmount, 60.35);
  assert.equal(list.cashOnHand, 0); assert.equal(list.payouts.length, 1);
});
test('available balance subtracts paid debits and every pending reservation', async () => {
  const f = setup(); const first = await f.request(); await f.approve(first.payout.id);
  await f.request({ amount: '50.00', idempotencyKey: 'second' });
  assert.equal((await f.list()).availableAmount, 10.35);
  await assert.rejects(f.request({ amount: '10.36', idempotencyKey: 'third' }), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
  assert.equal((await getDriverBalance({ ...f.args })).balance, 60.35);
});
test('amount must be positive, exact cents, MXN and within server-owned limits', async () => {
  for (const amount of [0, -1, 1.001, NaN, Infinity, null, true, {}, '1e2', '1.000', '100000.01', '900719925474099999']) {
    const f = setup(); await assert.rejects(f.request({ amount }), error => error.statusCode === 400);
    assert.equal(f.state.marketplaceDriverPayout.length, 0);
  }
  const f = setup(); await assert.rejects(f.request({ currency: 'USD' }), { code: 'UNSUPPORTED_CURRENCY' });
  for (const idempotencyKey of ['', undefined, 'bad key', ['key'], 'a'.repeat(201)])
    await assert.rejects(f.request({ idempotencyKey }), { code: 'INVALID_IDEMPOTENCY_KEY' });
  const custom = setup({ minAmount: 5, maxAmount: 10 });
  await assert.rejects(custom.request({ amount: '4.99' }), { code: 'PAYOUT_LIMIT_EXCEEDED' });
  await custom.request({ amount: 10 });
  assert.throws(() => createDriverPayoutsService({ minAmount: 0 }), { code: 'INVALID_PAYOUT_LIMITS' });
});
test('no earnings, insufficient earnings and negative liability cannot fund a request', async () => {
  const f = setup(); await assert.rejects(f.request({ amount: '100.36' }), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
  f.state.marketplaceLedgerEntry = [];
  await assert.rejects(f.request(), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
  f.state.marketplaceLedgerEntry.push({ restaurantId: 'r1', beneficiaryId: 'd1', account: 'COURIER_PAYABLE', type: 'DEBIT', currency: 'MXN', amount: '5.00' });
  await assert.rejects(f.request(), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
});
test('persistent idempotency survives service recreation and rejects changed amount', async () => {
  const f = setup(); const first = await f.request();
  const service = createDriverPayoutsService(); const replay = await service.requestDriverPayout({ ...f.args,
    amount: 40, idempotencyKey: 'request-key-1' });
  assert.equal(replay.idempotent, true); assert.deepEqual(replay.payout, first.payout);
  await assert.rejects(f.request({ amount: '41.00' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.state.marketplaceDriverPayout.length, 1);
});
test('concurrent same-key requests create one reservation and competing keys cannot overdraw', async () => {
  const f = setup(); const results = await Promise.all([f.request({ amount: 70 }), f.request({ amount: 70 })]);
  assert.equal(results.filter(row => row.idempotent).length, 1); assert.equal(f.state.marketplaceDriverPayout.length, 1);
  const g = setup(); const race = await Promise.allSettled([g.request({ amount: 70 }), g.request({ amount: 70, idempotencyKey: 'other' })]);
  assert.equal(race.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(race.find(row => row.status === 'rejected').reason.code, 'INSUFFICIENT_AVAILABLE_BALANCE');
});
for (const method of ['CASH', 'CASH_ON_DELIVERY']) {
  test(`${method} delivered without cashCollected blocks requesting until cashier reconciles`, async () => {
    const f = setup(); f.state.order[0].paymentMethod = method;
    await assert.rejects(f.request(), { code: 'CASH_RECONCILIATION_REQUIRED' });
    assert.equal((await f.list()).cashOnHand, 60.10); assert.equal(f.state.marketplaceDriverPayout.length, 0);
    f.state.order[0].cashCollected = true; await f.request(); assert.equal(f.state.marketplaceDriverPayout.length, 1);
  });
}
test('cash pending in another driver/store or an undelivered order is not charged to this driver', async () => {
  const f = setup(); f.state.order.filter(row => row.id !== 'o-a' && row.id !== 'o-b').forEach(row => { row.paymentMethod = 'CASH'; });
  f.state.order[0].status = 'ON_THE_WAY'; f.state.order[0].paymentMethod = 'CASH'; await f.request();
  assert.equal((await f.list()).cashOnHand, 0);
});
test('approval rechecks new cash custody and preserves the request until reconciliation', async () => {
  const f = setup(); const request = await f.request(); f.state.order[0].paymentMethod = 'CASH';
  await assert.rejects(f.approve(request.payout.id), { code: 'CASH_RECONCILIATION_REQUIRED' });
  assert.equal(f.state.marketplaceDriverPayout[0].status, 'PENDING');
  assert.equal(f.state.marketplaceLedgerEntry.some(row => row.payoutId), false);
  f.state.order[0].cashCollected = true; await f.approve(request.payout.id);
  assert.equal(f.state.marketplaceDriverPayout[0].status, 'PAID');
});
test('approval needs admin or superadmin and explicit confirmation/reference of an external payment', async () => {
  const f = setup(); const { payout } = await f.request();
  for (const actor of [DRIVER, { ...ADMIN, role: 'OWNER' }, { ...ADMIN, role: 'MANAGER', canManageDriverCash: true }])
    await assert.rejects(f.approve(payout.id, { actor }), { code: 'PAYOUT_FORBIDDEN' });
  for (const args of [{ confirmPaid: false }, { confirmPaid: undefined }, { paymentReference: '' },
    { paymentReference: ' bad ' }, { paymentReference: 'bad\nreference' }, { paymentReference: 'a'.repeat(201) }])
    await assert.rejects(f.approve(payout.id, args), { code: 'PAYMENT_CONFIRMATION_REQUIRED' });
  await f.approve(payout.id, { actor: ROOT }); assert.equal(f.state.marketplaceDriverPayout[0].approvedBy, 'root');
});
test('approval posts immutable double entry; credits equal debits and courier payable decreases once', async () => {
  const f = setup(); const { payout } = await f.request({ amount: '90.29' }); const old = structuredClone(f.state.marketplaceLedgerEntry);
  const result = await f.approve(payout.id); assert.equal(result.payout.status, 'PAID'); assert.equal(result.payout.paidAt.getTime(), NOW.getTime());
  assert.deepEqual(f.state.marketplaceLedgerEntry.slice(0, old.length), old);
  const lines = f.state.marketplaceLedgerEntry.filter(row => row.payoutId === payout.id);
  assert.equal(lines.length, 4); assert.equal(new Set(lines.map(row => row.paymentId)).size, 2);
  const debit = lines.filter(row => row.type === 'DEBIT').reduce((sum, row) => sum + cents(row.amount), 0n);
  const credit = lines.filter(row => row.type === 'CREDIT').reduce((sum, row) => sum + cents(row.amount), 0n);
  assert.equal(debit, 9029n); assert.equal(credit, debit);
  for (const row of lines) assert.equal(row.account, row.type === 'DEBIT' ? 'COURIER_PAYABLE' : 'PAYOUT_CLEARING');
  const balance = await getDriverBalance(f.args); assert.equal(balance.balanceCents, 1006);
  assert.equal((await f.list()).reservedAmount, 0); assert.equal(f.providerCalls.length, 0);
});
test('partial payout preserves payment/order origin and never overwrites capture/settlement', async () => {
  const f = setup(); const a = await f.request({ amount: '20.00' }); await f.approve(a.payout.id);
  const b = await f.request({ amount: '50.00', idempotencyKey: 'second' }); await f.approve(b.payout.id);
  assert.equal((await f.list()).balance, 30.35);
  const bLines = f.state.marketplaceLedgerEntry.filter(row => row.payoutId === b.payout.id && row.type === 'DEBIT');
  assert.deepEqual(bLines.map(row => [row.paymentId, row.amount]), [['p-a', '40.10'], ['p-b', '9.90']]);
  assert.equal(f.state.marketplacePayment.every(row => row.status === 'CAPTURED'), true);
});
test('duplicate/concurrent approvals and later paid request replays do not create another debit', async () => {
  const f = setup(); const { payout } = await f.request();
  const results = await Promise.all([f.approve(payout.id), f.approve(payout.id)]);
  assert.equal(results.filter(row => row.idempotent).length, 1);
  assert.equal(f.state.marketplaceLedgerEntry.filter(row => row.payoutId).length, 2);
  assert.equal((await f.request()).payout.status, 'PAID');
  for (const overrides of [{ paymentReference: 'OTHER' }, { idempotencyKey: 'other-key' }])
    await assert.rejects(f.approve(payout.id, overrides), { code: 'IDEMPOTENCY_CONFLICT' });
});
test('confirmation key and bank reference cannot fund two requests', async () => {
  const f = setup(); const a = await f.request(); const b = await f.request({ idempotencyKey: 'second' });
  await f.approve(a.payout.id, { idempotencyKey: 'stable-approval', paymentReference: 'BANK-ONE' });
  await assert.rejects(f.approve(b.payout.id, { idempotencyKey: 'stable-approval' }), { code: 'IDEMPOTENCY_CONFLICT' });
  await assert.rejects(f.approve(b.payout.id, { paymentReference: 'BANK-ONE' }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal(f.state.marketplaceDriverPayout[1].status, 'PENDING');
});
test('approval refuses a changed ledger that no longer covers all reservations', async () => {
  const f = setup(); const { payout } = await f.request({ amount: 80 });
  f.state.marketplaceLedgerEntry.push({ restaurantId: 'r1', paymentId: 'p-a', orderId: 'o-a',
    account: 'COURIER_PAYABLE', beneficiaryId: 'd1', type: 'DEBIT', amount: '30.00', currency: 'MXN' });
  await assert.rejects(f.approve(payout.id), { code: 'INSUFFICIENT_AVAILABLE_BALANCE' });
  assert.equal(f.state.marketplaceDriverPayout[0].status, 'PENDING');
});
test('approval cannot consume funds reserved by another pending request', async () => {
  const f = setup(); const a = await f.request({ amount: 60 }); const b = await f.request({ amount: '40.35', idempotencyKey: 'second' });
  await Promise.all([f.approve(a.payout.id), f.approve(b.payout.id)]);
  assert.equal((await f.list()).balanceCents, 0); assert.equal((await f.list()).availableAmount, 0);
  const pending = f.state.marketplaceDriverPayout.filter(row => row.status === 'PENDING'); assert.equal(pending.length, 0);
});
test('rollback covers all payout lots and status when any write fails', async () => {
  for (const failAt of ['first-line-batch', 'second-line-batch', 'payout-status']) {
    const f = setup(); const { payout } = await f.request({ amount: 90 }); const before = structuredClone(f.state.marketplaceLedgerEntry);
    let batch = 0; f.hooks.beforeWrite = (model, method) => {
      if (model === 'marketplaceLedgerEntry' && method === 'createMany') {
        batch++; if (failAt === 'first-line-batch' || batch === 2 && failAt === 'second-line-batch') throw Error('offline fault');
      }
      if (model === 'marketplaceDriverPayout' && method === 'updateMany' && failAt === 'payout-status') throw Error('offline fault');
    };
    await assert.rejects(f.approve(payout.id));
    assert.deepEqual(f.state.marketplaceLedgerEntry, before); assert.equal(f.state.marketplaceDriverPayout[0].status, 'PENDING');
  }
});
test('missing/partial/corrupted paid ledger is an integrity error on replay, never silently repaired', async () => {
  for (const mutate of [rows => rows.pop(), rows => { rows[0].amount = '39.00'; },
    rows => { rows[0].transactionHash = 'a'.repeat(64); }]) {
    const f = setup(); const { payout } = await f.request(); await f.approve(payout.id);
    const lines = f.state.marketplaceLedgerEntry.filter(row => row.payoutId); mutate(lines);
    f.state.marketplaceLedgerEntry = [...f.state.marketplaceLedgerEntry.filter(row => !row.payoutId), ...lines];
    const before = structuredClone(f.state.marketplaceLedgerEntry);
    await assert.rejects(f.approve(payout.id), { code: 'LEDGER_INTEGRITY_ERROR' }); assert.deepEqual(f.state.marketplaceLedgerEntry, before);
    await assert.rejects(f.request(), { code: 'LEDGER_INTEGRITY_ERROR' });
  }
});
test('foreign/refunded/missing payment or source order cannot back a payout', async () => {
  for (const mutate of [f => { f.state.marketplacePayment[0].status = 'REFUNDED'; },
    f => { f.state.marketplacePayment[0].restaurantId = 'r2'; }, f => { f.state.order[0].source = 'ONLINE'; },
    f => { f.state.marketplacePayment[0].amount = '1.00'; }]) {
    const f = setup(); const { payout } = await f.request(); mutate(f);
    await assert.rejects(f.approve(payout.id), { code: 'LEDGER_INTEGRITY_ERROR' });
    assert.equal(f.state.marketplaceLedgerEntry.some(row => row.payoutId), false);
  }
});
test('actor, tenant, restaurant, driver activity and staff location are enforced by the service', async () => {
  for (const overrides of [{ actor: null }, { actor: { ...DRIVER, isDevice: true } }, { actor: { ...DRIVER, isActive: false } },
    { actor: ADMIN }, { driverId: 'd2' }, { restaurantId: 'r2' }, { actor: { ...DRIVER, tenantId: 'other' } }]) {
    const f = setup(); await assert.rejects(f.request(overrides)); assert.equal(f.state.marketplaceDriverPayout.length, 0);
  }
  const f = setup(); const { payout } = await f.request();
  await assert.rejects(f.approve(payout.id, { actor: { ...ADMIN, locationId: 'l3' } }), { code: 'DRIVER_NOT_FOUND' });
  await assert.rejects(f.approve(payout.id, { actor: ROOT, restaurantId: 'r2' }), { code: 'PAYOUT_NOT_FOUND' });
  f.state.employee[0].isActive = false; await assert.rejects(f.approve(payout.id), { code: 'DRIVER_NOT_FOUND' });
});
test('listing is scoped, paginated, projected and authorized for self/admin only', async () => {
  const f = setup(); for (let i = 0; i < 5; i++) await f.request({ amount: 1, idempotencyKey: `key-${i}` });
  await f.request({ amount: 2, driverId: 'd2', actor: { ...DRIVER, id: 'd2' }, idempotencyKey: 'other-driver' });
  const first = await f.list({ limit: 2 }); const second = await f.list({ limit: 2, cursor: first.nextCursor });
  const third = await f.list({ limit: 2, cursor: second.nextCursor });
  assert.equal(new Set([...first.payouts, ...second.payouts, ...third.payouts].map(row => row.id)).size, 5);
  assert.equal(third.nextCursor, null); assert.equal((await f.list({ actor: ADMIN })).payouts.length, 5);
  for (const field of ['requestKey', 'requestHash', 'approvalKey', 'approvalHash']) assert.equal(first.payouts[0][field], undefined);
  await assert.rejects(f.list({ limit: 101 }), { code: 'INVALID_LIMIT' });
  await assert.rejects(f.list({ cursor: f.state.marketplaceDriverPayout.at(-1).id }), { code: 'INVALID_CURSOR' });
  await assert.rejects(f.list({ actor: { ...DRIVER, id: 'd2' } }), { code: 'PAYOUT_FORBIDDEN' });
});
test('write transactions are serializable and lock the real merchant before reservation/account reads', async () => {
  const f = setup(); const { payout } = await f.request(); await f.approve(payout.id);
  const transactions = f.calls.filter(call => call.method === '$transaction');
  assert.equal(transactions.length, 2); assert.ok(transactions.every(call => call.options.isolationLevel === 'Serializable'));
  const lock = f.calls.find(call => call.method === '$queryRaw'); assert.deepEqual(lock.values, ['r1']);
  assert.match(lock.sql, /"restaurants".*"isActive" = true FOR UPDATE/);
  const account = f.calls.find(call => call.model === 'marketplaceLedgerEntry' && call.method === 'groupBy');
  assert.deepEqual(account.args.where, { restaurantId: 'r1', beneficiaryId: 'd1', account: 'COURIER_PAYABLE' });
  assert.equal(f.calls.some(call => call.args?.skipDuplicates === true), false);
});
test('origin allocation pages past fully spent payment lots and preserves cent precision', async () => {
  const f = setup(); f.state.marketplaceLedgerEntry = []; f.state.marketplacePayment = []; f.state.order = [];
  for (let i = 0; i < 205; i++) {
    const suffix = String(i).padStart(3, '0'); f.earn(suffix, '0.01');
    if (i < 200) f.state.marketplaceLedgerEntry.push({ paymentId: `p-${suffix}`, orderId: `o-${suffix}`,
      restaurantId: 'r1', account: 'COURIER_PAYABLE', beneficiaryId: 'd1', type: 'DEBIT', amount: '0.01', currency: 'MXN' });
  }
  const { payout } = await f.request({ amount: '0.05' }); await f.approve(payout.id);
  const pages = f.calls.filter(call => call.method === 'groupBy' && call.args.by.length === 1 && call.args.by[0] === 'paymentId');
  assert.equal(pages.length, 2); assert.equal(pages[0].args.take, 200); assert.equal(pages[1].args.where.paymentId.gt, 'p-199');
  assert.equal((await f.list()).balanceCents, 0);
});
test('payouts appear in existing SuperAdmin ledger metrics without changing GMV or platform fees', async () => {
  const f = setup(); const before = await getMarketplaceOverview({ prismaClient: f.prisma });
  const { payout } = await f.request(); await f.approve(payout.id);
  const after = await getMarketplaceOverview({ prismaClient: f.prisma });
  assert.equal(after.gmvTotal, before.gmvTotal); assert.equal(after.platformFees, before.platformFees);
  assert.equal(after.balances.COURIER_PAYABLE, before.balances.COURIER_PAYABLE - 40);
  assert.equal(after.balances.GATEWAY_ESCROW, before.balances.GATEWAY_ESCROW);
  assert.ok(after.recentTransactions.some(row => row.eventType === 'PAYOUT_DISBURSED'));
  assert.equal(after.ledgerIntegrity.balanced, true);
});
test('real ONLINE order PIN settlement can fund an exact courier payout without modifying capture rules', async () => {
  const f = setup(); f.state.marketplaceLedgerEntry = []; f.state.marketplacePayment = []; f.state.order = [];
  f.state.marketplaceOrderPipeline = [];
  // Use the same persistent fake, rather than a second ledger store that cannot roll back.
  const { createMarketplaceOrdersService } = require('../src/lib/marketplace-orders');
  const { PIN_SECRET } = require('./helpers/marketplace-orders-fixture.cjs');
  const service = createMarketplaceOrdersService({ storeSlugs: 'alpha', pinSecrets: { test: PIN_SECRET }, activePinKeyId: 'test',
    getPaymentGateway: async () => ({ collectorId: '123', createPreference: async () => ({ id: 'preference', initPoint: 'https://example.invalid/checkout' }),
      getPayment: async () => ({ id: 'pay-online', status: 'approved', orderId: f.state.order[0].id, collectorId: '123',
        currency: 'MXN', amountCents: 2870, marketplaceFeeCents: 129 }) }), now: () => new Date(NOW) });
  const created = await service.createMarketplaceOrder({ ...input(), prismaClient: f.prisma });
  const paid = await service.confirmMarketplacePayment({ orderId: created.id, paymentId: 'pay-online', prismaClient: f.prisma });
  const courier = { id: 'd1', isActive: true, isShared: true }; const args = { orderId: created.id, courier, prismaClient: f.prisma };
  await service.acceptMarketplaceOffer({ ...args, offerId: paid.dispatch.offerId }); f.state.order[0].status = 'READY';
  const { pickupPin } = await service.getMarketplacePickupPin({ orderId: created.id, restaurantId: 'r1', prismaClient: f.prisma });
  await service.confirmMarketplacePickup({ ...args, pickupPin }); await service.confirmMarketplaceDelivery({ ...args, deliveryPin: created.deliveryPin });
  const { payout } = await f.request({ amount: 3 }); await f.approve(payout.id);
  assert.equal((await f.list()).balance, 0); assert.equal(f.state.marketplacePayment[0].amount, '28.70');
  const original = f.state.marketplaceLedgerEntry.filter(row => row.eventType === 'ORDER_CAPTURED'); assert.equal(original.length, 2);
});
test('original order ledger writer still rejects a partial-payment event rather than weakening its checks', async () => {
  const f = setup(); const transaction = createLedgerTransaction({ eventType: 'PAYOUT_DISBURSED', orderId: 'o-a', entries: [
    { account: 'COURIER_PAYABLE', type: 'DEBIT', amount: 1 }, { account: 'PAYOUT_CLEARING', type: 'CREDIT', amount: 1 } ] });
  await assert.rejects(recordLedgerTransaction({ transaction, paymentId: 'p-a', restaurantId: 'r1', courierId: 'd1',
    idempotencyKey: 'partial-invalid', prismaClient: f.prisma }), { code: 'LEDGER_INTEGRITY_ERROR' });
});
test('HTTP routes authenticate, reject unauthorized operations before loading Prisma, and set no-store', async () => {
  const f = setup(); const h = http(f);
  for (const token of ['', 'forged', 'admin', 'outsider', 'owner', 'inactive', 'device']) {
    const result = await h.request('request', { headers: { authorization: token }, user: ADMIN });
    assert.ok([401, 403].includes(result.statusCode)); assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  for (const token of ['driver', 'manager', 'owner']) assert.equal((await h.request('approve', { headers: { authorization: token } })).statusCode, 403);
  assert.equal(h.dbLoads, 0); assert.equal(f.calls.length, 0); assert.ok(h.authCalls > 0);
});
test('HTTP create/list/approve contract and idempotency return 201/200 with private projected data', async () => {
  const f = setup(); const h = http(f); const created = await h.request(); assert.equal(created.statusCode, 201);
  const replay = await h.request(); assert.equal(replay.statusCode, 200); assert.equal(replay.body.idempotent, true);
  const list = await h.request('list'); assert.equal(list.body.availableAmount, 80.35); assert.equal(list.body.payouts.length, 1);
  const paid = await h.request('approve'); assert.equal(paid.statusCode, 200); assert.equal(paid.body.payout.status, 'PAID');
  assert.equal((await h.request('approve')).body.idempotent, true);
  assert.equal((await h.request('list', { query: { restaurantId: 'r2' } })).statusCode, 403);
  assert.ok(!JSON.stringify(paid.body).includes('approvalHash'));
});
test('HTTP rejects client-controlled identity, balance, cash reconciliation and invalid filters', async () => {
  const f = setup(); const h = http(f);
  for (const body of [{ amount: 20, driverId: 'd2' }, { amount: 20, restaurantId: 'r2' },
    { amount: 20, cashCollected: true }, { amount: 20, balance: 1000 }, { amount: 20, approvedBy: 'root' }])
    assert.equal((await h.request('request', { body })).statusCode, 400);
  for (const query of [{ limit: '1junk' }, { limit: '101' }, { cursor: ['bad'] }, { unexpected: 'x' }])
    assert.equal((await h.request('list', { query })).statusCode, 400);
  assert.equal(f.state.marketplaceDriverPayout.length, 0);
});
test('database conflicts return 409 once, unavailability returns safe 503 without retry or secret exposure', async () => {
  for (const code of ['P2034', 'P2002', 'P2028', 'ECONNREFUSED']) {
    const f = setup(); let calls = 0; f.prisma.$transaction = async () => { calls++; throw Object.assign(Error('postgres://secret'), { code }); };
    const result = await http(f).request(); assert.equal(result.statusCode, code.startsWith('P') ? 409 : 503);
    assert.equal(calls, 1); assert.ok(!JSON.stringify(result.body).includes('secret'));
  }
  const f = setup(); delete f.prisma.marketplaceDriverPayout;
  await assert.rejects(f.request(), { code: 'PAYOUT_UNAVAILABLE', statusCode: 503 });
});
test('schemas stay byte-identical with persistent request uniqueness, tenant-bound ledger link and guard registration', () => {
  const root = path.resolve(__dirname, '../../..'); const a = fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma'));
  assert.ok(a.equals(fs.readFileSync(path.join(root, 'apps/backend/prisma/schema.prisma'))));
  const source = a.toString(); assert.match(source, /model MarketplaceDriverPayout \{/);
  assert.match(source, /@@unique\(\[restaurantId, driverId, requestKey\]\)/);
  assert.match(source, /@@unique\(\[restaurantId, paymentReference\]\)/);
  assert.match(source, /payout MarketplaceDriverPayout\? @relation\(fields: \[payoutId, restaurantId\]/);
  const { SCOPED_MODELS } = require('../../../packages/database/tenant-guard'); assert.ok(SCOPED_MODELS.has('MarketplaceDriverPayout'));
});
