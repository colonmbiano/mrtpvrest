'use strict';

const { MarketplaceOpsDispatchError, createMarketplaceOpsDispatchService } = require('../lib/marketplace-ops-dispatch-v1');

function createMarketplaceOpsDispatchV1Router({ Router, service, resolveActor = () => null, opsOptions } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  function handle(run) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const actor = (await resolveActor(req)) ?? null;
        const ops = service || (defaultService ||= createMarketplaceOpsDispatchService(opsOptions));
        return res.json(await run(ops, actor, req));
      } catch (error) {
        if (error instanceof MarketplaceOpsDispatchError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
        if (['P2002', 'P2034', 'P2028'].includes(error?.code)) return res.status(409).json({ error: 'El recurso cambio; actualiza la vista', errorCode: 'OPS_CONFLICT' });
        return res.status(503).json({ error: 'Operaciones de despacho temporalmente no disponibles', errorCode: 'OPS_UNAVAILABLE' });
      }
    };
  }
  // resolveActor must verify a session and current role/permissions server-side.
  // Neither req.user nor claims supplied in query/body are accepted by default.
  router.get('/dispatch', handle((ops, actor, req) => ops.listDispatch(actor, req.query ?? {})));
  router.post('/dispatch/tasks/:id/reassign', handle((ops, actor, req) => ops.reassign(actor, req.params.id, req.body)));
  router.post('/couriers/:id/approve', handle((ops, actor, req) => ops.approveCourier(actor, req.params.id, req.body ?? {})));
  return router;
}

module.exports = createMarketplaceOpsDispatchV1Router;
