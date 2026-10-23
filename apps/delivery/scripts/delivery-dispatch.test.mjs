// Runs the production TypeScript modules and real Zustand middleware entirely offline.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRequire = createRequire(path.join(appRoot, 'package.json'));
const ts = appRequire('typescript');
const { createStore } = appRequire('zustand/vanilla');
const { persist, createJSONStorage } = appRequire('zustand/middleware');
const plain = value => JSON.parse(JSON.stringify(value));
const BASE = '/api/marketplace/dispatch/couriers';

function harness(saved = new Map()) {
  let now = 1_800_000_000_000;
  let nextId = 0;
  let postHandler = async () => ({ data: { ok: true } });
  let getHandler = async () => ({ data: [] });
  const requests = [];
  const navigator = { onLine: true };
  const storage = { getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
  class Clock extends Date { static now() { return now; } }
  const api = {
    post: async (url, data, config) => { requests.push({ method: 'POST', url, data: plain(data), config }); return postHandler(url, data, config); },
    get: async (url, config) => { requests.push({ method: 'GET', url, config }); return getHandler(url, config); },
    put: async (url, data, config) => { requests.push({ method: 'PUT', url, data: plain(data), config }); return postHandler(url, data, config); },
  };
  const cache = new Map();
  const context = vm.createContext({ Date: Clock, navigator, console,
    crypto: { randomUUID: () => `offline-test-${++nextId}` },
    setTimeout: () => { throw new Error('Unexpected timer'); },
    setInterval: () => { throw new Error('Background sync must not start in tests'); },
    clearInterval: () => {},
    fetch: () => { throw new Error('Real network is forbidden'); } });
  function load(relative) {
    const filename = realpathSync(path.resolve(appRoot, relative));
    assert.ok(filename.startsWith(realpathSync(appRoot) + path.sep), 'Only this delivery workspace may load');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const result = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename, reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
    function isolatedRequire(id) {
      if (id === './api') return { __esModule: true, default: api };
      if (id === 'zustand') return { create: () => initializer => createStore(initializer) };
      if (id === 'zustand/middleware') return { persist: (initializer, options) => persist(initializer,
        { ...options, storage: createJSONStorage(() => storage) }) };
      if (id.startsWith('@/')) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith('.')) return load(path.relative(appRoot, path.resolve(path.dirname(filename), `${id}.ts`)));
      throw new Error(`Unexpected dependency: ${id}`);
    }
    const execute = vm.runInContext(`(function(require,module,exports) { ${result.outputText}\n})`, context, { filename });
    execute(isolatedRequire, module, module.exports);
    return module.exports;
  }
  const offlineModule = load('src/store/useOfflineStore.ts');
  const deliveryModule = load('src/store/useDeliveryStore.ts');
  const dispatch = load('src/lib/marketplaceDispatch.ts');
  const sync = load('src/lib/offline.ts');
  return { ...offlineModule, ...deliveryModule, dispatch, sync, saved, navigator, requests,
    get offline() { return offlineModule.useOfflineStore.getState(); },
    get delivery() { return deliveryModule.useDeliveryStore.getState(); },
    now: () => now, advance: ms => { now += ms; },
    post: handler => { postHandler = handler; }, get: handler => { getHandler = handler; } };
}

function connected(h) { h.delivery.setDriver({ id: 'c1' }); h.delivery.setIsOnline(true); }
const pickup = (taskId = 't1', courierId = 'c1') => ({ type: 'CONFIRM_PICKUP_PIN', data: { courierId, taskId, pickupPin: '0123' } });
const deliver = (taskId = 't1', courierId = 'c1') => ({ type: 'CONFIRM_DELIVERY_PIN', data: { courierId, taskId, deliveryPin: '4567', paymentMethod: 'CASH', cashCollected: true } });
const httpError = status => Object.assign(new Error('server error'), { response: { status, data: { errorCode: 'INVALID_PIN' } } });

test('presence: production client sends shared status and valid GPS to the mounted route', async () => {
  const h = harness();
  h.post(async () => ({ data: { success: true } }));
  const result = await h.dispatch.updateCourierPresence({ courierId: 'c1', name: 'Synthetic', lat: 19.4, lng: -99.1, isOnline: true, isShared: true });
  assert.equal(result.ok, true);
  assert.equal(h.requests[0].url, `${BASE}/me/presence`);
  assert.equal(h.requests[0].data.isShared, true);
  assert.equal(h.requests[0].data.lat, 19.4);
});

