'use strict';

const { MarketplaceWebhookError, createMarketplaceWebhooksV1Service } = require('../lib/marketplace-webhooks-v1');

// Mounted at /api/marketplace/v1/webhooks. The secret comes from the environment at request time and is
// never defaulted. Without it the service fails closed with 503.
const readSecret = () => process.env.MARKETPLACE_MP_WEBHOOK_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET || null;

function createMarketplaceWebhooksV1Router({ Router, service, webhookSecret = readSecret } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  router.post('/mercadopago', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const webhooks = service || (defaultService ||= createMarketplaceWebhooksV1Service());
      const result = await webhooks.handle({ headers: req.headers, query: req.query, body: req.body, secret: webhookSecret() });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof MarketplaceWebhookError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      // Transient failure: 503 makes Mercado Pago retry. Internal details are never returned.
      return res.status(503).json({ error: 'Webhook temporalmente no disponible', errorCode: 'WEBHOOK_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceWebhooksV1Router;
