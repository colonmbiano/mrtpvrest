'use strict';

/**
 * Staging-only in-memory multistop group. Never use this Map implementation
 * for paid orders or multiple backend replicas. A Prisma transaction + CAS,
 * persisted idempotency and an outbox are REQUIRED for production.
 */
const crypto = require('node:crypto');
const {
  DispatchError, assertNetworkPin, validCoordinates,
  TASK_STATUS, rankCandidates,
} = require('./marketplace-dispatch');

const bad = (code, status = 409) => { throw new DispatchError(code, code, status); };
const fresh = (courier, when) =>
  Boolean(courier && courier.isActive === true && courier.isShared === true
    && courier.isOnline === true && courier.presence?.acceptingShared === true
    && validCoordinates(courier.presence?.lat, courier.presence?.lng)
    && Number.isFinite(new Date(courier.presence?.lastSeenAt).getTime())
    && when.getTime() - new Date(courier.presence.lastSeenAt).getTime() >= 0
    && when.getTime() - new Date(courier.presence.lastSeenAt).getTime() < 90000);

const validId = v => typeof v === 'string' && v.length >= 1 && v.length <= 128;
const hashRe = /^[0-9a-f]{64}$/;

function createMultiStopEngine({ store, now = () => new Date() }) {
  for (const table of ['tasks', 'orders', 'couriers', 'merchants', 'offers', 'assignments']) {
    if (!(store?.[table] instanceof Map)) throw new TypeError('Expected dispatch Maps: ' + table);
  }
  const trips = store.multiTrips instanceof Map ? store.multiTrips : (store.multiTrips = new Map());
  const offers = store.multiOffers instanceof Map ? store.multiOffers : (store.multiOffers = new Map());
  const clock = () => {
    const value = now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) bad('INVALID_CLOCK', 503);
    return value;
  };
  const taskFor = id => store.tasks.get(id);
  const tripFor = id => trips.get(id) || bad('TRIP_NOT_FOUND', 404);
  const assigned = (trip, courierId) => {
    if (!validId(courierId) || trip.courierId !== courierId) bad('TRIP_FORBIDDEN', 404);
  };
  const completedCount = trip => trip.stops.filter(s => s.status === 'PICKED_UP' || s.status === 'DELIVERED').length;
  const allPicked = trip => completedCount(trip) === trip.stops.length;
  const view = (trip, courierId) => {
    assigned(trip, courierId);
    const picked = allPicked(trip);
    return {
      id: trip.id, status: trip.status, version: trip.version,
      source: 'SHARED', currency: 'MXN', payoutAmount: trip.payoutAmount,
      pickupCount: trip.stops.length, pickedCount: completedCount(trip),
      stops: trip.stops.map(s => ({
        taskId: s.taskId, merchantId: s.merchantId,
        storeName: s.storeName, pickupAddress: s.pickupAddress, status: s.status,
      })),
      // Destination only once ALL merchant pickups have been verified.
      deliveryAddress: picked ? trip.deliveryAddress : null,
      acceptedAt: trip.acceptedAt, deliveredAt: trip.deliveredAt,
    };
  };
  const released = trip => {
    for (const row of trip.stops) {
      const task = taskFor(row.taskId);
      if (!task || task.status !== 'OFFERING' || task.currentAssignmentId
        || task.currentAssignment?.status === 'ACTIVE' || task.multiTripId !== trip.id) return false;
      const order = store.orders.get(task.orderId);
      if (!order || order.status !== 'READY' || order.checkoutGroupId !== trip.checkoutGroupId) return false;
    }
    return true;
  };
  const available = trip => {
    if (trip.status !== 'OFFERING' || !released(trip)) return false;
    return true;
  };
  // A route nobody accepted before its offer deadline expires: its tasks go back
  // to individual dispatch and the checkout group may be offered again. Without
  // this sweep the tasks stayed reserved forever and the orders never shipped.
  function expireTrips(date) {
    for (const trip of trips.values()) {
      if (trip.status !== 'OFFERING') continue;
      const live = [...offers.values()].some(o => o.tripId === trip.id && o.status === 'OFFERED'
        && new Date(o.expiresAt).getTime() > date.getTime());
      if (live) continue;
      for (const row of offers.values()) {
        if (row.tripId === trip.id && row.status === 'OFFERED') row.status = 'EXPIRED';
      }
      for (const stop of trip.stops) {
        const task = taskFor(stop.taskId);
        if (task?.multiTripId === trip.id) { delete task.multiTripId; delete task.multiTripHoldUntil; }
      }
      trip.status = 'EXPIRED'; trip.version++;
    }
  }

  function createTrip({ checkoutGroupId, taskIds, payoutAmount, ttlSeconds = 30 }) {
    if (!validId(checkoutGroupId) || !Array.isArray(taskIds) || taskIds.length < 2 || taskIds.length > 4
      || new Set(taskIds).size !== taskIds.length || taskIds.some(id => !validId(id))
      || !Number.isFinite(payoutAmount) || payoutAmount <= 0
      || Math.abs(Math.round(payoutAmount * 100) - payoutAmount * 100) > 0.000001
      || !Number.isInteger(ttlSeconds) || ttlSeconds < 10 || ttlSeconds > 120) bad('INVALID_TRIP', 422);
    const date = clock();
    expireTrips(date);
    if ([...trips.values()].some(t => t.checkoutGroupId === checkoutGroupId
      && t.status !== 'CANCELLED' && t.status !== 'EXPIRED')) bad('GROUP_ALREADY_EXISTS', 409);
    const draft = [];
    let customerId, address, deliveryHash;
    const seenMerchants = new Set();
    for (const taskId of taskIds) {
      const task = taskFor(taskId);
      if (!task || task.status !== 'OFFERING' || task.dispatchMode !== 'SHARED'
        || task.currentAssignmentId || task.currentAssignment?.status === 'ACTIVE'
        || !validCoordinates(task.pickupLat, task.pickupLng) || !hashRe.test(task.pickupPinHash))
        bad('TASK_NOT_ELIGIBLE', 409);
      const merchant = store.merchants.get(task.merchantId);
      const order = store.orders.get(task.orderId);
      if (!merchant || merchant.id !== task.merchantId
        || !merchant.allowMultistopShared || !['SHARED_ONLY', 'OWN_THEN_SHARED'].includes(merchant.deliveryPolicy)
        || merchant.restaurantId !== task.restaurantId || merchant.locationId !== task.locationId
        || !order || order.restaurantId !== task.restaurantId || order.locationId !== task.locationId
        || order.status !== 'READY' || order.checkoutGroupId !== checkoutGroupId
        || !validId(order.customerId) || !validId(order.deliveryAddress)
        || !hashRe.test(order.groupDeliveryPinHash) || !validId(merchant.name)
        || !validId(merchant.pickupAddress)) bad('MERCHANT_OR_ORDER_INVALID', 422);
      if (seenMerchants.has(merchant.id) || task.multiTripId) bad('DUPLICATED_MERCHANT_OR_TASK', 409);
      if (customerId !== undefined && customerId !== order.customerId
        || address !== undefined && address !== order.deliveryAddress
        || deliveryHash !== undefined && deliveryHash !== order.groupDeliveryPinHash)
        bad('CHECKOUT_DESTINATION_MISMATCH', 409);
      customerId = order.customerId; address = order.deliveryAddress;
      deliveryHash = order.groupDeliveryPinHash;
      seenMerchants.add(merchant.id);
      draft.push({
        taskId: task.id, merchantId: merchant.id, restaurantId: merchant.restaurantId,
        storeName: merchant.name, pickupAddress: merchant.pickupAddress,
        status: 'PENDING', pickupLat: task.pickupLat, pickupLng: task.pickupLng,
      });
    }
    const trip = {
      id: 'multi_' + crypto.randomUUID(), checkoutGroupId, customerId,
      deliveryAddress: address, deliveryPinHash: deliveryHash,
      status: 'OFFERING', version: 1, courierId: null, payoutAmount,
      createdAt: date.toISOString(), acceptedAt: null, deliveredAt: null, stops: draft,
    };
    const expiresAt = new Date(date.getTime() + ttlSeconds * 1000).toISOString();
    // All validation precedes writes. Single-process only; no DB transaction.
    // The hold ends with the offer, so individual dispatch resumes on its own.
    for (const row of draft) Object.assign(taskFor(row.taskId), { multiTripId: trip.id, multiTripHoldUntil: expiresAt });
    trips.set(trip.id, trip);
    const offer = {
      id: crypto.randomUUID(), tripId: trip.id, status: 'OFFERED', payoutAmount, expiresAt,
    };
    offers.set(offer.id, offer);
    return { tripId: trip.id, offerId: offer.id, pickupCount: draft.length };
  }

  function offersFor(courierId) {
    const date = clock();
    expireTrips(date);
    const courier = store.couriers.get(courierId);
    if (!fresh(courier, date)) return [];
    if ([...store.assignments.values()].some(a => a.courierId === courierId && a.status === 'ACTIVE'))
      return [];
    if ([...trips.values()].some(t => t.courierId === courierId && t.status === 'ASSIGNED'))
      return [];
    return [...offers.values()].filter(offer => {
      const trip = trips.get(offer.tripId);
      if (!trip || !available(trip) || offer.status !== 'OFFERED'
        || new Date(offer.expiresAt).getTime() <= date.getTime()) return false;
      return trip.stops.every(s =>
        rankCandidates({ couriers: [courier], pickupLat: s.pickupLat,
          pickupLng: s.pickupLng, maxDistanceKm: 15, now: date }).length === 1);
    }).map(offer => {
      const trip = trips.get(offer.tripId);
      return { offerId: offer.id, tripId: trip.id, source: 'SHARED',
        pickupCount: trip.stops.length, payoutAmount: trip.payoutAmount,
        currency: 'MXN', expiresAt: offer.expiresAt };
    });
  }

  function accept({ offerId, courierId }) {
    const date = clock();
    expireTrips(date);
    const offer = offers.get(offerId);
    if (!offer) bad('OFFER_NOT_FOUND', 404);
    const trip = tripFor(offer.tripId);
    // Eligibility rechecked AT acceptance (no optimistic or off-network accept).
    if (offer.status !== 'OFFERED' || new Date(offer.expiresAt).getTime() <= date.getTime())
      bad('OFFER_EXPIRED', 410);
    if (!offersFor(courierId).some(row => row.offerId === offerId)
      || !available(trip)) bad('TRIP_ALREADY_CLAIMED', 409);
    const courier = store.couriers.get(courierId);
    if (!fresh(courier, date)) bad('COURIER_NOT_AVAILABLE', 403);
    // Synchronous critical section: one courier claims ALL tasks, never only one.
    for (const row of trip.stops) {
      const task = taskFor(row.taskId);
      const assignment = {
        id: 'ma_' + crypto.randomUUID(), taskId: task.id, courierId,
        source: 'SHARED', status: 'ACTIVE', currency: 'MXN',
        payoutAmount: 0, // Paid ONCE at trip level, not per stop.
        multiTripId: trip.id, acceptedAt: date.toISOString(),
      };
      task.status = TASK_STATUS.ASSIGNED;
      task.currentAssignmentId = assignment.id;
      task.currentAssignment = assignment;
      delete task.multiTripHoldUntil; // Accepted: the route keeps the task for good.
      store.assignments.set(assignment.id, assignment);
    }
    trip.status = 'ASSIGNED'; trip.courierId = courierId;
    trip.acceptedAt = date.toISOString(); trip.version++;
    for (const row of offers.values()) {
      if (row.tripId === trip.id) row.status = 'EXPIRED';
    }
    offer.status = 'ACCEPTED';
    return view(trip, courierId);
  }

  function listAssigned(courierId) {
    return [...trips.values()].filter(t => t.courierId === courierId
      && (t.status === 'ASSIGNED' || t.status === 'DELIVERED'))
      .map(t => view(t, courierId));
  }

  function pickup({ tripId, taskId, courierId, pickupPin, expectedVersion }) {
    const trip = tripFor(tripId); assigned(trip, courierId);
    if (trip.status !== 'ASSIGNED' || expectedVersion !== trip.version) bad('STALE_TRIP', 409);
    const index = trip.stops.findIndex(s => s.taskId === taskId);
    if (index < 0) bad('STOP_NOT_FOUND', 404);
    const stop = trip.stops[index];
    if (stop.status !== 'PENDING') bad('STOP_ALREADY_PICKED_UP', 409);
    if (trip.stops.slice(0, index).some(s => s.status !== 'PICKED_UP'))
      bad('PICKUP_SEQUENCE_REQUIRED', 409);
    const task = taskFor(stop.taskId);
    const order = task && store.orders.get(task.orderId);
    if (!task || task.currentAssignment?.courierId !== courierId
      || task.status !== TASK_STATUS.ASSIGNED || !order || order.status !== 'READY')
      bad('TASK_NOT_READY', 409);
    const date = clock();
    assertNetworkPin({ record: task, kind: 'pickup', pin: pickupPin, expectedHash: task.pickupPinHash, now: date,
      invalidError: new DispatchError('Codigo de recogida incorrecto', 'INVALID_PICKUP_PIN', 403) });
    const stamp = date.toISOString();
    stop.status = 'PICKED_UP'; stop.pickedUpAt = stamp;
    task.status = TASK_STATUS.PICKED_UP; task.pickedUpAt = stamp;
    task.currentAssignment.pickedUpAt = stamp;
    // This merchant's order alone changes status on its pickup.
    order.status = 'ON_THE_WAY';
    trip.version++;
    return view(trip, courierId);
  }

  function deliver({ tripId, courierId, deliveryPin, expectedVersion }) {
    const trip = tripFor(tripId); assigned(trip, courierId);
    if (trip.status !== 'ASSIGNED' || expectedVersion !== trip.version) bad('STALE_TRIP', 409);
    if (!allPicked(trip)) bad('PICKUPS_PENDING', 409);
    for (const row of trip.stops) {
      const task = taskFor(row.taskId);
      const order = task && store.orders.get(task.orderId);
      if (!task || task.status !== 'PICKED_UP' || !order || order.status !== 'ON_THE_WAY'
        || task.currentAssignment?.courierId !== courierId
        || task.currentAssignment.status !== 'ACTIVE')
        bad('INCONSISTENT_STOP', 409);
    }
    const date = clock();
    assertNetworkPin({ record: trip, kind: 'delivery', pin: deliveryPin, expectedHash: trip.deliveryPinHash, now: date,
      invalidError: new DispatchError('Codigo de entrega incorrecto', 'INVALID_DELIVERY_PIN', 403) });
    const stamp = date.toISOString();
    for (const row of trip.stops) {
      const task = taskFor(row.taskId);
      const order = store.orders.get(task.orderId);
      task.status = TASK_STATUS.DELIVERED; task.deliveredAt = stamp;
      task.currentAssignment.status = 'COMPLETED';
      task.currentAssignment.deliveredAt = stamp;
      order.status = 'DELIVERED';
      row.status = 'DELIVERED';
    }
    trip.status = 'DELIVERED'; trip.deliveredAt = stamp; trip.version++;
    return view(trip, courierId);
  }
  return { createTrip, offersFor, accept, listAssigned, pickup, deliver, trips, offers };
}

module.exports = { createMultiStopEngine };