test('presence: invalid coordinates and flags never call the API', async () => {
  const h = harness();
  const base = { courierId: 'c1', name: 'Synthetic', lat: 0, lng: 0, isOnline: true, isShared: true };
  for (const change of [{ lat: 91 }, { lng: -181 }, { lat: NaN }, { lng: Infinity }, { isShared: 'true' }]) {
    await assert.rejects(h.dispatch.updateCourierPresence({ ...base, ...change }), /INVALID_PRESENCE/);
  }
  assert.equal(h.requests.length, 0);
});

test('global state: GPS requires a signed-in online driver and accepts zero coordinates', () => {
  const h = harness();
  assert.equal(h.delivery.isShared, false);
  assert.equal(h.delivery.setPresence({ lat: 0, lng: 0 }), false);
  connected(h);
  h.delivery.setIsShared(true);
  assert.equal(h.delivery.setPresence({ lat: 0, lng: 0 }), true);
  assert.equal(h.delivery.getPresence().lat, 0);
  assert.equal(h.delivery.isShared, true);
});

test('global state: rejects invalid, future, stale and out-of-order GPS fixes', () => {
  const h = harness(); connected(h);
  for (const coords of [{ lat: 91, lng: 0 }, { lat: 0, lng: -181 }, { lat: NaN, lng: 0 }]) assert.equal(h.delivery.setPresence(coords), false);
  assert.equal(h.delivery.setPresence({ lat: 1, lng: 2 }, h.now() + 1), false);
  assert.equal(h.delivery.setPresence({ lat: 1, lng: 2 }, h.now() - h.PRESENCE_TTL_MS), false);
  h.delivery.setPresence({ lat: 1, lng: 2 });
  h.advance(10);
  assert.equal(h.delivery.setPresence({ lat: 3, lng: 4 }, h.now() - 20), false);
  assert.equal(h.delivery.getPresence().lat, 1);
});

test('global state: GPS expires at the exact 90-second boundary and offline clears it', () => {
  const h = harness(); connected(h);
  h.delivery.setPresence({ lat: 1, lng: 2 });
  h.advance(89_999); assert.ok(h.delivery.getPresence());
  h.advance(1); assert.equal(h.delivery.getPresence(), null);
  h.delivery.setPresence({ lat: 3, lng: 4 });
  h.delivery.setIsOnline(false);
  assert.equal(h.delivery.presence, null);
});

test('persistence: restores shared preference but never stale availability or GPS', () => {
  const h = harness(); connected(h);
  h.delivery.setIsShared(true); h.delivery.setPresence({ lat: 1, lng: 2 });
  const saved = JSON.parse(h.saved.get('delivery-app-storage')).state;
  assert.equal(saved.isShared, true);
  assert.equal('presence' in saved, false); assert.equal('isOnline' in saved, false);
  const reloaded = harness(h.saved);
  assert.equal(reloaded.delivery.isShared, true);
  assert.equal(reloaded.delivery.isOnline, false); assert.equal(reloaded.delivery.presence, null);
});

test('persistence: version-zero state migrates without restoring GPS or online presence', () => {
  const h = harness(new Map([['delivery-app-storage', JSON.stringify({ version: 0,
    state: { driver: { id: 'old' }, orders: [], history: [], isOnline: true, presence: { lat: 1 }, isShared: 'yes' } })]]));
  assert.equal(h.delivery.driver.id, 'old'); assert.equal(h.delivery.isShared, false);
  assert.equal(h.delivery.presence, null); assert.equal(h.delivery.isOnline, false);
});

test('logout and driver switch reset shared state, GPS and pending PINs', () => {
  const h = harness(); connected(h);
  h.delivery.setIsShared(true); h.delivery.setPresence({ lat: 1, lng: 2 });
  h.offline.addToQueue(pickup());
  h.delivery.setDriver({ id: 'c2' });
  assert.equal(h.delivery.isShared, false); assert.equal(h.delivery.presence, null);
  assert.equal(h.offline.queue.length, 0);
  h.offline.addToQueue(deliver('t2', 'c2'));
  h.delivery.logout();
  assert.equal(h.delivery.driver, null); assert.equal(h.offline.queue.length, 0);
});

