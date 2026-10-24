'use strict';

const { cents } = require('./marketplace-order-money');

class MarketplaceGatewayError extends Error {
  constructor(code = 'PAYMENT_UNAVAILABLE') {
    super('Pasarela marketplace no disponible'); this.code = code; this.statusCode = 503;
  }
}

/** Merchant OAuth credentials and commercial terms come exclusively from server configuration.
 * request is a fetch-compatible seam; importing this module never performs network I/O.
 */
async function createMarketplacePaymentGateway({ restaurantId, prismaClient, request = globalThis.fetch, env = process.env }) {
  const integration = await prismaClient.integrationConfig.findFirst({
    where: { restaurantId, type: 'MERCADOPAGO', enabled: true },
    select: { restaurantId: true, config: true, mode: true },
  });
  if (!integration || integration.restaurantId !== restaurantId || !['sandbox', 'production'].includes(integration.mode)) throw new MarketplaceGatewayError('PAYMENT_NOT_CONFIGURED');
  let config;
  try { config = JSON.parse(integration.config); } catch { throw new MarketplaceGatewayError('PAYMENT_NOT_CONFIGURED'); }
  if (!config || typeof config.accessToken !== 'string' || !config.accessToken
    || !/^\d+$/.test(String(config.collectorId || ''))) throw new MarketplaceGatewayError('PAYMENT_NOT_CONFIGURED');

  async function call(endpoint, options = {}) {
    if (env.MARKETPLACE_ISOLATED === 'true' || env.MARKETPLACE_PAYMENT_NETWORK_ENABLED !== 'true') {
      throw new MarketplaceGatewayError('PAYMENT_NETWORK_DISABLED');
    }
    try {
      const response = await request(`https://api.mercadopago.com${endpoint}`, { ...options,
        headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json', ...options.headers },
        signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new MarketplaceGatewayError();
      return await response.json();
    } catch { throw new MarketplaceGatewayError(); }
  }
  return {
    collectorId: String(config.collectorId),
    commissionRate: config.marketplaceCommissionRate ?? 0.05,
    commissionFixed: config.marketplaceCommissionFixed ?? 0,
    async createPreference({ orderId, items, marketplaceFee, idempotencyKey }) {
      const result = await call('/checkout/preferences', { method: 'POST',
        headers: { 'X-Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ external_reference: orderId, items, marketplace_fee: marketplaceFee,
          ...(config.marketplaceNotificationUrl ? { notification_url: config.marketplaceNotificationUrl } : {}) }) });
      const initPoint = integration.mode === 'sandbox' ? result.sandbox_init_point : result.init_point;
      let url;
      try { url = new URL(initPoint); } catch { throw new MarketplaceGatewayError(); }
      if (!result.id || url.protocol !== 'https:' || !/^([a-z0-9-]+\.)*mercadopago\.(com|com\.mx|com\.ar|cl|com\.co|com\.br|com\.pe|com\.uy)$/.test(url.hostname)
        || url.username || url.password) throw new MarketplaceGatewayError();
      return { id: String(result.id), initPoint: url.href };
    },
    async getPayment(paymentId) {
      const result = await call(`/v1/payments/${encodeURIComponent(paymentId)}`);
      try {
        const fee = (result.fee_details || []).filter(row => row.type === 'application_fee')
          .reduce((sum, row) => sum + cents(row.amount), 0);
        return { id: String(result.id), status: result.status, orderId: result.external_reference,
          collectorId: String(result.collector_id), amountCents: cents(result.transaction_amount),
          currency: result.currency_id, marketplaceFeeCents: fee };
      } catch { throw new MarketplaceGatewayError('INVALID_PAYMENT_RESPONSE'); }
    },
  };
}

module.exports = { createMarketplacePaymentGateway, MarketplaceGatewayError };
