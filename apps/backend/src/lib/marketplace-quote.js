'use strict';

// Formal marketplace quote (plan §5-6). Pricing runs server-side in integer cents.
// Ports are injected and speak cents: catalog.loadMerchant / loadMerchantBySlug / loadListings,
// addresses.resolve and quoteStore.save / findByIdempotencyKey. No Prisma or network
// import here, so the rules are testable offline. Without a real store the service
// fails closed (503) instead of pricing without persistence.
const crypto = require('node:crypto');
const { decimal, MAX_CENTS } = require('./marketplace-order-money');
const { findZoneForPoint } = require('./delivery-fee');

const TTL_MS = 5 * 60 * 1000;
const MAX_ITEMS = 50;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{32,128}$/;
const MERCHANT_SLUG = /^[a-z0-9-]{1,100}$/;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

class MarketplaceQuoteError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'MarketplaceQuoteError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function check(ok, code, message, statusCode = 400) {
  if (!ok) throw new MarketplaceQuoteError(code, message, statusCode);
}
function text(value, max = 100) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max;
}
function plain(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}

// The client never sends money. Any extra field (total, price, fee) fails the whole request.
function normalize(body) {
  check(plain(body, ['merchantId', 'merchantSlug', 'items', 'fulfillment', 'deliveryAddressId']), 'INVALID_QUOTE_REQUEST', 'Solicitud invalida');
  const byId = body.merchantId !== undefined;
  const bySlug = body.merchantSlug !== undefined;
  check(byId !== bySlug && (byId ? text(body.merchantId, 64)
    : typeof body.merchantSlug === 'string' && MERCHANT_SLUG.test(body.merchantSlug)), 'INVALID_QUOTE_REQUEST', 'Indica merchantId o merchantSlug valido');
  check(['DELIVERY', 'PICKUP'].includes(body.fulfillment), 'INVALID_QUOTE_REQUEST', 'Tipo de entrega invalido');
  if (body.fulfillment === 'DELIVERY') check(text(body.deliveryAddressId, 64), 'ADDRESS_REQUIRED', 'Direccion requerida');
  else check(body.deliveryAddressId === undefined, 'INVALID_QUOTE_REQUEST', 'PICKUP no admite direccion');
  check(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= MAX_ITEMS, 'INVALID_ITEMS', 'Articulos invalidos');
  const seen = new Set();
  const items = body.items.map(item => {
    // Modifiers are not priced in this phase, so only an empty list is accepted.
    check(plain(item, ['menuItemId', 'quantity', 'modifiers']) && text(item.menuItemId, 64) && !seen.has(item.menuItemId)
      && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99
      && (item.modifiers === undefined || Array.isArray(item.modifiers) && item.modifiers.length === 0),
    'INVALID_ITEMS', 'Articulos invalidos');
    seen.add(item.menuItemId);
    return { menuItemId: item.menuItemId, quantity: item.quantity };
  }).sort((a, b) => (a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0));
  return { ...(byId ? { merchantId: body.merchantId } : { merchantSlug: body.merchantSlug }),
    fulfillment: body.fulfillment, deliveryAddressId: body.deliveryAddressId ?? null, items };
}

