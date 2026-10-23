'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const forbidden = () => { throw new Error('Offline Ops suite forbids network and external database access'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};

const { createMarketplaceOpsDispatchService, MarketplaceOpsDispatchError } = require('../src/lib/marketplace-ops-dispatch-v1');
const createRouter = require('../src/routes/marketplace-ops-dispatch-v1.routes');
const NOW = new Date('2026-10-23T20:00:00.000Z');
const ADMIN = { id: 'ops-supervisor', role: 'SUPER_ADMIN', isActive: true };
const DISPATCHER = { id: 'ops-dispatcher', roles: ['DISPATCHER'], permissions: ['marketplace.dispatch.manage'], isActive: true };
const SUPERVISOR = { accountId: 'ops-approver', roles: ['SUPERVISOR'], permissions: ['marketplace.couriers.approve'], isActive: true };
const REASON = 'Averia de motocicleta; soporte coordina el relevo';
const clone = value => structuredClone(value);
const errorIs = (code, status) => error => error instanceof MarketplaceOpsDispatchError && error.code === code && error.statusCode === status;

function makeTask(id, patch = {}) {
  const assignment = { id: `a-${id}`, taskId: id, courierId: `courier-${id}`, source: 'SHARED', status: 'ACTIVE',
    payoutAmount: 37.45, currency: 'MXN', acceptedAt: new Date(NOW.getTime() - 60000), pickedUpAt: null,
    phone: 'PRIVATE-COURIER-PHONE', name: 'PRIVATE-COURIER-NAME' };
  return { id, orderId: `order-${id}`, merchantId: 'm1', restaurantId: 'r1', locationId: 'l1', status: 'ASSIGNED',
    dispatchMode: 'SHARED', deliveryPolicy: 'OWN_THEN_SHARED', attempts: 2, version: 0,
    currentAssignmentId: assignment.id, currentAssignment: assignment,
    payoutAmount: 37.45, currency: 'MXN', approvedPricing: { courierPayoutCents: 3745, feeCents: 4000, contractVersion: 3 },
    assignments: [{ id: `past-${id}`, taskId: id, courierId: 'past-courier', source: 'OWN', status: 'CANCELLED',
      payoutAmount: 37.45, currency: 'MXN', endReason: 'Motivo anterior' }, clone(assignment)],
    offers: [{ id: `pending-${id}`, taskId: id, status: 'OFFERED', payoutAmount: 37.45 },
      { id: `accepted-${id}`, taskId: id, status: 'ACCEPTED', payoutAmount: 37.45 }],
    auditTrail: [{ id: `audit-past-${id}`, reason: 'Motivo historico' }],
    readyAt: new Date(NOW.getTime() - 120000), pickedUpAt: null, selectedCourierId: 'old-selection',
    pickupPinHash: 'PRIVATE-PICKUP-HASH', deliveryPinHash: 'PRIVATE-DELIVERY-HASH',
    deliveryAddress: 'PRIVATE-DELIVERY-ADDRESS', trackingToken: 'PRIVATE-TOKEN', presence: { lat: 19.5, lng: -99.3 }, ...patch };
}

