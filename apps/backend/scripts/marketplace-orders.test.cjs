'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixture, input, NOW } = require('./helpers/marketplace-orders-fixture.cjs');
const { createMarketplaceOrdersService } = require('../src/lib/marketplace-orders');
const { createMarketplacePaymentGateway } = require('../src/lib/marketplace-payment-gateway');
const { buildOrderCaptureTransaction, recordLedgerTransaction } = require('../src/lib/marketplace-ledger');
const { cents } = require('../src/lib/marketplace-order-money');
const createRouter = require('../src/routes/marketplace.routes');

// A regression must fail offline rather than accidentally reaching a provider.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };
const courier = { id: 'shared-courier-1', isActive: true, isShared: true };
const create = (f, extra = {}) => f.service.createMarketplaceOrder({ ...input(extra), prismaClient: f.prisma });
async function capture(f, order, id = 'pay-1', extra = {}) {
  f.approved(order.id, id, extra);
  return f.service.confirmMarketplacePayment({ orderId: order.id, paymentId: id, prismaClient: f.prisma });
}
function balance(f) {
  const groups = new Map();
  for (const line of f.state.marketplaceLedgerEntry) {
    const totals = groups.get(line.transactionId) || { DEBIT: 0, CREDIT: 0, lines: 0 };
    totals[line.type] += cents(line.amount); totals.lines++; groups.set(line.transactionId, totals);
  }
  for (const totals of groups.values()) { assert.equal(totals.DEBIT, totals.CREDIT); assert.ok(totals.lines >= 2); }
  return groups.size;
}
function http(f, options = {}) {
  const routes = new Map();
  createRouter({ storeSlugs: 'alpha,beta', Router: () => ({ get: (path, fn) => routes.set(`GET ${path}`, fn),
    post: (path, fn) => routes.set(`POST ${path}`, fn) }), getPrisma: () => f.prisma,
  orderOptions: { pinSecrets: { test: 'offline-fixture-pin-key-with-at-least-32-bytes' }, activePinKeyId: 'test',
    getPaymentGateway: async args => ({ collectorId: args.restaurantId === 'r1' ? '123' : '456',
      createPreference: async () => ({ id: 'http-pref', initPoint: 'https://www.mercadopago.com.mx/checkout/http' }) }) }, ...options });
  return { routes, async request(method, endpoint, req = {}) {
    const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(`${method} ${endpoint}`)({ headers: {}, query: {}, params: {}, ...req }, res); return res;
  } };
}

test('ONLINE persists a pending priced order/payment and invokes real preference builder with server split', async () => {
  const f = fixture(); const result = await create(f);
  assert.equal(result.subtotal, 25.70); assert.equal(result.total, 28.70); assert.equal(result.checkout.status, 'READY');
  assert.equal(result.paymentStatus, 'PENDING'); assert.equal(result.dispatch, null); assert.equal(result.orderNumber, '1');
  assert.equal(f.state.marketplacePayment[0].amount, '28.70'); assert.equal(f.state.marketplacePayment[0].status, 'PENDING');
  assert.equal(f.state.order[0].paymentMethod, 'CARD'); assert.equal(f.state.order[0].source, 'MARKETPLACE');
  assert.equal(f.providerCalls[0].input.marketplaceFee, 1.29); assert.equal(f.providerCalls[0].input.items.length, 3);
  assert.equal(f.state.marketplaceOrderPipeline[0].settlement.merchantPayoutCents, 2441);
  assert.equal(f.state.marketplaceLedgerEntry.length, 0); assert.equal(f.state.orderItem.length, 2);
  assert.match(result.trackingToken, /^[a-f0-9]{64}$/); assert.match(result.deliveryPin, /^\d{6}$/);
});

