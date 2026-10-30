'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, input, NOW } = require('./helpers/marketplace-orders-fixture.cjs');
const { getDriverBalance, getDriverDeliveryHistory } = require('../src/lib/marketplace-driver-balance');
const { createInMemoryLedgerStore, createLedgerTransaction } = require('../src/lib/marketplace-ledger');
const createRouter = require('../src/routes/marketplace.routes');

globalThis.fetch = async () => { throw new Error('Offline suite forbids network'); };

function setup() {
  const f = fixture();
  function order(id, fields = {}) {
    return { id, restaurantId: 'r1', source: 'ONLINE', deliveryDriverId: 'd1', orderType: 'DELIVERY',
      orderNumber: id, status: 'DELIVERED', paymentStatus: 'PENDING', paymentMethod: 'CASH',
      total: 100.10, deliveryFee: 10, tip: 5, cashCollected: false, updatedAt: new Date(NOW),
      customerName: 'PRIVATE CUSTOMER', customerPhone: 'PRIVATE PHONE', deliveryAddress: 'PRIVATE ADDRESS', ...fields };
  }
  f.state.order = [order('cash'), order('cut', { cashCollected: true }), order('card', { paymentMethod: 'CARD' }),
    order('pending', { status: 'ON_THE_WAY' }), order('cancelled', { status: 'CANCELLED' }),
    order('other-driver', { deliveryDriverId: 'd2' }), order('other-store', { restaurantId: 'r2' }),
    order('takeaway', { orderType: 'TAKEOUT' }), order('mp', { source: 'MARKETPLACE', deliveryDriverId: 'stale-driver', total: 200.20 })];
  f.state.marketplaceOrderPipeline = [{ orderId: 'mp', restaurantId: 'r1', currency: 'MXN',
    dispatch: { task: { currentAssignment: { courierId: 'd1' }, pickupPinHash: 'PRIVATE PIN HASH' } } }];
  const line = (id, amount, type = 'CREDIT', fields = {}) => ({ id, amount, type, account: 'COURIER_PAYABLE',
    restaurantId: 'r1', beneficiaryId: 'd1', currency: 'MXN', ...fields });
  f.state.marketplaceLedgerEntry = [line('fee-plus-tip-1', '15.00'), line('fee-plus-tip-2', '8.50'),
    line('paid-payout', '5.00', 'DEBIT', { eventType: 'PAYOUT_DISBURSED' }),
    line('foreign-driver', '900.00', 'CREDIT', { beneficiaryId: 'd2' }),
    line('foreign-store', '800.00', 'CREDIT', { restaurantId: 'r2' }),
    line('different-account', '700.00', 'CREDIT', { account: 'MERCHANT_PAYABLE' })];
  f.hooks.beforeWrite = () => assert.fail('Balance/history must never write');
  return f;
}
const balance = (f, extra = {}) => getDriverBalance({ driverId: 'd1', restaurantId: 'r1', prismaClient: f.prisma, ...extra });
function memoryStore() {
  const ledger = createInMemoryLedgerStore();
  for (const [id, value, type, restaurantId, driverId] of [
    ['fee-and-tip', 15, 'CREDIT', 'r1', 'd1'], ['second-tip', 8.5, 'CREDIT', 'r1', 'd1'],
    ['paid-payout', 5, 'DEBIT', 'r1', 'd1'], ['other-driver', 900, 'CREDIT', 'r1', 'd2'], ['other-store', 800, 'CREDIT', 'r2', 'd1'],
  ]) ledger.record(createLedgerTransaction({ orderId: id, eventType: type === 'DEBIT' ? 'PAYOUT_DISBURSED' : 'ORDER_SETTLED',
    entries: [{ account: 'COURIER_PAYABLE', type, amount: value, metadata: { restaurantId, driverId } },
      { account: 'GATEWAY_ESCROW', type: type === 'DEBIT' ? 'CREDIT' : 'DEBIT', amount: value }] }), id);
  return ledger;
}
function http(f, options = {}) {
  const routes = new Map();
  createRouter({ storeSlugs: '', getPrisma: () => f.prisma,
    authenticate: (req, res, next) => req.user ? next() : res.status(401).json({ errorCode: 'UNAUTHENTICATED' }),
    Router: () => ({ get: (path, ...handlers) => routes.set(path, handlers), post() {} }), ...options });
  return async (kind, req = {}) => {
    const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    const request = { params: { id: 'd1' }, query: {}, headers: {},
      user: { id: 'd1', role: 'DELIVERY', isActive: true, restaurantId: 'r1' }, ...req };
    const handlers = routes.get(`/drivers/:id/${kind}`);
    const invoke = index => handlers[index]?.(request, res, () => invoke(index + 1));
    await invoke(0); return res;
  };
}

