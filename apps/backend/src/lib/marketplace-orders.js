'use strict';

const crypto = require('node:crypto');
const { parseStoreSlugs, storeTerms, activePromoPrice } = require('./marketplace-catalog');
const { computeDeliveryFee } = require('./delivery-fee');
const { nextOrderNumber } = require('./order-number');
const { createPaymentPreference } = require('./marketplace-payments');
const { createMarketplacePaymentGateway } = require('./marketplace-payment-gateway');
const { buildOrderCaptureTransaction, buildOrderSettlementTransaction, recordLedgerTransaction } = require('./marketplace-ledger');
const { createOffer, hashPin, verifyPin, atomicAcceptOffer, confirmPickup, confirmDelivery } = require('./marketplace-dispatch');
const { cents, decimal, MAX_CENTS } = require('./marketplace-order-money');

const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 };
const ORDER_SELECT = { id: true, restaurantId: true, orderNumber: true, status: true, paymentStatus: true,
  paymentProviderId: true, paymentProviderRef: true, subtotal: true, deliveryFee: true, tip: true, total: true };
const CONFIG_SELECT = { currency: true, isOpen: true, scheduleEnabled: true, businessHours: true, timezone: true,
  closedMessage: true, minOrderAmount: true, deliveryMode: true, deliveryFee: true, freeDeliveryFrom: true,
  originLat: true, originLng: true, deliveryBaseFee: true, deliveryPerKm: true, deliveryFreeRadiusKm: true,
  deliveryMaxKm: true, promoStartTime: true, promoEndTime: true };
const PIPELINE_SELECT = { orderId: true, restaurantId: true, storeSlug: true, requestHash: true,
  trackingTokenHash: true, trackingExpiresAt: true, pinKeyId: true, pickupPinHash: true, deliveryPinHash: true,
  paymentMethod: true, collectorId: true, currency: true, settlement: true, dispatch: true, checkoutUrl: true,
  order: { select: ORDER_SELECT } };

class MarketplaceOrderError extends Error {
  constructor(code, message, statusCode = 400, recovery) {
    super(message); this.name = 'MarketplaceOrderError'; this.code = code; this.statusCode = statusCode;
    if (recovery) this.recovery = recovery;
  }
}
function check(ok, code, message, status = 400) { if (!ok) throw new MarketplaceOrderError(code, message, status); }
function text(value, max = 200) { return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max; }
function object(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
}
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
function tracking(key, orderId) { return crypto.createHmac('sha256', key).update(`marketplace-tracking:${orderId}`).digest('hex'); }
function money(value) {
  check(typeof value === 'number' && Number.isFinite(value), 'INVALID_AMOUNT', 'Importe invalido');
  try { return cents(value); } catch { throw new MarketplaceOrderError('INVALID_AMOUNT', 'Importe invalido'); }
}
function normalize(input) {
  check(/^[a-z0-9-]{1,100}$/.test(input.storeSlug || ''), 'INVALID_STORE', 'Tienda invalida');
  check(input.restaurantId === undefined || text(input.restaurantId), 'INVALID_STORE', 'Restaurante invalido');
  check(['ONLINE', 'CASH'].includes(input.paymentMethod), 'INVALID_PAYMENT_METHOD', 'Metodo de pago invalido');
  check(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= 50, 'INVALID_ITEMS', 'Articulos invalidos');
  const seen = new Set();
  const items = input.items.map(item => {
    check(object(item, ['menuItemId', 'quantity', 'notes']) && text(item.menuItemId) && !seen.has(item.menuItemId)
      && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 99
      && (item.notes === undefined || typeof item.notes === 'string' && item.notes.length <= 300), 'INVALID_ITEMS', 'Articulos invalidos');
    seen.add(item.menuItemId);
    return { menuItemId: item.menuItemId, quantity: item.quantity, notes: item.notes || '' };
  }).sort((a, b) => a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0);
  const address = typeof input.deliveryAddress === 'string' ? { address: input.deliveryAddress } : input.deliveryAddress;
  check(object(address, ['address', 'lat', 'lng']) && text(address.address, 500), 'INVALID_ADDRESS', 'Direccion requerida');
  const coords = address.lat !== undefined || address.lng !== undefined;
  check(!coords || Number.isFinite(address.lat) && Number.isFinite(address.lng)
    && Math.abs(address.lat) <= 90 && Math.abs(address.lng) <= 180, 'INVALID_ADDRESS', 'Coordenadas invalidas');
  check(object(input.customer, ['name', 'phone', 'email']) && text(input.customer.name, 100)
    && /^\+?[0-9 ()-]{7,25}$/.test(input.customer.phone || '')
    && input.customer.phone.replace(/\D/g, '').length >= 7
    && (input.customer.email === undefined || text(input.customer.email, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customer.email)),
  'INVALID_CUSTOMER', 'Datos del comprador invalidos');
  const key = input.idempotencyKey ?? crypto.randomBytes(32).toString('hex');
  check(typeof key === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(key), 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key invalido');
  return { storeSlug: input.storeSlug, restaurantId: input.restaurantId ?? null, items,
    deliveryAddress: { address: address.address, ...(coords ? { lat: address.lat, lng: address.lng } : {}) },
    customer: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email ?? null },
    paymentMethod: input.paymentMethod, tipCents: money(input.tip ?? 0),
    deliveryFeeCents: input.deliveryFee === undefined ? null : money(input.deliveryFee), key };
}