test('offers: filters expired, exact-deadline and malformed expirations; normalizes ISO dates', async () => {
  const h = harness();
  h.get(async (url, config) => {
    assert.equal(url, `${BASE}/me/offers`); assert.equal(config.params.courierId, 'c1');
    return { data: { offers: [
      { id: 'live', expiresAt: new Date(h.now() + 1000).toISOString() },
      { offerId: 'past', expiresAt: h.now() - 1 }, { offerId: 'boundary', expiresAt: h.now() },
      { offerId: 'bad', expiresAt: 'bad' }, { offerId: 'missing' },
    ] } };
  });
  const offers = await h.dispatch.getMarketplaceOffers('c1');
  assert.equal(offers.length, 1); assert.equal(offers[0].offerId, 'live');
  assert.equal(offers[0].expiresAt, h.now() + 1000);
});

test('offers: accepts array payloads and rejects malformed responses as errors', async () => {
  const h = harness(); h.get(async () => ({ data: [{ offerId: 'x', expiresAt: h.now() + 1 }] }));
  assert.equal((await h.dispatch.getMarketplaceOffers('c1')).length, 1);
  h.get(async () => ({ data: {} }));
  await assert.rejects(h.dispatch.getMarketplaceOffers('c1'), /INVALID_OFFERS_RESPONSE/);
});

test('accept: returns successful assignment without changing global order state', async () => {
  const h = harness(); h.delivery.setOrders([{ id: 'o1', status: 'PREPARING' }]);
  h.post(async (url, body) => { assert.equal(url, `${BASE}/offers/off-1/accept`); assert.equal(body.courierId, 'c1');
    return { data: { ok: true, taskId: 't1', orderId: 'o1', orderStatus: 'PREPARING' } }; });
  const result = await h.dispatch.acceptMarketplaceOffer('c1', 'off-1');
  assert.equal(result.success, true); assert.equal(result.data.taskId, 't1');
  assert.equal(h.delivery.orders[0].status, 'PREPARING'); assert.equal(h.offline.queue.length, 0);
});

test('accept: CAS conflict 409, expired offer 410 and network failure never enqueue acceptance', async () => {
  const h = harness();
  h.post(async () => { throw httpError(409); });
  assert.equal((await h.dispatch.acceptMarketplaceOffer('c1', 'off')).isConflict, true);
  h.post(async () => { throw httpError(410); });
  assert.match((await h.dispatch.acceptMarketplaceOffer('c1', 'off')).error, /expirado/);
  h.post(async () => { throw Object.assign(new Error('network'), { code: 'ERR_NETWORK' }); });
  assert.equal((await h.dispatch.acceptMarketplaceOffer('c1', 'off')).success, false);
  assert.equal(h.offline.queue.length, 0);
});

test('PINs: reject non-numeric or wrong-length input before API or queue', async () => {
  const h = harness(); h.navigator.onLine = false;
  for (const pin of ['12', '', 'abcd', '12 3', '12345', null, 1234]) {
    assert.equal((await h.dispatch.confirmPickupPin('c1', 't1', pin)).success, false);
    assert.equal((await h.dispatch.confirmDeliveryPin('c1', 't1', pin)).success, false);
  }
  assert.equal(h.requests.length, 0); assert.equal(h.offline.queue.length, 0);
});

test('pickup: only server acknowledgement confirms the PIN and ON_THE_WAY result', async () => {
  const h = harness();
  h.post(async (url, body) => { assert.equal(url, `${BASE}/tasks/t1/pickup`); assert.equal(body.pickupPin, '0123');
    return { data: { success: true, status: 'PICKED_UP', orderStatusUpdate: 'ON_THE_WAY' } }; });
  const result = await h.dispatch.confirmPickupPin('c1', 't1', ' 0123 ');
  assert.equal(result.success, true); assert.equal(result.data.orderStatusUpdate, 'ON_THE_WAY');
  h.post(async () => ({ data: { ok: false } }));
  assert.equal((await h.dispatch.confirmPickupPin('c1', 't1', '0123')).success, false);
});

test('delivery: confirmed CASH request preserves cash collection details', async () => {
  const h = harness();
  h.post(async (url, body) => { assert.equal(url, `${BASE}/tasks/t1/deliver`);
    assert.equal(body.paymentMethod, 'CASH'); assert.equal(body.cashCollected, true);
    return { data: { ok: true, status: 'DELIVERED', orderStatusUpdate: 'DELIVERED' } }; });
  const result = await h.dispatch.confirmDeliveryPin('c1', 't1', '4567', 'CASH', true);
  assert.equal(result.success, true); assert.equal(result.data.status, 'DELIVERED');
});

