'use strict';

const { MarketplaceTrackingError, createMarketplaceTrackingService } = require('../lib/marketplace-tracking-v1');

function createMarketplaceTrackingV1Router({ Router, service, trackingOptions } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  // Mounted under /api/marketplace/v1. Header capability is scoped to one order;
  // req.user, query-string tokens and client-supplied courier IDs are no authority.
  router.get('/orders/:id/tracking', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'X-Marketplace-Order-Token');
    try {
      const tracking = service || (defaultService ||= createMarketplaceTrackingService(trackingOptions));
      const result = await tracking.getOrderTracking({ orderId: req.params.id,
        trackingToken: req.headers?.['x-marketplace-order-token'] });
      return res.json(result);
    } catch (error) {
      if (error instanceof MarketplaceTrackingError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Rastreo temporalmente no disponible', errorCode: 'TRACKING_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceTrackingV1Router;