function createMarketplaceOrdersService({ storeSlugs = process.env.MARKETPLACE_STORE_SLUGS || '',
  pinSecrets, activePinKeyId = process.env.MARKETPLACE_PIN_KEY_ID || 'v1',
  getPaymentGateway = createMarketplacePaymentGateway, now = () => new Date() } = {}) {
  function at() {
    const value = now(); check(value instanceof Date && Number.isFinite(value.getTime()), 'INVALID_CLOCK', 'Reloj no disponible', 503);
    return new Date(value.getTime());
  }
  function pin(orderId, purpose, keyId) {
    const secret = pinSecrets ? pinSecrets[keyId] : keyId === activePinKeyId ? process.env.MARKETPLACE_PIN_SECRET : undefined;
    check(typeof secret === 'string' && Buffer.byteLength(secret) >= 32, 'PIN_KEY_UNAVAILABLE', 'Configuracion de PIN no disponible', 503);
    const derive = name => crypto.createHmac('sha256', secret).update(`marketplace:${orderId}:${name}`).digest().readUInt32BE(0) % 1000000;
    let code = derive(purpose);
    if (purpose === 'delivery' && code === derive('pickup')) code = (code + 1) % 1000000;
    return code.toString().padStart(6, '0');
  }
  function allowed(slug) {
    let slugs;
    try { slugs = parseStoreSlugs(storeSlugs); } catch { throw new MarketplaceOrderError('MARKETPLACE_UNAVAILABLE', 'Marketplace no disponible', 503); }
    if (slug !== undefined) check(slugs.includes(slug), 'STORE_NOT_FOUND', 'Tienda no encontrada', 404);
    return slugs;
  }
  function client(prismaClient) {
    check(prismaClient && typeof prismaClient.$transaction === 'function', 'DATABASE_UNAVAILABLE', 'Persistencia no disponible', 503);
    return prismaClient;
  }
  async function load(tx, orderId, restaurantId) {
    const row = await tx.marketplaceOrderPipeline.findFirst({ where: { orderId, ...(restaurantId ? { restaurantId } : {}),
      order: { is: { id: orderId, source: 'MARKETPLACE' } } }, select: PIPELINE_SELECT });
    check(row && row.orderId === orderId && row.restaurantId === row.order?.restaurantId
      && (!restaurantId || row.restaurantId === restaurantId), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    const s = row.settlement;
    check(s && ['subtotalCents', 'deliveryFeeCents', 'tipCents', 'totalCents', 'platformFeeCents', 'merchantPayoutCents', 'courierPayoutCents']
      .every(key => Number.isSafeInteger(s[key]) && s[key] >= 0 && s[key] <= MAX_CENTS)
      && s.totalCents === s.subtotalCents + s.deliveryFeeCents + s.tipCents
      && s.subtotalCents === s.merchantPayoutCents + s.platformFeeCents && s.courierPayoutCents === s.deliveryFeeCents + s.tipCents
      && cents(row.order.total) === s.totalCents && cents(row.order.subtotal) === s.subtotalCents
      && cents(row.order.deliveryFee) === s.deliveryFeeCents && cents(row.order.tip) === s.tipCents,
    'ORDER_INTEGRITY_ERROR', 'Importes persistentes inconsistentes', 503);
    return row;
  }
  async function locked(tx, row) {
    const rows = await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${row.orderId}
      AND "restaurantId" = ${row.restaurantId} AND "source" = 'MARKETPLACE' FOR UPDATE`;
    check(rows.length === 1, 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    return load(tx, row.orderId, row.restaurantId);
  }
  function receipt(row, key) {
    const order = row.order;
    return { id: order.id, orderNumber: order.orderNumber, storeSlug: row.storeSlug, status: order.status,
      paymentMethod: row.paymentMethod, paymentStatus: order.paymentStatus, currency: row.currency,
      subtotal: row.settlement.subtotalCents / 100, deliveryFee: row.settlement.deliveryFeeCents / 100,
      tip: row.settlement.tipCents / 100, total: row.settlement.totalCents / 100,
      checkout: row.paymentMethod === 'ONLINE' ? { status: row.checkoutUrl ? 'READY' : 'PENDING', url: row.checkoutUrl } : null,
      dispatch: row.dispatch ? { taskId: row.dispatch.task.id, offerId: row.dispatch.offer.id, status: row.dispatch.task.status } : null,
      ...(key ? { trackingToken: tracking(key, row.orderId), deliveryPin: pin(row.orderId, 'delivery', row.pinKeyId) } : {}) };
  }
  function offer(row, date) {
    return createOffer({ orderId: row.orderId, restaurantId: row.restaurantId,
      payoutAmount: row.settlement.courierPayoutCents / 100, pickupPinHash: row.pickupPinHash,
      deliveryPinHash: row.deliveryPinHash, now: date });
  }
  async function saveDispatch(tx, row, dispatch) {
    const updated = await tx.marketplaceOrderPipeline.updateMany({ where: { orderId: row.orderId, restaurantId: row.restaurantId }, data: { dispatch: json(dispatch) } });
    check(updated.count === 1, 'ORDER_CONFLICT', 'La orden cambio', 409);
    row.dispatch = json(dispatch);
  }
  async function preference(prismaClient, row, key) {
    if (row.paymentMethod !== 'ONLINE' || row.checkoutUrl || row.order.paymentStatus === 'PAID') return receipt(row, key);
    try {
      const gateway = await getPaymentGateway({ prismaClient, restaurantId: row.restaurantId });
      check(gateway.collectorId === row.collectorId, 'PAYMENT_CONFIGURATION_CHANGED', 'Configuracion de pago cambio', 503);
      const s = row.settlement;
      const result = await createPaymentPreference({ orderId: row.orderId, subtotal: s.subtotalCents / 100,
        deliveryFee: s.deliveryFeeCents / 100, tip: s.tipCents / 100, commissionRate: s.commissionRate,
        commissionFixed: s.commissionFixedCents / 100, collectorId: row.collectorId,
        settlementSnapshot: { subtotal: s.subtotalCents / 100, deliveryFee: s.deliveryFeeCents / 100, tip: s.tipCents / 100,
          customerTotal: s.totalCents / 100, platformFee: s.platformFeeCents / 100,
          merchantPayout: s.merchantPayoutCents / 100, courierPayout: s.courierPayoutCents / 100 },
        idempotencyKey: `marketplace:${row.orderId}:checkout`, gateway });
      check(result && text(result.id) && typeof result.initPoint === 'string' && result.initPoint.startsWith('https://'),
        'INVALID_PAYMENT_RESPONSE', 'Preferencia no disponible', 503);
      return await prismaClient.$transaction(async tx => {
        const current = await locked(tx, row);
        check(current.order.status !== 'CANCELLED', 'ORDER_CANCELLED', 'Orden cancelada', 409);
        if (!current.checkoutUrl) {
          await tx.marketplaceOrderPipeline.updateMany({ where: { orderId: row.orderId, restaurantId: row.restaurantId }, data: { checkoutUrl: result.initPoint } });
          await tx.order.updateMany({ where: { id: row.orderId, restaurantId: row.restaurantId }, data: { paymentProviderRef: result.id } });
          current.checkoutUrl = result.initPoint;
        }
        return receipt(current, key);
      }, TX);
    } catch {
      throw new MarketplaceOrderError('PAYMENT_UNAVAILABLE', 'Preferencia pendiente; repite la solicitud con el mismo Idempotency-Key', 503,
        { orderId: row.orderId, trackingToken: tracking(key, row.orderId) });
    }
  }
  async function createMarketplaceOrder(input) {
    const normalized = normalize(input);
    allowed(normalized.storeSlug); // Fail closed before touching any injected database.
    const prismaClient = client(input.prismaClient);
    const { key, ...request } = normalized;
    const requestHash = digest(JSON.stringify(request));
    const clientOrderId = `marketplace:${digest(`${normalized.storeSlug}:${key}`)}`;
    const date = at();
    const row = await prismaClient.$transaction(async tx => {
      const store = await tx.restaurant.findFirst({ where: { slug: normalized.storeSlug,
        ...(normalized.restaurantId ? { id: normalized.restaurantId } : {}), isActive: true,
        tenant: { is: { hasWebStore: true, isDemo: false } } }, select: { id: true, slug: true, config: { select: CONFIG_SELECT } } });
      check(store && store.slug === normalized.storeSlug && (!normalized.restaurantId || store.id === normalized.restaurantId), 'STORE_NOT_FOUND', 'Tienda no encontrada', 404);
      // Also serializes cold-start Counter creation and request replays within this restaurant.
      const lock = await tx.$queryRaw`SELECT "id" FROM "restaurants" WHERE "id" = ${store.id} AND "isActive" = true FOR UPDATE`;
      check(lock.length === 1, 'STORE_NOT_FOUND', 'Tienda no encontrada', 404);
      const existing = await tx.order.findFirst({ where: { clientOrderId, restaurantId: store.id, source: 'MARKETPLACE' }, select: { id: true } });
      if (existing) {
        const saved = await load(tx, existing.id, store.id);
        check(saved.requestHash === requestHash, 'IDEMPOTENCY_CONFLICT', 'La clave ya pertenece a otra solicitud', 409);
        return saved;
      }
      const config = store.config;
      check(config && config.currency === 'MXN' && storeTerms(config, date).isOpen, 'STORE_CLOSED', 'Tienda no disponible para pedidos', 409);
      const location = await tx.location.findFirst({ where: { restaurantId: store.id, isActive: true, hasDelivery: true },
        select: { id: true, restaurantId: true }, orderBy: { id: 'asc' } });
      check(location && location.restaurantId === store.id, 'DELIVERY_UNAVAILABLE', 'Sin sucursal de entrega disponible', 409);
      const products = await tx.menuItem.findMany({ where: { id: { in: normalized.items.map(item => item.menuItemId) },
        restaurantId: store.id, isAvailable: true, availableOnline: true,
        category: { is: { restaurantId: store.id, isActive: true } } }, select: { id: true, restaurantId: true, name: true,
        price: true, isPromo: true, promoPrice: true, promoStartTime: true, promoEndTime: true, activeDays: true,
        hasVariants: true, soldByWeight: true, modifierGroups: { select: { required: true, minSelection: true } } }, take: 50 });
      check(products.length === normalized.items.length && new Set(products.map(item => item.id)).size === products.length
        && products.every(item => item.restaurantId === store.id && normalized.items.some(line => line.menuItemId === item.id)),
      'INVALID_ITEMS', 'Algun articulo no esta disponible', 409);
      let subtotalCents = 0;
      const lines = normalized.items.map(item => {
        const product = products.find(row => row.id === item.menuItemId);
        check(!product.hasVariants && !product.soldByWeight && !product.modifierGroups.some(group => group.required || group.minSelection > 0),
          'ITEM_OPTIONS_REQUIRED', 'El articulo requiere opciones o peso', 409);
        let price;
        try { price = cents(activePromoPrice(product, config, date) ?? product.price); } catch { throw new MarketplaceOrderError('INVALID_CATALOG_PRICE', 'Precio no disponible', 503); }
        check(price > 0, 'INVALID_CATALOG_PRICE', 'Precio no disponible', 503);
        const subtotal = price * item.quantity; subtotalCents += subtotal;
        check(subtotalCents <= MAX_CENTS, 'ORDER_LIMIT', 'La orden excede el limite permitido');
        return { menuItemId: item.menuItemId, name: product.name, price: price / 100, quantity: item.quantity,
          subtotal: subtotal / 100, notes: item.notes || null };
      });
      check(subtotalCents >= cents(config.minOrderAmount), 'MINIMUM_ORDER', 'No alcanza el pedido minimo', 409);
      const address = normalized.deliveryAddress;
      if (['DISTANCE', 'ZONES'].includes(config.deliveryMode)) {
        check(address.lat !== undefined && (config.deliveryMode !== 'DISTANCE' || Number.isFinite(config.originLat) && Number.isFinite(config.originLng)),
          'DELIVERY_COORDINATES_REQUIRED', 'Coordenadas de entrega requeridas', 409);
      }
      let zones = [];
      if (config.deliveryMode === 'ZONES') zones = await tx.deliveryZone.findMany({ where: { restaurantId: store.id, active: true },
        select: { id: true, fee: true, active: true, polygon: true }, orderBy: [{ priority: 'asc' }, { id: 'asc' }] });
      const quote = computeDeliveryFee({ ...config, deliveryZones: zones }, subtotalCents / 100, address.lat === undefined ? null : address);
      check(!quote.error, 'DELIVERY_OUT_OF_RANGE', 'Fuera de cobertura', 409);
      const feeCents = cents(quote.fee);
      check(normalized.deliveryFeeCents === null || normalized.deliveryFeeCents === feeCents, 'DELIVERY_FEE_CHANGED', 'La tarifa de entrega cambio', 409);
      const integration = await tx.integrationConfig.findFirst({ where: { restaurantId: store.id, type: 'MERCADOPAGO', enabled: true },
        select: { restaurantId: true, config: true } });
      let settings = {};
      if (integration) {
        check(integration.restaurantId === store.id, 'SCOPE_VIOLATION', 'Configuracion no disponible', 503);
        try { settings = JSON.parse(integration.config); } catch { throw new MarketplaceOrderError('PAYMENT_NOT_CONFIGURED', 'Configuracion de pago invalida', 503); }
      }
      const rate = settings.marketplaceCommissionRate ?? 0.05;
      check(typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 && rate <= 1
        && /^\d(?:\.\d{1,6})?$/.test(String(rate)), 'INVALID_COMMISSION', 'Comision no disponible', 503);
      const fixed = cents(settings.marketplaceCommissionFixed ?? 0);
      const platform = Math.min(subtotalCents, Number((BigInt(subtotalCents) * BigInt(Math.round(rate * 1000000)) + 500000n) / 1000000n) + fixed);
      const total = subtotalCents + feeCents + normalized.tipCents;
      check(total > 0 && total <= MAX_CENTS, 'ORDER_LIMIT', 'La orden excede el limite permitido');
      const collectorId = settings.collectorId == null ? null : String(settings.collectorId);
      check(normalized.paymentMethod !== 'ONLINE' || /^\d+$/.test(collectorId || ''), 'PAYMENT_NOT_CONFIGURED', 'Pago online no configurado', 503);
      const orderId = crypto.randomUUID();
      const pickupPinHash = hashPin(pin(orderId, 'pickup', activePinKeyId));
      const deliveryPinHash = hashPin(pin(orderId, 'delivery', activePinKeyId));
      const token = tracking(key, orderId);
      const settlement = { subtotalCents, deliveryFeeCents: feeCents, tipCents: normalized.tipCents, totalCents: total,
        platformFeeCents: platform, merchantPayoutCents: subtotalCents - platform,
        courierPayoutCents: feeCents + normalized.tipCents, commissionRate: rate, commissionFixedCents: fixed };
      await tx.order.create({ data: { id: orderId, restaurantId: store.id, locationId: location.id,
        orderNumber: await nextOrderNumber(tx, store.id), clientOrderId, source: 'MARKETPLACE', orderType: 'DELIVERY',
        status: 'PENDING', paymentStatus: 'PENDING', paymentMethod: normalized.paymentMethod === 'ONLINE' ? 'CARD' : 'CASH',
        paymentProvider: normalized.paymentMethod === 'ONLINE' ? 'MERCADOPAGO' : null,
        subtotal: subtotalCents / 100, deliveryFee: feeCents / 100, tip: normalized.tipCents / 100, total: total / 100,
        deliveryAddress: address.address, deliveryLat: address.lat, deliveryLng: address.lng, deliveryDistanceKm: quote.distanceKm,
        customerName: normalized.customer.name, customerPhone: normalized.customer.phone, customerEmail: normalized.customer.email,
        items: { create: lines } } });
      const pipeline = { orderId, restaurantId: store.id, storeSlug: store.slug, requestHash,
        trackingTokenHash: digest(token), trackingExpiresAt: new Date(date.getTime() + 14 * 86400000),
        pinKeyId: activePinKeyId, pickupPinHash, deliveryPinHash, paymentMethod: normalized.paymentMethod,
        collectorId, currency: 'MXN', settlement };
      if (normalized.paymentMethod === 'CASH') pipeline.dispatch = json(offer(pipeline, date));
      await tx.marketplaceOrderPipeline.create({ data: pipeline });
      if (normalized.paymentMethod === 'ONLINE') await tx.marketplacePayment.create({ data: { restaurantId: store.id, orderId,
        provider: 'MERCADOPAGO', idempotencyKey: `marketplace:${orderId}:checkout`, status: 'PENDING', amount: decimal(total), currency: 'MXN' } });
      return load(tx, orderId, store.id);
    }, TX);
    return preference(prismaClient, row, key);
  }
  async function confirmMarketplacePayment({ orderId, paymentId, prismaClient }) {
    check(text(orderId) && text(paymentId), 'INVALID_PAYMENT', 'Orden y pago requeridos');
    client(prismaClient);
    const before = await load(prismaClient, orderId);
    check(before.paymentMethod === 'ONLINE', 'NOT_ONLINE_PAYMENT', 'Esta orden requiere conciliacion de efectivo', 409);
    const gateway = await getPaymentGateway({ prismaClient, restaurantId: before.restaurantId });
    const verified = await gateway.getPayment(paymentId);
    check(verified && gateway.collectorId === before.collectorId && verified.id === paymentId && verified.orderId === orderId
      && verified.status === 'approved' && verified.collectorId === before.collectorId && verified.currency === before.currency
      && verified.amountCents === before.settlement.totalCents && verified.marketplaceFeeCents === before.settlement.platformFeeCents,
    'PAYMENT_NOT_VERIFIED', 'El pago no coincide con esta orden', 409);
    return prismaClient.$transaction(async tx => {
      const row = await locked(tx, before);
      check(row.collectorId === verified.collectorId && row.currency === verified.currency
        && row.settlement.totalCents === verified.amountCents && row.settlement.platformFeeCents === verified.marketplaceFeeCents,
      'PAYMENT_NOT_VERIFIED', 'El pago no coincide con esta orden', 409);
      check(row.order.status !== 'CANCELLED' && ['PENDING', 'PAID'].includes(row.order.paymentStatus), 'ORDER_NOT_PAYABLE', 'Orden no cobrable', 409);
      const payment = await tx.marketplacePayment.findFirst({ where: { orderId, restaurantId: row.restaurantId,
        provider: 'MERCADOPAGO', idempotencyKey: `marketplace:${orderId}:checkout` },
      select: { id: true, status: true, providerPaymentId: true, amount: true, currency: true } });
      check(payment && payment.currency === row.currency && cents(payment.amount) === row.settlement.totalCents,
        'PAYMENT_INTEGRITY_ERROR', 'Pago persistente inconsistente', 503);
      const replay = row.order.paymentStatus === 'PAID';
      if (replay) {
        check(payment.status === 'CAPTURED' && payment.providerPaymentId === paymentId && row.order.paymentProviderId === paymentId
          && row.dispatch, 'PAYMENT_CONFLICT', 'La orden ya tiene otro pago o estado inconsistente', 409);
      } else {
        check(payment.status === 'PENDING' && payment.providerPaymentId == null, 'PAYMENT_CONFLICT', 'El pago cambio', 409);
        const updated = await tx.marketplacePayment.updateMany({ where: { id: payment.id, restaurantId: row.restaurantId,
          orderId, status: 'PENDING', providerPaymentId: null }, data: { status: 'CAPTURED', providerPaymentId: paymentId,
          providerStatus: 'approved', capturedAt: at() } });
        check(updated.count === 1, 'PAYMENT_CONFLICT', 'El pago cambio', 409);
        const paid = await tx.order.updateMany({ where: { id: orderId, restaurantId: row.restaurantId, paymentStatus: 'PENDING' },
          data: { paymentStatus: 'PAID', paidAt: at(), paymentProviderId: paymentId, paymentProviderStatus: 'approved' } });
        check(paid.count === 1, 'PAYMENT_CONFLICT', 'La orden cambio', 409);
      }
      const ledgerResult = await recordLedgerTransaction({ transaction: buildOrderCaptureTransaction({ orderId, referenceId: paymentId,
        amount: row.settlement.totalCents / 100 }), paymentId: payment.id, restaurantId: row.restaurantId,
        idempotencyKey: `marketplace:${payment.id}:capture`, prismaClient: tx });
      check(!replay || ledgerResult.idempotent, 'PAYMENT_INTEGRITY_ERROR', 'Falta el asiento original de captura', 503);
      if (!replay) await saveDispatch(tx, row, offer(row, at()));
      return { ...receipt(await load(tx, orderId, row.restaurantId)), idempotent: replay };
    }, TX);
  }
  async function getMarketplaceOrderStatus({ orderId, trackingToken, prismaClient }) {
    check(text(orderId) && typeof trackingToken === 'string' && /^[a-f0-9]{64}$/.test(trackingToken), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    const slugs = allowed();
    check(slugs.length > 0, 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    client(prismaClient);
    const row = await prismaClient.marketplaceOrderPipeline.findFirst({ where: { orderId, trackingTokenHash: digest(trackingToken),
      trackingExpiresAt: { gt: at() }, storeSlug: { in: slugs },
      order: { is: { source: 'MARKETPLACE', restaurant: { is: { isActive: true,
        slug: { in: slugs }, tenant: { is: { hasWebStore: true, isDemo: false } } } } } } }, select: PIPELINE_SELECT });
    check(row && row.orderId === orderId && row.restaurantId === row.order?.restaurantId && row.trackingTokenHash === digest(trackingToken)
      && slugs.includes(row.storeSlug) && new Date(row.trackingExpiresAt) > at(), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    const deliveryPin = pin(orderId, 'delivery', row.pinKeyId);
    check(verifyPin(deliveryPin, row.deliveryPinHash), 'PIN_KEY_UNAVAILABLE', 'Configuracion de PIN no disponible', 503);
    return { ...receipt(row), deliveryPin };
  }
  async function getMarketplacePickupPin({ orderId, restaurantId, prismaClient }) {
    // Internal only: the caller must authenticate a merchant and supply its resolved restaurant ID.
    check(text(orderId) && text(restaurantId), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    const row = await load(client(prismaClient), orderId, restaurantId);
    const pickupPin = pin(orderId, 'pickup', row.pinKeyId);
    check(verifyPin(pickupPin, row.pickupPinHash), 'PIN_KEY_UNAVAILABLE', 'Configuracion de PIN no disponible', 503);
    return { orderId, pickupPin };
  }
  async function transition(operation, { orderId, courier, offerId, pickupPin, deliveryPin, prismaClient }) {
    // Internal adapter boundary: courier is a server-resolved identity, never a request body.
    check(courier && text(courier.id) && courier.isActive === true && courier.isShared === true,
      'COURIER_FORBIDDEN', 'Repartidor no autorizado', 403);
    const before = await load(client(prismaClient), orderId);
    return prismaClient.$transaction(async tx => {
      const row = await locked(tx, before);
      check(row.dispatch && row.order.status !== 'CANCELLED', 'DISPATCH_UNAVAILABLE', 'Despacho no disponible', 409);
      const dispatch = json(row.dispatch); const task = dispatch.task;
      check(task.orderId === orderId && task.restaurantId === row.restaurantId && dispatch.offer.taskId === task.id,
        'DISPATCH_INTEGRITY_ERROR', 'Despacho inconsistente', 503);
      if (operation === 'accept') {
        check(offerId === dispatch.offer.id, 'OFFER_NOT_FOUND', 'Oferta no encontrada', 404);
        if (task.currentAssignment?.courierId === courier.id && dispatch.offer.status === 'ACCEPTED') return receipt(row);
        atomicAcceptOffer({ task, offer: dispatch.offer, courierId: courier.id, now: at() });
      } else {
        check(task.currentAssignment?.courierId === courier.id, 'COURIER_FORBIDDEN', 'Asignacion no autorizada', 403);
        check(verifyPin(operation === 'pickup' ? pickupPin : deliveryPin, operation === 'pickup' ? task.pickupPinHash : task.deliveryPinHash),
          'INVALID_PIN', 'PIN invalido');
        if (operation === 'pickup') {
          if (task.status === 'PICKED_UP') return receipt(row);
          check(row.order.status === 'READY', 'ORDER_NOT_READY', 'La tienda aun no confirma el pedido listo', 409);
          confirmPickup({ task, pickupPin, now: at() });
          await tx.order.updateMany({ where: { id: orderId, restaurantId: row.restaurantId, status: 'READY' }, data: { status: 'ON_THE_WAY' } });
        } else {
          const replay = task.status === 'DELIVERED';
          if (!replay) confirmDelivery({ task, deliveryPin, now: at() });
          if (row.paymentMethod === 'ONLINE') {
            const payment = await tx.marketplacePayment.findFirst({ where: { orderId, restaurantId: row.restaurantId,
              provider: 'MERCADOPAGO', providerPaymentId: row.order.paymentProviderId, status: 'CAPTURED' }, select: { id: true } });
            check(payment && row.order.paymentStatus === 'PAID', 'PAYMENT_INTEGRITY_ERROR', 'Pago inconsistente', 503);
            const s = row.settlement;
            const ledgerResult = await recordLedgerTransaction({ transaction: buildOrderSettlementTransaction({ orderId,
              referenceId: `settlement:${payment.id}`, settlement: { customerTotal: s.totalCents / 100,
                merchantPayout: s.merchantPayoutCents / 100, courierPayout: s.courierPayoutCents / 100, platformFee: s.platformFeeCents / 100 } }),
            paymentId: payment.id, restaurantId: row.restaurantId, courierId: courier.id,
            idempotencyKey: `marketplace:${payment.id}:settlement`, prismaClient: tx });
            check(!replay || ledgerResult.idempotent, 'PAYMENT_INTEGRITY_ERROR', 'Falta el asiento original de liquidacion', 503);
          }
          await tx.order.updateMany({ where: { id: orderId, restaurantId: row.restaurantId }, data: { status: 'DELIVERED' } });
        }
      }
      await saveDispatch(tx, row, dispatch);
      return receipt(await load(tx, orderId, row.restaurantId));
    }, TX);
  }
  async function refreshMarketplaceOffer({ orderId, restaurantId, prismaClient }) {
    // Internal dispatcher/merchant boundary; IDs must come from authenticated server context.
    check(text(orderId) && text(restaurantId), 'ORDER_NOT_FOUND', 'Orden no encontrada', 404);
    const before = await load(client(prismaClient), orderId, restaurantId);
    return prismaClient.$transaction(async tx => {
      const row = await locked(tx, before);
      check(row.dispatch?.task.status === 'OFFERING' && !row.dispatch.task.currentAssignment
        && !['CANCELLED', 'DELIVERED'].includes(row.order.status), 'OFFER_NOT_RENEWABLE', 'Oferta no renovable', 409);
      const date = at();
      if (new Date(row.dispatch.offer.expiresAt) > date) return receipt(row);
      const replacement = offer(row, date);
      replacement.task.id = row.dispatch.task.id;
      replacement.task.createdAt = row.dispatch.task.createdAt;
      replacement.offer.taskId = replacement.task.id;
      await saveDispatch(tx, row, replacement);
      return receipt(row);
    }, TX);
  }
  return { createMarketplaceOrder, confirmMarketplacePayment, getMarketplaceOrderStatus, getMarketplacePickupPin,
    refreshMarketplaceOffer,
    acceptMarketplaceOffer: input => transition('accept', input), confirmMarketplacePickup: input => transition('pickup', input),
    confirmMarketplaceDelivery: input => transition('delivery', input) };
}

module.exports = { MarketplaceOrderError, createMarketplaceOrdersService,
  ...Object.fromEntries(['createMarketplaceOrder', 'confirmMarketplacePayment', 'getMarketplaceOrderStatus', 'getMarketplacePickupPin', 'refreshMarketplaceOffer',
    'acceptMarketplaceOffer', 'confirmMarketplacePickup', 'confirmMarketplaceDelivery'].map(name => [name, input => createMarketplaceOrdersService()[name](input)])) };
