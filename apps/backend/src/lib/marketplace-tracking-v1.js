'use strict';

const crypto = require('node:crypto');

const MAX_SIGNAL_AGE_MS = 90000;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const digest = token => crypto.createHash('sha256').update(token).digest('hex');

class MarketplaceTrackingError extends Error {
  constructor(code, message, statusCode) {
    super(message); this.name = 'MarketplaceTrackingError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status) { if (!ok) throw new MarketplaceTrackingError(code, message, status); }
function text(value) { return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value; }
function coordinates(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function timestamp(value) {
  if (!(value instanceof Date) && (typeof value !== 'string' || value.length === 0)) return NaN;
  return new Date(value).getTime();
}
function matchesHash(actual, expected) {
  return typeof expected === 'string' && TOKEN_PATTERN.test(expected)
    && crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

/** Read-only ports. They must return snapshots, not live mutable entity objects.
 * taskStore.findByOrderId({orderId, trackingTokenHash, at}) returns:
 *   {orderId,restaurantId,trackingTokenHash,trackingExpiresAt,order,task?}.
 *   order is the real Marketplace Order (id,restaurantId,locationId,source,status).
 *   task includes currentAssignmentId/currentAssignment and confirmed pickedUpAt.
 * locationStore.findById({locationId,restaurantId}) returns the actual Location
 *   {id,restaurantId,latitude,longitude}. Missing GPS yields origin:null. There is
 *   deliberately no RestaurantConfig or environment/global-coordinate fallback.
 * presenceStore.findForAssignment({courierId,assignmentId,taskId,orderId,restaurantId,locationId})
 *   returns a single current {courierId,assignmentId,taskId,orderId,lat,lng,lastSeenAt}.
 *   All four IDs are checked; a courier's global/latest-other-order GPS is unsafe.
 * No default store initializes Prisma, an app, network clients or a history query.
 */
function createMarketplaceTrackingService({ locationStore, presenceStore, taskStore, now = () => new Date() } = {}) {
  function at() {
    const value = now();
    check(value instanceof Date && Number.isFinite(value.getTime()), 'INVALID_CLOCK', 'Reloj no disponible', 503);
    return new Date(value);
  }
  function authorize(record, orderId, tokenHash, date) {
    const order = record?.order;
    check(record?.orderId === orderId && order?.id === orderId && order.source === 'MARKETPLACE'
      && text(order.restaurantId) && record.restaurantId === order.restaurantId && text(order.locationId) && text(order.status)
      && matchesHash(tokenHash, record.trackingTokenHash) && timestamp(record.trackingExpiresAt) > date.getTime(),
    'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    return record;
  }
  function scopedTask(record) {
    const { order, task } = record;
    return text(task?.id) && task.orderId === order.id && task.restaurantId === order.restaurantId
      && task.locationId === order.locationId && text(task.status) ? task : null;
  }
  function assignmentFor(record, date) {
    const { order } = record;
    const task = scopedTask(record);
    const assignment = task?.currentAssignment;
    if (order.status !== 'ON_THE_WAY' || task?.status !== 'PICKED_UP'
      || !text(task.id) || task.orderId !== order.id || task.restaurantId !== order.restaurantId
      || task.locationId !== order.locationId || !text(task.currentAssignmentId)
      || assignment?.id !== task.currentAssignmentId || assignment.taskId !== task.id
      || assignment.status !== 'ACTIVE' || !text(assignment.courierId)
      || assignment.restaurantId !== undefined && assignment.restaurantId !== order.restaurantId) return null;
    const taskPickup = timestamp(task.pickedUpAt);
    const assignmentPickup = timestamp(assignment.pickedUpAt);
    if (!Number.isFinite(taskPickup) || !Number.isFinite(assignmentPickup)
      || taskPickup > date.getTime() || assignmentPickup > date.getTime()) return null;
    const pickupAt = Math.max(taskPickup, assignmentPickup);
    return { courierId: assignment.courierId, assignmentId: assignment.id, taskId: task.id, orderId: order.id,
      restaurantId: order.restaurantId, locationId: order.locationId, pickupAt };
  }
  function freshPosition(presence, assignment, date) {
    if (!presence || !['courierId', 'assignmentId', 'taskId', 'orderId'].every(key => presence[key] === assignment[key])
      || presence.isOnline === false || !coordinates(presence.lat, presence.lng)) return null;
    const lastSeen = timestamp(presence.lastSeenAt);
    const age = date.getTime() - lastSeen;
    // At exactly 90s the signal is no longer recent (<90s). Signals from before
    // this pickup or from the future never become a customer's current position.
    if (!Number.isFinite(age) || age < 0 || age >= MAX_SIGNAL_AGE_MS || lastSeen < assignment.pickupAt) return null;
    if (presence.expiresAt !== undefined && !(timestamp(presence.expiresAt) > date.getTime())) return null;
    return { lat: presence.lat, lng: presence.lng };
  }
  async function getOrderTracking({ orderId, trackingToken } = {}) {
    check(typeof trackingToken === 'string' && TOKEN_PATTERN.test(trackingToken), 'INVALID_TRACKING_TOKEN', 'Token de rastreo requerido o invalido', 401);
    check(text(orderId), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    check(typeof taskStore?.findByOrderId === 'function' && typeof locationStore?.findById === 'function'
      && typeof presenceStore?.findForAssignment === 'function', 'TRACKING_UNAVAILABLE', 'Rastreo no disponible', 503);
    const tokenHash = digest(trackingToken);
    const read = async date => {
      const record = await taskStore.findByOrderId({ orderId, trackingTokenHash: tokenHash, at: date });
      // Copy even if a faulty adapter returns references to live state. A mutation
      // across an await must be detected by the second read, not alter our baseline.
      return authorize(record ? structuredClone(record) : null, orderId, tokenHash, at());
    };
    const before = await read(at());
    const location = await locationStore.findById({ locationId: before.order.locationId, restaurantId: before.order.restaurantId });
    const origin = location?.id === before.order.locationId && location.restaurantId === before.order.restaurantId
      && coordinates(location.latitude, location.longitude) ? { lat: location.latitude, lng: location.longitude } : null;
    const assignment = assignmentFor(before, at());
    const loadedPresence = assignment ? await presenceStore.findForAssignment({ courierId: assignment.courierId,
      assignmentId: assignment.assignmentId, taskId: assignment.taskId, orderId, restaurantId: assignment.restaurantId,
      locationId: assignment.locationId }) : null;
    const presence = loadedPresence ? structuredClone(loadedPresence) : null;
    const after = await read(at());
    const date = at(); authorize(after, orderId, tokenHash, date);
    const current = assignmentFor(after, date);
    const unchanged = assignment && current && Object.keys(assignment).every(key => assignment[key] === current[key]);
    const position = unchanged ? freshPosition(presence, current, date) : null;
    const sameBranch = before.order.locationId === after.order.locationId && before.order.restaurantId === after.order.restaurantId;
    // Explicit projection: no courier ID/name/phone, PINs, delivery addresses,
    // tracking tokens, historical coordinates or location-record internals.
    return { orderId, status: after.order.status, taskStatus: scopedTask(after)?.status ?? null,
      origin: sameBranch ? origin : null, courierLocation: position, isStale: Boolean(current && !position) };
  }
  return { getOrderTracking };
}

module.exports = { MarketplaceTrackingError, createMarketplaceTrackingService, MAX_SIGNAL_AGE_MS };
