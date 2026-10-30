'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCouriersV1Service, CourierV1Error, normalizeApplication } = require('../src/lib/marketplace-couriers-v1');
const createRouter = require('../src/routes/marketplace-couriers-v1.routes');

// Offline by construction: any network call from this suite is a failure.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const clone = value => structuredClone(value);
const DUP = () => Object.assign(new Error('unique violation'), { code: 'DUPLICATE' });

// In-memory ports. merchantAccess mirrors the rule the real adapter must enforce: ADMIN may manage
// any merchant, MERCHANT_OWNER only the merchants it is linked to.
function world({ merchants = [{ id: 'm1', name: 'Taqueria Centro' }, { id: 'm2', name: 'Ferreteria Norte' }] } = {}) {
  const couriers = new Map();
  const affiliations = new Map();
  const pair = (courierId, merchantId) => [...affiliations.values()].find(row => row.courierId === courierId && row.merchantId === merchantId);
  const courierStore = {
    couriers,
    async create(row) {
      for (const other of couriers.values()) {
        if (other.accountId === row.accountId || other.phone === row.phone || other.email === row.email) throw DUP();
      }
      couriers.set(row.id, clone(row));
      return clone(row);
    },
    async findById(id) { return clone(couriers.get(id) ?? null); },
    async findByAccountId(accountId) { return clone([...couriers.values()].find(row => row.accountId === accountId) ?? null); },
  };
  const affiliationStore = {
    affiliations,
    async create(row) {
      if (pair(row.courierId, row.merchantId)) throw DUP();
      affiliations.set(row.id, clone(row));
      return clone(row);
    },
    async findByPair(courierId, merchantId) { return clone(pair(courierId, merchantId) ?? null); },
    async listByCourier(courierId) { return clone([...affiliations.values()].filter(row => row.courierId === courierId)); },
    async update(id, patch) {
      const row = { ...affiliations.get(id), ...patch };
      affiliations.set(id, clone(row));
      return clone(row);
    },
  };
  const merchantDirectory = { async findById(id) { return clone(merchants.find(merchant => merchant.id === id) ?? null); } };
  const merchantAccess = {
    async canManage(actor, merchantId) {
      return actor.roles.includes('ADMIN') || (actor.roles.includes('MERCHANT_OWNER') && (actor.merchantIds || []).includes(merchantId));
    },
  };
  const service = createCouriersV1Service({ courierStore, affiliationStore, merchantDirectory, merchantAccess, now: () => new Date('2026-10-23T12:00:00Z') });
  return { couriers, affiliations, courierStore, affiliationStore, service };
}

function seedCourier(w, overrides = {}) {
  const row = { id: 'c1', accountId: 'acc-c1', name: 'Ana Lopez', phone: '+525512345678', email: 'ana@example.com',
    vehicleType: 'MOTO', licensePlate: 'ABC123', verificationStatus: 'VERIFIED', status: 'ACTIVE', maxActiveTasks: 1, ...overrides };
  w.couriers.set(row.id, row);
  return row;
}
function seedAffiliation(w, overrides = {}) {
  const row = { id: 'a1', courierId: 'c1', merchantId: 'm1', status: 'ACTIVE', canTakeOwnOrders: false, ...overrides };
  w.affiliations.set(row.id, row);
  return row;
}

const COURIER = { accountId: 'acc-c1', roles: ['COURIER'] };
const OTHER_COURIER = { accountId: 'acc-c2', roles: ['COURIER'] };
const OWNER_M1 = { accountId: 'owner-1', roles: ['MERCHANT_OWNER'], merchantIds: ['m1'] };
const OWNER_M2 = { accountId: 'owner-2', roles: ['MERCHANT_OWNER'], merchantIds: ['m2'] };
const ADMIN = { accountId: 'admin-1', roles: ['ADMIN'] };
const STAFF = { accountId: 'staff-1', roles: ['STAFF'], merchantIds: ['m1'] };
const CUSTOMER = { accountId: 'cust-1', roles: ['CUSTOMER'] };
const APPLICATION = { name: 'Ana Lopez', phone: '+52 55 1234 5678', email: 'Ana@Example.com', vehicleType: 'MOTO', licensePlate: 'abc-123' };

function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof CourierV1Error && error.code === code
    && (statusCode === undefined || error.statusCode === statusCode));
}

test('apply registers a courier as PENDING_VERIFICATION with normalized contact data', async () => {
  const w = world();
  const view = await w.service.apply(CUSTOMER, APPLICATION);
  assert.deepEqual(Object.keys(view).sort(), ['courierId', 'maxActiveTasks', 'name', 'status', 'vehicleType', 'verificationStatus']);
  assert.equal(view.verificationStatus, 'PENDING_VERIFICATION');
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.maxActiveTasks, 1);
  assert.equal(JSON.stringify(view).includes('example.com'), false, 'contact data is not echoed back');
  const stored = [...w.couriers.values()][0];
  assert.equal(stored.phone, '+525512345678');
  assert.equal(stored.email, 'ana@example.com');
  assert.equal(stored.licensePlate, 'ABC123');
});

