'use strict';

const { createMarketplaceOrderOrchestrator, MarketplaceOrderOrchestratorError } = require('../lib/marketplace-order-orchestrator');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

// Bearer customer tokens or explicit guest-session buyer handles are supported.
// Staff sessions and accountId/restaurantId in a body never confer ownership.
// `buyerOrders` (listForAccount): inyectable en pruebas; si no, el de los servicios v1.
function createMarketplaceOrdersV1Router({ Router, service, resolveAccount, orchestratorOptions, buyerOptions, buyerOrders } = {}) {
  const router = (Router || require('express').Router)();
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  let defaultService;

  // Mis pedidos: solo la cuenta del comprador (Bearer). Un invitado no tiene historial:
  // su id vive en un navegador y no prueba ser dueño de nada más.
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Authorization');
    try {
      const accountId = req.headers?.authorization !== undefined ? await accountFor(req) : null;
      if (typeof accountId !== 'string' || accountId.startsWith('guest:')) {
        throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Inicia sesion para ver tus pedidos');
      }
      const lister = buyerOrders || defaultMarketplaceV1Services()?.buyerOrders;
      // Sin MARKETPLACE_V1_ORDERS_ENABLED no hay servicios v1.
      if (!lister) return res.status(503).json({ error: 'Pedidos temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
      const limit = Math.min(Math.max(Number.parseInt(req.query?.limit, 10) || 20, 1), 50);
      const raw = req.query?.before;
      const before = raw === undefined ? null : new Date(typeof raw === 'string' ? raw : NaN);
      if (before && !Number.isFinite(before.getTime())) {
        return res.status(400).json({ error: 'Parametro before invalido', errorCode: 'INVALID_CURSOR' });
      }
      return res.json(await lister.listForAccount({ accountId, limit, before }));
    } catch (error) {
      if (error instanceof BuyerIdentityError) return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      return res.status(503).json({ error: 'Pedidos temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
    }
  });

  // Códigos de recoger y entregar de un pedido activo, para la cuenta dueña (Bearer).
  router.get('/:id/codes', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Vary', 'Authorization');
    try {
      const accountId = req.headers?.authorization !== undefined ? await accountFor(req) : null;
      if (typeof accountId !== 'string' || accountId.startsWith('guest:')) {
        throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Inicia sesion para ver tus pedidos');
      }
      const orders = service || (defaultService ||= orchestratorOptions
        ? createMarketplaceOrderOrchestrator(orchestratorOptions)
        : defaultMarketplaceV1Services()?.orderService || createMarketplaceOrderOrchestrator());
      return res.json(await orders.codesForAccount({ accountId, orderId: req.params.id }));
    } catch (error) {
      if (error instanceof MarketplaceOrderOrchestratorError || error instanceof BuyerIdentityError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Pedidos temporalmente no disponibles', errorCode: 'ORDERS_UNAVAILABLE' });
    }
  });

  router.post('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = await accountFor(req);
      // Sin MARKETPLACE_V1_ORDERS_ENABLED el orquestador no tiene adaptadores y responde 503.
      const orders = service || (defaultService ||= orchestratorOptions
        ? createMarketplaceOrderOrchestrator(orchestratorOptions)
        : defaultMarketplaceV1Services()?.orderService || createMarketplaceOrderOrchestrator());
      // io: para avisar a la caja al instante cuando la orden queda por aceptar.
      const result = await orders.createOrder({ accountId: accountId ?? undefined,
        idempotencyKey: req.headers?.['idempotency-key'], body: req.body, io: req.app?.get?.('io') });
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
