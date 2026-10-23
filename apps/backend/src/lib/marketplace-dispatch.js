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
  if ((offer.taskId !== undefined && offer.taskId !== task.id)
    || (offer.dispatchVersion !== undefined && offer.dispatchVersion !== task.version)
    || task.currentAssignmentId || task.currentAssignment?.status === 'ACTIVE') {
    offer.status = OFFER_STATUS.EXPIRED;
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

  if (!verifyPin(pickupPin, task.pickupPinHash)) {
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

  if (!verifyPin(deliveryPin, task.deliveryPinHash)) {
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

function evaluateFallback({ task, policy = task.deliveryPolicy || 'OWN_THEN_SHARED', fallbackSeconds = task.fallbackSeconds ?? 30, now = new Date() }) {
  if (task.status !== TASK_STATUS.OFFERING) {
    return { shouldFallbackToShared: false, reason: 'TASK_NOT_OFFERING' };
  }

  if (policy !== 'OWN_THEN_SHARED' || task.dispatchMode === 'SHARED') {
    return { shouldFallbackToShared: false, reason: 'POLICY_NOT_OWN_THEN_SHARED' };
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const taskReadyTime = new Date(task.offeringStartedAt || task.readyAt || task.createdAt).getTime();
  if (!Number.isFinite(currentTime) || !Number.isFinite(taskReadyTime)
    || !Number.isInteger(fallbackSeconds) || fallbackSeconds < 0) {
    throw new DispatchError('Ventana de fallback invalida', 'INVALID_FALLBACK', 422);
  }
  const elapsedSeconds = (currentTime - taskReadyTime) / 1000;
  if (elapsedSeconds >= fallbackSeconds) {
    return {
      shouldFallbackToShared: true,
      reason: 'FALLBACK_TIMEOUT_EXCEEDED',
      elapsedSeconds,
    };
  }

  return { shouldFallbackToShared: false, reason: 'WAITING_OWN_WINDOW', remainingSeconds: Math.max(0, fallbackSeconds - elapsedSeconds) };
}

function rankCandidates({ couriers = [], pickupLat, pickupLng, maxDistanceKm = 10, maxStaleSeconds = 90, now = new Date() }) {
  if (!validCoordinates(pickupLat, pickupLng)) {
    throw new DispatchError('Coordenadas de pickup invalidas', 'INVALID_PICKUP_COORDINATES', 400);
  }

  const currentTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  return couriers
    .filter(courier => {
      if (!courier.isOnline) return false;
      if (!courier.presence || !validCoordinates(courier.presence.lat, courier.presence.lng)) {
        return false;
      }
      // Check location staleness
      const lastSeen = new Date(courier.presence.lastSeenAt || 0).getTime();
      const ageSeconds = (currentTime - lastSeen) / 1000;
      return ageSeconds >= 0 && ageSeconds <= maxStaleSeconds;
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

function validCoordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function validateDeliveryPolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(key => !['deliveryPolicy', 'fallbackSeconds', 'maxDistanceKm'].includes(key))
    || !DELIVERY_POLICIES.includes(input.deliveryPolicy)
    || !Number.isInteger(input.fallbackSeconds) || input.fallbackSeconds < 0 || input.fallbackSeconds > 3600
    || !Number.isFinite(input.maxDistanceKm) || input.maxDistanceKm <= 0 || input.maxDistanceKm > 100) {
    throw new DispatchError('Politica, fallbackSeconds (0-3600) o maxDistanceKm (0-100] invalidos', 'INVALID_DELIVERY_POLICY', 422);
  }
  return { deliveryPolicy: input.deliveryPolicy, fallbackSeconds: input.fallbackSeconds, maxDistanceKm: input.maxDistanceKm };
}

/** Synchronous unit of work over one authoritative Map store. No awaits may be
 * inserted between checks and writes. A database adapter must replace this unit
 * with a transaction/CAS; this implementation makes no multi-process guarantee.
 * Merchant, affiliation and courier eligibility records are server-owned.
 */
function createHybridDispatchEngine({ store, now = () => new Date() }) {
  for (const key of ['tasks', 'offers', 'couriers', 'merchants', 'affiliations', 'assignments', 'orders']) {
    if (!store[key]) store[key] = new Map();
    if (!(store[key] instanceof Map)) throw new TypeError(`${key} must be a Map`);
  }
  function at() {
    const date = now();
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new DispatchError('Reloj invalido', 'INVALID_CLOCK', 503);
    return new Date(date);
  }
  function taskFor(id) {
    const task = store.tasks.get(id);
    if (!task) throw new DispatchError('Tarea no encontrada', 'TASK_NOT_FOUND', 404);
    return task;
  }
  function merchantFor(taskOrId) {
    const id = typeof taskOrId === 'string' ? taskOrId : taskOrId.merchantId;
    const merchant = store.merchants.get(id);
    if (!merchant || (typeof taskOrId === 'object' && (merchant.restaurantId !== taskOrId.restaurantId
      || merchant.locationId !== taskOrId.locationId))) {
      throw new DispatchError('Comercio no encontrado', 'MERCHANT_NOT_FOUND', 404);
    }
    return merchant;
  }
  function orderFor(task) {
    const order = store.orders.get(task.orderId);
    if (!order || order.restaurantId !== task.restaurantId || order.locationId !== task.locationId
      || ['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(order.status)) {
      throw new DispatchError('Orden no disponible', 'ORDER_UNAVAILABLE', 409);
    }
    return order;
  }
  function affiliation(courierId, task) {
    return [...store.affiliations.values()].find(row => row.courierId === courierId
      && row.merchantId === task.merchantId && row.status === 'ACTIVE' && row.canTakeOwnOrders === true
      && (row.restaurantId === undefined || row.restaurantId === task.restaurantId)
      && (row.locationId === undefined || row.locationId === task.locationId));
  }
  function busy(courierId) {
    return [...store.tasks.values()].some(task => task.currentAssignment?.courierId === courierId
      && task.currentAssignment.status === 'ACTIVE')
      || [...store.assignments.values()].some(assignment => assignment.courierId === courierId && assignment.status === 'ACTIVE');
  }
  function eligible(courier, task, source, date) {
    if (!courier || courier.isActive !== true || busy(courier.id)) return false;
    if (source === 'OWN' ? !affiliation(courier.id, task)
      : courier.isShared !== true || courier.presence?.acceptingShared !== true) return false;
    return rankCandidates({ couriers: [courier], pickupLat: task.pickupLat, pickupLng: task.pickupLng,
      maxDistanceKm: task.maxDistanceKm, now: date }).length === 1;
  }
  function expireOffers(task) {
    for (const offer of store.offers.values()) {
      if (offer.taskId === task.id && offer.status === OFFER_STATUS.OFFERED) offer.status = OFFER_STATUS.EXPIRED;
    }
  }
  function checkVersion(task, expectedVersion) {
    if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion !== (task.version || 0))) {
      throw new OfferAlreadyClaimedError();
    }
  }
  function bump(task, date) {
    task.version = (task.version || 0) + 1;
    task.updatedAt = date.toISOString();
  }
  function snapshot(task, merchant) {
    Object.assign(task, validateDeliveryPolicy({ deliveryPolicy: merchant.deliveryPolicy,
      fallbackSeconds: merchant.fallbackSeconds ?? 30, maxDistanceKm: merchant.maxDistanceKm ?? 10 }));
    if (!validCoordinates(task.pickupLat, task.pickupLng) || !Number.isFinite(task.payoutAmount)
      || task.payoutAmount < 0 || Math.round(task.payoutAmount * 100) / 100 !== task.payoutAmount
      || !/^[a-f0-9]{64}$/.test(task.pickupPinHash) || !/^[a-f0-9]{64}$/.test(task.deliveryPinHash)) {
      throw new DispatchError('Tarea sin ubicacion, tarifa o PIN verificados', 'INVALID_TASK', 422);
    }
  }
  function offerWave(task, date, onlyCourierId) {
    const source = task.dispatchMode;
    if (task.status !== TASK_STATUS.OFFERING || !DISPATCH_MODES.includes(source)) return [];
    const pending = [...store.offers.values()].filter(offer => offer.taskId === task.id
      && offer.status === OFFER_STATUS.OFFERED && offer.dispatchVersion === task.version
      && new Date(offer.expiresAt) > date);
    const selected = onlyCourierId || task.selectedCourierId;
    const couriers = [...store.couriers.values()].filter(courier => (!selected || courier.id === selected)
      && eligible(courier, task, source, date) && !pending.some(offer => offer.courierId === courier.id));
    const ranked = rankCandidates({ couriers, pickupLat: task.pickupLat, pickupLng: task.pickupLng,
      maxDistanceKm: task.maxDistanceKm, now: date });
    const offers = ranked.map(candidate => ({ id: crypto.randomUUID(), taskId: task.id, courierId: candidate.courierId,
      merchantId: task.merchantId, restaurantId: task.restaurantId, source, dispatchVersion: task.version,
      affiliationId: source === 'OWN' ? affiliation(candidate.courierId, task).id : null,
      status: OFFER_STATUS.OFFERED, payoutAmount: task.payoutAmount, currency: task.currency || 'MXN',
      createdAt: date.toISOString(), expiresAt: new Date(Math.min(date.getTime() + 30000,
        source === 'OWN' && task.deliveryPolicy === 'OWN_THEN_SHARED'
          ? new Date(task.offeringStartedAt).getTime() + task.fallbackSeconds * 1000 : Infinity)).toISOString() }));
    for (const offer of offers) store.offers.set(offer.id, offer);
    return offers;
  }
  function configurePolicy({ merchantId, ...input }) {
    const merchant = merchantFor(merchantId);
    const policy = validateDeliveryPolicy(input);
    Object.assign(merchant, policy);
    return { merchantId, ...policy };
  }
  function startDispatch({ taskId, expectedVersion }) {
    const task = taskFor(taskId); const merchant = merchantFor(task); orderFor(task);
    checkVersion(task, expectedVersion);
    if (task.status !== TASK_STATUS.WAITING_READY || task.currentAssignmentId || task.offeringStartedAt) throw new OfferAlreadyClaimedError();
    const date = at();
    // Validate on a copy so a rejected start cannot partially alter a task.
    const config = { ...task }; snapshot(config, merchant);
    Object.assign(task, config);
    task.offeringStartedAt = date.toISOString();
    task.dispatchMode = task.deliveryPolicy === 'MANUAL' ? null
      : task.deliveryPolicy === 'SHARED_ONLY' || task.deliveryPolicy === 'OWN_THEN_SHARED' && task.fallbackSeconds === 0 ? 'SHARED' : 'OWN';
    if (task.deliveryPolicy !== 'MANUAL') task.status = TASK_STATUS.OFFERING;
    bump(task, date);
    return { task, offers: offerWave(task, date) };
  }
  function requestShared({ taskId, expectedVersion, automatic = false }) {
    const task = taskFor(taskId); const merchant = merchantFor(task); orderFor(task);
    checkVersion(task, expectedVersion);
    if (![TASK_STATUS.WAITING_READY, TASK_STATUS.OFFERING, TASK_STATUS.ASSIGNED, TASK_STATUS.REASSIGNING].includes(task.status)
      || task.pickedUpAt || task.currentAssignment?.pickedUpAt) throw new OfferAlreadyClaimedError();
    const date = at();
    if (automatic && !evaluateFallback({ task, now: date }).shouldFallbackToShared) throw new OfferAlreadyClaimedError();
    if (!task.deliveryPolicy) { const config = { ...task }; snapshot(config, merchant); Object.assign(task, config); }
    if (task.dispatchMode === 'SHARED') return { task, offers: [], idempotent: true };
    expireOffers(task);
    if (task.currentAssignment) {
      task.currentAssignment.status = 'CANCELLED';
      task.currentAssignment.endedAt = date.toISOString();
      task.currentAssignment.endReason = 'REQUEST_SHARED';
    }
    task.currentAssignment = null; task.currentAssignmentId = null;
    task.selectedCourierId = null;
    task.dispatchMode = 'SHARED'; task.status = TASK_STATUS.OFFERING;
    task.offeringStartedAt ||= date.toISOString();
    bump(task, date);
    return { task, offers: offerWave(task, date), idempotent: false };
  }
  function assignOwn({ taskId, courierId, expectedVersion }) {
    const task = taskFor(taskId); const merchant = merchantFor(task); orderFor(task);
    checkVersion(task, expectedVersion);
    if (![TASK_STATUS.WAITING_READY, TASK_STATUS.OFFERING].includes(task.status) || task.currentAssignmentId
      || task.dispatchMode === 'SHARED') throw new OfferAlreadyClaimedError();
    const date = at(); const config = { ...task };
    if (!config.deliveryPolicy) snapshot(config, merchant);
    if (config.offeringStartedAt && evaluateFallback({ task: config, now: date }).shouldFallbackToShared) throw new OfferAlreadyClaimedError();
    if (config.deliveryPolicy === 'SHARED_ONLY' || !eligible(store.couriers.get(courierId), config, 'OWN', date)) {
      throw new DispatchError('Repartidor propio no disponible', 'COURIER_FORBIDDEN', 403);
    }
    Object.assign(task, config); expireOffers(task);
    task.status = TASK_STATUS.OFFERING; task.dispatchMode = 'OWN'; task.offeringStartedAt ||= date.toISOString();
    task.selectedCourierId = courierId;
    bump(task, date);
    return { task, offers: offerWave(task, date, courierId) };
  }
  function tick() {
    const date = at();
    for (const offer of store.offers.values()) {
      if (offer.status === OFFER_STATUS.OFFERED && new Date(offer.expiresAt) <= date) offer.status = OFFER_STATUS.EXPIRED;
    }
    for (const task of store.tasks.values()) {
      if (!task.deliveryPolicy || task.status !== TASK_STATUS.OFFERING) continue;
      // Cancelled orders stop dispatch without releasing new offers.
      try { merchantFor(task); orderFor(task); } catch { expireOffers(task); continue; }
      if (evaluateFallback({ task, now: date }).shouldFallbackToShared) {
        requestShared({ taskId: task.id, expectedVersion: task.version, automatic: true });
      } else offerWave(task, date);
    }
  }
  function acceptOffer({ offerId, courierId }) {
    const offer = store.offers.get(offerId);
    if (!offer) throw new DispatchError('Oferta no encontrada', 'OFFER_NOT_FOUND', 404);
    const task = taskFor(offer.taskId); merchantFor(task); orderFor(task);
    const date = at();
    // Evaluate the deadline before accepting an own offer, even without polling.
    if (offer.courierId !== courierId) throw new DispatchError('Oferta ajena', 'COURIER_FORBIDDEN', 403);
    if (evaluateFallback({ task, now: date }).shouldFallbackToShared) {
      requestShared({ taskId: task.id, expectedVersion: task.version, automatic: true });
      throw new OfferAlreadyClaimedError();
    }
    if (offer.status !== OFFER_STATUS.OFFERED || task.status !== TASK_STATUS.OFFERING
      || offer.dispatchVersion !== task.version || offer.source !== task.dispatchMode || task.currentAssignmentId
      || [...store.assignments.values()].some(assignment => assignment.taskId === task.id && assignment.status === 'ACTIVE')) {
      throw new OfferAlreadyClaimedError();
    }
    if (offer.merchantId !== task.merchantId || offer.restaurantId !== task.restaurantId
      || offer.source === 'OWN' && offer.affiliationId !== affiliation(courierId, task)?.id
      || !eligible(store.couriers.get(courierId), task, offer.source, date)) {
      throw new DispatchError('Repartidor no autorizado o no disponible', 'COURIER_FORBIDDEN', 403);
    }
    const result = atomicAcceptOffer({ task, offer, courierId, now: date });
    result.assignment.affiliationId = offer.affiliationId;
    result.assignment.merchantId = task.merchantId;
    result.assignment.restaurantId = task.restaurantId;
    store.assignments.set(result.assignment.id, result.assignment);
    expireOffers(task); bump(task, date);
    return result;
  }
  function confirm(kind, { taskId, courierId, pickupPin, deliveryPin, expectedVersion }) {
    const task = taskFor(taskId); merchantFor(task); const order = orderFor(task);
    checkVersion(task, expectedVersion);
    if (task.currentAssignment?.courierId !== courierId || task.currentAssignment.status !== 'ACTIVE') {
      throw new DispatchError('Asignacion no autorizada', 'COURIER_FORBIDDEN', 403);
    }
    if (kind === 'pickup' && order.status !== 'READY') throw new DispatchError('Orden aun no lista', 'ORDER_NOT_READY', 409);
    if (kind === 'delivery' && order.status !== 'ON_THE_WAY') throw new DispatchError('Orden no recogida', 'ORDER_NOT_PICKED_UP', 409);
    const date = at();
    const result = kind === 'pickup' ? confirmPickup({ task, pickupPin, now: date }) : confirmDelivery({ task, deliveryPin, now: date });
    order.status = result.orderStatusUpdate;
    bump(task, date);
    return result;
  }
  function offersForCourier(courierId) {
    tick();
    const date = at();
    return [...store.offers.values()].filter(offer => {
      const task = store.tasks.get(offer.taskId);
      return offer.courierId === courierId && offer.status === OFFER_STATUS.OFFERED && new Date(offer.expiresAt) > date
        && task?.status === TASK_STATUS.OFFERING && offer.dispatchVersion === task.version
        && eligible(store.couriers.get(courierId), task, offer.source, date);
    });
  }
  return { store, taskFor, merchantFor, configurePolicy, startDispatch, requestShared, assignOwn, tick, acceptOffer, offersForCourier,
    confirmPickup: input => confirm('pickup', input), confirmDelivery: input => confirm('delivery', input) };
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
  validateDeliveryPolicy,
  createHybridDispatchEngine,
  validCoordinates,
};
