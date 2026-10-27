'use strict';

// Adaptadores Prisma de la API v1 del marketplace: cotización y orden.
// El comercio es un restaurante aprobado en el directorio (fila APPROVED en
// marketplace_merchant_memberships) cuyo tenant tiene el módulo "marketplace";
// es el mismo criterio que publica el directorio (APPROVED_MERCHANT). Los precios
// salen del menú del TPV con la misma ventana de promoción que el catálogo.
//
// Entrega a domicilio: la dirección sale de la libreta del comprador
// (lib/marketplace-buyer-addresses.js) y el envío se cobra con la regla de la
// tienda (RestaurantConfig.deliveryMode FLAT | DISTANCE | ZONES, lib/delivery-fee.js).
// La entregan los repartidores PROPIOS de la tienda con el PIN del comprador: la tarea
// de despacho nace en política MANUAL, sin oferta a la red (lib/marketplace-store-delivery.js).
// Se activa aparte con MARKETPLACE_V1_DELIVERY_ENABLED=true.
//
// Apagado por defecto: MARKETPLACE_V1_ORDERS_ENABLED=true lo activa. Además hace
// falta MARKETPLACE_COMMISSION_BPS (0–10000; sin ella la cotización responde 503)
// y MARKETPLACE_PIN_SECRET (32+ bytes; sin ella la orden responde 503).
// Pago en línea (lib/marketplace-v1-payments.js), aparte: MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED=true
// y MARKETPLACE_MP_NOTIFICATION_URL (https, el webhook v1); sin ellos ONLINE se rechaza (409).

const { computeOpenState } = require('../utils/storeHours');
const { activePromoPrice, APPROVED_MERCHANT } = require('./marketplace-catalog');
const { createQuoteService } = require('./marketplace-quote');
const { createMarketplaceOrderOrchestrator, MarketplaceOrderOrchestratorError } = require('./marketplace-order-orchestrator');
const { createMarketplaceV1Payments } = require('./marketplace-v1-payments');
const { createMarketplaceTrackingService } = require('./marketplace-tracking-v1');
const { createBuyerAddressBook } = require('./marketplace-buyer-addresses');
const { createMerchantOrderNotifier } = require('./marketplace-v1-notify');
const { MAX_CENTS } = require('./marketplace-order-money');

function httpsUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

function marketplaceV1Config(env = process.env) {
  const raw = String(env.MARKETPLACE_COMMISSION_BPS ?? '').trim();
  const bps = /^\d{1,5}$/.test(raw) ? Number(raw) : null;
  const notificationUrl = httpsUrl(env.MARKETPLACE_MP_NOTIFICATION_URL);
  return { enabled: env.MARKETPLACE_V1_ORDERS_ENABLED === 'true', commissionBps: bps !== null && bps <= 10000 ? bps : null,
    onlinePayments: env.MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED === 'true' && notificationUrl !== null, notificationUrl,
    delivery: env.MARKETPLACE_V1_DELIVERY_ENABLED === 'true' };
}

// Pesos (Float del TPV) → centavos enteros; null si no es un monto válido.
function cents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const result = Math.round(value * 100);
  return Number.isSafeInteger(result) && result <= MAX_CENTS ? result : null;
}

const CONFIG_SELECT = {
  isOpen: true, scheduleEnabled: true, businessHours: true, timezone: true,
  currency: true, minOrderAmount: true, freeDeliveryFrom: true, estimatedDelivery: true,
};
// Campos de envío de RestaurantConfig que lee lib/delivery-fee.js.
const DELIVERY_SELECT = {
  deliveryMode: true, deliveryFee: true, originLat: true, originLng: true,
  deliveryBaseFee: true, deliveryPerKm: true, deliveryFreeRadiusKm: true, deliveryMaxKm: true,
};
// Mismo orden que la tienda y la orden legacy: en solapes gana la de menor prioridad.
const ZONES_SELECT = { where: { active: true }, orderBy: [{ priority: 'asc' }, { id: 'asc' }],
  select: { id: true, name: true, fee: true, active: true, polygon: true } };