test('PINs: server rejection never becomes an offline transaction', async () => {
  const h = harness();
  for (const status of [400, 401, 403, 409, 410, 500]) {
    h.post(async () => { throw httpError(status); });
    assert.equal((await h.dispatch.confirmPickupPin('c1', 't1', '0123')).success, false);
    assert.equal((await h.dispatch.confirmDeliveryPin('c1', 't1', '4567')).success, false);
  }
  assert.equal(h.offline.queue.length, 0);
});

test('offline PINs: enqueue both phases without network or optimistic confirmation', async () => {
  const h = harness(); h.navigator.onLine = false;
  h.delivery.setOrders([{ id: 'o1', status: 'PREPARING' }]);
  const first = await h.dispatch.confirmPickupPin('c1', 't1', '0123');
  const second = await h.dispatch.confirmDeliveryPin('c1', 't1', '4567', 'CASH', true);
  for (const result of [first, second]) { assert.equal(result.success, false); assert.equal(result.queued, true); assert.ok(result.queueId); }
  assert.equal(h.requests.length, 0);
  assert.deepEqual(plain(h.offline.queue.map(t => t.type)), ['CONFIRM_PICKUP_PIN', 'CONFIRM_DELIVERY_PIN']);
  assert.equal(h.offline.queue[1].data.cashCollected, true);
  assert.equal(h.delivery.orders[0].status, 'PREPARING');
});

test('offline PINs: queues recognized connection failures after an online attempt', async () => {
  const h = harness(); h.post(async () => { throw Object.assign(new Error('Lost connection'), { code: 'ERR_NETWORK' }); });
  assert.equal((await h.dispatch.confirmPickupPin('c1', 't1', '0123')).queued, true);
  assert.equal((await h.dispatch.confirmDeliveryPin('c1', 't1', '4567')).queued, true);
  assert.equal(h.offline.queue.length, 2);
});

test('queue: validates payload and TTL, copies PIN data and deduplicates without extending TTL', () => {
  const h = harness(); const input = pickup(); const id = h.offline.addToQueue(input);
  const expiresAt = h.offline.queue[0].expiresAt;
  input.data.pickupPin = '9999';
  h.advance(1000);
  assert.equal(h.offline.addToQueue(pickup()), id);
  assert.equal(h.offline.queue.length, 1); assert.equal(h.offline.queue[0].data.pickupPin, '0123');
  assert.equal(h.offline.queue[0].expiresAt, expiresAt);
  assert.throws(() => h.offline.addToQueue({ ...pickup(), expiresAt: h.now() }), /INVALID_PIN_EXPIRY/);
  assert.throws(() => h.offline.addToQueue({ ...pickup(), expiresAt: h.now() + h.PIN_QUEUE_TTL_MS + 1 }), /INVALID_PIN_EXPIRY/);
  assert.throws(() => h.offline.addToQueue({ ...pickup(), data: { courierId: '', taskId: 't1', pickupPin: '1234' } }), /INVALID_PIN_ACTION/);
  assert.throws(() => h.offline.addToQueue({ ...deliver(), data: { ...deliver().data, paymentMethod: 'BAD' } }), /INVALID_PIN_ACTION/);
});

test('queue persistence: pending PINs survive rehydration; the in-progress lock does not', () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver());
  h.offline.setSyncInProgress(true);
  const reloaded = harness(h.saved);
  assert.equal(reloaded.offline.queue.length, 2); assert.equal(reloaded.offline.syncInProgress, false);
  assert.equal(reloaded.offline.queue[0].data.pickupPin, '0123');
  assert.equal(reloaded.offline.queue[0].expiresAt, h.now() + h.PIN_QUEUE_TTL_MS);
});

test('queue expiry: exact TTL marks failed, removes PIN and prevents replay after reload', async () => {
  const h = harness(); h.offline.addToQueue(pickup());
  h.advance(h.PIN_QUEUE_TTL_MS - 1); assert.equal(h.offline.getUnsynced().length, 1);
  h.advance(1); assert.equal(h.offline.getUnsynced().length, 0);
  assert.equal(h.offline.queue[0].failureReason, 'EXPIRED');
  assert.equal('pickupPin' in h.offline.queue[0].data, false);
  const reloaded = harness(h.saved); await reloaded.sync.performSync();
  assert.equal(reloaded.requests.length, 0); assert.equal(reloaded.offline.queue[0].failureReason, 'EXPIRED');
});

