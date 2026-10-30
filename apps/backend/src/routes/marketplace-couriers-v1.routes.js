'use strict';

const { CourierV1Error, createCouriersV1Service } = require('../lib/marketplace-couriers-v1');

// La bandera conecta la sesión global y los stores persistentes. Sin ella,
// solo los fixtures inyectados tienen actor; nunca se crea una identidad implícita.
const noActor = () => null;

function createMarketplaceCouriersV1Router({ Router, service, resolveActor } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  let defaultResolver;
  function initialize() {
    if (process.env.MARKETPLACE_NETWORK_ENABLED !== 'true') return;
    const { createNetworkPersistence, createNetworkCourierPorts, createNetworkActorResolver } = require('../lib/marketplace-network-prisma');
    const prisma = require('@mrtpvrest/database').prisma;
    defaultService ||= createCouriersV1Service(createNetworkCourierPorts(createNetworkPersistence({ prisma })));
    defaultResolver ||= createNetworkActorResolver({ prisma });
  }
  const couriers = () => service || (defaultService ||= createCouriersV1Service());
  function handle(run, status) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        if (!service) initialize();
        const actor = (await (resolveActor || defaultResolver || noActor)(req)) ?? null;
        return res.status(status).json(await run(couriers(), actor, req));
      } catch (error) {
        if (error instanceof CourierV1Error || Number.isInteger(error.statusCode)) {
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
