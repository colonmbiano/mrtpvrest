'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createMultiStopEngine } = require('../src/lib/marketplace-multistop');
const { hashPin, createHybridDispatchEngine } = require('../src/lib/marketplace-dispatch');

const checkout = 'checkout_test_1';
function fixture(overrides = {}) {
  let time = new Date('2026-10-23T19:00:00.000Z');
  const now = () => new Date(time);
  const maps = () => new Map();
  const store = {
    tasks: maps(), orders: maps(), merchants: maps(), couriers: maps(),
    offers: maps(), assignments: maps(), affiliations: maps(),
  };
  const stores = [
    ['master', 'master-r', 'm-loc', 'Master Burguer’s', 'PIN1'],
    ['tokki', 'tokki-r', 't-loc', 'Tokki Boba', 'PIN2'],
  ];
  for (const [id, restaurantId, locationId, name, pin] of stores) {
    store.merchants.set(id, {
      id, name, restaurantId, locationId, pickupAddress: 'Calle Principal ' + id,
      deliveryPolicy: 'SHARED_ONLY', allowMultistopShared: true,
    });
    store.tasks.set('task_' + id, {
      id: 'task_' + id, orderId: 'order_' + id,
      merchantId: id, restaurantId, locationId,
      pickupLat: 19.19, pickupLng: -100.13,
      pickupPinHash: hashPin(pin === 'PIN1' ? '1234' : '5678'),
      status: 'OFFERING', dispatchMode: 'SHARED', version: 1,
    });
    store.orders.set('order_' + id, {
      id: 'order_' + id, restaurantId, locationId, status: 'READY',
      checkoutGroupId: checkout, customerId: 'buyer123',
      deliveryAddress: 'Calle del Cliente 10, Colorines',
      groupDeliveryPinHash: hashPin('9090'),
    });
  }
  for (const id of ['courier1', 'courier2']) {
    store.couriers.set(id, {
      id, isActive: true, isShared: true, isOnline: true,
      presence: {
        acceptingShared: true, lat: 19.191, lng: -100.131,
        accuracy: 20, lastSeenAt: now().toISOString(),
      },
    });
  }
  const engine = createMultiStopEngine({ store, now });
  const create = () => engine.createTrip({
    checkoutGroupId: checkout, taskIds: ['task_master', 'task_tokki'], payoutAmount: 42.5,
  });
  const accept = (offerId, courierId = 'courier1') => engine.accept({ offerId, courierId });
  const pickup = (trip, taskId, pin, courierId = 'courier1') =>
    engine.pickup({ tripId: trip.id, taskId, pickupPin: pin, courierId, expectedVersion: trip.version });
  const deliver = (trip, pin, courierId = 'courier1') =>
    engine.deliver({ tripId: trip.id, deliveryPin: pin, courierId, expectedVersion: trip.version });
  return { store, engine, create, accept, pickup, deliver, tick: ms => time = new Date(time.getTime() + ms), now };
}

test('single checkout -> two merchant stops, one paid trip, one rider and two assignments', () => {
  const f = fixture(); const created = f.create();
  const offer = f.engine.offersFor('courier1');
  assert.equal(offer.length, 1);
  assert.equal(offer[0].pickupCount, 2);
  assert.equal(offer[0].payoutAmount, 42.5);
  assert.equal('deliveryAddress' in offer[0], false);
  assert.equal('customerId' in offer[0], false);
  const trip = f.accept(created.offerId);
  assert.equal(trip.status, 'ASSIGNED');
  assert.equal(trip.stops.length, 2);
  assert.equal(trip.deliveryAddress, null);
  assert.equal(f.store.assignments.size, 2);
  assert.equal([...f.store.assignments.values()].reduce((v,a) => v + a.payoutAmount, 0), 0);
  assert.equal(f.store.tasks.get('task_master').status, 'ASSIGNED');
  assert.equal(f.store.orders.get('order_master').status, 'READY');
  assert.equal(f.store.orders.get('order_tokki').status, 'READY');
  assert.throws(() => f.accept(created.offerId, 'courier2'));
});