test('CASH creates shared dispatch immediately without preference, false capture or ledger', async () => {
  const f = fixture(); const result = await create(f, { paymentMethod: 'CASH' });
  assert.equal(result.checkout, null); assert.equal(result.paymentStatus, 'PENDING'); assert.equal(result.dispatch.status, 'OFFERING');
  assert.equal(f.providerCalls.length, 0); assert.equal(f.state.marketplacePayment.length, 0);
  assert.equal(f.state.marketplaceLedgerEntry.length, 0); assert.equal(f.state.order[0].paymentMethod, 'CASH');
  await assert.rejects(f.service.confirmMarketplacePayment({ orderId: result.id, paymentId: 'cash', prismaClient: f.prisma }), { code: 'NOT_ONLINE_PAYMENT' });
});

test('unpublished/empty allowlists reject before touching Prisma and cannot be expanded by input', async () => {
  const service = createMarketplaceOrdersService({ storeSlugs: '' });
  await assert.rejects(service.createMarketplaceOrder(input()), { code: 'STORE_NOT_FOUND' });
  const f = fixture({ storeSlugs: 'alpha' });
  await assert.rejects(create(f, { storeSlug: 'beta', restaurantId: 'r2' }), { code: 'STORE_NOT_FOUND' });
  assert.equal(f.calls.length, 0);
});

test('slug/restaurant identity, tenant webstore/demo flags and location eligibility are enforced', async () => {
  const f = fixture(); await assert.rejects(create(f, { restaurantId: 'r2' }), { code: 'STORE_NOT_FOUND' });
  for (const mutation of [row => { row.isActive = false; }, row => { row.tenant.hasWebStore = false; }, row => { row.tenant.isDemo = true; }]) {
    const f = fixture(); mutation(f.state.restaurant[0]); await assert.rejects(create(f), { code: 'STORE_NOT_FOUND' });
    assert.equal(f.state.order.length, 0);
  }
  const noLocation = fixture(); noLocation.state.location[0].hasDelivery = false;
  await assert.rejects(create(noLocation), { code: 'DELIVERY_UNAVAILABLE' });
});

test('foreign, private, unavailable and cross-category items cannot enter an order', async () => {
  for (const id of ['foreign', 'hidden', 'unknown']) {
    const f = fixture(); await assert.rejects(create(f, { items: [{ menuItemId: id, quantity: 1 }] }), { code: 'INVALID_ITEMS' });
    assert.equal(f.state.order.length, 0);
  }
  for (const mutation of [row => { row.isAvailable = false; }, row => { row.category.isActive = false; }, row => { row.category.restaurantId = 'r2'; }]) {
    const f = fixture(); mutation(f.state.menuItem[0]); await assert.rejects(create(f), { code: 'INVALID_ITEMS' });
  }
});

test('invalid quantities, duplicated lines, spoofed prices, invalid customer/address and money reject before transaction', async () => {
  for (const extra of [{ items: [] }, { items: [{ menuItemId: 'p1', quantity: 0 }] },
    { items: [{ menuItemId: 'p1', quantity: 1, price: 0 }] }, { items: [{ menuItemId: 'p1', quantity: 1.5 }] },
    { items: [{ menuItemId: 'p1', quantity: 1 }, { menuItemId: 'p1', quantity: 2 }] },
    { tip: -1 }, { deliveryFee: '2' }, { tip: 0.001 }, { customer: { name: 'Buyer', phone: 'x' } },
    { deliveryAddress: { address: 'x', lat: 95, lng: 0 } }, { paymentMethod: 'CARD' }]) {
    const f = fixture(); await assert.rejects(create(f, extra)); assert.equal(f.calls.length, 0);
  }
});

test('required variants, weight and modifiers fail rather than undercharging an incomplete configuration', async () => {
  for (const fields of [{ hasVariants: true }, { soldByWeight: true }, { modifierGroups: [{ required: true, minSelection: 0 }] },
    { modifierGroups: [{ required: false, minSelection: 1 }] }]) {
    const f = fixture(); Object.assign(f.state.menuItem[0], fields);
    await assert.rejects(create(f), { code: 'ITEM_OPTIONS_REQUIRED' }); assert.equal(f.state.order.length, 0);
  }
});