test('queue migration: keeps legacy work and expires PINs without valid expiry', () => {
  const h = harness(new Map([['delivery-offline-storage', JSON.stringify({ version: 0, state: { syncInProgress: true, lastSync: 42,
    queue: [{ id: 'legacy', type: 'CHAT_MESSAGE', data: { orderId: 'o1' }, synced: false, timestamp: 1, retryCount: 0 },
      { id: 'pin', ...pickup(), synced: false, timestamp: 1, retryCount: 0 }] } })]]));
  assert.equal(h.offline.lastSync, 42); assert.equal(h.offline.syncInProgress, false);
  assert.equal(h.offline.getUnsynced().length, 1);
  assert.equal(h.offline.queue[1].failureReason, 'EXPIRED');
  assert.equal('pickupPin' in h.offline.queue[1].data, false);
});

test('sync: replays pickup before delivery with stable keys, then removes PINs', async () => {
  const h = harness(); const id1 = h.offline.addToQueue(pickup()); const id2 = h.offline.addToQueue(deliver());
  await h.sync.performSync();
  assert.deepEqual(h.requests.map(r => r.url), [`${BASE}/tasks/t1/pickup`, `${BASE}/tasks/t1/deliver`]);
  assert.equal(h.requests[0].config.headers['Idempotency-Key'], id1);
  assert.equal(h.requests[1].config.headers['Idempotency-Key'], id2);
  assert.equal(h.offline.queue.length, 0); assert.equal(h.offline.syncInProgress, false);
  assert.ok(!h.saved.get('delivery-offline-storage').includes('0123'));
});

test('sync: a transient pickup failure blocks delivery on that task, but not another task', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver()); h.offline.addToQueue(deliver('t2'));
  h.post(async url => { if (url.endsWith('/t1/pickup')) throw Object.assign(new Error('network'), { code: 'ERR_NETWORK' }); return { data: { ok: true } }; });
  await h.sync.performSync();
  assert.equal(h.requests.length, 2); assert.ok(h.requests[1].url.includes('t2/deliver'));
  assert.equal(h.offline.queue[0].retryCount, 1); assert.equal(h.offline.queue[1].retryCount, 0);
  h.post(async () => ({ data: { success: true } })); await h.sync.performSync();
  assert.equal(h.offline.queue.length, 0);
});

test('sync: handles inverted queue order without sending delivery before pending pickup', async () => {
  const h = harness(); h.offline.addToQueue(deliver()); h.offline.addToQueue(pickup());
  await h.sync.performSync(); assert.equal(h.requests.length, 1); assert.ok(h.requests[0].url.endsWith('/pickup'));
  await h.sync.performSync(); assert.ok(h.requests[1].url.endsWith('/deliver'));
});

test('sync: permanent PIN rejection is retained without secret and without retry loops', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver());
  h.post(async () => { throw httpError(400); });
  await h.sync.performSync(); await h.sync.performSync();
  assert.equal(h.requests.length, 1); assert.equal(h.offline.queue[0].failureReason, 'REJECTED');
  assert.equal('pickupPin' in h.offline.queue[0].data, false); assert.equal(h.offline.syncInProgress, false);
});

test('sync: bounded retries keep failures visible and redact the PIN', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.post(async () => { throw new Error('network down'); });
  for (let i = 0; i < h.MAX_SYNC_RETRIES + 2; i++) await h.sync.performSync();
  assert.equal(h.requests.length, h.MAX_SYNC_RETRIES);
  assert.equal(h.offline.queue[0].failureReason, 'MAX_RETRIES');
  assert.equal('pickupPin' in h.offline.queue[0].data, false);
});

test('sync: 200 without acknowledgement never removes a pending PIN', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.post(async () => ({ data: { ok: false } }));
  await h.sync.performSync(); assert.equal(h.offline.queue.length, 1); assert.equal(h.offline.queue[0].retryCount, 1);
});

test('sync: offline and concurrent invocations send no duplicate requests', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.navigator.onLine = false;
  await h.sync.performSync(); assert.equal(h.requests.length, 0);
  h.navigator.onLine = true;
  let release;
  h.post(() => new Promise(resolve => { release = resolve; }));
  const active = h.sync.performSync(); await h.sync.performSync();
  assert.equal(h.requests.length, 1); release({ data: { ok: true } }); await active;
  assert.equal(h.offline.syncInProgress, false);
});

test('sync: logout during a request prevents subsequent queued PIN replay', async () => {
  const h = harness(); connected(h); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver());
  h.post(async () => { h.delivery.logout(); return { data: { ok: true } }; });
  await h.sync.performSync(); assert.equal(h.requests.length, 1); assert.equal(h.offline.queue.length, 0);
});