test('pickup per merchant verifies PIN and unlocks destination only after both pickups', () => {
  const f=fixture();const trip=f.accept(f.create().offerId);
  assert.throws(() => f.pickup(trip,'task_tokki','5678'), e => e.code==='PICKUP_SEQUENCE_REQUIRED');
  assert.throws(() => f.pickup(trip,'task_master','0000'), e => e.code==='INVALID_PICKUP_PIN');
  const a=f.pickup(trip,'task_master','1234');
  assert.equal(a.pickedCount,1);assert.equal(a.deliveryAddress,null);
  assert.equal(f.store.orders.get('order_master').status,'ON_THE_WAY');
  assert.equal(f.store.orders.get('order_tokki').status,'READY');
  assert.throws(() => f.deliver(a,'9090'), e=>e.code==='PICKUPS_PENDING');
  const b=f.pickup(a,'task_tokki','5678');
  assert.equal(b.pickedCount,2);assert.match(b.deliveryAddress,/Colorines/);
  assert.equal(f.store.orders.get('order_tokki').status,'ON_THE_WAY');
  assert.throws(() => f.deliver(b,'wrong'), e=>e.code==='INVALID_DELIVERY_PIN');
  const final=f.deliver(b,'9090');
  assert.equal(final.status,'DELIVERED');
  assert.equal(final.pickedCount,2);
  assert.equal(f.store.orders.get('order_tokki').status,'DELIVERED');
  assert.equal(f.store.orders.get('order_master').status,'DELIVERED');
  assert.equal([...f.store.assignments.values()].every(x=>x.status==='COMPLETED'),true);
  assert.throws(() => f.deliver(final,'9090'), e=>e.code==='STALE_TRIP');
});

test('CAS: competing courier loses atomic group; no orphan split assignment', () => {
  const f=fixture();const id=f.create().offerId;
  f.accept(id,'courier2');
  assert.throws(()=>f.accept(id,'courier1'), e=>e.code==='OFFER_EXPIRED');
  assert.equal(new Set([...f.store.assignments.values()].map(x=>x.courierId)).size,1);
  assert.equal([...f.store.assignments.values()][0].courierId,'courier2');
  assert.equal(f.engine.listAssigned('courier1').length,0);
  assert.equal(f.engine.listAssigned('courier2').length,1);
});

test('preflight refuses mismatched checkout / buyer / delivery PIN and foreign merchant', () => {
  for(const field of ['checkoutGroupId','customerId','deliveryAddress','groupDeliveryPinHash']) {
    const f=fixture();f.store.orders.get('order_tokki')[field]=field==='groupDeliveryPinHash'?hashPin('5555'):'other';
    assert.throws(f.create, e=>e.code==='MERCHANT_OR_ORDER_INVALID' || e.code==='CHECKOUT_DESTINATION_MISMATCH');
    assert.equal(f.store.tasks.get('task_master').multiTripId,undefined);
    assert.equal(f.store.multiTrips?.size||0,0);
  }
  const f=fixture();f.store.merchants.get('tokki').restaurantId='another';
  assert.throws(f.create, e=>e.code==='MERCHANT_OR_ORDER_INVALID');
});

test('merchant opt-in, policy and per-task status prevent bypass', () => {
  const f=fixture();f.store.merchants.get('master').allowMultistopShared=false;
  assert.throws(f.create, e=>e.code==='MERCHANT_OR_ORDER_INVALID');
  f.store.merchants.get('master').allowMultistopShared=true;
  f.store.merchants.get('master').deliveryPolicy='OWN_ONLY';
  assert.throws(f.create, e=>e.code==='MERCHANT_OR_ORDER_INVALID');
  f.store.merchants.get('master').deliveryPolicy='SHARED_ONLY';
  f.store.tasks.get('task_tokki').status='ASSIGNED';
  assert.throws(f.create, e=>e.code==='TASK_NOT_ELIGIBLE');
});

