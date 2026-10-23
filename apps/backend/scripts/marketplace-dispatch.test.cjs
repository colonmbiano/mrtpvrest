const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  TASK_STATUS,
  OFFER_STATUS,
  InvalidStateTransitionError,
  OfferAlreadyClaimedError,
  OfferExpiredError,
  InvalidPinError,
  hashPin,
  verifyPin,
  haversineDistanceKm,
  canTransitionTask,
  assertTaskTransition,
  atomicAcceptOffer,
  confirmPickup,
  confirmDelivery,
  evaluateFallback,
  rankCandidates,
} = require('../src/lib/marketplace-dispatch');

// ── 1. Haversine Distance ─────────────────────────────────────────────────────

test('haversineDistanceKm: returns 0 for identical coordinates', () => {
  const d = haversineDistanceKm(19.4326, -99.1332, 19.4326, -99.1332);
  assert.equal(d, 0);
});

test('haversineDistanceKm: computes accurate distance in Mexico City', () => {
  // Zocalo (19.4326, -99.1332) to Bellas Artes (19.4352, -99.1412) ~ 0.88 km
  const d = haversineDistanceKm(19.4326, -99.1332, 19.4352, -99.1412);
  assert.ok(d > 0.8 && d < 1.0, `Expected ~0.88 km, got ${d}`);
});

// ── 2. PIN Hashing & Timing-Safe Verification ─────────────────────────────────

test('hashPin and verifyPin: valid 4-digit PIN hashes and verifies correctly', () => {
  const pin = '4829';
  const hashed = hashPin(pin);
  assert.equal(typeof hashed, 'string');
  assert.equal(hashed.length, 64); // SHA-256 hex length

  assert.equal(verifyPin('4829', hashed), true);
  assert.equal(verifyPin('9999', hashed), false);
  assert.equal(verifyPin('', hashed), false);
  assert.equal(verifyPin(null, hashed), false);
});

test('hashPin: rejects non-numeric or invalid length pins', () => {
  assert.throws(() => hashPin('abc1'), err => err.code === 'INVALID_PIN_FORMAT');
  assert.throws(() => hashPin('12'), err => err.code === 'INVALID_PIN_FORMAT');
  assert.throws(() => hashPin('1234567'), err => err.code === 'INVALID_PIN_FORMAT');
  assert.throws(() => hashPin(1234), err => err.code === 'INVALID_PIN_FORMAT');
});

// ── 3. State Machine Transitions ──────────────────────────────────────────────

test('canTransitionTask: allowed happy path transitions pass', () => {
  assert.equal(canTransitionTask(TASK_STATUS.WAITING_READY, TASK_STATUS.OFFERING), true);
  assert.equal(canTransitionTask(TASK_STATUS.OFFERING, TASK_STATUS.ASSIGNED), true);
  assert.equal(canTransitionTask(TASK_STATUS.ASSIGNED, TASK_STATUS.PICKED_UP), true);
  assert.equal(canTransitionTask(TASK_STATUS.PICKED_UP, TASK_STATUS.DELIVERED), true);
});

test('assertTaskTransition: rejects invalid or skipping transitions', () => {
  // Skipping directly from ASSIGNED to DELIVERED without pickup is strictly prohibited
  assert.throws(
    () => assertTaskTransition({ status: TASK_STATUS.ASSIGNED }, TASK_STATUS.DELIVERED),
    InvalidStateTransitionError
  );
  // Re-transitioning terminal state
  assert.throws(
    () => assertTaskTransition({ status: TASK_STATUS.DELIVERED }, TASK_STATUS.OFFERING),
    InvalidStateTransitionError
  );
  assert.throws(
    () => assertTaskTransition({ status: TASK_STATUS.FAILED }, TASK_STATUS.ASSIGNED),
    InvalidStateTransitionError
  );
});

// ── 4. Atomic CAS (Compare-And-Swap) Accept ───────────────────────────────────