test('bicycles carry no plate; motorbikes and cars require one', () => {
  assert.equal(normalizeApplication({ name: 'Luis Ruiz', phone: '5512345678', email: 'l@x.mx', vehicleType: 'BICI' }).licensePlate, null);
  assert.equal(normalizeApplication({ ...APPLICATION, vehicleType: 'AUTO', licensePlate: 'xyz 9999' }).licensePlate, 'XYZ9999');
  for (const body of [
    { ...APPLICATION, vehicleType: 'BICI' },
    { ...APPLICATION, vehicleType: 'MOTO', licensePlate: undefined },
    { ...APPLICATION, licensePlate: 'AB1' },
  ]) {
    assert.throws(() => normalizeApplication(body), error => error.code === 'INVALID_PLATE' && error.statusCode === 422);
  }
});

test('invalid applicant data is rejected with 422 before any store is touched', async () => {
  const cases = [
    [{ name: 'A' }, 'INVALID_NAME'], [{ name: ' Ana Lopez' }, 'INVALID_NAME'], [{ name: 'Ana<script>' }, 'INVALID_NAME'],
    [{ phone: '123' }, 'INVALID_PHONE'], [{ phone: 'abcdefghij' }, 'INVALID_PHONE'], [{ phone: '+0123456789012345678' }, 'INVALID_PHONE'],
    [{ email: 'nope' }, 'INVALID_EMAIL'], [{ email: 'a@b' }, 'INVALID_EMAIL'], [{ email: 'a b@c.com' }, 'INVALID_EMAIL'],
    [{ vehicleType: 'CAMION' }, 'INVALID_VEHICLE'], [{ vehicleType: undefined }, 'INVALID_VEHICLE'],
    [{ verificationStatus: 'VERIFIED' }, 'INVALID_APPLICATION'], [{ status: 'ACTIVE' }, 'INVALID_APPLICATION'],
    [{ maxActiveTasks: 99 }, 'INVALID_APPLICATION'],
  ];
  for (const [patch, code] of cases) {
    const w = world();
    await rejects(w.service.apply(CUSTOMER, { ...APPLICATION, ...patch }), code, 422);
    assert.equal(w.couriers.size, 0);
  }
});

test('one account cannot register twice and duplicate contacts give the same generic 409', async () => {
  const w = world();
  await w.service.apply(CUSTOMER, APPLICATION);
  const sameAccount = await w.service.apply(CUSTOMER, APPLICATION).catch(error => error);
  const otherAccount = await w.service.apply({ accountId: 'cust-2', roles: ['CUSTOMER'] }, APPLICATION).catch(error => error);
  assert.equal(sameAccount.code, 'COURIER_EXISTS');
  assert.equal(otherAccount.code, 'COURIER_EXISTS');
  assert.equal(otherAccount.message, sameAccount.message, 'the message does not reveal which contact is taken');
  assert.equal(w.couriers.size, 1);
});

test('anonymous requests are 401 on every courier endpoint', async () => {
  const w = world();
  await rejects(w.service.apply(null, APPLICATION), 'UNAUTHENTICATED', 401);
  await rejects(w.service.profile(undefined), 'UNAUTHENTICATED', 401);
  await rejects(w.service.affiliations(null), 'UNAUTHENTICATED', 401);
  await rejects(w.service.affiliate(null, 'm1', {}), 'UNAUTHENTICATED', 401);
  await rejects(w.service.revoke({}, 'm1', 'c1'), 'UNAUTHENTICATED', 401);
});

test('profile returns the courier own record and rejects non-courier roles', async () => {
  const w = world();
  seedCourier(w);
  const view = await w.service.profile(COURIER);
  assert.deepEqual(view, { courierId: 'c1', name: 'Ana Lopez', vehicleType: 'MOTO', verificationStatus: 'VERIFIED',
    status: 'ACTIVE', maxActiveTasks: 1 });
  await rejects(w.service.profile(STAFF), 'COURIER_FORBIDDEN', 403);
  await rejects(w.service.profile(CUSTOMER), 'COURIER_FORBIDDEN', 403);
  await rejects(w.service.profile(OTHER_COURIER), 'COURIER_NOT_FOUND', 404);
});

