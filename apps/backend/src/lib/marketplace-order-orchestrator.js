'use strict';

const crypto = require('node:crypto');
const { assertQuoteUsable, MarketplaceQuoteError } = require('./marketplace-quote');
const { createOffer, hashPin, validateDeliveryPolicy, TASK_STATUS } = require('./marketplace-dispatch');
const { decimal, MAX_CENTS } = require('./marketplace-order-money');
const { nextOrderNumber } = require('./order-number');

const TX_OPTIONS = Object.freeze({ isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 });
const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const ORDER_SELECT = { id: true, restaurantId: true, locationId: true, clientOrderId: true, orderNumber: true,
  source: true, status: true, paymentStatus: true };
const PIPELINE_SELECT = { orderId: true, restaurantId: true, requestHash: true, settlement: true, dispatch: true,
  pinKeyId: true, pickupPinHash: true, deliveryPinHash: true, trackingTokenHash: true, paymentMethod: true,
  currency: true, order: { select: ORDER_SELECT } };

class MarketplaceOrderOrchestratorError extends Error {
  constructor(code, message, statusCode = 422) {
    super(message); this.name = 'MarketplaceOrderOrchestratorError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 422) {
  if (!ok) throw new MarketplaceOrderOrchestratorError(code, message, status);
}
function text(value, max = 64) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value.trim() === value;
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
function normalize(body) {
  check(plain(body, ['quoteId', 'deliveryAddressId', 'paymentMethod', 'customer', 'notes']), 'INVALID_ORDER_REQUEST', 'Solicitud invalida');
  check(text(body.quoteId), 'INVALID_QUOTE_ID', 'quoteId requerido');
  check(body.deliveryAddressId === undefined || text(body.deliveryAddressId), 'INVALID_ADDRESS', 'Direccion invalida');
  check(['ONLINE', 'CASH'].includes(body.paymentMethod), 'INVALID_PAYMENT_METHOD', 'Metodo de pago invalido');
  const c = body.customer;
  check(plain(c, ['name', 'phone', 'email']) && text(c.name, 100) && typeof c.phone === 'string'
    && /^\+?[0-9 ()-]{7,25}$/.test(c.phone) && c.phone.replace(/\D/g, '').length >= 7
    && (c.email === undefined || text(c.email, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)),
  'INVALID_CUSTOMER', 'Datos de comprador invalidos');
  check(body.notes === undefined || typeof body.notes === 'string' && body.notes.length <= 1000, 'INVALID_NOTES', 'Notas invalidas');
  return { quoteId: body.quoteId, deliveryAddressId: body.deliveryAddressId ?? null, paymentMethod: body.paymentMethod,
    customer: { name: c.name, phone: c.phone, email: c.email ?? null }, notes: body.notes ?? null };
}

function assertSnapshot(quote) {
  const s = quote.priceSnapshot; const lines = quote.itemsSnapshot;
  const money = ['subtotalCents', 'deliveryFeeCents', 'commissionCents', 'merchantPayoutCents', 'courierPayoutCents', 'totalCents'];
  check(quote.currency === 'MXN' && ['DELIVERY', 'PICKUP'].includes(quote.fulfillment) && text(quote.merchantId)
    && s && money.every(key => Number.isSafeInteger(s[key]) && s[key] >= 0 && s[key] <= MAX_CENTS)
    && s.subtotalCents > 0 && Number.isInteger(s.commissionBps) && s.commissionBps >= 0 && s.commissionBps <= 10000
    && s.subtotalCents + s.deliveryFeeCents === s.totalCents
    && s.commissionCents + s.merchantPayoutCents === s.subtotalCents && s.courierPayoutCents === s.deliveryFeeCents
    && (quote.fulfillment !== 'PICKUP' || s.deliveryFeeCents === 0), 'QUOTE_INTEGRITY_ERROR', 'Snapshot de cotizacion inconsistente', 503);
  const seen = new Set(); let sum = 0;
  check(Array.isArray(lines) && lines.length > 0 && lines.length <= 50, 'QUOTE_INTEGRITY_ERROR', 'Articulos inconsistentes', 503);
  for (const line of lines) {
    check(line && text(line.menuItemId) && !seen.has(line.menuItemId) && text(line.name, 200)
      && Number.isInteger(line.quantity) && line.quantity >= 1 && line.quantity <= 99
      && Number.isSafeInteger(line.unitPriceCents) && line.unitPriceCents > 0 && line.unitPriceCents <= MAX_CENTS
      && Number.isSafeInteger(line.lineCents) && line.lineCents === line.unitPriceCents * line.quantity,
    'QUOTE_INTEGRITY_ERROR', 'Articulo cotizado inconsistente', 503);
    sum += line.lineCents; seen.add(line.menuItemId);
  }
  check(sum === s.subtotalCents, 'QUOTE_INTEGRITY_ERROR', 'Subtotal cotizado inconsistente', 503);
}

// Pure preparation port: returns JSON for persistence, never publishes into a
// live dispatch store before commit. Only CASH can have an initial active offer.
function prepareDispatch({ orderId, quote, merchant, paymentMethod, pickupPinHash, deliveryPinHash, at }) {
  const policy = validateDeliveryPolicy({ deliveryPolicy: merchant.deliveryPolicy ?? 'SHARED_ONLY',
    fallbackSeconds: merchant.fallbackSeconds ?? 30, maxDistanceKm: merchant.maxDistanceKm ?? 10 });
  const result = createOffer({ orderId, restaurantId: merchant.restaurantId,
    payoutAmount: quote.priceSnapshot.courierPayoutCents / 100, pickupPinHash, deliveryPinHash, now: at });
  const offering = paymentMethod === 'CASH' && policy.deliveryPolicy !== 'MANUAL';
  const source = policy.deliveryPolicy === 'SHARED_ONLY'
    || policy.deliveryPolicy === 'OWN_THEN_SHARED' && policy.fallbackSeconds === 0 ? 'SHARED' : 'OWN';
  Object.assign(result.task, policy, { merchantId: merchant.id, locationId: merchant.locationId,
    status: offering ? TASK_STATUS.OFFERING : TASK_STATUS.WAITING_READY,
    dispatchMode: policy.deliveryPolicy === 'MANUAL' ? null : source, version: 0,
    payoutAmount: quote.priceSnapshot.courierPayoutCents / 100, currency: quote.currency });
  if (offering) result.task.offeringStartedAt = at.toISOString();
  // Own candidates are selected by dispatch once its transactional adapter loads
  // affiliations/presence. An order request cannot supply courier identities.
  if (!offering || source !== 'SHARED') result.offer = null;
  else result.offer.dispatchVersion = result.task.version;
  return result;
}

/** Ports (all persistence operations MUST enlist in the supplied Prisma tx):
 * quoteStore.findById({quoteId, accountId, tx}) -> quote|null
 * quoteStore.findOrderReference({accountId, requestKeyHash, tx}) -> {orderId,restaurantId}|null
 * quoteStore.consume({quoteId,accountId,orderId,restaurantId,requestKeyHash,at,tx}) -> {count:1}
 *   CAS ACTIVE + unexpired; also records the durable account/key -> order reference.
 *   Consumption and the reference must roll back with Order/Pipeline on failure.
 * merchants.resolve(merchantId,{tx}) -> server-owned restaurant/location/slug mapping
 * addresses.resolve(accountId,addressId,{tx}) -> owned {id,accountId,address,lat?,lng?}
 * dispatchEngine.prepareTask(args) -> pure serializable {task,offer}; no external writes.
 * Optional outbox.append({event,tx}) adds a transactional notification record. A
 * durable pending event is also retained in the pipeline when no outbox port exists.
 * No default database, customer session, gateway, environment loader or network.
 */
function createMarketplaceOrderOrchestrator({ quoteStore, prismaClient, merchants, addresses,
  dispatchEngine = { prepareTask: prepareDispatch }, outbox, pinSecrets,
  activePinKeyId = process.env.MARKETPLACE_PIN_KEY_ID || 'v1', now = () => new Date(),
  orderNumber = nextOrderNumber, newId = () => crypto.randomUUID() } = {}) {
  function at() {
    const value = now();
    check(value instanceof Date && Number.isFinite(value.getTime()), 'INVALID_CLOCK', 'Reloj no disponible', 503);
    return new Date(value);
  }
  function credentials(orderId, accountId, keyId) {
    const secret = pinSecrets ? pinSecrets[keyId] : keyId === activePinKeyId ? process.env.MARKETPLACE_PIN_SECRET : undefined;
    check(typeof secret === 'string' && Buffer.byteLength(secret) >= 32, 'PIN_KEY_UNAVAILABLE', 'Clave de PIN no disponible', 503);
    const hmac = purpose => crypto.createHmac('sha256', secret).update(JSON.stringify(['marketplace-order-v1', purpose, accountId, orderId])).digest();
    const pickup = hmac('pickup').readUInt32BE(0) % 1000000;
    let delivery = hmac('delivery').readUInt32BE(0) % 1000000;
    if (delivery === pickup) delivery = (delivery + 1) % 1000000;
    return { pickupPin: String(pickup).padStart(6, '0'), deliveryPin: String(delivery).padStart(6, '0'), trackingToken: hmac('tracking').toString('hex') };
  }
  function publicView(row, accountId, requestKeyHash, requestHash, idempotent) {
    const meta = row?.settlement?.orchestration; const order = row?.order;
    check(meta?.version === 1 && meta.accountId === accountId && meta.requestKeyHash === requestKeyHash
      && order?.source === 'MARKETPLACE' && order.restaurantId === row.restaurantId && order.id === row.orderId,
    'ORDER_INTEGRITY_ERROR', 'Orden persistente inconsistente', 503);
    check(row.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otra solicitud', 409);
    const c = credentials(order.id, accountId, row.pinKeyId);
    check(hashPin(c.pickupPin) === row.pickupPinHash && hashPin(c.deliveryPin) === row.deliveryPinHash
      && hash(c.trackingToken) === row.trackingTokenHash, 'PIN_KEY_UNAVAILABLE', 'Clave original de PIN no disponible', 503);
    const s = row.settlement;
    assertSnapshot({ currency: row.currency, fulfillment: meta.fulfillment, merchantId: meta.merchantId,
      priceSnapshot: s, itemsSnapshot: meta.itemsSnapshot });
    return { orderId: order.id, quoteId: meta.quoteId, merchantId: meta.merchantId, fulfillment: meta.fulfillment,
      orderNumber: order.orderNumber, status: order.status, paymentMethod: row.paymentMethod, paymentStatus: order.paymentStatus,
      currency: row.currency, ...c, items: meta.itemsSnapshot.map(line => ({ menuItemId: line.menuItemId, name: line.name,
        quantity: line.quantity, unitPrice: decimal(line.unitPriceCents), lineTotal: decimal(line.lineCents) })),
      subtotal: decimal(s.subtotalCents), deliveryFee: decimal(s.deliveryFeeCents), discount: '0.00', tip: '0.00',
      commissionBps: s.commissionBps, commission: decimal(s.commissionCents), merchantPayout: decimal(s.merchantPayoutCents),
      courierPayout: decimal(s.courierPayoutCents), total: decimal(s.totalCents),
      dispatch: row.dispatch ? { taskId: row.dispatch.task.id, status: row.dispatch.task.status } : null, idempotent };
  }
  async function existing(tx, accountId, requestKeyHash, requestHash) {
    const ref = await quoteStore.findOrderReference({ accountId, requestKeyHash, tx });
    if (!ref) return null;
    check(text(ref.orderId) && text(ref.restaurantId), 'ORDER_INTEGRITY_ERROR', 'Referencia de orden inconsistente', 503);
    const row = await tx.marketplaceOrderPipeline.findFirst({ where: { orderId: ref.orderId, restaurantId: ref.restaurantId }, select: PIPELINE_SELECT });
    return publicView(row, accountId, requestKeyHash, requestHash, true);
  }
  async function createOrder({ accountId, idempotencyKey, body } = {}) {
    check(text(accountId), 'UNAUTHENTICATED', 'Cuenta de comprador requerida', 401);
    check(typeof idempotencyKey === 'string' && KEY_PATTERN.test(idempotencyKey), 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key invalido');
    const request = normalize(body);
    check(prismaClient && typeof prismaClient.$transaction === 'function'
      && ['findById', 'findOrderReference', 'consume'].every(method => typeof quoteStore?.[method] === 'function')
      && typeof merchants?.resolve === 'function' && typeof addresses?.resolve === 'function'
      && typeof dispatchEngine?.prepareTask === 'function' && (!outbox || typeof outbox.append === 'function'),
    'ORDERS_UNAVAILABLE', 'Adaptadores transaccionales no disponibles', 503);
    const requestHash = hash(JSON.stringify(request));
    const requestKeyHash = hash(JSON.stringify([accountId, idempotencyKey]));
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await prismaClient.$transaction(async tx => {
          const replay = await existing(tx, accountId, requestKeyHash, requestHash);
          if (replay) return replay;
          const loaded = await quoteStore.findById({ quoteId: request.quoteId, accountId, tx });
          check(loaded && loaded.id === request.quoteId && loaded.accountId === accountId, 'QUOTE_NOT_FOUND', 'Cotizacion no encontrada', 404);
          const quote = json(loaded);
          assertQuoteUsable(quote, at()); assertSnapshot(quote);
          check(quote.fulfillment === 'DELIVERY' ? request.deliveryAddressId === quote.deliveryAddressId && text(request.deliveryAddressId)
            : request.deliveryAddressId === null && quote.deliveryAddressId === null, 'QUOTE_ADDRESS_MISMATCH', 'La direccion no coincide con la cotizacion', 409);
          const merchant = await merchants.resolve(quote.merchantId, { tx });
          check(merchant?.id === quote.merchantId && merchant.status === 'ACTIVE' && text(merchant.restaurantId)
            && text(merchant.locationId) && text(merchant.slug, 100), 'MERCHANT_NOT_FOUND', 'Comercio no disponible', 404);
          const restaurant = await tx.restaurant.findFirst({ where: { id: merchant.restaurantId, isActive: true }, select: { id: true, slug: true } });
          const location = await tx.location.findFirst({ where: { id: merchant.locationId, restaurantId: merchant.restaurantId, isActive: true },
            select: { id: true, restaurantId: true } });
          check(restaurant?.id === merchant.restaurantId && restaurant.slug === merchant.slug
            && location?.restaurantId === merchant.restaurantId && location.id === merchant.locationId,
          'MERCHANT_NOT_FOUND', 'Sucursal no disponible', 404);
          const items = await tx.menuItem.findMany({ where: { restaurantId: merchant.restaurantId,
            id: { in: quote.itemsSnapshot.map(line => line.menuItemId) } }, select: { id: true, restaurantId: true } });
          check(items.length === quote.itemsSnapshot.length && new Set(items.map(item => item.id)).size === items.length
            && items.every(item => item.restaurantId === merchant.restaurantId && quote.itemsSnapshot.some(line => line.menuItemId === item.id)),
          'QUOTE_ITEMS_UNAVAILABLE', 'Articulos cotizados no disponibles', 409);
          let address = null;
          if (quote.fulfillment === 'DELIVERY') {
            address = await addresses.resolve(accountId, request.deliveryAddressId, { tx });
            check(address?.id === request.deliveryAddressId && address.accountId === accountId && text(address.address, 500)
              && ((address.lat == null && address.lng == null) || Number.isFinite(address.lat) && Number.isFinite(address.lng)
                && Math.abs(address.lat) <= 90 && Math.abs(address.lng) <= 180), 'ADDRESS_NOT_FOUND', 'Direccion no encontrada', 404);
          }
          const date = at(); assertQuoteUsable(quote, date);
          const orderId = newId(); check(text(orderId), 'INVALID_ORDER_ID', 'Identificador no disponible', 503);
          const pins = credentials(orderId, accountId, activePinKeyId);
          const pinHashes = { pickupPinHash: hashPin(pins.pickupPin), deliveryPinHash: hashPin(pins.deliveryPin) };
          const s = quote.priceSnapshot;
          const dispatch = quote.fulfillment === 'DELIVERY' ? await dispatchEngine.prepareTask({ orderId, quote: json(quote), merchant: json(merchant),
            paymentMethod: request.paymentMethod, ...pinHashes, at: date, tx }) : null;
          if (quote.fulfillment === 'DELIVERY') {
            check(dispatch?.task?.orderId === orderId && dispatch.task.restaurantId === merchant.restaurantId
              && text(dispatch.task.id) && [TASK_STATUS.WAITING_READY, TASK_STATUS.OFFERING].includes(dispatch.task.status)
              && (request.paymentMethod === 'CASH' || dispatch.task.status === TASK_STATUS.WAITING_READY)
              && dispatch.task.pickupPinHash === pinHashes.pickupPinHash && dispatch.task.deliveryPinHash === pinHashes.deliveryPinHash,
            'DISPATCH_INTEGRITY_ERROR', 'Tarea de despacho inconsistente', 503);
          }
          const event = { id: `marketplace-order:${orderId}:created`, type: 'MarketplaceOrderCreated', status: 'PENDING',
            orderId, merchantId: merchant.id, restaurantId: merchant.restaurantId, locationId: merchant.locationId,
            room: `restaurant:${merchant.restaurantId}:location:${merchant.locationId}`, createdAt: date.toISOString() };
          const order = await tx.order.create({ data: { id: orderId, restaurantId: merchant.restaurantId, locationId: merchant.locationId,
            clientOrderId: `marketplace-v1:${requestKeyHash}`, orderNumber: await orderNumber(tx, merchant.restaurantId),
            source: 'MARKETPLACE', orderType: quote.fulfillment === 'DELIVERY' ? 'DELIVERY' : 'TAKEOUT',
            status: request.paymentMethod === 'ONLINE' ? 'PENDING_PAYMENT' : 'PENDING_MERCHANT',
            paymentMethod: request.paymentMethod === 'ONLINE' ? 'CARD' : 'CASH', paymentStatus: 'PENDING',
            subtotal: s.subtotalCents / 100, deliveryFee: s.deliveryFeeCents / 100, total: s.totalCents / 100, discount: 0, tip: 0,
            customerName: request.customer.name, customerPhone: request.customer.phone, customerEmail: request.customer.email,
            notes: request.notes, deliveryAddress: address?.address ?? null, deliveryLat: address?.lat ?? null, deliveryLng: address?.lng ?? null,
            items: { create: quote.itemsSnapshot.map(line => ({ menuItemId: line.menuItemId, name: line.name, quantity: line.quantity,
              price: line.unitPriceCents / 100, subtotal: line.lineCents / 100 })) } }, select: ORDER_SELECT });
          const settlement = { ...json(s), tipCents: 0, platformFeeCents: s.commissionCents,
            commissionRate: s.commissionBps / 10000, commissionFixedCents: 0,
            orchestration: { version: 1, accountId, quoteId: quote.id, merchantId: quote.merchantId, requestKeyHash,
              deliveryAddressId: quote.deliveryAddressId, fulfillment: quote.fulfillment, itemsSnapshot: json(quote.itemsSnapshot), outbox: [event] } };
          const pipeline = { orderId, restaurantId: merchant.restaurantId, storeSlug: merchant.slug, requestHash,
            trackingTokenHash: hash(pins.trackingToken), trackingExpiresAt: new Date(date.getTime() + 14 * 86400000),
            pinKeyId: activePinKeyId, ...pinHashes, paymentMethod: request.paymentMethod, currency: quote.currency,
            settlement, dispatch: dispatch ? json(dispatch) : undefined };
          await tx.marketplaceOrderPipeline.create({ data: pipeline });
          if (outbox) await outbox.append({ event, tx });
          const consumedAt = at(); assertQuoteUsable(quote, consumedAt);
          const consumed = await quoteStore.consume({ quoteId: quote.id, accountId, orderId, restaurantId: merchant.restaurantId, requestKeyHash, at: consumedAt, tx });
          check(consumed?.count === 1, 'QUOTE_CONFLICT', 'La cotizacion ya fue consumida o expiro', 409);
          return publicView({ ...pipeline, order }, accountId, requestKeyHash, requestHash, false);
        }, TX_OPTIONS);
      } catch (error) {
        if (error instanceof MarketplaceQuoteError) throw new MarketplaceOrderOrchestratorError(error.code, error.message, error.statusCode);
        if (!['P2002', 'P2034', 'P2028'].includes(error?.code)) throw error;
        if (attempt === 2) throw new MarketplaceOrderOrchestratorError('ORDER_CONFLICT', 'La orden cambio; repite con el mismo Idempotency-Key', 409);
      }
    }
  }
  return { createOrder };
}

module.exports = { MarketplaceOrderOrchestratorError, createMarketplaceOrderOrchestrator };