test('closed shop, minimum order and tampered delivery fee fail with no committed order', async () => {
  for (const [config, extra, code] of [[{ isOpen: false }, {}, 'STORE_CLOSED'], [{ minOrderAmount: 100 }, {}, 'MINIMUM_ORDER'],
    [{}, { deliveryFee: 0 }, 'DELIVERY_FEE_CHANGED'], [{ deliveryMode: 'DISTANCE' }, {}, 'DELIVERY_COORDINATES_REQUIRED']]) {
    const f = fixture(); Object.assign(f.state.restaurant[0].config, config);
    await assert.rejects(create(f, extra), { code }); assert.equal(f.state.order.length, 0);
  }
});

test('server promos, free shipping, integer-cent totals and half-up commissions are authoritative', async () => {
  const f = fixture(); Object.assign(f.state.menuItem[0], { isPromo: true, promoPrice: 0.30 });
  f.state.restaurant[0].config.freeDeliveryFrom = 0.30;
  const order = await create(f, { items: [{ menuItemId: 'p1', quantity: 1 }], deliveryFee: 0, tip: 0 });
  assert.equal(order.total, 0.30); assert.equal(f.providerCalls[0].input.marketplaceFee, 0.02);
  assert.equal(f.state.marketplaceOrderPipeline[0].settlement.merchantPayoutCents, 28);
});

test('same idempotency key returns the same order/token/PIN; changed payload conflicts', async () => {
  const f = fixture(); const a = await create(f); const b = await create(f);
  assert.equal(a.id, b.id); assert.equal(a.trackingToken, b.trackingToken); assert.equal(a.deliveryPin, b.deliveryPin);
  assert.equal(f.state.order.length, 1); assert.equal(f.state.marketplacePayment.length, 1); assert.equal(f.providerCalls.length, 1);
  await assert.rejects(create(f, { tip: 2 }), { code: 'IDEMPOTENCY_CONFLICT' });
});

test('preference timeout retains a recoverable pending order and retry uses the same provider idempotency key', async () => {
  const f = fixture(); f.hooks.preference = () => { throw new Error('private provider secret'); };
  await assert.rejects(create(f), error => {
    assert.equal(error.code, 'PAYMENT_UNAVAILABLE'); assert.ok(error.recovery.orderId); assert.ok(error.recovery.trackingToken);
    assert.ok(!error.message.includes('private')); return true;
  });
  assert.equal(f.state.order.length, 1); assert.equal(f.state.marketplacePayment[0].status, 'PENDING');
  delete f.hooks.preference; const result = await create(f);
  assert.equal(result.id, f.state.order[0].id); assert.equal(f.state.order.length, 1);
  assert.equal(f.providerCalls[0].input.idempotencyKey, f.providerCalls[1].input.idempotencyKey);
});

test('approved payment atomically captures, balances ledger and creates a PIN-protected offer', async () => {
  const f = fixture(); const order = await create(f); const result = await capture(f, order);
  assert.equal(result.paymentStatus, 'PAID'); assert.equal(result.status, 'PENDING'); assert.equal(result.dispatch.status, 'OFFERING');
  assert.equal(result.idempotent, false); assert.equal(balance(f), 1); assert.equal(f.state.marketplaceLedgerEntry.length, 2);
  const lines = f.state.marketplaceLedgerEntry;
  assert.deepEqual(lines.map(line => [line.account, line.type, line.amount]),
    [['CUSTOMER_RECEIVABLE', 'DEBIT', '28.70'], ['GATEWAY_ESCROW', 'CREDIT', '28.70']]);
  assert.ok(lines.every(line => line.restaurantId === 'r1' && line.orderId === order.id));
  const dispatch = f.state.marketplaceOrderPipeline[0].dispatch;
  assert.match(dispatch.task.pickupPinHash, /^[a-f0-9]{64}$/); assert.match(dispatch.task.deliveryPinHash, /^[a-f0-9]{64}$/);
  assert.equal(dispatch.offer.payoutAmount, 3); assert.equal(dispatch.offer.courierId, null);
  assert.ok(!JSON.stringify(f.state).includes(order.trackingToken));
  assert.equal(dispatch.task.deliveryPin, undefined); assert.equal(dispatch.task.pickupPin, undefined);
});