test('affiliations list the courier own merchants with status and skip merchants that no longer exist', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w, { id: 'a1', merchantId: 'm1', canTakeOwnOrders: true });
  seedAffiliation(w, { id: 'a2', merchantId: 'm2', status: 'REVOKED' });
  seedAffiliation(w, { id: 'a3', merchantId: 'm-gone' });
  const { items } = await w.service.affiliations(COURIER);
  assert.deepEqual(items, [
    { affiliationId: 'a1', merchantId: 'm1', merchantName: 'Taqueria Centro', status: 'ACTIVE', canTakeOwnOrders: true },
    { affiliationId: 'a2', merchantId: 'm2', merchantName: 'Ferreteria Norte', status: 'REVOKED', canTakeOwnOrders: false },
  ]);
  // A courier with no record gets 404, the same as profile(), never another courier's affiliations.
  await rejects(w.service.affiliations(OTHER_COURIER), 'COURIER_NOT_FOUND', 404);
});

test('an owner affiliates a verified courier; own-order dispatch is off by default', async () => {
  const w = world();
  seedCourier(w);
  const view = await w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1' });
  assert.deepEqual(Object.keys(view).sort(), ['affiliationId', 'canTakeOwnOrders', 'merchantId', 'merchantName', 'status']);
  assert.equal(view.merchantId, 'm1');
  assert.equal(view.merchantName, 'Taqueria Centro');
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.canTakeOwnOrders, false);
  assert.equal(w.affiliations.size, 1);
});

test('canTakeOwnOrders is stored only when the merchant asks for it', async () => {
  const w = world();
  seedCourier(w);
  const view = await w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1', canTakeOwnOrders: true });
  assert.equal(view.canTakeOwnOrders, true);
});

test('affiliation is denied to other merchants, to staff without ownership and to customers', async () => {
  const w = world();
  seedCourier(w);
  await rejects(w.service.affiliate(OWNER_M1, 'm2', { courierId: 'c1' }), 'MERCHANT_FORBIDDEN', 403);
  await rejects(w.service.affiliate(STAFF, 'm1', { courierId: 'c1' }), 'MERCHANT_FORBIDDEN', 403);
  await rejects(w.service.affiliate(CUSTOMER, 'm1', { courierId: 'c1' }), 'MERCHANT_FORBIDDEN', 403);
  assert.equal(w.affiliations.size, 0);
});

test('an admin can affiliate for any existing merchant, and an unknown merchant is 404', async () => {
  const w = world();
  seedCourier(w);
  assert.equal((await w.service.affiliate(ADMIN, 'm2', { courierId: 'c1' })).merchantName, 'Ferreteria Norte');
  await rejects(w.service.affiliate(ADMIN, 'm9', { courierId: 'c1' }), 'MERCHANT_NOT_FOUND', 404);
});

test('only verified, active couriers can be affiliated', async () => {
  const w = world();
  seedCourier(w, { verificationStatus: 'PENDING_VERIFICATION' });
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1' }), 'COURIER_NOT_VERIFIED', 422);
  w.couriers.set('c1', { ...w.couriers.get('c1'), verificationStatus: 'VERIFIED', status: 'SUSPENDED' });
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1' }), 'COURIER_SUSPENDED', 422);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'nope' }), 'COURIER_NOT_FOUND', 404);
  assert.equal(w.affiliations.size, 0);
});

test('an active affiliation cannot be duplicated, even when two requests race', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1' }), 'AFFILIATION_EXISTS', 409);
  // The lookup misses, as if the first insert had not committed yet. The unique pair still rejects the insert.
  const real = w.affiliationStore.findByPair;
  w.affiliationStore.findByPair = async () => null;
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1' }), 'AFFILIATION_EXISTS', 409);
  w.affiliationStore.findByPair = real;
  assert.equal(w.affiliations.size, 1);
});

test('a revoked affiliation is reactivated in place, keeping one row per courier and merchant', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w, { status: 'REVOKED' });
  const view = await w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1', canTakeOwnOrders: true });
  assert.equal(view.affiliationId, 'a1');
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.canTakeOwnOrders, true);
  assert.equal(w.affiliations.size, 1);
});

test('affiliate body is strict: unknown fields and wrong types are 422', async () => {
  const w = world();
  seedCourier(w);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1', status: 'ACTIVE' }), 'INVALID_AFFILIATION', 422);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', { courierId: 'c1', canTakeOwnOrders: 'yes' }), 'INVALID_AFFILIATION', 422);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', {}), 'INVALID_AFFILIATION', 422);
  await rejects(w.service.affiliate(OWNER_M1, 'm1', null), 'INVALID_AFFILIATION', 422);
});

test('an owner revokes an affiliation; the row stays as history and revoking twice is a no-op', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w, { canTakeOwnOrders: true });
  const first = await w.service.revoke(OWNER_M1, 'm1', 'c1');
  assert.equal(first.status, 'REVOKED');
  assert.equal(first.canTakeOwnOrders, false);
  assert.equal(w.affiliations.size, 1);
  const second = await w.service.revoke(OWNER_M1, 'm1', 'c1');
  assert.equal(second.status, 'REVOKED');
});

