'use strict';

const { createHash } = require('node:crypto');
const { NOT_DISPATCHABLE, PIPELINE_SELECT, storeDeliveredMarketplace, networkMarketplace } = require('./marketplace-store-delivery');

const STAFF = new Set(['CASHIER', 'MANAGER', 'ADMIN', 'OWNER', 'SUPER_ADMIN']);
const TYPES = new Set(['CUSTOMER_UNREACHABLE', 'WRONG_ADDRESS', 'DAMAGED_OR_REJECTED']);
const METHODS = new Set(['CASH', 'CARD_PRESENT', 'TRANSFER', 'COURTESY', 'PENDING', 'CARD',
  'OXXO', 'SPEI', 'CASH_ON_DELIVERY', 'QR_CODE', 'EMPLOYEE_ACCOUNT', 'MIXED', 'TRANSFER_PENDING']);
const TX = { maxWait: 5000, timeout: 15000 };
const ORDER_SELECT = { id: true, restaurantId: true, locationId: true, deliveryDriverId: true,
  orderType: true, source: true, status: true, deliveryFee: true, notes: true,
  paymentMethod: true, paymentStatus: true,
  restaurant: { select: { tenantId: true } },
  marketplacePipeline: { select: PIPELINE_SELECT } };
const INCIDENT_SELECT = { id: true, orderId: true, courierId: true, actorId: true, type: true,
  reason: true, notes: true, callAttempts: true, occurredAt: true, loggedAt: true,
  photoMimeType: true, photoBytes: true };

