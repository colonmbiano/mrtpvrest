'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Fail loudly if any future change initializes the application, DB or network.
const forbidden = () => { throw new Error('Offline suite: network/application access forbidden'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
for (const name of ['node:http', 'node:https']) {
  require(name).request = forbidden; require(name).get = forbidden;
}
require('node:tls').connect = forbidden;
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};

const { fixture, admin, driver, NOW } = require('./helpers/marketplace-dispatch-fixture.cjs');
const { validateDeliveryPolicy, evaluateFallback, atomicAcceptOffer, hashPin, confirmPickup } = require('../src/lib/marketplace-dispatch');
const code = expected => error => error.code === expected;
const config = { deliveryPolicy: 'OWN_THEN_SHARED', fallbackSeconds: 45, maxDistanceKm: 5 };
const active = f => f.offers().filter(offer => offer.status === 'OFFERED');
const snapshot = f => JSON.stringify(f.store, (key, value) => value instanceof Map ? [...value] : value);

test('offline guards reject network and database initialization', () => {
  assert.throws(() => fetch('https://example.invalid'), /Offline suite/);
  assert.throws(() => require('@mrtpvrest/database'), /Offline suite/);
  assert.throws(() => require('node:net').connect(1, '127.0.0.1'), /Offline suite/);
});

test('OWN_ONLY offers exclusively to this merchant and never switches automatically', () => {
  const f = fixture('OWN_ONLY'); f.start();
  assert.equal(f.task.dispatchMode, 'OWN');
  assert.deepEqual(active(f).map(offer => offer.courierId).sort(), ['dual', 'own']);
  f.advance(600000); f.engine.tick();
  assert.equal(f.task.dispatchMode, 'OWN'); assert.equal(f.offers('SHARED').length, 0);
  assert.equal(f.order.status, 'READY');
});

test('SHARED_ONLY uses opted-in platform couriers, including a dual-affiliated courier', () => {
  const f = fixture('SHARED_ONLY'); f.start();
  assert.equal(f.task.dispatchMode, 'SHARED');
  assert.deepEqual(active(f).map(offer => offer.courierId).sort(), ['dual', 'shared']);
  f.accept('dual');
  assert.equal(f.task.currentAssignment.source, 'SHARED');
  assert.equal(f.task.currentAssignment.affiliationId, null);
  assert.equal(f.order.status, 'READY');
});

test('OWN_THEN_SHARED starts its window when offering begins, not when an order was created', () => {
  const f = fixture(); f.start();
  assert.equal(f.task.offeringStartedAt, NOW.toISOString()); assert.equal(f.task.dispatchMode, 'OWN');
  f.advance(29999); f.engine.tick(); assert.equal(f.task.dispatchMode, 'OWN');
  f.advance(1); f.engine.tick(); assert.equal(f.task.dispatchMode, 'SHARED');
  assert.equal(f.offers('OWN').every(offer => offer.status === 'EXPIRED'), true);
  assert.deepEqual(active(f).map(offer => offer.courierId).sort(), ['dual', 'shared']);
  assert.equal(f.task.version, 2); assert.equal(f.order.status, 'READY');
});

test('declined/expired own offers and an empty own pool do not shorten fallbackSeconds', () => {
  for (const empty of [false, true]) {
    const f = fixture(); if (empty) f.store.affiliations.clear(); f.start();
    for (const offer of f.offers()) offer.status = 'DECLINED';
    f.advance(10000); f.engine.tick(); assert.equal(f.task.dispatchMode, 'OWN');
    f.advance(20000); f.engine.tick(); assert.equal(f.task.dispatchMode, 'SHARED');
  }
});

test('fallbackSeconds zero starts directly in SHARED without zero-lived own offers', () => {
  const f = fixture('OWN_THEN_SHARED', { fallbackSeconds: 0 }); f.start();
  assert.equal(f.task.dispatchMode, 'SHARED'); assert.equal(f.offers('OWN').length, 0);
});

test('fallback windows longer than an offer TTL renew own offers without resetting the deadline', () => {
  const f = fixture('OWN_THEN_SHARED', { fallbackSeconds: 65 }); f.start();
  const start = f.task.offeringStartedAt;
  f.advance(30000); f.engine.tick();
  assert.equal(f.task.dispatchMode, 'OWN'); assert.equal(active(f).length, 2);
  f.advance(30000); f.engine.tick();
  assert.equal(f.task.offeringStartedAt, start);
  assert.equal(active(f).every(offer => new Date(offer.expiresAt).getTime() === NOW.getTime() + 65000), true);
  f.advance(5000); f.engine.tick(); assert.equal(f.task.dispatchMode, 'SHARED');
});

test('accept just before timeout wins and prevents later automatic fallback', () => {
  const f = fixture(); f.start(); f.advance(29999);
  f.accept('own'); f.advance(60000); f.engine.tick();
  assert.equal(f.task.status, 'ASSIGNED'); assert.equal(f.task.dispatchMode, 'OWN');
  assert.equal(f.task.currentAssignment.courierId, 'own');
});

test('accept at the timeout performs fallback first and rejects a stale own offer with 409', () => {
  const f = fixture(); f.start(); const offer = active(f)[0]; f.advance(30000);
  assert.throws(() => f.engine.acceptOffer({ offerId: offer.id, courierId: offer.courierId }), code('OFFER_ALREADY_CLAIMED'));
  assert.equal(f.task.dispatchMode, 'SHARED'); assert.equal(f.store.assignments.size, 0);
  f.accept('shared'); assert.equal(f.task.currentAssignment.source, 'SHARED');
});

test('MANUAL remains waiting without offers until an operator chooses own delivery', () => {
  const f = fixture('MANUAL'); f.start(); f.advance(3600000); f.engine.tick();
  assert.equal(f.task.status, 'WAITING_READY'); assert.equal(f.task.dispatchMode, null);
  assert.equal(f.offers().length, 0);
  // Restore fresh presence; the hour-old signal must not be used.
  f.store.couriers.get('own').presence.lastSeenAt = new Date(NOW.getTime() + 3600000);
  f.engine.assignOwn({ taskId: 't1', courierId: 'own' });
  f.engine.tick(); // Polling must preserve the operator's selected courier.
  assert.deepEqual(active(f).map(offer => offer.courierId), ['own']);
  f.accept('own'); assert.equal(f.task.status, 'ASSIGNED');
});

test('MANUAL operator may choose SHARED before dispatch has started', () => {
  const f = fixture('MANUAL');
  f.engine.requestShared({ taskId: 't1' });
  assert.equal(f.task.status, 'OFFERING'); assert.equal(f.task.dispatchMode, 'SHARED');
  assert.equal(active(f).length, 2);
});

test('own assignment refuses foreign affiliation and SHARED_ONLY policy without side effects', () => {
  for (const [policy, courierId] of [['MANUAL', 'foreign'], ['SHARED_ONLY', 'own']]) {
    const f = fixture(policy); const before = snapshot(f);
    assert.throws(() => f.engine.assignOwn({ taskId: 't1', courierId }), code('COURIER_FORBIDDEN'));
    assert.equal(snapshot(f), before);
  }
});

for (const policy of ['OWN_ONLY', 'OWN_THEN_SHARED', 'MANUAL', 'SHARED_ONLY']) {
  test(`authorized request-shared overrides ${policy} before pickup and is idempotent`, () => {
    const f = fixture(policy); f.start();
    const oldOffers = f.offers('OWN');
    f.engine.requestShared({ taskId: 't1' });
    const before = snapshot(f);
    const result = f.engine.requestShared({ taskId: 't1' });
    assert.equal(result.idempotent, true); assert.equal(snapshot(f), before);
    assert.equal(f.task.dispatchMode, 'SHARED'); assert.equal(f.order.status, 'READY');
    assert.equal(oldOffers.every(offer => offer.status === 'EXPIRED'), true);
  });
}

test('forced switch cancels the old active assignment, retains history and payout, and revokes old pickup', () => {
  const f = fixture('OWN_ONLY'); f.start(); const first = f.accept('own').assignment;
  f.engine.requestShared({ taskId: 't1', expectedVersion: f.task.version });
  assert.equal(first.status, 'CANCELLED'); assert.equal(first.endReason, 'REQUEST_SHARED');
  assert.equal(f.store.assignments.get(first.id), first); assert.equal(f.task.currentAssignmentId, null);
  assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' }), code('COURIER_FORBIDDEN'));
  const second = f.accept('shared').assignment;
  assert.notEqual(first.id, second.id); assert.equal(second.payoutAmount, first.payoutAmount);
  assert.equal(f.store.assignments.size, 2);
});

for (const status of ['PICKED_UP', 'DELIVERED', 'CANCELLED', 'FAILED']) {
  test(`request-shared cannot reopen ${status}`, () => {
    const f = fixture('OWN_ONLY'); f.start(); f.task.status = status;
    const before = snapshot(f);
    assert.throws(() => f.engine.requestShared({ taskId: 't1' }), code('OFFER_ALREADY_CLAIMED'));
    assert.equal(snapshot(f), before);
  });
}

test('a recorded pickup prevents switching even if the task status is inconsistent', () => {
  const f = fixture(); f.start(); f.task.pickedUpAt = NOW.toISOString();
  assert.throws(() => f.engine.requestShared({ taskId: 't1' }), code('OFFER_ALREADY_CLAIMED'));
});

test('CAS: a simultaneous wave of 40 claims creates exactly one active assignment', async () => {
  const f = fixture('SHARED_ONLY'); f.start();
  const offers = active(f);
  const results = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => Promise.resolve().then(() => {
    const offer = offers[index % offers.length];
    return f.engine.acceptOffer({ offerId: offer.id, courierId: offer.courierId });
  })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected' && result.reason.statusCode === 409).length, 39);
  assert.equal(f.store.assignments.size, 1); assert.equal(f.order.status, 'READY');
  assert.equal(f.offers().filter(offer => offer.status === 'ACCEPTED').length, 1);
});

test('CAS: stale expectedVersion blocks forced switch, own selection and pickup without writes', () => {
  const f = fixture(); f.start();
  for (const operation of ['requestShared', 'assignOwn']) {
    const before = snapshot(f);
    assert.throws(() => f.engine[operation]({ taskId: 't1', courierId: 'own', expectedVersion: 0 }), code('OFFER_ALREADY_CLAIMED'));
    assert.equal(snapshot(f), before);
  }
  f.accept('own'); const before = snapshot(f);
  assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234', expectedVersion: 1 }), code('OFFER_ALREADY_CLAIMED'));
  assert.equal(snapshot(f), before);
});

test('CAS: an old offer version never wins after a mode change', () => {
  const f = fixture(); f.start(); const offer = active(f)[0];
  f.engine.requestShared({ taskId: 't1' }); offer.status = 'OFFERED'; // Simulate a delayed stale write.
  assert.throws(() => f.engine.acceptOffer({ offerId: offer.id, courierId: offer.courierId }), code('OFFER_ALREADY_CLAIMED'));
  assert.equal(f.store.assignments.size, 0);
});

test('MANUAL cannot restart its waiting window and OWN_THEN_SHARED cannot select own after the deadline', () => {
  const manual = fixture('MANUAL'); manual.start();
  assert.throws(manual.start, code('OFFER_ALREADY_CLAIMED'));
  const f = fixture(); f.start(); f.advance(30000);
  const before = snapshot(f);
  assert.throws(() => f.engine.assignOwn({ taskId: 't1', courierId: 'own' }), code('OFFER_ALREADY_CLAIMED'));
  assert.equal(snapshot(f), before);
});

test('active assignment records cannot be bypassed by a stale task snapshot', () => {
  const f = fixture('OWN_ONLY'); f.start();
  f.store.assignments.set('previous', { id: 'previous', taskId: 't1', courierId: 'foreign', status: 'ACTIVE' });
  assert.throws(() => f.accept('own'), code('OFFER_ALREADY_CLAIMED'));
  assert.equal(f.store.assignments.size, 1);
});

test('acceptance rejects an offer with mismatched merchant scope or affiliation contract', () => {
  for (const field of ['merchantId', 'restaurantId', 'affiliationId']) {
    const f = fixture('OWN_ONLY'); f.start();
    const offer = active(f).find(row => row.courierId === 'own'); offer[field] = 'foreign';
    assert.throws(() => f.accept('own'), code('COURIER_FORBIDDEN'));
    assert.equal(f.store.assignments.size, 0);
  }
});

test('CAS: primitive rejects a mismatched task and an existing active assignment', () => {
  for (const task of [{ id: 't1', status: 'OFFERING' }, { id: 'other', status: 'OFFERING', currentAssignmentId: 'a1' }]) {
    const offer = { taskId: 'other', status: 'OFFERED', courierId: 'own', expiresAt: new Date(NOW.getTime() + 30000) };
    assert.throws(() => atomicAcceptOffer({ task, offer, courierId: 'own', now: NOW }), code('OFFER_ALREADY_CLAIMED'));
    assert.equal(task.status, 'OFFERING');
  }
});

test('courier isolation uses exact merchant affiliation, never isAffiliated or another branch', () => {
  const f = fixture('OWN_ONLY');
  f.store.couriers.get('foreign').isAffiliated = true;
  f.store.couriers.get('shared').isAffiliated = true;
  f.start();
  assert.deepEqual(active(f).map(offer => offer.courierId).sort(), ['dual', 'own']);
  f.addTask('other', 'branch'); f.engine.startDispatch({ taskId: 'other' });
  assert.deepEqual(f.offers().filter(offer => offer.taskId === 'other').map(offer => offer.courierId), ['branch-own']);
});

for (const mutate of [row => { row.status = 'SUSPENDED'; }, row => { row.canTakeOwnOrders = false; },
  row => { row.restaurantId = 'r2'; }, row => { row.locationId = 'l3'; }]) {
  test(`invalid affiliation is excluded (${mutate.toString()})`, () => {
    const f = fixture('OWN_ONLY'); mutate(f.store.affiliations.get('own')); f.start();
    assert.equal(active(f).some(offer => offer.courierId === 'own'), false);
  });
}

test('affiliation revocation after offering prevents acceptance', () => {
  const f = fixture('OWN_ONLY'); f.start(); f.store.affiliations.get('own').status = 'SUSPENDED';
  assert.throws(() => f.accept('own'), code('COURIER_FORBIDDEN'));
  assert.equal(f.task.status, 'OFFERING'); assert.equal(f.store.assignments.size, 0);
});

for (const mutate of [c => { c.isOnline = false; }, c => { c.isActive = false; },
  c => { c.presence.lastSeenAt = new Date(NOW.getTime() - 90001); },
  c => { c.presence.lastSeenAt = new Date(NOW.getTime() + 1000); },
  c => { c.presence.lastSeenAt = 'invalid'; }, c => { c.presence.lat = 91; },
  c => { c.presence.lat = 20; }, c => { c.presence = null; }]) {
  test(`unavailable/stale/invalid/distant courier is excluded (${mutate.toString()})`, () => {
    const f = fixture('OWN_ONLY'); mutate(f.store.couriers.get('own')); f.start();
    assert.equal(active(f).some(offer => offer.courierId === 'own'), false);
  });
}

test('shared participation requires both active platform enrollment and current opt-in', () => {
  const f = fixture('SHARED_ONLY'); f.store.couriers.get('shared').presence.acceptingShared = false;
  f.store.couriers.get('dual').isShared = false; f.start();
  assert.equal(active(f).length, 0);
});

test('distance setting is merchant-specific and is rechecked on acceptance', () => {
  const f = fixture('OWN_ONLY', { maxDistanceKm: 0.1 });
  f.store.couriers.get('dual').presence.lat += 0.01; f.start();
  assert.deepEqual(active(f).map(offer => offer.courierId), ['own']);
  f.store.couriers.get('own').presence.lat += 0.01;
  assert.throws(() => f.accept('own'), code('COURIER_FORBIDDEN'));
});

test('one courier cannot claim two concurrent deliveries even through separate offers', async () => {
  const f = fixture('SHARED_ONLY'); f.start(); f.addTask('t2'); f.engine.startDispatch({ taskId: 't2' });
  const offers = active(f).filter(offer => offer.courierId === 'shared');
  const results = await Promise.allSettled(offers.map(offer => Promise.resolve().then(() => f.engine.acceptOffer({ offerId: offer.id, courierId: 'shared' }))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(f.store.assignments.size, 1);
});

test('pickup is the only transition that moves Order.status to ON_THE_WAY', () => {
  const f = fixture('OWN_ONLY'); f.start(); assert.equal(f.order.status, 'READY');
  f.accept('own'); assert.equal(f.order.status, 'READY');
  const before = snapshot(f);
  let failures = 0;
  for (const pickupPin of [undefined, '0000', 1234]) {
    assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin }), code('INVALID_PIN'));
    // Solo cambia la evidencia de intentos: pedido, asignación y versión no avanzan.
    assert.deepEqual(f.task.pinAttempts, { pickup: { failures: ++failures, windowStartedAt: NOW.toISOString() } });
    const withoutAttempts = JSON.parse(snapshot(f));
    delete withoutAttempts.tasks[0][1].pinAttempts;
    assert.deepEqual(withoutAttempts, JSON.parse(before));
  }
  f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' });
  assert.equal(f.order.status, 'ON_THE_WAY'); assert.equal(f.task.status, 'PICKED_UP');
  assert.ok(f.task.currentAssignment.pickedUpAt);
  assert.throws(() => f.engine.requestShared({ taskId: 't1' }), code('OFFER_ALREADY_CLAIMED'));
  assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' }), code('ORDER_NOT_READY'));
});

