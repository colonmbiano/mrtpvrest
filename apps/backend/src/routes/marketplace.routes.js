'use strict';

const { InvalidQuery, createCatalog, createPrismaCatalogAdapter } = require('../lib/marketplace-catalog');

function createMarketplaceRouter({ Router, getAdapter, storeSlugs = process.env.MARKETPLACE_STORE_SLUGS || '',
  getPrisma = () => require('@mrtpvrest/database').prisma, orderOptions = {}, authenticate, ledgerStore } = {}) {
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
  let orders;
  function orderService() {
    return orders ||= require('../lib/marketplace-orders').createMarketplaceOrdersService({ ...orderOptions, storeSlugs });
  }
  function orderError(res, error) {
    const { MarketplaceOrderError } = require('../lib/marketplace-orders');
    if (error instanceof MarketplaceOrderError) return res.status(error.statusCode).json({ error: error.message,
      errorCode: error.code, ...(error.recovery ? { recovery: error.recovery } : {}) });
    if (['P2002', 'P2034', 'P2028'].includes(error?.code)) return res.status(409).json({
      error: 'La orden cambio; repite con el mismo Idempotency-Key', errorCode: 'ORDER_CONFLICT' });
    return res.status(503).json({ error: 'Ordenes temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
  }
  router.post('/orders', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const key = req.headers?.['idempotency-key'];
      const fields = ['storeSlug', 'restaurantId', 'items', 'deliveryAddress', 'customer', 'paymentMethod', 'deliveryFee', 'tip'];
      if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(key)
        || !req.body || typeof req.body !== 'object' || Array.isArray(req.body)
        || Object.keys(req.body).some(field => !fields.includes(field))) {
        return res.status(400).json({ error: 'Solicitud o Idempotency-Key invalidos', errorCode: 'INVALID_ORDER_REQUEST' });
      }
      // Empty publication policy is checked before loading Prisma.
      const { parseStoreSlugs } = require('../lib/marketplace-catalog');
      if (!parseStoreSlugs(storeSlugs).includes(req.body.storeSlug)) {
        return res.status(404).json({ error: 'Tienda no encontrada', errorCode: 'STORE_NOT_FOUND' });
      }
      const result = await orderService().createMarketplaceOrder({ ...req.body, idempotencyKey: key, prismaClient: getPrisma() });
      return res.status(201).json(result);
    } catch (error) { return orderError(res, error); }
  });
  router.get('/orders/:id/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const trackingToken = req.headers?.['x-marketplace-order-token'];
      if (!/^[a-f0-9]{64}$/.test(typeof trackingToken === 'string' ? trackingToken : '')
        || !parseStoreSlugsForStatus(storeSlugs)) {
        return res.status(404).json({ error: 'Orden no encontrada', errorCode: 'ORDER_NOT_FOUND' });
      }
      return res.json(await orderService().getMarketplaceOrderStatus({ orderId: req.params.id,
        trackingToken, prismaClient: getPrisma() }));
    } catch (error) { return orderError(res, error); }
  });
  function driverAuthentication(req, res, next) {
    res.set('Cache-Control', 'no-store');
    // Do not load the authenticated application stack while serving the public catalog.
    return (authenticate || require('../middleware/auth.middleware').authenticate)(req, res, next);
  }
  function driverHandler(kind) {
    return async (req, res) => {
      res.set('Cache-Control', 'no-store');
      const { getDriverBalance, getDriverDeliveryHistory, resolveDriverAccess, DriverBalanceError } = require('../lib/marketplace-driver-balance');
      try {
        const scope = resolveDriverAccess(req);
        let limit = 50;
        if (kind === 'history' && req.query?.limit !== undefined) {
          if (typeof req.query.limit !== 'string' || !/^[1-9]\d{0,2}$/.test(req.query.limit) || Number(req.query.limit) > 100) {
            throw new DriverBalanceError('INVALID_LIMIT', 'limit debe estar entre 1 y 100');
          }
          limit = Number(req.query.limit);
        }
        const prismaClient = getPrisma();
        return res.json(kind === 'balance'
          ? await getDriverBalance({ ...scope, prismaClient, ledgerStore })
          : await getDriverDeliveryHistory({ ...scope, limit, prismaClient }));
      } catch (error) {
        if (error instanceof DriverBalanceError && error.statusCode < 500) {
          return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
        }
        return res.status(503).json({ error: 'Informacion de repartidor temporalmente no disponible', errorCode: 'DRIVER_BALANCE_UNAVAILABLE' });
      }
    };
  }
  router.get('/drivers/:id/balance', driverAuthentication, driverHandler('balance'));
  router.get('/drivers/:id/history', driverAuthentication, driverHandler('history'));
  return router;
}

function parseStoreSlugsForStatus(value) {
  return require('../lib/marketplace-catalog').parseStoreSlugs(value).length > 0;
}

module.exports = createMarketplaceRouter;
