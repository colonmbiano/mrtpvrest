'use strict';

const {
  TASK_STATUS,
  OFFER_STATUS,
  DispatchError,
  OfferAlreadyClaimedError,
  OfferExpiredError,
  InvalidPinError,
  atomicAcceptOffer,
  confirmPickup,
  confirmDelivery,
  evaluateFallback,
  rankCandidates,
} = require('../lib/marketplace-dispatch');

function createMarketplaceDispatchRouter({ Router, getStore } = {}) {
  const router = (Router || require('express').Router)();

  // In-memory or injected store for dispatch entities
  const defaultStore = {
    tasks: new Map(),
    offers: new Map(),
    couriers: new Map(),
  };

  const store = getStore ? getStore() : defaultStore;

  // Middleware: Cache-Control: no-store
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  // GET /api/marketplace/dispatch/tasks/:id
  router.get('/tasks/:id', (req, res) => {
    const task = store.tasks.get(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Tarea de entrega no encontrada', errorCode: 'TASK_NOT_FOUND' });
    }
    return res.json({
      id: task.id,
      status: task.status,
      dispatchMode: task.dispatchMode,
      currentAssignment: task.currentAssignment || null,
      readyAt: task.readyAt,
      pickedUpAt: task.pickedUpAt,
      deliveredAt: task.deliveredAt,
    });
  });

  // POST /api/marketplace/couriers/me/presence
  router.post('/couriers/me/presence', (req, res) => {
    const { courierId, isOnline, lat, lng, accuracy } = req.body || {};
    if (!courierId || typeof courierId !== 'string') {
      return res.status(400).json({ error: 'courierId requerido', errorCode: 'INVALID_COURIER_ID' });
    }
    if (isOnline && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      return res.status(400).json({ error: 'Coordenadas lat/lng requeridas', errorCode: 'INVALID_COORDINATES' });
    }

    const presence = {
      isOnline: Boolean(isOnline),
      lat: Number(lat),
      lng: Number(lng),
      accuracy: Number(accuracy) || 10,
      lastSeenAt: new Date(),
    };

    let courier = store.couriers.get(courierId);
    if (!courier) {
      courier = { id: courierId, name: req.body?.name || 'Repartidor', isOnline: presence.isOnline, presence };
      store.couriers.set(courierId, courier);
    } else {
      courier.isOnline = presence.isOnline;
      courier.presence = presence;
    }

    return res.json({ success: true, presence });
  });

  // GET /api/marketplace/couriers/me/offers
  router.get('/couriers/me/offers', (req, res) => {
    const courierId = req.query.courierId;
    if (!courierId || typeof courierId !== 'string') {
      return res.status(400).json({ error: 'courierId requerido', errorCode: 'INVALID_COURIER_ID' });
    }

    const now = Date.now();
    const activeOffers = [];

    for (const offer of store.offers.values()) {
      if (offer.courierId === courierId && offer.status === OFFER_STATUS.OFFERED) {
        if (new Date(offer.expiresAt).getTime() > now) {
          activeOffers.push({
            id: offer.id,
            taskId: offer.taskId,
            payoutAmount: offer.payoutAmount,
            currency: offer.currency || 'MXN',
            source: offer.source,
            expiresAt: offer.expiresAt,
          });
        } else {
          offer.status = OFFER_STATUS.EXPIRED;
        }
      }
    }

    return res.json({ offers: activeOffers });
  });

  // POST /api/marketplace/couriers/offers/:id/accept
  router.post('/couriers/offers/:id/accept', (req, res) => {
    const offerId = req.params.id;
    const { courierId } = req.body || {};

    if (!courierId || typeof courierId !== 'string') {
      return res.status(400).json({ error: 'courierId requerido', errorCode: 'INVALID_COURIER_ID' });
    }

    const offer = store.offers.get(offerId);
    if (!offer) {
      return res.status(404).json({ error: 'Oferta no encontrada', errorCode: 'OFFER_NOT_FOUND' });
    }

    const task = store.tasks.get(offer.taskId);
    if (!task) {
      return res.status(404).json({ error: 'Tarea de entrega no encontrada', errorCode: 'TASK_NOT_FOUND' });
    }

    try {
      const result = atomicAcceptOffer({ task, offer, courierId });
      return res.json({
        success: true,
        taskId: task.id,
        assignment: result.assignment,
      });
    } catch (err) {
      if (err instanceof OfferAlreadyClaimedError) {
        return res.status(409).json({ error: err.message, errorCode: err.code });
      }
      if (err instanceof OfferExpiredError) {
        return res.status(410).json({ error: err.message, errorCode: err.code });
      }
      if (err instanceof DispatchError) {
        return res.status(err.statusCode).json({ error: err.message, errorCode: err.code });
      }
      return res.status(500).json({ error: 'Error al aceptar la oferta', errorCode: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/marketplace/couriers/tasks/:id/pickup
  router.post('/couriers/tasks/:id/pickup', (req, res) => {
    const taskId = req.params.id;
    const { pickupPin } = req.body || {};

    const task = store.tasks.get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada', errorCode: 'TASK_NOT_FOUND' });
    }

    try {
      const result = confirmPickup({ task, pickupPin });
      return res.json({
        success: true,
        taskId: task.id,
        status: task.status,
        orderStatusUpdate: result.orderStatusUpdate,
      });
    } catch (err) {
      if (err instanceof InvalidPinError) {
        return res.status(400).json({ error: err.message, errorCode: err.code });
      }
      if (err instanceof DispatchError) {
        return res.status(err.statusCode).json({ error: err.message, errorCode: err.code });
      }
      return res.status(500).json({ error: 'Error al confirmar recogida', errorCode: 'INTERNAL_ERROR' });
    }
  });

  // POST /api/marketplace/couriers/tasks/:id/deliver
  router.post('/couriers/tasks/:id/deliver', (req, res) => {
    const taskId = req.params.id;
    const { deliveryPin } = req.body || {};

    const task = store.tasks.get(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada', errorCode: 'TASK_NOT_FOUND' });
    }

    try {
      const result = confirmDelivery({ task, deliveryPin });
      return res.json({
        success: true,
        taskId: task.id,
        status: task.status,
        orderStatusUpdate: result.orderStatusUpdate,
      });
    } catch (err) {
      if (err instanceof InvalidPinError) {
        return res.status(400).json({ error: err.message, errorCode: err.code });
      }
      if (err instanceof DispatchError) {
        return res.status(err.statusCode).json({ error: err.message, errorCode: err.code });
      }
      return res.status(500).json({ error: 'Error al confirmar entrega', errorCode: 'INTERNAL_ERROR' });
    }
  });

  return router;
}

module.exports = createMarketplaceDispatchRouter;