test('pickup requires the assigned courier, valid proof hash and a READY order', () => {
  const f = fixture('OWN_ONLY'); f.start(); f.accept('own');
  assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'foreign', pickupPin: '1234' }), code('COURIER_FORBIDDEN'));
  f.order.status = 'PREPARING';
  assert.throws(() => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' }), code('ORDER_NOT_READY'));
  assert.throws(() => confirmPickup({ task: { status: 'ASSIGNED' }, pickupPin: '1234' }), code('INVALID_PIN'));
});

test('delivery cannot skip pickup or complete on invalid proof and releases courier only on completion', () => {
  const f = fixture('OWN_ONLY'); f.start(); f.accept('own');
  assert.throws(() => f.engine.confirmDelivery({ taskId: 't1', courierId: 'own', deliveryPin: '5678' }), code('ORDER_NOT_PICKED_UP'));
  f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' });
  assert.throws(() => f.engine.confirmDelivery({ taskId: 't1', courierId: 'own', deliveryPin: '0000' }), code('INVALID_PIN'));
  f.engine.confirmDelivery({ taskId: 't1', courierId: 'own', deliveryPin: '5678' });
  assert.equal(f.order.status, 'DELIVERED'); assert.equal(f.task.currentAssignment.status, 'COMPLETED');
  f.addTask('t2'); f.engine.startDispatch({ taskId: 't2' });
  assert.equal(active(f).some(offer => offer.taskId === 't2' && offer.courierId === 'own'), true);
});