test('positive balance includes delivery fees and tips, subtracts posted payouts and keeps cash separate', async () => {
  const f = setup(); const result = await balance(f);
  assert.equal(result.totalCredits, 23.50); assert.equal(result.totalDebits, 5); assert.equal(result.balance, 18.50);
  assert.equal(result.balanceCents, 1850); assert.equal(result.cashInHand, 300.30); assert.equal(result.cashInHandCents, 30030);
  assert.equal(result.pendingCashOrders, 2); assert.equal(result.currency, 'MXN');
  assert.equal(f.calls[0].options.isolationLevel, 'RepeatableRead');
});

test('Prisma groups only the requested beneficiary, restaurant and COURIER_PAYABLE account', async () => {
  const f = setup(); await balance(f);
  const query = f.calls.find(call => call.method === 'groupBy').args;
  assert.deepEqual(query.where, { restaurantId: 'r1', beneficiaryId: 'd1', account: 'COURIER_PAYABLE' });
  assert.deepEqual(query.by, ['type', 'currency']); assert.deepEqual(query._sum, { amount: true });
  assert.ok(!('include' in query));
});

test('in-memory ledger adapter matches Prisma, preserves metadata scope and does not query the SQL ledger', async () => {
  const f = setup(); const ledger = memoryStore();
  const before = ledger.getAllTransactions(); const result = await balance(f, { ledgerStore: ledger });
  assert.equal(result.balance, 18.50); assert.equal(result.cashInHand, 300.30);
  assert.equal(f.calls.some(call => call.method === 'groupBy'), false); assert.deepEqual(ledger.getAllTransactions(), before);
});

test('memory adapter also accepts explicit beneficiary/restaurant columns without leaking another driver', async () => {
  const f = setup(); const rows = f.state.marketplaceLedgerEntry;
  const result = await balance(f, { ledgerStore: { getAllTransactions: () => [{ currency: 'MXN', entries: rows }] } });
  assert.equal(result.balance, 18.50);
});

test('no earnings and overpaid balances are reported honestly without clamping to zero', async () => {
  const f = setup(); f.state.marketplaceLedgerEntry = [];
  assert.equal((await balance(f)).balance, 0);
  f.state.marketplaceLedgerEntry.push({ restaurantId: 'r1', beneficiaryId: 'd1', account: 'COURIER_PAYABLE', type: 'DEBIT', currency: 'MXN', amount: '12.00' });
  assert.equal((await balance(f)).balance, -12);
});

test('cash uses delivered CASH orders without a cut, including shared marketplace assignments', async () => {
  const f = setup(); await balance(f);
  const query = f.calls.find(call => call.model === 'order' && call.method === 'findMany').args;
  assert.equal(query.where.status, 'DELIVERED'); assert.deepEqual(query.where.paymentMethod, { in: ['CASH', 'CASH_ON_DELIVERY'] }); assert.equal(query.where.cashCollected, false);
  assert.equal(query.where.restaurantId, 'r1'); assert.equal(query.where.orderType, 'DELIVERY'); assert.equal(query.take, 200);
  assert.equal(query.where.OR[1].marketplacePipeline.is.restaurantId, 'r1');
  assert.deepEqual(query.where.OR[1].marketplacePipeline.is.dispatch, { path: ['task', 'currentAssignment', 'courierId'], equals: 'd1' });
  assert.ok(!query.select.customerName); assert.ok(!query.select.deliveryAddress); assert.ok(!query.select.marketplacePipeline.select.dispatch);
});

