'use strict';

// Pago en línea de la orden v1 del marketplace con Mercado Pago. Split: el
// comprador le paga al comercio (su cuenta conectada, integración MERCADOPAGO) y
// la comisión de la plataforma viaja como marketplace_fee.
//  1. ensureCheckout: tras crear la orden ONLINE (PENDING_PAYMENT) fija el cobrador,
//     crea su registro de pago y la preferencia, y guarda el link. Repetir la orden
//     con la misma Idempotency-Key completa lo que haya fallado a medias.
//  2. webhooks.handle: con el aviso firmado se vuelve a consultar el pago en Mercado
//     Pago con el token del comercio. Si coincide (cobrador, monto, comisión, orden)
//     el pago queda CAPTURED, se asienta en el libro y la orden pasa a
//     PENDING_MERCHANT, donde el TPV la ve para aceptarla.
// La red solo se usa con MARKETPLACE_PAYMENT_NETWORK_ENABLED=true (ver la pasarela).

const { createMarketplacePaymentGateway, MarketplaceGatewayError } = require('./marketplace-payment-gateway');
const { createPaymentPreference } = require('./marketplace-payments');
const { buildOrderCaptureTransaction, recordLedgerTransaction } = require('./marketplace-ledger');
const { createMarketplaceWebhooksV1Service } = require('./marketplace-webhooks-v1');
const { decimal } = require('./marketplace-order-money');

const TX = { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 };
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MP_HOST = /^([a-z0-9-]+\.)*mercadopago\.(com|com\.mx|com\.ar|cl|com\.co|com\.br|com\.pe|com\.uy)$/;
const checkoutKey = orderId => `marketplace-v1:${orderId}:checkout`;
const PIPELINE_SELECT = { orderId: true, restaurantId: true, paymentMethod: true, collectorId: true, checkoutUrl: true,
  currency: true, settlement: true, order: { select: { status: true, paymentStatus: true, paymentProviderId: true } } };