test('invalid policy parameters are rejected without modifying saved merchant configuration', () => {
  for (const input of [null, [], {}, { ...config, deliveryPolicy: 'ANY' }, { ...config, fallbackSeconds: -1 },
    { ...config, fallbackSeconds: '30' }, { ...config, fallbackSeconds: 1.5 }, { ...config, fallbackSeconds: 3601 },
    { ...config, maxDistanceKm: 0 }, { ...config, maxDistanceKm: -1 }, { ...config, maxDistanceKm: NaN },
    { ...config, maxDistanceKm: Infinity }, { ...config, maxDistanceKm: 101 }, { ...config, maxDistanceKm: '2' },
    { ...config, restaurantId: 'r2' }]) assert.throws(() => validateDeliveryPolicy(input), code('INVALID_DELIVERY_POLICY'));
  for (const policy of ['OWN_ONLY', 'SHARED_ONLY', 'OWN_THEN_SHARED', 'MANUAL']) {
    assert.equal(validateDeliveryPolicy({ ...config, deliveryPolicy: policy }).deliveryPolicy, policy);
  }
});

test('configuration changes affect new tasks and preserve existing task policy snapshots', () => {
  const f = fixture(); f.start();
  f.engine.configurePolicy({ merchantId: 'm1', ...config, deliveryPolicy: 'SHARED_ONLY' });
  assert.equal(f.task.deliveryPolicy, 'OWN_THEN_SHARED'); assert.equal(f.task.fallbackSeconds, 30);
  const task = f.addTask('t2'); f.engine.startDispatch({ taskId: task.id });
  assert.equal(task.deliveryPolicy, 'SHARED_ONLY'); assert.equal(task.maxDistanceKm, 5);
  assert.equal(f.store.merchants.get('m2').deliveryPolicy, 'OWN_ONLY');
});

