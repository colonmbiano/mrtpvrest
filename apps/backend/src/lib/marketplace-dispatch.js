'use strict';

const crypto = require('crypto');

const DISPATCH_MODES = Object.freeze(['OWN', 'SHARED']);
const DELIVERY_POLICIES = Object.freeze(['OWN_ONLY', 'SHARED_ONLY', 'OWN_THEN_SHARED', 'MANUAL']);

const TASK_STATUS = Object.freeze({
  WAITING_READY: 'WAITING_READY',
  OFFERING: 'OFFERING',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  REASSIGNING: 'REASSIGNING',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const OFFER_STATUS = Object.freeze({
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  DECLINED: 'DECLINED',
  EXPIRED: 'EXPIRED',
});

// Allowed state transitions for DeliveryTask
const ALLOWED_TASK_TRANSITIONS = new Map([
  [TASK_STATUS.WAITING_READY, new Set([TASK_STATUS.OFFERING, TASK_STATUS.CANCELLED])],
  [TASK_STATUS.OFFERING, new Set([TASK_STATUS.ASSIGNED, TASK_STATUS.REASSIGNING, TASK_STATUS.CANCELLED, TASK_STATUS.FAILED])],
  [TASK_STATUS.ASSIGNED, new Set([TASK_STATUS.PICKED_UP, TASK_STATUS.REASSIGNING, TASK_STATUS.CANCELLED, TASK_STATUS.FAILED])],
  [TASK_STATUS.PICKED_UP, new Set([TASK_STATUS.DELIVERED, TASK_STATUS.FAILED])],
  [TASK_STATUS.REASSIGNING, new Set([TASK_STATUS.OFFERING, TASK_STATUS.CANCELLED, TASK_STATUS.FAILED])],
  [TASK_STATUS.DELIVERED, new Set()],
  [TASK_STATUS.FAILED, new Set()],
  [TASK_STATUS.CANCELLED, new Set()],
]);

// ── Custom Errors ─────────────────────────────────────────────────────────────

class DispatchError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

class InvalidStateTransitionError extends DispatchError {
  constructor(from, to) {
    super(`Transicion de estado no permitida de ${from} a ${to}`, 'INVALID_STATE_TRANSITION', 400);
  }
}

class OfferAlreadyClaimedError extends DispatchError {
  constructor() {
    super('Esta oferta ya fue tomada por otro repartidor o la tarea cambio de estado', 'OFFER_ALREADY_CLAIMED', 409);
  }
}

class OfferExpiredError extends DispatchError {
  constructor() {
    super('La oferta de entrega ha expirado', 'OFFER_EXPIRED', 410);
  }
}

class InvalidPinError extends DispatchError {
  constructor(target) {
    super(`PIN de verificacion de ${target} invalido`, 'INVALID_PIN', 400);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashPin(pin) {
  if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
    throw new DispatchError('El PIN debe ser una cadena numerica de 4 a 6 digitos', 'INVALID_PIN_FORMAT', 400);
  }
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function verifyPin(inputPin, expectedHash) {
  if (typeof inputPin !== 'string' || !/^\d{4,6}$/.test(inputPin) || !/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const inputHash = crypto.createHash('sha256').update(String(inputPin).trim()).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(expectedHash));
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371; // Earth radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

function canTransitionTask(fromStatus, toStatus) {
  const allowed = ALLOWED_TASK_TRANSITIONS.get(fromStatus);
  return Boolean(allowed && allowed.has(toStatus));
}

function assertTaskTransition(task, toStatus) {
  if (!canTransitionTask(task.status, toStatus)) {
    throw new InvalidStateTransitionError(task.status, toStatus);
  }
}

// ── Atomic CAS (Compare-And-Swap) Accept Engine ───────────────────────────────

function atomicAcceptOffer({ task, offer, courierId, now = new Date() }) {
  if (!offer || offer.status !== OFFER_STATUS.OFFERED) {
    throw new OfferAlreadyClaimedError();
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const expiresTime = new Date(offer.expiresAt).getTime();

  if (!Number.isFinite(currentTime) || !Number.isFinite(expiresTime) || currentTime >= expiresTime) {
    offer.status = OFFER_STATUS.EXPIRED;
    throw new OfferExpiredError();
  }

  if (typeof courierId !== 'string' || !courierId || (offer.courierId !== courierId && !(offer.courierId === null && offer.source === 'SHARED'))) {
    throw new DispatchError('Esta oferta no pertenece al repartidor', 'OFFER_COURIER_MISMATCH', 403);
  }

  // Atomic condition: Task must be OFFERING
  if (task.status !== TASK_STATUS.OFFERING) {
    offer.status = OFFER_STATUS.EXPIRED;
    throw new OfferAlreadyClaimedError();
  }

  // Atomic state change
  task.status = TASK_STATUS.ASSIGNED;
  offer.status = OFFER_STATUS.ACCEPTED;
  offer.courierId = courierId;

  const assignment = {
    id: `asgn_${crypto.randomUUID().slice(0, 12)}`,
    taskId: task.id,
    courierId,
    source: offer.source || 'OWN',
    payoutAmount: offer.payoutAmount,
    currency: offer.currency || 'MXN',
    status: 'ACTIVE',
    acceptedAt: new Date(currentTime),
    pickedUpAt: null,
    deliveredAt: null,
  };

  task.currentAssignmentId = assignment.id;
  task.currentAssignment = assignment;
  task.updatedAt = new Date(currentTime);

  return { task, offer, assignment };
}

// ── Verification Transitions ──────────────────────────────────────────────────

function confirmPickup({ task, pickupPin, now = new Date() }) {
  assertTaskTransition(task, TASK_STATUS.PICKED_UP);

  if (task.pickupPinHash && !verifyPin(pickupPin, task.pickupPinHash)) {
    throw new InvalidPinError('recogida');
  }

  const currentTime = now instanceof Date ? now : new Date(now);
  task.status = TASK_STATUS.PICKED_UP;
  task.pickedUpAt = currentTime;
  task.updatedAt = currentTime;

  if (task.currentAssignment) {
    task.currentAssignment.pickedUpAt = currentTime;
  }

  // Invariant: Order status moves to ON_THE_WAY ONLY upon pickup
  return {
    task,
    orderStatusUpdate: 'ON_THE_WAY',
  };
}

function confirmDelivery({ task, deliveryPin, now = new Date() }) {
  assertTaskTransition(task, TASK_STATUS.DELIVERED);

  if (task.deliveryPinHash && !verifyPin(deliveryPin, task.deliveryPinHash)) {
    throw new InvalidPinError('entrega');
  }

  const currentTime = now instanceof Date ? now : new Date(now);
  task.status = TASK_STATUS.DELIVERED;
  task.deliveredAt = currentTime;
  task.updatedAt = currentTime;

  if (task.currentAssignment) {
    task.currentAssignment.status = 'COMPLETED';
    task.currentAssignment.deliveredAt = currentTime;
  }

  // Invariant: Order status moves to DELIVERED
  return {
    task,
    orderStatusUpdate: 'DELIVERED',
  };
}

// ── Fallback Evaluation & Courier Ranking ─────────────────────────────────────

function evaluateFallback({ task, offers = [], policy = 'OWN_THEN_SHARED', fallbackSeconds = 30, now = new Date() }) {
  if (task.status !== TASK_STATUS.OFFERING) {
    return { shouldFallbackToShared: false, reason: 'TASK_NOT_OFFERING' };
  }

  if (policy !== 'OWN_THEN_SHARED') {
    return { shouldFallbackToShared: false, reason: 'POLICY_NOT_OWN_THEN_SHARED' };
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const taskReadyTime = new Date(task.readyAt || task.createdAt || currentTime).getTime();
  const elapsedSeconds = (currentTime - taskReadyTime) / 1000;

  // Check if all OWN offers have expired or been declined
  const ownOffers = offers.filter(o => o.source === 'OWN');
  const allOwnSettled = ownOffers.length > 0 && ownOffers.every(o => o.status === OFFER_STATUS.EXPIRED || o.status === OFFER_STATUS.DECLINED);

  if (allOwnSettled || elapsedSeconds >= fallbackSeconds) {
    return {
      shouldFallbackToShared: true,
      reason: allOwnSettled ? 'ALL_OWN_OFFERS_SETTLED' : 'FALLBACK_TIMEOUT_EXCEEDED',
      elapsedSeconds,
    };
  }

  return { shouldFallbackToShared: false, reason: 'WAITING_OWN_WINDOW', remainingSeconds: Math.max(0, fallbackSeconds - elapsedSeconds) };
}

function rankCandidates({ couriers = [], pickupLat, pickupLng, maxDistanceKm = 10, maxStaleSeconds = 90, now = new Date() }) {
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    throw new DispatchError('Coordenadas de pickup invalidas', 'INVALID_PICKUP_COORDINATES', 400);
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  return couriers
    .filter(courier => {
      if (!courier.isOnline) return false;
      if (!courier.presence || !Number.isFinite(courier.presence.lat) || !Number.isFinite(courier.presence.lng)) {
        return false;
      }
      // Check location staleness
      const lastSeen = new Date(courier.presence.lastSeenAt || 0).getTime();
      const ageSeconds = (currentTime - lastSeen) / 1000;
      return ageSeconds <= maxStaleSeconds;
    })
    .map(courier => {
      const distanceKm = haversineDistanceKm(pickupLat, pickupLng, courier.presence.lat, courier.presence.lng);
      return {
        courierId: courier.id,
        name: courier.name,
        source: courier.isAffiliated ? 'OWN' : 'SHARED',
        vehicleType: courier.vehicleType || 'MOTO',
        distanceKm,
        accuracy: courier.presence.accuracy || 10,
      };
    })
    .filter(candidate => candidate.distanceKm <= maxDistanceKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Build a shared-network offer and task; persistence belongs to the order transaction.
 * Only PIN hashes enter the dispatch payload. All times use JSON-safe ISO snapshots.
 */
function createOffer({ orderId, restaurantId, payoutAmount, pickupPinHash, deliveryPinHash, now = new Date(), ttlSeconds = 30 }) {
  if (typeof orderId !== 'string' || !orderId || typeof restaurantId !== 'string' || !restaurantId
    || !Number.isFinite(payoutAmount) || payoutAmount < 0 || Math.round(payoutAmount * 100) / 100 !== payoutAmount
    || !/^[a-f0-9]{64}$/.test(pickupPinHash) || !/^[a-f0-9]{64}$/.test(deliveryPinHash)
    || !(now instanceof Date) || !Number.isFinite(now.getTime()) || !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
    throw new DispatchError('Oferta marketplace invalida', 'INVALID_OFFER', 400);
  }
  const task = { id: crypto.randomUUID(), orderId, restaurantId, status: TASK_STATUS.OFFERING,
    dispatchMode: 'SHARED', pickupPinHash, deliveryPinHash, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  const offer = { id: crypto.randomUUID(), taskId: task.id, courierId: null, status: OFFER_STATUS.OFFERED,
    source: 'SHARED', payoutAmount, currency: 'MXN', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString() };
  return { task, offer };
}

module.exports = {
  DISPATCH_MODES,
  DELIVERY_POLICIES,
  TASK_STATUS,
  OFFER_STATUS,
  DispatchError,
  InvalidStateTransitionError,
  OfferAlreadyClaimedError,
  OfferExpiredError,
  InvalidPinError,
  hashPin,
  verifyPin,
  haversineDistanceKm,
  canTransitionTask,
  assertTaskTransition,
  atomicAcceptOffer,
  confirmPickup,
  confirmDelivery,
  evaluateFallback,
  rankCandidates,
  createOffer,
};