test('atomicAcceptOffer: successfully assigns task to offering courier', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const task = {
    id: 'task_001',
    status: TASK_STATUS.OFFERING,
    currentAssignmentId: null,
  };
  const offer = {
    id: 'ofr_001',
    taskId: 'task_001',
    courierId: 'cur_alice',
    source: 'OWN',
    payoutAmount: 35.0,
    status: OFFER_STATUS.OFFERED,
    expiresAt: new Date('2026-10-22T18:00:30Z'),
  };

  const result = atomicAcceptOffer({ task, offer, courierId: 'cur_alice', now });

  assert.equal(result.task.status, TASK_STATUS.ASSIGNED);
  assert.equal(result.offer.status, OFFER_STATUS.ACCEPTED);
  assert.ok(result.assignment.id.startsWith('asgn_'));
  assert.equal(result.assignment.courierId, 'cur_alice');
  assert.equal(result.assignment.source, 'OWN');
  assert.equal(result.assignment.payoutAmount, 35.0);
  assert.equal(task.currentAssignmentId, result.assignment.id);
});

test('atomicAcceptOffer: concurrency test - second courier attempting to claim gets 409 Conflict', () => {
  const now = new Date('2026-10-22T18:00:10Z');
  const task = {
    id: 'task_002',
    status: TASK_STATUS.OFFERING,
    currentAssignmentId: null,
  };
  const offer1 = {
    id: 'ofr_101',
    taskId: 'task_002',
    courierId: 'cur_bob',
    source: 'SHARED',
    payoutAmount: 40.0,
    status: OFFER_STATUS.OFFERED,
    expiresAt: new Date('2026-10-22T18:00:30Z'),
  };
  const offer2 = {
    id: 'ofr_102',
    taskId: 'task_002',
    courierId: 'cur_carol',
    source: 'SHARED',
    payoutAmount: 40.0,
    status: OFFER_STATUS.OFFERED,
    expiresAt: new Date('2026-10-22T18:00:30Z'),
  };

  // First courier accepts: succeeds
  const res1 = atomicAcceptOffer({ task, offer: offer1, courierId: 'cur_bob', now });
  assert.equal(res1.task.status, TASK_STATUS.ASSIGNED);
  assert.equal(res1.offer.status, OFFER_STATUS.ACCEPTED);

  // Second courier attempts to accept simultaneously: task is no longer OFFERING
  assert.throws(
    () => atomicAcceptOffer({ task, offer: offer2, courierId: 'cur_carol', now }),
    OfferAlreadyClaimedError
  );
  // Offer2 was marked EXPIRED and task remains assigned to Bob
  assert.equal(offer2.status, OFFER_STATUS.EXPIRED);
  assert.equal(task.currentAssignment.courierId, 'cur_bob');
});

test('atomicAcceptOffer: throws OfferExpiredError when accepting after expiresAt', () => {
  const task = { id: 'task_003', status: TASK_STATUS.OFFERING };
  const offer = {
    id: 'ofr_003',
    courierId: 'cur_dave',
    status: OFFER_STATUS.OFFERED,
    expiresAt: new Date('2026-10-22T18:00:15Z'),
  };
  const lateTime = new Date('2026-10-22T18:00:16Z'); // 1 second late

  assert.throws(
    () => atomicAcceptOffer({ task, offer, courierId: 'cur_dave', now: lateTime }),
    OfferExpiredError
  );
  assert.equal(offer.status, OFFER_STATUS.EXPIRED);
  assert.equal(task.status, TASK_STATUS.OFFERING); // Task unchanged
});

// ── 5. Pickup & Delivery Invariants ───────────────────────────────────────────

test('confirmPickup: transitions to PICKED_UP and sets orderStatus to ON_THE_WAY only upon pickup', () => {
  const pickupPin = '1234';
  const task = {
    id: 'task_004',
    status: TASK_STATUS.ASSIGNED,
    pickupPinHash: hashPin(pickupPin),
    currentAssignment: { status: 'ACTIVE' },
  };

  const result = confirmPickup({ task, pickupPin });
  assert.equal(result.task.status, TASK_STATUS.PICKED_UP);
  // GOLDEN RULE: Order status updates to ON_THE_WAY on pickup
  assert.equal(result.orderStatusUpdate, 'ON_THE_WAY');
});

test('confirmPickup: rejects wrong PIN with InvalidPinError', () => {
  const task = {
    id: 'task_005',
    status: TASK_STATUS.ASSIGNED,
    pickupPinHash: hashPin('1234'),
  };

  assert.throws(() => confirmPickup({ task, pickupPin: '0000' }), InvalidPinError);
  assert.equal(task.status, TASK_STATUS.ASSIGNED);
});