test('marketplace que entrega la tienda (MANUAL): el efectivo cuenta para su repartidor propio', async () => {
  const f = setup(); const base = f.state.order[0];
  f.state.order.push({ ...base, id: 'mp-store', source: 'MARKETPLACE', deliveryDriverId: 'd1', total: 115.50 },
    { ...base, id: 'mp-store-other', source: 'MARKETPLACE', deliveryDriverId: 'd2', total: 50 },
    { ...base, id: 'mp-shared-stale', source: 'MARKETPLACE', deliveryDriverId: 'd1', total: 70 });
  f.state.marketplaceOrderPipeline.push(
    { orderId: 'mp-store', restaurantId: 'r1', currency: 'MXN', dispatch: { task: { deliveryPolicy: 'MANUAL', currentAssignment: null } } },
    { orderId: 'mp-store-other', restaurantId: 'r1', currency: 'MXN', dispatch: { task: { deliveryPolicy: 'MANUAL' } } },
    // Red compartida con un deliveryDriverId viejo: no es del repartidor propio.
    { orderId: 'mp-shared-stale', restaurantId: 'r1', currency: 'MXN', dispatch: { task: { deliveryPolicy: 'SHARED_ONLY', currentAssignment: { courierId: 'd9' } } } });
  const result = await balance(f);
  assert.equal(result.cashInHand, 415.80);
  assert.equal(result.pendingCashOrders, 3);
  const query = f.calls.find(call => call.model === 'order' && call.method === 'findMany').args;
  assert.deepEqual(query.where.OR[2], { source: 'MARKETPLACE', deliveryDriverId: 'd1', marketplacePipeline: { is: { restaurantId: 'r1',
    dispatch: { path: ['task', 'deliveryPolicy'], equals: 'MANUAL' } } } });
});

test('stale legacy driver fields do not override the marketplace assignment and collected cash disappears', async () => {
  const f = setup();
  assert.equal((await balance(f, { driverId: 'stale-driver' })).cashInHand, 0);
  f.state.order.find(row => row.id === 'mp').cashCollected = true;
  assert.equal((await balance(f)).cashInHand, 100.10);
});

test('cash paging includes all matching orders and rounds only Float representation noise', async () => {
  const f = setup(); const template = f.state.order[0];
  f.state.order = Array.from({ length: 205 }, (_, i) => ({ ...template, id: `cash-${String(i).padStart(3, '0')}`, total: 0.1 + 0.2 }));
  const result = await balance(f); assert.equal(result.pendingCashOrders, 205); assert.equal(result.cashInHand, 61.50);
  const pages = f.calls.filter(call => call.model === 'order' && call.method === 'findMany');
  assert.equal(pages.length, 2); assert.equal(pages[1].args.where.id.gt, 'cash-199');
});

test('aggregate totals exceed the per-order money cap without losing integer cents', async () => {
  const f = setup(); f.state.marketplaceLedgerEntry = Array.from({ length: 3 }, (_, i) => ({ id: `large-${i}`, restaurantId: 'r1',
    beneficiaryId: 'd1', account: 'COURIER_PAYABLE', type: 'CREDIT', currency: 'MXN', amount: '999999.99' }));
  assert.equal((await balance(f)).balanceCents, 299999997);
});

test('mixed currencies, malformed amounts and unsafe aggregate precision fail closed', async () => {
  for (const groups of [[{ type: 'CREDIT', currency: 'USD', _sum: { amount: '1.00' } }],
    [{ type: 'CREDIT', currency: 'MXN', _sum: { amount: '1.005' } }],
    [{ type: 'CREDIT', currency: 'MXN', _sum: { amount: '-1.00' } }],
    [{ type: 'CREDIT', currency: 'MXN', _sum: { amount: '9999999999999999.99' } }]]) {
    const f = setup(); delete f.prisma.$transaction; f.prisma.marketplaceLedgerEntry.groupBy = async () => groups;
    await assert.rejects(balance(f), error => error.statusCode === 503);
  }
  const f = setup(); f.state.restaurant[0].config.currency = 'USD'; await assert.rejects(balance(f), { code: 'UNSUPPORTED_CURRENCY' });
});

test('unscoped, conflicting or duplicated in-memory liability lines never become a fabricated balance', async () => {
  for (const entries of [[{ account: 'COURIER_PAYABLE', type: 'CREDIT', amount: 1 }],
    [{ account: 'COURIER_PAYABLE', type: 'CREDIT', amount: 1, restaurantId: 'r1', beneficiaryId: 'd1', metadata: { driverId: 'd2' } }],
    [1, 2].map(() => ({ id: 'duplicate', account: 'COURIER_PAYABLE', type: 'CREDIT', amount: 1, restaurantId: 'r1', beneficiaryId: 'd1' }))]) {
    const f = setup(); await assert.rejects(balance(f, { ledgerStore: { getAllTransactions: () => [{ currency: 'MXN', entries }] } }), error => error.statusCode === 503);
  }
});

