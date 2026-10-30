const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveRuntimePolicy, createCorsOriginCheck, createSocketAdmission, startBackgroundTasks } = require('../src/lib/runtime-policy');

function corsResult(policy, origin) {
  let result;
  createCorsOriginCheck(policy)(origin, (error, allowed) => { result = { error, allowed }; });
  return result;
}

test('isolated mode binds loopback despite a host override and disables jobs and sockets', () => {
  const policy = resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true', HOST: '0.0.0.0' });
  assert.equal(policy.host, '127.0.0.1');
  assert.equal(policy.jobsEnabled, false);
  assert.equal(policy.socketsEnabled, false);
  for (const transport of ['polling', 'websocket']) {
    createSocketAdmission(policy)({ _query: { transport } }, (error, allowed) => {
      assert.equal(error, null);
      assert.equal(allowed, false);
    });
  }
});

test('isolated startup imports no job module and starts no DB sweep', () => {
  const forbidden = () => assert.fail('A background task was started or imported');
  startBackgroundTasks(resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true' }), {}, {
    startRevalidationSweep: forbidden, loadJob: forbidden,
  });
});

test('disabling business jobs preserves socket security outside isolated mode', () => {
  const io = {};
  let sweeps = 0;
  startBackgroundTasks(resolveRuntimePolicy({ ENABLE_BACKGROUND_JOBS: 'false' }), io, {
    startRevalidationSweep: target => { assert.equal(target, io); sweeps++; },
    loadJob: () => assert.fail('Disabled job imported'),
  });
  assert.equal(sweeps, 1);
});

test('legacy startup still runs all seven jobs once and passes io to the table job', () => {
  const calls = [];
  const modules = [];
  const io = {};
  startBackgroundTasks(resolveRuntimePolicy({}), io, {
    startRevalidationSweep: target => { assert.equal(target, io); calls.push('sweep'); },
    loadJob: path => {
      modules.push(path);
      return new Proxy({}, { get: (_, name) => (...args) => calls.push([name, args]) });
    },
  });
  assert.equal(new Set(modules).size, 7);
  assert.deepEqual(calls, [
    'sweep', ['startTrialExpiryJob', []], ['startAutoPromosJob', []],
    ['startUnverifiedPurgeJob', []], ['startRecurringPayablesJob', []],
    ['startWhatsappBotReportJob', []], ['startDemoExpiryJob', []],
    ['startStaleTableOrdersJob', [io]],
  ]);
});

test('isolated mode rejects accidental background-job opt-in and misspelled booleans', () => {
  assert.throws(() => resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true', ENABLE_BACKGROUND_JOBS: 'true' }));
  for (const value of ['TRUE', '1', 'yes', ' false ', 'treu']) {
    assert.throws(() => resolveRuntimePolicy({ MARKETPLACE_ISOLATED: value }));
    assert.throws(() => resolveRuntimePolicy({ ENABLE_BACKGROUND_JOBS: value }));
  }
});

test('isolated CORS permits only exact configured origins, never production or previews', () => {
  const policy = resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true', ALLOW_VERCEL_PREVIEWS: 'true' });
  assert.equal(corsResult(policy, 'http://127.0.0.1:4103').allowed, true);
  for (const origin of [
    'http://127.0.0.1:3003', 'http://localhost:4103', 'https://127.0.0.1:4103',
    'http://127.0.0.1:4103/', 'https://mrtpvrest.com', 'https://store.mrtpvrest.com',
    'https://preview.vercel.app', 'http://127.0.0.1.evil.test:4103',
    'null', 'capacitor://localhost', 'tauri://localhost',
  ]) {
    const { error, allowed } = corsResult(policy, origin);
    assert.equal(allowed, undefined, origin);
    assert.equal(error.statusCode, 403, origin);
    assert.equal(error.code, 'CORS_BLOCKED');
    assert.equal(error.level, 'WARN');
    assert.equal(error.isOperational, true);
  }
  assert.equal(corsResult(policy, undefined).allowed, true);
});

test('exact loopback origin allowlist supports multiple ports and IPv6', () => {
  const origins = ['http://localhost:4103', 'http://[::1]:4103', 'https://127.0.0.1:4102'];
  const policy = resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true', MARKETPLACE_ALLOWED_ORIGINS: origins.join(', ') });
  for (const origin of origins) assert.equal(corsResult(policy, origin).allowed, true);
});

test('invalid or nonlocal allowlist fails before application startup', () => {
  for (const origin of [
    '*', 'null', ' ', 'http://localhost:4103,', 'https://mrtpvrest.com',
    'http://192.168.1.10:4103', 'http://127.0.0.1:4103/path',
    'http://user:password@localhost:4103', 'http://localhost:4103?x=1',
    'http://localhost:4103#x', 'file://localhost',
  ]) {
    assert.throws(() => resolveRuntimePolicy({ MARKETPLACE_ISOLATED: 'true', MARKETPLACE_ALLOWED_ORIGINS: origin }), origin);
  }
});

test('ordinary deployments retain existing CORS, binding and socket behavior', () => {
  const policy = resolveRuntimePolicy({});
  assert.equal(policy.host, '0.0.0.0');
  assert.equal(policy.jobsEnabled, true);
  createSocketAdmission(policy)({}, (error, allowed) => { assert.equal(error, null); assert.equal(allowed, true); });
  for (const origin of ['https://mrtpvrest.com', 'https://store.mrtpvrest.com', 'http://localhost:3003', 'capacitor://localhost', 'tauri://localhost', 'http://tauri.localhost']) {
    assert.equal(corsResult(policy, origin).allowed, true, origin);
  }
  for (const origin of ['https://evil.test', 'https://mrtpvrest.com.evil.test', 'https://preview.vercel.app']) {
    assert.equal(corsResult(policy, origin).error.statusCode, 403, origin);
  }
  assert.equal(corsResult(resolveRuntimePolicy({ ALLOW_VERCEL_PREVIEWS: 'true' }), 'https://preview.vercel.app').allowed, true);
  assert.equal(resolveRuntimePolicy({ HOST: '127.0.0.1' }).host, '127.0.0.1');
});
