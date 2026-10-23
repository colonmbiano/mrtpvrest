'use strict';

const { createHybridDispatchEngine, hashPin } = require('../../src/lib/marketplace-dispatch');
const createRouter = require('../../src/routes/marketplace-dispatch.routes');
const NOW = new Date('2026-10-23T18:00:00Z');
const admin = { id: 'owner', role: 'OWNER', restaurantId: 'r1', isActive: true };
const driver = id => ({ id, role: 'DELIVERY', isActive: true });

function fixture(policy = 'OWN_THEN_SHARED', options = {}) {
  let clock = new Date(NOW);
  const store = {};
  const engine = createHybridDispatchEngine({ store, now: () => clock });
  store.merchants.set('m1', { id: 'm1', restaurantId: 'r1', locationId: 'l1', deliveryPolicy: policy,
    fallbackSeconds: 30, maxDistanceKm: 10, ...options });
  store.merchants.set('m2', { id: 'm2', restaurantId: 'r2', locationId: 'l2', deliveryPolicy: 'OWN_ONLY', fallbackSeconds: 30, maxDistanceKm: 10 });
  store.merchants.set('branch', { id: 'branch', restaurantId: 'r1', locationId: 'l3', deliveryPolicy: 'OWN_ONLY', fallbackSeconds: 30, maxDistanceKm: 10 });
  for (const [id, isShared] of [['own', false], ['foreign', false], ['dual', true], ['shared', true], ['branch-own', false]]) {
    store.couriers.set(id, { id, name: id, isActive: true, isOnline: true, isShared,
      presence: { lat: 19.4326, lng: -99.1332, lastSeenAt: clock, acceptingShared: isShared } });
  }
  for (const [courierId, merchantId] of [['own', 'm1'], ['dual', 'm1'], ['foreign', 'm2'], ['branch-own', 'branch']]) {
    store.affiliations.set(courierId, { id: `aff-${courierId}`, courierId, merchantId, status: 'ACTIVE', canTakeOwnOrders: true });
  }
  function addTask(id = 't1', merchantId = 'm1') {
    const merchant = store.merchants.get(merchantId);
    const task = { id, orderId: `order-${id}`, merchantId, restaurantId: merchant.restaurantId, locationId: merchant.locationId,
      status: 'WAITING_READY', version: 0, pickupLat: 19.4326, pickupLng: -99.1332, payoutAmount: 35.50,
      pickupPinHash: hashPin('1234'), deliveryPinHash: hashPin('5678'), createdAt: new Date(clock.getTime() - 3600000).toISOString() };
    store.tasks.set(id, task);
    store.orders.set(task.orderId, { id: task.orderId, restaurantId: task.restaurantId, locationId: task.locationId, status: 'READY' });
    return task;
  }
  const task = addTask();
  const routes = new Map(); const middlewares = [];
  createRouter({ getStore: () => store, now: () => clock,
    authenticate: (req, res, next) => req.user ? next() : res.status(401).json({ errorCode: 'UNAUTHENTICATED' }),
    Router: () => ({ use: fn => middlewares.push(fn),
      get: (path, fn) => routes.set(`GET ${path}`, fn), post: (path, fn) => routes.set(`POST ${path}`, fn),
      put: (path, fn) => routes.set(`PUT ${path}`, fn) }) });
  async function request(method, path, { user = admin, params = { id: 't1' }, body = {}, query = {} } = {}) {
    const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k.toLowerCase()] = v; return this; },
      status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
    await routes.get(`${method} ${path}`)({ user, params, body, query }, res);
    return res;
  }
  return { store, engine, task, routes, middlewares, request, addTask,
    order: store.orders.get(task.orderId), setTime: value => { clock = new Date(value); },
    advance: ms => { clock = new Date(clock.getTime() + ms); },
    offers: (source) => [...store.offers.values()].filter(offer => !source || offer.source === source),
    start: () => engine.startDispatch({ taskId: task.id }),
    accept: id => engine.acceptOffer({ offerId: [...store.offers.values()].find(offer => offer.courierId === id && offer.status === 'OFFERED').id, courierId: id }) };
}

module.exports = { fixture, admin, driver, NOW };