test('sync: legacy delivery and expense endpoints remain intact', async () => {
  const h = harness();
  h.offline.addToQueue({ type: 'CONFIRM_DELIVERY', data: { driverId: 'c1', orderId: 'o1', paymentMethod: 'CASH' } });
  h.offline.addToQueue({ type: 'LOG_EXPENSE', data: { driverId: 'c1', movementId: 'm1', amount: 10 } });
  await h.sync.performSync();
  assert.equal(h.requests[0].method, 'PUT'); assert.equal(h.requests[0].url, '/api/delivery/c1/orders/o1/status');
  assert.equal(h.requests[1].url, '/api/driver-cash/c1/movements'); assert.equal(h.requests[1].config.headers['Idempotency-Key'], 'm1');
  assert.equal(h.offline.queue.length, 0);
});

test('sync: unknown persisted action is retained as a failure, never acknowledged as synced', async () => {
  const h = harness(); h.useOfflineStore.setState({ queue: [{ id: 'u', type: 'UNKNOWN', data: {}, synced: false, retryCount: 0, timestamp: h.now() }] });
  await h.sync.performSync(); assert.equal(h.offline.queue[0].failureReason, 'UNKNOWN_TYPE'); assert.equal(h.requests.length, 0);
});

test('queue hydration: corrupt PIN payload is rejected and its stored code is scrubbed', () => {
  const saved = new Map([['delivery-offline-storage', JSON.stringify({ version: 1, state: {
    queue: [{ id: 'bad', ...pickup(), data: { courierId: 'c1', pickupPin: '0123' },
      timestamp: 1_800_000_000_000, expiresAt: 1_800_000_000_100, synced: false, retryCount: 0 }],
  } })]]);
  const h = harness(saved);
  assert.equal(h.offline.queue[0].failureReason, 'REJECTED');
  assert.equal(h.offline.getUnsynced().length, 0);
  assert.ok(!saved.get('delivery-offline-storage').includes('0123'));
});

test('queue hydration: expired persisted PIN is scrubbed immediately on reload', () => {
  const saved = new Map([['delivery-offline-storage', JSON.stringify({ version: 1, state: {
    queue: [{ id: 'old', ...pickup(), timestamp: 1, expiresAt: 2, synced: false, retryCount: 0 }],
  } })]]);
  const h = harness(saved);
  assert.equal(h.offline.queue[0].failureReason, 'EXPIRED');
  assert.ok(!saved.get('delivery-offline-storage').includes('0123'));
});

test('queue: legacy work survives the PIN retention window', () => {
  const h = harness(); h.offline.addToQueue({ type: 'LOG_EXPENSE', data: { amount: 10, driverId: 'c1' } });
  h.advance(h.PIN_QUEUE_TTL_MS * 2);
  assert.equal(h.offline.getUnsynced().length, 1);
  assert.equal(h.offline.queue[0].failureReason, undefined);
});

test('sync: a corrected rejected pickup unblocks delivery after server verification', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver());
  h.post(async () => { throw httpError(400); }); await h.sync.performSync();
  const corrected = pickup(); corrected.data.pickupPin = '9999'; h.offline.addToQueue(corrected);
  h.post(async () => ({ data: { success: true } }));
  await h.sync.performSync(); await h.sync.performSync();
  assert.equal(h.offline.queue.length, 0);
  assert.deepEqual(h.requests.map(r => r.url.split('/').at(-1)), ['pickup', 'pickup', 'deliver']);
});

test('sync: transient 408/429 preserve replay keys and do not become terminal rejection', async () => {
  const h = harness(); const id = h.offline.addToQueue(pickup());
  for (const status of [408, 429]) {
    h.post(async () => { throw httpError(status); }); await h.sync.performSync();
    assert.equal(h.offline.queue[0].id, id); assert.equal(h.offline.queue[0].failureReason, undefined);
  }
  assert.equal(h.offline.queue[0].retryCount, 2);
  assert.equal(h.requests[0].config.headers['Idempotency-Key'], h.requests[1].config.headers['Idempotency-Key']);
});

test('sync: connectivity lost mid-batch leaves subsequent tasks pending', async () => {
  const h = harness(); h.offline.addToQueue(pickup()); h.offline.addToQueue(deliver('other'));
  h.post(async () => { h.navigator.onLine = false; return { data: { ok: true } }; });
  await h.sync.performSync();
  assert.equal(h.requests.length, 1); assert.equal(h.offline.queue.length, 1);
  assert.equal(h.offline.queue[0].retryCount, 0); assert.equal(h.offline.syncInProgress, false);
});