function checkoutLink(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && MP_HOST.test(url.hostname) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function createMarketplaceV1Payments({ prisma, notificationUrl, getGateway = createMarketplacePaymentGateway,
  now = () => new Date(), logger = console } = {}) {
  const gatewayFor = restaurantId => getGateway({ restaurantId, prismaClient: prisma });
  const load = (db, orderId, restaurantId) => db.marketplaceOrderPipeline.findFirst({
    where: { orderId, restaurantId, order: { is: { source: 'MARKETPLACE' } } }, select: PIPELINE_SELECT });
  // El webhook sabe de qué comercio es el pago por esta URL (el aviso no lo dice).
  const notifyUrl = restaurantId => `${notificationUrl}${notificationUrl.includes('?') ? '&' : '?'}merchant=${encodeURIComponent(restaurantId)}`;

  // ¿El comercio tiene Mercado Pago conectado? Se pregunta ANTES de crear la orden.
  async function acceptsOnline(restaurantId) {
    try {
      return Boolean((await gatewayFor(restaurantId)).collectorId);
    } catch (error) {
      if (error instanceof MarketplaceGatewayError && error.code === 'PAYMENT_NOT_CONFIGURED') return false;
      throw error;
    }
  }

  async function ensureCheckout({ orderId, restaurantId }) {
    const row = await load(prisma, orderId, restaurantId);
    if (!row || row.paymentMethod !== 'ONLINE') return null;
    if (row.checkoutUrl) return { status: 'READY', url: row.checkoutUrl };
    if (row.order?.paymentStatus === 'PAID') return { status: 'PAID', url: null };
    if (row.order?.status !== 'PENDING_PAYMENT') return { status: 'UNAVAILABLE', url: null };
    try {
      const gateway = await gatewayFor(restaurantId);
      const s = row.settlement;
      // Cobrador y registro de pago quedan fijos antes de pedir la preferencia: el
      // webhook solo acepta un pago a este cobrador y por este monto.
      await prisma.$transaction(async tx => {
        const pinned = await tx.marketplaceOrderPipeline.updateMany({ where: { orderId, restaurantId, collectorId: null },
          data: { collectorId: gateway.collectorId } });
        if (pinned.count !== 1) {
          const current = await load(tx, orderId, restaurantId);
          if (current?.collectorId !== gateway.collectorId) throw Object.assign(new Error('collector'), { code: 'PAYMENT_CONFIGURATION_CHANGED' });
        }
        const payment = await tx.marketplacePayment.findFirst({ where: { orderId, restaurantId, idempotencyKey: checkoutKey(orderId) },
          select: { id: true } });
        if (!payment) {
          await tx.marketplacePayment.create({ data: { restaurantId, orderId, provider: 'MERCADOPAGO',
            idempotencyKey: checkoutKey(orderId), status: 'PENDING', amount: decimal(s.totalCents), currency: row.currency } });
        }
      }, TX);
      const preference = await createPaymentPreference({ orderId, subtotal: s.subtotalCents / 100,
        deliveryFee: s.deliveryFeeCents / 100, tip: 0, collectorId: gateway.collectorId, currency: row.currency,
        idempotencyKey: checkoutKey(orderId),
        gateway: { createPreference: args => gateway.createPreference({ ...args, notificationUrl: notifyUrl(restaurantId) }) },
        settlementSnapshot: { subtotal: s.subtotalCents / 100, deliveryFee: s.deliveryFeeCents / 100, tip: 0,
          customerTotal: s.totalCents / 100, platformFee: s.platformFeeCents / 100,
          merchantPayout: s.merchantPayoutCents / 100, courierPayout: s.courierPayoutCents / 100 } });
      const url = checkoutLink(preference?.initPoint);
      if (!url || typeof preference.id !== 'string' || !preference.id) throw Object.assign(new Error('preference'), { code: 'INVALID_PAYMENT_RESPONSE' });
      await prisma.$transaction(async tx => {
        await tx.marketplaceOrderPipeline.updateMany({ where: { orderId, restaurantId, checkoutUrl: null }, data: { checkoutUrl: url } });
        await tx.order.updateMany({ where: { id: orderId, restaurantId }, data: { paymentProvider: 'MERCADOPAGO', paymentProviderRef: preference.id } });
      }, TX);
      const saved = await load(prisma, orderId, restaurantId);
      return { status: 'READY', url: saved.checkoutUrl };
    } catch (error) {
      // La orden ya existe (esperando pago): el comprador reintenta con la misma clave.
      logger.warn('[marketplace-v1] link de pago pendiente', { orderId, code: error?.code || 'ERROR' });
      return { status: 'PENDING', url: null };
    }
  }

  const webhookStore = {
    findEvent: (provider, eventId) => prisma.marketplaceWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } }, select: { id: true } }),
    async insertEvent(tx, row) {
      try {
        return await tx.marketplaceWebhookEvent.create({ data: row });
      } catch (error) {
        // Otra entrega del mismo aviso ganó el insert: su transacción manda.
        if (error?.code === 'P2002') throw Object.assign(new Error('duplicate'), { code: 'DUPLICATE' });
        throw error;
      }
    },
    updateEvent: (tx, id, data) => tx.marketplaceWebhookEvent.update({ where: { id }, data }),
  };
  // Sin consumidor de outbox todavía: el TPV ve el cambio de estado al refrescar.
  const outboxStore = { append: async () => {} };
  const unitOfWork = { run: work => prisma.$transaction(work, TX) };

  function portsFor(merchantId) {
    const paymentGateway = {
      async getPayment(dataId) {
        if (!merchantId) return null;
        let gateway;
        try { gateway = await gatewayFor(merchantId); } catch (error) {
          // Comercio sin Mercado Pago: aviso permanente, no reintentable.
          if (error instanceof MarketplaceGatewayError && error.code === 'PAYMENT_NOT_CONFIGURED') return null;
          throw error;
        }
        return gateway.getPayment(dataId);
      },
    };
    const orderStore = {
      async findOrder(orderId) {
        if (!merchantId || typeof orderId !== 'string' || !orderId || orderId.length > 64) return null;
        const row = await load(prisma, orderId, merchantId);
        if (!row || row.paymentMethod !== 'ONLINE' || !row.collectorId) return null;
        return { orderId: row.orderId, collectorId: row.collectorId, currency: row.currency,
          totalCents: row.settlement.totalCents, platformFeeCents: row.settlement.platformFeeCents,
          paidPaymentId: row.order?.paymentStatus === 'PAID' ? row.order.paymentProviderId : null };
      },
      async markPaidIfPending(tx, { orderId, paymentId, paidAt }) {
        const paid = await tx.order.updateMany({
          where: { id: orderId, restaurantId: merchantId, source: 'MARKETPLACE', status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' },
          data: { status: 'PENDING_MERCHANT', paymentStatus: 'PAID', paidAt, paymentProviderId: paymentId,
            paymentProviderStatus: 'approved' } });
        if (paid.count !== 1) return false;
        const row = await load(tx, orderId, merchantId);
        const payment = await tx.marketplacePayment.findFirst({ where: { orderId, restaurantId: merchantId,
          idempotencyKey: checkoutKey(orderId) }, select: { id: true } });
        const captured = payment ? await tx.marketplacePayment.updateMany({
          where: { id: payment.id, restaurantId: merchantId, orderId, status: 'PENDING', providerPaymentId: null },
          data: { status: 'CAPTURED', providerPaymentId: paymentId, providerStatus: 'approved', capturedAt: paidAt } }) : { count: 0 };
        // Sin su registro de pago la orden no se marca pagada: se revierte y se reintenta.
        if (!row || captured.count !== 1) throw Object.assign(new Error('payment record'), { code: 'PAYMENT_INTEGRITY_ERROR' });
        await recordLedgerTransaction({ transaction: buildOrderCaptureTransaction({ orderId, referenceId: paymentId,
          amount: row.settlement.totalCents / 100 }), paymentId: payment.id, restaurantId: merchantId,
        idempotencyKey: `marketplace-v1:${payment.id}:capture`, prismaClient: tx });
        return true;
      },
    };
    return { webhookStore, paymentGateway, orderStore, outboxStore, unitOfWork, now };
  }

  const webhooks = {
    handle({ headers, query, body, secret }) {
      const merchantId = typeof query?.merchant === 'string' && ID.test(query.merchant) ? query.merchant : null;
      return createMarketplaceWebhooksV1Service(portsFor(merchantId)).handle({ headers, query, body, secret });
    },
  };

  return { acceptsOnline, ensureCheckout, webhooks };
}

module.exports = { createMarketplaceV1Payments, checkoutLink };
