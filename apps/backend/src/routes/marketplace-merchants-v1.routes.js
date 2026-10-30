'use strict';

const { MerchantsV1Error, createMerchantsV1Service } = require('../lib/marketplace-merchants-v1');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

// Public, read-only. Mounted at /api/marketplace/v1 next to the dispatch router, which only owns its own paths.
function createMarketplaceMerchantsV1Router({ Router, service } = {}) {
  const router = (Router || require('express').Router)();
  let defaultService;
  // Con MARKETPLACE_V1_ORDERS_ENABLED el repo lee los comercios aprobados de la BD (lib/marketplace-v1-prisma.js);
  // sin la bandera no hay repo y el servicio responde 503.
  const merchants = () => service || (defaultService ||= createMerchantsV1Service({ repo: defaultMarketplaceV1Services()?.merchantsRepo }));
  function handle(run) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        return res.status(200).json(await run(req));
      } catch (error) {
        if (error instanceof MerchantsV1Error) {
          return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
        }
        return res.status(503).json({ error: 'Marketplace temporalmente no disponible', errorCode: 'MARKETPLACE_UNAVAILABLE' });
      }
    };
  }
  router.get('/merchants', handle(req => merchants().listMerchants(req.query)));
  router.get('/merchants/:slug', handle(req => merchants().getMerchant(req.params.slug)));
  router.get('/merchants/:slug/catalog', handle(req => merchants().getMerchantCatalog(req.params.slug)));
  return router;
}

module.exports = createMarketplaceMerchantsV1Router;
