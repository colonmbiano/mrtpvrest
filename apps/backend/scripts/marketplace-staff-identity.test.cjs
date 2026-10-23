'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const forbidden = () => { throw new Error('Offline staff suite forbids network and external database access'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};

const jwt = require('jsonwebtoken');
const { createStaffActorResolver, StaffIdentityError } = require('../src/lib/marketplace-staff-identity');
const createOpsRouter = require('../src/routes/marketplace-ops-dispatch-v1.routes');
const createSettlementsRouter = require('../src/routes/marketplace-settlements-v1.routes');
const { createMarketplaceOpsDispatchService } = require('../src/lib/marketplace-ops-dispatch-v1');
const { createSettlementsV1Service } = require('../src/lib/marketplace-settlements-v1');
const NOW = new Date('2026-10-23T20:00:00.500Z');
const SECONDS = Math.floor(NOW.getTime() / 1000);
const SECRET = 'synthetic-offline-staff-key-not-a-real-credential';
const OPTIONS = { jwtSecret: () => SECRET, now: () => new Date(NOW) };
const STAFF = { id: 'staff-1', role: 'SUPER_ADMIN' };
const DISPATCH_PERMISSION = 'marketplace.dispatch.manage';
const resolver = options => createStaffActorResolver({ ...OPTIONS, ...options });
const sign = (claims = {}, options = {}) => jwt.sign(Object.fromEntries(Object.entries({
  userId: 'staff-1', role: 'SUPER_ADMIN', exp: SECONDS + 60, ...claims,
}).filter(([, value]) => value !== undefined)), SECRET, { algorithm: 'HS256', noTimestamp: true, ...options });
const bearer = token => ({ headers: { authorization: `Bearer ${token}` } });
const invalid = (status = 401, code = 'INVALID_STAFF_IDENTITY') => error =>
  error instanceof StaffIdentityError && error.statusCode === status && error.code === code;