test('history defaults to 50, uses a stable order, projects safe fields and supports a smaller limit', async () => {
  const f = setup(); const rows = await getDriverDeliveryHistory({ driverId: 'd1', restaurantId: 'r1', prismaClient: f.prisma });
  assert.deepEqual(rows.map(row => row.id), ['mp', 'cut', 'cash', 'card']);
  assert.equal(rows.find(row => row.id === 'mp').cashPending, 200.20); assert.equal(rows.find(row => row.id === 'cut').cashPending, 0);
  const serialized = JSON.stringify(rows);
  for (const field of ['PRIVATE', 'customerName', 'customerPhone', 'deliveryAddress', 'pickupPinHash', 'dispatch']) assert.ok(!serialized.includes(field));
  const query = f.calls.find(call => call.model === 'order').args;
  assert.equal(query.take, 50); assert.deepEqual(query.orderBy, [{ updatedAt: 'desc' }, { id: 'desc' }]);
  assert.equal((await getDriverDeliveryHistory({ driverId: 'd1', limit: 1, restaurantId: 'r1', prismaClient: f.prisma })).length, 1);
});

test('trusted global history includes the same shared driver across stores while explicit scope excludes foreign stores', async () => {
  const f = setup(); const global = await getDriverDeliveryHistory({ driverId: 'd1', prismaClient: f.prisma });
  assert.ok(global.some(row => row.restaurantId === 'r2'));
  assert.ok((await getDriverDeliveryHistory({ driverId: 'd1', restaurantId: 'r1', prismaClient: f.prisma })).every(row => row.restaurantId === 'r1'));
});

test('invalid driver IDs and limits reject before any database query', async () => {
  const f = setup();
  for (const limit of [0, -1, 101, 2.5, '50']) await assert.rejects(getDriverDeliveryHistory({ driverId: 'd1', limit, prismaClient: f.prisma }), { code: 'INVALID_LIMIT' });
  await assert.rejects(balance(f, { restaurantId: '' }), { code: 'INVALID_DRIVER_SCOPE' });
  await assert.rejects(balance(f, { driverId: ['d1'] }), { code: 'INVALID_DRIVER_SCOPE' }); assert.equal(f.calls.length, 0);
});

test('real persistent CASH pipeline assignment and ledger settlement are visible without copying driver IDs', async () => {
  const f = fixture(); const courier = { id: 'shared-actual', isActive: true, isShared: true };
  const order = await f.service.createMarketplaceOrder({ ...input({ paymentMethod: 'CASH' }), prismaClient: f.prisma });
  const params = { orderId: order.id, courier, prismaClient: f.prisma };
  await f.service.acceptMarketplaceOffer({ ...params, offerId: order.dispatch.offerId }); f.state.order[0].status = 'READY';
  const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  await f.service.confirmMarketplacePickup({ ...params, pickupPin });
  await f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: order.deliveryPin });
  const result = await getDriverBalance({ driverId: courier.id, restaurantId: 'r1', prismaClient: f.prisma });
  assert.equal(result.balance, 0); assert.equal(result.cashInHand, 28.70); assert.equal(f.state.order[0].deliveryDriverId, null);
  assert.equal((await getDriverDeliveryHistory({ driverId: courier.id, prismaClient: f.prisma })).length, 1);
});

test('a real ONLINE delivery credits the assigned courier its tariff plus full tip through the persisted ledger', async () => {
  const f = fixture(); const courier = { id: 'online-courier', isActive: true, isShared: true };
  const order = await f.service.createMarketplaceOrder({ ...input(), prismaClient: f.prisma });
  f.approved(order.id);
  const paid = await f.service.confirmMarketplacePayment({ orderId: order.id, paymentId: 'pay-1', prismaClient: f.prisma });
  const params = { orderId: order.id, courier, prismaClient: f.prisma };
  await f.service.acceptMarketplaceOffer({ ...params, offerId: paid.dispatch.offerId }); f.state.order[0].status = 'READY';
  const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  await f.service.confirmMarketplacePickup({ ...params, pickupPin });
  await f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: order.deliveryPin });
  const result = await getDriverBalance({ driverId: courier.id, restaurantId: 'r1', prismaClient: f.prisma });
  assert.equal(result.balance, 3); assert.equal(result.totalCreditsCents, 300); assert.equal(result.cashInHand, 0);
  assert.equal((await getDriverBalance({ driverId: 'other', restaurantId: 'r1', prismaClient: f.prisma })).balance, 0);
});