// Regla de envío de la tienda en pesos, tal como la recibe computeDeliveryFee.
// null = el comercio no entrega a domicilio por el marketplace (la cotización responde 409).
function deliveryRule(config, location, zones) {
  if (!config || !location || location.hasDelivery === false) return null;
  const { deliveryMode, deliveryFee, originLat, originLng, deliveryBaseFee, deliveryPerKm, deliveryFreeRadiusKm, deliveryMaxKm } = config;
  return { deliveryMode: deliveryMode || 'FLAT', deliveryFee, originLat, originLng, deliveryBaseFee, deliveryPerKm,
    deliveryFreeRadiusKm, deliveryMaxKm,
    // La tarifa de zona es Decimal en la BD; computeDeliveryFee espera un número.
    deliveryZones: deliveryMode === 'ZONES' ? (zones || []).map(zone => ({ ...zone, fee: Number(zone.fee) })) : [] };
}

// Quote rows ⇄ objetos de lib/marketplace-quote.js.
function quoteFromRow(row) {
  if (!row) return null;
  return { id: row.id, accountId: row.accountId, merchantId: row.merchantId, fulfillment: row.fulfillment,
    deliveryAddressId: row.deliveryAddressId ?? null, status: row.status, currency: row.currency,
    itemsSnapshot: row.itemsSnapshot, priceSnapshot: row.priceSnapshot, requestHash: row.requestHash,
    idempotencyKeyHash: row.idempotencyKeyHash, createdAt: row.createdAt, expiresAt: row.expiresAt };
}

// Prefijo de la tarea del reparto propio en el seguimiento; las tareas de la red usan sus propios IDs.
const STORE_TASK_PREFIX = 'store:';

