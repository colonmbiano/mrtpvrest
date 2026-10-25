'use strict';

// Adaptadores Prisma de la API v1 del marketplace: cotización y orden.
// El comercio es un restaurante aprobado en el directorio (fila APPROVED en
// marketplace_merchant_memberships) cuyo tenant tiene el módulo "marketplace";
// es el mismo criterio que publica el directorio (APPROVED_MERCHANT). Los precios
// salen del menú del TPV con la misma ventana de promoción que el catálogo.
//
// Primera entrega: solo RECOGER EN TIENDA. La entrega a domicilio necesita una
// libreta de direcciones del comprador (addresses.resolve aún devuelve null).
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
    onlinePayments: env.MARKETPLACE_V1_ONLINE_PAYMENTS_ENABLED === 'true' && notificationUrl !== null, notificationUrl };
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

// Quote rows ⇄ objetos de lib/marketplace-quote.js.
function quoteFromRow(row) {
  if (!row) return null;
  return { id: row.id, accountId: row.accountId, merchantId: row.merchantId, fulfillment: row.fulfillment,
    deliveryAddressId: row.deliveryAddressId ?? null, status: row.status, currency: row.currency,
    itemsSnapshot: row.itemsSnapshot, priceSnapshot: row.priceSnapshot, requestHash: row.requestHash,
    idempotencyKeyHash: row.idempotencyKeyHash, createdAt: row.createdAt, expiresAt: row.expiresAt };
}

function createMarketplaceV1Adapters({ prisma, commissionBps = null, now = () => new Date() } = {}) {
  const merchantScope = where => ({ ...where, isActive: true, ...APPROVED_MERCHANT });

  async function loadMerchantRow(where) {
    const row = await prisma.restaurant.findFirst({ where: merchantScope(where),
      select: { id: true, slug: true, config: { select: CONFIG_SELECT } } });
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
      zones: [],
      prepMinutes: Number.isInteger(config?.estimatedDelivery) ? config.estimatedDelivery : null,
    };
  }

  const catalog = {
    loadMerchant: id => loadMerchantRow({ id }),
    loadMerchantBySlug: slug => loadMerchantRow({ slug }),
    // Solo productos simples se venden por v1: sin variantes, sin grupos de
    // modificadores obligatorios, sin combos y sin venta por peso.
    async loadListings(merchantId, menuItemIds) {
      const [items, promoConfig] = await Promise.all([
        prisma.menuItem.findMany({ where: { restaurantId: merchantId, id: { in: menuItemIds } },
          select: { id: true, restaurantId: true, name: true, price: true, isPromo: true, promoPrice: true,
            promoStartTime: true, promoEndTime: true, isAvailable: true, availableOnline: true,
            soldByWeight: true, isCombo: true, category: { select: { isActive: true, restaurantId: true } },
            variants: { where: { isAvailable: true }, select: { id: true }, take: 1 },
            modifierGroups: { where: { OR: [{ required: true }, { minSelection: { gt: 0 } }] }, select: { id: true }, take: 1 } } }),
        prisma.restaurantConfig.findFirst({ where: { restaurantId: merchantId },
          select: { promoStartTime: true, promoEndTime: true, timezone: true } }),
      ]);
      const at = now();
      return items.map(row => {
        const unit = activePromoPrice(row, promoConfig || null, at) ?? row.price;
        const unitPriceCents = cents(unit);
        return { merchantId: row.restaurantId, menuItemId: row.id, name: row.name,
          published: row.availableOnline === true && row.category?.isActive === true
            && row.category?.restaurantId === merchantId && row.soldByWeight !== true && row.isCombo !== true
            && row.variants.length === 0 && row.modifierGroups.length === 0 && unitPriceCents > 0,
          available: row.isAvailable === true, unitPriceCents };
      });
    },
  };

  // Entrega a domicilio pendiente: todavía no hay libreta de direcciones del
  // comprador, así que ninguna dirección resuelve (la cotización responde 404).
  const addresses = { resolve: async () => null };

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
        select: { id: true, slug: true, locations: { where: { isActive: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true }, take: 1 } } });
      if (!row) return null;
      return { id: row.id, status: 'ACTIVE', restaurantId: row.id, locationId: row.locations[0]?.id ?? null, slug: row.slug };
    },
  };

  // Seguimiento (lib/marketplace-tracking-v1.js): la orden se busca por su token
  // (hash) y el servicio vuelve a validar orden, tienda, sucursal y vigencia.
  const tracking = {
    taskStore: {
      async findByOrderId({ orderId, trackingTokenHash }) {
        const row = await prisma.marketplaceOrderPipeline.findFirst({
          where: { orderId, trackingTokenHash, order: { is: { source: 'MARKETPLACE' } } },
          select: { orderId: true, restaurantId: true, trackingTokenHash: true, trackingExpiresAt: true, dispatch: true,
            order: { select: { id: true, restaurantId: true, locationId: true, source: true, status: true } } } });
        if (!row) return null;
        const { dispatch, ...record } = row;
        return dispatch?.task ? { ...record, task: dispatch.task } : record;
      },
    },
    // Las sucursales no guardan coordenadas: el origen sale vacío, sin inventarlo.
    locationStore: {
      findById: ({ locationId, restaurantId }) => prisma.location.findFirst({ where: { id: locationId, restaurantId },
        select: { id: true, restaurantId: true } }),
    },
    // El despachador aún vive en memoria: sin GPS del repartidor (isStale si ya lleva el pedido).
    presenceStore: { findForAssignment: async () => null },
  };

  return { catalog, addresses, quoteStore, merchants, tracking };
}

function createMarketplaceV1Services({ prisma, env = process.env, now = () => new Date(), getGateway, logger } = {}) {
  const config = marketplaceV1Config(env);
  if (!config.enabled) return null;
  const payments = config.onlinePayments
    ? createMarketplaceV1Payments({ prisma, notificationUrl: config.notificationUrl, now, logger,
      ...(getGateway ? { getGateway } : {}) })
    : null;
  const onlineUnavailable = message => new MarketplaceOrderOrchestratorError('ONLINE_PAYMENT_UNAVAILABLE', message, 409);
  const adapters = createMarketplaceV1Adapters({ prisma, commissionBps: config.commissionBps, now });
  // La clave de los PIN sale del mismo env que la bandera; sin ella la orden responde 503.
  const activePinKeyId = env.MARKETPLACE_PIN_KEY_ID || 'v1';
  const pinSecrets = env.MARKETPLACE_PIN_SECRET ? { [activePinKeyId]: env.MARKETPLACE_PIN_SECRET } : {};
  const orchestrator = createMarketplaceOrderOrchestrator({ ...adapters, prismaClient: prisma, now, activePinKeyId, pinSecrets });
  return {
    quoteService: createQuoteService({ ...adapters, now }),
    orderService: {
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
        if (result.paymentMethod !== 'ONLINE' || !payments) return result;
        return { ...result, checkout: await payments.ensureCheckout({ orderId: result.orderId, restaurantId: result.merchantId }) };
      },
    },
    // Webhook de Mercado Pago de la orden v1 (null sin pago en línea: el router responde 503).
    webhooks: payments ? payments.webhooks : null,
    trackingService: createMarketplaceTrackingService({ ...adapters.tracking, now }),
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
