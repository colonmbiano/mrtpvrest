'use strict';

const { createMarketplaceOrderOrchestrator, MarketplaceOrderOrchestratorError } = require('../lib/marketplace-order-orchestrator');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');

// Bearer customer tokens or explicit guest-session buyer handles are supported.
// Staff sessions and accountId/restaurantId in a body never confer ownership.
function createMarketplaceOrdersV1Router({ Router, service, resolveAccount, orchestratorOptions, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  let defaultService;
  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = await accountFor(req);
      const orders = service || (defaultService ||= createMarketplaceOrderOrchestrator(orchestratorOptions));
      const result = await orders.createOrder({ accountId: accountId ?? undefined,
        idempotencyKey: req.headers?.['idempotency-key'], body: req.body });
      return res.status(result.idempotent ? 200 : 201).json(result);
    } catch (error) {
      if (error instanceof MarketplaceOrderOrchestratorError || error instanceof BuyerIdentityError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Ordenes temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
    }
  });
  return router;
}

module.exports = createMarketplaceOrdersV1Router;