test('verification rejects wrong status, amount, currency, external reference, merchant and fee without side effects', async () => {
  for (const fields of [{ status: 'pending' }, { amountCents: 1 }, { currency: 'USD' }, { orderId: 'other-order' },
    { collectorId: '456' }, { marketplaceFeeCents: 0 }, { id: 'other-payment' }]) {
    const f = fixture(); const order = await create(f);
    await assert.rejects(capture(f, order, 'pay-1', fields), { code: 'PAYMENT_NOT_VERIFIED' });
    assert.equal(f.state.order[0].paymentStatus, 'PENDING'); assert.equal(f.state.marketplaceLedgerEntry.length, 0);
    assert.equal(f.state.marketplaceOrderPipeline[0].dispatch, null);
  }
});

test('duplicate/concurrent payment notifications create exactly one ledger event and one offer', async () => {
  const f = fixture(); const order = await create(f); f.approved(order.id);
  const results = await Promise.all([1, 2].map(() => f.service.confirmMarketplacePayment({ orderId: order.id, paymentId: 'pay-1', prismaClient: f.prisma })));
  assert.deepEqual(results.map(row => row.idempotent).sort(), [false, true]); assert.equal(balance(f), 1);
  assert.equal(results[0].dispatch.offerId, results[1].dispatch.offerId);
  await assert.rejects(capture(f, order, 'pay-2'), { code: 'PAYMENT_CONFLICT' });
});

test('unique provider payment binding prevents reuse across two orders and rolls back the second', async () => {
  const f = fixture(); const a = await create(f); await capture(f, a);
  const b = await create(f, { idempotencyKey: 'offline-idempotency-key-00000000002' });
  await assert.rejects(capture(f, b), { code: 'P2002' });
  assert.equal(f.state.order[1].paymentStatus, 'PENDING'); assert.equal(f.state.marketplacePayment[1].status, 'PENDING'); assert.equal(balance(f), 1);
});

test('ledger or dispatch write failure rolls back payment capture, order state and all lines', async () => {
  for (const target of ['marketplaceLedgerEntry', 'marketplaceOrderPipeline']) {
    const f = fixture(); const order = await create(f);
    f.hooks.beforeWrite = (model, method) => { if (model === target && (method === 'createMany' || method === 'updateMany')) throw new Error('write failed'); };
    await assert.rejects(capture(f, order), /write failed/);
    assert.equal(f.state.order[0].paymentStatus, 'PENDING'); assert.equal(f.state.marketplacePayment[0].status, 'PENDING');
    assert.equal(f.state.marketplaceLedgerEntry.length, 0); assert.equal(f.state.marketplaceOrderPipeline[0].dispatch, null);
  }
});

test('cancelled orders cannot capture a verified payment', async () => {
  const f = fixture(); const order = await create(f); f.state.order[0].status = 'CANCELLED';
  await assert.rejects(capture(f, order), { code: 'ORDER_NOT_PAYABLE' }); assert.equal(f.state.marketplaceLedgerEntry.length, 0);
});

