'use strict';

const { SettlementsV1Error, createSettlementsV1Service } = require('../lib/marketplace-settlements-v1');

// Actor resolution is injected. Until an identity adapter exists, every request is anonymous (401).
const noActor = () => null;

function createMarketplaceSettlementsV1Router({ Router, service, resolveActor = noActor } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  const settlements = () => service || (defaultService ||= createSettlementsV1Service());
  // Every route shares one error mapping. Internal details are never returned.
  function respond(res, error) {
    if (error instanceof SettlementsV1Error) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
    return res.status(503).json({ error: 'Liquidaciones temporalmente no disponibles', errorCode: 'SETTLEMENTS_UNAVAILABLE' });
  }

  router.get('/merchant/settlements', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = (await resolveActor(req)) ?? null;
      return res.status(200).json(await settlements().listMerchantSettlements(actor, req.query));
    } catch (error) {
      return respond(res, error);
    }
  });

  router.post('/ops/orders/:id/refund', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const actor = (await resolveActor(req)) ?? null;
      const result = await settlements().refundOrder(actor, req.params.id, req.headers?.['idempotency-key'], req.body);
      // 201 for a new refund, 200 for an idempotent replay of an earlier one.
      return res.status(result.replayed ? 200 : 201).json(result);
    } catch (error) {
      return respond(res, error);
    }
  });

  return router;
}

module.exports = createMarketplaceSettlementsV1Router;