// Prices the basket from server data only. Listings from other merchants are dropped
// before lookup, so a foreign item can never resolve to a price.
function price({ merchant, listings, request, address }) {
  check(merchant && merchant.id === request.merchantId && merchant.status === 'ACTIVE', 'MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
  check(merchant.open === true, 'MERCHANT_CLOSED', 'Comercio cerrado', 409);
  check(merchant.currency === 'MXN', 'CURRENCY_NOT_SUPPORTED', 'Moneda no soportada', 409);
  check(Number.isInteger(merchant.commissionBps) && merchant.commissionBps >= 0 && merchant.commissionBps <= 10000,
    'INVALID_COMMISSION', 'Comision no disponible', 503);
  const rows = new Map(listings.filter(row => row.merchantId === merchant.id).map(row => [row.menuItemId, row]));
  let subtotalCents = 0;
  const lines = request.items.map(item => {
    const row = rows.get(item.menuItemId);
    check(row && row.published === true && row.available === true, 'ITEM_NOT_AVAILABLE', 'Articulo no disponible en este comercio', 409);
    check(Number.isSafeInteger(row.unitPriceCents) && row.unitPriceCents > 0 && row.unitPriceCents <= MAX_CENTS,
      'INVALID_CATALOG_PRICE', 'Precio no disponible', 503);
    const lineCents = row.unitPriceCents * item.quantity;
    subtotalCents += lineCents;
    check(subtotalCents <= MAX_CENTS, 'ORDER_LIMIT', 'La cotizacion excede el limite permitido', 409);
    return { menuItemId: item.menuItemId, name: row.name, quantity: item.quantity, unitPriceCents: row.unitPriceCents, lineCents };
  });
  check(subtotalCents >= (merchant.minOrderCents ?? 0), 'MINIMUM_ORDER', 'No alcanza el pedido minimo', 409);
  let deliveryFeeCents = 0;
  let zoneId = null;
  let deliveryAvailability = 'NOT_APPLICABLE';
  if (request.fulfillment === 'DELIVERY') {
    check(address && Number.isFinite(address.lat) && Number.isFinite(address.lng), 'ADDRESS_NOT_FOUND', 'Direccion no encontrada', 404);
    // Coverage is required even when the free-delivery threshold applies.
    const zone = findZoneForPoint(merchant.zones || [], address.lat, address.lng);
    check(zone, 'DELIVERY_OUT_OF_RANGE', 'Fuera de cobertura', 409);
    check(Number.isSafeInteger(zone.feeCents) && zone.feeCents >= 0, 'INVALID_DELIVERY_FEE', 'Tarifa de entrega no disponible', 503);
    const free = merchant.freeDeliveryFromCents != null && subtotalCents >= merchant.freeDeliveryFromCents;
    deliveryFeeCents = free ? 0 : zone.feeCents;
    zoneId = zone.id;
    deliveryAvailability = 'AVAILABLE';
  }
  const totalCents = subtotalCents + deliveryFeeCents;
  check(totalCents <= MAX_CENTS, 'ORDER_LIMIT', 'La cotizacion excede el limite permitido', 409);
  // Half-up rounding in integer arithmetic, capped at the subtotal.
  const commissionCents = Math.min(subtotalCents,
    Number((BigInt(subtotalCents) * BigInt(merchant.commissionBps) + 5000n) / 10000n));
  return {
    lines, zoneId, deliveryAvailability, subtotalCents, deliveryFeeCents, totalCents,
    commissionBps: merchant.commissionBps, commissionCents, merchantPayoutCents: subtotalCents - commissionCents,
    // Courier payout equals the delivery fee, as in the existing order flow. Tips are not part of quotes.
    courierPayoutCents: deliveryFeeCents,
    estimatedReadyMinutes: Number.isInteger(merchant.prepMinutes) && merchant.prepMinutes > 0 ? merchant.prepMinutes : null,
  };
}

// Public view. Money is a two-decimal string, as in the plan examples.
function view(quote) {
  const s = quote.priceSnapshot;
  return {
    quoteId: quote.id,
    expiresAt: new Date(quote.expiresAt).toISOString(),
    merchantId: quote.merchantId,
    currency: 'MXN',
    items: quote.itemsSnapshot.map(line => ({ menuItemId: line.menuItemId, name: line.name, quantity: line.quantity,
      unitPrice: decimal(line.unitPriceCents), lineTotal: decimal(line.lineCents) })),
    subtotal: decimal(s.subtotalCents),
    discount: '0.00',
    deliveryFee: decimal(s.deliveryFeeCents),
    tip: '0.00',
    total: decimal(s.totalCents),
    estimatedReadyMinutes: s.estimatedReadyMinutes,
    deliveryAvailability: s.deliveryAvailability,
  };
}

// Same key and same body return the stored quote without repricing. A different body is a conflict.
function replay(quote, requestHash) {
  check(quote, 'QUOTE_CONFLICT', 'Cotizacion no disponible; repite la solicitud', 409);
  check(quote.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otra solicitud', 409);
  return view(quote);
}

function createQuoteService({ catalog, addresses, quoteStore, now = () => new Date(), ttlMs = TTL_MS } = {}) {
  async function createQuote({ accountId, idempotencyKey, body } = {}) {
    check(text(accountId, 64), 'UNAUTHENTICATED', 'Cuenta requerida', 401);
    check(typeof idempotencyKey === 'string' && IDEMPOTENCY_KEY.test(idempotencyKey), 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key invalido');
    const request = normalize(body);
    check(catalog && addresses && quoteStore, 'QUOTES_UNAVAILABLE', 'Cotizaciones no disponibles', 503);
    const at = now();
    check(at instanceof Date && Number.isFinite(at.getTime()), 'INVALID_CLOCK', 'Reloj no disponible', 503);
    const requestHash = digest(JSON.stringify(request));
    // Scoped per account, so one account cannot replay or read another account's quote.
    const idempotencyKeyHash = digest(`${accountId}:${idempotencyKey}`);
    const existing = await quoteStore.findByIdempotencyKey(idempotencyKeyHash);
    if (existing) return replay(existing, requestHash);
    const bySlug = request.merchantSlug !== undefined;
    if (bySlug) check(typeof catalog.loadMerchantBySlug === 'function', 'QUOTES_UNAVAILABLE', 'Resolucion de comercio por slug no disponible', 503);
    const merchant = bySlug ? await catalog.loadMerchantBySlug(request.merchantSlug) : await catalog.loadMerchant(request.merchantId);
    check(merchant && text(merchant.id, 64) && (bySlug ? merchant.slug === request.merchantSlug : merchant.id === request.merchantId)
      && merchant.status === 'ACTIVE', 'MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    const resolvedRequest = { ...request, merchantId: merchant.id };
    const listings = await catalog.loadListings(merchant.id, request.items.map(item => item.menuItemId));
    const address = request.fulfillment === 'DELIVERY' ? await addresses.resolve(accountId, request.deliveryAddressId) : null;
    const priced = price({ merchant, listings, request: resolvedRequest, address });
    const quote = {
      id: crypto.randomUUID(), accountId, merchantId: merchant.id, fulfillment: request.fulfillment,
      deliveryAddressId: request.deliveryAddressId, status: 'ACTIVE', currency: 'MXN',
      itemsSnapshot: priced.lines,
      priceSnapshot: {
        subtotalCents: priced.subtotalCents, deliveryFeeCents: priced.deliveryFeeCents, totalCents: priced.totalCents,
        commissionBps: priced.commissionBps, commissionCents: priced.commissionCents,
        merchantPayoutCents: priced.merchantPayoutCents, courierPayoutCents: priced.courierPayoutCents,
        zoneId: priced.zoneId, estimatedReadyMinutes: priced.estimatedReadyMinutes,
        deliveryAvailability: priced.deliveryAvailability,
      },
      requestHash, idempotencyKeyHash, createdAt: at, expiresAt: new Date(at.getTime() + ttlMs),
    };
    try {
      await quoteStore.save(quote);
    } catch (error) {
      // A concurrent request with the same key won the insert. Return its quote.
      if (error?.code !== 'DUPLICATE') throw error;
      return replay(await quoteStore.findByIdempotencyKey(idempotencyKeyHash), requestHash);
    }
    return view(quote);
  }
  return { createQuote };
}

// Used by the order flow before consuming a quote.
function assertQuoteUsable(quote, at) {
  check(quote && quote.status === 'ACTIVE', 'QUOTE_NOT_ACTIVE', 'Cotizacion no activa', 409);
  check(at instanceof Date && at.getTime() < new Date(quote.expiresAt).getTime(), 'QUOTE_EXPIRED', 'La cotizacion expiro; solicita una nueva', 409);
  return true;
}

module.exports = { MarketplaceQuoteError, createQuoteService, assertQuoteUsable, TTL_MS };
