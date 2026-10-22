'use strict';

const { InvalidQuery, createCatalog, createPrismaCatalogAdapter } = require('../lib/marketplace-catalog');

function createMarketplaceRouter({ Router, getAdapter, storeSlugs = process.env.MARKETPLACE_STORE_SLUGS || '' } = {}) {
  const router = (Router || require('express').Router)();
  const catalog = createCatalog({ storeSlugs, getAdapter: getAdapter || (() => {
    // Deliberately lazy: an empty allowlist never loads or accesses the database.
    return createPrismaCatalogAdapter(require('@mrtpvrest/database').prisma);
  }) });
  function handler(list) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      try {
        res.json(await list(req.query));
      } catch (error) {
        const invalid = error instanceof InvalidQuery;
        res.status(invalid ? 400 : 503).json(invalid
          ? { error: 'Parametros de catalogo invalidos', errorCode: 'INVALID_QUERY' }
          : { error: 'Catalogo temporalmente no disponible', errorCode: 'CATALOG_UNAVAILABLE' });
      }
    };
  }
  router.get('/stores', handler(catalog.listStores));
  router.get('/products', handler(catalog.listProducts));
  return router;
}

module.exports = createMarketplaceRouter;