test('invalid clock and missing fallback timestamps fail closed', () => {
  assert.throws(() => evaluateFallback({ task: { status: 'OFFERING' } }), code('INVALID_FALLBACK'));
  const f = fixture(); f.setTime('invalid');
  assert.throws(f.start, code('INVALID_CLOCK')); assert.equal(f.task.status, 'WAITING_READY');
});

test('start validates task scope, payout and PIN before changing state', () => {
  for (const mutate of [task => { task.restaurantId = 'r2'; }, task => { task.locationId = 'l3'; },
    task => { task.payoutAmount = -1; }, task => { task.payoutAmount = 1.001; },
    task => { task.pickupPinHash = undefined; }, task => { task.pickupLat = 91; }]) {
    const f = fixture(); mutate(f.task); const before = snapshot(f);
    assert.throws(f.start); assert.equal(snapshot(f), before);
  }
});

test('cancelled/cross-tenant orders cannot dispatch, accept or pick up; tick creates no offers', () => {
  const f = fixture(); f.start(); f.order.status = 'CANCELLED'; const count = f.offers().length;
  assert.throws(() => f.accept('own'), code('ORDER_UNAVAILABLE')); f.engine.tick();
  assert.equal(f.offers().length, count); assert.equal(active(f).length, 0);
  const g = fixture(); g.order.restaurantId = 'r2'; assert.throws(g.start, code('ORDER_UNAVAILABLE'));
});

