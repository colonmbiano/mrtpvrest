'use strict';

const { MarketplaceOpsDispatchError, createMarketplaceOpsDispatchService } = require('../lib/marketplace-ops-dispatch-v1');
const { StaffIdentityError, createStaffActorResolver } = require('../lib/marketplace-staff-identity');

function createMarketplaceOpsDispatchV1Router({ Router, service, resolveActor, opsOptions, staffOptions } = {}) {
  const router = (Router || require('express').Router)();
  const actorFor = resolveActor || createStaffActorResolver(staffOptions);
  let defaultService;
  function handle(run) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const actor = (await actorFor(req)) ?? null;
        const ops = service || (defaultService ||= createMarketplaceOpsDispatchService(opsOptions));
        return res.json(await run(ops, actor, req));
      } catch (error) {
        if (error instanceof MarketplaceOpsDispatchError || error instanceof StaffIdentityError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
        if (['P2002', 'P2034', 'P2028'].includes(error?.code)) return res.status(409).json({ error: 'El recurso cambio; actualiza la vista', errorCode: 'OPS_CONFLICT' });
        return res.status(503).json({ error: 'Operaciones de despacho temporalmente no disponibles', errorCode: 'OPS_UNAVAILABLE' });
      }
    };
  }
  // Service authorization still checks roles and explicit permissions after identity resolution.
  router.get('/dispatch', handle((ops, actor, req) => ops.listDispatch(actor, req.query ?? {})));
  router.post('/dispatch/tasks/:id/reassign', handle((ops, actor, req) => ops.reassign(actor, req.params.id, req.body)));
  router.post('/couriers/:id/approve', handle((ops, actor, req) => ops.approveCourier(actor, req.params.id, req.body ?? {})));
  return router;
}

module.exports = createMarketplaceOpsDispatchV1Router;