test('confirmDelivery: transitions to DELIVERED and marks assignment COMPLETED', () => {
  const deliveryPin = '5678';
  const task = {
    id: 'task_006',
    status: TASK_STATUS.PICKED_UP,
    deliveryPinHash: hashPin(deliveryPin),
    currentAssignment: { status: 'ACTIVE', deliveredAt: null },
  };

  const result = confirmDelivery({ task, deliveryPin });
  assert.equal(result.task.status, TASK_STATUS.DELIVERED);
  assert.equal(result.task.currentAssignment.status, 'COMPLETED');
  assert.equal(result.orderStatusUpdate, 'DELIVERED');
});

// ── 6. Fallback Evaluation ────────────────────────────────────────────────────

test('evaluateFallback: OWN_THEN_SHARED waits while own offers are pending within window', () => {
  const createdAt = new Date('2026-10-22T18:00:00Z');
  const now = new Date('2026-10-22T18:00:15Z'); // 15 seconds elapsed
  const task = { status: TASK_STATUS.OFFERING, readyAt: createdAt };
  const offers = [{ source: 'OWN', status: OFFER_STATUS.OFFERED }];

  const res = evaluateFallback({ task, offers, policy: 'OWN_THEN_SHARED', fallbackSeconds: 30, now });
  assert.equal(res.shouldFallbackToShared, false);
  assert.equal(res.reason, 'WAITING_OWN_WINDOW');
  assert.equal(res.remainingSeconds, 15);
});

test('evaluateFallback: settled own offers still respect the configured own window', () => {
  const now = new Date('2026-10-22T18:00:20Z');
  const task = { status: TASK_STATUS.OFFERING, readyAt: new Date('2026-10-22T18:00:00Z') };
  const offers = [
    { source: 'OWN', status: OFFER_STATUS.EXPIRED },
    { source: 'OWN', status: OFFER_STATUS.DECLINED },
  ];

  const res = evaluateFallback({ task, offers, policy: 'OWN_THEN_SHARED', fallbackSeconds: 30, now });
  assert.equal(res.shouldFallbackToShared, false);
  assert.equal(res.reason, 'WAITING_OWN_WINDOW');
});

test('evaluateFallback: triggers fallback when fallbackSeconds exceeded', () => {
  const now = new Date('2026-10-22T18:00:35Z'); // 35 seconds elapsed > 30s
  const task = { status: TASK_STATUS.OFFERING, readyAt: new Date('2026-10-22T18:00:00Z') };

  const res = evaluateFallback({ task, offers: [], policy: 'OWN_THEN_SHARED', fallbackSeconds: 30, now });
  assert.equal(res.shouldFallbackToShared, true);
  assert.equal(res.reason, 'FALLBACK_TIMEOUT_EXCEEDED');
});

test('evaluateFallback: OWN_ONLY policy never falls back to shared', () => {
  const now = new Date('2026-10-22T18:05:00Z'); // 5 minutes elapsed
  const task = { status: TASK_STATUS.OFFERING, readyAt: new Date('2026-10-22T18:00:00Z') };

  const res = evaluateFallback({ task, offers: [], policy: 'OWN_ONLY', fallbackSeconds: 30, now });
  assert.equal(res.shouldFallbackToShared, false);
  assert.equal(res.reason, 'POLICY_NOT_OWN_THEN_SHARED');
});

// ── 7. Candidate Ranking ──────────────────────────────────────────────────────

