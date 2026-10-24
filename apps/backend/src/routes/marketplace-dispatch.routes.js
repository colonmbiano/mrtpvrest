'use strict';

const { DispatchError, createHybridDispatchEngine, validCoordinates, validateDeliveryPolicy } = require('../lib/marketplace-dispatch');
const { createMultiStopEngine } = require('../lib/marketplace-multistop');

function createMarketplaceDispatchRouter({ Router, getStore, authenticate, now = () => new Date() } = {}) {
  const router = (Router || require('express').Router)();
  const engine = createHybridDispatchEngine({ store: getStore ? getStore() : {}, now });
  const { store } = engine;
  // Synthetic/staging-only: these maps do NOT persist across process restarts.
  const multiStopEnabled = process.env.NODE_ENV !== 'production'
    && process.env.MARKETPLACE_MULTISTOP_STAGING_ENABLED === 'true'
    && process.env.MARKETPLACE_IDENTITY_MODE === 'staging';
  const multiStop = multiStopEnabled ? createMultiStopEngine({ store, now }) : null;
  const fail = (message, code, status = 403) => { throw new DispatchError(message, code, status); };

  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  function actor(req) {
    const user = req.user;
    if (!user || !user.id || user.isActive !== true || user.isDevice) fail('Sesion humana activa requerida', 'UNAUTHENTICATED', 401);
    return user;
  }
  function merchantAccess(req, merchant) {
    const user = actor(req);
    if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) fail('Administrador requerido', 'MERCHANT_FORBIDDEN');
    if (user.role !== 'SUPER_ADMIN' && (user.restaurantId !== merchant.restaurantId
      || user.locationId && user.locationId !== merchant.locationId)) fail('Comercio no encontrado', 'MERCHANT_NOT_FOUND', 404);
  }
  function courierAccess(req) {
    const user = actor(req);
    const courier = store.couriers.get(user.id);
    if (user.role !== 'DELIVERY' || !courier || courier.isActive !== true) fail('Repartidor no autorizado', 'COURIER_FORBIDDEN');
    // Legacy clients may send an ID, but it is never the identity authority.
    if ((req.body?.courierId !== undefined && req.body.courierId !== user.id)
      || (req.query?.courierId !== undefined && req.query.courierId !== user.id)) fail('Identidad de repartidor incorrecta', 'COURIER_FORBIDDEN');
    return courier;
  }
  function body(req, fields) {
    const input = req.body ?? {};
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) {
      fail('Campos de solicitud invalidos', 'INVALID_REQUEST', 422);
    }
    return input;
  }
  function view(task) {
    const assignment = task.currentAssignment;
    return { id: task.id, status: task.status, dispatchMode: task.dispatchMode, version: task.version,
      deliveryPolicy: task.deliveryPolicy, fallbackSeconds: task.fallbackSeconds, maxDistanceKm: task.maxDistanceKm,
      currentAssignment: assignment ? { id: assignment.id, courierId: assignment.courierId,
        source: assignment.source, status: assignment.status } : null,
      readyAt: task.readyAt, pickedUpAt: task.pickedUpAt, deliveredAt: task.deliveredAt };
  }
  function endpoint(method, paths, handler) {
    for (const path of Array.isArray(paths) ? paths : [paths]) router[method](path, (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      function run() {
        try { actor(req); return handler(req, res); }
        catch (error) {
          if (error instanceof DispatchError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
          return res.status(503).json({ error: 'Despacho temporalmente no disponible', errorCode: 'DISPATCH_UNAVAILABLE' });
        }
      }
      // Lazy import keeps offline tests and catalog reads free of DB initialization.
      return (authenticate || require('../middleware/auth.middleware').authenticate)(req, res, run, next);
    });
  }

  // Private read for the active Admin branch. Never infer merchantId from a
  // restaurant id or pick the first merchant when a restaurant has branches.
  endpoint('get', '/merchants/me/delivery-policy', (req, res) => {
    const user = actor(req);
    if (!['OWNER', 'ADMIN', 'SUPER_ADMIN'].includes(user.role)) fail('Administrador requerido', 'MERCHANT_FORBIDDEN');
    const headers = req.headers || {};
    const restaurantId = user.role === 'SUPER_ADMIN' ? headers['x-restaurant-id'] || user.restaurantId : user.restaurantId;
    const locationId = user.locationId || headers['x-location-id'];
    const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
    if (!identifier(restaurantId) || locationId !== undefined && !identifier(locationId)) fail('Selecciona una sucursal', 'MERCHANT_SCOPE_REQUIRED', 422);
    if (headers['x-restaurant-id'] !== undefined && headers['x-restaurant-id'] !== restaurantId
      || user.locationId && headers['x-location-id'] !== undefined && headers['x-location-id'] !== user.locationId) {
      fail('Comercio no encontrado', 'MERCHANT_NOT_FOUND', 404);
    }
    const matches = [...store.merchants.values()].filter(merchant => merchant.restaurantId === restaurantId
      && (!locationId || merchant.locationId === locationId));
    if (matches.length === 0) fail('Comercio no encontrado', 'MERCHANT_NOT_FOUND', 404);
    if (matches.length !== 1) fail('Selecciona una sucursal para configurar el despacho', 'MERCHANT_LOCATION_REQUIRED', 409);
    const merchant = matches[0]; merchantAccess(req, merchant);
    return res.json({ merchantId: merchant.id, ...validateDeliveryPolicy({ deliveryPolicy: merchant.deliveryPolicy ?? 'OWN_THEN_SHARED',
      fallbackSeconds: merchant.fallbackSeconds ?? 30, maxDistanceKm: merchant.maxDistanceKm ?? 10 }) });
  });
  endpoint('put', '/merchants/:id/delivery-policy', (req, res) => {
    const merchant = engine.merchantFor(req.params.id); merchantAccess(req, merchant);
    const policy = body(req, ['deliveryPolicy', 'fallbackSeconds', 'maxDistanceKm']);
    return res.json(engine.configurePolicy({ merchantId: merchant.id, ...policy }));
  });
  endpoint('post', ['/dispatch/tasks/:id/request-shared', '/tasks/:id/request-shared'], (req, res) => {
    const task = engine.taskFor(req.params.id); merchantAccess(req, engine.merchantFor(task));
    const input = body(req, ['expectedVersion']);
    const result = engine.requestShared({ taskId: task.id, ...input });
    return res.json({ success: true, task: view(result.task), idempotent: result.idempotent });
  });
  endpoint('post', '/dispatch/tasks/:id/assign-own', (req, res) => {
    const task = engine.taskFor(req.params.id); merchantAccess(req, engine.merchantFor(task));
    const input = body(req, ['courierId', 'expectedVersion']);
    if (typeof input.courierId !== 'string' || !input.courierId) fail('courierId requerido', 'INVALID_COURIER_ID', 422);
    const result = engine.assignOwn({ taskId: task.id, ...input });
    return res.json({ success: true, task: view(result.task) });
  });
  endpoint('post', '/dispatch/tasks/:id/start', (req, res) => {
    const task = engine.taskFor(req.params.id); merchantAccess(req, engine.merchantFor(task));
    const result = engine.startDispatch({ taskId: task.id, ...body(req, ['expectedVersion']) });
    return res.json({ success: true, task: view(result.task) });
  });
  endpoint('get', ['/dispatch/tasks/:id', '/tasks/:id'], (req, res) => {
    const task = engine.taskFor(req.params.id);
    if (req.user.role === 'DELIVERY') {
      const courier = courierAccess(req);
      if (task.currentAssignment?.courierId !== courier.id) fail('Tarea no encontrada', 'TASK_NOT_FOUND', 404);
    } else merchantAccess(req, engine.merchantFor(task));
    engine.tick();
    return res.json(view(task));
  });
  endpoint('post', '/couriers/me/presence', (req, res) => {
    const courier = courierAccess(req);
    const input = body(req, ['courierId', 'isOnline', 'lat', 'lng', 'accuracy', 'acceptingShared']);
    if (typeof input.isOnline !== 'boolean' || input.isOnline && !validCoordinates(input.lat, input.lng)
      || input.accuracy !== undefined && (!Number.isFinite(input.accuracy) || input.accuracy < 0)
      || input.acceptingShared !== undefined && typeof input.acceptingShared !== 'boolean') {
      fail('Presencia invalida', 'INVALID_PRESENCE', 422);
    }
    courier.isOnline = input.isOnline;
    courier.presence = { lat: input.isOnline ? input.lat : null, lng: input.isOnline ? input.lng : null,
      accuracy: input.accuracy ?? 10, lastSeenAt: now(), acceptingShared: input.acceptingShared ?? courier.presence?.acceptingShared ?? false };
    return res.json({ success: true, presence: courier.presence });
  });
  endpoint('get', '/couriers/me/offers', (req, res) => {
    const courier = courierAccess(req);
    const offers = engine.offersForCourier(courier.id).map(offer => ({ id: offer.id, taskId: offer.taskId,
      payoutAmount: offer.payoutAmount, currency: offer.currency, source: offer.source, expiresAt: offer.expiresAt }));
    return res.json({ offers });
  });
  endpoint('post', '/couriers/offers/:id/accept', (req, res) => {
    const courier = courierAccess(req); body(req, ['courierId']);
    const { task, assignment } = engine.acceptOffer({ offerId: req.params.id, courierId: courier.id });
    return res.json({ success: true, taskId: task.id, assignment });
  });
  for (const kind of ['pickup', 'deliver']) endpoint('post', `/couriers/tasks/:id/${kind}`, (req, res) => {
    const courier = courierAccess(req);
    const input = body(req, ['courierId', kind === 'pickup' ? 'pickupPin' : 'deliveryPin', 'expectedVersion']);
    const result = engine[kind === 'pickup' ? 'confirmPickup' : 'confirmDelivery']({ ...input, taskId: req.params.id, courierId: courier.id });
    return res.json({ success: true, taskId: result.task.id, status: result.task.status, orderStatusUpdate: result.orderStatusUpdate });
  });
  if (multiStop) {
    // Only a platform-level human administrator may compose a group from
    // existing server-owned orders/tasks. No customer-controlled routes.
    endpoint('post', '/ops/multi-trips', (req, res) => {
      if (req.user.role !== 'SUPER_ADMIN') fail('Administrador de plataforma requerido', 'PLATFORM_FORBIDDEN', 403);
      const input = body(req, ['checkoutGroupId', 'taskIds', 'payoutAmount', 'ttlSeconds']);
      return res.status(201).json(multiStop.createTrip(input));
    });
    endpoint('get', '/couriers/me/multi-offers', (req, res) => {
      const courier = courierAccess(req);
      return res.json({ offers: multiStop.offersFor(courier.id) });
    });
    endpoint('post', '/couriers/multi-offers/:offerId/accept', (req, res) => {
      const courier = courierAccess(req);
      body(req, []);
      return res.json({ success: true, trip: multiStop.accept({
        offerId: req.params.offerId, courierId: courier.id,
      }) });
    });
    endpoint('get', '/couriers/me/multi-trips', (req, res) => {
      const courier = courierAccess(req);
      return res.json({ trips: multiStop.listAssigned(courier.id) });
    });
    endpoint('post', '/couriers/multi-trips/:tripId/stops/:taskId/pickup', (req, res) => {
      const courier = courierAccess(req);
      const input = body(req, ['pickupPin', 'expectedVersion']);
      return res.json({ success: true, trip: multiStop.pickup({
        tripId: req.params.tripId, taskId: req.params.taskId, courierId: courier.id, ...input,
      }) });
    });
    endpoint('post', '/couriers/multi-trips/:tripId/deliver', (req, res) => {
      const courier = courierAccess(req);
      const input = body(req, ['deliveryPin', 'expectedVersion']);
      return res.json({ success: true, trip: multiStop.deliver({
        tripId: req.params.tripId, courierId: courier.id, ...input,
      }) });
    });
  }
  return router;
}

module.exports = createMarketplaceDispatchRouter;
