import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const forbidden = () => { throw new Error('Offline policy suite forbids network and external persistence'); };
globalThis.fetch = forbidden;
require('node:net').Socket.prototype.connect = forbidden;
require('node:tls').connect = forbidden;
for (const name of ['node:http', 'node:https']) { require(name).request = forbidden; require(name).get = forbidden; }
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (['@mrtpvrest/database', '@prisma/client', 'express', 'dotenv', 'pg'].includes(id)) forbidden();
  return originalLoad.call(this, id, ...args);
};
const ts = require('typescript');
const source = readFileSync(new URL('../lib/marketplaceDeliveryPolicy.ts', import.meta.url), 'utf8');
const transpiled = ts.transpileModule(source, { fileName: 'marketplaceDeliveryPolicy.ts', reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
assert.equal((transpiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
const sandboxModule = { exports: {} };
vm.runInNewContext(transpiled.outputText, { module: sandboxModule, exports: sandboxModule.exports, require: forbidden, fetch: forbidden });
const { createPolicyEditor, policyPayload, initialPolicyState, DELIVERY_POLICIES } = sandboxModule.exports;
const { fixture, admin } = require('../../backend/scripts/helpers/marketplace-dispatch-fixture.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const CONFIG = { merchantId: 'marketplace-merchant-1', deliveryPolicy: 'OWN_THEN_SHARED', fallbackSeconds: 30, maxDistanceKm: 10 };
const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const httpError = status => Object.assign(new Error('PRIVATE-ADAPTER-DETAIL'), { response: { status } });
function harness() {
  let scope = 'r1:l1'; const calls = []; const changes = [];
  let watch = () => {};
  let read = async () => ({ data: { ...CONFIG } });
  let write = async (url, payload) => ({ data: { merchantId: CONFIG.merchantId, ...payload } });
  const editor = createPolicyEditor({ getScope: () => scope, onChange: state => { changes.push(plain(state)); watch(state); }, api: {
    get: async url => { calls.push({ method: 'GET', url }); return read(url); },
    put: async (url, payload) => { calls.push({ method: 'PUT', url, payload: plain(payload) }); return write(url, payload); },
  } });
  return { editor, calls, changes, state: () => editor.getState(), scope: value => { scope = value; }, watch: callback => { watch = callback; },
    read: handler => { read = handler; }, write: handler => { write = handler; } };
}

test('offline guards block sockets, HTTP, fetch and persistence imports', () => {
  for (const work of [() => fetch('https://example.invalid'), () => require('node:net').connect(1, '127.0.0.1'),
    () => require('node:https').request('https://example.invalid'), () => require('@mrtpvrest/database')]) assert.throws(work, /Offline policy suite/);
});

test('initial form has 30 seconds and 10 km but cannot save before a successful load', async () => {
  const state = initialPolicyState(); assert.equal(state.draft.fallbackSeconds, '30'); assert.equal(state.draft.maxDistanceKm, '10');
  const h = harness(); assert.equal(await h.editor.save(), false); assert.equal(h.calls.length, 0);
  h.editor.setField('fallbackSeconds', '999'); assert.equal(h.state().draft.fallbackSeconds, '30');
});

test('selector exposes exactly the four supported policies', () => {
  assert.deepEqual(plain(DELIVERY_POLICIES.map(row => row.value)), ['OWN_ONLY', 'SHARED_ONLY', 'OWN_THEN_SHARED', 'MANUAL']);
});

for (const policy of ['OWN_ONLY', 'SHARED_ONLY', 'OWN_THEN_SHARED', 'MANUAL']) {
  test(`${policy}: loads the private branch config and PUTs only the three policy fields`, async () => {
    const h = harness(); h.read(async () => ({ data: { ...CONFIG, deliveryPolicy: policy, fallbackSeconds: 0, maxDistanceKm: 2.75, ignored: 'PRIVATE' } }));
    await h.editor.load();
    assert.deepEqual(h.calls, [{ method: 'GET', url: '/api/marketplace/v1/merchants/me/delivery-policy' }]);
    assert.equal(h.state().merchantId, CONFIG.merchantId); assert.equal(h.state().loading, false);
    assert.deepEqual(plain(h.state().draft), { deliveryPolicy: policy, fallbackSeconds: '0', maxDistanceKm: '2.75' });
    h.editor.setField('fallbackSeconds', '45'); h.editor.setField('maxDistanceKm', '7.5');
    assert.equal(await h.editor.save(), true);
    assert.deepEqual(h.calls[1], { method: 'PUT', url: `/api/marketplace/v1/merchants/${CONFIG.merchantId}/delivery-policy`,
      payload: { deliveryPolicy: policy, fallbackSeconds: 45, maxDistanceKm: 7.5 } });
    assert.equal(h.state().saving, false); assert.match(h.state().message, /guardada/);
  });

  test(`${policy}: actual offline backend read/write round trip uses the Marketplace merchant ID`, async () => {
    const f = fixture(policy); const query = { user: { ...admin, locationId: 'l1' } }; const calls = [];
    const transport = async (method, route, options) => {
      const res = await f.request(method, route, { ...query, ...options });
      if (res.statusCode !== 200) throw httpError(res.statusCode);
      return { data: res.body };
    };
    const editor = createPolicyEditor({ getScope: () => 'r1:l1', onChange() {}, api: {
      get: url => { calls.push(url); return transport('GET', '/merchants/me/delivery-policy'); },
      put: (url, payload) => { calls.push(url); return transport('PUT', '/merchants/:id/delivery-policy', { params: { id: 'm1' }, body: payload }); },
    } });
    await editor.load(); assert.equal(editor.getState().merchantId, 'm1');
    assert.equal(editor.getState().draft.deliveryPolicy, policy);
    editor.setField('fallbackSeconds', '60'); editor.setField('maxDistanceKm', '12.25');
    assert.equal(await editor.save(), true); assert.ok(calls[1].endsWith('/merchants/m1/delivery-policy'));
    assert.equal(f.store.merchants.get('m1').fallbackSeconds, 60); assert.equal(f.store.merchants.get('m1').maxDistanceKm, 12.25);
    assert.equal(f.store.merchants.get('branch').fallbackSeconds, 30);
    await editor.load(); assert.equal(editor.getState().draft.fallbackSeconds, '60');
  });
}

test('payload accepts exact backend boundaries, fractional distance and zero fallback', () => {
  for (const fallbackSeconds of ['0', '3600']) for (const maxDistanceKm of ['0.0001', '.5', '100']) {
    const payload = policyPayload({ deliveryPolicy: 'OWN_THEN_SHARED', fallbackSeconds, maxDistanceKm });
    assert.equal(payload.fallbackSeconds, Number(fallbackSeconds)); assert.equal(payload.maxDistanceKm, Number(maxDistanceKm));
  }
});

test('invalid fields stay visible and never produce a PUT', async () => {
  for (const [field, values] of [['deliveryPolicy', ['', 'UNKNOWN']], ['fallbackSeconds', ['', '-1', '1.5', '3601', 'Infinity', '1e2', ' 30 ']],
    ['maxDistanceKm', ['', '0', '-1', '100.01', 'Infinity', 'NaN', '0x10', ' 10 ']]]) {
    for (const value of values) {
      const h = harness(); await h.editor.load(); h.editor.setField(field, value);
      assert.equal(await h.editor.save(), false); assert.ok(h.state().error); assert.equal(h.state().draft[field], value);
      assert.equal(h.calls.filter(row => row.method === 'PUT').length, 0);
    }
  }
});

test('malformed or partial reads fail closed instead of replacing existing settings with defaults', async () => {
  for (const data of [null, [], {}, { ...CONFIG, merchantId: '' }, { ...CONFIG, merchantId: 'bad\n' },
    { ...CONFIG, fallbackSeconds: undefined }, { ...CONFIG, fallbackSeconds: '30' }, { ...CONFIG, maxDistanceKm: null },
    { ...CONFIG, fallbackSeconds: -1 }, { ...CONFIG, maxDistanceKm: 0 }, { ...CONFIG, deliveryPolicy: 'UNKNOWN' }]) {
    const h = harness(); h.read(async () => ({ data })); await h.editor.load();
    assert.ok(h.state().loadError); assert.equal(h.state().merchantId, null); assert.equal(await h.editor.save(), false);
    assert.equal(h.calls.length, 1);
  }
});

for (const status of [401, 403, 404, 409, 422, 503]) {
  test(`HTTP ${status}: load and save errors are actionable, redacted and retryable`, async () => {
    const h = harness(); h.read(async () => { throw httpError(status); }); await h.editor.load();
    assert.equal(h.state().loading, false); assert.ok(h.state().loadError); assert.ok(!h.state().loadError.includes('PRIVATE'));
    h.read(async () => ({ data: CONFIG })); await h.editor.load(); assert.equal(h.state().loadError, '');
    h.write(async () => { throw httpError(status); }); h.editor.setField('fallbackSeconds', '75');
    assert.equal(await h.editor.save(), false); assert.equal(h.state().saving, false); assert.ok(h.state().error);
    assert.equal(h.state().draft.fallbackSeconds, '75'); assert.equal(h.state().message, ''); assert.ok(!h.state().error.includes('PRIVATE'));
    h.write(async (url, body) => ({ data: { merchantId: CONFIG.merchantId, ...body } }));
    assert.equal(await h.editor.save(), true);
  });
}

test('slow load blocks writes and late load responses cannot replace the new branch', async () => {
  const h = harness(); const pending = deferred(); h.read(() => pending.promise);
  const old = h.editor.load(); assert.equal(await h.editor.save(), false);
  h.scope('r1:l2'); h.read(async () => ({ data: { ...CONFIG, merchantId: 'merchant-2', fallbackSeconds: 99 } }));
  await h.editor.load(); pending.resolve({ data: CONFIG }); await old;
  assert.equal(h.state().merchantId, 'merchant-2'); assert.equal(h.state().draft.fallbackSeconds, '99');
});

test('scope changes without an event invalidate a save and reload before any PUT', async () => {
  const h = harness(); await h.editor.load(); h.scope('r1:l2');
  h.read(async () => ({ data: { ...CONFIG, merchantId: 'merchant-2' } }));
  assert.equal(await h.editor.save(), false); assert.equal(h.state().merchantId, 'merchant-2');
  assert.equal(h.calls.filter(row => row.method === 'PUT').length, 0);
});

test('scope changes during a load discard its result and reload the selected branch', async () => {
  const h = harness(); const pending = deferred(); const reloaded = deferred(); h.read(() => pending.promise);
  h.watch(state => { if (state.merchantId === 'merchant-2') reloaded.resolve(); });
  const old = h.editor.load(); h.scope('r1:l2'); h.read(async () => ({ data: { ...CONFIG, merchantId: 'merchant-2' } }));
  pending.resolve({ data: CONFIG }); await old; await reloaded.promise;
  assert.equal(h.state().merchantId, 'merchant-2');
});

test('a save in progress blocks duplicate writes and edits; old save results cannot overwrite another branch', async () => {
  const h = harness(); await h.editor.load(); const pending = deferred(); h.write(() => pending.promise);
  const active = h.editor.save(); assert.equal(h.state().saving, true); assert.equal(await h.editor.save(), false);
  h.editor.setField('fallbackSeconds', '999'); assert.equal(h.state().draft.fallbackSeconds, '30');
  h.scope('r1:l2'); h.read(async () => ({ data: { ...CONFIG, merchantId: 'merchant-2', fallbackSeconds: 90 } }));
  await h.editor.load(); pending.resolve({ data: CONFIG }); assert.equal(await active, false);
  assert.equal(h.state().merchantId, 'merchant-2'); assert.equal(h.state().message, ''); assert.equal(h.state().draft.fallbackSeconds, '90');
  assert.equal(h.calls.filter(row => row.method === 'PUT').length, 1);
});

test('merchant IDs are path-encoded and a foreign or malformed save response never reports success', async () => {
  const h = harness(); h.read(async () => ({ data: { ...CONFIG, merchantId: 'merchant/one' } })); await h.editor.load();
  h.write(async () => ({ data: { ...CONFIG, merchantId: 'foreign' } })); assert.equal(await h.editor.save(), false);
  assert.ok(h.calls[1].url.includes('/merchants/merchant%2Fone/')); assert.equal(h.state().message, '');
  h.write(async () => ({ data: null })); assert.equal(await h.editor.save(), false); assert.ok(h.state().error);
});

test('unmount disposal discards pending results and prevents further requests', async () => {
  const h = harness(); const pending = deferred(); h.read(() => pending.promise); const active = h.editor.load();
  const before = h.changes.length; h.editor.dispose(); pending.resolve({ data: CONFIG }); await active;
  await h.editor.load(); assert.equal(await h.editor.save(), false);
  assert.equal(h.changes.length, before); assert.equal(h.calls.length, 1);
});