for (const status of ['PENDING_PAYMENT', 'PENDING_MERCHANT']) {
  test(`${status}: no permite ofertar, asignar, tomar ni recoger`, () => {
    const f = fixture(); f.order.status = status;
    const before = snapshot(f);
    for (const operation of ['startDispatch', 'requestShared', 'assignOwn']) {
      assert.throws(() => f.engine[operation]({ taskId: 't1', courierId: 'own' }), code('NOT_DISPATCHABLE'));
      assert.equal(snapshot(f), before);
    }
    const offered = fixture(); offered.start(); offered.order.status = status;
    assert.throws(() => offered.accept('own'), code('NOT_DISPATCHABLE'));
    assert.deepEqual(offered.engine.offersForCourier('own'), []);
    assert.equal(active(offered).length, 0);
    const assigned = fixture(); assigned.start(); assigned.accept('own'); assigned.order.status = status;
    assert.throws(() => assigned.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' }), code('NOT_DISPATCHABLE'));
    assert.equal(assigned.task.status, 'ASSIGNED');
    assert.equal(assigned.task.pinAttempts, undefined);
  });
}

test('HTTP v1 PUT policy validates fields, applies branch scope and saves all three settings', async () => {
  const f = fixture();
  const res = await f.request('PUT', '/merchants/:id/delivery-policy', { params: { id: 'm1' }, body: config });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { merchantId: 'm1', ...config });
  assert.equal(res.headers['cache-control'], 'no-store');
  const before = snapshot(f);
  const invalid = await f.request('PUT', '/merchants/:id/delivery-policy', { params: { id: 'm1' }, body: { ...config, maxDistanceKm: 0 } });
  assert.equal(invalid.statusCode, 422); assert.equal(snapshot(f), before);
  const foreign = await f.request('PUT', '/merchants/:id/delivery-policy', { params: { id: 'm2' }, body: config });
  assert.equal(foreign.statusCode, 404);
  const branch = await f.request('PUT', '/merchants/:id/delivery-policy', { user: { ...admin, locationId: 'l3' }, params: { id: 'm1' }, body: config });
  assert.equal(branch.statusCode, 404);
});

