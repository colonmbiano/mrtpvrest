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

test('evaluateFallback: triggers fallback when all own offers are expired/settled', () => {
  const now = new Date('2026-10-22T18:00:20Z');
  const task = { status: TASK_STATUS.OFFERING, readyAt: new Date('2026-10-22T18:00:00Z') };
  const offers = [
    { source: 'OWN', status: OFFER_STATUS.EXPIRED },
    { source: 'OWN', status: OFFER_STATUS.DECLINED },
  ];

  const res = evaluateFallback({ task, offers, policy: 'OWN_THEN_SHARED', fallbackSeconds: 30, now });
  assert.equal(res.shouldFallbackToShared, true);
  assert.equal(res.reason, 'ALL_OWN_OFFERS_SETTLED');
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

const createMarketplaceDispatchRouter = require('../src/routes/marketplace-dispatch.routes');

function createMockRouter() {
  const routes = [];
  const useMiddlewares = [];
  return {
    routes,
    useMiddlewares,
    use(fn) {
      useMiddlewares.push(fn);
    },
    get(path, handler) {
      routes.push({ method: 'GET', path, handler });
    },
    post(path, handler) {
      routes.push({ method: 'POST', path, handler });
    },
  };
}

function createMockReqRes({ params = {}, query = {}, body = {} } = {}) {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;

  const req = { params, query, body };
  const res = {
    set(key, val) {
      headers[key.toLowerCase()] = val;
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(b) {
      jsonBody = b;
      return res;
    },
  };

  return { req, res, getHeader: (k) => headers[k.toLowerCase()], getStatus: () => statusCode, getBody: () => jsonBody };
}

test('dispatch router: sets Cache-Control: no-store via middleware', async () => {
  const router = createMarketplaceDispatchRouter({ Router: createMockRouter });
  assert.ok(router.useMiddlewares.length > 0);

  const { req, res, getHeader } = createMockReqRes();
  let nextCalled = false;
  await router.useMiddlewares[0](req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(getHeader('cache-control'), 'no-store');
});

test('dispatch router: courier presence updates GPS coordinates', async () => {
  const store = { tasks: new Map(), offers: new Map(), couriers: new Map() };
  const router = createMarketplaceDispatchRouter({ Router: createMockRouter, getStore: () => store });

  const route = router.routes.find(r => r.method === 'POST' && r.path === '/couriers/me/presence');
  assert.ok(route);

  const { req, res, getStatus, getBody } = createMockReqRes({
    body: { courierId: 'cur_juan', isOnline: true, lat: 19.4326, lng: -99.1332, accuracy: 5 },
  });

  await route.handler(req, res);

  assert.equal(getStatus(), 200);
  assert.equal(getBody().success, true);
  assert.equal(getBody().presence.lat, 19.4326);

  const saved = store.couriers.get('cur_juan');
  assert.ok(saved);
  assert.equal(saved.isOnline, true);
});

test('dispatch router: courier accepts offer, concurrent second attempt receives 409', async () => {
  const store = {
    tasks: new Map([
      ['task_http_1', { id: 'task_http_1', status: TASK_STATUS.OFFERING, currentAssignmentId: null }],
    ]),
    offers: new Map([
      ['ofr_http_1', { id: 'ofr_http_1', taskId: 'task_http_1', courierId: 'cur_pablo', status: OFFER_STATUS.OFFERED, expiresAt: new Date(Date.now() + 30000) }],
    ]),
    couriers: new Map(),
  };

  const router = createMarketplaceDispatchRouter({ Router: createMockRouter, getStore: () => store });
  const route = router.routes.find(r => r.method === 'POST' && r.path === '/couriers/offers/:id/accept');
  assert.ok(route);

  // First request succeeds
  const { req: req1, res: res1, getStatus: getStatus1, getBody: getBody1 } = createMockReqRes({
    params: { id: 'ofr_http_1' },
    body: { courierId: 'cur_pablo' },
  });
  await route.handler(req1, res1);
  assert.equal(getStatus1(), 200);
  assert.equal(getBody1().success, true);
  assert.ok(getBody1().assignment.id.startsWith('asgn_'));

  // Second concurrent attempt receives 409 Conflict
  const { req: req2, res: res2, getStatus: getStatus2, getBody: getBody2 } = createMockReqRes({
    params: { id: 'ofr_http_1' },
    body: { courierId: 'cur_pablo' },
  });
  await route.handler(req2, res2);
  assert.equal(getStatus2(), 409);
  assert.equal(getBody2().errorCode, 'OFFER_ALREADY_CLAIMED');
});

test('dispatch router: pickup with valid PIN returns orderStatusUpdate: ON_THE_WAY', async () => {
  const pickupPin = '4321';
  const store = {
    tasks: new Map([
      ['task_pickup_1', {
        id: 'task_pickup_1',
        status: TASK_STATUS.ASSIGNED,
        pickupPinHash: hashPin(pickupPin),
        currentAssignment: { status: 'ACTIVE' },
      }],
    ]),
    offers: new Map(),
    couriers: new Map(),
  };

  const router = createMarketplaceDispatchRouter({ Router: createMockRouter, getStore: () => store });
  const route = router.routes.find(r => r.method === 'POST' && r.path === '/couriers/tasks/:id/pickup');
  assert.ok(route);

  const { req, res, getStatus, getBody } = createMockReqRes({
    params: { id: 'task_pickup_1' },
    body: { pickupPin },
  });

  await route.handler(req, res);

  assert.equal(getStatus(), 200);
  assert.equal(getBody().success, true);
  assert.equal(getBody().status, TASK_STATUS.PICKED_UP);
  assert.equal(getBody().orderStatusUpdate, 'ON_THE_WAY');
});

test('dispatch router: delivery with valid PIN returns orderStatusUpdate: DELIVERED', async () => {
  const deliveryPin = '8765';
  const store = {
    tasks: new Map([
      ['task_deliv_1', {
        id: 'task_deliv_1',
        status: TASK_STATUS.PICKED_UP,
        deliveryPinHash: hashPin(deliveryPin),
        currentAssignment: { status: 'ACTIVE' },
      }],
    ]),
    offers: new Map(),
    couriers: new Map(),
  };

  const router = createMarketplaceDispatchRouter({ Router: createMockRouter, getStore: () => store });
  const route = router.routes.find(r => r.method === 'POST' && r.path === '/couriers/tasks/:id/deliver');
  assert.ok(route);

  const { req, res, getStatus, getBody } = createMockReqRes({
    params: { id: 'task_deliv_1' },
    body: { deliveryPin },
  });

  await route.handler(req, res);

  assert.equal(getStatus(), 200);
  assert.equal(getBody().success, true);
  assert.equal(getBody().status, TASK_STATUS.DELIVERED);
  assert.equal(getBody().orderStatusUpdate, 'DELIVERED');
});
