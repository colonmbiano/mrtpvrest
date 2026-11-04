'use strict';

const { BuyerPushError } = require('../lib/marketplace-buyer-push');
const { BuyerIdentityError, createBuyerAccountResolver } = require('../lib/marketplace-buyer-identity');
const { defaultMarketplaceV1Services } = require('../lib/marketplace-v1-prisma');

// Suscribe este navegador a los avisos de los pedidos de la cuenta del comprador.
// Solo con el Bearer de la cuenta: el /api/notifications/subscribe de la tienda no
// pide sesión y no sirve para avisos de una cuenta.
function createMarketplacePushV1Router({ Router, service, resolveAccount, buyerOptions } = {}) {
  const router = (Router || require('express').Router)();
  const accountFor = resolveAccount || createBuyerAccountResolver({ ...buyerOptions, allowGuest: false });
  const handle = action => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const accountId = req.headers?.authorization !== undefined ? await accountFor(req) : null;
      if (typeof accountId !== 'string' || accountId.startsWith('guest:')) {
        throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Inicia sesion para activar los avisos');
      }
      // Sin MARKETPLACE_V1_ORDERS_ENABLED no hay servicios v1: 503.
      const push = service || defaultMarketplaceV1Services()?.buyerPush;
      if (!push) return res.status(503).json({ error: 'Avisos no disponibles', errorCode: 'PUSH_UNAVAILABLE' });
      return await action(push, accountId, req, res);
    } catch (error) {
      if (error instanceof BuyerIdentityError || error instanceof BuyerPushError) {
        return res.status(error.statusCode).json({ error: error.message, errorCode: error.code });
      }
      return res.status(503).json({ error: 'Avisos temporalmente no disponibles', errorCode: 'PUSH_UNAVAILABLE' });
    }
  };
  // Mounted at /api/marketplace/v1/push.
  router.put('/', handle(async (push, accountId, req, res) => {
    await push.subscribe(accountId, req.body?.subscription, req.headers?.['user-agent']);
    return res.json({ subscribed: true });
  }));
  router.delete('/', handle(async (push, accountId, req, res) => {
    await push.unsubscribe(accountId, req.body?.endpoint);
    return res.status(204).end();
  }));
  return router;
}

module.exports = createMarketplacePushV1Router;