test('HTTP private policy read resolves the selected branch and returns no private merchant fields', async () => {
  const f = fixture(); f.store.merchants.get('m1').privateContact = 'PRIVATE';
  const before = snapshot(f);
  const res = await f.request('GET', '/merchants/me/delivery-policy', { headers: { 'x-restaurant-id': 'r1', 'x-location-id': 'l1' } });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { merchantId: 'm1', deliveryPolicy: 'OWN_THEN_SHARED', fallbackSeconds: 30, maxDistanceKm: 10 });
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(snapshot(f), before);
  const branch = await f.request('GET', '/merchants/me/delivery-policy', { headers: { 'x-location-id': 'l3' } });
  assert.equal(branch.body.merchantId, 'branch');
});

test('HTTP private policy read rejects ambiguity, foreign headers, devices and non-admin identities', async () => {
  const f = fixture(); const path = '/merchants/me/delivery-policy';
  assert.equal((await f.request('GET', path)).statusCode, 409);
  for (const headers of [{ 'x-location-id': 'l2' }, { 'x-restaurant-id': 'r2' }, { 'x-location-id': ['l1', 'l3'] }]) {
    assert.ok([404, 422].includes((await f.request('GET', path, { headers })).statusCode));
  }
  for (const user of [null, driver('own'), { ...admin, role: 'CASHIER' }, { ...admin, isActive: false }, { ...admin, isDevice: true }]) {
    assert.ok([401, 403].includes((await f.request('GET', path, { user, headers: { 'x-location-id': 'l1' } })).statusCode));
  }
  assert.equal((await f.request('GET', path, { user: { ...admin, locationId: 'l1' }, headers: { 'x-location-id': 'l3' } })).statusCode, 404);
});