test('duplicate task, duplicate group and reserved task cannot go to individual dispatch', () => {
  const f=fixture();assert.throws(()=>f.engine.createTrip({checkoutGroupId:checkout,taskIds:['task_master','task_master'],payoutAmount:30}),
    e=>e.code==='INVALID_TRIP');
  f.create();
  assert.throws(f.create, e=>e.code==='GROUP_ALREADY_EXISTS');
  const single=createHybridDispatchEngine({store:f.store,now:f.now});
  assert.equal(single.offersForCourier('courier1').length,0);
});

test('offer expiry and stale GPS both block acceptance and no task mutates', () => {
  const f=fixture();const offer=f.create().offerId;
  f.tick(30000);
  assert.deepEqual(f.engine.offersFor('courier1'),[]);
  assert.throws(()=>f.accept(offer),e=>e.code==='OFFER_EXPIRED');
  assert.equal(f.store.tasks.get('task_master').status,'OFFERING');
  const g=fixture();const offer2=g.create().offerId;
  g.store.couriers.get('courier1').presence.lastSeenAt=new Date('2026-10-23T18:40:00Z').toISOString();
  assert.deepEqual(g.engine.offersFor('courier1'),[]);
  assert.throws(()=>g.accept(offer2),e=>e.code==='TRIP_ALREADY_CLAIMED');
});

// Fields the individual dispatcher needs to offer each task on its own.
const individual = f => { for (const t of f.store.tasks.values()) Object.assign(t, { deliveryPolicy: 'SHARED_ONLY',
  fallbackSeconds: 30, maxDistanceKm: 10, payoutAmount: 30, offeringStartedAt: f.now().toISOString() }); };
const freshGps = f => { for (const c of f.store.couriers.values()) c.presence.lastSeenAt = f.now().toISOString(); };

test('expired route offer frees its tasks: individual dispatch resumes and the group can be offered again', () => {
  const f=fixture();individual(f);const first=f.create();
  const single=createHybridDispatchEngine({store:f.store,now:f.now});
  assert.equal(single.offersForCourier('courier1').length,0);
  f.tick(30000);freshGps(f);
  // Resumes on the deadline itself, even before the multistop engine sweeps the route.
  assert.equal(new Set(single.offersForCourier('courier1').map(o=>o.taskId)).size,2);
  const again=f.create();
  assert.notEqual(again.tripId,first.tripId);
  assert.equal(f.engine.trips.get(first.tripId).status,'EXPIRED');
  assert.equal(f.store.tasks.get('task_master').multiTripId,again.tripId);
  assert.equal(single.offersForCourier('courier1').length,0);
  assert.throws(()=>f.accept(first.offerId),e=>e.code==='OFFER_EXPIRED');
  assert.equal(f.accept(again.offerId).status,'ASSIGNED');
});

test('an accepted route keeps its tasks after the offer deadline', () => {
  const f=fixture();individual(f);const trip=f.accept(f.create().offerId);
  f.tick(60000);freshGps(f);
  assert.deepEqual(f.engine.offersFor('courier2'),[]);
  assert.equal(f.engine.trips.get(trip.id).status,'ASSIGNED');
  assert.equal(f.store.tasks.get('task_master').multiTripId,trip.id);
  assert.equal(createHybridDispatchEngine({store:f.store,now:f.now}).offersForCourier('courier2').length,0);
  assert.equal(f.pickup(trip,'task_master','1234').pickedCount,1);
});

test('single-task pickup/delivery cannot confirm a route stop outside the route', () => {
  const f=fixture();const trip=f.accept(f.create().offerId);
  for(const t of f.store.tasks.values()) t.deliveryPinHash=hashPin('1111');
  const single=createHybridDispatchEngine({store:f.store,now:f.now});
  assert.throws(()=>single.confirmPickup({taskId:'task_tokki',courierId:'courier1',pickupPin:'5678'}),e=>e.code==='MULTI_TRIP_STOP');
  const a=f.pickup(trip,'task_master','1234');
  assert.throws(()=>single.confirmDelivery({taskId:'task_master',courierId:'courier1',deliveryPin:'1111'}),e=>e.code==='MULTI_TRIP_STOP');
  assert.equal(f.store.orders.get('order_tokki').status,'READY');
  assert.equal(f.store.orders.get('order_master').status,'ON_THE_WAY');
  const b=f.pickup(a,'task_tokki','5678');
  assert.equal(f.deliver(b,'9090').status,'DELIVERED');
});