class DeliveryIncidentError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'DeliveryIncidentError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, statusCode = 400) {
  if (!ok) throw new DeliveryIncidentError(code, message, statusCode);
}
function id(value) {
  check(typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value), 'INVALID_ID', 'Identificador invalido');
  return value;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function text(value, max) {
  if (value == null) return '';
  check(typeof value === 'string' && value.length <= max && !value.includes('\0'), 'INVALID_TEXT', 'Texto invalido');
  return value.trim();
}
function date(value, now) {
  check((typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)),
  'INVALID_TIMESTAMP', 'Fecha invalida');
  const result = new Date(value);
  check(Number.isFinite(result.getTime()) && result.getTime() <= now.getTime() + 300000,
    'INVALID_TIMESTAMP', 'Fecha invalida o futura');
  return result;
}
function image(value, maxBytes) {
  if (value == null) return null;
  check(typeof value === 'string' && value.length > 0 && value.length <= Math.ceil(maxBytes / 3) * 4 + 100,
    'INVALID_IMAGE', 'Imagen vacia o demasiado grande');
  const match = /^(?:data:(image\/(?:png|jpeg|webp));base64,)?([A-Za-z0-9+/]+={0,2})$/.exec(value);
  check(match && match[2].length % 4 === 0, 'INVALID_IMAGE', 'Formato de imagen invalido');
  const bytes = Buffer.from(match[2], 'base64');
  check(bytes.length <= maxBytes && bytes.toString('base64') === match[2], 'INVALID_IMAGE', 'Base64 invalido');
  let mime;
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    && bytes.toString('ascii', 12, 16) === 'IHDR') mime = 'image/png';
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) mime = 'image/jpeg';
  else if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF'
    && bytes.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  check(mime && (!match[1] || match[1] === mime), 'INVALID_IMAGE', 'Tipo de imagen invalido');
  return { base64: `data:${mime};base64,${match[2]}`, mime, bytes: bytes.length };
}
function actorScope({ actor, restaurantId }) {
  check(actor?.id && actor.isActive === true && !actor.isDevice, 'UNAUTHORIZED', 'Sesion humana activa requerida', 401);
  check(actor.role === 'DELIVERY' || STAFF.has(actor.role), 'FORBIDDEN', 'Rol no autorizado', 403);
  const scope = restaurantId || actor.restaurantId;
  check(scope && (actor.role === 'SUPER_ADMIN' || (actor.restaurantId === scope && actor.tenantId)),
    'TENANT_FORBIDDEN', 'Restaurante no autorizado', 403);
  return id(scope);
}
function assignedCourier(order) {
  // Pedidos propios y los del marketplace que entrega la tienda: su repartidor asignado.
  if (!networkMarketplace(order)) return order.deliveryDriverId;
  const pipeline = order.marketplacePipeline;
  const task = pipeline?.dispatch?.task;
  check(pipeline?.restaurantId === order.restaurantId && task?.orderId === order.id
    && task.restaurantId === order.restaurantId, 'DISPATCH_UNAVAILABLE', 'Despacho no disponible', 409);
  return task.currentAssignment?.courierId;
}
async function authorizedOrder(tx, { orderId, restaurantId, actor, courierId, lock = false }) {
  if (lock) {
    const rows = await tx.$queryRaw`SELECT "id" FROM "orders"
      WHERE "id" = ${orderId} AND "restaurantId" = ${restaurantId} FOR UPDATE`;
    check(rows.length === 1, 'ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
  }
  const order = await tx.order.findFirst({ where: { id: orderId, restaurantId }, select: ORDER_SELECT });
  check(order && order.orderType === 'DELIVERY', 'ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
  check(actor.role === 'SUPER_ADMIN' || order.restaurant?.tenantId === actor.tenantId,
    'TENANT_FORBIDDEN', 'Tenant no autorizado', 403);
  const assigned = assignedCourier(order);
  if (actor.role === 'DELIVERY') {
    check(assigned === actor.id && (!courierId || courierId === actor.id), 'COURIER_FORBIDDEN', 'Asignacion no autorizada', 403);
  } else if (actor.locationId) {
    check(actor.locationId === order.locationId, 'LOCATION_FORBIDDEN', 'Sucursal no autorizada', 403);
  }
  if (courierId) check(assigned === courierId, 'COURIER_FORBIDDEN', 'Repartidor no asignado', 403);
  return order;
}
function database(client) {
  check(typeof client?.$transaction === 'function' && client.deliveryIncident && client.deliveryEvidence,
    'DELIVERY_STORAGE_UNAVAILABLE', 'Persistencia de entrega no disponible', 503);
  return client;
}
function receipt(row) { return { success: true, incidentId: row.id, loggedAt: row.loggedAt }; }

// storeDeliveryPin: createStoreDeliveryPin() de ./store-delivery-pin. Opcional;
// sin él (pruebas antiguas) la entrega de pedidos propios no pide PIN.
// `consumePaidOrder(tx, orderId, restaurantId, options)`: descuenta el inventario
// de un pedido al quedar pagado, en la misma transacción (services/order-inventory).
function createDeliveryIncidentsService({ now = () => new Date(), logger = console, storeDeliveryPin = null,
  consumePaidOrder = null } = {}) {
  async function logIncident({ orderId, body, idempotencyKey, actor, restaurantId, prismaClient, io }) {
    const scope = actorScope({ actor, restaurantId }); id(orderId);
    check(object(body) && (!body.orderId || body.orderId === orderId), 'ORDER_ID_MISMATCH', 'Pedido invalido');
    const courierId = id(body.courierId); const incident = body.incident;
    check(object(incident) && TYPES.has(incident.type), 'INVALID_INCIDENT', 'Tipo de incidencia invalido');
    check(idempotencyKey == null || (typeof idempotencyKey === 'string'
      && /^[\x21-\x7e]{1,200}$/.test(idempotencyKey)), 'INVALID_IDEMPOTENCY_KEY', 'Clave de idempotencia invalida');
    const at = now(); const occurredAt = incident.timestamp == null ? null : date(incident.timestamp, at);
    const callAttempts = incident.callAttempts ?? 0;
    check(Number.isInteger(callAttempts) && callAttempts >= 0 && callAttempts <= 1000,
      'INVALID_CALL_ATTEMPTS', 'Numero de llamadas invalido');
    check(incident.photo == null || incident.photoBase64 == null || incident.photo === incident.photoBase64,
      'IMAGE_CONFLICT', 'Fotos incompatibles');
    const photo = image(incident.photoBase64 ?? incident.photo, 5 * 1024 * 1024);
    const data = { courierId, actorId: actor.id, type: incident.type, reason: text(incident.reason, 500),
      notes: text(incident.notes, 4000), callAttempts, occurredAt: occurredAt?.toISOString() ?? null,
      photoBase64: photo?.base64 ?? null };
    const requestHash = hash(data);
    const result = await database(prismaClient).$transaction(async tx => {
      const order = await authorizedOrder(tx, { orderId, restaurantId: scope, actor, courierId, lock: true });
      if (idempotencyKey) {
        const previous = await tx.deliveryIncident.findFirst({ where: { restaurantId: scope, orderId, idempotencyKey } });
        if (previous) {
          check(previous.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'La clave ya identifica otra incidencia', 409);
          return { row: previous, order, created: false };
        }
      }
      const row = await tx.deliveryIncident.create({ data: { ...data, restaurantId: scope, orderId,
        occurredAt: occurredAt || at, loggedAt: at, photoMimeType: photo?.mime ?? null,
        photoBytes: photo?.bytes ?? null, idempotencyKey: idempotencyKey ?? null, requestHash } });
      return { row, order, created: true };
    }, TX);
    // Socket.IO is a best-effort notice after commit. Polling GET remains authoritative.
    if (result.created && io) {
      try {
        const room = result.order.locationId ? `restaurant:${scope}:location:${result.order.locationId}:admins`
          : `restaurant:${scope}:admins`;
        io.to(room).emit('delivery:incident', {
          ...receipt(result.row), orderId, courierId, type: result.row.type,
          restaurantId: scope, locationId: result.order.locationId });
      } catch { logger.warn('[delivery] incident_socket_unavailable', { incidentId: result.row.id }); }
    }
    return receipt(result.row);
  }

  async function listIncidents({ orderId, actor, restaurantId, prismaClient, limit = 50, cursor }) {
    const scope = actorScope({ actor, restaurantId }); id(orderId);
    check(Number.isInteger(limit) && limit >= 1 && limit <= 100, 'INVALID_LIMIT', 'Limite invalido');
    if (cursor != null) id(cursor);
    return database(prismaClient).$transaction(async tx => {
      await authorizedOrder(tx, { orderId, restaurantId: scope, actor });
      const where = { restaurantId: scope, orderId };
      if (cursor) {
        const previous = await tx.deliveryIncident.findFirst({ where: { ...where, id: cursor }, select: { id: true, loggedAt: true } });
        check(previous, 'INVALID_CURSOR', 'Cursor invalido');
        where.OR = [{ loggedAt: { gt: previous.loggedAt } }, { loggedAt: previous.loggedAt, id: { gt: cursor } }];
      }
      const rows = await tx.deliveryIncident.findMany({ where, select: INCIDENT_SELECT,
        orderBy: [{ loggedAt: 'asc' }, { id: 'asc' }], take: limit });
      return rows.map(row => ({ ...row, timestamp: row.occurredAt.getTime(), hasPhoto: Boolean(row.photoBytes) }));
    }, { ...TX, isolationLevel: 'RepeatableRead' });
  }

  async function updateStatus({ orderId, driverId, body, actor, restaurantId, prismaClient }) {
    const scope = actorScope({ actor, restaurantId }); id(orderId); id(driverId);
    check(object(body) && ['ON_THE_WAY', 'DELIVERED'].includes(body.status), 'INVALID_STATUS', 'Estado no permitido');
    const { status, paymentMethod } = body;
    check(paymentMethod == null || METHODS.has(paymentMethod), 'INVALID_PAYMENT_METHOD', 'Metodo de pago invalido');
    const at = now(); let evidence;
    if (body.evidence !== undefined) {
      check(status === 'DELIVERED' && object(body.evidence), 'INVALID_EVIDENCE', 'Evidencia requiere entrega');
      const photo = image(body.evidence.photoBase64, 5 * 1024 * 1024);
      const signature = image(body.evidence.signatureBase64, 1024 * 1024);
      check(photo || signature, 'INVALID_EVIDENCE', 'Foto o firma requerida');
      const deliveredAt = body.evidence.deliveredAt == null ? null : date(body.evidence.deliveredAt, at);
      evidence = { photoBase64: photo?.base64 ?? null, signatureBase64: signature?.base64 ?? null,
        deliveredAt: deliveredAt?.toISOString() ?? null };
    }
    return database(prismaClient).$transaction(async tx => {
      const existing = await authorizedOrder(tx, { orderId, restaurantId: scope, actor, courierId: driverId, lock: true });
      check(!['CANCELLED'].includes(existing.status) && !(existing.status === 'DELIVERED' && status !== 'DELIVERED'),
        'INVALID_TRANSITION', 'El pedido no permite este cambio', 409);
      // Red compartida: la entrega se confirma con PIN en el despacho. Los del
      // marketplace que entrega la tienda siguen el flujo propio, con el PIN del comprador.
      const marketplace = networkMarketplace(existing);
      const byStore = storeDeliveredMarketplace(existing);
      check(!marketplace || (existing.status === 'DELIVERED' && status === 'DELIVERED' && !paymentMethod),
        'PIN_CONFIRMATION_REQUIRED', 'Confirma la entrega Marketplace mediante PIN antes de adjuntar evidencia', 409);
      if (byStore && existing.status !== 'DELIVERED') {
        check(!NOT_DISPATCHABLE.includes(existing.status), 'ORDER_NOT_ACCEPTED', 'La tienda aun no acepta este pedido', 409);
        // El cobro ya quedó fijado en la orden: en línea no se cobra nada; en efectivo, solo efectivo.
        check(paymentMethod == null || (existing.paymentStatus !== 'PAID' && paymentMethod === 'CASH'), 'INVALID_PAYMENT_METHOD',
          existing.paymentStatus === 'PAID' ? 'El pedido ya se pago en linea; no cobres nada' : 'Este pedido del marketplace se paga en efectivo', 409);
      }
      check(!(existing.orderType === 'DELIVERY' && !(Number(existing.deliveryFee) > 0)
        && /ENV[IÍ]O POR ASIGNAR/i.test(existing.notes || '')),
      'SHIPPING_FEE_PENDING', 'Captura el costo de envio antes de continuar', 409);
      // PIN de entrega de pedidos propios: lo verifica el repartidor antes de
      // cualquier escritura. El personal de la tienda conserva su override y un
      // replay de un pedido ya entregado no lo vuelve a pedir.
      if (!marketplace && actor.role === 'DELIVERY' && status === 'DELIVERED' && existing.status !== 'DELIVERED') {
        // Sin verificador no se puede cerrar un pedido del marketplace: su PIN es obligatorio.
        check(storeDeliveryPin || !byStore, 'DELIVERY_PIN_UNAVAILABLE', 'Verificacion del codigo no disponible', 503);
      }
      if (storeDeliveryPin && !marketplace && actor.role === 'DELIVERY' && status === 'DELIVERED'
        && existing.status !== 'DELIVERED') {
        try {
          await storeDeliveryPin.assertCourierPin(existing, body.deliveryPin);
        } catch (error) {
          if (error && error.code && error.statusCode) throw new DeliveryIncidentError(error.code, error.message, error.statusCode);
          throw error;
        }
      }
      const driver = await tx.employee.findFirst({ where: { id: driverId, role: 'DELIVERY', isActive: true,
        location: { restaurantId: scope } }, select: { id: true } });
      check(driver, 'DRIVER_NOT_FOUND', 'Repartidor no encontrado', 404);
      let evidenceReceipt;
      if (evidence) {
        const requestHash = hash({ ...evidence, courierId: driverId });
        let saved = await tx.deliveryEvidence.findFirst({ where: { restaurantId: scope, orderId } });
        if (saved) check(saved.requestHash === requestHash, 'EVIDENCE_CONFLICT', 'La evidencia original es inmutable', 409);
        else saved = await tx.deliveryEvidence.create({ data: { ...evidence, restaurantId: scope, orderId,
          courierId: driverId, actorId: actor.id, requestHash,
          deliveredAt: evidence.deliveredAt ? new Date(evidence.deliveredAt) : at, recordedAt: at } });
        evidenceReceipt = { id: saved.id, deliveredAt: saved.deliveredAt, recordedAt: saved.recordedAt,
          hasPhoto: Boolean(saved.photoBase64), hasSignature: Boolean(saved.signatureBase64) };
      }
      // A replay cannot undo a cashier's later reconciliation or duplicate income.
      if (!marketplace && existing.status !== 'DELIVERED') {
        const data = { status };
        if (paymentMethod) data.paymentMethod = paymentMethod === 'TRANSFER_PENDING' ? 'TRANSFER' : paymentMethod;
        // Pagado en línea (marketplace): la entrega no toca el cobro.
        if (status === 'DELIVERED' && !(byStore && existing.paymentStatus === 'PAID')) {
          const pending = !paymentMethod || ['CASH', 'CASH_ON_DELIVERY', 'TRANSFER_PENDING', 'PENDING'].includes(paymentMethod);
          Object.assign(data, pending ? { paymentStatus: 'PENDING', cashCollected: false, paidAt: null }
            : { paymentStatus: 'PAID', paidAt: at });
        }
        const updated = await tx.order.updateMany({ where: { id: orderId, restaurantId: scope, status: existing.status }, data });
        check(updated.count === 1, 'ORDER_CONFLICT', 'El pedido cambio; reintenta', 409);
        await tx.orderStatusHistory.create({ data: { orderId, status,
          note: JSON.stringify({ actorId: actor.id, courierId: driverId, evidenceId: evidenceReceipt?.id ?? null }) } });
        // Cobrado al entregar (tarjeta/transferencia confirmada): el inventario se
        // consume aquí. El efectivo se consume cuando la caja lo concilia.
        if (data.paymentStatus === 'PAID' && consumePaidOrder) {
          await consumePaidOrder(tx, orderId, scope, { confirmedExternalPayment: true });
        }
      }
      const order = await tx.order.findFirst({ where: { id: orderId, restaurantId: scope },
        include: { items: { include: { menuItem: true } }, user: true } });
      if (!marketplace && order.status === 'DELIVERED' && ['CASH', 'CASH_ON_DELIVERY'].includes(order.paymentMethod)
        && order.paymentStatus !== 'PAID') {
        const where = { driverId, orderId, category: 'DELIVERY', type: 'INCOME' };
        if (!await tx.driverCashMovement.findFirst({ where })) await tx.driverCashMovement.create({ data: {
          ...where, amount: Number(order.total) || 0, description: `Cobro entrega ${order.orderNumber || orderId}` } });
      }
      return { order: evidenceReceipt ? { ...order, evidence: evidenceReceipt } : order,
        changed: existing.status !== order.status };
    }, TX);
  }
  return { logIncident, listIncidents, updateStatus };
}

module.exports = { createDeliveryIncidentsService, DeliveryIncidentError };