function fixture(options = {}) {
  let state = { tasks: new Map([
    ['t1', makeTask('t1')], ['t2', makeTask('t2', { status: 'OFFERING', currentAssignmentId: null, currentAssignment: null, assignments: [] })],
    ['t3', makeTask('t3', { status: 'DELIVERED', merchantId: 'm2', currentAssignmentId: null, currentAssignment: null, assignments: [] })],
    ['t4', makeTask('t4', { status: 'OFFERING', merchantId: 'm2', dispatchMode: 'OWN', currentAssignmentId: null, currentAssignment: null, assignments: [] })],
  ]), couriers: new Map([
    ['c1', { id: 'c1', accountId: 'account-c1', status: 'ACTIVE', verificationStatus: 'PENDING_VERIFICATION', maxActiveTasks: 1,
      phone: 'PRIVATE-PHONE', email: 'PRIVATE-EMAIL', auditTrail: [] }],
    ['c2', { id: 'c2', status: 'ACTIVE', verificationStatus: 'VERIFIED', version: 3, auditTrail: [] }],
  ]) };
  let queued = Promise.resolve(); let auditSequence = 0;
  const calls = []; const hooks = {}; const transactions = new WeakMap();
  function draft(tx) { assert.ok(transactions.has(tx), 'Exact active transaction required'); return transactions.get(tx); }
  async function call(name, args) { calls.push({ name, args }); if (hooks[name]) await hooks[name](args); }
  const unitOfWork = { async run(work) {
    const previous = queued; let release;
    queued = new Promise(resolve => { release = resolve; }); await previous;
    const tx = {}; const staged = clone(state); transactions.set(tx, staged); calls.push({ name: 'transaction' });
    try {
      const result = await work(tx); if (hooks.commit) await hooks.commit(); state = staged; return result;
    } finally { transactions.delete(tx); release(); }
  } };
  const taskStore = {
    async list(args) {
      await call('task.list', args);
      return clone([...state.tasks.values()].filter(row => (!args.afterId || row.id > args.afterId)
        && Object.entries(args.filters).every(([key, value]) => row[key] === value))
        .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, args.limit));
    },
    async findById(id, { tx }) { await call('task.find', { id, tx }); return clone(draft(tx).tasks.get(id) ?? null); },
    async compareAndSwap(tx, args) {
      await call('task.cas', args); const tasks = draft(tx).tasks; const old = tasks.get(args.id);
      if (hooks.taskLose || (old?.version ?? 0) !== args.expectedVersion || old?.status !== args.expectedStatus) return { count: 0 };
      assert.deepEqual(args.record.auditTrail.slice(0, -1), old.auditTrail ?? [], 'Audit must be append-only');
      tasks.set(args.id, clone(args.record)); if (hooks.afterTaskCAS) await hooks.afterTaskCAS(); return { count: 1 };
    },
  };
  const courierStore = {
    async findById(id, { tx }) { await call('courier.find', { id, tx }); return clone(draft(tx).couriers.get(id) ?? null); },
    async compareAndSwap(tx, args) {
      await call('courier.cas', args); const couriers = draft(tx).couriers; const old = couriers.get(args.id);
      if (hooks.courierLose || (old?.version ?? 0) !== args.expectedVersion || old?.status !== args.expectedStatus
        || old?.verificationStatus !== args.expectedVerificationStatus) return { count: 0 };
      assert.deepEqual(args.record.auditTrail.slice(0, -1), old.auditTrail ?? []);
      couriers.set(args.id, clone(args.record)); if (hooks.afterCourierCAS) await hooks.afterCourierCAS(); return { count: 1 };
    },
  };
  const ports = { taskStore, courierStore, unitOfWork, now: () => NOW, newId: () => `audit-${++auditSequence}` };
  const service = createMarketplaceOpsDispatchService({ ...ports, ...options });
  return { service, ports, calls, hooks, get state() { return state; },
    list: (query = {}, actor = ADMIN) => service.listDispatch(actor, query),
    reassign: (body = { reason: REASON }, actor = ADMIN, taskId = 't1') => service.reassign(actor, taskId, body),
    approve: (body = {}, actor = ADMIN, courierId = 'c1') => service.approveCourier(actor, courierId, body) };
}

function http(f, options = {}) {
  const routes = new Map();
  createRouter({ Router: () => ({ get: (route, fn) => routes.set(`GET ${route}`, fn), post: (route, fn) => routes.set(`POST ${route}`, fn) }),
    service: f?.service, resolveActor: () => ADMIN, ...options });
  return { routes, async request(method, route, { params = { id: 't1' }, body = {}, query = {}, ...req } = {}) {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await routes.get(`${method} ${route}`)({ params, body, query, ...req }, res); return res;
  } };
}

test('offline guards block sockets, HTTP, fetch and real database imports', () => {
  assert.throws(() => fetch('https://example.invalid'), /Offline Ops/);
  assert.throws(() => require('node:net').connect(1, '127.0.0.1'), /Offline Ops/);
  assert.throws(() => require('node:http').request('http://127.0.0.1'), /Offline Ops/);
  assert.throws(() => require('@mrtpvrest/database'), /Offline Ops/);
});