test('another courier cannot see, pick up or deliver assigned route', () => {
  const f=fixture();const trip=f.accept(f.create().offerId);
  assert.throws(()=>f.pickup(trip,'task_master','1234','courier2'),e=>e.code==='TRIP_FORBIDDEN');
  assert.throws(()=>f.deliver(trip,'9090','courier2'),e=>e.code==='TRIP_FORBIDDEN');
  assert.equal(f.engine.listAssigned('courier2').length,0);
});

test('stale version prevents replay of pickup without changing state', () => {
  const f=fixture();const trip=f.accept(f.create().offerId);
  assert.throws(()=>f.engine.pickup({tripId:trip.id,taskId:'task_master',courierId:'courier1',
    pickupPin:'1234',expectedVersion:trip.version-1}),e=>e.code==='STALE_TRIP');
  assert.equal(f.store.orders.get('order_master').status,'READY');
});

test('rejects impossible group before any writes', () => {
  const f=fixture();
  assert.throws(()=>f.engine.createTrip({checkoutGroupId:checkout,taskIds:['task_master'],payoutAmount:33}),e=>e.code==='INVALID_TRIP');
  assert.throws(()=>f.engine.createTrip({checkoutGroupId:checkout,taskIds:['task_master','task_tokki'],payoutAmount:-3}),e=>e.code==='INVALID_TRIP');
  assert.equal(f.store.multiTrips?.size||0,0);
});

function routeFixture({ enabled = true, production = false } = {}) {
  const f = fixture();
  const registry = new Map();
  const router = {
    use() { return this; },
    get(path, handler) { registry.set('GET ' + path, handler); return this; },
    post(path, handler) { registry.set('POST ' + path, handler); return this; },
    put(path, handler) { registry.set('PUT ' + path, handler); return this; },
  };
  const env = {
    NODE_ENV: process.env.NODE_ENV,
    MARKETPLACE_MULTISTOP_STAGING_ENABLED: process.env.MARKETPLACE_MULTISTOP_STAGING_ENABLED,
    MARKETPLACE_IDENTITY_MODE: process.env.MARKETPLACE_IDENTITY_MODE,
  };
  process.env.NODE_ENV = production ? 'production' : 'test';
  process.env.MARKETPLACE_MULTISTOP_STAGING_ENABLED = enabled ? 'true' : 'false';
  process.env.MARKETPLACE_IDENTITY_MODE = 'staging';
  try {
    require('../src/routes/marketplace-dispatch.routes')({
      Router: () => router, getStore: () => f.store, now: f.now,
      authenticate: (_req, _res, run) => run(),
    });
  } finally {
    for(const [name, val] of Object.entries(env)) {
      if (val === undefined) delete process.env[name]; else process.env[name] = val;
    }
  }
  function call(method, pathname, { user = 'courier1', role = 'DELIVERY', body = {}, params = {}, query = {} } = {}) {
    const callback = registry.get(method + ' ' + pathname);
    if (!callback) return { missing: true };
    const req = { user: { id: user, role, isActive: true }, body, params, query, headers: {} };
    const res = {
      statusCode: 200, jsonBody: null,
      set() { return this; },
      status(status) { this.statusCode = status; return this; },
      json(data) { this.jsonBody = data; return this; },
    };
    callback(req, res, () => {});
    return { status: res.statusCode, body: res.jsonBody };
  }
  return { f, call, registry };
}

test('HTTP feature gate absent by default and always absent in production', () => {
  for (const mode of [{enabled:false}, {enabled:true,production:true}]) {
    const routes = routeFixture(mode);
    assert.equal(routes.registry.has('POST /ops/multi-trips'), false);
    assert.equal(routes.registry.has('GET /couriers/me/multi-offers'), false);
    assert.equal(routes.registry.has('POST /couriers/multi-trips/:tripId/deliver'), false);
  }
});