test('public status requires the exact unexpired capability and projects no PII, pickup PIN, hashes or GPS', async () => {
  const f = fixture(); const order = await create(f); await capture(f, order);
  const status = await f.service.getMarketplaceOrderStatus({ orderId: order.id, trackingToken: order.trackingToken, prismaClient: f.prisma });
  assert.equal(status.deliveryPin, order.deliveryPin); assert.equal(status.paymentStatus, 'PAID');
  const serialized = JSON.stringify(status);
  for (const field of ['customer', 'Direccion', '5555555555', 'Hash', 'pickupPin', 'collectorId', 'accessToken', 'courierId', 'lat', 'lng']) assert.ok(!serialized.includes(field), field);
  for (const token of [undefined, 'a'.repeat(64)]) await assert.rejects(f.service.getMarketplaceOrderStatus({ orderId: order.id, trackingToken: token, prismaClient: f.prisma }), { code: 'ORDER_NOT_FOUND' });
  f.setDate(new Date(NOW.getTime() + 14 * 86400000));
  await assert.rejects(f.service.getMarketplaceOrderStatus({ orderId: order.id, trackingToken: order.trackingToken, prismaClient: f.prisma }), { code: 'ORDER_NOT_FOUND' });
});

test('merchant pickup PIN lookup is internally scoped to the resolved restaurant', async () => {
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const result = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  assert.match(result.pickupPin, /^\d{6}$/);
  await assert.rejects(f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r2', prismaClient: f.prisma }), { code: 'ORDER_NOT_FOUND' });
});

test('full persisted acceptance/pickup/delivery PIN flow settles only on delivery with balanced payables', async () => {
  const f = fixture(); const order = await create(f); const paid = await capture(f, order);
  const params = { orderId: order.id, courier, prismaClient: f.prisma };
  const accepted = await f.service.acceptMarketplaceOffer({ ...params, offerId: paid.dispatch.offerId });
  assert.equal(accepted.status, 'PENDING'); assert.equal(accepted.dispatch.status, 'ASSIGNED');
  const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  await assert.rejects(f.service.confirmMarketplacePickup({ ...params, pickupPin: 'bad' }), { code: 'INVALID_PIN' });
  await assert.rejects(f.service.confirmMarketplacePickup({ ...params, pickupPin }), { code: 'ORDER_NOT_READY' });
  f.state.order[0].status = 'READY';
  const picked = await f.service.confirmMarketplacePickup({ ...params, pickupPin });
  assert.equal(picked.status, 'ON_THE_WAY'); assert.equal(balance(f), 1);
  await assert.rejects(f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: 'bad' }), { code: 'INVALID_PIN' });
  const delivered = await f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: order.deliveryPin });
  assert.equal(delivered.status, 'DELIVERED'); assert.equal(delivered.dispatch.status, 'DELIVERED'); assert.equal(balance(f), 2);
  const settlement = f.state.marketplaceLedgerEntry.filter(line => line.eventType === 'ORDER_SETTLED');
  assert.equal(settlement.find(line => line.account === 'MERCHANT_PAYABLE').beneficiaryId, 'r1');
  assert.equal(settlement.find(line => line.account === 'COURIER_PAYABLE').beneficiaryId, courier.id);
  assert.equal(settlement.find(line => line.account === 'COURIER_PAYABLE').amount, '3.00');
  assert.equal(settlement.find(line => line.account === 'PLATFORM_FEES').amount, '1.29');
  const count = f.state.marketplaceLedgerEntry.length;
  await f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: order.deliveryPin });
  assert.equal(f.state.marketplaceLedgerEntry.length, count);
});

test('competing couriers accept atomically; a foreign courier cannot verify pickup', async () => {
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const params = { orderId: order.id, offerId: order.dispatch.offerId, prismaClient: f.prisma };
  const results = await Promise.allSettled([courier, { ...courier, id: 'other' }].map(identity => f.service.acceptMarketplaceOffer({ ...params, courier: identity })));
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'OFFER_ALREADY_CLAIMED');
  await assert.rejects(f.service.confirmMarketplacePickup({ orderId: order.id, courier: { ...courier, id: 'other' }, pickupPin: '123456', prismaClient: f.prisma }), { code: 'COURIER_FORBIDDEN' });
});

