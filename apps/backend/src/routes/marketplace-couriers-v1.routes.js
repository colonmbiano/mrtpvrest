'use strict';

const { CourierV1Error, createCouriersV1Service } = require('../lib/marketplace-couriers-v1');

// Actor resolution is injected. Until a courier or merchant-member identity adapter exists, every
// request is anonymous and gets 401. The staff session is never reused as a courier identity.
const noActor = () => null;

function createMarketplaceCouriersV1Router({ Router, service, resolveActor = noActor } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  const couriers = () => service || (defaultService ||= createCouriersV1Service());
  function handle(run, status) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        const actor = (await resolveActor(req)) ?? null;
        return res.status(status).json(await run(couriers(), actor, req));
      } catch (error) {
        if (error instanceof CourierV1Error) {
          return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
        }
        return res.status(503).json({ error: 'Repartidores temporalmente no disponibles', errorCode: 'COURIERS_UNAVAILABLE' });
      }
    };
  }
  router.post('/couriers/apply', handle((svc, actor, req) => svc.apply(actor, req.body), 201));
  router.get('/couriers/me/profile', handle((svc, actor) => svc.profile(actor), 200));
  router.get('/couriers/me/affiliations', handle((svc, actor) => svc.affiliations(actor), 200));
  router.post('/merchants/:id/couriers/affiliate', handle((svc, actor, req) => svc.affiliate(actor, req.params.id, req.body), 201));
  router.delete('/merchants/:id/couriers/affiliate/:courierId',
    handle((svc, actor, req) => svc.revoke(actor, req.params.id, req.params.courierId), 200));
  return router;
}

module.exports = createMarketplaceCouriersV1Router;
