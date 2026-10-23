'use strict';

const { createMarketplaceOrderOrchestrator, MarketplaceOrderOrchestratorError } = require('../lib/marketplace-order-orchestrator');

// Marketplace accounts are resolved by a trusted adapter. Staff sessions and
// accountId/restaurantId in a client body never confer customer ownership.
function createMarketplaceOrdersV1Router({ Router, service, resolveAccount = () => null, orchestratorOptions } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = await resolveAccount(req);
      const orders = service || (defaultService ||= createMarketplaceOrderOrchestrator(orchestratorOptions));
      const result = await orders.createOrder({ accountId: accountId ?? undefined,
        idempotencyKey: req.headers?.['idempotency-key'], body: req.body });
      return res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof MarketplaceOrderOrchestratorError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Ordenes temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceOrdersV1Router;