test('revoke is denied to other merchants and returns 404 for an unknown pair', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w);
  await rejects(w.service.revoke(OWNER_M2, 'm1', 'c1'), 'MERCHANT_FORBIDDEN', 403);
  await rejects(w.service.revoke(OWNER_M1, 'm1', 'c-unknown'), 'AFFILIATION_NOT_FOUND', 404);
  assert.equal(w.affiliations.get('a1').status, 'ACTIVE');
});

test('without ports every courier endpoint fails closed with 503', async () => {
  const none = createCouriersV1Service({});
  await rejects(none.apply(CUSTOMER, APPLICATION), 'COURIERS_UNAVAILABLE', 503);
  await rejects(none.profile(COURIER), 'COURIERS_UNAVAILABLE', 503);
  await rejects(none.affiliate(OWNER_M1, 'm1', { courierId: 'c1' }), 'COURIERS_UNAVAILABLE', 503);
});

function routes(options = {}) {
  const handlers = new Map();
  createRouter({
    Router: () => ({
      get: (p, fn) => handlers.set(`GET ${p}`, fn),
      post: (p, fn) => handlers.set(`POST ${p}`, fn),
      delete: (p, fn) => handlers.set(`DELETE ${p}`, fn),
    }),
    ...options,
  });
  return handlers;
}
async function call(handler, { params = {}, body } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  await handler({ params, body, headers: {} }, res);
  return res;
}

test('route: apply returns 201 with no-store; anonymous is 401', async () => {
  const w = world();
  const handlers = routes({ service: w.service, resolveActor: () => CUSTOMER });
  const created = await call(handlers.get('POST /couriers/apply'), { body: APPLICATION });
  assert.equal(created.statusCode, 201);
  assert.equal(created.headers['Cache-Control'], 'no-store');
  const anonymous = await call(routes({ service: w.service }).get('POST /couriers/apply'), { body: APPLICATION });
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.body.errorCode, 'UNAUTHENTICATED');
  assert.equal(anonymous.headers['Cache-Control'], 'no-store');
});

test('route: profile and affiliations are 200 for couriers and 403 for staff', async () => {
  const w = world();
  seedCourier(w);
  seedAffiliation(w);
  const asCourier = routes({ service: w.service, resolveActor: () => COURIER });
  assert.equal((await call(asCourier.get('GET /couriers/me/profile'))).statusCode, 200);
  const list = await call(asCourier.get('GET /couriers/me/affiliations'));
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.items[0].merchantName, 'Taqueria Centro');
  const asStaff = routes({ service: w.service, resolveActor: () => STAFF });
  const denied = await call(asStaff.get('GET /couriers/me/profile'));
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.errorCode, 'COURIER_FORBIDDEN');
});

test('route: affiliate and revoke map their codes and keep no-store', async () => {
  const w = world();
  seedCourier(w);
  const handlers = routes({ service: w.service, resolveActor: () => OWNER_M1 });
  const created = await call(handlers.get('POST /merchants/:id/couriers/affiliate'), { params: { id: 'm1' }, body: { courierId: 'c1' } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.headers['Cache-Control'], 'no-store');
  const duplicate = await call(handlers.get('POST /merchants/:id/couriers/affiliate'), { params: { id: 'm1' }, body: { courierId: 'c1' } });
  assert.equal(duplicate.statusCode, 409);
  const revoked = await call(handlers.get('DELETE /merchants/:id/couriers/affiliate/:courierId'), { params: { id: 'm1', courierId: 'c1' } });
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.body.status, 'REVOKED');
});

test('route: an owner of another merchant gets 403 and the default router fails closed with 503', async () => {
  const w = world();
  seedCourier(w);
  const asOther = routes({ service: w.service, resolveActor: () => OWNER_M2 });
  const denied = await call(asOther.get('POST /merchants/:id/couriers/affiliate'), { params: { id: 'm1' }, body: { courierId: 'c1' } });
  assert.equal(denied.statusCode, 403);
  const unconfigured = await call(routes({ resolveActor: () => COURIER }).get('GET /couriers/me/profile'));
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(unconfigured.body.errorCode, 'COURIERS_UNAVAILABLE');
});

test('route: unexpected store failures are 503 without leaking details', async () => {
  const w = world();
  seedCourier(w);
  w.courierStore.findByAccountId = async () => { throw new Error('connection to db-internal failed'); };
  const res = await call(routes({ service: w.service, resolveActor: () => COURIER }).get('GET /couriers/me/profile'));
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(res.body).includes('db-internal'), false);
});

test('the v1 couriers router is mounted under /api/marketplace/v1', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1',\s*require\('\.\/routes\/marketplace-couriers-v1\.routes'\)\(\)\)/);
});