test('SUPER_ADMIN lists global tasks with stable pagination and no duplicate or skipped IDs', async () => {
  const f = fixture(); const first = await f.list({ limit: '2' });
  assert.deepEqual(first.items.map(row => row.id), ['t1', 't2']); assert.ok(first.nextCursor);
  const second = await f.list({ limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(row => row.id), ['t3', 't4']); assert.equal(second.nextCursor, null);
  assert.equal(f.calls[0].args.limit, 3); assert.equal(f.calls[1].args.afterId, 't2');
});

test('status, merchantId and dispatchMode filters are combined and limit defaults to 50', async () => {
  const f = fixture(); const result = await f.list({ status: 'OFFERING', merchantId: 'm2', dispatchMode: 'OWN' });
  assert.deepEqual(result.items.map(row => row.id), ['t4']); assert.equal(f.calls[0].args.limit, 51);
  assert.equal((await f.list({ merchantId: 'absent' })).items.length, 0);
});

test('authorized dispatcher may list and reassign globally but cannot approve couriers', async () => {
  const f = fixture(); assert.equal((await f.list({}, DISPATCHER)).items.length, 4);
  assert.equal((await f.reassign({ reason: REASON }, DISPATCHER)).task.status, 'REASSIGNING');
  await assert.rejects(f.approve({}, DISPATCHER), errorIs('OPS_FORBIDDEN', 403));
});

test('courier approval is a distinct supervisor permission', async () => {
  const f = fixture(); assert.equal((await f.approve({}, SUPERVISOR)).verificationStatus, 'VERIFIED');
  await assert.rejects(f.list({}, SUPERVISOR), errorIs('OPS_FORBIDDEN', 403));
  const unauthorized = { ...DISPATCHER, permissions: ['marketplace.couriers.approve'] };
  await assert.rejects(f.approve({}, unauthorized), errorIs('OPS_FORBIDDEN', 403));
});

for (const [label, actor, status] of [['anonymous', null, 401], ['inactive', { ...ADMIN, isActive: false }, 401],
  ['device', { ...ADMIN, isDevice: true }, 401], ['missing identity', { ...ADMIN, id: '' }, 401],
  ['merchant owner', { ...ADMIN, role: 'OWNER' }, 403], ['restaurant admin', { ...ADMIN, role: 'ADMIN' }, 403],
  ['courier', { ...ADMIN, role: 'COURIER' }, 403], ['dispatcher without grant', { ...DISPATCHER, permissions: [] }, 403]]) {
  test(`${label} cannot access Ops data or mutations`, async () => {
    const f = fixture();
    for (const operation of [() => f.list({}, actor), () => f.reassign({ reason: REASON }, actor), () => f.approve({}, actor)]) {
      await assert.rejects(operation(), errorIs(status === 401 ? 'UNAUTHENTICATED' : 'OPS_FORBIDDEN', status));
    }
    assert.equal(f.calls.length, 0);
  });
}

test('list projection excludes PINs, tokens, GPS, contact information, audit and assignment history', async () => {
  const f = fixture(); const result = await f.list(); const encoded = JSON.stringify(result);
  assert.equal(encoded.includes('PRIVATE'), false); assert.equal(encoded.includes('approvedPricing'), false);
  assert.equal(encoded.includes('auditTrail'), false); assert.equal(encoded.includes('assignments'), false);
  assert.deepEqual(Object.keys(result.items[0]).sort(), ['id', 'orderId', 'merchantId', 'status', 'dispatchMode', 'attempts',
    'currentAssignment', 'readyAt', 'pickedUpAt', 'version'].sort());
  assert.equal(result.items[0].readyAt, new Date(NOW.getTime() - 120000).toISOString());
});

test('invalid filters, unknown fields, abusive limits and malformed cursors fail before store access', async () => {
  const f = fixture();
  for (const query of [null, [], { status: 'ANY' }, { status: ['ASSIGNED'] }, { dispatchMode: 'ALL' }, { merchantId: '' },
    { courierId: 'other' }, { role: 'SUPER_ADMIN' }, { limit: 0 }, { limit: -1 }, { limit: 101 }, { limit: 1.5 }, { limit: '1e2' },
    { limit: '01' }, { limit: [] }, { cursor: 'bad' }, { cursor: '../../x' }]) await assert.rejects(f.list(query));
  assert.equal(f.calls.length, 0);
});

test('cursor is bound to filters but allows a new page size', async () => {
  const f = fixture(); const first = await f.list({ limit: 1, merchantId: 'm1' });
  assert.ok(first.nextCursor);
  await assert.rejects(f.list({ cursor: first.nextCursor, merchantId: 'm2' }), errorIs('INVALID_CURSOR', 422));
  const second = await f.list({ cursor: first.nextCursor, merchantId: 'm1', limit: 10 });
  assert.deepEqual(second.items.map(row => row.id), ['t2']);
});

test('invalid adapter pages cannot bypass filter matching, uniqueness or bounded page size', async () => {
  for (const list of [async () => [makeTask('b'), makeTask('a')], async () => [makeTask('a'), makeTask('a')],
    async () => [makeTask('a', { merchantId: 'foreign' })], async () => Array.from({ length: 52 }, (_, i) => makeTask(`t-${i}`))]) {
    const f = fixture({ taskStore: { list } }); await assert.rejects(f.list({ merchantId: 'm1' }), errorIs('OPS_STORE_INTEGRITY', 503));
  }
});

test('reassignment cancels the active contract, expires pending offers, increments attempts and writes traceable audit', async () => {
  const f = fixture(); const before = clone(f.state.tasks.get('t1')); const result = await f.reassign({ reason: REASON, expectedVersion: 0 });
  const task = f.state.tasks.get('t1'); assert.equal(result.task.status, 'REASSIGNING'); assert.equal(task.attempts, 3);
  assert.equal(task.version, 1); assert.equal(task.currentAssignment, null); assert.equal(task.currentAssignmentId, null); assert.equal(task.selectedCourierId, null);
  assert.deepEqual(task.assignments[0], before.assignments[0]);
  const old = task.assignments.find(row => row.id === before.currentAssignmentId);
  assert.equal(old.status, 'REASSIGNED'); assert.equal(old.endReason, REASON); assert.equal(old.endedBy, ADMIN.id); assert.equal(old.endedAt, NOW.toISOString());
  assert.equal(old.payoutAmount, before.currentAssignment.payoutAmount); assert.equal(old.currency, before.currentAssignment.currency);
  assert.equal(task.offers[0].status, 'EXPIRED'); assert.equal(task.offers[1].status, 'ACCEPTED');
  assert.deepEqual(task.approvedPricing, before.approvedPricing); assert.equal(task.payoutAmount, before.payoutAmount); assert.equal(task.currency, before.currency);
  assert.deepEqual(task.auditTrail.slice(0, -1), before.auditTrail);
  const audit = task.auditTrail.at(-1);
  assert.equal(audit.action, 'TASK_REASSIGNED'); assert.equal(audit.actorId, ADMIN.id); assert.equal(audit.reason, REASON);
  assert.equal(audit.taskId, 't1'); assert.equal(audit.orderId, before.orderId); assert.equal(audit.previousAssignmentId, old.id);
  assert.equal(audit.previousVersion, 0); assert.equal(audit.nextVersion, 1); assert.equal(audit.at, NOW.toISOString()); assert.equal(result.auditId, audit.id);
});

test('a task without an assigned courier may restart dispatch and retain prior history', async () => {
  const f = fixture(); const result = await f.reassign({ reason: REASON }, ADMIN, 't2');
  assert.equal(result.task.status, 'REASSIGNING'); assert.equal(f.state.tasks.get('t2').auditTrail.at(-1).previousAssignmentId, null);
});

test('planner may choose OFFERING before pickup, while all financial and policy fields remain server-owned', async () => {
  const f = fixture({ dispatchEngine: { prepareReassignment({ task }) {
    task.approvedPricing.courierPayoutCents = 0; // Planner cannot mutate the authoritative snapshot.
    return { status: 'OFFERING', payoutAmount: 0, currency: 'USD', dispatchMode: 'OWN' };
  } } });
  await f.reassign(); const task = f.state.tasks.get('t1');
  assert.equal(task.status, 'OFFERING'); assert.equal(task.payoutAmount, 37.45); assert.equal(task.currency, 'MXN');
  assert.equal(task.approvedPricing.courierPayoutCents, 3745); assert.equal(task.dispatchMode, 'SHARED'); assert.equal(task.deliveryPolicy, 'OWN_THEN_SHARED');
});

test('post-pickup reassignment retains custody evidence and stays REASSIGNING', async () => {
  const f = fixture(); const task = f.state.tasks.get('t1');
  task.status = 'PICKED_UP'; task.pickedUpAt = new Date(NOW.getTime() - 1000); task.currentAssignment.pickedUpAt = clone(task.pickedUpAt);
  const before = clone(task); await f.reassign(); const after = f.state.tasks.get('t1');
  assert.equal(after.status, 'REASSIGNING'); assert.deepEqual(after.pickedUpAt, before.pickedUpAt);
  assert.deepEqual(after.assignments.find(row => row.id === before.currentAssignmentId).pickedUpAt, before.currentAssignment.pickedUpAt);
});

test('post-pickup tasks cannot be automatically reopened as OFFERING by a planner', async () => {
  const f = fixture({ dispatchEngine: { prepareReassignment: () => ({ status: 'OFFERING' }) } });
  f.state.tasks.get('t1').status = 'PICKED_UP'; const before = clone(f.state);
  await assert.rejects(f.reassign(), errorIs('INVALID_DISPATCH_PLAN', 503)); assert.deepEqual(f.state, before);
});

for (const status of ['DELIVERED', 'CANCELLED', 'WAITING_READY']) {
  test(`${status} cannot be reassigned and produces no mutation/audit`, async () => {
    const f = fixture(); f.state.tasks.get('t1').status = status; const before = clone(f.state);
    await assert.rejects(f.reassign(), errorIs('TASK_NOT_REASSIGNABLE', 409)); assert.deepEqual(f.state, before);
    assert.equal(f.calls.some(call => call.name === 'task.cas'), false);
  });
}

test('a failed task may be explicitly recovered by Ops with a new audited attempt', async () => {
  const f = fixture(); f.state.tasks.get('t1').status = 'FAILED'; await f.reassign();
  assert.equal(f.state.tasks.get('t1').status, 'REASSIGNING'); assert.equal(f.state.tasks.get('t1').auditTrail.at(-1).previousStatus, 'FAILED');
});

test('required reason, versions and mass-assignment protections reject invalid mutation bodies', async () => {
  const f = fixture();
  for (const body of [undefined, null, [], {}, { reason: '' }, { reason: ' ' }, { reason: 'x'.repeat(501) }, { reason: 1 },
    { reason: REASON, expectedVersion: -1 }, { reason: REASON, expectedVersion: '0' }, { reason: REASON, expectedVersion: 0.5 },
    { reason: REASON, payoutAmount: 0 }, { reason: REASON, status: 'OFFERING' }, { reason: REASON, actorId: 'fake' },
    { reason: REASON, courierId: 'fake' }]) {
    await assert.rejects(f.service.reassign(ADMIN, 't1', body));
  }
  assert.equal(f.calls.length, 0);
});

test('CAS rejects stale versions and concurrent operator commands have one winner', async () => {
  const f = fixture(); const secondService = createMarketplaceOpsDispatchService(f.ports);
  const results = await Promise.allSettled([f.reassign({ reason: REASON, expectedVersion: 0 }),
    secondService.reassign(DISPATCHER, 't1', { reason: 'Segundo operador', expectedVersion: 0 })]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.statusCode, 409);
  assert.equal(f.state.tasks.get('t1').attempts, 3); assert.equal(f.state.tasks.get('t1').auditTrail.length, 2);
});

test('losing task CAS cannot leave a cancelled assignment, expired offer or audit behind', async () => {
  const f = fixture(); f.hooks.taskLose = true; const before = clone(f.state);
  await assert.rejects(f.reassign(), errorIs('OPS_CONFLICT', 409)); assert.deepEqual(f.state, before);
});

for (const hook of ['task.cas', 'afterTaskCAS', 'commit']) {
  test(`task mutation rolls back when ${hook} fails and may then be retried`, async () => {
    const f = fixture(); const before = clone(f.state); f.hooks[hook] = () => { throw new Error('Synthetic persistence failure'); };
    await assert.rejects(f.reassign(), /Synthetic/); assert.deepEqual(f.state, before);
    delete f.hooks[hook]; await f.reassign(); assert.equal(f.state.tasks.get('t1').attempts, 3);
  });
}

test('corrupt active history, duplicate assignments or foreign offers fail closed without partial writes', async () => {
  for (const mutate of [t => { t.assignments.push({ id: 'unexpected', taskId: t.id, status: 'ACTIVE' }); },
    t => { t.assignments.push(clone(t.assignments[0])); }, t => { t.offers[0].taskId = 'foreign'; },
    t => { t.currentAssignment.taskId = 'foreign'; }, t => { t.attempts = -1; }, t => { t.auditTrail = {}; }, t => { t.version = '0'; }]) {
    const f = fixture(); mutate(f.state.tasks.get('t1')); const before = clone(f.state);
    await assert.rejects(f.reassign(), errorIs('OPS_STORE_INTEGRITY', 503)); assert.deepEqual(f.state, before);
  }
});

test('courier approval verifies a pending application and persists supervisor audit atomically', async () => {
  const f = fixture(); const before = clone(f.state.couriers.get('c1')); const result = await f.approve({}, SUPERVISOR);
  const courier = f.state.couriers.get('c1');
  assert.equal(result.verificationStatus, 'VERIFIED'); assert.equal(result.status, 'ACTIVE'); assert.equal(result.version, 1);
  assert.equal(result.idempotent, false); assert.equal(courier.verifiedAt, NOW.toISOString()); assert.equal(courier.verifiedBy, SUPERVISOR.accountId);
  assert.equal(courier.maxActiveTasks, before.maxActiveTasks); assert.equal(courier.accountId, before.accountId);
  assert.equal(courier.auditTrail[0].actorId, SUPERVISOR.accountId); assert.equal(courier.auditTrail[0].action, 'COURIER_APPROVED');
  assert.equal(courier.auditTrail[0].previousVerificationStatus, 'PENDING_VERIFICATION');
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});

test('approval is idempotent for an already verified active courier without another audit', async () => {
  const f = fixture(); await f.approve(); const before = clone(f.state); const result = await f.approve();
  assert.equal(result.idempotent, true); assert.deepEqual(f.state, before);
});

test('suspended, rejected, banned or disabled couriers cannot be reactivated by approval', async () => {
  for (const patch of [{ status: 'SUSPENDED' }, { status: 'BANNED' }, { status: 'DISABLED' },
    { verificationStatus: 'REJECTED' }, { status: 'SUSPENDED', verificationStatus: 'VERIFIED' }]) {
    const f = fixture(); Object.assign(f.state.couriers.get('c1'), patch); const before = clone(f.state);
    await assert.rejects(f.approve(), errorIs('COURIER_NOT_PENDING', 409)); assert.deepEqual(f.state, before);
  }
});

test('courier approval rejects caller status, verification, actor and credential fields', async () => {
  const f = fixture();
  for (const body of [null, [], { status: 'ACTIVE' }, { verificationStatus: 'VERIFIED' }, { verifiedBy: 'fake' },
    { accessToken: 'fake' }, { expectedVersion: -1 }]) await assert.rejects(f.approve(body));
  assert.equal(f.calls.length, 0);
});

test('courier CAS uses status and verification as well as version and losing it leaves no audit', async () => {
  const f = fixture(); const before = clone(f.state); f.hooks.courierLose = true;
  await assert.rejects(f.approve(), errorIs('OPS_CONFLICT', 409)); assert.deepEqual(f.state, before);
  const args = f.calls.find(call => call.name === 'courier.cas').args;
  assert.equal(args.expectedStatus, 'ACTIVE'); assert.equal(args.expectedVerificationStatus, 'PENDING_VERIFICATION'); assert.equal(args.expectedVersion, 0);
});

test('concurrent approvals with one expected version have exactly one writer', async () => {
  const f = fixture(); const results = await Promise.allSettled([f.approve({ expectedVersion: 0 }), f.approve({ expectedVersion: 0 }, SUPERVISOR)]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.statusCode, 409); assert.equal(f.state.couriers.get('c1').auditTrail.length, 1);
});

for (const hook of ['courier.cas', 'afterCourierCAS', 'commit']) {
  test(`courier approval rolls back status and audit when ${hook} fails`, async () => {
    const f = fixture(); const before = clone(f.state); f.hooks[hook] = () => { throw new Error('Synthetic approval failure'); };
    await assert.rejects(f.approve(), /Synthetic/); assert.deepEqual(f.state, before);
  });
}

test('missing tasks and couriers return 404 and missing adapters return controlled 503', async () => {
  const f = fixture(); await assert.rejects(f.reassign({ reason: REASON }, ADMIN, 'absent'), errorIs('TASK_NOT_FOUND', 404));
  await assert.rejects(f.approve({}, ADMIN, 'absent'), errorIs('COURIER_NOT_FOUND', 404));
  const service = createMarketplaceOpsDispatchService();
  await assert.rejects(service.listDispatch(ADMIN), errorIs('OPS_UNAVAILABLE', 503));
  await assert.rejects(service.reassign(ADMIN, 't1', { reason: REASON }), errorIs('OPS_UNAVAILABLE', 503));
  await assert.rejects(service.approveCourier(ADMIN, 'c1'), errorIs('OPS_UNAVAILABLE', 503));
});

test('invalid clocks, audit IDs and planner results cannot leave a mutation', async () => {
  for (const options of [{ now: () => new Date('invalid') }, { newId: () => '' },
    { dispatchEngine: { prepareReassignment: () => ({ status: 'DELIVERED' }) } },
    { dispatchEngine: { prepareReassignment: () => { throw new Error('planner failed'); } } }]) {
    const f = fixture(options); const before = clone(f.state); await assert.rejects(f.reassign()); assert.deepEqual(f.state, before);
  }
});

test('HTTP routes register the exact Ops paths and set no-store on every result', async () => {
  const f = fixture(); const api = http(f);
  assert.deepEqual([...api.routes.keys()], ['GET /dispatch', 'POST /dispatch/tasks/:id/reassign', 'POST /couriers/:id/approve']);
  const list = await api.request('GET', '/dispatch', { query: { limit: '1' } }); assert.equal(list.statusCode, 200); assert.equal(list.body.items.length, 1);
  const reassigned = await api.request('POST', '/dispatch/tasks/:id/reassign', { body: { reason: REASON } }); assert.equal(reassigned.statusCode, 200);
  const approved = await api.request('POST', '/couriers/:id/approve', { params: { id: 'c1' } }); assert.equal(approved.statusCode, 200);
  for (const res of [list, reassigned, approved]) assert.equal(res.headers['cache-control'], 'no-store');
});

test('HTTP default actor resolution ignores client roles and staff req.user', async () => {
  const f = fixture(); const api = http(f, { resolveActor: undefined });
  const res = await api.request('POST', '/dispatch/tasks/:id/reassign', { user: ADMIN, body: { reason: REASON, role: 'SUPER_ADMIN' }, query: { role: 'SUPER_ADMIN' } });
  assert.equal(res.statusCode, 401); assert.equal(res.body.errorCode, 'UNAUTHENTICATED'); assert.equal(f.calls.length, 0);
});

test('HTTP reports 403, 404, 409, 422 and generic 503 without leaking adapter details', async () => {
  const f = fixture(); const api = http(f);
  assert.equal((await http(f, { resolveActor: () => ({ ...ADMIN, role: 'COURIER' }) }).request('GET', '/dispatch')).statusCode, 403);
  assert.equal((await api.request('POST', '/couriers/:id/approve', { params: { id: 'missing' } })).statusCode, 404);
  assert.equal((await api.request('POST', '/dispatch/tasks/:id/reassign', { params: { id: 't3' }, body: { reason: REASON } })).statusCode, 409);
  assert.equal((await api.request('POST', '/dispatch/tasks/:id/reassign', { body: {} })).statusCode, 422);
  f.hooks['task.list'] = () => { throw new Error('PRIVATE database credential'); };
  const res = await api.request('GET', '/dispatch'); assert.equal(res.statusCode, 503); assert.equal(JSON.stringify(res.body).includes('PRIVATE'), false);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('HTTP maps database concurrency failures to 409 without replaying a forced action', async () => {
  const f = fixture(); f.hooks['task.cas'] = () => { throw Object.assign(new Error('private conflict'), { code: 'P2034' }); };
  const res = await http(f).request('POST', '/dispatch/tasks/:id/reassign', { body: { reason: REASON } });
  assert.equal(res.statusCode, 409); assert.equal(res.body.errorCode, 'OPS_CONFLICT');
  assert.equal(f.calls.filter(call => call.name === 'task.cas').length, 1); assert.equal(f.state.tasks.get('t1').attempts, 2);
});

test('default mounted router is closed without configured identity and persistence adapters', async () => {
  assert.equal((await http(undefined, { resolveActor: undefined }).request('GET', '/dispatch')).statusCode, 401);
  const api = http(undefined);
  assert.equal((await api.request('GET', '/dispatch')).statusCode, 503);
});

test('Ops router mounts before the legacy marketplace without initializing the app', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/index.js'), 'utf8');
  const mount = source.indexOf("app.use('/api/marketplace/v1/ops', require('./routes/marketplace-ops-dispatch-v1.routes')())");
  assert.ok(mount > 0); assert.ok(mount < source.indexOf("app.use('/api/marketplace',"));
});