function router(create, options = {}) {
  const handlers = new Map();
  create({ Router: () => ({ get: (path, handler) => handlers.set(`GET ${path}`, handler),
    post: (path, handler) => handlers.set(`POST ${path}`, handler) }), staffOptions: OPTIONS, ...options });
  return async (route, req = {}) => {
    const res = { statusCode: 200, headers: {}, set(key, value) { this.headers[key.toLowerCase()] = value; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    assert.ok(handlers.has(route));
    await handlers.get(route)({ headers: {}, params: { id: 'resource-1' }, query: {}, body: {}, ...req }, res);
    return res;
  };
}

test('offline guards reject all network transports and real persistence imports', () => {
  for (const work of [() => fetch('https://example.invalid'), () => require('node:net').connect(1, '127.0.0.1'),
    () => require('node:tls').connect(1), () => require('node:http').get('http://example.invalid'),
    () => require('node:https').request('https://example.invalid'), () => require('@mrtpvrest/database'),
    () => require('@prisma/client'), () => require('express'), () => require('dotenv')]) assert.throws(work, /Offline staff suite/);
});

test('anonymous requests stay anonymous; body, query and buyer/guest headers grant no staff identity', async () => {
  const resolve = resolver();
  assert.equal(await resolve({}), null);
  assert.equal(await resolve({ user: null, body: STAFF, query: STAFF,
    headers: { 'x-buyer-id': 'staff-1', 'x-guest-id': 'staff-1', 'x-role': 'SUPER_ADMIN' } }), null);
});

for (const role of ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DISPATCHER', 'CASHIER', 'MERCHANT_OWNER', 'SUPERVISOR', 'SUPPORT', 'FINANCE']) {
  test(`${role} resolves consistently from middleware and a verified HS256 token`, async () => {
    for (const req of [{ user: { ...STAFF, role } }, bearer(sign({ role }))]) {
      const actor = await resolver()(req);
      assert.deepEqual(actor, { id: 'staff-1', accountId: 'staff-1', roles: [role], permissions: [], isActive: true, isDevice: false });
    }
  });
}

test('roles are normalized and deduplicated without deriving permissions from a role', async () => {
  const actor = await resolver()({ user: { accountId: 'operator', roles: [' dispatcher ', 'DISPATCHER', 'manager'] } });
  assert.deepEqual(actor.roles, ['DISPATCHER', 'MANAGER']);
  assert.deepEqual(actor.permissions, []);
  assert.deepEqual((await resolver()({ user: { accountId: 'operator', roles: 'admin' } })).roles, ['ADMIN']);
});

for (const field of ['accountId', 'id', 'userId', 'sub']) {
  test(`${field} becomes both actor identifiers without accepting body aliases`, async () => {
    const actor = await resolver()({ user: { [field]: 'operator', role: 'ADMIN' }, body: { accountId: 'attacker' } });
    assert.equal(actor.accountId, 'operator'); assert.equal(actor.id, 'operator');
    const claims = { userId: undefined, [field]: 'operator' };
    const signed = await resolver()(bearer(sign(claims)));
    assert.equal(signed.id, 'operator'); assert.equal(signed.accountId, 'operator');
  });
}

test('accountId takes precedence and trusted merchant/tenant scopes are copied without PII', async () => {
  const source = { ...STAFF, accountId: 'account-1', permissions: [DISPATCH_PERMISSION, DISPATCH_PERMISSION],
    merchantIds: ['m1', 'm1'], tenantId: 't1', restaurantId: 'r1', locationId: null,
    email: 'private@example.invalid', phone: 'PRIVATE-PHONE', passwordHash: 'PRIVATE-HASH', accessToken: 'PRIVATE-TOKEN' };
  const before = structuredClone(source);
  const actor = await resolver()({ user: source, body: { merchantIds: ['foreign'], permissions: ['all'] } });
  assert.deepEqual(actor, { id: 'account-1', accountId: 'account-1', roles: ['SUPER_ADMIN'], permissions: [DISPATCH_PERMISSION],
    merchantIds: ['m1'], tenantId: 't1', restaurantId: 'r1', locationId: null, isActive: true, isDevice: false });
  assert.deepEqual(source, before);
  actor.permissions.push('new'); actor.roles.push('MANAGER'); actor.merchantIds.push('m2');
  assert.deepEqual(source, before);
});

test('JWT identity retains signed scopes and explicit permissions; request fields cannot override them', async () => {
  const actor = await resolver()({ ...bearer(sign({ role: 'MERCHANT_OWNER', merchantIds: ['m1'], tenantId: 't1',
    restaurantId: 'r1', locationId: 'l1', permissions: ['settlements.read'] })),
    query: { role: 'SUPER_ADMIN', merchantIds: ['m2'] }, body: { accountId: 'other', permissions: ['all'] } });
  assert.deepEqual(actor.roles, ['MERCHANT_OWNER']); assert.deepEqual(actor.merchantIds, ['m1']);
  assert.deepEqual(actor.permissions, ['settlements.read']); assert.equal(actor.tenantId, 't1');
  assert.equal(actor.restaurantId, 'r1'); assert.equal(actor.locationId, 'l1'); assert.equal(actor.accountId, 'staff-1');
});

test('middleware identity has precedence and does not require JWT configuration', async () => {
  const resolve = resolver({ jwtSecret: forbidden, verifyToken: forbidden, now: forbidden });
  assert.equal((await resolve({ user: STAFF, ...bearer('invalid') })).id, STAFF.id);
});

for (const patch of [{ isActive: false }, { isDevice: true }, { role: 'CUSTOMER' }, { role: 'BUYER' }, { role: 'COURIER' },
  { roles: [] }, { roles: ['SUPER_ADMIN', 'CUSTOMER'] }, { role: undefined }, { roles: [42] }]) {
  test(`invalid staff flags/roles fail closed: ${JSON.stringify(patch)}`, async () => {
    await assert.rejects(resolver()({ user: { ...STAFF, ...patch }, ...bearer(sign()) }), invalid());
    await assert.rejects(resolver()(bearer(sign(patch))), invalid());
  });
}

test('malformed middleware identities, identifiers, permissions and scopes are rejected', async () => {
  for (const user of [false, [], 'staff', {}, { ...STAFF, id: '' }, { ...STAFF, id: 1 }, { ...STAFF, id: ' padded ' },
    { ...STAFF, id: 'guest:operator' }, { ...STAFF, id: 'bad\nidentifier' }, { ...STAFF, id: 'x'.repeat(129) },
    { ...STAFF, permissions: {} }, { ...STAFF, permissions: [true] }, { ...STAFF, permissions: [''] },
    { ...STAFF, merchantIds: 'm1' }, { ...STAFF, merchantIds: [null] }, { ...STAFF, restaurantId: {} },
    { ...STAFF, tenantId: '' }, { ...STAFF, locationId: 1 }]) await assert.rejects(resolver()({ user }), invalid());
});

test('malformed Authorization headers never fall back to guest, body or query identity', async () => {
  for (const authorization of ['', null, [], ['Bearer a', 'Bearer b'], 'Basic a', 'Bearer', 'Bearer a b', 'Bearer  a',
    'Bearer a\n', `Bearer ${'a'.repeat(8193)}`]) {
    await assert.rejects(resolver()({ headers: { authorization, 'x-buyer-id': 'staff-1' }, body: STAFF, query: STAFF }), invalid());
  }
});

test('Bearer scheme is case-insensitive and an async trusted verifier may be injected', async () => {
  let received;
  const actor = await resolver({ jwtSecret: forbidden, verifyToken: async token => {
    received = token; return { ...STAFF, exp: SECONDS + 10 };
  } })({ headers: { authorization: 'bEaReR synthetic-verified-token' } });
  assert.equal(received, 'synthetic-verified-token'); assert.equal(actor.accountId, STAFF.id);
});

test('bad signatures, tampering, unsigned JWTs and HS384 JWTs are rejected', async () => {
  const valid = sign(); const parts = valid.split('.');
  parts[1] = Buffer.from(JSON.stringify({ userId: 'attacker', role: 'SUPER_ADMIN', exp: SECONDS + 60 })).toString('base64url');
  for (const token of ['garbage', parts.join('.'), jwt.sign({ userId: 'attacker', role: 'SUPER_ADMIN', exp: SECONDS + 60 }, 'wrong-secret'),
    jwt.sign({ userId: 'attacker', role: 'SUPER_ADMIN', exp: SECONDS + 60 }, null, { algorithm: 'none' }), sign({}, { algorithm: 'HS384' })]) {
    await assert.rejects(resolver()(bearer(token)), invalid());
  }
});

test('expired, boundary-expired, future-nbf and non-expiring JWTs are rejected', async () => {
  for (const patch of [{ exp: SECONDS - 1 }, { exp: SECONDS }, { exp: NOW.getTime() / 1000 }, { exp: undefined }, { nbf: SECONDS + 1 }]) {
    await assert.rejects(resolver()(bearer(sign(patch))), invalid());
  }
  assert.equal((await resolver()(bearer(sign({ nbf: SECONDS })))).id, STAFF.id);
});

test('custom verification cannot bypass required claims, expiry, nbf or actor validation', async () => {
  for (const claims of [null, [], 'text', STAFF, { ...STAFF, exp: String(SECONDS + 60) }, { ...STAFF, exp: Infinity },
    { ...STAFF, exp: SECONDS }, { ...STAFF, exp: SECONDS + 60, nbf: '0' }, { ...STAFF, exp: SECONDS + 60, nbf: SECONDS + 1 },
    { ...STAFF, exp: SECONDS + 60, isDevice: true }, { ...STAFF, exp: SECONDS + 60, permissions: {} }]) {
    await assert.rejects(resolver({ verifyToken: async () => claims })(bearer('fixture')), invalid());
  }
});

test('unconfigured auth and invalid clocks return controlled 503; verifier failures disclose no internal detail', async () => {
  await assert.rejects(resolver({ jwtSecret: () => undefined })(bearer(sign())), invalid(503, 'STAFF_AUTH_UNAVAILABLE'));
  for (const now of [() => new Date('invalid'), () => '2026-10-23']) {
    await assert.rejects(resolver({ now })(bearer(sign())), invalid(503, 'STAFF_AUTH_UNAVAILABLE'));
  }
  await assert.rejects(resolver({ verifyToken: () => { throw new Error('PRIVATE-KEY'); } })(bearer('fixture')),
    error => invalid()(error) && !error.message.includes('PRIVATE'));
});

const ROUTES = [
  [createOpsRouter, 'GET /dispatch', 'listDispatch'],
  [createOpsRouter, 'POST /dispatch/tasks/:id/reassign', 'reassign'],
  [createOpsRouter, 'POST /couriers/:id/approve', 'approveCourier'],
  [createSettlementsRouter, 'GET /merchant/settlements', 'listMerchantSettlements'],
  [createSettlementsRouter, 'POST /ops/orders/:id/refund', 'refundOrder'],
];
for (const [create, path, method] of ROUTES) {
  test(`${path}: default resolver passes normalized middleware and JWT actors to the service`, async () => {
    const calls = [];
    const api = router(create, { service: { [method]: async (...args) => { calls.push(args); return { ok: true }; } } });
    for (const req of [{ user: STAFF }, bearer(sign())]) {
      const res = await api(path, req);
      assert.equal(res.statusCode, method === 'refundOrder' ? 201 : 200);
      assert.deepEqual(calls.at(-1)[0], { id: STAFF.id, accountId: STAFF.id, roles: ['SUPER_ADMIN'], permissions: [], isActive: true, isDevice: false });
      assert.equal(res.headers['cache-control'], 'no-store');
    }
    assert.equal(calls.length, 2);
  });

  test(`${path}: invalid credentials return 401 and never reach the service`, async () => {
    const api = router(create, { service: { [method]: forbidden } });
    for (const req of [bearer('bad'), { user: { ...STAFF, isActive: false } }, { user: { ...STAFF, isDevice: true } }]) {
      const res = await api(path, req);
      assert.equal(res.statusCode, 401); assert.equal(res.body.errorCode, 'INVALID_STAFF_IDENTITY');
      assert.equal(res.headers['cache-control'], 'no-store');
    }
  });
}

for (const [create, path] of [[createOpsRouter, 'GET /dispatch'], [createSettlementsRouter, 'GET /merchant/settlements']]) {
  test(`${path}: missing credentials are 401; auth configuration failure is 503`, async () => {
    const absent = await router(create)(path);
    assert.equal(absent.statusCode, 401); assert.equal(absent.body.errorCode, 'UNAUTHENTICATED');
    const broken = await router(create, { staffOptions: { ...OPTIONS, jwtSecret: () => undefined } })(path, bearer(sign()));
    assert.equal(broken.statusCode, 503); assert.equal(broken.body.errorCode, 'STAFF_AUTH_UNAVAILABLE');
    assert.equal(broken.headers['cache-control'], 'no-store');
  });

  test(`${path}: explicit resolveActor injection still overrides the default bridge`, async () => {
    const actor = { accountId: 'custom', roles: ['ADMIN'] }; let received;
    const method = create === createOpsRouter ? 'listDispatch' : 'listMerchantSettlements';
    const api = router(create, { resolveActor: () => actor, service: { [method]: async value => { received = value; return {}; } } });
    assert.equal((await api(path, { user: false, ...bearer('invalid') })).statusCode, 200);
    assert.equal(received, actor);
  });
}

test('Ops retains role and explicit permission enforcement with default staff identities', async () => {
  let reads = 0;
  const api = router(createOpsRouter, { service: createMarketplaceOpsDispatchService({ taskStore: { list: async () => { reads++; return []; } } }) });
  for (const user of [{ id: 'dispatcher', role: 'DISPATCHER' }, { id: 'cashier', role: 'CASHIER', permissions: [DISPATCH_PERMISSION] },
    { id: 'admin', role: 'ADMIN' }]) assert.equal((await api('GET /dispatch', { user })).statusCode, 403);
  assert.equal(reads, 0);
  assert.equal((await api('GET /dispatch', { user: { id: 'dispatcher', role: 'DISPATCHER', permissions: [DISPATCH_PERMISSION] } })).statusCode, 200);
  assert.equal((await api('GET /dispatch', bearer(sign()))).statusCode, 200); assert.equal(reads, 2);
});

test('merchant scope from staff identity is enforced by settlements; foreign body/query scope grants no access', async () => {
  let reads = 0;
  const service = createSettlementsV1Service({ settlementStore: { listByMerchant: async () => { reads++; return []; } },
    ledgerStore: {}, orderStore: {}, outboxStore: {}, refundStore: {}, paymentGateway: {}, unitOfWork: {},
    merchantAccess: { canManage: async (actor, merchantId) => actor.roles.includes('MERCHANT_OWNER') && actor.merchantIds.includes(merchantId) } });
  const api = router(createSettlementsRouter, { service });
  const req = { ...bearer(sign({ role: 'MERCHANT_OWNER', merchantIds: ['m1'] })), query: { merchantId: 'm1' } };
  assert.equal((await api('GET /merchant/settlements', req)).statusCode, 200);
  const denied = await api('GET /merchant/settlements', { ...req, query: { merchantId: 'm2' }, body: { merchantIds: ['m2'], role: 'SUPER_ADMIN' } });
  assert.equal(denied.statusCode, 403); assert.equal(denied.body.errorCode, 'MERCHANT_FORBIDDEN'); assert.equal(reads, 1);
  const refund = await api('POST /ops/orders/:id/refund', req);
  assert.equal(refund.statusCode, 403); assert.equal(refund.body.errorCode, 'REFUND_FORBIDDEN');
});