test('rankCandidates: filters offline, stale (>90s) and out-of-range couriers, sorts by distance', () => {
  const now = new Date('2026-10-22T18:00:00Z');
  const pickupLat = 19.4326;
  const pickupLng = -99.1332;

  const couriers = [
    {
      id: 'cur_close',
      name: 'Mario Moto',
      isOnline: true,
      isAffiliated: true,
      vehicleType: 'MOTO',
      presence: { lat: 19.4352, lng: -99.1412, accuracy: 5, lastSeenAt: new Date('2026-10-22T17:59:50Z') }, // ~0.88 km, 10s ago
    },
    {
      id: 'cur_mid',
      name: 'Luigi Bici',
      isOnline: true,
      isAffiliated: false,
      vehicleType: 'BICYCLE',
      presence: { lat: 19.4452, lng: -99.1512, accuracy: 8, lastSeenAt: new Date('2026-10-22T17:59:40Z') }, // ~2.3 km, 20s ago
    },
    {
      id: 'cur_offline',
      name: 'Offline Driver',
      isOnline: false, // OFFLINE
      presence: { lat: 19.4326, lng: -99.1332, lastSeenAt: now },
    },
    {
      id: 'cur_stale_gps',
      name: 'Old GPS Signal',
      isOnline: true,
      presence: { lat: 19.4326, lng: -99.1332, lastSeenAt: new Date('2026-10-22T17:55:00Z') }, // 5 min ago (>90s)
    },
    {
      id: 'cur_far_away',
      name: 'Far Driver',
      isOnline: true,
      presence: { lat: 19.7000, lng: -99.1332, lastSeenAt: now }, // ~30 km (>10 km)
    },
  ];

  const ranked = rankCandidates({ couriers, pickupLat, pickupLng, maxDistanceKm: 10, now });

  assert.equal(ranked.length, 2);
  // Ranked by distance ascending
  assert.equal(ranked[0].courierId, 'cur_close');
  assert.equal(ranked[0].source, 'OWN');
  assert.ok(ranked[0].distanceKm < 1.0);

  assert.equal(ranked[1].courierId, 'cur_mid');
  assert.equal(ranked[1].source, 'SHARED');
  assert.ok(ranked[1].distanceKm > 2.0);
});

// ── 8. createMarketplaceDispatchRouter (HTTP & Endpoint Integration) ──────────

const { fixture, driver } = require('./helpers/marketplace-dispatch-fixture.cjs');

test('dispatch router: sets Cache-Control: no-store via middleware', () => {
  const f = fixture();
  let next = false;
  const res = { set(key, value) { assert.equal(key, 'Cache-Control'); assert.equal(value, 'no-store'); } };
  f.middlewares[0]({}, res, () => { next = true; });
  assert.equal(next, true);
});

test('dispatch router: authenticated courier presence updates GPS coordinates', async () => {
  const f = fixture();
  const res = await f.request('POST', '/couriers/me/presence', { user: driver('own'),
    body: { isOnline: true, lat: 19.4326, lng: -99.1332, accuracy: 5 } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.presence.lat, 19.4326);
  assert.equal(f.store.couriers.get('own').isOnline, true);
});

test('dispatch router: acceptance succeeds once and replay receives 409', async () => {
  const f = fixture('OWN_ONLY'); f.start();
  const offer = f.offers().find(row => row.courierId === 'own');
  const args = { user: driver('own'), params: { id: offer.id } };
  const first = await f.request('POST', '/couriers/offers/:id/accept', args);
  assert.equal(first.statusCode, 200); assert.equal(first.body.success, true);
  assert.ok(first.body.assignment.id.startsWith('asgn_'));
  const second = await f.request('POST', '/couriers/offers/:id/accept', args);
  assert.equal(second.statusCode, 409); assert.equal(second.body.errorCode, 'OFFER_ALREADY_CLAIMED');
});

test('dispatch router: valid pickup PIN updates the actual order to ON_THE_WAY', async () => {
  const f = fixture('OWN_ONLY'); f.start(); f.accept('own');
  const res = await f.request('POST', '/couriers/tasks/:id/pickup', { user: driver('own'), body: { pickupPin: '1234' } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.status, 'PICKED_UP');
  assert.equal(res.body.orderStatusUpdate, 'ON_THE_WAY'); assert.equal(f.order.status, 'ON_THE_WAY');
});

test('dispatch router: valid delivery PIN completes assignment and order', async () => {
  const f = fixture('OWN_ONLY'); f.start(); f.accept('own');
  f.engine.confirmPickup({ taskId: 't1', courierId: 'own', pickupPin: '1234' });
  const res = await f.request('POST', '/couriers/tasks/:id/deliver', { user: driver('own'), body: { deliveryPin: '5678' } });
  assert.equal(res.statusCode, 200); assert.equal(res.body.status, 'DELIVERED');
  assert.equal(res.body.orderStatusUpdate, 'DELIVERED'); assert.equal(f.order.status, 'DELIVERED');
  assert.equal(f.task.currentAssignment.status, 'COMPLETED');
});