test('HTTP private policy read defaults unconfigured values and permits explicit SuperAdmin restaurant scope', async () => {
  const f = fixture(); const merchant = f.store.merchants.get('m1');
  delete merchant.deliveryPolicy; delete merchant.fallbackSeconds; delete merchant.maxDistanceKm;
  const res = await f.request('GET', '/merchants/me/delivery-policy', { user: { ...admin, locationId: 'l1' } });
  assert.deepEqual(res.body, { merchantId: 'm1', deliveryPolicy: 'OWN_THEN_SHARED', fallbackSeconds: 30, maxDistanceKm: 10 });
  const other = await f.request('GET', '/merchants/me/delivery-policy', { user: { ...admin, role: 'SUPER_ADMIN', restaurantId: null },
    headers: { 'x-restaurant-id': 'r2', 'x-location-id': 'l2' } });
  assert.equal(other.statusCode, 200); assert.equal(other.body.merchantId, 'm2');
});

test('HTTP new merchant routes require verified active human administrator identity', async () => {
  const f = fixture();
  for (const user of [null, { ...admin, isActive: false }, { ...admin, isDevice: true }, { ...admin, role: 'CASHIER' }, driver('own')]) {
    const before = snapshot(f);
    const res = await f.request('PUT', '/merchants/:id/delivery-policy', { user, params: { id: 'm1' }, body: config });
    assert.ok([401, 403].includes(res.statusCode)); assert.equal(snapshot(f), before);
  }
});

test('HTTP request-shared authorizes merchant, rejects mass assignment and conflicting CAS', async () => {
  const f = fixture('OWN_ONLY'); f.start();
  for (const args of [{ user: { ...admin, restaurantId: 'r2' }, expected: 404 },
    { body: { automatic: true }, expected: 422 }, { body: { expectedVersion: 0 }, expected: 409 }]) {
    const before = snapshot(f); const res = await f.request('POST', '/dispatch/tasks/:id/request-shared', args);
    assert.equal(res.statusCode, args.expected); assert.equal(snapshot(f), before);
  }
  const res = await f.request('POST', '/dispatch/tasks/:id/request-shared', { body: { expectedVersion: f.task.version } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.task.dispatchMode, 'SHARED');
  assert.equal(res.body.task.pickupPinHash, undefined); assert.equal(f.order.status, 'READY');
});

test('HTTP courier polling drives fallback once and only exposes eligible personal offers', async () => {
  const f = fixture(); f.start(); f.advance(30000);
  const res = await f.request('GET', '/couriers/me/offers', { user: driver('shared') });
  assert.equal(res.statusCode, 200); assert.equal(res.body.offers.length, 1);
  assert.equal(res.body.offers[0].source, 'SHARED'); assert.equal(f.task.dispatchMode, 'SHARED');
  const count = f.offers().length;
  await f.request('GET', '/couriers/me/offers', { user: driver('shared') }); assert.equal(f.offers().length, count);
  const own = await f.request('GET', '/couriers/me/offers', { user: driver('own') }); assert.deepEqual(own.body.offers, []);
});

test('HTTP cannot impersonate couriers or enroll through presence', async () => {
  const f = fixture(); f.start(); const offer = active(f).find(row => row.courierId === 'own');
  for (const args of [{ user: driver('foreign'), body: { courierId: 'own' } }, { user: driver('foreign') }]) {
    const res = await f.request('POST', '/couriers/offers/:id/accept', { ...args, params: { id: offer.id } });
    assert.equal(res.statusCode, 403);
  }
  assert.equal((await f.request('GET', '/couriers/me/offers', { user: driver('own'), query: { courierId: 'shared' } })).statusCode, 403);
  assert.equal((await f.request('POST', '/couriers/me/presence', { user: driver('unknown'), body: { isOnline: true, lat: 0, lng: 0 } })).statusCode, 403);
  assert.equal(f.store.couriers.has('unknown'), false);
  assert.equal((await f.request('POST', '/couriers/me/presence', { user: driver('own'), body: { isOnline: true, lat: 0, lng: 0, isShared: true } })).statusCode, 422);
});

test('HTTP competing accepts and pickup/switch race preserve one assignment and pickup invariant', async () => {
  const f = fixture('OWN_ONLY'); f.start();
  const responses = await Promise.all(active(f).map(offer => f.request('POST', '/couriers/offers/:id/accept', { user: driver(offer.courierId), params: { id: offer.id } })));
  assert.deepEqual(responses.map(res => res.statusCode).sort(), [200, 409]);
  assert.equal(f.order.status, 'READY');
  const courierId = f.task.currentAssignment.courierId;
  const bad = await f.request('POST', '/couriers/tasks/:id/pickup', { user: driver(courierId), body: { pickupPin: '0000' } });
  assert.equal(bad.statusCode, 400); assert.equal(f.order.status, 'READY');
  const pickup = await f.request('POST', '/couriers/tasks/:id/pickup', { user: driver(courierId), body: { pickupPin: '1234' } });
  assert.equal(pickup.statusCode, 200); assert.equal(f.order.status, 'ON_THE_WAY');
  const switchResult = await f.request('POST', '/dispatch/tasks/:id/request-shared');
  assert.equal(switchResult.statusCode, 409); assert.equal(f.store.assignments.size, 1);
});

for (const pickupFirst of [true, false]) {
  test(`CAS pickup and forced switch compete using the same version (pickup first: ${pickupFirst})`, async () => {
    const f = fixture('OWN_ONLY'); f.start(); f.accept('own');
    const version = f.task.version;
    const pickup = () => f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234', expectedVersion: version });
    const shared = () => f.engine.requestShared({ taskId: 't1', expectedVersion: version });
    const operations = pickupFirst ? [pickup, shared] : [shared, pickup];
    const results = await Promise.allSettled(operations.map(operation => Promise.resolve().then(operation)));
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.statusCode, 409);
    assert.equal(f.order.status, pickupFirst ? 'ON_THE_WAY' : 'READY');
    assert.equal(f.task.status, pickupFirst ? 'PICKED_UP' : 'OFFERING');
    assert.equal([...f.store.assignments.values()].filter(row => row.status === 'ACTIVE').length, pickupFirst ? 1 : 0);
  });
}