test('HTTP staging: only platform admin can create, offers are private, courier cannot impersonate', () => {
  const {f,call} = routeFixture();
  const data={checkoutGroupId:checkout,taskIds:['task_master','task_tokki'],payoutAmount:35};
  const blocked=call('POST','/ops/multi-trips',{user:'store_admin',role:'ADMIN',body:data});
  assert.equal(blocked.status,403);
  assert.equal(f.store.multiTrips.size,0);
  const created=call('POST','/ops/multi-trips',{user:'platform',role:'SUPER_ADMIN',body:data});
  assert.equal(created.status,201);
  const own=call('GET','/couriers/me/multi-offers',{user:'courier1'});
  assert.equal(own.status,200);
  assert.equal(own.body.offers.length,1);
  assert.equal('deliveryAddress' in own.body.offers[0],false);
  const forged=call('GET','/couriers/me/multi-offers',{user:'courier1',query:{courierId:'courier2'}});
  assert.equal(forged.status,403);
  const admin=call('GET','/couriers/me/multi-offers',{user:'platform',role:'SUPER_ADMIN'});
  assert.equal(admin.status,403);
  const claimed=call('POST','/couriers/multi-offers/:offerId/accept',{
    user:'courier1', params:{offerId:created.body.offerId},
  });
  assert.equal(claimed.status,200);
  assert.equal(claimed.body.trip.stops.length,2);
  assert.equal(claimed.body.trip.deliveryAddress,null);
  const other=call('GET','/couriers/me/multi-trips',{user:'courier2'});
  assert.equal(other.body.trips.length,0);
  const ownTrip=call('GET','/couriers/me/multi-trips',{user:'courier1'});
  assert.equal(ownTrip.body.trips.length,1);
  const pickup=call('POST','/couriers/multi-trips/:tripId/stops/:taskId/pickup',{
    user:'courier1',params:{tripId:claimed.body.trip.id,taskId:'task_master'},
    body:{pickupPin:'1234',expectedVersion:claimed.body.trip.version},
  });
  assert.equal(pickup.status,200);
  assert.equal(pickup.body.trip.pickedCount,1);
  const denied=call('POST','/couriers/multi-trips/:tripId/stops/:taskId/pickup',{
    user:'courier2',params:{tripId:claimed.body.trip.id,taskId:'task_tokki'},
    body:{pickupPin:'5678',expectedVersion:pickup.body.trip.version},
  });
  assert.equal(denied.status,404);
  const pending=call('POST','/couriers/multi-trips/:tripId/deliver',{
    user:'courier1',params:{tripId:claimed.body.trip.id},
    body:{deliveryPin:'9090',expectedVersion:pickup.body.trip.version},
  });
  assert.equal(pending.status,409);
  const pickup2=call('POST','/couriers/multi-trips/:tripId/stops/:taskId/pickup',{
    user:'courier1',params:{tripId:claimed.body.trip.id,taskId:'task_tokki'},
    body:{pickupPin:'5678',expectedVersion:pickup.body.trip.version},
  });
  assert.equal(pickup2.status,200);
  const delivered=call('POST','/couriers/multi-trips/:tripId/deliver',{
    user:'courier1',params:{tripId:claimed.body.trip.id},
    body:{deliveryPin:'9090',expectedVersion:pickup2.body.trip.version},
  });
  assert.equal(delivered.status,200);
  assert.equal(delivered.body.trip.status,'DELIVERED');
});

test('HTTP staging: single-task endpoints refuse route stops', () => {
  const {f,call} = routeFixture();
  const created=call('POST','/ops/multi-trips',{user:'platform',role:'SUPER_ADMIN',
    body:{checkoutGroupId:checkout,taskIds:['task_master','task_tokki'],payoutAmount:35}});
  call('POST','/couriers/multi-offers/:offerId/accept',{user:'courier1',params:{offerId:created.body.offerId}});
  const bypass=call('POST','/couriers/tasks/:id/pickup',{user:'courier1',params:{id:'task_tokki'},body:{pickupPin:'5678'}});
  assert.equal(bypass.status,409);
  assert.equal(bypass.body.errorCode,'MULTI_TRIP_STOP');
  assert.equal(f.store.orders.get('order_tokki').status,'READY');
});