// acceptsOnline(restaurantId): opcional; agrega ONLINE a los métodos de pago públicos del comercio.
// networkPresence(): opcional; devuelve el presenceStore de la red (G1) para el seguimiento.
function createMarketplaceV1Adapters({ prisma, commissionBps = null, deliveryEnabled = false, acceptsOnline = null,
  networkPresence = null, now = () => new Date() } = {}) {
  const merchantScope = where => ({ ...where, isActive: true, ...APPROVED_MERCHANT });
  // Sucursal de la orden: la primera sucursal activa del restaurante (ver merchants.resolve).
  const FIRST_LOCATION = { where: { isActive: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 1 };

  async function loadMerchantRow(where) {
    const row = await prisma.restaurant.findFirst({ where: merchantScope(where),
      select: { id: true, slug: true,
        config: { select: deliveryEnabled ? { ...CONFIG_SELECT, ...DELIVERY_SELECT } : CONFIG_SELECT },
        ...(deliveryEnabled ? { deliveryZones: ZONES_SELECT,
          locations: { ...FIRST_LOCATION, select: { id: true, hasDelivery: true } } } : {}) } });
    if (!row) return null;
    const config = row.config || null;
    return {
      id: row.id, slug: row.slug, status: 'ACTIVE',
      // Mismo horario que la tienda y el directorio; sin configuración, cerrado.
      open: computeOpenState(config, now()).isOpen === true,
      currency: config?.currency || 'MXN',
      ...(commissionBps === null ? {} : { commissionBps }),
      minOrderCents: cents(config?.minOrderAmount) ?? 0,
      freeDeliveryFromCents: config?.freeDeliveryFrom == null ? null : cents(config.freeDeliveryFrom),
      // La sucursal de la orden debe ofrecer domicilio (Location.hasDelivery, como en la tienda).
      delivery: deliveryEnabled ? deliveryRule(config, row.locations?.[0], row.deliveryZones) : null,
      prepMinutes: Number.isInteger(config?.estimatedDelivery) ? config.estimatedDelivery : null,
    };
  }

  const catalog = {
    loadMerchant: id => loadMerchantRow({ id }),
    loadMerchantBySlug: slug => loadMerchantRow({ slug }),
    // Solo productos simples se venden por v1: sin variantes, sin grupos de
    // modificadores obligatorios, sin combos y sin venta por peso.
    async loadListings(merchantId, menuItemIds) {
      const [items, promoConfig] = await loadItems(merchantId, { id: { in: menuItemIds } });
      const at = now();
      return items.map(row => {
        const unit = activePromoPrice(row, promoConfig || null, at) ?? row.price;
        const unitPriceCents = cents(unit);
        return { merchantId: row.restaurantId, menuItemId: row.id, name: row.name,
          published: sellable(row, merchantId) && unitPriceCents > 0,
          available: row.isAvailable === true, unitPriceCents };
      });
    },
  };

  // Productos del menú con lo necesario para saber si v1 los vende y a qué precio.
  function loadItems(merchantId, where = {}) {
    return Promise.all([
      prisma.menuItem.findMany({ where: { restaurantId: merchantId, ...where },
        select: { id: true, restaurantId: true, categoryId: true, name: true, description: true, price: true, isPromo: true,
          promoPrice: true, promoStartTime: true, promoEndTime: true, isAvailable: true, availableOnline: true,
          soldByWeight: true, isCombo: true, category: { select: { isActive: true, restaurantId: true } },
          variants: { where: { isAvailable: true }, select: { id: true }, take: 1 },
          modifierGroups: { where: { OR: [{ required: true }, { minSelection: { gt: 0 } }] }, select: { id: true }, take: 1 } } }),
      prisma.restaurantConfig.findFirst({ where: { restaurantId: merchantId },
        select: { promoStartTime: true, promoEndTime: true, timezone: true } }),
    ]);
  }
  // Solo productos simples: sin variantes, sin modificadores obligatorios, sin combos ni venta por peso.
  function sellable(row, merchantId) {
    return row.availableOnline === true && row.category?.isActive === true && row.category?.restaurantId === merchantId
      && row.soldByWeight !== true && row.isCombo !== true && row.variants.length === 0 && row.modifierGroups.length === 0;
  }

  // Directorio y catálogo públicos v1 (lib/marketplace-merchants-v1.js; la vista ahí es una lista
  // blanca). Mismos comercios que cotizan: aprobados, activos y con el módulo.
  const MERCHANT_SELECT = { id: true, slug: true, name: true, logoUrl: true,
    config: { select: { ...CONFIG_SELECT, address: true, originLat: true, originLng: true, deliveryMode: true } },
    ...(deliveryEnabled ? { deliveryZones: ZONES_SELECT } : {}) };
  function publicMerchant(row, at) {
    const config = row.config || null;
    let businessHours = null;
    try { const parsed = JSON.parse(config?.businessHours || 'null'); businessHours = Array.isArray(parsed) ? parsed : null; } catch { /* sin horario */ }
    return { id: row.id, slug: row.slug, name: row.name, logo: row.logoUrl || null, banner: null,
      // Aún no hay giros/categorías del comercio en el schema.
      categories: [], published: true, status: 'ACTIVE', open: computeOpenState(config, at).isOpen === true,
      estimatedReadyMinutes: Number.isInteger(config?.estimatedDelivery) ? config.estimatedDelivery : null,
      minOrderCents: cents(config?.minOrderAmount) ?? 0,
      deliveryZones: deliveryEnabled && config?.deliveryMode === 'ZONES'
        ? (row.deliveryZones || []).map(zone => ({ id: zone.id, name: zone.name, feeCents: cents(Number(zone.fee)), active: zone.active,
          polygon: zone.polygon })) : [],
      businessHours,
      // El origen del envío de la tienda es su punto de recogida público.
      pickup: Number.isFinite(config?.originLat) && Number.isFinite(config?.originLng)
        ? { address: config.address || null, lat: config.originLat, lng: config.originLng } : null,
      paymentMethods: ['CASH'] };
  }
  const merchantsRepo = {
    async findPublishedMerchants() {
      const rows = await prisma.restaurant.findMany({ where: merchantScope({}), select: MERCHANT_SELECT,
        orderBy: [{ slug: 'asc' }], take: 200 });
      const at = now();
      return rows.map(row => publicMerchant(row, at));
    },
    async findPublishedMerchantBySlug(slug) {
      const row = await prisma.restaurant.findFirst({ where: merchantScope({ slug }), select: MERCHANT_SELECT });
      if (!row) return null;
      const merchant = publicMerchant(row, now());
      if (acceptsOnline && await acceptsOnline(row.id)) merchant.paymentMethods.push('ONLINE');
      return merchant;
    },
    async findMerchantCatalog(merchantId) {
      const [categories, [items, promoConfig]] = await Promise.all([
        prisma.category.findMany({ where: { restaurantId: merchantId, isActive: true },
          select: { id: true, name: true, isActive: true, sortOrder: true } }),
        loadItems(merchantId),
      ]);
      const at = now();
      return {
        categories: categories.map(category => ({ id: category.id, name: category.name, isActive: category.isActive, position: category.sortOrder })),
        items: items.filter(row => sellable(row, merchantId)).map(row => {
          const promo = activePromoPrice(row, promoConfig || null, at);
          return { id: row.id, categoryId: row.categoryId, name: row.name, description: row.description,
            unitPriceCents: cents(row.price), promoActive: promo != null, promoPriceCents: promo == null ? null : cents(promo),
            availableOnline: row.availableOnline, isAvailable: row.isAvailable, modifierGroups: [] };
        }),
      };
    },
  };

  // La cotización y la orden leen la dirección de la libreta del comprador, por cuenta.
  const addressBook = createBuyerAddressBook({ prismaClient: prisma, now });
  const addresses = { resolve: addressBook.resolve };

  const db = tx => tx || prisma;
  const quoteStore = {
    async save(quote) {
      try {
        await prisma.marketplaceQuote.create({ data: {
          id: quote.id, accountId: quote.accountId, merchantId: quote.merchantId, fulfillment: quote.fulfillment,
          deliveryAddressId: quote.deliveryAddressId ?? null, status: quote.status, currency: quote.currency,
          itemsSnapshot: quote.itemsSnapshot, priceSnapshot: quote.priceSnapshot, requestHash: quote.requestHash,
          idempotencyKeyHash: quote.idempotencyKeyHash, createdAt: quote.createdAt, expiresAt: quote.expiresAt } });
      } catch (error) {
        // Otra petición con la misma Idempotency-Key ganó el insert.
        if (error?.code === 'P2002') throw Object.assign(new Error('Duplicate quote'), { code: 'DUPLICATE' });
        throw error;
      }
    },
    async findByIdempotencyKey(idempotencyKeyHash) {
      return quoteFromRow(await prisma.marketplaceQuote.findUnique({ where: { idempotencyKeyHash } }));
    },
    async findById({ quoteId, accountId, tx }) {
      return quoteFromRow(await db(tx).marketplaceQuote.findFirst({ where: { id: quoteId, accountId } }));
    },
    async findOrderReference({ accountId, requestKeyHash, tx }) {
      const row = await db(tx).marketplaceQuote.findFirst({ where: { accountId, requestKeyHash, orderId: { not: null } },
        select: { orderId: true, merchantId: true } });
      return row ? { orderId: row.orderId, restaurantId: row.merchantId } : null;
    },
    // CAS: solo una cotización ACTIVA y vigente se consume, y queda ligada a su orden.
    async consume({ quoteId, accountId, orderId, restaurantId, requestKeyHash, at, tx }) {
      return db(tx).marketplaceQuote.updateMany({
        where: { id: quoteId, accountId, merchantId: restaurantId, status: 'ACTIVE', expiresAt: { gt: at } },
        data: { status: 'CONSUMED', consumedAt: at, orderId, requestKeyHash } });
    },
  };

  const merchants = {
    // Sucursal de la orden: la primera sucursal activa del restaurante.
    async resolve(merchantId, { tx } = {}) {
      const row = await db(tx).restaurant.findFirst({ where: merchantScope({ id: merchantId }),
        select: { id: true, slug: true, locations: { ...FIRST_LOCATION, select: { id: true } } } });
      if (!row) return null;
      // MANUAL: entrega la tienda con sus repartidores; la orden no se ofrece a la red compartida.
      return { id: row.id, status: 'ACTIVE', restaurantId: row.id, locationId: row.locations[0]?.id ?? null, slug: row.slug,
        deliveryPolicy: 'MANUAL' };
    },
  };

  // Reparto propio (MANUAL): no hay tarea de la red, así que la tarea y la asignación
  // se describen con los avisos GPS que la app del repartidor etiqueta con ESTE pedido
  // (routes/gps.routes.js solo acepta la etiqueta si el pedido es de ese repartidor).
  // La app solo etiqueta el pedido que lleva en camino; el primer aviso marca la salida.
  const storeCourierTask = async order => {
    if (order.orderType !== 'DELIVERY' || order.status !== 'ON_THE_WAY' || !order.deliveryDriverId) return null;
    const first = await prisma.driverLocation.findFirst({ where: { driverId: order.deliveryDriverId, orderId: order.id },
      orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    if (!first) return null;
    const taskId = `${STORE_TASK_PREFIX}${order.id}`;
    const assignment = { id: `${taskId}:${order.deliveryDriverId}`, taskId, status: 'ACTIVE',
      courierId: order.deliveryDriverId, pickedUpAt: first.createdAt };
    return { id: taskId, orderId: order.id, restaurantId: order.restaurantId, locationId: order.locationId,
      status: 'PICKED_UP', pickedUpAt: first.createdAt, currentAssignmentId: assignment.id, currentAssignment: assignment };
  };

  // Seguimiento (lib/marketplace-tracking-v1.js): la orden se busca por su token
  // (hash) y el servicio vuelve a validar orden, tienda, sucursal y vigencia.
  const tracking = {
    taskStore: {
      async findByOrderId({ orderId, trackingTokenHash }) {
        const row = await prisma.marketplaceOrderPipeline.findFirst({
          where: { orderId, trackingTokenHash, order: { is: { source: 'MARKETPLACE' } } },
          select: { orderId: true, restaurantId: true, trackingTokenHash: true, trackingExpiresAt: true, dispatch: true,
            order: { select: { id: true, restaurantId: true, locationId: true, source: true, status: true,
              orderType: true, deliveryDriverId: true } } } });
        if (!row) return null;
        const { dispatch, ...record } = row;
        // Las órdenes v1 nacen con una tarea MANUAL que la red nunca toma: la entrega la
        // tienda, así que su GPS sale del repartidor propio. Otras políticas son de la red.
        const manual = !dispatch?.task || dispatch.task.deliveryPolicy === 'MANUAL';
        const task = (manual ? await storeCourierTask(record.order) : null) ?? dispatch?.task;
        return task ? { ...record, task } : record;
      },
    },
    // Coordenadas de la sucursal (opcionales): sin ellas el origen sale vacío, sin inventarlo.
    locationStore: {
      findById: ({ locationId, restaurantId }) => prisma.location.findFirst({ where: { id: locationId, restaurantId },
        select: { id: true, restaurantId: true, latitude: true, longitude: true } }),
    },
    // Repartidor propio: su último aviso GPS de este pedido. Red: la presencia
    // persistente (G1), solo si la red está activa. El servicio descarta señales viejas.
    presenceStore: {
      async findForAssignment(scope) {
        if (!scope?.taskId?.startsWith(STORE_TASK_PREFIX)) return networkPresence ? networkPresence().findForAssignment(scope) : null;
        if (scope.taskId !== `${STORE_TASK_PREFIX}${scope.orderId}` || scope.assignmentId !== `${scope.taskId}:${scope.courierId}`) return null;
        const ping = await prisma.driverLocation.findFirst({ where: { driverId: scope.courierId, orderId: scope.orderId },
          orderBy: { createdAt: 'desc' }, select: { lat: true, lng: true, createdAt: true } });
        return ping ? { courierId: scope.courierId, assignmentId: scope.assignmentId, taskId: scope.taskId,
          orderId: scope.orderId, lat: ping.lat, lng: ping.lng, lastSeenAt: ping.createdAt } : null;
      },
    },
  };

  return { catalog, addresses, addressBook, quoteStore, merchants, merchantsRepo, tracking };
}

function createMarketplaceV1Services({ prisma, env = process.env, now = () => new Date(), getGateway, logger } = {}) {
  const config = marketplaceV1Config(env);
  if (!config.enabled) return null;
  // Aviso inmediato a la caja (order:new) cuando una orden queda por aceptar; los routers pasan io.
  const notifyMerchant = createMerchantOrderNotifier({ prisma, ...(logger ? { logger } : {}) });
  const payments = config.onlinePayments
    ? createMarketplaceV1Payments({ prisma, notificationUrl: config.notificationUrl, now, logger, notifyMerchant,
      ...(getGateway ? { getGateway } : {}) })
    : null;
  const onlineUnavailable = message => new MarketplaceOrderOrchestratorError('ONLINE_PAYMENT_UNAVAILABLE', message, 409);
  // La presencia de la red se carga al primer seguimiento de una tarea de la red, y solo con la red activa.
  let network;
  const networkPresence = env.MARKETPLACE_NETWORK_ENABLED === 'true'
    ? () => (network ||= require('./marketplace-network-prisma').createNetworkPersistence({ prisma, now })).presenceStore
    : null;
  const { addressBook, merchantsRepo, ...adapters } = createMarketplaceV1Adapters({ prisma, commissionBps: config.commissionBps,
    deliveryEnabled: config.delivery, acceptsOnline: payments ? id => payments.acceptsOnline(id) : null, networkPresence, now });
  // La clave de los PIN sale del mismo env que la bandera; sin ella la orden responde 503.
  const activePinKeyId = env.MARKETPLACE_PIN_KEY_ID || 'v1';
  const pinSecrets = env.MARKETPLACE_PIN_SECRET ? { [activePinKeyId]: env.MARKETPLACE_PIN_SECRET } : {};
  const orchestrator = createMarketplaceOrderOrchestrator({ ...adapters, prismaClient: prisma, now, activePinKeyId, pinSecrets });
  return {
    quoteService: createQuoteService({ ...adapters, now }),
    orderService: {
      // args.io (opcional): socket del servidor para el aviso a la caja; el orquestador lo ignora.
      async createOrder(args) {
        if (args?.body?.paymentMethod === 'ONLINE') {
          // Sin Mercado Pago conectado, un pedido en línea quedaría sin pagar para siempre.
          if (!payments) throw onlineUnavailable('El pago en línea aún no está disponible en el marketplace; elige pagar en efectivo');
          // Antes de crear la orden: el comercio de la cotización debe tener Mercado Pago.
          const quote = typeof args.accountId === 'string' && typeof args.body.quoteId === 'string'
            ? await prisma.marketplaceQuote.findFirst({ where: { id: args.body.quoteId, accountId: args.accountId },
              select: { merchantId: true } })
            : null;
          if (quote && !(await payments.acceptsOnline(quote.merchantId))) {
            throw onlineUnavailable('Este comercio aún no acepta pago en línea; elige pagar en efectivo');
          }
        }
        const result = await orchestrator.createOrder(args);
        // En efectivo queda por aceptar al crearse (en línea, cuando se confirma el pago). Una repetición no vuelve a avisar.
        if (result.status === 'PENDING_MERCHANT' && !result.idempotent) {
          await notifyMerchant({ io: args?.io, orderId: result.orderId, restaurantId: result.merchantId });
        }
        if (result.paymentMethod !== 'ONLINE' || !payments) return result;
        return { ...result, checkout: await payments.ensureCheckout({ orderId: result.orderId, restaurantId: result.merchantId }) };
      },
    },
    // Webhook de Mercado Pago de la orden v1 (null sin pago en línea: el router responde 503).
    webhooks: payments ? payments.webhooks : null,
    trackingService: createMarketplaceTrackingService({ ...adapters.tracking, now }),
    // Libreta de direcciones del comprador (routes/marketplace-addresses-v1.routes.js).
    addressBook,
    // Directorio y catálogo públicos v1 (routes/marketplace-merchants-v1.routes.js).
    merchantsRepo,
  };
}

// Servicios por defecto de los routers v1. La BD se carga solo si la bandera está
// activa, así importar los routers no toca la base de datos.
let defaults;
function defaultMarketplaceV1Services(env = process.env) {
  if (defaults === undefined) {
    defaults = marketplaceV1Config(env).enabled
      ? createMarketplaceV1Services({ prisma: require('@mrtpvrest/database').prisma, env })
      : null;
  }
  return defaults;
}

module.exports = {
  marketplaceV1Config, createMarketplaceV1Adapters, createMarketplaceV1Services, defaultMarketplaceV1Services,
};