test('expired offers and inactive/nonshared couriers cannot accept', async () => {
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const params = { orderId: order.id, offerId: order.dispatch.offerId, prismaClient: f.prisma };
  for (const identity of [{ ...courier, isActive: false }, { ...courier, isShared: false }]) await assert.rejects(f.service.acceptMarketplaceOffer({ ...params, courier: identity }), { code: 'COURIER_FORBIDDEN' });
  f.setDate(new Date(NOW.getTime() + 30000));
  await assert.rejects(f.service.acceptMarketplaceOffer({ ...params, courier }), { code: 'OFFER_EXPIRED' });
  assert.equal(f.state.marketplaceOrderPipeline[0].dispatch.task.status, 'OFFERING');
});

test('CASH delivery remains pending collection and does not invent gateway capture or payout entries', async () => {
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const params = { orderId: order.id, courier, prismaClient: f.prisma };
  await f.service.acceptMarketplaceOffer({ ...params, offerId: order.dispatch.offerId });
  const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  f.state.order[0].status = 'READY'; await f.service.confirmMarketplacePickup({ ...params, pickupPin });
  const result = await f.service.confirmMarketplaceDelivery({ ...params, deliveryPin: order.deliveryPin });
  assert.equal(result.status, 'DELIVERED'); assert.equal(result.paymentStatus, 'PENDING'); assert.equal(f.state.marketplaceLedgerEntry.length, 0);
});

test('ledger persistence rejects an incomplete duplicate instead of silently inserting missing lines', async () => {
  const f = fixture(); const order = await create(f); await capture(f, order); f.state.marketplaceLedgerEntry.pop();
  await assert.rejects(capture(f, order), { code: 'LEDGER_INTEGRITY_ERROR' }); assert.equal(f.state.marketplaceLedgerEntry.length, 1);
});

test('ledger persistence rejects forged/unbalanced transactions before touching persistence', async () => {
  const f = fixture(); const transaction = buildOrderCaptureTransaction({ orderId: 'fake', referenceId: 'pay', amount: 1 });
  await assert.rejects(recordLedgerTransaction({ transaction: { ...transaction, entries: transaction.entries.map((line, i) => ({ ...line, amount: i ? 2 : 1 })) },
    paymentId: 'fake', restaurantId: 'r1', idempotencyKey: 'capture', prismaClient: f.prisma }), { code: 'LEDGER_INTEGRITY_ERROR' });
  assert.equal(f.calls.length, 0);
});

test('a disappeared capture event is an integrity failure on replay, not an implicit repair', async () => {
  const f = fixture(); const order = await create(f); await capture(f, order); f.state.marketplaceLedgerEntry = [];
  await assert.rejects(capture(f, order), { code: 'PAYMENT_INTEGRITY_ERROR' });
  assert.equal(f.state.marketplaceLedgerEntry.length, 0);
});

test('confirmation rechecks the locked financial snapshot after provider verification', async () => {
  const f = fixture(); const order = await create(f);
  f.hooks.verification = () => {
    const s = f.state.marketplaceOrderPipeline[0].settlement;
    s.tipCents++; s.totalCents++; s.courierPayoutCents++;
    f.state.order[0].tip = s.tipCents / 100; f.state.order[0].total = s.totalCents / 100;
  };
  await assert.rejects(capture(f, order), { code: 'PAYMENT_NOT_VERIFIED' });
  assert.equal(f.state.marketplacePayment[0].status, 'PENDING'); assert.equal(f.state.marketplaceLedgerEntry.length, 0);
});