for (const acceptFirst of [true, false]) {
  test(`CAS acceptance and forced switch compete using the same version (accept first: ${acceptFirst})`, async () => {
    const f = fixture('OWN_ONLY'); f.start();
    const version = f.task.version;
    const offerId = active(f).find(offer => offer.courierId === 'own').id;
    const accept = () => f.engine.acceptOffer({ offerId, courierId: 'own' });
    const shared = () => f.engine.requestShared({ taskId: 't1', expectedVersion: version });
    const operations = acceptFirst ? [accept, shared] : [shared, accept];
    const results = await Promise.allSettled(operations.map(operation => Promise.resolve().then(operation)));
    assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected');
    assert.equal(results[1].reason.statusCode, 409);
    assert.equal(f.task.dispatchMode, acceptFirst ? 'OWN' : 'SHARED');
    assert.equal(f.order.status, 'READY');
  });
}

test('HTTP task privacy, missing IDs and scope checks fail closed', async () => {
  const f = fixture(); f.start();
  assert.equal((await f.request('GET', '/dispatch/tasks/:id', { user: driver('shared') })).statusCode, 404);
  assert.equal((await f.request('POST', '/dispatch/tasks/:id/request-shared', { params: { id: 'missing' } })).statusCode, 404);
  const view = await f.request('GET', '/dispatch/tasks/:id');
  assert.equal(view.statusCode, 200); assert.equal(view.body.pickupPinHash, undefined); assert.equal(view.body.deliveryPinHash, undefined);
  const own = await f.request('POST', '/dispatch/tasks/:id/assign-own', { body: { courierId: 'foreign' } });
  assert.equal(own.statusCode, 403);
});

test('v1 and legacy mounts share a router and register before the unversioned marketplace', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const v1 = source.indexOf("app.use('/api/marketplace/v1', marketplaceDispatchRouter)");
  assert.ok(v1 > 0);
  assert.ok(source.includes("app.use('/api/marketplace/dispatch', marketplaceDispatchRouter)"));
  assert.ok(v1 < source.indexOf("app.use('/api/marketplace',"));
});