test('history is bounded to 50 by default and sorts by update timestamp before the ID tiebreaker', async () => {
  const f = setup(); const template = f.state.order[0];
  f.state.order = Array.from({ length: 55 }, (_, i) => ({ ...template, id: String(i).padStart(3, '0'),
    updatedAt: new Date(NOW.getTime() + i * 1000) }));
  const rows = await getDriverDeliveryHistory({ driverId: 'd1', restaurantId: 'r1', prismaClient: f.prisma });
  assert.equal(rows.length, 50); assert.equal(rows[0].id, '054'); assert.equal(rows.at(-1).id, '005');
});

test('broken cash pages are rejected without a retry or an infinite cursor loop', async () => {
  const f = setup(); delete f.prisma.$transaction;
  let count = 0;
  f.prisma.order.findMany = async () => { count++; return [{ id: 'foreign', restaurantId: 'r2', cashCollected: false,
    status: 'DELIVERED', paymentMethod: 'CASH', total: 10, restaurant: { config: { currency: 'MXN' } } }]; };
  await assert.rejects(balance(f), { code: 'INVALID_FINANCIAL_DATA' }); assert.equal(count, 1);
});

test('HTTP balance/history require authentication, use no-store and cannot read another driver as a customer', async () => {
  const f = setup(); const request = http(f);
  const result = await request('balance'); assert.equal(result.statusCode, 200); assert.equal(result.body.balance, 18.5);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await request('history', { query: { limit: '1' } })).body.length, 1);
  assert.equal((await request('balance', { user: undefined })).statusCode, 401);
  assert.equal((await request('history', { user: { id: 'd1', role: 'CUSTOMER', isActive: true, restaurantId: 'r1' } })).statusCode, 403);
  assert.equal((await request('balance', { params: { id: 'd2' } })).statusCode, 403);
});

test('staff permissions are tenant bound; drivers can see only their own balance in another store', async () => {
  const f = setup(); const request = http(f);
  const user = { id: 'admin', role: 'ADMIN', isActive: true, restaurantId: 'r1' };
  assert.equal((await request('balance', { user })).body.restaurantId, 'r1');
  assert.equal((await request('balance', { user, query: { restaurantId: 'r2' } })).statusCode, 403);
  const own = await request('balance', { query: { restaurantId: 'r2' } }); assert.equal(own.body.balance, 800);
  assert.equal((await request('balance', { user: { ...user, role: 'CASHIER' } })).statusCode, 403);
  assert.equal((await request('balance', { user: { ...user, role: 'CASHIER', canManageDriverCash: true } })).statusCode, 200);
  assert.equal((await request('balance', { user: { ...user, role: 'SUPER_ADMIN' }, query: { restaurantId: 'r2' } })).statusCode, 200);
});

test('HTTP invalid scope/limit, inactive users and devices fail before financial database access', async () => {
  const f = setup(); const request = http(f, { getPrisma: () => assert.fail('Unauthorized financial read') });
  for (const limit of ['0', '101', '1e1', ['1'], '1.5']) assert.equal((await request('history', { query: { limit } })).statusCode, 400);
  for (const user of [{ id: 'd1', role: 'DELIVERY', isActive: false, restaurantId: 'r1' },
    { id: 'd1', role: 'DELIVERY', isActive: true, isDevice: true, restaurantId: 'r1' }]) assert.equal((await request('balance', { user })).statusCode, 403);
  assert.equal((await request('balance', { query: { restaurantId: ['r2'] } })).statusCode, 400);
});

test('untrusted tenant headers cannot broaden finance queries and database errors produce generic 503 without retries', async () => {
  const f = setup(); const request = http(f);
  const result = await request('balance', { headers: { 'x-restaurant-id': 'r2' }, restaurantId: 'r2' });
  assert.equal(result.body.restaurantId, 'r1');
  let attempts = 0; f.prisma.$transaction = async () => { attempts++; throw new Error('postgres://private:password'); };
  const failed = await request('balance'); assert.equal(failed.statusCode, 503); assert.equal(attempts, 1);
  assert.ok(!JSON.stringify(failed.body).includes('private')); assert.equal(failed.headers['Cache-Control'], 'no-store');
});