test('renewing an expired unclaimed offer retains its task and PINs and invalidates its old offer ID', async () => {
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const args = { orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma };
  assert.equal((await f.service.refreshMarketplaceOffer(args)).dispatch.offerId, order.dispatch.offerId);
  f.setDate(new Date(NOW.getTime() + 30000));
  const next = await f.service.refreshMarketplaceOffer(args);
  assert.equal(next.dispatch.taskId, order.dispatch.taskId); assert.notEqual(next.dispatch.offerId, order.dispatch.offerId);
  await assert.rejects(f.service.acceptMarketplaceOffer({ ...args, courier, offerId: order.dispatch.offerId }), { code: 'OFFER_NOT_FOUND' });
  await f.service.acceptMarketplaceOffer({ ...args, courier, offerId: next.dispatch.offerId });
  await assert.rejects(f.service.refreshMarketplaceOffer(args), { code: 'OFFER_NOT_RENEWABLE' });
});

test('full commission and zero commission settlements contain only positive, balanced ledger lines', async () => {
  for (const rate of [0, 1]) {
    const f = fixture(); const config = JSON.parse(f.state.integrationConfig[0].config); config.marketplaceCommissionRate = rate;
    f.state.integrationConfig[0].config = JSON.stringify(config);
    const order = await create(f, { deliveryFee: 2, tip: 0 }); const paid = await capture(f, order);
    const args = { orderId: order.id, courier, prismaClient: f.prisma };
    await f.service.acceptMarketplaceOffer({ ...args, offerId: paid.dispatch.offerId }); f.state.order[0].status = 'READY';
    const { pickupPin } = await f.service.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
    await f.service.confirmMarketplacePickup({ ...args, pickupPin });
    await f.service.confirmMarketplaceDelivery({ ...args, deliveryPin: order.deliveryPin });
    assert.equal(balance(f), 2); assert.ok(f.state.marketplaceLedgerEntry.every(line => cents(line.amount) > 0));
  }
});

test('missing PIN configuration rolls creation back, and rotated keyrings can still verify old orders', async () => {
  const missing = fixture({ pinSecrets: {} });
  await assert.rejects(create(missing), { code: 'PIN_KEY_UNAVAILABLE' }); assert.equal(missing.state.order.length, 0);
  const f = fixture(); const order = await create(f, { paymentMethod: 'CASH' });
  const rotated = createMarketplaceOrdersService({ storeSlugs: 'alpha', activePinKeyId: 'new',
    pinSecrets: { test: 'offline-fixture-pin-key-with-at-least-32-bytes', new: 'another-offline-pin-secret-key-over-32-bytes' } });
  const status = await rotated.getMarketplaceOrderStatus({ orderId: order.id, trackingToken: order.trackingToken, prismaClient: f.prisma });
  assert.equal(status.deliveryPin, order.deliveryPin);
  const merchant = await rotated.getMarketplacePickupPin({ orderId: order.id, restaurantId: 'r1', prismaClient: f.prisma });
  assert.notEqual(merchant.pickupPin, order.deliveryPin);
});

test('HTTP routes return creation/status with no-store and require idempotency and status capability', async () => {
  const f = fixture(); const router = http(f); const { idempotencyKey, ...body } = input({ paymentMethod: 'CASH' });
  const created = await router.request('POST', '/orders', { body, headers: { 'idempotency-key': idempotencyKey } });
  assert.equal(created.statusCode, 201); assert.equal(created.headers['Cache-Control'], 'no-store');
  const status = await router.request('GET', '/orders/:id/status', { params: { id: created.body.id }, headers: { 'x-marketplace-order-token': created.body.trackingToken } });
  assert.equal(status.statusCode, 200); assert.equal(status.headers['Cache-Control'], 'no-store');
  assert.equal((await router.request('POST', '/orders', { body })).statusCode, 400);
  assert.equal((await router.request('GET', '/orders/:id/status', { params: { id: created.body.id } })).statusCode, 404);
  assert.ok(![...router.routes.keys()].some(route => /confirm|payment/.test(route)));
});

