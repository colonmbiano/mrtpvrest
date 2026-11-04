'use strict';

const { MarketplaceTrackingError, createMarketplaceTrackingService } = require('../lib/marketplace-tracking-v1');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

function createMarketplaceTrackingV1Router({ Router, service, trackingOptions, resolveAccount, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  // Solo Bearer de comprador: un id de invitado (X-Buyer-Id) no sigue pedidos ajenos al token.
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  let defaultService;
  // Mounted under /api/marketplace/v1. Header capability is scoped to one order;
  // req.user, query-string tokens and client-supplied courier IDs are no authority.
  // Without the order token, the Bearer buyer account that owns the order ("Mis pedidos").
  router.get('/orders/:id/tracking', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'X-Marketplace-Order-Token, Authorization');
    try {
      // Sin MARKETPLACE_V1_ORDERS_ENABLED el servicio no tiene puertos y responde 503.
      const tracking = service || (defaultService ||= trackingOptions
        ? createMarketplaceTrackingService(trackingOptions)
        : defaultMarketplaceV1Services()?.trackingService || createMarketplaceTrackingService());
      const trackingToken = req.headers?.['x-marketplace-order-token'];
      const accountId = trackingToken === undefined && req.headers?.authorization !== undefined
        ? await accountFor(req) : undefined;
      const result = await tracking.getOrderTracking({ orderId: req.params.id, trackingToken,
        ...(typeof accountId === 'string' ? { accountId } : {}) });
      return res.json(result);
    } catch (error) {
      if (error instanceof MarketplaceTrackingError || error instanceof BuyerIdentityError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Rastreo temporalmente no disponible', errorCode: 'TRACKING_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceTrackingV1Router;