test('HTTP empty allowlist, missing token and caller finance fields never load the database', async () => {
  const router = http(fixture(), { storeSlugs: '', getPrisma: () => assert.fail('Database must stay unloaded') });
  const { idempotencyKey, ...body } = input();
  assert.equal((await router.request('POST', '/orders', { body, headers: { 'idempotency-key': idempotencyKey } })).statusCode, 404);
  assert.equal((await router.request('GET', '/orders/:id/status')).statusCode, 404);
  assert.equal((await router.request('POST', '/orders', { body: { ...body, collectorId: 'attacker' }, headers: { 'idempotency-key': idempotencyKey } })).statusCode, 400);
});

test('HTTP failures are generic 503/409 and do not leak database/provider details', async () => {
  const { idempotencyKey, ...body } = input({ paymentMethod: 'CASH' });
  for (const [error, status] of [[new Error('postgres://private:secret'), 503], [Object.assign(new Error('private db conflict'), { code: 'P2034' }), 409]]) {
    const f = fixture(); f.prisma.$transaction = async () => { throw error; };
    const result = await http(f).request('POST', '/orders', { body, headers: { 'idempotency-key': idempotencyKey } });
    assert.equal(result.statusCode, status); assert.ok(!JSON.stringify(result.body).includes('private'));
  }
});

test('gateway sends merchant split and verifies authoritative provider response using injected fetch only', async () => {
  const f = fixture(); const requests = [];
  const gateway = await createMarketplacePaymentGateway({ prismaClient: f.prisma, restaurantId: 'r1', env: { MARKETPLACE_PAYMENT_NETWORK_ENABLED: 'true' },
    request: async (url, options) => {
      requests.push({ url, options }); return { ok: true, json: async () => url.endsWith('/checkout/preferences')
        ? { id: 'pref', sandbox_init_point: 'https://sandbox.mercadopago.com.mx/checkout/pref' }
        : { id: 'pay', status: 'approved', external_reference: 'order', collector_id: 123, transaction_amount: 10,
          currency_id: 'MXN', fee_details: [{ type: 'application_fee', amount: 0.50 }] } };
    } });
  const pref = await gateway.createPreference({ orderId: 'order', items: [], marketplaceFee: 0.50, idempotencyKey: 'stable-key' });
  assert.equal(pref.id, 'pref'); const payload = JSON.parse(requests[0].options.body);
  assert.equal(payload.marketplace_fee, 0.50); assert.equal(payload.external_reference, 'order');
  assert.equal(requests[0].options.headers['X-Idempotency-Key'], 'stable-key'); assert.equal(requests[0].options.redirect, 'error');
  const payment = await gateway.getPayment('pay'); assert.equal(payment.amountCents, 1000); assert.equal(payment.marketplaceFeeCents, 50);
});

test('gateway fails closed without explicit network enablement and in isolated mode', async () => {
  for (const env of [{}, { MARKETPLACE_PAYMENT_NETWORK_ENABLED: 'true', MARKETPLACE_ISOLATED: 'true' }]) {
    const f = fixture(); let count = 0;
    const gateway = await createMarketplacePaymentGateway({ prismaClient: f.prisma, restaurantId: 'r1', env, request: async () => { count++; assert.fail('Network attempted'); } });
    await assert.rejects(gateway.getPayment('pay'), { code: 'PAYMENT_NETWORK_DISABLED' }); assert.equal(count, 0);
  }
});

test('both schemas are byte-identical and all persisted pipeline/finance models are tenant-scoped', () => {
  const root = path.resolve(__dirname, '../../..');
  assert.ok(fs.readFileSync(path.join(root, 'packages/database/prisma/schema.prisma')).equals(fs.readFileSync(path.join(root, 'apps/backend/prisma/schema.prisma'))));
  const { SCOPED_MODELS } = require('../../../packages/database/tenant-guard');
  for (const name of ['MarketplacePayment', 'MarketplaceLedgerEntry', 'MarketplaceOrderPipeline']) assert.ok(SCOPED_MODELS.has(name));
});
